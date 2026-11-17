import { fixtureGraph } from '../core/loadFixture';
import { gardenLayout, swayPositions } from '../../../src/views/tagGarden/layout';

const g = fixtureGraph();

describe('tag garden layout', () => {
  const l = gardenLayout(g);

  it('is deterministic', () => {
    expect(gardenLayout(fixtureGraph())).toEqual(l);
  });

  it('grows one plant per top-level tag, tallest-first by note count', () => {
    const roots = new Set([...g.notes.values()].flatMap((n) => n.tags.map((t) => t.split('/')[0])));
    expect(l.plants.map((p) => p.tag).sort()).toEqual([...roots].sort());
    expect(l.plants[0]?.tag).toBe('journal'); // 13 notes
    for (const [i, p] of l.plants.entries())
      if (i) expect(p.count).toBeLessThanOrEqual(l.plants[i - 1]?.count ?? Infinity);
    // nested tags become branches of their root's plant
    const project = l.plants.find((p) => p.tag === 'project');
    expect(project?.segments.map((s) => s.tag).sort()).toEqual([
      'project',
      'project/alpha',
      'project/beta',
      'project/gamma',
    ]);
  });

  it('places every note exactly once; untagged notes go to the compost', () => {
    expect(l.ids).toHaveLength(39);
    expect(new Set(l.ids).size).toBe(39);
    const untagged = [...g.notes.values()].filter((n) => !n.tags.length).map((n) => n.id);
    expect(l.compost.count).toBe(untagged.length);
    for (const id of untagged) expect(l.plantOf[l.ids.indexOf(id)]).toBe(-1);
  });

  it('draws one vine per extra tag', () => {
    const extra = [...g.notes.values()].reduce((n, note) => n + Math.max(0, note.tags.length - 1), 0);
    expect(l.vines.length / 2).toBe(extra);
  });

  it('sway leaves roots and compost in place and bends tips', () => {
    const out = new Float32Array(l.base.length);
    swayPositions(l, 1.3, out);
    const seed = l.ids.length - 1; // compost seeds are last among nodes
    if (l.plantOf[seed] === -1)
      expect([out[seed * 2], out[seed * 2 + 1]]).toEqual([l.base[seed * 2], l.base[seed * 2 + 1]]);
    expect(out).not.toEqual(l.base);
    swayPositions(l, 0, out);
    // at t = 0 the sway angle of plant 0 is 0, so its flowers sit at their base positions
    const i = l.ids.findIndex((_, k) => l.plantOf[k] === 0);
    expect(out[i * 2]).toBeCloseTo(l.base[i * 2] as number, 5);
  });

  it('snapshot (rounded)', () => {
    const r = (v: number) => Math.round(v);
    expect({
      plants: l.plants.map((p) => [p.tag, r(p.x), r(p.y), r(p.height), p.count]),
      flowers: Object.fromEntries(
        l.ids.map((id, i) => [id, [r(l.base[i * 2] as number), r(l.base[i * 2 + 1] as number)]]),
      ),
    }).toMatchSnapshot();
  });
});
