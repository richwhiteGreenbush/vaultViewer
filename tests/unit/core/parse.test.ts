import { md } from './loadFixture';
import { isIncludedNotePath, noteIdFromPath, normalizePath } from '../../../src/core/parse/paths';
import { splitWikilink } from '../../../src/core/parse/remarkWikilinks';
import { parseFrontmatter, stringList } from '../../../src/core/parse/frontmatter';

describe('§4.2 files', () => {
  it('includes .md and .markdown, skips other extensions', () => {
    expect(isIncludedNotePath('a/b.md')).toBe(true);
    expect(isIncludedNotePath('a/b.markdown')).toBe(true);
    expect(isIncludedNotePath('a/b.MD')).toBe(true);
    expect(isIncludedNotePath('a/b.txt')).toBe(false);
    expect(isIncludedNotePath('a/b.png')).toBe(false);
  });
  it('skips dot-folders and dot-files', () => {
    expect(isIncludedNotePath('.obsidian/x.md')).toBe(false);
    expect(isIncludedNotePath('a/.git/x.md')).toBe(false);
    expect(isIncludedNotePath('.trash/x.md')).toBe(false);
    expect(isIncludedNotePath('a/.hidden.md')).toBe(false);
  });
  it('skips the default ignore list and a custom one, case-insensitively', () => {
    expect(isIncludedNotePath('templates/Daily.md')).toBe(false);
    expect(isIncludedNotePath('x/node_modules/y.md')).toBe(false);
    expect(isIncludedNotePath('Templates/Daily.md')).toBe(false);
    expect(isIncludedNotePath('templates/Daily.md', [])).toBe(true);
    expect(isIncludedNotePath('Archive/a.md', ['archive'])).toBe(false);
    // a *file* named like an ignored folder is fine
    expect(isIncludedNotePath('templates.md')).toBe(true);
  });
  it('builds ids: lowercase, no extension, normalized slashes', () => {
    expect(noteIdFromPath('Projects\\Alpha/./Plan.md')).toBe('projects/alpha/plan');
    expect(noteIdFromPath('Resources/Snippets.markdown')).toBe('resources/snippets');
    expect(normalizePath('a/b/../c')).toBe('a/c');
  });
});

describe('§4.2 frontmatter', () => {
  it('reads tags as a list', () => {
    expect(md('---\ntags: [A, b/C]\n---\n').note.tags).toEqual(['a', 'b/c']);
    expect(md('---\ntags:\n  - one\n  - two\n---\n').note.tags).toEqual(['one', 'two']);
  });
  it('reads tags as a string and as a comma string, stripping #', () => {
    expect(md('---\ntags: solo\n---\n').note.tags).toEqual(['solo']);
    expect(md('---\ntags: "a, #b,c"\n---\n').note.tags).toEqual(['a', 'b', 'c']);
  });
  it('reads title and aliases (string or list)', () => {
    const p = md('---\ntitle: Hello\naliases: [X, Y]\n---\n# H1\n');
    expect(p.note.title).toBe('Hello');
    expect(p.note.aliases).toEqual(['X', 'Y']);
    expect(md('---\naliases: Only\n---\n').note.aliases).toEqual(['Only']);
  });
  it('reads created, falls back to date, then to lastModified; updated from frontmatter or mtime', () => {
    expect(md('---\ncreated: 2025-01-05\n---\n').note.created).toBe(Date.UTC(2025, 0, 5));
    expect(md('---\ndate: 2025-02-01\n---\n').note.created).toBe(Date.UTC(2025, 1, 1));
    expect(md('---\ncreated: not a date\n---\n').note.created).toBe(1_700_000_000_000);
    expect(md('hi').note.updated).toBe(1_700_000_000_000);
    expect(md('---\nupdated: 2026-01-01\n---\n').note.updated).toBe(Date.UTC(2026, 0, 1));
  });
  it('malformed YAML warns and does not stop the parse', () => {
    const p = md('---\ntitle: X\ntags: [a, broken\n---\n# Real Title\n[[Link]] #ok\n', 'B.md');
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toMatch(/B\.md: Invalid YAML/);
    expect(p.note.frontmatter).toEqual({});
    expect(p.note.title).toBe('Real Title');
    expect(p.note.tags).toEqual(['ok']);
    expect(p.rawLinks).toHaveLength(1);
  });
  it('non-map YAML is a warning, empty YAML is fine', () => {
    expect(parseFrontmatter('- a\n- b').warning).toMatch(/not a key\/value/);
    expect(parseFrontmatter('').warning).toBeUndefined();
    expect(stringList(['a', 3, null])).toEqual(['a', '3']);
  });
});

describe('§4.2 inline tags', () => {
  const tags = (s: string) => md(s).note.tags;
  it('extracts #tag, #nested/tag and #tag-with_dashes, lowercased', () => {
    expect(tags('a #Tag and #nested/Tag and #tag-with_dashes.')).toEqual([
      'tag',
      'nested/tag',
      'tag-with_dashes',
    ]);
  });
  it('ignores tags in inline code and fenced code', () => {
    expect(tags('`#code` text\n\n```\n#fenced\n```\n\n    #indented\n')).toEqual([]);
  });
  it('ignores URL fragments (autolinks, bare URLs and link targets)', () => {
    expect(tags('see https://x.com/p#frag and [d](https://x.com/d#sec) and www.x.com/a#b')).toEqual([]);
  });
  it('does not treat headings or C# as tags', () => {
    expect(tags('# Title\n\n## Sub\n\nC# rocks')).toEqual([]);
  });
  it('requires a non-digit', () => {
    expect(tags('#123 #2025 #v2 #2025/q1')).toEqual(['v2', '2025/q1']);
  });
  it('does not read #Heading inside a wikilink as a tag', () => {
    expect(tags('[[Note#Heading]] [[#Local]]')).toEqual([]);
  });
  it('unions and deduplicates frontmatter and inline tags', () => {
    expect(tags('---\ntags: [a, b]\n---\n#b #c')).toEqual(['a', 'b', 'c']);
  });
});

describe('§4.2 wikilinks', () => {
  const links = (s: string) => md(s).rawLinks;
  it('parses every form', () => {
    expect(links('[[T]] [[T|Al]] [[T#H]] [[T#H|Al]] ![[E]]')).toEqual([
      { kind: 'wikilink', target: 'T' },
      { kind: 'wikilink', target: 'T', alias: 'Al' },
      { kind: 'wikilink', target: 'T', heading: 'H' },
      { kind: 'wikilink', target: 'T', heading: 'H', alias: 'Al' },
      { kind: 'embed', target: 'E' },
    ]);
  });
  it('ignores wikilinks inside code', () => {
    expect(links('`[[A]]`\n\n```\n[[B]]\n```\n')).toEqual([]);
  });
  it('ignores attachment embeds and same-note anchors', () => {
    expect(links('![[pic.png]] [[doc.pdf]] [[#Local]]')).toEqual([]);
  });
  it('handles escaped pipes from tables', () => {
    expect(splitWikilink('T\\|Alias')).toEqual({ target: 'T', alias: 'Alias' });
    expect(links('| a | b |\n|---|---|\n| [[T\\|Al]] | x |\n')).toEqual([
      { kind: 'wikilink', target: 'T', alias: 'Al' },
    ]);
  });
  it('keeps document order across wikilinks and markdown links', () => {
    expect(links('[a](a.md) [[B]] [c](c.md)').map((l) => l.target)).toEqual(['a.md', 'B', 'c.md']);
  });
});

describe('§4.2 markdown links', () => {
  const links = (s: string) => md(s).rawLinks;
  it('keeps relative links with and without .md, url-decoded, with heading', () => {
    expect(links('[a](rel/path.md) [b](rel/path) [c](My%20Note.md#Some%20Head)')).toEqual([
      { kind: 'markdown', target: 'rel/path.md' },
      { kind: 'markdown', target: 'rel/path' },
      { kind: 'markdown', target: 'My Note.md', heading: 'Some Head' },
    ]);
  });
  it('ignores http(s), mailto, anchors-only, images and non-note files', () => {
    expect(
      links(
        '[a](https://x.com) [b](http://x) [c](mailto:a@b.c) [d](#anchor) ![i](i.png) [p](f.pdf) <https://auto.link>',
      ),
    ).toEqual([]);
  });
});

describe('§4.2 word count and derived fields', () => {
  it('counts words in text only, excluding frontmatter and code', () => {
    const p = md(
      '---\ntitle: one two three\n---\n# Head line\n\nalpha beta `gamma`\n\n```\ndelta epsilon\n```\n',
    );
    expect(p.note.wordCount).toBe(4); // Head line alpha beta
  });
  it('an empty note has zero words and filename title', () => {
    const p = md('', 'Folder/Empty Note.md');
    expect(p.note.wordCount).toBe(0);
    expect(p.note.title).toBe('Empty Note');
    expect(p.note.folder).toBe('folder');
  });
  it('title prefers frontmatter, then first H1, then filename', () => {
    expect(md('## Not h1\n# First\n# Second').note.title).toBe('First');
  });
  it('collects headings and a bounded excerpt', () => {
    const p = md(`# A\n\n## B\n\n${'word '.repeat(100)}`);
    expect(p.note.headings).toEqual([
      { depth: 1, text: 'A' },
      { depth: 2, text: 'B' },
    ]);
    expect(p.note.excerpt.length).toBeLessThanOrEqual(240);
  });
});
