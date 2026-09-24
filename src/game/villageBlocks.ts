// What the village blocks do (vanilla BellBlock and the job site blocks: BarrelBlock, ComposterBlock, SmokerBlock,
// BlastFurnaceBlock, the cauldrons, LecternBlock, FlowerPotBlock, CampfireBlock). The blocks themselves are in
// world/blocksVillage; their block entities in world/blockEntity.

import { BLOCKS, STATE_BLOCK, FLAGS, FACE_OCC, F_FULL_COLLISION, F_LEAVES, Block, getBlock } from '../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DZ, OPPOSITE, DIR_NAMES, AXIS_OF, dirFromYaw, type Dir } from '../world/dir';
import type { World } from '../world/world';
import { AABB } from '../core/aabb';
import { LivingEntity } from '../entity/living';
import { registerBehavior } from './blockBehavior';
import type { PlaceContext } from './blockRules';
import { hasNeighborSignal } from './redstone/signal';
import { BellBlockEntity } from '../world/blockEntity';
import type { Level } from './level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla BlockBehaviour.isFaceSturdy (FULL): the face is all there to hang something on */
function sturdy(st: number, face: number): boolean {
  return (FLAGS[st] & F_FULL_COLLISION && !(FLAGS[st] & F_LEAVES)) || ((FACE_OCC[st] >> face) & 1) === 1;
}

/** vanilla Block.canSupportCenter: a sturdy face, or the post of a fence, wall, pane, bars or chain */
function supportsCenter(st: number, face: number): boolean {
  return sturdy(st, face) || /_fence$|_wall$|_pane$|^iron_bars$|^chain$/.test(blk(st).name);
}

const dirOf = (name: string): Dir => DIR_NAMES.indexOf(name as (typeof DIR_NAMES)[number]) as Dir;
const facingOf = (st: number): Dir => dirOf(blk(st).get<string>(st, 'facing'));

// ---------------------------------------------------------------------------
// Bell (vanilla BellBlock)
{
  const bell = getBlock('bell');
  const attachment = (st: number) => bell.get<string>(st, 'attachment');

  /** vanilla BellBlock.canSurvive: standing on a sturdy top, hanging under something that holds up its middle, or on a wall's sturdy face */
  const canSurvive = (w: World, x: number, y: number, z: number, st: number): boolean => {
    const a = attachment(st);
    if (a === 'floor') return sturdy(w.getState(x, y - 1, z), UP);
    if (a === 'ceiling') return supportsCenter(w.getState(x, y + 1, z), DOWN);
    const f = facingOf(st);
    return sturdy(w.getState(x + DX[f], y, z + DZ[f]), OPPOSITE[f]);
  };

  /** vanilla BellBlock.isProperHit: the bell, not its frame, was struck (from the side, below the top rim of the frame) */
  const isProperHit = (st: number, face: number, dy: number): boolean => {
    if (face === UP || face === DOWN || dy > 0.8124) return false;
    const f = facingOf(st);
    switch (attachment(st)) {
      case 'floor': return AXIS_OF[f] === AXIS_OF[face];
      case 'single_wall':
      case 'double_wall': return AXIS_OF[f] !== AXIS_OF[face];
      default: return true;
    }
  };

  /**
   * vanilla BellBlock.attemptToRing and BellBlockEntity.onHit / triggerEvent / updateEntities: the bell swings away
   * from `dir` (its facing when none), rings out (volume 2: heard 32 blocks away), and every living thing within 32
   * blocks remembers hearing it (villagers' HEARD_BELL_TIME: an entity that keeps a `heardBellTime` gets the time)
   */
  const ring = (level: Level, x: number, y: number, z: number, dir: Dir | null): boolean => {
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof BellBlockEntity)) return false;
    const st = level.getState(x, y, z);
    be.onHit(dir ?? facingOf(st));
    // (who is around is looked up again at most every 3 seconds)
    if (level.gameTime > be.lastRingTimestamp + 60 || !be.nearbyEntities) {
      be.lastRingTimestamp = level.gameTime;
      be.nearbyEntities = level.getEntities(new AABB(x - 48, y - 48, z - 48, x + 49, y + 49, z + 49), (e) => e instanceof LivingEntity);
    }
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    for (const e of be.nearbyEntities) {
      if (!(e as LivingEntity).isAlive || e.removed) continue;
      if ((e.x - cx) ** 2 + (e.y - cy) ** 2 + (e.z - cz) ** 2 >= 32 * 32) continue;
      if ('heardBellTime' in e) (e as { heardBellTime: number }).heardBellTime = level.gameTime;
    }
    level.sound.play('block.bell.use', cx, cy, cz, 2, 1);
    return true;
  };

  registerBehavior('bell', {
    // vanilla BellBlock.getStateForPlacement
    placement(ctx: PlaceContext) {
      const { world: w, x, y, z, face } = ctx;
      if (face === UP || face === DOWN) {
        const st = bell.state({ attachment: face === DOWN ? 'ceiling' : 'floor', facing: DIR_NAMES[dirFromYaw(ctx.yaw)] });
        return canSurvive(w, x, y, z, st) ? st : null;
      }
      // a wall on both sides along the clicked face's axis: it hangs between them
      const between = face === WEST || face === EAST
        ? sturdy(w.getState(x - 1, y, z), EAST) && sturdy(w.getState(x + 1, y, z), WEST)
        : sturdy(w.getState(x, y, z - 1), SOUTH) && sturdy(w.getState(x, y, z + 1), NORTH);
      let st = bell.state({ facing: DIR_NAMES[OPPOSITE[face]], attachment: between ? 'double_wall' : 'single_wall' });
      if (canSurvive(w, x, y, z, st)) return st;
      st = bell.with(st, 'attachment', sturdy(w.getState(x, y - 1, z), UP) ? 'floor' : 'ceiling');
      return canSurvive(w, x, y, z, st) ? st : null;
    },
    canSurvive,
    /**
     * vanilla BellBlock.updateShape, from all the neighbours at once: a bell between two walls that loses one hangs
     * from the other; one on a wall that gains a wall behind it hangs between the two (the rest is canSurvive's)
     */
    updateShape(w, x, y, z, st) {
      const a = attachment(st);
      if (a !== 'single_wall' && a !== 'double_wall') return st;
      const f = facingOf(st), b = OPPOSITE[f];
      const front = sturdy(w.getState(x + DX[f], y, z + DZ[f]), b);
      const back = sturdy(w.getState(x + DX[b], y, z + DZ[b]), f);
      if (a === 'single_wall') return front && back ? bell.with(st, 'attachment', 'double_wall') : st;
      if (front && back) return st;
      if (front) return bell.with(st, 'attachment', 'single_wall');
      return back ? bell.with(bell.with(st, 'attachment', 'single_wall'), 'facing', DIR_NAMES[b]) : 0;
    },
    // vanilla BellBlock.useWithoutItem / onHit: a proper hit rings it; anything else (the frame, the top) passes
    use(level, x, y, z, st, ctx) {
      if (!isProperHit(st, ctx.face, ctx.hy - y)) return false;
      ring(level, x, y, z, ctx.face as Dir);
      return true;
    },
    // vanilla BellBlock.onProjectileHit: the same rule for arrows, snowballs, eggs and fireballs
    projectileHit(level, x, y, z, st, hit) {
      if (isProperHit(st, hit.face, hit.py - y)) ring(level, x, y, z, hit.face as Dir);
    },
    // vanilla BellBlock.neighborChanged: it rings as power comes on
    neighborChanged(level, x, y, z, st) {
      const on = hasNeighborSignal(level.world, x, y, z);
      if (on === bell.get(st, 'powered')) return;
      if (on) ring(level, x, y, z, null);
      level.setBlock(x, y, z, bell.with(st, 'powered', on));
    },
  });
}
