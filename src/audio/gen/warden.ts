// The warden's voice (vanilla sounds.json entity.warden.*): something vast and blind in the dark, a slow rattling
// throat far below a man's, with bone clicking in it, heard as if down a long cave. For now its answers to a
// shrieker's warnings (vanilla SculkShriekerBlockEntity.SOUND_BY_LEVEL): nearby_close from far off, nearby_closer
// nearer, nearby_closest right there, and listening_angry, the fourth warning's, when it's coming. The warden itself
// (M4) adds the rest here.

import type { SoundGen } from '../synth';
import { alloc, addOsc, envPts, layer, lowpass, reverb } from './dsp';
import { type Ctx, sound } from './registry';
import { sweep, ticks } from './texture';
import { voice } from './voice';

/**
 * the warden's growl at `t`, `d` seconds long: a huge, rough, period-doubled throat through dark formants; `f0` its
 * pitch over the growl (0..1), `open` how far its jaw opens (brighter, hungrier)
 */
function growl(b: Float32Array, c: Ctx, t: number, d: number, f0: (u: number) => number, open: number, gain = 1): void {
  const { sr, rng } = c;
  voice(b, sr, rng, {
    t,
    dur: d,
    f0: (x) => f0(x / d),
    amp: (x) => envPts(x / d, [0, 0, 0.16, 0.85, 0.45, 1, 0.78, 0.65, 1, 0]),
    formants: [
      { f: (x) => 240 + 150 * open * Math.sin((Math.PI * x) / d), bw: 110, g: 1 },
      { f: 600 + 260 * open, bw: 160, g: 0.55 },
      { f: 1450 + 450 * open, bw: 260, g: 0.22 * (0.5 + open) },
      { f: 2700, bw: 520, g: 0.05 * open },
    ],
    jitter: 0.08,
    shimmer: 0.3,
    rough: 0.7,
    sub: 0.25,
    breath: 0.4,
    oq: 0.45,
    growl: [rng.range(13, 21), 0.55],
    gain,
  });
}

/** the bone in its throat: slow, dry clicks rattling through the growl */
function rattle(b: Float32Array, c: Ctx, t: number, d: number, rate: number): void {
  ticks(b, c.sr, c.rng, { t, dur: d, rate, energy: (x) => envPts(x / d, [0, 0.3, 0.3, 1, 0.8, 0.8, 1, 0]), f: [520, 1400], t60: [0.01, 0.035], click: 0.6, heavy: 0.5 });
}

/** a rumble under it all, felt more than heard */
function rumble(b: Float32Array, c: Ctx, t: number, d: number, f: number): void {
  addOsc(b, c.sr, t, d, (x) => f * (1 + 0.04 * Math.sin(x * 9)), (x) => envPts(x / d, [0, 0, 0.3, 1, 0.8, 0.8, 1, 0]));
}

/**
 * vanilla entity.warden.nearby_close / nearby_closer / nearby_closest: its answer to a warning, from far off (muffled,
 * mostly the cave's echo) to right there (the whole throat, and the rattle in it); `near` 0, 1 or 2
 */
function nearby(c: Ctx, near: number): Float32Array {
  const { sr, rng } = c;
  const d = [2.1, 1.9, 1.7][near] * rng.range(0.9, 1.1);
  const out = alloc(d + 0.2, sr);
  const base = rng.range(38, 50) * (1 + near * 0.08);
  const peak = rng.range(1.35, 1.7);
  // (a breath drawn in, then the long growl out, sagging at its end)
  layer(out, 0.35 + near * 0.1, (b) => sweep(b, sr, rng, { dur: 0.5, f: (x) => 500 + 900 * x, q: 1.4, amp: (x) => envPts(x, [0, 0, 0.35, 1, 0.5, 0]), color: 'pink' }));
  layer(out, 1, (b) => growl(b, c, 0.25, d - 0.25, (u) => base * envPts(u, [0, 0.85, 0.3, peak, 0.7, peak * 0.9, 1, 0.7]), 0.25 + near * 0.35));
  layer(out, 0.4 + near * 0.2, (b) => rumble(b, c, 0.2, d - 0.2, base * 0.75));
  if (near > 0) layer(out, 0.25 * near, (b) => rattle(b, c, 0.4, d - 0.6, 10 + near * 6));
  // (from further off the high end is lost to the rock between)
  const heard = lowpass(out, [700, 1400, 3200][near], sr);
  return reverb(heard, sr, { t60: [3.2, 2.6, 2.0][near], wet: [0.9, 0.65, 0.45][near], pre: 0.04, lowcut: 90, size: 1.6 });
}

/** vanilla entity.warden.listening_angry: it has heard, and it's angry: a snarling inhale, the rattle quickening */
function listeningAngry(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.3, 1.6);
  const out = alloc(d + 0.2, sr);
  const base = rng.range(52, 62);
  layer(out, 0.5, (b) => sweep(b, sr, rng, { dur: d * 0.6, f: (x) => 400 + 1600 * (x / (d * 0.6)), q: 2, amp: (x) => envPts(x / (d * 0.6), [0, 0, 0.5, 1, 1, 0.2]), color: 'pink' }));
  layer(out, 1, (b) => growl(b, c, 0.1, d - 0.1, (u) => base * envPts(u, [0, 0.9, 0.4, 1.5, 0.8, 1.9, 1, 1.4]), 0.9));
  layer(out, 0.55, (b) => rattle(b, c, 0.05, d, 26));
  layer(out, 0.45, (b) => rumble(b, c, 0, d, base * 0.7));
  return reverb(out, sr, { t60: 1.8, wet: 0.4, pre: 0.02, lowcut: 90, size: 1.4 });
}

export function wardenSounds(): Record<string, SoundGen> {
  return {
    'entity.warden.nearby_close': sound('entity.warden.nearby_close', 4, (c) => nearby(c, 0)),
    'entity.warden.nearby_closer': sound('entity.warden.nearby_closer', 3, (c) => nearby(c, 1)),
    'entity.warden.nearby_closest': sound('entity.warden.nearby_closest', 3, (c) => nearby(c, 2)),
    'entity.warden.listening_angry': sound('entity.warden.listening_angry', 4, listeningAngry),
  };
}
