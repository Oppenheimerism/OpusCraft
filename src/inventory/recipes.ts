// Crafting (shaped/shapeless), smelting recipes and furnace fuel, following
// the vanilla data pack for the items this game has.

import { ITEMS, ItemStack } from '../item/item';

/** ingredient: item id, '#tag', or list of alternatives */
type Ing = string | string[];

interface Shaped {
  kind: 'shaped';
  pattern: string[];
  key: Record<string, Ing>;
  result: string;
  count: number;
}
interface Shapeless {
  kind: 'shapeless';
  ingredients: Ing[];
  result: string;
  count: number;
}
export type CraftingRecipe = Shaped | Shapeless;

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];

const TAGS: Record<string, string[]> = {
  planks: WOODS.map((w) => `${w}_planks`),
  logs: WOODS.flatMap((w) => [`${w}_log`, `${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`]),
  stone_tool_materials: ['cobblestone', 'cobbled_deepslate'],
  stone_crafting_materials: ['cobblestone', 'cobbled_deepslate'],
  coals: ['coal', 'charcoal'],
  wool: COLORS.map((c) => `${c}_wool`),
  sand: ['sand', 'red_sand'],
  wooden_slabs: WOODS.map((w) => `${w}_slab`),
};
for (const w of WOODS) TAGS[`${w}_logs`] = [`${w}_log`, `${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`];
/** the nether woods: planks like any other, but (vanilla #non_flammable_wood) no good as fuel */
const NETHER_WOODS = ['crimson', 'warped'];
for (const w of NETHER_WOODS) {
  TAGS.planks.push(`${w}_planks`);
  TAGS[`${w}_stems`] = [`${w}_stem`, `${w}_hyphae`, `stripped_${w}_stem`, `stripped_${w}_hyphae`];
}

export type Ingredient = Ing;

/** every item id an ingredient accepts (tags expanded) */
export function expand(ing: Ing): Set<string> {
  const out = new Set<string>();
  for (const i of Array.isArray(ing) ? ing : [ing]) {
    if (i.startsWith('#')) for (const t of TAGS[i.slice(1)] ?? []) out.add(t);
    else out.add(i);
  }
  return out;
}

export const RECIPES: CraftingRecipe[] = [];

function shaped(result: string, count: number, pattern: string[], key: Record<string, Ing>): void {
  RECIPES.push({ kind: 'shaped', pattern, key, result, count });
}
function shapeless(result: string, count: number, ...ingredients: Ing[]): void {
  RECIPES.push({ kind: 'shapeless', ingredients, result, count });
}

// ---------------------------------------------------------------------------
// Wood
for (const w of WOODS) {
  shapeless(`${w}_planks`, 4, `#${w}_logs`);
  shaped(`${w}_wood`, 3, ['##', '##'], { '#': `${w}_log` });
  shaped(`stripped_${w}_wood`, 3, ['##', '##'], { '#': `stripped_${w}_log` });
  shaped(`${w}_slab`, 6, ['###'], { '#': `${w}_planks` });
  shaped(`${w}_stairs`, 4, ['#  ', '## ', '###'], { '#': `${w}_planks` });
}
for (const w of NETHER_WOODS) {
  shapeless(`${w}_planks`, 4, `#${w}_stems`);
  shaped(`${w}_hyphae`, 3, ['##', '##'], { '#': `${w}_stem` });
  shaped(`stripped_${w}_hyphae`, 3, ['##', '##'], { '#': `stripped_${w}_stem` });
}
shaped('stick', 4, ['#', '#'], { '#': '#planks' });
shaped('crafting_table', 1, ['##', '##'], { '#': '#planks' });
shaped('chest', 1, ['###', '# #', '###'], { '#': '#planks' });
shaped('furnace', 1, ['###', '# #', '###'], { '#': '#stone_crafting_materials' });
shaped('torch', 4, ['X', '#'], { X: '#coals', '#': 'stick' });
shaped('ladder', 3, ['# #', '###', '# #'], { '#': 'stick' });
shaped('bowl', 4, ['# #', ' # '], { '#': '#planks' });
shaped('bookshelf', 1, ['###', 'XXX', '###'], { '#': '#planks', X: 'book' });
shaped('oak_sign', 3, ['###', '###', ' X '], { '#': 'oak_planks', X: 'stick' });
// vanilla boat recipes: planks in a U, and a chest added to a boat
for (const w of WOODS) {
  shaped(`${w}_boat`, 1, ['# #', '###'], { '#': `${w}_planks` });
  shapeless(`${w}_chest_boat`, 1, 'chest', `${w}_boat`);
}
shaped('painting', 1, ['###', '#X#', '###'], { '#': 'stick', X: '#wool' });
shaped('item_frame', 1, ['###', '#X#', '###'], { '#': 'stick', X: 'leather' });

// ---------------------------------------------------------------------------
// Tools, weapons, armor
const TOOL_MATS: [string, Ing][] = [
  ['wooden', '#planks'],
  ['stone', '#stone_tool_materials'],
  ['iron', 'iron_ingot'],
  ['golden', 'gold_ingot'],
  ['diamond', 'diamond'],
];
for (const [m, x] of TOOL_MATS) {
  shaped(`${m}_pickaxe`, 1, ['XXX', ' # ', ' # '], { X: x, '#': 'stick' });
  shaped(`${m}_axe`, 1, ['XX', 'X#', ' #'], { X: x, '#': 'stick' });
  shaped(`${m}_shovel`, 1, ['X', '#', '#'], { X: x, '#': 'stick' });
  shaped(`${m}_hoe`, 1, ['XX', ' #', ' #'], { X: x, '#': 'stick' });
  shaped(`${m}_sword`, 1, ['X', 'X', '#'], { X: x, '#': 'stick' });
}
const ARMOR_MATS: [string, string][] = [
  ['leather', 'leather'],
  ['iron', 'iron_ingot'],
  ['golden', 'gold_ingot'],
  ['diamond', 'diamond'],
];
for (const [m, x] of ARMOR_MATS) {
  shaped(`${m}_helmet`, 1, ['XXX', 'X X'], { X: x });
  shaped(`${m}_chestplate`, 1, ['X X', 'XXX', 'XXX'], { X: x });
  shaped(`${m}_leggings`, 1, ['XXX', 'X X', 'X X'], { X: x });
  shaped(`${m}_boots`, 1, ['X X', 'X X'], { X: x });
}
shaped('bow', 1, [' #X', '# X', ' #X'], { '#': 'stick', X: 'string' });
shaped('arrow', 4, ['X', '#', 'Y'], { X: 'flint', '#': 'stick', Y: 'feather' });
shaped('bucket', 1, ['# #', ' # '], { '#': 'iron_ingot' });
shaped('shears', 1, [' #', '# '], { '#': 'iron_ingot' });
shapeless('flint_and_steel', 1, 'iron_ingot', 'flint');
shaped('compass', 1, [' # ', '#X#', ' # '], { '#': 'iron_ingot', X: 'redstone' });
shaped('clock', 1, [' # ', '#X#', ' # '], { '#': 'gold_ingot', X: 'redstone' });
shaped('fishing_rod', 1, ['  #', ' #X', '# X'], { '#': 'stick', X: 'string' });
shaped('map', 1, ['###', '#X#', '###'], { '#': 'paper', X: 'compass' });
shaped('minecart', 1, ['# #', '###'], { '#': 'iron_ingot' });
shapeless('chest_minecart', 1, 'chest', 'minecart');
shaped('rail', 16, ['X X', 'X#X', 'X X'], { X: 'iron_ingot', '#': 'stick' });
shaped('iron_door', 3, ['##', '##', '##'], { '#': 'iron_ingot' });
shaped('glass_bottle', 3, ['# #', ' # '], { '#': 'glass' });
shaped('lead', 2, ['~~ ', '~O ', '  ~'], { '~': 'string', O: 'slime_ball' });

// ---------------------------------------------------------------------------
// Food
shaped('bread', 1, ['###'], { '#': 'wheat' });
shaped('cookie', 8, ['#X#'], { '#': 'wheat', X: 'cocoa_beans' });
shaped('golden_apple', 1, ['###', '#X#', '###'], { '#': 'gold_ingot', X: 'apple' });
shapeless('mushroom_stew', 1, 'brown_mushroom', 'red_mushroom', 'bowl');
shapeless('sugar', 1, 'sugar_cane');
shaped('paper', 3, ['###'], { '#': 'sugar_cane' });
shapeless('book', 1, 'paper', 'paper', 'paper', 'leather');

// ---------------------------------------------------------------------------
// Storage blocks and nuggets
const STORAGE: [string, string][] = [
  ['iron_block', 'iron_ingot'],
  ['gold_block', 'gold_ingot'],
  ['diamond_block', 'diamond'],
  ['emerald_block', 'emerald'],
  ['lapis_block', 'lapis_lazuli'],
  ['redstone_block', 'redstone'],
  ['coal_block', 'coal'],
  ['copper_block', 'copper_ingot'],
  ['raw_iron_block', 'raw_iron'],
  ['raw_gold_block', 'raw_gold'],
  ['raw_copper_block', 'raw_copper'],
  ['hay_block', 'wheat'],
];
for (const [block, item] of STORAGE) {
  shaped(block, 1, ['###', '###', '###'], { '#': item });
  shapeless(item, 9, block);
}
shaped('iron_ingot', 1, ['###', '###', '###'], { '#': 'iron_nugget' });
shapeless('iron_nugget', 9, 'iron_ingot');
shaped('gold_ingot', 1, ['###', '###', '###'], { '#': 'gold_nugget' });
shapeless('gold_nugget', 9, 'gold_ingot');
shaped('melon', 1, ['###', '###', '###'], { '#': 'melon_slice' });

// ---------------------------------------------------------------------------
// Stone and building blocks
shaped('stone_bricks', 4, ['##', '##'], { '#': 'stone' });
shapeless('mossy_stone_bricks', 1, 'stone_bricks', ['vine', 'moss_block']);
shapeless('mossy_cobblestone', 1, 'cobblestone', ['vine', 'moss_block']);
shaped('moss_carpet', 3, ['##'], { '#': 'moss_block' });
shaped('chiseled_stone_bricks', 1, ['#', '#'], { '#': 'stone_brick_slab' });
shaped('sandstone', 1, ['##', '##'], { '#': 'sand' });
shaped('cut_sandstone', 4, ['##', '##'], { '#': 'sandstone' });
shaped('chiseled_sandstone', 1, ['#', '#'], { '#': 'sandstone_slab' });
shaped('red_sandstone', 1, ['##', '##'], { '#': 'red_sand' });
shaped('polished_granite', 4, ['SS', 'SS'], { S: 'granite' });
shaped('polished_diorite', 4, ['SS', 'SS'], { S: 'diorite' });
shaped('polished_andesite', 4, ['SS', 'SS'], { S: 'andesite' });
shapeless('granite', 1, 'diorite', 'quartz');
shaped('diorite', 2, ['CQ', 'QC'], { C: 'cobblestone', Q: 'quartz' });
shapeless('andesite', 2, 'diorite', 'cobblestone');
shaped('polished_deepslate', 4, ['SS', 'SS'], { S: 'cobbled_deepslate' });
shaped('deepslate_bricks', 4, ['SS', 'SS'], { S: 'polished_deepslate' });
shaped('deepslate_tiles', 4, ['SS', 'SS'], { S: 'deepslate_bricks' });
shaped('bricks', 1, ['##', '##'], { '#': 'brick' });
shaped('clay', 1, ['##', '##'], { '#': 'clay_ball' });
shaped('snow_block', 1, ['##', '##'], { '#': 'snowball' });
shaped('snow', 6, ['###'], { '#': 'snow_block' });
shaped('glowstone', 1, ['##', '##'], { '#': 'glowstone_dust' });
shaped('coarse_dirt', 4, ['DG', 'GD'], { D: 'dirt', G: 'gravel' });
shaped('tnt', 1, ['X#X', '#X#', 'X#X'], { X: 'gunpowder', '#': '#sand' });
shaped('jack_o_lantern', 1, ['A', 'B'], { A: 'carved_pumpkin', B: 'torch' });
const SLABS: [string, string][] = [
  ['cobblestone', 'cobblestone'],
  ['stone', 'stone'],
  ['stone_brick', 'stone_bricks'],
  ['sandstone', 'sandstone'],
  ['brick', 'bricks'],
  ['mossy_cobblestone', 'mossy_cobblestone'],
  ['mossy_stone_brick', 'mossy_stone_bricks'],
  ['granite', 'granite'],
  ['polished_granite', 'polished_granite'],
  ['diorite', 'diorite'],
  ['polished_diorite', 'polished_diorite'],
  ['andesite', 'andesite'],
  ['polished_andesite', 'polished_andesite'],
  ['cobbled_deepslate', 'cobbled_deepslate'],
  ['polished_deepslate', 'polished_deepslate'],
  ['deepslate_brick', 'deepslate_bricks'],
  ['deepslate_tile', 'deepslate_tiles'],
  ['red_sandstone', 'red_sandstone'],
  ['smooth_sandstone', 'smooth_sandstone'],
  ['smooth_red_sandstone', 'smooth_red_sandstone'],
  ['smooth_stone', 'smooth_stone'],
  ['cut_sandstone', 'cut_sandstone'],
];
for (const [n, mat] of SLABS) {
  shaped(`${n}_slab`, 6, ['###'], { '#': mat });
  if (ITEMS.has(`${n}_stairs`)) shaped(`${n}_stairs`, 4, ['#  ', '## ', '###'], { '#': mat });
}
// walls (vanilla: 6 from two rows of three)
for (const [wall, mat] of [
  ['cobblestone_wall', 'cobblestone'], ['mossy_cobblestone_wall', 'mossy_cobblestone'], ['stone_brick_wall', 'stone_bricks'],
  ['mossy_stone_brick_wall', 'mossy_stone_bricks'], ['brick_wall', 'bricks'], ['granite_wall', 'granite'], ['diorite_wall', 'diorite'],
  ['andesite_wall', 'andesite'], ['sandstone_wall', 'sandstone'], ['red_sandstone_wall', 'red_sandstone'], ['cobbled_deepslate_wall', 'cobbled_deepslate'],
  ['polished_deepslate_wall', 'polished_deepslate'], ['deepslate_brick_wall', 'deepslate_bricks'], ['deepslate_tile_wall', 'deepslate_tiles'],
]) shaped(wall, 6, ['###', '###'], { '#': mat });
// doors, trapdoors, fences, gates
for (const w of WOODS) {
  shaped(`${w}_door`, 3, ['##', '##', '##'], { '#': `${w}_planks` });
  shaped(`${w}_trapdoor`, 2, ['###', '###'], { '#': `${w}_planks` });
  shaped(`${w}_fence`, 3, ['W#W', 'W#W'], { W: `${w}_planks`, '#': 'stick' });
  shaped(`${w}_fence_gate`, 1, ['#W#', '#W#'], { W: `${w}_planks`, '#': 'stick' });
}
shaped('iron_trapdoor', 1, ['##', '##'], { '#': 'iron_ingot' });
shaped('iron_bars', 16, ['###', '###'], { '#': 'iron_ingot' });
shaped('glass_pane', 16, ['###', '###'], { '#': 'glass' });
shaped('lantern', 1, ['XXX', 'X#X', 'XXX'], { X: 'iron_nugget', '#': 'torch' });
shaped('chain', 1, ['N', 'I', 'N'], { N: 'iron_nugget', I: 'iron_ingot' });
shaped('amethyst_block', 1, ['##', '##'], { '#': 'amethyst_shard' });
shaped('tinted_glass', 2, [' S ', 'SGS', ' S '], { S: 'amethyst_shard', G: 'glass' });
shapeless('pumpkin_seeds', 4, 'pumpkin');
shaped('beetroot_soup', 1, ['OOO', 'OOO', ' B '], { O: 'beetroot', B: 'bowl' });
shapeless('pumpkin_pie', 1, 'pumpkin', 'sugar', 'egg');
shaped('golden_carrot', 1, ['###', '#X#', '###'], { '#': 'gold_nugget', X: 'carrot' });
shapeless('melon_seeds', 1, 'melon_slice');
shaped('melon', 1, ['###', '###', '###'], { '#': 'melon_slice' });
for (const c of COLORS) {
  shaped(`${c}_stained_glass`, 8, ['###', '#X#', '###'], { '#': 'glass', X: `${c}_dye` });
  shaped(`${c}_stained_glass_pane`, 16, ['###', '###'], { '#': `${c}_stained_glass` });
  shaped(`${c}_stained_glass_pane`, 8, ['###', '#X#', '###'], { '#': 'glass_pane', X: `${c}_dye` });
  shaped(`${c}_carpet`, 3, ['##'], { '#': `${c}_wool` });
  shaped(`${c}_bed`, 1, ['###', 'XXX'], { '#': `${c}_wool`, X: '#planks' });
}

// ---------------------------------------------------------------------------
// Wool, dyes and colored blocks
shaped('white_wool', 1, ['##', '##'], { '#': 'string' });
for (const c of COLORS) {
  if (c !== 'white') shapeless(`${c}_wool`, 1, `${c}_dye`, COLORS.filter((x) => x !== c).map((x) => `${x}_wool`));
  shaped(`${c}_terracotta`, 8, ['###', '#X#', '###'], { '#': 'terracotta', X: `${c}_dye` });
}
const FLOWER_DYES: [string, string, number][] = [
  ['dandelion', 'yellow_dye', 1], ['poppy', 'red_dye', 1], ['blue_orchid', 'light_blue_dye', 1], ['allium', 'magenta_dye', 1],
  ['azure_bluet', 'light_gray_dye', 1], ['red_tulip', 'red_dye', 1], ['orange_tulip', 'orange_dye', 1], ['white_tulip', 'light_gray_dye', 1],
  ['pink_tulip', 'pink_dye', 1], ['oxeye_daisy', 'light_gray_dye', 1], ['cornflower', 'blue_dye', 1], ['lily_of_the_valley', 'white_dye', 1],
  ['sunflower', 'yellow_dye', 2], ['lilac', 'magenta_dye', 2], ['rose_bush', 'red_dye', 2], ['peony', 'pink_dye', 2],
  ['bone_meal', 'white_dye', 1], ['ink_sac', 'black_dye', 1], ['cocoa_beans', 'brown_dye', 1], ['lapis_lazuli', 'blue_dye', 1],
];
for (const [src, dye, n] of FLOWER_DYES) shapeless(dye, n, src);
shapeless('bone_meal', 3, 'bone');
shapeless('orange_dye', 2, 'red_dye', 'yellow_dye');
shapeless('light_blue_dye', 2, 'blue_dye', 'white_dye');
shapeless('pink_dye', 2, 'red_dye', 'white_dye');
shapeless('lime_dye', 2, 'green_dye', 'white_dye');
shapeless('gray_dye', 2, 'black_dye', 'white_dye');
shapeless('light_gray_dye', 2, 'gray_dye', 'white_dye');
shapeless('light_gray_dye', 3, 'black_dye', 'white_dye', 'white_dye');
shapeless('cyan_dye', 2, 'blue_dye', 'green_dye');
shapeless('purple_dye', 2, 'blue_dye', 'red_dye');
shapeless('magenta_dye', 2, 'purple_dye', 'pink_dye');
shapeless('magenta_dye', 3, 'blue_dye', 'red_dye', 'pink_dye');
shapeless('magenta_dye', 4, 'blue_dye', 'red_dye', 'red_dye', 'white_dye');

// drop recipes whose items don't exist in this game
for (let i = RECIPES.length - 1; i >= 0; i--) {
  const r = RECIPES[i];
  const ings = r.kind === 'shaped' ? Object.values(r.key) : r.ingredients;
  const ok = ITEMS.has(r.result) && ings.every((g) => [...expand(g)].some((id) => ITEMS.has(id)));
  if (!ok) RECIPES.splice(i, 1);
}
const EXPANDED = new Map<Ing, Set<string>>();
function matches(ing: Ing, s: ItemStack | null): boolean {
  if (!s) return false;
  let set = EXPANDED.get(ing);
  if (!set) EXPANDED.set(ing, (set = expand(ing)));
  return set.has(s.item.id);
}

/** find the recipe matching a w×h crafting grid (vanilla: shaped patterns may shift and mirror) */
export function findRecipe(grid: (ItemStack | null)[], w: number, h: number): CraftingRecipe | null {
  const present = grid.filter((s) => s);
  if (!present.length) return null;
  for (const r of RECIPES) {
    if (r.kind === 'shapeless') {
      if (r.ingredients.length !== present.length) continue;
      const used = new Array(present.length).fill(false);
      let ok = true;
      for (const ing of r.ingredients) {
        const k = present.findIndex((s, i) => !used[i] && matches(ing, s));
        if (k < 0) {
          ok = false;
          break;
        }
        used[k] = true;
      }
      if (ok) return r;
      continue;
    }
    const pw = r.pattern[0].length, ph = r.pattern.length;
    if (pw > w || ph > h) continue;
    for (let ox = 0; ox <= w - pw; ox++)
      for (let oy = 0; oy <= h - ph; oy++)
        for (const mirror of [false, true]) {
          let ok = true;
          for (let y = 0; y < h && ok; y++)
            for (let x = 0; x < w && ok; x++) {
              const s = grid[y * w + x];
              const px = x - ox, py = y - oy;
              let ch = ' ';
              if (px >= 0 && py >= 0 && px < pw && py < ph) ch = r.pattern[py][mirror ? pw - 1 - px : px];
              if (ch === ' ') ok = !s;
              else ok = matches(r.key[ch], s);
            }
          if (ok) return r;
        }
  }
  return null;
}

/** items left behind in the grid after crafting (buckets) */
export function craftingRemainder(s: ItemStack): ItemStack | null {
  if (s.item.id === 'milk_bucket' || s.item.id === 'water_bucket' || s.item.id === 'lava_bucket') return ItemStack.of('bucket');
  return null;
}

// ---------------------------------------------------------------------------
// Smelting

interface Smelt {
  result: string;
  xp: number;
}
const SMELT = new Map<string, Smelt>();
/** smelting recipes as written (one per vanilla recipe: a list of accepted inputs) */
export const SMELTING: { inputs: string[]; result: string; xp: number }[] = [];
function smelt(inputs: string[], result: string, xp: number): void {
  const ok = inputs.filter((i) => ITEMS.has(i));
  if (!ok.length || !ITEMS.has(result)) return;
  for (const i of ok) SMELT.set(i, { result, xp });
  // vanilla has one recipe per ore block/raw item, but a single tag recipe for logs and sand
  if (result === 'charcoal' || result === 'glass') SMELTING.push({ inputs: ok, result, xp });
  else for (const i of ok) SMELTING.push({ inputs: [i], result, xp });
}
smelt(['iron_ore', 'deepslate_iron_ore', 'raw_iron'], 'iron_ingot', 0.7);
smelt(['gold_ore', 'deepslate_gold_ore', 'raw_gold'], 'gold_ingot', 1.0);
smelt(['copper_ore', 'deepslate_copper_ore', 'raw_copper'], 'copper_ingot', 0.7);
smelt(['diamond_ore', 'deepslate_diamond_ore'], 'diamond', 1.0);
smelt(['emerald_ore', 'deepslate_emerald_ore'], 'emerald', 1.0);
smelt(['lapis_ore', 'deepslate_lapis_ore'], 'lapis_lazuli', 0.2);
smelt(['redstone_ore', 'deepslate_redstone_ore'], 'redstone', 0.3);
smelt(['coal_ore', 'deepslate_coal_ore'], 'coal', 0.1);
smelt(TAGS.logs, 'charcoal', 0.15);
smelt(['sand', 'red_sand'], 'glass', 0.1);
smelt(['cobblestone'], 'stone', 0.1);
smelt(['stone'], 'smooth_stone', 0.1);
smelt(['cobbled_deepslate'], 'deepslate', 0.1);
smelt(['stone_bricks'], 'cracked_stone_bricks', 0.1);
smelt(['sandstone'], 'smooth_sandstone', 0.1);
smelt(['red_sandstone'], 'smooth_red_sandstone', 0.1);
smelt(['clay_ball'], 'brick', 0.3);
smelt(['clay'], 'terracotta', 0.35);
smelt(['cactus'], 'green_dye', 1.0);
smelt(['potato'], 'baked_potato', 0.35);
for (const m of ['beef', 'porkchop', 'chicken', 'mutton', 'cod', 'salmon']) smelt([m], `cooked_${m}`, 0.35);

export function smeltingResult(s: ItemStack | null): Smelt | null {
  return s ? SMELT.get(s.item.id) ?? null : null;
}

/** vanilla AbstractFurnaceBlockEntity.getFuel burn times (ticks) */
const FUEL: Record<string, number> = {
  lava_bucket: 20000, coal_block: 16000, blaze_rod: 2400, coal: 1600, charcoal: 1600,
  oak_boat: 1200, bow: 300, fishing_rod: 300, ladder: 300, crafting_table: 300, chest: 300, bookshelf: 300,
  oak_sign: 200, oak_door: 200, wooden_pickaxe: 200, wooden_axe: 200, wooden_shovel: 200, wooden_hoe: 200, wooden_sword: 200,
  stick: 100, bowl: 100, dead_bush: 100,
};
export function fuelTime(s: ItemStack | null): number {
  if (!s) return 0;
  const id = s.item.id;
  if (FUEL[id] !== undefined) return FUEL[id];
  // vanilla #boats (chest boats included)
  if (id.endsWith('_boat')) return 1200;
  if (id.endsWith('_wool')) return 100;
  if (id.endsWith('_sapling')) return 100;
  if (NETHER_WOODS.some((w) => id.startsWith(w + '_'))) return 0;
  if (TAGS.logs.includes(id) || TAGS.planks.includes(id) || /_(stairs)$/.test(id) && WOODS.some((w) => id.startsWith(w))) return 300;
  if (id.endsWith('_slab') && WOODS.some((w) => id.startsWith(w))) return 150;
  return s.item.fuel ?? 0;
}
