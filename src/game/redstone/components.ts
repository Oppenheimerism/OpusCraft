// What the redstone switches do, and what they switch (vanilla LeverBlock, ButtonBlock, BasePressurePlateBlock and
// its two kinds, RedstoneLampBlock, the redstone block, TntBlock, and the redstone half of DoorBlock, TrapDoorBlock
// and FenceGateBlock). A switch powers the block it hangs on (strongly, so that block powers its own neighbours)
// and the blocks around itself; doors, trapdoors, gates, lamps and TNT listen for power next to them.

import { BLOCKS, STATE_BLOCK, FLAGS, FACE_OCC, OUTLINE, F_FULL_COLLISION, F_LEAVES, Block, getBlock } from '../../world/block';
import { DOWN, UP, DX, DY, DZ, OPPOSITE, DIR_NAMES, dirFromYaw, type Dir } from '../../world/dir';
import type { World } from '../../world/world';
import { AABB } from '../../core/aabb';
import type { Entity } from '../../entity/entity';
import { LivingEntity } from '../../entity/living';
import { PrimedTnt } from '../../entity/tnt';
import { registerBehavior, type BlockBehavior } from '../blockBehavior';
import { lookingDirections, type PlaceContext } from '../blockRules';
import { hasNeighborSignal } from './signal';
import { BUTTON_WOODS } from '../../world/blocksRedstone';
import type { Level } from '../level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla BlockBehaviour.isFaceSturdy (FULL): the face is all there to hang something on */
function sturdy(st: number, face: number): boolean {
  return (FLAGS[st] & F_FULL_COLLISION && !(FLAGS[st] & F_LEAVES)) || ((FACE_OCC[st] >> face) & 1) === 1;
}

/** vanilla Block.canSupportCenter(UP): a full top, or the post of a fence, wall, pane or bars */
function supportsCenter(st: number): boolean {
  return sturdy(st, UP) || /_fence$|_wall$|_pane$|^iron_bars$|^chain$/.test(blk(st).name);
}

function isSpectator(e: Entity): boolean {
  return (e as { gameMode?: string }).gameMode === 'spectator';
}

// ---------------------------------------------------------------------------
// Face-attached switches (vanilla FaceAttachedHorizontalDirectionalBlock)

/** vanilla getConnectedDirection: the side the switch hangs from, seen from the switch */
function connected(st: number): Dir {
  const b = blk(st);
  const face = b.get(st, 'face');
  if (face === 'floor') return UP;
  if (face === 'ceiling') return DOWN;
  return DIR_NAMES.indexOf(b.get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;
}

/** vanilla FaceAttachedHorizontalDirectionalBlock.canSurvive: the block it hangs on has a sturdy face toward it */
function canAttach(w: World, x: number, y: number, z: number, st: number): boolean {
  const c = connected(st), d = OPPOSITE[c];
  return sturdy(w.getState(x + DX[d], y + DY[d], z + DZ[d]), c);
}

/** vanilla getStateForPlacement: the first of the looking directions (the clicked face first) it can hang from */
function attachedPlacement(block: Block, ctx: PlaceContext): number | null {
  const looking = lookingDirections(ctx.yaw, ctx.pitch);
  const back = OPPOSITE[ctx.face];
  const dirs = ctx.replaceClicked ? looking : [back, ...looking.filter((d) => d !== back)];
  const facing = DIR_NAMES[dirFromYaw(ctx.yaw)];
  for (const d of dirs) {
    const st = d === UP || d === DOWN ? block.state({ face: d === UP ? 'ceiling' : 'floor', facing }) : block.state({ face: 'wall', facing: DIR_NAMES[OPPOSITE[d]] });
    if (canAttach(ctx.world, ctx.x, ctx.y, ctx.z, st)) return st;
  }
  return null;
}

/** vanilla LeverBlock/ButtonBlock.updateNeighbours: around the switch, and around the block it hangs on */
function updateAttached(level: Level, x: number, y: number, z: number, st: number): void {
  const id = STATE_BLOCK[st];
  const d = OPPOSITE[connected(st)];
  level.updateNeighborsAt(x, y, z, id);
  level.updateNeighborsAt(x + DX[d], y + DY[d], z + DZ[d], id);
}

const powered = (st: number): boolean => blk(st).get(st, 'powered') === true;

/** what levers and buttons share: 15 all round when on, and strong power into what they hang on */
const ATTACHED_SWITCH: BlockBehavior = {
  canSurvive: (w, x, y, z, st) => canAttach(w, x, y, z, st),
  isSignalSource: () => true,
  getSignal: (_w, _x, _y, _z, st) => (powered(st) ? 15 : 0),
  getDirectSignal: (_w, _x, _y, _z, st, dir) => (powered(st) && connected(st) === dir ? 15 : 0),
  onRemove(level, x, y, z, st, now) {
    if (STATE_BLOCK[now] !== STATE_BLOCK[st] && powered(st)) updateAttached(level, x, y, z, st);
  },
};

function registerAttached(name: string, b: BlockBehavior): void {
  const block = getBlock(name);
  registerBehavior(name, { ...ATTACHED_SWITCH, placement: (ctx) => attachedPlacement(block, ctx), ...b });
}

// Lever
{
  /** vanilla LeverBlock.makeParticle: a redstone speck at the tip of the handle */
  const particle = (level: Level, x: number, y: number, z: number, st: number, scale: number) => {
    const f = OPPOSITE[DIR_NAMES.indexOf(blk(st).get<string>(st, 'facing') as (typeof DIR_NAMES)[number])];
    const c = OPPOSITE[connected(st)];
    level.particles.dust?.(x + 0.5 + 0.1 * DX[f] + 0.2 * DX[c], y + 0.5 + 0.1 * DY[f] + 0.2 * DY[c], z + 0.5 + 0.1 * DZ[f] + 0.2 * DZ[c], 1, 0, 0, scale);
  };
  registerAttached('lever', {
    // vanilla LeverBlock.useWithoutItem / pull
    use(level, x, y, z, st) {
      const b = blk(st);
      const now = b.with(st, 'powered', !powered(st));
      level.setBlock(x, y, z, now);
      updateAttached(level, x, y, z, now);
      if (powered(now)) particle(level, x, y, z, now, 1);
      level.sound.play('block.lever.click', x + 0.5, y + 0.5, z + 0.5, 0.3, powered(now) ? 0.6 : 0.5);
      return true;
    },
    animateTick(level, x, y, z, st) {
      if (powered(st) && Math.random() < 0.25) particle(level, x, y, z, st, 0.5);
    },
  });
}

// Buttons: pressed for 1 s (stone) or 1.5 s (wood); an arrow resting in a wooden one holds it down
{
  const soundKind = (name: string): string =>
    name === 'stone_button' || name === 'polished_blackstone_button' ? 'stone_button'
    : name === 'cherry_button' ? 'cherry_wood_button'
    : name === 'crimson_button' || name === 'warped_button' ? 'nether_wood_button'
    : 'wooden_button';
  const button = (name: string, ticks: number, arrows: boolean) => {
    const kind = soundKind(name);
    const click = (level: Level, x: number, y: number, z: number, on: boolean) => level.sound.play(`block.${kind}.click_${on ? 'on' : 'off'}`, x + 0.5, y + 0.5, z + 0.5, 0.3, 1);
    /** vanilla ButtonBlock.checkPressed: is an arrow in it? (stone buttons never ask) */
    const checkPressed = (level: Level, x: number, y: number, z: number, st: number) => {
      let arrow = false;
      if (arrows) {
        // (vanilla: arrows within the bounds of the button's shape)
        const [x0, y0, z0, x1, y1, z1] = OUTLINE[st][0];
        arrow = level.getEntities(new AABB(x + x0, y + y0, z + z0, x + x1, y + y1, z + z1), (e) => e.type === 'arrow').length > 0;
      }
      if (arrow !== powered(st)) {
        const now = blk(st).with(st, 'powered', arrow);
        level.setBlock(x, y, z, now);
        updateAttached(level, x, y, z, now);
        click(level, x, y, z, arrow);
      }
      if (arrow) level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], ticks);
    };
    registerAttached(name, {
      // vanilla ButtonBlock.useWithoutItem / press
      use(level, x, y, z, st) {
        if (powered(st)) return true;
        const now = blk(st).with(st, 'powered', true);
        level.setBlock(x, y, z, now);
        updateAttached(level, x, y, z, now);
        level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], ticks);
        click(level, x, y, z, true);
        return true;
      },
      tick(level, x, y, z, st) {
        if (powered(st)) checkPressed(level, x, y, z, st);
      },
      entityInside: arrows
        ? (level, x, y, z, st) => {
            if (!powered(st)) checkPressed(level, x, y, z, st);
          }
        : undefined,
    });
  };
  button('stone_button', 20, false);
  button('polished_blackstone_button', 20, false);
  for (const w of BUTTON_WOODS) button(`${w}_button`, 30, true);
}

// Pressure plates: wooden ones feel anything, stone ones only the living; the weighted ones count what's on them
{
  /** vanilla BasePressurePlateBlock.TOUCH_AABB */
  const touch = (x: number, y: number, z: number) => new AABB(x + 0.0625, y, z + 0.0625, x + 0.9375, y + 0.25, z + 0.9375);
  const plate = (name: string, kind: string, strength: (level: Level, x: number, y: number, z: number) => number, pressedTime: number, weighted: boolean) => {
    const signalFor = (st: number): number => (weighted ? blk(st).get<number>(st, 'power') : powered(st) ? 15 : 0);
    const withSignal = (st: number, s: number): number => (weighted ? blk(st).with(st, 'power', s) : blk(st).with(st, 'powered', s > 0));
    /** vanilla BasePressurePlateBlock.updateNeighbours: around the plate and under it */
    const updateAround = (level: Level, x: number, y: number, z: number, id: number) => {
      level.updateNeighborsAt(x, y, z, id);
      level.updateNeighborsAt(x, y - 1, z, id);
    };
    /** vanilla BasePressurePlateBlock.checkPressed */
    const checkPressed = (level: Level, x: number, y: number, z: number, st: number, current: number) => {
      const s = strength(level, x, y, z);
      if (current !== s) {
        level.setBlock(x, y, z, withSignal(st, s), 2);
        updateAround(level, x, y, z, STATE_BLOCK[st]);
      }
      if (s === 0 && current > 0) level.sound.play(`block.${kind}.click_off`, x + 0.5, y + 0.1, z + 0.5, 0.3, 1);
      else if (s > 0 && current === 0) level.sound.play(`block.${kind}.click_on`, x + 0.5, y + 0.1, z + 0.5, 0.3, 1);
      if (s > 0) level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], pressedTime);
    };
    registerBehavior(name, {
      canSurvive: (w, x, y, z) => supportsCenter(w.getState(x, y - 1, z)),
      isSignalSource: () => true,
      getSignal: (_w, _x, _y, _z, st) => signalFor(st),
      getDirectSignal: (_w, _x, _y, _z, st, dir) => (dir === UP ? signalFor(st) : 0),
      tick(level, x, y, z, st) {
        const i = signalFor(st);
        if (i > 0) checkPressed(level, x, y, z, st, i);
      },
      entityInside(level, x, y, z, st) {
        const i = signalFor(st);
        if (i === 0) checkPressed(level, x, y, z, st, i);
      },
      onRemove(level, x, y, z, st, now) {
        if (STATE_BLOCK[now] !== STATE_BLOCK[st] && signalFor(st) > 0) updateAround(level, x, y, z, STATE_BLOCK[st]);
      },
    });
  };
  const count = (level: Level, x: number, y: number, z: number, living: boolean) => level.getEntities(touch(x, y, z), (e) => !isSpectator(e) && (!living || e instanceof LivingEntity)).length;
  // vanilla PressurePlateBlock.getSignalStrength
  const anything = (level: Level, x: number, y: number, z: number) => (count(level, x, y, z, false) > 0 ? 15 : 0);
  const mobs = (level: Level, x: number, y: number, z: number) => (count(level, x, y, z, true) > 0 ? 15 : 0);
  // vanilla WeightedPressurePlateBlock.getSignalStrength: the share of its capacity, rounded up
  const weight = (max: number) => (level: Level, x: number, y: number, z: number) => {
    const n = Math.min(count(level, x, y, z, false), max);
    return n > 0 ? Math.ceil((n / max) * 15) : 0;
  };
  plate('stone_pressure_plate', 'stone_pressure_plate', mobs, 20, false);
  plate('polished_blackstone_pressure_plate', 'stone_pressure_plate', mobs, 20, false);
  for (const w of BUTTON_WOODS) {
    const kind = w === 'cherry' ? 'cherry_wood_pressure_plate' : w === 'crimson' || w === 'warped' ? 'nether_wood_pressure_plate' : 'wooden_pressure_plate';
    plate(`${w}_pressure_plate`, kind, anything, 20, false);
  }
  plate('light_weighted_pressure_plate', 'metal_pressure_plate', weight(15), 10, true);
  plate('heavy_weighted_pressure_plate', 'metal_pressure_plate', weight(150), 10, true);
}

// The redstone block: weak power all round, always
registerBehavior('redstone_block', { isSignalSource: () => true, getSignal: () => 15 });

// Redstone lamp: lights at once, goes out 4 ticks after the power does
registerBehavior('redstone_lamp', {
  placement: (ctx) => getBlock('redstone_lamp').state({ lit: hasNeighborSignal(ctx.world, ctx.x, ctx.y, ctx.z) }),
  neighborChanged(level, x, y, z, st) {
    const lit = blk(st).get(st, 'lit') === true;
    if (lit === hasNeighborSignal(level.world, x, y, z)) return;
    if (lit) level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], 4);
    else level.setBlock(x, y, z, blk(st).with(st, 'lit', true), 2);
  },
  tick(level, x, y, z, st) {
    if (blk(st).get(st, 'lit') && !hasNeighborSignal(level.world, x, y, z)) level.setBlock(x, y, z, blk(st).with(st, 'lit', false), 2);
  },
});

// TNT: power primes it (vanilla TntBlock.onPlace / neighborChanged)
{
  const prime = (level: Level, x: number, y: number, z: number) => {
    PrimedTnt.prime(level, x, y, z, null);
    level.setBlock(x, y, z, 0);
  };
  registerBehavior('tnt', {
    onPlace(level, x, y, z, st, old) {
      if (STATE_BLOCK[old] !== STATE_BLOCK[st] && hasNeighborSignal(level.world, x, y, z)) prime(level, x, y, z);
    },
    neighborChanged(level, x, y, z) {
      if (hasNeighborSignal(level.world, x, y, z)) prime(level, x, y, z);
    },
  });
}

// Doors, trapdoors and fence gates open while powered, and close when the power goes
/** vanilla BlockSetType / WoodType: which open and close sounds a door, trapdoor or gate makes */
export function openSound(name: string, open: boolean): string {
  const wood = /^(crimson|warped)_/.test(name) ? 'nether_wood_' : name.startsWith('cherry_') ? 'cherry_wood_' : '';
  const kind = name.startsWith('iron_') ? name
    : name.endsWith('_door') ? `${wood || 'wooden_'}door`
    : name.endsWith('_trapdoor') ? `${wood || 'wooden_'}trapdoor`
    : `${wood}fence_gate`;
  return `block.${kind}.${open ? 'open' : 'close'}`;
}

for (const b of BLOCKS) {
  const n = b.name;
  const play = (level: Level, x: number, y: number, z: number, open: boolean) => level.sound.play(openSound(n, open), x + 0.5, y + 0.5, z + 0.5, 1, Math.random() * 0.1 + 0.9);
  if (n.endsWith('_door')) {
    // vanilla DoorBlock.neighborChanged: either half powered powers the door (its own other half doesn't count as news)
    registerBehavior(n, {
      neighborChanged(level, x, y, z, st, source) {
        const other = b.get(st, 'half') === 'lower' ? y + 1 : y - 1;
        const on = hasNeighborSignal(level.world, x, y, z) || hasNeighborSignal(level.world, x, other, z);
        if (source === b.id || on === b.get(st, 'powered')) return;
        if (on !== b.get(st, 'open')) play(level, x, y, z, on);
        level.setBlock(x, y, z, b.with(b.with(st, 'powered', on), 'open', on), 2);
      },
    });
  } else if (n.endsWith('_trapdoor')) {
    // vanilla TrapDoorBlock.neighborChanged
    registerBehavior(n, {
      neighborChanged(level, x, y, z, st) {
        const on = hasNeighborSignal(level.world, x, y, z);
        if (on === b.get(st, 'powered')) return;
        let now = b.with(st, 'powered', on);
        if (b.get(st, 'open') !== on) {
          now = b.with(now, 'open', on);
          play(level, x, y, z, on);
        }
        level.setBlock(x, y, z, now, 2);
      },
    });
  } else if (n.endsWith('_fence_gate')) {
    // vanilla FenceGateBlock.neighborChanged
    registerBehavior(n, {
      neighborChanged(level, x, y, z, st) {
        const on = hasNeighborSignal(level.world, x, y, z);
        if (b.get(st, 'powered') === on) return;
        level.setBlock(x, y, z, b.with(b.with(st, 'powered', on), 'open', on), 2);
        if (b.get(st, 'open') !== on) play(level, x, y, z, on);
      },
    });
  }
}
