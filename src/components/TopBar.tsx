import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import { VaultPicker } from './VaultPicker';
import { SearchBox } from './SearchBox';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LensChips } from './LensChips';
import { ViewSwitcher } from './ViewSwitcher';
import { ExportMenu } from './ExportMenu';
import { useSettingsStore } from '../state/settingsStore';

export function TopBar() {
  const hasGraph = useVaultStore((s) => !!s.graph);
  const needsReconnect = useVaultStore((s) => s.needsReconnect);
  const lastName = useVaultStore((s) => s.lastVault?.name);
  const canRefresh = useVaultStore((s) => s.info?.kind === 'handle' && !!s.lastVault?.handle);
  const refreshing = useVaultStore((s) => s.refreshing);
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
      {hasGraph && <ViewSwitcher />}
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
      {hasGraph && canRefresh && !needsReconnect && (
        <button
          type="button"
          className="btn btn--small"
          disabled={refreshing}
          data-testid="refresh"
          onClick={() => void useVaultStore.getState().refresh()}
        >
          {refreshing ? strings.refresh.refreshing : strings.refresh.refresh}
        </button>
      )}
      {hasGraph && <ExportMenu />}
      {hasGraph && <VaultPicker compact />}
      <ThemeSwitcher />
      <button
        type="button"
        className="icon-btn"
        aria-label={strings.settings.open}
        data-testid="settings-button"
        onClick={() => useSettingsStore.getState().setSettingsOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
        </svg>
      </button>
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
