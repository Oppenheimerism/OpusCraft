// Boat and chest boat entity textures, one per wood (vanilla entity/boat/<wood>.png, 128x64 in the
// BoatModel box-UV layout, and entity/chest_boat/<wood>.png, 128x128 with the chest below it).
// Plank hulls in each wood's plank colours: boards with butt joints, a lighter rim, the inside in
// shade, a dark underside, the two paddles, and on chest boats the ordinary chest with its latch.
// Original procedural art.
//
// Where the faces end up (see mobModels boatParts): every wall's front rect is its inside and its
// back rect the outside, the top rect is the rim (row 0 = outer edge); the bottom slab's back rect is
// the floor, its front rect the underside.

import { TexImage, img, plot, mulC, mixC, valueNoise, equalize, Rand } from './tex';
import { WOOD } from './blocklib/wood';

type Face = [number, number, number, number];
type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
type Box = Record<FaceName, Face>;

function boxFaces(u: number, v: number, w: number, h: number, d: number): Box {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  };
}

/**
 * Planks across a face: boards `bh` rows high whose last row is the dark gap, grain streaks along
 * them, a lit top edge and a butt joint every 7-14 pixels. `pal` is a WoodDef plank ramp.
 */
function boards(t: TexImage, f: Face, r: Rand, pal: readonly number[], bh: number, shade = 1, joints = true): void {
  const [x0, y0, w, h] = f;
  if (w <= 0 || h <= 0) return;
  const g = equalize(valueNoise(r, w, h, Math.min(4, w), 1));
  const cuts: number[][] = [];
  for (let b = 0; b * bh < h; b++) {
    const js: number[] = [];
    if (joints && w >= 8) for (let x = 2 + r.nextInt(Math.min(9, w - 4)); x < w - 2; x += 7 + r.nextInt(8)) js.push(x);
    cuts.push(js);
  }
  for (let y = 0; y < h; y++) {
    const b = Math.floor(y / bh), yy = y % bh, gap = bh > 1 && yy === bh - 1;
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x] * 0.7 + r.next() * 0.3;
      let tone = v < 0.12 ? 1 : v < 0.35 ? 2 : v < 0.75 ? 3 : v < 0.93 ? 4 : 5;
      if (gap) tone = 0;
      else if (cuts[b].includes(x)) tone = 0;
      else if ((yy === 0 || cuts[b].includes(x - 1)) && tone < 5 && r.chance(0.6)) tone++;
      plot(t, x0 + x, y0 + y, mulC(pal[tone], shade));
    }
  }
}

/** a face of plain dark wood (end grain, edges that barely show) */
function dark(t: TexImage, f: Face, r: Rand, pal: readonly number[], shade: number): void {
  const [x0, y0, w, h] = f;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(t, x0 + x, y0 + y, mulC(pal[1 + r.nextInt(2)], shade));
}

/** the rim along a wall's top: the outer edge (row 0) catches the light */
function rim(t: TexImage, f: Face, r: Rand, pal: readonly number[]): void {
  const [x0, y0, w, h] = f;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(t, x0 + x, y0 + y, pal[y === 0 ? 4 + r.nextInt(2) : 3 + r.nextInt(2)]);
}

function wall(t: TexImage, b: Box, r: Rand, pal: readonly number[]): void {
  boards(t, b.back, r, pal, 3);
  boards(t, b.front, r, pal, 3, 0.82);
  rim(t, b.top, r, pal);
  dark(t, b.bottom, r, pal, 0.62);
  dark(t, b.right, r, pal, 0.8);
  dark(t, b.left, r, pal, 0.8);
}

/** a paddle at (62, v): the 2x2x18 loom and the 1x6x7 blade share the texture offset */
function paddle(t: TexImage, v: number, r: Rand, pal: readonly number[]): void {
  const loom = boxFaces(62, v, 2, 2, 18), blade = boxFaces(62, v, 1, 6, 7);
  for (const k of ['top', 'bottom', 'right', 'left'] as FaceName[]) {
    const [x0, y0, w, h] = loom[k];
    // along the loom: grain streaks, the grip end (z = -5, the far end of the long rects) darker
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const along = w > h ? x / (w - 1) : y / (h - 1);
        const tone = along < 0.22 ? 2 : r.chance(0.25) ? 3 : 4;
        plot(t, x0 + x, y0 + y, mulC(pal[tone], k === 'bottom' || k === 'left' ? 0.9 : 1));
      }
  }
  dark(t, loom.front, r, pal, 0.85);
  dark(t, loom.back, r, pal, 0.85);
  for (const k of ['right', 'left'] as FaceName[]) {
    const [x0, y0, w, h] = blade[k];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        plot(t, x0 + x, y0 + y, edge ? mulC(pal[1], 0.9) : pal[3 + (r.chance(0.3) ? 1 : 0) - (r.chance(0.15) ? 1 : 0)]);
      }
  }
  for (const k of ['top', 'bottom', 'front', 'back'] as FaceName[]) dark(t, blade[k], r, pal, 0.8);
}

// the chest (vanilla ChestBoatModel chest_lid (0,59) 12x4x12, chest_bottom (0,76) 12x8x12,
// chest_lock (0,59) 2x4x1), in the chest block's colours whatever the boat's wood
const CHEST = [0x6b4a1c, 0x86591f, 0x976628, 0xa6722e, 0xb27d35, 0xbf8a3f];
const CHEST_EDGE = 0x3a2710;

function chestFace(t: TexImage, f: Face, r: Rand, shade = 1): void {
  boards(t, f, r, CHEST, 4, shade, false);
  const [x0, y0, w, h] = f;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) plot(t, x0 + x, y0 + y, mulC(CHEST_EDGE, shade));
}

function chest(t: TexImage, r: Rand): void {
  const lid = boxFaces(0, 59, 12, 4, 12), body = boxFaces(0, 76, 12, 8, 12), lock = boxFaces(0, 59, 2, 4, 1);
  for (const k of ['top', 'right', 'front', 'left', 'back'] as FaceName[]) chestFace(t, lid[k], r);
  chestFace(t, lid.bottom, r, 0.7);
  for (const k of ['bottom', 'right', 'front', 'left', 'back'] as FaceName[]) chestFace(t, body[k], r);
  chestFace(t, body.top, r, 0.6);
  // the latch: bright face, grey sides
  const [fx, fy] = lock.front;
  const LATCH = [[0xd8d8d8, 0xbcbcbc], [0xbcbcbc, 0x9a9a9a], [0x9a9a9a, 0x7a7a7a], [0x5c5c5c, 0x4a4a4a]];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) plot(t, fx + x, fy + y, LATCH[y][x]);
  for (const k of ['top', 'bottom', 'right', 'left', 'back'] as FaceName[]) {
    const [x0, y0, w, h] = lock[k];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(t, x0 + x, y0 + y, k === 'top' ? 0xa8a8a8 : 0x7c7c7c);
  }
}

function boat(wood: string, withChest: boolean): TexImage {
  const t = img(128, withChest ? 128 : 64);
  const r = new Rand(0xb0a7 + wood.length * 977 + wood.charCodeAt(0) * 31 + wood.charCodeAt(wood.length - 1));
  const pal = WOOD[wood].wood;
  const bottom = boxFaces(0, 0, 28, 16, 3);
  boards(t, bottom.back, r, pal, 4, 0.9);
  boards(t, bottom.front, r, pal, 4, 0.62);
  for (const k of ['top', 'bottom', 'right', 'left'] as FaceName[]) dark(t, bottom[k], r, pal, 0.7);
  wall(t, boxFaces(0, 19, 18, 6, 2), r, pal);
  wall(t, boxFaces(0, 27, 16, 6, 2), r, pal);
  wall(t, boxFaces(0, 35, 28, 6, 2), r, pal);
  wall(t, boxFaces(0, 43, 28, 6, 2), r, pal);
  // paddles in a slightly lighter, worn tone of the same wood
  const light = pal.map((c) => mixC(c, 0xffffff, 0.06));
  paddle(t, 0, r, light);
  paddle(t, 20, r, light);
  if (withChest) chest(t, r);
  return t;
}

/** keys `boat_<wood>` and `chest_boat_<wood>`, for every wood with planks (the boat woods) */
export const BOAT_TEXTURES: Record<string, () => TexImage> = {};
for (const w of Object.keys(WOOD)) {
  BOAT_TEXTURES[`boat_${w}`] = () => boat(w, false);
  BOAT_TEXTURES[`chest_boat_${w}`] = () => boat(w, true);
}
