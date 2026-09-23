// The ghast (vanilla Ghast, a FlyingMob): a huge floating jellyfish of the Nether that drifts about at random,
// turns to face a player it has noticed (from within 4 blocks up or down, up to 100 away), wails a warning and
// spits a large fireball (fireball.ts); strike that and it flies off the way you look, yours now, and a ghast it
// hits is done for.

import { LootEntry } from './mob';
import type { Level } from '../game/level';
import { Goal, Flag } from './ai/goal';
import { MoveControl, MoveOp } from './ai/controls';
import { NearestAttackablePlayerGoal } from './ai/goals';
import type { Entity } from './entity';
import { Monster, validSpawnBlock } from './monsters';
import { LargeFireball } from './fireball';
import { COLLISION } from '../world/block';
import { AABB } from '../core/aabb';

const RAD = 180 / Math.PI;

/** block collisions only (vanilla Level.noCollision, for the ghast's path check) */
function freeOfBlocks(level: Level, bb: AABB): boolean {
  const w = level.world;
  for (let x = Math.floor(bb.minX); x <= Math.floor(bb.maxX - 1e-7); x++)
    for (let y = Math.floor(bb.minY); y <= Math.floor(bb.maxY - 1e-7); y++)
      for (let z = Math.floor(bb.minZ); z <= Math.floor(bb.maxZ - 1e-7); z++) {
        const boxes = COLLISION[w.getState(x, y, z)];
        if (!boxes) continue;
        for (const b of boxes) if (bb.intersectsRaw(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5])) return false;
      }
  return true;
}

/** vanilla Ghast.GhastMoveControl: every few ticks a nudge towards the wanted spot, if the way there is clear */
class GhastMoveControl extends MoveControl {
  private floatDuration = 0;
  constructor(readonly ghast: Ghast) {
    super(ghast);
  }
  override tick(): void {
    if (this.operation !== MoveOp.MOVE_TO || this.floatDuration-- > 0) return;
    const g = this.ghast;
    this.floatDuration += g.random.nextInt(5) + 2;
    let vx = this.wantedX - g.x, vy = this.wantedY - g.y, vz = this.wantedZ - g.z;
    const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (d > 0) {
      vx /= d;
      vy /= d;
      vz /= d;
    }
    let bb = g.bb;
    for (let i = 1; i < Math.ceil(d); i++) {
      bb = bb.move(vx, vy, vz);
      if (!freeOfBlocks(g.level, bb)) {
        this.operation = MoveOp.WAIT;
        return;
      }
    }
    g.dx += vx * 0.1;
    g.dy += vy * 0.1;
    g.dz += vz * 0.1;
  }
}

/** vanilla Ghast.RandomFloatAroundGoal: a new spot up to 16 blocks off whenever it's arrived or strayed far */
class RandomFloatAroundGoal extends Goal {
  constructor(readonly g: Ghast) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const mc = this.g.moveControl;
    if (!mc.hasWanted()) return true;
    const d2 = (mc.wantedX - this.g.x) ** 2 + (mc.wantedY - this.g.y) ** 2 + (mc.wantedZ - this.g.z) ** 2;
    return d2 < 1 || d2 > 3600;
  }
  override canContinueToUse(): boolean {
    return false;
  }
  override start(): void {
    const g = this.g, r = g.random;
    g.moveControl.setWantedPosition(g.x + (r.nextFloat() * 2 - 1) * 16, g.y + (r.nextFloat() * 2 - 1) * 16, g.z + (r.nextFloat() * 2 - 1) * 16, 1);
  }
}

/** vanilla Ghast.GhastLookGoal: faces where it drifts, or its target within 64 blocks */
class GhastLookGoal extends Goal {
  constructor(readonly g: Ghast) {
    super();
    this.flags = Flag.LOOK;
  }
  canUse(): boolean {
    return true;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const g = this.g, t = g.target;
    if (!t) g.yaw = -Math.atan2(g.dx, g.dz) * RAD;
    else if (t.distanceToSqr(g.x, g.y, g.z) < 4096) g.yaw = -Math.atan2(t.x - g.x, t.z - g.z) * RAD;
    g.bodyYaw = g.headYaw = g.yaw;
  }
}

/** vanilla Ghast.GhastShootFireballGoal: half a second of charging (the warning wail midway), fire, then two s rest */
class GhastShootFireballGoal extends Goal {
  chargeTime = 0;
  constructor(readonly g: Ghast) {
    super();
  }
  canUse(): boolean {
    return !!this.g.target;
  }
  override start(): void {
    this.chargeTime = 0;
  }
  override stop(): void {
    this.g.charging = false;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const g = this.g, t = g.target;
    if (!t) return;
    const pitch = () => (g.random.nextFloat() - g.random.nextFloat()) * 0.2 + 1;
    if (t.distanceToSqr(g.x, g.y, g.z) < 4096 && g.hasLineOfSight(t)) {
      this.chargeTime++;
      if (this.chargeTime === 10) g.level.sound.play('entity.ghast.warn', g.x, g.y, g.z, 10, pitch());
      if (this.chargeTime === 20) {
        const yr = g.yaw / RAD, vx = -Math.sin(yr), vz = Math.cos(yr);
        const fb = new LargeFireball(g.level, g, t.x - (g.x + vx * 4), t.y + t.height * 0.5 - (0.5 + g.y + g.height * 0.5), t.z - (g.z + vz * 4), g.explosionPower);
        fb.setPos(g.x + vx * 4, g.y + g.height * 0.5 + 0.5, g.z + vz * 4);
        g.level.sound.play('entity.ghast.shoot', g.x, g.y, g.z, 10, pitch());
        g.level.addEntity(fb);
        this.chargeTime = -40;
      }
    } else if (this.chargeTime > 0) this.chargeTime--;
    g.charging = this.chargeTime > 10;
  }
}

/** vanilla NearestAttackableTargetGoal(Player, …, e -> |e.y - y| <= 4): it only notices you near its own height */
class GhastTargetGoal extends NearestAttackablePlayerGoal {
  constructor(readonly g: Ghast) {
    super(g, true);
  }
  protected override extraCondition(): boolean {
    const p = this.g.level.player;
    return !!p && Math.abs(p.y - this.g.y) <= 4;
  }
}

export class Ghast extends Monster {
  readonly type = 'ghast';
  readonly explosionPower = 1;
  /** the mouth and eyes open (vanilla DATA_IS_CHARGING) */
  charging = false;
  constructor(level: Level) {
    super(level);
    this.setSize(4, 4);
    this.maxHealth = this.health = 10;
    this.followRange = 100;
    this.xpReward = 5;
    this.moveControl = new GhastMoveControl(this);
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(5, new RandomFloatAroundGoal(this));
    this.goalSelector.addGoal(7, new GhastLookGoal(this));
    this.goalSelector.addGoal(7, new GhastShootFireballGoal(this));
    this.targetSelector.addGoal(1, new GhastTargetGoal(this));
  }
  override get eyeHeight(): number {
    return 2.6;
  }
  override fireImmune(): boolean {
    return true;
  }
  /** vanilla: a FlyingMob, not a Monster, it doesn't keep you awake */
  override isPreventingPlayerRest(_p: Entity): boolean {
    return false;
  }
  override soundVolume(): number {
    return 5;
  }
  override ambientSound(): string {
    return 'entity.ghast.ambient';
  }
  override hurtSound(): string {
    return 'entity.ghast.hurt';
  }
  override deathSound(): string {
    return 'entity.ghast.death';
  }
  /** vanilla entities/ghast */
  override lootTable(): LootEntry[] {
    return [
      { item: 'ghast_tear', min: 0, max: 1 },
      { item: 'gunpowder', min: 0, max: 2 },
    ];
  }
  protected override causeFallDamage(_dist: number): void {}
  /** vanilla FlyingMob.travel: no gravity, air drag 0.91 (0.8 in water, 0.5 in lava) */
  override travel(sx: number, sy: number, sz: number): void {
    const drag = this.inWater ? 0.8 : this.inLava ? 0.5 : 0.91;
    this.moveRelative(this.inWater || this.inLava || !this.onGround ? 0.02 : 0.1 * (0.16277137 / (0.91 * 0.91 * 0.91)), sx, sy, sz);
    this.move(this.dx, this.dy, this.dz);
    this.dx *= drag;
    this.dy *= drag;
    this.dz *= drag;
  }
  /** vanilla Ghast.hurt / isInvulnerableTo: a fireball a player sent back gets through, and kills it outright */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (direct instanceof LargeFireball && attacker?.type === 'player') {
      super.hurt(1000, source, attacker, direct);
      return true;
    }
    return super.hurt(amount, source, attacker, direct);
  }
  protected override shrugsOffFire(source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    return !(direct instanceof LargeFireball && attacker?.type === 'player') && super.shrugsOffFire(source, attacker, direct);
  }
  /** vanilla checkGhastSpawnRules: one try in twenty, on any floor a fireproof mob may stand on */
  static checkGhastSpawn(level: Level, x: number, y: number, z: number, rand: () => number): boolean {
    return level.difficulty !== 'peaceful' && Math.floor(rand() * 20) === 0 && validSpawnBlock(level, x, y - 1, z, true);
  }
}
