// Block behaviour rules: survival (support) checks, placement states, drops,
// mining speed — following vanilla behaviour.

import { BLOCKS, STATE_BLOCK, FLAGS, FACE_OCC, F_AIR, F_OPAQUE, F_WATER, F_LAVA, F_REPLACEABLE, F_LEAVES, F_COLLIDE, getBlock, Block, S } from '../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DY, DZ, dirFromYaw, DIR_NAMES } from '../world/dir';
import { Item, ItemStack, getItem, ITEMS, itemForBlock } from '../item/item';
import type { World } from '../world/world';
import { Rand } from '../core/rng';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

function isSturdyFace(st: number, face: number): boolean {
  return ((FACE_OCC[st] >> face) & 1) === 1;
}

const PLANT_SOIL = new Set(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium', 'moss_block', 'farmland', 'mud']);

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
  if (n === 'wheat') return bn === 'farmland';
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
  yaw: number;
  pitch: number;
  sneaking: boolean;
  clickedState: number;
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

/** Is the target position replaceable by placing `block`? */
export function canReplace(target: number, block: Block): boolean {
  const f = FLAGS[target];
  if (f & F_AIR) return true;
  if (f & F_REPLACEABLE) {
    const tb = blk(target);
    if (tb === block) return false;
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

export function blockDrops(state: number, tool: Item | null, r: Rand, silk = false): ItemStack[] {
  const b = blk(state);
  const n = b.name;
  if (b.s.noDrop) return [];
  if (b.requiresTool && !isCorrectTool(tool, b)) return [];
  const shears = tool?.tool?.type === 'shears';
  if (silk) {
    const it = itemForBlock(n);
    return it ? [new ItemStack(it, 1)] : [];
  }
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
  }
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
