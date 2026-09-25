// (trial chambers) The 1.21 sound types and events: tuff, polished tuff and tuff bricks (vanilla SoundType.TUFF,
// POLISHED_TUFF, TUFF_BRICKS: stone, grittier, cleaner or blockier), copper (SoundType.COPPER: a short, soft metal
// ring, duller than iron), the copper grate (rattling bars), the copper bulb (a clink with a glassy ring), the heavy
// core (a dense, low thud), the copper bulb switching on and off, the copper door and trapdoor opening and closing
// (BlockSetType.COPPER), an axe scraping copper back an age or its wax off, and honeycomb waxing it.

import type { SoundGen } from '../synth';
import { alloc, envBump, layer, addOsc } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { burst, creak, impact, phisem, sweep, thump, ticks, type Band } from './texture';
import { stoneBreak, stoneStep } from './blocks';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ tuff

/** tuff's crumble: a stone footfall with sandy grit trickling after it */
function tuffStep(c: Ctx, deep: number, grit: number): Float32Array {
  const { sr, rng } = c;
  const out = stoneStep(c, deep);
  layer(out, 0.3 * grit, (b) =>
    phisem(b, sr, rng, {
      t: 0.01,
      dur: 0.16,
      rate: 2400,
      energy: (t) => Math.exp(-t / 0.035),
      grain: 0.0005,
      heavy: 2.2,
      bands: [
        { f: 2600 * deep, q: 1.4, g: 1, spread: 0.4 },
        { f: 5200 * deep, q: 1.8, g: 0.4, spread: 0.3 },
      ],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ copper

/** a struck copper plate: a handful of soft, quickly damped partials over a knock */
function copperRing(b: Float32Array, sr: number, c: Ctx, t: number, f: number, ring: number, a = 1): void {
  impact(b, sr, c.rng, {
    t,
    modes: [
      f, a, 0.16 * ring,
      f * 1.62, 0.7 * a, 0.12 * ring,
      f * 2.41, 0.5 * a, 0.09 * ring,
      f * 3.55, 0.3 * a, 0.06 * ring,
      f * 5.2, 0.18 * a, 0.04 * ring,
    ],
    jitter: 0.02,
    noise: 1.1 * a,
    noiseTau: 0.0025,
    noiseBp: [2600, 0.8],
  });
}

function copperStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const f = rng.range(720, 980);
  layer(out, 1, (b) => copperRing(b, sr, c, 0, f, 0.8));
  layer(out, 0.35, (b) => thump(b, sr, { f0: 150, f1: 110, tau: 0.02 }));
  layer(out, 0.35, (b) => copperRing(b, sr, c, rng.range(0.035, 0.06), f * rng.range(1.05, 1.2), 0.5, 0.6));
  return out;
}

function copperBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const f = rng.range(460, 620);
  layer(out, 1, (b) => copperRing(b, sr, c, 0, f, 2));
  layer(out, 0.5, (b) => thump(b, sr, { f0: 140, f1: 90, tau: 0.04 }));
  layer(out, 0.3, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.25,
      rate: 1400,
      energy: (t) => Math.exp(-t / 0.06),
      grain: 0.001,
      heavy: 3,
      bands: [
        { f: 2200, q: 2.5, g: 1, spread: 0.4 },
        { f: 4200, q: 2, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  return out;
}

/** the copper grate: its bars rattle against each other after the knock */
function grateSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(brk ? 0.55 : 0.3, sr);
  const f = rng.range(brk ? 560 : 820, brk ? 720 : 1100);
  layer(out, 0.8, (b) => copperRing(b, sr, c, 0, f, brk ? 1.2 : 0.6));
  layer(out, 0.7, (b) =>
    ticks(b, sr, rng, {
      t: 0.01,
      dur: brk ? 0.4 : 0.18,
      rate: brk ? 90 : 60,
      energy: (t) => Math.exp(-t / (brk ? 0.12 : 0.05)),
      f: [1400, 4200],
      t60: [0.02, 0.08],
      ratios: [1, 1.71, 2.63],
      weights: [1, 0.55, 0.3],
      heavy: 1.5,
      click: 0.4,
    }),
  );
  return out;
}

/** the copper bulb: a light metal clink and the glass ringing in it */
function bulbSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(brk ? 0.6 : 0.32, sr);
  const f = rng.range(brk ? 620 : 900, brk ? 800 : 1200);
  layer(out, 0.85, (b) => copperRing(b, sr, c, 0, f, brk ? 1.4 : 0.7));
  const g = rng.range(2600, 3400);
  layer(out, brk ? 0.55 : 0.4, (b) =>
    impact(b, sr, rng, { t: 0.003, modes: [g, 1, brk ? 0.18 : 0.1, g * 1.73, 0.6, brk ? 0.12 : 0.07, g * 2.61, 0.35, 0.05], jitter: 0.01 }),
  );
  return out;
}

/** the heavy core: a dense lump set down, a low thud and a short dull ring */
function heavyCoreSound(c: Ctx, brk: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(brk ? 0.55 : 0.3, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: brk ? 110 : 140, f1: brk ? 60 : 85, tau: brk ? 0.07 : 0.035, h2: 0.3 }));
  const f = rng.range(brk ? 240 : 320, brk ? 300 : 420);
  layer(out, 0.6, (b) =>
    impact(b, sr, rng, {
      t: 0.002,
      modes: [f, 1, brk ? 0.12 : 0.06, f * 2.02, 0.5, brk ? 0.08 : 0.04, f * 3.9, 0.25, 0.03],
      jitter: 0.02,
      noise: 0.9,
      noiseTau: 0.003,
      noiseBp: [1400, 0.8],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ the copper bulb switching

/** vanilla block.copper_bulb.turn_on / turn_off: a relay's click, and a brief electric hum rising (or dying away) */
function bulbSwitch(c: Ctx, on: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  const k = rng.range(2600, 3200);
  layer(out, 0.8, (b) => impact(b, sr, rng, { modes: [k, 1, 0.02, k * 1.6, 0.5, 0.012], noise: 1, noiseTau: 0.0012, noiseBp: [4500, 1] }));
  const f0 = rng.range(110, 130);
  const hum = (b: Float32Array) => {
    const dur = 0.3;
    for (const [h, a] of [[1, 1], [2, 0.6], [3, 0.35], [5, 0.2], [7, 0.12]] as [number, number][])
      addOsc(b, sr, 0.01, dur, (t) => f0 * h * (on ? 1 + 0.25 * (t / dur) : 1.25 - 0.3 * (t / dur)), (t) => a * envBump(t, on ? 0.12 : 0.02, on ? 0.18 : 0.28));
    burst(b, sr, rng, { t: 0.01, dur, tau: 0.08, amp: 0.25, bp: [on ? 5000 : 3500, 1.5], env: (t) => envBump(t, 0.03, dur - 0.03) });
  };
  layer(out, 0.6, hum);
  return out;
}

// ------------------------------------------------------------------ copper doors

const COPPER_BODY: Band[] = [
  { f: 520, q: 11, g: 1 },
  { f: 1260, q: 12, g: 0.75 },
  { f: 2380, q: 10, g: 0.45 },
  { f: 3900, q: 9, g: 0.25 },
];

/** a copper door or trapdoor swinging open: a light clank and a thin metal creak */
function copperOpen(c: Ctx, trap: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(trap ? 0.6 : 0.8, sr);
  layer(out, 0.7, (b) => copperRing(b, sr, c, 0, rng.range(trap ? 480 : 380, trap ? 560 : 460), 1.1));
  const cd = trap ? rng.range(0.18, 0.24) : rng.range(0.35, 0.45);
  const r0 = rng.range(90, 120);
  layer(out, 0.9, (b) =>
    creak(b, sr, rng, {
      t: 0.04,
      dur: cd,
      rate: (t) => r0 * (1 - (0.3 * t) / cd) * (1 + 0.07 * Math.sin(TAU * 4 * t)),
      amp: (t) => envBump(t, cd * 0.3, cd * 0.7),
      jitter: 0.14,
      bands: COPPER_BODY,
    }),
  );
  if (trap) layer(out, 0.7, (b) => copperRing(b, sr, c, 0.04 + cd * 0.9, rng.range(520, 640), 0.9));
  return out;
}

/** swinging shut: a short creak and the clank as it meets the frame */
function copperClose(c: Ctx, trap: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(trap ? 0.55 : 0.7, sr);
  const cd = trap ? 0.06 : 0.1;
  layer(out, 0.35, (b) =>
    creak(b, sr, rng, { dur: cd, rate: (t) => 110 + (40 * t) / cd, amp: (t) => envBump(t, cd * 0.3, cd * 0.7), jitter: 0.14, bands: COPPER_BODY }),
  );
  const tt = cd * 0.9;
  layer(out, 1, (b) => copperRing(b, sr, c, tt, rng.range(trap ? 460 : 340, trap ? 560 : 420), 1.3));
  layer(out, 0.5, (b) => thump(b, sr, { t: tt, f0: trap ? 120 : 95, f1: 65, tau: trap ? 0.03 : 0.045 }));
  return out;
}

// ------------------------------------------------------------------ scraping and waxing

/** vanilla item.axe.scrape: the blade dragged across the patina in a couple of strokes, rasping and ringing */
function axeScrape(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  const strokes = 2 + (c.v % 2);
  const len = 0.55 / strokes;
  for (let s = 0; s < strokes; s++) {
    const t0 = s * len + rng.range(0, 0.03);
    const f0 = rng.range(2400, 3600);
    layer(out, 0.8, (b) =>
      sweep(b, sr, rng, {
        t: t0,
        dur: len * 0.9,
        f: (t) => f0 * (1 + 0.3 * (t / len)),
        q: 3,
        amp: (t) => envBump(t, len * 0.15, len * 0.7) * (1 + 0.4 * Math.sin(TAU * 38 * t)),
      }),
    );
    layer(out, 0.35, (b) => copperRing(b, sr, c, t0 + 0.01, rng.range(900, 1300), 0.6, 0.6));
  }
  return out;
}

/** vanilla item.axe.wax_off: a softer scrape, the wax squeaking as it peels */
function waxOff(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const len = rng.range(0.35, 0.45);
  layer(out, 0.6, (b) =>
    sweep(b, sr, rng, { dur: len, f: (t) => 1800 + 900 * (t / len), q: 2.2, amp: (t) => envBump(t, 0.02, len * 0.8) }),
  );
  const f0 = rng.range(900, 1200);
  layer(out, 0.4, (b) =>
    addOsc(b, sr, 0.03, len * 0.6, (t) => f0 * (1 + 0.5 * Math.sin((TAU * t) / (len * 1.2))), (t) => envBump(t, 0.04, len * 0.5) * (0.6 + 0.4 * Math.sin(TAU * 22 * t))),
  );
  return out;
}

/** vanilla item.honeycomb.wax_on: the comb smeared over the metal, sticky and wet */
function waxOn(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  const len = rng.range(0.3, 0.4);
  layer(out, 0.7, (b) =>
    sweep(b, sr, rng, { t: 0.01, dur: len, f: (t) => 900 + 500 * Math.sin((Math.PI * t) / len), q: 1.6, amp: (t) => envBump(t, len * 0.25, len * 0.7), color: 'pink' }),
  );
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      t: 0.02,
      dur: len,
      rate: 180,
      energy: (t) => envBump(t, len * 0.3, len * 0.7),
      grain: 0.004,
      heavy: 2,
      bands: [
        { f: 700, q: 3, g: 1, spread: 0.3 },
        { f: 1600, q: 3, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  return out;
}

export function copperTuffSounds(): Record<string, SoundGen> {
  const S: Record<string, SoundGen> = {};
  const set = (mat: string, brk: SoundGen, step: SoundGen, place: SoundGen = brk, hit: SoundGen = pitched(step, 0.5)) => {
    S[`block.${mat}.break`] = brk;
    S[`block.${mat}.step`] = step;
    S[`block.${mat}.place`] = place;
    S[`block.${mat}.hit`] = hit;
    // (vanilla SoundType's fall sound: the step's, lower)
    S[`block.${mat}.fall`] = pitched(step, 0.75);
  };
  set('tuff', sound('block.tuff.break', 5, (c) => stoneBreak(c, 0.82, 1.35)), sound('block.tuff.step', 6, (c) => tuffStep(c, 0.84, 1)));
  set('polished_tuff', sound('block.polished_tuff.break', 5, (c) => stoneBreak(c, 0.9, 0.55)), sound('block.polished_tuff.step', 6, (c) => tuffStep(c, 0.92, 0.3)));
  set('tuff_bricks', sound('block.tuff_bricks.break', 5, (c) => stoneBreak(c, 0.76, 0.8)), sound('block.tuff_bricks.step', 6, (c) => tuffStep(c, 0.74, 0.55)));
  set('copper', sound('block.copper.break', 4, copperBreak), sound('block.copper.step', 6, copperStep));
  set('copper_grate', sound('block.copper_grate.break', 4, (c) => grateSound(c, true)), sound('block.copper_grate.step', 6, (c) => grateSound(c, false)));
  set('copper_bulb', sound('block.copper_bulb.break', 4, (c) => bulbSound(c, true)), sound('block.copper_bulb.step', 6, (c) => bulbSound(c, false)));
  set('heavy_core', sound('block.heavy_core.break', 4, (c) => heavyCoreSound(c, true)), sound('block.heavy_core.step', 5, (c) => heavyCoreSound(c, false)));
  S['block.copper_bulb.turn_on'] = sound('block.copper_bulb.turn_on', 3, (c) => bulbSwitch(c, true));
  S['block.copper_bulb.turn_off'] = sound('block.copper_bulb.turn_off', 3, (c) => bulbSwitch(c, false));
  S['block.copper_door.open'] = sound('block.copper_door.open', 4, (c) => copperOpen(c, false));
  S['block.copper_door.close'] = sound('block.copper_door.close', 4, (c) => copperClose(c, false));
  S['block.copper_trapdoor.open'] = sound('block.copper_trapdoor.open', 4, (c) => copperOpen(c, true));
  S['block.copper_trapdoor.close'] = sound('block.copper_trapdoor.close', 4, (c) => copperClose(c, true));
  S['item.axe.scrape'] = sound('item.axe.scrape', 3, axeScrape);
  S['item.axe.wax_off'] = sound('item.axe.wax_off', 3, waxOff);
  S['item.honeycomb.wax_on'] = sound('item.honeycomb.wax_on', 3, waxOn);
  return S;
}
