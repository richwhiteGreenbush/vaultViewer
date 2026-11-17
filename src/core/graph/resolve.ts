import type { Note, NoteId, RawLink } from '../model';
import { folderOf, joinPath, NOTE_EXT, normalizePath } from '../parse/paths';

export interface Resolution {
  target: NoteId;
  resolved: boolean;
}

const byPathThenAlpha = (a: string, b: string): number => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/** Index over the vault's notes for Obsidian-style link resolution (PLAN §4.3). */
export class LinkResolver {
  private ids = new Set<NoteId>();
  /** last path segment → ids; also every trailing sub-path ("alpha/plan") → ids */
  private suffixes = new Map<string, NoteId[]>();
  private aliases = new Map<string, NoteId[]>();

  constructor(notes: Iterable<Note>) {
    for (const note of notes) {
      this.ids.add(note.id);
      const segs = note.id.split('/');
      for (let i = 1; i < segs.length; i++) push(this.suffixes, segs.slice(i).join('/'), note.id);
      for (const alias of note.aliases) push(this.aliases, alias.toLowerCase(), note.id);
    }
    for (const list of this.suffixes.values()) list.sort(byPathThenAlpha);
    for (const list of this.aliases.values()) list.sort(byPathThenAlpha);
  }

  /**
   * Resolution order:
   * 1. exact vault-relative path (with or without .md), case-insensitive
   * 2. path relative to the source note's folder
   * 3. unique basename (or trailing sub-path) match anywhere
   * 4. frontmatter alias
   * 5. several basename matches → shortest path, then alphabetical
   * 6. otherwise a ghost
   */
  resolve(link: RawLink, sourceId: NoteId): Resolution {
    const written = link.target.trim().replace(/\\/g, '/').replace(NOTE_EXT, '').toLowerCase();
    const t = normalizePath(written);
    const sourceFolder = folderOf(sourceId);

    if (link.kind === 'markdown') {
      // Markdown links are paths: relative to the note first, then from the vault root. Never ghosts.
      const rel = joinPath(sourceFolder, written);
      if (this.ids.has(rel)) return { target: rel, resolved: true };
      if (this.ids.has(t)) return { target: t, resolved: true };
      return { target: rel, resolved: false };
    }

    if (this.ids.has(t)) return { target: t, resolved: true };
    if (sourceFolder) {
      const rel = joinPath(sourceFolder, written);
      if (this.ids.has(rel)) return { target: rel, resolved: true };
    }
    const matches = this.suffixes.get(t) ?? [];
    if (matches.length === 1) return { target: matches[0] as NoteId, resolved: true };
    const aliasMatch = this.aliases.get(link.target.trim().toLowerCase());
    if (aliasMatch?.length) return { target: aliasMatch[0] as NoteId, resolved: true };
    if (matches.length > 1) return { target: matches[0] as NoteId, resolved: true };
    return { target: t, resolved: false };
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
