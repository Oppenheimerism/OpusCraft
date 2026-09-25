// The crafter (1.21; vanilla CrafterBlock): which way it faces and which way its top is (vanilla's FrontAndTop
// ORIENTATION, the jigsaw block's twelve), whether it's powered (TRIGGERED) and whether it's crafting (CRAFTING). What it
// does is game/crafter.ts.

import { registerBlock, enumProp, boolProp } from './block';
import { cube, type ModelDef } from './models';

/** vanilla FrontAndTop, in its order: the way its front faces, then the way its top does */
export const CRAFTER_ORIENTATIONS = ['down_east', 'down_north', 'down_south', 'down_west', 'up_east', 'up_north', 'up_south', 'up_west', 'west_up', 'east_up', 'north_up', 'south_up'] as const;
export type CrafterOrientation = (typeof CRAFTER_ORIENTATIONS)[number];

/** vanilla BlockModelGenerators.applyRotation (the jigsaw's and the crafter's): the model turned by x, then y */
const ROTATION: Record<CrafterOrientation, [number, number]> = {
  down_north: [90, 0],
  down_south: [90, 180],
  down_west: [90, 270],
  down_east: [90, 90],
  up_north: [270, 180],
  up_south: [270, 0],
  up_west: [270, 90],
  up_east: [270, 270],
  north_up: [0, 0],
  south_up: [0, 180],
  west_up: [0, 270],
  east_up: [0, 90],
};

/**
 * vanilla models/block/crafter.json and its _triggered, _crafting and _crafting_triggered: the front to the north and
 * the top up; powered, its top, back and sides light up; crafting, its top, front and sides do (over the powered ones)
 */
function crafterModel(triggered: boolean, crafting: boolean): ModelDef {
  const lit = (face: string) => (crafting ? `crafter_${face}_crafting` : triggered ? `crafter_${face}_triggered` : `crafter_${face}`);
  return cube(
    {
      down: 'crafter_bottom',
      up: lit('top'),
      north: crafting ? 'crafter_north_crafting' : 'crafter_north',
      south: triggered ? 'crafter_south_triggered' : 'crafter_south',
      east: lit('east'),
      west: lit('west'),
    },
    { particle: 'crafter_north' },
  );
}

export function registerCrafterBlock(): void {
  const models = [false, true].map((t) => [false, true].map((c) => crafterModel(t, c)));
  // vanilla Blocks.CRAFTER: stone on maps (mapColors.ts), strength 1.5, blast resistance 3.5, a pickaxe to drop it
  registerBlock('crafter', {
    props: [enumProp('orientation', [...CRAFTER_ORIENTATIONS]), boolProp('triggered'), boolProp('crafting')],
    defaults: { orientation: 'north_up' },
    hardness: 1.5,
    resistance: 3.5,
    sound: 'stone',
    tool: 'pickaxe',
    requiresTool: true,
    model: (s) => {
      const [x, y] = ROTATION[s.get<CrafterOrientation>('orientation')];
      return { model: models[s.get('triggered') ? 1 : 0][s.get('crafting') ? 1 : 0], x, y };
    },
  });
}
