import type { FolderId, NoteId } from '../model';

export const NOTE_EXT = /\.(md|markdown)$/i;

/** Attachment extensions: links/embeds to these are ignored in v1 (PLAN §4.3). */
export const ATTACHMENT_EXT =
  /\.(png|jpe?g|gif|svg|webp|bmp|avif|ico|pdf|mp3|mp4|m4a|wav|ogg|webm|mov|mkv|flac|canvas|excalidraw|zip|csv|xlsx?|docx?|pptx?|txt|json|html?)$/i;

export const DEFAULT_IGNORE = ['node_modules', 'templates'];

/** Normalizes slashes, resolves '.' and '..', strips leading/trailing slashes. */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const seg of path.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

export function noteIdFromPath(path: string): NoteId {
  return normalizePath(path).replace(NOTE_EXT, '').toLowerCase();
}

export function folderOf(id: string): FolderId {
  const i = id.lastIndexOf('/');
  return i < 0 ? '' : id.slice(0, i);
}

export function basename(path: string): string {
  const p = normalizePath(path);
  return p.slice(p.lastIndexOf('/') + 1);
}

export function joinPath(folder: string, rel: string): string {
  return normalizePath(folder ? `${folder}/${rel}` : rel);
}

/**
 * Decides whether a vault-relative file path is a note we parse.
 * Skips dot-folders/files (.obsidian, .git, .trash) and any folder named in the ignore list.
 */
export function isIncludedNotePath(path: string, ignore: readonly string[] = DEFAULT_IGNORE): boolean {
  const segs = normalizePath(path).split('/');
  const file = segs[segs.length - 1] ?? '';
  if (!NOTE_EXT.test(file)) return false;
  const ignored = new Set(ignore.map((s) => s.toLowerCase()));
  return segs.every(
    (seg, i) => !seg.startsWith('.') && (i === segs.length - 1 || !ignored.has(seg.toLowerCase())),
  );
}
