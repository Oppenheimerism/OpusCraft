// The ancient city's pools (vanilla AncientCityStructurePieces and AncientCityStructurePools, with their weights and
// processor lists) and the templates of its buildings, ruins, walls and entrance tunnel, written in code from
// vanilla's as they're known (ancient_city/structures/*, ancient_city/walls/*, ancient_city/city/entrance/*); the
// centre and its quarters are in world/gen/ancientCityCenter.ts. No game files are used.
//
// Every building stands on one connector at the middle of its bottom (minecraft:bottom, facing down), which a
// quarter's plot offers facing up; it may turn any way.

import type { Rand } from '../../core/rng';
import { pool, EMPTY } from './jigsaw';
import { CityBuilder, CityElement, CityListElement, CitySculkElement, type CityTemplate } from './ancientCityTemplates';
import { centerTemplates, quarterTemplates } from './ancientCityCenter';
import {
  TILES, BRICKS, POLISHED, COBBLED, CHISELED, BASALT, SMOOTH_BASALT, TILE_WALL, BRICK_WALL, GRAY_WOOL, GRAY_CARPET,
  stair, slab, templateRandom, wallBlock, streetBlock, hangingLantern, candles, skull, pick, type Side,
} from './ancientCityDesign';

const CITY = 'chests/ancient_city', ICE_BOX = 'chests/ancient_city_ice_box';
const SIDES: Side[] = ['north', 'east', 'south', 'west'];

/** a builder for a building: a box with its bottom connector at the middle of its floor */
function building(sx: number, sy: number, sz: number, floor = TILES): CityBuilder {
  const b = new CityBuilder(sx, sy, sz);
  b.jigsaw(sx >> 1, 0, sz >> 1, { facing: 'down', name: 'minecraft:bottom', final: floor });
  return b;
}

/**
 * a room: floor at y 0, walls up to `h`, a roof over them, the inside hollowed; `doors`: the sides with a doorway
 * (two wide, three high) in the middle
 */
function room(b: CityBuilder, r: Rand, x0: number, z0: number, x1: number, z1: number, h: number, doors: Side[], roof = true): void {
  b.fill(x0, 0, z0, x1, 0, z1, TILES);
  for (let y = 1; y <= h; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        b.set(x, y, z, !edge ? 'air' : corner ? POLISHED : y === h ? TILES : wallBlock(r));
      }
  if (roof)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) b.set(x, h + 1, z, x === x0 || x === x1 || z === z0 || z === z1 ? slab('deepslate_tile') : TILES);
  const mx = (x0 + x1) >> 1, mz = (z0 + z1) >> 1;
  for (const d of doors) {
    for (let y = 1; y <= 3; y++)
      for (const o of [0, 1]) {
        if (d === 'north') b.set(mx - o, y, z0, 'air');
        if (d === 'south') b.set(mx + o, y, z1, 'air');
        if (d === 'west') b.set(x0, y, mz - o, 'air');
        if (d === 'east') b.set(x1, y, mz + o, 'air');
      }
  }
}

/** knock pieces out of what's built: each block of the kinds given goes with the chance, and some that go leave rubble */
function ruin(b: CityBuilder, r: Rand, chance: (x: number, y: number, z: number) => number): void {
  for (let y = 1; y < b.sy; y++)
    for (let z = 0; z < b.sz; z++)
      for (let x = 0; x < b.sx; x++) {
        const n = b.name(x, y, z);
        if (n === '' || n === 'air' || n === 'chest' || n === 'jigsaw') continue;
        if (r.nextFloat() < chance(x, y, z)) b.set(x, y, z, 'air');
      }
  // rubble on the floor
  for (let i = 0; i < (b.sx * b.sz) / 8; i++) {
    const x = r.nextInt(b.sx), z = r.nextInt(b.sz);
    if (b.get(x, 1, z) === 0 && b.name(x, 0, z) !== '') b.set(x, 1, z, pick(r, [[COBBLED, 2], [slab('cobbled_deepslate'), 3], [slab('deepslate_brick'), 2]]));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// ancient_city/structures

/** vanilla ancient_city/structures/barracks: a long hall of bunks under a low roof, two chests at its ends */
function barracks(): CityTemplate {
  const id = 'ancient_city/structures/barracks';
  const r = templateRandom(id);
  const b = building(15, 9, 11);
  b.fill(0, 1, 0, 14, 8, 10, 'air');
  room(b, r, 0, 0, 14, 10, 5, ['north', 'south']);
  // windows barred with deepslate brick walls
  for (const x of [3, 11])
    for (const z of [0, 10]) b.fill(x, 2, z, x + 1, 3, z, BRICK_WALL);
  // bunks of gray wool along both long walls, two tiers, a carpet on each
  for (let x = 2; x <= 12; x += 3)
    for (const z of [1, 9]) {
      if (x === 7) continue;
      b.set(x, 1, z, GRAY_WOOL).set(x + 1, 1, z, GRAY_WOOL);
      b.set(x, 2, z, GRAY_CARPET).set(x + 1, 2, z, GRAY_CARPET);
      b.set(x, 3, z, slab('dark_oak', true)).set(x + 1, 3, z, slab('dark_oak', true));
      b.set(x, 4, z, GRAY_CARPET).set(x + 1, 4, z, GRAY_CARPET);
    }
  b.chest(1, 1, 5, 'east', CITY);
  b.chest(13, 1, 5, 'west', CITY);
  hangingLantern(b, 7, 5, 5, 1);
  hangingLantern(b, 4, 5, 5, 1);
  hangingLantern(b, 10, 5, 5, 1);
  for (let i = 0; i < 5; i++) candles(b, r, 2 + r.nextInt(11), 1, 3 + r.nextInt(5));
  skull(b, r, 6, 1, 3);
  return b.build(id);
}

/** vanilla ancient_city/structures/chamber_1: a small shrine with a chest behind a sensor, lanterns at its door */
function chamber1(): CityTemplate {
  const id = 'ancient_city/structures/chamber_1';
  const r = templateRandom(id);
  const b = building(9, 8, 9);
  b.fill(0, 1, 0, 8, 7, 8, 'air');
  room(b, r, 0, 0, 8, 8, 5, ['south']);
  b.fill(2, 1, 1, 6, 1, 2, POLISHED);
  b.chest(4, 2, 1, 'south', CITY);
  b.set(4, 1, 4, 'sculk_sensor');
  for (const x of [2, 6]) b.set(x, 2, 2, 'candle[candles=3,lit=false]');
  b.fill(1, 1, 7, 2, 1, 7, GRAY_WOOL).fill(6, 1, 7, 7, 1, 7, GRAY_WOOL);
  hangingLantern(b, 4, 5, 5, 1);
  return b.build(id);
}

/** vanilla ancient_city/structures/chamber_2: two floors joined by stairs, a chest on each */
function chamber2(): CityTemplate {
  const id = 'ancient_city/structures/chamber_2';
  const r = templateRandom(id);
  const b = building(11, 11, 9);
  b.fill(0, 1, 0, 10, 10, 8, 'air');
  room(b, r, 0, 0, 10, 8, 8, ['south', 'west']);
  // the upper floor over the north half, reached by a flight along the east wall
  b.fill(1, 4, 1, 9, 4, 3, slab('deepslate_tile', true));
  for (let i = 0; i < 4; i++) b.set(9, 1 + i, 7 - i, stair('deepslate_tile', 'north'));
  b.set(9, 4, 4, slab('deepslate_tile', true));
  b.fill(1, 5, 4, 8, 5, 4, BRICK_WALL);
  b.chest(2, 1, 7, 'north', CITY);
  b.chest(5, 5, 1, 'south', CITY);
  b.set(2, 5, 2, 'sculk_sensor');
  candles(b, r, 7, 5, 2);
  candles(b, r, 1, 1, 1);
  hangingLantern(b, 5, 8, 6, 2);
  return b.build(id);
}

/** vanilla ancient_city/structures/chamber_3: a chamber over a cellar, the cellar's chest reached down a stair */
function chamber3(): CityTemplate {
  const id = 'ancient_city/structures/chamber_3';
  const r = templateRandom(id);
  const b = building(9, 8, 11);
  b.fill(0, 1, 0, 8, 7, 10, 'air');
  room(b, r, 0, 0, 8, 10, 5, ['south', 'north']);
  // a raised dais at the back with a shrieker's alcove, candles about it
  b.fill(1, 1, 1, 7, 1, 3, BRICKS);
  b.fill(2, 2, 1, 6, 2, 1, CHISELED);
  b.chest(4, 2, 2, 'south', CITY);
  for (const x of [1, 7]) b.set(x, 2, 3, 'candle[candles=4,lit=false]');
  b.fill(2, 1, 5, 6, 1, 8, GRAY_CARPET);
  hangingLantern(b, 2, 5, 5, 2);
  hangingLantern(b, 6, 5, 5, 2);
  skull(b, r, 1, 1, 9);
  return b.build(id);
}

/** vanilla ancient_city/structures/sauna_1: a warm room round a soul campfire, benches along its walls */
function sauna(): CityTemplate {
  const id = 'ancient_city/structures/sauna_1';
  const r = templateRandom(id);
  const b = building(13, 8, 11, SMOOTH_BASALT);
  b.fill(0, 1, 0, 12, 7, 10, 'air');
  room(b, r, 0, 0, 12, 10, 5, ['south']);
  b.fill(1, 0, 1, 11, 0, 9, SMOOTH_BASALT);
  b.fill(5, 0, 4, 7, 0, 6, BASALT);
  b.set(6, 1, 5, 'soul_campfire[lit=true,facing=south]');
  for (let x = 2; x <= 10; x++) {
    b.set(x, 1, 1, stair('polished_deepslate', 'north'));
    if (x < 5 || x > 7) b.set(x, 1, 9, stair('polished_deepslate', 'south'));
  }
  for (let z = 3; z <= 7; z++) {
    b.set(1, 1, z, stair('polished_deepslate', 'west'));
    b.set(11, 1, z, stair('polished_deepslate', 'east'));
  }
  b.fill(4, 6, 4, 8, 6, 6, 'air');
  b.set(6, 6, 5, TILE_WALL);
  candles(b, r, 1, 1, 1);
  candles(b, r, 11, 1, 9);
  return b.build(id);
}

/** vanilla ancient_city/structures/small_statue: a figure of deepslate on a plinth */
function smallStatue(): CityTemplate {
  const id = 'ancient_city/structures/small_statue';
  const r = templateRandom(id);
  const b = building(5, 11, 5, POLISHED);
  b.fill(0, 1, 0, 4, 10, 4, 'air');
  b.fill(0, 0, 0, 4, 1, 4, POLISHED).fill(1, 2, 1, 3, 2, 3, CHISELED);
  // legs, body, shoulders, head and its horns
  b.set(1, 3, 2, TILES).set(3, 3, 2, TILES).set(1, 4, 2, TILES).set(3, 4, 2, TILES);
  b.fill(1, 5, 2, 3, 7, 2, BRICKS).set(2, 6, 1, CHISELED);
  b.set(0, 7, 2, stair('deepslate_brick', 'east', true)).set(4, 7, 2, stair('deepslate_brick', 'west', true));
  b.set(0, 6, 2, BRICK_WALL).set(4, 6, 2, BRICK_WALL);
  b.fill(1, 8, 1, 3, 9, 3, TILES).set(2, 8, 1, 'sculk');
  b.set(0, 10, 2, stair('deepslate_tile', 'east')).set(4, 10, 2, stair('deepslate_tile', 'west'));
  candles(b, r, 0, 2, 0);
  candles(b, r, 4, 2, 4);
  return b.build(id);
}

/** vanilla ancient_city/structures/large_ruin_1: the walls of a great hall fallen in, a chest in the rubble */
function largeRuin(): CityTemplate {
  const id = 'ancient_city/structures/large_ruin_1';
  const r = templateRandom(id);
  const b = building(15, 10, 15);
  b.fill(0, 1, 0, 14, 9, 14, 'air');
  room(b, r, 0, 0, 14, 14, 8, ['south', 'east'], false);
  for (const [x, z] of [[4, 4], [10, 4], [4, 10], [10, 10]]) b.fill(x, 1, z, x, 8, z, 'basalt[axis=y]');
  ruin(b, r, (x, y) => (y > 3 ? 0.15 + y * 0.06 : 0.05) * (x > 7 ? 1.5 : 1));
  b.chest(2, 1, 12, 'north', CITY);
  hangingLantern(b, 7, 7, 7, 3);
  b.set(7, 8, 7, TILES);
  return b.build(id);
}

/** vanilla ancient_city/structures/tall_ruin_1..4: ruined towers, stairs round the inside up to a chest at the top */
function tallRuin(n: 1 | 2 | 3 | 4): CityTemplate {
  const id = `ancient_city/structures/tall_ruin_${n}`;
  const r = templateRandom(id);
  const w = n % 2 === 1 ? 7 : 9, h = [16, 20, 14, 18][n - 1];
  const b = building(w, h + 2, w);
  b.fill(0, 1, 0, w - 1, h + 1, w - 1, 'air');
  room(b, r, 0, 0, w - 1, w - 1, h, [SIDES[n - 1]], false);
  // stairs spiralling up the inside walls
  const ring: [number, number, Side][] = [];
  for (let x = 1; x < w - 1; x++) ring.push([x, 1, 'east']);
  for (let z = 1; z < w - 1; z++) ring.push([w - 2, z, 'south']);
  for (let x = w - 2; x >= 1; x--) ring.push([x, w - 2, 'west']);
  for (let z = w - 2; z >= 1; z--) ring.push([1, z, 'north']);
  let y = 1;
  for (let i = 0; y < h - 1; i++) {
    const [x, z, f] = ring[i % ring.length];
    b.set(x, y, z, stair('deepslate_brick', f));
    if (y > 1) b.set(x, y - 1, z, BRICKS);
    y++;
  }
  // the top: a floor of slabs with a chest on it
  b.fill(1, h - 1, 1, w - 2, h - 1, w - 2, slab('deepslate_tile', true));
  b.set((w >> 1), h, (w >> 1), 'air').chest(w >> 1, h, w >> 1, 'south', CITY);
  ruin(b, r, (_x, yy) => (yy > h - 4 ? 0.35 : yy > h / 2 ? 0.08 : 0.02));
  if (n === 2 || n === 4) hangingLantern(b, w >> 1, h - 2, w >> 1, 2);
  return b.build(id);
}

/** vanilla ancient_city/structures/camp_1..3 (one list): a camp round a dead fire, a tent, a chest */
function camp(n: 1 | 2 | 3): CityTemplate {
  const id = `ancient_city/structures/camp_${n}`;
  const r = templateRandom(id);
  const b = n === 1 ? building(11, 6, 11, COBBLED) : new CityBuilder(11, 6, 11);
  if (n === 1) {
    b.fill(0, 1, 0, 10, 5, 10, 'air');
    for (let z = 1; z <= 9; z++)
      for (let x = 1; x <= 9; x++) if ((x - 5) ** 2 + (z - 5) ** 2 <= 16) b.set(x, 0, z, pick(r, [[COBBLED, 3], [TILES, 2], ['gravel', 1]]));
    b.set(5, 1, 5, 'soul_campfire[lit=false,facing=north]');
    for (const [x, z, f] of [[5, 2, 'north'], [5, 8, 'south'], [2, 5, 'west'], [8, 5, 'east']] as [number, number, Side][]) b.set(x, 1, z, stair('dark_oak', f));
  } else if (n === 2) {
    // the tent: dark oak poles and a gray wool roof over a bedroll
    for (const [x, z] of [[1, 7], [4, 7], [1, 10], [4, 10]]) b.fill(x, 1, z, x, 2, z, 'dark_oak_fence');
    b.fill(1, 3, 7, 4, 3, 10, GRAY_WOOL);
    b.fill(2, 4, 7, 3, 4, 10, GRAY_WOOL);
    b.fill(2, 1, 8, 3, 1, 9, GRAY_CARPET);
  } else {
    // the supplies: a chest among barrels and candles
    b.chest(8, 1, 1, 'west', CITY);
    b.set(9, 1, 1, 'barrel[facing=up]').set(9, 1, 2, 'barrel[facing=north]').set(9, 2, 1, 'barrel[facing=up]');
    candles(b, r, 8, 1, 3);
    skull(b, r, 1, 1, 1);
  }
  return b.build(id);
}

/** vanilla ancient_city/structures/medium_ruin_1..2: a house half fallen down */
function mediumRuin(n: 1 | 2): CityTemplate {
  const id = `ancient_city/structures/medium_ruin_${n}`;
  const r = templateRandom(id);
  const b = building(11, 8, 11);
  b.fill(0, 1, 0, 10, 7, 10, 'air');
  room(b, r, 0, 0, 10, 10, 6, n === 1 ? ['south'] : ['west', 'east'], n === 2);
  ruin(b, r, (x, y, z) => (n === 1 ? (x + z > 12 ? 0.5 : 0.08) : y > 4 ? 0.4 : 0.06));
  if (n === 1) b.chest(2, 1, 2, 'south', CITY);
  else candles(b, r, 5, 1, 5);
  return b.build(id);
}

/** vanilla ancient_city/structures/small_ruin_1..2: a corner of walls left standing */
function smallRuin(n: 1 | 2): CityTemplate {
  const id = `ancient_city/structures/small_ruin_${n}`;
  const r = templateRandom(id);
  const b = building(7, 6, 7);
  b.fill(0, 0, 0, 6, 0, 6, TILES);
  for (let y = 1; y <= 5; y++) {
    for (let x = 0; x < 7; x++) if (r.nextFloat() < 1 - y * 0.12) b.set(x, y, 0, wallBlock(r));
    for (let z = 1; z < 7; z++) if (r.nextFloat() < 1 - y * 0.14) b.set(n === 1 ? 0 : 6, y, z, wallBlock(r));
  }
  candles(b, r, 3, 1, 3);
  if (n === 2) skull(b, r, 2, 1, 2);
  return b.build(id);
}

/** vanilla ancient_city/structures/large_pillar_1 and medium_pillar_1: pillars rising toward the cave's roof */
function pillar(large: boolean): CityTemplate {
  const id = `ancient_city/structures/${large ? 'large' : 'medium'}_pillar_1`;
  const r = templateRandom(id);
  const w = large ? 7 : 5, h = large ? 24 : 16;
  const b = building(w, h, w, POLISHED);
  const c = w >> 1;
  b.fill(0, 0, 0, w - 1, 1, w - 1, POLISHED);
  for (let y = 2; y < h; y++)
    for (let z = 1; z < w - 1; z++)
      for (let x = 1; x < w - 1; x++) {
        const core = Math.abs(x - c) <= (large ? 1 : 0) && Math.abs(z - c) <= (large ? 1 : 0);
        b.set(x, y, z, core ? 'basalt[axis=y]' : y % 6 === 0 ? CHISELED : y % 6 === 3 ? TILES : wallBlock(r));
      }
  // its foot's stairs
  for (let t = 1; t < w - 1; t++) {
    b.set(t, 2, 0, stair('deepslate_brick', 'south')).set(t, 2, w - 1, stair('deepslate_brick', 'north'));
    b.set(0, 2, t, stair('deepslate_brick', 'east')).set(w - 1, 2, t, stair('deepslate_brick', 'west'));
  }
  hangingLantern(b, 0, h - 5, c, 2);
  b.set(0, h - 4, c, slab('deepslate_tile', true));
  return b.build(id);
}

/** vanilla ancient_city/structures/ice_box_1: a little store kept cold with packed ice, its chest inside */
function iceBox(): CityTemplate {
  const id = 'ancient_city/structures/ice_box_1';
  const r = templateRandom(id);
  const b = building(7, 7, 7);
  b.fill(0, 1, 0, 6, 6, 6, 'air');
  room(b, r, 0, 0, 6, 6, 4, ['south']);
  b.fill(1, 1, 1, 5, 1, 3, 'packed_ice');
  b.fill(1, 2, 1, 5, 2, 1, 'packed_ice');
  b.set(1, 2, 2, 'packed_ice').set(5, 2, 2, 'packed_ice').set(3, 2, 2, 'snow_block');
  b.set(3, 1, 2, 'air').chest(3, 1, 2, 'south', ICE_BOX);
  b.set(3, 3, 1, 'packed_ice');
  hangingLantern(b, 3, 4, 4, 1);
  return b.build(id);
}

// ---------------------------------------------------------------------------------------------------------------
// ancient_city/walls

type WallShape = 'straight' | 'corner' | 'intersection' | 'lshape';

/**
 * a wall of the city (on its plots): arms of wall three thick and eleven high from the middle, capped with tiles;
 * `stairs`: a flight up its side to the top; `passage`: an arch through it; `ruined`: fallen in from above
 */
function wall(name: string, shape: WallShape, len: number, opts: { passage?: boolean; stairs?: boolean; ruined?: number } = {}): CityTemplate {
  const id = `ancient_city/walls/${name}`;
  const r = templateRandom(id);
  const size = len;
  const sz = shape === 'straight' ? (opts.stairs ? 9 : 3) : size;
  const b = new CityBuilder(size, 12, sz);
  const cx = size >> 1, cz = sz >> 1, mz = cz;
  b.jigsaw(cx, 0, cz, { facing: 'down', name: 'minecraft:bottom', final: TILES });
  const arm = (x0: number, z0: number, x1: number, z1: number) => {
    for (let y = 0; y <= 10; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) b.set(x, y, z, y === 10 ? TILES : y === 4 || y === 8 ? TILES : wallBlock(r));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if ((x + z) % 2 === 0) b.set(x, 11, z, TILE_WALL);
  };
  if (shape === 'straight') arm(0, mz - 1, size - 1, mz + 1);
  if (shape === 'corner' || shape === 'lshape') {
    arm(cx - 1, cz - 1, size - 1, cz + 1);
    arm(cx - 1, shape === 'lshape' ? 0 : cz - 1, cx + 1, sz - 1);
  }
  if (shape === 'intersection') {
    arm(0, cz - 1, size - 1, cz + 1);
    arm(cx - 1, 0, cx + 1, sz - 1);
  }
  if (opts.passage)
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = 1; y <= (Math.abs(x - cx) === 2 ? 4 : 5); y++) b.fill(x, y, mz - 1, x, y, mz + 1, 'air');
  if (opts.stairs) {
    // a flight up the south face, landing on the top
    for (let i = 0; i < 9; i++) {
      const x = 2 + i, y = 1 + i;
      if (x >= size - 1) break;
      b.set(x, y, mz + 2, stair('deepslate_brick', 'east'));
      b.fill(x, 0, mz + 2, x, y - 1, mz + 2, BRICKS);
    }
  }
  if (opts.ruined) {
    const k = opts.ruined;
    ruin(b, r, (x, y) => (y >= 10 - (x * k) % 5 ? 0.6 : y > 6 ? 0.12 * k : 0.03));
  }
  // lanterns hung from brackets on its faces
  if (shape === 'straight' && !opts.ruined) for (const z of [mz - 2, mz + 2]) if (b.get(cx + 3, 8, z) === 0 || b.name(cx + 3, 8, z) === '') {
    b.set(cx + 3, 8, z, slab('deepslate_tile', true));
    b.set(cx + 3, 7, z, 'soul_lantern[hanging=true]');
  }
  return b.build(id);
}

// ---------------------------------------------------------------------------------------------------------------
// ancient_city/city/entrance

/** a stretch of the entrance tunnel: nine wide and nine high, floored with tiles, arches every four blocks */
function tunnel(b: CityBuilder, r: Rand, x0: number, z0: number, x1: number, z1: number, y0: number, alongZ: boolean): void {
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const t = alongZ ? z - z0 : x - x0, s = alongZ ? x - x0 : z - z0, w = alongZ ? x1 - x0 : z1 - z0;
      const edge = s === 0 || s === w;
      const arch = t % 4 === 0;
      b.set(x, y0, z, edge ? POLISHED : streetBlock(r));
      for (let y = y0 + 1; y <= y0 + 9; y++) {
        const wallish = edge || (arch && (s === 1 || s === w - 1) && y <= y0 + 7) || (arch && y === y0 + 9);
        b.set(x, y, z, wallish ? (arch && edge ? 'basalt[axis=y]' : wallBlock(r)) : 'air');
      }
      if (arch && !edge && y0 + 9 < b.sy) b.set(x, y0 + 9, z, s === w >> 1 ? CHISELED : TILES);
    }
}

/** vanilla ancient_city/city/entrance/entrance_connector: the vestibule behind the gate */
function entranceConnector(): CityTemplate {
  const id = 'ancient_city/city/entrance/entrance_connector';
  const r = templateRandom(id);
  const b = new CityBuilder(11, 12, 9);
  b.fill(0, 1, 0, 10, 11, 8, 'air');
  tunnel(b, r, 0, 0, 10, 8, 0, true);
  for (const x of [1, 9]) b.fill(x, 1, 4, x, 7, 4, 'basalt[axis=y]');
  hangingLantern(b, 5, 8, 4, 2);
  b.jigsaw(5, 1, 0, { facing: 'north', name: 'minecraft:entrance_connector' });
  b.jigsaw(5, 1, 8, { facing: 'south', target: 'minecraft:entrance_path', pool: 'ancient_city/city/entrance' });
  return b.build(id);
}

/** vanilla ancient_city/city/entrance/entrance_path_1..5: the tunnel's stretches: straight, climbing, turning, and one that ends */
function entrancePath(n: 1 | 2 | 3 | 4 | 5): CityTemplate {
  const id = `ancient_city/city/entrance/entrance_path_${n}`;
  const r = templateRandom(id);
  if (n === 3 || n === 4) {
    // a turn: in from the north, out to the west (3) or the east (4)
    const b = new CityBuilder(11, 11, 11);
    b.fill(0, 1, 0, 10, 10, 10, 'air');
    tunnel(b, r, 1, 0, 9, 10, 0, true);
    const west = n === 3;
    for (let z = 1; z <= 9; z++) for (let y = 1; y <= 8; y++) b.set(west ? 1 : 9, y, z, 'air');
    tunnel(b, r, west ? 0 : 1, 1, west ? 9 : 10, 9, 0, false);
    for (let x = 1; x <= 9; x++) for (let y = 1; y <= 9; y++) b.set(x, y, 10, y === 9 ? TILES : wallBlock(r));
    hangingLantern(b, 5, 8, 5, 2);
    b.jigsaw(5, 1, 0, { facing: 'north', name: 'minecraft:entrance_path' });
    b.jigsaw(west ? 0 : 10, 1, 5, { facing: west ? 'west' : 'east', target: 'minecraft:entrance_path', pool: 'ancient_city/city/entrance' });
    return b.build(id);
  }
  const b = new CityBuilder(9, n === 2 ? 20 : 11, 16);
  b.fill(0, 1, 0, 8, b.sy - 1, 15, 'air');
  if (n === 2) {
    // climbing: up half a block a block, eight in all
    for (let z = 0; z < 16; z++) {
      const y0 = Math.floor(z / 2);
      for (let x = 0; x < 9; x++) {
        const edge = x === 0 || x === 8;
        b.fill(x, 0, z, x, y0, z, edge ? POLISHED : BRICKS);
        if (!edge) b.set(x, y0 + 1, z, z % 2 === 1 ? stair('deepslate_tile', 'south') : 'air');
        for (let y = y0 + 1; y <= y0 + 10 && y < b.sy; y++) if (edge) b.set(x, y, z, wallBlock(r));
      }
    }
    b.jigsaw(4, 1, 0, { facing: 'north', name: 'minecraft:entrance_path' });
    b.jigsaw(4, 9, 15, { facing: 'south', target: 'minecraft:entrance_path', pool: 'ancient_city/city/entrance' });
    return b.build(id);
  }
  tunnel(b, r, 0, 0, 8, 15, 0, true);
  hangingLantern(b, 4, 8, 6, 2);
  b.jigsaw(4, 1, 0, { facing: 'north', name: 'minecraft:entrance_path' });
  if (n === 5) {
    // fallen in at its far end
    for (let z = 11; z <= 15; z++) for (let x = 1; x <= 7; x++) for (let y = 1; y <= Math.min(9, (z - 10) * 2); y++) b.set(x, y, z, pick(r, [[COBBLED, 3], ['deepslate[axis=y]', 2], [TILES, 1]]));
    skull(b, r, 3, 1, 9);
  } else b.jigsaw(4, 1, 15, { facing: 'south', target: 'minecraft:entrance_path', pool: 'ancient_city/city/entrance' });
  return b.build(id);
}

// ---------------------------------------------------------------------------------------------------------------
// The pools

let registered = false;

/** vanilla AncientCityStructurePieces.bootstrap and AncientCityStructurePools.bootstrap */
export function registerCityPools(): void {
  if (registered) return;
  registered = true;
  const gen = (t: CityTemplate) => new CityElement(t, 'generic');
  const walls = (t: CityTemplate) => new CityElement(t, 'walls');
  const [c1, c2, c3] = centerTemplates();
  pool('ancient_city/city_center', 'empty', [[new CityElement(c1, 'start'), 1], [new CityElement(c2, 'start'), 1], [new CityElement(c3, 'start'), 1]]);
  pool('ancient_city/city_center/walls', 'empty', quarterTemplates().map((t) => [walls(t), 1]));
  pool('ancient_city/structures', 'empty', [
    [EMPTY, 7], [gen(barracks()), 4], [gen(chamber1()), 4], [gen(chamber2()), 4], [gen(chamber3()), 3], [gen(sauna()), 4], [gen(smallStatue()), 4],
    [gen(largeRuin()), 1], [gen(tallRuin(1)), 1], [gen(tallRuin(2)), 1], [gen(tallRuin(3)), 2], [gen(tallRuin(4)), 2],
    [new CityListElement([gen(camp(1)), gen(camp(2)), gen(camp(3))]), 1],
    [gen(mediumRuin(1)), 1], [gen(mediumRuin(2)), 1], [gen(smallRuin(1)), 1], [gen(smallRuin(2)), 1],
    [gen(pillar(true)), 1], [gen(pillar(false)), 1],
    [new CityListElement([gen(iceBox())]), 1],
  ]);
  pool('ancient_city/sculk', 'empty', [[new CitySculkElement(), 6], [EMPTY, 1]]);
  const straight1 = walls(wall('intact_horizontal_wall_1', 'straight', 15));
  const straight2 = walls(wall('intact_horizontal_wall_2', 'straight', 13));
  const passage = walls(wall('intact_horizontal_wall_passage_1', 'straight', 15, { passage: true }));
  const stairs = [1, 2, 3, 4].map((n) => walls(wall(`ruined_horizontal_wall_stairs_${n}`, 'straight', 11 + n * 2, { stairs: true, ruined: n })));
  pool('ancient_city/walls', 'empty', [
    [walls(wall('intact_corner_wall_1', 'corner', 11)), 1], [walls(wall('intact_intersection_wall_1', 'intersection', 13)), 1],
    [walls(wall('intact_lshape_wall_1', 'lshape', 13)), 1], [straight1, 1], [straight2, 1], [passage, 1],
    [walls(wall('ruined_corner_wall_1', 'corner', 11, { ruined: 2 })), 1], [walls(wall('ruined_corner_wall_2', 'corner', 13, { ruined: 3 })), 1],
    [stairs[0], 2], [stairs[1], 2], [stairs[2], 3], [stairs[3], 3],
  ]);
  pool('ancient_city/walls/no_corners', 'empty', [[straight1, 1], [straight2, 1], [passage, 1], [stairs[0], 1], [stairs[1], 1], [stairs[2], 1], [stairs[3], 1]]);
  pool('ancient_city/city/entrance', 'empty', [
    [gen(entranceConnector()), 1], ...([1, 2, 3, 4, 5] as const).map((n) => [gen(entrancePath(n)), 1] as [CityElement, number]),
  ]);
}
