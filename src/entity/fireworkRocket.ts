// A firework rocket in flight (vanilla 1.21 FireworkRocketEntity). Set off from a block it rises (up 0.04 a tick more
// each tick, its slight sideways drift growing by 15 % a tick) for 10 × (flight + 1) + 0-5 + 0-6 ticks, trailing
// sparks, and goes off: with stars, a burst (render/fireworkParticles.ts) that hurts the living within 5 blocks it
// can see (5 + 2 a star, less further off); without, a puff. Shot from a crossbow or a dispenser it flies straight
// as shot and goes off on the first thing it hits (a block only if it has stars). Used by a glider it's fixed to
// them and pushes them along their look for its whole flight (vanilla FireworkRocketItem.use). The item: its data
// is item/fireworks.ts; used on a block, it's launched from the face clicked.

import { Entity } from './entity';
import { LivingEntity } from './living';
import type { Level } from '../game/level';
import { ItemStack, saveStack, loadStack, type SavedStack } from '../item/item';
import { fireworksOf, type FireworkExplosion } from '../item/fireworks';
import { clipBlocks, type SegmentHit } from '../game/raycast';
import { onProjectileHit } from '../game/blockRules';
import { registerItemBehavior } from '../game/itemBehavior';
import { DX, DY, DZ } from '../world/dir';
import { viewVector } from './elytra';
import type { Player } from './player';
import type { SavedEntity } from './mob';

const RAD = 180 / Math.PI;

/** vanilla Random.nextGaussian (Box-Muller) */
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/** vanilla Projectile.lerpRotation */
function lerpRotation(prev: number, cur: number): number {
  while (cur - prev < -180) prev -= 360;
  while (cur - prev >= 180) prev += 360;
  return prev + (cur - prev) * 0.2;
}

/** vanilla FireworkRocketEntity's lifetime: 10 × (flight duration + 1), plus 0-5 and 0-6 */
export function rocketLifetime(flightDuration: number, r: () => number = Math.random): number {
  return 10 * (1 + flightDuration) + Math.floor(r() * 6) + Math.floor(r() * 7);
}

export class FireworkRocket extends Entity {
  readonly type = 'firework_rocket';
  /** vanilla Projectile owner: who set it off (the player; none from a dispenser) */
  owner: Entity | null = null;
  private leftOwner = false;
  /** vanilla DATA_ID_FIREWORKS_ITEM: the rocket it was (its stars, and what it's drawn as) */
  stack: ItemStack;
  /** vanilla life / lifetime: ticks flown, and how many before it goes off */
  life = 0;
  lifetime = 0;
  /** vanilla attachedToEntity: the glider it's fixed to and boosting (vanilla DATA_ATTACHED_TO_TARGET) */
  attachedTo: LivingEntity | null = null;
  /** vanilla DATA_SHOT_AT_ANGLE: from a crossbow or a dispenser, it keeps its line (no rise, no growing drift) */
  shotAtAngle = false;
  protected readonly rnd = Math.random;

  /** vanilla FireworkRocketEntity(level, [shooter,] x, y, z, stack): set off upward, a little astray */
  constructor(level: Level, x = 0, y = 0, z = 0, stack: ItemStack | null = null, owner: Entity | null = null) {
    super(level);
    this.setSize(0.25, 0.25);
    this.moveTo(x, y, z, 0, 0);
    this.stack = stack ? stack.copy() : ItemStack.of('firework_rocket');
    this.owner = owner;
    // (vanilla RandomSource.triangle(0, 0.002297) either way across, 0.05 up)
    this.dx = 0.002297 * (this.rnd() - this.rnd());
    this.dy = 0.05;
    this.dz = 0.002297 * (this.rnd() - this.rnd());
    this.lifetime = rocketLifetime(fireworksOf(this.stack)?.flightDuration ?? 0, this.rnd);
  }

  /** vanilla FireworkRocketEntity(level, stack, shooter): fixed to a glider (a player using it while gliding) */
  static attached(level: Level, stack: ItemStack, holder: LivingEntity): FireworkRocket {
    const r = new FireworkRocket(level, holder.x, holder.y, holder.z, stack, holder);
    r.attachedTo = holder;
    return r;
  }

  /** vanilla FireworkRocketEntity(level, stack, [shooter,] x, y, z, shotAtAngle): a crossbow's or a dispenser's */
  static shot(level: Level, stack: ItemStack, x: number, y: number, z: number, owner: Entity | null = null): FireworkRocket {
    const r = new FireworkRocket(level, x, y, z, stack, owner);
    r.shotAtAngle = true;
    return r;
  }

  /** vanilla getExplosions: its stars (none for a plain rocket) */
  explosions(): readonly FireworkExplosion[] {
    return fireworksOf(this.stack)?.explosions ?? [];
  }

  /** vanilla Projectile.shoot: off along (x, y, z) at `velocity`, a little astray (a triangle spread of `inaccuracy`) */
  shoot(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    const tri = (): number => 0.0172275 * inaccuracy * (this.rnd() - this.rnd());
    this.dx = (x / l + tri()) * velocity;
    this.dy = (y / l + tri()) * velocity;
    this.dz = (z / l + tri()) * velocity;
    this.yaw = this.yawO = Math.atan2(this.dx, this.dz) * RAD;
    this.pitch = this.pitchO = Math.atan2(this.dy, Math.sqrt(this.dx * this.dx + this.dz * this.dz)) * RAD;
  }

  override tick(): void {
    this.baseTick();
    // (vanilla Projectile.tick)
    if (!this.leftOwner) this.leftOwner = this.checkLeftOwner();
    const a = this.attachedTo;
    if (a) {
      // fixed to its glider: while they glide, pushed a tenth of the look on and half the way to one and a half times it
      if (a.fallFlying) {
        const [lx, ly, lz] = viewVector(a.pitch, a.yaw);
        a.dx += lx * 0.1 + (lx * 1.5 - a.dx) * 0.5;
        a.dy += ly * 0.1 + (ly * 1.5 - a.dy) * 0.5;
        a.dz += lz * 0.1 + (lz * 1.5 - a.dz) * 0.5;
      }
      // (vanilla adds getHandHoldingItemAngle, out by the hand: here it rides at the glider's feet, unseen either way)
      this.setPos(a.x, a.y, a.z);
      this.dx = a.dx;
      this.dy = a.dy;
      this.dz = a.dz;
    } else {
      if (!this.shotAtAngle) {
        const f = this.horizontalCollision ? 1 : 1.15;
        this.dx *= f;
        this.dz *= f;
        this.dy += 0.04;
      }
      // (moved into whatever's in the way, it keeps its speed)
      const vx = this.dx, vy = this.dy, vz = this.dz;
      this.move(vx, vy, vz);
      this.dx = vx;
      this.dy = vy;
      this.dz = vz;
    }
    // vanilla ProjectileUtil.getHitResultOnMoveVector and hitTargetOrDeflectSelf: what lies along its next move
    if (!this.noPhysics && !this.removed) {
      const x0 = this.x, y0 = this.y, z0 = this.z;
      let x1 = x0 + this.dx, y1 = y0 + this.dy, z1 = z0 + this.dz;
      const bh = clipBlocks(this.level.world, x0, y0, z0, x1, y1, z1);
      if (bh) {
        x1 = bh.px;
        y1 = bh.py;
        z1 = bh.pz;
      }
      const e = this.findHitEntity(x0, y0, z0, x1, y1, z1);
      if (e) this.onHitEntity(e);
      else if (bh) this.onHitBlock(bh);
    }
    this.updateRotation();
    if (this.life === 0) this.level.sound.play('entity.firework_rocket.launch', this.x, this.y, this.z, 3, 1);
    this.life++;
    // (vanilla: every tick a spark falls behind it, slowed to half its rise)
    this.level.particles.spawn?.('firework', this.x, this.y, this.z, gauss(this.rnd) * 0.05, -this.dy * 0.5, gauss(this.rnd) * 0.05);
    if (this.life > this.lifetime && !this.removed) this.explode();
  }

  /** vanilla Projectile.checkLeftOwner: nothing of its owner's (vehicle and all) about it any more */
  private checkLeftOwner(): boolean {
    const o = this.owner;
    if (!o) return true;
    const box = this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1);
    const root = o.rootVehicle();
    return !this.level.getEntities(box, (e) => e.isPickable() && !isSpectator(e), this).some((e) => e.rootVehicle() === root);
  }

  /** vanilla Projectile.canHitEntity: whatever can be hit, but not its owner (or what they ride) until it's clear of them */
  private canHit(e: Entity): boolean {
    if (!e.isPickable() || isSpectator(e)) return false;
    return !this.owner || this.leftOwner || !this.owner.isPassengerOfSameVehicle(e);
  }

  /** vanilla ProjectileUtil.getEntityHitResult (margin 0.3): the nearest along the move */
  private findHitEntity(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Entity | null {
    const box = this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1);
    let best: Entity | null = null, bt = Infinity;
    for (const e of this.level.getEntities(box, (e) => this.canHit(e), this)) {
      const h = e.bb.inflate(0.3).clip(x0, y0, z0, x1, y1, z1);
      if (h && h.t < bt) {
        bt = h.t;
        best = e;
      }
    }
    return best;
  }

  /** vanilla onHitEntity: it goes off */
  protected onHitEntity(_e: Entity): void {
    this.explode();
  }

  /** vanilla onHitBlock: it goes off if it has stars; the block has its say either way (Projectile.onHitBlock) */
  protected onHitBlock(hit: SegmentHit): void {
    if (this.explosions().length) this.explode();
    onProjectileHit(this.level, hit.x, hit.y, hit.z, hit, this);
  }

  /** vanilla Projectile.updateRotation: easing round to face along its motion */
  private updateRotation(): void {
    const h = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
    this.pitch = lerpRotation(this.pitchO, Math.atan2(this.dy, h) * RAD);
    this.yaw = lerpRotation(this.yawO, Math.atan2(this.dx, this.dz) * RAD);
  }

  /**
   * vanilla explode: entity event 17 (ClientLevel.createFireworks: the burst, or with no stars two to four puffs),
   * the damage, and it's gone
   */
  explode(): void {
    const ex = this.explosions();
    const lvl = this.level;
    if (!ex.length) {
      // (vanilla's loop draws its bound afresh each time round: 2 puffs a third of the time, else 3 or 4)
      for (let i = 0; i < Math.floor(this.rnd() * 3) + 2; i++) lvl.particles.spawn?.('poof', this.x, this.y, this.z, gauss(this.rnd) * 0.05, 0.005, gauss(this.rnd) * 0.05);
    } else lvl.particles.fireworks?.(this.x, this.y, this.z, this.dx, this.dy, this.dz, ex);
    this.dealExplosionDamage(ex);
    this.remove();
  }

  /**
   * vanilla dealExplosionDamage: with stars, 5 + 2 a star to the glider it's fixed to, and to every other living
   * thing within 5 blocks (feet to feet) whose feet or middle it has a clear line to, times √((5 - distance) / 5)
   */
  private dealExplosionDamage(ex: readonly FireworkExplosion[]): void {
    if (!ex.length) return;
    const f = 5 + ex.length * 2;
    const owner = this.owner;
    if (this.attachedTo) this.attachedTo.hurt(f, 'fireworks', owner, this);
    const w = this.level.world;
    for (const e of this.level.getEntities(this.bb.inflate(5), (e) => e instanceof LivingEntity, this)) {
      if (e === this.attachedTo) continue;
      const d2 = this.distanceToSqr(e.x, e.y, e.z);
      if (d2 > 25) continue;
      let seen = false;
      for (let i = 0; i < 2 && !seen; i++) seen = !clipBlocks(w, this.x, this.y, this.z, e.x, e.y + e.height * 0.5 * i, e.z);
      if (seen) e.hurt(f * Math.sqrt((5 - Math.fround(Math.sqrt(d2))) / 5), 'fireworks', owner, this);
    }
  }

  override hurt(): boolean {
    return false;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }

  /** vanilla addAdditionalSaveData: Life, LifeTime, FireworksItem, ShotAtAngle (not what it's fixed to) */
  save(): SavedEntity {
    return {
      id: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, dx: this.dx, dy: this.dy, dz: this.dz, health: 0, fire: this.remainingFireTicks,
      data: { life: this.life, lifetime: this.lifetime, item: JSON.stringify(saveStack(this.stack)), shotAtAngle: this.shotAtAngle },
    };
  }

  load(d: SavedEntity): void {
    this.moveTo(d.x, d.y, d.z, d.yaw, d.pitch);
    this.dx = d.dx;
    this.dy = d.dy;
    this.dz = d.dz;
    this.remainingFireTicks = d.fire;
    const v = d.data ?? {};
    this.life = Number(v.life ?? 0);
    this.lifetime = Number(v.lifetime ?? this.lifetime);
    const s = typeof v.item === 'string' ? loadStack(JSON.parse(v.item) as SavedStack) : null;
    if (s) this.stack = s;
    this.shotAtAngle = v.shotAtAngle === true;
  }
}

const isSpectator = (e: Entity): boolean => (e as { gameMode?: string }).gameMode === 'spectator';

// ---------------------------------------------------------------------------
// the item (vanilla FireworkRocketItem)

registerItemBehavior('firework_rocket', {
  // vanilla useOn: set off from where the block was clicked, 0.15 out from the face (creative keeps the rocket)
  useOn(level, p, stack, h) {
    level.addEntity(new FireworkRocket(level, h.hx + DX[h.face] * 0.15, h.hy + DY[h.face] * 0.15, h.hz + DZ[h.face] * 0.15, stack, p));
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    p.swing(p.inventory.activeHand);
    return 'success';
  },
  // vanilla use: only while gliding, fixed to the glider (one used up, not in creative: ItemStack.consume)
  use(level, p: Player, stack) {
    if (!p.fallFlying) return 'pass';
    level.addEntity(FireworkRocket.attached(level, stack, p));
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    p.swing(p.inventory.activeHand);
    return 'success';
  },
});
