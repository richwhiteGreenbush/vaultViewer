import type { ThemePalette } from '../core/color/palettes';

/** Paints the theme background (views draw on a transparent canvas over a CSS background). Pixi-free. */
export function paintBackground(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: ThemePalette,
): void {
  const grad = g.createLinearGradient(0, 0, w * 0.35, h);
  grad.addColorStop(0, theme.background);
  grad.addColorStop(1, theme.backgroundEnd);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}
