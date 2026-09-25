// (trial chambers) Projectiles turned away by what they strike (1.21; vanilla ProjectileDeflection, Entity.deflection
// and Projectile.hitTargetOrDeflectSelf). Most things just take the hit; a breeze (vanilla #deflects_projectiles) turns
// it back instead: it flies off the way it came at half the speed, swung round, with the breeze's whoosh, and doesn't
// hit at all. It's turned only once by each thing: if it comes at the same breeze again it passes on through. The
// projectiles ask here before they strike anything (arrows and tridents, snowballs, eggs, ender pearls, potions and
// bottles o' enchanting, fireballs and firework rockets); wind charges go through their own way (a breeze lets them
// hit it: entity/breeze.ts).

import type { Entity } from './entity';

/** vanilla ProjectileDeflection.deflect: what one thing does to a projectile it turns */
export type Deflection = (projectile: Entity, by: Entity) => void;

/** vanilla Entity.deflection: how each kind turns a given projectile (none, for most) */
export const DEFLECTIONS: Record<string, (projectile: Entity) => Deflection | null> = {};

/** vanilla ProjectileDeflection.REVERSE: back the way it came at half the speed, swung round 170-190 degrees */
export const REVERSE: Deflection = (p) => {
  const f = 170 + p.level.random.nextFloat() * 20;
  p.dx *= -0.5;
  p.dy *= -0.5;
  p.dz *= -0.5;
  p.yaw += f;
  p.yawO += f;
};

/** vanilla Projectile.lastDeflectedBy */
const LAST_DEFLECTED_BY = new WeakMap<Entity, Entity>();

/**
 * vanilla Projectile.hitTargetOrDeflectSelf, for a projectile about to strike `e`: true when `e` turns it away (it's
 * turned the first time, and passes the one that turned it after that) and it mustn't strike; false to strike as usual
 */
export function deflectedBy(projectile: Entity, e: Entity): boolean {
  const d = DEFLECTIONS[e.type]?.(projectile);
  if (!d) return false;
  if (LAST_DEFLECTED_BY.get(projectile) !== e) {
    d(projectile, e);
    LAST_DEFLECTED_BY.set(projectile, e);
  }
  return true;
}
