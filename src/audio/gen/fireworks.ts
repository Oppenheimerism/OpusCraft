// Fireworks (vanilla sounds.json's fireworks/*, one take each). entity.firework_rocket.launch is the fuse catching and
// the rocket tearing away: a puff, then a fizzing rush that climbs as it goes and dies off. The blast is a sharp pop
// with a short thud under it and its echo off the land; the large blast a deep boom that rolls on. Their _far takes
// are the same heard from a long way off: the highs gone, the attack softened, mostly echo. The twinkle is the stars
// crackling as they burn out, thinning to the last few; its _far take muffled and sparser. (A dispenser's shot,
// entity.firework_rocket.shoot, is the bow's twang: soundManager.ts aliases it.)

import type { SoundGen } from '../synth';
import { alloc, brown, pink, layer, lowpass, highpass, reverb, echo, softClip, SVF, sinCyc, type Rng } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, phisem, sweep, thump } from './texture';

/** entity.firework_rocket.launch */
function launch(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.8, sr);
  const n = out.length;
  // the fuse catching: a soft puff
  layer(out, 0.55, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.004, tau: 0.018, bp: [1300, 0.8] }));
  // the rush of it going: a hiss whose middle climbs as the rocket speeds off, swelling then trailing away
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      t: 0.02,
      dur: 1.7,
      f: (t) => 900 * Math.pow(4.2, Math.min(1, t / 1.1)),
      q: 0.9,
      amp: (t) => (t < 0.06 ? t / 0.06 : Math.exp(-(t - 0.06) / 0.42)),
      color: 'pink',
    }),
  );
  // the fizz of the burning charge
  layer(out, 0.45, (b) =>
    phisem(b, sr, rng, {
      t: 0.03,
      dur: 1.3,
      rate: 2200,
      energy: (t) => Math.exp(-t / 0.35),
      grain: 0.0009,
      heavy: 2.2,
      bands: [
        { f: 3800, q: 1.2, g: 1, spread: 0.35 },
        { f: 6500, q: 1.5, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  // the push of the thrust, low under it
  layer(out, 0.35, (b) => {
    const r = brown(n, rng, 0.997);
    const f = new SVF(180, 0.7, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      b[i] = f.low(r[i]) * (t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) / 0.16));
    }
  });
  highpass(out, 60, sr);
  return out;
}

/** a pop: the crack, a short thud under it and the crackle of it tearing (`big`: the large blast's deeper, longer boom) */
function pop(out: Float32Array, sr: number, rng: Rng, big: boolean): void {
  const n = out.length;
  // the crack: bright noise, gone in a few hundredths of a second (the boom's darkens as it goes on)
  layer(out, 1, (b) => {
    const f = new SVF(9000, 0.7, sr);
    const tau = big ? 0.06 : 0.022, fall = big ? 0.2 : 0.07;
    const k = Math.exp(-1 / (tau * sr)), k2 = Math.exp(-1 / ((big ? 0.5 : 0.18) * sr));
    let e = 1, e2 = 1;
    const att = Math.round(0.0008 * sr);
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) f.set(big ? 300 + 8500 * Math.exp(-i / sr / fall) : 1200 + 8000 * Math.exp(-i / sr / fall), 0.7, sr);
      b[i] = f.low(rng.bi()) * (0.8 * e + 0.2 * e2) * (i < att ? i / att : 1);
      e *= k;
      e2 *= k2;
    }
  });
  // the thud in the chest
  layer(out, big ? 0.95 : 0.6, (b) => thump(b, sr, big ? { f0: 78, f1: 30, glide: 0.2, tau: 0.38, attack: 0.002, dur: 2.2 } : { f0: 120, f1: 48, glide: 0.06, tau: 0.1, attack: 0.001, dur: 0.6 }));
  // the big one rumbles on, rolling
  if (big)
    layer(out, 0.7, (b) => {
      const r = brown(n, rng, 0.998);
      lowpass(r, 220, sr);
      lowpass(r, 220, sr);
      const m = rng.range(2, 4), p = rng.next();
      const k = Math.exp(-1 / (0.8 * sr));
      let e = 1;
      for (let i = 0; i < n; i++) {
        const a = (i < 0.02 * sr ? i / (0.02 * sr) : 1) * e;
        e *= k;
        b[i] = r[i] * a * (1 + 0.3 * sinCyc((m * i) / sr + p));
      }
    });
  // the paper tearing: a scatter of crackle right after the crack
  layer(out, big ? 0.3 : 0.25, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: big ? 0.35 : 0.18,
      rate: 900,
      energy: (t) => Math.exp(-t / (big ? 0.1 : 0.05)),
      grain: 0.0012,
      heavy: 2.5,
      bands: [{ f: 2400, q: 1, g: 1, spread: 0.4 }],
    }),
  );
}

/** entity.firework_rocket.blast and large_blast: close by, the pop and its echo off the land */
function blast(big: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    let out = alloc(big ? 2.6 : 1.4, sr);
    pop(out, sr, rng, big);
    softClip(out, big ? 2 : 1.6);
    out = reverb(out, sr, { t60: big ? 2.4 : 1.5, wet: big ? 0.45 : 0.35, hf: 0.35, size: 2.2, pre: 0.03, lowcut: 90, tail: big ? 1.6 : 1.1 });
    echo(out, sr, big ? 0.34 : 0.27, 0.3, 0.3, 2400);
    return out;
  };
}

/** entity.firework_rocket.blast_far and large_blast_far: from far off, the highs gone, the crack blunted, mostly echo */
function blastFar(big: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    let out = alloc(big ? 3 : 1.8, sr);
    pop(out, sr, rng, big);
    lowpass(out, big ? 650 : 1100, sr);
    lowpass(out, big ? 900 : 1500, sr);
    // (softened: the sharpest edge of the attack smeared by the distance)
    lowpass(out, big ? 2000 : 3000, sr);
    out = reverb(out, sr, { t60: big ? 3.2 : 2.2, wet: 0.9, dry: 0.55, hf: 0.25, size: 3, pre: 0.06, lowcut: 60, tail: big ? 2.2 : 1.6 });
    echo(out, sr, big ? 0.45 : 0.38, 0.4, 0.45, 1200);
    return out;
  };
}

/** a scatter of crackles, dense at first and thinning out over `dur` (a star burning out) */
function crackle(out: Float32Array, sr: number, rng: Rng, dur: number, peakRate: number, bright: number): void {
  // (the first a loud one straight away, as the stars catch)
  let t = rng.range(0.001, 0.004);
  for (let first = true; t < dur; first = false, t += -Math.log(1 - rng.next()) / peakRate) {
    // (thinned: fewer as it goes, as the stars go out one by one)
    const keep = Math.exp(-t / (dur * 0.38)) * (t < 0.05 ? t / 0.05 : 1);
    if (!first && rng.next() > keep) continue;
    const a = first ? 0.85 + 0.15 * rng.next() : 0.2 + 0.8 * Math.pow(rng.next(), 2);
    impact(out, sr, rng, {
      t,
      modes: [rng.range(1800, 4200) * bright, a * 0.5, 0.006, rng.range(4200, 7500) * bright, a * 0.3, 0.004],
      noise: a * 1.4,
      noiseTau: rng.range(0.00015, 0.0007),
      noiseBp: [rng.range(2500, 7000) * bright, 0.9],
    });
  }
}

/** entity.firework_rocket.twinkle */
function twinkle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2, sr);
  layer(out, 1, (b) => crackle(b, sr, rng, 1.9, 140, 1));
  // the sizzle under it
  layer(out, 0.18, (b) => {
    const w = pink(b.length, rng);
    const f = new SVF(5000, 0.9, sr);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      b[i] = f.band(w[i]) * (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) / 0.6));
    }
  });
  return out;
}

/** entity.firework_rocket.twinkle_far */
function twinkleFar(c: Ctx): Float32Array {
  const { sr, rng } = c;
  let out = alloc(2.2, sr);
  layer(out, 1, (b) => crackle(b, sr, rng, 2, 90, 0.6));
  lowpass(out, 2600, sr);
  out = reverb(out, sr, { t60: 1.6, wet: 0.8, dry: 0.6, hf: 0.3, size: 2.5, pre: 0.04, tail: 1 });
  return out;
}

export function fireworkSounds(): Record<string, SoundGen> {
  return {
    'entity.firework_rocket.launch': sound('entity.firework_rocket.launch', 1, launch, { fadeOut: 0.1 }),
    'entity.firework_rocket.blast': sound('entity.firework_rocket.blast', 1, blast(false), { fadeOut: 0.2 }),
    'entity.firework_rocket.large_blast': sound('entity.firework_rocket.large_blast', 1, blast(true), { fadeOut: 0.3 }),
    'entity.firework_rocket.blast_far': sound('entity.firework_rocket.blast_far', 1, blastFar(false), { fadeOut: 0.3 }),
    'entity.firework_rocket.large_blast_far': sound('entity.firework_rocket.large_blast_far', 1, blastFar(true), { fadeOut: 0.4 }),
    'entity.firework_rocket.twinkle': sound('entity.firework_rocket.twinkle', 1, twinkle, { fadeOut: 0.15 }),
    'entity.firework_rocket.twinkle_far': sound('entity.firework_rocket.twinkle_far', 1, twinkleFar, { fadeOut: 0.2 }),
  };
}
