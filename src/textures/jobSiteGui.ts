// GUI sprites of the job sites' screens (vanilla container/stonecutter.png, smithing.png, loom.png, cartography_table.png
// and the sprites in gui/sprites/container/{stonecutter,smithing,loom,cartography_table}): backgrounds at vanilla slot
// positions, the recipe and pattern buttons and scrollers, the map sheets, and the empty-slot icons (vanilla
// item/empty_slot_*, container/slot/banner and the rest); and the book the lectern and books open (vanilla gui/book.png
// and the widget/page_* arrows).

import { TexImage, img, plot, rect, mixC, blit, pattern } from './tex';
import { parchment } from './mapTextures';
import { GUI_TEXTURES, panel, inset, slotAt, bigSlotAt, playerInventory, arrowMask, drawMask } from './gui';
import { hammer } from './enchantingGui';

const G = GUI_TEXTURES;
const WHITE = 0xffffff;

interface Bevel {
  face: number;
  /** top and left edges */
  hi: number;
  /** bottom and right edges */
  lo: number;
}

/** a w×h button face with a one-pixel bevel */
function bevelled(w: number, h: number, s: Bevel): TexImage {
  const t = img(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = s.face;
      if (x === 0 || y === 0) c = s.hi;
      if (x === w - 1 || y === h - 1) c = s.lo;
      if ((x === 0 && y === h - 1) || (x === w - 1 && y === 0)) c = s.face;
      plot(t, x, y, c);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Stonecutter

G['container_stonecutter'] = () => {
  const t = panel(176, 166);
  slotAt(t, 20, 33); // input
  bigSlotAt(t, 143, 33); // result
  inset(t, 51, 14, 66, 56); // the recipe grid, 4 × 3 buttons of 16 × 18 from (52, 15)
  inset(t, 118, 14, 14, 58); // the scroller's track (12 × 15 at 119, 15..56)
  playerInventory(t, 84);
  return t;
};
G['stonecutter_recipe'] = () => bevelled(16, 18, { face: 0xc6c6c6, hi: WHITE, lo: 0x555555 });
G['stonecutter_recipe_highlighted'] = () => bevelled(16, 18, { face: 0xdcdcf0, hi: WHITE, lo: 0x7a7a9a });
G['stonecutter_recipe_selected'] = () => bevelled(16, 18, { face: 0x7f7f7f, hi: 0x373737, lo: WHITE });
G['stonecutter_scroller'] = () => G['scroller']();
G['stonecutter_scroller_disabled'] = () => G['scroller_disabled']();

// ---------------------------------------------------------------------------
// Smithing table

G['container_smithing'] = () => {
  const t = panel(176, 166);
  hammer(t, 16, 12); // left of the title ("Upgrade Gear" at 44, 15)
  slotAt(t, 8, 48); // template
  slotAt(t, 26, 48); // base
  slotAt(t, 44, 48); // addition
  drawMask(t, 68, 49, arrowMask(22, 15, 7), 0x8b8b8b); // under the error cross (65, 46)
  slotAt(t, 98, 48); // result
  playerInventory(t, 84);
  return t;
};
/** the red cross over the arrow when the three inputs make nothing (vanilla's is the anvil's) */
G['smithing_error'] = () => G['anvil_error']();

/** a 16x16 empty-slot silhouette, debossed like the armour slots' (dark top-left edges, light bottom-right) */
function debossed(rows: string[]): TexImage {
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
}

// prettier-ignore
const SMITHING_SLOT_ICONS: Record<string, string[]> = {
  smithing_template_netherite_upgrade: [
    '................',
    '...##########...',
    '..############..',
    '..############..',
    '..###......###..',
    '..##..####..##..',
    '..##.######.##..',
    '..##.##..##.##..',
    '..##.##..##.##..',
    '..##.######.##..',
    '..##..####..##..',
    '..###......###..',
    '..############..',
    '..############..',
    '...##########...',
    '................',
  ],
  smithing_template_armor_trim: [
    '................',
    '...##########...',
    '..############..',
    '..############..',
    '..##.######.##..',
    '..###.####.###..',
    '..####.##.####..',
    '..#####..#####..',
    '..#####..#####..',
    '..####.##.####..',
    '..###.####.###..',
    '..##.######.##..',
    '..############..',
    '..############..',
    '...##########...',
    '................',
  ],
  sword: [
    '................',
    '.............##.',
    '............###.',
    '...........###..',
    '..........###...',
    '.........###....',
    '........###.....',
    '..#....###......',
    '..##..###.......',
    '...#####........',
    '....###.........',
    '...#####........',
    '..##...##.......',
    '.##.............',
    '.#..............',
    '................',
  ],
  pickaxe: [
    '................',
    '....######......',
    '...########.....',
    '..###....####...',
    '..#.......####..',
    '.........###.##.',
    '........###...#.',
    '.......###....#.',
    '......###.....#.',
    '.....###........',
    '....###.........',
    '...###..........',
    '..###...........',
    '.###............',
    '.##.............',
    '................',
  ],
  axe: [
    '................',
    '.......#####....',
    '.....##########.',
    '....##########..',
    '....#########...',
    '.....####.##....',
    '......##.##.....',
    '........##......',
    '.......##.......',
    '......##........',
    '.....##.........',
    '....##..........',
    '...##...........',
    '..##............',
    '.##.............',
    '................',
  ],
  hoe: [
    '................',
    '.....#######....',
    '....#########...',
    '....##....###...',
    '..........###...',
    '.........###....',
    '........###.....',
    '.......###......',
    '......###.......',
    '.....###........',
    '....###.........',
    '...###..........',
    '..###...........',
    '.###............',
    '.##.............',
    '................',
  ],
  shovel: [
    '................',
    '...........##...',
    '..........####..',
    '.........######.',
    '........#######.',
    '.........#####..',
    '........#.###...',
    '.......###......',
    '......###.......',
    '.....###........',
    '....###.........',
    '...###..........',
    '..###...........',
    '.###............',
    '.##.............',
    '................',
  ],
  ingot: [
    '................',
    '................',
    '................',
    '................',
    '........####....',
    '......#######...',
    '....##########..',
    '..############..',
    '..###########...',
    '...#########....',
    '.....######.....',
    '.......###......',
    '................',
    '................',
    '................',
    '................',
  ],
  redstone_dust: [
    '................',
    '................',
    '......##........',
    '.....####..##...',
    '...#.####.####..',
    '..###.##..####..',
    '..###......##...',
    '...#..####......',
    '.....######.....',
    '.....######..#..',
    '..##..####..###.',
    '.####........#..',
    '.####...##......',
    '..##...####.....',
    '........##......',
    '................',
  ],
  quartz: [
    '................',
    '................',
    '.......##.......',
    '......####......',
    '.....######.....',
    '....########....',
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
  ],
  diamond: [
    '................',
    '................',
    '................',
    '....########....',
    '...##########...',
    '..############..',
    '..############..',
    '...##########...',
    '....########....',
    '.....######.....',
    '......####......',
    '.......##.......',
    '................',
    '................',
    '................',
    '................',
  ],
  emerald: [
    '................',
    '................',
    '......####......',
    '.....######.....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '.....######.....',
    '......####......',
    '................',
    '................',
    '................',
  ],
  amethyst_shard: [
    '................',
    '............##..',
    '..........####..',
    '........######..',
    '.......######...',
    '......######....',
    '.....######.....',
    '....######......',
    '...######.......',
    '...#####........',
    '..####..........',
    '..###...........',
    '..##............',
    '................',
    '................',
    '................',
  ],
};
for (const [name, rows] of Object.entries(SMITHING_SLOT_ICONS)) G[`slot_${name}`] = () => debossed(rows);

// ---------------------------------------------------------------------------
// Loom

G['container_loom'] = () => {
  const t = panel(176, 166);
  slotAt(t, 13, 26); // banner
  slotAt(t, 33, 26); // dye
  slotAt(t, 23, 45); // banner pattern
  inset(t, 59, 12, 58, 58); // the patterns, 4 × 4 buttons of 14 × 14 from (60, 13)
  inset(t, 118, 12, 14, 58); // the scroller's track (12 × 15 at 119, 13..54)
  inset(t, 140, 7, 22, 42); // the banner as it will come out (20 × 40 at 141, 8)
  slotAt(t, 143, 58); // result
  playerInventory(t, 84);
  return t;
};
G['loom_pattern'] = () => bevelled(14, 14, { face: 0xc6c6c6, hi: WHITE, lo: 0x555555 });
G['loom_pattern_highlighted'] = () => bevelled(14, 14, { face: 0xdcdcf0, hi: WHITE, lo: 0x7a7a9a });
G['loom_pattern_selected'] = () => bevelled(14, 14, { face: 0x7f7f7f, hi: 0x373737, lo: WHITE });
G['loom_scroller'] = () => G['scroller']();
G['loom_scroller_disabled'] = () => G['scroller_disabled']();
/** over the result slot when the banner can take no more layers: a red cross */
G['loom_error'] = () => {
  const t = img(26, 26);
  for (let i = 0; i < 16; i++) {
    const x = 5 + i, y = 5 + i;
    for (const [dx, c] of [[-2, 0x000000], [-1, 0xff5555], [0, 0xd81e1e], [1, 0xa01010], [2, 0x000000]] as [number, number][]) {
      plot(t, x + dx, y, c);
      plot(t, 20 - i + dx, y, c);
    }
  }
  return t;
};

// prettier-ignore
const LOOM_SLOT_ICONS: Record<string, string[]> = {
  banner: [
    '................',
    '..############..',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '...##########...',
    '...####..####...',
    '...###....###...',
    '...##......##...',
    '................',
    '................',
    '................',
  ],
  dye: [
    '................',
    '................',
    '.......##.......',
    '......####......',
    '.....######.....',
    '....########....',
    '...##########...',
    '...##########...',
    '..############..',
    '..############..',
    '..############..',
    '...##########...',
    '....########....',
    '......####......',
    '................',
    '................',
  ],
  banner_pattern: [
    '................',
    '...#########....',
    '...##########...',
    '...###########..',
    '...###########..',
    '...###########..',
    '...###########..',
    '...###########..',
    '...###########..',
    '...###########..',
    '...###########..',
    '...###########..',
    '...###########..',
    '...###########..',
    '................',
    '................',
  ],
};
for (const [name, rows] of Object.entries(LOOM_SLOT_ICONS)) G[`slot_${name}`] = () => debossed(rows);

// ---------------------------------------------------------------------------
// Cartography table (vanilla container/cartography_table.png and the sprites in container/cartography_table)

G['container_cartography_table'] = () => {
  const t = panel(176, 166);
  slotAt(t, 15, 15); // map
  slotAt(t, 15, 52); // paper, empty map or glass pane
  // the two joined and led on to the map (under the error cross at 35, 31)
  const LINE = 0x8b8b8b;
  rect(t, 34, 22, 6, 2, LINE);
  rect(t, 34, 59, 6, 2, LINE);
  rect(t, 38, 22, 2, 39, LINE);
  drawMask(t, 41, 34, arrowMask(22, 15, 7), LINE);
  inset(t, 66, 12, 68, 68); // where the map shows (66 × 66 at 67, 13)
  drawMask(t, 135, 43, arrowMask(8, 9, 3), LINE);
  slotAt(t, 145, 39); // result
  playerInventory(t, 84);
  return t;
};
/** a sheet of paper, the map drawn on it at 4, 4 */
G['cartography_table_map'] = () => parchment(66, 66, false, 7301);
/** zoomed out: the map small in the middle of a bigger sheet, its old edges marked */
G['cartography_table_scaled_map'] = () => {
  const t = parchment(66, 66, false, 7302);
  for (let i = 16; i <= 49; i++)
    if (i % 3 !== 2)
      for (const [x, y] of [[i, 16], [i, 49], [16, i], [49, i]]) plot(t, x, y, 0xa98e5c);
  return t;
};
/** one of two copies: a 50 × 50 sheet (the rest of the sprite is clear), the map on it at 3, 3 */
G['cartography_table_duplicated_map'] = () => {
  const t = img(50, 66);
  blit(t, parchment(50, 50, false, 7303), 0, 0);
  return t;
};
/** a padlock over the map's corner: it's to be locked */
G['cartography_table_locked'] = () => {
  const t = img(10, 14);
  pattern(t, 0, 0, [
    '..######..',
    '.##....##.',
    '.#......#.',
    '.#......#.',
    '.#......#.',
    '##########',
    '#yyyyyyyy#',
    '#yYYYYYYy#',
    '#yYY##YYy#',
    '#yYY##YYy#',
    '#yYYY#YYy#',
    '#yYYYYYYy#',
    '#yyyyyyyy#',
    '##########',
  ], { '#': 0x3a3a3a, y: 0xb8962e, Y: 0xe8c24a });
  for (const [x, y] of [[2, 1], [7, 1], [1, 2], [8, 2], [1, 3], [8, 3], [1, 4], [8, 4]]) plot(t, x, y, 0x9a9a9a);
  return t;
};
/** over the arrow when the table can't do it: a red cross */
G['cartography_table_error'] = () => {
  const t = img(28, 21);
  for (let i = 0; i < 17; i++) {
    const x = 5 + Math.round((i * 18) / 16), y = 2 + i;
    for (const [dx, c] of [[-2, 0x000000], [-1, 0xff5555], [0, 0xd81e1e], [1, 0xa01010], [2, 0x000000]] as [number, number][]) {
      plot(t, x + dx, y, c);
      plot(t, 23 - Math.round((i * 18) / 16) + dx, y, c);
    }
  }
  return t;
};

// ---------------------------------------------------------------------------
// Books

/** 192x192: a leather-bound book open at one cream page (text at 36..150 × 32..158, arrows at y 159) */
G['book'] = () => {
  const t = img(192, 192);
  // the cover
  rect(t, 18, 1, 150, 180, 0x2b1606);
  rect(t, 19, 2, 148, 178, 0x7a4a25);
  rect(t, 19, 2, 148, 1, 0x9a6537);
  rect(t, 19, 2, 1, 178, 0x8c5a2f);
  rect(t, 19, 179, 148, 1, 0x4e2d14);
  rect(t, 166, 2, 1, 178, 0x4e2d14);
  // the page, darker where it goes into the binding
  rect(t, 24, 6, 139, 171, 0xb8a988);
  rect(t, 25, 7, 137, 169, 0xf2ead6);
  for (let x = 0; x < 5; x++) rect(t, 25 + x, 7, 1, 169, mixC(0xc9bc9c, 0xf2ead6, x / 5));
  rect(t, 25, 175, 137, 1, 0xe0d6bf);
  rect(t, 161, 7, 1, 169, 0xe0d6bf);
  return t;
};

/** a page-turning arrow, 23x13 (vanilla PageButton), pointing right unless mirrored */
function pageArrow(forward: boolean, fill: number, edge: number): TexImage {
  const t = img(23, 13);
  const m = arrowMask(22, 13, 5);
  const at = (x: number, y: number) => y >= 0 && y < 13 && x >= 0 && x < 22 && m[y][x];
  for (let y = 0; y < 13; y++)
    for (let x = 0; x < 22; x++) {
      if (!at(x, y)) continue;
      const border = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      plot(t, forward ? x : 22 - x, y, border ? edge : fill);
    }
  return t;
}
G['page_forward'] = () => pageArrow(true, 0xb89b72, 0x3a2412);
G['page_forward_highlighted'] = () => pageArrow(true, 0xf0d48e, 0x3a2412);
G['page_backward'] = () => pageArrow(false, 0xb89b72, 0x3a2412);
G['page_backward_highlighted'] = () => pageArrow(false, 0xf0d48e, 0x3a2412);
