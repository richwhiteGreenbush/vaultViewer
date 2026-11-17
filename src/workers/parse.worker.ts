/// <reference lib="webworker" />
/**
 * Parse worker. The same module runs in two roles:
 *  - coordinator: lists the vault's files, checks the IndexedDB cache, hands cache misses out to itself and to
 *    helper workers (connected over MessagePorts, so note data never crosses the main thread), stores results,
 *    and builds the VaultGraph.
 *  - helper: only `parseItems`.
 */
import * as Comlink from 'comlink';
import { parseNote } from '../core/parse/parseNote';
import { DEFAULT_IGNORE, isIncludedNotePath, NOTE_EXT } from '../core/parse/paths';
import { buildGraph } from '../core/graph/buildGraph';
import { graphHash } from '../core/graph/metrics';
import { serializeGraph, type SerializedGraph } from '../core/graph/serialize';
import type { ParsedNote } from '../core/model';
import { db, type NoteRecord, type VaultRecord } from '../cache/db';
import { walkDirectory } from '../ingest/fsAccess';
import { readZipDirectory, unzipText } from '../ingest/zip';
import { MAX_FILE_BYTES, stripCommonRoot, type FileItem, type VaultSource } from '../ingest/types';

export interface LoadProgress {
  phase: 'listing' | 'parsing' | 'building' | 'saving';
  done: number;
  total: number;
}

export interface LoadResult {
  vaultKey: string;
  vaultName: string;
  kind: VaultRecord['kind'];
  graph: SerializedGraph;
  vaultHash: string;
  warnings: string[];
  parsedCount: number;
  cachedCount: number;
  ms: { total: number; list: number; parse: number; build: number };
}

export interface LoadOptions {
  ignore?: string[];
}

interface ParsedItem {
  parsed: ParsedNote;
  text: string;
  path: string;
  lastModified: number;
  size: number;
}

async function readText(item: FileItem): Promise<string> {
  if (item.text !== undefined) return item.text;
  if (item.file) return item.file.text();
  return '';
}

const CHUNK = 64;

const helpers: Comlink.Remote<ParseWorkerApi>[] = [];

const api = {
  async parseItems(items: FileItem[]): Promise<ParsedItem[]> {
    const out: ParsedItem[] = [];
    for (const item of items) {
      const text = await readText(item);
      out.push({
        parsed: parseNote({ path: item.path, text, lastModified: item.lastModified }),
        text,
        path: item.path,
        lastModified: item.lastModified,
        size: item.size,
      });
    }
    return out;
  },

  /** Exposes this worker's API on a port (helper role). */
  servePort(port: MessagePort): void {
    Comlink.expose(api, port);
  },

  /** Connects a helper worker (coordinator role). */
  addHelper(port: MessagePort): void {
    helpers.push(Comlink.wrap<ParseWorkerApi>(port));
  },

  async load(
    source: VaultSource,
    options: LoadOptions,
    onProgress: (p: LoadProgress) => void,
  ): Promise<LoadResult> {
    const t0 = performance.now();
    const ignore = options.ignore ?? DEFAULT_IGNORE;
    const ignored = new Set(ignore.map((s) => s.toLowerCase()));
    const warnings: string[] = [];
    onProgress({ phase: 'listing', done: 0, total: 0 });

    // 1. List files.
    let name = source.name;
    let items: FileItem[];
    const kind: VaultRecord['kind'] = source.kind === 'cache' ? 'files' : source.kind;
    const key = source.kind === 'cache' ? source.key : `${source.kind}:${source.name}`;
    const existing = new Map<string, NoteRecord>();
    for (const r of await db().notes.where('vaultKey').equals(key).toArray()) existing.set(r.path, r);

    if (source.kind === 'handle') {
      items = await walkDirectory(
        source.handle,
        (dir) => dir.startsWith('.') || ignored.has(dir.toLowerCase()),
        (path) => NOTE_EXT.test(path),
      );
    } else if (source.kind === 'files') {
      const stripped = stripCommonRoot(source.files);
      if (stripped.root) name = stripped.root;
      items = stripped.items.map(({ path, file }) => ({
        path,
        file,
        lastModified: file.lastModified,
        size: file.size,
      }));
    } else if (source.kind === 'zip') {
      const bytes = new Uint8Array(source.data);
      const entries = readZipDirectory(bytes).filter((e) => !e.name.startsWith('__MACOSX/'));
      const stripped = stripCommonRoot(entries.map((e) => ({ ...e, path: e.name })));
      if (stripped.root) name = stripped.root;
      const wanted = stripped.items.filter(
        (e) => isIncludedNotePath(e.path, ignore) && e.size <= MAX_FILE_BYTES,
      );
      const misses = wanted.filter((e) => {
        const hit = existing.get(e.path);
        return hit?.lastModified !== e.lastModified || hit.size !== e.size;
      });
      const texts = unzipText(bytes, new Set(misses.map((e) => e.name)));
      items = stripped.items.map((e) => ({
        path: e.path,
        lastModified: e.lastModified,
        size: e.size,
        ...(texts.has(e.name) ? { text: texts.get(e.name) } : {}),
      }));
    } else {
      items = [...existing.values()].map((r) => ({
        path: r.path,
        lastModified: r.lastModified,
        size: r.size,
      }));
    }

    items = items.filter((i) => isIncludedNotePath(i.path, ignore));
    for (const big of items.filter((i) => i.size > MAX_FILE_BYTES)) {
      warnings.push(`${big.path}: skipped, larger than 2 MB`);
    }
    items = items.filter((i) => i.size <= MAX_FILE_BYTES);
    const t1 = performance.now();

    // 2. Reuse cached parses where path + lastModified + size match.
    const parsed: ParsedNote[] = [];
    const misses: FileItem[] = [];
    for (const item of items) {
      const hit = existing.get(item.path);
      if (hit && hit.lastModified === item.lastModified && hit.size === item.size) parsed.push(hit.parsed);
      else misses.push(item);
    }
    const cachedCount = parsed.length;

    // 3. Parse misses across this worker and its helpers (work queue of small chunks).
    const fresh: ParsedItem[] = [];
    if (misses.length) {
      const total = misses.length;
      onProgress({ phase: 'parsing', done: 0, total });
      const queue: FileItem[][] = [];
      for (let i = 0; i < misses.length; i += CHUNK) queue.push(misses.slice(i, i + CHUNK));
      const runners = [api, ...helpers.slice(0, Math.max(0, Math.ceil(total / CHUNK) - 1))];
      let lastReport = 0;
      await Promise.all(
        runners.map(async (runner) => {
          for (let chunk = queue.shift(); chunk; chunk = queue.shift()) {
            const result = await runner.parseItems(chunk);
            fresh.push(...result);
            const now = performance.now();
            if (now - lastReport > 50 || fresh.length === total) {
              lastReport = now;
              onProgress({ phase: 'parsing', done: fresh.length, total });
            }
          }
        }),
      );
    }
    for (const f of fresh) parsed.push(f.parsed);
    for (const f of fresh) warnings.push(...f.parsed.warnings);
    for (const p of parsed.slice(0, cachedCount)) warnings.push(...p.warnings);
    const t2 = performance.now();

    // 4. Build the graph.
    onProgress({ phase: 'building', done: 0, total: 0 });
    const graph = buildGraph(parsed, name);
    const nodeIds = [...graph.notes.keys(), ...graph.ghosts];
    const vaultHash = graphHash(nodeIds, graph.links);
    const t3 = performance.now();

    // 5. Update the cache (best effort: a full or blocked IndexedDB must not fail the load).
    try {
      onProgress({ phase: 'saving', done: 0, total: 0 });
      const present = new Set(items.map((i) => i.path));
      const stale = [...existing.keys()]
        .filter((p) => !present.has(p))
        .map((p) => [key, p] as [string, string]);
      const d = db();
      await d.transaction('rw', d.notes, d.texts, d.vaults, async () => {
        if (stale.length) {
          await d.notes.bulkDelete(stale);
          await d.texts.bulkDelete(stale);
        }
        if (fresh.length) {
          await d.notes.bulkPut(
            fresh.map((f) => ({
              vaultKey: key,
              path: f.path,
              lastModified: f.lastModified,
              size: f.size,
              parsed: f.parsed,
            })),
          );
          await d.texts.bulkPut(fresh.map((f) => ({ vaultKey: key, path: f.path, text: f.text })));
        }
        const prev = await d.vaults.get(key);
        await d.vaults.put({
          key,
          name,
          kind: prev?.kind ?? kind,
          openedAt: Date.now(),
          ...(source.kind === 'handle'
            ? { handle: source.handle }
            : prev?.handle
              ? { handle: prev.handle }
              : {}),
        });
      });
    } catch (e) {
      warnings.push(`Cache not saved: ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      vaultKey: key,
      vaultName: name,
      kind,
      graph: serializeGraph(graph),
      vaultHash,
      warnings,
      parsedCount: fresh.length,
      cachedCount,
      ms: { total: performance.now() - t0, list: t1 - t0, parse: t2 - t1, build: t3 - t2 },
    };
  },

  async readText(vaultKey: string, path: string): Promise<string | undefined> {
    return (await db().texts.get([vaultKey, path]))?.text;
  },
};

export type ParseWorkerApi = typeof api;

Comlink.expose(api);
