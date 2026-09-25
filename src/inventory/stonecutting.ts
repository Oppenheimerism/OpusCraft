// Stonecutting recipes (vanilla RecipeType.STONECUTTING, as VanillaRecipeProvider.stonecutterResultFromBase writes
// them): one block of stone cut into one of its shapes. Every vanilla recipe whose blocks this game has.

import { ITEMS, ItemStack } from '../item/item';

export interface StonecutterRecipe {
  input: string;
  result: string;
  count: number;
}

/** [input, result, count] per family, in the data generator's order (slabs come two to a block) */
const FAMILIES: [string, [string, number][]][] = [
  ['stone', [['stone_slab', 2], ['stone_stairs', 1], ['stone_bricks', 1], ['stone_brick_slab', 2], ['stone_brick_stairs', 1], ['stone_brick_wall', 1], ['chiseled_stone_bricks', 1]]],
  ['sandstone', [['cut_sandstone', 1], ['sandstone_slab', 2], ['cut_sandstone_slab', 2], ['sandstone_stairs', 1], ['sandstone_wall', 1], ['chiseled_sandstone', 1]]],
  ['cut_sandstone', [['cut_sandstone_slab', 2]]],
  ['red_sandstone', [['cut_red_sandstone', 1], ['red_sandstone_slab', 2], ['cut_red_sandstone_slab', 2], ['red_sandstone_stairs', 1], ['red_sandstone_wall', 1], ['chiseled_red_sandstone', 1]]],
  ['cut_red_sandstone', [['cut_red_sandstone_slab', 2]]],
  ['quartz_block', [['quartz_slab', 2], ['quartz_stairs', 1], ['quartz_pillar', 1], ['chiseled_quartz_block', 1], ['quartz_bricks', 1]]],
  ['cobblestone', [['cobblestone_stairs', 1], ['cobblestone_slab', 2], ['cobblestone_wall', 1]]],
  ['stone_bricks', [['stone_brick_slab', 2], ['stone_brick_stairs', 1], ['stone_brick_wall', 1], ['chiseled_stone_bricks', 1]]],
  ['bricks', [['brick_slab', 2], ['brick_stairs', 1], ['brick_wall', 1]]],
  ['mud_bricks', [['mud_brick_slab', 2], ['mud_brick_stairs', 1], ['mud_brick_wall', 1]]],
  ['nether_bricks', [['nether_brick_slab', 2], ['nether_brick_stairs', 1], ['nether_brick_wall', 1], ['chiseled_nether_bricks', 1]]],
  ['red_nether_bricks', [['red_nether_brick_slab', 2], ['red_nether_brick_stairs', 1], ['red_nether_brick_wall', 1]]],
  ['purpur_block', [['purpur_slab', 2], ['purpur_stairs', 1], ['purpur_pillar', 1]]],
  ['prismarine', [['prismarine_slab', 2], ['prismarine_stairs', 1], ['prismarine_wall', 1]]],
  ['prismarine_bricks', [['prismarine_brick_slab', 2], ['prismarine_brick_stairs', 1]]],
  ['dark_prismarine', [['dark_prismarine_slab', 2], ['dark_prismarine_stairs', 1]]],
  ['andesite', [['andesite_slab', 2], ['andesite_stairs', 1], ['andesite_wall', 1], ['polished_andesite', 1], ['polished_andesite_slab', 2], ['polished_andesite_stairs', 1]]],
  ['polished_andesite', [['polished_andesite_slab', 2], ['polished_andesite_stairs', 1]]],
  ['basalt', [['polished_basalt', 1]]],
  ['granite', [['granite_slab', 2], ['granite_stairs', 1], ['granite_wall', 1], ['polished_granite', 1], ['polished_granite_slab', 2], ['polished_granite_stairs', 1]]],
  ['polished_granite', [['polished_granite_slab', 2], ['polished_granite_stairs', 1]]],
  ['diorite', [['diorite_slab', 2], ['diorite_stairs', 1], ['diorite_wall', 1], ['polished_diorite', 1], ['polished_diorite_slab', 2], ['polished_diorite_stairs', 1]]],
  ['polished_diorite', [['polished_diorite_slab', 2], ['polished_diorite_stairs', 1]]],
  ['mossy_stone_bricks', [['mossy_stone_brick_slab', 2], ['mossy_stone_brick_stairs', 1], ['mossy_stone_brick_wall', 1]]],
  ['mossy_cobblestone', [['mossy_cobblestone_slab', 2], ['mossy_cobblestone_stairs', 1], ['mossy_cobblestone_wall', 1]]],
  ['smooth_sandstone', [['smooth_sandstone_slab', 2], ['smooth_sandstone_stairs', 1]]],
  ['smooth_red_sandstone', [['smooth_red_sandstone_slab', 2], ['smooth_red_sandstone_stairs', 1]]],
  ['smooth_quartz', [['smooth_quartz_slab', 2], ['smooth_quartz_stairs', 1]]],
  ['end_stone_bricks', [['end_stone_brick_slab', 2], ['end_stone_brick_stairs', 1], ['end_stone_brick_wall', 1]]],
  ['end_stone', [['end_stone_bricks', 1], ['end_stone_brick_slab', 2], ['end_stone_brick_stairs', 1], ['end_stone_brick_wall', 1]]],
  ['purpur_block', [['purpur_slab', 2], ['purpur_stairs', 1], ['purpur_pillar', 1]]],
  ['smooth_stone', [['smooth_stone_slab', 2]]],
  [
    'blackstone',
    [
      ['blackstone_slab', 2], ['blackstone_stairs', 1], ['blackstone_wall', 1], ['polished_blackstone', 1], ['polished_blackstone_wall', 1],
      ['polished_blackstone_slab', 2], ['polished_blackstone_stairs', 1], ['chiseled_polished_blackstone', 1], ['polished_blackstone_bricks', 1],
      ['polished_blackstone_brick_slab', 2], ['polished_blackstone_brick_stairs', 1], ['polished_blackstone_brick_wall', 1],
    ],
  ],
  [
    'polished_blackstone',
    [
      ['polished_blackstone_slab', 2], ['polished_blackstone_stairs', 1], ['polished_blackstone_bricks', 1], ['polished_blackstone_wall', 1],
      ['polished_blackstone_brick_slab', 2], ['polished_blackstone_brick_stairs', 1], ['polished_blackstone_brick_wall', 1], ['chiseled_polished_blackstone', 1],
    ],
  ],
  ['polished_blackstone_bricks', [['polished_blackstone_brick_slab', 2], ['polished_blackstone_brick_stairs', 1], ['polished_blackstone_brick_wall', 1]]],
  [
    'cobbled_deepslate',
    [
      ['cobbled_deepslate_slab', 2], ['cobbled_deepslate_stairs', 1], ['cobbled_deepslate_wall', 1], ['chiseled_deepslate', 1], ['polished_deepslate', 1],
      ['polished_deepslate_slab', 2], ['polished_deepslate_stairs', 1], ['polished_deepslate_wall', 1], ['deepslate_bricks', 1], ['deepslate_brick_slab', 2],
      ['deepslate_brick_stairs', 1], ['deepslate_brick_wall', 1], ['deepslate_tiles', 1], ['deepslate_tile_slab', 2], ['deepslate_tile_stairs', 1],
      ['deepslate_tile_wall', 1],
    ],
  ],
  [
    'polished_deepslate',
    [
      ['polished_deepslate_slab', 2], ['polished_deepslate_stairs', 1], ['polished_deepslate_wall', 1], ['deepslate_bricks', 1], ['deepslate_brick_slab', 2],
      ['deepslate_brick_stairs', 1], ['deepslate_brick_wall', 1], ['deepslate_tiles', 1], ['deepslate_tile_slab', 2], ['deepslate_tile_stairs', 1],
      ['deepslate_tile_wall', 1],
    ],
  ],
  ['deepslate_bricks', [['deepslate_brick_slab', 2], ['deepslate_brick_stairs', 1], ['deepslate_brick_wall', 1], ['deepslate_tiles', 1], ['deepslate_tile_slab', 2], ['deepslate_tile_stairs', 1], ['deepslate_tile_wall', 1]]],
  ['deepslate_tiles', [['deepslate_tile_slab', 2], ['deepslate_tile_stairs', 1], ['deepslate_tile_wall', 1]]],
];

/** the stonecutting recipes whose blocks exist here */
export const STONECUTTING: StonecutterRecipe[] = FAMILIES.flatMap(([input, outs]) => outs.map(([result, count]) => ({ input, result, count }))).filter(
  (r) => ITEMS.has(r.input) && ITEMS.has(r.result),
);

/** vanilla Item.getDescriptionId of a block item, which the recipe list is sorted by */
const descriptionId = (id: string) => (ITEMS.get(id)?.block ? 'block.minecraft.' : 'item.minecraft.') + id;

/**
 * vanilla RecipeManager.getRecipesFor(STONECUTTING, input): every recipe the stack goes into, sorted by the result's
 * description id (so the stonecutter lists them alphabetically by id)
 */
export function stonecuttingRecipesFor(s: ItemStack | null): StonecutterRecipe[] {
  if (!s || s.count <= 0) return [];
  const id = s.item.id;
  return STONECUTTING.filter((r) => r.input === id).sort((a, b) => {
    const x = descriptionId(a.result), y = descriptionId(b.result);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/** vanilla RecipeManager.getRecipeFor(STONECUTTING, input).isPresent() */
export function hasStonecuttingRecipe(s: ItemStack): boolean {
  return STONECUTTING.some((r) => r.input === s.item.id);
}
