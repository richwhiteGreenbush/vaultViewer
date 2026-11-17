import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, SAMPLE_ZIP, test } from './helpers';

/** Views to exercise and how to "focus a node" in each. */
const PIXI_VIEWS = ['force', 'galaxy', 'tagGarden', 'timeline'];

async function load(page: Page, hash = '') {
  await page.goto(`./${hash}`);
  await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
  await expect(page.getByTestId('view-host')).toHaveAttribute('data-layout', 'settled', { timeout: 20_000 });
}

async function switchTo(page: Page, id: string) {
  await page.getByTestId('view-select').selectOption(id);
  await expect(page.getByTestId('view-host')).toHaveAttribute('data-view', id);
  await expect(page.getByTestId('view-host')).toHaveAttribute('data-layout', 'settled', { timeout: 20_000 });
}

async function clickNote(page: Page, id: string) {
  const p = await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __vaultLensView?: { screenPosition(id: string): { x: number; y: number } | null };
        }
      ).__vaultLensView?.screenPosition(id) ?? null,
    id,
  );
  if (!p) throw new Error(`node ${id} not on screen`);
  await page.mouse.click(p.x, p.y);
}

const registered = async (page: Page) =>
  page
    .getByTestId('view-select')
    .locator('option')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

test('every view renders the sample vault, has a legend, and focusing a note opens the preview @cross', async ({
  page,
}, info) => {
  await load(page);
  for (const id of await registered(page)) {
    await switchTo(page, id);
    await expect(page.getByTestId('legend')).toBeVisible();
    await page.waitForTimeout(300);
    await info.attach(`view-${id}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    if (PIXI_VIEWS.includes(id)) {
      await clickNote(page, 'areas/health/running');
      await expect(page.getByTestId('preview-title')).toHaveText('Running');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
  }
});

test('switching views keeps the focused note and the lenses', async ({ page }) => {
  await load(page, '#t=health');
  await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', '3');
  await clickNote(page, 'areas/health/running');
  await expect(page.getByTestId('preview-title')).toHaveText('Running');
  for (const id of await registered(page)) {
    if (id === 'force') continue;
    await switchTo(page, id);
    await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', '3');
    await expect(page.getByTestId('preview-title')).toHaveText('Running');
    await expect(page).toHaveURL(new RegExp(`v=${id}`));
    if (PIXI_VIEWS.includes(id)) {
      await expect(page.getByTestId('view-host')).toHaveAttribute('data-focus-size', /^[1-9]/);
    }
  }
  // Number keys switch views too.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('1');
  await expect(page.getByTestId('view-host')).toHaveAttribute('data-view', 'force');
});

for (const theme of ['darkSpace', 'pastel']) {
  test(`no WCAG 2.1 AA violations (axe) in any view, ${theme} theme`, async ({ page }) => {
    test.setTimeout(120_000); // six axe passes; the calendar alone has ~730 day cells
    await load(page);
    await page.getByTestId('theme-select').selectOption(theme);
    for (const id of await registered(page)) {
      await switchTo(page, id);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map(
        (v) =>
          `${id} ${v.id}: ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(' | ')}`,
      );
      expect(summary).toEqual([]);
    }
  });
}

test('reduced motion stops ambient animation in every view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  for (const id of await registered(page)) {
    await switchTo(page, id);
    if (!PIXI_VIEWS.includes(id)) continue; // SVG views have no ambient animation
    const sample = () =>
      page.evaluate(() => {
        const v = (
          window as unknown as {
            __vaultLensView?: { screenPosition(id: string): { x: number; y: number } | null };
          }
        ).__vaultLensView;
        return ['empty', 'areas/health/running', 'welcome'].map((id) => v?.screenPosition(id));
      });
    const a = await sample();
    await page.waitForTimeout(700);
    expect(await sample()).toEqual(a);
  }
});
