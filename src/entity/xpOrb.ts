// Experience orbs (vanilla ExperienceOrb): value sizes, attraction to the
// player, merging, pickup.

import { Entity } from './entity';
import type { Level } from '../game/level';
import type { Player } from './player';
import { FLUID_WATER } from '../world/fluids';
import { repairWithXp } from '../item/enchantHelper';

const VALUES = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1];

export class ExperienceOrb extends Entity {
  readonly type = 'experience_orb';
  age = 0;
  health = 5;
  count = 1;
  private following: Player | null = null;

  constructor(level: Level, x: number, y: number, z: number, public value: number) {
    super(level);
    this.setSize(0.5, 0.5);
    this.moveTo(x, y, z, Math.random() * 360, 0);
    this.dx = (Math.random() * 0.2 - 0.1) * 2;
    this.dy = Math.random() * 0.2 * 2;
    this.dz = (Math.random() * 0.2 - 0.1) * 2;
  }

  /** vanilla getExperienceValue: the largest orb size not exceeding `amount` */
  static valueFor(amount: number): number {
    for (const v of VALUES) if (amount >= v) return v;
    return 1;
  }

  /** texture cell 0..10 */
  get icon(): number {
    const v = this.value;
    if (v >= 2477) return 10;
    if (v >= 1237) return 9;
    if (v >= 617) return 8;
    if (v >= 307) return 7;
    if (v >= 149) return 6;
    if (v >= 73) return 5;
    if (v >= 37) return 4;
    if (v >= 17) return 3;
    if (v >= 7) return 2;
    if (v >= 3) return 1;
    return 0;
  }

  override tick(): void {
    this.baseTick();
    if (this.eyeFluid === FLUID_WATER) {
      this.dx *= 0.99;
      this.dz *= 0.99;
      if (this.dy < 0.06) this.dy += 5.0e-4;
    } else this.dy -= 0.03;
    if (this.inLava) {
      this.dy = 0.2;
      this.dx = (Math.random() - Math.random()) * 0.2;
      this.dz = (Math.random() - Math.random()) * 0.2;
    }
    if (this.tickCount % 20 === 1) this.scanForEntities();
    const p = this.following;
    if (p && (p.gameMode === 'spectator' || p.health <= 0)) this.following = null;
    if (this.following) {
      const f = this.following;
      const vx = f.x - this.x, vy = f.y + f.eyeHeight / 2 - this.y, vz = f.z - this.z;
      const d0 = vx * vx + vy * vy + vz * vz;
      if (d0 < 64) {
        const d1 = 1 - Math.sqrt(d0) / 8;
        const l = Math.sqrt(d0) || 1;
        const k = d1 * d1 * 0.1;
        this.dx += (vx / l) * k;
        this.dy += (vy / l) * k;
        this.dz += (vz / l) * k;
      }
    }
    this.move(this.dx, this.dy, this.dz);
    let f = 0.98;
    if (this.onGround) f = this.blockFriction() * 0.98;
    this.dx *= f;
    this.dy *= 0.98;
    this.dz *= f;
    if (this.onGround) this.dy *= -0.9;
    this.age++;
    if (this.age >= 6000) this.remove();
  }

  private scanForEntities(): void {
    const p = this.level.player;
    if (!this.following || this.following.distanceToSqr(this.x, this.y, this.z) > 64) {
      this.following = p && p.gameMode !== 'spectator' && p.health > 0 && p.distanceToSqr(this.x, this.y, this.z) < 64 ? p : null;
    }
    // merge with nearby orbs of the same value (vanilla tryMergeToExisting)
    for (const e of this.level.getEntities(this.bb.inflate(0.5), (e) => e instanceof ExperienceOrb, this)) {
      const o = e as ExperienceOrb;
      if (o.value !== this.value || o.removed) continue;
      this.count += o.count;
      this.age = Math.min(this.age, o.age);
      o.remove();
    }
  }

  override hurt(amount: number, source: string): boolean {
    if (source === 'lava' || source === 'onFire') return false;
    this.health -= amount;
    if (this.health <= 0) this.remove();
    return true;
  }

  /** vanilla playerTouch: one orb per 2 ticks; mending soaks up what it needs first (repairPlayerItems) */
  playerTouch(p: Player): boolean {
    if (p.takeXpDelay > 0) return false;
    p.takeXpDelay = 2;
    p.take(this, 1);
    const left = repairWithXp(p, this.value);
    if (left !== this.value) p.inventory.version++;
    if (left > 0) p.giveExperiencePoints(left);
    if (--this.count === 0) this.remove();
    return true;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}
