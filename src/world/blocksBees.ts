// The bees' blocks (remaining mobs: the bee): the bee nest and the beehive (vanilla BeehiveBlock: a facing and a
// honey level 0 to 5, the front dripping with honey at 5), the honey block (vanilla HoneyBlock: a translucent shell
// round a darker core, a little narrower than a block to stand on and stick to) and the honeycomb block. What they do
// is game/beehive.ts.

import { registerBlock, P, Layer, intProp, type StateView } from './block';
import { cube, cubeAll, type ElementDef, type ModelDef, type ModelChoice } from './models';

/** vanilla BlockStateProperties.LEVEL_HONEY */
export const HONEY_LEVEL = intProp('honey_level', 0, 5);
/** vanilla BeehiveBlock.MAX_HONEY_LEVELS */
export const MAX_HONEY_LEVELS = 5;

const HOR_ROT: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };

/** vanilla block/orientable_with_bottom (the particle its side, as vanilla's bee_nest and beehive models say) */
function orientableWithBottom(front: string, side: string, top: string, bottom: string): ModelDef {
  return cube({ down: bottom, up: top, north: front, south: side, west: side, east: side }, { particle: side });
}

/** vanilla blockstates/bee_nest and beehive: turned to face its way, the honey front at level 5 */
function hiveModel(prefix: string, top: string, bottom: string): (s: StateView) => ModelChoice {
  const plain = orientableWithBottom(`${prefix}_front`, `${prefix}_side`, top, bottom);
  const full = orientableWithBottom(`${prefix}_front_honey`, `${prefix}_side`, top, bottom);
  return (s) => ({ model: s.get('honey_level') === MAX_HONEY_LEVELS ? full : plain, y: HOR_ROT[s.get('facing') as string] });
}

/** vanilla block/honey_block: the see-through shell, and inside it a core a pixel in all round, of the bottom's honey */
function honeyBlockModel(): ModelDef {
  const outer: ElementDef = {
    from: [0, 0, 0],
    to: [16, 16, 16],
    faces: {
      down: { tex: 'honey_block_bottom', cull: 'down' },
      up: { tex: 'honey_block_top', cull: 'up' },
      north: { tex: 'honey_block_side', cull: 'north' },
      south: { tex: 'honey_block_side', cull: 'south' },
      west: { tex: 'honey_block_side', cull: 'west' },
      east: { tex: 'honey_block_side', cull: 'east' },
    },
  };
  const f = { tex: 'honey_block_bottom', uv: [1, 1, 15, 15] as [number, number, number, number] };
  const inner: ElementDef = { from: [1, 1, 1], to: [15, 15, 15], faces: { down: f, up: f, north: f, south: f, west: f, east: f } };
  return { elements: [outer, inner], particle: 'honey_block_top' };
}

export function registerBeeBlocks(): void {
  // vanilla Blocks.BEE_NEST: strength 0.3, SoundType.WOOD, an axe's (#mineable/axe); burns (fire.ts: 30, 20)
  const nest = hiveModel('bee_nest', 'bee_nest_top', 'bee_nest_bottom');
  registerBlock('bee_nest', { props: [HONEY_LEVEL, P.facingH], defaults: { honey_level: 0, facing: 'north' }, hardness: 0.3, sound: 'wood', tool: 'axe', model: nest });
  // vanilla Blocks.BEEHIVE: strength 0.6, SoundType.WOOD, an axe's; burns (fire.ts: 5, 20)
  const hive = hiveModel('beehive', 'beehive_end', 'beehive_end');
  registerBlock('beehive', { props: [HONEY_LEVEL, P.facingH], defaults: { honey_level: 0, facing: 'north' }, hardness: 0.6, sound: 'wood', tool: 'axe', model: hive });
  // vanilla Blocks.HONEY_BLOCK: broken at a touch, SoundType.HONEY_BLOCK, speed factor 0.4, jump factor 0.5, no
  // occlusion (it lets light down but one level, as a shape-full see-through block does); its collision
  // (HoneyBlock.SHAPE) a pixel in at the sides and top; translucent; faces between two of them not drawn
  // (HalfTransparentBlock.skipRendering)
  const honey = honeyBlockModel();
  registerBlock('honey_block', {
    hardness: 0, sound: 'honey_block', collision: [[1 / 16, 0, 1 / 16, 15 / 16, 15 / 16, 15 / 16]], outline: 'full', layer: Layer.TRANSLUCENT, opaque: false,
    faceOcclusion: 0, opacity: 1, cullSame: true, speedFactor: 0.4, jumpFactor: 0.5, model: () => ({ model: honey }),
  });
  // vanilla Blocks.HONEYCOMB_BLOCK: strength 0.6, SoundType.CORAL_BLOCK
  registerBlock('honeycomb_block', { hardness: 0.6, sound: 'coral_block', model: (() => { const m = cubeAll('honeycomb_block'); return () => ({ model: m }); })() });
}
