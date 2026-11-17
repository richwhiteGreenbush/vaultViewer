import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('fixture vault', () => {
  it('has an EXPECTED.json with internally consistent link counts', () => {
    const expected = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/sample-vault/EXPECTED.json'), 'utf8'),
    ) as {
      links: { total: number; wikilink: number; markdown: number; embed: number };
      resolved: number;
      unresolved: number;
    };
    const { total, wikilink, markdown, embed } = expected.links;
    expect(wikilink + markdown + embed).toBe(total);
    expect(expected.resolved + expected.unresolved).toBe(total);
  });
});
