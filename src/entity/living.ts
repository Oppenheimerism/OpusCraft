// LivingEntity: vanilla travel() physics, jumping, health, hurt/death, status effects.

import { Entity } from './entity';
import type { Hand } from '../item/inventory';
import { FLUID_WATER, fluidType } from '../world/fluids';
import { wrapDegrees } from '../core/math';
import { FLAGS, F_AIR, F_OPAQUE, F_FULL_COLLISION, BLOCKS, STATE_BLOCK } from '../world/block';
import { clipBlocks } from '../game/raycast';
import { MobEffectInstance, SavedEffect, saveEffect, loadEffect } from './effects';
import { burningTimeFactor, damageAfterProtection, damageProtection, waterMovementEfficiency } from '../item/enchantHelper';
import { AABB } from '../core/aabb';
import { HEAD_DISGUISES } from '../world/blocksSkulls';
import type { ItemStack } from '../item/item';
// (Stage 4: shields)
import { shieldTakesHit, shieldBlocked } from './shield';
import { checkTotemDeathProtection } from './totem';
import { travelFallFlying, updateFallFlying } from './elytra';

/** damage sources that ignore armor (vanilla #bypasses_armor) */
const BYPASSES_ARMOR = new Set(['onFire', 'inWall', 'drown', 'starve', 'fall', 'stalagmite', 'void', 'genericKill', 'magic', 'indirectMagic', 'wither', 'generic', 'cramming', 'flyIntoWall']);
/** damage sources that never knock back (vanilla #no_knockback) */
const NO_KNOCKBACK = new Set(['explosion', 'playerExplosion', 'badRespawnPoint', 'fall', 'stalagmite', 'drown', 'starve', 'onFire', 'inFire', 'campfire', 'lava', 'lightningBolt', 'inWall', 'void', 'genericKill', 'magic', 'wither', 'cactus', 'sweetBerryBush', 'generic']);
/** vanilla #bypasses_resistance */
const BYPASSES_RESISTANCE = new Set(['void', 'genericKill']);
/** vanilla #damages_helmet */
const DAMAGES_HELMET = new Set(['anvil', 'fallingBlock', 'fallingStalactite']);
export const FIRE_SOURCES = new Set(['onFire', 'inFire', 'campfire', 'lava', 'hotFloor', 'fireball']);
/** vanilla Player.getDestroySpeed: mining fatigue multiplier per amplifier (capped at IV) */
const FATIGUE_DIG = [0.3, 0.09, 0.0027, 8.1e-4];

/** vanilla CombatRules.getDamageAfterAbsorb */
export function damageAfterArmor(damage: number, armor: number, toughness: number): number {
  const f = 2 + toughness / 4;
  const f1 = Math.max(armor * 0.2, Math.min(20, armor - damage / f));
  return damage * (1 - f1 / 25);
}

export abstract class LivingEntity extends Entity {
  health = 20;
  /** MAX_HEALTH base value; `maxHealth` adds health boost */
  private baseMaxHealth = 20;
  hurtTime = 0;
  hurtDuration = 10;
  deathTime = 0;
  lastHurt = 0;
  /** strafe (left +), vertical, forward inputs */
  xxa = 0;
  yya = 0;
  zza = 0;
  jumping = false;
  noJumpDelay = 0;
  speed = 0.1; // movement speed attribute (base)
  sprinting = false;
  bodyYaw = 0;
  bodyYawO = 0;
  headYaw = 0;
  headYawO = 0;
  /** limb swing animation */
  walkAnimSpeed = 0;
  walkAnimSpeedO = 0;
  walkAnimPos = 0;
  attackAnim = 0;
  attackAnimO = 0;
  swingTime = 0;
  swinging = false;
  absorption = 0;
  noActionTime = 0;
  lastHurtByPlayerTime = 0;
  /** vanilla hurtDir: yaw of the damage source relative to facing (camera tilt) */
  hurtDir = 0;
  /** vanilla lastHurtByMob (cleared after 100 ticks) */
  lastHurtByMob: LivingEntity | null = null;
  lastHurtByMobTimestamp = 0;
  lastHurtByPlayer: LivingEntity | null = null;
  /** vanilla lastDamageSource and lastDamageStamp: what last hurt it, and when */
  lastDamageSource: string | null = null;
  lastDamageStamp = -1000;
  /** vanilla getLastDamageSource: forgotten after 40 ticks */
  recentDamageSource(): string | null {
    return this.level.gameTime - this.lastDamageStamp > 40 ? null : this.lastDamageSource;
  }
  private lastHurtMobValue: LivingEntity | null = null;
  /** vanilla lastHurtMobTimestamp: when it last hurt something (setLastHurtMob) */
  lastHurtMobTimestamp = 0;
  /** vanilla lastHurtMob: the last thing it hurt (setting it is vanilla setLastHurtMob, which notes when) */
  get lastHurtMob(): LivingEntity | null {
    return this.lastHurtMobValue;
  }
  set lastHurtMob(e: LivingEntity | null) {
    this.lastHurtMobValue = e;
    if (e) this.lastHurtMobTimestamp = this.tickCount;
  }
  /** who dealt the killing blow and how (death messages, loot) */
  killer: Entity | null = null;
  /** vanilla autoSpinAttackTicks: ticks left of a riptide spin */
  autoSpinAttackTicks = 0;
  /** (Stage 4: the outer End) vanilla shared flag 7: gliding on an elytra (entity/elytra.ts) */
  fallFlying = false;
  /** vanilla fallFlyTicks: how long it's been gliding */
  fallFlyTicks = 0;
  /** vanilla autoSpinAttackDmg: what the spin hits for */
  autoSpinAttackDmg = 0;
  /** vanilla autoSpinAttackItemStack: the trident it spins with */
  autoSpinAttackItem: ItemStack | null = null;
  deathSource = '';
  dead = false;
  /** vanilla activeEffects */
  readonly activeEffects = new Map<string, MobEffectInstance>();
  private effectsDirty = true;
  /** vanilla DATA_EFFECT_PARTICLES (ARGB per visible effect, or an effect's own particle) and DATA_EFFECT_AMBIENCE_ID */
  private effectParticles: (number | string)[] = [];
  private effectsAmbient = false;

  constructor(level: Entity['level']) {
    super(level);
    this.stepHeight = 0.6;
  }

  get isAlive(): boolean {
    return !this.removed && this.health > 0;
  }

  /** vanilla MAX_HEALTH attribute: base + 4 per health boost level */
  get maxHealth(): number {
    const b = this.effectAmp('health_boost');
    return this.baseMaxHealth + (b >= 0 ? 4 * (b + 1) : 0);
  }

  set maxHealth(v: number) {
    this.baseMaxHealth = v;
  }

  /** effective movement speed (sprint modifier +30%, speed / slowness) */
  movementSpeed(): number {
    return Math.max(0, this.speed * (this.sprinting ? 1.3 : 1) * this.speedEffectFactor());
  }

  flyingSpeed(): number {
    return this.sprinting ? 0.025999999 : 0.02;
  }

  jumpPower(): number {
    return 0.42 * this.blockJumpFactor() + this.jumpBoostPower();
  }

  /** vanilla getJumpBoostPower */
  jumpBoostPower(): number {
    const a = this.effectAmp('jump_boost');
    return a >= 0 ? 0.1 * (a + 1) : 0;
  }

  blockJumpFactor(): number {
    return 1;
  }

  /** vanilla LivingEntity.onBelowWorld: the void hurts, 4 at a time whatever the armour (tried every tick, landing each half second) */
  protected override onBelowWorld(): void {
    if (this.health > 0) this.hurt(4, 'void');
  }

  override baseTick(): void {
    super.baseTick();
    this.bodyYawO = this.bodyYaw;
    this.headYawO = this.headYaw;
    if (this.health > 0 && this.isInWall()) this.hurt(1, 'inWall');
    if (this.lastHurtByPlayerTime > 0) this.lastHurtByPlayerTime--;
    else this.lastHurtByPlayer = null;
    if (this.lastHurtMobValue && !this.lastHurtMobValue.isAlive) this.lastHurtMobValue = null;
    if (this.lastHurtByMob) {
      if (!this.lastHurtByMob.isAlive || this.tickCount - this.lastHurtByMobTimestamp > 100) this.lastHurtByMob = null;
    }
    this.tickEffects();
  }

  // --- status effects (vanilla LivingEntity effect handling) -----------------

  hasEffect(id: string): boolean {
    return this.activeEffects.has(id);
  }

  getEffect(id: string): MobEffectInstance | undefined {
    return this.activeEffects.get(id);
  }

  /** amplifier of an active effect, -1 without it */
  effectAmp(id: string): number {
    return this.activeEffects.get(id)?.amplifier ?? -1;
  }

  /** vanilla canBeAffected: undead ignore poison and regeneration (#ignores_poison_and_regen) */
  canBeAffected(inst: MobEffectInstance): boolean {
    return !(this.isUndead() && (inst.id === 'regeneration' || inst.id === 'poison'));
  }

  /** vanilla #undead: healed by instant damage, harmed by instant health */
  isUndead(): boolean {
    return false;
  }

  /** vanilla isSensitiveToWater: water hurts it (endermen, blazes, striders), a splash of it too */
  isSensitiveToWater(): boolean {
    return false;
  }

  /** vanilla isAffectedByPotions: splashes and clouds pass over the dead (and spectators) */
  isAffectedByPotions(): boolean {
    return this.health > 0 && !this.dead;
  }

  /** vanilla LivingEntity.addEffect: add, or merge into the active instance (MobEffectInstance.update) */
  addEffect(inst: MobEffectInstance, _source: Entity | null = null): boolean {
    if (!this.canBeAffected(inst)) return false;
    const cur = this.activeEffects.get(inst.id);
    let changed = false;
    if (!cur) {
      this.activeEffects.set(inst.id, inst);
      this.onEffectAdded(inst);
      changed = true;
    } else if (cur.update(inst)) {
      this.onEffectUpdated(cur, true);
      changed = true;
    }
    inst.effect.onStarted(this, inst.amplifier);
    return changed;
  }

  removeEffect(id: string): boolean {
    const inst = this.activeEffects.get(id);
    if (!inst) return false;
    this.activeEffects.delete(id);
    this.onEffectRemoved(inst);
    return true;
  }

  /** vanilla removeAllEffects (milk, /effect clear); false if there were none */
  removeAllEffects(): boolean {
    if (!this.activeEffects.size) return false;
    const all = [...this.activeEffects.values()];
    this.activeEffects.clear();
    for (const inst of all) this.onEffectRemoved(inst);
    return true;
  }

  protected onEffectAdded(_inst: MobEffectInstance): void {
    this.effectsDirty = true;
  }

  protected onEffectUpdated(_inst: MobEffectInstance, forced: boolean): void {
    this.effectsDirty = true;
    if (forced) this.onEffectAttributesChanged();
  }

  protected onEffectRemoved(_inst: MobEffectInstance): void {
    this.effectsDirty = true;
    this.onEffectAttributesChanged();
  }

  /** vanilla onAttributeUpdated: health and absorption can't exceed their new maximums */
  private onEffectAttributesChanged(): void {
    if (this.health > this.maxHealth) this.health = this.maxHealth;
    if (this.absorption > this.maxAbsorption()) this.absorption = this.maxAbsorption();
  }

  /** vanilla LivingEntity.tickEffects */
  protected tickEffects(): void {
    for (const [id, inst] of this.activeEffects) {
      if (!inst.tick(this, () => this.onEffectUpdated(inst, true))) {
        if (this.activeEffects.get(id) === inst) {
          this.activeEffects.delete(id);
          this.onEffectRemoved(inst);
        }
      } else if (inst.duration % 600 === 0) this.onEffectUpdated(inst, false);
    }
    if (this.effectsDirty) {
      // vanilla updateInvisibilityStatus → updateSynchronizedMobEffectParticles
      this.effectParticles = [];
      this.effectsAmbient = true;
      for (const inst of this.activeEffects.values()) {
        if (!inst.visible) continue;
        this.effectParticles.push(inst.effect.particle ?? ((inst.ambient ? 38 : 255) << 24 | inst.effect.color) >>> 0);
        if (!inst.ambient) this.effectsAmbient = false;
      }
      this.effectsDirty = false;
    }
    // swirls in a visible effect's colour: rarer when invisible, rarer and fainter when all are ambient
    if (this.effectParticles.length && !this.hidesEffectParticles()) {
      const i = this.isInvisible() ? 15 : 4, j = this.effectsAmbient ? 5 : 1;
      if (Math.floor(Math.random() * i * j) === 0) {
        const c = this.effectParticles[Math.floor(Math.random() * this.effectParticles.length)];
        const x = this.x + this.width * (2 * Math.random() - 1) * 0.5, y = this.y + this.height * Math.random(), z = this.z + this.width * (2 * Math.random() - 1) * 0.5;
        if (typeof c === 'string') this.level.particles.spawn?.(c, x, y, z, 1, 1, 1);
        else this.level.particles.entityEffect?.(x, y, z, c & 0xffffff, (c >>> 24) / 255);
      }
    }
  }

  saveEffects(): SavedEffect[] {
    return [...this.activeEffects.values()].map(saveEffect);
  }

  /** restore saved effects (vanilla readAdditionalSaveData: before health, so health boost holds) */
  loadEffects(list: SavedEffect[] | undefined): void {
    for (const d of list ?? []) {
      const inst = loadEffect(d);
      if (inst) {
        inst.skipBlending();
        this.activeEffects.set(inst.id, inst);
      }
    }
    this.effectsDirty = true;
  }

  /** vanilla speed / slowness MOVEMENT_SPEED modifiers (ADD_MULTIPLIED_TOTAL, +20% / -15% per level) */
  speedEffectFactor(): number {
    const s = this.effectAmp('speed'), sl = this.effectAmp('slowness');
    return (s >= 0 ? 1 + 0.2 * (s + 1) : 1) * (sl >= 0 ? 1 - 0.15 * (sl + 1) : 1);
  }

  /** vanilla ATTACK_DAMAGE with strength (+3 per level) and weakness (-4 per level) */
  effectAttackDamage(base: number): number {
    const s = this.effectAmp('strength'), w = this.effectAmp('weakness');
    return Math.max(0, Math.min(2048, base + (s >= 0 ? 3 * (s + 1) : 0) - (w >= 0 ? 4 * (w + 1) : 0)));
  }

  /** vanilla ATTACK_SPEED haste (+10%) / mining fatigue (-10%) modifiers per level */
  attackSpeedEffectFactor(): number {
    const h = this.effectAmp('haste'), f = this.effectAmp('mining_fatigue');
    return Math.max(0, (h >= 0 ? 1 + 0.1 * (h + 1) : 1) * (f >= 0 ? 1 - 0.1 * (f + 1) : 1));
  }

  /**
   * vanilla Player.getDestroySpeed effect part: haste +20% per level, mining fatigue 0.3^level; (Stage 5: ocean) conduit
   * power counts as haste (vanilla MobEffectUtil.getDigSpeedAmplification: the higher of the two)
   */
  digSpeedEffectFactor(): number {
    const h = Math.max(this.effectAmp('haste'), this.effectAmp('conduit_power')), f = this.effectAmp('mining_fatigue');
    return (h >= 0 ? 1 + (h + 1) * 0.2 : 1) * (f >= 0 ? FATIGUE_DIG[Math.min(f, 3)] : 1);
  }

  /** vanilla MAX_ABSORPTION: 4 per absorption level */
  maxAbsorption(): number {
    const a = this.effectAmp('absorption');
    return a >= 0 ? 4 * (a + 1) : 0;
  }

  /** vanilla LUCK attribute (luck +1, bad luck -1 per level) */
  luck(): number {
    const l = this.effectAmp('luck'), u = this.effectAmp('unluck');
    return (l >= 0 ? l + 1 : 0) - (u >= 0 ? u + 1 : 0);
  }

  /** vanilla SAFE_FALL_DISTANCE: 3, +1 per jump boost level */
  safeFallDistance(): number {
    return 3 + this.effectAmp('jump_boost') + 1;
  }

  /** vanilla isInvisible (the invisibility effect) */
  isInvisible(): boolean {
    return this.activeEffects.has('invisibility');
  }

  /** (vanilla ServerPlayer.updateInvisibilityStatus: a spectator's effects give off no swirls) */
  protected hidesEffectParticles(): boolean {
    return false;
  }

  /** vanilla MobEffectUtil.hasWaterBreathing ((Stage 5: ocean) conduit power too) */
  hasWaterBreathing(): boolean {
    return this.activeEffects.has('water_breathing') || this.activeEffects.has('conduit_power');
  }

  /** vanilla isDiscrete (sneaking) */
  isDiscrete(): boolean {
    return false;
  }

  /** vanilla getArmorCoverPercentage */
  armorCoverPercentage(): number {
    return 0;
  }

  /** vanilla getVisibilityPercent: how far away mobs notice this entity */
  visibilityPercent(looker: Entity | null): number {
    let d = 1;
    if (this.isDiscrete()) d *= 0.8;
    if (this.isInvisible()) d *= 0.7 * Math.max(0.1, this.armorCoverPercentage());
    // (wearing the looker's own kind of head: world/blocksSkulls)
    if (looker) {
      // (a player's armour is in its inventory; a villager's or a llama's inventory has none)
      const worn = this as { inventory?: { armor?: (ItemStack | null)[] }; armorItems?: (ItemStack | null)[] };
      const head = worn.inventory?.armor?.[3] ?? worn.armorItems?.[3];
      if (head && HEAD_DISGUISES[looker.type] === head.item.id) d *= 0.5;
    }
    return d;
  }

  /** vanilla Player.causeFoodExhaustion (hunger effect) */
  causeFoodExhaustion(_v: number): void {}

  /** vanilla isInWall: eyes inside a suffocating block */
  isInWall(): boolean {
    if (this.noPhysics) return false;
    const f = this.width * 0.8;
    const ey = this.y + this.eyeHeight;
    const x0 = Math.floor(this.x - f / 2), x1 = Math.floor(this.x + f / 2);
    const z0 = Math.floor(this.z - f / 2), z1 = Math.floor(this.z + f / 2);
    const y0 = Math.floor(ey - 5e-7), y1 = Math.floor(ey + 5e-7);
    const w = this.level.world;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const fl = FLAGS[w.getState(x, y, z)];
          if (fl & F_OPAQUE && fl & F_FULL_COLLISION) return true;
        }
    return false;
  }

  /** vanilla LivingEntity.hasLineOfSight: eye-to-eye collider clip */
  hasLineOfSight(e: Entity): boolean {
    const ex = this.x, ey = this.y + this.eyeHeight, ez = this.z;
    const tx = e.x, ty = e instanceof LivingEntity ? e.y + e.eyeHeight : (e.bb.minY + e.bb.maxY) / 2, tz = e.z;
    const dx = tx - ex, dy = ty - ey, dz = tz - ez;
    if (dx * dx + dy * dy + dz * dz > 128 * 128) return false;
    return clipBlocks(this.level.world, ex, ey, ez, tx, ty, tz) === null;
  }

  setLastHurtByMob(e: LivingEntity | null): void {
    this.lastHurtByMob = e;
    this.lastHurtByMobTimestamp = this.tickCount;
  }

  override isPickable(): boolean {
    return !this.removed && this.health > 0;
  }

  override isPushable(): boolean {
    return this.isAlive;
  }

  /** vanilla pushEntities → doPush: overlapping pushable entities (mobs, minecarts) get pushed apart */
  protected pushEntities(): void {
    const list = this.level.getEntities(this.bb, (e) => e.isPushable(), this);
    for (const e of list) e.pushAgainst(this);
  }

  /** vanilla LivingEntity.stopRiding: step off where the vehicle says */
  override stopRiding(): void {
    const v = this.vehicle;
    super.stopRiding();
    if (v && v !== this.vehicle) this.dismountVehicle(v);
  }

  /** vanilla dismountVehicle: if the vehicle is gone, stays put (no lower than the vehicle was) */
  dismountVehicle(v: Entity): void {
    if (this.removed) return;
    const [x, y, z] = v.removed ? [this.x, Math.max(this.y, v.y), this.z] : v.dismountLocation(this);
    this.moveTo(x, y, z);
  }

  /** bounding-box heights this can get off in, best first (vanilla getDismountPoses) */
  dismountHeights(): number[] {
    return [this.height];
  }

  /** got off in the pose of that height (vanilla setPose) */
  setDismountHeight(_h: number): void {}

  override rideTick(): void {
    super.rideTick();
    this.fallDistance = 0;
  }

  /** vanilla swimAmount: how far into its swimming pose it is (0 to 1, 0.09 a tick) */
  swimAmount = 0;
  swimAmountO = 0;

  /** vanilla isVisuallySwimming: posed as swimming */
  isVisuallySwimming(): boolean {
    return false;
  }

  /** vanilla updateSwimAmount */
  private updateSwimAmount(): void {
    this.swimAmountO = this.swimAmount;
    this.swimAmount = this.isVisuallySwimming() ? Math.min(1, this.swimAmount + 0.09) : Math.max(0, this.swimAmount - 0.09);
  }

  /** vanilla getSwimAmount */
  swimAmountAt(p: number): number {
    return this.swimAmountO + (this.swimAmount - this.swimAmountO) * p;
  }

  override tick(): void {
    super.tick();
    this.updateSwimAmount();
    this.aiStep();
    // (Stage 4: the outer End) vanilla LivingEntity.tick: how long it's been gliding
    this.fallFlyTicks = this.fallFlying ? this.fallFlyTicks + 1 : 0;
    this.updateBodyRotation();
    this.updateWalkAnimation();
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.health <= 0) this.tickDeath();
    this.updateSwing();
  }

  protected updateSwing(): void {
    this.attackAnimO = this.attackAnim;
    const dur = this.swingDuration();
    if (this.swinging) {
      this.swingTime++;
      if (this.swingTime >= dur) {
        this.swingTime = 0;
        this.swinging = false;
      }
    } else this.swingTime = 0;
    this.attackAnim = this.swingTime / dur;
  }

  /** vanilla getCurrentSwingDuration: haste ((Stage 5: ocean) or conduit power) swings faster, mining fatigue slower */
  swingDuration(): number {
    const h = Math.max(this.effectAmp('haste'), this.effectAmp('conduit_power')), f = this.effectAmp('mining_fatigue');
    if (h >= 0) return Math.max(1, 6 - (1 + h));
    return f >= 0 ? 6 + (1 + f) * 2 : 6;
  }

  /** vanilla swingingArm: the hand the current swing is with */
  swingingArm: Hand = 'main';

  swing(hand: Hand = 'main'): void {
    if (!this.swinging || this.swingTime >= this.swingDuration() / 2 || this.swingTime < 0) {
      this.swingTime = -1;
      this.swinging = true;
      this.swingingArm = hand;
    }
  }

  protected tickDeath(): void {
    this.deathTime++;
    if (this.deathTime >= 20 && !this.removed) {
      this.triggerOnDeathMobEffects();
      this.remove();
    }
  }

  aiStep(): void {
    if (this.noJumpDelay > 0) this.noJumpDelay--;
    if (Math.abs(this.dx) < 0.003) this.dx = 0;
    if (Math.abs(this.dy) < 0.003) this.dy = 0;
    if (Math.abs(this.dz) < 0.003) this.dz = 0;
    if (this.isImmobile()) {
      this.jumping = false;
      this.xxa = 0;
      this.zza = 0;
    } else this.serverAiStep();
    if (this.jumping) {
      const fh = this.inLava ? this.fluidHeightLava : this.fluidHeightWater;
      const inFluid = (this.inWater && fh > 0) || this.inLava;
      if (inFluid && (!this.onGround || fh > 0.4)) {
        this.jumpInLiquid();
      } else if ((this.onGround || (inFluid && fh <= 0.4)) && this.noJumpDelay === 0) {
        this.jumpFromGround();
        this.noJumpDelay = 10;
      }
    } else this.noJumpDelay = 0;
    this.xxa *= 0.98;
    this.zza *= 0.98;
    updateFallFlying(this);
    // vanilla: slow falling and levitation keep resetting the fall
    if (this.hasEffect('slow_falling') || this.hasEffect('levitation')) this.fallDistance = 0;
    // vanilla: a player steering this mount drives it (travelRidden); anything else travels on its own
    const rider = this.controllingPassenger();
    const before = this.autoSpinAttackTicks > 0 ? this.bb.clone() : null;
    if (rider instanceof LivingEntity && rider.type === 'player' && this.isAlive) this.travelRidden(rider, this.xxa, this.yya, this.zza);
    else this.travel(this.xxa, this.yya, this.zza);
    if (before && this.autoSpinAttackTicks > 0) {
      this.autoSpinAttackTicks--;
      this.checkAutoSpinAttack(before, this.bb);
    }
    this.pushEntities();
  }

  /** vanilla startAutoSpinAttack: a riptide trident sends it spinning for `ticks`, hitting for `damage` */
  startAutoSpinAttack(ticks: number, damage: number, item: ItemStack): void {
    this.autoSpinAttackTicks = ticks;
    this.autoSpinAttackDmg = damage;
    this.autoSpinAttackItem = item;
  }

  /** vanilla isAutoSpinAttack */
  isAutoSpinAttack(): boolean {
    return this.autoSpinAttackTicks > 0;
  }

  /**
   * vanilla checkAutoSpinAttack: the first living thing in the space swept this tick takes the spin's hit, which
   * ends it and bounces the spinner back a little; with nothing about, running into a wall ends it
   */
  protected checkAutoSpinAttack(before: AABB, after: AABB): void {
    const box = new AABB(Math.min(before.minX, after.minX), Math.min(before.minY, after.minY), Math.min(before.minZ, after.minZ), Math.max(before.maxX, after.maxX), Math.max(before.maxY, after.maxY), Math.max(before.maxZ, after.maxZ));
    const list = this.level.getEntities(box, (e) => !(e.type === 'player' && (e as { gameMode?: string }).gameMode === 'spectator'), this);
    if (list.length) {
      for (const e of list) {
        if (!(e instanceof LivingEntity)) continue;
        this.doAutoAttackOnTouch(e);
        this.autoSpinAttackTicks = 0;
        this.dx *= -0.2;
        this.dy *= -0.2;
        this.dz *= -0.2;
        break;
      }
    } else if (this.horizontalCollision) this.autoSpinAttackTicks = 0;
    if (this.autoSpinAttackTicks <= 0) {
      this.autoSpinAttackDmg = 0;
      this.autoSpinAttackItem = null;
    }
  }

  /** vanilla doAutoAttackOnTouch: what a spin does to what it runs into (a player attacks it) */
  protected doAutoAttackOnTouch(_target: LivingEntity): void {}

  isImmobile(): boolean {
    return this.health <= 0;
  }

  /**
   * vanilla LivingEntity.travelRidden: the mount turns and moves as its rider wants (tickRidden, getRiddenInput) at
   * its ridden speed, stepping up a full block while a player has the reins (vanilla maxUpStep)
   */
  protected travelRidden(p: LivingEntity, sx: number, sy: number, sz: number): void {
    const [ix, iy, iz] = this.riddenInput(p, sx, sy, sz);
    this.tickRidden(p, ix, iy, iz);
    this.speed = this.riddenSpeed(p);
    const step = this.stepHeight;
    this.stepHeight = Math.max(step, 1);
    this.travel(ix, iy, iz);
    this.stepHeight = step;
  }

  /** vanilla tickRidden: the mount's own bookkeeping while ridden (facing the rider's way) */
  protected tickRidden(_p: LivingEntity, _sx: number, _sy: number, _sz: number): void {}

  /** vanilla getRiddenInput: the movement the rider asks for */
  protected riddenInput(_p: LivingEntity, sx: number, sy: number, sz: number): [number, number, number] {
    return [sx, sy, sz];
  }

  /** vanilla getRiddenSpeed */
  protected riddenSpeed(_p: LivingEntity): number {
    return this.movementSpeed();
  }

  /** AI / input hook (mob goals, player input) */
  protected serverAiStep(): void {}

  protected jumpInLiquid(): void {
    this.dy += 0.04;
  }

  jumpFromGround(): void {
    this.dy = this.jumpPower();
    if (this.sprinting) {
      const f = (this.yaw * Math.PI) / 180;
      this.dx += -Math.sin(f) * 0.2;
      this.dz += Math.cos(f) * 0.2;
    }
  }

  /** vanilla getInputVector + add to motion */
  protected moveRelative(amount: number, sx: number, sy: number, sz: number): void {
    const d0 = sx * sx + sy * sy + sz * sz;
    if (d0 < 1e-7) return;
    let len = 1;
    if (d0 > 1) len = Math.sqrt(d0);
    sx = (sx / len) * amount;
    sy = (sy / len) * amount;
    sz = (sz / len) * amount;
    const f = Math.sin((this.yaw * Math.PI) / 180), f1 = Math.cos((this.yaw * Math.PI) / 180);
    this.dx += sx * f1 - sz * f;
    this.dy += sy;
    this.dz += sz * f1 + sx * f;
  }

  protected gravity(): number {
    return 0.08;
  }

  travel(sx: number, sy: number, sz: number): void {
    let g = this.gravity();
    const falling = this.dy <= 0;
    // vanilla: slow falling caps gravity on the way down
    if (falling && this.hasEffect('slow_falling')) g = Math.min(g, 0.01);
    // vanilla: a fluid it can stand on (a strider's lava) doesn't swim it, it walks
    const fluidHere = fluidType(this.level.world.getState(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)));
    const standsOnFluid = this.canStandOnFluid(fluidHere);
    if (this.inWater && this.isAffectedByFluids() && !standsOnFluid) {
      const y0 = this.y;
      let slow = this.sprinting ? 0.9 : this.waterSlowDown();
      let f5 = 0.02;
      // WATER_MOVEMENT_EFFICIENCY (depth strider), half as strong off the ground
      let f6 = waterMovementEfficiency(this);
      if (!this.onGround) f6 *= 0.5;
      if (f6 > 0) {
        slow += (0.54600006 - slow) * f6;
        f5 += (this.movementSpeed() - f5) * f6;
      }
      // (Stage 5: ocean) vanilla: Dolphin's Grace keeps the speed you have in the water
      if (this.hasEffect('dolphins_grace')) slow = 0.96;
      this.moveRelative(f5, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      if (this.horizontalCollision && this.onClimbable()) this.dy = 0.2;
      this.dx *= slow;
      this.dy *= 0.8;
      this.dz *= slow;
      this.dy = this.fluidFallingAdjusted(g, falling, this.dy);
      if (this.horizontalCollision && this.isFree(this.bb.move(this.dx, this.dy + 0.6 - this.y + y0, this.dz))) this.dy = 0.3;
    } else if (this.inLava && this.isAffectedByFluids() && !standsOnFluid) {
      const y0 = this.y;
      this.moveRelative(0.02, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      if (this.fluidHeightLava <= 0.4) {
        this.dx *= 0.5;
        this.dy *= 0.8;
        this.dz *= 0.5;
        this.dy = this.fluidFallingAdjusted(g, falling, this.dy);
      } else {
        this.dx *= 0.5;
        this.dy *= 0.5;
        this.dz *= 0.5;
      }
      if (g !== 0) this.dy += -g / 4;
      if (this.horizontalCollision && this.isFree(this.bb.move(this.dx, this.dy + 0.6 - this.y + y0, this.dz))) this.dy = 0.3;
    } else if (this.fallFlying) {
      // (Stage 4: the outer End) gliding on an elytra (entity/elytra.ts)
      travelFallFlying(this, g);
    } else {
      const friction = this.blockFriction();
      const f3 = this.onGround ? friction * 0.91 : 0.91;
      const speed = this.onGround ? this.movementSpeed() * (0.21600002 / (friction * friction * friction)) : this.flyingSpeed();
      this.moveRelative(speed, sx, sy, sz);
      this.handleOnClimbable();
      this.move(this.dx, this.dy, this.dz);
      if ((this.horizontalCollision || this.jumping) && this.onClimbable()) this.dy = 0.2;
      let d2 = this.dy;
      // vanilla: levitation eases vertical speed toward 0.05 per level instead of falling
      const lev = this.effectAmp('levitation');
      if (lev >= 0) d2 += (0.05 * (lev + 1) - this.dy) * 0.2;
      else if (!this.noGravity()) d2 -= g;
      this.dx *= f3;
      this.dy = d2 * 0.98;
      this.dz *= f3;
    }
  }

  noGravity(): boolean {
    return false;
  }

  protected handleOnClimbable(): void {
    if (!this.onClimbable()) return;
    this.fallDistance = 0;
    const lim = 0.15000000596046448;
    this.dx = Math.max(-lim, Math.min(lim, this.dx));
    this.dz = Math.max(-lim, Math.min(lim, this.dz));
    let d2 = Math.max(this.dy, -lim);
    if (d2 < 0 && this.isSuppressingSlidingDown()) d2 = 0;
    this.dy = d2;
  }

  protected isSuppressingSlidingDown(): boolean {
    return false;
  }

  protected fluidFallingAdjusted(g: number, falling: boolean, dy: number): number {
    if (g !== 0 && !this.sprinting) {
      if (falling && Math.abs(dy - 0.005) >= 0.003 && Math.abs(dy - g / 16) < 0.003) return -0.003;
      return dy - g / 16;
    }
    return dy;
  }

  waterSlowDown(): number {
    return 0.8;
  }

  isAffectedByFluids(): boolean {
    return true;
  }

  protected updateBodyRotation(): void {
    const d0 = this.x - this.xo, d1 = this.z - this.zo;
    const f = d0 * d0 + d1 * d1;
    let f1 = this.bodyYaw;
    if (f > 0.0025000002) {
      const f3 = (Math.atan2(d1, d0) * 180) / Math.PI - 90;
      f1 = f3;
    }
    if (this.attackAnim > 0) f1 = this.yaw;
    // vanilla tickHeadTurn
    const f2 = wrapDegrees(f1 - this.bodyYaw);
    this.bodyYaw += f2 * 0.3;
    let f4 = wrapDegrees(this.yaw - this.bodyYaw);
    if (Math.abs(f4) > 75) {
      this.bodyYaw = this.yaw - Math.sign(f4) * 75;
      f4 = wrapDegrees(this.yaw - this.bodyYaw);
    }
    this.headYaw = this.yaw;
  }

  protected updateWalkAnimation(): void {
    const dx = this.x - this.xo, dz = this.z - this.zo;
    const dist = Math.sqrt(dx * dx + dz * dz);
    let f = Math.min(dist * 4, 1);
    this.walkAnimSpeedO = this.walkAnimSpeed;
    this.walkAnimSpeed += (f - this.walkAnimSpeed) * 0.4;
    this.walkAnimPos += this.walkAnimSpeed;
    void f;
  }

  /** damage sources this entity ignores */
  /** fire damage the fireproof (or fire resistant) ignore (vanilla isInvulnerableTo / the fire resistance check) */
  protected shrugsOffFire(source: string, _attacker?: Entity | null, _direct?: Entity | null): boolean {
    return FIRE_SOURCES.has(source) && (this.fireImmune() || this.hasEffect('fire_resistance'));
  }

  isInvulnerableTo(_source: string): boolean {
    return false;
  }

  armorValue(): number {
    return 0;
  }

  armorToughness(): number {
    return 0;
  }

  /** wear armor pieces (players) */
  protected hurtArmor(_amount: number): void {}

  knockbackResistance(): number {
    return 0;
  }

  /** vanilla LivingEntity.checkFallDamage: a hard landing kicks up a burst of the block below */
  protected override checkFallDamage(dy: number, onGround: boolean): void {
    const safe = this.safeFallDistance();
    if (onGround && this.fallDistance > safe && !this.inWater) {
      const bx = Math.floor(this.x), by = Math.floor(this.y - 0.2), bz = Math.floor(this.z);
      const st = this.level.world.getState(bx, by, bz);
      if (!(FLAGS[st] & F_AIR)) {
        const f = Math.ceil(this.fallDistance - safe);
        const count = Math.floor(150 * Math.min(0.2 + f / 15, 2.5));
        const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
        for (let i = 0; i < count; i++) this.level.particles.blockParticle?.(this.x, this.y, this.z, gauss() * 0.15, gauss() * 0.15, gauss() * 0.15, st, bx, by, bz);
      }
    }
    super.checkFallDamage(dy, onGround);
  }

  /** vanilla CobwebBlock.entityInside: weaving lets its bearer through at twice the pace */
  protected override insideCobweb(): void {
    if (this.hasEffect('weaving')) this.makeStuckInBlock(0.5, 0.25, 0.5);
    else super.insideCobweb();
  }

  /** vanilla SweetBerryBushBlock.entityInside: slows, and pricks anything that moves in a grown bush */
  protected override insideBerryBush(st: number): void {
    if (this.type === 'fox' || this.type === 'bee') return;
    this.makeStuckInBlock(0.8, 0.75, 0.8);
    if (BLOCKS[STATE_BLOCK[st]].get<number>(st, 'age') > 0 && (this.xo !== this.x || this.zo !== this.z)) {
      const mx = Math.abs(this.x - this.xo), mz = Math.abs(this.z - this.zo);
      if (mx >= 0.003 || mz >= 0.003) this.hurt(1, 'sweetBerryBush');
    }
  }

  /**
   * vanilla LivingEntity.hurt: invulnerability frames, armor, knockback, hurt/death
   * sounds. `attacker` is the entity responsible, `direct` the projectile if any.
   */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isInvulnerableTo(source) || this.removed || this.health <= 0) return false;
    if (this.shrugsOffFire(source, attacker, direct)) return false;
    this.noActionTime = 0;
    if (amount < 0) amount = 0;
    // (Stage 4: shields) vanilla isDamageSourceBlocked: a raised shield takes the hit, which goes on at 0 (entity/shield.ts)
    const blocked = amount > 0 && shieldTakesHit(this, amount, source, attacker, direct);
    if (blocked) amount = 0;
    // falling anvils, blocks and stalactites wear the helmet, which takes a quarter off the hit
    if (DAMAGES_HELMET.has(source) && this.hurtHelmet(amount)) amount *= 0.75;
    let fresh = true;
    // (vanilla BYPASSES_COOLDOWN: the void waits its turn like anything else — 4 every half second)
    if (this.invulnerableTime > 10 && source !== 'genericKill') {
      if (amount <= this.lastHurt) return false;
      this.actuallyHurt(source, amount - this.lastHurt);
      this.lastHurt = amount;
      fresh = false;
    } else {
      this.lastHurt = amount;
      this.invulnerableTime = 20;
      this.actuallyHurt(source, amount);
      // (Stage 4: shields) a blocked hit's client sees event 29, not the damage event: no red flash
      if (!blocked) this.hurtTime = this.hurtDuration = 10;
    }
    this.lastDamageSource = source;
    this.lastDamageStamp = this.level.gameTime;
    if (attacker instanceof LivingEntity && attacker !== this) {
      this.setLastHurtByMob(attacker);
      if (attacker.type === 'player') {
        this.lastHurtByPlayerTime = 100;
        this.lastHurtByPlayer = attacker;
      }
    }
    // (Stage 4: shields) the shield's thud instead of knockback and the hurt sound; nothing was hurt
    if (blocked) return shieldBlocked(this, source);
    if (fresh) {
      this.hurtDir = 0;
      if (!NO_KNOCKBACK.has(source) && (attacker || direct)) {
        let kx: number, kz: number;
        if (direct && direct !== attacker && direct.type !== 'area_effect_cloud') {
          kx = -direct.dx;
          kz = -direct.dz;
        } else {
          // (vanilla getSourcePosition: where the direct cause is — a lingering cloud's middle)
          const src = direct ?? attacker!;
          kx = src.x - this.x;
          kz = src.z - this.z;
        }
        this.knockback(0.4, kx, kz);
        // vanilla indicateDamage
        this.hurtDir = (Math.atan2(kz, kx) * 180) / Math.PI - this.yaw;
      }
      this.onHurt(source);
    }
    // (Stage 4: totems) vanilla checkTotemDeathProtection: a totem in hand takes the death (entity/totem.ts), and
    // then there's no hurt sound either
    const dying = this.health <= 0;
    if (dying && !checkTotemDeathProtection(this, source)) {
      // (vanilla DamageSource: the causing entity, else the direct one: an ownerless cloud or potion)
      this.killer = attacker ?? direct ?? null;
      this.deathSource = source;
      if (fresh) this.playDeathSound();
      this.die(source, attacker ?? null);
    } else if (fresh && !dying) this.playHurtSound(source);
    // vanilla MobEffectInstance.onMobHurt for each effect it has (infested's silverfish)
    for (const inst of [...this.activeEffects.values()]) inst.effect.onMobHurt?.(this, inst.amplifier, source, amount);
    return true;
  }

  /**
   * vanilla LivingEntity.remove(KILLED) → triggerOnDeathMobEffects: the death animation over, each effect's last
   * word (oozing's slimes, weaving's webs, a wind burst), then they're gone
   */
  protected triggerOnDeathMobEffects(): void {
    const all = [...this.activeEffects.values()];
    for (const inst of all) inst.effect.onMobRemoved?.(this, inst.amplifier);
    this.activeEffects.clear();
    this.effectsDirty = true;
  }

  protected actuallyHurt(source: string, amount: number): void {
    if (!BYPASSES_ARMOR.has(source)) {
      this.hurtArmor(amount);
      amount = damageAfterArmor(amount, this.armorValue(), this.armorToughness());
    }
    this.applyDamage(this.damageAfterMagicAbsorb(source, amount));
  }

  /**
   * vanilla getDamageAfterMagicAbsorb: resistance blocks 20% per level, then the protection enchantments 4% per
   * point (at most 20 points); starvation bypasses both
   */
  protected damageAfterMagicAbsorb(source: string, amount: number): number {
    if (source === 'starve') return amount;
    const r = this.effectAmp('resistance');
    if (r >= 0 && !BYPASSES_RESISTANCE.has(source)) amount = Math.max((amount * (25 - (r + 1) * 5)) / 25, 0);
    if (amount <= 0) return 0;
    const f = damageProtection(this, source);
    return f > 0 ? damageAfterProtection(amount, f) : amount;
  }

  /** vanilla hurtHelmet: wear whatever is on the head; false when nothing is */
  protected hurtHelmet(_amount: number): boolean {
    return false;
  }

  /** vanilla LivingEntity.igniteForTicks: the BURNING_TIME attribute (fire protection) shortens it */
  override igniteForSeconds(s: number): void {
    const t = Math.ceil(Math.floor(s * 20) * burningTimeFactor(this));
    if (this.remainingFireTicks < t) this.remainingFireTicks = t;
  }

  /** vanilla LivingEntity.take: tell the client this picked something up (it pops, and flies to them) */
  take(e: Entity, amount: number): void {
    if (!e.removed) this.level.onTake?.(e, this, amount);
  }

  protected playHurtSound(_source: string): void {}
  protected playDeathSound(): void {}

  protected onHurt(_source: string): void {}

  protected applyDamage(amount: number): void {
    const a = Math.min(this.absorption, amount);
    this.absorption -= a;
    amount -= a;
    this.health = Math.max(0, this.health - amount);
  }

  knockback(strength: number, x: number, z: number): void {
    strength *= 1 - this.knockbackResistance();
    if (strength <= 0) return;
    while (x * x + z * z < 1e-5) {
      x = (Math.random() - Math.random()) * 0.01;
      z = (Math.random() - Math.random()) * 0.01;
    }
    const l = Math.sqrt(x * x + z * z);
    const kx = (x / l) * strength, kz = (z / l) * strength;
    this.dx = this.dx / 2 - kx;
    this.dz = this.dz / 2 - kz;
    this.dy = this.onGround ? Math.min(0.4, this.dy / 2 + strength) : this.dy;
  }

  die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    this.dead = true;
    this.deathTime = 0;
    this.level.onEntityDied?.(this, source, attacker);
  }

  heal(amount: number): void {
    if (this.health > 0) this.health = Math.min(this.maxHealth, this.health + amount);
  }

  protected override causeFallDamage(dist: number): void {
    // vanilla PointedDripstoneBlock.fallOn: landing on a stalagmite's tip hurts twice as much, from 2.5 blocks higher
    const on = this.level.world.getState(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
    const b = BLOCKS[STATE_BLOCK[on]];
    const stalagmite = b.name === 'pointed_dripstone' && b.get(on, 'vertical_direction') === 'up' && b.get(on, 'thickness') === 'tip';
    const dmg = stalagmite ? Math.ceil((dist + 2.5 - this.safeFallDistance()) * 2) : Math.ceil(dist - this.safeFallDistance());
    if (dmg > 0) {
      this.onFallDamage(dmg, dist);
      this.hurt(dmg, stalagmite ? 'stalagmite' : 'fall');
    }
  }

  protected onFallDamage(_dmg: number, _dist: number): void {}

  isInFluidEye(): boolean {
    return this.eyeFluid === FLUID_WATER;
  }
}
