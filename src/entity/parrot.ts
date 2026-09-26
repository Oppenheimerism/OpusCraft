// The parrot (vanilla 1.21 Parrot): flies about the jungle in five colours, perching on the trees, keeping company
// with whatever other mobs are about and now and then mimicking one nearby (or, rarely, any mob at all). Seeds tame
// it, one in ten; a cookie kills it. A tame parrot follows its owner, sits when told, and rides on their shoulder
// (vanilla ShoulderRidingEntity: after five seconds off it, whenever it bumps into them) until they jump off
// something, swim, fly, sleep or get hurt. It flaps as it goes and drifts slowly down when it isn't flying, takes no
// fall damage, and never breeds.

import type { Animal } from './animals';
import { TamableAnimal, SitWhenOrderedToGoal, FollowOwnerGoal, TamableAnimalPanicGoal } from './tamable';
import type { Level } from '../game/level';
import { Mob, type LootEntry, type SpawnGroup, type SpawnReason, type SavedEntity } from './mob';
import type { Entity } from './entity';
import type { Player } from './player';
import type { ItemStack } from '../item/item';
import { Goal } from './ai/goal';
import { FloatGoal, FollowMobGoal, LookAtPlayerGoal, WaterAvoidingRandomFlyingGoal, landRandomPos } from './ai/goals';
import { FlyingPathNavigation, type PathNavigation } from './ai/navigation';
import { FlyingMoveControl } from './ai/controls';
import { PathType } from './ai/pathfinder';
import { MOB_EFFECTS, MobEffectInstance } from './effects';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_LEAVES } from '../world/block';
import { shoulderHooks } from './shoulder';

/** vanilla Parrot.Variant, by id (textures/entity/parrot/parrot_<name>.png; the gray one's file is parrot_grey) */
export const PARROT_VARIANTS = ['red_blue', 'blue', 'green', 'yellow_blue', 'gray'] as const;

/** vanilla #parrot_food: the seeds (torchflower seeds and pitcher pods aren't in the game yet) */
const PARROT_FOOD = new Set(['wheat_seeds', 'melon_seeds', 'pumpkin_seeds', 'beetroot_seeds', 'torchflower_seeds', 'pitcher_pod']);
/** vanilla #parrot_poisonous_food */
const POISONOUS = new Set(['cookie']);

/** vanilla Parrot.MOB_SOUND_MAP: whom it mimics, and with what */
const IMITATIONS: Record<string, string> = {
  blaze: 'blaze', bogged: 'bogged', breeze: 'breeze', cave_spider: 'spider', creeper: 'creeper', drowned: 'drowned',
  elder_guardian: 'elder_guardian', ender_dragon: 'ender_dragon', endermite: 'endermite', evoker: 'evoker', ghast: 'ghast',
  guardian: 'guardian', hoglin: 'hoglin', husk: 'husk', illusioner: 'illusioner', magma_cube: 'magma_cube', phantom: 'phantom',
  piglin: 'piglin', piglin_brute: 'piglin_brute', pillager: 'pillager', ravager: 'ravager', shulker: 'shulker',
  silverfish: 'silverfish', skeleton: 'skeleton', slime: 'slime', spider: 'spider', stray: 'stray', vex: 'vex',
  vindicator: 'vindicator', warden: 'warden', witch: 'witch', wither: 'wither', wither_skeleton: 'wither_skeleton',
  zoglin: 'zoglin', zombie: 'zombie', zombie_villager: 'zombie_villager',
};
const IMITATED = Object.keys(IMITATIONS);

/** vanilla Parrot.getPitch: its voice, a little up or down */
export function parrotPitch(r: { nextFloat(): number }): number {
  return (r.nextFloat() - r.nextFloat()) * 0.2 + 1;
}

/** vanilla Parrot.getImitatedSound */
function imitatedSound(type: string): string {
  const k = IMITATIONS[type];
  return k ? `entity.parrot.imitate.${k}` : 'entity.parrot.ambient';
}

/** vanilla Parrot.getAmbient: its own call, but one time in a thousand (not in peaceful) some mob's */
export function parrotAmbient(level: Level, r: { nextInt(n: number): number }): string {
  if (level.difficulty !== 'peaceful' && r.nextInt(1000) === 0) return imitatedSound(IMITATED[r.nextInt(IMITATED.length)]);
  return 'entity.parrot.ambient';
}

/**
 * vanilla Parrot.imitateNearbyMobs: half the time, one of the mobs it can mimic within 20 blocks of `e` (a parrot, or
 * the player it rides on), at random, and its sound in a parrot's voice
 */
export function imitateNearbyMobs(level: Level, e: Entity): boolean {
  if (!((e as { isAlive?: boolean }).isAlive ?? !e.removed) || level.random.nextInt(2) !== 0) return false;
  const list = level.getEntities(e.bb.inflate(20, 20, 20), (m) => m instanceof Mob && IMITATIONS[m.type] !== undefined);
  if (!list.length) return false;
  const m = list[level.random.nextInt(list.length)];
  level.sound.play(imitatedSound(m.type), e.x, e.y, e.z, 0.7, parrotPitch(level.random));
  return true;
}

// (vanilla Player.playShoulderEntityAmbientSound: one tick in 200 a parrot up there mimics something near, or calls)
shoulderHooks.ambient = (e, d) => {
  const level = (e as { level: Level }).level;
  if (d.id !== 'parrot' || level.random.nextInt(200) !== 0) return;
  if (!imitateNearbyMobs(level, e)) level.sound.play(parrotAmbient(level, level.random), e.x, e.y, e.z, 1, parrotPitch(level.random));
};

export class Parrot extends TamableAnimal {
  readonly type = 'parrot';
  protected adultWidth = 0.5;
  protected adultHeight = 0.9;
  /** vanilla DATA_VARIANT_ID (an index into PARROT_VARIANTS) */
  variant = 0;
  /** vanilla flap / flapSpeed (and their last tick's): the wings' beat, and how hard they're going (0 at rest) */
  flap = 0;
  flapSpeed = 0;
  oFlap = 0;
  oFlapSpeed = 0;
  private flapping = 1;
  private nextFlap = 1;
  /** vanilla partyParrot: dancing to a jukebox nearby (game/jukebox.ts tells it: setRecordPlayingNearby) */
  partyParrot = false;
  private jukebox: [number, number, number] | null = null;
  /** vanilla ShoulderRidingEntity.rideCooldownCounter: ticks since it came to be (or came down off a shoulder) */
  private rideCooldownCounter = 0;

  constructor(level: Level) {
    super(level);
    this.setSize(0.5, 0.9);
    this.maxHealth = this.health = 6;
    this.moveSpeedAttr = 0.2;
    this.flyingSpeedAttr = 0.4;
    this.attackDamage = 3;
    this.moveControl = new FlyingMoveControl(this, 10, false);
    this.setPathfindingMalus(PathType.DANGER_FIRE, -1);
    this.setPathfindingMalus(PathType.DAMAGE_FIRE, -1);
    this.setPathfindingMalus(PathType.COCOA, -1);
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new TamableAnimalPanicGoal(this, 1.25, false));
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(2, new SitWhenOrderedToGoal(this));
    this.goalSelector.addGoal(2, new FollowOwnerGoal(this, 1.0, 5, 1));
    this.goalSelector.addGoal(2, new ParrotWanderGoal(this, 1.0));
    this.goalSelector.addGoal(3, new LandOnOwnersShoulderGoal(this));
    this.goalSelector.addGoal(3, new FollowMobGoal(this, 1.0, 3, 7));
  }

  /** vanilla createNavigation: through the air, floating when it lands in water, through open doors but never opening one */
  protected override createNavigation(): PathNavigation {
    const n = new FlyingPathNavigation(this);
    n.canOpenDoors = false;
    n.canFloat = true;
    return n;
  }

  override get eyeHeight(): number {
    return 0.54;
  }

  override isFlyingAnimal(): boolean {
    return true;
  }

  /** vanilla isFlying: off the ground */
  isFlying(): boolean {
    return !this.onGround;
  }

  /** vanilla canFlyToOwner: it may turn up by its owner on the leaves */
  protected override canFlyToOwner(): boolean {
    return true;
  }

  // --- spawning -------------------------------------------------------------------------------------------------

  /** vanilla Parrot.finalizeSpawn: any of the five colours, and never a chick (AgeableMobGroupData(false)) */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    this.variant = this.level.random.nextInt(PARROT_VARIANTS.length);
    const g = group ?? {};
    g.ageable ??= { size: 0, babyChance: 0 };
    super.finalizeSpawn(reason, g);
  }

  /** vanilla Parrot.isBaby: parrots are never young */
  override isBaby(): boolean {
    return false;
  }

  isFood(_s: ItemStack): boolean {
    return false;
  }

  override canMate(_o: Animal): boolean {
    return false;
  }

  /** vanilla getBreedOffspring: none */
  makeBaby(_partner: Animal): Animal | null {
    return null;
  }

  // --- taming, sitting, the shoulder ----------------------------------------------------------------------------

  /**
   * vanilla Parrot.mobInteract: seeds to a wild one (tamed one time in ten); its owner's click, while it's down, tells
   * it to sit or get up; a cookie poisons it, and it dies
   */
  override interact(p: Player, stack: ItemStack | null): boolean {
    const id = stack?.item.id ?? '';
    if (!this.isTame() && PARROT_FOOD.has(id)) {
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      this.level.sound.play('entity.parrot.eat', this.x, this.y, this.z, 1, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.2);
      if (this.random.nextInt(10) === 0) {
        this.tameBy(p);
        this.spawnTamingParticles(true);
      } else this.spawnTamingParticles(false);
      this.persistenceRequired = true;
      return true;
    }
    if (!POISONOUS.has(id)) {
      if (!this.isFlying() && this.isTame() && this.isOwnedBy(p)) {
        this.orderedToSit = !this.orderedToSit;
        return true;
      }
      return super.interact(p, stack);
    }
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    this.addEffect(new MobEffectInstance(MOB_EFFECTS.poison, 900));
    // (vanilla: Float.MAX_VALUE of the player's attack, unless it can't be hurt, in creative or not)
    this.hurt(3.4028234663852886e38, 'player', p);
    return true;
  }

  /** vanilla ShoulderRidingEntity.canSitOnShoulder: five seconds after it came to be (or came down) */
  canSitOnShoulder(): boolean {
    return this.rideCooldownCounter > 100;
  }

  /** vanilla ShoulderRidingEntity.setEntityOnShoulder: onto the player's shoulder as its record, gone from the world */
  setEntityOnShoulder(p: Player): boolean {
    const d = this.save();
    if (!p.setEntityOnShoulder(d)) return false;
    this.remove();
    return true;
  }

  /** vanilla setRecordPlayingNearby: a jukebox playing near it (or stopping) */
  setRecordPlayingNearby(x: number, y: number, z: number, playing: boolean): void {
    this.jukebox = [x, y, z];
    this.partyParrot = playing;
  }

  // --- ticking --------------------------------------------------------------------------------------------------

  override tick(): void {
    this.rideCooldownCounter++;
    super.tick();
  }

  /** vanilla Parrot.aiStep: the dance ends away from the jukebox; one tick in 400 it may mimic a mob; then the wings */
  override aiStep(): void {
    const j = this.jukebox;
    if (!j || (this.x - j[0] - 0.5) ** 2 + (this.y - j[1] - 0.5) ** 2 + (this.z - j[2] - 0.5) ** 2 >= 3.46 * 3.46 || BLOCKS[STATE_BLOCK[this.level.world.getState(j[0], j[1], j[2])]].name !== 'jukebox') {
      this.partyParrot = false;
      this.jukebox = null;
    }
    if (this.level.random.nextInt(400) === 0) imitateNearbyMobs(this.level, this);
    super.aiStep();
    this.calculateFlapping();
  }

  /** vanilla calculateFlapping: the beat quickens in the air and dies away on the ground; falling, it glides down slower */
  private calculateFlapping(): void {
    this.oFlap = this.flap;
    this.oFlapSpeed = this.flapSpeed;
    this.flapSpeed = Math.max(0, Math.min(1, this.flapSpeed + (!this.onGround && !this.vehicle ? 4 : -1) * 0.3));
    if (!this.onGround && this.flapping < 1) this.flapping = 1;
    this.flapping *= 0.9;
    if (!this.onGround && this.dy < 0) this.dy *= 0.6;
    this.flap += this.flapping * 2;
  }

  /** vanilla isFlapping / onFlap: a wingbeat's sound every so far flown, the further the harder it's flapping */
  protected override isFlapping(): boolean {
    return this.flyDist > this.nextFlap;
  }

  protected override onFlap(): void {
    this.playSound('entity.parrot.fly', 0.15, 1);
    this.nextFlap = this.flyDist + this.flapSpeed / 2;
  }

  /** vanilla checkFallDamage: none, however far it falls */
  protected override checkFallDamage(_dy: number, _onGround: boolean): void {
    this.fallDistance = 0;
  }

  /** vanilla Parrot.hurt: hurt, it gets up */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isInvulnerableTo(source)) return false;
    this.orderedToSit = false;
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla Parrot.doPush: it doesn't shove players about */
  protected override pushEntities(): void {
    const list = this.level.getEntities(this.bb, (e) => e.isPushable() && e.type !== 'player', this);
    for (const e of list) e.pushAgainst(this);
  }

  // --- sounds ---------------------------------------------------------------------------------------------------

  override ambientSound(): string {
    return parrotAmbient(this.level, this.level.random);
  }

  override hurtSound(): string {
    return 'entity.parrot.hurt';
  }

  override deathSound(): string {
    return 'entity.parrot.death';
  }

  protected override playStepSound(): void {
    this.playSound('entity.parrot.step', 0.15, 1);
  }

  override voicePitch(): number {
    return parrotPitch(this.random);
  }

  /** vanilla loot table entities/parrot: a feather or two */
  override lootTable(): LootEntry[] {
    return [{ item: 'feather', min: 1, max: 2 }];
  }

  // --- saving ---------------------------------------------------------------------------------------------------

  override variantId(): string {
    return PARROT_VARIANTS[this.variant];
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), Variant: this.variant };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    const v = Number(d.Variant ?? 0);
    this.variant = v >= 0 && v < PARROT_VARIANTS.length ? Math.floor(v) : 0;
  }
}

/** vanilla SavedEntity of a parrot: its colour (for the one drawn on a shoulder) */
export function shoulderVariant(d: SavedEntity): number {
  const v = Number(d.data?.Variant ?? 0);
  return v >= 0 && v < PARROT_VARIANTS.length ? Math.floor(v) : 0;
}

// ---------------------------------------------------------------------------
// goals

/**
 * vanilla Parrot.ParrotWanderGoal: most times off to a perch on the trees within three blocks across and six up or
 * down (open air, with leaves or a log under it and room above); in water, back to land; else anywhere ahead in the air
 */
class ParrotWanderGoal extends WaterAvoidingRandomFlyingGoal {
  protected override getPosition(): [number, number, number] | null {
    const m = this.mob;
    let p: [number, number, number] | null = null;
    if (m.inWater) p = landRandomPos(m, 15, 15);
    if (m.random.nextFloat() >= this.probability) p = this.treePos();
    return p ?? super.getPosition();
  }

  private treePos(): [number, number, number] | null {
    const m = this.mob, w = m.level.world;
    const bx = Math.floor(m.x), by = Math.floor(m.y), bz = Math.floor(m.z);
    const x0 = Math.floor(m.x - 3), y0 = Math.floor(m.y - 6), z0 = Math.floor(m.z - 3);
    const x1 = Math.floor(m.x + 3), y1 = Math.floor(m.y + 6), z1 = Math.floor(m.z + 3);
    // (vanilla BlockPos.betweenClosed: x fastest, then y, then z)
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (x === bx && y === by && z === bz) continue;
          const below = w.getState(x, y - 1, z);
          const perch = (FLAGS[below] & F_LEAVES) !== 0 || isLog(below);
          if (perch && FLAGS[w.getState(x, y, z)] & F_AIR && FLAGS[w.getState(x, y + 1, z)] & F_AIR) return [x, y, z];
        }
    return null;
  }
}

/** vanilla #logs */
function isLog(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return n.endsWith('_log') || n.endsWith('_wood') || n.endsWith('_stem') || n.endsWith('_hyphae');
}

/**
 * vanilla LandOnOwnersShoulderGoal: while its owner is about on foot (not a spectator, not flying, not in water or
 * powder snow) and it isn't sitting, it hops onto their shoulder the moment it touches them
 */
class LandOnOwnersShoulderGoal extends Goal {
  private onShoulder = false;
  constructor(readonly parrot: Parrot) {
    super();
  }
  canUse(): boolean {
    const o = this.parrot.owner() as Player | null;
    if (!o || o.type !== 'player') return false;
    const free = o.gameMode !== 'spectator' && !o.flying && !o.inWater && !o.isInPowderSnow();
    return !this.parrot.orderedToSit && free && this.parrot.canSitOnShoulder();
  }
  override isInterruptable(): boolean {
    return !this.onShoulder;
  }
  override start(): void {
    this.onShoulder = false;
  }
  override tick(): void {
    const p = this.parrot;
    if (this.onShoulder || p.inSittingPose || p.leashHolder) return;
    const o = p.owner() as Player | null;
    if (o && p.bb.intersects(o.bb)) this.onShoulder = p.setEntityOnShoulder(o);
  }
}
