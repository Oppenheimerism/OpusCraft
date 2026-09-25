// Mob: AI-driven living entity (vanilla Mob + PathfinderMob): goals, controls,
// navigation, sensing, despawning, melee, loot and experience.

import { LivingEntity } from './living';
import type { Entity } from './entity';
import type { Level } from '../game/level';
import { GoalSelector, Flag } from './ai/goal';
import { LookControl, MoveControl, JumpControl, BodyRotationControl, eyeY } from './ai/controls';
import { PathNavigation } from './ai/navigation';
import { PathType, DEFAULT_MALUS } from './ai/pathfinder';
import { clipBlocks } from '../game/raycast';
import { ItemStack, ITEMS, SavedStack, saveStack, loadStack, blockForItem } from '../item/item';
import type { Item } from '../item/item';
import { ItemEntity } from './itemEntity';
import { AABB } from '../core/aabb';
import { Rand } from '../core/rng';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_LAVA, F_FULL_COLLISION } from '../world/block';
import { FLUID_WATER } from '../world/fluids';
import type { SavedEffect } from './effects';
import { damageBonus, entityLevel, hasBinding, hasVanishing, hurtAndBreak, levelOf, lootingBonus, enchantMobSpawnEquipment } from '../item/enchantHelper';
import type { EquipSlot } from '../item/enchantHelper';
import { ARMOR_SLOTS, armorIndex, equipableSlot, equipmentForSlot, equipmentSlotForItem, equipSound, isArmorSlot } from '../item/equipment';
import type { ArmorSlot } from '../item/equipment';
import { currentDifficultyAt } from '../game/difficulty';
import type { DifficultyInstance } from '../game/difficulty';
import { doPostAttackEffects } from '../game/enchantEffects';
import { crossbowUseTick } from '../item/crossbow';
import { CHARGED_CREEPER_HEADS } from '../world/blocksSkulls';
import { LeashKnot, getOrCreateKnot } from './leash';
import type { Player } from './player';

/** where a saved lead's other end is: whoever held it (by uuid), or the fence it was tied to */
export type SavedLeash = { uuid: string } | { x: number; y: number; z: number };

export type MobCategory = 'monster' | 'creature' | 'ambient' | 'water_creature' | 'misc' | 'axolotls' | 'underground_water_creature' | 'water_ambient';

/** (Stage 5: ocean) vanilla MobCategory.getDespawnDistance: 128 blocks, but fish (water_ambient) go at 64 */
export function despawnDistance(c: MobCategory): number {
  return c === 'water_ambient' ? 64 : 128;
}

export interface SavedEntity {
  id: string;
  /** vanilla UUID (only once something has had to remember the entity) */
  uuid?: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  dx: number;
  dy: number;
  dz: number;
  health: number;
  fire: number;
  persistent?: boolean;
  hand?: SavedStack | null;
  /** vanilla HandDropChances[0] when it isn't the default */
  handDrop?: number;
  /** vanilla HandItems[1] and HandDropChances[1] */
  offhand?: SavedStack | null;
  offDrop?: number;
  /** vanilla ArmorItems (feet, legs, chest, head) and ArmorDropChances */
  armor?: (SavedStack | null)[];
  armorDrop?: number[];
  /** vanilla CanPickUpLoot */
  loot?: boolean;
  data?: Record<string, number | string | boolean>;
  /** vanilla active_effects */
  effects?: SavedEffect[];
  /** vanilla CustomName and CustomNameVisible */
  name?: string;
  nameVisible?: boolean;
  /** vanilla leash: the other end of its lead */
  leash?: SavedLeash;
}

/** per-tick cached line-of-sight checks (vanilla Sensing) */
export class Sensing {
  private readonly seen = new Set<number>();
  private readonly unseen = new Set<number>();
  constructor(readonly mob: Mob) {}
  tick(): void {
    this.seen.clear();
    this.unseen.clear();
  }
  hasLineOfSight(e: Entity): boolean {
    if (this.seen.has(e.id)) return true;
    if (this.unseen.has(e.id)) return false;
    const ok = this.mob.hasLineOfSight(e);
    (ok ? this.seen : this.unseen).add(e.id);
    return ok;
  }
}

/** a loot table entry: item, count range, optional player-kill requirement */
export interface LootEntry {
  item: string;
  min: number;
  max: number;
  /** only when killed by a player */
  player?: boolean;
  /** chance the entry applies at all */
  chance?: number;
  /** smelted variant when the mob died burning */
  cooked?: string;
  /** no looting bonus on the count (vanilla entries without enchanted_count_increase) */
  noLooting?: boolean;
  /** vanilla random_chance_with_enchanted_bonus: the chance with looting, [level I, per level above] */
  lootingChance?: [number, number];
  /** vanilla enchanted_count_increase's limit: at most this many, looting and all */
  limit?: number;
  /** vanilla set_potion: the potion the item carries (a tipped arrow's) */
  potion?: string;
}

export type SpawnReason = 'natural' | 'chunk' | 'egg' | 'command' | 'breeding' | 'spawner' | 'jockey' | 'structure' | 'summoned' | 'conversion' | 'reinforcement' | 'bucket' | 'event';

/** vanilla Mob.DEFAULT_EQUIPMENT_DROP_CHANCE; 2 (a sure drop, kept as it was) once it's something the mob picked up */
export const DEFAULT_DROP_CHANCE = 0.085;
/** vanilla EquipmentSlot order: the hands, then the armour from the feet up (drops and equipment go in this order) */
export const EQUIPMENT_SLOTS: readonly EquipSlot[] = ['mainhand', 'offhand', 'feet', 'legs', 'chest', 'head'];
/** vanilla DiggerItem: pickaxes, axes, shovels and hoes */
const isDigger = (it: Item) => it.tool?.type === 'pickaxe' || it.tool?.type === 'axe' || it.tool?.type === 'shovel' || it.tool?.type === 'hoe';

/** vanilla SpawnGroupData: what one spawn pack's members pass along to each other */
export interface SpawnGroup {
  /** vanilla AgeableMob.AgeableMobGroupData: members so far, and the odds each after the first is a baby */
  ageable?: { size: number; babyChance: number };
  /** vanilla Wolf.WolfPackData: the coat the pack shares */
  wolfVariant?: string;
  /** vanilla Horse.HorseGroupData: the coat the herd shares */
  horseColor?: string;
  /** vanilla Llama.LlamaGroupData: the coat the herd shares */
  llamaVariant?: string;
  /** (Stage 5: ocean) vanilla Axolotl.AxolotlGroupData: the two colours the group's axolotls come in */
  axolotlVariants?: number[];
  /** vanilla Rabbit.RabbitGroupData: the coat the group shares */
  rabbitVariant?: number;
}

export abstract class Mob extends LivingEntity {
  abstract readonly category: MobCategory;
  readonly goalSelector = new GoalSelector();
  readonly targetSelector = new GoalSelector();
  readonly lookControl: LookControl;
  private ownMoveControl: MoveControl;
  private ownJumpControl: JumpControl;
  readonly bodyControl: BodyRotationControl;
  /**
   * this mob's own navigation (goals use `navigation`, which is the mount's while this steers one); a drowned swaps
   * between walking and swimming ones
   */
  ownNavigation: PathNavigation;
  readonly sensing: Sensing;
  readonly random = new Rand((Math.random() * 0x7fffffff) | 0);
  target: LivingEntity | null = null;
  persistenceRequired = false;
  ambientSoundTime = 0;
  xpReward = 0;
  followRange = 16;
  private baseAttackDamage = 2;
  attackKnockback = 0;
  protected baseMoveSpeed = 0.25;
  baseArmor = 0;
  kbResist = 0;
  aggressive = false;
  mainHand: ItemStack | null = null;
  handDropChance = DEFAULT_DROP_CHANCE;
  /** vanilla handItems[OFFHAND] (a piglin's: the gold it admires) */
  offHand: ItemStack | null = null;
  offHandDropChance = DEFAULT_DROP_CHANCE;
  /** vanilla armorItems: feet, legs, chest, head (the order of the player's inventory.armor) */
  readonly armorItems: (ItemStack | null)[] = [null, null, null, null];
  /** vanilla armorDropChances */
  readonly armorDropChances: number[] = [DEFAULT_DROP_CHANCE, DEFAULT_DROP_CHANCE, DEFAULT_DROP_CHANCE, DEFAULT_DROP_CHANCE];
  /** vanilla canPickUpLoot: walks over items and takes what it wants (zombies and skeletons at spawn, piglins always) */
  canPickUpLoot = false;
  air = 300;
  usingItem = false;
  useItemTicks = 0;
  private malusOverrides: Map<PathType, number> | null = null;
  private goalsReady = false;
  /** vanilla Leashable.LeashData.leashHolder: what holds its lead (a player, a fence's knot, a wandering trader) */
  leashHolder: Entity | null = null;
  /** vanilla LeashData.delayedLeashInfo: a loaded lead's other end, found again once it's about */
  private delayedLeash: SavedLeash | null = null;
  /** vanilla Mob.restrictCenter / restrictRadius (-1: none): a lead keeps it near the holder, a guardian near home */
  restrictCenter: [number, number, number] = [0, 0, 0];
  restrictRadius = -1;

  constructor(level: Level) {
    super(level);
    this.lookControl = new LookControl(this);
    this.ownMoveControl = new MoveControl(this);
    this.ownJumpControl = new JumpControl(this);
    this.bodyControl = new BodyRotationControl(this);
    this.ownNavigation = this.createNavigation();
    this.sensing = new Sensing(this);
  }

  /** vanilla createNavigation */
  protected createNavigation(): PathNavigation {
    return new PathNavigation(this);
  }

  // --- steering a mount (vanilla getControlledVehicle, getNavigation / getMoveControl / getJumpControl) ---

  /** the mob this one rides and steers, if any */
  controlledVehicle(): Mob | null {
    const v = this.vehicle;
    return v instanceof Mob && v.controllingPassenger() === this ? v : null;
  }

  get navigation(): PathNavigation {
    return this.controlledVehicle()?.navigation ?? this.ownNavigation;
  }

  get moveControl(): MoveControl {
    return this.controlledVehicle()?.moveControl ?? this.ownMoveControl;
  }
  set moveControl(c: MoveControl) {
    this.ownMoveControl = c;
  }

  get jumpControl(): JumpControl {
    return this.controlledVehicle()?.jumpControl ?? this.ownJumpControl;
  }
  set jumpControl(c: JumpControl) {
    this.ownJumpControl = c;
  }

  /** vanilla Mob.getControllingPassenger: a mob up front steers (not a slime) */
  override controllingPassenger(): Entity | null {
    const p = this.passengers[0];
    return p instanceof Mob && p.type !== 'slime' && p.type !== 'magma_cube' ? p : null;
  }

  /**
   * a mob vanilla runs on a Brain, ported here as goals: its goals are its brain, which a rider's control flags
   * don't touch (vanilla's Brain mobs have an empty goal selector)
   */
  protected readonly brainAsGoals: boolean = false;

  /** vanilla Mob.updateControlFlags: a mob steering this one takes its moving, jumping and looking goals */
  private updateControlFlags(): void {
    if (this.brainAsGoals) return;
    const steered = this.controllingPassenger() instanceof Mob;
    const f = steered ? Flag.MOVE | Flag.JUMP | Flag.LOOK : this.vehicle?.type === 'boat' || this.vehicle?.type === 'chest_boat' ? Flag.JUMP : 0;
    this.goalSelector.disabledFlags = f;
  }

  /** vanilla Mob.rideTick: faces the way the mount it steers does */
  override rideTick(): void {
    super.rideTick();
    const v = this.controlledVehicle();
    if (v) this.bodyYaw = v.bodyYaw;
  }

  /** subclasses add their goals here (called lazily once all fields exist) */
  protected abstract registerGoals(): void;

  private ensureGoals(): void {
    if (this.goalsReady) return;
    this.goalsReady = true;
    this.registerGoals();
  }

  // --- attributes / tunables ------------------------------------------------

  /**
   * ATTACK_DAMAGE attribute value: assign the base, read it with the held weapon's modifier (its damage over a bare
   * hand's 1) and strength / weakness applied
   */
  get attackDamage(): number {
    const weapon = this.mainHand ? this.mainHand.item.attackDamage - 1 : 0;
    return this.effectAttackDamage(this.baseAttackDamage + weapon);
  }
  set attackDamage(v: number) {
    this.baseAttackDamage = v;
  }

  /** MOVEMENT_SPEED attribute value: assign the base, read it with speed / slowness (and a sprint's +30%) applied */
  get moveSpeedAttr(): number {
    return Math.max(0, this.baseMoveSpeed * (this.sprinting ? 1.3 : 1) * this.speedEffectFactor());
  }
  set moveSpeedAttr(v: number) {
    this.baseMoveSpeed = v;
  }

  /** vanilla FLYING_SPEED attribute (0.4 unless set): how fast a FlyingMoveControl flies it */
  flyingSpeedAttr = 0.4;

  headRotSpeed(): number {
    return 10;
  }
  maxHeadXRot(): number {
    return 40;
  }
  maxHeadYRot(): number {
    return 75;
  }
  /** vanilla ARMOR attribute (at most 30): the base, and each worn piece's defense in its own slot */
  override armorValue(): number {
    let v = this.baseArmor;
    for (let i = 0; i < 4; i++) v += this.wornArmor(i)?.defense ?? 0;
    return Math.floor(Math.min(30, v));
  }

  /** vanilla ARMOR_TOUGHNESS attribute (at most 20) */
  override armorToughness(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) v += this.wornArmor(i)?.toughness ?? 0;
    return Math.min(20, v);
  }

  /** the armour item in slot i, when it's one for that slot (vanilla ArmorItem modifiers are slot-bound) */
  private wornArmor(i: number): Item['armor'] | null {
    const a = this.armorItems[i]?.item.armor;
    return a && a.slot === ARMOR_SLOTS[i] ? a : null;
  }
  override knockbackResistance(): number {
    return this.kbResist;
  }
  isBaby(): boolean {
    return false;
  }
  /** vanilla LivingEntity.canBreatheUnderwater (#can_breathe_under_water): the undead never drown */
  canBreatheUnderwater(): boolean {
    return this.isUndead();
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.zza = s;
  }

  override movementSpeed(): number {
    return this.speed;
  }

  malus(t: PathType): number {
    const o = this.malusOverrides?.get(t);
    return o !== undefined ? o : DEFAULT_MALUS[t];
  }

  setPathfindingMalus(t: PathType, v: number): void {
    (this.malusOverrides ??= new Map()).set(t, v);
  }

  /** vanilla Mob.getMaxFallDistance */
  maxFallDistance(): number {
    if (!this.target) return 3;
    let i = Math.floor(this.health - this.maxHealth * 0.33);
    const diff = ['peaceful', 'easy', 'normal', 'hard'].indexOf(this.level.difficulty);
    i -= (3 - diff) * 4;
    if (i < 0) i = 0;
    return i + 3;
  }

  /** PathfinderMob.getWalkTargetValue: preference for random stroll destinations */
  walkTargetValue(_x: number, _y: number, _z: number): number {
    return 0;
  }

  // --- tick -----------------------------------------------------------------

  override tick(): void {
    this.checkDespawn();
    if (this.removed) return;
    super.tick();
    if (!this.removed) this.tickLeash();
    if (this.tickCount % 5 === 0) this.updateControlFlags();
  }

  // --- restriction (vanilla Mob.restrictTo, hasRestriction, isWithinRestriction, clearRestriction) ---

  restrictTo(x: number, y: number, z: number, r: number): void {
    this.restrictCenter = [x, y, z];
    this.restrictRadius = r;
  }
  hasRestriction(): boolean {
    return this.restrictRadius !== -1;
  }
  isWithinRestriction(x = Math.floor(this.x), y = Math.floor(this.y), z = Math.floor(this.z)): boolean {
    if (this.restrictRadius === -1) return true;
    const [cx, cy, cz] = this.restrictCenter;
    return (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2 < this.restrictRadius * this.restrictRadius;
  }
  clearRestriction(): void {
    this.restrictRadius = -1;
  }

  // --- leads (vanilla Leashable, as Mob and PathfinderMob have it) ---

  /** vanilla Mob.canBeLeashed: anything but a monster (vanilla Enemy) */
  canBeLeashed(): boolean {
    return this.category !== 'monster';
  }

  isLeashed(): boolean {
    return this.leashHolder !== null;
  }

  /** vanilla Leashable.canHaveALeashAttachedToIt */
  canHaveALeashAttachedToIt(): boolean {
    return this.canBeLeashed() && !this.isLeashed();
  }

  /** vanilla Leashable.setLeashedTo: `holder` has its lead now (and off whatever it was riding it comes) */
  setLeashedTo(holder: Entity): void {
    // (the holder's uuid made now, so the saved lead finds it again)
    void holder.uuid;
    this.leashHolder = holder;
    this.delayedLeash = null;
    if (this.vehicle) this.stopRiding();
  }

  /** vanilla Mob.dropLeash: the lead comes off (onto the ground when `dropItem`), and it may go where it likes again */
  dropLeash(dropItem: boolean): void {
    if (!this.leashHolder) return;
    this.leashHolder = null;
    this.delayedLeash = null;
    if (dropItem) this.spawnAtLocation(ItemStack.of('lead'));
    this.clearRestriction();
  }

  /** vanilla Entity.getLeashOffset: where a lead ties on, from its feet and turned with its body (eye high, a bit forward) */
  leashOffset(): [number, number, number] {
    return [0, this.eyeHeight, this.width * 0.4];
  }

  /**
   * vanilla Leashable.tickLeash: a loaded lead finds its holder; either end gone, it drops. Past ten blocks it snaps,
   * past six it tugs, and nearer it walks after the holder
   */
  protected tickLeash(): void {
    if (this.delayedLeash) this.restoreLeash();
    if (!this.leashHolder) return;
    if (!this.isAlive || !isAliveEntity(this.leashHolder)) this.dropLeash(true);
    const h = this.leashHolder as Entity | null;
    if (!h || h.level !== this.level) return;
    const f = Math.sqrt(this.distanceToSqr(h.x, h.y, h.z));
    if (!this.handleLeashAtDistance(h, f)) return;
    if (f > 10) this.leashTooFarBehaviour();
    else if (f > 6) {
      this.elasticRangeLeashBehaviour(h, f);
      // vanilla checkSlowFallDistance: tugged along, it doesn't count the drop
      if (this.dy > -0.5 && this.fallDistance > 1) this.fallDistance = 1;
    } else this.closeRangeLeashBehaviour(h);
  }

  /** vanilla restoreLeashFromSave: its holder by uuid (the fence's knot, made again if need be); still missing after 5 seconds, the lead drops */
  private restoreLeash(): void {
    const d = this.delayedLeash!;
    if ('uuid' in d) {
      const p = this.level.player;
      const e = p && p.uuid === d.uuid ? p : this.level.entities.find((x) => !x.removed && x.hasUuid && x.uuid === d.uuid);
      if (e) {
        this.setLeashedTo(e);
        return;
      }
    } else {
      this.setLeashedTo(getOrCreateKnot(this.level, d.x, d.y, d.z));
      return;
    }
    if (this.tickCount > 100) {
      this.spawnAtLocation(ItemStack.of('lead'));
      this.delayedLeash = null;
    }
  }

  /** vanilla PathfinderMob.handleLeashAtDistance: it keeps within five blocks of where the holder stands (false: no more this tick) */
  handleLeashAtDistance(h: Entity, _distance: number): boolean {
    this.restrictTo(Math.floor(h.x), Math.floor(h.y), Math.floor(h.z), 5);
    return true;
  }

  /** vanilla PathfinderMob.leashTooFarBehaviour: the lead snaps */
  protected leashTooFarBehaviour(): void {
    this.dropLeash(true);
    this.goalSelector.disabledFlags |= Flag.MOVE;
  }

  /** vanilla Leashable.legacyElasticRangeLeashBehaviour: pulled toward the holder, the harder the more straight along an axis */
  protected elasticRangeLeashBehaviour(h: Entity, f: number): void {
    const d0 = (h.x - this.x) / f, d1 = (h.y - this.y) / f, d2 = (h.z - this.z) / f;
    this.dx += Math.sign(d0) * d0 * d0 * 0.4;
    this.dy += Math.sign(d1) * d1 * d1 * 0.4;
    this.dz += Math.sign(d2) * d2 * d2 * 0.4;
  }

  /** vanilla PathfinderMob.closeRangeLeashBehaviour: it walks to within two blocks of the holder */
  protected closeRangeLeashBehaviour(h: Entity): void {
    if (!this.shouldStayCloseToLeashHolder()) return;
    this.goalSelector.disabledFlags &= ~Flag.MOVE;
    let vx = h.x - this.x, vy = h.y - this.y, vz = h.z - this.z;
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const s = len < 1e-4 ? 0 : Math.max(len - 2, 0) / len;
    vx *= s;
    vy *= s;
    vz *= s;
    this.navigation.moveTo(this.x + vx, this.y + vy, this.z + vz, this.followLeashSpeed());
  }

  protected shouldStayCloseToLeashHolder(): boolean {
    return true;
  }

  protected followLeashSpeed(): number {
    return 1;
  }

  /**
   * vanilla Mob.interact before the mob's own mobInteract: the player holding its lead lets go of it (the lead drops,
   * but in creative); a lead ties it to the player (checkAndHandleImportantInteractions); a named name tag names it,
   * for good (vanilla NameTagItem.interactLivingEntity: it won't despawn either). True when that took the click
   */
  interactLeashOrName(p: Player, stack: ItemStack | null): boolean {
    if (!this.isAlive) return false;
    if (this.leashHolder === p) {
      this.dropLeash(p.gameMode !== 'creative');
      return true;
    }
    if (stack?.item.id === 'lead' && this.canHaveALeashAttachedToIt()) {
      this.setLeashedTo(p);
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      return true;
    }
    const name = stack?.item.id === 'name_tag' ? stack.tag?.customName : undefined;
    if (name !== undefined) {
      this.setCustomName(name);
      this.persistenceRequired = true;
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      return true;
    }
    return false;
  }

  override baseTick(): void {
    super.baseTick();
    if (this.isAlive && this.random.nextInt(1000) < this.ambientSoundTime++) {
      this.ambientSoundTime = -this.ambientSoundInterval();
      this.playAmbientSound();
    }
    // vanilla LivingEntity.baseTick air supply (water breathing holds it)
    if (this.isAlive) {
      if (this.eyeFluid === FLUID_WATER) {
        if (!this.canBreatheUnderwater() && !this.hasWaterBreathing()) {
          this.air--;
          if (this.air === -20) {
            this.air = 0;
            this.hurt(2, 'drown');
          }
        }
      } else if (this.air < 300) this.air = Math.min(300, this.air + 4);
    }
  }

  protected override serverAiStep(): void {
    this.ensureGoals();
    this.noActionTime++;
    this.sensing.tick();
    if ((this.tickCount + this.id) % 2 !== 0 && this.tickCount > 1) {
      this.targetSelector.tickRunningGoals(false);
      this.goalSelector.tickRunningGoals(false);
    } else {
      this.targetSelector.tick();
      this.goalSelector.tick();
    }
    this.ownNavigation.tick();
    this.customServerAiStep();
    this.ownMoveControl.tick();
    this.lookControl.tick();
    this.ownJumpControl.tick();
  }

  protected customServerAiStep(): void {}

  override aiStep(): void {
    super.aiStep();
    if (this.usingItem) {
      // vanilla LivingEntity.updateUsingItem → CrossbowItem.onUseTick: a mob drawing a crossbow makes the loading sounds too
      if (this.mainHand?.item.id === 'crossbow') crossbowUseTick(this.level, this, this.mainHand, this.useItemTicks);
      this.useItemTicks++;
    }
    // vanilla Mob.aiStep "looting": the items it wants within a block round it (getPickupReach: not above or below)
    if (this.canPickUpLoot && this.isAlive && !this.dead && this.level.gameRules.mobGriefing) {
      for (const e of this.level.getEntities(this.bb.inflate(1, 0, 1), (e) => e instanceof ItemEntity)) {
        const it = e as ItemEntity;
        if (it.removed || it.stack.count <= 0 || it.pickupDelay > 0 || !this.wantsToPickUp(it.stack)) continue;
        this.pickUpItem(it);
      }
    }
  }

  protected override updateBodyRotation(): void {
    this.bodyControl.tick();
  }

  // --- despawning -----------------------------------------------------------

  removeWhenFarAway(_d2: number): boolean {
    return true;
  }

  shouldDespawnInPeaceful(): boolean {
    return false;
  }

  /** vanilla Mob.requiresCustomPersistence: riding something keeps a mob from despawning */
  requiresCustomPersistence(): boolean {
    return this.vehicle !== null;
  }

  /** vanilla Mob.checkDespawn */
  checkDespawn(): void {
    if (this.level.difficulty === 'peaceful' && this.shouldDespawnInPeaceful()) {
      this.remove();
      return;
    }
    if (this.persistenceRequired || this.requiresCustomPersistence()) {
      this.noActionTime = 0;
      return;
    }
    const p = this.level.player;
    if (!p || p.gameMode === 'spectator') return;
    const d0 = p.distanceToSqr(this.x, this.y, this.z);
    // (Stage 5: ocean) the category's despawn distance
    const far = despawnDistance(this.category);
    if (d0 > far * far && this.removeWhenFarAway(d0)) {
      this.remove();
      return;
    }
    if (this.noActionTime > 600 && this.random.nextInt(800) === 0 && d0 > 32 * 32 && this.removeWhenFarAway(d0)) this.remove();
    else if (d0 < 32 * 32) this.noActionTime = 0;
  }

  // --- senses ---------------------------------------------------------------

  /** can this mob attack `e` (vanilla canAttack + TargetingConditions basics) */
  canAttack(e: LivingEntity | null): boolean {
    if (!e || !e.isAlive || e === this) return false;
    // (Stage 5: ocean) vanilla LivingEntity.canAttack: only what can be seen as an enemy
    if (!e.canBeSeenAsEnemy()) return false;
    if (e.type === 'player') {
      const gm = (e as unknown as { gameMode: string }).gameMode;
      if (gm === 'creative' || gm === 'spectator') return false;
      if (this.level.difficulty === 'peaceful') return false;
    }
    return true;
  }

  setTarget(e: LivingEntity | null): void {
    this.target = e;
  }

  /** vanilla Mob.lookAt: snap body/head toward an entity (used when strafing) */
  lookAtEntity(e: Entity, maxYaw: number, maxPitch: number): void {
    const dx = e.x - this.x, dz = e.z - this.z;
    const dy = eyeY(e) - (this.y + this.eyeHeight);
    const h = Math.sqrt(dx * dx + dz * dz);
    const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
    const pitch = -((Math.atan2(dy, h) * 180) / Math.PI);
    this.pitch = rotlerpSimple(this.pitch, pitch, maxPitch);
    this.yaw = rotlerpSimple(this.yaw, yaw, maxYaw);
  }

  // --- combat ---------------------------------------------------------------

  /** vanilla getAttackBoundingBox: bb inflated horizontally by sqrt(2.04) - 0.6 */
  attackBoundingBox(): AABB {
    const r = Math.sqrt(2.04) - 0.6;
    return this.bb.inflate(r, 0, r);
  }

  isWithinMeleeAttackRange(e: Entity): boolean {
    return this.attackBoundingBox().intersects(e.bb);
  }

  /** vanilla Mob.doHurtTarget (the weapon's damage and knockback enchantments, then the post-attack effects) */
  doHurtTarget(target: Entity): boolean {
    const dmg = this.attackDamage + damageBonus(this.mainHand, target);
    const ok = target.hurt(dmg, 'mob', this);
    if (ok) {
      const kb = this.attackKnockback + levelOf(this.mainHand, 'knockback');
      if (kb > 0 && target instanceof LivingEntity) {
        const r = (this.yaw * Math.PI) / 180;
        target.knockback(kb * 0.5, Math.sin(r), -Math.cos(r));
        this.dx *= 0.6;
        this.dz *= 0.6;
      }
      // the target's thorns, the weapon's fire aspect
      doPostAttackEffects(target, this, this.mainHand, true);
      if (target instanceof LivingEntity) this.lastHurtMob = target;
    }
    return ok;
  }

  /** vanilla isSunBurnTick for undead mobs */
  isSunBurnTick(): boolean {
    if (!this.level.isDay()) return false;
    const f = this.lightMagic();
    const bx = Math.floor(this.x), by = Math.floor(this.y + this.eyeHeight), bz = Math.floor(this.z);
    if (f > 0.5 && this.random.nextFloat() * 30 < (f - 0.4) * 2 && !this.isInWaterOrRainNow() && this.level.canSeeSky(bx, by, bz)) return true;
    return false;
  }

  startUsingItem(): void {
    this.usingItem = true;
    this.useItemTicks = 0;
  }

  stopUsingItem(): void {
    this.usingItem = false;
    this.useItemTicks = 0;
  }

  // --- equipment (vanilla Mob hand and armour items, drop chances, item pickup) ---------------------------

  getItemBySlot(slot: EquipSlot): ItemStack | null {
    if (slot === 'mainhand') return this.mainHand;
    if (slot === 'offhand') return this.offHand;
    return this.armorItems[armorIndex(slot)];
  }

  /** vanilla Mob.setItemSlot (→ LivingEntity.onEquipItem) */
  setItemSlot(slot: EquipSlot, s: ItemStack | null): void {
    const stack = s && s.count > 0 ? s : null;
    const old = this.getItemBySlot(slot);
    if (slot === 'mainhand') this.mainHand = stack;
    else if (slot === 'offhand') this.offHand = stack;
    else this.armorItems[armorIndex(slot)] = stack;
    this.onEquipItem(slot, old, stack);
  }

  /**
   * vanilla LivingEntity.onEquipItem: something put on in its own slot plays its equip sound, unless it's the very
   * same stack (enchanting spawn equipment) or the mob hasn't ticked yet (vanilla firstTick: spawning, loading)
   */
  protected onEquipItem(slot: EquipSlot, old: ItemStack | null, cur: ItemStack | null): void {
    if (!cur || (old && old.sameItem(cur)) || this.tickCount === 0) return;
    if (equipableSlot(cur.item) !== slot) return;
    const snd = equipSound(cur.item);
    if (snd) this.playSound(snd, 1, 1);
  }

  /** vanilla getEquipmentDropChance */
  equipmentDropChance(slot: EquipSlot): number {
    if (slot === 'mainhand') return this.handDropChance;
    if (slot === 'offhand') return this.offHandDropChance;
    return this.armorDropChances[armorIndex(slot)];
  }

  /** vanilla setDropChance */
  setDropChance(slot: EquipSlot, f: number): void {
    if (slot === 'mainhand') this.handDropChance = f;
    else if (slot === 'offhand') this.offHandDropChance = f;
    else this.armorDropChances[armorIndex(slot)] = f;
  }

  /** vanilla setGuaranteedDrop: drops for sure, and as it is (no wear rolled on) */
  setGuaranteedDrop(slot: EquipSlot): void {
    this.setDropChance(slot, 2);
  }

  /** vanilla setItemSlotAndDropWhenKilled: what a mob took for itself it keeps, drops, and stays around for */
  setItemSlotAndDropWhenKilled(slot: EquipSlot, s: ItemStack): void {
    this.setItemSlot(slot, s);
    this.setGuaranteedDrop(slot);
    this.persistenceRequired = true;
  }

  /** vanilla Mob.wantsToPickUp */
  wantsToPickUp(s: ItemStack): boolean {
    return this.canHoldItem(s);
  }

  /** vanilla Mob.canHoldItem */
  canHoldItem(_s: ItemStack): boolean {
    return true;
  }

  /** vanilla Mob.pickUpItem: as much of the stack as went on (all of it into a hand, one piece of armour) */
  protected pickUpItem(it: ItemEntity): void {
    const src = it.stack;
    const got = this.equipItemIfPossible(src.copy());
    if (!got) return;
    this.onItemPickup(it);
    this.take(it, got.count);
    src.count -= got.count;
    if (src.count <= 0) it.remove();
  }

  /** vanilla Mob.onItemPickup: thrown_item_picked_up_by_entity for the player who threw it */
  protected onItemPickup(it: ItemEntity): void {
    if (it.thrower?.type === 'player') this.level.onThrownItemPickedUp?.(it.stack, this);
  }

  /**
   * vanilla Mob.equipItemIfPossible: into the item's own slot if it beats what's there (armour it won't swap goes to
   * an empty hand instead); what it had drops as it would on death (always, if it picked that up itself) and the
   * new item is kept for good. Returns what went on, or null
   */
  equipItemIfPossible(stack: ItemStack): ItemStack | null {
    let slot = equipmentSlotForItem(stack.item);
    let cur = this.getItemBySlot(slot);
    let ok = this.canReplaceCurrentItem(stack, cur);
    if (isArmorSlot(slot) && !ok) {
      slot = 'mainhand';
      cur = this.getItemBySlot(slot);
      ok = !cur;
    }
    if (!ok || !this.canHoldItem(stack)) return null;
    if (cur && Math.max(this.random.nextFloat() - 0.1, 0) < this.equipmentDropChance(slot)) this.spawnAtLocation(cur);
    // (vanilla EquipmentSlot.limit: an armour slot holds one)
    const put = isArmorSlot(slot) ? stack.split(1) : stack;
    this.setItemSlotAndDropWhenKilled(slot, put);
    return put;
  }

  /**
   * vanilla Mob.canReplaceCurrentItem: anything beats nothing; a sword beats what isn't one, else the harder
   * hitting one wins; a bow or crossbow only replaces its own kind; armour goes by defense, then toughness (never
   * over a piece with curse of binding); a digging tool beats a block, else the harder hitting tool. Ties go to
   * canReplaceEqualItem
   */
  canReplaceCurrentItem(s: ItemStack, cur: ItemStack | null): boolean {
    if (!cur) return true;
    const a = s.item, b = cur.item;
    const sword = (it: Item) => it.tool?.type === 'sword';
    // (vanilla getApproximateAttackDamageWithItem: the same base plus each item's modifier, so the items' damage decides)
    const harder = () => (a.attackDamage !== b.attackDamage ? a.attackDamage > b.attackDamage : this.canReplaceEqualItem(s, cur));
    if (sword(a)) return !sword(b) || harder();
    if ((a.id === 'bow' && b.id === 'bow') || (a.id === 'crossbow' && b.id === 'crossbow')) return this.canReplaceEqualItem(s, cur);
    if (a.armor) {
      if (hasBinding(cur)) return false;
      if (!b.armor) return true;
      if (a.armor.defense !== b.armor.defense) return a.armor.defense > b.armor.defense;
      return a.armor.toughness !== b.armor.toughness ? a.armor.toughness > b.armor.toughness : this.canReplaceEqualItem(s, cur);
    }
    if (isDigger(a)) {
      // (vanilla BlockItem: seeds and the like are block items too)
      if (blockForItem(b)) return true;
      if (isDigger(b)) return harder();
    }
    return false;
  }

  /** vanilla Mob.canReplaceEqualItem: less worn, or carrying data (enchantments, a name, a colour) where the other has none */
  canReplaceEqualItem(s: ItemStack, cur: ItemStack): boolean {
    if (s.damage < cur.damage) return true;
    const extra = (x: ItemStack) => !!x.tag && Object.keys(x.tag).length > 0;
    return extra(s) && !extra(cur);
  }

  /** vanilla LivingEntity.breakItem (onEquippedItemBroken's entity event): the item's snap, heard from the mob */
  breakItem(_s: ItemStack): void {
    this.level.sound.play('entity.item.break', this.x, this.y, this.z, 0.8, 0.8 + Math.random() * 0.4);
  }

  /** wear an armour slot (0 feet .. 3 head) with unbreaking (vanilla ItemStack.hurtAndBreak: thorns' own wear) */
  damageArmorSlot(i: number, amount: number): void {
    const s = this.armorItems[i];
    if (!s?.item.maxDamage) return;
    if (hurtAndBreak(s, amount, false, () => this.random.nextFloat())) {
      this.breakItem(s);
      this.armorItems[i] = null;
    }
  }

  /**
   * vanilla LivingEntity.hurt with #damages_helmet: whatever is on the head takes a quarter off the hit (without
   * wearing: only the player overrides hurtHelmet)
   */
  protected override hurtHelmet(_amount: number): boolean {
    return !!this.armorItems[3];
  }

  /**
   * vanilla Zombie / AbstractSkeleton.aiStep: a sun-burning tick sets the mob alight, unless something is on its
   * head; a helmet takes 0-1 damage instead (straight onto its damage: unbreaking doesn't help) and breaks worn out
   */
  protected burnInSunUnlessHelmeted(): void {
    if (!this.isSunBurnTick()) return;
    const head = this.armorItems[3];
    if (!head) {
      this.igniteForSeconds(8);
      return;
    }
    if (!head.item.maxDamage) return;
    head.damage += this.random.nextInt(2);
    if (head.damage >= head.item.maxDamage) {
      this.breakItem(head);
      this.setItemSlot('head', null);
    }
  }

  /**
   * vanilla Mob.populateDefaultEquipmentSlots: with chance 0.15 × the special multiplier, a suit of one tier
   * (0-1, raised by up to three 9.5% rolls: leather, gold, chain, iron, diamond) from the feet up, each piece after
   * the first ending the suit with chance 0.1 on hard (0.25 otherwise); only empty slots are filled
   */
  protected populateDefaultEquipmentSlots(d: DifficultyInstance): void {
    const r = this.random;
    if (r.nextFloat() >= Math.fround(0.15 * d.specialMultiplier())) return;
    let tier = r.nextInt(2);
    const stop = this.level.difficulty === 'hard' ? 0.1 : 0.25;
    if (r.nextFloat() < 0.095) tier++;
    if (r.nextFloat() < 0.095) tier++;
    if (r.nextFloat() < 0.095) tier++;
    let first = true;
    for (const slot of ARMOR_SLOTS) {
      const cur = this.getItemBySlot(slot);
      if (!first && r.nextFloat() < stop) break;
      first = false;
      if (cur) continue;
      const id = equipmentForSlot(slot, tier);
      const it = id ? ITEMS.get(id) : undefined;
      if (it) this.setItemSlot(slot, new ItemStack(it));
    }
  }

  /** vanilla Mob.populateDefaultEquipmentEnchantments: the weapon with chance 0.25 × special, each armour piece 0.5 × */
  protected populateDefaultEquipmentEnchantments(d: DifficultyInstance): void {
    this.enchantSpawnedWeapon(d);
    for (const slot of ARMOR_SLOTS) this.enchantSpawnedArmor(slot, d);
  }

  protected enchantSpawnedWeapon(d: DifficultyInstance): void {
    this.enchantSpawnedEquipment('mainhand', 0.25, d);
  }

  protected enchantSpawnedArmor(slot: ArmorSlot, d: DifficultyInstance): void {
    this.enchantSpawnedEquipment(slot, 0.5, d);
  }

  /** vanilla Mob.enchantSpawnedEquipment → EnchantmentHelper.enchantItemFromProvider(MOB_SPAWN_EQUIPMENT) */
  private enchantSpawnedEquipment(slot: EquipSlot, chance: number, d: DifficultyInstance): void {
    const s = this.getItemBySlot(slot);
    if (!s || this.random.nextFloat() >= Math.fround(chance * d.specialMultiplier())) return;
    enchantMobSpawnEquipment(s, d.specialMultiplier(), this.random);
    this.setItemSlot(slot, s);
  }

  /**
   * vanilla Zombie / AbstractSkeleton.finalizeSpawn: on Halloween (31 October, by the computer's clock) a quarter
   * come with a carved pumpkin on the head (a tenth of those a jack o'lantern), which never drops
   */
  protected maybeHalloweenPumpkin(): void {
    if (this.armorItems[3]) return;
    const now = new Date();
    if (now.getMonth() !== 9 || now.getDate() !== 31 || this.random.nextFloat() >= 0.25) return;
    const it = ITEMS.get(this.random.nextFloat() < 0.1 ? 'jack_o_lantern' : 'carved_pumpkin');
    if (!it) return;
    this.setItemSlot('head', new ItemStack(it));
    this.armorDropChances[3] = 0;
  }

  // --- sounds ---------------------------------------------------------------

  ambientSoundInterval(): number {
    return 80;
  }
  ambientSound(): string | null {
    return null;
  }
  hurtSound(): string | null {
    return null;
  }
  deathSound(): string | null {
    return null;
  }
  stepSound(): string | null {
    return null;
  }
  soundVolume(): number {
    return 1;
  }
  voicePitch(): number {
    const r = this.random;
    return this.isBaby() ? (r.nextFloat() - r.nextFloat()) * 0.2 + 1.5 : (r.nextFloat() - r.nextFloat()) * 0.2 + 1;
  }

  playSound(name: string, volume: number, pitch: number): void {
    this.level.sound.play(name, this.x, this.y, this.z, volume, pitch);
  }

  playAmbientSound(): void {
    const s = this.ambientSound();
    if (s) this.playSound(s, this.soundVolume(), this.voicePitch());
  }

  protected override playHurtSound(_source: string): void {
    this.ambientSoundTime = -this.ambientSoundInterval();
    const s = this.hurtSound();
    if (s) this.playSound(s, this.soundVolume(), this.voicePitch());
  }

  protected override playDeathSound(): void {
    const s = this.deathSound();
    if (s) this.playSound(s, this.soundVolume(), this.voicePitch());
  }

  protected override makesStepSounds(): boolean {
    return true;
  }

  /** vanilla Entity.waterSwimSound: its splashes as it swims (getSwimSound), louder the faster it goes */
  protected override playSwimSound(): void {
    const v = Math.min(1, Math.sqrt(this.dx * this.dx * 0.2 + this.dy * this.dy + this.dz * this.dz * 0.2) * 0.35);
    this.playSound(this.swimSound(), v, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.4);
  }
  /** vanilla getSwimSound */
  protected swimSound(): string {
    return 'entity.generic.swim';
  }

  protected override playStepSound(): void {
    const s = this.stepSound();
    if (s) {
      this.playSound(s, 0.15, 1);
      return;
    }
    const w = this.level.world;
    const st = w.getState(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
    if (FLAGS[st] & F_WATER) return;
    const b = BLOCKS[STATE_BLOCK[st]];
    this.playSound(`block.${b.sound}.step`, 0.15, 1);
  }

  // --- death, loot, xp ------------------------------------------------------

  lootTable(): LootEntry[] {
    return [];
  }

  /**
   * vanilla Mob.getBaseExperienceReward: base + 1-3 for each piece of equipment still on it (what dropped doesn't
   * count) that it didn't pick up itself (drop chance up to 1), the armour first
   */
  experienceReward(): number {
    let i = this.xpReward;
    if (i <= 0) return i;
    for (let j = 0; j < 4; j++) if (this.armorItems[j] && this.armorDropChances[j] <= 1) i += 1 + this.random.nextInt(3);
    if (this.mainHand && this.handDropChance <= 1) i += 1 + this.random.nextInt(3);
    if (this.offHand && this.offHandDropChance <= 1) i += 1 + this.random.nextInt(3);
    return i;
  }

  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    super.die(source, attacker);
    this.navigation.stop();
    // vanilla Entity.killedEntity: the killer may take the body (a zombie's villager rises): then nothing drops
    if (attacker && !attacker.killedEntity(this)) return;
    const byPlayer = this.lastHurtByPlayerTime > 0;
    // the killer's looting (vanilla ATTACKING_ENTITY: the shooter for arrows)
    const looting = attacker instanceof LivingEntity ? entityLevel(attacker, 'looting') : 0;
    if (this.level.gameRules.doMobLoot) {
      this.dropLoot(byPlayer, looting);
      this.dropCustomDeathLoot(attacker, byPlayer, looting);
      // (vanilla dropCustomDeathLoot: a charged creeper's blast knocks one head off, world/blocksSkulls)
      const head = CHARGED_CREEPER_HEADS[this.type], c = attacker as (Entity & { powered?: boolean; droppedSkulls?: number }) | null;
      if (head && c?.type === 'creeper' && c.powered && (c.droppedSkulls ?? 0) < 1) {
        c.droppedSkulls = (c.droppedSkulls ?? 0) + 1;
        this.spawnAtLocation(ItemStack.of(head));
      }
      if (byPlayer) this.level.awardExperience?.(this.x, this.y, this.z, this.experienceReward());
    }
  }

  /**
   * vanilla Mob.dropCustomDeathLoot: each slot's item with its drop chance, the hands first, then the armour from
   * the feet up. A sure drop (chance over 1: something it picked up) falls as it was, the rest only when a player
   * hit it lately, and heavily worn; looting's equipment_drops adds 1% a level on a player's kill. A chance of 0 (a
   * Halloween pumpkin) never drops, nor does anything with curse of vanishing
   */
  protected dropCustomDeathLoot(attacker: Entity | null, recentlyHit: boolean, looting: number): void {
    for (const slot of EQUIPMENT_SLOTS) {
      let f = this.equipmentDropChance(slot);
      if (f === 0) continue;
      const guaranteed = f > 1;
      if (attacker?.type === 'player') f += 0.01 * looting;
      const s = this.getItemBySlot(slot);
      if (!s || hasVanishing(s) || !(recentlyHit || guaranteed) || this.random.nextFloat() >= f) continue;
      const max = s.item.maxDamage;
      if (!guaranteed && max > 0) s.damage = max - this.random.nextInt(1 + this.random.nextInt(Math.max(max - 3, 1)));
      this.spawnAtLocation(s);
      this.setItemSlot(slot, null);
    }
  }

  /** the loot table; `looting` = the killer's level (vanilla enchanted_count_increase: + round(L × U(0, 1))) */
  protected dropLoot(byPlayer: boolean, looting = 0): void {
    for (const e of this.lootTable()) {
      if (e.player && !byPlayer) continue;
      const chance = looting > 0 && e.lootingChance ? e.lootingChance[0] + e.lootingChance[1] * (looting - 1) : e.chance;
      if (chance !== undefined && this.random.nextFloat() >= chance) continue;
      let n = e.min + this.random.nextInt(e.max - e.min + 1);
      if (!e.noLooting) n += lootingBonus(looting, () => this.random.nextFloat());
      if (e.limit !== undefined) n = Math.min(n, e.limit);
      if (n <= 0) continue;
      const id = e.cooked && this.isOnFire() ? e.cooked : e.item;
      const it = ITEMS.get(id);
      if (it) this.spawnAtLocation(new ItemStack(it, n, 0, e.potion ? { potion: { potion: e.potion } } : null));
    }
  }

  /** vanilla Entity.spawnAtLocation */
  spawnAtLocation(stack: ItemStack, yOffset = 0): ItemEntity {
    const e = new ItemEntity(this.level, stack);
    e.moveTo(this.x, this.y + yOffset, this.z, this.random.nextFloat() * 360, 0);
    e.dx = this.random.nextFloat() * 0.2 - 0.1;
    e.dy = 0.2;
    e.dz = this.random.nextFloat() * 0.2 - 0.1;
    e.pickupDelay = 10;
    this.level.addEntity(e);
    return e;
  }

  protected override tickDeath(): void {
    this.deathTime++;
    if (this.deathTime >= 20 && !this.removed) {
      this.level.particles.poof?.(this);
      this.triggerOnDeathMobEffects();
      this.remove();
    }
  }

  // --- spawning -------------------------------------------------------------

  /** random per-spawn setup (sheep color, baby zombies...); `group` is shared by one spawn pack */
  finalizeSpawn(_reason: SpawnReason, _group?: SpawnGroup): void {}

  /** the DifficultyInstance vanilla hands finalizeSpawn: Level.getCurrentDifficultyAt(the mob's block) */
  protected spawnDifficulty(): DifficultyInstance {
    return currentDifficultyAt(this.level, this.x, this.y, this.z);
  }

  /** vanilla Mob.checkSpawnRules: walk target value must be non-negative */
  checkSpawnRules(): boolean {
    return this.walkTargetValue(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) >= 0;
  }

  /** vanilla getMaxSpawnClusterSize: how many one spawning pass may bring at once */
  maxSpawnClusterSize(): number {
    return 4;
  }

  /** vanilla checkSpawnObstruction: no liquid inside and no collision */
  checkSpawnObstruction(): boolean {
    return this.isFree(this.bb);
  }

  // --- persistence ----------------------------------------------------------

  save(): SavedEntity {
    return {
      id: this.type,
      uuid: this.hasUuid ? this.uuid : undefined,
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      dx: this.dx,
      dy: this.dy,
      dz: this.dz,
      health: this.health,
      fire: this.remainingFireTicks,
      persistent: this.persistenceRequired || undefined,
      hand: this.mainHand ? saveStack(this.mainHand) : null,
      handDrop: this.handDropChance !== DEFAULT_DROP_CHANCE ? this.handDropChance : undefined,
      offhand: this.offHand ? saveStack(this.offHand) : undefined,
      offDrop: this.offHandDropChance !== DEFAULT_DROP_CHANCE ? this.offHandDropChance : undefined,
      armor: this.armorItems.some((a) => a) ? this.armorItems.map((a) => (a ? saveStack(a) : null)) : undefined,
      armorDrop: this.armorDropChances.some((f) => f !== DEFAULT_DROP_CHANCE) ? [...this.armorDropChances] : undefined,
      loot: this.canPickUpLoot,
      data: this.saveData(),
      effects: this.activeEffects.size ? this.saveEffects() : undefined,
      name: this.customName ?? undefined,
      nameVisible: this.customNameVisible || undefined,
      leash: this.saveLeash(),
    };
  }

  /** vanilla Leashable.writeLeashData: the fence's block for a knot, else the holder's uuid (or what's still being looked for) */
  private saveLeash(): SavedLeash | undefined {
    const h = this.leashHolder;
    if (h instanceof LeashKnot) return { x: h.bx, y: h.by, z: h.bz };
    if (h) return { uuid: h.uuid };
    return this.delayedLeash ?? undefined;
  }

  load(d: SavedEntity): void {
    if (typeof d.uuid === 'string') this.uuid = d.uuid;
    this.moveTo(d.x, d.y, d.z, d.yaw, d.pitch);
    this.bodyYaw = this.bodyYawO = this.headYaw = this.headYawO = d.yaw;
    this.dx = d.dx;
    this.dy = d.dy;
    this.dz = d.dz;
    this.loadEffects(d.effects);
    this.health = d.health;
    this.remainingFireTicks = d.fire;
    this.persistenceRequired = !!d.persistent;
    // (straight into the slots: nothing plays on loading)
    this.mainHand = loadStack(d.hand);
    if (typeof d.handDrop === 'number') this.handDropChance = d.handDrop;
    this.offHand = loadStack(d.offhand);
    if (typeof d.offDrop === 'number') this.offHandDropChance = d.offDrop;
    for (let i = 0; i < 4; i++) {
      this.armorItems[i] = loadStack(d.armor?.[i]);
      this.armorDropChances[i] = d.armorDrop?.[i] ?? DEFAULT_DROP_CHANCE;
    }
    // (vanilla reads CanPickUpLoot only when it's there: older saves keep the mob's own default)
    if (typeof d.loot === 'boolean') this.canPickUpLoot = d.loot;
    if (typeof d.name === 'string') this.setCustomName(d.name);
    this.customNameVisible = d.nameVisible === true;
    if (d.leash && typeof d.leash === 'object') this.delayedLeash = d.leash;
    if (d.data) this.loadData(d.data);
  }

  protected saveData(): Record<string, number | string | boolean> | undefined {
    return undefined;
  }
  protected loadData(_d: Record<string, number | string | boolean>): void {}

  /**
   * /summon's entity data (vanilla readAdditionalSaveData): whichever of the mob's own saved values it's given (the
   * names matched whatever their case: vanilla's Color is our color), each read as the kind it keeps (1b for true, a
   * "minecraft:" name as the plain name), over what it has
   */
  readSummonData(given: Record<string, number | string | boolean>): void {
    const own = this.saveData();
    if (!own) return;
    const names = new Map(Object.keys(given).map((k) => [k.toLowerCase(), k]));
    const d = { ...own };
    let any = false;
    for (const [k, was] of Object.entries(own)) {
      const g = names.get(k.toLowerCase());
      if (g === undefined) continue;
      const v = given[g];
      if (typeof was === 'boolean') d[k] = typeof v === 'number' ? v !== 0 : v === true || v === 'true';
      else if (typeof was === 'number') d[k] = typeof v === 'boolean' ? +v : Number(v);
      else d[k] = String(v).replace(/^minecraft:/, '');
      any = true;
    }
    if (any) this.loadData(d);
  }
}

/** vanilla Entity.isAlive: not removed, and a living thing not dead */
function isAliveEntity(e: Entity): boolean {
  return !e.removed && (!(e instanceof LivingEntity) || e.isAlive);
}

function rotlerpSimple(from: number, to: number, max: number): number {
  let f = to - from;
  while (f < -180) f += 360;
  while (f >= 180) f -= 360;
  return from + Math.max(-max, Math.min(max, f));
}

/** vanilla PathfinderMob: land mobs with a walk-target preference */
export abstract class PathfinderMob extends Mob {}

/** vanilla NaturalSpawner.isValidEmptySpawnBlock */
export function isValidEmptySpawnBlock(st: number): boolean {
  const f = FLAGS[st];
  if (f & F_FULL_COLLISION) return false;
  if (f & (F_WATER | F_LAVA)) return false;
  const n = BLOCKS[STATE_BLOCK[st]].name;
  if (n.endsWith('rail') || n === 'fire' || n === 'cactus' || n === 'sweet_berry_bush' || n === 'wither_rose' || n === 'powder_snow' || n === 'redstone_wire') return false;
  return true;
}
