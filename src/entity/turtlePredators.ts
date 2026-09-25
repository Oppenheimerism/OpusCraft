// The turtle's enemies (Stage 5: ocean, M6): vanilla Turtle.BABY_ON_LAND_SELECTOR, by which zombies and drowned,
// skeletons, ocelots, stray cats and wild wolves pick baby turtles out of the water as prey, and Zombie's
// ZombieAttackTurtleEggGoal (a vanilla RemoveBlockGoal): every kind of zombie, while mob griefing is on, makes for turtle
// eggs within 24 blocks (3 up or down) with nothing over them, and there stamps up and down on them, crunching, till
// after three seconds they break, all of the clutch at once, in a puff.

import { MoveToBlockGoal } from './ai/goals';
import { reducedTickDelay } from './ai/goal';
import type { Mob } from './mob';
import type { LivingEntity } from './living';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';

/** vanilla Turtle.BABY_ON_LAND_SELECTOR: a baby turtle out of the water */
export function babyTurtleOnLand(e: LivingEntity): boolean {
  return e.type === 'turtle' && (e as Mob).isBaby() && !e.inWater;
}

const gauss = (): number => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

/**
 * vanilla RemoveBlockGoal: while mob griefing is on, it finds the nearest `block` within 24 (`vRange` up and down) with
 * two blocks of air over it, goes to it, and there, over it or beside it, hops up and down (bits of egg flying off
 * every hop), and after three seconds removes it. It looks again a second after finding one, or 10-20 s after not
 */
export class RemoveBlockGoal extends MoveToBlockGoal {
  private ticksSinceReachedGoal = 0;

  constructor(readonly block: string, mob: Mob, speed: number, vRange: number) {
    super(mob, speed, 24, vRange);
  }

  override canUse(): boolean {
    if (!this.mob.level.gameRules.mobGriefing) return false;
    if (this.nextStartTick > 0) {
      this.nextStartTick--;
      return false;
    }
    if (this.findNearestBlock()) {
      this.nextStartTick = reducedTickDelay(20);
      return true;
    }
    this.nextStartTick = this.nextStartDelay();
    return false;
  }

  override stop(): void {
    super.stop();
    // (so the fall from its last hop counts)
    this.mob.fallDistance = 1;
  }

  override start(): void {
    super.start();
    this.ticksSinceReachedGoal = 0;
  }

  /** vanilla playDestroyProgressSound: every third stamp */
  protected playDestroyProgressSound(_x: number, _y: number, _z: number): void {}
  /** vanilla playBreakSound: when it's gone */
  protected playBreakSound(_x: number, _y: number, _z: number): void {}

  override tick(): void {
    super.tick();
    const m = this.mob, level = m.level;
    const at = this.posWithBlock(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z));
    if (!this.isReachedTarget() || !at) return;
    const [x, y, z] = at;
    if (this.ticksSinceReachedGoal > 0) {
      m.dy = 0.3;
      // (vanilla sendParticles(item egg, 3, ±0.04, 0.15))
      const r = m.random;
      const ox = (r.nextFloat() - 0.5) * 0.08, oy = (r.nextFloat() - 0.5) * 0.08, oz = (r.nextFloat() - 0.5) * 0.08;
      for (let i = 0; i < 3; i++)
        level.particles.spawn?.('item_egg', x + 0.5 + gauss() * ox, y + 0.7 + gauss() * oy, z + 0.5 + gauss() * oz, gauss() * 0.15, gauss() * 0.15, gauss() * 0.15);
    }
    if (this.ticksSinceReachedGoal % 2 === 0) {
      m.dy = -0.3;
      if (this.ticksSinceReachedGoal % 6 === 0) this.playDestroyProgressSound(this.bx, this.by, this.bz);
    }
    if (this.ticksSinceReachedGoal > 60) {
      level.setBlock(x, y, z, 0);
      for (let i = 0; i < 20; i++) {
        const dx = gauss() * 0.02, dy = gauss() * 0.02, dz = gauss() * 0.02;
        level.particles.spawn?.('poof', x + 0.5 + gauss() * dx, y + gauss() * dy, z + 0.5 + gauss() * dz, gauss() * 0.15, gauss() * 0.15, gauss() * 0.15);
      }
      this.playBreakSound(x, y, z);
    }
    this.ticksSinceReachedGoal++;
  }

  /** vanilla getPosWithBlock: the block where it stands, or under it, beside it, or two under */
  private posWithBlock(x: number, y: number, z: number): [number, number, number] | null {
    for (const [dx, dy, dz] of [[0, 0, 0], [0, -1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, -2, 0]])
      if (this.isBlock(x + dx, y + dy, z + dz)) return [x + dx, y + dy, z + dz];
    return null;
  }

  private isBlock(x: number, y: number, z: number): boolean {
    return BLOCKS[STATE_BLOCK[this.mob.level.world.getState(x, y, z)]].name === this.block;
  }

  /** vanilla isValidTarget: the block, in a loaded chunk, with two blocks of air above it */
  protected isValidTarget(x: number, y: number, z: number): boolean {
    const w = this.mob.level.world;
    return w.isLoaded(x, z) && this.isBlock(x, y, z) && (FLAGS[w.getState(x, y + 1, z)] & F_AIR) !== 0 && (FLAGS[w.getState(x, y + 2, z)] & F_AIR) !== 0;
  }
}

/** vanilla Zombie.ZombieAttackTurtleEggGoal: a stamp's crunch every third hop, the eggs' own breaking at the end */
export class ZombieAttackTurtleEggGoal extends RemoveBlockGoal {
  constructor(mob: Mob, speed: number, vRange: number) {
    super('turtle_egg', mob, speed, vRange);
  }
  protected override playDestroyProgressSound(x: number, y: number, z: number): void {
    this.mob.level.sound.play('entity.zombie.destroy_egg', x + 0.5, y + 0.5, z + 0.5, 0.5, 0.9 + this.mob.random.nextFloat() * 0.2);
  }
  protected override playBreakSound(x: number, y: number, z: number): void {
    const level = this.mob.level;
    level.sound.play('entity.turtle.egg_break', x + 0.5, y + 0.5, z + 0.5, 0.7, 0.9 + level.random.nextFloat() * 0.2);
  }
  override acceptedDistance(): number {
    return 1.14;
  }
}
