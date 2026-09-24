// vanilla EyeOfEnder: an eye of ender thrown into the air to find the nearest stronghold. It heads for a point
// 12 blocks toward the stronghold and 8 up (or for the stronghold itself when that's nearer), speeding up
// gently and bobbing about that height, through anything in its way, with a trail of portal particles (bubbles
// under water). After four seconds it's gone: four times in five it drops back as an item, and otherwise it
// shatters in a burst of eye crumbs and a ring of portal particles. It glows (render/entityRenderers.ts).

import { Entity } from './entity';
import { ItemEntity } from './itemEntity';
import type { Level } from '../game/level';
import type { ItemStack } from '../item/item';

const RAD = 180 / Math.PI;
const F0015 = Math.fround(0.015);

/** vanilla Projectile.lerpRotation: a fifth of the way round to the new heading, the short way */
function lerpRotation(from: number, to: number): number {
  while (to - from < -180) from -= 360;
  while (to - from >= 180) from += 360;
  return from + 0.2 * (to - from);
}

/** a standard normal draw (vanilla RandomSource.nextGaussian) */
function gaussian(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

/** vanilla level event 2003: an eye of ender shattering over a block, its crumbs and two rings of portal particles */
export function eyeShatter(level: Level, x: number, y: number, z: number): void {
  const ps = level.particles;
  const cx = x + 0.5, cz = z + 0.5;
  for (let i = 0; i < 8; i++) ps.spawn?.('item_ender_eye', cx, y, cz, gaussian() * 0.15, Math.random() * 0.2, gaussian() * 0.15);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 20) {
    const c = Math.cos(a), s = Math.sin(a);
    ps.spawn?.('portal', cx + c * 5, y - 0.4, cz + s * 5, c * -5, 0, s * -5);
    ps.spawn?.('portal', cx + c * 5, y - 0.4, cz + s * 5, c * -7, 0, s * -7);
  }
}

export class EyeOfEnder extends Entity {
  readonly type = 'eye_of_ender';
  /** what it looks like and drops as (vanilla DATA_ITEM_STACK: one of the eyes it was thrown from) */
  readonly stack: ItemStack;
  private tx = 0;
  private ty = 0;
  private tz = 0;
  life = 0;
  /** whether it drops as an item at the end (4 in 5) or shatters */
  surviveAfterDeath = false;

  constructor(level: Level, x: number, y: number, z: number, stack: ItemStack) {
    super(level);
    // vanilla EntityType.EYE_OF_ENDER: sized(0.25, 0.25)
    this.setSize(0.25, 0.25);
    this.moveTo(x, y, z);
    this.stack = stack.copyWithCount(1);
  }

  /** vanilla signalTo: where it heads (at most 12 blocks along the way to the stronghold, 8 up), and its fate */
  signalTo(x: number, y: number, z: number): void {
    const f = x - this.x, g = z - this.z;
    const h = Math.sqrt(f * f + g * g);
    if (h > 12) {
      this.tx = this.x + (f / h) * 12;
      this.tz = this.z + (g / h) * 12;
      this.ty = this.y + 8;
    } else {
      this.tx = x;
      this.ty = y;
      this.tz = z;
    }
    this.life = 0;
    this.surviveAfterDeath = Math.floor(Math.random() * 5) > 0;
  }

  /** where it's heading */
  get target(): [number, number, number] {
    return [this.tx, this.ty, this.tz];
  }

  override tick(): void {
    super.tick();
    if (this.removed) return;
    const vx = this.dx, vy = this.dy, vz = this.dz;
    const d = this.x + vx, e = this.y + vy, f = this.z + vz;
    const g = Math.sqrt(vx * vx + vz * vz);
    this.pitch = lerpRotation(this.pitchO, Math.atan2(vy, g) * RAD);
    this.yaw = lerpRotation(this.yawO, Math.atan2(vx, vz) * RAD);
    // steering: its speed across creeps toward the distance left, slowing right down within a block of it;
    // up or down it eases toward 1 a tick, toward its height
    const h = this.tx - d, i = this.tz - f;
    const j = Math.fround(Math.sqrt(h * h + i * i));
    const k = Math.fround(Math.atan2(i, h));
    let l = g + 0.0025 * (j - g);
    let m = vy;
    if (j < 1) {
      l *= 0.8;
      m *= 0.8;
    }
    const n = this.y < this.ty ? 1 : -1;
    this.dx = Math.cos(k) * l;
    this.dy = m + (n - m) * F0015;
    this.dz = Math.sin(k) * l;
    const ps = this.level.particles;
    if (this.inWater) {
      for (let p = 0; p < 4; p++) ps.spawn?.('bubble', d - this.dx * 0.25, e - this.dy * 0.25, f - this.dz * 0.25, this.dx, this.dy, this.dz);
    } else {
      ps.spawn?.('portal', d - this.dx * 0.25 + Math.random() * 0.6 - 0.3, e - this.dy * 0.25 - 0.5, f - this.dz * 0.25 + Math.random() * 0.6 - 0.3, this.dx, this.dy, this.dz);
    }
    this.setPos(d, e, f);
    if (++this.life > 80) {
      this.level.sound.play('entity.ender_eye.death', this.x, this.y, this.z, 1, 1);
      this.remove();
      if (this.surviveAfterDeath) {
        // (vanilla new ItemEntity(level, x, y, z, stack): a little random motion, and no pickup delay)
        const it = new ItemEntity(this.level, this.stack.copy());
        it.moveTo(this.x, this.y, this.z, Math.random() * 360, 0);
        it.dx = Math.random() * 0.2 - 0.1;
        it.dy = 0.2;
        it.dz = Math.random() * 0.2 - 0.1;
        it.pickupDelay = 0;
        this.level.addEntity(it);
      } else {
        eyeShatter(this.level, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
      }
    }
  }

  /** vanilla getLightLevelDependentMagicValue: 1 */
  override lightMagic(): number {
    return 1;
  }
}
