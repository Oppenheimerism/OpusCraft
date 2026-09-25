// The ocelot (vanilla 1.21 Ocelot): the jungle's wild cat, gold with dark spots, one grown ocelot to a group and any
// others its kittens. It runs from players, but one who stands still holding raw cod or salmon can coax it in,
// creeping; feed it then, close by, and one fish in three wins its trust: it stops running from you and stays in the
// world for good. It stalks chickens, lands on its feet from any height, and creepers keep away from it.

import { Animal, BreedGoal, TemptGoal } from './animals';
import type { Level } from '../game/level';
import type { LootEntry, SpawnGroup, SpawnReason } from './mob';
import { AvoidEntityGoal, FloatGoal, LeapAtTargetGoal, LookAtPlayerGoal, NearestAttackableMobGoal, OcelotAttackGoal, WaterAvoidingRandomStrollGoal } from './ai/goals';
import type { Player } from './player';
import type { ItemStack } from '../item/item';
import { babyTurtleOnLand } from './turtlePredators';
import { BLOCKS, STATE_BLOCK, FLAGS, F_LEAVES } from '../world/block';
import { SEA_LEVEL } from '../world/constants';

/** vanilla #ocelot_food */
const OCELOT_FOOD = new Set(['cod', 'salmon']);

export class Ocelot extends Animal {
  readonly type = 'ocelot';
  protected adultWidth = 0.6;
  protected adultHeight = 0.7;
  /** vanilla DATA_TRUSTING */
  trusting = false;
  /** vanilla Pose.CROUCHING: creeping up on food or prey */
  crouching = false;
  private temptGoal: OcelotTemptGoal | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 0.7);
    this.maxHealth = this.health = 10;
    this.moveSpeedAttr = 0.3;
    this.attackDamage = 3;
  }

  protected registerGoals(): void {
    this.temptGoal = new OcelotTemptGoal(this, 0.6, OCELOT_FOOD, true);
    this.goalSelector.addGoal(1, new FloatGoal(this));
    this.goalSelector.addGoal(3, this.temptGoal);
    // (vanilla reassessTrustingGoals: only one that doesn't trust you has it)
    this.goalSelector.addGoal(4, new OcelotAvoidPlayersGoal(this, 16, 0.8, 1.33));
    this.goalSelector.addGoal(7, new LeapAtTargetGoal(this, 0.3));
    this.goalSelector.addGoal(8, new OcelotAttackGoal(this));
    this.goalSelector.addGoal(9, new BreedGoal(this, 0.8));
    this.goalSelector.addGoal(10, new WaterAvoidingRandomStrollGoal(this, 0.8, 1.0000001e-5));
    this.goalSelector.addGoal(11, new LookAtPlayerGoal(this, 10));
    this.targetSelector.addGoal(1, new NearestAttackableMobGoal(this, (e) => e.type === 'chicken', false));
    // (Stage 5: ocean) vanilla NearestAttackableTargetGoal<Turtle>(BABY_ON_LAND_SELECTOR): baby turtles on land, seen or not
    this.targetSelector.addGoal(1, new NearestAttackableMobGoal(this, babyTurtleOnLand, false));
  }

  // --- spawning and breeding ------------------------------------------------------------------------------------

  /** vanilla Ocelot.finalizeSpawn: in a group, every one after the first is a kitten (AgeableMobGroupData(1.0)) */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    if (group && !group.ageable) group.ageable = { size: 0, babyChance: 1 };
    super.finalizeSpawn(reason, group);
  }

  /** vanilla Ocelot.checkSpawnObstruction: room, no liquid, at sea level or above, on grass or leaves */
  override checkSpawnObstruction(): boolean {
    if (!super.checkSpawnObstruction() || Math.floor(this.y) < SEA_LEVEL) return false;
    const below = this.level.world.getState(Math.floor(this.x), Math.floor(this.y) - 1, Math.floor(this.z));
    return BLOCKS[STATE_BLOCK[below]].name === 'grass_block' || (FLAGS[below] & F_LEAVES) !== 0;
  }

  isFood(s: ItemStack): boolean {
    return OCELOT_FOOD.has(s.item.id);
  }

  makeBaby(): Animal {
    return new Ocelot(this.level);
  }

  /** vanilla Ocelot.removeWhenFarAway: one that doesn't trust you wanders off after two minutes when no one's near */
  override removeWhenFarAway(): boolean {
    return !this.trusting && this.tickCount > 2400;
  }

  // --- trust ----------------------------------------------------------------------------------------------------

  /**
   * vanilla Ocelot.mobInteract: fish held out to one you've coaxed in (it's being tempted), from within 3 blocks, wins
   * its trust one time in three; otherwise the fish goes to breeding, as any animal's food does
   */
  override interact(p: Player, stack: ItemStack | null): boolean {
    if ((!this.temptGoal || this.temptGoal.isRunning) && !this.trusting && stack && this.isFood(stack) && p.distanceToSqr(this.x, this.y, this.z) < 9) {
      this.usePlayerItem(p);
      if (this.random.nextInt(3) === 0) {
        this.trusting = true;
        this.spawnTrustingParticles(true);
      } else this.spawnTrustingParticles(false);
      return true;
    }
    return super.interact(p, stack);
  }

  /** vanilla spawnTrustingParticles (entity events 41 and 40): seven hearts, or seven puffs of smoke */
  private spawnTrustingParticles(success: boolean): void {
    const r = this.random;
    for (let i = 0; i < 7; i++) {
      this.level.particles.spawn?.(
        success ? 'heart' : 'smoke',
        this.x + (2 * r.nextFloat() - 1) * this.width,
        this.y + r.nextFloat() * this.height + 0.5,
        this.z + (2 * r.nextFloat() - 1) * this.width,
        r.gaussian() * 0.02, r.gaussian() * 0.02, r.gaussian() * 0.02,
      );
    }
  }

  // --- ticking --------------------------------------------------------------------------------------------------

  /** vanilla Ocelot.customServerAiStep: creeping at the slow speed it stalks with, sprinting at the fast one */
  protected override customServerAiStep(): void {
    super.customServerAiStep();
    const mc = this.moveControl;
    if (mc.hasWanted()) {
      const d = mc.speedModifier;
      this.crouching = d === 0.6;
      this.sprinting = d === 1.33;
    } else {
      this.crouching = false;
      this.sprinting = false;
    }
  }

  /** vanilla Ocelot.causeFallDamage: none */
  protected override causeFallDamage(_dist: number): void {}

  // --- sounds ---------------------------------------------------------------------------------------------------

  override ambientSound(): string {
    return 'entity.ocelot.ambient';
  }
  /** vanilla Ocelot.getAmbientSoundInterval */
  override ambientSoundInterval(): number {
    return 900;
  }
  override hurtSound(): string {
    return 'entity.ocelot.hurt';
  }
  override deathSound(): string {
    return 'entity.ocelot.death';
  }
  /** vanilla entities/ocelot: nothing */
  override lootTable(): LootEntry[] {
    return [];
  }

  // --- saving ---------------------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), Trusting: this.trusting };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.trusting = d.Trusting === true || d.Trusting === 1;
  }
}

/** vanilla Ocelot.OcelotTemptGoal: one that doesn't trust you yet takes fright if you move or turn */
class OcelotTemptGoal extends TemptGoal {
  constructor(readonly ocelot: Ocelot, speed: number, items: Set<string>, canScare: boolean) {
    super(ocelot, speed, items, canScare);
  }
  protected override canScare(): boolean {
    return super.canScare() && !this.ocelot.trusting;
  }
}

/** vanilla Ocelot.OcelotAvoidEntityGoal<Player>: one that doesn't trust you runs from a player (not one in creative) */
class OcelotAvoidPlayersGoal extends AvoidEntityGoal {
  constructor(readonly ocelot: Ocelot, maxDist: number, walk: number, sprint: number) {
    super(ocelot, (e) => e.type === 'player' && (e as Player).gameMode !== 'creative' && (e as Player).gameMode !== 'spectator', maxDist, walk, sprint);
  }
  override canUse(): boolean {
    return !this.ocelot.trusting && super.canUse();
  }
  override canContinueToUse(): boolean {
    return !this.ocelot.trusting && super.canContinueToUse();
  }
}
