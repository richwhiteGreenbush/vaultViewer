import { create } from 'zustand';
import { DEFAULT_THEME, palettes, type ThemeId, type ThemePalette } from '../core/color/palettes';
import { db } from '../cache/db';

export type ThemeChoice = ThemeId | 'system';

interface ThemeState {
  choice: ThemeChoice;
  theme: ThemePalette;
  reducedMotion: boolean;
  setTheme(choice: ThemeChoice): void;
  init(): Promise<void>;
}

const prefersDark = () =>
  typeof matchMedia !== 'function' || matchMedia('(prefers-color-scheme: dark)').matches;
const resolve = (choice: ThemeChoice): ThemePalette =>
  palettes[choice === 'system' ? (prefersDark() ? 'darkSpace' : 'pastel') : choice];
const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function apply(theme: ThemePalette): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  choice: DEFAULT_THEME,
  theme: palettes[DEFAULT_THEME],
  reducedMotion: reduced(),
  setTheme(choice) {
    const theme = resolve(choice);
    apply(theme);
    set({ choice, theme });
    void db()
      .settings.put({ key: 'theme', value: choice })
      .catch(() => undefined);
  },
  async init() {
    apply(get().theme);
    if (typeof matchMedia === 'function') {
      matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () =>
        set({ reducedMotion: reduced() }),
      );
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (get().choice === 'system') get().setTheme('system');
      });
    }
    try {
      const saved = (await db().settings.get('theme'))?.value;
      if (typeof saved === 'string' && (saved === 'system' || saved in palettes)) {
        const theme = resolve(saved as ThemeChoice);
        apply(theme);
        set({ choice: saved as ThemeChoice, theme });
      }
    } catch {
      /* storage blocked: keep default */
    }
  },
}));
