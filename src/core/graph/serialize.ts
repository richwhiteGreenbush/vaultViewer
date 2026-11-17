import type { Folder, Link, Note, Tag, VaultGraph, VaultStats } from '../model';

/** Plain-JSON form of VaultGraph (Maps/Sets → arrays). outLinks/inLinks are rebuilt from links. */
export interface SerializedGraph {
  version: 1;
  vaultName: string;
  notes: Note[];
  links: Link[];
  ghosts: string[];
  tags: Tag[];
  folders: Folder[];
  tagCooccurrence: [string, number][];
  stats: VaultStats;
}

export function serializeGraph(g: VaultGraph): SerializedGraph {
  return {
    version: 1,
    vaultName: g.vaultName,
    notes: [...g.notes.values()],
    links: g.links,
    ghosts: [...g.ghosts],
    tags: [...g.tags.values()],
    folders: [...g.folders.values()],
    tagCooccurrence: [...g.tagCooccurrence],
    stats: g.stats,
  };
}

export function deserializeGraph(s: SerializedGraph): VaultGraph {
  const outLinks = new Map<string, Link[]>();
  const inLinks = new Map<string, Link[]>();
  for (const l of s.links) {
    (outLinks.get(l.source) ?? outLinks.set(l.source, []).get(l.source))?.push(l);
    (inLinks.get(l.target) ?? inLinks.set(l.target, []).get(l.target))?.push(l);
  }
  return {
    vaultName: s.vaultName,
    notes: new Map(s.notes.map((n) => [n.id, n])),
    links: s.links,
    ghosts: new Set(s.ghosts),
    tags: new Map(s.tags.map((t) => [t.id, t])),
    folders: new Map(s.folders.map((f) => [f.id, f])),
    outLinks,
    inLinks,
    tagCooccurrence: new Map(s.tagCooccurrence),
    stats: s.stats,
  };
}
