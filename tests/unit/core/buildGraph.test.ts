import { allFixturePaths, expected, fixtureGraph, parseFixture } from './loadFixture';
import { isIncludedNotePath } from '../../../src/core/parse/paths';
import { orphans } from '../../../src/core/graph/metrics';
import { deserializeGraph, serializeGraph } from '../../../src/core/graph/serialize';

describe('fixture vault matches EXPECTED.json', () => {
  const g = fixtureGraph();
  const parsed = parseFixture();

  it('skips the expected files', () => {
    const skipped = allFixturePaths().filter((p) => p !== 'EXPECTED.json' && !isIncludedNotePath(p));
    expect(skipped.sort()).toEqual([...expected.skipped].sort());
  });

  it('counts notes, links by kind, resolved and ghosts', () => {
    expect(g.stats.noteCount).toBe(expected.notes);
    expect(g.stats.linkCount).toBe(expected.links.total);
    const byKind = (k: string) => g.links.filter((l) => l.kind === k).length;
    expect({ wikilink: byKind('wikilink'), markdown: byKind('markdown'), embed: byKind('embed') }).toEqual({
      wikilink: expected.links.wikilink,
      markdown: expected.links.markdown,
      embed: expected.links.embed,
    });
    expect(g.links.filter((l) => l.resolved)).toHaveLength(expected.resolved);
    expect(g.links.filter((l) => !l.resolved)).toHaveLength(expected.unresolved);
    expect([...g.ghosts].sort()).toEqual(expected.ghosts);
    expect(g.stats.ghostCount).toBe(expected.ghosts.length);
  });

  it('counts tags, orphans, folders and warnings', () => {
    expect(g.stats.tagCount).toBe(expected.tags);
    expect(orphans(g)).toEqual(expected.orphans);
    expect(g.stats.orphanCount).toBe(expected.orphans.length);
    expect(g.folders.size).toBe(expected.folders);
    expect(parsed.flatMap((p) => p.warnings)).toHaveLength(expected.warnings);
  });

  it('never extracts tags or ghosts from code, URLs, skipped files or broken YAML', () => {
    for (const t of expected.mustNotContainTags) expect(g.tags.has(t), t).toBe(false);
    for (const gh of expected.mustNotContainGhosts) expect(g.ghosts.has(gh), gh).toBe(false);
  });

  it('resolves every documented case', () => {
    for (const r of expected.resolutions) {
      const out = g.outLinks.get(r.source) ?? [];
      const hit = out.find(
        (l) =>
          l.target === r.target &&
          (r.kind ? l.kind === r.kind : true) &&
          (r.heading ? l.heading === r.heading : true) &&
          (r.alias ? l.alias === r.alias : true),
      );
      expect(hit, `${r.rule}: ${r.source} → ${r.raw}`).toBeDefined();
      expect(hit?.resolved).toBe(true);
    }
  });

  it('derives titles, word counts and created dates', () => {
    for (const [id, title] of Object.entries(expected.titles)) expect(g.notes.get(id)?.title).toBe(title);
    for (const [id, wc] of Object.entries(expected.wordCount)) expect(g.notes.get(id)?.wordCount).toBe(wc);
    expect(g.notes.get('resources/long essay')?.wordCount).toBeGreaterThan(2500);
    const fmCreated = parsed
      .filter((p) => p.note.frontmatter.created ?? p.note.frontmatter.date)
      .map((p) => p.note.created);
    const [lo, hi] = expected.frontmatterCreatedRange.map((d) => Date.parse(d));
    expect(Math.min(...fmCreated)).toBe(lo);
    expect(Math.max(...fmCreated)).toBe(hi);
  });

  it('counts duplicate link occurrences and gives each a unique id', () => {
    const fitness = g.outLinks.get('areas/health/fitness log') ?? [];
    expect(fitness.map((l) => l.id)).toEqual([
      'areas/health/fitness log->areas/health/running#0',
      'areas/health/fitness log->areas/health/running#1',
    ]);
    expect(new Set(g.links.map((l) => l.id)).size).toBe(g.links.length);
  });

  it('materializes nested tag parents and co-occurrence', () => {
    expect(g.tags.get('project/alpha')?.parent).toBe('project');
    expect(g.tags.get('project')?.noteIds).toEqual(['projects/alpha/plan', 'projects/beta overview']);
    expect(g.tagCooccurrence.get('meeting|project/alpha')).toBe(1);
    expect(g.tagCooccurrence.get('health|food')).toBeUndefined();
    expect(g.tagCooccurrence.get('food|health')).toBe(1);
  });

  it('snapshot of graph counts', () => {
    expect({
      notes: g.stats.noteCount,
      links: g.stats.linkCount,
      tags: g.stats.tagCount,
      ghosts: g.stats.ghostCount,
      orphans: g.stats.orphanCount,
      folders: [...g.folders.keys()].sort(),
    }).toMatchSnapshot();
  });

  it('serializes and round-trips', () => {
    const json = JSON.parse(JSON.stringify(serializeGraph(g)));
    const back = deserializeGraph(json);
    expect(back.notes).toEqual(g.notes);
    expect(back.links).toEqual(g.links);
    expect(back.ghosts).toEqual(g.ghosts);
    expect(back.tags).toEqual(g.tags);
    expect(back.folders).toEqual(g.folders);
    expect(back.tagCooccurrence).toEqual(g.tagCooccurrence);
    expect(back.inLinks.get('welcome')?.length).toBe(g.inLinks.get('welcome')?.length);
    expect(back.stats).toEqual(g.stats);
  });
});
