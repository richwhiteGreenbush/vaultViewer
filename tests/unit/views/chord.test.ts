import { fixtureGraph } from '../core/loadFixture';
import { chordLayout } from '../../../src/views/chord/layout';

const g = fixtureGraph();
const notes = [...g.notes.values()];

describe('chord layout', () => {
  const l = chordLayout(notes, 24);

  it('is deterministic and limited to the top N tags', () => {
    expect(chordLayout(notes, 24)).toEqual(l);
    expect(l.groups).toHaveLength(24);
    expect(chordLayout(notes, 8).groups).toHaveLength(8);
    expect(chordLayout(notes, 8).groups.map((x) => x.tag)).toContain('journal');
  });

  it('arc length is proportional to note count and fits the circle', () => {
    const total = l.groups.at(-1)?.endAngle ?? 0;
    expect(total).toBeLessThanOrEqual(Math.PI * 2);
    const perNote = l.groups.map((x) => (x.endAngle - x.startAngle) / x.count);
    for (const p of perNote) expect(p).toBeCloseTo(perNote[0] as number, 9);
    expect(l.groups.find((x) => x.tag === 'journal')?.count).toBe(13);
  });

  it('ribbon counts are co-occurrence counts, with the notes behind them', () => {
    const pair = (a: string, b: string) =>
      l.ribbons.find((r) => {
        const ta = l.groups[r.a]?.tag;
        const tb = l.groups[r.b]?.tag;
        return (ta === a && tb === b) || (ta === b && tb === a);
      });
    expect(pair('food', 'health')?.count).toBe(1);
    expect(pair('food', 'health')?.noteIds).toEqual(['areas/health/nutrition']);
    expect(pair('meeting', 'project/alpha')?.count).toBe(g.tagCooccurrence.get('meeting|project/alpha'));
  });

  it('every ribbon end stays inside its arc and ends do not overlap', () => {
    const used = new Map<number, [number, number][]>();
    for (const r of l.ribbons) {
      for (const [i, span] of [
        [r.a, r.source],
        [r.b, r.target],
      ] as const) {
        const grp = l.groups[i];
        expect(span.startAngle).toBeGreaterThanOrEqual((grp?.startAngle ?? 0) - 1e-9);
        expect(span.endAngle).toBeLessThanOrEqual((grp?.endAngle ?? 0) + 1e-9);
        const list = used.get(i) ?? [];
        for (const [s, e] of list)
          expect(span.startAngle >= e - 1e-9 || span.endAngle <= s + 1e-9).toBe(true);
        list.push([span.startAngle, span.endAngle]);
        used.set(i, list);
      }
    }
  });

  it('respects the visible subset (lenses)', () => {
    const health = notes.filter((n) => n.folder.startsWith('areas/health'));
    const sub = chordLayout(health, 24);
    expect(sub.groups.map((x) => x.tag).sort()).toEqual([
      'fitness',
      'fitness/running',
      'food',
      'food/recipe',
      'habits',
      'health',
    ]);
    expect(chordLayout([], 24)).toEqual({ groups: [], ribbons: [], notesByTag: new Map() });
  });
});
