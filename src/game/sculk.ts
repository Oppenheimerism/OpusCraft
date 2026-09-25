// The deep dark's blocks at work (vanilla SculkBlock, SculkVeinBlock, SculkCatalystBlock, SculkSensorBlock,
// CalibratedSculkSensorBlock, SculkShriekerBlock and reinforced deepslate): what they drop and how they're placed.
// Sculk and its kin give up only themselves, and only to silk touch; broken without it they drop experience instead
// (game/blockRules.ts blockExperience).

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { DIR_NAMES, dirFromYaw } from '../world/dir';
import { registerBehavior } from './blockBehavior';
import { MULTIFACE } from './blockRules';
import { ItemStack } from '../item/item';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla BlockLootSubProvider.createSilkTouchOnlyTable */
const silkOnly = (name: string) => (_st: number, _tool: unknown, _r: unknown, silk: boolean): ItemStack[] => (silk ? [ItemStack.of(name)] : []);

for (const name of ['sculk', 'sculk_catalyst', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker']) registerBehavior(name, { drops: silkOnly(name) });

// vanilla createMultifaceBlockDrops(SCULK_VEIN, HAS_SILK_TOUCH): one for each face it covers, with silk touch
registerBehavior('sculk_vein', {
  drops(st, _tool, _r, silk) {
    const b = blk(st);
    const n = MULTIFACE.filter(([d]) => b.get(st, d)).length;
    return silk && n ? [ItemStack.of('sculk_vein', n)] : [];
  },
});

// vanilla Blocks.REINFORCED_DEEPSLATE: no loot at all (silk touch neither)
registerBehavior('reinforced_deepslate', { drops: () => [] });

// vanilla CalibratedSculkSensorBlock.getStateForPlacement: facing the way the player looks (its input, the back, toward
// them), waterlogged in still water
registerBehavior('calibrated_sculk_sensor', {
  placement(ctx) {
    const b = getBlock('calibrated_sculk_sensor');
    const cur = ctx.world.getState(ctx.x, ctx.y, ctx.z);
    const water = blk(cur).name === 'water' && blk(cur).get(cur, 'level') === 0;
    return b.state({ facing: DIR_NAMES[dirFromYaw(ctx.yaw)], waterlogged: water });
  },
});

// The block entities and what the sensors, the shrieker and the catalyst do (game/sculkSensor.ts, sculkShrieker.ts,
// sculkCatalyst.ts), with the vibrations they hear (game/vibrations.ts)
export { SculkSensorBlockEntity, CalibratedSculkSensorBlockEntity } from './sculkSensor';
export { SculkShriekerBlockEntity } from './sculkShrieker';
export { SculkCatalystBlockEntity } from './sculkCatalyst';
