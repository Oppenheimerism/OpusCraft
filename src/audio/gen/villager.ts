// Villager voice and work foley (vanilla entity.villager.*): the famous nasal "hrmm", as a closed-mouth hum with a
// rolled burr that opens now and then to an "uh" (formant synthesis, in the style of netherMobs' hmm), and the
// sounds of each profession at its workstation.

import type { SoundGen } from '../synth';
import { alloc, envBump, envAD, layer, lowpass, highpass } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, fireCrackles, impact, phisem, sweep, ticks, bubble, thump } from './texture';
import { voice } from './voice';

interface Hum {
  t: number;
  d: number;
  /** pitch over normalised time, as a multiple of the voice's base */
  f: (x: number) => number;
  a?: number;
  /** 0: lips shut ("mm") .. 1: an open "uh" in the middle */
  open?: number;
  /** the rolled "r" flutter */
  burr?: number;
}

/** one hum of a villager's voice */
function humInto(b: Float32Array, c: Ctx, base: number, h: Hum): void {
  const { sr, rng } = c;
  const d = h.d, open = h.open ?? 0, burr = h.burr ?? 0.25;
  const att = Math.min(0.045, d * 0.2);
  // (the mouth opens in the middle of the hum and closes again)
  const o = (t: number) => open * Math.sin(Math.PI * Math.min(1, t / d));
  voice(b, sr, rng, {
    t: h.t,
    dur: d,
    f0: (t) => base * h.f(t / d),
    amp: (t) => envBump(t, att, d - att),
    formants: [
      { f: (t) => 260 + 330 * o(t), bw: (t) => 70 + 60 * o(t), g: 1 },
      { f: (t) => 1000 + 150 * o(t), bw: 110, g: (t) => 0.32 + 0.35 * o(t) },
      { f: (t) => 2150 + 350 * o(t), bw: 230, g: (t) => 0.1 + 0.12 * o(t) },
      { f: 3100, bw: 320, g: 0.035 },
    ],
    jitter: 0.022,
    shimmer: 0.07,
    rough: burr,
    sub: 0.02,
    breath: 0.07,
    oq: 0.55,
    growl: [rng.range(24, 31), burr * 0.55],
    vib: [5.5, 0.009],
    gain: h.a ?? 1,
  });
}

function hums(c: Ctx, len: number, base: number, list: Hum[]): Float32Array {
  const out = alloc(len, c.sr);
  layer(out, 1, (b) => {
    for (const h of list) humInto(b, c, base, h);
  });
  // (a breath of air out of the nose at the start)
  layer(out, 0.05, (b) => burst(b, c.sr, c.rng, { t: list[0].t, dur: 0.06, tau: 0.02, bp: [1800, 1.2] }));
  highpass(out, 70, c.sr);
  lowpass(out, 5200, c.sr);
  return out;
}

const voiceBase = (c: Ctx) => c.rng.range(128, 150);

/** vanilla mob/villager/idle1-3: "hrmm", "hmm?", "hurr" */
function ambient(c: Ctx): Float32Array {
  const b = voiceBase(c);
  switch (c.v % 3) {
    case 0:
      return hums(c, 0.7, b, [{ t: 0, d: 0.48, f: (x) => 1.08 - 0.16 * x, burr: 0.32 }]);
    case 1:
      return hums(c, 0.6, b, [{ t: 0, d: 0.36, f: (x) => 0.96 + 0.3 * x * x, burr: 0.18 }]);
    default:
      return hums(c, 0.7, b, [{ t: 0, d: 0.42, f: (x) => 1.02 + 0.08 * Math.sin(Math.PI * x), open: 0.45, burr: 0.38 }]);
  }
}

/** vanilla mob/villager/trade1-3: interested, asking "hmm?", "hm-hmm?" */
function trade(c: Ctx): Float32Array {
  const b = voiceBase(c);
  switch (c.v % 3) {
    case 0:
      return hums(c, 0.7, b, [{ t: 0, d: 0.45, f: (x) => 0.94 + 0.36 * Math.pow(x, 1.6), burr: 0.2 }]);
    case 1:
      return hums(c, 0.8, b, [{ t: 0, d: 0.16, f: () => 1.0, burr: 0.15 }, { t: 0.22, d: 0.32, f: (x) => 1.02 + 0.3 * x, burr: 0.2 }]);
    default:
      return hums(c, 0.7, b, [{ t: 0, d: 0.42, f: (x) => 1.12 - 0.08 * x + 0.3 * Math.max(0, x - 0.6), open: 0.3, burr: 0.25 }]);
  }
}

/** vanilla mob/villager/yes1-3: pleased "hm-hm!", "mm-hmm" */
function yes(c: Ctx): Float32Array {
  const b = voiceBase(c) * 1.05;
  switch (c.v % 3) {
    case 0:
      return hums(c, 0.6, b, [{ t: 0, d: 0.13, f: () => 1.0, burr: 0.12 }, { t: 0.17, d: 0.2, f: (x) => 1.12 + 0.12 * x, burr: 0.12 }]);
    case 1:
      return hums(c, 0.6, b, [{ t: 0, d: 0.18, f: (x) => 0.95 - 0.05 * x, burr: 0.15 }, { t: 0.22, d: 0.24, f: (x) => 1.08 + 0.18 * x, burr: 0.15 }]);
    default:
      return hums(c, 0.5, b, [{ t: 0, d: 0.3, f: (x) => 1.02 + 0.3 * Math.sin(Math.PI * 0.6 * x), open: 0.35, burr: 0.12 }]);
  }
}

/** vanilla mob/villager/no1-3: the grumbled "hrrm", "mm-mm", "huh-uh" */
function no(c: Ctx): Float32Array {
  const b = voiceBase(c) * 0.94;
  switch (c.v % 3) {
    case 0:
      return hums(c, 0.7, b, [{ t: 0, d: 0.46, f: (x) => 1.06 - 0.26 * x, burr: 0.45 }]);
    case 1:
      return hums(c, 0.7, b, [{ t: 0, d: 0.2, f: (x) => 1.05 - 0.06 * x, burr: 0.3 }, { t: 0.25, d: 0.26, f: (x) => 0.94 - 0.14 * x, burr: 0.35 }]);
    default:
      return hums(c, 0.7, b, [{ t: 0, d: 0.16, f: () => 1.08, open: 0.6, burr: 0.25 }, { t: 0.22, d: 0.28, f: (x) => 0.92 - 0.12 * x, burr: 0.4 }]);
  }
}

/** vanilla mob/villager/hit1-4: a short, pained "hurh!" */
function hurt(c: Ctx): Float32Array {
  const b = voiceBase(c) * c.rng.range(1.15, 1.3);
  return hums(c, 0.45, b, [{ t: 0, d: c.rng.range(0.18, 0.24), f: (x) => 1.1 - 0.25 * x, open: 0.85, burr: 0.3, a: 1 }]);
}

/** vanilla mob/villager/death: a long, sinking "hrrrmmm..." */
function death(c: Ctx): Float32Array {
  const b = voiceBase(c) * 1.1;
  return hums(c, 1.4, b, [{ t: 0, d: 1.1, f: (x) => 1.05 - 0.4 * x + 0.06 * Math.sin(Math.PI * 3 * x), open: 0.5, burr: 0.5 }]);
}

/** vanilla mob/villager/celebrate: a delighted "hm-hm-hmm!" */
function celebrate(c: Ctx): Float32Array {
  const b = voiceBase(c) * 1.1;
  return hums(c, 0.9, b, [
    { t: 0, d: 0.12, f: () => 1.0, burr: 0.1 },
    { t: 0.16, d: 0.12, f: () => 1.12, burr: 0.1 },
    { t: 0.32, d: 0.34, f: (x) => 1.26 - 0.1 * x, open: 0.4, burr: 0.12 },
  ]);
}

// ---------------------------------------------------------------------------
// work foley (vanilla entity.villager.work_<profession>: the sounds of each workstation)

/** a blast furnace or smoker's fire roaring up */
function workFire(c: Ctx, dark: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.2, sr);
  layer(out, 0.6, (b) => sweep(b, sr, rng, { dur: 1.1, f: (t) => (dark ? 380 : 600) + 400 * t, q: 0.8, amp: (t) => envBump(t, 0.25, 0.8), mode: 'bp' }));
  layer(out, 1, (b) => fireCrackles(b, sr, rng, 0, 1.1, 18, 2));
  return out;
}

/** a pen or stylus scratching across paper (the cartography table) */
function workCartographer(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  let t = 0;
  layer(out, 1, (b) => {
    for (let i = 0; i < 3 + rng.int(2); i++) {
      const d = rng.range(0.08, 0.16);
      phisem(b, sr, rng, { t, dur: d, rate: 900, energy: (x) => envBump(x, 0.02, d - 0.02), grain: 0.0012, bands: [{ f: 4200, q: 2, g: 1, spread: 0.2 }, { f: 2400, q: 1.5, g: 0.5 }] });
      t += d + rng.range(0.03, 0.08);
    }
  });
  return out;
}

/** bubbling at the brewing stand */
function workCleric(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1, sr);
  layer(out, 1, (b) => {
    for (let i = 0; i < 14; i++) bubble(b, sr, rng.range(0, 0.8), rng.range(500, 1400), rng.range(0.3, 1));
  });
  return out;
}

/** a scoop of scraps squelching into the composter */
function workFarmer(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => phisem(b, sr, rng, { dur: 0.5, rate: 700, energy: (t) => envAD(t, 0.02, 0.15), grain: 0.004, heavy: 2, bands: [{ f: 700, q: 1.2, g: 1, spread: 0.3 }, { f: 1600, q: 2, g: 0.5, spread: 0.3 }] }));
  layer(out, 0.4, (b) => thump(b, sr, { f0: 140, f1: 90, tau: 0.06 }));
  return out;
}

/** a barrel's lid thumped open (fisherman) */
function workFisherman(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: [180, 1, 0.12, 410, 0.6, 0.08, 730, 0.3, 0.05], jitter: 0.05, noise: 0.5, noiseTau: 0.02, noiseBp: [900, 1] }));
  layer(out, 0.35, (b) => phisem(b, sr, rng, { t: 0.05, dur: 0.3, rate: 400, energy: (t) => envAD(t, 0.01, 0.1), grain: 0.003, bands: [{ f: 1400, q: 3, g: 1, spread: 0.2 }] }));
  return out;
}

/** a knife whittling an arrow shaft (fletching table) */
function workFletcher(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => {
    for (let i = 0; i < 2; i++) sweep(b, sr, rng, { t: i * 0.25, dur: 0.18, f: (t) => 2600 - 4000 * t, q: 3, amp: (t) => envBump(t, 0.02, 0.15), mode: 'bp' });
  });
  return out;
}

/** leather slapped down and smoothed (the cauldron, leatherworker) */
function workLeatherworker(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.12, tau: 0.03, bp: [600, 0.9], color: 'brown' }));
  layer(out, 0.6, (b) => sweep(b, sr, rng, { t: 0.15, dur: 0.3, f: (t) => 900 + 600 * t, q: 1.2, amp: (t) => envBump(t, 0.05, 0.25), mode: 'bp' }));
  return out;
}

/** a page turned at the lectern */
function workLibrarian(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => phisem(b, sr, rng, { dur: 0.4, rate: 1200, energy: (t) => envBump(t, 0.12, 0.25), grain: 0.0015, bands: [{ f: 3000, q: 0.8, g: 1, spread: 0.3 }, { f: 6000, q: 1, g: 0.5 }] }));
  return out;
}

/** a stone block run through the stonecutter's saw */
function workMason(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: 0.75, f: () => 2200, q: 6, amp: (t) => envBump(t, 0.05, 0.65), mode: 'bp' }));
  layer(out, 0.5, (b) => ticks(b, sr, rng, { dur: 0.7, rate: 60, energy: () => 1, f: [1800, 4200], t60: [0.01, 0.03] }));
  return out;
}

/** the loom's shuttle knocked across (shepherd) */
function workShepherd(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => {
    impact(b, sr, rng, { modes: [520, 1, 0.05, 1310, 0.5, 0.03], jitter: 0.04, noise: 0.4, noiseTau: 0.008, noiseBp: [1800, 1] });
    impact(b, sr, rng, { t: 0.2, modes: [480, 0.8, 0.05, 1200, 0.4, 0.03], jitter: 0.04, noise: 0.4, noiseTau: 0.008, noiseBp: [1800, 1] });
  });
  return out;
}

/** a hammer on the smithing table */
function workToolsmith(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  layer(out, 1, (b) => {
    for (let i = 0; i < 2; i++) impact(b, sr, rng, { t: i * 0.22, modes: [1650, 1, 0.35, 2750, 0.6, 0.25, 4100, 0.35, 0.15], jitter: 0.02, noise: 0.3, noiseTau: 0.004, noiseBp: [3000, 1] });
  });
  return out;
}

export function villagerSounds(): Record<string, SoundGen> {
  return {
    'entity.villager.ambient': sound('entity.villager.ambient', 3, ambient),
    'entity.villager.trade': sound('entity.villager.trade', 3, trade),
    'entity.villager.yes': sound('entity.villager.yes', 3, yes),
    'entity.villager.no': sound('entity.villager.no', 3, no),
    'entity.villager.hurt': sound('entity.villager.hurt', 4, hurt),
    'entity.villager.death': sound('entity.villager.death', 1, death),
    'entity.villager.celebrate': sound('entity.villager.celebrate', 2, celebrate),
    'entity.villager.work_armorer': sound('entity.villager.work_armorer', 3, (c) => workFire(c, false)),
    'entity.villager.work_butcher': sound('entity.villager.work_butcher', 3, (c) => workFire(c, true)),
    'entity.villager.work_cartographer': sound('entity.villager.work_cartographer', 3, workCartographer),
    'entity.villager.work_cleric': sound('entity.villager.work_cleric', 2, workCleric),
    'entity.villager.work_farmer': sound('entity.villager.work_farmer', 3, workFarmer),
    'entity.villager.work_fisherman': sound('entity.villager.work_fisherman', 2, workFisherman),
    'entity.villager.work_fletcher': sound('entity.villager.work_fletcher', 3, workFletcher),
    'entity.villager.work_leatherworker': sound('entity.villager.work_leatherworker', 3, workLeatherworker),
    'entity.villager.work_librarian': sound('entity.villager.work_librarian', 3, workLibrarian),
    'entity.villager.work_mason': sound('entity.villager.work_mason', 2, workMason),
    'entity.villager.work_shepherd': sound('entity.villager.work_shepherd', 2, workShepherd),
    'entity.villager.work_toolsmith': sound('entity.villager.work_toolsmith', 3, workToolsmith),
  };
}
