// Cats (vanilla entity.cat.*): a tame cat's meow, the mouth opening and closing on it ("mi-a-ow"); a stray's longer,
// rougher, wavering cry; the purr, a low rattle of breath in and out; a purr running into a trilled meow; the hiss,
// spat out and trailing off; a sharp yowl when hurt and a falling one when it dies; crunching on its fish; and the
// short, rising chirrup it asks for food with. Takes as in vanilla's sounds.json: ambient 4, stray_ambient 4, purr 3,
// purreow 2, hiss 3, hurt 3, death 2, eat 2, beg_for_food 3. The ocelot's meow, hurt and death are the cat's own, quieter.

import type { SoundGen } from '../synth';
import { TAU, alloc, envAD, envBump, layer, lowpass, highpass, smooth } from './dsp';
import { type Ctx, FX_PEAK, pitched, sound } from './registry';
import { burst } from './texture';
import { voice } from './voice';

/** "mi-a-ow": the jaw opening and closing over a pitch that rises and falls, `bright` its mouth's width */
function meowInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, o: { rough?: number; breath?: number; vib?: [number, number]; lift?: number; open?: number } = {}): void {
  const { sr, rng } = c;
  const lift = o.lift ?? 0.35, open = o.open ?? 1;
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (x < 0.35 ? 0.85 + lift * smooth(x / 0.35) : 0.85 + lift - (0.3 + lift * 0.5) * smooth((x - 0.35) / 0.65));
    },
    amp: (t) => envBump(t, d * 0.14, d * 0.86),
    formants: [
      // F1 opens from the "m/i" to the "a" and closes on the "ow"
      { f: (t) => { const x = t / d; return x < 0.4 ? 420 + 620 * open * smooth(x / 0.4) : 420 + 620 * open - 520 * open * smooth((x - 0.4) / 0.6); }, bw: 150, g: 1 },
      { f: (t) => { const x = t / d; return x < 0.3 ? 2400 - 750 * smooth(x / 0.3) : 1650 - 650 * smooth((x - 0.3) / 0.7); }, bw: 220, g: 0.65 },
      { f: 3200, bw: 320, g: 0.28 },
      { f: 4400, bw: 450, g: 0.1 },
    ],
    oq: 0.55,
    jitter: 0.015,
    shimmer: 0.07,
    rough: o.rough ?? 0.08,
    breath: o.breath ?? 0.12,
    vib: o.vib ?? [6, 0.012],
  });
}

/** a tame cat's meow */
function meow(c: Ctx): Float32Array {
  const d = c.rng.range(0.45, 0.72);
  const out = alloc(d + 0.1, c.sr);
  meowInto(out, c, 0, d, c.rng.range(560, 720));
  highpass(out, 150, c.sr);
  return out;
}

/** a stray's cry: longer and lower, rough-edged, wavering, pleading */
function strayMeow(c: Ctx): Float32Array {
  const d = c.rng.range(0.8, 1.15);
  const out = alloc(d + 0.12, c.sr);
  meowInto(out, c, 0, d, c.rng.range(430, 560), { rough: 0.3, breath: 0.2, vib: [c.rng.range(5, 7), 0.03], lift: 0.45, open: 1.15 });
  highpass(out, 130, c.sr);
  return out;
}

/** the purr: a low rattle, twenty-odd beats a second, on the breath out and a little softer on the breath in */
function purrInto(out: Float32Array, c: Ctx, t0: number, d: number): void {
  const { sr, rng } = c;
  const rate = rng.range(23, 28);
  const breath = rng.range(0.75, 0.95);
  const n = Math.floor(d * rate);
  for (let i = 0; i < n; i++) {
    const t = t0 + i / rate + rng.range(-0.003, 0.003);
    const phase = ((t - t0) % (2 * breath)) / breath;
    // (out on the first half of each breath, in on the second; a dip between)
    const lvl = (phase < 1 ? 1 : 0.7) * (0.35 + 0.65 * Math.sin(Math.PI * (phase % 1))) * envBump(t - t0, 0.15, d - 0.15);
    layer(out, 0.9 * lvl, (b) => burst(b, sr, rng, { t, dur: 0.035, attack: 0.004, tau: 0.012, bp: [rng.range(160, 260), 0.9], color: 'brown' }));
    layer(out, 0.3 * lvl, (b) => burst(b, sr, rng, { t, dur: 0.03, attack: 0.003, tau: 0.01, bp: [rng.range(500, 800), 1.2] }));
  }
}

function purr(c: Ctx): Float32Array {
  const d = c.rng.range(1.8, 2.3);
  const out = alloc(d + 0.1, c.sr);
  purrInto(out, c, 0, d);
  lowpass(out, 1400, c.sr);
  highpass(out, 60, c.sr);
  return out;
}

/** a purr running into a trilled meow */
function purreow(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const p = rng.range(0.45, 0.6), d = rng.range(0.55, 0.7);
  const out = alloc(p + d + 0.1, sr);
  purrInto(out, c, 0, p + 0.08);
  const tmp = alloc(p + d + 0.1, sr);
  meowInto(tmp, c, p, d, rng.range(600, 720), { lift: 0.25 });
  // (the trill: the start of the meow rolled on the tongue)
  const s0 = Math.round(p * sr), s1 = Math.round((p + d * 0.35) * sr);
  for (let i = s0; i < s1; i++) tmp[i] *= 0.55 + 0.45 * Math.sin(TAU * 26 * ((i - s0) / sr));
  for (let i = 0; i < out.length; i++) out[i] += tmp[i];
  lowpass(out, 6000, sr);
  highpass(out, 60, sr);
  return out;
}

/** the hiss: spat out, a rush of air through the teeth, trailing off */
function hiss(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.8);
  const out = alloc(d + 0.1, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { t: 0, dur: d, attack: 0.012, tau: d * 0.45, bp: [rng.range(3800, 4600), 0.8] }));
  layer(out, 0.55, (b) => burst(b, sr, rng, { t: 0, dur: d * 0.8, attack: 0.008, tau: d * 0.3, bp: [rng.range(6500, 7500), 1.1] }));
  // (the spit at the start)
  layer(out, 0.6, (b) => burst(b, sr, rng, { t: 0, dur: 0.05, attack: 0.002, tau: 0.015, bp: [2200, 0.7] }));
  highpass(out, 1200, sr);
  return out;
}

/** hurt: a sharp, high yowl, snapping off */
function hurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.22, 0.32);
  const out = alloc(d + 0.08, sr);
  const f = rng.range(780, 950);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => f * (1.05 + 0.1 * Math.sin((Math.PI * t) / d) - 0.35 * smooth(t / d)),
    amp: (t) => envAD(t, 0.012, d * 0.45),
    formants: [
      { f: 950, bw: 160, g: 1 },
      { f: 1750, bw: 220, g: 0.7 },
      { f: 3100, bw: 300, g: 0.35 },
    ],
    oq: 0.45,
    jitter: 0.03,
    shimmer: 0.12,
    rough: 0.3,
    breath: 0.15,
  });
  highpass(out, 200, sr);
  return out;
}

/** the death cry: a long yowl, falling away and breaking up */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.9, 1.2);
  const out = alloc(d + 0.15, sr);
  const f = rng.range(700, 820);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (1 + 0.12 * Math.sin(Math.PI * Math.min(1, x * 2.5)) - 0.5 * smooth(x)) * (1 + (x > 0.5 ? 0.04 * Math.sin(TAU * 8 * t) : 0));
    },
    amp: (t) => envAD(t, 0.03, d * 0.5) * (1 - 0.3 * smooth((t / d - 0.3) / 0.7)),
    formants: [
      { f: (t) => 1000 - 450 * (t / d), bw: 160, g: 1 },
      { f: (t) => 1700 - 500 * (t / d), bw: 220, g: 0.6 },
      { f: 3000, bw: 320, g: 0.25 },
    ],
    oq: 0.5,
    jitter: 0.04,
    shimmer: 0.15,
    rough: 0.25,
    breath: (t) => 0.12 + 0.3 * (t / d),
  });
  highpass(out, 150, sr);
  return out;
}

/** eating: quick, wet crunches */
function eat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const n = 4 + rng.int(3);
  const out = alloc(0.6, sr);
  let t = 0.01;
  for (let i = 0; i < n; i++) {
    layer(out, rng.range(0.6, 1), (b) => burst(b, sr, rng, { t, dur: 0.05, attack: 0.002, tau: 0.012, bp: [rng.range(1500, 3200), 0.7] }));
    layer(out, rng.range(0.25, 0.4), (b) => burst(b, sr, rng, { t, dur: 0.04, attack: 0.002, tau: 0.01, hp: 5000 }));
    t += rng.range(0.07, 0.11);
  }
  highpass(out, 300, sr);
  return out;
}

/** begging: a short trill rising into a questioning mew */
function beg(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.3, 0.42);
  const out = alloc(d + 0.08, sr);
  const f = rng.range(620, 760);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => f * (0.9 + 0.4 * smooth(t / d)),
    amp: (t) => envBump(t, d * 0.2, d * 0.8) * (t < d * 0.4 ? 0.6 + 0.4 * Math.sin(TAU * 24 * t) : 1),
    formants: [
      { f: (t) => 500 + 450 * smooth(t / d), bw: 140, g: 1 },
      { f: (t) => 2100 - 400 * smooth(t / d), bw: 200, g: 0.6 },
      { f: 3300, bw: 320, g: 0.25 },
    ],
    oq: 0.6,
    jitter: 0.012,
    shimmer: 0.05,
    rough: 0.05,
    breath: 0.1,
  });
  highpass(out, 180, sr);
  return out;
}

export function catSounds(): Record<string, SoundGen> {
  const ambient = sound('entity.cat.ambient', 4, meow);
  const hurtS = sound('entity.cat.hurt', 3, hurt);
  const deathS = sound('entity.cat.death', 2, death);
  return {
    'entity.cat.ambient': ambient,
    'entity.cat.stray_ambient': sound('entity.cat.stray_ambient', 4, strayMeow),
    'entity.cat.purr': sound('entity.cat.purr', 3, purr),
    'entity.cat.purreow': sound('entity.cat.purreow', 2, purreow),
    'entity.cat.hiss': sound('entity.cat.hiss', 3, hiss),
    'entity.cat.hurt': hurtS,
    'entity.cat.death': deathS,
    'entity.cat.eat': sound('entity.cat.eat', 2, eat),
    'entity.cat.beg_for_food': sound('entity.cat.beg_for_food', 3, beg),
    // (vanilla sounds.json: an ocelot's are the cat's recordings, played quieter)
    'entity.ocelot.ambient': pitched(ambient, 1, { peak: FX_PEAK * 0.3 }),
    'entity.ocelot.hurt': pitched(hurtS, 1, { peak: FX_PEAK * 0.45 }),
    'entity.ocelot.death': pitched(deathS, 1, { peak: FX_PEAK * 0.45 }),
  };
}
