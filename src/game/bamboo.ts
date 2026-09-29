// Bamboo (remaining mobs: the panda): vanilla BambooSaplingBlock and BambooStalkBlock. Bamboo is planted on sand, dirt,
// gravel or more bamboo (vanilla #bamboo_plantable_on), never in water: on the ground it goes in as a shoot, on a
// stalk (or under one) as more stalk. In the light a shoot pushes up a leafy stalk block over itself and becomes stalk,
// and a stalk's top grows a block at a time, one random tick in three, up to 16 tall: its top two blocks carry large
// leaves and the one under them small ones; from the fourth block up it grows thick, and the stalk under it thickens
// with it; from 11 blocks up each new top may be the last (one in four, the 16th always). Bone meal grows one or two
// blocks at once. A stalk or shoot with nothing to stand on breaks (the stalk a tick later, so a felled stalk falls
// block by block from the bottom up), each dropping bamboo. A sword cuts through either at a stroke; pistons break
// them. Its shapes are set off with its model (world/blockOffset.ts), the collision too (a thin post in its middle).

import { registerBehavior } from './blockBehavior';
import { canSurvive } from './blockRules';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_LAVA, getBlock, type Box } from '../world/block';
import { registerDynamicShape } from '../world/dynamicShapes';
import { horizontalOffset } from '../world/blockOffset';
import { BAMBOO_COLLISION_SHAPE, BAMBOO_PLANTABLE_ON } from '../world/blocksBamboo';
import { UP } from '../world/dir';
import type { World } from '../world/world';
import type { Level } from './level';
import { ItemStack, type Item } from '../item/item';

/** vanilla BambooStalkBlock.MAX_HEIGHT */
export const BAMBOO_MAX_HEIGHT = 16;

const BAMBOO = getBlock('bamboo');
const SAPLING = getBlock('bamboo_sapling');

export const isBamboo = (st: number): boolean => STATE_BLOCK[st] === BAMBOO.id;
/** bamboo can be planted on `st` (vanilla #bamboo_plantable_on) */
export const bambooPlantableOn = (st: number): boolean => st >= 0 && BAMBOO_PLANTABLE_ON.has(BLOCKS[STATE_BLOCK[st]].name);
const isAir = (st: number): boolean => (FLAGS[st] & F_AIR) !== 0;

/** vanilla BambooStalkBlock.getHeightAboveUpToMax: the stalk blocks over (x, y, z), up to 16 */
function heightAbove(w: World, x: number, y: number, z: number): number {
  let i = 0;
  while (i < BAMBOO_MAX_HEIGHT && isBamboo(w.getState(x, y + i + 1, z))) i++;
  return i;
}

/** vanilla BambooStalkBlock.getHeightBelowUpToMax: the stalk blocks under (x, y, z), up to 16 */
function heightBelow(w: World, x: number, y: number, z: number): number {
  let i = 0;
  while (i < BAMBOO_MAX_HEIGHT && isBamboo(w.getState(x, y - i - 1, z))) i++;
  return i;
}

/**
 * vanilla BambooStalkBlock.growBamboo: a block onto the stalk whose top (`st`) is at (x, y, z), the stalk `height`
 * blocks tall with it. Its leaves: small over a bare block (or the ground), else large, the large ones below moving
 * down a block to small and the small ones under those falling away. It's thick if the top is, or once the stalk is
 * three blocks tall; and done growing, from 11 up, one time in four (the 16th always)
 */
export function growBamboo(level: Level, x: number, y: number, z: number, st: number, height: number): void {
  const w = level.world;
  const below = w.getState(x, y - 1, z), below2 = w.getState(x, y - 2, z);
  let leaves = 'none';
  if (height >= 1) {
    if (!isBamboo(below) || BAMBOO.get(below, 'leaves') === 'none') leaves = 'small';
    else {
      leaves = 'large';
      if (isBamboo(below2)) {
        level.setBlock(x, y - 1, z, BAMBOO.with(below, 'leaves', 'small'));
        level.setBlock(x, y - 2, z, BAMBOO.with(below2, 'leaves', 'none'));
      }
    }
  }
  const age = BAMBOO.get(st, 'age') !== 1 && !isBamboo(below2) ? 0 : 1;
  // (vanilla draws its float only from 11 up)
  const stage = (height < 11 || !(level.random.nextFloat() < 0.25)) && height !== 15 ? 0 : 1;
  level.setBlock(x, y + 1, z, BAMBOO.state({ age, leaves, stage }));
}

/** vanilla BambooSaplingBlock.growBamboo: a stalk block with small leaves over the shoot (which it turns into stalk) */
function growFromShoot(level: Level, x: number, y: number, z: number): void {
  level.setBlock(x, y + 1, z, BAMBOO.state({ leaves: 'small' }));
}

/** vanilla canSurvive for both: bamboo can be planted on what's under it */
const standsOn = (w: World, x: number, y: number, z: number): boolean => bambooPlantableOn(w.getState(x, y - 1, z));

/** vanilla getDestroyProgress for both: a sword cuts through at a stroke (vanilla `instanceof SwordItem`) */
const swordCuts = (_st: number, item: Item | null): number | undefined => (item?.id.endsWith('_sword') ? 1 : undefined);

registerBehavior('bamboo', {
  /**
   * vanilla BambooStalkBlock.getStateForPlacement: not into water or lava; only on what bamboo is planted on. On a
   * shoot, thin stalk; on a stalk, as thick as that; on the ground, a shoot, unless there's stalk just above to join
   */
  placement(ctx) {
    const w = ctx.world;
    if (FLAGS[w.getState(ctx.x, ctx.y, ctx.z)] & (F_WATER | F_LAVA)) return null;
    const below = w.getState(ctx.x, ctx.y - 1, ctx.z);
    if (!bambooPlantableOn(below)) return null;
    if (STATE_BLOCK[below] === SAPLING.id) return BAMBOO.state({ age: 0 });
    if (isBamboo(below)) return BAMBOO.state({ age: (BAMBOO.get(below, 'age') as number) > 0 ? 1 : 0 });
    const above = w.getState(ctx.x, ctx.y + 1, ctx.z);
    return isBamboo(above) ? BAMBOO.state({ age: BAMBOO.get(above, 'age') }) : SAPLING.defaultState;
  },
  canSurvive: standsOn,
  // vanilla updateShape schedules a tick when it can't stay, and tick breaks it then
  breakDelay: 1,
  tick(level, x, y, z, st) {
    if (!canSurvive(level.world, x, y, z, st)) level.destroyBlock(x, y, z, true);
  },
  /**
   * vanilla updateShape: a thicker stalk block set on top thickens this one (vanilla's cycle(AGE)), and so on down
   * the stalk as each thickens in turn
   */
  shapeUpdate(level, x, y, z, st, dir) {
    if (dir !== UP) return;
    const above = level.world.getState(x, y + 1, z);
    if (isBamboo(above) && (BAMBOO.get(above, 'age') as number) > (BAMBOO.get(st, 'age') as number)) level.setBlock(x, y, z, BAMBOO.with(st, 'age', 1));
  },
  /**
   * vanilla randomTick (isRandomlyTicking: only while stage 0): one time in three, with air over it lit to 9 or more,
   * a stalk block grows onto a stalk under 16 tall (a block that isn't the top has no air over it)
   */
  randomTick(level, x, y, z, st) {
    if (BAMBOO.get(st, 'stage') !== 0) return;
    const w = level.world;
    if (level.random.nextInt(3) === 0 && isAir(w.getState(x, y + 1, z)) && level.rawBrightness(x, y + 1, z, 0) >= 9) {
      const h = heightBelow(w, x, y, z) + 1;
      if (h < BAMBOO_MAX_HEIGHT) growBamboo(level, x, y, z, st, h);
    }
  },
  /**
   * vanilla isValidBonemealTarget (under 16 tall, its top still growing) and performBonemeal: one or two blocks onto
   * the top, while there's air over it, the stalk under 16 and the top still growing
   */
  performBonemeal(level, x, y, z) {
    const w = level.world;
    let i = heightAbove(w, x, y, z);
    const j = heightBelow(w, x, y, z);
    if (!(i + j + 1 < BAMBOO_MAX_HEIGHT && BAMBOO.get(w.getState(x, y + i, z), 'stage') !== 1)) return false;
    let k = i + j + 1;
    const l = 1 + level.random.nextInt(2);
    for (let m = 0; m < l; m++) {
      const top = w.getState(x, y + i, z);
      if (k >= BAMBOO_MAX_HEIGHT || !isBamboo(top) || BAMBOO.get(top, 'stage') === 1 || !isAir(w.getState(x, y + i + 1, z))) break;
      growBamboo(level, x, y + i, z, top, k);
      i++;
      k++;
    }
    return true;
  },
  destroyProgress: swordCuts,
});

registerBehavior('bamboo_sapling', {
  canSurvive: standsOn,
  /** vanilla BambooSaplingBlock.updateShape: gone (and dropped) with nothing under it; stalk once stalk is over it */
  updateShape(w, x, y, z, st) {
    if (!standsOn(w, x, y, z)) return 0;
    return isBamboo(w.getState(x, y + 1, z)) ? BAMBOO.defaultState : st;
  },
  /** vanilla randomTick: one time in three, with air over it lit to 9 or more, it grows */
  randomTick(level, x, y, z) {
    if (level.random.nextInt(3) === 0 && isAir(level.world.getState(x, y + 1, z)) && level.rawBrightness(x, y + 1, z, 0) >= 9) growFromShoot(level, x, y, z);
  },
  /** vanilla isValidBonemealTarget (air over it) and performBonemeal: it grows */
  performBonemeal(level, x, y, z) {
    if (!isAir(level.world.getState(x, y + 1, z))) return false;
    growFromShoot(level, x, y, z);
    return true;
  },
  destroyProgress: swordCuts,
  // vanilla loot table blocks/bamboo_sapling: bamboo; getCloneItemStack: bamboo
  drops: () => [ItemStack.of('bamboo')],
  cloneItem: () => 'bamboo',
});

// vanilla getCollisionShape: the stalk's post, set off as the stalk is (its outline is moved by world/blockOffset.ts)
{
  const c = BAMBOO_COLLISION_SHAPE;
  const cache = new Map<number, Box[]>();
  registerDynamicShape(BAMBOO, (_w, x, _y, z) => {
    const key = (x + 33554432) * 67108864 + (z + 33554432);
    let boxes = cache.get(key);
    if (!boxes) {
      if (cache.size > 4096) cache.clear();
      const [ox, oz] = horizontalOffset(BAMBOO, x, z);
      boxes = [[c[0] + ox, c[1], c[2] + oz, c[3] + ox, c[4], c[5] + oz]];
      cache.set(key, boxes);
    }
    return boxes;
  });
}
