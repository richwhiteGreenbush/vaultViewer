import { Texture } from 'pixi.js';

/** Radial gradient disc drawn on a 2D canvas: works with both the WebGL and Canvas renderers. */
export function radialTexture(size: number, stops: [number, string][]): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return Texture.WHITE;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, color] of stops) grad.addColorStop(o, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** Horizontal fade (transparent → white) used for comet tails; the bright end is on the right. */
export function tailTexture(w = 128, h = 16): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return Texture.WHITE;
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, 0);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  return Texture.from(c);
}

/** Darkens (amount < 0) or lightens a #rrggbb color; returns a Pixi color number. */
export function shade(hex: string, amount: number): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
}
