import type { LegendItem, ViewModule } from './types';

/**
 * Registry of views. Each entry carries the metadata the switcher and legend need plus a loader, so every view
 * (and its renderer, e.g. PixiJS) is a lazy-loaded chunk.
 */
export interface ViewEntry extends Pick<ViewModule, 'id' | 'label' | 'icon' | 'renderer'> {
  load(): Promise<ViewModule>;
  legend: LegendItem[];
}

const common: LegendItem[] = [
  { kind: 'size', label: 'Size: word count' },
  { kind: 'color', label: 'Colour: first tag (folder if untagged)' },
  { kind: 'glow', label: 'Glow: recently updated' },
];

export const views: ViewEntry[] = [
  {
    id: 'force',
    label: 'Force graph',
    icon: 'share-2',
    renderer: 'pixi',
    load: () => import('./force').then((m) => m.forceView),
    legend: [
      ...common,
      { kind: 'line', label: 'Lines: links between notes' },
      { kind: 'ghost', label: 'Hollow: linked note that does not exist' },
      { kind: 'comet', label: 'Comet: note with no links' },
    ],
  },
  {
    id: 'galaxy',
    label: 'Galaxy',
    icon: 'orbit',
    renderer: 'pixi',
    load: () => import('./galaxy').then((m) => m.galaxyView),
    legend: [
      { kind: 'sun', label: 'Sun: top-level folder (size = notes); moons: subfolders' },
      { kind: 'position', label: 'Orbit: more links = closer to the sun' },
      ...common,
      { kind: 'line', label: 'Hyperlanes: links between folders' },
      { kind: 'ghost', label: 'Asteroids: missing notes' },
      { kind: 'comet', label: 'Comets: notes with no links' },
    ],
  },
  {
    id: 'tagGarden',
    label: 'Tag garden',
    icon: 'flower-2',
    renderer: 'pixi',
    load: () => import('./tagGarden').then((m) => m.tagGardenView),
    legend: [
      { kind: 'stem', label: 'Plant: top-level tag (height = notes); branches: nested tags' },
      { kind: 'color', label: 'Flower: a note, on the plant of its first tag' },
      { kind: 'size', label: 'Flower size: word count' },
      { kind: 'line', label: 'Vines: the note’s other tags' },
      { kind: 'seed', label: 'Compost: untagged notes' },
    ],
  },
];

export const DEFAULT_VIEW = 'force';

export const viewById = (id: string): ViewEntry | undefined => views.find((v) => v.id === id);
