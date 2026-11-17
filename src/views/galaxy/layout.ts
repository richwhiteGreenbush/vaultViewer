import type { NoteId, VaultGraph } from '../../core/model';
import { degree } from '../../core/graph/metrics';
import { seededRandom, unitHash } from '../../core/util/random';

/** Pure, deterministic galaxy layout (PLAN §7 Phase 3.1). No DOM; unit tested. */

export interface GalaxySystem {
  key: string; // top-level folder id ('' = vault root)
  name: string;
  x: number;
  y: number;
  sunR: number;
  extent: number;
  noteCount: number;
}

export interface GalaxyMoon {
  key: string; // depth-1 subfolder id
  name: string;
  system: number;
  dist: number;
  angle0: number;
  speed: number;
  r: number;
  extent: number;
}

/** How a node moves: around a sun (moon = -1) or a moon, on a ring. Comets and asteroids have their own kinds. */
export type Motion =
  | {
      kind: 'orbit';
      system: number;
      moon: number;
      ring: number;
      radius: number;
      angle0: number;
      speed: number;
    }
  | { kind: 'asteroid'; radius: number; angle0: number; speed: number }
  | { kind: 'comet'; angle: number; offset: number; phase: number; speed: number; span: number };

export interface Hyperlane {
  a: number;
  b: number;
  count: number;
}

export interface GalaxyLayout {
  ids: NoteId[];
  motion: Motion[];
  systems: GalaxySystem[];
  moons: GalaxyMoon[];
  rings: { system: number; moon: number; radius: number }[];
  hyperlanes: Hyperlane[];
  radius: number; // galaxy extent (without the asteroid belt)
}

const RING_GAP = 14;
const MOON_RING_GAP = 9;
const ringCapacity = (k: number) => 8 + 6 * k;

/** Assigns `count` bodies to rings: index → ring number, filling inner rings first. */
function ringsFor(count: number): number[] {
  const out: number[] = [];
  for (let k = 0; out.length < count; k++)
    for (let j = 0; j < ringCapacity(k) && out.length < count; j++) out.push(k);
  return out;
}

const orbitSpeed = (radius: number) => 0.9 / Math.sqrt(Math.max(radius, 1));

export function galaxyLayout(graph: VaultGraph): GalaxyLayout {
  const rand = seededRandom(`galaxy:${graph.vaultName}`);
  const deg = new Map<NoteId, number>();
  for (const id of graph.notes.keys()) deg.set(id, degree(graph, id));

  // Group notes: top-level folder → (depth-1 subfolder | '') → notes. Orphans become comets.
  const groups = new Map<string, Map<string, NoteId[]>>();
  const comets: NoteId[] = [];
  for (const note of graph.notes.values()) {
    if (!deg.get(note.id)) {
      comets.push(note.id);
      continue;
    }
    const segs = note.folder ? note.folder.split('/') : [];
    const top = segs[0] ?? '';
    const sub = segs.length > 1 ? `${top}/${segs[1]}` : '';
    let g = groups.get(top);
    if (!g) groups.set(top, (g = new Map()));
    const list = g.get(sub) ?? [];
    list.push(note.id);
    g.set(sub, list);
  }
  const byDegree = (a: NoteId, b: NoteId) => (deg.get(b) ?? 0) - (deg.get(a) ?? 0) || (a < b ? -1 : 1);

  const ids: NoteId[] = [];
  const motion: Motion[] = [];
  const systems: GalaxySystem[] = [];
  const moons: GalaxyMoon[] = [];
  const rings: GalaxyLayout['rings'] = [];

  const sortedTops = [...groups.keys()].sort((a, b) => {
    const ca = [...(groups.get(a)?.values() ?? [])].reduce((n, l) => n + l.length, 0);
    const cb = [...(groups.get(b)?.values() ?? [])].reduce((n, l) => n + l.length, 0);
    return cb - ca || (a < b ? -1 : 1);
  });

  for (const top of sortedTops) {
    const g = groups.get(top) as Map<string, NoteId[]>;
    const s = systems.length;
    const noteCount = [...g.values()].reduce((n, l) => n + l.length, 0);
    const sunR = 10 + 2.5 * Math.sqrt(noteCount);

    // Planets directly in the top-level folder.
    const direct = [...(g.get('') ?? [])].sort(byDegree);
    const directRings = ringsFor(direct.length);
    const ringCount = directRings.length ? (directRings[directRings.length - 1] as number) + 1 : 0;
    const ringRadius = (k: number) => sunR + 16 + k * RING_GAP;
    const ringOffset = Array.from({ length: ringCount }, () => rand() * Math.PI * 2);
    const ringSizes = new Map<number, number>();
    for (const k of directRings) ringSizes.set(k, (ringSizes.get(k) ?? 0) + 1);
    const ringSeen = new Map<number, number>();
    direct.forEach((id, j) => {
      const k = directRings[j] as number;
      const nth = ringSeen.get(k) ?? 0;
      ringSeen.set(k, nth + 1);
      const radius = ringRadius(k);
      const angle0 = (ringOffset[k] as number) + (nth / (ringSizes.get(k) as number)) * Math.PI * 2;
      ids.push(id);
      motion.push({ kind: 'orbit', system: s, moon: -1, ring: k, radius, angle0, speed: orbitSpeed(radius) });
    });
    for (let k = 0; k < ringCount; k++) rings.push({ system: s, moon: -1, radius: ringRadius(k) });
    let extent = ringCount ? ringRadius(ringCount - 1) + 8 : sunR + 16;

    // Moons: depth-1 subfolders, each with its own rings.
    const subs = [...g.keys()]
      .filter((k) => k !== '')
      .sort((a, b) => (g.get(b)?.length ?? 0) - (g.get(a)?.length ?? 0) || (a < b ? -1 : 1));
    let dist = extent;
    subs.forEach((sub, mi) => {
      const notes = [...(g.get(sub) ?? [])].sort(byDegree);
      const r = 4 + 1.6 * Math.sqrt(notes.length);
      const mRings = ringsFor(notes.length);
      const mRingCount = mRings.length ? (mRings[mRings.length - 1] as number) + 1 : 0;
      const mRingRadius = (k: number) => r + 8 + k * MOON_RING_GAP;
      const mExtent = mRingCount ? mRingRadius(mRingCount - 1) + 4 : r + 8;
      dist += mExtent + 10;
      const m = moons.length;
      moons.push({
        key: sub,
        name: sub.slice(sub.indexOf('/') + 1),
        system: s,
        dist,
        angle0: rand() * Math.PI * 2 + mi * 2.4,
        speed: 0.35 / Math.sqrt(dist),
        r,
        extent: mExtent,
      });
      const sizes = new Map<number, number>();
      for (const k of mRings) sizes.set(k, (sizes.get(k) ?? 0) + 1);
      const seen = new Map<number, number>();
      const offs = Array.from({ length: mRingCount }, () => rand() * Math.PI * 2);
      notes.forEach((id, j) => {
        const k = mRings[j] as number;
        const nth = seen.get(k) ?? 0;
        seen.set(k, nth + 1);
        const radius = mRingRadius(k);
        ids.push(id);
        motion.push({
          kind: 'orbit',
          system: s,
          moon: m,
          ring: k,
          radius,
          angle0: (offs[k] as number) + (nth / (sizes.get(k) as number)) * Math.PI * 2,
          speed: orbitSpeed(radius) * 1.4,
        });
      });
      for (let k = 0; k < mRingCount; k++) rings.push({ system: s, moon: m, radius: mRingRadius(k) });
      dist += mExtent;
    });
    extent = Math.max(extent, dist + 6);
    const name = top === '' ? graph.vaultName : (graph.folders.get(top)?.name ?? top);
    systems.push({ key: top, name, x: 0, y: 0, sunR, extent, noteCount });
  }

  // Place systems on a golden-angle spiral, largest first, without overlaps.
  const placed: GalaxySystem[] = [];
  for (const [i, sys] of systems.entries()) {
    if (i === 0) {
      placed.push(sys);
      continue;
    }
    const theta = i * 2.39996 + rand() * 0.3;
    for (let r = sys.extent; ; r += 12) {
      const x = Math.cos(theta) * r;
      const y = Math.sin(theta) * r;
      if (placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.extent + sys.extent + 36)) {
        sys.x = Math.round(x);
        sys.y = Math.round(y);
        break;
      }
    }
    placed.push(sys);
  }
  const radius = Math.max(120, ...systems.map((s) => Math.hypot(s.x, s.y) + s.extent));

  // Ghosts: an asteroid belt just outside the galaxy.
  for (const ghost of [...graph.ghosts].filter((g) => !graph.notes.has(g)).sort()) {
    const h = unitHash(ghost);
    ids.push(ghost);
    motion.push({
      kind: 'asteroid',
      radius: radius + 50 + (h - 0.5) * 50,
      angle0: h * Math.PI * 2 * 7.3,
      speed: 0.01,
    });
  }
  // Orphans: comets on straight paths across the background.
  for (const id of comets.sort()) {
    const h = unitHash(id);
    ids.push(id);
    motion.push({
      kind: 'comet',
      angle: h * Math.PI * 2,
      offset: (unitHash(`${id}#o`) - 0.5) * radius,
      phase: unitHash(`${id}#p`),
      speed: 0.012 + h * 0.01,
      span: radius * 2.6,
    });
  }

  // Hyperlanes: links between notes in different systems, aggregated per system pair.
  const systemOf = new Map<NoteId, number>();
  motion.forEach((m, i) => {
    if (m.kind === 'orbit') systemOf.set(ids[i] as NoteId, m.system);
  });
  const lanes = new Map<string, Hyperlane>();
  for (const l of graph.links) {
    const a = systemOf.get(l.source);
    const b = systemOf.get(l.target);
    if (a === undefined || b === undefined || a === b) continue;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}`;
    const lane = lanes.get(key) ?? { a: x, b: y, count: 0 };
    lane.count++;
    lanes.set(key, lane);
  }

  return { ids, motion, systems, moons, rings, hyperlanes: [...lanes.values()], radius };
}

/** Moon centre at time t (seconds). */
export function moonPosition(l: GalaxyLayout, m: number, t: number): { x: number; y: number } {
  const moon = l.moons[m] as GalaxyMoon;
  const sys = l.systems[moon.system] as GalaxySystem;
  const a = moon.angle0 + moon.speed * t;
  return { x: sys.x + Math.cos(a) * moon.dist, y: sys.y + Math.sin(a) * moon.dist };
}

/** Writes every node's position at time t (seconds) into `out` (x,y pairs). */
export function positionsAt(
  l: GalaxyLayout,
  t: number,
  out: Float32Array<ArrayBufferLike> = new Float32Array(l.ids.length * 2),
): Float32Array<ArrayBufferLike> {
  const moonPos = l.moons.map((_, m) => moonPosition(l, m, t));
  l.motion.forEach((m, i) => {
    let x: number;
    let y: number;
    if (m.kind === 'orbit') {
      const c =
        m.moon >= 0 ? (moonPos[m.moon] as { x: number; y: number }) : (l.systems[m.system] as GalaxySystem);
      const a = m.angle0 + m.speed * t;
      x = c.x + Math.cos(a) * m.radius;
      y = c.y + Math.sin(a) * m.radius;
    } else if (m.kind === 'asteroid') {
      const a = m.angle0 + m.speed * t;
      x = Math.cos(a) * m.radius;
      y = Math.sin(a) * m.radius;
    } else {
      const s = (((m.phase + m.speed * t) % 1) + 1) % 1; // 0..1 along the path
      const along = (s - 0.5) * m.span;
      const dx = Math.cos(m.angle);
      const dy = Math.sin(m.angle);
      x = dx * along - dy * m.offset;
      y = dy * along + dx * m.offset;
    }
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  });
  return out;
}
