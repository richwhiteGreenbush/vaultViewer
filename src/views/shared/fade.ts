import { Container, Sprite, type Texture } from 'pixi.js';

const FADE_MS = 600;

export interface NodeSnapshot {
  pos: Map<string, [number, number]>;
  look: Map<string, { tint: number; scale: number; texture: Texture }>;
}

/** Captures node positions and looks before a rebuild, so the next build can fade changes. */
export function snapshotNodes(ids: string[], pos: ArrayLike<number>, sprites: Sprite[]): NodeSnapshot {
  const s: NodeSnapshot = { pos: new Map(), look: new Map() };
  ids.forEach((id, i) => {
    const sp = sprites[i];
    s.pos.set(id, [pos[i * 2] as number, pos[i * 2 + 1] as number]);
    if (sp) s.look.set(id, { tint: sp.tint, scale: sp.scale.x, texture: sp.texture });
  });
  return s;
}

/**
 * Live updates (PLAN §7 Phase 4): after a rebuild, notes that are new fade in, and notes that were removed
 * fade out where they last were.
 */
export class Fader {
  private start = 0;
  private incoming: number[] = [];
  private outgoing: Sprite[] = [];

  constructor(private layer: Container) {}

  begin(prev: NodeSnapshot | null, ids: string[]): void {
    this.finish();
    if (!prev) return;
    this.start = performance.now();
    const now = new Set(ids);
    this.incoming = ids.flatMap((id, i) => (prev.pos.has(id) ? [] : [i]));
    for (const [id, [x, y]] of prev.pos) {
      if (now.has(id)) continue;
      const look = prev.look.get(id);
      if (!look) continue;
      const s = new Sprite(look.texture);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.scale.set(look.scale);
      s.tint = look.tint;
      this.layer.addChild(s);
      this.outgoing.push(s);
    }
  }

  get active(): boolean {
    return this.incoming.length > 0 || this.outgoing.length > 0;
  }

  /** Applies fade factors; `baseAlpha(i)` is the alpha a node would have without fading. */
  step(sprites: Sprite[], baseAlpha: (i: number) => number): void {
    if (!this.active) return;
    const k = Math.min(1, (performance.now() - this.start) / FADE_MS);
    for (const i of this.incoming) {
      const s = sprites[i];
      if (s) s.alpha = baseAlpha(i) * k;
    }
    for (const s of this.outgoing) s.alpha = 0.9 * (1 - k);
    if (k >= 1) this.finish();
  }

  /** Ids of nodes currently fading in (for tests). */
  get incomingCount(): number {
    return this.incoming.length;
  }

  private finish(): void {
    for (const s of this.outgoing) s.destroy();
    this.outgoing = [];
    this.incoming = [];
  }
}
