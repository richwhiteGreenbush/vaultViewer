import { fixtureGraph } from '../core/loadFixture';
import { galaxyLayout, positionsAt } from '../../../src/views/galaxy/layout';
import { degree, orphans } from '../../../src/core/graph/metrics';

const g = fixtureGraph();

describe('galaxy layout', () => {
  const l = galaxyLayout(g);

  it('is deterministic', () => {
    const again = galaxyLayout(fixtureGraph());
    expect(again).toEqual(l);
    expect(positionsAt(again, 12.5)).toEqual(positionsAt(l, 12.5));
  });

  it('has one system per top-level folder with linked notes, moons for subfolders', () => {
    expect(l.systems.map((s) => s.key).sort()).toEqual(['', 'areas', 'journal', 'projects', 'resources']);
    expect(l.moons.map((m) => m.key).sort()).toEqual([
      'areas/health',
      'areas/learning',
      'journal/2025',
      'journal/2026',
      'projects/alpha',
      'projects/beta',
    ]);
  });

  it('places every note and ghost exactly once: orphans as comets, ghosts as asteroids', () => {
    expect(l.ids).toHaveLength(39 + 4);
    expect(new Set(l.ids).size).toBe(l.ids.length);
    const kind = (id: string) => l.motion[l.ids.indexOf(id)]?.kind;
    for (const id of orphans(g)) expect(kind(id)).toBe('comet');
    for (const id of g.ghosts) expect(kind(id)).toBe('asteroid');
  });

  it('puts better-linked notes on inner rings around the same centre', () => {
    const byCentre = new Map<string, { ring: number; deg: number }[]>();
    l.motion.forEach((m, i) => {
      if (m.kind !== 'orbit') return;
      const key = `${m.system}:${m.moon}`;
      const list = byCentre.get(key) ?? [];
      list.push({ ring: m.ring, deg: degree(g, l.ids[i] as string) });
      byCentre.set(key, list);
    });
    for (const list of byCentre.values()) {
      for (const a of list)
        for (const b of list) if (a.ring < b.ring) expect(a.deg).toBeGreaterThanOrEqual(b.deg);
    }
  });

  it('systems do not overlap and hyperlanes connect different systems', () => {
    for (const [i, a] of l.systems.entries()) {
      for (const b of l.systems.slice(i + 1))
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.extent + b.extent);
    }
    expect(l.hyperlanes.length).toBeGreaterThan(0);
    for (const h of l.hyperlanes) expect(h.a).not.toBe(h.b);
  });

  it('snapshot of positions at t = 0 (rounded)', () => {
    const p = positionsAt(l, 0);
    const rounded = Object.fromEntries(
      l.ids.map((id, i) => [id, [Math.round(p[i * 2] as number), Math.round(p[i * 2 + 1] as number)]]),
    );
    expect({
      systems: l.systems.map((s) => [s.key, s.x, s.y, Math.round(s.extent)]),
      positions: rounded,
    }).toMatchSnapshot();
  });
});
