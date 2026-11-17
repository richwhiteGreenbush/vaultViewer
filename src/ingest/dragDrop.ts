import type { VaultSource } from './types';

/** Reads every entry of a directory (readEntries returns batches until empty). */
function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

async function walkEntry(entry: FileSystemEntry, out: { path: string; file: File }[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ path: entry.fullPath.replace(/^\//, ''), file });
  } else if (entry.isDirectory) {
    if (entry.name.startsWith('.')) return; // never walk .git / .obsidian
    for (const child of await readAll((entry as FileSystemDirectoryEntry).createReader()))
      await walkEntry(child, out);
  }
}

/**
 * Turns a drop into a vault source. Prefers a real directory handle (Chromium: enables reopen and watch),
 * then a dropped .zip, then a walked folder via webkitGetAsEntry (Firefox, Safari).
 */
export async function sourceFromDrop(dt: DataTransfer): Promise<VaultSource | undefined> {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  // Kick off all handle/entry requests synchronously: DataTransfer items expire after the first await.
  const handles = items.map((i) =>
    'getAsFileSystemHandle' in i ? i.getAsFileSystemHandle() : Promise.resolve(null),
  );
  const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null);
  const files = items.map((i) => i.getAsFile());

  for (const h of handles) {
    const handle = await h.catch(() => null);
    if (handle?.kind === 'directory') {
      return { kind: 'handle', name: handle.name, handle: handle as FileSystemDirectoryHandle };
    }
  }
  const zip = files.find((f) => f && /\.zip$/i.test(f.name));
  if (zip)
    return { kind: 'zip', name: zip.name, data: await zip.arrayBuffer(), lastModified: zip.lastModified };

  const out: { path: string; file: File }[] = [];
  const dirs = entries.filter((e): e is FileSystemEntry => !!e);
  for (const e of dirs) await walkEntry(e, out);
  if (!out.length) return undefined;
  const top = dirs.length === 1 && dirs[0]?.isDirectory ? dirs[0].name : 'Dropped notes';
  return { kind: 'files', name: top, files: out };
}

/** <input type="file" webkitdirectory> fallback (Firefox, Safari). */
export function sourceFromFileList(list: FileList): VaultSource | undefined {
  const files = [...list].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
  if (!files.length) return undefined;
  const name = files[0]?.path.includes('/') ? (files[0].path.split('/')[0] ?? 'Vault') : 'Vault';
  return { kind: 'files', name, files };
}
