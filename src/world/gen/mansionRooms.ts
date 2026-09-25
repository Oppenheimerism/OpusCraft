// The woodland mansion's rooms (vanilla woodland_mansion/1x1_*, 1x2_*, 2x2_*.nbt), rebuilt here after vanilla's:
// the same names, sizes and doorways, furnished the way the mansion's rooms are (bedrooms, libraries, dining rooms,
// storage rooms, the wool statues, the farm and the forge, jail cells, the map room; sealed secret rooms with the
// cobwebs, the lava, the diamond block and the fake End portal), with vanilla's data markers for the loot chests,
// the evokers ("Mage"), the vindicators ("Warrior") and the allays' cells ("Group of Allays").
//
// A room's own coordinates: its cells are 7 × 7 with a joint of 1 between them, its floor y 0 and ceiling y 7;
// walls aren't the room's (the inner and outer wall pieces stand on the joints round it). Where the door is:
//   1x1 (7 × 7):             east, at (7, 3)
//   1x2 side (7 × 15):       east, at (7, 3), in the cell z 0-6; the other cell is z 8-14
//   1x2 front (7 × 15):      south, at (3, 15), in the cell z 8-14; the other cell is z 0-6
//   2x2 (15 × 15):           east, at (15, 3), in the cell x 8-14, z 0-6
//   secret rooms:            none
// The staircase rooms reach up to the third storey (see stairsRoom).

import { TemplateBuilder, type MansionTemplate, type Blk } from './mansionBuilder';

type Dir = 'north' | 'east' | 'south' | 'west';
const STEP: Record<Dir, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const OPPOSITE: Record<Dir, Dir> = { north: 'south', east: 'west', south: 'north', west: 'east' };

const PLANKS = 'dark_oak_planks';
const LOG_X = 'dark_oak_log[axis=x]', LOG_Y = 'dark_oak_log[axis=y]', LOG_Z = 'dark_oak_log[axis=z]';
const FENCE = 'dark_oak_fence';
const SHELF = 'bookshelf';
const HANG = 'lantern[hanging=true]', STAND = 'lantern[hanging=false]';
const BARREL = 'barrel[facing=up]';
const SLAB_TOP = 'dark_oak_slab[type=top]';
const stair = (facing: Dir, half = 'bottom', wood = 'dark_oak') => `${wood}_stairs[facing=${facing},half=${half}]`;
/** a chair (a stair) for someone sitting facing `faces` */
const chair = (faces: Dir, wood = 'dark_oak') => stair(OPPOSITE[faces], 'bottom', wood);
/** a counter or desk (an upside-down stair) with its back to `back` */
const counter = (back: Dir) => stair(back, 'top');
/** a chest marker for a chest facing `d` (vanilla ChestNorth, ChestEast, ...) */
const CHEST: Record<Dir, string> = { north: 'ChestNorth', east: 'ChestEast', south: 'ChestSouth', west: 'ChestWest' };

// ---------------------------------------------------------------------------------------------------------------
// Helpers

/** a room's floor, the air inside and its ceiling, a beam along each joint between its cells */
function shell(name: string, sx: number, sz: number): TemplateBuilder {
  const b = new TemplateBuilder(name, sx, 8, sz);
  b.fill(0, 0, 0, sx - 1, 0, sz - 1, PLANKS).fill(0, 1, 0, sx - 1, 6, sz - 1, 'air').fill(0, 7, 0, sx - 1, 7, sz - 1, PLANKS);
  if (sz > 7) b.fill(0, 7, 7, sx - 1, 7, 7, LOG_X);
  if (sx > 7) b.fill(7, 7, 0, 7, 7, sz - 1, LOG_Z);
  return b;
}
const room1x1 = (name: string) => shell(name, 7, 7);
const room1x2 = (name: string) => shell(name, 7, 15);
const room2x2 = (name: string) => shell(name, 15, 15);

/** posts at the ends of a 1×2 room's joint (z 7), with brackets under its beam */
function arch(b: TemplateBuilder): TemplateBuilder {
  return b.fill(0, 1, 7, 0, 6, 7, LOG_Y).fill(6, 1, 7, 6, 6, 7, LOG_Y).set(1, 6, 7, stair('west', 'top')).set(5, 6, 7, stair('east', 'top'));
}

/** a bed whose head is at (x, y, z), lying `facing` (the way its head is from its foot) */
function bed(b: TemplateBuilder, x: number, y: number, z: number, facing: Dir, color = 'red'): void {
  const [dx, dz] = STEP[facing];
  b.set(x, y, z, `${color}_bed[facing=${facing},part=head]`).set(x - dx, y, z - dz, `${color}_bed[facing=${facing},part=foot]`);
}

/** a door, both halves */
function door(b: TemplateBuilder, x: number, y: number, z: number, facing: Dir, wood = 'dark_oak', hinge = 'left'): void {
  b.set(x, y, z, `${wood}_door[facing=${facing},half=lower,hinge=${hinge}]`).set(x, y + 1, z, `${wood}_door[facing=${facing},half=upper,hinge=${hinge}]`);
}

/** a table of fences under a cloth of carpet */
function table(b: TemplateBuilder, x0: number, z0: number, x1: number, z1: number, cloth = 'white_carpet'): void {
  b.fill(x0, 1, z0, x1, 1, z1, FENCE).fill(x0, 2, z0, x1, 2, z1, cloth);
}

/** a nightstand: a barrel with a lantern on it */
function nightstand(b: TemplateBuilder, x: number, z: number): void {
  b.set(x, 1, z, BARREL).set(x, 2, z, STAND);
}

/** a lamp: a lantern on a fence post */
function lamp(b: TemplateBuilder, x: number, z: number): void {
  b.set(x, 1, z, FENCE).set(x, 2, z, STAND);
}

/** the same scatter every time */
function hash(x: number, y: number, z: number, salt: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(salt + 1, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** cobwebs in about `percent` of the air in a box */
function cobwebs(b: TemplateBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, percent: number, salt = 0): void {
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (b.get(x, y, z) === 0 && hash(x, y, z, salt) % 100 < percent) b.set(x, y, z, 'cobweb');
}

/** flowers of `kinds` in about `percent` of the free spots on the grass of a box's floor */
function flowers(b: TemplateBuilder, x0: number, z0: number, x1: number, z1: number, kinds: string[], percent: number, salt = 0): void {
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const h = hash(x, 1, z, salt);
      if (b.get(x, 1, z) === 0 && b.is(x, 0, z, 'grass_block') && h % 100 < percent) b.set(x, 1, z, kinds[(h >>> 8) % kinds.length]);
    }
}

/**
 * a picture of wool on a wall: rows from the top (y `top`) down, each running along x (from `x`, on the plane
 * z = `z`) or along z (from `z`, on the plane x = `x`)
 */
function picture(b: TemplateBuilder, x: number, top: number, z: number, along: 'x' | 'z', rows: string, key: Record<string, Blk>): void {
  rows.split('|').forEach((row, r) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === ' ') continue;
      const blk = key[row[i]];
      if (!blk) throw new Error(`mansion picture: no block for '${row[i]}'`);
      b.set(along === 'x' ? x + i : x, top - r, along === 'z' ? z + i : z, blk);
    }
  });
}

const WOOL: Record<string, Blk> = {
  w: 'white_wool', k: 'black_wool', r: 'red_wool', o: 'orange_wool', y: 'yellow_wool', l: 'light_blue_wool', b: 'blue_wool',
  g: 'lime_wool', G: 'green_wool', n: 'brown_wool', a: 'gray_wool', A: 'light_gray_wool', p: 'pink_wool', m: 'magenta_wool', u: 'purple_wool',
};

// ---------------------------------------------------------------------------------------------------------------
// The ground storey's 1×1 rooms (vanilla 1x1_a1-5)

/** 1x1_a1: the flower room: a bed of flowers along the wall, shelves of potted flowers, a plant on a table */
function flowerRoom(name: string): MansionTemplate {
  const b = room1x1(name);
  b.fill(0, 0, 1, 0, 0, 5, 'grass_block');
  ['poppy', 'dandelion', 'allium', 'azure_bluet', 'oxeye_daisy'].forEach((f, i) => b.set(0, 1, 1 + i, f));
  const pots = ['potted_red_tulip', 'potted_orange_tulip', 'potted_pink_tulip', 'potted_white_tulip', 'potted_cornflower'];
  for (let i = 0; i < 5; i++) b.set(1 + i, 2, 0, SLAB_TOP).set(1 + i, 3, 0, pots[i]).set(1 + i, 2, 6, SLAB_TOP).set(1 + i, 3, 6, pots[4 - i]);
  b.fill(2, 1, 2, 4, 1, 4, 'lime_carpet').set(3, 1, 3, FENCE).set(3, 2, 3, 'potted_flowering_azalea_bush');
  b.set(6, 1, 0, 'potted_fern').set(6, 1, 6, 'potted_fern');
  return b.set(3, 6, 3, HANG).build();
}

/** 1x1_a2: the pumpkin ring room: carved pumpkins in a ring round a jack o'lantern on a bale of hay */
function pumpkinRing(name: string): MansionTemplate {
  const b = room1x1(name);
  const ring: [number, number, Dir][] = [
    [2, 1, 'south'], [3, 1, 'south'], [4, 1, 'south'], [1, 2, 'east'], [1, 3, 'east'], [1, 4, 'east'],
    [2, 5, 'north'], [3, 5, 'north'], [4, 5, 'north'], [5, 2, 'west'], [5, 4, 'west'],
  ];
  for (const [x, z, f] of ring) b.set(x, 1, z, (x + z) % 2 ? `carved_pumpkin[facing=${f}]` : `jack_o_lantern[facing=${f}]`);
  b.set(3, 1, 3, 'hay_block[axis=y]').set(3, 2, 3, 'jack_o_lantern[facing=east]');
  b.set(0, 1, 0, 'pumpkin').set(0, 1, 6, 'pumpkin').set(6, 1, 0, 'hay_block[axis=y]');
  return b.build();
}

/** 1x1_a3: the office: a desk under a lantern, a chair, bookshelves and a chest */
function office(name: string): MansionTemplate {
  const b = room1x1(name);
  b.fill(0, 1, 0, 4, 2, 0, SHELF).marker(5, 1, 0, CHEST.south);
  b.fill(1, 1, 2, 1, 1, 4, counter('west')).set(1, 2, 2, STAND).set(1, 2, 4, 'potted_poppy').set(2, 1, 3, chair('west'));
  b.fill(3, 1, 2, 5, 1, 4, 'light_gray_carpet');
  b.set(0, 1, 6, BARREL).set(0, 2, 6, 'potted_fern').set(1, 1, 6, 'crafting_table');
  return b.set(3, 6, 3, HANG).build();
}

/** 1x1_a4: the checkerboard room: a floor of black and white squares, banners standing on it for pieces */
function checkerboard(name: string): MansionTemplate {
  const b = room1x1(name);
  for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) b.set(x, 1, z, (x + z) % 2 ? 'black_carpet' : 'white_carpet');
  b.set(1, 1, 1, 'white_banner[rotation=0]').set(3, 1, 1, 'white_banner[rotation=0]').set(5, 1, 1, 'white_banner[rotation=0]');
  b.set(1, 1, 5, 'black_banner[rotation=8]').set(3, 1, 5, 'black_banner[rotation=8]');
  b.set(0, 6, 0, HANG).set(0, 6, 6, HANG).set(6, 6, 0, HANG).set(6, 6, 6, HANG);
  return b.build();
}

/** 1x1_a5: the white tulip sanctuary: a lawn of white tulips under a skylight of glowstone */
function tulipSanctuary(name: string): MansionTemplate {
  const b = room1x1(name);
  b.fill(1, 0, 1, 5, 0, 5, 'grass_block').fill(1, 1, 1, 5, 1, 5, 'white_tulip').fill(4, 1, 3, 5, 1, 3, 'air');
  b.fill(2, 7, 2, 4, 7, 4, 'glowstone');
  b.set(0, 1, 0, 'potted_white_tulip').set(6, 1, 0, 'potted_white_tulip').set(0, 1, 6, 'potted_white_tulip').set(6, 1, 6, 'potted_white_tulip');
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The upper storeys' 1×1 rooms (vanilla 1x1_b1-4)

/** 1x1_b1: the birch pillar room: four birch posts round a table */
function birchPillars(name: string): MansionTemplate {
  const b = room1x1(name);
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) b.fill(x, 1, z, x, 6, z, 'birch_log[axis=y]');
  b.fill(2, 1, 2, 4, 1, 4, 'white_carpet').set(3, 1, 3, 'birch_fence').set(3, 2, 3, 'potted_birch_sapling');
  b.set(2, 1, 3, chair('east', 'birch')).set(3, 1, 2, chair('south', 'birch')).set(3, 1, 4, chair('north', 'birch'));
  return b.set(3, 6, 3, HANG).build();
}

/** 1x1_b2: a bedroom: a bed, a nightstand, a chest and a bookshelf */
function smallBedroom(name: string): MansionTemplate {
  const b = room1x1(name);
  b.fill(2, 1, 1, 4, 1, 4, 'white_carpet');
  bed(b, 0, 1, 1, 'west', 'blue');
  nightstand(b, 0, 2);
  b.marker(0, 1, 4, CHEST.east);
  b.fill(0, 1, 6, 2, 2, 6, SHELF).set(5, 1, 6, 'potted_red_tulip');
  return b.set(3, 6, 3, HANG).build();
}

/** 1x1_b3: a small library: bookshelves floor to ceiling, a lectern, lamps */
function smallLibrary(name: string): MansionTemplate {
  const b = room1x1(name);
  b.fill(0, 1, 0, 0, 6, 6, SHELF).fill(1, 1, 0, 5, 6, 0, SHELF).fill(1, 1, 6, 5, 6, 6, SHELF);
  b.fill(2, 1, 2, 4, 1, 4, 'red_carpet').set(1, 1, 3, 'lectern[facing=east]');
  lamp(b, 1, 1);
  lamp(b, 1, 5);
  return b.set(3, 6, 3, HANG).build();
}

/** 1x1_b4: the allium room: a bed of alliums, potted alliums on posts round it */
function alliumRoom(name: string): MansionTemplate {
  const b = room1x1(name);
  b.fill(2, 0, 2, 4, 0, 4, 'grass_block').fill(2, 1, 2, 4, 1, 4, 'allium');
  b.fill(1, 1, 1, 5, 1, 5, 'magenta_carpet').fill(2, 1, 2, 4, 1, 4, 'allium');
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) b.set(x, 1, z, FENCE).set(x, 2, z, 'potted_allium');
  return b.set(3, 6, 3, HANG).build();
}

// ---------------------------------------------------------------------------------------------------------------
// Secret 1×1 rooms (vanilla 1x1_as1-4, on any storey: walled in, no door)

/** 1x1_as1: the cobweb room: a chest behind the webs */
function cobwebRoom(name: string): MansionTemplate {
  const b = room1x1(name);
  b.marker(1, 1, 1, CHEST.south);
  cobwebs(b, 0, 1, 0, 6, 6, 6, 55, 1);
  return b.build();
}

/** 1x1_as2: the diamond block room: a diamond block on a pedestal, cobwebs in the corners */
function diamondRoom(name: string): MansionTemplate {
  const b = room1x1(name);
  b.set(3, 1, 3, 'chiseled_stone_bricks').set(3, 2, 3, 'diamond_block');
  b.fill(2, 1, 2, 4, 1, 4, 'red_carpet').set(3, 1, 3, 'chiseled_stone_bricks');
  for (const [x, z] of [[0, 0], [6, 0], [0, 6], [6, 6]]) b.fill(x, 4, z, x, 6, z, 'cobweb');
  return b.set(3, 6, 3, HANG).build();
}

/** 1x1_as3: the lava room: a pool of lava in obsidian behind iron bars, a chest */
function lavaRoom(name: string): MansionTemplate {
  const b = room1x1(name);
  b.fill(1, 0, 1, 5, 0, 5, 'obsidian').fill(2, 0, 2, 4, 0, 4, 'lava');
  b.ring(1, 1, 1, 5, 1, 5, 'iron_bars');
  b.marker(0, 1, 0, CHEST.south);
  cobwebs(b, 0, 5, 0, 6, 6, 6, 30, 3);
  return b.build();
}

/** 1x1_as4: the obsidian room: obsidian posts in the corners, a chest on a carpet between them */
function obsidianRoom(name: string): MansionTemplate {
  const b = room1x1(name);
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) b.fill(x, 1, z, x, 6, z, 'obsidian');
  b.fill(2, 1, 2, 4, 1, 4, 'purple_carpet').marker(3, 1, 3, CHEST.east);
  cobwebs(b, 0, 1, 0, 6, 6, 6, 15, 4);
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The ground storey's 1×2 rooms entered from the side (vanilla 1x2_a1-9)

/** 1x2_a1: a dining room: a long table laid down the middle, chairs either side, a sideboard */
function diningRoom(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  table(b, 3, 3, 3, 11);
  b.set(3, 2, 5, STAND).set(3, 2, 9, STAND);
  for (const z of [4, 6, 8, 10]) b.set(2, 1, z, chair('east')).set(4, 1, z, chair('west'));
  b.set(3, 1, 2, chair('south')).set(3, 1, 12, chair('north'));
  b.fill(1, 1, 2, 1, 1, 6, counter('west')).fill(1, 1, 8, 1, 1, 12, counter('west'));
  b.set(1, 2, 4, 'potted_red_tulip').set(1, 2, 10, 'potted_orange_tulip').set(1, 1, 7, BARREL);
  return b.set(3, 6, 4, HANG).set(3, 6, 10, HANG).build();
}

/** 1x2_a2: a library: bookshelves along the walls, reading tables, a lectern */
function library(name: string): MansionTemplate {
  const b = room1x2(name);
  b.fill(0, 1, 0, 0, 5, 14, SHELF).fill(1, 1, 14, 6, 5, 14, SHELF).fill(1, 1, 0, 5, 5, 0, SHELF).fill(6, 1, 8, 6, 5, 13, SHELF);
  b.fill(2, 1, 2, 4, 1, 12, 'red_carpet');
  table(b, 3, 5, 3, 5);
  table(b, 3, 10, 3, 10);
  b.set(2, 1, 5, chair('east')).set(4, 1, 5, chair('west')).set(2, 1, 10, chair('east')).set(4, 1, 10, chair('west'));
  b.set(3, 1, 12, 'lectern[facing=north]');
  lamp(b, 5, 1);
  return b.set(3, 6, 3, HANG).set(3, 6, 8, HANG).build();
}

/** 1x2_a3: a storage room: chests between stacks of barrels, a vindicator on guard */
function storageRoom(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(0, 1, 0, 0, 2, 6, BARREL).fill(0, 1, 8, 0, 2, 14, BARREL).fill(1, 1, 14, 6, 2, 14, BARREL);
  // (nothing over a chest: it wouldn't open)
  for (const z of [3, 11]) b.set(0, 2, z, 'air').marker(0, 1, z, CHEST.east);
  b.marker(6, 1, 12, CHEST.west);
  b.fill(4, 1, 13, 5, 1, 13, 'hay_block[axis=x]').set(6, 1, 13, 'pumpkin').set(6, 1, 11, 'melon').set(5, 1, 12, 'pumpkin');
  b.set(6, 1, 0, 'hay_block[axis=y]').set(6, 2, 0, 'hay_block[axis=y]').set(5, 1, 0, 'hay_block[axis=y]');
  b.marker(3, 1, 9, 'Warrior');
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_a4: the wheat farm: rows of crops either side of a channel of water, under glowstone */
function wheatFarm(name: string): MansionTemplate {
  const b = room1x2(name);
  b.fill(1, 0, 1, 5, 0, 13, 'farmland[moisture=7]').fill(3, 0, 1, 3, 0, 13, 'water');
  const crops = ['wheat[age=7]', 'carrots[age=7]', '', 'potatoes[age=7]', 'beetroots[age=3]'];
  for (let i = 0; i < 5; i++) if (crops[i]) b.fill(1 + i, 1, 1, 1 + i, 1, 13, crops[i]);
  b.set(3, 7, 3, 'glowstone').set(3, 7, 7, 'glowstone').set(3, 7, 11, 'glowstone');
  b.set(0, 1, 0, 'composter').set(0, 1, 14, 'hay_block[axis=y]').set(1, 1, 14, 'hay_block[axis=y]').set(0, 2, 14, 'hay_block[axis=y]');
  b.set(6, 1, 14, 'water_cauldron[level=3]').set(6, 1, 0, 'barrel[facing=up]');
  return b.build();
}

/** 1x2_a5: the kitchen: a range of furnaces and smokers, a counter with a cauldron, a table, the larder */
function kitchen(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.set(0, 1, 1, 'smoker[facing=east]').set(0, 1, 2, 'furnace[facing=east]').set(0, 1, 3, 'smoker[facing=east]').set(0, 1, 4, 'crafting_table');
  b.fill(0, 1, 8, 0, 1, 12, counter('west')).set(0, 1, 9, 'water_cauldron[level=3]').set(0, 1, 11, BARREL).marker(0, 1, 13, CHEST.east);
  b.set(0, 2, 10, 'potted_red_mushroom').set(0, 2, 12, 'potted_brown_mushroom');
  table(b, 3, 9, 3, 11, 'white_carpet');
  b.set(2, 1, 10, chair('east')).set(4, 1, 10, chair('west'));
  b.set(6, 1, 14, 'melon').set(5, 1, 14, 'pumpkin').set(6, 1, 13, 'hay_block[axis=y]').set(4, 1, 14, BARREL);
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_a6: the forge: a stone floor, furnaces and a lava cauldron, an anvil, a smithing table, a chest */
function forge(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(0, 0, 8, 6, 0, 14, 'stone_bricks');
  b.fill(0, 1, 9, 0, 1, 11, 'furnace[facing=east]').set(0, 1, 12, 'lava_cauldron').set(0, 1, 13, 'smithing_table').set(0, 1, 14, 'coal_block');
  b.set(3, 1, 11, 'anvil[facing=east]').set(6, 1, 14, 'grindstone[face=floor,facing=west]').marker(6, 1, 9, CHEST.west);
  b.set(0, 1, 0, 'crafting_table').fill(0, 1, 1, 0, 2, 2, BARREL).set(1, 1, 0, BARREL);
  b.marker(3, 1, 5, 'Warrior');
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_a7: the tree chopping room: a felled dark oak with its crown, a stump, stacked logs and planks */
function treeChopping(name: string): MansionTemplate {
  const b = room1x2(name);
  b.fill(2, 1, 10, 2, 1, 14, LOG_Z).fill(1, 1, 8, 3, 2, 9, 'dark_oak_leaves[persistent=true]').set(2, 1, 9, LOG_Z);
  b.set(5, 1, 10, LOG_Y).set(5, 1, 12, 'dark_oak_slab[type=bottom]').set(4, 1, 13, 'dark_oak_slab[type=bottom]');
  b.fill(0, 1, 13, 0, 2, 14, 'stripped_dark_oak_log[axis=z]').fill(6, 1, 13, 6, 1, 14, 'stripped_dark_oak_log[axis=z]');
  b.fill(0, 1, 0, 0, 2, 1, PLANKS).set(0, 1, 2, 'birch_planks').set(0, 1, 4, 'crafting_table');
  return b.set(3, 6, 3, HANG).set(4, 6, 11, HANG).build();
}

/** 1x2_a8: the gallery: pictures of wool on the walls, benches before them */
function gallery(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  picture(b, 0, 5, 1, 'z', 'llyyl|llyyl|gllgG|GGgGG', WOOL);
  picture(b, 0, 5, 9, 'z', 'bbbwb|bwbbb|bbbbb|kkkkk', WOOL);
  picture(b, 6, 5, 9, 'z', 'wrrrw|wryrw|wwgww|wwgww', WOOL);
  b.fill(2, 1, 2, 2, 1, 4, chair('west', 'birch')).fill(2, 1, 10, 2, 1, 12, chair('west', 'birch')).fill(4, 1, 10, 4, 1, 12, chair('east', 'birch'));
  b.set(3, 1, 0, 'potted_dark_oak_sapling').set(3, 1, 14, 'potted_dark_oak_sapling');
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_a9: a bedroom: a double bed between nightstands, a wardrobe and a chest; a table by the door */
function bedroom(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(2, 1, 9, 4, 1, 12, 'red_carpet');
  bed(b, 0, 1, 10, 'west');
  bed(b, 0, 1, 11, 'west');
  nightstand(b, 0, 9);
  nightstand(b, 0, 12);
  b.fill(0, 1, 14, 2, 2, 14, SHELF).marker(6, 1, 13, CHEST.west);
  b.set(1, 1, 2, FENCE).set(1, 2, 2, 'potted_pink_tulip').set(1, 1, 3, chair('north', 'birch')).fill(0, 1, 0, 1, 2, 0, SHELF);
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

// ---------------------------------------------------------------------------------------------------------------
// The ground storey's 1×2 rooms entered from the end (vanilla 1x2_b1-5): the door's in the south cell

/** 1x2_b1: a wool statue of a chicken on a plinth, bales of hay, benches to look at it from */
function chickenStatue(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(1, 0, 0, 5, 0, 5, 'stone_bricks');
  b.set(2, 1, 3, 'orange_wool').set(4, 1, 3, 'orange_wool');
  b.fill(2, 2, 1, 4, 4, 4, 'white_wool').fill(1, 3, 2, 1, 3, 3, 'white_wool').fill(5, 3, 2, 5, 3, 3, 'white_wool');
  b.fill(2, 5, 1, 4, 5, 1, 'white_wool').fill(2, 5, 4, 4, 6, 5, 'white_wool');
  b.set(2, 6, 5, 'black_wool').set(4, 6, 5, 'black_wool').set(3, 5, 6, 'orange_wool').set(3, 4, 5, 'red_wool');
  b.set(0, 1, 0, 'hay_block[axis=y]').set(6, 1, 0, 'hay_block[axis=y]').set(0, 1, 1, 'hay_block[axis=y]').set(0, 2, 0, 'hay_block[axis=y]');
  b.fill(1, 1, 10, 2, 1, 10, chair('north', 'birch')).fill(4, 1, 10, 5, 1, 10, chair('north', 'birch'));
  b.set(0, 1, 14, 'potted_dandelion').set(6, 1, 14, 'potted_dandelion');
  return b.set(1, 6, 3, HANG).set(5, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_b2: a wool statue of a spider, red-eyed, eight legs, webs in the corners */
function spiderStatue(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(2, 2, 0, 4, 4, 2, 'black_wool').fill(2, 2, 3, 4, 3, 5, 'black_wool').set(2, 3, 5, 'red_wool').set(4, 3, 5, 'red_wool');
  for (let z = 2; z <= 5; z++) b.set(1, 3, z, 'black_wool').set(0, 2, z, 'black_wool').set(0, 1, z, 'black_wool').set(5, 3, z, 'black_wool').set(6, 2, z, 'black_wool').set(6, 1, z, 'black_wool');
  cobwebs(b, 0, 4, 0, 6, 6, 6, 35, 2);
  b.fill(0, 1, 14, 0, 3, 14, 'cobweb').fill(6, 1, 14, 6, 3, 14, 'cobweb').set(0, 1, 8, 'cobweb').set(6, 1, 8, 'cobweb');
  return b.set(3, 6, 10, HANG).build();
}

/** 1x2_b3: the brewing room: brewing stands and cauldrons, shelves of mushrooms, an evoker at work */
function brewingRoom(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.set(1, 1, 0, 'brewing_stand').set(2, 1, 0, 'water_cauldron[level=3]').set(3, 1, 0, 'brewing_stand').set(4, 1, 0, 'cauldron').set(5, 1, 0, 'brewing_stand');
  b.fill(0, 1, 1, 0, 1, 5, BARREL);
  for (let z = 1; z <= 5; z++) b.set(0, 2, z, z % 2 ? 'potted_red_mushroom' : 'potted_brown_mushroom');
  b.fill(6, 1, 1, 6, 2, 5, SHELF);
  lamp(b, 3, 3);
  b.fill(2, 1, 9, 4, 1, 12, 'purple_carpet').marker(3, 1, 10, 'Mage').marker(6, 1, 13, CHEST.west);
  return b.set(3, 6, 5, HANG).set(3, 6, 12, HANG).build();
}

/** 1x2_b4: a study: a desk, bookshelves, armchairs by a lamp */
function study(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(2, 1, 0, 4, 1, 0, counter('north')).set(3, 1, 1, chair('north')).set(2, 2, 0, STAND).set(4, 2, 0, 'potted_fern');
  b.fill(0, 1, 0, 0, 3, 6, SHELF).fill(6, 1, 0, 6, 3, 6, SHELF).fill(0, 1, 8, 0, 3, 13, SHELF);
  b.fill(2, 1, 3, 4, 1, 5, 'blue_carpet');
  lamp(b, 3, 10);
  b.set(2, 1, 10, chair('east', 'birch')).set(4, 1, 10, chair('west', 'birch'));
  return b.set(3, 6, 4, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_b5: the indoor garden: a lawn with a pond and flowering azaleas, benches along the path */
function indoorGarden(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(0, 0, 0, 6, 0, 6, 'grass_block').fill(2, 0, 2, 4, 0, 3, 'water').set(3, 1, 2, 'lily_pad');
  b.set(1, 1, 1, 'flowering_azalea').set(5, 1, 1, 'flowering_azalea').set(1, 1, 5, 'azalea').set(5, 1, 5, 'azalea');
  flowers(b, 0, 0, 6, 6, ['poppy', 'dandelion', 'cornflower', 'lily_of_the_valley', 'azure_bluet', 'oxeye_daisy'], 45, 5);
  b.fill(1, 1, 10, 1, 1, 12, chair('east', 'birch')).fill(5, 1, 10, 5, 1, 12, chair('west', 'birch'));
  b.set(0, 1, 9, 'potted_fern').set(6, 1, 9, 'potted_fern').set(0, 1, 13, 'potted_cornflower').set(6, 1, 13, 'potted_cornflower');
  return b.set(3, 7, 3, 'glowstone').set(3, 6, 11, HANG).build();
}

// ---------------------------------------------------------------------------------------------------------------
// The ground storey's secret 1×2 rooms (vanilla 1x2_s1-2)

/** 1x2_s1: the fake End portal: twelve empty portal frames round a floor of obsidian, a chest behind */
function fakeEndPortal(name: string): MansionTemplate {
  const b = room1x2(name);
  b.fill(2, 0, 10, 4, 0, 12, 'obsidian');
  for (let i = 2; i <= 4; i++) {
    b.set(i, 1, 9, 'end_portal_frame[facing=south]').set(i, 1, 13, 'end_portal_frame[facing=north]');
    b.set(1, 1, 8 + i, 'end_portal_frame[facing=east]').set(5, 1, 8 + i, 'end_portal_frame[facing=west]');
  }
  for (const [x, z] of [[0, 8], [6, 8], [0, 14], [6, 14]]) b.fill(x, 1, z, x, 6, z, 'obsidian');
  b.marker(3, 1, 1, CHEST.south);
  cobwebs(b, 0, 1, 0, 6, 6, 6, 25, 6);
  return b.set(3, 6, 11, HANG).build();
}

/** 1x2_s2: the secret library: bookshelves all round an enchanting table, a chest, cobwebs */
function secretLibrary(name: string): MansionTemplate {
  const b = room1x2(name);
  b.ring(0, 1, 0, 6, 5, 14, SHELF);
  b.fill(2, 1, 6, 4, 1, 8, 'purple_carpet').set(3, 1, 7, 'enchanting_table').marker(3, 1, 13, CHEST.north);
  cobwebs(b, 1, 4, 1, 5, 6, 13, 30, 7);
  return b.set(3, 6, 3, HANG).build();
}

// ---------------------------------------------------------------------------------------------------------------
// The upper storeys' 1×2 rooms entered from the side (vanilla 1x2_c1-4)

/** 1x2_c1: a bedroom with two beds, a nightstand and a chest between them, a sitting corner by the door */
function twinBedroom(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(2, 1, 9, 4, 1, 12, 'light_blue_carpet');
  bed(b, 0, 1, 9, 'west', 'light_blue');
  bed(b, 0, 1, 12, 'west', 'light_blue');
  nightstand(b, 0, 10);
  b.marker(0, 1, 11, CHEST.east).fill(4, 1, 14, 6, 2, 14, 'barrel[facing=north]');
  b.set(2, 1, 1, FENCE).set(2, 2, 1, 'white_carpet').set(1, 1, 1, chair('east', 'birch')).set(3, 1, 1, chair('west', 'birch'));
  b.fill(0, 1, 0, 0, 2, 3, SHELF).set(6, 1, 0, 'potted_azalea_bush');
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/**
 * the jail cells (1x2_c2, 1x2_d2): a cell behind iron bars (with an iron door) for each `cell`, x0-x1 × z0-z1 inside,
 * `bars` the side the bars are on; the allays vanilla keeps in them aren't in the game, so they stand empty
 */
function cells(b: TemplateBuilder, list: { x0: number; z0: number; x1: number; z1: number; bars: Dir; door: [number, number] }[]): void {
  for (const c of list) {
    const [bx0, bz0, bx1, bz1] = c.bars === 'east' ? [c.x1 + 1, c.z0, c.x1 + 1, c.z1] : [c.x0, c.z1 + 1, c.x1, c.z1 + 1];
    b.fill(bx0, 1, bz0, bx1, 6, bz1, 'iron_bars');
    door(b, c.door[0], 1, c.door[1], c.bars, 'iron');
    b.marker(c.x0 + 1 > c.x1 ? c.x0 : c.x0 + 1, 1, c.z0 + 1 > c.z1 ? c.z0 : c.z0 + 1, 'Group of Allays');
  }
}

/** 1x2_c2: the jail: two cells along the far end, a guard's table and chest by the door */
function jailSide(name: string): MansionTemplate {
  const b = room1x2(name);
  b.fill(0, 1, 7, 3, 6, 7, 'cobblestone').fill(0, 1, 11, 3, 6, 11, 'cobblestone').fill(0, 0, 8, 2, 0, 14, 'cobblestone');
  cells(b, [
    { x0: 0, z0: 8, x1: 2, z1: 10, bars: 'east', door: [3, 9] },
    { x0: 0, z0: 12, x1: 2, z1: 14, bars: 'east', door: [3, 13] },
  ]);
  b.set(1, 1, 2, FENCE).set(1, 2, 2, STAND).set(1, 1, 3, chair('north')).marker(0, 1, 5, CHEST.east);
  b.marker(4, 1, 2, 'Warrior');
  return b.set(5, 6, 11, HANG).set(3, 6, 3, HANG).build();
}

/** 1x2_c3: a library in birch: shelves round the walls, a reading table, a lectern */
function birchLibrary(name: string): MansionTemplate {
  const b = room1x2(name);
  b.fill(0, 1, 0, 0, 5, 14, SHELF).fill(1, 1, 14, 6, 5, 14, SHELF).fill(1, 1, 0, 4, 5, 0, SHELF).fill(6, 1, 8, 6, 5, 13, SHELF);
  b.fill(1, 0, 1, 5, 0, 13, 'birch_planks').fill(2, 1, 8, 4, 1, 12, 'light_gray_carpet');
  b.set(3, 1, 10, 'birch_fence').set(3, 2, 10, 'white_carpet').set(2, 1, 10, chair('east', 'birch')).set(4, 1, 10, chair('west', 'birch'));
  b.set(1, 1, 4, 'lectern[facing=east]');
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_c4: the weaving room: looms, bales of wool in every colour, banners */
function weavingRoom(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  for (const z of [1, 3, 5]) b.set(0, 1, z, 'loom[facing=east]');
  const colours = ['white', 'red', 'blue', 'yellow', 'green', 'black', 'orange', 'purple', 'cyan', 'lime'];
  for (let i = 0; i < 5; i++) b.set(0, 1, 9 + i, `${colours[i]}_wool`).set(0, 2, 9 + i, `${colours[i + 5]}_wool`);
  b.set(3, 1, 12, 'white_banner[rotation=4]').set(5, 1, 12, 'red_banner[rotation=4]').set(4, 1, 9, 'black_banner[rotation=4]');
  b.fill(2, 1, 1, 4, 1, 5, 'cyan_carpet');
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

// ---------------------------------------------------------------------------------------------------------------
// The upper storeys' 1×2 rooms entered from the end (vanilla 1x2_d1-5): the door's in the south cell

/** 1x2_d1: the master bedroom: a double bed at the far end between nightstands, a chest, a desk */
function masterBedroom(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(1, 1, 2, 5, 1, 5, 'red_carpet');
  bed(b, 2, 1, 0, 'north');
  bed(b, 3, 1, 0, 'north');
  nightstand(b, 1, 0);
  nightstand(b, 4, 0);
  b.fill(5, 1, 0, 6, 2, 0, 'barrel[facing=south]').marker(6, 1, 3, CHEST.west);
  b.fill(0, 1, 9, 0, 1, 11, counter('west')).set(1, 1, 10, chair('west')).set(0, 2, 9, STAND).fill(0, 1, 12, 0, 3, 13, SHELF);
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_d2: the jail: two cells in the far cell, a guard by the door */
function jailFront(name: string): MansionTemplate {
  const b = room1x2(name);
  b.fill(3, 1, 0, 3, 6, 3, 'cobblestone').fill(0, 0, 0, 2, 0, 2, 'cobblestone').fill(4, 0, 0, 6, 0, 2, 'cobblestone');
  cells(b, [
    { x0: 0, z0: 0, x1: 2, z1: 2, bars: 'south', door: [1, 3] },
    { x0: 4, z0: 0, x1: 6, z1: 2, bars: 'south', door: [5, 3] },
  ]);
  b.set(1, 1, 9, FENCE).set(1, 2, 9, STAND).set(2, 1, 9, chair('west')).marker(0, 1, 13, CHEST.east);
  b.marker(4, 1, 10, 'Warrior');
  return b.set(3, 6, 5, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_d3: a wool statue of a pig on a bed of mud */
function pigStatue(name: string): MansionTemplate {
  const b = room1x2(name);
  b.fill(0, 1, 7, 0, 6, 7, LOG_Y).fill(6, 1, 7, 6, 6, 7, LOG_Y);
  b.fill(1, 0, 0, 5, 0, 6, 'coarse_dirt');
  for (const [x, z] of [[2, 1], [4, 1], [2, 4], [4, 4]]) b.set(x, 1, z, 'pink_wool');
  b.fill(2, 2, 1, 4, 3, 4, 'pink_wool').set(3, 3, 0, 'pink_wool').fill(2, 2, 5, 4, 4, 6, 'pink_wool');
  b.set(2, 4, 6, 'black_wool').set(4, 4, 6, 'black_wool').set(3, 3, 7, 'pink_terracotta');
  b.fill(1, 1, 10, 2, 1, 10, chair('north', 'birch')).fill(4, 1, 10, 5, 1, 10, chair('north', 'birch'));
  b.set(0, 1, 0, 'hay_block[axis=y]').set(6, 1, 0, 'hay_block[axis=y]');
  return b.set(1, 6, 3, HANG).set(5, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_d4: the enchanting room: an enchanting table in a horseshoe of bookshelves, an evoker by the door */
function enchantingRoom(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(1, 1, 0, 5, 2, 0, SHELF).fill(1, 1, 1, 1, 2, 4, SHELF).fill(5, 1, 1, 5, 2, 4, SHELF);
  b.set(3, 1, 2, 'enchanting_table').fill(2, 1, 9, 4, 1, 12, 'purple_carpet');
  b.marker(3, 1, 10, 'Mage');
  lamp(b, 0, 9);
  lamp(b, 6, 9);
  return b.set(3, 6, 2, HANG).set(3, 6, 11, HANG).build();
}

/** 1x2_d5: a wardrobe: barrels along the walls and a chest among them, a rug */
function wardrobe(name: string): MansionTemplate {
  const b = arch(room1x2(name));
  b.fill(0, 1, 0, 6, 2, 0, 'barrel[facing=south]').fill(0, 1, 1, 0, 2, 6, 'barrel[facing=east]').fill(6, 1, 1, 6, 2, 6, 'barrel[facing=west]');
  b.set(6, 2, 3, 'air').marker(6, 1, 3, CHEST.west);
  b.fill(2, 1, 2, 4, 1, 5, 'magenta_carpet').fill(0, 1, 9, 0, 2, 12, 'barrel[facing=east]');
  return b.set(3, 6, 3, HANG).set(3, 6, 11, HANG).build();
}

// ---------------------------------------------------------------------------------------------------------------
// The upper storeys' secret 1×2 room (vanilla 1x2_se1)

/** 1x2_se1: the cobweb room: thick with webs, two chests in them */
function bigCobwebRoom(name: string): MansionTemplate {
  const b = room1x2(name);
  b.marker(1, 1, 2, CHEST.east).marker(5, 1, 12, CHEST.west);
  cobwebs(b, 0, 1, 0, 6, 6, 14, 50, 8);
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The ground storey's 2×2 rooms (vanilla 2x2_a1-4): the door's on the east, in the north-east cell

/** 2x2_a1: the dining hall: a long table with a cloth, chairs all round, sideboards, a vindicator */
function diningHall(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(1, 1, 5, 13, 1, 9, 'red_carpet');
  table(b, 2, 7, 12, 7);
  for (const x of [4, 7, 10]) b.set(x, 2, 7, STAND);
  for (let x = 3; x <= 11; x++) b.set(x, 1, 6, chair('south')).set(x, 1, 8, chair('north'));
  b.set(1, 1, 7, chair('east')).set(13, 1, 7, chair('west'));
  b.fill(3, 1, 0, 11, 1, 0, counter('north')).fill(3, 1, 14, 11, 1, 14, counter('south'));
  for (const x of [4, 7, 10]) b.set(x, 2, 0, 'potted_red_tulip').set(x, 2, 14, 'potted_white_tulip');
  b.marker(11, 1, 3, 'Warrior');
  for (const [x, z] of [[4, 4], [10, 4], [4, 10], [10, 10]]) b.set(x, 6, z, HANG);
  return b.build();
}

/** 2x2_a2: the statue hall: a great wool statue of an illager, arms folded, on a plinth; banners, benches, guards */
function illagerStatue(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(3, 0, 4, 9, 0, 10, 'stone_bricks');
  // legs, body and folded arms, head (the face to the east: green eyes under a black brow, the long nose), hair
  b.fill(5, 1, 6, 6, 2, 6, 'black_wool').fill(5, 1, 8, 6, 2, 8, 'black_wool');
  b.fill(5, 3, 6, 6, 4, 8, 'gray_wool').fill(7, 4, 6, 7, 4, 8, 'gray_wool');
  b.fill(5, 5, 6, 6, 6, 8, 'light_gray_wool').set(6, 6, 6, 'green_wool').set(6, 6, 8, 'green_wool').set(6, 6, 7, 'black_wool').set(7, 5, 7, 'light_gray_wool');
  b.fill(5, 6, 6, 5, 6, 8, 'black_wool');
  for (const z of [4, 10]) b.set(3, 1, z, FENCE).set(3, 2, z, STAND).set(9, 1, z, 'white_banner[rotation=12]');
  b.fill(12, 1, 5, 12, 1, 9, chair('west', 'birch'));
  b.marker(10, 1, 5, 'Warrior').marker(10, 1, 9, 'Warrior');
  return b.set(11, 6, 4, HANG).set(11, 6, 10, HANG).set(3, 6, 7, HANG).build();
}

/** 2x2_a3: the meeting room: a long table with a green cloth, chairs round it, an evoker at its head, bookshelves */
function meetingRoom(name: string): MansionTemplate {
  const b = room2x2(name);
  table(b, 4, 6, 10, 8, 'green_carpet');
  for (let x = 5; x <= 9; x++) b.set(x, 1, 5, chair('south')).set(x, 1, 9, chair('north'));
  b.set(11, 1, 7, chair('west'));
  b.fill(0, 1, 1, 0, 3, 13, SHELF).set(1, 1, 7, 'lectern[facing=east]');
  b.marker(3, 1, 7, 'Mage').marker(13, 1, 11, 'Warrior');
  lamp(b, 1, 1);
  lamp(b, 1, 13);
  return b.set(5, 6, 7, HANG).set(9, 6, 7, HANG).build();
}

/** 2x2_a4: the storage hall: walls of barrels, crates of crops, three chests, a vindicator */
function storageHall(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(0, 1, 0, 6, 2, 0, BARREL).fill(0, 1, 14, 13, 2, 14, BARREL).fill(0, 1, 1, 0, 2, 13, BARREL);
  for (const [x, z, d] of [[0, 3, 'east'], [9, 14, 'north']] as [number, number, Dir][]) b.set(x, 2, z, 'air').marker(x, 1, z, CHEST[d]);
  b.fill(4, 1, 6, 5, 2, 8, 'hay_block[axis=y]').fill(7, 1, 6, 7, 1, 8, 'pumpkin').fill(9, 1, 6, 10, 1, 8, 'melon').set(8, 1, 7, BARREL);
  b.marker(7, 1, 5, CHEST.north);
  b.marker(11, 1, 10, 'Warrior');
  for (const [x, z] of [[4, 4], [10, 4], [4, 10], [10, 10]]) b.set(x, 6, z, HANG);
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The upper storeys' 2×2 rooms (vanilla 2x2_b1-5)

/** 2x2_b1: the map room: a table with a map of the world in carpet on it (the mansion marked in red), bookshelves */
function mapRoom(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(4, 1, 5, 10, 1, 9, PLANKS);
  const key: Record<string, Blk> = {
    '~': 'blue_carpet', '-': 'light_blue_carpet', y: 'yellow_carpet', g: 'lime_carpet', G: 'green_carpet', x: 'red_carpet', m: 'gray_carpet', s: 'white_carpet',
  };
  b.layer(2, '~~-yggG|~-yggGG|~-ygGxG|~~-ymsG|~~~-yms', key, 4, 5);
  b.fill(1, 1, 0, 13, 3, 0, SHELF).set(7, 1, 0, 'lectern[facing=south]').fill(7, 2, 0, 7, 3, 0, SHELF);
  b.set(1, 1, 13, 'cartography_table').set(2, 1, 14, BARREL).marker(13, 1, 13, CHEST.west);
  b.fill(4, 1, 11, 10, 1, 11, 'brown_carpet').fill(4, 1, 3, 10, 1, 3, 'brown_carpet');
  b.marker(12, 1, 7, 'Warrior');
  return b.set(5, 6, 7, HANG).set(9, 6, 7, HANG).set(2, 6, 3, HANG).set(12, 6, 11, HANG).build();
}

/** 2x2_b2: the great library: bookshelves on every wall and in two stacks, reading tables, lecterns */
function greatLibrary(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(0, 1, 0, 0, 5, 14, SHELF).fill(1, 1, 0, 13, 5, 0, SHELF).fill(1, 1, 14, 13, 5, 14, SHELF).fill(14, 1, 7, 14, 5, 14, SHELF);
  b.fill(3, 1, 4, 11, 3, 4, SHELF).fill(3, 1, 10, 11, 3, 10, SHELF).fill(7, 1, 4, 7, 3, 4, 'air').fill(7, 1, 10, 7, 3, 10, 'air');
  b.fill(4, 1, 6, 10, 1, 8, 'red_carpet');
  table(b, 5, 7, 9, 7);
  for (const x of [5, 9]) b.set(x, 1, 6, chair('south')).set(x, 1, 8, chair('north'));
  b.set(2, 1, 7, 'lectern[facing=east]').set(12, 1, 7, 'lectern[facing=west]');
  lamp(b, 13, 13);
  return b.set(3, 6, 7, HANG).set(11, 6, 7, HANG).set(7, 6, 2, HANG).set(7, 6, 12, HANG).build();
}

/** 2x2_b3: the arena: a fenced pit of dirt with an evoker and two vindicators in it, benches round it */
function arena(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(4, 0, 4, 10, 0, 10, 'coarse_dirt').ring(3, 1, 3, 11, 1, 11, FENCE);
  b.set(3, 1, 7, 'dark_oak_fence_gate[facing=east]').set(11, 1, 7, 'dark_oak_fence_gate[facing=east]');
  b.fill(1, 1, 3, 1, 1, 11, chair('east', 'birch')).fill(3, 1, 1, 11, 1, 1, chair('south', 'birch')).fill(3, 1, 13, 11, 1, 13, chair('north', 'birch'));
  b.marker(7, 1, 7, 'Mage').marker(5, 1, 5, 'Warrior').marker(9, 1, 9, 'Warrior');
  b.set(13, 1, 12, 'anvil[facing=north]').set(13, 1, 11, 'grindstone[face=floor,facing=west]').marker(13, 1, 13, CHEST.west);
  for (const [x, z] of [[4, 4], [10, 4], [4, 10], [10, 10]]) b.set(x, 6, z, HANG);
  return b.build();
}

/** 2x2_b4: the greenhouse: a dark oak growing in a lawn of flowers, a lily pond, glowstone overhead */
function greenhouse(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(1, 0, 1, 13, 0, 13, 'grass_block').fill(10, 0, 3, 13, 0, 3, 'coarse_dirt').fill(2, 0, 10, 4, 0, 12, 'water').set(3, 1, 11, 'lily_pad');
  const LEAVES = 'dark_oak_leaves[persistent=true]';
  b.fill(5, 4, 5, 9, 4, 9, LEAVES).fill(6, 5, 6, 8, 5, 8, LEAVES).fill(7, 6, 6, 7, 6, 8, LEAVES).fill(6, 6, 7, 8, 6, 7, LEAVES);
  for (const [x, z] of [[5, 5], [9, 5], [5, 9], [9, 9]]) b.set(x, 4, z, 'air');
  b.fill(7, 1, 7, 7, 5, 7, LOG_Y);
  flowers(b, 1, 1, 13, 13, ['poppy', 'dandelion', 'allium', 'azure_bluet', 'red_tulip', 'white_tulip', 'oxeye_daisy', 'cornflower', 'short_grass', 'fern'], 35, 9);
  b.set(13, 1, 13, 'composter').set(1, 1, 1, 'flowering_azalea').set(13, 1, 1, 'azalea');
  for (const [x, z] of [[3, 3], [11, 3], [3, 11], [11, 11]]) b.set(x, 7, z, 'glowstone');
  return b.build();
}

/** 2x2_b5: the grand bedroom: a double bed on a rug, nightstands, wardrobes and a chest, a fireplace with armchairs */
function grandBedroom(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(0, 1, 4, 4, 1, 9, 'red_carpet');
  bed(b, 0, 1, 6, 'west');
  bed(b, 0, 1, 7, 'west');
  nightstand(b, 0, 5);
  nightstand(b, 0, 8);
  b.fill(2, 1, 0, 5, 3, 0, 'barrel[facing=south]').marker(6, 1, 0, CHEST.south);
  b.fill(5, 1, 14, 9, 6, 14, 'stone_bricks').fill(5, 1, 13, 5, 3, 13, 'stone_bricks').fill(9, 1, 13, 9, 3, 13, 'stone_bricks');
  b.fill(6, 3, 13, 8, 3, 13, 'stone_brick_slab[type=top]').set(7, 1, 13, 'campfire[lit=true,facing=north]');
  b.set(6, 1, 11, chair('south', 'birch')).set(8, 1, 11, chair('south', 'birch'));
  lamp(b, 7, 10);
  b.fill(12, 1, 12, 13, 1, 13, 'white_carpet').set(13, 1, 14, 'potted_azalea_bush');
  return b.set(3, 6, 3, HANG).set(11, 6, 11, HANG).set(3, 6, 11, HANG).build();
}

// ---------------------------------------------------------------------------------------------------------------
// The secret 2×2 room (vanilla 2x2_s1, on any storey)

/** 2x2_s1: the vault: four chests on stone pedestals round a lantern, cobwebs in the corners */
function vault(name: string): MansionTemplate {
  const b = room2x2(name);
  b.fill(1, 0, 1, 13, 0, 13, 'stone_bricks').fill(7, 0, 1, 7, 0, 13, 'red_wool').fill(1, 0, 7, 13, 0, 7, 'red_wool');
  for (const [x, z, d] of [[3, 3, 'south'], [11, 3, 'south'], [3, 11, 'north'], [11, 11, 'north']] as [number, number, Dir][]) b.set(x, 1, z, 'chiseled_stone_bricks').marker(x, 2, z, CHEST[d]);
  b.set(7, 1, 7, 'chiseled_stone_bricks').set(7, 2, 7, STAND);
  for (const [x, z] of [[0, 0], [14, 0], [0, 14], [14, 14]]) cobwebs(b, Math.max(0, x - 2), 1, Math.max(0, z - 2), Math.min(14, x + 2), 6, Math.min(14, z + 2), 45, x + z);
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The staircase to the third storey (vanilla 1x2_c_stairs, 1x2_d_stairs)

/**
 * a second storey room whose other cell is the third storey's landing (y 11 its floor, y 18 its ceiling): a
 * flight up the west side (x 0-1), from the door's cell to the landing, through a well in the ceiling and the
 * third storey's floor with a rail round it. It holds the third storey's floor and ceiling over both its cells,
 * and a block beyond them all round they go in wherever there's air: the joints next to the landing that the
 * corridors leading off it don't close. `front`: the door's in the south cell (1x2_d_stairs), not the north.
 */
function stairsRoom(name: string, front: boolean): MansionTemplate {
  const b = new TemplateBuilder(name, 9, 19, 17, -1, -1);
  // both storeys, and round the edge the third storey's floor and ceiling where nothing else is
  b.fill(0, 0, 0, 6, 0, 14, PLANKS).fill(0, 1, 0, 6, 6, 14, 'air').fill(0, 7, 0, 6, 7, 14, PLANKS).fill(0, 7, 7, 6, 7, 7, LOG_X);
  b.fill(0, 11, 0, 6, 11, 14, PLANKS).fill(0, 12, 0, 6, 17, 14, 'air').fill(0, 18, 0, 6, 18, 14, PLANKS).fill(0, 18, 7, 6, 18, 7, LOG_X);
  for (const y of [11, 18]) b.soft(-1, y, -1, 7, y, -1, PLANKS).soft(-1, y, 15, 7, y, 15, PLANKS).soft(-1, y, 0, -1, y, 14, PLANKS).soft(7, y, 0, 7, y, 14, PLANKS);
  // the flight: eleven steps from y 1 to the landing's floor, solid under each, clear above each through the well
  const dir: Dir = front ? 'north' : 'south';
  const [w0, w1] = front ? [4, 9] : [7, 12];
  const [end, top] = front ? [10, 3] : [6, 13];
  for (let i = 0; i < 11; i++) {
    const z = front ? 13 - i : 3 + i, y = 1 + i;
    if (y > 1) b.fill(0, 1, z, 1, y - 1, z, PLANKS);
    b.fill(0, y, z, 1, y, z, stair(dir));
    if (z >= w0 && z <= w1) b.fill(0, Math.max(7, y + 1), z, 1, 11, z, 'air');
  }
  // the well's sides through the gap between the storeys, and the rail round it
  b.fill(2, 8, w0, 2, 10, w1, PLANKS).fill(0, 8, end, 1, 10, end, PLANKS).soft(-1, 8, Math.min(w0, top) - 1, -1, 10, Math.max(w1, top) + 1, PLANKS);
  b.fill(2, 12, w0, 2, 12, w1, FENCE).fill(0, 12, end, 1, 12, end, FENCE).set(2, 12, end, FENCE);
  // below: a rug from the door, a bookcase and a chest in the other cell; above: lanterns, a vindicator on the landing
  if (front) {
    b.fill(2, 1, 9, 4, 1, 13, 'red_carpet').fill(2, 1, 0, 6, 2, 0, SHELF).marker(6, 1, 2, CHEST.west);
  } else {
    b.fill(2, 1, 2, 5, 1, 4, 'red_carpet').fill(2, 1, 14, 6, 2, 14, SHELF).marker(6, 1, 12, CHEST.west);
  }
  b.set(4, 6, 3, HANG).set(4, 6, 11, HANG).set(4, 17, 3, HANG).set(4, 17, 11, HANG);
  b.marker(4, 12, front ? 2 : 12, 'Warrior');
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The registry

export const ROOMS: Record<string, () => MansionTemplate> = {};
const add = (name: string, make: (name: string) => MansionTemplate) => {
  ROOMS[name] = () => make(name);
};

// the ground storey
add('1x1_a1', flowerRoom);
add('1x1_a2', pumpkinRing);
add('1x1_a3', office);
add('1x1_a4', checkerboard);
add('1x1_a5', tulipSanctuary);
add('1x2_a1', diningRoom);
add('1x2_a2', library);
add('1x2_a3', storageRoom);
add('1x2_a4', wheatFarm);
add('1x2_a5', kitchen);
add('1x2_a6', forge);
add('1x2_a7', treeChopping);
add('1x2_a8', gallery);
add('1x2_a9', bedroom);
add('1x2_b1', chickenStatue);
add('1x2_b2', spiderStatue);
add('1x2_b3', brewingRoom);
add('1x2_b4', study);
add('1x2_b5', indoorGarden);
add('1x2_s1', fakeEndPortal);
add('1x2_s2', secretLibrary);
add('2x2_a1', diningHall);
add('2x2_a2', illagerStatue);
add('2x2_a3', meetingRoom);
add('2x2_a4', storageHall);
// the upper storeys
add('1x1_b1', birchPillars);
add('1x1_b2', smallBedroom);
add('1x1_b3', smallLibrary);
add('1x1_b4', alliumRoom);
add('1x2_c1', twinBedroom);
add('1x2_c2', jailSide);
add('1x2_c3', birchLibrary);
add('1x2_c4', weavingRoom);
add('1x2_d1', masterBedroom);
add('1x2_d2', jailFront);
add('1x2_d3', pigStatue);
add('1x2_d4', enchantingRoom);
add('1x2_d5', wardrobe);
add('1x2_se1', bigCobwebRoom);
add('2x2_b1', mapRoom);
add('2x2_b2', greatLibrary);
add('2x2_b3', arena);
add('2x2_b4', greenhouse);
add('2x2_b5', grandBedroom);
add('1x2_c_stairs', (n) => stairsRoom(n, false));
add('1x2_d_stairs', (n) => stairsRoom(n, true));
// any storey
add('1x1_as1', cobwebRoom);
add('1x1_as2', diamondRoom);
add('1x1_as3', lavaRoom);
add('1x1_as4', obsidianRoom);
add('2x2_s1', vault);
