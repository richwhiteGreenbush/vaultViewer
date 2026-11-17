import 'pixi.js/unsafe-eval'; // eval-free shader/uniform code paths, required by our CSP (no 'unsafe-eval')
import { proxy as proxyCallback } from 'comlink';
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
import { captureScreen } from '../shared/screenshot';
import { yieldToBrowser } from '../shared/yield';
import type { NoteId } from '../../core/model';
import { hexToNumber } from '../../core/color/tagColor';
import { neighbourhood } from '../../core/lens/applyLenses';
import { strings } from '../../strings';
import type { ViewContext, ViewInstance, ViewModule } from '../types';
import { fitBounds, toWorld, zoomAt, type Camera } from '../shared/camera';
import { nodeOrder, noteColor, noteRadius, recencyGlow } from '../shared/encodings';
import { radialTexture, shade, tailTexture } from '../shared/textures';
import { AnimClock, labelBudget } from '../shared/prefs';
import { Fader, snapshotNodes } from '../shared/fade';

const TEX_R = 32; // radius of the shared circle textures
const LABEL_ZOOM = 0.9; // labels appear above this zoom level
const CLICK_SLOP = 4; // px of movement before a press becomes a drag
const DIM = 0.15; // opacity of nodes outside the focused neighbourhood
const EASE_MS = 450;

type EdgeKind = 'normal' | 'ghost' | 'highlight';

interface TestHook {
  screenPosition(id: string): { x: number; y: number } | null;
}

class ForceView implements ViewInstance {
  private app = new Application();
  private world = new Container();
  private edges = new Container();
  private glowLayer = new Container();
  private tailLayer = new Container();
  private nodeLayer = new Container();
  private outlineLayer = new Container();
  private labelLayer = new Container();
  private focusRing = new Sprite();
  private tex!: { disc: Texture; ring: Texture; soft: Texture; glow: Texture; tail: Texture };
  private ready: Promise<void>;
  private destroyed = false;
  private gpu = true;

  private ctx: ViewContext;
  private ids: NoteId[] = [];
  private index = new Map<NoteId, number>();
  private radius = new Float32Array(0);
  private glow: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private colors: string[] = [];
  private pos: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private links = new Int32Array(0);
  private linkIds: string[] = [];
  private linkResolved: boolean[] = [];
  private sprites: Sprite[] = [];
  private glows: (Sprite | undefined)[] = [];
  private outlines: (Sprite | undefined)[] = [];
  private makeSprite: (layer: Container) => Sprite = () => new Sprite();
  private labels: Text[] = [];
  private edgeMeshes = new Map<EdgeKind, Mesh<MeshGeometry>>();
  private edgeIdx: Record<EdgeKind, number[]> = { normal: [], ghost: [], highlight: [] };
  private edgeGraphics: Graphics | null = null; // Canvas 2D fallback

  private visibleMask = new Uint8Array(0);
  private hood: Set<NoteId> | null = null; // focused neighbourhood
  private comets: { i: number; phase: number; speed: number; jitter: number; tail: Sprite }[] = [];
  private orbit = { cx: 0, cy: 0, r: 0 };
  private pulse: number[] = []; // node indexes whose glow pulses (top 10% recency)

  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private cameraAnim: { from: Camera; to: Camera; start: number } | null = null;
  private userMovedCamera = false;
  private positionsDirty = true;
  private labelsDirty = true;
  private hovered = -1;
  private press: { x: number; y: number; node: number; cam: Camera; moved: boolean; shift: boolean } | null =
    null;

  constructor(
    private el: HTMLElement,
    ctx: ViewContext,
  ) {
    this.ctx = ctx;
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.el,
      backgroundAlpha: 0, // the themed CSS background shows through
      // No MSAA: 4x MSAA on 20k overlapping lines cost ~150 ms/frame on integrated GPUs. Node discs are
      // pre-rendered antialiased textures, so only the faint 1px edges lose smoothing.
      antialias: false,
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
    canvas.setAttribute('aria-roledescription', 'graph');
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    this.el.appendChild(canvas);

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
      this.edges,
      this.glowLayer,
      this.tailLayer,
      this.nodeLayer,
      this.fadeLayer,
      this.outlineLayer,
    );
    this.world.addChild(this.focusRing, this.labelLayer);
    this.app.stage.addChild(this.world);
    this.app.ticker.add(() => this.frame());
    this.gpu = this.app.renderer.type !== RendererType.CANVAS;
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
    // Yield between the expensive setup steps so no single main-thread task runs long.
    await yieldToBrowser();
    if (this.destroyed) return;
    this.build();
  }

  // ---- data ---------------------------------------------------------------------------------------------

  private build(keepCamera = false): void {
    const { graph } = this.ctx;
    this.ids = nodeOrder(graph);
    this.index = new Map(this.ids.map((id, i) => [id, i]));
    this.radius = Float32Array.from(this.ids, (id) => noteRadius(graph.notes.get(id)));
    this.glow = recencyGlow(graph, this.ids);
    // Start from d3-force's own initial phyllotaxis spiral (not all at 0,0: thousands of overlapping
    // sprites on the first frame are a heavy GPU stall, and this is where the simulation starts anyway).
    this.pos = new Float32Array(this.ids.length * 2);
    for (let i = 0; i < this.ids.length; i++) {
      const r = 10 * Math.sqrt(0.5 + i);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      this.pos[i * 2] = r * Math.cos(a);
      this.pos[i * 2 + 1] = r * Math.sin(a);
    }

    const pairs: number[] = [];
    this.linkResolved = [];
    this.linkIds = [];
    for (const l of graph.links) {
      const s = this.index.get(l.source);
      const t = this.index.get(l.target);
      if (s === undefined || t === undefined || s === t) continue;
      pairs.push(s, t);
      this.linkResolved.push(l.resolved);
      this.linkIds.push(l.id);
    }
    this.links = Int32Array.from(pairs);

    for (const layer of [this.nodeLayer, this.glowLayer, this.outlineLayer, this.tailLayer]) {
      layer.removeChildren().forEach((c) => c.destroy());
    }
    const make = (layer: Container) => {
      const s = new Sprite();
      s.anchor.set(0.5);
      layer.addChild(s);
      return s;
    };
    this.sprites = this.ids.map(() => make(this.nodeLayer));
    // Glow and outline sprites are created only for nodes that need them (most themes need few or none).
    this.glows = new Array(this.ids.length);
    this.outlines = new Array(this.ids.length);
    this.makeSprite = make;

    // Orphans become comets.
    this.comets = [];
    this.ids.forEach((id, i) => {
      if (!graph.notes.has(id)) return;
      if ((graph.outLinks.get(id)?.length ?? 0) + (graph.inLinks.get(id)?.length ?? 0) > 0) return;
      const h = hashUnit(id);
      const tail = new Sprite(this.tex.tail);
      tail.anchor.set(1, 0.5);
      this.tailLayer.addChild(tail);
      this.comets.push({
        i,
        phase: h * Math.PI * 2,
        speed: (h > 0.5 ? 1 : -1) * (0.035 + h * 0.03),
        jitter: h,
        tail,
      });
    });

    this.buildEdgeContainers();
    this.app.canvas.setAttribute(
      'aria-label',
      strings.view.canvasLabel(graph.stats.noteCount, graph.stats.linkCount),
    );
    this.el.dataset.nodes = String(this.ids.length);
    this.userMovedCamera = keepCamera;
    this.baseAlpha = new Float32Array(this.ids.length);
    this.themeStyle();
    this.visibilityStyle();
    this.startLayout();
  }

  private buildEdgeContainers(): void {
    this.edges.removeChildren().forEach((c) => c.destroy());
    this.edgeMeshes.clear();
    this.edgeGraphics = null;
    if (!this.gpu) {
      this.edgeGraphics = new Graphics();
      this.edges.addChild(this.edgeGraphics);
      return;
    }
    const uvs = new Float32Array(this.ids.length * 2);
    for (const kind of ['normal', 'ghost', 'highlight'] as EdgeKind[]) {
      const geometry = new MeshGeometry({
        positions: new Float32Array(this.ids.length * 2),
        uvs,
        indices: new Uint32Array(0),
        topology: 'line-list',
      });
      geometry.batchMode = 'no-batch';
      const mesh = new Mesh({ geometry, texture: Texture.WHITE });
      this.edges.addChild(mesh);
      this.edgeMeshes.set(kind, mesh);
    }
  }

  private startLayout(): void {
    this.el.dataset.layout = 'running';
    this.ctx.onLayoutStatus?.({ settled: false, cached: 0 });
    void this.ctx.layout.start(
      {
        viewId: 'force',
        vaultHash: this.ctx.vaultHash,
        nodes: this.ids.map((id, i) => ({ id, r: this.radius[i] as number })),
        links: this.links,
      },
      // Comlink proxies this callback; positions arrive as a transferred buffer.
      proxyCallback((positions: Float32Array, status: { settled: boolean; cached: number }) => {
        if (this.destroyed || positions.length !== this.ids.length * 2) return;
        this.pos = positions;
        this.updateOrbit();
        this.positionsDirty = true;
        this.labelsDirty = true;
        if (!this.userMovedCamera && !this.ctx.focus) this.fit();
        if (status.settled) {
          this.el.dataset.layout = 'settled';
          if (this.ctx.focus && !this.userMovedCamera) this.flyTo(this.ctx.focus);
        }
        this.ctx.onLayoutStatus?.(status);
      }),
    );
  }

  // ---- styling: theme, lenses, focus ---------------------------------------------------------------------

  /** Theme-dependent appearance: colours, textures, sizes, blend modes. Runs on graph or theme change only. */
  private themeStyle(): void {
    const { graph, theme } = this.ctx;
    const watercolor = theme.id === 'watercolor';
    this.colors = this.ids.map((id) => noteColor(graph.notes.get(id), theme));
    this.glowLevel = new Float32Array(this.ids.length);
    this.pulse = [];
    this.ids.forEach((id, i) => {
      const note = graph.notes.has(id);
      const color = hexToNumber(this.colors[i] as string);
      const r = this.radius[i] as number;
      const body = this.sprites[i] as Sprite;
      body.texture = !note ? this.tex.ring : watercolor ? this.tex.soft : this.tex.disc;
      body.scale.set((watercolor && note ? r * 1.25 : r) / TEX_R);
      body.tint = color;
      const glow = (this.glow[i] as number) * theme.glowStrength;
      this.glowLevel[i] = glow > 0.02 ? glow : 0;
      if (glow > 0.02) {
        const g = (this.glows[i] ??= this.makeSprite(this.glowLayer));
        g.texture = this.tex.glow;
        g.scale.set((r * (2.4 + glow * 1.6)) / 64);
        g.tint = color;
        g.blendMode = 'add';
        if ((this.glow[i] as number) >= 1) this.pulse.push(i);
      }
      if (theme.id === 'pastel' && note) {
        const o = (this.outlines[i] ??= this.makeSprite(this.outlineLayer));
        o.texture = this.tex.ring;
        o.scale.set((r + 0.6) / TEX_R);
        o.tint = shade(this.colors[i] as string, -0.35);
      }
    });
    for (const c of this.comets) {
      c.tail.tint = hexToNumber(this.colors[c.i] ?? theme.accent);
      c.tail.blendMode = theme.dark ? 'add' : 'normal';
    }
    for (const mesh of this.edgeMeshes.values()) mesh.blendMode = theme.id === 'neon' ? 'add' : 'normal';
    this.focusRing.tint = hexToNumber(theme.edgeHighlight);
    for (const l of this.labels) l.style.fill = theme.text;
    this.positionsDirty = true;
  }

  private glowLevel = new Float32Array(0);

  /**
   * Lens visibility and focus dimming. Runs on every lens/focus change, so it only touches visibility and
   * alpha, and classifies edges from a per-node mask (no string lookups): a link is visible exactly when both
   * of its ends are (applyLenses guarantees this).
   */
  private visibilityStyle(): void {
    const { graph, theme, visible, focus, focusDepth } = this.ctx;
    const n = this.ids.length;
    const hood =
      focus && visible.notes.has(focus) ? neighbourhood(graph, focus, focusDepth, visible.notes) : null;
    this.hood = hood;
    this.el.dataset.focusSize = String(hood?.size ?? 0);
    const mask = new Uint8Array(n);
    const inHood = new Uint8Array(n);
    for (const id of visible.notes) {
      const i = this.index.get(id);
      if (i !== undefined) mask[i] = 1;
    }
    if (hood) {
      for (const id of hood) {
        const i = this.index.get(id);
        if (i !== undefined) inHood[i] = 1;
      }
    }
    this.visibleMask = mask;
    this.hoodMask = inHood;
    const pastel = theme.id === 'pastel';
    const watercolor = theme.id === 'watercolor';

    for (let i = 0; i < n; i++) {
      const vis = mask[i] === 1;
      const dim = hood && !inHood[i] ? DIM : 1;
      const isNote = graph.notes.has(this.ids[i] as string);
      const x = this.pos[i * 2] as number;
      const y = this.pos[i * 2 + 1] as number;
      const body = this.sprites[i] as Sprite;
      body.visible = vis;
      // Watercolor uses soft-edged, slightly translucent discs. (True multiply blending would multiply against
      // the transparent canvas, not the CSS paper behind it, and turn nodes black.)
      body.alpha = (isNote ? (watercolor ? 0.78 : 0.95) : 0.75) * dim;
      this.baseAlpha[i] = body.alpha;
      const glow = this.glowLevel[i] as number;
      const g = this.glows[i];
      if (g) {
        g.visible = vis && glow > 0;
        if (g.visible) {
          g.alpha = glow * 0.7 * dim;
          g.position.set(x, y);
        }
      }
      const o = this.outlines[i];
      if (o) {
        o.visible = vis && pastel && isNote;
        if (o.visible) {
          o.alpha = 0.8 * dim;
          o.position.set(x, y);
        }
      }
    }
    for (const c of this.comets) {
      c.tail.visible = mask[c.i] === 1;
      c.tail.alpha = (hood && !inHood[c.i] ? DIM : 1) * (theme.dark ? 0.7 : 0.5);
    }

    const idx: Record<EdgeKind, number[]> = { normal: [], ghost: [], highlight: [] };
    const L = this.linkResolved.length;
    for (let k = 0; k < L; k++) {
      const s = this.links[k * 2] as number;
      const t = this.links[k * 2 + 1] as number;
      if (!mask[s] || !mask[t]) continue;
      const kind: EdgeKind =
        hood && inHood[s] && inHood[t] ? 'highlight' : this.linkResolved[k] ? 'normal' : 'ghost';
      idx[kind].push(s, t);
    }
    this.edgeIdx = idx;
    const edgeStyle: Record<EdgeKind, { color: string; alpha: number }> = {
      normal: { color: theme.edge, alpha: hood ? theme.edgeAlpha * 0.35 : theme.edgeAlpha },
      ghost: { color: theme.ghost, alpha: (hood ? 0.35 : 1) * theme.edgeAlpha * 0.8 },
      highlight: { color: theme.edgeHighlight, alpha: 0.9 },
    };
    for (const [kind, mesh] of this.edgeMeshes) {
      mesh.geometry.indices = Uint32Array.from(idx[kind]);
      mesh.tint = hexToNumber(edgeStyle[kind].color);
      mesh.alpha = edgeStyle[kind].alpha;
      mesh.visible = idx[kind].length > 0;
    }
    this.edgeStyle = edgeStyle;
    if (this.edgeGraphics) this.drawEdgesCanvas(this.edgeGraphics);
    this.labelsDirty = true;
  }

  private hoodMask = new Uint8Array(0);

  private edgeStyle: Record<EdgeKind, { color: string; alpha: number }> | null = null;

  // ---- rendering ----------------------------------------------------------------------------------------

  private updateOrbit(): void {
    // Comets orbit just outside the bounding circle of the linked (non-orphan) notes.
    const orphan = new Set(this.comets.map((c) => c.i));
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < this.ids.length; i++) {
      if (orphan.has(i)) continue;
      sx += this.pos[i * 2] as number;
      sy += this.pos[i * 2 + 1] as number;
      n++;
    }
    if (!n) {
      this.orbit = { cx: 0, cy: 0, r: 0 };
      return;
    }
    const cx = sx / n;
    const cy = sy / n;
    let r = 0;
    for (let i = 0; i < this.ids.length; i++) {
      if (!orphan.has(i))
        r = Math.max(r, Math.hypot((this.pos[i * 2] as number) - cx, (this.pos[i * 2 + 1] as number) - cy));
    }
    this.orbit = { cx, cy, r };
  }

  private moveComets(now: number): void {
    const { cx, cy, r } = this.orbit;
    if (!r || !this.comets.length) return;
    const t = this.ctx.reducedMotion ? 0 : now / 1000;
    for (const c of this.comets) {
      const radius = r * (1.12 + c.jitter * 0.12) + 20;
      const a = c.phase + c.speed * t;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      this.pos[c.i * 2] = x;
      this.pos[c.i * 2 + 1] = y;
      const nr = this.radius[c.i] as number;
      c.tail.position.set(x, y);
      // Tangent of travel; the tail extends behind it.
      c.tail.rotation = a + (c.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      c.tail.width = nr * 7;
      c.tail.height = nr * 1.6;
    }
    this.positionsDirty = true;
  }

  private clock = new AnimClock();
  private fadeLayer = new Container();
  private fader = new Fader(this.fadeLayer);
  private baseAlpha = new Float32Array(0);

  private frame(): void {
    const real = performance.now();
    const now = this.clock.tick(this.ctx.prefs.animationSpeed); // ambient time, scaled by Settings
    if (this.comets.length && (!this.ctx.reducedMotion || this.positionsDirty)) {
      this.moveComets(now);
      if (!this.ctx.reducedMotion && real - this.lastCometLabels > 66) {
        this.labelsDirty = true;
        this.lastCometLabels = real;
      }
    }
    if (this.cameraAnim) this.stepCamera(real);
    if (this.positionsDirty) {
      const n = this.ids.length;
      for (let i = 0; i < n; i++) {
        const x = this.pos[i * 2] as number;
        const y = this.pos[i * 2 + 1] as number;
        (this.sprites[i] as Sprite).position.set(x, y);
        if (this.visibleMask[i]) {
          this.glows[i]?.position.set(x, y);
          this.outlines[i]?.position.set(x, y);
        }
      }
      for (const mesh of this.edgeMeshes.values())
        mesh.geometry.positions = this.pos as Float32Array<ArrayBuffer>;
      if (this.edgeGraphics) this.drawEdgesCanvas(this.edgeGraphics);
      this.positionsDirty = false;
    }
    if (!this.ctx.reducedMotion && this.pulse.length) {
      const k = 0.85 + 0.15 * Math.sin(now / 600);
      for (const i of this.pulse) {
        const g = this.glows[i];
        if (!g) continue;
        const dim = this.hood && !this.hoodMask[i] ? DIM : 1;
        g.alpha = (this.glowLevel[i] as number) * 0.7 * k * dim;
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

  private lastCometLabels = 0;

  private drawEdgesCanvas(g: Graphics): void {
    const p = this.pos;
    g.clear();
    if (!this.edgeStyle) return;
    for (const kind of ['normal', 'ghost', 'highlight'] as EdgeKind[]) {
      const idx = this.edgeIdx[kind];
      if (!idx.length) continue;
      for (let k = 0; k < idx.length; k += 2) {
        const s = idx[k] as number;
        const t = idx[k + 1] as number;
        g.moveTo(p[s * 2] as number, p[s * 2 + 1] as number).lineTo(
          p[t * 2] as number,
          p[t * 2 + 1] as number,
        );
      }
      const st = this.edgeStyle[kind];
      g.stroke({
        color: hexToNumber(st.color),
        alpha: st.alpha,
        width: kind === 'highlight' ? 1.5 : 1,
        pixelLine: kind !== 'highlight',
      });
    }
  }

  private drawLabels(): void {
    const { scale } = this.camera;
    const budget = labelBudget(this.ctx.prefs.labelDensity, LABEL_ZOOM);
    const zoomedIn = scale >= budget.zoom || this.ids.length <= 60;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const tl = toWorld(this.camera, 0, 0);
    const br = toWorld(this.camera, w, h);
    const inView = (i: number) => {
      const x = this.pos[i * 2] as number;
      const y = this.pos[i * 2 + 1] as number;
      return x >= tl.x && x <= br.x && y >= tl.y && y <= br.y;
    };
    let picked: number[] = [];
    if (this.hood) {
      // Focus: label the neighbourhood regardless of zoom.
      for (const id of this.hood) {
        const i = this.index.get(id);
        if (i !== undefined && this.visibleMask[i] && inView(i)) picked.push(i);
      }
    }
    if (zoomedIn) {
      const more: number[] = [];
      for (let i = 0; i < this.ids.length; i++) {
        if (this.visibleMask[i] && inView(i) && !(this.hood && this.hood.has(this.ids[i] as string)))
          more.push(i);
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
      const id = this.ids[i] as string;
      const title = this.ctx.graph.notes.get(id)?.title ?? id;
      const text = title.length > 32 ? `${title.slice(0, 31)}…` : title;
      if (label.text !== text) label.text = text;
      label.visible = true;
      label.alpha = this.hood && !this.hood.has(id) ? 0.35 : 1;
      label.scale.set(1 / scale);
      label.x = this.pos[i * 2] as number;
      label.y = (this.pos[i * 2 + 1] as number) + (this.radius[i] as number) + 3 / scale;
    });
  }

  private applyCamera(): void {
    this.world.position.set(this.camera.x, this.camera.y);
    this.world.scale.set(this.camera.scale);
    this.labelsDirty = true;
  }

  private fit(): void {
    const { width, height } = this.app.screen;
    this.camera = fitBounds(this.pos, (i) => this.radius[i] as number, width, height);
    this.applyCamera();
  }

  private flyTo(id: NoteId): void {
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
    // Interpolate in log-scale so zooming feels even.
    const scale = Math.exp(Math.log(a.from.scale) + (Math.log(a.to.scale) - Math.log(a.from.scale)) * e);
    this.camera = { scale, x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e };
    this.applyCamera();
    if (t >= 1) this.cameraAnim = null;
  }

  // ---- input ----------------------------------------------------------------------------------------------

  private local(e: { clientX: number; clientY: number }) {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Nearest visible node under a screen point (linear scan is ~0.1 ms for 5k nodes). */
  private hit(sx: number, sy: number): number {
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

  /** Arrow keys: move focus to the neighbour that lies most in the arrow's direction. */
  private keyNavigate(dx: number, dy: number): void {
    const { graph, focus, visible } = this.ctx;
    const fi = focus ? this.index.get(focus) : undefined;
    if (!focus || fi === undefined || !this.visibleMask[fi]) {
      // Nothing focused: start from the visible note nearest the centre of the screen.
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
      if (i === undefined) continue;
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
      if (press.node >= 0) {
        const w = toWorld(this.camera, p.x, p.y);
        this.pos[press.node * 2] = w.x;
        this.pos[press.node * 2 + 1] = w.y;
        this.positionsDirty = true;
        this.userMovedCamera = true;
        void this.ctx.layout.drag(press.node, w);
        this.setHover(press.node, e);
      } else {
        this.camera = { ...press.cam, x: press.cam.x + p.x - press.x, y: press.cam.y + p.y - press.y };
        this.userMovedCamera = true;
        this.applyCamera();
        this.ctx.onHover(null);
      }
    });
    const end = (e: PointerEvent) => {
      const press = this.press;
      this.press = null;
      if (!press) return;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (press.node >= 0 && press.moved) void this.ctx.layout.drag(press.node, null);
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

  // ---- ViewInstance -------------------------------------------------------------------------------------

  update(ctx: ViewContext): void {
    const prev = this.ctx;
    this.ctx = ctx;
    void this.ready.then(() => {
      if (this.destroyed) return;
      if (ctx.graph !== prev.graph || ctx.vaultHash !== prev.vaultHash) {
        // Same vault refreshed (watch / Refresh): keep the camera and fade changes in and out.
        const sameVault = ctx.graph.vaultName === prev.graph.vaultName && this.ids.length > 0;
        const snap = sameVault ? snapshotNodes(this.ids, this.pos, this.sprites) : null;
        this.build(sameVault);
        this.fader.begin(snap, this.ids);
        this.el.dataset.fadingIn = String(this.fader.incomingCount);
        return;
      }
      if (ctx.theme !== prev.theme) this.themeStyle();
      if (
        ctx.visible !== prev.visible ||
        ctx.theme !== prev.theme ||
        ctx.focus !== prev.focus ||
        ctx.focusDepth !== prev.focusDepth
      ) {
        this.visibilityStyle();
        this.el.dataset.visibleNodes = String(ctx.visible.notes.size);
      }
      if (ctx.focus && ctx.focus !== prev.focus) this.flyTo(ctx.focus);
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
    void this.ctx.layout.stop();
    delete (window as unknown as { __vaultLensView?: TestHook }).__vaultLensView;
    void this.ready.then(() => {
      this.app.canvas.remove();
      this.app.destroy(true, { children: true, texture: true });
    });
  }
}

/** Stable 0..1 value from a string (FNV-1a). */
function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

export const forceView: ViewModule = {
  id: 'force',
  label: 'Force graph',
  icon: 'share-2',
  renderer: 'pixi',
  mount: (el, ctx) => new ForceView(el, ctx),
};
