// Guardians and elder guardians (Stage 5: ocean; vanilla Guardian and ElderGuardian), the ocean monument's keepers.
//
// A guardian swims (a water-bound path, its own push-and-bob move control), and on land flops about helplessly. It
// goes for players and squid more than three blocks off and in sight: it stops, turns its eye on the target and
// charges its laser for four seconds (three for an elder), then the beam hits — 1 magic damage (3 on hard, 2 more
// for an elder) and its melee blow besides — and it lets go. Hit it while it's still and its spikes are out: whoever
// struck it takes 2 thorns damage. An elder keeps within 16 blocks of where it was, and every minute puts Mining
// Fatigue III on the survival players within 50 blocks, its ghostly face looming up before them with a moan
// (game/ocean.ts draws it: render/oceanRenderers.ts).

import { Monster } from './monsters';
import type { Level } from '../game/level';
import { LivingEntity } from './living';
import type { Entity } from './entity';
import { Goal, Flag } from './ai/goal';
import { MoveControl, MoveOp, rotlerp } from './ai/controls';
import { WaterBoundPathNavigation, type PathNavigation } from './ai/navigation';
import { PathType } from './ai/pathfinder';
import { RandomStrollGoal, LookAtPlayerGoal, RandomLookAroundGoal, NearestAttackableMobGoal, MoveTowardsRestrictionGoal } from './ai/goals';
import { MOB_EFFECTS, MobEffectInstance } from './effects';
import { FLAGS, F_WATER, F_OPAQUE, F_COLLIDE } from '../world/block';
import { MIN_Y, SEA_LEVEL } from '../world/constants';
import { ITEMS, ItemStack } from '../item/item';
import type { Player } from './player';

type Pos = [number, number, number];

/** the elder guardian's curse, reported to the game (the ghostly face and the moan: game/ocean.ts) */
export const guardianHooks: { elderCurse: ((p: Player, e: ElderGuardian) => void) | null } = { elderCurse: null };

export class Guardian extends Monster {
  readonly type: string = 'guardian';
  /** vanilla DATA_ID_MOVING */
  moving = false;
  /** vanilla DATA_ID_ATTACK_TARGET: the one its laser is on (the target while the laser is charging) */
  private beamTarget: LivingEntity | null = null;
  /** vanilla clientSideAttackTime: ticks since the laser went on */
  attackTime = 0;
  tailAnimation = 0;
  tailAnimationO = 0;
  private tailAnimationSpeed = 0;
  spikesAnimation = 0;
  spikesAnimationO = 0;
  private touchedGround = false;
  private strollGoal: GuardianStrollGoal | null = null;

  constructor(level: Level) {
    super(level);
    this.xpReward = 10;
    this.setSize(0.85, 0.85);
    this.maxHealth = this.health = 30;
    this.attackDamage = 6;
    this.moveSpeedAttr = 0.5;
    this.setPathfindingMalus(PathType.WATER, 0);
    this.moveControl = new GuardianMoveControl(this);
    this.tailAnimation = this.tailAnimationO = this.random.nextFloat();
  }

  protected override createNavigation(): PathNavigation {
    return new WaterBoundPathNavigation(this);
  }

  protected registerGoals(): void {
    const toRestriction = new MoveTowardsRestrictionGoal(this, 1);
    this.strollGoal = new GuardianStrollGoal(this, 1, this.strollInterval());
    this.goalSelector.addGoal(4, new GuardianAttackGoal(this));
    this.goalSelector.addGoal(5, toRestriction);
    this.goalSelector.addGoal(7, this.strollGoal);
    this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(8, new LookAtGuardianGoal(this, 12, 0.01));
    this.goalSelector.addGoal(9, new RandomLookAroundGoal(this));
    // vanilla: the stroll and the way back both take the look too
    this.strollGoal.flags = Flag.MOVE | Flag.LOOK;
    toRestriction.flags = Flag.MOVE | Flag.LOOK;
    // vanilla NearestAttackableTargetGoal(LivingEntity, 10, true, false, GuardianAttackSelector)
    this.targetSelector.addGoal(1, new NearestAttackableMobGoal(this, (e) => guardianAttackSelector(this, e), true, 10));
  }

  protected strollInterval(): number {
    return 80;
  }

  /** vanilla randomStrollGoal.trigger(): off it swims on its next tick */
  triggerStroll(): void {
    if (this.strollGoal) this.strollGoal.forceTrigger = true;
  }

  override get eyeHeight(): number {
    return this.height * 0.5;
  }

  /** vanilla getAttackDuration */
  attackDuration(): number {
    return 80;
  }

  setBeamTarget(t: LivingEntity | null): void {
    // (vanilla onSyncedDataUpdated: the laser's count starts again)
    if (t !== this.beamTarget) this.attackTime = 0;
    this.beamTarget = t;
  }
  /** vanilla hasActiveAttackTarget / getActiveAttackTarget */
  activeAttackTarget(): LivingEntity | null {
    const t = this.beamTarget;
    return t && !t.removed ? t : null;
  }

  /** vanilla getAttackAnimationScale: how far the laser has charged */
  attackAnimationScale(p: number): number {
    return (this.attackTime + p) / this.attackDuration();
  }
  tailAnimationAt(p: number): number {
    return this.tailAnimationO + (this.tailAnimation - this.tailAnimationO) * p;
  }
  spikesAnimationAt(p: number): number {
    return this.spikesAnimationO + (this.spikesAnimation - this.spikesAnimationO) * p;
  }

  override ambientSoundInterval(): number {
    return 160;
  }
  protected soundPrefix(): string {
    return 'entity.guardian';
  }
  override ambientSound(): string {
    return `${this.soundPrefix()}.${this.inWater ? 'ambient' : 'ambient_land'}`;
  }
  override hurtSound(): string {
    return `${this.soundPrefix()}.${this.inWater ? 'hurt' : 'hurt_land'}`;
  }
  override deathSound(): string {
    return `${this.soundPrefix()}.${this.inWater ? 'death' : 'death_land'}`;
  }
  /** vanilla getMovementEmission EVENTS: no steps heard */
  protected override makesStepSounds(): boolean {
    return false;
  }

  /** vanilla getWalkTargetValue: water above all (the lighter the better); out of it, as any monster */
  override walkTargetValue(x: number, y: number, z: number): number {
    return FLAGS[this.level.world.getState(x, y, z)] & F_WATER ? 10 + this.level.brightness(x, y, z) - 0.5 : super.walkTargetValue(x, y, z);
  }

  override canBreatheUnderwater(): boolean {
    return true;
  }

  /** vanilla getMaxHeadXRot: it turns its whole body to look up or down */
  override maxHeadXRot(): number {
    return 180;
  }

  override aiStep(): void {
    if (this.isAlive) {
      // (vanilla's client half: the tail, the spikes, the bubbles, the laser's count)
      this.tailAnimationO = this.tailAnimation;
      if (!this.inWater) {
        this.tailAnimationSpeed = 2;
        if (this.dy > 0 && this.touchedGround) this.playSound(`${this.soundPrefix()}.flop`, 1, 1);
        const below = this.level.world.getState(Math.floor(this.x), Math.floor(this.y) - 1, Math.floor(this.z));
        this.touchedGround = this.dy < 0 && (FLAGS[below] & F_COLLIDE) !== 0;
      } else if (this.moving) {
        this.tailAnimationSpeed = this.tailAnimationSpeed < 0.5 ? 4 : this.tailAnimationSpeed + (0.5 - this.tailAnimationSpeed) * 0.1;
      } else this.tailAnimationSpeed += (0.125 - this.tailAnimationSpeed) * 0.2;
      this.tailAnimation += this.tailAnimationSpeed;
      this.spikesAnimationO = this.spikesAnimation;
      if (!this.inWater) this.spikesAnimation = this.random.nextFloat();
      else if (this.moving) this.spikesAnimation += (0 - this.spikesAnimation) * 0.25;
      else this.spikesAnimation += (1 - this.spikesAnimation) * 0.06;
      if (this.moving && this.inWater) {
        const [vx, vy, vz] = this.viewVector();
        for (let i = 0; i < 2; i++) {
          const px = this.x + (this.random.nextDouble() * 2 - 1) * this.width * 0.5 - vx * 1.5;
          const py = this.y + this.random.nextDouble() * this.height - vy * 1.5;
          const pz = this.z + (this.random.nextDouble() * 2 - 1) * this.width * 0.5 - vz * 1.5;
          this.level.particles.spawn?.('bubble', px, py, pz, 0, 0, 0);
        }
      }
      const t = this.activeAttackTarget();
      if (t) {
        if (this.attackTime < this.attackDuration()) this.attackTime++;
        // bubbles along the beam, closer together as it charges
        const d5 = this.attackAnimationScale(0);
        let d0 = t.x - this.x, d1 = t.y + t.height * 0.5 - (this.y + this.eyeHeight), d2 = t.z - this.z;
        const d3 = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
        if (d3 > 0) {
          d0 /= d3;
          d1 /= d3;
          d2 /= d3;
          let d4 = this.random.nextDouble();
          while (d4 < d3) {
            d4 += 1.8 - d5 + this.random.nextDouble() * (1.7 - d5);
            this.level.particles.spawn?.('bubble', this.x + d0 * d4, this.y + this.eyeHeight + d1 * d4, this.z + d2 * d4, 0, 0, 0);
          }
        }
      }
      if (this.inWater) this.air = 300;
      else if (this.onGround) {
        // stranded, it flops about
        this.dx += (this.random.nextFloat() * 2 - 1) * 0.4;
        this.dy += 0.5;
        this.dz += (this.random.nextFloat() * 2 - 1) * 0.4;
        this.yaw = this.random.nextFloat() * 360;
        this.onGround = false;
      }
      if (t) this.yaw = this.headYaw;
    }
    super.aiStep();
  }

  /** vanilla getViewVector(0) */
  private viewVector(): Pos {
    const p = (this.pitch * Math.PI) / 180, y = (-this.yaw * Math.PI) / 180;
    return [Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
  }

  /** vanilla Guardian.travel: in water, a push along its facing and a tenth off a tick; sinking a little when idle */
  override travel(sx: number, sy: number, sz: number): void {
    if (this.inWater) {
      this.moveRelative(0.1, sx, sy, sz);
      this.move(this.dx, this.dy, this.dz);
      this.dx *= 0.9;
      this.dy *= 0.9;
      this.dz *= 0.9;
      if (!this.moving && !this.target) this.dy -= 0.005;
    } else super.travel(sx, sy, sz);
  }

  /** vanilla hurtServer: its spikes prick whoever strikes it while it's still (2 thorns damage); it starts to swim */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const d = direct ?? attacker;
    // (vanilla #avoids_guardian_thorns: magic, thorns, explosions)
    if (!this.moving && !THORNLESS.has(source) && d instanceof LivingEntity && d !== this) d.hurt(2, 'thorns', this);
    this.triggerStroll();
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla loot_tables/entities/guardian: 0-2 shards; cod or crystals or nothing; now and then a fish for a player's kill */
  protected override dropLoot(byPlayer: boolean, looting = 0): void {
    const loot = (id: string, n: number) => {
      if (n > 0 && ITEMS.has(id)) this.spawnAtLocation(ItemStack.of(id, n));
    };
    const plus = () => (looting > 0 ? Math.round(looting * this.random.nextFloat()) : 0);
    loot('prismarine_shard', this.random.nextInt(3) + plus());
    const [cod, crystals, empty] = this.middlePool();
    const k = this.random.nextInt(cod + crystals + empty);
    if (k < cod) loot(this.isOnFire() ? 'cooked_cod' : 'cod', 1 + plus());
    else if (k < cod + crystals) loot('prismarine_crystals', 1 + plus());
    // vanilla random_chance_with_enchanted_bonus: 2.5% (3.5% with looting I, 1% a level more), a fishing catch
    const chance = looting > 0 ? 0.035 + 0.01 * (looting - 1) : 0.025;
    if (byPlayer && this.random.nextFloat() < chance) loot(fishingFish(this.random.nextInt(100)), 1);
    this.extraLoot(byPlayer);
  }
  /** the weights of the cod / crystals / nothing pool */
  protected middlePool(): [number, number, number] {
    return [2, 2, 1];
  }
  protected extraLoot(_byPlayer: boolean): void {}
}

/** vanilla #avoids_guardian_thorns (and thorns itself) */
const THORNLESS = new Set(['magic', 'indirectMagic', 'thorns', 'explosion', 'playerExplosion']);

/** vanilla gameplay/fishing/fish: cod 60, salmon 25, tropical fish 2, pufferfish 13 */
function fishingFish(k: number): string {
  return k < 60 ? 'cod' : k < 85 ? 'salmon' : k < 87 ? 'tropical_fish' : 'pufferfish';
}

/** vanilla GuardianAttackSelector: players, squid and axolotls more than 3 blocks off */
function guardianAttackSelector(g: Guardian, e: LivingEntity): boolean {
  return (e.type === 'player' || e.type === 'squid' || e.type === 'glow_squid' || e.type === 'axolotl') && e.distanceToSqr(g.x, g.y, g.z) > 9;
}

export class ElderGuardian extends Guardian {
  override readonly type: string = 'elder_guardian';

  constructor(level: Level) {
    super(level);
    // vanilla ElderGuardian.ELDER_SIZE_SCALE: 2.35 times as big
    this.setSize(1.9975, 1.9975);
    this.maxHealth = this.health = 80;
    this.attackDamage = 8;
    this.moveSpeedAttr = 0.3;
    this.persistenceRequired = true;
  }

  protected override strollInterval(): number {
    return 400;
  }
  override attackDuration(): number {
    return 60;
  }
  protected override soundPrefix(): string {
    return 'entity.elder_guardian';
  }

  /** vanilla customServerAiStep: every minute, Mining Fatigue III for the survival players within 50; kept near home */
  protected override customServerAiStep(): void {
    super.customServerAiStep();
    if ((this.tickCount + this.id) % 1200 === 0) {
      for (const p of this.level.players()) {
        if (!p.isAlive || (p.gameMode !== 'survival' && p.gameMode !== 'adventure') || p.distanceToSqr(this.x, this.y, this.z) >= 50 * 50) continue;
        // (vanilla MobEffectUtil.addEffectToPlayersAround: unless it has as strong for more than a minute)
        const had = p.getEffect('mining_fatigue');
        if (!had || had.amplifier < 2 || had.endsWithin(1200 - 1)) {
          p.addEffect(new MobEffectInstance(MOB_EFFECTS.mining_fatigue, 6000, 2), this);
          guardianHooks.elderCurse?.(p, this);
        }
      }
    }
    if (!this.hasRestriction()) this.restrictTo(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), 16);
  }

  /** vanilla loot_tables/entities/elder_guardian: cod more likely than crystals; a wet sponge; a tide trim now and then */
  protected override middlePool(): [number, number, number] {
    return [3, 2, 1];
  }
  protected override extraLoot(byPlayer: boolean): void {
    if (byPlayer && ITEMS.has('wet_sponge')) this.spawnAtLocation(ItemStack.of('wet_sponge'));
    if (byPlayer && this.random.nextFloat() < 0.2 && ITEMS.has('tide_armor_trim_smithing_template')) this.spawnAtLocation(ItemStack.of('tide_armor_trim_smithing_template'));
  }
}

/** vanilla Guardian.GuardianMoveControl: swims at its target, turning to face it, bobbing as it goes */
class GuardianMoveControl extends MoveControl {
  constructor(readonly g: Guardian) {
    super(g);
  }
  override tick(): void {
    const g = this.g;
    if (this.operation === MoveOp.MOVE_TO && !g.navigation.isDone()) {
      const vx = this.wantedX - g.x, vy = this.wantedY - g.y, vz = this.wantedZ - g.z;
      const d0 = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const d1 = vx / d0, d2 = vy / d0, d3 = vz / d0;
      const f = (Math.atan2(vz, vx) * 180) / Math.PI - 90;
      g.yaw = rotlerp(g.yaw, f, 90);
      g.bodyYaw = g.yaw;
      const f1 = this.speedModifier * g.moveSpeedAttr;
      const f2 = g.speed + (f1 - g.speed) * 0.125;
      g.setSpeed(f2);
      const d4 = Math.sin((g.tickCount + g.id) * 0.5) * 0.05;
      const d5 = Math.cos((g.yaw * Math.PI) / 180), d6 = Math.sin((g.yaw * Math.PI) / 180);
      const d7 = Math.sin((g.tickCount + g.id) * 0.75) * 0.05;
      g.dx += d4 * d5;
      g.dy += d7 * (d6 + d5) * 0.25 + f2 * d2 * 0.1;
      g.dz += d4 * d6;
      const lc = g.lookControl;
      const d8 = g.x + d1 * 2, d9 = g.y + g.eyeHeight + d2 / d0, d10 = g.z + d3 * 2;
      let d11 = lc.wantedX, d12 = lc.wantedY, d13 = lc.wantedZ;
      if (!lc.isLooking()) {
        d11 = d8;
        d12 = d9;
        d13 = d10;
      }
      lc.setLookAt(d11 + (d8 - d11) * 0.125, d12 + (d9 - d12) * 0.125, d13 + (d10 - d13) * 0.125, 10, 40);
      g.moving = true;
    } else {
      g.setSpeed(0);
      g.moving = false;
    }
  }
}

/** vanilla Guardian.GuardianAttackGoal: the laser */
class GuardianAttackGoal extends Goal {
  private attackTime = 0;
  private readonly elder: boolean;
  constructor(readonly g: Guardian) {
    super();
    this.elder = g instanceof ElderGuardian;
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const t = this.g.target;
    return !!t && t.isAlive;
  }
  override canContinueToUse(): boolean {
    const t = this.g.target;
    return this.canUse() && (this.elder || (!!t && this.g.distanceToSqr(t.x, t.y, t.z) > 9));
  }
  override start(): void {
    this.attackTime = -10;
    this.g.navigation.stop();
    const t = this.g.target;
    if (t) this.g.lookControl.setLookAtEntity(t, 90, 90);
  }
  override stop(): void {
    this.g.setBeamTarget(null);
    this.g.setTarget(null);
    this.g.triggerStroll();
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const g = this.g, t = g.target;
    if (!t) return;
    g.navigation.stop();
    g.lookControl.setLookAtEntity(t, 90, 90);
    if (!g.sensing.hasLineOfSight(t)) {
      g.setTarget(null);
      return;
    }
    this.attackTime++;
    if (this.attackTime === 0) {
      g.setBeamTarget(t);
      // (vanilla entity event 21: the client's GuardianAttackSoundInstance, rising as the laser charges)
      g.playSound('entity.guardian.attack', 1, 80 / g.attackDuration());
    } else if (this.attackTime >= g.attackDuration()) {
      let f = 1;
      if (g.level.difficulty === 'hard') f += 2;
      if (this.elder) f += 2;
      t.hurt(f, 'indirectMagic', g, g);
      g.doHurtTarget(t);
      g.setTarget(null);
    }
  }
}

/**
 * vanilla RandomStrollGoal as a guardian has it (interval 80, 400 for an elder): DefaultRandomPos.getPos, which for a
 * mob kept near home leans each try toward home and throws out spots beyond its reach
 */
class GuardianStrollGoal extends RandomStrollGoal {
  constructor(readonly g: Guardian, speed: number, interval: number) {
    super(g, speed, interval);
  }
  protected override getPosition(): Pos | null {
    const g = this.g, r = g.random, radius = 10, yRange = 7;
    const [cx, , cz] = g.restrictCenter;
    // vanilla GoalUtils.mobRestricted
    const restricted = g.hasRestriction() && (cx + 0.5 - g.x) ** 2 + (g.restrictCenter[1] + 0.5 - g.y) ** 2 + (cz + 0.5 - g.z) ** 2 < (g.restrictRadius + radius + 1) ** 2;
    let best: Pos | null = null, bestV = -Infinity;
    for (let i = 0; i < 10; i++) {
      let dx = r.nextInt(2 * radius + 1) - radius;
      const dy = r.nextInt(2 * yRange + 1) - yRange;
      let dz = r.nextInt(2 * radius + 1) - radius;
      // vanilla RandomPos.generateRandomPosTowardDirection: a restricted mob's tries lean toward home
      if (g.hasRestriction()) {
        dx += g.x > cx ? -r.nextInt(radius >> 1) : r.nextInt(radius >> 1);
        dz += g.z > cz ? -r.nextInt(radius >> 1) : r.nextInt(radius >> 1);
      }
      const p: Pos = [Math.floor(dx + g.x), Math.floor(dy + g.y), Math.floor(dz + g.z)];
      if (p[1] < MIN_Y || (restricted && !g.isWithinRestriction(p[0], p[1], p[2])) || !g.navigation.isStableDestination(p[0], p[1], p[2])) continue;
      const v = g.walkTargetValue(p[0], p[1], p[2]);
      if (v > bestV) {
        bestV = v;
        best = p;
      }
    }
    return best;
  }
}

/** vanilla LookAtPlayerGoal(Guardian.class, 12, 0.01): now and then a glance at another guardian */
class LookAtGuardianGoal extends LookAtPlayerGoal {
  protected override findLookAt(): LivingEntity | null {
    const m = this.mob, r = this.lookDistance;
    let best: LivingEntity | null = null, bd = Infinity;
    for (const e of m.level.getEntities(m.bb.inflate(r, 3, r), (e) => e instanceof Guardian && e !== m && e.isAlive)) {
      const d = e.distanceToSqr(m.x, m.y, m.z);
      if (d < bd && d <= r * r && m.sensing.hasLineOfSight(e)) {
        bd = d;
        best = e as LivingEntity;
      }
    }
    return best;
  }
}

/** vanilla Guardian.checkGuardianSpawnRules: in water over water, out of the sky's sight (or one time in 20), not in peaceful */
export function checkGuardianSpawnRules(level: Level, x: number, y: number, z: number, nextInt: (n: number) => number): boolean {
  const w = level.world;
  return (
    (nextInt(20) === 0 || !canSeeSkyFromBelowWater(level, x, y, z)) &&
    level.difficulty !== 'peaceful' &&
    (FLAGS[w.getState(x, y, z)] & F_WATER) !== 0 &&
    (FLAGS[w.getState(x, y - 1, z)] & F_WATER) !== 0
  );
}

/** vanilla LevelReader.canSeeSkyFromBelowWater: up through the water (and anything see-through) to open sky */
function canSeeSkyFromBelowWater(level: Level, x: number, y: number, z: number): boolean {
  const w = level.world;
  if (y >= SEA_LEVEL) return level.canSeeSky(x, y, z);
  if (!level.canSeeSky(x, SEA_LEVEL, z)) return false;
  for (let yy = SEA_LEVEL - 1; yy > y; yy--) {
    const f = FLAGS[w.getState(x, yy, z)];
    if (f & F_OPAQUE && !(f & F_WATER)) return false;
  }
  return true;
}
