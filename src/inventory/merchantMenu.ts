// The trading menu (vanilla MerchantMenu, MerchantContainer and MerchantResultSlot): two payment slots, the result
// of whichever offer they pay for, and picking an offer from the list to fill the payment slots from the inventory.

import { ContainerMenu, Slot, PlayerContainer, isEmpty, type Container } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import type { MerchantOffer, ItemCost, Merchant } from '../entity/trading';

/** vanilla MerchantOffers.getRecipeFor: the chosen offer if they pay for it (an index of 0 means none was chosen), else the first they do */
function recipeFor(offers: MerchantOffer[], a: ItemStack | null, b: ItemStack | null, index: number): MerchantOffer | null {
  if (index > 0 && index < offers.length) {
    const o = offers[index];
    return o.satisfiedBy(a, b) ? o : null;
  }
  for (const o of offers) if (o.satisfiedBy(a, b)) return o;
  return null;
}

/** vanilla MerchantContainer: the payment slots (0, 1) and the result (2), kept up to date as the payment changes */
export class MerchantContainer implements Container {
  readonly size = 3;
  readonly items: (ItemStack | null)[] = [null, null, null];
  activeOffer: MerchantOffer | null = null;
  selectionHint = 0;
  /** the villager experience the offer in the result slot would give */
  futureXp = 0;

  constructor(readonly merchant: Merchant) {}

  get(i: number): ItemStack | null {
    return this.items[i];
  }

  set(i: number, s: ItemStack | null): void {
    this.items[i] = isEmpty(s) ? null : s;
    if (i === 0 || i === 1) this.updateSellItem();
  }

  changed(): void {
    this.updateSellItem();
  }

  /** vanilla updateSellItem: what the payment buys (either way round), and the villager's yes or no */
  updateSellItem(): void {
    this.activeOffer = null;
    let a: ItemStack | null, b: ItemStack | null;
    if (isEmpty(this.items[0])) {
      a = this.items[1];
      b = null;
    } else {
      a = this.items[0];
      b = this.items[1];
    }
    if (isEmpty(a)) {
      this.set(2, null);
      this.futureXp = 0;
      return;
    }
    const offers = this.merchant.getOffers();
    if (offers.length) {
      let o = recipeFor(offers, a, b, this.selectionHint);
      if (!o || o.isOutOfStock()) {
        this.activeOffer = o;
        o = recipeFor(offers, b, a, this.selectionHint);
      }
      if (o && !o.isOutOfStock()) {
        this.activeOffer = o;
        this.set(2, o.result.copy());
        this.futureXp = o.xp;
      } else {
        this.set(2, null);
        this.futureXp = 0;
      }
    }
    this.merchant.notifyTradeUpdated(this.items[2]);
  }

  setSelectionHint(i: number): void {
    this.selectionHint = i;
    this.updateSellItem();
  }
}

/** vanilla MerchantResultSlot: taking the result pays for it and tells the villager */
class MerchantResultSlot extends Slot {
  constructor(private readonly trade: MerchantContainer, private readonly onTraded: (o: MerchantOffer) => void, x: number, y: number) {
    super(trade, 2, x, y);
  }

  override mayPlace(): boolean {
    return false;
  }

  /** vanilla MerchantContainer.removeItem: the result comes out whole */
  override remove(): ItemStack | null {
    const it = this.item;
    this.trade.items[2] = null;
    return it;
  }

  override onTake(_p: Player, _s: ItemStack): void {
    const o = this.trade.activeOffer;
    if (!o) return;
    const a = this.trade.items[0], b = this.trade.items[1];
    if (o.take(a, b) || o.take(b, a)) {
      this.trade.merchant.notifyTrade(o);
      this.onTraded(o);
      this.trade.set(0, a);
      this.trade.set(1, b);
    }
  }
}

export class MerchantMenu extends ContainerMenu {
  readonly trade: MerchantContainer;
  /** a trade was made (the "What a Deal!" advancements) */
  onTraded: ((o: MerchantOffer) => void) | null = null;

  constructor(player: Player, readonly trader: Merchant) {
    super(player);
    this.trade = new MerchantContainer(trader);
    this.addSlot(new Slot(this.trade, 0, 136, 37));
    this.addSlot(new Slot(this.trade, 1, 162, 37));
    this.addSlot(new MerchantResultSlot(this.trade, (o) => this.onTraded?.(o), 220, 37));
    this.addPlayerSlots(new PlayerContainer(player), 108, 84);
  }

  offers(): MerchantOffer[] {
    return this.trader.getOffers();
  }

  traderLevel(): number {
    return this.trader.merchantLevel;
  }

  traderXp(): number {
    return this.trader.xp;
  }

  futureTraderXp(): number {
    return this.trade.futureXp;
  }

  /** vanilla Merchant.showProgressBar / canRestock (a wandering trader has neither) */
  showProgressBar(): boolean {
    return this.trader.showProgressBar();
  }

  canRestock(): boolean {
    return this.trader.canRestock();
  }

  setSelectionHint(i: number): void {
    this.trade.setSelectionHint(i);
  }

  /** vanilla AbstractVillager.stillValid: still trading with this player, alive, and in reach (4 past the usual) */
  override stillValid(p: Player): boolean {
    const v = this.trader;
    if (v.tradingPlayer !== p || !v.isAlive) return false;
    const reach = (p.gameMode === 'creative' ? 5 : 3) + 4;
    const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
    const hw = v.width / 2;
    const dx = Math.max(v.x - hw - ex, 0, ex - (v.x + hw));
    const dy = Math.max(v.y - ey, 0, ey - (v.y + v.height));
    const dz = Math.max(v.z - hw - ez, 0, ez - (v.z + hw));
    return dx * dx + dy * dy + dz * dz < reach * reach;
  }

  override canTakeItemForPickAll(): boolean {
    return false;
  }

  /** vanilla MerchantMenu.quickMoveStack */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index === 2) {
      if (!this.moveItemStackTo(s, 3, 39, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index !== 0 && index !== 1) {
      if (index >= 3 && index < 30) {
        if (!this.moveItemStackTo(s, 30, 39, false)) return null;
      } else if (index >= 30 && index < 39 && !this.moveItemStackTo(s, 3, 30, false)) return null;
    } else if (!this.moveItemStackTo(s, 3, 39, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }

  /** vanilla tryMoveItems: choosing an offer puts the payment back and fills the slots with its price from the inventory */
  tryMoveItems(i: number): void {
    const offers = this.offers();
    if (i < 0 || i >= offers.length) return;
    for (const k of [0, 1]) {
      const s = this.trade.items[k];
      if (isEmpty(s)) continue;
      if (!this.moveItemStackTo(s, 3, 39, true)) return;
      this.trade.set(k, s);
    }
    if (isEmpty(this.trade.items[0]) && isEmpty(this.trade.items[1])) {
      const o = offers[i];
      this.moveFromInventoryToPaymentSlot(0, o.baseCostA);
      if (o.costB) this.moveFromInventoryToPaymentSlot(1, o.costB);
    }
  }

  /** vanilla moveFromInventoryToPaymentSlot: as much of the price's item as a stack holds */
  private moveFromInventoryToPaymentSlot(k: number, cost: ItemCost): void {
    for (let i = 3; i < 39; i++) {
      const slot = this.slots[i];
      const s = slot.item;
      if (isEmpty(s) || s.item.id !== cost.id) continue;
      const pay = this.trade.items[k];
      if (!isEmpty(pay) && !s.sameItem(pay)) continue;
      const max = s.maxStack;
      const had = pay?.count ?? 0;
      const n = Math.min(max - had, s.count);
      const next = s.copyWithCount(had + n);
      s.count -= n;
      if (s.count <= 0) slot.set(null);
      else slot.setChanged();
      this.trade.set(k, next);
      if (next.count >= max) break;
    }
  }

  /** vanilla MerchantMenu.removed: the payment goes back to the player, and the villager stops trading */
  override removed(): void {
    super.removed();
    this.trader.stopTrading();
    for (const k of [0, 1]) {
      const s = this.trade.items[k];
      this.trade.items[k] = null;
      if (isEmpty(s)) continue;
      const left = this.player.inventory.add(s);
      if (left > 0) this.player.dropItem(s.copyWithCount(left), false);
    }
    this.trade.items[2] = null;
  }
}
