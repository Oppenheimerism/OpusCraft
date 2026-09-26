// The repeater (vanilla RepeaterBlock and the DiodeBlock it is): power at its back (from the block there, or the
// dust's power) turns it on after its delay of 1-4 redstone ticks (two game ticks each), and it gives 15 out of its
// front, strongly; a powered repeater (or comparator) pointing into its side locks it as it is. Right-click cycles the
// delay. `facing` points at its input: the output is on the other side.

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DY, DZ, DIR_NAMES, OPPOSITE, dirFromYaw, type Dir } from '../../world/dir';
import type { World } from '../../world/world';
import { registerBehavior } from '../blockBehavior';
import { getSignal, getDirectSignal } from './signal';
import { isWire } from './wire';
import { sturdyFace } from './support';
import { TickPriority } from '../ticks';
import type { Level } from '../level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

let REPEATER: Block | null = null;
const repeater = (): Block => (REPEATER ??= getBlock('repeater'));

const facingOf = (st: number): Dir => DIR_NAMES.indexOf(blk(st).get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;
const isOn = (st: number) => blk(st).get(st, 'powered') === true;
/** vanilla RepeaterBlock.getDelay: two game ticks a step */
const delayOf = (st: number) => blk(st).get<number>(st, 'delay') * 2;

/** vanilla DiodeBlock.isDiode: repeaters and comparators (comparator.ts shares the diode's workings below) */
export const isDiode = (st: number) => /^(repeater|comparator)$/.test(blk(st).name);

/** vanilla DiodeBlock.canSurviveOn: a rigid, full top under it */
export function canSurviveOn(st: number): boolean {
  return sturdyFace(st, UP);
}

/** vanilla getInputSignal: the power coming in at its back, dust counted at its full power */
export function inputSignal(w: World, x: number, y: number, z: number, st: number): number {
  const d = facingOf(st);
  const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
  const i = getSignal(w, nx, ny, nz, d);
  if (i >= 15) return i;
  const ns = w.getState(nx, ny, nz);
  return Math.max(i, isWire(ns) ? blk(ns).get<number>(ns, 'power') : 0);
}

/** vanilla SignalGetter.getControlInputSignal with diodes only: a repeater or comparator pointing in */
function controlInput(w: World, x: number, y: number, z: number, d: Dir): number {
  return isDiode(w.getState(x, y, z)) ? getDirectSignal(w, x, y, z, d) : 0;
}

const CW: Record<number, Dir> = { [NORTH]: EAST, [EAST]: SOUTH, [SOUTH]: WEST, [WEST]: NORTH };
const CCW: Record<number, Dir> = { [NORTH]: WEST, [WEST]: SOUTH, [SOUTH]: EAST, [EAST]: NORTH };

/** vanilla RepeaterBlock.isLocked: getAlternateSignal, a diode powering it from either side */
export function isLocked(w: World, x: number, y: number, z: number, st: number): boolean {
  const f = facingOf(st);
  const a = CW[f], b = CCW[f];
  return Math.max(controlInput(w, x + DX[a], y, z + DZ[a], a), controlInput(w, x + DX[b], y, z + DZ[b], b)) > 0;
}

const shouldTurnOn = (w: World, x: number, y: number, z: number, st: number) => inputSignal(w, x, y, z, st) > 0;

/** vanilla shouldPrioritize: it feeds a diode that isn't pointing back at it */
export function shouldPrioritize(w: World, x: number, y: number, z: number, st: number): boolean {
  const d = OPPOSITE[facingOf(st)] as Dir;
  const front = w.getState(x + DX[d], y + DY[d], z + DZ[d]);
  return isDiode(front) && facingOf(front) !== d;
}

/** vanilla checkTickOnNeighbor: a change of input schedules the switch, first in line when it feeds another diode */
function checkTickOnNeighbor(level: Level, x: number, y: number, z: number, st: number): void {
  const w = level.world;
  if (isLocked(w, x, y, z, st)) return;
  const on = isOn(st), want = shouldTurnOn(w, x, y, z, st);
  if (on === want || level.willTickThisTick(x, y, z, STATE_BLOCK[st])) return;
  const priority = shouldPrioritize(w, x, y, z, st) ? TickPriority.EXTREMELY_HIGH : on ? TickPriority.VERY_HIGH : TickPriority.HIGH;
  level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], delayOf(st), priority);
}

/** vanilla updateNeighborsInFront: the block it points into, and all round that but back at the repeater */
export function updateNeighborsInFront(level: Level, x: number, y: number, z: number, st: number): void {
  const f = facingOf(st);
  const d = OPPOSITE[f] as Dir;
  const fx = x + DX[d], fy = y + DY[d], fz = z + DZ[d];
  level.neighborChanged(fx, fy, fz, STATE_BLOCK[st], x, y, z);
  level.updateNeighborsAt(fx, fy, fz, STATE_BLOCK[st], f);
}

/** vanilla getSignal / getDirectSignal: 15 out of its front while powered */
const output = (_w: World, _x: number, _y: number, _z: number, st: number, dir: Dir) => (isOn(st) && facingOf(st) === dir ? 15 : 0);

registerBehavior('repeater', {
  // vanilla getStateForPlacement: its input toward the player, locked if it already is
  placement(ctx) {
    const facing = DIR_NAMES[OPPOSITE[dirFromYaw(ctx.yaw)]];
    const st = repeater().state({ facing });
    return repeater().with(st, 'locked', isLocked(ctx.world, ctx.x, ctx.y, ctx.z, st));
  },
  canSurvive: (w, x, y, z) => canSurviveOn(w.getState(x, y - 1, z)),
  // vanilla updateShape: its side neighbours decide whether it's locked
  updateShape(w, x, y, z, st) {
    if (!canSurviveOn(w.getState(x, y - 1, z))) return 0;
    return repeater().with(st, 'locked', isLocked(w, x, y, z, st));
  },
  isSignalSource: () => true,
  getSignal: output,
  getDirectSignal: output,
  setPlacedBy(level, x, y, z, st) {
    if (shouldTurnOn(level.world, x, y, z, st)) level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], 1);
  },
  onPlace(level, x, y, z, st) {
    updateNeighborsInFront(level, x, y, z, st);
  },
  onRemove(level, x, y, z, st, now, moving) {
    if (!moving && STATE_BLOCK[now] !== STATE_BLOCK[st]) updateNeighborsInFront(level, x, y, z, st);
  },
  neighborChanged(level, x, y, z, st) {
    if (canSurviveOn(level.world.getState(x, y - 1, z))) checkTickOnNeighbor(level, x, y, z, st);
    else {
      level.destroyBlock(x, y, z, true, null, false, null, false);
      for (const d of [DOWN, UP, NORTH, SOUTH, WEST, EAST]) level.updateNeighborsAt(x + DX[d], y + DY[d], z + DZ[d], STATE_BLOCK[st]);
    }
  },
  // vanilla DiodeBlock.tick: off when the input is gone; on (and off again after the delay if it's already gone)
  tick(level, x, y, z, st) {
    const w = level.world;
    if (isLocked(w, x, y, z, st)) return;
    const on = isOn(st), want = shouldTurnOn(w, x, y, z, st);
    if (on && !want) level.setBlock(x, y, z, repeater().with(st, 'powered', false), 2);
    else if (!on) {
      level.setBlock(x, y, z, repeater().with(st, 'powered', true), 2);
      if (!want) level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], delayOf(st), TickPriority.VERY_HIGH);
    }
  },
  // vanilla useWithoutItem: the next delay (players who may build)
  use(level, x, y, z, st, ctx) {
    const mode = ctx.player.gameMode;
    if (mode === 'adventure' || mode === 'spectator') return false;
    const d = repeater().get<number>(st, 'delay');
    level.setBlock(x, y, z, repeater().with(st, 'delay', (d % 4) + 1));
    return true;
  },
  // vanilla animateTick: a red speck by one of its torches while powered
  animateTick(level, x, y, z, st) {
    if (!isOn(st)) return;
    const d = facingOf(st);
    const r = Math.random;
    const px = x + 0.5 + (r() - 0.5) * 0.2, py = y + 0.4 + (r() - 0.5) * 0.2, pz = z + 0.5 + (r() - 0.5) * 0.2;
    let g = -5;
    if (r() < 0.5) g = repeater().get<number>(st, 'delay') * 2 - 1;
    g /= 16;
    level.particles.dust?.(px + g * DX[d], py, pz + g * DZ[d], 1, 0, 0, 1);
  },
});
