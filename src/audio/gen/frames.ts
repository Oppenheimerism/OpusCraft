// Item frames (vanilla entity.item_frame.*, and the glow frame's entity.glow_item_frame.*): the frame knocked onto a
// wall (place), an item set in it (add_item), turned a notch (rotate_item), knocked out (remove_item), and the frame
// coming apart (break) — a small wooden frame with a leather back. The glow frame's are the same with a soft, wet
// stickiness to them (its back is dyed with glow ink). Takes as in vanilla's sounds.json.

import type { SoundGen } from '../synth';
import { alloc, envBump, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, creak, impact, phisem, thump, ticks } from './texture';
import { reverbHalf } from './world';

/** the frame's light wooden body (a thin birch moulding: [f, amp, t60]) */
const FRAME = [410, 1, 0.07, 930, 0.7, 0.05, 1720, 0.45, 0.035, 2900, 0.22, 0.02];
/** its leather back: a dull, soft resonance */
const BACK = [180, 1, 0.05, 390, 0.4, 0.035];

const WOOD_BANDS = [
  { f: 900, q: 6, g: 1 },
  { f: 1800, q: 7, g: 0.6 },
  { f: 3200, q: 5, g: 0.3 },
];

/** the glow ink's stickiness: a couple of small wet pops and a squelch of noise */
function goo(b: Float32Array, c: Ctx, t: number, amt: number): void {
  const { sr, rng } = c;
  bubble(b, sr, t + rng.range(0, 0.01), rng.range(900, 1300), 0.8 * amt, 0.012, 0.6);
  bubble(b, sr, t + rng.range(0.02, 0.05), rng.range(1300, 1900), 0.5 * amt, 0.01, 0.7);
  burst(b, sr, rng, { t, dur: 0.07, attack: 0.006, tau: 0.02, bp: [1100, 1.4], amp: 0.35 * amt });
}

function tuned(modes: number[], k: number): number[] {
  return modes.map((v, i) => (i % 3 === 0 ? v * k : v));
}

/** the frame hung up: a dry knock of the moulding on the wall, the back's dull thud behind it */
function place(c: Ctx, glow: boolean): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.45, sr);
  const k = [1, 1.06, 0.95, 1.1][v % 4] * rng.range(0.97, 1.03);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: tuned(FRAME, k), jitter: 0.04, noise: 0.7, noiseTau: 0.003, noiseBp: [2200, 0.9] }));
  layer(out, 0.6, (b) => impact(b, sr, rng, { t: 0.004, modes: tuned(BACK, k), jitter: 0.03, noise: 0.3, noiseTau: 0.004, noiseBp: [600, 0.8] }));
  layer(out, 0.45, (b) => thump(b, sr, { f0: 140 * k, f1: 95 * k, glide: 0.02, tau: 0.03, h2: 0.25 }));
  if (glow) layer(out, 0.35, (b) => goo(b, c, 0.01, 1));
  return reverbHalf(out, sr, { t60: 0.3, hf: 0.5, wet: 0.12, dry: 1, tail: 0.15, pre: 0.006 });
}

/** an item set in: a soft bump against the back, a little rattle of the frame */
function addItem(c: Ctx, glow: boolean): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.4, sr);
  const k = [1, 1.08, 0.94, 1.03][v % 4] * rng.range(0.97, 1.03);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: tuned(BACK, k * 1.2), jitter: 0.04, noise: 0.6, noiseTau: 0.005, noiseBp: [800, 0.7] }));
  layer(out, 0.55, (b) => impact(b, sr, rng, { t: 0.012, modes: tuned(FRAME, k * 1.15), jitter: 0.05, noise: 0.4, noiseTau: 0.002, noiseBp: [2600, 1] }));
  layer(out, 0.25, (b) =>
    ticks(b, sr, rng, { t: 0.02, dur: 0.06, rate: 60, energy: (t) => envBump(t, 0.005, 0.04), f: [1800, 3200], t60: [0.01, 0.025], amp: 0.6 }),
  );
  if (glow) layer(out, 0.4, (b) => goo(b, c, 0, 1.1));
  return reverbHalf(out, sr, { t60: 0.3, hf: 0.5, wet: 0.1, dry: 1, tail: 0.12, pre: 0.005 });
}

/** knocked out: a quick, sharper pop off the back and a knock of the frame */
function removeItem(c: Ctx, glow: boolean): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.4, sr);
  const k = [1.05, 0.97, 1.12, 1][v % 4] * rng.range(0.97, 1.03);
  layer(out, 0.7, (b) => burst(b, sr, rng, { dur: 0.05, attack: 0.001, tau: 0.008, bp: [1500 * k, 1.1] }));
  layer(out, 1, (b) => impact(b, sr, rng, { t: 0.004, modes: tuned(FRAME, k * 1.1), jitter: 0.04, noise: 0.5, noiseTau: 0.002, noiseBp: [3000, 1] }));
  layer(out, 0.4, (b) => impact(b, sr, rng, { t: 0.002, modes: tuned(BACK, k * 1.4), jitter: 0.03, noise: 0.2, noiseTau: 0.003, noiseBp: [700, 0.8] }));
  if (glow) layer(out, 0.35, (b) => goo(b, c, 0.005, 0.9));
  return reverbHalf(out, sr, { t60: 0.28, hf: 0.5, wet: 0.1, dry: 1, tail: 0.12, pre: 0.005 });
}

/** turned a notch: a tiny click of something turning against the back, a brief squeak of wood */
function rotateItem(c: Ctx, glow: boolean): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.3, sr);
  const k = [1, 1.1, 0.93, 1.05][v % 4] * rng.range(0.97, 1.03);
  layer(out, 0.5, (b) =>
    creak(b, sr, rng, { dur: 0.05, rate: (t) => 260 * k + 900 * t, amp: (t) => envBump(t, 0.01, 0.035), jitter: 0.15, bands: WOOD_BANDS }),
  );
  layer(out, 1, (b) => impact(b, sr, rng, { t: 0.045, modes: tuned(FRAME, k * 1.3), jitter: 0.05, noise: 0.6, noiseTau: 0.0015, noiseBp: [3400, 1.2] }));
  if (glow) layer(out, 0.3, (b) => goo(b, c, 0.03, 0.7));
  return reverbHalf(out, sr, { t60: 0.25, hf: 0.5, wet: 0.08, dry: 1, tail: 0.1, pre: 0.004 });
}

/** the frame coming apart: a splintering crack of the moulding, bits of it clattering, the back flopping down */
function frameBreak(c: Ctx, glow: boolean): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.6, sr);
  const k = [1, 0.94, 1.07][v % 3] * rng.range(0.97, 1.03);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: tuned(FRAME, k * 0.9), jitter: 0.06, noise: 1, noiseTau: 0.006, noiseBp: [1800, 0.7] }));
  layer(out, 0.7, (b) =>
    phisem(b, sr, rng, {
      t: 0.005,
      dur: 0.22,
      rate: 420,
      energy: (t) => envBump(t, 0.004, 0.09),
      grain: 0.004,
      heavy: 2,
      bands: [
        { f: 1400, q: 5, g: 1, spread: 0.3 },
        { f: 2800, q: 6, g: 0.6, spread: 0.3 },
        { f: 5200, q: 4, g: 0.3 },
      ],
    }),
  );
  layer(out, 0.4, (b) =>
    ticks(b, sr, rng, { t: 0.06, dur: 0.3, rate: 30, energy: (t) => envBump(t, 0.02, 0.18), f: [700, 1900], t60: [0.02, 0.05], amp: 0.8 }),
  );
  layer(out, 0.4, (b) => thump(b, sr, { t: 0.02, f0: 120 * k, f1: 80 * k, glide: 0.03, tau: 0.04, h2: 0.2 }));
  if (glow) layer(out, 0.35, (b) => goo(b, c, 0.01, 1.2));
  return reverbHalf(out, sr, { t60: 0.35, hf: 0.5, wet: 0.14, dry: 1, tail: 0.2, pre: 0.006 });
}

export function frameSounds(): Record<string, SoundGen> {
  const out: Record<string, SoundGen> = {};
  for (const [type, glow] of [['item_frame', false], ['glow_item_frame', true]] as const) {
    const n = `entity.${type}`;
    out[`${n}.place`] = sound(`${n}.place`, 4, (c) => place(c, glow), { fadeOut: 0.08 });
    out[`${n}.add_item`] = sound(`${n}.add_item`, 4, (c) => addItem(c, glow), { fadeOut: 0.08 });
    out[`${n}.remove_item`] = sound(`${n}.remove_item`, 4, (c) => removeItem(c, glow), { fadeOut: 0.08 });
    out[`${n}.rotate_item`] = sound(`${n}.rotate_item`, 4, (c) => rotateItem(c, glow), { fadeOut: 0.06 });
    out[`${n}.break`] = sound(`${n}.break`, 3, (c) => frameBreak(c, glow), { fadeOut: 0.1 });
  }
  return out;
}
