import { palettes, type ThemeId } from '../core/color/palettes';
import { strings } from '../strings';
import { useThemeStore, type ThemeChoice } from '../state/themeStore';

export function ThemeSwitcher() {
  const choice = useThemeStore((s) => s.choice);
  return (
    <select
      className="select"
      aria-label={strings.theme.label}
      data-testid="theme-select"
      value={choice}
      onChange={(e) => useThemeStore.getState().setTheme(e.target.value as ThemeChoice)}
    >
      {(Object.keys(palettes) as ThemeId[]).map((id) => (
        <option key={id} value={id}>
          {palettes[id].label}
        </option>
      ))}
      <option value="system">{strings.theme.system}</option>
    </select>
  );
}
