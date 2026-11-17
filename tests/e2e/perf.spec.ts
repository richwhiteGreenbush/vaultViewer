import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { expect, loadInfo, test } from './helpers';

const LARGE_ZIP = 'fixtures/large-vault.zip';

test.describe('performance: 5,000 notes / 20,000 links @perf', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');
  test.setTimeout(180_000);

  test.beforeAll(() => {
    if (!existsSync(LARGE_ZIP)) {
      execFileSync('node', [
        'fixtures/generate-large-vault.ts',
        '--notes',
        '5000',
        '--links-per-note',
        '4',
        '--tags',
        '60',
        '--seed',
        '1',
      ]);
      execFileSync('node', ['scripts/zip-fixtures.mjs', 'fixtures/large-vault', LARGE_ZIP]);
    }
  });

  test('parses under 8 s, never blocks > 200 ms while parsing, pans above 45 fps, lenses apply under 100 ms', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __longTasks: { start: number; duration: number }[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    });
    await page.goto('./');

    // --- parse ---
    const parseStart = await page.evaluate(() => performance.now());
    await page.getByTestId('zip-input').setInputFiles(LARGE_ZIP);
    await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', '5000', { timeout: 60_000 });
    const parseEnd = await page.evaluate(() => performance.now());
    const info = await loadInfo(page);
    expect(info?.parsedCount).toBe(5000);
    await expect(page.getByTestId('stat-links')).toHaveAttribute('data-value', '20000');

    const longTasks = await page.evaluate(
      () => (window as unknown as { __longTasks: { start: number; duration: number }[] }).__longTasks,
    );
    // "During parse": from picking the file until the parse worker's result has been received.
    const workerDone = parseStart + (info?.ms.total ?? 0) + 50;
    const duringParse = longTasks.filter((t) => t.start >= parseStart && t.start <= workerDone);
    const maxDuringParse = Math.max(0, ...duringParse.map((t) => t.duration));
    const maxOverall = Math.max(
      0,
      ...longTasks.filter((t) => t.start >= parseStart && t.start <= parseEnd).map((t) => t.duration),
    );

    // --- layout settles ---
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-layout', 'settled', {
      timeout: 120_000,
    });

    // --- fps while panning (needs a hardware GPU; SwiftShader is a CPU rasterizer) ---
    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
    const box = await page.getByTestId('graph-canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __rafOn: boolean };
      w.__frames = [];
      w.__rafOn = true;
      const tick = (t: number) => {
        w.__frames.push(t);
        if (w.__rafOn) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Pan from empty space near a corner (avoids dragging a node).
    const sx = box.x + 8;
    const sy = box.y + 8;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < 3000) {
      k++;
      await page.mouse.move(sx + 150 + Math.sin(k / 10) * 120, sy + 150 + Math.cos(k / 10) * 90);
    }
    await page.mouse.up();
    const fps = await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __rafOn: boolean };
      w.__rafOn = false;
      const f = w.__frames;
      const span = (f[f.length - 1] ?? 0) - (f[0] ?? 0);
      return span > 0 ? ((f.length - 1) * 1000) / span : 0;
    });

    // --- lens updates (apply and remove), measured from the hash change to the next painted frame ---
    const lensMs = async (hash: string) =>
      page.evaluate(async (hash) => {
        const stat = () => document.querySelector('[data-testid="stat-notes"]')?.getAttribute('data-value');
        const before = stat();
        const t0 = performance.now();
        location.hash = hash;
        await new Promise<void>((resolve) => {
          const check = () => (stat() !== before ? resolve() : requestAnimationFrame(check));
          check();
        });
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        return performance.now() - t0;
      }, hash);
    const lensSamples: number[] = [];
    for (const tag of ['topic0', 'topic5', 'topic10', 'topic15', 'topic20']) {
      lensSamples.push(await lensMs(`#t=${tag}`)); // apply
      lensSamples.push(await lensMs('#')); // remove
    }
    const sorted = [...lensSamples].sort((a, b) => a - b);
    const lensMedianMs = Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0);
    const lensWorstMs = Math.round(sorted[sorted.length - 1] ?? 0);
    const lensOver100 = lensSamples.filter((t) => t >= 100).length;

    const report = {
      parseMsWorker: Math.round(info?.ms.total ?? 0),
      parseMsWall: Math.round(parseEnd - parseStart),
      maxLongTaskDuringParseMs: Math.round(maxDuringParse),
      maxLongTaskUntilGraphShownMs: Math.round(maxOverall),
      panFps: Math.round(fps),
      lensMedianMs,
      lensWorstMs,
      lensMs: lensSamples.map(Math.round),
      gpu,
    };
    console.log('PERF', JSON.stringify(report));
    test.info().annotations.push({ type: 'perf', description: JSON.stringify(report) });

    expect(report.parseMsWall).toBeLessThan(8_000);
    expect(report.maxLongTaskDuringParseMs).toBeLessThanOrEqual(200);
    // Frame-bound budgets (pan fps, lens update incl. one painted frame) need a hardware GPU; SwiftShader
    // takes ~250 ms just to paint one frame of this graph.
    if (/swiftshader|llvmpipe|software/i.test(gpu)) {
      test.info().annotations.push({ type: 'skipped-frame-budgets', description: `software renderer: ${gpu}` });
    } else {
      expect(report.panFps).toBeGreaterThan(45);
      // Typical lens updates must be well under 100 ms; allow one GC/scheduling outlier in ten on a busy machine.
      expect(report.lensMedianMs).toBeLessThan(60);
      expect(lensOver100).toBeLessThanOrEqual(1);
    }
  });
});
