// The ender chest (vanilla EnderChestBlock): a chest of obsidian that opens onto its opener's own 27 slots, the same
// in every ender chest (game/enderChest.ts). Turned to face whoever put it down, it takes water in, glows at light 7,
// needs a pickaxe and stands against blasts as obsidian does (strength 22.5, resistance 600). Like a chest in vanilla
// it draws nothing itself (RenderShape.ENTITYBLOCK_ANIMATED): render/enderChestRenderer.ts draws it, lid and all,
// from its block entity (world/enderChestBlockEntity.ts); its specks are obsidian's (vanilla
// models/block/ender_chest.json), and the item is the shut chest.

import { registerBlock, P, type Box } from './block';
import { box, type ModelDef } from './models';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla EnderChestBlock.SHAPE */
export const ENDER_CHEST_SHAPE: Box = bx(1, 0, 1, 15, 14, 15);

/** the shut chest, as the item shows it (the chest's own block model's boxes, in the ender chest's faces) */
export const ENDER_CHEST_ITEM_MODEL: ModelDef = {
  particle: 'obsidian',
  elements: [
    box([1, 0, 1], [15, 10, 15], { down: 'ender_chest_bottom', up: 'ender_chest_top', north: 'ender_chest_front', south: 'ender_chest_side', west: 'ender_chest_side', east: 'ender_chest_side' }, { noCull: true }),
    box([1, 10, 1], [15, 14, 15], { down: 'ender_chest_top', up: 'ender_chest_top', north: 'ender_chest_lid_front', south: 'ender_chest_lid_side', west: 'ender_chest_lid_side', east: 'ender_chest_lid_side' }, { noCull: true }),
    box([7, 7, 0], [9, 11, 1], 'ender_chest_latch', { noCull: true }),
  ],
};

export function registerEnderChestBlock(): void {
  // nothing to mesh: only obsidian's specks when it breaks
  const particle: ModelDef = { particle: 'obsidian', elements: [] };
  registerBlock('ender_chest', {
    props: [P.facingH, P.waterlogged],
    // vanilla Blocks.ENDER_CHEST: strength 22.5, resistance 600, a pickaxe's (any) or nothing drops, light 7, stone's
    // sounds (the default); its shape is the chest's, and it hides no neighbour's faces
    hardness: 22.5, resistance: 600, sound: 'stone', tool: 'pickaxe', requiresTool: true, light: 7,
    opaque: false, aoCaster: false, faceOcclusion: 0,
    collision: [ENDER_CHEST_SHAPE],
    outline: [ENDER_CHEST_SHAPE],
    model: () => ({ model: particle }),
    itemModel: ENDER_CHEST_ITEM_MODEL,
  });
}
