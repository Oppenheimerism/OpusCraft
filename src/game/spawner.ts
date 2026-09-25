// Natural mob spawning (vanilla NaturalSpawner): per-biome spawn lists, mob
// caps, pack spawning around random positions, chunk-generation animals.

import type { Level } from './level';
import type { Entity } from '../entity/entity';
import { Mob, MobCategory, SavedEntity, SpawnGroup, isValidEmptySpawnBlock } from '../entity/mob';
import { ItemEntity } from '../entity/itemEntity';
import { Arrow } from '../entity/arrow';
import { ThrownTrident } from '../entity/thrownTrident';
import { ItemStack, ITEMS, cloneTag } from '../item/item';
import { Pig, Cow, Sheep, Chicken, Animal } from '../entity/animals';
import { Ghast } from '../entity/ghast';
import { Blaze } from '../entity/blaze';
import { Hoglin, Zoglin } from '../entity/hoglin';
import { Strider } from '../entity/strider';
import { Piglin } from '../entity/piglin';
import { Villager } from '../entity/villager';
import { Witch } from '../entity/witch';
// (Stage 4: illagers)
import { Pillager, Vindicator } from '../entity/illagers';
import { Evoker, Vex } from '../entity/evoker';
import { Ravager } from '../entity/ravager';
import { PatrolSpawner } from './patrolSpawner';
import { outpostSpawnsAt } from './outposts';
import { checkPatrollingMonsterSpawnRules } from '../entity/raider';
// (Stage 5: ocean)
import { Guardian, ElderGuardian, checkGuardianSpawnRules } from '../entity/guardian';
// (the monument's spawn overrides register themselves with structureSpawns)
import './monuments';
import { Cod, Salmon, Pufferfish, TropicalFish } from '../entity/fish';
import { Dolphin } from '../entity/dolphin';
import { GlowSquid } from '../entity/glowSquid';
import { waterSpawnsFor } from './oceanSpawns';
import { despawnDistance } from '../entity/mob';
import { Husk, Stray } from '../entity/biomeMonsters';
import { Drowned, isInWaterPositionOk, drownedNaturalSpawnRules } from '../entity/drowned';
import { Silverfish } from '../entity/silverfish';
import { Wolf, wolfSpawnRulesOk } from '../entity/wolf';
import { Cat, catHooks } from '../entity/cat';
import { Ocelot } from '../entity/ocelot';
import { Horse, Donkey, Mule } from '../entity/horse';
import { Llama, TraderLlama } from '../entity/llama';
import { CatSpawner } from './catSpawner';
import { WanderingTraderSpawner } from './wanderingTraderSpawner';
import { WanderingTrader } from '../entity/wanderingTrader';
import { IronGolem } from '../entity/ironGolem';
import { ZombieVillager } from '../entity/zombieVillager';
import { Zombie, ZombifiedPiglin, Skeleton, WitherSkeleton, Creeper, Spider, CaveSpider, Enderman, Slime, MagmaCube, Monster, validSpawnBlock } from '../entity/monsters';
import { Squid, WaterAnimal } from '../entity/water';
import { AbstractMinecart, createMinecart, MINECART_TYPES } from '../entity/minecart';
import { Bat } from '../entity/bat';
import { Boat, createBoat, BOAT_TYPES } from '../entity/boat';
import { EndCrystal } from '../entity/endCrystal';
import { LeashKnot } from '../entity/leash';
import { EnderDragon } from '../entity/enderDragon';
import { Shulker } from '../entity/shulker';
import { ItemFrame } from '../entity/itemFrame';
import { moonPhase } from '../render/environment';
import { tickInhabitedTime } from './difficulty';
import { BIOMES } from '../world/gen/biomes';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_OPAQUE, F_FULL_COLLISION, F_WATER, F_LAVA, COLLISION } from '../world/block';
import { fluidType, FLUID_LAVA } from '../world/fluids';
import { MIN_Y } from '../world/constants';
import { AABB } from '../core/aabb';
import { Rand, hash2 } from '../core/rng';
import { structureMobsAt, inSwampHut } from './structureSpawns';

// (temples) a cat in a swamp hut is the witch's black cat (vanilla #cats_spawn_as_black), and cats keep coming to one
catHooks.inSwampHut = inSwampHut;

export const MOB_TYPES: Record<string, (l: Level) => Mob> = {
  pig: (l) => new Pig(l),
  cow: (l) => new Cow(l),
  sheep: (l) => new Sheep(l),
  chicken: (l) => new Chicken(l),
  zombie: (l) => new Zombie(l),
  zombie_villager: (l) => new ZombieVillager(l),
  skeleton: (l) => new Skeleton(l),
  creeper: (l) => new Creeper(l),
  spider: (l) => new Spider(l),
  // spawners only: no natural spawn entries
  cave_spider: (l) => new CaveSpider(l),
  enderman: (l) => new Enderman(l),
  slime: (l) => new Slime(l),
  magma_cube: (l) => new MagmaCube(l),
  zombified_piglin: (l) => new ZombifiedPiglin(l),
  ghast: (l) => new Ghast(l),
  blaze: (l) => new Blaze(l),
  wither_skeleton: (l) => new WitherSkeleton(l),
  squid: (l) => new Squid(l),
  bat: (l) => new Bat(l),
  hoglin: (l) => new Hoglin(l),
  zoglin: (l) => new Zoglin(l),
  strider: (l) => new Strider(l),
  piglin: (l) => new Piglin(l),
  villager: (l) => new Villager(l),
  iron_golem: (l) => new IronGolem(l),
  witch: (l) => new Witch(l),
  husk: (l) => new Husk(l),
  stray: (l) => new Stray(l),
  drowned: (l) => new Drowned(l),
  silverfish: (l) => new Silverfish(l),
  wolf: (l) => new Wolf(l),
  cat: (l) => new Cat(l),
  ocelot: (l) => new Ocelot(l),
  horse: (l) => new Horse(l),
  donkey: (l) => new Donkey(l),
  mule: (l) => new Mule(l),
  llama: (l) => new Llama(l),
  trader_llama: (l) => new TraderLlama(l),
  wandering_trader: (l) => new WanderingTrader(l),
  ender_dragon: (l) => new EnderDragon(l),
};

// (Stage 4: illagers) the raiders and the vex
Object.assign(MOB_TYPES, {
  pillager: (l: Level) => new Pillager(l),
  vindicator: (l: Level) => new Vindicator(l),
  evoker: (l: Level) => new Evoker(l),
  vex: (l: Level) => new Vex(l),
  ravager: (l: Level) => new Ravager(l),
});
// (Stage 5: ocean) the guardians
Object.assign(MOB_TYPES, {
  guardian: (l: Level) => new Guardian(l),
  elder_guardian: (l: Level) => new ElderGuardian(l),
});

export function createMob(type: string, level: Level): Mob | null {
  const f = MOB_TYPES[type];
  return f ? f(level) : null;
}

// (Stage 4: the outer End) the shulker
MOB_TYPES.shulker = (l) => new Shulker(l);

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
  if (e instanceof AbstractMinecart || e instanceof Boat || e instanceof EndCrystal || e instanceof LeashKnot) return e.removed ? null : e.save();
  // (vanilla: item frames are kept with their chunk, and what they hold)
  if (e instanceof ItemFrame) return e.removed ? null : e.save();
  // (vanilla: arrows and tridents are kept with their chunk, stuck where they landed)
  if (e instanceof Arrow) return e.removed ? null : e.save();
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
  if (d.id === 'arrow' || d.id === 'trident') {
    const a = d.id === 'trident' ? new ThrownTrident(level) : new Arrow(level);
    a.load(d);
    return a;
  }
  if (d.id === 'end_crystal') {
    const c = new EndCrystal(level);
    c.load(d);
    return c;
  }
  if (d.id === 'item_frame' || d.id === 'glow_item_frame') {
    const f = new ItemFrame(level, d.id);
    f.load(d);
    return f;
  }
  if (d.id === 'leash_knot') return LeashKnot.load(level, d);
  const cart = createMinecart(d.id, level);
  if (cart) {
    cart.load(d);
    return cart;
  }
  const boat = createBoat(d.id, level);
  if (boat) {
    boat.load(d);
    return boat;
  }
  const m = createMob(d.id, level);
  if (m) m.load(d);
  // a structure's mob, placed by the chunk's generator: equipped as it would be spawning there (vanilla finalizeSpawn STRUCTURE)
  if (m && d.data?.finalize === 'structure') m.finalizeSpawn('structure');
  return m;
}

/** entities that belong to chunk storage (whatever carries the player is saved with the player: vanilla RootVehicle) */
export function isChunkSaved(e: Entity): boolean {
  if (e.passengers.some((p) => p.type === 'player')) return false;
  if (e instanceof ItemFrame) return true;
  return e instanceof AbstractMinecart || e instanceof Boat || e instanceof Mob || e instanceof ItemEntity || e instanceof EndCrystal || e instanceof Arrow || e instanceof LeashKnot;
}

const ENTITY_NAMES: Record<string, string> = {
  pig: 'Pig', cow: 'Cow', sheep: 'Sheep', chicken: 'Chicken', zombie: 'Zombie', zombie_villager: 'Zombie Villager', skeleton: 'Skeleton', creeper: 'Creeper', spider: 'Spider',
  villager: 'Villager', iron_golem: 'Iron Golem', cave_spider: 'Cave Spider', enderman: 'Enderman', slime: 'Slime', magma_cube: 'Magma Cube', zombified_piglin: 'Zombified Piglin', ghast: 'Ghast', blaze: 'Blaze', wither_skeleton: 'Wither Skeleton', squid: 'Squid', bat: 'Bat', hoglin: 'Hoglin', zoglin: 'Zoglin', strider: 'Strider', piglin: 'Piglin',
  witch: 'Witch', husk: 'Husk', stray: 'Stray', drowned: 'Drowned', silverfish: 'Silverfish', wolf: 'Wolf', cat: 'Cat', ocelot: 'Ocelot', horse: 'Horse', donkey: 'Donkey', mule: 'Mule', llama: 'Llama', trader_llama: 'Trader Llama', wandering_trader: 'Wandering Trader', llama_spit: 'Llama Spit', fireball: 'Fireball', small_fireball: 'Small Fireball',
  arrow: 'Arrow', tnt: 'Primed TNT', lightning_bolt: 'Lightning Bolt', item: 'Item', experience_orb: 'Experience Orb', falling_block: 'Falling Block', player: 'Player',
  egg: 'Thrown Egg', snowball: 'Snowball', ender_pearl: 'Thrown Ender Pearl', potion: 'Potion', trident: 'Trident',
  minecart: 'Minecart', chest_minecart: 'Minecart with Chest', boat: 'Boat', chest_boat: 'Boat with Chest', end_crystal: 'End Crystal',
  ender_dragon: 'Ender Dragon', dragon_fireball: 'Dragon Fireball', area_effect_cloud: 'Area Effect Cloud', leash_knot: 'Leash Knot',
};

// (Stage 4: illagers)
Object.assign(ENTITY_NAMES, { pillager: 'Pillager', vindicator: 'Vindicator', evoker: 'Evoker', vex: 'Vex', ravager: 'Ravager', evoker_fangs: 'Evoker Fangs' });
// (Stage 5: ocean)
Object.assign(ENTITY_NAMES, { guardian: 'Guardian', elder_guardian: 'Elder Guardian' });

/** vanilla Entity.getDisplayName (death messages, commands, screens): its custom name, else its kind's */
export function entityDisplayName(e: Entity | string): string {
  if (typeof e !== 'string' && e.customName !== null) return e.customName;
  if (e instanceof Boat) return e.displayName();
  // vanilla Villager.getTypeName: a villager with a job goes by it
  if (e instanceof Villager && e.profession !== 'none') return e.profession[0].toUpperCase() + e.profession.slice(1);
  const t = typeof e === 'string' ? e : e.type;
  return ENTITY_NAMES[t] ?? t;
}

// (Stage 4: the outer End)
Object.assign(ENTITY_NAMES, { shulker: 'Shulker', shulker_bullet: 'Shulker Bullet', item_frame: 'Item Frame', glow_item_frame: 'Glow Item Frame' });

/** entity type ids accepted by /summon */
export function summonableTypes(): string[] {
  return [...Object.keys(MOB_TYPES), 'tnt', 'experience_orb', 'arrow', 'trident', 'lightning_bolt', ...MINECART_TYPES, ...BOAT_TYPES, 'end_crystal', 'item_frame', 'glow_item_frame'];
}

/** vanilla MobCategory caps (per 289 spawnable chunks) */
const CAPS: Record<MobCategory, number> = { monster: 70, creature: 10, ambient: 15, water_creature: 5, misc: -1, axolotls: 5, underground_water_creature: 5, water_ambient: 20 };
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
  ambient: SpawnerData[];
  creatureProbability: number;
  /** vanilla MobSpawnSettings.mobSpawnCosts: type → [charge, energy budget] */
  costs?: Record<string, [number, number]>;
  /** (Stage 5: ocean) the fish (water_ambient), the glow squid (underground_water_creature) and the axolotls */
  more?: Partial<Record<MobCategory, SpawnerData[]>>;
}

const farmAnimals = (): SpawnerData[] => [
  { type: 'sheep', weight: 12, min: 4, max: 4 },
  { type: 'pig', weight: 10, min: 4, max: 4 },
  { type: 'chicken', weight: 10, min: 4, max: 4 },
  { type: 'cow', weight: 8, min: 4, max: 4 },
];

/** vanilla BiomeDefaultFeatures.monsters */
const monsters = (zombie = 95, skeleton = 100, zombieVillager = 5): SpawnerData[] => [
  { type: 'spider', weight: 100, min: 4, max: 4 },
  { type: 'zombie', weight: zombie, min: 4, max: 4 },
  { type: 'zombie_villager', weight: zombieVillager, min: 1, max: 1 },
  { type: 'skeleton', weight: skeleton, min: 4, max: 4 },
  { type: 'creeper', weight: 100, min: 4, max: 4 },
  { type: 'slime', weight: 100, min: 4, max: 4 },
  { type: 'enderman', weight: 10, min: 1, max: 4 },
  { type: 'witch', weight: 5, min: 1, max: 1 },
];

const S_ = (type: string, weight: number, min: number, max: number): SpawnerData => ({ type, weight, min, max });
const STRIDERS = [S_('strider', 60, 1, 2)];
/** vanilla EntityType.fireImmune(): these may be spawned standing on magma blocks */
const FIRE_IMMUNE = new Set(['magma_cube', 'zombified_piglin', 'ghast', 'strider', 'blaze', 'wither_skeleton']);
/**
 * vanilla NetherBiomes spawn settings (no bats, no water mobs); what isn't in the game yet would be picked as often
 * as vanilla picks it and then simply not appear, so the rest come as rarely as they should
 */
const NETHER_SPAWNS: Record<string, { monster: SpawnerData[]; creature: SpawnerData[]; costs?: Record<string, [number, number]> }> = {
  nether_wastes: { monster: [S_('ghast', 50, 4, 4), S_('zombified_piglin', 100, 4, 4), S_('magma_cube', 2, 4, 4), S_('enderman', 1, 4, 4), S_('piglin', 15, 4, 4)], creature: STRIDERS },
  soul_sand_valley: {
    monster: [S_('skeleton', 20, 5, 5), S_('ghast', 50, 4, 4), S_('enderman', 1, 4, 4)], creature: STRIDERS,
    costs: { skeleton: [0.7, 0.15], ghast: [0.7, 0.15], enderman: [0.7, 0.15], strider: [0.7, 0.15] },
  },
  basalt_deltas: { monster: [S_('ghast', 40, 1, 1), S_('magma_cube', 100, 2, 5)], creature: STRIDERS },
  crimson_forest: { monster: [S_('zombified_piglin', 1, 2, 4), S_('hoglin', 9, 3, 4), S_('piglin', 5, 3, 4)], creature: STRIDERS },
  warped_forest: { monster: [S_('enderman', 1, 4, 4)], creature: STRIDERS, costs: { enderman: [1, 0.12], strider: [1, 0.12] } },
};

/** vanilla NetherFortressStructure.FORTRESS_ENEMIES: the monsters of a fortress */
const FORTRESS_ENEMIES = [S_('blaze', 10, 2, 3), S_('zombified_piglin', 5, 4, 4), S_('wither_skeleton', 8, 5, 5), S_('skeleton', 2, 5, 5), S_('magma_cube', 3, 4, 4)];

/**
 * vanilla OverworldBiomes' wolves (1.20.5+): forests, taigas and groves, and the packs of the savanna plateau, the
 * sparse jungle and the wooded badlands (each spawning its own coat, see WolfVariants)
 */
const WOLF_SPAWNS: Record<string, SpawnerData> = {
  forest: S_('wolf', 5, 4, 4),
  taiga: S_('wolf', 8, 4, 4),
  snowy_taiga: S_('wolf', 8, 4, 4),
  old_growth_pine_taiga: S_('wolf', 8, 4, 4),
  old_growth_spruce_taiga: S_('wolf', 8, 4, 4),
  grove: S_('wolf', 1, 1, 1),
  savanna_plateau: S_('wolf', 8, 4, 8),
  sparse_jungle: S_('wolf', 8, 2, 4),
  wooded_badlands: S_('wolf', 2, 4, 8),
};

/** vanilla BiomeDefaultFeatures.endSpawns: the End's biomes have endermen, in fours, and nothing else */
const END_SPAWN_BIOMES = new Set(['the_end', 'end_highlands', 'end_midlands', 'small_end_islands', 'end_barrens']);

function settingsFor(name: string): MobSettings {
  const nether = NETHER_SPAWNS[name];
  if (nether) return { ...nether, creatureProbability: 0.1, water: [], ambient: [] };
  if (END_SPAWN_BIOMES.has(name)) return { monster: [S_('enderman', 10, 4, 4)], creature: [], water: [], ambient: [], creatureProbability: 0.1 };
  const base = settingsForLand(name);
  // (Stage 5: ocean) the water lists: squid and dolphins, the fish, the glow squid underground (game/oceanSpawns.ts)
  const ws = waterSpawnsFor(name);
  const water: SpawnerData[] = ws.water;
  const more = { water_ambient: ws.water_ambient, underground_water_creature: ws.underground_water_creature, axolotls: ws.axolotls };
  // vanilla BiomeDefaultFeatures.caveSpawns (through commonSpawns, the mooshroom and cave biomes): bats
  // everywhere in the overworld but the deep dark
  const ambient = name === 'deep_dark' || name === 'the_void' ? [] : [{ type: 'bat', weight: 10, min: 8, max: 8 }];
  // vanilla OverworldBiomes.river, baseOceanSpawns and BiomeDefaultFeatures.warmOceanSpawns: drowned, one at a time
  // (a hundred in a river, one in a frozen river, five in every ocean)
  const drowned = name === 'river' ? 100 : name === 'frozen_river' ? 1 : name.endsWith('ocean') ? 5 : 0;
  // vanilla OverworldBiomes.jungle and bambooJungle: ocelots are on the monster list (a group of 1-3, or one)
  const ocelots = name === 'jungle' ? S_('ocelot', 2, 1, 3) : name === 'bamboo_jungle' ? S_('ocelot', 2, 1, 1) : null;
  const monster = [...base.monster, ...(drowned ? [S_('drowned', drowned, 1, 1)] : []), ...(ocelots ? [ocelots] : [])];
  const wolves = WOLF_SPAWNS[name];
  const creature = wolves ? [...base.creature, wolves] : base.creature;
  return { ...base, creature, monster, water, ambient, more };
}

function settingsForLand(name: string): Omit<MobSettings, 'water' | 'ambient'> {
  const none = { creature: [], monster: monsters(), creatureProbability: 0.1 };
  switch (name) {
    case 'mushroom_fields':
    case 'deep_dark':
      return { creature: [], monster: [], creatureProbability: 0.1 };
    // vanilla BiomeDefaultFeatures.plainsSpawns: herds of horses, and a few donkeys
    case 'plains':
    case 'sunflower_plains':
      return { creature: [...farmAnimals(), S_('horse', 5, 2, 6), S_('donkey', 1, 1, 3)], monster: monsters(), creatureProbability: 0.1 };
    // vanilla OverworldBiomes.savanna: a few horses and donkeys (and armadillos, not in the game yet: picked, and nothing comes)
    // (on a plateau, llamas too: vanilla OverworldBiomes.savanna with isPlateau)
    case 'savanna':
    case 'savanna_plateau':
    case 'windswept_savanna':
      return { creature: [...farmAnimals(), S_('horse', 1, 2, 6), S_('donkey', 1, 1, 1), S_('armadillo', 10, 2, 3), ...(name === 'savanna_plateau' ? [S_('llama', 8, 4, 4)] : [])], monster: monsters(), creatureProbability: 0.1 };
    // vanilla OverworldBiomes.windsweptHills: herds of llamas
    case 'windswept_hills':
    case 'windswept_gravelly_hills':
    case 'windswept_forest':
      return { creature: [...farmAnimals(), S_('llama', 5, 4, 6)], monster: monsters(), creatureProbability: 0.1 };
    // vanilla OverworldBiomes.meadowOrCherryGrove: donkeys (pigs in a cherry grove), rabbits (not yet: the same) and sheep
    case 'meadow':
    case 'cherry_grove':
      return { creature: [S_(name === 'meadow' ? 'donkey' : 'pig', 1, 1, 2), S_('rabbit', 2, 2, 6), S_('sheep', 2, 2, 4)], monster: monsters(), creatureProbability: 0.1 };
    case 'forest':
    case 'flower_forest':
    case 'birch_forest':
    case 'old_growth_birch_forest':
    case 'dark_forest':
    case 'taiga':
    case 'snowy_taiga':
    case 'grove':
    case 'snowy_slopes':
    case 'old_growth_pine_taiga':
    case 'old_growth_spruce_taiga':
    case 'swamp':
      return { creature: farmAnimals(), monster: monsters(), creatureProbability: 0.1 };
    case 'jungle':
    case 'sparse_jungle':
    case 'bamboo_jungle':
      return { creature: [...farmAnimals(), { type: 'chicken', weight: 10, min: 4, max: 4 }], monster: monsters(), creatureProbability: 0.1 };
    // vanilla BiomeDefaultFeatures.snowySpawns: fewer skeletons, and strays instead (no rabbits or polar bears yet)
    case 'snowy_plains':
    case 'ice_spikes':
      return { creature: [], monster: [...monsters(95, 20), S_('stray', 80, 4, 4)], creatureProbability: 0.07 };
    // (goats and rabbits aren't in the game yet)
    case 'frozen_peaks':
    case 'jagged_peaks':
      return { creature: [], monster: monsters(), creatureProbability: 0.1 };
    // vanilla BiomeDefaultFeatures.desertSpawns: few zombies, and husks (no rabbits yet)
    case 'desert':
      return { creature: [], monster: [...monsters(19, 100, 1), S_('husk', 80, 4, 4)], creatureProbability: 0.1 };
    // vanilla BiomeDefaultFeatures.dripstoneCavesSpawns: the usual, and drowned in fours in the caves' pools
    case 'dripstone_caves':
      return { creature: [], monster: [...monsters(), S_('drowned', 95, 4, 4)], creatureProbability: 0.1 };
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
  /** (Stage 4: patrols) */
  readonly patrols = new PatrolSpawner();
  /** vanilla CatSpawner */
  readonly cats = new CatSpawner();
  /** vanilla WanderingTraderSpawner (its wait and chance are saved with the world: game.ts) */
  readonly traders = new WanderingTraderSpawner();

  constructor(readonly level: Level, readonly worldSeed: number) {}

  private counts(): Record<MobCategory, number> {
    const c: Record<MobCategory, number> = { monster: 0, creature: 0, ambient: 0, water_creature: 0, misc: 0, axolotls: 0, underground_water_creature: 0, water_ambient: 0 };
    for (const e of this.level.entities) {
      // (Stage 5: ocean) vanilla NaturalSpawner.createState: nor what never despawns anyway (a fish from a bucket)
      if (!(e instanceof Mob) || e.removed || e.persistenceRequired || e.requiresCustomPersistence()) continue;
      if (!this.level.isEntityTicking(e.x, e.z)) continue;
      c[e.category]++;
    }
    return c;
  }

  /** vanilla ServerChunkCache.tickChunks spawning part */
  tick(): void {
    const lvl = this.level;
    const p = lvl.player;
    // (the same pass ages the chunks round the player, spawning or not)
    tickInhabitedTime(lvl);
    if (!p || !lvl.gameRules.doMobSpawning) return;
    // vanilla: persistent creatures only every 400 ticks; monsters, ambient (bats, even in peaceful)
    // and water creatures every tick
    const spawnFriendlies = lvl.gameTime % 400 === 0;
    const spawnEnemies = lvl.difficulty !== 'peaceful';
    // (Stage 4: patrols) vanilla ServerLevel.tickCustomSpawners
    this.patrols.tick(lvl, spawnEnemies);
    this.cats.tick(lvl);
    this.traders.tick(lvl);
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const r = Math.min(8, lvl.simulationDistance);
    const chunks: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (lvl.world.getChunk(pcx + dx, pcz + dz)) chunks.push([pcx + dx, pcz + dz]);
    if (!chunks.length) return;
    const counts = this.counts();
    const cats: MobCategory[] = [];
    // (Stage 5: ocean) vanilla NaturalSpawner.SPAWNING_CATEGORIES, in its order
    for (const cat of ['monster', 'creature', 'ambient', 'axolotls', 'underground_water_creature', 'water_creature', 'water_ambient'] as MobCategory[]) {
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
    const minY = w.dim.minY;
    const y = minY + r.nextInt(top - minY + 1);
    const st0 = w.getState(x0, y, z0);
    if (FLAGS[st0] & F_OPAQUE && FLAGS[st0] & F_FULL_COLLISION) return 0;
    let spawned = 0;
    const p = lvl.player;
    for (let k = 0; k < 3; k++) {
      let x = x0, z = z0;
      let data: SpawnerData | null = null;
      let tries = Math.ceil(r.nextFloat() * 4);
      let inGroup = 0;
      const group: SpawnGroup = {};
      for (let i = 0; i < tries; i++) {
        x += r.nextInt(6) - r.nextInt(6);
        z += r.nextInt(6) - r.nextInt(6);
        const d2 = p.distanceToSqr(x + 0.5, y, z + 0.5);
        if (d2 <= 576) continue;
        if (this.spawnPos && (this.spawnPos[0] - x - 0.5) ** 2 + (this.spawnPos[1] - y) ** 2 + (this.spawnPos[2] - z - 0.5) ** 2 < 576) continue;
        if (!lvl.isEntityTicking(x, z)) continue;
        if (!data) {
          data = pickWeighted(this.mobsAt(cat, x, y, z), r);
          if (!data) break;
          tries = data.min + r.nextInt(1 + data.max - data.min);
        }
        // (Stage 5: ocean) vanilla isValidSpawnPostitionForType: not past its kind's despawn distance (fish: 64)
        if (d2 > despawnDistance(cat) ** 2) continue;
        // vanilla canSpawnMobAt: the pack's kind must be on the list where each one lands
        if (!this.mobsAt(cat, x, y, z).includes(data)) continue;
        const placeOk = this.placementOk(data.type, x, y, z);
        if (!placeOk || !this.checkSpawnRules(data.type, x, y, z)) continue;
        if (!this.withinSpawnBudget(data.type, x, y, z)) continue;
        const mob = createMob(data.type, lvl);
        if (!mob) return spawned;
        mob.moveTo(x + 0.5, y, z + 0.5, r.nextFloat() * 360, 0);
        mob.bodyYaw = mob.headYaw = mob.yaw;
        if (!this.noCollision(mob.bb)) continue;
        if (data.type !== 'squid' && (!mob.checkSpawnRules() || !mob.checkSpawnObstruction())) continue;
        mob.finalizeSpawn('natural', group);
        lvl.addEntity(mob);
        spawned++;
        inGroup++;
        if (spawned >= mob.maxSpawnClusterSize()) return spawned;
        void inGroup;
      }
    }
    return spawned;
  }

  /**
   * vanilla NaturalSpawner.mobsAt + ChunkGenerator.getMobsAt: the biome's list, but a fortress's own monsters inside
   * its pieces, and on nether bricks anywhere within its bounds (isInNetherFortressBounds)
   */
  private mobsAt(cat: MobCategory, x: number, y: number, z: number): SpawnerData[] {
    const w = this.level.world;
    if (cat === 'monster' && w.dim.id === 'the_nether') {
      const f = this.level.fortresses().at(x, y, z);
      if (f && (BLOCKS[STATE_BLOCK[w.getState(x, y - 1, z)]].name === 'nether_bricks' || f.pieces.some((p) => p.box.isInside(x, y, z)))) return FORTRESS_ENEMIES;
    }
    // (Stage 4: outposts) a structure's spawn_overrides, bounding_box full (game/outposts.ts)
    const so = outpostSpawnsAt(this.level, cat, x, y, z);
    if (so) return so;
    // a structure's spawn_overrides (bounding_box piece | full) where it stands (game/structureSpawns)
    const o = structureMobsAt(this.level, cat, x, y, z);
    if (o) return o;
    const bs = biomeSettings(w.getBiome3(x, y, z));
    // (Stage 5: ocean)
    if (cat === 'water_ambient' || cat === 'underground_water_creature' || cat === 'axolotls') return bs.more?.[cat] ?? [];
    return cat === 'monster' ? bs.monster : cat === 'water_creature' ? bs.water : cat === 'ambient' ? bs.ambient : bs.creature;
  }

  /** vanilla SpawnPlacements ON_GROUND: valid floor, two empty blocks */
  private isSpawnPositionOk(x: number, y: number, z: number, fireImmune = false): boolean {
    const w = this.level.world;
    return validSpawnBlock(this.level, x, y - 1, z, fireImmune) && isValidEmptySpawnBlock(w.getState(x, y, z)) && isValidEmptySpawnBlock(w.getState(x, y + 1, z));
  }

  /** vanilla SpawnPlacements: where each kind may appear (in water, in lava, else on the ground) */
  private placementOk(type: string, x: number, y: number, z: number): boolean {
    if (type === 'squid') return this.isInWaterPositionOk(x, y, z);
    if (type === 'drowned') return isInWaterPositionOk(this.level, x, y, z);
    // (Stage 5: ocean) vanilla SpawnPlacements: the guardian IN_WATER, and the fish, dolphins and glow squid
    if (type === 'guardian') return isInWaterPositionOk(this.level, x, y, z);
    if (IN_WATER.has(type)) return this.isInWaterPositionOk(x, y, z);
    if (type === 'strider') return fluidType(this.level.world.getState(x, y, z)) === FLUID_LAVA;
    return this.isSpawnPositionOk(x, y, z, FIRE_IMMUNE.has(type));
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

  /**
   * vanilla NaturalSpawner.SpawnState.canSpawn (PotentialCalculator): in a biome that charges for this kind of mob,
   * every mob already about that its own biome charges for repels it (charge over distance), and it spawns only
   * while the total stays in the budget; it keeps the soul sand valleys' and warped forests' crowds thin
   */
  private withinSpawnBudget(type: string, x: number, y: number, z: number): boolean {
    const w = this.level.world;
    const cost = biomeSettings(w.getBiome3(x, y, z)).costs?.[type];
    if (!cost) return true;
    let energy = 0;
    for (const e of this.level.entities) {
      // (vanilla leaves out mobs that never despawn)
      if (e.removed || !(e instanceof Mob) || e.persistenceRequired || e.requiresCustomPersistence()) continue;
      const c = biomeSettings(w.getBiome3(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))).costs?.[e.type];
      if (!c) continue;
      const d2 = (Math.floor(e.x) - x) ** 2 + (Math.floor(e.y) - y) ** 2 + (Math.floor(e.z) - z) ** 2;
      if (d2 === 0) return false;
      energy += c[0] / Math.sqrt(d2);
    }
    return energy * cost[0] <= cost[1];
  }

  private checkSpawnRules(type: string, x: number, y: number, z: number): boolean {
    const lvl = this.level;
    switch (type) {
      case 'squid':
        return WaterAnimal.checkSurfaceSpawn(lvl, x, y, z);
      case 'bat':
        return Bat.checkBatSpawnRules(lvl, x, y, z, this.rand);
      case 'slime': {
        const biome = BIOMES[lvl.world.getBiome3(x, y, z)]?.name ?? '';
        return Slime.checkSlimeSpawn(lvl, x, y, z, () => this.rand.nextFloat(), this.isSlimeChunk(x >> 4, z >> 4), SURFACE_SLIMES.has(biome), MOON_BRIGHTNESS[moonPhase(lvl.dayTime)]);
      }
      case 'magma_cube':
        return MagmaCube.checkMagmaCubeSpawn(lvl);
      case 'zombified_piglin':
        return ZombifiedPiglin.checkZombifiedPiglinSpawn(lvl, x, y, z);
      case 'husk':
        // vanilla Husk.checkHuskSpawnRules: a monster's rules, under the open sky
        return Monster.checkMonsterSpawn(lvl, x, y, z, () => this.rand.nextFloat()) && lvl.canSeeSky(x, y, z);
      case 'stray': {
        // vanilla Stray.checkStraySpawnRules: the same, but the sky is looked for from the top of any powder snow
        let top = y + 1;
        while (BLOCKS[STATE_BLOCK[lvl.world.getState(x, top, z)]].name === 'powder_snow') top++;
        return Monster.checkMonsterSpawn(lvl, x, y, z, () => this.rand.nextFloat()) && lvl.canSeeSky(x, top - 1, z);
      }
      case 'drowned': {
        // (vanilla #more_frequent_drowned_spawns: the rivers)
        const biome = BIOMES[lvl.world.getBiome3(x, y, z)]?.name ?? '';
        return drownedNaturalSpawnRules(lvl, x, y, z, biome === 'river' || biome === 'frozen_river', this.rand);
      }
      case 'wolf':
        return wolfSpawnRulesOk(lvl, x, y, z);
      case 'ocelot':
        // vanilla Ocelot.checkOcelotSpawnRules: one try in three fails
        return this.rand.nextInt(3) !== 0;
      case 'ghast':
        return Ghast.checkGhastSpawn(lvl, x, y, z, () => this.rand.nextFloat());
      case 'blaze':
        // vanilla Monster.checkAnyLightMonsterSpawnRules
        return lvl.difficulty !== 'peaceful';
      case 'strider':
        return Strider.checkStriderSpawn(lvl, x, y, z);
      case 'piglin':
        return Piglin.checkPiglinSpawn(lvl, x, y, z);
      // (Stage 4: outposts)
      case 'pillager':
        return checkPatrollingMonsterSpawnRules(lvl, x, y, z);
      // (Stage 5: ocean)
      case 'guardian':
        return checkGuardianSpawnRules(lvl, x, y, z, (n) => this.rand.nextInt(n));
      // vanilla SpawnPlacements: the fish and dolphins near the top of the sea (checkSurfaceWaterAnimalSpawnRules)
      case 'cod':
      case 'salmon':
      case 'pufferfish':
      case 'dolphin':
        return WaterAnimal.checkSurfaceSpawn(lvl, x, y, z);
      case 'tropical_fish':
        return TropicalFish.checkTropicalFishSpawn(lvl, x, y, z, BIOMES[lvl.world.getBiome3(x, y, z)]?.name ?? '');
      case 'glow_squid':
        return GlowSquid.checkSpawn(lvl, x, y, z);
      case 'hoglin':
        // vanilla Hoglin.checkHoglinSpawnRules: any light, just not on a nether wart block
        return BLOCKS[STATE_BLOCK[lvl.world.getState(x, y - 1, z)]].name !== 'nether_wart_block';
      case 'pig':
      case 'cow':
      case 'sheep':
      case 'chicken':
      case 'horse':
      case 'donkey':
      case 'mule':
      case 'llama':
      case 'trader_llama': {
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
      const group: SpawnGroup = {};
      let l = x0 + r.nextInt(16), i1 = z0 + r.nextInt(16);
      const j1 = l, k1 = i1;
      for (let l1 = 0; l1 < n; l1++) {
        let ok = false;
        for (let i2 = 0; !ok && i2 < 4; i2++) {
          const y = this.topNonColliding(l, i1);
          const mob = createMob(data.type, lvl);
          if (mob && y > MIN_Y && this.placementOk(data.type, l, y, i1)) {
            const f = mob.width;
            const d0 = Math.max(x0 + f, Math.min(x0 + 16 - f, l));
            const d1 = Math.max(z0 + f, Math.min(z0 + 16 - f, i1));
            mob.moveTo(d0, y, d1, r.nextFloat() * 360, 0);
            mob.bodyYaw = mob.headYaw = mob.yaw;
            if (this.noCollision(mob.bb) && this.checkSpawnRules(data.type, Math.floor(d0), y, Math.floor(d1)) && mob.checkSpawnRules() && mob.checkSpawnObstruction()) {
              mob.finalizeSpawn('chunk', group);
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

  /**
   * vanilla getTopNonCollidingPos (motion-blocking heightmap for ON_GROUND mobs); under a ceiling (the Nether) the
   * first thing solid or liquid below the first gap under the roof
   */
  private topNonColliding(x: number, z: number): number {
    const w = this.level.world;
    let y = w.heightAt(x, z);
    if (w.dim.hasCeiling) {
      do y--;
      while (y > MIN_Y && !(FLAGS[w.getState(x, y, z)] & F_AIR));
      do y--;
      while (y > MIN_Y && FLAGS[w.getState(x, y, z)] & F_AIR);
      return y;
    }
    // heightmap counts light-blocking blocks; step down through non-colliding plants
    while (y > MIN_Y + 1) {
      const st = w.getState(x, y - 1, z);
      if (COLLISION[st]?.length || FLAGS[st] & (F_WATER | F_LAVA)) break;
      y--;
    }
    return y;
  }
}


export { Animal };

// (Stage 5: ocean) the fish, the dolphin and the glow squid
Object.assign(MOB_TYPES, {
  cod: (l: Level) => new Cod(l),
  salmon: (l: Level) => new Salmon(l),
  pufferfish: (l: Level) => new Pufferfish(l),
  tropical_fish: (l: Level) => new TropicalFish(l),
  dolphin: (l: Level) => new Dolphin(l),
  glow_squid: (l: Level) => new GlowSquid(l),
});
Object.assign(ENTITY_NAMES, { cod: 'Cod', salmon: 'Salmon', pufferfish: 'Pufferfish', tropical_fish: 'Tropical Fish', dolphin: 'Dolphin', glow_squid: 'Glow Squid' });
/** (Stage 5: ocean) vanilla SpawnPlacements IN_WATER: these spawn in water (the squid's and the guardian's are above) */
const IN_WATER = new Set(['cod', 'salmon', 'pufferfish', 'tropical_fish', 'dolphin', 'glow_squid']);
