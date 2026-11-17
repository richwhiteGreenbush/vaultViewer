# Vault Lens

Vault Lens opens a folder of markdown notes (an Obsidian-style vault) and shows your notes, tags and links as colorful, explorable visualizations: a force graph, a galaxy, a tag garden, a constellation timeline, a tag chord diagram and a heat-map calendar.

It is an installable, offline-capable web app (PWA). **Your notes never leave your device**: there is no backend, no account and no analytics. The vault is opened read-only, and the app never writes to it.

> Status: Phase 3 (six views: force graph, galaxy, tag garden, timeline, tag chord, calendar). See [`PLAN.md`](PLAN.md) for the full build plan and [`docs/DECISIONS.md`](docs/DECISIONS.md) for deviations.

## Views

Switch with the **View** menu or keys **1–6**. Focus, lenses and theme carry over between views, and every view has a legend.

1. **Force graph**: notes and links laid out by a force simulation.
2. **Galaxy**: top-level folders are solar systems; subfolders are moons; notes orbit closer the more links they have; hyperlanes join folders that link to each other.
3. **Tag garden**: each top-level tag is a plant; nested tags are branches; notes flower on their first tag, with vines to their other tags.
4. **Timeline**: notes as stars by date in folder lanes; press Play to watch the vault grow; drag across the scrubber to filter by date.
5. **Tag chord**: which tags appear together. Click an arc to filter by that tag; click a ribbon to list its notes.
6. **Calendar**: notes created or updated per day; click a day to list its notes.

## Using it

- **Click** a note to focus it (its neighbours stay bright) and read it in the preview; **Shift+click** expands to two hops; **Esc** clears focus.
- **Keyboard:** Tab to the graph, arrow keys move between linked notes, Enter opens the preview, `+`/`-` zoom, `/` or Ctrl/Cmd+K searches.
- **Lenses** (left panel) filter by tag, folder, date, number of links, orphans and missing notes. Active lenses show as chips in the top bar and live in the URL, so a filtered view can be bookmarked.
- **Themes:** Dark Space, Neon, Watercolor, Pastel, or match the system. Reduced-motion settings stop all ambient animation.

## Browser support

| Browser | Open folder | Drag-drop folder | Zip | Watch for changes | Install as app |
|---------|------------|------------------|-----|-------------------|----------------|
| Chrome / Edge (desktop) | Yes | Yes | Yes | Yes | Yes |
| Firefox | No | Yes | Yes | No (manual refresh) | No (works as a website) |
| Safari (macOS / iOS) | No | Yes (macOS) | Yes | No | Yes (Add to Dock / Home Screen) |
| Android Chrome | Partial | No | Yes | No | Yes |

Unavailable options are hidden at runtime rather than shown as errors.

## Running it

Requires Node 22+.

```sh
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # typecheck + lint + production build into dist/
npm run preview      # serve dist/ at http://localhost:4173 (service worker active)
```

Quality checks:

```sh
npm run typecheck
npm run lint
npm test             # Vitest unit tests
npm run e2e          # Playwright e2e: Chromium, Firefox (cross-browser ingest) and a 5,000-note perf test
```

Fixtures:

- `fixtures/sample-vault/` is a small vault that exercises every parsing rule; `EXPECTED.json` lists the counts tests assert against.
- `npm run fixtures:zip` zips it into `public/sample-vault.zip` (used by e2e and "Try the sample vault").
- `node fixtures/generate-large-vault.ts --notes 5000 --links-per-note 4 --tags 60 --seed 1` writes a synthetic vault for performance testing into `fixtures/large-vault/`.

## Deploying

`dist/` is a static site. The included `.github/workflows/pages.yml` deploys it to GitHub Pages on every push to `main` (enable Pages → "GitHub Actions" in the repo settings). Netlify or Cloudflare Pages work too: build command `npm run build`, output `dist`.

## Adding a new view

Views are plugins (see `PLAN.md` §5). From Phase 1 on:

1. Create `src/views/<yourView>/index.ts` exporting a `ViewModule` (`id`, `label`, `icon`, `renderer`, `mount`).
2. `mount(el, ctx)` returns a `ViewInstance` with `update`, `focusNode`, `exportImage` and `destroy`. Read everything from `ctx.graph` and `ctx.visible`; never parse files in a view.
3. Add it to `src/views/registry.ts`. The view switcher picks it up automatically.

## Privacy

Vault Lens makes no network requests at runtime other than loading the app itself. Parsing and layout happen in Web Workers in your browser, and cached data stays in your browser's IndexedDB. Clearing site data removes it.
