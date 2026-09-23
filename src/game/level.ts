// Level: the running game world (blocks + entities + time + weather).

import { DEFAULT_GAME_RULES, GameRules } from './gameRules';
import { FurnaceBlockEntity, SpawnerBlockEntity } from '../world/blockEntity';
import { tickSpawner } from './baseSpawner';
import type { ItemStack } from '../item/item';
import { World } from '../world/world';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import type { LivingEntity } from '../entity/living';
import { Rand } from '../core/rng';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATERLOGGED, S } from '../world/block';
import { canSurvive, blockDrops } from './blockRules';
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
import { F_WATER, F_LAVA, F_REPLACEABLE } from '../world/block';
import { skyDarkenInt, timeOfDay } from '../render/environment';
import { BIOMES } from '../world/gen/biomes';
import type { AABB } from '../core/aabb';

export interface SoundSink {
  play(name: string, x: number, y: number, z: number, volume?: number, pitch?: number): void;
  playUI(name: string, volume?: number, pitch?: number): void;
}

export interface ParticleSink {
  blockBreak(x: number, y: number, z: number, state: number): void;
  blockHit(x: number, y: number, z: number, state: number, face: number): void;
  /** entity death smoke (vanilla makePoofParticles) */
  poof?(e: Entity): void;
  /** generic sprite particle by vanilla particle type name */
  spawn?(kind: string, x: number, y: number, z: number, dx: number, dy: number, dz: number): void;
  /** vanilla TrackingEmitter (crit sparks around an entity) */
  emitAround?(kind: 'crit' | 'enchanted_hit', e: Entity): void;
  /** vanilla FallingDustParticle tinted with a block's dust colour */
  fallingDust?(x: number, y: number, z: number, color: number): void;
  /** vanilla BLOCK particle (TerrainParticle with a starting speed) for the block at bx, by, bz */
  blockParticle?(x: number, y: number, z: number, xd: number, yd: number, zd: number, state: number, bx: number, by: number, bz: number): void;
  /** vanilla ENTITY_EFFECT (SpellParticle) swirl in an effect colour; alpha 38/255 for ambient effects */
  entityEffect?(x: number, y: number, z: number, color: number, alpha: number): void;
}

const NULL_SOUND: SoundSink = { play() {}, playUI() {} };
const NULL_PARTICLES: ParticleSink = { blockBreak() {}, blockHit() {} };

export class Level {
  readonly world: World;
  readonly entities: Entity[] = [];
  player!: Player;
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
  readonly fluids: FluidTicker;
  readonly randomTicks: RandomTicker;
  /** scheduled block ticks: key → due game time */
  private readonly scheduled = new Map<string, number>();
  simulationDistance = 8;
  gameRules: GameRules = { ...DEFAULT_GAME_RULES };

  constructor(world: World, seed: string) {
    this.fluids = new FluidTicker(this);
    this.randomTicks = new RandomTicker(this);
    this.world = world;
    this.seed = seed;
    this.rainTime = 12000 + this.random.nextInt(168000);
    this.thunderTime = 12000 + this.random.nextInt(168000);
  }

  addEntity(e: Entity): void {
    this.entities.push(e);
    // vanilla addFreshEntityWithPassengers: riders loaded with their vehicle come along
    for (const p of e.passengers) if (!this.entities.includes(p)) this.addEntity(p);
  }

  /** entities whose bounding box intersects `box` */
  getEntities(box: AABB, filter?: (e: Entity) => boolean, except?: Entity | null): Entity[] {
    const out: Entity[] = [];
    for (const e of this.entities) {
      if (e.removed || e === except) continue;
      if (!e.bb.intersects(box)) continue;
      if (filter && !filter(e)) continue;
      out.push(e);
    }
    return out;
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
    this.skyDarken = skyDarkenInt(timeOfDay(this.dayTime), { rain: this.rainLevel(1), thunder: this.thunderLevel(1), flash: 0 });
  }

  isDay(): boolean {
    return this.skyDarken < 4;
  }

  /** vanilla getMaxLocalRawBrightness: max(sky - skyDarken, block) */
  rawBrightness(x: number, y: number, z: number, darken = this.skyDarken): number {
    const l = this.world.getLight(x, y, z);
    return Math.max((l >> 4) - darken, l & 15);
  }

  /** vanilla getLightLevelDependentMagicValue (overworld ambient light 0) */
  brightness(x: number, y: number, z: number): number {
    const f = this.rawBrightness(x, y, z) / 15;
    return f / (4 - 3 * f);
  }

  canSeeSky(x: number, y: number, z: number): boolean {
    return y >= this.world.heightAt(x, z);
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
    return this.temperatureAt(b.temperature, y) >= 0.15;
  }

  /** biome temperature with the vanilla height falloff above y=80 */
  temperatureAt(base: number, y: number): number {
    return y > 80 ? base - ((y - 80) * 0.05) / 40 : base;
  }

  /** called for every entity tick (spawner despawn checks etc.) */
  onEntityTick: ((e: Entity) => void) | null = null;
  /** a living entity died (advancements: kills, deaths) */
  onEntityDied: ((victim: LivingEntity, source: string, attacker: Entity | null) => void) | null = null;
  /** animals bred (the child, and who fed them) */
  onBred: ((child: Entity, cause: Entity | null) => void) | null = null;
  /** an arrow the player shot hurt something (vanilla "Take Aim") */
  onPlayerArrowHit: ((target: Entity) => void) | null = null;

  /** vanilla: entities tick only inside the simulation distance (and in loaded chunks) */
  isEntityTicking(x: number, z: number): boolean {
    const bx = Math.floor(x), bz = Math.floor(z);
    if (!this.world.isLoaded(bx, bz)) return false;
    const p = this.player;
    if (!p) return true;
    const dx = (bx >> 4) - (Math.floor(p.x) >> 4), dz = (bz >> 4) - (Math.floor(p.z) >> 4);
    const r = this.simulationDistance;
    return Math.max(Math.abs(dx), Math.abs(dz)) <= r;
  }

  tick(): void {
    this.gameTime++;
    if (this.doDaylightCycle) this.dayTime++;
    if (this.gameRules.doWeatherCycle) this.tickWeather();
    else this.tickWeatherLevels();
    tickSleeping(this);
    this.updateSkyBrightness();
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.removed || e.vehicle) continue;
      if (e !== this.player && !this.isEntityTicking(e.x, e.z)) continue;
      e.tick();
      if (!e.removed) this.onEntityTick?.(e);
      if (e.passengers.length) this.tickPassengers(e);
    }
    // prune removed
    let w = 0;
    for (let i = 0; i < this.entities.length; i++) if (!this.entities[i].removed) this.entities[w++] = this.entities[i];
    this.entities.length = w;
    if (this.skyFlash > 0) this.skyFlash--;
    this.runScheduledTicks();
    if (this.player) this.randomTicks.tick(this.player.x, this.player.z, this.simulationDistance);
    // block entities (furnaces, spawners)
    for (const be of this.world.blockEntities.values()) {
      if (be.removed) continue;
      if (be instanceof SpawnerBlockEntity) {
        if (this.isEntityTicking(be.x, be.z)) tickSpawner(be, this);
        continue;
      }
      if (!(be instanceof FurnaceBlockEntity)) continue;
      const lit = be.isLit, cook = be.cookingProgress;
      be.tick(this);
      if (lit || cook || be.isLit) {
        const c = this.world.getChunk(be.x >> 4, be.z >> 4);
        if (c) c.modified = true;
      }
    }
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

  scheduleTick(x: number, y: number, z: number, delay: number): void {
    const key = x + ',' + y + ',' + z;
    if (this.scheduled.has(key)) return;
    this.scheduled.set(key, this.gameTime + delay);
  }

  private runScheduledTicks(): void {
    if (!this.scheduled.size) return;
    const due: [number, number, number][] = [];
    for (const [k, t] of this.scheduled) {
      if (t > this.gameTime) continue;
      const [x, y, z] = k.split(',').map(Number);
      due.push([x, y, z]);
      this.scheduled.delete(k);
      if (due.length > 4096) break;
    }
    for (const [x, y, z] of due) {
      if (!this.world.isLoaded(x, z)) continue;
      const st = this.world.getState(x, y, z);
      const f = FLAGS[st];
      if (f & (F_WATER | F_LAVA) && BLOCKS[STATE_BLOCK[st]].s.fluid) {
        if (f & F_LAVA && !this.fluids.checkLavaInteraction(x, y, z)) continue;
        this.fluids.tick(x, y, z);
      } else if (isGravityBlock(st)) {
        this.tryFall(x, y, z, st);
      } else if (STATE_BLOCK[st] === fireId()) {
        fireTick(this, x, y, z, st);
      }
    }
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
      if (f & (F_WATER | F_LAVA) && BLOCKS[STATE_BLOCK[st]].s.fluid) this.scheduleTick(nx, ny, nz, fluidStateOf(st).type === 1 ? 5 : 30);
      else if (isGravityBlock(st)) this.scheduleTick(nx, ny, nz, 2);
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

  /** place/remove a block with the usual side effects */
  setBlock(x: number, y: number, z: number, state: number, notify = true): number {
    const old = this.world.setState(x, y, z, state);
    if (old === state) return old;
    // vanilla BaseRailBlock.onPlace: a new rail connects up (reshaping itself notifies the neighbours)
    if (STATE_BLOCK[old] !== STATE_BLOCK[state] && isRail(state)) railOnPlace(this, x, y, z, state);
    if (notify && this.world.getState(x, y, z) === state) this.updateNeighbors(x, y, z, old);
    return old;
  }

  /** Destroy a block: effects, drops, neighbour updates. */
  destroyBlock(x: number, y: number, z: number, drop: boolean, tool: Item | null = null, effects = true): boolean {
    const st = this.world.getState(x, y, z);
    if (FLAGS[st] & F_AIR) return false;
    const b = BLOCKS[STATE_BLOCK[st]];
    if (effects) {
      this.particles.blockBreak(x, y, z, st);
      this.sound.play(`block.${b.sound}.break`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8);
    }
    const replacement = FLAGS[st] & F_WATERLOGGED ? S('water') : 0;
    // containers spill their contents (vanilla Containers.dropContents)
    const be = this.world.getBlockEntity(x, y, z);
    if (be) {
      be.unpackLoot();
      for (const s of be.container.removeAll()) this.dropStackAt(x, y, z, s);
    }
    this.world.setState(x, y, z, replacement);
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
      for (const stack of blockDrops(dropState, tool, this.random)) ItemEntity.drop(this, x, y, z, stack);
    }
    this.updateNeighbors(x, y, z, st);
    if (other) this.updateNeighbors(other[0], other[1], other[2]);
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
    this.updateNeighborsFluid(x, y, z);
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
        const nu = updateShape(this.world, nx, ny, nz, ns);
        if (nu === 0) {
          // vanilla Level.destroyBlock: fire goes out without break effects
          this.destroyBlock(nx, ny, nz, true, null, STATE_BLOCK[ns] !== fireId());
          continue;
        }
        if (nu !== ns) {
          this.world.setState(nx, ny, nz, nu);
          ns = nu;
        }
      }
      if (!canSurvive(this.world, nx, ny, nz, ns)) this.destroyBlock(nx, ny, nz, true, null, true);
    }
  }
}

let FIRE_ID = -1;
function fireId(): number {
  if (FIRE_ID < 0) FIRE_ID = BLOCKS.findIndex((b) => b.name === 'fire');
  return FIRE_ID;
}

function isGravityBlock(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return n === 'sand' || n === 'red_sand' || n === 'gravel' || n.endsWith('concrete_powder');
}
