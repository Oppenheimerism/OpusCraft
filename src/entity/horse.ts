// Horses, donkeys and mules (vanilla 1.21 AbstractHorse, Horse, AbstractChestedHorse, Donkey, Mule). Herds of horses
// in the plains and savannas, in seven coats with five kinds of markings, every one with its own health, speed and
// jumping strength; donkeys among them. Climb on a wild one and it bucks and rears until, as its temper rises with
// each try (and with every treat you feed it), it lets you stay: tamed. Saddle a tame one to ride it: it goes where
// you look, the jump key charges a leap, and it gallops. A horse can wear armour; a donkey or a mule can carry a
// chest. Golden carrots and golden apples bring two tame ones to breed, the foal's strengths somewhere between its
// parents'; a horse and a donkey have a mule.

import { Animal, BreedGoal, FollowParentGoal, TemptGoal } from './animals';
import type { Level } from '../game/level';
import type { LootEntry, SpawnGroup, SpawnReason } from './mob';
import { Flag, Goal } from './ai/goal';
import { FloatGoal, LookAtPlayerGoal, PanicGoal, RandomLookAroundGoal, WaterAvoidingRandomStrollGoal, defaultRandomPos } from './ai/goals';
import { LivingEntity } from './living';
import type { Entity } from './entity';
import type { Player } from './player';
import { ItemStack } from '../item/item';
import { SimpleContainer } from '../inventory/container';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_LAVA } from '../world/block';
import { AABB } from '../core/aabb';
import { floorHeight, blockFree } from './dismount';
import type { Rand } from '../core/rng';

/** vanilla Horse.Variant, in id order */
export const HORSE_COLORS = ['white', 'creamy', 'chestnut', 'brown', 'black', 'gray', 'dark_brown'] as const;
/** vanilla Markings, in id order */
export const HORSE_MARKINGS = ['none', 'white', 'white_field', 'white_dots', 'black_dots'] as const;
export type HorseColor = (typeof HORSE_COLORS)[number];
export type HorseMarkings = (typeof HORSE_MARKINGS)[number];

/** vanilla AbstractHorse attribute ranges */
const MIN_HEALTH = 15, MAX_HEALTH = 30, MIN_JUMP = 0.4, MAX_JUMP = 1.0, MIN_SPEED = 0.1125, MAX_SPEED = 0.3375;
/** vanilla #horse_food */
const HORSE_FOOD = new Set(['wheat', 'sugar', 'hay_block', 'apple', 'golden_carrot', 'golden_apple', 'enchanted_golden_apple']);
/** vanilla #horse_tempt_items */
const HORSE_TEMPT = new Set(['golden_carrot', 'golden_apple', 'enchanted_golden_apple']);
/** vanilla AnimalArmorItem body armour: its protection */
export const HORSE_ARMOR: Record<string, number> = { leather_horse_armor: 3, iron_horse_armor: 5, golden_horse_armor: 7, diamond_horse_armor: 11 };

/** vanilla generateMaxHealth / generateJumpStrength / generateSpeed */
function randomHealth(r: Rand): number {
  return 15 + r.nextInt(8) + r.nextInt(9);
}
function randomJump(r: Rand): number {
  return 0.4 + r.nextDouble() * 0.2 + r.nextDouble() * 0.2 + r.nextDouble() * 0.2;
}
function randomSpeed(r: Rand): number {
  return (0.45 + r.nextDouble() * 0.3 + r.nextDouble() * 0.3 + r.nextDouble() * 0.3) * 0.25;
}

/** vanilla AbstractHorse.createOffspringAttribute: about the parents' mean, spread by how far apart they are */
export function offspringAttribute(a: number, b: number, min: number, max: number, r: Rand): number {
  a = Math.min(max, Math.max(min, a));
  b = Math.min(max, Math.max(min, b));
  const spread = Math.abs(a - b) + 0.15 * (max - min) * 2;
  const v = (a + b) / 2 + spread * ((r.nextDouble() + r.nextDouble() + r.nextDouble()) / 3 - 0.5);
  return v > max ? max - (v - max) : v < min ? min + (min - v) : v;
}

/** the game's side of a horse: its inventory screen (gui/screens/horse.ts) */
export const horseHooks: { openInventory: ((h: AbstractHorse, p: Player) => void) | null } = { openInventory: null };

/** vanilla EntityType.HORSE's size (a foal of every kind is half of it) */
const HORSE_WIDTH = 1.3964844;
const HORSE_HEIGHT = 1.6;

export abstract class AbstractHorse extends Animal {
  protected adultWidth = HORSE_WIDTH;
  protected adultHeight = HORSE_HEIGHT;
  /** vanilla FLAG_TAME, OwnerUUID, Temper, FLAG_BRED */
  tamed = false;
  ownerUUID: string | null = null;
  temper = 0;
  bred = false;
  /** vanilla JUMP_STRENGTH attribute */
  jumpStrength = 0.7;
  /** slot 0 the saddle, slot 1 the body armour, then a chest's slots (vanilla keeps the armour in EquipmentSlot.BODY) */
  inventory: SimpleContainer;
  /** vanilla FLAG_EATING / FLAG_STANDING and their counters, and the eased animation amounts */
  eating = false;
  standing = false;
  private eatingCounter = 0;
  private standCounter = 0;
  tailCounter = 0;
  eatAnim = 0;
  eatAnimO = 0;
  standAnim = 0;
  standAnimO = 0;
  /** vanilla FLAG_OPEN_MOUTH and its counter: the mouth opens as it eats */
  private mouthOpen = false;
  private mouthCounter = 0;
  mouthAnim = 0;
  mouthAnimO = 0;
  /** vanilla isJumping (mid-leap), playerJumpPendingScale, allowStandSliding, gallopSoundCounter */
  leaping = false;
  playerJumpPendingScale = 0;
  private allowStandSliding = false;
  private gallopSoundCounter = 0;
  protected canGallop = true;

  constructor(level: Level) {
    super(level);
    this.inventory = new SimpleContainer(this.inventorySize());
    this.stepHeight = 1;
    // vanilla createBaseHorseAttributes (finalizeSpawn rolls its own)
    this.setSize(this.adultWidth, this.adultHeight);
    this.maxHealth = this.health = 53;
    this.moveSpeedAttr = 0.225;
  }

  /** vanilla getInventorySize: the saddle (and armour) slots, and a chest's */
  protected inventorySize(): number {
    return 2;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new PanicGoal(this, 1.2));
    this.goalSelector.addGoal(1, new RunAroundLikeCrazyGoal(this, 1.2));
    this.goalSelector.addGoal(2, new BreedGoal(this, 1.0));
    this.goalSelector.addGoal(4, new FollowParentGoal(this, 1.0));
    this.goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.7));
    this.goalSelector.addGoal(7, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
    if (this.canPerformRearing()) this.goalSelector.addGoal(9, new RandomStandGoal(this));
    // vanilla addBehaviourGoals
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(3, new TemptGoal(this, 1.25, HORSE_TEMPT));
  }

  // --- what it is ---------------------------------------------------------------------------------------------

  isTamed(): boolean {
    return this.tamed;
  }
  /** vanilla getMaxTemper */
  maxTemper(): number {
    return 100;
  }
  canPerformRearing(): boolean {
    return true;
  }
  get saddled(): boolean {
    return this.inventory.get(0) !== null;
  }
  bodyArmor(): ItemStack | null {
    return this.inventory.get(1);
  }
  /** vanilla canUseSlot(BODY): only a horse wears armour */
  canWearArmor(): boolean {
    return false;
  }
  isArmor(s: ItemStack | null): boolean {
    return !!s && this.canWearArmor() && s.item.id in HORSE_ARMOR;
  }
  /** vanilla isSaddleable */
  isSaddleable(): boolean {
    return this.isAlive && !this.isBaby() && this.tamed;
  }
  variantId(): string | undefined {
    return undefined;
  }
  /** a horse's own texture (the coat), read by the renderer */
  abstract texture(): string;

  isFood(s: ItemStack): boolean {
    return HORSE_FOOD.has(s.item.id);
  }

  override armorValue(): number {
    const a = this.bodyArmor();
    return Math.min(30, super.armorValue() + (a ? HORSE_ARMOR[a.item.id] ?? 0 : 0));
  }

  // --- spawning -----------------------------------------------------------------------------------------------

  /** vanilla AbstractHorse.finalizeSpawn: its strengths rolled, and (unless a horse's herd says otherwise) one in five after the first a foal */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const g = group ?? {};
    g.ageable ??= { size: 0, babyChance: 0.2 };
    this.randomizeAttributes(this.level.random);
    super.finalizeSpawn(reason, g);
  }

  protected randomizeAttributes(r: Rand): void {
    this.maxHealth = this.health = randomHealth(r);
    this.moveSpeedAttr = randomSpeed(r);
    this.jumpStrength = randomJump(r);
  }

  /** vanilla getDefaultDimensions: a foal of any kind is half a grown horse (BABY_DIMENSIONS, from the horse's size) */
  override refreshSize(): void {
    if (this.isBaby()) this.setSize(HORSE_WIDTH * 0.5, HORSE_HEIGHT * 0.5);
    else this.setSize(this.adultWidth, this.adultHeight);
  }

  /** vanilla EntityType eyeHeight: 1.52 of a horse's 1.6, 1.425 of a donkey's 1.5 */
  override get eyeHeight(): number {
    return this.height * 0.95;
  }

  // --- taming and handling ------------------------------------------------------------------------------------

  /** vanilla tameWithName: yours, with hearts */
  tameWithName(p: Player): void {
    this.ownerUUID = p.uuid;
    this.tamed = true;
    this.level.onTamed?.(this, p);
    this.particles('heart');
  }

  modifyTemper(n: number): void {
    this.temper = Math.max(0, Math.min(this.maxTemper(), this.temper + n));
  }

  /** vanilla makeMad: it rears, and whinnies angrily */
  makeMad(): void {
    if (!this.standing) {
      this.standIfPossible();
      const s = this.angrySound();
      if (s) this.playSound(s, this.soundVolume(), this.voicePitch());
    }
  }

  standIfPossible(): void {
    if (this.canPerformRearing()) {
      this.standCounter = 1;
      this.standing = true;
    }
  }
  clearStanding(): void {
    this.standing = false;
    this.standCounter = 0;
  }
  setEating(v: boolean): void {
    this.eating = v;
  }
  /** vanilla AbstractHorse.handleLeashAtDistance: tugged along, it stops grazing */
  override handleLeashAtDistance(h: Entity, distance: number): boolean {
    if (distance > 6 && this.eating) this.setEating(false);
    return super.handleLeashAtDistance(h, distance);
  }
  /** vanilla openMouth */
  private openMouth(): void {
    this.mouthCounter = 1;
    this.mouthOpen = true;
  }

  /** vanilla isImmobile: its own mind rests while it grazes or rears (as written in vanilla, the dying clause needs a saddled rider too) */
  override isImmobile(): boolean {
    return (super.isImmobile() && this.isVehicle() && this.saddled) || this.eating || this.standing;
  }

  private particles(kind: string): void {
    const r = this.random;
    for (let i = 0; i < 7; i++) {
      this.level.particles.spawn?.(kind, this.x + (2 * r.nextFloat() - 1) * this.width, this.y + r.nextFloat() * this.height + 0.5, this.z + (2 * r.nextFloat() - 1) * this.width, r.gaussian() * 0.02, r.gaussian() * 0.02, r.gaussian() * 0.02);
    }
  }

  /**
   * vanilla handleEating: sugar, wheat, hay, apples, golden carrots and golden apples heal it, bring a foal on and
   * sweeten its temper; the golden ones put a tame grown one in the mood to breed. Whether it took anything.
   */
  handleEating(p: Player, s: ItemStack): boolean {
    const id = s.item.id;
    let used = false, heal = 0, grow = 0, temper = 0;
    if (id === 'wheat') [heal, grow, temper] = [2, 20, 3];
    else if (id === 'sugar') [heal, grow, temper] = [1, 30, 3];
    else if (id === 'hay_block') [heal, grow] = [20, 180];
    else if (id === 'apple') [heal, grow, temper] = [3, 60, 3];
    else if (id === 'golden_carrot' || id === 'golden_apple' || id === 'enchanted_golden_apple') {
      [heal, grow, temper] = id === 'golden_carrot' ? [4, 60, 5] : [10, 240, 10];
      if (this.tamed && this.age === 0 && !this.isInLove()) {
        used = true;
        this.setInLove(p);
      }
    }
    if (this.health < this.maxHealth && heal > 0) {
      this.heal(heal);
      used = true;
    }
    if (this.isBaby() && grow > 0) {
      const r = this.random;
      this.level.particles.spawn?.('happy_villager', this.x + (2 * r.nextFloat() - 1) * this.width, this.y + 0.5 + r.nextFloat() * this.height, this.z + (2 * r.nextFloat() - 1) * this.width, 0, 0, 0);
      this.ageUp(grow, false);
      used = true;
    }
    if (temper > 0 && (used || !this.tamed) && this.temper < this.maxTemper()) {
      this.modifyTemper(temper);
      used = true;
    }
    // (vanilla eating: the mouth opens, and the sound)
    if (used) {
      this.openMouth();
      const e = this.eatSound();
      if (e) this.playSound(e, 1, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.2);
    }
    return used;
  }

  /** vanilla fedFood */
  protected fedFood(p: Player, s: ItemStack): boolean {
    const used = this.handleEating(p, s);
    if (used && p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    return used;
  }

  /** vanilla doPlayerRide: climbing on, facing its way */
  protected doPlayerRide(p: Player): void {
    this.setEating(false);
    this.clearStanding();
    p.yaw = p.yawO = this.yaw;
    p.pitch = p.pitchO = this.pitch;
    p.startRiding(this);
  }

  /** vanilla equipSaddle */
  equipSaddle(s: ItemStack, sound: boolean): void {
    this.inventory.set(0, s);
    if (sound) this.playSound(this.saddleSound(), 0.5, 1);
  }

  /** vanilla setBodyArmorItem (with the armour sound when it changes) */
  setArmor(s: ItemStack | null): void {
    const was = this.bodyArmor();
    this.inventory.set(1, s);
    if (s && s !== was) this.playSound('entity.horse.armor', 0.5, 1);
  }

  /** vanilla openCustomInventoryScreen: sneak-click a tame one, or open your inventory while riding it (a wild one won't) */
  openInventory(p: Player): void {
    if ((!this.isVehicle() || this.passengers.includes(p)) && this.tamed) horseHooks.openInventory?.(this, p);
  }

  /** vanilla AbstractHorse.mobInteract (the kinds add food and more before it) */
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (this.isVehicle() || this.isBaby()) return super.interact(p, stack);
    if (this.tamed && p.isShiftKeyDown()) {
      this.openInventory(p);
      return true;
    }
    if (stack) {
      // vanilla SaddleItem.interactLivingEntity
      if (stack.item.id === 'saddle' && !this.saddled && this.isSaddleable()) {
        this.equipSaddle(ItemStack.of('saddle'), true);
        if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        return true;
      }
      // (vanilla: body armour put straight on a tame one)
      if (this.tamed && this.isArmor(stack) && !this.bodyArmor()) {
        this.setArmor(stack.copyWithCount(1));
        if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        return true;
      }
    }
    this.doPlayerRide(p);
    return true;
  }

  // --- riding -------------------------------------------------------------------------------------------------

  /** vanilla getControllingPassenger: the player on a saddled one holds the reins */
  override controllingPassenger(): Entity | null {
    const p = this.passengers[0];
    if (this.saddled && p?.type === 'player') return p;
    return super.controllingPassenger();
  }

  /** vanilla PlayerRideableJumping.canJump: with a saddle on */
  canJump(): boolean {
    return this.saddled;
  }

  /** vanilla onPlayerJump: the charge (0-100) the rider let go of */
  onPlayerJump(power: number): void {
    if (!this.saddled) return;
    if (power < 0) power = 0;
    else {
      this.allowStandSliding = true;
      this.standIfPossible();
    }
    this.playerJumpPendingScale = power >= 90 ? 1 : 0.4 + (0.4 * power) / 90;
  }

  /** vanilla getJumpCooldown: a horse can leap again straight away */
  jumpCooldown(): number {
    return 0;
  }

  /** vanilla handleStartJump: it rears up as the leap starts (with the jump sound) */
  handleStartJump(_power = 0): void {
    this.allowStandSliding = true;
    this.standIfPossible();
    this.playJumpSound();
  }
  /** vanilla playJumpSound */
  protected playJumpSound(): void {
    this.playSound('entity.horse.jump', 0.4, 1);
  }

  /** vanilla tickRidden: it faces where its rider looks, and leaps when a jump is waiting and it's on the ground */
  protected override tickRidden(p: LivingEntity, _ix: number, _iy: number, iz: number): void {
    this.yaw = p.yaw;
    this.pitch = p.pitch * 0.5;
    this.yawO = this.bodyYaw = this.headYaw = this.yaw;
    if (iz <= 0) this.gallopSoundCounter = 0;
    if (this.onGround) {
      this.leaping = false;
      if (this.playerJumpPendingScale > 0 && !this.leaping) this.executeRidersJump(this.playerJumpPendingScale, iz);
      this.playerJumpPendingScale = 0;
    }
  }

  /** vanilla getRiddenInput: strafing at half, backing up at a quarter; nothing while it rears, unless leaping */
  protected override riddenInput(p: LivingEntity): [number, number, number] {
    if (this.onGround && this.playerJumpPendingScale === 0 && this.standing && !this.allowStandSliding) return [0, 0, 0];
    let fwd = p.zza;
    if (fwd <= 0) fwd *= 0.25;
    return [p.xxa * 0.5, 0, fwd];
  }

  protected override riddenSpeed(): number {
    return this.moveSpeedAttr;
  }

  /** vanilla getJumpPower(scale): its jump strength (the JUMP_STRENGTH attribute), as much as was charged */
  override jumpPower(scale = 1): number {
    return this.jumpStrength * scale * this.blockJumpFactor() + this.jumpBoostPower();
  }

  /** vanilla executeRidersJump: up, and forward too if it was going forward */
  protected executeRidersJump(scale: number, fwd: number): void {
    this.dy = this.jumpPower(scale);
    this.leaping = true;
    if (fwd > 0) {
      const a = (this.yaw * Math.PI) / 180;
      this.dx += -0.4 * Math.sin(a) * scale;
      this.dz += 0.4 * Math.cos(a) * scale;
    }
  }

  /** vanilla EntityType passengerAttachments (a foal's: BABY_DIMENSIONS', half a horse's height and a bit), raised a little as it rears */
  override passengerAttachmentY(_p: Entity): number {
    return (this.isBaby() ? (HORSE_HEIGHT + 0.125) * 0.5 : this.seatHeight()) + 0.15 * this.standAnimO;
  }
  protected abstract seatHeight(): number;

  /** vanilla positionRider: the rider's body turns with it */
  override positionRider(p: Entity): void {
    super.positionRider(p);
    if (p instanceof LivingEntity) p.bodyYaw = this.bodyYaw;
    // (vanilla getPassengerAttachmentPoint: back a little as it rears)
    if (this.standAnimO > 0) {
      const a = (this.yaw * Math.PI) / 180, k = -0.7 * this.standAnimO;
      p.setPos(p.x - Math.sin(a) * k, p.y, p.z + Math.cos(a) * k);
    }
  }

  /**
   * vanilla getDismountLocationForPassenger: off on the rider's right-hand side, else the left, on a floor there
   * no higher than just over its back; else where it stands
   */
  override dismountLocation(p: Entity): [number, number, number] {
    if (!(p instanceof LivingEntity)) return super.dismountLocation(p);
    for (const side of [90, -90]) {
      const at = this.dismountInDirection(escapeVector(this.width, p.width, this.yaw + side), p);
      if (at) return at;
    }
    return [this.x, this.y, this.z];
  }
  private dismountInDirection([ex, ez]: [number, number], p: LivingEntity): [number, number, number] | null {
    const x = this.x + ex, z = this.z + ez, top = this.bb.maxY + 0.75;
    const hw = p.width / 2;
    for (const h of p.dismountHeights()) {
      for (let by = Math.floor(this.bb.minY); by < top; by++) {
        const f = floorHeight(this.level, Math.floor(x), by, Math.floor(z));
        if (by + f > top) break;
        if (!isFinite(f) || f >= 1) continue;
        if (!blockFree(this.level, new AABB(x - hw, by + f, z - hw, x + hw, by + f + h, z + hw))) continue;
        p.setDismountHeight(h);
        return [x, by + f, z];
      }
    }
    return null;
  }

  // --- ticking ------------------------------------------------------------------------------------------------

  override tick(): void {
    super.tick();
    if (this.mouthCounter > 0 && ++this.mouthCounter > 30) {
      this.mouthCounter = 0;
      this.mouthOpen = false;
    }
    if (this.standCounter > 0 && ++this.standCounter > 20) this.clearStanding();
    if (this.tailCounter > 0 && ++this.tailCounter > 8) this.tailCounter = 0;
    this.eatAnimO = this.eatAnim;
    if (this.eating) this.eatAnim = Math.min(1, this.eatAnim + (1 - this.eatAnim) * 0.4 + 0.05);
    else this.eatAnim = Math.max(0, this.eatAnim + (-this.eatAnim * 0.4 - 0.05));
    this.standAnimO = this.standAnim;
    if (this.standing) {
      this.eatAnim = this.eatAnimO = 0;
      this.standAnim = Math.min(1, this.standAnim + (1 - this.standAnim) * 0.4 + 0.05);
    } else {
      this.allowStandSliding = false;
      this.standAnim = Math.max(0, this.standAnim + ((0.8 * this.standAnim ** 3 - this.standAnim) * 0.6 - 0.05));
    }
    this.mouthAnimO = this.mouthAnim;
    if (this.mouthOpen) this.mouthAnim = Math.min(1, this.mouthAnim + (1 - this.mouthAnim) * 0.7 + 0.05);
    else this.mouthAnim = Math.max(0, this.mouthAnim + (-this.mouthAnim * 0.7 - 0.05));
  }

  /** vanilla getEatAnim, getStandAnim, getMouthAnim: between last tick's and this one's */
  eatAnimAt(p: number): number {
    return this.eatAnimO + (this.eatAnim - this.eatAnimO) * p;
  }
  standAnimAt(p: number): number {
    return this.standAnimO + (this.standAnim - this.standAnimO) * p;
  }
  mouthAnimAt(p: number): number {
    return this.mouthAnimO + (this.mouthAnim - this.mouthAnimO) * p;
  }

  /** vanilla AbstractHorse.aiStep: a flick of the tail now and then, slow healing, and grazing on grass */
  override aiStep(): void {
    if (this.random.nextInt(200) === 0) this.tailCounter = 1;
    super.aiStep();
    if (!this.isAlive) return;
    if (this.random.nextInt(900) === 0 && this.deathTime === 0) this.heal(1);
    if (!this.eating && !this.isVehicle() && this.random.nextInt(300) === 0 && BLOCKS[STATE_BLOCK[this.level.world.getState(Math.floor(this.x), Math.floor(this.y) - 1, Math.floor(this.z))]].name === 'grass_block') this.setEating(true);
    if (this.eating && ++this.eatingCounter > 50) {
      this.eatingCounter = 0;
      this.setEating(false);
    }
  }

  /** vanilla hurt: one time in three it rears */
  override hurt(amount: number, source: string, attacker: Entity | null = null): boolean {
    const hit = super.hurt(amount, source, attacker);
    if (hit && this.random.nextInt(3) === 0) this.standIfPossible();
    return hit;
  }

  /** vanilla causeFallDamage (SAFE_FALL_DISTANCE 6, FALL_DAMAGE_MULTIPLIER 0.5): its riders fall with it */
  protected override causeFallDamage(dist: number): void {
    if (dist > 1) this.playSound('entity.horse.land', 0.4, 1);
    const dmg = Math.ceil((dist - 6) * 0.5);
    if (dmg <= 0) return;
    this.hurt(dmg, 'fall');
    for (const p of this.passengers) if (p instanceof LivingEntity) p.hurt(dmg, 'fall');
  }

  /**
   * vanilla playStepSound: hooves on wood sound woody; ridden, it clatters a few steps, then gallops, now and then
   * snorting
   */
  protected override playStepSound(): void {
    const w = this.level.world;
    const st = w.getState(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
    if (FLAGS[st] & (F_WATER | F_LAVA)) return;
    let sound = BLOCKS[STATE_BLOCK[st]].sound;
    const above = BLOCKS[STATE_BLOCK[w.getState(Math.floor(this.x), Math.floor(this.y - 0.2) + 1, Math.floor(this.z))]];
    if (above.name === 'snow') sound = above.sound;
    const wood = sound === 'wood' || sound === 'nether_wood' || sound === 'bamboo_wood' || sound === 'cherry_wood';
    if (this.isVehicle() && this.canGallop) {
      this.gallopSoundCounter++;
      if (this.gallopSoundCounter > 5 && this.gallopSoundCounter % 3 === 0) {
        this.playSound('entity.horse.gallop', 0.15, 1);
        if (this.random.nextInt(10) === 0) this.playSound('entity.horse.breathe', 0.6, 1);
      } else if (this.gallopSoundCounter <= 5) this.playSound('entity.horse.step_wood', 0.15, 1);
    } else this.playSound(wood ? 'entity.horse.step_wood' : 'entity.horse.step', 0.15, 1);
  }

  // --- breeding -----------------------------------------------------------------------------------------------

  /** vanilla canParent: tame, grown, well, in love, and nobody on or under it */
  canParent(): boolean {
    return !this.isVehicle() && !this.vehicle && this.tamed && !this.isBaby() && this.health >= this.maxHealth && this.isInLove();
  }

  /** vanilla setOffspringAttributes */
  protected setOffspringAttributes(o: AbstractHorse, child: AbstractHorse): void {
    const r = this.random;
    child.maxHealth = child.health = offspringAttribute(this.maxHealth, o.maxHealth, MIN_HEALTH, MAX_HEALTH, r);
    child.jumpStrength = offspringAttribute(this.jumpStrength, o.jumpStrength, MIN_JUMP, MAX_JUMP, r);
    child.moveSpeedAttr = offspringAttribute(this.baseMoveSpeed, o.baseMoveSpeed, MIN_SPEED, MAX_SPEED, r);
  }

  // --- sounds, drops ------------------------------------------------------------------------------------------

  protected angrySound(): string | null {
    return null;
  }
  protected eatSound(): string | null {
    return null;
  }
  protected saddleSound(): string {
    return 'entity.horse.saddle';
  }
  /** vanilla Mob ambient interval, which RandomStandGoal also rears to */
  ambientStandInterval(): number {
    return this.ambientSoundInterval();
  }
  /** vanilla entities/horse, donkey, mule: 0-2 leather */
  override lootTable(): LootEntry[] {
    return [{ item: 'leather', min: 0, max: 2 }];
  }

  /** vanilla dropEquipment: the saddle, the armour and a chest's load */
  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    super.die(source, attacker);
    for (const s of this.inventory.removeAll()) this.spawnAtLocation(s);
  }

  // --- saving -------------------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    const inv = this.inventory.items.map((s) => (s ? { id: s.item.id, count: s.count, tag: s.tag } : null));
    return {
      ...super.saveData(), Tame: this.tamed, Temper: this.temper, Bred: this.bred, Owner: this.ownerUUID ?? '', MaxHealth: this.maxHealth,
      Speed: this.baseMoveSpeed, JumpStrength: this.jumpStrength, Items: JSON.stringify(inv),
    };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.tamed = d.Tame === true;
    this.temper = Number(d.Temper ?? 0);
    this.bred = d.Bred === true;
    this.ownerUUID = d.Owner ? String(d.Owner) : null;
    // (vanilla onAttributeUpdated: no more health than its most)
    if (d.MaxHealth !== undefined) this.health = Math.min(this.health, (this.maxHealth = Number(d.MaxHealth)));
    if (d.Speed !== undefined) this.moveSpeedAttr = Number(d.Speed);
    if (d.JumpStrength !== undefined) this.jumpStrength = Number(d.JumpStrength);
    if (typeof d.Items === 'string') {
      try {
        const inv = JSON.parse(d.Items) as ({ id: string; count: number; tag?: Record<string, unknown> } | null)[];
        inv.forEach((s, i) => {
          if (i >= this.inventory.size || !s) return;
          const st = ItemStack.of(s.id, s.count);
          if (s.tag) st.tag = s.tag;
          this.inventory.items[i] = st;
        });
      } catch {
        // (a damaged save: an empty inventory)
      }
    }
  }
}

/** vanilla Entity.getCollisionHorizontalEscapeVector: just clear of its side, the way `yaw` points */
export function escapeVector(width: number, riderWidth: number, yaw: number): [number, number] {
  const d = (width + riderWidth + 1e-5) / 2;
  const a = (yaw * Math.PI) / 180;
  const sx = -Math.sin(a), cz = Math.cos(a);
  const m = Math.max(Math.abs(sx), Math.abs(cz));
  return [(sx * d) / m, (cz * d) / m];
}

// ---------------------------------------------------------------------------
// the kinds

/** vanilla Horse: a coat and markings, and armour */
export class Horse extends AbstractHorse {
  readonly type = 'horse';
  color: HorseColor = 'white';
  markings: HorseMarkings = 'none';

  override texture(): string {
    return 'horse_' + this.color;
  }
  override variantId(): string {
    return this.color;
  }
  override canWearArmor(): boolean {
    return true;
  }
  protected seatHeight(): number {
    return 1.44375;
  }

  /** vanilla Horse.finalizeSpawn: a herd shares one coat (HorseGroupData, whose foals come one in twenty), each its own markings */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const r = this.level.random;
    const g = group ?? {};
    if (!g.horseColor) {
      g.horseColor = HORSE_COLORS[r.nextInt(HORSE_COLORS.length)];
      g.ageable ??= { size: 0, babyChance: 0.05 };
    }
    this.color = g.horseColor as HorseColor;
    this.markings = HORSE_MARKINGS[r.nextInt(HORSE_MARKINGS.length)];
    super.finalizeSpawn(reason, g);
  }

  /** vanilla Horse.mobInteract: food first; a wild one won't take anything else, it rears */
  override interact(p: Player, stack: ItemStack | null): boolean {
    const secondary = !this.isBaby() && this.tamed && p.isShiftKeyDown();
    if (!this.isVehicle() && !secondary && stack) {
      if (this.isFood(stack)) return this.fedFood(p, stack);
      if (!this.tamed) {
        this.makeMad();
        return true;
      }
    }
    return super.interact(p, stack);
  }

  /** vanilla Horse.canMate: a horse or a donkey, both ready */
  override canMate(o: Animal): boolean {
    return o !== this && (o instanceof Horse || o instanceof Donkey) && this.canParent() && o.canParent();
  }

  /** vanilla Horse.getBreedOffspring: with a donkey, a mule; with a horse, a foal mostly of either's coat and markings */
  makeBaby(partner: Animal): Animal {
    if (partner instanceof Donkey) {
      const m = new Mule(this.level);
      this.setOffspringAttributes(partner, m);
      return m;
    }
    const o = partner as Horse, r = this.random;
    const h = new Horse(this.level);
    const i = r.nextInt(9);
    h.color = i < 4 ? this.color : i < 8 ? o.color : HORSE_COLORS[r.nextInt(HORSE_COLORS.length)];
    const j = r.nextInt(5);
    h.markings = j < 2 ? this.markings : j < 4 ? o.markings : HORSE_MARKINGS[r.nextInt(HORSE_MARKINGS.length)];
    this.setOffspringAttributes(o, h);
    return h;
  }

  override ambientSound(): string {
    return 'entity.horse.ambient';
  }
  protected override angrySound(): string {
    return 'entity.horse.angry';
  }
  protected override eatSound(): string {
    return 'entity.horse.eat';
  }
  override hurtSound(): string {
    return 'entity.horse.hurt';
  }
  override deathSound(): string {
    return 'entity.horse.death';
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), Variant: HORSE_COLORS.indexOf(this.color) | (HORSE_MARKINGS.indexOf(this.markings) << 8) };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    const v = Number(d.Variant ?? 0);
    this.color = HORSE_COLORS[v & 0xff] ?? 'white';
    this.markings = HORSE_MARKINGS[(v >> 8) & 0xff] ?? 'none';
  }
}

/** vanilla AbstractChestedHorse: slower and steadier, and a chest can be strapped on (15 slots) */
export abstract class AbstractChestedHorse extends AbstractHorse {
  hasChest = false;

  constructor(level: Level) {
    super(level);
    this.canGallop = false;
    // vanilla createBaseChestedHorseAttributes
    this.moveSpeedAttr = 0.175;
    this.jumpStrength = 0.5;
  }
  protected override inventorySize(): number {
    return 2 + 15;
  }
  /** vanilla getInventoryColumns */
  inventoryColumns(): number {
    return 5;
  }

  /** vanilla randomizeAttributes (createBaseChestedHorseAttributes: speed 0.175, jump 0.5) */
  protected override randomizeAttributes(r: Rand): void {
    this.maxHealth = this.health = randomHealth(r);
    this.moveSpeedAttr = 0.175;
    this.jumpStrength = 0.5;
  }

  /** vanilla AbstractChestedHorse.mobInteract: food first, a wild one rears at anything else, a chest goes on */
  override interact(p: Player, stack: ItemStack | null): boolean {
    const secondary = !this.isBaby() && this.tamed && p.isShiftKeyDown();
    if (!this.isVehicle() && !secondary && stack) {
      if (this.isFood(stack)) return this.fedFood(p, stack);
      if (!this.tamed) {
        this.makeMad();
        return true;
      }
      if (!this.hasChest && stack.item.id === 'chest' && !this.isBaby()) {
        this.hasChest = true;
        this.playSound(this.chestSound(), 1, (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1);
        if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        return true;
      }
    }
    return super.interact(p, stack);
  }

  protected abstract chestSound(): string;

  /** vanilla AbstractChestedHorse.dropEquipment: the chest itself too */
  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    const chest = this.hasChest;
    super.die(source, attacker);
    if (chest) {
      this.spawnAtLocation(ItemStack.of('chest'));
      this.hasChest = false;
    }
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), ChestedHorse: this.hasChest };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.hasChest = d.ChestedHorse === true;
  }
}

/** vanilla Donkey */
export class Donkey extends AbstractChestedHorse {
  readonly type = 'donkey';
  protected override adultHeight = 1.5;

  constructor(level: Level) {
    super(level);
    // (its own height applies only once the fields past the base constructor are set)
    this.refreshSize();
  }

  override texture(): string {
    return 'donkey';
  }
  protected seatHeight(): number {
    return 1.1125;
  }
  /** vanilla Donkey.canMate: a donkey or a horse */
  override canMate(o: Animal): boolean {
    return o !== this && (o instanceof Donkey || o instanceof Horse) && this.canParent() && o.canParent();
  }
  /** vanilla Donkey.getBreedOffspring: with a horse, a mule */
  makeBaby(partner: Animal): Animal {
    const child = partner instanceof Horse ? new Mule(this.level) : new Donkey(this.level);
    this.setOffspringAttributes(partner as AbstractHorse, child);
    return child;
  }
  override ambientSound(): string {
    return 'entity.donkey.ambient';
  }
  protected override playJumpSound(): void {
    this.playSound('entity.donkey.jump', 0.4, (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1);
  }
  protected override angrySound(): string {
    return 'entity.donkey.angry';
  }
  protected override eatSound(): string {
    return 'entity.donkey.eat';
  }
  protected override chestSound(): string {
    return 'entity.donkey.chest';
  }
  override hurtSound(): string {
    return 'entity.donkey.hurt';
  }
  override deathSound(): string {
    return 'entity.donkey.death';
  }
}

/** vanilla Mule: it can't breed */
export class Mule extends AbstractChestedHorse {
  readonly type = 'mule';

  override texture(): string {
    return 'mule';
  }
  protected seatHeight(): number {
    return 1.2125;
  }
  override canMate(): boolean {
    return false;
  }
  makeBaby(): Animal {
    return new Mule(this.level);
  }
  override ambientSound(): string {
    return 'entity.mule.ambient';
  }
  protected override playJumpSound(): void {
    this.playSound('entity.mule.jump', 0.4, (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1);
  }
  protected override angrySound(): string {
    return 'entity.mule.angry';
  }
  protected override eatSound(): string {
    return 'entity.mule.eat';
  }
  protected override chestSound(): string {
    return 'entity.mule.chest';
  }
  override hurtSound(): string {
    return 'entity.mule.hurt';
  }
  override deathSound(): string {
    return 'entity.mule.death';
  }
}

// ---------------------------------------------------------------------------
// goals

/**
 * vanilla RunAroundLikeCrazyGoal: with someone on its back that hasn't tamed it, a wild one charges about; now and
 * then it either gives in (the likelier the better its temper) or throws them off and rears, its temper a little
 * better for the next try
 */
class RunAroundLikeCrazyGoal extends Goal {
  private tx = 0;
  private ty = 0;
  private tz = 0;
  constructor(readonly horse: AbstractHorse, readonly speed: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const h = this.horse;
    if (h.tamed || !h.isVehicle()) return false;
    const pos = defaultRandomPos(h, 5, 4);
    if (!pos) return false;
    [this.tx, this.ty, this.tz] = pos;
    return true;
  }
  override start(): void {
    this.horse.navigation.moveTo(this.tx, this.ty, this.tz, this.speed);
  }
  override canContinueToUse(): boolean {
    const h = this.horse;
    return !h.tamed && !h.navigation.isDone() && h.isVehicle();
  }
  override tick(): void {
    const h = this.horse, r = h.random;
    if (h.tamed || r.nextInt(this.adjustedTickDelay(50)) !== 0) return;
    const rider = h.passengers[0];
    if (!rider) return;
    if (rider.type === 'player') {
      const max = h.maxTemper();
      if (max > 0 && r.nextInt(max) < h.temper) {
        h.tameWithName(rider as Player);
        return;
      }
      h.modifyTemper(5);
    }
    h.ejectPassengers();
    h.makeMad();
    // (vanilla entity event 6: the smoke of its refusal)
    for (let i = 0; i < 7; i++) h.level.particles.spawn?.('smoke', h.x + (2 * r.nextFloat() - 1) * h.width, h.y + r.nextFloat() * h.height + 0.5, h.z + (2 * r.nextFloat() - 1) * h.width, r.gaussian() * 0.02, r.gaussian() * 0.02, r.gaussian() * 0.02);
  }
}

/** vanilla RandomStandGoal: every so often, standing about, it rears up and whinnies */
class RandomStandGoal extends Goal {
  private nextStand: number;
  constructor(readonly horse: AbstractHorse) {
    super();
    this.nextStand = -horse.ambientStandInterval();
  }
  canUse(): boolean {
    const h = this.horse;
    this.nextStand++;
    if (this.nextStand > 0 && h.random.nextInt(1000) < this.nextStand) {
      this.nextStand = -h.ambientStandInterval();
      return !h.isImmobile() && h.random.nextInt(10) === 0;
    }
    return false;
  }
  override start(): void {
    const h = this.horse;
    h.standIfPossible();
    const s = h.ambientSound();
    if (s) h.playSound(s, h.soundVolume(), h.voicePitch());
  }
  override canContinueToUse(): boolean {
    return false;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
}
