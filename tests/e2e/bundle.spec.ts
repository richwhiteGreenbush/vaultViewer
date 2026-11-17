import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test } from './helpers';

const DIST = 'dist';
const BUDGET_GZIP = 350 * 1024;

test('initial JS is under 350 KB gzipped and every view is a lazy chunk', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'build check runs once');
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const initial = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1] as string);
  expect(initial.length).toBeGreaterThan(0);
  const sizes = initial.map((f) => gzipSync(readFileSync(join(DIST, f))).length);
  const total = sizes.reduce((a, b) => a + b, 0);
  test.info().annotations.push({ type: 'initial-js-gzip-kb', description: (total / 1024).toFixed(1) });
  expect(total).toBeLessThan(BUDGET_GZIP);
  // Every view is its own chunk, and none of them is loaded up front.
  const assets = readdirSync(join(DIST, 'assets'));
  for (const view of ['force', 'galaxy', 'tagGarden', 'timeline', 'chord', 'calendar']) {
    expect(
      assets.some((f) => f.startsWith(`${view}-`) && f.endsWith('.js')),
      `${view} chunk`,
    ).toBe(true);
    expect(
      initial.some((f) => f.startsWith(`assets/${view}-`)),
      `${view} not initial`,
    ).toBe(false);
  }
});
