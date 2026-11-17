import { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { LensPanel } from './components/LensPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { EmptyState } from './components/EmptyState';
import { StatsBar } from './components/StatsBar';
import { ViewHost } from './components/ViewHost';
import { Tooltip } from './components/Tooltip';
import { DropZone } from './components/DropZone';
import { useVaultStore } from './state/vaultStore';

export default function App() {
  const [lensOpen, setLensOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const hasGraph = useVaultStore((s) => !!s.graph);
  const loading = useVaultStore((s) => s.status === 'loading');

  useEffect(() => {
    void useVaultStore.getState().restoreLast();
  }, []);

  return (
    <div className="app" data-theme="darkSpace">
      <TopBar
        lensOpen={lensOpen}
        previewOpen={previewOpen}
        onToggleLens={() => setLensOpen((v) => !v)}
        onTogglePreview={() => setPreviewOpen((v) => !v)}
      />
      <div className="app__body">
        <LensPanel open={lensOpen} />
        <main className="view-host" aria-label="Visualization">
          {hasGraph && !loading ? <ViewHost /> : <EmptyState />}
        </main>
        <PreviewPanel open={previewOpen} />
      </div>
      <StatsBar />
      <Tooltip />
      <DropZone />
    </div>
  );
}
