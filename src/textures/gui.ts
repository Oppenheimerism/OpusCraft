// Procedural GUI sprites in the style of Minecraft Java Edition 1.20 / 1.21.
//
// Everything is drawn from code: HUD icons (hotbar, hearts, hunger, armor,
// air, crosshair, XP bar), widgets (buttons, sliders, text fields,
// checkboxes), container screens, creative tabs, menu backgrounds, the
// title logo and the edition badge. Titles/labels are drawn by the engine.
//
// Conventions:
//  - container backgrounds use vanilla slot coordinates; a slot's 18x18 frame
//    sits at (itemX - 1, itemY - 1), big result slots are 26x26 at
//    (itemX - 5, itemY - 5).
//  - "fill" sprites (heart_full, food_full, ...) contain only the interior;
//    they are drawn over their container/empty sprite like vanilla. Armor and
//    air sprites are complete and drawn alone.
//  - hunger drains from the left, so food_half keeps the right (meat) half;
//    heart_half keeps the left half.
//  - widgets are meant to be nine-sliced with a 3 px border (text fields 1 px).
//  - the hotbar is translucent like vanilla and relies on alpha blending.

import { TexImage, img, plot, rect, clear, getA, getPx, mixC, mulC, gray, packRGB, rgbOf, valueNoise, whiteNoise, combine, equalize, Rand } from './tex';
import { hashString } from '../core/rng';
import { FONT } from './font';
import { BLOCK_TEXTURES } from './blocks';

type Gen = () => TexImage;
export const GUI_TEXTURES: Record<string, Gen> = {};
const G = GUI_TEXTURES;

function R(name: string, salt = 0): Rand {
  return new Rand(hashString('gui:' + name) ^ salt, 91);
}

// ---------------------------------------------------------------------------
// Palette (vanilla container colors)

const BLACK = 0x000000;
const WHITE = 0xffffff;
const PANEL = 0xc6c6c6;
const PANEL_SHADOW = 0x555555;
const SLOT = 0x8b8b8b;
const SLOT_SHADOW = 0x373737;

type Col = number | [number, number] | null;

/** Draw a character pattern; chars missing from the palette are skipped, null clears. */
function pat(t: TexImage, x0: number, y0: number, rows: string[], pal: Record<string, Col>): void {
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const c = pal[rows[y][x]];
      if (c === undefined) continue;
      if (c === null) clear(t, x0 + x, y0 + y);
      else if (typeof c === 'number') plot(t, x0 + x, y0 + y, c);
      else plot(t, x0 + x, y0 + y, c[0], c[1]);
    }
}

function flipV(t: TexImage): TexImage {
  const o = img(t.w, t.h);
  for (let y = 0; y < t.h; y++) o.data.set(t.data.subarray(y * t.w * 4, (y + 1) * t.w * 4), (t.h - 1 - y) * t.w * 4);
  return o;
}

// ===========================================================================
// HUD: hotbar

// The vanilla hotbar is translucent: a dark see-through bar with light-gray
// slot frames. Each 20x20 cell = light ring, dark inner ring, 16x16 hole.
const HB_EDGE: [number, number] = [0x000000, 0xa0];
const HB_FRAME: [number, number] = [0x939393, 0xe8];
const HB_FRAME_LO: [number, number] = [0x7a7a7a, 0xe8];
const HB_INNER: [number, number] = [0x2a2a2a, 0xc8];
const HB_HOLE: [number, number] = [0x161616, 0x70];

/** One 20x20 hotbar cell at (ox, oy). */
function hotbarCell(t: TexImage, ox: number, oy: number): void {
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) {
      const ring = Math.min(x, y, 19 - x, 19 - y);
      let c: [number, number];
      if (ring === 0) c = x === 19 || y === 19 ? HB_FRAME_LO : HB_FRAME;
      else if (ring === 1) c = HB_INNER;
      else c = HB_HOLE;
      plot(t, ox + x, oy + y, c[0], c[1]);
    }
}

function hotbarEdge(t: TexImage, x0: number, y0: number, w: number, h: number): void {
  for (let x = x0; x < x0 + w; x++) {
    plot(t, x, y0, HB_EDGE[0], HB_EDGE[1]);
    plot(t, x, y0 + h - 1, HB_EDGE[0], HB_EDGE[1]);
  }
  for (let y = y0 + 1; y < y0 + h - 1; y++) {
    plot(t, x0, y, HB_EDGE[0], HB_EDGE[1]);
    plot(t, x0 + w - 1, y, HB_EDGE[0], HB_EDGE[1]);
  }
}

G['hotbar'] = () => {
  const t = img(182, 22);
  hotbarEdge(t, 0, 0, 182, 22);
  for (let i = 0; i < 9; i++) hotbarCell(t, 1 + 20 * i, 1);
  return t;
};

// 24x23, drawn at (hotbarX - 1 + 20 * slot, hotbarY - 1). The 16x16 opening
// lines up exactly with the item area of the selected slot.
const SEL_RINGS = [0xffffff, 0xe0e0e0, 0xc2c2c2];
G['hotbar_selection'] = () => {
  const t = img(24, 23);
  for (let y = 0; y < 23; y++)
    for (let x = 0; x < 24; x++) {
      if (x >= 4 && x <= 19 && y >= 4 && y <= 19) continue; // opening = item area
      const ring = Math.min(x, 23 - x, y, 22 - y);
      if ((x === 0 || x === 23) && (y === 0 || y === 22)) continue; // cut corners
      plot(t, x, y, ring === 0 ? BLACK : SEL_RINGS[ring - 1]);
    }
  return t;
};

/** Offhand slot: a lone hotbar cell (22x22 with its edge) inside a 29x24 sprite. */
function offhand(fx: number): TexImage {
  const t = img(29, 24);
  hotbarEdge(t, fx, 1, 22, 22);
  hotbarCell(t, fx + 1, 2);
  return t;
}
G['hotbar_offhand_left'] = () => offhand(0);
G['hotbar_offhand_right'] = () => offhand(7);

G['crosshair'] = () => {
  const t = img(15, 15);
  for (let i = 0; i < 15; i++) {
    plot(t, i, 7, WHITE);
    plot(t, 7, i, WHITE);
  }
  return t;
};

// ===========================================================================
// HUD: experience bar

G['experience_bar_background'] = () => {
  const t = img(182, 5);
  for (let x = 0; x < 182; x++)
    for (let y = 0; y < 5; y++) {
      const edgeX = x === 0 || x === 181, edgeY = y === 0 || y === 4;
      if (edgeX && edgeY) continue; // rounded ends
      if (edgeX || edgeY) plot(t, x, y, BLACK);
      else plot(t, x, y, [0x3f4a3a, 0x2f372b, 0x262c23][y - 1]);
    }
  return t;
};

G['experience_bar_progress'] = () => {
  const t = img(182, 5);
  for (let x = 0; x < 182; x++)
    for (let y = 0; y < 5; y++) {
      const edgeX = x === 0 || x === 181, edgeY = y === 0 || y === 4;
      if (edgeX && edgeY) continue;
      if (edgeX || edgeY) plot(t, x, y, BLACK);
      else plot(t, x, y, [0xb6ff76, 0x80ff20, 0x55c511][y - 1]);
    }
  return t;
};

// ===========================================================================
// HUD: hearts (9x9)

const HEART_OUTLINE = [
  '.XX...XX.',
  'X..X.X..X',
  'X...X...X',
  'X.......X',
  'X.......X',
  '.X.....X.',
  '..X...X..',
  '...X.X...',
  '....X....',
];
// interior shading: w = shine, p = light, r = body, d = shade
const HEART_FILL = [
  '.........',
  '.wp...pr.',
  '.prr.rrr.',
  '.rrrrrrr.',
  '.rrrrrrd.',
  '..rrrrd..',
  '...rdd...',
  '....d....',
  '.........',
];
// hardcore hearts: two little "eyes" in the humps
const HEART_FILL_HARDCORE = [
  '.........',
  '.wk...wk.',
  '.prr.prr.',
  '.rrrrrrr.',
  '.rrrrrrd.',
  '..rrrrd..',
  '...rdd...',
  '....d....',
  '.........',
];

interface HeartPal { w: number; p: number; r: number; d: number; k?: number }
const HEARTS: Record<string, HeartPal> = {
  normal: { w: 0xffffff, p: 0xff8c8c, r: 0xe31919, d: 0xa80d0d },
  poisoned: { w: 0xf0f4b0, p: 0xc8d24c, r: 0x94a414, d: 0x5f6b09 },
  withered: { w: 0x9a9a9a, p: 0x5a5a5a, r: 0x2f2f2f, d: 0x191919, k: 0x000000 },
  absorbing: { w: 0xffffff, p: 0xfff08a, r: 0xe8b41c, d: 0xa87606 },
  frozen: { w: 0xffffff, p: 0xd6f2ff, r: 0x8fcdf2, d: 0x4b8cc4 },
};

function heartContainer(outline: number, hardcore = false): TexImage {
  const t = img(9, 9);
  pat(t, 0, 0, HEART_OUTLINE, { X: outline });
  const fill = HEART_FILL;
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) if (fill[y][x] !== '.') plot(t, x, y, 0x1a1a1a, 0x9a);
  if (hardcore) {
    plot(t, 2, 1, outline);
    plot(t, 7, 1, outline);
  }
  return t;
}

function heartFill(p: HeartPal, half: boolean, blink: boolean, hardcore: boolean): TexImage {
  const t = img(9, 9);
  const rows = hardcore ? HEART_FILL_HARDCORE : HEART_FILL;
  const pal: Record<string, number> = { w: p.w, p: p.p, r: p.r, d: p.d, k: p.k ?? 0x000000 };
  if (blink) for (const k of ['p', 'r', 'd']) pal[k] = mixC(pal[k], 0xffffff, 0.55);
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const ch = rows[y][x];
      if (ch === '.' || (half && x > 4)) continue;
      plot(t, x, y, pal[ch]);
    }
  return t;
}

G['heart_container'] = () => heartContainer(BLACK);
G['heart_container_blinking'] = () => heartContainer(WHITE);
G['heart_container_hardcore'] = () => heartContainer(BLACK, true);
G['heart_container_hardcore_blinking'] = () => heartContainer(WHITE, true);
G['heart_vehicle_container'] = () => heartContainer(BLACK);
for (const [kind, p] of Object.entries(HEARTS)) {
  const base = kind === 'normal' ? 'heart' : `heart_${kind}`;
  for (const half of [false, true]) {
    const hs = half ? 'half' : 'full';
    G[`${base}_${hs}`] = () => heartFill(p, half, false, false);
    G[`${base}_${hs}_blinking`] = () => heartFill(p, half, true, false);
    const hc = kind === 'normal' ? 'heart_hardcore' : `heart_${kind}_hardcore`;
    G[`${hc}_${hs}`] = () => heartFill(p, half, false, true);
    G[`${hc}_${hs}_blinking`] = () => heartFill(p, half, true, true);
  }
}
G['heart_vehicle_full'] = () => heartFill(HEARTS.normal, false, false, false);
G['heart_vehicle_half'] = () => heartFill(HEARTS.normal, true, false, false);

// ===========================================================================
// HUD: hunger drumsticks (9x9). Hunger drains from the left, so the half
// icon keeps the right (meat) side.

const FOOD_OUTLINE = [
  '.....XXX.',
  '....X...X',
  '...X....X',
  '..X.....X',
  '..X....X.',
  '.X.X..X..',
  'X...XX...',
  'X..X.....',
  '.XX......',
];
const FOOD_FILL = [
  '.........',
  '.....hhm.',
  '....hmmm.',
  '...hmmmd.',
  '...mmmd..',
  '..b.dd...',
  '.bsb.....',
  '.sb......',
  '.........',
];
interface FoodPal { h: number; m: number; d: number; b: number; s: number }
const FOOD: FoodPal = { h: 0xeea662, m: 0xc0702e, d: 0x844418, b: 0xf2eee0, s: 0xb9b2a0 };
const FOOD_HUNGER: FoodPal = { h: 0x9bb04e, m: 0x6b8428, d: 0x445c16, b: 0xd6e2b8, s: 0x98a67e };

function foodEmpty(outline: number): TexImage {
  const t = img(9, 9);
  pat(t, 0, 0, FOOD_OUTLINE, { X: outline });
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) if (FOOD_FILL[y][x] !== '.') plot(t, x, y, 0x1a1a1a, 0x9a);
  return t;
}
function foodFill(p: FoodPal, half: boolean): TexImage {
  const t = img(9, 9);
  const pal: Record<string, number> = { h: p.h, m: p.m, d: p.d, b: p.b, s: p.s };
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const ch = FOOD_FILL[y][x];
      if (ch === '.' || (half && x < 4)) continue;
      plot(t, x, y, pal[ch]);
    }
  return t;
}
G['food_empty'] = () => foodEmpty(BLACK);
G['food_half'] = () => foodFill(FOOD, true);
G['food_full'] = () => foodFill(FOOD, false);
G['food_empty_hunger'] = () => foodEmpty(0x1c2a0a);
G['food_half_hunger'] = () => foodFill(FOOD_HUNGER, true);
G['food_full_hunger'] = () => foodFill(FOOD_HUNGER, false);

// ===========================================================================
// HUD: armor (9x9 chestplates, complete sprites - drawn alone)

const ARMOR = [
  'XXX...XXX',
  'XhhXXXhmX',
  'XhmmmmmmX',
  'XXmmmmmXX',
  '.XmmmmmX.',
  '.XmmmmmX.',
  '.XmmmmdX.',
  '.XXXXXXX.',
  '.........',
];
function armorIcon(mode: 'empty' | 'half' | 'full'): TexImage {
  const t = img(9, 9);
  const rows = ARMOR;
  const full: Record<string, Col> = { X: BLACK, h: 0xffffff, m: 0xc6c6c6, d: 0x8b8b8b };
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      if (ch === 'X') {
        plot(t, x, y, BLACK);
        continue;
      }
      const filled = mode === 'full' || (mode === 'half' && x <= 4);
      if (filled) plot(t, x, y, full[ch] as number);
      else plot(t, x, y, 0x1a1a1a, 0x9a);
    }
  return t;
}
G['armor_empty'] = () => armorIcon('empty');
G['armor_half'] = () => armorIcon('half');
G['armor_full'] = () => armorIcon('full');

// ===========================================================================
// HUD: air bubbles (9x9)

const BUBBLE = [
  '.........',
  '...XXX...',
  '..XwwiX..',
  '.XwwiiiX.',
  '.XwiiibX.',
  '.XiiibbX.',
  '..XibbX..',
  '...XXX...',
  '.........',
];
const BUBBLE_POP = [
  '.........',
  '.XX...XX.',
  '.X.....X.',
  '.........',
  '....w....',
  '.........',
  '.X.....X.',
  '.XX...XX.',
  '.........',
];
G['air'] = () => {
  const t = img(9, 9);
  pat(t, 0, 0, BUBBLE, { X: 0x2f64e0, w: 0xffffff, i: [0xa6d8ff, 0x90], b: [0x6e9ff0, 0xd8] });
  return t;
};
G['air_bursting'] = () => {
  const t = img(9, 9);
  pat(t, 0, 0, BUBBLE_POP, { X: 0x4f82ea, w: [0xffffff, 0xc0] });
  return t;
};
G['air_empty'] = () => img(9, 9);

// ===========================================================================
// Widgets

/** Subtle stone-like noise field in [-1, 1]. */
function faceNoise(seed: string, w: number, h: number): Float32Array {
  const r = R(seed);
  const n = combine([valueNoise(r, w, h, 4, 3), whiteNoise(r, w, h)], [0.45, 0.55]);
  const eq = equalize(n);
  for (let i = 0; i < eq.length; i++) eq[i] = eq[i] * 2 - 1;
  return eq;
}

interface ButtonStyle {
  outline: number;
  hi: number;
  lo: number;
  lo2?: number;
  face: number;
  noise?: number;
  seed?: string;
}

/** Button-like box: 1 px outline, light top/left bevel, 2 px dark bottom and 1 px dark right. */
function buttonBox(w: number, h: number, s: ButtonStyle): TexImage {
  const t = img(w, h);
  const n = s.noise ? faceNoise(s.seed ?? 'button', w, h) : null;
  const [fr, fg, fb] = rgbOf(s.face);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c: number;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c = s.outline;
      else if (y === h - 2) c = s.lo2 ?? s.lo;
      else if (y === h - 3 || x === w - 2) c = s.lo;
      else if (y === 1 || x === 1) c = s.hi;
      else if (n) {
        const d = Math.round(n[y * w + x] * (s.noise as number));
        c = packRGB(fr + d, fg + d, fb + d);
      } else c = s.face;
      plot(t, x, y, c);
    }
  return t;
}

const BTN: ButtonStyle = { outline: BLACK, hi: 0xa9a9a9, lo: 0x565656, lo2: 0x4a4a4a, face: 0x6f6f6f, noise: 5, seed: 'button' };
const BTN_HI: ButtonStyle = { ...BTN, outline: WHITE, hi: 0xb4b4b4, face: 0x7a7a7a, lo: 0x5e5e5e, lo2: 0x505050 };
const BTN_OFF: ButtonStyle = { outline: BLACK, hi: 0x404040, lo: 0x2a2a2a, lo2: 0x262626, face: 0x353535 };

G['button'] = () => buttonBox(200, 20, BTN);
G['button_highlighted'] = () => buttonBox(200, 20, BTN_HI);
G['button_disabled'] = () => buttonBox(200, 20, BTN_OFF);

const SLIDER: ButtonStyle = { outline: BLACK, hi: 0x303030, lo: 0x1c1c1c, lo2: 0x1a1a1a, face: 0x242424 };
G['slider'] = () => buttonBox(200, 20, SLIDER);
G['slider_highlighted'] = () => buttonBox(200, 20, { ...SLIDER, outline: WHITE });
G['slider_handle'] = () => buttonBox(8, 20, { ...BTN, noise: 0 });
G['slider_handle_highlighted'] = () => buttonBox(8, 20, { ...BTN_HI, noise: 0 });

function textField(border: number): TexImage {
  const t = img(200, 20);
  rect(t, 0, 0, 200, 20, border);
  rect(t, 1, 1, 198, 18, BLACK);
  return t;
}
G['text_field'] = () => textField(0xa0a0a0);
G['text_field_highlighted'] = () => textField(WHITE);

const CHECK = [
  '..........',
  '.........x',
  '........xx',
  '.......xx.',
  'x.....xx..',
  'xx...xx...',
  '.xx.xx....',
  '..xxx.....',
  '...x......',
];
function checkbox(selected: boolean, highlighted: boolean): TexImage {
  const t = buttonBox(20, 20, {
    outline: highlighted ? WHITE : BLACK,
    hi: highlighted ? 0xb4b4b4 : 0xa9a9a9,
    lo: highlighted ? 0x5e5e5e : 0x565656,
    lo2: highlighted ? 0x505050 : 0x4a4a4a,
    face: highlighted ? 0x7a7a7a : 0x6f6f6f,
  });
  if (selected) {
    pat(t, 5, 6, CHECK, { x: 0x2a2a2a });
    pat(t, 4, 5, CHECK, { x: WHITE });
  }
  return t;
}
G['checkbox'] = () => checkbox(false, false);
G['checkbox_selected'] = () => checkbox(true, false);
G['checkbox_highlighted'] = () => checkbox(false, true);
G['checkbox_selected_highlighted'] = () => checkbox(true, true);

function scroller(face: number, hi: number, lo: number): TexImage {
  const t = img(12, 15);
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < 12; x++) {
      const dx = Math.min(x, 11 - x), dy = Math.min(y, 14 - y);
      if (dx + dy === 0) continue;
      let c: number;
      if (dx === 0 || dy === 0) c = BLACK;
      else if ((x === 1 || y === 1) && x < 10 && y < 13) c = hi;
      else if (x === 10 || y === 13) c = lo;
      else c = face;
      plot(t, x, y, c);
    }
  return t;
}
G['scroller'] = () => scroller(PANEL, WHITE, PANEL_SHADOW);
G['scroller_disabled'] = () => scroller(0xa0a0a0, 0xc6c6c6, 0x6a6a6a);

// Slot hover highlight (1.21.2+ style): back is drawn behind the item, front
// on top of it. Both are 24x24 centred on the 16x16 item area (offset -4).
G['slot_highlight_back'] = () => {
  const t = img(24, 24);
  rect(t, 4, 4, 16, 16, WHITE, 0x80);
  return t;
};
G['slot_highlight_front'] = () => {
  const t = img(24, 24);
  for (let i = 3; i < 21; i++) {
    plot(t, i, 3, WHITE, 0x70);
    plot(t, i, 20, WHITE, 0x70);
    if (i > 3 && i < 20) {
      plot(t, 3, i, WHITE, 0x70);
      plot(t, 20, i, WHITE, 0x70);
    }
  }
  return t;
};

// ===========================================================================
// Container screens

/** Standard GUI panel: black outline with cut corners, 2 px white/dark bevel, #C6C6C6 face. */
function panel(w: number, h: number, face = PANEL, hi = WHITE, lo = PANEL_SHADOW): TexImage {
  const t = img(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const left = x <= w - 1 - x, top = y <= h - 1 - y;
      const dx = left ? x : w - 1 - x, dy = top ? y : h - 1 - y;
      if (dx + dy < 2) continue;
      if (dx === 0 || dy === 0 || dx + dy === 2) {
        plot(t, x, y, BLACK);
        continue;
      }
      const inH = dy <= 2, inV = dx <= 2;
      let c = face;
      if (inH && inV) {
        if (top && left) c = hi;
        else if (!top && !left) c = lo;
        else if (dy < dx) c = top ? hi : lo;
        else if (dx < dy) c = left ? hi : lo;
      } else if (inH) c = top ? hi : lo;
      else if (inV) c = left ? hi : lo;
      plot(t, x, y, c);
    }
  return t;
}

/** Inset box: dark top/left edge, white bottom/right edge (vanilla slot look). */
function inset(t: TexImage, x: number, y: number, w: number, h: number, inner = SLOT): void {
  rect(t, x, y, w, h, inner);
  for (let i = 0; i < w - 1; i++) plot(t, x + i, y, SLOT_SHADOW);
  for (let j = 0; j < h - 1; j++) plot(t, x, y + j, SLOT_SHADOW);
  for (let i = 1; i < w; i++) plot(t, x + i, y + h - 1, WHITE);
  for (let j = 1; j < h; j++) plot(t, x + w - 1, y + j, WHITE);
}
/** 18x18 slot for an item drawn at (ix, iy). */
function slotAt(t: TexImage, ix: number, iy: number): void {
  inset(t, ix - 1, iy - 1, 18, 18);
}
/** 26x26 result slot for an item drawn at (ix, iy). */
function bigSlotAt(t: TexImage, ix: number, iy: number): void {
  inset(t, ix - 5, iy - 5, 26, 26);
}
/** Player inventory: 3 rows starting at item y = top, hotbar at top + 58. */
function playerInventory(t: TexImage, top: number, left = 8): void {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) slotAt(t, left + 18 * c, top + 18 * r);
  for (let c = 0; c < 9; c++) slotAt(t, left + 18 * c, top + 58);
}

/** Right-pointing arrow: shaft of `shaft` rows, triangular head `h` tall. */
function arrowMask(len: number, h: number, shaft: number): boolean[][] {
  const head = (h + 1) >> 1;
  const mid = (h - 1) / 2;
  const m: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < len; x++) {
      const k = x - (len - head);
      if (k < 0) row.push(Math.abs(y - mid) <= (shaft - 1) / 2);
      else row.push(Math.abs(y - mid) <= mid - k);
    }
    m.push(row);
  }
  return m;
}
function drawMask(t: TexImage, x0: number, y0: number, m: boolean[][], c: number): void {
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++) if (m[y][x]) plot(t, x0 + x, y0 + y, c);
}

// Furnace flame (14x14 sprite, flame in rows 0-12 so vanilla-style bottom-up
// cropping never exposes an empty row) and progress arrow (24x16 sprite).
const FLAME = [
  '......#.......',
  '......##......',
  '.....###......',
  '.....####..#..',
  '....#####.##..',
  '...##########.',
  '..###########.',
  '.############.',
  '.############.',
  '##############',
  '##############',
  '.############.',
  '..##########..',
  '..............',
];
const FLAME_COLORS = [0xc63a00, 0xff7d00, 0xffc000, 0xfff17a];
function flameMask(): boolean[][] {
  return FLAME.map((r) => [...r].map((c) => c === '#'));
}
const BURN_ARROW = () => arrowMask(22, 15, 7);

G['furnace_lit_progress'] = () => {
  const t = img(14, 14);
  const m = flameMask();
  const inside = (x: number, y: number) => y >= 0 && y < 14 && x >= 0 && x < 14 && m[y][x];
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++) {
      if (!m[y][x]) continue;
      // depth = distance to the flame's edge (4-neighbourhood, up to 3)
      let d = 0;
      for (let k = 1; k <= 3; k++) {
        if (inside(x - k, y) && inside(x + k, y) && inside(x, y - k) && inside(x, y + k)) d = k;
        else break;
      }
      if (y >= 10 && d < 3) d++; // hotter base
      plot(t, x, y, FLAME_COLORS[Math.min(d, 3)]);
    }
  return t;
};
G['furnace_burn_progress'] = () => {
  const t = img(24, 16);
  const m = BURN_ARROW();
  drawMask(t, 1, 1, m, WHITE);
  // light gray lower edge like vanilla's shading
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < 22; x++) if (m[y][x] && (y + 1 >= 15 || !m[y + 1][x])) plot(t, 1 + x, 1 + y, 0xd4d4d4);
  return t;
};

G['container_inventory'] = () => {
  const t = panel(176, 166);
  for (let i = 0; i < 4; i++) slotAt(t, 8, 8 + 18 * i); // armor
  inset(t, 25, 7, 51, 72, BLACK); // player preview (black 49x70 at 26,8)
  slotAt(t, 77, 62); // offhand
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) slotAt(t, 98 + 18 * c, 18 + 18 * r);
  drawMask(t, 135, 29, arrowMask(16, 13, 5), SLOT);
  slotAt(t, 154, 28); // crafting result (regular size in the 2x2 grid)
  playerInventory(t, 84);
  return t;
};

G['container_crafting_table'] = () => {
  const t = panel(176, 166);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) slotAt(t, 30 + 18 * c, 17 + 18 * r);
  drawMask(t, 90, 35, arrowMask(22, 15, 7), SLOT);
  bigSlotAt(t, 124, 35);
  playerInventory(t, 84);
  return t;
};

G['container_furnace'] = () => {
  const t = panel(176, 166);
  slotAt(t, 56, 17); // input
  slotAt(t, 56, 53); // fuel
  bigSlotAt(t, 116, 35); // result
  drawMask(t, 57, 37, flameMask(), SLOT); // empty flame (lit sprite drawn at 57,37)
  drawMask(t, 80, 35, BURN_ARROW(), SLOT); // empty arrow (progress sprite drawn at 79,34)
  playerInventory(t, 84);
  return t;
};

G['container_generic_54'] = () => {
  const t = panel(176, 222);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) slotAt(t, 8 + 18 * c, 18 + 18 * r);
  playerInventory(t, 140);
  return t;
};

// Standalone slot frames for engine-built screens.
G['slot'] = () => {
  const t = img(18, 18);
  inset(t, 0, 0, 18, 18);
  return t;
};
G['slot_large'] = () => {
  const t = img(26, 26);
  inset(t, 0, 0, 26, 26);
  return t;
};

// Empty equipment-slot silhouettes (16x16, drawn in the item layer of empty
// armor/offhand slots). Debossed look: darker top-left edge, lighter bottom-right.
const SLOT_ICONS: Record<string, string[]> = {
  helmet: [
    '................',
    '................',
    '................',
    '.....######.....',
    '....########....',
    '...##########...',
    '...##########...',
    '...###....###...',
    '...##......##...',
    '...##......##...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  chestplate: [
    '................',
    '................',
    '..####....####..',
    '..#####..#####..',
    '..############..',
    '..############..',
    '...##########...',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '................',
    '................',
    '................',
  ],
  leggings: [
    '................',
    '................',
    '...##########...',
    '...##########...',
    '...##########...',
    '...####..####...',
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '................',
    '................',
    '................',
  ],
  boots: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '..####...####...',
    '.#####..#####...',
    '.#####..#####...',
    '................',
    '................',
    '................',
    '................',
  ],
  shield: [
    '................',
    '................',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '....########....',
    '.....######.....',
    '......####......',
    '.......##.......',
    '................',
    '................',
    '................',
  ],
};
for (const [name, rows] of Object.entries(SLOT_ICONS))
  G[`slot_${name}`] = () => {
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
// Creative inventory

G['creative_tab_items'] = () => {
  const t = panel(195, 136);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) slotAt(t, 9 + 18 * c, 18 + 18 * r);
  for (let c = 0; c < 9; c++) slotAt(t, 9 + 18 * c, 112);
  inset(t, 174, 17, 14, 114); // scrollbar track: 12x112 at (175,18)
  return t;
};

G['creative_tab_item_search'] = () => {
  const t = GUI_TEXTURES['creative_tab_items']();
  inset(t, 80, 4, 90, 12, BLACK); // search field (text at 82,6)
  return t;
};

G['creative_tab_inventory'] = () => {
  const t = panel(195, 136);
  for (let j = 0; j < 4; j++) slotAt(t, 54 + 54 * (j >> 1), 6 + 27 * (j & 1)); // armor 2x2
  slotAt(t, 35, 20); // offhand
  inset(t, 72, 5, 34, 45, BLACK); // player preview (73,6)-(105,49)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) slotAt(t, 9 + 18 * c, 54 + 18 * r);
  for (let c = 0; c < 9; c++) slotAt(t, 9 + 18 * c, 112);
  slotAt(t, 173, 112); // destroy item slot
  return t;
};

// Creative tabs, 26x32. Top tabs are drawn at (x, panelY - 28), bottom tabs at
// (x, panelY + panelH - 4): the 4 px that overlap the panel either merge into
// it (selected, drawn after the panel) or hide behind it (unselected, drawn
// before). Index 1 sits on the panel's left edge, index 7 on its right edge.
const TAB_UNSEL = { face: 0xb0b0b0, hi: 0xe4e4e4, lo: 0x4c4c4c };

function creativeTab(top: boolean, selected: boolean, idx: number): TexImage {
  const W = 26, H = 32;
  const t = img(W, H);
  const face = selected ? PANEL : TAB_UNSEL.face;
  const hi = selected ? WHITE : TAB_UNSEL.hi;
  const lo = selected ? PANEL_SHADOW : TAB_UNSEL.lo;
  // Draw in "top" orientation (free edge at y = 0); bottom tabs are flipped
  // afterwards, so their free edge (the bottom) uses the dark bevel colour.
  const edgeC = top ? hi : lo;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const left = x <= W - 1 - x;
      const dx = left ? x : W - 1 - x, dy = y;
      if (dx + dy < 2) continue;
      let c: number;
      if (dx === 0 || dy === 0 || dx + dy === 2) c = BLACK;
      else if (dy <= 2 && dx <= 2) {
        const sideC = left ? hi : lo;
        if (edgeC === sideC) c = edgeC;
        else if (dy < dx) c = edgeC;
        else if (dx < dy) c = sideC;
        else c = face;
      } else if (dy <= 2) c = edgeC;
      else if (dx <= 2) c = left ? hi : lo;
      else c = face;
      plot(t, x, y, c);
    }
  const o = top ? t : flipV(t);
  // attached rows (overlapping the panel), in final orientation
  const rows = top ? [28, 29, 30, 31] : [3, 2, 1, 0]; // panel outline, bevel, bevel, face
  const panelBevel = top ? WHITE : PANEL_SHADOW;
  if (selected) {
    for (let k = 0; k < 4; k++) {
      const y = rows[k];
      for (let x = 0; x < W; x++) {
        let c: number;
        const leftEdge = idx === 1 && x === 0, rightEdge = idx === 7 && x === W - 1;
        if (leftEdge || rightEdge) c = BLACK;
        else if (idx === 1 && x <= 2) c = WHITE;
        else if (idx === 7 && x >= W - 3) c = PANEL_SHADOW;
        else if (x === 0 || x === W - 1) c = k === 0 ? BLACK : k < 3 ? panelBevel : PANEL;
        else if (x <= 2) c = k < 3 ? WHITE : PANEL;
        else if (x >= W - 3) c = k < 3 ? PANEL_SHADOW : PANEL;
        else c = PANEL;
        plot(o, x, y, c);
      }
    }
  } else {
    // pixels that show through the panel's cut corners
    if (idx === 1) {
      plot(o, 0, rows[0], BLACK);
      plot(o, 1, rows[0], BLACK);
      plot(o, 0, rows[1], BLACK);
    }
    if (idx === 7) {
      plot(o, W - 1, rows[0], BLACK);
      plot(o, W - 2, rows[0], BLACK);
      plot(o, W - 1, rows[1], BLACK);
    }
  }
  return o;
}
for (let i = 1; i <= 7; i++) {
  G[`creative_tab_top_selected_${i}`] = () => creativeTab(true, true, i);
  G[`creative_tab_top_unselected_${i}`] = () => creativeTab(true, false, i);
  G[`creative_tab_bottom_selected_${i}`] = () => creativeTab(false, true, i);
  G[`creative_tab_bottom_unselected_${i}`] = () => creativeTab(false, false, i);
}

// ===========================================================================
// Menu backgrounds (1.20.5+ translucent tiles) and the classic dirt tile

function darkTile(seed: string, lo: number, hi: number, alpha: number): TexImage {
  const t = img(16, 16);
  const r = R(seed);
  const n = equalize(combine([valueNoise(r, 16, 16, 4), valueNoise(r, 16, 16, 2), whiteNoise(r, 16, 16)], [0.35, 0.3, 0.35]));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const v = n[y * 16 + x];
      const q = Math.floor(v * 4) / 3; // 4 levels, pixel-art look
      plot(t, x, y, gray(lo + (hi - lo) * q), alpha);
    }
  return t;
}
G['menu_background'] = () => darkTile('menu_bg', 0x14, 0x2c, 0x9c);
G['inworld_menu_background'] = () => darkTile('inworld_bg', 0x14, 0x2c, 0x80);
G['menu_list_background'] = () => darkTile('menu_list', 0x0c, 0x20, 0xb8);
G['inworld_menu_list_background'] = () => darkTile('inworld_list', 0x0c, 0x20, 0x9c);

function separator(topLight: boolean, lightA: number, darkA: number): TexImage {
  const t = img(32, 2);
  for (let x = 0; x < 32; x++) {
    plot(t, x, topLight ? 0 : 1, WHITE, lightA);
    plot(t, x, topLight ? 1 : 0, BLACK, darkA);
  }
  return t;
}
G['header_separator'] = () => separator(true, 0x40, 0xbf);
G['footer_separator'] = () => separator(false, 0x40, 0xbf);
G['inworld_header_separator'] = () => separator(true, 0x30, 0x9f);
G['inworld_footer_separator'] = () => separator(false, 0x30, 0x9f);

G['options_background'] = () => {
  const gen = BLOCK_TEXTURES['dirt'];
  let dirt: TexImage | null = null;
  if (gen) {
    const d = gen();
    if ('data' in d) dirt = d;
  }
  const t = img(16, 16);
  if (!dirt) {
    const r = R('dirt');
    const n = equalize(combine([valueNoise(r, 16, 16, 4), whiteNoise(r, 16, 16)], [0.5, 0.5]));
    const pal = [0x5b3f29, 0x6b4a31, 0x795638, 0x866043, 0x936c4c, 0x9f7856];
    for (let i = 0; i < 256; i++) plot(t, i & 15, i >> 4, pal[Math.min(5, Math.floor(n[i] * 6))]);
  } else for (let i = 0; i < 256; i++) plot(t, i & 15, i >> 4, getPx(dirt, i & 15, i >> 4));
  for (let i = 0; i < 256; i++) plot(t, i & 15, i >> 4, mulC(getPx(t, i & 15, i >> 4), 0.25));
  return t;
};

// ===========================================================================
// Vignette (grayscale, multiplied over the scene)

G['vignette'] = () => {
  const S = 256;
  const t = img(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
      const d2 = dx * dx + dy * dy; // 0 centre, 1 edge middles, 2 corners
      const v = 1 - 0.42 * Math.pow(d2, 1.35) / Math.pow(2, 0.35);
      plot(t, x, y, gray(Math.max(0.3, Math.min(1, v)) * 255));
    }
  return t;
};

// ===========================================================================
// Title logo: blocky stone letters with a dark extruded side and black outline

type LRect = [number, number, number, number];
interface LogoGlyph {
  w: number;
  rects: LRect[];
  /** rounded corners: [x, y, corner ('tl'|'tr'|'bl'|'br'), size] in glyph coords */
  round?: [number, number, string, number][];
}
// Letters are 34 px tall with 8 px stems and 7 px bars; diagonals are
// stair-steps whose pieces overlap so the outline never splits them.
const LOGO: Record<string, LogoGlyph> = {
  M: { w: 36, rects: [[0, 0, 8, 34], [28, 0, 8, 34], [8, 0, 4, 10], [12, 4, 4, 10], [16, 8, 4, 10], [20, 4, 4, 10], [24, 0, 4, 10]] },
  I: { w: 9, rects: [[0, 0, 9, 34]] },
  N: { w: 30, rects: [[0, 0, 8, 34], [22, 0, 8, 34], [8, 0, 4, 13], [12, 7, 3, 13], [15, 14, 3, 13], [18, 21, 4, 13]] },
  E: { w: 26, rects: [[0, 0, 8, 34], [8, 0, 18, 7], [8, 14, 14, 7], [8, 27, 18, 7]] },
  C: { w: 26, rects: [[0, 0, 8, 34], [8, 0, 18, 7], [8, 27, 18, 7]], round: [[0, 0, 'tl', 4], [0, 33, 'bl', 4]] },
  R: { w: 28, rects: [[0, 0, 8, 34], [8, 0, 20, 7], [20, 0, 8, 14], [8, 13, 13, 7], [20, 19, 8, 15]], round: [[27, 0, 'tr', 4], [27, 13, 'br', 3]] },
  A: { w: 28, rects: [[0, 0, 28, 7], [0, 0, 8, 34], [20, 0, 8, 34], [8, 15, 12, 7]], round: [[0, 0, 'tl', 4], [27, 0, 'tr', 4]] },
  F: { w: 26, rects: [[0, 0, 8, 34], [8, 0, 18, 7], [8, 14, 13, 7]] },
  T: { w: 30, rects: [[0, 0, 30, 7], [11, 7, 8, 27]] },
};

G['title_logo'] = () => {
  const W = 274, H = 44;
  const word = 'MINECRAFT';
  const gap = 4, depth = 5, top = 2;
  const total = [...word].reduce((a, ch) => a + LOGO[ch].w, 0) + gap * (word.length - 1);
  let x0 = Math.max(1, Math.floor((W - total - 3) / 2));
  const face = new Uint8Array(W * H);
  for (const ch of word) {
    const L = LOGO[ch];
    for (const [rx, ry, rw, rh] of L.rects)
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) face[(top + y) * W + x0 + x] = 1;
    for (const [cx, cy, corner, size] of L.round ?? [])
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size - dy; dx++) {
          const x = corner[1] === 'l' ? cx + dx : cx - dx;
          const y = corner[0] === 't' ? cy + dy : cy - dy;
          if (dx + dy < size - 1) face[(top + y) * W + x0 + x] = 0;
        }
    x0 += L.w + gap;
  }
  // extrusion toward bottom-right; side[i] = smallest depth step reaching it
  const side = new Uint8Array(W * H);
  for (let k = depth; k >= 1; k--) {
    const ox = Math.floor(k / 3), oy = k;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (face[y * W + x]) {
          const nx = x + ox, ny = y + oy;
          if (nx < W && ny < H && !face[ny * W + nx]) side[ny * W + nx] = k;
        }
  }
  const t = img(W, H);
  const r = R('logo');
  const fn = equalize(combine([valueNoise(r, W, H, 6, 4), valueNoise(r, W, H, 3, 2), whiteNoise(r, W, H)], [0.3, 0.35, 0.35]));
  const sn = equalize(combine([valueNoise(r, W, H, 4, 3), whiteNoise(r, W, H)], [0.4, 0.6]));
  const FACE = [0x7c7c7c, 0x8e8e8e, 0x9e9e9e, 0xadadad, 0xbababa, 0xc9c9c9];
  const FW = [1, 2, 4, 5, 4, 2];
  const pick = (v: number, pal: number[], w: number[]) => {
    const tot = w.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let i = 0; i < pal.length; i++) {
      acc += w[i] / tot;
      if (v <= acc) return pal[i];
    }
    return pal[pal.length - 1];
  };
  const isF = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && face[y * W + x] === 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (face[i]) {
        // 2x2-blocky base noise plus a little per-pixel grain
        const bi = (y & ~1) * W + (x & ~1);
        let c = pick(fn[bi] * 0.75 + fn[i] * 0.25, FACE, FW);
        if (!isF(x, y - 1) || !isF(x - 1, y)) c = mixC(c, 0xffffff, 0.45);
        else if (!isF(x, y - 2) || !isF(x - 2, y)) c = mixC(c, 0xffffff, 0.18);
        if (!isF(x + 1, y) || !isF(x, y + 1)) c = mixC(c, 0x000000, 0.18);
        plot(t, x, y, c);
      } else if (side[i]) {
        const k = side[i];
        const base = pick(sn[i], [0x3a3a3a, 0x444444, 0x4e4e4e, 0x585858], [1, 3, 3, 1]);
        plot(t, x, y, mixC(base, 0x000000, (k - 1) * 0.06));
      }
    }
  // black outline around everything
  const solid = (x: number, y: number) => getA(t, x, y) > 0 && !(x < 0 || y < 0 || x >= W || y >= H);
  const out: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && solid(x + dx, y + dy)) near = true;
      if (near) out.push(x, y);
    }
  for (let i = 0; i < out.length; i += 2) plot(t, out[i], out[i + 1], BLACK);
  return t;
};

// ===========================================================================
// "JAVA EDITION" badge (128x14): the font drawn 2x wide and ~1.5x tall
// (rows alternate 2/1 px), light-gray gradient face with a dark outline.

G['title_edition'] = () => {
  const W = 128, H = 14;
  const text = 'JAVA EDITION';
  const rowH = [2, 1, 2, 1, 2, 1, 2]; // glyph rows 0-6 -> 11 px
  const colW = 2;
  const glyph = (ch: string) => FONT.glyphs[ch] ?? FONT.glyphs['?'];
  const spacing = 1;
  let width = 0;
  for (const ch of text) width += glyph(ch)[0].length * colW + spacing;
  width -= spacing;
  const mask = new Uint8Array(W * H);
  const oy = 1;
  let x = Math.floor((W - width) / 2);
  for (const ch of text) {
    const g = glyph(ch);
    let y = oy;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < g[0].length; c++)
        if (g[r][c] === '#') for (let yy = y; yy < y + rowH[r]; yy++) for (let xx = x + c * colW; xx < x + (c + 1) * colW; xx++) if (xx >= 0 && xx < W) mask[yy * W + xx] = 1;
      y += rowH[r];
    }
    x += g[0].length * colW + spacing;
  }
  const t = img(W, H);
  const faceH = rowH.reduce((a, b) => a + b, 0);
  for (let y = 0; y < H; y++)
    for (let x2 = 0; x2 < W; x2++) {
      if (!mask[y * W + x2]) continue;
      const f = (y - oy) / (faceH - 1);
      plot(t, x2, y, mixC(0xffffff, 0xa8a8a8, f));
    }
  // outline (8-neighbourhood) in dark gray, plus a darker drop shadow
  const m2 = (x2: number, y: number) => x2 >= 0 && y >= 0 && x2 < W && y < H && mask[y * W + x2] === 1;
  for (let y = 0; y < H; y++)
    for (let x2 = 0; x2 < W; x2++) {
      if (m2(x2, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && m2(x2 + dx, y + dy)) near = true;
      if (near) plot(t, x2, y, m2(x2 - 1, y - 1) && !m2(x2 + 1, y + 1) ? 0x1c1c1c : 0x2e2e2e);
    }
  return t;
};

// ===========================================================================
// Create World tab bar (TabNavigationBar), 130x24. Nine-slice border 2 on
// every side (the unselected tab's bottom edge lives in the bottom 2 rows).
// Selected tabs are lighter and open at the bottom so they merge into the
// content below; unselected tabs are darker boxes closed by a bottom edge.

function tabButton(selected: boolean, highlighted: boolean): TexImage {
  const W = 130, H = 24;
  const t = img(W, H);
  const line = highlighted ? WHITE : selected ? 0xc6c6c6 : 0x6f6f6f;
  const fill: [number, number] = selected ? [0xffffff, 0x1c] : [0x000000, 0x70];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if ((x === 0 || x === W - 1) && y === 0) continue; // rounded top corners
      const bottomOuter = !selected && y === H - 1, bottomInner = !selected && y === H - 2;
      if (y === 0 || x === 0 || x === W - 1 || bottomOuter) plot(t, x, y, BLACK);
      else if (y === 1 || x === 1 || x === W - 2 || bottomInner) plot(t, x, y, line);
      else plot(t, x, y, fill[0], fill[1]);
    }
  return t;
}
G['tab'] = () => tabButton(false, false);
G['tab_selected'] = () => tabButton(true, false);
G['tab_highlighted'] = () => tabButton(false, true);
G['tab_selected_highlighted'] = () => tabButton(true, true);

// ===========================================================================
// Title-screen button icons (15x15, drawn centred on a 20x20 button)

const ICON_LANGUAGE = [
  '.....#####.....',
  '...##..#..##...',
  '..#...#.#...#..',
  '.#...#...#...#.',
  '.#..#.....#..#.',
  '#...#.....#...#',
  '#...#.....#...#',
  '###############',
  '#...#.....#...#',
  '#...#.....#...#',
  '.#..#.....#..#.',
  '.#...#...#...#.',
  '..#...#.#...#..',
  '...##..#..##...',
  '.....#####.....',
];
const ICON_ACCESSIBILITY = [
  '......###......',
  '......###......',
  '......###......',
  '...............',
  '.#############.',
  '.#############.',
  '......###......',
  '......###......',
  '......###......',
  '.....##.##.....',
  '.....##.##.....',
  '....##...##....',
  '....##...##....',
  '...##.....##...',
  '...............',
];
G['icon_language'] = () => {
  const t = img(15, 15);
  pat(t, 0, 0, ICON_LANGUAGE, { '#': WHITE });
  return t;
};
G['icon_accessibility'] = () => {
  const t = img(15, 15);
  pat(t, 0, 0, ICON_ACCESSIBILITY, { '#': WHITE });
  return t;
};

// ===========================================================================
// Select World list: default world icon (64x64) and the hover "play" overlay

G['world_icon_unknown'] = () => {
  // a 16x16 stone-like face scaled 4x (blocky like an item/block texture)
  const r = R('world_icon');
  const n = equalize(combine([valueNoise(r, 16, 16, 8), valueNoise(r, 16, 16, 4), whiteNoise(r, 16, 16)], [0.3, 0.3, 0.4]));
  const pal = [0x5c5c5c, 0x6a6a6a, 0x777777, 0x838383, 0x8f8f8f, 0x9c9c9c];
  const wts = [1, 3, 5, 5, 3, 1];
  const tot = wts.reduce((a, b) => a + b, 0);
  const t = img(64, 64);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let acc = 0, k = 0;
      for (; k < pal.length - 1; k++) {
        acc += wts[k] / tot;
        if (n[y * 16 + x] <= acc) break;
      }
      rect(t, x * 4, y * 4, 4, 4, pal[k]);
    }
  // a few dark crack runs, like a stone face
  for (let i = 0; i < 5; i++) {
    let x = r.nextInt(16), y = r.nextInt(16);
    const len = 2 + r.nextInt(3);
    for (let s = 0; s < len; s++) {
      rect(t, (x & 15) * 4, (y & 15) * 4, 4, 4, 0x505050);
      if (r.nextBool()) x++;
      else y++;
    }
  }
  return t;
};

function joinArrow(fillC: number): TexImage {
  const t = img(32, 32);
  // right-pointing triangle, vertices (9.5,4) (9.5,28) (24,16), 1 px dark rim
  const inside = (px: number, py: number) => {
    const x = px + 0.5, y = py + 0.5;
    if (x < 9.5) return false;
    const half = 12 * (1 - (x - 9.5) / 14.5);
    return Math.abs(y - 16) <= half;
  };
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      if (inside(x, y)) {
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        plot(t, x, y, edge ? mixC(fillC, BLACK, 0.18) : fillC);
      } else if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) plot(t, x, y, BLACK, 0x90);
    }
  return t;
}
G['join'] = () => joinArrow(0xc6c6c6);
G['join_highlighted'] = () => joinArrow(WHITE);

// ===========================================================================
// 1.20.5+ selection-list scrollbar (6x32, nine-slice border 1)

G['list_scroller_background'] = () => {
  const t = img(6, 32);
  rect(t, 0, 0, 6, 32, BLACK, 0xa0);
  return t;
};
G['list_scroller'] = () => {
  const t = img(6, 32);
  rect(t, 0, 0, 6, 32, 0x808080);
  rect(t, 0, 0, 5, 31, 0xc0c0c0);
  return t;
};

// ===========================================================================
// Recipe book button (20x18): a green book with cream pages

const RECIPE_BOOK = [
  '....................',
  '..###############...',
  '.#hhhhhhhhhhhhhhs#..',
  '.#hgggggggggggggs#p.',
  '.#hggLLLLLLLLggds#p.',
  '.#hggLlllllllLgds#p.',
  '.#hggLlllllllLgds#p.',
  '.#hggLLLLLLLLggds#p.',
  '.#hgggggggggggggs#p.',
  '.#hgggggggggggggs#p.',
  '.#hgggggggggggggs#p.',
  '.#hgggggggggggggs#p.',
  '.#hgggggggggggggs#p.',
  '.#hgggggggggggddsXp.',
  '.#ssssssssssssssXpp.',
  '..#XXXXXXXXXXXXXpp..',
  '...pppppppppppppp...',
  '....................',
];
function recipeBook(highlighted: boolean): TexImage {
  const t = img(20, 18);
  const pal: Record<string, number> = {
    '#': 0x14330c, X: 0x0e240a, h: 0x7fd35a, g: 0x46a132, d: 0x347c24, s: 0x28611b,
    L: 0x2c6a1f, l: 0xd8f0c4, p: 0xe8e0c6,
  };
  for (let y = 0; y < 18; y++)
    for (let x = 0; x < 20; x++) {
      const ch = RECIPE_BOOK[y][x];
      if (ch === '.') continue;
      let c = pal[ch];
      if (highlighted && ch !== '#' && ch !== 'X') c = mixC(c, WHITE, 0.3);
      plot(t, x, y, c);
    }
  return t;
}
G['recipe_book_button'] = () => recipeBook(false);
G['recipe_book_button_highlighted'] = () => recipeBook(true);
