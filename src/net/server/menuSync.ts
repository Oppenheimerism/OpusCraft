// A guest's menus on the host (vanilla ServerPlayer's inventoryMenu and containerMenu, with the ContainerSynchronizer
// that keeps its client in step): its inventory's, always there as menu 0, and the one a block or an entity opened for
// it, numbered 1 to 100 and round again. The host clicks in them as the guest says; the guest's own game clicks too, to
// show it at once, and says what it made of it (a hash of each slot it changed, and of its cursor). At the end of each
// tick, whatever a slot holds that isn't what the guest has there goes to it (vanilla's remote slots), with the menu's
// numbers that changed; a click made on an out-of-date view (its state number isn't the menu's) has the whole menu sent
// again. The inventory's own slots, in whichever menu shows them, are kept track of with the session's record of the
// guest's inventory, so they're sent once whichever way they changed.

import type { Value } from '../codec';
import { CB, INVENTORY_MENU, MAX_MENU_SLOTS } from '../protocol';
import { MAX_CONTAINER_ID, MAX_STATE_ID, MAX_CLICKS_PER_TICK } from '../config';
import { menuKind, menuTitle, menuExtra, menuData, menuItem, claimOf, claimMatches, offerToWire } from '../menus';
import { stackKey } from '../playerState';
import { PlayerContainer, type ContainerMenu, type ClickType } from '../../inventory/container';
import { InventoryMenu, CraftingMenuBase, FurnaceMenu, recipeTarget } from '../../inventory/menus';
import { AnvilMenu } from '../../inventory/enchantMenus';
import { MerchantMenu } from '../../inventory/merchantMenu';
import { CrafterMenu } from '../../inventory/crafterMenu';
import { LecternMenu } from '../../inventory/lecternMenu';
import { BOOK_BY_ID, fits, placeRecipe } from '../../inventory/recipeBook';
import type { Player } from '../../entity/player';

/** what the guest has of a menu, as the host last knew */
interface Remote {
  stateId: number;
  /** each slot's stack, where it isn't one of the inventory's (the session keeps those: `MenuHost.slots`) */
  slots: string[];
  /** each slot's place in the inventory, or -1 */
  inv: number[];
  carried: string;
  data: number[];
  /** a trader's offers, as sent */
  offers: string;
  /** the whole menu to be sent again at the end of the tick */
  full: boolean;
}

/** what the menus need of the guest's session */
export interface MenuHost {
  readonly player: Player;
  /** the guest's inventory as it has it, by slot (the session's, which its own updates keep too) */
  readonly slots: string[];
  send(p: Value[]): void;
  /** inventory slot `i` to be sent again at the end of the tick, whatever the guest was last told */
  resendSlot(i: number): void;
}

export class ServerMenus {
  /** vanilla inventoryMenu: the inventory, armour, offhand and the 2x2 grid (containerId 0) */
  readonly inventory: InventoryMenu;
  /** the menu open (the inventory's when nothing else is) */
  menu: ContainerMenu;
  containerId = INVENTORY_MENU;
  private counter = 0;
  private readonly invRemote: Remote;
  private remote: Remote;
  /** the clicks taken this tick */
  private clicks = 0;

  constructor(private readonly host: MenuHost) {
    this.inventory = new InventoryMenu(host.player);
    this.menu = this.inventory;
    this.invRemote = this.remote = this.remoteFor(this.inventory);
  }

  private remoteFor(m: ContainerMenu): Remote {
    const p = this.host.player;
    return {
      stateId: 0,
      slots: m.slots.map(() => ''),
      inv: m.slots.map((s) => (s.container instanceof PlayerContainer && s.container.player === p ? s.slot : -1)),
      carried: '',
      data: [],
      offers: '',
      full: false,
    };
  }

  /** a menu other than the inventory's is open */
  get isOpen(): boolean {
    return this.menu !== this.inventory;
  }

  // -------------------------------------------------------------------------
  // opening and closing

  /**
   * vanilla ServerPlayer.openMenu: `m`, made for the guest's player, is shown to it (whatever else was open closed
   * first); false, and `m` closed again, if it can't be (a kind a guest can't be shown)
   */
  open(m: ContainerMenu): boolean {
    const kind = menuKind(m);
    if (!kind || m.slots.length > MAX_MENU_SLOTS || m.player !== this.host.player) {
      m.removed();
      return false;
    }
    if (this.isOpen) this.close();
    this.counter = (this.counter % MAX_CONTAINER_ID) + 1;
    this.containerId = this.counter;
    this.menu = m;
    this.remote = this.remoteFor(m);
    this.host.send([CB.OpenScreen, this.containerId, kind, menuTitle(m).slice(0, 256), menuExtra(m)]);
    this.sendAll();
    return true;
  }

  /**
   * vanilla ServerPlayer.closeContainer: the host closes the guest's menu (it's out of reach, gone, or the guest died),
   * telling it so; what the menu held for the guest goes back to it (vanilla doCloseContainer → removed)
   */
  close(): void {
    if (!this.isOpen) return;
    this.host.send([CB.ContainerClose, this.containerId]);
    this.closed();
  }

  /** vanilla doCloseContainer: the open menu let go, and the inventory's is the one open */
  private closed(): void {
    const m = this.menu;
    this.menu = this.inventory;
    this.containerId = INVENTORY_MENU;
    this.remote = this.invRemote;
    m.removed();
  }

  /**
   * vanilla handleContainerClose: the guest closed menu `id` (a menu the host has closed since is let be); its
   * inventory's screen closing puts back what was in its grid and on its cursor
   */
  guestClosed(id: number): void {
    if (id === INVENTORY_MENU) this.inventory.removed();
    else if (id === this.containerId) this.closed();
  }

  /** the guest is gone or dead (vanilla Player.remove / die): everything its menus held goes back to it */
  closeAll(tell: boolean): void {
    if (tell) this.close();
    else if (this.isOpen) this.closed();
    this.inventory.removed();
  }

  // -------------------------------------------------------------------------
  // what the guest does

  /**
   * vanilla handleContainerClick: the click, done by the host in the menu the guest has open; what the guest said the
   * slots it changed and its cursor now hold is taken as what it has, so only what differs is sent back. A click the
   * guest couldn't have made (a spectator's, a dead player's, one on a slot that isn't there, too many in a tick) is
   * answered with the whole menu as it is
   */
  click(id: number, stateId: number, slot: number, button: number, type: ClickType, changed: [number, number][], carried: number): void {
    if (id !== this.containerId) return;
    const p = this.host.player, m = this.menu, r = this.remote;
    // (a lectern's one slot is its book, taken with its button; its screen has nothing else to click)
    if (p.gameMode === 'spectator' || p.health <= 0 || m instanceof LecternMenu || ++this.clicks > MAX_CLICKS_PER_TICK || !validClick(m, slot, button, type)) {
      r.full = true;
      return;
    }
    // (vanilla: a menu out of reach is closed at the end of the tick; its clicks meanwhile do nothing, and what the
    // guest made of one is put right with the rest)
    const stale = stateId !== r.stateId;
    if (m.stillValid(p)) m.clicked(slot, button, type);
    for (const [i, h] of changed) {
      if (i >= m.slots.length) continue;
      const k = r.inv[i];
      if (k >= 0) this.host.slots[k] = claimOf(h);
      else r.slots[i] = claimOf(h);
    }
    r.carried = claimOf(carried);
    // (the offhand, swapped with a slot, isn't in most menus: sent again, whatever the guest made of it)
    if (type === 'swap' && button === 40) this.host.resendSlot(40);
    if (stale) r.full = true;
  }

  /** vanilla handleContainerButtonClick: an enchanting offer, a stonecutter's recipe, a loom's pattern, a lectern's page */
  button(id: number, b: number): void {
    const m = this.menu as ContainerMenu & { clickMenuButton?(id: number): boolean };
    const p = this.host.player;
    if (id !== this.containerId || !this.isOpen || p.gameMode === 'spectator' || p.health <= 0 || !m.clickMenuButton || !m.stillValid(p)) return;
    m.clickMenuButton(b);
  }

  /** vanilla handleRenameItem: the anvil's name box */
  rename(name: string): void {
    const m = this.menu;
    if (m instanceof AnvilMenu && m.stillValid(this.host.player)) m.setItemName(name);
  }

  /** vanilla handleSelectTrade: the trade picked, its price moved into the payment slots from the inventory */
  selectTrade(i: number): void {
    const m = this.menu;
    if (!(m instanceof MerchantMenu) || !m.stillValid(this.host.player)) return;
    m.setSelectionHint(i);
    m.tryMoveItems(i);
  }

  /** vanilla handleContainerSlotStateChanged: a crafter's empty grid slot switched on or off */
  slotState(id: number, slot: number, on: boolean): void {
    const m = this.menu, p = this.host.player;
    if (id === this.containerId && m instanceof CrafterMenu && p.gameMode !== 'spectator' && m.stillValid(p)) m.setSlotState(slot, on);
  }

  /**
   * vanilla handlePlaceRecipe (ServerPlaceRecipe): a recipe clicked in the recipe book, its ingredients moved from the
   * inventory into the grid (or a furnace's input); without them, the guest is told to show it in outline
   */
  placeRecipe(id: number, recipe: string, all: boolean): void {
    const m = this.menu, p = this.host.player;
    if (id !== this.containerId || p.gameMode === 'spectator' || p.health <= 0) return;
    if (!(m instanceof CraftingMenuBase || m instanceof FurnaceMenu) || !m.stillValid(p)) return;
    const r = BOOK_BY_ID.get(recipe);
    const book = m instanceof FurnaceMenu ? m.furnace.id : 'crafting';
    if (!r || r.type !== book || (m instanceof CraftingMenuBase && !fits(r, m.gridW, m.gridW))) return;
    const res = placeRecipe(recipeTarget(p, m), r, all);
    if (!res.placed && res.ghost) this.host.send([CB.PlaceGhostRecipe, id, recipe]);
  }

  // -------------------------------------------------------------------------
  // the tick

  /** (the session's tick) vanilla ServerPlayer.tick: a menu out of reach, or whose block or entity is gone, is closed */
  tick(): void {
    this.clicks = 0;
    if (this.isOpen && !this.menu.stillValid(this.host.player)) this.close();
  }

  private nextState(r: Remote): number {
    r.stateId = (r.stateId + 1) & MAX_STATE_ID;
    return r.stateId;
  }

  /**
   * (the end of the host's tick) vanilla AbstractContainerMenu.broadcastChanges: each slot, the cursor and the numbers
   * that aren't what the guest has; a trader's offers when they change
   */
  broadcast(): void {
    const r = this.remote, m = this.menu, id = this.containerId, slots = this.host.slots;
    if (r.full) return this.sendAll();
    for (let i = 0; i < m.slots.length; i++) {
      const s = m.slots[i].item, key = stackKey(s), k = r.inv[i];
      const had = k >= 0 ? slots[k] : r.slots[i];
      if (k >= 0) slots[k] = key;
      else r.slots[i] = key;
      if (!claimMatches(had, key)) this.host.send([CB.MenuSetSlot, id, this.nextState(r), i, menuItem(s)]);
    }
    const ck = stackKey(m.carried);
    const had = r.carried;
    r.carried = ck;
    if (!claimMatches(had, ck)) this.host.send([CB.SetCarried, id, this.nextState(r), menuItem(m.carried)]);
    this.sendData(false);
    this.sendOffers(false);
  }

  /** vanilla sendAllDataToRemote: every slot, the cursor and every number */
  private sendAll(): void {
    const r = this.remote, m = this.menu, slots = this.host.slots;
    r.full = false;
    const items: Value[] = [];
    for (let i = 0; i < m.slots.length; i++) {
      const s = m.slots[i].item, k = r.inv[i];
      if (k >= 0) slots[k] = stackKey(s);
      else r.slots[i] = stackKey(s);
      items.push(menuItem(s));
    }
    r.carried = stackKey(m.carried);
    this.host.send([CB.ContainerSetContent, this.containerId, this.nextState(r), items, menuItem(m.carried)]);
    this.sendData(true);
    this.sendOffers(true);
  }

  /** vanilla synchronizeDataSlotToRemote: the menu's numbers that changed (or all of them) */
  private sendData(all: boolean): void {
    const r = this.remote, d = menuData(this.menu);
    for (let i = 0; i < d.length; i++)
      if (all || d[i] !== r.data[i]) {
        r.data[i] = d[i];
        this.host.send([CB.ContainerSetData, this.containerId, i, d[i]]);
      }
  }

  /** vanilla ServerPlayer.sendMerchantOffers: a trader's offers, its level and experience, when opened and as they change */
  private sendOffers(all: boolean): void {
    const m = this.menu;
    if (!(m instanceof MerchantMenu)) return;
    const offers = m.offers().slice(0, 64).map(offerToWire);
    const p: Value[] = [CB.MerchantOffers, this.containerId, offers, Math.max(0, Math.min(5, m.traderLevel() | 0)), Math.max(0, m.traderXp() | 0), m.showProgressBar(), m.canRestock()];
    const key = JSON.stringify(p);
    if (!all && key === this.remote.offers) return;
    this.remote.offers = key;
    this.host.send(p);
  }
}

/**
 * vanilla AbstractContainerMenu.isValidSlotIndex, and the buttons each kind of click has: what a guest's screen could
 * have sent (a click outside the window is slot -999)
 */
function validClick(m: ContainerMenu, slot: number, button: number, type: ClickType): boolean {
  const inMenu = slot >= 0 && slot < m.slots.length, outside = slot === -999;
  switch (type) {
    case 'pickup':
    case 'quick_move':
    case 'throw':
      return (inMenu || outside) && button <= 1;
    case 'swap':
      return inMenu && (button < 9 || button === 40);
    case 'clone':
      return inMenu;
    case 'quick_craft':
      // (a drag: its start and end outside any slot, each slot in between; quickcraftMask's bits)
      return (inMenu || outside) && button <= 10;
    case 'pickup_all':
      return inMenu && button <= 1;
  }
  return false;
}
