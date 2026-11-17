import { fnv1a } from '../color/tagColor';

/** mulberry32: small, fast, deterministic PRNG returning [0, 1). */
export function seededRandom(seed: number | string): () => number {
  let s = (typeof seed === 'string' ? fnv1a(seed) : seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 0..1 value for a string. */
export const unitHash = (s: string): number => fnv1a(s) / 4294967296;
