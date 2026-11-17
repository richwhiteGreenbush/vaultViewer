import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, expectFixtureStats, SAMPLE_ZIP, test, waitForSettledGraph } from './helpers';

async function loadSample(page: Page, hash = '') {
  await page.goto(`./${hash}`);
  await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
  await waitForSettledGraph(page);
}

const screenPos = (page: Page, id: string) =>
  page.evaluate(
    (id) =>
      (window as unknown as { __vaultLensView: { screenPosition(id: string): { x: number; y: number } | null } }).__vaultLensView.screenPosition(id),
    id,
  );

async function clickNode(page: Page, id: string, modifiers: ('Shift')[] = []) {
  // Comets move, so read the position right before clicking.
  const p = await screenPos(page, id);
  if (!p) throw new Error(`no node ${id}`);
  await page.mouse.move(p.x, p.y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.down();
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

const preview = (page: Page) => page.getByTestId('preview-title');
const notesStat = (page: Page) => page.getByTestId('stat-notes');

test.describe('focus and preview', () => {
  test('clicking a node focuses it and the preview shows its title @cross', async ({ page }) => {
    await loadSample(page);
    await clickNode(page, 'projects/alpha/plan');
    await expect(preview(page)).toHaveText('Alpha Plan');
    await expect(page.getByTestId('preview-body')).toContainText('Milestones');
    await expect(page.getByTestId('outgoing')).toContainText('Specs');
    await expect(page.getByTestId('backlinks')).toContainText('Welcome to the Sample Vault');
    // 1-hop neighbourhood: plan + meeting, specs, retro, beta overview, welcome, 2025-05-18
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-focus-size', '7');
    await expect(page).toHaveURL(/#n=projects%2Falpha%2Fplan/);
  });

  test('shift+click expands focus to two hops; Esc clears it', async ({ page }) => {
    await loadSample(page);
    await clickNode(page, 'areas/health/sleep');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-focus-size', '3');
    await page.waitForTimeout(600); // let the camera finish easing to the focused node
    await clickNode(page, 'areas/health/sleep', ['Shift']);
    await expect.poll(async () => Number(await page.getByTestId('view-host').getAttribute('data-focus-size'))).toBeGreaterThan(3);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-focus-size', '0');
  });

  test('clicking a wikilink in the preview moves focus', async ({ page }) => {
    await loadSample(page);
    await clickNode(page, 'projects/alpha/plan');
    await expect(preview(page)).toHaveText('Alpha Plan');
    await page.getByTestId('preview-body').getByRole('button', { name: 'last retro' }).click();
    await expect(preview(page)).toHaveText('Retro');
    await expect(page).toHaveURL(/#n=projects%2Falpha%2Fretro/);
    // Ghost links open the missing-note page; attachments are not links.
    await page.getByTestId('preview-body').getByRole('button', { name: 'Lessons Learned' }).click();
    await expect(preview(page)).toHaveText('lessons learned');
  });

  test('search: "/" focuses the box, Enter focuses the top result', async ({ page }) => {
    await loadSample(page);
    await page.keyboard.press('/');
    await expect(page.locator('#search-input')).toBeFocused();
    await page.keyboard.type('lentl');
    await expect(page.getByRole('option').first()).toContainText('Lentil Soup');
    await page.keyboard.press('Enter');
    await expect(preview(page)).toHaveText('Lentil Soup');
    // aliases are searchable too
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Alpha Roadmap');
    await page.keyboard.press('Enter');
    await expect(preview(page)).toHaveText('Alpha Plan');
  });
});

test.describe('keyboard', () => {
  test('Tab reaches the canvas, arrows move between neighbours, Enter opens the preview', async ({ page }) => {
    await loadSample(page);
    let onCanvas = false;
    for (let i = 0; i < 40 && !onCanvas; i++) {
      await page.keyboard.press('Tab');
      onCanvas = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'graph-canvas');
    }
    expect(onCanvas).toBe(true);
    const announcer = page.getByTestId('focus-announcer');
    await page.keyboard.press('ArrowRight');
    await expect(announcer).not.toHaveText('');
    const first = await announcer.textContent();
    // Walk until focus moves to a neighbour (some directions may have no neighbour).
    let moved = false;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      if ((await announcer.textContent()) !== first) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('preview-panel')).toBeVisible();
    const title = (await announcer.textContent())?.split(',')[0] ?? '';
    await expect(preview(page)).toHaveText(title);
  });
});

test.describe('lenses', () => {
  test('a tag lens drops the note count; chips remove it in one click @cross', async ({ page }) => {
    await loadSample(page);
    await page.getByRole('button', { name: 'Toggle lens panel' }).click();
    await page.getByTestId('lens-panel').getByRole('button', { name: 'Include #project', exact: true }).click();
    await expect(notesStat(page)).toHaveAttribute('data-value', '7');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', String(7 + 3)); // + ghosts linked from them
    const chips = page.getByTestId('lens-chips');
    await expect(chips).toContainText('#project');
    await page.getByTestId('lens-panel').getByRole('button', { name: 'Exclude #journal' }).click();
    await page.getByRole('button', { name: 'Remove lens #project' }).click();
    await expect(notesStat(page)).toHaveAttribute('data-value', '26');
    await page.getByRole('button', { name: 'Remove lens −#journal' }).click();
    await expectFixtureStats(page);
  });

  test('the URL hash restores the same lens after reload', async ({ page }) => {
    await loadSample(page);
    await page.getByRole('button', { name: 'Toggle lens panel' }).click();
    await page.getByTestId('lens-panel').getByRole('button', { name: 'Include journal', exact: true }).click();
    await page.getByLabel('Orphans (no links)').uncheck();
    await expect(notesStat(page)).toHaveAttribute('data-value', '14');
    await expect(page).toHaveURL(/#f=journal&o=0/);
    await page.reload();
    await waitForSettledGraph(page);
    await expect(notesStat(page)).toHaveAttribute('data-value', '14');
    await expect(page.getByTestId('lens-chips')).toContainText('no orphans');
  });

  test('a bookmarked URL applies its lens on first load', async ({ page }) => {
    await loadSample(page, '#t=project,planning&tm=all');
    await expect(notesStat(page)).toHaveAttribute('data-value', '1');
  });
});

test.describe('themes', () => {
  test('switching theme changes the background and persists across reloads', async ({ page }) => {
    await loadSample(page);
    const bg = () => page.locator('.app').evaluate((el) => getComputedStyle(el).backgroundColor);
    const before = await bg();
    await page.getByTestId('theme-select').selectOption('pastel');
    await expect.poll(bg).not.toBe(before);
    expect(await bg()).toBe('rgb(251, 247, 255)');
    await page.reload();
    await waitForSettledGraph(page);
    await expect(page.getByTestId('theme-select')).toHaveValue('pastel');
    expect(await bg()).toBe('rgb(251, 247, 255)');
  });

  test('tag colours are identical across reloads', async ({ page }) => {
    await loadSample(page);
    await clickNode(page, 'projects/alpha/plan');
    const dot = () => page.getByTestId('tag-dot-project/alpha').evaluate((el) => getComputedStyle(el).backgroundColor);
    const before = await dot();
    await page.reload();
    await waitForSettledGraph(page);
    await expect(preview(page)).toHaveText('Alpha Plan'); // focus restored from #n=
    expect(await dot()).toBe(before);
  });

  for (const theme of ['darkSpace', 'neon', 'watercolor', 'pastel']) {
    test(`no WCAG 2.1 AA violations (axe) in the ${theme} theme`, async ({ page }) => {
      await loadSample(page);
      await page.getByTestId('theme-select').selectOption(theme);
      await page.getByRole('button', { name: 'Toggle lens panel' }).click();
      await clickNode(page, 'projects/alpha/plan');
      await expect(page.getByTestId('preview-body')).toContainText('Milestones');
      await page.getByTestId('lens-panel').getByRole('button', { name: 'Include #project', exact: true }).click();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' | ')}`);
      expect(summary).toEqual([]);
    });
  }
});

test.describe('motion', () => {
  test('orphans drift as comets; reduced motion stops them', async ({ page }) => {
    await loadSample(page);
    const a = await screenPos(page, 'empty');
    await page.waitForTimeout(600);
    const b = await screenPos(page, 'empty');
    expect(a && b && Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.2);
  });

  test('reduced motion: comets hold still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadSample(page);
    const a = await screenPos(page, 'empty');
    await page.waitForTimeout(600);
    const b = await screenPos(page, 'empty');
    expect(a).toEqual(b);
  });
});
