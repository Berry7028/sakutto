export type ComputeTier = 'g' | 'c8' | 'c4';

export type BackendKind = 'webgpu' | 'cpu-wasm';

export const CONTEXT_TOKENS = 2048;

export const WEBGPU_ALL_LAYERS = 99999;

/**
 * Two sequences on WebGPU.
 *
 * Two slots were dropped once because a pair of paragraphs seemed to take 9–14 s that it
 * finished one after the other in under 3 s. Re-measured on the pinned wasm and this model,
 * the second sequence is not what cost that: the damage was wllama's `kv_unified: true`
 * default, one KV cache shared by every sequence.
 *
 * Medians of 6 interleaved rounds (RTX 4070 Ti SUPER, 8 threads), a pair of paragraphs and
 * then one more request — the request a page sends straight afterwards:
 *
 *   1 slot, one after the other      pair 1299 ms   next request  661 ms
 *   2 slots, shared KV cache         pair  844 ms   next request 4222 ms
 *   2 slots, a cache per sequence    pair  909 ms   next request  650 ms
 *
 * A page keeps two requests in flight (`TRANSLATION_CONCURRENCY`), so the pair is not a burst
 * before an idle model — it is the steady state. Run that way over 12 paragraphs, the shared
 * cache never settles: 36.2 s against 8.1 s on one slot and 6.3 s with a cache per sequence
 * and continuous batching, and eight of its twelve requests land between 5 s and 17.6 s
 * where the other two arms stay near 0.5–1.5 s. With a cache per sequence the pair stays
 * ahead of one-at-a-time and nothing after it pays. `runtime.ts` therefore turns
 * `kv_unified` off whenever `nParallel` is above one.
 */
const WEBGPU_SLOTS = 2;
// llama.cpp divides n_ctx across parallel slots, so the GPU tier sizes it for two.
const WEBGPU_CONTEXT_TOKENS = CONTEXT_TOKENS * WEBGPU_SLOTS;

export interface BackendProbe {
  webgpu: boolean;
  hardwareConcurrency: number;
}

export interface BackendSelection {
  tier: ComputeTier;
  backend: BackendKind;
  nGpuLayers: number;
  nThreads: number;
  nParallel: number;
  nCtx: number;
}

function clampThreads(requested: number, hardwareConcurrency: number): number {
  const cores = Number.isFinite(hardwareConcurrency) ? Math.floor(hardwareConcurrency) : 4;
  return Math.max(1, Math.min(requested, Math.max(1, cores)));
}

/**
 * Every CPU tier keeps one sequence, so the paragraph on screen gets the whole model instead
 * of sharing each decode step with the next one. WebGPU takes two, which only pays off with a
 * per-sequence KV cache; see `WEBGPU_SLOTS`.
 */
export function selectBackend(probe: BackendProbe): BackendSelection {
  if (probe.webgpu) {
    return {
      tier: 'g',
      backend: 'webgpu',
      nGpuLayers: WEBGPU_ALL_LAYERS,
      nThreads: clampThreads(8, probe.hardwareConcurrency),
      nParallel: WEBGPU_SLOTS,
      nCtx: WEBGPU_CONTEXT_TOKENS,
    };
  }

  if (probe.hardwareConcurrency >= 8) {
    return {
      tier: 'c8',
      backend: 'cpu-wasm',
      nGpuLayers: 0,
      nThreads: clampThreads(8, probe.hardwareConcurrency),
      nParallel: 1,
      nCtx: CONTEXT_TOKENS,
    };
  }

  return {
    tier: 'c4',
    backend: 'cpu-wasm',
    nGpuLayers: 0,
    nThreads: clampThreads(4, probe.hardwareConcurrency),
    nParallel: 1,
    nCtx: CONTEXT_TOKENS,
  };
}

export type TierPreference = 'auto' | ComputeTier;

/** Resolves the settings choice. `auto` keeps the probe; the others force that tier. */
export function selectionForTier(
  preference: TierPreference,
  probe: BackendProbe,
): BackendSelection {
  if (preference === 'auto') return selectBackend(probe);
  if (preference === 'g') {
    return selectBackend({ webgpu: true, hardwareConcurrency: probe.hardwareConcurrency });
  }
  if (preference === 'c8') {
    return {
      tier: 'c8',
      backend: 'cpu-wasm',
      nGpuLayers: 0,
      nThreads: clampThreads(8, probe.hardwareConcurrency),
      nParallel: 1,
      nCtx: CONTEXT_TOKENS,
    };
  }

  return {
    tier: 'c4',
    backend: 'cpu-wasm',
    nGpuLayers: 0,
    nThreads: clampThreads(4, probe.hardwareConcurrency),
    nParallel: 1,
    nCtx: CONTEXT_TOKENS,
  };
}

export function cpuFallback(selection: BackendSelection): BackendSelection | null {
  if (selection.backend === 'cpu-wasm') return null;
  return selectBackend({
    webgpu: false,
    hardwareConcurrency: selection.nThreads,
  });
}
