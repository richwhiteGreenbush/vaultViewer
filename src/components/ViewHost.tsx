import { useEffect, useMemo, useRef } from 'react';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import { useLensStore, visibleFor } from '../state/lensStore';
import { useThemeStore } from '../state/themeStore';
import { viewById } from '../views/registry';
import type { ViewContext, ViewInstance } from '../views/types';
import { layoutClient } from '../workers/clients';

/** Mounts the active view (lazy-loaded) and feeds it a ViewContext whenever inputs change. */
export function ViewHost() {
  const el = useRef<HTMLDivElement>(null);
  const instance = useRef<ViewInstance | null>(null);
  const graph = useVaultStore((s) => s.graph);
  const vaultHash = useVaultStore((s) => s.vaultHash);
  const activeView = useViewStore((s) => s.activeView);
  const focus = useViewStore((s) => s.focus);
  const focusDepth = useViewStore((s) => s.focusDepth);
  const lens = useLensStore((s) => s.lens);
  const theme = useThemeStore((s) => s.theme);
  const reducedMotion = useThemeStore((s) => s.reducedMotion);

  const ctx = useMemo<ViewContext | null>(() => {
    if (!graph || !vaultHash) return null;
    const { setFocus, setHover, setLayout, setPreviewOpen } = useViewStore.getState();
    const setLens = useLensStore.getState().setLens;
    return {
      graph,
      vaultHash,
      visible: visibleFor(graph, lens),
      theme,
      focus,
      focusDepth,
      reducedMotion,
      layout: layoutClient(),
      onFocus: setFocus,
      onActivate: () => setPreviewOpen(true),
      onHover: setHover,
      onLayoutStatus: setLayout,
      actions: {
        includeTag: (tag) =>
          setLens((l) => {
            if (!l.tags.include.includes(tag)) l.tags.include.push(tag);
            l.tags.exclude = l.tags.exclude.filter((t) => t !== tag);
          }),
        setDateRange: (field, from, to) =>
          setLens((l) => {
            l.date = { field, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) };
          }),
        showNoteList: (title, ids) => useViewStore.getState().showNoteList({ title, ids }),
        previousView: () => {
          const v = useViewStore.getState();
          v.setActiveView(v.previousView === v.activeView ? 'force' : v.previousView);
        },
      },
    };
  }, [graph, vaultHash, lens, theme, focus, focusDepth, reducedMotion]);

  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
    if (ctx) instance.current?.update(ctx);
  }, [ctx]);

  const hasGraph = !!ctx;
  useEffect(() => {
    const host = el.current;
    const entry = viewById(activeView);
    if (!host || !entry || !hasGraph) return;
    let cancelled = false;
    void entry.load().then((mod) => {
      if (cancelled || !ctxRef.current) return;
      instance.current = mod.mount(host, ctxRef.current);
    });
    return () => {
      cancelled = true;
      instance.current?.destroy();
      instance.current = null;
      // The host element is reused by the next view: clear state attributes the old view set.
      for (const attr of ['data-layout', 'data-nodes', 'data-visible-nodes', 'data-focus-size']) host.removeAttribute(attr);
    };
  }, [activeView, hasGraph]);

  return <div ref={el} className="view-canvas" data-testid="view-host" data-view={activeView} />;
}
