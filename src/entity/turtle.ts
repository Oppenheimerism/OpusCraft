// Turtles (Stage 5: ocean, M6; vanilla Turtle, with its TurtleMoveControl, TurtlePathNavigation and goals).
//
// A turtle lives between the sea and the beach it came from: its home, where it hatched or first turned up. It
// swims far out to sea (a long way off in one direction or another, never above the sea's surface), wanders the sand
// when it's ashore, and heads back to the water; now and then, a long way from home, it makes for home. Fed seagrass,
// two turtles court, and one of them comes away carrying eggs: it heads home, and within 9 blocks of it digs into
// the sand (sand flying, ten seconds) and lays a clutch of one to four eggs (game/turtleEggs.ts: they hatch into
// babies at home there). It's slow on land and quick in the water, where it neither drowns nor drifts with the
// current; hurt, it makes for the nearest water. A baby grows up in twenty minutes, dropping a turtle scute as it
// does. Lightning kills a turtle outright (and it leaves a bowl). Zombies, drowned, skeletons, ocelots, stray cats and
// wild wolves hunt the babies while they're out of the water (./turtlePredators.ts).

import { Animal, BreedGoal, TemptGoal } from './animals';
import type { Level } from '../game/level';
import type { LootEntry, SpawnGroup, SpawnReason } from './mob';
import type { Entity } from './entity';
import { Goal, reducedTickDelay } from './ai/goal';
import { MoveControl, MoveOp, rotlerp } from './ai/controls';
import { AmphibiousPathNavigation, type PathNavigation } from './ai/navigation';
import { PathType } from './ai/pathfinder';
import { LookAtPlayerGoal, MoveToBlockGoal, PanicGoal, RandomStrollGoal, defaultRandomPosTowards } from './ai/goals';
import { ItemStack } from '../item/item';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, getBlock } from '../world/block';
import { SEA_LEVEL } from '../world/constants';

type Pos = [number, number, number];
const RAD = 180 / Math.PI;
/** vanilla Float.MAX_VALUE: the lightning's damage to a turtle */
const FLOAT_MAX = 3.4028234663852886e38;

/** what a turtle eats, and follows a player holding (vanilla Turtle.isFood / its TemptGoal: seagrass) */
const TURTLE_FOOD = new Set(['seagrass']);
/** vanilla #sand */
const SAND = new Set(['sand', 'red_sand', 'suspicious_sand']);

interface BlockReader {
  getState(x: number, y: number, z: number): number;
}
const nameAt = (w: BlockReader, x: number, y: number, z: number): string => BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name;

/** vanilla TurtleEggBlock.isSand: the block is #sand */
export function isSand(w: BlockReader, x: number, y: number, z: number): boolean {
  return SAND.has(nameAt(w, x, y, z));
}

/** vanilla TurtleEggBlock.onSand: the block under (x, y, z) is #sand */
export function onSand(w: BlockReader, x: number, y: number, z: number): boolean {
  return isSand(w, x, y - 1, z);
}

// ---------------------------------------------------------------------------

export class Turtle extends Animal {
  readonly type = 'turtle';
  protected adultWidth = 1.2;
  protected adultHeight = 0.4;
  /** vanilla HOME_POS: where it hatched or first appeared; it comes back here to lay its eggs */
  homePos: Pos = [0, 0, 0];
  /** vanilla TRAVEL_POS: the far-off place it's swimming toward */
  travelPos: Pos = [0, 0, 0];
  /** vanilla HAS_EGG: carrying eggs since it bred */
  hasEgg = false;
  /** vanilla GOING_HOME */
  goingHome = false;
  /** vanilla TRAVELLING */
  travelling = false;
  /** vanilla LAYING_EGG */
  private layingEgg = false;
  /** vanilla layEggCounter: how long it's been digging */
  layEggCounter = 0;
  /** (the damage it died of, for its loot: a bowl too when it was lightning) */
  private diedOf = '';

  constructor(level: Level) {
    super(level);
    this.setSize(1.2, 0.4);
    // vanilla Turtle.createAttributes: 30 health, 0.25 speed, a full block's step
    this.maxHealth = this.health = 30;
    this.moveSpeedAttr = 0.25;
    this.stepHeight = 1;
    this.setPathfindingMalus(PathType.WATER, 0);
    this.setPathfindingMalus(PathType.DOOR_IRON_CLOSED, -1);
    this.setPathfindingMalus(PathType.DOOR_WOOD_CLOSED, -1);
    this.setPathfindingMalus(PathType.DOOR_OPEN, -1);
    this.moveControl = new TurtleMoveControl(this);
  }

  protected registerGoals(): void {
    const g = this.goalSelector;
    g.addGoal(0, new TurtlePanicGoal(this, 1.2));
    g.addGoal(1, new TurtleBreedGoal(this, 1.0));
    g.addGoal(1, new TurtleLayEggGoal(this, 1.0));
    g.addGoal(2, new TemptGoal(this, 1.1, TURTLE_FOOD));
    g.addGoal(3, new TurtleGoToWaterGoal(this, 1.0));
    g.addGoal(4, new TurtleGoHomeGoal(this, 1.0));
    g.addGoal(7, new TurtleTravelGoal(this, 1.0));
    g.addGoal(8, new LookAtPlayerGoal(this, 8));
    g.addGoal(9, new TurtleRandomStrollGoal(this, 1.0, 100));
  }

  protected override createNavigation(): PathNavigation {
    return new TurtlePathNavigation(this);
  }

  /** vanilla getAgeScale and BABY_DIMENSIONS: a baby is 0.3 of the size */
  override refreshSize(): void {
    const s = this.isBaby() ? 0.3 : 1;
    this.setSize(this.adultWidth * s, this.adultHeight * s);
  }

  /** vanilla setLayingEgg: the dig starts its count at 1 */
  setLayingEgg(v: boolean): void {
    this.layEggCounter = v ? 1 : 0;
    this.layingEgg = v;
  }

  isLayingEgg(): boolean {
    return this.layingEgg;
  }

  /** (vanilla getHomePos().closerToCenterThan(position, d)): the middle of its home block within `d` of it */
  homeWithin(d: number): boolean {
    const [x, y, z] = this.homePos;
    return (x + 0.5 - this.x) ** 2 + (y + 0.5 - this.y) ** 2 + (z + 0.5 - this.z) ** 2 < d * d;
  }

  /** vanilla finalizeSpawn: home is where it appears, and nowhere to travel yet */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    this.homePos = [Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)];
    this.travelPos = [0, 0, 0];
    super.finalizeSpawn(reason, group);
  }

  /** vanilla checkTurtleSpawnRules: below four over the sea's surface, on sand, in the light */
  static checkTurtleSpawnRules(level: Level, x: number, y: number, z: number): boolean {
    return y < SEA_LEVEL + 4 && onSand(level.world, x, y, z) && level.rawBrightness(x, y, z, 0) > 8;
  }

  /** vanilla isPushedByFluid: currents don't carry it */
  override isPushedByFluid(): boolean {
    return false;
  }

  override canBreatheUnderwater(): boolean {
    return true;
  }

  override isFood(s: ItemStack): boolean {
    return TURTLE_FOOD.has(s.item.id);
  }

  /** vanilla getBreedOffspring (a spawn egg used on one; its breeding makes eggs instead: spawnChildFromBreeding) */
  makeBaby(): Animal {
    return new Turtle(this.level);
  }

  /** vanilla canFallInLove: not while it's carrying eggs */
  override canFallInLove(): boolean {
    return super.canFallInLove() && !this.hasEgg;
  }

  /**
   * vanilla TurtleBreedGoal.breed: no baby — the one whose goal it was carries eggs now; both rest five minutes, and
   * there's experience for it (a player's or not)
   */
  override spawnChildFromBreeding(partner: Animal): void {
    const cause = this.loveCause ?? partner.loveCause;
    // (the breeding advancements count a turtle's pair, there being no baby)
    this.level.onBred?.(this, cause ?? null);
    this.hasEgg = true;
    this.setAge(6000);
    partner.setAge(6000);
    this.inLove = 0;
    partner.inLove = 0;
    if (this.level.gameRules.doMobLoot) this.level.awardExperience(this.x, this.y, this.z, this.random.nextInt(7) + 1);
  }

  /** vanilla getWalkTargetValue: water (unless it's going home) and sand are best; elsewhere, the brighter the better */
  override walkTargetValue(x: number, y: number, z: number): number {
    const w = this.level.world;
    if (!this.goingHome && FLAGS[w.getState(x, y, z)] & F_WATER) return 10;
    return onSand(w, x, y, z) ? 10 : this.level.brightness(x, y, z) - 0.5;
  }

  /** vanilla Turtle.aiStep: digging to lay, it sends up a spray of the sand under it every quarter second */
  override aiStep(): void {
    super.aiStep();
    if (this.isAlive && this.layingEgg && this.layEggCounter >= 1 && this.layEggCounter % 5 === 0) {
      const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
      const w = this.level.world;
      if (onSand(w, bx, by, bz)) {
        // (vanilla levelEvent 2001 with the sand's state: its breaking specks and sound where the turtle is)
        const below = w.getState(bx, by - 1, bz);
        this.level.particles.blockBreak(bx, by, bz, below);
        this.level.sound.play(`block.${BLOCKS[STATE_BLOCK[below]].sound}.break`, bx + 0.5, by + 0.5, bz + 0.5, 1, 0.8);
      }
    }
  }

  /** vanilla ageBoundaryReached: grown up, it sheds a turtle scute */
  protected override ageBoundaryReached(): void {
    super.ageBoundaryReached();
    if (!this.isBaby() && this.level.gameRules.doMobLoot) this.spawnAtLocation(ItemStack.of('turtle_scute'), 1);
  }

  /**
   * vanilla Turtle.travel: in the water it pushes along at a tenth of its input, a tenth of its speed lost a tick;
   * with nothing to go for and not near home on the way there, it sinks a little
   */
  override travel(sx: number, sy: number, sz: number): void {
    if (this.inWater) {
      this.moveRelative(0.1, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      this.dx *= 0.9;
      this.dy *= 0.9;
      this.dz *= 0.9;
      if (!this.target && (!this.goingHome || !this.homeWithin(20))) this.dy -= 0.005;
    } else super.travel(sx, sy, sz);
  }

  /** vanilla Turtle.thunderHit: lightning kills it outright */
  override thunderHit(_bolt: Entity): void {
    this.hurt(FLOAT_MAX, 'lightningBolt');
  }

  override die(source: string, attacker: Entity | null = null): void {
    if (!this.dead) this.diedOf = source;
    super.die(source, attacker);
  }

  /** vanilla loot_tables/entities/turtle: 0-2 seagrass (and 0-1 more a level of looting); a bowl when lightning killed it */
  override lootTable(): LootEntry[] {
    const t: LootEntry[] = [{ item: 'seagrass', min: 0, max: 2 }];
    if (this.diedOf === 'lightningBolt') t.push({ item: 'bowl', min: 1, max: 1, noLooting: true });
    return t;
  }

  // --- sounds ---------------------------------------------------------------

  /** vanilla getAmbientSound: only a grown one, on dry land */
  override ambientSound(): string | null {
    return !this.inWater && this.onGround && !this.isBaby() ? 'entity.turtle.ambient_land' : null;
  }
  override hurtSound(): string {
    return this.isBaby() ? 'entity.turtle.hurt_baby' : 'entity.turtle.hurt';
  }
  override deathSound(): string {
    return this.isBaby() ? 'entity.turtle.death_baby' : 'entity.turtle.death';
  }
  /** vanilla playStepSound: a shamble (at 0.15) */
  override stepSound(): string {
    return this.isBaby() ? 'entity.turtle.shamble_baby' : 'entity.turtle.shamble';
  }
  /** vanilla getSwimSound */
  protected override swimSound(): string {
    return 'entity.turtle.swim';
  }
  /** vanilla Turtle.playSwimSound: half as loud again as anything else's */
  protected override playSwimSound(): void {
    const v = Math.min(1, Math.sqrt(this.dx * this.dx * 0.2 + this.dy * this.dy + this.dz * this.dz * 0.2) * 0.35);
    this.playSound(this.swimSound(), v * 1.5, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.4);
  }
  /** vanilla nextStep: a step (or stroke) sounds every little way */
  protected override nextStepDistance(): number {
    return this.moveDist + 0.15;
  }

  // --- saving ---------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    const [hx, hy, hz] = this.homePos, [tx, ty, tz] = this.travelPos;
    return { ...super.saveData(), HomePosX: hx, HomePosY: hy, HomePosZ: hz, HasEgg: this.hasEgg, TravelPosX: tx, TravelPosY: ty, TravelPosZ: tz };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.homePos = [Number(d.HomePosX ?? 0), Number(d.HomePosY ?? 0), Number(d.HomePosZ ?? 0)];
    super.loadData(d);
    this.hasEgg = d.HasEgg === true;
    this.travelPos = [Number(d.TravelPosX ?? 0), Number(d.TravelPosY ?? 0), Number(d.TravelPosZ ?? 0)];
  }
}

// ---------------------------------------------------------------------------
// its movement

/**
 * vanilla Turtle.TurtleMoveControl: in the water it floats up a touch each tick, and it's slowed far from home (and a
 * baby more); on land it's slowed a lot. Heading for a point it turns straight to it and eases its speed toward what it
 * wants an eighth of the way a tick, rising or sinking as the point is above or below
 */
class TurtleMoveControl extends MoveControl {
  constructor(readonly turtle: Turtle) {
    super(turtle);
  }

  private updateSpeed(): void {
    const t = this.turtle;
    if (t.inWater) {
      t.dy += 0.005;
      if (!t.homeWithin(16)) t.setSpeed(Math.max(t.speed / 2, 0.08));
      if (t.isBaby()) t.setSpeed(Math.max(t.speed / 3, 0.06));
    } else if (t.onGround) t.setSpeed(Math.max(t.speed / 2, 0.06));
  }

  override tick(): void {
    this.updateSpeed();
    const t = this.turtle;
    if (this.operation === MoveOp.MOVE_TO && !t.navigation.isDone()) {
      const d0 = this.wantedX - t.x, d2 = this.wantedZ - t.z;
      let d1 = this.wantedY - t.y;
      const d3 = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
      if (d3 < 1e-5) {
        t.setSpeed(0);
        return;
      }
      d1 /= d3;
      t.yaw = rotlerp(t.yaw, Math.atan2(d2, d0) * RAD - 90, 90);
      t.bodyYaw = t.yaw;
      const f1 = this.speedModifier * t.moveSpeedAttr;
      t.setSpeed(t.speed + (f1 - t.speed) * 0.125);
      t.dy += t.speed * d1 * 0.1;
    } else t.setSpeed(0);
  }
}

/**
 * vanilla Turtle.TurtlePathNavigation: amphibious; while it's travelling only water will do to head for, otherwise
 * anywhere with something under it
 */
class TurtlePathNavigation extends AmphibiousPathNavigation {
  override isStableDestination(x: number, y: number, z: number): boolean {
    const m = this.mob;
    if (m instanceof Turtle && m.travelling) return nameAt(m.level.world, x, y, z) === 'water';
    return !(FLAGS[m.level.world.getState(x, y - 1, z)] & F_AIR);
  }
}

// ---------------------------------------------------------------------------
// its goals

/** vanilla Turtle.TurtlePanicGoal: hurt (or burning), it makes for the nearest water within 7, else anywhere */
class TurtlePanicGoal extends PanicGoal {
  override canUse(): boolean {
    if (!this.shouldPanic()) return false;
    const w = this.lookForWater(7);
    if (w) {
      [this.px, this.py, this.pz] = w;
      return true;
    }
    return this.findRandomPosition();
  }
}

/** vanilla Turtle.TurtleBreedGoal: not while it carries eggs (the breeding itself: Turtle.spawnChildFromBreeding) */
class TurtleBreedGoal extends BreedGoal {
  constructor(readonly turtle: Turtle, speed: number) {
    super(turtle, speed);
  }
  override canUse(): boolean {
    return super.canUse() && !this.turtle.hasEgg;
  }
}

/**
 * vanilla Turtle.TurtleLayEggGoal: carrying eggs within 9 of home, it finds sand with room over it (within 16) and,
 * there and out of the water, digs for ten seconds and lays one to four eggs on it; then it's in love again a while
 */
class TurtleLayEggGoal extends MoveToBlockGoal {
  constructor(readonly turtle: Turtle, speed: number) {
    super(turtle, speed, 16);
  }
  override canUse(): boolean {
    return this.turtle.hasEgg && this.turtle.homeWithin(9) ? super.canUse() : false;
  }
  override canContinueToUse(): boolean {
    return super.canContinueToUse() && this.turtle.hasEgg && this.turtle.homeWithin(9);
  }
  override tick(): void {
    super.tick();
    const t = this.turtle;
    if (t.inWater || !this.isReachedTarget()) return;
    if (t.layEggCounter < 1) t.setLayingEgg(true);
    else if (t.layEggCounter > this.adjustedTickDelay(200)) {
      const lvl = t.level;
      lvl.sound.play('entity.turtle.lay_egg', Math.floor(t.x) + 0.5, Math.floor(t.y) + 0.5, Math.floor(t.z) + 0.5, 0.3, 0.9 + lvl.random.nextFloat() * 0.2);
      const eggs = getBlock('turtle_egg').state({ eggs: t.random.nextInt(4) + 1 });
      lvl.setBlock(this.bx, this.by + 1, this.bz, eggs);
      lvl.gameEvent('block_place', this.bx + 0.5, this.by + 1.5, this.bz + 0.5, { entity: t, state: eggs });
      t.hasEgg = false;
      t.setLayingEgg(false);
      // (vanilla setInLoveTime(600); it's resting from the breeding still, so that's soon undone)
      t.inLove = 600;
    }
    if (t.isLayingEgg()) t.layEggCounter++;
  }
  protected isValidTarget(x: number, y: number, z: number): boolean {
    const w = this.turtle.level.world;
    return FLAGS[w.getState(x, y + 1, z)] & F_AIR ? isSand(w, x, y, z) : false;
  }
}

/**
 * vanilla Turtle.TurtleGoToWaterGoal: ashore (a baby always, a grown one when it isn't carrying eggs or going home), it
 * looks for water two below its feet within 24 and goes to the top of it, giving up after a minute. (Vanilla gives a
 * baby twice the speed, but asks while the turtle is being made, when none is yet a baby: it's always the speed given)
 */
class TurtleGoToWaterGoal extends MoveToBlockGoal {
  constructor(readonly turtle: Turtle, speed: number) {
    super(turtle, speed, 24);
    this.verticalSearchStart = -1;
  }
  override canContinueToUse(): boolean {
    return !this.turtle.inWater && this.tryTicks <= 1200 && this.isValidTarget(this.bx, this.by, this.bz);
  }
  override canUse(): boolean {
    const t = this.turtle;
    if (t.isBaby() && !t.inWater) return super.canUse();
    return !t.goingHome && !t.inWater && !t.hasEgg ? super.canUse() : false;
  }
  override shouldRecalculatePath(): boolean {
    return this.tryTicks % 160 === 0;
  }
  protected isValidTarget(x: number, y: number, z: number): boolean {
    return nameAt(this.turtle.level.world, x, y, z) === 'water';
  }
}

/**
 * vanilla Turtle.TurtleGoHomeGoal (no flags: it runs alongside the rest): a grown one carrying eggs heads home, and
 * now and then (once in 350 tries) so does one more than 64 blocks from it; a leg at a time toward home, until it's
 * within 7, stuck, or has spent half a minute near without getting there
 */
class TurtleGoHomeGoal extends Goal {
  private stuck = false;
  private closeToHomeTryTicks = 0;
  constructor(readonly turtle: Turtle, readonly speed: number) {
    super();
  }
  canUse(): boolean {
    const t = this.turtle;
    if (t.isBaby()) return false;
    if (t.hasEgg) return true;
    return t.random.nextInt(reducedTickDelay(700)) !== 0 ? false : !t.homeWithin(64);
  }
  override start(): void {
    this.turtle.goingHome = true;
    this.stuck = false;
    this.closeToHomeTryTicks = 0;
  }
  override stop(): void {
    this.turtle.goingHome = false;
  }
  override canContinueToUse(): boolean {
    return !this.turtle.homeWithin(7) && !this.stuck && this.closeToHomeTryTicks <= this.adjustedTickDelay(600);
  }
  override tick(): void {
    const t = this.turtle;
    const [hx, , hz] = t.homePos;
    const near = t.homeWithin(16);
    if (near) this.closeToHomeTryTicks++;
    if (!t.navigation.isDone()) return;
    const tx = hx + 0.5, tz = hz + 0.5;
    let p = defaultRandomPosTowards(t, 16, 3, tx, tz, Math.PI / 10) ?? defaultRandomPosTowards(t, 8, 7, tx, tz, Math.PI / 2);
    // (far off, a leg that ends out of the water is tried again more widely)
    if (p && !near && nameAt(t.level.world, p[0], p[1], p[2]) !== 'water') p = defaultRandomPosTowards(t, 16, 5, tx, tz, Math.PI / 2);
    if (!p) {
      this.stuck = true;
      return;
    }
    t.navigation.moveTo(p[0] + 0.5, p[1], p[2] + 0.5, this.speed);
  }
}

/**
 * vanilla Turtle.TurtleTravelGoal (no flags): in the water, not going home nor carrying eggs, it picks somewhere up to
 * 512 off each way and 4 up or down (never above the sea's surface) and swims a leg of the way, in water, until the
 * leg's done; then it picks again
 */
class TurtleTravelGoal extends Goal {
  private stuck = false;
  constructor(readonly turtle: Turtle, readonly speed: number) {
    super();
  }
  canUse(): boolean {
    const t = this.turtle;
    return !t.goingHome && !t.hasEgg && t.inWater;
  }
  override start(): void {
    const t = this.turtle, r = t.random;
    const k = r.nextInt(1025) - 512;
    let l = r.nextInt(9) - 4;
    const i1 = r.nextInt(1025) - 512;
    if (l + t.y > SEA_LEVEL - 1) l = 0;
    t.travelPos = [Math.floor(k + t.x), Math.floor(l + t.y), Math.floor(i1 + t.z)];
    t.travelling = true;
    this.stuck = false;
  }
  override tick(): void {
    const t = this.turtle;
    if (!t.navigation.isDone()) return;
    const [x, , z] = t.travelPos;
    let p = defaultRandomPosTowards(t, 16, 3, x + 0.5, z + 0.5, Math.PI / 10) ?? defaultRandomPosTowards(t, 8, 7, x + 0.5, z + 0.5, Math.PI / 2);
    // (vanilla hasChunksAt: not where the world isn't loaded 34 blocks round)
    if (p && !chunksAround(t.level, p[0], p[2], 34)) p = null;
    if (!p) {
      this.stuck = true;
      return;
    }
    t.navigation.moveTo(p[0] + 0.5, p[1], p[2] + 0.5, this.speed);
  }
  override canContinueToUse(): boolean {
    const t = this.turtle;
    return !t.navigation.isDone() && !this.stuck && !t.goingHome && !t.isInLove() && !t.hasEgg;
  }
  override stop(): void {
    this.turtle.travelling = false;
  }
}

/** vanilla Level.hasChunksAt: every chunk within `r` of (x, z) loaded */
function chunksAround(level: Level, x: number, z: number, r: number): boolean {
  for (let cx = (x - r) >> 4; cx <= (x + r) >> 4; cx++) for (let cz = (z - r) >> 4; cz <= (z + r) >> 4; cz++) if (!level.world.getChunk(cx, cz)) return false;
  return true;
}

/** vanilla Turtle.TurtleRandomStrollGoal: a stroll ashore now and then, but not going home or carrying eggs */
class TurtleRandomStrollGoal extends RandomStrollGoal {
  constructor(readonly turtle: Turtle, speed: number, interval: number) {
    super(turtle, speed, interval);
  }
  override canUse(): boolean {
    const t = this.turtle;
    return !t.inWater && !t.goingHome && !t.hasEgg ? super.canUse() : false;
  }
}
