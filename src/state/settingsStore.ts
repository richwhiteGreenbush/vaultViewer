import { create } from 'zustand';
import { db } from '../cache/db';
import { DEFAULT_IGNORE } from '../core/parse/paths';
import { DEFAULT_VIEW } from '../views/registry';

export type LabelDensity = 'low' | 'normal' | 'high';

export interface Prefs {
  ignore: string[]; // folder names skipped when scanning a vault
  defaultView: string;
  labelDensity: LabelDensity;
  animationSpeed: number; // multiplier for ambient animation (orbits, sway, comets, pulse)
  watch: boolean; // watch an opened folder for changes (Chromium)
}

export const defaultPrefs = (): Prefs => ({
  ignore: [...DEFAULT_IGNORE],
  defaultView: DEFAULT_VIEW,
  labelDensity: 'normal',
  animationSpeed: 1,
  watch: false,
});

interface SettingsState {
  prefs: Prefs;
  loaded: boolean;
  settingsOpen: boolean;
  update(patch: Partial<Prefs>): void;
  setSettingsOpen(open: boolean): void;
  init(): Promise<Prefs>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  prefs: defaultPrefs(),
  loaded: false,
  settingsOpen: false,
  update(patch) {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    void db()
      .settings.put({ key: 'prefs', value: prefs })
      .catch(() => undefined);
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  async init() {
    try {
      const saved = (await db().settings.get('prefs'))?.value as Partial<Prefs> | undefined;
      if (saved && typeof saved === 'object') set({ prefs: { ...defaultPrefs(), ...saved } });
    } catch {
      /* storage blocked: defaults */
    }
    set({ loaded: true });
    return get().prefs;
  },
}));
