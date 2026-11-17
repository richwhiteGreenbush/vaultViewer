import { useState } from 'react';
import { TopBar } from './components/TopBar';
import { LensPanel } from './components/LensPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { EmptyState } from './components/EmptyState';
import { StatsBar } from './components/StatsBar';

export default function App() {
  const [lensOpen, setLensOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
          <EmptyState />
        </main>
        <PreviewPanel open={previewOpen} />
      </div>
      <StatsBar />
    </div>
  );
}
