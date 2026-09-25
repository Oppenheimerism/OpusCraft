// A thrown splash or lingering potion (vanilla ThrownPotion): it arcs a little heavier than a snowball, and where it
// breaks its effects wash over everything within 4 blocks, weaker further out (all of it for whatever it struck);
// water puts out fires and anything burning, and scalds the water-sensitive. The break itself (vanilla level events
// 2002 and 2007): glass shards, a burst of swirls in the potion's colour, sparkles for an instant one, the smash.

import { ThrownItem } from './throwable';
import { LivingEntity } from './living';
import type { Entity } from './entity';
import type { Level } from '../game/level';
import type { SegmentHit } from '../game/raycast';
import { MobEffectInstance } from './effects';
import { ItemStack } from '../item/item';
import { allEffects, contentsOf, potionColor, potionEffects } from '../item/potions';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { DX, DY, DZ } from '../world/dir';
import { dowseCampfire } from '../game/villageBlocks';

/** hooks for what the game has elsewhere: the lingering potion's cloud (the End's AreaEffectCloud) */
export const THROWN_POTION_HOOKS: { makeCloud: ((p: ThrownPotion) => void) | null } = { makeCloud: null };

/** vanilla nextGaussian */
function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * vanilla LevelRenderer.levelEvent 2002 / 2007 at the block (x, y, z): 8 shards of the bottle, 100 swirls (sparkles
 * for an instant potion) in its colour flung out up to 4 blocks' worth, and the bottle breaking
 */
export function splashPotionBreak(level: Level, x: number, y: number, z: number, color: number, instant: boolean): void {
  const cx = x + 0.5, cz = z + 0.5;
  for (let i = 0; i < 8; i++) level.particles.spawn?.('item_splash_potion', cx, y, cz, gauss() * 0.15, Math.random() * 0.2, gauss() * 0.15);
  const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
  for (let m = 0; m < 100; m++) {
    const pw = Math.random() * 4;
    const a = Math.random() * Math.PI * 2;
    const o = Math.cos(a) * pw, q = Math.sin(a) * pw;
    const p = 0.01 + Math.random() * 0.5;
    const k = 0.75 + Math.random() * 0.25;
    level.particles.spell?.(instant ? 'instant_effect' : 'effect', cx + o * 0.1, y + 0.3, cz + q * 0.1, o, p, q, r * k, g * k, b * k, pw);
  }
  level.sound.play('entity.splash_potion.break', cx, y, cz, 1, Math.random() * 0.1 + 0.9);
}

export class ThrownPotion extends ThrownItem {
  constructor(level: Level, owner: LivingEntity | null, stack: ItemStack) {
    super(level, 'potion', owner, stack);
  }

  /** vanilla ThrownPotion.getDefaultGravity */
  protected override gravity(): number {
    return 0.05;
  }

  /** (vanilla: a potion does nothing to what it strikes but break on it) */
  protected override onHitEntity(_e: Entity): void {}

  /** vanilla ThrownPotion.onHitBlock: water puts out fire in the block it came to and round it */
  protected override onHitBlock(hit: SegmentHit): void {
    if (contentsOf(this.stack)?.potion !== 'water') return;
    const f = hit.face;
    const x = hit.x + DX[f], y = hit.y + DY[f], z = hit.z + DZ[f];
    this.dowseFire(x, y, z);
    this.dowseFire(x - DX[f], y - DY[f], z - DZ[f]);
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) this.dowseFire(x + dx, y, z + dz);
  }

  /** vanilla ThrownPotion.dowseFire: fire goes out, and a lit campfire (candles when the game has them) */
  private dowseFire(x: number, y: number, z: number): void {
    const name = BLOCKS[STATE_BLOCK[this.level.getState(x, y, z)]].name;
    if (name === 'fire' || name === 'soul_fire') this.level.destroyBlock(x, y, z, false);
    else dowseCampfire(this.level, x, y, z);
  }

  /** vanilla ThrownPotion.onHit, where the potion is (it breaks before it moves on) */
  protected override onHit(_x: number, _y: number, _z: number, entity: Entity | null): void {
    const c = contentsOf(this.stack);
    const effects = allEffects(c);
    if (c?.potion === 'water') this.applyWater();
    else if (effects.length) {
      if (this.stack.item.id === 'lingering_potion') THROWN_POTION_HOOKS.makeCloud?.(this);
      else this.applySplash(effects, entity);
    }
    const instant = potionEffects(c?.potion).some((e) => e.effect.instant);
    splashPotionBreak(this.level, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), potionColor(c), instant);
    this.remove();
  }

  /** vanilla ThrownPotion.applyWater */
  private applyWater(): void {
    const box = this.bb.inflate(4, 2, 4);
    for (const e of this.level.getEntities(box, (o) => o instanceof LivingEntity && (o.isSensitiveToWater() || o.isOnFire()))) {
      const le = e as LivingEntity;
      if (this.distanceToSqr(le.x, le.y, le.z) >= 16) continue;
      if (le.isSensitiveToWater()) le.hurt(1, 'indirectMagic', this.owner, this);
      if (le.isOnFire() && le.isAlive) le.clearFire();
    }
    // (Stage 5: ocean) and axolotls in reach are wetted again
    for (const e of this.level.getEntities(box, (o) => o.type === 'axolotl')) (e as unknown as { rehydrate(): void }).rehydrate();
  }

  /**
   * vanilla ThrownPotion.applySplash: each living thing in reach within 4 blocks gets the effects at 1 - d/4 of their
   * strength (what it hit, all of it): instant ones at once, the rest for that share of their time, if it comes to
   * over a second
   */
  private applySplash(effects: MobEffectInstance[], hit: Entity | null): void {
    const box = this.bb.inflate(4, 2, 4);
    const source = this.owner instanceof LivingEntity ? this.owner : this;
    for (const e of this.level.getEntities(box, (o) => o instanceof LivingEntity)) {
      const le = e as LivingEntity;
      if (!le.isAffectedByPotions()) continue;
      const d = this.distanceToSqr(le.x, le.y, le.z);
      if (d >= 16) continue;
      const k = le === hit ? 1 : 1 - Math.sqrt(d) / 4;
      for (const inst of effects) {
        if (inst.effect.instant) inst.effect.applyInstant(this, this.owner, le, inst.amplifier, k);
        else {
          const dur = inst.isInfinite() || inst.duration === 0 ? inst.duration : Math.floor(k * inst.duration + 0.5);
          const x = new MobEffectInstance(inst.effect, dur, inst.amplifier, inst.ambient, inst.visible);
          if (!x.endsWithin(20)) le.addEffect(x, source);
        }
      }
    }
  }
}
