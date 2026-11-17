import Dexie, { type Table } from 'dexie';
import type { LayoutSnapshot, ParsedNote } from '../core/model';

export type VaultSourceKind = 'handle' | 'zip' | 'files';

/** Parsed note cached by vault + path; reused when lastModified and size are unchanged. */
export interface NoteRecord {
  vaultKey: string;
  path: string;
  lastModified: number;
  size: number;
  parsed: ParsedNote;
}

/** Raw note text, kept separately so cache restores do not have to load it. Used by the preview. */
export interface TextRecord {
  vaultKey: string;
  path: string;
  text: string;
}

export interface VaultRecord {
  key: string;
  name: string;
  kind: VaultSourceKind;
  openedAt: number;
  handle?: FileSystemDirectoryHandle;
}

export interface LayoutRecord extends LayoutSnapshot {
  savedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class VaultLensDB extends Dexie {
  notes!: Table<NoteRecord, [string, string]>;
  texts!: Table<TextRecord, [string, string]>;
  vaults!: Table<VaultRecord, string>;
  layouts!: Table<LayoutRecord, [string, string]>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('vault-lens');
    this.version(1).stores({
      notes: '[vaultKey+path], vaultKey',
      texts: '[vaultKey+path], vaultKey',
      vaults: 'key, openedAt',
      layouts: '[viewId+vaultHash], savedAt',
      settings: 'key',
    });
  }
}

let instance: VaultLensDB | undefined;
/** Lazily opened so modules can import this without touching IndexedDB (e.g. in unit tests). */
export function db(): VaultLensDB {
  instance ??= new VaultLensDB();
  return instance;
}

export async function lastVault(): Promise<VaultRecord | undefined> {
  try {
    return await db().vaults.orderBy('openedAt').last();
  } catch {
    return undefined; // private mode / storage blocked
  }
}

export async function clearCache(): Promise<void> {
  await db().delete();
  instance = undefined;
}
