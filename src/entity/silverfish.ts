// The silverfish (vanilla Silverfish): a small grey pest, 0.4 x 0.3, 8 health, biting for 1, that lives in the
// infested stone of strongholds and the mountains. Hit one, and it calls out: a second later every infested block
// around it (up to 10 across and 5 up or down) may crack open to let out another. Left alone, it scurries about and
// now and then burrows into the stone, cobblestone, stone bricks or deepslate next to it, turning the block into an
// infested one. It drops nothing but experience. Like the bat, it makes no sound walking (MovementEmission.EVENTS).

import { Monster } from './monsters';
import type { Level } from '../game/level';
import type { LootEntry } from './mob';
import type { Entity } from './entity';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { ClimbOnTopOfPowderSnowGoal, FloatGoal, MeleeAttackGoal, RandomStrollGoal, HurtByTargetGoal, NearestAttackablePlayerGoal } from './ai/goals';
import { isCompatibleHostBlock, isInfestedBlock, infestedStateByHost, hostStateByInfested } from '../world/blocksInfested';
import { BLOCKS, STATE_BLOCK, COLLISION } from '../world/block';

/** vanilla Direction.values(): down, up, north, south, west, east */
const DIRS: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

export class Silverfish extends Monster {
  readonly type: string = 'silverfish';
  private friendsGoal: SilverfishWakeUpFriendsGoal | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.4, 0.3);
    this.maxHealth = this.health = 8;
    this.moveSpeedAttr = 0.25;
    this.attackDamage = 1;
  }

  protected registerGoals(): void {
    this.friendsGoal = new SilverfishWakeUpFriendsGoal(this);
    this.goalSelector.addGoal(1, new FloatGoal(this));
    this.goalSelector.addGoal(1, new ClimbOnTopOfPowderSnowGoal(this));
    this.goalSelector.addGoal(3, this.friendsGoal);
    this.goalSelector.addGoal(4, new MeleeAttackGoal(this, 1.0, false));
    this.goalSelector.addGoal(5, new SilverfishMergeWithStoneGoal(this));
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this).setAlertOthers());
    this.targetSelector.addGoal(2, new NearestAttackablePlayerGoal(this, true));
  }

  /** vanilla EntityDimensions.eyeHeight: 0.13 */
  override get eyeHeight(): number {
    return 0.13;
  }

  /** vanilla getMovementEmission: EVENTS, so no step sounds */
  protected override makesStepSounds(): boolean {
    return false;
  }

  /** (vanilla MovementEmission.EVENTS: its movement is heard by sculk sensors all the same) */
  protected override emitsMovementEvents(): boolean {
    return true;
  }

  /**
   * vanilla Silverfish.hurt: a blow from someone (or magic, #always_triggers_silverfish) makes it wake its friends
   */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isInvulnerableTo(source)) return false;
    if ((attacker || source === 'magic') && this.friendsGoal) this.friendsGoal.notifyHurt();
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla Silverfish.tick: the body always points where it's going (setYBodyRot turns the whole of it) */
  override tick(): void {
    this.bodyYaw = this.yaw;
    super.tick();
  }

  /** vanilla getWalkTargetValue: stone to burrow into is the best place of all */
  override walkTargetValue(x: number, y: number, z: number): number {
    return isCompatibleHostBlock(this.level.world.getState(x, y - 1, z)) ? 10 : super.walkTargetValue(x, y, z);
  }

  /**
   * vanilla Silverfish.checkSilverfishSpawnRules: a monster's, light or no light (checkAnyLightMonsterSpawnRules;
   * from a spawner the floor doesn't matter either), and no survival player within 5 blocks
   */
  static checkSpawnRules(level: Level, x: number, y: number, z: number, fromSpawner: boolean): boolean {
    if (level.difficulty === 'peaceful') return false;
    if (!fromSpawner) {
      // (vanilla BlockState.isValidSpawn for the block below)
      const below = level.world.getState(x, y - 1, z);
      if (!COLLISION[below]?.length || BLOCKS[STATE_BLOCK[below]].name === 'bedrock') return false;
    }
    // (vanilla getNearestPlayer(x, y, z, 5, true): not creative or spectating)
    return !level.nearestPlayer(x + 0.5, y + 0.5, z + 0.5, 5, (p) => p.isAlive && p.gameMode !== 'creative' && p.gameMode !== 'spectator');
  }

  override ambientSound(): string {
    return 'entity.silverfish.ambient';
  }
  override hurtSound(): string {
    return 'entity.silverfish.hurt';
  }
  override deathSound(): string {
    return 'entity.silverfish.death';
  }
  override stepSound(): string {
    return 'entity.silverfish.step';
  }
  override lootTable(): LootEntry[] {
    return [];
  }
}

/**
 * vanilla Silverfish.SilverfishWakeUpFriendsGoal: a second after it's hurt (20 ticks), it looks through the blocks
 * about it — rings outward, 5 up and down and 10 across — and every infested block it comes to breaks open (just
 * turns back into its host if mobGriefing is off), stopping at each one on the toss of a coin
 */
class SilverfishWakeUpFriendsGoal extends Goal {
  private lookForFriends = 0;
  constructor(readonly silverfish: Silverfish) {
    super();
  }
  notifyHurt(): void {
    if (this.lookForFriends === 0) this.lookForFriends = this.adjustedTickDelay(20);
  }
  canUse(): boolean {
    return this.lookForFriends > 0;
  }
  override tick(): void {
    this.lookForFriends--;
    if (this.lookForFriends > 0) return;
    const s = this.silverfish, level = s.level, r = s.random;
    const bx = Math.floor(s.x), by = Math.floor(s.y), bz = Math.floor(s.z);
    // (0, 1, -1, 2, -2, ...: nearest layers first)
    for (let i = 0; i <= 5 && i >= -5; i = (i <= 0 ? 1 : 0) - i) {
      for (let j = 0; j <= 10 && j >= -10; j = (j <= 0 ? 1 : 0) - j) {
        for (let k = 0; k <= 10 && k >= -10; k = (k <= 0 ? 1 : 0) - k) {
          const x = bx + j, y = by + i, z = bz + k;
          const st = level.world.getState(x, y, z);
          if (!isInfestedBlock(st)) continue;
          if (level.gameRules.mobGriefing) level.destroyBlock(x, y, z, true, null, true, null, s);
          else level.setBlock(x, y, z, hostStateByInfested(st));
          if (r.nextBool()) return;
        }
      }
    }
  }
}

/**
 * vanilla Silverfish.SilverfishMergeWithStoneGoal: with nothing to chase and nowhere to go, now and then (1 in 5
 * goal ticks, mobGriefing on) it picks a random side; if the block on that side of its middle is one it can
 * burrow into, it vanishes in a puff into it, the block now infested. Otherwise it's an ordinary wander, a
 * restless one (every 10 ticks or so)
 */
class SilverfishMergeWithStoneGoal extends RandomStrollGoal {
  private dir: [number, number, number] | null = null;
  private doMerge = false;
  constructor(mob: Silverfish) {
    super(mob, 1.0, 10);
    this.flags = Flag.MOVE;
  }
  override canUse(): boolean {
    const m = this.mob;
    if (m.target) return false;
    if (!m.navigation.isDone()) return false;
    const r = m.random;
    if (m.level.gameRules.mobGriefing && r.nextInt(reducedTickDelay(10)) === 0) {
      this.dir = DIRS[r.nextInt(6)];
      const [x, y, z] = this.target();
      if (isCompatibleHostBlock(m.level.world.getState(x, y, z))) {
        this.doMerge = true;
        return true;
      }
    }
    this.doMerge = false;
    return super.canUse();
  }
  /** vanilla BlockPos.containing(x, y + 0.5, z).relative(the side) */
  private target(): [number, number, number] {
    const m = this.mob, d = this.dir!;
    return [Math.floor(m.x) + d[0], Math.floor(m.y + 0.5) + d[1], Math.floor(m.z) + d[2]];
  }
  override canContinueToUse(): boolean {
    return this.doMerge ? false : super.canContinueToUse();
  }
  override start(): void {
    if (!this.doMerge) {
      super.start();
      return;
    }
    const m = this.mob, [x, y, z] = this.target();
    const st = m.level.world.getState(x, y, z);
    if (isCompatibleHostBlock(st)) {
      m.level.setBlock(x, y, z, infestedStateByHost(st));
      m.level.particles.poof?.(m);
      m.remove();
    }
  }
}
