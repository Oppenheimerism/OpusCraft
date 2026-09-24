// Fireballs (vanilla AbstractHurtingProjectile + Fireball): pushed along their heading 0.1 a tick against 5% drag
// (20% in water), trailing smoke, drawn as a glowing fire charge. The ghast's large fireball bursts where it hits
// and can be struck back; the blaze's small one sets what it hits alight.

import type { Level } from '../game/level';
import { LivingEntity } from './living';
import { Entity } from './entity';
import type { Player } from './player';
import { Mob } from './mob';
import { PrimedTnt } from './tnt';
import { ItemStack, ITEMS } from '../item/item';
import { explode } from '../game/explosion';
import { clipBlocks } from '../game/raycast';
import { onProjectileHit } from '../game/blockRules';
import { fireStateAt, placeFire } from '../game/fire';
import { FLAGS, F_AIR } from '../world/block';
import { DX, DY, DZ } from '../world/dir';

const RAD = 180 / Math.PI;

export abstract class Fireball extends Entity {
  owner: Entity | null;
  protected leftOwner = false;
  readonly stack = new ItemStack(ITEMS.get('fire_charge')!, 1);

  constructor(level: Level, owner: Entity | null, size: number, dirX: number, dirY: number, dirZ: number) {
    super(level);
    this.setSize(size, size);
    this.owner = owner;
    // vanilla assignDirectionalMovement(movement, accelerationPower 0.1)
    const l = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
    this.dx = (dirX / l) * 0.1;
    this.dy = (dirY / l) * 0.1;
    this.dz = (dirZ / l) * 0.1;
  }

  /** what it does to an entity it strikes */
  protected abstract hitEntity(e: Entity): void;
  /** what it does to a block it strikes (face: the side hit, vanilla Direction order) */
  protected hitBlock(_x: number, _y: number, _z: number, _face: number): void {}
  /** after either (vanilla onHit) */
  protected abstract onHit(): void;

  override tick(): void {
    // (vanilla: gone with the one that threw it)
    if (this.owner?.removed) {
      this.remove();
      return;
    }
    this.baseTick();
    const lvl = this.level;
    const x0 = this.x, y0 = this.y + this.height / 2, z0 = this.z;
    if (!this.leftOwner) {
      const o = this.owner;
      this.leftOwner = !o || !o.bb.intersects(this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1));
    }
    let x1 = x0 + this.dx, y1 = y0 + this.dy, z1 = z0 + this.dz;
    const bh = clipBlocks(lvl.world, x0, y0, z0, x1, y1, z1);
    if (bh) {
      x1 = bh.px;
      y1 = bh.py;
      z1 = bh.pz;
    }
    let hit: Entity | null = null, best = Infinity;
    for (const e of lvl.getEntities(this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1), (e) => (e instanceof LivingEntity || e.type === 'end_crystal' || e.type === 'ender_dragon') && e.isPickable(), this)) {
      if (e === this.owner && !this.leftOwner) continue;
      if (e.type === 'player' && (e as Player).gameMode === 'spectator') continue;
      const h = e.bb.inflate(0.3).clip(x0, y0, z0, x1, y1, z1);
      if (h && h.t < best) {
        best = h.t;
        hit = e;
      }
    }
    if (hit || bh) {
      if (hit) this.hitEntity(hit);
      else if (bh) {
        // (vanilla Projectile.onHitBlock: the block hears of it first)
        onProjectileHit(lvl, bh.x, bh.y, bh.z, bh, this);
        this.hitBlock(bh.x, bh.y, bh.z, bh.face);
      }
      this.onHit();
      return;
    }
    // speed up along its heading, smoke trailing
    const v = Math.sqrt(this.dx * this.dx + this.dy * this.dy + this.dz * this.dz) || 1;
    const f = this.inWater ? 0.8 : 0.95;
    const nx = this.x + this.dx, ny = this.y + this.dy, nz = this.z + this.dz;
    this.dx = (this.dx + (this.dx / v) * 0.1) * f;
    this.dy = (this.dy + (this.dy / v) * 0.1) * f;
    this.dz = (this.dz + (this.dz / v) * 0.1) * f;
    const trail = this.trailParticle();
    if (trail) lvl.particles.spawn?.(trail, nx, ny + 0.5, nz, 0, 0, 0);
    this.setPos(nx, ny, nz);
  }

  /** vanilla getTrailParticle */
  protected trailParticle(): string | null {
    return 'smoke';
  }

  /** vanilla Projectile.mayInteract: a mob's fireball changes the world only while mobs may grief */
  protected mayGrief(): boolean {
    return !(this.owner instanceof Mob) || !!this.level.gameRules.mobGriefing;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}

/** vanilla LargeFireball: the ghast's, a burst of the given power where it lands; strike it and it's yours */
export class LargeFireball extends Fireball {
  readonly type = 'fireball';
  constructor(level: Level, owner: Entity | null, dirX: number, dirY: number, dirZ: number, readonly power: number) {
    super(level, owner, 1, dirX, dirY, dirZ);
  }
  override isPickable(): boolean {
    return true;
  }
  /** vanilla ProjectileDeflection.AIM_DEFLECT: a blow sends it off the way the striker looks, and makes it theirs */
  override hurt(_amount: number, _source: string, attacker?: Entity | null): boolean {
    if (!attacker) return false;
    const yr = attacker.yaw / RAD, pr = attacker.pitch / RAD;
    this.dx = -Math.sin(yr) * Math.cos(pr);
    this.dy = -Math.sin(pr);
    this.dz = Math.cos(yr) * Math.cos(pr);
    this.owner = attacker;
    this.leftOwner = false;
    return true;
  }
  /** vanilla LargeFireball.onHitEntity: 6 fireball damage */
  protected hitEntity(e: Entity): void {
    e.hurt(6, 'fireball', this.owner ?? this, this);
  }
  /** then the blast, with fire where mobs may grief */
  protected onHit(): void {
    explode(this.level, this, this.x, this.y, this.z, this.power, !!this.level.gameRules.mobGriefing, 'mob');
    this.remove();
  }
}

/** vanilla SmallFireball: the blaze's; 5 fireball damage and 5 s of burning, or a fire where it strikes a block */
export class SmallFireball extends Fireball {
  readonly type = 'small_fireball';
  constructor(level: Level, owner: Entity | null, dirX: number, dirY: number, dirZ: number) {
    super(level, owner, 0.3125, dirX, dirY, dirZ);
  }
  /** vanilla SmallFireball.onHitEntity: set alight, and if the hit didn't land, as it was */
  protected hitEntity(e: Entity): void {
    const fire = e.remainingFireTicks;
    e.igniteForSeconds(5);
    if (!e.hurt(5, 'fireball', this.owner ?? this, this)) e.remainingFireTicks = fire;
  }
  /** vanilla SmallFireball.onHitBlock: fire on the struck face; TntBlock.onProjectileHit: a burning projectile lights TNT */
  protected override hitBlock(x: number, y: number, z: number, face: number): void {
    if (!this.mayGrief()) return;
    const lvl = this.level;
    if (lvl.getBlockName(x, y, z) === 'tnt') {
      lvl.setBlock(x, y, z, 0);
      PrimedTnt.prime(lvl, x, y, z, this.owner instanceof LivingEntity ? this.owner : null);
      return;
    }
    const fx = x + DX[face], fy = y + DY[face], fz = z + DZ[face];
    if (FLAGS[lvl.getState(fx, fy, fz)] & F_AIR) placeFire(lvl, fx, fy, fz, fireStateAt(lvl.world, fx, fy, fz));
  }
  protected onHit(): void {
    this.remove();
  }
}
