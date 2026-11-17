import { expect, SAMPLE_ZIP, test } from './helpers';

test.describe('constellation timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#v=timeline');
    await page.getByTestId('zip-input').setInputFiles(SAMPLE_ZIP);
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-layout', 'settled');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '39');
  });

  test('the playhead slider reveals notes over time (keyboard accessible)', async ({ page }) => {
    const slider = page.getByTestId('timeline-slider');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '0');
    for (let i = 0; i < 5; i++) await page.keyboard.press('PageUp'); // 10% per press
    const mid = Number(await page.getByTestId('view-host').getAttribute('data-visible-nodes'));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(39);
    await page.keyboard.press('End');
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '39');
  });

  test('play animates the timeline and stops at the end', async ({ page }) => {
    await page.getByTestId('timeline-field').selectOption('created');
    await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('32');
    await page.getByTestId('timeline-play').click();
    await expect(page.getByTestId('timeline-play')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => Number(await page.getByTestId('view-host').getAttribute('data-visible-nodes')))
      .toBeLessThan(39);
    await expect(page.getByTestId('timeline-play')).toHaveAttribute('aria-pressed', 'false', {
      timeout: 10_000,
    });
    await expect(page.getByTestId('view-host')).toHaveAttribute('data-visible-nodes', '39');
  });

  test('brushing the scrubber sets the date lens', async ({ page }) => {
    const track = page.locator('.scrubber__track');
    const box = await track.boundingBox();
    if (!box) throw new Error('no track');
    await page.mouse.move(box.x + box.width * 0.05, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('lens-chips')).toContainText('created');
    const n = Number(await page.getByTestId('stat-notes').getAttribute('data-value'));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(39);
    await expect(page).toHaveURL(/d=created&from=\d{4}-\d{2}-\d{2}&to=/);
  });
});
