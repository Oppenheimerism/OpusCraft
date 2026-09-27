// Functional / decorative blocks: crafting table, furnace, bookshelf, TNT,
// chest, hay, glowstone, sea lantern, sponge, spawner.

import { TexImage, img, setPx, getPx, mixC, rect } from '../tex';
import { N, rng, white, fbm, quantize, paint } from './core';
import { speckled, stones } from './terrain';
import { planks, WOOD, WoodDef } from './wood';
import { sprite } from './plants';

const OAK = WOOD.oak;

// ---------------------------------------------------------------------------
// Crafting table

const CT_DARK = 0x5a4126, CT_MID = 0x7d5d34, CT_EDGE = 0x4a3520;

export function craftingTableTop(): TexImage {
  const t = planks('crafting_table_top', OAK);
  // frame: dark outer edge, lit inner rim on the top/left
  for (let i = 0; i < N; i++) {
    for (const [x, y] of [[i, 0], [0, i], [i, 15], [15, i]]) setPx(t, x, y, CT_EDGE);
    for (const [x, y] of [[i, 1], [1, i]]) if (i > 0 && i < 15) setPx(t, x, y, 0xc9a56c);
  }
  // 3x3 grid lines with a lit edge below/right
  for (let i = 1; i < 15; i++) {
    for (const g of [5, 10]) {
      setPx(t, i, g, CT_DARK);
      setPx(t, g, i, CT_DARK);
      if (i !== 5 && i !== 10) {
        setPx(t, i, g + 1, mixC(getPx(t, i, g + 1), 0xd9b77e, 0.4));
        setPx(t, g + 1, i, mixC(getPx(t, g + 1, i), 0xd9b77e, 0.4));
      }
    }
  }
  return t;
}

/** Crafting table side/front: table-top rim + planks body with tools painted on. */
export function craftingTableSide(front: boolean): TexImage {
  const t = planks(front ? 'crafting_table_front' : 'crafting_table_side', OAK);
  // rim (table top edge): rows 0-2
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, 0x7d5d34);
    setPx(t, x, 1, x % 5 === 2 ? 0x5a4126 : 0x6a4d2b);
    setPx(t, x, 2, CT_EDGE);
  }
  // legs (corner posts)
  for (let y = 3; y < N; y++) {
    setPx(t, 0, y, CT_EDGE);
    setPx(t, 1, y, CT_MID);
    setPx(t, 14, y, CT_MID);
    setPx(t, 15, y, CT_EDGE);
  }
  for (let x = 0; x < N; x++) setPx(t, x, 15, CT_EDGE);
  const key = { s: 0xb4b4b4, S: 0x8a8a8a, d: 0x5e5e5e, h: 0x7a5530, H: 0x5a3c1f, w: 0xe0e0e0 };
  if (front) {
    // saw (left) and hammer (right)
    sprite(
      [
        '..............',
        '.HH......ssS..',
        '.hS......sSS..',
        '.hsS.....dHd..',
        '.hssS.....h...',
        '.hsssS....h...',
        '.hssssS...h...',
        '.hddddd...h...',
        '..........H...',
        '..............',
      ],
      key, t, 1, 4,
    );
  } else {
    // tongs / shears style tool + chisel
    sprite(
      [
        '..............',
        '..s...s.....S.',
        '..sS.sS....sS.',
        '...sSS....sS..',
        '...hH....hH...',
        '..hH.hH.hH....',
        '..H...HH......',
        '..............',
        '..............',
        '..............',
      ],
      key, t, 1, 4,
    );
  }
  return t;
}

// ---------------------------------------------------------------------------
// Furnace

const FURN_PAL = [0x4f4f4f, 0x5d5d5d, 0x6b6b6b, 0x777777, 0x828282, 0x8e8e8e, 0x9b9b9b];

function furnaceBase(seed: string): TexImage {
  return speckled(seed, FURN_PAL, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 0.6, 2.5, 5, 2.5, 0.6, 0], mode: 1, dark: 7, darkSize: [1, 3], light: 5, lightSize: [1, 2] });
}

function frameStone(t: TexImage, full: boolean): void {
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, 0xa4a4a4);
    setPx(t, i, 15, 0x4a4a4a);
    if (full) {
      setPx(t, 0, i, i === 15 ? 0x4a4a4a : 0x9a9a9a);
      setPx(t, 15, i, i === 0 ? 0x9a9a9a : 0x555555);
    }
  }
}

export function furnaceSide(): TexImage {
  const t = furnaceBase('furnace_side');
  frameStone(t, false);
  for (let x = 0; x < N; x++) {
    setPx(t, x, 1, mixC(getPx(t, x, 1), 0xa4a4a4, 0.3));
    setPx(t, x, 14, mixC(getPx(t, x, 14), 0x4a4a4a, 0.3));
  }
  return t;
}

export function furnaceTop(): TexImage {
  const t = furnaceBase('furnace_top');
  frameStone(t, true);
  return t;
}

export function furnaceFront(on: boolean): TexImage {
  const t = furnaceSide();
  // upper slot (ash pit window)
  rect(t, 4, 3, 8, 3, 0x3a3a3a);
  rect(t, 5, 4, 6, 1, 0x1e1e1e);
  for (let x = 4; x < 12; x++) setPx(t, x, 6, 0x9a9a9a);
  // firebox opening
  rect(t, 3, 8, 10, 6, 0x3a3a3a);
  rect(t, 4, 9, 8, 4, on ? 0x2a0e00 : 0x141414);
  for (let x = 3; x < 13; x++) setPx(t, x, 14, 0x9a9a9a);
  for (let y = 8; y < 14; y++) setPx(t, 13, y, 0x8a8a8a);
  if (on) {
    const fire = [
      '.y..o..y',
      'yYo.oyYo',
      'OYYoYYYO',
      'OOYWYYOO',
    ];
    sprite(fire, { y: 0xffc23a, Y: 0xffe066, o: 0xe0701a, O: 0xb8420c, W: 0xfff8c8 }, t, 4, 9);
  } else {
    // grate bars
    for (let x = 4; x < 12; x += 2) for (let y = 9; y < 13; y++) setPx(t, x, y, 0x262626);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Bookshelf

export function bookshelf(): TexImage {
  const t = planks('bookshelf', OAK);
  const r = rng('bookshelf');
  const books = [
    [0x7e2216, 0xa3301f, 0xc04632],
    [0x24457e, 0x335c9e, 0x4a78bd],
    [0x33682a, 0x438434, 0x5aa044],
    [0x7a5518, 0x9c7224, 0xbb8d35],
    [0x55296a, 0x6d3886, 0x874ba3],
    [0x8a7a56, 0xab9b70, 0xc9ba8c],
    [0x246868, 0x338585, 0x46a0a0],
    [0x68251f, 0x843330, 0xa04642],
  ];
  const shelves = [[1, 6], [9, 14]];
  for (const [y0, y1] of shelves) {
    // back of shelf (dark)
    for (let y = y0; y <= y1; y++) for (let x = 1; x < 15; x++) setPx(t, x, y, 0x3b2a17);
    let x = 1;
    while (x < 15) {
      const w = r.chance(0.35) ? 2 : 1;
      const top = y0 + r.nextInt(2) + (r.chance(0.2) ? 1 : 0);
      const b = books[r.nextInt(books.length)];
      for (let i = 0; i < w && x < 15; i++, x++)
        for (let y = top; y <= y1; y++) {
          let c = b[1];
          if (i === 0 && w === 2) c = b[2];
          if (y === top) c = b[2];
          if (y === y1) c = b[0];
          if (w === 1 && (y - top) % 3 === 1 && r.chance(0.5)) c = b[2];
          setPx(t, x, y, c);
        }
      if (r.chance(0.12) && x < 14) x++; // gap
    }
  }
  // shelf boards
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, 0x8e7144);
    setPx(t, x, 7, 0x9e7f4c);
    setPx(t, x, 8, 0x735a37);
    setPx(t, x, 15, 0x5b4428);
  }
  for (let y = 0; y < N; y++) {
    setPx(t, 0, y, y === 15 ? 0x5b4428 : 0x735a37);
    setPx(t, 15, y, 0x5b4428);
  }
  return t;
}

// ---------------------------------------------------------------------------
// TNT

const TNT_RED = [0x8f1f16, 0xb12a1e, 0xcf3a2a, 0xdc4a38, 0xe86a58];

export function tntSide(): TexImage {
  const t = img();
  const r = rng('tnt_side');
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // paper tubes: 4 px wide, shaded
      const lx = x % 4;
      let k = lx === 0 ? 3 : lx === 3 ? 1 : 2;
      if (lx === 1 && r.chance(0.3)) k = 3;
      if (y === 0) k = Math.min(4, k + 1);
      if (y === 15) k = 0;
      setPx(t, x, y, TNT_RED[k]);
    }
  // white label band rows 4-11 with black letters
  for (let y = 4; y < 12; y++) for (let x = 0; x < N; x++) setPx(t, x, y, y === 4 ? 0xdcdcdc : y === 11 ? 0xa8a8a8 : 0xefefef);
  sprite(
    [
      'kkk.k..k.kkk',
      '.k..kk.k..k.',
      '.k..k.kk..k.',
      '.k..k..k..k.',
    ],
    { k: 0x1c1c1c },
    t, 2, 6,
  );
  return t;
}

export function tntTop(bottom: boolean): TexImage {
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // ends of 16 tubes (4x4 grid of circles)
      const lx = x % 4, ly = y % 4;
      let k = 2;
      if (lx === 0 || ly === 0) k = 1;
      if ((lx === 1 || lx === 2) && (ly === 1 || ly === 2)) k = bottom ? 2 : 3;
      if (lx === 3 && ly === 3) k = 0;
      setPx(t, x, y, TNT_RED[k]);
    }
  if (!bottom) {
    // fuse in the middle
    rect(t, 6, 6, 4, 4, 0x3a3a3a);
    rect(t, 7, 7, 2, 2, 0x5a5a5a);
    setPx(t, 7, 6, 0x6a6a6a);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Chest (faces sampled by the chest model's UVs: body rows 6-15, lid rows 2-5, cols 1-14)

const CHEST_WOOD: WoodDef = {
  bark: WOOD.oak.bark,
  wood: [0x6b4a1c, 0x86591f, 0x976628, 0xa6722e, 0xb27d35, 0xbf8a3f],
  ring: WOOD.oak.ring,
  seams: [[4], [11], [7], [2, 13]],
};
const CHEST_EDGE = 0x3a2710, CHEST_EDGE2 = 0x4e3416;

function chestFrame(t: TexImage, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = x0; x <= x1; x++) {
    setPx(t, x, y0, CHEST_EDGE);
    setPx(t, x, y1, CHEST_EDGE);
  }
  for (let y = y0; y <= y1; y++) {
    setPx(t, x0, y, CHEST_EDGE);
    setPx(t, x1, y, CHEST_EDGE);
  }
  for (let x = x0 + 1; x < x1; x++) setPx(t, x, y1 - 1, mixC(getPx(t, x, y1 - 1), CHEST_EDGE2, 0.5));
}

export function chestFace(kind: 'top' | 'side' | 'front' | 'bottom' | 'lid_side' | 'lid_front'): TexImage {
  const t = planks('chest_' + kind, CHEST_WOOD);
  switch (kind) {
    case 'top':
    case 'bottom':
      chestFrame(t, 1, 1, 14, 14);
      break;
    case 'side':
    case 'front':
      chestFrame(t, 1, 6, 14, 15);
      break;
    case 'lid_side':
    case 'lid_front':
      chestFrame(t, 1, 2, 14, 5);
      break;
  }
  return t;
}

export function chestLatch(): TexImage {
  const t = img();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) setPx(t, x, y, 0x9a9a9a);
  // visible front: x 7-8, y 5-8
  const face: [number, number, number][] = [[7, 5, 0xd8d8d8], [8, 5, 0xbcbcbc], [7, 6, 0xbcbcbc], [8, 6, 0x9a9a9a], [7, 7, 0x9a9a9a], [8, 7, 0x7a7a7a], [7, 8, 0x5c5c5c], [8, 8, 0x4a4a4a]];
  for (const [x, y, c] of face) setPx(t, x, y, c);
  return t;
}

// ---------------------------------------------------------------------------
// Hay, glowstone, sea lantern, sponge, spawner

const HAY = [0x8c6a12, 0xa9861a, 0xbf9b24, 0xd1ae30, 0xe0c141, 0xecd25a];

export function haySide(): TexImage {
  const r = rng('hay_side');
  const f = fbm(r, [[2, 16, 0.5], [1, 8, 0.3]], 0.35);
  const tones = quantize(f, [0.6, 1.5, 3, 3, 1.5, 0.5]);
  const t = paint(tones, HAY);
  // two bindings (red-brown bands) with shading
  for (const y0 of [2, 11]) for (let x = 0; x < N; x++) {
    setPx(t, x, y0, 0x8a3a18);
    setPx(t, x, y0 + 1, x % 3 === 0 ? 0x6e2c12 : 0x7c3314);
    setPx(t, x, y0 + 2, mixC(getPx(t, x, y0 + 2), 0x5a3a0a, 0.35));
  }
  return t;
}

export function hayTop(): TexImage {
  const r = rng('hay_top');
  const t = speckled('hay_top', [0x7a5a10, 0x957417, 0xab881f, 0xbf9b28, 0xd1ae33, 0xe0c141, 0xecd25a], { oct: [[2, 2, 0.5]], white: 0.7, weights: [0.5, 1.5, 2.5, 3, 2, 1, 0.3], dark: 14, darkSize: [1, 2], light: 10, lightSize: [1, 2] });
  // binding ring around the edge
  for (let i = 0; i < N; i++) {
    for (const [x, y] of [[i, 2], [2, i], [i, 13], [13, i]]) if (i >= 2 && i <= 13) setPx(t, x, y, r.chance(0.2) ? 0x6e2c12 : 0x8a3a18);
  }
  return t;
}

const KELP = [0x1b2511, 0x263219, 0x313f1f, 0x3c4c25, 0x48592b, 0x556732];

/** vanilla dried_kelp_side.png (our own drawing): sheets of dried kelp pressed in wavy bands, dark seams between */
export function driedKelpSide(): TexImage {
  const r = rng('dried_kelp_side');
  const f = fbm(r, [[4, 2, 0.5], [2, 1, 0.3]], 0.3);
  const t = paint(quantize(f, [0.6, 1.5, 3, 3, 1.5, 0.5]), KELP);
  const phase = r.next() * Math.PI * 2;
  for (let x = 0; x < N; x++) {
    const w = Math.round(Math.sin((x / N) * Math.PI * 2 + phase) * 0.8);
    for (const y0 of [1, 5, 9, 13]) {
      const y = (y0 + w + N) % N;
      setPx(t, x, y, r.chance(0.15) ? 0x202b14 : 0x121a0b);
      setPx(t, x, (y + 1) % N, mixC(getPx(t, x, (y + 1) % N), 0x6a7c3c, 0.25));
    }
  }
  return t;
}

/** vanilla dried_kelp_top.png / dried_kelp_bottom.png (our own drawing): the end of a roll of kelp, coiled round */
export function driedKelpEnd(name: string): TexImage {
  const r = rng(name);
  const t = speckled(name, KELP, { oct: [[2, 2, 0.5]], white: 0.6, weights: [0.5, 1.5, 3, 3, 1.5, 0.5], dark: 6, darkSize: [1, 1], light: 4, lightSize: [1, 1] });
  const turn = r.next() * Math.PI * 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      // (a spiral: a seam every 2.6 pixels out, creeping outward as it goes round)
      const a = (Math.atan2(dy, dx) + turn) / (Math.PI * 2);
      const d = Math.sqrt(dx * dx + dy * dy) + a * 2.6;
      const m = ((d % 2.6) + 2.6) % 2.6;
      if (m < 0.75) setPx(t, x, y, mixC(getPx(t, x, y), 0x0f160a, 0.75));
      else if (m < 1.2) setPx(t, x, y, mixC(getPx(t, x, y), 0x6a7c3c, 0.2));
    }
  // the frayed rim of the roll
  for (let i = 0; i < N; i++) for (const [x, y] of [[i, 0], [0, i], [i, 15], [15, i]] as [number, number][]) setPx(t, x, y, mixC(getPx(t, x, y), 0x121a0b, 0.5));
  return t;
}

export function glowstone(): TexImage {
  const pal = [0x5a3a18, 0x7a5224, 0x99692f, 0xb5833c, 0xcfa04e, 0xe8c068, 0xfbe39a];
  return stones('glowstone', pal, { sites: 11, minDist: 3.2, mortar: [0x55361a, 0x6b4520], mortarW: 0.6, shadeTones: [2, 3, 3, 4], rim: 0.5, noiseAmt: 1.2 });
}

/** vanilla redstone_lamp(_on).png: a glowstone-like pane of cells in a dark frame, dull red-brown off, blazing when lit */
export function redstoneLamp(on: boolean): TexImage {
  const pal = on ? [0x6b3a14, 0x93561d, 0xb87428, 0xd69535, 0xebb44c, 0xf8d57a, 0xfff0bd] : [0x2e170b, 0x3f2011, 0x512a17, 0x62351d, 0x734024, 0x864d2c, 0x985c38];
  const t = stones(on ? 'redstone_lamp_on' : 'redstone_lamp', pal, { sites: 9, minDist: 3.2, mortar: on ? [0x5a3212, 0x70421a] : [0x24110a, 0x2f170d], mortarW: 0.6, shadeTones: [2, 3, 3, 4], rim: 0.5, noiseAmt: 1.2 });
  const frame = on ? [0x3f2412, 0x5c3a1f, 0x7a5230] : [0x1f120b, 0x2e1c11, 0x3e2819];
  for (let i = 0; i < N; i++)
    for (const [x, y] of [[i, 0], [0, i], [i, 15], [15, i]] as [number, number][]) setPx(t, x, y, frame[(i + x + y) % 2]);
  for (let i = 1; i < 15; i++) {
    setPx(t, i, 1, mixC(getPx(t, i, 1), frame[2], 0.6));
    setPx(t, 1, i, mixC(getPx(t, 1, i), frame[2], 0.6));
    setPx(t, i, 14, mixC(getPx(t, i, 14), frame[0], 0.5));
    setPx(t, 14, i, mixC(getPx(t, 14, i), frame[0], 0.5));
  }
  return t;
}

export function seaLantern(): TexImage {
  const t = img();
  const pal = [0x759a91, 0x92b5ac, 0xadcdc5, 0xc5dfd9, 0xdcefea, 0xf1faf7];
  const r = rng('sea_lantern');
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      // 2x2 panes separated by a cross, frame around
      let k = 3;
      if (e === 0) k = 1;
      else if (e === 1) k = 2;
      else if (x === 7 || x === 8 || y === 7 || y === 8) k = x === 7 || y === 7 ? 2 : 1;
      else {
        const lx = x < 7 ? x - 2 : x - 9, ly = y < 7 ? y - 2 : y - 9;
        k = lx + ly < 2 ? 5 : lx + ly > 6 ? 3 : 4;
        if (r.chance(0.1)) k--;
      }
      setPx(t, x, y, pal[k]);
    }
  return t;
}

export function sponge(): TexImage {
  const r = rng('sponge');
  const t = speckled('sponge', [0x9c8d25, 0xb3a22e, 0xc3b338, 0xcfc044, 0xd9cb52, 0xe3d662, 0xece17a], { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 0.5, 2, 4, 2, 0.8, 0.2], mode: 1, dark: 0, light: 6, lightSize: [1, 2] });
  // holes: dark pits with lit lower rim
  for (let k = 0; k < 13; k++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    const big = r.chance(0.4);
    setPx(t, x, y, 0x6f631a);
    if (big) {
      setPx(t, x + 1, y, 0x84761f);
      setPx(t, x, y + 1, 0x84761f);
    }
    setPx(t, x, y + (big ? 2 : 1), 0xe8dc72);
  }
  return t;
}

export function spawner(): TexImage {
  const t = img();
  const bar = [0x10171d, 0x1b2630, 0x28384a, 0x3b5068];
  // cage: border + bars every 5 px, with a lit edge
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      const vb = x % 5 === 0 || x === 15, hb = y % 5 === 0 || y === 15;
      if (e === 0 || vb || hb) {
        let k = 1;
        if ((vb && hb) || e === 0) k = 2;
        if ((x + y) % 4 === 0) k = 3;
        if ((x * 3 + y) % 7 === 0) k = 0;
        setPx(t, x, y, bar[k]);
      }
    }
  return t;
}

