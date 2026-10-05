// A lingering cloud (vanilla AreaEffectCloud): a flat disc half a block tall
// that waits a second, then for its duration gives its effect to anything
// alive standing in it, each at most once a second. It is never drawn — only
// its particles show: two small puffs a tick while it waits, then puffs all
// over the disc. The ender dragon leaves them as its breath: the fireball's
// burst (radius 3, growing to 7 over 30 seconds) and the breath it lays down
// perched on the portal. A glass bottle held near one of the dragon's fills
// with dragon's breath and shrinks it.

import { Entity } from './entity';
import { LivingEntity } from './living';
import type { Level } from '../game/level';
import { Rand } from '../core/rng';

export class AreaEffectCloud extends Entity {
  readonly type = 'area_effect_cloud';
  /** vanilla owner: who the effect's damage is blamed on */
  owner: LivingEntity | null = null;
  private radiusValue = 3;
  /** vanilla duration: ticks it lasts once it has waited */
  duration = 600;
  /** vanilla waitTime: a second before it does anything */
  waitTime = 20;
  /** vanilla reapplicationDelay: how long before the same one is caught again */
  reapplicationDelay = 20;
  /** vanilla radiusPerTick (the dragon fireball's grows) */
  radiusPerTick = 0;
  /** vanilla getParticle: the particle it shows */
  particle = 'dragon_breath';
  /** the instant damage it carries (vanilla MobEffects.HARM's amplifier), -1 for none */
  harm = -1;
  /** vanilla victims: who has been caught, and when they can be again */
  private readonly victims = new Map<Entity, number>();
  private waiting = false;
  private readonly random = new Rand();

  constructor(level: Level, x: number, y: number, z: number) {
    super(level);
    this.noPhysics = true;
    this.radius = 3;
    this.moveTo(x, y, z);
  }

  get radius(): number {
    return this.radiusValue;
  }
  /** vanilla setRadius: 0 to 32, the box 2r wide and half a block tall */
  set radius(r: number) {
    this.radiusValue = Math.max(0, Math.min(32, r));
    this.setSize(this.radiusValue * 2, 0.5);
  }

  isWaiting(): boolean {
    return this.waiting;
  }

  override tick(): void {
    this.baseTick();
    this.serverTick();
    if (!this.removed) this.level.clientEffects(() => this.clientTick());
  }

  /** (a guest's copy) its puffs are its own, as on vanilla's client: the host sends its radius, not its particles */
  animateMirror(): void {
    this.clientTick();
  }

  /** vanilla AreaEffectCloud.serverTick */
  private serverTick(): void {
    if (this.tickCount >= this.waitTime + this.duration) {
      this.remove();
      return;
    }
    this.waiting = this.tickCount < this.waitTime;
    if (this.waiting) return;
    let f = this.radius;
    if (this.radiusPerTick !== 0) {
      f = Math.fround(f + this.radiusPerTick);
      if (f < 0.5) {
        this.remove();
        return;
      }
      this.radius = f;
    }
    if (this.tickCount % 5 !== 0) return;
    for (const [e, t] of this.victims) if (this.tickCount >= t) this.victims.delete(e);
    if (this.harm < 0) {
      this.victims.clear();
      return;
    }
    for (const e of this.level.getEntities(this.bb, (e) => e instanceof LivingEntity)) {
      const le = e as LivingEntity;
      // (vanilla isAffectedByPotions: not while dying)
      if (this.victims.has(le) || le.health <= 0) continue;
      const d0 = le.x - this.x, d1 = le.z - this.z;
      if (d0 * d0 + d1 * d1 > f * f) continue;
      this.victims.set(le, this.tickCount + this.reapplicationDelay);
      // vanilla HealOrHarmMobEffect.applyInstantenousEffect at half strength: the undead are healed
      if (le.isUndead()) le.heal(Math.trunc(0.5 * (4 << this.harm) + 0.5));
      else le.hurt(Math.trunc(0.5 * (6 << this.harm) + 0.5), 'indirectMagic', this.owner ?? this, this);
    }
  }

  /**
   * vanilla AreaEffectCloud.clientTick: the puffs (always drawn, however far off or many), each client's own (the
   * host's own player's, a guest's copy's)
   */
  private clientTick(): void {
    const r = this.random;
    const waiting = this.waiting;
    if (waiting && r.nextBool()) return;
    const f = this.radius;
    const n = waiting ? 2 : Math.ceil(Math.fround(Math.PI) * f * f);
    const spread = waiting ? 0.2 : f;
    const ps = this.level.particles;
    for (let j = 0; j < n; j++) {
      const f2 = r.nextFloat() * Math.fround(Math.PI * 2);
      const f3 = Math.sqrt(r.nextFloat()) * spread;
      const x = this.x + Math.cos(f2) * f3, z = this.z + Math.sin(f2) * f3;
      if (waiting) ps.spawn?.(this.particle, x, this.y, z, 0, 0, 0);
      else ps.spawn?.(this.particle, x, this.y, z, (0.5 - r.nextDouble()) * 0.15, Math.fround(0.01), (0.5 - r.nextDouble()) * 0.15);
    }
  }

  /** (vanilla NoopRenderer: nothing to hit or pick) */
  override isPickable(): boolean {
    return false;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}

/**
 * vanilla BottleItem.use: a glass bottle held in the dragon's breath — the first live cloud of the dragon's within 2
 * blocks of the player's box — takes some of it (the cloud's radius shrinks by half a block). Null when there's none.
 */
export function takeDragonBreath(level: Level, p: Entity): AreaEffectCloud | null {
  const list = level.getEntities(p.bb.inflate(2), (e) => e instanceof AreaEffectCloud && !e.removed && e.owner?.type === 'ender_dragon');
  if (!list.length) return null;
  const c = list[0] as AreaEffectCloud;
  c.radius = Math.fround(c.radius - 0.5);
  level.sound.play('item.bottle.fill_dragonbreath', p.x, p.y, p.z, 1, 1);
  return c;
}
