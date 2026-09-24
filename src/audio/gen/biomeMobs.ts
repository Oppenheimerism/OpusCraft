// The husk and the stray (vanilla entity.husk.*, entity.stray.*). The husk is a zombie dried out by the desert: a
// lower, hoarser groan with more breath than voice and a dry rasp in it, feet that scuff through sand, and a
// gurgling gasp as water turns it back into a zombie. The stray is a skeleton from the ice: its bones rattle as a
// skeleton's do, but through a hollow, wintry wheeze, and its steps crunch like frost.
// Takes as in vanilla's sounds.json: husk ambient 3, hurt 2, death 1, step 5, converted_to_zombie 2; stray ambient 4,
// hurt 4, death 2, step 4.

import type { SoundGen } from '../synth';
import { alloc, envBump, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, sweep, bubble } from './texture';
import { zombieVoice, zombieStep, rattleInto, skeletonHurt, skeletonDeath, skeletonStep } from './mobs';

// ------------------------------------------------------------------ husk

/** a zombie's groan, lower and breathier, with the dry rasp of a parched throat over it */
function huskVoice(c: Ctx, d: number, base: number, fall: number, o: { breath: number; attack?: number }): Float32Array {
  const out = zombieVoice(c, d, base, fall, o);
  const a = o.attack ?? d * 0.2;
  const f = c.rng.range(1900, 2500);
  layer(out, 0.32, (b) => sweep(b, c.sr, c.rng, { dur: d, f: (t) => f * (1 - 0.15 * (t / d)), q: 1.3, amp: (t) => envBump(t, a, d - a) }));
  lowpass(out, 3000, c.sr);
  return out;
}

function huskStep(c: Ctx): Float32Array {
  const out = zombieStep(c);
  // (the scuff of sand under it)
  layer(out, 0.35, (b) => burst(b, c.sr, c.rng, { t: 0.01, dur: 0.16, attack: 0.012, tau: 0.045, bp: [c.rng.range(2200, 3000), 0.8] }));
  return out;
}

/** vanilla mob/husk/convert1-2: a drawn-out, rising gasp, gurgling as the water gets into it */
function huskConvert(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.1, 1.4);
  const out = huskVoice(c, d, rng.range(80, 92), -0.35, { breath: 0.55, attack: 0.15 });
  layer(out, 0.6, (b) => {
    const n = 7 + rng.int(5);
    for (let i = 0; i < n; i++) bubble(b, sr, rng.range(0.1, d), rng.range(280, 650), rng.range(0.4, 1));
  });
  return out;
}

// ------------------------------------------------------------------ stray

/** a hollow, whistling breath through a frozen ribcage */
function wheezeInto(b: Float32Array, c: Ctx, t0: number, d: number, f0: number, f1: number): void {
  sweep(b, c.sr, c.rng, { t: t0, dur: d, f: (t) => f0 + (f1 - f0) * (t / d), q: 3.5, amp: (t) => envBump(t, d * 0.3, d * 0.7) });
}

/** vanilla mob/stray/idle1-4: the skeleton's rattle, through a cold wheeze */
function straySay(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.0, sr);
  let end = 0;
  layer(out, 1, (b) => {
    const n = 2 + rng.int(2);
    let t = 0.05;
    for (let k = 0; k < n; k++) {
      const d = rng.range(0.1, 0.18);
      rattleInto(b, c, t, d, rng.range(60, 110));
      t += d + rng.range(0.04, 0.1);
    }
    end = t;
  });
  const f = rng.range(480, 640);
  layer(out, 0.55, (b) => wheezeInto(b, c, 0, Math.min(0.95, end + 0.2), f * 1.15, f * 0.85));
  return out;
}

function strayHurt(c: Ctx): Float32Array {
  const out = skeletonHurt(c);
  const f = c.rng.range(700, 900);
  layer(out, 0.5, (b) => wheezeInto(b, c, 0.01, 0.28, f, f * 0.7));
  return out;
}

/** the skeleton's collapse, and a long breath of wind dying away */
function strayDeath(c: Ctx): Float32Array {
  const out = skeletonDeath(c);
  const f = c.rng.range(600, 760);
  layer(out, 0.55, (b) => wheezeInto(b, c, 0, 1.1, f, f * 0.35));
  return out;
}

function strayStep(c: Ctx): Float32Array {
  const out = skeletonStep(c);
  // (frost crunching under the bone)
  layer(out, 0.3, (b) => burst(b, c.sr, c.rng, { t: 0.005, dur: 0.06, attack: 0.002, tau: 0.014, bp: [c.rng.range(4500, 6000), 1] }));
  return out;
}

export function biomeMobSounds(): Record<string, SoundGen> {
  return {
    'entity.husk.ambient': sound('entity.husk.ambient', 3, (c) => huskVoice(c, c.rng.range(1.0, 1.4), c.rng.range(68, 82), 0.25, { breath: 0.6 })),
    'entity.husk.hurt': sound('entity.husk.hurt', 2, (c) => huskVoice(c, c.rng.range(0.3, 0.42), c.rng.range(90, 104), 0.3, { breath: 0.65, attack: 0.02 })),
    'entity.husk.death': sound('entity.husk.death', 1, (c) => huskVoice(c, 1.5, 84, 0.5, { breath: 0.7, attack: 0.05 })),
    'entity.husk.step': sound('entity.husk.step', 5, huskStep),
    'entity.husk.converted_to_zombie': sound('entity.husk.converted_to_zombie', 2, huskConvert),
    'entity.stray.ambient': sound('entity.stray.ambient', 4, straySay),
    'entity.stray.hurt': sound('entity.stray.hurt', 4, strayHurt),
    'entity.stray.death': sound('entity.stray.death', 2, strayDeath),
    'entity.stray.step': sound('entity.stray.step', 4, strayStep),
  };
}
