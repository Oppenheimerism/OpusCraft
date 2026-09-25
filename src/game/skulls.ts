// What mob heads do (vanilla AbstractSkullBlock, SkullBlock, WallSkullBlock and StandingAndWallBlockItem): the item
// goes on the floor, turned to face whoever put it there (to a sixteenth of a turn), or on a wall when the player
// looks at one; it needs nothing under or behind it. A head is powered while redstone reaches it (the dragon's head
// then works its jaw, the piglin's its ears: world/skullBlockEntity.ts). Broken, it drops its item with any name it
// was given.

import { BLOCKS, STATE_BLOCK, FLAGS, F_REPLACEABLE, F_AIR, getBlock } from '../world/block';
import { DOWN, UP, OPPOSITE, DIR_NAMES, DX, DY, DZ } from '../world/dir';
import { SKULL_TYPES, SKULL_BLOCKS } from '../world/blocksSkulls';
import { SkullBlockEntity } from '../world/skullBlockEntity';
import { registerBehavior } from './blockBehavior';
import { lookingDirections, type PlaceContext } from './blockRules';
import { hasNeighborSignal } from './redstone/signal';
import { ItemStack } from '../item/item';
import type { Level } from './level';

/** vanilla Block.UPDATE_CLIENTS: set without updating the neighbours */
const UPDATE_CLIENTS = 2;

/** vanilla RotationSegment.convertToSegment(degrees): the sixteenth of a turn nearest `yaw` */
export function skullRotation(yaw: number): number {
  return Math.floor((yaw * 16) / 360 + 0.5) & 15;
}

/**
 * vanilla BlockPlaceContext.getNearestLookingDirections: the way the player looks, nearest first, but the side the
 * clicked face looks away from before all (unless the click replaces what was there)
 */
function nearestLookingDirections(ctx: PlaceContext): number[] {
  const dirs = lookingDirections(ctx.yaw, ctx.pitch);
  if (ctx.replaceClicked) return dirs;
  const first = OPPOSITE[ctx.face];
  return [first, ...dirs.filter((d) => d !== first)];
}

/** vanilla BlockBehaviour.canBeReplaced: air, or a replaceable block (grass, snow, water...) */
function replaceable(st: number): boolean {
  return (FLAGS[st] & (F_AIR | F_REPLACEABLE)) !== 0;
}

for (const t of SKULL_TYPES) {
  const [floorName, wallName] = SKULL_BLOCKS[t];
  const floor = getBlock(floorName), wall = getBlock(wallName);
  /** vanilla SkullBlockEntity loot (copy_components: custom_name): the floor block's item, named as it was */
  const drops = (be: unknown): ItemStack[] => {
    const s = ItemStack.of(floorName);
    const name = be instanceof SkullBlockEntity ? be.customName : undefined;
    if (name !== undefined) s.tag = { ...(s.tag ?? {}), customName: name };
    return [s];
  };
  /**
   * vanilla AbstractSkullBlock.neighborChanged: powered while any neighbour gives it a signal (set quietly: flag 2,
   * no updates of its own)
   */
  const neighborChanged = (level: Level, x: number, y: number, z: number, st: number): void => {
    const b = BLOCKS[STATE_BLOCK[st]];
    const on = hasNeighborSignal(level.world, x, y, z);
    if (on !== b.get(st, 'powered')) level.setBlock(x, y, z, b.with(st, 'powered', on), UPDATE_CLIENTS);
  };
  registerBehavior(floorName, {
    /**
     * vanilla StandingAndWallBlockItem.getPlacementState (attached below): in the order the player looks (never from
     * above), on the floor when that's down — turned to the player's yaw — else on a wall: WallSkullBlock faces away
     * from the first horizontal way the player looks with a block there that isn't replaceable
     */
    placement(ctx) {
      const powered = hasNeighborSignal(ctx.world, ctx.x, ctx.y, ctx.z);
      let onWall: number | null = null;
      for (const d of nearestLookingDirections(ctx)) {
        if (d === UP || d === DOWN) continue;
        if (!replaceable(ctx.world.getState(ctx.x + DX[d], ctx.y + DY[d], ctx.z + DZ[d]))) {
          onWall = wall.state({ facing: DIR_NAMES[OPPOSITE[d]], powered });
          break;
        }
      }
      for (const d of nearestLookingDirections(ctx)) {
        if (d === UP) continue;
        const st = d === DOWN ? floor.state({ rotation: skullRotation(ctx.yaw), powered }) : onWall;
        if (st !== null) return st;
      }
      return null;
    },
    canSurvive: () => true,
    neighborChanged,
    drops: (_st, _tool, _r, _silk, _fortune, be) => drops(be),
  });
  registerBehavior(wallName, {
    canSurvive: () => true,
    neighborChanged,
    drops: (_st, _tool, _r, _silk, _fortune, be) => drops(be),
  });
}
