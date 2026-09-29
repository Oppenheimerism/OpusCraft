// The bees' block textures (remaining mobs: the bee) beside the bee nest's top, side and front and the honey block's
// top and side (iconblocks.ts): the nest's front oozing honey and its bottom (vanilla block/bee_nest_front_honey,
// bee_nest_bottom); the beehive's (block/beehive_end, beehive_side, beehive_front, beehive_front_honey), an oak box
// framed in darker boards with a band of honeycomb showing round its middle and a dark slot in its front; the honey
// block's bottom, its darker core (block/honey_block_bottom); and the honeycomb block (block/honeycomb_block), wax
// cells packed in rows. Original pixel art.

import { TexImage, img, setPx, getPx, mixC } from '../tex';
import { N, rng, fbm, quantize, paint } from './core';
import { planks, WOOD } from './wood';
import { beeNestFront } from './iconblocks';

type Gen = () => TexImage;

/** honey, dark to light */
const HONEY = [0x9c4f07, 0xc26a0b, 0xe08c14, 0xf2a922, 0xfbc443, 0xfee07a];
/** the comb's wax walls and cells */
const COMB = { wall: 0x8c4f0f, wallLit: 0xb06a17, cell: [0xd98a1c, 0xe89c27, 0xf3b237, 0xfbca52], shine: 0xffe38a };

const edgeDist = (x: number, y: number): number => Math.min(x, y, 15 - x, 15 - y);

/**
 * honeycomb over the rectangle (x0, y0)-(x1, y1): rows of cells four wide and four high, each row half a cell over
 * from the last, their walls dark, a shine in each cell's upper corner
 */
function combInto(t: TexImage, x0: number, y0: number, x1: number, y1: number, seed: string, rowShift = 0): void {
  const r = rng(seed);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const ly = y - y0 + rowShift, row = Math.floor(ly / 4), cy = ly % 4;
      const lx = x - x0 + (row % 2 ? 2 : 0), cx = lx % 4;
      let c: number;
      if (cy === 3 || cx === 3) c = cy === 3 && cx !== 3 && r.chance(0.3) ? COMB.wallLit : COMB.wall;
      else if (cy === 0 && cx === 0) c = COMB.shine;
      else c = COMB.cell[Math.min(3, Math.max(0, 3 - cy - (cx === 2 ? 1 : 0) + (r.chance(0.25) ? -1 : 0)))];
      setPx(t, x, y, c);
    }
}

/** vanilla block/honeycomb_block: cells all over */
function honeycombBlock(): TexImage {
  const t = img();
  combInto(t, 0, 0, 15, 15, 'honeycomb_block');
  return t;
}

/** honey running down from row `y0` in the columns given (each a length): a lit edge, a bead at the end */
function drips(t: TexImage, y0: number, cols: [number, number][]): void {
  for (const [x, len] of cols)
    for (let i = 0; i < len; i++) {
      const y = y0 + i;
      if (y > 15) break;
      setPx(t, x, y, i === len - 1 ? HONEY[3] : i === 0 ? HONEY[4] : HONEY[2 + (i % 2)]);
    }
}

/** vanilla block/bee_nest_front_honey: the nest's hole brimming with honey, and some running down under it */
function beeNestFrontHoney(): TexImage {
  const t = beeNestFront();
  // (the hole of iconblocks.ts: rows 6 to 9, columns 5 to 10, its corners rounded)
  const hole = ['.####.', '######', '######', '.####.'];
  hole.forEach((row, yy) =>
    [...row].forEach((ch, xx) => {
      if (ch !== '#') return;
      const x = 5 + xx, y = 6 + yy;
      setPx(t, x, y, yy === 0 ? HONEY[2] : yy === 3 ? HONEY[3] : xx < 2 ? HONEY[5] : HONEY[4]);
    }),
  );
  drips(t, 10, [[6, 3], [7, 2], [9, 4]]);
  return t;
}

/** vanilla block/bee_nest_bottom: the straw's rings seen from below, duller than the top */
function beeNestBottom(): TexImage {
  const r = rng('bee_nest_bottom');
  const pal = [0x4b2c0f, 0x70451a, 0x8a5b20, 0xa9772c, 0xc39538, 0xd5b04a, 0xe2c25a];
  const nz = fbm(r, [[8, 8, 0.6], [4, 4, 0.4]]);
  const tones = new Int32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x, e = edgeDist(x, y);
      if (e === 0) {
        tones[i] = r.chance(0.35) ? 0 : 1;
        continue;
      }
      const d = Math.pow(Math.pow(Math.abs(x - 7.5), 2.6) + Math.pow(Math.abs(y - 7.5), 2.6), 1 / 2.6) + (nz[i] - 0.5) * 0.8;
      const ph = d / 2.2, fr = ph - Math.floor(ph);
      tones[i] = d < 1.2 ? 2 : fr < 0.3 ? 2 : fr < 0.5 ? 3 : fr < 0.82 ? 5 : 4;
      if (e === 1) tones[i] = Math.min(tones[i], 3);
    }
  return paint(tones, pal);
}

// --- the beehive: oak boards, a frame of darker ones round the edge

const OAK = WOOD.oak;
const FRAME = { dark: 0x5d4428, mid: 0x7a5c35, lit: 0x9d7b4a };

/** the frame round a face: the outer ring dark, lit along the top and left inside it */
function frame(t: TexImage): void {
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, FRAME.mid);
    setPx(t, 0, i, FRAME.mid);
    setPx(t, i, 15, FRAME.dark);
    setPx(t, 15, i, FRAME.dark);
  }
  for (let i = 1; i < 15; i++) {
    setPx(t, i, 1, mixC(getPx(t, i, 1), FRAME.lit, 0.35));
    setPx(t, 1, i, mixC(getPx(t, 1, i), FRAME.lit, 0.25));
    setPx(t, i, 14, mixC(getPx(t, i, 14), FRAME.dark, 0.3));
    setPx(t, 14, i, mixC(getPx(t, 14, i), FRAME.dark, 0.3));
  }
}

/** vanilla block/beehive_end: a board lid in its frame, a square of the frame's boards inset on it */
function beehiveEnd(): TexImage {
  const t = planks('beehive_end', OAK);
  frame(t);
  for (let i = 3; i <= 12; i++) {
    setPx(t, i, 3, FRAME.mid);
    setPx(t, 3, i, FRAME.mid);
    setPx(t, i, 12, FRAME.dark);
    setPx(t, 12, i, FRAME.dark);
  }
  return t;
}

/** the band of comb round the hive's middle (rows 6 to 9), between two dark rails */
function combBand(t: TexImage, seed: string): void {
  for (let x = 1; x < 15; x++) {
    setPx(t, x, 5, FRAME.dark);
    setPx(t, x, 10, FRAME.mid);
  }
  combInto(t, 1, 6, 14, 9, seed, 1);
}

/** vanilla block/beehive_side */
function beehiveSide(): TexImage {
  const t = planks('beehive_side', OAK);
  frame(t);
  combBand(t, 'beehive_side_comb');
  return t;
}

/** the entrance: a dark slot across the band's middle, lit along its lower lip */
function slot(t: TexImage, honey: boolean): void {
  for (let x = 5; x <= 10; x++)
    for (let y = 7; y <= 8; y++) setPx(t, x, y, honey ? (y === 7 ? HONEY[4] : HONEY[3]) : y === 7 ? 0x1a0f06 : 0x2b1a0c);
  for (let x = 5; x <= 10; x++) setPx(t, x, 9, honey ? HONEY[2] : FRAME.lit);
}

/** vanilla block/beehive_front: the side with its entrance */
function beehiveFront(honey: boolean): TexImage {
  const t = planks('beehive_front', OAK);
  frame(t);
  combBand(t, 'beehive_front_comb');
  slot(t, honey);
  if (honey) drips(t, 10, [[6, 3], [8, 5], [9, 2]]);
  return t;
}

/** vanilla block/honey_block_bottom: the core, deeper amber, with the rim a shade darker still */
function honeyBlockBottom(): TexImage {
  const r = rng('honey_block_bottom');
  const t = img();
  const tones = quantize(fbm(r, [[16, 16, 0.3], [8, 8, 0.45], [4, 4, 0.25]], 0.12), [1.2, 4, 3, 0.8]);
  const inner = [0xc8700f, 0xd68016, 0xe2911e, 0xeba42b];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = edgeDist(x, y), k = tones[y * N + x];
      if (e === 0) setPx(t, x, y, k > 1 ? 0xa4540a : 0x94490a);
      else setPx(t, x, y, inner[k], 222 + k * 8);
    }
  for (const [x, y] of [[4, 3], [5, 3], [3, 4]]) setPx(t, x, y, 0xf6c35a, 236);
  return t;
}

export function registerBeeTextures(T: Record<string, () => TexImage | { w: number; h: number; frames: Uint8ClampedArray[] }>): void {
  const G = T as Record<string, Gen>;
  G['bee_nest_front_honey'] = beeNestFrontHoney;
  G['bee_nest_bottom'] = beeNestBottom;
  G['beehive_end'] = beehiveEnd;
  G['beehive_side'] = beehiveSide;
  G['beehive_front'] = () => beehiveFront(false);
  G['beehive_front_honey'] = () => beehiveFront(true);
  G['honey_block_bottom'] = honeyBlockBottom;
  G['honeycomb_block'] = honeycombBlock;
}
