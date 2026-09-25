// The deep dark's blocks at work (vanilla SculkBlock, SculkVeinBlock, SculkCatalystBlock, SculkSensorBlock,
// CalibratedSculkSensorBlock, SculkShriekerBlock and reinforced deepslate): what they drop and how they're placed,
// and the block entities the sensors, the shrieker and the catalyst keep. Sculk and its kin give up only themselves,
// and only to silk touch; broken without it they drop experience instead (game/blockRules.ts blockExperience).

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { DIR_NAMES, dirFromYaw } from '../world/dir';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
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

// vanilla SculkCatalystBlock.tick: the bloom a charge gave it fades on its scheduled tick
registerBehavior('sculk_catalyst', {
  tick(level, x, y, z, st) {
    const b = blk(st);
    if (b.get(st, 'bloom')) level.setBlock(x, y, z, b.with(st, 'bloom', false));
  },
});

// ---------------------------------------------------------------------------
// Block entities (vanilla SculkSensorBlockEntity, CalibratedSculkSensorBlockEntity, SculkShriekerBlockEntity,
// SculkCatalystBlockEntity): what each keeps between ticks and saves

/** vanilla SculkSensorBlockEntity: the frequency of the last vibration it heard (for a comparator) */
export class SculkSensorBlockEntity extends BlockEntity {
  readonly id: string = 'sculk_sensor';
  /** vanilla lastVibrationFrequency */
  lastVibrationFrequency = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  protected override saveData(): Record<string, number | string> | undefined {
    return { last_vibration_frequency: this.lastVibrationFrequency };
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.lastVibrationFrequency = Number(d.last_vibration_frequency ?? 0);
  }
}

export class CalibratedSculkSensorBlockEntity extends SculkSensorBlockEntity {
  override readonly id = 'calibrated_sculk_sensor';
}

/** vanilla SculkShriekerBlockEntity: the warning level it last shrieked at */
export class SculkShriekerBlockEntity extends BlockEntity {
  readonly id = 'sculk_shrieker';
  /** vanilla warningLevel */
  warningLevel = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  protected override saveData(): Record<string, number | string> | undefined {
    return { warning_level: this.warningLevel };
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.warningLevel = Number(d.warning_level ?? 0);
  }
}

/** vanilla SculkCatalystBlockEntity */
export class SculkCatalystBlockEntity extends BlockEntity {
  readonly id = 'sculk_catalyst';
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
}

registerBlockEntityType('sculk_sensor', (x, y, z) => new SculkSensorBlockEntity(x, y, z));
registerBlockEntityType('calibrated_sculk_sensor', (x, y, z) => new CalibratedSculkSensorBlockEntity(x, y, z));
registerBlockEntityType('sculk_shrieker', (x, y, z) => new SculkShriekerBlockEntity(x, y, z));
registerBlockEntityType('sculk_catalyst', (x, y, z) => new SculkCatalystBlockEntity(x, y, z));
