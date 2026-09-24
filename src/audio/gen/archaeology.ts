// The archaeology sounds (vanilla sounds.json): suspicious sand's and suspicious gravel's own block sounds, the grains
// with a dry crust breaking over them; the brush's strokes (item.brush.brushing.*: the bristles alone, or sweeping
// sand or gravel off, and the stroke that brushes the block away); and the decorated pot's, fired clay knocked,
// stepped on, set down and broken, shattering when it breaks cracked, an item dropped into it and the hollow knock
// when nothing more will go in.

import type { SoundGen } from '../synth';
import { alloc, envBump, layer } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { burst, impact, phisem, sweep, thump, ticks, twoBump } from './texture';
import type { Band } from './texture';

const SAND_BANDS: Band[] = [
  { f: 2400, q: 0.9, g: 1, spread: 0.18 },
  { f: 1100, q: 1.1, g: 0.6, spread: 0.12 },
  { f: 5000, q: 1, g: 0.25 },
];
const GRAVEL_BANDS: Band[] = [
  { f: 2100, q: 1.3, g: 1, spread: 0.4 },
  { f: 920, q: 1.6, g: 0.9, spread: 0.35 },
  { f: 4400, q: 1.5, g: 0.35, spread: 0.25 },
];

/** the grains of suspicious sand or gravel moving, at energy `en` */
function grains(b: Float32Array, c: Ctx, gravel: boolean, dur: number, en: (t: number) => number, t = 0): void {
  phisem(b, c.sr, c.rng, gravel
    ? { t, dur, rate: 5200, energy: en, grain: 0.0012, heavy: 2.5, bands: GRAVEL_BANDS }
    : { t, dur, rate: 17000, energy: en, grain: 0.0028, heavy: 1.6, dry: 0.04, bands: SAND_BANDS });
}

/** vanilla block.suspicious_sand.step / suspicious_gravel.step: a footfall on grains under a dry crust */
function crustStep(c: Ctx, gravel: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const en = twoBump(0.015, 0.04, rng.range(0.05, 0.09), rng.range(0.45, 0.75), 0.015, 0.05);
  layer(out, 1, (b) => grains(b, c, gravel, 0.3, en));
  // (the crust: a few dry crackles)
  layer(out, gravel ? 0.45 : 0.4, (b) => ticks(b, sr, rng, { dur: 0.2, rate: gravel ? 120 : 100, energy: en, f: gravel ? [800, 3200] : [1500, 4800], t60: [0.003, 0.012], click: 0.6 }));
  layer(out, 0.25, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.008, tau: 0.03, lp: 450 }));
  return out;
}

/** vanilla block.suspicious_sand.break / suspicious_gravel.break: the crust caving in over something hollow */
function crustBreak(c: Ctx, gravel: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  const t2 = rng.range(0.1, 0.16);
  const en = (t: number) => Math.min(1, (1 - Math.exp(-t / 0.01)) * (0.7 * Math.exp(-t / 0.09) + 0.3 * Math.exp(-t / 0.25)) + 0.3 * envBump(t - t2, 0.03, 0.18));
  layer(out, 1, (b) => grains(b, c, gravel, 0.55, en));
  layer(out, 0.5, (b) => ticks(b, sr, rng, { dur: 0.35, rate: gravel ? 150 : 120, energy: en, f: gravel ? [700, 3400] : [1200, 4600], t60: [0.004, 0.02], click: 0.5 }));
  layer(out, 0.45, (b) => thump(b, sr, { f0: 150, f1: 95, tau: 0.035 }));
  return out;
}

/** a stroke's rise and fall over `len` seconds */
const stroke = (len: number) => (t: number) => (t < 0 || t > len ? 0 : Math.pow(Math.sin((Math.PI * t) / len), 1.4));

/**
 * vanilla item.brush.brushing.*: one stroke of the bristles, a soft swish across, alone (generic) or with the sand
 * it sweeps off trickling away after it, or small stones rattling off
 */
function brushStroke(c: Ctx, what: 'generic' | 'sand' | 'gravel'): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  const len = rng.range(0.26, 0.34);
  const amp = stroke(len);
  const lift = rng.range(0.85, 1.15);
  // (the bristles dragged across, brightening as they speed up)
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: len, f: (t) => (2400 + 2600 * amp(t)) * lift, q: 0.8, amp, color: 'pink' }));
  layer(out, 0.45, (b) => phisem(b, sr, rng, { dur: len, rate: 9000, energy: amp, grain: 0.0005, heavy: 2, bands: [{ f: 6000, q: 1.2, g: 1, spread: 0.3 }, { f: 3400, q: 1.2, g: 0.6, spread: 0.3 }] }));
  if (what === 'sand') layer(out, 0.7, (b) => grains(b, c, false, 0.4, (t) => 0.8 * envBump(t, 0.06, 0.18), len * 0.35));
  else if (what === 'gravel') {
    const en = (t: number) => envBump(t, 0.04, 0.16);
    layer(out, 0.55, (b) => grains(b, c, true, 0.35, (t) => 0.6 * en(t), len * 0.3));
    layer(out, 0.5, (b) => ticks(b, sr, rng, { t: len * 0.3, dur: 0.3, rate: 60, energy: en, f: [900, 3600], t60: [0.006, 0.025], click: 0.4 }));
  }
  return out;
}

/**
 * vanilla item.brush.brushing.sand.complete / gravel.complete: the last stroke, the block brushed away, its grains
 * pouring off and settling
 */
function brushComplete(c: Ctx, gravel: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  const len = rng.range(0.24, 0.3);
  const amp = stroke(len);
  layer(out, 0.8, (b) => sweep(b, sr, rng, { dur: len, f: (t) => 2400 + 2800 * amp(t), q: 0.8, amp, color: 'pink' }));
  const pour = (t: number) => envBump(t - len * 0.4, 0.05, 0.3);
  layer(out, 1, (b) => grains(b, c, gravel, 0.85, pour));
  if (gravel) layer(out, 0.55, (b) => ticks(b, sr, rng, { t: len * 0.4, dur: 0.45, rate: 90, energy: (t) => envBump(t, 0.05, 0.25), f: [800, 3400], t60: [0.006, 0.03], click: 0.4 }));
  layer(out, 0.35, (b) => thump(b, sr, { t: len * 0.45, f0: 140, f1: 90, tau: 0.04 }));
  return out;
}

/** fired clay struck: its few bright modes, and the air in the pot answering low (`hollow`) */
function clay(b: Float32Array, c: Ctx, o: { t?: number; pitch?: number; hollow?: number; ring?: number; noise?: number }): void {
  const p = (o.pitch ?? 1) * c.rng.range(0.96, 1.04);
  impact(b, c.sr, c.rng, {
    t: o.t,
    modes: [1180 * p, 1, 0.045, 2410 * p, 0.55, 0.03, 3950 * p, 0.3, 0.018, 5700 * p, 0.14, 0.01, 330 * p, o.hollow ?? 0.4, o.ring ?? 0.08],
    jitter: 0.04,
    noise: o.noise ?? 0.6,
    noiseTau: 0.002,
    noiseBp: [3200, 0.8],
  });
}

/** vanilla block.decorated_pot.step: a light clay tap */
function potStep(c: Ctx): Float32Array {
  const out = alloc(0.25, c.sr);
  layer(out, 1, (b) => clay(b, c, { pitch: 1.05, hollow: 0.25 }));
  layer(out, 0.3, (b) => thump(b, c.sr, { f0: 160, f1: 110, tau: 0.02 }));
  return out;
}

/** vanilla block.decorated_pot.break / place: the pot set down hard, or knocked loose, on its foot */
function potBreak(c: Ctx, place: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 1, (b) => clay(b, c, { pitch: place ? 0.92 : 0.85, hollow: 0.55, noise: 0.8 }));
  layer(out, 0.55, (b) => thump(b, sr, { f0: 150, f1: 95, tau: 0.04 }));
  if (!place) layer(out, 0.3, (b) => ticks(b, sr, rng, { t: 0.02, dur: 0.15, rate: 40, energy: () => 1, f: [1500, 4200], t60: [0.01, 0.04], click: 0.3 }));
  return out;
}

/** vanilla block.decorated_pot.shatter: the cracked pot giving way, a crack and its shards falling and ringing */
function potShatter(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 1, (b) => clay(b, c, { pitch: 0.8, hollow: 0.35, noise: 1.2 }));
  layer(out, 0.55, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.001, tau: 0.018, bp: [2600, 0.7] }));
  const fall = (t: number) => Math.min(1, envBump(t - 0.02, 0.01, 0.12) + 0.6 * envBump(t - rng.range(0.16, 0.24), 0.02, 0.2));
  layer(out, 0.9, (b) => ticks(b, sr, rng, { dur: 0.8, rate: 150, energy: fall, f: [1300, 5200], t60: [0.02, 0.09], ratios: [1, 2.31, 3.92], weights: [1, 0.45, 0.2], click: 0.5 }));
  layer(out, 0.4, (b) => thump(b, sr, { f0: 130, f1: 80, tau: 0.045 }));
  return out;
}

/** vanilla block.decorated_pot.insert: something dropped into the pot, a soft thud in its hollow (pitched by fill) */
function potInsert(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  impact(out, sr, rng, { modes: [260, 1, 0.12, 530, 0.45, 0.07, 890, 0.2, 0.04, 1500, 0.08, 0.02], jitter: 0.04, noise: 0.5, noiseTau: 0.004, noiseBp: [900, 0.9] });
  layer(out, 0.6, (b) => thump(b, sr, { f0: 180, f1: 120, tau: 0.04 }));
  return out;
}

/** vanilla block.decorated_pot.insert_fail: the hollow knock of a pot that won't take what's held to it */
function potKnock(c: Ctx): Float32Array {
  const out = alloc(0.4, c.sr);
  layer(out, 1, (b) => clay(b, c, { pitch: 0.75, hollow: 1.2, ring: 0.2, noise: 0.5 }));
  return out;
}

export function archaeologySounds(): Record<string, SoundGen> {
  const S: Record<string, SoundGen> = {};
  for (const gravel of [false, true]) {
    const mat = gravel ? 'suspicious_gravel' : 'suspicious_sand';
    const step = sound(`block.${mat}.step`, 4, (c) => crustStep(c, gravel));
    const brk = sound(`block.${mat}.break`, 4, (c) => crustBreak(c, gravel));
    S[`block.${mat}.step`] = step;
    S[`block.${mat}.break`] = brk;
    S[`block.${mat}.place`] = brk;
    S[`block.${mat}.hit`] = pitched(step, 0.5);
    S[`block.${mat}.fall`] = pitched(step, 0.75);
  }
  S['item.brush.brushing.generic'] = sound('item.brush.brushing.generic', 4, (c) => brushStroke(c, 'generic'));
  S['item.brush.brushing.sand'] = sound('item.brush.brushing.sand', 4, (c) => brushStroke(c, 'sand'));
  S['item.brush.brushing.gravel'] = sound('item.brush.brushing.gravel', 4, (c) => brushStroke(c, 'gravel'));
  S['item.brush.brushing.sand.complete'] = sound('item.brush.brushing.sand.complete', 3, (c) => brushComplete(c, false));
  S['item.brush.brushing.gravel.complete'] = sound('item.brush.brushing.gravel.complete', 3, (c) => brushComplete(c, true));
  const potStepS = sound('block.decorated_pot.step', 5, potStep);
  S['block.decorated_pot.step'] = potStepS;
  S['block.decorated_pot.break'] = sound('block.decorated_pot.break', 4, (c) => potBreak(c, false));
  S['block.decorated_pot.place'] = sound('block.decorated_pot.place', 4, (c) => potBreak(c, true));
  S['block.decorated_pot.hit'] = pitched(potStepS, 0.5);
  S['block.decorated_pot.fall'] = pitched(potStepS, 0.75);
  S['block.decorated_pot.shatter'] = sound('block.decorated_pot.shatter', 4, potShatter);
  S['block.decorated_pot.insert'] = sound('block.decorated_pot.insert', 4, potInsert);
  S['block.decorated_pot.insert_fail'] = sound('block.decorated_pot.insert_fail', 4, potKnock);
  return S;
}
