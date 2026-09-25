// The tripwire hook and tripwire (vanilla TripWireHookBlock, TripWireBlock): two hooks facing each other with string
// between them (up to 40 blocks of it) are attached; anything in the string's space trips it, and both hooks give 15
// all round, and strongly into the blocks they hang on, until it's clear (looked at again every 10 ticks). Breaking
// the string trips it for a moment; cutting it with shears disarms it first, and the hooks just let go.

import { BLOCKS, STATE_BLOCK, OUTLINE, getBlock, type Block } from '../../world/block';
import { UP, DOWN, NORTH, SOUTH, WEST, EAST, DX, DZ, DIR_NAMES, OPPOSITE, type Dir } from '../../world/dir';
import type { World } from '../../world/world';
import { AABB } from '../../core/aabb';
import { registerBehavior } from '../blockBehavior';
import { lookingDirections, type PlaceContext } from '../blockRules';
import { sturdyFace } from './support';
import type { Level } from '../level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

let HOOK: Block | null = null, WIRE: Block | null = null;
const hook = () => (HOOK ??= getBlock('tripwire_hook'));
const wire = () => (WIRE ??= getBlock('tripwire'));
const isHook = (st: number) => STATE_BLOCK[st] === hook().id;
const isWire = (st: number) => STATE_BLOCK[st] === wire().id;

const is = (st: number, prop: string) => blk(st).get(st, prop) === true;
const facingOf = (st: number): Dir => DIR_NAMES.indexOf(blk(st).get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;

/** vanilla WIRE_DIST_MAX: a hook looks 41 blocks along for the other */
const WIRE_DIST_MAX = 42;
/** vanilla RECHECK_PERIOD */
const RECHECK_PERIOD = 10;

// ---------------------------------------------------------------------------
// The hook

/** vanilla TripWireHookBlock.canSurvive: a sturdy face behind it */
function hookSurvives(w: World, x: number, y: number, z: number, st: number): boolean {
  const f = facingOf(st), d = OPPOSITE[f];
  return sturdyFace(w.getState(x + DX[d], y, z + DZ[d]), f);
}

/** vanilla getStateForPlacement: facing away from the first horizontal looking direction there's a wall along */
function hookPlacement(ctx: PlaceContext): number | null {
  const looking = lookingDirections(ctx.yaw, ctx.pitch);
  const back = OPPOSITE[ctx.face];
  const dirs = ctx.replaceClicked ? looking : [back, ...looking.filter((d) => d !== back)];
  for (const d of dirs) {
    if (d === UP || d === DOWN) continue;
    const st = hook().state({ facing: DIR_NAMES[OPPOSITE[d]] });
    if (hookSurvives(ctx.world, ctx.x, ctx.y, ctx.z, st)) return st;
  }
  return null;
}

/** vanilla notifyNeighbors: around the hook and around the block it hangs on */
function notifyNeighbors(level: Level, x: number, y: number, z: number, facing: Dir): void {
  const d = OPPOSITE[facing];
  level.updateNeighborsAt(x, y, z, hook().id);
  level.updateNeighborsAt(x + DX[d], y, z + DZ[d], hook().id);
}

/** vanilla emitState: the click when it's tripped or let go, else the sound of being strung or unstrung */
function emitState(level: Level, x: number, y: number, z: number, attached: boolean, on: boolean, wasAttached: boolean, wasOn: boolean): void {
  const s = level.sound, cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
  // (each with its game event, by no one)
  if (on && !wasOn) {
    s.play('block.tripwire.click_on', cx, cy, cz, 0.4, 0.6);
    level.gameEvent('block_activate', cx, cy, cz);
  } else if (!on && wasOn) {
    s.play('block.tripwire.click_off', cx, cy, cz, 0.4, 0.5);
    level.gameEvent('block_deactivate', cx, cy, cz);
  } else if (attached && !wasAttached) {
    s.play('block.tripwire.attach', cx, cy, cz, 0.4, 0.7);
    level.gameEvent('block_attach', cx, cy, cz);
  } else if (!attached && wasAttached) {
    s.play('block.tripwire.detach', cx, cy, cz, 0.4, 1.2 / (level.random.nextFloat() * 0.2 + 0.9));
    level.gameEvent('block_detach', cx, cy, cz);
  }
}

/**
 * vanilla TripWireHookBlock.calculateState: look along the hook for the other one (facing back), over string only.
 * Both are attached if it's there with string between, and powered if an armed piece of it is pressed. `removing`:
 * the hook here is going (only the far one changes). `range` and `wireState`: the string that far along is becoming
 * `wireState` (it may already be gone). The string between is told when the hooks come to hold it or let it go.
 */
export function calculateState(level: Level, x: number, y: number, z: number, hookState: number, removing: boolean, notify: boolean, range: number, wireState: number | null): void {
  const w = level.world;
  const dir = facingOf(hookState);
  const wasAttached = is(hookState, 'attached'), wasOn = is(hookState, 'powered');
  let attached = !removing, on = false, far = 0;
  const strung: (number | null)[] = [];
  for (let j = 1; j < WIRE_DIST_MAX; j++) {
    let st = w.getState(x + DX[dir] * j, y, z + DZ[dir] * j);
    if (isHook(st)) {
      if (facingOf(st) === OPPOSITE[dir]) far = j;
      break;
    }
    if (!isWire(st) && j !== range) {
      strung[j] = null;
      attached = false;
    } else {
      if (j === range && wireState !== null) st = wireState;
      const armed = !is(st, 'disarmed');
      on ||= armed && is(st, 'powered');
      strung[j] = st;
      if (j === range) {
        level.scheduleBlockTick(x, y, z, hook().id, RECHECK_PERIOD);
        attached &&= armed;
      }
    }
  }
  attached &&= far > 1;
  on &&= attached;
  const now = hook().with(hook().with(hook().defaultState, 'attached', attached), 'powered', on);
  if (far > 0) {
    const fx = x + DX[dir] * far, fz = z + DZ[dir] * far;
    const back = OPPOSITE[dir] as Dir;
    level.setBlock(fx, y, fz, hook().with(now, 'facing', DIR_NAMES[back]));
    notifyNeighbors(level, fx, y, fz, back);
    emitState(level, fx, y, fz, attached, on, wasAttached, wasOn);
  }
  emitState(level, x, y, z, attached, on, wasAttached, wasOn);
  if (!removing) {
    level.setBlock(x, y, z, hook().with(now, 'facing', DIR_NAMES[dir]));
    if (notify) notifyNeighbors(level, x, y, z, dir);
  }
  if (wasAttached !== attached)
    for (let k = 1; k < far; k++) {
      const st = strung[k];
      if (st === null || st === undefined) continue;
      const px = x + DX[dir] * k, pz = z + DZ[dir] * k;
      // (only where string or a hook still is: what was cut stays cut)
      const there = w.getState(px, y, pz);
      if (isWire(there) || isHook(there)) level.setBlock(px, y, pz, blk(st).with(st, 'attached', attached));
    }
}

registerBehavior('tripwire_hook', {
  placement: hookPlacement,
  canSurvive: hookSurvives,
  // vanilla updateShape: it drops off when the block behind goes
  updateShape: (w, x, y, z, st) => (hookSurvives(w, x, y, z, st) ? st : 0),
  setPlacedBy(level, x, y, z, st) {
    calculateState(level, x, y, z, st, false, false, -1, null);
  },
  tick(level, x, y, z, st) {
    calculateState(level, x, y, z, st, false, true, -1, null);
  },
  onRemove(level, x, y, z, st, now, moving) {
    if (moving || STATE_BLOCK[now] === STATE_BLOCK[st]) return;
    const attached = is(st, 'attached'), on = is(st, 'powered');
    if (attached || on) calculateState(level, x, y, z, st, true, false, -1, null);
    if (on) notifyNeighbors(level, x, y, z, facingOf(st));
  },
  isSignalSource: () => true,
  getSignal: (_w, _x, _y, _z, st) => (is(st, 'powered') ? 15 : 0),
  getDirectSignal: (_w, _x, _y, _z, st, dir) => (is(st, 'powered') && facingOf(st) === dir ? 15 : 0),
});

// ---------------------------------------------------------------------------
// The string

/** vanilla TripWireBlock.shouldConnectTo: more string, or a hook facing it */
function connectsTo(st: number, d: Dir): boolean {
  return isHook(st) ? facingOf(st) === OPPOSITE[d] : isWire(st);
}

function connections(w: World, x: number, y: number, z: number, st: number): number {
  let s = st;
  for (const d of [NORTH, EAST, SOUTH, WEST] as Dir[]) s = wire().with(s, DIR_NAMES[d], connectsTo(w.getState(x + DX[d], y, z + DZ[d]), d));
  return s;
}

/** vanilla updateSource: the hook to the south or west of it (facing it, along string) works the line out again */
function updateSource(level: Level, x: number, y: number, z: number, st: number): void {
  const w = level.world;
  for (const d of [SOUTH, WEST] as Dir[])
    for (let i = 1; i < WIRE_DIST_MAX; i++) {
      const px = x + DX[d] * i, pz = z + DZ[d] * i;
      const there = w.getState(px, y, pz);
      if (isHook(there)) {
        if (facingOf(there) === OPPOSITE[d]) calculateState(level, px, y, pz, there, false, true, i, st);
        break;
      }
      if (!isWire(there)) break;
    }
}

/** vanilla checkPressed: anything within its shape presses it; pressed, it looks again in 10 ticks */
function checkPressed(level: Level, x: number, y: number, z: number): void {
  let st = level.getState(x, y, z);
  const was = is(st, 'powered');
  const [x0, y0, z0, x1, y1, z1] = OUTLINE[st][0];
  const pressed = level.getEntities(new AABB(x + x0, y + y0, z + z0, x + x1, y + y1, z + z1)).length > 0;
  if (pressed !== was) {
    st = wire().with(st, 'powered', pressed);
    level.setBlock(x, y, z, st);
    updateSource(level, x, y, z, st);
  }
  if (pressed) level.scheduleBlockTick(x, y, z, wire().id, RECHECK_PERIOD);
}

registerBehavior('tripwire', {
  placement: (ctx) => connections(ctx.world, ctx.x, ctx.y, ctx.z, wire().defaultState),
  updateShape: (w, x, y, z, st) => connections(w, x, y, z, st),
  onPlace(level, x, y, z, st, old) {
    if (STATE_BLOCK[old] !== STATE_BLOCK[st]) updateSource(level, x, y, z, st);
  },
  // (gone, it counts as pressed: the hooks click on, and off at their next look)
  onRemove(level, x, y, z, st, now, moving) {
    if (!moving && STATE_BLOCK[now] !== STATE_BLOCK[st]) updateSource(level, x, y, z, wire().with(st, 'powered', true));
  },
  // vanilla playerWillDestroy: shears disarm it before it goes (without telling the neighbours)
  playerWillDestroy(level, x, y, z, st, player, held) {
    if (held?.item.id !== 'shears') return;
    level.setBlock(x, y, z, wire().with(st, 'disarmed', true), 4);
    level.gameEvent('shear', x + 0.5, y + 0.5, z + 0.5, { entity: player });
  },
  entityInside(level, x, y, z, st) {
    if (!is(st, 'powered')) checkPressed(level, x, y, z);
  },
  tick(level, x, y, z, st) {
    if (is(st, 'powered')) checkPressed(level, x, y, z);
  },
});
