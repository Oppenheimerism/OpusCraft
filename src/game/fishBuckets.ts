// Buckets of fish in the player's hand (Stage 5: ocean; vanilla MobBucketItem): used, the water goes where a water
// bucket's would (vanilla BucketItem.use and emptyContents: into the block looked at if it holds water, else in front
// of its face) with a fishy splash, the fish swims out into it, and an empty bucket is left (a creative player keeps
// the full one). A tropical fish's bucket names its kind. Scooping a fish up is the fish's own (entity/fish.ts
// bucketMobPickup), and a dispenser pours one out too (game/redstone/dispenseItems.ts).

import { registerItemBehavior } from './itemBehavior';
import { registerHoverText } from '../item/hoverText';
import { emptyContents } from './redstone/dispenseItems';
import { behaviorOf } from './blockBehavior';
import { raycast } from './raycast';
import { BUCKET_FISH, bucketEmptySound, releaseBucketFish, unpackTropical, COMMON_TROPICAL, COMMON_TROPICAL_NAMES, TROPICAL_PATTERNS } from '../entity/fish';
import { DYE_COLORS } from '../entity/animals';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { DX, DY, DZ } from '../world/dir';
import { ItemStack, prettyName } from '../item/item';
import type { Level } from './level';
import type { Player } from '../entity/player';

/** vanilla LiquidBlockContainer (for water): a block the water goes into where it stands */
function holdsWater(st: number): boolean {
  const b = BLOCKS[STATE_BLOCK[st]];
  return behaviorOf(st)?.placeLiquid !== undefined || b.propIndex('waterlogged') >= 0 || /^(seagrass|tall_seagrass|kelp|kelp_plant)$/.test(b.name);
}

/**
 * vanilla BucketItem.use for a bucket of fish: the block looked at (ClipContext.Fluid.NONE: through water, within
 * reach); the water into it if it holds water, else in front of the face looked at (and there if the first place
 * won't take it); then the fish, and the bucket emptied
 */
function useFishBucket(level: Level, p: Player, stack: ItemStack): 'success' | 'fail' | 'pass' {
  if (p.gameMode === 'spectator') return 'pass';
  const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
  const reach = p.gameMode === 'creative' ? 5 : 4.5;
  const h = raycast(level.world, p.x, p.y + p.eyeHeight, p.z, -Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr), reach);
  if (!h) return 'pass';
  const nx = h.x + DX[h.face], ny = h.y + DY[h.face], nz = h.z + DZ[h.face];
  let [x, y, z] = holdsWater(level.getState(h.x, h.y, h.z)) ? [h.x, h.y, h.z] : [nx, ny, nz];
  if (y < level.world.dim.minY || y >= level.world.dim.maxY) return 'fail';
  const sound = bucketEmptySound(stack.item.id);
  if (!emptyContents(level, x, y, z, 'water', sound)) {
    [x, y, z] = [nx, ny, nz];
    if (y < level.world.dim.minY || y >= level.world.dim.maxY || !emptyContents(level, x, y, z, 'water', sound)) return 'fail';
  }
  releaseBucketFish(level, stack, x, y, z);
  // vanilla ItemUtils.createFilledResult(stack, player, getEmptySuccessItem): the empty bucket in its place
  if (p.gameMode !== 'creative') p.inventory.setSelectedItem(ItemStack.of('bucket'));
  p.swing();
  return 'success';
}

// (M7: and the bucket of axolotl, whose axolotl entity/axolotl.ts adds to BUCKET_FISH; M9: frogs, and the tadpole's)
for (const id of new Set([...Object.keys(BUCKET_FISH), 'axolotl_bucket', 'tadpole_bucket'])) registerItemBehavior(id, { use: useFishBucket });

/**
 * vanilla MobBucketItem.appendHoverText: a bucket of tropical fish names the kind it holds, grey and slanted: one of
 * the 22 common kinds by its name, any other as its pattern and its colours
 */
registerHoverText('tropical_fish_bucket', (s) => {
  const v = s.tag?.bucketEntity?.BucketVariantTag;
  if (typeof v !== 'number') return [];
  const i = COMMON_TROPICAL.indexOf(v);
  if (i >= 0) return [`§7§o${COMMON_TROPICAL_NAMES[i]}`];
  const t = unpackTropical(v);
  const colour = (c: number) => prettyName(DYE_COLORS[c] ?? 'white');
  return [`§7§o${prettyName(TROPICAL_PATTERNS[t.pattern])}`, `§7§o${colour(t.base)}${t.base !== t.patternColor ? `, ${colour(t.patternColor)}` : ''}`];
});
