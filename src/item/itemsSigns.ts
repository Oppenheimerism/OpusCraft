// (signs) The sign and hanging sign items of every wood (vanilla SignItem and HangingSignItem, made with the rest from
// world/blocksSigns.ts): sixteen to a stack, drawn as their sprites, listed in the functional blocks tab each sign
// before its hanging sign (vanilla CreativeModeTabs.FUNCTIONAL_BLOCKS), and burning in a furnace as long as a sign
// (200 ticks) or a hanging sign (800) does, except the nether woods', which don't burn (vanilla #non_flammable_wood).
// They take the sign's place in the item list, where the oak sign was.

import type { Item } from './item';
import { SIGN_WOODS } from '../world/blocksSigns';

type Reg = (i: Partial<Item> & { id: string }) => Item;

/** the signs and hanging signs, in vanilla's creative order */
export const SIGN_ITEM_ORDER: readonly string[] = SIGN_WOODS.flatMap((w) => [`${w}_sign`, `${w}_hanging_sign`]);

export function registerSignItems(_reg: Reg, items: Map<string, Item>, list: Item[]): void {
  for (const w of SIGN_WOODS) {
    const nether = w === 'crimson' || w === 'warped';
    for (const [id, fuel] of [[`${w}_sign`, 200], [`${w}_hanging_sign`, 800]] as const) {
      const it = items.get(id);
      if (!it) continue;
      Object.assign(it, { texture: id, maxStack: 16, creativeTab: 'functional', fuel: nether ? undefined : fuel });
    }
  }
  // (in the list, all together where the oak sign's block item fell)
  const its = SIGN_ITEM_ORDER.map((id) => items.get(id)).filter((i): i is Item => !!i);
  const at = Math.min(...its.map((i) => list.indexOf(i)).filter((i) => i >= 0));
  for (const it of its) list.splice(list.indexOf(it), 1);
  if (Number.isFinite(at)) list.splice(Math.min(at, list.length), 0, ...its);
}
