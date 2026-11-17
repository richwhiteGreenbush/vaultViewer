import { fixtureGraph } from './loadFixture';
import {
  applyLenses,
  defaultLens,
  isLensActive,
  neighbourhood,
  tagMatches,
  type LensState,
} from '../../../src/core/lens/applyLenses';
import { hashToLens, lensToHash } from '../../../src/core/lens/urlState';

const g = fixtureGraph();
const lens = (patch: (l: LensState) => void): LensState => {
  const l = defaultLens();
  patch(l);
  return l;
};
const count = (l: LensState) => applyLenses(g, l).noteCount;

describe('applyLenses', () => {
  it('default lens shows everything', () => {
    const v = applyLenses(g, defaultLens());
    expect(v.noteCount).toBe(39);
    expect(v.notes.size).toBe(39 + 4); // + ghosts
    expect(v.linkCount).toBe(58);
    expect(isLensActive(defaultLens())).toBe(false);
  });

  it('tag include "any" matches nested children', () => {
    expect(tagMatches('project/alpha', 'project')).toBe(true);
    expect(tagMatches('projects', 'project')).toBe(false);
    expect(count(lens((l) => (l.tags.include = ['project'])))).toBe(7);
    expect(count(lens((l) => (l.tags.include = ['project/beta', 'retro'])))).toBe(3);
  });

  it('tag include "all"', () => {
    const v = applyLenses(
      g,
      lens((l) => ((l.tags.include = ['project', 'planning']), (l.tags.mode = 'all'))),
    );
    expect([...v.notes].filter((id) => g.notes.has(id))).toEqual(['projects/alpha/plan']);
  });

  it('tag exclude', () => {
    expect(count(lens((l) => (l.tags.exclude = ['journal'])))).toBe(26);
  });

  it('folder include and exclude (with subfolders)', () => {
    expect(count(lens((l) => (l.folders.include = ['journal'])))).toBe(14);
    expect(count(lens((l) => (l.folders.exclude = ['journal'])))).toBe(25);
    expect(count(lens((l) => (l.folders.include = ['projects'])))).toBe(7);
    expect(count(lens((l) => (l.folders.include = [''])))).toBe(39);
  });

  it('date range on created or updated', () => {
    const l = lens((x) => {
      x.date = { field: 'created', from: Date.UTC(2025, 2, 1), to: Date.UTC(2025, 2, 31, 23, 59) };
    });
    expect([...applyLenses(g, l).notes].sort()).toEqual([
      'areas/health/running',
      'areas/health/sleep',
      'code samples',
      'journal/2025/2025-03-02',
    ]);
    const updatedFuture = lens((x) => (x.date = { field: 'updated', from: Date.UTC(2100, 0, 1) }));
    expect(count(updatedFuture)).toBe(0);
  });

  it('degree min/max', () => {
    expect(
      [
        ...applyLenses(
          g,
          lens((l) => (l.degree.min = 10)),
        ).notes,
      ]
        .filter((id) => g.notes.has(id))
        .sort(),
    ).toEqual(['projects/alpha/plan', 'welcome']);
    expect(count(lens((l) => (l.degree.max = 0)))).toBe(4);
  });

  it('orphan and ghost toggles', () => {
    expect(count(lens((l) => (l.showOrphans = false)))).toBe(35);
    const v = applyLenses(
      g,
      lens((l) => (l.showGhosts = false)),
    );
    expect(v.notes.size).toBe(39);
    expect(v.linkCount).toBe(54);
  });

  it('combines lenses and only keeps links with both ends visible', () => {
    const v = applyLenses(
      g,
      lens((l) => ((l.tags.include = ['project']), (l.folders.exclude = ['projects/alpha']))),
    );
    expect(v.noteCount).toBe(3);
    for (const id of v.links) {
      const link = g.links.find((x) => x.id === id);
      expect(v.notes.has(link?.source ?? '') && v.notes.has(link?.target ?? '')).toBe(true);
    }
    // Ghost "unknown project" stays visible because visible Gamma links to it.
    expect(v.notes.has('unknown project')).toBe(true);
    expect(v.notes.has('lessons learned')).toBe(false);
  });

  it('applies to the 5,000-note scale quickly', () => {
    const t = performance.now();
    for (let i = 0; i < 20; i++)
      applyLenses(
        g,
        lens((l) => (l.tags.include = ['project'])),
      );
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('neighbourhood', () => {
  it('1 and 2 hops in both directions, optionally within visible', () => {
    const one = neighbourhood(g, 'areas/health/sleep', 1);
    expect([...one].sort()).toEqual([
      'areas/health/running',
      'areas/health/sleep',
      'journal/2025/2025-07-04',
    ]);
    const two = neighbourhood(g, 'areas/health/sleep', 2);
    expect(two.has('areas/health/fitness log')).toBe(true);
    expect(two.has('areas/learning/gardening')).toBe(true);
    const limited = neighbourhood(
      g,
      'areas/health/sleep',
      1,
      new Set(['areas/health/sleep', 'areas/health/running']),
    );
    expect(limited.size).toBe(2);
  });
});

describe('URL hash state', () => {
  it('default lens encodes to an empty hash', () => {
    expect(lensToHash(defaultLens())).toBe('');
  });
  it('round-trips every field', () => {
    const l = lens((x) => {
      x.tags = { include: ['project', 'a b/c'], mode: 'all', exclude: ['journal'] };
      x.folders = { include: ['areas/health'], exclude: ['journal/2025'] };
      x.date = { field: 'created', from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 11, 31, 23, 59, 59, 999) };
      x.degree = { min: 1, max: 9 };
      x.showOrphans = false;
      x.showGhosts = false;
    });
    const hash = lensToHash(l, { n: 'projects/alpha/plan' });
    const back = hashToLens(hash);
    expect(back.lens).toEqual(l);
    expect(back.extra).toEqual({ n: 'projects/alpha/plan' });
  });
  it('ignores junk', () => {
    expect(hashToLens('#from=nope&dmin=-3&zzz=1').lens).toEqual(defaultLens());
  });
});
