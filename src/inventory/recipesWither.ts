// (the wither) The crafting recipes of what comes with the wither (vanilla VanillaRecipeProvider): black dye from a
// wither rose (vanilla black_dye_from_wither_rose, beside the ink sac's).

type Ing = string | string[];
type ShapedFn = (result: string, count: number, pattern: string[], key: Record<string, Ing>) => void;
type ShapelessFn = (result: string, count: number, ...ingredients: Ing[]) => void;

export function registerWitherRecipes(_shaped: ShapedFn, shapeless: ShapelessFn): void {
  shapeless('black_dye', 1, 'wither_rose');
}
