// Desert wells in the running game (the well itself is world/gen/desertWell.ts): what the two suspicious sand under
// its water hold, brushed out as the desert pyramid's are (game/archaeology.ts), and the suspicious stew that may be
// one of them. Eaten, a suspicious stew gives what it holds (a few seconds of night vision, jump boost, weakness,
// blindness or poison, or a little saturation) besides filling you as a mushroom stew does, and leaves its bowl.

import { ItemStack } from '../item/item';
import { MOB_EFFECTS, MobEffectInstance } from '../entity/effects';
import { LOOT_TABLES } from './loot';
import { registerItemBehavior } from './itemBehavior';

/** vanilla loot_table/archaeology/desert_well */
LOOT_TABLES['archaeology/desert_well'] = [
  {
    rolls: 1,
    entries: [
      { item: 'arms_up_pottery_sherd', weight: 2 }, { item: 'brewer_pottery_sherd', weight: 2 }, { item: 'brick', weight: 1 },
      { item: 'emerald', weight: 1 }, { item: 'stick', weight: 1 },
      {
        item: 'suspicious_stew', weight: 1,
        stewEffects: [['night_vision', 7, 10], ['jump_boost', 7, 10], ['weakness', 6, 8], ['blindness', 5, 7], ['poison', 10, 20], ['saturation', 7, 10]],
      },
    ],
  },
];

// vanilla SuspiciousStewItem.finishUsingItem: its effects, then eaten as a stew (Item.finishUsingItem), the bowl back
registerItemBehavior('suspicious_stew', {
  finishUsing(level, p, s) {
    for (const e of s.tag?.stewEffects ?? []) {
      const fx = MOB_EFFECTS[e.id];
      if (fx) p.addEffect(new MobEffectInstance(fx, e.duration, 0));
    }
    const food = s.item.food!;
    p.food.eat(food.nutrition, food.saturation);
    level.sound.play('entity.player.burp', p.x, p.y, p.z, 0.5, Math.random() * 0.1 + 0.9);
    if (p.gameMode === 'creative') return;
    p.inventory.consumeSelected(1);
    const bowl = ItemStack.of('bowl');
    if (!p.inventory.selectedItem) p.inventory.setSelectedItem(bowl);
    else if (p.inventory.add(bowl) > 0) p.dropItem(bowl, false);
  },
});
