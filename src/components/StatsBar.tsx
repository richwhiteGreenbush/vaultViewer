import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import { useLensStore, visibleFor } from '../state/lensStore';
import { isLensActive } from '../core/lens/applyLenses';

export function StatsBar() {
  const graph = useVaultStore((s) => s.graph);
  const info = useVaultStore((s) => s.info);
  const layout = useViewStore((s) => s.layout);
  const lens = useLensStore((s) => s.lens);

  if (!graph || !info) {
    return (
      <footer className="stats-bar" data-testid="stats-bar">
        <span>{strings.status.noVault}</span>
      </footer>
    );
  }
  const s = graph.stats;
  const filtered = isLensActive(lens);
  const v = visibleFor(graph, lens);
  let visibleGhosts = 0;
  let visibleOrphans = 0;
  if (filtered) {
    for (const id of v.notes) {
      if (!graph.notes.has(id)) visibleGhosts++;
      else if (!graph.outLinks.has(id) && !graph.inLinks.has(id)) visibleOrphans++;
    }
  }
  const items: [string, number, number, string][] = [
    ['notes', filtered ? v.noteCount : s.noteCount, s.noteCount, strings.stats.notes],
    ['links', filtered ? v.linkCount : s.linkCount, s.linkCount, strings.stats.links],
    ['tags', s.tagCount, s.tagCount, strings.stats.tags],
    ['orphans', filtered ? visibleOrphans : s.orphanCount, s.orphanCount, strings.stats.orphans],
    ['ghosts', filtered ? visibleGhosts : s.ghostCount, s.ghostCount, strings.stats.ghosts],
  ];
  return (
    <footer className="stats-bar" data-testid="stats-bar">
      <strong className="stats-bar__name">{info.name}</strong>
      {items.map(([key, value, total, label]) => (
        <span key={key} data-testid={`stat-${key}`} data-value={value} data-total={total}>
          <b>{value.toLocaleString()}</b>
          {value !== total && <span className="muted"> / {total.toLocaleString()}</span>} {label}
        </span>
      ))}
      {info.warnings.length > 0 && (
        <span
          className="stats-bar__warn"
          title={info.warnings.slice(0, 20).join('\n')}
          data-testid="stat-warnings"
        >
          {strings.stats.warnings(info.warnings.length)}
        </span>
      )}
      <span className="stats-bar__spacer" />
      <span className="muted" data-testid="stat-parse">
        {strings.stats.parsed(info.parsedCount, info.cachedCount, info.ms.total)}
        {layout && !layout.settled ? ` · ${strings.progress.layout}` : ''}
      </span>
    </footer>
  );
}
