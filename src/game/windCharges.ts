// (trial chambers) Using wind charges (vanilla WindChargeItem, 1.21): thrown from the eye at a block and a half a tick,
// a little astray and carrying the thrower's own motion, with a whoosh; half a second passes before the next can go,
// and one is used up but in creative. An ominous trial spawner's item spawner lets one fall straight down (vanilla
// WindChargeItem.asProjectile for Direction.DOWN), a little astray at a block a tick, with the same whoosh. (A
// dispenser's goes the same way out of its front: game/redstone/dispenseItems.ts.)

import type { Level } from './level';
import { registerItemBehavior } from './itemBehavior';
import { WindCharge } from '../entity/windCharge';
import { OMINOUS_PROJECTILES } from '../entity/ominousItemSpawner';

/** vanilla level event 1051 (SOUND_WIND_CHARGE_SHOOT): the throw's whoosh from a block */
export function windChargeShootSound(level: Level, x: number, y: number, z: number): void {
  level.sound.play('entity.wind_charge.throw', x + 0.5, y + 0.5, z + 0.5, 0.5, 0.4 / (level.random.nextFloat() * 0.4 + 0.8));
}

/**
 * vanilla WindChargeItem.asProjectile: a wind charge at (x, y, z) headed along (dx, dy, dz) at about a block a tick, each
 * way a triangle's spread astray (its shoot does nothing more)
 */
export function windChargeFrom(level: Level, x: number, y: number, z: number, dx: number, dy: number, dz: number): WindCharge {
  const r = level.random;
  const tri = (mode: number) => mode + 0.11485000000000001 * (r.nextDouble() - r.nextDouble());
  const c = new WindCharge(level, null);
  c.moveTo(x, y, z, 0, 0);
  c.dx = tri(dx);
  c.dy = tri(dy);
  c.dz = tri(dz);
  return c;
}

registerItemBehavior('wind_charge', {
  // vanilla WindChargeItem.use (an item on cooldown isn't used at all)
  use(level, p) {
    if (p.cooldowns.get('wind_charge')) return 'pass';
    const c = new WindCharge(level, p);
    c.moveTo(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
    c.shootFromRotation(p, p.pitch, p.yaw, 0, 1.5, 1);
    level.addEntity(c);
    level.sound.play('entity.wind_charge.throw', p.x, p.y, p.z, 0.5, 0.4 / (level.random.nextFloat() * 0.4 + 0.8));
    p.cooldowns.set('wind_charge', 10);
    p.cooldownTotals.set('wind_charge', 10);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    p.swing();
    return 'success';
  },
});

// vanilla OminousItemSpawner.spawnItem for a wind charge: shot down (its dispense config's level event at the spawner)
OMINOUS_PROJECTILES.wind_charge = (level, x, y, z) => {
  windChargeShootSound(level, Math.floor(x), Math.floor(y), Math.floor(z));
  return windChargeFrom(level, x, y, z, 0, -1, 0);
};
