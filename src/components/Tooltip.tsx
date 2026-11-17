import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';

export function Tooltip() {
  const hover = useViewStore((s) => s.hover);
  const graph = useVaultStore((s) => s.graph);
  if (!hover || !graph) return null;
  const note = graph.notes.get(hover.id);
  const left = Math.min(hover.at.x + 14, window.innerWidth - 280);
  const top = Math.min(hover.at.y + 14, window.innerHeight - 120);
  return (
    <div className="tooltip" role="tooltip" data-testid="tooltip" style={{ left, top }}>
      <div className="tooltip__title">{note?.title ?? hover.id}</div>
      {note ? (
        <>
          <div className="tooltip__tags">
            {note.tags.length ? note.tags.map((t) => `#${t}`).join(' ') : strings.tooltip.noTags}
          </div>
          <div className="muted">{strings.tooltip.words(note.wordCount)}</div>
        </>
      ) : (
        <div className="muted">{strings.tooltip.ghost}</div>
      )}
    </div>
  );
}
