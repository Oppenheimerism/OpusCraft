// (cake) The cake's item (vanilla Items.CAKE, made with the rest from its block, world/blocksCake.ts): one to a stack,
// drawn as its sprite, with the food and drinks after the cookie (vanilla CreativeModeTabs.FOOD_AND_DRINKS). The candle
// cakes have none of their own: they pick as a cake. And a milk bucket used in crafting (the cake's recipe) leaves its
// bucket behind (vanilla Items.MILK_BUCKET's craftRemainder).

import type { Item } from './item';

export function registerCakeItems(items: Map<string, Item>, list: Item[]): void {
  const cake = items.get('cake');
  if (cake) {
    Object.assign(cake, { texture: 'cake', maxStack: 1, creativeTab: 'food' });
    list.splice(list.indexOf(cake), 1);
    const cookie = list.findIndex((x) => x.id === 'cookie');
    list.splice(cookie >= 0 ? cookie + 1 : list.length, 0, cake);
  }
  const milk = items.get('milk_bucket');
  if (milk) milk.remainder = 'bucket';
}
