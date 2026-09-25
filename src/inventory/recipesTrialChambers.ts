// (trial chambers) The 1.21 crafting and stonecutting recipes (vanilla VanillaRecipeProvider and BlockFamilies): the
// tuff family (vanilla BlockFamilies.TUFF, POLISHED_TUFF and TUFF_BRICKS), every copper block at each age and waxed
// (cut, grate and bulb from the block, stairs and slab from the cut copper, chiseled from two slabs), the copper door
// and trapdoor and the lightning rod from ingots, waxing any copper block with honeycomb (vanilla waxRecipes), the
// wind charge from a breeze rod and the mace from the heavy core on one.

import { copperName, WAX_ON } from '../world/blocksCopper';

type Ing = string | string[];
type ShapedFn = (result: string, count: number, pattern: string[], key: Record<string, Ing>) => void;
type ShapelessFn = (result: string, count: number, ...ingredients: Ing[]) => void;

/** the tuff families: the base block, its stairs/slab/wall prefix, its chiseled and polished forms (vanilla BlockFamilies) */
const TUFF_FAMILIES: [string, string, string | null, string | null][] = [
  ['tuff', 'tuff', 'chiseled_tuff', 'polished_tuff'],
  ['polished_tuff', 'polished_tuff', null, 'tuff_bricks'],
  ['tuff_bricks', 'tuff_brick', 'chiseled_tuff_bricks', null],
];

/** each age's copper, unwaxed then waxed: the name of `kind` there */
function eachCopper(fn: (n: (kind: string) => string) => void): void {
  for (const waxed of [false, true]) for (let age = 0; age < 4; age++) fn((kind) => copperName(kind, age, waxed));
}

export function registerTrialChamberRecipes(shaped: ShapedFn, shapeless: ShapelessFn): void {
  // vanilla RecipeProvider.generateRecipes for each family: slab, stairs, wall, chiseled from two slabs, polished 2x2
  for (const [base, prefix, chiseled, polished] of TUFF_FAMILIES) {
    shaped(`${prefix}_slab`, 6, ['###'], { '#': base });
    shaped(`${prefix}_stairs`, 4, ['#  ', '## ', '###'], { '#': base });
    shaped(`${prefix}_wall`, 6, ['###', '###'], { '#': base });
    if (chiseled) shaped(chiseled, 1, ['#', '#'], { '#': `${prefix}_slab` });
    if (polished) shaped(polished, 4, ['SS', 'SS'], { S: base });
  }
  // vanilla cut, BlockFamilies.CUT_COPPER (and each age's, and the waxed), grate and copperBulb
  eachCopper((n) => {
    const block = n('copper_block');
    shaped(n('cut_copper'), 4, ['##', '##'], { '#': block });
    shaped(n('cut_copper_slab'), 6, ['###'], { '#': n('cut_copper') });
    shaped(n('cut_copper_stairs'), 4, ['#  ', '## ', '###'], { '#': n('cut_copper') });
    shaped(n('chiseled_copper'), 1, ['#', '#'], { '#': n('cut_copper_slab') });
    shaped(n('copper_grate'), 4, [' M ', 'M M', ' M '], { M: block });
    shaped(n('copper_bulb'), 4, [' C ', 'CBC', ' R '], { C: block, B: 'blaze_rod', R: 'redstone' });
  });
  // vanilla doorBuilder and the copper trapdoor (like the iron one: one from four ingots); a waxed block of copper
  // still gives its ingots back; the lightning rod, three ingots stood up
  shaped('copper_door', 3, ['##', '##', '##'], { '#': 'copper_ingot' });
  shaped('copper_trapdoor', 1, ['##', '##'], { '#': 'copper_ingot' });
  shapeless('copper_ingot', 9, 'waxed_copper_block');
  shaped('lightning_rod', 1, ['#', '#', '#'], { '#': 'copper_ingot' });
  // vanilla waxRecipes: any copper block and a honeycomb
  for (const [plain, waxed] of WAX_ON) shapeless(waxed, 1, plain, 'honeycomb');
  // vanilla Items.WIND_CHARGE (four from a breeze rod) and Items.MACE (the heavy core on a breeze rod)
  shapeless('wind_charge', 4, 'breeze_rod');
  shaped('mace', 1, ['#', 'I'], { '#': 'heavy_core', I: 'breeze_rod' });
}

/** vanilla stonecutterResultFromBase for the tuff and copper families: [input, [result, count][]] */
export const TRIAL_CHAMBER_STONECUTTING: [string, [string, number][]][] = [
  [
    'tuff',
    [
      ['tuff_slab', 2], ['tuff_stairs', 1], ['tuff_wall', 1], ['chiseled_tuff', 1], ['polished_tuff', 1], ['polished_tuff_slab', 2], ['polished_tuff_stairs', 1],
      ['polished_tuff_wall', 1], ['tuff_bricks', 1], ['tuff_brick_slab', 2], ['tuff_brick_stairs', 1], ['tuff_brick_wall', 1], ['chiseled_tuff_bricks', 1],
    ],
  ],
  [
    'polished_tuff',
    [
      ['polished_tuff_slab', 2], ['polished_tuff_stairs', 1], ['polished_tuff_wall', 1], ['tuff_bricks', 1], ['tuff_brick_slab', 2], ['tuff_brick_stairs', 1],
      ['tuff_brick_wall', 1], ['chiseled_tuff_bricks', 1],
    ],
  ],
  ['tuff_bricks', [['tuff_brick_slab', 2], ['tuff_brick_stairs', 1], ['tuff_brick_wall', 1], ['chiseled_tuff_bricks', 1]]],
];
eachCopper((n) => {
  TRIAL_CHAMBER_STONECUTTING.push(
    [n('copper_block'), [[n('cut_copper'), 4], [n('cut_copper_stairs'), 4], [n('cut_copper_slab'), 8], [n('chiseled_copper'), 4], [n('copper_grate'), 4]]],
    [n('cut_copper'), [[n('cut_copper_stairs'), 1], [n('cut_copper_slab'), 2], [n('chiseled_copper'), 1]]],
  );
});
