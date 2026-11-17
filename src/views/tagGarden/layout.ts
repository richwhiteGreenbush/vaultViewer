import type { NoteId, TagId, VaultGraph } from '../../core/model';
import { noteRadius } from '../shared/encodings';

/**
 * Pure, deterministic Tag Garden layout (PLAN §7 Phase 3.2). Plants grow upwards (towards -y) from ground lines;
 * long gardens wrap into several rows (terraces) so the garden keeps a screen-friendly shape.
 */

export interface Segment {
  tag: TagId;
  depth: number; // 0 = stem
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Plant {
  tag: TagId;
  x: number;
  y: number; // ground line of this plant's row
  height: number;
  count: number; // notes carrying any tag in this plant
  segments: Segment[];
}

export interface GardenLayout {
  ids: NoteId[]; // flowers then compost seeds
  /** x,y per node, then x,y per anchor (one anchor per tag, at its segment tip) */
  base: Float32Array;
  radius: Float32Array;
  /** plant index per vertex (nodes then anchors); -1 = static (compost) */
  plantOf: Int32Array;
  plants: Plant[];
  anchorOf: Map<TagId, number>; // vertex index of each tag's anchor
  vines: number[]; // vertex index pairs: flower → anchor of another tag
  compost: { x: number; y: number; width: number; height: number; count: number };
  width: number;
  maxHeight: number;
  rows: number;
  rowHeight: number;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const rootOf = (t: TagId) => t.split('/')[0] as TagId;

export function gardenLayout(graph: VaultGraph): GardenLayout {
  // Notes per plant (any tag in subtree) and flowers per tag (notes whose FIRST tag is that tag).
  const plantCount = new Map<TagId, Set<NoteId>>();
  const flowersOf = new Map<TagId, NoteId[]>();
  const untagged: NoteId[] = [];
  for (const note of graph.notes.values()) {
    if (!note.tags.length) {
      untagged.push(note.id);
      continue;
    }
    for (const t of note.tags) {
      const r = rootOf(t);
      const set = plantCount.get(r) ?? new Set<NoteId>();
      set.add(note.id);
      plantCount.set(r, set);
    }
    const first = note.tags[0] as TagId;
    const list = flowersOf.get(first) ?? [];
    list.push(note.id);
    flowersOf.set(first, list);
  }
  const roots = [...plantCount.keys()].sort(
    (a, b) => (plantCount.get(b)?.size ?? 0) - (plantCount.get(a)?.size ?? 0) || (a < b ? -1 : 1),
  );

  // Child tags (all depths) present in the graph, grouped by parent.
  const children = new Map<TagId, TagId[]>();
  for (const tag of graph.tags.values()) {
    if (!tag.parent) continue;
    const list = children.get(tag.parent) ?? [];
    list.push(tag.id);
    children.set(tag.parent, list);
  }
  for (const list of children.values()) list.sort();
  const subtreeCount = (t: TagId): number => {
    const own = graph.tags.get(t)?.noteIds.length ?? 0;
    return own + (children.get(t) ?? []).reduce((n, c) => n + subtreeCount(c), 0);
  };

  // Row wrapping: aim for a garden about 1.6 times wider than tall.
  const widthOf = (count: number) => Math.max(70, 40 + 16 * Math.sqrt(count));
  const heightOf = (count: number) => 60 + 42 * Math.log2(1 + count);
  const counts = roots.map((r) => plantCount.get(r)?.size ?? 0);
  const totalWidth = counts.reduce((n, c) => n + widthOf(c), 0) + 120;
  const rowHeight = Math.max(60, ...counts.map(heightOf)) + 110;
  const rowCount = Math.max(1, Math.round(Math.sqrt(totalWidth / (1.6 * rowHeight))));
  const rowTarget = totalWidth / rowCount;

  const plants: Plant[] = [];
  const tips = new Map<TagId, { x: number; y: number; plant: number }>();
  let x = 0;
  let row = 0;
  let gardenWidth = 0;
  for (const [p, root] of roots.entries()) {
    const count = counts[p] as number;
    const width = widthOf(count);
    if (x > 0 && x + width > rowTarget * 1.05 && row < rowCount - 1) {
      row++;
      x = 0;
    }
    const groundY = row * rowHeight;
    const px = x + width / 2;
    x += width;
    gardenWidth = Math.max(gardenWidth, x);
    const height = heightOf(count);
    const segments: Segment[] = [{ tag: root, depth: 0, x1: px, y1: groundY, x2: px, y2: groundY - height }];
    tips.set(root, { x: px, y: groundY - height, plant: p });

    // Grow branches breadth-first: each child hangs off its parent segment, alternating sides.
    const queue: { tag: TagId; seg: Segment; dirAngle: number }[] = [
      { tag: root, seg: segments[0] as Segment, dirAngle: -Math.PI / 2 },
    ];
    while (queue.length) {
      const { tag, seg, dirAngle } = queue.shift() as (typeof queue)[number];
      const kids = children.get(tag) ?? [];
      kids.forEach((kid, k) => {
        const f = 0.35 + (0.5 * (k + 1)) / (kids.length + 1);
        const sx = seg.x1 + (seg.x2 - seg.x1) * f;
        const sy = seg.y1 + (seg.y2 - seg.y1) * f;
        const side = k % 2 === 0 ? 1 : -1;
        const angle = dirAngle + side * (seg.depth === 0 ? 0.95 : 0.55);
        const len = Math.min(height * 0.7, 22 + 12 * Math.sqrt(subtreeCount(kid)));
        const s: Segment = {
          tag: kid,
          depth: seg.depth + 1,
          x1: sx,
          y1: sy,
          x2: sx + Math.cos(angle) * len,
          y2: sy + Math.sin(angle) * len,
        };
        segments.push(s);
        tips.set(kid, { x: s.x2, y: s.y2, plant: p });
        queue.push({ tag: kid, seg: s, dirAngle: angle });
      });
    }
    plants.push({ tag: root, x: px, y: groundY, height, count, segments });
  }

  // Flowers: phyllotaxis clusters at each tag's tip.
  const ids: NoteId[] = [];
  const pts: number[] = [];
  const radius: number[] = [];
  const plantOf: number[] = [];
  const tagsInOrder = [...tips.keys()].sort();
  for (const tag of tagsInOrder) {
    const tip = tips.get(tag) as { x: number; y: number; plant: number };
    const notes = (flowersOf.get(tag) ?? []).sort();
    notes.forEach((id, k) => {
      const r = 8 * Math.sqrt(k + 0.5);
      const a = k * GOLDEN;
      ids.push(id);
      pts.push(tip.x + Math.cos(a) * r, tip.y + Math.sin(a) * r);
      radius.push(noteRadius(graph.notes.get(id)) * 0.85);
      plantOf.push(tip.plant);
    });
  }

  // Compost: untagged notes as seeds in a bed beside the plants, just below the ground.
  untagged.sort();
  const cols = Math.max(4, Math.ceil(Math.sqrt(untagged.length * 3)));
  // The compost bed sits at the end of the last row, just below its ground line.
  const compostX = x + 50;
  const compostY = row * rowHeight + 2;
  untagged.forEach((id, k) => {
    ids.push(id);
    pts.push(compostX + 8 + (k % cols) * 9, compostY + 8 + Math.floor(k / cols) * 9);
    radius.push(2.6);
    plantOf.push(-1);
  });
  const compostRows = Math.max(1, Math.ceil(untagged.length / cols));

  // Anchors (one per tag tip) after the nodes.
  const anchorOf = new Map<TagId, number>();
  for (const tag of tagsInOrder) {
    const tip = tips.get(tag) as { x: number; y: number; plant: number };
    anchorOf.set(tag, ids.length + anchorOf.size);
    pts.push(tip.x, tip.y);
    plantOf.push(tip.plant);
  }

  // Vines: from each flower to the tips of the note's other tags.
  const vines: number[] = [];
  ids.forEach((id, i) => {
    const tags = graph.notes.get(id)?.tags ?? [];
    for (const t of tags.slice(1)) {
      const a = anchorOf.get(t);
      if (a !== undefined) vines.push(i, a);
    }
  });

  return {
    ids,
    base: Float32Array.from(pts),
    radius: Float32Array.from(radius),
    plantOf: Int32Array.from(plantOf),
    plants,
    anchorOf,
    vines,
    compost: {
      x: compostX,
      y: compostY,
      width: cols * 9 + 8,
      height: compostRows * 9 + 10,
      count: untagged.length,
    },
    width: Math.max(gardenWidth, compostX + cols * 9 + 16),
    maxHeight: Math.max(60, ...plants.map((p) => p.height)),
    rows: row + 1,
    rowHeight,
  };
}

/** Sway: each plant bends around its root; points higher up move more. Writes into `out`. */
export function swayPositions(l: GardenLayout, t: number, out: Float32Array<ArrayBufferLike>): void {
  const angles = l.plants.map((p, i) => 0.035 * Math.sin(t * 0.9 + i * 1.7) * (80 / (40 + p.height)) * 2);
  const n = l.base.length / 2;
  for (let v = 0; v < n; v++) {
    const p = l.plantOf[v] as number;
    const bx = l.base[v * 2] as number;
    const by = l.base[v * 2 + 1] as number;
    if (p < 0) {
      out[v * 2] = bx;
      out[v * 2 + 1] = by;
      continue;
    }
    const plant = l.plants[p] as Plant;
    const dy = by - plant.y;
    const k = Math.min(1, -dy / plant.height); // bend grows with height
    const a = (angles[p] as number) * k;
    const dx = bx - plant.x;
    out[v * 2] = plant.x + dx * Math.cos(a) - dy * Math.sin(a);
    out[v * 2 + 1] = plant.y + dx * Math.sin(a) + dy * Math.cos(a);
  }
}

/** A segment endpoint after sway (same transform as swayPositions). */
export function swayPoint(l: GardenLayout, plant: number, x: number, y: number, t: number): [number, number] {
  const p = l.plants[plant] as Plant;
  const angle = 0.035 * Math.sin(t * 0.9 + plant * 1.7) * (80 / (40 + p.height)) * 2;
  const dy = y - p.y;
  const a = angle * Math.min(1, -dy / p.height);
  const dx = x - p.x;
  return [p.x + dx * Math.cos(a) - dy * Math.sin(a), p.y + dx * Math.sin(a) + dy * Math.cos(a)];
}
