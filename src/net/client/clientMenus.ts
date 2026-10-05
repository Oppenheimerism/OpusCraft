// A guest's menus (vanilla ClientPacketListener's container packets, MultiPlayerGameMode.handleInventoryMouseClick and
// the client's copies of the server's menus): its inventory's, always there as menu 0, and the one the host opened for
// it. Each is the game's own kind of menu, over containers of its own that the host fills. A click in one is made here
// at once, to show it, with nothing it would do to the world done (no sound, nothing dropped, no experience or block
// changed), and sent with what it made of it; the host makes the click for real and sends whatever came out otherwise.
// A menu's buttons are the host's to press (the stonecutter's, the loom's, a crafter's switches and the anvil's name
// are shown here at once too); the rest of what a menu shows comes from the host.

import type { Value } from '../codec';
import { SB, CLICK_TYPES, INVENTORY_MENU, MENU_KINDS, type MenuKind } from '../protocol';
import { itemFromHost } from '../items';
import { stackKey } from '../playerState';
import { applyMenuData, keyHash, offerFromHost } from '../menus';
import { PlayerContainer, type ContainerMenu, type ClickType } from '../../inventory/container';
import { InventoryMenu, CraftingMenu, FurnaceMenu, ChestMenu, BrewingStandMenu, CraftingMenuBase } from '../../inventory/menus';
import { EnchantmentMenu, AnvilMenu, GrindstoneMenu } from '../../inventory/enchantMenus';
import { MerchantMenu } from '../../inventory/merchantMenu';
import { StonecutterMenu } from '../../inventory/stonecutterMenu';
import { SmithingMenu } from '../../inventory/smithingMenu';
import { LoomMenu } from '../../inventory/loomMenu';
import { CartographyTableMenu } from '../../inventory/cartographyMenu';
import { LecternMenu } from '../../inventory/lecternMenu';
import { DispenserMenu } from '../../inventory/dispenserMenu';
import { HopperMenu } from '../../inventory/hopperMenu';
import { CrafterMenu } from '../../inventory/crafterMenu';
import { HorseInventoryMenu } from '../../inventory/horseMenu';
import { ShulkerBoxMenu } from '../../inventory/shulkerBoxMenu';
import { ChestBlockEntity, FurnaceBlockEntity, BrewingStandBlockEntity, LecternBlockEntity } from '../../world/blockEntity';
import { ShulkerBoxBlockEntity } from '../../world/shulkerBoxEntity';
import { DispenserBlockEntity } from '../../game/redstone/dispenser';
import { HopperBlockEntity } from '../../game/redstone/hopper';
import { CrafterBlockEntity } from '../../game/crafter';
// (the beacon)
import { BeaconMenu } from '../../inventory/beaconMenu';
import { BeaconBlockEntity } from '../../game/beacon';
import { AbstractHorse } from '../../entity/horse';
import type { Merchant, MerchantOffer } from '../../entity/trading';
import type { Entity } from '../../entity/entity';
import type { Player } from '../../entity/player';

/** what the menus need of the session they're in */
export interface MenuLink {
  send(p: Value[]): void;
  /** our copy of the host's entity `id` (a horse, for its inventory's menu) */
  entity(id: number): Entity | null;
  /** a menu the host opened: the game shows it */
  show(menu: ContainerMenu): void;
  /** a menu the host closed (or one that took its place): the game stops showing it */
  hide(menu: ContainerMenu): void;
  /** before a click: any creative edits made before it go first */
  beforeClick(): void;
  /** after a click: what it did to our inventory is the host's to do too, not a creative edit of ours */
  afterClick(): void;
  /** inventory slot `i` as the host has it: not to be sent back as ours */
  inventorySlot(i: number): void;
  /** a recipe the host says we lack the ingredients for, shown in outline in the recipe book of menu `menu` */
  ghostRecipe(menu: ContainerMenu, recipe: string): void;
}

/** the menu the host opened for us */
interface Open {
  id: number;
  kind: MenuKind;
  menu: ContainerMenu;
  /** closed by the host, or by a menu that took its place: not to be told back */
  closed: boolean;
}

const MUTE_SOUND = { play() {}, playUI() {} };
const MUTE_PARTICLES = new Proxy({}, { get: () => () => {} });

/** vanilla ClientSideMerchant: a trader as the host describes it (its offers, level and experience), in its menu's copy */
class ClientMerchant {
  tradingPlayer: Player | null = null;
  merchantLevel = 1;
  xp = 0;
  offers: MerchantOffer[] = [];
  progressBar = false;
  restock = false;
  readonly isAlive = true;
  constructor(readonly customName: string) {}
  getOffers(): MerchantOffer[] {
    return this.offers;
  }
  /** vanilla ClientSideMerchant.notifyTrade: the offer's used once more, as the host's will be */
  notifyTrade(o: MerchantOffer): void {
    o.uses++;
  }
  notifyTradeUpdated(): void {}
  showProgressBar(): boolean {
    return this.progressBar;
  }
  canRestock(): boolean {
    return this.restock;
  }
  stopTrading(): void {}
}

export class ClientMenus {
  /** vanilla InventoryMenu (containerId 0): kept for as long as we're in, as the host keeps its own */
  readonly inventory: InventoryMenu;
  open: Open | null = null;
  /** each menu's state number, as the host last said (sent back with each click) */
  private readonly stateIds = new WeakMap<ContainerMenu, number>();

  constructor(private readonly player: Player, private readonly link: MenuLink) {
    this.inventory = this.wrap(new InventoryMenu(player), INVENTORY_MENU);
  }

  /** menu `id`, if it's one we have */
  menu(id: number): ContainerMenu | null {
    if (id === INVENTORY_MENU) return this.inventory;
    return this.open && !this.open.closed && this.open.id === id ? this.open.menu : null;
  }

  /** the id the host knows `m` by (-1: one it doesn't) */
  idOf(m: ContainerMenu): number {
    if (m === this.inventory) return INVENTORY_MENU;
    return this.open && !this.open.closed && this.open.menu === m ? this.open.id : -1;
  }

  // -------------------------------------------------------------------------
  // from the host

  /** vanilla handleOpenScreen: our copy of the menu, shown; a reason to leave if the host's makes no sense */
  openScreen(id: number, kind: string, title: string, extra: Record<string, Value>): string | null {
    if (!(MENU_KINDS as readonly string[]).includes(kind)) return 'a menu that does not exist';
    this.hideOpen();
    const menu = this.make(kind as MenuKind, title.replace(/[\u0000-\u001f\u007f§]/g, ''), extra);
    if (!menu) {
      // (a horse we've no copy of: the host's menu is closed again)
      this.link.send([SB.ContainerClose, id]);
      return null;
    }
    this.open = { id, kind: kind as MenuKind, menu: this.wrap(menu, id), closed: false };
    this.link.show(menu);
    return null;
  }

  /** vanilla handleContainerClose: the host closed the menu (a stale one is let be) */
  close(id: number): void {
    if (this.open && this.open.id === id) this.hideOpen();
  }

  private hideOpen(): void {
    const o = this.open;
    if (!o) return;
    this.open = null;
    if (o.closed) return;
    o.closed = true;
    this.link.hide(o.menu);
  }

  /** vanilla handleContainerContent: every slot and the cursor */
  setContent(id: number, stateId: number, items: Value[], carried: Value): string | null {
    const m = this.menu(id);
    if (!m) return null;
    if (items.length !== m.slots.length) return 'a menu of the wrong size';
    this.stateIds.set(m, stateId);
    for (let i = 0; i < items.length; i++) this.put(m, i, items[i]);
    m.carried = itemFromHost(carried);
    this.changed(m);
    return null;
  }

  /** vanilla handleContainerSetSlot */
  setSlot(id: number, stateId: number, slot: number, item: Value): string | null {
    const m = this.menu(id);
    if (!m) return null;
    if (slot >= m.slots.length) return 'a slot that does not exist';
    this.stateIds.set(m, stateId);
    this.put(m, slot, item);
    this.changed(m);
    return null;
  }

  /** vanilla handleContainerSetSlot for the cursor */
  setCarried(id: number, stateId: number, item: Value): void {
    const m = this.menu(id);
    if (!m) return;
    this.stateIds.set(m, stateId);
    m.carried = itemFromHost(item);
  }

  /** vanilla handleContainerSetData */
  setData(id: number, i: number, v: number): string | null {
    const m = this.menu(id);
    if (!m) return null;
    if (!applyMenuData(m, i, v)) return 'a menu value that does not exist';
    if (m instanceof LecternMenu) m.onPageChanged?.();
    return null;
  }

  /** vanilla handleMerchantOffers */
  offers(id: number, list: Value[], level: number, xp: number, progress: boolean, restock: boolean): string | null {
    const m = this.menu(id);
    if (!(m instanceof MerchantMenu)) return null;
    const offers: MerchantOffer[] = [];
    for (const v of list) {
      const o = offerFromHost(v);
      if (!o) return 'an offer of an item that does not exist';
      offers.push(o);
    }
    const t = m.trader as unknown as ClientMerchant;
    t.offers = offers;
    t.merchantLevel = level;
    t.xp = xp;
    t.progressBar = progress;
    t.restock = restock;
    m.trade.updateSellItem();
    return null;
  }

  /** vanilla handlePlaceRecipe: a recipe we lack the ingredients for, in outline */
  ghost(id: number, recipe: string): void {
    const m = this.menu(id);
    if (m) this.link.ghostRecipe(m, recipe);
  }

  /** a stack from the host into slot `i` of `m`, as it is (vanilla Slot.set: no equip sound, nothing else set off) */
  private put(m: ContainerMenu, i: number, v: Value): void {
    const slot = m.slots[i], s = itemFromHost(v);
    slot.container.set(slot.slot, s);
    if (slot.container instanceof PlayerContainer) this.link.inventorySlot(slot.slot);
  }

  /** what a menu's screen hears when its slots change (a lectern's book) */
  private changed(m: ContainerMenu): void {
    if (m instanceof LecternMenu) m.onBookChanged?.();
  }

  // -------------------------------------------------------------------------
  // our copies

  /**
   * our copy of a menu of `kind`: the game's own kind over containers of its own (a furnace's, a lectern's, a
   * crafter's block entity that's in no world, a trader that's what the host says of it), or null if it can't be made
   */
  private make(kind: MenuKind, title: string, extra: Record<string, Value>): ContainerMenu | null {
    const p = this.player, at: [number, number, number] = [0, 0, 0];
    switch (kind) {
      case 'crafting':
        return new CraftingMenu(p, at);
      case 'furnace':
      case 'smoker':
      case 'blast_furnace':
        return new FurnaceMenu(p, new FurnaceBlockEntity(0, 0, 0, kind));
      case 'chest':
        return new ChestMenu(p, new ChestBlockEntity(0, 0, 0), title || 'Chest');
      case 'shulker_box':
        return new ShulkerBoxMenu(p, new ShulkerBoxBlockEntity(0, 0, 0), title || 'Shulker Box');
      case 'brewing_stand':
        return new BrewingStandMenu(p, new BrewingStandBlockEntity(0, 0, 0));
      case 'enchantment': {
        // (vanilla: the costs, the seed and the hints are the host's, worked out from its bookshelves)
        const m = new EnchantmentMenu(p, at);
        m.slotsChanged = () => {};
        return m;
      }
      case 'anvil':
        return new AnvilMenu(p, at);
      case 'grindstone':
        return new GrindstoneMenu(p, at);
      case 'merchant':
        return new MerchantMenu(p, new ClientMerchant(title) as unknown as Merchant);
      case 'stonecutter':
        return new StonecutterMenu(p, at);
      case 'smithing':
        return new SmithingMenu(p, at);
      case 'loom':
        return new LoomMenu(p, at);
      case 'cartography':
        return new CartographyTableMenu(p, at);
      case 'lectern':
        return new LecternMenu(p, new LecternBlockEntity(0, 0, 0));
      case 'dispenser':
      case 'dropper':
        return new DispenserMenu(p, new DispenserBlockEntity(0, 0, 0, kind));
      case 'hopper':
        return new HopperMenu(p, new HopperBlockEntity(0, 0, 0), title || 'Hopper');
      case 'crafter':
        return new CrafterMenu(p, new CrafterBlockEntity(0, 0, 0));
      case 'beacon':
        // (the beacon: its tiers and powers are the host's, sent as data)
        return new BeaconMenu(p, new BeaconBlockEntity(0, 0, 0));
      case 'horse': {
        // (vanilla ClientboundHorseScreenOpenPacket: our copy of the horse, whose chest must have the host's columns)
        const h = typeof extra.entity === 'number' ? this.link.entity(extra.entity) : null;
        if (!(h instanceof AbstractHorse)) return null;
        const m = new HorseInventoryMenu(p, h);
        return m.columns === extra.columns ? m : null;
      }
    }
    return null;
  }

  /**
   * `m`, made ours: its clicks made here and sent, its buttons sent (and shown here where they can be), its closing
   * told; always in reach (the host says when it isn't)
   */
  private wrap<M extends ContainerMenu>(m: M, id: number): M {
    const clicked = m.clicked.bind(m);
    m.clicked = (slot: number, button: number, type: ClickType) => this.click(m, id, slot, button, type, clicked);
    m.stillValid = () => true;
    m.removed = () => this.closedHere(m, id);
    if (m instanceof EnchantmentMenu) m.clickMenuButton = (b: number) => this.enchant(m, id, b);
    else if (m instanceof StonecutterMenu || m instanceof LoomMenu) {
      const press = m.clickMenuButton.bind(m);
      m.clickMenuButton = (b: number) => {
        let ok = false;
        this.predict(() => (ok = press(b)));
        if (ok) this.link.send([SB.ContainerButtonClick, id, b]);
        return ok;
      };
    } else if (m instanceof LecternMenu || m instanceof BeaconMenu) {
      // (a lectern's pages and its book are the host's to turn and take; (the beacon) a beacon's powers its to set)
      m.clickMenuButton = (b: number) => {
        this.link.send([SB.ContainerButtonClick, id, b]);
        return true;
      };
    } else if (m instanceof AnvilMenu) {
      const name = m.setItemName.bind(m);
      m.setItemName = (s: string) => {
        const ok = name(s);
        if (ok) this.link.send([SB.RenameItem, (m.itemName ?? '').slice(0, 50)]);
        return ok;
      };
    } else if (m instanceof MerchantMenu) {
      const move = m.tryMoveItems.bind(m);
      m.tryMoveItems = (i: number) => {
        this.predict(() => move(i));
        this.link.send([SB.SelectTrade, Math.max(0, Math.min(255, i))]);
      };
    } else if (m instanceof CrafterMenu) {
      m.setSlotState = (i: number, on: boolean) => {
        m.crafter.setSlotState(i, on);
        this.link.send([SB.SlotStateChanged, id, i, on]);
      };
    }
    return m;
  }

  /**
   * vanilla handleInventoryMouseClick: the click made here (to show it), then sent with the slots it changed and the
   * cursor, each as its stack's hash
   */
  private click(m: ContainerMenu, id: number, slot: number, button: number, type: ClickType, real: (slot: number, button: number, type: ClickType) => void): void {
    if (this.idOf(m) !== id) return;
    if (slot !== -999 && (slot < 0 || slot >= m.slots.length)) return;
    this.link.beforeClick();
    const before = m.slots.map((s) => stackKey(s.item));
    this.predict(() => real(slot, button, type));
    const changed: Value[] = [];
    for (let i = 0; i < m.slots.length; i++) {
      const key = stackKey(m.slots[i].item);
      if (key !== before[i]) changed.push([i, keyHash(key)]);
    }
    this.link.send([SB.ContainerClick, id, this.stateIds.get(m) ?? 0, slot, Math.max(0, Math.min(40, button)), CLICK_TYPES.indexOf(type), changed, keyHash(stackKey(m.carried))]);
    this.link.afterClick();
  }

  /**
   * a click or a button as the host will make it, shown here: nothing heard, seen or dropped, and the experience it
   * cost or gave put back (the host's says what it is)
   */
  private predict(fn: () => void): void {
    const p = this.player, level = p.level;
    const sound = level.sound, particles = level.particles, drop = p.dropHandler, levelUp = p.onLevelUp;
    const xp = [p.xpLevel, p.xpProgress, p.xpTotal];
    level.sound = MUTE_SOUND;
    level.particles = MUTE_PARTICLES as typeof level.particles;
    p.dropHandler = null;
    p.onLevelUp = null;
    try {
      fn();
    } finally {
      level.sound = sound;
      level.particles = particles;
      p.dropHandler = drop;
      p.onLevelUp = levelUp;
      [p.xpLevel, p.xpProgress, p.xpTotal] = xp;
    }
  }

  /** vanilla EnchantmentMenu.clickMenuButton on the client: whether the offer can be paid for, and if so, sent */
  private enchant(m: EnchantmentMenu, id: number, b: number): boolean {
    if (b < 0 || b >= 3) return false;
    const p = this.player, creative = p.gameMode === 'creative', need = b + 1;
    const item = m.enchantSlots.get(0), lapis = m.enchantSlots.get(1);
    if ((!lapis || lapis.count < need) && !creative) return false;
    if (m.costs[b] <= 0 || !item || ((p.xpLevel < need || p.xpLevel < m.costs[b]) && !creative)) return false;
    this.link.send([SB.ContainerButtonClick, id, b]);
    return true;
  }

  /** (its screen closed) the host told; our copy of the inventory's stays, what it holds the host's to put back */
  private closedHere(m: ContainerMenu, id: number): void {
    if (id === INVENTORY_MENU) return this.link.send([SB.ContainerClose, INVENTORY_MENU]);
    const o = this.open;
    if (!o || o.menu !== m) return;
    this.open = null;
    if (!o.closed) this.link.send([SB.ContainerClose, id]);
  }

  /** (the recipe book) the recipe clicked, for the host to fill the grid from the inventory */
  placeRecipe(m: CraftingMenuBase | FurnaceMenu, recipe: string, all: boolean): void {
    const id = this.idOf(m);
    if (id >= 0) this.link.send([SB.PlaceRecipe, id, recipe, all]);
  }
}
