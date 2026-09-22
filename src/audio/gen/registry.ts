// Tiny helpers to declare deterministic, normalised sound generators.

import type { SoundGen } from '../synth';
import { type FinishOpts, Rng, finish, hashStr, mix32, resample } from './dsp';

export interface Ctx {
  sr: number;
  rng: Rng;
  /** variant index */
  v: number;
}
export type GenFn = (c: Ctx) => Float32Array;
export type SoundOpts = FinishOpts & { peak?: number };

/** Peak level for finished sound effects. */
export const FX_PEAK = 0.85;

/**
 * Declare a sound with `variants` distinct takes. Each take is seeded from (name, variant)
 * so generation is fully deterministic; the result is sanitised, DC-blocked, trimmed,
 * faded and peak-normalised.
 */
export function sound(name: string, variants: number, fn: GenFn, o: SoundOpts = {}): SoundGen {
  const seed = hashStr(name);
  return {
    variants,
    generate(variant: number, sampleRate: number): Float32Array {
      const v = ((Math.floor(variant) % variants) + variants) % variants;
      const rng = new Rng(seed ^ mix32(Math.imul(v + 1, 0x9e3779b1)));
      return finish(fn({ sr: sampleRate, rng, v }), sampleRate, o.peak ?? FX_PEAK, o);
    },
  };
}

/**
 * The takes of `base` played back at `rate` (vanilla plays e.g. the mining "hit" sound as the
 * step sample at pitch 0.5, which is what makes digging sound deep and thuddy).
 */
export function pitched(base: SoundGen, rate: number, o: SoundOpts = {}): SoundGen {
  return {
    variants: base.variants,
    generate(variant: number, sampleRate: number): Float32Array {
      return finish(resample(base.generate(variant, sampleRate), rate), sampleRate, o.peak ?? FX_PEAK, o);
    },
  };
}
