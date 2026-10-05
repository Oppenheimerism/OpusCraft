// (the wither) The items it brings: the nether star it drops (vanilla Items.NETHER_STAR, a SimpleFoiledItem: uncommon,
// with the enchantment glint, and proof against explosions as an item on the ground, entity/itemEntity.ts), after the
// heavy core where CreativeModeTabs.INGREDIENTS lists it; and its spawn egg (vanilla Items.WITHER_SPAWN_EGG, dark grey
// with blue-grey spots), which vanilla keeps out of the creative inventory (/give has it). The wither rose's item is
// its block's (world/blocksWither.ts), placed after the lily of the valley as CreativeModeTabs.NATURAL_BLOCKS has it.

import type { Item } from './item';

type Reg = (i: Partial<Item> & { id: string }) => Item;

export function registerWitherItems(reg: Reg, items: Map<string, Item>, list: Item[]): void {
  const take = (id: string): Item | null => {
    const i = list.findIndex((x) => x.id === id);
    return i < 0 ? null : list.splice(i, 1)[0];
  };
  const after = (id: string, prev: string): void => {
    if (!items.has(prev)) return;
    const it = take(id);
    if (it) list.splice(list.indexOf(items.get(prev)!) + 1, 0, it);
  };

  reg({ id: 'nether_star', texture: 'nether_star', rarity: 'uncommon', glint: true });
  after('nether_star', 'heavy_core');
  // (creativeTab 'none': in no tab, gui/screens/creative.ts)
  reg({ id: 'wither_spawn_egg', texture: 'wither_spawn_egg', creativeTab: 'none' });
  // the wither rose, a flower among the flowers
  // (vanilla models/item/wither_rose.json: item/generated with block/wither_rose, as every flower)
  if (items.has('wither_rose')) {
    Object.assign(items.get('wither_rose')!, { creativeTab: 'natural', texture: 'block:wither_rose' });
    after('wither_rose', 'lily_of_the_valley');
  }
  // (the beacon) vanilla Items.BEACON: rare (its name aqua), in the functional blocks (after the bell: gui/screens/creative.ts)
  if (items.has('beacon')) Object.assign(items.get('beacon')!, { rarity: 'rare', creativeTab: 'functional' });
}
