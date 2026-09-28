// (remaining mobs) The items that come with the mobs added on the remaining-mobs branch, and where vanilla's creative
// tabs list them. The bee: its spawn egg; the bee nest and the beehive with the functional blocks; the honeycomb block
// and the honey block with the natural blocks after the hay bale (vanilla CreativeModeTabs.NATURAL_BLOCKS: hay, bee
// nest, honeycomb block, slime block, honey block; an item here has one tab, so the nest's place among the natural
// blocks and the honey block's among the redstone ones are gui/screens/creative.ts's). The honeycomb and the honey
// bottle came with the trial chambers (itemsTrialChambers.ts); the bottle is its crafting remainder. The phantom: its
// spawn egg. The panda: its spawn egg; bamboo (the stalk's block item, which plants a shoot on the ground) drawn flat,
// with the natural blocks before sugar cane, burning for 50 ticks.

import type { Item } from './item';

type Reg = (i: Partial<Item> & { id: string }) => Item;

export function registerRemainingMobItems(reg: Reg, items: Map<string, Item>, list: Item[]): void {
  const take = (id: string): Item | null => {
    const i = list.findIndex((x) => x.id === id);
    return i < 0 ? null : list.splice(i, 1)[0];
  };
  const after = (id: string, prev: string): void => {
    if (!items.has(prev)) return;
    const it = take(id);
    if (it) list.splice(list.indexOf(items.get(prev)!) + 1, 0, it);
  };
  const before = (id: string, next: string): void => {
    if (!items.has(next)) return;
    const it = take(id);
    if (it) list.splice(list.indexOf(items.get(next)!), 0, it);
  };

  // --- the bee
  reg({ id: 'bee_spawn_egg', texture: 'bee_spawn_egg', creativeTab: 'spawn_eggs' });
  for (const id of ['bee_nest', 'beehive']) if (items.has(id)) items.get(id)!.creativeTab = 'functional';
  for (const id of ['honeycomb_block', 'honey_block']) if (items.has(id)) items.get(id)!.creativeTab = 'natural';
  after('honeycomb_block', 'hay_block');
  after('honey_block', 'honeycomb_block');
  // vanilla Items.HONEY_BOTTLE: craftRemainder(GLASS_BOTTLE), the bottle left in the grid by the honey block's and the
  // sugar's recipes
  if (items.has('honey_bottle')) items.get('honey_bottle')!.remainder = 'glass_bottle';

  // --- the phantom (its membrane was already here: a cat's morning gift, the slow falling brew, the elytra's repair on an anvil)
  reg({ id: 'phantom_spawn_egg', texture: 'phantom_spawn_egg', creativeTab: 'spawn_eggs' });

  // --- the panda
  reg({ id: 'panda_spawn_egg', texture: 'panda_spawn_egg', creativeTab: 'spawn_eggs' });
  // vanilla Items.BAMBOO: the bamboo block's item (item/bamboo, a flat sprite); in CreativeModeTabs.NATURAL_BLOCKS after
  // the spore blossom, before sugar cane; AbstractFurnaceBlockEntity's fuel, 50 ticks (a quarter of an item smelted)
  const bamboo = items.get('bamboo');
  if (bamboo) {
    Object.assign(bamboo, { texture: 'bamboo', creativeTab: 'natural', fuel: 50 });
    before('bamboo', 'sugar_cane');
  }
}
