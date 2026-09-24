// GUI sprites of the enchanting table, anvil and grindstone screens (vanilla
// container/enchanting_table.png, anvil.png, grindstone.png and the sprites in
// gui/sprites/container/{enchanting_table,anvil,grindstone}): backgrounds at
// vanilla slot positions, the three offer buttons, the level orbs, the rename
// field, the red "can't" crosses and the empty lapis slot.

import { TexImage, img, plot, rect, mixC } from './tex';
import { GUI_TEXTURES, panel, inset, slotAt, playerInventory, arrowMask, drawMask, pat } from './gui';

const G = GUI_TEXTURES;
const BLACK = 0x000000;
const WHITE = 0xffffff;
const SLOT = 0x8b8b8b;

// ---------------------------------------------------------------------------
// Enchanting table

G['container_enchanting_table'] = () => {
  const t = panel(176, 166);
  slotAt(t, 15, 47); // item
  slotAt(t, 35, 47); // lapis
  inset(t, 59, 13, 110, 59, 0x6b6b6b); // behind the three offers (108x19 each at 60, 14 + 19i)
  playerInventory(t, 84);
  return t;
};

interface Bevel {
  outline: number;
  hi: number;
  face: number;
  lo: number;
}

/** 108x19 offer button: dark outline, bevelled face */
function offer(s: Bevel, alpha = 255): TexImage {
  const t = img(108, 19);
  for (let y = 0; y < 19; y++)
    for (let x = 0; x < 108; x++) {
      let c = s.face;
      if (x === 0 || y === 0 || x === 107 || y === 18) c = s.outline;
      else if (x === 1 || y === 1) c = s.hi;
      else if (x === 106 || y === 17) c = s.lo;
      plot(t, x, y, c, alpha);
    }
  return t;
}
G['enchantment_slot'] = () => offer({ outline: 0x3f3527, hi: 0xe6d9bf, face: 0xcdb895, lo: 0x9a8565 });
G['enchantment_slot_highlighted'] = () => offer({ outline: 0x3f2a4a, hi: 0xb58ac8, face: 0x8d5aa3, lo: 0x5f3a72 });
G['enchantment_slot_disabled'] = () => offer({ outline: 0x2b2419, hi: 0x5c4f3d, face: 0x4a3f30, lo: 0x362e23 }, 230);

// the level orbs (1, 2, 3 levels) beside each offer
const DIGITS: Record<number, string[]> = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
};
function levelOrb(n: number, on: boolean): TexImage {
  const t = img(16, 16);
  const cx = 7.5, cy = 7.5;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > 7.2) continue;
      let c: number;
      if (d > 6.2) c = on ? 0x173d05 : 0x2f2f2f;
      else {
        const k = Math.max(0, Math.min(1, (d - (x - cx < 0 && y - cy < 0 ? 1.5 : 0)) / 6.2));
        c = on ? mixC(0xc8ff72, 0x4ea513, k) : mixC(0xbdbdbd, 0x6a6a6a, k);
      }
      plot(t, x, y, c);
    }
  const rows = DIGITS[n];
  const ink = on ? 0x163a03 : 0x3c3c3c;
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < 3; x++) if (rows[y][x] === '#') plot(t, 6 + x, 5 + y, ink);
  return t;
}
for (const n of [1, 2, 3]) {
  G[`enchanting_level_${n}`] = () => levelOrb(n, true);
  G[`enchanting_level_${n}_disabled`] = () => levelOrb(n, false);
}

// empty lapis slot: a gem silhouette, debossed like the armour slots
G['slot_lapis_lazuli'] = () => {
  const rows = [
    '................',
    '................',
    '......####......',
    '.....######.....',
    '....########....',
    '...##########...',
    '...##########...',
    '..############..',
    '..############..',
    '...##########...',
    '...##########...',
    '....########....',
    '.....######.....',
    '......####......',
    '................',
    '................',
  ];
  const t = img(16, 16);
  const m = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16 && rows[y][x] === '#';
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!m(x, y)) continue;
      let c = 0x7b7b7b;
      if (!m(x - 1, y) || !m(x, y - 1)) c = 0x6a6a6a;
      else if (!m(x + 1, y) || !m(x, y + 1)) c = 0x9a9a9a;
      plot(t, x, y, c);
    }
  return t;
};

// ---------------------------------------------------------------------------
// Anvil

/** the smith's hammer in the corner of the anvil screen */
export function hammer(t: TexImage, x0: number, y0: number): void {
  const H = [
    '..........OOOOO.....',
    '.........OhhhhhO....',
    '........OhmmmmmdO...',
    '.......OhmmmmmmdO...',
    '......OhmmmmmmmdO...',
    '.......OdmmmmmmdO...',
    '........OdmmmmddO...',
    '.......OwOddddddO...',
    '......OwwwOOOOOO....',
    '.....OwwbO..........',
    '....OwwbO...........',
    '...OwwbO............',
    '..OwwbO.............',
    '.OwwbO..............',
    'OwwbO...............',
    'ObbO................',
    '.OO.................',
  ];
  pat(t, x0, y0, H, { O: 0x1b1b1b, h: 0xd8d8d8, m: 0x9d9d9d, d: 0x5f5f5f, w: 0x9a6b3c, b: 0x5b3b1c });
}

/** a plus sign between the two inputs */
function plus(t: TexImage, x0: number, y0: number): void {
  const P = [
    '....###....',
    '....#+#....',
    '....#+#....',
    '....#+#....',
    '#####+#####',
    '#+++++++++#',
    '#####+#####',
    '....#+#....',
    '....#+#....',
    '....#+#....',
    '....###....',
  ];
  pat(t, x0, y0, P, { '#': 0x373737, '+': SLOT });
}

G['container_anvil'] = () => {
  const t = panel(176, 166);
  hammer(t, 22, 10);
  slotAt(t, 27, 47);
  slotAt(t, 76, 47);
  slotAt(t, 134, 47);
  plus(t, 55, 50);
  drawMask(t, 102, 48, arrowMask(22, 15, 7), SLOT);
  playerInventory(t, 84);
  return t;
};

/** 110x16 rename field (drawn at 59,20): black when there's an item to name, grey otherwise */
function textField(inner: number): TexImage {
  const t = img(110, 16);
  inset(t, 0, 0, 110, 16, inner);
  rect(t, 1, 1, 108, 14, inner);
  return t;
}
G['anvil_text_field'] = () => textField(BLACK);
G['anvil_text_field_disabled'] = () => textField(0x6f6f6f);

/** 28x21 red cross drawn over the arrow when the inputs don't combine */
function errorCross(): TexImage {
  const t = img(28, 21);
  const draw = (x: number, y: number, c: number) => plot(t, x, y, c);
  for (let i = 0; i < 15; i++) {
    const x = 7 + i, y = 3 + i;
    for (const [dx, c] of [[-2, BLACK], [-1, 0xff5555], [0, 0xd81e1e], [1, 0xa01010], [2, BLACK]] as [number, number][]) {
      draw(x + dx, y, c);
      draw(20 - i + dx, y, c);
    }
  }
  return t;
}
G['anvil_error'] = errorCross;

// ---------------------------------------------------------------------------
// Grindstone

G['container_grindstone'] = () => {
  const t = panel(176, 166);
  // the grindstone behind the two inputs: a stone wheel between dark wooden pivots
  const wheel = (x: number, y: number) => {
    const cx = 57.5, cy = 38.5, rx = 18, ry = 26;
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  };
  for (let y = 10; y < 68; y++)
    for (let x = 36; x < 80; x++) {
      if (!wheel(x, y)) continue;
      const edge = !wheel(x - 1, y) || !wheel(x + 1, y) || !wheel(x, y - 1) || !wheel(x, y + 1);
      const light = !wheel(x - 1, y - 1);
      plot(t, x, y, edge ? 0x3c3c3c : light ? 0xb4b4b4 : 0x9a9a9a);
    }
  for (const x0 of [26, 79]) {
    rect(t, x0, 30, 11, 17, 0x4a3320);
    rect(t, x0 + 1, 31, 9, 15, 0x6b4a2c);
    rect(t, x0 + 1, 45, 9, 1, 0x3d2a19);
  }
  slotAt(t, 49, 19);
  slotAt(t, 49, 40);
  slotAt(t, 129, 34);
  drawMask(t, 95, 34, arrowMask(22, 15, 7), SLOT);
  playerInventory(t, 84);
  return t;
};
G['grindstone_error'] = errorCross;

void WHITE;
