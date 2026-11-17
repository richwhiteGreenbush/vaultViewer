import { normalizeTag } from './frontmatter';

/**
 * Inline #tags. A tag must not follow a word character or URL-ish punctuation (so `C#`, `page#frag`
 * and `##` headings are skipped), may contain letters, digits, `_`, `-` and `/`, and must contain at least
 * one non-digit (`#123` is not a tag).
 */
const TAG = /(?<![\p{L}\p{N}_&#/\])`'"=:.\\-])#([\p{L}\p{N}_\-/]+)/gu;

export function extractTags(masked: string): string[] {
  const out = new Set<string>();
  for (const m of masked.matchAll(TAG)) {
    const tag = normalizeTag(m[1] ?? '');
    if (tag && /[^\d/]/.test(tag)) out.add(tag);
  }
  return [...out];
}
