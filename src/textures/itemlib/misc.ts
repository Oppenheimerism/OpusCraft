// Miscellaneous items: crafting components, utility items, containers.

import { TexImage, plot, getA, getPx, clear } from '../tex';
import { Gen, Pal, spr, over, autoShade, maskFn, inEllipse, rng, paint, outline4 } from './common';

export const MISC_ITEMS: Record<string, Gen> = {};
const M = MISC_ITEMS;

export function blank(): TexImage {
  return { w: 16, h: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
}

// ---------------------------------------------------------------------------
// Stick and rods

function stickRows(): string[] {
  // clean diagonal: a on x+y=15, b on x+y=16
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let r = '';
    for (let x = 0; x < 16; x++) {
      const u = x + y, s = x - y;
      let c = '.';
      if (s >= -9 && s <= 9) {
        if (u === 15 && s >= -9 && s <= 9) c = 'a';
        else if (u === 16 && s >= -8 && s <= 10) c = 'b';
      }
      r += c;
    }
    rows.push(r);
  }
  return rows;
}

function rod(pal: { o: number; a: number; b: number; c: number }, knots: [number, number][]): TexImage {
  const t = spr(stickRows(), { a: pal.a, b: pal.b }, 'rod');
  for (const [x, y] of knots) if (getA(t, x, y)) plot(t, x, y, pal.c);
  outline4(t, pal.o);
  return t;
}
M['stick'] = () => rod({ o: 0x28190a, a: 0x896727, b: 0x684e1e, c: 0x4f3a17 }, [[8, 8], [5, 11], [11, 5]]);
/** blaze rod: a stick's shape in glowing yellow and orange, a hot pale highlight along its upper edge, outlined in scorched orange-brown */
M['blaze_rod'] = () => {
  const t = blank();
  // the rod's two diagonals (the upper edge x + y = 15, the lower x + y = 16), from the bottom-left end up
  const UPPER = 'yhhWhyhhWh', LOWER = 'doooDoodoo';
  const ink: Record<string, number> = { W: 0xffffe0, h: 0xfff39a, y: 0xffd43c, o: 0xf5a01e, d: 0xe07c12, D: 0xc4600c };
  for (let i = 0; i < 10; i++) {
    plot(t, 3 + i, 12 - i, ink[UPPER[i]]);
    plot(t, 4 + i, 12 - i, ink[LOWER[i]]);
  }
  outline4(t, 0x8a3c06);
  return t;
};

// ---------------------------------------------------------------------------
// Bone

M['bone'] = () => {
  const shaft = (x: number, y: number) => {
    const u = x + y, s = x - y;
    return u >= 14.2 && u <= 17.2 && s >= -8.5 && s <= 8.5;
  };
  const knobs = [inEllipse(11.6, 2.6, 1.7, 1.7), inEllipse(13.4, 4.4, 1.7, 1.7), inEllipse(2.6, 11.6, 1.7, 1.7), inEllipse(4.4, 13.4, 1.7, 1.7)];
  const m = maskFn((x, y) => shaft(x, y) || knobs.some((k) => k(x, y)));
  return autoShade(m, [0xa8a294, 0xc4bfb2, 0xdcd8cc, 0xece9e0, 0xf8f6f0, 0xffffff], 0x5c574c, { seed: 'bone', edge: 1.2, relief: 2 });
};

// ---------------------------------------------------------------------------
// Feather

M['feather'] = () => {
  const t = blank();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const u = x + y, s = x - y;
      if (s < -11 || s > 11) continue;
      const k = (s + 6) / 17; // 0..1 along vane
      const w = k < 0 || k > 1 ? 0 : 4.4 * Math.sin(Math.PI * Math.pow(k, 0.75));
      const d = u - 15;
      if (d === 0 && s <= 10) plot(t, x, y, s < -5 ? 0x9a9a9a : 0xb4b4b4);
      else if (Math.abs(d) <= w) plot(t, x, y, d < 0 ? (Math.abs(d) >= w - 1 ? 0xe4e4e4 : 0xffffff) : Math.abs(d) >= w - 1 ? 0xbcbcbc : 0xd6d6d6);
    }
  // notches in the vane
  for (const [x, y] of [[5, 6], [11, 8], [4, 8]] as [number, number][]) clear(t, x, y);
  outline4(t, 0x6e6e6e);
  return t;
};

// ---------------------------------------------------------------------------
// String

// prettier-ignore
const STRING = [
  '................',
  '................',
  '.........sSSs...',
  '.......sS....S..',
  '......S.......s.',
  '.....s........S.',
  '....S....sSSs.s.',
  '...s....S....S..',
  '..S....s........',
  '..s....S........',
  '..S.....sS......',
  '...s......Ss....',
  '....Ss......S...',
  '......sSSs...s..',
  '.............S..',
  '................',
];
M['string'] = () => spr(STRING, { s: 0xf4f4f4, S: 0xc4c4c4 }, 'string');

// ---------------------------------------------------------------------------
// Powder piles

// prettier-ignore
const PILE = [
  '................',
  '................',
  '................',
  '................',
  '........XX......',
  '......XXXXX.....',
  '.....XXXXXXX....',
  '....XXXXXXXXXX..',
  '...XXXXXXXXXXX..',
  '..XXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '................',
  '................',
  '................',
];
const GRAINS: [number, number][] = [[3, 6], [13, 5], [1, 14], [14, 14], [11, 3], [5, 14]];
function pile(ramp: [number, number, number, number, number], o: number, seed: string, speck: number[]): TexImage {
  const t = autoShade(PILE, ramp, o, { seed, edge: 1.2, relief: 3, cluster: 0.2, cell: 3 });
  const r = rng(seed);
  paint(t, (x, y, c) => (c !== o && r.chance(0.22) ? speck[r.nextInt(speck.length)] : undefined));
  for (const [x, y] of GRAINS) plot(t, x, y, r.chance(0.5) ? ramp[2] : ramp[1]);
  return t;
}
M['gunpowder'] = () => pile([0x3a3a3a, 0x4e4e4e, 0x646464, 0x7a7a7a, 0x969696], 0x1e1e1e, 'gunpowder', [0x2a2a2a, 0x8a8a8a, 0x5a5a5a]);
M['sugar'] = () => pile([0xb8c0c8, 0xd0d6dc, 0xe4e8ec, 0xf2f4f6, 0xffffff], 0x7c8490, 'sugar', [0xffffff, 0xc8ced6]);
M['bone_meal'] = () => pile([0xb4b0a4, 0xccc8bc, 0xe0ddd2, 0xefede6, 0xfcfbf8], 0x74705f, 'bone_meal', [0xffffff, 0xc2beb0]);
M['glowstone_dust'] = () => pile([0x9c7418, 0xc49826, 0xe6bf3c, 0xfadc5e, 0xfff4a0], 0x5c420c, 'glowstone_dust', [0xffffd0, 0xd8a830, 0xfff08a]);

// prettier-ignore
const SMALL_PILE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......XX.......',
  '......XXXX......',
  '.....XXXXXX.....',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '....XXXXXXXX....',
  '................',
  '................',
];
/** blaze powder: a small heap of bright orange and yellow powder, low in the middle, giving off a few sparks */
M['blaze_powder'] = () => {
  const t = autoShade(SMALL_PILE, [0xc24a08, 0xe26c0e, 0xf4921a, 0xfcbc30, 0xffe060, 0xfff6a8], 0x7a2804, {
    seed: 'blaze_powder', edge: 1.2, relief: 3, cluster: 0.25, cell: 3,
  });
  const r = rng('blaze_powder');
  paint(t, (x, y, c) => (c !== 0x7a2804 && r.chance(0.18) ? [0xfff6a8, 0xf4921a, 0xffe060][r.nextInt(3)] : undefined));
  // sparks drifting up off the heap, and one in it
  for (const [x, y, c] of [[3, 7, 0xffe060], [12, 6, 0xfff6a8], [8, 4, 0xfcbc30], [14, 9, 0xffe060], [1, 10, 0xfcbc30], [9, 10, 0xffffe0]] as [number, number, number][])
    plot(t, x, y, c);
  return t;
};

// ---------------------------------------------------------------------------
// Leather

// prettier-ignore
const LEATHER_MASK = [
  '................',
  '................',
  '..XXX.....XXX...',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXXX..',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXXX..',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '..XXX.....XXXX..',
  '................',
  '................',
  '................',
];
M['leather'] = () =>
  autoShade(LEATHER_MASK, [0x5a3018, 0x74401f, 0x8e5228, 0xa56634, 0xba7a44, 0xcc9058], 0x3a1e0c, {
    seed: 'leather', edge: 1.1, relief: 2, cluster: 0.25, cell: 4,
  });

// ---------------------------------------------------------------------------
// Flint

// prettier-ignore
const FLINT = [
  '................',
  '................',
  '..........##....',
  '.........#65#...',
  '........#6543#..',
  '.......#65433#..',
  '......#654332#..',
  '.....#5543322#..',
  '....#55433221#..',
  '...#454332211#..',
  '..#4443322211#..',
  '..#3433222111#..',
  '...#32221111#...',
  '....##11111#....',
  '......#####.....',
  '................',
];
M['flint'] = () =>
  spr(FLINT, { '#': 0x0c0c0c, 1: 0x1c1c1c, 2: 0x2a2a2a, 3: 0x3a3a3a, 4: 0x4e4e4e, 5: 0x686868, 6: 0x8c8c8c }, 'flint');

// ---------------------------------------------------------------------------
// Balls and round things

function ball(r: number, ramp: number[], o: number, seed: string, cx = 8, cy = 8.5): TexImage {
  return autoShade(maskFn(inEllipse(cx, cy, r, r)), ramp, o, { seed, edge: 1.1, relief: 4 });
}
M['clay_ball'] = () => ball(4.6, [0x6a7080, 0x828898, 0x9aa0b0, 0xaeb4c4, 0xc2c8d6, 0xd8dde8], 0x4a4e5c, 'clay');
M['snowball'] = () => ball(5.2, [0x9ab0c4, 0xb8cad8, 0xd4e2ec, 0xe8f0f6, 0xf6fafc, 0xffffff], 0x5e7488, 'snow');
M['slime_ball'] = () => {
  const t = ball(4.8, [0x3a8a2a, 0x4fa83a, 0x68c24e, 0x82d864, 0xa2ea86, 0xcaf8b4], 0x24601a, 'slime');
  plot(t, 6, 6, 0xeaffe0);
  plot(t, 7, 6, 0xcaf8b4);
  plot(t, 9, 10, 0x4fa83a);
  plot(t, 10, 9, 0x4fa83a);
  return t;
};
/** magma cream: a glossy blob of molten orange, hot yellow at the heart, flecked with darker bits of crust */
M['magma_cream'] = () => {
  const t = ball(4.9, [0x7a2204, 0xa8380a, 0xd45a12, 0xf0841e, 0xfbb23a, 0xffe07a], 0x4e1403, 'magma_cream');
  for (const [x, y] of [[5, 9], [10, 7], [9, 11], [11, 10], [7, 12]] as [number, number][]) if (getA(t, x, y)) plot(t, x, y, 0x8a2a06);
  plot(t, 6, 6, 0xfff3b8);
  plot(t, 7, 6, 0xffe07a);
  return t;
};
/** a ghast tear: a drop of pale, glassy blue-white, bright at its heart */
M['ghast_tear'] = () =>
  spr(
    [
      '................',
      '................',
      '.......o........',
      '......oao.......',
      '......oao.......',
      '.....oabao......',
      '.....oabao......',
      '....oabcbao.....',
      '....oabccbao....',
      '....abcddcba....',
      '....abcddcba....',
      '....oabccbao....',
      '.....oabbao.....',
      '......oooo......',
      '................',
      '................',
    ].map((row) => row.slice(0, 16)),
    { o: 0x6e8a96, a: 0xa9c4cc, b: 0xcfe2e6, c: 0xe8f4f6, d: 0xffffff },
    'ghast_tear',
  );
/** a fire charge: a ball of charred black, cracked through with glowing orange */
M['fire_charge'] = () => {
  const t = ball(5.2, [0x1c120c, 0x2a1a10, 0x3b2414, 0x4e2e16, 0x663a18, 0x7e4a1c], 0x0e0806, 'fire_charge');
  for (const [x, y, c] of [[6, 6, 0xffd24a], [7, 7, 0xf59a26], [8, 7, 0xe2641a], [9, 8, 0xf59a26], [5, 9, 0xe2641a], [6, 10, 0xf59a26], [10, 10, 0xffd24a], [11, 11, 0xe2641a], [8, 11, 0xe2641a], [9, 12, 0xf59a26]] as [number, number, number][])
    if (getA(t, x, y)) plot(t, x, y, c);
  return t;
};
M['ender_pearl'] = () => {
  const t = ball(5.2, [0x082e26, 0x0c4034, 0x125646, 0x1a705c, 0x238a72, 0x34a88a], 0x041a14, 'pearl');
  over(t, ['................', '................', '................', '................', '................', '................', '......cC........', '.....cCCc.......', '.....cCc........', '......c.........'], { c: 0x3cbfa0, C: 0x7ee8cc });
  return t;
};
M['egg'] = () => {
  const m = maskFn((x, y) => {
    const dy = y - 8.8;
    const rx = 4.6 - (dy < 0 ? -dy * 0.12 : 0);
    return ((x - 8) * (x - 8)) / (rx * rx) + (dy * dy) / (5.6 * 5.6) <= 1;
  });
  const t = autoShade(m, [0xa08c5a, 0xbba670, 0xd2bf88, 0xe2d2a0, 0xefe2b8, 0xf8f0d4], 0x6a5a34, { seed: 'egg', edge: 1, relief: 4 });
  for (const [x, y] of [[6, 7], [9, 5], [10, 9], [7, 11], [11, 12]] as [number, number][]) plot(t, x, y, 0xb89c6a);
  return t;
};

// ---------------------------------------------------------------------------
// Paper and book

// prettier-ignore
const PAPER = [
  '................',
  '................',
  '...........###..',
  '......#####www#.',
  '..####wwwwwwww#.',
  '..#wwwwwwwwwwg#.',
  '..#wwwwwwwwwwg#.',
  '..#wwwwwwwwwgg#.',
  '..#wwwwwwwwwg#..',
  '.#wwwwwwwwwwg#..',
  '.#wwwwwwwwwgg#..',
  '.#wwwwwwwwwg#...',
  '.#gggwwwwwgg#...',
  '.#####ggggg#....',
  '......#####.....',
  '................',
];
M['paper'] = () => spr(PAPER, { '#': 0x8a8672, w: 0xf2f0e4, g: 0xd6d2bf }, 'paper');

// prettier-ignore
const BOOK = [
  '................',
  '................',
  '.....#########..',
  '....#5544444432#',
  '...#5444444433##',
  '..#5444444433#p#',
  '.#5444444433#pP#',
  '#5444444433#pP#.',
  '#444444433#pP#..',
  '#33333333#pP#...',
  '#2222222#pP#....',
  '#1111111#P#.....',
  '.#######.#......',
  '................',
  '................',
  '................',
];
M['book'] = () =>
  spr(BOOK, { '#': 0x2e1408, 1: 0x4e2410, 2: 0x6a3218, 3: 0x843f1f, 4: 0x9e4e26, 5: 0xb8683a, p: 0xe8e2cc, P: 0xc8c0a4 }, 'book');

// ---------------------------------------------------------------------------
// Buckets

// prettier-ignore
export const BUCKET = [
  '................',
  '................',
  '...##########...',
  '..#rrrrrrrrrr#..',
  '.#rRiiiiiiiiRr#.',
  '.#riiiiiiiiiir#.',
  '.#rIIiiiiiiIIr#.',
  '.#rrRRRRRRRRRr#.',
  '..#5444444332#..',
  '..#5443333322#..',
  '...#44333322#...',
  '...#44333322#...',
  '...#43333221#...',
  '....#322221#....',
  '.....######.....',
  '................',
];
export const BUCKET_PAL: Pal = {
  '#': 0x323232, r: 0xe6e6e6, R: 0xbcbcbc, i: 0x3a3a3a, I: 0x575757,
  5: 0xdadada, 4: 0xbdbdbd, 3: 0x9f9f9f, 2: 0x7f7f7f, 1: 0x5e5e5e,
};
M['bucket'] = () => spr(BUCKET, BUCKET_PAL, 'bucket');
export function filledBucket(i: number, I: number, hi: number, name: string): TexImage {
  const t = spr(BUCKET, { ...BUCKET_PAL, i, I }, name);
  plot(t, 4, 4, hi);
  plot(t, 5, 4, hi);
  plot(t, 9, 5, hi);
  plot(t, 10, 5, hi);
  return t;
}
M['water_bucket'] = () => filledBucket(0x2c4fd6, 0x3e6ee8, 0x7aa2f4, 'water_bucket');
M['lava_bucket'] = () => {
  const t = filledBucket(0xe06a1c, 0xf49a28, 0xffd24a, 'lava_bucket');
  plot(t, 7, 5, 0xffe890);
  plot(t, 6, 6, 0xc84a12);
  plot(t, 11, 6, 0xc84a12);
  return t;
};
M['milk_bucket'] = () => filledBucket(0xeeeeee, 0xfdfdfd, 0xffffff, 'milk_bucket');

// ---------------------------------------------------------------------------
// Flint and steel

// prettier-ignore
const FLINT_STEEL = [
  '................',
  '..#######.......',
  '.#5555544#......',
  '#54#####43#.....',
  '#4#.....#3#.....',
  '#4#......#......',
  '#4#.............',
  '#43#.....##.....',
  '.#43####fFF#....',
  '..#3322#fFFf#...',
  '...####fFFffg#..',
  '.......#ffffgg#.',
  '........#fggg#..',
  '.........#gg#...',
  '..........##....',
  '................',
];
M['flint_and_steel'] = () =>
  spr(FLINT_STEEL, { '#': 0x2a2a2a, 5: 0xf0f0f0, 4: 0xc8c8c8, 3: 0x9a9a9a, 2: 0x707070, f: 0x505050, F: 0x7a7a7a, g: 0x2e2e2e }, 'flint_and_steel');

// ---------------------------------------------------------------------------
// Bow and arrow

const BOW_WOOD = { o: 0x2e1c0a, a: 0x9a7640, b: 0x7a5a2a, c: 0x5a3f1a };
const STRING_C = 0xd6d6d6;

/** Bow limb: quarter arc bulging toward the top right, tips at top-left and bottom-right. */
function bowBase(): TexImage {
  const t = blank();
  const cx = 1.5, cy = 14.5;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d = Math.hypot(px - cx, py - cy);
      const ang = Math.atan2(cy - py, px - cx); // 0 = right, 90 = up
      if (ang < 0.05 || ang > Math.PI / 2 - 0.05) continue;
      const mid = Math.abs(ang - Math.PI / 4) / (Math.PI / 4); // 0 at grip, 1 at tips
      const half = 1.35 - mid * 0.55;
      if (Math.abs(d - 12.2) > half) continue;
      const outer = d > 12.2;
      plot(t, x, y, mid < 0.18 ? BOW_WOOD.c : outer ? BOW_WOOD.a : BOW_WOOD.b);
    }
  outline4(t, BOW_WOOD.o);
  return t;
}

/** Draw a bow with the string pulled `pull` px toward the lower left; arrow if pull > 0. */
function bow(pull: number): TexImage {
  const t = bowBase();
  const tipA: [number, number] = [2, 2], tipB: [number, number] = [13, 13];
  const nock: [number, number] = [7 - pull, 8 + pull];
  const put = (x: number, y: number, c: number) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    if (getA(t, x, y) && getPx(t, x, y) !== BOW_WOOD.o) return;
    plot(t, x, y, c);
  };
  const seg = (a: [number, number], b: [number, number]) => {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * i) / n), y = Math.round(a[1] + ((b[1] - a[1]) * i) / n);
      put(x, y, STRING_C);
    }
  };
  if (pull === 0) seg(tipA, tipB);
  else {
    seg(tipA, nock);
    seg(nock, tipB);
    // arrow from the nock toward the upper right, drawn over the bow
    const len = 9;
    for (let i = 1; i < len; i++) plot(t, nock[0] + i, nock[1] - i, i < 3 ? 0xe8e8e8 : i % 2 ? 0xb89868 : 0x8e6e40);
    const hx = nock[0] + len, hy = nock[1] - len;
    plot(t, hx, hy, 0xf0f0f0);
    plot(t, hx - 1, hy, 0xa8a8a8);
    plot(t, hx, hy + 1, 0xa8a8a8);
    plot(t, hx - 1, hy - 1, 0x3a3a3a);
    plot(t, hx + 1, hy + 1, 0x3a3a3a);
    plot(t, hx + 1, hy - 1, 0x3a3a3a);
    // fletching at the nock
    plot(t, nock[0] - 1, nock[1] - 1, 0xf4f4f4);
    plot(t, nock[0] + 1, nock[1] + 1, 0xc8c8c8);
  }
  return t;
}
M['bow'] = () => bow(0);
M['bow_pulling_0'] = () => bow(1);
M['bow_pulling_1'] = () => bow(2);
M['bow_pulling_2'] = () => bow(3);

// prettier-ignore
const ARROW = [
  '................',
  '...........###..',
  '..........#554#.',
  '...........#43#.',
  '..........#a#2#.',
  '.........#ab#.#.',
  '........#ab#....',
  '.......#ab#.....',
  '......#ab#......',
  '.....#ab#.......',
  '.#..#ab#........',
  '#w##ab#.........',
  '#wWab#..........',
  '.#wW#...........',
  '..##............',
  '................',
];
M['arrow'] = () =>
  spr(ARROW, { '#': 0x2a2a2a, 5: 0xe8e8e8, 4: 0xb4b4b4, 3: 0x8a8a8a, 2: 0x5e5e5e, a: 0x9a7a4a, b: 0x6b5030, w: 0xf2f2f2, W: 0xc6c6c6 }, 'arrow');

// ---------------------------------------------------------------------------
// Shears (closed, blades toward the upper right)

/** Pixels whose centres lie within a tapered distance of segment a->b. */
export function taper(t: TexImage, ax: number, ay: number, bx: number, by: number, w0: number, w1: number, col: (side: number, k: number) => number): void {
  const lx = bx - ax, ly = by - ay, L2 = lx * lx + ly * ly;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const px = x + 0.5, py = y + 0.5;
      const k = Math.max(0, Math.min(1, ((px - ax) * lx + (py - ay) * ly) / L2));
      const qx = ax + lx * k, qy = ay + ly * k;
      const side = (px - qx) * -ly + (py - qy) * lx; // >0 = right of direction
      const d = Math.hypot(px - qx, py - qy);
      if (d <= (w0 + (w1 - w0) * k) / 2) plot(t, x, y, col(side, k));
    }
}

M['shears'] = () => {
  const t = blank();
  const C: Record<string, number> = { 5: 0xf2f2f2, 4: 0xcacaca, 3: 0x9a9a9a, d: 0x5e5e5e, h: 0x8a8a8a, r: 0x7a7a7a, R: 0xb0b0b0 };
  const put = (u: number, s: number, c: number) => {
    if ((u + s) % 2 === 0) plot(t, (u + s) / 2, (u - s) / 2, c);
  };
  // closed blades along the diagonal with a dark split line between them
  for (let s = -2; s <= 11; s++) {
    if (s <= 9) put(13, s, C[5]);
    if (s <= 10) put(14, s, C[4]);
    put(15, s, s >= 10 ? C[4] : C.d);
    if (s <= 10) put(16, s, C[4]);
    if (s <= 9) put(17, s, C[3]);
  }
  // handle rings with see-through holes
  const ringA: [number, number, string][] = [[3, 8, 'R'], [4, 8, 'R'], [2, 9, 'R'], [5, 9, 'r'], [2, 10, 'r'], [5, 10, 'r'], [3, 11, 'r'], [4, 11, 'r']];
  const ringB: [number, number, string][] = [[6, 11, 'R'], [7, 11, 'R'], [5, 12, 'R'], [8, 12, 'r'], [5, 13, 'r'], [8, 13, 'r'], [6, 14, 'r'], [7, 14, 'r']];
  for (const [x, y, k] of [...ringA, ...ringB]) plot(t, x, y, C[k]);
  plot(t, 5, 8, C.h);
  plot(t, 6, 9, C.d);
  plot(t, 7, 10, C.h);
  outline4(t, 0x262626);
  for (const [x, y] of [[3, 9], [4, 9], [3, 10], [4, 10], [6, 12], [7, 12], [6, 13], [7, 13]] as [number, number][]) clear(t, x, y);
  return t;
};

// ---------------------------------------------------------------------------
// Compass and clock

// prettier-ignore
export const DIAL = [
  '................',
  '................',
  '.....######.....',
  '....#rrrrrR#....',
  '...#rRffffRR#...',
  '..#rRffffffRq#..',
  '..#rffffffffq#..',
  '..#rffffffffq#..',
  '..#rffffffffq#..',
  '..#rffffffffq#..',
  '..#rRffffffRq#..',
  '...#RRffffRq#...',
  '....#Rqqqqq#....',
  '.....######.....',
  '................',
  '................',
];
M['compass'] = () => {
  const t = spr(DIAL, { '#': 0x2a2a2a, r: 0xc8c8c8, R: 0x9a9a9a, q: 0x6e6e6e, f: 0x3c3c44 }, 'compass');
  // needle: red half pointing up-right, gray half down-left
  over(t, [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..........e.....',
    '.........eE.....',
    '........eE......',
    '.......wd.......',
    '......ww........',
    '.....w..........',
  ], { e: 0xb01c1c, E: 0xff3c3c, w: 0xd8d8d8, d: 0x9a9a9a });
  plot(t, 7, 8, 0x5a5a5a);
  return t;
};
M['clock'] = () => {
  const t = spr(DIAL, { '#': 0x4a3004, r: 0xfcee4b, R: 0xe0b020, q: 0xa87410, f: 0x4a78e0 }, 'clock');
  // lower half is the night side of the dial
  paint(t, (x, y, c) => (c === 0x4a78e0 && y >= 9 ? 0x1c2458 : c === 0x4a78e0 && y === 8 ? 0x3462c8 : undefined));
  // sun on the day side, moon on the night side
  over(t, ['................', '................', '................', '................', '................', '.......ss.......', '......sSSs......', '.......ss.......', '................', '................', '.......mm.......', '.......mM.......'], {
    s: 0xf8d020, S: 0xfff8b0, m: 0xc8c8d8, M: 0xf0f0ff,
  });
  return t;
};

// ---------------------------------------------------------------------------
// Maps

// prettier-ignore
const MAP = [
  '................',
  '..############..',
  '..#pppppppppp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pPPPPPPPPp#..',
  '..#pppppppppp#..',
  '..############..',
  '................',
];
const MAP_PAL: Pal = { '#': 0x5a4a2a, p: 0xc9b98a, P: 0xe8dcb4 };
M['map'] = () => {
  const t = spr(MAP, MAP_PAL, 'map');
  // faint pencil marks on the blank parchment
  over(t, [
    '................',
    '................',
    '................',
    '.....ll.........',
    '.......l....l...',
    '........l..l....',
    '....l.......l...',
    '.....l..........',
    '..........ll....',
    '....ll......l...',
    '......l.........',
    '.........l......',
  ], { l: 0xd2c49a });
  return t;
};
M['filled_map'] = () => {
  const t = spr(MAP, MAP_PAL, 'filled_map');
  over(t, [
    '................',
    '................',
    '................',
    '....ggGgwwww....',
    '....gGggwwBw....',
    '....ggggGwww....',
    '....wgGgggww....',
    '....wwggsgGg....',
    '....wBwgggGg....',
    '....wwwggGgg....',
    '....wwwwgggs....',
    '....Bwwwwggg....',
    '................',
  ], { g: 0x7fa850, G: 0x5e8a3a, w: 0x4a6ed8, B: 0x3a5ac4, s: 0xd8c890 });
  return t;
};

// ---------------------------------------------------------------------------
// Fishing rod

M['fishing_rod'] = () => {
  const t = blank();
  // rod: thick near the handle, thin toward the tip at the top right
  for (let s = -12; s <= 10; s++) {
    const u = 15;
    if ((u + s) % 2 === 0) plot(t, (u + s) / 2, (u - s) / 2, s < -4 ? 0x896727 : 0x7a5a24);
    if (s <= -3 && (u + 1 + s) % 2 === 0) plot(t, (u + 1 + s) / 2, (u + 1 - s) / 2, 0x684e1e);
  }
  outline4(t, 0x28190a);
  // handle wrap
  plot(t, 3, 12, 0x4a4a4a);
  plot(t, 2, 13, 0x4a4a4a);
  // line hanging from the tip, and the hook
  for (let y = 3; y <= 12; y++) plot(t, 13, y, y % 2 ? 0xe0e0e0 : 0xbdbdbd);
  plot(t, 13, 13, 0x8a8a8a);
  plot(t, 12, 14, 0x8a8a8a);
  plot(t, 11, 13, 0x8a8a8a);
  return t;
};

// ---------------------------------------------------------------------------
// Saddle

// prettier-ignore
const SADDLE = [
  '................',
  '................',
  '................',
  '..##........##..',
  '.#54#......#53#.',
  '.#543######5432#',
  '.#4443333333332#',
  '.#4333333322221#',
  '..#32222222111#.',
  '...#211##d#11#..',
  '....###.#d###...',
  '........#d#.....',
  '.......#sSs#....',
  '.......#s.s#....',
  '.......#sss#....',
  '........###.....',
];
M['saddle'] = () =>
  spr(SADDLE, { '#': 0x2e1406, 1: 0x4e2410, 2: 0x6a3418, 3: 0x86461f, 4: 0xa45c2c, 5: 0xc27a44, d: 0x3a1a0a, s: 0x8a8a8a, S: 0xc8c8c8 }, 'saddle');

// ---------------------------------------------------------------------------
// Bottles (glass interior is transparent; only rim/highlights are opaque)

// prettier-ignore
export const BOTTLE = [
  '................',
  '.....######.....',
  '.....#rRRr#.....',
  '......#..#......',
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
// prettier-ignore
export const BOTTLE_FILL = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......LLL......',
  '....LLLLLLLL....',
  '...LLLLLLLLLL...',
  '...LLLLLLLLLL...',
  '...LLLLLLLLLL...',
  '...LLLLLLLLLL...',
  '....LLLLLLLL....',
  '.....LLLLLL.....',
  '................',
  '................',
];
export const GLASS: Pal = { '#': 0xd6e2ec, d: 0xa2b4c4, r: 0xeef4f8, R: 0xc4d2de, h: 0xffffff };

M['glass_bottle'] = () => {
  const t = spr(BOTTLE, GLASS, 'glass_bottle');
  plot(t, 4, 8, 0xffffff);
  plot(t, 4, 9, 0xeef4f8);
  return t;
};

export function liquidBottle(ramp: number[], seed: string, sparkle?: number): TexImage {
  const t = spr(BOTTLE, GLASS, seed);
  const r = rng(seed);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (BOTTLE_FILL[y][x] !== 'L') continue;
      const edge = BOTTLE_FILL[y][x + 1] !== 'L' || BOTTLE_FILL[y + 1]?.[x] !== 'L';
      const top = BOTTLE_FILL[y - 1]?.[x] !== 'L' || BOTTLE_FILL[y][x - 1] !== 'L';
      let k = edge ? 0 : top ? 2 : 1;
      if (sparkle !== undefined && r.chance(0.12)) k = 3;
      plot(t, x, y, k === 3 ? sparkle! : ramp[k]);
    }
  plot(t, 4, 8, 0xffffff);
  plot(t, 4, 9, 0xffffff);
  return t;
}
M['potion'] = () => liquidBottle([0x2a47a8, 0x385dc6, 0x5a82e0], 'potion');
M['experience_bottle'] = () => liquidBottle([0x4a9a1e, 0x7ad23a, 0xb4f06a], 'experience_bottle', 0xf4ffc0);

// ---------------------------------------------------------------------------
// Sugar cane (item form)

// prettier-ignore
const CANE = [
  '................',
  '.......##.......',
  '......#ab#......',
  '......#ab#..##..',
  '..##..#JJ#.#ab#.',
  '.#ab#.#ab#.#ab#.',
  '.#ab#.#ab##lJJ#.',
  '.#JJ#l#ab#.#ab#.',
  '.#ab#.#JJ#.#ab#.',
  '.#ab##lab#.#ab#.',
  '.#ab#.#ab#.#JJ#.',
  '.#JJ#.#ab#l#ab#.',
  '.#ab#.#JJ#.#ab#.',
  '.#ab#.#ab#.#ab#.',
  '..##...##...##..',
  '................',
];
M['sugar_cane'] = () => spr(CANE, { '#': 0x2e4a18, a: 0xb2dc7c, b: 0x86b852, J: 0x6a9a3c, l: 0x5a9a2c }, 'sugar_cane');

// ---------------------------------------------------------------------------
// Doors (window panes are see-through like the vanilla item sprites)

// prettier-ignore
export const DOOR = [
  '...##########...',
  '...#pppppppp#...',
  '...#p..pp..p#...',
  '...#p..pp..p#...',
  '...#pppppppp#...',
  '...#p..pp..p#...',
  '...#p..pp..p#...',
  '...#pppppppp#...',
  '...#PPPPPPPP#...',
  '...#pqpppqpp#...',
  '...#pqpppqhp#...',
  '...#pqpppqpp#...',
  '...#PPPPPPPP#...',
  '...#pqpppqpp#...',
  '...#pqpppqpp#...',
  '...##########...',
];
M['oak_door'] = () => spr(DOOR, { '#': 0x4a3616, p: 0xb08c56, P: 0x8a6c3e, q: 0x9a7a48, h: 0x3a2a12 }, 'oak_door');
M['iron_door'] = () => spr(DOOR, { '#': 0x3a3a3a, p: 0xd4d4d4, P: 0x9e9e9e, q: 0xbababa, h: 0x5a5a5a }, 'iron_door');

// ---------------------------------------------------------------------------
// Sign

// prettier-ignore
export const SIGN = [
  '................',
  '................',
  '.##############.',
  '.#555555555554#.',
  '.#444444444443#.',
  '.#333333333332#.',
  '.#444444444443#.',
  '.#433333333332#.',
  '.#322222222221#.',
  '.######ab######.',
  '......#ab#......',
  '......#ab#......',
  '......#ab#......',
  '......#ab#......',
  '......#ab#......',
  '......####......',
];
M['oak_sign'] = () =>
  spr(SIGN, { '#': 0x3e2c12, 1: 0x7a5e34, 2: 0x8e6e3e, 3: 0xa2804a, 4: 0xb48f56, 5: 0xc4a066, a: 0x6b4f24, b: 0x4f3a18 }, 'oak_sign');

// ---------------------------------------------------------------------------
// Bed (flat three-quarter view)

// prettier-ignore
export const BED = [
  '................',
  '................',
  '................',
  '................',
  '....############',
  '...#WWWrRRRRRRR#',
  '..#WWWwrRRRRRRR#',
  '.#wwwwrrrrrrrrr#',
  '#dddddddddddddd#',
  '#pppppppppppppp#',
  '#PPPPPPPPPPPPPP#',
  '#L##########L#L#',
  '#L#.........#L#.',
  '###.........###.',
  '................',
  '................',
];
M['red_bed'] = () =>
  spr(BED.map((r) => r.slice(0, 16)), { '#': 0x2a1408, W: 0xffffff, w: 0xd8d8d8, R: 0xc8302a, r: 0xa82420, d: 0x7a1814, p: 0xa8844e, P: 0x86673a, L: 0x5e4526 }, 'red_bed');

// ---------------------------------------------------------------------------
// Minecart

// prettier-ignore
export const CART = [
  '................',
  '................',
  '................',
  '................',
  '.##############.',
  '.#555555555554#.',
  '.#4iiiiiiiiii3#.',
  '.#44IIIIIIII32#.',
  '.#444333333332#.',
  '..#4333333322#..',
  '..#3322222221#..',
  '...##########...',
  '..#ww#....#ww#..',
  '..#wW#....#wW#..',
  '...##......##...',
  '................',
];
export const CART_PAL: Pal = {
  '#': 0x2a2a2a, 5: 0xd0d0d0, 4: 0xb0b0b0, 3: 0x8e8e8e, 2: 0x6e6e6e, 1: 0x545454,
  i: 0x3a3a3a, I: 0x4e4e4e, w: 0x3a3a3a, W: 0x7a7a7a,
};
M['minecart'] = () => spr(CART, CART_PAL, 'minecart');

// ---------------------------------------------------------------------------
// Boat

// prettier-ignore
export const BOAT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '##............##',
  '#5#..........#4#',
  '#54##########43#',
  '#44iiiiiiiiii33#',
  '.#433333333332#.',
  '.#444444444443#.',
  '..#3333333332#..',
  '...#22222222#...',
  '....########....',
  '................',
  '................',
];
M['oak_boat'] = () =>
  spr(BOAT, { '#': 0x3a2810, 5: 0xc4a066, 4: 0xb08c56, 3: 0x947244, 2: 0x7a5c34, i: 0x5a4220 }, 'oak_boat');

// ---------------------------------------------------------------------------
// Name tag and lead

// prettier-ignore
const NAME_TAG = [
  '................',
  '.ss.............',
  's..s............',
  's...s###........',
  '.s..#TTT##......',
  '..s#TT.TTT##....',
  '...#TTTTTTTT##..',
  '....#TTTTTTttt#.',
  '.....#TTTTtttt#.',
  '......#TTtttt#..',
  '.......#tttt#...',
  '........#tt#....',
  '.........##.....',
  '................',
  '................',
  '................',
];
M['name_tag'] = () => spr(NAME_TAG, { '#': 0x5a4a2c, T: 0xe6d6a8, t: 0xc8b484, s: 0xb0b0b0 }, 'name_tag');

// prettier-ignore
const LEAD = [
  '................',
  '................',
  '.....######.....',
  '...##rRRRRr##...',
  '..#rR#####Rr#...',
  '.#rR#.....#Rr#..',
  '.#R#.......#R#..',
  '.#R#.......#R#..',
  '.#rR#.....#Rr#..',
  '..#rR#####Rr#...',
  '...##rRRkKr##...',
  '.....####kK#....',
  '.........#kK#...',
  '..........#kK#..',
  '...........#k#..',
  '............#...',
];
M['lead'] = () => spr(LEAD, { '#': 0x3a2a14, r: 0xc8a472, R: 0x9a7848, k: 0x8a6a3e, K: 0xb89664 }, 'lead');

// ---------------------------------------------------------------------------
// Painting and item frame

// prettier-ignore
const PAINTING = [
  '................',
  '.##############.',
  '.#ffffffffffff#.',
  '.#fsssssssssSf#.',
  '.#fsssssssyYSf#.',
  '.#fsscccsssySf#.',
  '.#fsssssssssSf#.',
  '.#fsssssgGgssf#.',
  '.#fsgGgggggggf#.',
  '.#fggggGggggGf#.',
  '.#fgGgggmmgggf#.',
  '.#fgggggmmgggf#.',
  '.#fGgggggggggf#.',
  '.#ffffffffffff#.',
  '.##############.',
  '................',
];
M['painting'] = () =>
  spr(PAINTING, { '#': 0x3a2410, f: 0x8a5a2a, s: 0x78aee8, S: 0x5a8ed0, c: 0xf0f4f8, y: 0xf8d840, Y: 0xfff8a8, g: 0x5a9a3a, G: 0x3e7a28, m: 0x8a6a4a }, 'painting');

// prettier-ignore
const FRAME = [
  '................',
  '.##############.',
  '.#555555555554#.',
  '.#544444444432#.',
  '.#54########32#.',
  '.#54#llllll#32#.',
  '.#54#lLLLLl#32#.',
  '.#54#lLLLLl#32#.',
  '.#54#lLLLLl#32#.',
  '.#54#lLLLLl#32#.',
  '.#54#llllll#32#.',
  '.#54########32#.',
  '.#433333333322#.',
  '.#222222222221#.',
  '.##############.',
  '................',
];
M['item_frame'] = () =>
  spr(FRAME.map((r) => r.slice(0, 16)), { '#': 0x3a2810, 5: 0xc4a066, 4: 0xa8854f, 3: 0x8c6c3e, 2: 0x6e5430, 1: 0x544024, l: 0x8a4e26, L: 0xa4622e }, 'item_frame');

// ---------------------------------------------------------------------------
// Amethyst shard: a long crystal with a sharp tip up and to the right and a
// broken-off base, a pale ridge along its lit upper face

// prettier-ignore
const AMETHYST_SHARD = [
  '................',
  '................',
  '.............#..',
  '............#h#.',
  '...........#hw#.',
  '..........#hwc#.',
  '.........#hwcm#.',
  '........#hwcmd#.',
  '.......#hwcmd#..',
  '......#hwcmd#...',
  '.....#wwcmd#....',
  '....#wccmd#.....',
  '...#wccmd#......',
  '...#ccmd#.......',
  '...#cmd#........',
  '....###.........',
];
M['amethyst_shard'] = () =>
  spr(AMETHYST_SHARD, { '#': 0x2e1f4d, h: 0xe9d2ff, w: 0xcfa8f6, c: 0xa27fdc, m: 0x8a68c8, d: 0x684aa8 }, 'amethyst_shard');

// ---------------------------------------------------------------------------
// Pointed dripstone: a whole spike, broad base down, tip up

// prettier-ignore
const POINTED_DRIPSTONE = [
  '.......#........',
  '.......#........',
  '......#5#.......',
  '......#4#.......',
  '......#43#......',
  '.....#543#......',
  '.....#5432#.....',
  '.....#6432#.....',
  '....#65432#.....',
  '....#654321#....',
  '....#654421#....',
  '...#6554321#....',
  '...#6554321#....',
  '...#65543221#...',
  '..#665543221#...',
  '..############..',
];
M['pointed_dripstone'] = () =>
  spr(POINTED_DRIPSTONE, { '#': 0x3a2c25, 1: 0x4d3b32, 2: 0x5b463b, 3: 0x695246, 4: 0x775d50, 5: 0x846858, 6: 0x9d7f6f }, 'pointed_dripstone');

// ---------------------------------------------------------------------------
// Small dripleaf: a stem with little leaves; spore blossom: four pink petals round a green middle

// prettier-ignore
const SMALL_DRIPLEAF = [
  '................',
  '..qqq.....qqq...',
  '.qlllq...qlllq..',
  '.qllggq.qggllq..',
  '..qqggqqqggqq...',
  '....qqgqgqq.....',
  '..qqq.qgq.......',
  '.qlllqqgq.......',
  '.qllgggqq.......',
  '..qqqqgq........',
  '.....qgq........',
  '.....qgq........',
  '......qgq.......',
  '......qgq.......',
  '......qgq.......',
  '.......q........',
];
M['small_dripleaf'] = () => spr(SMALL_DRIPLEAF, { q: 0x1f3d0f, g: 0x508127, l: 0x82b845 }, 'small_dripleaf');

// prettier-ignore
const SPORE_BLOSSOM = [
  '................',
  '..###......###..',
  '.#ppp#....#ppp#.',
  '.#pPPp#..#pPPp#.',
  '.#pPPPp##pPPPp#.',
  '..#pPPpggpPPp#..',
  '...#ppgGGgpp#...',
  '....#gGllGg#....',
  '....#gGllGg#....',
  '...#ppgGGgpp#...',
  '..#pPPpggpPPp#..',
  '.#pPPPp##pPPPp#.',
  '.#pPPp#..#pPPp#.',
  '.#ppp#....#ppp#.',
  '..###......###..',
  '................',
];
M['spore_blossom'] = () => spr(SPORE_BLOSSOM, { '#': 0x4a1d47, p: 0xa8509f, P: 0xd77dcb, g: 0x486622, G: 0x628532, l: 0x80a445 }, 'spore_blossom');
