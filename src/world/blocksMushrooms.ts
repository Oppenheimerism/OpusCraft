// (remaining mobs: the mooshroom) The huge mushrooms' blocks (vanilla HugeMushroomBlock): the brown mushroom block
// (a huge brown mushroom's flat cap), the red mushroom block (a huge red one's dome) and the mushroom stem. Each has
// six sides that show either its skin or the pale, spongy inside a mushroom has where it's been cut (vanilla
// block/mushroom_block_inside): a side against another block of its own kind is an inside. What they do (placing,
// the sides closing up, what breaking them drops) is game/mushrooms.ts's; how a huge mushroom grows,
// world/gen/hugeMushroom.ts's.

import { boolProp, registerBlock, type StateView } from './block';
import type { ElementDef, ModelChoice, ModelDef, Variant } from './models';
import { cubeAll } from './models';

/** vanilla HugeMushroomBlock's sides, in vanilla's order (PipeBlock.PROPERTY_BY_DIRECTION's) */
export const MUSHROOM_SIDES = ['north', 'east', 'south', 'west', 'up', 'down'] as const;
export type MushroomSide = (typeof MUSHROOM_SIDES)[number];

/** vanilla models/block/template_single_face: one side of the cube, its north (turned to the others by the state) */
function singleFace(tex: string): ModelDef {
  const e: ElementDef = { from: [0, 0, 0], to: [16, 16, 0], faces: { north: { tex, cull: 'north' } } };
  return { elements: [e], particle: tex };
}

/** vanilla blockstates/*_mushroom_block.json and mushroom_stem.json: each side's turn (x, y) */
const TURN: Record<MushroomSide, [number, number]> = { north: [0, 0], east: [0, 90], south: [0, 180], west: [0, 270], up: [270, 0], down: [90, 0] };

/**
 * the block's multipart: its skin on each side that's true (uvlocked), then the inside on each that's false (not), in
 * vanilla's order (so the particles are the skin's while any side shows it)
 */
function mushroomModel(tex: string): (s: StateView) => ModelChoice {
  const skin = singleFace(tex), inside = singleFace('mushroom_block_inside');
  const outer: Record<string, Variant> = {}, inner: Record<string, Variant> = {};
  for (const d of MUSHROOM_SIDES) {
    const [x, y] = TURN[d];
    outer[d] = { model: skin, x, y, uvlock: true };
    inner[d] = { model: inside, x, y, uvlock: false };
  }
  return (s) => ({ parts: [...MUSHROOM_SIDES.filter((d) => s.get(d)).map((d) => outer[d]), ...MUSHROOM_SIDES.filter((d) => !s.get(d)).map((d) => inner[d])] });
}

export function registerMushroomBlocks(): void {
  // vanilla Blocks.BROWN_MUSHROOM_BLOCK, RED_MUSHROOM_BLOCK, MUSHROOM_STEM: strength 0.2, wood sounds, an axe's; every
  // side the skin to begin with; the item a whole cube of the skin (vanilla models/item/*: cube_all)
  for (const name of ['brown_mushroom_block', 'red_mushroom_block', 'mushroom_stem']) {
    registerBlock(name, {
      props: MUSHROOM_SIDES.map((d) => boolProp(d)),
      defaults: { north: true, east: true, south: true, west: true, up: true, down: true },
      hardness: 0.2, sound: 'wood', tool: 'axe',
      model: mushroomModel(name),
      itemModel: cubeAll(name),
    });
  }
}
