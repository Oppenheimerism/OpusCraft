// The observer (vanilla ObserverBlock): its face watches the block in front of it, and when that block is set or
// reshaped (a shape update from it) it gives a 2-tick pulse of strong power out of its back two ticks later. Its own
// pulse isn't news to it, so it never sets itself off; an observer pushed by a piston fires as it lands, since the
// block in front of it is new to it then.

import { STATE_BLOCK, getBlock, type Block } from '../../world/block';
import { DIR_NAMES, type Dir } from '../../world/dir';
import type { World } from '../../world/world';
import { registerBehavior } from '../blockBehavior';
import { lookingDirections } from '../blockRules';
import { updateNeighborsInFront } from './repeater';
import type { Level } from '../level';

let OBSERVER: Block | null = null;
const observer = (): Block => (OBSERVER ??= getBlock('observer'));

const facingOf = (st: number): Dir => DIR_NAMES.indexOf(observer().get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;
const isOn = (st: number) => observer().get(st, 'powered') === true;

/** vanilla startSignal: a pulse 2 ticks from now, unless one is already coming */
function startSignal(level: Level, x: number, y: number, z: number): void {
  if (!level.hasScheduledTick(x, y, z, observer().id)) level.scheduleBlockTick(x, y, z, observer().id, 2);
}

/** vanilla getSignal / getDirectSignal: 15 out of its back while it pulses */
const output = (_w: World, _x: number, _y: number, _z: number, st: number, dir: Dir) => (isOn(st) && facingOf(st) === dir ? 15 : 0);

registerBehavior('observer', {
  // vanilla getStateForPlacement: its face the way the player looks (its back to them)
  placement: (ctx) => observer().state({ facing: DIR_NAMES[lookingDirections(ctx.yaw, ctx.pitch)[0]] }),
  // vanilla updateShape: the block its face watches changed
  shapeUpdate(level, x, y, z, st, dir) {
    if (facingOf(st) === dir && !isOn(st)) startSignal(level, x, y, z);
  },
  isSignalSource: () => true,
  getSignal: output,
  getDirectSignal: output,
  // vanilla tick: on, and off again 2 ticks later; the block behind it hears each
  tick(level, x, y, z, st) {
    if (isOn(st)) level.setBlock(x, y, z, observer().with(st, 'powered', false), 2);
    else {
      level.setBlock(x, y, z, observer().with(st, 'powered', true), 2);
      level.scheduleBlockTick(x, y, z, observer().id, 2);
    }
    updateNeighborsInFront(level, x, y, z, st);
  },
  // vanilla onPlace: one that arrives powered with no tick to turn it off goes off at once; (piston.ts sets a pushed
  // block down as "moving", where vanilla's updateFromNeighbourShapes shows it the block in front: it fires)
  onPlace(level, x, y, z, st, old, moving) {
    if (STATE_BLOCK[old] === observer().id) return;
    if (isOn(st)) {
      if (level.hasScheduledTick(x, y, z, observer().id)) return;
      const off = observer().with(st, 'powered', false);
      level.setBlock(x, y, z, off, 18);
      updateNeighborsInFront(level, x, y, z, off);
    } else if (moving) startSignal(level, x, y, z);
  },
  // vanilla onRemove: taken away mid-pulse, the block behind it hears the power go
  onRemove(level, x, y, z, st, now) {
    if (STATE_BLOCK[now] === observer().id) return;
    if (isOn(st) && level.hasScheduledTick(x, y, z, observer().id)) updateNeighborsInFront(level, x, y, z, observer().with(st, 'powered', false));
  },
});
