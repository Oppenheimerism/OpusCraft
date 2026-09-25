// Tadpoles (M9; vanilla Tadpole and TadpoleAi, 1.21). Two to five of them wriggle out of frogspawn (game/frogspawn.ts)
// and swim about as fish do, following a slime ball held out to them; in twenty minutes one grows into a frog, of
// the kind its biome gives (entity/frog.ts: temperate, warm or cold), keeping its name. A slime ball fed to one takes
// a tenth off the time it has left. A water bucket scoops one up, and it keeps growing from where it was when poured
// out; out of the water it flops about and suffocates. Axolotls hunt them. They make no sound of their own but when
// hurt, dying, flopping or growing up, give no experience, and never despawn.
//
// Its brain is vanilla's (entity/ai/brain.ts, with the shared behaviours of ai/brainBehaviors.ts), alongside a fish's
// goals (panicking, keeping away from players, swimming about: entity/fish.ts), as vanilla has it.

import { AbstractFish, BUCKET_FISH, type BucketEntityData } from './fish';
import type { Level } from '../game/level';
import type { MobCategory } from './mob';
import type { LivingEntity } from './living';
import type { Player } from './player';
import type { Animal } from './animals';
import { Brain, GateBehavior, oneShot } from './ai/brain';
import {
  animalPanic, countDownCooldown, followTemptation, lookAtPlayerSometimes, lookAtTargetSink, moveToTargetSink, senseHurtBy, senseNearestLiving, senseTempting,
  SensorClock, setWalkTargetFromLookTarget, swimStroll, type Tracker, type WalkTarget,
} from './ai/brainBehaviors';
import type { LookControl } from './ai/controls';
import { SmoothSwimmingLookControl, SmoothSwimmingMoveControl } from './dolphin';
import type { ItemStack } from '../item/item';
import { Frog } from './frog';

type Activity = 'core' | 'idle';

/** vanilla Tadpole.ticksToBeFrog: twenty minutes */
export const TICKS_TO_BE_FROG = 24000;

/** vanilla TadpoleAi.makeBrain */
function makeBrain(): Brain<Tadpole, Activity> {
  const b = new Brain<Tadpole, Activity>('idle', ['core']);
  b.add('core', [
    [0, animalPanic<Tadpole>(2)],
    [0, lookAtTargetSink<Tadpole>(45, 90)],
    [0, moveToTargetSink<Tadpole>()],
    [0, countDownCooldown<Tadpole>((t) => t.temptationCooldown, (t, v) => (t.temptationCooldown = v))],
  ]);
  b.add('idle', [
    [0, lookAtPlayerSometimes<Tadpole>(6, 30, 60)],
    [1, followTemptation<Tadpole>(() => 1.25)],
    [
      2,
      new GateBehavior<Tadpole>(
        [[swimStroll<Tadpole>(0.5), 2], [setWalkTargetFromLookTarget<Tadpole>(() => true, () => 0.5, 3), 3], [oneShot<Tadpole>((t) => t.inWater), 5]],
        { entry: (t) => t.walkTarget === null, shuffle: false, tryAll: true },
      ),
    ],
  ]);
  return b;
}

export class Tadpole extends AbstractFish {
  readonly type = 'tadpole';
  /** (vanilla EntityType.TADPOLE is a creature, not a fish of the water_ambient kind) */
  override readonly category: MobCategory = 'creature';
  /** vanilla Tadpole.age: the ticks it has been growing */
  age = 0;

  // its brain's memories (vanilla MemoryModuleType): null, or -1, where it has none
  lookTarget: Tracker | null = null;
  walkTarget: WalkTarget | null = null;
  cantReachWalkTargetSince = -1;
  nearestLiving: LivingEntity[] = [];
  visibleLiving: LivingEntity[] = [];
  hurtBy: string | null = null;
  hurtByEntity: LivingEntity | null = null;
  temptingPlayer: Player | null = null;
  temptationCooldown = -1;
  isTempted = false;
  /** (it never breeds) */
  breedTarget: Animal | null = null;
  isPanicking = false;

  private readonly brain = makeBrain();
  /** vanilla Sensor timing, for its sensors (nearest living, hurt by, frog temptations) */
  private readonly sensors: SensorClock;

  constructor(level: Level) {
    super(level);
    this.setSize(0.4, 0.3);
    // vanilla Tadpole.createAttributes: 6 health, speed 1
    this.maxHealth = this.health = 6;
    this.moveSpeedAttr = 1;
    this.moveControl = new SmoothSwimmingMoveControl(this, 85, 10, 0.02, 0.1, true);
    (this as { lookControl: LookControl }).lookControl = new SmoothSwimmingLookControl(this, 10);
    // vanilla Tadpole.fromBucket: always (it never despawns)
    this.fromBucket = true;
    this.sensors = new SensorClock(this.random, 3);
    this.brain.setActiveActivityIfPossible('idle', this);
  }

  /** vanilla EntityType.TADPOLE eyeHeight */
  override get eyeHeight(): number {
    return 0.195;
  }

  /** vanilla #frog_food */
  isFood(s: ItemStack): boolean {
    return s.item.id === 'slime_ball';
  }

  // --- the brain ------------------------------------------------------------

  /** vanilla Brain.tick's sensors, each once a second */
  private sense(): void {
    const c = this.sensors;
    if (c.due(0)) senseNearestLiving(this);
    if (c.due(1)) senseHurtBy(this);
    if (c.due(2)) senseTempting(this, (s) => this.isFood(s));
  }

  /** vanilla Tadpole.customServerAiStep: its brain, idling (after the fish's goals have had their turn) */
  protected override customServerAiStep(): void {
    this.sense();
    this.brain.tick(this, this.level.gameTime);
    this.brain.setActiveActivityToFirstValid(['idle'], this);
    super.customServerAiStep();
  }

  // --- growing up -------------------------------------------------------------

  /** vanilla Tadpole.aiStep: a tick older */
  override aiStep(): void {
    super.aiStep();
    this.setAge(this.age + 1);
  }

  /** vanilla setAge: old enough, it's a frog */
  setAge(a: number): void {
    this.age = a;
    if (this.age >= TICKS_TO_BE_FROG) this.growUp();
  }

  /** vanilla ageUp(offset): `seconds` older */
  ageUp(seconds: number): void {
    this.setAge(this.age + seconds * 20);
  }

  /** vanilla getTicksLeftUntilAdult */
  ticksLeftUntilAdult(): number {
    return Math.max(0, TICKS_TO_BE_FROG - this.age);
  }

  /**
   * vanilla Tadpole.ageUp(): a frog where it was, of its biome's kind, keeping its name, never to despawn (with the
   * growing-up sound); the tadpole is gone
   */
  private growUp(): void {
    if (this.removed) return;
    const f = new Frog(this.level);
    f.moveTo(this.x, this.y, this.z, this.yaw, this.pitch);
    f.finalizeSpawn('conversion');
    if (this.customName !== null) {
      f.setCustomName(this.customName);
      f.customNameVisible = this.customNameVisible;
    }
    f.persistenceRequired = true;
    this.playSound('entity.tadpole.grow_up', 0.15, 1);
    this.level.addEntity(f);
    this.remove();
  }

  /**
   * vanilla Tadpole.mobInteract: a slime ball is eaten (one from the stack, but in creative), a tenth of the time left
   * taken off, with a green sparkle (vanilla feed); else a water bucket scoops it up
   */
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (stack && this.isFood(stack)) {
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      // vanilla AgeableMob.getSpeedUpSecondsWhenFeeding
      this.ageUp(Math.floor((this.ticksLeftUntilAdult() / 20) * 0.1));
      const r = this.random;
      const px = this.x + this.width * (2 * r.nextDouble() - 1), py = this.y + this.height * r.nextDouble() + 0.5, pz = this.z + this.width * (2 * r.nextDouble() - 1);
      this.level.particles.spawn?.('happy_villager', px, py, pz, 0, 0, 0);
      return true;
    }
    return super.interact(p, stack);
  }

  // --- the bucket -------------------------------------------------------------

  bucketItem(): string {
    return 'tadpole_bucket';
  }
  override pickupSound(): string {
    return 'item.bucket.fill_tadpole';
  }
  /** vanilla saveToBucketTag: its age too */
  override saveToBucketTag(stack: ItemStack): void {
    super.saveToBucketTag(stack);
    stack.tag!.bucketEntity!.Age = this.age;
  }
  override loadFromBucketTag(d: BucketEntityData): void {
    super.loadFromBucketTag(d);
    if (typeof d.Age === 'number') this.setAge(d.Age);
  }

  // --- sounds and the rest -----------------------------------------------------

  protected flopSound(): string {
    return 'entity.tadpole.flop';
  }
  override hurtSound(): string {
    return 'entity.tadpole.hurt';
  }
  override deathSound(): string {
    return 'entity.tadpole.death';
  }
  /** vanilla shouldDropExperience: none */
  override experienceReward(): number {
    return 0;
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), Age: this.age };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.fromBucket = true;
    // (vanilla setAge: one saved old enough grows up on its next tick here, not while it's being read)
    if (typeof d.Age === 'number') this.age = d.Age;
  }
}

// (a bucket of tadpole pours one out: game/fishBuckets.ts, and a dispenser's game/redstone/dispenseItems.ts)
BUCKET_FISH.tadpole_bucket = (l) => new Tadpole(l);
