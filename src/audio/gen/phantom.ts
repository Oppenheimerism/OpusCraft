// The phantom (remaining mobs: the phantom; vanilla entity.phantom.*). Its voice is a thin, rasping screech from high
// in the night sky, hollow and echoing: a pressed cry whose note fights with the one an octave under it, breath
// hissing through it, rising and wailing away into its echo. Hurt, it shrieks short and harsh; dying, the screech
// breaks up and falls away. Starting a swoop it screams down out of the sky with the wind rushing over its wings;
// biting, its jaws snap shut with a dry crunch. Each wingbeat is a slow, leathery whump of air.
// Takes: ambient 5, bite 2, death 3, flap 6, hurt 3, swoop 4.

import type { SoundGen } from '../synth';
import { TAU, alloc, envAD, envBump, envExpPts, envPts, highpass, layer, reverb, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, sweep, thump } from './texture';
import { voice } from './voice';

interface CryOpts {
  t?: number;
  dur: number;
  /** the note (Hz) over the cry, x from 0 to 1 */
  f: (x: number) => number;
  /** its level over the cry, x from 0 to 1 */
  amp: (x: number) => number;
  /** how much the octave under fights the note (period doubling), 0..1 */
  rough?: number;
  /** the breath hissing through it, relative to the voice */
  rasp?: number;
}

/**
 * the phantom's cry into `out`: a pressed, thin voice (its throat's resonances high and wide, as a bird's or a bat's
 * rather than a beast's), rough with the octave under it and wavering, and a band of breath riding its upper notes
 */
function cryInto(out: Float32Array, c: Ctx, o: CryOpts): void {
  const { sr, rng } = c;
  const t0 = o.t ?? 0, d = o.dur, rough = o.rough ?? 0.55;
  layer(out, 1, (b) =>
    voice(b, sr, rng, {
      t: t0,
      dur: d,
      f0: (t) => o.f(t / d),
      amp: (t) => o.amp(t / d),
      formants: [
        { f: (t) => 1100 + o.f(t / d) * 0.6, bw: 420, g: 1 },
        { f: 2350, bw: 520, g: 0.85 },
        { f: 3600, bw: 800, g: 0.5 },
        { f: 5200, bw: 1200, g: 0.2 },
      ],
      oq: 0.28,
      jitter: 0.05,
      shimmer: 0.28,
      rough,
      sub: 0.18 + 0.2 * rough,
      breath: 0.35,
      growl: [rng.range(26, 38), 0.3 + 0.3 * rough],
      vib: [rng.range(5, 7.5), 0.03],
    }),
  );
  layer(out, 0.32 * (o.rasp ?? 1), (b) => sweep(b, sr, rng, { t: t0, dur: d, f: (t) => o.f(t / d) * 3.1, q: 3.5, amp: (t) => o.amp(t / d) }));
}

/** the night air it's heard through: a hollow, far echo, the lows thinned */
function hollow(out: Float32Array, sr: number, wet: number, t60 = 1.3): Float32Array {
  highpass(out, 280, sr);
  return reverb(out, sr, { t60, hf: 0.35, size: 1.9, pre: 0.035, wet, dry: 1, tail: t60 * 0.7, lowcut: 300, highcut: 5500 });
}

/** a shape of pitch over a cry: points [x, ratio, …], gliding from one to the next in even musical steps */
function contour(base: number, pts: readonly number[]): (x: number) => number {
  return (x) => base * envExpPts(x, pts);
}

/** the ambient takes' pitch shapes (x, ratio): a wail up and away, a two-part cry, a falling one, a wavering one, a short call */
const AMBIENT_SHAPES: readonly (readonly number[])[] = [
  [0, 0.8, 0.25, 1.15, 0.6, 1.05, 1, 0.7],
  [0, 0.95, 0.2, 1.2, 0.42, 0.85, 0.55, 1.1, 1, 0.75],
  [0, 1.25, 0.3, 1.1, 1, 0.65],
  [0, 0.9, 0.2, 1.1, 0.4, 0.95, 0.6, 1.12, 0.8, 0.95, 1, 0.8],
  [0, 0.85, 0.35, 1.2, 1, 0.9],
];

/** vanilla entity.phantom.ambient: its screech, far overhead */
function phantomAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const shape = AMBIENT_SHAPES[v % AMBIENT_SHAPES.length];
  const d = v === 4 ? rng.range(0.45, 0.55) : rng.range(0.85, 1.2);
  const out = alloc(d + 0.1, sr);
  const f = contour(rng.range(640, 780), shape);
  cryInto(out, c, { t: 0.01, dur: d, f, amp: (x) => envPts(x, [0, 0, 0.1, 1, 0.65, 0.85, 1, 0]) * (0.85 + 0.15 * Math.sin(TAU * 3 * x)), rough: rng.range(0.45, 0.7) });
  return hollow(out, sr, 0.45);
}

/** vanilla entity.phantom.hurt: a short, harsh shriek */
function phantomHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.28, 0.38);
  const out = alloc(d + 0.1, sr);
  const f = contour(rng.range(820, 950), [0, 1.1, 0.2, 1.3, 1, 0.8]);
  cryInto(out, c, { t: 0.005, dur: d, f, amp: (x) => envPts(x, [0, 0, 0.08, 1, 0.5, 0.8, 1, 0]), rough: 0.75, rasp: 1.4 });
  layer(out, 0.3, (b) => burst(b, sr, rng, { t: 0.005, dur: 0.06, attack: 0.002, tau: 0.015, bp: [3200, 1.2] }));
  return hollow(out, sr, 0.3, 0.9);
}

/** vanilla entity.phantom.death: the screech breaks up and falls away, a last rattle of breath */
function phantomDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.1, 1.4);
  const out = alloc(d + 0.2, sr);
  const f0 = rng.range(760, 880);
  const f = (x: number): number => f0 * (1.2 - 0.75 * smooth(x)) * (1 + 0.05 * Math.sin(TAU * 9 * x));
  // (it breaks: dips in the cry, closer together as it goes)
  const gaps: number[] = [];
  for (let x = rng.range(0.2, 0.3); x < 0.9; x += rng.range(0.08, 0.16) * (1 - 0.5 * x)) gaps.push(x);
  const amp = (x: number): number => {
    let g = envBump(x, 0.06, 0.94) * (1 - 0.45 * x);
    for (const x0 of gaps) g *= 1 - 0.7 * Math.exp(-(((x - x0) / 0.02) ** 2));
    return g;
  };
  cryInto(out, c, { t: 0.01, dur: d, f, amp, rough: 0.8, rasp: 1.3 });
  layer(out, 0.2, (b) => burst(b, sr, rng, { t: d * 0.7, dur: 0.45, attack: 0.12, tau: 0.1, bp: [1400, 0.9] }));
  return hollow(out, sr, 0.5, 1.2);
}

/**
 * vanilla entity.phantom.swoop: the scream as it dives, rising, held and bending down past you, and the wind of its
 * dive rushing over its wings
 */
function phantomSwoop(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = rng.range(1.3, 1.7);
  const out = alloc(d + 0.2, sr);
  const f0 = rng.range(700, 820);
  const bend = v % 2 === 0 ? 0.62 : 0.7;
  const f = contour(f0, [0, 0.85, 0.2, 1.25, 0.55, 1.2, 1, bend]);
  cryInto(out, c, { t: 0.005, dur: d * 0.9, f, amp: (x) => envPts(x, [0, 0.35, 0.1, 1, 0.6, 0.9, 1, 0]), rough: 0.6, rasp: 1.2 });
  // (the rush of air: a whoosh, brighter as it comes nearer, darker going by)
  layer(out, 0.42, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => 600 + 2600 * envPts(t / d, [0, 0.3, 0.5, 1, 1, 0.2]),
      q: 1.2,
      amp: (t) => envPts(t / d, [0, 0, 0.35, 0.6, 0.55, 1, 1, 0]),
      color: 'pink',
    }),
  );
  return hollow(out, sr, 0.4, 1.1);
}

/** vanilla entity.phantom.bite: its jaws snapping shut, a dry crunch and a short hiss */
function phantomBite(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  // (the snap: a hard click of teeth on teeth)
  layer(out, 1, (b) => impact(b, sr, rng, { t: 0.01, modes: [rng.range(1700, 2100), 1, 0.02, rng.range(3300, 3900), 0.6, 0.012], noise: 1, noiseTau: 0.002, noiseBp: [4200, 0.9] }));
  // (the crunch of what's caught)
  layer(out, 0.55, (b) => burst(b, sr, rng, { t: 0.012, dur: 0.1, attack: 0.001, tau: 0.02, bp: [rng.range(1300, 1700), 0.8], env: (t) => 0.6 + 0.4 * Math.sin(TAU * 90 * t) }));
  layer(out, 0.45, (b) => thump(b, sr, { t: 0.01, f0: 190, f1: 110, tau: 0.03 }));
  // (the hiss after)
  layer(out, 0.2, (b) => burst(b, sr, rng, { t: 0.05, dur: 0.22, attack: 0.02, tau: 0.06, bp: [3000, 1] }));
  return out;
}

/**
 * vanilla entity.phantom.flap: one slow wingbeat, a leathery whump of air pushed down and the membrane's crack as it
 * pulls taut
 */
function phantomFlap(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.32, 0.42);
  const out = alloc(d + 0.08, sr);
  const f = rng.range(420, 560);
  // (the downstroke: air pushed, rising and falling)
  layer(out, 1, (b) =>
    sweep(b, sr, rng, { dur: d, f: (t) => f * (0.7 + 0.8 * envPts(t / d, [0, 0, 0.35, 1, 1, 0.3])), q: 0.9, amp: (t) => envPts(t / d, [0, 0, 0.3, 1, 0.55, 0.45, 1, 0]), color: 'pink' }),
  );
  // (the body of it, low)
  layer(out, 0.5, (b) => thump(b, sr, { t: d * 0.25, f0: 95, f1: 65, tau: 0.05, attack: 0.02 }));
  // (the membrane snapping taut at the bottom of the stroke)
  layer(out, 0.35, (b) => burst(b, sr, rng, { t: d * 0.3, dur: 0.04, attack: 0.002, tau: 0.008, bp: [rng.range(1800, 2400), 1.4] }));
  // (and air spilling off its edge)
  layer(out, 0.25, (b) => burst(b, sr, rng, { t: d * 0.35, dur: d * 0.6, attack: 0.02, tau: 0.08, bp: [3200, 0.8], env: (t) => envAD(t, 0.02, 0.1) }));
  return out;
}

export function phantomSounds(): Record<string, SoundGen> {
  const n = 'entity.phantom.';
  return {
    [n + 'ambient']: sound(n + 'ambient', 5, phantomAmbient),
    [n + 'bite']: sound(n + 'bite', 2, phantomBite),
    [n + 'death']: sound(n + 'death', 3, phantomDeath),
    [n + 'flap']: sound(n + 'flap', 6, phantomFlap),
    [n + 'hurt']: sound(n + 'hurt', 3, phantomHurt),
    [n + 'swoop']: sound(n + 'swoop', 4, phantomSwoop),
  };
}
