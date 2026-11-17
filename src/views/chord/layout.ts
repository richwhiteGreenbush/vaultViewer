import type { Note, NoteId, TagId } from '../../core/model';

/** Pure chord layout (PLAN §7 Phase 3.4): arc length = note count, ribbon width = co-occurrence. */

export interface ChordGroup {
  tag: TagId;
  index: number;
  count: number;
  startAngle: number;
  endAngle: number;
}

export interface ChordRibbon {
  a: number;
  b: number;
  count: number;
  source: { startAngle: number; endAngle: number };
  target: { startAngle: number; endAngle: number };
  noteIds: NoteId[];
}

export interface ChordLayout {
  groups: ChordGroup[];
  ribbons: ChordRibbon[];
  notesByTag: Map<TagId, NoteId[]>;
}

const PAD = 0.025; // radians between arcs

export function chordLayout(notes: Iterable<Note>, topN: number): ChordLayout {
  const notesByTag = new Map<TagId, NoteId[]>();
  const list = [...notes];
  for (const n of list) {
    for (const t of new Set(n.tags)) {
      const l = notesByTag.get(t) ?? [];
      l.push(n.id);
      notesByTag.set(t, l);
    }
  }
  const top = [...notesByTag.entries()]
    .sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : 1))
    .slice(0, Math.max(0, topN))
    .map(([t]) => t)
    .sort(); // alphabetical around the circle so related prefixes (project/…) sit together
  const idx = new Map(top.map((t, i) => [t, i]));

  // Co-occurrence among the chosen tags, with the notes behind each pair.
  const pairNotes = new Map<string, NoteId[]>();
  for (const n of list) {
    const tags = [...new Set(n.tags)].filter((t) => idx.has(t)).sort();
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = `${idx.get(tags[i] as TagId)}|${idx.get(tags[j] as TagId)}`;
        const l = pairNotes.get(key) ?? [];
        l.push(n.id);
        pairNotes.set(key, l);
      }
    }
  }

  const counts = top.map((t) => notesByTag.get(t)?.length ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const avail = Math.max(0, Math.PI * 2 - PAD * top.length);
  const groups: ChordGroup[] = [];
  let angle = 0;
  top.forEach((tag, i) => {
    const span = total ? (avail * (counts[i] as number)) / total : 0;
    groups.push({ tag, index: i, count: counts[i] as number, startAngle: angle, endAngle: angle + span });
    angle += span + PAD;
  });

  // Each arc hands out sub-spans to its ribbons in proportion to co-occurrence, never exceeding its own span.
  const rowSum = new Array<number>(top.length).fill(0);
  for (const [key, ids] of pairNotes) {
    const [a, b] = key.split('|').map(Number) as [number, number];
    rowSum[a] = (rowSum[a] as number) + ids.length;
    rowSum[b] = (rowSum[b] as number) + ids.length;
  }
  const cursor = groups.map((g) => g.startAngle);
  const unit = groups.map((g, i) => (g.endAngle - g.startAngle) / Math.max(g.count, rowSum[i] as number, 1));
  const take = (i: number, n: number) => {
    const start = cursor[i] as number;
    cursor[i] = start + (unit[i] as number) * n;
    return { startAngle: start, endAngle: cursor[i] as number };
  };
  const ribbons: ChordRibbon[] = [...pairNotes.entries()]
    .map(([key, noteIds]) => {
      const [a, b] = key.split('|').map(Number) as [number, number];
      return { a, b, noteIds: noteIds.sort() };
    })
    .sort((x, y) => x.a - y.a || x.b - y.b)
    .map(({ a, b, noteIds }) => ({
      a,
      b,
      count: noteIds.length,
      source: take(a, noteIds.length),
      target: take(b, noteIds.length),
      noteIds,
    }));

  return { groups, ribbons, notesByTag };
}
