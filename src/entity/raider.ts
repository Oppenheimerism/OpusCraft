// The raiders' shared base (vanilla PatrollingMonster → Raider → AbstractIllager): a patrol walking the land behind
// its captain, who carries the ominous banner on its head; the raid a raider belongs to (game/raids.ts fills in the
// raid itself), the captain's banner it will go and pick up, its celebration when the village falls; and the
// illagers' arm poses, their doors, and who they count as friends. The mobs themselves: entity/illagers.ts
// (pillager, vindicator), entity/evoker.ts (evoker, vex, fangs), entity/ravager.ts, entity/witch.ts.

import { Monster, validSpawnBlock } from './monsters';
import { Mob, type SpawnReason, type SpawnGroup } from './mob';

import type { Level } from '../game/level';
import type { Entity } from './entity';
import type { Player } from './player';
import { LivingEntity } from './living';
import { ItemEntity } from './itemEntity';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { DoorInteractGoal, LookAtPlayerGoal, TargetGoal } from './ai/goals';
import { AABB } from '../core/aabb';
import { ItemStack, sameTag } from '../item/item';
import { ominousBanner } from '../game/banners';
import type { Difficulty } from '../game/difficulty';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_LAVA } from '../world/block';
import { isSolidBlock } from '../world/gen/patches';
import { MIN_Y } from '../world/constants';

/** vanilla MobSpawnType PATROL and EVENT (a raid's), besides the reasons any mob can spawn for */
export type RaiderSpawnReason = SpawnReason | 'patrol' | 'event';

// ---------------------------------------------------------------------------
// the raid, as a raider sees it (game/raids.ts)

/** what a raider needs of the raid it's in (vanilla Raid) */
export interface RaidLink {
  readonly id: number;
  /** vanilla Raid.isActive: not stopped, and its village's middle is loaded */
  isActive(): boolean;
  isOver(): boolean;
  /** vanilla isLoss: the village fell */
  isLoss(): boolean;
  leader(wave: number): Raider | null;
  setLeader(wave: number, r: Raider): void;
  removeLeader(wave: number): void;
  removeFromRaid(r: Raider, wanderedOff: boolean): void;
  /** vanilla addWaveMob: one of wave `wave` (a raider loaded from a save comes back, its health not counted again) */
  addWaveMob(wave: number, r: Raider, countHealth: boolean): boolean;
  addHeroOfTheVillage(e: Entity): void;
  updateBossbar(): void;
  /** vanilla getEnchantOdds, by the raid omen level: 0.1 at 2, 0.25 at 3, 0.5 at 4, 0.75 at 5 (none at 1) */
  enchantOdds(): number;
  /** vanilla getNumGroups: the waves a raid on `d` has (3, 5, 7) */
  numGroups(d: Difficulty): number;
  /** vanilla Raid.getCenter */
  center(): [number, number, number];
  /** vanilla getGroupsSpawned */
  groupsSpawned(): number;
}

/** the level's raids (vanilla Raids / ServerLevel.getRaidAt, isRaided), set by game/raids.ts */
export const raidHooks: {
  /** vanilla ServerLevel.getRaidAt: the raid whose village this is (within 96 blocks of its centre) */
  raidAt: (level: Level, x: number, y: number, z: number) => RaidLink | null;
  /** vanilla ServerLevel.isRaided */
  isRaided: (level: Level, x: number, y: number, z: number) => boolean;
  /** vanilla Raids.get: a raid by its id (a raider loaded from a save finds its raid again) */
  byId: (level: Level, id: number) => RaidLink | null;
  /** vanilla Raids.canJoinRaid + Raid.joinRaid(wave, raider, null, true): a raider wandering into a raided village */
  tryJoin: (level: Level, r: Raider, raid: RaidLink) => void;
} = {
  raidAt: () => null,
  isRaided: () => false,
  byId: () => null,
  tryJoin: () => {},
};

// ---------------------------------------------------------------------------
// patrols

/** vanilla #raiders */
export const RAIDER_TYPES = new Set(['witch', 'pillager', 'vindicator', 'evoker', 'illusioner', 'ravager']);
/** vanilla #illager */
export const ILLAGER_TYPES = new Set(['evoker', 'illusioner', 'pillager', 'vindicator']);

/** vanilla Raider.isCaptain's banner test (ItemStack.matches with Raid.getLeaderBannerInstance) */
export function isOminousBanner(s: ItemStack | null | undefined): boolean {
  if (!s || s.item.id !== 'white_banner') return false;
  return sameTag(s.tag, ominousBanner().tag);
}

/** vanilla Heightmap.Types.MOTION_BLOCKING_NO_LEAVES: above the highest block that stops movement or holds a fluid, leaves not counting */
export function motionBlockingNoLeaves(level: Level, x: number, z: number): number {
  const w = level.world;
  for (let y = w.heightAt(x, z) - 1; y >= MIN_Y; y--) {
    const st = w.getState(x, y, z);
    if (FLAGS[st] & (F_WATER | F_LAVA)) return y + 1;
    if (isSolidBlock(st)) {
      const n = BLOCKS[STATE_BLOCK[st]].name;
      if (n !== 'cobweb' && n !== 'bamboo_sapling' && !n.endsWith('_leaves')) return y + 1;
    }
  }
  return MIN_Y;
}

/**
 * vanilla PatrollingMonster.checkPatrollingMonsterSpawnRules: no brighter than block light 8, then
 * checkAnyLightMonsterSpawnRules (not in peaceful, on a floor a monster may stand on; the sky's light doesn't matter)
 */
export function checkPatrollingMonsterSpawnRules(level: Level, x: number, y: number, z: number): boolean {
  if ((level.world.getLight(x, y, z) & 15) > 8) return false;
  return level.difficulty !== 'peaceful' && validSpawnBlock(level, x, y - 1, z);
}

/**
 * vanilla PatrollingMonster: a mob that can walk in a patrol — led by its captain towards a far-off point, the
 * others following wherever the captain goes; it won't despawn while patrolling (unless 128 blocks off)
 */
export abstract class PatrollingMonster extends Monster {
  patrolTarget: [number, number, number] | null = null;
  patrolLeader = false;
  patrolling = false;

  constructor(level: Level) {
    super(level);
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(4, new LongDistancePatrolGoal(this, 0.7, 0.595));
  }

  /**
   * vanilla PatrollingMonster.finalizeSpawn: anything not part of a patrol, a raid or a structure has a 6% chance of
   * being a captain (when its kind can be), and a captain wears the ominous banner (a sure drop); a patrol's members
   * are patrolling
   */
  override finalizeSpawn(reason: RaiderSpawnReason, group?: SpawnGroup): void {
    if (reason !== 'patrol' && reason !== 'event' && reason !== 'structure' && this.random.nextFloat() < 0.06 && this.canBeLeader()) this.patrolLeader = true;
    if (this.patrolLeader) {
      this.setItemSlot('head', ominousBanner());
      this.setDropChance('head', 2);
    }
    if (reason === 'patrol') this.patrolling = true;
    super.finalizeSpawn(reason as SpawnReason, group);
  }

  /** vanilla removeWhenFarAway: a patrol keeps going, unless it's 128 blocks off */
  override removeWhenFarAway(d2: number): boolean {
    return !this.patrolling || d2 > 16384;
  }

  canBeLeader(): boolean {
    return true;
  }

  /** vanilla canJoinPatrol */
  canJoinPatrol(): boolean {
    return true;
  }

  /** vanilla findPatrolTarget: somewhere up to 500 blocks off either way */
  findPatrolTarget(): void {
    const r = this.random;
    this.patrolTarget = [Math.floor(this.x) - 500 + r.nextInt(1000), Math.floor(this.y), Math.floor(this.z) - 500 + r.nextInt(1000)];
    this.patrolling = true;
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData(), PatrolLeader: this.patrolLeader, Patrolling: this.patrolling };
    if (this.patrolTarget) d.PatrolTarget = this.patrolTarget.join(',');
    return d;
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.patrolLeader = d.PatrolLeader === true;
    this.patrolling = d.Patrolling === true;
    if (typeof d.PatrolTarget === 'string') {
      const p = d.PatrolTarget.split(',').map(Number);
      if (p.length === 3 && p.every(Number.isFinite)) this.patrolTarget = p as [number, number, number];
    }
  }
}

/**
 * vanilla PatrollingMonster.LongDistancePatrolGoal: the captain heads for its patrol target ten blocks at a time
 * (a little to the side of the straight line, which curves the walk), telling the others within 16 where it's going;
 * a member left on its own stops patrolling; a way it can't find sends it off at random for ten seconds
 */
export class LongDistancePatrolGoal extends Goal {
  private cooldownUntil = 0;
  constructor(readonly mob: PatrollingMonster, readonly speedModifier: number, readonly leaderSpeedModifier: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const m = this.mob;
    const cooling = m.level.gameTime < this.cooldownUntil;
    return m.patrolling && m.target === null && !m.controllingPassenger() && m.patrolTarget !== null && !cooling;
  }
  override tick(): void {
    const m = this.mob, leader = m.patrolLeader, nav = m.navigation;
    if (!nav.isDone()) return;
    const companions = this.findPatrolCompanions();
    const t = m.patrolTarget!;
    if (m.patrolling && companions.length === 0) m.patrolling = false;
    else if (leader && (t[0] + 0.5 - m.x) ** 2 + (t[1] + 0.5 - m.y) ** 2 + (t[2] + 0.5 - m.z) ** 2 < 100) m.findPatrolTarget();
    else {
      // vanilla: the target's bottom centre, the mob's offset from it turned 90° and scaled 0.4 added (a curve), then
      // ten blocks from the mob towards that, on the ground there
      const tx = t[0] + 0.5, ty = t[1], tz = t[2] + 0.5;
      const ox = m.x - tx, oy = m.y - ty, oz = m.z - tz;
      // (vanilla vec32.yRot(90.0F): Vec3.yRot takes radians, so it's 90 radians round, not a right angle;
      // x' = x cos + z sin, z' = z cos - x sin)
      const c = Math.cos(90), s = Math.sin(90);
      const px = (ox * c + oz * s) * 0.4 + tx, py = oy * 0.4 + ty, pz = (oz * c - ox * s) * 0.4 + tz;
      let dx = px - m.x, dy = py - m.y, dz = pz - m.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-4) dx = dy = dz = 0;
      else {
        dx = (dx / len) * 10;
        dy = (dy / len) * 10;
        dz = (dz / len) * 10;
      }
      const bx = Math.floor(m.x + dx), bz = Math.floor(m.z + dz);
      void dy;
      const by = motionBlockingNoLeaves(m.level, bx, bz);
      if (!nav.moveTo(bx, by, bz, leader ? this.leaderSpeedModifier : this.speedModifier)) {
        this.moveRandomly();
        this.cooldownUntil = m.level.gameTime + 200;
      } else if (leader) for (const p of companions) p.patrolTarget = [bx, by, bz];
    }
  }
  /** vanilla findPatrolCompanions: those within 16 that can join a patrol */
  private findPatrolCompanions(): PatrollingMonster[] {
    const m = this.mob;
    return m.level.getEntities(m.bb.inflate(16, 16, 16), (e) => e instanceof PatrollingMonster && e !== m && e.canJoinPatrol()) as PatrollingMonster[];
  }
  /** vanilla moveRandomly: somewhere within 8 on the ground */
  private moveRandomly(): void {
    const m = this.mob, r = m.random;
    const x = Math.floor(m.x) - 8 + r.nextInt(16), z = Math.floor(m.z) - 8 + r.nextInt(16);
    m.navigation.moveTo(x, motionBlockingNoLeaves(m.level, x, z), z, this.speedModifier);
  }
}

// ---------------------------------------------------------------------------
// raiders

/**
 * vanilla Raider: a patroller that can be part of a raid — it goes after the raid's captain banner if its wave has
 * lost its captain, and celebrates if the village falls; bored twice as fast; kept while its raid is on
 */
export abstract class Raider extends PatrollingMonster {
  private currentRaid: RaidLink | null = null;
  /** (a loaded raider's raid, found again the first time it's asked for, once the raids are there) */
  private raidId = -1;
  wave = 0;
  canJoinRaid = false;
  ticksOutsideRaid = 0;
  /** vanilla IS_CELEBRATING */
  celebrating = false;

  protected override registerGoals(): void {
    super.registerGoals();
    this.goalSelector.addGoal(1, new ObtainRaidLeaderBannerGoal(this));
    this.goalSelector.addGoal(5, new RaiderCelebration(this));
    raiderGoalHooks.add?.(this);
  }

  /** vanilla applyRaidBuffs: what a raider of wave `wave` is given (pillagers and vindicators their weapons) */
  abstract applyRaidBuffs(wave: number, unused: boolean): void;
  /** vanilla getCelebrateSound */
  abstract celebrateSound(): string;

  /** vanilla getCurrentRaid */
  get raid(): RaidLink | null {
    if (this.raidId >= 0) this.rejoinSavedRaid();
    return this.currentRaid;
  }
  /** vanilla setCurrentRaid */
  set raid(r: RaidLink | null) {
    this.currentRaid = r;
    this.raidId = -1;
  }

  /** vanilla readAdditionalSaveData: back in its wave (its health counted already), and its wave's captain again if it was */
  private rejoinSavedRaid(): void {
    const raid = raidHooks.byId(this.level, this.raidId);
    this.raidId = -1;
    if (!raid) return;
    this.currentRaid = raid;
    raid.addWaveMob(this.wave, this, false);
    if (this.patrolLeader) raid.setLeader(this.wave, this);
  }

  hasRaid(): boolean {
    return this.raid !== null;
  }
  hasActiveRaid(): boolean {
    return this.raid !== null && this.raid.isActive();
  }

  /** vanilla isCaptain: a patrol leader with the ominous banner on its head */
  isCaptain(): boolean {
    return this.patrolLeader && isOminousBanner(this.armorItems[3]);
  }

  /**
   * vanilla Raider.aiStep: one that can join a raid finds one in the village it's in (every second); in a raid, one
   * with a player or a golem to fight isn't bored
   */
  override aiStep(): void {
    if (this.isAlive) {
      const raid = this.raid;
      if (this.canJoinRaid) {
        if (!raid) {
          if (this.level.gameTime % 20 === 0) {
            const r = raidHooks.raidAt(this.level, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
            if (r) raidHooks.tryJoin(this.level, this, r);
          }
        } else {
          const t = this.target;
          if (t && (t.type === 'player' || t.type === 'iron_golem')) this.noActionTime = 0;
        }
      }
    }
    // (vanilla Raider.updateNoActionTime: += 2, over Monster's own)
    this.noActionTime += 2;
    super.aiStep();
    if (this.lightMagic() > 0.5) this.noActionTime -= 2;
  }

  /** vanilla canJoinPatrol: not while in an active raid */
  override canJoinPatrol(): boolean {
    return !this.hasActiveRaid();
  }

  /**
   * vanilla Raider.die: its raid loses it (and its wave its captain), and a player who killed it is a hero of the
   * village if the raid's won
   */
  override die(source: string, attacker: Entity | null = null): void {
    if (!this.dead) {
      const raid = this.raid;
      if (raid) {
        if (this.patrolLeader) raid.removeLeader(this.wave);
        if (attacker?.type === 'player') raid.addHeroOfTheVillage(attacker);
        raid.removeFromRaid(this, false);
      }
      // (vanilla player_killed_entity, Voluntary Exile: any raider wearing the ominous banner, a player's kill)
      const p = attacker?.type === 'player' ? attacker : this.lastHurtByPlayer?.type === 'player' ? this.lastHurtByPlayer : null;
      if (p && isOminousBanner(this.armorItems[3])) this.level.onPlayerTrigger?.(p as Player, 'killed_raid_captain');
    }
    super.die(source, attacker);
  }

  /**
   * vanilla 1.21: a captain killed by a player (the causing entity: a player's arrow counts, their wolf doesn't)
   * outside a raid drops an ominous bottle of level 1 to 5 (set_ominous_bottle_amplifier 0-4)
   */
  protected override dropLoot(byPlayer: boolean, looting = 0): void {
    super.dropLoot(byPlayer, looting);
    if (this.isCaptain() && !this.raid && this.killer?.type === 'player') {
      const s = ItemStack.of('ominous_bottle');
      s.tag = { ...(s.tag ?? {}), ominousAmplifier: this.random.nextInt(5) };
      this.spawnAtLocation(s);
    }
  }

  /** vanilla removeWhenFarAway: never in a raid */
  override removeWhenFarAway(d2: number): boolean {
    return this.raid === null ? super.removeWhenFarAway(d2) : false;
  }

  /** vanilla requiresCustomPersistence: kept while in a raid */
  override requiresCustomPersistence(): boolean {
    return super.requiresCustomPersistence() || this.raid !== null;
  }

  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.hasActiveRaid()) this.raid!.updateBossbar();
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla Raider.finalizeSpawn: a witch spawned naturally never joins a raid; the rest can */
  override finalizeSpawn(reason: RaiderSpawnReason, group?: SpawnGroup): void {
    this.canJoinRaid = this.type !== 'witch' || reason !== 'natural';
    super.finalizeSpawn(reason, group);
  }

  /**
   * vanilla Raider.pickUpItem: in an active raid whose wave has no captain, the ominous banner goes on its head (what
   * was there may drop) and it's the captain; anything else as any mob picks things up
   */
  protected override pickUpItem(it: ItemEntity): void {
    const s = it.stack;
    const raid = this.raid;
    const hasLeader = this.hasActiveRaid() && raid!.leader(this.wave) !== null;
    if (this.hasActiveRaid() && !hasLeader && isOminousBanner(s)) {
      const cur = this.armorItems[3];
      const d0 = this.equipmentDropChance('head');
      if (cur && Math.max(this.random.nextFloat() - 0.1, 0) < d0) this.spawnAtLocation(cur);
      this.onItemPickup(it);
      this.setItemSlot('head', s.copy());
      this.take(it, s.count);
      it.remove();
      raid!.setLeader(this.wave, this);
      this.patrolLeader = true;
    } else super.pickUpItem(it);
  }

  /** (ObtainRaidLeaderBannerGoal's pick-up: vanilla calls pickUpItem from outside) */
  pickUp(it: ItemEntity): void {
    this.pickUpItem(it);
  }

  /**
   * vanilla Mob.getAttackBoundingBox: a rider reaches from its mount's box as well as its own (a vindicator on a
   * ravager)
   */
  override attackBoundingBox(): AABB {
    const v = this.vehicle;
    if (!v) return super.attackBoundingBox();
    const a = v.bb, b = this.bb;
    const r = Math.sqrt(2.04) - 0.6;
    return new AABB(Math.min(b.minX, a.minX), b.minY, Math.min(b.minZ, a.minZ), Math.max(b.maxX, a.maxX), b.maxY, Math.max(b.maxZ, a.maxZ)).inflate(r, 0, r);
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData(), Wave: this.wave, CanJoinRaid: this.canJoinRaid };
    if (this.raid) d.RaidId = this.raid.id;
    return d;
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.wave = Number(d.Wave ?? 0);
    this.canJoinRaid = d.CanJoinRaid === true;
    if (typeof d.RaidId === 'number') this.raidId = d.RaidId;
  }
}

/** extra raider goals added by the raid module (vanilla PathfindToRaidGoal, RaiderMoveThroughVillageGoal) */
export const raiderGoalHooks: { add: ((r: Raider) => void) | null } = { add: null };

/**
 * vanilla Raider.ObtainRaidLeaderBannerGoal: in a raid whose wave has lost its captain, a raider that could lead goes
 * for an ominous banner lying within 16 and picks it up
 */
class ObtainRaidLeaderBannerGoal extends Goal {
  constructor(readonly mob: Raider) {
    super();
    this.flags = Flag.MOVE;
  }
  private banners(r: number, v: number): ItemEntity[] {
    const m = this.mob;
    return m.level.getEntities(m.bb.inflate(r, v, r), (e) => e instanceof ItemEntity && !e.removed && e.pickupDelay <= 0 && isOminousBanner(e.stack)) as ItemEntity[];
  }
  canUse(): boolean {
    const m = this.mob, raid = m.raid;
    if (m.hasActiveRaid() && !raid!.isOver() && m.canBeLeader() && !isOminousBanner(m.armorItems[3])) {
      const leader = raid!.leader(m.wave);
      if (!leader || !leader.isAlive) {
        const list = this.banners(16, 8);
        if (list.length) return m.navigation.moveToEntity(list[0], 1.15);
      }
    }
    return false;
  }
  override tick(): void {
    const m = this.mob, t = m.navigation.targetPos;
    if (t && (t[0] + 0.5 - m.x) ** 2 + (t[1] + 0.5 - m.y) ** 2 + (t[2] + 0.5 - m.z) ** 2 < 1.414 * 1.414) {
      const list = this.banners(4, 4);
      if (list.length) m.pickUp(list[0]);
    }
  }
}

/** vanilla Raider.RaiderCelebration: the village lost, raiders with nothing to fight cheer and jump about */
class RaiderCelebration extends Goal {
  constructor(readonly mob: Raider) {
    super();
  }
  canUse(): boolean {
    const m = this.mob;
    return m.isAlive && m.target === null && m.raid !== null && m.raid.isLoss();
  }
  override start(): void {
    this.mob.celebrating = true;
  }
  override stop(): void {
    this.mob.celebrating = false;
  }
  override tick(): void {
    const m = this.mob;
    if (m.random.nextInt(this.adjustedTickDelay(100)) === 0) m.playSound(m.celebrateSound(), m.soundVolume(), m.voicePitch());
    if (!m.vehicle && m.random.nextInt(this.adjustedTickDelay(50)) === 0) m.jumpControl.jump();
  }
}

/**
 * vanilla Raider.HoldGroundAttackGoal: a patrolling illager outside a raid that's spotted a target (not one that hurt
 * it) holds its ground and rallies the raiders within 8, muttering, until the target comes within `hostileRadius`;
 * then they all attack
 */
export class HoldGroundAttackGoal extends Goal {
  private readonly hostileRadiusSqr: number;
  constructor(readonly mob: AbstractIllager, hostileRadius: number) {
    super();
    this.hostileRadiusSqr = hostileRadius * hostileRadius;
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const m = this.mob, by = m.lastHurtByMob;
    return m.raid === null && m.patrolling && m.target !== null && !m.aggressive && (by === null || by.type !== 'player');
  }
  private nearby(): Raider[] {
    const m = this.mob;
    return m.level.getEntities(m.bb.inflate(8, 8, 8), (e) => e instanceof Raider && e !== m && e.isAlive) as Raider[];
  }
  override start(): void {
    this.mob.navigation.stop();
    for (const r of this.nearby()) r.setTarget(this.mob.target);
  }
  override stop(): void {
    const t = this.mob.target;
    if (t) {
      for (const r of this.nearby()) {
        r.setTarget(t);
        r.aggressive = true;
      }
      this.mob.aggressive = true;
    }
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override tick(): void {
    const m = this.mob, t = m.target;
    if (!t) return;
    if (m.distanceToSqr(t.x, t.y, t.z) > this.hostileRadiusSqr) {
      m.lookControl.setLookAtEntity(t, 30, 30);
      if (m.random.nextInt(50) === 0) m.playAmbientSound();
    } else m.aggressive = true;
  }
}

// ---------------------------------------------------------------------------
// illagers

/** vanilla AbstractIllager.IllagerArmPose */
export type IllagerArmPose = 'crossed' | 'attacking' | 'spellcasting' | 'bow_and_arrow' | 'crossbow_hold' | 'crossbow_charge' | 'celebrating' | 'neutral';

/** vanilla AbstractIllager: arms crossed unless it's doing something; it won't hurt a baby villager */
export abstract class AbstractIllager extends Raider {
  armPose(): IllagerArmPose {
    return 'crossed';
  }

  /** vanilla AbstractIllager.canAttack: not a baby villager */
  override canAttack(e: LivingEntity | null): boolean {
    if (e && e.type === 'villager' && (e as Mob).isBaby()) return false;
    return super.canAttack(e);
  }
}

/** vanilla #illager_friends (#illager): the ones an illager counts as allies (vanilla considersEntityAsAlly) */
export function isIllagerAlly(a: Entity, b: Entity): boolean {
  return ILLAGER_TYPES.has(a.type) && ILLAGER_TYPES.has(b.type);
}

/** vanilla DoorBlock.setOpen, as a mob does it (the other half follows by its shape update) */
function setDoorOpen(m: Mob, x: number, y: number, z: number, open: boolean): void {
  const st = m.level.world.getState(x, y, z), b = BLOCKS[STATE_BLOCK[st]];
  if (!b.name.endsWith('_door') || b.get(st, 'open') === open) return;
  m.level.setBlock(x, y, z, b.with(st, 'open', open), 10);
  const wood = /^(crimson|warped)_/.test(b.name) ? 'nether_wood' : b.name.startsWith('cherry_') ? 'cherry_wood' : b.name.startsWith('bamboo_') ? 'bamboo_wood' : 'wooden';
  m.level.sound.play(`block.${wood}_door.${open ? 'open' : 'close'}`, x + 0.5, y + 0.5, z + 0.5, 1, m.random.nextFloat() * 0.1 + 0.9);
  m.level.gameEvent?.(open ? 'block_open' : 'block_close', x + 0.5, y + 0.5, z + 0.5, { entity: m });
}

/**
 * vanilla OpenDoorGoal: a mob that paths through doors opens one it bumps into, and (if `closeDoor`) shuts it again
 * a second later once through
 */
export class OpenDoorGoal extends DoorInteractGoal {
  private forgetTime = 0;
  constructor(mob: Mob, readonly closeDoor: boolean) {
    super(mob);
  }
  override canContinueToUse(): boolean {
    return this.closeDoor && this.forgetTime > 0 && super.canContinueToUse();
  }
  override start(): void {
    super.start();
    this.forgetTime = 20;
    setDoorOpen(this.mob, this.doorPos[0], this.doorPos[1], this.doorPos[2], true);
  }
  override stop(): void {
    if (this.closeDoor) setDoorOpen(this.mob, this.doorPos[0], this.doorPos[1], this.doorPos[2], false);
  }
  override tick(): void {
    this.forgetTime--;
    super.tick();
  }
}

/** vanilla AbstractIllager.RaiderOpenDoorGoal: doors are opened only in a raid */
export class RaiderOpenDoorGoal extends OpenDoorGoal {
  constructor(readonly raider: Raider) {
    super(raider, false);
  }
  override canUse(): boolean {
    return super.canUse() && this.raider.hasActiveRaid();
  }
}

/**
 * vanilla LookAtPlayerGoal(mob, Mob.class, distance): now and then it watches the nearest mob in range and in sight
 * (instead of the player)
 */
export class LookAtMobGoal extends LookAtPlayerGoal {
  protected override findLookAt(): LivingEntity | null {
    const m = this.mob, d = this.lookDistance;
    let best: LivingEntity | null = null, bd = Infinity;
    for (const e of m.level.getEntities(m.bb.inflate(d, 3, d), (e) => e instanceof Mob && e !== m && e.isAlive)) {
      const le = e as Mob;
      const d2 = le.distanceToSqr(m.x, m.y + m.eyeHeight, m.z);
      if (d2 > d * d || d2 >= bd || !m.sensing.hasLineOfSight(le)) continue;
      bd = d2;
      best = le;
    }
    return best;
  }
}

/**
 * vanilla HurtByTargetGoal(this, Raider.class): turns on whoever hurt it, unless that was a fellow raider; with
 * setAlertOthers, the raiders of its kind about join in
 */
export class RaiderHurtByTargetGoal extends TargetGoal {
  private timestamp = 0;
  constructor(mob: Mob, readonly alertOthers = false) {
    super(mob, true);
  }
  canUse(): boolean {
    const m = this.mob, t = m.lastHurtByMob;
    if (m.lastHurtByMobTimestamp === this.timestamp || !t || !m.canAttack(t)) return false;
    return !(t instanceof Raider);
  }
  override start(): void {
    const m = this.mob;
    m.setTarget(m.lastHurtByMob);
    this.targetMob = m.target;
    this.timestamp = m.lastHurtByMobTimestamp;
    this.unseenMemoryTicks = 300;
    if (this.alertOthers) {
      const d = m.followRange, by = m.lastHurtByMob!;
      const kind = m.constructor as abstract new (...a: never[]) => Mob;
      const box = new AABB(m.x - d, m.y - 10, m.z - d, m.x + 1 + d, m.y + 11, m.z + 1 + d);
      for (const e of m.level.getEntities(box, (e) => e instanceof kind)) {
        const o = e as Mob;
        if (o !== m && o.target === null) o.setTarget(by);
      }
    }
    super.start();
  }
}

/** the raiders' way of spotting prey: an illager's ordinary targets (players, villagers, iron golems) */
export function isVillagerTarget(e: LivingEntity): boolean {
  return e.type === 'villager' || e.type === 'wandering_trader';
}

/** (for the vex and the fangs) the time in ticks before `reducedTickDelay` halves it */
export { reducedTickDelay };
