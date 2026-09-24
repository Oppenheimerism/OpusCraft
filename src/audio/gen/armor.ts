// Putting armour on (vanilla item.armor.equip_*, ArmorMaterial.equipSound): the wearer's cloth rustling as the
// piece is pulled on, with the material's own voice over it: stiff leather creaking and flapping, chainmail's
// jingle of rings, iron plates clanking, softer and duller gold, diamond's glassy clinks, netherite's heavy thud.
// Takes as in vanilla's sounds.json: six each, netherite four; equip_generic (a carved pumpkin) six.

import type { SoundGen } from '../synth';
import { type Rng, alloc, envAD, envBump, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, creak, impact, phisem, sweep, thump, ticks } from './texture';

/** fabric dragged over fabric: a dense soft friction noise, brightness `bright` */
function rustle(b: Float32Array, sr: number, rng: Rng, t: number, dur: number, bright = 1, amp = 1): void {
  phisem(b, sr, rng, {
    t,
    dur,
    rate: 2200,
    // (grabbed at once, then let go)
    energy: (x) => envBump(x, Math.min(0.02, dur * 0.2), dur - Math.min(0.02, dur * 0.2)),
    grain: 0.0018,
    heavy: 1.6,
    bands: [
      { f: 650 * bright, q: 1.4, g: 0.7, spread: 0.25 },
      { f: 1500 * bright, q: 1.6, g: 1, spread: 0.25 },
      { f: 3300 * bright, q: 1.8, g: 0.6, spread: 0.2 },
      { f: 6200 * bright, q: 2, g: 0.25, spread: 0.2 },
    ],
    gain: amp,
  });
}

/** one metal strike: inharmonic plate modes (`ratios`, `t60`s scaled by `ring`) and a short contact tick */
function clank(b: Float32Array, sr: number, rng: Rng, t: number, f: number, ratios: readonly number[], ring: number, amp = 1, bright = 1): void {
  const modes: number[] = [];
  ratios.forEach((r, i) => modes.push(f * r, Math.pow(0.72, i), ring * Math.pow(0.8, i)));
  impact(b, sr, rng, { t, modes, jitter: 0.02, noise: 0.9, noiseTau: 0.0012, noiseBp: [f * 3 * bright, 0.9], gain: amp });
}

/** item.armor.equip_leather: stiff leather drawn on, a creak of the hide and a slap as it settles */
function leather(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  const d = rng.range(0.28, 0.4);
  layer(out, 0.7, (b) => rustle(b, sr, rng, 0.002, d, 0.75));
  layer(out, 0.8, (b) =>
    creak(b, sr, rng, {
      t: rng.range(0.03, 0.08),
      dur: d * 0.8,
      rate: (x) => rng.range(70, 90) + 160 * x,
      amp: (x) => envBump(x, d * 0.2, d * 0.6),
      jitter: 0.35,
      bands: [
        { f: 520, q: 3, g: 1 },
        { f: 1250, q: 4, g: 0.6 },
        { f: 2900, q: 4, g: 0.25 },
      ],
    }),
  );
  layer(out, 1, (b) => {
    const at = d * rng.range(0.7, 0.95);
    burst(b, sr, rng, { t: at, dur: 0.09, attack: 0.002, tau: 0.018, bp: [rng.range(700, 950), 0.9] });
    thump(b, sr, { t: at, f0: 170, f1: 100, tau: 0.025, amp: 0.5 });
  });
  return out;
}

/** item.armor.equip_chain: the mail shaken on, a jingle of little rings in two gestures */
function chain(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const g2 = rng.range(0.13, 0.22);
  const energy = (x: number) => Math.max(envBump(x, 0.02, 0.12), 0.8 * envBump(x - g2, 0.02, 0.16));
  layer(out, 1, (b) =>
    ticks(b, sr, rng, { t: 0.002, dur: 0.45, rate: 520, energy, f: [1800, 6200], t60: [0.03, 0.14], ratios: [1, 2.31, 3.87], weights: [1, 0.45, 0.2], heavy: 2.2, click: 0.35 }),
  );
  layer(out, 0.35, (b) => rustle(b, sr, rng, 0.002, 0.4, 1.1));
  layer(out, 0.4, (b) => clank(b, sr, rng, g2 + 0.01, rng.range(1900, 2400), [1, 1.61, 2.47, 3.38], 0.09, 0.6, 1.2));
  return out;
}

/** item.armor.equip_iron: plates clanking together as the piece goes on, with a scrape between */
function iron(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  const f = rng.range(620, 820), t2 = rng.range(0.09, 0.16);
  const R = [1, 1.53, 2.41, 3.37, 4.92, 6.1];
  layer(out, 1, (b) => {
    clank(b, sr, rng, 0.002, f, R, 0.32, 1);
    clank(b, sr, rng, t2, f * rng.range(1.12, 1.3), R, 0.26, 0.7);
  });
  layer(out, 0.35, (b) =>
    sweep(b, sr, rng, { t: 0.02, dur: t2, f: (x) => 2800 + 1400 * (x / t2), q: 3, amp: (x) => envBump(x, t2 * 0.4, t2 * 0.6) }),
  );
  layer(out, 0.45, (b) => rustle(b, sr, rng, 0.002, 0.3, 0.9));
  return out;
}

/** item.armor.equip_gold: a softer, duller metal, its knocks shorter and a little brighter */
function gold(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const f = rng.range(1000, 1300), t2 = rng.range(0.07, 0.13);
  const R = [1, 1.47, 2.18, 2.97, 4.05];
  layer(out, 1, (b) => {
    clank(b, sr, rng, 0.002, f, R, 0.16, 1, 1.1);
    clank(b, sr, rng, t2, f * rng.range(0.85, 1.15), R, 0.13, 0.65, 1.1);
  });
  layer(out, 0.3, (b) =>
    ticks(b, sr, rng, { t: 0.01, dur: 0.25, rate: 60, energy: (x) => envAD(x, 0.005, 0.08), f: [3000, 5200], t60: [0.04, 0.1], click: 0.2 }),
  );
  layer(out, 0.45, (b) => rustle(b, sr, rng, 0.002, 0.28, 0.9));
  return out;
}

/** item.armor.equip_diamond: hard glassy clinks that ring on, a shimmer of little ones after */
function diamond(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1, sr);
  const f = rng.range(1800, 2500), t2 = rng.range(0.08, 0.14);
  const R = [1, 2.76, 5.4, 8.93];
  layer(out, 1, (b) => {
    clank(b, sr, rng, 0.002, f, R, 0.7, 1, 0.8);
    clank(b, sr, rng, t2, f * rng.range(1.18, 1.42), R, 0.6, 0.6, 0.8);
  });
  layer(out, 0.3, (b) =>
    ticks(b, sr, rng, { t: 0.02, dur: 0.35, rate: 45, energy: (x) => envAD(x, 0.01, 0.15), f: [4200, 8200], t60: [0.15, 0.4], ratios: [1, 2.76], weights: [1, 0.4] }),
  );
  layer(out, 0.4, (b) => rustle(b, sr, rng, 0.002, 0.3, 1));
  return out;
}

/** item.armor.equip_netherite: dense, dark metal set down hard: a thud, a short low clank, grit */
function netherite(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  const f = rng.range(300, 400);
  layer(out, 1, (b) => {
    thump(b, sr, { t: 0.002, f0: rng.range(120, 140), f1: 70, tau: 0.05, amp: 1, h2: 0.25 });
    clank(b, sr, rng, 0.004, f, [1, 1.62, 2.53, 3.61, 5.02], 0.22, 0.9, 0.7);
  });
  layer(out, 0.5, (b) => clank(b, sr, rng, rng.range(0.1, 0.16), f * rng.range(1.3, 1.6), [1, 1.62, 2.53, 3.61], 0.16, 0.6, 0.7));
  layer(out, 0.3, (b) => burst(b, sr, rng, { t: 0.003, dur: 0.15, attack: 0.002, tau: 0.04, bp: [1800, 1.2], color: 'brown' }));
  layer(out, 0.4, (b) => rustle(b, sr, rng, 0.002, 0.3, 0.75));
  return out;
}

/** item.armor.equip_generic: something that isn't armour put on: a soft rustle and a small knock */
function generic(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => rustle(b, sr, rng, 0.002, rng.range(0.2, 0.3), 0.85));
  layer(out, 0.5, (b) => {
    const at = rng.range(0.06, 0.14);
    thump(b, sr, { t: at, f0: 200, f1: 120, tau: 0.02, amp: 0.8 });
    burst(b, sr, rng, { t: at, dur: 0.05, attack: 0.001, tau: 0.01, bp: [1400, 1.1], amp: 0.6 });
  });
  return out;
}

export function armorSounds(): Record<string, SoundGen> {
  return {
    'item.armor.equip_leather': sound('item.armor.equip_leather', 6, leather),
    'item.armor.equip_chain': sound('item.armor.equip_chain', 6, chain),
    'item.armor.equip_iron': sound('item.armor.equip_iron', 6, iron),
    'item.armor.equip_gold': sound('item.armor.equip_gold', 6, gold),
    'item.armor.equip_diamond': sound('item.armor.equip_diamond', 6, diamond),
    'item.armor.equip_netherite': sound('item.armor.equip_netherite', 4, netherite),
    'item.armor.equip_generic': sound('item.armor.equip_generic', 6, generic),
  };
}
