// The strider (vanilla Strider): the Nether's lava walker. Still lava bears it like a floor half a block up (the
// collision in entity.ts), and it bobs back up out of any lava it sinks into. Away from lava it goes cold: purple,
// shivering and a third slower, and it heads for the nearest lava it can find. Saddle one and a player holding a
// warped fungus on a stick steers it the way they look; using the stick while riding gives a burst of speed.
// One strider in thirty spawns ridden by a zombified piglin, and one in ten carries its baby.

import { Mob, LootEntry, SpawnGroup, SpawnReason } from './mob';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import { Animal, BreedGoal, FollowParentGoal, TemptGoal } from './animals';
import { LookAtPlayerGoal, MoveToBlockGoal, PanicGoal, RandomLookAroundGoal, RandomStrollGoal } from './ai/goals';
import { PathNavigation } from './ai/navigation';
import { PathType } from './ai/pathfinder';
import { ZombifiedPiglin } from './monsters';
import { blockFree, floorHeight } from './dismount';
import { ItemBasedSteering } from './steering';
import { ItemStack } from '../item/item';
import { FLAGS, F_LAVA, F_FULL_COLLISION } from '../world/block';
import { fluidType, FLUID_LAVA } from '../world/fluids';
import { AABB } from '../core/aabb';

/** vanilla Strider MOVEMENT_SPEED; the cold take a third off it (SUFFOCATING_MODIFIER, -34% of base) */
const SPEED = 0.175;
const COLD_SPEED = SPEED * (1 - 0.34);
/** vanilla #strider_tempt_items and #strider_food */
const TEMPT_ITEMS = new Set(['warped_fungus', 'warped_fungus_on_a_stick']);
const FOOD = 'warped_fungus';
const STICK = 'warped_fungus_on_a_stick';

/** vanilla #strider_warm_blocks: lava */
function isLava(st: number): boolean {
  return (FLAGS[st] & F_LAVA) !== 0;
}

function holding(p: Player, id: string): boolean {
  return p.inventory.selectedItem?.item.id === id || p.inventory.offhand?.item.id === id;
}

/** vanilla Strider.StriderPathNavigation: a lava block is somewhere to stand */
class StriderPathNavigation extends PathNavigation {
  override isStableDestination(x: number, y: number, z: number): boolean {
    return isLava(this.mob.level.world.getState(x, y, z)) || super.isStableDestination(x, y, z);
  }
}

/** vanilla Strider.StriderGoToLavaGoal: out of lava, head for lava with room to stand on it (8 around, 2 up and down) */
class StriderGoToLavaGoal extends MoveToBlockGoal {
  constructor(readonly strider: Strider, speed: number) {
    super(strider, speed, 8, 2);
  }
  protected override moveToTarget(): [number, number, number] {
    return [this.bx, this.by, this.bz];
  }
  override canContinueToUse(): boolean {
    return !this.strider.inLava && this.isValidTarget(this.bx, this.by, this.bz);
  }
  override canUse(): boolean {
    return !this.strider.inLava && super.canUse();
  }
  override shouldRecalculatePath(): boolean {
    return this.tryTicks % 20 === 0;
  }
  /** lava to stand on: the block over it passable on foot (vanilla isPathfindable(LAND): not a full block, not lava) */
  protected isValidTarget(x: number, y: number, z: number): boolean {
    const w = this.strider.level.world;
    if (!isLava(w.getState(x, y, z))) return false;
    const above = w.getState(x, y + 1, z);
    return !(FLAGS[above] & F_FULL_COLLISION) && !isLava(above);
  }
}

/** vanilla LookAtPlayerGoal(strider, Strider.class, 8): the nearest other strider in range and in sight */
class LookAtStriderGoal extends LookAtPlayerGoal {
  protected override findLookAt(): LivingEntity | null {
    const m = this.mob, d = this.lookDistance;
    let best: LivingEntity | null = null, bd = d * d;
    for (const e of m.level.getEntities(m.bb.inflate(d, 3, d), (e) => e instanceof Strider && e !== m && e.isAlive)) {
      const d2 = e.distanceToSqr(m.x, m.y + m.eyeHeight, m.z);
      if (d2 <= bd && m.sensing.hasLineOfSight(e as LivingEntity)) {
        bd = d2;
        best = e as LivingEntity;
      }
    }
    return best;
  }
}

/** vanilla Entity.getCollisionHorizontalEscapeVector: just clear of the mount's side, the way the rider faces */
function escapeVector(vehicleWidth: number, riderWidth: number, yaw: number): [number, number] {
  const d = (vehicleWidth + riderWidth + Math.fround(1e-5)) / 2;
  const r = (yaw * Math.PI) / 180;
  const fx = -Math.sin(r), fz = Math.cos(r), m = Math.max(Math.abs(fx), Math.abs(fz));
  return [(fx * d) / m, (fz * d) / m];
}

export class Strider extends Animal {
  readonly type = 'strider';
  protected adultWidth = 0.9;
  protected adultHeight = 1.7;
  /** vanilla DATA_SUFFOCATING: out of lava and cold */
  suffocating = false;
  readonly steering = new ItemBasedSteering();
  private panicGoal: PanicGoal | null = null;
  private temptGoal: TemptGoal | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.9, 1.7);
    this.maxHealth = this.health = 20;
    this.moveSpeedAttr = SPEED;
    this.setPathfindingMalus(PathType.WATER, -1);
    this.setPathfindingMalus(PathType.LAVA, 0);
    this.setPathfindingMalus(PathType.DANGER_FIRE, 0);
    this.setPathfindingMalus(PathType.DAMAGE_FIRE, 0);
  }

  protected override createNavigation(): PathNavigation {
    return new StriderPathNavigation(this);
  }

  protected registerGoals(): void {
    this.panicGoal = new PanicGoal(this, 1.65);
    this.goalSelector.addGoal(1, this.panicGoal);
    this.goalSelector.addGoal(2, new BreedGoal(this, 1));
    this.temptGoal = new TemptGoal(this, 1.4, TEMPT_ITEMS);
    this.goalSelector.addGoal(3, this.temptGoal);
    this.goalSelector.addGoal(4, new StriderGoToLavaGoal(this, 1));
    this.goalSelector.addGoal(5, new FollowParentGoal(this, 1.1));
    this.goalSelector.addGoal(7, new RandomStrollGoal(this, 1, 60));
    this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
    this.goalSelector.addGoal(9, new LookAtStriderGoal(this, 8));
  }

  override fireImmune(): boolean {
    return true;
  }
  override canStandOnFluid(fluid: number): boolean {
    return fluid === FLUID_LAVA;
  }

  /** vanilla getWalkTargetValue: lava above all; once in lava, nowhere else at all */
  override walkTargetValue(x: number, y: number, z: number): number {
    if (isLava(this.level.world.getState(x, y, z))) return 10;
    return this.inLava ? -Infinity : 0;
  }

  isFood(s: ItemStack): boolean {
    return s.item.id === FOOD;
  }
  makeBaby(): Animal {
    return new Strider(this.level);
  }

  private isPanicking(): boolean {
    return !!this.panicGoal?.isRunning;
  }
  private isBeingTempted(): boolean {
    return !!this.temptGoal?.isRunning;
  }

  private setSuffocating(v: boolean): void {
    this.suffocating = v;
    this.moveSpeedAttr = v ? COLD_SPEED : SPEED;
  }

  override tick(): void {
    const r = this.random;
    if (this.isBeingTempted() && r.nextInt(140) === 0) this.playSound('entity.strider.happy', this.soundVolume(), this.voicePitch());
    else if (this.isPanicking() && r.nextInt(60) === 0) this.playSound('entity.strider.retreat', this.soundVolume(), this.voicePitch());
    // warm in or on lava, cold anywhere else, and cold riding a cold strider
    const w = this.level.world, bx = Math.floor(this.x), bz = Math.floor(this.z);
    const warm = isLava(w.getState(bx, Math.floor(this.y), bz)) || isLava(w.getState(bx, Math.floor(this.y - 0.2), bz)) || (this.inLava && this.fluidHeightLava > 0);
    this.setSuffocating(!warm || (this.vehicle instanceof Strider && this.vehicle.suffocating));
    super.tick();
    if (!this.removed) this.floatStrider();
  }

  /** vanilla floatStrider: standing on still lava counts as ground; sunk in it, it bobs up */
  private floatStrider(): void {
    if (!this.inLava) return;
    const w = this.level.world, bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    if (this.y > by + 0.5 - 1e-5 && fluidType(w.getState(bx, by + 1, bz)) !== FLUID_LAVA) this.onGround = true;
    else {
      this.dx *= 0.5;
      this.dy = this.dy * 0.5 + 0.05;
      this.dz *= 0.5;
    }
  }

  override aiStep(): void {
    // vanilla isSensitiveToWater
    if (this.isAlive && this.isInWaterOrRainNow()) this.hurt(1, 'drown');
    super.aiStep();
  }

  /** vanilla checkFallDamage: lava breaks any fall */
  protected override checkFallDamage(dy: number, onGround: boolean): void {
    if (this.inLava) this.fallDistance = 0;
    else super.checkFallDamage(dy, onGround);
  }

  // --- riding ---------------------------------------------------------------

  isSaddleable(): boolean {
    return this.isAlive && !this.isBaby();
  }

  get saddled(): boolean {
    return this.steering.saddled;
  }

  /** vanilla equipSaddle */
  equipSaddle(withSound: boolean): void {
    this.steering.saddled = true;
    if (withSound) this.level.sound.play('entity.strider.saddle', this.x, this.y, this.z, 0.5, 1);
  }

  /** vanilla getControllingPassenger: a player holding the stick steers a saddled one */
  override controllingPassenger(): Entity | null {
    const p = this.passengers[0];
    if (this.saddled && p?.type === 'player' && holding(p as Player, STICK)) return p;
    return super.controllingPassenger();
  }

  /** vanilla canAddPassenger: one rider, and not with its eyes under the lava */
  override canAddPassenger(_p: Entity): boolean {
    return !this.isVehicle() && this.eyeFluid !== FLUID_LAVA;
  }

  /** vanilla ItemSteerable.boost */
  boost(): boolean {
    return this.steering.boost(this.random);
  }

  /** vanilla Strider.tickRidden: faces where its rider looks */
  protected override tickRidden(p: LivingEntity): void {
    this.yaw = p.yaw % 360;
    this.pitch = (p.pitch * 0.5) % 360;
    this.yawO = this.bodyYaw = this.headYaw = this.yaw;
    this.steering.tickBoost();
  }

  /** vanilla getRiddenInput: always straight ahead */
  protected override riddenInput(): [number, number, number] {
    return [0, 0, 1];
  }

  protected override riddenSpeed(): number {
    return this.moveSpeedAttr * (this.suffocating ? 0.35 : 0.55) * this.steering.boostFactor();
  }

  /** vanilla getPassengerAttachmentPoint: the seat bobs with its stride */
  override passengerAttachmentY(_p: Entity): number {
    const f = Math.min(0.25, this.walkAnimSpeed);
    return this.height + 0.12 * Math.cos(this.walkAnimPos * 1.5) * 2 * f * (this.isBaby() ? 0.5 : 1);
  }

  /**
   * vanilla getDismountLocationForPassenger: off to the side the rider faces (or up to 45° either way), on a floor
   * from its top down to half a block under its feet, never into lava; else on top of it
   */
  override dismountLocation(p: Entity): [number, number, number] {
    if (!(p instanceof LivingEntity)) return super.dismountLocation(p);
    const spots: [number, number, number][] = [];
    const seen = new Set<string>();
    const top = this.bb.maxY, bottom = this.bb.minY - 0.5;
    for (const turn of [0, -22.5, 22.5, -45, 45]) {
      const [vx, vz] = escapeVector(this.width, p.width, p.yaw + turn);
      const bx = Math.floor(this.x + vx), bz = Math.floor(this.z + vz);
      for (let d = top, by = Math.floor(top); d > bottom; d--, by--) {
        const k = bx + ',' + by + ',' + bz;
        if (seen.has(k)) continue;
        seen.add(k);
        spots.push([bx, by, bz]);
      }
    }
    const w = this.level.world;
    for (const [x, y, z] of spots) {
      if (isLava(w.getState(x, y, z))) continue;
      const h = floorHeight(this.level, x, y, z);
      if (!isFinite(h) || h >= 1) continue;
      const sx = x + 0.5, sy = y + h, sz = z + 0.5, hw = p.width / 2;
      for (const ph of p.dismountHeights()) {
        if (!blockFree(this.level, new AABB(sx - hw, sy, sz - hw, sx + hw, sy + ph, sz + hw))) continue;
        p.setDismountHeight(ph);
        return [sx, sy, sz];
      }
    }
    return [this.x, this.bb.maxY, this.z];
  }

  /**
   * vanilla Strider.mobInteract: an empty-handed (or non-food) click on a saddled, free one climbs on (not while
   * sneaking); food feeds it; a saddle saddles it
   */
  override interact(p: Player, stack: ItemStack | null): boolean {
    const food = !!stack && this.isFood(stack);
    if (!food && this.saddled && !this.isVehicle() && !p.isShiftKeyDown()) {
      p.startRiding(this);
      return true;
    }
    if (super.interact(p, stack)) return true;
    // vanilla SaddleItem.interactLivingEntity
    if (stack?.item.id === 'saddle' && !this.saddled && this.isSaddleable()) {
      this.equipSaddle(true);
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      return true;
    }
    return false;
  }

  protected override playEatSound(): void {
    const r = this.random;
    this.playSound('entity.strider.eat', 1, 1 + (r.nextFloat() - r.nextFloat()) * 0.2);
  }

  // --- sounds, loot ---------------------------------------------------------

  override ambientSound(): string | null {
    return this.isPanicking() || this.isBeingTempted() ? null : 'entity.strider.ambient';
  }
  override hurtSound(): string {
    return 'entity.strider.hurt';
  }
  override deathSound(): string {
    return 'entity.strider.death';
  }
  protected override playStepSound(): void {
    this.playSound(this.inLava ? 'entity.strider.step_lava' : 'entity.strider.step', 1, 1);
  }
  /** vanilla nextStep: a step every 0.6 of stride */
  protected override nextStepDistance(): number {
    return this.moveDist + 0.6;
  }

  /** vanilla entities/strider */
  override lootTable(): LootEntry[] {
    return [{ item: 'string', min: 2, max: 5 }];
  }

  /** vanilla dropEquipment: the saddle comes off (whatever doMobLoot says) */
  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    super.die(source, attacker);
    if (this.saddled) {
      this.spawnAtLocation(ItemStack.of('saddle'));
      this.steering.saddled = false;
    }
  }

  // --- spawning -------------------------------------------------------------

  /** vanilla checkStriderSpawnRules: up through the lava to open air */
  static checkStriderSpawn(level: Level, x: number, y: number, z: number): boolean {
    const w = level.world;
    let yy = y + 1;
    while (fluidType(w.getState(x, yy, z)) === FLUID_LAVA) yy++;
    return w.getState(x, yy, z) === 0;
  }

  /** vanilla checkSpawnObstruction: lava is where it spawns */
  override checkSpawnObstruction(): boolean {
    return true;
  }

  /**
   * vanilla Strider.finalizeSpawn: one in thirty comes ridden by a zombified piglin holding a warped fungus on a
   * stick (and saddled), one in ten more by a baby strider. Otherwise it starts a fresh pack record with even baby
   * odds, which AgeableMob.finalizeSpawn only applies after a pack's first member, so as in vanilla an adult's
   * roll never actually makes a baby.
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const g = group ?? {};
    if (!this.isBaby()) {
      const r = this.random;
      let rider: Mob | null = null;
      if (r.nextInt(30) === 0) {
        const piglin: Mob = new ZombifiedPiglin(this.level);
        piglin.moveTo(this.x, this.y, this.z, this.yaw, 0);
        piglin.finalizeSpawn('jockey');
        piglin.mainHand = ItemStack.of(STICK);
        this.equipSaddle(false);
        rider = piglin;
      } else if (r.nextInt(10) === 0) {
        const baby = new Strider(this.level);
        baby.setAge(-24000);
        baby.moveTo(this.x, this.y, this.z, this.yaw, 0);
        baby.finalizeSpawn('jockey');
        rider = baby;
      }
      if (rider) {
        // (it comes into the world with its mount: Level.addEntity brings passengers along)
        rider.startRiding(this, true);
        g.ageable = { size: 0, babyChance: 0 };
      } else g.ageable = { size: 0, babyChance: 0.5 };
    }
    const a = (g.ageable ??= { size: 0, babyChance: 0.05 });
    if (a.size > 0 && this.random.nextFloat() <= a.babyChance) this.setAge(-24000);
    a.size++;
    void reason;
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), saddle: this.saddled };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.steering.saddled = d.saddle === true;
  }
}
