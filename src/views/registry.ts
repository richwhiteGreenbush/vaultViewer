import type { ViewModule } from './types';

/**
 * Registry of views. Each entry carries the metadata the view switcher needs plus a loader, so every view
 * (and its renderer, e.g. PixiJS) is a lazy-loaded chunk.
 */
export interface ViewEntry extends Pick<ViewModule, 'id' | 'label' | 'icon' | 'renderer'> {
  load(): Promise<ViewModule>;
}

export const views: ViewEntry[] = [
  {
    id: 'force',
    label: 'Force graph',
    icon: 'share-2',
    renderer: 'pixi',
    load: () => import('./force').then((m) => m.forceView),
  },
];

export const DEFAULT_VIEW = 'force';

export const viewById = (id: string): ViewEntry | undefined => views.find((v) => v.id === id);
