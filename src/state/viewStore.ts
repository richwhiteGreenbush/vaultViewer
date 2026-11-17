import { create } from 'zustand';
import type { NoteId } from '../core/model';
import type { ScreenPoint } from '../views/types';
import { DEFAULT_VIEW, viewById } from '../views/registry';

export interface NoteList {
  title: string;
  ids: NoteId[];
}

interface ViewState {
  activeView: string;
  previousView: string;
  focus: NoteId | null;
  focusDepth: 1 | 2;
  hover: { id: NoteId; at: ScreenPoint } | null;
  layout: { settled: boolean; cached: number } | null;
  previewOpen: boolean;
  lensPanelOpen: boolean;
  /** A list of notes shown in the preview (chord ribbon, calendar day) instead of a single note. */
  noteList: NoteList | null;
  setActiveView(id: string): void;
  setFocus(id: NoteId | null, depth?: 1 | 2): void;
  setHover(id: NoteId | null, at?: ScreenPoint): void;
  setLayout(status: { settled: boolean; cached: number } | null): void;
  setPreviewOpen(open: boolean): void;
  setLensPanelOpen(open: boolean): void;
  showNoteList(list: NoteList | null): void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  activeView: DEFAULT_VIEW,
  previousView: DEFAULT_VIEW,
  focus: null,
  focusDepth: 1,
  hover: null,
  layout: null,
  previewOpen: false,
  lensPanelOpen: false,
  noteList: null,
  setActiveView: (id) => {
    if (!viewById(id) || id === get().activeView) return;
    set({ activeView: id, previousView: get().activeView, hover: null, layout: null, noteList: null });
  },
  // Focusing a note leaves list mode so the preview shows the note; the list stays available via "Back".
  setFocus: (focus, depth = 1) => set({ focus, focusDepth: focus ? depth : 1 }),
  setHover: (id, at) => set({ hover: id && at ? { id, at } : null }),
  setLayout: (layout) => set({ layout }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setLensPanelOpen: (lensPanelOpen) => set({ lensPanelOpen }),
  showNoteList: (noteList) =>
    set({ noteList, focus: null, previewOpen: noteList ? true : get().previewOpen }),
}));
