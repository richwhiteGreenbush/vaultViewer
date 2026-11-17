import { arc } from 'd3-shape';
import { ribbon } from 'd3-chord';
import { tagColor } from '../../core/color/tagColor';
import type { Note } from '../../core/model';
import { strings } from '../../strings';
import type { ViewContext, ViewInstance, ViewModule } from '../types';
import { chordLayout, type ChordLayout } from './layout';
import { svgToPng, svgToString } from '../shared/svgExport';

const SVG = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

class ChordView implements ViewInstance {
  private ctx: ViewContext;
  private topN = 24;
  private root = document.createElement('div');
  private svg = el('svg');
  private tooltip = document.createElement('div');
  private toolbar = document.createElement('div');
  private resize: ResizeObserver;
  private layout: ChordLayout | null = null;

  constructor(
    private host: HTMLElement,
    ctx: ViewContext,
  ) {
    this.ctx = ctx;
    this.root.className = 'svg-view';
    this.svg.setAttribute('role', 'group');
    this.svg.setAttribute('aria-label', strings.chord.label);
    this.svg.dataset.testid = 'chord-svg';
    this.tooltip.className = 'view-tooltip';
    this.tooltip.hidden = true;
    this.root.append(this.svg);
    this.buildToolbar();
    host.append(this.root, this.toolbar, this.tooltip);
    this.resize = new ResizeObserver(() => this.render());
    this.resize.observe(host);
    delete (window as unknown as { __vaultLensView?: unknown }).__vaultLensView;
    this.render();
  }

  private buildToolbar(): void {
    this.toolbar.className = 'view-toolbar';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '8';
    input.max = '60';
    input.value = String(this.topN);
    input.dataset.testid = 'chord-topn';
    const value = document.createElement('output');
    value.textContent = String(this.topN);
    input.addEventListener('input', () => {
      this.topN = Number(input.value);
      value.textContent = input.value;
      this.render();
    });
    label.append(`${strings.chord.topN} `, input, value);
    this.toolbar.append(label);
  }

  private visibleNotes(): Note[] {
    const out: Note[] = [];
    for (const id of this.ctx.visible.notes) {
      const n = this.ctx.graph.notes.get(id);
      if (n) out.push(n);
    }
    return out;
  }

  private showTip(e: MouseEvent, html: HTMLElement[]): void {
    this.tooltip.replaceChildren(...html);
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 300)}px`;
    this.tooltip.style.top = `${Math.min(e.clientY + 14, window.innerHeight - 220)}px`;
  }

  private render(): void {
    const { theme, graph, focus } = this.ctx;
    const w = Math.max(320, this.host.clientWidth);
    const h = Math.max(320, this.host.clientHeight);
    const R = Math.max(80, Math.min(w, h) / 2 - 110);
    this.layout = chordLayout(this.visibleNotes(), this.topN);
    const { groups, ribbons, notesByTag } = this.layout;
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
    this.svg.setAttribute('viewBox', `${-w / 2} ${-h / 2} ${w} ${h}`);
    this.svg.replaceChildren();
    this.host.dataset.layout = 'settled';
    this.host.dataset.visibleNodes = String(groups.length);

    if (!ribbons.length) {
      const t = el('text', { 'text-anchor': 'middle', class: 'muted-text' });
      t.textContent = strings.chord.empty;
      this.svg.append(t);
    }

    const focusTags = new Set(focus ? (graph.notes.get(focus)?.tags ?? []) : []);
    const arcPath = arc<{ startAngle: number; endAngle: number }>()
      .innerRadius(R + 2)
      .outerRadius(R + 16);
    const ribbonPath = ribbon<unknown, { startAngle: number; endAngle: number }>().radius(R);
    const ribbonsG = el('g', { 'fill-opacity': theme.dark ? 0.62 : 0.55 });
    const arcsG = el('g');
    const labelsG = el('g', { 'font-size': 12 });

    const ribbonEls = ribbons.map((r) => {
      const a = groups[r.a];
      const b = groups[r.b];
      const p = el('path', {
        d: (ribbonPath({ source: r.source, target: r.target } as never) as unknown as string) ?? '',
        fill: tagColor(a?.tag ?? '', theme),
      });
      p.dataset.pair = `${a?.tag}|${b?.tag}`;
      p.style.cursor = 'pointer';
      const dimmed = focusTags.size > 0 && !(focusTags.has(a?.tag ?? '') && focusTags.has(b?.tag ?? ''));
      if (dimmed) p.setAttribute('fill-opacity', '0.12');
      p.addEventListener('mousemove', (e) => {
        const title = document.createElement('strong');
        title.textContent = strings.chord.ribbon(a?.tag ?? '', b?.tag ?? '', r.count);
        const ul = document.createElement('ul');
        for (const id of r.noteIds.slice(0, 10)) {
          const li = document.createElement('li');
          li.textContent = graph.notes.get(id)?.title ?? id;
          ul.append(li);
        }
        this.showTip(e, [title, ul]);
      });
      p.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
      p.addEventListener('click', () => this.ctx.actions.showNoteList(`#${a?.tag} + #${b?.tag}`, r.noteIds));
      ribbonsG.append(p);
      return { r, p, dimmed };
    });

    const highlight = (i: number | null) => {
      for (const { r, p, dimmed } of ribbonEls) {
        const on = i === null ? !dimmed : r.a === i || r.b === i;
        p.setAttribute('fill-opacity', on ? (theme.dark ? '0.75' : '0.65') : '0.08');
        if (i === null) p.removeAttribute('fill-opacity');
        if (i === null && dimmed) p.setAttribute('fill-opacity', '0.12');
      }
    };

    for (const g of groups) {
      const p = el('path', {
        d: arcPath(g) ?? '',
        fill: tagColor(g.tag, theme),
        tabindex: 0,
        role: 'button',
        'aria-label': strings.chord.arc(g.tag, g.count),
      });
      p.dataset.tag = g.tag;
      p.style.cursor = 'pointer';
      if (focusTags.has(g.tag)) p.setAttribute('stroke', theme.edgeHighlight);
      const activate = () => {
        this.ctx.actions.includeTag(g.tag);
        this.ctx.actions.previousView();
      };
      p.addEventListener('click', activate);
      p.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          activate();
        } else if (e.key === ' ') {
          e.preventDefault();
          this.ctx.actions.showNoteList(`#${g.tag}`, notesByTag.get(g.tag) ?? []);
        }
      });
      p.addEventListener('mouseenter', () => highlight(g.index));
      p.addEventListener('mouseleave', () => highlight(null));
      p.addEventListener('focus', () => highlight(g.index));
      p.addEventListener('blur', () => highlight(null));
      arcsG.append(p);

      const mid = (g.startAngle + g.endAngle) / 2;
      const deg = (mid * 180) / Math.PI - 90;
      const flip = mid > Math.PI;
      const t = el('text', {
        transform: `rotate(${deg}) translate(${R + 22},0)${flip ? ' rotate(180)' : ''}`,
        'text-anchor': flip ? 'end' : 'start',
        'dominant-baseline': 'middle',
      });
      t.textContent = `#${g.tag}`;
      labelsG.append(t);
    }
    this.svg.append(ribbonsG, arcsG, labelsG);
  }

  update(ctx: ViewContext): void {
    const changed =
      ctx.visible !== this.ctx.visible ||
      ctx.theme !== this.ctx.theme ||
      ctx.focus !== this.ctx.focus ||
      ctx.graph !== this.ctx.graph;
    this.ctx = ctx;
    if (changed) this.render();
  }

  focusNode(): void {
    this.render();
  }

  exportImage(): Promise<Blob> {
    return svgToPng(this.svg, this.ctx.theme.background);
  }

  exportSvg(): string {
    return svgToString(this.svg, this.ctx.theme.background);
  }

  destroy(): void {
    this.resize.disconnect();
    this.root.remove();
    this.toolbar.remove();
    this.tooltip.remove();
  }
}

export const chordView: ViewModule = {
  id: 'chord',
  label: 'Tag chord',
  icon: 'circle-dot',
  renderer: 'svg',
  mount: (host, ctx) => new ChordView(host, ctx),
};
