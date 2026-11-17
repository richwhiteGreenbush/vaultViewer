/** 2D camera: screen = world * scale + offset. Pure math, shared by Pixi views. */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 8;

export const toWorld = (c: Camera, sx: number, sy: number) => ({
  x: (sx - c.x) / c.scale,
  y: (sy - c.y) / c.scale,
});

/** Zooms by `factor` keeping the screen point (sx, sy) fixed. */
export function zoomAt(c: Camera, sx: number, sy: number, factor: number): Camera {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale * factor));
  const k = scale / c.scale;
  return { scale, x: sx - (sx - c.x) * k, y: sy - (sy - c.y) * k };
}

/** Camera that fits the bounding box of points (flat x,y pairs) into a w×h viewport. */
export function fitBounds(
  points: Float32Array,
  radius: (i: number) => number,
  w: number,
  h: number,
  pad = 40,
): Camera {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < points.length / 2; i++) {
    const x = points[i * 2] as number;
    const y = points[i * 2 + 1] as number;
    const r = radius(i);
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  }
  if (!Number.isFinite(x0)) return { x: w / 2, y: h / 2, scale: 1 };
  const scale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, Math.min((w - pad * 2) / (x1 - x0 || 1), (h - pad * 2) / (y1 - y0 || 1), 2.5)),
  );
  return { scale, x: w / 2 - ((x0 + x1) / 2) * scale, y: h / 2 - ((y0 + y1) / 2) * scale };
}
