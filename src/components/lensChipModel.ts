import { strings } from '../strings';
import type { LensState } from '../core/lens/applyLenses';

export interface Chip {
  key: string;
  label: string;
  remove(l: LensState): void;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function lensChips(l: LensState): Chip[] {
  const chips: Chip[] = [];
  for (const t of l.tags.include) {
    chips.push({
      key: `t:${t}`,
      label: `#${t}`,
      remove: (x) => (x.tags.include = x.tags.include.filter((y) => y !== t)),
    });
  }
  if (l.tags.include.length > 1 && l.tags.mode === 'all') {
    chips.push({ key: 'tm', label: strings.lens.chipAllTags, remove: (x) => (x.tags.mode = 'any') });
  }
  for (const t of l.tags.exclude) {
    chips.push({
      key: `tx:${t}`,
      label: `−#${t}`,
      remove: (x) => (x.tags.exclude = x.tags.exclude.filter((y) => y !== t)),
    });
  }
  for (const f of l.folders.include) {
    chips.push({
      key: `f:${f}`,
      label: strings.lens.chipFolder(f),
      remove: (x) => (x.folders.include = x.folders.include.filter((y) => y !== f)),
    });
  }
  for (const f of l.folders.exclude) {
    chips.push({
      key: `fx:${f}`,
      label: `−${strings.lens.chipFolder(f)}`,
      remove: (x) => (x.folders.exclude = x.folders.exclude.filter((y) => y !== f)),
    });
  }
  if (l.date.from !== undefined || l.date.to !== undefined) {
    chips.push({
      key: 'date',
      label: strings.lens.chipDate(
        l.date.field,
        l.date.from !== undefined ? day(l.date.from) : '…',
        l.date.to !== undefined ? day(l.date.to) : '…',
      ),
      remove: (x) => (x.date = { field: x.date.field }),
    });
  }
  if (l.degree.min !== undefined || l.degree.max !== undefined) {
    chips.push({
      key: 'deg',
      label: strings.lens.chipDegree(l.degree.min, l.degree.max),
      remove: (x) => (x.degree = {}),
    });
  }
  if (!l.showOrphans)
    chips.push({ key: 'o', label: strings.lens.chipNoOrphans, remove: (x) => (x.showOrphans = true) });
  if (!l.showGhosts)
    chips.push({ key: 'g', label: strings.lens.chipNoGhosts, remove: (x) => (x.showGhosts = true) });
  return chips;
}
