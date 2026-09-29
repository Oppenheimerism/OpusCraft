// (minecarts) The hopper, TNT and furnace minecarts' items (vanilla MinecartItem: one to a stack, put on a rail by
// game/interaction.ts, set on one by a dispenser), and the powered, detector and activator rails' (drawn flat as
// their block's texture, as vanilla's item/generated rail models are). In the Tools & Utilities tab they come after
// the boats, as vanilla lists them: the rail, powered, detector and activator rails, then the minecart, hopper,
// chest, furnace and TNT minecarts (gui/screens/creative.ts lists them with the redstone blocks too).

import type { Item } from './item';

type Reg = (i: Partial<Item> & { id: string }) => Item;

/** vanilla CreativeModeTabs.TOOLS_AND_UTILITIES, after the boats */
export const RAIL_AND_MINECART_ORDER = ['rail', 'powered_rail', 'detector_rail', 'activator_rail', 'minecart', 'hopper_minecart', 'chest_minecart', 'furnace_minecart', 'tnt_minecart'];

export function registerMinecartItems(reg: Reg, items: Map<string, Item>, list: Item[]): void {
  reg({ id: 'hopper_minecart', name: 'Minecart with Hopper', texture: 'hopper_minecart', maxStack: 1, creativeTab: 'tools' });
  reg({ id: 'tnt_minecart', name: 'Minecart with TNT', texture: 'tnt_minecart', maxStack: 1, creativeTab: 'tools' });
  reg({ id: 'furnace_minecart', name: 'Minecart with Furnace', texture: 'furnace_minecart', maxStack: 1, creativeTab: 'tools' });
  for (const id of ['powered_rail', 'detector_rail', 'activator_rail']) {
    const it = items.get(id);
    if (it) Object.assign(it, { texture: `block:${id}`, creativeTab: 'tools' });
  }
  // after the last boat (or raft), in vanilla's order
  const moving = RAIL_AND_MINECART_ORDER.map((id) => items.get(id)).filter((it): it is Item => !!it);
  for (const it of moving) list.splice(list.indexOf(it), 1);
  let at = -1;
  list.forEach((it, i) => {
    if (/_(boat|raft)$/.test(it.id)) at = i;
  });
  list.splice(at >= 0 ? at + 1 : list.length, 0, ...moving);
}
