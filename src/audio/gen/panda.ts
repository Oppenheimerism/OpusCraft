// Pandas (remaining mobs: the panda; vanilla entity.panda.*) and bamboo's own sounds (vanilla block.bamboo.*,
// block.bamboo_sapling.*). A panda's voice is a soft, nasal bleat out of a big round chest. Idle, it snuffles and
// bleats mildly once or twice; an aggressive panda's bleat has a growl in it; a worried one whimpers, thin and
// wavering. Offered bamboo it won't breed on (no bamboo about), it grumbles through its nose. Hurt, it squeals a short
// bleat; dying, a long one sags into a moan. Its bite is a snap of the jaws and a grunt. Eating, it crunches through
// bamboo, woody cracks and chewing. A cub about to sneeze draws its breath in twice, and sneezes in a squeaky burst.
// Its paws pad down heavily and softly. Bamboo: a stalk knocks hollow, woody and ringing, its leaves rustling (placed
// and broken; stepped on, a lighter tap); a shoot goes in and out with a soft crunch of leaves and earth.
// Takes: ambient 5, aggressive_ambient 4, bite 3, cant_breed 5, death 2, eat 5, hurt 3, pre_sneeze 1, sneeze 3,
// step 5, worried_ambient 3; block.bamboo.place (its break too) 6, step 6; block.bamboo_sapling.place (its break
// too) 6, hit 5.

import type { SoundGen } from '../synth';
import { alloc, envBump, highpass, layer, lowpass, smooth } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { burst, impact, phisem, sweep, thump, ticks, twoBump } from './texture';
import { voice } from './voice';

interface BleatOpts {
  /** how far the note swells over its first third, and sags over its end (fractions) */
  rise?: number;
  fall?: number;
  /** 0 a closed-mouthed hum through the nose, 1 wide open */
  open?: number;
  /** a growl rattling it (0..1); without one it has the bleat's own quaver */
  growl?: number;
  breath?: number;
  rough?: number;
  vib?: [number, number];
  /** how long it takes to come in (a fraction of it) */
  attack?: number;
  gain?: number;
}

/**
 * a panda's voice into `out` from `t0` for `d` s on the note `f`: nasal (a low murmur and a narrow resonance over the
 * mouth's), quavering as a bleat does unless it growls
 */
function bleatInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, o: BleatOpts = {}): void {
  const { sr, rng } = c;
  const rise = o.rise ?? 0.12, fall = o.fall ?? 0.2, open = o.open ?? 0.4;
  const mouth = (t: number): number => open * Math.sin(Math.PI * Math.min(1, t / d));
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (1 + rise * smooth(x / 0.3) - (rise + fall) * smooth((x - 0.45) / 0.55));
    },
    amp: (t) => envBump(t, d * (o.attack ?? 0.12), d * (1 - (o.attack ?? 0.12))),
    formants: [
      { f: 260, bw: 90, g: 0.5 * (1 - open * 0.6) },
      { f: (t) => 480 + 380 * mouth(t), bw: 170, g: 1 },
      { f: (t) => 1250 + 350 * mouth(t), bw: 240, g: 0.55 },
      { f: 2700, bw: 480, g: 0.12 + 0.2 * open },
    ],
    oq: 0.55 - 0.18 * open,
    jitter: 0.03,
    shimmer: 0.14,
    rough: o.rough ?? 0.22,
    sub: 0.06,
    growl: o.growl ? [rng.range(22, 30), o.growl] : [rng.range(7, 10), 0.3],
    breath: o.breath ?? 0.18,
    vib: o.vib,
    gain: o.gain ?? 1,
  });
}

/** a breath through the nose into `out` at `t0`: a snuffle (out) or a sniff (in, rising) */
function snuffleInto(out: Float32Array, c: Ctx, t0: number, d: number, amp: number, inward = false): void {
  const { sr, rng } = c;
  const f0 = rng.range(900, 1300);
  sweep(out, sr, rng, {
    t: t0,
    dur: d,
    f: (t) => f0 * (inward ? 1 + 0.6 * (t / d) : 1.2 - 0.4 * (t / d)),
    q: 2.2,
    amp: (t) => amp * envBump(t, d * (inward ? 0.3 : 0.15), d * (inward ? 0.7 : 0.85)),
    color: 'pink',
  });
}

/** vanilla entity.panda.ambient: a snuffle, and a mild bleat or two */
function pandaAmbient(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(1.3, sr);
  let t = 0.01;
  if (rng.chance(0.7)) {
    const d = rng.range(0.14, 0.22);
    snuffleInto(out, c, t, d, 0.5);
    t += d + rng.range(0.05, 0.12);
  }
  for (let i = 0, n = 1 + rng.int(2); i < n; i++) {
    const d = rng.range(0.28, 0.42);
    bleatInto(out, c, t, d, rng.range(190, 240) * (i ? 0.92 : 1), { open: rng.range(0.25, 0.5) });
    t += d + rng.range(0.07, 0.14);
  }
  highpass(out, 70, sr);
  return out;
}

/** vanilla entity.panda.aggressive_ambient: a rough, growling bleat */
function pandaAggressive(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.5, 0.7);
  const out = alloc(d + 0.15, sr);
  bleatInto(out, c, 0.01, d, rng.range(150, 185), { rise: 0.18, fall: 0.3, open: 0.6, growl: rng.range(0.45, 0.6), rough: 0.5, breath: 0.3, gain: 1.1 });
  highpass(out, 60, sr);
  return out;
}

/** vanilla entity.panda.worried_ambient: a thin, wavering whimper */
function pandaWorried(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(1.0, sr);
  let t = 0.01;
  for (let i = 0, n = 1 + rng.int(2); i < n; i++) {
    const d = rng.range(0.3, 0.45);
    bleatInto(out, c, t, d, rng.range(300, 360), { rise: 0.2, fall: 0.35, open: 0.2, breath: 0.35, rough: 0.12, vib: [rng.range(6, 8), 0.05] });
    t += d + rng.range(0.06, 0.12);
  }
  highpass(out, 120, sr);
  return out;
}

/** vanilla entity.panda.cant_breed: a grumble through the nose, and a huff */
function pandaCantBreed(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.9, sr);
  const d = rng.range(0.35, 0.5);
  bleatInto(out, c, 0.01, d, rng.range(140, 170), { rise: 0.05, fall: 0.3, open: 0.05, growl: 0.25, breath: 0.25 });
  snuffleInto(out, c, 0.01 + d * 0.8, rng.range(0.18, 0.26), 0.6);
  highpass(out, 60, sr);
  return out;
}

/** vanilla entity.panda.hurt: a short, squealing bleat */
function pandaHurt(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.22, 0.3);
  const out = alloc(d + 0.1, sr);
  bleatInto(out, c, 0.005, d, rng.range(330, 400), { rise: 0.3, fall: 0.35, open: 0.9, growl: 0.2, rough: 0.4, breath: 0.25, gain: 1.2 });
  highpass(out, 100, sr);
  return out;
}

/** vanilla entity.panda.death: a long bleat sagging into a moan */
function pandaDeath(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.9, 1.15);
  const out = alloc(d + 0.2, sr);
  bleatInto(out, c, 0.01, d, rng.range(250, 290), { rise: 0.15, fall: 0.55, open: 0.7, growl: 0.3, rough: 0.45, breath: 0.3, attack: 0.05, gain: 1.1 });
  highpass(out, 60, sr);
  return out;
}

/** vanilla entity.panda.bite: its jaws snapping shut, with a grunt */
function pandaBite(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      t: 0.03,
      modes: [rng.range(900, 1200), 0.6, 0.02, rng.range(2200, 2800), 0.4, 0.012],
      noise: 1.2,
      noiseTau: 0.002,
      noiseBp: [3000, 0.9],
    }),
  );
  layer(out, 0.7, (b) => bleatInto(b, c, 0.01, 0.2, rng.range(150, 180), { rise: 0.1, fall: 0.3, open: 0.5, growl: 0.4, rough: 0.4 }));
  highpass(out, 70, sr);
  return out;
}

/** a bite through a bamboo stalk into `out` at `t0`: a woody crack and the splinters' crunch */
function crunchInto(out: Float32Array, c: Ctx, t0: number, amp: number): void {
  const { sr, rng } = c;
  const f = rng.range(900, 1500);
  impact(out, sr, rng, { t: t0, modes: [f, 0.7 * amp, 0.025, f * 2.6, 0.4 * amp, 0.015], jitter: 0.04, noise: amp, noiseTau: 0.0015, noiseBp: [2600, 0.8] });
  phisem(out, sr, rng, {
    t: t0,
    dur: 0.16,
    rate: 2500,
    energy: (t) => (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.035),
    grain: 0.0009,
    heavy: 2.5,
    bands: [
      { f: 2200, q: 2, g: 1, spread: 0.4 },
      { f: 4200, q: 2, g: 0.6, spread: 0.3 },
      { f: 900, q: 2, g: 0.4, spread: 0.3 },
    ],
    gain: amp,
  });
}

/** vanilla entity.panda.eat: crunching through bamboo, and chewing */
function pandaEat(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.75, sr);
  let t = 0.005;
  for (let i = 0, n = 2 + rng.int(3); i < n; i++) {
    crunchInto(out, c, t, i ? rng.range(0.5, 0.8) : 1);
    const tt = t;
    layer(out, 0.25, (b) => thump(b, sr, { t: tt, f0: rng.range(110, 140), f1: 80, glide: 0.02, tau: 0.03 }));
    t += rng.range(0.11, 0.17);
  }
  highpass(out, 60, sr);
  return out;
}

/** vanilla entity.panda.pre_sneeze: a breath drawn in, twice, the second catching on a squeak */
function pandaPreSneeze(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.9, sr);
  snuffleInto(out, c, 0.005, 0.22, 0.7, true);
  snuffleInto(out, c, 0.36, 0.3, 0.8, true);
  bleatInto(out, c, 0.4, 0.26, rng.range(420, 480), { rise: 0.35, fall: -0.1, open: 0.5, breath: 0.6, gain: 0.5 });
  highpass(out, 150, sr);
  return out;
}

/** vanilla entity.panda.sneeze: a sharp burst of breath and a squeak (a cub's) */
function pandaSneeze(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.5, sr);
  burst(out, sr, rng, { t: 0.005, dur: 0.35, attack: 0.004, tau: 0.06, bp: [rng.range(2600, 3400), 0.9], amp: 1 });
  burst(out, sr, rng, { t: 0.005, dur: 0.2, attack: 0.002, tau: 0.025, lp: 900, amp: 0.5, color: 'brown' });
  layer(out, 0.55, (b) => bleatInto(b, c, 0.01, 0.2, rng.range(520, 620), { rise: 0.05, fall: 0.4, open: 0.8, breath: 0.4 }));
  highpass(out, 120, sr);
  return out;
}

/** vanilla entity.panda.step: a heavy, soft pad of a paw */
function pandaStep(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.25, sr);
  thump(out, sr, { f0: rng.range(95, 120), f1: rng.range(60, 75), glide: 0.035, tau: 0.028, amp: 0.9 });
  burst(out, sr, rng, { t: 0.004, dur: 0.12, tau: 0.03, lp: 1500, amp: 0.4, color: 'brown' });
  return out;
}

// ------------------------------------------------------------------ bamboo

/** a knock on a hollow stalk into `out` at `t0`: a tube's ringing (its bending modes, 1 : 2.76 : 5.4) and the tap */
function knockInto(out: Float32Array, c: Ctx, t0: number, f: number, amp: number): void {
  const { sr, rng } = c;
  impact(out, sr, rng, {
    t: t0,
    modes: [f, 1, 0.06, f * 2.76, 0.5, 0.035, f * 5.4, 0.22, 0.02],
    jitter: 0.03,
    noise: 0.9,
    noiseTau: 0.0018,
    noiseBp: [2800, 0.9],
    gain: amp,
  });
}

/** its leaves stirring into `out` at `t0` */
function rustleInto(out: Float32Array, c: Ctx, t0: number, d: number, amp: number): void {
  const { sr, rng } = c;
  phisem(out, sr, rng, {
    t: t0,
    dur: d,
    rate: 7000,
    energy: (t) => (1 - Math.exp(-t / 0.01)) * Math.exp(-t / (d * 0.3)),
    grain: 0.0007,
    heavy: 2.2,
    bands: [
      { f: 3600, q: 1.1, g: 1, spread: 0.35 },
      { f: 1900, q: 1.3, g: 0.6, spread: 0.3 },
      { f: 6000, q: 1.3, g: 0.3, spread: 0.2 },
    ],
    gain: amp,
  });
}

/** vanilla block.bamboo.place (and its break): a hollow knock, another off the stalk as it settles, the leaves */
function bambooPlace(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.45, sr);
  const f = rng.range(480, 700);
  knockInto(out, c, 0.004, f, 1);
  knockInto(out, c, rng.range(0.035, 0.06), f * rng.range(1.15, 1.35), rng.range(0.35, 0.55));
  rustleInto(out, c, 0.01, 0.35, 0.25);
  highpass(out, 90, sr);
  return out;
}

/** vanilla block.bamboo.step: a lighter hollow tap, a rustle */
function bambooStep(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.3, sr);
  knockInto(out, c, 0.003, rng.range(620, 880), 0.7);
  rustleInto(out, c, 0.005, 0.22, 0.2);
  highpass(out, 110, sr);
  return out;
}

/** vanilla block.bamboo_sapling.place (and its break): a shoot going into the earth, or out of it, leaves and all */
function saplingPlace(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.4, sr);
  const en = twoBump(0.01, 0.05, rng.range(0.05, 0.08), rng.range(0.4, 0.6), 0.012, 0.05);
  phisem(out, sr, rng, {
    dur: 0.35,
    rate: 6000,
    energy: en,
    grain: 0.0012,
    heavy: 2.4,
    bands: [
      { f: 1500, q: 1.2, g: 1, spread: 0.35 },
      { f: 700, q: 1.4, g: 0.6, spread: 0.3 },
      { f: 3600, q: 1.3, g: 0.4, spread: 0.25 },
    ],
  });
  rustleInto(out, c, 0.005, 0.3, 0.6);
  ticks(out, sr, rng, { dur: 0.25, rate: 60, energy: en, f: [1500, 4000], t60: [0.004, 0.01], click: 0.4, amp: 0.3 });
  lowpass(out, 9000, sr);
  return out;
}

/** vanilla block.bamboo_sapling.hit: a flick through its leaves */
function saplingHit(c: Ctx): Float32Array {
  const { sr } = c;
  const out = alloc(0.25, sr);
  rustleInto(out, c, 0.003, 0.2, 1);
  highpass(out, 400, sr);
  return out;
}

export function pandaSounds(): Record<string, SoundGen> {
  const bambooPlaceS = sound('block.bamboo.place', 6, bambooPlace);
  const bambooStepS = sound('block.bamboo.step', 6, bambooStep);
  const saplingPlaceS = sound('block.bamboo_sapling.place', 6, saplingPlace);
  return {
    'entity.panda.ambient': sound('entity.panda.ambient', 5, pandaAmbient),
    'entity.panda.aggressive_ambient': sound('entity.panda.aggressive_ambient', 4, pandaAggressive),
    'entity.panda.worried_ambient': sound('entity.panda.worried_ambient', 3, pandaWorried),
    'entity.panda.cant_breed': sound('entity.panda.cant_breed', 5, pandaCantBreed),
    'entity.panda.hurt': sound('entity.panda.hurt', 3, pandaHurt),
    'entity.panda.death': sound('entity.panda.death', 2, pandaDeath),
    'entity.panda.bite': sound('entity.panda.bite', 3, pandaBite),
    'entity.panda.eat': sound('entity.panda.eat', 5, pandaEat),
    'entity.panda.pre_sneeze': sound('entity.panda.pre_sneeze', 1, pandaPreSneeze),
    'entity.panda.sneeze': sound('entity.panda.sneeze', 3, pandaSneeze),
    'entity.panda.step': sound('entity.panda.step', 5, pandaStep),
    // vanilla SoundType.BAMBOO: breaks with its place samples; hit is the step at half pitch (as the game plays hits)
    'block.bamboo.break': bambooPlaceS,
    'block.bamboo.place': bambooPlaceS,
    'block.bamboo.step': bambooStepS,
    'block.bamboo.hit': pitched(bambooStepS, 0.5),
    'block.bamboo.fall': bambooStepS,
    // vanilla SoundType.BAMBOO_SAPLING: its own place (and break) and hit; the stalk's step and fall
    'block.bamboo_sapling.break': saplingPlaceS,
    'block.bamboo_sapling.place': saplingPlaceS,
    'block.bamboo_sapling.hit': pitched(sound('block.bamboo_sapling.hit', 5, saplingHit), 0.5),
    'block.bamboo_sapling.step': bambooStepS,
    'block.bamboo_sapling.fall': bambooStepS,
  };
}
