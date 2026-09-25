// (trial chambers) The mace (1.21; vanilla MaceItem). A heavy club: 6 damage at 0.6 blows a second, a point of wear
// with each blow and two with each block it breaks (and it breaks none in creative), mended at an anvil with breeze
// rods, enchantable as a weapon (enchantability 15).
//
// Its smash attack: a blow struck while falling more than a block and a half (not gliding) does 4 more damage for each
// of the first 3 blocks fallen, 2 more for each of the next 5 and 1 more for each block after that, added before a
// critical hit's half again; Density adds half a point for each block fallen at each level. The blow stops the fall
// dead: the wielder hangs a moment, and falling back hurts only for the height below where it was struck. It throws
// everything else within 3.5 blocks of the target up and away (twice as hard from more than 5 blocks up; not the
// wielder's own pets), puts up a pillar of dust from the block the target stood on and sounds a crash (a heavier one
// from more than 5 blocks up) if the target was standing, a thwack if it was in the air; and when the wielder lands,
// they kick up a spray of the ground. Breach makes the target's armour 15% less effective at each level. Wind Burst:
// after a smash attack a gust bursts at the wielder's feet and throws them back up (1.2, 1.75 or 2.2 times a wind
// charge's push, by its level), pushing everything round away and setting off doors and switches as a wind charge
// does. game/combat.ts calls in here round the blow.

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { Entity } from '../entity/entity';
import { LivingEntity, ARMOR_EFFECTIVENESS } from '../entity/living';
import type { ItemStack } from '../item/item';
import { levelOf } from '../item/enchantHelper';
import { FLAGS, F_AIR } from '../world/block';
import { impulseOf, setIgnoreFallFromImpulse, windBurstAt } from './windBurst';

/** vanilla MaceItem.SMASH_ATTACK_FALL_THRESHOLD */
export const SMASH_ATTACK_FALL_THRESHOLD = 1.5;
/** vanilla MaceItem.SMASH_ATTACK_HEAVY_THRESHOLD */
const SMASH_ATTACK_HEAVY_THRESHOLD = 5;
/** vanilla MaceItem.SMASH_ATTACK_KNOCKBACK_RADIUS */
const SMASH_ATTACK_KNOCKBACK_RADIUS = 3.5;
/** vanilla MaceItem.SMASH_ATTACK_KNOCKBACK_POWER */
const SMASH_ATTACK_KNOCKBACK_POWER = 0.7;

const isMace = (s: ItemStack | null | undefined): boolean => s?.item.id === 'mace';

/** vanilla MaceItem.canSmashAttack: falling more than a block and a half, and not gliding */
export function canSmashAttack(e: LivingEntity): boolean {
  return e.fallDistance > SMASH_ATTACK_FALL_THRESHOLD && !e.fallFlying;
}

/**
 * vanilla MaceItem.getAttackDamageBonus, with EnchantmentHelper.modifyFallBasedDamage (density: half a point a block
 * fallen for each level): what a blow with `weapon` adds for the height its wielder has fallen
 */
export function smashDamageBonus(attacker: LivingEntity, weapon: ItemStack | null): number {
  if (!isMace(weapon) || !canSmashAttack(attacker)) return 0;
  const fd = attacker.fallDistance;
  const f2 = fd <= 3 ? 4 * fd : fd <= 8 ? 12 + 2 * (fd - 3) : 22 + fd - 8;
  return f2 + 0.5 * levelOf(weapon, 'density') * fd;
}

/** vanilla MaceItem.getDamageSource: a smash attack's own (death.attack.mace_smash), else the usual */
export function smashDamageSource(attacker: LivingEntity, weapon: ItemStack | null): string | null {
  return isMace(weapon) && canSmashAttack(attacker) ? 'maceSmash' : null;
}

/**
 * vanilla EnchantmentHelper.modifyArmorEffectiveness for the blow `hit` strikes with `weapon` (CombatRules
 * .getDamageAfterAbsorb): breach takes 0.15 off the target's armour's effectiveness for each level
 */
export function withBreach<T>(weapon: ItemStack | null, hit: () => T): T {
  const lvl = levelOf(weapon, 'breach');
  if (!lvl) return hit();
  const prev = ARMOR_EFFECTIVENESS.modify;
  ARMOR_EFFECTIVENESS.modify = (f) => prev(f) - 0.15 * lvl;
  try {
    return hit();
  } finally {
    ARMOR_EFFECTIVENESS.modify = prev;
  }
}

/**
 * vanilla MaceItem.hurtEnemy, once a blow with `weapon` has hurt `target`: a smash attack stops the wielder's fall
 * (the fall back counts only below here), sounds and knocks everything round the target away
 */
export function maceHurtEnemy(level: Level, p: Player, target: LivingEntity, weapon: ItemStack | null): void {
  if (!isMace(weapon) || !canSmashAttack(p)) return;
  const c = impulseOf(p);
  if (c.ignoreFall && c.impactPos) {
    if (c.impactPos[1] > p.y) c.impactPos = [p.x, p.y, p.z];
  } else c.impactPos = [p.x, p.y, p.z];
  setIgnoreFallFromImpulse(c, true);
  p.dy = 0.01;
  if (target.onGround) {
    // (vanilla ServerPlayer.setSpawnExtraParticlesOnFall: their landing kicks up the ground, game/windBurst.ts)
    c.extraParticlesOnFall = true;
    level.sound.play(p.fallDistance > SMASH_ATTACK_HEAVY_THRESHOLD ? 'item.mace.smash_ground_heavy' : 'item.mace.smash_ground', p.x, p.y, p.z, 1, 1);
  } else level.sound.play('item.mace.smash_air', p.x, p.y, p.z, 1, 1);
  knockback(level, p, target);
}

/** vanilla MaceItem.knockback: the dust pillar, and everything else in reach thrown up and away from the target */
function knockback(level: Level, p: Player, target: LivingEntity): void {
  smashAttackParticles(level, Math.floor(target.x), Math.floor(target.y - 0.2), Math.floor(target.z), 750);
  const r = SMASH_ATTACK_KNOCKBACK_RADIUS;
  for (const e of level.getEntities(target.bb.inflate(r, r, r), (e) => e instanceof LivingEntity)) {
    if (!knockbackPredicate(p, target, e as LivingEntity)) continue;
    const ox = e.x - target.x, oy = e.y - target.y, oz = e.z - target.z;
    const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
    // vanilla getKnockbackPower
    const power = (r - len) * SMASH_ATTACK_KNOCKBACK_POWER * (p.fallDistance > SMASH_ATTACK_HEAVY_THRESHOLD ? 2 : 1) * (1 - (e as LivingEntity).knockbackResistance());
    if (power > 0) {
      // (vanilla Vec3.normalize: nothing for a point on top of the target)
      const k = len < 1e-4 ? 0 : power / len;
      e.push(ox * k, 0.7, oz * k);
    }
  }
}

/**
 * vanilla MaceItem.knockbackPredicate: not a spectator, the wielder or the target, nor the wielder's own tame animal
 * (nor a marker armour stand, or an ally on the wielder's team, neither of which there are), within 3.5 of the target
 */
function knockbackPredicate(p: Player, target: LivingEntity, e: LivingEntity): boolean {
  if ((e as { gameMode?: string }).gameMode === 'spectator') return false;
  if (e === p || e === target) return false;
  const pet = e as { isTame?: () => boolean; isOwnedBy?: (o: Entity | null) => boolean };
  if (pet.isOwnedBy && pet.isTame?.() && pet.isOwnedBy(p)) return false;
  return target.distanceToSqr(e.x, e.y, e.z) <= SMASH_ATTACK_KNOCKBACK_RADIUS * SMASH_ATTACK_KNOCKBACK_RADIUS;
}

const gauss = (): number => {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

/**
 * vanilla ParticleUtils.spawnSmashAttackParticles (level event 2013): from the top of the block at bx, by, bz, a third
 * of `power` specks of it shot up round the middle and two thirds in a ring 3.5 blocks out (none off air)
 */
export function smashAttackParticles(level: Level, bx: number, by: number, bz: number, power: number): void {
  const st = level.world.getState(bx, by, bz);
  if (FLAGS[st] & F_AIR || !level.particles.dustPillar) return;
  const x = bx + 0.5, y = by + 1, z = bz + 0.5;
  for (let i = 0; i < power / 3; i++) level.particles.dustPillar(x + gauss() / 2, y, z + gauss() / 2, gauss() * 0.2, st, bx, by, bz);
  for (let j = 0; j < power / 1.5; j++) level.particles.dustPillar(x + 3.5 * Math.cos(j) + gauss() / 2, y, z + 3.5 * Math.sin(j) + gauss() / 2, gauss() * 0.05, st, bx, by, bz);
}

/**
 * wind burst (vanilla Enchantments.WIND_BURST: a post_attack explode effect on the attacker, while it's falling at
 * least a block and a half and isn't flying): a burst of wind at the wielder's feet with no source, so it throws
 * them up too
 */
export function maceWindBurst(level: Level, p: Player, weapon: ItemStack | null): void {
  const lvl = levelOf(weapon, 'wind_burst');
  if (!lvl || p.fallDistance < SMASH_ATTACK_FALL_THRESHOLD || p.fallFlying || p.flying) return;
  // vanilla LevelBasedValue.lookup([1.2, 1.75, 2.2], perLevel(1.5, 0.35))
  const knockback = [1.2, 1.75, 2.2][lvl - 1] ?? 1.5 + 0.35 * (lvl - 1);
  windBurstAt(level, null, p.x, p.y, p.z, 3.5, { knockback, sound: 'entity.wind_charge.wind_burst' });
}

/** vanilla MaceItem.postHurtEnemy (the point of wear is game/combat.ts's): a smash attack's fall is spent */
export function macePostHurtEnemy(p: Player, weapon: ItemStack | null): void {
  if (isMace(weapon) && canSmashAttack(p)) p.fallDistance = 0;
}
