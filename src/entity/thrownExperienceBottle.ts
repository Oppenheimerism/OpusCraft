// A thrown bottle o' enchanting (vanilla ThrownExperienceBottle): it arcs down faster than a snowball, and where it
// breaks (the splash of a water potion) 3 to 11 experience comes out. Thrown by players, or shot from a dispenser.

import { ThrownItem } from './throwable';
import type { LivingEntity } from './living';
import type { Entity } from './entity';
import type { Level } from '../game/level';
import type { Player } from './player';
import { ItemStack, ITEMS } from '../item/item';
import { splashPotionBreak } from './thrownPotion';
import { registerItemBehavior } from '../game/itemBehavior';

/** vanilla PotionContents.getColor(Potions.WATER) */
const WATER_COLOR = 0x385dc6;

export class ThrownExperienceBottle extends ThrownItem {
  override readonly type = 'experience_bottle';
  constructor(level: Level, owner: LivingEntity | null) {
    super(level, 'potion', owner, new ItemStack(ITEMS.get('experience_bottle')!, 1));
  }
  /** vanilla getDefaultGravity */
  protected override gravity(): number {
    return 0.07;
  }
  /** (vanilla: it does nothing to what it strikes but break on it) */
  protected override onHitEntity(_e: Entity): void {}
  /** vanilla onHit: level event 2002 in the water potion's colour, and the experience */
  protected override onHit(): void {
    const lvl = this.level;
    splashPotionBreak(lvl, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), WATER_COLOR, false);
    lvl.awardExperience(this.x, this.y, this.z, 3 + lvl.random.nextInt(5) + lvl.random.nextInt(5));
    this.remove();
  }
}

// vanilla ExperienceBottleItem.use: thrown from the eye, 20° up, a little slower than a snowball
registerItemBehavior('experience_bottle', {
  use(level: Level, p: Player) {
    level.sound.play('entity.experience_bottle.throw', p.x, p.y, p.z, 0.5, 0.4 / (level.random.nextFloat() * 0.4 + 0.8));
    const t = new ThrownExperienceBottle(level, p);
    t.shootFromRotation(p, p.pitch, p.yaw, -20, 0.7, 1);
    level.addEntity(t);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    p.swing();
    return 'success';
  },
});
