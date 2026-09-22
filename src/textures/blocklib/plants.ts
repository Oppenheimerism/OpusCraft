// Plant sprites (transparent background): grass, ferns, flowers, saplings,
// crops, cactus, pumpkin/melon, water plants, torch, ladder, cobweb...

import { TexImage, img, setPx, plot, cloneImg, mixC } from '../tex';
import { N, rng, wrap, cluster } from './core';

/** Draw a character map (rows) with a colour key; '.' and ' ' are transparent/skip. */
export function sprite(rows: string[], key: Record<string, number>, t: TexImage = img(), ox = 0, oy = 0): TexImage {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = key[ch];
      if (c === undefined) return;
      plot(t, ox + x, oy + y, c);
    }),
  );
  return t;
}

// ---------------------------------------------------------------------------
// Grass & ferns (grayscale, biome tinted)

export const PLANT_GRAYS = [0x5a5a5a, 0x6c6c6c, 0x7e7e7e, 0x909090, 0xa3a3a3, 0xb6b6b6, 0xc9c9c9];

interface BladeOpts {
  count: number;
  hmin: number;
  hmax: number;
  x0?: number;
  x1?: number;
  pal?: number[];
  baseY?: number;
  curl?: number;
}

/** Tuft of 1px blades fanning out from the bottom; each blade has its own tone, tips lighter. */
export function blades(seed: string, o: BladeOpts, t: TexImage = img()): TexImage {
  const r = rng(seed);
  const pal = o.pal ?? PLANT_GRAYS;
  const K = pal.length;
  const x0 = o.x0 ?? 1, x1 = o.x1 ?? 14;
  const by = o.baseY ?? 15;
  const fan = o.curl ?? 1;
  const list: { bx: number; tx: number; h: number; shade: number }[] = [];
  for (let b = 0; b < o.count; b++) {
    const bx = x0 + ((b + 0.5) / o.count) * (x1 - x0) + (r.next() - 0.5) * 1.6;
    const mid = 1 - Math.abs((bx - 7.5) / 8);
    const h = Math.round(o.hmin + (o.hmax - o.hmin) * Math.min(1, r.next() * 0.65 + mid * 0.55));
    let dx = ((bx - 7.5) * 0.35 + (r.next() - 0.5) * 3) * fan * (h / 12);
    dx = Math.max(-h * 0.3, Math.min(h * 0.3, dx));
    list.push({ bx, tx: bx + dx, h, shade: 2 + r.nextInt(4) });
  }
  list.sort((a, b) => a.shade - b.shade);
  for (const bl of list) {
    for (let k = 0; k < bl.h; k++) {
      const f = k / Math.max(1, bl.h - 1);
      // ease: blades stay upright near the base and bend toward the tip
      const x = Math.round(bl.bx + (bl.tx - bl.bx) * f * f);
      const tone = bl.shade + (f > 0.7 ? 1 : 0) - (k < 2 ? 1 : 0);
      plot(t, x, by - k, pal[Math.max(0, Math.min(K - 1, tone))]);
    }
  }
  return t;
}

/** Fern: feather-shaped fronds fanning out from the bottom centre. */
export function fern(seed: string, o: { fronds?: number; h?: number; spread?: number; baseY?: number; pal?: number[] } = {}): TexImage {
  const r = rng(seed);
  const pal = o.pal ?? PLANT_GRAYS;
  const t = img();
  const H = o.h ?? 13;
  const by = o.baseY ?? 15;
  const sp = o.spread ?? 1;
  const defs = [
    { ang: -0.95 * sp, len: H * 0.6 },
    { ang: 0.95 * sp, len: H * 0.62 },
    { ang: -0.42 * sp, len: H * 0.88 },
    { ang: 0.45 * sp, len: H * 0.85 },
    { ang: 0.04, len: H },
  ].slice(5 - (o.fronds ?? 5));
  for (const { ang, len } of defs) {
    const a = ang + (r.next() - 0.5) * 0.12;
    const L = Math.round(len);
    const pts: [number, number][] = [];
    for (let k = 0; k <= L; k++) {
      const f = k / L;
      const bendA = a * (1 + f * 0.6); // droop outward toward the tip
      const x = 7.5 + Math.sin(bendA) * k * 0.95;
      const y = by + 0.4 - Math.cos(bendA) * k;
      pts.push([Math.round(x - 0.5), Math.round(y)]);
    }
    const dirX = Math.sin(a) >= 0 ? 1 : -1;
    pts.forEach(([x, y], k) => {
      const f = k / L;
      // leaflets: widest in the middle of the frond
      const w = Math.round(Math.sin(Math.PI * Math.min(1, f * 1.1)) * 2.4);
      if (k >= 1 && k % 2 === (L % 2)) {
        for (let s = 1; s <= w; s++) {
          plot(t, x - s, y - (s === w && w > 1 ? 1 : 0), pal[dirX < 0 ? 4 : 3]);
          plot(t, x + s, y - (s === w && w > 1 ? 1 : 0), pal[dirX > 0 ? 4 : 3]);
        }
      }
    });
    pts.forEach(([x, y], k) => plot(t, x, y, pal[k === pts.length - 1 ? 5 : k < 3 ? 2 : 3]));
  }
  return t;
}

// ---------------------------------------------------------------------------
// Flowers

const STEM = 0x3f7a26, STEM_D = 0x2f5f1c, LEAF = 0x4f9131, LEAF_L = 0x66aa3c, LEAF_D = 0x356e20;
const G: Record<string, number> = { g: STEM, G: STEM_D, l: LEAF, L: LEAF_L, d: LEAF_D };

const FLOWERS: Record<string, { rows: string[]; key: Record<string, number> }> = {
  dandelion: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '......yWy.......',
      '.....yYWYy......',
      '.....YYYYo......',
      '......oYo.......',
      '.......g........',
      '.......g.L......',
      '...Ll..gLl......',
      '....ll.gl.......',
      '.....llgd.......',
      '......dg........',
      '.......g........',
    ],
    key: { ...G, Y: 0xffd92b, y: 0xf2b812, W: 0xfff38a, o: 0xc98d0c },
  },
  poppy: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '.....rR..Rr.....',
      '....rRRRRRRr....',
      '....RRRkkRRR....',
      '....rRRkkRRr....',
      '.....DRRRRD.....',
      '.......gd.......',
      '.......g........',
      '..Ll...g...lL...',
      '...ll..g..ll....',
      '....ldgg.ld.....',
      '......ggdd......',
      '.......g........',
    ],
    key: { ...G, R: 0xe8262a, r: 0xff5a52, D: 0xa81418, k: 0x2b1409 },
  },
  blue_orchid: {
    rows: [
      '................',
      '................',
      '.....bb.........',
      '....bBWb...bb...',
      '....bBBb..bBWb..',
      '.....bD...bBBb..',
      '......g....bD...',
      '..bb...g...g....',
      '.bBWb..g..g.....',
      '.bBBb..g.g......',
      '..bDg..gg.......',
      '....g.gg.L......',
      '.....ggLl.......',
      '....lLgd........',
      '.......g........',
      '.......g........',
    ],
    key: { ...G, B: 0x2aa9e8, b: 0x5cc8f5, W: 0xc6f0ff, D: 0x1a6fb0 },
  },
  allium: {
    rows: [
      '................',
      '.....pPpP.......',
      '....pPHPPp......',
      '...pPHPPPPp.....',
      '...PPPPPPPD.....',
      '...pPPPPPDp.....',
      '....pPPPDp......',
      '.....pDDp.......',
      '.......g........',
      '.......g........',
      '.......g..L.....',
      '..Ll...g.ll.....',
      '...ll..gl.......',
      '....lldg........',
      '......dg........',
      '.......g........',
    ],
    key: { ...G, P: 0xb15fd8, p: 0xcb86ec, H: 0xe7bff8, D: 0x7e3aa8 },
  },
  azure_bluet: {
    rows: [
      '................',
      '................',
      '................',
      '..........w.....',
      '....w....wyw....',
      '...wyw....w.....',
      '....w..w..g.....',
      '....g.wyw.g.....',
      '....g..w.g..w...',
      '.....g.g.g.wyw..',
      '.....g.g.g..g...',
      '......ggg.gg....',
      '......gggg......',
      '.....Llggl......',
      '....l.dg..l.....',
      '.......g........',
    ],
    key: { ...G, w: 0xeef3f5, y: 0xe9cf3a },
  },
  oxeye_daisy: {
    rows: [
      '................',
      '................',
      '......w.w.......',
      '....w.www.w.....',
      '.....wwwww......',
      '....wwyyyww.....',
      '...wwwyYywww....',
      '....wwyyyws.....',
      '.....wwwws......',
      '....w.wsw.s.....',
      '.......g........',
      '..Ll...g...l....',
      '...ll..g..lL....',
      '....lddg.ll.....',
      '......gdd.......',
      '.......g........',
    ],
    key: { ...G, w: 0xf4f4f4, s: 0xc9ccd0, y: 0xf0bb1a, Y: 0xc48a0e },
  },
  cornflower: {
    rows: [
      '................',
      '................',
      '................',
      '.....b...b......',
      '....bBb.bBb.....',
      '.....BBBBB......',
      '....bBDDDBb.....',
      '.....BDDDB......',
      '......BBB.......',
      '.......g........',
      '.......g........',
      '..L....g...L....',
      '...ll..g..ll....',
      '....lldg.ll.....',
      '......dgg.......',
      '.......g........',
    ],
    key: { ...G, B: 0x4668e0, b: 0x7a95f2, D: 0x2a3b9c },
  },
  lily_of_the_valley: {
    rows: [
      '................',
      '................',
      '.......ggg......',
      '......g...g.....',
      '.....W.....g....',
      '....WWW....W....',
      '....wWw...WWW...',
      '......g...wWw...',
      '.....W....g.....',
      '....WWW..g......',
      '..L.wWwg.g..L...',
      '..ll...gg..ll...',
      '...lll.g..lll...',
      '....llggglll....',
      '.....ldggld.....',
      '.......g........',
    ],
    key: { ...G, W: 0xf8f8f2, w: 0xcfd4c8 },
  },
};

export function flower(name: string): TexImage {
  const f = FLOWERS[name];
  return sprite(f.rows, f.key);
}

const TULIP_ROWS = [
  '................',
  '................',
  '................',
  '.....A.B.A......',
  '.....AABAAC.....',
  '.....ABAAAC.....',
  '.....AAAAAC.....',
  '......ACAC......',
  '.......g........',
  '..L....g....L...',
  '..ll...g...ll...',
  '...ll..g..ll....',
  '....ll.g.ll.....',
  '.....lldgl......',
  '......dgd.......',
  '.......g........',
];

export function tulip(c1: number, c2: number, c3: number): TexImage {
  return sprite(TULIP_ROWS, { ...G, A: c1, B: c2, C: c3 });
}

export function brownMushroom(): TexImage {
  return sprite(
    [
      '.....bBBb.......',
      '....bBBBBb......',
      '....dbbbbd......',
      '......sS........',
      '......sS........',
      '......sS........',
    ],
    { B: 0xb08661, b: 0x916a4c, d: 0x6f4f38, s: 0xd9ccb4, S: 0xb3a38b },
    img(), 1, 10,
  );
}

export function redMushroom(): TexImage {
  return sprite(
    [
      '.....rRRr.......',
      '....rRWRRr......',
      '....RRRRWR......',
      '....rWRRRr......',
      '......sS........',
      '......sS........',
      '......sS........',
    ],
    { R: 0xe0231f, r: 0xb3141a, W: 0xf3ece4, s: 0xe3d8c6, S: 0xbdb09b },
    img(), 1, 9,
  );
}

// ---------------------------------------------------------------------------
// Tall flowers (not tinted)

export function bushBottom(seed: string, leaf: number[], flowers: number[], nFlowers: number): TexImage {
  const r = rng(seed);
  const t = img();
  // stems
  for (let s = 0; s < 5; s++) {
    let x = 3 + s * 2 + r.nextInt(2);
    for (let y = 15; y >= 0; y--) {
      plot(t, x, y, leaf[r.chance(0.5) ? 0 : 1]);
      if (r.chance(0.2)) x += r.nextBool() ? 1 : -1;
      x = Math.max(1, Math.min(14, x));
    }
  }
  // leaves
  for (let k = 0; k < 36; k++) {
    const x = 2 + r.nextInt(12), y = 2 + r.nextInt(14);
    const c = leaf[1 + r.nextInt(leaf.length - 1)];
    plot(t, x, y, c);
    if (r.chance(0.5)) plot(t, x + (r.nextBool() ? 1 : -1), y, c);
  }
  for (let k = 0; k < nFlowers; k++) {
    const x = 3 + r.nextInt(10), y = r.nextInt(5);
    plot(t, x, y, flowers[r.nextInt(flowers.length)]);
    plot(t, x + 1, y, flowers[r.nextInt(flowers.length)]);
  }
  return t;
}

export function bushTop(seed: string, leaf: number[], flowers: number[], o: { blobs?: number; cy?: number; spread?: number } = {}): TexImage {
  const r = rng(seed);
  const t = img();
  // stems up the middle
  for (let s = 0; s < 3; s++) {
    let x = 6 + s * 2;
    for (let y = 15; y >= 6; y--) {
      plot(t, x, y, leaf[r.chance(0.5) ? 0 : 1]);
      if (r.chance(0.25)) x += r.nextBool() ? 1 : -1;
    }
  }
  for (let k = 0; k < 10; k++) {
    const x = 3 + r.nextInt(10), y = 8 + r.nextInt(8);
    plot(t, x, y, leaf[1 + r.nextInt(leaf.length - 1)]);
  }
  // flower clusters: small blobs with light top-left
  const nb = o.blobs ?? 5;
  for (let b = 0; b < nb; b++) {
    const cx = 3 + r.nextInt(10), cy = (o.cy ?? 4) + r.nextInt(o.spread ?? 6);
    const pts = cluster(r, cx, cy, 5 + r.nextInt(5));
    const sums = pts.map(([x, y]) => x + y);
    const mn = Math.min(...sums), mx = Math.max(...sums);
    pts.forEach(([x, y], j) => {
      const s = sums[j];
      const c = s === mn ? flowers[2] : s >= mx - 1 ? flowers[0] : flowers[1];
      if (Math.abs(x - cx) < 4 && Math.abs(y - cy) < 4) plot(t, x, y, c);
    });
  }
  return t;
}

export function sunflowerFront(): TexImage {
  const t = img();
  const petal = [0xd99a0f, 0xf1c01b, 0xffdb33, 0xffea6e];
  const seedC = [0x3a2208, 0x4f2f0c, 0x6a4214];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const petalR = 6.6 + Math.cos(ang * 11) * 0.9;
      if (d < 3.4) plot(t, x, y, seedC[(x * 3 + y * 5) % 3 === 0 ? 2 : (x + y) % 2 ? 1 : 0]);
      else if (d < petalR) {
        const k = d < 4.4 ? 0 : d > petalR - 1 ? 1 : (Math.round((ang + Math.PI) * 11 / (Math.PI * 2)) % 2 ? 2 : 3);
        plot(t, x, y, petal[k]);
      }
    }
  return t;
}

export function sunflowerBack(): TexImage {
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const petalR = 6.6 + Math.cos(ang * 11) * 0.9;
      if (d < 4.6) plot(t, x, y, d < 1.5 ? 0x2f6419 : (x + y) % 3 === 0 ? 0x3b7a21 : 0x48892a);
      else if (d < petalR) plot(t, x, y, d > petalR - 1 ? 0xc7910e : 0xe2ae17);
    }
  return t;
}

export function sunflowerStalk(top: boolean): TexImage {
  const t = img();
  const c = [0x3a6f22, 0x4a8a2c, 0x5a9e35, 0x2d5a1a];
  for (let y = 0; y < N; y++) {
    plot(t, 7, y, c[1]);
    plot(t, 8, y, y % 3 === 0 ? c[3] : c[0]);
  }
  const leaves = top
    ? [[9, 9, 1], [5, 13, -1]]
    : [[9, 4, 1], [5, 9, -1], [9, 13, 1]];
  for (const [lx, ly, dir] of leaves) {
    for (let i = 0; i < 4; i++) {
      plot(t, lx + i * dir, ly - (i > 1 ? 1 : 0), c[2]);
      plot(t, lx + i * dir, ly + 1 - (i > 2 ? 1 : 0), c[0]);
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Saplings

export interface SaplingDef {
  leaf: number[]; // dark, mid, light, highlight
  trunk: number[]; // dark, light
  shape: 'round' | 'cone' | 'wide' | 'bushy';
}

export function sapling(seed: string, d: SaplingDef): TexImage {
  const r = rng(seed);
  const t = img();
  // trunk
  const top = d.shape === 'cone' ? 12 : 9;
  for (let y = top; y < N; y++) {
    plot(t, 7, y, d.trunk[1]);
    if (y > top + 2) plot(t, 8, y, d.trunk[0]);
  }
  const blob = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const dd = nx * nx + ny * ny;
        if (dd > 1 + (r.next() - 0.5) * 0.5) continue;
        const lit = -(nx + ny);
        const k = lit > 0.7 ? 3 : lit > 0.1 ? 2 : lit > -0.6 ? 1 : 0;
        if (r.chance(0.12)) continue;
        plot(t, x, y, d.leaf[Math.max(0, Math.min(3, k + (r.chance(0.15) ? -1 : 0)))]);
      }
  };
  switch (d.shape) {
    case 'round':
      blob(5.5, 7, 3, 2.6);
      blob(10, 6, 3, 2.8);
      blob(8, 3.5, 3, 2.4);
      break;
    case 'bushy':
      blob(5, 8, 3.2, 2.6);
      blob(10.5, 7.5, 3.2, 2.8);
      blob(7.5, 4, 3.6, 2.8);
      break;
    case 'wide':
      blob(4.5, 6, 3.5, 1.8);
      blob(11, 5, 3.5, 1.8);
      blob(8, 3, 3, 1.6);
      break;
    case 'cone':
      for (let tier = 0; tier < 4; tier++) blob(7.5, 3 + tier * 2.6, 1.6 + tier * 1.1, 1.3);
      break;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Cactus

export function cactusSide(): TexImage {
  const t = img();
  const cols = [0x0f5a1a, 0x137024, 0x198630, 0x239b3b, 0x33ad49];
  // vertical ridges pattern per column (x=1..14), columns 0 and 15 transparent
  const colTone = [0, 1, 3, 2, 1, 3, 4, 2, 1, 3, 2, 1, 3, 2, 1, 0];
  for (let y = 0; y < N; y++)
    for (let x = 1; x < 15; x++) {
      let k = colTone[x];
      if ((y + x * 3) % 7 === 0) k = Math.max(0, k - 1);
      setPx(t, x, y, cols[k]);
    }
  // spines: small light dots with dark base, on a staggered grid
  const spine = 0xc9c98f, spineD = 0x8c8a55;
  for (let y = 1; y < N; y += 4)
    for (const x of [3, 7, 11]) {
      const xx = x + ((y >> 2) % 2 ? 1 : 0);
      setPx(t, xx, y, spine);
      setPx(t, xx, y + 1, spineD);
    }
  return t;
}

export function cactusTop(): TexImage {
  const t = img();
  const c = [0x0f5a1a, 0x137024, 0x198630, 0x239b3b, 0x33ad49, 0x45bd5a];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      let k: number;
      if (e === 0) k = 1;
      else if (e === 1) k = 3;
      else if (e === 2) k = 2;
      else {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        k = d < 1.5 ? 5 : d < 3 ? 4 : 3;
      }
      setPx(t, x, y, c[k]);
    }
  for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11], [7, 2], [2, 8], [13, 7], [8, 13]]) setPx(t, x, y, 0xc9c98f);
  return t;
}

export function cactusBottom(): TexImage {
  const t = img();
  const c = [0x7a7a4c, 0x8a8a58, 0x999966, 0xa7a672, 0xb3b27e];
  const r = rng('cactus_bottom');
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      let k = e === 0 ? 0 : e === 1 ? 2 : 3;
      if (e > 1 && r.chance(0.2)) k = r.chance(0.5) ? 2 : 4;
      setPx(t, x, y, c[k]);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Pumpkin & melon

export function pumpkinSide(seed = 'pumpkin_side'): TexImage {
  const r = rng(seed);
  const t = img();
  const c = [0x8f4a06, 0xad5f0b, 0xc06f10, 0xcf8016, 0xdc9020, 0xe7a432];
  // ribs: dark grooves at x = 0, 5, 10 (and 15), bulges lit on their left
  const groove = [0, 5, 10, 15];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let k = 3;
      const dist = Math.min(...groove.map((g) => Math.abs(x - g)));
      if (dist === 0) k = 1;
      else if (groove.includes(x - 1)) k = 4;
      else if (groove.includes(x + 1)) k = 2;
      if (r.chance(0.12)) k += r.nextBool() ? 1 : -1;
      if (y === 0) k = Math.min(5, k + 1);
      if (y === 15) k = Math.max(0, k - 1);
      setPx(t, x, y, c[Math.max(0, Math.min(5, k))]);
    }
  return t;
}

export function pumpkinTop(): TexImage {
  const r = rng('pumpkin_top');
  const t = img();
  const c = [0x9e5207, 0xbf6a0c, 0xd17d12, 0xdf8f19, 0xe9a024, 0xf2b53a];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const ang = Math.atan2(dy, dx);
      const rib = Math.cos(ang * 8);
      let k = rib > 0.7 ? 2 : rib < -0.6 ? 4 : 3;
      const d = Math.hypot(dx, dy);
      if (d > 8.5) k -= 1;
      if (r.chance(0.1)) k += r.nextBool() ? 1 : -1;
      setPx(t, x, y, c[Math.max(0, Math.min(5, k))]);
    }
  // stem
  const s = [0x4a5a14, 0x5d7119, 0x758a26];
  for (const [x, y, k] of [[7, 6, 2], [8, 6, 1], [7, 7, 1], [8, 7, 0], [6, 7, 1], [9, 8, 0], [7, 8, 0], [8, 8, 0], [6, 6, 2]]) setPx(t, x, y, s[k]);
  return t;
}

export function carvedFace(base: TexImage, lit: boolean): TexImage {
  const t = cloneImg(base);
  const key: Record<string, number> = lit
    ? { k: 0xffd650, K: 0xf6a623, e: 0xfff39b }
    : { k: 0x2a1300, K: 0x4a2500, e: 0x3a1c00 };
  sprite(
    [
      '................',
      '................',
      '................',
      '...k.......k....',
      '..kkK.....kkK...',
      '.kkkkK...kkkkK..',
      '................',
      '................',
      '..k.kkkkkkk.k...',
      '..kkkkkkkkkkk...',
      '...kkkeekkkkK...',
      '...Kkk.kk.kkK...',
      '.....K....K.....',
      '................',
      '................',
      '................',
    ],
    key,
    t,
  );
  return t;
}

export function melonSide(): TexImage {
  const r = rng('melon_side');
  const t = img();
  const c = [0x4a6f12, 0x5b8317, 0x6c971d, 0x7ca824, 0x8ab52c, 0x9cc53b];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // wavy vertical stripes
      const s = (x + Math.round(Math.sin((y / N) * Math.PI * 2) * 1.2)) & 3;
      let k = s === 0 ? 1 : s === 1 ? 3 : s === 2 ? 4 : 2;
      if (r.chance(0.15)) k += r.nextBool() ? 1 : -1;
      setPx(t, x, y, c[Math.max(0, Math.min(5, k))]);
    }
  return t;
}

export function melonTop(): TexImage {
  const r = rng('melon_top');
  const t = img();
  const c = [0x4a6f12, 0x5b8317, 0x6c971d, 0x7ca824, 0x8ab52c, 0x9cc53b];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const ang = Math.atan2(dy, dx);
      const s = Math.cos(ang * 6 + Math.hypot(dx, dy) * 0.3);
      let k = s > 0.5 ? 4 : s < -0.5 ? 1 : 3;
      if (r.chance(0.12)) k += r.nextBool() ? 1 : -1;
      setPx(t, x, y, c[Math.max(0, Math.min(5, k))]);
    }
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) setPx(t, x, y, 0x4c5a1a);
  return t;
}

// ---------------------------------------------------------------------------
// Water plants & vines (lily pad / vine grayscale)

export function lilyPad(): TexImage {
  const t = img();
  const c = [0x5c5c5c, 0x6e6e6e, 0x808080, 0x939393, 0xa6a6a6];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      if (d > 7.4) continue;
      // notch toward bottom-right
      const ang = Math.atan2(dy, dx);
      if (d > 1.5 && Math.abs(ang - 0.55) < 0.28) continue;
      let k = d > 6.4 ? 1 : 2;
      // radial veins
      const vein = Math.abs(Math.sin(ang * 4)) < 0.18 && d > 1.5;
      if (vein) k = 3;
      if ((x * 7 + y * 13) % 11 === 0) k = Math.max(0, k - 1);
      if (d < 1.2) k = 4;
      setPx(t, x, y, c[k]);
    }
  return t;
}

export function vine(): TexImage {
  const r = rng('vine');
  const t = img();
  const pal = PLANT_GRAYS;
  const stems: number[][] = [];
  // wandering stems, vertically periodic
  for (let s = 0; s < 4; s++) {
    const x0 = s * 4 + r.nextInt(2);
    const p1 = r.next() * Math.PI * 2, a1 = 1 + r.next();
    const xs: number[] = [];
    for (let y = 0; y < N; y++) xs.push(wrap(Math.round(x0 + a1 * Math.sin((y / N) * Math.PI * 2 + p1))));
    stems.push(xs);
    xs.forEach((x, y) => plot(t, x, y, pal[1]));
  }
  // leaves: small lit blobs hanging off the stems, alternating sides
  for (const xs of stems) {
    for (let y = r.nextInt(2); y < N; y += 2 + r.nextInt(2)) {
      const side = r.nextBool() ? 1 : -1;
      const lx = xs[y] + side, ly = y;
      const shape: [number, number][] = r.chance(0.5)
        ? [[0, 0], [side, 0], [0, 1], [side, 1]]
        : [[0, 0], [side, 0], [side, 1], [side * 2, 0], [0, 1]];
      shape.forEach(([dx, dy], j) => {
        const x = wrap(lx + dx), yy = wrap(ly + dy);
        const lit = dy === 0 && (side > 0 ? dx === 0 : dx === 0);
        setPx(t, x, yy, pal[lit ? 5 : j === shape.length - 1 ? 2 : 4]);
      });
    }
  }
  return t;
}

export function seagrassTex(seed: string, h: [number, number], count: number): TexImage {
  return blades(seed, { count, hmin: h[0], hmax: h[1], pal: [0x1d5421, 0x236128, 0x2a6f2f, 0x327d37, 0x3b8b40, 0x46994a, 0x52a655], curl: 3 });
}

export function kelp(top: boolean): TexImage {
  const t = img();
  const c = [0x3b5e13, 0x4a7219, 0x5a8720, 0x6b9b29, 0x7caf33];
  for (let y = 0; y < N; y++) {
    if (top && y < 4) continue;
    const x = 7 + Math.round(Math.sin((y / N) * Math.PI * 2) * 1.3);
    plot(t, x, y, c[2]);
    plot(t, x + 1, y, c[1]);
    // alternating leaf fronds
    if (y % 4 === 1) {
      plot(t, x - 1, y, c[3]);
      plot(t, x - 2, y - 1, c[3]);
      plot(t, x - 3, y - 1, c[4]);
      plot(t, x - 2, y, c[2]);
    }
    if (y % 4 === 3) {
      plot(t, x + 2, y, c[3]);
      plot(t, x + 3, y - 1, c[3]);
      plot(t, x + 4, y - 1, c[4]);
      plot(t, x + 3, y, c[2]);
    }
  }
  if (top) {
    plot(t, 7, 3, c[4]);
    plot(t, 8, 2, c[3]);
    plot(t, 6, 2, c[3]);
  }
  return t;
}

export function berryBush(stage: number): TexImage {
  const r = rng('sweet_berry_bush' + stage);
  const t = img();
  const leaf = [0x24401f, 0x2e5227, 0x39622f, 0x467339, 0x538343];
  const h = [6, 10, 14, 14][stage];
  const w = [3, 5, 6.5, 7][stage];
  for (let k = 0; k < 40 + stage * 25; k++) {
    const x = Math.round(7.5 + (r.next() - 0.5) * 2 * w), y = 15 - r.nextInt(h);
    const lit = -(x - 7.5) / w * 0.3 + (15 - y) / h;
    const kk = Math.max(0, Math.min(4, Math.round(lit * 3 + r.next() * 1.5 - 0.5)));
    plot(t, x, y, leaf[kk]);
  }
  if (stage >= 2) {
    const berry = stage === 3 ? [0x8f0f2a, 0xc6203f, 0xf05a6e] : [0x5f7d2a, 0x7d9a38, 0x9cb54c];
    for (let i = 0; i < (stage === 3 ? 7 : 5); i++) {
      const x = 4 + r.nextInt(8), y = 15 - 2 - r.nextInt(h - 3);
      plot(t, x, y, berry[1]);
      plot(t, x + 1, y, berry[0]);
      plot(t, x, y - 1, berry[2]);
    }
  }
  return t;
}

export function wheat(stage: number): TexImage {
  const t = img();
  const green = [0x2f6b12, 0x3d8519, 0x4d9b22, 0x5fae2c];
  const straw = [0x8a7a1c, 0xa39125, 0xbba832, 0xd0bd45];
  const grain = [0x8c6a22, 0xae8a33, 0xcaa545, 0xe2c461, 0xf0d98a];
  const h = [2, 4, 5, 7, 9, 11, 13, 14][stage];
  const ripe = stage === 7;
  const cols = [1, 3, 5, 7, 8, 10, 12, 14];
  cols.forEach((x0, i) => {
    const hh = Math.max(1, h - (i % 3 === 1 ? 1 : 0) - (i % 4 === 2 ? 2 : 0));
    const lean = i % 2 ? 1 : -1;
    for (let k = 0; k < hh; k++) {
      const y = 15 - k;
      const x = x0 + (k > hh * 0.65 && stage > 3 ? lean : 0);
      const f = stage >= 5 ? (stage - 4) / 3 : 0;
      const c = mixC(green[(k + i) % 4], straw[(k + i) % 4], Math.min(1, f));
      plot(t, x, y, c);
    }
    if (ripe) {
      // grain head: 2px wide, 4-5 tall at the top of the stalk, with awns
      const top = 15 - hh + 1;
      const hx = x0 + lean;
      for (let k = 0; k < 5; k++) {
        const y = top + k;
        plot(t, hx, y, grain[k % 2 ? 2 : 3]);
        plot(t, hx + (lean > 0 ? -1 : 1), y, grain[k % 2 ? 1 : 2]);
      }
      plot(t, hx, top - 1, grain[4]);
      plot(t, hx + lean, top - 1, grain[1]);
    }
  });
  return t;
}

// ---------------------------------------------------------------------------
// Misc sprites

export function deadBush(): TexImage {
  const r = rng('dead_bush');
  const t = img();
  const c = [0x5a3c17, 0x6b4a1f, 0x7c5627, 0x946a32];
  const branch = (x: number, y: number, dx: number, len: number, depth: number) => {
    for (let i = 0; i < len; i++) {
      plot(t, x, y, c[Math.min(3, depth + (i % 2))]);
      y--;
      if (r.chance(0.55)) x += dx;
      if (depth < 2 && i > 1 && r.chance(0.3)) branch(x, y, r.nextBool() ? dx : -dx, Math.max(2, len - i - 2), depth + 1);
    }
  };
  branch(7, 15, -1, 10, 0);
  branch(8, 15, 1, 11, 0);
  branch(8, 14, 0, 6, 1);
  return t;
}

export function sugarCane(): TexImage {
  const t = img();
  const pal = [0x707070, 0x858585, 0x9a9a9a, 0xb0b0b0, 0xc6c6c6];
  const stalks = [[2, 3], [7, 0], [12, 5]];
  for (const [x0, ph] of stalks) {
    for (let y = 0; y < N; y++) {
      const node = (y + ph) % 6 === 0;
      plot(t, x0, y, node ? pal[4] : pal[3]);
      plot(t, x0 + 1, y, node ? pal[3] : pal[1]);
      if ((y + ph) % 6 === 1) plot(t, x0 + 1, y, pal[0]);
    }
  }
  // leaves peeling off stalks
  for (const [x, y, dir] of [[4, 5, 1], [5, 4, 1], [6, 11, -1], [5, 10, -1], [9, 2, 1], [10, 1, 1], [11, 9, -1], [10, 8, -1], [14, 13, 1], [15, 12, 1]])
    plot(t, x, y, pal[2 + (dir > 0 ? 0 : 1)]);
  return t;
}

export function torch(): TexImage {
  return sprite(
    [
      '.......wY.......',
      '.......YO.......',
      '.......Lb.......',
      '.......Lb.......',
      '.......lb.......',
      '.......Lb.......',
      '.......lB.......',
      '.......Lb.......',
      '.......lb.......',
      '.......lB.......',
    ],
    { w: 0xfffbd0, Y: 0xffd84a, O: 0xf59d2a, L: 0x9c7a4b, l: 0x866741, b: 0x6b5132, B: 0x5a4329 },
    img(), 0, 6,
  );
}

export function ladder(): TexImage {
  const t = img();
  const rail = [0x4f3a1f, 0x6b5030, 0x7f6139, 0x957446];
  for (let y = 0; y < N; y++) {
    plot(t, 1, y, rail[2]);
    plot(t, 2, y, rail[1]);
    plot(t, 13, y, rail[2]);
    plot(t, 14, y, rail[1]);
    if (y % 4 === 0) {
      plot(t, 2, y, rail[0]);
      plot(t, 14, y, rail[0]);
    }
  }
  for (const y of [2, 6, 10, 14]) {
    for (let x = 3; x < 13; x++) {
      plot(t, x, y - 1, x % 5 === 0 ? rail[2] : rail[3]);
      plot(t, x, y, rail[1]);
    }
  }
  return t;
}

export function cobweb(): TexImage {
  const t = img();
  const c = 0xe0e0e0, c2 = 0xc4c4c4;
  // radial threads from centre
  const cx = 7.5, cy = 7.5;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + 0.2;
    for (let d = 1; d < 11; d += 0.5) {
      const x = Math.round(cx + Math.cos(ang) * d), y = Math.round(cy + Math.sin(ang) * d);
      if (x >= 0 && y >= 0 && x < N && y < N) plot(t, x, y, c2);
    }
  }
  // spiral rings
  for (const rad of [2.2, 4.4, 6.6]) {
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      const rr = rad * (1 + 0.12 * Math.cos(ang * 8));
      const x = Math.round(cx + Math.cos(ang) * rr), y = Math.round(cy + Math.sin(ang) * rr);
      if (x >= 0 && y >= 0 && x < N && y < N) plot(t, x, y, c);
    }
  }
  return t;
}

