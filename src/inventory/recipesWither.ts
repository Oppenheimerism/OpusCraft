// (the wither) The crafting recipes of what comes with the wither (vanilla VanillaRecipeProvider): black dye from a
// wither rose (vanilla black_dye_from_wither_rose, beside the ink sac's); (the beacon) the beacon round its nether star.

type Ing = string | string[];
type ShapedFn = (result: string, count: number, pattern: string[], key: Record<string, Ing>) => void;
type ShapelessFn = (result: string, count: number, ...ingredients: Ing[]) => void;

export function registerWitherRecipes(shaped: ShapedFn, shapeless: ShapelessFn): void {
  shapeless('black_dye', 1, 'wither_rose');
  // (the beacon) vanilla beacon: five glass round a nether star, over three obsidian
  shaped('beacon', 1, ['GGG', 'GSG', 'OOO'], { G: 'glass', S: 'nether_star', O: 'obsidian' });
}
