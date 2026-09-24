// The redstone torch and redstone wall torch (vanilla RedstoneTorchBlock, RedstoneWallTorchBlock): lit, it gives 15 to
// everything round it but the block it's on, and strongly powers the block above; power in the block it's on puts it
// out two ticks later, and it lights again two ticks after the power goes. Put out eight times in 60 ticks it burns
// out: it fizzes and smokes, and stays out until those toggles are 60 ticks old (it looks again 160 ticks on).

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DY, DZ, DIR_NAMES, OPPOSITE, type Dir } from '../../world/dir';
import type { World } from '../../world/world';
import { registerBehavior } from '../blockBehavior';
import { lookingDirections, type PlaceContext } from '../blockRules';
import { hasSignal } from './signal';
import { sturdyFace, supportsCenter } from './support';
import type { Level } from '../level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const ALL: Dir[] = [DOWN, UP, NORTH, SOUTH, WEST, EAST];

/** vanilla RECENT_TOGGLE_TIMER, MAX_RECENT_TOGGLES, RESTART_DELAY, TOGGLE_DELAY */
const RECENT_TOGGLE_TIMER = 60, MAX_RECENT_TOGGLES = 8, RESTART_DELAY = 160, TOGGLE_DELAY = 2;

/** vanilla RECENT_TOGGLES: each level's torches put out lately (position, game time) */
const RECENT = new WeakMap<Level, { x: number; y: number; z: number; when: number }[]>();

/** vanilla isToggledTooFrequently: eight or more recent toggles here (logging this one first when `log`) */
function toggledTooFrequently(level: Level, x: number, y: number, z: number, log: boolean): boolean {
  let list = RECENT.get(level);
  if (!list) RECENT.set(level, (list = []));
  if (log) list.push({ x, y, z, when: level.gameTime });
  let n = 0;
  for (const t of list) if (t.x === x && t.y === y && t.z === z && ++n >= MAX_RECENT_TOGGLES) return true;
  return false;
}

let TORCH: Block | null = null, WALL: Block | null = null;
const torch = () => (TORCH ??= getBlock('redstone_torch'));
const wallTorch = () => (WALL ??= getBlock('redstone_wall_torch'));

const lit = (st: number) => blk(st).get(st, 'lit') === true;
const facingOf = (st: number): Dir => DIR_NAMES.indexOf(blk(st).get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;

/** vanilla WallTorchBlock.canSurvive: a sturdy face behind it */
function wallSurvives(w: World, x: number, y: number, z: number, st: number): boolean {
  const d = OPPOSITE[facingOf(st)];
  return sturdyFace(w.getState(x + DX[d], y, z + DZ[d]), facingOf(st));
}

/** vanilla WallTorchBlock.getStateForPlacement: the first horizontal looking direction there's a wall behind */
function wallPlacement(ctx: PlaceContext, dirs: number[]): number | null {
  for (const d of dirs) {
    if (d === UP || d === DOWN) continue;
    const st = wallTorch().state({ facing: DIR_NAMES[OPPOSITE[d]] });
    if (wallSurvives(ctx.world, ctx.x, ctx.y, ctx.z, st)) return st;
  }
  return null;
}

/**
 * vanilla StandingAndWallBlockItem.getPlacementState: through the looking directions (the clicked face's back first),
 * never up; down means standing, anything else the wall torch — the first that can stay there
 */
function torchPlacement(ctx: PlaceContext): number | null {
  const looking = lookingDirections(ctx.yaw, ctx.pitch);
  const back = OPPOSITE[ctx.face];
  const dirs = ctx.replaceClicked ? looking : [back, ...looking.filter((d) => d !== back)];
  const wall = wallPlacement(ctx, dirs);
  for (const d of dirs) {
    if (d === UP) continue;
    const st = d === DOWN ? torch().defaultState : wall;
    if (st !== null && (d === DOWN ? supportsCenter(ctx.world.getState(ctx.x, ctx.y - 1, ctx.z)) : wallSurvives(ctx.world, ctx.x, ctx.y, ctx.z, st))) return st;
  }
  return null;
}

/** vanilla hasNeighborSignal: power in the block it's on */
function powered(w: World, x: number, y: number, z: number, st: number): boolean {
  if (STATE_BLOCK[st] === torch().id) return hasSignal(w, x, y - 1, z, DOWN);
  const d = OPPOSITE[facingOf(st)] as Dir;
  return hasSignal(w, x + DX[d], y + DY[d], z + DZ[d], d);
}

function updateAround(level: Level, x: number, y: number, z: number, id: number): void {
  for (const d of ALL) level.updateNeighborsAt(x + DX[d], y + DY[d], z + DZ[d], id);
}

/** vanilla levelEvent 1502 (REDSTONE_TORCH_BURNOUT): the fizz and five puffs of smoke */
function burnout(level: Level, x: number, y: number, z: number): void {
  const r = Math.random;
  level.sound.play('block.redstone_torch.burnout', x + 0.5, y + 0.5, z + 0.5, 0.5, 2.6 + (r() - r()) * 0.8);
  for (let i = 0; i < 5; i++) level.particles.spawn?.('smoke', x + r() * 0.6 + 0.2, y + r() * 0.6 + 0.2, z + r() * 0.6 + 0.2, 0, 0, 0);
}

for (const name of ['redstone_torch', 'redstone_wall_torch']) {
  const standing = name === 'redstone_torch';
  registerBehavior(name, {
    placement: torchPlacement,
    canSurvive: standing ? (w, x, y, z) => supportsCenter(w.getState(x, y - 1, z)) : wallSurvives,
    isSignalSource: () => true,
    // vanilla getSignal: 15 all round but toward the block it's on
    getSignal: standing
      ? (_w, _x, _y, _z, st, dir) => (lit(st) && dir !== UP ? 15 : 0)
      : (_w, _x, _y, _z, st, dir) => (lit(st) && facingOf(st) !== dir ? 15 : 0),
    // vanilla getDirectSignal: strongly into the block above
    getDirectSignal: (_w, _x, _y, _z, st, dir) => (dir === DOWN && lit(st) ? 15 : 0),
    onPlace(level, x, y, z, st) {
      updateAround(level, x, y, z, STATE_BLOCK[st]);
    },
    onRemove(level, x, y, z, st, _now, moving) {
      if (!moving) updateAround(level, x, y, z, STATE_BLOCK[st]);
    },
    neighborChanged(level, x, y, z, st) {
      if (lit(st) === powered(level.world, x, y, z, st) && !level.willTickThisTick(x, y, z, STATE_BLOCK[st])) level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], TOGGLE_DELAY);
    },
    tick(level, x, y, z, st) {
      const on = powered(level.world, x, y, z, st);
      const list = RECENT.get(level);
      while (list?.length && level.gameTime - list[0].when > RECENT_TOGGLE_TIMER) list.shift();
      if (lit(st)) {
        if (on) {
          level.setBlock(x, y, z, blk(st).with(st, 'lit', false));
          if (toggledTooFrequently(level, x, y, z, true)) {
            burnout(level, x, y, z);
            level.scheduleBlockTick(x, y, z, STATE_BLOCK[level.getState(x, y, z)], RESTART_DELAY);
          }
        }
      } else if (!on && !toggledTooFrequently(level, x, y, z, false)) level.setBlock(x, y, z, blk(st).with(st, 'lit', true));
    },
    // vanilla animateTick: a red speck at the head while lit (off to the wall torch's side)
    animateTick(level, x, y, z, st) {
      if (!lit(st)) return;
      const r = Math.random;
      let px = x + 0.5 + (r() - 0.5) * 0.2, py = y + 0.7 + (r() - 0.5) * 0.2, pz = z + 0.5 + (r() - 0.5) * 0.2;
      if (!standing) {
        const d = OPPOSITE[facingOf(st)];
        px += 0.27 * DX[d];
        py += 0.22;
        pz += 0.27 * DZ[d];
      }
      level.particles.dust?.(px, py, pz, 1, 0, 0, 1);
    },
  });
}

