import type { NoteId, TagId, VaultGraph } from '../core/model';
import type { DateField } from '../core/lens/applyLenses';
import type { LabelDensity } from '../state/settingsStore';
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
  /** Cross-cutting actions views may trigger (lenses, preview lists, navigation). */
  actions: ViewActions;
  prefs: { labelDensity: LabelDensity; animationSpeed: number };
}

export interface ViewActions {
  includeTag(tag: TagId): void;
  setDateRange(field: DateField, from?: number, to?: number): void;
  /** Shows a list of notes in the preview panel (chord ribbon, calendar day). */
  showNoteList(title: string, ids: NoteId[]): void;
  previousView(): void;
}

/** One line of a view's legend. `kind` selects the little icon drawn next to it. */
export interface LegendItem {
  kind:
    | 'size'
    | 'color'
    | 'glow'
    | 'ghost'
    | 'comet'
    | 'line'
    | 'position'
    | 'scale'
    | 'sun'
    | 'stem'
    | 'seed'
    | 'arc'
    | 'ribbon'
    | 'time';
  label: string;
}

export interface ViewInstance {
  update(ctx: ViewContext): void;
  focusNode(id: NoteId): void;
  /** PNG of what the view shows on screen, at 2x. */
  exportImage(): Promise<Blob>;
  /** Standalone SVG (SVG views only). */
  exportSvg?(): string;
  destroy(): void;
}

export interface ViewModule {
  id: string;
  label: string;
  icon: string; // lucide icon name
  renderer: 'pixi' | 'svg';
  mount(el: HTMLElement, ctx: ViewContext): ViewInstance;
}
