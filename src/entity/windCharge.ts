// (trial chambers) Wind charges (1.21; vanilla AbstractWindCharge, WindCharge and BreezeWindCharge): a small ball of
// wind that flies dead straight at the speed it was sent (no drag, no fall), through water as through air, and bursts
// where it strikes something living or the outline of a block (grass and flowers too). What it strikes takes a point
// of damage (vanilla DamageTypes.WIND_CHARGE, a projectile's), and the burst (game/windBurst.ts) throws everything
// round it away and sets off doors, trapdoors, fence gates, buttons, levers and bells. A player's wind charge (thrown,
// or shot by a dispenser or an ominous trial spawner) bursts 1.2 across and pushes a fifth again as hard; a breeze's
// bursts 3 across. Struck, one flies off the way the striker looks and is theirs (a player's own only once it's five
// ticks out). Gone out of the top of the world, it bursts. Drawn as a spinning swirl of wind
// (render/breezeRenderer.ts). Like the game's fireballs, it isn't saved with its chunk.

import { Entity } from './entity';
import { LivingEntity } from './living';
import type { Level } from '../game/level';
import type { Player } from './player';
import { raycast } from '../game/raycast';
import { onProjectileHit } from '../game/blockRules';
import { doPostAttackEffects } from '../game/enchantEffects';
import { windBurstAt } from '../game/windBurst';
import { MAX_Y } from '../world/constants';
import { DX, DY, DZ } from '../world/dir';

const RAD = 180 / Math.PI;

export abstract class AbstractWindCharge extends Entity {
  owner: Entity | null;
  /** vanilla Projectile.leftOwner: it has left the one who sent it, and may hit them */
  private leftOwner = false;

  constructor(level: Level, owner: Entity | null) {
    super(level);
    this.setSize(0.3125, 0.3125);
    this.owner = owner;
  }

  /** vanilla explode: its burst at (x, y, z) */
  protected abstract explode(x: number, y: number, z: number): void;

  /** vanilla WindCharge.deflect: whether a blow may turn it yet */
  protected mayDeflect(): boolean {
    return true;
  }

  /** vanilla Projectile.shoot: off along (x, y, z) at `velocity`, a little astray (a triangle spread of `inaccuracy`) */
  shoot(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
    const r = this.level.random;
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    this.dx = (x / l + r.triangle(0.0172275 * inaccuracy)) * velocity;
    this.dy = (y / l + r.triangle(0.0172275 * inaccuracy)) * velocity;
    this.dz = (z / l + r.triangle(0.0172275 * inaccuracy)) * velocity;
    this.yaw = this.yawO = Math.atan2(this.dx, this.dz) * RAD;
    this.pitch = this.pitchO = Math.atan2(this.dy, Math.sqrt(this.dx * this.dx + this.dz * this.dz)) * RAD;
  }

  /** vanilla Projectile.shootFromRotation: along the look, carrying the shooter's own motion (not its fall on the ground) */
  shootFromRotation(shooter: Entity, xRot: number, yRot: number, zOff: number, velocity: number, inaccuracy: number): void {
    this.shoot(-Math.sin(yRot / RAD) * Math.cos(xRot / RAD), -Math.sin((xRot + zOff) / RAD), Math.cos(yRot / RAD) * Math.cos(xRot / RAD), velocity, inaccuracy);
    this.dx += shooter.x - shooter.xo;
    this.dy += shooter.onGround ? 0 : shooter.y - shooter.yo;
    this.dz += shooter.z - shooter.zo;
  }

  /** (vanilla: struck with a hand or a weapon, it's turned; nothing else hits it) */
  override isPickable(): boolean {
    return !this.removed;
  }

  /**
   * vanilla Player.attack on a #redirectable_projectile: ProjectileDeflection.AIM_DEFLECT, off the way the striker looks
   * at a block a tick, and theirs from now on
   */
  override hurt(_amount: number, _source: string, attacker?: Entity | null): boolean {
    if (!attacker || this.removed || !this.mayDeflect()) return false;
    const yr = attacker.yaw / RAD, pr = attacker.pitch / RAD;
    this.dx = -Math.sin(yr) * Math.cos(pr);
    this.dy = -Math.sin(pr);
    this.dz = Math.cos(yr) * Math.cos(pr);
    this.owner = attacker;
    this.leftOwner = false;
    return true;
  }

  /** vanilla Projectile.checkLeftOwner: nothing of the sender's (or of what it rides) is in its way any more */
  private checkLeftOwner(): boolean {
    const o = this.owner;
    if (!o) return true;
    const root = o.rootVehicle();
    for (const e of this.level.getEntities(this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1), (e) => e.isPickable() && (e as { gameMode?: string }).gameMode !== 'spectator', this))
      if (e.rootVehicle() === root) return false;
    return true;
  }

  /** vanilla canHitEntity: anything that can be struck but another wind charge, its sender only once it's away */
  private canHit(e: Entity): boolean {
    if (!e.isPickable() || e instanceof AbstractWindCharge) return false;
    if ((e as { gameMode?: string }).gameMode === 'spectator') return false;
    return !(this.owner && !this.leftOwner && e.rootVehicle() === this.owner.rootVehicle());
  }

  override tick(): void {
    // vanilla AbstractWindCharge.tick: thirty blocks over the top of the world, it bursts
    if (Math.floor(this.y) > MAX_Y + 30) {
      this.explode(this.x, this.y, this.z);
      this.remove();
      return;
    }
    // vanilla AbstractHurtingProjectile.tick: only where the world is loaded (a sender gone is no sender at all)
    if (!this.level.world.isLoaded(Math.floor(this.x), Math.floor(this.z))) {
      this.remove();
      return;
    }
    if (this.owner?.removed) this.owner = null;
    this.baseTick();
    if (!this.leftOwner) this.leftOwner = this.checkLeftOwner();
    // vanilla ProjectileUtil.getHitResultOnMoveVector (ClipContext.Block.OUTLINE): the block in the way by its outline,
    // then the nearest thing it would strike before that (margin 0.3)
    const x0 = this.x, y0 = this.y, z0 = this.z;
    let x1 = x0 + this.dx, y1 = y0 + this.dy, z1 = z0 + this.dz;
    const len = Math.sqrt(this.dx * this.dx + this.dy * this.dy + this.dz * this.dz);
    const bh = len > 1e-7 ? raycast(this.level.world, x0, y0, z0, this.dx / len, this.dy / len, this.dz / len, len) : null;
    if (bh) {
      x1 = bh.hx;
      y1 = bh.hy;
      z1 = bh.hz;
    }
    let hit: Entity | null = null, best = Infinity;
    for (const e of this.level.getEntities(this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1), (e) => this.canHit(e), this)) {
      const h = e.bb.inflate(0.3).clip(x0, y0, z0, x1, y1, z1);
      if (h && h.t < best) {
        best = h.t;
        hit = e;
      }
    }
    if (hit) {
      this.onHitEntity(hit);
      this.remove();
      return;
    }
    if (bh) {
      // vanilla Projectile.onHitBlock: the block hears of it first (a bell rings), then AbstractWindCharge.onHitBlock:
      // the burst a quarter block out from the face it struck
      onProjectileHit(this.level, bh.x, bh.y, bh.z, { face: bh.face, px: bh.hx, py: bh.hy, pz: bh.hz }, this);
      this.explode(bh.hx + DX[bh.face] * 0.25, bh.hy + DY[bh.face] * 0.25, bh.hz + DZ[bh.face] * 0.25);
      this.remove();
      return;
    }
    this.checkInsideBlocks();
    if (this.removed) return;
    const nx = x0 + this.dx, ny = y0 + this.dy, nz = z0 + this.dz;
    // vanilla: bubbles behind it in water (its inertia is 1 in water and out: it keeps its speed)
    if (this.inWater) for (let i = 0; i < 4; i++) this.level.particles.spawn?.('bubble', nx - this.dx * 0.25, ny - this.dy * 0.25, nz - this.dz * 0.25, this.dx, this.dy, this.dz);
    this.setPos(nx, ny, nz);
  }

  /**
   * vanilla AbstractWindCharge.onHitEntity: a point of wind charge damage (from its sender, if any: the one it last
   * hurt), the victim's thorns, then the burst where the charge is
   */
  protected onHitEntity(e: Entity): void {
    const owner = this.owner instanceof LivingEntity ? this.owner : null;
    if (owner && e instanceof LivingEntity) owner.lastHurtMob = e;
    const hit = e.hurt(1, 'windCharge', owner ?? this, this);
    if (hit && e instanceof LivingEntity) doPostAttackEffects(e, owner, null, false);
    // (M5) vanilla KilledTrigger for the player the kill goes to (LivingEntity.getKillCredit), with the charge as the
    // killing blow's direct entity: Blowback, for a breeze killed by its own kind's charge turned back
    if (hit && e instanceof LivingEntity && !e.isAlive && e.lastHurtByPlayer)
      this.level.onPlayerTrigger?.(e.lastHurtByPlayer as Player, 'player_killed_entity', { killedWith: { victim: e.type, direct: this.type } });
    this.explode(this.x, this.y, this.z);
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}

/** vanilla WindCharge: a player's, a dispenser's or an ominous trial spawner's */
export class WindCharge extends AbstractWindCharge {
  readonly type = 'wind_charge';
  /** vanilla noDeflectTicks: its thrower can't bat it away as soon as it's thrown */
  private noDeflectTicks = 5;

  override tick(): void {
    super.tick();
    if (this.noDeflectTicks > 0) this.noDeflectTicks--;
  }

  protected override mayDeflect(): boolean {
    return this.noDeflectTicks <= 0;
  }

  /** vanilla WindCharge.explode: 1.2 across, pushing 1.22 as hard (its own knockback), with the wind charge's burst */
  protected explode(x: number, y: number, z: number): void {
    windBurstAt(this.level, this, x, y, z, 1.2, { knockback: 1.22, sound: 'entity.wind_charge.wind_burst' });
  }
}

/** vanilla BreezeWindCharge: a breeze's, shot from its snout */
export class BreezeWindCharge extends AbstractWindCharge {
  readonly type = 'breeze_wind_charge';

  /** vanilla BreezeWindCharge.explode: 3 across, with the breeze's burst */
  protected explode(x: number, y: number, z: number): void {
    windBurstAt(this.level, this, x, y, z, 3, { knockback: 1, sound: 'entity.breeze.wind_burst' });
  }
}
