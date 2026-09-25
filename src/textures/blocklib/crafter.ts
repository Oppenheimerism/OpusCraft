// The crafter's textures (1.21; vanilla block/crafter_*): its top, bottom, front (north), back (south) and sides (east
// and west), and the ones it shows while powered (_triggered: its top, back and sides) or crafting (_crafting: its
// top, front and sides). Drawn from the advancement icon's (iconblocks.ts: the dark grey machine, its grid of sunken
// cells on top, the grated mouth in front, a redstone groove and a copper port on the sides), so the block matches its
// icon: its redstone lies dim until it's powered, when it glows red; while it crafts, its cells, its mouth and its
// ports glow amber (it crafts only while powered, so its crafting faces keep their redstone lit). The back has the
// side's port without the groove, the bottom a sunken vent.

import { TexImage, setPx, getPx, mixC, flipH, type TexDef } from '../tex';
import { rng } from './core';
import { speckled } from './terrain';
import { crafterTop, crafterNorth, crafterSide } from './iconblocks';

// the icon's palette (iconblocks.ts)
const CRAFTER = [0x2c2c30, 0x37373c, 0x424247, 0x4c4c51, 0x56565b, 0x616166, 0x6f6f74];
const CR_HI = 0x86868b, CR_EDGE = 0x1d1d21;
const REDSTONE = [0x5a0a05, 0x8c1209, 0xbf1d0f, 0xeb2f1c, 0xff6b52];
const COPPER = [0x6e3a24, 0x8f4b30, 0xb4653e, 0xd08056, 0xeda98c];
/** the redstone unpowered: each shade dark and dull (and so under the port's shadow, iconblocks' tint of 0.35) */
const DIM_SHADES = [0x2a0503, 0x330704, 0x3f0b07, 0x4d0f09, 0x66180f];
const DIM: Record<number, number> = {};
REDSTONE.forEach((c, i) => {
  DIM[c] = DIM_SHADES[i];
  DIM[mixC(c, CR_EDGE, 0.35)] = mixC(DIM_SHADES[i], CR_EDGE, 0.35);
});
const AMBER = 0xffae3a, AMBER_HI = 0xfff0b4;

type Mode = 'idle' | 'triggered' | 'crafting';

/** the icon's base (its crafterBase): speckled dark grey stone, a lit and shaded edge, a softer ring inside it */
function base(seed: string): TexImage {
  const t = speckled(seed, CRAFTER, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 0.6, 2.5, 5, 2.5, 0.6, 0], mode: 1, dark: 6, darkSize: [1, 3], light: 4, lightSize: [1, 2] });
  for (let i = 0; i <= 15; i++) {
    setPx(t, i, 0, CR_HI);
    setPx(t, 0, i, CR_HI);
    setPx(t, i, 15, CR_EDGE);
    setPx(t, 15, i, CR_EDGE);
  }
  setPx(t, 15, 0, CRAFTER[3]);
  setPx(t, 0, 15, CRAFTER[3]);
  for (let i = 1; i < 14; i++) {
    setPx(t, i, 1, mixC(getPx(t, i, 1), CR_HI, 0.25));
    setPx(t, 1, i + 1, mixC(getPx(t, 1, i + 1), CR_HI, 0.25));
    setPx(t, i + 1, 14, mixC(getPx(t, i + 1, 14), CR_EDGE, 0.3));
    setPx(t, 14, i, mixC(getPx(t, 14, i), CR_EDGE, 0.3));
  }
  return t;
}

/** the redstone in a texture dimmed (unpowered) */
function dimRedstone(t: TexImage): TexImage {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = DIM[getPx(t, x, y)];
    if (c !== undefined) setPx(t, x, y, c);
  }
  return t;
}

/** the port's redstone core (as on the icon's side): lit while powered, dark while not, glowing amber while crafting */
function core(t: TexImage, mode: Mode): void {
  for (const [x, y, c] of [[7, 6, REDSTONE[1]], [8, 6, REDSTONE[1]], [7, 7, REDSTONE[4]], [8, 7, REDSTONE[3]], [7, 8, REDSTONE[3]], [8, 8, REDSTONE[2]]] as const)
    setPx(t, x, y, mode === 'triggered' ? c : mode === 'crafting' ? (c === REDSTONE[4] ? AMBER_HI : AMBER) : DIM[c]);
}

/** the copper port plate (as on the icon's side), its core, and the shadow it throws on the lower right */
function port(t: TexImage, mode: Mode): void {
  for (let y = 4; y <= 11; y++)
    for (let x = 5; x <= 10; x++) {
      let c = COPPER[2];
      if (y === 4 || x === 5) c = COPPER[3];
      if (y === 4 && x === 5) c = COPPER[4];
      if (y === 11 || x === 10) c = COPPER[1];
      if (y === 11 && x === 10) c = COPPER[0];
      setPx(t, x, y, c);
    }
  core(t, mode);
  setPx(t, 7, 9, COPPER[3]);
  setPx(t, 8, 9, COPPER[3]);
  for (let y = 5; y <= 12; y++) setPx(t, 11, y, mixC(getPx(t, 11, y), CR_EDGE, 0.35));
  for (let x = 6; x <= 11; x++) setPx(t, x, 12, mixC(getPx(t, x, 12), CR_EDGE, 0.35));
}

/** the top: the icon's; its grid's four crossings lit red when powered; its nine cells glowing too while it crafts */
function top(mode: Mode): TexImage {
  const t = crafterTop();
  if (mode !== 'idle')
    for (const g of [5, 10]) for (const h of [5, 10]) setPx(t, g, h, g === 5 && h === 5 ? REDSTONE[4] : REDSTONE[3]);
  if (mode === 'crafting')
    for (const y0 of [1, 6, 11])
      for (const x0 of [1, 6, 11])
        for (let y = y0; y <= y0 + 3; y++)
          for (let x = x0; x <= x0 + 3; x++) {
            const inner = x > x0 && y > y0 && x < x0 + 3 && y < y0 + 3;
            const lit = x === x0 + 3 || y === y0 + 3;
            setPx(t, x, y, mixC(getPx(t, x, y), inner ? AMBER : AMBER_HI, inner ? 0.75 : lit ? 0.45 : 0.2));
          }
  return t;
}

/** the front: the icon's grated mouth; its nine holes glowing while it crafts */
function front(mode: Mode): TexImage {
  const t = crafterNorth();
  if (mode === 'crafting')
    for (const y of [4, 7, 10])
      for (const x of [4, 7, 10]) {
        setPx(t, x, y, AMBER_HI);
        setPx(t, x + 1, y, AMBER);
        setPx(t, x, y + 1, AMBER);
        setPx(t, x + 1, y + 1, mixC(AMBER, 0x7a3c10, 0.4));
      }
  return t;
}

/** the east side: the icon's, its groove and port dim until powered; its port's core amber while it crafts */
function east(mode: Mode): TexImage {
  const t = crafterSide();
  if (mode === 'idle') dimRedstone(t);
  if (mode === 'crafting') core(t, 'crafting');
  return t;
}

/** the back: the port without the groove */
function back(mode: Mode): TexImage {
  const t = base('crafter_south');
  port(t, mode);
  return t;
}

/** the bottom: a sunken square vent with three slots */
function bottom(): TexImage {
  const t = base('crafter_bottom');
  const r = rng('crafter_bottom', 7);
  for (let y = 4; y <= 11; y++)
    for (let x = 4; x <= 11; x++) {
      let c = [0x232327, 0x27272b][r.nextInt(2)];
      if (y === 4 || x === 4) c = 0x19191c;
      else if (y === 11 || x === 11) c = 0x48484d;
      else if (y === 6 || y === 8 || y === 10) c = x === 5 ? 0x0c0c0e : 0x121214;
      setPx(t, x, y, c);
    }
  return t;
}

export function registerCrafterTextures(T: Record<string, () => TexDef>): void {
  T['crafter_top'] = () => top('idle');
  T['crafter_top_triggered'] = () => top('triggered');
  T['crafter_top_crafting'] = () => top('crafting');
  T['crafter_bottom'] = bottom;
  T['crafter_north'] = () => front('idle');
  T['crafter_north_crafting'] = () => front('crafting');
  T['crafter_south'] = () => back('idle');
  T['crafter_south_triggered'] = () => back('triggered');
  T['crafter_east'] = () => east('idle');
  T['crafter_east_triggered'] = () => east('triggered');
  T['crafter_east_crafting'] = () => east('crafting');
  T['crafter_west'] = () => flipH(east('idle'));
  T['crafter_west_triggered'] = () => flipH(east('triggered'));
  T['crafter_west_crafting'] = () => flipH(east('crafting'));
}
