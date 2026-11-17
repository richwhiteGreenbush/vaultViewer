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
