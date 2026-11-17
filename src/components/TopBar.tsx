import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { VaultPicker } from './VaultPicker';

interface Props {
  lensOpen: boolean;
  previewOpen: boolean;
  onToggleLens(): void;
  onTogglePreview(): void;
}

export function TopBar({ lensOpen, previewOpen, onToggleLens, onTogglePreview }: Props) {
  const hasGraph = useVaultStore((s) => !!s.graph);
  const needsReconnect = useVaultStore((s) => s.needsReconnect);
  const lastName = useVaultStore((s) => s.lastVault?.name);
  return (
    <header className="top-bar">
      <button
        type="button"
        className="icon-btn"
        aria-label={strings.topBar.toggleLenses}
        aria-pressed={lensOpen}
        onClick={onToggleLens}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
      </button>
      <div className="brand">
        <img src="./favicon.svg" alt="" width={24} height={24} />
        <h1>{strings.appName}</h1>
      </div>
      <input
        className="search"
        type="search"
        placeholder={strings.topBar.search}
        aria-label={strings.topBar.search}
        disabled
      />
      <div className="top-bar__spacer" />
      {needsReconnect && lastName && (
        <button
          type="button"
          className="btn btn--small"
          title={strings.picker.reconnectHint}
          onClick={() => void useVaultStore.getState().reconnect()}
        >
          {strings.picker.reconnect(lastName)}
        </button>
      )}
      {hasGraph && <VaultPicker compact />}
      <button
        type="button"
        className="icon-btn"
        aria-label={strings.topBar.togglePreview}
        aria-pressed={previewOpen}
        onClick={onTogglePreview}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M14 4v16" />
        </svg>
      </button>
    </header>
  );
}
