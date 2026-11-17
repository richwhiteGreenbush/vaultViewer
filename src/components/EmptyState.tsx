import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { VaultPicker } from './VaultPicker';

export function EmptyState() {
  const status = useVaultStore((s) => s.status);
  const progress = useVaultStore((s) => s.progress);
  const error = useVaultStore((s) => s.error);
  const loading = status === 'loading';

  let progressText: string = strings.progress.listing;
  if (progress?.phase === 'parsing') progressText = strings.progress.parsing(progress.done, progress.total);
  else if (progress?.phase === 'building') progressText = strings.progress.building;
  else if (progress?.phase === 'saving') progressText = strings.progress.saving;

  return (
    <section className="empty-state" data-testid="empty-state">
      <div className={`empty-state__orbit${loading ? ' is-loading' : ''}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {loading ? (
        <>
          <h2>{strings.progress.layout}</h2>
          <p role="status" aria-live="polite" data-testid="progress">
            {progressText}
          </p>
          {progress?.phase === 'parsing' && progress.total > 0 && (
            <progress max={progress.total} value={progress.done} aria-label={progressText} />
          )}
        </>
      ) : (
        <>
          <h2>{strings.empty.heading}</h2>
          <p>{strings.empty.body}</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="empty-state__actions">
            <VaultPicker />
          </div>
          <p className="muted small">{strings.picker.dropHint}</p>
        </>
      )}
    </section>
  );
}
