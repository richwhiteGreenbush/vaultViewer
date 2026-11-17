/** A file read from the vault (PLAN §6). */
export interface RawFile {
  path: string;
  text: string;
  lastModified: number;
}

/**
 * A vault file before its text is read. Exactly one of file / handle / text is set;
 * text is only read when the parse cache misses.
 */
export interface FileItem {
  path: string;
  lastModified: number;
  size: number;
  file?: File;
  text?: string;
}

/** Where a vault comes from. All variants are structured-cloneable so they can go to a worker. */
export type VaultSource =
  | { kind: 'handle'; name: string; handle: FileSystemDirectoryHandle }
  | { kind: 'files'; name: string; files: { path: string; file: File }[] }
  | { kind: 'zip'; name: string; data: ArrayBuffer; lastModified: number }
  | { kind: 'cache'; key: string; name: string };

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** If every path shares one top-level folder (zip of a folder, dropped folder), strip it and use it as the name. */
export function stripCommonRoot<T extends { path: string }>(items: T[]): { root?: string; items: T[] } {
  if (!items.length) return { items };
  const first = items[0]?.path.split('/')[0];
  if (!first || !items.every((i) => i.path.startsWith(`${first}/`))) return { items };
  return { root: first, items: items.map((i) => ({ ...i, path: i.path.slice(first.length + 1) })) };
}
