/** Theme palettes (PLAN §8). Pure data so workers and core can use them. */
export type ThemeId = 'darkSpace' | 'neon' | 'watercolor' | 'pastel';

export interface ThemePalette {
  id: ThemeId;
  label: string;
  dark: boolean;
  background: string;
  backgroundEnd: string;
  surface: string;
  text: string;
  mutedText: string;
  accent: string;
  edge: string;
  edgeAlpha: number;
  edgeHighlight: string;
  ghost: string;
  glowStrength: number;
  blendMode: 'normal' | 'add' | 'multiply';
  hueRotation: number;
  satRange: [number, number];
  lightRange: [number, number];
  sequential: string[]; // calendar scale, low → high
}

export const palettes: Record<ThemeId, ThemePalette> = {
  darkSpace: {
    id: 'darkSpace',
    label: 'Dark Space',
    dark: true,
    background: '#050816',
    backgroundEnd: '#0d1b3d',
    surface: '#121c3c',
    text: '#e8ecff',
    mutedText: '#a9b3d6',
    accent: '#7aa2ff',
    edge: '#ffffff',
    edgeAlpha: 0.15,
    edgeHighlight: '#ffd27a',
    ghost: '#6b7499',
    glowStrength: 0.6,
    blendMode: 'add',
    hueRotation: 0,
    satRange: [62, 78],
    lightRange: [58, 72],
    sequential: ['#121c3c', '#1f3a7a', '#3866c4', '#7aa2ff', '#c6d6ff'],
  },
  neon: {
    id: 'neon',
    label: 'Neon',
    dark: true,
    background: '#07070d',
    backgroundEnd: '#120a1f',
    surface: '#15121f',
    text: '#f5f0ff',
    mutedText: '#b7a9d6',
    accent: '#00f0ff',
    edge: '#00e5ff',
    edgeAlpha: 0.25,
    edgeHighlight: '#ff2bd6',
    ghost: '#5a5470',
    glowStrength: 1,
    blendMode: 'add',
    hueRotation: 300,
    satRange: [86, 96],
    lightRange: [55, 64],
    sequential: ['#15121f', '#3d0b5c', '#8a00b8', '#ff2bd6', '#ffd0f5'],
  },
  watercolor: {
    id: 'watercolor',
    label: 'Watercolor',
    dark: false,
    background: '#f6f1e7',
    backgroundEnd: '#efe6d4',
    surface: '#fbf8f1',
    text: '#2e2b26',
    mutedText: '#5f5a50',
    accent: '#2f6f8f',
    edge: '#3b3a36',
    edgeAlpha: 0.3,
    edgeHighlight: '#b5452f',
    ghost: '#9d968a',
    glowStrength: 0,
    blendMode: 'multiply',
    hueRotation: 20,
    satRange: [40, 50],
    lightRange: [55, 65],
    sequential: ['#efe6d4', '#cfe0d8', '#8fbcb0', '#4f8f8a', '#2f5f6f'],
  },
  pastel: {
    id: 'pastel',
    label: 'Pastel',
    dark: false,
    background: '#fbf7ff',
    backgroundEnd: '#f3ecff',
    surface: '#ffffff',
    text: '#2d2540',
    mutedText: '#5c5273',
    accent: '#7a5cc4',
    edge: '#b8a9d9',
    edgeAlpha: 0.7,
    edgeHighlight: '#7a5cc4',
    ghost: '#c9c1dc',
    glowStrength: 0,
    blendMode: 'normal',
    hueRotation: 0,
    satRange: [50, 60],
    lightRange: [76, 84],
    sequential: ['#f3ecff', '#dccff7', '#bba6ec', '#9479d8', '#6c4fb8'],
  },
};

export const DEFAULT_THEME: ThemeId = 'darkSpace';
