// (the beacon) A beacon's menu (vanilla BeaconMenu): its payment slot (an iron ingot, gold ingot, emerald, diamond or
// netherite ingot, one at a time) and the player's inventory, with three numbers its screen shows (vanilla
// ContainerData): the beacon's tiers, and its primary and secondary powers. The screen's Done is a menu button with
// both powers in one number (vanilla ServerboundSetBeaconPacket): the beacon takes them and the payment. Closed, a
// payment not spent is dropped at the player's feet (vanilla removed: player.drop).

import { ContainerMenu, Slot, SimpleContainer, PlayerContainer, isEmpty } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import { BeaconBlockEntity, BEACON_PAYMENT_ITEMS, BEACON_EFFECTS, filterEffect, effectTier } from '../game/beacon';

/** the beacon's powers by number (vanilla BeaconMenu.encodeEffect: 0 none, then each power): the wire's and Done's */
export const BEACON_POWER_IDS: readonly string[] = BEACON_EFFECTS.flat();

export function encodePower(id: string | null): number {
  const i = id ? BEACON_POWER_IDS.indexOf(id) : -1;
  return i < 0 ? 0 : i + 1;
}

export function decodePower(n: number): string | null {
  return BEACON_POWER_IDS[n - 1] ?? null;
}

/** Done's button: the primary power's number times 8, plus the secondary's */
export function beaconButton(primary: string | null, secondary: string | null): number {
  return encodePower(primary) * 8 + encodePower(secondary);
}

/** vanilla BeaconMenu.PaymentSlot: a #beacon_payment_items, one at a time */
class PaymentSlot extends Slot {
  override mayPlace(s: ItemStack): boolean {
    return BEACON_PAYMENT_ITEMS.has(s.item.id);
  }
  override maxStackSize(): number {
    return 1;
  }
}

export class BeaconMenu extends ContainerMenu {
  readonly payment = new SimpleContainer(1);
  readonly paymentSlot: PaymentSlot;

  constructor(player: Player, readonly beacon: BeaconBlockEntity) {
    super(player);
    this.paymentSlot = this.addSlot(new PaymentSlot(this.payment, 0, 136, 110));
    this.addPlayerSlots(new PlayerContainer(player), 36, 137);
  }

  /** vanilla getLevels, getPrimaryEffect and getSecondaryEffect (the data slots) */
  get levels(): number {
    return this.beacon.levels;
  }
  get primary(): string | null {
    return this.beacon.primary;
  }
  get secondary(): string | null {
    return this.beacon.secondary;
  }

  /** vanilla hasPayment */
  hasPayment(): boolean {
    return !isEmpty(this.payment.get(0));
  }

  /**
   * vanilla updateEffects (ServerboundSetBeaconPacket), from Done: with a payment in its slot, the powers set and the
   * payment taken. The host goes further than vanilla's server, which keeps any of a beacon's powers: the primary
   * must be one its tiers give, or the one it has (the screen opens with it chosen), as vanilla's screen allows, so
   * nobody's screen can ask for more
   */
  clickMenuButton(id: number): boolean {
    if (!Number.isInteger(id) || id < 0 || id >= 7 * 8) return false;
    const primary = decodePower(id >> 3), secondary = decodePower(id & 7);
    if ((id >> 3) > 0 && !primary) return false;
    if ((id & 7) > 0 && !secondary) return false;
    if (!this.hasPayment() || !primary) return false;
    const tier = effectTier(primary);
    if (tier < 0 || tier >= 3 || (tier >= this.beacon.levels && primary !== this.beacon.primary)) return false;
    if (secondary !== null && filterEffect(secondary) === null) return false;
    this.beacon.setPowers(this.player.level, primary, secondary);
    const s = this.payment.get(0)!;
    this.payment.set(0, s.count > 1 ? s.copyWithCount(s.count - 1) : null);
    return true;
  }

  /** vanilla BeaconMenu.quickMoveStack: a single payment item goes in its slot; otherwise inventory and hotbar swap */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot?.item;
    if (!s) return null;
    const before = s.copy();
    if (index === 0) {
      if (!this.moveItemStackTo(s, 1, 37, true)) return null;
    } else if (!this.paymentSlot.hasItem() && this.paymentSlot.mayPlace(s) && s.count === 1) {
      if (!this.moveItemStackTo(s, 0, 1, false)) return null;
    } else if (index >= 1 && index < 28) {
      if (!this.moveItemStackTo(s, 28, 37, false)) return null;
    } else if (index >= 28 && index < 37) {
      if (!this.moveItemStackTo(s, 1, 28, false)) return null;
    } else if (!this.moveItemStackTo(s, 1, 37, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }

  /** vanilla stillValid(access, player, Blocks.BEACON): the beacon still there, within 8 */
  override stillValid(p: Player): boolean {
    const be = this.beacon;
    if (be.removed || p.level.world.getBlockEntity(be.x, be.y, be.z) !== be) return false;
    return p.distanceToSqr(be.x + 0.5, be.y + 0.5, be.z + 0.5) <= 64;
  }

  /** vanilla BeaconMenu.removed: what's carried goes back; the payment, unspent, dropped at the player's feet */
  override removed(): void {
    super.removed();
    const s = this.payment.get(0);
    if (isEmpty(s)) return;
    this.payment.set(0, null);
    this.player.dropItem(s, false);
  }
}
