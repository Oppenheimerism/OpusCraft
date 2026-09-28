// (armour stand) The armour stand's item (vanilla Items.ARMOR_STAND, ArmorStandItem: what it does is
// entity/armorStand.ts's): sixteen to a stack, drawn as its sprite, listed with the functional blocks (vanilla
// CreativeModeTabs.FUNCTIONAL_BLOCKS, after the decorated pot: gui/screens/creative.ts's order).

import type { Item } from './item';

type Reg = (i: Partial<Item> & { id: string }) => Item;

export function registerArmorStandItem(reg: Reg): void {
  reg({ id: 'armor_stand', maxStack: 16, creativeTab: 'functional', texture: 'armor_stand' });
}
