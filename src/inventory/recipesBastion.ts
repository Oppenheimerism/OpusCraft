// (bastions) The crafting recipes of the bastion remnants' blocks and items (vanilla VanillaRecipeProvider): polished
// basalt from four basalt, the block of netherite and back (nineStorageRecipes), the netherite ingot from four scrap
// and four gold ingots, the lodestone (chiselled stone bricks round a netherite ingot), and a copy of the snout armour
// trim's template (copySmithingTemplate: seven diamonds and blackstone). Ancient debris smelts into scrap in a furnace
// and a blast furnace (recipes.ts); basalt cuts into polished basalt (stonecutting.ts).

type Ing = string | string[];
type ShapedFn = (result: string, count: number, pattern: string[], key: Record<string, Ing>) => void;
type ShapelessFn = (result: string, count: number, ...ingredients: Ing[]) => void;

export function registerBastionRecipes(shaped: ShapedFn, shapeless: ShapelessFn): void {
  shaped('polished_basalt', 4, ['SS', 'SS'], { S: 'basalt' });
  shaped('netherite_block', 1, ['###', '###', '###'], { '#': 'netherite_ingot' });
  shapeless('netherite_ingot', 9, 'netherite_block');
  shapeless('netherite_ingot', 1, 'netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot');
  shaped('lodestone', 1, ['SSS', 'S#S', 'SSS'], { S: 'chiseled_stone_bricks', '#': 'netherite_ingot' });
  shaped('snout_armor_trim_smithing_template', 2, ['#S#', '#C#', '###'], { '#': 'diamond', C: 'blackstone', S: 'snout_armor_trim_smithing_template' });
}
