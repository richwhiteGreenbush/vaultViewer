import type { Folder, FolderId, Link, Note, NoteId, ParsedNote, Tag, TagId, VaultGraph } from '../model';
import { palettes, DEFAULT_THEME } from '../color/palettes';
import { tagColor } from '../color/tagColor';
import { folderOf } from '../parse/paths';
import { LinkResolver } from './resolve';
import { tagCooccurrence } from './metrics';

/** Builds the shared VaultGraph from parsed notes (PLAN §4). Pure and deterministic. */
export function buildGraph(parsed: ParsedNote[], vaultName: string): VaultGraph {
  const sorted = [...parsed].sort((a, b) => (a.note.id < b.note.id ? -1 : a.note.id > b.note.id ? 1 : 0));
  const notes = new Map<NoteId, Note>();
  for (const p of sorted) if (!notes.has(p.note.id)) notes.set(p.note.id, p.note);

  const resolver = new LinkResolver(notes.values());
  const links: Link[] = [];
  const ghosts = new Set<NoteId>();
  const outLinks = new Map<NoteId, Link[]>();
  const inLinks = new Map<NoteId, Link[]>();

  for (const p of sorted) {
    const source = p.note.id;
    if (notes.get(source) !== p.note) continue; // duplicate id (e.g. a.md and a.markdown)
    let index = 0;
    for (const raw of p.rawLinks) {
      const { target, resolved } = resolver.resolve(raw, source);
      if (!resolved && raw.kind === 'markdown') continue; // markdown links count only when they hit a note
      const link: Link = {
        id: `${source}->${target}#${index++}`,
        source,
        target,
        kind: raw.kind,
        resolved,
        ...(raw.heading ? { heading: raw.heading } : {}),
        ...(raw.alias ? { alias: raw.alias } : {}),
      };
      links.push(link);
      if (!resolved) ghosts.add(target);
      push(outLinks, source, link);
      push(inLinks, target, link);
    }
  }

  // Tags, including implied parents of nested tags.
  const theme = palettes[DEFAULT_THEME];
  const tags = new Map<TagId, Tag>();
  const ensureTag = (id: TagId): Tag => {
    let tag = tags.get(id);
    if (!tag) {
      const slash = id.lastIndexOf('/');
      const parent = slash > 0 ? id.slice(0, slash) : undefined;
      tag = { id, noteIds: [], color: tagColor(id, theme), ...(parent ? { parent } : {}) };
      tags.set(id, tag);
      if (parent) ensureTag(parent);
    }
    return tag;
  };
  for (const note of notes.values()) for (const t of note.tags) ensureTag(t).noteIds.push(note.id);

  // Folders, including every ancestor and the root ''.
  const folders = new Map<FolderId, Folder>();
  const ensureFolder = (id: FolderId): Folder => {
    let folder = folders.get(id);
    if (!folder) {
      const parent = id === '' ? undefined : folderOf(id);
      folder = {
        id,
        name: id === '' ? vaultName : id.slice(id.lastIndexOf('/') + 1),
        noteIds: [],
        childFolderIds: [],
        ...(parent !== undefined ? { parent } : {}),
      };
      folders.set(id, folder);
      if (parent !== undefined) ensureFolder(parent).childFolderIds.push(id);
    }
    return folder;
  };
  ensureFolder('');
  for (const note of notes.values()) ensureFolder(note.folder).noteIds.push(note.id);

  let min = Infinity;
  let max = -Infinity;
  let orphanCount = 0;
  for (const note of notes.values()) {
    min = Math.min(min, note.created, note.updated);
    max = Math.max(max, note.created, note.updated);
    if (!outLinks.has(note.id) && !inLinks.has(note.id)) orphanCount++;
  }

  return {
    vaultName,
    notes,
    links,
    ghosts,
    tags,
    folders,
    outLinks,
    inLinks,
    tagCooccurrence: tagCooccurrence([...notes.values()].map((n) => n.tags)),
    stats: {
      noteCount: notes.size,
      linkCount: links.length,
      tagCount: tags.size,
      orphanCount,
      ghostCount: ghosts.size,
      dateRange: notes.size ? [min, max] : [0, 0],
    },
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
