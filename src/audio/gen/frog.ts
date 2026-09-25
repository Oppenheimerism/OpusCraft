// Frogs and tadpoles (M9; vanilla entity.frog.*, entity.tadpole.*, the tadpole's bucket, and the sound types of
// frogspawn and the froglights). A frog croaks: a low, buzzing pulse through its swollen throat, a ribbit of two, a
// long rolling croak or a few quick chirrups. Its tongue flicks out with a wet whip, and it gulps what it catches; it
// leaps with a springy push, pads about on damp feet, and lays its spawn with a soft plop. Hurt, it squawks a strangled
// croak; dying, one sinks away gurgling. A tadpole's sounds are tiny: a squeak when hurt, a flop on land, and a bubbly
// rising shimmer as it grows up. Frogspawn is jelly: it squelches underfoot and bursts wetly; a froglight is soft and
// springy, a muffled glowing bloop.
// Takes: frog ambient 6, death 2, eat 3, hurt 4, lay_spawn 2, long_jump 3, step 4, tongue 3; tadpole death 2, flop 4,
// grow_up 2, hurt 4; the bucket 3 each; frogspawn and froglight break, fall, hit, place and step.

import type { SoundGen } from '../synth';
import { alloc, envAD, envBump, layer, lowpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, sweep, thump } from './texture';
import { voice } from './voice';
import { bucketRing } from './fish';

interface CroakOpts {
  /** how far its pitch bows up in the middle (a fraction) */
  rise?: number;
  /** the rate of the throat's pulses (Hz) */
  pulse?: number;
  /** the formants' lift (1: a grown frog's wide throat) */
  bright?: number;
  /** the pulses' depth, 0..1 */
  depth?: number;
}

/** a croak into `b` at `t0`: a buzzing train of pulses from the throat, `d` long at pitch `f` */
function croakInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number, o: CroakOpts = {}): void {
  const br = o.bright ?? 1;
  voice(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    f0: (t) => f * (1 + (o.rise ?? 0.08) * Math.sin((Math.PI * t) / d)),
    amp: (t) => envBump(t, Math.min(0.025, d * 0.2), d * 0.85),
    formants: [
      { f: 420 * br, bw: 140, g: 1 },
      { f: 1100 * br, bw: 260, g: 0.65 },
      { f: 2400 * br, bw: 450, g: 0.25 },
    ],
    oq: 0.32,
    jitter: 0.03,
    shimmer: 0.1,
    rough: 0.45,
    sub: 0.15,
    growl: [o.pulse ?? 30, o.depth ?? 0.85],
    breath: 0.04,
  });
}

/** a wet smack into `b` at `t0`: a sticky click and a squelch (a tongue landing, a foot lifting, jelly parting) */
function squelchInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number): void {
  const { sr, rng } = c;
  sweep(b, sr, rng, { t: t0, dur: d, f: (t) => f * (1 + 1.2 * (t / d)), q: 3, amp: (t) => envAD(t, 0.004, d * 0.35) });
  burst(b, sr, rng, { t: t0, dur: 0.02, attack: 0.001, tau: 0.004, bp: [f * 2.5, 1.2], amp: 0.6 });
}

// ---------------------------------------------------------------------------
// the frog

/** vanilla entity.frog.ambient: a ribbit, a long rolling croak, or a few quick chirrups */
function frogAmbient(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(1.1, sr);
  const f = rng.range(95, 150);
  if (c.v % 3 === 0) {
    // rib-bit: a short buzz and a longer one a touch higher
    const d1 = rng.range(0.09, 0.13), gap = rng.range(0.04, 0.07);
    layer(out, 0.85, (b) => croakInto(b, c, 0.01, d1, f * 1.1, { pulse: rng.range(28, 36) }));
    layer(out, 1, (b) => croakInto(b, c, 0.01 + d1 + gap, rng.range(0.2, 0.28), f * 1.2, { rise: 0.15, pulse: rng.range(26, 34) }));
  } else if (c.v % 3 === 1) {
    // a long rolling croak, slow pulses
    layer(out, 1, (b) => croakInto(b, c, 0.01, rng.range(0.45, 0.65), f * 0.9, { rise: 0.05, pulse: rng.range(18, 24), depth: 0.95 }));
  } else {
    // quick chirrups
    const n = 2 + rng.int(2);
    layer(out, 1, (b) => {
      let t = 0.01;
      for (let i = 0; i < n; i++) {
        const d = rng.range(0.06, 0.09);
        croakInto(b, c, t, d, f * rng.range(1.3, 1.6), { rise: 0.25, pulse: 40, bright: 1.15 });
        t += d + rng.range(0.05, 0.09);
      }
    });
  }
  return out;
}

/** vanilla entity.frog.death: a strangled croak sinking away, and a last gurgle */
function frogDeath(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(1.1, sr);
  const f = rng.range(120, 150), d = rng.range(0.55, 0.7);
  layer(out, 1, (b) =>
    voice(b, sr, rng, {
      t: 0.01,
      dur: d,
      f0: (t) => f * (1.2 - 0.55 * smooth(t / d)),
      amp: (t) => envBump(t, 0.03, d - 0.03),
      formants: [
        { f: 480, bw: 160, g: 1 },
        { f: 1250, bw: 300, g: 0.6 },
        { f: 2600, bw: 500, g: 0.2 },
      ],
      oq: 0.3,
      jitter: 0.05,
      shimmer: 0.15,
      rough: 0.6,
      sub: 0.25,
      growl: [26, 0.9],
      breath: 0.08,
    }),
  );
  layer(out, 0.35, (b) => {
    for (let k = 0; k < 6; k++) bubble(b, sr, d * 0.7 + rng.next() * 0.25, rng.logRange(250, 700), rng.range(0.4, 1), undefined, 0.3);
  });
  return out;
}

/** vanilla entity.frog.eat: a wet gulp, the throat swallowing */
function frogEat(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.5, sr);
  layer(out, 0.7, (b) => squelchInto(b, c, 0.005, 0.12, rng.range(500, 700)));
  layer(out, 1, (b) => thump(b, sr, { t: 0.08, f0: rng.range(170, 200), f1: rng.range(90, 110), glide: 0.05, tau: 0.06, attack: 0.01, h2: 0.3 }));
  layer(out, 0.4, (b) => bubble(b, sr, 0.14, rng.range(350, 450), 1, 0.05, 0.6));
  return out;
}

/** vanilla entity.frog.hurt: a short squawk of a croak */
function frogHurt(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.45, sr);
  const d = rng.range(0.14, 0.2), f = rng.range(170, 230);
  layer(out, 1, (b) => croakInto(b, c, 0.005, d, f, { rise: 0.35, pulse: rng.range(38, 48), bright: 1.25, depth: 0.7 }));
  return out;
}

/** vanilla entity.frog.lay_spawn: a soft wet plop onto the water, jelly settling */
function frogLaySpawn(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.8, sr);
  layer(out, 1, (b) => bubble(b, sr, 0.01, rng.range(260, 320), 1, 0.08, 0.9));
  layer(out, 0.6, (b) => squelchInto(b, c, 0.02, 0.25, rng.range(300, 420)));
  layer(out, 0.45, (b) => {
    for (let k = 0; k < 8; k++) bubble(b, sr, 0.12 + rng.next() * 0.4, rng.logRange(500, 1400), rng.range(0.3, 1), undefined, 0.4);
  });
  return out;
}

/** vanilla entity.frog.long_jump: the push of its legs, springy, and the air past it */
function frogLongJump(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.5, sr);
  layer(out, 0.8, (b) => thump(b, sr, { t: 0.005, f0: rng.range(140, 170), f1: rng.range(260, 320), glide: 0.06, tau: 0.05, attack: 0.004 }));
  layer(out, 0.55, (b) => squelchInto(b, c, 0.0, 0.08, rng.range(600, 800)));
  layer(out, 0.45, (b) => sweep(b, sr, rng, { t: 0.03, dur: 0.3, f: (t) => 900 + 1600 * (t / 0.3), q: 0.8, amp: (t) => envBump(t, 0.08, 0.2), color: 'pink' }));
  return out;
}

/** vanilla entity.frog.step: a damp little pad */
function frogStep(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.18, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.002, tau: 0.018, lp: rng.range(900, 1300), color: 'brown' }));
  layer(out, 0.4, (b) => squelchInto(b, c, 0.01, 0.05, rng.range(700, 1000)));
  return out;
}

/** vanilla entity.frog.tongue: the tongue whipped out, a wet flick */
function frogTongue(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.35, sr);
  const d = rng.range(0.1, 0.14);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 700 + 3200 * smooth(t / d), q: 4, amp: (t) => envBump(t, d * 0.3, d * 0.7) }));
  layer(out, 0.7, (b) => squelchInto(b, c, d * 0.8, 0.08, rng.range(900, 1200)));
  return out;
}

// ---------------------------------------------------------------------------
// the tadpole

/** a tadpole's peep into `b` at `t0`: tiny and high */
function peepInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number, drop: number): void {
  voice(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    f0: (t) => f * (1 - drop * (t / d)),
    amp: (t) => envAD(t, 0.004, d * 0.4),
    formants: [
      { f: 1800, bw: 300, g: 1 },
      { f: 3600, bw: 500, g: 0.5 },
    ],
    oq: 0.5,
    jitter: 0.02,
    shimmer: 0.05,
    breath: 0.1,
  });
}

/** vanilla entity.tadpole.hurt: a squeak */
function tadpoleHurt(c: Ctx): Float32Array {
  const out = alloc(0.25, c.sr);
  layer(out, 1, (b) => peepInto(b, c, 0.005, c.rng.range(0.07, 0.1), c.rng.range(750, 950), 0.2));
  return out;
}

/** vanilla entity.tadpole.death: a squeak falling away, a bubble or two */
function tadpoleDeath(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.5, sr);
  layer(out, 1, (b) => peepInto(b, c, 0.005, rng.range(0.2, 0.26), rng.range(800, 950), 0.5));
  layer(out, 0.4, (b) => {
    for (let k = 0; k < 3; k++) bubble(b, sr, 0.15 + rng.next() * 0.2, rng.logRange(700, 1500), rng.range(0.5, 1), undefined, 0.4);
  });
  return out;
}

/** vanilla entity.tadpole.flop: a tiny wet slap on the ground */
function tadpoleFlop(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.18, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.06, attack: 0.001, tau: 0.012, bp: [rng.range(1400, 2000), 1.5] }));
  layer(out, 0.5, (b) => squelchInto(b, c, 0.005, 0.05, rng.range(1200, 1600)));
  return out;
}

/** vanilla entity.tadpole.grow_up: a bubbly shimmer, rising */
function tadpoleGrowUp(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(1, sr);
  layer(out, 1, (b) => {
    for (let k = 0; k < 16; k++) {
      const t = 0.02 + (k / 16) * 0.7 + rng.next() * 0.04;
      bubble(b, sr, t, 400 * Math.pow(2, (k / 16) * 1.6) * rng.range(0.9, 1.1), rng.range(0.5, 1), undefined, 0.5);
    }
  });
  layer(out, 0.35, (b) => croakInto(b, c, 0.62, 0.18, 170, { pulse: 36, bright: 1.1 }));
  return out;
}

/** vanilla item.bucket.fill_tadpole / empty_tadpole: water sloshing in or out, the tin's ring, a tiny peep */
function tadpoleBucket(pouring: boolean) {
  return (c: Ctx): Float32Array => {
    const { rng, sr } = c;
    const d = 0.65;
    const out = alloc(d + 0.15, sr);
    layer(out, 0.25, (b) => bucketRing(b, sr, rng, 0));
    layer(out, 0.55, (b) =>
      sweep(b, sr, rng, { dur: d, f: (t) => (pouring ? 1500 * (1 - (0.3 * t) / d) : 1100 + 900 * Math.sin((Math.PI * t) / d)), q: 1, amp: (t) => envBump(t, 0.06, d - 0.1), color: 'pink' }),
    );
    layer(out, 0.8, (b) => {
      for (let k = 0; k < 18; k++) bubble(b, sr, 0.03 + rng.next() * d * 0.7, rng.logRange(400, 1600), rng.range(0.3, 1), undefined, 0.4);
    });
    layer(out, 0.4, (b) => peepInto(b, c, pouring ? 0.35 : 0.25, 0.07, rng.range(850, 1000), 0.15));
    return out;
  };
}

// ---------------------------------------------------------------------------
// the blocks

/** vanilla SoundType.FROGSPAWN: jelly, squelching (`big`: breaking, bursting wetly) */
function frogspawnSound(big: boolean, soft = false) {
  return (c: Ctx): Float32Array => {
    const { rng, sr } = c;
    const out = alloc(big ? 0.6 : 0.3, sr);
    layer(out, 1, (b) => squelchInto(b, c, 0.005, big ? 0.22 : 0.1, rng.range(soft ? 250 : 350, soft ? 380 : 550)));
    layer(out, big ? 0.6 : 0.3, (b) => {
      const n = big ? 8 : 3;
      for (let k = 0; k < n; k++) bubble(b, sr, 0.02 + rng.next() * (big ? 0.35 : 0.12), rng.logRange(500, 1500), rng.range(0.4, 1), undefined, 0.5);
    });
    return lowpass(out, soft ? 1800 : 4000, sr);
  };
}

/** vanilla SoundType.FROGLIGHT: soft and springy, a muffled bloop (`big`: breaking) */
function froglightSound(big: boolean, soft = false) {
  return (c: Ctx): Float32Array => {
    const { rng, sr } = c;
    const out = alloc(big ? 0.5 : 0.3, sr);
    const f = rng.range(soft ? 160 : 220, soft ? 200 : 300);
    layer(out, 1, (b) => thump(b, sr, { t: 0.003, f0: f * 1.6, f1: f, glide: 0.03, tau: big ? 0.07 : 0.04, attack: 0.004, h2: 0.25 }));
    layer(out, big ? 0.7 : 0.45, (b) => burst(b, sr, rng, { dur: big ? 0.2 : 0.1, attack: 0.002, tau: big ? 0.05 : 0.025, lp: soft ? 900 : 1600, color: 'brown' }));
    if (big)
      layer(out, 0.35, (b) => impact(b, sr, rng, { t: 0.01, modes: [f * 3.1, 1, 0.08, f * 4.7, 0.6, 0.06], noise: 0.2, noiseTau: 0.003, noiseBp: [2000, 1] }));
    return out;
  };
}

export function frogSounds(): Record<string, SoundGen> {
  const n = 'entity.frog.', t = 'entity.tadpole.', s = 'block.frogspawn.', l = 'block.froglight.';
  return {
    [n + 'ambient']: sound(n + 'ambient', 6, frogAmbient),
    [n + 'death']: sound(n + 'death', 2, frogDeath),
    [n + 'eat']: sound(n + 'eat', 3, frogEat),
    [n + 'hurt']: sound(n + 'hurt', 4, frogHurt),
    [n + 'lay_spawn']: sound(n + 'lay_spawn', 2, frogLaySpawn),
    [n + 'long_jump']: sound(n + 'long_jump', 3, frogLongJump),
    [n + 'step']: sound(n + 'step', 4, frogStep),
    [n + 'tongue']: sound(n + 'tongue', 3, frogTongue),
    [t + 'death']: sound(t + 'death', 2, tadpoleDeath),
    [t + 'flop']: sound(t + 'flop', 4, tadpoleFlop),
    [t + 'grow_up']: sound(t + 'grow_up', 2, tadpoleGrowUp),
    [t + 'hurt']: sound(t + 'hurt', 4, tadpoleHurt),
    'item.bucket.fill_tadpole': sound('item.bucket.fill_tadpole', 3, tadpoleBucket(false)),
    'item.bucket.empty_tadpole': sound('item.bucket.empty_tadpole', 3, tadpoleBucket(true)),
    [s + 'break']: sound(s + 'break', 4, frogspawnSound(true)),
    [s + 'fall']: sound(s + 'fall', 2, frogspawnSound(false, true)),
    [s + 'hit']: sound(s + 'hit', 3, frogspawnSound(false, true)),
    [s + 'place']: sound(s + 'place', 3, frogspawnSound(false)),
    [s + 'step']: sound(s + 'step', 4, frogspawnSound(false, true)),
    [s + 'hatch']: sound(s + 'hatch', 3, frogspawnSound(true)),
    [l + 'break']: sound(l + 'break', 4, froglightSound(true)),
    [l + 'fall']: sound(l + 'fall', 2, froglightSound(false, true)),
    [l + 'hit']: sound(l + 'hit', 3, froglightSound(false, true)),
    [l + 'place']: sound(l + 'place', 3, froglightSound(false)),
    [l + 'step']: sound(l + 'step', 4, froglightSound(false, true)),
  };
}
