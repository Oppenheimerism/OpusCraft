// What the infested blocks do when they break (vanilla InfestedBlock): with silk touch they drop their host block
// and keep their silverfish in; broken any other way (by hand, a tool, a blast, a silverfish waking its friends)
// they drop nothing and let the silverfish out, as long as blocks drop things at all (doTileDrops). In creative
// nothing drops and nothing comes out. The blocks themselves are in world/blocksInfested.ts.

import { ItemStack } from '../item/item';
import { levelOf } from '../item/enchantHelper';
import { INFESTED_BY_HOST, HOST_BY_INFESTED } from '../world/blocksInfested';
import { blockOf } from '../world/block';
import { registerBehavior } from './blockBehavior';
import { createMob } from './spawner';
import type { Level } from './level';

/** vanilla InfestedBlock.spawnInfestation: a silverfish in the middle of the block's floor, in a puff of smoke */
export function spawnInfestation(level: Level, x: number, y: number, z: number): void {
  const s = createMob('silverfish', level);
  if (!s) return;
  s.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.addEntity(s);
  // (vanilla Mob.spawnAnim)
  level.particles.poof?.(s);
}

for (const name of Object.values(INFESTED_BY_HOST)) {
  registerBehavior(name, {
    // vanilla loot: otherWhenSilkTouch(the host); nothing without it
    drops: (state, _tool, _r, silk) => (silk ? [ItemStack.of(HOST_BY_INFESTED[blockOf(state).name], 1)] : []),
    // vanilla InfestedBlock.spawnAfterBreak: #prevents_infested_spawns (silk touch) keeps it in
    spawnAfterBreak: (level, x, y, z, _state, stack) => {
      if (level.gameRules.doTileDrops && levelOf(stack, 'silk_touch') <= 0) spawnInfestation(level, x, y, z);
    },
  });
}
