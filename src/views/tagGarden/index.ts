import { Container, Graphics, Text } from 'pixi.js';
import { hexToNumber, tagColor } from '../../core/color/tagColor';
import { strings } from '../../strings';
import type { ViewContext, ViewModule } from '../types';
import { PixiScene, type SceneLayout } from '../shared/pixiScene';
import { gardenLayout, swayPoint, swayPositions, type GardenLayout } from './layout';

class TagGardenView extends PixiScene {
  private g!: GardenLayout;
  private stems = new Graphics();
  private static_ = new Container();

  constructor(el: HTMLElement, ctx: ViewContext) {
    super(el, ctx, 'tag garden');
    this.labelZoom = 1.6;
    this.labelSmallVaults = false;
  }

  protected layout(): SceneLayout {
    const { graph } = this.ctx;
    this.g = gardenLayout(graph);
    const index = new Map(this.g.ids.map((id, i) => [id, i]));
    const links: number[] = [];
    for (const l of graph.links) {
      const a = index.get(l.source);
      const b = index.get(l.target);
      if (a !== undefined && b !== undefined && a !== b) links.push(a, b);
    }
    return {
      ids: this.g.ids,
      positions: Float32Array.from(this.g.base),
      radius: this.g.radius,
      edges: [
        {
          name: 'vines',
          pairs: this.g.vines,
          highlightable: true,
          // Many vines blend into a band, so each one fades as their number grows.
          style: (t) => ({
            color: t.dark ? '#7fcf86' : '#4f8a53',
            alpha: Math.max(
              0.025,
              Math.min(t.dark ? 0.25 : 0.32, 0.25 * Math.sqrt(150 / Math.max(1, this.g.vines.length / 2))),
            ),
          }),
        },
        {
          name: 'links',
          pairs: links,
          focusOnly: true,
          style: (t) => ({ color: t.edge, alpha: t.edgeAlpha }),
        },
      ],
    };
  }

  protected decorate(): void {
    const { theme } = this.ctx;
    this.under.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.static_ = new Container();
    const ground = new Graphics();
    const groundColor = hexToNumber(theme.dark ? '#3d5a3f' : '#a58f6a');
    for (let r = 0; r < this.g.rows; r++) {
      const y = r * this.g.rowHeight;
      ground
        .moveTo(-40, y)
        .lineTo(this.g.width + 40, y)
        .stroke({ color: groundColor, alpha: 0.9, width: 2 });
    }
    const c = this.g.compost;
    if (c.count) {
      ground
        .roundRect(c.x, c.y, c.width, c.height, 6)
        .fill({ color: hexToNumber(theme.dark ? '#3a2e24' : '#c9b48f'), alpha: 0.6 });
    }
    this.static_.addChild(ground);
    const label = (text: string, x: number, y: number, color: string) => {
      const t = new Text({
        text,
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: '600', fill: color },
      });
      t.anchor.set(0.5, 0);
      t.resolution = 2;
      t.position.set(x, y + 6);
      this.static_.addChild(t);
    };
    for (const p of this.g.plants) label(`#${p.tag}`, p.x, p.y, theme.text);
    if (c.count) label(strings.garden.compost, c.x + c.width / 2, c.y + c.height, theme.mutedText);
    this.stems = new Graphics();
    this.under.addChild(this.static_, this.stems);
    this.drawStems(0);
  }

  private drawStems(t: number): void {
    const { theme } = this.ctx;
    const g = this.stems;
    g.clear();
    const stem = hexToNumber(theme.dark ? '#6fbf73' : '#4c8a50');
    this.g.plants.forEach((p, i) => {
      for (const s of p.segments) {
        const [x1, y1] = swayPoint(this.g, i, s.x1, s.y1, t);
        const [x2, y2] = swayPoint(this.g, i, s.x2, s.y2, t);
        g.moveTo(x1, y1)
          .lineTo(x2, y2)
          .stroke({ color: stem, alpha: 0.85, width: Math.max(1, 4 - s.depth * 1.2), cap: 'round' });
        // A small bud in the tag's colour marks each tip.
        g.circle(x2, y2, 2.2).fill({ color: hexToNumber(tagColor(s.tag, theme)), alpha: 0.9 });
      }
    });
  }

  protected animate(now: number): boolean {
    const t = now / 1000;
    swayPositions(this.g, t, this.pos);
    this.drawStems(t);
    return true;
  }

  protected contentBounds(): Float32Array {
    return new Float32Array([
      -40,
      -this.g.maxHeight - 60,
      this.g.width + 40,
      this.g.compost.y + this.g.compost.height + 24,
    ]);
  }
}

export const tagGardenView: ViewModule = {
  id: 'tagGarden',
  label: 'Tag garden',
  icon: 'flower-2',
  renderer: 'pixi',
  mount: (el, ctx) => new TagGardenView(el, ctx),
};
