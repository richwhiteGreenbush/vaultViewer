import type { VaultGraph } from '../core/model';
import type { ThemePalette } from '../core/color/palettes';
import { serializeGraph, type SerializedGraph } from '../core/graph/serialize';
import { paintBackground } from './background';
import { activeViewInstance } from '../views/active';
import { strings } from '../strings';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'vault';

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/** graph.json: the serialized VaultGraph without note text (excerpts are cleared too). */
export function graphJson(graph: VaultGraph): SerializedGraph {
  const s = serializeGraph(graph);
  return { ...s, notes: s.notes.map((n) => ({ ...n, excerpt: '' })) };
}

export async function exportPng(vaultName: string, viewId: string): Promise<void> {
  const view = activeViewInstance();
  if (!view) return;
  download(await view.exportImage(), `${slug(vaultName)}-${viewId}.png`);
}

export function exportSvg(vaultName: string, viewId: string): void {
  const svg = activeViewInstance()?.exportSvg?.();
  if (svg) download(new Blob([svg], { type: 'image/svg+xml' }), `${slug(vaultName)}-${viewId}.svg`);
}

export function exportJson(graph: VaultGraph): void {
  download(new Blob([JSON.stringify(graphJson(graph))], { type: 'application/json' }), 'graph.json');
}

/** Share card: the current view plus vault name and stats, 1600×900. */
export async function exportPoster(
  graph: VaultGraph,
  theme: ThemePalette,
  viewLabel: string,
  viewId: string,
): Promise<void> {
  const view = activeViewInstance();
  if (!view) return;
  const W = 1600;
  const H = 900;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return;
  paintBackground(g, W, H, theme);
  const img = await createImageBitmap(await view.exportImage());
  const box = { x: 40, y: 32, w: W - 80, h: 700 };
  const k = Math.min(box.w / img.width, box.h / img.height);
  g.drawImage(
    img,
    box.x + (box.w - img.width * k) / 2,
    box.y + (box.h - img.height * k) / 2,
    img.width * k,
    img.height * k,
  );
  const s = graph.stats;
  g.fillStyle = theme.text;
  g.font = '700 48px system-ui, sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillText(graph.vaultName, 56, 812);
  g.font = '400 24px system-ui, sans-serif';
  g.fillStyle = theme.mutedText;
  const n = (v: number, label: string) => `${v.toLocaleString()} ${label}`;
  g.fillText(
    [
      n(s.noteCount, strings.stats.notes),
      n(s.linkCount, strings.stats.links),
      n(s.tagCount, strings.stats.tags),
      n(s.orphanCount, strings.stats.orphans),
    ].join('  ·  '),
    56,
    856,
  );
  g.textAlign = 'right';
  g.fillStyle = theme.text;
  g.font = '600 24px system-ui, sans-serif';
  g.fillText(viewLabel, W - 56, 812);
  g.fillStyle = theme.mutedText;
  g.font = '400 18px system-ui, sans-serif';
  g.fillText(strings.exporting.madeWith, W - 56, 856);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (blob) download(blob, `${slug(graph.vaultName)}-${viewId}-poster.png`);
}
