# Decisions and deviations from PLAN.md

One short entry per deviation, newest last.

## Phase 0

- **Repo root is the project root.** The plan's folder tree is rooted at `vault-lens/`; this repo (`mdViz/`) plays that role directly instead of nesting a subfolder.
- **Toolchain versions.** Installed current releases: Vite 8, TypeScript 6, ESLint 10 (flat config), Vitest 5, Playwright 1.65, vite-plugin-pwa 2. React is pinned to 18 per A1.
- **CSP is injected at build time only** (small Vite plugin in `vite.config.ts`). Vite's dev server needs inline scripts for HMR, so a static CSP meta tag in `index.html` would break `npm run dev`. `style-src` allows `'unsafe-inline'` because React and the canvas libraries set element styles; scripts remain `'self'` only.
- **Service worker is registered from `src/pwa.ts`** (`injectRegister: false`) rather than an injected inline script, to keep the CSP free of inline scripts.
- **"Lighthouse PWA checks" are verified with Chrome's own installability check.** Lighthouse removed its PWA category in v12. The e2e test `Chrome reports the app as installable` calls the DevTools `Page.getInstallabilityErrors` and `Page.getAppManifest` commands (the same signals Chrome uses to offer Install), plus separate tests for the manifest contents and offline reload. Lighthouse performance/accessibility scores are still targeted in Phase 4.
- **Separate `tsconfig.test.json`** adds Node and Vitest globals for unit tests so that `src/` stays free of Node types (rule 4: pure core with no DOM/Node assumptions leaking in).
- **`fixtures/generate-large-vault.ts` runs with plain `node`** (Node 22 type stripping), so no `tsx`/`ts-node` dependency.
- **Icons are generated procedurally** by `scripts/make-icons.mjs` (no image tooling dependency). Re-run with `npm run icons`.
- **Fixture counting rules** are written into `fixtures/sample-vault/EXPECTED.json` (`$comment`): every link occurrence counts (duplicates included), markdown links to missing notes are ignored rather than becoming ghosts (§4.2 says they count only "where the target resolves"), and a link to a note in the default-ignored `templates/` folder becomes a ghost.

## Phase 1

- **Parser runs without remark-gfm.** Profiling showed `remark-gfm` doubles parse time (5,000 notes: ~8.7 s → ~3.6 s single-threaded), and extraction does not need it: tags and wikilinks are found in the raw source with code/HTML/link-URL ranges blanked out using mdast positions, and the tag pattern rejects `#` after letters, digits, `/`, `.`, `:` etc., so bare URL fragments are not tags. The Phase 2 preview still renders with GFM.
- **Extraction masks source ranges instead of walking text nodes.** Wikilinks and tags are matched against the note text with code, inline code, HTML, frontmatter, images, definitions and link URLs blanked. This handles wikilinks that span several mdast nodes (e.g. `[[a_b_c]]`) and keeps offsets for document order.
- **Same-note anchors (`[[#Heading]]`) and links to attachments (`[[file.pdf]]`) are not links.** Markdown links that do not resolve to a note are dropped rather than becoming ghosts (§4.2 says they count only when they resolve).
- **Rule 3 matches trailing sub-paths, not only basenames**, so `[[Recipes/Lentil Soup]]` resolves from anywhere when unique (Obsidian does the same).
- **Parse worker pool.** One coordinator worker (file listing, cache, `buildGraph`) plus up to three helpers wired to it with `MessageChannel`s, so note data never crosses the main thread. Directory handles are walked inside the worker.
- **Zip modification times** come from a tiny central-directory reader (`src/ingest/zip.ts`) because fflate does not expose them; they key the parse cache and are the `created`/`updated` fallback.
- **Cache layout:** parsed notes and raw texts are separate Dexie tables so a cache restore does not load note bodies. The last vault is restored from cache automatically on startup; folder vaults are then rescanned if permission is still granted, otherwise a "Reconnect" button appears (permission prompts need a user gesture).
- **Folder-input fallback.** Besides drag-and-drop and zip, browsers without `showDirectoryPicker` get an `<input webkitdirectory>` "Choose folder" button (works in Firefox and Safari).
- **`ViewContext` additions:** `vaultHash` (keys cached layouts), `onHover(id, point)` (tooltip position) and `onLayoutStatus`. `VaultStats` adds `ghostCount`.
- **View registry holds loaders**, not modules, so every view and PixiJS are lazy chunks (main bundle ~86 KB gzipped).
- **Pixi needs `pixi.js/unsafe-eval`** (its eval-free code paths) because the CSP forbids `unsafe-eval`.
- **`decode-named-character-reference` is aliased to its non-DOM build**: its "browser" build uses `document`, which does not exist in workers.
- **Edges are line-list meshes and MSAA is off.** The edge vertex buffer is the node-position array and the index buffer is the link pairs. 4× MSAA on 20,000 overlapping lines cost ~150 ms/frame on an Intel HD 5000; without it the view holds 60 fps. Node discs are pre-rendered antialiased textures, so only 1 px edges lose smoothing.
- **Perf test runs in its own Playwright project** with GPU flags, after the functional projects (parallel tests skew timings). If the browser still reports a software renderer (SwiftShader, e.g. on CI), the fps assertion is skipped with an annotation; parse and long-task budgets are always asserted.
- **Firefox e2e** covers zip upload, sample vault, zip drop and folder input. Dropping a *folder* uses `webkitGetAsEntry`, which test tools cannot synthesize, so that path is verified manually.
- **GitHub Pages workflow is manual-only** until Pages is enabled for the repository (the first automatic run failed with "Pages not enabled").
- **Canvas 2D fallback.** Without WebGL (GPU-less CI, blocked drivers) Pixi falls back to its Canvas renderer, which cannot draw line-list meshes, so edges are drawn with `Graphics` there. The Firefox e2e project runs with WebGL disabled to cover this path; Chromium covers WebGL.

## Phase 2

- **Tag lens has include + exclude lists and an any/all mode for the includes**, rather than a single mode for one list, so "#project but not #archive" is expressible. Nested tags match children (`#project` matches `#project/alpha`).
- **A ghost is visible when a visible note links to it** (and "Missing notes" is on); a link is visible when both ends are. Lenses never re-run the layout: hidden nodes keep their positions.
- **URL hash** holds only non-default lens fields (`#t=project&tm=all&tx=journal&f=…&fx=…&d=created&from=YYYY-MM-DD&to=…&dmin=&dmax=&o=0&g=0`) plus the focused note as `n=`, so a bookmark restores both lens and focus.
- **`ViewContext` additions:** `focusDepth` (Shift+click = 2 hops) and `onActivate(id)` (Enter / click opens the preview).
- **Clicking a node also opens the preview**; clicking empty canvas clears focus (Esc too).
- **Keyboard:** the canvas is focusable (`role="application"`), arrows move focus to the neighbour most in that direction (or, with nothing focused, the note nearest the screen centre), Enter opens the preview, `+`/`-` zoom, `/` or Ctrl/Cmd+K search, Esc clears focus. A visually hidden live region announces the focused note.
- **Watercolor uses soft, translucent discs instead of multiply blending.** The canvas is transparent over the CSS paper texture, so multiply blending in WebGL multiplies with transparent black and turns nodes black.
- **"Match system" theme option** maps to Dark Space (dark) or Pastel (light); the default remains Dark Space. Theme choice is stored in Dexie `settings`.
- **Preview never loads remote content:** images render as labelled placeholders, raw HTML is skipped, external links open in a new tab. Wikilinks and relative note links focus notes in the view; links to missing notes open the ghost's page (its backlinks). The markdown renderer is a lazy chunk.
- **"Show attachments" is present but disabled**: attachments are not nodes in v1 (§4.3); the field is kept so URLs stay stable.
- **Lens performance:** the force view splits styling into a theme pass (colours, textures; theme/graph changes only) and a visibility pass (visible/alpha/edge indexes from per-node masks), and `visible.links` is built lazily, because a 20k-string Set per lens change caused GC spikes. Typical update on 5,000 notes: ~30 ms. The perf test asserts median < 60 ms and at most 1 of 10 samples ≥ 100 ms (to tolerate a GC/scheduling outlier on busy machines) and reports the worst sample.
- **axe** runs with the WCAG 2.0/2.1 A and AA rule sets in all four themes, with the lens panel open, a tag lens active and a note in the preview. The canvas itself is not inspectable by axe; its labels use theme text colours.
