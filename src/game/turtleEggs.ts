// Turtle eggs (Stage 5: ocean, M6; vanilla TurtleEggBlock). A turtle lays a clutch of one to four on sand near its
// home (entity/turtle.ts); more placed into the block join the clutch, up to four. On sand they crack, twice, and
// then hatch, one baby turtle an egg, each at home there — mostly in the hour before dawn, when every random tick
// counts, otherwise one in five hundred does. Anything alive but a turtle or a bat that walks over them may crush one
// (one step in a hundred; a player who's sneaking doesn't), and landing on them from any height crushes one a third of
// the time (not a zombie, which comes for them on purpose: entity/turtlePredators.ts); a mob only while mob griefing
// is on. Broken, only silk touch saves an egg, and only one: the rest stay. On sand, a change to the clutch sends up a
// spray of green sparkles.

import { registerBehavior } from './blockBehavior';
import type { Level } from './level';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { Turtle, onSand } from '../entity/turtle';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, OUTLINE, getBlock } from '../world/block';
import { ItemStack } from '../item/item';
import { timeOfDay } from '../render/environment';

const EGG = getBlock('turtle_egg');
/** vanilla Zombie and its kinds (husk, drowned, zombie villager, zombified piglin): they don't crush eggs landing on them */
const ZOMBIES = new Set(['zombie', 'husk', 'drowned', 'zombie_villager', 'zombified_piglin']);

const eggsOf = (st: number): number => EGG.get<number>(st, 'eggs');

/** vanilla level event 2001: the block's breaking sound and dust */
function destroyEffect(level: Level, x: number, y: number, z: number, st: number): void {
  if (FLAGS[st] & F_AIR) return;
  level.particles.blockBreak(x, y, z, st);
  level.sound.play(`block.${BLOCKS[STATE_BLOCK[st]].sound}.break`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8);
}

/** vanilla level event 2012 (ParticleUtils.spawnParticleInBlock): `count` green sparkles over the block, as high as its shape */
function sparklesInBlock(level: Level, x: number, y: number, z: number, count: number): void {
  const st = level.world.getState(x, y, z);
  const h = FLAGS[st] & F_AIR ? 1 : Math.max(0, ...(OUTLINE[st]?.map((b) => b[4]) ?? [1]));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  for (let i = 0; i < count; i++)
    level.particles.spawn?.('happy_villager', x + Math.random(), y + Math.random() * h, z + Math.random(), gauss() * 0.02, gauss() * 0.02, gauss() * 0.02);
}

/** vanilla TurtleEggBlock.canDestroyEgg: something alive, not a turtle or a bat; a mob only while mob griefing is on */
function canDestroyEgg(level: Level, e: Entity): boolean {
  if (e.type === 'turtle' || e.type === 'bat' || !(e instanceof LivingEntity)) return false;
  return e.type === 'player' || !!level.gameRules.mobGriefing;
}

/** vanilla TurtleEggBlock.decreaseEggs: one egg broken — the last takes the block with it */
export function decreaseEggs(level: Level, x: number, y: number, z: number, st: number): void {
  level.sound.play('entity.turtle.egg_break', x + 0.5, y + 0.5, z + 0.5, 0.7, 0.9 + level.random.nextFloat() * 0.2);
  const n = eggsOf(st);
  if (n <= 1) level.destroyBlock(x, y, z, false);
  else {
    level.setBlock(x, y, z, EGG.with(st, 'eggs', n - 1), 2);
    destroyEffect(level, x, y, z, st);
  }
}

/** vanilla TurtleEggBlock.destroyEgg: one chance in `chance` that `e` crushes an egg */
function destroyEgg(level: Level, x: number, y: number, z: number, st: number, e: Entity, chance: number): void {
  if (STATE_BLOCK[st] === EGG.id && canDestroyEgg(level, e) && level.random.nextInt(chance) === 0) decreaseEggs(level, x, y, z, st);
}

/** vanilla shouldUpdateHatchLevel: the hour before dawn (a time of day between 0.65 and 0.69), else one tick in 500 */
function shouldUpdateHatchLevel(level: Level): boolean {
  const f = timeOfDay(level.skyTime());
  return (f < 0.69 && f > 0.65) || level.random.nextInt(500) === 0;
}

/** vanilla TurtleEggBlock.randomTick: on sand, it cracks a little further, or hatches its babies at home */
function randomTick(level: Level, x: number, y: number, z: number, st: number): void {
  if (!shouldUpdateHatchLevel(level) || !onSand(level.world, x, y, z)) return;
  const hatch = EGG.get<number>(st, 'hatch');
  const r = level.random;
  if (hatch < 2) {
    level.sound.play('entity.turtle.egg_crack', x + 0.5, y + 0.5, z + 0.5, 0.7, 0.9 + r.nextFloat() * 0.2);
    level.setBlock(x, y, z, EGG.with(st, 'hatch', hatch + 1), 2);
    return;
  }
  level.sound.play('entity.turtle.egg_hatch', x + 0.5, y + 0.5, z + 0.5, 0.7, 0.9 + r.nextFloat() * 0.2);
  level.setBlock(x, y, z, 0);
  for (let j = 0; j < eggsOf(st); j++) {
    destroyEffect(level, x, y, z, st);
    const t = new Turtle(level);
    t.setAge(-24000);
    t.homePos = [x, y, z];
    t.moveTo(x + 0.3 + j * 0.2, y, z + 0.3, 0, 0);
    level.addEntity(t);
  }
}

registerBehavior('turtle_egg', {
  randomTick,
  /** vanilla stepOn: walking over them, unless sneaking (isSteppingCarefully) */
  stepOn(level, x, y, z, st, e) {
    if (!e.isShiftKeyDown()) destroyEgg(level, x, y, z, st, e, 100);
  },
  /** vanilla fallOn: landing on them, but a zombie */
  fallOn(level, x, y, z, st, e) {
    if (!ZOMBIES.has(e.type)) destroyEgg(level, x, y, z, st, e, 3);
  },
  /** vanilla canBeReplaced: a turtle egg in hand (and not sneaking) goes into a clutch of fewer than four */
  canBeReplaced: (st, stack, sneaking) => !sneaking && stack.item.id === 'turtle_egg' && eggsOf(st) < 4,
  /** vanilla getStateForPlacement: into a clutch, one more egg */
  placement(ctx) {
    const cur = ctx.world.getState(ctx.x, ctx.y, ctx.z);
    return STATE_BLOCK[cur] === EGG.id ? EGG.with(cur, 'eggs', Math.min(4, eggsOf(cur) + 1)) : EGG.defaultState;
  },
  /** vanilla onPlace: on sand, green sparkles (vanilla levelEvent 2012, 15 of them) */
  onPlace(level, x, y, z) {
    if (onSand(level.world, x, y, z)) sparklesInBlock(level, x, y, z, 15);
  },
  /** vanilla loot_tables/blocks/turtle_egg: one egg, with silk touch */
  drops: (_st, _tool, _r, silk) => (silk ? [ItemStack.of('turtle_egg')] : []),
  /** vanilla TurtleEggBlock.playerDestroy: a player breaks one egg of the clutch (the rest are put back) */
  playerDestroy(level, x, y, z, st) {
    decreaseEggs(level, x, y, z, st);
  },
});
