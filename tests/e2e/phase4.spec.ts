import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { deserializeGraph, type SerializedGraph } from '../../src/core/graph/serialize';
import {
  expect,
  expectFixtureStats,
  fixtureFiles,
  pngSize,
  SAMPLE_ZIP,
  setupOpfsVault,
  test,
  waitForSettledGraph,
  writeOpfsFile,
} from './helpers';

const chromiumOnly = (browserName: string) => browserName !== 'chromium';

async function openOpfs(page: Page, files = fixtureFiles()) {
  await page.goto('./');
  await setupOpfsVault(page, files);
  await page.getByRole('button', { name: 'Open folder' }).click();
}

async function setWatch(page: Page, on: boolean) {
  await page.getByTestId('settings-button').click();
  const box = page.getByLabel('Watch the open folder for changes');
  if (on) await box.check();
  else await box.uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
}

test.describe('live updates', () => {
  test.skip(({ browserName }) => chromiumOnly(browserName), 'File System Access is Chromium-only');

  test('with watch on, an edit made outside the app shows up within 6 s; a new note fades in', async ({
    page,
  }) => {
    await openOpfs(page);
    await waitForSettledGraph(page);
    await setWatch(page, true);
    await expect(page.getByTestId('watching')).toBeVisible();

    // Edit an existing note in "another app": add a link to a missing note.
    const t0 = Date.now();
    await writeOpfsFile(
      page,
      'Welcome.md',
      `${fixtureFiles().find(([p]) => p === 'Welcome.md')?.[1]}\nSee [[A Brand New Ghost]].\n`,
    );
    await expect(page.getByTestId('stat-ghosts')).toHaveAttribute('data-value', '5', { timeout: 6_000 });
    test.info().annotations.push({ type: 'watch-latency-ms', description: String(Date.now() - t0) });

    // Add a note: it appears (fading in) without re-parsing the rest.
    await writeOpfsFile(page, 'Inbox/Fresh Idea.md', '# Fresh Idea\n\nLinks to [[Welcome]].\n');
    await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', '40', { timeout: 6_000 });
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-fading-in', '1');
    expect(
      (await page.evaluate(() => (window as unknown as { __vaultLens: { parsedCount: number } }).__vaultLens))
        .parsedCount,
    ).toBe(1);
  });

  test('Refresh re-reads the folder; a folder that went away asks to reconnect', async ({ page }) => {
    await openOpfs(page);
    await waitForSettledGraph(page);
    await writeOpfsFile(page, 'Inbox/Another.md', '# Another\n');
    await page.getByTestId('refresh').click();
    await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', '40');
    // Simulate lost access: the folder is deleted behind our back.
    await page.evaluate(async () =>
      (await navigator.storage.getDirectory()).removeEntry('sample-vault', { recursive: true }),
    );
    await page.getByTestId('refresh').click();
    await expect(page.getByRole('button', { name: /Reconnect/ })).toBeVisible();
    await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', '40'); // the graph stays
  });

  test('oversized files are skipped with a warning; an empty folder explains itself', async ({ page }) => {
    await openOpfs(page, [...fixtureFiles(), ['Huge.md', `# Huge\n${'x'.repeat(2.2 * 1024 * 1024)}`]]);
    await waitForSettledGraph(page);
    await expectFixtureStats(page);
    await page.getByTestId('stat-warnings').click();
    await expect(page.getByTestId('warnings-dialog')).toContainText('Huge.md: skipped, larger than 2 MB');
    await page.getByRole('button', { name: 'Close' }).click();

    await setupOpfsVault(page, [['notes.txt', 'not markdown']], 'empty-vault');
    await page.getByRole('button', { name: 'Open folder' }).click();
    await expect(page.getByRole('alert')).toHaveText('No markdown notes found in that folder.');
  });

  test('the ignore list is applied on the next scan', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('settings-button').click();
    await page.getByTestId('settings-ignore').fill('templates, journal');
    await page.getByRole('button', { name: 'Done' }).click();
    await setupOpfsVault(page, fixtureFiles());
    await page.getByRole('button', { name: 'Open folder' }).click();
    await waitForSettledGraph(page);
    await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', String(39 - 14));
  });
});

test.describe('export', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // nothing moves between screenshot and export
    await page.goto('./');
    await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
    await waitForSettledGraph(page);
  });

  const exportItem = async (page: Page, name: string | RegExp) => {
    await page.getByTestId('export-menu').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name }).click(),
    ]);
    return { name: dl.suggestedFilename(), buf: readFileSync((await dl.path()) as string) };
  };

  test('PNG export is a 2x image of what is on screen', async ({ page }) => {
    const canvas = page.getByTestId('graph-canvas');
    const box = await canvas.boundingBox();
    const shot = await canvas.screenshot();
    const { name, buf } = await exportItem(page, /PNG image/);
    expect(name).toBe('sample-vault-force.png');
    const size = pngSize(buf);
    expect(size.width).toBe(Math.round((box?.width ?? 0) * 2));
    expect(size.height).toBe(Math.round((box?.height ?? 0) * 2));
    // Compare the export (scaled to 1x) with a screenshot of the canvas, pixel by pixel.
    const diff = await page.evaluate(
      async ([a, b]) => {
        // Decode by hand: the app's CSP (rightly) blocks fetching data: URLs.
        const load = async (b64: string) =>
          createImageBitmap(
            new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }),
          );
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const w = ib.width;
        const h = ib.height;
        const px = (img: ImageBitmap) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d') as CanvasRenderingContext2D;
          g.drawImage(img, 0, 0, w, h);
          return g.getImageData(0, 0, w, h).data;
        };
        const pa = px(ia);
        const pb = px(ib);
        let sum = 0;
        for (let i = 0; i < pa.length; i += 4) {
          sum +=
            Math.abs((pa[i] as number) - (pb[i] as number)) +
            Math.abs((pa[i + 1] as number) - (pb[i + 1] as number)) +
            Math.abs((pa[i + 2] as number) - (pb[i + 2] as number));
        }
        return sum / ((pa.length / 4) * 3);
      },
      [buf.toString('base64'), shot.toString('base64')] as [string, string],
    );
    test.info().annotations.push({ type: 'png-mean-abs-diff', description: diff.toFixed(2) });
    expect(diff).toBeLessThan(8); // out of 255: same picture, small differences from scaling and the CSS stars
  });

  test('graph.json round-trips through deserializeGraph and contains no note text', async ({ page }) => {
    const { name, buf } = await exportItem(page, /graph\.json/);
    expect(name).toBe('graph.json');
    const json = JSON.parse(buf.toString('utf8')) as SerializedGraph;
    const g = deserializeGraph(json);
    expect(g.stats.noteCount).toBe(39);
    expect(g.links).toHaveLength(58);
    expect(g.ghosts.size).toBe(4);
    expect(g.inLinks.get('welcome')?.length).toBe(5);
    expect([...g.notes.values()].every((n) => n.excerpt === '')).toBe(true);
    expect(buf.toString('utf8')).not.toContain('Endpoints follow the'); // a sentence from a note body
  });

  test('poster is 1600×900; chord and calendar export SVG', async ({ page }) => {
    const poster = await exportItem(page, /Poster/);
    expect(poster.name).toBe('sample-vault-force-poster.png');
    expect(pngSize(poster.buf)).toEqual({ width: 1600, height: 900 });

    for (const view of ['chord', 'calendar']) {
      await page.getByTestId('view-select').selectOption(view);
      await expect(page.getByTestId('view-host')).toHaveAttribute('data-layout', 'settled');
      const svg = await exportItem(page, /SVG/);
      expect(svg.name).toBe(`sample-vault-${view}.svg`);
      const text = svg.buf.toString('utf8');
      expect(text.startsWith('<svg')).toBe(true);
      expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(text).toContain(view === 'chord' ? '#journal' : '2025');
      const png = await exportItem(page, /PNG image/);
      expect(pngSize(png.buf).width).toBeGreaterThan(400);
    }
  });
});

test.describe('settings and onboarding', () => {
  test('default view persists; clear cache empties the app', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
    await waitForSettledGraph(page);
    await page.getByTestId('settings-button').click();
    await page.getByLabel('Default view').selectOption('galaxy');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.goto('./');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-view', 'galaxy');

    await page.getByTestId('settings-button').click();
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('clear-cache').click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('stats-bar')).toHaveText('No vault open');
  });

  test('"Try the sample vault" works offline on a fresh install', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'service worker offline test runs in Chromium');
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await waitForSettledGraph(page);
    await expectFixtureStats(page);
    await context.setOffline(false);
  });
});
