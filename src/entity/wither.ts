// The wither (vanilla WitherBoss and WitherSkull): the boss a player builds from a T of soul sand or soul soil with
// three wither skeleton skulls on top (game/witherSpawn.ts). It comes to life small and pale, flashing blue as it
// swells to full size over eleven seconds, healing all the while and untouchable save by the void or /kill; then it
// bursts out with a blast of power 7 and a roar the whole world hears. It flies, keeping above whatever it's after;
// each of its three heads has a target of its own and spits black wither skulls at it (the middle head at the
// mob's own target, the side ones at anything alive within 20 and in sight, or, when they've had nothing to do for
// a while, a blue skull off at random), and once in a thousand shots the middle one's skull is blue: slow, and it
// blasts through obsidian. Its friends (the undead) it never hurts nor is hurt by. Struck, it breaks every block
// round it (save the indestructible) a second later. Below half health it's armoured: arrows and tridents bounce
// off, and a scrolling swirl of energy shows over it. It heals half a heart a second, and five hearts for each kill
// a skull makes. Purple bar (darkening the sky) for those who see it; 50 experience and a nether star when it dies,
// and a wither rose where whatever it killed fell (game/witherRose.ts).

import type { Level } from '../game/level';
import type { BossBar } from '../gui/bossOverlay';
import type { Player } from './player';
import type { PathNavigation } from './ai/navigation';
import { Entity } from './entity';
import { LivingEntity } from './living';
import { Monster } from './monsters';
import { Arrow } from './arrow';
import { Fireball } from './fireball';
import { ItemEntity } from './itemEntity';
import { MobEffectInstance, MOB_EFFECTS } from './effects';
import { globalSound, mthCos, mthSin } from './enderDragon';
import { Goal, Flag } from './ai/goal';
import { HurtByTargetGoal, LookAtPlayerGoal, RandomLookAroundGoal, RangedAttackGoal, TargetGoal, WaterAvoidingRandomFlyingGoal } from './ai/goals';
import { FlyingMoveControl } from './ai/controls';
import { FlyingPathNavigation } from './ai/navigation';
import { explode } from '../game/explosion';
import { doPostAttackEffects } from '../game/enchantEffects';
import { ItemStack } from '../item/item';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';
import { wrapDegrees } from '../core/math';

const RAD = 180 / Math.PI;

/** vanilla WitherBoss.makeInvulnerable's charge: 220 ticks */
export const WITHER_SPAWN_TICKS = 220;

/** vanilla #wither_immune: what neither the wither nor its blue skulls break */
const WITHER_IMMUNE = new Set([
  'barrier', 'bedrock', 'end_portal', 'end_portal_frame', 'end_gateway', 'command_block', 'repeating_command_block', 'chain_command_block',
  'structure_block', 'jigsaw', 'moving_piston', 'light', 'reinforced_deepslate',
]);

/** vanilla WitherBoss.canDestroy: anything but air and the #wither_immune */
export function witherCanDestroy(st: number): boolean {
  return !(FLAGS[st] & F_AIR) && !WITHER_IMMUNE.has(BLOCKS[STATE_BLOCK[st]].name);
}

/** vanilla #wither_friends (#undead): what the wither leaves alone, and takes no harm from */
function isWitherFriend(e: Entity | null | undefined): boolean {
  return e instanceof LivingEntity && e.isUndead();
}

/** vanilla Entity.isAlive for any entity: not removed, and if alive, not dead */
function alive(e: Entity): boolean {
  return e instanceof LivingEntity ? e.isAlive : !e.removed;
}

/** the wither's own rotlerp (vanilla WitherBoss.rotlerp): the step toward `to`, at most `max`, not wrapped */
function headRotlerp(from: number, to: number, max: number): number {
  return from + Math.max(-max, Math.min(max, wrapDegrees(to - from)));
}

/** a wither's bar (vanilla ServerBossEvent, PURPLE, PROGRESS, darkenScreen) */
export interface WitherBar extends BossBar {
  name: string;
  progress: number;
}

/** vanilla WitherBoss.WitherDoNothingGoal: while it charges up it neither moves, jumps nor looks about */
class WitherDoNothingGoal extends Goal {
  constructor(readonly wither: WitherBoss) {
    super();
    this.flags = Flag.MOVE | Flag.JUMP | Flag.LOOK;
  }
  canUse(): boolean {
    return this.wither.invulnerableTicks > 0;
  }
}

/**
 * vanilla NearestAttackableTargetGoal(LivingEntity, 0, false, false, LIVING_ENTITY_SELECTOR): the nearest living
 * thing that isn't one of its friends, within its follow range (4 up and down past its box, as far as the thing can
 * be seen) and in sight, looked for each time the goals run; kept even out of sight while within the follow range
 */
class WitherTargetGoal extends TargetGoal {
  private found: LivingEntity | null = null;
  constructor(readonly wither: WitherBoss) {
    super(wither, false);
  }
  canUse(): boolean {
    const m = this.wither, r = this.followDistance();
    let best: LivingEntity | null = null, bd = Infinity;
    for (const e of m.level.getEntities(m.bb.inflate(r, 4, r), (e) => e instanceof LivingEntity && e !== m)) {
      const le = e as LivingEntity;
      if (!m.canTarget(le, r)) continue;
      const d = le.distanceToSqr(m.x, m.y + m.eyeHeight, m.z);
      if (d < bd) {
        bd = d;
        best = le;
      }
    }
    this.found = best;
    return best !== null;
  }
  override start(): void {
    this.mob.setTarget(this.found);
    super.start();
  }
}

export class WitherBoss extends Monster {
  readonly type = 'wither';
  /** vanilla DATA_ID_INV: the ticks of its charge left (shown pale and swelling, and untouchable, while above 0) */
  invulnerableTicks = 0;
  /** vanilla bossEvent.progress (the host's, sent along): its charge, then its health */
  barProgress = 1;
  /** vanilla DATA_TARGET_A..C: what each head is after (the middle one's is the mob's own target, set each tick) */
  targetA: LivingEntity | null = null;
  targetB: LivingEntity | null = null;
  targetC: LivingEntity | null = null;
  /** vanilla xRotHeads / yRotHeads: the side heads' looks, each game working them out itself (not sent) */
  readonly xRotHeads = new Float32Array(2);
  readonly yRotHeads = new Float32Array(2);
  /** the host's own counters (vanilla nextHeadUpdate, idleHeadUpdates, destroyBlocksTick): not sent */
  private readonly ai = { nextHeadUpdate: [0, 0], idleHeadUpdates: [0, 0], destroyBlocksTick: 0 };
  /** the bar, as the overlay shows it (gui/bossOverlay.ts); kept the one object, its name and progress refreshed */
  private readonly bar: WitherBar = { name: 'Wither', color: 'purple', overlay: 'progress', progress: 1, playBossMusic: false, createWorldFog: false, darkenScreen: true };

  constructor(level: Level) {
    super(level);
    this.setSize(0.9, 3.5);
    // vanilla createAttributes: 300 health, 4 armour, 0.6 movement and flying speed, a follow range of 40
    this.maxHealth = this.health = 300;
    this.baseArmor = 4;
    this.moveSpeedAttr = 0.6;
    this.flyingSpeedAttr = 0.6;
    this.followRange = 40;
    this.xpReward = 50;
    this.moveControl = new FlyingMoveControl(this, 10, false);
  }

  /** vanilla createNavigation: a flier's, floating, through doors but never opening them */
  protected override createNavigation(): PathNavigation {
    const n = new FlyingPathNavigation(this);
    n.canOpenDoors = false;
    n.canFloat = true;
    return n;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new WitherDoNothingGoal(this));
    this.goalSelector.addGoal(2, new RangedAttackGoal(this, 1, 40, 40, 20));
    this.goalSelector.addGoal(5, new WaterAvoidingRandomFlyingGoal(this, 1));
    this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(7, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this));
    this.targetSelector.addGoal(2, new WitherTargetGoal(this));
  }

  /**
   * vanilla TargetingConditions.forCombat().range(r).selector(LIVING_ENTITY_SELECTOR) for this wither: alive and
   * attackable, not a ghast (vanilla Mob.canAttackType), not one of its friends, within `r` (as far as it can be
   * seen, at least 2) and in its sight
   */
  canTarget(e: LivingEntity, r: number): boolean {
    if (!this.canAttack(e) || e.type === 'ghast' || isWitherFriend(e)) return false;
    const range = Math.max(r * e.visibilityPercent(this), 2);
    if (this.distanceToSqr(e.x, e.y, e.z) > range * range) return false;
    return this.sensing.hasLineOfSight(e);
  }

  /** vanilla makeInvulnerable (built by a player): the charge, the bar empty, a third of its health */
  makeInvulnerable(): void {
    this.invulnerableTicks = WITHER_SPAWN_TICKS;
    this.barProgress = 0;
    this.health = this.maxHealth / 3;
  }

  /** vanilla isPowered: at half health or less, armoured */
  isPowered(): boolean {
    return this.health <= this.maxHealth / 2;
  }

  /** vanilla getAlternativeTarget: what head `i` is after (gone if it's out of the world) */
  alternativeTarget(i: number): LivingEntity | null {
    const t = i === 0 ? this.targetA : i === 1 ? this.targetB : this.targetC;
    return t && !t.removed ? t : null;
  }

  private setAlternativeTarget(i: number, t: LivingEntity | null): void {
    if (i === 0) this.targetA = t;
    else if (i === 1) this.targetB = t;
    else this.targetC = t;
  }

  /** vanilla getHeadX / getHeadY / getHeadZ: the middle head over its middle, the side ones 1.3 out either side (at its scale) */
  headX(h: number): number {
    if (h <= 0) return this.x;
    return this.x + mthCos((this.bodyYaw + 180 * (h - 1)) / RAD) * 1.3;
  }
  headY(h: number): number {
    return this.y + (h <= 0 ? 3 : 2.2);
  }
  headZ(h: number): number {
    if (h <= 0) return this.z;
    return this.z + mthSin((this.bodyYaw + 180 * (h - 1)) / RAD) * 1.3;
  }

  override aiStep(): void {
    // vanilla aiStep: it slows its rise, then (the host) climbs to keep over the middle head's target (5 blocks over
    // it till it's armoured) and closes in on it from more than 3 away
    let vx = this.dx, vy = this.dy * 0.6, vz = this.dz;
    const t = this.level.isClientSide ? null : this.alternativeTarget(0);
    if (t) {
      if (this.y < t.y || (!this.isPowered() && this.y < t.y + 5)) {
        vy = Math.max(0, vy);
        vy += 0.3 - vy * Math.fround(0.6);
      }
      const ox = t.x - this.x, oz = t.z - this.z, h2 = ox * ox + oz * oz;
      if (h2 > 9) {
        const l = Math.sqrt(h2);
        vx += (ox / l) * 0.3 - vx * 0.6;
        vz += (oz / l) * 0.3 - vz * 0.6;
      }
    }
    this.dx = vx;
    this.dy = vy;
    this.dz = vz;
    if (vx * vx + vz * vz > 0.05) this.yaw = Math.atan2(vz, vx) * RAD - 90;
    super.aiStep();
    this.turnHeads();
    // the smoke at its heads, and while armoured the swirl's glints; while it charges, its glow (the host's, sent along)
    const r = this.random, powered = this.isPowered();
    for (let l = 0; l < 3; l++) {
      const x = this.headX(l), y = this.headY(l), z = this.headZ(l);
      this.level.particles.spawn?.('smoke', x + r.gaussian() * 0.3, y + r.gaussian() * 0.3, z + r.gaussian() * 0.3, 0, 0, 0);
      if (powered && this.level.random.nextInt(4) === 0) this.level.particles.entityEffect?.(x + r.gaussian() * 0.3, y + r.gaussian() * 0.3, z + r.gaussian() * 0.3, 0xb2b27f, 255);
    }
    if (this.invulnerableTicks > 0) {
      for (let i = 0; i < 3; i++) this.level.particles.entityEffect?.(this.x + r.gaussian(), this.y + r.nextFloat() * 3.3, this.z + r.gaussian(), 0xb2b2e5, 255);
    }
  }

  /** (vanilla aiStep, on both sides) each side head turns toward its target's eyes, or back round to face ahead */
  private turnHeads(): void {
    for (let j = 0; j < 2; j++) {
      const e = this.alternativeTarget(j + 1);
      if (e) {
        const dx = e.x - this.headX(j + 1), dy = e.y + e.eyeHeight - this.headY(j + 1), dz = e.z - this.headZ(j + 1);
        const d = Math.sqrt(dx * dx + dz * dz);
        this.xRotHeads[j] = headRotlerp(this.xRotHeads[j], -(Math.atan2(dy, d) * RAD), 40);
        this.yRotHeads[j] = headRotlerp(this.yRotHeads[j], Math.atan2(dz, dx) * RAD - 90, 10);
      } else this.yRotHeads[j] = headRotlerp(this.yRotHeads[j], this.bodyYaw, 10);
    }
  }

  /** (a guest's copy) the heads turn as on the host, from the targets it's sent */
  override animateMirror(): void {
    super.animateMirror();
    this.turnHeads();
  }

  protected override customServerAiStep(): void {
    const lvl = this.level, ai = this.ai;
    if (this.invulnerableTicks > 0) {
      // vanilla: the charge fills the bar; at its end the blast (power 7, no fire, a mob's) and the roar all hear
      const k = this.invulnerableTicks - 1;
      this.barProgress = 1 - k / WITHER_SPAWN_TICKS;
      if (k <= 0) {
        // (vanilla Explosion.getDefaultDamageSource: the wither both the blast and who's behind it, PLAYER_EXPLOSION:
        // "was blown up by Wither")
        explode(lvl, this, this.x, this.y + this.eyeHeight, this.z, 7, false, 'mob', 'playerExplosion');
        globalSound(lvl, 'entity.wither.spawn', this.x, this.y, this.z, 1);
      }
      this.invulnerableTicks = k;
      if (this.tickCount % 10 === 0) this.heal(10);
      return;
    }
    super.customServerAiStep();
    for (let i = 1; i < 3; i++) {
      if (this.tickCount < ai.nextHeadUpdate[i - 1]) continue;
      ai.nextHeadUpdate[i - 1] = this.tickCount + 10 + this.random.nextInt(10);
      // with nothing to do for a while (normal and hard), a blue skull off anywhere within 10 (5 up and down)
      if (lvl.difficulty === 'normal' || lvl.difficulty === 'hard') {
        if (ai.idleHeadUpdates[i - 1]++ > 15) {
          const r = this.random;
          const x = this.x - 10 + r.nextDouble() * 20, y = this.y - 5 + r.nextDouble() * 10, z = this.z - 10 + r.nextDouble() * 20;
          this.shootSkullAt(i + 1, x, y, z, true);
          ai.idleHeadUpdates[i - 1] = 0;
        }
      }
      const t = this.alternativeTarget(i);
      if (t) {
        // (vanilla: within 30, in sight, or forgotten; and a shot from the other side's mouth, as vanilla's i + 1)
        if (this.canAttack(t) && this.distanceToSqr(t.x, t.y, t.z) <= 900 && this.hasLineOfSight(t)) {
          this.shootSkullAtEntity(i + 1, t);
          ai.nextHeadUpdate[i - 1] = this.tickCount + 40 + this.random.nextInt(20);
          ai.idleHeadUpdates[i - 1] = 0;
        } else this.setAlternativeTarget(i, null);
      } else {
        // vanilla getNearbyEntities(LivingEntity, TARGETING_CONDITIONS (range 20), box inflated 20, 8, 20): one at random
        const list: LivingEntity[] = [];
        for (const e of lvl.getEntities(this.bb.inflate(20, 8, 20), (e) => e instanceof LivingEntity && e !== this)) if (this.canTarget(e as LivingEntity, 20)) list.push(e as LivingEntity);
        if (list.length) this.setAlternativeTarget(i, list[this.random.nextInt(list.length)]);
      }
    }
    this.targetA = this.target;
    // struck a second ago: every block round it (3 across, from its feet to its head) broken, if mobs may grief
    if (ai.destroyBlocksTick > 0 && --ai.destroyBlocksTick === 0 && lvl.gameRules.mobGriefing) {
      let any = false;
      const j = Math.floor(this.width / 2 + 1), k = Math.floor(this.height);
      const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
      // (vanilla BlockPos.betweenClosed's order: x, then y, then z)
      for (let z = bz - j; z <= bz + j; z++)
        for (let y = by; y <= by + k; y++)
          for (let x = bx - j; x <= bx + j; x++) {
            const st = lvl.getState(x, y, z);
            // (vanilla destroyBlock puts a fluid back as it was: water and lava stay)
            if (!witherCanDestroy(st) || BLOCKS[STATE_BLOCK[st]].s.fluid) continue;
            // (vanilla destroyBlock(pos, true, this): its drops as no player's, whatever tool they'd need)
            any = lvl.destroyBlock(x, y, z, true, null, true, null, this, false) || any;
          }
      // (vanilla level event 1022)
      if (any) lvl.sound.play('entity.wither.break_block', bx + 0.5, by + 0.5, bz + 0.5, 1, lvl.random.nextFloat() * 0.2 + 0.9);
    }
    if (this.tickCount % 20 === 0) this.heal(1);
    this.barProgress = this.health / this.maxHealth;
  }

  /** vanilla performRangedAttack(head, target): at the middle of its body; one in a thousand of the middle head's shots blue */
  private shootSkullAtEntity(head: number, t: LivingEntity): void {
    this.shootSkullAt(head, t.x, t.y + t.eyeHeight * 0.5, t.z, head === 0 && this.random.nextFloat() < 0.001);
  }

  /** vanilla performRangedAttack(head, x, y, z, dangerous): its shot (level event 1024), a skull from that head's mouth */
  private shootSkullAt(head: number, x: number, y: number, z: number, dangerous: boolean): void {
    const lvl = this.level;
    const r = lvl.random;
    lvl.sound.play('entity.wither.shoot', Math.floor(this.x) + 0.5, Math.floor(this.y) + 0.5, Math.floor(this.z) + 0.5, 2, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
    const hx = this.headX(head), hy = this.headY(head), hz = this.headZ(head);
    const skull = new WitherSkull(lvl, this, x - hx, y - hy, z - hz);
    skull.dangerous = dangerous;
    skull.moveTo(hx, hy, hz, this.yaw, this.pitch);
    lvl.addEntity(skull);
  }

  /** vanilla RangedAttackMob.performRangedAttack (the RangedAttackGoal's): from the middle head */
  performRangedAttack(target: LivingEntity, _power: number): void {
    this.shootSkullAtEntity(0, target);
  }

  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.level.isClientSide || this.isInvulnerableTo(source)) return false;
    // vanilla #wither_immune_to: drowning
    if (source === 'drown') return false;
    // charging, only the void and /kill reach it (vanilla #bypasses_invulnerability)
    if (this.invulnerableTicks > 0 && source !== 'void' && source !== 'genericKill') return false;
    // armoured, arrows and tridents bounce off
    if (this.isPowered() && direct instanceof Arrow) return false;
    // nothing its friends do hurts it (its own skulls' blasts included)
    if (isWitherFriend(attacker)) return false;
    const ai = this.ai;
    if (ai.destroyBlocksTick <= 0) ai.destroyBlocksTick = 20;
    ai.idleHeadUpdates[0] += 3;
    ai.idleHeadUpdates[1] += 3;
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla dropCustomDeathLoot: a nether star, which lasts 15 minutes on the ground (ItemEntity.setExtendedLifetime) */
  protected override dropCustomDeathLoot(attacker: Entity | null, recentlyHit: boolean, looting: number): void {
    super.dropCustomDeathLoot(attacker, recentlyHit, looting);
    const star: ItemEntity = this.spawnAtLocation(ItemStack.of('nether_star'));
    star.age = -6000;
  }

  /** vanilla checkDespawn: gone in peaceful, never otherwise */
  override checkDespawn(): void {
    if (this.level.difficulty === 'peaceful' && this.shouldDespawnInPeaceful()) this.remove();
    else this.noActionTime = 0;
  }

  /** vanilla canBeAffected: never withered (and, undead, no poison or regeneration) */
  override canBeAffected(inst: MobEffectInstance): boolean {
    return inst.effect !== MOB_EFFECTS.wither && super.canBeAffected(inst);
  }

  override isUndead(): boolean {
    return true;
  }
  override fireImmune(): boolean {
    return true;
  }
  /** vanilla #fall_damage_immune */
  protected override causeFallDamage(_dist: number): void {}
  /** vanilla makeStuckInBlock: nothing slows it (cobwebs, berry bushes, powder snow) */
  override makeStuckInBlock(_mx: number, _my: number, _mz: number): void {}
  /** vanilla canUsePortal: false */
  override setAsInsidePortal(): void {}
  /** vanilla canRide: false */
  protected override canRide(_vehicle: Entity): boolean {
    return false;
  }

  override ambientSound(): string {
    return 'entity.wither.ambient';
  }
  override hurtSound(): string {
    return 'entity.wither.hurt';
  }
  override deathSound(): string {
    return 'entity.wither.death';
  }

  /** vanilla addAdditionalSaveData: Invul */
  protected override saveData(): Record<string, number | string | boolean> {
    return { Invul: this.invulnerableTicks };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.invulnerableTicks = Math.max(0, Math.floor(Number(d.Invul) || 0));
  }

  /** its bar, as it stands: its custom name or "Wither", and the host's progress */
  shownBar(): WitherBar {
    const b = this.bar;
    b.name = this.customName ?? 'Wither';
    b.progress = Math.max(0, Math.min(1, this.barProgress));
    return b;
  }
}

/**
 * the withers' bars `viewer` sees (vanilla: a wither's ServerBossEvent shows to the players tracking it, ChunkMap's
 * TrackedEntity: within its 10 chunks across, and no farther than the view distance less one): on a guest, every
 * wither its game has (the host sends only those it tracks); on the host, those near enough to its own player
 */
export function witherBars(level: Level, viewer: Player | null, viewDistance: number): WitherBar[] {
  if (!viewer) return [];
  const out: WitherBar[] = [];
  const r = Math.min(10, Math.max(1, viewDistance - 1)) * 16;
  for (const e of level.entities) {
    if (!(e instanceof WitherBoss) || e.removed) continue;
    if (!level.isClientSide) {
      const dx = e.x - viewer.x, dz = e.z - viewer.z;
      if (dx * dx + dz * dz > r * r) continue;
    }
    out.push(e.shownBar());
  }
  return out;
}

/**
 * vanilla WitherSkull: a wither's shot, pushed along like any fireball but black (or blue: `dangerous`, which slows
 * hard and blasts through all but the indestructible). It hurts what it hits 8 (5 by magic with no wither behind it),
 * withers it (10 s on normal, 40 s on hard, wither II), and heals the wither 5 if that killed it; then bursts (power
 * 1, a mob's). It can't be struck back.
 */
export class WitherSkull extends Fireball {
  readonly type = 'wither_skull';
  /** vanilla DATA_DANGEROUS: the blue skull */
  dangerous = false;

  constructor(level: Level, owner: Entity | null, dirX: number, dirY: number, dirZ: number) {
    super(level, owner, 0.3125, dirX, dirY, dirZ);
  }

  /** vanilla getInertia: a blue skull's 0.73 (any skull's 0.8 in water) */
  protected override inertia(): number {
    return this.dangerous ? 0.73 : 0.95;
  }

  override tick(): void {
    super.tick();
    if (!this.removed) this.rotateTowardsMovement();
  }

  /** vanilla ProjectileUtil.rotateTowardsMovement(0.2): it turns a fifth of the way toward its heading each tick */
  private rotateTowardsMovement(): void {
    const { dx, dy, dz } = this;
    if (dx * dx + dy * dy + dz * dz === 0) return;
    const yaw = Math.atan2(dz, dx) * RAD + 90, pitch = Math.atan2(Math.sqrt(dx * dx + dz * dz), dy) * RAD - 90;
    while (pitch - this.pitchO < -180) this.pitchO -= 360;
    while (pitch - this.pitchO >= 180) this.pitchO += 360;
    while (yaw - this.yawO < -180) this.yawO -= 360;
    while (yaw - this.yawO >= 180) this.yawO += 360;
    this.pitch = this.pitchO + (pitch - this.pitchO) * 0.2;
    this.yaw = this.yawO + (yaw - this.yawO) * 0.2;
  }

  /** vanilla getBlockExplosionResistance: a blue skull's blast makes light of all the wither may break (0.8 at most) */
  explosionResistance(st: number, res: number): number {
    return this.dangerous && witherCanDestroy(st) ? Math.min(0.8, res) : res;
  }

  /** vanilla isPickable and hurt: not to be struck */
  override isPickable(): boolean {
    return false;
  }
  override hurt(): boolean {
    return false;
  }
  override isOnFire(): boolean {
    return false;
  }

  /** vanilla WitherSkull.onHitEntity */
  protected hitEntity(e: Entity): void {
    const owner = this.owner;
    let hit: boolean;
    if (owner instanceof LivingEntity) {
      hit = e.hurt(8, 'witherSkull', owner, this);
      if (hit) {
        // (vanilla EnchantmentHelper.doPostAttackEffects: the victim's thorns) or, dead, the wither healed
        if (alive(e)) doPostAttackEffects(e, owner, null, false);
        else owner.heal(5);
      }
    } else hit = e.hurt(5, 'magic');
    if (hit && e instanceof LivingEntity) {
      const d = this.level.difficulty, s = d === 'normal' ? 10 : d === 'hard' ? 40 : 0;
      if (s > 0) e.addEffect(new MobEffectInstance(MOB_EFFECTS.wither, 20 * s, 1), owner ?? this);
    }
  }

  /** vanilla WitherSkull.onHit: a blast of power 1 (a mob's), and gone */
  protected onHit(): void {
    explode(this.level, this, this.x, this.y, this.z, 1, false, 'mob');
    this.remove();
  }
}
