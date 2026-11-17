import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';

export function StatsBar() {
  const graph = useVaultStore((s) => s.graph);
  const info = useVaultStore((s) => s.info);
  const layout = useViewStore((s) => s.layout);

  if (!graph || !info) {
    return (
      <footer className="stats-bar" data-testid="stats-bar">
        <span>{strings.status.noVault}</span>
      </footer>
    );
  }
  const s = graph.stats;
  const items: [string, number, string][] = [
    ['notes', s.noteCount, strings.stats.notes],
    ['links', s.linkCount, strings.stats.links],
    ['tags', s.tagCount, strings.stats.tags],
    ['orphans', s.orphanCount, strings.stats.orphans],
    ['ghosts', s.ghostCount, strings.stats.ghosts],
  ];
  return (
    <footer className="stats-bar" data-testid="stats-bar">
      <strong className="stats-bar__name">{info.name}</strong>
      {items.map(([key, value, label]) => (
        <span key={key} data-testid={`stat-${key}`} data-value={value}>
          <b>{value.toLocaleString()}</b> {label}
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
