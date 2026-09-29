// (minecarts) The powered, detector and activator rails' textures (vanilla block/powered_rail, detector_rail,
// activator_rail and their _on versions; our own drawing on the plain rail's pattern: four sleepers across, a rail
// down each side on a transparent ground). The powered rail runs on gold with a line of redstone down its middle; the
// detector rail has a stone pressure plate between its iron rails with a redstone spot in it; the activator rail's
// sleepers are darker and the redstone shows in short bars between them. Unpowered, the redstone is a dull dark red;
// powered, it glows bright.

import { type TexDef, type TexImage, img, setPx } from './tex';
import { N } from './blocklib/core';

const IRON = [0x4a4a4a, 0x6e6e6e, 0x999999, 0xbdbdbd];
const GOLD = [0x7a5a10, 0xb88a1a, 0xe2b832, 0xfbe27a];
const WOOD = [0x3d2c17, 0x55401f, 0x6d5330, 0x846641];
/** the activator rail's sleepers: a darker, redder wood */
const DARK_WOOD = [0x2a1a12, 0x3b251a, 0x4d3222, 0x5e3f2b];
/** redstone: [deep, body, highlight], off and on */
const DUST_OFF = [0x3a0808, 0x5a1010, 0x731a16];
const DUST_ON = [0x9c0e02, 0xe0240e, 0xff7a4a];
const PLATE = [0x6a6a6a, 0x858585, 0x9c9c9c, 0xb0b0b0];

/** the sleepers' rows (each two pixels deep) */
const SLEEPERS = [1, 5, 9, 13];

/** four sleepers across the tile in `wood`, their ends ragged and their undersides darker */
function sleepers(t: TexImage, wood: number[]): void {
  for (const y0 of SLEEPERS)
    for (let x = 1; x < N - 1; x++) {
      const end = x === 1 || x === N - 2;
      setPx(t, x, y0, end ? wood[1] : (x * 7 + y0 * 3) % 5 === 0 ? wood[3] : wood[2]);
      setPx(t, x, y0 + 1, wood[1]);
      if (!end && (x * 5 + y0) % 7 === 0) setPx(t, x, y0 + 1, wood[0]);
    }
}

/** the two rails, each with a bright running surface on its inner edge and a darker joint every four pixels */
function rails(t: TexImage, metal: number[]): void {
  for (let y = 0; y < N; y++) {
    const joint = y % 4 === 2;
    setPx(t, 2, y, joint ? metal[0] : metal[1]);
    setPx(t, 3, y, metal[3]);
    setPx(t, 12, y, metal[3]);
    setPx(t, 13, y, joint ? metal[0] : metal[1]);
  }
}

/** the powered rail: gold rails, and a line of redstone down the middle over the sleepers */
function powered(on: boolean): TexImage {
  const t = img();
  const d = on ? DUST_ON : DUST_OFF;
  sleepers(t, WOOD);
  for (let y = 0; y < N; y++) {
    setPx(t, 7, y, d[1]);
    setPx(t, 8, y, y % 3 === 0 ? d[2] : d[1]);
    if (on && y % 2 === 0) {
      setPx(t, 6, y, d[0]);
      setPx(t, 9, y, d[0]);
    }
  }
  rails(t, GOLD);
  return t;
}

/** the detector rail: iron rails, and a stone pressure plate between them with a redstone spot in its middle */
function detector(on: boolean): TexImage {
  const t = img();
  const d = on ? DUST_ON : DUST_OFF;
  sleepers(t, WOOD);
  // the plate: 6 x 8, its rim darker on the lower right, lighter on the upper left
  for (let y = 4; y <= 11; y++)
    for (let x = 5; x <= 10; x++) {
      const rim = x === 5 || y === 4 ? PLATE[3] : x === 10 || y === 11 ? PLATE[0] : (x + y) % 3 === 0 ? PLATE[1] : PLATE[2];
      setPx(t, x, y, rim);
    }
  // the spot, and (lit) its glow along the plate
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) setPx(t, x, y, (x + y) % 2 ? d[1] : d[2]);
  setPx(t, 7, 6, d[0]);
  setPx(t, 8, 9, d[0]);
  if (on) for (let y = 5; y <= 10; y++) if (y < 7 || y > 8) setPx(t, 7 + (y & 1), y, d[1]);
  rails(t, IRON);
  return t;
}

/** the activator rail: iron rails on dark sleepers, the redstone in short bars between the sleepers */
function activator(on: boolean): TexImage {
  const t = img();
  const d = on ? DUST_ON : DUST_OFF;
  sleepers(t, DARK_WOOD);
  for (const y0 of [3, 7, 11, 15])
    for (let x = 5; x <= 10; x++) {
      const edge = x === 5 || x === 10;
      setPx(t, x, y0, edge ? d[0] : d[1]);
      setPx(t, x, (y0 + 1) % N, edge ? d[0] : x === 7 || x === 8 ? d[2] : d[1]);
    }
  rails(t, IRON);
  return t;
}

export function registerRailTextures(T: Record<string, () => TexDef>): void {
  T['powered_rail'] = () => powered(false);
  T['powered_rail_on'] = () => powered(true);
  T['detector_rail'] = () => detector(false);
  T['detector_rail_on'] = () => detector(true);
  T['activator_rail'] = () => activator(false);
  T['activator_rail_on'] = () => activator(true);
}
