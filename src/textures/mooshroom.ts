// (remaining mobs: the mooshroom) The mooshroom's skins (vanilla textures/entity/cow/red_mooshroom.png and
// brown_mooshroom.png, 64x32 on CowModel's layout, the cow's). The red one: a deep red hide, dappled all over with
// pale grey spots big and small (running on over the edges of its barrel), its face red with a grey muzzle, pale
// grey horns, grey stockings down its legs to dark hooves, a pink udder. The brown one: the same in a warm brown,
// its spots and muzzle cream. The mushrooms on its back are drawn as blocks (render/mooshroomRenderer.ts). Original
// pixel art.

import { Rand } from '../core/rng';
import { img, mixC, mulC, valueNoise, type TexImage } from './tex';
import { MOB_TEXTURES, SIDES, boxFaces, drawFace, noiseBox, noiseFace, paintFace, pick, type Ink, type Pal } from './mobs';

interface Hide {
  /** the hide, dark to light, and how much of each */
  hide: Pal;
  hideW: Pal;
  /** its spots, dark to light, and how much of each */
  spot: Pal;
  spotW: Pal;
  /** the muzzle's, dark to light */
  muzzle: Pal;
  /** the nostrils and the eyes (their dark, their light) */
  nostril: number;
  eye: number;
  eyeLight: number;
  horn: Pal;
  hoof: Pal;
  udder: Pal;
}

const RED: Hide = {
  hide: [0x6f0c0e, 0x860f12, 0x9a1416, 0xac1a1b, 0xbc2222, 0xc92b29],
  hideW: [1, 3, 6, 9, 5, 2],
  spot: [0x9d9d9d, 0xb2b2b2, 0xc4c4c4, 0xd2d2d2, 0xdedede],
  spotW: [1, 3, 5, 5, 2],
  muzzle: [0x8e8a88, 0xa19c99, 0xb2adaa, 0xc0bcb9],
  nostril: 0x3b3230,
  eye: 0x0c0c0c,
  eyeLight: 0xe6e6e6,
  horn: [0xa8a8a8, 0xbdbdbd, 0xcfcfcf],
  hoof: [0x3a3634, 0x46413e, 0x524c48],
  udder: [0xd38b87, 0xe29f9b, 0xeeb3b0],
};

const BROWN: Hide = {
  hide: [0x4d3420, 0x5d3f27, 0x6e4c2f, 0x7d5836, 0x8b633e, 0x986e45],
  hideW: [1, 3, 6, 9, 5, 2],
  spot: [0xa98f6c, 0xbba07b, 0xcab089, 0xd6be98, 0xe0caa6],
  spotW: [1, 3, 5, 5, 2],
  muzzle: [0xa48d74, 0xb59e84, 0xc4ae94, 0xd0bca3],
  nostril: 0x3b2b1f,
  eye: 0x0c0c0c,
  eyeLight: 0xe6e6e6,
  horn: [0xc4baa6, 0xd3cab8, 0xe0d9ca],
  hoof: [0x2e2923, 0x38322b, 0x433c34],
  udder: [0xd38b87, 0xe29f9b, 0xeeb3b0],
};

/** vanilla CowModel's boxes: the head (8x8x6), a horn (1x3x1), the body (12x18x10), the udder (4x6x1), a leg (4x12x4) */
const HEAD = boxFaces(0, 0, 8, 8, 6);
const HORN = boxFaces(22, 0, 1, 3, 1);
const BODY = boxFaces(18, 4, 12, 18, 10);
const UDDER = boxFaces(52, 0, 4, 6, 1);
const LEG = boxFaces(0, 16, 4, 12, 4);

function paintMooshroom(seed: number, h: Hide): TexImage {
  const t = img(64, 32);
  const r = new Rand(seed);
  const spot = () => pick(r, h.spot, h.spotW);
  const muzzle = () => pick(r, h.muzzle, [1, 3, 4, 2]);

  // body: the hide, dappled. Its four sides are one strip round the barrel (right 0-9, belly 10-21, left 22-31,
  // spine 32-43; rows head to tail), so a spot over an edge carries on over the next side
  noiseBox(t, BODY, r, h.hide, { w: h.hideW });
  const dapple = (w: number, hgt: number, ps: [number, number, number][], wrap: boolean) => {
    const jag = valueNoise(r, w, hgt, 2);
    return (x: number, y: number) => {
      for (const [cx, cy, rad] of ps) {
        let dx = Math.abs(x + 0.5 - cx);
        if (wrap) dx = Math.min(dx, w - dx);
        if (Math.hypot(dx, y + 0.5 - cy) / rad + (jag[y * w + x] - 0.5) * 0.6 < 1) return true;
      }
      return false;
    };
  };
  const strip = dapple(44, 18, [
    [3, 4, 2.2], [6, 12, 1.6], [9, 16, 1.1], [14, 3, 1.3], [17, 9, 2.4], [20, 15, 1.4], [25, 5, 1.8], [28, 13, 2.1],
    [31, 2, 1.1], [35, 8, 1.7], [38, 15, 1.3], [41, 3, 1.5], [12, 13, 1.0], [33, 16, 1.0],
  ], true);
  let off = 0;
  for (const k of SIDES) {
    const o = off;
    paintFace(t, BODY[k], (x, y) => (strip(o + x, y) ? spot() : undefined));
    off += BODY[k][2];
  }
  const chest = dapple(12, 10, [[3, 6, 1.8], [9, 3, 1.4]], false);
  const rump = dapple(12, 10, [[8, 4, 2.0], [3, 8, 1.2]], false);
  paintFace(t, BODY.top, (x, y) => (chest(x, y) ? spot() : undefined));
  paintFace(t, BODY.bottom, (x, y) => (rump(x, y) ? spot() : undefined));

  // head: the hide, a spot on its crown, a pale muzzle with dark nostrils; eyes with a glint
  noiseBox(t, HEAD, r, h.hide, { w: h.hideW });
  const inks: Record<string, Ink> = { S: spot, M: muzzle, E: h.eye, e: h.eyeLight, N: h.nostril };
  drawFace(t, HEAD.front, [
    '........',
    '...SS...',
    '........',
    'EeE..EeE',
    '........',
    '.MMMMMM.',
    'MNMMMMNM',
    'MMMMMMMM',
  ], inks, r);
  drawFace(t, HEAD.right, [
    '......',
    '......',
    '......',
    '......',
    '......',
    '.....M',
    '....MM',
    '....MM',
  ], inks, r);
  drawFace(t, HEAD.left, [
    '......',
    '......',
    '......',
    '......',
    '......',
    'M.....',
    'MM....',
    'MM....',
  ], inks, r);
  drawFace(t, HEAD.top, [
    '........',
    '........',
    '........',
    '...SS...',
    '..SSS...',
    '........',
  ], inks, r);
  drawFace(t, HEAD.bottom, [
    '........',
    '........',
    '........',
    'MMMMMMMM',
    'MMMMMMMM',
    'MMMMMMMM',
  ], inks, r);
  // horns: pale, a little darker at the base, lighter at the tip
  noiseBox(t, HORN, r, h.horn);
  for (const k of SIDES) paintFace(t, HORN[k], (_x, y, c) => (y === 2 ? mulC(c, 0.85) : y === 0 ? mixC(c, 0xffffff, 0.3) : undefined));
  noiseBox(t, UDDER, r, h.udder, { w: [1, 3, 2] });
  // legs: the hide down to the knee, grey stockings (pale from the knee down, jagged at the top) and dark hooves
  noiseBox(t, LEG, r, h.hide, { w: h.hideW });
  const cuff = valueNoise(r, 16, 1, 2);
  for (const k of SIDES)
    paintFace(t, LEG[k], (x, y) => {
      const u = (LEG[k][0] - LEG.right[0] + x) % 16;
      if (y >= 11) return pick(r, h.hoof);
      return y >= 6 + Math.round(cuff[u] * 2) ? spot() : undefined;
    });
  noiseFace(t, LEG.bottom, r, h.hoof);
  return t;
}

MOB_TEXTURES['red_mooshroom'] = () => paintMooshroom(0x2ed300, RED);
MOB_TEXTURES['brown_mooshroom'] = () => paintMooshroom(0xb200d, BROWN);
