// The ender dragon's fireball (vanilla DragonFireball): a slow purple ball it
// spits while swooping at a player, trailing dragon's breath. It does no harm
// itself: wherever it bursts it leaves a cloud of breath (instant damage II
// every second to whatever stands in it), laid round the first living thing
// within four blocks, that spreads from a radius of 3 to 7 over 30 seconds.
// It can't be hit back.

import { Fireball } from './fireball';
import { Entity } from './entity';
import { LivingEntity } from './living';
import type { Level } from '../game/level';
import { AreaEffectCloud } from './areaEffectCloud';

export class DragonFireball extends Fireball {
  readonly type = 'dragon_fireball';
  private struck: Entity | null = null;

  constructor(level: Level, owner: Entity | null, dirX: number, dirY: number, dirZ: number) {
    super(level, owner, 1, dirX, dirY, dirZ);
  }

  override isPickable(): boolean {
    return false;
  }
  /** (vanilla: nothing hurts it, nor turns it back) */
  override hurt(): boolean {
    return false;
  }
  protected override trailParticle(): string | null {
    return 'dragon_breath';
  }
  /** (vanilla AbstractHurtingProjectile: striking something does nothing by itself) */
  protected hitEntity(e: Entity): void {
    this.struck = e;
  }

  /** vanilla DragonFireball.onHit: the cloud (unless it struck whoever spat it), the burst (level event 2006), gone */
  protected onHit(): void {
    const struck = this.struck;
    this.struck = null;
    if (struck && struck === this.owner) return;
    const lvl = this.level;
    const cloud = new AreaEffectCloud(lvl, this.x, this.y, this.z);
    if (this.owner instanceof LivingEntity) cloud.owner = this.owner;
    cloud.particle = 'dragon_breath';
    cloud.radius = 3;
    cloud.duration = 600;
    cloud.radiusPerTick = Math.fround((7 - cloud.radius) / cloud.duration);
    // vanilla MobEffectInstance(HARM, 1, 1): instant damage II
    cloud.harm = 1;
    for (const e of lvl.getEntities(this.bb.inflate(4, 2, 4), (e) => e instanceof LivingEntity)) {
      if (this.distanceToSqr(e.x, e.y, e.z) < 16) {
        cloud.setPos(e.x, e.y, e.z);
        break;
      }
    }
    dragonBreathBurst(lvl, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), true);
    lvl.addEntity(cloud);
    this.remove();
  }
}

/** vanilla level event 2006: 200 puffs of breath flung out flat from the block (and the burst's sound) */
export function dragonBreathBurst(level: Level, x: number, y: number, z: number, sound: boolean): void {
  const r = level.random;
  const TWO_PI = Math.fround(Math.PI * 2);
  for (let i = 0; i < 200; i++) {
    const f = Math.fround(r.nextFloat() * 4);
    const a = Math.fround(r.nextFloat() * TWO_PI);
    const dx = Math.cos(a) * f, dz = Math.sin(a) * f;
    const dy = 0.01 + r.nextDouble() * 0.5;
    // (vanilla Particle.setPower(f): the speed scaled by f again, the rise about 0.1)
    level.particles.spawn?.('dragon_breath', x + dx * 0.1, y + 0.3, z + dz * 0.1, dx * f, (dy - Math.fround(0.1)) * f + Math.fround(0.1), dz * f);
  }
  if (sound) level.sound.play('entity.dragon_fireball.explode', x + 0.5, y + 0.5, z + 0.5, 1, r.nextFloat() * 0.1 + 0.9);
}
