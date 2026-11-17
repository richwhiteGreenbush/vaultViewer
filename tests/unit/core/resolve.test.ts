import { LinkResolver } from '../../../src/core/graph/resolve';
import type { Note, RawLink } from '../../../src/core/model';

const note = (id: string, aliases: string[] = []): Note => ({
  id,
  path: `${id}.md`,
  title: id,
  folder: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '',
  aliases,
  tags: [],
  frontmatter: {},
  headings: [],
  wordCount: 0,
  charCount: 0,
  created: 0,
  updated: 0,
  excerpt: '',
});
const r = new LinkResolver([
  note('projects/alpha/plan', ['Alpha Roadmap']),
  note('projects/alpha/meeting'),
  note('journal/meeting'),
  note('zeta/archive/meeting'),
  note('areas/health/recipes/lentil soup'),
  note('welcome'),
  note('unique/deep/thing'),
]);
const wl = (target: string): RawLink => ({ kind: 'wikilink', target });
const mdl = (target: string): RawLink => ({ kind: 'markdown', target });

describe('§4.3 link resolution', () => {
  it('1. exact vault-relative path, with or without .md, case-insensitive', () => {
    expect(r.resolve(wl('Projects/Alpha/Plan'), 'welcome')).toEqual({
      target: 'projects/alpha/plan',
      resolved: true,
    });
    expect(r.resolve(wl('projects/ALPHA/plan.md'), 'welcome').target).toBe('projects/alpha/plan');
  });
  it('2. path relative to the source note folder', () => {
    expect(r.resolve(wl('Recipes/Lentil Soup'), 'areas/health/nutrition').target).toBe(
      'areas/health/recipes/lentil soup',
    );
    expect(r.resolve(wl('../alpha/Plan'), 'projects/beta/x').target).toBe('projects/alpha/plan');
  });
  it('2b. relative match beats a duplicate basename elsewhere', () => {
    expect(r.resolve(wl('Meeting'), 'projects/alpha/plan').target).toBe('projects/alpha/meeting');
  });
  it('3. unique basename (or trailing sub-path) anywhere', () => {
    expect(r.resolve(wl('Thing'), 'welcome').target).toBe('unique/deep/thing');
    expect(r.resolve(wl('deep/thing'), 'welcome').target).toBe('unique/deep/thing');
  });
  it('4. alias match', () => {
    expect(r.resolve(wl('alpha roadmap'), 'welcome')).toEqual({
      target: 'projects/alpha/plan',
      resolved: true,
    });
  });
  it('5. several basename matches → shortest path, then alphabetical', () => {
    expect(r.resolve(wl('Meeting'), 'welcome').target).toBe('journal/meeting');
    const tie = new LinkResolver([note('b/x'), note('a/x')]);
    expect(tie.resolve(wl('x'), '').target).toBe('a/x');
  });
  it('6. otherwise unresolved, target becomes the normalized ghost id', () => {
    expect(r.resolve(wl('No Such Note.md'), 'welcome')).toEqual({ target: 'no such note', resolved: false });
  });
  it('markdown links resolve relative to the note, then from the root', () => {
    expect(r.resolve(mdl('../alpha/meeting.md'), 'projects/beta/x').target).toBe('projects/alpha/meeting');
    expect(r.resolve(mdl('Projects/Alpha/Plan.md'), 'welcome').resolved).toBe(true);
    expect(r.resolve(mdl('Meeting.md'), 'welcome').resolved).toBe(false); // no basename search for paths
  });
});
