// (remaining mobs: the phantom) The phantom (vanilla 1.21 Phantom, a FlyingMob that is an Enemy): the undead flyer of
// sleepless nights. It comes (game/phantomSpawner.ts) to a player who hasn't slept for three days or more, out at night
// under the open sky, high above them. It glides round and round a point in the air, and once it has a player (the
// highest of those it can see within 64 blocks, looked for every three seconds) it circles 20 to 40 blocks over them,
// and half a second later screeches and swoops down, biting (for 6, more for a bigger one) and pulling away again, to
// look for a player afresh three seconds on; bumping into something or being hurt breaks the swoop off, and so does a
// cat within 16 blocks (hissing at it). It burns in daylight, drops a phantom membrane to a player's kill, and is
// bigger with its Size (0 to 64: only /summon's), wider and with a harder bite. Its wings beat at a pace of its own,
// trailing specks from their tips.

import type { Level } from '../game/level';
import type { LootEntry } from './mob';
import type { Entity } from './entity';
import type { LivingEntity } from './living';
import type { Player } from './player';
import type { Cat } from './cat';
import type { SpawnReason, SpawnGroup } from './mob';
import { Monster } from './monsters';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { LookControl, MoveControl } from './ai/controls';
import { wrapDegrees } from '../core/math';
import { FLAGS, F_AIR } from '../world/block';
import { SEA_LEVEL } from '../world/constants';

const DEG = Math.PI / 180;

/** vanilla Phantom.FLAP_DEGREES_PER_TICK: a wingbeat's phase goes on this far each tick (a beat in 48 ticks or so) */
export const FLAP_DEGREES_PER_TICK = 7.448451;
/** vanilla Phantom.TICKS_PER_FLAP: Mth.ceil(24.166098) */
const TICKS_PER_FLAP = 25;

/** vanilla Mth.approach */
function approach(cur: number, target: number, speed: number): number {
  speed = Math.abs(speed);
  return cur < target ? Math.min(cur + speed, target) : Math.max(cur - speed, target);
}

/** vanilla Mth.approachDegrees */
function approachDegrees(cur: number, target: number, speed: number): number {
  return approach(cur, cur + wrapDegrees(target - cur), speed);
}

/** vanilla AttackPhase */
export type AttackPhase = 'circle' | 'swoop';

export class Phantom extends Monster {
  readonly type = 'phantom';
  /** vanilla DATA_SIZE_ID: 0 to 64 (setPhantomSize) */
  size = 0;
  /**
   * vanilla getUniqueFlapTickOffset (its id × 3): where its wingbeat stands at world time 0. (Vanilla counts its
   * wingbeat from its own age, which each game counts for itself; here it's from the world's time, which host and
   * guests share, so each sees and hears the same beat)
   */
  flapOffset = 0;
  /**
   * what only the host's AI keeps (in one record, which isn't sent to guests): vanilla anchorPoint (the block it
   * circles, none yet at 0, 0, 0), moveTargetPoint (where it's flying to) and attackPhase
   */
  readonly flight = { anchor: [0, 0, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number], phase: 'circle' as AttackPhase };

  constructor(level: Level) {
    super(level);
    this.maxHealth = this.health = 20;
    this.xpReward = 5;
    this.flapOffset = this.id * 3;
    this.moveControl = new PhantomMoveControl(this);
    (this as { lookControl: LookControl }).lookControl = new PhantomLookControl(this);
    this.updateSizeInfo();
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new PhantomAttackStrategyGoal(this));
    this.goalSelector.addGoal(2, new PhantomSweepAttackGoal(this));
    this.goalSelector.addGoal(3, new PhantomCircleAroundAnchorGoal(this));
    this.targetSelector.addGoal(1, new PhantomAttackPlayerTargetGoal(this));
  }

  // --- its size ---------------------------------------------------------------------------------------------------

  /** vanilla setPhantomSize: 0 to 64 */
  setPhantomSize(n: number): void {
    this.size = Math.max(0, Math.min(64, Math.trunc(n) || 0));
    this.updateSizeInfo();
  }

  /**
   * vanilla updatePhantomSizeInfo and getDefaultDimensions: 0.9 by 0.5 grown 15% a size (eyes 0.175 up), its bite 6
   * and a point a size
   */
  private updateSizeInfo(): void {
    const s = this.scaleBySize();
    this.setSize(0.9 * s, 0.5 * s);
    this.attackDamage = 6 + this.size;
  }

  scaleBySize(): number {
    return 1 + 0.15 * this.size;
  }

  override get eyeHeight(): number {
    return 0.175 * this.scaleBySize();
  }

  // --- flying -----------------------------------------------------------------------------------------------------

  /** the wingbeat's phase (ticks) at `partial` into this tick (vanilla getUniqueFlapTickOffset() + tickCount) */
  flapTicks(partial = 0): number {
    return this.flapOffset + this.level.gameTime + partial;
  }

  /** vanilla isFlapping: once in 25 ticks (a FLAP game event) */
  protected override isFlapping(): boolean {
    return this.flapTicks() % TICKS_PER_FLAP === 0;
  }

  /** vanilla FlyingMob.travel: no gravity, air drag 0.91 (0.8 in water, 0.5 in lava) */
  override travel(sx: number, sy: number, sz: number): void {
    const drag = this.inWater ? 0.8 : this.inLava ? 0.5 : 0.91;
    this.moveRelative(this.inWater || this.inLava || !this.onGround ? 0.02 : 0.1 * (0.16277137 / (0.91 * 0.91 * 0.91)), sx, sy, sz);
    this.move(this.dx, this.dy, this.dz);
    this.dx *= drag;
    this.dy *= drag;
    this.dz *= drag;
  }

  /** vanilla FlyingMob.checkFallDamage: none */
  protected override checkFallDamage(_dy: number, _onGround: boolean): void {
    this.fallDistance = 0;
  }
  protected override causeFallDamage(_dist: number): void {}

  /** vanilla Phantom.PhantomBodyRotationControl: the head as the body was, the body as the phantom faces */
  protected override updateBodyRotation(): void {
    this.headYaw = this.bodyYaw;
    this.bodyYaw = this.yaw;
  }

  /**
   * vanilla Phantom.tick (the client's part, which each game plays for itself, a host's guests' copies too): a flap of
   * the wings once a beat, as they come down, and a speck of mycelium off each wingtip every tick
   */
  override tick(): void {
    super.tick();
    if (this.removed) return;
    this.level.clientEffects(() => this.clientTick());
  }

  /** (a guest's copy) its wingbeats' flaps and specks are its own, as on vanilla's client: the host sends neither */
  override animateMirror(): void {
    super.animateMirror();
    this.clientTick();
  }

  /** (tick) the client's part, each client's own (the host's own player's, a guest's copy's) */
  private clientTick(): void {
    const f = Math.cos(this.flapTicks() * FLAP_DEGREES_PER_TICK * DEG + Math.PI);
    const g = Math.cos(this.flapTicks(1) * FLAP_DEGREES_PER_TICK * DEG + Math.PI);
    const r = this.random;
    if (f > 0 && g <= 0) this.playSound('entity.phantom.flap', 0.95 + r.nextFloat() * 0.05, 0.95 + r.nextFloat() * 0.05);
    const h = this.width * 1.48;
    const i = Math.cos(this.yaw * DEG) * h, j = Math.sin(this.yaw * DEG) * h;
    const k = (0.3 + f * 0.45) * this.height * 2.5;
    this.level.particles.spawn?.('mycelium', this.x + i, this.y + k, this.z + j, 0, 0, 0);
    this.level.particles.spawn?.('mycelium', this.x - i, this.y + k, this.z - j, 0, 0, 0);
  }

  /** vanilla Phantom.aiStep: the sun sets it alight for 8 seconds */
  override aiStep(): void {
    if (this.isAlive && this.isSunBurnTick()) this.igniteForSeconds(8);
    super.aiStep();
  }

  /** (vanilla: a FlyingMob, not a Monster: bright light doesn't hasten its despawning) */
  protected override updateNoActionTime(): void {}

  /** (vanilla: not a Monster, it doesn't keep a player from sleeping) */
  override isPreventingPlayerRest(_p: Entity): boolean {
    return false;
  }

  override isUndead(): boolean {
    return true;
  }

  /** vanilla finalizeSpawn: its anchor 5 blocks over where it appears, size 0 */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    this.flight.anchor = [Math.floor(this.x), Math.floor(this.y) + 5, Math.floor(this.z)];
    this.setPhantomSize(0);
    super.finalizeSpawn(reason, group);
  }

  /** vanilla canAttack(target, TargetingConditions.DEFAULT): fair game and in sight (however far) */
  canAttackNow(t: LivingEntity): boolean {
    return this.canAttack(t) && this.sensing.hasLineOfSight(t);
  }

  // --- sounds and loot -------------------------------------------------------------------------------------------

  override ambientSound(): string {
    return 'entity.phantom.ambient';
  }
  override hurtSound(): string {
    return 'entity.phantom.hurt';
  }
  override deathSound(): string {
    return 'entity.phantom.death';
  }
  /** vanilla getSoundVolume */
  override soundVolume(): number {
    return 1;
  }
  /** (vanilla: a FlyingMob's swimming and splashing, not a monster's) */
  protected override swimSound(): string {
    return 'entity.generic.swim';
  }
  protected override swimSplashSound(): string {
    return 'entity.generic.splash';
  }
  protected override swimHighSpeedSplashSound(): string {
    return 'entity.generic.splash';
  }

  /** vanilla entities/phantom: a phantom membrane half the time, looting adding up to one a level; a player's kill */
  override lootTable(): LootEntry[] {
    return [{ item: 'phantom_membrane', min: 0, max: 1, player: true }];
  }

  // --- saving ------------------------------------------------------------------------------------------------------

  /** vanilla addAdditionalSaveData: AX, AY, AZ (its anchor) and Size */
  protected override saveData(): Record<string, number | string | boolean> {
    const [ax, ay, az] = this.flight.anchor;
    return { ...super.saveData(), AX: ax, AY: ay, AZ: az, Size: this.size };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (d.AX !== undefined) this.flight.anchor = [Math.floor(Number(d.AX) || 0), Math.floor(Number(d.AY) || 0), Math.floor(Number(d.AZ) || 0)];
    this.setPhantomSize(Number(d.Size ?? 0));
  }
}

// ---------------------------------------------------------------------------
// its controls

/**
 * vanilla Phantom.PhantomMoveControl: it banks round towards where it's going, 4° a tick, speeding up (to 1.8) while
 * it's on course and slowing (to 0.2) while it turns, its nose up or down the way it climbs; its motion eases a fifth
 * of the way to that each tick. Something in its way turns it right round
 */
class PhantomMoveControl extends MoveControl {
  private speed = 0.1;
  constructor(readonly phantom: Phantom) {
    super(phantom);
  }
  override tick(): void {
    const p = this.phantom;
    if (p.horizontalCollision) {
      p.yaw += 180;
      this.speed = 0.1;
    }
    const [tx, ty, tz] = p.flight.target;
    let d = tx - p.x;
    const e = ty - p.y;
    let f = tz - p.z;
    let g = Math.sqrt(d * d + f * f);
    if (Math.abs(g) <= 1e-5) return;
    const h = 1 - Math.abs(e * 0.7) / g;
    d *= h;
    f *= h;
    g = Math.sqrt(d * d + f * f);
    const i = Math.sqrt(d * d + f * f + e * e);
    const j = p.yaw;
    const k = Math.atan2(f, d);
    const l = wrapDegrees(p.yaw + 90);
    const m = wrapDegrees(k / DEG);
    p.yaw = approachDegrees(l, m, 4) - 90;
    p.bodyYaw = p.yaw;
    if (Math.abs(wrapDegrees(p.yaw - j)) < 3) this.speed = approach(this.speed, 1.8, 0.005 * (1.8 / this.speed));
    else this.speed = approach(this.speed, 0.2, 0.025);
    const n = -(Math.atan2(-e, g) / DEG);
    p.pitch = n;
    const o = p.yaw + 90;
    const px = this.speed * Math.cos(o * DEG) * Math.abs(d / i);
    const pz = this.speed * Math.sin(o * DEG) * Math.abs(f / i);
    const py = this.speed * Math.sin(n * DEG) * Math.abs(e / i);
    p.dx += (px - p.dx) * 0.2;
    p.dy += (py - p.dy) * 0.2;
    p.dz += (pz - p.dz) * 0.2;
  }
}

/** vanilla Phantom.PhantomLookControl: nothing (it looks where it flies; its pitch is the move control's) */
class PhantomLookControl extends LookControl {
  override tick(): void {}
}

// ---------------------------------------------------------------------------
// its goals

/**
 * vanilla PhantomAttackStrategyGoal: with a target it can see, it circles over it, and when the time comes (half a
 * second at first, then 8 to 11 seconds after each swoop, though a swoop ends by letting its target go) swoops with a
 * screech; given up, it climbs to 10 to 29 blocks over the ground where its anchor was
 */
class PhantomAttackStrategyGoal extends Goal {
  private nextSweepTick = 0;
  constructor(readonly phantom: Phantom) {
    super();
  }
  canUse(): boolean {
    const t = this.phantom.target;
    return t ? this.phantom.canAttackNow(t) : false;
  }
  override start(): void {
    this.nextSweepTick = this.adjustedTickDelay(10);
    this.phantom.flight.phase = 'circle';
    this.setAnchorAboveTarget();
  }
  override stop(): void {
    const p = this.phantom, [x, , z] = p.flight.anchor;
    p.flight.anchor = [x, p.level.motionBlockingHeight(x, z) + 10 + p.random.nextInt(20), z];
  }
  override tick(): void {
    const p = this.phantom;
    if (p.flight.phase !== 'circle') return;
    if (--this.nextSweepTick > 0) return;
    p.flight.phase = 'swoop';
    this.setAnchorAboveTarget();
    this.nextSweepTick = this.adjustedTickDelay((8 + p.random.nextInt(4)) * 20);
    p.playSound('entity.phantom.swoop', 10, 0.95 + p.random.nextFloat() * 0.1);
  }
  /** 20 to 39 blocks over the target, and never below the sea */
  private setAnchorAboveTarget(): void {
    const p = this.phantom, t = p.target!;
    let y = Math.floor(t.y) + 20 + p.random.nextInt(20);
    if (y < SEA_LEVEL) y = SEA_LEVEL + 1;
    p.flight.anchor = [Math.floor(t.x), y, Math.floor(t.z)];
  }
}

/** vanilla Phantom.PhantomMoveTargetGoal: a goal that steers it (to its moveTargetPoint) */
abstract class PhantomMoveTargetGoal extends Goal {
  constructor(readonly phantom: Phantom) {
    super();
    this.flags = Flag.MOVE;
  }
  /** vanilla touchingTarget: within 2 blocks of where it's flying to */
  protected touchingTarget(): boolean {
    const p = this.phantom, [x, y, z] = p.flight.target;
    return (x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2 < 4;
  }
}

/**
 * vanilla PhantomSweepAttackGoal: the swoop, straight at the middle of its target, biting it on touching it and pulling
 * away; a wall, a hurt, a target gone (or gone creative), or a cat about (which hisses) ends it and lets it go
 */
class PhantomSweepAttackGoal extends PhantomMoveTargetGoal {
  private scaredOfCat = false;
  private catSearchTick = 0;
  canUse(): boolean {
    return this.phantom.target !== null && this.phantom.flight.phase === 'swoop';
  }
  override canContinueToUse(): boolean {
    const p = this.phantom, t = p.target;
    if (!t || !t.isAlive) return false;
    if (t.type === 'player') {
      const gm = (t as Player).gameMode;
      if (gm === 'spectator' || gm === 'creative') return false;
    }
    if (!this.canUse()) return false;
    if (p.tickCount > this.catSearchTick) {
      this.catSearchTick = p.tickCount + 20;
      const cats = p.level.getEntities(p.bb.inflate(16, 16, 16), (e) => e.type === 'cat' && (e as LivingEntity).isAlive) as Cat[];
      for (const c of cats) c.hiss();
      this.scaredOfCat = cats.length > 0;
    }
    return !this.scaredOfCat;
  }
  override stop(): void {
    this.phantom.setTarget(null);
    this.phantom.flight.phase = 'circle';
  }
  override tick(): void {
    const p = this.phantom, t = p.target;
    if (!t) return;
    p.flight.target = [t.x, t.y + t.height * 0.5, t.z];
    if (p.bb.inflate(0.2, 0.2, 0.2).intersects(t.bb)) {
      p.doHurtTarget(t);
      p.flight.phase = 'circle';
      // (vanilla levelEvent 1039: the bite, at its block)
      p.level.sound.play('entity.phantom.bite', Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5, Math.floor(p.z) + 0.5, 0.3, p.random.nextFloat() * 0.1 + 0.9);
    } else if (p.horizontalCollision || p.hurtTime > 0) p.flight.phase = 'circle';
  }
}

/**
 * vanilla PhantomCircleAroundAnchorGoal: round and round its anchor, 5 to 15 blocks out (a block wider now and then,
 * back to 5 the other way round), 8 below it to a block above, a new height now and then, a new place on the circle
 * now and then; not into the ground or a ceiling
 */
class PhantomCircleAroundAnchorGoal extends PhantomMoveTargetGoal {
  private angle = 0;
  private distance = 0;
  private height = 0;
  private clockwise = 0;
  canUse(): boolean {
    return this.phantom.target === null || this.phantom.flight.phase === 'circle';
  }
  override start(): void {
    const r = this.phantom.random;
    this.distance = 5 + r.nextFloat() * 10;
    this.height = -4 + r.nextFloat() * 9;
    this.clockwise = r.nextBool() ? 1 : -1;
    this.selectNext();
  }
  override tick(): void {
    const p = this.phantom, r = p.random;
    if (r.nextInt(this.adjustedTickDelay(350)) === 0) this.height = -4 + r.nextFloat() * 9;
    if (r.nextInt(this.adjustedTickDelay(250)) === 0) {
      this.distance++;
      if (this.distance > 15) {
        this.distance = 5;
        this.clockwise = -this.clockwise;
      }
    }
    if (r.nextInt(this.adjustedTickDelay(450)) === 0) {
      this.angle = r.nextFloat() * 2 * Math.PI;
      this.selectNext();
    }
    if (this.touchingTarget()) this.selectNext();
    const w = p.level.world, bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const ty = p.flight.target[1];
    if (ty < p.y && !(FLAGS[w.getState(bx, by - 1, bz)] & F_AIR)) {
      this.height = Math.max(1, this.height);
      this.selectNext();
    }
    if (ty > p.y && !(FLAGS[w.getState(bx, by + 1, bz)] & F_AIR)) {
      this.height = Math.min(-1, this.height);
      this.selectNext();
    }
  }
  private selectNext(): void {
    const p = this.phantom, a = p.flight.anchor;
    if (a[0] === 0 && a[1] === 0 && a[2] === 0) p.flight.anchor = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
    this.angle += this.clockwise * 15 * DEG;
    const [ax, ay, az] = p.flight.anchor;
    p.flight.target = [ax + this.distance * Math.cos(this.angle), ay - 4 + this.height, az + this.distance * Math.sin(this.angle)];
  }
}

/**
 * vanilla PhantomAttackPlayerTargetGoal: a second after it comes, then every three seconds, the highest player (of
 * those it could attack, within 64 blocks, less for one sneaking or invisible, and in sight, in a box 16 across and 64
 * up and down) it can go for; kept while it can still see and go for them
 */
class PhantomAttackPlayerTargetGoal extends Goal {
  private nextScanTick = reducedTickDelay(20);
  constructor(readonly phantom: Phantom) {
    super();
  }
  canUse(): boolean {
    if (this.nextScanTick > 0) {
      this.nextScanTick--;
      return false;
    }
    this.nextScanTick = reducedTickDelay(60);
    const p = this.phantom;
    const box = p.bb.inflate(16, 64, 16);
    const list: Player[] = [];
    for (const pl of p.level.players()) {
      if (!box.contains(pl.x, pl.y, pl.z) || !p.canAttack(pl)) continue;
      // (vanilla TargetingConditions.forCombat().range(64): nearer for one sneaking or invisible, at least 2)
      const r = Math.max(64 * pl.visibilityPercent(p), 2);
      if (p.distanceToSqr(pl.x, pl.y, pl.z) > r * r || !p.sensing.hasLineOfSight(pl)) continue;
      list.push(pl);
    }
    // (vanilla: sorted by height, the highest first, a stable sort)
    list.sort((a, b) => b.y - a.y);
    for (const pl of list)
      if (p.canAttackNow(pl)) {
        p.setTarget(pl);
        return true;
      }
    return false;
  }
  override canContinueToUse(): boolean {
    const t = this.phantom.target;
    return t ? this.phantom.canAttackNow(t) : false;
  }
}
