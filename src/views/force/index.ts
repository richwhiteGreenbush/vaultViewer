import 'pixi.js/unsafe-eval'; // eval-free shader/uniform code paths, required by our CSP (no 'unsafe-eval')
import { proxy as proxyCallback } from 'comlink';
import { Application, Container, Graphics, Mesh, MeshGeometry, Sprite, Text, Texture } from 'pixi.js';
import type { NoteId } from '../../core/model';
import { hexToNumber } from '../../core/color/tagColor';
import { strings } from '../../strings';
import type { ViewContext, ViewInstance, ViewModule } from '../types';
import { fitBounds, toWorld, zoomAt, type Camera } from '../shared/camera';
import { nodeOrder, noteColor, noteRadius } from '../shared/encodings';

const TEX_R = 32; // radius of the shared circle textures
const LABEL_ZOOM = 0.9; // labels appear above this zoom level
const MAX_LABELS = 160;
const CLICK_SLOP = 4; // px of movement before a press becomes a drag

class ForceView implements ViewInstance {
  private app = new Application();
  private world = new Container();
  private edges = new Container();
  private edgeMeshes: Mesh<MeshGeometry>[] = [];
  private nodeLayer = new Container();
  private labelLayer = new Container();
  private disc!: Texture;
  private ring!: Texture;
  private ready: Promise<void>;
  private destroyed = false;

  private ctx: ViewContext;
  private ids: NoteId[] = [];
  private index = new Map<NoteId, number>();
  private radius = new Float32Array(0);
  private pos: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private links = new Int32Array(0);
  private linkResolved: boolean[] = [];
  private sprites: Sprite[] = [];
  private labels: Text[] = [];
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private userMovedCamera = false;
  private edgesDirty = true;
  private labelsDirty = true;
  private hovered = -1;
  private press: { x: number; y: number; node: number; cam: Camera; moved: boolean; id: number } | null =
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
      background: this.ctx.theme.background,
      backgroundAlpha: 0,
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
    canvas.setAttribute('role', 'img');
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    this.el.appendChild(canvas);

    this.disc = this.app.renderer.generateTexture({
      target: new Graphics().circle(0, 0, TEX_R).fill(0xffffff),
      resolution: 2,
      antialias: true,
    });
    this.ring = this.app.renderer.generateTexture({
      target: new Graphics().circle(0, 0, TEX_R - 3).stroke({ color: 0xffffff, width: 6 }),
      resolution: 2,
      antialias: true,
    });

    this.world.addChild(this.edges, this.nodeLayer, this.labelLayer);
    this.app.stage.addChild(this.world);
    this.app.ticker.add(() => this.frame());
    this.bindInput(canvas);
    this.build();
  }

  // ---- data ---------------------------------------------------------------------------------------------

  private build(): void {
    const { graph, theme } = this.ctx;
    this.ids = nodeOrder(graph);
    this.index = new Map(this.ids.map((id, i) => [id, i]));
    this.radius = Float32Array.from(this.ids, (id) => noteRadius(graph.notes.get(id)));
    this.pos = new Float32Array(this.ids.length * 2);

    const pairs: number[] = [];
    this.linkResolved = [];
    for (const l of graph.links) {
      const s = this.index.get(l.source);
      const t = this.index.get(l.target);
      if (s === undefined || t === undefined || s === t) continue;
      pairs.push(s, t);
      this.linkResolved.push(l.resolved);
    }
    this.links = Int32Array.from(pairs);

    this.buildEdges();
    this.nodeLayer.removeChildren().forEach((c) => c.destroy());
    this.sprites = this.ids.map((id, i) => {
      const note = graph.notes.get(id);
      const sprite = new Sprite(note ? this.disc : this.ring);
      sprite.anchor.set(0.5);
      sprite.scale.set((this.radius[i] as number) / TEX_R);
      sprite.tint = hexToNumber(noteColor(note, theme));
      sprite.alpha = note ? 0.95 : 0.7;
      this.nodeLayer.addChild(sprite);
      return sprite;
    });

    this.app.canvas.setAttribute(
      'aria-label',
      strings.view.canvasLabel(graph.stats.noteCount, graph.stats.linkCount),
    );
    this.el.dataset.nodes = String(this.ids.length);
    this.userMovedCamera = false;
    this.startLayout();
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
        this.edgesDirty = true;
        this.labelsDirty = true;
        if (!this.userMovedCamera) this.fit();
        if (status.settled) this.el.dataset.layout = 'settled';
        this.ctx.onLayoutStatus?.(status);
      }),
    );
  }

  // ---- rendering ----------------------------------------------------------------------------------------

  private frame(): void {
    const n = this.ids.length;
    if (this.edgesDirty) {
      for (let i = 0; i < n; i++) {
        const s = this.sprites[i] as Sprite;
        s.x = this.pos[i * 2] as number;
        s.y = this.pos[i * 2 + 1] as number;
      }
      for (const mesh of this.edgeMeshes) mesh.geometry.positions = this.pos as Float32Array<ArrayBuffer>;
      this.edgesDirty = false;
    }
    if (this.labelsDirty) {
      this.drawLabels();
      this.labelsDirty = false;
    }
  }

  /**
   * Edges are two line-list meshes (resolved links, links to ghosts) whose vertex buffer *is* the node position
   * array and whose index buffer is the link pairs. A layout update is one buffer upload; panning costs nothing.
   */
  private buildEdges(): void {
    const { theme } = this.ctx;
    this.edges.removeChildren().forEach((c) => c.destroy());
    const n = this.ids.length;
    const uvs = new Float32Array(n * 2);
    this.edgeMeshes = [true, false].flatMap((resolved) => {
      const idx: number[] = [];
      for (let k = 0; k < this.links.length / 2; k++) {
        if (this.linkResolved[k] === resolved)
          idx.push(this.links[k * 2] as number, this.links[k * 2 + 1] as number);
      }
      if (!idx.length) return [];
      const geometry = new MeshGeometry({
        positions: new Float32Array(n * 2),
        uvs,
        indices: Uint32Array.from(idx),
        topology: 'line-list',
      });
      geometry.batchMode = 'no-batch';
      const mesh = new Mesh({ geometry, texture: Texture.WHITE });
      mesh.tint = hexToNumber(resolved ? theme.edge : theme.ghost);
      mesh.alpha = resolved ? theme.edgeAlpha : theme.edgeAlpha * 0.8;
      this.edges.addChild(mesh);
      return [mesh];
    });
  }

  private drawLabels(): void {
    const { scale } = this.camera;
    const show = scale >= LABEL_ZOOM || this.ids.length <= 60;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const picked: number[] = [];
    if (show) {
      const tl = toWorld(this.camera, 0, 0);
      const br = toWorld(this.camera, w, h);
      for (let i = 0; i < this.ids.length; i++) {
        const x = this.pos[i * 2] as number;
        const y = this.pos[i * 2 + 1] as number;
        if (x >= tl.x && x <= br.x && y >= tl.y && y <= br.y) picked.push(i);
      }
      picked.sort((a, b) => (this.radius[b] as number) - (this.radius[a] as number));
      picked.length = Math.min(picked.length, MAX_LABELS);
    }
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
      const text = this.ctx.graph.notes.get(id)?.title ?? id;
      if (label.text !== text) label.text = text.length > 32 ? `${text.slice(0, 31)}…` : text;
      label.visible = true;
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

  // ---- input ----------------------------------------------------------------------------------------------

  private local(e: { clientX: number; clientY: number }) {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Nearest node under a screen point (linear scan is ~0.1 ms for 5k nodes). */
  private hit(sx: number, sy: number): number {
    const w = toWorld(this.camera, sx, sy);
    const slop = 4 / this.camera.scale;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.ids.length; i++) {
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

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      const p = this.local(e);
      canvas.setPointerCapture(e.pointerId);
      this.press = { ...p, node: this.hit(p.x, p.y), cam: { ...this.camera }, moved: false, id: e.pointerId };
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
        this.edgesDirty = true;
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
        this.ctx.onFocus(press.node >= 0 ? (this.ids[press.node] as string) : null);
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
        const p = this.local(e);
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.camera = zoomAt(this.camera, p.x, p.y, Math.exp(-delta * 0.0015));
        this.userMovedCamera = true;
        this.applyCamera();
      },
      { passive: false },
    );
  }

  // ---- ViewInstance -------------------------------------------------------------------------------------

  update(ctx: ViewContext): void {
    const graphChanged = ctx.graph !== this.ctx.graph || ctx.vaultHash !== this.ctx.vaultHash;
    this.ctx = ctx;
    void this.ready.then(() => {
      if (!this.destroyed && graphChanged) this.build();
    });
  }

  focusNode(id: NoteId): void {
    const i = this.index.get(id);
    if (i === undefined) return;
    const { width, height } = this.app.screen;
    const scale = Math.max(this.camera.scale, 1.2);
    this.camera = {
      scale,
      x: width / 2 - (this.pos[i * 2] as number) * scale,
      y: height / 2 - (this.pos[i * 2 + 1] as number) * scale,
    };
    this.userMovedCamera = true;
    this.applyCamera();
  }

  async exportImage(): Promise<Blob> {
    await this.ready;
    const canvas = this.app.renderer.extract.canvas({
      target: this.app.stage,
      resolution: 2,
    }) as HTMLCanvasElement;
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), 'image/png'),
    );
  }

  destroy(): void {
    this.destroyed = true;
    void this.ctx.layout.stop();
    void this.ready.then(() => {
      this.app.canvas.remove();
      this.app.destroy(true, { children: true, texture: true });
    });
  }
}

export const forceView: ViewModule = {
  id: 'force',
  label: 'Force graph',
  icon: 'share-2',
  renderer: 'pixi',
  mount: (el, ctx) => new ForceView(el, ctx),
};
