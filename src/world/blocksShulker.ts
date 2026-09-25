// Shulker boxes (vanilla ShulkerBoxBlock: the undyed one and one for each dye colour). The block draws nothing itself
// (vanilla RenderShape.ENTITYBLOCK_ANIMATED): render/shulkerRenderer.ts draws the shell from its block entity, lid and
// all; the item is the shut box. What they do is in game/shulkerBox.ts, the block entity in world/shulkerBoxEntity.ts.

import { registerBlock, P } from './block';
import { cube, type ModelDef } from './models';

/** vanilla DyeColor, in its order */
export const SHULKER_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown',
  'green', 'red', 'black',
] as const;

/** every shulker box's block name with its colour (null: the undyed one), vanilla's order */
export const SHULKER_BOXES: [string, string | null][] = [['shulker_box', null], ...SHULKER_COLORS.map((c): [string, string] => [`${c}_shulker_box`, c])];

const COLOR_OF = new Map(SHULKER_BOXES);

/** is `name` a shulker box's block (or item)? */
export function isShulkerBox(name: string): boolean {
  return COLOR_OF.has(name);
}

/** the dye colour of a shulker box by its block name (null: undyed, undefined: not a shulker box) */
export function shulkerBoxColor(name: string): string | null | undefined {
  return COLOR_OF.get(name);
}

/** vanilla ShulkerBoxBlock.getBlockByColor: the box of a colour (null: the undyed one) */
export function shulkerBoxOf(color: string | null): string {
  return color ? `${color}_shulker_box` : 'shulker_box';
}

export function registerShulkerBoxBlocks(): void {
  for (const [name] of SHULKER_BOXES) {
    // nothing to mesh: only the shell's specks when it breaks (vanilla models/block/shulker_box.json)
    const particle: ModelDef = { particle: name, elements: [] };
    registerBlock(name, {
      // vanilla ShulkerBoxBlock.FACING: the way the lid opens (the face it was put against), up by default
      props: [P.facing], defaults: { facing: 'up' },
      // vanilla Blocks.shulkerBox: strength 2, stone's sounds, a pickaxe the quickest (but anything drops it); it
      // doesn't hide its neighbours' faces (noOcclusion), and lets light through dimmed by one
      hardness: 2, resistance: 2, sound: 'stone', tool: 'pickaxe', opaque: false, aoCaster: false, opacity: 1, faceOcclusion: 0,
      model: () => ({ model: particle }),
      // (the item: the shut box, as vanilla's builtin/entity item draws it)
      itemModel: cube({ down: `${name}_bottom`, up: `${name}_top`, north: name, south: name, west: name, east: name }, { particle: name }),
    });
  }
}
