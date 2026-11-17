import { Rectangle, type Application } from 'pixi.js';
import type { ThemePalette } from '../../core/color/palettes';
import { paintBackground } from '../../export/background';

/** PNG of exactly the visible part of a Pixi view (what is on screen), at 2x, on the theme background. */
export async function captureScreen(app: Application, theme: ThemePalette): Promise<Blob> {
  const { width, height } = app.screen;
  const frame = new Rectangle(0, 0, width, height);
  const src = app.renderer.extract.canvas({ target: app.stage, frame, resolution: 2 }) as HTMLCanvasElement;
  const out = document.createElement('canvas');
  out.width = Math.round(width * 2);
  out.height = Math.round(height * 2);
  const g = out.getContext('2d');
  if (!g) throw new Error('no 2d context');
  paintBackground(g, out.width, out.height, theme);
  g.drawImage(src, 0, 0, out.width, out.height);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), 'image/png'),
  );
}
