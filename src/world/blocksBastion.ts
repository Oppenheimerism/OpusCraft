// (bastions) The blocks that came with the bastion remnants (1.16) and weren't in the game yet: polished basalt
// (vanilla RotatedPillarBlock, Blocks.POLISHED_BASALT: basalt's properties, its columns cut square), the block of
// netherite (vanilla Blocks.NETHERITE_BLOCK: 50 hardness, 1200 blast resistance, a diamond pickaxe to mine) and the
// lodestone (vanilla LodestoneBlock: 3.5, any pickaxe; a compass used on it points to it: game/lodestoneCompass.ts).
// What a bastion's bridge chest always holds, what its treasure room's netherite comes to, and the pillars and trims of
// its walls.

import { registerBlock, P, type StateView } from './block';
import { cubeAll, cubeColumn, type ModelChoice, type ModelDef } from './models';

/** vanilla BlockModelGenerators.createRotatedPillarWithHorizontalVariant: the column along its axis */
function axisModel(m: ModelDef) {
  return (s: StateView): ModelChoice => {
    const a = s.get('axis');
    if (a === 'y') return { model: m };
    if (a === 'z') return { model: m, x: 90 };
    return { model: m, x: 90, y: 90 };
  };
}

export function registerBastionBlocks(): void {
  // vanilla Blocks.POLISHED_BASALT: BlockBehaviour.Properties.ofLegacyCopy(BASALT)
  registerBlock('polished_basalt', {
    props: [P.axis], defaults: { axis: 'y' }, hardness: 1.25, resistance: 4.2, sound: 'basalt', tool: 'pickaxe', requiresTool: true,
    model: axisModel(cubeColumn('polished_basalt_side', 'polished_basalt_top')),
  });
  // vanilla Blocks.NETHERITE_BLOCK: SoundType.NETHERITE_BLOCK, needs_diamond_tool
  const netherite = cubeAll('netherite_block');
  registerBlock('netherite_block', {
    hardness: 50, resistance: 1200, sound: 'netherite_block', tool: 'pickaxe', requiresTool: true, tier: 3, model: () => ({ model: netherite }),
  });
  // vanilla Blocks.LODESTONE: SoundType.LODESTONE, its top the needle's cross over a chiselled face
  const lodestone = cubeColumn('lodestone_side', 'lodestone_top');
  registerBlock('lodestone', { hardness: 3.5, resistance: 3.5, sound: 'lodestone', tool: 'pickaxe', requiresTool: true, model: () => ({ model: lodestone }) });
}
