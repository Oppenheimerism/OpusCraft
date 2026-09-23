// Sprites for items the advancements screen shows as icons before the game
// has them: shield, banner, trial keys, armor trim templates and a few
// Trails & Tales / Tricky Trials items. Items that are 3D models in vanilla
// are drawn as the model seen at the vanilla inventory angle: the block-shaped
// ones (sniffer egg, sculk sensor, decorated pot) are ray-cast from their box
// models with the GUI face shading and, like the rendered block icons, have
// no outline; the shield, banner and lightning rod keep the sprite outline so
// they read like the other flat item icons next to them.

import { TexImage, plot, mulC } from '../tex';
import { Gen, Pal, spr, over, outline4, rng, paint } from './common';
import { blank } from './misc';
import { INGOT_MATS } from './materials';

export const ICON_ITEMS: Record<string, Gen> = {};
const I = ICON_ITEMS;

// ---------------------------------------------------------------------------
// Tiny ray caster for block-model icons: axis-aligned boxes in model units
// (0..16) seen with the vanilla block GUI transform (rotX 30, rotY 225,
// scale 0.625), one sample per pixel centre like the game at GUI scale 1.

type V3 = [number, number, number];
type Face = 'up' | 'down' | 'north' | 'south' | 'west' | 'east';
/** Colour of a face at face texel (u, v) in 0..16 (vanilla UV orientation). */
type FaceTex = (face: Face, u: number, v: number) => number;
interface Cuboid {
  from: V3;
  to: V3;
  tex: FaceTex;
}

/** GUI face brightness (same as the block icon renderer). */
const FACE_LIGHT: Record<Face, number> = { up: 1, down: 0.5, north: 0.6, south: 0.8, west: 0.8, east: 0.8 };
const RX = (30 * Math.PI) / 180, RY = (225 * Math.PI) / 180;
const GUI_SCALE = 0.625;

/** Model point -> icon pixel coordinates (x right, y down). */
function isoProject(p: V3, dy = 0): [number, number] {
  let x = (p[0] / 16 - 0.5) * GUI_SCALE, y = (p[1] / 16 - 0.5) * GUI_SCALE, z = (p[2] / 16 - 0.5) * GUI_SCALE;
  [x, z] = [x * Math.cos(RY) + z * Math.sin(RY), -x * Math.sin(RY) + z * Math.cos(RY)];
  [y, z] = [y * Math.cos(RX) - z * Math.sin(RX), y * Math.sin(RX) + z * Math.cos(RX)];
  return [8 + x * 16, 8 - y * 16 + dy];
}

/** Icon pixel (+ view depth) -> model point. */
function isoUnproject(sx: number, sy: number, depth: number, dy: number): V3 {
  let x = (sx - 8) / 16, y = (8 + dy - sy) / 16, z = depth / 16;
  [y, z] = [y * Math.cos(RX) + z * Math.sin(RX), -y * Math.sin(RX) + z * Math.cos(RX)];
  [x, z] = [x * Math.cos(RY) - z * Math.sin(RY), x * Math.sin(RY) + z * Math.cos(RY)];
  return [(x / GUI_SCALE + 0.5) * 16, (y / GUI_SCALE + 0.5) * 16, (z / GUI_SCALE + 0.5) * 16];
}

function faceUV(f: Face, p: V3): [number, number] {
  const [x, y, z] = p;
  switch (f) {
    case 'up': return [x, z];
    case 'down': return [x, 16 - z];
    case 'north': return [16 - x, 16 - y];
    case 'south': return [x, 16 - y];
    case 'west': return [z, 16 - y];
    default: return [16 - z, 16 - y];
  }
}

/** Render boxes to a 16x16 icon; `dy` moves the model down (px). */
function isoRender(boxes: Cuboid[], dy = 0): TexImage {
  const t = blank();
  for (let py = 0; py < 16; py++)
    for (let px = 0; px < 16; px++) {
      const o = isoUnproject(px + 0.5, py + 0.5, 40, dy);
      const e = isoUnproject(px + 0.5, py + 0.5, -40, dy);
      const d: V3 = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
      let best = Infinity, col = 0;
      for (const b of boxes) {
        let tn = -Infinity, tf = Infinity, ax = 0;
        for (let k = 0; k < 3; k++) {
          const t0 = (b.from[k] - o[k]) / d[k], t1 = (b.to[k] - o[k]) / d[k];
          const lo = Math.min(t0, t1), hi = Math.max(t0, t1);
          if (lo > tn) (tn = lo), (ax = k);
          tf = Math.min(tf, hi);
        }
        if (tn > tf || tn >= best) continue;
        const f: Face = ax === 0 ? (d[0] > 0 ? 'west' : 'east') : ax === 1 ? (d[1] > 0 ? 'down' : 'up') : d[2] > 0 ? 'north' : 'south';
        const h: V3 = [o[0] + d[0] * tn, o[1] + d[1] * tn, o[2] + d[2] * tn];
        const [u, v] = faceUV(f, h);
        best = tn;
        col = mulC(b.tex(f, Math.min(15.999, Math.max(0, u)), Math.min(15.999, Math.max(0, v))), FACE_LIGHT[f]);
      }
      if (best < Infinity) plot(t, px, py, col);
    }
  return t;
}

/** Colour lookup in a 16-row texture painted as strings. */
function texRows(rows: string[], pal: Record<string, number>): (u: number, v: number) => number {
  return (u, v) => {
    const ch = rows[Math.floor(v)]?.[Math.floor(u)] ?? '.';
    const c = pal[ch];
    if (c === undefined) throw new Error(`icon texture: unknown char '${ch}'`);
    return c;
  };
}

// ---------------------------------------------------------------------------
// Shield: the builtin entity model at the vanilla GUI angle (rot 15/-25/-5,
// scale 0.65) is a tall, narrow board turned a little to the right, so its
// top and bottom edges slope down to the right. Dark wooden planks (vanilla
// uses dark oak for its particles) framed by an iron rim.

/** Split a silhouette into outline ring, second ring and interior. */
function rings(mask: string[]): number[][] {
  const inside = (x: number, y: number) => (mask[y]?.[x] ?? '.') !== '.';
  const depth: number[][] = [];
  for (let y = 0; y < 16; y++) {
    depth.push([]);
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) depth[y].push(0);
      else if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) depth[y].push(1);
      else depth[y].push(9);
    }
  }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (depth[y][x] === 9 && [depth[y][x - 1], depth[y][x + 1], depth[y - 1]?.[x], depth[y + 1]?.[x]].includes(1)) depth[y][x] = 2;
  return depth;
}

// prettier-ignore
const SHIELD = [
  '....XXXX........',
  '....XXXXXXXX....',
  '....XXXXXXXXX...',
  '....XXXXXXXXX...',
  '....XXXXXXXXX...',
  '....XXXXXXXXX...',
  '....XXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXXXXXXX....',
  '...XXXXXXXXX....',
  '...XXXXXXXXX....',
  '...XXXXXXXXX....',
  '...XXXXXXXXX....',
  '....XXXXXXXX....',
  '........XXXX....',
];

I['shield'] = () => {
  const t = blank();
  const d = rings(SHIELD);
  const r = rng('shield');
  // plank column across the board; the left edge steps one pixel left at row 7
  const col = (x: number, y: number) => x - 4 + (y >= 7 ? 1 : 0);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const k = d[y][x];
      if (!k) continue;
      if (k === 1) {
        plot(t, x, y, 0x2e2e2e);
        continue;
      }
      if (k === 2) {
        const lit = d[y][x - 1] === 1 || d[y - 1]?.[x] === 1;
        const shade = d[y][x + 1] === 1 || d[y + 1]?.[x] === 1;
        plot(t, x, y, lit && !shade ? 0xd8d8d8 : shade && !lit ? 0x858585 : 0xb3b3b3);
        continue;
      }
      // two planks with a seam down the middle, following the lean
      const c = col(x, y);
      let w = 0x7a5832;
      if (c === 4) w = 0x4e3620;
      else if (c === 3 || c === 7) w = r.chance(0.5) ? 0x8c683c : 0x7a5832;
      else if (r.chance(0.22)) w = 0x644628;
      plot(t, x, y, w);
    }
  return t;
};

// ---------------------------------------------------------------------------
// White banner: the flag hanging from its crossbar with the pole's foot below
// it, as the entity model shows in the inventory (seen from a little above).

// prettier-ignore
const BANNER = [
  '................',
  '...##########...',
  '...#aAAAAAAa#...',
  '...##########...',
  '...#lwwwwwwg#...',
  '...#lwwwwwwg#...',
  '...#lwwwwwwg#...',
  '...#lwwwwwwg#...',
  '...#lwwwwwwg#...',
  '...#lwwwwwwg#...',
  '...#lwwwwwwg#...',
  '...#lwwwwwwg#...',
  '...#llwwwwgg#...',
  '...###pPp####...',
  '......#pP#......',
  '.......##.......',
];
I['white_banner'] = () => {
  const t = spr(BANNER, { '#': 0x28190a, a: 0x684e1e, A: 0x896727, p: 0x896727, P: 0x684e1e, l: 0xdedede, w: 0xf4f4f4, g: 0xc2c2c2 }, 'white_banner');
  // the cloth gets a softer grey outline than the wood
  paint(t, (x, y, c) => (c === 0x28190a && y >= 4 && y <= 13 && !(y === 13 && x >= 6 && x <= 9) ? 0x6a6a6a : undefined));
  return t;
};

// ---------------------------------------------------------------------------
// Armor trim smithing templates: a stone tablet with a bevelled rim and the
// trim's motif raised on its face ('f' = face; motif chars from the pal).

// prettier-ignore
const TEMPLATE = [
  '................',
  '..###########...',
  '.#LLLLLLLLLLL##.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.#Lffffffffffd#.',
  '.##ddddddddddd#.',
  '...###########..',
  '................',
];

function template(o: number, light: number, face: number, dark: number, grain: number[], motif: string[], pal: Pal, name: string): TexImage {
  const t = spr(TEMPLATE, { '#': o, L: light, f: face, d: dark }, name);
  const r = rng(name);
  paint(t, (x, y, c) => (c === face && r.chance(0.16) ? grain[r.nextInt(grain.length)] : undefined));
  over(t, motif, pal);
  return t;
}

// Dune (desert pyramids): sandstone tablet with a sunlit pyramid on it.
// prettier-ignore
const DUNE_MOTIF = [
  '', '', '', '',
  '................',
  '.......hm.......',
  '......hhmm......',
  '.....hhhmmm.....',
  '....hhhhmmmm....',
  '...hhhhhmmmmm...',
  '...ssssssssss...',
];
I['dune_armor_trim_smithing_template'] = () =>
  template(0x4a3418, 0xf2e4b6, 0xd8c088, 0xa4844a, [0xcdb47a, 0xe2cc98], DUNE_MOTIF,
    { h: 0xeeb46c, m: 0xbc6c2c, s: 0x7a4a1e }, 'dune_armor_trim_smithing_template');

// Silence (ancient cities): cobbled deepslate tablet with a warden's head,
// its sculk horns glowing cyan, and sculk glints in the stone.
// prettier-ignore
const SILENCE_MOTIF = [
  '', '', '',
  '...C........C...',
  '...cC......Cc...',
  '....cchmmhcc....',
  '.....hmmmmms....',
  '.....hmmmmms....',
  '.....hmkkkms....',
  '.....hkkkkks....',
  '......hkwks.....',
  '.......ssss.....',
  '............C...',
];
I['silence_armor_trim_smithing_template'] = () => {
  const t = template(0x08080c, 0x5e5e68, 0x3a3a42, 0x222228, [0x2e2e35, 0x46464e], SILENCE_MOTIF,
    { h: 0x767880, m: 0x50525a, s: 0x121216, c: 0x18909a, C: 0x5af0f0, k: 0x0c1418, w: 0x8a8c94 }, 'silence_armor_trim_smithing_template');
  plot(t, 3, 11, 0x18909a);
  return t;
};

// ---------------------------------------------------------------------------
// Trial keys: round bow at the lower left, bit with two teeth at the upper
// right (held like every other diagonal item).

// prettier-ignore
const KEY = [
  '................',
  '............##..',
  '...........#43#.',
  '..........#43#3#',
  '.........#43#32#',
  '........#43##2#.',
  '.......#43#32#..',
  '..###.#43#.##...',
  '.#554#43#.......',
  '#54##443#.......',
  '#5#..#32#.......',
  '#4#..#2#........',
  '#43##32#........',
  '.#3221#.........',
  '..####..........',
  '................',
];
function trialKey(pal: Pal, name: string): TexImage {
  return spr(KEY, pal, name);
}
I['trial_key'] = () => trialKey({ '#': 0x5a2a08, 1: 0x8a400c, 2: 0xb0580e, 3: 0xdc8a1c, 4: 0xf6c23a, 5: 0xfff09a }, 'trial_key');
I['ominous_trial_key'] = () => {
  const t = trialKey({ '#': 0x0e0e14, 1: 0x1a1a20, 2: 0x24262e, 3: 0x3a3e4a, 4: 0x565c6a, 5: 0x2ad6c4 }, 'ominous_trial_key');
  // red-orange glints on the bit (the bow's teal comes from the highlight shade)
  for (const [x, y] of [[13, 3], [12, 4], [11, 6]] as [number, number][]) plot(t, x, y, 0xe0502a);
  return t;
};

// ---------------------------------------------------------------------------
// Wind charge: a small ball of pale wind spiralling inwards, with wisps
// trailing off it.

// prettier-ignore
const WIND_CHARGE = [
  '................',
  '................',
  '...........oo...',
  '......ooooowwo..',
  '....ooMMMMoooo..',
  '...oMwwMMmmmo...',
  '..oMwddddMmmmo..',
  '..oMdMMMMddmmo..',
  '..oMdMwwMMdmmo..',
  '..omdMwddMdmdo..',
  '..ommdMMMdmmdo..',
  '...ommddddmdo...',
  '.oooommmmmmoo...',
  '.owwoooooooo....',
  '..oo............',
  '................',
];
I['wind_charge'] = () => spr(WIND_CHARGE, { o: 0x4a56a8, m: 0xb4c2f2, M: 0xd4defa, w: 0xf4f8ff, d: 0x7c8cd8 }, 'wind_charge');

// ---------------------------------------------------------------------------
// Pitcher pod: a plump teal seed pod on the diagonal, the seeds bulging
// through its skin, a stubby stalk at the lower end and a pale tip.

// prettier-ignore
const POD = [
  '................',
  '............##..',
  '..........##tT#.',
  '.........#lLmm#.',
  '........#lLoOmd#',
  '.......#lLmOOmd#',
  '......#lLmmmmd#.',
  '.....#lLoOmmd#..',
  '....#lLmOOmd#...',
  '....#Lmmmmdd#...',
  '...#LLoOmdd#....',
  '...#LmOOmd#.....',
  '..#Lmmmdd#......',
  '..#bmdd##.......',
  '.#bB##..........',
  '..#.............',
];
I['pitcher_pod'] = () =>
  spr(POD, {
    '#': 0x0c3a34, l: 0x9ae4c4, L: 0x62c49e, m: 0x3a9c80, d: 0x1c5c4e,
    o: 0xc4f0b4, O: 0x86cc98, t: 0xe4eeb0, T: 0xb8cc88, b: 0x7a6a34, B: 0x54461e,
  }, 'pitcher_pod');

// ---------------------------------------------------------------------------
// Sniffer egg: the block model (a 14x16x12 box), dark red with teal blotches.

I['sniffer_egg'] = () => {
  const SPOTS: Partial<Record<Face, [number, number, number][]>> = {
    up: [[5, 6, 2.3], [11.5, 10.5, 2.0]],
    east: [[6, 4.5, 2.4], [10, 11.5, 2.6]],
    north: [[5, 7, 2.6], [11.5, 12.5, 2.3], [12, 3, 1.4]],
  };
  const tex: FaceTex = (f, u, v) => {
    for (const [sx, sy, sr] of SPOTS[f] ?? []) {
      const d = Math.hypot(u + 0.5 - sx, v + 0.5 - sy);
      if (d < sr * 0.45) return 0x68cca8;
      if (d < sr) return 0x2c8c78;
    }
    const n = (Math.floor(u) * 5 + Math.floor(v) * 3) % 7;
    return n === 0 ? 0xb03c30 : n === 4 ? 0x7e211b : 0x9a2c24;
  };
  return isoRender([{ from: [1, 0, 2], to: [15, 16, 14], tex }]);
};

// ---------------------------------------------------------------------------
// Sculk sensor: half-block of sculk with four tendrils standing on the top.

I['sculk_sensor'] = () => {
  const top = texRows([
    'aabaaaabaaaaabaa',
    'abcbaaaaaabaaaba',
    'aabaaaabaaaaaaaa',
    'aaaaaabcbaaaabaa',
    'abaaaaabaaaabcba',
    'aaaaaaaaaaaaabaa',
    'aaabaaaaaaabaaaa',
    'aabcbaaabaaaaaaa',
    'aaabaaabcbaaaaba',
    'aaaaaaaabaaaabcb',
    'abaaaaaaaaaaaaba',
    'bcbaaabaaaabaaaa',
    'abaaabcbaaaaaaaa',
    'aaaaaabaaaaabaaa',
    'aaabaaaaaaabcbaa',
    'aabcbaaaaaaabaaa',
  ], { a: 0x0e3640, b: 0x165462, c: 0x3cc8cc });
  const side = texRows([
    '', '', '', '', '', '', '', '',
    'bbabbbbabbbbbabb',
    'aaaabaaaaaaabaaa',
    'aaaaaaaacaaaaaaa',
    'aabaaaaaaaaaaaca',
    'daaaaadaaaaadaaa',
    'dddaddddddaddddd',
    'dddddddddddddddd',
    'eddddeddddddedde',
  ].map((r) => r.padEnd(16, 'a')), { a: 0x0e3640, b: 0x165462, c: 0x3cc8cc, d: 0x0a242c, e: 0x061418 });
  const t = isoRender([{ from: [0, 0, 0], to: [16, 8, 16], tex: (f, u, v) => (f === 'up' ? top(u, v) : side(u, v)) }]);
  // tendrils (crossed planes at the four corners), drawn back to front
  // prettier-ignore
  const TENDRIL = [
    '.c.c.',
    '.cCc.',
    '..C..',
    '.cC..',
    '..C..',
  ];
  const corners: V3[] = [[3, 8, 13], [13, 8, 13], [3, 8, 3], [13, 8, 3]];
  for (const c of corners) {
    const [bx, by] = isoProject(c);
    over(t, TENDRIL, { c: 0x2aa8b0, C: 0x0f6a74 }, Math.round(bx - 2.5), Math.round(by - 5));
  }
  return t;
};

// ---------------------------------------------------------------------------
// Decorated pot: terracotta body with a narrow neck and a flared lip (the
// block entity model: 14x16x14 body, 6x1x6 neck, 8x3x8 lip).

I['decorated_pot'] = () => {
  const B = { base: 0xa0603f, light: 0xb87250, top: 0xc27c58, dark: 0x82492f, deep: 0x6a3a24, hole: 0x2a140c };
  const body: FaceTex = (f, u, v) => {
    // top: a darker ring where the shoulder turns in to the neck
    if (f === 'up') return u >= 4 && u < 12 && v >= 4 && v < 12 ? B.base : B.light;
    if (v < 1) return B.top;
    if (v >= 15) return B.dark;
    return B.base;
  };
  const neck: FaceTex = () => B.deep;
  const lip: FaceTex = (f, u, v) => (f === 'up' && u >= 6 && u < 10 && v >= 6 && v < 10 ? B.hole : B.light);
  return isoRender([
    { from: [1, 0, 1], to: [15, 16, 15], tex: body },
    { from: [5, 16, 5], to: [11, 17, 11], tex: neck },
    { from: [4, 17, 4], to: [12, 20, 12], tex: lip },
  ], 1);
};

// ---------------------------------------------------------------------------
// Lightning rod: copper rod shown diagonally (like the end rod), its cubic
// tip seen corner-on at the top right.

// prettier-ignore
const LIGHTNING_ROD = [
  '................',
  '............5...',
  '...........543..',
  '..........54322.',
  '...........322..',
  '..........ab2...',
  '.........ab.....',
  '........ab......',
  '.......ab.......',
  '......ab........',
  '.....ab.........',
  '....ab..........',
  '...ab...........',
  '..ab............',
  '..b.............',
  '................',
];
I['lightning_rod'] = () => {
  const Cu = INGOT_MATS.copper;
  const t = spr(LIGHTNING_ROD, { 5: Cu.s[4], 4: Cu.s[3], 3: Cu.s[2], 2: Cu.s[1], a: Cu.s[3], b: Cu.s[1] }, 'lightning_rod');
  outline4(t, Cu.o);
  return t;
};

// ---------------------------------------------------------------------------
// Wolf armor: armadillo-scute body armor in profile, facing left: the collar
// round the wolf's shoulders shows the dark neck opening, the back is a row
// of overlapping scute bands and the lower edge is cut away for the legs.

// prettier-ignore
const WOLF_ARMOR = [
  '................',
  '................',
  '..ooo...........',
  '.oLLlo.oooooo...',
  'oLlkkmoLLlLLloo.',
  'oLkkkKmlLDlLDlmo',
  'oLkkkKmlmDlmDlmo',
  'oLkkkKmlmDlmDlmo',
  'oLkkkKmlmDlmDmdo',
  'olkkkKmlmDlmDddo',
  '.olkKmmooooooddo',
  '.ommmmo......odo',
  '..oooo........o.',
  '................',
  '................',
  '................',
];
I['wolf_armor'] = () =>
  spr(WOLF_ARMOR, { o: 0x3a221c, L: 0xe6c8b4, l: 0xd2ae98, m: 0xbc947e, D: 0x7a5446, d: 0x92685a, k: 0x2a1812, K: 0x4a2e24 }, 'wolf_armor');
