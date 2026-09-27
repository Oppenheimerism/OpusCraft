// The lodestone compass (vanilla CompassItem.useOn, inventoryTick, isFoil and getDescriptionId, and LodestoneTracker):
// a compass used on a lodestone locks onto it with item.lodestone_compass.lock and becomes a "Lodestone Compass", with
// the enchantment glint, whose needle points to that lodestone anywhere in its dimension and spins in any other
// (item/compass.ts). A lone compass is the one changed; one off a bigger stack, or any a creative player uses, is
// copied with the lodestone on it and put away (or dropped). Carried in the lodestone's dimension it looks each tick
// for the lodestone, and once it's gone the compass points nowhere (still a lodestone compass). Vanilla asks its
// points of interest, which it keeps for chunks that aren't loaded too; here the block is looked at, in a loaded
// chunk only, so a lodestone broken while its compass was put away is missed until its chunk is loaded again.

import { ITEMS, type LodestoneTracker } from '../item/item';
import { registerItemBehavior } from './itemBehavior';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import type { Level } from './level';

const COMPASS = ITEMS.get('compass')!;
// vanilla CompassItem.getDescriptionId: item.minecraft.lodestone_compass once it has a lodestone tracker
COMPASS.stackName = (s) => (s.tag?.lodestoneTracker ? 'Lodestone Compass' : s.item.name);
// vanilla CompassItem.isFoil
COMPASS.foil = (s) => !!s.tag?.lodestoneTracker;

const isLodestone = (level: Level, x: number, y: number, z: number): boolean => BLOCKS[STATE_BLOCK[level.getState(x, y, z)]].name === 'lodestone';

/** vanilla Level.isInWorldBounds: inside the dimension's build height and the farthest a world border reaches */
const inWorldBounds = (level: Level, x: number, y: number, z: number): boolean =>
  y >= level.dim.minY && y < level.dim.maxY && Math.abs(x) < 30_000_000 && Math.abs(z) < 30_000_000;

registerItemBehavior('compass', {
  // vanilla CompassItem.useOn: on a lodestone, lock onto it
  useOn(level, p, stack, hit) {
    if (!isLodestone(level, hit.x, hit.y, hit.z)) return 'pass';
    level.sound.play('item.lodestone_compass.lock', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 1, 1);
    // (vanilla ServerPlayerGameMode.useItemOn: ITEM_USED_ON_BLOCK hears of it, with the compass as it was)
    level.onPlayerTrigger?.(p, 'item_used_on_block', { usedOnBlock: { item: stack.item.id, block: 'lodestone' } });
    const tracker: LodestoneTracker = { target: { dim: level.dim.id, pos: [hit.x, hit.y, hit.z] }, tracked: true };
    const creative = p.gameMode === 'creative';
    if (!creative && stack.count === 1) (stack.tag ??= {}).lodestoneTracker = tracker;
    else {
      // (vanilla ItemStack.transmuteCopy(COMPASS, 1): its other data, a name or a curse, goes with it)
      const locked = stack.copyWithCount(1);
      (locked.tag ??= {}).lodestoneTracker = tracker;
      if (!creative) p.inventory.consumeSelected(1);
      const left = p.inventory.add(locked, creative);
      if (left > 0) p.dropItem(locked.copyWithCount(left), false);
    }
    p.inventory.version++;
    p.swing();
    return 'success';
  },
  // vanilla CompassItem.inventoryTick → LodestoneTracker.tick (the server's): in the lodestone's dimension, a lodestone
  // that isn't there any more (or a spot outside the world) leaves the compass pointing nowhere
  inventoryTick(level, p, stack) {
    const t = stack.tag?.lodestoneTracker;
    if (level.isClientSide || !t?.tracked || !t.target || t.target.dim !== level.dim.id) return;
    const [x, y, z] = t.target.pos;
    if (inWorldBounds(level, x, y, z) && (!level.world.isLoaded(x, z) || isLodestone(level, x, y, z))) return;
    stack.tag!.lodestoneTracker = { tracked: true };
    p.inventory.version++;
  },
});
