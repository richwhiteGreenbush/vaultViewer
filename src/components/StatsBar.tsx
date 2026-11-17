import { strings } from '../strings';

export function StatsBar() {
  return (
    <footer className="stats-bar" data-testid="stats-bar">
      <span>{strings.status.noVault}</span>
    </footer>
  );
}
