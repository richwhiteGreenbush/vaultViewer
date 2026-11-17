import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseNote } from '../../../src/core/parse/parseNote';
import { isIncludedNotePath } from '../../../src/core/parse/paths';
import { buildGraph } from '../../../src/core/graph/buildGraph';
import type { ParsedNote } from '../../../src/core/model';

export const FIXTURE = resolve(process.cwd(), 'fixtures/sample-vault');

export interface Expected {
  notes: number;
  links: { total: number; wikilink: number; markdown: number; embed: number };
  resolved: number;
  unresolved: number;
  ghosts: string[];
  tags: number;
  orphans: string[];
  folders: number;
  warnings: number;
  skipped: string[];
  mustNotContainTags: string[];
  mustNotContainGhosts: string[];
  resolutions: {
    source: string;
    raw: string;
    target: string;
    heading?: string;
    alias?: string;
    kind?: string;
    rule: string;
  }[];
  titles: Record<string, string>;
  wordCount: Record<string, number>;
  frontmatterCreatedRange: [string, string];
}

export const expected = JSON.parse(readFileSync(join(FIXTURE, 'EXPECTED.json'), 'utf8')) as Expected;

export function allFixturePaths(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(FIXTURE, full).split('\\').join('/'));
    }
  })(FIXTURE);
  return out.sort();
}

export function parseFixture(): ParsedNote[] {
  return allFixturePaths()
    .filter((p) => isIncludedNotePath(p))
    .map((path) =>
      parseNote({
        path,
        text: readFileSync(join(FIXTURE, path), 'utf8'),
        lastModified: statSync(join(FIXTURE, path)).mtimeMs,
      }),
    );
}

export const fixtureGraph = () => buildGraph(parseFixture(), 'sample-vault');

export const md = (text: string, path = 'Note.md') =>
  parseNote({ path, text, lastModified: 1_700_000_000_000 });
