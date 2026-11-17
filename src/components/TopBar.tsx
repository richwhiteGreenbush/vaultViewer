import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import { VaultPicker } from './VaultPicker';
import { SearchBox } from './SearchBox';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LensChips } from './LensChips';

export function TopBar() {
  const hasGraph = useVaultStore((s) => !!s.graph);
  const needsReconnect = useVaultStore((s) => s.needsReconnect);
  const lastName = useVaultStore((s) => s.lastVault?.name);
  const lensOpen = useViewStore((s) => s.lensPanelOpen);
  const previewOpen = useViewStore((s) => s.previewOpen);
  const v = useViewStore.getState;
  return (
    <header className="top-bar">
      <button
        type="button"
        className="icon-btn"
        aria-label={strings.topBar.toggleLenses}
        aria-pressed={lensOpen}
        aria-controls="lens-panel"
        onClick={() => v().setLensPanelOpen(!lensOpen)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
      </button>
      <div className="brand">
        <img src="./favicon.svg" alt="" width={24} height={24} />
        <h1>{strings.appName}</h1>
      </div>
      <SearchBox />
      <LensChips />
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
      <ThemeSwitcher />
      <button
        type="button"
        className="icon-btn"
        aria-label={strings.topBar.togglePreview}
        aria-pressed={previewOpen}
        aria-controls="preview-panel"
        onClick={() => v().setPreviewOpen(!previewOpen)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M14 4v16" />
        </svg>
      </button>
    </header>
  );
}
