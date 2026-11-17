import { registerSW } from 'virtual:pwa-register';

/** Registers the Workbox service worker (auto-update). No-op in dev. */
export function registerPwa(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  registerSW({ immediate: true });
}
