// Bats (vanilla AmbientCreature / Bat, 1.21): they hang upside down under solid blocks and
// flutter about dark caves on a random target that keeps changing, wake up when a player comes
// within 4 blocks or they get hurt, and go back to sleep under a ceiling.

import { Mob, MobCategory, LootEntry } from './mob';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import type { Rand } from '../core/rng';
import { validSpawnBlock } from './monsters';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_LEAVES, COLLISION } from '../world/block';
import { MIN_Y, SEA_LEVEL } from '../world/constants';
import { wrapDegrees } from '../core/math';

/** vanilla AmbientCreature: the AMBIENT mob category (cap 15, spawned every tick, even in peaceful) */
export abstract class AmbientCreature extends Mob {
  readonly category: MobCategory = 'ambient';

  /** vanilla AmbientCreature.canBeLeashed: a bat won't go on a lead */
  override canBeLeashed(): boolean {
    return false;
  }
}

/** blocks that never conduct redstone although their collision is a full cube (vanilla isRedstoneConductor(Blocks::never)) */
const NEVER_CONDUCTS = /glass$|^(ice|redstone_block|piston|sticky_piston)$/;

/** vanilla BlockState.isRedstoneConductor: a full-cube collision shape (soul sand and mud always, glass, ice and leaves never) */
export function isRedstoneConductor(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  if (n === 'soul_sand' || n === 'mud') return true;
  if (FLAGS[st] & F_LEAVES || NEVER_CONDUCTS.test(n)) return false;
  const c = COLLISION[st];
  return !!c && c.length === 1 && c[0][0] <= 0 && c[0][1] <= 0 && c[0][2] <= 0 && c[0][3] >= 1 && c[0][4] >= 1 && c[0][5] >= 1;
}

/** vanilla Bat.isHalloween: 20 October to 3 November by the real (local) date */
export function isHalloween(d = new Date()): boolean {
  const m = d.getMonth() + 1, day = d.getDate();
  return (m === 10 && day >= 20) || (m === 11 && day <= 3);
}

export class Bat extends AmbientCreature {
  readonly type = 'bat';
  /** vanilla DATA_ID_FLAGS bit 1: hanging upside down (the server-side constructor starts it resting) */
  resting = true;
  /** vanilla targetPosition: the block the bat is fluttering towards */
  private targetPos: [number, number, number] | null = null;
  /** vanilla flyAnimationState / restAnimationState: the tick each loop started, -1 while stopped */
  flyAnimStart = -1;
  restAnimStart = -1;

  constructor(level: Level) {
    super(level);
    this.setSize(0.5, 0.9);
    this.maxHealth = this.health = 6;
  }

  protected registerGoals(): void {}

  /** vanilla EntityType.BAT eyeHeight(0.45) */
  override get eyeHeight(): number {
    return 0.45;
  }

  override soundVolume(): number {
    return 0.1;
  }

  override voicePitch(): number {
    return super.voicePitch() * 0.95;
  }

  /** vanilla Bat.getAmbientSound: a squeak, but only one attempt in four while hanging */
  override ambientSound(): string | null {
    return this.resting && this.random.nextInt(4) !== 0 ? null : 'entity.bat.ambient';
  }

  override hurtSound(): string {
    return 'entity.bat.hurt';
  }

  override deathSound(): string {
    return 'entity.bat.death';
  }

  override lootTable(): LootEntry[] {
    return [];
  }

  /** vanilla Bat.isPushable / doPush / pushEntities: bats neither push nor get pushed */
  override isPushable(): boolean {
    return false;
  }

  protected override pushEntities(): void {}

  /** vanilla MovementEmission.EVENTS: no step sounds */
  protected override makesStepSounds(): boolean {
    return false;
  }

  /** (vanilla MovementEmission.EVENTS: its movement is heard by sculk sensors all the same) */
  protected override emitsMovementEvents(): boolean {
    return true;
  }

  /** vanilla Bat.isFlapping: a wingbeat every 10 ticks in flight (heard by sculk sensors) */
  protected override isFlapping(): boolean {
    return !this.resting && this.tickCount % 10 === 0;
  }

  /** vanilla Bat.checkFallDamage: nothing, the fall distance never builds up */
  protected override checkFallDamage(): void {}

  override tick(): void {
    super.tick();
    if (this.removed) return;
    if (this.resting) {
      // hang from the ceiling of the block the bat is in
      this.dx = this.dy = this.dz = 0;
      this.setPos(this.x, Math.floor(this.y) + 1 - this.height, this.z);
    } else this.dy *= 0.6;
    this.setupAnimationStates();
  }

  /** vanilla Bat.customServerAiStep */
  protected override customServerAiStep(): void {
    super.customServerAiStep();
    const w = this.level.world;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const above = w.getState(bx, by + 1, bz);
    if (this.resting) {
      if (isRedstoneConductor(above)) {
        if (this.random.nextInt(200) === 0) this.headYaw = this.random.nextInt(360);
        if (this.nearestPlayerInReach()) this.takeOff(bx, by, bz);
      } else this.takeOff(bx, by, bz);
      return;
    }
    let t = this.targetPos;
    if (t && (!(FLAGS[w.getState(t[0], t[1], t[2])] & F_AIR) || t[1] <= MIN_Y)) t = this.targetPos = null;
    if (!t || this.random.nextInt(30) === 0 || closerToCenterThan(t, this.x, this.y, this.z, 2)) {
      const r = this.random;
      t = this.targetPos = [
        Math.floor(this.x + r.nextInt(7) - r.nextInt(7)),
        Math.floor(this.y + r.nextInt(6) - 2),
        Math.floor(this.z + r.nextInt(7) - r.nextInt(7)),
      ];
    }
    const d2 = t[0] + 0.5 - this.x, d0 = t[1] + 0.1 - this.y, d1 = t[2] + 0.5 - this.z;
    this.dx += (Math.sign(d2) * 0.5 - this.dx) * 0.10000000149011612;
    this.dy += (Math.sign(d0) * 0.699999988079071 - this.dy) * 0.10000000149011612;
    this.dz += (Math.sign(d1) * 0.5 - this.dz) * 0.10000000149011612;
    const f = (Math.atan2(this.dz, this.dx) * 180) / Math.PI - 90;
    this.zza = 0.5;
    this.yaw += wrapDegrees(f - this.yaw);
    if (this.random.nextInt(100) === 0 && isRedstoneConductor(above)) this.resting = true;
  }

  /** vanilla BAT_RESTING_TARGETING (TargetingConditions.forNonCombat().range(4)): a visible player within 4 blocks */
  private nearestPlayerInReach(): boolean {
    const p = this.level.player;
    if (!p || !p.isAlive || p.gameMode === 'spectator') return false;
    const r = Math.max(4 * p.visibilityPercent(this), 2);
    return this.distanceToSqr(p.x, p.y, p.z) <= r * r && this.sensing.hasLineOfSight(p);
  }

  /** stop hanging, with the level event 1025 flutter (vanilla BAT_TAKEOFF at 0.05) */
  private takeOff(bx: number, by: number, bz: number): void {
    this.resting = false;
    this.level.sound.play('entity.bat.takeoff', bx + 0.5, by + 0.5, bz + 0.5, 0.05, (Math.random() - Math.random()) * 0.2 + 1);
  }

  /** vanilla Bat.setupAnimationStates */
  private setupAnimationStates(): void {
    if (this.resting) {
      this.flyAnimStart = -1;
      if (this.restAnimStart < 0) this.restAnimStart = this.tickCount;
    } else {
      this.restAnimStart = -1;
      if (this.flyAnimStart < 0) this.flyAnimStart = this.tickCount;
    }
  }

  /** vanilla Bat.hurt: a hit wakes a hanging bat */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isInvulnerableTo(source)) return false;
    if (this.resting) this.resting = false;
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla BatFlags */
  protected override saveData(): Record<string, number | string | boolean> {
    return { resting: this.resting };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.resting = d.resting === true;
  }

  /**
   * vanilla Bat.checkBatSpawnRules: below sea level, and dark: the light must not beat a random
   * 0..3 (0..6 around Halloween, when the coin toss that halves spawns is skipped too), on a
   * block mobs can spawn on.
   */
  static checkBatSpawnRules(level: Level, x: number, y: number, z: number, rand: Rand): boolean {
    if (y >= SEA_LEVEL) return false;
    const i = level.rawBrightness(x, y, z);
    let j = 4;
    if (isHalloween()) j = 7;
    else if (rand.nextBool()) return false;
    return i > rand.nextInt(j) ? false : validSpawnBlock(level, x, y - 1, z);
  }
}

/** vanilla Vec3i.closerToCenterThan: the block's centre is less than `d` away */
function closerToCenterThan(t: [number, number, number], x: number, y: number, z: number, d: number): boolean {
  const a = t[0] + 0.5 - x, b = t[1] + 0.5 - y, c = t[2] + 0.5 - z;
  return a * a + b * b + c * c < d * d;
}
