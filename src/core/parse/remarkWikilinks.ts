import type { RawLink } from '../model';
import { ATTACHMENT_EXT } from './paths';

const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;

export interface FoundLink extends RawLink {
  offset: number;
  length: number;
}

/** Splits "Target#Heading|Alias" (with `\|` escapes from tables) into parts. */
export function splitWikilink(inner: string): { target: string; heading?: string; alias?: string } {
  const text = inner.replace(/\\\|/g, '|');
  const pipe = text.indexOf('|');
  const ref = pipe >= 0 ? text.slice(0, pipe) : text;
  const alias = pipe >= 0 ? text.slice(pipe + 1).trim() : undefined;
  const hash = ref.indexOf('#');
  const target = (hash >= 0 ? ref.slice(0, hash) : ref).trim();
  const heading = hash >= 0 ? ref.slice(hash + 1).trim() : undefined;
  return { target, ...(heading ? { heading } : {}), ...(alias ? { alias } : {}) };
}

/**
 * Finds [[wikilinks]] and ![[embeds]] in source text whose code/URL regions are already masked out.
 * Same-note anchors ([[#Heading]]) and links to attachments (images, PDFs…) are skipped.
 */
export function extractWikilinks(masked: string): {
  links: FoundLink[];
  ranges: { offset: number; length: number }[];
} {
  const out: FoundLink[] = [];
  const ranges: { offset: number; length: number }[] = [];
  for (const m of masked.matchAll(WIKILINK)) {
    ranges.push({ offset: m.index, length: m[0].length });
    const { target, heading, alias } = splitWikilink(m[2] ?? '');
    if (!target || ATTACHMENT_EXT.test(target)) continue;
    out.push({
      kind: m[1] ? 'embed' : 'wikilink',
      target,
      ...(heading ? { heading } : {}),
      ...(alias ? { alias } : {}),
      offset: m.index,
      length: m[0].length,
    });
  }
  return { links: out, ranges };
}

/** Replaces each found wikilink with spaces so tag extraction does not see `[[Note#Heading]]`. */
export function blankRanges(text: string, ranges: { offset: number; length: number }[]): string {
  if (!ranges.length) return text;
  let out = '';
  let pos = 0;
  for (const r of ranges) {
    out += text.slice(pos, r.offset) + ' '.repeat(r.length);
    pos = r.offset + r.length;
  }
  return out + text.slice(pos);
}
