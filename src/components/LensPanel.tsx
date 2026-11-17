import { strings } from '../strings';

export function LensPanel({ open }: { open: boolean }) {
  return (
    <aside
      className={`side-panel side-panel--left${open ? ' is-open' : ''}`}
      aria-label={strings.lens.title}
      hidden={!open}
    >
      <h2>{strings.lens.title}</h2>
      <p className="muted">{strings.lens.empty}</p>
    </aside>
  );
}
