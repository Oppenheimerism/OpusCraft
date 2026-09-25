// The turtle's sounds (Stage 5: ocean, M6), synthesized. A grown turtle ashore gives soft, breathy little squeaks;
// it paddles through the water with a slow swish and a few bubbles, and shuffles over the sand with a heavy scrape
// (a baby's lighter and higher). Hurt, it squawks; dying, it lets out a sinking groan (a baby's are thin and high). It
// lays its eggs with a soft, sandy plop. An egg cracks with a dry little tick, hatches in a crumble of shell and a pop,
// and crushed, breaks with a wet crunch; a zombie stamping on eggs makes a heavy crunching stomp.

import type { SoundGen } from '../synth';
import { alloc, envBump, envPts, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, sweep, thump, ticks } from './texture';
import { voice } from './voice';
import { reverbHalf } from './world';

/** a turtle's voice: a closed-mouthed, breathy squeak round `f0` (`bend`: how far it slides by the end) */
function squeak(b: Float32Array, sr: number, c: Ctx, t0: number, d: number, f0: number, bend: number, rough = 0.1): void {
  voice(b, sr, c.rng, {
    t: t0,
    dur: d,
    f0: (t) => f0 * (1 + bend * (t / d)) * (1 + 0.04 * Math.sin((Math.PI * t) / d)),
    amp: (t) => envBump(t, d * 0.25, d * 0.75),
    formants: [
      { f: f0 * 1.9, bw: 160, g: 1 },
      { f: 1350, bw: 220, g: 0.45 },
      { f: 2600, bw: 380, g: 0.15 },
    ],
    oq: 0.55,
    jitter: 0.02,
    shimmer: 0.08,
    breath: 0.35,
    rough,
  });
}

/** vanilla entity.turtle.ambient_land: one or two soft squeaks, the second a little lower */
function ambientLand(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => {
    const f0 = rng.range(330, 430);
    const d = rng.range(0.14, 0.24);
    squeak(b, sr, c, 0, d, f0, rng.range(-0.15, 0.25));
    if (rng.chance(0.6)) squeak(b, sr, c, d + rng.range(0.06, 0.14), d * 0.8, f0 * 0.88, rng.range(-0.25, 0.05));
  });
  return out;
}

/** vanilla entity.turtle.hurt(_baby): a squawk, higher and thinner from a baby */
function hurt(baby: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const out = alloc(0.35, sr);
    layer(out, 1, (b) => squeak(b, sr, c, 0, rng.range(0.14, 0.2), rng.range(520, 640) * (baby ? 2 : 1), rng.range(-0.35, -0.15), 0.35));
    return out;
  };
}

/** vanilla entity.turtle.death(_baby): a groan sinking away, and a last breath */
function death(baby: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const d = baby ? 0.45 : 0.8;
    const out = alloc(d + 0.3, sr);
    layer(out, 1, (b) => {
      squeak(b, sr, c, 0, d, rng.range(430, 500) * (baby ? 2 : 1), -0.45, 0.3);
      sweep(b, sr, rng, { t: d * 0.7, dur: 0.3, f: (t) => 900 - 1200 * t, q: 1.2, amp: (t) => 0.3 * envBump(t, 0.05, 0.25), color: 'pink' });
    });
    return out;
  };
}

/** vanilla entity.turtle.shamble(_baby): a heavy flipper dragged over the sand, a soft thump as it lands */
function shamble(baby: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const k = baby ? 1.8 : 1;
    const d = rng.range(0.16, 0.24) / k;
    const out = alloc(d + 0.15, sr);
    layer(out, 1, (b) => {
      burst(b, sr, rng, { dur: d, attack: d * 0.35, tau: d * 0.5, bp: [rng.range(1400, 2200) * k, 0.8], amp: 0.8 });
      ticks(b, sr, rng, { dur: d, rate: 90, energy: (t) => envBump(t, d * 0.3, d * 0.7), f: [2500 * k, 6000 * k], t60: [0.004, 0.012], amp: 0.35, click: 0.4 });
      thump(b, sr, { t: d * 0.55, f0: 140 * k, f1: 80 * k, tau: 0.03, amp: 0.7 });
    });
    return out;
  };
}

/** vanilla entity.turtle.swim: a slow stroke of the flippers, the water swirling past, a few bubbles */
function swim(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.45, 0.65);
  const out = alloc(d + 0.2, sr);
  const f0 = rng.range(300, 420);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 * (1 + 1.2 * Math.sin((Math.PI * t) / d)), q: 1.1, amp: (t) => envPts(t / d, [0, 0, 0.3, 1, 0.7, 0.6, 1, 0]), color: 'pink' }));
  layer(out, 0.35, (b) => {
    for (let k = 0; k < 4; k++) bubble(b, sr, rng.range(0.05, d), rng.logRange(350, 1200), rng.range(0.3, 1), undefined, 0.4);
  });
  lowpass(out, 2600, sr);
  return reverbHalf(out, sr, { t60: 0.6, wet: 0.2, dry: 1 });
}

/** vanilla entity.turtle.lay_egg: a soft, sandy plop, and the sand trickling back */
function layEgg(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  layer(out, 1, (b) => {
    thump(b, sr, { f0: 260, f1: 150, glide: 0.02, tau: 0.04, amp: 1, h2: 0.3 });
    bubble(b, sr, 0.004, rng.range(420, 520), 0.5, 0.03, 0.9);
    ticks(b, sr, rng, { t: 0.05, dur: 0.4, rate: 110, energy: (t) => Math.exp(-t / 0.15), f: [3000, 7000], t60: [0.003, 0.008], amp: 0.3, click: 0.5 });
  });
  return out;
}

/** a thin shell cracking: `n` dry little snaps */
function shellSnaps(b: Float32Array, sr: number, c: Ctx, t0: number, n: number, span: number): void {
  const { rng } = c;
  for (let i = 0; i < n; i++)
    impact(b, sr, rng, { t: t0 + (span * i) / Math.max(1, n - 1) + rng.range(0, 0.012), modes: [rng.range(2600, 3600), 1, 0.012, rng.range(5200, 6800), 0.5, 0.008], jitter: 0.1, noise: 1.2, noiseTau: 0.0012, noiseBp: [5000, 0.9], gain: rng.range(0.5, 1) });
}

/** vanilla entity.turtle.egg_crack: a dry little tick, a crack or two running through the shell, a few flakes after */
function eggCrack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  layer(out, 1, (b) => {
    shellSnaps(b, sr, c, 0, 1 + rng.int(3), 0.08);
    ticks(b, sr, rng, { t: 0.03, dur: 0.16, rate: 60, energy: (t) => Math.exp(-t / 0.08), f: [3500, 8000], t60: [0.003, 0.008], amp: 0.25, click: 0.3 });
  });
  return out;
}

/** vanilla entity.turtle.egg_hatch: the shell crumbling open and a soft pop as the baby pushes out */
function eggHatch(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => {
    shellSnaps(b, sr, c, 0, 3 + rng.int(3), 0.22);
    ticks(b, sr, rng, { t: 0.1, dur: 0.35, rate: 70, energy: (t) => Math.exp(-t / 0.2), f: [2500, 6000], t60: [0.004, 0.01], amp: 0.4, click: 0.3 });
    bubble(b, sr, 0.3, rng.range(500, 650), 0.6, 0.025, 0.8);
  });
  return out;
}

/** vanilla entity.turtle.egg_break: crushed — the shell crunching and a wet squish */
function eggBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 1, (b) => {
    shellSnaps(b, sr, c, 0, 4 + rng.int(3), 0.06);
    sweep(b, sr, rng, { t: 0.02, dur: 0.2, f: (t) => 1600 - 4000 * t, q: 4, amp: (t) => 0.6 * envBump(t, 0.01, 0.18), color: 'white' });
    bubble(b, sr, 0.03, rng.range(700, 900), 0.4, 0.02, 0.6);
  });
  return out;
}

/** vanilla entity.zombie.destroy_egg: a heavy foot stamping down on the eggs, a crunch under it */
function zombieDestroyEgg(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => {
    thump(b, sr, { f0: 120, f1: 60, glide: 0.02, tau: 0.05, amp: 1, h2: 0.2 });
    burst(b, sr, rng, { dur: 0.1, tau: 0.03, bp: [900, 0.9], amp: 0.6 });
    shellSnaps(b, sr, c, 0.005, 2 + rng.int(2), 0.05);
  });
  return out;
}

export function turtleSounds(): Record<string, SoundGen> {
  const n = 'entity.turtle.';
  return {
    [n + 'ambient_land']: sound(n + 'ambient_land', 3, ambientLand),
    [n + 'hurt']: sound(n + 'hurt', 5, hurt(false)),
    [n + 'hurt_baby']: sound(n + 'hurt_baby', 2, hurt(true)),
    [n + 'death']: sound(n + 'death', 2, death(false)),
    [n + 'death_baby']: sound(n + 'death_baby', 2, death(true)),
    [n + 'shamble']: sound(n + 'shamble', 4, shamble(false)),
    [n + 'shamble_baby']: sound(n + 'shamble_baby', 5, shamble(true)),
    [n + 'swim']: sound(n + 'swim', 5, swim),
    [n + 'lay_egg']: sound(n + 'lay_egg', 1, layEgg),
    [n + 'egg_crack']: sound(n + 'egg_crack', 5, eggCrack),
    [n + 'egg_hatch']: sound(n + 'egg_hatch', 3, eggHatch),
    [n + 'egg_break']: sound(n + 'egg_break', 2, eggBreak),
    'entity.zombie.destroy_egg': sound('entity.zombie.destroy_egg', 3, zombieDestroyEgg),
  };
}
