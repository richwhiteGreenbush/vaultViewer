# Vault Lens: build plan for a markdown vault visualization PWA

This is a build spec for Claude Code. It describes an installable, offline-capable web app that opens a folder of markdown notes (an Obsidian-style vault) and shows the notes, their tags and their links as colorful, explorable visualizations.

"Vault Lens" is a working name. Rename it freely.

---

## 0. Kickoff prompt (paste this into Claude Code)

> Read `PLAN.md` in this repo. It is the spec for a markdown vault visualization PWA.
>
> Build it phase by phase, starting with Phase 0. For each phase:
> 1. Restate the phase goal and list the files you will create or change.
> 2. Implement it. Keep to the architecture, data model and folder structure in the plan. If you need to deviate, add a short note to `docs/DECISIONS.md` explaining why.
> 3. Write the tests the phase asks for, then run `npm run typecheck`, `npm run lint`, `npm test`, and (from Phase 1 on) `npm run e2e -- --trace off`.
> 4. Check every acceptance criterion for the phase and report each one as pass or fail, with evidence.
> 5. Commit with a message like `phase 1: parsing and force graph`, then stop and wait for me before starting the next phase.
>
> Use the fixture vault in `fixtures/sample-vault` for tests and demos. Do not add a backend, accounts or analytics. Everything runs in the browser.

If the repo is empty, first save this file as `PLAN.md` at the repo root.

---

## 1. Assumptions (change any of these before you start)

These are defaults chosen where nothing was decided yet. Edit them here and Claude Code will follow the edited version.

| # | Decision | Default | Why |
|---|----------|---------|-----|
| A1 | UI framework | **React 18 + TypeScript (strict)** | Largest ecosystem for graph and canvas libraries, and Claude Code is very fluent in it. Svelte is a fine swap. |
| A2 | Build and PWA | **Vite + vite-plugin-pwa** (Workbox, `generateSW`, auto update) | Standard, minimal config. |
| A3 | App state | **Zustand** | Small, no boilerplate, works outside React (needed for the renderer). |
| A4 | Rendering | **PixiJS v8 (WebGL)** for graph-like views; **D3 + SVG** for chord and calendar views | Pixi handles thousands of nodes at 60 fps with glow filters. SVG is simpler for the two chart-like views. three.js is deferred (see A10). |
| A5 | Layout | **d3-force in a Web Worker** (via Comlink) | Keeps the UI responsive on big vaults. |
| A6 | Parsing | **unified + remark-parse + remark-frontmatter + remark-gfm**, with small custom extractors for `#tags` and `[[wikilinks]]`; **yaml** package for frontmatter | Accurate, avoids matching tags inside code blocks. |
| A7 | Markdown preview | **react-markdown** with remark-gfm, plus a wikilink plugin that makes links clickable inside the app | Reuses the same remark pipeline. |
| A8 | Folder access | **File System Access API** (`showDirectoryPicker`) on Chromium; **drag-and-drop folder** and **.zip upload** (fflate) as fallbacks for Firefox and Safari | Read-only. The app never writes to the vault. |
| A9 | Local cache | **IndexedDB via Dexie**: stores the directory handle, parsed notes keyed by path + mtime, layout positions, and settings | Fast reloads and offline use. |
| A10 | 3D | **Not in v1.** The galaxy view is 2.5D in Pixi (parallax layers, glow). A three.js galaxy is listed as a stretch goal. | Keeps the bundle and scope small. |
| A11 | Vault size target | Smooth with **5,000 notes / 20,000 links**; usable up to 20,000 notes | Covers most personal vaults. |
| A12 | Views in v1 | **Force graph, Galaxy, Tag Garden, Constellation Timeline, Tag Chord, Heat-map Calendar.** City Map is a stretch goal. | City Map has the most layout work for the least extra insight. |
| A13 | Themes | **Neon, Watercolor, Pastel, Dark Space**, plus light/dark system preference | From the brainstorm. |
| A14 | Sync | **Out of scope.** Phase 4 adds folder re-scan, export and share-as-image only. | No backend. |
| A15 | Testing | **Vitest** (unit), **Playwright** (e2e, Chromium), **@testing-library/react** for components | Standard. |
| A16 | Hosting | Static build in `dist/`, deployable to GitHub Pages, Netlify or Cloudflare Pages. Include a GitHub Pages workflow. | Free and simple. |
| A17 | Package manager | **npm** | Fewest surprises. |
| A18 | Note identity | A note's id is its **vault-relative path without `.md`**, lowercased, `/` separated. Wikilinks resolve the Obsidian way (see §4.3). | Matches Obsidian behaviour. |
| A19 | Dates | "Created" comes from frontmatter `created`/`date` if present, otherwise file `lastModified` (the browser cannot read birth time). "Updated" is `lastModified`. | Browser limitation. |

---

## 2. Product summary

**Who:** someone with a folder of markdown notes (Obsidian, Logseq-style, Foam, plain notes).

**What it does:**
- Opens a vault folder (or zip) locally. Nothing is uploaded anywhere.
- Parses every note for frontmatter, tags, wikilinks, markdown links, headings and word count.
- Builds one shared graph model, and renders it through several interchangeable "views".
- Lets you click any note to focus it and read a rendered preview, follow links, and filter what you see with "lenses".
- Works offline once installed, and remembers the last vault.

**Non-goals for v1:** editing notes, writing to disk, accounts, cloud sync, plugins, mobile-first layout (it should work on tablet and phone, but desktop is the primary target).

---

## 3. Architecture

```
┌──────────────────────────── Main thread ────────────────────────────┐
│                                                                     │
│  UI shell (React)                                                   │
│   ├─ TopBar: vault picker, view switcher, search, theme             │
│   ├─ LensPanel: filters (tags, folders, dates, orphans, degree)     │
│   ├─ ViewHost  ── mounts the active View (Pixi canvas or SVG)       │
│   └─ PreviewPanel: rendered markdown for focused note               │
│                                                                     │
│  Stores (Zustand)                                                   │
│   ├─ vaultStore:  status, VaultGraph, progress                      │
│   ├─ viewStore:   activeView, focus, hover, camera                  │
│   ├─ lensStore:   active filters → derived visible node/edge sets   │
│   └─ themeStore:  theme id, palette, reduced motion                 │
│                                                                     │
│  Services                                                           │
│   ├─ ingest/   (FS Access, drag-drop, zip) → RawFile[]              │
│   ├─ cache/    (Dexie) handles, parsed notes, positions, settings   │
│   └─ workers/  Comlink proxies to parse + layout workers            │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │                               │
     ┌──────────▼──────────┐         ┌──────────▼──────────┐
     │  parse.worker.ts    │         │  layout.worker.ts   │
     │  remark pipeline    │         │  d3-force sim,      │
     │  → ParsedNote[]     │         │  per-view layouts,  │
     │  → buildGraph()     │         │  streams positions  │
     └─────────────────────┘         └─────────────────────┘
```

**Rules:**
1. **One graph model.** Every view reads the same `VaultGraph`. Views never parse files or own data. They map the graph to visuals.
2. **Views are plugins** that implement the `ViewModule` interface (§5). Adding a view means adding one folder and one registry entry.
3. **Heavy work off the main thread.** Parsing and force layout run in workers. The main thread only renders and handles input.
4. **Pure core.** `src/core/` has no DOM or React imports, so it is easy to unit test and can run inside workers.
5. **Read-only vault.** Never call any write method on a file handle.

---

## 4. Data model

All types live in `src/core/model.ts`.

### 4.1 Types

```ts
export type NoteId = string;   // normalized vault-relative path, no extension, lowercase
export type TagId = string;    // normalized tag, lowercase, no leading '#', nested with '/'
export type FolderId = string; // normalized folder path, '' is the vault root

export interface Note {
  id: NoteId;
  path: string;              // original vault-relative path with original casing, e.g. "Projects/Alpha.md"
  title: string;             // frontmatter title > first H1 > filename
  folder: FolderId;
  aliases: string[];         // from frontmatter `aliases`
  tags: TagId[];             // union of frontmatter tags and inline #tags, deduplicated
  frontmatter: Record<string, unknown>;
  headings: { depth: number; text: string }[];
  wordCount: number;
  charCount: number;
  created: number;           // epoch ms (see assumption A19)
  updated: number;           // epoch ms
  excerpt: string;           // first ~240 chars of plain text
  isAttachment?: false;
}

export type LinkKind = 'wikilink' | 'markdown' | 'embed';

export interface Link {
  id: string;                // `${source}->${target}#${index}`
  source: NoteId;
  target: NoteId;            // resolved id, or a ghost id (see below)
  kind: LinkKind;
  heading?: string;          // [[Note#Heading]]
  alias?: string;            // [[Note|Alias]]
  resolved: boolean;         // false = target note does not exist ("ghost" note)
}

export interface Tag {
  id: TagId;
  parent?: TagId;            // "project/alpha" → parent "project"
  noteIds: NoteId[];
  color: string;             // derived, see §8
}

export interface Folder {
  id: FolderId;
  parent?: FolderId;
  name: string;
  noteIds: NoteId[];
  childFolderIds: FolderId[];
}

export interface VaultGraph {
  vaultName: string;
  notes: Map<NoteId, Note>;
  links: Link[];
  ghosts: Set<NoteId>;                 // link targets with no file
  tags: Map<TagId, Tag>;
  folders: Map<FolderId, Folder>;
  outLinks: Map<NoteId, Link[]>;
  inLinks: Map<NoteId, Link[]>;        // backlinks
  tagCooccurrence: Map<string, number>; // key `${a}|${b}` with a < b
  stats: {
    noteCount: number; linkCount: number; tagCount: number;
    orphanCount: number;               // no in or out links
    dateRange: [number, number];
  };
}
```

`VaultGraph` crosses the worker boundary, so also provide `serializeGraph`/`deserializeGraph` that convert Maps and Sets to arrays.

### 4.2 Parsing rules (`src/core/parse/`)

- **Files:** include `*.md` and `*.markdown`. Skip folders starting with `.` (e.g. `.obsidian`, `.git`, `.trash`) and anything in a user-editable ignore list (default: `node_modules`, `templates`).
- **Frontmatter:** YAML between leading `---` fences. Read `title`, `aliases` (string or list), `tags` (string, comma string, or list), `created`/`date`, `updated`. Invalid YAML must not crash the parse: record a warning and treat the note as having no frontmatter.
- **Inline tags:** `#tag`, `#nested/tag`, `#tag-with_dashes`. Not inside code spans, fenced code, or URLs. Not a heading (`# Title`). Must contain at least one non-digit (`#123` is not a tag). Normalize to lowercase.
- **Wikilinks:** `[[Target]]`, `[[Target|Alias]]`, `[[Target#Heading]]`, `[[Target#Heading|Alias]]`, `![[Embed]]` (kind `embed`). Ignore inside code.
- **Markdown links:** `[text](relative/path.md)` and `[text](relative/path)` where the target resolves to a vault note. Ignore `http(s):`, `mailto:` and anchors-only.
- **Word count:** words in text nodes only, excluding frontmatter and code blocks.

### 4.3 Link resolution (`src/core/graph/resolve.ts`)

Resolve each link target in this order:
1. Exact vault-relative path match (with or without `.md`), case-insensitive.
2. Path relative to the source note's folder.
3. Unique basename match anywhere in the vault.
4. Alias match from frontmatter `aliases`.
5. If several basenames match, pick the one with the shortest path, then alphabetical (Obsidian behaviour).
6. Otherwise mark `resolved: false` and add the target to `ghosts`.

Embeds of non-markdown files (images, PDFs) are ignored in v1.

### 4.4 Layout data (separate from the graph)

```ts
export interface NodePosition { id: string; x: number; y: number; z?: number }
export interface LayoutSnapshot { viewId: string; vaultHash: string; positions: NodePosition[] }
```

Positions are cached in IndexedDB per view and per vault hash, so reopening a vault does not re-run the simulation from scratch.

---

## 5. View plugin interface

`src/views/types.ts`:

```ts
export interface ViewContext {
  graph: VaultGraph;
  visible: { notes: Set<NoteId>; links: Set<string> };  // after lenses
  theme: ThemePalette;
  focus: NoteId | null;
  reducedMotion: boolean;
  layout: LayoutClient;          // Comlink proxy to layout worker
  onFocus(id: NoteId | null): void;
  onHover(id: NoteId | null): void;
}

export interface ViewModule {
  id: string;                    // 'force' | 'galaxy' | ...
  label: string;
  icon: string;                  // lucide icon name
  renderer: 'pixi' | 'svg';
  mount(el: HTMLElement, ctx: ViewContext): ViewInstance;
}

export interface ViewInstance {
  update(ctx: ViewContext): void;     // graph, lens, theme or focus changed
  focusNode(id: NoteId): void;        // pan/zoom to node
  exportImage(): Promise<Blob>;       // PNG
  destroy(): void;
}
```

`src/views/registry.ts` exports the list of `ViewModule`s. The view switcher reads from the registry.

---

## 6. Folder structure

```
vault-lens/
├─ PLAN.md
├─ README.md
├─ docs/
│  └─ DECISIONS.md                # deviations from the plan, one short entry each
├─ index.html
├─ vite.config.ts                 # includes VitePWA config
├─ tsconfig.json
├─ package.json
├─ playwright.config.ts
├─ .github/workflows/
│  ├─ ci.yml                      # typecheck, lint, unit, e2e
│  └─ pages.yml                   # deploy dist/ to GitHub Pages
├─ public/
│  ├─ icons/                      # 192, 512, maskable PNGs
│  └─ favicon.svg
├─ fixtures/
│  ├─ sample-vault/               # ~40 notes covering every parser case (see §9)
│  └─ generate-large-vault.ts     # script: N notes with random links/tags for perf tests
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ core/                       # pure TS, no DOM
│  │  ├─ model.ts
│  │  ├─ parse/
│  │  │  ├─ parseNote.ts
│  │  │  ├─ frontmatter.ts
│  │  │  ├─ remarkWikilinks.ts
│  │  │  ├─ remarkTags.ts
│  │  │  └─ wordCount.ts
│  │  ├─ graph/
│  │  │  ├─ buildGraph.ts
│  │  │  ├─ resolve.ts
│  │  │  ├─ metrics.ts           # degree, orphans, co-occurrence, clusters
│  │  │  └─ serialize.ts
│  │  ├─ lens/
│  │  │  └─ applyLenses.ts       # LensState + VaultGraph → visible sets
│  │  └─ color/
│  │     └─ tagColor.ts          # deterministic tag → color per theme
│  ├─ ingest/
│  │  ├─ fsAccess.ts             # showDirectoryPicker, recursive walk, permission re-request
│  │  ├─ dragDrop.ts             # DataTransferItem.webkitGetAsEntry walk
│  │  ├─ zip.ts                  # fflate unzip
│  │  └─ types.ts                # RawFile { path, text, lastModified }
│  ├─ cache/
│  │  └─ db.ts                   # Dexie schema: handles, notes, layouts, settings
│  ├─ workers/
│  │  ├─ parse.worker.ts
│  │  ├─ layout.worker.ts
│  │  └─ clients.ts              # Comlink wrappers
│  ├─ state/
│  │  ├─ vaultStore.ts
│  │  ├─ viewStore.ts
│  │  ├─ lensStore.ts
│  │  └─ themeStore.ts
│  ├─ themes/
│  │  ├─ palettes.ts             # neon, watercolor, pastel, darkSpace
│  │  └─ theme.css               # CSS variables per theme
│  ├─ views/
│  │  ├─ types.ts
│  │  ├─ registry.ts
│  │  ├─ shared/                 # pixi app setup, camera (pan/zoom), glow filter, hit testing, labels
│  │  ├─ force/
│  │  ├─ galaxy/
│  │  ├─ tagGarden/
│  │  ├─ timeline/
│  │  ├─ chord/
│  │  ├─ calendar/
│  │  └─ city/                   # stretch
│  ├─ components/
│  │  ├─ TopBar.tsx
│  │  ├─ VaultPicker.tsx
│  │  ├─ ViewSwitcher.tsx
│  │  ├─ SearchBox.tsx
│  │  ├─ LensPanel.tsx
│  │  ├─ PreviewPanel.tsx
│  │  ├─ Legend.tsx
│  │  ├─ StatsBar.tsx
│  │  ├─ Tooltip.tsx
│  │  └─ EmptyState.tsx
│  └─ styles/
└─ tests/
   ├─ unit/                       # mirrors src/core
   └─ e2e/                        # Playwright specs, load fixtures via zip or drag-drop
```

---

## 7. Phases

Each phase ends in a working, deployable app. Do not start a phase until the previous one meets every acceptance criterion.

### Phase 0: Scaffold

**Build:**
- Vite + React + TS strict project, ESLint (typescript-eslint, react-hooks), Prettier.
- Scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `e2e`.
- vite-plugin-pwa with manifest (name, short_name, theme_color, icons 192/512/maskable, `display: standalone`), auto-update service worker, precache of app shell.
- Empty app shell layout: top bar, left lens panel (collapsed), center view area with an empty state, right preview panel (collapsed).
- `fixtures/sample-vault/` (see §9).
- CI workflow running typecheck, lint, unit and e2e. Pages deploy workflow.

**Acceptance criteria:**
- [ ] `npm run build` succeeds with zero TypeScript errors and zero lint errors.
- [ ] Lighthouse PWA checks pass on `npm run preview` (installable, has manifest, service worker controls the page).
- [ ] App loads offline after first visit (Playwright: load, go offline, reload, shell renders).
- [ ] One placeholder unit test and one placeholder e2e test pass in CI.

### Phase 1: Ingest, parse, graph model, basic force graph

**Build:**
- Ingest: FS Access picker (Chromium), drag-and-drop folder, and .zip upload. Feature-detect and show only what works. All three produce `RawFile[]`.
- Parse worker running the remark pipeline (§4.2) and `buildGraph` (§4.3). Progress events ("Parsed 1,240 / 3,000").
- Dexie cache: store the directory handle; on reload, offer "Reopen <vault name>" and re-request permission. Cache `ParsedNote` by path + `lastModified` so unchanged files are not re-parsed.
- Force view in Pixi: nodes as circles sized by `sqrt(wordCount)`, colored by first tag (or folder if no tags); edges as thin lines; ghost notes as hollow circles; pan, zoom, drag nodes; hover tooltip (title, tags, word count); labels appear above a zoom threshold.
- Layout worker running d3-force, streaming positions every animation frame until the simulation cools, then caching final positions.
- Stats bar: notes, links, tags, orphans, ghosts.

**Tests:**
- Unit tests for every parsing rule and every resolution rule, using the fixture vault (one test per bullet in §4.2 and §4.3).
- `buildGraph` snapshot test on the fixture vault (counts of notes, links, tags, ghosts, orphans).
- e2e: load fixture vault via zip, see the canvas, see stats bar numbers that match the fixture's expected counts.

**Acceptance criteria:**
- [ ] Fixture vault parses with exactly the expected counts in `fixtures/sample-vault/EXPECTED.json`.
- [ ] Tags inside code blocks and URLs are not extracted. Wikilinks in code are not extracted.
- [ ] `[[Note|Alias]]`, `[[Note#Heading]]`, `![[Embed]]`, relative markdown links and alias links all resolve correctly.
- [ ] Malformed YAML frontmatter produces a warning and does not stop the parse.
- [ ] A generated 5,000-note / 20,000-link vault parses in under 8 s on a mid-range laptop, and the force view stays above 45 fps while panning after layout settles. Main thread is never blocked for more than 200 ms during parse (measure with a long-task observer in an e2e perf test).
- [ ] Reloading the page with a cached vault shows the graph in under 2 s without re-parsing unchanged files.
- [ ] Works in Chrome via picker, and in Firefox via zip and drag-and-drop.

### Phase 2: Focus, preview, search, lenses, themes

**Build:**
- **Focus on click:** clicked node and its 1-hop neighbours stay bright; everything else dims to ~15% opacity. Shift+click expands to 2 hops. Esc clears focus. Camera eases to the focused node.
- **Preview panel:** rendered markdown (react-markdown + gfm), with frontmatter shown as a small property table, tag chips, an outgoing links list and a backlinks list. Clicking a wikilink inside the preview focuses that note in the view. The preview reads text from the cached `RawFile` or re-reads the file handle.
- **Search:** fuzzy search over titles, aliases and tags (use `fuse.js`). Enter focuses the top result. Keyboard shortcut `/` or `Ctrl/Cmd+K`.
- **Lenses** (`src/core/lens/applyLenses.ts`, pure and unit tested). A lens state is serializable to the URL hash so a view can be bookmarked.
  - Tag lens: include any / all / exclude selected tags; nested tags match children.
  - Folder lens: include/exclude folders.
  - Date lens: updated or created within a range.
  - Degree lens: min/max links.
  - Toggles: show orphans, show ghosts, show attachments (off).
  - Lens chips appear in the top bar and can be removed with one click.
- **Themes:** Neon, Watercolor, Pastel, Dark Space (palettes in §8). Theme switcher in top bar, persisted in Dexie. Respect `prefers-reduced-motion` (no pulsing, no camera easing).
- **Orphans as comets:** in the force view, orphan notes drift slowly around the edge of the graph with a short fading tail.
- **Recency glow:** node glow intensity scales with how recently it was updated (top 10% most recent glow strongest).

**Tests:**
- Unit: `applyLenses` covers each lens type and combinations; `tagColor` is deterministic and returns the same color for the same tag and theme.
- e2e: click a node, preview shows its title; click a wikilink in preview, focus moves; apply a tag lens, node count in stats bar drops to the expected number; switch theme, background color changes; URL hash restores the same lens after reload.

**Acceptance criteria:**
- [ ] Every interaction above is reachable by keyboard (Tab to the canvas, arrow keys move focus between neighbours, Enter opens preview).
- [ ] All text meets WCAG AA contrast in every theme (check with axe in e2e).
- [ ] Applying or removing a lens updates the view in under 100 ms on the 5,000-note vault.
- [ ] Tag colors are identical across reloads and across views.

### Phase 3: Creative views

Each view is a `ViewModule` in its own folder, uses the shared camera, focus, tooltip and preview, and respects lenses and theme. Build them in this order and commit after each.

1. **Galaxy** (Pixi, 2.5D)
   - Each top-level folder is a solar system: a "sun" at the folder centroid, sized by note count. Subfolders are moons orbiting their parent.
   - Notes are planets on concentric orbit rings around their folder's sun; ring index from link degree (more links = closer orbit). Planet size from `sqrt(wordCount)`; glow from recency; color from first tag.
   - Links between notes in different systems are drawn as faint curved arcs ("hyperlanes"); links within a system are hidden unless a note is focused.
   - Orphans are comets with tails crossing the background. Ghost notes are dim asteroids.
   - Background: two or three parallax starfield layers. Planets slowly orbit (pauses when reduced motion is on).
   - Layout computed in the layout worker with a deterministic seeded random so the galaxy looks the same each load.

2. **Tag Garden** (Pixi)
   - Each top-level tag is a plant rooted along a ground line; nested tags are branches; notes are leaves or flowers on the branch of each tag they carry. Plant height from note count.
   - A note with several tags appears once, as a flower on its first tag's plant, with vines drawn to its other tags' plants.
   - Untagged notes sit as seeds in a "compost" bed at one side.
   - Gentle sway animation (off with reduced motion).

3. **Constellation Timeline** (Pixi)
   - X axis is time (created or updated, toggle). Y is a stable hash of the folder (swim lanes per folder, labelled).
   - Notes are stars; links are constellation lines.
   - A time scrubber at the bottom with play/pause: notes appear as the playhead passes their date; links appear when both ends exist. Speed control 1x to 32x.
   - Brushing a range on the scrubber sets the date lens.

4. **Tag Chord** (D3, SVG)
   - Chord diagram of tag co-occurrence for the top N tags (default 24, slider 8 to 60). Arc size = note count, ribbon = co-occurrence count.
   - Hover a ribbon: tooltip with the count and the list of notes. Click an arc: applies a tag lens and switches back to the previous view.

5. **Heat-map Calendar** (D3, SVG)
   - GitHub-style year grid of notes created or updated per day, multiple years stacked. Color scale from the theme.
   - Click a day: lists the notes for that day in the preview panel; click one to focus it.

6. **City Map** (stretch, only if time allows)
   - Folders are districts (treemap layout via d3-hierarchy), notes are buildings (footprint by word count, height by link degree shown with isometric shading), links between districts are subway lines with stations at the linked notes.

**Tests:**
- Unit tests for each layout function (deterministic output for the fixture vault; snapshot positions rounded to integers).
- e2e: switch to every view, take a screenshot, check no console errors, focus a node in each and confirm the preview opens.

**Acceptance criteria:**
- [ ] All five required views render the fixture vault and the 5,000-note vault without errors.
- [ ] Switching views keeps the current focus and lenses.
- [ ] Each view stays above 45 fps on the 5,000-note vault while idle-animating (chord and calendar limited to their top-N or yearly data).
- [ ] Each view has a legend explaining its encodings (size, color, glow, position).
- [ ] Reduced motion stops all ambient animation in all views.

### Phase 4: Live updates, export, polish

**Build:**
- **Re-scan:** a Refresh button, plus an optional "watch" toggle that polls the directory handle every 5 s (Chromium only) and re-parses only files whose `lastModified` changed, added or removed. Use `FileSystemObserver` instead of polling where the browser supports it. The graph updates in place: new nodes fade in, deleted nodes fade out, and the layout warm-starts from cached positions.
- **Export:** PNG of the current view (2x resolution), SVG for chord and calendar, and `graph.json` (the serialized VaultGraph without note bodies).
- **Share card:** "Export poster" renders the current view with vault name and stats as a 1600x900 PNG.
- **Settings panel:** ignore list, default view, label density, animation speed, clear cache.
- **Onboarding:** first-run empty state with a "Try the sample vault" button that loads the bundled fixture vault.
- **Error handling:** permission revoked, unreadable files, huge files (skip files > 2 MB with a warning), empty folder.
- **Performance pass:** viewport culling, level-of-detail labels, texture atlases for node sprites, profile and fix anything over budget.

**Acceptance criteria:**
- [ ] Editing a note in another app shows the change in the view within 6 s while watch is on.
- [ ] Exported PNG matches what is on screen; exported JSON round-trips through `deserializeGraph`.
- [ ] "Try the sample vault" works offline on a fresh install.
- [ ] Lighthouse: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, PWA checks pass.
- [ ] Initial JS bundle under 350 KB gzipped; each view is a lazy-loaded chunk.

### Later (not in this build)

Three.js 3D galaxy, City Map if skipped, cloud sync or Git-based vault loading, note editing, Canvas files from Obsidian, embeddings-based "semantic neighbours" view, plugin API for community views.

---

## 8. Visual design

**Tag colors:** `tagColor(tag, theme)` hashes the tag string (FNV-1a) to a hue (0 to 360). Each theme defines saturation and lightness ranges and an optional hue rotation. Nested tags inherit the parent hue and shift lightness by depth. The same tag always gets the same color in a given theme.

**Theme palettes** (`src/themes/palettes.ts`):

| Theme | Background | Node style | Edge style | Feel |
|-------|-----------|-----------|-----------|------|
| Neon | near-black `#07070d` | saturated hues, S 90%, L 60%, strong additive glow | cyan-tinted, additive blend | synthwave |
| Watercolor | warm paper `#f6f1e7` with subtle noise texture | S 45%, L 60%, soft blurred edges, multiply blend | thin ink lines `#3b3a36` at 30% | sketchbook |
| Pastel | `#fbf7ff` | S 55%, L 80%, no glow, thin darker outline | lavender `#b8a9d9` | calm, light |
| Dark Space | deep navy gradient `#050816 → #0d1b3d` with starfield | S 70%, L 65%, soft glow | faint white at 15% | default for galaxy |

Each palette exports: `background`, `surface`, `text`, `mutedText`, `accent`, `edge`, `edgeHighlight`, `ghost`, `glowStrength`, `blendMode`, `hueRotation`, `satRange`, `lightRange`, and a sequential scale for the calendar.

**Default theme:** Dark Space. **Default view:** Force graph (Galaxy is one click away and featured in onboarding).

**Encodings used everywhere unless a view says otherwise:**
- Size = `sqrt(wordCount)`, clamped.
- Color = first tag (folder color if untagged).
- Glow = recency.
- Hollow = ghost (link target with no file).
- Comet = orphan.

---

## 9. Fixture vault

`fixtures/sample-vault/` must contain about 40 notes across 3 to 4 folders with nested subfolders, and must exercise every rule. At minimum:

- Frontmatter with `tags` as a list, as a string, and as a comma string; `aliases`; `created`; one note with malformed YAML.
- Inline tags including nested (`#project/alpha`), tags inside inline code, fenced code and a URL fragment (all must be ignored), and `#123` (ignored).
- Wikilinks of every form in §4.2, including ones inside code (ignored), links to missing notes (ghosts), duplicate basenames in different folders, and an alias link.
- Relative markdown links, external links (ignored), and an image embed (ignored).
- At least 3 orphan notes, one empty note, one very long note, notes spread over at least 18 months of `created` dates.
- A `.obsidian/` folder with a JSON file (must be skipped).

`fixtures/sample-vault/EXPECTED.json` lists the expected counts (notes, links by kind, resolved, ghosts, tags, orphans) and is the source of truth for Phase 1 tests. A zipped copy is generated at build time for e2e tests and the in-app "Try the sample vault" button.

`fixtures/generate-large-vault.ts` takes `--notes N --links-per-note M --tags T --seed S` and writes a synthetic vault for performance tests.

---

## 10. Quality bar

- TypeScript strict, no `any` outside clearly marked interop shims.
- `src/core` has 90%+ line coverage.
- No network requests at runtime except loading the app itself (verify in e2e by failing on any unexpected request).
- Content Security Policy in `index.html`: no inline scripts, no remote origins.
- All user-facing strings in one `src/strings.ts` file to make future translation easy.
- `README.md` explains what the app does, browser support, how to run, how to add a new view, and the privacy promise (your notes never leave your device).

---

## 11. Browser support

| Browser | Open folder | Drag-drop folder | Zip | Watch for changes | Install as app |
|---------|------------|------------------|-----|-------------------|----------------|
| Chrome / Edge (desktop) | Yes | Yes | Yes | Yes | Yes |
| Firefox | No | Yes | Yes | No (manual refresh after re-drop) | No (works as a website) |
| Safari (macOS / iOS) | No | Yes (macOS) | Yes | No | Yes (Add to Dock / Home Screen) |
| Android Chrome | Partial | No | Yes | No | Yes |

Detect capabilities at runtime and hide unavailable options instead of showing errors.
