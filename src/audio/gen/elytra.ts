// The elytra's sounds. item.elytra.flying is the rush of air while gliding: a broad roar of wind, a low buffeting under
// it and a hiss past the ears, all rising and falling with slow gusts. It's a seamless loop, and audio/elytraSounds.ts
// sets its loudness and pitch from the glider's speed each tick. item.armor.equip_elytra is the wings put on: shaken
// open with a flap or two of leathery membrane (a push of air and the slap of it pulling taut) over a papery rustle,
// six takes as vanilla's sounds.json has them.

import type { SoundGen } from '../synth';
import { TAU, alloc, brown, pink, white, loopify, nsamp, layer, SVF, envBump } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, phisem, sweep, thump } from './texture';

/** item.elytra.flying: six seconds of wind, the last half second folded back into the start */
function flying(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const L = 6, X = 0.5;
  const b = alloc(L + X, sr);
  const n = b.length;
  // the gusts: slow swells, 0 to 1
  const ph = [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)];
  const gust = (t: number) => 0.5 + 0.22 * Math.sin(TAU * 0.23 * t + ph[0]) + 0.16 * Math.sin(TAU * 0.61 * t + ph[1]) + 0.12 * Math.sin(TAU * 1.37 * t + ph[2]);
  // the roar: a wide band of noise, its middle swinging up in the gusts
  layer(b, 1, (o) => {
    const w = pink(n, rng);
    const f = new SVF(800, 0.55, sr);
    for (let i = 0; i < n; i++) {
      const g = gust(i / sr);
      if ((i & 31) === 0) f.set(450 + 950 * g, 0.55, sr);
      o[i] = f.band(w[i]) * (0.55 + 0.45 * g);
    }
  });
  // the air buffeting the body: a low rumble that flutters a few times a second, harder in the gusts
  layer(b, 0.75, (o) => {
    const r = brown(n, rng, 0.995);
    const f = new SVF(130, 0.9, sr);
    let p = 0;
    for (let i = 0; i < n; i++) {
      const g = gust(i / sr);
      p += (5 + 3 * g) / sr;
      o[i] = f.low(r[i]) * (0.7 + 0.3 * Math.sin(TAU * p)) * (0.4 + 0.6 * g);
    }
  });
  // the hiss past the ears, only really there when it blows hardest
  layer(b, 0.3, (o) => {
    const w = white(n, rng);
    const f = new SVF(4000, 0.8, sr);
    for (let i = 0; i < n; i++) {
      const g = gust(i / sr);
      if ((i & 31) === 0) f.set(2800 + 2600 * g, 0.8, sr);
      o[i] = f.band(w[i]) * g * g;
    }
  });
  return loopify(b, nsamp(X, sr));
}

/** item.armor.equip_elytra: the wings shaken out and folded to */
function equip(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.65, sr);
  const flaps = v % 3 === 2 ? 1 : 2;
  // the membrane rustling as it's handled
  layer(out, 0.5, (b) =>
    phisem(b, sr, rng, {
      t: 0.002,
      dur: 0.5,
      rate: 1500,
      energy: (x) => envBump(x, 0.03, 0.4),
      grain: 0.0022,
      heavy: 1.8,
      bands: [
        { f: 900, q: 1.3, g: 0.8, spread: 0.3 },
        { f: 2100, q: 1.6, g: 1, spread: 0.3 },
        { f: 4600, q: 2, g: 0.4, spread: 0.2 },
      ],
    }),
  );
  // each flap: a push of air, then the slap of the membrane snapping taut and a soft knock of its frame
  layer(out, 1, (b) => {
    let t = rng.range(0.01, 0.04);
    for (let k = 0; k < flaps; k++) {
      const d = rng.range(0.1, 0.14);
      sweep(b, sr, rng, { t, dur: d, f: (x) => 350 + 1500 * (x / d), q: 0.9, amp: (x) => envBump(x, d * 0.6, d * 0.4), color: 'pink' });
      const at = t + d * 0.75;
      burst(b, sr, rng, { t: at, dur: 0.07, attack: 0.001, tau: 0.012, bp: [rng.range(850, 1250), 0.9], amp: k ? 0.7 : 1 });
      thump(b, sr, { t: at, f0: 160, f1: 95, tau: 0.02, amp: 0.45 });
      t += d + rng.range(0.07, 0.12);
    }
  });
  return out;
}

export function elytraSounds(): Record<string, SoundGen> {
  return {
    'item.elytra.flying': sound('item.elytra.flying', 1, flying, { loop: true }),
    'item.armor.equip_elytra': sound('item.armor.equip_elytra', 6, equip, { fadeOut: 0.08 }),
  };
}
