// The shulker (vanilla Shulker): the End city's sentry, a box that clings to the side of a block. Now and then it
// peeks out of its shell, and when a player comes near it opens right up — its lid rising a whole block, turning as it
// goes — and fires homing bullets that set whatever they hit floating (game/shulkerBullet). Shut, it wears 20 armour
// and arrows glance off it. It never moves on its own: pushed off its block, hurt badly, or hit by a bullet it
// teleports up to 8 blocks away to another surface — and a shulker that teleports from a bullet's hit may leave a
// copy of itself behind (1.17+), less likely the more of them are about. Undyed it's the End's lavender; the other 16
// colours come from commands. It drops its shell half the time.

import type { Level } from '../game/level';
import { PathfinderMob, type LootEntry, type MobCategory, type SpawnGroup, type SpawnReason } from './mob';
import type { Entity } from './entity';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { HurtByTargetGoal, LookAtPlayerGoal, NearestAttackablePlayerGoal, RandomLookAroundGoal } from './ai/goals';
import { LookControl } from './ai/controls';
import { Arrow } from './arrow';
import { ShulkerBullet } from './shulkerBullet';
import { AABB } from '../core/aabb';
import { wrapDegrees } from '../core/math';
import { FLAGS, F_AIR } from '../world/block';
import { collisionFaceFull } from '../world/dynamicShapes';
import { progressDeltaBox } from '../world/shulkerBoxEntity';
import { SHULKER_COLORS } from '../world/blocksShulker';
import { AXIS_OF, DIR_NAMES, DOWN, DX, DY, DZ, OPPOSITE, type Dir } from '../world/dir';

const RAD = 180 / Math.PI;

/** vanilla getPhysicalPeek: how far out the lid stands (0 shut, a whole block fully open) for a peek of 0..1 */
export function physicalPeek(peek: number): number {
  return 0.5 - Math.sin((0.5 + peek) * Math.PI) * 0.5;
}

/** vanilla LookControl.rotateTowards */
function rotateTowards(from: number, to: number, max: number): number {
  const f = wrapDegrees(to - from);
  return from + Math.max(-max, Math.min(max, f));
}

type Vec = [number, number, number];

/**
 * for a shulker opening toward each direction (vanilla Direction.getRotation applied to SOUTH, and the direction's
 * normal crossed with that): the "forward" and "right" of the face it sits on, that its head turns in
 */
const LOOK_FRAME: [Vec, Vec][] = (() => {
  const rx = (a: number, [x, y, z]: Vec): Vec => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  const rz = (a: number, [x, y, z]: Vec): Vec => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
  const rot: ((v: Vec) => Vec)[] = [
    (v) => rx(Math.PI, v), // down
    (v) => v, // up
    (v) => rx(Math.PI / 2, rz(Math.PI, v)), // north
    (v) => rx(Math.PI / 2, v), // south
    (v) => rx(Math.PI / 2, rz(Math.PI / 2, v)), // west
    (v) => rx(Math.PI / 2, rz(-Math.PI / 2, v)), // east
  ];
  return rot.map((r, d) => {
    const f = r([0, 0, 1]).map((c) => Math.round(c)) as Vec;
    const n: Vec = [DX[d], DY[d], DZ[d]];
    const right: Vec = [n[1] * f[2] - n[2] * f[1], n[2] * f[0] - n[0] * f[2], n[0] * f[1] - n[1] * f[0]];
    return [f, right];
  });
})();

/**
 * vanilla Shulker.ShulkerLookControl: its head turns about the face it clings to (never up or down), as far round as
 * it likes, with no body to keep it in line
 */
class ShulkerLookControl extends LookControl {
  constructor(readonly shulker: Shulker) {
    super(shulker);
  }

  override tick(): void {
    const m = this.shulker;
    if (this.resetXRotOnTick()) m.pitch = 0;
    if (this.lookAtCooldown > 0) {
      this.lookAtCooldown--;
      const y = m.lookYaw(this.wantedX, this.wantedY, this.wantedZ);
      if (y !== null) m.headYaw = rotateTowards(m.headYaw, y, this.yMaxRotSpeed);
      m.pitch = rotateTowards(m.pitch, 0, this.xMaxRotAngle);
    } else {
      m.headYaw = rotateTowards(m.headYaw, m.bodyYaw, 10);
    }
    // (vanilla clampHeadRotationToBody: nothing to clamp to)
  }
}

/**
 * vanilla Shulker.ShulkerAttackGoal: with a target, open right up and turn to face it; while it's within 20 blocks, a
 * bullet every 1 to 5.5 seconds (and forget it once it's further)
 */
class ShulkerAttackGoal extends Goal {
  private attackTime = 0;
  constructor(readonly shulker: Shulker) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const t = this.shulker.target;
    return !!t && t.isAlive && this.shulker.level.difficulty !== 'peaceful';
  }
  override start(): void {
    this.attackTime = 20;
    this.shulker.setRawPeekAmount(100);
  }
  override stop(): void {
    this.shulker.setRawPeekAmount(0);
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const s = this.shulker;
    if (s.level.difficulty === 'peaceful') return;
    this.attackTime--;
    const t = s.target;
    if (!t) return;
    s.lookControl.setLookAtEntity(t, 180, 180);
    if (s.distanceToSqr(t.x, t.y, t.z) < 400) {
      if (this.attackTime <= 0) {
        this.attackTime = 20 + (s.random.nextInt(10) * 20) / 2;
        s.level.addEntity(new ShulkerBullet(s.level, s, t, AXIS_OF[s.attachFace]));
        s.playSound('entity.shulker.shoot', 2, (s.random.nextFloat() - s.random.nextFloat()) * 0.2 + 1);
      }
    } else s.setTarget(null);
  }
}

/** vanilla Shulker.ShulkerPeekGoal: with nothing to fight, now and then open up a little for one to three seconds */
class ShulkerPeekGoal extends Goal {
  private peekTime = 0;
  constructor(readonly shulker: Shulker) {
    super();
  }
  canUse(): boolean {
    const s = this.shulker;
    return s.target === null && s.random.nextInt(reducedTickDelay(40)) === 0 && s.canStayAt(s.blockX, s.blockY, s.blockZ, s.attachFace);
  }
  override canContinueToUse(): boolean {
    return this.shulker.target === null && this.peekTime > 0;
  }
  override start(): void {
    this.peekTime = this.adjustedTickDelay(20 * (1 + this.shulker.random.nextInt(3)));
    this.shulker.setRawPeekAmount(30);
  }
  override stop(): void {
    if (this.shulker.target === null) this.shulker.setRawPeekAmount(0);
  }
  override tick(): void {
    this.peekTime--;
  }
}

export class Shulker extends PathfinderMob {
  readonly type = 'shulker';
  // (vanilla: an AbstractGolem that is an Enemy, in the MONSTER category)
  readonly category: MobCategory = 'monster';
  /** vanilla DATA_ATTACH_FACE_ID: the side of its block it clings to (the block that way holds it up) */
  attachFace: Dir = DOWN;
  /** vanilla DATA_PEEK_ID: how far it means to open, 0 (shut) to 100 */
  private rawPeek = 0;
  /** vanilla currentPeekAmount(O): how far open it is, easing toward rawPeek / 100 a twentieth a tick */
  peek = 0;
  peekO = 0;
  /** vanilla DATA_COLOR_ID: its dye colour, null for the End's own lavender */
  color: string | null = null;
  /** vanilla COVERED_ARMOR_MODIFIER: +20 armour while shut (from the first time it shuts) */
  private covered = false;
  /** vanilla clientOldAttachPosition / clientSideTeleportInterpolation: the block it left, and the 6 ticks it glides from there */
  oldAttach: [number, number, number] | null = null;
  teleportInterp = 0;

  constructor(level: Level) {
    super(level);
    this.setSize(1, 1);
    this.maxHealth = this.health = 30;
    this.xpReward = 5;
    (this as unknown as { lookControl: LookControl }).lookControl = new ShulkerLookControl(this);
    // vanilla getDeltaMovement / setDeltaMovement: it has no motion of its own, and nothing gives it any (no gravity,
    // no knockback, no pushing)
    for (const k of ['dx', 'dy', 'dz']) Object.defineProperty(this, k, { get: () => 0, set: () => {}, configurable: true, enumerable: true });
    this.refreshBoundingBox();
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new LookAtPlayerGoal(this, 8, 0.02, true));
    this.goalSelector.addGoal(4, new ShulkerAttackGoal(this));
    this.goalSelector.addGoal(7, new ShulkerPeekGoal(this));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
    // (a shulker's own bullet doesn't turn another against it)
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this, (by) => by instanceof Shulker).setAlertOthers());
    // (vanilla ShulkerNearestAttackGoal: its search box is never used for players; none in peaceful)
    this.targetSelector.addGoal(2, new NearestAttackablePlayerGoal(this, true));
    // (vanilla ShulkerDefenseAttackGoal only works for a shulker on a team)
  }

  // --- shape and place ------------------------------------------------------

  override get eyeHeight(): number {
    return 0.5;
  }

  /** vanilla makeBoundingBox: its block, and the lid's reach out from the face it clings to */
  private refreshBoundingBox(): void {
    this.bb = progressDeltaBox(DIR_NAMES[OPPOSITE[this.attachFace]], -1, physicalPeek(this.peek)).move(this.x - 0.5, this.y, this.z - 0.5);
  }

  /** vanilla setAttachFace (onSyncedDataUpdated: the box follows) */
  setAttachFace(d: Dir): void {
    this.attachFace = d;
    this.refreshBoundingBox();
  }

  /**
   * vanilla Shulker.setPos: always the middle of a block (unless riding); moved to another block it's shut at once,
   * and glides in from the old one over 6 ticks
   */
  override setPos(x: number, y: number, z: number): void {
    const ox = Math.floor(this.x), oy = Math.floor(this.y), oz = Math.floor(this.z);
    if (this.vehicle) {
      this.x = x;
      this.y = y;
      this.z = z;
    } else {
      this.x = Math.floor(x) + 0.5;
      this.y = Math.floor(y + 0.5);
      this.z = Math.floor(z) + 0.5;
    }
    this.refreshBoundingBox();
    if (this.tickCount === 0) return;
    const nx = Math.floor(this.x), ny = Math.floor(this.y), nz = Math.floor(this.z);
    if (nx === ox && ny === oy && nz === oz) return;
    this.rawPeek = 0;
    const o = this.oldAttach;
    if (!this.vehicle && !(o && o[0] === nx && o[1] === ny && o[2] === nz)) {
      this.oldAttach = [ox, oy, oz];
      this.teleportInterp = 6;
      this.xo = this.x;
      this.yo = this.y;
      this.zo = this.z;
    }
  }

  /** vanilla getRenderPosition: while it glides in after a teleport, how far back toward the old block it's drawn */
  renderOffset(partial: number): [number, number, number] | null {
    const o = this.oldAttach;
    if (!o || this.teleportInterp <= 0) return null;
    let d = (this.teleportInterp - partial) / 6;
    d *= d;
    return [-(Math.floor(this.x) - o[0]) * d, -(Math.floor(this.y) - o[1]) * d, -(Math.floor(this.z) - o[2]) * d];
  }

  /**
   * vanilla canStayAt: its block is empty, the block on the `face` side has a whole side toward it, and there's room
   * for it to open right up
   */
  canStayAt(x: number, y: number, z: number, face: Dir): boolean {
    const w = this.level.world;
    // (vanilla isPositionBlocked: anything but air — a piston moving it along aside)
    if (!(FLAGS[w.getState(x, y, z)] & F_AIR)) return false;
    const nx = x + DX[face], ny = y + DY[face], nz = z + DZ[face];
    if (!w.isLoaded(nx, nz) || !collisionFaceFull(w, nx, ny, nz, OPPOSITE[face])) return false;
    return this.noCollision(progressDeltaBox(DIR_NAMES[OPPOSITE[face]], -1, 1).move(x, y, z).inflate(-1e-6));
  }

  /** vanilla Level.noCollision: no block in the way, nor anything solid (a boat, another shulker) */
  private noCollision(box: AABB): boolean {
    return this.collisionBoxes(box).length === 0;
  }

  /** vanilla findAttachableSurface: the first side it could cling to here (down, up, north, south, west, east) */
  private findAttachableSurface(x: number, y: number, z: number): Dir | null {
    for (let d = 0; d < 6; d++) if (this.canStayAt(x, y, z, d as Dir)) return d as Dir;
    return null;
  }

  /** vanilla findNewAttachment: another side of its block, or somewhere else altogether */
  private findNewAttachment(): void {
    const d = this.findAttachableSurface(this.blockX, this.blockY, this.blockZ);
    if (d !== null) this.setAttachFace(d);
    else this.teleportSomewhere();
  }

  /**
   * vanilla teleportSomewhere: five tries at an empty block up to 8 away on each axis that it could cling to; there
   * it goes, shut, forgetting whoever it was fighting
   */
  teleportSomewhere(): boolean {
    if (!this.isAlive) return false;
    const w = this.level.world, r = this.random;
    const bx = this.blockX, by = this.blockY, bz = this.blockZ;
    for (let i = 0; i < 5; i++) {
      const x = bx + r.nextInt(17) - 8, y = by + r.nextInt(17) - 8, z = bz + r.nextInt(17) - 8;
      if (y <= w.dim.minY || !(FLAGS[w.getState(x, y, z)] & F_AIR) || !this.noCollision(new AABB(x, y, z, x + 1, y + 1, z + 1).inflate(-1e-6))) continue;
      const d = this.findAttachableSurface(x, y, z);
      if (d === null) continue;
      // (vanilla unRide)
      this.ejectPassengers();
      if (this.vehicle) this.stopRiding();
      this.setAttachFace(d);
      this.playSound('entity.shulker.teleport', 1, 1);
      this.setPos(x + 0.5, y, z + 0.5);
      this.level.gameEvent?.('teleport', bx + 0.5, by + 0.5, bz + 0.5, { entity: this });
      this.rawPeek = 0;
      this.setTarget(null);
      return true;
    }
    return false;
  }

  /** vanilla move(MoverType.SHULKER_BOX): a shulker box's lid rising into it sends it off elsewhere */
  moveByShulkerBox(): void {
    this.teleportSomewhere();
  }

  override startRiding(vehicle: Entity, force = false): boolean {
    this.oldAttach = null;
    this.teleportInterp = 0;
    this.setAttachFace(DOWN);
    return super.startRiding(vehicle, force);
  }

  override stopRiding(): void {
    super.stopRiding();
    this.oldAttach = [this.blockX, this.blockY, this.blockZ];
    this.bodyYaw = this.bodyYawO = 0;
  }

  /** vanilla finalizeSpawn: it starts out facing south */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    this.yaw = this.yawO = 0;
    this.headYaw = this.headYawO = 0;
    super.finalizeSpawn(reason, group);
  }

  // --- opening --------------------------------------------------------------

  isClosed(): boolean {
    return this.rawPeek === 0;
  }

  /** vanilla setRawPeekAmount: open (a little or all the way) or shut, with its sound; shut, it's armoured */
  setRawPeekAmount(n: number): void {
    this.covered = n === 0;
    this.baseArmor = this.covered ? 20 : 0;
    this.playSound(n === 0 ? 'entity.shulker.close' : 'entity.shulker.open', 1, 1);
    this.rawPeek = n;
  }

  /** vanilla getClientPeekAmount */
  peekAt(partial: number): number {
    return this.peekO + (this.peek - this.peekO) * partial;
  }

  /** vanilla updatePeekAmount: a twentieth of the way a tick (float arithmetic, as vanilla's) */
  private updatePeekAmount(): boolean {
    this.peekO = this.peek;
    const f = Math.fround(Math.fround(this.rawPeek) * Math.fround(0.01));
    if (this.peek === f) return false;
    if (this.peek > f) this.peek = Math.max(f, Math.min(1, Math.fround(this.peek - Math.fround(0.05))));
    else this.peek = Math.max(0, Math.min(f, Math.fround(this.peek + Math.fround(0.05))));
    return true;
  }

  /** vanilla onPeekAmountChange: the box grows with the lid, which lifts whatever is in its way (not other shulkers) */
  private onPeekAmountChange(): void {
    this.refreshBoundingBox();
    const f = physicalPeek(this.peek), f1 = physicalPeek(this.peekO);
    const d = OPPOSITE[this.attachFace];
    const f2 = f - f1;
    if (f2 <= 0) return;
    const box = progressDeltaBox(DIR_NAMES[d], f1, f).move(this.x - 0.5, this.y, this.z - 0.5);
    const lifted = this.level.getEntities(box, (e) => !(e instanceof Shulker) && !e.noPhysics && (e as { gameMode?: string }).gameMode !== 'spectator' && !e.isPassengerOfSameVehicle(this), this);
    for (const e of lifted) e.move(f2 * DX[d], f2 * DY[d], f2 * DZ[d]);
  }

  /** vanilla ShulkerLookControl.getYRotD: the yaw toward (x, y, z) about the face it clings to */
  lookYaw(x: number, y: number, z: number): number | null {
    const [f, r] = LOOK_FRAME[OPPOSITE[this.attachFace]];
    const dx = x - this.x, dy = y - (this.y + this.eyeHeight), dz = z - this.z;
    const a = r[0] * dx + r[1] * dy + r[2] * dz, b = f[0] * dx + f[1] * dy + f[2] * dz;
    if (Math.abs(a) <= 1e-5 && Math.abs(b) <= 1e-5) return null;
    return Math.atan2(-a, b) * RAD;
  }

  override tick(): void {
    super.tick();
    if (this.removed) return;
    if (!this.vehicle && !this.canStayAt(this.blockX, this.blockY, this.blockZ, this.attachFace)) this.findNewAttachment();
    if (this.updatePeekAmount()) this.onPeekAmountChange();
    if (this.teleportInterp > 0) this.teleportInterp--;
    else this.oldAttach = null;
  }

  /** vanilla Shulker.createBodyControl: its shell never turns */
  protected override updateBodyRotation(): void {}

  override maxHeadXRot(): number {
    return 180;
  }
  override maxHeadYRot(): number {
    return 180;
  }

  // --- being hit ------------------------------------------------------------

  /**
   * vanilla Shulker.hurt: arrows glance off it while it's shut; badly hurt (under half health) it teleports one time
   * in four, and otherwise a bullet's hit sends it off — maybe leaving a copy behind
   */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isClosed() && direct instanceof Arrow) return false;
    if (!super.hurt(amount, source, attacker, direct)) return false;
    if (this.health < this.maxHealth * 0.5 && this.random.nextInt(4) === 0) this.teleportSomewhere();
    else if (direct?.type === 'shulker_bullet') this.hitByShulkerBullet();
    return true;
  }

  /**
   * vanilla hitByShulkerBullet (1.17+): an open shulker a bullet hits teleports, and in the spot it left a new one
   * appears, of its colour — unless the crowd about it says no: never with 6 or more within 8 blocks, and less likely
   * the more there are
   */
  private hitByShulkerBullet(): void {
    const x = this.x, y = this.y, z = this.z;
    const box = this.bb;
    if (this.isClosed() || !this.teleportSomewhere()) return;
    const i = this.level.getEntities(box.inflate(8), (e) => e instanceof Shulker && e.isAlive).length;
    const f = (i - 1) / 5;
    if (this.level.random.nextFloat() < f) return;
    const s = new Shulker(this.level);
    s.color = this.color;
    s.moveTo(x, y, z);
    this.level.addEntity(s);
  }

  override canBeCollidedWith(): boolean {
    return this.isAlive;
  }

  /** vanilla push(Entity): nothing pushes it */
  override pushAgainst(_e: Entity): void {}

  override fireImmune(): boolean {
    return true;
  }

  /** vanilla AbstractGolem.removeWhenFarAway: it stays */
  override removeWhenFarAway(_d2: number): boolean {
    return false;
  }

  // --- sounds and loot --------------------------------------------------------

  override ambientSoundInterval(): number {
    return 120;
  }
  override ambientSound(): string {
    return 'entity.shulker.ambient';
  }
  /** vanilla playAmbientSound: silent while shut */
  override playAmbientSound(): void {
    if (!this.isClosed()) super.playAmbientSound();
  }
  override hurtSound(): string {
    return this.isClosed() ? 'entity.shulker.hurt_closed' : 'entity.shulker.hurt';
  }
  override deathSound(): string {
    return 'entity.shulker.death';
  }
  protected override makesStepSounds(): boolean {
    return false;
  }

  /** vanilla entities/shulker: its shell half the time, 6.25% more a level of looting */
  override lootTable(): LootEntry[] {
    return [{ item: 'shulker_shell', min: 1, max: 1, chance: 0.5, lootingChance: [0.5625, 0.0625], noLooting: true }];
  }

  // --- saving -------------------------------------------------------------------

  /** vanilla AttachFace, Peek and Color (and the covered armour modifier, which vanilla keeps with its attributes) */
  protected override saveData(): Record<string, number | string | boolean> {
    return { attachFace: this.attachFace, peek: this.rawPeek, color: this.color ?? '', covered: this.covered };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    if (typeof d.attachFace === 'number' && d.attachFace >= 0 && d.attachFace < 6) this.attachFace = d.attachFace as Dir;
    if (typeof d.peek === 'number') this.rawPeek = d.peek;
    this.color = typeof d.color === 'string' && (SHULKER_COLORS as readonly string[]).includes(d.color) ? d.color : null;
    this.covered = d.covered === true;
    this.baseArmor = this.covered ? 20 : 0;
    this.refreshBoundingBox();
  }

  /** /summon's entity data: AttachFace, Peek and Color (a dye's number, 16 for none) as vanilla reads them */
  readEntityData(nbt: string): void {
    const num = (k: string) => {
      const m = new RegExp(`\\b${k}\\s*:\\s*(-?\\d+)b?\\b`).exec(nbt);
      return m ? parseInt(m[1], 10) : null;
    };
    const face = num('AttachFace');
    if (face !== null && face >= 0 && face < 6) this.setAttachFace(face as Dir);
    const peek = num('Peek');
    if (peek !== null) this.rawPeek = peek;
    const c = num('Color');
    if (c !== null) this.color = c >= 0 && c < 16 ? SHULKER_COLORS[c] : null;
  }
}
