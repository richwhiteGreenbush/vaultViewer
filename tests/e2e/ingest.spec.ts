import { readFileSync } from 'node:fs';
import {
  expect,
  expectFixtureStats,
  fixtureFiles,
  loadInfo,
  SAMPLE_ZIP,
  test,
  waitForSettledGraph,
} from './helpers';

test.describe('ingest', () => {
  test('loads the fixture vault from a .zip and shows the graph and expected stats @cross', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
    await waitForSettledGraph(page);
    await expectFixtureStats(page);
    await expect(page.getByTestId('stat-warnings')).toHaveText('1 warning');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-nodes', String(39 + 4));
  });

  test('"Try the sample vault" loads the bundled vault @cross', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await waitForSettledGraph(page);
    await expectFixtureStats(page);
  });

  test('dropping a .zip onto the window loads it @cross', async ({ page }) => {
    await page.goto('./');
    const bytes = [...readFileSync(SAMPLE_ZIP)];
    const dt = await page.evaluateHandle((data) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(data)], 'sample-vault.zip', { type: 'application/zip' }));
      return dt;
    }, bytes);
    await page.dispatchEvent('main', 'dragenter', { dataTransfer: dt });
    await page.dispatchEvent('main', 'drop', { dataTransfer: dt });
    await waitForSettledGraph(page);
    await expectFixtureStats(page);
  });

  test('folder <input webkitdirectory> fallback works when there is no folder picker @cross', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
    });
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Open folder' })).toHaveCount(0);
    await page.getByTestId('folder-input').setInputFiles('fixtures/sample-vault');
    await waitForSettledGraph(page);
    await expectFixtureStats(page);
  });

  test('hover shows a tooltip with title, tags and word count', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
    await waitForSettledGraph(page);
    const box = await page.getByTestId('graph-canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    let found = false;
    for (let dy = -200; dy <= 200 && !found; dy += 6) {
      for (let dx = -300; dx <= 300 && !found; dx += 6) {
        await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
        found = (await page.getByTestId('tooltip').count()) > 0;
      }
    }
    expect(found).toBe(true);
    await expect(page.getByTestId('tooltip')).toContainText(/words|Missing note/);
  });
});

test.describe('cache', () => {
  test('reloading restores a zip vault from cache in under 2 s without re-parsing', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
    await waitForSettledGraph(page);
    expect((await loadInfo(page))?.parsedCount).toBe(39);

    const t0 = Date.now();
    await page.reload();
    await waitForSettledGraph(page, 2_000);
    const elapsed = Date.now() - t0;
    await expectFixtureStats(page);
    const info = await loadInfo(page);
    expect(info?.parsedCount).toBe(0);
    expect(info?.cachedCount).toBe(39);
    expect(elapsed).toBeLessThan(2_000);
    test.info().annotations.push({ type: 'reload-ms', description: String(elapsed) });
  });
});

test.describe('File System Access (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');

  test('picker loads a folder, reload rescans it, and only changed files are re-parsed', async ({ page }) => {
    await page.goto('./');
    // Stand-in for the native picker: an Origin Private File System directory holding the fixture vault.
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('sample-vault', { recursive: true }).catch(() => undefined);
      const vault = await root.getDirectoryHandle('sample-vault', { create: true });
      for (const [path, text] of files) {
        const parts = path.split('/');
        let dir = vault;
        for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true });
        const w = await (
          await dir.getFileHandle(parts[parts.length - 1] as string, { create: true })
        ).createWritable();
        await w.write(text);
        await w.close();
      }
    }, fixtureFiles());
    const stubPicker = () =>
      page.evaluate(() => {
        (
          window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
        ).showDirectoryPicker = async () =>
          (await navigator.storage.getDirectory()).getDirectoryHandle('sample-vault');
      });
    await stubPicker();
    await page.getByRole('button', { name: 'Open folder' }).click();
    await waitForSettledGraph(page);
    await expectFixtureStats(page);
    expect((await loadInfo(page))?.parsedCount).toBe(39);

    // Reload: restored from cache, then rescanned via the stored handle (permission still granted).
    await page.reload();
    await waitForSettledGraph(page);
    await expect.poll(async () => (await loadInfo(page))?.cachedCount).toBe(39);
    expect((await loadInfo(page))?.parsedCount).toBe(0);

    // Edit one note, add a link to a new ghost, reload: exactly one file is re-parsed.
    await page.evaluate(async () => {
      const vault = await (await navigator.storage.getDirectory()).getDirectoryHandle('sample-vault');
      const w = await (await vault.getFileHandle('Welcome.md')).createWritable({ keepExistingData: true });
      const file = await (await vault.getFileHandle('Welcome.md')).getFile();
      await w.write({ type: 'write', position: file.size, data: '\nNew link to [[Brand New Ghost]].\n' });
      await w.close();
    });
    await page.reload();
    await waitForSettledGraph(page);
    await expect(page.getByTestId('stat-ghosts')).toHaveAttribute('data-value', '5');
    const info = await loadInfo(page);
    expect(info?.parsedCount).toBe(1);
    expect(info?.cachedCount).toBe(38);
  });
});
