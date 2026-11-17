import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import type { Nodes, Root } from 'mdast';
import type { ParsedNote, RawLink } from '../model';
import { frontmatterAliases, frontmatterDate, frontmatterTags, parseFrontmatter } from './frontmatter';
import { blankRanges, extractWikilinks, type FoundLink } from './remarkWikilinks';
import { extractTags } from './remarkTags';
import { countWords } from './wordCount';
import { ATTACHMENT_EXT, basename, folderOf, NOTE_EXT, noteIdFromPath, normalizePath } from './paths';

// No remark-gfm here: extraction does not need it and it doubles parse time (see docs/DECISIONS.md).
const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);

/** Node types whose whole source range is excluded from tag/wikilink scanning. */
const MASKED = new Set([
  'code',
  'inlineCode',
  'yaml',
  'html',
  'image',
  'imageReference',
  'definition',
  'math',
  'inlineMath',
]);

export interface RawFileInput {
  path: string;
  text: string;
  lastModified: number;
}

function nodeText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string' && node.type !== 'yaml' && node.type !== 'html') {
    return node.value;
  }
  if ('children' in node) return (node.children as Nodes[]).map(nodeText).join('');
  return '';
}

const start = (n: Nodes): number => n.position?.start.offset ?? 0;
const end = (n: Nodes): number => n.position?.end.offset ?? 0;

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

function markdownTarget(url: string): RawLink | undefined {
  if (!url || url.startsWith('#') || EXTERNAL.test(url)) return undefined;
  const [pathPart = '', ...rest] = url.split('#');
  const path = pathPart.split('?')[0] ?? '';
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* keep raw */
  }
  if (!decoded || ATTACHMENT_EXT.test(decoded)) return undefined;
  if (/\.[a-z0-9]{1,8}$/i.test(decoded) && !NOTE_EXT.test(decoded)) return undefined;
  const heading = rest.length ? decodeSafe(rest.join('#')) : undefined;
  return { kind: 'markdown', target: decoded, ...(heading ? { heading } : {}) };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Parses one markdown file into a Note plus its raw (unresolved) links. Never throws on bad input. */
export function parseNote(file: RawFileInput): ParsedNote {
  const path = normalizePath(file.path);
  const id = noteIdFromPath(path);
  const text = file.text.replace(/^\uFEFF/, '');
  const warnings: string[] = [];
  const tree = processor.parse(text) as Root;

  let frontmatter: Record<string, unknown> = {};
  const mask: [number, number][] = [];
  const mdLinks: FoundLink[] = [];
  const headings: { depth: number; text: string }[] = [];
  const textParts: string[] = [];
  let firstH1: string | undefined;

  const walk = (node: Nodes): void => {
    if (node.type === 'yaml') {
      const fm = parseFrontmatter(node.value);
      frontmatter = fm.data;
      if (fm.warning) warnings.push(`${path}: ${fm.warning}`);
    }
    if (MASKED.has(node.type)) {
      mask.push([start(node), end(node)]);
      return;
    }
    if (node.type === 'link') {
      const isAutolink = text[start(node)] !== '[';
      const last = node.children[node.children.length - 1];
      mask.push([isAutolink || !last ? start(node) : end(last), end(node)]);
      if (!isAutolink) {
        const target = markdownTarget(node.url);
        if (target) mdLinks.push({ ...target, offset: start(node), length: end(node) - start(node) });
      }
    }
    if (node.type === 'heading') {
      const t = nodeText(node).trim();
      headings.push({ depth: node.depth, text: t });
      if (node.depth === 1 && firstH1 === undefined) firstH1 = t;
    }
    if (node.type === 'text') textParts.push(node.value);
    if ('children' in node) for (const child of node.children as Nodes[]) walk(child);
  };
  walk(tree);

  // Build a copy of the source with masked regions blanked (offsets preserved).
  mask.sort((a, b) => a[0] - b[0]);
  let masked = '';
  let pos = 0;
  for (const [s, e] of mask) {
    if (e <= pos) continue;
    const from = Math.max(s, pos);
    masked += text.slice(pos, from) + text.slice(from, e).replace(/[^\n]/g, ' ');
    pos = e;
  }
  masked += text.slice(pos);

  const { links: wikilinks, ranges: wikiRanges } = extractWikilinks(masked);
  const inlineTags = extractTags(blankRanges(masked, wikiRanges));
  const links = [...wikilinks, ...mdLinks].sort((a, b) => a.offset - b.offset);
  const rawLinks: RawLink[] = links.map(({ offset: _o, length: _l, ...rest }) => rest);

  const plain = textParts.join(' ').replace(/\s+/g, ' ').trim();
  const fmTitle = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : '';
  const tags = [...new Set([...frontmatterTags(frontmatter), ...inlineTags])];
  const created =
    frontmatterDate(frontmatter.created) ?? frontmatterDate(frontmatter.date) ?? file.lastModified;
  const updated = frontmatterDate(frontmatter.updated) ?? file.lastModified;

  return {
    note: {
      id,
      path,
      title: fmTitle || firstH1 || basename(path).replace(NOTE_EXT, ''),
      folder: folderOf(id),
      aliases: frontmatterAliases(frontmatter),
      tags,
      frontmatter,
      headings,
      wordCount: countWords(plain),
      charCount: plain.length,
      created,
      updated,
      excerpt: plain.length > 240 ? `${plain.slice(0, 239).trimEnd()}…` : plain,
    },
    rawLinks,
    warnings,
  };
}
