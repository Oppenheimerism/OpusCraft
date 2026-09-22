// Extra item variants built from the base templates: beds in every colour,
// doors/signs/boats for every wood, minecart variants, mob buckets, music
// discs, splash/lingering potions.

import { TexImage, plot, mixC } from '../tex';
import { DYE } from '../dyes';
import { Gen, Pal, spr, over } from './common';
import { BED, DOOR, SIGN, BOAT, CART, CART_PAL, BUCKET, BUCKET_PAL, BOTTLE, GLASS, BOTTLE_FILL, blank } from './misc';

export const VARIANT_ITEMS: Record<string, Gen> = {};
const V = VARIANT_ITEMS;

// ---------------------------------------------------------------------------
// Beds (blanket = wool colour)

for (const [name, d] of Object.entries(DYE)) {
  if (name === 'red') continue; // red_bed lives in misc with the hand-tuned palette
  V[`${name}_bed`] = () =>
    spr(BED, {
      '#': 0x2a1408, W: 0xffffff, w: 0xd8d8d8,
      R: d.wool, r: mixC(d.wool, 0x000000, 0.18), d: mixC(d.wool, 0x000000, 0.42),
      p: 0xa8844e, P: 0x86673a, L: 0x5e4526,
    }, `${name}_bed`);
}

// ---------------------------------------------------------------------------
// Wood families

interface WoodC { o: number; dark: number; mid: number; base: number; light: number; log: number; logD: number }
const WOODS: Record<string, WoodC> = {
  spruce: { o: 0x2a1c0c, dark: 0x5a4024, mid: 0x6a4c2c, base: 0x7a5a36, light: 0x8e6c44, log: 0x4e3a22, logD: 0x3a2a16 },
  birch: { o: 0x5e5230, dark: 0xb09c66, mid: 0xc2b07a, base: 0xd2c28c, light: 0xe2d6a4, log: 0xd8d8d0, logD: 0x4a4a44 },
  jungle: { o: 0x44281a, dark: 0x8a5a3a, mid: 0x9c6a46, base: 0xae7a52, light: 0xc08c60, log: 0x5a4424, logD: 0x3e2e16 },
  acacia: { o: 0x4a2210, dark: 0x8e4a28, mid: 0xa45834, base: 0xb8663e, light: 0xca7a4e, log: 0x6a645a, logD: 0x4a4640 },
  dark_oak: { o: 0x160c04, dark: 0x362210, mid: 0x422a14, base: 0x4e3218, light: 0x5e3e20, log: 0x3a2812, logD: 0x24180a },
  mangrove: { o: 0x2a0c0a, dark: 0x5a2220, mid: 0x6a2a28, base: 0x7a3230, light: 0x8e403c, log: 0x4e3a30, logD: 0x3a2a22 },
  cherry: { o: 0x6a3a36, dark: 0xc8908a, mid: 0xd8a49c, base: 0xe6b4ac, light: 0xf2c8c0, log: 0x3e1e24, logD: 0x2a1418 },
  bamboo: { o: 0x54481a, dark: 0xb09c3e, mid: 0xc4b04a, base: 0xd4c05a, light: 0xe4d272, log: 0x8a9a2a, logD: 0x5e6c1a },
  crimson: { o: 0x2a0c1c, dark: 0x5a2a40, mid: 0x6a324c, base: 0x7a3a58, light: 0x8e4a6a, log: 0x5a1a24, logD: 0x3e1018 },
  warped: { o: 0x0c2a28, dark: 0x1e6660, mid: 0x247870, base: 0x2e8a82, light: 0x3aa096, log: 0x3a2a4a, logD: 0x281c34 },
};

// Solid panelled door for woods whose vanilla door has no big windows.
// prettier-ignore
const PANEL_DOOR = [
  '...##########...',
  '...#pppppppp#...',
  '...#pqqqqqqp#...',
  '...#pqllllqp#...',
  '...#pqllllqp#...',
  '...#pqllllqp#...',
  '...#pqqqqqqp#...',
  '...#pppppppp#...',
  '...#PPPPPPPP#...',
  '...#pqqqqqqp#...',
  '...#pqllllhp#...',
  '...#pqllllqp#...',
  '...#pqllllqp#...',
  '...#pqqqqqqp#...',
  '...#pppppppp#...',
  '...##########...',
];
const PANEL_WOODS = new Set(['spruce', 'dark_oak', 'mangrove', 'crimson', 'warped']);

for (const [w, c] of Object.entries(WOODS)) {
  V[`${w}_door`] = () =>
    spr(PANEL_WOODS.has(w) ? PANEL_DOOR : DOOR, { '#': c.o, p: c.base, P: c.dark, q: c.mid, l: c.light, h: c.o }, `${w}_door`);
  V[`${w}_sign`] = () =>
    spr(SIGN, { '#': c.o, 1: c.dark, 2: c.mid, 3: c.base, 4: mixC(c.base, c.light, 0.5), 5: c.light, a: c.log, b: c.logD }, `${w}_sign`);
  if (w !== 'crimson' && w !== 'warped') {
    const boat = w === 'bamboo' ? 'bamboo_raft' : `${w}_boat`;
    V[boat] = () => spr(BOAT, { '#': c.o, 5: c.light, 4: c.base, 3: c.mid, 2: c.dark, i: mixC(c.dark, 0x000000, 0.3) }, boat);
  }
}

// ---------------------------------------------------------------------------
// Minecart variants: a block peeking out of the cart

function cartWith(rows: string[], pal: Pal, name: string): TexImage {
  const t = spr(CART, CART_PAL, name);
  over(t, rows, pal);
  return t;
}
// prettier-ignore
const CART_BOX = [
  '................',
  '...##########...',
  '...#tttttttt#...',
  '...#tTTTTTTt#...',
  '...#ffffffff#...',
  '...#ffffffff#...',
  '...#ffffffff#...',
  '...#FFFFFFFF#...',
];
V['chest_minecart'] = () =>
  cartWith(
    CART_BOX.map((r, y) => (y === 4 ? '...#fffllfff#...' : y === 5 ? '...#fffllfff#...' : r)),
    { '#': 0x2a1a0a, t: 0xb08450, T: 0x9a7040, f: 0x9a6c34, F: 0x7a5426, l: 0xc8c8c8 },
    'chest_minecart',
  );
V['furnace_minecart'] = () =>
  cartWith(
    CART_BOX.map((r, y) => (y === 5 ? '...#ffkKKkff#...' : y === 6 ? '...#ffkkkkff#...' : r)),
    { '#': 0x262626, t: 0x9a9a9a, T: 0x7a7a7a, f: 0x6e6e6e, F: 0x565656, k: 0x1e1e1e, K: 0xe07a1e },
    'furnace_minecart',
  );
V['hopper_minecart'] = () =>
  cartWith(
    ['................', '...##########...', '...#tttttttt#...', '...#tkkkkkkt#...', '...#tkkkkkkt#...', '....#tttttt#....', '.....#ffff#.....', '......#ff#......'],
    { '#': 0x1e1e1e, t: 0x5a5a5a, k: 0x2a2a2a, f: 0x4a4a4a },
    'hopper_minecart',
  );
V['tnt_minecart'] = () =>
  cartWith(
    CART_BOX.map((r, y) => (y === 4 ? '...#wwwwwwww#...' : y === 5 ? '...#wkwkkwkw#...' : r)),
    { '#': 0x3a0a06, t: 0xd8382a, T: 0xb82a20, f: 0xc8301f, F: 0x9a2418, w: 0xf2f2f2, k: 0x2a2a2a },
    'tnt_minecart',
  );

// ---------------------------------------------------------------------------
// Buckets with mobs / powder snow

function waterBucket(name: string): TexImage {
  return spr(BUCKET, { ...BUCKET_PAL, i: 0x2c4fd6, I: 0x3e6ee8 }, name);
}
function fishInBucket(name: string, body: number, belly: number, fin: number, eye = 0x101010): TexImage {
  const t = waterBucket(name);
  over(t, ['................', '................', '................', '..........f.....', '....bbbbbbff....', '...eBBBBBbf.....'], {
    b: body, B: belly, f: fin, e: eye,
  });
  return t;
}
V['cod_bucket'] = () => fishInBucket('cod_bucket', 0x9c8664, 0xd6cab0, 0x7a6446);
V['salmon_bucket'] = () => fishInBucket('salmon_bucket', 0xb8483a, 0xe68a6c, 0x8a342a);
V['tropical_fish_bucket'] = () => fishInBucket('tropical_fish_bucket', 0xf08a1e, 0xf8f8f8, 0xd06a10);
V['pufferfish_bucket'] = () => {
  const t = waterBucket('pufferfish_bucket');
  over(t, ['................', '................', '.....y..y.......', '....yYYYYy......', '...eYYYYYYy.....', '....yyYYyy......'], { y: 0xc8a018, Y: 0xf0d040, e: 0x101010 });
  return t;
};
V['axolotl_bucket'] = () => {
  const t = waterBucket('axolotl_bucket');
  over(t, ['................', '................', '................', '...p.......p....', '...pPPPPPPPp....', '....eP.PPe......'], { p: 0xd84a8a, P: 0xf0a0c8, e: 0x1a1a1a });
  return t;
};
V['tadpole_bucket'] = () => {
  const t = waterBucket('tadpole_bucket');
  over(t, ['................', '................', '................', '................', '.....tT.........', '....tTTttt......'], { t: 0x4a3a2a, T: 0x6a5a44 });
  return t;
};
V['powder_snow_bucket'] = () => {
  const t = spr(BUCKET, { ...BUCKET_PAL, i: 0xdce6f0, I: 0xf4f8fc }, 'powder_snow_bucket');
  plot(t, 5, 4, 0xffffff);
  plot(t, 9, 5, 0xc4d2e0);
  return t;
};

// ---------------------------------------------------------------------------
// Music discs

// prettier-ignore
const DISC = [
  '................',
  '................',
  '.....######.....',
  '....#dDddDd#....',
  '...#dDdddddd#...',
  '..#dDddLLddDd#..',
  '..#dDdLllLdDd#..',
  '..#ddLlkkLdDd#..',
  '..#ddLlkkLddd#..',
  '..#dddLLLLddd#..',
  '..#dDddLLdddd#..',
  '...#dDddddDd#...',
  '....#ddddDd#....',
  '.....######.....',
  '................',
  '................',
];
const DISCS: Record<string, number> = {
  music_disc_13: 0xe8c83a, music_disc_cat: 0x5ec23a, music_disc_blocks: 0xe0582a, music_disc_chirp: 0xc8281e,
  music_disc_far: 0x8ae04a, music_disc_mall: 0x6a4ac8, music_disc_mellohi: 0xc85ac8, music_disc_stal: 0x3a3a3a,
  music_disc_strad: 0xf0f0f0, music_disc_ward: 0x2e7a3a, music_disc_11: 0x5a5a5a, music_disc_wait: 0x3a8ae0,
  music_disc_pigstep: 0xa0302a, music_disc_otherside: 0x3ab8d8, music_disc_5: 0x2a8a8a, music_disc_relic: 0x2ab8a8,
  music_disc_creator: 0xf0b020, music_disc_creator_music_box: 0xd8a040, music_disc_precipice: 0x7ab870,
};
for (const [name, label] of Object.entries(DISCS))
  V[name] = () =>
    spr(DISC, { '#': 0x0c0c0c, d: 0x1e1e22, D: 0x3a3a44, L: label, l: mixC(label, 0xffffff, 0.35), k: 0x0c0c0c }, name);

// ---------------------------------------------------------------------------
// Splash / lingering potions (water-coloured by default; tinted at runtime)

// prettier-ignore
const SPLASH = [
  '................',
  '......####......',
  '......#rR#......',
  '.......##.......',
  '......#..#......',
  '.....#h...#.....',
  '....#h.....#....',
  '...#h.......#...',
  '..#h.........d..',
  '..#h.........d..',
  '..#..........d..',
  '..#..........d..',
  '...#........d...',
  '....#......d....',
  '.....dddddd.....',
  '................',
];
function potionLike(shape: string[], ramp: number[], name: string): TexImage {
  const t = spr(shape, GLASS, name);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (BOTTLE_FILL[y][x] !== 'L') continue;
      const edge = BOTTLE_FILL[y][x + 1] !== 'L' || BOTTLE_FILL[y + 1]?.[x] !== 'L';
      const top = BOTTLE_FILL[y - 1]?.[x] !== 'L' || BOTTLE_FILL[y][x - 1] !== 'L';
      plot(t, x, y, ramp[edge ? 0 : top ? 2 : 1]);
    }
  plot(t, 4, 8, 0xffffff);
  plot(t, 4, 9, 0xffffff);
  return t;
}
V['splash_potion'] = () => potionLike(SPLASH, [0x2a47a8, 0x385dc6, 0x5a82e0], 'splash_potion');
V['lingering_potion'] = () => potionLike(SPLASH, [0x3a4a9a, 0x5068c0, 0x7a92e0], 'lingering_potion');
V['honey_bottle'] = () => potionLike(BOTTLE, [0xc87a10, 0xeca21e, 0xfcd04a], 'honey_bottle');
V['dragon_breath'] = () => potionLike(BOTTLE, [0x9a3a8a, 0xc85ab8, 0xf0a0e8], 'dragon_breath');


// ---------------------------------------------------------------------------
// Animation frames in vanilla naming: compass_00..31 (needle angle, frame 0 =
// pointing up, clockwise) and clock_00..63 (dial rotation, frame 0 = noon).

import { DIAL } from './misc';

function needleLine(t: TexImage, cx: number, cy: number, ang: number, len: number, cols: number[]): void {
  const dx = Math.sin(ang), dy = -Math.cos(ang);
  for (let k = 1; k <= len * 2; k++) {
    const d = k / 2;
    const x = Math.floor(cx + dx * d), y = Math.floor(cy + dy * d);
    plot(t, x, y, cols[Math.min(cols.length - 1, Math.floor((d / len) * cols.length))]);
  }
}

function compassFrame(i: number): TexImage {
  const t = spr(DIAL, { '#': 0x2a2a2a, r: 0xc8c8c8, R: 0x9a9a9a, q: 0x6e6e6e, f: 0x3c3c44 }, 'compass');
  const ang = (i / 32) * Math.PI * 2;
  const cx = 8, cy = 8.5;
  needleLine(t, cx, cy, ang + Math.PI, 3.2, [0x9a9a9a, 0xd8d8d8]);
  needleLine(t, cx, cy, ang, 4.2, [0xb01c1c, 0xff3c3c]);
  plot(t, 7, 8, 0x5a5a5a);
  return t;
}
for (let i = 0; i < 32; i++) V[`compass_${String(i).padStart(2, '0')}`] = () => compassFrame(i);

function clockFrame(i: number): TexImage {
  const t = spr(DIAL, { '#': 0x4a3004, r: 0xfcee4b, R: 0xe0b020, q: 0xa87410, f: 0x000001 }, 'clock');
  const ang = (i / 64) * Math.PI * 2;
  const cx = 8, cy = 8.5, c = Math.cos(ang), s = Math.sin(ang);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (getPxSafe(t, x, y) !== 0x000001) continue;
      // rotate into dial space
      const px = x + 0.5 - cx, py = y + 0.5 - cy;
      const rx = px * c + py * s, ry = -px * s + py * c;
      let col = ry < -0.2 ? 0x4a78e0 : ry > 0.2 ? 0x1c2458 : 0x3462c8;
      const sun = Math.hypot(rx, ry + 2.6), moon = Math.hypot(rx, ry - 2.6);
      if (sun < 1.25) col = sun < 0.6 ? 0xfff8b0 : 0xf8d020;
      else if (moon < 1.1) col = rx > 0.3 ? 0xc8c8d8 : 0xf0f0ff;
      plot(t, x, y, col);
    }
  return t;
}
function getPxSafe(t: TexImage, x: number, y: number): number {
  const i = (y * 16 + x) * 4;
  if (!t.data[i + 3]) return -1;
  return (t.data[i] << 16) | (t.data[i + 1] << 8) | t.data[i + 2];
}
for (let i = 0; i < 64; i++) V[`clock_${String(i).padStart(2, '0')}`] = () => clockFrame(i);

// Grayscale liquid layer for runtime-tinted potions (vanilla potion_overlay).
V['potion_overlay'] = () => {
  const t = blank();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (BOTTLE_FILL[y][x] !== 'L') continue;
      const edge = BOTTLE_FILL[y][x + 1] !== 'L' || BOTTLE_FILL[y + 1]?.[x] !== 'L';
      const top = BOTTLE_FILL[y - 1]?.[x] !== 'L' || BOTTLE_FILL[y][x - 1] !== 'L';
      plot(t, x, y, edge ? 0xa8a8a8 : top ? 0xffffff : 0xd8d8d8);
    }
  return t;
};
V['potion_bottle'] = () => spr(BOTTLE, GLASS, 'potion_bottle');
