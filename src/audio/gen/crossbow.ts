// Crossbow sounds (vanilla item.crossbow.*): the wooden stock creaking and the string's ratchet while
// it's drawn, the latch catching, the release's twang and thwack, and the bolt's solid hit. Takes as
// in vanilla's sounds.json: loading_start 1, loading_middle 4, loading_end 1, each quick_charge 1,
// shoot 3, hit 4.

import type { SoundGen } from '../synth';
import { type Rng, TAU, addMode, addOsc, alloc, envAD, envBump, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, creak, impact, sweep, thump } from './texture';

/** the stock and prod flexing: stick-slip friction through dry wooden resonances, rate gliding r0 → r1 */
function woodCreak(b: Float32Array, sr: number, rng: Rng, t: number, dur: number, r0: number, r1: number, bright = 1): void {
  creak(b, sr, rng, {
    t,
    dur,
    rate: (x) => r0 * Math.pow(r1 / r0, x / dur),
    amp: (x) => envBump(x, dur * 0.3, dur * 0.7),
    jitter: 0.3,
    bands: [
      { f: 480 * bright, q: 7, g: 1 },
      { f: 1080 * bright, q: 8, g: 0.8 },
      { f: 2250 * bright, q: 6, g: 0.45 },
      { f: 3800 * bright, q: 5, g: 0.2 },
    ],
  });
}

/** one tooth of the ratchet / the latch: a small hard click, metal on hardwood */
function click(b: Float32Array, sr: number, rng: Rng, t: number, f: number, amp = 1): void {
  impact(b, sr, rng, {
    t,
    modes: [f, 1, 0.02, f * 1.73, 0.6, 0.014, f * 2.93, 0.4, 0.009, f * 4.31, 0.22, 0.006, f * 0.41, 0.35, 0.03],
    jitter: 0.03,
    noise: 1.1,
    noiseTau: 0.0007,
    noiseBp: [f * 2.2, 0.8],
    gain: amp,
  });
}

/** the string stretching: a thin rising rub of noise with the faint tone of the tightening cord */
function stringRub(b: Float32Array, sr: number, rng: Rng, t: number, dur: number, f0: number, f1: number, amp = 1): void {
  sweep(b, sr, rng, {
    t,
    dur,
    f: (x) => f0 * Math.pow(f1 / f0, x / dur),
    q: 3.5,
    amp: (x) => amp * envBump(x, dur * 0.5, dur * 0.5),
  });
  const g0 = f0 * 0.11, g1 = f1 * 0.11;
  addOsc(b, sr, t, dur, (x) => g0 * Math.pow(g1 / g0, x / dur), (x) => 0.08 * amp * envBump(x, dur * 0.6, dur * 0.4));
}

/** item.crossbow.loading_start: the hand takes the string and the prod starts to bend with a long creak */
function loadingStart(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 0.55, (b) => click(b, sr, rng, 0.004, rng.range(900, 1100), 1));
  layer(out, 1, (b) => woodCreak(b, sr, rng, 0.02, 0.45, rng.range(55, 70), rng.range(120, 150)));
  layer(out, 0.45, (b) => stringRub(b, sr, rng, 0.03, 0.42, 800, 2100));
  layer(out, 0.4, (b) => {
    const n = 2 + rng.int(2);
    for (let i = 0; i < n; i++) click(b, sr, rng, 0.16 + i * rng.range(0.09, 0.12), rng.range(2300, 2900), 0.6 + 0.4 * rng.next());
  });
  return out;
}

/** item.crossbow.loading_middle: the prod bent further, a shorter groan and a couple of ratchet teeth */
function loadingMiddle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const dur = rng.range(0.24, 0.34);
  const r0 = rng.range(70, 100);
  layer(out, 1, (b) => woodCreak(b, sr, rng, 0.004, dur, r0, r0 * rng.range(0.7, 1.4), rng.range(0.9, 1.15)));
  layer(out, 0.35, (b) => stringRub(b, sr, rng, 0.01, dur, rng.range(1100, 1500), rng.range(1800, 2600)));
  layer(out, 0.5, (b) => {
    const n = 1 + rng.int(2);
    for (let i = 0; i < n; i++) click(b, sr, rng, rng.range(0.03, dur - 0.02), rng.range(2200, 3000), 0.7 + 0.3 * rng.next());
  });
  return out;
}

/** item.crossbow.loading_end: the string drops into the latch, a sharp clack and the stock's knock */
function loadingEnd(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => click(b, sr, rng, 0.002, rng.range(2400, 2800), 1));
  const fw = rng.range(330, 400);
  layer(out, 0.8, (b) =>
    impact(b, sr, rng, {
      t: 0.024,
      modes: [fw, 1, 0.06, fw * 2.21, 0.6, 0.04, fw * 3.64, 0.35, 0.025, fw * 5.3, 0.2, 0.015],
      noise: 0.8,
      noiseTau: 0.0018,
      noiseBp: [1800, 0.9],
    }),
  );
  layer(out, 0.28, (b) => thump(b, sr, { t: 0.024, f0: 170, f1: 105, glide: 0.02, tau: 0.03 }));
  // the string settling against the latch: a brief low buzz
  const fs = rng.range(140, 170);
  layer(out, 0.1, (b) => {
    for (let h = 1; h <= 6; h++) addMode(b, Math.round(0.026 * sr), sr, fs * h * (1 + 0.002 * h * h), 1 / h, 0.07 / Math.sqrt(h));
  });
  return out;
}

/**
 * item.crossbow.quick_charge_1..3: the whole draw in one quick motion, a short creak under a run of
 * ratchet teeth, faster and brighter with each level
 */
function quickCharge(level: number): (c: Ctx) => Float32Array {
  return (c) => {
    const { sr, rng } = c;
    const dur = [0.5, 0.4, 0.3][level - 1];
    const out = alloc(dur + 0.12, sr);
    const bright = 1 + 0.08 * (level - 1);
    layer(out, 0.55, (b) => click(b, sr, rng, 0.003, 950 * bright, 1));
    layer(out, 0.8, (b) => woodCreak(b, sr, rng, 0.01, dur * 0.9, rng.range(80, 100) * bright, rng.range(160, 200) * bright, bright));
    layer(out, 0.35, (b) => stringRub(b, sr, rng, 0.015, dur * 0.85, 900 * bright, 2400 * bright));
    layer(out, 1, (b) => {
      // the teeth come closer together as the pull speeds up
      const n = 4;
      let t = 0.05;
      for (let i = 0; i < n; i++) {
        click(b, sr, rng, t, rng.range(2300, 2800) * bright, 0.65 + 0.35 * (i / (n - 1)));
        t += (dur * 0.75) / n * (1.3 - 0.2 * i);
      }
    });
    return out;
  };
}

/**
 * item.crossbow.shoot: the latch trips, the string snaps forward with a hard buzzing twang, the prod's
 * limbs slam to a stop (the thwack) and the bolt hisses off
 */
function shoot(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 0.5, (b) => click(b, sr, rng, 0.001, rng.range(2600, 3100), 1));
  // twang: a stiff, heavily struck string, a little flat as it settles
  const f = rng.range(150, 185);
  layer(out, 0.75, (b) => {
    for (let h = 1; h <= 10; h++) {
      const fh = f * h * (1 + 0.003 * h * h);
      addOsc(b, sr, 0.006, 0.3, (t) => fh * (1 + 0.04 * Math.exp(-t / 0.02)), (t) => envAD(t, 0.001, 0.06 / Math.sqrt(h)) / Math.pow(h, 0.8) * (h % 2 ? 1 : 0.7));
    }
  });
  // thwack: the limbs hitting home on the stock
  const fw = rng.range(260, 320);
  layer(out, 1, (b) => {
    impact(b, sr, rng, {
      t: 0.008,
      modes: [fw, 1, 0.045, fw * 2.4, 0.7, 0.03, fw * 4.2, 0.45, 0.02, fw * 6.8, 0.25, 0.012],
      jitter: 0.02,
      noise: 1.4,
      noiseTau: 0.004,
      noiseBp: [1500, 0.7],
    });
    thump(b, sr, { t: 0.008, f0: 140, f1: 70, glide: 0.015, tau: 0.03, amp: 0.8 });
  });
  layer(out, 0.4, (b) => burst(b, sr, rng, { t: 0.006, dur: 0.03, tau: 0.004, bp: [3200, 0.9] }));
  // the bolt leaving: a short falling hiss
  layer(out, 0.45, (b) =>
    sweep(b, sr, rng, {
      t: 0.01,
      dur: 0.2,
      f: (t) => 3400 * Math.pow(900 / 3400, t / 0.2),
      q: 1.5,
      amp: (t) => envAD(t, 0.01, 0.05),
    }),
  );
  return out;
}

/** item.crossbow.hit: the bolt drives in with a solid, dull thunk and a short shiver of the shaft */
function hit(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  const f = rng.range(290, 380);
  layer(out, 1, (b) => {
    impact(b, sr, rng, {
      modes: [f, 1, 0.07, f * 2.31, 0.55, 0.045, f * 3.93, 0.3, 0.028, f * 6.1, 0.14, 0.016],
      jitter: 0.02,
      noise: 1,
      noiseTau: 0.0025,
      noiseBp: [1300, 0.8],
    });
    thump(b, sr, { f0: rng.range(150, 180), f1: rng.range(80, 100), glide: 0.018, tau: 0.035, amp: 0.45 });
  });
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.012, tau: 0.0015, bp: [3800, 1] }));
  const fv = rng.range(60, 85);
  const fc = fv * rng.range(3.5, 4.5);
  layer(out, 0.25, (b) => addOsc(b, sr, 0.006, 0.3, () => fc, (t) => envAD(t, 0.003, 0.07) * (0.5 + 0.5 * Math.sin(TAU * fv * t))));
  return out;
}

export function crossbowSounds(): Record<string, SoundGen> {
  return {
    'item.crossbow.loading_start': sound('item.crossbow.loading_start', 1, loadingStart),
    'item.crossbow.loading_middle': sound('item.crossbow.loading_middle', 4, loadingMiddle),
    'item.crossbow.loading_end': sound('item.crossbow.loading_end', 1, loadingEnd),
    'item.crossbow.quick_charge_1': sound('item.crossbow.quick_charge_1', 1, quickCharge(1)),
    'item.crossbow.quick_charge_2': sound('item.crossbow.quick_charge_2', 1, quickCharge(2)),
    'item.crossbow.quick_charge_3': sound('item.crossbow.quick_charge_3', 1, quickCharge(3)),
    'item.crossbow.shoot': sound('item.crossbow.shoot', 3, shoot),
    'item.crossbow.hit': sound('item.crossbow.hit', 4, hit),
  };
}
