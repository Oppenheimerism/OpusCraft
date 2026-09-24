// Container menus: player inventory (2x2 crafting), crafting table, furnace,
// chest and the creative item picker (vanilla slot layouts).

import { ContainerMenu, Slot, SimpleContainer, PlayerContainer, Container, isEmpty } from './container';
import { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import { findRecipe, craftingRemainder, cookingResult, fuelTime, CraftingRecipe } from './recipes';
import type { ChestBlockEntity, FurnaceBlockEntity } from '../world/blockEntity';
import { hasBinding } from '../item/enchantHelper';
import { equipSound } from '../item/equipment';
import { applyDyes, dyeColorName, isDyeable } from '../item/dyedColor';

const ARMOR_ICONS = ['slot_boots', 'slot_leggings', 'slot_chestplate', 'slot_helmet'];
const ARMOR_SLOT_OF: Record<string, number> = { feet: 0, legs: 1, chest: 2, head: 3 };

export class ArmorSlot extends Slot {
  constructor(private readonly inv: PlayerContainer, private readonly armorIndex: number, x: number, y: number) {
    super(inv, 36 + armorIndex, x, y);
  }
  /** vanilla ArmorSlot.setByPlayer → LivingEntity.onEquipItem: a piece put on (not the very same) plays its equip sound */
  override set(s: ItemStack | null): void {
    const old = this.item;
    super.set(s);
    if (!s || (old && old.sameItem(s)) || !this.mayPlace(s)) return;
    const p = this.inv.player, snd = equipSound(s.item);
    if (snd && p.gameMode !== 'spectator') p.level.sound.play(snd, p.x, p.y, p.z, 1, 1);
  }
  override maxStackSize(): number {
    return 1;
  }
  override mayPlace(s: ItemStack): boolean {
    return !!s.item.armor && ARMOR_SLOT_OF[s.item.armor.slot] === this.armorIndex;
  }
  override noItemIcon(): string {
    return ARMOR_ICONS[this.armorIndex];
  }
  /** vanilla: curse of binding (prevent_armor_change) keeps the piece on, except in creative */
  override mayPickup(p: Player): boolean {
    const it = this.item;
    return it && p.gameMode !== 'creative' && hasBinding(it) ? false : super.mayPickup(p);
  }
}

export class OffhandSlot extends Slot {
  override noItemIcon(): string {
    return 'slot_shield';
  }
}

/** crafting output: taking it consumes one of every ingredient */
export class ResultSlot extends Slot {
  constructor(result: Container, private readonly craft: SimpleContainer, private readonly menu: CraftingLike, x: number, y: number) {
    super(result, 0, x, y);
  }
  override mayPlace(): boolean {
    return false;
  }
  override remove(): ItemStack | null {
    const it = this.item;
    this.set(null);
    return it;
  }
  override onTake(p: Player, _s: ItemStack): void {
    const c = this.craft;
    this.menu.suppressUpdate = true;
    for (let i = 0; i < c.size; i++) {
      const s = c.items[i];
      if (!s) continue;
      const rem = craftingRemainder(s);
      s.count--;
      if (s.count <= 0) c.items[i] = null;
      if (rem) {
        const cur = c.items[i];
        if (!cur) c.items[i] = rem;
        else if (cur.item === rem.item) cur.count += rem.count;
        else {
          const left = p.inventory.add(rem);
          if (left > 0) p.dropItem(rem.copyWithCount(left), false);
        }
      }
    }
    this.menu.suppressUpdate = false;
    this.menu.slotsChanged();
  }
}

interface CraftingLike {
  suppressUpdate: boolean;
  slotsChanged(): void;
}

/**
 * vanilla ArmorDyeRecipe (a special recipe: no recipe book entry): one piece of leather armour and any dyes, anywhere
 * in the grid and nothing else, make the piece in the colours mixed (DyedItemColor.applyDyes)
 */
function armorDye(grid: readonly (ItemStack | null)[]): ItemStack | null {
  let piece: ItemStack | null = null;
  const dyes: string[] = [];
  for (const s of grid) {
    if (!s) continue;
    if (isDyeable(s.item)) {
      if (piece) return null;
      piece = s;
    } else {
      const d = dyeColorName(s.item);
      if (!d) return null;
      dyes.push(d);
    }
  }
  return piece && dyes.length ? applyDyes(piece, dyes) : null;
}

export abstract class CraftingMenuBase extends ContainerMenu implements CraftingLike {
  readonly craft: SimpleContainer;
  readonly result = new SimpleContainer(1);
  suppressUpdate = false;
  recipe: CraftingRecipe | null = null;
  constructor(player: Player, readonly gridW: number) {
    super(player);
    this.craft = new SimpleContainer(gridW * gridW);
    this.craft.onChange = () => {
      if (!this.suppressUpdate) this.slotsChanged();
    };
  }
  slotsChanged(): void {
    this.recipe = findRecipe(this.craft.items, this.gridW, this.gridW);
    this.result.items[0] = this.recipe ? ItemStack.of(this.recipe.result, this.recipe.count) : armorDye(this.craft.items);
  }
  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot): boolean {
    return slot.container !== this.result;
  }
  override canDragTo(slot: Slot): boolean {
    return slot.container !== this.result;
  }
  override removed(): void {
    super.removed();
    this.clearContainer(this.craft);
  }
}

export class InventoryMenu extends CraftingMenuBase {
  readonly inv: PlayerContainer;
  constructor(player: Player) {
    super(player, 2);
    const inv = (this.inv = new PlayerContainer(player));
    this.addSlot(new ResultSlot(this.result, this.craft, this, 154, 28));
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) this.addSlot(new Slot(this.craft, x + y * 2, 98 + x * 18, 18 + y * 18));
    for (let i = 0; i < 4; i++) this.addSlot(new ArmorSlot(inv, 3 - i, 8, 8 + i * 18));
    this.addPlayerSlots(inv, 8, 84);
    this.addSlot(new OffhandSlot(inv, 40, 77, 62));
  }

  /** vanilla InventoryMenu.quickMoveStack */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    const armor = s.item.armor ? ARMOR_SLOT_OF[s.item.armor.slot] : -1;
    if (index === 0) {
      if (!this.moveItemStackTo(s, 9, 45, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index >= 1 && index < 5) {
      if (!this.moveItemStackTo(s, 9, 45, false)) return null;
    } else if (index >= 5 && index < 9) {
      if (!this.moveItemStackTo(s, 9, 45, false)) return null;
    } else if (armor >= 0 && !this.slots[8 - armor].hasItem()) {
      const i = 8 - armor;
      if (!this.moveItemStackTo(s, i, i + 1, false)) return null;
    } else if (index >= 9 && index < 36) {
      if (!this.moveItemStackTo(s, 36, 45, false)) return null;
    } else if (index >= 36 && index < 45) {
      if (!this.moveItemStackTo(s, 9, 36, false)) return null;
    } else if (!this.moveItemStackTo(s, 9, 45, false)) return null;
    if (s.count <= 0) {
      if (index === 0) slot.set(null);
      else slot.set(null);
    } else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    if (index === 0 && s.count > 0) p.dropItem(s, false);
    return before;
  }
}

export class CraftingMenu extends CraftingMenuBase {
  constructor(player: Player, private readonly pos: [number, number, number]) {
    super(player, 3);
    const inv = new PlayerContainer(player);
    this.addSlot(new ResultSlot(this.result, this.craft, this, 124, 35));
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) this.addSlot(new Slot(this.craft, x + y * 3, 30 + x * 18, 17 + y * 18));
    this.addPlayerSlots(inv, 8, 84);
  }

  override stillValid(p: Player): boolean {
    const [x, y, z] = this.pos;
    return p.level.getBlockName(x, y, z) === 'crafting_table' && p.distanceToSqr(x + 0.5, y + 0.5, z + 0.5) <= 64;
  }

  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index === 0) {
      if (!this.moveItemStackTo(s, 10, 46, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index >= 10 && index < 46) {
      if (!this.moveItemStackTo(s, 1, 10, false)) {
        if (index < 37) {
          if (!this.moveItemStackTo(s, 37, 46, false)) return null;
        } else if (!this.moveItemStackTo(s, 10, 37, false)) return null;
      }
    } else if (!this.moveItemStackTo(s, 10, 46, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    if (index === 0 && s.count > 0) p.dropItem(s, false);
    return before;
  }
}

class FurnaceFuelSlot extends Slot {
  override mayPlace(s: ItemStack): boolean {
    return fuelTime(s) > 0 || s.item.id === 'bucket';
  }
  override maxStackSize(s?: ItemStack): number {
    return s?.item.id === 'bucket' ? 1 : super.maxStackSize(s);
  }
}

class FurnaceResultSlot extends Slot {
  constructor(private readonly furnace: FurnaceBlockEntity, x: number, y: number) {
    super(furnace.container, 2, x, y);
  }
  override mayPlace(): boolean {
    return false;
  }
  override onTake(p: Player, s: ItemStack): void {
    // vanilla awardUsedRecipesAndPopExperience: floor + random fraction
    const xp = this.furnace.storedXp;
    this.furnace.storedXp = 0;
    let n = Math.floor(xp);
    if (Math.random() < xp - n) n++;
    if (n > 0) p.giveExperiencePoints(n);
    void s;
    super.onTake(p, s);
  }
}

export class FurnaceMenu extends ContainerMenu {
  constructor(player: Player, readonly furnace: FurnaceBlockEntity) {
    super(player);
    const c = furnace.container;
    this.addSlot(new Slot(c, 0, 56, 17));
    this.addSlot(new FurnaceFuelSlot(c, 1, 56, 53));
    this.addSlot(new FurnaceResultSlot(furnace, 116, 35));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }
  override stillValid(p: Player): boolean {
    const f = this.furnace;
    return !f.removed && p.distanceToSqr(f.x + 0.5, f.y + 0.5, f.z + 0.5) <= 64;
  }
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index === 2) {
      if (!this.moveItemStackTo(s, 3, 39, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index !== 1 && index !== 0) {
      if (cookingResult(this.furnace.id, s)) {
        if (!this.moveItemStackTo(s, 0, 1, false)) return null;
      } else if (fuelTime(s) > 0) {
        if (!this.moveItemStackTo(s, 1, 2, false)) return null;
      } else if (index >= 3 && index < 30) {
        if (!this.moveItemStackTo(s, 30, 39, false)) return null;
      } else if (index >= 30 && index < 39 && !this.moveItemStackTo(s, 3, 30, false)) return null;
    } else if (!this.moveItemStackTo(s, 3, 39, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }
}

/** a container that isn't a block (vanilla ContainerEntity: chest minecarts) */
export interface ContainerEntity {
  readonly container: SimpleContainer;
  /** vanilla Container.stillValid */
  containerStillValid(p: Player): boolean;
}

export class ChestMenu extends ContainerMenu {
  readonly rows: number;
  /** `title` is the container's display name (vanilla MenuProvider.getDisplayName) */
  constructor(player: Player, readonly chest: ChestBlockEntity | ContainerEntity, readonly title = 'Chest') {
    super(player);
    this.rows = 3;
    const c = chest.container;
    for (let r = 0; r < this.rows; r++) for (let x = 0; x < 9; x++) this.addSlot(new Slot(c, x + r * 9, 8 + x * 18, 18 + r * 18));
    const off = (this.rows - 4) * 18;
    this.addPlayerSlots(new PlayerContainer(player), 8, 103 + off);
  }
  override stillValid(p: Player): boolean {
    const c = this.chest;
    if ('containerStillValid' in c) return c.containerStillValid(p);
    return !c.removed && p.distanceToSqr(c.x + 0.5, c.y + 0.5, c.z + 0.5) <= 64;
  }
  quickMoveStack(_p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    const n = this.rows * 9;
    if (index < n) {
      if (!this.moveItemStackTo(s, n, this.slots.length, true)) return null;
    } else if (!this.moveItemStackTo(s, 0, n, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    return before;
  }
}

/** creative "item picker": 45 display slots + the hotbar */
export class CreativeMenu extends ContainerMenu {
  readonly display = new SimpleContainer(45);
  items: ItemStack[] = [];
  constructor(player: Player) {
    super(player);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) this.addSlot(new Slot(this.display, c + r * 9, 9 + c * 18, 18 + r * 18));
    const inv = new PlayerContainer(player);
    for (let c = 0; c < 9; c++) this.addSlot(new Slot(inv, c, 9 + c * 18, 112));
  }
  canScroll(): boolean {
    return this.items.length > 45;
  }
  scrollTo(f: number): void {
    const rows = Math.ceil(this.items.length / 9) - 5;
    const start = Math.max(0, Math.round(f * rows)) * 9;
    for (let i = 0; i < 45; i++) this.display.items[i] = this.items[start + i] ?? null;
  }
  quickMoveStack(_p: Player, index: number): ItemStack | null {
    if (index >= this.slots.length - 9 && index < this.slots.length) {
      const slot = this.slots[index];
      if (slot.hasItem()) slot.set(null);
    }
    return null;
  }
  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot): boolean {
    return slot.container !== this.display;
  }
  override canDragTo(slot: Slot): boolean {
    return slot.container !== this.display;
  }
}

export { isEmpty };
