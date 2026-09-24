// The potion items in use (vanilla PotionItem, SplashPotionItem, LingeringPotionItem, BottleItem): drinking a potion,
// throwing a splash or lingering one, filling a glass bottle at water, pouring a water bottle on dirt to make mud.

import { registerItemBehavior } from './itemBehavior';
import type { Level } from './level';
import type { Player } from '../entity/player';
import { ItemStack } from '../item/item';
import { allEffects, contentsOf, potionStack } from '../item/potions';
import { ThrownPotion } from '../entity/thrownPotion';
import { raycast } from './raycast';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, S } from '../world/block';
import { fillHeld } from './villageBlocks';

/** vanilla PotionItem.getUseDuration */
export const DRINK_TICKS = 32;

/** vanilla ItemUtils.startUsingInstantly: sip away until it's drunk */
function startDrinking(_level: Level, p: Player, stack: ItemStack): 'success' {
  p.startUsingItem(stack, DRINK_TICKS);
  return 'success';
}

/**
 * vanilla PotionItem.finishUsingItem: its effects (instant ones at once), one used up and an empty bottle back (the
 * bottle takes the potion's place, or goes in the inventory, or is lost when that's full), neither in creative
 */
function finishDrinking(_level: Level, p: Player, stack: ItemStack): void {
  for (const e of allEffects(contentsOf(stack))) {
    if (e.effect.instant) e.effect.applyInstant(p, p, p, e.amplifier, 1);
    else p.addEffect(e);
  }
  if (p.gameMode === 'creative') return;
  stack.count--;
  const inv = p.inventory;
  if (stack.count <= 0) inv.setSelectedItem(ItemStack.of('glass_bottle'));
  else inv.add(ItemStack.of('glass_bottle'));
}

registerItemBehavior('potion', {
  // vanilla PotionItem.useOn: a water bottle poured on dirt (not from below) makes mud
  useOn(level, p, stack, hit) {
    const name = BLOCKS[STATE_BLOCK[hit.state]].name;
    if (hit.face === 0 || contentsOf(stack)?.potion !== 'water' || !(name === 'dirt' || name === 'coarse_dirt' || name === 'rooted_dirt')) return 'pass';
    const { x, y, z } = hit;
    level.sound.play('entity.generic.splash', x + 0.5, y + 0.5, z + 0.5, 1, 1);
    fillHeld(p, ItemStack.of('glass_bottle'));
    for (let i = 0; i < 5; i++) level.particles.spawn?.('splash', x + Math.random(), y + 1, z + Math.random(), 0, 0, 0);
    level.sound.play('item.bottle.empty', x + 0.5, y + 0.5, z + 0.5, 1, 1);
    level.setBlock(x, y, z, S('mud'));
    p.swing();
    return 'success';
  },
  use: startDrinking,
  useAnim: 'drink',
  finishUsing: finishDrinking,
});

/** vanilla ThrowablePotionItem.use: thrown from the eye, 20° up, at half a snowball's speed; one used up but in creative */
function throwPotion(sound: string) {
  return (level: Level, p: Player, stack: ItemStack): 'success' => {
    level.sound.play(sound, p.x, p.y, p.z, 0.5, 0.4 / (Math.random() * 0.4 + 0.8));
    const t = new ThrownPotion(level, p, stack.copyWithCount(1));
    t.shootFromRotation(p, p.pitch, p.yaw, -20, 0.5, 1);
    level.addEntity(t);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    p.swing();
    return 'success';
  };
}
registerItemBehavior('splash_potion', { use: throwPotion('entity.splash_potion.throw') });
registerItemBehavior('lingering_potion', { use: throwPotion('entity.lingering_potion.throw') });

/** hooks for what the game has elsewhere: bottling the dragon's breath (the End's AreaEffectCloud) */
export const BOTTLE_HOOKS: { dragonBreath: ((level: Level, p: Player) => boolean) | null } = { dragonBreath: null };

// vanilla BottleItem.use: the dragon's breath if there's a cloud of it about, else water where the eye meets a source
registerItemBehavior('glass_bottle', {
  use(level, p) {
    if (BOTTLE_HOOKS.dragonBreath?.(level, p)) {
      level.sound.play('item.bottle.fill_dragonbreath', p.x, p.y, p.z, 1, 1);
      fillHeld(p, ItemStack.of('dragon_breath'));
      p.swing();
      return 'success';
    }
    const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
    // (vanilla Item.getPlayerPOVHitResult: out to the block interaction range)
    const reach = p.gameMode === 'creative' ? 5 : 4.5;
    const h = raycast(level.world, p.x, p.y + p.eyeHeight, p.z, -Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr), reach, true);
    // (vanilla ClipContext.Fluid.SOURCE_ONLY: water that flows is looked through; a waterlogged block holds a source)
    if (!h || !(FLAGS[h.state] & F_WATER) || !isWaterSource(h.state)) return 'pass';
    level.sound.play('item.bottle.fill', p.x, p.y, p.z, 1, 1);
    fillHeld(p, potionStack('potion', 'water'));
    p.swing();
    return 'success';
  },
});

function isWaterSource(st: number): boolean {
  const b = BLOCKS[STATE_BLOCK[st]];
  return b.name !== 'water' || b.get<number>(st, 'level') === 0;
}
