// The fish's, the dolphin's and the glow squid's sounds (Stage 5: ocean), synthesized. A stranded fish flops with a
// wet slap (the bigger the fish the lower), squelches when hurt and gurgles out when it dies, and swims with a little
// swish; a pufferfish puffs up like a balloon, sputters back down and stings with a sharp prick. A dolphin clicks and
// whistles (clear in the air, muffled and ringing in the water), squeals when hurt, whistles its way down when it
// dies, chomps its fish, chirps when it plays, and splashes as it leaps and dives. A glow squid squishes like a squid
// with a glassy shimmer about it. A bucket scoops a fish up with a slosh and a flop, and pours it back out.

import type { SoundGen } from '../synth';
import { type Rng, TAU, addOsc, alloc, envBump, envPts, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, impact, sweep, thump } from './texture';
import { reverbHalf } from './world';

// ---------------------------------------------------------------------------
// fish (`pitch` is the fish's size: 1 a cod, lower bigger, higher smaller)

/** vanilla entity.<fish>.flop: a wet body slapping the ground, and the drops flying off it */
function fishFlop(pitch: number) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const out = alloc(0.35, sr);
    layer(out, 1, (b) => {
      impact(b, sr, rng, { modes: [220 * pitch, 1, 0.06, 510 * pitch, 0.55, 0.04, 1150 * pitch, 0.3, 0.025], jitter: 0.12, noise: 1.4, noiseTau: 0.006, noiseBp: [1400 * pitch, 0.7] });
      sweep(b, sr, rng, { t: 0.003, dur: 0.14, f: (t) => 3200 * pitch - 9000 * t, q: 1.3, amp: (t) => 0.45 * envBump(t, 0.003, 0.12), color: 'white' });
      for (let i = 0; i < 3; i++) bubble(b, sr, rng.range(0.01, 0.12), rng.range(900, 2200) * pitch, rng.range(0.08, 0.2), 0.012, 0.4);
    });
    return out;
  };
}

/** vanilla entity.<fish>.hurt: a squishy blub, falling away */
function fishHurt(pitch: number) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const out = alloc(0.3, sr);
    const f0 = rng.range(700, 900) * pitch;
    layer(out, 1, (b) => {
      sweep(b, sr, rng, { dur: 0.16, f: (t) => f0 * (1.6 - 3 * t), q: 6, amp: (t) => envBump(t, 0.008, 0.15), color: 'white' });
      bubble(b, sr, 0.005, f0 * 1.2, 0.6, 0.03, 0.8);
      bubble(b, sr, rng.range(0.04, 0.08), f0 * rng.range(1.4, 1.9), 0.4, 0.02, 0.6);
    });
    return out;
  };
}

/** vanilla entity.<fish>.death: a longer squelch sinking away, and its last bubbles */
function fishDeath(pitch: number) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const out = alloc(0.65, sr);
    const f0 = rng.range(650, 800) * pitch;
    layer(out, 1, (b) => {
      sweep(b, sr, rng, { dur: 0.35, f: (t) => f0 * (1.5 - 2.4 * t), q: 5, amp: (t) => envBump(t, 0.01, 0.33), color: 'white' });
      for (let i = 0; i < 7; i++) {
        const t = 0.03 + i * 0.07 + rng.range(0, 0.03);
        bubble(b, sr, t, f0 * rng.range(0.9, 1.6) * (1 - 0.5 * t), 0.5 * Math.exp(-t / 0.25), 0.025, 0.5);
      }
    });
    return out;
  };
}

/** vanilla entity.fish.swim: a quick little swish of a tail */
function fishSwim(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.25, 0.4);
  const out = alloc(d + 0.05, sr);
  const f0 = rng.range(600, 900);
  const f1 = f0 * rng.range(1.6, 2.4);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 + (f1 - f0) * Math.sin((Math.PI * t) / d), q: 1.4, amp: (t) => envBump(t, d * 0.4, d * 0.6), color: 'pink' }));
  layer(out, 0.3, (b) => {
    for (let k = 0; k < 5; k++) bubble(b, sr, rng.range(0.02, d * 0.9), rng.logRange(500, 2000), rng.range(0.2, 1), undefined, 0.4);
  });
  return out;
}

/** vanilla entity.puffer_fish.blow_up: puffing up like a balloon, the skin going taut at the end */
function pufferBlowUp(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.4, 0.5);
  const out = alloc(d + 0.1, sr);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 250 * Math.pow(7, t / d), q: 3, amp: (t) => envPts(t / d, [0, 0, 0.15, 0.8, 0.85, 1, 1, 0]), color: 'pink' }));
  layer(out, 0.5, (b) => addOsc(b, sr, 0, d, (t) => 180 * Math.pow(4, t / d), (t) => envPts(t / d, [0, 0, 0.2, 0.6, 0.9, 1, 1, 0])));
  layer(out, 0.4, (b) => impact(b, sr, rng, { t: d * 0.92, modes: [700, 1, 0.05, 1500, 0.4, 0.03], jitter: 0.1, noise: 0.5, noiseTau: 0.004 }));
  return out;
}

/** vanilla entity.puffer_fish.blow_out: the air sputtering back out of it */
function pufferBlowOut(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.65);
  const out = alloc(d + 0.05, sr);
  const fl = rng.range(28, 40);
  const flutter = (t: number) => 0.55 + 0.45 * Math.sin(TAU * fl * t);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 1400 * Math.pow(0.25, t / d), q: 2, amp: (t) => envPts(t / d, [0, 0, 0.05, 1, 0.7, 0.6, 1, 0]) * flutter(t), color: 'pink' }));
  layer(out, 0.45, (b) => addOsc(b, sr, 0, d, (t) => fl * 4 * Math.pow(0.6, t / d), (t) => envPts(t / d, [0, 0, 0.05, 0.7, 0.8, 0.3, 1, 0]) * flutter(t)));
  return out;
}

/** vanilla entity.puffer_fish.sting: a sharp prick */
function pufferSting(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.25, sr);
  layer(out, 1, (b) => {
    impact(b, sr, rng, { modes: [2600, 1, 0.03, 4100, 0.6, 0.02, 6300, 0.4, 0.015], jitter: 0.08, noise: 1, noiseTau: 0.002, noiseBp: [5000, 1] });
    sweep(b, sr, rng, { t: 0.005, dur: 0.12, f: (t) => 3000 + 8000 * t, q: 4, amp: (t) => 0.5 * envBump(t, 0.005, 0.11), color: 'white' });
  });
  return out;
}

// ---------------------------------------------------------------------------
// dolphins

/** a dolphin's whistle: a pure tone gliding along `f`, a little of its octave with it */
function whistle(b: Float32Array, sr: number, t0: number, dur: number, f: (t: number) => number, amp: (t: number) => number): void {
  addOsc(b, sr, t0, dur, f, amp);
  addOsc(b, sr, t0, dur, (t) => 2 * f(t), (t) => 0.18 * amp(t));
}

/** a whistle's shape: rising, falling, arching or trilling, about `f0` */
function whistleShape(rng: Rng, d: number, f0: number): (t: number) => number {
  const span = rng.range(0.25, 0.6);
  switch (rng.int(4)) {
    case 0:
      return (t) => f0 * (1 - span * 0.5 + (span * t) / d);
    case 1:
      return (t) => f0 * (1 + span * 0.5 - (span * t) / d);
    case 2:
      return (t) => f0 * (1 + span * 0.5 * Math.sin((Math.PI * t) / d));
    default: {
      const tr = rng.range(9, 14);
      return (t) => f0 * (1 + 0.12 * Math.sin(TAU * tr * t)) * (1 - (0.2 * t) / d);
    }
  }
}

/** a train of `n` sonar clicks from `t0`, `rate` a second (quickening or slowing) */
function clickTrain(b: Float32Array, sr: number, rng: Rng, t0: number, n: number, rate: (i: number) => number, f: number): number {
  let t = t0;
  for (let i = 0; i < n; i++) {
    impact(b, sr, rng, { t, modes: [f, 1, 0.004, f * 1.7, 0.6, 0.003], jitter: 0.1, noise: 0.8, noiseTau: 0.0008, noiseBp: [f * 1.3, 1.2], gain: 0.6 + 0.4 * rng.next() });
    t += 1 / rate(i);
  }
  return t;
}

/** in the water: muffled, and ringing a little */
function underwater(out: Float32Array, sr: number, muffle: number, wet: number): Float32Array {
  lowpass(out, muffle, sr);
  lowpass(out, muffle, sr);
  return reverbHalf(out, sr, { t60: 0.9, wet, dry: 1 });
}

/** vanilla entity.dolphin.ambient / ambient_water: a run of clicks and a whistle or two (in the water, muffled) */
function dolphinChatter(inWater: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const out = alloc(1.3, sr);
    layer(out, 0.6, (b) => {
      const n = 5 + rng.int(8);
      const r0 = rng.range(22, 40), r1 = r0 * rng.range(0.6, 1.8);
      clickTrain(b, sr, rng, 0.01, n, (i) => r0 + ((r1 - r0) * i) / n, rng.range(1800, 2600));
    });
    layer(out, 1, (b) => {
      let t = rng.range(0.15, 0.35);
      const whistles = 1 + rng.int(2);
      for (let k = 0; k < whistles; k++) {
        const d = rng.range(0.2, 0.42);
        whistle(b, sr, t, d, whistleShape(rng, d, rng.range(1800, 3000)), (x) => envBump(x, 0.03, d - 0.03));
        t += d + rng.range(0.05, 0.15);
      }
    });
    return inWater ? underwater(out, sr, 2400, 0.35) : out;
  };
}

/** vanilla entity.dolphin.hurt: a sharp squeal, bending down */
function dolphinHurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.22, 0.32);
  const out = alloc(d + 0.1, sr);
  const f0 = rng.range(2600, 3400);
  layer(out, 1, (b) => whistle(b, sr, 0, d, (t) => f0 * (1.1 - (0.45 * t) / d) * (1 + 0.03 * Math.sin(TAU * 30 * t)), (t) => envBump(t, 0.01, d - 0.01)));
  layer(out, 0.3, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 * (1 - (0.4 * t) / d), q: 3, amp: (t) => envBump(t, 0.005, d - 0.005), color: 'white' }));
  return out;
}

/** vanilla entity.dolphin.death: a long whistle winding down, a last gurgle of bubbles */
function dolphinDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 1.0;
  const out = alloc(d + 0.3, sr);
  const f0 = rng.range(2600, 3000);
  layer(out, 1, (b) => whistle(b, sr, 0, d, (t) => f0 * Math.pow(0.25, t / d) * (1 + 0.04 * (1 - t / d) * Math.sin(TAU * (9 - 5 * (t / d)) * t)), (t) => envPts(t / d, [0, 0, 0.05, 1, 0.6, 0.7, 1, 0])));
  layer(out, 0.4, (b) => {
    for (let i = 0; i < 10; i++) {
      const t = d * 0.5 + rng.range(0, d * 0.6);
      bubble(b, sr, t, rng.logRange(350, 1100), rng.range(0.3, 1), undefined, 0.4);
    }
  });
  return out;
}

/** vanilla entity.dolphin.eat: a couple of quick wet chomps and a gulp */
function dolphinEat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  layer(out, 1, (b) => {
    const n = 2 + rng.int(2);
    for (let i = 0; i < n; i++) {
      const t = i * rng.range(0.09, 0.13);
      impact(b, sr, rng, { t, modes: [420, 1, 0.03, 950, 0.5, 0.02, 2100, 0.3, 0.012], jitter: 0.15, noise: 1.2, noiseTau: 0.005, noiseBp: [1800, 0.8] });
      sweep(b, sr, rng, { t, dur: 0.06, f: () => 2600, q: 1, amp: (x) => 0.35 * envBump(x, 0.004, 0.05), color: 'white' });
    }
  });
  layer(out, 0.5, (b) => thump(b, sr, { t: rng.range(0.3, 0.36), f0: 260, f1: 140, glide: 0.04, tau: 0.04 }));
  return out;
}

/** vanilla entity.dolphin.play: a burst of happy chirps, each rising */
function dolphinPlay(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.0, sr);
  layer(out, 1, (b) => {
    let t = 0.01;
    const n = 3 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const d = rng.range(0.07, 0.13);
      const f0 = rng.range(2000, 2800) * (1 + 0.06 * i);
      whistle(b, sr, t, d, (x) => f0 * (0.8 + (0.5 * x) / d), (x) => envBump(x, 0.012, d - 0.012));
      t += d + rng.range(0.02, 0.07);
    }
  });
  layer(out, 0.35, (b) => clickTrain(b, sr, rng, 0, 4 + rng.int(4), () => rng.range(30, 50), 2400));
  return out;
}

/** a splash of water: the thump of the body, the spray, the bubbles (`big` for a dolphin's own splash) */
function waterSplash(c: Ctx, big: boolean): Float32Array {
  const { sr, rng } = c;
  const d = big ? 0.9 : 0.6;
  const out = alloc(d, sr);
  layer(out, 0.7, (b) => burst(b, sr, rng, { dur: 0.35, attack: 0.003, tau: big ? 0.09 : 0.06, lp: big ? 420 : 600, color: 'brown' }));
  const mf = rng.range(7, 11);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: d * 0.8, attack: 0.004, tau: big ? 0.12 : 0.08, bp: [1900, 0.5], env: (t) => 0.75 + 0.25 * Math.sin(TAU * mf * t) }));
  layer(out, 0.5, (b) => {
    const nb = big ? 60 : 35;
    for (let k = 0; k < nb; k++) {
      const t = 0.02 + Math.pow(rng.next(), 1.8) * d * 0.8;
      bubble(b, sr, t, rng.logRange(400, 2600), Math.pow(rng.next(), 2) * Math.exp(-t / 0.3), undefined, rng.range(0.1, 0.5));
    }
  });
  return out;
}

/** vanilla entity.dolphin.jump: bursting up out of the water, a whoosh and a rush of spray */
function dolphinJump(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const splash = waterSplash(c, false);
  const out = alloc(0.9, sr);
  layer(out, 1, (b) => b.set(splash.subarray(0, Math.min(splash.length, b.length))));
  layer(out, 0.6, (b) => sweep(b, sr, rng, { t: 0.05, dur: 0.5, f: (t) => 700 + 2400 * t, q: 1.2, amp: (t) => envBump(t, 0.12, 0.38), color: 'pink' }));
  return out;
}

/** vanilla entity.dolphin.attack: a snap of the beak and a squeak */
function dolphinAttack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: [900, 1, 0.02, 2100, 0.6, 0.012, 3700, 0.35, 0.008], jitter: 0.1, noise: 1, noiseTau: 0.002, noiseBp: [3000, 1] }));
  const f0 = rng.range(2400, 3000);
  layer(out, 0.6, (b) => whistle(b, sr, 0.03, 0.14, (t) => f0 * (1 + 1.5 * t), (t) => envBump(t, 0.01, 0.13)));
  return out;
}

/** vanilla entity.dolphin.swim: a strong stroke of the tail through the water */
function dolphinSwim(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.45, 0.65);
  const out = alloc(d + 0.1, sr);
  const f0 = rng.range(380, 560);
  const f1 = f0 * rng.range(1.6, 2.2);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 + (f1 - f0) * Math.sin((Math.PI * t) / d), q: 1.1, amp: (t) => envBump(t, d * 0.4, d * 0.6), color: 'pink' }));
  layer(out, 0.35, (b) => {
    for (let k = 0; k < 10; k++) bubble(b, sr, rng.range(0.05, d * 0.9), rng.logRange(300, 1400), rng.range(0.2, 1), undefined, 0.3);
  });
  return out;
}

// ---------------------------------------------------------------------------
// glow squid

/** a glassy shimmer: a few bell-like glints, high and soft */
function shimmer(b: Float32Array, sr: number, rng: Rng, t0: number, span: number, n: number, fall: number): void {
  for (let i = 0; i < n; i++) {
    const t = t0 + rng.range(0, span);
    const f = rng.logRange(2400, 5200) * (1 - (fall * (t - t0)) / Math.max(span, 1e-3));
    const d = rng.range(0.25, 0.5);
    const a = rng.range(0.4, 1);
    addOsc(b, sr, t, d, () => f, (x) => a * Math.exp(-x / (d * 0.3)) * Math.min(1, x / 0.004));
    addOsc(b, sr, t, d, () => f * 2.76, (x) => 0.25 * Math.exp(-x / (d * 0.15)) * Math.min(1, x / 0.004));
  }
}

/** vanilla entity.glow_squid.ambient / hurt / death: a squid's wet squish, with a glassy shimmer */
function glowSquidSquish(kind: 'ambient' | 'hurt' | 'death') {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const d = kind === 'death' ? 0.9 : kind === 'hurt' ? 0.35 : 0.6;
    const out = alloc(d + 0.5, sr);
    const f0 = rng.range(300, 420) * (kind === 'hurt' ? 1.5 : 1);
    layer(out, 1, (b) => {
      sweep(b, sr, rng, { dur: d, f: (t) => f0 * (kind === 'death' ? 1.4 - (0.9 * t) / d : 1 + 0.6 * Math.sin((Math.PI * t) / d)), q: kind === 'hurt' ? 5 : 3.5, amp: (t) => envBump(t, kind === 'hurt' ? 0.01 : d * 0.3, kind === 'hurt' ? d - 0.01 : d * 0.7), color: 'white' });
      for (let i = 0; i < 4; i++) bubble(b, sr, rng.range(0.02, d * 0.8), rng.range(500, 1100), rng.range(0.15, 0.35), 0.025, 0.5);
    });
    layer(out, kind === 'hurt' ? 0.3 : 0.4, (b) => shimmer(b, sr, rng, 0.02, d * 0.8, kind === 'death' ? 7 : 4, kind === 'death' ? 0.5 : kind === 'hurt' ? 0.25 : 0));
    return underwater(out, sr, 5200, 0.3);
  };
}

/** vanilla entity.glow_squid.squirt: a gush of glowing ink, sparkling as it spreads */
function glowSquidSquirt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 0.55;
  const out = alloc(d + 0.5, sr);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 1600 * Math.pow(0.3, t / d), q: 1.6, amp: (t) => envPts(t / d, [0, 0, 0.04, 1, 0.5, 0.5, 1, 0]), color: 'pink' }));
  layer(out, 0.6, (b) => {
    for (let i = 0; i < 16; i++) {
      const t = 0.01 + Math.pow(rng.next(), 1.5) * d * 0.8;
      bubble(b, sr, t, rng.logRange(350, 1500), rng.range(0.3, 1), undefined, 0.4);
    }
  });
  layer(out, 0.35, (b) => shimmer(b, sr, rng, 0.08, d, 5, 0));
  return underwater(out, sr, 5200, 0.3);
}

// ---------------------------------------------------------------------------
// buckets of fish

/** the tin bucket's ring, struck softly */
function bucketRing(b: Float32Array, sr: number, rng: Rng, t: number): void {
  const fb = rng.range(480, 600);
  impact(b, sr, rng, { t, modes: [fb, 1, 0.3, fb * 1.59, 0.6, 0.22, fb * 2.14, 0.4, 0.15, fb * 2.65, 0.3, 0.1], noise: 0.3, noiseTau: 0.002, noiseBp: [3000, 1] });
}

/** a fish slapping about in the bucket */
function bucketFlop(b: Float32Array, sr: number, rng: Rng, t: number): void {
  impact(b, sr, rng, { t, modes: [260, 1, 0.05, 600, 0.5, 0.035, 1300, 0.3, 0.02], jitter: 0.12, noise: 1.2, noiseTau: 0.005, noiseBp: [1500, 0.7] });
}

/** vanilla item.bucket.fill_fish: the water sloshing in, the fish with it, flopping against the tin */
function bucketFillFish(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 0.75;
  const out = alloc(d, sr);
  layer(out, 0.3, (b) => bucketRing(b, sr, rng, 0));
  layer(out, 1, (b) => {
    for (let k = 0; k < 26; k++) {
      const t = 0.03 + rng.next() * d * 0.7;
      bubble(b, sr, t, rng.logRange(300, 1200) * (1 + (0.6 * t) / d), rng.range(0.3, 1), undefined, 0.35);
    }
  });
  layer(out, 0.55, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 1100 + 900 * Math.sin((Math.PI * t) / d), q: 1, amp: (t) => envBump(t, 0.08, d - 0.1), color: 'pink' }));
  layer(out, 0.6, (b) => {
    bucketFlop(b, sr, rng, rng.range(0.3, 0.4));
    bucketFlop(b, sr, rng, rng.range(0.5, 0.6));
  });
  return out;
}

/** vanilla item.bucket.empty_fish: the water pouring out, and a splash as the fish goes with it */
function bucketEmptyFish(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 0.85;
  const out = alloc(d, sr);
  const fl = rng.range(10, 15);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 1500 * (1 - (0.3 * t) / d), q: 0.9, amp: (t) => envBump(t, 0.05, d - 0.1) * (0.75 + 0.25 * Math.sin(TAU * fl * t)), color: 'pink' }));
  layer(out, 0.6, (b) => burst(b, sr, rng, { t: 0.1, dur: 0.6, attack: 0.01, tau: 0.15, bp: [2000, 0.6] }));
  layer(out, 0.5, (b) => {
    for (let k = 0; k < 18; k++) bubble(b, sr, 0.1 + rng.next() * d * 0.7, rng.logRange(400, 1800), rng.range(0.3, 1), undefined, 0.4);
  });
  layer(out, 0.2, (b) => bucketRing(b, sr, rng, 0));
  layer(out, 0.5, (b) => bucketFlop(b, sr, rng, rng.range(0.25, 0.35)));
  return out;
}

export function fishSounds(): Record<string, SoundGen> {
  const s: Record<string, SoundGen> = {
    'entity.fish.swim': sound('entity.fish.swim', 4, fishSwim),
    'entity.puffer_fish.blow_up': sound('entity.puffer_fish.blow_up', 3, pufferBlowUp),
    'entity.puffer_fish.blow_out': sound('entity.puffer_fish.blow_out', 3, pufferBlowOut),
    'entity.puffer_fish.sting': sound('entity.puffer_fish.sting', 2, pufferSting),
    'entity.dolphin.ambient': sound('entity.dolphin.ambient', 4, dolphinChatter(false)),
    'entity.dolphin.ambient_water': sound('entity.dolphin.ambient_water', 6, dolphinChatter(true)),
    'entity.dolphin.hurt': sound('entity.dolphin.hurt', 3, dolphinHurt),
    'entity.dolphin.death': sound('entity.dolphin.death', 2, dolphinDeath),
    'entity.dolphin.eat': sound('entity.dolphin.eat', 3, dolphinEat),
    'entity.dolphin.play': sound('entity.dolphin.play', 2, dolphinPlay),
    'entity.dolphin.jump': sound('entity.dolphin.jump', 3, dolphinJump),
    'entity.dolphin.attack': sound('entity.dolphin.attack', 3, dolphinAttack),
    'entity.dolphin.splash': sound('entity.dolphin.splash', 3, (c) => waterSplash(c, true)),
    'entity.dolphin.swim': sound('entity.dolphin.swim', 4, dolphinSwim),
    'entity.glow_squid.ambient': sound('entity.glow_squid.ambient', 5, glowSquidSquish('ambient')),
    'entity.glow_squid.hurt': sound('entity.glow_squid.hurt', 4, glowSquidSquish('hurt')),
    'entity.glow_squid.death': sound('entity.glow_squid.death', 3, glowSquidSquish('death')),
    'entity.glow_squid.squirt': sound('entity.glow_squid.squirt', 3, glowSquidSquirt),
    'item.bucket.fill_fish': sound('item.bucket.fill_fish', 3, bucketFillFish),
    'item.bucket.empty_fish': sound('item.bucket.empty_fish', 3, bucketEmptyFish),
  };
  for (const [who, pitch] of [['cod', 1], ['salmon', 0.85], ['tropical_fish', 1.35], ['puffer_fish', 1.15]] as const) {
    const n = `entity.${who}.`;
    s[n + 'flop'] = sound(n + 'flop', 4, fishFlop(pitch));
    s[n + 'hurt'] = sound(n + 'hurt', 4, fishHurt(pitch));
    s[n + 'death'] = sound(n + 'death', 2, fishDeath(pitch));
  }
  return s;
}
