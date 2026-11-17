import { strings } from '../strings';

export function PreviewPanel({ open }: { open: boolean }) {
  return (
    <aside
      className={`side-panel side-panel--right${open ? ' is-open' : ''}`}
      aria-label={strings.preview.title}
      hidden={!open}
    >
      <h2>{strings.preview.title}</h2>
      <p className="muted">{strings.preview.empty}</p>
    </aside>
  );
}
