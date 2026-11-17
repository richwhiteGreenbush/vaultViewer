import type { LabelDensity } from '../../state/settingsStore';

/** Label level of detail: how far you must zoom in before labels appear, and how many at most. */
export function labelBudget(density: LabelDensity, baseZoom: number): { zoom: number; max: number } {
  if (density === 'low') return { zoom: baseZoom * 1.6, max: 60 };
  if (density === 'high') return { zoom: baseZoom * 0.55, max: 320 };
  return { zoom: baseZoom, max: 160 };
}

/** A clock for ambient animation that runs at a user-chosen speed (Settings → Animation speed). */
export class AnimClock {
  private t = performance.now();
  private last = performance.now();
  tick(speed: number): number {
    const now = performance.now();
    this.t += (now - this.last) * speed;
    this.last = now;
    return this.t;
  }
}
