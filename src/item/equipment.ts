// What goes in which equipment slot (vanilla Equipable, LivingEntity.getEquipmentSlotForItem), the armour
// materials (vanilla ArmorMaterials: textures and equip sounds) and Mob.getEquipmentForSlot.

import type { Item } from './item';
import type { EquipSlot } from './enchantHelper';
import { isSkullItem } from '../world/blocksSkulls';

export type ArmorSlot = 'feet' | 'legs' | 'chest' | 'head';
/** vanilla EquipmentSlot armour indices: the player's inventory.armor and a mob's armorItems use the same order */
export const ARMOR_SLOTS: readonly ArmorSlot[] = ['feet', 'legs', 'chest', 'head'];

export function armorIndex(slot: ArmorSlot): number {
  return ARMOR_SLOTS.indexOf(slot);
}

export function isArmorSlot(slot: EquipSlot): slot is ArmorSlot {
  return slot === 'feet' || slot === 'legs' || slot === 'chest' || slot === 'head';
}

/** vanilla ArmorMaterials by item prefix (the texture is textures/models/armor/<material>_layer_1/2) */
const MATERIAL_OF: Record<string, string> = { leather: 'leather', chainmail: 'chainmail', iron: 'iron', golden: 'gold', diamond: 'diamond', netherite: 'netherite', turtle: 'turtle' };

/** an armour item's material name (vanilla ArmorMaterial.layers' asset id), or null */
export function armorMaterial(it: Item): string | null {
  if (!it.armor) return null;
  return MATERIAL_OF[it.id.slice(0, it.id.indexOf('_'))] ?? null;
}

/** vanilla ArmorMaterial.equipSound */
const EQUIP_SOUND: Record<string, string> = {
  leather: 'item.armor.equip_leather',
  chainmail: 'item.armor.equip_chain',
  iron: 'item.armor.equip_iron',
  gold: 'item.armor.equip_gold',
  diamond: 'item.armor.equip_diamond',
  netherite: 'item.armor.equip_netherite',
  turtle: 'item.armor.equip_turtle',
};

/**
 * vanilla Equipable.get(stack): armour goes on its own slot, and a carved pumpkin (a jack o'lantern is one too:
 * vanilla CarvedPumpkinBlock) and a mob head (vanilla AbstractSkullBlock) on the head; everything else is null
 */
export function equipableSlot(it: Item): ArmorSlot | null {
  if (it.armor) return it.armor.slot;
  if (it.id === 'carved_pumpkin' || it.id === 'jack_o_lantern') return 'head';
  if (isSkullItem(it.id)) return 'head';
  // (vanilla ElytraItem is Equipable: the chest)
  if (it.id === 'elytra') return 'chest';
  return null;
}

/** vanilla LivingEntity.getEquipmentSlotForItem: the equipable's slot (a shield's the offhand), else the main hand */
export function equipmentSlotForItem(it: Item): EquipSlot {
  if (it.id === 'shield') return 'offhand';
  return equipableSlot(it) ?? 'mainhand';
}

/** vanilla Equipable.getEquipSound: the material's, the generic one for the rest (a carved pumpkin) */
export function equipSound(it: Item): string | null {
  if (!equipableSlot(it)) return null;
  if (it.id === 'elytra') return 'item.armor.equip_elytra';
  const m = armorMaterial(it);
  return (m && EQUIP_SOUND[m]) || 'item.armor.equip_generic';
}

/** vanilla Mob.getEquipmentForSlot: tier 0 leather, 1 gold, 2 chainmail, 3 iron, 4 diamond */
const TIERS = ['leather', 'golden', 'chainmail', 'iron', 'diamond'];
const PIECE: Record<ArmorSlot, string> = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' };

export function equipmentForSlot(slot: ArmorSlot, tier: number): string | null {
  const m = TIERS[tier];
  return m ? `${m}_${PIECE[slot]}` : null;
}
