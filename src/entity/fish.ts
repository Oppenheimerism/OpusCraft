// Fish (Stage 5: ocean; vanilla AbstractFish, AbstractSchoolingFish, Cod, Salmon, TropicalFish, Pufferfish and
// Bucketable).
//
// A fish swims about (a water-bound path, a push of 0.01 a tick along its facing, sinking a little when it has no
// target), flees from players within 8 blocks and panics when hurt; out of the water it flops about until it
// suffocates. Cod, salmon and tropical fish swim in schools: one leads, the rest follow it (up to 8 cod, 5 salmon or
// tropical fish). A pufferfish puffs up when anything but another sea creature (or a creative player) comes within
// 2 blocks — halfway at once, all the way two seconds on — and its spines sting whoever touches it (poison, and
// more the more it's puffed up); it goes down again a few seconds after the danger's gone. A tropical fish is one of
// 2 shapes × 6 patterns × 16 × 16 colours: nine in ten spawn as one of the 22 common kinds, a whole school alike.
// A water bucket scoops a fish up (the bucket keeps its health and a tropical fish's kind); poured out, the fish
// comes back where the water goes, and never despawns after that.

import { WaterAnimal } from './water';
import type { Level } from '../game/level';
import type { LootEntry, MobCategory, SpawnGroup, SpawnReason } from './mob';
import { Mob } from './mob';
import { LivingEntity } from './living';
import type { Player } from './player';
import { Goal } from './ai/goal';
import { MoveControl, MoveOp, rotlerp } from './ai/controls';
import { WaterBoundPathNavigation, type PathNavigation } from './ai/navigation';
import { PanicGoal, AvoidEntityGoal, RandomStrollGoal, defaultRandomPos } from './ai/goals';
import { MOB_EFFECTS, MobEffectInstance } from './effects';
import { FLAGS, F_WATER, COLLISION, BLOCKS, STATE_BLOCK } from '../world/block';
import { FLUID_WATER } from '../world/fluids';
import { ItemStack } from '../item/item';
import { DYE_COLORS } from './animals';

type Pos = [number, number, number];

// ---------------------------------------------------------------------------
// swimming about (vanilla RandomSwimmingGoal, BehaviorUtils.getRandomSwimmablePos)

/** vanilla BehaviorUtils.getRandomSwimmablePos: a random spot (DefaultRandomPos.getPos), tried again till it's in water */
export function randomSwimmablePos(m: Mob, radius: number, yRange: number): Pos | null {
  let p = defaultRandomPos(m, radius, yRange);
  for (let i = 0; p && !(FLAGS[m.level.world.getState(p[0], p[1], p[2])] & F_WATER) && i++ < 10; ) p = defaultRandomPos(m, radius, yRange);
  return p;
}

/** vanilla RandomSwimmingGoal: a random stroll to somewhere in the water */
export class RandomSwimmingGoal extends RandomStrollGoal {
  protected override getPosition(): Pos | null {
    return randomSwimmablePos(this.mob, 10, 7);
  }
}

// ---------------------------------------------------------------------------
// AbstractFish

/** vanilla #not_scary_for_pufferfish: the sea's own creatures */
const NOT_SCARY_FOR_PUFFERFISH = new Set(['turtle', 'guardian', 'elder_guardian', 'cod', 'pufferfish', 'salmon', 'tropical_fish', 'dolphin', 'squid', 'glow_squid', 'tadpole']);

/** vanilla bucket_entity_data: what the bucket keeps of its fish */
export type BucketEntityData = Record<string, number | boolean>;

export abstract class AbstractFish extends WaterAnimal {
  override readonly category: MobCategory = 'water_ambient';
  /** vanilla FROM_BUCKET: poured out of a bucket (it never despawns) */
  fromBucket = false;

  constructor(level: Level) {
    super(level);
    // vanilla AbstractFish.createAttributes: 3 health (the movement speed attribute's default 0.7)
    this.maxHealth = this.health = 3;
    this.moveSpeedAttr = 0.7;
    this.moveControl = new FishMoveControl(this);
  }

  protected override createNavigation(): PathNavigation {
    return new WaterBoundPathNavigation(this);
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new PanicGoal(this, 1.25));
    // (vanilla EntitySelector.NO_SPECTATORS)
    this.goalSelector.addGoal(2, new AvoidEntityGoal(this, (e) => e.type === 'player' && (e as Player).gameMode !== 'spectator', 8, 1.6, 1.4));
    this.goalSelector.addGoal(4, new FishSwimGoal(this));
  }

  /** vanilla canRandomSwim: a school's followers keep with their leader instead */
  canRandomSwim(): boolean {
    return true;
  }

  override requiresCustomPersistence(): boolean {
    return super.requiresCustomPersistence() || this.fromBucket;
  }

  override removeWhenFarAway(): boolean {
    return !this.fromBucket;
  }

  override maxSpawnClusterSize(): number {
    return 8;
  }

  /** vanilla AbstractFish.travel: in water a push of 0.01 along its facing, a tenth off a tick, sinking without a target */
  override travel(sx: number, sy: number, sz: number): void {
    if (this.inWater) {
      this.moveRelative(0.01, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      this.dx *= 0.9;
      this.dy *= 0.9;
      this.dz *= 0.9;
      if (!this.target) this.dy -= 0.005;
    } else super.travel(sx, sy, sz);
  }

  /** vanilla AbstractFish.aiStep: landed out of the water, it flops (up 0.4, a little to one side) */
  override aiStep(): void {
    if (!this.inWater && this.onGround && this.verticalCollision) {
      this.dx += (this.random.nextFloat() * 2 - 1) * 0.05;
      this.dy += 0.4;
      this.dz += (this.random.nextFloat() * 2 - 1) * 0.05;
      this.onGround = false;
      this.playSound(this.flopSound(), this.soundVolume(), this.voicePitch());
    }
    super.aiStep();
  }

  /** vanilla AbstractFish.mobInteract → Bucketable.bucketMobPickup */
  override interact(p: Player, stack: ItemStack | null): boolean {
    return bucketMobPickup(p, stack, this);
  }

  /** vanilla getBucketItemStack */
  abstract bucketItem(): string;
  protected abstract flopSound(): string;

  /** vanilla Bucketable.saveDefaultDataToBucketTag: its health (and what else it keeps) */
  saveToBucketTag(stack: ItemStack): void {
    stack.tag = { ...(stack.tag ?? {}), bucketEntity: { Health: this.health } };
  }

  /** vanilla Bucketable.loadDefaultDataFromBucketTag */
  loadFromBucketTag(d: BucketEntityData): void {
    if (typeof d.Health === 'number') this.health = Math.min(this.maxHealth, d.Health);
  }

  override ambientSound(): string | null {
    // (vanilla's fish ambient events have no sounds)
    return null;
  }

  /** vanilla getSwimSound: entity.fish.swim, as loud as it's fast (Entity.vibrationAndSoundEffectsFromBlock) */
  protected override playSwimSound(): void {
    const v = Math.min(1, Math.sqrt(this.dx * this.dx * 0.2 + this.dy * this.dy + this.dz * this.dz * 0.2) * 0.35);
    this.playSound('entity.fish.swim', v, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.4);
  }

  /** vanilla playStepSound: none */
  protected override playStepSound(): void {}

  protected override saveData(): Record<string, number | string | boolean> | undefined {
    return { ...super.saveData(), FromBucket: this.fromBucket };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.fromBucket = d.FromBucket === true;
  }
}

/**
 * vanilla Bucketable.bucketMobPickup: a water bucket scoops up a live fish (with the fill sound); in survival the
 * bucket becomes the fish's, in creative the fish's bucket comes as well (ItemUtils.createFilledResult)
 */
export function bucketMobPickup(p: Player, stack: ItemStack | null, fish: AbstractFish): boolean {
  if (!stack || stack.item.id !== 'water_bucket' || !fish.isAlive) return false;
  fish.playSound('item.bucket.fill_fish', 1, 1);
  const bucket = ItemStack.of(fish.bucketItem());
  fish.saveToBucketTag(bucket);
  if (p.gameMode === 'creative') {
    if (p.inventory.add(bucket) > 0) p.dropItem(bucket, false);
  } else if (stack.count <= 1) p.inventory.setSelectedItem(bucket);
  else {
    p.inventory.consumeSelected(1);
    if (p.inventory.add(bucket) > 0) p.dropItem(bucket, false);
  }
  fish.level.onPlayerTrigger?.(p, 'filled_bucket', { filledBucket: bucket.item.id });
  fish.remove();
  return true;
}

/** vanilla AbstractFish.FishMoveControl: buoyed up in the water, easing its speed toward the wanted one and turning */
class FishMoveControl extends MoveControl {
  constructor(readonly fish: AbstractFish) {
    super(fish);
  }
  override tick(): void {
    const f = this.fish;
    if (f.eyeFluid === FLUID_WATER) f.dy += 0.005;
    if (this.operation === MoveOp.MOVE_TO && !f.navigation.isDone()) {
      const s = this.speedModifier * f.moveSpeedAttr;
      f.setSpeed(f.speed + (s - f.speed) * 0.125);
      const d0 = this.wantedX - f.x, d1 = this.wantedY - f.y, d2 = this.wantedZ - f.z;
      if (d1 !== 0) f.dy += f.speed * (d1 / Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2)) * 0.1;
      if (d0 !== 0 || d2 !== 0) {
        f.yaw = rotlerp(f.yaw, (Math.atan2(d2, d0) * 180) / Math.PI - 90, 90);
        f.bodyYaw = f.yaw;
      }
    } else f.setSpeed(0);
  }
}

/** vanilla AbstractFish.FishSwimGoal: RandomSwimmingGoal(1.0, 40), for a fish that isn't following a leader */
class FishSwimGoal extends RandomSwimmingGoal {
  constructor(readonly fish: AbstractFish) {
    super(fish, 1, 40);
  }
  override canUse(): boolean {
    return this.fish.canRandomSwim() && super.canUse();
  }
}

// ---------------------------------------------------------------------------
// AbstractSchoolingFish

/** vanilla AbstractSchoolingFish.SchoolSpawnGroupData: a spawn pack's leader */
const SCHOOL_LEADERS = new WeakMap<SpawnGroup, AbstractSchoolingFish>();

export abstract class AbstractSchoolingFish extends AbstractFish {
  leader: AbstractSchoolingFish | null = null;
  schoolSize = 1;

  protected override registerGoals(): void {
    super.registerGoals();
    this.goalSelector.addGoal(5, new FollowFlockLeaderGoal(this));
  }

  override maxSpawnClusterSize(): number {
    return this.maxSchoolSize();
  }
  /** vanilla getMaxSchoolSize (AbstractFish's spawn cluster, 8) */
  maxSchoolSize(): number {
    return 8;
  }
  override canRandomSwim(): boolean {
    return !this.isFollower();
  }
  isFollower(): boolean {
    return this.leader !== null && this.leader.isAlive;
  }
  startFollowing(leader: AbstractSchoolingFish): AbstractSchoolingFish {
    this.leader = leader;
    leader.schoolSize++;
    return leader;
  }
  stopFollowing(): void {
    if (this.leader) this.leader.schoolSize--;
    this.leader = null;
  }
  canBeFollowed(): boolean {
    return this.hasFollowers() && this.schoolSize < this.maxSchoolSize();
  }
  hasFollowers(): boolean {
    return this.schoolSize > 1;
  }
  inRangeOfLeader(): boolean {
    const l = this.leader;
    return !!l && this.distanceToSqr(l.x, l.y, l.z) <= 121;
  }
  pathToLeader(): void {
    if (this.isFollower()) this.navigation.moveToEntity(this.leader!, 1);
  }
  /** vanilla addFollowers: as many of these as it has room for (itself among them, not following itself) */
  addFollowers(fish: AbstractSchoolingFish[]): void {
    let room = this.maxSchoolSize() - this.schoolSize;
    for (const f of fish) {
      if (room-- <= 0) break;
      if (f !== this) f.startFollowing(this);
    }
  }

  /** vanilla AbstractSchoolingFish.tick: now and then a leader with no fish of its kind about forgets its school */
  override tick(): void {
    super.tick();
    if (this.hasFollowers() && this.level.random.nextInt(200) === 1) {
      if (this.level.getEntities(this.bb.inflate(8), (e) => e.type === this.type).length <= 1) this.schoolSize = 1;
    }
  }

  /** vanilla finalizeSpawn: the first of a spawn pack leads it, the rest follow */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    super.finalizeSpawn(reason, group);
    if (!group) return;
    const leader = SCHOOL_LEADERS.get(group);
    if (!leader) SCHOOL_LEADERS.set(group, this);
    else this.startFollowing(leader);
  }

  /** (a new leader for the rest of the pack: vanilla hands on a new group data) */
  protected leadPack(group: SpawnGroup): void {
    SCHOOL_LEADERS.set(group, this);
  }
}

/** vanilla FollowFlockLeaderGoal: every ten seconds or so a loner looks for a school to join (or gathers one) */
class FollowFlockLeaderGoal extends Goal {
  private timeToRecalcPath = 0;
  private nextStartTick: number;
  constructor(readonly mob: AbstractSchoolingFish) {
    super();
    this.nextStartTick = this.nextStart();
  }
  private nextStart(): number {
    return Math.ceil((200 + (this.mob.random.nextInt(200) % 20)) / 2);
  }
  canUse(): boolean {
    const m = this.mob;
    if (m.hasFollowers()) return false;
    if (m.isFollower()) return true;
    if (this.nextStartTick > 0) {
      this.nextStartTick--;
      return false;
    }
    this.nextStartTick = this.nextStart();
    const list = m.level.getEntities(m.bb.inflate(8), (e) => e.type === m.type && ((e as AbstractSchoolingFish).canBeFollowed() || !(e as AbstractSchoolingFish).isFollower())) as AbstractSchoolingFish[];
    const leader = list.find((f) => f.canBeFollowed()) ?? m;
    leader.addFollowers(list.filter((f) => !f.isFollower()));
    return m.isFollower();
  }
  override canContinueToUse(): boolean {
    return this.mob.isFollower() && this.mob.inRangeOfLeader();
  }
  override start(): void {
    this.timeToRecalcPath = 0;
  }
  override stop(): void {
    this.mob.stopFollowing();
  }
  override tick(): void {
    if (--this.timeToRecalcPath <= 0) {
      this.timeToRecalcPath = this.adjustedTickDelay(10);
      this.mob.pathToLeader();
    }
  }
}

// ---------------------------------------------------------------------------
// the fish

/** vanilla loot_tables/entities/<fish>: the fish (cooked if it burned), and a bone meal one time in twenty */
function fishLoot(item: string, cooked?: string): LootEntry[] {
  return [
    { item, min: 1, max: 1, cooked, noLooting: true },
    { item: 'bone_meal', min: 1, max: 1, chance: 0.05, noLooting: true },
  ];
}

/** vanilla Cod: schools of up to eight */
export class Cod extends AbstractSchoolingFish {
  readonly type = 'cod';
  constructor(level: Level) {
    super(level);
    this.setSize(0.5, 0.3);
  }
  override get eyeHeight(): number {
    return 0.195;
  }
  bucketItem(): string {
    return 'cod_bucket';
  }
  protected flopSound(): string {
    return 'entity.cod.flop';
  }
  override hurtSound(): string {
    return 'entity.cod.hurt';
  }
  override deathSound(): string {
    return 'entity.cod.death';
  }
  override lootTable(): LootEntry[] {
    return fishLoot('cod', 'cooked_cod');
  }
}

/** vanilla Salmon (1.21: one size): schools of up to five */
export class Salmon extends AbstractSchoolingFish {
  readonly type = 'salmon';
  constructor(level: Level) {
    super(level);
    this.setSize(0.7, 0.4);
  }
  override get eyeHeight(): number {
    return 0.26;
  }
  override maxSchoolSize(): number {
    return 5;
  }
  bucketItem(): string {
    return 'salmon_bucket';
  }
  protected flopSound(): string {
    return 'entity.salmon.flop';
  }
  override hurtSound(): string {
    return 'entity.salmon.hurt';
  }
  override deathSound(): string {
    return 'entity.salmon.death';
  }
  override lootTable(): LootEntry[] {
    return fishLoot('salmon', 'cooked_salmon');
  }
}

// --- tropical fish (vanilla TropicalFish.Pattern, Variant, COMMON_VARIANTS)

/** vanilla TropicalFish.Pattern, in order: six on the small body (tropical_a), six on the large (tropical_b) */
export const TROPICAL_PATTERNS = ['kob', 'sunstreak', 'snooper', 'dasher', 'brinely', 'spotty', 'flopper', 'stripey', 'glitter', 'blockfish', 'betty', 'clayfish'] as const;

/** vanilla Pattern.getPackedId: the body shape (0 small, 1 large) and the pattern's index on it (<< 8) */
const patternPacked = (i: number): number => (i < 6 ? 0 : 1) | (i % 6) << 8;

/** vanilla Variant.getPackedId: the pattern, the body colour (<< 16) and the pattern's colour (<< 24) */
export function packTropical(pattern: number, base: number, patternColor: number): number {
  return (patternPacked(pattern) & 0xffff) | (base & 0xff) << 16 | (patternColor & 0xff) << 24;
}

/** a packed variant's parts: the pattern (index into TROPICAL_PATTERNS, kob if unknown), the body's and pattern's colours */
export function unpackTropical(v: number): { pattern: number; base: number; patternColor: number; large: boolean; index: number } {
  const p = v & 0xffff;
  let pattern = 0;
  for (let i = 0; i < 12; i++) if (patternPacked(i) === p) pattern = i;
  return { pattern, base: (v >> 16) & 0xff & 15, patternColor: (v >>> 24) & 0xff & 15, large: pattern >= 6, index: pattern % 6 };
}

const PAT = (n: string) => TROPICAL_PATTERNS.indexOf(n as (typeof TROPICAL_PATTERNS)[number]);
const DYE = (n: string) => DYE_COLORS.indexOf(n);
/** vanilla TropicalFish.COMMON_VARIANTS: the 22 named kinds (Anemone, Black Tang ... Yellow Tang) */
export const COMMON_TROPICAL: readonly number[] = ([
  ['stripey', 'orange', 'gray'], ['flopper', 'gray', 'gray'], ['flopper', 'gray', 'blue'], ['clayfish', 'white', 'gray'],
  ['sunstreak', 'blue', 'gray'], ['kob', 'orange', 'white'], ['spotty', 'pink', 'light_blue'], ['blockfish', 'purple', 'yellow'],
  ['clayfish', 'white', 'red'], ['spotty', 'white', 'yellow'], ['glitter', 'white', 'gray'], ['clayfish', 'white', 'orange'],
  ['dasher', 'cyan', 'pink'], ['brinely', 'lime', 'light_blue'], ['betty', 'red', 'white'], ['snooper', 'gray', 'red'],
  ['blockfish', 'red', 'white'], ['flopper', 'white', 'yellow'], ['kob', 'red', 'white'], ['sunstreak', 'gray', 'white'],
  ['dasher', 'cyan', 'yellow'], ['flopper', 'yellow', 'yellow'],
] as const).map(([p, b, c]) => packTropical(PAT(p), DYE(b), DYE(c)));

/** en_us entity.minecraft.tropical_fish.predefined.0-21 */
export const COMMON_TROPICAL_NAMES = [
  'Anemone', 'Black Tang', 'Blue Tang', 'Butterflyfish', 'Cichlid', 'Clownfish', 'Cotton Candy Betta', 'Dottyback', 'Emperor Red Snapper',
  'Goatfish', 'Moorish Idol', 'Ornate Butterflyfish', 'Parrotfish', 'Queen Angelfish', 'Red Cichlid', 'Red Lipped Blenny', 'Red Snapper',
  'Threadfin', 'Tomato Clownfish', 'Triggerfish', 'Yellowtail Parrotfish', 'Yellow Tang',
];

/** vanilla TropicalFishGroupData: the kind a spawn pack shares */
const TROPICAL_GROUPS = new WeakMap<SpawnGroup, number>();

/** vanilla TropicalFish: schools of up to five, alike */
export class TropicalFish extends AbstractSchoolingFish {
  readonly type = 'tropical_fish';
  /** vanilla DATA_ID_TYPE_VARIANT (packed: see packTropical) */
  variant = 0;
  /** vanilla isSchool: false for one of the rare random kinds (vanilla keeps it and never reads it) */
  isSchool = true;

  constructor(level: Level) {
    super(level);
    this.setSize(0.5, 0.4);
  }
  override get eyeHeight(): number {
    return 0.26;
  }
  override maxSchoolSize(): number {
    return 5;
  }

  /**
   * vanilla TropicalFish.finalizeSpawn: out of a bucket it's whatever the bucket says; else the pack's kind, or (nine
   * times in ten) one of the common kinds for the rest of the pack, or a random one of its own
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    super.finalizeSpawn(reason, group);
    if (reason === 'bucket') return;
    const r = this.random;
    const shared = group ? TROPICAL_GROUPS.get(group) : undefined;
    if (shared !== undefined) this.variant = shared;
    else if (r.nextFloat() < 0.9) {
      this.variant = COMMON_TROPICAL[r.nextInt(COMMON_TROPICAL.length)];
      if (group) {
        TROPICAL_GROUPS.set(group, this.variant);
        this.leadPack(group);
      }
    } else {
      this.isSchool = false;
      const pattern = r.nextInt(12), base = r.nextInt(16), color = r.nextInt(16);
      this.variant = packTropical(pattern, base, color);
    }
  }

  bucketItem(): string {
    return 'tropical_fish_bucket';
  }
  override saveToBucketTag(stack: ItemStack): void {
    super.saveToBucketTag(stack);
    stack.tag!.bucketEntity!.BucketVariantTag = this.variant;
  }
  override loadFromBucketTag(d: BucketEntityData): void {
    super.loadFromBucketTag(d);
    if (typeof d.BucketVariantTag === 'number') this.variant = d.BucketVariantTag;
  }
  protected flopSound(): string {
    return 'entity.tropical_fish.flop';
  }
  override hurtSound(): string {
    return 'entity.tropical_fish.hurt';
  }
  override deathSound(): string {
    return 'entity.tropical_fish.death';
  }
  override lootTable(): LootEntry[] {
    return fishLoot('tropical_fish');
  }
  protected override saveData(): Record<string, number | string | boolean> | undefined {
    return { ...super.saveData(), Variant: this.variant };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.Variant === 'number') this.variant = d.Variant;
  }

  /**
   * vanilla checkTropicalFishSpawnRules: in water with water above it, near the top of the sea (a surface water
   * animal's rules) but at any depth in the lush caves (#allows_tropical_fish_spawns_at_any_height)
   */
  static checkTropicalFishSpawn(level: Level, x: number, y: number, z: number, biome: string): boolean {
    const w = level.world;
    if (biome !== 'lush_caves') return WaterAnimal.checkSurfaceSpawn(level, x, y, z);
    return (FLAGS[w.getState(x, y - 1, z)] & F_WATER) !== 0 && BLOCKS[STATE_BLOCK[w.getState(x, y + 1, z)]].name === 'water';
  }
}

// --- the pufferfish

/** vanilla Pufferfish.getScale: half size deflated, 0.7 halfway, full size all puffed up */
const PUFF_SCALE = [0.5, 0.7, 1];

/** vanilla Pufferfish.TARGETING_CONDITIONS: anything alive but a creative player and the sea's own creatures */
function scaresPufferfish(e: LivingEntity): boolean {
  if (!e.isAlive || e.removed) return false;
  if (e.type === 'player') {
    const gm = (e as Player).gameMode;
    return gm !== 'creative' && gm !== 'spectator';
  }
  return !NOT_SCARY_FOR_PUFFERFISH.has(e.type);
}

export class Pufferfish extends AbstractFish {
  readonly type = 'pufferfish';
  /** vanilla PUFF_STATE: 0 deflated, 1 halfway, 2 all puffed up */
  puffState = 0;
  inflateCounter = 0;
  deflateTimer = 0;

  constructor(level: Level) {
    super(level);
    this.setPuffState(0);
  }

  /** vanilla setPuffState (refreshDimensions: 0.7 across at full size, the rest in proportion) */
  setPuffState(s: number): void {
    this.puffState = s;
    const k = PUFF_SCALE[Math.min(2, s)];
    this.setSize(0.7 * k, 0.7 * k);
  }
  override get eyeHeight(): number {
    return 0.455 * PUFF_SCALE[Math.min(2, this.puffState)];
  }

  protected override registerGoals(): void {
    super.registerGoals();
    this.goalSelector.addGoal(1, new PufferfishPuffGoal(this));
  }

  /** vanilla Pufferfish.tick: puffing up (halfway at once, all the way after 40 ticks), and down again, a step at a time */
  override tick(): void {
    if (this.isAlive) {
      if (this.inflateCounter > 0) {
        if (this.puffState === 0) {
          this.playSound('entity.puffer_fish.blow_up', this.soundVolume(), this.voicePitch());
          this.setPuffState(1);
        } else if (this.inflateCounter > 40 && this.puffState === 1) {
          this.playSound('entity.puffer_fish.blow_up', this.soundVolume(), this.voicePitch());
          this.setPuffState(2);
        }
        this.inflateCounter++;
      } else if (this.puffState !== 0) {
        if (this.deflateTimer > 60 && this.puffState === 2) {
          this.playSound('entity.puffer_fish.blow_out', this.soundVolume(), this.voicePitch());
          this.setPuffState(1);
        } else if (this.deflateTimer > 100 && this.puffState === 1) {
          this.playSound('entity.puffer_fish.blow_out', this.soundVolume(), this.voicePitch());
          this.setPuffState(0);
        }
        this.deflateTimer++;
      }
    }
    super.tick();
  }

  /** vanilla Pufferfish.aiStep: puffed up, it stings the mobs it touches */
  override aiStep(): void {
    super.aiStep();
    if (!this.isAlive || this.puffState <= 0) return;
    for (const e of this.level.getEntities(this.bb.inflate(0.3), (e) => e instanceof Mob && scaresPufferfish(e), this)) this.touch(e as Mob);
  }

  /** vanilla touch: 1 + its puff in damage, poison for three seconds a step of puff */
  private touch(m: Mob): void {
    const i = this.puffState;
    if (m.hurt(1 + i, 'mob', this, this)) {
      m.addEffect(new MobEffectInstance(MOB_EFFECTS.poison, 60 * i, 0), this);
      this.playSound('entity.puffer_fish.sting', 1, 1);
    }
  }

  /** vanilla playerTouch: a puffed-up pufferfish stings the player who touches it (the sting heard where they are) */
  touchPlayer(p: Player): void {
    const i = this.puffState;
    if (i > 0 && p.hurt(1 + i, 'mob', this, this)) {
      p.level.sound.play('entity.puffer_fish.sting', p.x, p.y + p.eyeHeight, p.z, 1, 1);
      p.addEffect(new MobEffectInstance(MOB_EFFECTS.poison, 60 * i, 0), this);
    }
  }

  bucketItem(): string {
    return 'pufferfish_bucket';
  }
  protected flopSound(): string {
    return 'entity.puffer_fish.flop';
  }
  override hurtSound(): string {
    return 'entity.puffer_fish.hurt';
  }
  override deathSound(): string {
    return 'entity.puffer_fish.death';
  }
  override lootTable(): LootEntry[] {
    return fishLoot('pufferfish');
  }
  protected override saveData(): Record<string, number | string | boolean> | undefined {
    return { ...super.saveData(), PuffState: this.puffState };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.PuffState === 'number') this.setPuffState(Math.max(0, Math.min(2, d.PuffState)));
  }
}

/** vanilla Pufferfish.PufferfishPuffGoal: something that scares it within 2 blocks: it starts puffing up */
class PufferfishPuffGoal extends Goal {
  constructor(readonly fish: Pufferfish) {
    super();
  }
  canUse(): boolean {
    return this.fish.level.getEntities(this.fish.bb.inflate(2), (e) => e instanceof LivingEntity && scaresPufferfish(e), this.fish).length > 0;
  }
  override start(): void {
    this.fish.inflateCounter = 1;
    this.fish.deflateTimer = 0;
  }
  override stop(): void {
    this.fish.inflateCounter = 0;
  }
}

// ---------------------------------------------------------------------------

/** the fish each bucket holds (vanilla MobBucketItem's entity types) */
export const BUCKET_FISH: Record<string, (l: Level) => AbstractFish> = {
  cod_bucket: (l) => new Cod(l),
  salmon_bucket: (l) => new Salmon(l),
  pufferfish_bucket: (l) => new Pufferfish(l),
  tropical_fish_bucket: (l) => new TropicalFish(l),
};

/**
 * vanilla MobBucketItem.checkExtraContent → spawn: the bucket's fish, let go at the bottom of the block its water went
 * into (EntityType.spawn, offset up out of anything solid there), from the bucket, as the bucket kept it
 */
export function releaseBucketFish(level: Level, stack: ItemStack, x: number, y: number, z: number): AbstractFish | null {
  const make = BUCKET_FISH[stack.item.id];
  if (!make) return null;
  const fish = make(level);
  fish.moveTo(x + 0.5, y + blockTopIn(level, x, y, z), z + 0.5, level.random.nextFloat() * 360, 0);
  fish.bodyYaw = fish.headYaw = fish.yaw;
  fish.finalizeSpawn('bucket');
  fish.playAmbientSound();
  const d = stack.tag?.bucketEntity;
  if (d) fish.loadFromBucketTag(d);
  fish.fromBucket = true;
  level.addEntity(fish);
  return fish;
}

/** vanilla EntityType.getYOffset (not the more): how far up out of the block's own collision the mob must stand */
function blockTopIn(level: Level, x: number, y: number, z: number): number {
  let top = 0;
  for (const b of COLLISION[level.getState(x, y, z)] ?? []) if (b[4] <= 1) top = Math.max(top, b[4]);
  return top;
}
