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
import { ItemStack, ITEMS, SavedStack, saveStack, loadStack } from '../item/item';
import { ItemEntity } from './itemEntity';
import { AABB } from '../core/aabb';
import { Rand } from '../core/rng';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER } from '../world/block';
import { FLUID_WATER } from '../world/fluids';
import type { SavedEffect } from './effects';
import { damageBonus, entityLevel, hasVanishing, levelOf, lootingBonus } from '../item/enchantHelper';
import { doPostAttackEffects } from '../game/enchantEffects';
import { crossbowUseTick } from '../item/crossbow';

export type MobCategory = 'monster' | 'creature' | 'ambient' | 'water_creature' | 'misc';

export interface SavedEntity {
  id: string;
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
  data?: Record<string, number | string | boolean>;
  /** vanilla active_effects */
  effects?: SavedEffect[];
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
}

export type SpawnReason = 'natural' | 'chunk' | 'egg' | 'command' | 'breeding' | 'spawner' | 'jockey';

/** vanilla SpawnGroupData: what one spawn pack's members pass along to each other */
export interface SpawnGroup {
  /** vanilla AgeableMob.AgeableMobGroupData: members so far, and the odds each after the first is a baby */
  ageable?: { size: number; babyChance: number };
}

export abstract class Mob extends LivingEntity {
  abstract readonly category: MobCategory;
  readonly goalSelector = new GoalSelector();
  readonly targetSelector = new GoalSelector();
  readonly lookControl: LookControl;
  private ownMoveControl: MoveControl;
  private readonly ownJumpControl: JumpControl;
  readonly bodyControl: BodyRotationControl;
  /** this mob's own navigation (goals use `navigation`, which is the mount's while this steers one) */
  readonly ownNavigation: PathNavigation;
  readonly sensing: Sensing;
  readonly random = new Rand((Math.random() * 0x7fffffff) | 0);
  target: LivingEntity | null = null;
  persistenceRequired = false;
  ambientSoundTime = 0;
  xpReward = 0;
  followRange = 16;
  private baseAttackDamage = 2;
  attackKnockback = 0;
  private baseMoveSpeed = 0.25;
  baseArmor = 0;
  kbResist = 0;
  aggressive = false;
  mainHand: ItemStack | null = null;
  handDropChance = 0.085;
  air = 300;
  usingItem = false;
  useItemTicks = 0;
  private malusOverrides: Map<PathType, number> | null = null;
  private goalsReady = false;

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

  /** vanilla Mob.getControllingPassenger: a mob up front steers (not a slime) */
  override controllingPassenger(): Entity | null {
    const p = this.passengers[0];
    return p instanceof Mob && p.type !== 'slime' && p.type !== 'magma_cube' ? p : null;
  }

  /** vanilla Mob.updateControlFlags: a mob steering this one takes its moving, jumping and looking goals */
  private updateControlFlags(): void {
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

  /** MOVEMENT_SPEED attribute value: assign the base, read it with speed / slowness applied */
  get moveSpeedAttr(): number {
    return Math.max(0, this.baseMoveSpeed * this.speedEffectFactor());
  }
  set moveSpeedAttr(v: number) {
    this.baseMoveSpeed = v;
  }

  headRotSpeed(): number {
    return 10;
  }
  maxHeadXRot(): number {
    return 40;
  }
  maxHeadYRot(): number {
    return 75;
  }
  override armorValue(): number {
    return this.baseArmor;
  }
  override knockbackResistance(): number {
    return this.kbResist;
  }
  isBaby(): boolean {
    return false;
  }
  canBreatheUnderwater(): boolean {
    return false;
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
    if (this.tickCount % 5 === 0) this.updateControlFlags();
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
    if (d0 > 128 * 128 && this.removeWhenFarAway(d0)) {
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

  /** vanilla getExperienceReward: base + 1-3 per equipped item */
  experienceReward(): number {
    let i = this.xpReward;
    if (i > 0 && this.mainHand) i += 1 + this.random.nextInt(3);
    return i;
  }

  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    super.die(source, attacker);
    this.navigation.stop();
    const byPlayer = this.lastHurtByPlayerTime > 0;
    // the killer's looting (vanilla ATTACKING_ENTITY: the shooter for arrows)
    const looting = attacker instanceof LivingEntity ? entityLevel(attacker, 'looting') : 0;
    if (this.level.gameRules.doMobLoot) {
      this.dropLoot(byPlayer, looting);
      // vanilla dropCustomDeathLoot: looting's equipment_drops (+1% per level, player kills only); curse of
      // vanishing items never drop
      const chance = this.handDropChance + (attacker?.type === 'player' ? 0.01 * looting : 0);
      if (this.mainHand && !hasVanishing(this.mainHand) && this.random.nextFloat() < chance) {
        const s = this.mainHand;
        if (s.item.maxDamage) s.damage = s.item.maxDamage - 1 - this.random.nextInt(Math.max(1, s.item.maxDamage - 3));
        this.spawnAtLocation(s);
        this.mainHand = null;
      }
      if (byPlayer) this.level.awardExperience?.(this.x, this.y, this.z, this.experienceReward());
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
      if (n <= 0) continue;
      const id = e.cooked && this.isOnFire() ? e.cooked : e.item;
      const it = ITEMS.get(id);
      if (it) this.spawnAtLocation(new ItemStack(it, n));
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
      this.remove();
    }
  }

  // --- spawning -------------------------------------------------------------

  /** random per-spawn setup (sheep color, baby zombies...); `group` is shared by one spawn pack */
  finalizeSpawn(_reason: SpawnReason, _group?: SpawnGroup): void {}

  /** vanilla Mob.checkSpawnRules: walk target value must be non-negative */
  checkSpawnRules(): boolean {
    return this.walkTargetValue(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) >= 0;
  }

  /** vanilla checkSpawnObstruction: no liquid inside and no collision */
  checkSpawnObstruction(): boolean {
    return this.isFree(this.bb);
  }

  // --- persistence ----------------------------------------------------------

  save(): SavedEntity {
    return {
      id: this.type,
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
      data: this.saveData(),
      effects: this.activeEffects.size ? this.saveEffects() : undefined,
    };
  }

  load(d: SavedEntity): void {
    this.moveTo(d.x, d.y, d.z, d.yaw, d.pitch);
    this.bodyYaw = this.bodyYawO = this.headYaw = this.headYawO = d.yaw;
    this.dx = d.dx;
    this.dy = d.dy;
    this.dz = d.dz;
    this.loadEffects(d.effects);
    this.health = d.health;
    this.remainingFireTicks = d.fire;
    this.persistenceRequired = !!d.persistent;
    this.mainHand = loadStack(d.hand);
    if (d.data) this.loadData(d.data);
  }

  protected saveData(): Record<string, number | string | boolean> | undefined {
    return undefined;
  }
  protected loadData(_d: Record<string, number | string | boolean>): void {}
}

function rotlerpSimple(from: number, to: number, max: number): number {
  let f = to - from;
  while (f < -180) f += 360;
  while (f >= 180) f -= 360;
  return from + Math.max(-max, Math.min(max, f));
}

/** vanilla PathfinderMob: land mobs with a walk-target preference */
export abstract class PathfinderMob extends Mob {}
