import type { ThemePalette } from './palettes';

/** 32-bit FNV-1a hash. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/**
 * Deterministic tag → color for a theme. Hue comes from the top-level tag (so nested tags share their
 * parent's hue); saturation varies a little by hash; lightness shifts by nesting depth.
 */
export function tagColor(tag: string, theme: ThemePalette): string {
  const parts = tag.split('/');
  const root = parts[0] ?? tag;
  const depth = parts.length - 1;
  const h = fnv1a(root);
  const hue = ((h % 360) + theme.hueRotation) % 360;
  const [s0, s1] = theme.satRange;
  const [l0, l1] = theme.lightRange;
  const sat = s0 + (((h >>> 9) % 1000) / 1000) * (s1 - s0);
  const baseL = l0 + (((h >>> 19) % 1000) / 1000) * (l1 - l0) * 0.5;
  const step = theme.dark ? 6 : -6;
  const light = Math.max(l0 - 10, Math.min(l1 + 10, baseL + depth * step));
  return hslToHex(hue, sat, light);
}

/** Folder colors use the same scheme with a prefix so they differ from a tag of the same name. */
export function folderColor(folder: string, theme: ThemePalette): string {
  return tagColor(`folder:${folder.split('/')[0] ?? ''}`, theme);
}

export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}
