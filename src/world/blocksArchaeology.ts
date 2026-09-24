// Archaeology's blocks: suspicious sand and suspicious gravel (vanilla BrushableBlock: brushed away a stage at a time
// over whatever is buried in them) and the decorated pot (vanilla DecoratedPotBlock, drawn by its block entity's
// renderer, render/potRenderer.ts). What they do is in game/archaeology.ts.

import { registerBlock, P, intProp, boolProp, type Box } from './block';
import { cubeAll, type ModelDef } from './models';

/** vanilla BlockStateProperties.DUSTED: how far the block has been brushed away */
export const DUSTED = intProp('dusted', 0, 3);
/** vanilla BlockStateProperties.CRACKED: a pot that will shatter into its sherds when it breaks */
export const CRACKED = boolProp('cracked');

const px = (v: number) => v / 16;
/** vanilla DecoratedPotBlock.BOUNDING_BOX */
export const POT_BOX: Box = [px(1), 0, px(1), px(15), 1, px(15)];

/** vanilla block/decorated_pot.json: nothing of its own to draw (its block entity draws it), only its particles' texture */
const POT_MODEL: ModelDef = { elements: [], particle: 'terracotta' };

export function registerArchaeologyBlocks(): void {
  // vanilla Blocks.SUSPICIOUS_SAND / SUSPICIOUS_GRAVEL: strength 0.25, a shovel's, nothing dropped (the loot table is
  // empty); blockstates suspicious_*.json: a model per stage
  for (const name of ['suspicious_sand', 'suspicious_gravel']) {
    const models = [0, 1, 2, 3].map((i) => ({ model: cubeAll(`${name}_${i}`) }));
    registerBlock(name, { props: [DUSTED], hardness: 0.25, sound: name, tool: 'shovel', noDrop: true, model: (s) => models[s.get('dusted') as number] });
  }
  // vanilla Blocks.DECORATED_POT: breaks at once, doesn't hide what's beside it, holds water
  registerBlock('decorated_pot', {
    props: [P.facingH, P.waterlogged, CRACKED], defaults: { facing: 'north' }, hardness: 0, sound: 'decorated_pot',
    collision: [POT_BOX], opaque: false, aoCaster: false, model: () => ({ model: POT_MODEL }),
  });
}
