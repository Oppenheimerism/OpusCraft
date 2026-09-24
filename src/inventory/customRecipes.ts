// Special crafting recipes (vanilla CustomRecipe: book cloning, banner duplicating, map cloning and extending): no
// recipe book entries, just a look at the grid. Registered by what they belong to; the crafting menus ask here after
// the plain recipes and leather dyeing.

import type { ItemStack } from '../item/item';

export type Grid = readonly (ItemStack | null)[];

export interface CustomRecipe {
  /** vanilla matches + assemble (and canCraftInDimensions): the result, or null when the grid isn't this recipe */
  assemble(grid: Grid, width: number): ItemStack | null;
  /** vanilla getRemainingItems, where it's more than each item's crafting remainder: what stays in each slot */
  remaining?(grid: Grid, width: number): (ItemStack | null)[];
}

const CUSTOM_RECIPES: CustomRecipe[] = [];

export function registerCustomRecipe(r: CustomRecipe): void {
  CUSTOM_RECIPES.push(r);
}

/** the first special recipe the grid makes, with its result */
export function customRecipeFor(grid: Grid, width: number): { recipe: CustomRecipe; result: ItemStack } | null {
  for (const recipe of CUSTOM_RECIPES) {
    const result = recipe.assemble(grid, width);
    if (result) return { recipe, result };
  }
  return null;
}
