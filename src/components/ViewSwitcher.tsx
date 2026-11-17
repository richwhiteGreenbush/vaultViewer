import { strings } from '../strings';
import { useViewStore } from '../state/viewStore';
import { views } from '../views/registry';

/** View picker in the top bar. Number keys 1–6 switch views too (see App). */
export function ViewSwitcher() {
  const active = useViewStore((s) => s.activeView);
  return (
    <select
      className="select"
      aria-label={strings.topBar.views}
      data-testid="view-select"
      value={active}
      onChange={(e) => useViewStore.getState().setActiveView(e.target.value)}
    >
      {views.map((v, i) => (
        <option key={v.id} value={v.id}>
          {`${i + 1}. ${v.label}`}
        </option>
      ))}
    </select>
  );
}
