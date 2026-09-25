// The sculk sensor and the calibrated sculk sensor at work (vanilla SculkSensorBlock, CalibratedSculkSensorBlock and
// their block entities with the VibrationUser each gives): a sensor hears the vibrations within 8 blocks of it (the
// calibrated one 16) that wool doesn't stop. When one reaches it, its tendrils twitch and click and it gives off
// redstone power for 30 ticks (the calibrated one 10), the stronger the nearer the vibration was, then rests for 10
// before it hears again. An amethyst block against it chimes and passes the vibration's frequency on; the calibrated
// sensor only hears the frequency the redstone signal into its back asks for (any, with none). Whatever steps on a
// sensor sets it off, sneaking or not (a warden aside). A comparator reads the frequency it's active with.

import { BLOCKS, STATE_BLOCK, type Block } from '../world/block';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { DOWN, UP, DX, DY, DZ, OPPOSITE, dirFromName, type Dir } from '../world/dir';
import type { Entity } from '../entity/entity';
import type { Level } from './level';
import { registerBehavior } from './blockBehavior';
import { getSignal } from './redstone/signal';
import { registerBlockListener, blockListenerAt, type ListeningBlockEntity } from './gameEventDispatcher';
import { vibrationFrequency, resonanceEvent, resonatesVibrations, type GameEventName } from './gameEvents';
import { VibrationData, VibrationListener, tickVibrations, redstoneStrengthForDistance, type VibrationUser } from './vibrations';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const isSensor = (b: Block): boolean => b.name === 'sculk_sensor' || b.name === 'calibrated_sculk_sensor';

/** vanilla SculkSensorBlock.ACTIVE_TICKS (the calibrated sensor's getActiveTicks: 10) */
const activeTicks = (b: Block): number => (b.name === 'calibrated_sculk_sensor' ? 10 : 30);
/** vanilla SculkSensorBlock.COOLDOWN_TICKS */
const COOLDOWN_TICKS = 10;

/** vanilla SculkSensorBlock.RESONANCE_PITCH_BEND: the note block pitch of each frequency's chime */
const RESONANCE_PITCH_BEND = [0, 0, 2, 4, 6, 7, 9, 10, 12, 14, 15, 18, 19, 21, 22, 24].map((n) => Math.fround(Math.pow(2, (n - 12) / 12)));

/** vanilla DustColorTransitionOptions.SCULK_TO_REDSTONE: sculk's teal (3790560) to redstone's red */
const SCULK_COLOR: [number, number, number] = [0x39 / 255, 0xd6 / 255, 0xe0 / 255];
const REDSTONE_COLOR: [number, number, number] = [1, 0, 0];

/** vanilla SculkSensorBlock.getPhase */
const phase = (st: number): string => blk(st).get<string>(st, 'sculk_sensor_phase');

/** vanilla SculkSensorBlock.canActivate: inactive (not active, not cooling down) */
export function canActivate(st: number): boolean {
  return isSensor(blk(st)) && phase(st) === 'inactive';
}

/** vanilla SculkSensorBlock.updateNeighbours: round the sensor and round the block under it */
function updateNeighbours(level: Level, x: number, y: number, z: number, id: number): void {
  level.updateNeighborsAt(x, y, z, id);
  level.updateNeighborsAt(x, y - 1, z, id);
}

/**
 * vanilla SculkSensorBlock.activate: it goes active with power for its active ticks, the neighbours hear of it, an
 * amethyst block against it chimes the frequency on, and its tendrils click (for shriekers and wardens to hear)
 */
export function activate(level: Level, entity: Entity | null, x: number, y: number, z: number, st: number, power: number, frequency: number): void {
  const b = blk(st);
  level.setBlock(x, y, z, b.with(b.with(st, 'sculk_sensor_phase', 'active'), 'power', power));
  level.scheduleBlockTick(x, y, z, b.id, activeTicks(b));
  updateNeighbours(level, x, y, z, b.id);
  tryResonateVibration(level, entity, x, y, z, frequency);
  level.gameEvent('sculk_sensor_tendrils_clicking', x + 0.5, y + 0.5, z + 0.5, { entity });
  if (!b.get(st, 'waterlogged')) level.sound.play('block.sculk_sensor.clicking', x + 0.5, y + 0.5, z + 0.5, 1, level.random.nextFloat() * 0.2 + 0.8);
}

/** vanilla SculkSensorBlock.deactivate: cooling down, no power, inactive again in 10 ticks */
function deactivate(level: Level, x: number, y: number, z: number, st: number): void {
  const b = blk(st);
  level.setBlock(x, y, z, b.with(b.with(st, 'sculk_sensor_phase', 'cooldown'), 'power', 0));
  level.scheduleBlockTick(x, y, z, b.id, COOLDOWN_TICKS);
  updateNeighbours(level, x, y, z, b.id);
}

/**
 * vanilla SculkSensorBlock.tryResonateVibration: each amethyst block against the sensor (down, up, north, south,
 * west, east) gives the frequency on as its own game event, with a chime at that frequency's pitch
 */
function tryResonateVibration(level: Level, entity: Entity | null, x: number, y: number, z: number, frequency: number): void {
  if (frequency < 1 || frequency > 15) return;
  for (let d = 0; d < 6; d++) {
    const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
    const ns = level.getState(nx, ny, nz);
    if (!resonatesVibrations(ns)) continue;
    level.gameEvent(resonanceEvent(frequency), nx + 0.5, ny + 0.5, nz + 0.5, { entity, state: ns });
    level.sound.play('block.amethyst_block.resonate', nx + 0.5, ny + 0.5, nz + 0.5, 1, RESONANCE_PITCH_BEND[frequency]);
  }
}

/** the calibrated sensor's facing (its back, the input, toward whoever placed it) */
const facing = (st: number): Dir => dirFromName(blk(st).get<string>(st, 'facing'));

/** vanilla CalibratedSculkSensorBlockEntity.VibrationUser.getBackSignal: the redstone power coming into its back */
function backSignal(level: Level, x: number, y: number, z: number, st: number): number {
  const d = OPPOSITE[facing(st)] as Dir;
  return getSignal(level.world, x + DX[d], y + DY[d], z + DZ[d], d);
}

// ---------------------------------------------------------------------------------------------------------------
// The block entities

/** vanilla SculkSensorBlockEntity.VibrationUser (and CalibratedSculkSensorBlockEntity.VibrationUser) */
class SensorUser implements VibrationUser {
  readonly canTriggerAvoidVibration = true;
  readonly requiresAdjacentChunksToBeTicking = true;
  constructor(private readonly be: SculkSensorBlockEntity) {}

  get radius(): number {
    return this.be.calibrated ? 16 : 8;
  }

  position(): [number, number, number] {
    return [this.be.x + 0.5, this.be.y + 0.5, this.be.z + 0.5];
  }

  canReceive(level: Level, x: number, y: number, z: number, event: GameEventName): boolean {
    const be = this.be, st = level.getState(be.x, be.y, be.z);
    if (be.calibrated && blk(st).name === 'calibrated_sculk_sensor') {
      // (vanilla CalibratedSculkSensorBlockEntity: only the frequency its back is powered at, if it's powered at all)
      const i = backSignal(level, be.x, be.y, be.z, st);
      if (i !== 0 && vibrationFrequency(event) !== i) return false;
    }
    if (x === be.x && y === be.y && z === be.z && (event === 'block_destroy' || event === 'block_place')) return false;
    return canActivate(st);
  }

  onReceive(level: Level, _x: number, _y: number, _z: number, event: GameEventName, entity: Entity | null, _owner: Entity | null, distance: number): void {
    const be = this.be, st = level.getState(be.x, be.y, be.z);
    if (!canActivate(st)) return;
    be.lastVibrationFrequency = vibrationFrequency(event);
    activate(level, entity, be.x, be.y, be.z, st, redstoneStrengthForDistance(distance, this.radius), be.lastVibrationFrequency);
  }

  onDataChanged(): void {
    this.be.setChanged();
  }
}

/** vanilla SculkSensorBlockEntity: the frequency of the last vibration it heard (for a comparator), and its listener */
export class SculkSensorBlockEntity extends BlockEntity implements ListeningBlockEntity {
  readonly id: string = 'sculk_sensor';
  /** vanilla lastVibrationFrequency */
  lastVibrationFrequency = 0;
  /** vanilla VibrationSystem.Data */
  readonly vibration = new VibrationData();
  readonly user: VibrationUser = new SensorUser(this);
  readonly listener = new VibrationListener(this.user, this.vibration);
  /** the level it's ticking in (vanilla BlockEntity.level) */
  level: Level | null = null;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
    registerBlockListener(this);
  }

  get calibrated(): boolean {
    return false;
  }

  /** vanilla SculkSensorBlock.getTicker: the vibration system's tick (in ticking chunks) */
  override tick(level: Level): void {
    this.level = level;
    if (!level.isEntityTicking(this.x, this.z)) return;
    tickVibrations(level, this.vibration, this.user);
  }

  /** vanilla BlockEntity.setChanged: its chunk has something new to save */
  setChanged(): void {
    const c = this.level?.world.getChunk(this.x >> 4, this.z >> 4);
    if (c) c.modified = true;
  }

  protected override saveData(): Record<string, number | string> | undefined {
    return { last_vibration_frequency: this.lastVibrationFrequency, listener: this.vibration.save() };
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.lastVibrationFrequency = Number(d.last_vibration_frequency ?? 0);
    this.vibration.load(d.listener);
  }
}

/** vanilla CalibratedSculkSensorBlockEntity: listens twice as far */
export class CalibratedSculkSensorBlockEntity extends SculkSensorBlockEntity {
  override readonly id = 'calibrated_sculk_sensor';

  override get calibrated(): boolean {
    return true;
  }
}

registerBlockEntityType('sculk_sensor', (x, y, z) => new SculkSensorBlockEntity(x, y, z));
registerBlockEntityType('calibrated_sculk_sensor', (x, y, z) => new CalibratedSculkSensorBlockEntity(x, y, z));

const isSensorEntity = (be: ListeningBlockEntity): be is SculkSensorBlockEntity => be instanceof SculkSensorBlockEntity;

/** the sensor block entity at (x, y, z) */
export function sensorAt(level: Level, x: number, y: number, z: number): SculkSensorBlockEntity | null {
  const be = level.world.getBlockEntity(x, y, z);
  return be instanceof SculkSensorBlockEntity ? be : null;
}

/** vanilla SculkSensorBlock.getAnalogOutputSignal: the frequency it's active with, else 0 (the comparator's hook) */
export function sensorAnalogOutput(level: Level, x: number, y: number, z: number, st: number): number {
  const be = blockListenerAt(level, x, y, z, isSensorEntity);
  return be && phase(st) === 'active' ? be.lastVibrationFrequency : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// The blocks

for (const name of ['sculk_sensor', 'calibrated_sculk_sensor']) {
  const calibrated = name === 'calibrated_sculk_sensor';
  registerBehavior(name, {
    isSignalSource: () => true,
    // vanilla getSignal: its power all round (the calibrated one's not into its back, its input)
    getSignal: (_w, _x, _y, _z, st, dir) => (calibrated && dir === facing(st) ? 0 : blk(st).get<number>(st, 'power')),
    // vanilla getDirectSignal: strong power only into the block under it
    getDirectSignal: (_w, _x, _y, _z, st, dir) => (dir === UP ? blk(st).get<number>(st, 'power') : 0),
    // vanilla SculkSensorBlock.tick: from active to cooling down, from cooling down to listening again
    tick(level, x, y, z, st) {
      const p = phase(st);
      if (p === 'active') deactivate(level, x, y, z, st);
      else if (p === 'cooldown') {
        const b = blk(st);
        level.setBlock(x, y, z, b.with(st, 'sculk_sensor_phase', 'inactive'));
        if (!b.get(st, 'waterlogged')) level.sound.play('block.sculk_sensor.clicking_stop', x + 0.5, y + 0.5, z + 0.5, 1, level.random.nextFloat() * 0.2 + 0.8);
      }
    },
    // vanilla SculkSensorBlock.onPlace: a sensor put down powered, with no tick coming to end it, loses its power
    onPlace(level, x, y, z, st, old) {
      if (STATE_BLOCK[st] === STATE_BLOCK[old] || blk(st).get<number>(st, 'power') <= 0 || level.hasScheduledTick(x, y, z, STATE_BLOCK[st])) return;
      level.setBlock(x, y, z, blk(st).with(st, 'power', 0), 18);
    },
    // vanilla SculkSensorBlock.onRemove: an active sensor taken away tells its neighbours its power is gone
    onRemove(level, x, y, z, st, now) {
      if (STATE_BLOCK[st] !== STATE_BLOCK[now] && phase(st) === 'active') updateNeighbours(level, x, y, z, STATE_BLOCK[st]);
    },
    // vanilla SculkSensorBlock.stepOn: something (not a warden) stepping on it makes a step it hears whether sneaking or not
    stepOn(level, x, y, z, st, e) {
      if (!canActivate(st) || e.type === 'warden') return;
      const be = sensorAt(level, x, y, z);
      if (be && be.user.canReceive(level, x, y, z, 'step', { state: st })) be.listener.forceScheduleVibration(level, 'step', { entity: e }, e.x, e.y, e.z);
    },
    // vanilla SculkSensorBlock.animateTick: an active sensor's specks, teal turning red, off its sides
    animateTick(level, x, y, z, st) {
      if (phase(st) !== 'active') return;
      const d = Math.floor(Math.random() * 6);
      if (d === UP || d === DOWN) return;
      const px = x + 0.5 + (DX[d] === 0 ? 0.5 - Math.random() : DX[d] * 0.6);
      const pz = z + 0.5 + (DZ[d] === 0 ? 0.5 - Math.random() : DZ[d] * 0.6);
      level.particles.dustTransition?.(px, y + 0.25, pz, 0, Math.random() * 0.04, 0, SCULK_COLOR, REDSTONE_COLOR, 1);
    },
    analogOutput: sensorAnalogOutput,
  });
}
