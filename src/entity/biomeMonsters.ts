// The desert's and the snowfields' own zombie and skeleton (vanilla Husk, Stray). The husk walks by day as well as
// night, since the sun doesn't burn it, and a bare-handed blow from one leaves you hungry; held under water for half a
// minute it turns into a plain zombie. The stray haunts the snowy plains and the ice spikes, and every arrow it
// shoots slows what it hits for thirty seconds.

import { Zombie, Skeleton } from './monsters';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { LootEntry } from './mob';
import type { Arrow } from './arrow';
import { MobEffectInstance, MOB_EFFECTS, saveEffect } from './effects';
import { ItemStack, ITEMS } from '../item/item';

export class Husk extends Zombie {
  override readonly type: string = 'husk';

  /** vanilla Husk.isSunSensitive */
  protected override isSunSensitive(): boolean {
    return false;
  }
  /** vanilla Husk.convertsInWater and doUnderWaterConversion: it becomes a zombie (level event 1041) */
  protected override underWaterConversion(): { type: string; sound: string } {
    return { type: 'zombie', sound: 'entity.husk.converted_to_zombie' };
  }
  /**
   * vanilla Husk.doHurtTarget: an empty-handed hit gives Hunger for 7 seconds for each whole point of the local
   * difficulty (none at all on a fresh easy world)
   */
  override doHurtTarget(target: Entity): boolean {
    const ok = super.doHurtTarget(target);
    if (ok && !this.mainHand && target instanceof LivingEntity) {
      const t = 140 * Math.trunc(this.spawnDifficulty().effective);
      if (t > 0) target.addEffect(new MobEffectInstance(MOB_EFFECTS.hunger, t), this);
    }
    return ok;
  }
  override ambientSound(): string {
    return 'entity.husk.ambient';
  }
  override hurtSound(): string {
    return 'entity.husk.hurt';
  }
  override deathSound(): string {
    return 'entity.husk.death';
  }
  override stepSound(): string {
    return 'entity.husk.step';
  }
}

export class Stray extends Skeleton {
  override readonly type: string = 'stray';

  /**
   * vanilla Stray.getArrow: the arrow carries Slowness for 30 seconds as a custom effect, so it lands in full (a
   * tipped arrow's potion lasts an eighth as long), and it trails the effect's colour as it flies
   */
  protected override getArrow(): Arrow {
    const a = super.getArrow();
    const slow = saveEffect(new MobEffectInstance(MOB_EFFECTS.slowness, 600));
    a.setPickupStack(new ItemStack(ITEMS.get('arrow')!, 1, 0, { potion: { customEffects: [slow] } }));
    return a;
  }
  override ambientSound(): string {
    return 'entity.stray.ambient';
  }
  override hurtSound(): string {
    return 'entity.stray.hurt';
  }
  override deathSound(): string {
    return 'entity.stray.death';
  }
  override stepSound(): string {
    return 'entity.stray.step';
  }
  /** vanilla entities/stray: the skeleton's arrows and bones, and when a player kills it, maybe an arrow of slowness */
  override lootTable(): LootEntry[] {
    return [
      { item: 'arrow', min: 0, max: 2 },
      { item: 'bone', min: 0, max: 2 },
      { item: 'tipped_arrow', min: 0, max: 1, player: true, limit: 1, potion: 'slowness' },
    ];
  }
}
