import { strings } from '../strings';

export function EmptyState() {
  return (
    <section className="empty-state" data-testid="empty-state">
      <div className="empty-state__orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>{strings.empty.heading}</h2>
      <p>{strings.empty.body}</p>
      <div className="empty-state__actions">
        <button type="button" className="btn btn--primary" disabled title={strings.empty.comingSoon}>
          {strings.topBar.openVault}
        </button>
        <button type="button" className="btn" disabled title={strings.empty.comingSoon}>
          {strings.empty.trySample}
        </button>
      </div>
      <p className="muted small">{strings.empty.comingSoon}</p>
    </section>
  );
}
