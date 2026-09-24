// Village block sounds: vanilla block/bell/bell_use01-02 (the bell struck), block/barrel/open1-2 and close
// (the lid), block/composter/fill1-4, fill_success1-4, empty1-3 and ready1-4, block/smoker/smoke1-6 and
// block/blast_furnace/fire_crackle1-5, item/book/close_put1 and open_flip1-3 (a book laid down, a page turned), block/campfire/crackle1-6.

import type { SoundGen } from '../synth';
import { alloc, layer, envBump } from './dsp';
import { type Ctx, sound } from './registry';
import { impact, thump, creak, phisem, burst, ticks, bubble, fireCrackles, type Band } from './texture';

// ------------------------------------------------------------------ bell

/**
 * the partials of a tuned bell over its prime: hum (an octave under), prime, tierce (a minor third), quint, nominal
 * (an octave over, the note it is heard as), then the thinner upper ones; [ratio, level, seconds to die away]
 */
const BELL_PARTIALS: [number, number, number][] = [
  [0.5, 0.5, 5.5],
  [1, 0.75, 4.5],
  [1.2, 0.55, 3.2],
  [1.5, 0.22, 2.6],
  [2, 1, 3.4],
  [2.51, 0.3, 1.8],
  [2.66, 0.24, 1.6],
  [3.01, 0.32, 1.4],
  [4.07, 0.14, 0.9],
  [5.2, 0.07, 0.5],
];

/** a cast bell struck once by its clapper: a bright clang over a long ring that beats as it dies away */
function bellUse(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(5.5, sr);
  const f = v === 0 ? 392 : 370;
  layer(out, 1, (b) => {
    const modes: number[] = [];
    for (const [r, a, t60] of BELL_PARTIALS) {
      modes.push(f * r, a, t60);
      // (no casting is perfectly round: each partial is a close pair, and the pair beats)
      modes.push(f * r * (1 + rng.range(0.0012, 0.0035)), a * 0.5, t60 * 0.85);
    }
    impact(b, sr, rng, { modes, jitter: 0.001, noise: 0.5, noiseTau: 0.0012, noiseBp: [3500, 0.9] });
  });
  // the clapper's knock on the lip
  layer(out, 0.2, (b) => thump(b, sr, { f0: 300, f1: 210, tau: 0.006 }));
  return out;
}

// ------------------------------------------------------------------ barrel

/** a barrel's hollow wooden body */
const BARREL_BODY: Band[] = [
  { f: 170, q: 4, g: 1 },
  { f: 410, q: 6, g: 0.8 },
  { f: 880, q: 6, g: 0.5 },
  { f: 1750, q: 5, g: 0.25 },
];

/** the lid pried up: a short creak of wood on wood, and a knock as it comes free of the rim */
function barrelOpen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const cd = rng.range(0.16, 0.24);
  const r0 = rng.range(95, 130);
  layer(out, 0.7, (b) =>
    creak(b, sr, rng, { dur: cd, rate: (t) => r0 + (70 * t) / cd, amp: (t) => envBump(t, cd * 0.35, cd * 0.65), jitter: 0.15, bands: BARREL_BODY }),
  );
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      t: cd * 0.75,
      modes: [200, 1, 0.09, 460, 0.65, 0.06, 830, 0.4, 0.045, 1450, 0.2, 0.03],
      jitter: 0.05,
      noise: 0.7,
      noiseTau: 0.003,
      noiseBp: [1200, 0.8],
    }),
  );
  layer(out, 0.3, (b) => thump(b, sr, { t: cd * 0.75, f0: 120, f1: 80, tau: 0.045 }));
  return out;
}

/** the lid dropped back on: a hollow thunk, the body booming under it */
function barrelClose(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [150, 1, 0.16, 340, 0.75, 0.1, 620, 0.45, 0.07, 1100, 0.25, 0.04, 1900, 0.12, 0.025],
      jitter: 0.03,
      noise: 0.9,
      noiseTau: 0.004,
      noiseBp: [1000, 0.8],
    }),
  );
  layer(out, 0.55, (b) => thump(b, sr, { f0: 95, f1: 65, tau: 0.07 }));
  return out;
}

// ------------------------------------------------------------------ composter

/** leaves, stalks and scraps tumbling in: a soft wet rustle (the successful ones land with a squelch) */
function composterFill(c: Ctx, success: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const en = (t: number) => (1 - Math.exp(-t / 0.01)) * Math.exp(-t / (success ? 0.09 : 0.06));
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.4,
      rate: 6000,
      energy: en,
      grain: 0.0011,
      heavy: 2.2,
      bands: [
        { f: 2300, q: 1.2, g: 1, spread: 0.35 },
        { f: 1100, q: 1.5, g: 0.8, spread: 0.3 },
        { f: 4200, q: 1.3, g: 0.3, spread: 0.2 },
      ],
    }),
  );
  layer(out, success ? 0.5 : 0.3, (b) => burst(b, sr, rng, { t: 0.01, dur: 0.14, attack: 0.006, tau: 0.035, lp: 700 }));
  if (success) {
    layer(out, 0.45, (b) => thump(b, sr, { t: 0.015, f0: 190, f1: 110, tau: 0.035 }));
    layer(out, 0.25, (b) => {
      for (let k = 0; k < 3; k++) bubble(b, sr, rng.range(0.02, 0.12), rng.range(450, 900), rng.range(0.5, 1), undefined, 0.5);
    });
  }
  return out;
}

/** the ready compost scooped out: a crumbly rustle and the bone meal rattling free */
function composterEmpty(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const en = (t: number) => (1 - Math.exp(-t / 0.012)) * (0.7 * Math.exp(-t / 0.1) + 0.3 * Math.exp(-t / 0.25));
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.55,
      rate: 9000,
      energy: en,
      grain: 0.0009,
      heavy: 2.4,
      bands: [
        { f: 2800, q: 1.1, g: 1, spread: 0.4 },
        { f: 1300, q: 1.4, g: 0.8, spread: 0.3 },
        { f: 5200, q: 1.3, g: 0.35, spread: 0.25 },
      ],
    }),
  );
  layer(out, 0.4, (b) => ticks(b, sr, rng, { t: 0.03, dur: 0.3, rate: 60, energy: en, f: [1500, 4000], t60: [0.01, 0.03], click: 0.4 }));
  layer(out, 0.35, (b) => thump(b, sr, { f0: 160, f1: 100, tau: 0.04 }));
  return out;
}

/** the compost has turned: a fat, satisfying pop out of the settling rustle */
function composterReady(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 0.6, (b) =>
    phisem(b, sr, rng, {
      dur: 0.35,
      rate: 5000,
      energy: (t) => (1 - Math.exp(-t / 0.02)) * Math.exp(-t / 0.08),
      grain: 0.0012,
      heavy: 2,
      bands: [
        { f: 2000, q: 1.3, g: 1, spread: 0.3 },
        { f: 900, q: 1.6, g: 0.7, spread: 0.3 },
      ],
    }),
  );
  const f0 = rng.range(520, 680);
  layer(out, 1, (b) => bubble(b, sr, 0.04, f0, 1, 0.05, 1.2));
  layer(out, 0.6, (b) => thump(b, sr, { t: 0.035, f0: 240, f1: 140, tau: 0.05 }));
  return out;
}

// ------------------------------------------------------------------ smoker, blast furnace

/** the smoker at work: a soft breath of smoke through the flue over a low, sizzling crackle */
function smokerSmoke(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.1, 1.5);
  const out = alloc(d, sr);
  layer(out, 0.55, (b) => burst(b, sr, rng, { dur: d, attack: 0.25, tau: d, bp: [900, 0.6], env: (t) => envBump(t, 0.3, d - 0.3) }));
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: d, attack: 0.2, tau: d, hp: 3000, env: (t) => envBump(t, 0.25, d - 0.25) * (0.7 + 0.3 * Math.sin(t * 23)) }));
  layer(out, 1, (b) => fireCrackles(b, sr, rng, 0.05, d - 0.1, rng.range(8, 14), 0.15));
  return out;
}

/** the blast furnace roaring: hard, quick crackles over the rumble of a forced fire */
function blastFurnaceCrackle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.0, 1.4);
  const out = alloc(d, sr);
  layer(out, 1, (b) => fireCrackles(b, sr, rng, 0.005, d - 0.05, rng.range(25, 38), 0.35));
  layer(out, 0.4, (b) => burst(b, sr, rng, { dur: d, attack: 0.1, tau: d, lp: 260, color: 'brown', env: (t) => envBump(t, 0.15, d - 0.15) }));
  return out;
}

// ------------------------------------------------------------------ campfire

/** a campfire's logs crackling: snaps and pops scattered over the soft flutter of the flames */
function campfireCrackle(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.6, 2.6);
  const out = alloc(d, sr);
  layer(out, 1, (b) => fireCrackles(b, sr, rng, 0.01, d - 0.1, rng.range(9, 16), 0.3));
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: d, attack: 0.25, tau: d, lp: 380, color: 'brown', env: (t) => envBump(t, 0.3, d - 0.3) }));
  return out;
}

// ------------------------------------------------------------------ books

/** a book laid down on the lectern: the soft slap of its cover, and its pages settling */
function bookPut(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.002, tau: 0.018, bp: [700, 0.7] }));
  layer(out, 0.6, (b) => thump(b, sr, { f0: 170, f1: 110, tau: 0.03 }));
  layer(out, 0.35, (b) =>
    phisem(b, sr, rng, {
      t: 0.02, dur: 0.2, rate: 2500, energy: (t) => Math.exp(-t / 0.05), grain: 0.0012, heavy: 2,
      bands: [{ f: 3200, q: 1.2, g: 1, spread: 0.3 }, { f: 1600, q: 1.4, g: 0.6, spread: 0.3 }],
    }),
  );
  return out;
}

/** a page turned: a papery swish that lifts and falls */
function bookPageTurn(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.22, 0.32);
  const out = alloc(d + 0.05, sr);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d, rate: 7000, energy: (t) => envBump(t, d * 0.4, d * 0.6), grain: 0.0008, heavy: 2.4,
      bands: [{ f: 4200, q: 1.1, g: 1, spread: 0.35 }, { f: 2200, q: 1.3, g: 0.7, spread: 0.3 }, { f: 7000, q: 1.2, g: 0.3, spread: 0.2 }],
    }),
  );
  layer(out, 0.25, (b) => burst(b, sr, rng, { dur: d, attack: d * 0.4, tau: d, bp: [1800, 0.8], env: (t) => envBump(t, d * 0.4, d * 0.6) }));
  return out;
}

export function villageSounds(): Record<string, SoundGen> {
  return {
    'block.bell.use': sound('block.bell.use', 2, bellUse),
    'block.barrel.open': sound('block.barrel.open', 2, barrelOpen),
    'block.barrel.close': sound('block.barrel.close', 1, barrelClose),
    'block.composter.fill': sound('block.composter.fill', 4, (c) => composterFill(c, false)),
    'block.composter.fill_success': sound('block.composter.fill_success', 4, (c) => composterFill(c, true)),
    'block.composter.empty': sound('block.composter.empty', 3, composterEmpty),
    'block.composter.ready': sound('block.composter.ready', 4, composterReady),
    'block.smoker.smoke': sound('block.smoker.smoke', 6, smokerSmoke),
    'block.blast_furnace.fire_crackle': sound('block.blast_furnace.fire_crackle', 5, blastFurnaceCrackle),
    'block.campfire.crackle': sound('block.campfire.crackle', 6, campfireCrackle),
    'item.book.put': sound('item.book.put', 1, bookPut),
    'item.book.page_turn': sound('item.book.page_turn', 3, bookPageTurn),
  };
}
