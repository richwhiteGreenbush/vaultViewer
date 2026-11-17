import { expect, SAMPLE_ZIP, test } from './helpers';

test.describe('heat-map calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#v=calendar');
    await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
    await expect(page.getByTestId('calendar-svg')).toBeVisible();
  });

  test('clicking a day lists its notes in the preview; clicking one focuses it', async ({ page }) => {
    await page.locator('rect[data-date="2025-03-14"]').click();
    await expect(page.getByTestId('preview-list-title')).toHaveText('2025-03-14');
    await page.getByTestId('note-list').getByRole('button', { name: 'Running' }).click();
    await expect(page.getByTestId('preview-title')).toHaveText('Running');
    // the focused note's day is outlined
    await expect(page.locator('rect[data-date="2025-03-14"]')).toHaveAttribute('stroke', /.+/);
  });

  test('days are a keyboard grid: arrows move, Enter opens', async ({ page }) => {
    const first = page.locator('rect[tabindex="0"]');
    await expect(first).toHaveCount(1);
    await first.focus();
    const start = await first.getAttribute('data-date');
    await page.keyboard.press('ArrowDown');
    const moved = await page.evaluate(() => document.activeElement?.getAttribute('data-date'));
    expect(moved).not.toBe(start);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('preview-list-title')).toHaveText(moved ?? '');
  });

  test('lenses and the date field change the counts', async ({ page }) => {
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '39');
    await page.goto('./#v=calendar&f=journal');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '14');
    await expect(page.locator('rect[data-date="2025-03-02"][data-count="1"]')).toHaveCount(1);
    // By 'updated' (file times, all recent) the 2025 entries move out of 2025.
    await page.getByTestId('calendar-field').selectOption('updated');
    await expect(page.locator('rect[data-date="2025-03-02"][data-count="1"]')).toHaveCount(0);
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '14');
  });
});
