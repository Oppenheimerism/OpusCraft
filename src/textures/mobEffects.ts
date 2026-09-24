// Status effect icons (18x18, vanilla textures/mob_effect/*): original pixel art in the style of
// vanilla 1.21, one per registered effect, keyed mob_effect_<id>. Shapes are drawn as fill patterns;
// `icon` adds the dark hue-matched outline vanilla icons have.

import { TexImage, img, plot, mulC } from './tex';

const N = 18;

interface IconOpts {
  /** pattern chars that get no outline (sparkles, see-through bits) */
  noOutline?: string;
  /** fixed outline colour instead of a darkened neighbour */
  outline?: number;
}

function lum(c: number): number {
  return ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
}

/** 18 rows of 18 chars; '.' = empty, other chars index `inks` */
function icon(rows: readonly string[], inks: Record<string, number>, o: IconOpts = {}): TexImage {
  if (rows.length !== N || rows.some((r) => r.length !== N)) throw new Error('mob effect icon: pattern must be 18x18');
  const t = img(N, N);
  const bare = new Set(o.noOutline ?? 'W');
  const col = (x: number, y: number): number | null => {
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
    const ch = rows[y][x];
    if (ch === '.' || bare.has(ch)) return null;
    const c = inks[ch];
    if (c === undefined) throw new Error(`mob effect icon: unknown char '${ch}'`);
    return c;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const ch = rows[y][x];
      if (ch !== '.') plot(t, x, y, inks[ch]);
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (rows[y][x] !== '.') continue;
      let best: number | null = null;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const c = col(x + dx, y + dy);
        if (c !== null && (best === null || lum(c) < lum(best))) best = c;
      }
      if (best !== null) plot(t, x, y, o.outline ?? mulC(best, 0.4));
    }
  return t;
}

/** build pattern rows from a per-pixel function */
function rowsOf(f: (x: number, y: number) => string): string[] {
  const out: string[] = [];
  for (let y = 0; y < N; y++) {
    let r = '';
    for (let x = 0; x < N; x++) r += f(x, y);
    out.push(r);
  }
  return out;
}

function blank(): string[] {
  return Array.from({ length: N }, () => '.'.repeat(N));
}

/** set pixels in a pattern */
function put(rows: string[], pts: [number, number][], ch: string): string[] {
  const g = rows.map((r) => [...r]);
  for (const [x, y] of pts) if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = ch;
  return g.map((r) => r.join(''));
}

const SPARKLE = (x: number, y: number): [number, number][] => [[x, y - 1], [x - 1, y], [x, y], [x + 1, y], [x, y + 1]];

// ---------------------------------------------------------------------------
// Shapes

const HEART = [
  '..................',
  '..................',
  '..................',
  '...hhll....llmm...',
  '..hhlmmm..mmmmmd..',
  '..hlmmmmmmmmmmmd..',
  '..lmmmmmmmmmmmmd..',
  '..mmmmmmmmmmmmdd..',
  '...mmmmmmmmmmmd...',
  '....mmmmmmmmmd....',
  '.....mmmmmmmd.....',
  '......mmmmmd......',
  '.......mmmd.......',
  '........md........',
  '..................',
  '..................',
  '..................',
  '..................',
];

const PICKAXE = [
  '..................',
  '..................',
  '.....hhhhhh.......',
  '....hllllllmd.....',
  '.....ddddmllmd....',
  '.........dmlmd....',
  '........w.dmmd....',
  '.......ww.dmmd....',
  '......ww...dmd....',
  '.....ww....dmd....',
  '....ww......dd....',
  '...ww.............',
  '..ww..............',
  '.ww...............',
  '.w................',
  '..................',
  '..................',
  '..................',
];

/** diagonal sword, tip top-right; `broken` snaps the blade off halfway */
function sword(broken: boolean): string[] {
  return rowsOf((x, y) => {
    const s = x + y, t = x - y;
    if (s >= 15 && s <= 17 && t >= -1 && t <= 14 && !(s === 17 && t === 14)) {
      if (broken && (t > 6 || (t === 6 && s !== 16) || (t === 5 && s === 15))) return '.';
      return s === 15 ? 'h' : s === 16 ? 'l' : 'm';
    }
    if ((t === -4 || t === -3) && s >= 12 && s <= 20) return t === -4 ? 'g' : 'G';
    if ((s === 16 || s === 17) && t >= -11 && t <= -5) return s === 16 ? 'w' : 'v';
    if (t >= -14 && t <= -12 && s >= 15 && s <= 18) return 'g';
    return '.';
  });
}

const EYE = [
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '......llllll......',
  '....wwwwiiwwww....',
  '...wwwwiiiiwwww...',
  '..wwwwiipgiiwwww..',
  '..wwwwiippiiwwww..',
  '...wwwwiiiiwwww...',
  '....wwwwiiwwww....',
  '......dddddd......',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
];

const SKULL = [
  '..................',
  '..................',
  '.....hhhhhhhh.....',
  '....hsssssssss....',
  '...hssssssssssd...',
  '...sssssssssssd...',
  '...ss...ss...sd...',
  '...ss...ss...sd...',
  '...sss.ssss.ssd...',
  '....ssssssssss....',
  '.....sss..sss.....',
  '......ssssss......',
  '......s.ss.s......',
  '.......ssss.......',
  '..................',
  '..................',
  '..................',
  '..................',
];

const DRUMSTICK = [
  '..................',
  '..................',
  '..........hlll....',
  '........hllmmmm...',
  '.......hlmmmmmmd..',
  '.......lmmmmmmmd..',
  '......lmmmmmmmmd..',
  '......mmmmmmmmdd..',
  '......mmmmmmmdd...',
  '.......mmmmddd....',
  '......bbdddd......',
  '.....bb...........',
  '....bbb...........',
  '..bbbb............',
  '.bb.bb............',
  '..................',
  '..................',
  '..................',
];

const BOOT = [
  '..................',
  '..................',
  '........llll......',
  '........lmmm......',
  '........lmmm......',
  '........lmmm......',
  '........lmmm......',
  '........lmmm......',
  '........lmmmm.....',
  '.......lmmmmmmmm..',
  '.......lmmmmmmmmm.',
  '.......dddddddddd.',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
];

const FLAME = [
  '..................',
  '.........r........',
  '........rr........',
  '........rro.......',
  '.......rroor......',
  '......rrooorr.....',
  '.....rrooyoorr....',
  '....rrrooyyoorr...',
  '....rrooyyyyoor...',
  '....rrooyyWyoorr..',
  '....rrooyyWWyoor..',
  '....rrooyyyyyoor..',
  '.....rrooyyyoorr..',
  '......rroooorrr...',
  '.......rrrrrrr....',
  '..................',
  '..................',
  '..................',
];

const FEATHER = [
  '..................',
  '..............vv..',
  '............wwvl..',
  '..........wwwwl...',
  '.........wwwwlv...',
  '........wwwwlvv...',
  '.......wwwwlvv....',
  '......wwwwlvv.....',
  '.....wwwwlvv......',
  '....wwwwlvv.......',
  '....wwwlvv........',
  '...wwwlv..........',
  '...wwlv...........',
  '..wwl.............',
  '..wl..............',
  '.q................',
  '..................',
  '..................',
];

/** four-leaf clover (plus-shaped leaves) with a stem to the lower right; `wilted` drops the bottom leaf */
function clover(wilted: boolean): string[] {
  const leaf = ['.lll.', 'lmmmm', 'lmmmm', 'mmmmd', '.mdd.'];
  let g = blank();
  const at = (x0: number, y0: number, notch: [number, number]) => {
    const rows: [number, number][] = [];
    const light: [number, number][] = [];
    const dark: [number, number][] = [];
    leaf.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return;
      if (x === notch[0] && y === notch[1]) return;
      (c === 'l' ? light : c === 'd' ? dark : rows).push([x0 + x, y0 + y]);
    }));
    g = put(g, rows, 'm');
    g = put(g, light, 'l');
    g = put(g, dark, 'd');
  };
  at(6, 2, [2, 0]);
  at(2, 6, [0, 2]);
  at(10, 6, [4, 2]);
  if (!wilted) at(6, 10, [2, 4]);
  g = put(g, [[7, 7], [8, 7], [9, 7], [7, 8], [8, 8], [9, 8], [7, 9], [8, 9], [9, 9]], 'm');
  g = put(g, [[11, 11], [12, 12], [13, 13], [14, 14], [12, 11], [13, 12], [14, 13]], 's');
  if (wilted) g = put(g, [[7, 10], [8, 11], [8, 12], [9, 13]], 'd');
  return g;
}

const DROP = [
  '..................',
  '..................',
  '........m.........',
  '.......lmm........',
  '.......lmm........',
  '......lmmmd.......',
  '.....lmmmmmd......',
  '....lmmmmbmmd.....',
  '....hWmmmmmmd.....',
  '...hlmmmmmmbmd....',
  '...hmmmbmmmmmd....',
  '...lmmmmmmmmmd....',
  '...mmmmmmbmmdd....',
  '....mmmmmmmdd.....',
  '.....mmmmddd......',
  '......ddddd.......',
  '..................',
  '..................',
];

const CHESTPLATE = [
  '..................',
  '..................',
  '...lll......lll...',
  '..llmmm....mmmmd..',
  '..lmmmmmmmmmmmmd..',
  '..lmmmmmmmmmmmmd..',
  '...lmmmmmmmmmmd...',
  '....lmmmmmmmmd....',
  '....lmmmmmmmmd....',
  '....lmmmmmmmmd....',
  '....lmmmmmmmmd....',
  '....lmmmmmmmmd....',
  '....dddddddddd....',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
];

const FIGURE = [
  '..................',
  '.......hhhh.......',
  '.......hsss.......',
  '.......ssss.......',
  '.......sssd.......',
  '.....hhsssssd.....',
  '.....hsssssdd.....',
  '.....ssssssdd.....',
  '.....ssssssdd.....',
  '.....ssssssdd.....',
  '.....s.sssd.d.....',
  '.......sssd.......',
  '.......sssd.......',
  '.......sssd.......',
  '.......ss.d.......',
  '.......ss.d.......',
  '..................',
  '..................',
];

/** Archimedean spiral (nausea), two turns around the centre */
function spiral(): string[] {
  const g = Array.from({ length: N }, () => Array(N).fill('.'));
  for (let t = 0; t < Math.PI * 4.2; t += 0.02) {
    const r = 0.6 + t * 0.52;
    const x = Math.round(8.5 + r * Math.cos(t) - 0.5), y = Math.round(8.5 + r * Math.sin(t) - 0.5);
    if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = 'g';
  }
  // a darker drop shadow below-right keeps the line readable
  for (let y = N - 1; y > 0; y--)
    for (let x = N - 1; x > 0; x--) if (g[y][x] === '.' && g[y - 1][x - 1] === 'g') g[y][x] = 'G';
  return g.map((r) => r.join(''));
}

/** water breathing: rising bubbles */
function bubbles(): string[] {
  const g = Array.from({ length: N }, () => Array(N).fill('.'));
  const bubble = (cx: number, cy: number, r: number) => {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r - 1) g[y][x] = 'i';
        else if (d <= r) g[y][x] = 'b';
      }
    g[Math.floor(cy - r * 0.45)][Math.floor(cx - r * 0.45)] = 'W';
  };
  bubble(6.5, 11, 4.3);
  bubble(12.5, 5.5, 3.2);
  bubble(13.5, 13.5, 2.1);
  bubble(5.5, 3.5, 1.8);
  return g.map((r) => r.join(''));
}

/** invisibility: the figure's edge solid, its inside a see-through checker */
function ghost(): string[] {
  return FIGURE.map((r, y) => [...r].map((c, x) => {
    if (c === '.') return '.';
    const edge = [[0, -1], [-1, 0], [1, 0], [0, 1]].some(([dx, dy]) => (FIGURE[y + dy]?.[x + dx] ?? '.') === '.');
    return edge ? 'e' : (x + y) % 2 === 0 ? 'f' : '.';
  }).join(''));
}

/** small up arrow (3 wide) at column x, tip at row y */
function upArrow(x: number, y: number): [number, number][] {
  return [[x + 1, y], [x, y + 1], [x + 1, y + 1], [x + 2, y + 1], [x + 1, y + 2], [x + 1, y + 3], [x + 1, y + 4]];
}

// ---------------------------------------------------------------------------
// Palettes and icons

const heart = (d: number, m: number, l: number, h: number) => ({ d, m, l, h });

function heartIcon(p: ReturnType<typeof heart>, extra?: (rows: string[]) => string[], inks: Record<string, number> = {}): TexImage {
  const rows = extra ? extra(HEART) : HEART;
  return icon(rows, { d: p.d, m: p.m, l: p.l, h: p.h, W: 0xffffff, ...inks });
}

const WOOD = { w: 0x8a5a2a };

// the 1.21 potions' effects and the rest of the registry

/** oozing: a slime cube with its face */
const SLIME_CUBE = [
  '..................',
  '..................',
  '..................',
  '...gggggggggggg...',
  '...gLLLLLLLLLLg...',
  '...gLllllllllLg...',
  '...gLlkkllkklLg...',
  '...gLlkkllkklLg...',
  '...gLllllllllLg...',
  '...gLllllllllLg...',
  '...gLllllkkllLg...',
  '...gLllllllllLg...',
  '...gLLllllllLLg...',
  '...gLLLLLLLLLLg...',
  '...gggggggggggg...',
  '..................',
  '..................',
  '..................',
];

/** infested: a silverfish curled up, its segments and feelers */
const SILVERFISH = [
  '..................',
  '..................',
  '..................',
  '..f...............',
  '...f..............',
  '....hh.hhh........',
  '...hllhlllhhh.....',
  '...hlkhlllhllhh...',
  '...hllhlllhlllhh..',
  '....mmmmmmmmmmlh..',
  '.....mmmmmmmmmmh..',
  '...........mmmhh..',
  '............mmh...',
  '.............h....',
  '..................',
  '..................',
  '..................',
  '..................',
];

/** weaving: a web strung between the corners */
function web(): string[] {
  const g = Array.from({ length: N }, () => Array(N).fill('.'));
  const c = 8.5;
  // the spokes
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    for (let r = 0; r < 9; r += 0.25) {
      const x = Math.floor(c + r * Math.cos(t)), y = Math.floor(c + r * Math.sin(t));
      if (x >= 1 && y >= 1 && x < N - 1 && y < N - 1) g[y][x] = 's';
    }
  }
  // the rings between them
  for (const R of [3, 6]) {
    for (let a = 0; a < 8; a++) {
      const t0 = (a / 8) * Math.PI * 2, t1 = ((a + 1) / 8) * Math.PI * 2;
      const x0 = c + R * Math.cos(t0), y0 = c + R * Math.sin(t0), x1 = c + R * Math.cos(t1), y1 = c + R * Math.sin(t1);
      for (let k = 0; k <= 1; k += 0.05) {
        const x = Math.floor(x0 + (x1 - x0) * k), y = Math.floor(y0 + (y1 - y0) * k);
        if (g[y][x] === '.') g[y][x] = 'r';
      }
    }
  }
  return g.map((r) => r.join(''));
}

/** wind charged: a gust curling round on itself */
function gust(): string[] {
  const g = Array.from({ length: N }, () => Array(N).fill('.'));
  for (let t = 0; t < Math.PI * 3.1; t += 0.02) {
    const r = 7.2 - t * 0.62;
    const x = Math.round(8.5 + r * Math.cos(t + 0.6) - 0.5), y = Math.round(8.5 + r * Math.sin(t + 0.6) * 0.8 - 0.5);
    if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = t < 3 ? 'w' : 'm';
  }
  return g.map((r) => r.join(''));
}

/** an eye closed over darkness, or an omen's banner-like flag: simple symbols for the effects nothing here gives */
const FLAG = [
  '..................',
  '...hhhhhhhhhhh....',
  '...hmmmmmmmmmh....',
  '...hmmmllmmmmh....',
  '...hmmlllllmmh....',
  '...hmmmllmmmmh....',
  '...hmmlmmlmmmh....',
  '...hmlmmmmlmmh....',
  '...hmmmmmmmmmh....',
  '...hmmmmmmmmmh....',
  '...hmmmmmmmmmh....',
  '...hmmmmmmmmmh....',
  '...hmm.hh.mmmh....',
  '...hm.......mh....',
  '...h.........h....',
  '...h..............',
  '...h..............',
  '..................',
];

export const MOB_EFFECT_TEXTURES: Record<string, () => TexImage> = {
  mob_effect_speed: () =>
    icon(put(put(put(BOOT, [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4]], 'W'), [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], 'W'), [[3, 10], [4, 10], [5, 10]], 'W'), { l: 0xa8f4ff, m: 0x33c4e8, d: 0x16708e, W: 0xe8ffff }),
  mob_effect_slowness: () =>
    icon(put(put(BOOT, [[2, 11], [3, 11], [1, 12], [2, 12], [3, 12], [4, 12], [1, 13], [2, 13], [3, 13], [4, 13], [2, 14], [3, 14]], 'k'), [[4, 10], [5, 10], [6, 10]], 'c'), { l: 0xc8d8f0, m: 0x8bafe0, d: 0x4a6488, k: 0x4a4a52, c: 0x8a8a94 }),
  mob_effect_haste: () => icon(put(PICKAXE, SPARKLE(15, 2), 'W'), { h: 0xfff4a0, l: 0xf5d33a, m: 0xd9a81e, d: 0x9a6e0e, ...WOOD, W: 0xffffff }),
  mob_effect_mining_fatigue: () => icon(put(PICKAXE, [[11, 7], [12, 8], [11, 9]], '.'), { h: 0x9a9480, l: 0x7a7460, m: 0x5e5846, d: 0x3e3a2c, w: 0x5a3c1e }),
  mob_effect_strength: () => icon(sword(false), { h: 0xffd8d0, l: 0xf05a48, m: 0xb82818, g: 0xffc700, G: 0xc89400, w: 0x6a4020, v: 0x4a2c14 }),
  mob_effect_weakness: () => icon(sword(true), { h: 0xdadada, l: 0x9a9e9a, m: 0x6a6e6a, g: 0x7a7a70, G: 0x5a5a52, w: 0x4a3a2c, v: 0x342a20 }),
  mob_effect_instant_health: () => heartIcon(heart(0xa8141a, 0xe8262a, 0xf85a5a, 0xffc8c8), (r) => put(r, SPARKLE(15, 1), 'W')),
  mob_effect_instant_damage: () =>
    heartIcon(heart(0x4a0c14, 0x7a1a24, 0x9a3038, 0xb85050), (r) => put(r, [[9, 4], [8, 5], [9, 6], [10, 7], [9, 8], [8, 9], [9, 10]], '.')),
  mob_effect_jump_boost: () => icon(put(BOOT, upArrow(2, 2), 'a'), { l: 0xfeffd0, m: 0xe0e25a, d: 0x8e901c, a: 0x8cf05a }),
  mob_effect_nausea: () => icon(spiral(), { g: 0x8cc048, G: 0x3c5c1a }, { noOutline: 'gG' }),
  mob_effect_regeneration: () => heartIcon(heart(0xa83480, 0xd85cab, 0xf08cd0, 0xffd0f0), (r) => put(put(r, SPARKLE(15, 2), 'W'), SPARKLE(2, 14), 'W')),
  mob_effect_resistance: () => icon(CHESTPLATE, { l: 0xdcd0fa, m: 0xa98aea, d: 0x6a48b8 }),
  mob_effect_fire_resistance: () => icon(FLAME, { r: 0xd8501a, o: 0xff9900, y: 0xffe060, W: 0xfff8d0 }),
  mob_effect_water_breathing: () => icon(bubbles(), { b: 0x3a8a9a, i: 0xc8f0e8, W: 0xffffff }, { noOutline: 'biW' }),
  mob_effect_invisibility: () => icon(ghost(), { e: 0xc8c8c8, f: 0xf6f6f6 }, { noOutline: 'ef' }),
  // a dark, unseeing eye
  mob_effect_blindness: () => icon(EYE, { w: 0x3a3a44, l: 0x575764, d: 0x24242c, i: 0x1a1a20, p: 0x0a0a0c, g: 0x0a0a0c }, { outline: 0x0c0c0e }),
  mob_effect_night_vision: () => icon(EYE, { w: 0xe6f0ff, l: 0xffffff, d: 0x9ab0d0, i: 0x3c8cff, p: 0x0a1030, g: 0xffffff }),
  mob_effect_hunger: () => icon(DRUMSTICK, { h: 0xc0d880, l: 0x9bb04e, m: 0x6b8428, d: 0x445c16, b: 0xd6e2b8 }),
  mob_effect_poison: () => icon(DROP, { h: 0xc8f080, l: 0x98cc50, m: 0x6aa030, d: 0x3a6818, b: 0x4a7a20, W: 0xffffff }),
  mob_effect_wither: () => icon(SKULL, { h: 0x767676, s: 0x505050, d: 0x383838 }, { outline: 0x121212 }),
  mob_effect_health_boost: () =>
    heartIcon(heart(0xb84a10, 0xf87d23, 0xffa860, 0xffe0b8), (r) => put(r, [[8, 5], [7, 6], [8, 6], [9, 6], [8, 7], [6, 6], [10, 6], [8, 8]], 'W')),
  mob_effect_absorption: () => heartIcon(heart(0xc08400, 0xf0c020, 0xffe060, 0xfff8c0)),
  mob_effect_saturation: () =>
    icon(put(DRUMSTICK, SPARKLE(14, 12), 'W'), { h: 0xffd8a0, l: 0xeea662, m: 0xc0702e, d: 0x844418, b: 0xf2eee0, W: 0xffffff }),
  mob_effect_levitation: () => icon(put(put(FIGURE, upArrow(1, 8), 'a'), upArrow(14, 8), 'a'), { h: 0xffffff, s: 0xceffff, d: 0x8ad0d8, a: 0xffffff }),
  mob_effect_luck: () => icon(clover(false), { l: 0x9ae84a, m: 0x59c106, d: 0x3a8a04, s: 0x3a8a04 }),
  mob_effect_unluck: () => icon(clover(true), { l: 0xd8c070, m: 0xa88a3a, d: 0x6e5a22, s: 0x6e5a22 }),
  mob_effect_slow_falling: () => icon(FEATHER, { w: 0xfff6f0, v: 0xf3cfb9, l: 0xc89878, q: 0xa87858 }),
  mob_effect_glowing: () => icon(FIGURE, { h: 0xfaffc8, s: 0xd8e690, d: 0x94a061 }),
  mob_effect_conduit_power: () => icon(EYE, { w: 0xc8f4f8, l: 0xffffff, d: 0x5ab0bc, i: 0x1dc2d1, p: 0x0a2a30, g: 0xffffff }),
  mob_effect_dolphins_grace: () => icon(put(put(FIGURE, upArrow(1, 8), 'a'), upArrow(14, 8), 'a'), { h: 0xe0ecf8, s: 0x88a3be, d: 0x5a7490, a: 0xc8e0f8 }),
  mob_effect_bad_omen: () => icon(FLAG, { h: 0x3a3a3a, m: 0x0b6138, l: 0xdadada }),
  mob_effect_hero_of_the_village: () => icon(FLAG, { h: 0x6a4a2a, m: 0x44ff44, l: 0x1a7a1a }),
  mob_effect_darkness: () => icon(EYE, { w: 0x3a3836, l: 0x4a4744, d: 0x1e1c1b, i: 0x292721, p: 0x050505, g: 0x050505 }, { outline: 0x0a0a0a }),
  mob_effect_trial_omen: () => icon(FLAG, { h: 0x3a3a3a, m: 0x16a6a6, l: 0xe8f8f8 }),
  mob_effect_raid_omen: () => icon(FLAG, { h: 0x3a3a3a, m: 0xde4058, l: 0xf8e0e4 }),
  mob_effect_wind_charged: () => icon(gust(), { w: 0xe8ecff, m: 0xbdc9ff }),
  mob_effect_weaving: () => icon(web(), { s: 0xe0dad0, r: 0xb0a898 }),
  mob_effect_oozing: () => icon(SLIME_CUBE, { g: 0x4a9a3a, L: 0x99ffa3, l: 0x7ad884, k: 0x2a5a24 }),
  mob_effect_infested: () => icon(SILVERFISH, { h: 0x6a746a, l: 0xb4c0b4, m: 0x8c9b8c, k: 0x1a1a1a, f: 0x8c9b8c }),
};
