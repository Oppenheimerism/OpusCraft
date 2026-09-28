// (remaining mobs: the armadillo) Wolf armour (vanilla 1.21 AnimalArmorItem(ARMADILLO, CANINE) on a Wolf's body slot,
// and Crackiness.WOLF_ARMOR). Made from six armadillo scutes, it's put on a tame wolf by its owner (or a dispenser),
// one to a grown wolf, with its equip sound; shears take it off again (its unequip sound, one wear on the shears);
// and an armadillo scute held to the owner's sitting wolf mends an eighth of it (its repair sound). On the wolf it
// takes every blow in the wolf's place (the wolf is hurt not at all, and makes the armour's damage sound, not its
// hurt), a point of wear for each point of the blow, rounded up (falls, fire and lava included), save for what no shell
// keeps out: drowning, suffocating, cramming, drying out, freezing, starving, magic, the wither, thorns, the void, /kill
// and the world border (vanilla #bypasses_wolf_armor), which the wolf takes, less for the armour's 11 points where
// armour counts at all. It cracks as it wears (at under 95%, 69% and 32% left, a crack sound and a spray of scute chips
// each time) and breaks at the end (its break sound). It drops, as it was, when the wolf dies. Dyed, its overlay takes
// the colour (the crafting grid's dyeing, washed off in a cauldron). Drawn by render/wolfArmorLayer.ts.

import type { Wolf } from './wolf';
import type { Player } from './player';
import { ItemStack } from '../item/item';
import { hasBinding, hasVanishing, hurtAndBreak } from '../item/enchantHelper';
import { equipEvent } from '../game/vibrations';

/** vanilla ArmorMaterials.ARMADILLO's defense for the body (ArmorItem.Type.BODY) */
export const WOLF_ARMOR_DEFENSE = 11;

/**
 * vanilla #bypasses_wolf_armor: #bypasses_invulnerability (the void, /kill), cramming, drowning, drying out, freezing,
 * suffocating in a wall, magic and indirect magic, the world border, starving, thorns and the wither. Everything else
 * (blows, arrows, blasts, falls, fire and lava, cactus, lightning...) the armour takes
 */
const BYPASSES_WOLF_ARMOR: ReadonlySet<string> = new Set([
  'void', 'genericKill', 'cramming', 'drown', 'dryOut', 'freeze', 'inWall', 'indirectMagic', 'magic', 'outsideBorder', 'starve', 'thorns', 'wither',
]);

/** whether damage of this kind gets past wolf armour (to the wolf) */
export function bypassesWolfArmor(source: string): boolean {
  return BYPASSES_WOLF_ARMOR.has(source);
}

/** vanilla Crackiness.Level */
export type Crackiness = 'none' | 'low' | 'medium' | 'high';

/**
 * vanilla Crackiness.WOLF_ARMOR (0.95, 0.69, 0.32).byDamage: how cracked it looks, from the share of its uses left
 * (anything that doesn't wear: none)
 */
export function wolfArmorCrackiness(s: ItemStack | null): Crackiness {
  const max = s?.item.maxDamage ?? 0;
  if (!s || max <= 0) return 'none';
  const f = Math.fround((max - s.damage) / max);
  if (f < Math.fround(0.32)) return 'high';
  if (f < Math.fround(0.69)) return 'medium';
  return f < Math.fround(0.95) ? 'low' : 'none';
}

/** vanilla Wolf.isBodyArmorItem: canine body armour (wolf armour) */
export function isWolfArmor(s: ItemStack | null): boolean {
  return s?.item.id === 'wolf_armor';
}

/**
 * vanilla Mob.setBodyArmorItem (setItemSlotAndDropWhenKilled(BODY, …)): put on (or taken off), the wolf kept from
 * despawning, the armour's equip sound when something new goes on (not as it spawns or loads: vanilla firstTick), and
 * the equip or unequip vibration
 */
export function setWolfArmor(w: Wolf, s: ItemStack | null): void {
  const was = w.bodyArmor;
  const cur = s && s.count > 0 ? s : null;
  w.bodyArmor = cur;
  w.persistenceRequired = true;
  equipEvent(w, was, cur);
  if (cur && !(was && was.sameItem(cur)) && w.tickCount > 0) w.playSound('item.armor.equip_wolf', 1, 1);
}

/** a wolf's owner and their tool: the tool's wear (vanilla hurtAndBreak with the hand's slot: its break heard) */
function wearHeld(p: Player, stack: ItemStack): void {
  if (hurtAndBreak(stack, 1, p.gameMode === 'creative')) {
    p.inventory.setSelectedItem(null);
    p.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
  }
  p.inventory.version++;
}

/**
 * vanilla Wolf.mobInteract's body armour, for a tame wolf: wolf armour on a grown one of the owner's wearing none
 * (one of the stack, spent unless in creative); shears on the owner's wearing some take it off unless it's cursed
 * with binding (in creative, even then); a scute on the owner's sitting wolf wearing worn armour mends an eighth of it
 * (vanilla shrink: spent even in creative). True if one of them took the click
 */
export function wolfArmorInteract(w: Wolf, p: Player, stack: ItemStack | null): boolean {
  if (!stack || !w.isOwnedBy(p)) return false;
  const id = stack.item.id;
  const creative = p.gameMode === 'creative';
  if (id === 'wolf_armor' && !w.bodyArmor && !w.isBaby()) {
    setWolfArmor(w, stack.copyWithCount(1));
    if (!creative) p.inventory.consumeSelected(1);
    return true;
  }
  if (id === 'shears' && w.bodyArmor && (!hasBinding(w.bodyArmor) || creative)) {
    wearHeld(p, stack);
    w.playSound('item.armor.unequip_wolf', 1, 1);
    const armor = w.bodyArmor;
    setWolfArmor(w, null);
    w.spawnAtLocation(armor);
    return true;
  }
  const armor = w.bodyArmor;
  if (id === 'armadillo_scute' && w.inSittingPose && armor && armor.damage > 0) {
    stack.count--;
    if (stack.count <= 0) p.inventory.setSelectedItem(null);
    p.inventory.version++;
    w.playSound('item.wolf_armor.repair', 1, 1);
    armor.damage = Math.max(0, armor.damage - Math.trunc(armor.item.maxDamage * 0.125));
    return true;
  }
  return false;
}

/** vanilla Wolf.canArmorAbsorb: it wears armour, and the damage is of a kind the armour stops */
export function wolfArmorCanAbsorb(w: Wolf, source: string): boolean {
  return !!w.bodyArmor && !bypassesWolfArmor(source);
}

/** the chips of scute a crack sends up (vanilla sendParticles(ITEM armadillo_scute, 20, 0.2, 0.1, 0.2, 0.1)) */
function scuteChips(w: Wolf): void {
  const r = w.random;
  for (let i = 0; i < 20; i++) {
    w.level.particles.spawn?.('item_armadillo_scute', w.x + r.gaussian() * 0.2, w.y + 1 + r.gaussian() * 0.1, w.z + r.gaussian() * 0.2, r.gaussian() * 0.1, r.gaussian() * 0.1, r.gaussian() * 0.1);
  }
}

/**
 * vanilla LivingEntity.spawnItemParticles(stack, 5) (breakItem): pieces of it flying off in front of its face, up and
 * away along its look
 */
function brokenPieces(w: Wolf, particle: string): void {
  const r = w.random, DEG = Math.PI / 180;
  const cp = Math.cos(-w.pitch * DEG), sp = Math.sin(-w.pitch * DEG), cy = Math.cos(-w.yaw * DEG), sy = Math.sin(-w.yaw * DEG);
  // (vanilla Vec3.xRot, then yRot)
  const turn = (x: number, y: number, z: number): [number, number, number] => {
    const y1 = y * cp + z * sp, z1 = z * cp - y * sp;
    return [x * cy + z1 * sy, y1, z1 * cy - x * sy];
  };
  for (let i = 0; i < 5; i++) {
    const v = turn((r.nextFloat() - 0.5) * 0.1, Math.random() * 0.1 + 0.1, 0);
    const d = -r.nextFloat() * 0.6 - 0.3;
    const p = turn((r.nextFloat() - 0.5) * 0.3, d, 0.6);
    w.level.particles.spawn?.(particle, w.x + p[0], w.y + w.eyeHeight + p[1], w.z + p[2], v[0], v[1] + 0.05, v[2]);
  }
}

/**
 * vanilla Wolf.actuallyHurt when the armour can take it: the armour wears the blow's points rounded up (unbreaking
 * helping), breaking at the end (its break sound, five pieces of it: LivingEntity.breakItem); cracked further than it
 * was, a crack and a spray of scute chips. True if it did (the wolf itself untouched)
 */
export function wolfArmorAbsorb(w: Wolf, source: string, amount: number): boolean {
  const a = w.bodyArmor;
  if (!a || !wolfArmorCanAbsorb(w, source)) return false;
  const before = wolfArmorCrackiness(a);
  const r = w.random;
  if (hurtAndBreak(a, Math.ceil(amount), false, () => r.nextFloat())) {
    w.playSound('item.wolf_armor.break', 0.8, 0.8 + r.nextFloat() * 0.4);
    brokenPieces(w, 'item_wolf_armor');
    setWolfArmor(w, null);
  }
  if (wolfArmorCrackiness(w.bodyArmor) !== before) {
    w.playSound('item.wolf_armor.crack', 1, 1);
    scuteChips(w);
  }
  return true;
}

/**
 * (vanilla Mob.dropCustomDeathLoot, the body slot's sure drop) the armour falls as it was when the wolf dies (unless
 * cursed with vanishing)
 */
export function dropWolfArmor(w: Wolf): void {
  const a = w.bodyArmor;
  if (!a) return;
  if (!hasVanishing(a)) w.spawnAtLocation(a);
  w.bodyArmor = null;
}
