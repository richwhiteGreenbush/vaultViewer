import { create } from 'zustand';
import {
  applyLenses,
  defaultLens,
  isLensActive,
  type LensState,
  type VisibleSets,
} from '../core/lens/applyLenses';
import { hashToLens, lensToHash } from '../core/lens/urlState';
import type { VaultGraph } from '../core/model';

interface LensStore {
  lens: LensState;
  setLens(update: (draft: LensState) => void): void;
  replaceLens(lens: LensState): void;
  reset(): void;
}

const clone = (l: LensState): LensState => structuredClone(l);

export const useLensStore = create<LensStore>((set, get) => ({
  lens: hashToLens(typeof location === 'undefined' ? '' : location.hash).lens,
  setLens(update) {
    const next = clone(get().lens);
    update(next);
    set({ lens: next });
  },
  replaceLens: (lens) => set({ lens }),
  reset: () => set({ lens: defaultLens() }),
}));

const unfiltered = new WeakMap<VaultGraph, VisibleSets>();
let cache: { graph: VaultGraph; lens: LensState; result: VisibleSets } | null = null;
/** Memoized applyLenses: every consumer of the same graph + lens shares one result. */
export function visibleFor(graph: VaultGraph, lens: LensState): VisibleSets {
  if (cache?.graph !== graph || cache.lens !== lens) {
    let result: VisibleSets;
    if (isLensActive(lens)) {
      result = applyLenses(graph, lens);
    } else {
      // "Everything visible" is the common case (clearing a lens): compute it once per graph.
      result = unfiltered.get(graph) ?? applyLenses(graph, lens);
      unfiltered.set(graph, result);
    }
    cache = { graph, lens, result };
  }
  return cache.result;
}

/** Keeps the URL hash and the lens (plus focused note) in sync, both ways. */
export function syncLensWithUrl(
  getExtra: () => Record<string, string>,
  onExtra: (e: Record<string, string>) => void,
): () => void {
  const write = () => {
    const hash = lensToHash(useLensStore.getState().lens, getExtra());
    if (hash !== location.hash && !(hash === '' && location.hash === '')) {
      history.replaceState(null, '', hash || `${location.pathname}${location.search}`);
    }
  };
  const read = () => {
    const { lens, extra } = hashToLens(location.hash);
    if (lensToHash(lens) !== lensToHash(useLensStore.getState().lens))
      useLensStore.getState().replaceLens(lens);
    onExtra(extra);
  };
  const unsub = useLensStore.subscribe(write);
  window.addEventListener('hashchange', read);
  window.addEventListener('vault-lens:focus', write);
  onExtra(hashToLens(location.hash).extra);
  return () => {
    unsub();
    window.removeEventListener('hashchange', read);
    window.removeEventListener('vault-lens:focus', write);
  };
}
