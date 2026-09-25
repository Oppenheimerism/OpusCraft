// Llamas (vanilla entity.llama.*). The llama's voice is a hum through the nose, mouth shut: a soft rising "mm" now
// and then gargling in its throat. Angry, it opens up into a harsh bray; hurt, a sharp nasal bleat; dying, a long
// hum that sags and gargles away. It grinds its food; it spits with a pop of the lips and a wet spray; its padded
// toes fall softly; a carpet goes on with a flap and a rustle of wool. As in vanilla's sounds.json the chest going on
// is the chicken's plop. Takes: ambient 5, angry 1, death 2, eat 3, hurt 3, spit 2, step 5, swag 1.

import type { SoundGen } from '../synth';
import { TAU, alloc, envBump, layer, highpass, lowpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, thump } from './texture';
import { voice } from './voice';

/**
 * a hum into `out` at `t0`: voiced through the nose with the mouth shut (a strong low resonance, the rest muffled),
 * the pitch swelling up from `f` by `rise` and settling; `open` (0-1) opens the mouth toward a bray over its length,
 * `gargle` a throaty flutter
 */
function humInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, o: { rise?: number; fall?: number; open?: number; gargle?: number; rough?: number; gain?: number }): void {
  const { sr, rng } = c;
  const rise = o.rise ?? 0.15, fall = o.fall ?? 0.1, open = o.open ?? 0, gargle = o.gargle ?? 0;
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      const up = x < 0.4 ? smooth(x / 0.4) : 1;
      const down = x > 0.55 ? smooth((x - 0.55) / 0.45) : 0;
      return f * (1 + rise * up - (rise + fall) * down);
    },
    amp: (t) => envBump(t, d * 0.18, d * 0.82),
    formants: [
      // (the nasal murmur, and the mouth's first resonance rising as it opens)
      { f: 260, bw: 90, g: 1 },
      { f: (t) => 520 + 380 * open * smooth(t / d), bw: 160, g: 0.35 + 0.5 * open },
      { f: (t) => 1150 + 450 * open * smooth(t / d), bw: 240, g: 0.12 + 0.35 * open },
      { f: 2500, bw: 420, g: 0.05 + 0.15 * open },
    ],
    oq: 0.7 - 0.25 * open,
    jitter: 0.015,
    shimmer: 0.06,
    rough: o.rough ?? 0.05,
    vib: [rng.range(4.5, 6.5), 0.012],
    growl: gargle > 0 ? [rng.range(22, 30), gargle] : undefined,
    breath: 0.06 + 0.1 * open,
    gain: o.gain ?? 1,
  });
}

/** vanilla entity.llama.ambient: one or two soft hums, sometimes gargling */
function llamaAmbient(c: Ctx): Float32Array {
  const { rng } = c;
  const n = rng.int(3) === 0 ? 2 : 1;
  const d = rng.range(0.45, 0.75);
  const out = alloc(n * (d + 0.12) + 0.15, c.sr);
  let t = 0.01;
  for (let i = 0; i < n; i++) {
    humInto(out, c, t, d * (i ? 0.8 : 1), rng.range(170, 230) * (i ? 1.08 : 1), { rise: rng.range(0.08, 0.2), gargle: rng.int(2) ? rng.range(0.25, 0.5) : 0 });
    t += d + rng.range(0.05, 0.12);
  }
  highpass(out, 90, c.sr);
  lowpass(out, 4200, c.sr);
  return out;
}

/** vanilla entity.llama.angry: a hum that breaks open into a harsh bray */
function llamaAngry(c: Ctx): Float32Array {
  const { rng } = c;
  const d = rng.range(0.6, 0.8);
  const out = alloc(d + 0.15, c.sr);
  humInto(out, c, 0.01, d, rng.range(260, 300), { rise: 0.35, fall: 0.25, open: 1, gargle: 0.5, rough: 0.45, gain: 1.2 });
  highpass(out, 110, c.sr);
  return out;
}

/** vanilla entity.llama.hurt: a short, pinched bleat */
function llamaHurt(c: Ctx): Float32Array {
  const { rng } = c;
  const d = rng.range(0.22, 0.32);
  const out = alloc(d + 0.1, c.sr);
  humInto(out, c, 0.005, d, rng.range(330, 400), { rise: 0.2, fall: 0.35, open: 0.6, rough: 0.3, gain: 1.2 });
  highpass(out, 140, c.sr);
  return out;
}

/** vanilla entity.llama.death: a long hum sagging away, gargling as it goes */
function llamaDeath(c: Ctx): Float32Array {
  const { rng } = c;
  const d = rng.range(1.0, 1.3);
  const out = alloc(d + 0.2, c.sr);
  humInto(out, c, 0.01, d, rng.range(250, 290), { rise: 0.1, fall: 0.55, open: 0.45, gargle: 0.55, rough: 0.35, gain: 1.1 });
  highpass(out, 90, c.sr);
  return out;
}

/** vanilla entity.llama.eat: quick grinding chews */
function llamaEat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const n = 3 + rng.int(3);
  const out = alloc(0.2 + n * 0.13, sr);
  let t = 0.01;
  for (let i = 0; i < n; i++) {
    layer(out, rng.range(0.55, 0.9), (b) => burst(b, sr, rng, { t, dur: 0.08, attack: 0.005, tau: 0.025, bp: [rng.range(900, 1700), 0.8] }));
    layer(out, rng.range(0.25, 0.4), (b) => burst(b, sr, rng, { t: t + 0.008, dur: 0.1, attack: 0.008, tau: 0.03, bp: [rng.range(280, 420), 0.8], color: 'brown' }));
    t += rng.range(0.1, 0.15);
  }
  highpass(out, 160, sr);
  return out;
}

/** vanilla entity.llama.spit: the lips popping open and a wet spray blown after */
function llamaSpit(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  // (the "p" of the lips)
  layer(out, 0.9, (b) => thump(b, sr, { t: 0.005, f0: rng.range(170, 210), f1: 90, tau: 0.012 }));
  layer(out, 0.8, (b) => burst(b, sr, rng, { t: 0.004, dur: 0.03, attack: 0.001, tau: 0.006, bp: [1500, 0.9] }));
  // (the spray: a hiss that flutters wetly as it goes)
  const d = rng.range(0.16, 0.24), wob = rng.range(28, 40);
  layer(out, 0.7, (b) => {
    burst(b, sr, rng, { t: 0.02, dur: d, attack: 0.01, tau: d / 2.5, bp: [rng.range(2600, 3400), 1.1] });
    for (let i = 0; i < b.length; i++) b[i] *= 0.65 + 0.35 * Math.sin(TAU * wob * (i / sr));
  });
  layer(out, 0.35, (b) => burst(b, sr, rng, { t: 0.02, dur: d, attack: 0.01, tau: d / 3, hp: 5000 }));
  highpass(out, 120, sr);
  return out;
}

/** vanilla entity.llama.step: a padded toe coming down, and a whisper of wool */
function llamaStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.18, sr);
  layer(out, 0.8, (b) => thump(b, sr, { t: 0.004, f0: rng.range(120, 150), f1: rng.range(70, 85), glide: 0.02, tau: 0.022, h2: 0.15 }));
  layer(out, 0.3, (b) => burst(b, sr, rng, { t: 0.004, dur: 0.06, attack: 0.004, tau: 0.018, bp: [rng.range(500, 800), 0.8], color: 'brown' }));
  layer(out, 0.15, (b) => burst(b, sr, rng, { t: 0.01, dur: 0.08, attack: 0.01, tau: 0.025, bp: [rng.range(2500, 3500), 1] }));
  lowpass(out, 4500, sr);
  return out;
}

/** vanilla entity.llama.swag: a carpet thrown over its back, flapping down and settling in a rustle of wool */
function llamaSwag(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 0.8, (b) => burst(b, sr, rng, { t: 0.005, dur: 0.1, attack: 0.012, tau: 0.03, bp: [700, 0.7], color: 'brown' }));
  layer(out, 0.5, (b) => burst(b, sr, rng, { t: 0.09, dur: 0.08, attack: 0.008, tau: 0.025, bp: [900, 0.8], color: 'brown' }));
  for (let i = 0; i < 5; i++) {
    const t = 0.14 + i * rng.range(0.05, 0.08);
    layer(out, rng.range(0.12, 0.25), (b) => burst(b, sr, rng, { t, dur: 0.07, attack: 0.01, tau: 0.02, bp: [rng.range(1800, 3200), 1] }));
  }
  highpass(out, 100, sr);
  return out;
}

/** `base`: the sounds so far, for the chicken's plop */
export function llamaSounds(base: Record<string, SoundGen>): Record<string, SoundGen> {
  const plop = base['entity.chicken.egg'];
  return {
    'entity.llama.ambient': sound('entity.llama.ambient', 5, llamaAmbient),
    'entity.llama.angry': sound('entity.llama.angry', 1, llamaAngry),
    'entity.llama.hurt': sound('entity.llama.hurt', 3, llamaHurt),
    'entity.llama.death': sound('entity.llama.death', 2, llamaDeath),
    'entity.llama.eat': sound('entity.llama.eat', 3, llamaEat),
    'entity.llama.spit': sound('entity.llama.spit', 2, llamaSpit),
    'entity.llama.step': sound('entity.llama.step', 5, llamaStep),
    'entity.llama.swag': sound('entity.llama.swag', 1, llamaSwag),
    ...(plop ? { 'entity.llama.chest': plop } : {}),
  };
}
