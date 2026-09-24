// The cat (vanilla 1.21 Cat): strays about villages, and a black one in each swamp hut, in eleven coats. A stray
// keeps its distance from players, but creeps up, crouching, on one standing still with raw cod or salmon, and one
// fish in three wins it over. A tame cat follows its owner (teleporting when it has to), sits when told, lies on
// beds and sits on chests, lit furnaces and the feet of beds, curls up at its owner's feet while they sleep and in
// the morning may leave them a present; it purrs, wears a collar you can dye, stalks rabbits, frightens creepers
// off, and lands on its feet from any height.

import { Animal, BreedGoal, DYE_COLORS, TemptGoal } from './animals';
import { TamableAnimal, SitWhenOrderedToGoal, FollowOwnerGoal, NonTameRandomTargetGoal, TamableAnimalPanicGoal } from './tamable';
import type { Level } from '../game/level';
import type { LootEntry, Mob, SpawnGroup, SpawnReason } from './mob';
import { Goal, Flag } from './ai/goal';
import { AvoidEntityGoal, FloatGoal, LeapAtTargetGoal, LookAtPlayerGoal, MoveToBlockGoal, OcelotAttackGoal, WaterAvoidingRandomStrollGoal } from './ai/goals';
import type { LivingEntity } from './living';
import type { Player } from './player';
import { ItemEntity } from './itemEntity';
import { ITEMS, ItemStack } from '../item/item';
import { AABB } from '../core/aabb';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_COLLIDE, F_WATER, F_LAVA } from '../world/block';
import { ChestBlockEntity } from '../world/blockEntity';
import { moonPhase, timeOfDay } from '../render/environment';
import type { Rand } from '../core/rng';

// ---------------------------------------------------------------------------
// coats

/** vanilla CatVariant, in registry order; each is textures/entity/cat/<id>.png */
export const CAT_VARIANTS = ['tabby', 'black', 'red', 'siamese', 'british_shorthair', 'calico', 'persian', 'ragdoll', 'white', 'jellie', 'all_black'] as const;
export type CatVariant = (typeof CAT_VARIANTS)[number];
/** vanilla #default_spawns: every coat but the all-black (which #full_moon_spawns adds) */
const DEFAULT_SPAWNS: readonly CatVariant[] = CAT_VARIANTS.filter((v) => v !== 'all_black');
/** vanilla DimensionType.MOON_BRIGHTNESS_PER_PHASE */
const MOON_BRIGHTNESS = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75];

function catVariant(id: unknown): CatVariant {
  const s = String(id ?? '').replace(/^minecraft:/, '');
  return (CAT_VARIANTS as readonly string[]).includes(s) ? (s as CatVariant) : 'black';
}

/** vanilla #cat_food */
const CAT_FOOD = new Set(['cod', 'salmon']);

/**
 * vanilla #cats_spawn_as_black and #cats_spawn_in (a swamp hut, both): whether a block is inside one of a swamp hut's
 * pieces. The swamp hut sets it once it's in the game; until then there's nowhere.
 */
export const catHooks: { inSwampHut: (level: Level, x: number, y: number, z: number) => boolean } = { inSwampHut: () => false };

/** vanilla gameplay/cat_morning_gift */
const MORNING_GIFT: [string, number][] = [
  ['rabbit_hide', 10], ['rabbit_foot', 10], ['chicken', 10], ['feather', 10], ['rotten_flesh', 10], ['string', 10], ['phantom_membrane', 2],
];

function rollGift(r: Rand): string {
  let k = r.nextInt(MORNING_GIFT.reduce((a, g) => a + g[1], 0));
  for (const [id, w] of MORNING_GIFT) if ((k -= w) < 0) return id;
  return MORNING_GIFT[0][0];
}

const STEP: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

export class Cat extends TamableAnimal {
  readonly type = 'cat';
  protected adultWidth = 0.6;
  protected adultHeight = 0.7;
  /** vanilla DATA_VARIANT_ID: black to begin with */
  variant: CatVariant = 'black';
  /** vanilla DATA_COLLAR_COLOR (a DyeColor id): red to begin with */
  collarColor = 14;
  /** vanilla IS_LYING (on a bed, or at its owner's feet) and RELAX_STATE_ONE (settling down there, head up) */
  lying = false;
  relaxStateOne = false;
  lieDownAmount = 0;
  lieDownAmountO = 0;
  lieDownAmountTail = 0;
  lieDownAmountOTail = 0;
  relaxStateOneAmount = 0;
  relaxStateOneAmountO = 0;
  /** vanilla Pose.CROUCHING: creeping up on food or prey */
  crouching = false;
  private temptGoal: CatTemptGoal | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 0.7);
    this.maxHealth = this.health = 10;
    this.moveSpeedAttr = 0.3;
    this.attackDamage = 3;
  }

  protected registerGoals(): void {
    this.temptGoal = new CatTemptGoal(this, 0.6, CAT_FOOD, true);
    this.goalSelector.addGoal(1, new FloatGoal(this));
    this.goalSelector.addGoal(1, new TamableAnimalPanicGoal(this, 1.5));
    this.goalSelector.addGoal(2, new SitWhenOrderedToGoal(this));
    this.goalSelector.addGoal(3, new CatRelaxOnOwnerGoal(this));
    this.goalSelector.addGoal(4, this.temptGoal);
    // (vanilla reassessTameGoals: only a stray has it)
    this.goalSelector.addGoal(4, new CatAvoidPlayersGoal(this, 16, 0.8, 1.33));
    this.goalSelector.addGoal(5, new CatLieOnBedGoal(this, 1.1, 8));
    this.goalSelector.addGoal(6, new FollowOwnerGoal(this, 1.0, 10, 5));
    this.goalSelector.addGoal(7, new CatSitOnBlockGoal(this, 0.8));
    this.goalSelector.addGoal(8, new LeapAtTargetGoal(this, 0.3));
    this.goalSelector.addGoal(9, new OcelotAttackGoal(this));
    this.goalSelector.addGoal(10, new BreedGoal(this, 0.8));
    this.goalSelector.addGoal(11, new WaterAvoidingRandomStrollGoal(this, 0.8, 1.0000001e-5));
    this.goalSelector.addGoal(12, new LookAtPlayerGoal(this, 10));
    this.targetSelector.addGoal(1, new NonTameRandomTargetGoal(this, (e) => e.type === 'rabbit', false));
    // (vanilla NonTameRandomTargetGoal<Turtle>(BABY_ON_LAND_SELECTOR): baby turtles on land — no turtles yet)
  }

  // --- spawning and breeding ------------------------------------------------------------------------------------

  /**
   * vanilla Cat.finalizeSpawn: any coat but the all-black, which joins them under a full moon; in a swamp hut it's
   * always the all-black one, and it stays
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    super.finalizeSpawn(reason, group);
    const pool = MOON_BRIGHTNESS[moonPhase(this.level.dayTime)] > 0.9 ? CAT_VARIANTS : DEFAULT_SPAWNS;
    this.variant = pool[this.level.random.nextInt(pool.length)];
    if (catHooks.inSwampHut(this.level, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))) {
      this.variant = 'all_black';
      this.persistenceRequired = true;
    }
  }

  isFood(s: ItemStack): boolean {
    return CAT_FOOD.has(s.item.id);
  }

  /** vanilla Cat.getBreedOffspring: a coat from either parent, and a tame pair's kitten is theirs, collared like one */
  makeBaby(partner: Animal): Animal {
    const c = new Cat(this.level);
    if (partner instanceof Cat) {
      c.variant = this.random.nextBool() ? this.variant : partner.variant;
      if (this.isTame()) {
        c.ownerUUID = this.ownerUUID;
        c.setTame(true, true);
        c.collarColor = this.random.nextBool() ? this.collarColor : partner.collarColor;
      }
    }
    return c;
  }

  /** vanilla Cat.canMate: only two tame cats */
  override canMate(o: Animal): boolean {
    if (!this.isTame() || !(o instanceof Cat) || !o.isTame()) return false;
    return super.canMate(o);
  }

  /** vanilla Cat.removeWhenFarAway: a stray that's been about two minutes wanders off when no one's near */
  override removeWhenFarAway(): boolean {
    return !this.isTame() && this.tickCount > 2400;
  }

  // --- taming and feeding ---------------------------------------------------------------------------------------

  /** vanilla Cat.tryToTame: one fish in three, and it sits down where it is */
  private tryToTame(p: Player): void {
    if (this.random.nextInt(3) === 0) {
      this.tameBy(p);
      this.orderedToSit = true;
      this.spawnTamingParticles(true);
    } else this.spawnTamingParticles(false);
  }

  /** vanilla Cat.usePlayerItem: it eats its fish with a crunch */
  protected override usePlayerItem(p: Player): void {
    this.playSound('entity.cat.eat', 1, 1);
    super.usePlayerItem(p);
  }

  /** vanilla Cat.mobInteract */
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (this.isTame()) {
      if (this.isOwnedBy(p)) {
        if (stack && stack.item.id.endsWith('_dye')) {
          const c = DYE_COLORS.indexOf(stack.item.id.slice(0, -4));
          if (c >= 0 && c !== this.collarColor) {
            this.collarColor = c;
            if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
            this.persistenceRequired = true;
            return true;
          }
        } else if (stack && this.isFood(stack) && this.health < this.maxHealth) {
          this.usePlayerItem(p);
          this.heal(stack.item.food?.nutrition ?? 1);
          return true;
        }
        if (super.interact(p, stack)) return true;
        this.orderedToSit = !this.orderedToSit;
        return true;
      }
    } else if (stack && this.isFood(stack)) {
      this.usePlayerItem(p);
      this.tryToTame(p);
      this.persistenceRequired = true;
      return true;
    }
    const used = super.interact(p, stack);
    if (used) this.persistenceRequired = true;
    return used;
  }

  override variantId(): string {
    return this.variant;
  }

  // --- ticking --------------------------------------------------------------------------------------------------

  override tick(): void {
    super.tick();
    if (!this.isAlive) return;
    // vanilla Cat.tick: a stray drawn to your fish mews for it
    if (this.temptGoal?.isRunning && !this.isTame() && this.tickCount % 100 === 0) this.playSound('entity.cat.beg_for_food', 1, 1);
    this.handleLieDown();
  }

  /** vanilla handleLieDown: purring while it lies there, and the lying down and settling in eased */
  private handleLieDown(): void {
    if ((this.lying || this.relaxStateOne) && this.tickCount % 5 === 0) this.playSound('entity.cat.purr', 0.6 + 0.4 * (this.random.nextFloat() - this.random.nextFloat()), 1);
    this.lieDownAmountO = this.lieDownAmount;
    this.lieDownAmountOTail = this.lieDownAmountTail;
    if (this.lying) {
      this.lieDownAmount = Math.min(1, this.lieDownAmount + 0.15);
      this.lieDownAmountTail = Math.min(1, this.lieDownAmountTail + 0.08);
    } else {
      this.lieDownAmount = Math.max(0, this.lieDownAmount - 0.22);
      this.lieDownAmountTail = Math.max(0, this.lieDownAmountTail - 0.13);
    }
    this.relaxStateOneAmountO = this.relaxStateOneAmount;
    this.relaxStateOneAmount = this.relaxStateOne ? Math.min(1, this.relaxStateOneAmount + 0.1) : Math.max(0, this.relaxStateOneAmount - 0.13);
  }

  /**
   * vanilla Cat.customServerAiStep: creeping (crouched) at the slow speed it stalks with, sprinting at the fast one it
   * runs or pounces with
   */
  protected override customServerAiStep(): void {
    super.customServerAiStep();
    const mc = this.moveControl;
    if (mc.hasWanted()) {
      const d = mc.speedModifier;
      this.crouching = d === 0.6;
      this.sprinting = d === 1.33;
    } else {
      this.crouching = false;
      this.sprinting = false;
    }
  }

  /** vanilla Cat.causeFallDamage: it always lands on its feet */
  protected override causeFallDamage(_dist: number): void {}

  /** vanilla Cat.hiss (a phantom about to swoop takes fright at it — no phantoms yet) */
  hiss(): void {
    this.playSound('entity.cat.hiss', this.soundVolume(), this.voicePitch());
  }

  // --- looks (read by the renderer) -----------------------------------------------------------------------------

  texture(): string {
    return 'cat_' + this.variant;
  }
  lieDown(p: number): number {
    return this.lieDownAmountO + (this.lieDownAmount - this.lieDownAmountO) * p;
  }
  lieDownTail(p: number): number {
    return this.lieDownAmountOTail + (this.lieDownAmountTail - this.lieDownAmountOTail) * p;
  }
  relaxStateOneAt(p: number): number {
    return this.relaxStateOneAmountO + (this.relaxStateOneAmount - this.relaxStateOneAmountO) * p;
  }

  // --- sounds ---------------------------------------------------------------------------------------------------

  /** vanilla Cat.getAmbientSound: a tame cat meows (purrs when it's in love, a purring meow one time in four); a stray's cry */
  override ambientSound(): string {
    if (!this.isTame()) return 'entity.cat.stray_ambient';
    if (this.isInLove()) return 'entity.cat.purr';
    return this.random.nextInt(4) === 0 ? 'entity.cat.purreow' : 'entity.cat.ambient';
  }
  override hurtSound(): string {
    return 'entity.cat.hurt';
  }
  override deathSound(): string {
    return 'entity.cat.death';
  }
  /** vanilla entities/cat: 0–2 string */
  override lootTable(): LootEntry[] {
    return [{ item: 'string', min: 0, max: 2 }];
  }

  // --- saving ---------------------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), variant: this.variant, CollarColor: this.collarColor };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.variant = catVariant(d.variant);
    if (d.CollarColor !== undefined) this.collarColor = Number(d.CollarColor);
  }
}

/** vanilla ChestBlock.isCatSittingOnChest: a cat sitting on a chest keeps its lid shut */
export function catSittingOn(level: Level, x: number, y: number, z: number): boolean {
  return level.getEntities(new AABB(x, y + 1, z, x + 1, y + 2, z + 1), (e) => e instanceof Cat && e.inSittingPose).length > 0;
}

/**
 * vanilla LivingEntity.randomTeleport(x, y, z, false): down to the first floor below the spot, if it's loaded and
 * the cat fits there out of any liquid; otherwise it stays put
 */
function randomTeleport(m: Mob, x: number, y: number, z: number): boolean {
  const w = m.level.world;
  const ox = m.x, oy = m.y, oz = m.z;
  let by = Math.floor(y);
  const bx = Math.floor(x), bz = Math.floor(z);
  if (!w.isLoaded(bx, bz)) return false;
  let floor = false;
  while (!floor && by > w.dim.minY) {
    if (FLAGS[w.getState(bx, by - 1, bz)] & F_COLLIDE) floor = true;
    else {
      by--;
      y -= 1;
    }
  }
  if (!floor) return false;
  m.setPos(x, y, z);
  let wet = false;
  const b = m.bb;
  for (let ix = Math.floor(b.minX); ix <= Math.floor(b.maxX - 1e-7); ix++)
    for (let iy = Math.floor(b.minY); iy <= Math.floor(b.maxY - 1e-7); iy++)
      for (let iz = Math.floor(b.minZ); iz <= Math.floor(b.maxZ - 1e-7); iz++) if (FLAGS[w.getState(ix, iy, iz)] & (F_WATER | F_LAVA)) wet = true;
  if (!m.isFree(b) || wet) {
    m.setPos(ox, oy, oz);
    return false;
  }
  m.xo = m.x;
  m.yo = m.y;
  m.zo = m.z;
  m.navigation.stop();
  return true;
}

// ---------------------------------------------------------------------------
// goals

/**
 * vanilla Cat.CatTemptGoal: only a stray is tempted, and it's skittish about it (a player who moves or turns puts
 * it off), unless it has taken to that player for the moment
 */
class CatTemptGoal extends TemptGoal {
  private selectedPlayer: Player | null = null;
  constructor(readonly cat: Cat, speed: number, items: Set<string>, canScare: boolean) {
    super(cat, speed, items, canScare);
  }
  override tick(): void {
    super.tick();
    const r = this.cat.random;
    if (this.selectedPlayer === null && r.nextInt(this.adjustedTickDelay(600)) === 0) this.selectedPlayer = this.player;
    else if (r.nextInt(this.adjustedTickDelay(500)) === 0) this.selectedPlayer = null;
  }
  protected override canScare(): boolean {
    return this.selectedPlayer !== null && this.selectedPlayer === this.player ? false : super.canScare();
  }
  override canUse(): boolean {
    return super.canUse() && !this.cat.isTame();
  }
}

/** vanilla Cat.CatAvoidEntityGoal<Player>: a stray runs from a player (not one in creative) who comes within 16 */
class CatAvoidPlayersGoal extends AvoidEntityGoal {
  constructor(readonly cat: Cat, maxDist: number, walk: number, sprint: number) {
    super(cat, (e) => e.type === 'player' && (e as Player).gameMode !== 'creative' && (e as Player).gameMode !== 'spectator', maxDist, walk, sprint);
  }
  override canUse(): boolean {
    return !this.cat.isTame() && super.canUse();
  }
  override canContinueToUse(): boolean {
    return !this.cat.isTame() && super.canContinueToUse();
  }
}

/**
 * vanilla Cat.CatRelaxOnOwnerGoal: while its owner sleeps (within 10 blocks), it goes to the foot of their bed and
 * settles there (unless another cat has), head up at first, then lying down; and when they wake in the morning,
 * seven times in ten it's been out and brought them something
 */
class CatRelaxOnOwnerGoal extends Goal {
  private ownerPlayer: Player | null = null;
  private goalPos: [number, number, number] | null = null;
  private onBedTicks = 0;
  constructor(readonly cat: Cat) {
    super();
  }
  canUse(): boolean {
    const c = this.cat;
    if (!c.isTame() || c.orderedToSit) return false;
    const o = c.owner();
    if (!o || o.type !== 'player') return false;
    const p = o as Player;
    this.ownerPlayer = p;
    if (!p.isSleeping() || c.distanceToSqr(p.x, p.y, p.z) > 100) return false;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const st = c.level.world.getState(bx, by, bz);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (!b.name.endsWith('_bed')) return false;
    const s = STEP[b.get<string>(st, 'facing')] ?? [0, 0];
    this.goalPos = [bx - s[0], by, bz - s[1]];
    return !this.spaceIsOccupied();
  }
  private spaceIsOccupied(): boolean {
    const [x, y, z] = this.goalPos!;
    return this.cat.level.getEntities(new AABB(x - 2, y - 2, z - 2, x + 3, y + 3, z + 3), (e) => e instanceof Cat && e !== this.cat && (e.lying || e.relaxStateOne)).length > 0;
  }
  override canContinueToUse(): boolean {
    const c = this.cat, p = this.ownerPlayer;
    return c.isTame() && !c.orderedToSit && !!p && p.isSleeping() && !!this.goalPos && !this.spaceIsOccupied();
  }
  override start(): void {
    const g = this.goalPos;
    if (!g) return;
    this.cat.inSittingPose = false;
    this.cat.navigation.moveTo(g[0], g[1], g[2], 1.1);
  }
  override stop(): void {
    const c = this.cat;
    c.lying = false;
    // (vanilla getTimeOfDay(1): 0.77 to 0.8 is just after dawn, when a night's sleep ends)
    const f = timeOfDay(c.level.skyTime());
    if (this.ownerPlayer && this.ownerPlayer.sleepCounter >= 100 && f > 0.77 && f < 0.8 && c.level.random.nextFloat() < 0.7) this.giveMorningGift();
    this.onBedTicks = 0;
    c.relaxStateOne = false;
    c.navigation.stop();
  }
  /** vanilla giveMorningGift: it pops up somewhere near, and the present lands in front of it */
  private giveMorningGift(): void {
    const c = this.cat, r = c.random;
    // (a leashed cat's goes by the knot — no leads yet)
    const bx = Math.floor(c.x), by = Math.floor(c.y), bz = Math.floor(c.z);
    randomTeleport(c, bx + r.nextInt(11) - 5, by + r.nextInt(5) - 2, bz + r.nextInt(11) - 5);
    const it = ITEMS.get(rollGift(r));
    if (!it) return;
    const yaw = (c.bodyYaw * Math.PI) / 180;
    const e = new ItemEntity(c.level, new ItemStack(it, 1));
    const lr = c.level.random;
    e.moveTo(Math.floor(c.x) - Math.sin(yaw), Math.floor(c.y), Math.floor(c.z) + Math.cos(yaw), lr.nextFloat() * 360, 0);
    e.dx = lr.nextDouble() * 0.2 - 0.1;
    e.dy = 0.2;
    e.dz = lr.nextDouble() * 0.2 - 0.1;
    c.level.addEntity(e);
  }
  override tick(): void {
    const c = this.cat, p = this.ownerPlayer, g = this.goalPos;
    if (!p || !g) return;
    c.inSittingPose = false;
    c.navigation.moveTo(g[0], g[1], g[2], 1.1);
    if (c.distanceToSqr(p.x, p.y, p.z) < 2.5) {
      this.onBedTicks++;
      if (this.onBedTicks > this.adjustedTickDelay(16)) {
        c.lying = true;
        c.relaxStateOne = false;
      } else {
        c.lookAtEntity(p, 45, 45);
        c.relaxStateOne = true;
      }
    } else c.lying = false;
  }
}

/** vanilla CatLieOnBedGoal: a tame cat not told to sit finds a bed nearby with room above it, and lies down on it */
class CatLieOnBedGoal extends MoveToBlockGoal {
  constructor(readonly cat: Cat, speed: number, range: number) {
    super(cat, speed, range, 6);
    this.verticalSearchStart = -2;
  }
  override canUse(): boolean {
    return this.cat.isTame() && !this.cat.orderedToSit && !this.cat.lying && super.canUse();
  }
  override start(): void {
    super.start();
    this.cat.inSittingPose = false;
  }
  protected override nextStartDelay(): number {
    return 40;
  }
  override stop(): void {
    super.stop();
    this.cat.lying = false;
  }
  override tick(): void {
    super.tick();
    this.cat.inSittingPose = false;
    if (!this.isReachedTarget()) this.cat.lying = false;
    else if (!this.cat.lying) this.cat.lying = true;
  }
  protected isValidTarget(x: number, y: number, z: number): boolean {
    const w = this.cat.level.world;
    return (FLAGS[w.getState(x, y + 1, z)] & F_AIR) !== 0 && BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name.endsWith('_bed');
  }
}

/**
 * vanilla CatSitOnBlockGoal: a tame cat not told to sit goes and sits on a chest no one has open, a lit furnace, or
 * the foot of a bed, with room above it
 */
class CatSitOnBlockGoal extends MoveToBlockGoal {
  constructor(readonly cat: Cat, speed: number) {
    super(cat, speed, 8);
  }
  override canUse(): boolean {
    return this.cat.isTame() && !this.cat.orderedToSit && super.canUse();
  }
  override start(): void {
    super.start();
    this.cat.inSittingPose = false;
  }
  override stop(): void {
    super.stop();
    this.cat.inSittingPose = false;
  }
  override tick(): void {
    super.tick();
    this.cat.inSittingPose = this.isReachedTarget();
  }
  protected isValidTarget(x: number, y: number, z: number): boolean {
    const w = this.cat.level.world;
    if (!(FLAGS[w.getState(x, y + 1, z)] & F_AIR)) return false;
    const st = w.getState(x, y, z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name === 'chest') {
      const be = w.getBlockEntity(x, y, z);
      return !(be instanceof ChestBlockEntity) || be.openCount < 1;
    }
    if (b.name === 'furnace' && b.get(st, 'lit') === true) return true;
    return b.name.endsWith('_bed') && b.get(st, 'part') !== 'head';
  }
}
