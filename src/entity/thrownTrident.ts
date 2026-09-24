// The thrown trident (vanilla ThrownTrident): an arrow that always hits for 8 (more with impaling against what lives
// in the water), then drops away from what it struck. It hits only once. With loyalty, a trident that has hit, or
// has lain 5 ticks where it landed, flies back through everything to its thrower, faster the higher the loyalty.
// With channeling, a hit in a thunderstorm on anything under the open sky calls down lightning. The drowned throw
// them too, but theirs can't be picked up.

import { Arrow } from './arrow';
import type { Entity } from './entity';
import type { Level } from '../game/level';
import { LivingEntity } from './living';
import type { Player } from './player';
import { ItemStack } from '../item/item';
import { damageBonus, levelOf } from '../item/enchantHelper';
import { doPostAttackEffects, channel } from '../game/enchantEffects';

export class ThrownTrident extends Arrow {
  override readonly type: string = 'trident';
  /** vanilla dealtDamage: it has hit something, or lain still long enough (it can't hit anything again) */
  dealtDamage = false;
  /** vanilla clientSideReturnTridentTickCount: ticks it has been flying back */
  returningTicks = 0;

  constructor(level: Level, owner?: LivingEntity | null, stack?: ItemStack) {
    super(level, owner);
    this.hitSound = 'item.trident.hit_ground';
    this.setPickupStack(stack ?? ItemStack.of('trident'));
  }

  /** vanilla ID_LOYALTY (from the trident's loyalty: how fast it comes back) */
  get loyalty(): number {
    return Math.max(0, Math.min(127, levelOf(this.pickupStack, 'loyalty')));
  }

  /** vanilla ID_FOIL: an enchanted trident shimmers in flight */
  get foil(): boolean {
    return this.pickupStack.hasGlint();
  }

  /**
   * vanilla ThrownTrident.tick: once it has done its damage, a loyal trident whose thrower is still around turns
   * homing: no physics, pulled up level with the thrower's eyes and towards them (5 % of its speed a loyalty level,
   * slowing by 5 % a tick), with the return sound as it sets off. If the thrower is gone it drops where it is
   */
  override tick(): void {
    if (this.inGroundTime > 4) this.dealtDamage = true;
    const owner = this.owner;
    const i = this.loyalty;
    if (i > 0 && (this.dealtDamage || this.noPhysics) && owner) {
      if (!this.isAcceptableReturnOwner()) {
        if (this.pickup === 'allowed') this.dropAsItem();
        this.remove();
        return;
      }
      this.noPhysics = true;
      const vx = owner.x - this.x, vy = owner.y + owner.eyeHeight - this.y, vz = owner.z - this.z;
      this.setPos(this.x, this.y + vy * 0.015 * i, this.z);
      this.yo = this.y;
      const d0 = 0.05 * i;
      const l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      this.dx = this.dx * 0.95 + (vx / l) * d0;
      this.dy = this.dy * 0.95 + (vy / l) * d0;
      this.dz = this.dz * 0.95 + (vz / l) * d0;
      if (this.returningTicks === 0) this.level.sound.play('item.trident.return', this.x, this.y, this.z, 10, 1);
      this.returningTicks++;
    }
    super.tick();
  }

  /** vanilla isAcceptibleReturnOwner: alive, and not a spectator */
  private isAcceptableReturnOwner(): boolean {
    const o = this.owner;
    if (!o || o.removed || (o instanceof LivingEntity && !o.isAlive)) return false;
    return o.type !== 'player' || (o as Player).gameMode !== 'spectator';
  }

  /** vanilla findHitEntity: nothing once it has dealt its damage */
  protected override findHitEntity(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Entity | null {
    return this.dealtDamage ? null : super.findHitEntity(x0, y0, z0, x1, y1, z1);
  }

  /**
   * vanilla ThrownTrident.onHitEntity: 8 damage plus the trident's own damage enchantment (impaling, against the
   * #sensitive_to_impaling), from its thrower; channeling's lightning and the other post-attack effects (not on an
   * enderman, which dodges); then it bounces back a touch and drops
   */
  protected override onHitEntity(e: Entity): void {
    const weapon = this.pickupStack;
    const f = 8 + damageBonus(weapon, e);
    const owner = this.owner;
    this.dealtDamage = true;
    if (e.hurt(f, 'trident', owner ?? this, this)) {
      if (e.type === 'enderman') return;
      if (owner && owner === this.level.player) this.level.onPlayerTridentHit?.(e);
      channel(this.level, e, owner, weapon);
      if (e instanceof LivingEntity) doPostAttackEffects(e, owner, weapon, false);
    }
    this.dx *= -0.01;
    this.dy *= -0.1;
    this.dz *= -0.01;
    this.level.sound.play('item.trident.hit', this.x, this.y, this.z, 1, 1);
  }

  /** vanilla getWaterInertia: it keeps its speed under water */
  protected override waterInertia(): number {
    return 0.99;
  }

  /** vanilla tickDespawn: a loyal trident that can be picked up never goes */
  protected override tickDespawn(): void {
    if (this.pickup !== 'allowed' || this.loyalty <= 0) super.tickDespawn();
  }

  /** vanilla tryPickup: also, flying back, straight into its thrower's hands */
  protected override tryPickup(p: Player): boolean {
    return super.tryPickup(p) || (this.noPhysics && this.owner === p && p.inventory.add(this.pickupStack.copy(), p.gameMode === 'creative') === 0);
  }

  /** vanilla playerTouch: only its thrower (or anyone, if nobody threw it) */
  override playerTouch(p: Player): boolean {
    if (this.owner && this.owner !== p) return false;
    return super.playerTouch(p);
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { dealtDamage: this.dealtDamage };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.dealtDamage = d.dealtDamage === true;
  }
}
