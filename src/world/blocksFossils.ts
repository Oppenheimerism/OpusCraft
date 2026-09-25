// The fossils' block: the bone block (vanilla Blocks.BONE_BLOCK, a RotatedPillarBlock), bones bundled lengthwise and
// set on the axis of the face it's put against, as a log is. The fossils buried under deserts and swamps are built of
// it (world/gen/fossil.ts); nine bone meal press into one.

import { registerBlock, P, type StateView } from './block';
import { cubeColumn, type ModelDef, type ModelChoice } from './models';

/** vanilla block/bone_block.json and its blockstate: the column turned onto its axis */
function axisModel(m: ModelDef) {
  return (s: StateView): ModelChoice => {
    const a = s.get('axis');
    if (a === 'y') return { model: m };
    if (a === 'z') return { model: m, x: 90 };
    return { model: m, x: 90, y: 90 };
  };
}

export function registerFossilBlocks(): void {
  // vanilla Blocks.BONE_BLOCK: strength 2, only a pickaxe gets it, SoundType.BONE_BLOCK
  registerBlock('bone_block', {
    props: [P.axis], defaults: { axis: 'y' }, hardness: 2, resistance: 2, sound: 'bone_block', tool: 'pickaxe', requiresTool: true,
    model: axisModel(cubeColumn('bone_block_side', 'bone_block_top')),
  });
}
