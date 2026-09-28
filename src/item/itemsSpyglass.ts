// (spyglass) The spyglass's item (vanilla Items.SPYGLASS, SpyglassItem: what it does is game/spyglass.ts's): one to a
// stack, drawn as its sprite in the inventory, on the ground and in a frame and as its model in the hand
// (render/spyglassRenderer.ts), listed with the tools after the clock (vanilla CreativeModeTabs.TOOLS_AND_UTILITIES).

import type { Item } from './item';

type Reg = (i: Partial<Item> & { id: string }) => Item;

export function registerSpyglassItem(reg: Reg, list: Item[]): void {
  const it = reg({ id: 'spyglass', maxStack: 1, creativeTab: 'tools', texture: 'spyglass' });
  list.splice(list.indexOf(it), 1);
  const clock = list.findIndex((x) => x.id === 'clock');
  list.splice(clock >= 0 ? clock + 1 : list.length, 0, it);
}
