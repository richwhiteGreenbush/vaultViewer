import type { Note, VaultGraph } from '../../core/model';
import type { ThemePalette } from '../../core/color/palettes';
import { folderColor, tagColor } from '../../core/color/tagColor';

/** Size = sqrt(wordCount), clamped (PLAN §8). */
export const noteRadius = (note: Note | undefined): number =>
  note ? Math.min(22, Math.max(3.5, 3 + Math.sqrt(note.wordCount) * 0.35)) : 3.5;

/** Color = first tag, or folder if untagged (PLAN §8). */
export function noteColor(note: Note | undefined, theme: ThemePalette): string {
  if (!note) return theme.ghost;
  const tag = note.tags[0];
  return tag ? tagColor(tag, theme) : folderColor(note.folder, theme);
}

/** Node ids in render order: notes, then ghosts. */
export function nodeOrder(graph: VaultGraph): string[] {
  return [...graph.notes.keys(), ...[...graph.ghosts].filter((g) => !graph.notes.has(g))];
}

/**
 * Recency glow (PLAN §7 Phase 2): 1 for the 10% most recently updated notes, fading linearly to 0 at the
 * 60th percentile. Ghosts get 0.
 */
export function recencyGlow(graph: VaultGraph, ids: string[]): Float32Array {
  const notes = ids.map((id, i) => ({ i, t: graph.notes.get(id)?.updated })).filter((x) => x.t !== undefined);
  notes.sort((a, b) => (b.t as number) - (a.t as number));
  const out = new Float32Array(ids.length);
  const n = notes.length || 1;
  notes.forEach(({ i }, rank) => {
    const pct = rank / n;
    out[i] = pct < 0.1 ? 1 : Math.max(0, 0.6 * (1 - (pct - 0.1) / 0.5));
  });
  return out;
}
