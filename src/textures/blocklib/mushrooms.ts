// The huge mushrooms' block textures (remaining mobs: the mooshroom). Vanilla block/brown_mushroom_block: a flat cap's
// skin, a soft mottled brown. block/red_mushroom_block: a dome's skin, bright red with round white spots of all sizes
// (a spot over an edge carries on over the next block's). block/mushroom_stem: the stem's pale, fibrous skin, streaked
// up and down. block/mushroom_block_inside: where it's been cut, pale and spongy, pocked with little pores. All of
// them tile. Original pixel art.

import { TexImage, setPx } from '../tex';
import { rng, fbm, quantize, paint, noise, mix, normalize, wrap } from './core';

type Gen = () => TexImage;

/** the brown cap's browns, dark to light (the small brown mushroom's cap, a shade softer) */
const BROWNS = [0x6f4f38, 0x7f5b41, 0x8e6749, 0x9c7254, 0xab7f5e];
/** the red cap's reds, dark to light (the small red mushroom's), and its spots' whites, the rim to the middle */
const REDS = [0xa7131a, 0xba181d, 0xcc1f22, 0xdc2726];
const SPOT = [0xd8cdc0, 0xe9e1d6, 0xf5efe7];
/** the stem's creams, dark to light */
const STEM = [0xb4a894, 0xc3b9a6, 0xd0c7b6, 0xdcd4c5, 0xe6dfd2];
/** the inside's tans, dark to light, and its pores */
const INSIDE = [0xc29f76, 0xcdab83, 0xd6b68f, 0xdec09b];
const PORE = [0xa4815b, 0xb28f69];

/** vanilla block/brown_mushroom_block */
function brownCap(): TexImage {
  const r = rng('brown_mushroom_block');
  const f = fbm(r, [[8, 8, 0.45], [4, 4, 0.35], [2, 2, 0.2]], 0.2);
  return paint(quantize(f, [0.07, 0.2, 0.42, 0.22, 0.09]), BROWNS);
}

/**
 * vanilla block/red_mushroom_block: the red (mottled a little), and the spots stamped over it, each a round white one
 * lighter in the middle, wrapping over the edges
 */
function redCap(): TexImage {
  const r = rng('red_mushroom_block');
  const f = fbm(r, [[8, 8, 0.5], [4, 4, 0.3], [2, 2, 0.2]], 0.15);
  const t = paint(quantize(f, [0.12, 0.3, 0.38, 0.2]), REDS);
  // (spots: where they sit, and how big; placed so none runs into another)
  const spots: [number, number, number][] = [];
  for (let tries = 0; spots.length < 7 && tries < 400; tries++) {
    const x = r.nextInt(16), y = r.nextInt(16), rad = spots.length < 2 ? 2.2 : spots.length < 5 ? 1.6 : 1.1;
    const far = spots.every(([sx, sy, sr]) => {
      const dx = Math.min(Math.abs(sx - x), 16 - Math.abs(sx - x)), dy = Math.min(Math.abs(sy - y), 16 - Math.abs(sy - y));
      return Math.hypot(dx, dy) > sr + rad + 1.4;
    });
    if (far) spots.push([x, y, rad]);
  }
  for (const [sx, sy, rad] of spots) {
    const n = Math.ceil(rad);
    for (let dy = -n; dy <= n; dy++)
      for (let dx = -n; dx <= n; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > rad + 0.25) continue;
        const k = d < rad * 0.45 ? 2 : d < rad * 0.8 ? 1 : 0;
        // (lit from the top left: its lower right a shade darker)
        const c = dx + dy > rad ? Math.max(0, k - 1) : k;
        setPx(t, wrap(sx + dx), wrap(sy + dy), SPOT[c]);
      }
  }
  return t;
}

/** vanilla block/mushroom_stem: streaks running up and down it */
function stem(): TexImage {
  const r = rng('mushroom_stem');
  const f = normalize(mix([[noise(r, 1, 8), 0.45], [noise(r, 2, 16), 0.3], [noise(r, 1, 4), 0.15], [noise(r, 4, 4), 0.1]]));
  return paint(quantize(f, [0.08, 0.2, 0.36, 0.26, 0.1]), STEM);
}

/** vanilla block/mushroom_block_inside: pale and spongy, pores scattered all over it (none touching another) */
function inside(): TexImage {
  const r = rng('mushroom_block_inside');
  const f = fbm(r, [[8, 8, 0.4], [4, 4, 0.35], [2, 2, 0.25]], 0.2);
  const t = paint(quantize(f, [0.15, 0.35, 0.35, 0.15]), INSIDE);
  const taken = new Set<number>();
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (taken.has(wrap(y + dy) * 16 + wrap(x + dx))) return true;
    return false;
  };
  let n = 0;
  for (let tries = 0; n < 26 && tries < 600; tries++) {
    const x = r.nextInt(16), y = r.nextInt(16);
    if (near(x, y)) continue;
    taken.add(y * 16 + x);
    setPx(t, x, y, PORE[0]);
    // (a bigger pore now and then: a lighter pixel beside it, its rim)
    if (r.nextInt(4) === 0) setPx(t, wrap(x + 1), y, PORE[1]);
    n++;
  }
  return t;
}

export function registerMushroomTextures(T: Record<string, () => TexImage | { w: number; h: number; frames: Uint8ClampedArray[] }>): void {
  const B = T as Record<string, Gen>;
  B['brown_mushroom_block'] = brownCap;
  B['red_mushroom_block'] = redCap;
  B['mushroom_stem'] = stem;
  B['mushroom_block_inside'] = inside;
}

