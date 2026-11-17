import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';

/** Errors that happen while a vault is already shown (empty folder, failed refresh) appear here. */
export function ErrorBanner() {
  const error = useVaultStore((s) => s.error);
  if (!error) return null;
  return (
    <div className="error-banner" role="alert" data-testid="error-banner">
      <span>{error}</span>
      <button
        type="button"
        className="icon-btn"
        aria-label={strings.warnings.close}
        onClick={() => useVaultStore.setState({ error: null })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
