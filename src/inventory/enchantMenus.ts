// Menus of the enchanting table (vanilla EnchantmentMenu), the anvil
// (AnvilMenu / ItemCombinerMenu) and the grindstone (GrindstoneMenu), with
// their vanilla slot layouts, costs and quick-move rules.

import { ContainerMenu, Slot, SimpleContainer, PlayerContainer, isEmpty } from './container';
import { ItemStack, ITEMS, Item } from '../item/item';
import type { Player } from '../entity/player';
import { JavaRandom } from '../core/rng';
import { ENCHANTMENTS, TABLE_ENCHANTMENTS, areCompatible, canEnchant, minCost } from '../item/enchantments';
import {
  EnchantmentInstance, craftingEnchants, getEnchantmentCost, hasAnyEnchantments, isEnchantable, selectEnchantment, setCraftingEnchants,
} from '../item/enchantHelper';
import { bookshelfPower, ANVILS, damagedAnvil } from '../world/blocksEnchanting';

type Pos = [number, number, number];

/** vanilla ContainerLevelAccess stillValid: the block is still there and the player within 8 blocks of it */
function blockStillValid(p: Player, pos: Pos, ok: (name: string) => boolean): boolean {
  const [x, y, z] = pos;
  return ok(p.level.getBlockName(x, y, z)) && p.distanceToSqr(x + 0.5, y + 0.5, z + 0.5) <= 64;
}

// ---------------------------------------------------------------------------
// Enchanting table

class EnchantItemSlot extends Slot {
  override maxStackSize(): number {
    return 1;
  }
}

class LapisSlot extends Slot {
  override mayPlace(s: ItemStack): boolean {
    return s.item.id === 'lapis_lazuli';
  }
  override noItemIcon(): string {
    return 'slot_lapis_lazuli';
  }
}

export class EnchantmentMenu extends ContainerMenu {
  readonly enchantSlots = new SimpleContainer(2);
  /** vanilla EnchantmentMenu.random (reseeded from the enchantment seed for every roll) */
  private readonly random = new JavaRandom(0);
  enchantmentSeed: number;
  readonly costs = [0, 0, 0];
  /** the enchantment each offer hints at (vanilla enchantClue) and its level */
  readonly enchantClue: (string | null)[] = [null, null, null];
  readonly levelClue = [-1, -1, -1];
  /** an item was enchanted (advancement "Enchanter") */
  onEnchanted: ((s: ItemStack, levels: number) => void) | null = null;

  constructor(player: Player, readonly pos: Pos) {
    super(player);
    this.enchantSlots.onChange = () => this.slotsChanged();
    this.addSlot(new EnchantItemSlot(this.enchantSlots, 0, 15, 47));
    this.addSlot(new LapisSlot(this.enchantSlots, 1, 35, 47));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
    this.enchantmentSeed = player.enchantmentSeed;
  }

  /** vanilla getGoldCount: lapis in the lapis slot */
  goldCount(): number {
    const s = this.enchantSlots.get(1);
    return isEmpty(s) ? 0 : s.count;
  }

  /** bookshelves around the table (vanilla BOOKSHELF_OFFSETS with the air check between) */
  power(): number {
    const [x, y, z] = this.pos;
    const w = this.player.level.world;
    return bookshelfPower((xx, yy, zz) => w.getState(xx, yy, zz), x, y, z);
  }

  /** vanilla EnchantmentMenu.slotsChanged: roll the three costs, then each offer's clue */
  slotsChanged(): void {
    const s = this.enchantSlots.get(0);
    if (!isEmpty(s) && isEnchantable(s)) {
      const j = this.power();
      this.random.setSeed(this.enchantmentSeed);
      for (let k = 0; k < 3; k++) {
        this.costs[k] = getEnchantmentCost(this.random, k, j, s);
        this.enchantClue[k] = null;
        this.levelClue[k] = -1;
        if (this.costs[k] < k + 1) this.costs[k] = 0;
      }
      for (let l = 0; l < 3; l++) {
        if (this.costs[l] <= 0) continue;
        const list = this.enchantmentList(s, l, this.costs[l]);
        if (list.length) {
          const e = list[this.random.nextInt(list.length)];
          this.enchantClue[l] = e.def.id;
          this.levelClue[l] = e.level;
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        this.costs[i] = 0;
        this.enchantClue[i] = null;
        this.levelClue[i] = -1;
      }
    }
  }

  /** vanilla getEnchantmentList: seeded per slot; a book loses one of several picks */
  enchantmentList(s: ItemStack, slot: number, cost: number): EnchantmentInstance[] {
    this.random.setSeed((this.enchantmentSeed + slot) | 0);
    const list = selectEnchantment(this.random, s, cost, TABLE_ENCHANTMENTS);
    if (s.item.id === 'book' && list.length > 1) list.splice(this.random.nextInt(list.length), 1);
    return list;
  }

  /** vanilla clickMenuButton: pay 1-3 lapis and levels (needing `cost` levels) for an offer */
  clickMenuButton(id: number): boolean {
    if (id < 0 || id >= 3) return false;
    const p = this.player;
    const creative = p.gameMode === 'creative';
    const item = this.enchantSlots.get(0), lapis = this.enchantSlots.get(1);
    const i = id + 1;
    if ((isEmpty(lapis) || lapis.count < i) && !creative) return false;
    if (this.costs[id] <= 0 || isEmpty(item) || ((p.xpLevel < i || p.xpLevel < this.costs[id]) && !creative)) return false;
    const list = this.enchantmentList(item, id, this.costs[id]);
    if (!list.length) return true;
    p.onEnchantmentPerformed(i);
    let out = item;
    if (item.item.id === 'book') {
      out = new ItemStack(ITEMS.get('enchanted_book')!, item.count, 0, item.tag ? { ...item.tag } : null);
      this.enchantSlots.items[0] = out;
    }
    const m = { ...craftingEnchants(out) };
    for (const e of list) m[e.def.id] = Math.max(m[e.def.id] ?? 0, e.level);
    setCraftingEnchants(out, m);
    if (!creative && lapis) {
      lapis.count -= i;
      if (lapis.count <= 0) this.enchantSlots.items[1] = null;
    }
    this.onEnchanted?.(out, i);
    this.enchantSlots.changed();
    this.enchantmentSeed = p.enchantmentSeed;
    this.slotsChanged();
    const [x, y, z] = this.pos;
    p.level.sound.play('block.enchantment_table.use', x + 0.5, y + 0.5, z + 0.5, 1, p.level.random.nextFloat() * 0.1 + 0.9);
    return true;
  }

  override stillValid(p: Player): boolean {
    return blockStillValid(p, this.pos, (n) => n === 'enchanting_table');
  }

  /** vanilla EnchantmentMenu.quickMoveStack */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    if (index === 0 || index === 1) {
      if (!this.moveItemStackTo(s, 2, 38, true)) return null;
    } else if (s.item.id === 'lapis_lazuli') {
      if (!this.moveItemStackTo(s, 1, 2, true)) return null;
    } else {
      const target = this.slots[0];
      if (target.hasItem() || !target.mayPlace(s)) return null;
      const one = s.copyWithCount(1);
      s.count--;
      target.set(one);
    }
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }

  override removed(): void {
    super.removed();
    this.clearContainer(this.enchantSlots);
  }
}

// ---------------------------------------------------------------------------
// Anvil

const PLANKS = /_planks$/;
const REPAIR_BY_TIER: Record<string, (id: string) => boolean> = {
  wooden: (id) => PLANKS.test(id),
  stone: (id) => id === 'cobblestone' || id === 'cobbled_deepslate' || id === 'blackstone',
  iron: (id) => id === 'iron_ingot',
  golden: (id) => id === 'gold_ingot',
  diamond: (id) => id === 'diamond',
  netherite: (id) => id === 'netherite_ingot',
};
const REPAIR_BY_ARMOR: Record<string, (id: string) => boolean> = {
  leather: (id) => id === 'leather',
  chainmail: (id) => id === 'iron_ingot',
  iron: (id) => id === 'iron_ingot',
  golden: (id) => id === 'gold_ingot',
  diamond: (id) => id === 'diamond',
  netherite: (id) => id === 'netherite_ingot',
  turtle: (id) => id === 'turtle_scute',
};

/** vanilla Item.isValidRepairItem: a tool's tier ingredient, an armour material's ingredient */
export function isValidRepairItem(it: Item, material: ItemStack): boolean {
  // vanilla ShieldItem.isValidRepairItem: #planks
  if (it.id === 'shield') return PLANKS.test(material.item.id);
  // vanilla ElytraItem.isValidRepairItem: phantom membrane
  if (it.id === 'elytra') return material.item.id === 'phantom_membrane';
  const mat = it.id.split('_')[0];
  if (it.tool && it.tool.type !== 'shears') return REPAIR_BY_TIER[mat]?.(material.item.id) ?? false;
  if (it.armor) return REPAIR_BY_ARMOR[mat]?.(material.item.id) ?? false;
  return false;
}

/** vanilla AnvilMenu.calculateIncreasedRepairCost */
export const increasedRepairCost = (c: number): number => Math.min(c * 2 + 1, 2147483647);

class ResultSlot extends Slot {
  constructor(c: SimpleContainer, x: number, y: number, private readonly take: (p: Player) => void, private readonly pickup: (p: Player) => boolean) {
    super(c, 0, x, y);
  }
  override mayPlace(): boolean {
    return false;
  }
  override mayPickup(p: Player): boolean {
    return this.pickup(p);
  }
  override remove(): ItemStack | null {
    const it = this.item;
    this.set(null);
    return it;
  }
  override onTake(p: Player, _s: ItemStack): void {
    this.take(p);
  }
}

/** vanilla ItemCombinerMenu.quickMoveStack (anvil and smithing layout: inputs 0-1, result 2, inventory 3-38) */
function combinerQuickMove(menu: ContainerMenu, p: Player, index: number, toInputs: (s: ItemStack) => boolean): ItemStack | null {
  const slot = menu.slots[index];
  const s = slot.item;
  if (!s) return null;
  const before = s.copy();
  if (index === 2) {
    if (!menu.moveItemStackTo(s, 3, 39, true)) return null;
    slot.onQuickCraft(s, before);
  } else if (index === 0 || index === 1) {
    if (!menu.moveItemStackTo(s, 3, 39, false)) return null;
  } else if (toInputs(s) && index >= 3 && index < 39) {
    if (!menu.moveItemStackTo(s, 0, 2, false)) return null;
  } else if (index >= 3 && index < 30) {
    if (!menu.moveItemStackTo(s, 30, 39, false)) return null;
  } else if (index >= 30 && index < 39 && !menu.moveItemStackTo(s, 3, 30, false)) return null;
  if (s.count <= 0) slot.set(null);
  else slot.setChanged();
  if (s.count === before.count) return null;
  slot.onTake(p, s);
  return before;
}

export class AnvilMenu extends ContainerMenu {
  readonly inputSlots = new SimpleContainer(2);
  readonly resultSlots = new SimpleContainer(1);
  /** vanilla cost DataSlot: levels the result costs */
  cost = 0;
  private repairItemCountCost = 0;
  /** the name typed in the screen (null until the screen sets one) */
  itemName: string | null = null;

  constructor(player: Player, readonly pos: Pos) {
    super(player);
    this.inputSlots.onChange = () => this.createResult();
    this.addSlot(new Slot(this.inputSlots, 0, 27, 47));
    this.addSlot(new Slot(this.inputSlots, 1, 76, 47));
    this.addSlot(new ResultSlot(this.resultSlots, 134, 47, (p) => this.onTake(p), (p) => (p.gameMode === 'creative' || p.xpLevel >= this.cost) && this.cost > 0));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }

  private setResult(s: ItemStack | null): void {
    this.resultSlots.items[0] = s && s.count > 0 ? s : null;
  }

  /** vanilla AnvilMenu.createResult */
  createResult(): void {
    const left = this.inputSlots.get(0);
    this.cost = 1;
    let i = 0;
    let j = 0;
    let k = 0;
    const creative = this.player.gameMode === 'creative';
    if (isEmpty(left)) {
      this.setResult(null);
      this.cost = 0;
      return;
    }
    let out: ItemStack | null = left.copy();
    const right = this.inputSlots.get(1);
    const ench: Record<string, number> = { ...craftingEnchants(out) };
    j += (left.tag?.repairCost ?? 0) + (right?.tag?.repairCost ?? 0);
    this.repairItemCountCost = 0;
    if (!isEmpty(right)) {
      const book = right.item.id === 'enchanted_book';
      const max = out.item.maxDamage;
      if (max > 0 && isValidRepairItem(out.item, right)) {
        // repair with the material: a quarter of the durability per item
        let l2 = Math.min(out.damage, Math.floor(max / 4));
        if (l2 <= 0) {
          this.setResult(null);
          this.cost = 0;
          return;
        }
        let j3 = 0;
        for (; l2 > 0 && j3 < right.count; j3++) {
          out.damage -= l2;
          i++;
          l2 = Math.min(out.damage, Math.floor(max / 4));
        }
        this.repairItemCountCost = j3;
      } else {
        if (!book && (out.item !== right.item || max <= 0)) {
          this.setResult(null);
          this.cost = 0;
          return;
        }
        if (max > 0 && !book) {
          // combining two of the same item: their durability plus a 12% bonus
          const l = left.item.maxDamage - left.damage;
          const i1 = right.item.maxDamage - right.damage;
          const j1 = i1 + Math.floor((max * 12) / 100);
          const k1 = l + j1;
          let l1 = max - k1;
          if (l1 < 0) l1 = 0;
          if (l1 < out.damage) {
            out.damage = l1;
            i += 2;
          }
        }
        const add = craftingEnchants(right);
        let any = false, incompatible = false;
        for (const [id, lvl0] of Object.entries(add)) {
          const def = ENCHANTMENTS.get(id);
          if (!def) continue;
          const i2 = ench[id] ?? 0;
          let j2 = i2 === lvl0 ? lvl0 + 1 : Math.max(lvl0, i2);
          let ok = canEnchant(def, left.item);
          if (creative || left.item.id === 'enchanted_book') ok = true;
          for (const other of Object.keys(ench)) {
            if (other !== id && !areCompatible(id, other)) {
              ok = false;
              i++;
            }
          }
          if (!ok) incompatible = true;
          else {
            any = true;
            if (j2 > def.maxLevel) j2 = def.maxLevel;
            ench[id] = j2;
            let l3 = def.anvilCost;
            if (book) l3 = Math.max(1, Math.floor(l3 / 2));
            i += l3 * j2;
            if (left.count > 1) i = 40;
          }
        }
        if (incompatible && !any) {
          this.setResult(null);
          this.cost = 0;
          return;
        }
      }
    }
    // renaming (vanilla compares with the hover name; blank clears a custom name)
    const hover = left.displayName();
    if (this.itemName !== null && this.itemName.trim() !== '') {
      if (this.itemName !== hover) {
        k = 1;
        i += k;
        out.tag = { ...(out.tag ?? {}), customName: this.itemName };
      }
    } else if (left.tag?.customName !== undefined) {
      k = 1;
      i += k;
      const t = { ...(out.tag ?? {}) };
      delete t.customName;
      out.tag = Object.keys(t).length ? t : null;
    }
    this.cost = Math.max(0, Math.min(2147483647, j + i));
    if (i <= 0) out = null;
    if (k === i && k > 0 && this.cost >= 40) this.cost = 39;
    if (this.cost >= 40 && !creative) out = null;
    if (out) {
      let i3 = out.tag?.repairCost ?? 0;
      const rc = right?.tag?.repairCost ?? 0;
      if (i3 < rc) i3 = rc;
      if (k !== i || k === 0) i3 = increasedRepairCost(i3);
      out.tag = { ...(out.tag ?? {}), repairCost: i3 };
      if (!i3) delete out.tag.repairCost;
      setCraftingEnchants(out, ench);
    }
    this.setResult(out);
  }

  /** vanilla AnvilMenu.setItemName: names over 50 characters are refused */
  setItemName(name: string): boolean {
    const s = name.replace(/[\u0000-\u001f\u007f§]/g, '');
    if (s.length > 50 || s === this.itemName) return false;
    this.itemName = s;
    const res = this.resultSlots.get(0);
    if (res) {
      if (s.trim() === '') {
        if (res.tag) delete res.tag.customName;
      } else res.tag = { ...(res.tag ?? {}), customName: s };
    }
    this.createResult();
    return true;
  }

  /** vanilla AnvilMenu.onTake: pay the levels, use up the inputs, and maybe damage the anvil (12%) */
  private onTake(p: Player): void {
    const creative = p.gameMode === 'creative';
    if (!creative) p.giveExperienceLevels(-this.cost);
    const rest = this.repairItemCountCost;
    this.inputSlots.items[0] = null;
    const right = this.inputSlots.get(1);
    if (rest > 0 && right && right.count > rest) right.count -= rest;
    else this.inputSlots.items[1] = null;
    this.cost = 0;
    this.inputSlots.changed();
    const [x, y, z] = this.pos;
    const lvl = p.level;
    let destroyed = false;
    if (!creative && ANVILS.includes(lvl.getBlockName(x, y, z)) && Math.random() < 0.12) {
      const next = damagedAnvil(lvl.getState(x, y, z));
      lvl.setBlock(x, y, z, next ?? 0);
      destroyed = next === null;
    }
    // level events 1029 (anvil destroyed) / 1030 (anvil used)
    lvl.sound.play(destroyed ? 'block.anvil.destroy' : 'block.anvil.use', x + 0.5, y + 0.5, z + 0.5, 1, lvl.random.nextFloat() * 0.1 + 0.9);
  }

  override stillValid(p: Player): boolean {
    return blockStillValid(p, this.pos, (n) => ANVILS.includes(n));
  }

  quickMoveStack(p: Player, index: number): ItemStack | null {
    return combinerQuickMove(this, p, index, () => true);
  }

  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot): boolean {
    return slot.container !== this.resultSlots;
  }

  override removed(): void {
    super.removed();
    this.clearContainer(this.inputSlots);
  }
}

// ---------------------------------------------------------------------------
// Grindstone

class GrindstoneInputSlot extends Slot {
  override mayPlace(s: ItemStack): boolean {
    return s.item.maxDamage > 0 || hasAnyEnchantments(s);
  }
}

export class GrindstoneMenu extends ContainerMenu {
  readonly repairSlots = new SimpleContainer(2);
  readonly resultSlots = new SimpleContainer(1);

  constructor(player: Player, readonly pos: Pos) {
    super(player);
    this.repairSlots.onChange = () => this.createResult();
    this.addSlot(new GrindstoneInputSlot(this.repairSlots, 0, 49, 19));
    this.addSlot(new GrindstoneInputSlot(this.repairSlots, 1, 49, 40));
    this.addSlot(new ResultSlot(this.resultSlots, 129, 34, (p) => this.onTake(p), () => true));
    this.addPlayerSlots(new PlayerContainer(player), 8, 84);
  }

  private createResult(): void {
    const r = this.computeResult(this.repairSlots.get(0), this.repairSlots.get(1));
    this.resultSlots.items[0] = r && r.count > 0 ? r : null;
  }

  /** vanilla GrindstoneMenu.computeResult */
  private computeResult(a: ItemStack | null, b: ItemStack | null): ItemStack | null {
    if (isEmpty(a) && isEmpty(b)) return null;
    if ((a?.count ?? 0) > 1 || (b?.count ?? 0) > 1) return null;
    if (isEmpty(a) || isEmpty(b)) {
      const s = !isEmpty(a) ? a : b!;
      return hasAnyEnchantments(s) ? this.removeNonCursesFrom(s.copy()) : null;
    }
    return this.mergeItems(a, b);
  }

  /** vanilla mergeItems: two of the same item repair each other (+5%), curses from both are kept */
  private mergeItems(a: ItemStack, b: ItemStack): ItemStack | null {
    if (a.item !== b.item) return null;
    const max = Math.max(a.item.maxDamage, b.item.maxDamage);
    const j = a.item.maxDamage - a.damage, k = b.item.maxDamage - b.damage;
    const l = j + k + Math.floor((max * 5) / 100);
    let n = 1;
    if (a.item.maxDamage <= 0) {
      if (a.maxStack < 2 || !a.sameItem(b) || a.count !== b.count) return null;
      n = 2;
    }
    const out = a.copyWithCount(n);
    if (out.item.maxDamage > 0) out.damage = Math.max(max - l, 0);
    // mergeEnchantsFrom: curses the result lacks come over (everything else is ground off anyway)
    const m = { ...craftingEnchants(out) };
    for (const [id, lvl] of Object.entries(craftingEnchants(b))) {
      const curse = !!ENCHANTMENTS.get(id)?.curse;
      if (!curse || !m[id]) m[id] = Math.max(m[id] ?? 0, lvl);
    }
    setCraftingEnchants(out, m);
    return this.removeNonCursesFrom(out);
  }

  /** vanilla removeNonCursesFrom: a book left with nothing is a plain book again; the work penalty is reset */
  private removeNonCursesFrom(s: ItemStack): ItemStack {
    const kept: Record<string, number> = {};
    for (const [id, lvl] of Object.entries(craftingEnchants(s))) if (ENCHANTMENTS.get(id)?.curse) kept[id] = lvl;
    setCraftingEnchants(s, kept);
    let out = s;
    if (s.item.id === 'enchanted_book' && !Object.keys(kept).length) out = new ItemStack(ITEMS.get('book')!, s.count, 0, s.tag);
    let c = 0;
    for (let j = 0; j < Object.keys(kept).length; j++) c = increasedRepairCost(c);
    const tag = { ...(out.tag ?? {}) };
    if (c) tag.repairCost = c;
    else delete tag.repairCost;
    out.tag = Object.keys(tag).length ? tag : null;
    return out;
  }

  /** vanilla GrindstoneMenu result slot getExperienceAmount: half the non-curse enchantments' min costs, randomly up to double */
  experienceAmount(): number {
    let i = 0;
    for (const s of [this.repairSlots.get(0), this.repairSlots.get(1)]) {
      if (isEmpty(s)) continue;
      for (const [id, lvl] of Object.entries(craftingEnchants(s))) {
        const def = ENCHANTMENTS.get(id);
        if (def && !def.curse) i += minCost(def, lvl);
      }
    }
    if (i <= 0) return 0;
    const j = Math.ceil(i / 2);
    return j + this.player.level.random.nextInt(j);
  }

  private onTake(p: Player): void {
    const [x, y, z] = this.pos;
    const xp = this.experienceAmount();
    if (xp > 0) p.level.awardExperience(x + 0.5, y + 0.5, z + 0.5, xp);
    // level event 1042
    p.level.sound.play('block.grindstone.use', x + 0.5, y + 0.5, z + 0.5, 1, p.level.random.nextFloat() * 0.1 + 0.9);
    this.repairSlots.items[0] = null;
    this.repairSlots.items[1] = null;
    this.repairSlots.changed();
  }

  override stillValid(p: Player): boolean {
    return blockStillValid(p, this.pos, (n) => n === 'grindstone');
  }

  /** vanilla GrindstoneMenu.quickMoveStack */
  quickMoveStack(p: Player, index: number): ItemStack | null {
    const slot = this.slots[index];
    const s = slot.item;
    if (!s) return null;
    const before = s.copy();
    const a = this.repairSlots.get(0), b = this.repairSlots.get(1);
    if (index === 2) {
      if (!this.moveItemStackTo(s, 3, 39, true)) return null;
      slot.onQuickCraft(s, before);
    } else if (index !== 0 && index !== 1) {
      if (!isEmpty(a) && !isEmpty(b)) {
        if (index >= 3 && index < 30) {
          if (!this.moveItemStackTo(s, 30, 39, false)) return null;
        } else if (index >= 30 && index < 39 && !this.moveItemStackTo(s, 3, 30, false)) return null;
      } else if (!this.moveItemStackTo(s, 0, 2, false)) return null;
    } else if (!this.moveItemStackTo(s, 3, 39, false)) return null;
    if (s.count <= 0) slot.set(null);
    else slot.setChanged();
    if (s.count === before.count) return null;
    slot.onTake(p, s);
    return before;
  }

  override canTakeItemForPickAll(_s: ItemStack | null, slot: Slot): boolean {
    return slot.container !== this.resultSlots;
  }

  override removed(): void {
    super.removed();
    this.clearContainer(this.repairSlots);
  }
}
