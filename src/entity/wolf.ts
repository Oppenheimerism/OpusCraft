// The wolf (vanilla 1.21 Wolf): packs of one coat per biome that hunt sheep and skeletons, turn on whoever hurts
// one of them, and can be won over with bones. A tame wolf sits when told, follows its owner and fights for it,
// wears a collar you can dye, heals on meat, begs with its head on one side, and shakes itself dry after a swim.

import { Animal, BreedGoal, DYE_COLORS } from './animals';
import { TamableAnimal, SitWhenOrderedToGoal, FollowOwnerGoal, OwnerHurtByTargetGoal, OwnerHurtTargetGoal, NonTameRandomTargetGoal, TamableAnimalPanicGoal } from './tamable';
import type { Level } from '../game/level';
import type { LootEntry, SpawnGroup, SpawnReason } from './mob';
import { Mob } from './mob';
import { Goal, Flag } from './ai/goal';
import { FloatGoal, LeapAtTargetGoal, MeleeAttackGoal, WaterAvoidingRandomStrollGoal, LookAtPlayerGoal, RandomLookAroundGoal, HurtByTargetGoal, NearestAttackableMobGoal } from './ai/goals';
import { LivingEntity } from './living';
import type { Player } from './player';
import type { Entity } from './entity';
import { ItemStack } from '../item/item';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { BIOMES } from '../world/gen/biomes';

// ---------------------------------------------------------------------------
// variants (vanilla WolfVariants, registered in this order)

export interface WolfVariant {
  id: string;
  /** vanilla wild/tame/angry textures: entity/wolf/wolf[_id][_tame|_angry] */
  texture: string;
  /** the biomes (and biome tags) it spawns in */
  biomes: readonly string[];
}

export const WOLF_VARIANTS: readonly WolfVariant[] = [
  { id: 'pale', texture: 'wolf', biomes: ['taiga'] },
  { id: 'spotted', texture: 'wolf_spotted', biomes: ['savanna', 'savanna_plateau', 'windswept_savanna'] },
  { id: 'snowy', texture: 'wolf_snowy', biomes: ['grove'] },
  { id: 'black', texture: 'wolf_black', biomes: ['old_growth_pine_taiga'] },
  { id: 'ashen', texture: 'wolf_ashen', biomes: ['snowy_taiga'] },
  { id: 'rusty', texture: 'wolf_rusty', biomes: ['jungle', 'sparse_jungle', 'bamboo_jungle'] },
  { id: 'woods', texture: 'wolf_woods', biomes: ['forest'] },
  { id: 'chestnut', texture: 'wolf_chestnut', biomes: ['old_growth_spruce_taiga'] },
  { id: 'striped', texture: 'wolf_striped', biomes: ['badlands', 'eroded_badlands', 'wooded_badlands'] },
];
const VARIANT_BY_ID = new Map(WOLF_VARIANTS.map((v) => [v.id, v]));

/** vanilla WolfVariants.getSpawnVariant: the first whose biomes hold this one, else pale */
export function wolfSpawnVariant(biome: string): WolfVariant {
  return WOLF_VARIANTS.find((v) => v.biomes.includes(biome)) ?? WOLF_VARIANTS[0];
}

/** vanilla #wolf_food: #meat, and fish */
const WOLF_FOOD = new Set([
  'beef', 'chicken', 'cooked_beef', 'cooked_chicken', 'cooked_mutton', 'cooked_porkchop', 'cooked_rabbit', 'mutton', 'porkchop', 'rabbit', 'rotten_flesh',
  'cod', 'cooked_cod', 'salmon', 'cooked_salmon', 'tropical_fish', 'pufferfish', 'rabbit_stew',
]);

/** vanilla Wolf.PREY_SELECTOR: what a wild wolf hunts */
const PREY = new Set(['sheep', 'rabbit', 'fox']);
const SKELETONS = new Set(['skeleton', 'stray', 'wither_skeleton', 'bogged']);

/** vanilla #wolves_spawnable_on */
const SPAWNABLE_ON = new Set(['grass_block', 'snow', 'snow_block', 'coarse_dirt', 'podzol']);

/** vanilla Wolf.checkWolfSpawnRules: on grass, snow, coarse dirt or podzol, in the light */
export function wolfSpawnRulesOk(level: Level, x: number, y: number, z: number): boolean {
  return SPAWNABLE_ON.has(BLOCKS[STATE_BLOCK[level.world.getState(x, y - 1, z)]].name) && level.rawBrightness(x, y, z, 0) > 8;
}

export class Wolf extends TamableAnimal {
  readonly type = 'wolf';
  protected adultWidth = 0.6;
  protected adultHeight = 0.85;
  variant: WolfVariant = WOLF_VARIANTS[0];
  /** vanilla DATA_COLLAR_COLOR (a DyeColor id): red to begin with */
  collarColor = 14;
  /** vanilla DATA_INTERESTED_ID: begging (BegGoal) */
  interested = false;
  interestedAngle = 0;
  interestedAngleO = 0;
  /** vanilla isWet / isShaking and the shake's progress */
  wet = false;
  shaking = false;
  shakeAnim = 0;
  shakeAnimO = 0;
  /** vanilla NeutralMob: ticks of anger left, and at whom */
  angerTime = 0;
  angerTarget: LivingEntity | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 0.85);
    this.maxHealth = this.health = 8;
    this.moveSpeedAttr = 0.3;
    this.attackDamage = 4;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new FloatGoal(this));
    this.goalSelector.addGoal(1, new TamableAnimalPanicGoal(this, 1.5));
    this.goalSelector.addGoal(2, new SitWhenOrderedToGoal(this));
    // (vanilla WolfAvoidEntityGoal: a wild wolf shies away from a strong llama — no llamas yet)
    this.goalSelector.addGoal(4, new LeapAtTargetGoal(this, 0.4));
    this.goalSelector.addGoal(5, new MeleeAttackGoal(this, 1.0, true));
    this.goalSelector.addGoal(6, new FollowOwnerGoal(this, 1.0, 10, 2));
    this.goalSelector.addGoal(7, new BreedGoal(this, 1.0));
    this.goalSelector.addGoal(8, new WaterAvoidingRandomStrollGoal(this, 1.0));
    this.goalSelector.addGoal(9, new BegGoal(this, 8));
    this.goalSelector.addGoal(10, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(10, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new OwnerHurtByTargetGoal(this));
    this.targetSelector.addGoal(2, new OwnerHurtTargetGoal(this));
    this.targetSelector.addGoal(3, new TamableHurtByTargetGoal(this).setAlertOthers());
    // vanilla NearestAttackableTargetGoal<Player>(10, true, false, isAngryAt)
    this.targetSelector.addGoal(4, new NearestAttackableMobGoal(this, (e) => e.type === 'player' && this.isAngryAt(e), true));
    this.targetSelector.addGoal(5, new NonTameRandomTargetGoal(this, (e) => PREY.has(e.type), false));
    // (vanilla NonTameRandomTargetGoal<Turtle>(BABY_ON_LAND_SELECTOR): baby turtles on land — no turtles yet)
    this.targetSelector.addGoal(7, new NearestAttackableMobGoal(this, (e) => SKELETONS.has(e.type), false));
  }

  override get eyeHeight(): number {
    return this.height * 0.8;
  }

  // --- spawning and breeding ------------------------------------------------------------------------------------

  /**
   * vanilla Wolf.finalizeSpawn: its coat is the biome's, and the rest of its pack (vanilla WolfPackData) share it
   * and are never pups
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const g = group ?? {};
    if (!g.wolfVariant) {
      const b = BIOMES[this.level.world.getBiome3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))]?.name ?? 'plains';
      g.wolfVariant = wolfSpawnVariant(b).id;
      g.ageable ??= { size: 0, babyChance: -1 };
    }
    this.variant = VARIANT_BY_ID.get(g.wolfVariant) ?? WOLF_VARIANTS[0];
    super.finalizeSpawn(reason, g);
  }

  isFood(s: ItemStack): boolean {
    return WOLF_FOOD.has(s.item.id);
  }

  /** vanilla Wolf.getBreedOffspring: a coat from either parent, and a tame pair's pup is theirs, collared like one */
  makeBaby(partner: Animal): Animal {
    const w = new Wolf(this.level);
    if (partner instanceof Wolf) {
      w.variant = this.random.nextBool() ? this.variant : partner.variant;
      if (this.isTame()) {
        w.ownerUUID = this.ownerUUID;
        w.setTame(true, true);
        w.collarColor = this.random.nextBool() ? this.collarColor : partner.collarColor;
      }
    }
    return w;
  }

  /** vanilla Wolf.canMate: two tame wolves in love, the other not sitting */
  override canMate(o: Animal): boolean {
    if (o === this || !this.isTame() || !(o instanceof Wolf) || !o.isTame()) return false;
    return o.inSittingPose ? false : this.isInLove() && o.isInLove();
  }

  /** vanilla getMaxSpawnClusterSize */
  override maxSpawnClusterSize(): number {
    return 8;
  }

  // --- taming ---------------------------------------------------------------------------------------------------

  /** vanilla Wolf.applyTamingSideEffects: 40 health once tame (and it's all there), 8 wild */
  protected override applyTamingSideEffects(): void {
    if (this.isTame()) {
      this.maxHealth = 40;
      this.health = 40;
    } else this.maxHealth = 8;
  }

  /** vanilla Wolf.tryToTame: one bone in three wins it over, and it sits down where it is */
  private tryToTame(p: Player): void {
    if (this.random.nextInt(3) === 0) {
      this.tameBy(p);
      this.navigation.stop();
      this.setTarget(null);
      this.orderedToSit = true;
      this.spawnTamingParticles(true);
    } else this.spawnTamingParticles(false);
  }

  /** vanilla Wolf.mobInteract */
  override interact(p: Player, stack: ItemStack | null): boolean {
    const creative = p.gameMode === 'creative';
    if (this.isTame()) {
      if (stack && this.isFood(stack) && this.health < this.maxHealth) {
        if (!creative) p.inventory.consumeSelected(1);
        this.heal(2 * (stack.item.food?.nutrition ?? 1));
        return true;
      }
      if (stack && stack.item.id.endsWith('_dye') && this.isOwnedBy(p)) {
        const c = DYE_COLORS.indexOf(stack.item.id.slice(0, -4));
        if (c >= 0 && c !== this.collarColor) {
          this.collarColor = c;
          if (!creative) p.inventory.consumeSelected(1);
          return true;
        }
        return super.interact(p, stack);
      }
      // (wolf armor, its shearing and mending with armadillo scutes: no armadillos yet)
      if (super.interact(p, stack)) return true;
      if (this.isOwnedBy(p)) {
        this.orderedToSit = !this.orderedToSit;
        this.jumping = false;
        this.navigation.stop();
        this.setTarget(null);
        return true;
      }
      return false;
    }
    if (stack?.item.id === 'bone' && !this.isAngry()) {
      if (!creative) p.inventory.consumeSelected(1);
      this.tryToTame(p);
      return true;
    }
    return super.interact(p, stack);
  }

  override variantId(): string {
    return this.variant.id;
  }

  /** vanilla Wolf.wantsToAttack: not creepers, ghasts or armor stands, nor a wolf, horse or pet of the same owner */
  override wantsToAttack(target: LivingEntity, owner: LivingEntity): boolean {
    if (target.type === 'creeper' || target.type === 'ghast' || target.type === 'armor_stand') return false;
    if (target instanceof Wolf) return !target.isTame() || target.owner() !== owner;
    if (target instanceof TamableAnimal) return !target.isTame();
    return true;
  }

  // --- anger (vanilla NeutralMob) -------------------------------------------------------------------------------

  isAngry(): boolean {
    return this.angerTime > 0;
  }
  isAngryAt(e: LivingEntity): boolean {
    return this.canAttack(e) && e === this.angerTarget;
  }
  /** vanilla startPersistentAngerTimer: TimeUtil.rangeOfSeconds(20, 39) */
  private startAngerTimer(): void {
    this.angerTime = 400 + this.random.nextInt(381);
  }
  stopBeingAngry(): void {
    this.lastHurtByMob = null;
    this.angerTarget = null;
    this.setTarget(null);
    this.angerTime = 0;
  }
  /** vanilla NeutralMob.updatePersistentAnger(level, true): anything it goes for makes it angry, a player longest */
  private updateAnger(): void {
    const t = this.target;
    if ((!t || !t.isAlive) && this.angerTarget && this.angerTarget.type !== 'player') {
      this.stopBeingAngry();
      return;
    }
    if (t && t !== this.angerTarget) {
      this.angerTarget = t;
      this.startAngerTimer();
    }
    if (this.angerTime > 0 && (!t || t.type !== 'player') && --this.angerTime === 0) this.stopBeingAngry();
  }

  // --- ticking --------------------------------------------------------------------------------------------------

  override tick(): void {
    super.tick();
    if (!this.isAlive) return;
    this.interestedAngleO = this.interestedAngle;
    this.interestedAngle += ((this.interested ? 1 : 0) - this.interestedAngle) * 0.4;
    if (this.isInWaterOrRainNow()) {
      this.wet = true;
      // (vanilla entity event 56: back in the water mid-shake, it stops)
      if (this.shaking) this.cancelShake();
    } else if (this.wet && this.shaking) {
      if (this.shakeAnim === 0) this.playSound('entity.wolf.shake', this.soundVolume(), (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1);
      this.shakeAnimO = this.shakeAnim;
      this.shakeAnim += 0.05;
      if (this.shakeAnimO >= 2) {
        this.wet = false;
        this.shaking = false;
        this.shakeAnimO = 0;
        this.shakeAnim = 0;
      }
      if (this.shakeAnim > 0.4) {
        const y = this.y;
        const n = Math.trunc(Math.sin((this.shakeAnim - 0.4) * Math.PI) * 7);
        for (let j = 0; j < n; j++) {
          const fx = (this.random.nextFloat() * 2 - 1) * this.width * 0.5, fz = (this.random.nextFloat() * 2 - 1) * this.width * 0.5;
          this.level.particles.spawn?.('splash', this.x + fx, y + 0.8, this.z + fz, this.dx, this.dy, this.dz);
        }
      }
    }
  }

  override aiStep(): void {
    super.aiStep();
    // (vanilla entity event 8: out of the water and standing still on the ground, it starts to shake)
    if (this.wet && !this.shaking && this.navigation.isDone() && this.onGround) {
      this.shaking = true;
      this.shakeAnim = 0;
      this.shakeAnimO = 0;
    }
    this.updateAnger();
  }

  private cancelShake(): void {
    this.shaking = false;
    this.shakeAnim = 0;
    this.shakeAnimO = 0;
  }

  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    this.wet = false;
    this.shaking = false;
    this.shakeAnimO = 0;
    this.shakeAnim = 0;
    super.die(source, attacker);
  }

  /** vanilla Wolf.hurt: being hurt gets it up off its haunches */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isInvulnerableTo(source)) return false;
    this.orderedToSit = false;
    return super.hurt(amount, source, attacker, direct);
  }

  override maxHeadXRot(): number {
    return this.inSittingPose ? 20 : super.maxHeadXRot();
  }

  // --- looks (read by the renderer) -----------------------------------------------------------------------------

  /** vanilla Wolf.getTexture: a tame wolf always looks tame; a wild one angry while it is */
  texture(): string {
    const t = this.variant.texture;
    return this.isTame() ? `${t}_tame` : this.isAngry() ? `${t}_angry` : t;
  }
  /** vanilla getWetShade: a wet coat is darker, lightening as it shakes */
  wetShade(p: number): number {
    return Math.min(0.75 + ((this.shakeAnimO + (this.shakeAnim - this.shakeAnimO) * p) / 2) * 0.25, 1);
  }
  /** vanilla getBodyRollAngle: the shake running down its body */
  bodyRollAngle(p: number, offset: number): number {
    let f = (this.shakeAnimO + (this.shakeAnim - this.shakeAnimO) * p + offset) / 1.8;
    f = Math.max(0, Math.min(1, f));
    return Math.sin(f * Math.PI) * Math.sin(f * Math.PI * 11) * 0.15 * Math.PI;
  }
  /** vanilla getHeadRollAngle: the head on one side while it begs */
  headRollAngle(p: number): number {
    return (this.interestedAngleO + (this.interestedAngle - this.interestedAngleO) * p) * 0.15 * Math.PI;
  }
  /** vanilla getTailAngle: up while angry; a tame wolf's droops as it's hurt */
  tailAngle(): number {
    if (this.isAngry()) return 1.5393804;
    if (this.isTame()) return (0.55 - ((this.maxHealth - this.health) / this.maxHealth) * 0.4) * Math.PI;
    return Math.PI / 5;
  }

  // --- sounds ---------------------------------------------------------------------------------------------------

  override soundVolume(): number {
    return 0.4;
  }
  /** vanilla Wolf.getAmbientSound: a growl while angry; now and then a pant (a whine when a tame one is hurt) */
  override ambientSound(): string {
    if (this.isAngry()) return 'entity.wolf.growl';
    if (this.random.nextInt(3) === 0) return this.isTame() && this.health < 20 ? 'entity.wolf.whine' : 'entity.wolf.pant';
    return 'entity.wolf.ambient';
  }
  override hurtSound(): string {
    return 'entity.wolf.hurt';
  }
  override deathSound(): string {
    return 'entity.wolf.death';
  }
  override stepSound(): string {
    return 'entity.wolf.step';
  }
  /** vanilla Wolf.playStepSound: quietly */
  protected override playStepSound(): void {
    this.playSound('entity.wolf.step', 0.15, 1);
  }
  override lootTable(): LootEntry[] {
    return [];
  }

  // --- saving ---------------------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData(), CollarColor: this.collarColor, variant: this.variant.id };
    // (vanilla NeutralMob.addPersistentAngerSaveData)
    if (this.angerTime > 0) d.AngerTime = this.angerTime;
    return d;
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.variant = VARIANT_BY_ID.get(String(d.variant ?? 'pale')) ?? WOLF_VARIANTS[0];
    if (d.CollarColor !== undefined) this.collarColor = Number(d.CollarColor);
    this.angerTime = Number(d.AngerTime ?? 0);
    if (this.angerTime > 0) this.angerTarget = this.level.player ?? null;
    if (this.isTame()) this.maxHealth = 40;
  }
}

// ---------------------------------------------------------------------------
// goals

/**
 * vanilla BegGoal: a player within `lookDistance` holding something it wants (its food, or a bone if it's tame)
 * gets a long, head-tilted stare
 */
export class BegGoal extends Goal {
  private player: Player | null = null;
  private lookTime = 0;
  constructor(readonly wolf: Wolf, readonly lookDistance: number) {
    super();
    this.flags = Flag.LOOK;
  }
  private holdingInteresting(p: Player): boolean {
    for (const s of [p.inventory.selectedItem, p.inventory.offhand]) {
      if (!s) continue;
      if (this.wolf.isTame() && s.item.id === 'bone') return true;
      if (this.wolf.isFood(s)) return true;
    }
    return false;
  }
  canUse(): boolean {
    const p = this.wolf.level.player;
    this.player = p && p.isAlive && p.gameMode !== 'spectator' && this.wolf.distanceToSqr(p.x, p.y, p.z) <= this.lookDistance * this.lookDistance ? p : null;
    return this.player !== null && this.holdingInteresting(this.player);
  }
  override canContinueToUse(): boolean {
    const p = this.player;
    if (!p || !p.isAlive) return false;
    if (this.wolf.distanceToSqr(p.x, p.y, p.z) > this.lookDistance * this.lookDistance) return false;
    return this.lookTime > 0 && this.holdingInteresting(p);
  }
  override start(): void {
    this.wolf.interested = true;
    this.lookTime = this.adjustedTickDelay(40 + this.wolf.random.nextInt(40));
  }
  override stop(): void {
    this.wolf.interested = false;
    this.player = null;
  }
  override tick(): void {
    const p = this.player!;
    this.wolf.lookControl.setLookAt(p.x, p.y + p.eyeHeight, p.z, 10, this.wolf.maxHeadXRot());
    this.lookTime--;
  }
}

/**
 * vanilla HurtByTargetGoal.alertOthers for tame animals: only those with the same owner (wild ones: all the wild
 * ones) join in, and never against their own owner
 */
class TamableHurtByTargetGoal extends HurtByTargetGoal {
  constructor(readonly tamable: TamableAnimal) {
    super(tamable);
  }
  protected override alertOther(o: Mob, target: LivingEntity): void {
    if (!(o instanceof TamableAnimal) || o.ownerUUID !== this.tamable.ownerUUID || o.isAlliedTo(target)) return;
    super.alertOther(o, target);
  }
}
