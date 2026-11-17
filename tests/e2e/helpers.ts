import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';

export const FIXTURE = 'fixtures/sample-vault';
export const SAMPLE_ZIP = 'public/sample-vault.zip';

export const expected = JSON.parse(readFileSync(join(FIXTURE, 'EXPECTED.json'), 'utf8')) as {
  notes: number;
  links: { total: number };
  tags: number;
  orphans: string[];
  ghosts: string[];
};

/** Fails the test on console errors, page errors, or any request that leaves the app's own origin. */
export const test = base.extend<{ guard: { errors: string[]; external: string[] } }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      const external: string[] = [];
      const origin = new URL(baseURL ?? 'http://localhost').origin;
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => {
        const url = r.url();
        if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:'))
          external.push(url);
      });
      const guard = { errors, external };
      await use(guard);
      expect(errors, 'console errors').toEqual([]);
      expect(external, 'unexpected network requests').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function expectFixtureStats(page: Page): Promise<void> {
  await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', String(expected.notes));
  await expect(page.getByTestId('stat-links')).toHaveAttribute('data-value', String(expected.links.total));
  await expect(page.getByTestId('stat-tags')).toHaveAttribute('data-value', String(expected.tags));
  await expect(page.getByTestId('stat-orphans')).toHaveAttribute(
    'data-value',
    String(expected.orphans.length),
  );
  await expect(page.getByTestId('stat-ghosts')).toHaveAttribute('data-value', String(expected.ghosts.length));
}

export async function waitForSettledGraph(page: Page, timeout = 20_000): Promise<void> {
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout });
  await expect(page.getByTestId('view-host')).toHaveAttribute('data-layout', 'settled', { timeout });
}

export function fixtureFiles(): [string, string][] {
  const out: [string, string][] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name !== 'EXPECTED.json')
        out.push([relative(FIXTURE, full).split('\\').join('/'), readFileSync(full, 'utf8')]);
    }
  })(FIXTURE);
  return out;
}

export const loadInfo = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __vaultLens?: { parsedCount: number; cachedCount: number; ms: { total: number } };
        }
      ).__vaultLens,
  );

/**
 * Writes files into an Origin Private File System folder and stubs `showDirectoryPicker` to return it:
 * a scriptable stand-in for a real folder opened with the File System Access API.
 */
export async function setupOpfsVault(
  page: Page,
  files: [string, string][],
  name = 'sample-vault',
): Promise<void> {
  await page.evaluate(
    async ({ files, name }) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name, { recursive: true }).catch(() => undefined);
      const vault = await root.getDirectoryHandle(name, { create: true });
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
      (
        window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(name);
    },
    { files, name },
  );
}

/** Writes (creates or replaces) one file in the OPFS vault. */
export async function writeOpfsFile(
  page: Page,
  path: string,
  text: string,
  name = 'sample-vault',
): Promise<void> {
  await page.evaluate(
    async ({ path, text, name }) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
      const parts = path.split('/');
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true });
      const w = await (
        await dir.getFileHandle(parts[parts.length - 1] as string, { create: true })
      ).createWritable();
      await w.write(text);
      await w.close();
    },
    { path, text, name },
  );
}

/** PNG width/height from the IHDR chunk. */
export const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
