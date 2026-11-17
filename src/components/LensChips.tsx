import { strings } from '../strings';
import { useLensStore } from '../state/lensStore';
import { lensChips } from './lensChipModel';

/** Active lenses as removable chips in the top bar. */
export function LensChips() {
  const lens = useLensStore((s) => s.lens);
  const chips = lensChips(lens);
  if (!chips.length) return null;
  return (
    <ul className="chips" aria-label={strings.lens.active} data-testid="lens-chips">
      {chips.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            className="chip"
            aria-label={strings.lens.removeChip(c.label)}
            onClick={() => useLensStore.getState().setLens(c.remove)}
          >
            {c.label} <span aria-hidden="true">×</span>
          </button>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <button type="button" className="chip chip--clear" onClick={() => useLensStore.getState().reset()}>
            {strings.lens.clearAll}
          </button>
        </li>
      )}
    </ul>
  );
}
