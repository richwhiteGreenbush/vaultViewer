import type { DateField } from '../../core/lens/applyLenses';
import type { Note } from '../../core/model';
import { strings } from '../../strings';
import type { ViewContext, ViewInstance, ViewModule } from '../types';
import { svgToPng, svgToString } from '../shared/svgExport';
import { calendarLayout, moveDate, type CalendarLayout } from './layout';

const SVG = 'http://www.w3.org/2000/svg';
const CELL = 13;
const GAP = 3;
const LEFT = 36;
const YEAR_H = 7 * (CELL + GAP) + 44;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

class CalendarView implements ViewInstance {
  private ctx: ViewContext;
  private field: DateField = 'created';
  private root = document.createElement('div');
  private svg = el('svg');
  private tooltip = document.createElement('div');
  private toolbar = document.createElement('div');
  private layout: CalendarLayout | null = null;
  private active: string | null = null; // roving-tabindex day

  constructor(
    private host: HTMLElement,
    ctx: ViewContext,
  ) {
    this.ctx = ctx;
    this.root.className = 'svg-view';
    this.svg.setAttribute('role', 'group');
    this.svg.setAttribute('aria-label', strings.calendar.label);
    this.svg.dataset.testid = 'calendar-svg';
    this.tooltip.className = 'view-tooltip';
    this.tooltip.hidden = true;
    this.root.append(this.svg);
    this.buildToolbar();
    host.append(this.root, this.toolbar, this.tooltip);
    delete (window as unknown as { __vaultLensView?: unknown }).__vaultLensView;
    this.render();
  }

  private buildToolbar(): void {
    this.toolbar.className = 'view-toolbar';
    const field = document.createElement('select');
    field.className = 'select select--small';
    field.setAttribute('aria-label', strings.calendar.field);
    field.dataset.testid = 'calendar-field';
    field.add(new Option(strings.lens.created, 'created', true, true));
    field.add(new Option(strings.lens.updated, 'updated'));
    field.addEventListener('change', () => {
      this.field = field.value === 'updated' ? 'updated' : 'created';
      this.render();
    });
    const scale = document.createElement('span');
    scale.className = 'cal-scale';
    scale.dataset.role = 'scale';
    this.toolbar.append(field, scale);
  }

  private renderScale(): void {
    const scale = this.toolbar.querySelector('[data-role="scale"]');
    if (!scale) return;
    const swatches = this.ctx.theme.sequential.map((c) => {
      const s = document.createElement('i');
      s.style.background = c;
      return s;
    });
    scale.replaceChildren(strings.calendar.less, ...swatches, strings.calendar.more);
  }

  private open(date: string): void {
    const cell = this.layout?.byDate.get(date);
    this.ctx.actions.showNoteList(date, cell?.noteIds ?? []);
  }

  private render(): void {
    const { theme, graph, visible, focus } = this.ctx;
    const notes: Note[] = [];
    for (const id of visible.notes) {
      const n = graph.notes.get(id);
      if (n) notes.push(n);
    }
    const l = calendarLayout(notes, this.field);
    this.layout = l;
    this.renderScale();
    const weeks = Math.max(53, ...l.years.map((y) => y.weeks));
    const w = LEFT + weeks * (CELL + GAP) + 16;
    const h = Math.max(1, l.years.length) * YEAR_H + 16;
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.replaceChildren();
    this.host.dataset.layout = 'settled';
    this.host.dataset.visibleNodes = String(l.total);

    const focusDate = focus ? graph.notes.get(focus)?.[this.field] : undefined;
    const focusDay =
      focusDate !== undefined && visible.notes.has(focus ?? '')
        ? new Date(focusDate).toISOString().slice(0, 10)
        : null;
    if (!this.active || !l.byDate.has(this.active)) {
      this.active = focusDay ?? [...l.byDate.values()].find((c) => c.count > 0)?.date ?? null;
    }

    l.years.forEach((year, yi) => {
      const g = el('g', { transform: `translate(${LEFT}, ${yi * YEAR_H + 30})` });
      const title = el('text', { x: -LEFT, y: -14, 'font-size': 14, 'font-weight': 700 });
      title.textContent = String(year.year);
      g.append(title);
      for (const m of year.months) {
        const t = el('text', { x: m.week * (CELL + GAP), y: -2, 'font-size': 10, class: 'muted-text' });
        t.textContent = m.label;
        g.append(t);
      }
      for (const [row, label] of [
        [1, 'Mon'],
        [3, 'Wed'],
        [5, 'Fri'],
      ] as const) {
        const t = el('text', {
          x: -6,
          y: row * (CELL + GAP) + CELL - 3,
          'font-size': 10,
          'text-anchor': 'end',
          class: 'muted-text',
        });
        t.textContent = label;
        g.append(t);
      }
      for (const c of year.cells) {
        const r = el('rect', {
          x: c.week * (CELL + GAP),
          y: c.weekday * (CELL + GAP) + 4,
          width: CELL,
          height: CELL,
          rx: 2.5,
          fill: theme.sequential[c.level] ?? theme.sequential[0] ?? '#888',
          role: 'button',
          tabindex: c.date === this.active ? 0 : -1,
          'aria-label': strings.calendar.day(c.date, c.count),
        });
        r.dataset.date = c.date;
        r.dataset.count = String(c.count);
        if (c.date === focusDay) {
          r.setAttribute('stroke', theme.edgeHighlight);
          r.setAttribute('stroke-width', '2');
        }
        r.style.cursor = 'pointer';
        r.addEventListener('click', () => {
          this.active = c.date;
          this.open(c.date);
        });
        r.addEventListener('mousemove', (e) => {
          this.tooltip.textContent = strings.calendar.day(c.date, c.count);
          this.tooltip.hidden = false;
          this.tooltip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 220)}px`;
          this.tooltip.style.top = `${e.clientY + 14}px`;
        });
        r.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
        r.addEventListener('keydown', (e) => this.onKey(e, c.date));
        g.append(r);
      }
      this.svg.append(g);
    });
  }

  private onKey(e: KeyboardEvent, date: string): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.open(date);
      return;
    }
    const next = moveDate(date, e.key);
    if (!next) return;
    e.preventDefault();
    const target = this.svg.querySelector<SVGRectElement>(`rect[data-date="${next}"]`);
    if (!target) return;
    this.svg.querySelector(`rect[data-date="${date}"]`)?.setAttribute('tabindex', '-1');
    target.setAttribute('tabindex', '0');
    this.active = next;
    target.focus();
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
    this.root.remove();
    this.toolbar.remove();
    this.tooltip.remove();
  }
}

export const calendarView: ViewModule = {
  id: 'calendar',
  label: 'Calendar',
  icon: 'calendar',
  renderer: 'svg',
  mount: (host, ctx) => new CalendarView(host, ctx),
};
