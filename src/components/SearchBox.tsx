import { useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import type { Note } from '../core/model';

const MAX_RESULTS = 8;

/** Fuzzy search over titles, aliases and tags. `/` or Ctrl/Cmd+K focuses it; Enter focuses the top result. */
export function SearchBox() {
  const graph = useVaultStore((s) => s.graph);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () =>
      graph
        ? new Fuse([...graph.notes.values()], {
            keys: [
              { name: 'title', weight: 3 },
              { name: 'aliases', weight: 2 },
              { name: 'tags', weight: 1 },
            ],
            threshold: 0.35,
            ignoreLocation: true,
          })
        : null,
    [graph],
  );
  const results: Note[] = useMemo(
    () => (fuse && query.trim() ? fuse.search(query.trim(), { limit: MAX_RESULTS }).map((r) => r.item) : []),
    [fuse, query],
  );

  const choose = (note: Note | undefined) => {
    if (!note) return;
    const v = useViewStore.getState();
    v.setFocus(note.id);
    v.setPreviewOpen(true);
    setOpen(false);
    setQuery('');
    input.current?.blur();
  };

  const showList = open && results.length > 0;
  return (
    <div className="search" role="search">
      <input
        id="search-input"
        ref={input}
        className="search__input"
        type="search"
        placeholder={strings.topBar.search}
        aria-label={strings.topBar.searchLabel}
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={showList ? `search-opt-${active}` : undefined}
        autoComplete="off"
        disabled={!graph}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(results[active] ?? results[0]);
          } else if (e.key === 'Escape') {
            setQuery('');
            input.current?.blur();
          }
        }}
      />
      <kbd className="search__kbd" aria-hidden="true">
        /
      </kbd>
      {showList && (
        <ul
          id="search-results"
          className="search__results"
          role="listbox"
          aria-label={strings.topBar.searchResults}
        >
          {results.map((n, i) => (
            <li
              key={n.id}
              id={`search-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(n);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="search__title">{n.title}</span>
              <span className="search__path">{n.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
