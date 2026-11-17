/// <reference lib="webworker" />
/**
 * Layout worker: runs d3-force off the main thread and streams positions (a transferred Float32Array of
 * x,y pairs in node order) until the simulation cools, then caches the final positions in IndexedDB.
 */
import * as Comlink from 'comlink';
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import { db } from '../cache/db';

export interface LayoutNodeInput {
  id: string;
  r: number;
}

export interface LayoutRequest {
  viewId: string;
  vaultHash: string;
  nodes: LayoutNodeInput[];
  /** source/target node indexes, flat pairs */
  links: Int32Array;
}

export interface LayoutStatus {
  cached: number; // how many node positions came from the cache
  settled: boolean;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
}

let sim: Simulation<SimNode, undefined> | undefined;
let nodes: SimNode[] = [];
let runId = 0;
let current: LayoutRequest | undefined;
let emit: ((positions: Float32Array, status: LayoutStatus) => void) | undefined;
let cachedCount = 0;

function snapshot(): Float32Array {
  const out = new Float32Array(nodes.length * 2);
  nodes.forEach((n, i) => {
    out[i * 2] = n.x ?? 0;
    out[i * 2 + 1] = n.y ?? 0;
  });
  return out;
}

function send(settled: boolean): void {
  const arr = snapshot();
  emit?.(Comlink.transfer(arr, [arr.buffer]), { cached: cachedCount, settled });
}

async function save(): Promise<void> {
  if (!current) return;
  try {
    await db().layouts.put({
      viewId: current.viewId,
      vaultHash: current.vaultHash,
      positions: nodes.map((n) => ({
        id: n.id,
        x: Math.round((n.x ?? 0) * 10) / 10,
        y: Math.round((n.y ?? 0) * 10) / 10,
      })),
      savedAt: Date.now(),
    });
  } catch {
    /* cache is best effort */
  }
}

/** Ticks for ~12 ms per slice, posting positions at most once per frame, until alpha < alphaMin. */
function loop(id: number): void {
  if (!sim || id !== runId) return;
  const start = performance.now();
  while (performance.now() - start < 12 && sim.alpha() >= sim.alphaMin()) sim.tick();
  const done = sim.alpha() < sim.alphaMin();
  send(done);
  if (done) void save();
  else setTimeout(() => loop(id), 4);
}

const api = {
  async start(
    req: LayoutRequest,
    onPositions: (positions: Float32Array, status: LayoutStatus) => void,
  ): Promise<void> {
    const id = ++runId;
    sim?.stop();
    current = req;
    emit = onPositions;

    let cached = new Map<string, { x: number; y: number }>();
    try {
      const snap = await db().layouts.get([req.viewId, req.vaultHash]);
      cached = new Map(snap?.positions.map((p) => [p.id, p]) ?? []);
      if (!snap) {
        // Same view, different graph (files changed): warm-start from the most recent layout of this view.
        const recent = await db()
          .layouts.where('savedAt')
          .above(0)
          .reverse()
          .filter((l) => l.viewId === req.viewId)
          .first();
        cached = new Map(recent?.positions.map((p) => [p.id, p]) ?? []);
      }
    } catch {
      /* no cache */
    }
    if (id !== runId) return;

    nodes = req.nodes.map((n) => {
      const p = cached.get(n.id);
      return p ? { id: n.id, r: n.r, x: p.x, y: p.y } : { id: n.id, r: n.r };
    });
    cachedCount = nodes.filter((n) => n.x !== undefined).length;
    const links: { source: number; target: number }[] = [];
    for (let i = 0; i < req.links.length; i += 2) {
      const s = req.links[i] as number;
      const t = req.links[i + 1] as number;
      if (s !== t) links.push({ source: s, target: t });
    }

    const n = nodes.length;
    sim = forceSimulation<SimNode>(nodes)
      .stop()
      .force('link', forceLink<SimNode, { source: number; target: number }>(links).distance(34).strength(0.4))
      .force('charge', forceManyBody<SimNode>().strength(-45).theta(0.95).distanceMax(600))
      .force('x', forceX<SimNode>(0).strength(0.04))
      .force('y', forceY<SimNode>(0).strength(0.04))
      .force('center', forceCenter(0, 0))
      .alphaDecay(n > 2000 ? 0.035 : 0.0228);

    if (n && cachedCount === n) {
      // Everything cached: show it immediately, no simulation.
      send(true);
      return;
    }
    if (cachedCount > n * 0.5) sim.alpha(0.3); // warm start
    loop(id);
  },

  /** Pins a node while it is dragged (null releases it) and reheats the simulation. */
  drag(index: number, pos: { x: number; y: number } | null): void {
    const node = nodes[index];
    if (!sim || !node) return;
    node.fx = pos?.x ?? null;
    node.fy = pos?.y ?? null;
    if (!pos) {
      sim.alphaTarget(0);
      return;
    }
    node.x = pos.x;
    node.y = pos.y;
    const wasIdle = sim.alpha() < sim.alphaMin();
    sim.alphaTarget(0.15);
    if (sim.alpha() < 0.15) sim.alpha(0.15);
    if (wasIdle) loop(runId);
  },

  stop(): void {
    runId++;
    sim?.stop();
  },
};

export type LayoutWorkerApi = typeof api;

Comlink.expose(api);
