/** All user-facing strings live here to make future translation easy. */
export const strings = {
  appName: 'Vault Lens',
  tagline: 'See your notes as a living map.',
  topBar: {
    openVault: 'Open vault',
    search: 'Search notes…',
    toggleLenses: 'Toggle lens panel',
    togglePreview: 'Toggle preview panel',
    views: 'Views',
  },
  lens: {
    title: 'Lenses',
    empty: 'Open a vault to filter notes by tag, folder, date and links.',
  },
  preview: {
    title: 'Preview',
    empty: 'Select a note to read it here.',
  },
  empty: {
    heading: 'Open a vault to begin',
    body: 'Pick a folder of markdown notes, drop one here, or upload a .zip. Your notes never leave your device.',
    trySample: 'Try the sample vault',
  },
  picker: {
    openFolder: 'Open folder',
    chooseFolder: 'Choose folder',
    uploadZip: 'Upload .zip',
    dropHint: 'or drop a vault folder or .zip anywhere',
    dropHere: 'Drop your vault folder or .zip',
    reconnect: (name: string) => `Reconnect “${name}”`,
    reconnectHint: 'Showing cached notes. Reconnect to pick up changes.',
  },
  progress: {
    listing: 'Finding notes…',
    parsing: (done: number, total: number) => `Parsed ${done.toLocaleString()} / ${total.toLocaleString()}`,
    building: 'Building graph…',
    saving: 'Saving cache…',
    layout: 'Arranging…',
  },
  stats: {
    notes: 'notes',
    links: 'links',
    tags: 'tags',
    orphans: 'orphans',
    ghosts: 'ghosts',
    warnings: (n: number) => `${n} warning${n === 1 ? '' : 's'}`,
    parsed: (parsed: number, cached: number, ms: number) =>
      `${parsed.toLocaleString()} parsed, ${cached.toLocaleString()} cached in ${(ms / 1000).toFixed(1)} s`,
  },
  tooltip: {
    words: (n: number) => `${n.toLocaleString()} words`,
    ghost: 'Missing note (linked but no file)',
    noTags: 'no tags',
  },
  errors: {
    empty: 'No markdown notes found in that folder.',
    dropUnsupported: 'Drop a folder or a .zip of markdown notes.',
    sample: 'Could not load the sample vault',
  },
  view: {
    canvasLabel: (notes: number, links: number) => `Graph of ${notes} notes and ${links} links`,
  },
  status: {
    offlineReady: 'Ready to work offline.',
    noVault: 'No vault open',
  },
} as const;
