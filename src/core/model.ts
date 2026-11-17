/** Core data model shared by every view (PLAN.md §4). Pure TS: no DOM, no React. */

export type NoteId = string; // normalized vault-relative path, no extension, lowercase
export type TagId = string; // normalized tag, lowercase, no leading '#', nested with '/'
export type FolderId = string; // normalized folder path, '' is the vault root

export interface Note {
  id: NoteId;
  path: string; // original vault-relative path with original casing, e.g. "Projects/Alpha.md"
  title: string; // frontmatter title > first H1 > filename
  folder: FolderId;
  aliases: string[];
  tags: TagId[]; // union of frontmatter tags and inline #tags, deduplicated
  frontmatter: Record<string, unknown>;
  headings: { depth: number; text: string }[];
  wordCount: number;
  charCount: number;
  created: number; // epoch ms (assumption A19)
  updated: number; // epoch ms
  excerpt: string;
  isAttachment?: false;
}

export type LinkKind = 'wikilink' | 'markdown' | 'embed';

export interface Link {
  id: string; // `${source}->${target}#${index}`
  source: NoteId;
  target: NoteId; // resolved id, or a ghost id
  kind: LinkKind;
  heading?: string;
  alias?: string;
  resolved: boolean;
}

export interface Tag {
  id: TagId;
  parent?: TagId;
  noteIds: NoteId[];
  color: string;
}

export interface Folder {
  id: FolderId;
  parent?: FolderId;
  name: string;
  noteIds: NoteId[];
  childFolderIds: FolderId[];
}

export interface VaultStats {
  noteCount: number;
  linkCount: number;
  tagCount: number;
  orphanCount: number; // no in or out links
  ghostCount: number;
  dateRange: [number, number];
}

export interface VaultGraph {
  vaultName: string;
  notes: Map<NoteId, Note>;
  links: Link[];
  ghosts: Set<NoteId>;
  tags: Map<TagId, Tag>;
  folders: Map<FolderId, Folder>;
  outLinks: Map<NoteId, Link[]>;
  inLinks: Map<NoteId, Link[]>;
  tagCooccurrence: Map<string, number>; // key `${a}|${b}` with a < b
  stats: VaultStats;
}

/** A link as written in a note, before resolution. */
export interface RawLink {
  kind: LinkKind;
  target: string; // as written, without heading/alias (for markdown links: URL-decoded path)
  heading?: string;
  alias?: string;
}

/** Output of parsing one file. Cached in IndexedDB by path + lastModified. */
export interface ParsedNote {
  note: Note;
  rawLinks: RawLink[];
  warnings: string[];
}

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  z?: number;
}

export interface LayoutSnapshot {
  viewId: string;
  vaultHash: string;
  positions: NodePosition[];
}
