import { expect, test } from '@playwright/test';

test('app shell renders with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Vault Lens' })).toBeVisible();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  expect(errors).toEqual([]);
});

test('production build ships a strict CSP and a manifest', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toMatch(/https?:/);
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await (await page.request.get(manifestHref ?? '')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});

test('app loads offline after the first visit', async ({ page, context }) => {
  await page.goto('./');
  // Wait until the service worker is active and controlling the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Vault Lens' })).toBeVisible();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await context.setOffline(false);
});

test('Chrome reports the app as installable (no installability errors)', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors).toEqual([]);
  const { url, errors } = (await cdp.send('Page.getAppManifest')) as { url: string; errors: unknown[] };
  expect(url).toContain('manifest.webmanifest');
  expect(errors).toEqual([]);
});
