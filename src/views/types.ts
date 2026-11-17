import type { NoteId, VaultGraph } from '../core/model';
import type { ThemePalette } from '../core/color/palettes';
import type { LayoutClient } from '../workers/clients';

export interface ScreenPoint {
  x: number; // client (viewport) coordinates
  y: number;
}

export interface ViewContext {
  graph: VaultGraph;
  vaultHash: string; // keys cached layouts
  visible: { notes: Set<NoteId>; links: Set<string> }; // after lenses
  theme: ThemePalette;
  focus: NoteId | null;
  focusDepth: 1 | 2; // 1-hop or (shift+click) 2-hop neighbourhood stays bright
  reducedMotion: boolean;
  layout: LayoutClient;
  onFocus(id: NoteId | null, depth?: 1 | 2): void;
  /** Enter on a focused node: open the preview. */
  onActivate(id: NoteId): void;
  onHover(id: NoteId | null, at?: ScreenPoint): void;
  onLayoutStatus?(status: { settled: boolean; cached: number }): void;
}

export interface ViewInstance {
  update(ctx: ViewContext): void;
  focusNode(id: NoteId): void;
  exportImage(): Promise<Blob>;
  destroy(): void;
}

export interface ViewModule {
  id: string;
  label: string;
  icon: string; // lucide icon name
  renderer: 'pixi' | 'svg';
  mount(el: HTMLElement, ctx: ViewContext): ViewInstance;
}
