import { useEffect, useRef, useState } from 'react';
import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import { useThemeStore } from '../state/themeStore';
import { viewById } from '../views/registry';
import { exportJson, exportPng, exportPoster, exportSvg } from '../export/exporters';

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeView = useViewStore((s) => s.activeView);
  const entry = viewById(activeView);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('.menu__list button')?.focus();
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => unknown) => () => {
    setOpen(false);
    void fn();
  };
  const graph = () => useVaultStore.getState().graph;

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="btn btn--small"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="export-menu"
      >
        {strings.exporting.menu}
      </button>
      {open && (
        <ul className="menu__list" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={run(() => exportPng(graph()?.vaultName ?? 'vault', activeView))}
            >
              {strings.exporting.png}
            </button>
          </li>
          {entry?.renderer === 'svg' && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={run(() => exportSvg(graph()?.vaultName ?? 'vault', activeView))}
              >
                {strings.exporting.svg}
              </button>
            </li>
          )}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={run(() => {
                const g = graph();
                return g && exportPoster(g, useThemeStore.getState().theme, entry?.label ?? '', activeView);
              })}
            >
              {strings.exporting.poster}
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={run(() => {
                const g = graph();
                if (g) exportJson(g);
              })}
            >
              {strings.exporting.json}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
