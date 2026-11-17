import { parse as parseYaml } from 'yaml';

export interface FrontmatterResult {
  data: Record<string, unknown>;
  warning?: string;
}

/** Parses YAML frontmatter. Invalid YAML yields a warning and empty data, never a throw. */
export function parseFrontmatter(yamlText: string): FrontmatterResult {
  if (!yamlText.trim()) return { data: {} };
  try {
    const data: unknown = parseYaml(yamlText);
    if (data === null || data === undefined) return { data: {} };
    if (typeof data !== 'object' || Array.isArray(data)) {
      return { data: {}, warning: 'Frontmatter is not a key/value map' };
    }
    return { data: data as Record<string, unknown> };
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
    return { data: {}, warning: `Invalid YAML frontmatter: ${msg}` };
  }
}

/** Reads a string-or-list field: "a, b", "a b", ["a", "b"]. */
export function stringList(value: unknown, splitter: RegExp = /,/): string[] {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((v) => (typeof v === 'string' ? v.split(splitter) : typeof v === 'number' ? [String(v)] : []))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\/+$/, '').toLowerCase();
}

export function frontmatterTags(data: Record<string, unknown>): string[] {
  return stringList(data.tags ?? data.tag, /[,\s]+/)
    .map(normalizeTag)
    .filter((t) => t && /\D/.test(t));
}

export function frontmatterAliases(data: Record<string, unknown>): string[] {
  return stringList(data.aliases ?? data.alias);
}

export function frontmatterDate(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const t = typeof value === 'number' ? value : Date.parse(value);
    if (Number.isFinite(t)) return t;
  }
  return undefined;
}
