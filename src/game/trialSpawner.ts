// The trial spawner (1.21; vanilla TrialSpawner, TrialSpawnerData, TrialSpawnerState, TrialSpawnerConfig and
// TrialSpawnerBlockEntity). Idle until it has a mob to spawn and players may be fought (not peaceful, doMobSpawning),
// it waits for survival players within 14 blocks it can see; once one comes it spawns its mobs a few at a time near
// itself (more of them, and more at once, for each extra player it has seen), and when it has spawned all of them and
// all are dead it throws a reward out of its top for each player who took part, then cools down for 30 minutes.
//
// A player with Bad Omen (turned into Trial Omen, 15 minutes a level) or Trial Omen turns it ominous: its mobs are
// swapped for its ominous config's (more of them, the zombies and skeletons armed), its flames go blue, it drops
// potions, arrows and charges on the players from ominous item spawners (entity/ominousItemSpawner.ts), and its reward
// is the ominous one. It stays ominous until its cooldown is over.
//
// The configs are vanilla 1.21's, named as 1.21.2 names them (trial_spawner/trial_chamber/<mob>/normal and ominous);
// a spawner placed by hand has the default config for both. Level events 3011-3021 are the functions below.

import type { Level } from './level';
import type { Rand } from '../core/rng';
import { hash3, hashString, Rand as SeededRand } from '../core/rng';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { BLOCKS, STATE_BLOCK, COLLISION } from '../world/block';
import { TRIAL_SPAWNER_STATES, type TrialSpawnerStateName } from '../world/blocksTrialChambers';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { Mob } from '../entity/mob';
import { Player } from '../entity/player';
import { Zombie, Slime } from '../entity/monsters';
import { MOB_EFFECTS, MobEffectInstance } from '../entity/effects';
import { OminousItemSpawner, OMINOUS_FLAME, spawnParticles } from '../entity/ominousItemSpawner';
import { ItemStack } from '../item/item';
import { equipableSlot } from '../item/equipment';
import type { EquipSlot } from '../item/enchantHelper';
import { createMob } from './spawner';
import { spawnRulesOk } from './baseSpawner';
import { rollLoot } from './loot';
import { spawnItem } from './redstone/dispenseItems';
import { registerBehavior } from './blockBehavior';
import { UP } from '../world/dir';
import { clipVisual } from './trialChamberSight';
import './trialChamberLoot';
import { parseSnbt, snbtObject } from './snbt';

// ---------------------------------------------------------------------------
// configs (vanilla TrialSpawnerConfig and TrialSpawnerConfigs)

/** vanilla SpawnData: the mob, as the trial chambers' spawners give it, and the loot table it's armed from */
export interface SpawnData {
  /** the entity id and the few values vanilla's spawn data sets on it (IsBaby, a slime's Size as its size itself) */
  entity: { id: string; baby?: boolean; size?: number };
  /** vanilla SpawnData.equipment (EquipmentTable): its loot table, with every slot's drop chance 0 */
  equipment?: string;
}

export interface TrialSpawnerConfig {
  spawnRange: number;
  totalMobs: number;
  simultaneousMobs: number;
  totalMobsAddedPerPlayer: number;
  simultaneousMobsAddedPerPlayer: number;
  ticksBetweenSpawn: number;
  /** weighted */
  spawnPotentials: [SpawnData, number][];
  /** weighted: which table the rewards are rolled from, picked once per trial */
  lootTablesToEject: [string, number][];
  itemsToDropWhenOminous: string;
}

/** vanilla TrialSpawnerConfig.DEFAULT */
export const DEFAULT_CONFIG: TrialSpawnerConfig = {
  spawnRange: 4, totalMobs: 6, simultaneousMobs: 2, totalMobsAddedPerPlayer: 2, simultaneousMobsAddedPerPlayer: 1, ticksBetweenSpawn: 40,
  spawnPotentials: [], lootTablesToEject: [['spawners/trial_chamber/consumables', 1], ['spawners/trial_chamber/key', 1]],
  itemsToDropWhenOminous: 'spawners/trial_chamber/items_to_drop_when_ominous',
};
/** vanilla TrialSpawnerConfig.ticksBetweenItemSpawners: an ominous spawner sets one over someone every 8 seconds */
const TICKS_BETWEEN_ITEM_SPAWNERS = 160;

/** vanilla TrialSpawnerConfigs: the ominous ones' rewards */
const OMINOUS_EJECT: [string, number][] = [['spawners/ominous/trial_chamber/key', 3], ['spawners/ominous/trial_chamber/consumables', 7]];
const MELEE = 'equipment/trial_chamber_melee', RANGED = 'equipment/trial_chamber_ranged';

const config = (o: Partial<TrialSpawnerConfig>): TrialSpawnerConfig => ({ ...DEFAULT_CONFIG, ...o });
/** vanilla trialChamberBase */
const base = (o: Partial<TrialSpawnerConfig>) => config({ simultaneousMobs: 3, simultaneousMobsAddedPerPlayer: 0.5, ticksBetweenSpawn: 20, ...o });
/** vanilla trialChamberMeleeOminous */
const meleeOminous = (o: Partial<TrialSpawnerConfig>) => config({ totalMobs: 12, simultaneousMobs: 4, simultaneousMobsAddedPerPlayer: 0.5, ticksBetweenSpawn: 20, ...o });
/** vanilla trialChamberSlowRanged */
const slowRanged = (o: Partial<TrialSpawnerConfig>) => config({ simultaneousMobs: 4, simultaneousMobsAddedPerPlayer: 2, ticksBetweenSpawn: 160, ...o });
const one = (id: string, equipment?: string): [SpawnData, number][] => [[{ entity: { id }, equipment }, 1]];

/** the trial spawner configs by name (vanilla's trial_spawner registry: `<name>/normal` and `<name>/ominous`) */
export const TRIAL_SPAWNER_CONFIGS: Record<string, TrialSpawnerConfig> = {};
function register(name: string, normal: TrialSpawnerConfig, ominous: TrialSpawnerConfig): void {
  TRIAL_SPAWNER_CONFIGS[`${name}/normal`] = normal;
  TRIAL_SPAWNER_CONFIGS[`${name}/ominous`] = { ...ominous, lootTablesToEject: OMINOUS_EJECT };
}
register(
  'trial_chamber/breeze',
  config({ simultaneousMobs: 1, simultaneousMobsAddedPerPlayer: 0.5, ticksBetweenSpawn: 20, totalMobs: 2, totalMobsAddedPerPlayer: 1, spawnPotentials: one('breeze') }),
  config({ simultaneousMobsAddedPerPlayer: 0.5, ticksBetweenSpawn: 20, totalMobs: 4, totalMobsAddedPerPlayer: 1, spawnPotentials: one('breeze') }),
);
register('trial_chamber/melee/husk', base({ spawnPotentials: one('husk') }), base({ spawnPotentials: one('husk', MELEE) }));
register('trial_chamber/melee/spider', base({ spawnPotentials: one('spider') }), meleeOminous({ spawnPotentials: one('spider') }));
register('trial_chamber/melee/zombie', base({ spawnPotentials: one('zombie') }), base({ spawnPotentials: one('zombie', MELEE) }));
for (const [name, mob] of [['poison_skeleton', 'bogged'], ['skeleton', 'skeleton'], ['stray', 'stray']]) {
  register(`trial_chamber/ranged/${name}`, base({ spawnPotentials: one(mob) }), base({ spawnPotentials: one(mob, RANGED) }));
  register(`trial_chamber/slow_ranged/${name}`, slowRanged({ spawnPotentials: one(mob) }), slowRanged({ spawnPotentials: one(mob, RANGED) }));
}
register(
  'trial_chamber/small_melee/baby_zombie',
  config({ simultaneousMobsAddedPerPlayer: 0.5, ticksBetweenSpawn: 20, spawnPotentials: [[{ entity: { id: 'zombie', baby: true } }, 1]] }),
  config({ simultaneousMobsAddedPerPlayer: 0.5, ticksBetweenSpawn: 20, spawnPotentials: [[{ entity: { id: 'zombie', baby: true }, equipment: MELEE }, 1]] }),
);
register('trial_chamber/small_melee/cave_spider', base({ spawnPotentials: one('cave_spider') }), meleeOminous({ spawnPotentials: one('cave_spider') }));
register('trial_chamber/small_melee/silverfish', base({ spawnPotentials: one('silverfish') }), meleeOminous({ spawnPotentials: one('silverfish') }));
// (vanilla's Size 1 and 2: slimes of size 2 and 3)
const SLIMES: [SpawnData, number][] = [[{ entity: { id: 'slime', size: 2 } }, 3], [{ entity: { id: 'slime', size: 3 } }, 1]];
register('trial_chamber/small_melee/slime', base({ spawnPotentials: SLIMES }), meleeOminous({ spawnPotentials: SLIMES }));

/** vanilla TrialSpawnerConfig.calculateTargetTotalMobs */
export function targetTotalMobs(c: TrialSpawnerConfig, additionalPlayers: number): number {
  return Math.floor(c.totalMobs + c.totalMobsAddedPerPlayer * additionalPlayers);
}
/** vanilla TrialSpawnerConfig.calculateTargetSimultaneousMobs */
export function targetSimultaneousMobs(c: TrialSpawnerConfig, additionalPlayers: number): number {
  return Math.floor(c.simultaneousMobs + c.simultaneousMobsAddedPerPlayer * additionalPlayers);
}

/** vanilla SimpleWeightedRandomList.getRandom */
function pickWeighted<T>(list: readonly [T, number][], r: Rand): T | null {
  const total = list.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return null;
  let k = r.nextInt(total);
  for (const [v, w] of list) if ((k -= w) < 0) return v;
  return null;
}

// ---------------------------------------------------------------------------
// the states (vanilla TrialSpawnerState)

/** vanilla TrialSpawnerState.spinningMobSpeed (negative: no mob spinning inside) */
const SPIN_SPEED: Record<TrialSpawnerStateName, number> = { inactive: -1, waiting_for_players: 200, active: 1000, waiting_for_reward_ejection: -1, ejecting_reward: -1, cooldown: -1 };
/** vanilla TrialSpawnerState.isCapableOfSpawning */
const CAN_SPAWN: Record<TrialSpawnerStateName, boolean> = { inactive: false, waiting_for_players: true, active: true, waiting_for_reward_ejection: false, ejecting_reward: false, cooldown: false };

export const TARGET_COOLDOWN_LENGTH = 36000;
export const REQUIRED_PLAYER_RANGE = 14;
/** vanilla MAX_MOB_TRACKING_DISTANCE: a mob further than this is no longer counted */
const MAX_MOB_TRACKING_DISTANCE = 47;
/** vanilla DETECT_PLAYER_SPAWN_BUFFER */
const DETECT_PLAYER_SPAWN_BUFFER = 40;
/** vanilla DELAY_BEFORE_EJECT_AFTER_KILLING_LAST_MOB and TIME_BETWEEN_EACH_EJECTION */
const DELAY_BEFORE_EJECT = 40;
const TIME_BETWEEN_EACH_EJECTION = 30;

// ---------------------------------------------------------------------------
// seeing the players (vanilla PlayerDetector)

/** vanilla BlockPos.closerThan: block positions closer than `d` */
export function blockCloserThan(e: Entity, x: number, y: number, z: number, d: number): boolean {
  return (Math.floor(e.x) - x) ** 2 + (Math.floor(e.y) - y) ** 2 + (Math.floor(e.z) - z) ** 2 < d * d;
}

/**
 * vanilla PlayerDetector.inLineOfSight: a VISUAL clip from `from` to the middle of the block at (x, y, z) reaches it
 * (it hits nothing, or that block); glass, iron bars and copper grates don't block it
 */
export function inLineOfSight(level: Level, x: number, y: number, z: number, fx: number, fy: number, fz: number): boolean {
  const hit = clipVisual(level.world, fx, fy, fz, x + 0.5, y + 0.5, z + 0.5);
  return !hit || (hit.x === x && hit.y === y && hit.z === z);
}

/**
 * vanilla PlayerDetector.NO_CREATIVE_PLAYERS: players whose block is closer than `range` to the spawner's, not in
 * creative or spectator, and (`sight`) whose eyes see its middle
 */
function detectPlayers(level: Level, x: number, y: number, z: number, range: number, sight: boolean): Player[] {
  return level.players().filter(
    (p) => blockCloserThan(p, x, y, z, range) && p.gameMode !== 'creative' && p.gameMode !== 'spectator' && (!sight || inLineOfSight(level, x, y, z, p.x, p.y + p.eyeHeight, p.z)),
  );
}

/** vanilla ServerLevel.getEntity(uuid) */
function entityByUuid(level: Level, uuid: string, cache: Map<string, Entity>): Entity | null {
  const c = cache.get(uuid);
  if (c && !c.removed && c.level === level) return c;
  for (const e of level.entities)
    if (!e.removed && e.hasUuid && e.uuid === uuid) {
      cache.set(uuid, e);
      return e;
    }
  cache.delete(uuid);
  return null;
}

const isAlive = (e: Entity): boolean => !e.removed && (!(e instanceof LivingEntity) || e.isAlive);

// ---------------------------------------------------------------------------
// level events (vanilla LevelRenderer.levelEvent 3011-3020 and TrialSpawner's particle helpers)

const pitchJitter = (): number => (Math.random() - Math.random()) * 0.2 + 1;

/** level event 3012: a mob came out (the spawn sound, and a puff round it) */
function mobSpawnedEvent(level: Level, bx: number, by: number, bz: number, flame: number): void {
  level.sound.play('block.trial_spawner.spawn_mob', bx + 0.5, by + 0.5, bz + 0.5, 1, pitchJitter());
  spawnParticles(level, bx, by, bz, flame);
}

/** vanilla TrialSpawner.addDetectPlayerParticles: 30 and 5 more per player (up to 10) rising round the block */
function detectPlayerParticles(level: Level, bx: number, by: number, bz: number, n: number, kind: string): void {
  const r = Math.random;
  for (let i = 0; i < 30 + Math.min(n, 10) * 5; i++) {
    const dx = (2 * r() - 1) * 0.65, dz = (2 * r() - 1) * 0.65;
    level.particles.spawn?.(kind, bx + 0.5 + dx, by + 0.1 + r() * 0.8, bz + 0.5 + dz, 0, 0, 0);
  }
}

/** level events 3013 and 3019: it saw (more) players */
function playerDetectedEvent(level: Level, bx: number, by: number, bz: number, n: number, ominous: boolean): void {
  level.sound.play('block.trial_spawner.detect_player', bx + 0.5, by + 0.5, bz + 0.5, 1, pitchJitter());
  detectPlayerParticles(level, bx, by, bz, n, ominous ? 'trial_spawner_detection_ominous' : 'trial_spawner_detection');
}

/** vanilla TrialSpawner.addEjectItemParticles (level event 3017 too) */
export function ejectItemParticles(level: Level, bx: number, by: number, bz: number): void {
  const r = Math.random;
  for (let i = 0; i < 20; i++) {
    const x = bx + 0.4 + r() * 0.2, y = by + 0.4 + r() * 0.2, z = bz + 0.4 + r() * 0.2;
    const gx = gauss() * 0.02, gy = gauss() * 0.02, gz = gauss() * 0.02;
    level.particles.spawn?.('small_flame', x, y, z, gx, gy, gz * 0.25);
    level.particles.spawn?.('smoke', x, y, z, gx, gy, gz);
  }
}

function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

/** level event 3014: a reward came out */
function rewardEjectedEvent(level: Level, bx: number, by: number, bz: number): void {
  level.sound.play('block.trial_spawner.eject_item', bx + 0.5, by + 0.5, bz + 0.5, 1, pitchJitter());
  ejectItemParticles(level, bx, by, bz);
}

/**
 * level event 3020: it turned ominous (`data` 0 at the player whose omen did it, quieter; 1 at the spawner), with the
 * ominous detection sparks and TrialSpawner.addBecomeOminousParticles: 20 trial omen and blue flames drifting out
 */
function becameOminousEvent(level: Level, bx: number, by: number, bz: number, data: number): void {
  level.sound.play('block.trial_spawner.ominous_activate', bx + 0.5, by + 0.5, bz + 0.5, data === 0 ? 0.3 : 1, pitchJitter());
  detectPlayerParticles(level, bx, by, bz, 0, 'trial_spawner_detection_ominous');
  const r = Math.random;
  for (let i = 0; i < 20; i++) {
    const x = bx + 0.5 + (r() - 0.5) * 2, y = by + 0.5 + (r() - 0.5) * 2, z = bz + 0.5 + (r() - 0.5) * 2;
    const gx = gauss() * 0.02, gy = gauss() * 0.02, gz = gauss() * 0.02;
    level.particles.spawn?.('trial_omen', x, y, z, gx, gy, gz);
    level.particles.spawn?.('soul_fire_flame', x, y, z, gx, gy, gz);
  }
}

/** vanilla TrialSpawner.transformBadOmenIntoTrialOmen: Trial Omen for 15 minutes a level of the Bad Omen it replaces */
export function transformBadOmenIntoTrialOmen(p: Player): void {
  const bad = p.getEffect('bad_omen');
  if (!bad) return;
  const fresh = !p.hasEffect('trial_omen');
  p.removeEffect('bad_omen');
  p.addEffect(new MobEffectInstance(MOB_EFFECTS.trial_omen, 18000 * (bad.amplifier + 1), 0));
  // (vanilla MobEffect.withSoundOnAdded)
  if (fresh) p.level.sound.play('event.mob_effect.trial_omen', p.x, p.y, p.z, 1, 1);
}

/** vanilla Mob.dropPreservedEquipment: what it picked up for itself (a sure drop) falls from it */
function dropPreservedEquipment(m: Mob): void {
  for (const slot of ['mainhand', 'offhand', 'feet', 'legs', 'chest', 'head'] as EquipSlot[]) {
    const s = m.getItemBySlot(slot);
    if (s && m.equipmentDropChance(slot) > 1) {
      m.setItemSlot(slot, null);
      m.spawnAtLocation(s);
    }
  }
}

/**
 * vanilla Mob.equip(EquipmentTable): the table's items put on where they go (armour in its slot, anything else in the
 * main hand), each slot once, never dropped
 */
export function equipFromTable(m: Mob, table: string, r: Rand): void {
  const taken: EquipSlot[] = [];
  for (const s of rollLoot(table, r, { x: m.x, y: m.y, z: m.z })) {
    if (s.count <= 0) continue;
    const armour = equipableSlot(s.item);
    const slot: EquipSlot | null = armour ? (taken.includes(armour) ? null : armour) : taken.includes('mainhand') ? null : 'mainhand';
    if (!slot) continue;
    m.setItemSlot(slot, armour ? s.split(1) : s);
    m.setDropChance(slot, 0);
    taken.push(slot);
  }
}

// ---------------------------------------------------------------------------
// the block entity (vanilla TrialSpawnerBlockEntity, with TrialSpawner and TrialSpawnerData)

export class TrialSpawnerBlockEntity extends BlockEntity {
  readonly id = 'trial_spawner';
  /** vanilla normal_config / ominous_config (null: TrialSpawnerConfig.DEFAULT) */
  normalConfig: string | null = null;
  ominousConfig: string | null = null;
  targetCooldownLength = TARGET_COOLDOWN_LENGTH;
  requiredPlayerRange = REQUIRED_PLAYER_RANGE;
  // vanilla TrialSpawnerData
  /** registered_players: everyone it has seen this trial (each once) */
  readonly detectedPlayers = new Set<string>();
  /** current_mobs */
  readonly currentMobs = new Set<string>();
  cooldownEndsAt = 0;
  nextMobSpawnsAt = 0;
  totalMobsSpawned = 0;
  /** spawn_data: the mob it spawns next (null: none picked yet) */
  nextSpawnData: SpawnData | null = null;
  /** ejecting_loot_table */
  ejectingLootTable: string | null = null;
  // (client side, not kept)
  spin = 0;
  oSpin = 0;
  /** the mob drawn spinning inside (render only, never added to the level) */
  displayEntity: Mob | null = null;
  /** vanilla TrialSpawner.isOminous: the block's `ominous`, read each tick */
  isOminous = false;
  /** vanilla TrialSpawnerData.dispensing: what an ominous spawner drops here, rolled once */
  private dispensing: [ItemStack, number][] | null = null;
  private readonly mobCache = new Map<string, Entity>();
  private dirty = false;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  /** vanilla TrialSpawner.getConfig: the ominous config while it's ominous */
  get config(): TrialSpawnerConfig {
    return this.isOminous ? this.ominousConfigDef : this.normalConfigDef;
  }
  get normalConfigDef(): TrialSpawnerConfig {
    return (this.normalConfig && TRIAL_SPAWNER_CONFIGS[this.normalConfig]) || DEFAULT_CONFIG;
  }
  get ominousConfigDef(): TrialSpawnerConfig {
    return (this.ominousConfig && TRIAL_SPAWNER_CONFIGS[this.ominousConfig]) || DEFAULT_CONFIG;
  }

  /** the block's trial_spawner_state */
  state(level: Level): TrialSpawnerStateName {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    return b.name === 'trial_spawner' ? (b.get(st, 'trial_spawner_state') as TrialSpawnerStateName) : 'inactive';
  }

  /** vanilla TrialSpawnerBlockEntity.setState: the block takes the new state */
  private setState(level: Level, s: TrialSpawnerStateName): void {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name === 'trial_spawner') level.setBlock(this.x, this.y, this.z, b.with(st, 'trial_spawner_state', s));
    this.dirty = true;
  }

  /** vanilla TrialSpawner.canSpawnInLevel */
  static canSpawnInLevel(level: Level): boolean {
    return level.difficulty !== 'peaceful' && !!level.gameRules.doMobSpawning;
  }

  /** vanilla getOrCreateNextSpawnData: the next mob, picked from the config's potentials if none is set */
  getOrCreateNextSpawnData(r: Rand): SpawnData {
    if (this.nextSpawnData) return this.nextSpawnData;
    const potentials = this.config.spawnPotentials;
    const picked = potentials.length ? pickWeighted(potentials, r) : null;
    this.nextSpawnData = picked ? { entity: { ...picked.entity }, equipment: picked.equipment } : { entity: { id: '' } };
    this.displayEntity = null;
    this.dirty = true;
    return this.nextSpawnData;
  }

  /** vanilla hasMobToSpawn */
  hasMobToSpawn(r: Rand): boolean {
    return !!this.getOrCreateNextSpawnData(r).entity.id || this.config.spawnPotentials.length > 0;
  }

  /** vanilla Spawner.setEntityId (a spawn egg used on it): the next mob is that one */
  setEntityId(id: string, r: Rand = new SeededRand()): void {
    this.getOrCreateNextSpawnData(r).entity.id = id;
    this.displayEntity = null;
    this.dirty = true;
  }

  /** vanilla getOrCreateDisplayEntity: the mob to draw inside, while spawning's allowed and the state spins one */
  getOrCreateDisplayEntity(level: Level, s: TrialSpawnerStateName): Mob | null {
    if (!TrialSpawnerBlockEntity.canSpawnInLevel(level) || SPIN_SPEED[s] < 0) return null;
    if (!this.displayEntity) {
      const d = this.getOrCreateNextSpawnData(level.random);
      const m = d.entity.id ? createMob(d.entity.id, level) : null;
      if (m) applySpawnData(m, d);
      this.displayEntity = m;
    }
    return this.displayEntity;
  }

  /** vanilla TrialSpawnerData.reset */
  reset(): void {
    this.detectedPlayers.clear();
    this.totalMobsSpawned = 0;
    this.nextMobSpawnsAt = 0;
    this.cooldownEndsAt = 0;
    this.currentMobs.clear();
    this.dirty = true;
  }

  /** vanilla countAdditionalPlayers */
  private countAdditionalPlayers(): number {
    return Math.max(0, this.detectedPlayers.size - 1);
  }

  override tick(level: Level): void {
    if (!level.isEntityTicking(this.x, this.z)) return;
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name !== 'trial_spawner') return;
    this.isOminous = b.get(st, 'ominous') === true;
    this.tickServer(level);
    this.tickClient(level);
    if (this.dirty) {
      this.dirty = false;
      const c = level.world.getChunk(this.x >> 4, this.z >> 4);
      if (c) c.modified = true;
    }
  }

  /** vanilla TrialSpawner.tickServer */
  private tickServer(level: Level): void {
    const s = this.state(level);
    let untracked = false;
    for (const u of [...this.currentMobs]) {
      const e = entityByUuid(level, u, this.mobCache);
      // vanilla shouldMobBeUntracked: gone, dead, or wandered off more than 47 blocks
      if (!e || !isAlive(e) || (Math.floor(e.x) - this.x) ** 2 + (Math.floor(e.y) - this.y) ** 2 + (Math.floor(e.z) - this.z) ** 2 > MAX_MOB_TRACKING_DISTANCE ** 2) {
        this.currentMobs.delete(u);
        untracked = true;
      }
    }
    if (untracked) {
      this.nextMobSpawnsAt = level.gameTime + this.config.ticksBetweenSpawn;
      this.dirty = true;
    }
    const next = this.tickAndGetNext(level, s);
    if (next !== s) this.setState(level, next);
  }

  /** vanilla TrialSpawnerState.tickAndGetNext */
  private tickAndGetNext(level: Level, s: TrialSpawnerStateName): TrialSpawnerStateName {
    const t = level.gameTime;
    switch (s) {
      case 'inactive':
        return this.getOrCreateDisplayEntity(level, 'waiting_for_players') === null ? s : 'waiting_for_players';
      case 'waiting_for_players':
        if (!TrialSpawnerBlockEntity.canSpawnInLevel(level)) {
          this.reset();
          return s;
        }
        if (!this.hasMobToSpawn(level.random)) return 'inactive';
        this.tryDetectPlayers(level, s);
        return this.detectedPlayers.size ? 'active' : s;
      case 'active': {
        if (!TrialSpawnerBlockEntity.canSpawnInLevel(level)) {
          this.reset();
          return 'waiting_for_players';
        }
        if (!this.hasMobToSpawn(level.random)) return 'inactive';
        const cfg = this.config;
        const extra = this.countAdditionalPlayers();
        this.tryDetectPlayers(level, s);
        if (this.isOminous) this.spawnOminousItemSpawner(level);
        if (this.totalMobsSpawned >= targetTotalMobs(cfg, extra)) {
          if (this.currentMobs.size === 0) {
            this.cooldownEndsAt = t + this.targetCooldownLength;
            this.totalMobsSpawned = 0;
            this.nextMobSpawnsAt = 0;
            this.dirty = true;
            return 'waiting_for_reward_ejection';
          }
        } else if (t >= this.nextMobSpawnsAt && this.currentMobs.size < targetSimultaneousMobs(cfg, extra)) {
          const u = this.spawnMob(level);
          if (u) {
            this.currentMobs.add(u);
            this.totalMobsSpawned++;
            this.nextMobSpawnsAt = t + cfg.ticksBetweenSpawn;
            const next = pickWeighted(cfg.spawnPotentials, level.random);
            if (next) {
              this.nextSpawnData = { entity: { ...next.entity }, equipment: next.equipment };
              this.displayEntity = null;
            }
            this.dirty = true;
          }
        }
        return s;
      }
      case 'waiting_for_reward_ejection':
        if (t >= this.cooldownEndsAt - this.targetCooldownLength + DELAY_BEFORE_EJECT) {
          level.sound.play('block.trial_spawner.open_shutter', this.x + 0.5, this.y + 0.5, this.z + 0.5, 1, 1);
          return 'ejecting_reward';
        }
        return s;
      case 'ejecting_reward': {
        if ((t - (this.cooldownEndsAt - this.targetCooldownLength)) % TIME_BETWEEN_EACH_EJECTION !== 0) return s;
        if (this.detectedPlayers.size === 0) {
          level.sound.play('block.trial_spawner.close_shutter', this.x + 0.5, this.y + 0.5, this.z + 0.5, 1, 1);
          this.ejectingLootTable = null;
          this.dirty = true;
          return 'cooldown';
        }
        this.ejectingLootTable ??= pickWeighted(this.config.lootTablesToEject, level.random);
        if (this.ejectingLootTable) this.ejectReward(level, this.ejectingLootTable);
        this.detectedPlayers.delete(this.detectedPlayers.values().next().value!);
        this.dirty = true;
        return s;
      }
      case 'cooldown':
        this.tryDetectPlayers(level, s);
        if (this.detectedPlayers.size) {
          this.totalMobsSpawned = 0;
          this.nextMobSpawnsAt = 0;
          this.dirty = true;
          return 'active';
        }
        if (t >= this.cooldownEndsAt) {
          this.removeOminous(level);
          this.reset();
          return 'waiting_for_players';
        }
        return s;
    }
  }

  /** vanilla (pos.asLong() + gameTime) % 20 == 0: the tick of each second it looks for players on, by where it is */
  private isDetectionTick(level: Level): boolean {
    if (this.detectionPhase === null) {
      // (vanilla BlockPos.asLong: x in the top 26 bits, z in the next 26, y in the low 12, as a signed long)
      const packed = ((BigInt(this.x) & 0x3ffffffn) << 38n) | ((BigInt(this.z) & 0x3ffffffn) << 12n) | (BigInt(this.y) & 0xfffn);
      this.detectionPhase = Number(BigInt.asIntN(64, packed) % 20n);
    }
    return (((this.detectionPhase + (level.gameTime % 20)) % 20) + 20) % 20 === 0;
  }
  private detectionPhase: number | null = null;

  /**
   * vanilla TrialSpawnerData.tryDetectPlayers: once a second, the players in range it can see; one with Trial Omen (or
   * else the last with Bad Omen, which turns into Trial Omen) turns it ominous; then those it can see join the trial
   * (once there's someone, anyone in range joins, sight or not), and each new one puts off its next mob two seconds
   */
  tryDetectPlayers(level: Level, s: TrialSpawnerStateName): void {
    if (!this.isDetectionTick(level)) return;
    if (s === 'cooldown' && this.isOminous) return;
    const seen = detectPlayers(level, this.x, this.y, this.z, this.requiredPlayerRange, true);
    let becameOminous = false;
    if (!this.isOminous && seen.length) {
      let omen: [Player, string] | null = null;
      for (const p of seen) {
        if (p.hasEffect('trial_omen')) {
          omen = [p, 'trial_omen'];
          break;
        }
        if (p.hasEffect('bad_omen')) omen = [p, 'bad_omen'];
      }
      if (omen) {
        const [p, effect] = omen;
        if (effect === 'bad_omen') transformBadOmenIntoTrialOmen(p);
        becameOminousEvent(level, Math.floor(p.x), Math.floor(p.y + p.eyeHeight), Math.floor(p.z), 0);
        this.applyOminous(level);
        becameOminous = true;
      }
    }
    if (s === 'cooldown' && !becameOminous) return;
    const joining = this.detectedPlayers.size === 0 ? seen : detectPlayers(level, this.x, this.y, this.z, this.requiredPlayerRange, false);
    let added = false;
    for (const p of joining)
      if (!this.detectedPlayers.has(p.uuid)) {
        this.detectedPlayers.add(p.uuid);
        added = true;
      }
    if (!added) return;
    this.nextMobSpawnsAt = Math.max(level.gameTime + DETECT_PLAYER_SPAWN_BUFFER, this.nextMobSpawnsAt);
    this.dirty = true;
    if (!becameOminous) playerDetectedEvent(level, this.x, this.y, this.z, this.detectedPlayers.size, this.isOminous);
  }

  /** vanilla TrialSpawner.applyOminous: the block turns ominous, and the trial starts over as an ominous one */
  applyOminous(level: Level): void {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name === 'trial_spawner') level.setBlock(this.x, this.y, this.z, b.with(st, 'ominous', true));
    becameOminousEvent(level, this.x, this.y, this.z, 1);
    this.isOminous = true;
    this.resetAfterBecomingOminous(level);
  }

  /** vanilla TrialSpawner.removeOminous */
  removeOminous(level: Level): void {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name === 'trial_spawner') level.setBlock(this.x, this.y, this.z, b.with(st, 'ominous', false));
    this.isOminous = false;
  }

  /**
   * vanilla TrialSpawnerData.resetAfterBecomingOminous: its mobs vanish in a puff (dropping what they'd picked up),
   * the ominous config picks the next mob, and the first item spawner comes 8 seconds on
   */
  private resetAfterBecomingOminous(level: Level): void {
    for (const u of this.currentMobs) {
      const e = entityByUuid(level, u, this.mobCache);
      if (!e) continue;
      mobSpawnedFlames(level, e);
      if (e instanceof Mob) dropPreservedEquipment(e);
      e.remove();
    }
    if (this.ominousConfigDef.spawnPotentials.length) {
      this.nextSpawnData = null;
      this.displayEntity = null;
    }
    this.totalMobsSpawned = 0;
    this.currentMobs.clear();
    this.nextMobSpawnsAt = level.gameTime + this.ominousConfigDef.ticksBetweenSpawn;
    this.cooldownEndsAt = level.gameTime + TICKS_BETWEEN_ITEM_SPAWNERS;
    this.dirty = true;
  }

  /**
   * vanilla TrialSpawner.spawnMob: somewhere within its spawn range (a block up or down) with room for the mob, that
   * can see the spawner, where its spawn rules allow; persistent, and armed if its spawn data says so
   */
  spawnMob(level: Level): string | null {
    const r = level.random;
    const d = this.getOrCreateNextSpawnData(r);
    if (!d.entity.id) return null;
    const mob = createMob(d.entity.id, level);
    if (!mob) return null;
    const range = this.config.spawnRange;
    const x = this.x + (r.nextDouble() - r.nextDouble()) * range + 0.5;
    const y = this.y + r.nextInt(3) - 1;
    const z = this.z + (r.nextDouble() - r.nextDouble()) * range + 0.5;
    // vanilla EntityType.getSpawnAABB: the kind's own size
    mob.moveTo(x, y, z, 0, 0);
    if (mob.collisionBoxes(mob.bb).length) return null;
    if (!inLineOfSight(level, this.x, this.y, this.z, x, y, z)) return null;
    if (!spawnRulesOk(level, mob, Math.floor(x), Math.floor(y), Math.floor(z))) return null;
    applySpawnData(mob, d);
    mob.moveTo(x, y, z, r.nextFloat() * 360, 0);
    mob.bodyYaw = mob.headYaw = mob.yaw;
    if (!mob.checkSpawnObstruction()) return null;
    // (vanilla: finalized only when its spawn data is nothing but the id; so baby zombies and slimes aren't)
    if (!d.entity.baby && d.entity.size === undefined) mob.finalizeSpawn('spawner');
    mob.persistenceRequired = true;
    if (d.equipment) equipFromTable(mob, d.equipment, r);
    level.addEntity(mob);
    const flame = this.isOminous ? OMINOUS_FLAME : 0;
    // level event 3011 at the spawner, 3012 at the mob
    spawnParticles(level, this.x, this.y, this.z, flame);
    mobSpawnedEvent(level, Math.floor(mob.x), Math.floor(mob.y), Math.floor(mob.z), flame);
    // (deep dark hook) vanilla gameEvent(GameEvent.ENTITY_PLACE) goes here
    this.mobCache.set(mob.uuid, mob);
    return mob.uuid;
  }

  /** vanilla TrialSpawner.ejectReward: the table's items thrown up out of its top, with level event 3014 */
  ejectReward(level: Level, table: string): void {
    const items = rollLoot(table, level.random);
    if (!items.length) return;
    for (const s of items) spawnItem(level, s, 2, UP, [this.x + 0.5, this.y + 1.2, this.z + 0.5]);
    rewardEjectedEvent(level, this.x, this.y, this.z);
  }

  /**
   * vanilla TrialSpawnerData.getDispensingItems: what an ominous spawner drops, rolled once from its table with a seed
   * of the world's and the 30 by 20 by 30 region it's in, each stack as a single item weighted by its count
   */
  getDispensingItems(level: Level): [ItemStack, number][] {
    if (this.dispensing) return this.dispensing;
    const seed = hash3(Math.floor(this.x / 30), Math.floor(this.y / 20), Math.floor(this.z / 30), hashString(level.seed));
    const items = rollLoot(this.config.itemsToDropWhenOminous, new SeededRand(seed, 0x0e1));
    this.dispensing = items.map((s) => [s.copyWithCount(1), s.count]);
    return this.dispensing;
  }

  /**
   * vanilla TrialSpawnerState.spawnOminousOminousItemSpawner: every 8 seconds, an item spawner over one of the
   * players in the trial (or, half the time, one of its mobs), with its warning sound
   */
  private spawnOminousItemSpawner(level: Level): void {
    const stack = pickWeighted(this.getDispensingItems(level), level.random);
    if (!stack || level.gameTime < this.cooldownEndsAt) return;
    const at = this.positionToSpawnItemSpawner(level);
    if (!at) return;
    const e = OminousItemSpawner.create(level, stack.copy());
    e.moveTo(at[0], at[1], at[2], 0, 0);
    level.addEntity(e);
    const r = level.random;
    level.sound.play('block.trial_spawner.spawn_item_begin', Math.floor(at[0]) + 0.5, Math.floor(at[1]) + 0.5, Math.floor(at[2]) + 0.5, 1, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
    this.cooldownEndsAt = level.gameTime + TICKS_BETWEEN_ITEM_SPAWNERS;
    this.dirty = true;
  }

  /** vanilla calculatePositionToSpawnSpawner and selectEntityToSpawnItemAbove */
  private positionToSpawnItemSpawner(level: Level): [number, number, number] | null {
    const cx = this.x + 0.5, cy = this.y + 0.5, cz = this.z + 0.5, r2 = this.requiredPlayerRange ** 2;
    const near = (e: Entity) => (e.x - cx) ** 2 + (e.y - cy) ** 2 + (e.z - cz) ** 2 <= r2;
    const players: Entity[] = [];
    for (const u of this.detectedPlayers) {
      const p = level.players().find((q) => q.uuid === u);
      if (p && p.gameMode !== 'creative' && p.gameMode !== 'spectator' && p.isAlive && near(p)) players.push(p);
    }
    if (!players.length) return null;
    const mobs: Entity[] = [];
    for (const u of this.currentMobs) {
      const e = entityByUuid(level, u, this.mobCache);
      if (e && isAlive(e) && near(e)) mobs.push(e);
    }
    const list = level.random.nextBool() ? mobs : players;
    if (!list.length) return null;
    const target = list.length === 1 ? list[0] : list[level.random.nextInt(list.length)];
    return positionAbove(level, target);
  }

  // --- client (vanilla TrialSpawner.tickClient)

  private tickClient(level: Level): void {
    const s = this.state(level);
    this.emitParticles(level, s);
    const speed = SPIN_SPEED[s];
    if (speed >= 0) {
      // (the client hears when the next mob comes only while it's active)
      const d = Math.max(0, (s === 'active' ? this.nextMobSpawnsAt : 0) - level.gameTime);
      this.oSpin = this.spin;
      this.spin = (this.spin + speed / (d + 200)) % 360;
    }
    if (CAN_SPAWN[s] && Math.random() <= 0.02) {
      const name = this.isOminous ? 'block.trial_spawner.ambient_ominous' : 'block.trial_spawner.ambient';
      level.sound.play(name, this.x + 0.5, this.y + 0.5, this.z + 0.5, Math.random() * 0.25 + 0.75, Math.random() + 0.5);
    }
  }

  /** vanilla TrialSpawnerState.ParticleEmission */
  private emitParticles(level: Level, s: TrialSpawnerStateName): void {
    const r = Math.random;
    const at = (f: number): [number, number, number] => [this.x + 0.5 + (r() - 0.5) * f, this.y + 0.5 + (r() - 0.5) * f, this.z + 0.5 + (r() - 0.5) * f];
    const add = (kind: string, [x, y, z]: [number, number, number]) => level.particles.spawn?.(kind, x, y, z, 0, 0, 0);
    if (s === 'waiting_for_players' || s === 'waiting_for_reward_ejection' || s === 'ejecting_reward') {
      // SMALL_FLAMES
      if (Math.floor(r() * 2) === 0) add(this.isOminous ? 'soul_fire_flame' : 'small_flame', at(0.9));
    } else if (s === 'active') {
      // FLAMES_AND_SMOKE
      const p = at(1);
      add('smoke', p);
      add(this.isOminous ? 'soul_fire_flame' : 'flame', p);
    } else if (s === 'cooldown') {
      // SMOKE_INSIDE_AND_TOP_FACE
      const p = at(0.9);
      if (Math.floor(r() * 3) === 0) add('smoke', p);
      if (level.gameTime % 20 === 0) {
        const n = Math.floor(r() * 4) + 20;
        for (let j = 0; j < n; j++) add('smoke', [this.x + 0.5, this.y + 1, this.z + 0.5]);
      }
    }
  }

  /**
   * block entity data given with /setblock (vanilla loadWithComponents, which makes the whole spawner anew from it,
   * the defaults for whatever's left out): its configs by name ({normal_config:"minecraft:trial_chamber/melee/zombie/
   * normal",ominous_config:...}), the mob it spawns next (spawn_data:{entity:{id:"minecraft:husk"}}),
   * target_cooldown_length, required_player_range (1 to 128), and the trial's numbers
   */
  readBlockEntityData(nbt: string): void {
    const d = snbtObject(parseSnbt(nbt));
    if (!d) return;
    const name = (v: unknown) => (typeof v === 'string' && v ? v.replace(/^minecraft:/, '') : null);
    const int = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' ? Math.min(hi, Math.max(lo, Math.floor(v))) : def);
    this.normalConfig = name(d.normal_config);
    this.ominousConfig = name(d.ominous_config);
    this.targetCooldownLength = int(d.target_cooldown_length, TARGET_COOLDOWN_LENGTH, 0, 0x7fffffff);
    this.requiredPlayerRange = int(d.required_player_range, REQUIRED_PLAYER_RANGE, 1, 128);
    this.reset();
    this.cooldownEndsAt = int(d.cooldown_ends_at, 0, -Infinity, Infinity);
    this.nextMobSpawnsAt = int(d.next_mob_spawns_at, 0, -Infinity, Infinity);
    this.totalMobsSpawned = int(d.total_mobs_spawned, 0, 0, 0x7fffffff);
    this.ejectingLootTable = name(d.ejecting_loot_table);
    const id = name(snbtObject(snbtObject(d.spawn_data)?.entity)?.id);
    this.nextSpawnData = id ? { entity: { id } } : null;
    this.displayEntity = null;
    this.dispensing = null;
  }

  // --- saving (vanilla TrialSpawner.codec and TrialSpawnerData.MAP_CODEC)

  protected override saveData(): Record<string, number | string> {
    const d: Record<string, number | string> = {
      normal_config: this.normalConfig ?? '',
      ominous_config: this.ominousConfig ?? '',
      data: JSON.stringify({
        registered_players: [...this.detectedPlayers],
        current_mobs: [...this.currentMobs],
        cooldown_ends_at: this.cooldownEndsAt,
        next_mob_spawns_at: this.nextMobSpawnsAt,
        total_mobs_spawned: this.totalMobsSpawned,
        spawn_data: this.nextSpawnData,
        ejecting_loot_table: this.ejectingLootTable,
      }),
    };
    if (this.targetCooldownLength !== TARGET_COOLDOWN_LENGTH) d.target_cooldown_length = this.targetCooldownLength;
    if (this.requiredPlayerRange !== REQUIRED_PLAYER_RANGE) d.required_player_range = this.requiredPlayerRange;
    return d;
  }

  protected override loadData(d: Record<string, number | string>): void {
    const name = (v: unknown) => (typeof v === 'string' && v ? v.replace(/^minecraft:/, '') : null);
    this.normalConfig = name(d.normal_config);
    this.ominousConfig = name(d.ominous_config);
    if (d.target_cooldown_length !== undefined) this.targetCooldownLength = Number(d.target_cooldown_length);
    if (d.required_player_range !== undefined) this.requiredPlayerRange = Number(d.required_player_range);
    // (a structure's spawner may name its mob as spawn_data's entity id)
    if (typeof d.entity === 'string' && d.entity) this.nextSpawnData = { entity: { id: d.entity.replace(/^minecraft:/, '') } };
    if (typeof d.data !== 'string') return;
    const v = JSON.parse(d.data) as Record<string, unknown>;
    for (const u of (v.registered_players as string[] | undefined) ?? []) this.detectedPlayers.add(u);
    for (const u of (v.current_mobs as string[] | undefined) ?? []) this.currentMobs.add(u);
    this.cooldownEndsAt = Number(v.cooldown_ends_at ?? 0);
    this.nextMobSpawnsAt = Number(v.next_mob_spawns_at ?? 0);
    this.totalMobsSpawned = Number(v.total_mobs_spawned ?? 0);
    this.nextSpawnData = (v.spawn_data as SpawnData | null) ?? this.nextSpawnData;
    this.ejectingLootTable = (v.ejecting_loot_table as string | null) ?? null;
  }
}

/** the few values vanilla's trial spawn data sets on a mob (a baby zombie, a slime's size) */
function applySpawnData(m: Mob, d: SpawnData): void {
  if (d.entity.baby && m instanceof Zombie) m.setBaby(true);
  if (d.entity.size !== undefined && m instanceof Slime) m.setSlimeSize(d.entity.size, true);
}

/** level event 3012 with the plain flames, at a mob taken away when the spawner turned ominous */
function mobSpawnedFlames(level: Level, e: Entity): void {
  mobSpawnedEvent(level, Math.floor(e.x), Math.floor(e.y), Math.floor(e.z), 0);
}

/**
 * vanilla calculatePositionAbove: 2 to 5 blocks over its head, or under whatever's in the way (a VISUAL clip), in the
 * middle of the block below that; none if that block is solid
 */
function positionAbove(level: Level, e: Entity): [number, number, number] | null {
  const top = e.y + e.height + 2 + level.random.nextInt(4);
  const hit = clipVisual(level.world, e.x, e.y, e.z, e.x, top, e.z);
  const [bx, by, bz] = hit ? [hit.x, hit.y, hit.z] : [Math.floor(e.x), Math.floor(top), Math.floor(e.z)];
  const at: [number, number, number] = [bx + 0.5, by + 0.5 - 1, bz + 0.5];
  const boxes = COLLISION[level.getState(Math.floor(at[0]), Math.floor(at[1]), Math.floor(at[2]))];
  return boxes && boxes.length ? null : at;
}

registerBlockEntityType('trial_spawner', (x, y, z) => new TrialSpawnerBlockEntity(x, y, z));

// vanilla: a trial spawner has no loot table, silk touch or not
registerBehavior('trial_spawner', { drops: () => [] });

/** the states in their order (for tests and commands) */
export { TRIAL_SPAWNER_STATES };
