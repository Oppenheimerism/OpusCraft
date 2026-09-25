// The trial chambers' own blocks (1.21): the heavy core (vanilla HeavyCoreBlock), what an ominous vault can give,
// which with a breeze rod makes a mace.

import { registerBlock, P, type Box } from './block';
import type { ModelDef } from './models';
import { MAP_COLORS, MapColor } from './mapColors';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla models/block/heavy_core.json: an 8-pixel cube on the floor, its top, bottom and sides from the texture's quarters */
function heavyCoreModel(): ModelDef {
  const t = 'heavy_core';
  const side = { tex: t, uv: [0, 8, 8, 16] as [number, number, number, number] };
  return {
    particle: t,
    elements: [{
      from: [4, 0, 4], to: [12, 8, 12],
      faces: { north: side, east: side, south: side, west: side, up: { tex: t, uv: [0, 0, 8, 8] }, down: { tex: t, uv: [8, 0, 16, 8], cull: 'down' } },
    }],
  };
}

export function registerTrialChamberBlocks(): void {
  // vanilla Blocks.HEAVY_CORE: strength 10, blast resistance 1200, SoundType.HEAVY_CORE, metal on maps, pushed by
  // pistons (PushReaction.NORMAL), waterloggable; drops itself to any tool (a pickaxe mines it faster)
  const core = heavyCoreModel();
  registerBlock('heavy_core', {
    props: [P.waterlogged], hardness: 10, resistance: 1200, sound: 'heavy_core', tool: 'pickaxe', opaque: false, aoCaster: false, opacity: 0,
    faceOcclusion: 0, collision: [bx(4, 0, 4, 12, 8, 12)], mapColor: MAP_COLORS[MapColor.METAL], model: () => ({ model: core }),
  });
}
