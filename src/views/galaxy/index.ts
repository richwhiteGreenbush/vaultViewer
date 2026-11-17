import { Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { hexToNumber } from '../../core/color/tagColor';
import { seededRandom } from '../../core/util/random';
import type { ViewContext, ViewModule } from '../types';
import { noteRadius } from '../shared/encodings';
import { PixiScene, TEX_R, type SceneLayout } from '../shared/pixiScene';
import { galaxyLayout, moonPosition, positionsAt, type GalaxyLayout } from './layout';

const SUN = '#ffc46b';
const SUN_LIGHT = '#e09a2e';

/** Star texture for one parallax layer (seeded so the sky is the same every time). */
function starTexture(seed: number, count: number, maxR: number, color: string): Texture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return Texture.EMPTY;
  const rand = seededRandom(seed);
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    g.globalAlpha = 0.3 + rand() * 0.7;
    g.beginPath();
    g.arc(rand() * size, rand() * size, 0.4 + rand() * maxR, 0, Math.PI * 2);
    g.fill();
  }
  return Texture.from(c);
}

class GalaxyView extends PixiScene {
  private g!: GalaxyLayout;
  private stars: TilingSprite[] = [];
  private starTextures: Texture[] = [];
  private systemLayer = new Container();
  private moonSprites: { sprite: Sprite; rings: Graphics }[] = [];
  private tails: { i: number; sprite: Sprite }[] = [];
  private lanes = new Graphics();

  constructor(el: HTMLElement, ctx: ViewContext) {
    super(el, ctx, 'galaxy');
    // Orbits are dense; label only when zoomed in (or the focused neighbourhood).
    this.labelZoom = 1.8;
    this.labelSmallVaults = false;
  }

  /** Missing notes are dim asteroids: small solid specks rather than hollow rings. */
  protected bodyTexture(i: number) {
    return this.ctx.graph.notes.has(this.ids[i] as string) ? super.bodyTexture(i) : this.tex.disc;
  }

  protected layout(): SceneLayout {
    const { graph } = this.ctx;
    this.g = galaxyLayout(graph);
    const ids = this.g.ids;
    const index = new Map(ids.map((id, i) => [id, i]));
    const pairs: number[] = [];
    for (const l of graph.links) {
      const a = index.get(l.source);
      const b = index.get(l.target);
      if (a !== undefined && b !== undefined && a !== b) pairs.push(a, b);
    }
    return {
      ids,
      positions: positionsAt(this.g, 0),
      radius: Float32Array.from(ids, (id) =>
        graph.notes.has(id) ? noteRadius(graph.notes.get(id)) * 0.8 : 2.6,
      ),
      edges: [
        {
          name: 'links',
          pairs,
          focusOnly: true, // individual links appear around the focused note; hyperlanes summarise the rest
          style: (t) => ({ color: t.edge, alpha: t.edgeAlpha }),
        },
      ],
    };
  }

  protected decorate(): void {
    const { theme } = this.ctx;
    // Parallax starfield (three layers moving at different rates). Light themes get a faint dust instead.
    for (const s of this.stars) s.destroy();
    for (const t of this.starTextures) t.destroy(true);
    this.screenBack.removeChildren();
    const starColor = theme.dark ? '#ffffff' : theme.mutedText;
    this.starTextures = [
      starTexture(1, theme.dark ? 160 : 60, 0.7, starColor),
      starTexture(2, theme.dark ? 70 : 30, 1.1, starColor),
      starTexture(3, theme.dark ? 25 : 12, 1.6, starColor),
    ];
    this.stars = this.starTextures.map((texture, k) => {
      const s = new TilingSprite({ texture, width: this.app.screen.width, height: this.app.screen.height });
      s.alpha = theme.dark ? 0.35 + k * 0.2 : 0.18;
      this.screenBack.addChild(s);
      return s;
    });

    // Systems: orbit rings, hyperlanes, suns, moons, names.
    this.under.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.systemLayer = new Container();
    this.lanes = new Graphics();
    const ringColor = hexToNumber(theme.edge);
    const ringAlpha = theme.dark ? 0.07 : 0.12;

    const center = { x: 0, y: 0 };
    const maxLane = Math.max(1, ...this.g.hyperlanes.map((l) => l.count));
    for (const lane of this.g.hyperlanes) {
      const a = this.g.systems[lane.a];
      const b = this.g.systems[lane.b];
      if (!a || !b) continue;
      // Curve towards the galactic centre.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const cx = mx + (center.x - mx) * 0.35;
      const cy = my + (center.y - my) * 0.35;
      this.lanes
        .moveTo(a.x, a.y)
        .quadraticCurveTo(cx, cy, b.x, b.y)
        .stroke({
          color: hexToNumber(theme.edgeHighlight),
          alpha: 0.08 + 0.3 * (lane.count / maxLane),
          width: 1 + 3 * (lane.count / maxLane),
        });
    }

    const sunRings = new Graphics();
    for (const r of this.g.rings) {
      if (r.moon >= 0) continue;
      const s = this.g.systems[r.system];
      if (s) sunRings.circle(s.x, s.y, r.radius).stroke({ color: ringColor, alpha: ringAlpha, width: 1 });
    }

    const sunColor = hexToNumber(theme.dark ? SUN : SUN_LIGHT);
    for (const s of this.g.systems) {
      const glow = new Sprite(this.tex.glow);
      glow.anchor.set(0.5);
      glow.position.set(s.x, s.y);
      glow.scale.set((s.sunR * 3.2) / 64);
      glow.tint = sunColor;
      glow.alpha = theme.dark ? 0.55 : 0.25;
      glow.blendMode = theme.dark ? 'add' : 'normal';
      const sun = new Sprite(this.tex.disc);
      sun.anchor.set(0.5);
      sun.position.set(s.x, s.y);
      sun.scale.set(s.sunR / TEX_R);
      sun.tint = sunColor;
      const name = new Text({
        text: s.name,
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: theme.text },
      });
      name.anchor.set(0.5, 0);
      name.resolution = 2;
      name.position.set(s.x, s.y + s.sunR + 4);
      name.alpha = 0.85;
      this.systemLayer.addChild(glow, sun, name);
    }

    this.moonSprites = this.g.moons.map((m) => {
      const rings = new Graphics();
      for (const r of this.g.rings)
        if (r.moon === this.g.moons.indexOf(m))
          rings.circle(0, 0, r.radius).stroke({ color: ringColor, alpha: ringAlpha, width: 1 });
      const sprite = new Sprite(this.tex.disc);
      sprite.anchor.set(0.5);
      sprite.scale.set(m.r / TEX_R);
      sprite.tint = hexToNumber(theme.mutedText);
      sprite.alpha = 0.9;
      this.systemLayer.addChild(rings, sprite);
      return { sprite, rings };
    });

    this.under.addChild(this.lanes, sunRings, this.systemLayer);

    // Comet tails for orphans.
    this.over.removeChildren().forEach((c) => c.destroy());
    this.tails = [];
    this.g.motion.forEach((m, i) => {
      if (m.kind !== 'comet') return;
      const sprite = new Sprite(this.tex.tail);
      sprite.anchor.set(1, 0.5);
      sprite.rotation = m.angle;
      sprite.blendMode = theme.dark ? 'add' : 'normal';
      this.over.addChild(sprite);
      this.tails.push({ i, sprite });
    });
    this.placeMoons(0);
    this.onCamera();
  }

  protected themeStyle(): void {
    super.themeStyle();
    for (const t of this.tails) {
      t.sprite.tint = hexToNumber(this.colors[t.i] ?? this.ctx.theme.accent);
    }
  }

  protected visibilityStyle(): void {
    super.visibilityStyle();
    for (const t of this.tails) t.sprite.visible = this.visibleMask[t.i] === 1;
  }

  private placeMoons(t: number): void {
    this.moonSprites.forEach((m, k) => {
      const p = moonPosition(this.g, k, t);
      m.sprite.position.set(p.x, p.y);
      m.rings.position.set(p.x, p.y);
    });
  }

  protected animate(now: number): boolean {
    const t = now / 1000;
    positionsAt(this.g, t, this.pos);
    this.placeMoons(t);
    for (const tail of this.tails) {
      const r = this.radius[tail.i] as number;
      tail.sprite.position.set(this.pos[tail.i * 2] as number, this.pos[tail.i * 2 + 1] as number);
      tail.sprite.width = r * 9;
      tail.sprite.height = r * 1.8;
    }
    return true;
  }

  protected onCamera(): void {
    const { width, height } = this.app.screen;
    this.stars.forEach((s, k) => {
      const f = 0.05 + k * 0.08; // far layers move least
      s.width = width;
      s.height = height;
      s.tilePosition.set(this.camera.x * f, this.camera.y * f);
    });
  }

  protected contentBounds(): Float32Array {
    const r = this.g.radius + 60;
    return new Float32Array([-r, -r, r, r]);
  }
}

export const galaxyView: ViewModule = {
  id: 'galaxy',
  label: 'Galaxy',
  icon: 'orbit',
  renderer: 'pixi',
  mount: (el, ctx) => new GalaxyView(el, ctx),
};
