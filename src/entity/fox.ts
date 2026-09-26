// The fox (vanilla 1.21 Fox): small, quick and shy, in the taigas and the groves, red, or white where it snows. By
// day it curls up asleep in the shade, under the trees, so long as nothing's about; by night it's up and about, and
// now and then it sits up to look round. It keeps away from players (not one who sneaks up on it, nor one it trusts),
// from wolves and from polar bears, and runs when it's hurt. It hunts chickens and rabbits (a red fox first, a snow
// fox would rather fish), fish, and baby turtles caught out of the water: it stalks its prey, crouches low with its
// head cocked, and pounces high onto it, and one that lands in snow can end up with its nose stuck in it. It picks
// ripe sweet berries and glow berries, and is bred with them; its young trust whoever fed their parents, and a fox
// goes for whatever hurts someone it trusts, growling. It carries things in its mouth: whatever it finds lying about
// (food over anything else, spitting that out), and one in five turns up with something already; food it eats after
// a while, crumbs and all, and a chorus fruit sends it off somewhere else. Killed, it drops what it had.

import { Animal, BreedGoal, FollowParentGoal } from './animals';
import type { Level } from '../game/level';
import type { Mob, SpawnGroup, SpawnReason } from './mob';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import { ItemStack } from '../item/item';
import type { EquipSlot } from '../item/enchantHelper';
import { ItemEntity } from './itemEntity';
import { MOB_EFFECTS, MobEffectInstance } from './effects';
import type { DifficultyInstance } from '../game/difficulty';
import { chorusTeleport } from '../game/chorus';
import { Monster } from './monsters';
import { TamableAnimal } from './tamable';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import {
  AvoidEntityGoal, ClimbOnTopOfPowderSnowGoal, FleeSunGoal, FloatGoal, LeapAtTargetGoal, LookAtPlayerGoal, MeleeAttackGoal,
  MoveToBlockGoal, NearestAttackableMobGoal, PanicGoal, TargetGoal, WaterAvoidingRandomStrollGoal, landRandomPos,
} from './ai/goals';
import { LookControl, MoveControl } from './ai/controls';
import { PathType } from './ai/pathfinder';
import { babyTurtleOnLand } from './turtlePredators';
import { blocksMotion } from './teleport';
import { BIOMES } from '../world/gen/biomes';
import { BLOCKS, STATE_BLOCK, FLAGS, F_LEAVES, F_REPLACEABLE, F_WATER, F_LAVA, F_WATERLOGGED } from '../world/block';
import { MIN_Y } from '../world/constants';

/** vanilla Fox.Type ids */
export const RED = 0, SNOW = 1;
/** vanilla Fox.Type: each type's name by its id */
export const FOX_TYPES: readonly string[] = ['red', 'snow'];
/** vanilla Fox.Type.byName: anything else is red */
const typeByName = (n: string): number => (n === 'snow' ? SNOW : RED);

/** vanilla #fox_food */
const FOX_FOOD = new Set(['sweet_berries', 'glow_berries']);
/** vanilla #spawns_snow_foxes */
const SNOW_FOX_BIOMES = new Set(['snowy_plains', 'ice_spikes', 'frozen_ocean', 'snowy_taiga', 'frozen_river', 'snowy_beach', 'frozen_peaks', 'jagged_peaks', 'snowy_slopes', 'grove']);
/** vanilla #foxes_spawnable_on */
export const FOXES_SPAWNABLE_ON = new Set(['grass_block', 'snow', 'snow_block', 'podzol', 'coarse_dirt']);
/** vanilla AbstractSchoolingFish: the fish a fox hunts (not the pufferfish) */
const SCHOOLING_FISH = new Set(['cod', 'salmon', 'tropical_fish']);

/** vanilla DATA_FLAGS_ID's bits */
const SITTING = 1, CROUCHING = 4, INTERESTED = 8, POUNCING = 16, SLEEPING = 32, FACEPLANTED = 64, DEFENDING = 128;

/** vanilla Fox.STALKABLE_PREY: what it stalks and pounces on (anything else it's after, it just goes for) */
const isStalkable = (e: LivingEntity): boolean => e.type === 'chicken' || e.type === 'rabbit';

export class Fox extends Animal {
  readonly type = 'fox';
  protected adultWidth = 0.6;
  protected adultHeight = 0.7;
  /** vanilla DATA_TYPE_ID: red or snow */
  variant = RED;
  /** vanilla DATA_FLAGS_ID: sitting, crouching, interested, pouncing, sleeping, faceplanted, defending */
  private flags = 0;
  /** vanilla DATA_TRUSTED_ID_0 and _1: whom it trusts (uuids) */
  private readonly trusted: (string | null)[] = [null, null];
  /** vanilla interestedAngle: its head's tilt, easing toward 1 while it's interested in something and back to 0 */
  interestedAngle = 0;
  interestedAngleO = 0;
  /** vanilla crouchAmount: how low it's got, 0.2 more a tick while it's crouching, down to 3 */
  crouchAmount = 0;
  crouchAmountO = 0;
  /** vanilla ticksSinceEaten: since it last ate, or took something into its mouth */
  ticksSinceEaten = 0;
  private goalsIn = false;
  /**
   * vanilla setTargetGoals has been called: spawning and loading call it, breeding doesn't (as in vanilla, a cub
   * that's just been born doesn't hunt until it's been saved and loaded again)
   */
  private hunts = false;
  private huntingIn = false;
  private landTarget: Goal | null = null;
  private turtleTarget: Goal | null = null;
  private fishTarget: Goal | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 0.7);
    this.maxHealth = this.health = 10;
    this.moveSpeedAttr = 0.3;
    this.followRange = 32;
    this.attackDamage = 2;
    (this as { lookControl: LookControl }).lookControl = new FoxLookControl(this);
    this.moveControl = new FoxMoveControl(this);
    this.setPathfindingMalus(PathType.DANGER_OTHER, 0);
    this.setPathfindingMalus(PathType.DAMAGE_OTHER, 0);
    // (vanilla setCanPickUpLoot: it takes things into its mouth)
    this.canPickUpLoot = true;
  }

  /** vanilla EntityType.FOX's eye height, 0.4 (a cub's, BABY_DIMENSIONS, 0.2975) */
  override get eyeHeight(): number {
    return this.isBaby() ? 0.2975 : 0.4;
  }

  protected registerGoals(): void {
    this.goalsIn = true;
    this.landTarget = new NearestAttackableMobGoal(this, isStalkable, false);
    this.turtleTarget = new NearestAttackableMobGoal(this, babyTurtleOnLand, false);
    this.fishTarget = new NearestAttackableMobGoal(this, (e) => SCHOOLING_FISH.has(e.type), false, 20);
    const g = this.goalSelector;
    g.addGoal(0, new FoxFloatGoal(this));
    g.addGoal(0, new ClimbOnTopOfPowderSnowGoal(this));
    g.addGoal(1, new FaceplantGoal(this));
    g.addGoal(2, new FoxPanicGoal(this, 2.2));
    g.addGoal(3, new FoxBreedGoal(this, 1.0));
    // (vanilla AVOID_PLAYERS: not one sneaking, nor in creative or spectator)
    g.addGoal(4, new AvoidEntityGoal(this, (e) => e.type === 'player' && !e.isDiscrete() && !this.trusts(e.uuid) && !this.isDefending(), 16, 1.6, 1.4));
    g.addGoal(4, new AvoidEntityGoal(this, (e) => e.type === 'wolf' && !(e as TamableAnimal).isTame() && !this.isDefending(), 8, 1.6, 1.4));
    g.addGoal(4, new AvoidEntityGoal(this, (e) => e.type === 'polar_bear' && !this.isDefending(), 8, 1.6, 1.4));
    g.addGoal(5, new StalkPreyGoal(this));
    g.addGoal(6, new FoxPounceGoal(this));
    g.addGoal(6, new SeekShelterGoal(this, 1.25));
    g.addGoal(7, new FoxMeleeAttackGoal(this, 1.2, true));
    g.addGoal(7, new SleepGoal(this));
    g.addGoal(8, new FoxFollowParentGoal(this, 1.25));
    g.addGoal(9, new FoxStrollThroughVillageGoal(this, 200));
    g.addGoal(10, new FoxEatBerriesGoal(this, 1.2, 12, 1));
    g.addGoal(10, new LeapAtTargetGoal(this, 0.4));
    g.addGoal(11, new WaterAvoidingRandomStrollGoal(this, 1.0));
    g.addGoal(11, new FoxSearchForItemsGoal(this));
    g.addGoal(12, new FoxLookAtPlayerGoal(this, 24));
    g.addGoal(13, new PerchAndSearchGoal(this));
    this.targetSelector.addGoal(3, new DefendTrustedTargetGoal(this));
    if (this.hunts) this.setTargetGoals();
  }

  /**
   * vanilla setTargetGoals: what it hunts, by its type: a red fox chickens, rabbits and baby turtles first and fish
   * after, a snow fox the other way about (once only: vanilla's goal set takes each goal the once)
   */
  private setTargetGoals(): void {
    this.hunts = true;
    if (!this.goalsIn || this.huntingIn) return;
    this.huntingIn = true;
    const t = this.targetSelector;
    const land = this.landTarget!, turtle = this.turtleTarget!, fish = this.fishTarget!;
    if (this.variant === RED) {
      t.addGoal(4, land);
      t.addGoal(4, turtle);
      t.addGoal(6, fish);
    } else {
      t.addGoal(4, fish);
      t.addGoal(6, land);
      t.addGoal(6, turtle);
    }
  }

  // --- its type ----------------------------------------------------------------------------------------------

  setVariant(v: number): void {
    this.variant = v === SNOW ? SNOW : RED;
  }

  /** vanilla Fox.Type's name */
  variantId(): string {
    return FOX_TYPES[this.variant];
  }

  /** vanilla Fox.Type.byBiome: snow in the snowy places (#spawns_snow_foxes), red elsewhere */
  private typeHere(): number {
    const biome = BIOMES[this.level.world.getBiome3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))]?.name ?? 'plains';
    return SNOW_FOX_BIOMES.has(biome) ? SNOW : RED;
  }

  /**
   * vanilla finalizeSpawn (FoxGroupData, an AgeableMobGroupData that makes no babies of itself): the type where the
   * group is, shared by all of it, the third and fourth of a group cubs; its hunting set up, and maybe something in
   * its mouth
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const g = group ?? {};
    let t = this.typeHere();
    let cub = false;
    if (g.foxType !== undefined) {
      t = g.foxType;
      if ((g.ageable?.size ?? 0) >= 2) cub = true;
    } else {
      g.foxType = t;
      // (never a baby of the group's own choosing)
      g.ageable ??= { size: 0, babyChance: -1 };
    }
    this.setVariant(t);
    if (cub) this.setAge(-24000);
    this.setTargetGoals();
    this.populateDefaultEquipmentSlots(this.spawnDifficulty());
    super.finalizeSpawn(reason, g);
  }

  isFood(s: ItemStack): boolean {
    return FOX_FOOD.has(s.item.id);
  }

  /** vanilla usePlayerItem: its food eaten from a player's hand is heard */
  protected override playEatSound(): void {
    this.playSound('entity.fox.eat', 1, 1);
  }

  /** vanilla getBreedOffspring: one parent's type or the other's */
  makeBaby(partner: Animal): Animal {
    const baby = new Fox(this.level);
    baby.setVariant(this.random.nextBool() || !(partner instanceof Fox) ? this.variant : partner.variant);
    return baby;
  }

  /** vanilla FoxBreedGoal.breed: the cub trusts whoever fed this parent, and whoever else fed the other */
  protected override onBredChild(baby: Animal, partner: Animal): void {
    if (!(baby instanceof Fox)) return;
    const a = this.loveCause, b = partner.loveCause;
    if (a) baby.addTrustedUUID(a.uuid);
    if (b && b !== a) baby.addTrustedUUID(b.uuid);
  }

  /** vanilla onOffspringSpawnedFromEgg: a cub made with a spawn egg trusts whoever made it */
  override onOffspringSpawnedFromEgg(p: Player, child: Mob): void {
    if (child instanceof Fox) child.addTrustedUUID(p.uuid);
  }

  // --- its states (vanilla DATA_FLAGS_ID) ---------------------------------------------------------------------

  private flag(f: number): boolean {
    return (this.flags & f) !== 0;
  }
  private setFlag(f: number, on: boolean): void {
    this.flags = on ? this.flags | f : this.flags & ~f;
  }
  isSitting(): boolean {
    return this.flag(SITTING);
  }
  setSitting(on: boolean): void {
    this.setFlag(SITTING, on);
  }
  isCrouching(): boolean {
    return this.flag(CROUCHING);
  }
  setIsCrouching(on: boolean): void {
    this.setFlag(CROUCHING, on);
  }
  /** vanilla isInterested: its head cocked at something (its prey, as it closes in) */
  isInterested(): boolean {
    return this.flag(INTERESTED);
  }
  setIsInterested(on: boolean): void {
    this.setFlag(INTERESTED, on);
  }
  isPouncing(): boolean {
    return this.flag(POUNCING);
  }
  setIsPouncing(on: boolean): void {
    this.setFlag(POUNCING, on);
  }
  isSleeping(): boolean {
    return this.flag(SLEEPING);
  }
  setSleeping(on: boolean): void {
    this.setFlag(SLEEPING, on);
  }
  /** vanilla isFaceplanted: its nose stuck in the snow it pounced into */
  isFaceplanted(): boolean {
    return this.flag(FACEPLANTED);
  }
  setFaceplanted(on: boolean): void {
    this.setFlag(FACEPLANTED, on);
  }
  /** vanilla isDefending: after whatever hurt someone it trusts (fearless meanwhile) */
  isDefending(): boolean {
    return this.flag(DEFENDING);
  }
  setDefending(on: boolean): void {
    this.setFlag(DEFENDING, on);
  }
  /** vanilla isFullyCrouched: as low as it gets, ready to pounce */
  isFullyCrouched(): boolean {
    return this.crouchAmount === 3;
  }
  wakeUp(): void {
    this.setSleeping(false);
  }
  /** vanilla clearStates: up on its feet and minding nothing */
  clearStates(): void {
    this.setIsInterested(false);
    this.setIsCrouching(false);
    this.setSitting(false);
    this.setSleeping(false);
    this.setDefending(false);
    this.setFaceplanted(false);
  }
  /** vanilla canMove: not asleep, sitting or stuck in the snow */
  canMove(): boolean {
    return !this.isSleeping() && !this.isSitting() && !this.isFaceplanted();
  }

  /** vanilla getHeadRollAngle: its head's tilt, in radians */
  headRollAngle(p: number): number {
    return (this.interestedAngleO + (this.interestedAngle - this.interestedAngleO) * p) * 0.11 * Math.PI;
  }
  /** vanilla getCrouchAmount */
  crouchAmountAt(p: number): number {
    return this.crouchAmountO + (this.crouchAmount - this.crouchAmountO) * p;
  }

  /** vanilla setTarget: when it gives up the fight it was defending someone in, it's done defending */
  override setTarget(e: LivingEntity | null): void {
    if (this.isDefending() && e === null) this.setDefending(false);
    super.setTarget(e);
  }

  // --- trust --------------------------------------------------------------------------------------------------

  /** vanilla getTrustedUUIDs */
  trustedUUIDs(): (string | null)[] {
    return [...this.trusted];
  }
  /** vanilla addTrustedUUID: into the first place, or once that's taken the second (over whoever was there) */
  addTrustedUUID(u: string | null): void {
    if (this.trusted[0] !== null) this.trusted[1] = u;
    else this.trusted[0] = u;
  }
  /** vanilla trusts */
  trusts(u: string): boolean {
    return this.trusted.includes(u);
  }

  // --- its mouth (vanilla MAINHAND) ---------------------------------------------------------------------------

  /**
   * vanilla populateDefaultEquipmentSlots: one in five turns up with something in its mouth: an emerald (5%), an egg
   * (15%), a rabbit's foot or hide (20%), wheat, leather or a feather (20% each)
   */
  protected override populateDefaultEquipmentSlots(_d: DifficultyInstance): void {
    const r = this.random;
    if (r.nextFloat() >= 0.2) return;
    const f = r.nextFloat();
    const id = f < 0.05 ? 'emerald' : f < 0.2 ? 'egg' : f < 0.4 ? (r.nextBool() ? 'rabbit_foot' : 'rabbit_hide') : f < 0.6 ? 'wheat' : f < 0.8 ? 'leather' : 'feather';
    this.setItemSlot('mainhand', ItemStack.of(id));
  }

  /** vanilla canTakeItem: nothing's put on it but into its empty mouth (a dispenser's armour isn't) */
  override canTakeItem(slot: EquipSlot): boolean {
    return slot === 'mainhand' && super.canTakeItem(slot);
  }

  /** vanilla canHoldItem: anything, into an empty mouth; food over something that isn't, once it's had that a tick */
  override canHoldItem(s: ItemStack): boolean {
    const cur = this.mainHand;
    return !cur || (this.ticksSinceEaten > 0 && !!s.item.food && !cur.item.food);
  }

  /**
   * vanilla pickUpItem: one of the stack into its mouth (the rest is left lying), spitting out what it had; what it
   * took it keeps and drops for sure, and its meal clock starts over
   */
  protected override pickUpItem(it: ItemEntity): void {
    const s = it.stack;
    if (!this.canHoldItem(s)) return;
    // (vanilla take: the client still has the whole stack when it's told, and sees that go in)
    this.take(it, 0);
    if (s.count > 1) this.dropItemStack(s.split(s.count - 1));
    this.spitOutItem(this.mainHand);
    this.onItemPickup(it);
    this.setItemSlot('mainhand', s.split(1));
    this.setGuaranteedDrop('mainhand');
    it.remove();
    this.ticksSinceEaten = 0;
  }

  /** vanilla spitOutItem: out ahead of it, a block up, not to be taken up again for two seconds */
  private spitOutItem(s: ItemStack | null): void {
    if (!s) return;
    const [lx, , lz] = this.lookVector();
    const e = looseItem(this, this.x + lx, this.y + 1, this.z + lz, s);
    e.pickupDelay = 40;
    e.thrower = this;
    this.playSound('entity.fox.spit', 1, 1);
    this.level.addEntity(e);
  }

  /** vanilla dropItemStack: left lying where it stands, to be picked up at once */
  private dropItemStack(s: ItemStack): void {
    this.level.addEntity(looseItem(this, this.x, this.y, this.z, s));
  }

  /** vanilla canEat: food, with nothing to go for, on the ground and awake */
  private canEat(s: ItemStack): boolean {
    return !!s.item.food && this.target === null && this.onGround && !this.isSleeping();
  }

  /**
   * vanilla ItemStack.finishUsingItem, a fox eating: a suspicious stew's effects first (SuspiciousStewItem); then
   * LivingEntity.eat: its munch, the food's effects rolled, one eaten (a stew's bowl isn't kept: that's a player's);
   * then a chorus fruit sends it off (ChorusFruitItem)
   */
  private eatHeld(s: ItemStack): void {
    const r = this.random;
    if (s.item.id === 'suspicious_stew')
      for (const e of s.tag?.stewEffects ?? []) {
        const fx = MOB_EFFECTS[e.id];
        if (fx) this.addEffect(new MobEffectInstance(fx, e.duration, 0));
      }
    this.playSound('entity.fox.eat', 1, 1 + (r.nextFloat() - r.nextFloat()) * 0.4);
    for (const [id, ticks, amp, chance] of s.item.food?.effects ?? []) {
      const fx = MOB_EFFECTS[id];
      if (fx && r.nextFloat() < chance) this.addEffect(new MobEffectInstance(fx, ticks, amp));
    }
    s.count--;
    this.level.gameEvent('eat', this.x, this.y, this.z, { entity: this });
    if (s.item.id === 'chorus_fruit') chorusTeleport(this.level, this);
  }

  /**
   * vanilla handleEntityEvent 45: eight crumbs of what it's eating, from half a block ahead of it, tossed up and on
   * the way it's looking
   */
  private crumbs(s: ItemStack): void {
    const r = this.random, [lx, , lz] = this.lookVector();
    const xr = (-this.pitch * Math.PI) / 180, yr = (-this.yaw * Math.PI) / 180;
    for (let i = 0; i < 8; i++) {
      // (vanilla Vec3.xRot, then yRot)
      const x0 = (r.nextFloat() - 0.5) * 0.1, y0 = Math.random() * 0.1 + 0.1;
      const y1 = y0 * Math.cos(xr), z1 = -y0 * Math.sin(xr);
      const x2 = x0 * Math.cos(yr) + z1 * Math.sin(yr), z2 = z1 * Math.cos(yr) - x0 * Math.sin(yr);
      this.level.particles.spawn?.(`item_${s.item.id}`, this.x + lx / 2, this.y, this.z + lz / 2, x2, y1 + 0.05, z2);
    }
  }

  /** vanilla dropAllDeathLoot: what it has in its mouth falls first, whatever the loot rule says */
  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    const held = this.mainHand;
    if (held) {
      this.spawnAtLocation(held);
      this.setItemSlot('mainhand', null);
    }
    super.die(source, attacker);
  }

  // --- ticking ------------------------------------------------------------------------------------------------

  /**
   * vanilla tick: in water, with a target or in a thunderstorm it wakes (and in water or asleep it isn't sitting); its
   * nose in the snow kicks up bits of it; its head's tilt and its crouch follow what it's doing
   */
  override tick(): void {
    super.tick();
    if (this.removed) return;
    if (this.inWater || this.target !== null || this.level.isThundering()) this.wakeUp();
    if (this.inWater || this.isSleeping()) this.setSitting(false);
    if (this.isFaceplanted() && this.level.random.nextFloat() < 0.2) {
      // (vanilla level event 2001: the bits and the breaking sound of the block its nose is in)
      const x = Math.floor(this.x), y = Math.floor(this.y), z = Math.floor(this.z);
      const st = this.level.world.getState(x, y, z);
      if (st !== 0) {
        this.level.particles.blockBreak(x, y, z, st);
        this.level.sound.play(`block.${BLOCKS[STATE_BLOCK[st]].sound}.break`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8);
      }
    }
    this.interestedAngleO = this.interestedAngle;
    this.interestedAngle += ((this.isInterested() ? 1 : 0) - this.interestedAngle) * 0.4;
    this.crouchAmountO = this.crouchAmount;
    // (vanilla adds 0.2F a tick: fully down on the fifteenth)
    this.crouchAmount = this.isCrouching() ? Math.min(3, Math.fround(this.crouchAmount + Math.fround(0.2))) : 0;
  }

  /**
   * vanilla aiStep: food in its mouth it eats once it's had nothing for 600 ticks, munching at it over the last 40;
   * with nothing (alive) to go for it's done crouching and cocking its head; asleep it lies still; defending someone
   * it growls now and then
   */
  override aiStep(): void {
    if (this.isAlive) {
      this.ticksSinceEaten++;
      const held = this.mainHand;
      if (held && this.canEat(held)) {
        if (this.ticksSinceEaten > 600) {
          this.eatHeld(held);
          // (vanilla keeps what finishing it leaves, and the empty stack of a last one, which is nothing)
          if (held.count <= 0) this.setItemSlot('mainhand', null);
          this.ticksSinceEaten = 0;
        } else if (this.ticksSinceEaten > 560 && this.random.nextFloat() < 0.1) {
          this.playSound('entity.fox.eat', 1, 1);
          this.crumbs(held);
        }
      }
      const t = this.target;
      if (!t || !t.isAlive) {
        this.setIsCrouching(false);
        this.setIsInterested(false);
      }
    }
    if (this.isSleeping() || this.isImmobile()) {
      this.jumping = false;
      this.xxa = 0;
      this.zza = 0;
    }
    super.aiStep();
    if (this.isDefending() && this.random.nextFloat() < 0.05) this.playSound('entity.fox.aggro', 1, 1);
  }

  /** vanilla SAFE_FALL_DISTANCE 5: it lands softly from higher than most */
  override safeFallDistance(): number {
    return super.safeFallDistance() + 2;
  }
  /** vanilla getMaxFallDistance (getComfortableFallDistance, from its safe fall distance of 5) */
  override maxFallDistance(): number {
    return super.maxFallDistance() + 2;
  }

  /** vanilla getLeashOffset */
  override leashOffset(): [number, number, number] {
    return [0, 0.55 * this.eyeHeight, this.width * 0.4];
  }

  // --- sounds -------------------------------------------------------------------------------------------------

  /**
   * vanilla getAmbientSound: its snore while it sleeps; at night, with no player within 16 blocks, one time in ten its
   * screech; else its yips and whines
   */
  override ambientSound(): string {
    if (this.isSleeping()) return 'entity.fox.sleep';
    if (!this.level.isDay() && this.random.nextFloat() < 0.1) {
      const box = this.bb.inflate(16);
      if (!this.level.players().some((p) => p.gameMode !== 'spectator' && p.bb.intersects(box))) return 'entity.fox.screech';
    }
    return 'entity.fox.ambient';
  }
  /** vanilla playAmbientSound: the screech carries, at twice the volume */
  override playAmbientSound(): void {
    const s = this.ambientSound();
    this.playSound(s, s === 'entity.fox.screech' ? 2 : this.soundVolume(), this.voicePitch());
  }
  override hurtSound(): string {
    return 'entity.fox.hurt';
  }
  override deathSound(): string {
    return 'entity.fox.death';
  }

  // --- saving -------------------------------------------------------------------------------------------------

  /** vanilla addAdditionalSaveData: Trusted (here its uuids, comma-separated), Sleeping, Type, Sitting, Crouching */
  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = {
      ...super.saveData(), Sleeping: this.isSleeping(), Type: this.variantId(), Sitting: this.isSitting(), Crouching: this.isCrouching(),
    };
    const t = this.trusted.filter((u) => u !== null);
    if (t.length) d.Trusted = t.join(',');
    return d;
  }
  /** vanilla readAdditionalSaveData: and its hunting set up for its type */
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.Trusted === 'string') for (const u of d.Trusted.split(',')) if (u) this.addTrustedUUID(u);
    this.setSleeping(d.Sleeping === true);
    this.setVariant(typeByName(String(d.Type ?? '')));
    this.setSitting(d.Sitting === true);
    this.setIsCrouching(d.Crouching === true);
    this.setTargetGoals();
  }
  /** (vanilla /summon with entity data: read as any save, so its hunting's set up even when none of the data is its own) */
  override readSummonData(given: Record<string, number | string | boolean>): void {
    super.readSummonData(given);
    this.setTargetGoals();
  }
}

// ---------------------------------------------------------------------------
// helpers

/**
 * vanilla Fox.isPathClear: nothing but air, water, plants, snow and the like (what could be built over) in the three
 * blocks above the ground at six points along the line to its prey
 */
function isPathClear(f: Fox, t: LivingEntity): boolean {
  const d0 = t.z - f.z, d1 = t.x - f.x;
  const d2 = d0 / d1;
  const w = f.level.world;
  for (let j = 0; j < 6; j++) {
    const d3 = d2 === 0 ? 0 : d0 * (j / 6);
    const d4 = d2 === 0 ? d1 * (j / 6) : Number.isNaN(d2) ? 0 : d3 / d2;
    for (let k = 1; k < 4; k++) {
      const st = w.getState(Math.floor(f.x + d4), Math.floor(f.y + k), Math.floor(f.z + d3));
      // (vanilla BlockState.canBeReplaced: the snow layer is, however deep)
      if (!(FLAGS[st] & F_REPLACEABLE) && BLOCKS[STATE_BLOCK[st]].name !== 'snow') return false;
    }
  }
  return true;
}

/** vanilla new ItemEntity(level, x, y, z, stack): a little toss, any way up (not yet in the world) */
function looseItem(f: Fox, x: number, y: number, z: number, s: ItemStack): ItemEntity {
  const e = new ItemEntity(f.level, s);
  e.moveTo(x, y, z, f.random.nextFloat() * 360, 0);
  e.dx = f.random.nextDouble() * 0.2 - 0.1;
  e.dy = 0.2;
  e.dz = f.random.nextDouble() * 0.2 - 0.1;
  e.pickupDelay = 0;
  return e;
}

/** vanilla FoxBehaviorGoal.hasShelter: the sky hidden over its head, and somewhere it doesn't mind being */
function hasShelter(f: Fox): boolean {
  const x = Math.floor(f.x), y = Math.floor(f.bb.maxY), z = Math.floor(f.z);
  return !f.level.canSeeSky(x, y, z) && f.walkTargetValue(x, y, z) >= 0;
}

/**
 * vanilla FoxAlertableEntitiesSelector: what keeps a fox on its guard: chickens, rabbits and monsters, pets that
 * aren't anyone's yet, and anyone else awake and not sneaking that it doesn't trust; not another fox, nor a player
 * in creative or spectator
 */
function keepsAlert(f: Fox, e: LivingEntity): boolean {
  if (e instanceof Fox) return false;
  if (e.type === 'chicken' || e.type === 'rabbit' || e instanceof Monster) return true;
  if (e instanceof TamableAnimal) return !e.isTame();
  const mode = (e as { gameMode?: string }).gameMode;
  if (e.type === 'player' && (mode === 'spectator' || mode === 'creative')) return false;
  if (f.trusts(e.uuid)) return false;
  return !(e as { isSleeping?(): boolean }).isSleeping?.() && !e.isDiscrete();
}

/**
 * vanilla FoxBehaviorGoal.alertable: any of those within 12 blocks (6 up or down), seen or not, that it could fight
 * (TargetingConditions.forCombat, the range shortened for the sneaking and the invisible)
 */
function alertable(f: Fox): boolean {
  for (const e of f.level.getEntities(f.bb.inflate(12, 6, 12), undefined, f)) {
    if (!(e instanceof LivingEntity) || !e.isAlive || !keepsAlert(f, e) || !f.canAttack(e)) continue;
    const r = Math.max(12 * e.visibilityPercent(f), 2);
    if (f.distanceToSqr(e.x, e.y, e.z) <= r * r) return true;
  }
  return false;
}

/** vanilla Entity.isInPowderSnow: in powder snow anywhere it stands */
function inPowderSnow(f: Fox): boolean {
  const b = f.bb, w = f.level.world;
  for (let x = Math.floor(b.minX); x <= Math.floor(b.maxX - 1e-7); x++)
    for (let y = Math.floor(b.minY); y <= Math.floor(b.maxY - 1e-7); y++)
      for (let z = Math.floor(b.minZ); z <= Math.floor(b.maxZ - 1e-7); z++) if (BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name === 'powder_snow') return true;
  return false;
}

/** vanilla Heightmap.Types.MOTION_BLOCKING_NO_LEAVES: over the highest block that stops movement or holds a fluid, leaves aside */
function motionBlockingNoLeaves(level: Level, x: number, z: number): number {
  const w = level.world;
  for (let y = w.heightAt(x, z) - 1; y >= MIN_Y; y--) {
    const st = w.getState(x, y, z);
    if (FLAGS[st] & F_LEAVES) continue;
    if (FLAGS[st] & (F_WATER | F_LAVA | F_WATERLOGGED) || blocksMotion(st)) return y + 1;
  }
  return MIN_Y;
}

/** vanilla ServerLevel.getEntity(uuid): whoever that is, if they're here */
function entityByUuid(level: Level, u: string): Entity | null {
  const p = level.playerByUuid(u);
  if (p) return p;
  for (const e of level.entities) if (e.hasUuid && e.uuid === u && !e.removed) return e;
  return null;
}

/** vanilla CaveVines.hasGlowBerries */
function hasGlowBerries(st: number): boolean {
  const b = BLOCKS[STATE_BLOCK[st]];
  return (b.name === 'cave_vines' || b.name === 'cave_vines_plant') && b.get<boolean>(st, 'berries') === true;
}

// ---------------------------------------------------------------------------
// controls

/** vanilla Fox.FoxLookControl: asleep it doesn't look about; pouncing, crouched, interested or nose-down it keeps its pitch */
class FoxLookControl extends LookControl {
  constructor(readonly fox: Fox) {
    super(fox);
  }
  override tick(): void {
    if (!this.fox.isSleeping()) super.tick();
  }
  protected override resetXRotOnTick(): boolean {
    const f = this.fox;
    return !f.isPouncing() && !f.isCrouching() && !f.isInterested() && !f.isFaceplanted();
  }
}

/** vanilla Fox.FoxMoveControl: it goes nowhere asleep, sitting or with its nose in the snow */
class FoxMoveControl extends MoveControl {
  constructor(readonly fox: Fox) {
    super(fox);
  }
  override tick(): void {
    if (this.fox.canMove()) super.tick();
  }
}

// ---------------------------------------------------------------------------
// goals

/** vanilla Fox.FoxFloatGoal: it swims once it's a quarter under, up out of whatever it was doing */
class FoxFloatGoal extends FloatGoal {
  constructor(readonly fox: Fox) {
    super(fox);
  }
  override canUse(): boolean {
    const f = this.fox;
    return (f.inWater && f.fluidHeightWater > 0.25) || f.inLava;
  }
  override start(): void {
    super.start();
    this.fox.clearStates();
  }
}

/** vanilla Fox.FaceplantGoal: its nose stuck in the snow, it stays put two seconds, legs kicking */
class FaceplantGoal extends Goal {
  private countdown = 0;
  constructor(readonly fox: Fox) {
    super();
    this.flags = Flag.LOOK | Flag.JUMP | Flag.MOVE;
  }
  canUse(): boolean {
    return this.fox.isFaceplanted();
  }
  override canContinueToUse(): boolean {
    return this.canUse() && this.countdown > 0;
  }
  override start(): void {
    this.countdown = this.adjustedTickDelay(40);
  }
  override stop(): void {
    this.fox.setFaceplanted(false);
  }
  override tick(): void {
    this.countdown--;
  }
}

/** vanilla Fox.FoxPanicGoal: not while it's defending someone */
class FoxPanicGoal extends PanicGoal {
  constructor(readonly fox: Fox, speed: number) {
    super(fox, speed);
  }
  protected override shouldPanic(): boolean {
    return !this.fox.isDefending() && super.shouldPanic();
  }
}

/** vanilla Fox.FoxBreedGoal: both up and minding nothing but each other (the cub's trust: Fox.onBredChild) */
class FoxBreedGoal extends BreedGoal {
  constructor(readonly fox: Fox, speed: number) {
    super(fox, speed);
  }
  override start(): void {
    this.fox.clearStates();
    if (this.partner instanceof Fox) this.partner.clearStates();
    super.start();
  }
}

/**
 * vanilla Fox.StalkPreyGoal: after a chicken or a rabbit more than 6 blocks off it closes in at 1.5, watching it;
 * within 6, it stops, crouches and cocks its head, ready to pounce if the way to it is clear
 */
class StalkPreyGoal extends Goal {
  constructor(readonly fox: Fox) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const f = this.fox;
    if (f.isSleeping()) return false;
    const t = f.target;
    return !!t && t.isAlive && isStalkable(t) && f.distanceToSqr(t.x, t.y, t.z) > 36 && !f.isCrouching() && !f.isInterested() && !f.jumping;
  }
  override start(): void {
    this.fox.setSitting(false);
    this.fox.setFaceplanted(false);
  }
  override stop(): void {
    const f = this.fox, t = f.target;
    if (t && isPathClear(f, t)) {
      f.setIsInterested(true);
      f.setIsCrouching(true);
      f.navigation.stop();
      f.lookControl.setLookAtEntity(t, f.maxHeadYRot(), f.maxHeadXRot());
    } else {
      f.setIsInterested(false);
      f.setIsCrouching(false);
    }
  }
  override tick(): void {
    const f = this.fox, t = f.target;
    if (!t) return;
    f.lookControl.setLookAtEntity(t, f.maxHeadYRot(), f.maxHeadXRot());
    if (f.distanceToSqr(t.x, t.y, t.z) <= 36) {
      f.setIsInterested(true);
      f.setIsCrouching(true);
      f.navigation.stop();
    } else f.navigation.moveToEntity(t, 1.5);
  }
}

/**
 * vanilla Fox.FoxPounceGoal (a JumpGoal): fully crouched with the way to its prey clear, it springs up and at it
 * (0.9 up, 0.8 along), nose tipping with its flight, biting whatever it's after within 2 blocks; landing nose-first
 * in snow it's stuck (faceplanted), and forgets its prey. With the way not clear it stands up and gives up the
 * pounce. Nothing stops it in mid-air
 */
class FoxPounceGoal extends Goal {
  constructor(readonly fox: Fox) {
    super();
    this.flags = Flag.MOVE | Flag.JUMP;
  }
  canUse(): boolean {
    const f = this.fox;
    if (!f.isFullyCrouched()) return false;
    const t = f.target;
    // (vanilla also wants its prey going the way it faces, getMotionDirection() == getDirection(): always so)
    if (!t || !t.isAlive) return false;
    const clear = isPathClear(f, t);
    if (!clear) {
      f.navigation.createPathToEntity(t, 0);
      f.setIsCrouching(false);
      f.setIsInterested(false);
    }
    return clear;
  }
  override canContinueToUse(): boolean {
    const f = this.fox, t = f.target;
    if (!t || !t.isAlive) return false;
    const d0 = f.dy;
    return (!(d0 * d0 < 0.05) || !(Math.abs(f.pitch) < 15) || !f.onGround) && !f.isFaceplanted();
  }
  override isInterruptable(): boolean {
    return false;
  }
  override start(): void {
    const f = this.fox;
    // (vanilla setJumping(true): the jump control puts it back this same tick, the leap is its own)
    f.jumping = true;
    f.setIsPouncing(true);
    f.setIsInterested(false);
    const t = f.target;
    if (t) {
      f.lookControl.setLookAtEntity(t, 60, 30);
      let x = t.x - f.x, y = t.y - f.y, z = t.z - f.z;
      const l = Math.sqrt(x * x + y * y + z * z);
      // (vanilla Vec3.normalize: nothing, that close)
      if (l < 1e-5) x = y = z = 0;
      else {
        x /= l;
        z /= l;
      }
      f.dx += x * 0.8;
      f.dy += 0.9;
      f.dz += z * 0.8;
    }
    f.navigation.stop();
  }
  override stop(): void {
    const f = this.fox;
    f.setIsCrouching(false);
    f.crouchAmount = 0;
    f.crouchAmountO = 0;
    f.setIsInterested(false);
    f.setIsPouncing(false);
  }
  override tick(): void {
    const f = this.fox, t = f.target;
    if (t) f.lookControl.setLookAtEntity(t, 60, 30);
    if (!f.isFaceplanted()) {
      const vy = f.dy;
      if (vy * vy < 0.03 && f.pitch !== 0) f.pitch = rotLerp(0.2, f.pitch, 0);
      else {
        const h = Math.sqrt(f.dx * f.dx + f.dz * f.dz), l = Math.sqrt(f.dx * f.dx + vy * vy + f.dz * f.dz);
        if (l > 0) f.pitch = (Math.sign(-vy) * Math.acos(h / l) * 180) / Math.PI;
      }
    }
    if (t && Math.sqrt(f.distanceToSqr(t.x, t.y, t.z)) <= 2) f.doHurtTarget(t);
    else if (f.pitch > 0 && f.onGround && Math.fround(f.dy) !== 0 && f.level.getBlockName(Math.floor(f.x), Math.floor(f.y), Math.floor(f.z)) === 'snow') {
      f.pitch = 60;
      f.setTarget(null);
      f.setFaceplanted(true);
    }
  }
}

/** vanilla Mth.rotLerp */
function rotLerp(d: number, from: number, to: number): number {
  let w = (to - from) % 360;
  if (w >= 180) w -= 360;
  if (w < -180) w += 360;
  return from + d * w;
}

/**
 * vanilla Fox.SeekShelterGoal (a FleeSunGoal): out under the open sky in a thunderstorm, and every five seconds by
 * day (not in a village), it runs for somewhere under cover
 */
class SeekShelterGoal extends FleeSunGoal {
  private interval = reducedTickDelay(100);
  constructor(readonly fox: Fox, speed: number) {
    super(fox, speed);
  }
  override canUse(): boolean {
    const f = this.fox;
    if (f.isSleeping() || f.target) return false;
    const x = Math.floor(f.x), y = Math.floor(f.y), z = Math.floor(f.z);
    if (f.level.isThundering() && f.level.canSeeSky(x, y, z)) return this.setWantedPos();
    if (this.interval > 0) {
      this.interval--;
      return false;
    }
    this.interval = 100;
    return f.level.isDay() && f.level.canSeeSky(x, y, z) && !f.level.poi.isVillage(x, y, z) && this.setWantedPos();
  }
  override start(): void {
    this.fox.clearStates();
    super.start();
  }
}

/** vanilla Fox.FoxMeleeAttackGoal: at 1.2, when it's up and not crouched; it bites, heard, rather than swipes */
class FoxMeleeAttackGoal extends MeleeAttackGoal {
  constructor(readonly fox: Fox, speed: number, followEvenIfNotSeen: boolean) {
    super(fox, speed, followEvenIfNotSeen);
  }
  override canUse(): boolean {
    const f = this.fox;
    return !f.isSitting() && !f.isSleeping() && !f.isCrouching() && !f.isFaceplanted() && super.canUse();
  }
  override start(): void {
    this.fox.setIsInterested(false);
    super.start();
  }
  protected override checkAndPerformAttack(t: LivingEntity): void {
    const f = this.fox;
    if (this.ticksUntilNextAttack <= 0 && f.isWithinMeleeAttackRange(t) && f.sensing.hasLineOfSight(t)) {
      this.ticksUntilNextAttack = this.attackInterval();
      f.doHurtTarget(t);
      f.playSound('entity.fox.bite', 1, 1);
    }
  }
}

/** vanilla SleepGoal's WAIT_TIME_BEFORE_SLEEP */
const WAIT_BEFORE_SLEEP = reducedTickDelay(140);

/**
 * vanilla Fox.SleepGoal: standing still by day under cover, in no powder snow and with nothing about to keep it alert
 * (after a few seconds' wait), it lies down to sleep, till any of that changes
 */
class SleepGoal extends Goal {
  private countdown: number;
  constructor(readonly fox: Fox) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK | Flag.JUMP;
    this.countdown = fox.random.nextInt(WAIT_BEFORE_SLEEP);
  }
  canUse(): boolean {
    const f = this.fox;
    return f.xxa === 0 && f.yya === 0 && f.zza === 0 ? this.canSleep() || f.isSleeping() : false;
  }
  override canContinueToUse(): boolean {
    return this.canSleep();
  }
  private canSleep(): boolean {
    if (this.countdown > 0) {
      this.countdown--;
      return false;
    }
    const f = this.fox;
    return f.level.isDay() && hasShelter(f) && !alertable(f) && !inPowderSnow(f);
  }
  override stop(): void {
    this.countdown = this.fox.random.nextInt(WAIT_BEFORE_SLEEP);
    this.fox.clearStates();
  }
  override start(): void {
    const f = this.fox;
    f.setSitting(false);
    f.setIsCrouching(false);
    f.setIsInterested(false);
    f.jumping = false;
    f.setSleeping(true);
    f.navigation.stop();
    f.moveControl.setWantedPosition(f.x, f.y, f.z, 0);
  }
}

/** vanilla Fox.FoxFollowParentGoal: not while it's defending someone; it gets up to go */
class FoxFollowParentGoal extends FollowParentGoal {
  constructor(readonly fox: Fox, speed: number) {
    super(fox, speed);
  }
  override canUse(): boolean {
    return !this.fox.isDefending() && super.canUse();
  }
  override canContinueToUse(): boolean {
    return !this.fox.isDefending() && super.canContinueToUse();
  }
  override start(): void {
    this.fox.clearStates();
    super.start();
  }
}

/**
 * vanilla Fox.FoxStrollThroughVillageGoal (a StrollThroughVillageGoal): now and then at night near a village (within 6
 * sections), with nothing else to do, it picks a spot toward the village and sets off 10 blocks that way (or, failing
 * that, somewhere within 8), then gives it up
 */
class FoxStrollThroughVillageGoal extends Goal {
  private readonly interval: number;
  private wanted: [number, number, number] | null = null;
  constructor(readonly fox: Fox, interval: number) {
    super();
    this.interval = reducedTickDelay(interval);
    this.flags = Flag.MOVE;
  }
  private canFoxMove(): boolean {
    const f = this.fox;
    return !f.isSleeping() && !f.isSitting() && !f.isDefending() && f.target === null;
  }
  canUse(): boolean {
    const f = this.fox;
    if (f.controllingPassenger() || f.level.isDay() || f.random.nextInt(this.interval) !== 0) return false;
    const poi = f.level.poi;
    if (poi.sectionsToVillage(Math.floor(f.x) >> 4, Math.floor(f.y) >> 4, Math.floor(f.z) >> 4) > 6) return false;
    this.wanted = landRandomPos(f, 15, 7, (p) => -poi.sectionsToVillage(p[0] >> 4, p[1] >> 4, p[2] >> 4));
    return this.wanted !== null && this.canFoxMove();
  }
  override canContinueToUse(): boolean {
    const w = this.wanted, nav = this.fox.navigation, t = nav.targetPos;
    return w !== null && !nav.isDone() && !!t && t[0] === w[0] && t[1] === w[1] && t[2] === w[2] && this.canFoxMove();
  }
  override start(): void {
    this.fox.clearStates();
  }
  override tick(): void {
    const w = this.wanted, f = this.fox, nav = f.navigation;
    if (!w || !nav.isDone()) return;
    const cx = w[0] + 0.5, cy = w[1], cz = w[2] + 0.5;
    if ((cx - f.x) ** 2 + (cy + 0.5 - f.y) ** 2 + (cz - f.z) ** 2 < 100) return;
    // (a point four tenths of the way back from there to it, and 10 blocks toward that: only across matters, the
    // ground's height there is taken)
    const dx = (cx - f.x) * 0.6, dy = (cy - f.y) * 0.6, dz = (cz - f.z) * 0.6;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const k = l < 1e-5 ? 0 : 10 / l;
    const x = Math.floor(f.x + dx * k), z = Math.floor(f.z + dz * k);
    if (!nav.moveTo(x, motionBlockingNoLeaves(f.level, x, z), z, 1)) this.moveRandomly();
  }
  private moveRandomly(): void {
    const f = this.fox, r = f.random;
    const x = Math.floor(f.x) - 8 + r.nextInt(16), z = Math.floor(f.z) - 8 + r.nextInt(16);
    f.navigation.moveTo(x, motionBlockingNoLeaves(f.level, x, z), z, 1);
  }
}

/**
 * vanilla Fox.FoxEatBerriesGoal (a MoveToBlockGoal, 12 across and a block up or down): off at 1.2 to a ripe sweet
 * berry bush or glow berries, sniffing as it goes; there two seconds, it picks them (with mob griefing on): a bush's
 * one to three berries, the first into its mouth if that's empty and the rest dropped, or a glow berry
 */
class FoxEatBerriesGoal extends MoveToBlockGoal {
  protected ticksWaited = 0;
  constructor(readonly fox: Fox, speed: number, range: number, vRange: number) {
    super(fox, speed, range, vRange);
  }
  override acceptedDistance(): number {
    return 2;
  }
  override shouldRecalculatePath(): boolean {
    return this.tryTicks % 100 === 0;
  }
  protected isValidTarget(x: number, y: number, z: number): boolean {
    const st = this.fox.level.world.getState(x, y, z), b = BLOCKS[STATE_BLOCK[st]];
    return (b.name === 'sweet_berry_bush' && b.get<number>(st, 'age') >= 2) || hasGlowBerries(st);
  }
  override tick(): void {
    if (this.isReachedTarget()) {
      if (this.ticksWaited >= 40) this.onReachedTarget();
      else this.ticksWaited++;
    } else if (this.fox.random.nextFloat() < 0.05) this.fox.playSound('entity.fox.sniff', 1, 1);
    super.tick();
  }
  protected onReachedTarget(): void {
    const f = this.fox, lvl = f.level;
    if (!lvl.gameRules.mobGriefing) return;
    const st = lvl.world.getState(this.bx, this.by, this.bz), b = BLOCKS[STATE_BLOCK[st]];
    if (b.name === 'sweet_berry_bush') this.pickSweetBerries(st);
    else if (hasGlowBerries(st)) this.pickGlowBerry(st);
  }
  /** vanilla CaveVines.use: the berry drops, the vine goes dark */
  private pickGlowBerry(st: number): void {
    const lvl = this.fox.level, x = this.bx, y = this.by, z = this.bz;
    ItemEntity.drop(lvl, x, y, z, ItemStack.of('glow_berries'));
    lvl.sound.play('block.cave_vines.pick_berries', x + 0.5, y + 0.5, z + 0.5, 1, 0.8 + lvl.random.nextFloat() * 0.4);
    const now = BLOCKS[STATE_BLOCK[st]].with(st, 'berries', false);
    lvl.setBlock(x, y, z, now, 2);
    lvl.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { entity: this.fox, state: now });
  }
  /** vanilla pickSweetBerries: one or two berries, three from a full bush; the bush back to age 1 */
  private pickSweetBerries(st: number): void {
    const f = this.fox, lvl = f.level, b = BLOCKS[STATE_BLOCK[st]];
    const age = b.get<number>(st, 'age');
    let j = 1 + lvl.random.nextInt(2) + (age === 3 ? 1 : 0);
    if (!f.mainHand) {
      f.setItemSlot('mainhand', ItemStack.of('sweet_berries'));
      j--;
    }
    if (j > 0) ItemEntity.drop(lvl, this.bx, this.by, this.bz, ItemStack.of('sweet_berries', j));
    f.playSound('block.sweet_berry_bush.pick_berries', 1, 1);
    lvl.setBlock(this.bx, this.by, this.bz, b.with(st, 'age', 1), 2);
    lvl.gameEvent('block_change', this.bx + 0.5, this.by + 0.5, this.bz + 0.5, { entity: f });
  }
  override canUse(): boolean {
    return !this.fox.isSleeping() && super.canUse();
  }
  override start(): void {
    this.ticksWaited = 0;
    this.fox.setSitting(false);
    super.start();
  }
}

/** vanilla Fox.ALLOWED_ITEMS: items lying within 8 blocks that can be taken now */
function itemsAbout(f: Fox): ItemEntity[] {
  return f.level.getEntities(f.bb.inflate(8, 8, 8), (e) => e instanceof ItemEntity && !e.removed && e.pickupDelay <= 0) as ItemEntity[];
}

/**
 * vanilla Fox.FoxSearchForItemsGoal: with nothing in its mouth, unhurt and not hunting, now and then it makes for an
 * item lying about (at 1.2)
 */
class FoxSearchForItemsGoal extends Goal {
  constructor(readonly fox: Fox) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const f = this.fox;
    if (f.mainHand || f.target || f.lastHurtByMob || !f.canMove()) return false;
    if (f.random.nextInt(reducedTickDelay(10)) !== 0) return false;
    return itemsAbout(f).length > 0 && !f.mainHand;
  }
  override tick(): void {
    const l = itemsAbout(this.fox);
    if (!this.fox.mainHand && l.length) this.fox.navigation.moveToEntity(l[0], 1.2);
  }
  override start(): void {
    const l = itemsAbout(this.fox);
    if (l.length) this.fox.navigation.moveToEntity(l[0], 1.2);
  }
}

/** vanilla Fox.FoxLookAtPlayerGoal: not with its nose in the snow, nor its head cocked at something */
class FoxLookAtPlayerGoal extends LookAtPlayerGoal {
  constructor(readonly fox: Fox, dist: number) {
    super(fox, dist);
  }
  override canUse(): boolean {
    return super.canUse() && !this.fox.isFaceplanted() && !this.fox.isInterested();
  }
  override canContinueToUse(): boolean {
    return super.canContinueToUse() && !this.fox.isFaceplanted() && !this.fox.isInterested();
  }
}

/**
 * vanilla Fox.PerchAndSearchGoal: now and then, idle, unhurt and with nothing about to keep it alert, it sits down
 * and looks this way and that, two to four long looks
 */
class PerchAndSearchGoal extends Goal {
  private relX = 0;
  private relZ = 0;
  private lookTime = 0;
  private looksRemaining = 0;
  constructor(readonly fox: Fox) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const f = this.fox;
    return f.lastHurtByMob === null && f.random.nextFloat() < 0.02 && !f.isSleeping() && f.target === null && f.navigation.isDone() && !alertable(f) && !f.isPouncing() && !f.isCrouching();
  }
  override canContinueToUse(): boolean {
    return this.looksRemaining > 0;
  }
  override start(): void {
    this.resetLook();
    this.looksRemaining = 2 + this.fox.random.nextInt(3);
    this.fox.setSitting(true);
    this.fox.navigation.stop();
  }
  override stop(): void {
    this.fox.setSitting(false);
  }
  override tick(): void {
    this.lookTime--;
    if (this.lookTime <= 0) {
      this.looksRemaining--;
      this.resetLook();
    }
    const f = this.fox;
    f.lookControl.setLookAt(f.x + this.relX, f.y + f.eyeHeight, f.z + this.relZ, f.maxHeadYRot(), f.maxHeadXRot());
  }
  private resetLook(): void {
    const r = this.fox.random, d0 = Math.PI * 2 * r.nextDouble();
    this.relX = Math.cos(d0);
    this.relZ = Math.sin(d0);
    this.lookTime = this.adjustedTickDelay(80 + r.nextInt(20));
  }
}

/**
 * vanilla Fox.DefendTrustedTargetGoal (a NearestAttackableTargetGoal): now and then it looks to the first one it trusts
 * that's about; whatever has hurt them since it last looked (and has hurt anything at all, and isn't trusted itself),
 * if it's in sight within its follow range, it goes for, growling, awake and defending
 */
class DefendTrustedTargetGoal extends TargetGoal {
  private readonly randomInterval = reducedTickDelay(10);
  private trustedLastHurtBy: LivingEntity | null = null;
  private trustedLastHurt: LivingEntity | null = null;
  private timestamp = 0;
  constructor(readonly fox: Fox) {
    super(fox, false);
  }
  canUse(): boolean {
    const f = this.fox;
    if (this.randomInterval > 0 && f.random.nextInt(this.randomInterval) !== 0) return false;
    for (const u of f.trustedUUIDs()) {
      if (u === null) continue;
      const e = entityByUuid(f.level, u);
      if (!(e instanceof LivingEntity)) continue;
      this.trustedLastHurt = e;
      this.trustedLastHurtBy = e.lastHurtByMob;
      return e.lastHurtByMobTimestamp !== this.timestamp && this.canAttackTarget(this.trustedLastHurtBy);
    }
    return false;
  }
  /**
   * vanilla TargetGoal.canAttack with TargetingConditions.forCombat: one that's hurt something lately
   * (TRUSTED_TARGET_SELECTOR) and isn't trusted, that it could fight, within its follow range and in sight
   */
  private canAttackTarget(t: LivingEntity | null): boolean {
    const f = this.fox;
    if (!t || t === f || !t.isAlive || t.lastHurtMob === null || !(t.lastHurtMobTimestamp < t.tickCount + 600)) return false;
    if ((t as { gameMode?: string }).gameMode === 'spectator' || f.trusts(t.uuid) || !f.canAttack(t)) return false;
    const r = Math.max(this.followDistance() * t.visibilityPercent(f), 2);
    if (f.distanceToSqr(t.x, t.y, t.z) > r * r || !f.sensing.hasLineOfSight(t)) return false;
    return f.isWithinRestriction(Math.floor(t.x), Math.floor(t.y), Math.floor(t.z));
  }
  override start(): void {
    const f = this.fox;
    this.targetMob = this.trustedLastHurtBy;
    if (this.trustedLastHurt) this.timestamp = this.trustedLastHurt.lastHurtByMobTimestamp;
    f.playSound('entity.fox.aggro', 1, 1);
    f.setDefending(true);
    f.wakeUp();
    f.setTarget(this.trustedLastHurtBy);
    super.start();
  }
}
