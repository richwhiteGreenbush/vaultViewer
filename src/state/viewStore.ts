import { create } from 'zustand';
import type { NoteId } from '../core/model';
import type { ScreenPoint } from '../views/types';
import { DEFAULT_VIEW } from '../views/registry';

interface ViewState {
  activeView: string;
  focus: NoteId | null;
  hover: { id: NoteId; at: ScreenPoint } | null;
  layout: { settled: boolean; cached: number } | null;
  setActiveView(id: string): void;
  setFocus(id: NoteId | null): void;
  setHover(id: NoteId | null, at?: ScreenPoint): void;
  setLayout(status: { settled: boolean; cached: number } | null): void;
}

export const useViewStore = create<ViewState>((set) => ({
  activeView: DEFAULT_VIEW,
  focus: null,
  hover: null,
  layout: null,
  setActiveView: (activeView) => set({ activeView }),
  setFocus: (focus) => set({ focus }),
  setHover: (id, at) => set({ hover: id && at ? { id, at } : null }),
  setLayout: (layout) => set({ layout }),
}));
