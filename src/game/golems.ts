// Building a golem (vanilla CarvedPumpkinBlock.trySpawnGolem): a carved pumpkin or jack o'lantern set on a T of
// four iron blocks, with nothing but air where its arms and legs leave gaps, comes to life as an iron golem that
// will never turn on a player. The blocks crumble away (with their breaking sound and dust) and the golem stands
// where the T's foot was.

import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';
import type { Level } from './level';
import { registerBehavior } from './blockBehavior';
import { BlockPattern, type PatternMatch } from './blockPattern';
import { IronGolem } from '../entity/ironGolem';

const nameOf = (st: number) => BLOCKS[STATE_BLOCK[st]].name;
/** vanilla CarvedPumpkinBlock.PUMPKINS_PREDICATE */
const isPumpkin = (st: number) => nameOf(st) === 'carved_pumpkin' || nameOf(st) === 'jack_o_lantern';

/** vanilla getOrCreateIronGolemFull: "~^~", "###", "~#~" */
const IRON_GOLEM = new BlockPattern([['~^~', '###', '~#~']], {
  '^': isPumpkin,
  '#': (st) => nameOf(st) === 'iron_block',
  '~': (st) => (FLAGS[st] & F_AIR) !== 0,
});

/** vanilla level event 2001: the block's breaking sound and dust */
function destroyEffect(level: Level, x: number, y: number, z: number, st: number): void {
  if (FLAGS[st] & F_AIR) return;
  level.particles.blockBreak(x, y, z, st);
  level.sound.play(`block.${BLOCKS[STATE_BLOCK[st]].sound}.break`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8);
}

/** vanilla clearPatternBlocks, spawnGolemInWorld and updatePatternBlocks */
function spawnGolemInWorld(level: Level, m: PatternMatch, golem: IronGolem, at: [number, number, number]): void {
  for (let i = 0; i < m.width; i++)
    for (let j = 0; j < m.height; j++) {
      const [x, y, z] = m.at(i, j, 0);
      const st = level.world.getState(x, y, z);
      level.setBlock(x, y, z, 0, 2);
      destroyEffect(level, x, y, z, st);
    }
  golem.moveTo(at[0] + 0.5, at[1] + 0.05, at[2] + 0.5, 0, 0);
  level.addEntity(golem);
  level.onSummonedEntity?.(golem);
  for (let i = 0; i < m.width; i++)
    for (let j = 0; j < m.height; j++) {
      const [x, y, z] = m.at(i, j, 0);
      level.updateNeighborsAt(x, y, z, 0);
    }
}

/** vanilla CarvedPumpkinBlock.trySpawnGolem (snow golems come first there: they're still to come) */
export function trySpawnGolem(level: Level, x: number, y: number, z: number): IronGolem | null {
  const m = IRON_GOLEM.find(level.world, x, y, z);
  if (!m) return null;
  const g = new IronGolem(level);
  g.playerCreated = true;
  spawnGolemInWorld(level, m, g, m.at(1, 2, 0));
  return g;
}

for (const name of ['carved_pumpkin', 'jack_o_lantern']) {
  registerBehavior(name, {
    /** vanilla CarvedPumpkinBlock.onPlace: a new pumpkin (not one turned) might finish a golem */
    onPlace(level, x, y, z, state, old) {
      if (STATE_BLOCK[old] !== STATE_BLOCK[state]) trySpawnGolem(level, x, y, z);
    },
  });
}
