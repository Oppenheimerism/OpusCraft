// Vanilla FireBlock: the flammability table (FireBlock.bootStrap), the state
// fire takes at a position (floor fire, or clinging to burnable neighbours),
// survival, and the scheduled tick that ages, spreads and burns out fire.
// Lava's random tick (LavaFluid.randomTick) lights fires too.

import { BLOCKS, BLOCK_BY_NAME, STATE_BLOCK, FLAGS, FACE_OCC, F_AIR, F_WATERLOGGED, F_COLLIDE, Block } from '../world/block';
import { UP } from '../world/dir';
import type { World } from '../world/world';
import type { Level } from './level';
import { BIOMES } from '../world/gen/biomes';
import { PrimedTnt } from '../entity/tnt';
import { fireCouldOpenPortal, tryLightPortal } from './portal';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

let IGNITE: Uint8Array | null = null;
let BURN: Uint8Array | null = null;

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'cherry', 'dark_oak', 'pale_oak', 'mangrove'];
const FLOWERS = ['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'torchflower', 'pitcher_plant', 'wither_rose', 'pink_petals'];
const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];

/** vanilla FireBlock.bootStrap: setFlammable(block, igniteOdds, burnOdds) */
function tables(): void {
  IGNITE = new Uint8Array(BLOCKS.length);
  BURN = new Uint8Array(BLOCKS.length);
  const set = (name: string, ignite: number, burn: number) => {
    const b = BLOCK_BY_NAME.get(name);
    if (!b) return;
    IGNITE![b.id] = ignite;
    BURN![b.id] = burn;
  };
  for (const w of [...WOODS, 'bamboo']) {
    set(`${w}_planks`, 5, 20);
    set(`${w}_slab`, 5, 20);
    set(`${w}_fence_gate`, 5, 20);
    set(`${w}_fence`, 5, 20);
    set(`${w}_stairs`, 5, 20);
  }
  for (const n of ['bamboo_mosaic', 'bamboo_mosaic_slab', 'bamboo_mosaic_stairs', 'mangrove_roots']) set(n, 5, 20);
  for (const w of WOODS) {
    set(`${w}_log`, 5, 5);
    set(`stripped_${w}_log`, 5, 5);
    set(`${w}_wood`, 5, 5);
    set(`stripped_${w}_wood`, 5, 5);
    set(`${w}_leaves`, 30, 60);
  }
  set('bamboo_block', 5, 5);
  set('stripped_bamboo_block', 5, 5);
  set('azalea_leaves', 30, 60);
  set('flowering_azalea_leaves', 30, 60);
  set('bookshelf', 30, 20);
  set('chiseled_bookshelf', 30, 20);
  set('tnt', 15, 100);
  for (const n of ['short_grass', 'fern', 'dead_bush', 'sunflower', 'lilac', 'rose_bush', 'peony', 'tall_grass', 'large_fern', ...FLOWERS]) set(n, 60, 100);
  for (const c of COLORS) {
    set(`${c}_wool`, 30, 60);
    set(`${c}_carpet`, 60, 20);
  }
  set('vine', 15, 100);
  set('coal_block', 5, 5);
  set('hay_block', 60, 20);
  set('target', 15, 20);
  set('dried_kelp_block', 30, 60);
  set('bamboo', 60, 60);
  set('scaffolding', 60, 60);
  set('lectern', 30, 20);
  set('composter', 5, 20);
  set('sweet_berry_bush', 60, 100);
  set('beehive', 5, 20);
  set('bee_nest', 30, 20);
  set('cave_vines', 15, 60);
  set('cave_vines_plant', 15, 60);
  set('spore_blossom', 60, 100);
  set('azalea', 30, 60);
  set('flowering_azalea', 30, 60);
  set('big_dripleaf', 60, 100);
  set('big_dripleaf_stem', 60, 100);
  set('small_dripleaf', 60, 100);
  set('hanging_roots', 30, 60);
  set('moss_block', 5, 100);
  set('moss_carpet', 5, 100);
  set('glow_lichen', 15, 100);
}

/** vanilla FireBlock.getIgniteOdds(BlockState): waterlogged blocks never catch */
export function igniteOdds(st: number): number {
  if (!IGNITE) tables();
  return FLAGS[st] & F_WATERLOGGED ? 0 : IGNITE![STATE_BLOCK[st]];
}

export function burnOdds(st: number): number {
  if (!BURN) tables();
  return FLAGS[st] & F_WATERLOGGED ? 0 : BURN![STATE_BLOCK[st]];
}

/** vanilla FireBlock.canBurn */
export function canBurn(st: number): boolean {
  return igniteOdds(st) > 0;
}

const sturdyTop = (st: number): boolean => ((FACE_OCC[st] >> UP) & 1) === 1;

const SIDES: [string, number, number, number][] = [
  ['north', 0, 0, -1],
  ['east', 1, 0, 0],
  ['south', 0, 0, 1],
  ['west', -1, 0, 0],
  ['up', 0, 1, 0],
];
const ALL6: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

let FIRE: Block | null = null;
function fireBlock(): Block {
  return (FIRE ??= BLOCK_BY_NAME.get('fire')!);
}

/** vanilla SoulFireBlock.canSurviveOnBlock: #soul_fire_base_blocks */
export function isSoulFireBase(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return n === 'soul_sand' || n === 'soul_soil';
}

/**
 * vanilla BaseFireBlock.getState / FireBlock.getStateWithAge: soul fire over soul sand and soul soil; else floor
 * fire, or sides that touch something burnable
 */
export function fireStateAt(world: World, x: number, y: number, z: number, age = 0): number {
  const below = world.getState(x, y - 1, z);
  if (isSoulFireBase(below)) return BLOCK_BY_NAME.get('soul_fire')!.defaultState;
  const fire = fireBlock();
  let st = fire.with(fire.defaultState, 'age', age);
  if (!canBurn(below) && !sturdyTop(below)) {
    for (const [p, dx, dy, dz] of SIDES) st = fire.with(st, p, canBurn(world.getState(x + dx, y + dy, z + dz)));
  }
  return st;
}

/** vanilla FireBlock.isValidFireLocation: next to anything burnable */
function validLocation(world: World, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of ALL6) if (canBurn(world.getState(x + dx, y + dy, z + dz))) return true;
  return false;
}

/** vanilla FireBlock.canSurvive */
export function fireCanSurvive(world: World, x: number, y: number, z: number): boolean {
  return sturdyTop(world.getState(x, y - 1, z)) || validLocation(world, x, y, z);
}

/**
 * vanilla BaseFireBlock.canBePlacedAt (flint and steel, fire charges, lava): somewhere fire survives, or
 * (lit by a player facing `facing`) inside an empty obsidian frame
 */
export function canPlaceFire(world: World, x: number, y: number, z: number, facing?: string): boolean {
  if (!(FLAGS[world.getState(x, y, z)] & F_AIR)) return false;
  if (isSoulFireBase(world.getState(x, y - 1, z))) return true;
  return fireCanSurvive(world, x, y, z) || (facing !== undefined && fireCouldOpenPortal(world, world.dim, x, y, z, facing, Math.random));
}

/** set a fire block and schedule its first tick (vanilla BaseFireBlock/FireBlock.onPlace: in a frame it opens a portal) */
export function placeFire(level: Level, x: number, y: number, z: number, st: number): void {
  level.setBlock(x, y, z, st);
  if (tryLightPortal(level.world, level.world.dim, x, y, z)) return;
  level.scheduleTick(x, y, z, fireTickDelay(level));
}

function fireTickDelay(level: Level): number {
  return 30 + level.random.nextInt(10);
}

function isNearRain(level: Level, x: number, y: number, z: number): boolean {
  return level.isRainingAt(x, y, z) || level.isRainingAt(x - 1, y, z) || level.isRainingAt(x + 1, y, z) || level.isRainingAt(x, y, z - 1) || level.isRainingAt(x, y, z + 1);
}

/** vanilla BiomeTags.INCREASED_FIRE_BURNOUT */
const FAST_BURNOUT = new Set(['bamboo_jungle', 'mushroom_fields', 'mangrove_swamp', 'snowy_slopes', 'frozen_peaks', 'jagged_peaks', 'swamp', 'jungle']);

const DIFFICULTY_ID = { peaceful: 0, easy: 1, normal: 2, hard: 3 };

/** vanilla FireBlock.getIgniteOdds(level, pos): how readily an empty spot next to fuel catches */
function igniteOddsAt(world: World, x: number, y: number, z: number): number {
  if (!(FLAGS[world.getState(x, y, z)] & F_AIR)) return 0;
  let max = 0;
  for (const [dx, dy, dz] of ALL6) max = Math.max(max, igniteOdds(world.getState(x + dx, y + dy, z + dz)));
  return max;
}

/** vanilla FireBlock.checkBurnOut: a neighbour may burn away (and sometimes carry the fire on) */
function checkBurnOut(level: Level, x: number, y: number, z: number, chance: number, age: number): void {
  const r = level.random;
  const st = level.world.getState(x, y, z);
  if (r.nextInt(chance) >= burnOdds(st)) return;
  if (r.nextInt(age + 10) < 5 && !level.isRainingAt(x, y, z)) {
    const na = Math.min(age + (r.nextInt(5) >> 2), 15);
    placeFire(level, x, y, z, fireStateAt(level.world, x, y, z, na));
  } else level.setBlock(x, y, z, 0);
  if (blk(st).name === 'tnt') PrimedTnt.prime(level, x, y, z, null);
}

/** vanilla FireBlock.tick */
export function fireTick(level: Level, x: number, y: number, z: number, st: number): void {
  const w = level.world;
  const r = level.random;
  level.scheduleTick(x, y, z, fireTickDelay(level));
  if (!level.gameRules.doFireTick) return;
  if (!fireCanSurvive(w, x, y, z)) {
    level.setBlock(x, y, z, 0);
    return;
  }
  const fire = blk(st);
  const bn = blk(w.getState(x, y - 1, z)).name;
  const infiniburn = bn === 'netherrack' || bn === 'magma_block';
  const age = fire.get<number>(st, 'age');
  if (!infiniburn && level.isRaining() && isNearRain(level, x, y, z) && r.nextFloat() < 0.2 + age * 0.03) {
    level.setBlock(x, y, z, 0);
    return;
  }
  const na = Math.min(15, age + (r.nextInt(3) >> 1));
  if (na !== age) w.setStateQuiet(x, y, z, fire.with(st, 'age', na));
  if (!infiniburn) {
    if (!validLocation(w, x, y, z)) {
      if (!sturdyTop(w.getState(x, y - 1, z)) || age > 3) level.setBlock(x, y, z, 0);
      return;
    }
    if (age === 15 && r.nextInt(4) === 0 && !canBurn(w.getState(x, y - 1, z))) {
      level.setBlock(x, y, z, 0);
      return;
    }
  }
  const fast = FAST_BURNOUT.has(BIOMES[w.getBiome(x, z)]?.name ?? '');
  const k = fast ? -50 : 0;
  checkBurnOut(level, x + 1, y, z, 300 + k, age);
  checkBurnOut(level, x - 1, y, z, 300 + k, age);
  checkBurnOut(level, x, y - 1, z, 250 + k, age);
  checkBurnOut(level, x, y + 1, z, 250 + k, age);
  checkBurnOut(level, x, y, z - 1, 300 + k, age);
  checkBurnOut(level, x, y, z + 1, 300 + k, age);
  const diff = DIFFICULTY_ID[level.difficulty];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 4; dy++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const chance = dy > 1 ? 100 + (dy - 1) * 100 : 100;
        const mx = x + dx, my = y + dy, mz = z + dz;
        const ig = igniteOddsAt(w, mx, my, mz);
        if (ig <= 0) continue;
        let odds = Math.floor((ig + 40 + diff * 7) / (age + 30));
        if (fast) odds = Math.floor(odds / 2);
        if (odds > 0 && r.nextInt(chance) <= odds && (!level.isRaining() || !isNearRain(level, mx, my, mz))) {
          const a2 = Math.min(15, age + (r.nextInt(5) >> 2));
          placeFire(level, mx, my, mz, fireStateAt(w, mx, my, mz, a2));
        }
      }
}

/** vanilla LiquidBlock/LavaFluid.randomTick: lava sets fire to things above and around it */
export function lavaRandomTick(level: Level, x: number, y: number, z: number): void {
  if (!level.gameRules.doFireTick) return;
  const w = level.world;
  const r = level.random;
  const flammable = (st: number) => !!blk(st).s.flammable && !(FLAGS[st] & F_WATERLOGGED);
  const i = r.nextInt(3);
  if (i > 0) {
    let px = x, py = y, pz = z;
    for (let j = 0; j < i; j++) {
      px += r.nextInt(3) - 1;
      py += 1;
      pz += r.nextInt(3) - 1;
      if (!w.isLoaded(px, pz)) return;
      const st = w.getState(px, py, pz);
      if (FLAGS[st] & F_AIR) {
        for (const [dx, dy, dz] of ALL6) {
          if (flammable(w.getState(px + dx, py + dy, pz + dz))) {
            placeFire(level, px, py, pz, fireStateAt(w, px, py, pz));
            return;
          }
        }
      } else if (blocksMotion(st)) return;
    }
  } else {
    for (let k = 0; k < 3; k++) {
      const px = x + r.nextInt(3) - 1, pz = z + r.nextInt(3) - 1;
      if (!w.isLoaded(px, pz)) return;
      if (FLAGS[w.getState(px, y + 1, pz)] & F_AIR && flammable(w.getState(px, y, pz))) placeFire(level, px, y + 1, pz, fireStateAt(w, px, y + 1, pz));
    }
  }
}

/** vanilla BlockState.blocksMotion: solid, except cobwebs and bamboo shoots */
function blocksMotion(st: number): boolean {
  const n = blk(st).name;
  return (FLAGS[st] & F_COLLIDE) !== 0 && n !== 'cobweb' && n !== 'bamboo_sapling';
}
