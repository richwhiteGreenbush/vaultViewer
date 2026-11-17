import { fixtureGraph } from './core/loadFixture';
import { graphJson } from '../../src/export/exporters';
import { deserializeGraph } from '../../src/core/graph/serialize';

describe('graph.json export', () => {
  const g = fixtureGraph();
  const json = JSON.parse(JSON.stringify(graphJson(g)));

  it('round-trips through deserializeGraph', () => {
    const back = deserializeGraph(json);
    expect(back.stats).toEqual(g.stats);
    expect(back.links).toEqual(g.links);
    expect([...back.notes.keys()]).toEqual([...g.notes.keys()]);
    expect(back.tags).toEqual(g.tags);
    expect(back.inLinks.get('welcome')?.length).toBe(g.inLinks.get('welcome')?.length);
  });

  it('contains no note text', () => {
    expect([...deserializeGraph(json).notes.values()].every((n) => n.excerpt === '')).toBe(true);
    expect(JSON.stringify(json)).not.toContain('Endpoints follow the');
    expect(g.notes.get('projects/alpha/specs')?.excerpt).toContain('Endpoints follow the'); // the source had it
  });
});
