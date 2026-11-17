import { create } from 'zustand';
import type { NoteId } from '../core/model';
import type { ScreenPoint } from '../views/types';
import { DEFAULT_VIEW } from '../views/registry';

interface ViewState {
  activeView: string;
  focus: NoteId | null;
  focusDepth: 1 | 2;
  hover: { id: NoteId; at: ScreenPoint } | null;
  layout: { settled: boolean; cached: number } | null;
  previewOpen: boolean;
  lensPanelOpen: boolean;
  setActiveView(id: string): void;
  setFocus(id: NoteId | null, depth?: 1 | 2): void;
  setHover(id: NoteId | null, at?: ScreenPoint): void;
  setLayout(status: { settled: boolean; cached: number } | null): void;
  setPreviewOpen(open: boolean): void;
  setLensPanelOpen(open: boolean): void;
}

export const useViewStore = create<ViewState>((set) => ({
  activeView: DEFAULT_VIEW,
  focus: null,
  focusDepth: 1,
  hover: null,
  layout: null,
  previewOpen: false,
  lensPanelOpen: false,
  setActiveView: (activeView) => set({ activeView }),
  setFocus: (focus, depth = 1) => set({ focus, focusDepth: focus ? depth : 1 }),
  setHover: (id, at) => set({ hover: id && at ? { id, at } : null }),
  setLayout: (layout) => set({ layout }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setLensPanelOpen: (lensPanelOpen) => set({ lensPanelOpen }),
}));
