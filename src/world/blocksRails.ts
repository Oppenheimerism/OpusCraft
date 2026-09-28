// (minecarts) The powered, detector and activator rails (vanilla PoweredRailBlock and DetectorRailBlock, with
// BaseRailBlock's properties: strength 0.7, metal's sounds, no collision, waterloggable). They only run straight: flat
// north-south or east-west, or sloping up toward one of the four sides (vanilla RAIL_SHAPE_STRAIGHT), and each is
// `powered` or not. Drawn as the plain rail is (vanilla template_rail_flat, template_rail_raised_ne and _sw) with
// its own texture, lit up while powered. What they do is game/poweredRails.ts's.

import { registerBlock, P, Layer, enumProp, boolProp, type Box } from './block';
import type { ModelDef, ModelChoice, FaceDef } from './models';

/** vanilla BlockStateProperties.RAIL_SHAPE_STRAIGHT */
export const STRAIGHT_RAIL_SHAPES = ['north_south', 'east_west', 'ascending_east', 'ascending_west', 'ascending_north', 'ascending_south'];
/** the rails that only run straight, in vanilla's creative order */
export const STRAIGHT_RAILS = ['powered_rail', 'detector_rail', 'activator_rail'];

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function face(tex: string, uv: [number, number, number, number]): FaceDef {
  return { tex, uv };
}

/** vanilla block/template_rail_flat: one plane a pixel up, seen from above and below */
function flat(tex: string): ModelDef {
  return { ao: false, particle: tex, elements: [{ from: [0, 1, 0], to: [16, 1, 16], faces: { down: face(tex, [0, 16, 16, 0]), up: face(tex, [0, 0, 16, 16]) } }] };
}

/** vanilla block/template_rail_raised_ne and _sw: the plane tilted 45 degrees about the block's middle, stretched to fit */
function raised(tex: string, angle: number): ModelDef {
  return {
    ao: false,
    particle: tex,
    elements: [{ from: [0, 9, 0], to: [16, 9, 16], rot: { origin: [8, 9, 8], axis: 'x', angle, rescale: true }, faces: { down: face(tex, [0, 16, 16, 0]), up: face(tex, [0, 0, 16, 16]) } }],
  };
}

/** vanilla blockstates/powered_rail.json (and the other two): the shape's model, turned, in the texture for its power */
function railModels(name: string): Record<string, ModelChoice> {
  const out: Record<string, ModelChoice> = {};
  for (const on of [false, true]) {
    const tex = on ? `${name}_on` : name;
    const straight = flat(tex), ne = raised(tex, 45), sw = raised(tex, -45);
    const by: Record<string, ModelChoice> = {
      north_south: { model: straight }, east_west: { model: straight, y: 90 },
      ascending_north: { model: ne }, ascending_east: { model: ne, y: 90 }, ascending_south: { model: sw }, ascending_west: { model: sw, y: 90 },
    };
    for (const [shape, m] of Object.entries(by)) out[`${shape},${on}`] = m;
  }
  return out;
}

export function registerRailBlocks(): void {
  for (const name of STRAIGHT_RAILS) {
    const models = railModels(name);
    registerBlock(name, {
      props: [enumProp('shape', STRAIGHT_RAIL_SHAPES), boolProp('powered'), P.waterlogged], defaults: { shape: 'north_south' },
      hardness: 0.7, sound: 'metal', tool: 'pickaxe', collision: 'none', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
      // (a detector rail's: its check a second on isn't saved with the world here, nor kept for a chunk that unloads, so
      // a random tick looks again: game/poweredRails.ts)
      randomTicks: name === 'detector_rail',
      // vanilla BaseRailBlock.getShape: two pixels high, half a block on a slope
      outline: (s) => [String(s.get('shape')).startsWith('ascending') ? bx(0, 0, 0, 16, 8, 16) : bx(0, 0, 0, 16, 2, 16)],
      model: (s) => models[`${s.get('shape')},${s.get('powered')}`],
    });
  }
}
