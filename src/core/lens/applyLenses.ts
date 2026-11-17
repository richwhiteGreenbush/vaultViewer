import type { FolderId, NoteId, TagId, VaultGraph } from '../model';
import { degree } from '../graph/metrics';

export type DateField = 'created' | 'updated';

/** Filters applied to the graph before any view renders it (PLAN §7 Phase 2). Serializable to the URL. */
export interface LensState {
  tags: { include: TagId[]; mode: 'any' | 'all'; exclude: TagId[] };
  folders: { include: FolderId[]; exclude: FolderId[] };
  date: { field: DateField; from?: number; to?: number }; // epoch ms, inclusive; `to` covers the whole day
  degree: { min?: number; max?: number };
  showOrphans: boolean;
  showGhosts: boolean;
  showAttachments: boolean; // attachments are not nodes in v1; kept so URLs stay stable
}

export const defaultLens = (): LensState => ({
  tags: { include: [], mode: 'any', exclude: [] },
  folders: { include: [], exclude: [] },
  date: { field: 'updated' },
  degree: {},
  showOrphans: true,
  showGhosts: true,
  showAttachments: false,
});

export interface VisibleSets {
  notes: Set<NoteId>; // visible notes and visible ghosts
  links: Set<string>;
  noteCount: number; // visible real notes (excludes ghosts)
  linkCount: number;
}

/** True if `tag` is `selected` or nested under it ("project/alpha" matches "project"). */
export const tagMatches = (tag: TagId, selected: TagId): boolean =>
  tag === selected || tag.startsWith(`${selected}/`);

const inFolder = (folder: FolderId, selected: FolderId): boolean =>
  selected === '' || folder === selected || folder.startsWith(`${selected}/`);

export function isLensActive(l: LensState): boolean {
  return (
    l.tags.include.length > 0 ||
    l.tags.exclude.length > 0 ||
    l.folders.include.length > 0 ||
    l.folders.exclude.length > 0 ||
    l.date.from !== undefined ||
    l.date.to !== undefined ||
    l.degree.min !== undefined ||
    l.degree.max !== undefined ||
    !l.showOrphans ||
    !l.showGhosts
  );
}

/** Pure: LensState + VaultGraph → visible note/ghost ids and link ids. A link is visible when both ends are. */
export function applyLenses(graph: VaultGraph, lens: LensState): VisibleSets {
  const notes = new Set<NoteId>();
  const { tags, folders, date } = lens;
  const minDeg = lens.degree.min;
  const maxDeg = lens.degree.max;

  for (const note of graph.notes.values()) {
    if (tags.include.length) {
      const has = (sel: TagId) => note.tags.some((t) => tagMatches(t, sel));
      if (tags.mode === 'all' ? !tags.include.every(has) : !tags.include.some(has)) continue;
    }
    if (tags.exclude.length && note.tags.some((t) => tags.exclude.some((sel) => tagMatches(t, sel))))
      continue;
    if (folders.include.length && !folders.include.some((f) => inFolder(note.folder, f))) continue;
    if (folders.exclude.some((f) => inFolder(note.folder, f))) continue;
    const when = note[date.field];
    if (date.from !== undefined && when < date.from) continue;
    if (date.to !== undefined && when > date.to) continue;
    if (minDeg !== undefined || maxDeg !== undefined || !lens.showOrphans) {
      const d = degree(graph, note.id);
      if (minDeg !== undefined && d < minDeg) continue;
      if (maxDeg !== undefined && d > maxDeg) continue;
      if (!lens.showOrphans && d === 0) continue;
    }
    notes.add(note.id);
  }
  const noteCount = notes.size;

  // Count visible links and reveal ghosts; the Set of link ids is only built if a consumer asks for it
  // (it is ~20k strings on a large vault, and the force view works from node masks instead).
  let linkCount = 0;
  const realNotes = new Set(notes);
  const linkVisible = (link: (typeof graph.links)[number]) =>
    realNotes.has(link.source) && (link.resolved ? realNotes.has(link.target) : lens.showGhosts);
  for (const link of graph.links) {
    if (!linkVisible(link)) continue;
    if (!link.resolved) notes.add(link.target); // a ghost is visible when a visible note links to it
    linkCount++;
  }
  let links: Set<string> | undefined;
  return {
    notes,
    get links() {
      links ??= new Set(graph.links.filter(linkVisible).map((l) => l.id));
      return links;
    },
    noteCount,
    linkCount,
  };
}

/** Notes within `depth` hops (either direction) of `id`, including `id`. */
export function neighbourhood(
  graph: VaultGraph,
  id: NoteId,
  depth: number,
  visible?: Set<NoteId>,
): Set<NoteId> {
  const out = new Set<NoteId>([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: NoteId[] = [];
    for (const n of frontier) {
      for (const l of graph.outLinks.get(n) ?? []) {
        if ((!visible || visible.has(l.target)) && !out.has(l.target)) {
          out.add(l.target);
          next.push(l.target);
        }
      }
      for (const l of graph.inLinks.get(n) ?? []) {
        if ((!visible || visible.has(l.source)) && !out.has(l.source)) {
          out.add(l.source);
          next.push(l.source);
        }
      }
    }
    frontier = next;
  }
  return out;
}
