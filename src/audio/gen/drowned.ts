// The drowned (vanilla entity.drowned.*): a zombie's groan through a throat full of water, breaking up in a wet,
// uneven gurgle; under water the same muffled and bubbling. Its steps squelch; it swims with slow, heavy strokes;
// it throws a trident as a player does (entity.drowned.shoot plays item/trident/throw). And the gargling, sinking
// moan of a zombie turning into one (entity.zombie.converted_to_drowned).
// Takes as in vanilla's sounds.json: ambient 5, ambient_water 4, hurt 3, hurt_water 3, death 2, death_water 2,
// step 5, swim 4, converted_to_drowned 3.

import type { SoundGen } from '../synth';
import { TAU, alloc, envBump, layer, lowpass, highpass } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, burst, sweep, thump } from './texture';
import { zombieVoice, zombieStep } from './mobs';
import { tridentSounds } from './trident';

interface DrownedVoice {
  breath: number;
  attack?: number;
  /** how much the water breaks the voice up (0..1) */
  gurgle: number;
  /** heard from under the water: muffled, and bubbling */
  under?: boolean;
}

/** the groan, fluttering irregularly as it gargles, with bubbles rising through it */
function drownedVoice(c: Ctx, d: number, base: number, fall: number, o: DrownedVoice): Float32Array {
  const { sr, rng } = c;
  const out = zombieVoice(c, d, base, fall, o);
  // (the gargle: once a cycle, at a wandering 7-15 Hz, the water chokes the voice off)
  let ph = rng.next(), rate = rng.range(9, 13), target = rate;
  for (let i = 0; i < out.length; i++) {
    if (i % 1024 === 0) target = rng.range(7, 15);
    rate += (target - rate) * 0.001;
    ph += rate / sr;
    const m = Math.sin(TAU * ph);
    out[i] *= 1 - o.gurgle * 0.8 * (m < 0 ? Math.pow(-m, 0.7) : 0);
  }
  layer(out, 0.1 + 0.15 * o.gurgle, (b) => {
    const n = Math.round((5 + 8 * o.gurgle) * d);
    for (let k = 0; k < n; k++) bubble(b, sr, rng.range(d * 0.1, d * 0.95), rng.logRange(250, 900), rng.range(0.3, 1), undefined, 0.4);
  });
  if (o.under) {
    // (through the water: the highs gone, more bubbles, a dull pressure under it)
    lowpass(out, 900, sr);
    lowpass(out, 1100, sr);
    layer(out, 0.3, (b) => {
      const n = Math.round(14 * d);
      for (let k = 0; k < n; k++) bubble(b, sr, rng.range(0, d), rng.logRange(350, 1400), rng.range(0.2, 0.8), undefined, 0.5);
    });
  } else lowpass(out, 3000, sr);
  return out;
}

const ambient = (under: boolean) => (c: Ctx) => drownedVoice(c, c.rng.range(1.1, 1.6), c.rng.range(66, 80), 0.2, { breath: 0.5, gurgle: under ? 0.8 : 0.55, under });
const hurt = (under: boolean) => (c: Ctx) => drownedVoice(c, c.rng.range(0.32, 0.45), c.rng.range(92, 108), 0.3, { breath: 0.5, attack: 0.02, gurgle: 0.45, under });

/** a long, sinking groan that drowns in a last gargle and a burst of bubbles */
function death(under: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const d = rng.range(1.4, 1.7);
    const out = drownedVoice(c, d, rng.range(84, 94), 0.5, { breath: 0.55, attack: 0.05, gurgle: 0.7, under });
    layer(out, under ? 0.5 : 0.35, (b) => {
      for (let k = 0; k < 14; k++) bubble(b, sr, d * 0.7 + rng.range(0, d * 0.3), rng.logRange(220, 700), rng.range(0.4, 1), undefined, 0.5);
    });
    return out;
  };
}

/** a zombie's footfall, landing wet: a squelch as the sodden foot comes down */
function step(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = zombieStep(c);
  layer(out, 0.55, (b) => burst(b, sr, rng, { t: 0.008, dur: 0.12, attack: 0.004, tau: 0.03, bp: [rng.range(650, 950), 1.6] }));
  layer(out, 0.25, (b) => bubble(b, sr, rng.range(0.02, 0.05), rng.range(400, 700), 1, undefined, 0.6));
  return out;
}

/** a slow, heavy stroke through the water: a low surge with bubbles trailing off it */
function swim(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.8);
  const out = alloc(d + 0.15, sr);
  const f0 = rng.range(280, 420), f1 = f0 * rng.range(1.6, 2.1), pk = rng.range(0.3, 0.45);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0 + (f1 - f0) * Math.sin((Math.PI * t) / d), q: 1.1, amp: (t) => envBump(t, d * pk, d * (1 - pk)), color: 'pink' }));
  layer(out, 0.4, (b) => {
    const n = 10 + rng.int(8);
    for (let k = 0; k < n; k++) bubble(b, sr, rng.range(d * 0.2, d), rng.logRange(250, 1100), rng.range(0.2, 1), undefined, 0.4);
  });
  lowpass(out, 2200, sr);
  highpass(out, 70, sr);
  return out;
}

/** vanilla mob/drowned/convert: a zombie's groan, choking as the water takes it, sinking to a gurgle */
function convert(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.2, 1.5);
  const out = drownedVoice(c, d, rng.range(86, 96), 0.45, { breath: 0.5, attack: 0.1, gurgle: 0.9 });
  layer(out, 0.3, (b) => thump(b, sr, { t: 0.02, f0: 120, f1: 60, tau: 0.06 }));
  layer(out, 0.4, (b) => {
    for (let k = 0; k < 20; k++) bubble(b, sr, rng.range(d * 0.3, d), rng.logRange(200, 800), rng.range(0.3, 1), undefined, 0.5);
  });
  return out;
}

export function drownedSounds(): Record<string, SoundGen> {
  return {
    'entity.drowned.ambient': sound('entity.drowned.ambient', 5, ambient(false)),
    'entity.drowned.ambient_water': sound('entity.drowned.ambient_water', 4, ambient(true)),
    'entity.drowned.hurt': sound('entity.drowned.hurt', 3, hurt(false)),
    'entity.drowned.hurt_water': sound('entity.drowned.hurt_water', 3, hurt(true)),
    'entity.drowned.death': sound('entity.drowned.death', 2, death(false)),
    'entity.drowned.death_water': sound('entity.drowned.death_water', 2, death(true)),
    'entity.drowned.step': sound('entity.drowned.step', 5, step),
    'entity.drowned.swim': sound('entity.drowned.swim', 4, swim),
    // (vanilla sounds.json: the trident's own throw)
    'entity.drowned.shoot': tridentSounds()['item.trident.throw'],
    'entity.zombie.converted_to_drowned': sound('entity.zombie.converted_to_drowned', 3, convert),
  };
}
