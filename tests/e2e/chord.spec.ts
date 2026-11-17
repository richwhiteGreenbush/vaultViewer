import { expect, SAMPLE_ZIP, test } from './helpers';

test.describe('tag chord', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#v=chord');
    await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
    await expect(page.getByTestId('chord-svg')).toBeVisible();
  });

  test('hovering a ribbon shows the count and notes; clicking lists them, and a note opens', async ({
    page,
  }) => {
    const ribbon = page.locator('[data-pair="food|health"], [data-pair="health|food"]').first();
    // Ribbons are thin crescents: their bounding-box centre is often outside the shape, so dispatch directly.
    await ribbon.dispatchEvent('mousemove', { clientX: 200, clientY: 200 });
    await expect(page.locator('.view-tooltip')).toContainText('#food and #health: 1 note');
    await expect(page.locator('.view-tooltip')).toContainText('Nutrition');
    await ribbon.dispatchEvent('click');
    await expect(page.getByTestId('note-list')).toContainText('Nutrition');
    await page.getByTestId('note-list').getByRole('button', { name: 'Nutrition' }).click();
    await expect(page.getByTestId('preview-title')).toHaveText('Nutrition');
    await page.getByRole('button', { name: /Back to list/ }).click();
    await expect(page.getByTestId('note-list')).toBeVisible();
  });

  test('clicking an arc applies a tag lens and returns to the previous view', async ({ page }) => {
    await page.getByTestId('view-select').selectOption('galaxy');
    await page.getByTestId('view-select').selectOption('chord');
    await page.locator('path[data-tag="health"]').click();
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-view', 'galaxy');
    await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', '3');
  });

  test('arcs are keyboard operable and the slider changes how many tags are shown', async ({ page }) => {
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '24');
    await page.getByTestId('chord-topn').fill('8');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '8');
    const arc = page.locator('path[data-tag="journal"]');
    await arc.focus();
    await page.keyboard.press(' ');
    await expect(page.getByTestId('preview-list-title')).toHaveText('#journal');
    await arc.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-view', 'force');
    await expect(page.getByTestId('stat-notes')).toHaveAttribute('data-value', '13');
  });
});
