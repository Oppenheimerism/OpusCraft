// Mooshrooms (remaining mobs: the mooshroom; vanilla entity.mooshroom.*). Its voice, steps and hurt are the cow's
// (vanilla MushroomCow keeps Cow's); these are its own. A bowl held to it fills with stew: a knock of the wooden bowl
// and a thick, gloopy pour, fat bubbles glugging up through it (the same takes when the stew is suspicious). A brown
// one munching a flower: soft leafy crunches, chewed. Struck by lightning and changing colour, it gives off a
// shimmering whoosh, a zap rising into a sparkle of chiming partials. Its shearing is the sheep's snip (audio/synth.ts).
// Takes: convert 2, eat 4, milk 3 (suspicious_milk the same three).

import type { SoundGen } from '../synth';
import { alloc, envAD, envBump, highpass, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, phisem, sweep, thump } from './texture';

const TAU = Math.PI * 2;

/** vanilla entity.mooshroom.milk: the bowl knocked, then stew poured into it, thick and glugging */
function mooshroomMilk(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.7);
  const out = alloc(d + 0.25, sr);
  // (the wooden bowl: a dull, short knock, its modes low and quickly damped)
  const fb = rng.range(380, 460);
  layer(out, 0.45, (b) =>
    impact(b, sr, rng, {
      t: 0.01,
      modes: [fb, 1, 0.05, fb * 2.3, 0.5, 0.035, fb * 3.9, 0.25, 0.02],
      noise: 0.4,
      noiseTau: 0.004,
      noiseBp: [1400, 0.8],
    }),
  );
  // (the pour: a low, gurgling stream, wobbling as it comes)
  const wob = rng.range(7, 11);
  layer(out, 0.8, (b) =>
    sweep(b, sr, rng, {
      t: 0.04,
      dur: d,
      f: (t) => 520 + (260 * t) / d,
      q: 1.4,
      amp: (t) => envBump(t, 0.05, d - 0.05) * (0.7 + 0.3 * Math.sin(TAU * wob * t)),
      color: 'pink',
    }),
  );
  // (fat bubbles, the stew too thick to splash)
  layer(out, 0.9, (b) => {
    const n = 10 + rng.int(6);
    for (let k = 0; k < n; k++) {
      const t = 0.06 + rng.next() * d * 0.85;
      bubble(b, sr, t, rng.logRange(180, 520) * (1 + (0.35 * t) / d), rng.range(0.4, 1), undefined, 0.45);
    }
  });
  lowpass(out, 3200, sr);
  highpass(out, 70, sr);
  return out;
}

/** a mouthful of petals and stalk bitten through: a short, leafy crunch */
function leafCrunchInto(out: Float32Array, c: Ctx, t: number, amp: number): void {
  const { sr, rng } = c;
  const dur = rng.range(0.08, 0.12);
  phisem(out, sr, rng, {
    t,
    dur,
    rate: 900,
    energy: (x) => envAD(x, 0.006, dur * 0.6),
    grain: 0.0018,
    heavy: 2.5,
    bands: [
      { f: rng.range(1800, 2400), q: 1.6, g: 0.9, spread: 0.3 },
      { f: rng.range(3600, 4600), q: 2, g: 0.6, spread: 0.3 },
      { f: rng.range(700, 900), q: 1.2, g: 0.35, spread: 0.2 },
    ],
    dry: 0.1,
    gain: amp,
  });
}

/** vanilla entity.mooshroom.eat: a flower taken and chewed, two to four leafy crunches, each with the jaw's thud */
function mooshroomEat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  let t = 0.005;
  for (let i = 0, n = 2 + rng.int(3); i < n; i++) {
    leafCrunchInto(out, c, t, i ? rng.range(0.55, 0.85) : 1);
    const tt = t;
    layer(out, 0.3, (b) => thump(b, sr, { t: tt, f0: rng.range(120, 150), f1: 85, glide: 0.02, tau: 0.03 }));
    t += rng.range(0.13, 0.19);
  }
  highpass(out, 80, sr);
  return out;
}

/** vanilla entity.mooshroom.convert: a zap rising into a whoosh, and a sparkle of chiming partials over it */
function mooshroomConvert(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.0, 1.2);
  const out = alloc(d + 0.4, sr);
  // (the zap: a hard crackle at the start)
  burst(out, sr, rng, { t: 0.005, dur: 0.18, attack: 0.002, tau: 0.035, bp: [rng.range(2400, 3000), 0.7], amp: 0.8 });
  // (the whoosh, rising and falling away)
  layer(out, 0.9, (b) =>
    sweep(b, sr, rng, {
      t: 0.02,
      dur: d,
      f: (t) => 350 * Math.pow(12, Math.min(1, t / (d * 0.55))),
      q: 2.2,
      amp: (t) => envBump(t, d * 0.35, d * 0.65),
    }),
  );
  // (the sparkle: bright partials chiming in one after another, each with a quick tremble)
  layer(out, 0.55, (b) => {
    const base = rng.range(1300, 1600);
    const ratios = [1, 1.5, 2, 2.52, 3, 4.03];
    for (let k = 0; k < 9; k++) {
      const f = base * ratios[rng.int(ratios.length)] * rng.range(0.99, 1.01);
      const t0 = 0.12 + rng.next() * d * 0.6;
      const len = rng.range(0.25, 0.45);
      const s0 = Math.round(t0 * sr), n = Math.min(b.length - s0, Math.round(len * sr));
      const trem = rng.range(18, 28), a = rng.range(0.4, 1);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        b[s0 + i] += Math.sin(TAU * f * t) * envAD(t, 0.01, len * 0.4) * (0.75 + 0.25 * Math.sin(TAU * trem * t)) * a;
      }
    }
  });
  highpass(out, 120, sr);
  return out;
}

export function mooshroomSounds(): Record<string, SoundGen> {
  const milk = sound('entity.mooshroom.milk', 3, mooshroomMilk);
  return {
    'entity.mooshroom.convert': sound('entity.mooshroom.convert', 2, mooshroomConvert),
    'entity.mooshroom.eat': sound('entity.mooshroom.eat', 4, mooshroomEat),
    'entity.mooshroom.milk': milk,
    // (vanilla sounds.json: the same three takes, its own subtitle)
    'entity.mooshroom.suspicious_milk': milk,
  };
}
