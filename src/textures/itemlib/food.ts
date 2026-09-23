// Food items.

import { TexImage, plot, getA, getPx } from '../tex';
import { Gen, Pal, spr, over, autoShade, maskFn, inEllipse, rng, paint, outline4 } from './common';

export const FOOD_ITEMS: Record<string, Gen> = {};
const F = FOOD_ITEMS;

// ---------------------------------------------------------------------------
// Apples

// prettier-ignore
const APPLE_MASK = [
  '................',
  '................',
  '................',
  '....XXX..XXX....',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '....XXXXXXXX....',
  '................',
  '................',
];

// prettier-ignore
const APPLE_TOP = [
  '........#.qq....',
  '.......#s#lgq...',
  '.......#sqgq....',
  '.......#s#......',
];

export function apple(ramp: number[], o: number, hi: number, stem: Pal): TexImage {
  const t = autoShade(APPLE_MASK, ramp, o, { seed: 'apple', edge: 1.1, relief: 4 });
  over(t, APPLE_TOP, stem);
  // specular highlight
  plot(t, 4, 5, hi);
  plot(t, 5, 5, hi);
  plot(t, 4, 6, hi);
  return t;
}

F['apple'] = () =>
  apple([0x5e0b0b, 0x870f0f, 0xab1414, 0xcf1f1f, 0xe8403a, 0xff7a70], 0x3a0606, 0xffd0c8, {
    '#': 0x2b1a08, s: 0x6b4a22, q: 0x1d3b0c, g: 0x3f7d20, l: 0x6cb63a,
  });
F['golden_apple'] = () =>
  apple([0x8a5a09, 0xb57f10, 0xdba81e, 0xf5d235, 0xfdeb5c, 0xfff9b0], 0x5a3905, 0xffffff, {
    '#': 0x4a2f04, s: 0x9c6d10, q: 0x4a2f04, g: 0xc99a1a, l: 0xf5d235,
  });

// ---------------------------------------------------------------------------
// Bread

F['bread'] = () => {
  const inside = inEllipse(8, 8.5, 7.4, 3.6, 35);
  const t = autoShade(maskFn(inside), [0x5a3310, 0x7a4816, 0x9c6220, 0xba7f2e, 0xd59c43, 0xe8bc6a], 0x3b200a, {
    seed: 'bread', edge: 1.2, relief: 3, bias: 0.05,
  });
  // three score marks across the top of the loaf
  const a = (35 * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  paint(t, (x, y, c) => {
    if (c === 0x3b200a) return;
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8.5;
    const u = dx * ca - dy * sa; // along loaf
    const v = dx * sa + dy * ca; // across (negative = top side)
    if (v > 0.6) return;
    for (const k of [-3.2, 0, 3.2]) {
      if (Math.abs(u - k) < 0.55) return 0xf0d08f;
      if (u - k > 0.55 && u - k < 1.45) return 0x8a5419;
    }
  });
  return t;
};

// ---------------------------------------------------------------------------
// Carrot

export function carrotSprite(ramp: number[], o: number, ridge: number, leaf: Pal): TexImage {
  // cone from tip (2,14) to crown (11,5)
  const body = maskFn((x, y) => {
    const ax = 11.2, ay = 4.8, bx = 2, by = 14;
    const lx = bx - ax, ly = by - ay, len = Math.hypot(lx, ly);
    const t = ((x - ax) * lx + (y - ay) * ly) / (len * len);
    if (t < -0.05 || t > 1) return false;
    const px = ax + lx * t, py = ay + ly * t;
    const d = Math.hypot(x - px, y - py);
    const r = 2.9 * (1 - t) + 0.35 + (t < 0.08 ? -((0.08 - t) * 12) : 0);
    return d <= r;
  });
  const t = autoShade(body, ramp, o, { seed: 'carrot', edge: 1.3, relief: 3 });
  // ridges
  for (const [x, y] of [[4, 11], [7, 9], [5, 12], [9, 7], [8, 10]] as [number, number][])
    if (getA(t, x, y) && getPx(t, x, y) !== o) plot(t, x, y, ridge);
  // leafy top
  over(t, [
    '..........q.q...',
    '.........qgqlq.q',
    '..........qglgql',
    '...........qggq.',
    '..........q.qq..',
  ], leaf);
  return t;
}
F['carrot'] = () =>
  carrotSprite([0x7a3a05, 0xa9520a, 0xd06f0f, 0xef8a1a, 0xfba93a, 0xffc970], 0x4a2203, 0xa9520a, { q: 0x163d0d, g: 0x2f7d1b, l: 0x5fb535 });

// ---------------------------------------------------------------------------
// Potatoes

export function potato(ramp: number[], o: number, eye: number, seed: string): TexImage {
  const t = autoShade(maskFn(inEllipse(8, 8.5, 6.4, 4.6, 25)), ramp, o, { seed, edge: 1.2, relief: 3, cluster: 0.18, cell: 4 });
  for (const [x, y] of [[5, 7], [9, 5], [10, 10], [6, 11], [12, 7]] as [number, number][])
    if (getA(t, x, y) && getPx(t, x, y) !== o) plot(t, x, y, eye);
  return t;
}
F['potato'] = () => potato([0x7a5a22, 0x9c7a33, 0xba9643, 0xcfae57, 0xe0c46f, 0xeed98f], 0x4d3814, 0x8a6a2a, 'potato');
F['baked_potato'] = () => {
  const t = potato([0x6b3f12, 0x8c5418, 0xad6e22, 0xc98a31, 0xdfa84a, 0xf0c46b], 0x42240a, 0x7a4814, 'baked_potato');
  // split skin showing fluffy inside
  over(t, ['......yyw.......', '.....yyww.......', '....yyw.........'], { y: 0xf2d47a, w: 0xfff0b8 }, 0, 6);
  return t;
};

// ---------------------------------------------------------------------------
// Cookie

F['cookie'] = () => {
  const t = autoShade(maskFn(inEllipse(8, 8, 6.2, 6.2)), [0x7a4a1f, 0x9a6027, 0xb87a33, 0xcf9443, 0xe0ac5a], 0x4a2a10, {
    seed: 'cookie', edge: 1, relief: 3, cluster: 0.15,
  });
  over(t, [
    '................',
    '................',
    '................',
    '.........c......',
    '.....cC.........',
    '............c...',
    '........Cc......',
    '...c............',
    '...C.......cC...',
    '......c.........',
    '.......C...c....',
    '....cC..........',
    '.........cC.....',
  ], { c: 0x3b1f0c, C: 0x5a3418 });
  return t;
};

// ---------------------------------------------------------------------------
// Melon slice

export function melonSprite(rind: [number, number, number, number], flesh: [number, number, number], seedC: number): TexImage {
  const cx = 5.5, cy = 5.5;
  const t = maskFn((x, y) => Math.hypot(x - cx, y - cy) <= 9.2 && x - cx + (y - cy) >= -0.2);
  const img = autoShade(t, [0xff0000], null);
  paint(img, (x, y) => {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > 8.2) return rind[0];
    if (d > 7.2) return rind[1];
    if (d > 6.4) return rind[2];
    const lit = x + y < 12 ? 1 : 0;
    return lit ? flesh[1] : flesh[0];
  });
  outline4(img, rind[3]);
  // flat cut edge gets a lighter flesh line
  paint(img, (x, y, c) => (c !== rind[3] && x + y <= 11 && c !== rind[0] && c !== rind[1] && c !== rind[2] ? flesh[2] : undefined));
  for (const [x, y] of [[6, 7], [9, 6], [5, 10], [8, 9], [11, 8], [7, 12]] as [number, number][]) plot(img, x, y, seedC);
  return img;
}
F['melon_slice'] = () => melonSprite([0x2f6a12, 0x5da22a, 0xc8e08c, 0x1f3d0c], [0xd63d33, 0xf05545, 0xff7a66], 0x1a0f0f);

// ---------------------------------------------------------------------------
// Sweet berries

// prettier-ignore
const BERRIES = [
  '................',
  '..........q.....',
  '.........qgq.q..',
  '........qgglgq..',
  '....###.#qgqq...',
  '...#554#.#q###..',
  '..#54432#.#554#.',
  '..#44322##54432#',
  '..#43221#54432 1#',
  '...#211#.#3221#.',
  '....###.##211##.',
  '.......#554###..',
  '......#54432#...',
  '......#43321#...',
  '.......#211#....',
  '........###.....',
];
F['sweet_berries'] = () =>
  spr(BERRIES.map((r) => r.replace(' ', '').padEnd(16, '.').slice(0, 16)), {
    '#': 0x3d0508, 1: 0x6b0f14, 2: 0x9e1b21, 3: 0xc9282c, 4: 0xe6484a, 5: 0xff9a90,
    q: 0x163d0d, g: 0x2f7d1b, l: 0x5fb535,
  }, 'sweet_berries');

// Glow berries: three glowing orange berries on a curling green vine
// prettier-ignore
const GLOW_BERRIES = [
  '................',
  '...........qq...',
  '..........qglq..',
  '.........qglq...',
  '........qggq....',
  '.......qgqq.....',
  '......qgq.......',
  '.....qgqgq......',
  '...####.qgq.....',
  '..#5543#.qgq....',
  '.#554432#.####..',
  '.#543321##5543#.',
  '.#432211#554432#',
  '..#3211#.#43321#',
  '...####..#3211#.',
  '..........####..',
];
F['glow_berries'] = () =>
  spr(GLOW_BERRIES, { '#': 0x3b1b06, 1: 0x9a4a16, 2: 0xc56a21, 3: 0xe4892c, 4: 0xf5ac3c, 5: 0xffdf85, q: 0x1d3a0e, g: 0x3f6b1f, l: 0x6f9f38 }, 'glow_berries');

// ---------------------------------------------------------------------------
// Meats

// prettier-ignore
const STEAK_MASK = [
  '................',
  '................',
  '....XXXX........',
  '...XXXXXXX......',
  '..XXXXXXXXXX....',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXXX..',
  '....XXXXXXXXX...',
  '......XXXXXX....',
  '................',
  '................',
];

// prettier-ignore
const STEAK_MARBLE = [
  '................',
  '................',
  '................',
  '....ff..........',
  '...f............',
  '...f..m.....m...',
  '..f....mm..m....',
  '..f..m...mm.....',
  '.......m.....m..',
  '...m....mm..m...',
  '....mm....m.....',
  '.......m........',
  '................',
];

// prettier-ignore
const STEAK_SEAR = [
  '................',
  '................',
  '................',
  '....ff..........',
  '...f............',
  '...f.......g....',
  '..f.......g.....',
  '..f..g...g......',
  '....g...g...g...',
  '...g...g...g....',
  '......g...g.....',
  '.........g......',
  '................',
];

function meat(mask: string[], ramp: number[], o: number, marble: string[], mc: Pal, seed: string): TexImage {
  const t = autoShade(mask, ramp, o, { seed, edge: 1.1, relief: 3, cluster: 0.12 });
  over(t, marble, mc);
  return t;
}

F['beef'] = () =>
  meat(STEAK_MASK, [0x6a0e0e, 0x8e1616, 0xb02222, 0xcc3a34, 0xe0564c, 0xf07a6a], 0x3d0808, STEAK_MARBLE, { f: 0xf4d0c8, m: 0xe89a90 }, 'beef');
F['cooked_beef'] = () =>
  meat(STEAK_MASK, [0x3e2210, 0x552f16, 0x6c3d1c, 0x834d24, 0x9a5f2e, 0xb0743c], 0x241208, STEAK_SEAR, { f: 0xd2a472, g: 0x4a2812 }, 'cooked_beef');

// prettier-ignore
const CHOP_MASK = [
  '................',
  '................',
  '................',
  '.......XXXXX....',
  '.....XXXXXXXXX..',
  '....XXXXXXXXXXX.',
  '...XXXXXXXXXXXX.',
  '..XXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXX..',
  '.XXXXXXXXXXXX...',
  '.XXXXXXXXXXX....',
  '..XXXXXXXXX.....',
  '...XXXXXX.......',
  '................',
  '................',
];

function chop(ramp: number[], o: number, fat: number[], seed: string): TexImage {
  const t = autoShade(CHOP_MASK, ramp, o, { seed, edge: 1.1, relief: 3 });
  // thick fat rim along the upper-left edge
  paint(t, (x, y, c) => {
    if (c === o) return;
    const up = getPx(t, x, y - 1) === o || !getA(t, x, y - 1);
    const left = getPx(t, x - 1, y) === o || !getA(t, x - 1, y);
    const up2 = getPx(t, x, y - 2) === o || !getA(t, x, y - 2);
    if ((up || left) && x + y < 16) return fat[1];
    if (up2 && x + y < 14) return fat[0];
  });
  return t;
}
F['porkchop'] = () => chop([0x9c4a4a, 0xbd5f5f, 0xd87a78, 0xea9492, 0xf5aeaa], 0x5c2424, [0xf2c8c0, 0xfbe6e0], 'porkchop');
F['cooked_porkchop'] = () => {
  const t = chop([0x5a2e16, 0x7a3e1e, 0x9a5228, 0xb46a36, 0xc88448], 0x331808, [0xd8b48a, 0xeed2a8], 'cooked_porkchop');
  over(t, ['................', '................', '................', '................', '................', '................', '..........g.....', '.........g......', '....g...g..g....', '...g...g..g.....', '..g...g..g......', '.....g..g.......', '.......g........'], { g: 0x4e2610 });
  return t;
};

// Chicken: plump body with a drumstick poking out.
// prettier-ignore
export const CHICKEN_MASK = [
  '................',
  '................',
  '...........bB...',
  '..........bBBb..',
  '......XXXXbBb...',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXX..',
  '.XXXXXXXXXXXXX..',
  '.XXXXXXXXXXXX...',
  '..XXXXXXXXXXX...',
  '...XXXXXXXXX....',
  '.....XXXXX......',
  '................',
];
function chicken(ramp: number[], o: number, bone: Pal, seed: string): TexImage {
  const t = autoShade(CHICKEN_MASK, ramp, o, { seed, edge: 1.1, relief: 4, extra: bone });
  // wing crease
  for (const [x, y] of [[4, 9], [5, 10], [6, 10], [7, 11]] as [number, number][]) plot(t, x, y, ramp[1]);
  return t;
}
F['chicken'] = () => chicken([0xb88570, 0xd09c86, 0xe2b4a0, 0xefc8b6, 0xf8dccd, 0xfff0e6], 0x6b4234, { b: 0xd8d0c4, B: 0xf4f0e8 }, 'chicken');
F['cooked_chicken'] = () =>
  chicken([0x7a4414, 0x98581c, 0xb66f26, 0xcc8a34, 0xdea64a, 0xefc56c], 0x44230a, { b: 0xd8d0c4, B: 0xf4f0e8 }, 'cooked_chicken');

// Mutton: leg of lamb with a bone sticking out to the upper right.
// prettier-ignore
const MUTTON_MASK = [
  '................',
  '............BB..',
  '...........BBBB.',
  '............BBb.',
  '..........bBb...',
  '.....XXXXbBb....',
  '...XXXXXXXXb....',
  '..XXXXXXXXXX....',
  '.XXXXXXXXXXXX...',
  '.XXXXXXXXXXXX...',
  '.XXXXXXXXXXX....',
  '.XXXXXXXXXXX....',
  '..XXXXXXXXX.....',
  '...XXXXXXX......',
  '.....XXX........',
  '................',
];
F['mutton'] = () => {
  const t = autoShade(MUTTON_MASK, [0x7a1a1e, 0x9c2a2c, 0xba3e3c, 0xd05650, 0xe27266, 0xf09486], 0x44090c, {
    seed: 'mutton', edge: 1.1, relief: 3, extra: { b: 0xc8c0b4, B: 0xf2eee6 },
  });
  over(t, ['................', '................', '................', '................', '................', '................', '....ff..........', '...f..w.........', '..f.....w.......', '.......w..w.....', '....w....w......'], { f: 0xf2d6cc, w: 0xe8b0a4 });
  return t;
};
F['cooked_mutton'] = () => {
  const t = autoShade(MUTTON_MASK, [0x3e2110, 0x552e16, 0x6e3e1e, 0x864f28, 0x9c6334, 0xb07a44], 0x241208, {
    seed: 'cooked_mutton', edge: 1.1, relief: 3, extra: { b: 0xc8c0b4, B: 0xf2eee6 },
  });
  over(t, ['................', '................', '................', '................', '................', '................', '....ff..........', '...f..w.........', '..f.....w.......', '.......w..w.....', '....w....w......'], { f: 0xc49a6c, w: 0x3e2110 });
  return t;
};

// prettier-ignore
const ROTTEN_MASK = [
  '................',
  '................',
  '.....XXX........',
  '...XXXXXX.XX....',
  '..XXXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXX..',
  '..XXXXXXXXXXX...',
  '...XXXXXXXXX....',
  '....XX..XXX.....',
  '................',
  '................',
];
F['rotten_flesh'] = () => {
  const t = autoShade(ROTTEN_MASK, [0x4e2418, 0x6a3222, 0x86422c, 0x9e5438, 0xb26a48, 0xc4845c], 0x2c120a, {
    seed: 'rotten', edge: 1.1, relief: 3, cluster: 0.25, cell: 4,
  });
  over(t, [
    '................',
    '................',
    '................',
    '....gG..........',
    '...gGg.....w....',
    '..........gGg...',
    '..w.......gg....',
    '......d.........',
    '.....gGg....d...',
    '.....ggG........',
    '..d.......gGg...',
    '...........g....',
    '.......d........',
  ], { g: 0x5f6e2c, G: 0x7c8c3c, w: 0xd8b8a0, d: 0x3a1a10 });
  return t;
};

// ---------------------------------------------------------------------------
// Fish (head lower-left, tail upper-right)

export interface FishPal { o: number; back: number; spot: number; side: number; belly: number; fin: number; finD: number }
export function fish(p: FishPal, seed: string, spots: boolean): TexImage {
  const body = inEllipse(7.0, 9.0, 6.3, 3.3, 45);
  const tail = (x: number, y: number) => {
    // two-lobed tail fin beyond the body end (around 11.4,4.6)
    const u = (x - 11.2 + (y - 4.8) * -1) / Math.SQRT2; // along axis (up-right)
    const v = (x - 11.2 + (y - 4.8)) / Math.SQRT2; // across
    if (u < -0.6 || u > 3.4) return false;
    const half = 0.9 + u * 0.75;
    if (Math.abs(v) > half) return false;
    return !(u > 1.9 && Math.abs(v) < (u - 1.9) * 0.9);
  };
  const t = img16();
  const m = maskFn((x, y) => body(x, y) || tail(x, y));
  const r = rng(seed);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (m[y][x] !== 'X') continue;
      const cx = x + 0.5, cy = y + 0.5;
      if (!body(cx, cy)) {
        plot(t, x, y, (x + y) % 2 === 0 ? p.fin : p.finD);
        continue;
      }
      const v = (cx - 7.0 + (cy - 9.0)) / Math.SQRT2; // + = belly side (lower right)
      let c = v < -1.3 ? p.back : v < 1.0 ? p.side : p.belly;
      if (spots && v < 0.4 && r.chance(0.28)) c = p.spot;
      plot(t, x, y, c);
    }
  outline4(t, p.o);
  // eye and gill
  plot(t, 3, 11, 0x101010);
  plot(t, 3, 10, 0xe8e8e8);
  plot(t, 5, 12, p.o);
  plot(t, 5, 11, p.o);
  // small fin on the belly side
  plot(t, 8, 13, p.finD);
  plot(t, 9, 13, p.o);
  plot(t, 8, 14, p.o);
  return t;
}
function img16(): TexImage {
  return { w: 16, h: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
}
F['cod'] = () => fish({ o: 0x3a2c1c, back: 0x806848, spot: 0x5e4a32, side: 0xae9874, belly: 0xdcd0b6, fin: 0x9a8260, finD: 0x7a6446 }, 'cod', true);
F['cooked_cod'] = () => fish({ o: 0x5a3d22, back: 0xae8660, spot: 0x8e6a48, side: 0xd2b48c, belly: 0xefe2c6, fin: 0xc09a70, finD: 0xa07e58 }, 'cooked_cod', false);
F['salmon'] = () => fish({ o: 0x3d140c, back: 0x8e3a2c, spot: 0x5e2418, side: 0xcc5c44, belly: 0xf08e70, fin: 0xa8442e, finD: 0x86342a }, 'salmon', true);
F['cooked_salmon'] = () => fish({ o: 0x4a2410, back: 0x9e5632, spot: 0x7a3e22, side: 0xca7e4a, belly: 0xeaa672, fin: 0xae663a, finD: 0x8e522e }, 'cooked_salmon', false);

// ---------------------------------------------------------------------------
// Bowl and stew

// prettier-ignore
const BOWL = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...##########...',
  '..#rrrrrrrrrr#..',
  '.#rIIIIIIIIIIr#.',
  '.#RrIIIIIIIIrR#.',
  '.#44RRrrrrRR22#.',
  '..#4433333221#..',
  '...#43333221#...',
  '....##22211##...',
  '......#####.....',
  '................',
];
export const BOWL_PAL: Pal = {
  '#': 0x2e1d0c, I: 0x3d2811, r: 0xa8824a, R: 0x86653a,
  1: 0x4a3218, 2: 0x5e4120, 3: 0x7a5a2e, 4: 0x94703c,
};
export function bowlRows(): string[] {
  return BOWL.map((r) => r.replace(/ /g, '').padEnd(16, '.').slice(0, 16));
}
F['bowl'] = () => spr(bowlRows(), BOWL_PAL, 'bowl');
F['mushroom_stew'] = () => {
  const t = spr(bowlRows(), BOWL_PAL, 'mushroom_stew');
  over(t, [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...sSsmMssSsm...',
    '....sSssSmMss...',
  ], { s: 0x6e3f1c, S: 0x8a5428, m: 0xd8c4a8, M: 0xf2e6d2 });
  return t;
};

// ---------------------------------------------------------------------------
// Wheat and seeds

F['wheat'] = () => {
  const t = img16();
  const put = (u: number, s: number, c: number) => {
    if ((u + s) % 2 !== 0) return;
    plot(t, (u + s) / 2, (u - s) / 2, c);
  };
  // stalks (one pixel wide diagonals)
  for (let s = -12; s <= 0; s++) {
    put(12, s, 0xcdbd66);
    put(15, s, 0xb3a24c);
    put(18, s, 0x9a8a3c);
  }
  // grain heads: braided kernels
  const heads: [number, number, number][] = [[11, -1, 8], [14, 1, 10], [17, 0, 8]];
  for (const [u0, s0, s1] of heads)
    for (let s = s0; s <= s1; s++)
      for (const u of [u0, u0 + 1]) {
        const braid = ((s >> 1) + (u - u0)) & 1;
        put(u, s, braid ? (u === u0 ? 0xf3d66c : 0xdcb444) : u === u0 ? 0xc99a2e : 0xa87a1e);
      }
  outline4(t, 0x453408);
  // awns beyond each head tip
  for (const [u0, , s1] of heads) {
    put(u0, s1 + 2, 0xd8bc5a);
    put(u0 + 1, s1 + 3, 0xd8bc5a);
  }
  return t;
};

// prettier-ignore
export const SEEDS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......##.......',
  '......#ab#..##..',
  '...##.#bc#.#ab#.',
  '..#ab#.##..#bc#.',
  '..#bc#..##..##..',
  '...##..#ab#.....',
  '......##bc#.....',
  '.....#ab##......',
  '.....#bc#.......',
  '......##........',
  '................',
];
F['wheat_seeds'] = () => spr(SEEDS, { '#': 0x1f3a0e, a: 0x8cc85a, b: 0x5a9a30, c: 0x3a6e1e }, 'wheat_seeds');

// ---------------------------------------------------------------------------
// More crops: beetroots, stem seeds, golden carrot, poisonous potato, pumpkin pie

F['beetroot'] = () => {
  // round beet at the lower left, a thin tail root, leafy stalks at the upper right
  const t = autoShade(maskFn(inEllipse(6.5, 9.5, 4.3, 4.1, 0)), [0x3d0a1c, 0x5c1028, 0x7d1a36, 0x9c2644, 0xb83a56, 0xcf5a6e], 0x2a0613, { seed: 'beetroot', edge: 1.2, relief: 3 });
  over(t, [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..#.............',
    '.#r.............',
    '................',
  ], { '#': 0x2a0613, r: 0x7d1a36 });
  over(t, [
    '...........#g#..',
    '.........#glg#..',
    '........#gllg#.#',
    '.......#glgg##gg',
    '......#ggg#.#glg',
    '.....#sgg#..#gg#',
    '....#ss##..##g#.',
    '...#s#....##g#..',
    '..........#g#...',
  ], { '#': 0x163d0d, g: 0x2f7d1b, l: 0x5fb535, s: 0x9c2644 }, 0, 0);
  return t;
};
F['beetroot_seeds'] = () => spr(SEEDS, { '#': 0x3a2410, a: 0xd7b98a, b: 0xb08a58, c: 0x7c5a32 }, 'beetroot_seeds');
F['pumpkin_seeds'] = () => spr(SEEDS, { '#': 0x6e6448, a: 0xfaf6e0, b: 0xe6dcb4, c: 0xc2b68c }, 'pumpkin_seeds');
F['melon_seeds'] = () => spr(SEEDS, { '#': 0x0c0a08, a: 0x5a4a34, b: 0x3a2e20, c: 0x221a12 }, 'melon_seeds');
F['golden_carrot'] = () => {
  const t = carrotSprite([0x7a5a05, 0xa8800c, 0xd0a818, 0xefcb2c, 0xfbe45c, 0xfff6a8], 0x4a3403, 0xa8800c, { q: 0x163d0d, g: 0x2f7d1b, l: 0x5fb535 });
  for (const [x, y] of [[6, 9], [9, 6], [4, 12]] as [number, number][]) if (getA(t, x, y)) plot(t, x, y, 0xffffff);
  return t;
};
F['poisonous_potato'] = () => {
  const t = potato([0x55621c, 0x6f7e28, 0x8a9a36, 0xa3b446, 0xbccc5e, 0xd4e07c], 0x333c0e, 0x5c6a1c, 'poisonous_potato');
  for (const [x, y] of [[7, 6], [11, 9], [5, 10]] as [number, number][]) if (getA(t, x, y)) plot(t, x, y, 0x3e5a12);
  return t;
};
F['pumpkin_pie'] = () =>
  spr([
    '................',
    '................',
    '................',
    '................',
    '.....######.....',
    '...##oOOOOo##...',
    '..#oOOYYYYOOo#..',
    '.#cOOYYYYYYOOc#.',
    '.#ccOOOOOOOOcc#.',
    '.#Cccccccccccc#.',
    '.#CCCccccccCCC#.',
    '..##CCCCCCCC##..',
    '....########....',
    '................',
    '................',
    '................',
  ], { '#': 0x4a2a0e, o: 0xc86a18, O: 0xe08a24, Y: 0xf2aa3c, c: 0xc89454, C: 0x9a6a34 }, 'pumpkin_pie');
F['beetroot_soup'] = () => {
  const t = spr(bowlRows(), BOWL_PAL, 'beetroot_soup');
  over(t, [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...rRrrRrrRrr...',
    '....rrRrrrRr....',
  ], { r: 0x8c1830, R: 0xb8304a });
  return t;
};
