// Items: block items + regular items with vanilla stats.

import { BLOCKS, BLOCK_BY_NAME, Block, ToolType, getBlock } from '../world/block';
import { WOODS } from '../world/blocksExtra';
import type { SavedEffect } from '../entity/effects';
import type { ItemEntity } from '../entity/itemEntity';
import { SHULKER_BOXES } from '../world/blocksShulker';
import { SKULL_TYPES, SKULL_BLOCKS } from '../world/blocksSkulls';

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
  /** vanilla Item.getName(stack): a name that depends on the stack (potions by their contents) */
  stackName?: (s: ItemStack) => string;
  /** vanilla Item.appendHoverText: tooltip lines after the name (a potion's effects) */
  hoverText?: (s: ItemStack, lines: string[]) => void;
  /** the stacks the creative tabs list for it (vanilla generatePotionEffectTypes: one per potion) */
  creativeStacks?: () => ItemStack[];
  /** vanilla Item.craftingRemainingItem: what's left of it in a crafting grid or brewing stand (dragon's breath: the bottle) */
  remainder?: string;
  /** vanilla Item.onDestroyed: a dropped stack of it was burnt up or blown apart (a shulker box spills what it held) */
  onDestroyed?: (e: ItemEntity) => void;
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
  ender_eye: 'Eye of Ender',
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
  [/_(ore)$|^infested_|^(stone|granite|diorite|andesite|deepslate|tuff|calcite|dirt|coarse_dirt|podzol|mycelium|grass_block|sand|red_sand|gravel|clay|bedrock|obsidian|snow_block|ice|packed_ice|blue_ice|mud|rooted_dirt|moss_block|dripstone_block|magma_block|powder_snow|raw_.*_block|netherrack|soul_sand|soul_soil|basalt|blackstone|crimson_nylium|warped_nylium|nether_wart_block|warped_wart_block|ancient_debris|crimson_stem|warped_stem|crimson_fungus|warped_fungus|crimson_roots|warped_roots|nether_sprouts|weeping_vines|twisting_vines|shroomlight)$/, 'natural'],
  [/_log$|_wood$|_leaves$|_sapling$|^(short_grass|fern|dead_bush|tall_grass|large_fern|dandelion|poppy|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|brown_mushroom|red_mushroom|sugar_cane|cactus|pumpkin|melon|lily_pad|vine|seagrass|kelp|sweet_berry_bush|cobweb|carved_pumpkin|jack_o_lantern|hay_block|moss_carpet|azalea|flowering_azalea|hanging_roots|spore_blossom|big_dripleaf|small_dripleaf)$/, 'natural'],
  [/^(crafting_table|furnace|chest|bookshelf|ladder|(soul_)?torch|glowstone|sea_lantern|spawner|tnt|sponge|(soul_)?lantern|chain|enchanting_table|grindstone|(chipped_|damaged_)?anvil|bell|barrel|composter|smoker|blast_furnace|cauldron|lectern|cartography_table|fletching_table|smithing_table|loom|stonecutter|brewing_stand|flower_pot|(soul_)?campfire)$|_bed$/, 'functional'],
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
// vanilla BrushItem (game/archaeology.ts): brushes suspicious sand and gravel away, 64 uses
reg({ id: 'brush', maxStack: 1, creativeTab: 'tools', texture: 'brush', maxDamage: 64 });
// vanilla TridentItem: 9 attack damage, and thrown it hits for 8 (entity/thrownTrident.ts); with riptide it carries
// its wielder through water and rain instead
reg({ id: 'trident', maxStack: 1, creativeTab: 'combat', texture: 'trident', maxDamage: 250, attackDamage: 9, attackSpeed: 1.1, rarity: 'epic' });
reg({ id: 'bow', maxStack: 1, creativeTab: 'combat', texture: 'bow', maxDamage: 384 });
// vanilla CrossbowItem (models/item/crossbow.json: layer0 crossbow_standby); crafted with a tripwire hook
reg({ id: 'crossbow', maxStack: 1, creativeTab: 'combat', texture: 'crossbow_standby', maxDamage: 465 });
// vanilla ShieldItem: 336 uses, repaired with planks; held up to block (entity/shield.ts), decorated with a banner
// (game/shields.ts); drawn as its model (render/shieldRenderer.ts), the flat sprite standing in where no renderer is
reg({ id: 'shield', maxStack: 1, creativeTab: 'combat', texture: 'shield', maxDamage: 336 });
reg({ id: 'arrow', creativeTab: 'combat', texture: 'arrow' });
// vanilla TippedArrowItem (models/item/tipped_arrow.json: layer0 the tinted head, layer1 the shaft; item/potions.ts)
reg({ id: 'tipped_arrow', creativeTab: 'combat', texture: 'tipped_arrow_base' });
reg({ id: 'fishing_rod', maxStack: 1, creativeTab: 'tools', texture: 'fishing_rod', maxDamage: 64 });
reg({ id: 'carrot_on_a_stick', maxStack: 1, creativeTab: 'tools', texture: 'carrot_on_a_stick', maxDamage: 25 });
reg({ id: 'warped_fungus_on_a_stick', maxStack: 1, creativeTab: 'tools', texture: 'warped_fungus_on_a_stick', maxDamage: 100 });
reg({ id: 'compass', creativeTab: 'tools', texture: 'compass' });
reg({ id: 'clock', creativeTab: 'tools', texture: 'clock' });
reg({ id: 'map', creativeTab: 'tools', texture: 'map' });
// vanilla WritableBookItem and WrittenBookItem (screens in gui/screens/book, uses in game/books): a lectern takes either
reg({ id: 'writable_book', name: 'Book and Quill', maxStack: 1, creativeTab: 'tools', texture: 'writable_book' });
reg({ id: 'written_book', maxStack: 16, creativeTab: 'tools', texture: 'written_book', glint: true });
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
// vanilla ArmorMaterials.TURTLE (defence 2, durability multiplier 25): only a helmet, which lets its wearer breathe
// a while longer when they duck under
reg({ id: 'turtle_helmet', name: 'Turtle Shell', maxStack: 1, creativeTab: 'combat', texture: 'turtle_helmet', armor: { slot: 'head', defense: 2, toughness: 0, durability: ARMOR_BASE[0] * 25 } });

// Food
const FOOD: [string, number, number, Partial<FoodInfo>?][] = [
  ['apple', 4, 0.3], ['golden_apple', 4, 1.2, { alwaysEat: true }], ['bread', 5, 0.6], ['carrot', 3, 0.6], ['potato', 1, 0.3],
  ['baked_potato', 5, 0.6], ['beef', 3, 0.3], ['cooked_beef', 8, 0.8], ['porkchop', 3, 0.3], ['cooked_porkchop', 8, 0.8],
  ['chicken', 2, 0.3], ['cooked_chicken', 6, 0.6], ['mutton', 2, 0.3], ['cooked_mutton', 6, 0.8], ['cod', 2, 0.1],
  ['cooked_cod', 5, 0.6], ['salmon', 2, 0.1], ['cooked_salmon', 6, 0.8], ['cookie', 2, 0.1], ['melon_slice', 2, 0.3],
  ['sweet_berries', 2, 0.1], ['rotten_flesh', 4, 0.1], ['spider_eye', 2, 0.8], ['mushroom_stew', 6, 0.6, { remainder: 'bowl' }],
  ['beetroot', 1, 0.6], ['beetroot_soup', 6, 0.6, { remainder: 'bowl' }], ['golden_carrot', 6, 1.2], ['poisonous_potato', 2, 0.3],
  ['pumpkin_pie', 8, 0.3], ['glow_berries', 2, 0.1], ['pufferfish', 1, 0.1],
  // (vanilla Foods.SUSPICIOUS_STEW; what else it gives is the stack's, game/desertWells.ts)
  ['suspicious_stew', 6, 0.6, { remainder: 'bowl', alwaysEat: true }],
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
  // vanilla Foods.PUFFERFISH
  pufferfish: [['poison', 1200, 1, 1], ['hunger', 300, 2, 1], ['nausea', 300, 0, 1]],
};
for (const [id, fx] of Object.entries(EAT_EFFECTS)) ITEMS.get(id)!.food!.effects = fx;

// Materials & misc
const MISC: [string, number?, number?][] = [
  ['stick', 64, 100], ['coal', 64, 1600], ['charcoal', 64, 1600], ['diamond'], ['emerald'], ['lapis_lazuli'], ['redstone'], ['quartz'],
  ['iron_ingot'], ['gold_ingot'], ['copper_ingot'], ['netherite_ingot'], ['iron_nugget'], ['gold_nugget'], ['raw_iron'], ['raw_gold'],
  ['raw_copper'], ['wheat'], ['wheat_seeds'], ['beetroot_seeds'], ['nether_wart'], ['pumpkin_seeds'], ['melon_seeds'], ['bone'], ['bone_meal'], ['string'], ['feather'], ['gunpowder'], ['leather'], ['flint'],
  ['clay_ball'], ['brick'], ['nether_brick'], ['paper'], ['book'], ['sugar'], ['egg', 16], ['snowball', 16], ['slime_ball'], ['magma_cream'], ['ghast_tear'], ['fire_charge'], ['ender_pearl', 16],
  ['blaze_rod', 64, 2400], ['glowstone_dust'], ['blaze_powder'], ['bowl', 64, 100], ['glass_bottle'], ['experience_bottle'], ['saddle', 1],
  ['name_tag'], ['lead'], ['painting'], ['item_frame'], ['minecart', 1], ['chest_minecart', 1], ['oak_boat', 1], ['oak_sign', 16], ['oak_door'], ['iron_door'],
  ['red_bed', 1], ['filled_map'], ['ink_sac'], ['cocoa_beans'], ['amethyst_shard'], ['nautilus_shell'],
];
for (const [id, stack, fuel] of MISC) {
  if (ITEMS.has(id)) continue;
  reg({ id, texture: id, maxStack: stack ?? 64, fuel });
  // vanilla BoatItem: every wood's boat and boat with chest, listed where the oak boat is
  if (id === 'oak_boat')
    for (const w of WOODS) {
      if (w !== 'oak') reg({ id: `${w}_boat`, texture: `${w}_boat`, maxStack: 1, creativeTab: 'tools' });
      reg({ id: `${w}_chest_boat`, name: `${prettyName(w)} Boat with Chest`, texture: `${w}_chest_boat`, maxStack: 1, creativeTab: 'tools' });
    }
}
// vanilla pottery sherds: what the desert pyramid's suspicious sand holds (archaeology/desert_pyramid), and the desert
// well's (archaeology/desert_well), for the sides of a decorated pot
for (const s of ['archer', 'miner', 'prize', 'skull', 'arms_up', 'brewer']) reg({ id: `${s}_pottery_sherd`, texture: `${s}_pottery_sherd` });
// (the decorated pot is drawn by its block entity's renderer, render/archaeologyRenderers.ts: its sprite, the pot at the GUI's
// angle, stands in only where nothing but the item's id is drawn)
ITEMS.get('decorated_pot')!.texture = 'decorated_pot';
for (const id of ['suspicious_sand', 'suspicious_gravel', 'decorated_pot']) ITEMS.get(id)!.creativeTab = 'functional';
// (fossils) vanilla lists the bone block with the natural blocks
ITEMS.get('bone_block')!.creativeTab = 'natural';
Object.assign(ITEMS.get('experience_bottle')!, { rarity: 'uncommon', glint: true });
// vanilla Items.NAUTILUS_SHELL: uncommon
ITEMS.get('nautilus_shell')!.rarity = 'uncommon';
// brewing ingredients (vanilla Items: the glistering melon, the fermented eye, the rabbit's foot and the rest)
for (const id of ['fermented_spider_eye', 'glistering_melon_slice', 'rabbit_foot', 'phantom_membrane', 'turtle_scute', 'breeze_rod']) reg({ id, texture: id });
// vanilla Items.RABBIT_HIDE (four make a piece of leather)
reg({ id: 'rabbit_hide', texture: 'rabbit_hide' });
// vanilla Items.DRAGON_BREATH: uncommon, 64 to a stack, and its bottle is left over when it's brewed
reg({ id: 'dragon_breath', name: "Dragon's Breath", texture: 'dragon_breath', rarity: 'uncommon', remainder: 'glass_bottle' });
// the End: vanilla EnderEyeItem, and EndCrystalItem (rare, with the enchantment glint); the portal frame is a functional block
reg({ id: 'ender_eye', texture: 'ender_eye', creativeTab: 'tools' });
// (vanilla CreativeModeTabs.COMBAT lists the end crystal after the totem and TNT)
// (Stage 4: illagers) vanilla TotemItem: one to a stack, uncommon; its death-cheating is entity/totem.ts
reg({ id: 'totem_of_undying', maxStack: 1, creativeTab: 'combat', texture: 'totem_of_undying', rarity: 'uncommon' });
reg({ id: 'end_crystal', texture: 'end_crystal', creativeTab: 'combat', rarity: 'rare', glint: true });
ITEMS.get('end_portal_frame')!.creativeTab = 'functional';
// the outer End: chorus fruit (vanilla ChorusFruitItem: always edible, and it teleports its eater, game/chorus.ts) and
// the popped fruit smelted from it; the chorus plant and flower are natural blocks, the end rod a functional one
reg({ id: 'chorus_fruit', texture: 'chorus_fruit', creativeTab: 'food', food: { nutrition: 4, saturation: 0.3, alwaysEat: true } });
reg({ id: 'popped_chorus_fruit', texture: 'popped_chorus_fruit' });
for (const id of ['chorus_plant', 'chorus_flower']) ITEMS.get(id)!.creativeTab = 'natural';
ITEMS.get('end_rod')!.creativeTab = 'functional';
// the shulker's shell, and the boxes made from it: one to a stack (what's in one shows in its tooltip,
// game/shulkerBox.ts)
reg({ id: 'shulker_shell', texture: 'shulker_shell', creativeTab: 'ingredients' });
// (and the shulker's spawn egg)
reg({ id: 'shulker_spawn_egg', texture: 'shulker_spawn_egg', creativeTab: 'spawn_eggs' });
// the glow item frame (vanilla Items.GLOW_ITEM_FRAME; its entity is entity/itemFrame.ts, as the item frame's)
reg({ id: 'glow_item_frame', texture: 'glow_item_frame', creativeTab: 'functional' });
// the elytra (vanilla ElytraItem: 432 uses, epic; worn in the chest slot, entity/elytra.ts; its wings render/elytraLayer.ts)
reg({ id: 'elytra', texture: 'elytra', maxStack: 1, creativeTab: 'tools', maxDamage: 432, rarity: 'epic' });
// mob heads (vanilla StandingAndWallBlockItem: uncommon, the dragon's epic), worn on the head (item/equipment.ts); drawn
// by their model, render/skullRenderer.ts
for (const t of SKULL_TYPES) Object.assign(ITEMS.get(SKULL_BLOCKS[t][0])!, { rarity: t === 'dragon' ? 'epic' : 'uncommon', creativeTab: 'functional' });
for (const [id] of SHULKER_BOXES) Object.assign(ITEMS.get(id)!, { maxStack: 1, creativeTab: 'colored' });
Object.assign(ITEMS.get('dragon_egg')!, { rarity: 'epic', creativeTab: 'functional' });
reg({ id: 'enchanted_book', texture: 'enchanted_book', maxStack: 1, rarity: 'uncommon', glint: true });
// vanilla SmithingTemplateItem.createNetheriteUpgradeTemplate: its hover text is the upgrade, what it applies to and needs
reg({
  id: 'netherite_upgrade_smithing_template', name: 'Smithing Template', texture: 'netherite_upgrade_smithing_template', rarity: 'uncommon',
  lore: ['Netherite Upgrade', '', 'Applies to:', ' §9Diamond Equipment', 'Ingredients:', ' §9Netherite Ingot'],
});
// vanilla BannerPatternItem: one to a stack, each named "Banner Pattern" (what it weaves is its tooltip, game/banners.ts);
// in 1.21 they share one sprite
for (const [id, rarity] of [['flower', 'common'], ['creeper', 'uncommon'], ['skull', 'uncommon'], ['mojang', 'epic'], ['globe', 'common'], ['piglin', 'uncommon'], ['flow', 'rare'], ['guster', 'rare']] as [string, Rarity][]) {
  reg({ id: `${id}_banner_pattern`, name: 'Banner Pattern', texture: 'banner_pattern', maxStack: 1, rarity });
}
for (const m of ['leather', 'iron', 'golden', 'diamond']) reg({ id: `${m}_horse_armor`, texture: `${m}_horse_armor`, maxStack: 1, creativeTab: 'combat' });
// vanilla 1.21 jukebox songs: disc name + "C418 - title" description
for (const [id, desc, rarity] of [['music_disc_13', 'C418 - 13', 'uncommon'], ['music_disc_cat', 'C418 - cat', 'uncommon'], ['music_disc_otherside', 'Lena Raine - otherside', 'rare']] as [string, string, Rarity][]) {
  reg({ id, name: 'Music Disc', texture: id, maxStack: 1, creativeTab: 'tools', rarity, lore: [desc] });
}
for (const c of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']) {
  reg({ id: `${c}_dye`, texture: `${c}_dye` });
}
// potions (vanilla PotionItem, SplashPotionItem, LingeringPotionItem: one to a stack; models/item/potion.json:
// layer0 the tinted potion_overlay, layer1 the bottle; their contents, names and brewing in item/potions.ts)
reg({ id: 'potion', maxStack: 1, creativeTab: 'food', texture: 'potion' });
reg({ id: 'splash_potion', maxStack: 1, creativeTab: 'food', texture: 'splash_potion' });
reg({ id: 'lingering_potion', maxStack: 1, creativeTab: 'food', texture: 'lingering_potion' });
// spawn eggs (creative tab order is alphabetical, like vanilla)
for (const m of ['bat', 'blaze', 'cat', 'cave_spider', 'chicken', 'cow', 'creeper', 'drowned', 'enderman', 'ghast', 'hoglin', 'husk', 'iron_golem', 'magma_cube', 'ocelot', 'pig', 'piglin', 'sheep', 'silverfish', 'skeleton', 'slime', 'spider', 'squid', 'stray', 'strider', 'villager', 'witch', 'wither_skeleton', 'wolf', 'zoglin', 'zombie', 'zombie_villager', 'zombified_piglin']) {
  reg({ id: `${m}_spawn_egg`, texture: `${m}_spawn_egg`, creativeTab: 'spawn_eggs' });
}
// (Stage 4: illagers) the raiders' eggs and the ominous bottle (vanilla OminousBottleItem: uncommon; drinking it for
// bad omen comes with raids); the creative tab sorts the eggs by name
for (const m of ['evoker', 'pillager', 'ravager', 'vex', 'vindicator']) reg({ id: `${m}_spawn_egg`, texture: `${m}_spawn_egg`, creativeTab: 'spawn_eggs' });
// (Stage 6: tameable animals)
for (const m of ['donkey', 'horse', 'llama', 'mule', 'trader_llama']) reg({ id: `${m}_spawn_egg`, texture: `${m}_spawn_egg`, creativeTab: 'spawn_eggs' });
reg({ id: 'wandering_trader_spawn_egg', texture: 'wandering_trader_spawn_egg', creativeTab: 'spawn_eggs' });
reg({ id: 'snow_golem_spawn_egg', texture: 'snow_golem_spawn_egg', creativeTab: 'spawn_eggs' });
reg({ id: 'parrot_spawn_egg', texture: 'parrot_spawn_egg', creativeTab: 'spawn_eggs' });
reg({ id: 'polar_bear_spawn_egg', texture: 'polar_bear_spawn_egg', creativeTab: 'spawn_eggs' });
reg({ id: 'ominous_bottle', creativeTab: 'food', texture: 'ominous_bottle', rarity: 'uncommon' });
// (Stage 5: ocean) vanilla Items.PRISMARINE_SHARD / PRISMARINE_CRYSTALS (guardians', sea lanterns'); the wet sponge sits by the sponge
for (const id of ['prismarine_shard', 'prismarine_crystals']) reg({ id, texture: id });
ITEMS.get('wet_sponge')!.creativeTab = 'functional';
// (Stage 5: ocean) the guardians' eggs
for (const m of ['elder_guardian', 'guardian']) reg({ id: `${m}_spawn_egg`, texture: `${m}_spawn_egg`, creativeTab: 'spawn_eggs' });
// (Stage 5: ocean) the tropical fish (vanilla Foods.TROPICAL_FISH), the buckets of fish (vanilla MobBucketItem: one to a
// stack; game/fishBuckets.ts pours them out), the glow squid's ink sac and the new eggs, each put where vanilla's
// creative tabs list it
{
  const after = (id: string, prev: string): void => {
    const it = ITEM_LIST.splice(ITEM_LIST.findIndex((x) => x.id === id), 1)[0];
    ITEM_LIST.splice(ITEM_LIST.findIndex((x) => x.id === prev) + 1, 0, it);
  };
  reg({ id: 'tropical_fish', texture: 'tropical_fish', creativeTab: 'food', food: { nutrition: 1, saturation: 0.1 } });
  after('tropical_fish', 'cooked_salmon');
  let prev = 'water_bucket';
  for (const [f, n] of [['cod', 'Cod'], ['salmon', 'Salmon'], ['tropical_fish', 'Tropical Fish'], ['pufferfish', 'Pufferfish']]) {
    reg({ id: `${f}_bucket`, name: `Bucket of ${n}`, texture: `${f}_bucket`, maxStack: 1, creativeTab: 'tools' });
    after(`${f}_bucket`, prev);
    prev = `${f}_bucket`;
  }
  reg({ id: 'glow_ink_sac', texture: 'glow_ink_sac' });
  after('glow_ink_sac', 'ink_sac');
  for (const m of ['cod', 'dolphin', 'glow_squid', 'pufferfish', 'salmon', 'tropical_fish']) reg({ id: `${m}_spawn_egg`, texture: `${m}_spawn_egg`, creativeTab: 'spawn_eggs' });
  // (Stage 5: ocean, M5) vanilla Items.HEART_OF_THE_SEA (uncommon, buried treasure's), listed after the nautilus shell;
  // the ocean ruins' pottery sherds, and then all the sherds in name order where the first of them was (as vanilla's
  // creative tab lists them); the conduit (rare)
  reg({ id: 'heart_of_the_sea', texture: 'heart_of_the_sea', rarity: 'uncommon' });
  after('heart_of_the_sea', 'nautilus_shell');
  for (const s of ['angler', 'blade', 'explorer', 'mourner', 'plenty', 'shelter', 'snort']) reg({ id: `${s}_pottery_sherd`, texture: `${s}_pottery_sherd` });
  const sherds = ITEM_LIST.filter((x) => x.id.endsWith('_pottery_sherd')).sort((a, b) => (a.id < b.id ? -1 : 1));
  const first = ITEM_LIST.findIndex((x) => x.id.endsWith('_pottery_sherd'));
  for (const it of sherds) ITEM_LIST.splice(ITEM_LIST.indexOf(it), 1);
  ITEM_LIST.splice(first, 0, ...sherds);
  if (ITEMS.has('conduit')) ITEMS.get('conduit')!.rarity = 'rare';
}
// sugar cane item places the block
{
  const sc = ITEMS.get('sugar_cane');
  if (sc) sc.texture = 'sugar_cane';
}
for (const id of ['torch', 'soul_torch', 'short_grass', 'fern', 'dead_bush', 'vine', 'lily_pad', 'cobweb', 'ladder', 'seagrass', 'kelp', 'sweet_berries', 'lever']) {
  const it = ITEMS.get(id);
  if (it && it.block) it.texture = 'block:' + (id === 'kelp' ? 'kelp' : id);
}
// block items drawn as flat sprites (vanilla item/generated models)
for (const b of BLOCKS) {
  const it = ITEMS.get(b.name);
  if (!it || !it.block) continue;
  const n = b.name;
  if (n.endsWith('_door') || n.endsWith('_bed') || n === 'lantern' || n === 'soul_lantern' || n === 'chain' || n === 'bell' || n === 'cauldron' || n === 'brewing_stand' || n === 'flower_pot' || n === 'campfire' || n === 'soul_campfire') {
    it.texture = n;
    if (n.endsWith('_bed')) it.maxStack = 1;
  }
  // (vanilla BannerItem: sixteen to a stack, fuel like planks; drawn by the banner's renderer, the sprite behind it)
  if (n.endsWith('_banner')) Object.assign(it, { texture: n, maxStack: 16, fuel: 300, creativeTab: 'colored' });
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
  if (n === 'hanging_roots') it.texture = 'block:hanging_roots';
  if (n === 'spore_blossom' || n === 'small_dripleaf') it.texture = n;
  if (n === 'iron_bars') it.texture = 'block:iron_bars';
  if (n.endsWith('_stained_glass_pane')) it.texture = 'block:' + n.replace('_pane', '');
}
for (const b of BLOCKS) {
  const it = ITEMS.get(b.name);
  if (!it || !it.block) continue;
  if (/_sapling$|^(dandelion|poppy|blue_orchid|allium|azure_bluet|red_tulip|orange_tulip|white_tulip|pink_tulip|oxeye_daisy|cornflower|lily_of_the_valley|brown_mushroom|red_mushroom)$/.test(b.name)) it.texture = 'block:' + b.name;
  if (/^(tall_grass|large_fern|sunflower|lilac|rose_bush|peony)$/.test(b.name)) it.texture = 'block:' + b.name + (b.name === 'sunflower' ? '_front' : '_top');
}

// the redstone components' items (vanilla item/generated): the torch and tripwire hook as their block textures, the
// repeater its own sprite
for (const [id, tex] of [['redstone_torch', 'block:redstone_torch'], ['repeater', 'repeater'], ['tripwire_hook', 'block:tripwire_hook']]) {
  const it = ITEMS.get(id);
  if (it) it.texture = tex;
}

export function itemForBlock(name: string): Item | undefined {
  // (a block that is another's item's: a wall banner is its banner's)
  const own = BLOCK_BY_NAME.get(name)?.s.item;
  if (typeof own === 'string') return ITEMS.get(own);
  if (name === 'wall_torch') return ITEMS.get('torch');
  if (name === 'soul_wall_torch') return ITEMS.get('soul_torch');
  if (name === 'cave_vines' || name === 'cave_vines_plant') return ITEMS.get('glow_berries');
  if (name === 'big_dripleaf_stem') return ITEMS.get('big_dripleaf');
  if (name === 'water_cauldron' || name === 'lava_cauldron') return ITEMS.get('cauldron');
  // (vanilla FlowerPotBlock.getCloneItemStack: a potted plant picks as its plant)
  if (name.startsWith('potted_')) return ITEMS.get(name.slice(7).replace(/^(flowering_)?azalea_bush$/, '$1azalea'));
  return ITEMS.get(name);
}

export function blockForItem(it: Item): Block | undefined {
  if (it.id === 'sugar_cane') return getBlock('sugar_cane');
  if (it.id === 'wheat_seeds') return getBlock('wheat');
  if (it.id === 'carrot') return getBlock('carrots');
  if (it.id === 'potato') return getBlock('potatoes');
  if (it.id === 'beetroot_seeds') return getBlock('beetroots');
  if (it.id === 'nether_wart') return getBlock('nether_wart');
  if (it.id === 'pumpkin_seeds') return getBlock('pumpkin_stem');
  if (it.id === 'melon_seeds') return getBlock('melon_stem');
  if (it.id === 'sweet_berries') return getBlock('sweet_berry_bush');
  if (it.id === 'glow_berries') return getBlock('cave_vines');
  // (vanilla ItemNameBlockItem: redstone places redstone dust, string places tripwire)
  if (it.id === 'redstone') return getBlock('redstone_wire');
  if (it.id === 'string') return getBlock('tripwire');
  return it.block;
}

/** per-stack data (vanilla data components) */
export interface ItemTag {
  /** minecraft:enchantments, id → level in the order they were applied */
  enchantments?: Record<string, number>;
  /** minecraft:stored_enchantments (enchanted books) */
  stored?: Record<string, number>;
  /** minecraft:custom_name (anvil renames) */
  customName?: string;
  /** minecraft:repair_cost: the anvil's prior work penalty */
  repairCost?: number;
  /** minecraft:charged_projectiles: what a loaded crossbow will fire (see item/crossbow.ts) */
  charged?: ChargedProjectile[];
  /** minecraft:dyed_color rgb (leather armour, see item/dyedColor.ts) */
  dyedColor?: number;
  /** minecraft:dyed_color show_in_tooltip: false */
  dyedHidden?: boolean;
  /** minecraft:potion_contents (potions, tipped arrows; see item/potions.ts) */
  potion?: PotionContents;
  /** minecraft:item_name: the name the stack goes by under any custom name (the ominous banner's) */
  itemName?: string;
  /** minecraft:rarity, over the item's own */
  rarity?: Rarity;
  /** minecraft:hide_additional_tooltip: no item-specific tooltip lines (the ominous banner's patterns) */
  hideAdditional?: boolean;
  /** minecraft:banner_patterns: the layers over a banner's base colour, bottom first */
  patterns?: BannerLayer[];
  /** minecraft:base_color: a shield's, from the banner that decorated it */
  baseColor?: string;
  /** minecraft:ominous_bottle_amplifier: the bad omen an ominous bottle gives (0-4) */
  ominousAmplifier?: number;
  /** minecraft:map_id */
  mapId?: number;
  /** minecraft:map_post_processing: what a cartography table's result will do to its map when taken */
  mapPostProcessing?: 'lock' | 'scale';
  /** minecraft:trim: an armour trim's pattern and material */
  trim?: { pattern: string; material: string };
  /** minecraft:writable_book_content: a book and quill's pages */
  pages?: string[];
  /** minecraft:written_book_content: a signed book */
  book?: WrittenBook;
  /** minecraft:container: what a shulker box holds, slot by slot (the filled ones) */
  container?: ContainerSlot[];
  /** minecraft:pot_decorations: a decorated pot's sides, back, left, right and front ('brick' for a plain one) */
  potDecorations?: string[];
  /** minecraft:suspicious_stew_effects: what a suspicious stew gives when eaten (duration in ticks) */
  stewEffects?: { id: string; duration: number }[];
  /** (Stage 5: ocean) minecraft:bucket_entity_data: what a bucket of fish keeps of it (Health, BucketVariantTag) */
  bucketEntity?: Record<string, number | boolean>;
  /** (Stage 5: ocean) minecraft:map_decorations: the markers an explorer map carries, by id (its target, "+") */
  mapDecorations?: Record<string, { type: string; x: number; z: number; rotation: number }>;
  /** (Stage 5: ocean) minecraft:map_color: the tint of the markings on an explorer map's sprite */
  mapColor?: number;
}

/** one filled slot of minecraft:container (vanilla ItemContainerContents.Slot) */
export interface ContainerSlot {
  slot: number;
  id: string;
  count: number;
  damage?: number;
  tag?: ItemTag;
}

/** vanilla PotionContents: the potion (a registry id; none for an uncraftable one), a custom colour, custom effects */
export interface PotionContents {
  potion?: string;
  customColor?: number;
  customEffects?: SavedEffect[];
}

/** one layer of a banner's patterns (vanilla BannerPatternLayers.Layer) */
export interface BannerLayer {
  pattern: string;
  color: string;
}

/** vanilla WrittenBookContent: title, author, how many copies from the original (0-3) and the pages */
export interface WrittenBook {
  title: string;
  author: string;
  generation: number;
  pages: string[];
}

/** one of a crossbow's charged projectiles: the item, and vanilla INTANGIBLE_PROJECTILE (multishot's copies, creative's) */
export interface ChargedProjectile {
  id: string;
  intangible?: boolean;
  /** the projectile stack's own components (a tipped arrow's potion) */
  tag?: ItemTag;
}

export function clonePotion(p: PotionContents): PotionContents {
  const o: PotionContents = {};
  if (p.potion !== undefined) o.potion = p.potion;
  if (p.customColor !== undefined) o.customColor = p.customColor;
  if (p.customEffects?.length) o.customEffects = JSON.parse(JSON.stringify(p.customEffects));
  return o;
}

function samePotion(a: PotionContents | undefined, b: PotionContents | undefined): boolean {
  if (!a || !b) return !a === !b;
  return a.potion === b.potion && a.customColor === b.customColor && JSON.stringify(a.customEffects ?? []) === JSON.stringify(b.customEffects ?? []);
}

export function cloneTag(t: ItemTag | null): ItemTag | null {
  if (!t) return null;
  const o: ItemTag = {};
  if (t.enchantments) o.enchantments = { ...t.enchantments };
  if (t.stored) o.stored = { ...t.stored };
  if (t.customName !== undefined) o.customName = t.customName;
  if (t.repairCost) o.repairCost = t.repairCost;
  if (t.charged?.length) o.charged = t.charged.map((p) => ({ ...p, ...(p.tag ? { tag: cloneTag(p.tag)! } : {}) }));
  if (t.dyedColor !== undefined) o.dyedColor = t.dyedColor;
  if (t.dyedHidden) o.dyedHidden = true;
  if (t.potion) o.potion = clonePotion(t.potion);
  if (t.itemName !== undefined) o.itemName = t.itemName;
  if (t.rarity) o.rarity = t.rarity;
  if (t.hideAdditional) o.hideAdditional = true;
  if (t.patterns?.length) o.patterns = t.patterns.map((l) => ({ ...l }));
  if (t.baseColor !== undefined) o.baseColor = t.baseColor;
  if (t.ominousAmplifier !== undefined) o.ominousAmplifier = t.ominousAmplifier;
  if (t.mapId !== undefined) o.mapId = t.mapId;
  if (t.mapPostProcessing) o.mapPostProcessing = t.mapPostProcessing;
  if (t.trim) o.trim = { ...t.trim };
  if (t.pages) o.pages = [...t.pages];
  if (t.book) o.book = { ...t.book, pages: [...t.book.pages] };
  if (t.container?.length) o.container = t.container.map((c) => ({ ...c, ...(c.tag ? { tag: cloneTag(c.tag)! } : {}) }));
  if (t.potDecorations) o.potDecorations = [...t.potDecorations];
  if (t.stewEffects) o.stewEffects = t.stewEffects.map((e) => ({ ...e }));
  // (Stage 5: ocean)
  if (t.bucketEntity) o.bucketEntity = { ...t.bucketEntity };
  if (t.mapDecorations) o.mapDecorations = Object.fromEntries(Object.entries(t.mapDecorations).map(([k, v]) => [k, { ...v }]));
  if (t.mapColor !== undefined) o.mapColor = t.mapColor;
  return o;
}

/** the newer components compared as data (JSON) */
const sameData = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** vanilla isSameItemSameComponents on two tags */
export function sameTag(a: ItemTag | null | undefined, b: ItemTag | null | undefined): boolean {
  return (
    sameEnchants(a?.enchantments, b?.enchantments) && sameEnchants(a?.stored, b?.stored) && a?.customName === b?.customName && (a?.repairCost ?? 0) === (b?.repairCost ?? 0) &&
    sameCharged(a?.charged, b?.charged) && a?.dyedColor === b?.dyedColor && !a?.dyedHidden === !b?.dyedHidden && samePotion(a?.potion, b?.potion) &&
    a?.itemName === b?.itemName && a?.rarity === b?.rarity && !a?.hideAdditional === !b?.hideAdditional && sameData(a?.patterns?.length ? a.patterns : null, b?.patterns?.length ? b.patterns : null) && a?.baseColor === b?.baseColor &&
    a?.ominousAmplifier === b?.ominousAmplifier &&
    a?.mapId === b?.mapId && a?.mapPostProcessing === b?.mapPostProcessing && sameData(a?.trim, b?.trim) && sameData(a?.pages, b?.pages) && sameData(a?.book, b?.book) &&
    sameData(a?.potDecorations, b?.potDecorations) && sameData(a?.stewEffects, b?.stewEffects) &&
    sameData(a?.container?.length ? a.container : null, b?.container?.length ? b.container : null) &&
    // (Stage 5: ocean)
    sameData(a?.bucketEntity, b?.bucketEntity) && sameData(a?.mapDecorations, b?.mapDecorations) && a?.mapColor === b?.mapColor
  );
}

function sameCharged(a: ChargedProjectile[] | undefined, b: ChargedProjectile[] | undefined): boolean {
  const la = a?.length ?? 0;
  if (la !== (b?.length ?? 0)) return false;
  for (let i = 0; i < la; i++) if (a![i].id !== b![i].id || !a![i].intangible !== !b![i].intangible || !sameTag(a![i].tag, b![i].tag)) return false;
  return true;
}

function sameEnchants(a: Record<string, number> | undefined, b: Record<string, number> | undefined): boolean {
  const ka = a ? Object.keys(a) : [], kb = b ? Object.keys(b) : [];
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a![k] !== b?.[k]) return false;
  return true;
}

export class ItemStack {
  /** vanilla popTime: ticks left of the hotbar icon's bounce after items came into this stack */
  popTime = 0;
  constructor(public item: Item, public count = 1, public damage = 0, public tag: ItemTag | null = null) {}
  static of(id: string, count = 1): ItemStack {
    return new ItemStack(getItem(id), count);
  }
  copy(): ItemStack {
    const s = new ItemStack(this.item, this.count, this.damage, cloneTag(this.tag));
    s.popTime = this.popTime;
    return s;
  }
  copyWithCount(n: number): ItemStack {
    const s = new ItemStack(this.item, n, this.damage, cloneTag(this.tag));
    s.popTime = this.popTime;
    return s;
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
    return sameTag(this.tag, o.tag);
  }
  /**
   * vanilla getHoverName: the custom name, else the item_name component, else the item's name for this stack (vanilla
   * WrittenBookItem.getName: a signed book's title; a potion's)
   */
  displayName(): string {
    const t = this.tag;
    return t?.customName ?? t?.itemName ?? (t?.book && t.book.title.trim() ? t.book.title : undefined) ?? this.item.stackName?.(this) ?? this.item.name;
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
    const r = this.tag?.rarity ?? this.item.rarity ?? 'common';
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
