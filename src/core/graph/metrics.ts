import type { Link, NoteId, VaultGraph } from '../model';

export function degree(graph: VaultGraph, id: NoteId): number {
  return (graph.outLinks.get(id)?.length ?? 0) + (graph.inLinks.get(id)?.length ?? 0);
}

export function isOrphan(graph: VaultGraph, id: NoteId): boolean {
  return degree(graph, id) === 0;
}

export function orphans(graph: VaultGraph): NoteId[] {
  return [...graph.notes.keys()].filter((id) => isOrphan(graph, id)).sort();
}

/** Undirected co-occurrence counts for tags that appear together on a note. */
export function tagCooccurrence(noteTags: Iterable<string[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const tags of noteTags) {
    const sorted = [...new Set(tags)].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|${sorted[j]}`;
        out.set(key, (out.get(key) ?? 0) + 1);
      }
    }
  }
  return out;
}

/** Stable hash of the graph's structure; used to key cached layouts. */
export function graphHash(nodeIds: string[], links: Pick<Link, 'source' | 'target'>[]): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c;
  };
  for (const id of [...nodeIds].sort()) mix(id);
  for (const key of links.map((l) => `${l.source}>${l.target}`).sort()) mix(key);
  return `${(h >>> 0).toString(16)}-${nodeIds.length}-${links.length}`;
}
