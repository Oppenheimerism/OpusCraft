// Llamas (vanilla 1.21 Llama, TraderLlama, LlamaSpit and LlamaFollowCaravanGoal). Herds of one coat (creamy, white,
// brown or grey) in the windswept hills and on savanna plateaus. Climb on a wild one until it stops throwing you
// off to tame it; you can't steer one, but a chest on its back holds three slots for every point of its strength
// (one to five), a wool carpet dresses it in that colour, and hay bales bring two tame ones to breed. Lead one and
// the others fall in behind it in a caravan, up to ten long. Hurt one and it spits at you; wild wolves are spat at,
// and give a strong llama a wide berth. The trader llamas come with a wandering trader and go when he does.

import type { Animal } from './animals';
import { BreedGoal, DYE_COLORS, FollowParentGoal, TemptGoal } from './animals';
import { AbstractChestedHorse, AbstractHorse, RunAroundLikeCrazyGoal } from './horse';
import { Entity } from './entity';
import { LivingEntity } from './living';
import type { Level } from '../game/level';
import type { SpawnGroup, SpawnReason } from './mob';
import { Mob } from './mob';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { FloatGoal, HurtByTargetGoal, LookAtPlayerGoal, NearestAttackableMobGoal, PanicGoal, RandomLookAroundGoal, RangedAttackGoal, WaterAvoidingRandomStrollGoal, type RangedAttacker } from './ai/goals';
import { TamableAnimal } from './tamable';
import type { Player } from './player';
import type { ItemStack } from '../item/item';
import { LeashKnot } from './leash';
import { clipBlocks } from '../game/raycast';
import { onProjectileHit } from '../game/blockRules';
import { isAir, FLAGS, F_WATER } from '../world/block';

/** vanilla Llama.Variant, in id order */
export const LLAMA_VARIANTS = ['creamy', 'white', 'brown', 'gray'] as const;
export type LlamaVariant = (typeof LLAMA_VARIANTS)[number];

/** vanilla EntityType.LLAMA (and TRADER_LLAMA) */
const LLAMA_WIDTH = 0.9;
const LLAMA_HEIGHT = 1.87;
/** vanilla Llama.FOOD_ITEMS */
const LLAMA_FOOD = new Set(['wheat', 'hay_block']);
const LLAMA_TEMPT = new Set(['hay_block']);

/** vanilla #wool_carpets: a carpet's colour, which is what a llama wears (null: it's not one) */
export function carpetColor(s: ItemStack | null): string | null {
  if (!s || !s.item.id.endsWith('_carpet')) return null;
  const c = s.item.id.slice(0, -'_carpet'.length);
  return DYE_COLORS.includes(c) ? c : null;
}

export class Llama extends AbstractChestedHorse implements RangedAttacker {
  readonly type: string = 'llama';
  protected override adultWidth = LLAMA_WIDTH;
  protected override adultHeight = LLAMA_HEIGHT;
  variant: LlamaVariant = 'creamy';
  /** vanilla DATA_STRENGTH_ID (1 to 5): three chest slots a point, and how much a wild wolf fears it */
  strength = 1;
  /** vanilla didSpit: it's spat at whoever hurt it, and can let them be */
  didSpit = false;
  /** vanilla caravanHead / caravanTail: the llama it follows and the one following it */
  caravanHead: Llama | null = null;
  caravanTail: Llama | null = null;

  constructor(level: Level) {
    super(level);
    // (vanilla createAttributes: FOLLOW_RANGE 40)
    this.followRange = 40;
    this.refreshSize();
  }

  protected override registerGoals(): void {
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new RunAroundLikeCrazyGoal(this, 1.2));
    this.goalSelector.addGoal(2, new LlamaFollowCaravanGoal(this, 2.1));
    this.goalSelector.addGoal(3, new RangedAttackGoal(this, 1.25, 40, 40, 20));
    this.goalSelector.addGoal(3, new PanicGoal(this, 1.2));
    this.goalSelector.addGoal(4, new BreedGoal(this, 1.0));
    this.goalSelector.addGoal(5, new TemptGoal(this, 1.25, LLAMA_TEMPT));
    this.goalSelector.addGoal(6, new FollowParentGoal(this, 1.0));
    this.goalSelector.addGoal(7, new WaterAvoidingRandomStrollGoal(this, 0.7));
    this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(9, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new LlamaHurtByTargetGoal(this));
    this.targetSelector.addGoal(2, new LlamaAttackWolfGoal(this));
  }

  // --- what it is ---------------------------------------------------------------------------------------------

  isTraderLlama(): boolean {
    return false;
  }
  override texture(): string {
    return 'llama_' + this.variant;
  }
  override variantId(): string {
    return this.variant;
  }
  /** vanilla setStrength: kept to 1-5 */
  setStrength(n: number): void {
    this.strength = Math.max(1, Math.min(5, Math.floor(n)));
  }
  /** vanilla getMaxTemper */
  override maxTemper(): number {
    return 30;
  }
  override canPerformRearing(): boolean {
    return false;
  }
  /** vanilla isSaddleable: never; it goes where it likes */
  override isSaddleable(): boolean {
    return false;
  }
  /** vanilla canUseSlot(BODY): a carpet */
  override canWearArmor(): boolean {
    return true;
  }
  override isArmor(s: ItemStack | null): boolean {
    return carpetColor(s) !== null;
  }
  /** vanilla getSwag: the colour of the carpet it wears */
  swag(): string | null {
    return carpetColor(this.bodyArmor());
  }
  /** (vanilla containerChanged: the swag sound as a carpet of a new colour goes on) */
  override setArmor(s: ItemStack | null): void {
    const was = this.swag();
    this.inventory.set(1, s);
    const now = this.swag();
    if (now !== null && now !== was) this.playSound('entity.llama.swag', 0.5, 1);
  }
  /** vanilla getInventoryColumns: three slots a point of strength, with a chest on */
  override inventoryColumns(): number {
    return this.hasChest ? this.strength : 0;
  }
  override isFood(s: ItemStack): boolean {
    return LLAMA_FOOD.has(s.item.id);
  }
  /** vanilla canEatGrass: it doesn't graze */
  protected override canEatGrass(): boolean {
    return false;
  }
  /** vanilla isImmobile: only when it's dying (or eating, which it never does) */
  override isImmobile(): boolean {
    return this.health <= 0 || this.eating;
  }
  /** vanilla followLeashSpeed */
  override followLeashSpeed(): number {
    return 2;
  }
  /** vanilla getLeashOffset: at the front of its chest, three-quarters of the way up to its eyes */
  override leashOffset(): [number, number, number] {
    return [0, 0.75 * this.eyeHeight, this.width * 0.5];
  }

  // --- spawning and breeding ----------------------------------------------------------------------------------

  /** vanilla Llama.finalizeSpawn: its strength rolled, and a herd sharing one coat (LlamaGroupData, a baby in twenty) */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const r = this.level.random;
    this.setStrength(1 + r.nextInt(r.nextFloat() < 0.04 ? 5 : 3));
    const g = group ?? {};
    if (!g.llamaVariant) {
      g.llamaVariant = LLAMA_VARIANTS[r.nextInt(LLAMA_VARIANTS.length)];
      g.ageable ??= { size: 0, babyChance: 0.05 };
    }
    this.variant = g.llamaVariant as LlamaVariant;
    super.finalizeSpawn(reason, g);
  }

  /** vanilla Llama.canMate: any llama, both ready */
  override canMate(o: Animal): boolean {
    return o !== this && o instanceof Llama && this.canParent() && o.canParent();
  }

  /** vanilla makeNewLlama */
  protected makeNewLlama(): Llama {
    return new Llama(this.level);
  }

  /** vanilla getBreedOffspring: up to the stronger parent's strength (now and then one more), one or the other's coat */
  override makeBaby(partner: Animal): Animal {
    const o = partner as Llama, r = this.random;
    const child = this.makeNewLlama();
    this.setOffspringAttributes(o, child);
    let s = r.nextInt(Math.max(this.strength, o.strength)) + 1;
    if (r.nextFloat() < 0.03) s++;
    child.setStrength(s);
    child.variant = r.nextBool() ? this.variant : o.variant;
    return child;
  }

  /**
   * vanilla Llama.handleEating: wheat and hay heal it, bring a baby on and sweeten its temper; hay puts a tame grown one
   * in the mood to breed
   */
  override handleEating(p: Player, s: ItemStack): boolean {
    const id = s.item.id;
    let grow = 0, temper = 0, heal = 0, used = false;
    if (id === 'wheat') [grow, temper, heal] = [10, 3, 2];
    else if (id === 'hay_block') {
      [grow, temper, heal] = [90, 6, 10];
      if (this.tamed && this.age === 0 && this.canFallInLove()) {
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
    if (used) this.playSound('entity.llama.eat', 1, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.2);
    return used;
  }

  // --- size and riding ----------------------------------------------------------------------------------------

  /** vanilla EntityType.LLAMA passengerAttachments (0, 1.37, -0.3), a baby's (BABY_DIMENSIONS) 13/16 lower and halved */
  override passengerAttachmentY(_p: Entity): number {
    return this.isBaby() ? (LLAMA_HEIGHT - 0.8125) * 0.5 : 1.37;
  }
  /** vanilla getPassengerAttachmentPoint: the plain one (no rearing), a little behind its middle */
  override positionRider(p: Entity): void {
    const back = this.isBaby() ? 0.15 : 0.3, a = (this.yaw * Math.PI) / 180;
    p.setPos(this.x + Math.sin(a) * back, this.y + this.passengerAttachmentY(p) - p.vehicleAttachmentY(), this.z - Math.cos(a) * back);
    if (p instanceof LivingEntity) p.bodyYaw = this.bodyYaw;
  }

  /** vanilla Llama.causeFallDamage: as a horse's, without the thud of hooves */
  protected override causeFallDamage(dist: number): void {
    const dmg = Math.ceil((dist - 6) * 0.5);
    if (dmg <= 0) return;
    this.hurt(dmg, 'fall');
    for (const p of this.passengers) if (p instanceof LivingEntity) p.hurt(dmg, 'fall');
  }

  // --- spitting -----------------------------------------------------------------------------------------------

  /** vanilla performRangedAttack */
  performRangedAttack(target: LivingEntity, _power: number): void {
    this.spit(target);
  }

  /** vanilla spit: at a third of the way up the target, a little high for the distance, with the sound */
  private spit(target: LivingEntity): void {
    const s = new LlamaSpit(this.level, this);
    const dx = target.x - this.x, dz = target.z - this.z;
    const dy = target.y + target.height / 3 - s.y;
    s.shoot(dx, dy + Math.sqrt(dx * dx + dz * dz) * 0.2, dz, 1.5, 10);
    const r = this.random;
    this.playSound('entity.llama.spit', 1, 1 + (r.nextFloat() - r.nextFloat()) * 0.2);
    this.level.addEntity(s);
    s.puff();
    this.didSpit = true;
  }

  // --- caravans -----------------------------------------------------------------------------------------------

  /** vanilla leaveCaravan */
  leaveCaravan(): void {
    if (this.caravanHead) this.caravanHead.caravanTail = null;
    this.caravanHead = null;
  }
  /** vanilla joinCaravan */
  joinCaravan(head: Llama): void {
    this.caravanHead = head;
    head.caravanTail = this;
  }
  hasCaravanTail(): boolean {
    return this.caravanTail !== null;
  }
  inCaravan(): boolean {
    return this.caravanHead !== null;
  }

  // --- sounds -------------------------------------------------------------------------------------------------

  override ambientSound(): string {
    return 'entity.llama.ambient';
  }
  protected override angrySound(): string {
    return 'entity.llama.angry';
  }
  protected override eatSound(): string {
    return 'entity.llama.eat';
  }
  protected override chestSound(): string {
    return 'entity.llama.chest';
  }
  override hurtSound(): string {
    return 'entity.llama.hurt';
  }
  override deathSound(): string {
    return 'entity.llama.death';
  }
  /** vanilla playStepSound */
  protected override playStepSound(): void {
    this.playSound('entity.llama.step', 0.15, 1);
  }
  protected seatHeight(): number {
    return 1.37;
  }

  // --- saving -------------------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), Variant: LLAMA_VARIANTS.indexOf(this.variant), Strength: this.strength };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.setStrength(Number(d.Strength ?? 0));
    super.loadData(d);
    this.variant = LLAMA_VARIANTS[Number(d.Variant ?? 0)] ?? 'creamy';
  }
}

/**
 * vanilla TraderLlama: a wandering trader's, in his blue and gold livery; it panics quicker, stands up for him, can't
 * be ridden while he leads it, and goes when he does (or, off his lead, some forty minutes on) unless it's been tamed,
 * someone else leads it or you're on its back
 */
export class TraderLlama extends Llama {
  override readonly type: string = 'trader_llama';
  /** vanilla despawnDelay */
  despawnDelay = 47999;

  protected override registerGoals(): void {
    super.registerGoals();
    this.goalSelector.addGoal(1, new PanicGoal(this, 2.0));
    this.targetSelector.addGoal(1, new TraderLlamaDefendWanderingTraderGoal(this));
  }

  override isTraderLlama(): boolean {
    return true;
  }
  protected override makeNewLlama(): Llama {
    return new TraderLlama(this.level);
  }

  /** vanilla TraderLlama.finalizeSpawn: one that comes with a wandering trader (an EVENT spawn) is grown */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    if (reason === 'event') this.setAge(0);
    super.finalizeSpawn(reason, group);
  }

  /** the wandering trader leading it, if one is */
  private trader(): (Mob & { despawnDelay: number }) | null {
    const h = this.leashHolder;
    return h instanceof Mob && h.type === 'wandering_trader' ? (h as Mob & { despawnDelay: number }) : null;
  }

  /** vanilla doPlayerRide: not while its trader leads it */
  protected override doPlayerRide(p: Player): void {
    if (!this.trader()) super.doPlayerRide(p);
  }

  override aiStep(): void {
    super.aiStep();
    if (this.isAlive) this.maybeDespawn();
  }

  /** vanilla maybeDespawn: on his lead it keeps his time, else its own; when it's up, off it goes */
  private maybeDespawn(): void {
    if (!this.canDespawn()) return;
    const t = this.trader();
    this.despawnDelay = t ? t.despawnDelay - 1 : this.despawnDelay - 1;
    if (this.despawnDelay <= 0) {
      this.dropLeash(false);
      this.remove();
    }
  }

  /** vanilla canDespawn: not tame, not someone else's to lead, and nobody (just one player) riding it */
  private canDespawn(): boolean {
    const leashedElsewhere = this.isLeashed() && !this.trader();
    const onePlayer = this.passengers.length === 1 && this.passengers[0].type === 'player';
    return !this.tamed && !leashedElsewhere && !onePlayer;
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), DespawnDelay: this.despawnDelay };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (d.DespawnDelay !== undefined) this.despawnDelay = Number(d.DespawnDelay);
  }
}

// ---------------------------------------------------------------------------
// the spit

/** vanilla LlamaSpit: a gob that flies like a thrown thing, stings for 1, and is gone at the first block or water */
export class LlamaSpit extends Entity {
  readonly type = 'llama_spit';
  owner: Llama | null;
  private leftOwner = false;

  constructor(level: Level, owner: Llama | null) {
    super(level);
    this.owner = owner;
    this.setSize(0.25, 0.25);
    if (owner) {
      // (vanilla: in front of its mouth, a little below its eyes)
      const a = (owner.bodyYaw * Math.PI) / 180, k = (owner.width + 1) * 0.5;
      this.moveTo(owner.x - k * Math.sin(a), owner.y + owner.eyeHeight - 0.1, owner.z + k * Math.cos(a), 0, 0);
    }
  }

  /** vanilla getDefaultGravity */
  protected gravity(): number {
    return 0.06;
  }

  /** vanilla Projectile.shoot */
  shoot(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    const r = this.level.random;
    const tri = () => 0.0172275 * inaccuracy * (r.nextDouble() - r.nextDouble());
    this.dx = (x / l + tri()) * velocity;
    this.dy = (y / l + tri()) * velocity;
    this.dz = (z / l + tri()) * velocity;
    this.yaw = this.yawO = (Math.atan2(this.dx, this.dz) * 180) / Math.PI;
    this.pitch = this.pitchO = (Math.atan2(this.dy, Math.sqrt(this.dx * this.dx + this.dz * this.dz)) * 180) / Math.PI;
  }

  /** vanilla recreateFromPacket: seven puffs of spit fanning out along its flight */
  puff(): void {
    for (let i = 0; i < 7; i++) {
      const k = 0.4 + 0.1 * i;
      this.level.particles.spawn?.('spit', this.x, this.y, this.z, this.dx * k, this.dy, this.dz * k);
    }
  }

  /** vanilla Projectile.canHitEntity: not its llama, nor anyone riding with it, until it's clear of them */
  private canHit(e: Entity): boolean {
    if (!(e instanceof LivingEntity) || !e.isPickable() || !e.isAlive) return false;
    if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
    const o = this.owner;
    return !o || this.leftOwner || rootVehicle(o) !== rootVehicle(e);
  }

  override tick(): void {
    this.baseTick();
    if (this.removed) return;
    const o = this.owner;
    // vanilla Projectile.checkLeftOwner
    if (!this.leftOwner) this.leftOwner = !o || !this.level.getEntities(this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1), (e) => e.isPickable() && rootVehicle(e) === rootVehicle(o), this).length;
    // vanilla ProjectileUtil.getHitResultOnMoveVector: the first block along its way, then anything nearer (0.3 out)
    const x0 = this.x, y0 = this.y, z0 = this.z, vx = this.dx, vy = this.dy, vz = this.dz;
    let x1 = x0 + vx, y1 = y0 + vy, z1 = z0 + vz;
    const bh = clipBlocks(this.level.world, x0, y0, z0, x1, y1, z1);
    if (bh) [x1, y1, z1] = [bh.px, bh.py, bh.pz];
    let hit: Entity | null = null, best = Infinity;
    for (const e of this.level.getEntities(this.bb.expandTowards(vx, vy, vz).inflate(1), (e) => this.canHit(e), this)) {
      const h = e.bb.inflate(0.3).clip(x0, y0, z0, x1, y1, z1);
      if (h && h.t < best) {
        best = h.t;
        hit = e;
      }
    }
    // vanilla onHitEntity: 1 from its llama (it flies on); onHitBlock: the block has its say, and it's gone
    if (hit) {
      if (o) hit.hurt(1, 'mob', o, this);
    } else if (bh) {
      onProjectileHit(this.level, bh.x, bh.y, bh.z, bh, this);
      this.remove();
      return;
    }
    // vanilla updateRotation
    const h = Math.sqrt(vx * vx + vz * vz);
    this.yawO = this.yaw;
    this.pitchO = this.pitch;
    this.yaw = lerpRotation(this.yaw, (Math.atan2(vx, vz) * 180) / Math.PI);
    this.pitch = lerpRotation(this.pitch, (Math.atan2(vy, h) * 180) / Math.PI);
    // (vanilla: wholly inside solid stuff, or in water, it's gone)
    if (this.noAirAround() || this.inWater || FLAGS[this.level.world.getState(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))] & F_WATER) {
      this.remove();
      return;
    }
    this.dx = vx * 0.99;
    this.dy = vy * 0.99 - this.gravity();
    this.dz = vz * 0.99;
    this.setPos(x0 + vx, y0 + vy, z0 + vz);
  }

  /** vanilla getBlockStates(bb).noneMatch(isAir) */
  private noAirAround(): boolean {
    const w = this.level.world, b = this.bb;
    for (let x = Math.floor(b.minX); x <= Math.floor(b.maxX); x++)
      for (let y = Math.floor(b.minY); y <= Math.floor(b.maxY); y++)
        for (let z = Math.floor(b.minZ); z <= Math.floor(b.maxZ); z++) if (isAir(w.getState(x, y, z))) return false;
    return true;
  }

  override hurt(): boolean {
    return false;
  }
  protected override makesStepSounds(): boolean {
    return false;
  }
}

/** vanilla Entity.getRootVehicle */
function rootVehicle(e: Entity): Entity {
  let v = e;
  while (v.vehicle) v = v.vehicle;
  return v;
}

/** vanilla Projectile.lerpRotation: a fifth of the way from the old angle to the new (the short way round) */
function lerpRotation(from: number, to: number): number {
  while (to - from < -180) from -= 360;
  while (to - from >= 180) from += 360;
  return from + (to - from) * 0.2;
}

// ---------------------------------------------------------------------------
// goals

/**
 * vanilla LlamaFollowCaravanGoal: a llama that isn't led falls in behind the nearest caravan's last llama within 9
 * (else behind a led llama), so long as a lead is on one of the eight in front; it keeps two blocks back, hurrying
 * when it's fallen more than 26 behind, and drops out if the head is gone, nobody up front is led any more, or it
 * can't catch up
 */
class LlamaFollowCaravanGoal extends Goal {
  private distCheckCounter = 0;
  constructor(readonly llama: Llama, private speed: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const l = this.llama;
    if (l.isLeashed() || l.inCaravan()) return false;
    const list = l.level.getEntities(l.bb.inflate(9, 4, 9), (e) => e instanceof Llama, l) as Llama[];
    let head: Llama | null = null, d0 = Infinity;
    for (const o of list) {
      if (!o.inCaravan() || o.hasCaravanTail()) continue;
      const d = l.distanceToSqr(o.x, o.y, o.z);
      if (d <= d0) [d0, head] = [d, o];
    }
    if (!head)
      for (const o of list) {
        if (!o.isLeashed() || o.hasCaravanTail()) continue;
        const d = l.distanceToSqr(o.x, o.y, o.z);
        if (d <= d0) [d0, head] = [d, o];
      }
    if (!head || d0 < 4) return false;
    if (!head.isLeashed() && !firstIsLeashed(head, 1)) return false;
    l.joinCaravan(head);
    return true;
  }
  override canContinueToUse(): boolean {
    const l = this.llama, h = l.caravanHead;
    if (!h || !h.isAlive || h.removed || !firstIsLeashed(l, 0)) return false;
    if (l.distanceToSqr(h.x, h.y, h.z) > 676) {
      if (this.speed <= 3) {
        this.speed *= 1.2;
        this.distCheckCounter = reducedTickDelay(40);
        return true;
      }
      if (this.distCheckCounter === 0) return false;
    }
    if (this.distCheckCounter > 0) this.distCheckCounter--;
    return true;
  }
  override stop(): void {
    this.llama.leaveCaravan();
    this.speed = 2.1;
  }
  override tick(): void {
    const l = this.llama, h = l.caravanHead;
    if (!h || l.leashHolder instanceof LeashKnot) return;
    const vx = h.x - l.x, vy = h.y - l.y, vz = h.z - l.z;
    const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (d < 1e-4) return;
    const k = Math.max(d - 2, 0) / d;
    l.navigation.moveTo(l.x + vx * k, l.y + vy * k, l.z + vz * k, this.speed);
  }
}

/** vanilla firstIsLeashed: someone within eight places up the caravan from `l` is on a lead */
function firstIsLeashed(l: Llama, pos: number): boolean {
  if (pos > 8 || !l.caravanHead) return false;
  return l.caravanHead.isLeashed() ? true : firstIsLeashed(l.caravanHead, pos + 1);
}

/** vanilla LlamaHurtByTargetGoal: it spits once at whoever hurt it, and that's that */
class LlamaHurtByTargetGoal extends HurtByTargetGoal {
  constructor(readonly llama: Llama) {
    super(llama);
  }
  override canContinueToUse(): boolean {
    if (this.llama.didSpit) {
      this.llama.didSpit = false;
      return false;
    }
    return super.canContinueToUse();
  }
}

/** vanilla LlamaAttackWolfGoal: a wild wolf within a quarter of its follow range (every 16 ticks or so) */
class LlamaAttackWolfGoal extends NearestAttackableMobGoal {
  constructor(llama: Llama) {
    super(llama, (e) => e.type === 'wolf' && e instanceof TamableAnimal && !e.isTame(), false, 16);
  }
  protected override followDistance(): number {
    return super.followDistance() * 0.25;
  }
}

/** vanilla TraderLlamaDefendWanderingTraderGoal: whoever last hurt its trader */
class TraderLlamaDefendWanderingTraderGoal extends Goal {
  private attacker: LivingEntity | null = null;
  private timestamp = 0;
  constructor(readonly llama: TraderLlama) {
    super();
    this.flags = Flag.TARGET;
  }
  canUse(): boolean {
    const h = this.llama.leashHolder;
    if (!(h instanceof Mob) || h.type !== 'wandering_trader') return false;
    this.attacker = h.lastHurtByMob;
    return h.lastHurtByMobTimestamp !== this.timestamp && this.attacker !== null && this.attacker.isAlive && this.llama.canAttack(this.attacker);
  }
  override canContinueToUse(): boolean {
    const t = this.llama.target;
    return t !== null && t.isAlive && this.llama.canAttack(t) && this.llama.distanceToSqr(t.x, t.y, t.z) <= this.llama.followRange ** 2;
  }
  override start(): void {
    this.llama.setTarget(this.attacker);
    const h = this.llama.leashHolder;
    if (h instanceof Mob) this.timestamp = h.lastHurtByMobTimestamp;
  }
  override stop(): void {
    this.llama.setTarget(null);
  }
}

/** a llama's inventory screen shows its carpet slot, not a horse's armour slot (gui/screens/horse.ts) */
export function isLlama(h: AbstractHorse): h is Llama {
  return h instanceof Llama;
}
