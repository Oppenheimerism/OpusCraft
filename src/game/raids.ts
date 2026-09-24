// Raids (vanilla Raid, Raids, Raider.PathfindToRaidGoal and RaiderMoveThroughVillageGoal, BadOmenMobEffect,
// RaidOmenMobEffect, OminousBottleItem, and the bell's resonance in BellBlockEntity).
//
// Drink an ominous bottle and you have Bad Omen (I to V) for 100 minutes. Walk into a village with it (not in
// peaceful) and it turns to Raid Omen, which 30 seconds later starts a raid on the village — or adds to the one
// that's on — raising its omen level by the bottle's level (at most 5). A red bar, "Raid", fills for 15 seconds, a
// horn sounds from where they come, and a wave of raiders arrives 64 blocks off (closer if there's nowhere to stand
// out there), one of them its captain under the ominous banner. When the last of a wave is dead, the bar fills
// again for the next: three waves on easy, five on normal, seven on hard, and a bonus wave at an omen level above 1.
// Survive them all and whoever killed a raider is the Hero of the Village (a level for each omen level past the
// first: villagers' discounts and gifts, game/raidVillagers.ts); lose the village — no bed, workstation or bell
// anyone still claims — and the raiders celebrate. A raid gives up after 40 minutes, in peaceful, or with the
// disableRaids rule. Ringing a bell with raiders about makes it resonate, and two seconds later every raider within
// 48 blocks glows for three seconds.
//
// The raids are the level's (vanilla keeps them per dimension, in raids.dat): here each remembers its dimension and
// only those of the dimension being played tick; they're saved with the world (game.ts, WorldMeta.raids).

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { Raider, raidHooks, raiderGoalHooks, RAIDER_TYPES, type RaidLink } from '../entity/raider';
import { Pillager, Vindicator } from '../entity/illagers';
import { Evoker } from '../entity/evoker';
import { Ravager } from '../entity/ravager';
import { Witch } from '../entity/witch';
import { MOB_EFFECTS, MobEffectInstance } from '../entity/effects';
import { Goal, Flag } from '../entity/ai/goal';
import { defaultRandomPosTowards } from '../entity/ai/goals';
import { isValidEmptySpawnBlock } from '../entity/mob';
import { validSpawnBlock } from '../entity/monsters';
import { ominousBanner } from './banners';
import type { Difficulty } from './difficulty';
import { registerItemBehavior } from './itemBehavior';
import { Rand } from '../core/rng';
import { ITEMS, ItemStack } from '../item/item';
import { addPotionTooltip } from '../item/potions';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';
import { BellBlockEntity, bellHooks } from '../world/blockEntity';
import { MAX_Y } from '../world/constants';
import type { DimensionId } from '../world/dimension';
import './raidVillagers';

type Pos = [number, number, number];
type RaidStatus = 'ongoing' | 'victory' | 'loss' | 'stopped';

/** vanilla event.minecraft.raid */
const RAID_NAME = 'Raid';
/** vanilla RAID_TIMEOUT_TICKS: 40 minutes */
const RAID_TIMEOUT_TICKS = 48000;
/** vanilla DEFAULT_PRE_RAID_TICKS: the bar fills for 15 seconds before each wave */
const PRE_RAID_TICKS = 300;
/** vanilla POST_RAID_TICK_LIMIT: two seconds after the last raider falls, it's won */
const POST_RAID_TICK_LIMIT = 40;
/** vanilla MAX_NO_ACTION_TIME */
const MAX_NO_ACTION_TIME = 2400;
/** vanilla MAX_CELEBRATION_TICKS: the bar says how it went for 30 seconds */
const MAX_CELEBRATION_TICKS = 600;
/** vanilla OUTSIDE_RAID_BOUNDS_TIMEOUT: checks (a second apart) a bored raider may spend out of the village */
const OUTSIDE_RAID_BOUNDS_TIMEOUT = 30;
/** vanilla DEFAULT_MAX_RAID_OMEN_LEVEL */
export const MAX_RAID_OMEN_LEVEL = 5;
/** vanilla HERO_OF_THE_VILLAGE_DURATION: 40 minutes */
const HERO_OF_THE_VILLAGE_DURATION = 48000;
/** vanilla VALID_RAID_RADIUS_SQR: a raid is the one "at" a place within 96 blocks of its middle */
const VALID_RAID_RADIUS_SQR = 9216;
/** vanilla RAID_REMOVAL_THRESHOLD_SQR: a raider 112 blocks off has left it */
const RAID_REMOVAL_THRESHOLD_SQR = 12544;
/** vanilla OminousBottleItem.EFFECT_DURATION: 100 minutes of Bad Omen */
export const OMINOUS_BOTTLE_DURATION = 120000;
/** vanilla OminousBottleItem.DRINK_DURATION */
const DRINK_TICKS = 32;
/** vanilla BadOmenMobEffect: Raid Omen for 30 seconds */
const RAID_OMEN_TICKS = 600;

/** vanilla Raid.RaiderType: who comes in each wave (by the wave's number, 1-7; the bonus wave is the last one again) */
const RAIDER_WAVES: { type: string; make: (l: Level) => Raider; spawns: readonly number[] }[] = [
  { type: 'vindicator', make: (l) => new Vindicator(l), spawns: [0, 0, 2, 0, 1, 4, 2, 5] },
  { type: 'evoker', make: (l) => new Evoker(l), spawns: [0, 0, 0, 0, 0, 1, 1, 2] },
  { type: 'pillager', make: (l) => new Pillager(l), spawns: [0, 4, 3, 3, 4, 4, 4, 2] },
  { type: 'witch', make: (l) => new Witch(l), spawns: [0, 0, 0, 0, 3, 0, 0, 1] },
  { type: 'ravager', make: (l) => new Ravager(l), spawns: [0, 0, 0, 1, 0, 1, 0, 2] },
];

/** vanilla DimensionType.hasRaids */
const HAS_RAIDS: Record<DimensionId, boolean> = { overworld: true, the_nether: false, the_end: true };

/** vanilla Raid.getNumGroups: the waves of a raid on each difficulty */
export function numGroupsFor(d: Difficulty): number {
  return d === 'easy' ? 3 : d === 'normal' ? 5 : d === 'hard' ? 7 : 0;
}

const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);
const blockPosOf = (e: Entity): Pos => [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];

/** vanilla Heightmap WORLD_SURFACE: above the highest block that isn't air (plants and snow count) */
function worldSurface(level: Level, x: number, z: number): number {
  const w = level.world;
  let y = w.heightAt(x, z);
  while (y < MAX_Y && !(FLAGS[w.getState(x, y, z)] & F_AIR)) y++;
  return y;
}

/** vanilla Level.hasChunksAt: every chunk under the area is loaded */
function hasChunksAt(level: Level, x0: number, z0: number, x1: number, z1: number): boolean {
  for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) for (let cz = z0 >> 4; cz <= z1 >> 4; cz++) if (!level.world.getChunk(cx, cz)) return false;
  return true;
}

/** vanilla SpawnPlacementTypes.ON_GROUND.isSpawnPositionOk for a ravager: a floor to stand on, room at the feet and the head */
function groundSpawnOk(level: Level, x: number, y: number, z: number): boolean {
  const w = level.world;
  return validSpawnBlock(level, x, y - 1, z) && isValidEmptySpawnBlock(w.getState(x, y, z)) && isValidEmptySpawnBlock(w.getState(x, y + 1, z));
}

/** a raid's boss bar (vanilla ServerBossEvent "Raid", RED, NOTCHED_10) */
export interface RaidBar {
  name: string;
  readonly color: 'red';
  readonly overlay: 'notched_10';
  progress: number;
  visible: boolean;
  readonly playBossMusic: boolean;
  readonly createWorldFog: boolean;
}

/** a raid as saved (vanilla Raid.save) */
export interface RaidData {
  id: number;
  dim: DimensionId;
  started: boolean;
  active: boolean;
  ticksActive: number;
  omen: number;
  groupsSpawned: number;
  preRaidTicks: number;
  postRaidTicks: number;
  totalHealth: number;
  center: Pos;
  numGroups: number;
  status: RaidStatus;
  heroes: string[];
}

/** the level's raids as saved (vanilla Raids.save, and each player's raid_omen_position) */
export interface RaidsData {
  nextId: number;
  tick: number;
  raids: RaidData[];
  omenPositions?: Record<string, Pos>;
}

/** vanilla Raid */
export class Raid implements RaidLink {
  private readonly groupToLeader = new Map<number, Raider>();
  private readonly groupRaiders = new Map<number, Set<Raider>>();
  /** vanilla heroesOfTheVillage: whoever killed one of its raiders */
  private readonly heroes = new Set<string>();
  ticksActive = 0;
  private centerPos: Pos;
  private started = false;
  /** vanilla totalHealth: the wave's health when it came (the bar is what's left of it) */
  totalHealth = 0;
  raidOmenLevel = 0;
  private active = true;
  private groups = 0;
  /** vanilla raidEvent */
  readonly bar: RaidBar = { name: RAID_NAME, color: 'red', overlay: 'notched_10', progress: 0, visible: true, playBossMusic: false, createWorldFog: false };
  /** vanilla raidEvent.getPlayers(): the player sees the bar (updated each second) */
  hasPlayer = false;
  private postRaidTicks = 0;
  raidCooldownTicks = PRE_RAID_TICKS;
  private readonly random = new Rand();
  /** vanilla numGroups: the waves it will have, fixed by the difficulty when it began */
  readonly waveCount: number;
  status: RaidStatus = 'ongoing';
  private celebrationTicks = 0;
  private waveSpawnPos: Pos | null = null;

  constructor(readonly id: number, readonly level: Level, center: Pos, readonly dim: DimensionId, waveCount = numGroupsFor(level.difficulty)) {
    this.centerPos = [center[0], center[1], center[2]];
    this.waveCount = waveCount;
  }

  static load(level: Level, d: RaidData): Raid {
    const r = new Raid(d.id, level, d.center, d.dim, d.numGroups);
    r.started = d.started;
    r.active = d.active;
    r.ticksActive = d.ticksActive;
    r.raidOmenLevel = d.omen;
    r.groups = d.groupsSpawned;
    r.raidCooldownTicks = d.preRaidTicks;
    r.postRaidTicks = d.postRaidTicks;
    r.totalHealth = d.totalHealth;
    r.status = d.status;
    for (const h of d.heroes) r.heroes.add(h);
    return r;
  }

  save(): RaidData {
    return {
      id: this.id, dim: this.dim, started: this.started, active: this.active, ticksActive: this.ticksActive, omen: this.raidOmenLevel,
      groupsSpawned: this.groups, preRaidTicks: this.raidCooldownTicks, postRaidTicks: this.postRaidTicks, totalHealth: this.totalHealth,
      center: [...this.centerPos], numGroups: this.waveCount, status: this.status, heroes: [...this.heroes],
    };
  }

  isOver(): boolean {
    return this.isVictory() || this.isLoss();
  }
  /** vanilla isBetweenWaves: a wave's been and gone, and the bar is filling for the next */
  isBetweenWaves(): boolean {
    return this.hasFirstWaveSpawned() && this.totalRaidersAlive() === 0 && this.raidCooldownTicks > 0;
  }
  hasFirstWaveSpawned(): boolean {
    return this.groups > 0;
  }
  isStopped(): boolean {
    return this.status === 'stopped';
  }
  isVictory(): boolean {
    return this.status === 'victory';
  }
  isLoss(): boolean {
    return this.status === 'loss';
  }
  isStarted(): boolean {
    return this.started;
  }
  isActive(): boolean {
    return this.active;
  }
  groupsSpawned(): number {
    return this.groups;
  }
  center(): Pos {
    return this.centerPos;
  }
  numGroups(d: Difficulty): number {
    return numGroupsFor(d);
  }

  /** vanilla getAllRaiders */
  allRaiders(): Raider[] {
    const out: Raider[] = [];
    for (const s of this.groupRaiders.values()) out.push(...s);
    return out;
  }

  /** vanilla updatePlayers: the bar is shown to a living player whose raid (the nearest within 96) this is */
  private updatePlayers(): void {
    const p = this.level.player;
    if (!p || !p.isAlive || this.level.world.dim.id !== this.dim) {
      this.hasPlayer = false;
      return;
    }
    const [x, y, z] = blockPosOf(p);
    this.hasPlayer = this.level.raids.raidAt(x, y, z) === this;
  }

  /** vanilla absorbRaidOmen: the player's Raid Omen raises the omen level by its level (to at most 5) */
  absorbRaidOmen(p: Player): boolean {
    const e = p.getEffect('raid_omen');
    if (!e) return false;
    this.raidOmenLevel = Math.max(0, Math.min(MAX_RAID_OMEN_LEVEL, this.raidOmenLevel + e.amplifier + 1));
    // (vanilla: stat raid_trigger and the raid_omen trigger, which no advancement listens for)
    return true;
  }

  /** vanilla stop */
  stop(): void {
    this.active = false;
    this.hasPlayer = false;
    this.status = 'stopped';
  }

  private isVillage(p: Pos): boolean {
    return this.level.poi.isVillage(p[0], p[1], p[2]);
  }

  /** vanilla Raid.tick */
  tick(): void {
    if (this.isStopped()) return;
    const level = this.level;
    if (this.status === 'ongoing') {
      const was = this.active;
      this.active = level.world.isLoaded(this.centerPos[0], this.centerPos[2]);
      if (level.difficulty === 'peaceful') {
        this.stop();
        return;
      }
      if (was !== this.active) this.bar.visible = this.active;
      if (!this.active) return;
      if (!this.isVillage(this.centerPos)) this.moveRaidCenterToNearbyVillageSection();
      if (!this.isVillage(this.centerPos)) {
        if (this.groups > 0) this.status = 'loss';
        else this.stop();
      }
      this.ticksActive++;
      if (this.ticksActive >= RAID_TIMEOUT_TICKS) {
        this.stop();
        return;
      }
      const alive = this.totalRaidersAlive();
      if (alive === 0 && this.hasMoreWaves()) {
        if (this.raidCooldownTicks > 0) {
          const known = this.waveSpawnPos !== null;
          let look = !known && this.raidCooldownTicks % 5 === 0;
          if (known && !level.isEntityTicking(this.waveSpawnPos![0], this.waveSpawnPos![2])) look = true;
          // (vanilla: 1 under 100 ticks to go, 2 under 40 — which the first test always catches first)
          if (look) this.waveSpawnPos = this.getValidSpawnPos(this.raidCooldownTicks < 100 ? 1 : 0);
          if (this.raidCooldownTicks === PRE_RAID_TICKS || this.raidCooldownTicks % 20 === 0) this.updatePlayers();
          this.raidCooldownTicks--;
          this.bar.progress = clamp01((PRE_RAID_TICKS - this.raidCooldownTicks) / PRE_RAID_TICKS);
        } else if (this.raidCooldownTicks === 0 && this.groups > 0) {
          this.raidCooldownTicks = PRE_RAID_TICKS;
          this.bar.name = RAID_NAME;
          return;
        }
      }
      if (this.ticksActive % 20 === 0) {
        this.updatePlayers();
        this.updateRaiders();
        // vanilla event.minecraft.raid.raiders_remaining: counted out once there are two left
        this.bar.name = alive > 0 && alive <= 2 ? `${RAID_NAME} - Raiders Remaining: ${alive}` : RAID_NAME;
      }
      let horn = false;
      let tries = 0;
      while (this.shouldSpawnGroup()) {
        const pos = this.waveSpawnPos ?? this.findRandomSpawnPos(tries, 20);
        if (pos) {
          this.started = true;
          this.spawnGroup(pos);
          if (!horn) {
            this.playSound(pos);
            horn = true;
          }
        } else tries++;
        if (tries > 3) {
          this.stop();
          break;
        }
      }
      if (this.isStarted() && !this.hasMoreWaves() && alive === 0) {
        if (this.postRaidTicks < POST_RAID_TICK_LIMIT) this.postRaidTicks++;
        else {
          this.status = 'victory';
          for (const uuid of this.heroes) {
            const e = level.entities.find((o) => !o.removed && o.hasUuid && o.uuid === uuid);
            if (!(e instanceof LivingEntity) || (e.type === 'player' && (e as Player).gameMode === 'spectator')) continue;
            e.addEffect(new MobEffectInstance(MOB_EFFECTS.hero_of_the_village, HERO_OF_THE_VILLAGE_DURATION, this.raidOmenLevel - 1, false, false, true));
            // (vanilla stat raid_win and the hero_of_the_village trigger)
            if (e.type === 'player') level.onPlayerTrigger?.(e as Player, 'raid_won');
          }
        }
      }
    } else if (this.isOver()) {
      this.celebrationTicks++;
      if (this.celebrationTicks >= MAX_CELEBRATION_TICKS) {
        this.stop();
        return;
      }
      if (this.celebrationTicks % 20 === 0) {
        this.updatePlayers();
        this.bar.visible = true;
        if (this.isVictory()) {
          this.bar.progress = 0;
          this.bar.name = `${RAID_NAME} - Victory`;
        } else this.bar.name = `${RAID_NAME} - Defeat`;
      }
    }
  }

  /** vanilla moveRaidCenterToNearbyVillageSection: the middle of the nearest village section within two */
  private moveRaidCenterToNearbyVillageSection(): void {
    const [cx, cy, cz] = this.centerPos;
    const sx = cx >> 4, sy = cy >> 4, sz = cz >> 4;
    let best: Pos | null = null, bd = Infinity;
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const p: Pos = [((sx + dx) << 4) + 8, ((sy + dy) << 4) + 8, ((sz + dz) << 4) + 8];
          if (!this.isVillage(p)) continue;
          const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2 + (p[2] - cz) ** 2;
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
    if (best) this.centerPos = best;
  }

  /** vanilla getValidSpawnPos: three tries at a spot for the next wave */
  private getValidSpawnPos(i: number): Pos | null {
    for (let j = 0; j < 3; j++) {
      const p = this.findRandomSpawnPos(i, 1);
      if (p) return p;
    }
    return null;
  }

  private hasMoreWaves(): boolean {
    return this.hasBonusWave() ? !this.hasSpawnedBonusWave() : !this.isFinalWave();
  }
  private isFinalWave(): boolean {
    return this.groups === this.waveCount;
  }
  /** vanilla hasBonusWave: an omen level above 1 brings one more wave */
  private hasBonusWave(): boolean {
    return this.raidOmenLevel > 1;
  }
  private hasSpawnedBonusWave(): boolean {
    return this.groups > this.waveCount;
  }
  private shouldSpawnBonusGroup(): boolean {
    return this.isFinalWave() && this.totalRaidersAlive() === 0 && this.hasBonusWave();
  }

  /**
   * vanilla updateRaiders (each second): a raider gone (or 112 blocks off) has left the raid; one that has been
   * about a while and is bored outside the village is counted out after 30 such checks
   */
  private updateRaiders(): void {
    const gone: Raider[] = [];
    const [cx, cy, cz] = this.centerPos;
    for (const set of this.groupRaiders.values())
      for (const r of set) {
        const [x, y, z] = blockPosOf(r);
        if (r.removed || this.level.world.dim.id !== this.dim || (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2 >= RAID_REMOVAL_THRESHOLD_SQR) {
          gone.push(r);
          continue;
        }
        if (r.tickCount <= 600) continue;
        if (!this.level.entities.includes(r)) gone.push(r);
        if (!this.level.poi.isVillage(x, y, z) && r.noActionTime > MAX_NO_ACTION_TIME) r.ticksOutsideRaid++;
        if (r.ticksOutsideRaid >= OUTSIDE_RAID_BOUNDS_TIMEOUT) gone.push(r);
      }
    for (const r of gone) this.removeFromRaid(r, true);
  }

  /**
   * vanilla playSound: the horn, for a player within 64 blocks of where the wave comes from (or one the bar is shown
   * to), sounded 13 blocks from them that way and carrying a thousand blocks
   */
  private playSound(pos: Pos): void {
    const p = this.level.player;
    if (!p || this.level.world.dim.id !== this.dim) return;
    const sx = pos[0] + 0.5, sz = pos[2] + 0.5;
    const d = Math.sqrt((sx - p.x) ** 2 + (sz - p.z) ** 2);
    if (!(d <= 64) && !this.hasPlayer) return;
    const k = d > 0 ? 13 / d : 0;
    this.level.sound.play('event.raid.horn', p.x + k * (sx - p.x), p.y, p.z + k * (sz - p.z), 64, 1);
  }

  /**
   * vanilla spawnGroup: the next wave at `pos` — each kind as many as the wave's table says and a few more by the
   * difficulty; the first that can lead is the captain; a ravager in wave 5 carries a pillager, from wave 7 on an
   * evoker (the first) or a vindicator
   */
  private spawnGroup(pos: Pos): void {
    let leader = false;
    const wave = this.groups + 1;
    this.totalHealth = 0;
    const d = this.level.difficulty;
    const bonus = this.shouldSpawnBonusGroup();
    for (const t of RAIDER_WAVES) {
      const n = this.defaultNumSpawns(t.spawns, wave, bonus) + this.potentialBonusSpawns(t.type, wave, d, bonus);
      let mounted = 0;
      for (let l = 0; l < n; l++) {
        const r = t.make(this.level);
        if (!leader && r.canBeLeader()) {
          r.patrolLeader = true;
          this.setLeader(wave, r);
          leader = true;
        }
        this.joinRaid(wave, r, pos, false);
        if (t.type !== 'ravager') continue;
        let rider: Raider | null = null;
        if (wave === numGroupsFor('normal')) rider = new Pillager(this.level);
        else if (wave >= numGroupsFor('hard')) rider = mounted === 0 ? new Evoker(this.level) : new Vindicator(this.level);
        mounted++;
        if (!rider) continue;
        this.joinRaid(wave, rider, pos, false);
        rider.moveTo(pos[0] + 0.5, pos[1], pos[2] + 0.5, 0, 0);
        rider.startRiding(r);
      }
    }
    this.waveSpawnPos = null;
    this.groups++;
    this.updateBossbar();
  }

  /**
   * vanilla joinRaid: one of wave `wave`; a new one (not `loaded`) is put a block above `pos`, readied for the
   * raid (its weapon, maybe enchanted) and added to the world
   */
  joinRaid(wave: number, r: Raider, pos: Pos | null, loaded: boolean): void {
    if (!this.addWaveMob(wave, r, true)) return;
    r.raid = this;
    r.wave = wave;
    r.canJoinRaid = true;
    r.ticksOutsideRaid = 0;
    if (loaded || !pos) return;
    r.moveTo(pos[0] + 0.5, pos[1] + 1, pos[2] + 0.5, r.yaw, r.pitch);
    r.finalizeSpawn('event');
    r.applyRaidBuffs(wave, false);
    r.onGround = true;
    this.level.addEntity(r);
  }

  /** vanilla updateBossbar: what's left of the wave's health */
  updateBossbar(): void {
    this.bar.progress = this.totalHealth > 0 ? clamp01(this.healthOfLivingRaiders() / this.totalHealth) : 0;
  }

  /** vanilla getHealthOfLivingRaiders */
  healthOfLivingRaiders(): number {
    let f = 0;
    for (const s of this.groupRaiders.values()) for (const r of s) f += r.health;
    return f;
  }

  private shouldSpawnGroup(): boolean {
    return this.raidCooldownTicks === 0 && (this.groups < this.waveCount || this.shouldSpawnBonusGroup()) && this.totalRaidersAlive() === 0;
  }

  /** vanilla getTotalRaidersAlive: those still in the raid */
  totalRaidersAlive(): number {
    let n = 0;
    for (const s of this.groupRaiders.values()) n += s.size;
    return n;
  }

  /** vanilla removeFromRaid: dead (its health already gone from the bar) or wandered off (its health taken off the total) */
  removeFromRaid(r: Raider, wanderedOff: boolean): void {
    const set = this.groupRaiders.get(r.wave);
    if (!set || !set.delete(r)) return;
    if (wanderedOff) this.totalHealth -= r.health;
    r.raid = null;
    this.updateBossbar();
  }

  /**
   * vanilla findRandomSpawnPos: `tries` spots round the middle on the surface — 64 blocks off at first (i 0), then
   * 32 (1), then anywhere near (2), then 32 the other way — outside the village for the first two, where a ravager
   * could stand (or on a snow layer), and all loaded and ticking for ten blocks round
   */
  private findRandomSpawnPos(i: number, tries: number): Pos | null {
    const k = i === 0 ? 2 : 2 - i;
    const level = this.level, r = level.random, w = level.world;
    for (let l = 0; l < tries; l++) {
      const f = r.nextFloat() * Math.PI * 2;
      const x = this.centerPos[0] + Math.floor(Math.cos(f) * 32 * k) + r.nextInt(5);
      const z = this.centerPos[2] + Math.floor(Math.sin(f) * 32 * k) + r.nextInt(5);
      const y = worldSurface(level, x, z);
      if (level.poi.isVillage(x, y, z) && i < 2) continue;
      if (!hasChunksAt(level, x - 10, z - 10, x + 10, z + 10) || !level.isEntityTicking(x, z)) continue;
      const onSnow = BLOCKS[STATE_BLOCK[w.getState(x, y - 1, z)]].name === 'snow' && FLAGS[w.getState(x, y, z)] & F_AIR;
      if (!groundSpawnOk(level, x, y, z) && !onSnow) continue;
      return [x, y, z];
    }
    return null;
  }

  /** vanilla addWaveMob (a raider loaded again takes the place of its old self) */
  addWaveMob(wave: number, r: Raider, countHealth = true): boolean {
    let set = this.groupRaiders.get(wave);
    if (!set) this.groupRaiders.set(wave, (set = new Set()));
    // (the uuid made now is saved with it, so it's known again when it's loaded)
    const id = r.uuid;
    for (const o of set)
      if (o !== r && o.hasUuid && o.uuid === id) {
        set.delete(o);
        break;
      }
    set.add(r);
    if (countHealth) this.totalHealth += r.health;
    this.updateBossbar();
    return true;
  }

  /** vanilla setLeader: the wave's captain, the ominous banner on its head (a sure drop) */
  setLeader(wave: number, r: Raider): void {
    this.groupToLeader.set(wave, r);
    r.setItemSlot('head', ominousBanner());
    r.setDropChance('head', 2);
  }
  leader(wave: number): Raider | null {
    return this.groupToLeader.get(wave) ?? null;
  }
  removeLeader(wave: number): void {
    this.groupToLeader.delete(wave);
  }

  private defaultNumSpawns(spawns: readonly number[], wave: number, bonus: boolean): number {
    return bonus ? spawns[this.waveCount] : spawns[wave];
  }

  /**
   * vanilla getPotentialBonusSpawns: a few more of a kind by the difficulty — witches from wave 3 (not 4) off easy;
   * pillagers and vindicators up to 1 on easy (half the time), 1 on normal, 2 on hard; a ravager in the bonus wave
   * off easy
   */
  private potentialBonusSpawns(type: string, wave: number, d: Difficulty, bonus: boolean): number {
    const easy = d === 'easy', normal = d === 'normal';
    let j: number;
    switch (type) {
      case 'witch':
        if (easy || wave <= 2 || wave === 4) return 0;
        j = 1;
        break;
      case 'pillager':
      case 'vindicator':
        j = easy ? this.random.nextInt(2) : normal ? 1 : 2;
        break;
      case 'ravager':
        j = !easy && bonus ? 1 : 0;
        break;
      default:
        return 0;
    }
    return j > 0 ? this.random.nextInt(j + 1) : 0;
  }

  /** vanilla getEnchantOdds, by the omen level */
  enchantOdds(): number {
    const i = this.raidOmenLevel;
    return i === 2 ? 0.1 : i === 3 ? 0.25 : i === 4 ? 0.5 : i === 5 ? 0.75 : 0;
  }

  addHeroOfTheVillage(e: Entity): void {
    this.heroes.add(e.uuid);
  }
}

/** vanilla Raids: the level's raids */
export class Raids {
  private readonly raidMap = new Map<number, Raid>();
  private nextAvailableId = 1;
  private tickCount = 0;
  /** vanilla ServerPlayer.raidOmenPosition: where a player's Bad Omen turned to Raid Omen, by the player's uuid */
  private readonly omenPositions = new Map<string, Pos>();

  constructor(private readonly level: Level) {}

  /** vanilla Raids.get */
  get(id: number): Raid | null {
    return this.raidMap.get(id) ?? null;
  }

  /** the raids of the dimension being played */
  list(): Raid[] {
    const dim = this.level.world.dim.id;
    return [...this.raidMap.values()].filter((r) => r.dim === dim);
  }

  /** vanilla Raids.tick: the raids of the dimension being played (the others' villages aren't loaded) */
  tick(): void {
    this.tickCount++;
    const dim = this.level.world.dim.id;
    for (const [id, raid] of this.raidMap) {
      if (raid.dim !== dim) continue;
      if (this.level.gameRules.disableRaids) raid.stop();
      if (raid.isStopped()) {
        this.raidMap.delete(id);
        continue;
      }
      raid.tick();
    }
  }

  /** vanilla Raids.canJoinRaid: alive, able to, not bored stiff, and in the raid's dimension */
  canJoinRaid(r: Raider, raid: Raid): boolean {
    return r.isAlive && r.canJoinRaid && r.noActionTime <= MAX_NO_ACTION_TIME && this.level.world.dim.id === raid.dim;
  }

  /**
   * vanilla createOrExtendRaid: a player's Raid Omen ran out at `pos` — the raid on the village there (its middle
   * the average of the claimed village points within 64), a new one if there's none within 96, takes in the omen
   */
  createOrExtendRaid(p: Player, pos: Pos): Raid | null {
    if (p.gameMode === 'spectator' || this.level.gameRules.disableRaids) return null;
    const dim = this.level.world.dim.id;
    if (!HAS_RAIDS[dim]) return null;
    const poi = this.level.poi;
    const pois = poi.findAll(pos[0], pos[1], pos[2], 64, () => true, false).filter((q) => poi.isOccupied(q[0], q[1], q[2]));
    let center: Pos = pos;
    if (pois.length) {
      let sx = 0, sy = 0, sz = 0;
      for (const q of pois) {
        sx += q[0];
        sy += q[1];
        sz += q[2];
      }
      center = [Math.floor(sx / pois.length), Math.floor(sy / pois.length), Math.floor(sz / pois.length)];
    }
    const raid = this.raidAt(center[0], center[1], center[2]) ?? new Raid(this.nextAvailableId++, this.level, center, dim);
    if (!raid.isStarted() && !this.raidMap.has(raid.id)) this.raidMap.set(raid.id, raid);
    if (!raid.isStarted() || raid.raidOmenLevel < MAX_RAID_OMEN_LEVEL) raid.absorbRaidOmen(p);
    return raid;
  }

  /** vanilla getNearbyRaid: the nearest active raid whose middle is closer than √r2 */
  nearbyRaid(x: number, y: number, z: number, r2: number): Raid | null {
    let best: Raid | null = null, bd = r2;
    const dim = this.level.world.dim.id;
    for (const raid of this.raidMap.values()) {
      if (raid.dim !== dim) continue;
      const [cx, cy, cz] = raid.center();
      const d = (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2;
      if (!raid.isActive() || !(d < bd)) continue;
      best = raid;
      bd = d;
    }
    return best;
  }

  /** vanilla ServerLevel.getRaidAt: the raid of the village here (within 96 blocks of its middle) */
  raidAt(x: number, y: number, z: number): Raid | null {
    return this.nearbyRaid(x, y, z, VALID_RAID_RADIUS_SQR);
  }

  setOmenPosition(p: Player, pos: Pos): void {
    this.omenPositions.set(p.uuid, pos);
  }
  omenPosition(p: Player): Pos | null {
    return this.omenPositions.get(p.uuid) ?? null;
  }
  clearOmenPosition(p: Player): void {
    this.omenPositions.delete(p.uuid);
  }

  /** the raid bars the player sees */
  shownBars(): RaidBar[] {
    const out: RaidBar[] = [];
    for (const r of this.list()) if (r.hasPlayer && r.bar.visible) out.push(r.bar);
    return out;
  }

  save(): RaidsData {
    const omenPositions: Record<string, Pos> = {};
    for (const [k, v] of this.omenPositions) omenPositions[k] = v;
    return { nextId: this.nextAvailableId, tick: this.tickCount, raids: [...this.raidMap.values()].map((r) => r.save()), omenPositions };
  }

  load(d: RaidsData | undefined | null): void {
    this.raidMap.clear();
    this.omenPositions.clear();
    if (!d) return;
    this.nextAvailableId = d.nextId ?? 1;
    this.tickCount = d.tick ?? 0;
    for (const rd of d.raids ?? []) this.raidMap.set(rd.id, Raid.load(this.level, rd));
    for (const [k, v] of Object.entries(d.omenPositions ?? {})) this.omenPositions.set(k, v);
  }
}

/**
 * for tests and debugging (vanilla's /raid start, a development command): a raid on the village at `pos` as if a
 * Raid Omen of `omenLevel` had just run out there
 */
export function startRaid(level: Level, p: Player, pos: Pos, omenLevel = 1): Raid | null {
  p.addEffect(new MobEffectInstance(MOB_EFFECTS.raid_omen, 1, Math.max(0, omenLevel - 1)));
  const raid = level.raids.createOrExtendRaid(p, pos);
  p.removeEffect('raid_omen');
  return raid;
}

// ---------------------------------------------------------------------------
// the raider's side (vanilla Raider.aiStep's joining, Raider.PathfindToRaidGoal, RaiderMoveThroughVillageGoal)

raidHooks.raidAt = (level, x, y, z) => level.raids.raidAt(x, y, z);
raidHooks.isRaided = (level, x, y, z) => level.raids.raidAt(x, y, z) !== null;
raidHooks.byId = (level, id) => {
  const r = level.raids.get(id);
  return r && r.dim === level.world.dim.id ? r : null;
};
raidHooks.tryJoin = (level, r, link) => {
  const raid = link as Raid;
  if (level.raids.canJoinRaid(r, raid)) raid.joinRaid(raid.groupsSpawned(), r, null, true);
};

/**
 * vanilla Raider.PathfindToRaidGoal: a raider of an active raid that's outside the village heads for its middle,
 * fifteen blocks at a time, bringing along the raiders within 16 that aren't in a raid yet
 */
class PathfindToRaidGoal extends Goal {
  private recruitmentTick = 0;
  constructor(readonly mob: Raider) {
    super();
    this.flags = Flag.MOVE;
  }
  private outside(): boolean {
    const [x, y, z] = blockPosOf(this.mob);
    return !this.mob.level.poi.isVillage(x, y, z);
  }
  canUse(): boolean {
    const m = this.mob;
    return m.target === null && !m.controllingPassenger() && m.hasActiveRaid() && !m.raid!.isOver() && this.outside();
  }
  override canContinueToUse(): boolean {
    const m = this.mob;
    return m.hasActiveRaid() && !m.raid!.isOver() && this.outside();
  }
  override tick(): void {
    const m = this.mob;
    if (!m.hasActiveRaid()) return;
    const raid = m.raid as Raid;
    if (m.tickCount > this.recruitmentTick) {
      this.recruitmentTick = m.tickCount + 20;
      this.recruitNearby(raid);
    }
    if (m.navigation.isDone()) {
      const [cx, , cz] = raid.center();
      const p = defaultRandomPosTowards(m, 15, 4, cx + 0.5, cz + 0.5, Math.PI / 2);
      if (p) m.navigation.moveTo(p[0], p[1], p[2], 1);
    }
  }
  private recruitNearby(raid: Raid): void {
    if (!raid.isActive()) return;
    const m = this.mob, raids = m.level.raids;
    for (const e of m.level.getEntities(m.bb.inflate(16, 16, 16), (e) => e instanceof Raider && !e.hasActiveRaid() && raids.canJoinRaid(e, raid))) raid.joinRaid(raid.groupsSpawned(), e as Raider, null, true);
  }
}

/**
 * vanilla Raider.RaiderMoveThroughVillageGoal: in the village, from house to house — a random bed within 48 it
 * hasn't been to lately (it remembers the last three), a random step its way when the path runs out
 */
class RaiderMoveThroughVillageGoal extends Goal {
  private poiPos: Pos | null = null;
  private readonly visited: Pos[] = [];
  private stuck = false;
  constructor(readonly raider: Raider, readonly speedModifier: number, readonly distanceToPoi: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    this.updateVisited();
    return this.isValidRaid() && this.hasSuitablePoi() && this.raider.target === null;
  }
  private isValidRaid(): boolean {
    const r = this.raider;
    return r.hasActiveRaid() && !r.raid!.isOver();
  }
  private hasSuitablePoi(): boolean {
    const r = this.raider;
    const [x, y, z] = blockPosOf(r);
    const beds = r.level.poi.findAll(x, y, z, 48, (k) => k === 'home', false).filter((p) => !this.visited.some((v) => v[0] === p[0] && v[1] === p[1] && v[2] === p[2]));
    if (!beds.length) return false;
    const p = beds[r.random.nextInt(beds.length)];
    this.poiPos = [p[0], p[1], p[2]];
    return true;
  }
  /** vanilla BlockPos.closerToCenterThan */
  private near(d: number): boolean {
    const p = this.poiPos!, r = this.raider;
    return (p[0] + 0.5 - r.x) ** 2 + (p[1] + 0.5 - r.y) ** 2 + (p[2] + 0.5 - r.z) ** 2 < d * d;
  }
  override canContinueToUse(): boolean {
    if (this.raider.navigation.isDone()) return false;
    return this.raider.target === null && !this.near(this.raider.width + this.distanceToPoi) && !this.stuck;
  }
  override stop(): void {
    if (this.poiPos && this.near(this.distanceToPoi)) this.visited.push(this.poiPos);
  }
  override start(): void {
    const r = this.raider, p = this.poiPos!;
    r.noActionTime = 0;
    r.navigation.moveTo(p[0], p[1], p[2], this.speedModifier);
    this.stuck = false;
  }
  override tick(): void {
    const r = this.raider;
    if (!r.navigation.isDone()) return;
    const p = this.poiPos!;
    const q = defaultRandomPosTowards(r, 16, 7, p[0] + 0.5, p[2] + 0.5, Math.PI / 10) ?? defaultRandomPosTowards(r, 8, 7, p[0] + 0.5, p[2] + 0.5, Math.PI / 2);
    if (!q) {
      this.stuck = true;
      return;
    }
    r.navigation.moveTo(q[0], q[1], q[2], this.speedModifier);
  }
  private updateVisited(): void {
    if (this.visited.length > 2) this.visited.shift();
  }
}

raiderGoalHooks.add = (r) => {
  r.goalSelector.addGoal(3, new PathfindToRaidGoal(r));
  r.goalSelector.addGoal(4, new RaiderMoveThroughVillageGoal(r, 1.05, 1));
};

// ---------------------------------------------------------------------------
// the omens (vanilla BadOmenMobEffect, RaidOmenMobEffect) and the ominous bottle (vanilla OminousBottleItem)

/** vanilla MobEffect.withSoundOnAdded: the omens' sound as they come on (not when they're only renewed) */
function omenSound(e: LivingEntity, name: string): void {
  e.level.sound.play(name, e.x, e.y, e.z, 1, 1);
}

// vanilla BadOmenMobEffect: every tick, a player (not a spectator) in a village not in peaceful — whose raid, if
// there's one, isn't at the top omen level — takes Raid Omen of the same level for 30 seconds in its place
MOB_EFFECTS.bad_omen.shouldTick = () => true;
MOB_EFFECTS.bad_omen.applyTick = (e, amp) => {
  if (e.type !== 'player' || (e as Player).gameMode === 'spectator') return true;
  const p = e as Player, level = p.level;
  const [x, y, z] = blockPosOf(p);
  if (level.difficulty === 'peaceful' || !level.poi.isVillage(x, y, z)) return true;
  const raid = level.raids.raidAt(x, y, z);
  if (raid && raid.raidOmenLevel >= MAX_RAID_OMEN_LEVEL) return true;
  const fresh = !p.hasEffect('raid_omen');
  p.addEffect(new MobEffectInstance(MOB_EFFECTS.raid_omen, RAID_OMEN_TICKS, amp));
  if (fresh) omenSound(p, 'event.mob_effect.raid_omen');
  level.raids.setOmenPosition(p, [x, y, z]);
  return false;
};

// vanilla RaidOmenMobEffect: on its last tick, the raid it foretold begins where it came on
MOB_EFFECTS.raid_omen.shouldTick = (duration) => duration === 1;
MOB_EFFECTS.raid_omen.applyTick = (e) => {
  if (e.type !== 'player' || (e as Player).gameMode === 'spectator') return true;
  const p = e as Player, raids = p.level.raids;
  const pos = raids.omenPosition(p);
  if (!pos) return true;
  raids.createOrExtendRaid(p, pos);
  raids.clearOmenPosition(p);
  return false;
};

/** the Bad Omen an ominous bottle gives (vanilla OMINOUS_BOTTLE_AMPLIFIER, 0 when it has none) */
function bottleOmen(s: ItemStack): MobEffectInstance {
  return new MobEffectInstance(MOB_EFFECTS.bad_omen, OMINOUS_BOTTLE_DURATION, s.tag?.ominousAmplifier ?? 0, false, false, true);
}

registerItemBehavior('ominous_bottle', {
  // vanilla ItemUtils.startUsingInstantly: drunk over 1.6 seconds
  use(_level, p, stack) {
    p.startUsingItem(stack, DRINK_TICKS);
    return 'success';
  },
  useAnim: 'drink',
  // vanilla OminousBottleItem.finishUsingItem: the bottle's dark wisp, Bad Omen (no swirls, its icon shown), and the
  // bottle is gone (not in creative)
  finishUsing(level, p, stack) {
    level.sound.play('item.ominous_bottle.dispose', Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5, Math.floor(p.z) + 0.5, 1, 1);
    const fresh = !p.hasEffect('bad_omen');
    p.addEffect(bottleOmen(stack));
    if (fresh) omenSound(p, 'event.mob_effect.bad_omen');
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
  },
});

{
  const it = ITEMS.get('ominous_bottle');
  if (it) {
    // vanilla OminousBottleItem.appendHoverText: the Bad Omen it gives, as a potion shows its effects
    it.hoverText = (s, lines) => addPotionTooltip([bottleOmen(s)], lines, 1);
    // vanilla CreativeModeTabs (food and drinks): one of each level
    it.creativeStacks = () =>
      [0, 1, 2, 3, 4].map((a) => {
        const s = new ItemStack(it);
        s.tag = { ...(s.tag ?? {}), ominousAmplifier: a };
        return s;
      });
  }
}

// ---------------------------------------------------------------------------
// the bell (vanilla BellBlockEntity.tick's resonance, makeRaidersGlow and showBellParticles)

/** vanilla areRaidersNearby / isRaiderWithinRange: a living raider among those about when it rang, within `r` */
function raiderWithin(be: BellBlockEntity, e: Entity, r: number): boolean {
  if (!(e instanceof LivingEntity) || !e.isAlive || e.removed || !RAIDER_TYPES.has(e.type)) return false;
  return (be.x + 0.5 - e.x) ** 2 + (be.y + 0.5 - e.y) ** 2 + (be.z + 0.5 - e.z) ** 2 < r * r;
}

bellHooks.tick = (be, level) => {
  const near = be.nearbyEntities ?? [];
  // a quarter of a second into its swing, with a raider within 32 of it when it rang, it starts to hum
  if (be.ticks >= 5 && be.resonationTicks === 0 && near.some((e) => raiderWithin(be, e, 32))) {
    be.resonating = true;
    level.sound.play('block.bell.resonate', be.x + 0.5, be.y + 0.5, be.z + 0.5, 1, 1);
  }
  if (!be.resonating) return;
  if (be.resonationTicks < 40) {
    be.resonationTicks++;
    return;
  }
  be.resonating = false;
  // vanilla makeRaidersGlow: those within 48 glow for three seconds
  const raiders = near.filter((e) => raiderWithin(be, e, 48)) as LivingEntity[];
  for (const e of raiders) e.addEffect(new MobEffectInstance(MOB_EFFECTS.glowing, 60));
  // vanilla showBellParticles: a trail of sparks a block out from the bell towards each of them, fewer the more are about
  const all = near.filter((e) => (be.x + 0.5 - e.x) ** 2 + (be.y + 0.5 - e.y) ** 2 + (be.z + 0.5 - e.z) ** 2 < 48 * 48).length;
  const n = Math.max(3, Math.min(15, Math.trunc((all - 21) / -2)));
  let color = 16700985;
  for (const e of raiders) {
    const d = Math.sqrt((e.x - be.x) ** 2 + (e.z - be.z) ** 2) || 1;
    const px = be.x + 0.5 + (e.x - be.x) / d, pz = be.z + 0.5 + (e.z - be.z) / d;
    for (let k = 0; k < n; k++) {
      color += 5;
      level.particles.entityEffect?.(px, be.y + 0.5, pz, color & 0xffffff, 255);
    }
  }
};
