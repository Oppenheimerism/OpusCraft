// Powder snow (vanilla PowderSnowBlock): what's in it is held (0.9 across, 1.5 up and down a tick) and freezes; it
// kicks up snowflakes as it's waded through, and it puts out whatever burns in it (melting away round a burning
// player, or a burning mob while mobs may grief). Its collision, which only what can walk on it (leather boots, rabbits,
// foxes...) finds solid and a long fall lands on the crust of, is Entity.powderSnowCollision; the freezing is
// LivingEntity.tickFreezing; a landing on it doesn't hurt (LivingEntity.fallOnPowderSnow).

import { BLOCKS, STATE_BLOCK } from '../world/block';
import { LivingEntity } from '../entity/living';
import { registerBehavior } from './blockBehavior';

registerBehavior('powder_snow', {
  /**
   * vanilla PowderSnowBlock.entityInside: anything not alive, or alive with its feet in it (getFeetBlockState), is
   * stuck in it, and half the time it moves a snowflake flies up off the top; it's in powder snow; burning, it's
   * put out, and a burning player (or mob, with mobGriefing) melts the snow
   */
  entityInside(level, x, y, z, _st, e) {
    const feet = level.world.getState(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
    if (!(e instanceof LivingEntity) || BLOCKS[STATE_BLOCK[feet]].name === 'powder_snow') {
      e.makeStuckInBlock(0.9, 1.5, 0.9);
      const moved = e.xo !== e.x || e.zo !== e.z;
      const r = level.random;
      if (moved && r.nextBool()) {
        // (vanilla Mth.randomBetween(-1, 1) · 1/12 sideways, 0.05 up)
        level.particles.spawn?.('snowflake', e.x, y + 1, e.z, (r.nextFloat() * 2 - 1) * 0.083333336, 0.05, (r.nextFloat() * 2 - 1) * 0.083333336);
      }
    }
    e.inPowderSnow = true;
    if (e.isOnFire() && (e.type === 'player' || level.gameRules.mobGriefing)) level.destroyBlock(x, y, z, false);
  },
});
