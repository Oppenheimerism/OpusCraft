// Candles (vanilla CandleBlock and AbstractCandleBlock): one to four of a colour to a block, another of the same going
// in beside them (not while sneaking); lit with flint and steel, a fire charge or a burning arrow, put out by an empty
// hand, by water poured in or a splash of it. Each lit candle gives 3 light, a small flame over its wick and now and
// then a wisp of smoke and a crackle; they stand on anything that holds up the middle of its top, and drop as many
// as there were.

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { UP } from '../world/dir';
import { registerBehavior } from './blockBehavior';
import { supportsCenter } from './redstone/support';
import { ItemStack } from '../item/item';
import { CANDLE_NAMES, CANDLE_LAYOUT } from '../world/blocksDeepDark';
import type { Level } from './level';
import type { Player } from '../entity/player';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const CANDLE_SET = new Set(CANDLE_NAMES);

/** vanilla CandleBlock.PARTICLE_OFFSETS: a pixel over each wick, for one to four candles */
const PARTICLE_OFFSETS: [number, number, number][][] = CANDLE_LAYOUT.map((l) => l.map(([x, z, h]) => [(x + 1) / 16, (h + 2) / 16, (z + 1) / 16]));

const offsets = (st: number) => PARTICLE_OFFSETS[blk(st).get<number>(st, 'candles') - 1];

export function isCandle(st: number): boolean {
  return CANDLE_SET.has(blk(st).name);
}

/** vanilla AbstractCandleBlock.isLit */
export function isLitCandle(st: number): boolean {
  return isCandle(st) && !!blk(st).get(st, 'lit');
}

/** vanilla CandleBlock.canLight: a candle that is out, and not under water */
export function canLightCandle(st: number): boolean {
  return isCandle(st) && !blk(st).get(st, 'lit') && !blk(st).get(st, 'waterlogged');
}

/** vanilla FlintAndSteelItem / FireChargeItem.useOn, and a dispenser's flint and steel: a candle that is out is lit; false if there's none to light */
export function lightCandle(level: Level, x: number, y: number, z: number): boolean {
  const st = level.getState(x, y, z);
  if (!canLightCandle(st)) return false;
  level.setBlock(x, y, z, blk(st).with(st, 'lit', true));
  return true;
}

/**
 * vanilla AbstractCandleBlock.extinguish: out it goes (to `st`, lit or not), a puff of smoke from each wick and a hiss;
 * a game event, by the player who blew it out
 */
function extinguish(level: Level, x: number, y: number, z: number, st: number, by: Player | null = null): void {
  level.setBlock(x, y, z, blk(st).with(st, 'lit', false));
  for (const [ox, oy, oz] of offsets(st)) level.particles.spawn?.('smoke', x + ox, y + oy, z + oz, 0, 0.1, 0);
  level.sound.play('block.candle.extinguish', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { entity: by });
}

/** a lit candle put out where it stands (vanilla ThrownPotion.dowseFire: a splash of water); false if there's none */
export function extinguishCandle(level: Level, x: number, y: number, z: number): boolean {
  const st = level.getState(x, y, z);
  if (!isLitCandle(st)) return false;
  extinguish(level, x, y, z, st);
  return true;
}

for (const name of CANDLE_NAMES) {
  const b = getBlock(name);
  registerBehavior(name, {
    // vanilla CandleBlock.getStateForPlacement: one more into a candle already there, else waterlogged in still water
    placement(ctx) {
      const cur = ctx.world.getState(ctx.x, ctx.y, ctx.z);
      if (blk(cur) === b) return b.with(cur, 'candles', Math.min(4, b.get<number>(cur, 'candles') + 1));
      const water = blk(cur).name === 'water' && blk(cur).get(cur, 'level') === 0;
      return b.with(b.defaultState, 'waterlogged', water);
    },
    // vanilla CandleBlock.canBeReplaced: the same candles in hand, fewer than four, and not while sneaking
    canBeReplaced(st, stack, sneaking) {
      return !sneaking && stack.item.id === name && b.get<number>(st, 'candles') < 4;
    },
    // vanilla CandleBlock.canSurvive: something that holds up the middle of its top underneath
    canSurvive(world, x, y, z) {
      return supportsCenter(world.getState(x, y - 1, z), UP);
    },
    // vanilla CandleBlock.useItemOn: an empty hand puts a lit candle out (not in adventure mode)
    use(level, x, y, z, st, ctx) {
      const p = ctx.player;
      if (p.inventory.inHand('main') || p.gameMode === 'adventure' || p.gameMode === 'spectator' || !b.get(st, 'lit')) return false;
      extinguish(level, x, y, z, st, p);
      return true;
    },
    // vanilla AbstractCandleBlock.onProjectileHit: something burning that strikes it lights it
    projectileHit(level, x, y, z, st, _hit, projectile) {
      if (projectile.isOnFire() && canLightCandle(st)) level.setBlock(x, y, z, b.with(st, 'lit', true));
    },
    // vanilla CandleBlock.placeLiquid: water poured in stays, putting a lit one out
    placeLiquid(level, x, y, z, st) {
      if (b.get(st, 'waterlogged')) return false;
      const wet = b.with(st, 'waterlogged', true);
      if (b.get(st, 'lit')) extinguish(level, x, y, z, wet);
      else level.setBlock(x, y, z, wet);
      return true;
    },
    // vanilla createCandleDrops: as many candles as there were
    drops(st) {
      return [ItemStack.of(name, b.get<number>(st, 'candles'))];
    },
    // vanilla AbstractCandleBlock.animateTick / addParticlesAndSound: over each lit wick a small flame, and now and
    // then smoke, sometimes with a crackle
    animateTick(level, x, y, z, st) {
      if (!b.get(st, 'lit')) return;
      for (const [ox, oy, oz] of offsets(st)) {
        const px = x + ox, py = y + oy, pz = z + oz;
        const f = Math.random();
        if (f < 0.3) {
          level.particles.spawn?.('smoke', px, py, pz, 0, 0, 0);
          if (f < 0.17) level.sound.play('block.candle.ambient', px + 0.5, py + 0.5, pz + 0.5, 1 + Math.random(), Math.random() * 0.7 + 0.3);
        }
        level.particles.spawn?.('small_flame', px, py, pz, 0, 0, 0);
      }
    },
  });
}
