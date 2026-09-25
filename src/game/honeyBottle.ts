// (trial chambers) The honey bottle (vanilla HoneyBottleItem), here because the vaults give it: drunk over two seconds
// (full or not) in slurps of its own (item.honey_bottle.drink, its drinking and eating sound), it's 6 food and a
// little saturation, cures poison, and leaves its glass bottle.

import { registerItemBehavior } from './itemBehavior';
import { ItemStack } from '../item/item';

/** vanilla HoneyBottleItem.DRINK_DURATION */
const DRINK_TICKS = 40;

registerItemBehavior('honey_bottle', {
  // vanilla HoneyBottleItem.use (ItemUtils.startUsingInstantly): it's drunk whether the player's hungry or not
  use(_level, p, stack) {
    p.startUsingItem(stack, DRINK_TICKS);
    return 'success';
  },
  useAnim: 'drink',
  drinkSound: 'item.honey_bottle.drink',
  /**
   * vanilla HoneyBottleItem.finishUsingItem: eaten as food (Player.eat: the food, the burp, the honey's slurp), poison
   * gone, and the glass bottle back (in the hand if that was the last, else in the inventory, or dropped)
   */
  finishUsing(level, p) {
    p.food.eat(6, 0.1);
    level.sound.play('entity.player.burp', p.x, p.y, p.z, 0.5, Math.random() * 0.1 + 0.9);
    level.sound.play('item.honey_bottle.drink', p.x, p.y, p.z, 1, 1 + (Math.random() - Math.random()) * 0.4);
    p.removeEffect('poison');
    if (p.gameMode === 'creative') return;
    p.inventory.consumeSelected(1);
    const bottle = ItemStack.of('glass_bottle');
    if (!p.inventory.selectedItem) p.inventory.setSelectedItem(bottle);
    else if (p.inventory.add(bottle) > 0) p.dropItem(bottle, false);
  },
});
