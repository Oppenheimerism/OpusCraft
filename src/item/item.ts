// Items: block items + regular items with vanilla stats.

import { BLOCKS, Block, ToolType, getBlock } from '../world/block';

export interface ToolInfo {
  type: ToolType;
  tier: number; // mining level (0 wood/gold .. 4 netherite)
  speed: number;
  durability: number;
}

export interface FoodInfo {
  nutrition: number;
  saturation: number;
  alwaysEat?: boolean;
  fast?: boolean;
  remainder?: string;
  /** vanilla FoodProperties.effects: [effect, ticks, amplifier, probability] */
  effects?: [string, number, number, number][];
}

export interface Item {
  id: string;
  name: string;
  maxStack: number;
  /** block placed by this item */
  block?: Block;
  tool?: ToolInfo;
  food?: FoodInfo;
  attackDamage: number;
  attackSpeed: number;
  armor?: { slot: 'head' | 'chest' | 'legs' | 'feet'; defense: number; toughness: number; durability: number };
  /** texture for inventory/hand rendering: item texture name; for block items, undefined → 3D block */
  texture?: string;
  fuel?: number; // furnace burn ticks
  maxDamage: number;
  creativeTab: string;
  /** vanilla Rarity: tooltip/name colour */
  rarity?: Rarity;
  /** vanilla enchantment_glint_override */
  glint?: boolean;
  /** extra gray tooltip lines (music disc descriptions...) */
  lore?: string[];
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
/** vanilla Rarity colours (white, yellow, aqua, light purple) */
export const RARITY_COLOR: Record<Rarity, string> = { common: 'f', uncommon: 'e', rare: 'b', epic: 'd' };

export const ITEMS = new Map<string, Item>();
export const ITEM_LIST: Item[] = [];

const NAME_OVERRIDES: Record<string, string> = {
  tnt: 'TNT',
  short_grass: 'Short Grass',
  lapis_lazuli: 'Lapis Lazuli',
  lapis_ore: 'Lapis Lazuli Ore',
  deepslate_lapis_ore: 'Deepslate Lapis Lazuli Ore',
  lapis_block: 'Block of Lapis Lazuli',
  iron_block: 'Block of Iron',
  gold_block: 'Block of Gold',
  diamond_block: 'Block of Diamond',
  emerald_block: 'Block of Emerald',
  coal_block: 'Block of Coal',
  redstone_block: 'Block of Redstone',
  copper_block: 'Block of Copper',
  raw_iron_block: 'Block of Raw Iron',
  raw_gold_block: 'Block of Raw Gold',
  raw_copper_block: 'Block of Raw Copper',
  golden_apple: 'Golden Apple',
  melon: 'Melon',
  melon_slice: 'Melon Slice',
  oak_wood: 'Oak Wood',
  hay_block: 'Hay Bale',
  dirt_path: 'Dirt Path',
  jack_o_lantern: "Jack o'Lantern",
  experience_bottle: "Bottle o' Enchanting",
  red_bed: 'Red Bed',
  glowstone_dust: 'Glowstone Dust',
  cooked_beef: 'Steak',
  beef: 'Raw Beef',
  porkchop: 'Raw Porkchop',
  cooked_porkchop: 'Cooked Porkchop',
  chicken: 'Raw Chicken',
  mutton: 'Raw Mutton',
  cod: 'Raw Cod',
  salmon: 'Raw Salmon',
  map: 'Empty Map',
  filled_map: 'Map',
  clock: 'Clock',
  sugar_cane: 'Sugar Cane',
  stone_brick_stairs: 'Stone Brick Stairs',
  stone_brick_slab: 'Stone Brick Slab',
  brick_stairs: 'Brick Stairs',
  brick_slab: 'Brick Slab',
  snow: 'Snow',
  snow_block: 'Snow Block',
  kelp: 'Kelp',
  dandelion: 'Dandelion',
  flint_and_steel: 'Flint and Steel',
  chest_minecart: 'Minecart with Chest',
};

export function prettyName(id: string): string {
  if (NAME_OVERRIDES[id]) return NAME_OVERRIDES[id];
  return id
    .split('_')
    .map((w) => (w === 'of' || w === 'and' || w === 'the' ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function reg(i: Partial<Item> & { id: string }): Item {
  const item: Item = {
    name: prettyName(i.id),
    maxStack: 64,
    attackDamage: 1,
    attackSpeed: 4,
    maxDamage: 0,
    creativeTab: 'ingredients',
    ...i,
  };
  if (item.tool) item.maxDamage = item.tool.durability;
  if (item.armor) item.maxDamage = item.armor.durability;
  ITEMS.set(item.id, item);
  ITEM_LIST.push(item);
  return item;
}

export function getItem(id: string): Item {
  const it = ITEMS.get(id);
  if (!it) throw new Error('unknown item ' + id);
  return it;
}

// ---------------------------------------------------------------------------
// Block items

const BLOCK_TAB: [RegExp, string][] = [
  [/_(ore)$|^(stone|granite|diorite|andesite|deepslate|tuff|calcite|dirt|coarse_dirt|podzol|mycelium|grass_block|sand|red_sand|gravel|clay|bedrock|obsidian|snow_block|ice|packed_ice|blue_ice|mud|rooted_dirt|moss_block|dripstone_block|magma_block|powder_snow|raw_.*_block)$/, 'natural'],
  [/_log$|_wood$|_leaves$|_sapling$|^(short_grass|fern|dead_bush|tall_grass|large_fern|dandelion|poppy|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|brown_mushroom|red_mushroom|sugar_cane|cactus|pumpkin|melon|lily_pad|vine|seagrass|kelp|sweet_berry_bush|cobweb|carved_pumpkin|jack_o_lantern|hay_block)$/, 'natural'],
  [/^(crafting_table|furnace|chest|bookshelf|ladder|torch|glowstone|sea_lantern|spawner|tnt|sponge|lantern|chain)$|_bed$/, 'functional'],
  [/_carpet$|_stained_glass$|_stained_glass_pane$/, 'colored'],
];

function blockTab(name: string): string {
  for (const [re, tab] of BLOCK_TAB) if (re.test(name)) return tab;
  if (/_wool$|_terracotta$|_concrete$|^terracotta$/.test(name)) return 'colored';
  return 'building';
}

const BLOCK_ITEM_MAX_STACK: Record<string, number> = { snow: 64, ender_chest: 64 };
const FUEL: Record<string, number> = {};

for (const b of BLOCKS) {
  if (b.s.item === false || b.name === 'air') continue;
  const itemName = typeof b.s.item === 'string' ? b.s.item : b.name;
  if (itemName !== b.name) continue; // e.g. wall_torch → torch registered by torch
  if (b.name.startsWith('tall_seagrass') || b.name === 'kelp_plant' || b.name === 'farmland' || b.name === 'sweet_berry_bush' || b.name === 'wheat') continue;
  let fuel: number | undefined;
  if (/_planks$|_log$|_wood$|crafting_table|bookshelf|chest|ladder|_stairs$|_slab$|_fence$|_fence_gate$|_trapdoor$|_door$/.test(b.name) && /oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|crafting|bookshelf|chest|ladder/.test(b.name)) fuel = b.name.endsWith('_slab') ? 150 : b.name.endsWith('_door') ? 200 : 300;
  if (/_carpet$/.test(b.name)) fuel = 67;
  if (/_wool$/.test(b.name)) fuel = 100;
  if (b.name === 'coal_block') fuel = 16000;
  if (b.name.endsWith('_sapling')) fuel = 100;
  reg({ id: b.name, block: b, maxStack: BLOCK_ITEM_MAX_STACK[b.name] ?? 64, creativeTab: blockTab(b.name), fuel });
}

// ---------------------------------------------------------------------------
// Tools

const TIERS: Record<string, { tier: number; uses: number; speed: number; dmg: number }> = {
  wooden: { tier: 0, uses: 59, speed: 2, dmg: 0 },
  stone: { tier: 1, uses: 131, speed: 4, dmg: 1 },
  iron: { tier: 2, uses: 250, speed: 6, dmg: 2 },
  golden: { tier: 0, uses: 32, speed: 12, dmg: 0 },
  diamond: { tier: 3, uses: 1561, speed: 8, dmg: 3 },
  netherite: { tier: 4, uses: 2031, speed: 9, dmg: 4 },
};
const AXE_DMG: Record<string, [number, number]> = {
  wooden: [7, 0.8], stone: [9, 0.8], iron: [9, 0.9], golden: [7, 1.0], diamond: [9, 1.0], netherite: [10, 1.0],
};
const HOE_SPEED: Record<string, number> = { wooden: 1, stone: 2, iron: 3, golden: 1, diamond: 4, netherite: 4 };

for (const [mat, t] of Object.entries(TIERS)) {
  const common = { maxStack: 1, creativeTab: 'tools' };
  reg({ id: `${mat}_pickaxe`, ...common, texture: `${mat}_pickaxe`, tool: { type: 'pickaxe', tier: t.tier, speed: t.speed, durability: t.uses }, attackDamage: 2 + t.dmg, attackSpeed: 1.2 });
  reg({ id: `${mat}_shovel`, ...common, texture: `${mat}_shovel`, tool: { type: 'shovel', tier: t.tier, speed: t.speed, durability: t.uses }, attackDamage: 2.5 + t.dmg, attackSpeed: 1.0 });
  reg({ id: `${mat}_axe`, ...common, texture: `${mat}_axe`, tool: { type: 'axe', tier: t.tier, speed: t.speed, durability: t.uses }, attackDamage: AXE_DMG[mat][0], attackSpeed: AXE_DMG[mat][1] });
  reg({ id: `${mat}_hoe`, ...common, texture: `${mat}_hoe`, tool: { type: 'hoe', tier: t.tier, speed: t.speed, durability: t.uses }, attackDamage: 1, attackSpeed: HOE_SPEED[mat] });
  reg({ id: `${mat}_sword`, maxStack: 1, creativeTab: 'combat', texture: `${mat}_sword`, tool: { type: 'sword', tier: t.tier, speed: 1.5, durability: t.uses }, attackDamage: 4 + t.dmg, attackSpeed: 1.6 });
}
reg({ id: 'shears', maxStack: 1, creativeTab: 'tools', texture: 'shears', tool: { type: 'shears', tier: 0, speed: 1.5, durability: 238 } });
reg({ id: 'flint_and_steel', maxStack: 1, creativeTab: 'tools', texture: 'flint_and_steel', maxDamage: 64 });
reg({ id: 'bow', maxStack: 1, creativeTab: 'combat', texture: 'bow', maxDamage: 384 });
reg({ id: 'arrow', creativeTab: 'combat', texture: 'arrow' });
reg({ id: 'fishing_rod', maxStack: 1, creativeTab: 'tools', texture: 'fishing_rod', maxDamage: 64 });
reg({ id: 'compass', creativeTab: 'tools', texture: 'compass' });
reg({ id: 'clock', creativeTab: 'tools', texture: 'clock' });
reg({ id: 'map', creativeTab: 'tools', texture: 'map' });
reg({ id: 'bucket', maxStack: 16, creativeTab: 'tools', texture: 'bucket' });
reg({ id: 'water_bucket', maxStack: 1, creativeTab: 'tools', texture: 'water_bucket' });
reg({ id: 'lava_bucket', maxStack: 1, creativeTab: 'tools', texture: 'lava_bucket', fuel: 20000 });
reg({ id: 'milk_bucket', maxStack: 1, creativeTab: 'food', texture: 'milk_bucket' });

// Armor
const ARMOR: Record<string, { def: [number, number, number, number]; tough: number; dur: number }> = {
  leather: { def: [1, 3, 2, 1], tough: 0, dur: 5 },
  chainmail: { def: [2, 5, 4, 1], tough: 0, dur: 15 },
  iron: { def: [2, 6, 5, 2], tough: 0, dur: 15 },
  golden: { def: [2, 5, 3, 1], tough: 0, dur: 7 },
  diamond: { def: [3, 8, 6, 3], tough: 2, dur: 33 },
  netherite: { def: [3, 8, 6, 3], tough: 3, dur: 37 },
};
const ARMOR_BASE = [11, 16, 15, 13];
for (const [mat, a] of Object.entries(ARMOR)) {
  const pieces: [string, 'head' | 'chest' | 'legs' | 'feet', number][] = [['helmet', 'head', 0], ['chestplate', 'chest', 1], ['leggings', 'legs', 2], ['boots', 'feet', 3]];
  for (const [piece, slot, i] of pieces) {
    reg({ id: `${mat}_${piece}`, maxStack: 1, creativeTab: 'combat', texture: `${mat}_${piece}`, armor: { slot, defense: a.def[i], toughness: a.tough, durability: ARMOR_BASE[i] * a.dur } });
  }
}

// Food
const FOOD: [string, number, number, Partial<FoodInfo>?][] = [
  ['apple', 4, 0.3], ['golden_apple', 4, 1.2, { alwaysEat: true }], ['bread', 5, 0.6], ['carrot', 3, 0.6], ['potato', 1, 0.3],
  ['baked_potato', 5, 0.6], ['beef', 3, 0.3], ['cooked_beef', 8, 0.8], ['porkchop', 3, 0.3], ['cooked_porkchop', 8, 0.8],
  ['chicken', 2, 0.3], ['cooked_chicken', 6, 0.6], ['mutton', 2, 0.3], ['cooked_mutton', 6, 0.8], ['cod', 2, 0.1],
  ['cooked_cod', 5, 0.6], ['salmon', 2, 0.1], ['cooked_salmon', 6, 0.8], ['cookie', 2, 0.1], ['melon_slice', 2, 0.3],
  ['sweet_berries', 2, 0.1], ['rotten_flesh', 4, 0.1], ['spider_eye', 2, 0.8], ['mushroom_stew', 6, 0.6, { remainder: 'bowl' }],
  ['beetroot', 1, 0.6], ['beetroot_soup', 6, 0.6, { remainder: 'bowl' }], ['golden_carrot', 6, 1.2], ['poisonous_potato', 2, 0.3],
  ['pumpkin_pie', 8, 0.3],
];
for (const [id, n, s, extra] of FOOD) {
  reg({ id, texture: id, creativeTab: 'food', maxStack: extra?.remainder ? 1 : 64, food: { nutrition: n, saturation: s, ...(extra ?? {}) } });
}
ITEMS.get('golden_apple')!.rarity = 'rare';
reg({ id: 'enchanted_golden_apple', texture: 'enchanted_golden_apple', creativeTab: 'food', rarity: 'epic', glint: true, food: { nutrition: 4, saturation: 1.2, alwaysEat: true } });
// vanilla Foods: status effects when eaten
const EAT_EFFECTS: Record<string, [string, number, number, number][]> = {
  golden_apple: [['regeneration', 100, 1, 1], ['absorption', 2400, 0, 1]],
  enchanted_golden_apple: [['regeneration', 400, 1, 1], ['resistance', 6000, 0, 1], ['fire_resistance', 6000, 0, 1], ['absorption', 2400, 3, 1]],
  chicken: [['hunger', 600, 0, 0.3]],
  rotten_flesh: [['hunger', 600, 0, 0.8]],
  poisonous_potato: [['poison', 100, 0, 0.6]],
  spider_eye: [['poison', 100, 0, 1]],
};
for (const [id, fx] of Object.entries(EAT_EFFECTS)) ITEMS.get(id)!.food!.effects = fx;

// Materials & misc
const MISC: [string, number?, number?][] = [
  ['stick', 64, 100], ['coal', 64, 1600], ['charcoal', 64, 1600], ['diamond'], ['emerald'], ['lapis_lazuli'], ['redstone'], ['quartz'],
  ['iron_ingot'], ['gold_ingot'], ['copper_ingot'], ['netherite_ingot'], ['iron_nugget'], ['gold_nugget'], ['raw_iron'], ['raw_gold'],
  ['raw_copper'], ['wheat'], ['wheat_seeds'], ['beetroot_seeds'], ['pumpkin_seeds'], ['melon_seeds'], ['bone'], ['bone_meal'], ['string'], ['feather'], ['gunpowder'], ['leather'], ['flint'],
  ['clay_ball'], ['brick'], ['paper'], ['book'], ['sugar'], ['egg', 16], ['snowball', 16], ['slime_ball'], ['ender_pearl', 16],
  ['blaze_rod', 64, 2400], ['glowstone_dust'], ['bowl', 64, 100], ['glass_bottle'], ['experience_bottle'], ['saddle', 1],
  ['name_tag'], ['lead'], ['painting'], ['item_frame'], ['minecart', 1], ['chest_minecart', 1], ['oak_boat', 1], ['oak_sign', 16], ['oak_door'], ['iron_door'],
  ['red_bed', 1], ['filled_map'], ['ink_sac'], ['cocoa_beans'], ['amethyst_shard'],
];
for (const [id, stack, fuel] of MISC) {
  if (ITEMS.has(id)) continue;
  reg({ id, texture: id, maxStack: stack ?? 64, fuel });
}
Object.assign(ITEMS.get('experience_bottle')!, { rarity: 'uncommon', glint: true });
reg({ id: 'enchanted_book', texture: 'enchanted_book', maxStack: 1, rarity: 'uncommon', glint: true });
for (const m of ['iron', 'golden', 'diamond']) reg({ id: `${m}_horse_armor`, texture: `${m}_horse_armor`, maxStack: 1, creativeTab: 'combat' });
// vanilla 1.21 jukebox songs: disc name + "C418 - title" description
for (const [id, desc, rarity] of [['music_disc_13', 'C418 - 13', 'uncommon'], ['music_disc_cat', 'C418 - cat', 'uncommon'], ['music_disc_otherside', 'Lena Raine - otherside', 'rare']] as [string, string, Rarity][]) {
  reg({ id, name: 'Music Disc', texture: id, maxStack: 1, creativeTab: 'tools', rarity, lore: [desc] });
}
for (const c of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']) {
  reg({ id: `${c}_dye`, texture: `${c}_dye` });
}
// spawn eggs (creative tab order is alphabetical, like vanilla)
for (const m of ['cave_spider', 'chicken', 'cow', 'creeper', 'enderman', 'pig', 'sheep', 'skeleton', 'slime', 'spider', 'squid', 'zombie']) {
  reg({ id: `${m}_spawn_egg`, texture: `${m}_spawn_egg`, creativeTab: 'spawn_eggs' });
}
// sugar cane item places the block
{
  const sc = ITEMS.get('sugar_cane');
  if (sc) sc.texture = 'sugar_cane';
}
for (const id of ['torch', 'short_grass', 'fern', 'dead_bush', 'vine', 'lily_pad', 'cobweb', 'ladder', 'seagrass', 'kelp', 'sweet_berries']) {
  const it = ITEMS.get(id);
  if (it && it.block) it.texture = 'block:' + (id === 'kelp' ? 'kelp' : id);
}
// block items drawn as flat sprites (vanilla item/generated models)
for (const b of BLOCKS) {
  const it = ITEMS.get(b.name);
  if (!it || !it.block) continue;
  const n = b.name;
  if (n.endsWith('_door') || n.endsWith('_bed') || n === 'lantern' || n === 'chain') {
    it.texture = n;
    if (n.endsWith('_bed')) it.maxStack = 1;
  }
  if (n === 'glass_pane') it.texture = 'block:glass';
  if (n === 'glow_lichen') {
    it.texture = 'block:glow_lichen';
    it.creativeTab = 'natural';
  }
  if (n === 'rail') {
    it.texture = 'block:rail';
    it.creativeTab = 'tools';
  }
  if (/_amethyst_bud$|^amethyst_cluster$/.test(n)) it.texture = 'block:' + n;
  if (n === 'pointed_dripstone') {
    it.texture = 'pointed_dripstone';
    it.creativeTab = 'natural';
  }
  if (/amethyst/.test(n)) it.creativeTab = 'natural';
  if (n === 'iron_bars') it.texture = 'block:iron_bars';
  if (n.endsWith('_stained_glass_pane')) it.texture = 'block:' + n.replace('_pane', '');
}
for (const b of BLOCKS) {
  const it = ITEMS.get(b.name);
  if (!it || !it.block) continue;
  if (/_sapling$|^(dandelion|poppy|blue_orchid|allium|azure_bluet|red_tulip|orange_tulip|white_tulip|pink_tulip|oxeye_daisy|cornflower|lily_of_the_valley|brown_mushroom|red_mushroom)$/.test(b.name)) it.texture = 'block:' + b.name;
  if (/^(tall_grass|large_fern|sunflower|lilac|rose_bush|peony)$/.test(b.name)) it.texture = 'block:' + b.name + (b.name === 'sunflower' ? '_front' : '_top');
}

export function itemForBlock(name: string): Item | undefined {
  if (name === 'wall_torch') return ITEMS.get('torch');
  return ITEMS.get(name);
}

export function blockForItem(it: Item): Block | undefined {
  if (it.id === 'sugar_cane') return getBlock('sugar_cane');
  if (it.id === 'wheat_seeds') return getBlock('wheat');
  if (it.id === 'carrot') return getBlock('carrots');
  if (it.id === 'potato') return getBlock('potatoes');
  if (it.id === 'beetroot_seeds') return getBlock('beetroots');
  if (it.id === 'pumpkin_seeds') return getBlock('pumpkin_stem');
  if (it.id === 'melon_seeds') return getBlock('melon_stem');
  if (it.id === 'sweet_berries') return getBlock('sweet_berry_bush');
  return it.block;
}

/** per-stack data (vanilla data components) */
export interface ItemTag {
  /** minecraft:enchantments, id → level in the order they were applied */
  enchantments?: Record<string, number>;
  /** minecraft:stored_enchantments (enchanted books) */
  stored?: Record<string, number>;
}

export function cloneTag(t: ItemTag | null): ItemTag | null {
  if (!t) return null;
  const o: ItemTag = {};
  if (t.enchantments) o.enchantments = { ...t.enchantments };
  if (t.stored) o.stored = { ...t.stored };
  return o;
}

function sameEnchants(a: Record<string, number> | undefined, b: Record<string, number> | undefined): boolean {
  const ka = a ? Object.keys(a) : [], kb = b ? Object.keys(b) : [];
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a![k] !== b?.[k]) return false;
  return true;
}

export class ItemStack {
  constructor(public item: Item, public count = 1, public damage = 0, public tag: ItemTag | null = null) {}
  static of(id: string, count = 1): ItemStack {
    return new ItemStack(getItem(id), count);
  }
  copy(): ItemStack {
    return new ItemStack(this.item, this.count, this.damage, cloneTag(this.tag));
  }
  copyWithCount(n: number): ItemStack {
    return new ItemStack(this.item, n, this.damage, cloneTag(this.tag));
  }
  /** remove up to n from this stack and return them as a new stack */
  split(n: number): ItemStack {
    const k = Math.min(n, this.count);
    this.count -= k;
    return new ItemStack(this.item, k, this.damage, cloneTag(this.tag));
  }
  isEmpty(): boolean {
    return this.count <= 0;
  }
  /** vanilla isSameItemSameComponents */
  sameItem(o: ItemStack | null): boolean {
    if (!o || o.item !== this.item || o.damage !== this.damage) return false;
    return sameEnchants(this.tag?.enchantments, o.tag?.enchantments) && sameEnchants(this.tag?.stored, o.tag?.stored);
  }
  get maxStack(): number {
    return this.item.maxStack;
  }
  isEnchanted(): boolean {
    return !!this.tag?.enchantments && Object.keys(this.tag.enchantments).length > 0;
  }
  /** vanilla ItemStack.hasFoil */
  hasGlint(): boolean {
    return !!this.item.glint || this.isEnchanted();
  }
  /** vanilla ItemStack.getRarity: enchanting bumps common/uncommon to rare and rare to epic */
  rarity(): Rarity {
    const r = this.item.rarity ?? 'common';
    if (!this.isEnchanted()) return r;
    return r === 'common' || r === 'uncommon' ? 'rare' : 'epic';
  }
}

/** compact save form: [id, count, damage, tag?] */
export type SavedStack = [string, number, number, ItemTag?];

export function saveStack(s: ItemStack): SavedStack {
  return s.tag ? [s.item.id, s.count, s.damage, cloneTag(s.tag)!] : [s.item.id, s.count, s.damage];
}

export function loadStack(d: SavedStack | null | undefined): ItemStack | null {
  if (!d) return null;
  const it = ITEMS.get(d[0]);
  return it ? new ItemStack(it, d[1], d[2], cloneTag(d[3] ?? null)) : null;
}
