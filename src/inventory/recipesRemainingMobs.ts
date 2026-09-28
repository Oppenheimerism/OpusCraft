// (remaining mobs) The crafting recipes of what comes with the mobs added on the remaining-mobs branch (vanilla
// VanillaRecipeProvider). The bee's: the beehive (planks round a row of honeycomb), the honey block from four honey
// bottles (the bottles left in the grid, the honey bottle's crafting remainder), four honey bottles back from a honey
// block and four glass bottles, three sugar from a honey bottle (its bottle left too), and the honeycomb block from
// four honeycomb. The panda's: a stick from two bamboo (vanilla stick_from_bamboo_item, with the other sticks). The
// armadillo's: wolf armour from six scutes, in the shape of a dog's coat.

type Ing = string | string[];
type ShapedFn = (result: string, count: number, pattern: string[], key: Record<string, Ing>) => void;
type ShapelessFn = (result: string, count: number, ...ingredients: Ing[]) => void;

export function registerRemainingMobRecipes(shaped: ShapedFn, shapeless: ShapelessFn): void {
  // --- the bee
  shaped('beehive', 1, ['PPP', 'HHH', 'PPP'], { P: '#planks', H: 'honeycomb' });
  shaped('honey_block', 1, ['SS', 'SS'], { S: 'honey_bottle' });
  shapeless('honey_bottle', 4, 'honey_block', 'glass_bottle', 'glass_bottle', 'glass_bottle', 'glass_bottle');
  shapeless('sugar', 3, 'honey_bottle');
  shaped('honeycomb_block', 1, ['HH', 'HH'], { H: 'honeycomb' });

  // --- the panda (bamboo's)
  shaped('stick', 1, ['#', '#'], { '#': 'bamboo' });

  // --- the armadillo
  shaped('wolf_armor', 1, ['X  ', 'XXX', 'X X'], { X: 'armadillo_scute' });
}
