// The piglin (vanilla Piglin + PiglinAi): the gold-mad natives of the Nether. They go for any player not wearing a
// piece of gold armour, and for whoever hits one of them, opens a chest or breaks gold near them (the rest of the
// group joins in). Show one a gold ingot and it stares; throw or hand it one and it admires the gold for six seconds,
// then tosses back a bartering reward. Other gold they keep, porkchops they eat; soul fire, zombified piglins and
// zoglins they back away from, wither skeletons their babies flee, and the babies now and then ride a baby hoglin.
// Lone adults hunt hoglins and celebrate a kill, once in a while with a dance. Half carry a golden sword, half a
// crossbow. Taken out of the Nether they turn into zombified piglins after fifteen seconds.
//
// Vanilla runs this on a Brain: sensors every 20 ticks filling memories (some expiring), a core set of behaviours,
// and one activity at a time (ADMIRE_ITEM > FIGHT > AVOID > CELEBRATE > RIDE > IDLE, the first whose memory is
// there). The port keeps that shape: memories are fields with expiry times, behaviours are the methods `brainTick`
// runs for the current activity.

import { Mob, LootEntry, SpawnReason } from './mob';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import { ItemEntity } from './itemEntity';
import { Monster, ZombifiedPiglin } from './monsters';
import { MobEffectInstance, MOB_EFFECTS } from './effects';
import { defaultRandomPosTowards, landRandomPos, landRandomPosAway } from './ai/goals';
import { PathType } from './ai/pathfinder';
import type { Path } from './ai/pathfinder';
import { ItemStack, ITEMS, saveStack, loadStack, SavedStack } from '../item/item';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { Rand } from '../core/rng';
import { isCrossbow, isCharged, chargeDuration, releaseUsing, performShooting, MOB_ARROW_POWER, mobInaccuracy, CROSSBOW_RANGE } from '../item/crossbow';

/** vanilla #piglin_loved (with #gold_ores; what isn't in the game yet simply never turns up) */
export const PIGLIN_LOVED = new Set([
  'gold_block', 'gilded_blackstone', 'light_weighted_pressure_plate', 'gold_ingot', 'bell', 'clock', 'golden_carrot', 'glistering_melon_slice',
  'golden_apple', 'enchanted_golden_apple', 'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots', 'golden_horse_armor',
  'golden_sword', 'golden_pickaxe', 'golden_shovel', 'golden_axe', 'golden_hoe', 'raw_gold', 'raw_gold_block', 'gold_ore', 'nether_gold_ore',
  'deepslate_gold_ore',
]);
/** vanilla #piglin_food */
const PIGLIN_FOOD = new Set(['porkchop', 'cooked_porkchop']);
/** vanilla #piglin_repellents (items) and the blocks behind them */
const REPELLENT_ITEMS = new Set(['soul_torch', 'soul_lantern', 'soul_campfire']);
const REPELLENT_BLOCKS = new Set(['soul_fire', 'soul_torch', 'soul_wall_torch', 'soul_lantern', 'soul_campfire']);
/** vanilla #piglin_safe_armor: gold armour keeps them calm */
const GOLD_ARMOR = new Set(['golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots']);
/** vanilla #guarded_by_piglins: open or break these near them and they're angry */
export const GUARDED_BY_PIGLINS = new Set([
  'gold_block', 'barrel', 'chest', 'ender_chest', 'gilded_blackstone', 'trapped_chest', 'raw_gold_block', 'gold_ore', 'nether_gold_ore',
  'deepslate_gold_ore',
]);
/** the barter currency */
const CURRENCY = 'gold_ingot';

const SENSE_RANGE = 16;
/** vanilla PiglinAi.ADMIRE_DURATION */
const ADMIRE_TICKS = 119;
const MAX_WALK_TO_ITEM = 9;
const MELEE_COOLDOWN = 20;
/** vanilla ANGER_DURATION */
const ANGER_TICKS = 600;
/** vanilla CELEBRATION_TIME */
const CELEBRATE_TICKS = 300;
/** vanilla TIME_BETWEEN_HUNTS: 30-120 s */
const huntPause = (r: Rand) => (30 + r.nextInt(91)) * 20;
/** vanilla AVOID_ZOMBIFIED_DURATION / BABY_AVOID_NEMESIS_DURATION: 5-7 s */
const avoidTime = (r: Rand) => (5 + r.nextInt(3)) * 20;
/** vanilla RETREAT_DURATION: 5-20 s */
const retreatTime = (r: Rand) => (5 + r.nextInt(16)) * 20;

/**
 * vanilla loot table gameplay/piglin_bartering (one roll). The potions and spectral arrows aren't in the game yet,
 * so their entries (fire resistance 8, its splash 8, water bottle 10, spectral arrows 40 of 459) are left out and the
 * rest keep their odds against each other.
 */
const BARTER: { item: string; weight: number; min: number; max: number; soulSpeed?: boolean }[] = [
  { item: 'enchanted_book', weight: 5, min: 1, max: 1, soulSpeed: true },
  { item: 'iron_boots', weight: 8, min: 1, max: 1, soulSpeed: true },
  { item: 'iron_nugget', weight: 10, min: 10, max: 36 },
  { item: 'ender_pearl', weight: 10, min: 2, max: 4 },
  { item: 'string', weight: 20, min: 3, max: 9 },
  { item: 'quartz', weight: 20, min: 5, max: 12 },
  { item: 'obsidian', weight: 40, min: 1, max: 1 },
  { item: 'crying_obsidian', weight: 40, min: 1, max: 3 },
  { item: 'fire_charge', weight: 40, min: 1, max: 1 },
  { item: 'leather', weight: 40, min: 2, max: 4 },
  { item: 'soul_sand', weight: 40, min: 2, max: 8 },
  { item: 'nether_brick', weight: 40, min: 2, max: 8 },
  { item: 'gravel', weight: 40, min: 8, max: 16 },
  { item: 'blackstone', weight: 40, min: 8, max: 16 },
];

export function isLovedItem(s: ItemStack | null): boolean {
  return !!s && PIGLIN_LOVED.has(s.item.id);
}

/** vanilla PiglinAi.isWearingSafeArmor */
export function isWearingGold(p: Player): boolean {
  return p.inventory.armor.some((s) => !!s && GOLD_ARMOR.has(s.item.id));
}

function isPlayerHoldingLovedItem(p: Player): boolean {
  return isLovedItem(p.inventory.selectedItem) || isLovedItem(p.inventory.offhand);
}

function isZombified(e: Entity): boolean {
  return e.type === 'zombified_piglin' || e.type === 'zoglin';
}

type Hoglinish = Mob & { cannotBeHunted?: boolean };

export type PiglinActivity = 'admire_item' | 'fight' | 'avoid' | 'celebrate' | 'ride' | 'idle';
export type PiglinArmPose = 'dancing' | 'admiring_item' | 'attacking_with_melee_weapon' | 'crossbow_charge' | 'crossbow_hold' | 'default';

/** vanilla WalkTarget: a spot or an entity to go to (within `closeEnough`, Manhattan blocks) */
interface WalkTarget {
  x: number;
  y: number;
  z: number;
  /** follows an entity (vanilla EntityTracker) */
  entity: Entity | null;
  speed: number;
  closeEnough: number;
}

/** vanilla LOOK_TARGET: an entity (its eyes) or the middle of a block */
type LookTarget = Entity | [number, number, number];

/** vanilla AbstractPiglin: rots into a zombified piglin after 15 s outside a piglin-safe dimension */
export abstract class AbstractPiglin extends Monster {
  timeInOverworld = 0;
  immuneToZombification = false;

  constructor(level: Level) {
    super(level);
    this.setPathfindingMalus(PathType.DANGER_FIRE, 16);
    this.setPathfindingMalus(PathType.DAMAGE_FIRE, -1);
  }

  isAdult(): boolean {
    return !this.isBaby();
  }

  isConverting(): boolean {
    return !this.level.world.dim.piglinSafe && !this.immuneToZombification;
  }

  protected override customServerAiStep(): void {
    super.customServerAiStep();
    this.timeInOverworld = this.isConverting() ? this.timeInOverworld + 1 : 0;
    if (this.timeInOverworld > 300) {
      this.playSound(this.convertedSound(), this.soundVolume(), this.voicePitch());
      this.finishConversion();
    }
  }

  protected abstract convertedSound(): string;

  /** vanilla AbstractPiglin.finishConversion (convertTo, keeping its equipment): nausea for ten seconds */
  protected finishConversion(): void {
    const z = new ZombifiedPiglin(this.level);
    z.moveTo(this.x, this.y, this.z, this.yaw, this.pitch);
    z.bodyYaw = z.bodyYawO = this.bodyYaw;
    z.headYaw = z.headYawO = this.headYaw;
    z.setBaby(this.isBaby());
    z.mainHand = this.mainHand;
    z.handDropChance = this.handDropChance;
    z.persistenceRequired = this.persistenceRequired;
    this.level.addEntity(z);
    z.addEffect(new MobEffectInstance(MOB_EFFECTS.nausea, 200, 0));
    this.remove();
  }

  override get eyeHeight(): number {
    return this.isBaby() ? 0.97 : 1.79;
  }

  /** vanilla EntityType passengerAttachments(2.0125) */
  override passengerAttachmentY(_p: Entity): number {
    return this.isBaby() ? 1.00625 : 2.0125;
  }

  /** vanilla EntityType ridingOffset(-0.7) (halved for babies) */
  override vehicleAttachmentY(): number {
    return this.isBaby() ? 0.35 : 0.7;
  }
}

export class Piglin extends AbstractPiglin {
  readonly type = 'piglin';
  private baby = false;
  /** vanilla offhand slot: the gold being admired */
  offHand: ItemStack | null = null;
  /** vanilla Piglin.inventory (8 slots) */
  readonly inventory: (ItemStack | null)[] = new Array(8).fill(null);
  cannotHunt = false;
  activity: PiglinActivity = 'idle';
  /** vanilla DATA_IS_DANCING */
  dancing = false;
  /** vanilla DATA_IS_CHARGING_CROSSBOW */
  chargingCrossbow = false;

  // memories (expiry in game ticks)
  private angryAt: LivingEntity | null = null;
  private angryUntil = 0;
  private universalAngerUntil = 0;
  private admiringUntil = 0;
  private admiringDisabledUntil = 0;
  private ateRecentlyUntil = 0;
  private huntedRecentlyUntil = 0;
  private celebrateAt: [number, number, number] | null = null;
  private celebrateUntil = 0;
  private dancingUntil = 0;
  private avoidTarget: LivingEntity | null = null;
  private avoidUntil = 0;
  private rideTarget: Mob | null = null;
  private rideUntil = 0;
  private timeTryingToReachItem: number | null = null;
  private disableWalkToAdmireUntil = 0;
  private attackCoolingUntil = 0;
  /** vanilla CANT_REACH_WALK_TARGET_SINCE (-1: absent) */
  private cantReachSince = -1;
  private walkTarget: WalkTarget | null = null;
  private lookTarget: LookTarget | null = null;
  /** vanilla HURT_BY: the damage source is 40 ticks fresh */
  private hurtAt = -1000;

  // running behaviours
  private lookSinkUntil = 0;
  private sinkPath: Path | null = null;
  private sinkTarget: [number, number, number] | null = null;
  private sinkCooldown = 0;
  private idleLookBusyUntil = 0;
  private idleMoveBusyUntil = 0;
  private celebrateBusyUntil = 0;
  /** vanilla SetEntityLookTargetSometimes.Ticker(RIDE_START_INTERVAL: 10-40 s) */
  private rideTicker = 0;
  private xbowState: 'uncharged' | 'charging' | 'charged' | 'ready' = 'uncharged';
  private xbowDelay = 0;
  private xbowRunning = false;

  // sensor memories
  private visibleLiving: LivingEntity[] = [];
  private nearestVisiblePlayer: Player | null = null;
  private nearestVisibleAttackablePlayer: Player | null = null;
  private nemesis: LivingEntity | null = null;
  private huntableHoglin: Hoglinish | null = null;
  private babyHoglin: Hoglinish | null = null;
  private zombified: LivingEntity | null = null;
  private playerNotWearingGold: Player | null = null;
  private playerHoldingWanted: Player | null = null;
  private nearbyAdultPiglins: Piglin[] = [];
  private visibleAdultPiglins: Piglin[] = [];
  private visibleAdultHoglins = 0;
  private repellent: [number, number, number] | null = null;
  private wantedItem: ItemEntity | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    this.maxHealth = this.health = 16;
    this.moveSpeedAttr = 0.35;
    this.attackDamage = 5;
    this.xpReward = 5;
  }

  protected registerGoals(): void {
    // (a brain mob: everything runs from customServerAiStep)
  }

  override isBaby(): boolean {
    return this.baby;
  }

  /** vanilla Piglin.setBaby: half size, 20% faster */
  setBaby(b: boolean): void {
    this.baby = b;
    this.setSize(b ? 0.3 : 0.6, b ? 0.975 : 1.95);
    this.moveSpeedAttr = b ? 0.35 * 1.2 : 0.35;
  }

  /** vanilla Piglin.finalizeSpawn: a fifth are babies; the grown ones take a crossbow or a golden sword */
  override finalizeSpawn(_reason: SpawnReason): void {
    const r = this.random;
    if (r.nextFloat() < 0.2) this.setBaby(true);
    else this.mainHand = ItemStack.of(r.nextFloat() < 0.5 ? 'crossbow' : 'golden_sword');
    // vanilla PiglinAi.initMemories: the first hunt waits a while
    this.huntedRecentlyUntil = this.level.gameTime + huntPause(r);
    // (vanilla populateDefaultEquipmentSlots gives a grown one each piece of gold armour one time in ten: mobs
    // don't wear armour yet)
  }

  /** vanilla checkPiglinSpawnRules: anywhere but on nether wart blocks */
  static checkPiglinSpawn(level: Level, x: number, y: number, z: number): boolean {
    return BLOCKS[STATE_BLOCK[level.world.getState(x, y - 1, z)]].name !== 'nether_wart_block';
  }

  override experienceReward(): number {
    return this.isBaby() ? 0 : super.experienceReward();
  }

  // --- memories -------------------------------------------------------------

  private get now(): number {
    return this.level.gameTime;
  }
  private isAdmiring(): boolean {
    return this.admiringUntil > this.now;
  }
  private isAdmiringDisabled(): boolean {
    return this.admiringDisabledUntil > this.now;
  }
  private hasEatenRecently(): boolean {
    return this.ateRecentlyUntil > this.now;
  }
  private huntedRecently(): boolean {
    return this.huntedRecentlyUntil > this.now;
  }
  private angryTarget(): LivingEntity | null {
    return this.angryUntil > this.now ? this.angryAt : null;
  }
  private avoiding(): LivingEntity | null {
    return this.avoidUntil > this.now ? this.avoidTarget : null;
  }
  private riding(): Mob | null {
    return this.rideUntil > this.now ? this.rideTarget : null;
  }
  private celebrating(): boolean {
    return !!this.celebrateAt && this.celebrateUntil > this.now;
  }
  private wasHurtRecently(): boolean {
    return this.tickCount - this.hurtAt <= 40;
  }
  isDancing(): boolean {
    return this.dancing;
  }
  canHunt(): boolean {
    return !this.cannotHunt;
  }

  // --- sensing (vanilla NearestLivingEntitySensor, PlayerSensor, NearestItemSensor, PiglinSpecificSensor) ---------

  /** vanilla Sensor.isEntityTargetable: within 16 (less for a sneaking player), and seen */
  private targetable(e: LivingEntity, ignoreSight = false): boolean {
    if (!e.isAlive || e.removed) return false;
    if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
    const r = ignoreSight ? SENSE_RANGE : Math.max(SENSE_RANGE * e.visibilityPercent(this), 2);
    if (e.distanceToSqr(this.x, this.y, this.z) > r * r) return false;
    return ignoreSight || this.sensing.hasLineOfSight(e);
  }

  /** vanilla Sensor.isEntityAttackable (TargetingConditions.forCombat) */
  private attackable(e: LivingEntity, ignoreSight = false): boolean {
    return this.targetable(e, ignoreSight) && this.canAttack(e);
  }

  private sense(): void {
    const lvl = this.level, r = SENSE_RANGE;
    const near = lvl.getEntities(this.bb.inflate(r, r, r), (e) => e instanceof LivingEntity && e.isAlive, this) as LivingEntity[];
    near.sort((a, b) => a.distanceToSqr(this.x, this.y, this.z) - b.distanceToSqr(this.x, this.y, this.z));
    this.visibleLiving = near.filter((e) => this.targetable(e));
    this.nearestVisiblePlayer = this.nearestVisibleAttackablePlayer = null;
    this.nemesis = this.huntableHoglin = this.babyHoglin = this.zombified = null;
    this.playerNotWearingGold = this.playerHoldingWanted = null;
    this.visibleAdultPiglins = [];
    this.visibleAdultHoglins = 0;
    for (const e of this.visibleLiving) {
      if (e.type === 'hoglin') {
        const h = e as Hoglinish;
        if (h.isBaby()) this.babyHoglin ??= h;
        else {
          this.visibleAdultHoglins++;
          if (!this.huntableHoglin && !h.cannotBeHunted) this.huntableHoglin = h;
        }
      } else if (e instanceof Piglin) {
        if (e.isAdult()) this.visibleAdultPiglins.push(e);
      } else if (e.type === 'player') {
        const p = e as Player;
        this.nearestVisiblePlayer ??= p;
        if (!this.nearestVisibleAttackablePlayer && this.canAttack(p)) this.nearestVisibleAttackablePlayer = p;
        if (!this.playerNotWearingGold && !isWearingGold(p) && this.canAttack(p)) this.playerNotWearingGold = p;
        if (!this.playerHoldingWanted && isPlayerHoldingLovedItem(p)) this.playerHoldingWanted = p;
      } else if (!this.nemesis && (e.type === 'wither_skeleton' || e.type === 'wither')) this.nemesis = e;
      else if (!this.zombified && isZombified(e)) this.zombified = e;
    }
    this.nearbyAdultPiglins = near.filter((e): e is Piglin => e instanceof Piglin && e.isAdult());
    this.repellent = this.findRepellent();
    // vanilla NearestItemSensor: the nearest item it wants and can see, within 32 (16 up and down)
    this.wantedItem = null;
    const items = lvl.getEntities(this.bb.inflate(32, 16, 32), (e) => e instanceof ItemEntity) as ItemEntity[];
    items.sort((a, b) => a.distanceToSqr(this.x, this.y, this.z) - b.distanceToSqr(this.x, this.y, this.z));
    for (const it of items) {
      if (!this.wantsToPickUp(it.stack) || it.distanceToSqr(this.x, this.y, this.z) >= 32 * 32 || !this.sensing.hasLineOfSight(it)) continue;
      this.wantedItem = it;
      break;
    }
  }

  /** vanilla PiglinSpecificSensor.findNearestRepellent: soul fire and its lights within 8 (4 up and down) */
  private findRepellent(): [number, number, number] | null {
    const w = this.level.world, bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    let best: [number, number, number] | null = null, bd = Infinity;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -8; dx <= 8; dx++)
        for (let dz = -8; dz <= 8; dz++) {
          const st = w.getState(bx + dx, by + dy, bz + dz);
          if (st === 0) continue;
          const b = BLOCKS[STATE_BLOCK[st]];
          if (!REPELLENT_BLOCKS.has(b.name)) continue;
          if (b.name === 'soul_campfire' && b.propIndex('lit') >= 0 && !b.get(st, 'lit')) continue;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bd) {
            bd = d;
            best = [bx + dx, by + dy, bz + dz];
          }
        }
    return best;
  }

  // --- the brain ------------------------------------------------------------

  protected override customServerAiStep(): void {
    this.brainTick();
    this.updateActivity();
    super.customServerAiStep();
  }

  private brainTick(): void {
    const now = this.now;
    // (vanilla Brain.forgetOutdatedMemories)
    if (this.angryUntil <= now) this.angryAt = null;
    if (this.avoidUntil <= now) this.avoidTarget = null;
    if (this.rideUntil <= now) this.rideTarget = null;
    if (this.celebrateUntil <= now) this.celebrateAt = null;
    if ((this.tickCount + this.id) % 20 === 0 || this.tickCount === 1) this.sense();
    // a target gone from the world without dying (vanilla: the memory of a removed entity lapses)
    const t0 = this.target;
    if (t0 && t0.removed && !t0.dead) this.setTarget(null);

    // ---- CORE ----
    this.lookAtTargetSink();
    this.moveToTargetSink();
    // babyAvoidNemesis, avoidZombified (CopyMemoryWithExpiry: 5-7 s)
    if (!this.avoiding()) {
      if (this.isBaby() && this.nemesis) this.setAvoidTarget(this.nemesis, avoidTime(this.random));
      else if (this.isNearZombified()) this.setAvoidTarget(this.zombified!, avoidTime(this.random));
    }
    // StopHoldingItemIfNoLongerAdmiring
    if (this.offHand && !this.isAdmiring()) this.stopHoldingOffHandItem(true);
    // StartAdmiringItemIfSeen(119)
    const wi = this.wantedItem;
    if (wi && !this.isAdmiring() && !this.isAdmiringDisabled() && this.disableWalkToAdmireUntil <= now && isLovedItem(wi.stack)) this.admiringUntil = now + ADMIRE_TICKS;
    // StartCelebratingIfTargetDead(300, wantsToDance): a hoglin kill a one-in-ten dance (the same for every piglin
    // that tick, the odds seeded by the game time)
    const t = this.target;
    if (t && (t.dead || t.health <= 0) && !this.celebrateAt) {
      if (t.type === 'hoglin' && new Rand(now).nextFloat() < 0.1) this.dancingUntil = now + CELEBRATE_TICKS;
      this.celebrateAt = [Math.floor(t.x), Math.floor(t.y), Math.floor(t.z)];
      this.celebrateUntil = now + CELEBRATE_TICKS;
      if (t.type !== 'player' || this.level.gameRules.forgiveDeadPlayers) {
        this.setTarget(null);
        this.angryAt = null;
      }
    }
    // StopBeingAngryIfTargetDead
    const angry = this.angryTarget();
    if (angry && (angry.dead || angry.health <= 0) && (angry.type !== 'player' || this.level.gameRules.forgiveDeadPlayers)) this.angryAt = null;

    switch (this.activity) {
      case 'admire_item':
        this.goToWantedItem();
        this.stopAdmiringIfItemTooFarAway();
        this.stopAdmiringIfTiredOfTryingToReachItem();
        break;
      case 'fight':
        this.fight();
        break;
      case 'avoid': {
        const a = this.avoiding();
        if (a) this.walkAwayFrom(a.x, a.y, a.z, 1, 12, true);
        this.idleLook();
        this.idleMove();
        if (this.wantsToStopFleeing()) this.avoidTarget = null;
        break;
      }
      case 'celebrate':
        this.avoidRepellent();
        this.lookAtPlayerHoldingLoved(14);
        this.startAttacking();
        this.goToCelebrateLocation();
        // RunOne(look at a piglin within 8, stroll within 2 by 1, 10-20 ticks of nothing)
        if (this.celebrateBusyUntil <= now)
          this.runOne([
            [1, () => this.lookAtNearest((e) => e instanceof Piglin, 8)],
            [1, () => this.stroll(0.6, 2, 1)],
            [1, () => ((this.celebrateBusyUntil = now + 10 + this.random.nextInt(11)), true)],
          ]);
        break;
      case 'ride':
        this.mount();
        this.lookAtPlayerHoldingLoved(8);
        // (TriggerGate.triggerOneShuffled: one look behaviour or none, while it's up there)
        if (this.vehicle)
          this.runOne([
            [1, () => this.lookAtNearest((e) => e.type === 'player', 8)],
            [1, () => this.lookAtNearest((e) => e instanceof Piglin, 8)],
            [1, () => this.lookAtNearest(() => true, 8)],
            [1, () => true],
          ]);
        this.dismountOrSkipMounting();
        break;
      case 'idle': {
        this.lookAtPlayerHoldingLoved(14);
        this.startAttacking();
        if (this.canHunt()) this.startHuntingHoglin();
        this.avoidRepellent();
        this.babySometimesRideBabyHoglin();
        this.idleLook();
        this.idleMove();
        // SetLookAndInteract(player, 4)
        const p = this.nearestVisiblePlayer;
        if (p && !this.lookTarget && p.distanceToSqr(this.x, this.y, this.z) <= 16) this.setLook(p);
        break;
      }
    }
  }

  /**
   * vanilla PiglinAi.updateActivity: the first activity whose memory is there. Leaving one forgets what it was about
   * (the attack target, what it fled, where it celebrated, what it rode); a change of mood is voiced.
   */
  private updateActivity(): void {
    const before = this.activity;
    const next: PiglinActivity = this.isAdmiring()
      ? 'admire_item'
      : this.target
        ? 'fight'
        : this.avoiding()
          ? 'avoid'
          : this.celebrating()
            ? 'celebrate'
            : this.riding()
              ? 'ride'
              : 'idle';
    if (before !== next) {
      if (before === 'admire_item') this.admiringUntil = 0;
      else if (before === 'fight') this.setTarget(null);
      else if (before === 'avoid') this.avoidTarget = null;
      else if (before === 'celebrate') this.celebrateAt = null;
      else if (before === 'ride') this.rideTarget = null;
      this.activity = next;
      const s = this.ambientSound();
      if (s) this.playSound(s, this.soundVolume(), this.voicePitch());
    }
    this.aggressive = !!this.target;
    if (!this.riding() && this.isBabyRidingBaby()) this.stopRiding();
    if (!this.celebrating()) this.dancingUntil = 0;
    this.dancing = this.dancingUntil > this.now;
  }

  override setTarget(e: LivingEntity | null): void {
    if (!e && this.target) this.stopCrossbowAttack();
    super.setTarget(e);
  }

  // --- behaviours -----------------------------------------------------------

  /** vanilla RunOne (GateBehavior, SHUFFLED + RUN_ONE): a weighted shuffle, then the first that will start */
  private runOne(options: [number, () => boolean][]): void {
    const r = this.random;
    const order = options.map(([w, f]) => ({ k: -Math.pow(r.nextFloat(), 1 / w), f }));
    order.sort((a, b) => a.k - b.k);
    for (const o of order) if (o.f()) return;
  }

  private setLook(e: LookTarget): void {
    this.lookTarget = e;
  }

  /** vanilla SetEntityLookTarget: with nothing to look at, the nearest seen within `range` that fits */
  private lookAtNearest(pred: (e: LivingEntity) => boolean, range: number): boolean {
    if (this.lookTarget) return false;
    const e = this.visibleLiving.find((e) => e.distanceToSqr(this.x, this.y, this.z) <= range * range && pred(e));
    if (!e) return false;
    this.setLook(e);
    return true;
  }

  /** vanilla LookAtTargetSink(45, 90): eyes on the look target for 2¼-4½ s (or until it's out of sight), then forget it */
  private lookAtTargetSink(): void {
    const lt = this.lookTarget;
    if (!lt) {
      this.lookSinkUntil = 0;
      return;
    }
    if (!Array.isArray(lt) && (lt.removed || (lt instanceof LivingEntity && !this.visibleLiving.includes(lt) && lt !== this.target))) {
      this.lookTarget = null;
      this.lookSinkUntil = 0;
      return;
    }
    if (this.lookSinkUntil === 0) this.lookSinkUntil = this.now + 45 + this.random.nextInt(46);
    else if (this.now >= this.lookSinkUntil) {
      this.lookTarget = null;
      this.lookSinkUntil = 0;
      return;
    }
    if (Array.isArray(lt)) this.lookControl.setLookAt(lt[0] + 0.5, lt[1] + 0.5, lt[2] + 0.5);
    else this.lookControl.setLookAt(lt.x, lt.y + (lt instanceof LivingEntity ? lt.eyeHeight : lt.height * 0.85), lt.z);
  }

  private setWalkTarget(x: number, y: number, z: number, speed: number, closeEnough: number, entity: Entity | null = null): void {
    this.walkTarget = { x, y, z, entity, speed, closeEnough };
  }

  private walkTargetBlock(w: WalkTarget): [number, number, number] {
    if (w.entity) [w.x, w.y, w.z] = [w.entity.x, w.entity.y, w.entity.z];
    return [Math.floor(w.x), Math.floor(w.y), Math.floor(w.z)];
  }

  private reachedWalkTarget(w: WalkTarget): boolean {
    const [bx, by, bz] = this.walkTargetBlock(w);
    return Math.abs(bx - Math.floor(this.x)) + Math.abs(by - Math.floor(this.y)) + Math.abs(bz - Math.floor(this.z)) <= w.closeEnough;
  }

  /** vanilla MoveToTargetSink.tryComputePath (when there's no way at all, somewhere up to 10 off towards it) */
  private tryComputePath(w: WalkTarget): boolean {
    const [bx, by, bz] = this.walkTargetBlock(w);
    const nav = this.navigation;
    this.sinkPath = nav.createPath(bx + 0.5, by, bz + 0.5, 0);
    if (this.reachedWalkTarget(w)) this.cantReachSince = -1;
    else {
      if (this.sinkPath?.canReach()) this.cantReachSince = -1;
      else if (this.cantReachSince < 0) this.cantReachSince = this.now;
      if (this.sinkPath) return true;
      const p = defaultRandomPosTowards(this, 10, 7, bx + 0.5, bz + 0.5, Math.PI / 2);
      if (p) {
        this.sinkPath = nav.createPath(p[0] + 0.5, p[1], p[2] + 0.5, 0);
        return !!this.sinkPath;
      }
    }
    return false;
  }

  /**
   * vanilla MoveToTargetSink: path to the walk target; while on the way, a new path when it has moved more than two
   * blocks; done (and the target forgotten) on arriving, or when the path runs out
   */
  private moveToTargetSink(): void {
    const w = this.walkTarget, nav = this.navigation;
    if (this.sinkTarget) {
      if (!w || (w.entity && w.entity.removed) || nav.isDone() || this.reachedWalkTarget(w)) {
        if (w && !this.reachedWalkTarget(w) && nav.isStuck) this.sinkCooldown = this.random.nextInt(40);
        nav.stop();
        this.walkTarget = null;
        this.sinkPath = null;
        this.sinkTarget = null;
        return;
      }
      const [bx, by, bz] = this.walkTargetBlock(w), l = this.sinkTarget;
      if ((bx - l[0]) ** 2 + (by - l[1]) ** 2 + (bz - l[2]) ** 2 > 4 && this.tryComputePath(w)) {
        this.sinkTarget = [bx, by, bz];
        nav.moveToPath(this.sinkPath, w.speed);
      }
      return;
    }
    if (!w) return;
    if (this.sinkCooldown > 0) {
      this.sinkCooldown--;
      return;
    }
    const reached = this.reachedWalkTarget(w);
    if (!reached && this.tryComputePath(w)) {
      this.sinkTarget = this.walkTargetBlock(w);
      nav.moveToPath(this.sinkPath, w.speed);
    } else {
      this.walkTarget = null;
      if (reached) this.cantReachSince = -1;
    }
  }

  private stopWalking(): void {
    this.walkTarget = null;
    this.navigation.stop();
  }

  /**
   * vanilla SetWalkTargetAwayFrom: within `dist` of it, head off somewhere up to 16 away in the other direction
   * (keeping a walk target that already leads away)
   */
  private walkAwayFrom(x: number, y: number, z: number, speed: number, dist: number, replace: boolean): boolean {
    const w = this.walkTarget;
    if (w && !replace) return false;
    if ((x - this.x) ** 2 + (y - this.y) ** 2 + (z - this.z) ** 2 >= dist * dist) return false;
    if (w && w.speed === speed) {
      this.walkTargetBlock(w);
      if ((w.x - this.x) * (x - this.x) + (w.y - this.y) * (y - this.y) + (w.z - this.z) * (z - this.z) < 0) return false;
    }
    for (let i = 0; i < 10; i++) {
      const p = landRandomPosAway(this, 16, 7, x, z);
      if (p) {
        this.setWalkTarget(p[0] + 0.5, p[1], p[2] + 0.5, speed, 0);
        break;
      }
    }
    return true;
  }

  /** vanilla avoidRepellent: SetWalkTargetAwayFrom.pos(NEAREST_REPELLENT, 1.0, 8, false) */
  private avoidRepellent(): void {
    const rp = this.repellent;
    if (rp) this.walkAwayFrom(rp[0] + 0.5, rp[1] + 0.5, rp[2] + 0.5, 1, 8, false);
  }

  /** vanilla RandomStroll.stroll: with nowhere to go, a random spot on land */
  private stroll(speed: number, h: number, v: number): boolean {
    if (this.walkTarget) return false;
    const p = landRandomPos(this, h, v);
    if (p) this.setWalkTarget(p[0] + 0.5, p[1], p[2] + 0.5, speed, 0);
    return true;
  }

  /** vanilla SetEntityLookTarget(isPlayerHoldingLovedItem, range): stare at gold in a player's hand */
  private lookAtPlayerHoldingLoved(range: number): void {
    this.lookAtNearest((e) => e.type === 'player' && isPlayerHoldingLovedItem(e as Player), range);
  }

  /** vanilla StartAttacking(isAdult, findNearestValidAttackTarget) */
  private startAttacking(): void {
    if (!this.isAdult() || this.target) return;
    const t = this.findNearestValidAttackTarget();
    if (t) {
      this.setTarget(t);
      this.cantReachSince = -1;
    }
  }

  /** vanilla PiglinAi.findNearestValidAttackTarget */
  private findNearestValidAttackTarget(): LivingEntity | null {
    if (this.isNearZombified()) return null;
    const angry = this.angryTarget();
    if (angry && this.attackable(angry, true)) return angry;
    if (this.universalAngerUntil > this.now && this.nearestVisibleAttackablePlayer) return this.nearestVisibleAttackablePlayer;
    if (this.nemesis) return this.nemesis;
    const p = this.playerNotWearingGold;
    return p && this.attackable(p) ? p : null;
  }

  /**
   * vanilla StartHuntingHoglin: a grown piglin that hasn't hunted lately goes for a huntable hoglin, and the group
   * with it (as in vanilla, only while it sees no other grown piglin: the memory it checks for them is absent then)
   */
  private startHuntingHoglin(): void {
    const h = this.huntableHoglin;
    if (!h || this.angryTarget() || this.huntedRecently() || this.isBaby() || this.visibleAdultPiglins.length > 0) return;
    this.setAngerTarget(h);
    this.huntedRecentlyUntil = this.now + huntPause(this.random);
    this.broadcastAngerTarget(h);
  }

  /** vanilla createIdleLookBehaviors: RunOne(look at a player / a piglin / anything within 8, or 30-60 ticks of nothing) */
  private idleLook(): void {
    if (this.idleLookBusyUntil > this.now) return;
    this.runOne([
      [1, () => this.lookAtNearest((e) => e.type === 'player', 8)],
      [1, () => this.lookAtNearest((e) => e instanceof Piglin, 8)],
      [1, () => this.lookAtNearest(() => true, 8)],
      [1, () => ((this.idleLookBusyUntil = this.now + 30 + this.random.nextInt(31)), true)],
    ]);
  }

  /**
   * vanilla createIdleMovementBehaviors: RunOne(stroll at 0.6 (2), walk up to a piglin within 8 (2), walk towards
   * what it's looking at unless someone shows gold (2), or 30-60 ticks of nothing (1))
   */
  private idleMove(): void {
    if (this.idleMoveBusyUntil > this.now) return;
    this.runOne([
      [2, () => this.stroll(0.6, 10, 7)],
      [2, () => this.interactWithPiglin()],
      [2, () => this.walkToLookTarget()],
      [1, () => ((this.idleMoveBusyUntil = this.now + 30 + this.random.nextInt(31)), true)],
    ]);
  }

  /** vanilla InteractWith.of(PIGLIN, 8, INTERACTION_TARGET, 0.6, 2): up to the nearest piglin within 8 */
  private interactWithPiglin(): boolean {
    if (this.walkTarget) return false;
    if (!this.visibleLiving.some((e) => e instanceof Piglin)) return false;
    const pg = this.visibleLiving.find((e) => e instanceof Piglin && e.distanceToSqr(this.x, this.y, this.z) <= 64);
    if (pg) {
      this.setLook(pg);
      this.setWalkTarget(pg.x, pg.y, pg.z, 0.6, 2, pg);
    }
    return true;
  }

  /** vanilla SetWalkTargetFromLookTarget(0.6, 3), not while a player shows gold */
  private walkToLookTarget(): boolean {
    const lt = this.lookTarget;
    if (this.walkTarget || !lt || this.playerHoldingWanted) return false;
    if (Array.isArray(lt)) this.setWalkTarget(lt[0] + 0.5, lt[1], lt[2] + 0.5, 0.6, 3);
    else this.setWalkTarget(lt.x, lt.y, lt.z, 0.6, 3, lt);
    return true;
  }

  // ---- ADMIRE_ITEM ----

  /** vanilla GoToWantedItem(isNotHoldingLovedItemInOffHand, 1.0, true, 9) */
  private goToWantedItem(): void {
    const it = this.wantedItem;
    if (!it || isLovedItem(this.offHand) || it.distanceToSqr(this.x, this.y, this.z) >= MAX_WALK_TO_ITEM * MAX_WALK_TO_ITEM) return;
    this.setLook(it);
    this.setWalkTarget(it.x, it.y, it.z, 1, 0, it);
  }

  /** vanilla StopAdmiringIfItemTooFarAway(9) */
  private stopAdmiringIfItemTooFarAway(): void {
    if (this.offHand) return;
    const it = this.wantedItem;
    if (!it || it.distanceToSqr(this.x, this.y, this.z) >= MAX_WALK_TO_ITEM * MAX_WALK_TO_ITEM) this.admiringUntil = 0;
  }

  /** vanilla StopAdmiringIfTiredOfTryingToReachItem(200, 200) */
  private stopAdmiringIfTiredOfTryingToReachItem(): void {
    if (this.offHand || !this.wantedItem || !this.isAdmiring()) return;
    if (this.timeTryingToReachItem === null) this.timeTryingToReachItem = 0;
    else if (this.timeTryingToReachItem > 200) {
      this.admiringUntil = 0;
      this.timeTryingToReachItem = null;
      this.disableWalkToAdmireUntil = this.now + 200;
    } else this.timeTryingToReachItem++;
  }

  // ---- FIGHT ----

  private fight(): void {
    const now = this.now, tg = this.target;
    if (!tg) return;
    // StopAttackingIfTargetInvalid: dead, not to be fought, tired of trying to reach it, or not the one it should fight
    if (!tg.isAlive || !this.canAttack(tg) || (this.cantReachSince >= 0 && now - this.cantReachSince > 200) || this.findNearestValidAttackTarget() !== tg) {
      this.setTarget(null);
      return;
    }
    const seen = this.visibleLiving.includes(tg);
    const crossbow = this.mainHand?.item.id === 'crossbow';
    // BackUpIfTooClose(5, 0.75), with a crossbow
    if (crossbow && !this.walkTarget && seen && tg.distanceToSqr(this.x, this.y, this.z) < 25) {
      this.setLook(tg);
      this.moveControl.strafe(-0.75, 0);
      this.yaw = this.headYaw;
    }
    // SetWalkTargetFromAttackTargetIfTargetOutOfReach(1.0)
    if (seen && this.withinAttackRange(tg, 1)) this.walkTarget = null;
    else {
      this.setLook(tg);
      const w = this.walkTarget;
      if (w && w.entity === tg) w.speed = 1;
      else this.setWalkTarget(tg.x, tg.y, tg.z, 1, 0, tg);
    }
    // MeleeAttack(20): not with a crossbow in hand
    if (!crossbow && this.attackCoolingUntil <= now && seen && this.isWithinMeleeAttackRange(tg)) {
      this.setLook(tg);
      this.swing();
      this.doHurtTarget(tg);
      this.attackCoolingUntil = now + MELEE_COOLDOWN;
    }
    this.crossbowAttack(tg, seen);
    // RememberIfHoglinWasKilled
    if (tg.type === 'hoglin' && (tg.dead || tg.health <= 0)) this.huntedRecentlyUntil = now + huntPause(this.random);
    // EraseMemoryIf(isNearZombified, ATTACK_TARGET)
    if (this.isNearZombified()) this.setTarget(null);
  }

  /** vanilla BehaviorUtils.isWithinAttackRange: a crossbow's 8 blocks (less the cooldown), else arm's length */
  private withinAttackRange(t: LivingEntity, cooldown: number): boolean {
    if (isCrossbow(this.mainHand)) {
      const r = CROSSBOW_RANGE - cooldown;
      return t.distanceToSqr(this.x, this.y, this.z) < r * r;
    }
    return this.isWithinMeleeAttackRange(t);
  }

  /**
   * vanilla CrossbowAttack: while it holds a crossbow and sees its target within 8 blocks, eyes on it: draw for the
   * charge time, load, wait 1-2 s, shoot (1.6 blocks a tick, 14 - 4 × difficulty degrees off), and again
   */
  private crossbowAttack(t: LivingEntity, seen: boolean): void {
    const s = this.mainHand;
    if (!isCrossbow(s) || !seen || !this.withinAttackRange(t, 0)) {
      if (this.xbowRunning) this.stopCrossbowAttack();
      return;
    }
    this.xbowRunning = true;
    this.setLook(t);
    switch (this.xbowState) {
      case 'uncharged':
        this.startUsingItem();
        this.xbowState = 'charging';
        this.chargingCrossbow = true;
        break;
      case 'charging':
        if (!this.usingItem) this.xbowState = 'uncharged';
        if (this.useItemTicks >= chargeDuration(s)) {
          // (vanilla LivingEntity.releaseUsingItem → CrossbowItem.releaseUsing: loaded, a Monster never short of arrows)
          releaseUsing(this.level, this, s, this.useItemTicks);
          this.stopUsingItem();
          this.xbowState = 'charged';
          this.xbowDelay = 20 + this.random.nextInt(20);
          this.chargingCrossbow = false;
        }
        break;
      case 'charged':
        if (--this.xbowDelay === 0) this.xbowState = 'ready';
        break;
      case 'ready':
        // vanilla Piglin.performRangedAttack → CrossbowAttackMob.performCrossbowAttack
        performShooting(this.level, this, s, MOB_ARROW_POWER, mobInaccuracy(this.level), t);
        this.noActionTime = 0;
        this.xbowState = 'uncharged';
        break;
    }
  }

  /**
   * vanilla CrossbowAttack.stop: it stops drawing (what it had loaded stays loaded: vanilla clears the charge of the
   * item in use, which by then is nothing)
   */
  private stopCrossbowAttack(): void {
    this.xbowRunning = false;
    if (this.usingItem) this.stopUsingItem();
    this.chargingCrossbow = false;
  }

  // ---- AVOID ----

  private isNearZombified(): boolean {
    const z = this.zombified;
    return !!z && !z.removed && z.distanceToSqr(this.x, this.y, this.z) < 36;
  }

  private setAvoidTarget(e: LivingEntity, ticks: number): void {
    this.avoidTarget = e;
    this.avoidUntil = this.now + ticks;
  }

  /** vanilla PiglinAi.wantsToStopFleeing */
  private wantsToStopFleeing(): boolean {
    const a = this.avoiding();
    if (!a) return true;
    if (a.type === 'hoglin') return !this.hoglinsOutnumberPiglins();
    if (isZombified(a)) return this.zombified !== a;
    return false;
  }

  private hoglinsOutnumberPiglins(): boolean {
    return this.visibleAdultHoglins > this.visibleAdultPiglins.length + 1;
  }

  /** vanilla PiglinAi.setAvoidTargetAndDontHuntForAWhile: drop the fight and run for 5-20 s */
  private retreatFrom(t: LivingEntity): void {
    this.angryAt = null;
    this.setTarget(null);
    this.walkTarget = null;
    this.setAvoidTarget(t, retreatTime(this.random));
    this.huntedRecentlyUntil = this.now + huntPause(this.random);
  }

  // ---- CELEBRATE ----

  /** vanilla GoToTargetLocation(CELEBRATE_LOCATION): within 2 at full speed, dancing within 4 at 0.6 */
  private goToCelebrateLocation(): void {
    const c = this.celebrateAt;
    if (!c || this.target || this.walkTarget) return;
    const reach = this.dancing ? 4 : 2;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    if ((c[0] - bx) ** 2 + (c[1] - by) ** 2 + (c[2] - bz) ** 2 < reach * reach) return;
    const r = this.level.random;
    const p: [number, number, number] = [c[0] + r.nextInt(3) - 1, c[1], c[2] + r.nextInt(3) - 1];
    this.setWalkTarget(p[0] + 0.5, p[1], p[2] + 0.5, this.dancing ? 0.6 : 1, reach);
    this.setLook(p);
  }

  // ---- RIDE ----

  /** vanilla babySometimesRideBabyHoglin: every 10-40 s a baby that sees a baby hoglin rides it for 10-30 s */
  private babySometimesRideBabyHoglin(): void {
    const h = this.babyHoglin;
    if (!h || this.riding() || !this.isBaby()) return;
    let go = false;
    if (this.rideTicker === 0) this.rideTicker = (10 + this.random.nextInt(31)) * 20 - 1;
    else go = --this.rideTicker === 0;
    if (!go) return;
    this.rideTarget = h;
    this.rideUntil = this.now + (10 + this.random.nextInt(21)) * 20;
  }

  /** vanilla Mount(0.8): up onto it from within a block, else walk to it */
  private mount(): void {
    const v = this.riding();
    if (!v || this.walkTarget || this.vehicle) return;
    if (v.distanceToSqr(this.x, this.y, this.z) < 1) this.startRiding(v);
    else {
      this.setLook(v);
      this.setWalkTarget(v.x, v.y, v.z, 0.8, 1, v);
    }
  }

  /** vanilla DismountOrSkipMounting(8, wantsToStopRiding) */
  private dismountOrSkipMounting(): void {
    const v = (this.vehicle as Mob | null) ?? this.riding();
    if (!v) return;
    const valid = v.isAlive && !v.removed && v.distanceToSqr(this.x, this.y, this.z) < 64;
    const stop = !v.isBaby() || !v.isAlive || this.wasHurtRecently() || (v instanceof Piglin && v.wasHurtRecently()) || (v instanceof Piglin && !v.vehicle);
    if (valid && !stop) return;
    this.stopRiding();
    this.rideTarget = null;
  }

  /** vanilla PiglinAi.isBabyRidingBaby */
  private isBabyRidingBaby(): boolean {
    const v = this.vehicle;
    return this.isBaby() && (v instanceof Piglin || v?.type === 'hoglin') && (v as Mob).isBaby();
  }

  // --- anger ----------------------------------------------------------------

  /** vanilla PiglinAi.setAngerTarget: angry for 30 s (at a player under universalAnger: at every player) */
  setAngerTarget(t: LivingEntity): void {
    if (!this.attackable(t, true)) return;
    this.cantReachSince = -1;
    this.angryAt = t;
    this.angryUntil = this.now + ANGER_TICKS;
    if (t.type === 'hoglin' && this.canHunt()) this.huntedRecentlyUntil = this.now + huntPause(this.random);
    if (t.type === 'player' && this.level.gameRules.universalAnger) this.universalAngerUntil = this.now + ANGER_TICKS;
  }

  /** vanilla setAngerTargetToNearestTargetablePlayerIfFound */
  private angerAtNearestPlayerOr(t: LivingEntity): void {
    this.setAngerTarget(this.nearestVisibleAttackablePlayer ?? t);
  }

  /** vanilla PiglinAi.broadcastAngerTarget: the grown piglins about take it up if it's no further than theirs */
  private broadcastAngerTarget(t: LivingEntity): void {
    for (const p of this.nearbyAdultPiglins) {
      if (p.removed) continue;
      if (t.type === 'hoglin' && (!p.canHunt() || (t as Hoglinish).cannotBeHunted)) continue;
      const cur = p.angryTarget();
      const nearest = cur && p.distanceToSqr(cur.x, cur.y, cur.z) < p.distanceToSqr(t.x, t.y, t.z) ? cur : t;
      if (!cur || cur !== nearest) p.setAngerTarget(nearest);
    }
  }

  /**
   * vanilla PiglinAi.angerNearbyPiglins: a player tampering with what piglins guard angers the idle ones within 16
   * (for an opened chest only those who saw it: the ones whose senses last saw the player)
   */
  static angerNearbyPiglins(p: Player, onlyIfSeen: boolean): void {
    for (const e of p.level.getEntities(p.bb.inflate(16), (e) => e instanceof Piglin)) {
      const pg = e as Piglin;
      if (pg.activity !== 'idle' || (onlyIfSeen && !pg.visibleLiving.includes(p))) continue;
      if (pg.level.gameRules.universalAnger) pg.angerAtNearestPlayerOr(p);
      else pg.setAngerTarget(p);
    }
  }

  /** vanilla Piglin.hurt → PiglinAi.wasHurtBy */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok) {
      this.hurtAt = this.tickCount;
      if (attacker instanceof LivingEntity && attacker !== this) this.wasHurtBy(attacker);
    }
    return ok;
  }

  private wasHurtBy(t: LivingEntity): void {
    if (t instanceof Piglin) return;
    if (this.offHand) this.stopHoldingOffHandItem(false);
    this.celebrateAt = null;
    this.dancingUntil = 0;
    this.admiringUntil = 0;
    if (t.type === 'player') this.admiringDisabledUntil = this.now + 400;
    const a = this.avoiding();
    if (a && a.type !== t.type) this.avoidTarget = null;
    if (this.isBaby()) {
      this.setAvoidTarget(t, 100);
      if (this.attackable(t, true)) this.broadcastAngerTarget(t);
    } else if (t.type === 'hoglin' && this.hoglinsOutnumberPiglins()) {
      this.retreatFrom(t);
      // broadcastRetreat: every grown piglin it sees runs from the nearest of that, what it fled and what it fought
      for (const p of this.visibleAdultPiglins) {
        let n: LivingEntity = t;
        for (const o of [p.avoiding(), p.target]) if (o && p.distanceToSqr(o.x, o.y, o.z) < p.distanceToSqr(n.x, n.y, n.z)) n = o;
        p.retreatFrom(n);
      }
    } else if (this.activity !== 'avoid' && this.attackable(t, true)) {
      // maybeRetaliate (not for one much further off than what it's fighting)
      const cur = this.target;
      if (cur && t.distanceToSqr(this.x, this.y, this.z) > cur.distanceToSqr(this.x, this.y, this.z) + 16) return;
      if (t.type === 'player' && this.level.gameRules.universalAnger) {
        this.angerAtNearestPlayerOr(t);
        // broadcastUniversalAnger
        for (const p of this.nearbyAdultPiglins) if (p.nearestVisibleAttackablePlayer) p.setAngerTarget(p.nearestVisibleAttackablePlayer);
      } else {
        this.setAngerTarget(t);
        this.broadcastAngerTarget(t);
      }
    }
  }

  // --- gold -----------------------------------------------------------------

  /** vanilla Piglin.wantsToPickUp → PiglinAi.wantsToPickup (only while mobs may grief) */
  wantsToPickUp(s: ItemStack): boolean {
    if (!this.level.gameRules.mobGriefing) return false;
    const id = s.item.id;
    if (this.isBaby() && id === 'leather') return false;
    if (REPELLENT_ITEMS.has(id)) return false;
    if (this.isAdmiringDisabled() && this.target) return false;
    if (id === CURRENCY) return !isLovedItem(this.offHand);
    const room = this.canAddToInventory(s);
    if (id === 'gold_nugget') return room;
    if (PIGLIN_FOOD.has(id)) return !this.hasEatenRecently() && room;
    if (!isLovedItem(s)) return this.canReplaceCurrentItem(s);
    return !isLovedItem(this.offHand) && room;
  }

  /**
   * vanilla Piglin.canReplaceCurrentItem → Mob.canReplaceCurrentItem, for the hand (mobs don't wear armour yet, so
   * armour goes to an empty hand): gold and crossbows first, a grown one keeps its crossbow, then an empty hand takes
   * anything, a better sword a sword, a better tool a tool or a block
   */
  private canReplaceCurrentItem(s: ItemStack): boolean {
    const cur = this.mainHand;
    if (s.item.armor) return !cur;
    const a = isLovedItem(s) || s.item.id === 'crossbow', b = isLovedItem(cur) || cur?.item.id === 'crossbow';
    if (a && !b) return true;
    if (!a && b) return false;
    if (this.isAdult() && s.item.id !== 'crossbow' && cur?.item.id === 'crossbow') return false;
    if (!cur) return true;
    const sword = (x: ItemStack) => x.item.tool?.type === 'sword';
    const better = () => (s.item.attackDamage !== cur.item.attackDamage ? s.item.attackDamage > cur.item.attackDamage : this.canReplaceEqualItem(s, cur));
    if (sword(s)) return !sword(cur) || better();
    if ((s.item.id === 'bow' && cur.item.id === 'bow') || (s.item.id === 'crossbow' && cur.item.id === 'crossbow')) return this.canReplaceEqualItem(s, cur);
    if (s.item.tool) {
      if (cur.item.block) return true;
      if (cur.item.tool && !sword(cur)) return better();
    }
    return false;
  }

  /** vanilla Mob.canReplaceEqualItem: less worn, or enchanted where the other isn't */
  private canReplaceEqualItem(s: ItemStack, cur: ItemStack): boolean {
    if (s.damage < cur.damage) return true;
    const extra = (x: ItemStack) => !!x.tag && Object.keys(x.tag).length > 0;
    return extra(s) && !extra(cur);
  }

  private canAddToInventory(s: ItemStack): boolean {
    return this.inventory.some((x) => !x || (x.sameItem(s) && x.count < x.item.maxStack));
  }

  /** vanilla SimpleContainer.addItem: onto stacks of the same, then into empty slots; what didn't fit comes back */
  private addToInventory(s: ItemStack): ItemStack | null {
    let left = s.count;
    for (const x of this.inventory) {
      if (!x || !x.sameItem(s)) continue;
      const k = Math.min(left, x.item.maxStack - x.count);
      x.count += k;
      left -= k;
      if (left <= 0) return null;
    }
    for (let i = 0; i < this.inventory.length; i++)
      if (!this.inventory[i]) {
        this.inventory[i] = s.copyWithCount(left);
        return null;
      }
    return s.copyWithCount(left);
  }

  /** vanilla PiglinAi.putInInventory: what won't fit is tossed aside */
  private putInInventory(s: ItemStack): void {
    const left = this.addToInventory(s);
    if (left) this.throwItemsToward([left], this.randomNearbyPos());
  }

  /** vanilla Mob.aiStep item pickup: what it wants within a block round it (not straight up or down) */
  override aiStep(): void {
    super.aiStep();
    if (!this.isAlive || this.dead || !this.level.gameRules.mobGriefing) return;
    for (const e of this.level.getEntities(this.bb.inflate(1, 0, 1), (e) => e instanceof ItemEntity)) {
      const it = e as ItemEntity;
      if (it.removed || it.stack.count <= 0 || it.pickupDelay > 0 || !this.wantsToPickUp(it.stack)) continue;
      this.pickUpItem(it);
    }
  }

  /** vanilla PiglinAi.pickUpItem: gold to hold and admire, pork to eat, the rest to hold or keep */
  private pickUpItem(it: ItemEntity): void {
    this.stopWalking();
    // vanilla Mob.onItemPickup: thrown_item_picked_up_by_entity ("Oh Shiny")
    if (it.thrower?.type === 'player') this.level.onThrownItemPickedUp?.(it.stack, this);
    // (vanilla LivingEntity.take: the pop the client plays for any pickup)
    const r = this.random;
    this.level.sound.play('entity.item.pickup', it.x, it.y, it.z, 0.2, ((r.nextFloat() - r.nextFloat()) * 0.7 + 1) * 2);
    let s: ItemStack;
    if (it.stack.item.id === 'gold_nugget') {
      s = it.stack;
      it.remove();
    } else {
      s = it.stack.copyWithCount(1);
      if (--it.stack.count <= 0) it.remove();
    }
    if (isLovedItem(s)) {
      this.timeTryingToReachItem = null;
      this.holdInOffhand(s);
      this.admiringUntil = this.now + ADMIRE_TICKS;
    } else if (PIGLIN_FOOD.has(s.item.id) && !this.hasEatenRecently()) this.ateRecentlyUntil = this.now + 200;
    else if (!this.equipIfPossible(s)) this.putInInventory(s);
  }

  /** vanilla PiglinAi.holdInOffhand: whatever it held there before is dropped */
  private holdInOffhand(s: ItemStack): void {
    if (this.offHand) this.spawnAtLocation(this.offHand);
    this.offHand = s;
  }

  /**
   * vanilla Mob.equipItemIfPossible (the hand): the old item only drops as it would on death (always, if it was
   * picked up), and what it picks up always drops
   */
  private equipIfPossible(s: ItemStack): boolean {
    if (!this.canReplaceCurrentItem(s)) return false;
    const cur = this.mainHand;
    if (cur && Math.max(this.random.nextFloat() - 0.1, 0) < this.handDropChance) this.spawnAtLocation(cur);
    this.holdInMainHand(s);
    return true;
  }

  /** vanilla setItemSlotAndDropWhenKilled */
  private holdInMainHand(s: ItemStack): void {
    this.mainHand = s;
    this.handDropChance = 2;
    this.persistenceRequired = true;
  }

  /**
   * vanilla PiglinAi.stopHoldingOffHandItem: done admiring, a grown piglin barters a gold ingot away (other gold it
   * keeps, and a gold ingot taken from it by a blow is lost); a baby holds it in its hand
   */
  stopHoldingOffHandItem(barter: boolean): void {
    const s = this.offHand;
    this.offHand = null;
    if (!s) return;
    if (this.isAdult()) {
      const currency = s.item.id === CURRENCY;
      if (barter && currency) this.throwItems(this.barterResponse());
      else if (!currency && !this.equipIfPossible(s)) this.putInInventory(s);
    } else if (!this.equipIfPossible(s)) {
      const held = this.mainHand;
      if (held) {
        if (isLovedItem(held)) this.putInInventory(held);
        else this.throwItems([held]);
      }
      this.holdInMainHand(s);
    }
  }

  private barterResponse(): ItemStack[] {
    const r = this.random, pool = BARTER.filter((e) => ITEMS.get(e.item));
    let total = 0;
    for (const e of pool) total += e.weight;
    let k = r.nextInt(total);
    for (const e of pool) {
      k -= e.weight;
      if (k >= 0) continue;
      const s = ItemStack.of(e.item, e.min + r.nextInt(e.max - e.min + 1));
      // vanilla EnchantRandomlyFunction(soul_speed): a random level of it
      if (e.soulSpeed) {
        const lvl = 1 + r.nextInt(3);
        s.tag = e.item === 'enchanted_book' ? { stored: { soul_speed: lvl } } : { enchantments: { soul_speed: lvl } };
      }
      return [s];
    }
    return [];
  }

  private randomNearbyPos(): [number, number, number] {
    const p = landRandomPos(this, 4, 2);
    return p ? [p[0] + 0.5, p[1], p[2] + 0.5] : [this.x, this.y, this.z];
  }

  /** vanilla PiglinAi.throwItems: at the nearest player it sees, else somewhere near */
  private throwItems(stacks: ItemStack[]): void {
    const p = this.nearestVisiblePlayer;
    this.throwItemsToward(stacks, p ? [p.x, p.y, p.z] : this.randomNearbyPos());
  }

  /** vanilla throwItemsTowardPos → BehaviorUtils.throwItem (0.3 a tick at a point a block over the spot) */
  private throwItemsToward(stacks: ItemStack[], [tx, ty, tz]: [number, number, number]): void {
    if (!stacks.length) return;
    // (vanilla swings the off hand)
    this.swing();
    for (const s of stacks) {
      const e = new ItemEntity(this.level, s);
      e.moveTo(this.x, this.y + this.eyeHeight - 0.3, this.z, this.random.nextFloat() * 360, 0);
      const vx = tx - this.x, vy = ty + 1 - this.y, vz = tz - this.z;
      const l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      e.dx = (vx / l) * 0.3;
      e.dy = (vy / l) * 0.3;
      e.dz = (vz / l) * 0.3;
      e.pickupDelay = 10;
      e.thrower = this;
      this.level.addEntity(e);
    }
  }

  /** vanilla PiglinAi.mobInteract: hand a grown piglin a gold ingot to admire */
  interact(p: Player, stack: ItemStack | null): boolean {
    if (!stack || stack.item.id !== CURRENCY || this.isAdmiringDisabled() || this.isAdmiring() || !this.isAdult()) return false;
    this.holdInOffhand(stack.copyWithCount(1));
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    this.admiringUntil = this.now + ADMIRE_TICKS;
    this.stopWalking();
    return true;
  }

  /** vanilla Piglin.getArmPose */
  armPose(): PiglinArmPose {
    if (this.isDancing()) return 'dancing';
    if (isLovedItem(this.offHand)) return 'admiring_item';
    if (this.aggressive && this.mainHand?.item.tool) return 'attacking_with_melee_weapon';
    if (this.chargingCrossbow) return 'crossbow_charge';
    return isCrossbow(this.mainHand) && isCharged(this.mainHand) ? 'crossbow_hold' : 'default';
  }

  // --- the rest --------------------------------------------------------------

  /** vanilla Piglin.finishConversion: it drops the gold it was admiring and everything it carries first */
  protected override finishConversion(): void {
    if (this.isAdmiring() && this.offHand) {
      this.spawnAtLocation(this.offHand);
      this.offHand = null;
    }
    this.dropInventory();
    super.finishConversion();
  }

  private dropInventory(): void {
    for (let i = 0; i < this.inventory.length; i++) {
      const s = this.inventory[i];
      if (s) this.spawnAtLocation(s);
      this.inventory[i] = null;
    }
  }

  /** vanilla Piglin.dropCustomDeathLoot: the gold in its hand, and everything in its pack */
  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    super.die(source, attacker);
    if (!this.level.gameRules.doMobLoot) return;
    if (this.offHand) {
      this.spawnAtLocation(this.offHand);
      this.offHand = null;
    }
    this.dropInventory();
  }

  override lootTable(): LootEntry[] {
    return [];
  }

  /** vanilla PiglinAi.getSoundForActivity */
  override ambientSound(): string {
    if (this.activity === 'fight') return 'entity.piglin.angry';
    if (this.isConverting()) return 'entity.piglin.retreat';
    const a = this.avoiding();
    if (this.activity === 'avoid' && a && a.distanceToSqr(this.x, this.y, this.z) < 144) return 'entity.piglin.retreat';
    if (this.activity === 'admire_item') return 'entity.piglin.admiring_item';
    if (this.activity === 'celebrate') return 'entity.piglin.celebrate';
    if (this.playerHoldingWanted) return 'entity.piglin.jealous';
    return this.repellent ? 'entity.piglin.retreat' : 'entity.piglin.ambient';
  }
  override hurtSound(): string {
    return 'entity.piglin.hurt';
  }
  override deathSound(): string {
    return 'entity.piglin.death';
  }
  override stepSound(): string {
    return 'entity.piglin.step';
  }
  protected convertedSound(): string {
    return 'entity.piglin.converted_to_zombified';
  }

  /** vanilla Piglin.removeWhenFarAway: not once it's got something to keep */
  override removeWhenFarAway(_d2: number): boolean {
    return !this.persistenceRequired;
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const now = this.now;
    return {
      ...super.saveData(),
      baby: this.baby,
      cannotHunt: this.cannotHunt,
      timeInOverworld: this.timeInOverworld,
      immune: this.immuneToZombification,
      handDrop: this.handDropChance,
      huntedRecently: Math.max(0, this.huntedRecentlyUntil - now),
      inventory: JSON.stringify(this.inventory.map((s) => (s ? saveStack(s) : null))),
      ...(this.offHand ? { offHand: JSON.stringify(saveStack(this.offHand)), admiring: Math.max(0, this.admiringUntil - now) } : {}),
    };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    const now = this.now;
    if (d.baby) this.setBaby(true);
    this.cannotHunt = d.cannotHunt === true;
    this.timeInOverworld = Number(d.timeInOverworld ?? 0);
    this.immuneToZombification = d.immune === true;
    if (typeof d.handDrop === 'number') this.handDropChance = d.handDrop;
    this.huntedRecentlyUntil = now + Number(d.huntedRecently ?? 0);
    if (typeof d.inventory === 'string') (JSON.parse(d.inventory) as (SavedStack | null)[]).forEach((x, i) => (this.inventory[i] = loadStack(x)));
    if (typeof d.offHand === 'string') {
      this.offHand = loadStack(JSON.parse(d.offHand) as SavedStack);
      this.admiringUntil = now + Number(d.admiring ?? 0);
    }
  }
}
