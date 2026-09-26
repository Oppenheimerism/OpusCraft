// Enchantment effects that act on entities after a hit (vanilla 1.21 EnchantmentHelper.doPostAttackEffects /
// doPostAttackEffectsWithItemSource and the post_attack components of thorns, fire aspect and bane of
// arthropods).

import type { Entity } from '../entity/entity';
import type { Level } from './level';
import { LivingEntity } from '../entity/living';
import { LightningBolt } from '../entity/lightning';
import { MobEffectInstance, MOB_EFFECTS } from '../entity/effects';
import type { ItemStack } from '../item/item';
import { baneSlowness, fireAspectSeconds, thornsPieces, levelOf } from '../item/enchantHelper';

const ARMOR_INDEX: Record<string, number> = { feet: 0, legs: 1, chest: 2, head: 3 };

interface ArmorWearer {
  damageArmorSlot(i: number, amount: number): void;
}

/**
 * After `victim` took damage caused by `attacker` (the shooter for arrows): each piece of the victim's armour
 * with thorns (15% per level, rolled per piece) deals 1-5 thorns damage to the attacker and loses 2 more
 * durability; then the attacker's weapon, on a direct melee hit, sets the victim alight (fire aspect, 4 s per
 * level) and slows arthropods (bane of arthropods: slowness IV for 1.5 to 1.5 + 0.5·(L-1) s).
 */
export function doPostAttackEffects(victim: Entity, attacker: Entity | null, weapon: ItemStack | null, direct: boolean): void {
  if (victim instanceof LivingEntity) {
    for (const [slot, , level] of thornsPieces(victim)) {
      if (Math.fround(Math.random()) >= Math.fround(0.15 * level) || !attacker) continue;
      attacker.hurt(Math.fround(Math.random() * 4 + 1), 'thorns', victim, victim);
      (victim as unknown as Partial<ArmorWearer>).damageArmorSlot?.(ARMOR_INDEX[slot], 2);
    }
  }
  if (!weapon || !direct || !(attacker instanceof LivingEntity)) return;
  const fire = fireAspectSeconds(weapon);
  if (fire > 0) victim.igniteForSeconds(fire);
  if (victim instanceof LivingEntity) {
    const ticks = baneSlowness(weapon, victim);
    if (ticks !== null) victim.addEffect(new MobEffectInstance(MOB_EFFECTS['slowness'], ticks, 3), attacker);
  }
}

/**
 * vanilla channeling's post_attack effect: a trident with it that strikes something under the open sky during a
 * thunderstorm calls lightning down on it (its thrower, if a player, is the bolt's cause) with a clap of thunder
 */
export function channel(level: Level, victim: Entity, owner: Entity | null, weapon: ItemStack): void {
  if (levelOf(weapon, 'channeling') <= 0 || !level.isThundering()) return;
  if (!level.canSeeSky(Math.floor(victim.x), Math.floor(victim.y), Math.floor(victim.z))) return;
  const bolt = new LightningBolt(level);
  bolt.moveTo(victim.x, victim.y, victim.z, 0, 0);
  if (owner?.type === 'player') bolt.cause = owner;
  level.addEntity(bolt);
  level.sound.play('item.trident.thunder', victim.x, victim.y, victim.z, 5, 1);
}
