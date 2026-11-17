/**
 * Writes a synthetic vault for performance tests.
 *
 *   node fixtures/generate-large-vault.ts --notes 5000 --links-per-note 4 --tags 60 --seed 1 [--out fixtures/large-vault]
 *
 * (Node 22.6+ runs .ts files directly with type stripping.)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function arg(name: string, fallback: number | string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v ?? String(fallback);
}

const notes = Number(arg('notes', 5000));
const linksPerNote = Number(arg('links-per-note', 4));
const tagCount = Number(arg('tags', 60));
const seed = Number(arg('seed', 1));
const out = arg('out', 'fixtures/large-vault');

// mulberry32: small deterministic PRNG
let s = seed >>> 0;
const rand = (): number => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T;

const WORDS = 'alpha beta gamma delta orbit garden river stone light thread map signal echo lantern harvest'.split(' ');
const FOLDERS = ['Projects', 'Projects/Archive', 'Areas', 'Areas/Health', 'Journal', 'Resources', 'Inbox', ''];
const tags = Array.from({ length: tagCount }, (_, i) => (i % 5 === 0 ? `topic${i}` : `topic${i - (i % 5)}/sub${i}`));

rmSync(out, { recursive: true, force: true });
const names = Array.from({ length: notes }, (_, i) => `Note ${String(i).padStart(5, '0')}`);
const start = Date.UTC(2023, 0, 1);
const span = 3 * 365 * 24 * 3600 * 1000;

names.forEach((name, i) => {
  const folder = pick(FOLDERS);
  const dir = join(out, folder);
  mkdirSync(dir, { recursive: true });
  const created = new Date(start + rand() * span).toISOString().slice(0, 10);
  const noteTags = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(tags));
  const links = Array.from({ length: linksPerNote }, () => {
    // Preferential attachment-ish: bias towards lower indexes so hubs emerge.
    const j = Math.floor(Math.pow(rand(), 2) * notes);
    return j === i ? `Missing ${j}` : names[j];
  });
  const body = Array.from({ length: 40 + Math.floor(rand() * 400) }, () => pick(WORDS)).join(' ');
  writeFileSync(
    join(dir, `${name}.md`),
    `---\ntags: [${[...new Set(noteTags)].join(', ')}]\ncreated: ${created}\n---\n# ${name}\n\n${body}\n\n${links
      .map((l) => `[[${l}]]`)
      .join(' ')}\n`,
  );
});
console.log(`wrote ${notes} notes (~${notes * linksPerNote} links) to ${out}`);
