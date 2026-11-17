import type { NoteId, VaultGraph } from '../../core/model';
import type { DateField } from '../../core/lens/applyLenses';
import { unitHash } from '../../core/util/random';
import { noteRadius } from '../shared/encodings';

/** Pure, deterministic Constellation Timeline layout (PLAN §7 Phase 3.3). */

export const TIMELINE_WIDTH = 1600;
export const LANE_HEIGHT = 80;

export interface Lane {
  key: string; // top-level folder ('' = vault root)
  label: string;
  y: number; // centre
  count: number;
}

export interface Tick {
  t: number;
  x: number;
  label: string;
  major: boolean;
}

export interface TimelineLayout {
  ids: NoteId[]; // notes only, sorted by time (ghosts have no date)
  times: Float64Array;
  positions: Float32Array;
  radius: Float32Array;
  lanes: Lane[];
  ticks: Tick[];
  t0: number;
  t1: number;
  /** Constellation lines always drawn: the shortest links (local in time), capped. */
  links: number[];
  /** The remaining (long, cross-time) links: drawn only around the focused note. */
  longLinks: number[];
}

/** Cap on always-visible constellation lines; long lines across the whole timeline are mostly overdraw. */
export const MAX_CONSTELLATION_LINES = 4000;

const DAY = 86_400_000;

export const timeToX = (l: Pick<TimelineLayout, 't0' | 't1'>, t: number): number =>
  ((t - l.t0) / Math.max(1, l.t1 - l.t0)) * TIMELINE_WIDTH;
export const xToTime = (l: Pick<TimelineLayout, 't0' | 't1'>, x: number): number =>
  l.t0 + (x / TIMELINE_WIDTH) * (l.t1 - l.t0);

function ticks(t0: number, t1: number): Tick[] {
  const out: Tick[] = [];
  const span = t1 - t0;
  const months = span / (30 * DAY);
  const step = months > 60 ? 12 : months > 24 ? 3 : 1; // months between ticks
  const d = new Date(t0);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  for (;;) {
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if (m % step !== 0) continue;
    const major = m === 0;
    out.push({
      t,
      x: ((t - t0) / span) * TIMELINE_WIDTH,
      label: major ? String(y) : new Date(t).toLocaleString('en', { month: 'short', timeZone: 'UTC' }),
      major,
    });
  }
  return out;
}

export function timelineLayout(graph: VaultGraph, field: DateField): TimelineLayout {
  const notes = [...graph.notes.values()].sort((a, b) => a[field] - b[field] || (a.id < b.id ? -1 : 1));
  const ids = notes.map((n) => n.id);
  const times = Float64Array.from(notes, (n) => n[field]);
  const min = notes.length ? (times[0] as number) : 0;
  const max = notes.length ? (times[times.length - 1] as number) : DAY;
  const pad = Math.max(DAY * 7, (max - min) * 0.03);
  const t0 = min - pad;
  const t1 = max + pad;

  const top = (folder: string) => folder.split('/')[0] ?? '';
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(top(n.folder), (counts.get(top(n.folder)) ?? 0) + 1);
  const keys = [...counts.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a < b ? -1 : 1));
  const lanes: Lane[] = keys.map((key, i) => ({
    key,
    label: key === '' ? graph.vaultName : (graph.folders.get(key)?.name ?? key),
    y: i * LANE_HEIGHT + LANE_HEIGHT / 2,
    count: counts.get(key) ?? 0,
  }));
  const laneOf = new Map(lanes.map((l) => [l.key, l]));

  const positions = new Float32Array(ids.length * 2);
  notes.forEach((n, i) => {
    const lane = laneOf.get(top(n.folder)) as Lane;
    positions[i * 2] = ((n[field] - t0) / (t1 - t0)) * TIMELINE_WIDTH;
    positions[i * 2 + 1] = lane.y + (unitHash(n.id) - 0.5) * LANE_HEIGHT * 0.78;
  });

  const index = new Map(ids.map((id, i) => [id, i]));
  const all: [number, number, number][] = [];
  for (const l of graph.links) {
    const a = index.get(l.source);
    const b = index.get(l.target);
    if (a === undefined || b === undefined || a === b) continue;
    const len = Math.hypot(
      (positions[a * 2] as number) - (positions[b * 2] as number),
      (positions[a * 2 + 1] as number) - (positions[b * 2 + 1] as number),
    );
    all.push([a, b, len]);
  }
  all.sort((x, y) => x[2] - y[2] || x[0] - y[0] || x[1] - y[1]);
  const links: number[] = [];
  const longLinks: number[] = [];
  all.forEach(([a, b], k) => (k < MAX_CONSTELLATION_LINES ? links : longLinks).push(a, b));

  return {
    ids,
    times,
    positions,
    radius: Float32Array.from(notes, (n) => noteRadius(n) * 0.7),
    lanes,
    ticks: ticks(t0, t1),
    t0,
    t1,
    links,
    longLinks,
  };
}

/** Number of notes (sorted by time) dated at or before `t`. */
export function countUpTo(times: Float64Array, t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] as number) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
