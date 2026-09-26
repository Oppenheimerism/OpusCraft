// The evoker and what it conjures (vanilla SpellcasterIllager, Evoker, Vex, EvokerFangs). The evoker keeps its
// distance from players and casts: rows of snapping fangs along the ground towards its target (or two rings of them
// round itself when the target's close), three vexes to fight for it, and — with nothing to fight — "wololo", which
// turns a blue sheep red. Casting it raises its arms with coloured wisps at its hands. Vexes are little winged
// spirits with iron swords that fly through walls, charge at their target, and waste away after half a minute to two
// minutes. It dies holding a totem of undying.

import { AbstractIllager, RaiderHurtByTargetGoal, LookAtMobGoal, isVillagerTarget, isIllagerAlly, type IllagerArmPose } from './raider';
import { Monster } from './monsters';
import { Mob, type SpawnGroup, type SpawnReason, type LootEntry } from './mob';
import type { Level } from '../game/level';
import { Entity } from './entity';
import { LivingEntity } from './living';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { FloatGoal, RandomStrollGoal, LookAtPlayerGoal, NearestAttackablePlayerGoal, NearestAttackableMobGoal, TargetGoal, defaultRandomPosAway } from './ai/goals';
import { MoveControl, MoveOp } from './ai/controls';
import type { Path } from './ai/pathfinder';
import { Sheep } from './animals';
import { ItemStack } from '../item/item';
import type { DifficultyInstance } from '../game/difficulty';
import { doPostAttackEffects } from '../game/enchantEffects';
import { COLLISION, FLAGS, F_AIR } from '../world/block';
import { sturdyUp } from '../world/gen/structure';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// spellcasting (vanilla SpellcasterIllager)

/** vanilla SpellcasterIllager.IllagerSpell: the wisps' colour for each */
export type IllagerSpell = 'none' | 'summon_vex' | 'fangs' | 'wololo' | 'disappear' | 'blindness';
export const SPELL_COLORS: Record<IllagerSpell, [number, number, number]> = {
  none: [0, 0, 0],
  summon_vex: [0.7, 0.7, 0.8],
  fangs: [0.4, 0.3, 0.35],
  wololo: [0.7, 0.5, 0.2],
  disappear: [0.3, 0.3, 0.8],
  blindness: [0.1, 0.1, 0.2],
};

/**
 * vanilla SpellcasterIllager: an illager that casts. While it casts (its spell's ticks running down) it stands still
 * with its arms raised, a wisp of the spell's colour at each hand
 */
export abstract class SpellcasterIllager extends AbstractIllager {
  /** vanilla spellCastingTickCount (the server's clock of the cast) */
  spellCastingTickCount = 0;
  /** vanilla DATA_SPELL_CASTING_ID: the spell shown (arms up, wisps) until the cast is over */
  spell: IllagerSpell = 'none';

  /** vanilla isCastingSpell (the server's: ticks left) */
  isCastingSpell(): boolean {
    return this.spellCastingTickCount > 0;
  }

  setIsCastingSpell(s: IllagerSpell): void {
    this.spell = s;
  }

  /** vanilla getArmPose: arms up while casting, cheering, or folded */
  override armPose(): IllagerArmPose {
    if (this.spell !== 'none') return 'spellcasting';
    return this.celebrating ? 'celebrating' : 'crossed';
  }

  protected override customServerAiStep(): void {
    super.customServerAiStep();
    if (this.spellCastingTickCount > 0) this.spellCastingTickCount--;
  }

  /**
   * vanilla SpellcasterIllager.tick (client): while casting, a wisp of the spell's colour at each hand, swinging with
   * the arms
   */
  override tick(): void {
    super.tick();
    if (this.spell !== 'none' && !this.removed) {
      const [r, g, b] = SPELL_COLORS[this.spell];
      const f = this.bodyYaw * DEG + Math.cos(this.tickCount * 0.6662) * 0.25;
      const c = Math.cos(f), s = Math.sin(f);
      const color = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
      this.level.particles.entityEffect?.(this.x + c * 0.6, this.y + 1.8, this.z + s * 0.6, color, 1);
      this.level.particles.entityEffect?.(this.x - c * 0.6, this.y + 1.8, this.z - s * 0.6, color, 1);
    }
  }

  /** vanilla getCastingSoundEvent */
  abstract castingSound(): string;

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), SpellTicks: this.spellCastingTickCount };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.spellCastingTickCount = Number(d.SpellTicks ?? 0);
  }
}

/** vanilla SpellcasterIllager.SpellcasterCastingSpellGoal: stand still through the cast, eyes on the target */
class SpellcasterCastingSpellGoal extends Goal {
  constructor(readonly caster: SpellcasterIllager) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    return this.caster.spellCastingTickCount > 0;
  }
  override start(): void {
    this.caster.navigation.stop();
  }
  override stop(): void {
    this.caster.setIsCastingSpell('none');
  }
  override tick(): void {
    const c = this.caster, t = c.target ?? (c instanceof Evoker ? c.wololoTarget : null);
    if (t) c.lookControl.setLookAtEntity(t, c.maxHeadYRot(), c.maxHeadXRot());
  }
}

/**
 * vanilla SpellcasterIllager.SpellcasterUseSpellGoal: with a live target, not casting, and its interval passed —
 * the prepare sound, a second (or two) of warm-up with the arms raised, then the spell and the cast sound
 */
abstract class SpellcasterUseSpellGoal extends Goal {
  protected attackWarmupDelay = 0;
  protected nextAttackTickCount = 0;
  constructor(readonly caster: SpellcasterIllager) {
    super();
  }
  canUse(): boolean {
    const c = this.caster, t = c.target;
    if (!t || !t.isAlive) return false;
    if (c.isCastingSpell()) return false;
    return c.tickCount >= this.nextAttackTickCount;
  }
  override canContinueToUse(): boolean {
    const t = this.caster.target;
    return t !== null && t.isAlive && this.attackWarmupDelay > 0;
  }
  override start(): void {
    const c = this.caster;
    this.attackWarmupDelay = this.adjustedTickDelay(this.castWarmupTime());
    c.spellCastingTickCount = this.castingTime();
    this.nextAttackTickCount = c.tickCount + this.castingInterval();
    const s = this.prepareSound();
    if (s) c.playSound(s, 1, 1);
    c.setIsCastingSpell(this.spell());
  }
  override tick(): void {
    if (--this.attackWarmupDelay === 0) {
      this.performSpellCasting();
      this.caster.playSound(this.caster.castingSound(), 1, 1);
    }
  }
  protected abstract performSpellCasting(): void;
  protected castWarmupTime(): number {
    return 20;
  }
  protected abstract castingTime(): number;
  protected abstract castingInterval(): number;
  protected abstract prepareSound(): string | null;
  protected abstract spell(): IllagerSpell;
}

// ---------------------------------------------------------------------------
// evoker

/** vanilla Evoker.isAlliedTo: itself, its fellow illagers, and the vexes of any of those */
export function evokerAllied(e: Entity, other: Entity): boolean {
  if (other === e) return true;
  if (isIllagerAlly(e, other)) return true;
  if (other instanceof Vex) {
    const o = other.owner();
    return o !== null && evokerAllied(e, o);
  }
  return false;
}

/**
 * vanilla AvoidEntityGoal(this, Player.class, 8, 0.6, 1.0): a player within 8 it can see sends it off somewhere
 * further from them (up to 16 away), hurrying while they're within 7
 */
class AvoidPlayerGoal extends Goal {
  private toAvoid: LivingEntity | null = null;
  private path: Path | null = null;
  constructor(readonly mob: Mob, readonly maxDist: number, readonly walkSpeed: number, readonly sprintSpeed: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const m = this.mob;
    this.toAvoid = null;
    // (vanilla getNearestEntity(avoidEntityTargeting: TargetingConditions.forCombat().range(maxDist)): the nearest
    // player not creative or spectating, seen, near enough for how visible it is)
    const p = m.level.nearestPlayer(m.x, m.y, m.z, -1, (p) => {
      if (!p.isAlive || p.gameMode === 'creative' || p.gameMode === 'spectator') return false;
      if (Math.abs(p.y - m.y) > 3 + this.maxDist) return false;
      const range = Math.max(this.maxDist * p.visibilityPercent(m), 2);
      return p.distanceToSqr(m.x, m.y, m.z) <= range * range && m.sensing.hasLineOfSight(p);
    });
    if (!p) return false;
    const v = defaultRandomPosAway(m, 16, 7, p.x, p.y, p.z);
    if (!v) return false;
    const [vx, vy, vz] = [v[0] + 0.5, v[1], v[2] + 0.5];
    if (p.distanceToSqr(vx, vy, vz) < p.distanceToSqr(m.x, m.y, m.z)) return false;
    this.path = m.navigation.createPath(vx, vy, vz, 0);
    if (!this.path) return false;
    this.toAvoid = p;
    return true;
  }
  override canContinueToUse(): boolean {
    return !this.mob.navigation.isDone();
  }
  override start(): void {
    this.mob.navigation.moveToPath(this.path, this.walkSpeed);
  }
  override stop(): void {
    this.toAvoid = null;
  }
  override tick(): void {
    const t = this.toAvoid;
    if (!t) return;
    this.mob.navigation.speedModifier = this.mob.distanceToSqr(t.x, t.y, t.z) < 49 ? this.sprintSpeed : this.walkSpeed;
  }
}

export class Evoker extends SpellcasterIllager {
  readonly type = 'evoker';
  /** vanilla wololoTarget: the blue sheep it means to turn */
  wololoTarget: Sheep | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    this.maxHealth = this.health = 24;
    this.moveSpeedAttr = 0.5;
    this.followRange = 12;
    this.xpReward = 10;
  }

  override get eyeHeight(): number {
    return 1.62;
  }
  override vehicleAttachmentY(): number {
    return 0.6;
  }

  protected override registerGoals(): void {
    super.registerGoals();
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new SpellcasterCastingSpellGoal(this));
    this.goalSelector.addGoal(2, new AvoidPlayerGoal(this, 8, 0.6, 1));
    this.goalSelector.addGoal(4, new EvokerSummonSpellGoal(this));
    this.goalSelector.addGoal(5, new EvokerAttackSpellGoal(this));
    this.goalSelector.addGoal(6, new EvokerWololoSpellGoal(this));
    this.goalSelector.addGoal(8, new RandomStrollGoal(this, 0.6));
    this.goalSelector.addGoal(9, new LookAtPlayerGoal(this, 3, 1));
    this.goalSelector.addGoal(10, new LookAtMobGoal(this, 8));
    this.targetSelector.addGoal(1, new RaiderHurtByTargetGoal(this, true));
    // (vanilla setUnseenMemoryTicks(300) on these)
    const players = new NearestAttackablePlayerGoal(this, true);
    const villagers = new NearestAttackableMobGoal(this, isVillagerTarget, false);
    for (const g of [players, villagers]) (g as unknown as { unseenMemoryTicks: number }).unseenMemoryTicks = 300;
    this.targetSelector.addGoal(2, players);
    this.targetSelector.addGoal(3, villagers);
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, (e) => e.type === 'iron_golem', false));
  }

  /** vanilla Evoker.applyRaidBuffs: nothing */
  applyRaidBuffs(_wave: number, _unused: boolean): void {}

  celebrateSound(): string {
    return 'entity.evoker.celebrate';
  }
  castingSound(): string {
    return 'entity.evoker.cast_spell';
  }
  override ambientSound(): string {
    return 'entity.evoker.ambient';
  }
  override hurtSound(): string {
    return 'entity.evoker.hurt';
  }
  override deathSound(): string {
    return 'entity.evoker.death';
  }

  /**
   * vanilla loot table entities/evoker: a totem of undying; an emerald half the time from a player's kill (looting
   * adds 0-1 a level)
   */
  override lootTable(): LootEntry[] {
    return [
      { item: 'totem_of_undying', min: 1, max: 1, noLooting: true },
      { item: 'emerald', min: 0, max: 1, player: true },
    ];
  }
}

/**
 * vanilla Evoker.EvokerAttackSpellGoal: fangs — sixteen in a line towards the target, each a tick later, or, with
 * the target within 3, a ring of five round itself and a ring of eight further out after 3 ticks. Every 5 s
 */
class EvokerAttackSpellGoal extends SpellcasterUseSpellGoal {
  constructor(readonly evoker: Evoker) {
    super(evoker);
  }
  protected castingTime(): number {
    return 40;
  }
  protected castingInterval(): number {
    return 100;
  }
  protected performSpellCasting(): void {
    const e = this.evoker, t = e.target;
    if (!t) return;
    const minY = Math.min(t.y, e.y), maxY = Math.max(t.y, e.y) + 1;
    const f = Math.fround(Math.atan2(t.z - e.z, t.x - e.x));
    if (e.distanceToSqr(t.x, t.y, t.z) < 9) {
      for (let i = 0; i < 5; i++) {
        const f1 = f + i * Math.PI * 0.4;
        this.createSpellEntity(e.x + Math.cos(f1) * 1.5, e.z + Math.sin(f1) * 1.5, minY, maxY, f1, 0);
      }
      for (let k = 0; k < 8; k++) {
        const f2 = f + (k * Math.PI * 2) / 8 + 1.2566371;
        this.createSpellEntity(e.x + Math.cos(f2) * 2.5, e.z + Math.sin(f2) * 2.5, minY, maxY, f2, 3);
      }
    } else {
      for (let l = 0; l < 16; l++) {
        const d2 = 1.25 * (l + 1);
        this.createSpellEntity(e.x + Math.cos(f) * d2, e.z + Math.sin(f) * d2, minY, maxY, f, l);
      }
    }
  }
  /**
   * vanilla createSpellEntity: down from the top of the span to a block with a sturdy top (on what's in the way above
   * it, if anything), no lower than a block below the bottom — no fang if there's nowhere to stand
   */
  private createSpellEntity(x: number, z: number, minY: number, maxY: number, yRot: number, warmup: number): void {
    const w = this.evoker.level.world;
    const bx = Math.floor(x), bz = Math.floor(z);
    let by = Math.floor(maxY);
    let found = false, top = 0;
    do {
      const below = w.getState(bx, by - 1, bz);
      if (sturdyUp(below)) {
        const st = w.getState(bx, by, bz);
        if (!(FLAGS[st] & F_AIR)) {
          const boxes = COLLISION[st];
          if (boxes && boxes.length) top = Math.max(...boxes.map((b) => b[4]));
        }
        found = true;
        break;
      }
      by--;
    } while (by >= Math.floor(minY) - 1);
    if (found) this.evoker.level.addEntity(new EvokerFangs(this.evoker.level, x, by + top, z, yRot, warmup, this.evoker));
  }
  protected prepareSound(): string {
    return 'entity.evoker.prepare_attack';
  }
  protected spell(): IllagerSpell {
    return 'fangs';
  }
}

/**
 * vanilla Evoker.EvokerSummonSpellGoal: three vexes within 2 of it (a block up), each to live 30-120 s — only while
 * fewer are about (within 16) than a roll of 1-8. Every 17 s
 */
class EvokerSummonSpellGoal extends SpellcasterUseSpellGoal {
  constructor(readonly evoker: Evoker) {
    super(evoker);
  }
  override canUse(): boolean {
    if (!super.canUse()) return false;
    const e = this.evoker;
    const n = e.level.getEntities(e.bb.inflate(16, 16, 16), (v) => v instanceof Vex && !v.removed).length;
    return e.random.nextInt(8) + 1 > n;
  }
  protected castingTime(): number {
    return 100;
  }
  protected castingInterval(): number {
    return 340;
  }
  protected performSpellCasting(): void {
    const e = this.evoker, r = e.random;
    for (let i = 0; i < 3; i++) {
      const bx = Math.floor(e.x) - 2 + r.nextInt(5), by = Math.floor(e.y) + 1, bz = Math.floor(e.z) - 2 + r.nextInt(5);
      const vex = new Vex(e.level);
      vex.moveTo(bx, by, bz, 0, 0);
      vex.finalizeSpawn('summoned');
      vex.setOwner(e);
      vex.boundOrigin = [bx, by, bz];
      vex.setLimitedLife(20 * (30 + r.nextInt(90)));
      e.level.addEntity(vex);
    }
  }
  protected prepareSound(): string {
    return 'entity.evoker.prepare_summon';
  }
  protected spell(): IllagerSpell {
    return 'summon_vex';
  }
}

/**
 * vanilla Evoker.EvokerWololoSpellGoal: with nothing to fight and mobGriefing on, a blue sheep it can see within 16
 * is chosen; after two seconds' warm-up it turns red. Every 7 s
 */
class EvokerWololoSpellGoal extends SpellcasterUseSpellGoal {
  constructor(readonly evoker: Evoker) {
    super(evoker);
  }
  override canUse(): boolean {
    const e = this.evoker;
    if (e.target !== null || e.isCastingSpell() || e.tickCount < this.nextAttackTickCount) return false;
    if (!e.level.gameRules.mobGriefing) return false;
    const list = e.level.getEntities(e.bb.inflate(16, 4, 16), (s) => s instanceof Sheep && s.isAlive && s.color === 11 && s.distanceToSqr(e.x, e.y, e.z) <= 256 && e.sensing.hasLineOfSight(s)) as Sheep[];
    if (!list.length) return false;
    e.wololoTarget = list[e.random.nextInt(list.length)];
    return true;
  }
  override canContinueToUse(): boolean {
    return this.evoker.wololoTarget !== null && this.attackWarmupDelay > 0;
  }
  override stop(): void {
    this.evoker.wololoTarget = null;
  }
  protected performSpellCasting(): void {
    const s = this.evoker.wololoTarget;
    if (s && s.isAlive) s.color = 14;
  }
  protected override castWarmupTime(): number {
    return 40;
  }
  protected castingTime(): number {
    return 60;
  }
  protected castingInterval(): number {
    return 140;
  }
  protected prepareSound(): string {
    return 'entity.evoker.prepare_wololo';
  }
  protected spell(): IllagerSpell {
    return 'wololo';
  }
}

// ---------------------------------------------------------------------------
// fangs

/**
 * vanilla EvokerFangs: after its warm-up the jaws come up out of the ground and snap shut, 6 magic damage to any
 * living thing standing on them (not the evoker, nor its allies), with a snap and a spray of crits; gone a second later
 */
export class EvokerFangs extends Entity {
  readonly type = 'evoker_fangs';
  private warmupDelayTicks: number;
  private sentSpikeEvent = false;
  private lifeTicks = 22;
  /** the client's side: the jaws' own clock, from the entity event on */
  private clientSideAttackStarted = false;
  private clientLifeTicks = 22;
  private readonly owner: LivingEntity | null;

  constructor(level: Level, x: number, y: number, z: number, yRotRad: number, warmup: number, owner: LivingEntity | null) {
    super(level);
    this.setSize(0.5, 0.8);
    this.noPhysics = true;
    this.warmupDelayTicks = warmup;
    this.owner = owner;
    this.moveTo(x, y, z, yRotRad / DEG, 0);
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yawO = this.yaw;
    this.tickCount++;
    const lvl = this.level;
    // (client) the snap's spray of crits, 8 ticks after the event
    if (this.clientSideAttackStarted) {
      if (--this.clientLifeTicks === 14) {
        const r = () => Math.random();
        for (let i = 0; i < 12; i++) {
          const d0 = this.x + (r() * 2 - 1) * this.width * 0.5, d1 = this.y + 0.05 + r(), d2 = this.z + (r() * 2 - 1) * this.width * 0.5;
          lvl.particles.spawn?.('crit', d0, d1 + 1, d2, (r() * 2 - 1) * 0.3, 0.3 + r() * 0.3, (r() * 2 - 1) * 0.3);
        }
      }
    }
    // (server)
    if (--this.warmupDelayTicks < 0) {
      if (this.warmupDelayTicks === -8) {
        for (const e of lvl.getEntities(this.bb.inflate(0.2, 0, 0.2), (e) => e instanceof LivingEntity)) this.dealDamageTo(e as LivingEntity);
      }
      if (!this.sentSpikeEvent) {
        // vanilla entity event 4: the jaws open, and the snap
        this.clientSideAttackStarted = true;
        lvl.sound.play('entity.evoker_fangs.attack', this.x, this.y, this.z, 1, Math.random() * 0.2 + 0.85);
        this.sentSpikeEvent = true;
      }
      if (--this.lifeTicks < 0) this.remove();
    }
  }

  /** vanilla dealDamageTo: 6 as the owner's indirect magic (magic, with no owner); allies are spared */
  private dealDamageTo(t: LivingEntity): void {
    const o = this.owner;
    if (!t.isAlive || t === o) return;
    if (!o) {
      t.hurt(6, 'magic');
      return;
    }
    if (evokerAllied(o, t)) return;
    if (t.hurt(6, 'indirectMagic', o, this)) doPostAttackEffects(t, o, null, false);
  }

  /** vanilla getAnimationProgress: 0 until the jaws come up, then over 20 ticks to 1 */
  animationProgress(partial: number): number {
    if (!this.clientSideAttackStarted) return 0;
    const i = this.clientLifeTicks - 2;
    return i <= 0 ? 1 : 1 - (i - partial) / 20;
  }

  override hurt(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// vex

/**
 * vanilla Vex.VexMoveControl: straight at the wanted point through anything, a push of 0.05 × speed a tick; facing
 * the way it flies (or its target)
 */
class VexMoveControl extends MoveControl {
  constructor(readonly vex: Vex) {
    super(vex);
  }
  override tick(): void {
    if (this.operation !== MoveOp.MOVE_TO) return;
    const v = this.vex;
    const dx = this.wantedX - v.x, dy = this.wantedY - v.y, dz = this.wantedZ - v.z;
    const d0 = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const bb = v.bb, size = (bb.maxX - bb.minX + bb.maxY - bb.minY + bb.maxZ - bb.minZ) / 3;
    if (d0 < size) {
      this.operation = MoveOp.WAIT;
      v.dx *= 0.5;
      v.dy *= 0.5;
      v.dz *= 0.5;
    } else {
      const k = (this.speedModifier * 0.05) / d0;
      v.dx += dx * k;
      v.dy += dy * k;
      v.dz += dz * k;
      const t = v.target;
      if (!t) v.yaw = -Math.atan2(v.dx, v.dz) / DEG;
      else v.yaw = -Math.atan2(t.x - v.x, t.z - v.z) / DEG;
      v.bodyYaw = v.yaw;
    }
  }
}

/** vanilla Vex.VexChargeAttackGoal: now and then, at a target over 2 blocks off, a charge at its eyes; a hit ends it */
class VexChargeAttackGoal extends Goal {
  constructor(readonly vex: Vex) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const v = this.vex, t = v.target;
    if (t && t.isAlive && !v.moveControl.hasWanted() && v.random.nextInt(reducedTickDelay(7)) === 0) return v.distanceToSqr(t.x, t.y, t.z) > 4;
    return false;
  }
  override canContinueToUse(): boolean {
    const v = this.vex, t = v.target;
    return v.moveControl.hasWanted() && v.charging && t !== null && t.isAlive;
  }
  override start(): void {
    const v = this.vex, t = v.target;
    if (t) v.moveControl.setWantedPosition(t.x, t.y + t.eyeHeight, t.z, 1);
    v.charging = true;
    v.playSound('entity.vex.charge', 1, 1);
  }
  override stop(): void {
    this.vex.charging = false;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const v = this.vex, t = v.target;
    if (!t) return;
    if (v.bb.intersects(t.bb)) {
      v.doHurtTarget(t);
      v.charging = false;
    } else if (v.distanceToSqr(t.x, t.y, t.z) < 9) v.moveControl.setWantedPosition(t.x, t.y + t.eyeHeight, t.z, 1);
  }
}

/** vanilla Vex.VexRandomMoveGoal: drifting to an empty spot near where it was summoned (or where it is) */
class VexRandomMoveGoal extends Goal {
  constructor(readonly vex: Vex) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const v = this.vex;
    return !v.moveControl.hasWanted() && v.random.nextInt(reducedTickDelay(7)) === 0;
  }
  override canContinueToUse(): boolean {
    return false;
  }
  override tick(): void {
    const v = this.vex, r = v.random;
    const o = v.boundOrigin ?? [Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)];
    for (let i = 0; i < 3; i++) {
      const x = o[0] + r.nextInt(15) - 7, y = o[1] + r.nextInt(11) - 5, z = o[2] + r.nextInt(15) - 7;
      if (FLAGS[v.level.world.getState(x, y, z)] & F_AIR) {
        v.moveControl.setWantedPosition(x + 0.5, y + 0.5, z + 0.5, 0.25);
        if (!v.target) v.lookControl.setLookAt(x + 0.5, y + 0.5, z + 0.5, 180, 20);
        break;
      }
    }
  }
}

/** vanilla Vex.VexCopyOwnerTargetGoal: it takes its owner's target */
class VexCopyOwnerTargetGoal extends TargetGoal {
  constructor(readonly vex: Vex) {
    super(vex, false);
  }
  canUse(): boolean {
    const o = this.vex.owner();
    return o !== null && o.target !== null && this.vex.canAttack(o.target);
  }
  override start(): void {
    this.vex.setTarget(this.vex.owner()!.target);
    super.start();
  }
}

export class Vex extends Monster {
  readonly type = 'vex';
  /** vanilla FLAG_IS_CHARGING */
  charging = false;
  boundOrigin: [number, number, number] | null = null;
  private hasLimitedLife = false;
  private limitedLifeTicks = 0;
  private ownerRef: Mob | null = null;
  private ownerUuid: string | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0.4, 0.8);
    this.maxHealth = this.health = 14;
    this.attackDamage = 4;
    this.xpReward = 3;
    this.moveControl = new VexMoveControl(this);
  }

  override get eyeHeight(): number {
    return 0.51875;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(4, new VexChargeAttackGoal(this));
    this.goalSelector.addGoal(8, new VexRandomMoveGoal(this));
    this.goalSelector.addGoal(9, new LookAtPlayerGoal(this, 3, 1));
    this.goalSelector.addGoal(10, new LookAtMobGoal(this, 8));
    this.targetSelector.addGoal(1, new RaiderHurtByTargetGoal(this, true));
    this.targetSelector.addGoal(2, new VexCopyOwnerTargetGoal(this));
    this.targetSelector.addGoal(3, new NearestAttackablePlayerGoal(this, true));
  }

  /** vanilla Vex.getOwner: the evoker that summoned it (found again by its UUID after loading) */
  owner(): Mob | null {
    if (!this.ownerRef && this.ownerUuid) {
      const u = this.ownerUuid;
      this.ownerRef = (this.level.entities.find((e) => e instanceof Mob && e.hasUuid && e.uuid === u) as Mob | undefined) ?? null;
    }
    return this.ownerRef && !this.ownerRef.removed ? this.ownerRef : null;
  }
  setOwner(m: Mob): void {
    this.ownerRef = m;
    this.ownerUuid = m.uuid;
  }

  setLimitedLife(ticks: number): void {
    this.hasLimitedLife = true;
    this.limitedLifeTicks = ticks;
  }

  /**
   * vanilla Vex.tick: it passes through blocks and floats; once its time is up it starves, a point every second
   */
  override tick(): void {
    this.noPhysics = true;
    super.tick();
    this.noPhysics = false;
    if (this.hasLimitedLife && --this.limitedLifeTicks <= 0 && !this.removed) {
      this.limitedLifeTicks = 20;
      this.hurt(1, 'starve');
    }
  }

  override noGravity(): boolean {
    return true;
  }

  /** vanilla Vex.move: with no physics, then what it's inside of (it can still catch fire, get stuck in webs) */
  override move(mx: number, my: number, mz: number): void {
    super.move(mx, my, mz);
    this.checkInsideBlocks();
  }

  /** vanilla getLightLevelDependentMagicValue: as if always in full light */
  override lightMagic(): number {
    return 1;
  }

  /** vanilla Vex.finalizeSpawn: an iron sword that never drops, maybe enchanted */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const d = this.spawnDifficulty();
    this.populateDefaultEquipmentSlots(d);
    this.populateDefaultEquipmentEnchantments(d);
    super.finalizeSpawn(reason, group);
  }

  protected override populateDefaultEquipmentSlots(_d: DifficultyInstance): void {
    this.setItemSlot('mainhand', ItemStack.of('iron_sword'));
    this.setDropChance('mainhand', 0);
  }

  override ambientSound(): string {
    return 'entity.vex.ambient';
  }
  override hurtSound(): string {
    return 'entity.vex.hurt';
  }
  override deathSound(): string {
    return 'entity.vex.death';
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData() };
    if (this.boundOrigin) d.BoundPos = this.boundOrigin.join(',');
    if (this.hasLimitedLife) d.LifeTicks = this.limitedLifeTicks;
    if (this.ownerUuid) d.Owner = this.ownerUuid;
    return d;
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.BoundPos === 'string') {
      const p = d.BoundPos.split(',').map(Number);
      if (p.length === 3 && p.every(Number.isFinite)) this.boundOrigin = p as [number, number, number];
    }
    if (typeof d.LifeTicks === 'number') this.setLimitedLife(d.LifeTicks);
    if (typeof d.Owner === 'string') this.ownerUuid = d.Owner;
  }
}
