import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@perf/ },
    // Performance budgets need a real GPU; headless Chromium otherwise falls back to SwiftShader (CPU).
    {
      name: 'perf',
      grep: /@perf/,
      // Runs after the functional projects so timings are not skewed by parallel tests.
      dependencies: ['chromium', 'firefox'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 760 },
        launchOptions: { args: ['--enable-gpu', '--use-angle=gl', '--ignore-gpu-blocklist'] },
      },
    },
    // Firefox runs the cross-browser ingest paths (zip, drag-and-drop, folder input). Tag a test with @cross.
    // WebGL is disabled so the Canvas 2D renderer fallback is covered too (CI runners have no GPU anyway).
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: { 'webgl.disabled': true } } },
      grep: /@cross/,
    },
  ],
  webServer: {
    // e2e runs against the production build so the service worker and CSP are real.
    command: `npm run fixtures:zip && npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
