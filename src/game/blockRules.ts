// Block behaviour rules: survival (support) checks, placement states, drops,
// mining speed — following vanilla behaviour.

import { BLOCKS, STATE_BLOCK, FLAGS, FACE_OCC, F_AIR, F_OPAQUE, F_WATER, F_LAVA, F_REPLACEABLE, F_LEAVES, F_COLLIDE, getBlock, Block, S } from '../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DY, DZ, dirFromYaw, DIR_NAMES } from '../world/dir';
import { Item, ItemStack, getItem, ITEMS, itemForBlock } from '../item/item';
import type { World } from '../world/world';
import type { Level } from './level';
import { Rand } from '../core/rng';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

function isSturdyFace(st: number, face: number): boolean {
  return ((FACE_OCC[st] >> face) & 1) === 1;
}

/** the four amethyst growth stages (vanilla AmethystClusterBlock) */
export const AMETHYST_BUD = /^(small_amethyst_bud|medium_amethyst_bud|large_amethyst_bud|amethyst_cluster)$/;

const PLANT_SOIL = new Set(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium', 'moss_block', 'farmland', 'mud']);

/** multiface blocks (glow lichen): each face, the neighbour it hangs on and that neighbour's face */
export const MULTIFACE: [string, number, number, number, number][] = [
  ['down', 0, -1, 0, UP], ['up', 0, 1, 0, DOWN], ['north', 0, 0, -1, SOUTH], ['south', 0, 0, 1, NORTH], ['west', -1, 0, 0, EAST], ['east', 1, 0, 0, WEST],
];

/** vanilla MultifaceBlock.canAttachTo: the neighbour's touching face is full */
export function multifaceSupported(world: World, x: number, y: number, z: number, face: string): boolean {
  const m = MULTIFACE.find((f) => f[0] === face)!;
  return isSturdyFace(world.getState(x + m[1], y + m[2], z + m[3]), m[4]);
}

/** Can the block `state` stay at (x,y,z)? */
export function canSurvive(world: World, x: number, y: number, z: number, state: number): boolean {
  const b = blk(state);
  const n = b.name;
  const below = world.getState(x, y - 1, z);
  const bn = blk(below).name;
  if (n.endsWith('_sapling') || n === 'short_grass' || n === 'fern' || /^(dandelion|poppy|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|cornflower|lily_of_the_valley)$/.test(n)) {
    return PLANT_SOIL.has(bn);
  }
  if (n === 'dead_bush') return PLANT_SOIL.has(bn) || bn === 'sand' || bn === 'red_sand' || bn.endsWith('terracotta');
  if (n === 'brown_mushroom' || n === 'red_mushroom') return FLAGS[below] & F_OPAQUE ? true : false;
  if (n === 'sweet_berry_bush') return PLANT_SOIL.has(bn);
  if (n === 'wheat' || n === 'carrots' || n === 'potatoes' || n === 'beetroots' || n.endsWith('_stem')) return bn === 'farmland';
  if (n.endsWith('_door')) {
    if (b.get(state, 'half') === 'upper') return blk(below) === b && blk(below).get(below, 'half') === 'lower';
    return isSturdyFace(below, UP);
  }
  if (n.endsWith('_carpet')) return !(FLAGS[below] & F_AIR);
  if (n === 'glow_lichen') return MULTIFACE.some(([d]) => b.get(state, d) && multifaceSupported(world, x, y, z, d));
  if (AMETHYST_BUD.test(n)) {
    // vanilla AmethystClusterBlock.canSurvive: the block it grows out of has a full face towards it
    const d = DIR_NAMES.indexOf(b.get(state, 'facing') as (typeof DIR_NAMES)[number]);
    return isSturdyFace(world.getState(x - DX[d], y - DY[d], z - DZ[d]), d);
  }
  if (n === 'rail') {
    // vanilla BaseRailBlock.canSurvive + shouldBeRemoved: a rigid block below, and one under the high end of a slope
    if (!isSturdyFace(below, UP)) return false;
    const shape = String(b.get(state, 'shape'));
    const up: Record<string, [number, number]> = { ascending_east: [1, 0], ascending_west: [-1, 0], ascending_north: [0, -1], ascending_south: [0, 1] };
    const hi = up[shape];
    return !hi || isSturdyFace(world.getState(x + hi[0], y, z + hi[1]), UP);
  }
  if (n === 'lantern') {
    if (b.get(state, 'hanging')) {
      const above = world.getState(x, y + 1, z);
      return isSturdyFace(above, DOWN) || blk(above).name === 'chain' || blk(above).name.endsWith('_fence') || blk(above).name.endsWith('_wall');
    }
    return isSturdyFace(below, UP) || /_fence$|_wall$|^chain$/.test(bn);
  }
  if (n.endsWith('_bed')) return true;
  if (n === 'tall_grass' || n === 'large_fern' || n === 'sunflower' || n === 'lilac' || n === 'rose_bush' || n === 'peony' || n === 'tall_seagrass') {
    const half = b.get(state, 'half');
    if (half === 'upper') {
      const lb = blk(below);
      return lb === b && lb.get(below, 'half') === 'lower';
    }
    const above = world.getState(x, y + 1, z);
    const ab = blk(above);
    if (!(ab === b && ab.get(above, 'half') === 'upper')) return false;
    if (n === 'tall_seagrass') return (FLAGS[below] & F_OPAQUE) !== 0;
    return PLANT_SOIL.has(bn);
  }
  if (n === 'sugar_cane') {
    if (bn === 'sugar_cane') return true;
    if (!(PLANT_SOIL.has(bn) || bn === 'sand' || bn === 'red_sand')) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = world.getState(x + dx, y - 1, z + dz);
      if (FLAGS[s] & F_WATER || blk(s).name === 'frosted_ice') return true;
    }
    return false;
  }
  if (n === 'cactus') {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = world.getState(x + dx, y, z + dz);
      if (FLAGS[s] & F_COLLIDE || FLAGS[s] & F_LAVA) return false;
    }
    return bn === 'cactus' || bn === 'sand' || bn === 'red_sand';
  }
  if (n === 'torch') return isSturdyFace(below, UP) || /fence|wall|glass/.test(bn);
  if (n === 'wall_torch') {
    const f = b.get<string>(state, 'facing');
    const d = DIR_NAMES.indexOf(f as (typeof DIR_NAMES)[number]);
    const sx = x - DX[d], sz = z - DZ[d];
    return isSturdyFace(world.getState(sx, y, sz), d);
  }
  if (n === 'ladder') {
    const f = b.get<string>(state, 'facing');
    const d = DIR_NAMES.indexOf(f as (typeof DIR_NAMES)[number]);
    return isSturdyFace(world.getState(x - DX[d], y, z - DZ[d]), d);
  }
  if (n === 'snow') return (isSturdyFace(below, UP) || (bn === 'snow' && blk(below).get(below, 'layers') === 8) || (FLAGS[below] & F_LEAVES) !== 0) && bn !== 'ice' && bn !== 'packed_ice';
  if (n === 'lily_pad') {
    return (blk(below).name === 'water' && blk(below).get(below, 'level') === 0) || bn === 'ice';
  }
  if (n === 'seagrass' || n === 'kelp' || n === 'kelp_plant') return (FLAGS[below] & F_OPAQUE) !== 0 || bn === 'kelp' || bn === 'kelp_plant';
  if (n === 'vine') return true;
  if (n === 'carpet') return !(FLAGS[below] & F_AIR);
  return true;
}

// ---------------------------------------------------------------------------
// Placement

export interface PlaceContext {
  world: World;
  x: number;
  y: number;
  z: number;
  face: number; // clicked face
  hitY: number; // fractional hit y within clicked block
  /** fractional hit x/z within the placement position (door hinges) */
  hitX?: number;
  hitZ?: number;
  yaw: number;
  pitch: number;
  sneaking: boolean;
  clickedState: number;
  /** the clicked block itself is being replaced (or added to) rather than placed against */
  replaceClicked?: boolean;
}

/** vanilla Direction.orderedByNearest: all six directions, nearest to where the player looks first */
export function lookingDirections(yaw: number, pitch: number): number[] {
  const f = (pitch * Math.PI) / 180, f1 = (-yaw * Math.PI) / 180;
  const f2 = Math.sin(f), f3 = Math.cos(f), f4 = Math.sin(f1), f5 = Math.cos(f1);
  const east = f4 > 0, up = f2 < 0, south = f5 > 0;
  const f6 = east ? f4 : -f4, f7 = up ? -f2 : f2, f8 = south ? f5 : -f5;
  const f9 = f6 * f3, f10 = f8 * f3;
  const h = east ? EAST : WEST, v = up ? UP : DOWN, d = south ? SOUTH : NORTH;
  const arr = (a: number, b: number, c: number) => [a, b, c, c ^ 1, b ^ 1, a ^ 1];
  if (f6 > f8) return f7 > f9 ? arr(v, h, d) : f10 > f7 ? arr(h, d, v) : arr(h, v, d);
  return f7 > f10 ? arr(v, d, h) : f9 > f7 ? arr(d, h, v) : arr(d, v, h);
}

/** vanilla Block.onProjectileHit: amethyst (the block and every growth stage) rings when struck */
export function onProjectileHit(level: Level, x: number, y: number, z: number): void {
  const n = blk(level.getState(x, y, z)).name;
  if (n !== 'amethyst_block' && n !== 'budding_amethyst' && !AMETHYST_BUD.test(n)) return;
  level.sound.play('block.amethyst_block.hit', x + 0.5, y + 0.5, z + 0.5, 1, 0.5 + level.random.nextFloat() * 1.2);
  level.sound.play('block.amethyst_block.chime', x + 0.5, y + 0.5, z + 0.5, 1, 0.5 + level.random.nextFloat() * 1.2);
}

/** vanilla MultifaceBlock.hasAnyVacantFace */
export function hasVacantFace(state: number): boolean {
  const b = blk(state);
  return MULTIFACE.some(([d]) => !b.get(state, d));
}

const OPP_NAME = ['up', 'down', 'south', 'north', 'east', 'west'];

export function placementState(block: Block, ctx: PlaceContext): number | null {
  const n = block.name;
  let st = block.defaultState;
  const facingH = DIR_NAMES[dirFromYaw(ctx.yaw)]; // player's horizontal facing
  const oppositeH = OPP_NAME[dirFromYaw(ctx.yaw)];
  if (block.propIndex('axis') >= 0) {
    const axis = ctx.face === DOWN || ctx.face === UP ? 'y' : ctx.face === NORTH || ctx.face === SOUTH ? 'z' : 'x';
    st = block.with(st, 'axis', axis);
  }
  // vanilla MultifaceBlock.getStateForPlacement: the first face, towards the clicked block and then
  // in the order the player looks, that is still free and can hang on its neighbour
  if (n === 'glow_lichen') {
    const cur = ctx.world.getState(ctx.x, ctx.y, ctx.z);
    const base = blk(cur) === block ? cur : blk(cur).name === 'water' && blk(cur).get(cur, 'level') === 0 ? block.with(st, 'waterlogged', true) : st;
    const looking = lookingDirections(ctx.yaw, ctx.pitch);
    const dirs = ctx.replaceClicked ? looking : [ctx.face ^ 1, ...looking.filter((d) => d !== (ctx.face ^ 1))];
    for (const d of dirs) {
      const face = DIR_NAMES[d];
      if (!block.get(base, face) && multifaceSupported(ctx.world, ctx.x, ctx.y, ctx.z, face)) return block.with(base, face, true);
    }
    return null;
  }
  // vanilla BaseRailBlock.getStateForPlacement (connections are made once placed)
  if (n === 'rail') st = block.with(st, 'shape', facingH === 'east' || facingH === 'west' ? 'east_west' : 'north_south');
  if (n.endsWith('_stairs')) {
    st = block.with(st, 'facing', facingH);
    const top = ctx.face === DOWN || (ctx.face !== UP && ctx.hitY > 0.5);
    st = block.with(st, 'half', top ? 'top' : 'bottom');
  } else if (n.endsWith('_slab')) {
    const top = ctx.face === DOWN || (ctx.face !== UP && ctx.hitY > 0.5);
    st = block.with(st, 'type', top ? 'top' : 'bottom');
  } else if (n === 'torch') {
    if (ctx.face === UP) return st;
    if (ctx.face === DOWN) return null;
    const wt = getBlock('wall_torch');
    return wt.state({ facing: DIR_NAMES[ctx.face] });
  } else if (n === 'ladder') {
    if (ctx.face === UP || ctx.face === DOWN) return null;
    st = block.with(st, 'facing', DIR_NAMES[ctx.face]);
  } else if (n.endsWith('_door')) {
    // vanilla DoorBlock.getStateForPlacement: facing = look direction, hinge from neighbours / click
    st = block.with(st, 'facing', facingH);
    st = block.with(st, 'half', 'lower');
    st = block.with(st, 'hinge', doorHinge(ctx, facingH));
  } else if (n.endsWith('_trapdoor')) {
    // vanilla TrapDoorBlock.getStateForPlacement
    if (ctx.face !== UP && ctx.face !== DOWN) {
      st = block.with(st, 'facing', DIR_NAMES[ctx.face]);
      st = block.with(st, 'half', ctx.hitY > 0.5 ? 'top' : 'bottom');
    } else {
      st = block.with(st, 'facing', oppositeH);
      st = block.with(st, 'half', ctx.face === UP ? 'bottom' : 'top');
    }
  } else if (n.endsWith('_fence_gate') || n.endsWith('_bed')) {
    st = block.with(st, 'facing', facingH);
    if (n.endsWith('_bed')) st = block.with(st, 'part', 'foot');
  } else if (n === 'lantern') {
    // vanilla: prefer the vertical direction the player looks toward
    const hanging = ctx.face === DOWN;
    st = block.with(st, 'hanging', hanging);
    if (!canSurvive(ctx.world, ctx.x, ctx.y, ctx.z, st)) st = block.with(st, 'hanging', !hanging);
  } else if (AMETHYST_BUD.test(n)) {
    st = block.with(st, 'facing', DIR_NAMES[ctx.face]);
  } else if (block.propIndex('facing') >= 0) {
    st = block.with(st, 'facing', oppositeH);
  }
  if (block.s.isLeaves) st = block.with(st, 'persistent', true);
  if (block.propIndex('waterlogged') >= 0 && FLAGS[ctx.world.getState(ctx.x, ctx.y, ctx.z)] & F_WATER) {
    const cur = ctx.world.getState(ctx.x, ctx.y, ctx.z);
    if (blk(cur).name === 'water' && blk(cur).get(cur, 'level') === 0) st = block.with(st, 'waterlogged', true);
  }
  return st;
}

/** vanilla DoorBlock.getHinge */
function doorHinge(ctx: PlaceContext, facing: string): 'left' | 'right' {
  const w = ctx.world;
  const ccw: Record<string, [number, number]> = { north: [-1, 0], south: [1, 0], west: [0, 1], east: [0, -1] };
  const [lx, lz] = ccw[facing];
  const full = (xx: number, yy: number, zz: number) => (FLAGS[w.getState(xx, yy, zz)] & F_COLLIDE) !== 0 && (FACE_OCC[w.getState(xx, yy, zz)] & 0b111111) === 0b111111;
  const i = (full(ctx.x + lx, ctx.y, ctx.z + lz) ? -1 : 0) + (full(ctx.x + lx, ctx.y + 1, ctx.z + lz) ? -1 : 0) + (full(ctx.x - lx, ctx.y, ctx.z - lz) ? 1 : 0) + (full(ctx.x - lx, ctx.y + 1, ctx.z - lz) ? 1 : 0);
  const doorAt = (xx: number, zz: number) => {
    const s = w.getState(xx, ctx.y, zz);
    return blk(s).name.endsWith('_door') && blk(s).get(s, 'half') === 'lower';
  };
  const flag = doorAt(ctx.x + lx, ctx.z + lz), flag1 = doorAt(ctx.x - lx, ctx.z - lz);
  if ((flag && !flag1) || i > 0) return 'right';
  if ((flag1 && !flag) || i < 0) return 'left';
  const step: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
  const [j, k] = step[facing];
  const d0 = ctx.hitX ?? 0.5, d1 = ctx.hitZ ?? 0.5;
  return (j >= 0 || !(d1 < 0.5)) && (j <= 0 || !(d1 > 0.5)) && (k >= 0 || !(d0 > 0.5)) && (k <= 0 || !(d0 < 0.5)) ? 'left' : 'right';
}

/** Is the target position replaceable by placing `block`? */
export function canReplace(target: number, block: Block): boolean {
  const f = FLAGS[target];
  if (f & F_AIR) return true;
  if (f & F_REPLACEABLE) {
    const tb = blk(target);
    // (more glow lichen adds a face to the lichen already there)
    if (tb === block) return block.name === 'glow_lichen' && hasVacantFace(target);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mining

export function toolSpeed(item: Item | null, block: Block): number {
  if (!item || !item.tool) return 1;
  const t = item.tool;
  if (t.type === 'sword') {
    if (block.name === 'cobweb') return 15;
    if (block.s.isLeaves || /melon|pumpkin|vine|cocoa/.test(block.name) || block.tool === 'hoe' && block.hardness < 0.3) return 1.5;
    return 1;
  }
  if (t.type === 'shears') {
    if (block.s.isLeaves || block.name === 'cobweb') return 15;
    if (block.name.endsWith('_wool')) return 5;
    if (block.name === 'vine') return 2;
    return 1;
  }
  if (t.type === block.tool) return t.speed;
  return 1;
}

export function isCorrectTool(item: Item | null, block: Block): boolean {
  if (!block.requiresTool) return true;
  if (!item || !item.tool) return false;
  if (block.name === 'cobweb') return item.tool.type === 'sword' || item.tool.type === 'shears';
  if (block.name === 'snow' || block.name === 'snow_block') return item.tool.type === 'shovel';
  return item.tool.type === block.tool && item.tool.tier >= block.tier;
}

/** vanilla getDestroyProgress per tick */
export function destroyProgress(state: number, item: Item | null, underwater: boolean, onGround: boolean): number {
  const b = blk(state);
  const hardness = b.hardness;
  if (hardness < 0) return 0;
  let speed = toolSpeed(item, b);
  if (underwater) speed /= 5;
  if (!onGround) speed /= 5;
  const div = isCorrectTool(item, b) ? 30 : 100;
  if (hardness === 0) return 1;
  return speed / hardness / div;
}

// ---------------------------------------------------------------------------
// Drops (simplified vanilla loot tables)

function stacks(id: string, n: number): ItemStack[] {
  return n > 0 ? [ItemStack.of(id, n)] : [];
}

function fortuneless(r: Rand, min: number, max: number): number {
  return min + r.nextInt(max - min + 1);
}

/**
 * vanilla DropExperienceBlock / RedStoneOreBlock / SpawnerBlock spawnAfterBreak: experience from
 * a block a player broke with a tool that harvests it (silk touch drops none)
 */
export function blockExperience(state: number, tool: Item | null, r: Rand, silk = false): number {
  const b = blk(state);
  if (silk || (b.requiresTool && !isCorrectTool(tool, b))) return 0;
  const uniform = (lo: number, hi: number) => lo + r.nextInt(hi - lo + 1);
  switch (b.name.replace(/^deepslate_/, '')) {
    case 'coal_ore': return uniform(0, 2);
    case 'diamond_ore': case 'emerald_ore': return uniform(3, 7);
    case 'lapis_ore': case 'nether_quartz_ore': return uniform(2, 5);
    case 'nether_gold_ore': return uniform(0, 1);
    case 'redstone_ore': return 1 + r.nextInt(5);
    case 'spawner': return 15 + r.nextInt(15) + r.nextInt(15);
  }
  return 0;
}

export function blockDrops(state: number, tool: Item | null, r: Rand, silk = false): ItemStack[] {
  const b = blk(state);
  const n = b.name;
  if (b.requiresTool && !isCorrectTool(tool, b)) return [];
  const shears = tool?.tool?.type === 'shears';
  if (silk) {
    // (vanilla loot tables that drop nothing even with silk touch)
    if (n === 'budding_amethyst' || n === 'spawner') return [];
    const it = itemForBlock(n);
    return it ? [new ItemStack(it, 1)] : [];
  }
  // (glass and the like drop only with silk touch)
  if (b.s.noDrop) return [];
  switch (n) {
    case 'stone': return stacks('cobblestone', 1);
    case 'deepslate': return stacks('cobbled_deepslate', 1);
    case 'grass_block': case 'mycelium': case 'podzol': case 'dirt_path': case 'farmland': return stacks('dirt', 1);
    case 'coal_ore': case 'deepslate_coal_ore': return stacks('coal', 1);
    case 'iron_ore': case 'deepslate_iron_ore': return stacks('raw_iron', 1);
    case 'copper_ore': case 'deepslate_copper_ore': return stacks('raw_copper', fortuneless(r, 2, 5));
    case 'gold_ore': case 'deepslate_gold_ore': return stacks('raw_gold', 1);
    case 'redstone_ore': case 'deepslate_redstone_ore': return stacks('redstone', fortuneless(r, 4, 5));
    case 'lapis_ore': case 'deepslate_lapis_ore': return stacks('lapis_lazuli', fortuneless(r, 4, 9));
    case 'diamond_ore': case 'deepslate_diamond_ore': return stacks('diamond', 1);
    case 'emerald_ore': case 'deepslate_emerald_ore': return stacks('emerald', 1);
    case 'gravel': return r.nextInt(10) === 0 ? stacks('flint', 1) : stacks('gravel', 1);
    case 'clay': return stacks('clay_ball', 4);
    case 'glowstone': return stacks('glowstone_dust', fortuneless(r, 2, 4));
    case 'melon': return stacks('melon_slice', fortuneless(r, 3, 7));
    case 'bookshelf': return stacks('book', 3);
    case 'snow_block': return stacks('snowball', 4);
    case 'snow': return stacks('snowball', b.get<number>(state, 'layers'));
    case 'glass': case 'ice': case 'powder_snow': case 'spawner': return [];
    case 'short_grass': case 'fern':
      if (shears) return stacks(n, 1);
      return r.nextInt(8) === 0 ? stacks('wheat_seeds', 1) : [];
    case 'tall_grass': case 'large_fern':
      if (shears) return stacks(n === 'tall_grass' ? 'short_grass' : 'fern', 2);
      return b.get(state, 'half') === 'lower' && r.nextInt(8) === 0 ? stacks('wheat_seeds', 1) : [];
    case 'dead_bush': return shears ? stacks('dead_bush', 1) : stacks('stick', r.nextInt(3));
    case 'cobweb': return shears ? stacks('cobweb', 1) : stacks('string', 1);
    case 'vine': case 'seagrass': case 'tall_seagrass': return shears ? stacks(n === 'tall_seagrass' ? 'seagrass' : n, 1) : [];
    // vanilla glow_lichen loot: one per face, shears only
    case 'glow_lichen': return shears ? stacks(n, MULTIFACE.filter(([d]) => b.get(state, d)).length) : [];
    // vanilla amethyst_cluster loot: 4 shards mined with a pickaxe (#cluster_max_harvestables), else 2; buds need silk touch
    case 'amethyst_cluster': return stacks('amethyst_shard', tool?.tool?.type === 'pickaxe' ? 4 : 2);
    case 'small_amethyst_bud': case 'medium_amethyst_bud': case 'large_amethyst_bud': return [];
    case 'wall_torch': return stacks('torch', 1);
    case 'kelp_plant': return stacks('kelp', 1);
    case 'sweet_berry_bush': {
      const age = b.get<number>(state, 'age');
      return age >= 2 ? stacks('sweet_berries', age === 3 ? fortuneless(r, 2, 3) : fortuneless(r, 1, 2)) : [];
    }
    case 'wheat': {
      const age = b.get<number>(state, 'age');
      if (age === 7) return [...stacks('wheat', 1), ...stacks('wheat_seeds', 1 + binom(r, 3, 0.5714286))];
      return stacks('wheat_seeds', 1);
    }
    case 'sunflower': case 'lilac': case 'rose_bush': case 'peony':
      return b.get(state, 'half') === 'lower' ? stacks(n, 1) : [];
    case 'carrots': case 'potatoes': {
      const item = n === 'carrots' ? 'carrot' : 'potato';
      const age = b.get<number>(state, 'age');
      if (age < 7) return stacks(item, 1);
      const out = stacks(item, 1 + binom(r, 3, 0.5714286));
      if (n === 'potatoes' && r.next() < 0.02) out.push(...stacks('poisonous_potato', 1));
      return out;
    }
    case 'beetroots': {
      const age = b.get<number>(state, 'age');
      if (age < 3) return stacks('beetroot_seeds', 1);
      return [...stacks('beetroot', 1), ...stacks('beetroot_seeds', 1 + binom(r, 3, 0.5714286))];
    }
    case 'pumpkin_stem': case 'melon_stem': case 'attached_pumpkin_stem': case 'attached_melon_stem': {
      // vanilla stem loot: seeds, binomial by age (attached = age 7)
      const seeds = n.includes('pumpkin') ? 'pumpkin_seeds' : 'melon_seeds';
      const age = n.startsWith('attached') ? 7 : b.get<number>(state, 'age');
      return stacks(seeds, binom(r, 3, (age + 1) / 15));
    }
    case 'fire': return [];
  }
  if (n.endsWith('_bed')) return b.get(state, 'part') === 'head' ? stacks(n, 1) : [];
  if (b.s.isLeaves) {
    if (shears) return stacks(n, 1);
    const out: ItemStack[] = [];
    const wood = n.replace('_leaves', '');
    const saplingChance = wood === 'jungle' ? 1 / 40 : 1 / 20;
    if (r.next() < saplingChance && ITEMS.has(wood + '_sapling')) out.push(ItemStack.of(wood + '_sapling', 1));
    if (r.next() < 0.02) out.push(ItemStack.of('stick', 1 + r.nextInt(2)));
    if ((wood === 'oak' || wood === 'dark_oak') && r.next() < 0.005) out.push(ItemStack.of('apple', 1));
    return out;
  }
  if (n.endsWith('_slab') && b.get(state, 'type') === 'double') return stacks(n, 2);
  if (b.propIndex('half') >= 0 && b.get(state, 'half') === 'upper' && !n.endsWith('_stairs')) return [];
  const it = itemForBlock(n);
  return it ? [new ItemStack(it, 1)] : [];
}

function binom(r: Rand, n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (r.next() < p) k++;
  return k;
}

export function soundGroupOf(state: number): string {
  return blk(state).sound;
}

export { getItem, S, F_WATER, F_LAVA, DX, DY, DZ };
