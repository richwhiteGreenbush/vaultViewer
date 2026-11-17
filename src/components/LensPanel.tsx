import { useMemo, useState } from 'react';
import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import { useLensStore } from '../state/lensStore';
import { useThemeStore } from '../state/themeStore';
import { tagColor } from '../core/color/tagColor';
import type { LensState } from '../core/lens/applyLenses';

const MAX_TAG_ROWS = 80;
const day = (ms: number | undefined) => (ms === undefined ? '' : new Date(ms).toISOString().slice(0, 10));
const parseDay = (s: string, end: boolean) =>
  s ? Date.parse(`${s}T00:00:00Z`) + (end ? 86_399_999 : 0) : undefined;
const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

function IncludeExclude({
  label,
  included,
  excluded,
  onInclude,
  onExclude,
}: {
  label: string;
  included: boolean;
  excluded: boolean;
  onInclude(): void;
  onExclude(): void;
}) {
  return (
    <span className="ie">
      <button
        type="button"
        className="ie__btn"
        aria-pressed={included}
        aria-label={strings.lens.include(label)}
        onClick={onInclude}
      >
        +
      </button>
      <button
        type="button"
        className="ie__btn"
        aria-pressed={excluded}
        aria-label={strings.lens.exclude(label)}
        onClick={onExclude}
      >
        −
      </button>
    </span>
  );
}

export function LensPanel() {
  const open = useViewStore((s) => s.lensPanelOpen);
  const graph = useVaultStore((s) => s.graph);
  const lens = useLensStore((s) => s.lens);
  const theme = useThemeStore((s) => s.theme);
  const [tagFilter, setTagFilter] = useState('');
  const set = (fn: (l: LensState) => void) => useLensStore.getState().setLens(fn);

  const tags = useMemo(
    () =>
      graph
        ? [...graph.tags.values()].sort(
            (a, b) => b.noteIds.length - a.noteIds.length || a.id.localeCompare(b.id),
          )
        : [],
    [graph],
  );
  const shownTags = useMemo(() => {
    const q = tagFilter.trim().toLowerCase().replace(/^#/, '');
    return (q ? tags.filter((t) => t.id.includes(q)) : tags).slice(0, MAX_TAG_ROWS);
  }, [tags, tagFilter]);
  const folders = useMemo(() => {
    if (!graph) return [];
    const out: { id: string; depth: number; name: string; count: number }[] = [];
    const walk = (id: string, depth: number) => {
      const f = graph.folders.get(id);
      if (!f) return;
      for (const child of [...f.childFolderIds].sort()) {
        const c = graph.folders.get(child);
        out.push({ id: child, depth, name: c?.name ?? child, count: c?.noteIds.length ?? 0 });
        walk(child, depth + 1);
      }
    };
    walk('', 0);
    return out;
  }, [graph]);

  return (
    <aside
      id="lens-panel"
      className="side-panel side-panel--left"
      aria-label={strings.lens.title}
      hidden={!open}
      data-testid="lens-panel"
    >
      <div className="panel-head">
        <h2>{strings.lens.title}</h2>
        <button type="button" className="btn btn--small" onClick={() => useLensStore.getState().reset()}>
          {strings.lens.reset}
        </button>
      </div>
      {!graph ? (
        <p className="muted">{strings.lens.empty}</p>
      ) : (
        <>
          <fieldset className="lens-group">
            <legend>{strings.lens.tags}</legend>
            <div className="lens-row">
              <label className="small" htmlFor="tag-mode">
                {strings.lens.tagMode}
              </label>
              <select
                id="tag-mode"
                className="select select--small"
                value={lens.tags.mode}
                onChange={(e) => set((l) => (l.tags.mode = e.target.value === 'all' ? 'all' : 'any'))}
              >
                <option value="any">{strings.lens.any}</option>
                <option value="all">{strings.lens.all}</option>
              </select>
            </div>
            <input
              className="input"
              type="search"
              placeholder={strings.lens.filterTags}
              aria-label={strings.lens.filterTags}
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
            <ul className="lens-list" data-testid="tag-list">
              {shownTags.map((t) => (
                <li key={t.id} data-tag={t.id}>
                  <span className="dot" style={{ background: tagColor(t.id, theme) }} aria-hidden="true" />
                  <span className="lens-list__name">#{t.id}</span>
                  <span className="muted small">{t.noteIds.length}</span>
                  <IncludeExclude
                    label={`#${t.id}`}
                    included={lens.tags.include.includes(t.id)}
                    excluded={lens.tags.exclude.includes(t.id)}
                    onInclude={() =>
                      set((l) => {
                        l.tags.include = toggle(l.tags.include, t.id);
                        l.tags.exclude = l.tags.exclude.filter((x) => x !== t.id);
                      })
                    }
                    onExclude={() =>
                      set((l) => {
                        l.tags.exclude = toggle(l.tags.exclude, t.id);
                        l.tags.include = l.tags.include.filter((x) => x !== t.id);
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className="lens-group">
            <legend>{strings.lens.folders}</legend>
            <ul className="lens-list" data-testid="folder-list">
              {folders.map((f) => (
                <li key={f.id} style={{ paddingLeft: f.depth * 12 }}>
                  <span className="lens-list__name">{f.name}</span>
                  <span className="muted small">{f.count}</span>
                  <IncludeExclude
                    label={f.id}
                    included={lens.folders.include.includes(f.id)}
                    excluded={lens.folders.exclude.includes(f.id)}
                    onInclude={() =>
                      set((l) => {
                        l.folders.include = toggle(l.folders.include, f.id);
                        l.folders.exclude = l.folders.exclude.filter((x) => x !== f.id);
                      })
                    }
                    onExclude={() =>
                      set((l) => {
                        l.folders.exclude = toggle(l.folders.exclude, f.id);
                        l.folders.include = l.folders.include.filter((x) => x !== f.id);
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className="lens-group">
            <legend>{strings.lens.dates}</legend>
            <div className="lens-row">
              <label className="small" htmlFor="date-field">
                {strings.lens.dateField}
              </label>
              <select
                id="date-field"
                className="select select--small"
                value={lens.date.field}
                onChange={(e) =>
                  set((l) => (l.date.field = e.target.value === 'created' ? 'created' : 'updated'))
                }
              >
                <option value="updated">{strings.lens.updated}</option>
                <option value="created">{strings.lens.created}</option>
              </select>
            </div>
            <div className="lens-row">
              <label className="small" htmlFor="date-from">
                {strings.lens.from}
              </label>
              <input
                id="date-from"
                className="input"
                type="date"
                value={day(lens.date.from)}
                onChange={(e) =>
                  set((l) => {
                    const v = parseDay(e.target.value, false);
                    if (v === undefined) delete l.date.from;
                    else l.date.from = v;
                  })
                }
              />
            </div>
            <div className="lens-row">
              <label className="small" htmlFor="date-to">
                {strings.lens.to}
              </label>
              <input
                id="date-to"
                className="input"
                type="date"
                value={day(lens.date.to)}
                onChange={(e) =>
                  set((l) => {
                    const v = parseDay(e.target.value, true);
                    if (v === undefined) delete l.date.to;
                    else l.date.to = v;
                  })
                }
              />
            </div>
          </fieldset>

          <fieldset className="lens-group">
            <legend>{strings.lens.degree}</legend>
            {(['min', 'max'] as const).map((k) => (
              <div className="lens-row" key={k}>
                <label className="small" htmlFor={`degree-${k}`}>
                  {k === 'min' ? strings.lens.minLinks : strings.lens.maxLinks}
                </label>
                <input
                  id={`degree-${k}`}
                  className="input input--num"
                  type="number"
                  min={0}
                  value={lens.degree[k] ?? ''}
                  onChange={(e) =>
                    set((l) => {
                      const n =
                        e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value)));
                      const { min, max } = l.degree;
                      const next = { min, max, [k]: n !== undefined && Number.isFinite(n) ? n : undefined };
                      l.degree = {
                        ...(next.min !== undefined ? { min: next.min } : {}),
                        ...(next.max !== undefined ? { max: next.max } : {}),
                      };
                    })
                  }
                />
              </div>
            ))}
          </fieldset>

          <fieldset className="lens-group">
            <legend>{strings.lens.show}</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={lens.showOrphans}
                onChange={(e) => set((l) => (l.showOrphans = e.target.checked))}
              />
              {strings.lens.showOrphans}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={lens.showGhosts}
                onChange={(e) => set((l) => (l.showGhosts = e.target.checked))}
              />
              {strings.lens.showGhosts}
            </label>
            <label className="check" title={strings.lens.attachmentsNote}>
              <input type="checkbox" checked={lens.showAttachments} disabled />
              {strings.lens.showAttachments}
            </label>
          </fieldset>
        </>
      )}
    </aside>
  );
}
