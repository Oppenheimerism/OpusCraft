// The comparator (vanilla ComparatorBlock, ComparatorBlockEntity, and the DiodeBlock it is, shared with repeater.ts):
// it reads the power at its back — or, from a block a comparator can read (getAnalogOutputSignal), how full or far
// along it is, even through one solid block, or an item frame hung on that block — and weighs it against the
// strongest power coming in at its sides. Compare mode passes the back's power on while it's at least the sides';
// subtract mode takes the sides' from it. Two game ticks after its input changes it gives that out of its front.
// Right-click flips the mode. Here too: what each block gives a comparator, and the updates that tell comparators
// to read again (vanilla Level.updateNeighbourForOutputSignal is in level.ts).

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../../world/block';
import { NORTH, SOUTH, WEST, EAST, DX, DZ, DIR_NAMES, OPPOSITE, dirFromYaw, type Dir } from '../../world/dir';
import type { World } from '../../world/world';
import { BlockEntity, registerBlockEntityType } from '../../world/blockEntity';
import { isShulkerBox } from '../../world/blocksShulker';
import type { Container } from '../../inventory/container';
import { AABB } from '../../core/aabb';
import { ItemFrame } from '../../entity/itemFrame';
import { registerBehavior, behaviorOf } from '../blockBehavior';
import { TickPriority } from '../ticks';
import { getDirectSignal, isConductor, isSignalSource } from './signal';
import { isWire } from './wire';
import { canSurviveOn, inputSignal, shouldPrioritize, updateNeighborsInFront } from './repeater';
import type { Level } from '../level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

let COMPARATOR: Block | null = null;
const comparator = (): Block => (COMPARATOR ??= getBlock('comparator'));

const facingOf = (st: number): Dir => DIR_NAMES.indexOf(comparator().get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;
const isOn = (st: number) => comparator().get(st, 'powered') === true;
const isSubtract = (st: number) => comparator().get(st, 'mode') === 'subtract';

/** vanilla ComparatorBlockEntity: the power it gives out (a comparator's output isn't in its state) */
export class ComparatorBlockEntity extends BlockEntity {
  readonly id = 'comparator';
  output = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  protected override saveData(): Record<string, number> {
    return { OutputSignal: this.output };
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.output = Number(d.OutputSignal ?? 0);
  }
}

registerBlockEntityType('comparator', (x, y, z) => new ComparatorBlockEntity(x, y, z));

/** vanilla ComparatorBlock.getOutputSignal: what its block entity holds */
function outputOf(w: World, x: number, y: number, z: number): number {
  const be = w.getBlockEntity(x, y, z);
  return be instanceof ComparatorBlockEntity ? be.output : 0;
}

// ---------------------------------------------------------------------------
// What a comparator reads (vanilla getAnalogOutputSignal)

/**
 * vanilla AbstractContainerMenu.getRedstoneSignalFromContainer: how full it is, each stack counted against its own
 * largest size — 1 for anything at all, 15 when full (Mth.lerpDiscrete, in floats as vanilla sums them)
 */
export function redstoneSignalFromContainer(c: Container | null): number {
  if (!c || c.size === 0) return 0;
  let f = 0;
  for (let i = 0; i < c.size; i++) {
    const s = c.get(i);
    if (s && s.count > 0) f = Math.fround(f + Math.fround(s.count / Math.min(c.maxStackSize ?? 99, s.maxStack)));
  }
  f = Math.fround(f / c.size);
  return Math.floor(Math.fround(f * 14)) + (f > 0 ? 1 : 0);
}

/** vanilla getRedstoneSignalFromBlockEntity (a structure's chest has its loot rolled as it's read, as in vanilla) */
function containerSignal(level: Level, x: number, y: number, z: number): number {
  const be = level.world.getBlockEntity(x, y, z);
  if (!be) return 0;
  be.unpackLoot();
  return redstoneSignalFromContainer(be.container);
}

// the containers: chests and barrels, shulker boxes, the furnaces, the brewing stand, dispensers, droppers, hoppers
// and decorated pots (the crafter, lectern, copper bulbs and sculk sensors register their own)
for (const b of BLOCKS)
  if (/^(chest|barrel|furnace|smoker|blast_furnace|brewing_stand|dispenser|dropper|hopper|decorated_pot)$/.test(b.name) || isShulkerBox(b.name))
    registerBehavior(b.name, { analogOutput: containerSignal });
// vanilla ComposterBlock: its level (8 ready)
registerBehavior('composter', { analogOutput: (_l, _x, _y, _z, st) => blk(st).get<number>(st, 'level') });
// vanilla AbstractCauldronBlock (empty: 0), LayeredCauldronBlock (its level), LavaCauldronBlock (3)
registerBehavior('cauldron', { analogOutput: () => 0 });
registerBehavior('water_cauldron', { analogOutput: (_l, _x, _y, _z, st) => blk(st).get<number>(st, 'level') });
registerBehavior('lava_cauldron', { analogOutput: () => 3 });
// vanilla EndPortalFrameBlock: 15 with an eye in it
registerBehavior('end_portal_frame', { analogOutput: (_l, _x, _y, _z, st) => (blk(st).get(st, 'eye') ? 15 : 0) });

/** vanilla BlockState.hasAnalogOutputSignal */
export function hasAnalogOutput(st: number): boolean {
  return behaviorOf(st)?.analogOutput !== undefined;
}

// vanilla ItemFrame.setItem / setRotation: updateNeighbourForOutputSignal where the frame hangs
ItemFrame.onOutputChanged = (frame) => frame.level.updateNeighbourForOutputSignal(frame.tileX, frame.tileY, frame.tileZ, 0);

/** vanilla getItemFrame: the one item frame at (x, y, z) facing `d` (none if there are two) */
function itemFrameAt(level: Level, d: Dir, x: number, y: number, z: number): ItemFrame | null {
  const found = level.getEntities(new AABB(x, y, z, x + 1, y + 1, z + 1), (e) => e instanceof ItemFrame && !e.removed && e.direction === d);
  return found.length === 1 ? (found[0] as ItemFrame) : null;
}

/**
 * vanilla ComparatorBlock.getInputSignal: the power at its back; a block behind it a comparator can read gives its
 * reading instead, and through a conductor (while less than 15 comes through it) so does one beyond it, or an item
 * frame hung facing away on that conductor's far side, whichever gives more
 */
export function comparatorInput(level: Level, x: number, y: number, z: number, st: number): number {
  let i = inputSignal(level.world, x, y, z, st);
  const d = facingOf(st);
  let nx = x + DX[d], nz = z + DZ[d];
  let ns = level.getState(nx, y, nz);
  const read = behaviorOf(ns)?.analogOutput;
  if (read) return read(level, nx, y, nz, ns);
  if (i < 15 && isConductor(ns)) {
    nx += DX[d];
    nz += DZ[d];
    ns = level.getState(nx, y, nz);
    const frame = itemFrameAt(level, d, nx, y, nz);
    const beyond = behaviorOf(ns)?.analogOutput;
    const j = Math.max(frame ? frame.analogOutput() : -Infinity, beyond ? beyond(level, nx, y, nz, ns) : -Infinity);
    if (j !== -Infinity) i = j;
  }
  return i;
}

/** vanilla SignalGetter.getControlInputSignal (not diodes only): a redstone block, dust's power, or a source's strong power */
function controlInput(w: World, x: number, y: number, z: number, d: Dir): number {
  const st = w.getState(x, y, z);
  if (blk(st).name === 'redstone_block') return 15;
  if (isWire(st)) return blk(st).get<number>(st, 'power');
  return isSignalSource(st) ? getDirectSignal(w, x, y, z, d) : 0;
}

const CW: Record<number, Dir> = { [NORTH]: EAST, [EAST]: SOUTH, [SOUTH]: WEST, [WEST]: NORTH };
const CCW: Record<number, Dir> = { [NORTH]: WEST, [WEST]: SOUTH, [SOUTH]: EAST, [EAST]: NORTH };

/** vanilla DiodeBlock.getAlternateSignal: the stronger of what comes in at its two sides */
export function sideInput(w: World, x: number, y: number, z: number, st: number): number {
  const f = facingOf(st);
  const a = CW[f], b = CCW[f];
  return Math.max(controlInput(w, x + DX[a], y, z + DZ[a], a), controlInput(w, x + DX[b], y, z + DZ[b], b));
}

/** vanilla calculateOutputSignal: the back's power (none when a side's is stronger), less the sides' in subtract mode */
function calculateOutput(level: Level, x: number, y: number, z: number, st: number): number {
  const i = comparatorInput(level, x, y, z, st);
  if (i === 0) return 0;
  const j = sideInput(level.world, x, y, z, st);
  if (j > i) return 0;
  return isSubtract(st) ? i - j : i;
}

/** vanilla shouldTurnOn: the back's power beats the sides' (or, comparing, equals it) */
function shouldTurnOn(level: Level, x: number, y: number, z: number, st: number): boolean {
  const i = comparatorInput(level, x, y, z, st);
  if (i === 0) return false;
  const j = sideInput(level.world, x, y, z, st);
  return i > j || (i === j && !isSubtract(st));
}

/** vanilla checkTickOnNeighbor: a change of output (or of being on) comes 2 ticks later */
function checkTickOnNeighbor(level: Level, x: number, y: number, z: number, st: number): void {
  const id = comparator().id;
  if (level.willTickThisTick(x, y, z, id)) return;
  const i = calculateOutput(level, x, y, z, st);
  if (i === outputOf(level.world, x, y, z) && isOn(st) === shouldTurnOn(level, x, y, z, st)) return;
  level.scheduleBlockTick(x, y, z, id, 2, shouldPrioritize(level.world, x, y, z, st) ? TickPriority.HIGH : 0);
}

/** vanilla refreshOutputState: the new output into its block entity, powered to match, and the block in front told */
function refreshOutputState(level: Level, x: number, y: number, z: number, st: number): void {
  const i = calculateOutput(level, x, y, z, st);
  const be = level.world.getBlockEntity(x, y, z);
  let j = 0;
  if (be instanceof ComparatorBlockEntity) {
    j = be.output;
    be.output = i;
    if (i !== j) {
      const c = level.world.getChunk(x >> 4, z >> 4);
      if (c) c.modified = true;
    }
  }
  if (j === i && isSubtract(st)) return;
  const on = isOn(st), want = shouldTurnOn(level, x, y, z, st);
  if (on && !want) level.setBlock(x, y, z, comparator().with(st, 'powered', false), 2);
  else if (!on && want) level.setBlock(x, y, z, comparator().with(st, 'powered', true), 2);
  updateNeighborsInFront(level, x, y, z, st);
}

/** vanilla DiodeBlock.getSignal / getDirectSignal: its output out of its front while powered */
const output = (w: World, x: number, y: number, z: number, st: number, dir: Dir) => (isOn(st) && facingOf(st) === dir ? outputOf(w, x, y, z) : 0);

registerBehavior('comparator', {
  // vanilla DiodeBlock.getStateForPlacement: its back toward the player
  placement: (ctx) => comparator().state({ facing: DIR_NAMES[OPPOSITE[dirFromYaw(ctx.yaw)]] }),
  canSurvive: (w, x, y, z) => canSurviveOn(w.getState(x, y - 1, z)),
  updateShape: (w, x, y, z, st) => (canSurviveOn(w.getState(x, y - 1, z)) ? st : 0),
  isSignalSource: () => true,
  getSignal: output,
  getDirectSignal: output,
  setPlacedBy(level, x, y, z, st) {
    if (shouldTurnOn(level, x, y, z, st)) level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], 1);
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
      for (const [dx, dy, dz] of [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) level.updateNeighborsAt(x + dx, y + dy, z + dz, STATE_BLOCK[st]);
    }
  },
  tick(level, x, y, z, st) {
    refreshOutputState(level, x, y, z, st);
  },
  // vanilla useWithoutItem: the other mode, with its click (players who may build)
  use(level, x, y, z, st, ctx) {
    const mode = ctx.player.gameMode;
    if (mode === 'adventure' || mode === 'spectator') return false;
    const now = comparator().with(st, 'mode', isSubtract(st) ? 'compare' : 'subtract');
    level.sound.play('block.comparator.click', x + 0.5, y + 0.5, z + 0.5, 0.3, isSubtract(now) ? 0.55 : 0.5);
    level.setBlock(x, y, z, now, 2);
    refreshOutputState(level, x, y, z, now);
    return true;
  },
});
