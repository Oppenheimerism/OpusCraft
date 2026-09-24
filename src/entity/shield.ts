// Blocking with a shield (vanilla LivingEntity.isBlocking, isDamageSourceBlocked, blockUsingShield and
// blockedByShield; Player.hurtCurrentlyUsedShield, blockUsingShield and disableShield). A shield held up for 5 ticks
// takes whatever comes at its holder from in front: LivingEntity.hurt goes on with the hit at 0 (so the
// invulnerability frames still start and the attacker is still remembered) and says it did nothing; the shield
// wears 1 + the damage when that's 3 or more; a melee attacker has its blockedByShield (the ravager's stun), and an
// axe in its main hand knocks the shield down for 5 seconds. Piercing arrows and #bypasses_shield damage go through.
// The item itself (raising it, the banner on it, its name) is game/shields.ts; its looks render/shieldRenderer.ts.

import type { Entity } from './entity';
import type { LivingEntity } from './living';
import type { Player } from './player';
import { equipment, hurtAndBreak } from '../item/enchantHelper';

/** vanilla #bypasses_shield: #bypasses_armor, and falling anvils and stalactites */
const BYPASSES_SHIELD = new Set([
  'onFire', 'inWall', 'cramming', 'drown', 'flyIntoWall', 'generic', 'wither', 'dragonBreath', 'starve', 'fall', 'freeze', 'stalagmite',
  'magic', 'indirectMagic', 'void', 'genericKill', 'sonicBoom', 'outsideBorder', 'anvil', 'fallingStalactite',
]);

/** vanilla #is_projectile */
const PROJECTILE = new Set(['arrow', 'trident', 'mobProjectile', 'unattributedFireball', 'fireball', 'witherSkull', 'thrown', 'windCharge']);

/** vanilla DamageTypeTags.IS_PROJECTILE */
export function isProjectileDamage(source: string): boolean {
  return PROJECTILE.has(source);
}

/** the player among living things (a mob never raises a shield: vanilla gives none of them the use) */
function asPlayer(e: LivingEntity): Player | null {
  return e.type === 'player' ? (e as Player) : null;
}

/** vanilla LivingEntity.isBlocking: using an item that blocks (the shield) for 5 ticks or more */
export function isBlocking(e: LivingEntity): boolean {
  const p = asPlayer(e);
  return !!p && p.useItem?.item.id === 'shield' && p.ticksUsingItem() >= 5;
}

/**
 * vanilla LivingEntity.isDamageSourceBlocked: not a piercing arrow, not #bypasses_shield, and blocking; then the
 * damage's source position (its direct cause) has to be in front: the way from it to the holder, flattened, against
 * the way the head faces
 */
export function isDamageSourceBlocked(e: LivingEntity, source: string, direct: Entity | null): boolean {
  if (direct && ((direct as { pierceLevel?: number }).pierceLevel ?? 0) > 0) return false;
  if (BYPASSES_SHIELD.has(source) || !isBlocking(e) || !direct) return false;
  const r = (e.headYaw * Math.PI) / 180;
  const dx = e.x - direct.x, dz = e.z - direct.z;
  // (Vec3.normalize: too short a way comes out as nothing, which faces nowhere)
  if (Math.hypot(dx, dz) < 1e-5) return false;
  return dx * -Math.sin(r) + dz * Math.cos(r) < 0;
}

/** vanilla LivingEntity.canDisableShield: an axe in the main hand */
function canDisableShield(e: LivingEntity): boolean {
  const held = equipment(e).find(([slot]) => slot === 'mainhand')?.[1];
  return held?.item.tool?.type === 'axe';
}

/**
 * vanilla Player.disableShield (entity event 30): the shield goes down and can't come up for 5 seconds (the
 * cooldown shows over it in the hotbar), with the sound of it cracking
 */
export function disableShield(p: Player): void {
  p.cooldowns.set('shield', 100);
  p.cooldownTotals.set('shield', 100);
  p.stopUsingItem();
  p.level.sound.play('item.shield.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
}

/**
 * vanilla Player.hurtCurrentlyUsedShield: a blow of 3 or more wears the shield by 1 + the damage (unbreaking may
 * spare it); worn through, it's gone from the hand, the use stops, and it breaks (hurtAndBreak's item-break sound,
 * then the shield's own)
 */
function hurtCurrentlyUsedShield(p: Player, amount: number): void {
  const s = p.useItem;
  if (s?.item.id !== 'shield' || amount < 3) return;
  if (hurtAndBreak(s, 1 + Math.floor(amount), p.gameMode === 'creative')) {
    const inv = p.inventory;
    if (inv.offhand === s) inv.offhand = null;
    else {
      const i = inv.main.indexOf(s);
      if (i >= 0) inv.main[i] = null;
    }
    p.stopUsingItem();
    p.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
    p.level.sound.play('item.shield.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
  }
  p.inventory.version++;
}

/**
 * vanilla LivingEntity.blockUsingShield → the attacker's blockedByShield, and Player's: an axe knocks the shield
 * down. (vanilla's own blockedByShield knocks the defender half a block's push towards the attacker; a player's
 * client never hears of it, since a blocked hit doesn't mark them hurt, so it isn't done here; the ravager has its
 * own, entity/ravager.ts)
 */
function blockUsingShield(p: Player, attacker: LivingEntity): void {
  (attacker as { blockedByShield?: (defender: LivingEntity) => void }).blockedByShield?.(p);
  if (canDisableShield(attacker)) disableShield(p);
}

/**
 * Called by LivingEntity.hurt with the damage after the difficulty's say: true when a raised shield takes the hit
 * (the shield has worn and the attacker has been dealt with; the hit goes on at 0)
 */
export function shieldTakesHit(e: LivingEntity, amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
  // (vanilla DamageSource: one entity doing it itself is both the direct and the causing entity)
  const d = direct ?? attacker ?? null;
  const p = asPlayer(e);
  if (!p || !isDamageSourceBlocked(e, source, d)) return false;
  hurtCurrentlyUsedShield(p, amount);
  if (!PROJECTILE.has(source) && d && typeof (d as LivingEntity).knockback === 'function') blockUsingShield(p, d as LivingEntity);
  return true;
}

/**
 * The end of LivingEntity.hurt for a blocked hit past the invulnerability frames: entity event 29 (the thud of the
 * shield) in place of the damage event, so no knockback, no hurt sound, no red flash; a projectile blocked counts
 * for vanilla entity_hurt_player ("Not Today, Thank You"). Nothing was hurt: false
 */
export function shieldBlocked(e: LivingEntity, source: string): false {
  e.level.sound.play('item.shield.block', e.x, e.y, e.z, 1, 0.8 + Math.random() * 0.4);
  const p = asPlayer(e);
  if (p && PROJECTILE.has(source)) e.level.onPlayerTrigger?.(p, 'deflected_projectile');
  return false;
}
