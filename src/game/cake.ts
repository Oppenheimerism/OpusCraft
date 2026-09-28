// (cake) What the cake and the candle cakes do (vanilla CakeBlock, CandleCakeBlock and AbstractCandleBlock).
//
// A cake is eaten a slice at a time by using it, but only by someone hungry (or who can't be hurt: creative): each
// slice 2 food and 0.4 saturation, EAT heard; after the seventh the cake is gone (BLOCK_DESTROY). Eating makes no
// sound (vanilla has none). A comparator reads 14 from a whole cake, 2 less for each slice eaten. It needs something
// solid under it (vanilla isSolid: another cake, a sign or a banner will do) and drops nothing when broken, even with
// silk touch. A candle used on an uneaten cake goes into it (one candle, not in creative; block.cake.add_candle,
// BLOCK_CHANGE) and it's that candle's candle cake.
//
// A candle cake is lit by flint and steel, a fire charge, a burning arrow or a dispenser's flint and steel (game/
// candles.ts: its kin), and put out by an empty hand on the candle (not on the cake), a splash of water or a wind
// burst. Used anywhere else (or by a hand with something in it) it's eaten as the uneaten cake it is: the candle
// drops and a cake with a slice gone is left. It reads 14, drops its candle when broken, and picks as a cake.

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { registerBehavior } from './blockBehavior';
import { ItemStack } from '../item/item';
import { ItemEntity } from '../entity/itemEntity';
import { legacySolid } from './banners';
import { registerCandleKin } from './candles';
import { CANDLE_CAKE_NAMES, candleCakeFor, candleOf } from '../world/blocksCake';
import type { Level } from './level';
import type { Player } from '../entity/player';
import type { World } from '../world/world';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla CakeBlock.FULL_CAKE_SIGNAL */
export const FULL_CAKE_SIGNAL = 14;

/** vanilla CakeBlock.getOutputSignal: 14 for a whole cake, 2 less a slice */
export function cakeSignal(bites: number): number {
  return (7 - bites) * 2;
}

/** vanilla Player.canEat(false): hungry, or unhurtable (creative) */
export function canEatCake(p: Player): boolean {
  return p.invulnerable || p.food.needsFood();
}

/** vanilla CakeBlock.canSurvive (and CandleCakeBlock's): something solid underneath */
function survives(world: World, x: number, y: number, z: number): boolean {
  return legacySolid(world.getState(x, y - 1, z));
}

const isCandleCake = (st: number): boolean => CANDLE_CAKE_NAMES.includes(blk(st).name);

/**
 * vanilla CakeBlock.eat: a slice of the cake `state` eaten by `p`, if it can eat: 2 food, 0.4 saturation, EAT; the cake
 * a slice smaller, or gone after the last (BLOCK_DESTROY). False if it can't eat now (the click goes on to the item)
 */
export function eatCake(level: Level, x: number, y: number, z: number, state: number, p: Player): boolean {
  if (!canEatCake(p)) return false;
  p.food.eat(2, 0.1);
  const b = blk(state), bites = b.get<number>(state, 'bites');
  level.gameEvent('eat', x + 0.5, y + 0.5, z + 0.5, { entity: p });
  if (bites < 6) level.setBlock(x, y, z, b.with(state, 'bites', bites + 1));
  else {
    level.setBlock(x, y, z, 0);
    level.gameEvent('block_destroy', x + 0.5, y + 0.5, z + 0.5, { entity: p });
  }
  return true;
}

/** vanilla CandleCakeBlock.PARTICLE_OFFSETS: over the one wick */
const WICK: [number, number, number] = [0.5, 1, 0.5];

/**
 * vanilla AbstractCandleBlock.extinguish for a candle cake: out it goes, a puff of smoke from the wick and a hiss;
 * BLOCK_CHANGE, by whoever blew it out
 */
function extinguish(level: Level, x: number, y: number, z: number, st: number, by: Player | null): void {
  level.setBlock(x, y, z, blk(st).with(st, 'lit', false));
  level.particles.spawn?.('smoke', x + WICK[0], y + WICK[1], z + WICK[2], 0, 0.1, 0);
  level.sound.play('block.candle.extinguish', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { entity: by });
}

// (the candle cakes: lit and put out wherever candles are, game/candles.ts)
registerCandleKin({
  // vanilla CandleCakeBlock.canLight: one that is out
  light(level, x, y, z) {
    const st = level.getState(x, y, z);
    if (!isCandleCake(st) || blk(st).get(st, 'lit')) return false;
    level.setBlock(x, y, z, blk(st).with(st, 'lit', true));
    return true;
  },
  extinguish(level, x, y, z) {
    const st = level.getState(x, y, z);
    if (!isCandleCake(st) || !blk(st).get(st, 'lit')) return false;
    extinguish(level, x, y, z, st, null);
    return true;
  },
});

registerBehavior('cake', {
  canSurvive: survives,
  // vanilla CakeBlock.useItemOn: a candle goes into an uneaten cake; anything else, the cake's own use (eating)
  useItemOn(level, x, y, z, st, stack, ctx) {
    const cc = candleCakeFor(stack.item.id);
    if (!cc || blk(st).get<number>(st, 'bites') !== 0) return 'pass';
    const p = ctx.player;
    // (vanilla ItemStack.consume: not in creative)
    if (p.gameMode !== 'creative') p.inventory.withHand(ctx.hand ?? 'main', () => p.inventory.consumeSelected(1));
    level.sound.play('block.cake.add_candle', x + 0.5, y + 0.5, z + 0.5, 1, 1);
    level.setBlock(x, y, z, getBlock(cc).defaultState);
    level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { entity: p });
    return 'success';
  },
  // vanilla CakeBlock.useWithoutItem
  use: (level, x, y, z, st, ctx) => eatCake(level, x, y, z, st, ctx.player),
  analogOutput: (_level, _x, _y, _z, st) => cakeSignal(blk(st).get<number>(st, 'bites')),
  // vanilla blocks/cake: nothing, silk touch or not
  drops: () => [],
});

for (const name of CANDLE_CAKE_NAMES) {
  const b = getBlock(name), candle = candleOf(name);
  registerBehavior(name, {
    canSurvive: survives,
    // vanilla CandleCakeBlock.useItemOn: flint and steel or a fire charge go straight on to their own use (lighting it)
    useItemOn: (_level, _x, _y, _z, _st, stack) => (stack.item.id === 'flint_and_steel' || stack.item.id === 'fire_charge' ? 'skip' : 'pass'),
    // vanilla useItemOn with an empty hand on the candle (CandleCakeBlock.candleHit: above the cake's middle) puts it
    // out; else vanilla useWithoutItem: a slice of the uneaten cake it is, and the candle drops (dropResources)
    use(level, x, y, z, st, ctx) {
      const p = ctx.player;
      if (ctx.hy - y > 0.5 && !p.inventory.inHand('main') && b.get(st, 'lit')) {
        extinguish(level, x, y, z, st, p);
        return true;
      }
      if (!eatCake(level, x, y, z, getBlock('cake').defaultState, p)) return false;
      ItemEntity.drop(level, x, y, z, ItemStack.of(candle));
      return true;
    },
    // vanilla AbstractCandleBlock.onProjectileHit: something burning that strikes it lights it
    projectileHit(level, x, y, z, st, _hit, projectile) {
      if (projectile.isOnFire() && !b.get(st, 'lit')) level.setBlock(x, y, z, b.with(st, 'lit', true));
    },
    analogOutput: () => FULL_CAKE_SIGNAL,
    // vanilla blocks/<candle>_cake: its candle
    drops: () => [ItemStack.of(candle)],
    // vanilla CandleCakeBlock.getCloneItemStack
    cloneItem: () => 'cake',
    // vanilla AbstractCandleBlock.animateTick: a small flame over the lit wick, now and then smoke and a crackle
    animateTick(level, x, y, z, st) {
      if (!b.get(st, 'lit')) return;
      const px = x + WICK[0], py = y + WICK[1], pz = z + WICK[2];
      const f = Math.random();
      if (f < 0.3) {
        level.particles.spawn?.('smoke', px, py, pz, 0, 0, 0);
        if (f < 0.17) level.sound.play('block.candle.ambient', px + 0.5, py + 0.5, pz + 0.5, 1 + Math.random(), Math.random() * 0.7 + 0.3);
      }
      level.particles.spawn?.('small_flame', px, py, pz, 0, 0, 0);
    },
  });
}
