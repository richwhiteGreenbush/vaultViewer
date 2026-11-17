import { fixtureGraph } from '../core/loadFixture';
import {
  countUpTo,
  MAX_CONSTELLATION_LINES,
  timelineLayout,
  timeToX,
  xToTime,
} from '../../../src/views/timeline/layout';

const g = fixtureGraph();

describe('timeline layout', () => {
  const l = timelineLayout(g, 'created');

  it('is deterministic', () => {
    expect(timelineLayout(fixtureGraph(), 'created')).toEqual(l);
  });

  it('has one lane per top-level folder, vault root first', () => {
    expect(l.lanes.map((x) => x.key)).toEqual(['', 'archive', 'areas', 'journal', 'projects', 'resources']);
    expect(l.lanes.reduce((n, x) => n + x.count, 0)).toBe(39);
  });

  it('orders notes by time and maps time to x monotonically', () => {
    expect(l.ids).toHaveLength(39); // notes only, no ghosts
    for (let i = 1; i < l.ids.length; i++) {
      expect(l.times[i]).toBeGreaterThanOrEqual(l.times[i - 1] as number);
      expect(l.positions[i * 2]).toBeGreaterThanOrEqual(l.positions[(i - 1) * 2] as number);
    }
    const t = Date.UTC(2025, 6, 1);
    expect(xToTime(l, timeToX(l, t))).toBeCloseTo(t, -1);
  });

  it('keeps each note inside its lane', () => {
    l.ids.forEach((id, i) => {
      const top = g.notes.get(id)?.folder.split('/')[0] ?? '';
      const lane = l.lanes.find((x) => x.key === top);
      expect(Math.abs((l.positions[i * 2 + 1] as number) - (lane?.y ?? 0))).toBeLessThan(40);
    });
  });

  it('counts notes up to a time (playhead) with binary search', () => {
    expect(countUpTo(l.times, l.t0)).toBe(0);
    expect(countUpTo(l.times, l.t1)).toBe(39);
    expect(countUpTo(l.times, Date.UTC(2025, 0, 31))).toBe(4); // old idea, welcome, 2025-01-15, journal meeting
  });

  it('splits links into short constellation lines and long ones', () => {
    expect((l.links.length + l.longLinks.length) / 2).toBe(
      g.links.filter((x) => x.resolved && x.source !== x.target).length,
    );
    expect(l.links.length / 2).toBeLessThanOrEqual(MAX_CONSTELLATION_LINES);
  });

  it('ticks fall inside the range; years are major', () => {
    for (const t of l.ticks) expect(t.t).toBeGreaterThan(l.t0);
    expect(l.ticks.filter((t) => t.major).map((t) => t.label)).toEqual(['2025', '2026']);
  });

  it('updated-date layout differs', () => {
    expect(timelineLayout(g, 'updated').times).not.toEqual(l.times);
  });
});
