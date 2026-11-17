import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { useViewStore } from '../state/viewStore';
import { useLensStore } from '../state/lensStore';
import { useThemeStore } from '../state/themeStore';
import { LinkResolver } from '../core/graph/resolve';
import { tagColor } from '../core/color/tagColor';
import type { Link, Note, VaultGraph } from '../core/model';
import { db } from '../cache/db';

const MarkdownView = lazy(() => import('./markdown/MarkdownView'));

const resolvers = new WeakMap<VaultGraph, LinkResolver>();
const resolverFor = (g: VaultGraph) => {
  let r = resolvers.get(g);
  if (!r) resolvers.set(g, (r = new LinkResolver(g.notes.values())));
  return r;
};

/** Note text from the cache, or (folder vaults) straight from the directory handle. */
async function readNoteText(vaultKey: string, path: string): Promise<string | undefined> {
  const cached = await db()
    .texts.get([vaultKey, path])
    .catch(() => undefined);
  if (cached) return cached.text;
  const handle = useVaultStore.getState().lastVault?.handle;
  if (!handle) return undefined;
  try {
    let dir: FileSystemDirectoryHandle = handle;
    const parts = path.split('/');
    for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
    return await (await (await dir.getFileHandle(parts[parts.length - 1] ?? '')).getFile()).text();
  } catch {
    return undefined;
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(formatValue).join(', ');
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function LinkList({
  title,
  links,
  graph,
  pick,
  testId,
}: {
  title: string;
  links: string[];
  graph: VaultGraph;
  pick(id: string): void;
  testId: string;
}) {
  return (
    <section className="preview__section">
      <h3>
        {title} <span className="muted">({links.length})</span>
      </h3>
      {links.length === 0 ? (
        <p className="muted small">{strings.preview.none}</p>
      ) : (
        <ul className="link-list" data-testid={testId}>
          {links.map((id) => {
            const note = graph.notes.get(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`md-link${note ? '' : ' md-link--ghost'}`}
                  onClick={() => pick(id)}
                >
                  {note?.title ?? id}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const unique = (links: Link[] | undefined, key: 'source' | 'target') => [
  ...new Set((links ?? []).map((l) => l[key])),
];

export function PreviewPanel() {
  const open = useViewStore((s) => s.previewOpen);
  const focus = useViewStore((s) => s.focus);
  const noteList = useViewStore((s) => s.noteList);
  const graph = useVaultStore((s) => s.graph);
  const vaultKey = useVaultStore((s) => s.info?.key);
  const theme = useThemeStore((s) => s.theme);
  const note: Note | undefined = focus && graph ? graph.notes.get(focus) : undefined;
  const [text, setText] = useState<{ path: string; text: string | undefined } | null>(null);

  useEffect(() => {
    if (!open || !note || !vaultKey) return;
    let live = true;
    void readNoteText(vaultKey, note.path).then((t) => live && setText({ path: note.path, text: t }));
    return () => {
      live = false;
    };
  }, [open, note, vaultKey]);

  const pick = (id: string) => useViewStore.getState().setFocus(id);
  const resolve = useMemo(
    () => (target: string, kind: 'wikilink' | 'markdown') =>
      graph && note ? resolverFor(graph).resolve({ kind, target }, note.id) : null,
    [graph, note],
  );

  let body;
  const backToList = noteList && focus && (
    <button
      type="button"
      className="btn btn--small preview__back"
      onClick={() => useViewStore.getState().setFocus(null)}
    >
      ← {strings.noteList.back}
    </button>
  );
  if (graph && !focus && noteList) {
    body = (
      <>
        <h2 className="preview__title" data-testid="preview-list-title">
          {noteList.title}
        </h2>
        <p className="muted small">{strings.noteList.count(noteList.ids.length)}</p>
        <ul className="link-list" data-testid="note-list">
          {noteList.ids.map((id) => (
            <li key={id}>
              <button type="button" className="md-link" onClick={() => pick(id)}>
                {graph.notes.get(id)?.title ?? id}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (!graph || !focus) {
    body = <p className="muted">{strings.preview.empty}</p>;
  } else if (!note) {
    body = (
      <>
        <h2 className="preview__title" data-testid="preview-title">
          {focus}
        </h2>
        <p className="muted">{strings.tooltip.ghost}</p>
        <LinkList
          title={strings.preview.backlinks}
          links={unique(graph.inLinks.get(focus), 'source')}
          graph={graph}
          pick={pick}
          testId="backlinks"
        />
      </>
    );
  } else {
    const fm = Object.entries(note.frontmatter).filter(
      ([k]) => !['title', 'tags', 'tag', 'aliases', 'alias'].includes(k),
    );
    const loaded = text?.path === note.path;
    body = (
      <>
        {backToList}
        <h2 className="preview__title" data-testid="preview-title">
          {note.title}
        </h2>
        <p className="preview__path muted small">{note.path}</p>
        {note.tags.length > 0 && (
          <ul className="tag-chips" aria-label={strings.preview.tags}>
            {note.tags.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className="tag-chip"
                  title={strings.preview.filterByTag(t)}
                  onClick={() =>
                    useLensStore.getState().setLens((l) => {
                      if (!l.tags.include.includes(t)) l.tags.include.push(t);
                    })
                  }
                >
                  <span
                    className="dot"
                    style={{ background: tagColor(t, theme) }}
                    data-testid={`tag-dot-${t}`}
                    aria-hidden="true"
                  />
                  #{t}
                </button>
              </li>
            ))}
          </ul>
        )}
        {(fm.length > 0 || note.aliases.length > 0) && (
          <table className="props">
            <caption className="sr-only">{strings.preview.properties}</caption>
            <tbody>
              {note.aliases.length > 0 && (
                <tr>
                  <th scope="row">aliases</th>
                  <td>{note.aliases.join(', ')}</td>
                </tr>
              )}
              {fm.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{formatValue(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <section className="preview__body" data-testid="preview-body">
          {!loaded ? (
            <p className="muted">{strings.preview.loading}</p>
          ) : text.text === undefined ? (
            <p className="muted">{note.excerpt || strings.preview.unavailable}</p>
          ) : (
            <Suspense fallback={<p className="muted">{strings.preview.loading}</p>}>
              <MarkdownView text={text.text} resolve={resolve} onOpen={pick} />
            </Suspense>
          )}
        </section>
        <LinkList
          title={strings.preview.outgoing}
          links={unique(graph.outLinks.get(note.id), 'target')}
          graph={graph}
          pick={pick}
          testId="outgoing"
        />
        <LinkList
          title={strings.preview.backlinks}
          links={unique(graph.inLinks.get(note.id), 'source')}
          graph={graph}
          pick={pick}
          testId="backlinks"
        />
      </>
    );
  }

  return (
    <aside
      id="preview-panel"
      className="side-panel side-panel--right preview"
      aria-label={strings.preview.title}
      hidden={!open}
      data-testid="preview-panel"
    >
      <div className="panel-head">
        <span className="panel-head__label">{strings.preview.title}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={strings.preview.close}
          onClick={() => useViewStore.getState().setPreviewOpen(false)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {body}
    </aside>
  );
}
