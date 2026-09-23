// Natural mob spawning (vanilla NaturalSpawner): per-biome spawn lists, mob
// caps, pack spawning around random positions, chunk-generation animals.

import type { Level } from './level';
import type { Entity } from '../entity/entity';
import { Mob, MobCategory, SavedEntity } from '../entity/mob';
import { ItemEntity } from '../entity/itemEntity';
import { ItemStack, ITEMS, cloneTag } from '../item/item';
import { Pig, Cow, Sheep, Chicken, Animal } from '../entity/animals';
import { Zombie, Skeleton, Creeper, Spider, CaveSpider, Enderman, Slime, Monster, validSpawnBlock } from '../entity/monsters';
import { Squid, WaterAnimal } from '../entity/water';
import { AbstractMinecart, createMinecart, MINECART_TYPES } from '../entity/minecart';
import { moonPhase } from '../render/environment';
import { BIOMES } from '../world/gen/biomes';
import { BLOCKS, STATE_BLOCK, FLAGS, F_OPAQUE, F_FULL_COLLISION, F_WATER, F_LAVA, COLLISION } from '../world/block';
import { MIN_Y } from '../world/constants';
import { AABB } from '../core/aabb';
import { Rand, hash2 } from '../core/rng';

export const MOB_TYPES: Record<string, (l: Level) => Mob> = {
  pig: (l) => new Pig(l),
  cow: (l) => new Cow(l),
  sheep: (l) => new Sheep(l),
  chicken: (l) => new Chicken(l),
  zombie: (l) => new Zombie(l),
  skeleton: (l) => new Skeleton(l),
  creeper: (l) => new Creeper(l),
  spider: (l) => new Spider(l),
  // spawners only: no natural spawn entries
  cave_spider: (l) => new CaveSpider(l),
  enderman: (l) => new Enderman(l),
  slime: (l) => new Slime(l),
  squid: (l) => new Squid(l),
};

export function createMob(type: string, level: Level): Mob | null {
  const f = MOB_TYPES[type];
  return f ? f(level) : null;
}

/** serialize an entity for chunk storage (mobs, dropped items, minecarts); riders go inside their vehicle's record */
export function saveEntity(e: Entity): SavedEntity | null {
  return e.vehicle ? null : saveWithPassengers(e);
}

/** vanilla Entity.saveAsPassenger: the record plus its riders (players are saved on their own) */
function saveWithPassengers(e: Entity): SavedEntity | null {
  const d = saveOne(e);
  if (!d) return null;
  const riders = e.passengers.filter((p) => p.type !== 'player').map(saveWithPassengers).filter((r) => r !== null);
  if (riders.length) d.data = { ...d.data, passengers: JSON.stringify(riders) };
  return d;
}

function saveOne(e: Entity): SavedEntity | null {
  if (e instanceof Mob) return e.health > 0 && !e.removed ? e.save() : null;
  if (e instanceof AbstractMinecart) return e.removed ? null : e.save();
  if (e instanceof ItemEntity && !e.removed) {
    const s = e.stack;
    return {
      id: 'item', x: e.x, y: e.y, z: e.z, yaw: e.yaw, pitch: 0, dx: e.dx, dy: e.dy, dz: e.dz, health: 5, fire: 0,
      data: { item: s.item.id, count: s.count, damage: s.damage, age: e.age, pickupDelay: e.pickupDelay, ...(s.tag ? { tag: JSON.stringify(s.tag) } : {}) },
    };
  }
  return null;
}

/** vanilla EntityType.loadEntityRecursive: the entity with its riders on board */
export function loadEntity(d: SavedEntity, level: Level): Entity | null {
  const e = loadOne(d, level);
  if (e && typeof d.data?.passengers === 'string') {
    for (const pd of JSON.parse(d.data.passengers) as SavedEntity[]) loadEntity(pd, level)?.startRiding(e, true);
  }
  return e;
}

function loadOne(d: SavedEntity, level: Level): Entity | null {
  if (d.id === 'item') {
    const it = ITEMS.get(String(d.data?.item));
    if (!it) return null;
    const tag = typeof d.data?.tag === 'string' ? cloneTag(JSON.parse(d.data.tag)) : null;
    const e = new ItemEntity(level, new ItemStack(it, Number(d.data?.count ?? 1), Number(d.data?.damage ?? 0), tag));
    e.moveTo(d.x, d.y, d.z, d.yaw, 0);
    e.dx = d.dx;
    e.dy = d.dy;
    e.dz = d.dz;
    e.age = Number(d.data?.age ?? 0);
    e.pickupDelay = Number(d.data?.pickupDelay ?? 0);
    return e;
  }
  const cart = createMinecart(d.id, level);
  if (cart) {
    cart.load(d);
    return cart;
  }
  const m = createMob(d.id, level);
  if (m) m.load(d);
  return m;
}

/** entities that belong to chunk storage (a cart carrying the player is saved with the player) */
export function isChunkSaved(e: Entity): boolean {
  if (e instanceof AbstractMinecart) return !e.passengers.some((p) => p.type === 'player');
  return e instanceof Mob || e instanceof ItemEntity;
}

const ENTITY_NAMES: Record<string, string> = {
  pig: 'Pig', cow: 'Cow', sheep: 'Sheep', chicken: 'Chicken', zombie: 'Zombie', skeleton: 'Skeleton', creeper: 'Creeper', spider: 'Spider',
  cave_spider: 'Cave Spider', enderman: 'Enderman', slime: 'Slime', squid: 'Squid',
  arrow: 'Arrow', tnt: 'Primed TNT', item: 'Item', experience_orb: 'Experience Orb', falling_block: 'Falling Block', player: 'Player',
  egg: 'Thrown Egg', snowball: 'Snowball', ender_pearl: 'Thrown Ender Pearl',
  minecart: 'Minecart', chest_minecart: 'Minecart with Chest',
};

/** vanilla entity type display names (death messages, commands) */
export function entityDisplayName(e: Entity | string): string {
  const t = typeof e === 'string' ? e : e.type;
  return ENTITY_NAMES[t] ?? t;
}

/** entity type ids accepted by /summon */
export function summonableTypes(): string[] {
  return [...Object.keys(MOB_TYPES), 'tnt', 'experience_orb', 'arrow', ...MINECART_TYPES];
}

/** vanilla MobCategory caps (per 289 spawnable chunks) */
const CAPS: Record<MobCategory, number> = { monster: 70, creature: 10, ambient: 15, water_creature: 5, misc: -1 };
const SURFACE_SLIMES = new Set(['swamp', 'mangrove_swamp']);
const MOON_BRIGHTNESS = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75];

interface SpawnerData {
  type: string;
  weight: number;
  min: number;
  max: number;
}

interface MobSettings {
  creature: SpawnerData[];
  monster: SpawnerData[];
  water: SpawnerData[];
  creatureProbability: number;
}

const farmAnimals = (): SpawnerData[] => [
  { type: 'sheep', weight: 12, min: 4, max: 4 },
  { type: 'pig', weight: 10, min: 4, max: 4 },
  { type: 'chicken', weight: 10, min: 4, max: 4 },
  { type: 'cow', weight: 8, min: 4, max: 4 },
];

/** vanilla BiomeDefaultFeatures.monsters (zombie villagers and witches not implemented yet) */
const monsters = (zombie = 95, skeleton = 100): SpawnerData[] => [
  { type: 'spider', weight: 100, min: 4, max: 4 },
  { type: 'zombie', weight: zombie + 5, min: 4, max: 4 },
  { type: 'skeleton', weight: skeleton, min: 4, max: 4 },
  { type: 'creeper', weight: 100, min: 4, max: 4 },
  { type: 'slime', weight: 100, min: 4, max: 4 },
  { type: 'enderman', weight: 10, min: 1, max: 4 },
];

const SQUID = (w: number, max = 4): SpawnerData[] => [{ type: 'squid', weight: w, min: 1, max }];

function settingsFor(name: string): MobSettings {
  const base = settingsForLand(name);
  let water: SpawnerData[] = [];
  if (name === 'river' || name === 'frozen_river') water = SQUID(2);
  else if (name.endsWith('ocean')) water = SQUID(name.includes('cold') ? 3 : name.includes('lukewarm') || name.includes('warm') ? 10 : 1, name.includes('frozen') ? 4 : 4);
  return { ...base, water };
}

function settingsForLand(name: string): Omit<MobSettings, 'water'> {
  const none = { creature: [], monster: monsters(), creatureProbability: 0.1 };
  switch (name) {
    case 'mushroom_fields':
    case 'deep_dark':
      return { creature: [], monster: [], creatureProbability: 0.1 };
    case 'plains':
    case 'sunflower_plains':
    case 'forest':
    case 'flower_forest':
    case 'birch_forest':
    case 'old_growth_birch_forest':
    case 'dark_forest':
    case 'taiga':
    case 'old_growth_pine_taiga':
    case 'old_growth_spruce_taiga':
    case 'windswept_hills':
    case 'windswept_gravelly_hills':
    case 'windswept_forest':
    case 'swamp':
    case 'savanna':
    case 'savanna_plateau':
    case 'windswept_savanna':
    case 'meadow':
    case 'cherry_grove':
      return { creature: farmAnimals(), monster: monsters(), creatureProbability: 0.1 };
    case 'jungle':
    case 'sparse_jungle':
    case 'bamboo_jungle':
      return { creature: [...farmAnimals(), { type: 'chicken', weight: 10, min: 4, max: 4 }], monster: monsters(), creatureProbability: 0.1 };
    case 'snowy_plains':
    case 'ice_spikes':
    case 'snowy_taiga':
    case 'grove':
    case 'snowy_slopes':
    case 'frozen_peaks':
    case 'jagged_peaks':
      return { creature: [], monster: monsters(95, 20), creatureProbability: 0.07 };
    case 'desert':
      return { creature: [], monster: monsters(19), creatureProbability: 0.1 };
    default:
      return none;
  }
}

const SETTINGS = new Map<number, MobSettings>();
function biomeSettings(id: number): MobSettings {
  let s = SETTINGS.get(id);
  if (!s) {
    s = settingsFor(BIOMES[id]?.name ?? 'plains');
    SETTINGS.set(id, s);
  }
  return s;
}

function pickWeighted(list: SpawnerData[], r: Rand): SpawnerData | null {
  let total = 0;
  for (const d of list) total += d.weight;
  if (total <= 0) return null;
  let k = r.nextInt(total);
  for (const d of list) {
    k -= d.weight;
    if (k < 0) return d;
  }
  return null;
}

export class NaturalSpawner {
  private readonly rand = new Rand(0x5eed);
  /** world spawn (no natural spawns within 24 blocks) */
  spawnPos: [number, number, number] | null = null;

  constructor(readonly level: Level, readonly worldSeed: number) {}

  private counts(): Record<MobCategory, number> {
    const c: Record<MobCategory, number> = { monster: 0, creature: 0, ambient: 0, water_creature: 0, misc: 0 };
    for (const e of this.level.entities) {
      if (!(e instanceof Mob) || e.removed || e.persistenceRequired) continue;
      if (!this.level.isEntityTicking(e.x, e.z)) continue;
      c[e.category]++;
    }
    return c;
  }

  /** vanilla ServerChunkCache.tickChunks spawning part */
  tick(): void {
    const lvl = this.level;
    const p = lvl.player;
    if (!p || !lvl.gameRules.doMobSpawning) return;
    // vanilla: persistent creatures only every 400 ticks; water creatures and monsters every tick
    const spawnFriendlies = lvl.gameTime % 400 === 0;
    const spawnEnemies = lvl.difficulty !== 'peaceful';
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const r = Math.min(8, lvl.simulationDistance);
    const chunks: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (lvl.world.getChunk(pcx + dx, pcz + dz)) chunks.push([pcx + dx, pcz + dz]);
    if (!chunks.length) return;
    const counts = this.counts();
    const cats: MobCategory[] = [];
    for (const cat of ['monster', 'creature', 'water_creature'] as MobCategory[]) {
      if (cat === 'creature' && !spawnFriendlies) continue;
      if (cat === 'monster' && !spawnEnemies) continue;
      const cap = Math.floor((CAPS[cat] * chunks.length) / 289);
      if (counts[cat] < cap) cats.push(cat);
    }
    if (!cats.length) return;
    // shuffled chunk order
    for (let i = chunks.length - 1; i > 0; i--) {
      const j = this.rand.nextInt(i + 1);
      [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
    }
    for (const [cx, cz] of chunks) {
      for (const cat of cats) {
        const cap = Math.floor((CAPS[cat] * chunks.length) / 289);
        if (counts[cat] >= cap) continue;
        counts[cat] += this.spawnCategoryForChunk(cat, cx, cz);
      }
    }
  }

  /** vanilla spawnCategoryForChunk + spawnCategoryForPosition; returns mobs spawned */
  private spawnCategoryForChunk(cat: MobCategory, cx: number, cz: number): number {
    const lvl = this.level, w = lvl.world, r = this.rand;
    const x0 = (cx << 4) + r.nextInt(16), z0 = (cz << 4) + r.nextInt(16);
    const top = w.heightAt(x0, z0) + 1;
    const y = MIN_Y + r.nextInt(top - MIN_Y + 1);
    const st0 = w.getState(x0, y, z0);
    if (FLAGS[st0] & F_OPAQUE && FLAGS[st0] & F_FULL_COLLISION) return 0;
    let spawned = 0;
    const p = lvl.player;
    for (let k = 0; k < 3; k++) {
      let x = x0, z = z0;
      let data: SpawnerData | null = null;
      let tries = Math.ceil(r.nextFloat() * 4);
      let inGroup = 0;
      for (let i = 0; i < tries; i++) {
        x += r.nextInt(6) - r.nextInt(6);
        z += r.nextInt(6) - r.nextInt(6);
        const d2 = p.distanceToSqr(x + 0.5, y, z + 0.5);
        if (d2 <= 576) continue;
        if (this.spawnPos && (this.spawnPos[0] - x - 0.5) ** 2 + (this.spawnPos[1] - y) ** 2 + (this.spawnPos[2] - z - 0.5) ** 2 < 576) continue;
        if (!lvl.isEntityTicking(x, z)) continue;
        if (!data) {
          const bs = biomeSettings(w.getBiome3(x, y, z));
          const list = cat === 'monster' ? bs.monster : cat === 'water_creature' ? bs.water : bs.creature;
          data = pickWeighted(list, r);
          if (!data) break;
          tries = data.min + r.nextInt(1 + data.max - data.min);
        }
        if (d2 > 128 * 128) continue;
        const placeOk = data.type === 'squid' ? this.isInWaterPositionOk(x, y, z) : this.isSpawnPositionOk(x, y, z);
        if (!placeOk || !this.checkSpawnRules(data.type, x, y, z)) continue;
        const mob = createMob(data.type, lvl);
        if (!mob) return spawned;
        mob.moveTo(x + 0.5, y, z + 0.5, r.nextFloat() * 360, 0);
        mob.bodyYaw = mob.headYaw = mob.yaw;
        if (!this.noCollision(mob.bb)) continue;
        if (data.type !== 'squid' && (!mob.checkSpawnRules() || !mob.checkSpawnObstruction())) continue;
        mob.finalizeSpawn('natural');
        lvl.addEntity(mob);
        spawned++;
        inGroup++;
        if (spawned >= 4) return spawned;
        void inGroup;
      }
    }
    return spawned;
  }

  /** vanilla SpawnPlacements ON_GROUND: valid floor, two empty blocks */
  private isSpawnPositionOk(x: number, y: number, z: number): boolean {
    const w = this.level.world;
    return validSpawnBlock(this.level, x, y - 1, z) && emptySpawnBlock(w.getState(x, y, z)) && emptySpawnBlock(w.getState(x, y + 1, z));
  }

  /** vanilla SpawnPlacementTypes.IN_WATER */
  private isInWaterPositionOk(x: number, y: number, z: number): boolean {
    const w = this.level.world;
    const above = w.getState(x, y + 1, z);
    return (FLAGS[w.getState(x, y, z)] & F_WATER) !== 0 && !(FLAGS[above] & F_OPAQUE && FLAGS[above] & F_FULL_COLLISION);
  }

  /** vanilla WorldgenRandom.seedSlimeChunk(...).nextInt(10) == 0 (hash-based here) */
  isSlimeChunk(cx: number, cz: number): boolean {
    return hash2(cx, cz, this.worldSeed ^ 987234911) % 10 === 0;
  }

  private checkSpawnRules(type: string, x: number, y: number, z: number): boolean {
    const lvl = this.level;
    switch (type) {
      case 'squid':
        return WaterAnimal.checkSurfaceSpawn(lvl, x, y, z);
      case 'slime': {
        const biome = BIOMES[lvl.world.getBiome3(x, y, z)]?.name ?? '';
        return Slime.checkSlimeSpawn(lvl, x, y, z, () => this.rand.nextFloat(), this.isSlimeChunk(x >> 4, z >> 4), SURFACE_SLIMES.has(biome), MOON_BRIGHTNESS[moonPhase(lvl.dayTime)]);
      }
      case 'pig':
      case 'cow':
      case 'sheep':
      case 'chicken': {
        const below = BLOCKS[STATE_BLOCK[lvl.world.getState(x, y - 1, z)]].name;
        return below === 'grass_block' && lvl.rawBrightness(x, y, z, 0) > 8;
      }
      default:
        return Monster.checkMonsterSpawn(lvl, x, y, z, () => this.rand.nextFloat());
    }
  }

  private noCollision(bb: AABB): boolean {
    const w = this.level.world;
    for (let x = Math.floor(bb.minX); x <= Math.floor(bb.maxX - 1e-7); x++)
      for (let y = Math.floor(bb.minY); y <= Math.floor(bb.maxY - 1e-7); y++)
        for (let z = Math.floor(bb.minZ); z <= Math.floor(bb.maxZ - 1e-7); z++) {
          const boxes = COLLISION[w.getState(x, y, z)];
          if (!boxes) continue;
          for (const b of boxes) if (bb.intersectsRaw(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5])) return false;
        }
    return true;
  }

  /** vanilla spawnMobsForChunkGeneration: ~10% of new chunks get a herd of animals */
  spawnForNewChunk(cx: number, cz: number): Entity[] {
    const lvl = this.level, w = lvl.world;
    const out: Entity[] = [];
    const r = new Rand(hash2(cx, cz, this.worldSeed ^ 0x6d6f6273));
    const x0 = cx << 4, z0 = cz << 4;
    const biome = w.getBiome(x0 + 8, z0 + 8);
    const set = biomeSettings(biome);
    if (!set.creature.length) return out;
    while (r.nextFloat() < set.creatureProbability) {
      const data = pickWeighted(set.creature, r);
      if (!data) continue;
      const n = data.min + r.nextInt(1 + data.max - data.min);
      let l = x0 + r.nextInt(16), i1 = z0 + r.nextInt(16);
      const j1 = l, k1 = i1;
      for (let l1 = 0; l1 < n; l1++) {
        let ok = false;
        for (let i2 = 0; !ok && i2 < 4; i2++) {
          const y = this.topNonColliding(l, i1);
          const mob = createMob(data.type, lvl);
          if (mob && y > MIN_Y && this.isSpawnPositionOk(l, y, i1)) {
            const f = mob.width;
            const d0 = Math.max(x0 + f, Math.min(x0 + 16 - f, l));
            const d1 = Math.max(z0 + f, Math.min(z0 + 16 - f, i1));
            mob.moveTo(d0, y, d1, r.nextFloat() * 360, 0);
            mob.bodyYaw = mob.headYaw = mob.yaw;
            if (this.noCollision(mob.bb) && this.checkSpawnRules(data.type, Math.floor(d0), y, Math.floor(d1)) && mob.checkSpawnRules() && mob.checkSpawnObstruction()) {
              mob.finalizeSpawn('chunk');
              lvl.addEntity(mob);
              out.push(mob);
              ok = true;
            }
          }
          l += r.nextInt(5) - r.nextInt(5);
          for (i1 += r.nextInt(5) - r.nextInt(5); l < x0 || l >= x0 + 16 || i1 < z0 || i1 >= z0 + 16; i1 = k1 + r.nextInt(5) - r.nextInt(5)) l = j1 + r.nextInt(5) - r.nextInt(5);
        }
      }
    }
    return out;
  }

  /** vanilla getTopNonCollidingPos (motion-blocking heightmap for ON_GROUND mobs) */
  private topNonColliding(x: number, z: number): number {
    const w = this.level.world;
    let y = w.heightAt(x, z);
    // heightmap counts light-blocking blocks; step down through non-colliding plants
    while (y > MIN_Y + 1) {
      const st = w.getState(x, y - 1, z);
      if (COLLISION[st]?.length || FLAGS[st] & (F_WATER | F_LAVA)) break;
      y--;
    }
    return y;
  }
}

/** vanilla NaturalSpawner.isValidEmptySpawnBlock */
function emptySpawnBlock(st: number): boolean {
  const f = FLAGS[st];
  if (f & F_FULL_COLLISION) return false;
  if (f & (F_WATER | F_LAVA)) return false;
  const n = BLOCKS[STATE_BLOCK[st]].name;
  if (n.endsWith('rail') || n === 'fire' || n === 'cactus' || n === 'sweet_berry_bush' || n === 'wither_rose' || n === 'powder_snow' || n === 'redstone_wire') return false;
  return true;
}

export { Animal };
