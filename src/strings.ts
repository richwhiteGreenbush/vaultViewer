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
    comingSoon: 'Vault loading arrives in the next build phase.',
  },
  status: {
    offlineReady: 'Ready to work offline.',
    noVault: 'No vault open',
  },
} as const;
