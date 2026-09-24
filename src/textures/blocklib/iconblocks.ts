// Blocks that so far only appear as advancement cube icons (gui/iconCubes.ts):
// note block, jukebox, target, honey block, bee nest, chiseled
// bookshelf, crafter, chiseled tuff, oxidized copper bulb, verdant froglight.

import { TexImage, img, setPx, getPx, mixC } from '../tex';
import { N, rng, idx, fbm, quantize, paint } from './core';
import { speckled } from './terrain';
import { planks, WOOD } from './wood';

const edgeDist = (x: number, y: number): number => Math.min(x, y, 15 - x, 15 - y);

/** Blend the pixel at (x,y) toward colour c by f. */
function tint(t: TexImage, x: number, y: number, c: number, f: number): void {
  setPx(t, x, y, mixC(getPx(t, x, y), c, f));
}

/** Square ring at inset e: top/left sides `lit`, bottom/right sides `dark`, the two off-diagonal corners `mid`. */
function ring(t: TexImage, e: number, lit: number, dark: number, mid = mixC(lit, dark, 0.5)): void {
  const a = e, b = 15 - e;
  for (let i = a; i <= b; i++) {
    setPx(t, i, a, lit);
    setPx(t, a, i, lit);
    setPx(t, i, b, dark);
    setPx(t, b, i, dark);
  }
  setPx(t, b, a, mid);
  setPx(t, a, b, mid);
}

/** Like ring() but blends toward the colours (keeps the texture underneath). */
function ringMix(t: TexImage, e: number, lit: number, fl: number, dark: number, fd: number): void {
  const a = e, b = 15 - e;
  for (let i = a; i < b; i++) {
    tint(t, i, a, lit, fl);
    tint(t, a, i + 1, lit, fl);
    tint(t, i + 1, b, dark, fd);
    tint(t, b, i, dark, fd);
  }
}

/** Recessed rectangle: fill (random pick), shaded top/left inner edge, lit bottom/right inner edge. */
function recess(t: TexImage, seed: string, x0: number, y0: number, x1: number, y1: number, fill: number[], shade: number, lit: number): void {
  const r = rng(seed, x0 * 31 + y0);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let c = fill[r.nextInt(fill.length)];
      if (y === y0 || x === x0) c = shade;
      else if (y === y1 || x === x1) c = lit;
      setPx(t, x, y, c);
    }
}

// ---------------------------------------------------------------------------
// Note block & jukebox: reddish-brown boards inside a thick dark wooden frame

interface BoxWood {
  /** board ramp: [gap, dark grain, mid-dark, base, light, highlight] */
  wood: number[];
  /** frame: [outline, dark, body, lit] */
  frame: number[];
}

const NOTE_WOOD: BoxWood = {
  wood: [0x3c2217, 0x5c3624, 0x6a3f2a, 0x764833, 0x82513a, 0x8e5b42],
  frame: [0x301b10, 0x452819, 0x54321f, 0x663f29],
};
const JUKE_WOOD: BoxWood = {
  wood: [0x3d2317, 0x5f3a27, 0x6e442e, 0x7b4e37, 0x88583f, 0x956347],
  frame: [0x311c11, 0x492b1b, 0x5a3622, 0x6d442d],
};

/** Horizontal boards filling x0..x1 (rows y0..y1 each), a gap line under each board. */
function boards(t: TexImage, seed: string, pal: number[], x0: number, x1: number, rows: [number, number][], seams: number[][]): void {
  const r = rng(seed, 3);
  const g = quantize(fbm(r, [[8, 1, 0.5], [4, 1, 0.3], [16, 2, 0.2]], 0.35), [0.8, 2, 5, 2.2, 0.5]);
  rows.forEach(([y0, y1], b) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let k = g[y * N + x] + 1;
        if (y === y0 && k < 4 && r.chance(0.5)) k++;
        setPx(t, x, y, pal[k]);
      }
    for (let x = x0; x <= x1; x++) setPx(t, x, y1 + 1, pal[0]);
    for (const sx of seams[b] ?? []) {
      for (let y = y0; y <= y1; y++) {
        setPx(t, sx, y, pal[0]);
        if (sx + 1 <= x1) tint(t, sx + 1, y, pal[5], 0.5);
      }
    }
  });
}

/** Box frame: dark outline + frame band (lit top/left, darker bottom/right) + shadow inside. */
function boxFrame(t: TexImage, seed: string, w: BoxWood): void {
  const r = rng(seed, 5);
  const [outline, dark, body, lit] = w.frame;
  const grain = fbm(r, [[4, 1, 0.6], [2, 1, 0.4]], 0.3, N, 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = edgeDist(x, y);
      if (e === 0) setPx(t, x, y, r.chance(0.12) ? dark : outline);
      else if (e === 1) {
        const tl = y === 1 || x === 1;
        const br = y === 14 || x === 14;
        // which frame piece (top, left, bottom, right) and position along it
        const side = y === 1 ? 0 : x === 1 ? 1 : y === 14 ? 2 : 3;
        const g = grain[side * N + (side % 2 ? y : x)];
        let c = tl && !br ? lit : br && !tl ? dark : body;
        if (g < 0.3) c = tl ? body : dark;
        else if (g > 0.78) c = tl ? mixC(lit, 0xa0694a, 0.35) : body;
        setPx(t, x, y, c);
      }
    }
  // mitred corner joints
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) setPx(t, x, y, dark);
  // shadow cast by the frame onto the boards (top/left inner edge)
  for (let i = 2; i < 14; i++) {
    tint(t, i, 2, dark, 0.45);
    tint(t, 2, i, dark, 0.35);
  }
}

export function noteBlock(): TexImage {
  const t = img();
  boards(t, 'note_block', NOTE_WOOD.wood, 2, 13, [[2, 4], [6, 8], [10, 12]], [[9], [4], [11]]);
  boxFrame(t, 'note_block', NOTE_WOOD);
  return t;
}

export function jukeboxSide(): TexImage {
  const t = img();
  boards(t, 'jukebox_side', JUKE_WOOD.wood, 2, 13, [[2, 4], [6, 8], [10, 12]], [[6], [10], [4]]);
  boxFrame(t, 'jukebox_side', JUKE_WOOD);
  return t;
}

export function jukeboxTop(): TexImage {
  const t = img();
  const w = JUKE_WOOD.wood;
  boards(t, 'jukebox_top', w, 2, 13, [[2, 4], [6, 8], [10, 12]], [[10], [], [5]]);
  boxFrame(t, 'jukebox_top', JUKE_WOOD);
  // disc slot: dark recess with a shaded upper rim and a lit lower lip
  for (let x = 3; x <= 12; x++) {
    tint(t, x, 6, JUKE_WOOD.frame[0], 0.5);
    setPx(t, x, 7, x === 3 ? 0x1c100a : 0x110906);
    setPx(t, x, 8, x === 12 ? 0x2e1a10 : 0x1f120b);
    setPx(t, x, 9, mixC(w[5], 0xb07a58, 0.3));
  }
  setPx(t, 2, 7, JUKE_WOOD.frame[1]);
  setPx(t, 2, 8, JUKE_WOOD.frame[1]);
  setPx(t, 13, 7, w[4]);
  setPx(t, 13, 8, w[5]);
  return t;
}

// ---------------------------------------------------------------------------
// Target: red / off-white bullseye over hay

const STRAW = [0x8c6a12, 0xa9861a, 0xbf9b24, 0xd1ae30, 0xe0c141, 0xecd25a];
const TGT_RED = [0x9a1c15, 0xb3241c, 0xc92e24, 0xda3b2f];
const TGT_WHITE = [0xd3cab8, 0xe2dccf, 0xece8df, 0xf7f5ef];

function target(top: boolean): TexImage {
  const r = rng(top ? 'target_top' : 'target_side');
  // straw: vertical fibres on the side, cut ends (speckle) on top
  const f = top ? fbm(r, [[4, 4, 0.3], [2, 2, 0.4]], 0.7) : fbm(r, [[2, 16, 0.5], [1, 8, 0.3]], 0.35);
  const tones = quantize(f, [0.6, 1.5, 3, 3, 1.5, 0.5]);
  const t = paint(tones, STRAW);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const band = d < 1.6 ? 0 : d < 3.25 ? 1 : d < 4.85 ? 2 : d < 6.45 ? 3 : d < 8.0 ? 4 : -1;
      if (band < 0) continue;
      // paint keeps a little of the straw grain underneath
      const s = tones[y * N + x];
      const k = s <= 1 ? 0 : s >= 5 ? 3 : s >= 3 ? 2 : 1;
      setPx(t, x, y, band % 2 === 0 ? TGT_RED[k] : TGT_WHITE[k]);
    }
  return t;
}

export const targetSide = (): TexImage => target(false);
export const targetTop = (): TexImage => target(true);

// ---------------------------------------------------------------------------
// Honey block: translucent amber with an opaque border

function honey(side: boolean): TexImage {
  const r = rng(side ? 'honey_block_side' : 'honey_block_top');
  const t = img();
  const tones = quantize(fbm(r, [[16, 16, 0.3], [8, 8, 0.45], [4, 4, 0.25]], 0.12), [1.2, 4, 3, 0.8]);
  const inner = side ? [0xea9420, 0xf3a52a, 0xf8b536, 0xfcc84f] : [0xf3a92c, 0xf9b939, 0xfcc84c, 0xfed866];
  const border = side ? [0xb35d0c, 0xc46c12] : [0xd98619, 0xe6961f];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = edgeDist(x, y);
      let k = tones[y * N + x];
      if (e === 0) setPx(t, x, y, border[k > 1 ? 1 : 0]);
      else if (e === 1) setPx(t, x, y, side ? mixC(inner[0], border[1], 0.45) : mixC(inner[3], 0xffe38f, 0.3), side ? 236 : 230);
      else {
        if (side && y >= 11 && k > 0 && r.chance(0.5)) k--; // a touch deeper toward the bottom
        setPx(t, x, y, inner[k], 210 + k * 6);
      }
    }
  // glossy highlight near the top-left, a few small bubbles
  const hi = side ? 0xfddc85 : 0xffe9a8;
  for (const [x, y] of [[3, 2], [4, 2], [5, 2], [2, 3], [3, 3], [2, 4]]) setPx(t, x, y, hi, 232);
  for (const [x, y] of [[11, 12], [12, 11]]) setPx(t, x, y, inner[3], 228);
  for (let k = 0; k < 3; k++) {
    const x = 5 + r.nextInt(7), y = 5 + r.nextInt(7);
    setPx(t, x, y, hi, 228);
  }
  return t;
}

export const honeyBlockTop = (): TexImage => honey(false);
export const honeyBlockSide = (): TexImage => honey(true);

// ---------------------------------------------------------------------------
// Bee nest: pale straw layers with brown seams

const BEE = [0x4b2c0f, 0x70451a, 0x986626, 0xbc8833, 0xd8a941, 0xe7c55a, 0xf3d874];

function beeLayers(seed: string): Int32Array {
  const r = rng(seed);
  const f = fbm(r, [[8, 1, 0.5], [4, 1, 0.3], [16, 2, 0.2]], 0.2);
  const g = quantize(f, [1, 4, 1.2]); // 0 darker fibre, 1 plain, 2 lighter fibre
  const tones = new Int32Array(N * N);
  // layers of papery straw: lit row under each seam, plain body, shaded row above the next seam
  const seams = [0, 4, 8, 12];
  const wob = seams.map(() => fbm(r, [[4, 1, 1]], 0.15, N, 1));
  for (let x = 0; x < N; x++) {
    const shift = seams.map((_, s) => (s === 0 ? 0 : wob[s][x] > 0.8 ? 1 : wob[s][x] < 0.15 ? -1 : 0));
    for (let y = 0; y < N; y++) {
      const gg = g[y * N + x];
      tones[y * N + x] = gg === 0 ? 4 : gg === 2 ? 6 : 5;
    }
    seams.forEach((y0, s) => {
      const y = y0 + shift[s];
      tones[idx(x, y)] = s === 0 ? (r.chance(0.3) ? 3 : 2) : r.chance(0.08) ? 3 : r.chance(0.08) ? 1 : 2;
      tones[idx(x, y + 1)] = r.chance(0.8) ? 6 : 5;
      if (tones[idx(x, y - 1)] > 4) tones[idx(x, y - 1)] = r.chance(0.7) ? 4 : 5;
    });
    tones[idx(x, 15)] = r.chance(0.25) ? 0 : 1; // bottom rim
    tones[idx(x, 14)] = Math.min(tones[idx(x, 14)], 4);
  }
  return tones;
}

export function beeNestSide(): TexImage {
  return paint(beeLayers('bee_nest_side'), BEE);
}

export function beeNestFront(): TexImage {
  const tones = beeLayers('bee_nest_front');
  // entrance hole (dark), lit lower-right inner wall, dark lip around it
  const hole = ['.####.', '######', '######', '.####.'];
  const ox = 5, oy = 6;
  const inHole = (x: number, y: number) => hole[y - oy]?.[x - ox] === '#';
  for (let y = oy - 1; y <= oy + hole.length; y++)
    for (let x = ox - 1; x <= ox + hole[0].length; x++) {
      if (inHole(x, y)) continue;
      const near = inHole(x + 1, y) || inHole(x - 1, y) || inHole(x, y + 1) || inHole(x, y - 1);
      if (near) tones[idx(x, y)] = inHole(x, y - 1) ? 3 : 1;
    }
  const t = paint(tones, BEE);
  hole.forEach((row, yy) =>
    [...row].forEach((ch, xx) => {
      if (ch !== '#') return;
      const x = ox + xx, y = oy + yy;
      const sh = !inHole(x, y - 1) || !inHole(x - 1, y);
      const lit = !inHole(x, y + 1) || !inHole(x + 1, y);
      setPx(t, x, y, sh ? 0x160c04 : lit ? 0x3a220b : 0x221407);
    }),
  );
  return t;
}

export function beeNestTop(): TexImage {
  const r = rng('bee_nest_top');
  const nz = fbm(r, [[8, 8, 0.6], [4, 4, 0.4]]);
  const tones = new Int32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const e = edgeDist(x, y);
      if (e === 0) {
        tones[i] = r.chance(0.3) ? 1 : 2;
        continue;
      }
      const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
      const d = Math.pow(Math.pow(dx, 2.6) + Math.pow(dy, 2.6), 1 / 2.6) + (nz[i] - 0.5) * 0.7;
      let k: number;
      if (d < 1.3) k = 3;
      else {
        const ph = (d - 1.3) / 2.1, fr = ph - Math.floor(ph);
        k = fr < 0.3 ? 2 : fr < 0.5 ? 4 : fr < 0.82 ? 6 : 5;
      }
      if (e === 1) k = Math.min(k, 4);
      tones[i] = k;
    }
  return paint(tones, BEE);
}

// ---------------------------------------------------------------------------
// Chiseled bookshelf (oak): framed planks; front with 2x3 book slots

const OAK = WOOD.oak;
const CB = { edge: 0x5b4428, dark: 0x735a37, mid: 0x8e7144, light: 0x9e7f4c, hi: 0xc9a56c, back: 0x3b2a17 };

function cbFrame(t: TexImage): void {
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, CB.mid);
    setPx(t, 0, i, CB.dark);
    setPx(t, i, 15, CB.edge);
    setPx(t, 15, i, CB.edge);
  }
  for (let i = 1; i < 15; i++) {
    tint(t, i, 1, CB.hi, 0.3);
    tint(t, 1, i, CB.hi, 0.2);
    tint(t, i, 14, CB.edge, 0.3);
    tint(t, 14, i, CB.edge, 0.3);
  }
}

export function chiseledBookshelfTop(): TexImage {
  const t = planks('chiseled_bookshelf_top', OAK);
  cbFrame(t);
  return t;
}

export function chiseledBookshelfSide(): TexImage {
  const t = planks('chiseled_bookshelf_side', OAK);
  cbFrame(t);
  for (let x = 1; x < 15; x++) {
    setPx(t, x, 7, CB.dark);
    setPx(t, x, 8, CB.light);
  }
  return t;
}

const BOOKS: number[][] = [
  [0x7e2216, 0xa3301f, 0xc04632],
  [0x24457e, 0x335c9e, 0x4a78bd],
  [0x33682a, 0x438434, 0x5aa044],
  [0x7a5518, 0x9c7224, 0xbb8d35],
  [0x55296a, 0x6d3886, 0x874ba3],
  [0x8a7a56, 0xab9b70, 0xc9ba8c],
  [0x246868, 0x338585, 0x46a0a0],
  [0x68251f, 0x843330, 0xa04642],
];

export function chiseledBookshelfOccupied(): TexImage {
  const t = planks('chiseled_bookshelf_occupied', OAK);
  const r = rng('chiseled_bookshelf_occupied');
  const splits = [[1, 2, 1], [2, 1, 1], [1, 1, 2], [2, 2], [1, 1, 1, 1], [1, 2, 1]];
  const order = [0, 1, 6, 3, 2, 4, 7, 5, 1, 0, 3, 6, 4, 2, 5, 7, 0, 6, 1, 3, 2, 4];
  let bk = r.nextInt(order.length);
  for (const y0 of [1, 9])
    for (const x0 of [1, 6, 11]) {
      const y1 = y0 + 5;
      for (let y = y0; y <= y1; y++) for (let x = x0; x < x0 + 4; x++) setPx(t, x, y, CB.back);
      let x = x0;
      for (const w of splits[r.nextInt(splits.length)]) {
        const b = BOOKS[order[bk++ % order.length]];
        const top = y0 + (r.chance(0.45) ? 1 : 0);
        const band = w === 2 && r.chance(0.4);
        for (let i = 0; i < w; i++, x++)
          for (let y = top; y <= y1; y++) {
            let c = w === 2 && i === 1 ? b[0] : b[1];
            if (y === top) c = b[2];
            else if (y === y1) c = b[0];
            else if (band && y === top + 2) c = i === 0 ? 0xd8b04a : 0xa8862f; // gilt band
            else if (w === 1 && y === top + 2 && r.chance(0.5)) c = b[2];
            setPx(t, x, y, c);
          }
      }
    }
  // frame, shelf and dividers
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, CB.mid);
    setPx(t, i, 7, CB.light);
    setPx(t, i, 8, CB.dark);
    setPx(t, i, 15, CB.edge);
  }
  for (let y = 0; y < N; y++) {
    setPx(t, 0, y, y === 15 ? CB.edge : CB.dark);
    setPx(t, 15, y, CB.edge);
    if (y !== 0 && y !== 7 && y !== 8 && y !== 15) {
      setPx(t, 5, y, CB.mid);
      setPx(t, 10, y, CB.mid);
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Crafter: dark gray machine; crafting grid on top, redstone port on the sides,
// a grated 3x3 mouth in front

const CRAFTER = [0x2c2c30, 0x37373c, 0x424247, 0x4c4c51, 0x56565b, 0x616166, 0x6f6f74];
const CR_HI = 0x86868b, CR_EDGE = 0x1d1d21;
const REDSTONE = [0x5a0a05, 0x8c1209, 0xbf1d0f, 0xeb2f1c, 0xff6b52];
const COPPER = [0x6e3a24, 0x8f4b30, 0xb4653e, 0xd08056, 0xeda98c];

function crafterBase(seed: string): TexImage {
  const t = speckled(seed, CRAFTER, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 0.6, 2.5, 5, 2.5, 0.6, 0], mode: 1, dark: 6, darkSize: [1, 3], light: 4, lightSize: [1, 2] });
  ring(t, 0, CR_HI, CR_EDGE, CRAFTER[3]);
  return t;
}

export function crafterTop(): TexImage {
  const t = crafterBase('crafter_top');
  for (let i = 1; i < 15; i++)
    for (const g of [5, 10]) {
      setPx(t, i, g, CRAFTER[5]);
      setPx(t, g, i, CRAFTER[5]);
    }
  for (const g of [5, 10]) for (const h of [5, 10]) setPx(t, g, h, CRAFTER[6]);
  for (const y0 of [1, 6, 11]) for (const x0 of [1, 6, 11]) recess(t, 'crafter_top', x0, y0, x0 + 3, y0 + 3, [0x232327, 0x27272b], 0x19191c, 0x48484d);
  return t;
}

export function crafterNorth(): TexImage {
  const t = crafterBase('crafter_north');
  ringMix(t, 1, CR_HI, 0.25, CR_EDGE, 0.3);
  recess(t, 'crafter_north', 3, 3, 12, 12, [0x2a2a2e, 0x2e2e32], 0x1d1d21, 0x5b5b60);
  for (let i = 4; i <= 11; i++)
    for (const g of [6, 9]) {
      setPx(t, i, g, 0x3e3e43);
      setPx(t, g, i, 0x3e3e43);
    }
  for (const y of [4, 7, 10])
    for (const x of [4, 7, 10]) {
      setPx(t, x, y, 0x0c0c0e);
      setPx(t, x + 1, y, 0x121214);
      setPx(t, x, y + 1, 0x121214);
      setPx(t, x + 1, y + 1, 0x1a1a1d);
    }
  return t;
}

export function crafterSide(): TexImage {
  const t = crafterBase('crafter_side');
  ringMix(t, 1, CR_HI, 0.25, CR_EDGE, 0.3);
  // redstone wire in a groove across the middle
  for (let x = 1; x < 15; x++) {
    setPx(t, x, 6, CR_EDGE);
    setPx(t, x, 7, x % 5 === 2 ? REDSTONE[4] : REDSTONE[3]);
    setPx(t, x, 8, x % 3 === 0 ? REDSTONE[1] : REDSTONE[2]);
    setPx(t, x, 9, CRAFTER[5]);
  }
  // copper port plate in the centre with a lit redstone core
  for (let y = 4; y <= 11; y++)
    for (let x = 5; x <= 10; x++) {
      let c = COPPER[2];
      if (y === 4 || x === 5) c = COPPER[3];
      if (y === 4 && x === 5) c = COPPER[4];
      if (y === 11 || x === 10) c = COPPER[1];
      if (y === 11 && x === 10) c = COPPER[0];
      setPx(t, x, y, c);
    }
  for (const [x, y, c] of [[7, 6, REDSTONE[1]], [8, 6, REDSTONE[1]], [7, 7, REDSTONE[4]], [8, 7, REDSTONE[3]], [7, 8, REDSTONE[3]], [8, 8, REDSTONE[2]], [7, 9, COPPER[3]], [8, 9, COPPER[3]]] as const)
    setPx(t, x, y, c);
  // shadow the plate throws on the lower right
  for (let y = 5; y <= 12; y++) tint(t, 11, y, CR_EDGE, 0.35);
  for (let x = 6; x <= 11; x++) tint(t, x, 12, CR_EDGE, 0.35);
  return t;
}

// ---------------------------------------------------------------------------
// Chiseled tuff (palette = tuff)

const TUFF = [0x4c4e46, 0x575951, 0x62645b, 0x6b6d65, 0x76786f, 0x82847a, 0x919389];

function tuffBase(seed: string): TexImage {
  return speckled(seed, TUFF, { oct: [[4, 4, 0.4], [2, 2, 0.35]], white: 0.3, weights: [0, 0.5, 2.5, 5, 2.5, 0.5, 0], mode: 1, dark: 5, darkSize: [1, 2], light: 3, lightSize: [1, 2], darkTone: 2, lightTone: 4 });
}

export function chiseledTuff(): TexImage {
  const t = tuffBase('chiseled_tuff');
  const [d0, d1, , , , l5, l6] = TUFF;
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, l6);
    tint(t, x, 1, l5, 0.4);
    setPx(t, x, 3, d1);
    setPx(t, x, 4, d0);
    setPx(t, x, 5, l5);
    setPx(t, x, 10, d1);
    setPx(t, x, 11, d0);
    setPx(t, x, 12, l5);
    tint(t, x, 14, d1, 0.4);
    setPx(t, x, 15, d0);
  }
  // carved panel in the middle band
  for (let y = 6; y <= 9; y++)
    for (let x = 2; x <= 13; x++) {
      if (y === 6 || x === 2) setPx(t, x, y, d1);
      else if (y === 9 || x === 13) setPx(t, x, y, l5);
      else tint(t, x, y, d1, 0.35);
    }
  for (let y = 0; y < N; y++) {
    tint(t, 0, y, l6, 0.35);
    tint(t, 15, y, d0, 0.4);
  }
  return t;
}

export function chiseledTuffTop(): TexImage {
  const t = tuffBase('chiseled_tuff_top');
  const [d0, d1, , m3, m4, l5, l6] = TUFF;
  ring(t, 0, l6, d0, m3);
  ringMix(t, 1, l5, 0.3, d1, 0.3);
  ring(t, 3, d0, d1, d0); // carved groove
  ring(t, 4, l5, d1, m4); // inner square, raised
  for (let y = 5; y <= 10; y++) for (let x = 5; x <= 10; x++) setPx(t, x, y, (x + y) % 5 === 0 ? TUFF[2] : m3);
  // small sunk centre
  for (const [x, y, c] of [[7, 7, d0], [8, 7, d1], [7, 8, d1], [8, 8, m4]] as const) setPx(t, x, y, c);
  return t;
}

// ---------------------------------------------------------------------------
// Oxidized copper bulb (unlit): patina frame around a dark glass bulb

const OXI = [0x2c5c4c, 0x387261, 0x438672, 0x4f9a81, 0x5bab8e, 0x6bbe9e, 0x89d5b8];
const BULB = [0x171512, 0x1f1c18, 0x29241f, 0x352f28, 0x433a31, 0x5a4e41, 0x6f6150];

export function oxidizedCopperBulb(): TexImage {
  const r = rng('oxidized_copper_bulb');
  const tones = quantize(fbm(r, [[4, 4, 0.4], [2, 2, 0.4]], 0.4), [1, 3, 5, 3, 1]).map((k) => k + 1);
  const t = paint(tones, OXI);
  ring(t, 0, OXI[5], OXI[0], OXI[3]);
  ringMix(t, 1, OXI[6], 0.25, OXI[0], 0.25);
  ring(t, 2, OXI[1], OXI[5], OXI[3]);
  // dark lamp window with an unlit glass bulb in it
  for (let y = 3; y <= 12; y++)
    for (let x = 3; x <= 12; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      let k = x === 3 || y === 3 ? 0 : 1;
      if (d < 3.2) k = d > 2.5 ? (x + y < 15 ? 4 : 2) : 3;
      setPx(t, x, y, BULB[k]);
    }
  // glass highlight + dim filament
  for (const [x, y, k] of [[6, 6, 6], [7, 6, 5], [6, 7, 5], [8, 8, 4], [9, 8, 2], [8, 9, 2]] as const) setPx(t, x, y, BULB[k]);
  return t;
}

// ---------------------------------------------------------------------------
// Verdant froglight: pale glowing cream with green veining

const VERDANT = [0x5c9a68, 0x78b277, 0x97c88c, 0xb6dba5, 0xd0e8be, 0xe6f2d6, 0xf6fae9];

export function verdantFroglightSide(): TexImage {
  const r = rng('verdant_froglight_side');
  const tones = new Int32Array(N * N);
  const prof = [1, 4, 6, 4];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let k = prof[x % 4];
      if (k > 2 && r.chance(0.18)) k--;
      if (k === 1 && r.chance(0.2)) k = 2;
      tones[y * N + x] = k;
    }
  // bumps: short dimmer segments along the stripes
  for (let k = 0; k < 7; k++) {
    const x = 4 * r.nextInt(4) + 2, y = r.nextInt(N);
    tones[idx(x, y)] = 4;
    tones[idx(x, y + 1)] = 3;
  }
  for (let x = 0; x < N; x++) {
    tones[idx(x, 0)] = Math.min(tones[idx(x, 0)], 3);
    tones[idx(x, 15)] = Math.min(tones[idx(x, 15)], 2);
  }
  return paint(tones, VERDANT);
}

export function verdantFroglightTop(): TexImage {
  const r = rng('verdant_froglight_top');
  const nz = fbm(r, [[8, 8, 0.6], [4, 4, 0.4]]);
  const tones = new Int32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
      const d = Math.pow(Math.pow(dx, 4) + Math.pow(dy, 4), 0.25) + (nz[i] - 0.5) * 0.8;
      const ph = d / 2.4, fr = ph - Math.floor(ph);
      let k = d < 1.2 ? 6 : fr < 0.3 ? 2 : fr < 0.55 ? 5 : fr < 0.8 ? 4 : 3;
      if (edgeDist(x, y) === 0) k = Math.min(k, 2);
      if (k > 2 && r.chance(0.12)) k--;
      tones[i] = k;
    }
  return paint(tones, VERDANT);
}
