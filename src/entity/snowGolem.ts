// The snow golem (vanilla 1.21 SnowGolem): two snow blocks under a carved pumpkin or jack o'lantern come to life as
// one (game/golems.ts). It wanders about leaving a trail of snow where snow can lie, pelts monsters within 10 blocks
// with snowballs (which only knock them back, but for blazes), and melts away in hot places (the desert, savannas,
// badlands and the Nether) and in water or rain. Shears take its pumpkin off, showing its face.

import { Mob, type MobCategory } from './mob';
import type { Level } from '../game/level';
import type { LivingEntity } from './living';
import type { Player } from './player';
import { ItemStack } from '../item/item';
import { hurtAndBreak } from '../item/enchantHelper';
import { LookAtPlayerGoal, NearestAttackableMobGoal, RandomLookAroundGoal, RangedAttackGoal, WaterAvoidingRandomStrollGoal, type RangedAttacker } from './ai/goals';
import { isEnemy } from './ironGolem';
import { ThrownItem } from './throwable';
import { BIOMES } from '../world/gen/biomes';
import { FLAGS, F_AIR, S } from '../world/block';
import { canSurvive } from '../game/blockRules';
import type { LootEntry } from './mob';

/** vanilla #snow_golem_melts: the hot biomes (over 1.0 degrees) */
const MELTS = new Set(['badlands', 'basalt_deltas', 'crimson_forest', 'desert', 'eroded_badlands', 'nether_wastes', 'savanna', 'savanna_plateau', 'soul_sand_valley', 'warped_forest', 'windswept_savanna', 'wooded_badlands']);

export class SnowGolem extends Mob implements RangedAttacker {
  readonly type = 'snow_golem';
  readonly category: MobCategory = 'misc';
  /** vanilla DATA_PUMPKIN_ID: its pumpkin on (shears take it off) */
  hasPumpkin = true;

  constructor(level: Level) {
    super(level);
    this.setSize(0.7, 1.9);
    this.maxHealth = this.health = 4;
    this.moveSpeedAttr = 0.2;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new RangedAttackGoal(this, 1.25, 20, 20, 10));
    this.goalSelector.addGoal(2, new WaterAvoidingRandomStrollGoal(this, 1.0, 1.0000001e-5));
    this.goalSelector.addGoal(3, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(4, new RandomLookAroundGoal(this));
    // (vanilla NearestAttackableTargetGoal(Mob, 10, true, false, Enemy): every monster in sight, creepers too)
    this.targetSelector.addGoal(1, new NearestAttackableMobGoal(this, (e) => isEnemy(e), true, 10));
  }

  override get eyeHeight(): number {
    return 1.7;
  }

  /** vanilla AbstractGolem.removeWhenFarAway: it stays */
  override removeWhenFarAway(): boolean {
    return false;
  }

  /** vanilla isSensitiveToWater: water and rain wear it away */
  override isSensitiveToWater(): boolean {
    return true;
  }

  /** vanilla SnowGolem.aiStep: melting where it's hot, and the snow trail under its four corners */
  override aiStep(): void {
    super.aiStep();
    if (!this.isAlive) return;
    // (vanilla LivingEntity.aiStep: isSensitiveToWater)
    if (this.isInWaterOrRainNow()) this.hurt(1, 'drown');
    const w = this.level.world;
    if (MELTS.has(BIOMES[w.getBiome(Math.floor(this.x), Math.floor(this.z))]?.name ?? '')) this.hurt(1, 'onFire');
    if (!this.isAlive || !this.level.gameRules.mobGriefing) return;
    const snow = S('snow');
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(this.x + (((i % 2) * 2 - 1) * 0.25));
      const y = Math.floor(this.y);
      const z = Math.floor(this.z + ((((i >> 1) % 2) * 2 - 1) * 0.25));
      if (FLAGS[w.getState(x, y, z)] & F_AIR && canSurvive(w, x, y, z, snow)) {
        this.level.setBlock(x, y, z, snow);
        this.level.gameEvent?.('block_place', x + 0.5, y + 0.5, z + 0.5, { entity: this, state: snow });
      }
    }
  }

  /** vanilla performRangedAttack: a snowball at the target's middle, lobbed a little high with the distance */
  performRangedAttack(target: LivingEntity, _power: number): void {
    const s = new ThrownItem(this.level, 'snowball', this);
    const dx = target.x - this.x;
    const dy = target.y + target.eyeHeight - 1.1 - s.y;
    const dz = target.z - this.z;
    const h = Math.sqrt(dx * dx + dz * dz) * 0.2;
    s.shoot(dx, dy + h, dz, 1.6, 12);
    this.playSound('entity.snow_golem.shoot', 1, 0.4 / (this.random.nextFloat() * 0.4 + 0.8));
    this.level.addEntity(s);
  }

  /** vanilla entities/snow_golem: 0-15 snowballs */
  override lootTable(): LootEntry[] {
    return [{ item: 'snowball', min: 0, max: 15, noLooting: true }];
  }

  /** vanilla Shearable.readyForShearing */
  readyForShearing(): boolean {
    return this.isAlive && this.hasPumpkin;
  }

  /** vanilla SnowGolem.shear: its pumpkin comes off, dropped from its head */
  shear(): void {
    this.playSound('entity.snow_golem.shear', 1, 1);
    this.hasPumpkin = false;
    this.spawnAtLocation(ItemStack.of('carved_pumpkin', 1), this.eyeHeight);
  }

  /** vanilla SnowGolem.mobInteract: shears, if it has a pumpkin to take off; true when the click did something */
  interact(p: Player, stack: ItemStack | null): boolean {
    if (stack?.item.id !== 'shears' || !this.readyForShearing()) return false;
    this.shear();
    this.level.gameEvent?.('shear', this.x, this.y, this.z, { entity: p });
    if (hurtAndBreak(stack, 1, p.gameMode === 'creative')) {
      p.inventory.setSelectedItem(null);
      this.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
    }
    p.inventory.version++;
    return true;
  }

  // --- sounds (vanilla sounds.json: no voice of its own; hurt and dying it crunches like snow) ---

  /** (vanilla entity.snow_golem.ambient has no sounds in it) */
  override ambientSound(): string | null {
    return null;
  }

  override hurtSound(): string {
    return 'entity.snow_golem.hurt';
  }

  override deathSound(): string {
    return 'entity.snow_golem.death';
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), Pumpkin: this.hasPumpkin };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (d.Pumpkin !== undefined) this.hasPumpkin = d.Pumpkin === true;
  }
}
