// Potions and brewing: a glass bottle dipped and filled (its glugs climbing as the air in it shrinks) or tipped
// out (falling), the dragon's breath sucked into one, the brewing stand's bubbling as a brew finishes, the gust of
// a wind burst (a wind-charged mob's last breath) and the silky pull of a cobweb (vanilla SoundType.COBWEB).
// Takes as in vanilla's sounds.json: bottle fill 4, empty 2, fill_dragonbreath 2, brew 2, wind_burst 3, cobweb 6.

import type { SoundGen } from '../synth';
import { type Rng, alloc, envAD, envBump, layer } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { bubble, burst, impact, phisem, sweep, thump, ticks } from './texture';

/** the bottle's neck knocking on something: a small glassy ping */
function clink(b: Float32Array, sr: number, rng: Rng, t: number, amp: number): void {
  const f = rng.range(2600, 3300);
  impact(b, sr, rng, { t, modes: [f, 1, 0.09, f * 2.32, 0.5, 0.05, f * 4.1, 0.25, 0.03], jitter: 0.02, noise: 0.35, noiseTau: 0.0008, noiseBp: [6000, 1], gain: amp });
}

/**
 * glugs in a bottle: bubbles whose pitch follows the air left in it (`f(x)`, x 0→1 over `dur`), bunched into
 * gulps `gap` apart
 */
function glugs(b: Float32Array, sr: number, rng: Rng, t0: number, dur: number, gap: number, f: (x: number) => number): void {
  for (let t = 0; t < dur; t += gap * rng.range(0.8, 1.2)) {
    const base = f(t / dur);
    const n = 2 + rng.int(3);
    for (let k = 0; k < n; k++) bubble(b, sr, t0 + t + rng.range(0, gap * 0.4), base * rng.range(0.9, 1.15), rng.range(0.5, 1), undefined, 0.25);
  }
}

/** item.bottle.fill: dipped under, the water gurgling in, each gulp higher as the bottle fills */
function bottleFill(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.4, 0.55);
  const out = alloc(d + 0.2, sr);
  layer(out, 0.5, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.002, tau: 0.03, lp: 900, color: 'brown' }));
  const f0 = rng.range(380, 460), f1 = f0 * rng.range(2.1, 2.6);
  layer(out, 1, (b) => glugs(b, sr, rng, 0.02, d, rng.range(0.055, 0.075), (x) => f0 * Math.pow(f1 / f0, x)));
  layer(out, 0.35, (b) =>
    sweep(b, sr, rng, { t: 0.02, dur: d, f: (t) => 900 + 1400 * (t / d), q: 2.5, amp: (t) => envBump(t, 0.04, d - 0.08), color: 'pink' }),
  );
  return out;
}

/** item.bottle.empty: tipped out, the glugs dropping as air gets in, the water splattering below */
function bottleEmpty(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.45, 0.6);
  const out = alloc(d + 0.25, sr);
  const f0 = rng.range(900, 1100), f1 = f0 * rng.range(0.42, 0.5);
  layer(out, 1, (b) => glugs(b, sr, rng, 0.01, d, rng.range(0.06, 0.08), (x) => f0 * Math.pow(f1 / f0, x)));
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      t: 0.06,
      dur: d,
      rate: 1400,
      energy: (t) => envBump(t, 0.05, d - 0.1),
      grain: 0.0009,
      heavy: 2,
      bands: [
        { f: 3200, q: 1.5, g: 1, spread: 0.4 },
        { f: 1400, q: 2, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.3, (b) => clink(b, sr, rng, 0.004, 1));
  return out;
}

/** item.bottle.fill_dragonbreath: the breath drawn in with a rush and a glittering shimmer, stoppered with a clink */
function fillDragonBreath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.7);
  const out = alloc(d + 0.4, sr);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, { dur: d, f: (t) => 500 + 2600 * Math.pow(t / d, 1.5), q: 1.8, amp: (t) => envBump(t, d * 0.6, d * 0.4), color: 'pink' }),
  );
  layer(out, 0.4, (b) =>
    ticks(b, sr, rng, { t: 0.1, dur: d + 0.2, rate: 70, energy: (t) => envBump(t, d * 0.5, 0.3), f: [3000, 7500], t60: [0.12, 0.35], ratios: [1, 2.01], weights: [1, 0.3] }),
  );
  layer(out, 0.5, (b) => glugs(b, sr, rng, d * 0.55, d * 0.35, 0.06, (x) => 600 * (1 + x)));
  layer(out, 0.45, (b) => clink(b, sr, rng, d, 1));
  return out;
}

/** block.brewing_stand.brew: the brew coming to the boil, a close run of bubbles over a low simmer, then settling */
function brew(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.1, 1.4);
  const out = alloc(d + 0.2, sr);
  const en = (t: number) => envBump(t, d * 0.25, d * 0.75);
  layer(out, 1, (b) => {
    for (let t = 0; t < d; t += rng.range(0.012, 0.035)) {
      if (rng.next() > en(t)) continue;
      bubble(b, sr, t, rng.logRange(280, 1100), rng.range(0.25, 1), undefined, rng.range(0.3, 0.6));
    }
  });
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: d, attack: d * 0.2, tau: d * 0.4, lp: 420, color: 'brown', env: en }));
  layer(out, 0.3, (b) =>
    phisem(b, sr, rng, { dur: d, rate: 900, energy: en, grain: 0.0006, heavy: 2.5, bands: [{ f: 5200, q: 1.5, g: 1, spread: 0.3 }] }),
  );
  return out;
}

/** entity.breeze.wind_burst: a gust let go all at once: a soft thump of air and a rush that tears away and falls */
function windBurst(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.7, 0.9);
  const out = alloc(d + 0.1, sr);
  layer(out, 0.8, (b) => thump(b, sr, { t: 0.002, f0: rng.range(95, 120), f1: 50, tau: 0.07, amp: 1 }));
  const f0 = rng.range(1600, 2100);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, { dur: d, f: (t) => 220 + f0 * Math.exp(-t / (d * 0.35)), q: (t) => 1.2 + 1.5 * (t / d), amp: (t) => envAD(t, 0.012, d * 0.3) }),
  );
  layer(out, 0.5, (b) => burst(b, sr, rng, { dur: d * 0.6, attack: 0.004, tau: d * 0.15, lp: 700, color: 'brown' }));
  return out;
}

/** the silk of a web pulled at: fine threads rustling, tacky little pops as they stick and let go */
function cobweb(c: Ctx, heavy: number): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.18, 0.26) * (0.8 + 0.4 * heavy);
  const out = alloc(d + 0.08, sr);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 1600,
      energy: (t) => envBump(t, d * 0.2, d * 0.8),
      grain: 0.0012,
      heavy: 1.8,
      bands: [
        { f: 2600, q: 2.2, g: 1, spread: 0.3 },
        { f: 5400, q: 2.5, g: 0.6, spread: 0.2 },
        { f: 1100, q: 1.6, g: 0.35 * heavy, spread: 0.25 },
      ],
    }),
  );
  layer(out, 0.45 * heavy, (b) =>
    ticks(b, sr, rng, { dur: d, rate: 60, energy: (t) => envBump(t, d * 0.3, d * 0.7), f: [900, 2600], t60: [0.006, 0.02], click: 0.6 }),
  );
  return out;
}

export function brewingSounds(): Record<string, SoundGen> {
  const webStep = sound('block.cobweb.step', 6, (c) => cobweb(c, 0.6));
  return {
    'item.bottle.fill': sound('item.bottle.fill', 4, bottleFill),
    'item.bottle.empty': sound('item.bottle.empty', 2, bottleEmpty),
    'item.bottle.fill_dragonbreath': sound('item.bottle.fill_dragonbreath', 2, fillDragonBreath),
    'block.brewing_stand.brew': sound('block.brewing_stand.brew', 2, brew),
    'entity.breeze.wind_burst': sound('entity.breeze.wind_burst', 3, windBurst),
    'block.cobweb.break': sound('block.cobweb.break', 6, (c) => cobweb(c, 1)),
    'block.cobweb.place': sound('block.cobweb.place', 6, (c) => cobweb(c, 0.9)),
    'block.cobweb.step': webStep,
    'block.cobweb.hit': pitched(webStep, 0.5),
    'block.cobweb.fall': webStep,
  };
}
