// Level: the running game world (blocks + entities + time + weather).

import { DEFAULT_GAME_RULES, GameRules } from './gameRules';
import { FurnaceBlockEntity, SpawnerBlockEntity } from '../world/blockEntity';
import { tickSpawner } from './baseSpawner';
import type { ItemStack } from '../item/item';
import type { FireworkExplosion } from '../item/fireworks';
import { World } from '../world/world';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import type { Villager } from '../entity/villager';
import type { Merchant } from '../entity/trading';
import { LivingEntity } from '../entity/living';
import { Rand } from '../core/rng';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATERLOGGED, S } from '../world/block';
import { canSurvive, blockDrops, isDripstoneFacing, dripleafTick } from './blockRules';
import { updateShape, hasShapeUpdates } from './shapeUpdates';
import { isRail, railOnPlace, railNeighborChanged } from './rails';
import { fireTick } from './fire';
import { tickSleeping } from './sleep';
import { ItemEntity } from '../entity/itemEntity';
import { ExperienceOrb } from '../entity/xpOrb';
import type { Item } from '../item/item';
import { FluidTicker, fluidStateOf } from './fluidTicks';
import { RandomTicker } from './randomTicks';
import { FallingBlockEntity } from '../entity/fallingBlock';
import { LightningBolt } from '../entity/lightning';
import { isSolidBlock } from '../world/gen/patches';
import { MIN_Y, MAX_Y } from '../world/constants';
import { levelOf } from '../item/enchantHelper';
import { F_WATER, F_LAVA, F_REPLACEABLE } from '../world/block';
import { skyDarkenInt, timeOfDay } from '../render/environment';
import { BIOMES } from '../world/gen/biomes';
import { coldEnoughToSnow } from '../world/gen/temperature';
import { AABB } from '../core/aabb';
import type { DimensionType } from '../world/dimension';
import { NetherGenerator } from '../world/gen/nether';
import { villageLocator, type Villages } from '../world/gen/villages';
import type { TamableAnimal } from '../entity/tamable';
import { strongholdLocator, type Strongholds } from '../world/gen/stronghold';
import type { NetherFortresses } from '../world/gen/fortress';
import type { EndDragonFight } from './endDragonFight';
import { behaviorOf } from './blockBehavior';
import { NeighborUpdater } from './neighborUpdater';
import { LevelTicks } from './ticks';
import { PoiManager } from './poi';
import './redstone/components';
import { isConductor } from './redstone/signal';
import { DX, DY, DZ, OPPOSITE, type Dir } from '../world/dir';
import { hasAnalogOutput } from './redstone/comparator';
import './villageBlocks';
import './banners';
import './maps';
// (Stage 4: the shield, raising it and decorating it; advancements met out in the world)
import './shields';
import type { Criterion, TriggerPayload } from './advancements';
import './endPortal';
import './infestedBlocks';
import './golems';
import './potionItems';
import './potionEffects';
// (Stage 4: raids)
import { Raids } from './raids';
// (Stage 5: ocean)
import './ocean';
// (M9: frogs) frogspawn hatching
import './frogspawn';
// (temples)
import './archaeology';
// (desert wells: their loot, the suspicious stew)
import './desertWells';
// (the deep dark: sculk and its kin, candles)
import './sculk';
import './candles';
// (the deep dark: game events and the listeners that hear them)
import { postGameEvent } from './gameEventDispatcher';
import type { GameEventName, GameEventContext } from './gameEvents';
// (trial chambers) copper weathering, waxing and scraping, the copper bulb and the lightning rod
import { findLightningRod } from './copper';
// (trial chambers) the trial spawner and the vault
import './trialChambers';
// (jukebox)
import './jukebox';
// (powder snow)
import './powderSnow';
// (Frost Walker) frosted ice, and the magma block's hot floor
import './frostWalker';
// (the lodestone compass)
import './lodestoneCompass';
// (signs) placing, editing, dyeing and waxing signs and hanging signs
import './signs';
// (ender chests) opening onto the player's own slots, its lid, its drops
import './enderChest';
// (cake) eating it, candles in it, the candle cakes lit and put out
import './cake';

export interface SoundSink {
  play(name: string, x: number, y: number, z: number, volume?: number, pitch?: number): void;
  playUI(name: string, volume?: number, pitch?: number): void;
  /**
   * a sound for `p`'s ears only (vanilla ServerPlayer.connection.send(ClientboundSoundPacket)): without it, only this
   * game's own player hears such sounds, through `play`
   */
  playTo?(p: Player, name: string, x: number, y: number, z: number, volume?: number, pitch?: number): void;
  /** (jukebox) vanilla LevelRenderer.playJukeboxSong / stopJukeboxSong: a jukebox's song, by the jukebox's position */
  playJukeboxSong?(event: string, x: number, y: number, z: number): void;
  stopJukeboxSong?(x: number, y: number, z: number): void;
}

export interface ParticleSink {
  blockBreak(x: number, y: number, z: number, state: number): void;
  blockHit(x: number, y: number, z: number, state: number, face: number): void;
  /** entity death smoke (vanilla makePoofParticles) */
  poof?(e: Entity): void;
  /** generic sprite particle by vanilla particle type name */
  spawn?(kind: string, x: number, y: number, z: number, dx: number, dy: number, dz: number): void;
  /** vanilla TrackingEmitter (crit sparks around an entity) */
  emitAround?(kind: 'crit' | 'enchanted_hit' | 'totem_of_undying', e: Entity, lifetime?: number): void;
  /** vanilla FallingDustParticle tinted with a block's dust colour */
  fallingDust?(x: number, y: number, z: number, color: number): void;
  /** vanilla BLOCK particle (TerrainParticle with a starting speed) for the block at bx, by, bz */
  blockParticle?(x: number, y: number, z: number, xd: number, yd: number, zd: number, state: number, bx: number, by: number, bz: number): void;
  /** (trial chambers) vanilla DUST_PILLAR (TerrainParticle.DustPillarProvider): a speck of the block at bx, by, bz shot up at about `yd` (a mace's smash) */
  dustPillar?(x: number, y: number, z: number, yd: number, state: number, bx: number, by: number, bz: number): void;
  /** vanilla ENTITY_EFFECT (SpellParticle) swirl in an effect colour; alpha 38/255 for ambient effects */
  entityEffect?(x: number, y: number, z: number, color: number, alpha: number): void;
  /** vanilla DUST (DustParticle): a coloured speck, as powered redstone gives off */
  dust?(x: number, y: number, z: number, r: number, g: number, b: number, scale: number): void;
  /** vanilla EFFECT / INSTANT_EFFECT (SpellParticle) in a colour, flung out by `power` (a splash potion's burst) */
  spell?(kind: 'effect' | 'instant_effect' | 'witch', x: number, y: number, z: number, xd: number, yd: number, zd: number, r: number, g: number, b: number, power?: number): void;
  /** vanilla VIBRATION (VibrationSignalParticle): from (x, y, z) to wherever `target` is, arriving in `ticks` */
  vibration?(x: number, y: number, z: number, target: () => [number, number, number] | null, ticks: number): void;
  /** vanilla SHRIEK (ShriekParticle): a ring rising from a shrieker, `delay` ticks from now */
  shriek?(x: number, y: number, z: number, delay: number): void;
  /** vanilla SCULK_CHARGE (SculkChargeParticle): a charge's glow on a face, turned `roll` */
  sculkCharge?(x: number, y: number, z: number, xd: number, yd: number, zd: number, roll: number): void;
  /** vanilla DUST_COLOR_TRANSITION (DustColorTransitionParticle): a speck going from one colour to another */
  dustTransition?(x: number, y: number, z: number, xd: number, yd: number, zd: number, from: [number, number, number], to: [number, number, number], scale: number): void;
  /** (fireworks) vanilla ClientLevel.createFireworks for a rocket with stars: their burst (render/fireworkParticles.ts) */
  fireworks?(x: number, y: number, z: number, xd: number, yd: number, zd: number, explosions: readonly FireworkExplosion[]): void;
}

/** vanilla Block.UPDATE_NEIGHBORS: setBlock tells the six neighbours (neighborChanged) */
export const UPDATE_NEIGHBORS = 1;
/** vanilla Block.UPDATE_CLIENTS */
export const UPDATE_CLIENTS = 2;
/** vanilla Block.UPDATE_KNOWN_SHAPE: setBlock leaves the neighbours' shapes (connections, support) alone */
export const UPDATE_KNOWN_SHAPE = 16;
/** vanilla Block.UPDATE_ALL */
export const UPDATE_ALL = UPDATE_NEIGHBORS | UPDATE_CLIENTS;
/** vanilla Block.UPDATE_MOVE_BY_PISTON: onRemove and onPlace hear that a piston is moving the block (isMoving) */
export const UPDATE_MOVE_BY_PISTON = 64;

/**
 * a vanilla chunk ticket besides the player's and the dragon fight's (an end gateway's way out, the far side of one):
 * the chunks `load` round chunk (cx, cz) kept loaded and those `ticking` round it with their entities ticking (-1:
 * none), till game time `until`
 */
export interface ChunkTicket {
  cx: number;
  cz: number;
  load: number;
  ticking: number;
  until: number;
}

/** the scheduled ticks that predate the block-behaviour ones (fluids, falling blocks, fire, dripleaves): one per position */
const LEGACY_TICK = -1;

const NULL_SOUND: SoundSink = { play() {}, playUI() {} };
const NULL_PARTICLES: ParticleSink = { blockBreak() {}, blockHit() {} };

export class Level {
  readonly world: World;
  readonly entities: Entity[] = [];
  /**
   * this game's own player (the one at the keyboard): the camera, the HUD, the sounds heard. Everything that reacts to
   * players out in the world asks `players()` instead, which has everyone in the level (vanilla ServerLevel.players)
   */
  player!: Player;
  /** the players among `entities`, in the order they came, leaving with them (vanilla ServerLevel.players) */
  private readonly playerList: Player[] = [];
  /**
   * vanilla Level.isClientSide: a guest's copy of the host's level, which only shows what the host sends (net/);
   * nothing here changes its blocks, schedules ticks, adds entities or sends game events — the host does all that
   */
  isClientSide = false;
  gameTime = 0;
  dayTime = 0;
  doDaylightCycle = true;
  rain = 0;
  rainO = 0;
  thunder = 0;
  thunderO = 0;
  raining = false;
  thundering = false;
  rainTime = 0;
  thunderTime = 0;
  clearWeatherTime = 0;
  skyFlash = 0;
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard' = 'normal';
  seed: string;
  sound: SoundSink = NULL_SOUND;
  particles: ParticleSink = NULL_PARTICLES;
  readonly random = new Rand(1234);
  private netherFortresses: NetherFortresses | null = null;
  private overworldVillages: Villages | null = null;
  private overworldStrongholds: Strongholds | null = null;
  readonly fluids: FluidTicker;
  readonly randomTicks: RandomTicker;
  /** scheduled block ticks (vanilla LevelTicks) */
  private readonly blockTicks = new LevelTicks();
  /** vanilla ServerLevel.blockEvents: block events waiting for this tick's turn (a piston's push or pull), in order, once each */
  private readonly blockEvents = new Map<string, [number, number, number, number, number, number]>();
  /** vanilla ServerLevel.handlingTick: in the scheduled ticks and block events of a tick */
  handlingTick = false;
  /** vanilla Level.neighborUpdater */
  private readonly neighborUpdater = new NeighborUpdater({
    runNeighborChanged: (x, y, z, source, fx, fy, fz, moving) => {
      const st = this.world.getState(x, y, z);
      behaviorOf(st)?.neighborChanged?.(this, x, y, z, st, source, fx, fy, fz, moving);
    },
  });
  simulationDistance = 8;
  gameRules: GameRules = { ...DEFAULT_GAME_RULES };
  /** vanilla ServerLevel.getPoiManager: the beds, workstations and bells villagers claim */
  readonly poi: PoiManager;
  /** vanilla ServerLevel.dragonFight: the End's (game/endDragonFight.ts), null elsewhere */
  dragonFight: EndDragonFight | null = null;
  /** (Stage 4: raids) vanilla ServerLevel.raids (game/raids.ts) */
  readonly raids: Raids = new Raids(this);
  /** chunk tickets by name (the game keeps what they name loaded) */
  readonly tickets = new Map<string, ChunkTicket>();
  /**
   * entities on their way through a portal whose far side is still loading (an end gateway's): held where they
   * went in, not ticking, till `arrive` has put them there (true)
   */
  readonly inTransit = new Map<Entity, () => boolean>();

  constructor(world: World, seed: string) {
    this.fluids = new FluidTicker(this);
    this.randomTicks = new RandomTicker(this);
    this.world = world;
    this.poi = new PoiManager(world);
    world.onTypeChanged = (x, y, z, old, now) => this.poi.changed(x, y, z, old, now);
    // (vanilla BlockEntity.setChanged: a container's contents changed, so may what a comparator reads)
    world.onBlockEntityChanged = (be) => {
      if (this.isClientSide) return;
      const st = world.getState(be.x, be.y, be.z);
      if (!(FLAGS[st] & F_AIR)) this.updateNeighbourForOutputSignal(be.x, be.y, be.z, STATE_BLOCK[st]);
    };
    this.seed = seed;
    this.rainTime = 12000 + this.random.nextInt(168000);
    this.thunderTime = 12000 + this.random.nextInt(168000);
  }

  /** the Nether's fortresses, laid out just as the chunk workers build them */
  fortresses(): NetherFortresses {
    return (this.netherFortresses ??= new NetherGenerator(this.seed).fortresses);
  }

  /** the Overworld's villages, placed just as the chunk workers place them (for /locate) */
  villages(): Villages {
    return (this.overworldVillages ??= villageLocator(this.seed));
  }

  /** the Overworld's strongholds, placed and laid out just as the chunk workers do (eyes of ender, /locate, Eye Spy) */
  strongholds(): Strongholds {
    return (this.overworldStrongholds ??= strongholdLocator(this.seed));
  }

  addEntity(e: Entity): void {
    if (this.isClientSide) return;
    this.entities.push(e);
    if (e.type === 'player' && !this.playerList.includes(e as Player)) this.playerList.push(e as Player);
    // vanilla addFreshEntityWithPassengers: riders loaded with their vehicle come along
    for (const p of e.passengers) if (!this.entities.includes(p)) this.addEntity(p);
  }

  /**
   * on a guest (`isClientSide`): an entity it shows, as the host sent it, or its own player (which `addEntity` won't
   * take there)
   */
  addMirrorEntity(e: Entity): void {
    this.entities.push(e);
    if (e.type === 'player' && !this.playerList.includes(e as Player)) this.playerList.push(e as Player);
  }

  /**
   * vanilla ServerLevel.players: everyone in this level, in the order they came, `player` among them (first, if it
   * never came in as an entity; whether removed or not, as before there were others)
   */
  players(): readonly Player[] {
    const list = this.playerList, own = this.player;
    let whole = !own || list.includes(own);
    for (let i = 0; whole && i < list.length; i++) if (list[i].removed) whole = false;
    if (whole) return list;
    const out = list.filter((p) => !p.removed);
    if (own && !out.includes(own)) out.unshift(own);
    return out;
  }

  /**
   * vanilla EntityGetter.getNearestPlayer(x, y, z, distance, predicate): the nearest player (the first of equals)
   * that `test` accepts, closer than `max` (any distance when negative)
   */
  nearestPlayer(x: number, y: number, z: number, max = -1, test?: (p: Player) => boolean): Player | null {
    let best: Player | null = null;
    let bestD = -1;
    for (const p of this.players()) {
      if (test && !test(p)) continue;
      const d = p.distanceToSqr(x, y, z);
      if ((max < 0 || d < max * max) && (bestD === -1 || d < bestD)) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** the players closer than `max` to (x, y, z) that `test` accepts, in `players()` order */
  playersNear(x: number, y: number, z: number, max: number, test?: (p: Player) => boolean): Player[] {
    const out: Player[] = [];
    for (const p of this.players()) if ((!test || test(p)) && p.distanceToSqr(x, y, z) < max * max) out.push(p);
    return out;
  }

  /** vanilla EntityGetter.hasNearbyAlivePlayer: a player not spectating, alive, closer than `max` (any when negative) */
  hasNearbyAlivePlayer(x: number, y: number, z: number, max: number): boolean {
    for (const p of this.players()) {
      if (p.gameMode === 'spectator' || !p.isAlive) continue;
      if (max < 0 || p.distanceToSqr(x, y, z) < max * max) return true;
    }
    return false;
  }

  /**
   * vanilla ServerLevel.getRandomPlayer (and PatrolSpawner's players().get(random.nextInt(n))): one of the players `test`
   * accepts, drawn with `random`; a lone player is taken as it is, with no draw, as before there were others
   */
  randomPlayer(test?: (p: Player) => boolean): Player | null {
    const all = this.players();
    if (all.length <= 1) return all[0] ?? null;
    const list = test ? all.filter(test) : all;
    return list.length ? list[this.random.nextInt(list.length)] : null;
  }

  /** a sound only `p` hears (vanilla ServerPlayer.connection.send(ClientboundSoundPacket)) */
  playSoundTo(p: Player, name: string, x: number, y: number, z: number, volume = 1, pitch = 1): void {
    if (this.sound.playTo) this.sound.playTo(p, name, x, y, z, volume, pitch);
    else if (p === this.player) this.sound.play(name, x, y, z, volume, pitch);
  }

  /** vanilla ServerLevel.getEntity(uuid), among the players */
  playerByUuid(uuid: string): Player | null {
    for (const p of this.players()) if (p.uuid === uuid) return p;
    return null;
  }

  /** entities whose bounding box intersects `box` */
  getEntities(box: AABB, filter?: (e: Entity) => boolean, except?: Entity | null): Entity[] {
    const out: Entity[] = [];
    let dragons = false;
    for (const e of this.entities) {
      if (e.removed || e === except) continue;
      if ((e as { subEntities?: Entity[] }).subEntities) dragons = true;
      if (!e.bb.intersects(box)) continue;
      if (filter && !filter(e)) continue;
      out.push(e);
    }
    // vanilla Level.getEntities: the ender dragon's parts come after, wherever the dragon's own box is (not those of
    // `except`'s own dragon)
    if (dragons)
      for (const e of this.entities) {
        const parts = (e as { subEntities?: Entity[] }).subEntities;
        if (!parts || e.removed || e === except) continue;
        for (const p of parts) if (p !== except && p.bb.intersects(box) && (!filter || filter(p))) out.push(p);
      }
    return out;
  }

  /**
   * vanilla Level.gameEvent: `event` happened at (x, y, z), by `ctx.entity` (to `ctx.state`); the sculk sensors,
   * shriekers, catalysts and wardens round about may hear it (game/gameEventDispatcher.ts)
   */
  gameEvent(event: GameEventName, x: number, y: number, z: number, ctx: GameEventContext = {}): void {
    if (this.isClientSide) return;
    postGameEvent(this, event, x, y, z, ctx);
  }

  /** vanilla ExperienceOrb.award: split into orb sizes */
  awardExperience(x: number, y: number, z: number, amount: number): void {
    while (amount > 0) {
      const v = ExperienceOrb.valueFor(amount);
      amount -= v;
      this.addEntity(new ExperienceOrb(this, x, y, z, v));
    }
  }

  /** vanilla Level.skyDarken (0..11), refreshed every tick */
  skyDarken = 0;

  updateSkyBrightness(): void {
    this.skyDarken = skyDarkenInt(timeOfDay(this.skyTime()), { rain: this.rainLevel(1), thunder: this.thunderLevel(1), flash: 0 });
  }

  /** the dimension this level's chunks are in */
  get dim(): DimensionType {
    return this.world.dim;
  }

  /** the time of day the sky shows (vanilla fixed_time: always midnight in the Nether) */
  skyTime(): number {
    return this.world.dim.fixedTime ?? this.dayTime;
  }

  /** vanilla Level.isDay: never in a dimension with a fixed time */
  isDay(): boolean {
    return this.world.dim.fixedTime === null && this.skyDarken < 4;
  }

  /** the player went to another dimension: what was here was saved and unloaded with its chunks */
  resetForDimension(): void {
    this.tickets.clear();
    this.inTransit.clear();
    const keep: Entity[] = this.player ? [this.player] : [];
    for (const e of this.entities) if (!keep.includes(e)) e.removed = true;
    this.entities.length = 0;
    this.entities.push(...keep);
    this.playerList.length = 0;
    if (this.player) this.playerList.push(this.player);
    this.blockTicks.clear();
    this.skyFlash = 0;
    // (the overworld's weather carried on meanwhile: back under the sky it's as it is, not fading in)
    if (this.world.dim.hasSkyLight) {
      this.rain = this.rainO = this.raining ? 1 : 0;
      this.thunder = this.thunderO = this.thundering ? 1 : 0;
    }
  }

  /** vanilla getMaxLocalRawBrightness: max(sky - skyDarken, block) */
  rawBrightness(x: number, y: number, z: number, darken = this.skyDarken): number {
    const l = this.world.getLight(x, y, z);
    return Math.max((l >> 4) - darken, l & 15);
  }

  /** vanilla getLightLevelDependentMagicValue: the dimension's ambient light lifts the dark */
  brightness(x: number, y: number, z: number): number {
    const f = this.rawBrightness(x, y, z) / 15;
    const g = f / (4 - 3 * f);
    const a = this.world.dim.ambientLight;
    return g + a * (1 - g);
  }

  /** vanilla canSeeSky: full sky light (none at all where there's no sky) */
  canSeeSky(x: number, y: number, z: number): boolean {
    return this.world.dim.hasSkyLight && y >= this.world.heightAt(x, z);
  }

  isRaining(): boolean {
    return this.rainLevel(1) > 0.2;
  }

  isThundering(): boolean {
    return this.thunderLevel(1) > 0.9;
  }

  /** vanilla isRainingAt: raining, open to the sky, and warm enough to rain (not snow) */
  isRainingAt(x: number, y: number, z: number): boolean {
    if (!this.isRaining() || !this.canSeeSky(x, y, z)) return false;
    const b = BIOMES[this.world.getBiome(x, z)];
    if (!b || !b.precipitation) return false;
    return !coldEnoughToSnow(b.temperature, !!b.frozen, x, y, z);
  }

  /** vanilla Level.randValue: the cheap LCG behind getBlockRandomPos */
  private randValue = (Math.random() * 0x7fffffff) | 0;

  /** vanilla ServerLevel.tickChunk "thunder": in a thunderstorm one chunk in 100000 is struck each tick */
  tickThunder(cx: number, cz: number): void {
    if (!this.isRaining() || !this.isThundering() || this.random.nextInt(100000) !== 0) return;
    this.randValue = (Math.imul(this.randValue, 3) + 1013904223) | 0;
    const i = this.randValue >> 2;
    const [x, y, z] = this.findLightningTargetAround(cx * 16 + (i & 15), cz * 16 + ((i >> 8) & 15));
    if (!this.isRainingAt(x, y, z)) return;
    // (the skeleton trap's visual-only bolt waits for horses)
    const bolt = new LightningBolt(this);
    bolt.moveTo(x + 0.5, y, z + 0.5);
    this.addEntity(bolt);
  }

  /**
   * vanilla ServerLevel.tickPrecipitation: in the cold, still water at the edge of open water freezes over (rain
   * or shine), and while it's snowing a layer of snow settles on whatever will hold it
   */
  tickPrecipitation(cx: number, cz: number): void {
    this.randValue = (Math.imul(this.randValue, 3) + 1013904223) | 0;
    const i = this.randValue >> 2;
    const x = cx * 16 + (i & 15), z = cz * 16 + ((i >> 8) & 15);
    const y = this.motionBlockingHeight(x, z);
    const b = BIOMES[this.world.getBiome(x, z)];
    if (!b) return;
    if (this.shouldFreeze(b.temperature, !!b.frozen, x, y - 1, z)) this.setBlock(x, y - 1, z, S('ice'));
    if (!this.isRaining()) return;
    const h = Number(this.gameRules.snowAccumulationHeight);
    if (h > 0 && this.shouldSnow(b.temperature, !!b.frozen, x, y, z)) {
      const st = this.world.getState(x, y, z);
      const sb = BLOCKS[STATE_BLOCK[st]];
      if (sb.name === 'snow') {
        const layers = sb.get<number>(st, 'layers');
        if (layers < Math.min(h, 8)) {
          // (vanilla Block.pushEntitiesUp: whatever stood in the snow now stands on it)
          const top = y + (layers * 2) / 16;
          for (const e of this.getEntities(new AABB(x, y, z, x + 1, top, z + 1))) if (e.y < top) e.moveTo(e.x, top, e.z);
          this.setBlock(x, y, z, sb.with(st, 'layers', layers + 1));
        }
      } else this.setBlock(x, y, z, S('snow'));
    }
    // (cauldrons catching the rain or snow: no cauldrons yet)
  }

  /** vanilla Biome.shouldFreeze(level, pos, true): a still water source, dim, cold, at the edge of open water */
  private shouldFreeze(base: number, frozen: boolean, x: number, y: number, z: number): boolean {
    if (y < MIN_Y || y >= MAX_Y || !coldEnoughToSnow(base, frozen, x, y, z)) return false;
    const w = this.world;
    if ((w.getLight(x, y, z) & 15) >= 10) return false;
    const st = w.getState(x, y, z);
    const wb = BLOCKS[STATE_BLOCK[st]];
    if (wb.name !== 'water' || wb.get<number>(st, 'level') !== 0) return false;
    const wet = (a: number, c: number) => (FLAGS[w.getState(a, y, c)] & F_WATER) !== 0;
    return !(wet(x - 1, z) && wet(x + 1, z) && wet(x, z - 1) && wet(x, z + 1));
  }

  /** vanilla Biome.shouldSnow: cold, dim, open air (or snow) where a snow layer could lie */
  private shouldSnow(base: number, frozen: boolean, x: number, y: number, z: number): boolean {
    if (y < MIN_Y || y >= MAX_Y || !coldEnoughToSnow(base, frozen, x, y, z)) return false;
    const w = this.world;
    if ((w.getLight(x, y, z) & 15) >= 10) return false;
    const st = w.getState(x, y, z);
    if (!(FLAGS[st] & F_AIR) && BLOCKS[STATE_BLOCK[st]].name !== 'snow') return false;
    return canSurvive(w, x, y, z, S('snow'));
  }

  /** vanilla findLightningTargetAround: the top of the column, or something alive under the open sky close by */
  private findLightningTargetAround(x: number, z: number): [number, number, number] {
    let y = this.motionBlockingHeight(x, z);
    // (trial chambers) a lightning rod within 128 blocks draws it
    const rod = findLightningRod(this, x, y, z);
    if (rod) return rod;
    const box = new AABB(x - 3, y - 3, z - 3, x + 4, MAX_Y + 4, z + 4);
    const list = this.getEntities(box, (e) => e instanceof LivingEntity && e.isAlive && this.canSeeSky(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)));
    if (list.length) {
      const e = list[this.random.nextInt(list.length)];
      return [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
    }
    if (y === MIN_Y - 1) y += 2;
    return [x, y, z];
  }

  /** vanilla Heightmap.Types.MOTION_BLOCKING: above the highest block that stops movement or holds a fluid */
  motionBlockingHeight(x: number, z: number): number {
    const w = this.world;
    for (let y = w.heightAt(x, z) - 1; y >= MIN_Y; y--) {
      const st = w.getState(x, y, z);
      if (FLAGS[st] & (F_WATER | F_LAVA)) return y + 1;
      if (isSolidBlock(st)) {
        const n = BLOCKS[STATE_BLOCK[st]].name;
        if (n !== 'cobweb' && n !== 'bamboo_sapling') return y + 1;
      }
    }
    return MIN_Y;
  }


  /** called for every entity tick (spawner despawn checks etc.) */
  onEntityTick: ((e: Entity) => void) | null = null;
  /** a living entity died (advancements: kills, deaths) */
  onEntityDied: ((victim: LivingEntity, source: string, attacker: Entity | null) => void) | null = null;
  /** animals bred (the child, and who fed them) */
  onBred: ((child: Entity, cause: Entity | null) => void) | null = null;
  /** a player tamed an animal (vanilla CriteriaTriggers.TAME_ANIMAL) */
  onTamed: ((animal: Entity & { variantId(): string | undefined }, by: Entity) => void) | null = null;
  /** a tame animal died; its owner is told how (vanilla TamableAnimal.die) */
  onTamedDeath: ((animal: TamableAnimal, source: string) => void) | null = null;
  /** an arrow player `p` shot hurt something (vanilla "Take Aim") */
  onPlayerArrowHit: ((target: Entity, p: Player) => void) | null = null;
  /** a trident player `p` threw hurt something (vanilla "A Throwaway Joke") */
  onPlayerTridentHit: ((target: Entity, p: Player) => void) | null = null;
  /** lightning player `p`'s channeling trident called down struck these (vanilla channeled_lightning) */
  onChanneledLightning: ((victims: Entity[], p: Player) => void) | null = null;
  /** vanilla LivingEntity.take: something alive picked up an item, arrow or orb (the pop, and it flying to them) */
  onTake: ((e: Entity, taker: LivingEntity, amount: number) => void) | null = null;
  /** a mob picked up an item a player had thrown (vanilla thrown_item_picked_up_by_entity) */
  onThrownItemPickedUp: ((stack: ItemStack, by: Entity) => void) | null = null;
  /** a villager or a wandering trader opened its trading screen for a player (vanilla Merchant.openTradingScreen) */
  onOpenMerchant: ((v: Merchant, p: Player) => void) | null = null;
  /** the night slept through: everyone is about to be woken (vanilla ServerLevel.wakeUpAllPlayers, game/sleep.ts) */
  onWakeUpAll: (() => void) | null = null;
  /** a crossbow arrow player `p` shot killed something: all it has killed so far (vanilla killed_by_crossbow) */
  onPlayerCrossbowKill: ((killed: Entity[], p: Player) => void) | null = null;
  /** an entity's time in a portal came up (the portal block it was in, and which kind) */
  onPortal: ((e: Entity, x: number, y: number, z: number, kind: 'nether' | 'end' | 'end_gateway') => void) | null = null;
  /** a player cured a zombie villager (vanilla cured_zombie_villager) */
  onCuredZombieVillager: ((p: Player, v: Villager) => void) | null = null;
  /** a golem someone built came to life (vanilla CarvedPumpkinBlock.spawnGolemInWorld: summoned_entity) */
  onSummonedEntity: ((e: Entity) => void) | null = null;
  /** (Stage 4) a player's advancement criterion met out in the world: a shield's block, a totem, a raid (vanilla CriteriaTriggers.*.trigger) */
  onPlayerTrigger: ((p: Player, type: Criterion['t'], payload?: TriggerPayload) => void) | null = null;

  /**
   * vanilla LevelRenderer.destructionProgress: the cracks shown on blocks something other than the player is breaking
   * (a zombie at a door), by the breaker's id, with when each was last changed
   */
  readonly destroyProgress = new Map<number, { x: number; y: number; z: number; stage: number; time: number }>();

  /** vanilla Level.destroyBlockProgress: breaker `id` has cracked a block to `stage` (0-9); anything else clears it */
  destroyBlockProgress(id: number, x: number, y: number, z: number, stage: number): void {
    if (stage >= 0 && stage < 10) this.destroyProgress.set(id, { x, y, z, stage, time: this.gameTime });
    else this.destroyProgress.delete(id);
    this.onDestroyBlockProgress?.(id, x, y, z, stage);
  }

  /** a crack changed (vanilla ServerLevel.destroyBlockProgress sends it to the players near: net/) */
  onDestroyBlockProgress: ((id: number, x: number, y: number, z: number, stage: number) => void) | null = null;

  /** vanilla: entities tick only inside the simulation distance (and in loaded chunks) */
  isEntityTicking(x: number, z: number): boolean {
    const bx = Math.floor(x), bz = Math.floor(z);
    if (!this.world.isLoaded(bx, bz)) return false;
    // (vanilla TicketType.DRAGON: the dragon fight keeps the island's middle ticking while a player is near)
    if (this.dragonFight?.ticksChunk(bx >> 4, bz >> 4)) return true;
    for (const t of this.tickets.values()) if (Math.abs((bx >> 4) - t.cx) <= t.ticking && Math.abs((bz >> 4) - t.cz) <= t.ticking) return true;
    // (vanilla ChunkMap.anyPlayerCloseEnoughForSpawning: within the simulation distance of any player)
    const players = this.players();
    if (!players.length) return true;
    const r = this.simulationDistance;
    for (const p of players) {
      const dx = (bx >> 4) - (Math.floor(p.x) >> 4), dz = (bz >> 4) - (Math.floor(p.z) >> 4);
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= r) return true;
    }
    return false;
  }

  tick(): void {
    this.gameTime++;
    if (this.doDaylightCycle) this.dayTime++;
    if (this.gameRules.doWeatherCycle) this.tickWeather();
    else this.tickWeatherLevels();
    tickSleeping(this);
    this.updateSkyBrightness();
    // (Stage 4: raids) vanilla ServerLevel.tick: the raids, before the entities
    this.raids.tick();
    // (vanilla ServerLevel.tick: the dragon fight just before the entities)
    this.dragonFight?.tick();
    for (const [k, t] of this.tickets) if (t.until <= this.gameTime) this.tickets.delete(k);
    for (const [e, arrive] of this.inTransit) if (e.removed || arrive()) this.inTransit.delete(e);
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.removed || e.vehicle || this.inTransit.has(e)) continue;
      // (vanilla LocalPlayer.tick: the player stays put while the chunk they're in hasn't come, after a /tp far off)
      if (e.type === 'player' ? !this.world.isLoaded(Math.floor(e.x), Math.floor(e.z)) : !this.isEntityTicking(e.x, e.z)) continue;
      e.tick();
      if (!e.removed) this.onEntityTick?.(e);
      if (e.passengers.length) this.tickPassengers(e);
    }
    this.pruneRemoved();
    if (this.skyFlash > 0) this.skyFlash--;
    this.handlingTick = true;
    this.runScheduledTicks();
    this.randomTicks.tickAround(this.players(), this.simulationDistance);
    this.runBlockEvents();
    this.handlingTick = false;
    // block entities (furnaces, spawners, the enchanting table's book)
    for (const be of this.world.blockEntities.values()) {
      if (be.removed) continue;
      if (be instanceof SpawnerBlockEntity) {
        if (this.isEntityTicking(be.x, be.z)) tickSpawner(be, this);
        continue;
      }
      if (!(be instanceof FurnaceBlockEntity)) {
        be.tick(this);
        continue;
      }
      const lit = be.isLit, cook = be.cookingProgress;
      be.tick(this);
      if (lit || cook || be.isLit) {
        const c = this.world.getChunk(be.x >> 4, be.z >> 4);
        if (c) c.modified = true;
      }
    }
  }

  /** the entities (and players) that were removed are let go (each tick, after they've all ticked; a guest's too) */
  pruneRemoved(): void {
    let w = 0;
    for (let i = 0; i < this.entities.length; i++) if (!this.entities[i].removed) this.entities[w++] = this.entities[i];
    this.entities.length = w;
    w = 0;
    for (let i = 0; i < this.playerList.length; i++) if (!this.playerList[i].removed) this.playerList[w++] = this.playerList[i];
    this.playerList.length = w;
  }

  /** vanilla ServerLevel.tickPassenger: riders tick after their vehicle, then sit back in their seat */
  private tickPassengers(v: Entity): void {
    for (const p of [...v.passengers]) {
      if (p.removed || p.vehicle !== v) {
        p.stopRiding();
        continue;
      }
      p.rideTick();
      if (!p.removed) this.onEntityTick?.(p);
      if (p.passengers.length) this.tickPassengers(p);
    }
  }

  /** a tick for whatever is at (x, y, z) in `delay` ticks: fluids flowing, blocks falling, fire spreading */
  scheduleTick(x: number, y: number, z: number, delay: number): void {
    if (this.isClientSide) return;
    this.blockTicks.schedule(x, y, z, LEGACY_TICK, this.gameTime + delay);
  }

  /** vanilla Level.scheduleTick(pos, block, delay, priority): the block's own tick, if it's still there by then */
  scheduleBlockTick(x: number, y: number, z: number, block: number, delay: number, priority = 0): void {
    if (this.isClientSide) return;
    this.blockTicks.schedule(x, y, z, block, this.gameTime + delay, priority);
  }

  hasScheduledTick(x: number, y: number, z: number, block: number): boolean {
    return this.blockTicks.hasScheduledTick(x, y, z, block);
  }

  /** vanilla LevelTicks.willTickThisTick: `block`'s tick at (x, y, z) is among those being run this tick */
  willTickThisTick(x: number, y: number, z: number, block: number): boolean {
    return this.blockTicks.willTickThisTick(x, y, z, block);
  }

  /** vanilla Level.blockEvent: `block` at (x, y, z) gets triggerEvent(a, b) in this tick's block events (or the next's) */
  blockEvent(x: number, y: number, z: number, block: number, a: number, b: number): void {
    if (this.isClientSide) return;
    const key = `${x},${y},${z},${block},${a},${b}`;
    if (!this.blockEvents.has(key)) this.blockEvents.set(key, [x, y, z, block, a, b]);
  }

  /** vanilla ServerLevel.runBlockEvents: each in turn (new ones too) while the block's still there; unloaded ones wait */
  private runBlockEvents(): void {
    const later: [string, [number, number, number, number, number, number]][] = [];
    while (this.blockEvents.size) {
      const [key, e] = this.blockEvents.entries().next().value!;
      this.blockEvents.delete(key);
      const [x, y, z, block, a, b] = e;
      if (!this.world.isLoaded(x, z)) {
        later.push([key, e]);
        continue;
      }
      const st = this.world.getState(x, y, z);
      if (STATE_BLOCK[st] === block) behaviorOf(st)?.triggerEvent?.(this, x, y, z, st, a, b);
    }
    for (const [key, e] of later) this.blockEvents.set(key, e);
  }

  private runScheduledTicks(): void {
    if (!this.blockTicks.size) return;
    this.blockTicks.tick(this.gameTime, 65536, (x, z) => (this.world.isLoaded(x, z) ? 'run' : 'drop'), (x, y, z, type) => {
      const st = this.world.getState(x, y, z);
      if (type !== LEGACY_TICK) {
        if (STATE_BLOCK[st] === type) behaviorOf(st)?.tick?.(this, x, y, z, st);
        return;
      }
      const f = FLAGS[st];
      if (f & (F_WATER | F_LAVA) && BLOCKS[STATE_BLOCK[st]].s.fluid) {
        if (f & F_LAVA && !this.fluids.checkLavaInteraction(x, y, z)) return;
        this.fluids.tick(x, y, z);
      } else if (isGravityBlock(st)) {
        this.tryFall(x, y, z, st);
      } else if (STATE_BLOCK[st] === fireId()) {
        fireTick(this, x, y, z, st);
      } else if (STATE_BLOCK[st] === DRIPLEAF()) {
        dripleafTick(this, x, y, z, st);
      }
    });
  }

  private tryFall(x: number, y: number, z: number, st: number): void {
    const below = this.world.getState(x, y - 1, z);
    const f = FLAGS[below];
    if ((f & (F_AIR | F_REPLACEABLE) || (f & (F_WATER | F_LAVA) && BLOCKS[STATE_BLOCK[below]].s.fluid)) && y > -64) {
      FallingBlockEntity.fall(this, x, y, z, st);
      this.updateNeighbors(x, y, z, st);
    }
  }

  /** schedule fluid ticks around a changed position */
  updateNeighborsFluid(x: number, y: number, z: number): void {
    for (const [dx, dy, dz] of [[0, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const st = this.world.getState(nx, ny, nz);
      const f = FLAGS[st];
      if (f & (F_WATER | F_LAVA) && BLOCKS[STATE_BLOCK[st]].s.fluid) this.scheduleTick(nx, ny, nz, fluidStateOf(st).type === 1 ? 5 : this.world.dim.ultraWarm ? 10 : 30);
      // (vanilla FallingBlock.getDelayAfterPlace: 2, the dragon egg's 5)
      else if (isGravityBlock(st)) this.scheduleTick(nx, ny, nz, BLOCKS[STATE_BLOCK[st]].name === 'dragon_egg' ? 5 : 2);
    }
  }

  /** vanilla ServerLevel weather cycle (simplified to its timers) */
  private tickWeather(): void {
    if (this.clearWeatherTime > 0) {
      this.clearWeatherTime--;
      this.raining = false;
      this.thundering = false;
    } else {
      if (this.thunderTime > 0) {
        this.thunderTime--;
        if (this.thunderTime === 0) this.thundering = !this.thundering;
      } else this.thunderTime = this.thundering ? 3600 + this.random.nextInt(12000) : 12000 + this.random.nextInt(168000);
      if (this.rainTime > 0) {
        this.rainTime--;
        if (this.rainTime === 0) this.raining = !this.raining;
      } else this.rainTime = this.raining ? 12000 + this.random.nextInt(12000) : 12000 + this.random.nextInt(168000);
    }
    this.tickWeatherLevels();
  }

  private tickWeatherLevels(): void {
    // vanilla ServerLevel.advanceWeatherCycle: only under a sky does the rain come and go
    if (!this.world.dim.hasSkyLight) {
      this.rain = this.rainO = this.thunder = this.thunderO = 0;
      return;
    }
    this.rainO = this.rain;
    this.rain = Math.max(0, Math.min(1, this.rain + (this.raining ? 0.01 : -0.01)));
    this.thunderO = this.thunder;
    this.thunder = Math.max(0, Math.min(1, this.thunder + (this.thundering ? 0.01 : -0.01)));
  }

  rainLevel(p: number): number {
    return this.rainO + (this.rain - this.rainO) * p;
  }

  thunderLevel(p: number): number {
    return (this.thunderO + (this.thunder - this.thunderO) * p) * this.rainLevel(p);
  }

  setWeather(kind: 'clear' | 'rain' | 'thunder', duration = 6000): void {
    if (kind === 'clear') {
      this.clearWeatherTime = duration;
      this.raining = false;
      this.thundering = false;
      this.rainTime = 0;
      this.thunderTime = 0;
    } else {
      this.clearWeatherTime = 0;
      this.raining = true;
      this.thundering = kind === 'thunder';
      this.rainTime = duration;
      this.thunderTime = duration;
    }
  }

  getState(x: number, y: number, z: number): number {
    return this.world.getState(x, y, z);
  }

  getBlockName(x: number, y: number, z: number): string {
    return BLOCKS[STATE_BLOCK[this.world.getState(x, y, z)]].name;
  }

  /**
   * vanilla Level.setBlock: place or remove a block with the usual side effects. `flags` are vanilla's UPDATE_*
   * bits; true tells the neighbours and updates their shapes (UPDATE_ALL), false does neither.
   */
  setBlock(x: number, y: number, z: number, state: number, flags: boolean | number = true): number {
    if (this.isClientSide) return this.world.getState(x, y, z);
    const f = flags === true ? UPDATE_ALL : flags === false ? UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE : flags;
    const old = this.world.setState(x, y, z, state);
    if (old === state) return old;
    // vanilla LevelChunk.setBlockState: the old block's onRemove, then (if it's still there) the new one's onPlace
    const moving = (f & UPDATE_MOVE_BY_PISTON) !== 0;
    behaviorOf(old)?.onRemove?.(this, x, y, z, old, state, moving);
    if (this.world.getState(x, y, z) !== state) return old;
    // vanilla BaseRailBlock.onPlace: a new rail connects up (reshaping itself notifies the neighbours)
    if (STATE_BLOCK[old] !== STATE_BLOCK[state] && isRail(state)) railOnPlace(this, x, y, z, state);
    behaviorOf(state)?.onPlace?.(this, x, y, z, state, old, moving);
    if (this.world.getState(x, y, z) !== state) return old;
    if (f & UPDATE_NEIGHBORS) {
      this.updateNeighborsAt(x, y, z, STATE_BLOCK[old]);
      // (vanilla markAndNotifyBlock, and Containers.updateNeighboursAfterDestroy for one taken away: comparators read again)
      if (hasAnalogOutput(state) || hasAnalogOutput(old)) this.updateNeighbourForOutputSignal(x, y, z, STATE_BLOCK[state]);
    }
    if (!(f & UPDATE_KNOWN_SHAPE) && this.world.getState(x, y, z) === state) this.updateNeighbors(x, y, z, old);
    return old;
  }

  /**
   * vanilla Level.updateNeighborsAt: the six neighbours of (x, y, z) hear that `source` (a block id) there changed;
   * `skip` leaves out the one toward that direction (updateNeighborsAtExceptFromFacing)
   */
  updateNeighborsAt(x: number, y: number, z: number, source: number, skip = -1): void {
    if (this.isClientSide) return;
    this.neighborUpdater.updateNeighborsAt(x, y, z, source, skip);
  }

  /**
   * vanilla Level.updateNeighbourForOutputSignal: what a comparator reads from (x, y, z) may have changed, so the
   * comparators beside it, and those just beyond a conductor beside it, look again
   */
  updateNeighbourForOutputSignal(x: number, y: number, z: number, source: number): void {
    for (const [dx, dz] of HORIZONTAL_STEPS) {
      let nx = x + dx, nz = z + dz;
      if (!this.world.isLoaded(nx, nz)) continue;
      let st = this.world.getState(nx, y, nz);
      if (STATE_BLOCK[st] !== COMPARATOR()) {
        if (!isConductor(st)) continue;
        nx += dx;
        nz += dz;
        st = this.world.getState(nx, y, nz);
        if (STATE_BLOCK[st] !== COMPARATOR()) continue;
      }
      this.neighborChanged(nx, y, nz, source, x, y, z);
    }
  }

  /** vanilla Level.neighborChanged: just the block at (x, y, z) hears it */
  neighborChanged(x: number, y: number, z: number, source: number, fx: number, fy: number, fz: number): void {
    if (this.isClientSide) return;
    this.neighborUpdater.neighborChanged(x, y, z, source, fx, fy, fz);
  }

  /**
   * Destroy a block: effects, drops, neighbour updates. `stack` = the breaking tool (silk touch, fortune); `breaker`:
   * who broke it, for the game event (vanilla Level.destroyBlock's entity; false where vanilla removes it without one)
   */
  destroyBlock(x: number, y: number, z: number, drop: boolean, tool: Item | null = null, effects = true, stack: ItemStack | null = null, breaker: Entity | null | false = null): boolean {
    if (this.isClientSide) return false;
    const st = this.world.getState(x, y, z);
    if (FLAGS[st] & F_AIR) return false;
    const b = BLOCKS[STATE_BLOCK[st]];
    if (effects) {
      this.particles.blockBreak(x, y, z, st);
      this.sound.play(behaviorOf(st)?.breakSound?.(st) ?? `block.${b.sound}.break`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8);
    }
    const replacement = FLAGS[st] & F_WATERLOGGED ? S('water') : 0;
    // containers spill their contents (vanilla Containers.dropContents)
    const be = this.world.getBlockEntity(x, y, z);
    if (be) {
      be.unpackLoot();
      for (const s of be.container.removeAll()) this.dropStackAt(x, y, z, s);
    }
    this.world.setState(x, y, z, replacement);
    behaviorOf(st)?.onRemove?.(this, x, y, z, st, replacement, false);
    // two-block blocks (tall plants, doors, beds): remove the other part; loot comes from the lower half / bed head
    let dropState = st;
    let other: [number, number, number] | null = null;
    const hi = b.propIndex('half');
    if (hi >= 0 && b.props[hi].values.includes('upper')) {
      const half = b.get(st, 'half');
      const oy = half === 'upper' ? y - 1 : y + 1;
      const os = this.world.getState(x, oy, z);
      if (BLOCKS[STATE_BLOCK[os]] === b) {
        if (half === 'upper') dropState = os;
        this.world.setState(x, oy, z, FLAGS[os] & F_WATERLOGGED ? S('water') : 0);
        other = [x, oy, z];
      }
    } else if (b.name.endsWith('_bed')) {
      const facing = b.get<string>(st, 'facing');
      const head = b.get(st, 'part') === 'head';
      const d: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
      const [dx, dz] = d[facing];
      const ox = head ? x - dx : x + dx, oz = head ? z - dz : z + dz;
      const os2 = this.world.getState(ox, y, oz);
      if (BLOCKS[STATE_BLOCK[os2]] === b) {
        if (!head) dropState = os2;
        this.world.setState(ox, y, oz, 0);
        other = [ox, y, oz];
      }
    }
    if (drop) {
      for (const s of blockDrops(dropState, tool, this.random, levelOf(stack, 'silk_touch') > 0, levelOf(stack, 'fortune'), be)) ItemEntity.drop(this, x, y, z, s);
      behaviorOf(st)?.spawnAfterBreak?.(this, x, y, z, st, stack);
    }
    this.updateNeighborsAt(x, y, z, b.id);
    if (hasAnalogOutput(st)) this.updateNeighbourForOutputSignal(x, y, z, b.id);
    this.updateNeighbors(x, y, z, st);
    if (other) {
      this.updateNeighborsAt(other[0], other[1], other[2], b.id);
      this.updateNeighbors(other[0], other[1], other[2]);
    }
    // (vanilla Level.destroyBlock: BLOCK_DESTROY, by whoever broke it, of what it was)
    if (breaker !== false) this.gameEvent('block_destroy', x + 0.5, y + 0.5, z + 0.5, { entity: breaker, state: st });
    return true;
  }

  /** vanilla Containers.dropItemStack: random chunks of 10-30 with a small random kick */
  dropStackAt(x: number, y: number, z: number, stack: ItemStack): void {
    const w = 0.25;
    const px = x + Math.random() * (1 - w) + w / 2, py = y + Math.random() * (1 - w), pz = z + Math.random() * (1 - w) + w / 2;
    const tri = (m: number, d: number) => m + d * (Math.random() - Math.random());
    while (stack.count > 0) {
      const part = stack.split(10 + Math.floor(Math.random() * 21));
      const e = new ItemEntity(this, part);
      e.moveTo(px, py, pz);
      e.dx = tri(0, 0.11485000171139836);
      e.dy = tri(0.2, 0.11485000171139836);
      e.dz = tri(0, 0.11485000171139836);
      this.addEntity(e);
    }
  }

  /**
   * vanilla-style neighbour updates: shape updates (connections, doors, beds) and blocks that lost
   * support pop off. `changed` is the previous state at (x, y, z) (vanilla's neighborBlock).
   */
  updateNeighbors(x: number, y: number, z: number, changed?: number): void {
    if (this.isClientSide) return;
    this.updateNeighborsFluid(x, y, z);
    this.shapeUpdateHooks(x, y, z);
    const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      let ns = this.world.getState(nx, ny, nz);
      if (FLAGS[ns] & F_AIR) continue;
      if (isRail(ns)) {
        railNeighborChanged(this, nx, ny, nz, ns, changed);
        continue;
      }
      if (hasShapeUpdates(ns)) {
        // (which way the change was, and what's there now: vanilla updateShape's direction and neighborState)
        const nu = updateShape(this.world, nx, ny, nz, ns, dx ? 0 : dy ? 1 : 2, this.world.getState(x, y, z));
        if (nu === 0) {
          // vanilla Level.destroyBlock: fire goes out without break effects
          this.destroyBlock(nx, ny, nz, true, null, STATE_BLOCK[ns] !== fireId());
          continue;
        }
        if (nu !== ns) {
          this.world.setState(nx, ny, nz, nu);
          // (vanilla Block.updateOrDestroy sets it with its own shape updates: an observer on it sees it change)
          this.shapeUpdateHooks(nx, ny, nz);
          ns = nu;
          // a dripstone's new thickness reshapes the pieces above and below it in turn
          if (STATE_BLOCK[nu] === DRIPSTONE()) this.updateNeighbors(nx, ny, nz);
        }
      }
      if (!canSurvive(this.world, nx, ny, nz, ns)) {
        const delay = behaviorOf(ns)?.breakDelay;
        if (delay) this.scheduleBlockTick(nx, ny, nz, STATE_BLOCK[ns], delay);
        else if (isDripstoneFacing(ns, 'down')) this.fallStalactite(nx, ny, nz);
        else this.destroyBlock(nx, ny, nz, true, null, true);
      }
    }
  }

  /** vanilla updateNeighbourShapes, the side effects of it: each neighbour of (x, y, z) with a shapeUpdate hears which way the change was */
  private shapeUpdateHooks(x: number, y: number, z: number): void {
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      const ns = this.world.getState(nx, ny, nz);
      behaviorOf(ns)?.shapeUpdate?.(this, nx, ny, nz, ns, OPPOSITE[d] as Dir);
    }
  }

  /** vanilla PointedDripstoneBlock.spawnFallingStalactite: the stalactite falls from here to its tip, and the tip hurts what it lands on */
  fallStalactite(x: number, y: number, z: number): void {
    if (this.isClientSide) return;
    for (let yy = y; ; yy--) {
      const st = this.world.getState(x, yy, z);
      if (!isDripstoneFacing(st, 'down')) break;
      const e = FallingBlockEntity.fall(this, x, yy, z, st);
      const th = BLOCKS[STATE_BLOCK[st]].get(st, 'thickness');
      if (th === 'tip' || th === 'tip_merge') {
        const n = Math.max(1 + y - yy, 6);
        e.hurtEntities(n, n, 'fallingStalactite');
        break;
      }
    }
  }
}

/** vanilla Direction.Plane.HORIZONTAL: north, east, south, west */
const HORIZONTAL_STEPS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

let COMPARATOR_ID = -1;
function COMPARATOR(): number {
  if (COMPARATOR_ID < 0) COMPARATOR_ID = BLOCKS.findIndex((b) => b.name === 'comparator');
  return COMPARATOR_ID;
}

let DRIPSTONE_ID = -1;
function DRIPSTONE(): number {
  if (DRIPSTONE_ID < 0) DRIPSTONE_ID = BLOCKS.findIndex((b) => b.name === 'pointed_dripstone');
  return DRIPSTONE_ID;
}

let DRIPLEAF_ID = -1;
function DRIPLEAF(): number {
  if (DRIPLEAF_ID < 0) DRIPLEAF_ID = BLOCKS.findIndex((b) => b.name === 'big_dripleaf');
  return DRIPLEAF_ID;
}

let FIRE_ID = -1;
function fireId(): number {
  if (FIRE_ID < 0) FIRE_ID = BLOCKS.findIndex((b) => b.name === 'fire');
  return FIRE_ID;
}

function isGravityBlock(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return n === 'sand' || n === 'red_sand' || n === 'gravel' || n.endsWith('concrete_powder') || n.endsWith('anvil') || n === 'dragon_egg';
}
