import { useSettingsStore } from './settingsStore';
import { useVaultStore } from './vaultStore';

const POLL_MS = 5_000; // plan: poll every 5 s when no observer is available
const SAFETY_POLL_MS = 15_000; // with an observer, still poll occasionally in case events are missed

/**
 * Watches the opened folder (Chromium, "Watch" setting on): FileSystemObserver where available, polling
 * otherwise. Every trigger runs a background refresh, which only re-parses changed files and leaves the
 * graph untouched when nothing changed.
 */
export function initWatcher(): () => void {
  let currentKey: string | null = null;
  let stop: (() => void) | null = null;

  const evaluate = () => {
    const { prefs } = useSettingsStore.getState();
    const { info, lastVault, needsReconnect } = useVaultStore.getState();
    const handle = lastVault?.handle;
    const key = prefs.watch && info?.kind === 'handle' && handle && !needsReconnect ? info.key : null;
    if (key === currentKey) return;
    stop?.();
    stop = null;
    currentKey = key;
    if (key && handle) stop = watch(handle);
  };

  const unsubs = [useSettingsStore.subscribe(evaluate), useVaultStore.subscribe(evaluate)];
  evaluate();
  return () => {
    unsubs.forEach((u) => u());
    stop?.();
  };
}

function watch(handle: FileSystemDirectoryHandle): () => void {
  const refresh = () => void useVaultStore.getState().refresh();
  const Observer = (globalThis as unknown as { FileSystemObserver?: FileSystemObserverConstructor })
    .FileSystemObserver;
  let observer: FileSystemObserverInstance | null = null;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let poll = setInterval(refresh, Observer ? SAFETY_POLL_MS : POLL_MS);
  if (Observer) {
    try {
      observer = new Observer(() => {
        clearTimeout(debounce);
        debounce = setTimeout(refresh, 400);
      });
      observer.observe(handle, { recursive: true }).catch(() => {
        // Observation not allowed here: fall back to the regular poll.
        clearInterval(poll);
        poll = setInterval(refresh, POLL_MS);
      });
    } catch {
      clearInterval(poll);
      poll = setInterval(refresh, POLL_MS);
    }
  }
  return () => {
    clearInterval(poll);
    clearTimeout(debounce);
    observer?.disconnect();
  };
}
