// The recipe book (vanilla RecipeBook, ClientRecipeBook, RecipeCollection,
// StackedContents and ServerPlaceRecipe): every crafting and smelting recipe
// with its book category and group, the recipes a player has unlocked, what
// their inventory can make, and moving a clicked recipe's ingredients into a
// crafting grid or furnace.

import { RECIPES, SMELTING, SMOKING, BLASTING, expand, CraftingRecipe } from './recipes';
import { ITEMS, ItemStack } from '../item/item';

export type BookType = 'crafting' | 'furnace' | 'smoker' | 'blast_furnace';
export type BookCategory =
  | 'crafting_search' | 'crafting_equipment' | 'crafting_building_blocks' | 'crafting_misc' | 'crafting_redstone'
  | 'furnace_search' | 'furnace_food' | 'furnace_blocks' | 'furnace_misc'
  | 'smoker_search' | 'smoker_food' | 'blast_furnace_search' | 'blast_furnace_blocks' | 'blast_furnace_misc';
export const BOOK_TYPES: BookType[] = ['crafting', 'furnace', 'smoker', 'blast_furnace'];

/** vanilla RecipeBookCategories per book, in tab order, with their icons */
export const BOOK_TABS: Record<BookType, { category: BookCategory; icons: string[] }[]> = {
  crafting: [
    { category: 'crafting_search', icons: ['compass'] },
    { category: 'crafting_equipment', icons: ['iron_axe', 'golden_sword'] },
    { category: 'crafting_building_blocks', icons: ['bricks'] },
    { category: 'crafting_misc', icons: ['lava_bucket', 'apple'] },
    { category: 'crafting_redstone', icons: ['redstone'] },
  ],
  furnace: [
    { category: 'furnace_search', icons: ['compass'] },
    { category: 'furnace_food', icons: ['porkchop'] },
    { category: 'furnace_blocks', icons: ['stone'] },
    { category: 'furnace_misc', icons: ['lava_bucket', 'emerald'] },
  ],
  smoker: [
    { category: 'smoker_search', icons: ['compass'] },
    { category: 'smoker_food', icons: ['porkchop'] },
  ],
  blast_furnace: [
    { category: 'blast_furnace_search', icons: ['compass'] },
    { category: 'blast_furnace_blocks', icons: ['redstone_ore'] },
    { category: 'blast_furnace_misc', icons: ['iron_shovel', 'golden_leggings'] },
  ],
};

export interface BookRecipe {
  id: string;
  type: BookType;
  category: BookCategory;
  /** vanilla recipe group: recipes sharing one share a button */
  group: string;
  result: string;
  count: number;
  shaped: boolean;
  /** shaped footprint (shapeless: 0) */
  width: number;
  height: number;
  /** ingredient per pattern cell (shaped, null = blank) or per ingredient (shapeless) */
  slots: (Set<string> | null)[];
  xp: number;
  /** items whose pickup unlocks the recipe (vanilla recipe advancements' has_* criteria) */
  unlockBy: Set<string>;
  /** the crafting recipe this came from */
  source?: CraftingRecipe;
}

// ---------------------------------------------------------------------------
// categories and groups (vanilla RecipeCategory → CraftingBookCategory)

const WOOD = '(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo|crimson|warped)';
const EQUIPMENT = /_(pickaxe|axe|shovel|hoe|sword|helmet|chestplate|leggings|boots)$|^(bow|arrow|shears|flint_and_steel|bucket|fishing_rod|compass|clock|lead|shield|crossbow|spyglass|brush|recovery_compass|carrot_on_a_stick|mace|wind_charge)$/;
const REDSTONE = /_(door|trapdoor|fence_gate|pressure_plate|button)$|^(redstone_block|redstone_torch|tnt|lever|piston|sticky_piston|observer|repeater|comparator|dispenser|dropper|hopper|daylight_detector|target|lectern|note_block|tripwire_hook|trapped_chest|lightning_rod|redstone_lamp)$/;
const BUILDING = new RegExp(
  `_planks$|^${WOOD}_(slab|stairs)$|_wood$|_stained_glass$|_terracotta$|_wool$|_concrete_powder$|^(bricks|stone_bricks|mossy_stone_bricks|mossy_cobblestone|bookshelf|hay_block|coal_block|iron_block|gold_block|diamond_block|emerald_block|lapis_block|copper_block|raw_iron_block|raw_gold_block|raw_copper_block|snow_block|clay|glowstone|sandstone|red_sandstone|packed_mud|mud_bricks|quartz_block|jack_o_lantern|melon)$|^(polished|chiseled|cut|smooth)_|_(slab|stairs)$|_bricks$`,
);

function craftingCategory(result: string, r?: CraftingRecipe): BookCategory {
  // (trial chambers) vanilla waxRecipes are all RecipeCategory.BUILDING_BLOCKS, as is every age's cut copper,
  // chiseled copper and grate; the bulbs are REDSTONE
  if (r?.kind === 'shapeless' && r.ingredients.includes('honeycomb')) return 'crafting_building_blocks';
  if (/copper_bulb$/.test(result)) return 'crafting_redstone';
  // (trial chambers) and the crafter
  if (result === 'crafter') return 'crafting_redstone';
  if (/(cut|chiseled)_copper$|copper_grate$/.test(result)) return 'crafting_building_blocks';
  if (EQUIPMENT.test(result)) return 'crafting_equipment';
  if (REDSTONE.test(result)) return 'crafting_redstone';
  if (/_wall$|_pane$|_carpet$/.test(result)) return 'crafting_misc';
  if (BUILDING.test(result)) return 'crafting_building_blocks';
  return 'crafting_misc';
}

function craftingGroup(result: string, r: CraftingRecipe): string {
  const wood = new RegExp(`^${WOOD}_`).test(result) || /^stripped_/.test(result);
  if (result.endsWith('_planks')) return 'planks';
  if (result.endsWith('_wood')) return 'bark';
  if (wood) {
    for (const [suffix, g] of [['_slab', 'wooden_slab'], ['_stairs', 'wooden_stairs'], ['_door', 'wooden_door'], ['_trapdoor', 'wooden_trapdoor'], ['_fence_gate', 'wooden_fence_gate'], ['_fence', 'wooden_fence'], ['_sign', 'wooden_sign'], ['_chest_boat', 'chest_boat'], ['_boat', 'boat'], ['_pressure_plate', 'wooden_pressure_plate'], ['_button', 'wooden_button']] as const) {
      if (result.endsWith(suffix)) return g;
    }
  }
  if (result.endsWith('_bed')) return 'bed';
  if (result.endsWith('_carpet') && result !== 'moss_carpet') return 'carpet';
  if (result.endsWith('_stained_glass_pane')) return 'stained_glass_pane';
  if (result.endsWith('_stained_glass')) return 'stained_glass';
  if (result.endsWith('_terracotta')) return 'stained_terracotta';
  if (result.endsWith('_wool') && r.kind === 'shapeless') return 'wool';
  if (result.endsWith('_dye')) return result;
  if (result === 'stick') return 'sticks';
  if (result === 'bone_meal') return 'bonemeal';
  // (trial chambers) vanilla copper_ingot and copper_ingot_from_waxed_copper_block
  if (result === 'copper_ingot') return 'copper_ingot';
  if (result === 'rabbit_stew') return 'rabbit_stew';
  return '';
}

function smeltingCategory(result: string): BookCategory {
  const it = ITEMS.get(result);
  if (it?.food) return 'furnace_food';
  if (it?.block) return 'furnace_blocks';
  return 'furnace_misc';
}

// ---------------------------------------------------------------------------
// the recipe list

export const BOOK_RECIPES: BookRecipe[] = [];
export const BOOK_BY_ID = new Map<string, BookRecipe>();

function unlockItems(slots: (Set<string> | null)[]): Set<string> {
  // the specific materials (not "any other wool" style catch-alls) unlock a recipe
  const out = new Set<string>();
  for (const s of slots) if (s && s.size <= 12) for (const id of s) out.add(id);
  if (!out.size) for (const s of slots) if (s) for (const id of s) out.add(id);
  return out;
}

function addRecipe(r: Omit<BookRecipe, 'id'>, base: string): void {
  let id = base, n = 2;
  while (BOOK_BY_ID.has(id)) id = `${base}_${n++}`;
  const full = { ...r, id };
  BOOK_RECIPES.push(full);
  BOOK_BY_ID.set(id, full);
}

for (const r of RECIPES) {
  const shaped = r.kind === 'shaped';
  const slots: (Set<string> | null)[] = shaped
    ? r.pattern.flatMap((row) => [...row].map((ch) => (ch === ' ' ? null : expand(r.key[ch]))))
    : r.ingredients.map((g) => expand(g));
  addRecipe(
    {
      type: 'crafting', category: craftingCategory(r.result, r), group: craftingGroup(r.result, r), result: r.result, count: r.count,
      shaped, width: shaped ? r.pattern[0].length : 0, height: shaped ? r.pattern.length : 0, slots, xp: 0, unlockBy: unlockItems(slots), source: r,
    },
    r.result,
  );
}
for (const s of SMELTING) {
  const slots = [new Set(s.inputs)];
  const ore = !ITEMS.get(s.result)?.food && !ITEMS.get(s.result)?.block && s.result !== 'charcoal';
  addRecipe(
    {
      type: 'furnace', category: smeltingCategory(s.result), group: ore ? s.result : '', result: s.result, count: 1,
      shaped: false, width: 0, height: 0, slots, xp: s.xp, unlockBy: new Set(s.inputs),
    },
    s.inputs.length === 1 ? `${s.result}_from_smelting_${s.inputs[0]}` : `${s.result}_from_smelting`,
  );
}
// (vanilla: everything smoked is food; a blasted block goes under blocks, anything else under misc)
for (const s of SMOKING) {
  addRecipe(
    { type: 'smoker', category: 'smoker_food', group: '', result: s.result, count: 1, shaped: false, width: 0, height: 0, slots: [new Set(s.inputs)], xp: s.xp, unlockBy: new Set(s.inputs) },
    `${s.result}_from_smoking`,
  );
}
for (const s of BLASTING) {
  const category: BookCategory = ITEMS.get(s.result)?.block ? 'blast_furnace_blocks' : 'blast_furnace_misc';
  addRecipe(
    { type: 'blast_furnace', category, group: s.inputs.length === 1 ? s.result : '', result: s.result, count: 1, shaped: false, width: 0, height: 0, slots: [new Set(s.inputs)], xp: s.xp, unlockBy: new Set(s.inputs) },
    s.inputs.length === 1 ? `${s.result}_from_blasting_${s.inputs[0]}` : `${s.result}_from_blasting`,
  );
}

/** vanilla Recipe.canCraftInDimensions */
export function fits(r: BookRecipe, w: number, h: number): boolean {
  if (r.type !== 'crafting') return true;
  return r.shaped ? r.width <= w && r.height <= h : r.slots.length <= w * h;
}

/**
 * vanilla RecipeCollection: the recipes of one book button — every recipe of a
 * group, or a recipe on its own — in book order.
 */
export interface RecipeCollection {
  key: string;
  category: BookCategory;
  recipes: BookRecipe[];
}

let COLLECTIONS: Map<BookType, RecipeCollection[]> | null = null;
export function collections(type: BookType): RecipeCollection[] {
  if (!COLLECTIONS) {
    COLLECTIONS = new Map();
    for (const t of BOOK_TYPES) {
      const list: RecipeCollection[] = [];
      const byGroup = new Map<string, RecipeCollection>();
      for (const r of BOOK_RECIPES) {
        if (r.type !== t) continue;
        const key = r.group ? `${r.category}/${r.group}` : `#${r.id}`;
        let c = byGroup.get(key);
        if (!c) {
          c = { key, category: r.category, recipes: [] };
          byGroup.set(key, c);
          list.push(c);
        }
        c.recipes.push(r);
      }
      COLLECTIONS.set(t, list);
    }
  }
  return COLLECTIONS.get(type)!;
}

// ---------------------------------------------------------------------------
// what the player can make (vanilla StackedContents)

/** counts of undamaged items (vanilla only uses "simple" stacks) */
export function countItems(stacks: (ItemStack | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of stacks) {
    if (!s || s.count <= 0 || s.damage > 0) continue;
    m.set(s.item.id, (m.get(s.item.id) ?? 0) + s.count);
  }
  return m;
}

/**
 * Pick one item id per ingredient so the recipe can be made `times` times
 * (each ingredient slot holds `times` of a single item). Returns the ids in
 * slot order (null for blank cells), or null when it can't be done.
 */
export function assign(r: BookRecipe, avail: Map<string, number>, times: number): (string | null)[] | null {
  const idx: number[] = [];
  r.slots.forEach((s, i) => s && idx.push(i));
  idx.sort((a, b) => r.slots[a]!.size - r.slots[b]!.size);
  const left = new Map(avail);
  const pick: (string | null)[] = r.slots.map(() => null);
  const rec = (n: number): boolean => {
    if (n === idx.length) return true;
    const i = idx[n];
    const cands = [...r.slots[i]!].filter((id) => (left.get(id) ?? 0) >= times).sort((a, b) => left.get(b)! - left.get(a)!);
    for (const id of cands) {
      left.set(id, left.get(id)! - times);
      pick[i] = id;
      if (rec(n + 1)) return true;
      left.set(id, left.get(id)! + times);
    }
    return false;
  };
  return rec(0) ? pick : null;
}

/** vanilla StackedContents.getBiggestCraftableStack */
export function maxCraftable(r: BookRecipe, avail: Map<string, number>): number {
  if (!assign(r, avail, 1)) return 0;
  let lo = 1, hi = 64;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (assign(r, avail, mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// per-player state (vanilla RecipeBook + RecipeBookSettings)

export interface RecipeBookSave {
  known: string[];
  highlight: string[];
  open: Record<BookType, boolean>;
  filtering: Record<BookType, boolean>;
}

export class PlayerRecipeBook {
  readonly known = new Set<string>();
  /** newly unlocked recipes (their tab bounces until they've been shown) */
  readonly highlight = new Set<string>();
  open: Record<BookType, boolean> = { crafting: false, furnace: false, smoker: false, blast_furnace: false };
  filtering: Record<BookType, boolean> = { crafting: false, furnace: false, smoker: false, blast_furnace: false };
  /** called with newly unlocked recipes (recipe toast) */
  onUnlock: ((recipes: BookRecipe[]) => void) | null = null;

  /** vanilla recipe advancements (inventory_changed): unlock recipes for the items held */
  checkInventory(stacks: (ItemStack | null)[]): void {
    const have = new Set<string>();
    for (const s of stacks) if (s) have.add(s.item.id);
    if (!have.size) return;
    const added: BookRecipe[] = [];
    for (const r of BOOK_RECIPES) {
      if (this.known.has(r.id)) continue;
      for (const id of r.unlockBy)
        if (have.has(id)) {
          added.push(r);
          break;
        }
    }
    this.add(added);
  }

  /** vanilla ServerPlayer.awardRecipes */
  add(recipes: BookRecipe[]): void {
    const fresh = recipes.filter((r) => !this.known.has(r.id));
    if (!fresh.length) return;
    for (const r of fresh) {
      this.known.add(r.id);
      this.highlight.add(r.id);
    }
    this.onUnlock?.(fresh);
  }

  save(): RecipeBookSave {
    return { known: [...this.known], highlight: [...this.highlight], open: { ...this.open }, filtering: { ...this.filtering } };
  }

  load(d: RecipeBookSave | undefined): void {
    this.known.clear();
    this.highlight.clear();
    if (!d) return;
    for (const id of d.known) if (BOOK_BY_ID.has(id)) this.known.add(id);
    for (const id of d.highlight) if (BOOK_BY_ID.has(id)) this.highlight.add(id);
    this.open = { ...this.open, ...d.open };
    this.filtering = { ...this.filtering, ...d.filtering };
  }
}

/**
 * vanilla PlaceRecipe.placeRecipe: grid cell for each ingredient of the
 * recipe — small shaped recipes are centred in a big grid, shapeless ones fill
 * it row by row. Returns [cellIndex, slotIndexInRecipe] pairs.
 */
export function gridCells(r: BookRecipe, gridW: number, gridH: number): [number, number][] {
  const out: [number, number][] = [];
  if (!r.shaped) {
    for (let i = 0; i < r.slots.length && i < gridW * gridH; i++) out.push([i, i]);
    return out;
  }
  const ox = r.width < gridW / 2 ? Math.floor(gridW / 2 - r.width / 2) : 0;
  const oy = r.height < gridH / 2 ? Math.floor(gridH / 2 - r.height / 2) : 0;
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const k = y * r.width + x;
      if (r.slots[k]) out.push([(y + oy) * gridW + (x + ox), k]);
    }
  return out;
}

// ---------------------------------------------------------------------------
// placing a clicked recipe (vanilla ServerPlaceRecipe)

export interface PlaceTarget {
  gridW: number;
  gridH: number;
  /** crafting grid cells (or the furnace input as a 1x1 grid) */
  getCell(i: number): ItemStack | null;
  setCell(i: number, s: ItemStack | null): void;
  /** the player's 36 main inventory slots */
  inventory: (ItemStack | null)[];
  setInventory(i: number, s: ItemStack | null): void;
  /** vanilla Inventory.placeItemBackInInventory (drops what doesn't fit) */
  giveBack(s: ItemStack): void;
  /** does the grid currently make this recipe (vanilla menu.recipeMatches) */
  matches(r: BookRecipe): boolean;
  creative: boolean;
}

export type PlaceResult = { placed: true } | { placed: false; ghost: boolean };

function gridItems(t: PlaceTarget): (ItemStack | null)[] {
  const out: (ItemStack | null)[] = [];
  for (let i = 0; i < t.gridW * t.gridH; i++) out.push(t.getCell(i));
  return out;
}

/** vanilla testClearGrid: could everything in the grid go back into the inventory? */
function canClearGrid(t: PlaceTarget): boolean {
  const inv = t.inventory.map((s) => (s ? s.copy() : null));
  for (const g of gridItems(t)) {
    if (!g) continue;
    let left = g.count;
    for (const s of inv) {
      if (!s || !s.sameItem(g) || s.count >= s.maxStack) continue;
      const n = Math.min(left, s.maxStack - s.count);
      s.count += n;
      left -= n;
      if (!left) break;
    }
    if (left) {
      const k = inv.findIndex((s) => !s);
      if (k < 0) return false;
      inv[k] = g.copyWithCount(left);
    }
  }
  return true;
}

function clearGrid(t: PlaceTarget): void {
  for (let i = 0; i < t.gridW * t.gridH; i++) {
    const s = t.getCell(i);
    if (!s) continue;
    t.setCell(i, null);
    t.giveBack(s);
  }
}

/** vanilla Inventory.findSlotMatchingUnusedItem */
function findUnused(t: PlaceTarget, id: string): number {
  return t.inventory.findIndex((s) => !!s && s.item.id === id && s.damage === 0);
}

/**
 * vanilla ServerPlaceRecipe.recipeClicked: move the ingredients for one craft
 * (or as many as possible with shift) into the grid; if the player lacks them,
 * empty the grid and ask for a ghost recipe instead.
 */
export function placeRecipe(t: PlaceTarget, r: BookRecipe, useMax: boolean): PlaceResult {
  if (!canClearGrid(t) && !t.creative) return { placed: false, ghost: false };
  const avail = countItems([...t.inventory, ...gridItems(t)]);
  if (!assign(r, avail, 1)) {
    clearGrid(t);
    return { placed: false, ghost: true };
  }
  const matches = t.matches(r);
  const max = maxCraftable(r, avail);
  if (matches) {
    for (const s of gridItems(t)) if (s && Math.min(max, s.maxStack) < s.count + 1) return { placed: false, ghost: false };
  }
  let times = 1;
  if (useMax) times = max;
  else if (matches) {
    times = 64;
    for (const s of gridItems(t)) if (s && times > s.count) times = s.count;
    if (times < 64) times++;
  }
  let pick = assign(r, avail, times);
  if (!pick) return { placed: false, ghost: false };
  for (const id of pick) if (id) times = Math.min(times, ITEMS.get(id)?.maxStack ?? 64);
  pick = assign(r, avail, times);
  if (!pick) return { placed: false, ghost: false };
  clearGrid(t);
  for (const [cell, k] of gridCells(r, t.gridW, t.gridH)) {
    const id = pick[k];
    if (!id) continue;
    let need = times;
    while (need > 0) {
      const i = findUnused(t, id);
      if (i < 0) break;
      const src = t.inventory[i]!;
      const n = Math.min(need, src.count);
      const cur = t.getCell(cell);
      if (cur) {
        cur.count += n;
        t.setCell(cell, cur);
      } else t.setCell(cell, src.copyWithCount(n));
      src.count -= n;
      t.setInventory(i, src.count > 0 ? src : null);
      need -= n;
    }
  }
  return { placed: true };
}
