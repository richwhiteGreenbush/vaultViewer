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
