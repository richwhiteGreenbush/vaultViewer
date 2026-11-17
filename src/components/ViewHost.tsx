import { useEffect, useMemo, useRef } from 'react';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import { viewById } from '../views/registry';
import type { ViewContext, ViewInstance } from '../views/types';
import { palettes, DEFAULT_THEME } from '../core/color/palettes';
import { layoutClient } from '../workers/clients';

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Mounts the active view (lazy-loaded) and feeds it a ViewContext whenever inputs change. */
export function ViewHost() {
  const el = useRef<HTMLDivElement>(null);
  const instance = useRef<ViewInstance | null>(null);
  const graph = useVaultStore((s) => s.graph);
  const vaultHash = useVaultStore((s) => s.vaultHash);
  const activeView = useViewStore((s) => s.activeView);
  const focus = useViewStore((s) => s.focus);

  const ctx = useMemo<ViewContext | null>(() => {
    if (!graph || !vaultHash) return null;
    const { setFocus, setHover, setLayout } = useViewStore.getState();
    return {
      graph,
      vaultHash,
      visible: { notes: new Set(graph.notes.keys()), links: new Set(graph.links.map((l) => l.id)) },
      theme: palettes[DEFAULT_THEME],
      focus,
      reducedMotion: reducedMotion(),
      layout: layoutClient(),
      onFocus: setFocus,
      onHover: setHover,
      onLayoutStatus: setLayout,
    };
  }, [graph, vaultHash, focus]);

  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
    instance.current?.update(ctx as ViewContext);
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
    };
  }, [activeView, hasGraph]);

  return <div ref={el} className="view-canvas" data-testid="view-host" data-view={activeView} />;
}
