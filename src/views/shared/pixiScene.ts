import 'pixi.js/unsafe-eval'; // eval-free shader/uniform code paths, required by our CSP (no 'unsafe-eval')
import {
  Application,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  RendererType,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import { captureScreen } from './screenshot';
import { yieldToBrowser } from './yield';
import type { NoteId } from '../../core/model';
import type { ThemePalette } from '../../core/color/palettes';
import { hexToNumber } from '../../core/color/tagColor';
import { neighbourhood } from '../../core/lens/applyLenses';
import type { ViewContext, ViewInstance } from '../types';
import { fitBounds, toWorld, zoomAt, type Camera } from './camera';
import { noteColor, recencyGlow } from './encodings';
import { radialTexture, shade, tailTexture } from './textures';
import { AnimClock, labelBudget } from './prefs';
import { Fader, snapshotNodes } from './fade';

export const TEX_R = 32;
const LABEL_ZOOM = 0.9;
const CLICK_SLOP = 4;
export const DIM = 0.15;
const EASE_MS = 450;

/** A category of line edges drawn over the shared vertex buffer (node positions + extra anchor vertices). */
export interface EdgeSet {
  name: string;
  /** vertex index pairs */
  pairs: number[];
  style(theme: ThemePalette): { color: string; alpha: number };
  /** Pairs inside the focused neighbourhood move to the highlight mesh. */
  highlightable?: boolean;
  /** Hidden unless both ends are in the focused neighbourhood (e.g. galaxy links inside a system). */
  focusOnly?: boolean;
}

export interface SceneLayout {
  /** Node ids drawn as sprites (notes and ghosts); index i ↔ vertices i. */
  ids: NoteId[];
  /** x,y per node followed by x,y per extra anchor vertex. */
  positions: Float32Array;
  radius: Float32Array;
  edges: EdgeSet[];
}

export interface SceneTextures {
  disc: Texture;
  ring: Texture;
  soft: Texture;
  glow: Texture;
  tail: Texture;
}

interface TestHook {
  screenPosition(id: string): { x: number; y: number } | null;
}

/**
 * Shared base for the Pixi views: app setup, camera (pan / zoom / ease), hover tooltip, click and keyboard
 * focus, focus dimming, lens visibility, labels, edges, test hook and export. Subclasses provide `layout()`,
 * optional decorations and ambient animation.
 */
export abstract class PixiScene implements ViewInstance {
  protected app = new Application();
  /** Screen-space layer behind the world (parallax backgrounds). */
  protected screenBack = new Container();
  protected world = new Container();
  /** World-space layers, back to front. */
  protected under = new Container();
  protected edgeLayer = new Container();
  protected glowLayer = new Container();
  protected nodeLayer = new Container();
  protected over = new Container();
  protected labelLayer = new Container();
  protected focusRing = new Sprite();
  protected tex!: SceneTextures;
  protected ready: Promise<void>;
  protected destroyed = false;
  protected gpu = true;

  protected ctx: ViewContext;
  protected ids: NoteId[] = [];
  protected index = new Map<NoteId, number>();
  protected radius: Float32Array<ArrayBufferLike> = new Float32Array(0);
  /** Current vertex positions (nodes, then anchors). Subclasses mutate this in animate(). */
  protected pos: Float32Array<ArrayBufferLike> = new Float32Array(0);
  protected colors: string[] = [];
  protected sprites: Sprite[] = [];
  /** Created only for nodes that glow in the current theme. */
  protected glows: (Sprite | undefined)[] = [];
  protected glowLevel: Float32Array<ArrayBufferLike> = new Float32Array(0);
  protected recency: Float32Array<ArrayBufferLike> = new Float32Array(0);
  protected visibleMask = new Uint8Array(0);
  protected hoodMask = new Uint8Array(0);
  protected hood: Set<NoteId> | null = null;
  protected camera: Camera = { x: 0, y: 0, scale: 1 };
  protected positionsDirty = true;
  protected labelsDirty = true;
  /** Labels appear above this zoom (and for the focused neighbourhood); small vaults may label everything. */
  protected labelZoom = LABEL_ZOOM;
  protected labelSmallVaults = true;

  private edges: EdgeSet[] = [];
  private meshes: { set: EdgeSet | 'highlight'; mesh: Mesh<MeshGeometry> }[] = [];
  private edgeIdx = new Map<EdgeSet | 'highlight', number[]>();
  private edgeGraphics: Graphics | null = null;
  private labels: Text[] = [];
  private cameraAnim: { from: Camera; to: Camera; start: number } | null = null;
  private userMovedCamera = false;
  private hovered = -1;
  private press: { x: number; y: number; node: number; cam: Camera; moved: boolean; shift: boolean } | null =
    null;
  private pulse: number[] = [];

  constructor(
    protected el: HTMLElement,
    ctx: ViewContext,
    protected viewId: string,
  ) {
    this.ctx = ctx;
    this.ready = this.init();
  }

  // ---- hooks -------------------------------------------------------------------------------------------

  protected abstract layout(): SceneLayout;
  /** Build or restyle decorations (suns, rings, plants, axes). Called after layout and on theme change. */
  protected decorate(): void {}
  /** Ambient animation: update `this.pos` (and decorations). Return true if positions changed. */
  protected animate(_now: number): boolean {
    return false;
  }
  /** Extra per-node visibility on top of lenses (e.g. timeline playhead). */
  protected extraVisible(_i: number): boolean {
    return true;
  }
  /** Called whenever the camera moves (parallax). */
  protected onCamera(): void {}
  /** Node body texture and alpha; override for view-specific looks. */
  protected bodyTexture(i: number): Texture {
    const note = this.ctx.graph.notes.has(this.ids[i] as string);
    return !note ? this.tex.ring : this.ctx.theme.id === 'watercolor' ? this.tex.soft : this.tex.disc;
  }
  protected nodeColor(i: number): string {
    return noteColor(this.ctx.graph.notes.get(this.ids[i] as string), this.ctx.theme);
  }
  protected labelFor(i: number): string {
    const id = this.ids[i] as string;
    return this.ctx.graph.notes.get(id)?.title ?? id;
  }

  // ---- setup -------------------------------------------------------------------------------------------

  private async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.el,
      backgroundAlpha: 0,
      antialias: false, // see docs/DECISIONS.md (MSAA on many lines is too slow on integrated GPUs)
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    const canvas = this.app.canvas;
    canvas.dataset.testid = 'graph-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-roledescription', this.viewId);
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    this.el.appendChild(canvas);
    this.gpu = this.app.renderer.type !== RendererType.CANVAS;

    await yieldToBrowser();
    if (this.destroyed) return;
    this.tex = {
      disc: this.app.renderer.generateTexture({
        target: new Graphics().circle(0, 0, TEX_R).fill(0xffffff),
        resolution: 2,
        antialias: true,
      }),
      ring: this.app.renderer.generateTexture({
        target: new Graphics().circle(0, 0, TEX_R - 3).stroke({ color: 0xffffff, width: 6 }),
        resolution: 2,
        antialias: true,
      }),
      soft: radialTexture(128, [
        [0, 'rgba(255,255,255,0.95)'],
        [0.55, 'rgba(255,255,255,0.8)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
      glow: radialTexture(128, [
        [0, 'rgba(255,255,255,0.9)'],
        [0.25, 'rgba(255,255,255,0.45)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
      tail: tailTexture(),
    };
    this.focusRing.texture = this.tex.ring;
    this.focusRing.anchor.set(0.5);
    this.focusRing.visible = false;

    this.world.addChild(
      this.under,
      this.edgeLayer,
      this.glowLayer,
      this.nodeLayer,
      this.fadeLayer,
      this.over,
      this.focusRing,
      this.labelLayer,
    );
    this.app.stage.addChild(this.screenBack, this.world);
    this.app.ticker.add(() => this.frame());
    this.bindInput(canvas);
    (window as unknown as { __vaultLensView?: TestHook }).__vaultLensView = {
      screenPosition: (id) => {
        const i = this.index.get(id);
        if (i === undefined) return null;
        const r = canvas.getBoundingClientRect();
        return {
          x: r.left + (this.pos[i * 2] as number) * this.camera.scale + this.camera.x,
          y: r.top + (this.pos[i * 2 + 1] as number) * this.camera.scale + this.camera.y,
        };
      },
    };
    await yieldToBrowser();
    if (this.destroyed) return;
    this.build();
  }

  protected build(): void {
    const l = this.layout();
    this.built = true;
    this.ids = l.ids;
    this.index = new Map(this.ids.map((id, i) => [id, i]));
    this.radius = l.radius;
    this.pos = l.positions;
    this.edges = l.edges;
    this.recency = recencyGlow(this.ctx.graph, this.ids);

    for (const layer of [this.nodeLayer, this.glowLayer]) layer.removeChildren().forEach((c) => c.destroy());
    const make = (layer: Container) => {
      const s = new Sprite();
      s.anchor.set(0.5);
      layer.addChild(s);
      return s;
    };
    this.sprites = this.ids.map(() => make(this.nodeLayer));
    this.glows = new Array(this.ids.length);

    this.edgeLayer.removeChildren().forEach((c) => c.destroy());
    this.meshes = [];
    this.edgeGraphics = null;
    if (this.gpu) {
      const vertexCount = this.pos.length / 2;
      const uvs = new Float32Array(vertexCount * 2);
      for (const set of [...this.edges, 'highlight' as const]) {
        const geometry = new MeshGeometry({
          positions: new Float32Array(vertexCount * 2),
          uvs,
          indices: new Uint32Array(0),
          topology: 'line-list',
        });
        geometry.batchMode = 'no-batch';
        const mesh = new Mesh({ geometry, texture: Texture.WHITE });
        this.edgeLayer.addChild(mesh);
        this.meshes.push({ set, mesh });
      }
    } else {
      this.edgeGraphics = new Graphics();
      this.edgeLayer.addChild(this.edgeGraphics);
    }

    this.el.dataset.nodes = String(this.ids.length);
    this.baseAlpha = new Float32Array(this.ids.length);
    this.decorate();
    this.themeStyle();
    this.visibilityStyle();
    this.animate(this.ctx.reducedMotion ? 0 : performance.now());
    this.positionsDirty = true;
    if (!this.keepCameraOnBuild) {
      this.userMovedCamera = false;
      this.fit();
      this.focusOnMount();
    }
    this.keepCameraOnBuild = false;
    this.el.dataset.layout = 'settled'; // layouts here are computed synchronously
    this.ctx.onLayoutStatus?.({ settled: true, cached: 0 });
  }

  // ---- styling -----------------------------------------------------------------------------------------

  protected themeStyle(): void {
    const { theme } = this.ctx;
    const watercolor = theme.id === 'watercolor';
    this.colors = this.ids.map((_, i) => this.nodeColor(i));
    this.glowLevel = new Float32Array(this.ids.length);
    this.pulse = [];
    this.ids.forEach((_, i) => {
      const color = hexToNumber(this.colors[i] as string);
      const r = this.radius[i] as number;
      const body = this.sprites[i] as Sprite;
      body.texture = this.bodyTexture(i);
      body.scale.set((watercolor ? r * 1.25 : r) / TEX_R);
      body.tint = color;
      const glow = (this.recency[i] as number) * theme.glowStrength;
      this.glowLevel[i] = glow > 0.02 ? glow : 0;
      if (glow > 0.02) {
        let g = this.glows[i];
        if (!g) {
          g = new Sprite();
          g.anchor.set(0.5);
          this.glowLayer.addChild(g);
          this.glows[i] = g;
        }
        g.texture = this.tex.glow;
        g.scale.set((r * (2.4 + glow * 1.6)) / 64);
        g.tint = color;
        g.blendMode = 'add';
        if ((this.recency[i] as number) >= 1) this.pulse.push(i);
      }
    });
    for (const { mesh } of this.meshes) mesh.blendMode = theme.id === 'neon' ? 'add' : 'normal';
    this.focusRing.tint = hexToNumber(theme.edgeHighlight);
    for (const l of this.labels) l.style.fill = theme.text;
    this.positionsDirty = true;
  }

  /** Lens + focus + extra visibility. Cheap enough to run on every lens or focus change. */
  protected visibilityStyle(): void {
    const { graph, theme, visible, focus, focusDepth } = this.ctx;
    const n = this.ids.length;
    const hood =
      focus && visible.notes.has(focus) && this.index.has(focus)
        ? neighbourhood(graph, focus, focusDepth, visible.notes)
        : null;
    this.hood = hood;
    this.el.dataset.focusSize = String(hood ? [...hood].filter((id) => this.index.has(id)).length : 0);
    const mask = new Uint8Array(this.pos.length / 2).fill(1); // anchors are always visible
    const inHood = new Uint8Array(n);
    for (let i = 0; i < n; i++)
      mask[i] = visible.notes.has(this.ids[i] as string) && this.extraVisible(i) ? 1 : 0;
    if (hood) {
      for (const id of hood) {
        const i = this.index.get(id);
        if (i !== undefined) inHood[i] = 1;
      }
    }
    this.visibleMask = mask;
    this.hoodMask = inHood;
    const watercolor = theme.id === 'watercolor';
    let shown = 0;
    for (let i = 0; i < n; i++) {
      const vis = mask[i] === 1;
      if (vis) shown++;
      const dim = hood && !inHood[i] ? DIM : 1;
      const isNote = graph.notes.has(this.ids[i] as string);
      const body = this.sprites[i] as Sprite;
      body.visible = vis;
      body.alpha = (isNote ? (watercolor ? 0.78 : 0.95) : 0.75) * dim;
      this.baseAlpha[i] = body.alpha;
      const g = this.glows[i];
      if (g) {
        g.visible = vis && (this.glowLevel[i] as number) > 0;
        if (g.visible) g.alpha = (this.glowLevel[i] as number) * 0.7 * dim;
      }
    }
    this.el.dataset.visibleNodes = String(shown);

    const highlight: number[] = [];
    this.edgeIdx = new Map();
    for (const set of this.edges) {
      const idx: number[] = [];
      for (let k = 0; k < set.pairs.length; k += 2) {
        const a = set.pairs[k] as number;
        const b = set.pairs[k + 1] as number;
        if (!mask[a] || !mask[b]) continue;
        const both = hood && a < n && b < n && inHood[a] && inHood[b];
        if (set.focusOnly && !both) continue;
        if (both && (set.highlightable || set.focusOnly)) highlight.push(a, b);
        else idx.push(a, b);
      }
      this.edgeIdx.set(set, idx);
    }
    this.edgeIdx.set('highlight', highlight);
    for (const { set, mesh } of this.meshes) {
      const st = this.edgeStyle(set);
      mesh.geometry.indices = Uint32Array.from(this.edgeIdx.get(set) ?? []);
      mesh.tint = hexToNumber(st.color);
      mesh.alpha = st.alpha;
      mesh.visible = (this.edgeIdx.get(set)?.length ?? 0) > 0;
    }
    this.positionsDirty = true;
    this.labelsDirty = true;
  }

  private edgeStyle(set: EdgeSet | 'highlight'): { color: string; alpha: number } {
    const { theme } = this.ctx;
    if (set === 'highlight') return { color: theme.edgeHighlight, alpha: 0.9 };
    const st = set.style(theme);
    return this.hood ? { color: st.color, alpha: st.alpha * 0.35 } : st;
  }

  /** Re-applies visibility (e.g. after the timeline playhead moved). */
  protected refreshVisibility(): void {
    this.visibilityStyle();
  }

  // ---- frame -------------------------------------------------------------------------------------------

  private clock = new AnimClock();
  private fadeLayer = new Container();
  private fader = new Fader(this.fadeLayer);
  private baseAlpha = new Float32Array(0);
  private keepCameraOnBuild = false;

  private built = false;

  private frame(): void {
    if (!this.built) return; // the ticker starts before the (yielded) first build
    const real = performance.now();
    const now = this.clock.tick(this.ctx.prefs.animationSpeed); // ambient time, scaled by Settings
    if (!this.ctx.reducedMotion && this.animate(now)) {
      this.positionsDirty = true;
      if (now - this.lastLabelTick > 66) {
        this.labelsDirty = true;
        this.lastLabelTick = now;
      }
    }
    if (this.cameraAnim) this.stepCamera(real);
    if (this.positionsDirty) {
      const n = this.ids.length;
      for (let i = 0; i < n; i++) {
        const x = this.pos[i * 2] as number;
        const y = this.pos[i * 2 + 1] as number;
        (this.sprites[i] as Sprite).position.set(x, y);
        if (this.visibleMask[i] && (this.glowLevel[i] as number) > 0) this.glows[i]?.position.set(x, y);
      }
      for (const { mesh } of this.meshes) mesh.geometry.positions = this.pos as Float32Array<ArrayBuffer>;
      if (this.edgeGraphics) this.drawEdgesCanvas(this.edgeGraphics);
      this.positionsDirty = false;
    }
    if (!this.ctx.reducedMotion && this.pulse.length) {
      const k = 0.85 + 0.15 * Math.sin(now / 600);
      for (const i of this.pulse) {
        const dim = this.hood && !this.hoodMask[i] ? DIM : 1;
        const g = this.glows[i];
        if (g) g.alpha = (this.glowLevel[i] as number) * 0.7 * k * dim;
      }
    }
    if (this.fader.active) this.fader.step(this.sprites, (i) => this.baseAlpha[i] as number);
    const f = this.ctx.focus ? this.index.get(this.ctx.focus) : undefined;
    this.focusRing.visible = f !== undefined && this.visibleMask[f] === 1;
    if (f !== undefined && this.focusRing.visible) {
      const r = (this.radius[f] as number) + 5 / this.camera.scale;
      this.focusRing.position.set(this.pos[f * 2] as number, this.pos[f * 2 + 1] as number);
      this.focusRing.scale.set(r / (TEX_R - 3));
    }
    if (this.labelsDirty) {
      this.drawLabels();
      this.labelsDirty = false;
    }
  }

  private lastLabelTick = 0;

  private drawEdgesCanvas(g: Graphics): void {
    const p = this.pos;
    g.clear();
    for (const [set, idx] of this.edgeIdx) {
      if (!idx.length) continue;
      for (let k = 0; k < idx.length; k += 2) {
        const s = idx[k] as number;
        const t = idx[k + 1] as number;
        g.moveTo(p[s * 2] as number, p[s * 2 + 1] as number).lineTo(
          p[t * 2] as number,
          p[t * 2 + 1] as number,
        );
      }
      const st = this.edgeStyle(set);
      g.stroke({ color: hexToNumber(st.color), alpha: st.alpha, width: 1, pixelLine: true });
    }
  }

  private drawLabels(): void {
    const { scale } = this.camera;
    const budget = labelBudget(this.ctx.prefs.labelDensity, this.labelZoom);
    const zoomedIn = scale >= budget.zoom || (this.labelSmallVaults && this.ids.length <= 60);
    const { width: w, height: h } = this.app.screen;
    const tl = toWorld(this.camera, 0, 0);
    const br = toWorld(this.camera, w, h);
    const inView = (i: number) => {
      const x = this.pos[i * 2] as number;
      const y = this.pos[i * 2 + 1] as number;
      return x >= tl.x && x <= br.x && y >= tl.y && y <= br.y;
    };
    let picked: number[] = [];
    if (this.hood) {
      for (const id of this.hood) {
        const i = this.index.get(id);
        if (i !== undefined && this.visibleMask[i] && inView(i)) picked.push(i);
      }
    }
    if (zoomedIn) {
      const more: number[] = [];
      for (let i = 0; i < this.ids.length; i++) {
        if (this.visibleMask[i] && inView(i) && !this.hoodMask[i]) more.push(i);
      }
      more.sort((a, b) => (this.radius[b] as number) - (this.radius[a] as number));
      picked = picked.concat(more);
    }
    picked.length = Math.min(picked.length, budget.max);
    while (this.labels.length < picked.length) {
      const t = new Text({
        text: '',
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fill: this.ctx.theme.text },
      });
      t.anchor.set(0.5, 0);
      t.resolution = 2;
      this.labelLayer.addChild(t);
      this.labels.push(t);
    }
    this.labels.forEach((label, k) => {
      const i = picked[k];
      if (i === undefined) {
        label.visible = false;
        return;
      }
      const title = this.labelFor(i);
      const text = title.length > 32 ? `${title.slice(0, 31)}…` : title;
      if (label.text !== text) label.text = text;
      label.visible = true;
      label.alpha = this.hood && !this.hoodMask[i] ? 0.35 : 1;
      label.scale.set(1 / scale);
      label.x = this.pos[i * 2] as number;
      label.y = (this.pos[i * 2 + 1] as number) + (this.radius[i] as number) + 3 / scale;
    });
  }

  // ---- camera ------------------------------------------------------------------------------------------

  protected applyCamera(): void {
    this.world.position.set(this.camera.x, this.camera.y);
    this.world.scale.set(this.camera.scale);
    this.labelsDirty = true;
    this.onCamera();
  }

  /** Bounds used to fit the camera; subclasses may widen them (plants, axes). */
  protected contentBounds(): Float32Array {
    return this.pos;
  }

  protected fit(): void {
    const { width, height } = this.app.screen;
    const pts = this.contentBounds();
    this.camera = fitBounds(
      pts,
      (i) => (i < this.ids.length ? (this.radius[i] as number) : 0),
      width,
      height,
    );
    this.applyCamera();
  }

  protected flyTo(id: NoteId): void {
    const i = this.index.get(id);
    if (i === undefined) return;
    const { width, height } = this.app.screen;
    const scale = Math.min(Math.max(this.camera.scale, 1), 3);
    const to = {
      scale,
      x: width / 2 - (this.pos[i * 2] as number) * scale,
      y: height / 2 - (this.pos[i * 2 + 1] as number) * scale,
    };
    if (this.ctx.reducedMotion) {
      this.camera = to;
      this.applyCamera();
    } else {
      this.cameraAnim = { from: { ...this.camera }, to, start: performance.now() };
    }
  }

  private stepCamera(now: number): void {
    const a = this.cameraAnim;
    if (!a) return;
    const t = Math.min(1, (now - a.start) / EASE_MS);
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    const scale = Math.exp(Math.log(a.from.scale) + (Math.log(a.to.scale) - Math.log(a.from.scale)) * e);
    this.camera = { scale, x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e };
    this.applyCamera();
    if (t >= 1) this.cameraAnim = null;
  }

  // ---- input -------------------------------------------------------------------------------------------

  protected local(e: { clientX: number; clientY: number }) {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  protected hit(sx: number, sy: number): number {
    const w = toWorld(this.camera, sx, sy);
    const slop = 4 / this.camera.scale;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.ids.length; i++) {
      if (!this.visibleMask[i]) continue;
      const dx = (this.pos[i * 2] as number) - w.x;
      const dy = (this.pos[i * 2 + 1] as number) - w.y;
      const d = dx * dx + dy * dy;
      const r = (this.radius[i] as number) + slop;
      if (d < r * r && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  private setHover(i: number, e?: { clientX: number; clientY: number }): void {
    if (i === this.hovered && i < 0) return;
    this.hovered = i;
    this.app.canvas.style.cursor = i >= 0 ? 'pointer' : this.press ? 'grabbing' : 'grab';
    this.ctx.onHover(i >= 0 ? (this.ids[i] as string) : null, e ? { x: e.clientX, y: e.clientY } : undefined);
  }

  private keyNavigate(dx: number, dy: number): void {
    const { graph, focus, visible } = this.ctx;
    const fi = focus ? this.index.get(focus) : undefined;
    if (!focus || fi === undefined || !this.visibleMask[fi]) {
      const { width, height } = this.app.screen;
      const c = toWorld(this.camera, width / 2, height / 2);
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < this.ids.length; i++) {
        if (!this.visibleMask[i] || !graph.notes.has(this.ids[i] as string)) continue;
        const d = Math.hypot((this.pos[i * 2] as number) - c.x, (this.pos[i * 2 + 1] as number) - c.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) this.ctx.onFocus(this.ids[best] as string);
      return;
    }
    const ox = this.pos[fi * 2] as number;
    const oy = this.pos[fi * 2 + 1] as number;
    const neighbours = new Set<string>();
    for (const l of graph.outLinks.get(focus) ?? [])
      if (visible.notes.has(l.target)) neighbours.add(l.target);
    for (const l of graph.inLinks.get(focus) ?? []) if (visible.notes.has(l.source)) neighbours.add(l.source);
    neighbours.delete(focus);
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of neighbours) {
      const i = this.index.get(id);
      if (i === undefined || !this.visibleMask[i]) continue;
      const vx = (this.pos[i * 2] as number) - ox;
      const vy = (this.pos[i * 2 + 1] as number) - oy;
      const len = Math.hypot(vx, vy) || 1;
      const cos = (vx * dx + vy * dy) / len;
      if (cos <= 0.2) continue;
      const score = cos - len / 5000;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best) this.ctx.onFocus(best, this.ctx.focusDepth);
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      const p = this.local(e);
      canvas.setPointerCapture(e.pointerId);
      this.cameraAnim = null;
      this.press = {
        ...p,
        node: this.hit(p.x, p.y),
        cam: { ...this.camera },
        moved: false,
        shift: e.shiftKey,
      };
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.local(e);
      const press = this.press;
      if (!press) {
        this.setHover(this.hit(p.x, p.y), e);
        return;
      }
      if (!press.moved && Math.hypot(p.x - press.x, p.y - press.y) < CLICK_SLOP) return;
      press.moved = true;
      this.camera = { ...press.cam, x: press.cam.x + p.x - press.x, y: press.cam.y + p.y - press.y };
      this.userMovedCamera = true;
      this.applyCamera();
      this.ctx.onHover(null);
    });
    const end = (e: PointerEvent) => {
      const press = this.press;
      this.press = null;
      if (!press) return;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!press.moved && e.type === 'pointerup') {
        if (press.node >= 0) {
          const id = this.ids[press.node] as string;
          this.ctx.onFocus(id, press.shift ? 2 : 1);
          if (this.ctx.graph.notes.has(id)) this.ctx.onActivate(id);
        } else {
          this.ctx.onFocus(null);
        }
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => {
      if (!this.press) this.setHover(-1);
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.cameraAnim = null;
        const p = this.local(e);
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.camera = zoomAt(this.camera, p.x, p.y, Math.exp(-delta * 0.0015));
        this.userMovedCamera = true;
        this.applyCamera();
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (e) => {
      const dirs: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = dirs[e.key];
      if (d) {
        e.preventDefault();
        this.keyNavigate(d[0], d[1]);
      } else if ((e.key === 'Enter' || e.key === ' ') && this.ctx.focus) {
        e.preventDefault();
        this.ctx.onActivate(this.ctx.focus);
      } else if (e.key === '+' || e.key === '=' || e.key === '-') {
        e.preventDefault();
        const { width, height } = this.app.screen;
        this.camera = zoomAt(this.camera, width / 2, height / 2, e.key === '-' ? 1 / 1.25 : 1.25);
        this.userMovedCamera = true;
        this.applyCamera();
      }
    });
  }

  // ---- ViewInstance ------------------------------------------------------------------------------------

  update(ctx: ViewContext): void {
    const prev = this.ctx;
    this.ctx = ctx;
    void this.ready.then(() => {
      if (this.destroyed) return;
      if (ctx.graph !== prev.graph) {
        // Same vault refreshed (watch / Refresh): keep the camera and fade changes in and out.
        const sameVault = ctx.graph.vaultName === prev.graph.vaultName && this.ids.length > 0;
        const snap = sameVault ? snapshotNodes(this.ids, this.pos, this.sprites) : null;
        this.keepCameraOnBuild = sameVault;
        this.build();
        this.fader.begin(snap, this.ids);
        this.el.dataset.fadingIn = String(this.fader.incomingCount);
        return;
      }
      if (ctx.theme !== prev.theme) {
        this.decorate();
        this.themeStyle();
      }
      if (
        ctx.visible !== prev.visible ||
        ctx.theme !== prev.theme ||
        ctx.focus !== prev.focus ||
        ctx.focusDepth !== prev.focusDepth
      ) {
        this.visibilityStyle();
      }
      if (ctx.focus && ctx.focus !== prev.focus) this.flyTo(ctx.focus);
      if (ctx.reducedMotion !== prev.reducedMotion) this.positionsDirty = true;
      if (ctx.prefs.labelDensity !== prev.prefs.labelDensity) this.labelsDirty = true;
    });
  }

  focusNode(id: NoteId): void {
    void this.ready.then(() => this.flyTo(id));
  }

  async exportImage(): Promise<Blob> {
    await this.ready;
    return captureScreen(this.app, this.ctx.theme);
  }

  destroy(): void {
    this.destroyed = true;
    delete (window as unknown as { __vaultLensView?: TestHook }).__vaultLensView;
    void this.ready.then(() => {
      this.app.canvas.remove();
      this.app.destroy(true, { children: true, texture: true });
    });
  }

  /** On first mount with an existing focus, glide to it once the scene is ready. */
  protected focusOnMount(): void {
    if (this.ctx.focus && this.index.has(this.ctx.focus) && !this.userMovedCamera) this.flyTo(this.ctx.focus);
  }

  protected shade = shade;
}
