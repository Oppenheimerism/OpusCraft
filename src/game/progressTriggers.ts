// What some advancement triggers carry, worked out alike for the game's own player (game/game.ts hookProgress) and for a
// host's guests' players (net/server/guestProgress.ts).

import { ItemStack } from '../item/item';
import type { Entity } from '../entity/entity';
import type { TriggerPayload } from './advancements';

/**
 * vanilla player_interacted_with_entity: what was in hand (as it was before the click), on what kind of mob, of what
 * variant (M9: frogs), and (remaining mobs: the armadillo) the body armour it wears after, with its wear: a wolf's
 * armour, a horse's or a llama's (its body slot: vanilla EquipmentSlot.BODY, which a horse keeps behind bodyArmor())
 */
export function interactedPayload(stack: ItemStack | null, e: Entity): TriggerPayload {
  const variant = (e as { variant?: unknown }).variant;
  const body = (e as { bodyArmor?: unknown }).bodyArmor;
  const worn = typeof body === 'function' ? (body as () => unknown).call(e) : body;
  const armor = worn instanceof ItemStack ? worn : null;
  return { interacted: { item: stack?.item.id ?? null, entity: e.type, variant: typeof variant === 'string' ? variant : undefined, bodyArmor: armor ? { item: armor.item.id, damage: armor.damage } : null } };
}
