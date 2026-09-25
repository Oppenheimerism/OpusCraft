// (trial chambers) The bogged (1.21; vanilla Bogged): the swamp's skeleton, mossy and grown over with mushrooms. It
// fights as a skeleton does, with a bow, but its arrows poison what they hit for five seconds, and it waits longer
// before it draws again (two and a half seconds on hard, three and a half otherwise, where a skeleton waits one or
// two), and it burns in the sun as a skeleton does. It has 16 health. Shears take
// its mushrooms off (two of them, red or brown), just once; a dispenser's shears do the same. It walks the swamps and
// mangrove swamps at night, in fours, and trial spawners bring it out as their poisonous skeletons. When a player kills
// it, it may drop an arrow of poison. Drawn as the skeleton is (render/boggedModel.ts), its mushrooms on its head and
// its moss over its bones.

import { Skeleton } from './monsters';
import type { Level } from '../game/level';
import type { Player } from './player';
import type { LootEntry } from './mob';
import type { Arrow } from './arrow';
import { MobEffectInstance, MOB_EFFECTS, saveEffect } from './effects';
import { ItemStack, ITEMS } from '../item/item';
import { hurtAndBreak } from '../item/enchantHelper';

export class Bogged extends Skeleton {
  override readonly type: string = 'bogged';
  /** vanilla DATA_SHEARED: its mushrooms have been shorn off */
  sheared = false;

  constructor(level: Level) {
    super(level);
    // vanilla Bogged.createAttributes: 16 health
    this.maxHealth = this.health = 16;
  }

  /** vanilla Bogged.getHardAttackInterval and getAttackInterval: slower to shoot than a skeleton */
  protected override hardAttackInterval(): number {
    return 50;
  }
  protected override attackInterval(): number {
    return 70;
  }

  /** vanilla Bogged.getArrow: its arrows carry five seconds of poison, in full (a custom effect, as the stray's slowness) */
  protected override getArrow(): Arrow {
    const a = super.getArrow();
    const poison = saveEffect(new MobEffectInstance(MOB_EFFECTS.poison, 100));
    a.setPickupStack(new ItemStack(ITEMS.get('arrow')!, 1, 0, { potion: { customEffects: [poison] } }));
    return a;
  }

  /** vanilla Bogged.readyForShearing */
  readyForShearing(): boolean {
    return !this.sheared && this.isAlive;
  }

  /**
   * vanilla Bogged.shear: the shears' snip, and out of the loot table shearing/bogged two mushrooms (each red or brown)
   * from the top of its head
   */
  shear(): void {
    this.playSound('entity.bogged.shear', 1, 1);
    for (let i = 0; i < 2; i++) this.spawnAtLocation(ItemStack.of(this.random.nextInt(2) === 0 ? 'brown_mushroom' : 'red_mushroom', 1), this.height);
    this.sheared = true;
  }

  /** vanilla Bogged.mobInteract: shears, if it still has its mushrooms (a point of wear on them); true when the click did something */
  interact(p: Player, stack: ItemStack | null): boolean {
    if (stack?.item.id !== 'shears' || !this.readyForShearing()) return false;
    this.shear();
    if (hurtAndBreak(stack, 1, p.gameMode === 'creative')) {
      p.inventory.setSelectedItem(null);
      this.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
    }
    p.inventory.version++;
    return true;
  }

  override ambientSound(): string {
    return 'entity.bogged.ambient';
  }
  override hurtSound(): string {
    return 'entity.bogged.hurt';
  }
  override deathSound(): string {
    return 'entity.bogged.death';
  }
  override stepSound(): string {
    return 'entity.bogged.step';
  }

  /** vanilla entities/bogged: the skeleton's arrows and bones, and when a player kills it, maybe an arrow of poison */
  override lootTable(): LootEntry[] {
    return [
      { item: 'arrow', min: 0, max: 2 },
      { item: 'bone', min: 0, max: 2 },
      { item: 'tipped_arrow', min: 0, max: 1, player: true, limit: 1, potion: 'poison' },
    ];
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), sheared: this.sheared };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.sheared = d.sheared === true;
  }
}
