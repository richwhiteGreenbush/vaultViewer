import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { LensPanel } from './components/LensPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { EmptyState } from './components/EmptyState';
import { StatsBar } from './components/StatsBar';
import { ViewHost } from './components/ViewHost';
import { Tooltip } from './components/Tooltip';
import { DropZone } from './components/DropZone';
import { FocusAnnouncer } from './components/FocusAnnouncer';
import { useVaultStore } from './state/vaultStore';
import { useViewStore } from './state/viewStore';
import { syncLensWithUrl } from './state/lensStore';
import { useThemeStore } from './state/themeStore';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function App() {
  const hasGraph = useVaultStore((s) => !!s.graph);
  const loading = useVaultStore((s) => s.status === 'loading');
  const themeId = useThemeStore((s) => s.theme.id);

  useEffect(() => {
    void useThemeStore.getState().init();
    void useVaultStore.getState().restoreLast();
    // URL hash ⇄ lens, plus the focused note as `n=`.
    const stopSync = syncLensWithUrl(
      (): Record<string, string> => {
        const f = useViewStore.getState().focus;
        return f ? { n: f } : {};
      },
      (extra) => {
        if (extra.n && extra.n !== useViewStore.getState().focus) useViewStore.getState().setFocus(extra.n);
      },
    );
    const stopFocusSync = useViewStore.subscribe((s, prev) => {
      if (s.focus !== prev.focus) {
        // Re-write the hash with the new focus (lens unchanged).
        window.dispatchEvent(new Event('vault-lens:focus'));
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const v = useViewStore.getState();
        if (isTyping(e.target)) return;
        if (v.focus) v.setFocus(null);
        else if (v.previewOpen) v.setPreviewOpen(false);
      }
      if (
        (e.key === '/' && !isTyping(e.target)) ||
        (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      stopSync();
      stopFocusSync();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="app" data-theme={themeId}>
      <TopBar />
      <div className="app__body">
        <LensPanel />
        <main className="view-host" aria-label="Visualization">
          {hasGraph && !loading ? <ViewHost /> : <EmptyState />}
        </main>
        <PreviewPanel />
      </div>
      <StatsBar />
      <Tooltip />
      <DropZone />
      <FocusAnnouncer />
    </div>
  );
}
