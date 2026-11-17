import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';

/** Screen-reader announcement of the focused note (keyboard navigation happens on a canvas). */
export function FocusAnnouncer() {
  const focus = useViewStore((s) => s.focus);
  const graph = useVaultStore((s) => s.graph);
  let text = '';
  if (focus && graph) {
    const note = graph.notes.get(focus);
    const links = (graph.outLinks.get(focus)?.length ?? 0) + (graph.inLinks.get(focus)?.length ?? 0);
    text = note ? strings.focus.announce(note.title, links) : strings.focus.announceGhost(focus);
  }
  return (
    <div className="sr-only" aria-live="polite" data-testid="focus-announcer">
      {text}
    </div>
  );
}
