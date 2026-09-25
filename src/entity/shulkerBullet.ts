// A shulker's bullet (vanilla ShulkerBullet): a little glowing spark that hunts its target through the air in straight
// runs along the block grid, turning at right angles — toward the target on one axis at a time, round whatever is in
// the way — trailing end rod motes as it goes. It passes through everything but what it's after: an entity it strikes
// takes 4 damage and floats up (Levitation for 10 seconds); against a block it bursts. With no target left it drops.
// A blow (or an arrow) breaks it.

import type { Level } from '../game/level';
import { Entity } from './entity';
import { LivingEntity } from './living';
import { MobEffectInstance, MOB_EFFECTS } from './effects';
import { Rand } from '../core/rng';
import { clipBlocks, type SegmentHit } from '../game/raycast';
import { onProjectileHit } from '../game/blockRules';
import { doPostAttackEffects } from '../game/enchantEffects';
import { FLAGS, F_AIR } from '../world/block';
import { collisionFaceFull } from '../world/dynamicShapes';
import { AXIS_OF, DOWN, DX, DY, DZ, EAST, NORTH, SOUTH, UP, WEST, type Dir } from '../world/dir';
import { projectileShot } from '../game/vibrations';

const RAD = 180 / Math.PI;
/** vanilla SPEED: how fast it means to go (it speeds up 2.5% a tick while it has a target) */
const SPEED = 0.15;

export class ShulkerBullet extends Entity {
  readonly type = 'shulker_bullet';
  /** vanilla Projectile owner: the shulker that fired it */
  owner: Entity | null = null;
  /** vanilla leftOwner: clear of the shulker, so it could hit it */
  private leftOwner = false;
  /** vanilla finalTarget */
  target: Entity | null = null;
  /** vanilla currentMoveDirection: the way it's heading now */
  private moveDir: Dir | null = null;
  /** vanilla flightSteps: ticks until it picks a new way */
  private flightSteps = 0;
  /** vanilla targetDeltaX/Y/Z: the velocity it's steering toward */
  private tdx = 0;
  private tdy = 0;
  private tdz = 0;
  private readonly random = new Rand((Math.random() * 0x7fffffff) | 0);

  /** vanilla ShulkerBullet(level, shooter, finalTarget, axis): from the middle of the shooter, first heading up */
  constructor(level: Level, owner: LivingEntity | null = null, target: Entity | null = null, axis: number | null = null) {
    super(level);
    this.setSize(0.3125, 0.3125);
    this.noPhysics = true;
    if (!owner) return;
    this.owner = owner;
    this.moveTo(owner.bb.centerX, owner.bb.centerY, owner.bb.centerZ);
    this.target = target;
    this.moveDir = UP;
    this.selectNextMoveDirection(axis);
  }

  private empty(x: number, y: number, z: number): boolean {
    return (FLAGS[this.level.world.getState(x, y, z)] & F_AIR) !== 0;
  }

  /**
   * vanilla selectNextMoveDirection: more than 2 blocks from the target, a step one block along an axis toward it
   * (not `axis`, the one it was on) into an empty block, or any open way; close by, straight at it. A new run of 10
   * to 50 ticks.
   */
  private selectNextMoveDirection(axis: number | null): void {
    let d0 = 0.5;
    let bx: number, by: number, bz: number;
    const t = this.target;
    if (!t) {
      bx = Math.floor(this.x);
      by = Math.floor(this.y) - 1;
      bz = Math.floor(this.z);
    } else {
      d0 = t.height * 0.5;
      bx = Math.floor(t.x);
      by = Math.floor(t.y + d0);
      bz = Math.floor(t.z);
    }
    let d1 = bx + 0.5, d2 = by + d0, d3 = bz + 0.5;
    let dir: Dir | null = null;
    // (vanilla BlockPos.closerToCenterThan(position, 2))
    const cx = bx + 0.5 - this.x, cy = by + 0.5 - this.y, cz = bz + 0.5 - this.z;
    if (cx * cx + cy * cy + cz * cz >= 4) {
      const px = Math.floor(this.x), py = Math.floor(this.y), pz = Math.floor(this.z);
      const list: Dir[] = [];
      if (axis !== 0) {
        if (px < bx && this.empty(px + 1, py, pz)) list.push(EAST);
        else if (px > bx && this.empty(px - 1, py, pz)) list.push(WEST);
      }
      if (axis !== 1) {
        if (py < by && this.empty(px, py + 1, pz)) list.push(UP);
        else if (py > by && this.empty(px, py - 1, pz)) list.push(DOWN);
      }
      if (axis !== 2) {
        if (pz < bz && this.empty(px, py, pz + 1)) list.push(SOUTH);
        else if (pz > bz && this.empty(px, py, pz - 1)) list.push(NORTH);
      }
      dir = this.random.nextInt(6) as Dir;
      if (!list.length) {
        for (let i = 5; !this.empty(px + DX[dir], py + DY[dir], pz + DZ[dir]) && i > 0; i--) dir = this.random.nextInt(6) as Dir;
      } else dir = list[this.random.nextInt(list.length)];
      d1 = this.x + DX[dir];
      d2 = this.y + DY[dir];
      d3 = this.z + DZ[dir];
    }
    this.moveDir = dir;
    const d6 = d1 - this.x, d7 = d2 - this.y, d4 = d3 - this.z;
    const d5 = Math.sqrt(d6 * d6 + d7 * d7 + d4 * d4);
    if (d5 === 0) this.tdx = this.tdy = this.tdz = 0;
    else {
      this.tdx = (d6 / d5) * SPEED;
      this.tdy = (d7 / d5) * SPEED;
      this.tdz = (d4 / d5) * SPEED;
    }
    this.flightSteps = 10 + this.random.nextInt(5) * 10;
  }

  /** vanilla Projectile.checkLeftOwner: nothing of the shooter's within a block of where it's going */
  private checkLeftOwner(): boolean {
    const o = this.owner;
    if (!o) return true;
    return !o.bb.intersects(this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1));
  }

  /** vanilla canHitEntity: anything alive that can be picked (not other bullets), the shooter once it's clear of it */
  private canHitEntity(e: Entity): boolean {
    if (e.removed || e.noPhysics || !e.isPickable()) return false;
    if (e instanceof LivingEntity && !e.isAlive) return false;
    if ((e as { gameMode?: string }).gameMode === 'spectator') return false;
    return !(e === this.owner && !this.leftOwner);
  }

  private targetLost(): boolean {
    const t = this.target;
    if (!t || t.removed) return true;
    if (t instanceof LivingEntity && !t.isAlive) return true;
    return (t as { gameMode?: string }).gameMode === 'spectator';
  }

  override tick(): void {
    // (vanilla checkDespawn: gone in peaceful)
    if (this.level.difficulty === 'peaceful') {
      this.remove();
      return;
    }
    // (vanilla Projectile.tick: the shot is a game event)
    projectileShot(this);
    if (!this.leftOwner) this.leftOwner = this.checkLeftOwner();
    this.baseTick();
    if (this.targetLost()) this.dy -= 0.04;
    else {
      this.tdx = Math.max(-1, Math.min(1, this.tdx * 1.025));
      this.tdy = Math.max(-1, Math.min(1, this.tdy * 1.025));
      this.tdz = Math.max(-1, Math.min(1, this.tdz * 1.025));
      this.dx += (this.tdx - this.dx) * 0.2;
      this.dy += (this.tdy - this.dy) * 0.2;
      this.dz += (this.tdz - this.dz) * 0.2;
    }
    const hit = this.hitOnMoveVector();
    const vx = this.dx, vy = this.dy, vz = this.dz;
    this.setPos(this.x + vx, this.y + vy, this.z + vz);
    if (hit && !this.removed) this.onHit(hit);
    this.rotateTowardsMovement(0.5);
    this.level.particles.spawn?.('end_rod', this.x - vx, this.y - vy + 0.15, this.z - vz, 0, 0, 0);
    if (this.removed) return;
    const t = this.target;
    if (!t || t.removed) return;
    if (this.flightSteps > 0 && --this.flightSteps === 0) this.selectNextMoveDirection(this.moveDir === null ? null : AXIS_OF[this.moveDir]);
    if (this.moveDir === null) return;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const d = this.moveDir, axis = AXIS_OF[d];
    // (vanilla loadedAndEntityCanStandOn: a block with a whole top ahead turns it)
    const ax = bx + DX[d], ay = by + DY[d], az = bz + DZ[d];
    if (this.level.world.isLoaded(ax, az) && collisionFaceFull(this.level.world, ax, ay, az, UP)) this.selectNextMoveDirection(axis);
    else if ((axis === 0 && bx === Math.floor(t.x)) || (axis === 2 && bz === Math.floor(t.z)) || (axis === 1 && by === Math.floor(t.y))) this.selectNextMoveDirection(axis);
  }

  /**
   * vanilla ProjectileUtil.getHitResultOnMoveVector: the first block along this tick's move, or before it the first
   * entity whose box (grown by 0.3) the move enters
   */
  private hitOnMoveVector(): { e: Entity } | { b: SegmentHit } | null {
    const x0 = this.x, y0 = this.y, z0 = this.z;
    let x1 = x0 + this.dx, y1 = y0 + this.dy, z1 = z0 + this.dz;
    const bh = clipBlocks(this.level.world, x0, y0, z0, x1, y1, z1);
    if (bh) {
      x1 = bh.px;
      y1 = bh.py;
      z1 = bh.pz;
    }
    let best: Entity | null = null, bd = Infinity;
    for (const e of this.level.getEntities(this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1), (e) => this.canHitEntity(e), this)) {
      const h = e.bb.inflate(0.3).clip(x0, y0, z0, x1, y1, z1);
      if (h && h.t < bd) {
        bd = h.t;
        best = e;
      }
    }
    if (best) return { e: best };
    return bh ? { b: bh } : null;
  }

  /** vanilla onHit: whatever it hit, it's spent */
  private onHit(hit: { e: Entity } | { b: SegmentHit }): void {
    if ('e' in hit) this.onHitEntity(hit.e);
    else this.onHitBlock(hit.b);
    this.remove();
  }

  /** vanilla onHitEntity: 4 damage (a mob's projectile), and a hit that lands sets the living floating for 10 seconds */
  private onHitEntity(e: Entity): void {
    const owner = this.owner instanceof LivingEntity ? this.owner : null;
    if (!e.hurt(4, 'mobProjectile', owner ?? this, this)) return;
    doPostAttackEffects(e, owner, null, false);
    if (e instanceof LivingEntity) e.addEffect(new MobEffectInstance(MOB_EFFECTS.levitation, 200), owner ?? this);
  }

  /** vanilla onHitBlock: the block hears of it, and it bursts with a pop */
  private onHitBlock(b: SegmentHit): void {
    onProjectileHit(this.level, b.x, b.y, b.z, b, this);
    const r = this.random;
    for (let i = 0; i < 2; i++) this.level.particles.spawn?.('explosion', this.x + r.gaussian() * 0.2, this.y + r.gaussian() * 0.2, this.z + r.gaussian() * 0.2, 0, 0, 0);
    this.level.sound.play('entity.shulker_bullet.hit', this.x, this.y, this.z, 1, 1);
  }

  /** vanilla ProjectileUtil.rotateTowardsMovement: half way round to face along its flight */
  private rotateTowardsMovement(k: number): void {
    const vx = this.dx, vy = this.dy, vz = this.dz;
    if (vx * vx + vy * vy + vz * vz === 0) return;
    const h = Math.sqrt(vx * vx + vz * vz);
    this.yaw = Math.atan2(vz, vx) * RAD + 90;
    this.pitch = Math.atan2(h, vy) * RAD - 90;
    while (this.pitch - this.pitchO < -180) this.pitchO -= 360;
    while (this.pitch - this.pitchO >= 180) this.pitchO += 360;
    while (this.yaw - this.yawO < -180) this.yawO -= 360;
    while (this.yaw - this.yawO >= 180) this.yawO += 360;
    this.pitch = this.pitchO + (this.pitch - this.pitchO) * k;
    this.yaw = this.yawO + (this.yaw - this.yawO) * k;
  }

  override isPickable(): boolean {
    return !this.removed;
  }

  override isOnFire(): boolean {
    return false;
  }

  /** vanilla hurt: a blow breaks it, with a crack and a spray of sparks */
  override hurt(_amount: number, _source: string, _attacker?: Entity | null, _direct?: Entity | null): boolean {
    if (this.removed) return false;
    this.level.sound.play('entity.shulker_bullet.hurt', this.x, this.y, this.z, 1, 1);
    const r = this.random;
    for (let i = 0; i < 15; i++) this.level.particles.spawn?.('crit', this.x + r.gaussian() * 0.2, this.y + r.gaussian() * 0.2, this.z + r.gaussian() * 0.2, 0, 0, 0);
    this.remove();
    return true;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}
