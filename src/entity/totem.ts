// The totem of undying (vanilla LivingEntity.checkTotemDeathProtection): held in either hand when a blow would kill,
// it's used up instead — the holder is left on half a heart with its effects cleared, then given regeneration II
// (45 s), absorption II (5 s) and fire resistance (40 s). Green and gold sparkles burst from it and it plays its
// sound (entity event 35); the player who used it sees the totem flung up over the screen, and earns Postmortal.
// Nothing saves from the void or /kill (vanilla #bypasses_invulnerability).

import type { LivingEntity } from './living';
import type { Player } from './player';
import { MobEffectInstance, MOB_EFFECTS } from './effects';
import type { ItemStack } from '../item/item';
import { displayItemActivation } from '../gui/itemActivation';

/** vanilla #bypasses_invulnerability */
const BYPASSES_INVULNERABILITY = new Set(['void', 'genericKill']);

function isPlayer(e: LivingEntity): e is Player {
  return e.type === 'player';
}

/** the stacks in `e`'s hands, main then off, with a way to put back what's left of each */
function hands(e: LivingEntity): [ItemStack | null, (s: ItemStack | null) => void][] {
  if (isPlayer(e)) {
    const inv = e.inventory;
    return [
      [inv.inHand('main'), (s) => inv.setSlot(inv.selected, s)],
      [inv.inHand('off'), (s) => ((inv.offhand = s && s.count > 0 ? s : null), inv.version++)],
    ];
  }
  // (a mob: by its hand slots; living.ts can't import mob.ts, which is built on it)
  const m = e as unknown as { mainHand?: ItemStack | null; offHand?: ItemStack | null; setItemSlot?: (slot: 'mainhand' | 'offhand', s: ItemStack | null) => void };
  if (m.setItemSlot) {
    return [
      [m.mainHand ?? null, (s) => m.setItemSlot!('mainhand', s)],
      [m.offHand ?? null, (s) => m.setItemSlot!('offhand', s)],
    ];
  }
  return [];
}

/**
 * vanilla checkTotemDeathProtection: true (and the holder lives) if a totem in either hand took the death. Called
 * where a hurt would kill (living.ts)
 */
export function checkTotemDeathProtection(e: LivingEntity, source: string): boolean {
  if (BYPASSES_INVULNERABILITY.has(source)) return false;
  let used: ItemStack | null = null;
  for (const [s, put] of hands(e)) {
    if (s?.item.id !== 'totem_of_undying') continue;
    used = s.copy();
    s.count--;
    put(s.count > 0 ? s : null);
    break;
  }
  if (!used) return false;
  if (isPlayer(e)) e.level.onPlayerTrigger?.(e, 'used_totem');
  e.health = 1;
  e.removeAllEffects();
  e.addEffect(new MobEffectInstance(MOB_EFFECTS.regeneration, 900, 1));
  e.addEffect(new MobEffectInstance(MOB_EFFECTS.absorption, 100, 1));
  e.addEffect(new MobEffectInstance(MOB_EFFECTS.fire_resistance, 800, 0));
  // vanilla entity event 35: the sparkles for 30 ticks, the sound, and for the player the item over the screen
  e.level.particles.emitAround?.('totem_of_undying', e, 30);
  e.level.sound.play('item.totem.use', e.x, e.y, e.z, 1, 1);
  if (e === e.level.player) displayItemActivation(used);
  return true;
}
