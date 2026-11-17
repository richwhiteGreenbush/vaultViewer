import type { FileItem } from './types';

export const supportsDirectoryPicker = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window && window.isSecureContext;

/** Opens the native folder picker (Chromium). Returns undefined if the user cancels. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await window.showDirectoryPicker({ id: 'vault-lens', mode: 'read' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return undefined;
    throw e;
  }
}

/** Checks read permission and, if needed and possible (user gesture), asks for it again. */
export async function ensureReadPermission(
  handle: FileSystemDirectoryHandle,
  prompt: boolean,
): Promise<boolean> {
  const opts = { mode: 'read' as const };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  if (!prompt) return false;
  return (await handle.requestPermission?.(opts)) === 'granted';
}

/**
 * Recursively lists files under a directory handle. `skipDir` prunes folders before descending
 * (dot-folders, ignore list), so huge `.git` or `node_modules` trees are never walked.
 */
export async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  skipDir: (name: string) => boolean,
  accept: (path: string) => boolean,
  prefix = '',
  onError: (path: string, error: unknown) => void = () => undefined,
): Promise<FileItem[]> {
  const out: FileItem[] = [];
  for await (const entry of dir.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (!skipDir(entry.name)) out.push(...(await walkDirectory(entry, skipDir, accept, path, onError)));
    } else if (accept(path)) {
      try {
        const file = await entry.getFile();
        out.push({ path, lastModified: file.lastModified, size: file.size, file });
      } catch (e) {
        onError(path, e); // locked, deleted mid-scan, or unreadable: skip it and keep going
      }
    }
  }
  return out;
}
