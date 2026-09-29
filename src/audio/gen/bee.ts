// Bees and their blocks (remaining mobs: the bee; vanilla entity.bee.*, block.beehive.*, and the sound types of the
// honey block and the coral block, the honeycomb block's). A bee is its wings: a buzz of many harmonics on a wingbeat
// of two hundred and some beats a second, wavering as it flies, with the air it pushes. Calm, the buzz is mellow and
// steady (the loop the game swells and fades with its speed); angry, it is higher, harsher and restless. Hurt, it
// buzzes up sharply; dying, its buzz sputters and sinks away; stinging, it jabs with a quick high whip; pollinating,
// it hums up contentedly among rustling petals. Inside a hive the buzzing is muffled by the wood: going in it closes
// over the bee, coming out it opens up, and at work it's a busy murmur with a scrape now and then. Shears cut the comb
// with a waxy crunch; honey drips thick and plops. The honey block is sticky: it squelches and peels, and sliding down
// its side is a slow, tacky stretch. The coral block (and the honeycomb block) is brittle and hollow, crunching.
// Takes: bee loop 1, loop_aggressive 1, hurt 3, death 2, sting 2, pollinate 4; beehive enter 2, exit 2, work 4, shear
// 2, drip 6; honey block break 5, step 5, place 5, hit 5, fall 2, slide 4; coral block break 4, step 6, place 4, hit 6,
// fall 2.

import type { SoundGen } from '../synth';
import { TAU, type Rng, SVF, alloc, envAD, envBump, layer, loopify, lowpass, nsamp, peakEq, sinCyc, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, creak, impact, phisem, sweep, thump } from './texture';

interface WingOpts {
  /** start time (s) */
  t?: number;
  dur: number;
  /** the wingbeat (Hz) over time */
  f: (t: number) => number;
  amp: (t: number) => number;
  /** how high the harmonics reach (Hz): brighter is angrier */
  top?: number;
  /** the harmonics' fall-off (1: a sawtooth's) */
  tilt?: number;
  /** a rasp: the wingbeat's random flutter (its standard deviation, a fraction) */
  rasp?: number;
  /** the air pushed with each stroke, 0..1 */
  air?: number;
}

/**
 * a bee's wings into `out`: a buzzing train of harmonics on the wingbeat (the odd ones a little stronger, as a
 * stroke up and a stroke down are not quite alike), with a breath of air pushed on each stroke
 */
function wingsInto(out: Float32Array, sr: number, rng: Rng, o: WingOpts): void {
  const s = Math.round((o.t ?? 0) * sr);
  const n = Math.min(out.length - s, Math.round(o.dur * sr));
  if (n <= 0) return;
  const top = o.top ?? 3200, tilt = o.tilt ?? 1.1, rasp = o.rasp ?? 0.01, air = o.air ?? 0.15;
  const K = 48;
  const wt = new Float64Array(K + 1);
  for (let k = 1; k <= K; k++) wt[k] = Math.pow(k, -tilt) * (k % 2 ? 1 : 0.75);
  // (the flutter: noise smoothed to 30 Hz, scaled to about unit deviation)
  const flK = Math.exp((-TAU * 30) / sr);
  const airBp = new SVF(1300, 0.7, sr);
  let fl = 0, ph = 0, f = o.f(0), a = o.amp(0);
  for (let i = 0; i < n; i++) {
    if ((i & 31) === 0) {
      const t = i / sr;
      f = o.f(t);
      a = o.amp(t);
    }
    fl = flK * fl + (1 - flK) * rng.bi();
    const fi = f * (1 + rasp * fl * 37);
    ph += fi / sr;
    if (ph >= 1) ph -= 1;
    const km = Math.min(K, top / fi);
    let y = 0;
    for (let k = 1; k <= km; k++) y += wt[k] * sinCyc(k * ph);
    // (the top harmonic faded in by how far under `top` it is, so a sliding pitch doesn't click harmonics in and out)
    const kt = Math.floor(km) + 1;
    if (kt <= K) y += wt[kt] * (km - kt + 1) * sinCyc(kt * ph);
    const stroke = 0.55 + 0.45 * sinCyc(ph);
    out[s + i] += (y * 0.35 + airBp.band(rng.bi()) * air * stroke) * a;
  }
}

/** the buzz's body: a nasal lift round 500 Hz and another round 1.6 kHz, and nothing much above `top` */
function body(b: Float32Array, sr: number, top: number): Float32Array {
  peakEq(b, 520, 1.2, 5, sr);
  peakEq(b, 1600, 1.5, 3, sr);
  return lowpass(b, top, sr);
}

/** slow wandering: a few sines at random phases, their sum within ±1 */
function wander(rng: Rng, rates: number[]): (t: number) => number {
  const ph = rates.map(() => rng.next() * TAU);
  const w = rates.map((_, i) => 1 / (i + 1));
  const sum = w.reduce((x, y) => x + y, 0);
  return (t) => {
    let v = 0;
    for (let i = 0; i < rates.length; i++) v += w[i] * Math.sin(TAU * rates[i] * t + ph[i]);
    return v / sum;
  };
}

// ---------------------------------------------------------------------------
// the bee

/**
 * vanilla entity.bee.loop / loop_aggressive: the bee's buzz, a seamless loop the game turns up and down with its
 * speed (vanilla BeeSoundInstance). Calm: a mellow wingbeat round 215 Hz, wavering gently. Angry: round 255 Hz,
 * brighter and rougher, its level and pitch restless.
 */
function buzzLoop(angry: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const L = 3.2, X = 0.3;
    const out = alloc(L + X, sr);
    const n = out.length;
    const f0 = angry ? 255 : 215;
    const pw = wander(rng, angry ? [0.9, 2.6, 6.1] : [0.45, 1.3, 3.7]);
    const aw = wander(rng, angry ? [1.7, 4.3, 9.5] : [0.6, 2.1]);
    const top = angry ? 5200 : 3000;
    layer(out, 1, (b) => {
      wingsInto(b, sr, rng, {
        dur: n / sr,
        f: (t) => f0 * (1 + (angry ? 0.045 : 0.025) * pw(t)),
        amp: (t) => 1 + (angry ? 0.22 : 0.1) * aw(t),
        top,
        tilt: angry ? 0.95 : 1.2,
        rasp: angry ? 0.018 : 0.006,
        air: angry ? 0.3 : 0.18,
      });
      body(b, sr, top);
    });
    return loopify(out, nsamp(X, sr));
  };
}

/** vanilla entity.bee.hurt: a sharp buzz up, "bzzt!", and down again */
function beeHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const d = rng.range(0.22, 0.32), f = rng.range(290, 340), peak = rng.range(1.35, 1.55);
  layer(out, 1, (b) => {
    wingsInto(b, sr, rng, {
      t: 0.005,
      dur: d,
      f: (t) => f * (1 + (peak - 1) * Math.sin(Math.PI * Math.min(1, (t / d) * 1.4))),
      amp: (t) => envBump(t, 0.02, d - 0.02),
      top: 5200,
      tilt: 0.95,
      rasp: 0.025,
      air: 0.35,
    });
    body(b, sr, 5500);
  });
  layer(out, 0.25, (b) => burst(b, sr, rng, { t: 0.005, dur: 0.05, attack: 0.001, tau: 0.01, bp: [3500, 1.2] }));
  return out;
}

/** vanilla entity.bee.death: the buzz sputters, stumbles and sinks away */
function beeDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.3, sr);
  const d = rng.range(0.85, 1.05), f = rng.range(300, 340);
  // stumbles: gaps in the wingbeat, closer together as it fails
  const gaps: number[] = [];
  for (let t = rng.range(0.15, 0.25); t < d - 0.1; t += rng.range(0.08, 0.2) * (1 - (0.6 * t) / d)) gaps.push(t);
  layer(out, 1, (b) => {
    wingsInto(b, sr, rng, {
      t: 0.005,
      dur: d,
      f: (t) => f * (1.1 - 0.62 * smooth(t / d)) * (1 + 0.04 * Math.sin(TAU * 7 * t)),
      amp: (t) => {
        let g = envBump(t, 0.03, d - 0.03) * (1 - 0.5 * (t / d));
        for (const t0 of gaps) g *= 1 - 0.75 * Math.exp(-(((t - t0) / 0.025) ** 2));
        return g;
      },
      top: 4200,
      tilt: 1,
      rasp: 0.03,
      air: 0.3,
    });
    body(b, sr, 4500);
  });
  return out;
}

/** vanilla entity.bee.sting: an angry buzz and a quick, high whip of a jab */
function beeSting(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  const f = rng.range(270, 300);
  layer(out, 0.7, (b) => {
    wingsInto(b, sr, rng, { dur: 0.2, f: (t) => f * (1 + 0.5 * (t / 0.2)), amp: (t) => envBump(t, 0.015, 0.17), top: 5500, tilt: 0.9, rasp: 0.03, air: 0.35 });
    body(b, sr, 6000);
  });
  layer(out, 1, (b) => sweep(b, sr, rng, { t: 0.1, dur: 0.09, f: (t) => 2500 + 6000 * smooth(t / 0.09), q: 3, amp: (t) => envAD(t, 0.012, 0.02) }));
  layer(out, 0.55, (b) => impact(b, sr, rng, { t: 0.155, modes: [rng.range(2600, 3100), 1, 0.03, rng.range(4700, 5300), 0.5, 0.02], noise: 0.8, noiseTau: 0.0015, noiseBp: [5000, 1] }));
  layer(out, 0.35, (b) => thump(b, sr, { t: 0.155, f0: 260, f1: 160, tau: 0.02 }));
  return out;
}

/** vanilla entity.bee.pollinate: a contented hum rising and settling, the flower's petals rustling */
function beePollinate(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  const d = rng.range(0.55, 0.75), f = rng.range(225, 250), up = rng.range(1.15, 1.3);
  layer(out, 1, (b) => {
    wingsInto(b, sr, rng, {
      t: 0.01,
      dur: d,
      f: (t) => f * (1 + (up - 1) * Math.sin(Math.PI * Math.min(1, (t / d) * 1.2))),
      amp: (t) => envBump(t, 0.08, d - 0.08),
      top: 3400,
      tilt: 1.15,
      rasp: 0.008,
      air: 0.2,
    });
    body(b, sr, 3600);
  });
  layer(out, 0.3, (b) =>
    phisem(b, sr, rng, {
      t: 0.05,
      dur: d,
      rate: 90,
      energy: (t) => envBump(t, 0.1, d - 0.2),
      grain: 0.004,
      bands: [
        { f: 2800, q: 1.5, g: 1, spread: 0.3 },
        { f: 5200, q: 2, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// the hive

/** a bee buzzing inside the wood: its wings with everything above `lp` Hz (over time) gone */
function muffledInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number, amp: (t: number) => number, lp: (t: number) => number): void {
  const { sr, rng } = c;
  const tmp = new Float32Array(b.length);
  wingsInto(tmp, sr, rng, { t: t0, dur: d, f: (t) => f * (1 + 0.03 * Math.sin(TAU * 1.3 * t)), amp, top: 3000, tilt: 1.1, rasp: 0.01, air: 0.15 });
  body(tmp, sr, 3200);
  // (a low-pass swept along: a state-variable filter retuned every 32 samples)
  const lpf = new SVF(lp(0), 0.8, sr);
  const s = Math.round(t0 * sr);
  for (let i = Math.max(0, s); i < b.length; i++) {
    if (((i - s) & 31) === 0) lpf.set(lp((i - s) / sr), 0.8, sr);
    b[i] += lpf.low(tmp[i]);
  }
}

/** a knock on the hive's boards, or a scratch of feet along them */
function woodTap(b: Float32Array, c: Ctx, t: number, a: number): void {
  const { sr, rng } = c;
  impact(b, sr, rng, { t, modes: [rng.range(180, 240), a, 0.05, rng.range(520, 640), 0.6 * a, 0.03, rng.range(1100, 1400), 0.3 * a, 0.02], jitter: 0.05, noise: 0.5 * a, noiseTau: 0.002, noiseBp: [1500, 1] });
}

/** vanilla block.beehive.enter: the buzz goes in and the wood closes over it; a bump as the bee settles */
function hiveEnter(c: Ctx): Float32Array {
  const { rng } = c;
  const out = alloc(1.2, c.sr);
  const d = rng.range(0.8, 0.95);
  layer(out, 1, (b) => muffledInto(b, c, 0.01, d, rng.range(220, 245), (t) => envBump(t, 0.06, d - 0.06) * (1 - 0.4 * smooth(t / d)), (t) => 3200 * Math.pow(0.1, smooth(t / d))));
  layer(out, 0.35, (b) => woodTap(b, c, d * 0.55, 1));
  return out;
}

/** vanilla block.beehive.exit: a bump, then the buzz muffled in the wood opens up and flies off */
function hiveExit(c: Ctx): Float32Array {
  const { rng } = c;
  const out = alloc(1.2, c.sr);
  const d = rng.range(0.8, 0.95);
  layer(out, 0.35, (b) => woodTap(b, c, 0.01, 1));
  layer(out, 1, (b) =>
    muffledInto(b, c, 0.04, d, rng.range(225, 250), (t) => envBump(t, 0.12, d - 0.12) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, (t / d) * 1.6))), (t) => 320 * Math.pow(10, smooth((t / d) * 1.5))),
  );
  return out;
}

/** vanilla block.beehive.work: bees busy inside, a muffled murmur of a few of them, and a scrape or a tap */
function hiveWork(c: Ctx): Float32Array {
  const { rng } = c;
  const out = alloc(1.8, c.sr);
  const d = rng.range(1.2, 1.5);
  layer(out, 1, (b) => {
    for (let k = 0; k < 3; k++) {
      const t0 = 0.01 + (k ? rng.next() * 0.25 : 0), dk = d - t0 - rng.next() * 0.2;
      const lp = rng.range(500, 800), g = k ? rng.range(0.5, 1) : 1;
      muffledInto(b, c, t0, dk, rng.range(200, 260), (t) => envBump(t, k ? 0.15 : 0.04, dk - 0.15) * g, () => lp);
    }
  });
  layer(out, 0.3, (b) => {
    const n = 1 + rng.int(3);
    for (let k = 0; k < n; k++) woodTap(b, c, 0.1 + rng.next() * (d - 0.2), rng.range(0.4, 1));
  });
  return out;
}

/** vanilla block.beehive.shear: two snips of the blades, the comb crunching as it comes away */
function hiveShear(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  const snip = (b: Float32Array, t: number, a: number): void => {
    sweep(b, sr, rng, { t, dur: 0.06, f: (u) => 4200 - 1800 * (u / 0.06), q: 5, amp: (u) => a * envAD(u, 0.004, 0.02) });
    impact(b, sr, rng, { t: t + 0.05, modes: [rng.range(3100, 3500), a, 0.05, rng.range(5200, 5800), 0.5 * a, 0.03], noise: a * 0.6, noiseTau: 0.001, noiseBp: [6000, 1] });
  };
  const t2 = rng.range(0.2, 0.26);
  layer(out, 0.8, (b) => {
    snip(b, 0.01, 1);
    snip(b, t2, 0.85);
  });
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      t: 0.04,
      dur: 0.55,
      rate: 350,
      energy: (t) => envAD(t, 0.02, 0.12) + 0.8 * (t > t2 ? envAD(t - t2, 0.02, 0.1) : 0),
      grain: 0.0025,
      heavy: 2.5,
      bands: [
        { f: 900, q: 1.2, g: 1, spread: 0.25 },
        { f: 2200, q: 1.5, g: 0.7, spread: 0.3 },
      ],
    }),
  );
  return out;
}

/** vanilla block.beehive.drip: a thick drop of honey landing, a low sticky plip */
function hiveDrip(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const f = rng.range(380, 650);
  layer(out, 1, (b) => bubble(b, sr, 0.004, f, 1, rng.range(0.025, 0.04), 0.5));
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: 0.03, attack: 0.001, tau: 0.006, bp: [f * 3, 1.4] }));
  return lowpass(out, 3000, sr);
}

// ---------------------------------------------------------------------------
// the honey block (vanilla SoundType.HONEY_BLOCK) and the coral block (SoundType.CORAL_BLOCK)

/** a sticky peel into `b` at `t0`: honey stretching and letting go, a tacky smack */
function peelInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number): void {
  const { sr, rng } = c;
  sweep(b, sr, rng, { t: t0, dur: d, f: (t) => f * (1 + 1.6 * smooth(t / d)), q: 2.5, amp: (t) => envBump(t, d * 0.15, d * 0.8) });
  impact(b, sr, rng, { t: t0 + d * 0.85, modes: [f * 0.8, 1, 0.03, f * 1.9, 0.4, 0.02], noise: 0.4, noiseTau: 0.003, noiseBp: [f * 2.5, 1.2] });
}

/** the honey block: a gloopy squelch and a peel (`big`: breaking or placing, the whole block) */
function honeySound(big: boolean, soft = false) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const out = alloc(big ? 0.6 : 0.32, sr);
    const f = rng.range(soft ? 260 : 320, soft ? 360 : 480);
    layer(out, 1, (b) => thump(b, sr, { t: 0.004, f0: f * 0.9, f1: f * 0.45, glide: 0.04, tau: big ? 0.07 : 0.04, attack: 0.006, h2: 0.3 }));
    layer(out, big ? 0.9 : 0.6, (b) => peelInto(b, c, big ? 0.05 : 0.03, big ? rng.range(0.25, 0.32) : rng.range(0.12, 0.17), f));
    if (big)
      layer(out, 0.4, (b) => {
        for (let k = 0; k < 5; k++) bubble(b, sr, 0.05 + rng.next() * 0.35, rng.logRange(300, 800), rng.range(0.4, 1), rng.range(0.02, 0.04), 0.4);
      });
    return lowpass(out, soft ? 2200 : 3800, sr);
  };
}

/** vanilla block.honey_block.slide: a slow, tacky stretch down the block's side, sticking and slipping */
function honeySlide(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.7);
  const out = alloc(d + 0.1, sr);
  layer(out, 1, (b) =>
    creak(b, sr, rng, {
      t: 0.01,
      dur: d,
      rate: (t) => 22 + 18 * Math.sin((Math.PI * t) / d),
      amp: (t) => envBump(t, 0.03, d - 0.05),
      jitter: 0.35,
      bands: [
        { f: rng.range(280, 340), q: 3, g: 1 },
        { f: rng.range(700, 850), q: 4, g: 0.5 },
        { f: rng.range(1500, 1800), q: 5, g: 0.2 },
      ],
    }),
  );
  layer(out, 0.45, (b) => sweep(b, sr, rng, { t: 0.01, dur: d, f: (t) => 500 + 300 * Math.sin((Math.PI * t) / d), q: 1.5, amp: (t) => envBump(t, 0.1, d - 0.12), color: 'pink' }));
  return lowpass(out, 2500, sr);
}

/** the coral block: brittle, hollow stone crunching (`big`: breaking or placing) */
function coralSound(big: boolean, soft = false) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const d = big ? 0.3 : 0.14;
    const out = alloc(d + 0.1, sr);
    layer(out, 1, (b) =>
      phisem(b, sr, rng, {
        dur: d,
        rate: big ? 900 : 500,
        energy: (t) => envAD(t, 0.003, big ? 0.07 : 0.03),
        grain: big ? 0.0035 : 0.0025,
        heavy: 2.2,
        bands: [
          { f: soft ? 1100 : 1500, q: 1.3, g: 1, spread: 0.35 },
          { f: soft ? 2400 : 3200, q: 1.6, g: 0.6, spread: 0.35 },
          { f: 5200, q: 2, g: soft ? 0.1 : 0.25, spread: 0.3 },
        ],
      }),
    );
    // (hollow: a brief knock inside its pores)
    layer(out, big ? 0.45 : 0.3, (b) => impact(b, sr, rng, { t: 0.002, modes: [rng.range(650, 850), 1, 0.03, rng.range(1500, 1800), 0.5, 0.02], noise: 0.3, noiseTau: 0.002 }));
    return out;
  };
}

export function beeSounds(): Record<string, SoundGen> {
  const n = 'entity.bee.', h = 'block.beehive.', y = 'block.honey_block.', k = 'block.coral_block.';
  const loop = { loop: true };
  return {
    [n + 'loop']: sound(n + 'loop', 1, buzzLoop(false), loop),
    [n + 'loop_aggressive']: sound(n + 'loop_aggressive', 1, buzzLoop(true), loop),
    [n + 'hurt']: sound(n + 'hurt', 3, beeHurt),
    [n + 'death']: sound(n + 'death', 2, beeDeath),
    [n + 'sting']: sound(n + 'sting', 2, beeSting),
    [n + 'pollinate']: sound(n + 'pollinate', 4, beePollinate),
    [h + 'enter']: sound(h + 'enter', 2, hiveEnter),
    [h + 'exit']: sound(h + 'exit', 2, hiveExit),
    [h + 'work']: sound(h + 'work', 4, hiveWork),
    [h + 'shear']: sound(h + 'shear', 2, hiveShear),
    [h + 'drip']: sound(h + 'drip', 6, hiveDrip),
    [y + 'break']: sound(y + 'break', 5, honeySound(true)),
    [y + 'step']: sound(y + 'step', 5, honeySound(false, true)),
    [y + 'place']: sound(y + 'place', 5, honeySound(true, true)),
    [y + 'hit']: sound(y + 'hit', 5, honeySound(false, true)),
    [y + 'fall']: sound(y + 'fall', 2, honeySound(false)),
    [y + 'slide']: sound(y + 'slide', 4, honeySlide),
    [k + 'break']: sound(k + 'break', 4, coralSound(true)),
    [k + 'step']: sound(k + 'step', 6, coralSound(false, true)),
    [k + 'place']: sound(k + 'place', 4, coralSound(true)),
    [k + 'hit']: sound(k + 'hit', 6, coralSound(false, true)),
    [k + 'fall']: sound(k + 'fall', 2, coralSound(false)),
  };
}
