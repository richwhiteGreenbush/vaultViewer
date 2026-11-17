import type { ViewInstance } from './types';

/** The mounted view, so app-level actions (export, poster) can reach it. */
let active: ViewInstance | null = null;
export const setActiveViewInstance = (v: ViewInstance | null): void => {
  active = v;
};
export const activeViewInstance = (): ViewInstance | null => active;
