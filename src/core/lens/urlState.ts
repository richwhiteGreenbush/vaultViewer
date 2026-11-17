import { defaultLens, type LensState } from './applyLenses';

/** Compact URL-hash encoding of a LensState. Only non-default fields are written. */
const DAY = 86_400_000;
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fromDay = (s: string | null, endOfDay = false): number | undefined => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) ? t + (endOfDay ? DAY - 1 : 0) : undefined;
};
const list = (s: string | null) => (s ? s.split(',').map(decodeURIComponent).filter(Boolean) : []);
const enc = (xs: string[]) => xs.map((x) => encodeURIComponent(x)).join(',');
const int = (s: string | null) => (s !== null && /^\d+$/.test(s) ? Number(s) : undefined);

export function lensToHash(l: LensState, extra: Record<string, string> = {}): string {
  const p: string[] = [];
  const add = (k: string, v: string) => p.push(`${k}=${v}`);
  if (l.tags.include.length) add('t', enc(l.tags.include));
  if (l.tags.mode === 'all') add('tm', 'all');
  if (l.tags.exclude.length) add('tx', enc(l.tags.exclude));
  if (l.folders.include.length) add('f', enc(l.folders.include));
  if (l.folders.exclude.length) add('fx', enc(l.folders.exclude));
  if (l.date.from !== undefined || l.date.to !== undefined) add('d', l.date.field);
  if (l.date.from !== undefined) add('from', toDay(l.date.from));
  if (l.date.to !== undefined) add('to', toDay(l.date.to));
  if (l.degree.min !== undefined) add('dmin', String(l.degree.min));
  if (l.degree.max !== undefined) add('dmax', String(l.degree.max));
  if (!l.showOrphans) add('o', '0');
  if (!l.showGhosts) add('g', '0');
  if (l.showAttachments) add('a', '1');
  for (const [k, v] of Object.entries(extra)) add(k, encodeURIComponent(v));
  return p.length ? `#${p.join('&')}` : '';
}

export function hashToLens(hash: string): { lens: LensState; extra: Record<string, string> } {
  const raw = hash.replace(/^#/, '');
  const get = (k: string): string | null => {
    for (const part of raw.split('&')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i) === k) return part.slice(i + 1);
    }
    return null;
  };
  const l = defaultLens();
  l.tags.include = list(get('t')).map((t) => t.toLowerCase());
  l.tags.mode = get('tm') === 'all' ? 'all' : 'any';
  l.tags.exclude = list(get('tx')).map((t) => t.toLowerCase());
  l.folders.include = list(get('f'));
  l.folders.exclude = list(get('fx'));
  l.date.field = get('d') === 'created' ? 'created' : 'updated';
  const from = fromDay(get('from'));
  const to = fromDay(get('to'), true);
  if (from !== undefined) l.date.from = from;
  if (to !== undefined) l.date.to = to;
  const dmin = int(get('dmin'));
  const dmax = int(get('dmax'));
  if (dmin !== undefined) l.degree.min = dmin;
  if (dmax !== undefined) l.degree.max = dmax;
  l.showOrphans = get('o') !== '0';
  l.showGhosts = get('g') !== '0';
  l.showAttachments = get('a') === '1';
  const extra: Record<string, string> = {};
  for (const k of ['n', 'v']) {
    const v = get(k);
    if (v !== null) extra[k] = decodeURIComponent(v);
  }
  return { lens: l, extra };
}
