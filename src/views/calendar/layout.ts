import type { Note, NoteId } from '../../core/model';
import type { DateField } from '../../core/lens/applyLenses';

/** Pure heat-map calendar layout (PLAN §7 Phase 3.5): GitHub-style weeks × weekdays, one block per year. */

export interface DayCell {
  date: string; // YYYY-MM-DD (UTC)
  week: number; // column within the year
  weekday: number; // 0 = Sunday … 6 = Saturday (row)
  count: number;
  level: number; // 0 = none, 1–4 = colour step
  noteIds: NoteId[];
}

export interface YearBlock {
  year: number;
  weeks: number;
  cells: DayCell[];
  months: { label: string; week: number }[];
}

export interface CalendarLayout {
  years: YearBlock[]; // newest first
  total: number;
  max: number;
  thresholds: number[]; // upper bounds of levels 1–3; level 4 above
  byDate: Map<string, DayCell>;
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Quartile thresholds over the non-zero day counts, so colour steps spread evenly whatever the vault size. */
export function levelThresholds(counts: number[]): number[] {
  const nz = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (!nz.length) return [1, 1, 1];
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] as number;
  return [q(0.25), q(0.5), q(0.75)];
}

export function levelFor(count: number, thresholds: number[]): number {
  if (count <= 0) return 0;
  const [a = 1, b = 1, c = 1] = thresholds;
  return count <= a ? 1 : count <= b ? 2 : count <= c ? 3 : 4;
}

export function calendarLayout(notes: Iterable<Note>, field: DateField): CalendarLayout {
  const perDay = new Map<string, NoteId[]>();
  let total = 0;
  for (const n of notes) {
    const d = iso(n[field]);
    const list = perDay.get(d) ?? [];
    list.push(n.id);
    perDay.set(d, list);
    total++;
  }
  const dates = [...perDay.keys()].sort();
  const thresholds = levelThresholds([...perDay.values()].map((l) => l.length));
  const byDate = new Map<string, DayCell>();
  const years: YearBlock[] = [];
  if (dates.length) {
    const first = Number((dates[0] as string).slice(0, 4));
    const last = Number((dates[dates.length - 1] as string).slice(0, 4));
    for (let year = last; year >= first; year--) {
      const jan1 = Date.UTC(year, 0, 1);
      const offset = new Date(jan1).getUTCDay();
      const days = (Date.UTC(year + 1, 0, 1) - jan1) / DAY;
      const cells: DayCell[] = [];
      const months: { label: string; week: number }[] = [];
      for (let d = 0; d < days; d++) {
        const t = jan1 + d * DAY;
        const date = iso(t);
        const ids = (perDay.get(date) ?? []).slice().sort();
        const week = Math.floor((d + offset) / 7);
        const cell: DayCell = {
          date,
          week,
          weekday: (d + offset) % 7,
          count: ids.length,
          level: levelFor(ids.length, thresholds),
          noteIds: ids,
        };
        cells.push(cell);
        byDate.set(date, cell);
        if (date.endsWith('-01'))
          months.push({ label: new Date(t).toLocaleString('en', { month: 'short', timeZone: 'UTC' }), week });
      }
      years.push({ year, weeks: Math.floor((days - 1 + offset) / 7) + 1, cells, months });
    }
  }
  return { years, total, max: Math.max(0, ...[...perDay.values()].map((l) => l.length)), thresholds, byDate };
}

/** Keyboard movement in the grid: up/down = ±1 day, left/right = ±1 week. */
export function moveDate(date: string, key: string): string | null {
  const step: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
  const s = step[key];
  if (s === undefined) return null;
  return iso(Date.parse(`${date}T00:00:00Z`) + s * DAY);
}
