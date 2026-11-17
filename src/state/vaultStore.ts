import { create } from 'zustand';
import * as Comlink from 'comlink';
import type { VaultGraph } from '../core/model';
import { deserializeGraph } from '../core/graph/serialize';
import { lastVault, type VaultRecord } from '../cache/db';
import { ensureReadPermission, pickDirectory } from '../ingest/fsAccess';
import { sourceFromDrop, sourceFromFileList } from '../ingest/dragDrop';
import type { VaultSource } from '../ingest/types';
import { parseClientReady } from '../workers/clients';
import type { LoadProgress, LoadResult } from '../workers/parse.worker';
import { strings } from '../strings';

export interface VaultInfo {
  key: string;
  name: string;
  kind: VaultRecord['kind'];
  parsedCount: number;
  cachedCount: number;
  ms: LoadResult['ms'];
  warnings: string[];
}

interface VaultState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: LoadProgress | null;
  graph: VaultGraph | null;
  vaultHash: string | null;
  info: VaultInfo | null;
  error: string | null;
  lastVault: VaultRecord | null;
  /** Restored from cache but the folder needs permission again to pick up changes. */
  needsReconnect: boolean;
  load(source: VaultSource): Promise<void>;
  openPicker(): Promise<void>;
  openZipFile(file: File): Promise<void>;
  openFileList(list: FileList): Promise<void>;
  openDrop(dt: DataTransfer): Promise<void>;
  openSample(): Promise<void>;
  restoreLast(): Promise<void>;
  reconnect(): Promise<void>;
}

let loadSeq = 0;

export const useVaultStore = create<VaultState>((set, get) => ({
  status: 'idle',
  progress: null,
  graph: null,
  vaultHash: null,
  info: null,
  error: null,
  lastVault: null,
  needsReconnect: false,

  async load(source) {
    const seq = ++loadSeq;
    const background =
      source.kind === 'handle' && get().info?.key === `handle:${source.name}` && !!get().graph;
    if (!background) set({ status: 'loading', progress: null, error: null });
    try {
      const client = await parseClientReady();
      const result = await client.load(
        source,
        {},
        Comlink.proxy((p: LoadProgress) => {
          if (seq === loadSeq && !background) set({ progress: p });
        }),
      );
      if (seq !== loadSeq) return;
      const graph = deserializeGraph(result.graph);
      if (graph.stats.noteCount === 0 && source.kind !== 'cache') {
        set({ status: 'error', error: strings.errors.empty, progress: null });
        return;
      }
      set({
        status: 'ready',
        progress: null,
        graph,
        vaultHash: result.vaultHash,
        needsReconnect: false,
        info: {
          key: result.vaultKey,
          name: result.vaultName,
          kind: result.kind,
          parsedCount: result.parsedCount,
          cachedCount: result.cachedCount,
          ms: result.ms,
          warnings: result.warnings,
        },
      });
      (window as unknown as { __vaultLens?: unknown }).__vaultLens = {
        parsedCount: result.parsedCount,
        cachedCount: result.cachedCount,
        ms: result.ms,
      };
    } catch (e) {
      if (seq !== loadSeq) return;
      console.error(e);
      set({ status: 'error', progress: null, error: e instanceof Error ? e.message : String(e) });
    }
  },

  async openPicker() {
    const handle = await pickDirectory();
    if (handle) await get().load({ kind: 'handle', name: handle.name, handle });
  },

  async openZipFile(file) {
    await get().load({
      kind: 'zip',
      name: file.name,
      data: await file.arrayBuffer(),
      lastModified: file.lastModified,
    });
  },

  async openFileList(list) {
    const source = sourceFromFileList(list);
    if (source) await get().load(source);
  },

  async openDrop(dt) {
    const source = await sourceFromDrop(dt);
    if (source) await get().load(source);
    else set({ status: get().graph ? 'ready' : 'error', error: strings.errors.dropUnsupported });
  },

  async openSample() {
    set({ status: 'loading', progress: null, error: null });
    try {
      const res = await fetch('./sample-vault.zip');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      await get().load({
        kind: 'zip',
        name: 'sample-vault.zip',
        data,
        lastModified: Date.parse('2026-11-01'),
      });
    } catch (e) {
      set({
        status: 'error',
        error: `${strings.errors.sample}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  },

  /** On startup: show the last vault straight from the cache, then rescan the folder if permission allows. */
  async restoreLast() {
    const last = await lastVault();
    if (!last) return;
    set({ lastVault: last });
    await get().load({ kind: 'cache', key: last.key, name: last.name });
    if (last.kind === 'handle' && last.handle) {
      if (await ensureReadPermission(last.handle, false).catch(() => false)) {
        await get().load({ kind: 'handle', name: last.name, handle: last.handle });
      } else {
        set({ needsReconnect: true });
      }
    }
  },

  /** Needs a user gesture: re-requests folder permission and rescans (only changed files are parsed). */
  async reconnect() {
    const last = get().lastVault;
    if (!last?.handle) return;
    if (await ensureReadPermission(last.handle, true)) {
      await get().load({ kind: 'handle', name: last.name, handle: last.handle });
    }
  },
}));
