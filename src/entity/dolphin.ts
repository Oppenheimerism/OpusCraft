// Dolphins (Stage 5: ocean; vanilla Dolphin, with SmoothSwimmingMoveControl, SmoothSwimmingLookControl,
// BreathAirGoal, TryFindWaterGoal, DolphinJumpGoal and FollowBoatGoal).
//
// A dolphin glides through the water (it turns and pitches smoothly toward where it's going, a trail of bubbles
// behind it), leaps out and dives back in, and must come up for air: it holds its breath four minutes and heads for
// the surface when it's nearly out. On land it dries out (a minute and a half, then it's hurt every tick) and
// flops about. It swims alongside a player swimming within 10 blocks, lending them Dolphin's Grace; it follows a
// boat being rowed; it plays with items in the water (pushing them about with its nose); it keeps clear of
// guardians; and it fights back when hurt, its fellows with it. Fed a fish, it leads the way to the nearest ocean
// ruin or shipwreck (game/oceanRuins.ts and shipwrecks.ts find them; the hook stays empty until they exist).

import { WaterAnimal } from './water';
import type { Level } from '../game/level';
import type { LootEntry, SpawnGroup, SpawnReason } from './mob';
import { Mob } from './mob';
import type { Entity } from './entity';
import type { Player } from './player';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { LookControl, MoveControl, MoveOp, rotlerp } from './ai/controls';
import { WaterBoundPathNavigation, type PathNavigation } from './ai/navigation';
import { AvoidEntityGoal, HurtByTargetGoal, LookAtPlayerGoal, MeleeAttackGoal, RandomLookAroundGoal, defaultRandomPosTowards } from './ai/goals';
import { RandomSwimmingGoal } from './fish';
import { Guardian } from './guardian';
import { ItemEntity } from './itemEntity';
import { Boat } from './boat';
import { MOB_EFFECTS, MobEffectInstance } from './effects';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_AIR, F_FULL_COLLISION, COLLISION } from '../world/block';
import { equipmentSlotForItem } from '../item/equipment';
import { FLUID_WATER } from '../world/fluids';
import type { ItemStack } from '../item/item';
import { wrapDegrees } from '../core/math';

type Pos = [number, number, number];
const RAD = 180 / Math.PI;

/** where a fed dolphin leads (vanilla findNearestMapStructure(#dolphin_located: ocean ruins and shipwrecks, 50 chunks)) */
export const dolphinHooks: { findTreasure: ((level: Level, x: number, y: number, z: number) => Pos | null) | null } = { findTreasure: null };

/** vanilla #fishes (what a dolphin eats) */
const FISHES = new Set(['cod', 'cooked_cod', 'salmon', 'cooked_salmon', 'pufferfish', 'tropical_fish']);

/** vanilla Dolphin.TOTAL_AIR_SUPPLY: four minutes' breath */
export const DOLPHIN_AIR = 4800;
/** vanilla TOTAL_MOISTNESS_LEVEL: a minute and a half out of the water */
const DOLPHIN_MOISTNESS = 2400;

// ---------------------------------------------------------------------------
// the controls (vanilla SmoothSwimmingMoveControl / SmoothSwimmingLookControl)

/**
 * vanilla SmoothSwimmingMoveControl: turns toward where it's going (`maxTurnY` a tick) and pitches toward it (up to
 * `maxTurnX`, 5 a tick), swimming along its pitch; out of the water it walks, slower the more it has to turn
 */
export class SmoothSwimmingMoveControl extends MoveControl {
  constructor(mob: Mob, readonly maxTurnX: number, readonly maxTurnY: number, readonly inWaterSpeed: number, readonly outsideWaterSpeed: number, readonly applyGravity: boolean) {
    super(mob);
  }
  override tick(): void {
    const m = this.mob;
    if (this.applyGravity && m.inWater) m.dy += 0.005;
    if (this.operation === MoveOp.MOVE_TO && !m.navigation.isDone()) {
      const d0 = this.wantedX - m.x, d1 = this.wantedY - m.y, d2 = this.wantedZ - m.z;
      if (d0 * d0 + d1 * d1 + d2 * d2 < 2.5000003e-7) {
        m.zza = 0;
        return;
      }
      const f = Math.atan2(d2, d0) * RAD - 90;
      m.yaw = rotlerp(m.yaw, f, this.maxTurnY);
      m.bodyYaw = m.yaw;
      m.headYaw = m.yaw;
      const f1 = this.speedModifier * m.moveSpeedAttr;
      if (m.inWater) {
        m.setSpeed(f1 * this.inWaterSpeed);
        const d4 = Math.sqrt(d0 * d0 + d2 * d2);
        if (Math.abs(d1) > 1e-5 || Math.abs(d4) > 1e-5) {
          const f3 = Math.max(-this.maxTurnX, Math.min(this.maxTurnX, wrapDegrees(-(Math.atan2(d1, d4) * RAD))));
          m.pitch = rotlerp(m.pitch, f3, 5);
        }
        const c = Math.cos(m.pitch / RAD), s = Math.sin(m.pitch / RAD);
        m.zza = c * f1;
        m.yya = -s * f1;
      } else {
        // vanilla getTurningSpeedFactor: full speed within 10° of its heading, none past 60°
        const turn = Math.abs(wrapDegrees(m.yaw - f));
        m.setSpeed(f1 * this.outsideWaterSpeed * (1 - Math.max(0, Math.min(1, (turn - 10) / 50))));
      }
    } else {
      m.setSpeed(0);
      m.xxa = 0;
      m.yya = 0;
      m.zza = 0;
    }
  }
}

/** vanilla LookControl.rotateTowards */
function rotateTowards(from: number, to: number, max: number): number {
  return from + Math.max(-max, Math.min(max, wrapDegrees(to - from)));
}

/**
 * vanilla SmoothSwimmingLookControl: looks a touch past what it wants (20° to the side, 10° down), levels out when it
 * isn't going anywhere, and turns its body along when its head gets more than `maxYRotFromCenter` off it
 */
export class SmoothSwimmingLookControl extends LookControl {
  constructor(mob: Mob, readonly maxYRotFromCenter: number) {
    super(mob);
  }
  override tick(): void {
    const m = this.mob;
    if (this.lookAtCooldown > 0) {
      this.lookAtCooldown--;
      const dx = this.wantedX - m.x, dy = this.wantedY - (m.y + m.eyeHeight), dz = this.wantedZ - m.z;
      if (Math.abs(dz) > 1e-5 || Math.abs(dx) > 1e-5) m.headYaw = rotateTowards(m.headYaw, Math.atan2(dz, dx) * RAD - 90 + 20, this.yMaxRotSpeed);
      const h = Math.sqrt(dx * dx + dz * dz);
      if (Math.abs(dy) > 1e-5 || Math.abs(h) > 1e-5) m.pitch = rotateTowards(m.pitch, -(Math.atan2(dy, h) * RAD) + 10, this.xMaxRotAngle);
    } else {
      if (m.navigation.isDone()) m.pitch = rotateTowards(m.pitch, 0, 5);
      m.headYaw = rotateTowards(m.headYaw, m.bodyYaw, this.yMaxRotSpeed);
    }
    const f = wrapDegrees(m.headYaw - m.bodyYaw);
    if (f < -this.maxYRotFromCenter) m.bodyYaw -= 4;
    else if (f > this.maxYRotFromCenter) m.bodyYaw += 4;
  }
}

// ---------------------------------------------------------------------------

export class Dolphin extends WaterAnimal {
  readonly type = 'dolphin';
  /** vanilla TREASURE_POS: where it's leading a player */
  treasurePos: Pos = [0, 0, 0];
  /** vanilla GOT_FISH: fed a fish, and not yet led the way */
  gotFish = false;
  /** vanilla MOISTNESS_LEVEL: how long it can stay out of the water */
  moistness = DOLPHIN_MOISTNESS;

  constructor(level: Level) {
    super(level);
    this.setSize(0.9, 0.6);
    // vanilla Dolphin.createAttributes: 10 health, 1.2 speed, 3 to bite
    this.maxHealth = this.health = 10;
    this.moveSpeedAttr = 1.2;
    this.attackDamage = 3;
    this.air = DOLPHIN_AIR;
    this.canPickUpLoot = true;
    this.moveControl = new SmoothSwimmingMoveControl(this, 85, 10, 0.02, 0.1, true);
    (this as { lookControl: LookControl }).lookControl = new SmoothSwimmingLookControl(this, 10);
  }

  override get eyeHeight(): number {
    return 0.3;
  }

  /** vanilla Dolphin.canBeLeashed: unlike the other water animals, a dolphin takes a lead */
  override canBeLeashed(): boolean {
    return true;
  }

  protected override createNavigation(): PathNavigation {
    return new WaterBoundPathNavigation(this);
  }

  protected registerGoals(): void {
    const g = this.goalSelector;
    g.addGoal(0, new BreathAirGoal(this));
    g.addGoal(0, new TryFindWaterGoal(this));
    g.addGoal(1, new DolphinSwimToTreasureGoal(this));
    g.addGoal(2, new DolphinSwimWithPlayerGoal(this, 4));
    g.addGoal(4, new RandomSwimmingGoal(this, 1, 10));
    g.addGoal(4, new RandomLookAroundGoal(this));
    g.addGoal(5, new LookAtPlayerGoal(this, 6));
    g.addGoal(5, new DolphinJumpGoal(this, 10));
    g.addGoal(6, new MeleeAttackGoal(this, 1.2, true));
    g.addGoal(8, new PlayWithItemsGoal(this));
    g.addGoal(8, new FollowBoatGoal(this));
    g.addGoal(9, new AvoidEntityGoal(this, (e) => e instanceof Guardian, 8, 1, 1));
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this, (by) => by instanceof Guardian).setAlertOthers());
  }

  /** vanilla finalizeSpawn: a full breath, level */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    this.air = DOLPHIN_AIR;
    this.pitch = 0;
    super.finalizeSpawn(reason, group);
  }

  /** vanilla canBreatheUnderwater: it breathes air */
  override canBreatheUnderwater(): boolean {
    return false;
  }
  /**
   * vanilla handleAirSupply: none of a water animal's choking on land; it holds its breath under the water like any
   * living thing (Mob.baseTick), and gets it all back at once when its head is out (increaseAirSupply)
   */
  protected override handleAirSupply(_air: number): void {
    if (this.eyeFluid !== FLUID_WATER) this.air = DOLPHIN_AIR;
  }

  /** vanilla getMaxHeadXRot / getMaxHeadYRot */
  override maxHeadXRot(): number {
    return 1;
  }
  override maxHeadYRot(): number {
    return 1;
  }

  /** vanilla Dolphin.doHurtTarget: its bite, with a click */
  override doHurtTarget(target: Entity): boolean {
    const ok = super.doHurtTarget(target);
    if (ok) this.playSound('entity.dolphin.attack', 1, 1);
    return ok;
  }

  /** vanilla Dolphin.canHoldItem: only what goes in a hand (no armour, no shield), and only with its mouth empty */
  override canHoldItem(s: ItemStack): boolean {
    return !this.mainHand && equipmentSlotForItem(s.item) === 'mainhand' && super.canHoldItem(s);
  }

  /** vanilla Dolphin.pickUpItem: into its empty mouth, the whole stack, to drop for sure */
  protected override pickUpItem(it: ItemEntity): void {
    if (this.mainHand) return;
    const s = it.stack;
    if (!this.canHoldItem(s)) return;
    this.onItemPickup(it);
    this.setItemSlot('mainhand', s.copy());
    this.setGuaranteedDrop('mainhand');
    this.take(it, s.count);
    it.remove();
  }

  /** vanilla Dolphin.tick: wet in water or rain, drying out (and flopping) on land; a wake of bubbles when it's quick */
  override tick(): void {
    super.tick();
    if (this.removed) return;
    if (this.isInWaterOrRainNow()) this.moistness = DOLPHIN_MOISTNESS;
    else {
      this.moistness--;
      if (this.moistness <= 0) this.hurt(1, 'dryOut');
      if (this.onGround) {
        this.dx += (this.random.nextFloat() * 2 - 1) * 0.2;
        this.dy += 0.5;
        this.dz += (this.random.nextFloat() * 2 - 1) * 0.2;
        this.yaw = this.random.nextFloat() * 360;
        this.onGround = false;
      }
    }
    if (this.inWater && this.dx * this.dx + this.dy * this.dy + this.dz * this.dz > 0.03) {
      const [vx, vy, vz] = this.viewVector();
      const f = Math.cos(this.yaw / RAD) * 0.3, f1 = Math.sin(this.yaw / RAD) * 0.3;
      const f2 = 1.2 - this.random.nextFloat() * 0.7;
      const ps = this.level.particles;
      for (let i = 0; i < 2; i++) {
        ps.spawn?.('dolphin', this.x - vx * f2 + f, this.y - vy, this.z - vz * f2 + f1, 0, 0, 0);
        ps.spawn?.('dolphin', this.x - vx * f2 - f, this.y - vy, this.z - vz * f2 - f1, 0, 0, 0);
      }
    }
  }

  /** vanilla getViewVector(0): where its head points */
  private viewVector(): Pos {
    const p = this.pitch / RAD, y = -this.headYaw / RAD;
    return [Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
  }

  /** vanilla entity event 38: happy sparkles about it (the way to treasure) */
  happyParticles(): void {
    const r = this.random;
    for (let i = 0; i < 7; i++)
      this.level.particles.spawn?.('happy_villager', this.x + (r.nextDouble() * 2 - 1) * this.width, this.y + r.nextDouble() * this.height + 0.2, this.z + (r.nextDouble() * 2 - 1) * this.width, r.gaussian() * 0.01, r.gaussian() * 0.01, r.gaussian() * 0.01);
  }

  /** vanilla Dolphin.mobInteract: a fish, eaten (it will lead the way to treasure) */
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (!stack || !FISHES.has(stack.item.id)) return false;
    this.playSound('entity.dolphin.eat', 1, 1);
    this.gotFish = true;
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    return true;
  }

  override hurtSound(): string {
    return 'entity.dolphin.hurt';
  }
  override deathSound(): string {
    return 'entity.dolphin.death';
  }
  override ambientSound(): string {
    return this.inWater ? 'entity.dolphin.ambient_water' : 'entity.dolphin.ambient';
  }
  /** vanilla getSwimSplashSound (a fast splash stays the generic one) */
  protected override swimSplashSound(): string {
    return 'entity.dolphin.splash';
  }
  /** vanilla getSwimSound: entity.dolphin.swim, as loud as it's fast */
  protected override playSwimSound(): void {
    const v = Math.min(1, Math.sqrt(this.dx * this.dx * 0.2 + this.dy * this.dy + this.dz * this.dz * 0.2) * 0.35);
    this.playSound('entity.dolphin.swim', v, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.4);
  }
  protected override playStepSound(): void {}

  /** vanilla closeToNextPos: its path's end within 12 blocks */
  closeToNextPos(): boolean {
    const t = this.navigation.targetPos;
    return !!t && (t[0] + 0.5 - this.x) ** 2 + (t[1] + 0.5 - this.y) ** 2 + (t[2] + 0.5 - this.z) ** 2 < 144;
  }

  /** vanilla Dolphin.travel: in water a push along its input at its own speed, a tenth off a tick, sinking a little without a target */
  override travel(sx: number, sy: number, sz: number): void {
    if (this.inWater) {
      this.moveRelative(this.speed, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      this.dx *= 0.9;
      this.dy *= 0.9;
      this.dz *= 0.9;
      if (!this.target) this.dy -= 0.005;
    } else super.travel(sx, sy, sz);
  }

  /** (for its goals: vanilla moveRelative(amount, (xxa, yya, zza)) then move by its motion) */
  pushAlong(amount: number): void {
    this.moveRelative(amount, this.xxa, this.yya, this.zza);
    this.move(this.dx, this.dy, this.dz);
  }

  /** vanilla loot_tables/entities/dolphin: a cod now and then (cooked if it burned) */
  override lootTable(): LootEntry[] {
    return [{ item: 'cod', min: 0, max: 1, cooked: 'cooked_cod' }];
  }

  protected override saveData(): Record<string, number | string | boolean> | undefined {
    const [x, y, z] = this.treasurePos;
    return { ...super.saveData(), TreasurePosX: x, TreasurePosY: y, TreasurePosZ: z, GotFish: this.gotFish, Moistness: this.moistness, Air: this.air };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.treasurePos = [Number(d.TreasurePosX ?? 0), Number(d.TreasurePosY ?? 0), Number(d.TreasurePosZ ?? 0)];
    this.gotFish = d.GotFish === true;
    if (typeof d.Moistness === 'number') this.moistness = d.Moistness;
    if (typeof d.Air === 'number') this.air = d.Air;
  }
}

// ---------------------------------------------------------------------------
// the goals

/** is this player swimming (vanilla isSwimming: sprinting under the water; the game has no swimming pose, so that's all) */
function isSwimming(p: Player): boolean {
  return p.swimming || (p.sprinting && !p.flying && p.inWater && p.eyeFluid === FLUID_WATER && !p.vehicle);
}

/** vanilla BreathAirGoal: nearly out of breath, it makes for the nearest air above (or straight up 8) */
class BreathAirGoal extends Goal {
  constructor(readonly mob: Dolphin) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    return this.mob.air < 140;
  }
  override canContinueToUse(): boolean {
    return this.canUse();
  }
  override isInterruptable(): boolean {
    return false;
  }
  override start(): void {
    this.findAirPosition();
  }
  private findAirPosition(): void {
    const m = this.mob;
    const x0 = Math.floor(m.x - 1), x1 = Math.floor(m.x + 1), y0 = Math.floor(m.y), y1 = Math.floor(m.y + 8), z0 = Math.floor(m.z - 1), z1 = Math.floor(m.z + 1);
    let found: Pos | null = null;
    // (vanilla BlockPos.betweenClosed: x fastest, then y, then z)
    for (let z = z0; z <= z1 && !found; z++)
      for (let y = y0; y <= y1 && !found; y++)
        for (let x = x0; x <= x1 && !found; x++) if (givesAir(m.level, x, y, z)) found = [x, y, z];
    const [x, y, z] = found ?? [Math.floor(m.x), Math.floor(m.y + 8), Math.floor(m.z)];
    m.navigation.moveTo(x, y + 1, z, 1);
  }
  override tick(): void {
    this.findAirPosition();
    this.mob.pushAlong(0.02);
  }
}

/** vanilla BreathAirGoal.givesAir: no fluid (or a bubble column), and open to walk through (isPathfindable(LAND)) */
function givesAir(level: Level, x: number, y: number, z: number): boolean {
  const st = level.getState(x, y, z);
  if (FLAGS[st] & F_WATER && BLOCKS[STATE_BLOCK[st]].name !== 'bubble_column') return false;
  return !(FLAGS[st] & F_FULL_COLLISION);
}

/** vanilla TryFindWaterGoal: stranded on the ground, it heads for any water within two blocks */
class TryFindWaterGoal extends Goal {
  constructor(readonly mob: Dolphin) {
    super();
  }
  canUse(): boolean {
    const m = this.mob;
    return m.onGround && !(FLAGS[m.level.getState(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z))] & F_WATER);
  }
  override start(): void {
    const m = this.mob;
    const x0 = Math.floor(m.x - 2), x1 = Math.floor(m.x + 2), y0 = Math.floor(m.y - 2), y1 = Math.floor(m.y), z0 = Math.floor(m.z - 2), z1 = Math.floor(m.z + 2);
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          if (FLAGS[m.level.getState(x, y, z)] & F_WATER) {
            m.moveControl.setWantedPosition(x, y, z, 1);
            return;
          }
  }
}

/**
 * vanilla Dolphin.DolphinSwimToTreasureGoal: fed a fish (and with breath to spare), it finds the nearest ocean ruin
 * or shipwreck and swims there a leg at a time, sparkling now and then; there (or stuck), it's done
 */
class DolphinSwimToTreasureGoal extends Goal {
  private stuck = false;
  constructor(readonly dolphin: Dolphin) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  override isInterruptable(): boolean {
    return false;
  }
  canUse(): boolean {
    return this.dolphin.gotFish && this.dolphin.air >= 100;
  }
  private arrived(): boolean {
    const d = this.dolphin, [tx, , tz] = d.treasurePos;
    return (tx + 0.5 - d.x) ** 2 + (Math.floor(d.y) + 0.5 - d.y) ** 2 + (tz + 0.5 - d.z) ** 2 < 16;
  }
  override canContinueToUse(): boolean {
    return !this.arrived() && !this.stuck && this.dolphin.air >= 100;
  }
  override start(): void {
    const d = this.dolphin;
    this.stuck = false;
    d.navigation.stop();
    const t = dolphinHooks.findTreasure?.(d.level, Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) ?? null;
    if (t) {
      d.treasurePos = t;
      d.happyParticles();
    } else this.stuck = true;
  }
  override stop(): void {
    if (this.arrived() || this.stuck) this.dolphin.gotFish = false;
  }
  override tick(): void {
    const d = this.dolphin;
    if (!d.closeToNextPos() && !d.navigation.isDone()) return;
    const [tx, , tz] = d.treasurePos;
    let p = defaultRandomPosTowards(d, 16, 1, tx + 0.5, tz + 0.5, Math.PI / 8) ?? defaultRandomPosTowards(d, 8, 4, tx + 0.5, tz + 0.5, Math.PI / 2);
    if (p && !(FLAGS[d.level.getState(p[0], p[1], p[2])] & F_WATER)) p = defaultRandomPosTowards(d, 8, 5, tx + 0.5, tz + 0.5, Math.PI / 2);
    if (!p) {
      this.stuck = true;
      return;
    }
    d.lookControl.setLookAt(p[0] + 0.5, p[1], p[2] + 0.5, d.maxHeadYRot() + 20, d.maxHeadXRot());
    d.navigation.moveTo(p[0] + 0.5, p[1], p[2] + 0.5, 1.3);
    if (d.random.nextInt(this.adjustedTickDelay(80)) === 0) d.happyParticles();
  }
}

/** vanilla Dolphin.DolphinSwimWithPlayerGoal: a swimming player within 10 blocks: it keeps by them, lending them grace */
class DolphinSwimWithPlayerGoal extends Goal {
  private player: Player | null = null;
  constructor(readonly dolphin: Dolphin, readonly speed: number) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const d = this.dolphin, p = d.level.player;
    this.player = p && p.gameMode !== 'spectator' && p.isAlive && d.distanceToSqr(p.x, p.y, p.z) <= 100 ? p : null;
    return !!this.player && isSwimming(this.player) && d.target !== this.player;
  }
  override canContinueToUse(): boolean {
    const p = this.player;
    return !!p && isSwimming(p) && this.dolphin.distanceToSqr(p.x, p.y, p.z) < 256;
  }
  override start(): void {
    this.player?.addEffect(new MobEffectInstance(MOB_EFFECTS.dolphins_grace, 100), this.dolphin);
  }
  override stop(): void {
    this.player = null;
    this.dolphin.navigation.stop();
  }
  override tick(): void {
    const d = this.dolphin, p = this.player;
    if (!p) return;
    d.lookControl.setLookAtEntity(p, d.maxHeadYRot() + 20, d.maxHeadXRot());
    if (d.distanceToSqr(p.x, p.y, p.z) < 6.25) d.navigation.stop();
    else d.navigation.moveToEntity(p, this.speed);
    if (isSwimming(p) && d.level.random.nextInt(6) === 0) p.addEffect(new MobEffectInstance(MOB_EFFECTS.dolphins_grace, 100), d);
  }
}

/** vanilla Dolphin.ALLOWED_ITEMS: an item in the water it can take */
const playable = (e: Entity): boolean => e instanceof ItemEntity && !e.removed && e.pickupDelay <= 0 && e.inWater;

/** vanilla Dolphin.PlayWithItemsGoal: it swims to items in the water, noses them up and tosses them on */
class PlayWithItemsGoal extends Goal {
  private cooldown = 0;
  constructor(readonly dolphin: Dolphin) {
    super();
  }
  private items(): ItemEntity[] {
    return this.dolphin.level.getEntities(this.dolphin.bb.inflate(8), playable) as ItemEntity[];
  }
  canUse(): boolean {
    if (this.cooldown > this.dolphin.tickCount) return false;
    return this.items().length > 0 || !!this.dolphin.mainHand;
  }
  override start(): void {
    const d = this.dolphin, list = this.items();
    if (list.length) {
      d.navigation.moveToEntity(list[0], 1.2);
      d.playSound('entity.dolphin.play', 1, 1);
    }
    this.cooldown = 0;
  }
  override stop(): void {
    const d = this.dolphin;
    if (d.mainHand) {
      this.drop(d.mainHand);
      d.setItemSlot('mainhand', null);
      this.cooldown = d.tickCount + d.random.nextInt(100);
    }
  }
  override tick(): void {
    const d = this.dolphin, list = this.items();
    if (d.mainHand) {
      this.drop(d.mainHand);
      d.setItemSlot('mainhand', null);
    } else if (list.length) d.navigation.moveToEntity(list[0], 1.2);
  }
  /** vanilla drop: tossed from just below its eyes, ahead of it with a little spin, not to be picked up for 2 s */
  private drop(stack: ItemStack): void {
    const d = this.dolphin;
    const it = new ItemEntity(d.level, stack);
    it.moveTo(d.x, d.y + d.eyeHeight - 0.3, d.z, 0, 0);
    it.pickupDelay = 40;
    it.thrower = d;
    const f1 = d.random.nextFloat() * Math.PI * 2, f2 = 0.02 * d.random.nextFloat();
    const yr = d.yaw / RAD, xr = d.pitch / RAD;
    it.dx = 0.3 * -Math.sin(yr) * Math.cos(xr) + Math.cos(f1) * f2;
    it.dy = 0.3 * Math.sin(xr) * 1.5;
    it.dz = 0.3 * Math.cos(yr) * Math.cos(xr) + Math.sin(f1) * f2;
    d.level.addEntity(it);
  }
}

/** vanilla Direction.fromYRot: the way it faces, as a step (south +z, west -x, north -z, east +x) */
function facingStep(yaw: number): [number, number] {
  return ([[0, 1], [-1, 0], [0, -1], [1, 0]] as [number, number][])[Math.floor(yaw / 90 + 0.5) & 3];
}

/**
 * vanilla DolphinJumpGoal: now and then, with open water ahead (at 0, 1, 4-7 blocks) and open air over it, it leaps
 * up and forward out of the water, nose along its flight, a splash as it breaks the surface
 */
class DolphinJumpGoal extends Goal {
  private static readonly STEPS = [0, 1, 4, 5, 6, 7];
  private readonly interval: number;
  private breached = false;
  constructor(readonly dolphin: Dolphin, interval: number) {
    super();
    this.interval = reducedTickDelay(interval);
    this.flags = Flag.MOVE | Flag.JUMP;
  }
  canUse(): boolean {
    const d = this.dolphin;
    if (d.random.nextInt(this.interval) !== 0) return false;
    const [sx, sz] = facingStep(d.yaw);
    const x = Math.floor(d.x), y = Math.floor(d.y), z = Math.floor(d.z);
    const w = d.level;
    for (const k of DolphinJumpGoal.STEPS) {
      const px = x + sx * k, pz = z + sz * k;
      const st = w.getState(px, y, pz);
      if (!(FLAGS[st] & F_WATER) || COLLISION[st]?.length) return false;
      if (!(FLAGS[w.getState(px, y + 1, pz)] & F_AIR) || !(FLAGS[w.getState(px, y + 2, pz)] & F_AIR)) return false;
    }
    return true;
  }
  override canContinueToUse(): boolean {
    const d = this.dolphin;
    return (!(d.dy * d.dy < 0.03) || d.pitch === 0 || !(Math.abs(d.pitch) < 10) || !d.inWater) && !d.onGround;
  }
  override isInterruptable(): boolean {
    return false;
  }
  override start(): void {
    const d = this.dolphin, [sx, sz] = facingStep(d.yaw);
    d.dx += sx * 0.6;
    d.dy += 0.7;
    d.dz += sz * 0.6;
    d.navigation.stop();
  }
  override stop(): void {
    this.dolphin.pitch = 0;
  }
  override tick(): void {
    const d = this.dolphin;
    const was = this.breached;
    if (!was) this.breached = (FLAGS[d.level.getState(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z))] & F_WATER) !== 0;
    if (this.breached && !was) d.playSound('entity.dolphin.jump', 1, 1);
    if (d.dy * d.dy < 0.03 && d.pitch !== 0) d.pitch = rotlerpLinear(0.2, d.pitch, 0);
    else if (d.dx * d.dx + d.dy * d.dy + d.dz * d.dz > 1e-10) d.pitch = Math.atan2(-d.dy, Math.sqrt(d.dx * d.dx + d.dz * d.dz)) * RAD;
  }
}

/** vanilla Mth.rotLerp(delta, start, end) */
function rotlerpLinear(delta: number, start: number, end: number): number {
  return start + delta * wrapDegrees(end - start);
}

/**
 * vanilla FollowBoatGoal: with someone rowing a boat within 5 blocks, it swims up behind the boat, then on ahead
 * of it the way it's going (back behind it if it falls 12 blocks off)
 */
class FollowBoatGoal extends Goal {
  private timeToRecalcPath = 0;
  private following: Player | null = null;
  private inBoatDirection = false;
  constructor(readonly mob: Dolphin) {
    super();
  }
  private static rowing(p: Player | null): boolean {
    return !!p && (Math.abs(p.xxa) > 0 || Math.abs(p.zza) > 0);
  }
  private rowers(): Player[] {
    const out: Player[] = [];
    for (const b of this.mob.level.getEntities(this.mob.bb.inflate(5), (e) => e instanceof Boat)) {
      const c = b.controllingPassenger();
      if (c && c.type === 'player') out.push(c as Player);
    }
    return out;
  }
  canUse(): boolean {
    return FollowBoatGoal.rowing(this.following) || this.rowers().some((p) => FollowBoatGoal.rowing(p));
  }
  override canContinueToUse(): boolean {
    const p = this.following;
    return !!p && !!p.vehicle && FollowBoatGoal.rowing(p);
  }
  override start(): void {
    this.following = this.rowers()[0] ?? null;
    this.timeToRecalcPath = 0;
    this.inBoatDirection = false;
  }
  override stop(): void {
    this.following = null;
  }
  override tick(): void {
    const p = this.following, m = this.mob;
    if (!p) return;
    const rowing = FollowBoatGoal.rowing(p);
    m.pushAlong(this.inBoatDirection ? (rowing ? 0.01 : 0) : 0.015);
    if (--this.timeToRecalcPath > 0) return;
    this.timeToRecalcPath = this.adjustedTickDelay(10);
    const [sx, sz] = facingStep(p.yaw);
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const dist = Math.sqrt(m.distanceToSqr(p.x, p.y, p.z));
    if (!this.inBoatDirection) {
      // behind the boat, a block down
      m.navigation.moveTo(bx - sx, by - 1, bz - sz, 1);
      if (dist < 4) {
        this.timeToRecalcPath = 0;
        this.inBoatDirection = true;
      }
    } else {
      m.navigation.moveTo(bx + sx * 10, by - 1, bz + sz * 10, 1);
      if (dist > 12) {
        this.timeToRecalcPath = 0;
        this.inBoatDirection = false;
      }
    }
  }
}

