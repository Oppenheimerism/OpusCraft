// The pillager and the vindicator (vanilla Pillager, Vindicator): illagers of the patrols, outposts and raids. The
// pillager keeps its crossbow on whoever it's after from up to 8 blocks — drawing, holding it loaded a second or two,
// shooting — and has a five-slot pack for the white banners it picks up in raids; the vindicator swings an iron axe,
// breaks down doors in a raid, and one named Johnny goes for everything. Both wear the captain's banner on patrol.

import { AbstractIllager, HoldGroundAttackGoal, RaiderOpenDoorGoal, RaiderHurtByTargetGoal, LookAtMobGoal, isVillagerTarget, raidHooks, ILLAGER_TYPES, type IllagerArmPose, type RaiderSpawnReason } from './raider';
import type { SpawnGroup } from './mob';
import type { Level } from '../game/level';
import { LivingEntity } from './living';
import { ItemEntity } from './itemEntity';
import { Goal, Flag } from './ai/goal';
import { FloatGoal, RandomStrollGoal, LookAtPlayerGoal, MeleeAttackGoal, NearestAttackablePlayerGoal, NearestAttackableMobGoal, BreakDoorGoal } from './ai/goals';
import { ItemStack, saveStack, loadStack, type SavedStack } from '../item/item';
import { setCraftingEnchants, craftingEnchants } from '../item/enchantHelper';
import { isCrossbow, chargeDuration, releaseUsing, performShooting, MOB_ARROW_POWER, mobInaccuracy } from '../item/crossbow';
import type { DifficultyInstance } from '../game/difficulty';

/** vanilla EntityType ridingOffset(-0.6F) for the illagers: they sit that far down in the saddle */
const RIDING_OFFSET = 0.6;

/** (vanilla VanillaEnchantmentProviders' SingleEnchantment: this one enchantment at this level) */
function enchantWith(s: ItemStack, id: string, level: number): void {
  setCraftingEnchants(s, { ...craftingEnchants(s), [id]: level });
}

// ---------------------------------------------------------------------------
// pillager

/**
 * vanilla RangedCrossbowAttackGoal: close in until the target's within 8 blocks and has been seen a quarter of a
 * second (at half speed while drawing), then draw, hold it loaded 1-2 s and shoot when in sight; round again
 */
class RangedCrossbowAttackGoal extends Goal {
  private state: 'uncharged' | 'charging' | 'charged' | 'ready' = 'uncharged';
  private seeTime = 0;
  private attackDelay = 0;
  private updatePathDelay = 0;
  private readonly attackRadiusSqr: number;
  constructor(readonly mob: Pillager, readonly speedModifier: number, attackRadius: number) {
    super();
    this.attackRadiusSqr = attackRadius * attackRadius;
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    return this.isValidTarget() && this.isHoldingCrossbow();
  }
  private isHoldingCrossbow(): boolean {
    return isCrossbow(this.mob.mainHand) || isCrossbow(this.mob.offHand);
  }
  override canContinueToUse(): boolean {
    return this.isValidTarget() && (this.canUse() || !this.mob.navigation.isDone()) && this.isHoldingCrossbow();
  }
  private isValidTarget(): boolean {
    const t = this.mob.target;
    return t !== null && t.isAlive;
  }
  override start(): void {
    this.mob.aggressive = true;
  }
  /** vanilla stop: no longer aggressive nor after its target; one being drawn is let down */
  override stop(): void {
    const m = this.mob;
    m.aggressive = false;
    m.setTarget(null);
    this.seeTime = 0;
    if (m.usingItem) {
      m.stopUsingItem();
      m.chargingCrossbow = false;
    }
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const m = this.mob, t = m.target;
    if (!t) return;
    const see = m.sensing.hasLineOfSight(t);
    if (see !== this.seeTime > 0) this.seeTime = 0;
    if (see) this.seeTime++;
    else this.seeTime--;
    const d0 = m.distanceToSqr(t.x, t.y, t.z);
    const closeIn = (d0 > this.attackRadiusSqr || this.seeTime < 5) && this.attackDelay === 0;
    if (closeIn) {
      if (--this.updatePathDelay <= 0) {
        m.navigation.moveToEntity(t, this.state === 'uncharged' ? this.speedModifier : this.speedModifier * 0.5);
        // (vanilla PATHFINDING_DELAY_RANGE: UniformInt 20-40)
        this.updatePathDelay = 20 + m.random.nextInt(21);
      }
    } else {
      this.updatePathDelay = 0;
      m.navigation.stop();
    }
    m.lookControl.setLookAtEntity(t, 30, 30);
    const s = isCrossbow(m.mainHand) ? m.mainHand : m.offHand;
    if (this.state === 'uncharged') {
      if (!closeIn) {
        m.startUsingItem();
        this.state = 'charging';
        m.chargingCrossbow = true;
      }
    } else if (this.state === 'charging') {
      if (!m.usingItem) this.state = 'uncharged';
      if (m.useItemTicks >= chargeDuration(s)) {
        // (vanilla releaseUsingItem → CrossbowItem.releaseUsing: loaded with an arrow, a monster never short of them)
        if (s) releaseUsing(m.level, m, s, m.useItemTicks);
        m.stopUsingItem();
        this.state = 'charged';
        this.attackDelay = 20 + m.random.nextInt(20);
        m.chargingCrossbow = false;
      }
    } else if (this.state === 'charged') {
      if (--this.attackDelay === 0) this.state = 'ready';
    } else if (this.state === 'ready' && see) {
      m.performRangedAttack(t, 1);
      this.state = 'uncharged';
    }
  }
}

export class Pillager extends AbstractIllager {
  readonly type = 'pillager';
  /** vanilla IS_CHARGING_CROSSBOW */
  chargingCrossbow = false;
  /** vanilla Pillager.inventory: a SimpleContainer of 5 */
  readonly inventory: (ItemStack | null)[] = [null, null, null, null, null];

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    this.maxHealth = this.health = 24;
    this.moveSpeedAttr = 0.35;
    this.attackDamage = 5;
    this.followRange = 32;
  }

  override get eyeHeight(): number {
    return 1.62;
  }
  override vehicleAttachmentY(): number {
    return RIDING_OFFSET;
  }

  protected override registerGoals(): void {
    super.registerGoals();
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(2, new HoldGroundAttackGoal(this, 10));
    this.goalSelector.addGoal(3, new RangedCrossbowAttackGoal(this, 1, 8));
    this.goalSelector.addGoal(8, new RandomStrollGoal(this, 0.6));
    this.goalSelector.addGoal(9, new LookAtPlayerGoal(this, 15, 1));
    this.goalSelector.addGoal(10, new LookAtMobGoal(this, 15));
    this.targetSelector.addGoal(1, new RaiderHurtByTargetGoal(this, true));
    this.targetSelector.addGoal(2, new NearestAttackablePlayerGoal(this, true));
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, isVillagerTarget, false));
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, (e) => e.type === 'iron_golem', true));
  }

  /** vanilla Pillager.getWalkTargetValue: anywhere will do (so an outpost's pillagers spawn by day too) */
  override walkTargetValue(): number {
    return 0;
  }

  /** vanilla Pillager.getMaxSpawnClusterSize: they spawn one at a time */
  override maxSpawnClusterSize(): number {
    return 1;
  }

  /** vanilla Pillager.getArmPose */
  override armPose(): IllagerArmPose {
    if (this.chargingCrossbow) return 'crossbow_charge';
    if (isCrossbow(this.mainHand) || isCrossbow(this.offHand)) return 'crossbow_hold';
    return this.aggressive ? 'attacking' : 'neutral';
  }

  /** vanilla Pillager.finalizeSpawn: its crossbow, maybe enchanted */
  override finalizeSpawn(reason: RaiderSpawnReason, group?: SpawnGroup): void {
    const d = this.spawnDifficulty();
    this.populateDefaultEquipmentSlots(d);
    this.populateDefaultEquipmentEnchantments(d);
    super.finalizeSpawn(reason, group);
  }

  protected override populateDefaultEquipmentSlots(_d: DifficultyInstance): void {
    this.setItemSlot('mainhand', ItemStack.of('crossbow'));
  }

  /** vanilla Pillager.enchantSpawnedWeapon: one in 300 has piercing I (PILLAGER_SPAWN_CROSSBOW) */
  protected override enchantSpawnedWeapon(d: DifficultyInstance): void {
    super.enchantSpawnedWeapon(d);
    if (this.random.nextInt(300) === 0) {
      const s = this.mainHand;
      if (s?.item.id === 'crossbow') enchantWith(s, 'piercing', 1);
    }
  }

  /**
   * vanilla Pillager.applyRaidBuffs: with the raid's enchant odds, a new crossbow — quick charge I after the third
   * wave, II after the fifth (the waves of an easy and a normal raid)
   */
  applyRaidBuffs(wave: number, _unused: boolean): void {
    const raid = this.raid;
    if (!raid || this.random.nextFloat() > raid.enchantOdds()) return;
    const s = ItemStack.of('crossbow');
    let level = 0;
    if (wave > raid.numGroups('normal')) level = 2;
    else if (wave > raid.numGroups('easy')) level = 1;
    if (level > 0) {
      enchantWith(s, 'quick_charge', level);
      this.setItemSlot('mainhand', s);
    }
  }

  /** vanilla performRangedAttack → CrossbowAttackMob.performCrossbowAttack(1.6): the loaded crossbow fires */
  performRangedAttack(t: LivingEntity, _power: number): void {
    const s = isCrossbow(this.mainHand) ? this.mainHand : this.offHand;
    if (s) performShooting(this.level, this, s, MOB_ARROW_POWER, mobInaccuracy(this.level), t);
    // vanilla onCrossbowAttackPerformed
    this.noActionTime = 0;
  }

  /** vanilla Pillager.wantsItem: in a raid, white banners (to put in its pack) */
  private wantsItem(s: ItemStack): boolean {
    return this.hasActiveRaid() && s.item.id === 'white_banner';
  }

  /**
   * vanilla Pillager.pickUpItem: banners as any raider takes them (the captain's on its head); what else it wants goes
   * into its pack, as much as fits
   */
  protected override pickUpItem(it: ItemEntity): void {
    const s = it.stack;
    if (s.item.id.endsWith('_banner')) super.pickUpItem(it);
    else if (this.wantsItem(s)) {
      this.onItemPickup(it);
      const rest = this.addToInventory(s.copy());
      if (!rest) it.remove();
      else s.count = rest.count;
    }
  }

  /** vanilla SimpleContainer.addItem: onto matching stacks, then into empty slots; returns what's left */
  private addToInventory(s: ItemStack): ItemStack | null {
    for (const cur of this.inventory) {
      if (!cur || !cur.sameItem(s)) continue;
      const n = Math.min(s.count, cur.item.maxStack - cur.count);
      cur.count += n;
      s.count -= n;
      if (s.count <= 0) return null;
    }
    for (let i = 0; i < this.inventory.length; i++) {
      if (this.inventory[i]) continue;
      this.inventory[i] = s;
      return null;
    }
    return s;
  }

  celebrateSound(): string {
    return 'entity.pillager.celebrate';
  }
  override ambientSound(): string {
    return 'entity.pillager.ambient';
  }
  override hurtSound(): string {
    return 'entity.pillager.hurt';
  }
  override deathSound(): string {
    return 'entity.pillager.death';
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const inv = this.inventory.map((s) => (s ? saveStack(s) : null));
    const d: Record<string, number | string | boolean> = { ...super.saveData() };
    if (inv.some((s) => s)) d.Inventory = JSON.stringify(inv);
    return d;
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.Inventory === 'string') {
      const list = JSON.parse(d.Inventory) as (SavedStack | null)[];
      for (let i = 0; i < this.inventory.length; i++) this.inventory[i] = loadStack(list[i]);
    }
  }
}

// ---------------------------------------------------------------------------
// vindicator

/**
 * vanilla Vindicator.VindicatorBreakDoorGoal: in a raid (on normal or hard), a vindicator stopped by a wooden door
 * breaks it down (vanilla asks for 6 ticks, which BreakDoorGoal's floor of 240 makes the usual 12 s)
 */
class VindicatorBreakDoorGoal extends BreakDoorGoal {
  constructor(readonly vindicator: Vindicator) {
    super(vindicator, (d) => d === 'normal' || d === 'hard', 6);
    this.flags = Flag.MOVE;
  }
  override canContinueToUse(): boolean {
    return this.vindicator.hasActiveRaid() && super.canContinueToUse();
  }
  override canUse(): boolean {
    const v = this.vindicator;
    return v.hasActiveRaid() && v.random.nextInt(Math.ceil(10 / 2)) === 0 && super.canUse();
  }
  override start(): void {
    super.start();
    this.vindicator.noActionTime = 0;
  }
}

export class Vindicator extends AbstractIllager {
  readonly type = 'vindicator';
  /** vanilla isJohnny: named "Johnny", it attacks any living thing but its own */
  johnny = false;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    this.maxHealth = this.health = 24;
    this.moveSpeedAttr = 0.35;
    this.attackDamage = 5;
    this.followRange = 12;
  }

  override get eyeHeight(): number {
    return 1.62;
  }
  override vehicleAttachmentY(): number {
    return RIDING_OFFSET;
  }

  protected override registerGoals(): void {
    super.registerGoals();
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new VindicatorBreakDoorGoal(this));
    this.goalSelector.addGoal(2, new RaiderOpenDoorGoal(this));
    this.goalSelector.addGoal(3, new HoldGroundAttackGoal(this, 10));
    // (vanilla VindicatorMeleeAttackGoal: in 1.21 an ordinary MeleeAttackGoal, the reach from the mount's box too)
    this.goalSelector.addGoal(4, new MeleeAttackGoal(this, 1, false));
    this.targetSelector.addGoal(1, new RaiderHurtByTargetGoal(this, true));
    this.targetSelector.addGoal(2, new NearestAttackablePlayerGoal(this, true));
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, isVillagerTarget, true));
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, (e) => e.type === 'iron_golem', true));
    // vanilla VindicatorJohnnyAttackGoal: NearestAttackableTargetGoal<LivingEntity>(0, true, true, attackable), for Johnny
    // (TargetingConditions leaves out its allies, the illagers; and the player goes through the player goal above)
    this.targetSelector.addGoal(4, new NearestAttackableMobGoal(this, (e) => e.type !== 'player' && e.type !== 'armor_stand' && !ILLAGER_TYPES.has(e.type), true, 0, () => this.johnny));
    this.goalSelector.addGoal(8, new RandomStrollGoal(this, 0.6));
    this.goalSelector.addGoal(9, new LookAtPlayerGoal(this, 3, 1));
    this.goalSelector.addGoal(10, new LookAtMobGoal(this, 8));
  }

  /** vanilla Vindicator.customServerAiStep: it goes through doors only where there's a raid */
  protected override customServerAiStep(): void {
    this.navigation.canOpenDoors = raidHooks.isRaided(this.level, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    super.customServerAiStep();
  }

  /** vanilla Vindicator.getArmPose: its axe up when fighting, cheering, or arms folded */
  override armPose(): IllagerArmPose {
    if (this.aggressive) return 'attacking';
    return this.celebrating ? 'celebrating' : 'crossed';
  }

  /** vanilla Vindicator.finalizeSpawn: an iron axe (not one raised for a raid: that gets its axe from its wave) */
  override finalizeSpawn(reason: RaiderSpawnReason, group?: SpawnGroup): void {
    super.finalizeSpawn(reason, group);
    this.navigation.canOpenDoors = true;
    const d = this.spawnDifficulty();
    this.populateDefaultEquipmentSlots(d);
    this.populateDefaultEquipmentEnchantments(d);
  }

  protected override populateDefaultEquipmentSlots(_d: DifficultyInstance): void {
    if (this.raid === null) this.setItemSlot('mainhand', ItemStack.of('iron_axe'));
  }

  /** vanilla Vindicator.applyRaidBuffs: an iron axe, with the raid's enchant odds sharpness I (II after the fifth wave) */
  applyRaidBuffs(wave: number, _unused: boolean): void {
    const s = ItemStack.of('iron_axe');
    const raid = this.raid;
    if (raid && this.random.nextFloat() <= raid.enchantOdds()) enchantWith(s, 'sharpness', wave > raid.numGroups('normal') ? 2 : 1);
    this.setItemSlot('mainhand', s);
  }

  /** vanilla setCustomName: "Johnny" */
  setCustomName(name: string | null): void {
    if (!this.johnny && name === 'Johnny') this.johnny = true;
  }

  celebrateSound(): string {
    return 'entity.vindicator.celebrate';
  }
  override ambientSound(): string {
    return 'entity.vindicator.ambient';
  }
  override hurtSound(): string {
    return 'entity.vindicator.hurt';
  }
  override deathSound(): string {
    return 'entity.vindicator.death';
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData() };
    if (this.johnny) d.Johnny = true;
    return d;
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (d.Johnny === true) this.johnny = true;
  }
}
