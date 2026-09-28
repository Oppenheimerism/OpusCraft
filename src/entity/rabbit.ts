// The rabbit (vanilla 1.21 Rabbit): small and quick, and it never walks: it hops, a short one to set off and a pause
// as it lands, and long low leaps one after another when it's running for it. Brown, salt-and-pepper or now and then
// black on the grass, white (one in five splotched with black) where it snows, gold in the desert; its young take
// after a parent, or now and then the place they're born. It keeps away from players, wolves and monsters, bolts when
// it's hurt, and follows anyone holding a carrot, a golden carrot or a dandelion, which are what it's bred with. A
// hungry rabbit raids gardens, nibbling a ripe carrot back a stage. The killer bunny (RabbitType 99, never met by
// chance) is white with red eyes: armoured, it goes for players and wolves and bites hard. One named Toast wears a coat
// of its own. It leaves its hide or its meat (cooked if it burned), and now and then, to a player, its foot.

import { Animal, BreedGoal, TemptGoal } from './animals';
import type { Level } from '../game/level';
import type { LootEntry, SpawnGroup, SpawnReason } from './mob';
import type { Entity } from './entity';
import type { LivingEntity } from './living';
import type { ItemStack } from '../item/item';
import { Monster } from './monsters';
import {
  AvoidEntityGoal, ClimbOnTopOfPowderSnowGoal, FloatGoal, HurtByTargetGoal, LookAtPlayerGoal, MeleeAttackGoal, MoveToBlockGoal,
  NearestAttackableMobGoal, NearestAttackablePlayerGoal, PanicGoal, WaterAvoidingRandomStrollGoal,
} from './ai/goals';
import { JumpControl, MoveControl, MoveOp } from './ai/controls';
import { BIOMES } from '../world/gen/biomes';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';

/** vanilla Rabbit.Variant ids */
export const BROWN = 0, WHITE = 1, BLACK = 2, WHITE_SPLOTCHED = 3, GOLD = 4, SALT = 5, EVIL = 99;
/** vanilla Rabbit.Variant: each coat's name by its id */
export const RABBIT_VARIANTS: Readonly<Record<number, string>> = { 0: 'brown', 1: 'white', 2: 'black', 3: 'white_splotched', 4: 'gold', 5: 'salt', 99: 'evil' };
/** vanilla Rabbit.Variant.byId (ByIdMap.sparse): an unknown id is brown */
const variantById = (id: number): number => (RABBIT_VARIANTS[id] !== undefined ? id : BROWN);

/** vanilla #rabbit_food */
const RABBIT_FOOD = new Set(['carrot', 'golden_carrot', 'dandelion']);
/** vanilla #spawns_white_rabbits */
const WHITE_RABBIT_BIOMES = new Set(['snowy_plains', 'ice_spikes', 'frozen_ocean', 'snowy_taiga', 'frozen_river', 'snowy_beach', 'frozen_peaks', 'jagged_peaks', 'snowy_slopes', 'grove']);
/** vanilla Rabbit.KILLER_BUNNY's name (entity.minecraft.killer_bunny) */
export const KILLER_BUNNY_NAME = 'The Killer Bunny';

/** vanilla Monster.class: the hostile mobs (vanilla keeps the slimes, the ghast and (remaining mobs) the phantom apart, as Enemy only) */
const isMonster = (e: LivingEntity): boolean => e instanceof Monster && e.type !== 'slime' && e.type !== 'magma_cube' && e.type !== 'ghast' && e.type !== 'phantom';

/**
 * vanilla Rabbit.getRandomRabbitVariant: white (one in five splotched) in the snowy biomes, gold in the desert, and
 * elsewhere brown half the time, salt-and-pepper two in five, black one in ten
 */
function randomRabbitVariant(level: Level, x: number, y: number, z: number): number {
  const biome = BIOMES[level.world.getBiome3(Math.floor(x), Math.floor(y), Math.floor(z))]?.name ?? 'plains';
  const i = level.random.nextInt(100);
  if (WHITE_RABBIT_BIOMES.has(biome)) return i < 80 ? WHITE : WHITE_SPLOTCHED;
  if (biome === 'desert') return GOLD;
  return i < 50 ? BROWN : i < 90 ? SALT : BLACK;
}

export class Rabbit extends Animal {
  readonly type = 'rabbit';
  protected adultWidth = 0.4;
  protected adultHeight = 0.5;
  /** vanilla DATA_TYPE_ID: its coat, a Rabbit.Variant id */
  variant = BROWN;
  /** vanilla jumpTicks / jumpDuration: how far into its hop it is (ten ticks long; 0 / 0 at rest) */
  jumpTicks = 0;
  jumpDuration = 0;
  private wasOnGround = false;
  /** vanilla jumpDelayTicks: the pause after landing before it hops again */
  private jumpDelayTicks = 0;
  /** vanilla moreCarrotTicks: after a carrot, the while before it wants another */
  moreCarrotTicks = 0;
  private readonly hop: RabbitJumpControl;
  private readonly hopMove: RabbitMoveControl;
  private goalsIn = false;
  private evilGoalsIn = false;

  constructor(level: Level) {
    super(level);
    this.setSize(0.4, 0.5);
    this.maxHealth = this.health = 3;
    this.moveSpeedAttr = 0.3;
    this.attackDamage = 3;
    this.hop = new RabbitJumpControl(this);
    this.jumpControl = this.hop;
    this.hopMove = new RabbitMoveControl(this);
    this.moveControl = this.hopMove;
    this.setSpeedModifier(0);
  }

  protected registerGoals(): void {
    this.goalsIn = true;
    const g = this.goalSelector;
    g.addGoal(1, new FloatGoal(this));
    g.addGoal(1, new ClimbOnTopOfPowderSnowGoal(this));
    g.addGoal(1, new RabbitPanicGoal(this, 2.2));
    g.addGoal(2, new BreedGoal(this, 0.8));
    g.addGoal(3, new TemptGoal(this, 1.0, RABBIT_FOOD));
    g.addGoal(4, new RabbitAvoidEntityGoal(this, (e) => e.type === 'player', 8));
    g.addGoal(4, new RabbitAvoidEntityGoal(this, (e) => e.type === 'wolf', 10));
    g.addGoal(4, new RabbitAvoidEntityGoal(this, isMonster, 4));
    g.addGoal(5, new RaidGardenGoal(this));
    g.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.6));
    g.addGoal(11, new LookAtPlayerGoal(this, 10));
    // (vanilla adds the killer bunny's in setVariant, after these)
    if (this.variant === EVIL) this.addEvilGoals();
  }

  /** vanilla setVariant(EVIL)'s goals: it bites what it's after, and hunts players and wolves (once only, here) */
  private addEvilGoals(): void {
    if (this.evilGoalsIn) return;
    this.evilGoalsIn = true;
    this.goalSelector.addGoal(4, new EvilRabbitAttackGoal(this));
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this).setAlertOthers());
    this.targetSelector.addGoal(2, new NearestAttackablePlayerGoal(this, true));
    this.targetSelector.addGoal(2, new NearestAttackableMobGoal(this, (e) => e.type === 'wolf', true));
  }

  // --- the coat ----------------------------------------------------------------------------------------------

  /**
   * vanilla setVariant: the killer bunny gets 8 armour, its bite (attack damage 3 + 5), its hunting and, unless it's
   * named already, its name
   */
  setVariant(v: number): void {
    if (v === EVIL) {
      this.baseArmor = 8;
      if (this.goalsIn) this.addEvilGoals();
      this.attackDamage = 8;
      if (!this.hasCustomName()) this.setCustomName(KILLER_BUNNY_NAME);
    } else this.attackDamage = 3;
    this.variant = v;
  }

  /** vanilla Rabbit.Variant's name */
  variantId(): string {
    return RABBIT_VARIANTS[this.variant] ?? 'brown';
  }

  /** vanilla RabbitGroupData(1.0): a coat for where it is, shared by its group, every one after the first a baby */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const g = group ?? {};
    let v = randomRabbitVariant(this.level, this.x, this.y, this.z);
    if (g.rabbitVariant !== undefined) v = g.rabbitVariant;
    else {
      g.rabbitVariant = v;
      g.ageable ??= { size: 0, babyChance: 1 };
    }
    this.setVariant(v);
    super.finalizeSpawn(reason, g);
  }

  isFood(s: ItemStack): boolean {
    return RABBIT_FOOD.has(s.item.id);
  }

  /** vanilla getBreedOffspring: one parent's coat or the other's, but one time in twenty the biome's */
  makeBaby(partner: Animal): Animal {
    const baby = new Rabbit(this.level);
    let v = randomRabbitVariant(this.level, this.x, this.y, this.z);
    if (this.random.nextInt(20) !== 0) v = partner instanceof Rabbit && this.random.nextBool() ? partner.variant : this.variant;
    baby.setVariant(v);
    return baby;
  }

  /** vanilla wantsMoreFood */
  wantsMoreFood(): boolean {
    return this.moreCarrotTicks <= 0;
  }

  // --- hopping (vanilla Rabbit's jump and move controls) ------------------------------------------------------

  /** vanilla setSpeedModifier: the speed of its next hops, for the path and the move control alike */
  setSpeedModifier(s: number): void {
    this.navigation.speedModifier = s;
    const mc = this.hopMove;
    mc.setWantedPosition(mc.wantedX, mc.wantedY, mc.wantedZ, s);
  }

  /** vanilla setJumping: every hop it sets off on is heard */
  setJumping(j: boolean): void {
    this.jumping = j;
    if (j) this.playSound('entity.rabbit.jump', this.soundVolume(), ((this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1) * 0.8);
  }

  /** vanilla startJumping: a hop begins, ten ticks of it */
  startJumping(): void {
    this.setJumping(true);
    this.jumpDuration = 10;
    this.jumpTicks = 0;
  }

  /** vanilla getJumpCompletion: how far through its hop it is, 0 to 1 */
  jumpCompletion(p: number): number {
    return this.jumpDuration === 0 ? 0 : (this.jumpTicks + p) / this.jumpDuration;
  }

  /**
   * vanilla getJumpPower: a low hop (0.2) as it ambles, a longer one (0.3) when it's in a hurry, and a high one (0.5)
   * up onto a block, where it's bumped into one or its path or aim goes up
   */
  override jumpPower(): number {
    let f = 0.3;
    if (this.hopMove.speedModifier <= 0.6) f = 0.2;
    const path = this.navigation.path;
    if (path && !path.isDone() && path.entityPosAt(this.width, path.nextNodeIndex)[1] > this.y + 0.5) f = 0.5;
    if (this.horizontalCollision || (this.jumping && this.hopMove.wantedY > this.y + 0.5)) f = 0.5;
    return f * this.blockJumpFactor() + this.jumpBoostPower();
  }

  /** vanilla jumpFromGround: from a standstill it springs forward too; entity event 1 kicks up the ground, and the hop's animation starts */
  override jumpFromGround(): void {
    super.jumpFromGround();
    if (this.hopMove.speedModifier > 0 && this.dx * this.dx + this.dz * this.dz < 0.01) this.moveRelative(0.1, 0, 0, 1);
    this.spawnSprintParticle();
    this.jumpDuration = 10;
    this.jumpTicks = 0;
  }

  /** vanilla Entity.spawnSprintParticle: a bit of the ground it springs from (client-side: not the mob's random) */
  private spawnSprintParticle(): void {
    const bx = Math.floor(this.x), by = Math.floor(this.y - 0.2), bz = Math.floor(this.z);
    const st = this.level.world.getState(bx, by, bz);
    if (FLAGS[st] & F_AIR) return;
    let px = this.x + (Math.random() - 0.5) * this.width, pz = this.z + (Math.random() - 0.5) * this.width;
    if (Math.floor(this.x) !== bx) px = Math.max(bx, Math.min(bx + 1, px));
    if (Math.floor(this.z) !== bz) pz = Math.max(bz, Math.min(bz + 1, pz));
    this.level.particles.blockParticle?.(px, this.y + 0.1, pz, this.dx * -4, 1.5, this.dz * -4, st, bx, by, bz);
  }

  /** vanilla facePoint */
  private facePoint(x: number, z: number): void {
    this.yaw = (Math.atan2(z - this.z, x - this.x) * 180) / Math.PI - 90;
  }

  /** vanilla setLandingDelay and checkLandingDelay: half a second's pause, or none to speak of when it's fleeing */
  private checkLandingDelay(): void {
    this.jumpDelayTicks = this.hopMove.speedModifier < 2.2 ? 10 : 1;
    this.hop.canJump = false;
  }

  /**
   * vanilla customServerAiStep (not Animal's): landing ends a hop; on the ground, with somewhere to go and the pause
   * over, it turns to face the next point of its path and hops; the killer bunny springs at a target within 4
   */
  protected override customServerAiStep(): void {
    if (this.jumpDelayTicks > 0) this.jumpDelayTicks--;
    if (this.moreCarrotTicks > 0) {
      this.moreCarrotTicks -= this.random.nextInt(3);
      if (this.moreCarrotTicks < 0) this.moreCarrotTicks = 0;
    }
    if (this.onGround) {
      if (!this.wasOnGround) {
        this.setJumping(false);
        this.checkLandingDelay();
      }
      const mc = this.hopMove;
      if (this.variant === EVIL && this.jumpDelayTicks === 0) {
        const t = this.target;
        if (t && this.distanceToSqr(t.x, t.y, t.z) < 16) {
          this.facePoint(t.x, t.z);
          mc.setWantedPosition(t.x, t.y, t.z, mc.speedModifier);
          this.startJumping();
          this.wasOnGround = true;
        }
      }
      if (!this.hop.wantJump()) {
        if (mc.hasWanted() && this.jumpDelayTicks === 0) {
          const path = this.navigation.path;
          let x = mc.wantedX, z = mc.wantedZ;
          if (path && !path.isDone()) [x, , z] = path.entityPosAt(this.width, path.nextNodeIndex);
          this.facePoint(x, z);
          this.startJumping();
        }
      } else if (!this.hop.canJump) this.hop.canJump = true;
    }
    this.wasOnGround = this.onGround;
  }

  /** vanilla aiStep: the hop runs its ten ticks, then it's done */
  override aiStep(): void {
    super.aiStep();
    if (this.jumpTicks !== this.jumpDuration) this.jumpTicks++;
    else if (this.jumpDuration !== 0) {
      this.jumpTicks = 0;
      this.jumpDuration = 0;
      this.setJumping(false);
    }
  }

  /** vanilla getLeashOffset: low on its chest */
  override leashOffset(): [number, number, number] {
    return [0, 0.6 * this.eyeHeight, this.width * 0.4];
  }

  // --- sounds and loot ----------------------------------------------------------------------------------------

  override ambientSound(): string {
    return 'entity.rabbit.ambient';
  }
  override hurtSound(): string {
    return 'entity.rabbit.hurt';
  }
  override deathSound(): string {
    return 'entity.rabbit.death';
  }

  /** vanilla playAttackSound (after Mob.doHurtTarget lands a hit): the killer bunny's bite */
  override doHurtTarget(target: Entity): boolean {
    const ok = super.doHurtTarget(target);
    if (ok && this.variant === EVIL) this.playSound('entity.rabbit.attack', 1, (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1);
    return ok;
  }

  /**
   * vanilla loot table entities/rabbit: its hide, and its meat (cooked if it burned), none or one of each; its foot
   * one time in ten when a player kills it (13% with looting I, 3% more a level)
   */
  override lootTable(): LootEntry[] {
    return [
      { item: 'rabbit_hide', min: 0, max: 1 },
      { item: 'rabbit', min: 0, max: 1, cooked: 'cooked_rabbit' },
      { item: 'rabbit_foot', min: 1, max: 1, player: true, chance: 0.1, lootingChance: [0.13, 0.03], noLooting: true },
    ];
  }

  // --- saving -------------------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), RabbitType: this.variant, MoreCarrotTicks: this.moreCarrotTicks };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.setVariant(variantById(Math.floor(Number(d.RabbitType ?? 0))));
    this.moreCarrotTicks = Math.floor(Number(d.MoreCarrotTicks ?? 0)) || 0;
  }
}

// ---------------------------------------------------------------------------
// controls

/**
 * vanilla Rabbit.RabbitJumpControl: a jump asked for (by the move control, or to swim) starts a hop, sound and all.
 * `canJump` it sets as it lands and after, but nothing reads it (as in vanilla, a leftover)
 */
class RabbitJumpControl extends JumpControl {
  canJump = false;
  constructor(readonly rabbit: Rabbit) {
    super(rabbit);
  }
  /** vanilla wantJump: a jump asked for and not yet begun */
  wantJump(): boolean {
    return this.jumpFlag;
  }
  override tick(): void {
    if (this.jumpFlag) {
      this.rabbit.startJumping();
      this.jumpFlag = false;
    }
  }
}

/**
 * vanilla Rabbit.RabbitMoveControl: it only goes anywhere while it's hopping (on the ground between hops its speed
 * is nothing), each hop at the speed last asked for; in water it swims at 1.5
 */
class RabbitMoveControl extends MoveControl {
  private nextJumpSpeed = 0;
  constructor(readonly rabbit: Rabbit) {
    super(rabbit);
  }
  override tick(): void {
    const r = this.rabbit;
    if (r.onGround && !r.jumping && !(r.jumpControl as RabbitJumpControl).wantJump()) r.setSpeedModifier(0);
    else if (this.hasWanted() || this.operation === MoveOp.JUMPING) r.setSpeedModifier(this.nextJumpSpeed);
    super.tick();
  }
  override setWantedPosition(x: number, y: number, z: number, speed: number): void {
    if (this.rabbit.inWater) speed = 1.5;
    super.setWantedPosition(x, y, z, speed);
    if (speed > 0) this.nextJumpSpeed = speed;
  }
}

// ---------------------------------------------------------------------------
// goals

/** vanilla Rabbit.RabbitPanicGoal: it bolts, every hop at the panic's speed */
class RabbitPanicGoal extends PanicGoal {
  constructor(readonly rabbit: Rabbit, speed: number) {
    super(rabbit, speed);
  }
  override tick(): void {
    super.tick();
    this.rabbit.setSpeedModifier(this.speed);
  }
}

/** vanilla Rabbit.RabbitAvoidEntityGoal: off at 2.2, near or far, from what it fears; the killer bunny fears nothing */
class RabbitAvoidEntityGoal extends AvoidEntityGoal {
  constructor(readonly rabbit: Rabbit, avoid: (e: LivingEntity) => boolean, maxDist: number) {
    super(rabbit, avoid, maxDist, 2.2, 2.2);
  }
  override canUse(): boolean {
    return this.rabbit.variant !== EVIL && super.canUse();
  }
}

/** vanilla Rabbit.EvilRabbitAttackGoal: the killer bunny closes in at 1.4 */
class EvilRabbitAttackGoal extends MeleeAttackGoal {
  constructor(rabbit: Rabbit) {
    super(rabbit, 1.4, true);
  }
}

/**
 * vanilla Rabbit.RaidGardenGoal: with mobGriefing on, a rabbit that wants a carrot makes (at 0.7) for a ripe one on
 * farmland within 16; there it nibbles it back a stage (a seedling it takes whole) and won't want another for a
 * while. As in vanilla the goal gives up two ticks after it's taken up (the target's no longer "valid" once it's
 * chosen), but the path it set carries the rabbit there, and the next look finds it standing by the carrot.
 */
class RaidGardenGoal extends MoveToBlockGoal {
  private wantsToRaid = false;
  private canRaid = false;
  constructor(readonly rabbit: Rabbit) {
    super(rabbit, 0.7, 16);
  }
  override canUse(): boolean {
    if (this.nextStartTick <= 0) {
      if (!this.rabbit.level.gameRules.mobGriefing) return false;
      this.canRaid = false;
      this.wantsToRaid = this.rabbit.wantsMoreFood();
    }
    return super.canUse();
  }
  override canContinueToUse(): boolean {
    return this.canRaid && super.canContinueToUse();
  }
  override tick(): void {
    super.tick();
    const r = this.rabbit;
    r.lookControl.setLookAt(this.bx + 0.5, this.by + 1, this.bz + 0.5, 10, r.maxHeadXRot());
    if (!this.isReachedTarget()) return;
    const lvl = r.level, x = this.bx, y = this.by + 1, z = this.bz;
    const st = lvl.world.getState(x, y, z), b = BLOCKS[STATE_BLOCK[st]];
    if (this.canRaid && b.name === 'carrots') {
      const age = b.get<number>(st, 'age');
      // (vanilla flag 2, Block.UPDATE_CLIENTS: the neighbours aren't told)
      if (age === 0) lvl.setBlock(x, y, z, 0, 2);
      else {
        lvl.setBlock(x, y, z, b.with(st, 'age', age - 1), 2);
        lvl.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { entity: r });
        // (vanilla level event 2001: the carrot's bits and its breaking sound)
        lvl.particles.blockBreak(x, y, z, st);
        lvl.sound.play(`block.${b.sound}.break`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8);
      }
      r.moreCarrotTicks = 40;
    }
    this.canRaid = false;
    this.nextStartTick = 10;
  }
  protected isValidTarget(x: number, y: number, z: number): boolean {
    const w = this.rabbit.level.world;
    if (BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name === 'farmland' && this.wantsToRaid && !this.canRaid) {
      const st = w.getState(x, y + 1, z), b = BLOCKS[STATE_BLOCK[st]];
      if (b.name === 'carrots' && b.get<number>(st, 'age') >= 7) {
        this.canRaid = true;
        return true;
      }
    }
    return false;
  }
}
