// Level: the running game world (blocks + entities + time + weather).

import { World } from '../world/world';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import { Rand } from '../core/rng';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATERLOGGED, S } from '../world/block';
import { canSurvive, blockDrops } from './blockRules';
import { ItemEntity } from '../entity/itemEntity';
import type { Item } from '../item/item';
import { FluidTicker, fluidStateOf } from './fluidTicks';
import { RandomTicker } from './randomTicks';
import { FallingBlockEntity } from '../entity/fallingBlock';
import { F_WATER, F_LAVA, F_REPLACEABLE } from '../world/block';

export interface SoundSink {
  play(name: string, x: number, y: number, z: number, volume?: number, pitch?: number): void;
  playUI(name: string, volume?: number, pitch?: number): void;
}

export interface ParticleSink {
  blockBreak(x: number, y: number, z: number, state: number): void;
  blockHit(x: number, y: number, z: number, state: number, face: number): void;
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
  }

  tick(): void {
    this.gameTime++;
    if (this.doDaylightCycle) this.dayTime++;
    this.tickWeather();
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.removed) continue;
      // only tick entities in loaded chunks
      if (!this.world.isLoaded(Math.floor(e.x), Math.floor(e.z))) continue;
      e.tick();
    }
    // prune removed
    let w = 0;
    for (let i = 0; i < this.entities.length; i++) if (!this.entities[i].removed) this.entities[w++] = this.entities[i];
    this.entities.length = w;
    if (this.skyFlash > 0) this.skyFlash--;
    this.runScheduledTicks();
    if (this.player) this.randomTicks.tick(this.player.x, this.player.z, this.simulationDistance);
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
      }
    }
  }

  private tryFall(x: number, y: number, z: number, st: number): void {
    const below = this.world.getState(x, y - 1, z);
    const f = FLAGS[below];
    if ((f & (F_AIR | F_REPLACEABLE) || (f & (F_WATER | F_LAVA) && BLOCKS[STATE_BLOCK[below]].s.fluid)) && y > -64) {
      FallingBlockEntity.fall(this, x, y, z, st);
      this.updateNeighbors(x, y, z);
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

  /** place/remove a block with the usual side effects */
  setBlock(x: number, y: number, z: number, state: number, notify = true): number {
    const old = this.world.setState(x, y, z, state);
    if (notify && old !== state) this.updateNeighbors(x, y, z);
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
    this.world.setState(x, y, z, replacement);
    // double-height plants: remove the other half
    if (b.propIndex('half') >= 0 && !b.name.endsWith('_stairs') && !b.name.endsWith('_slab')) {
      const half = b.get(st, 'half');
      const oy = half === 'upper' ? y - 1 : y + 1;
      const os = this.world.getState(x, oy, z);
      if (BLOCKS[STATE_BLOCK[os]] === b) this.world.setState(x, oy, z, 0);
    }
    if (drop) {
      for (const stack of blockDrops(st, tool, this.random)) ItemEntity.drop(this, x, y, z, stack);
    }
    this.updateNeighbors(x, y, z);
    return true;
  }

  /** vanilla-style neighbour checks: blocks that lost support pop off. */
  updateNeighbors(x: number, y: number, z: number): void {
    this.updateNeighborsFluid(x, y, z);
    const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const ns = this.world.getState(nx, ny, nz);
      if (FLAGS[ns] & F_AIR) continue;
      if (!canSurvive(this.world, nx, ny, nz, ns)) this.destroyBlock(nx, ny, nz, true, null, true);
    }
  }
}

function isGravityBlock(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return n === 'sand' || n === 'red_sand' || n === 'gravel' || n.endsWith('concrete_powder');
}
