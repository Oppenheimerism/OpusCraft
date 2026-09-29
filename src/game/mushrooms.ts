// (remaining mobs: the mooshroom) What mushrooms do (vanilla MushroomBlock, HugeMushroomBlock, MyceliumBlock's
// animateTick). A small mushroom stays on mycelium, podzol or nylium anywhere, and elsewhere only in the dim (raw
// light under 13) on something solid; it spreads now and then to a free spot near it, unless there are five of its
// kind about already; bone meal grows it into a huge mushroom four times in ten (vanilla's valid target always: the
// bone meal is used either way). A huge mushroom's block closes up its side against another of its own kind (placed
// or grown beside it), and breaking one drops a few small mushrooms at best (the stem nothing), or itself with silk
// touch. Mycelium gives off its spores, drifting up from it.

import { registerBehavior } from './blockBehavior';
import type { Level } from './level';
import type { World } from '../world/world';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_OPAQUE, getBlock, type Block } from '../world/block';
import { ItemStack } from '../item/item';
import { MUSHROOM_SIDES } from '../world/blocksMushrooms';
import { placeHugeMushroom, isSolid, type HugeMushroomKind, type MushroomAccess } from '../world/gen/hugeMushroom';

const nameOf = (st: number): string => BLOCKS[STATE_BLOCK[st]].name;

/** vanilla BlockTags.MUSHROOM_GROW_BLOCK: where a small mushroom grows in any light */
const MUSHROOM_GROW_BLOCK = new Set(['mycelium', 'podzol', 'crimson_nylium', 'warped_nylium']);

/** the side names by the way they face: (dx, dy, dz) */
const SIDE_OFFSET: Record<(typeof MUSHROOM_SIDES)[number], [number, number, number]> = {
  north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};

// ---------------------------------------------------------------------------
// the huge mushroom's blocks

for (const name of ['brown_mushroom_block', 'red_mushroom_block', 'mushroom_stem']) {
  const block = getBlock(name);
  /** `st` with each side against another of `block` closed (vanilla: only ever closed, never opened again) */
  const closeUp = (w: World, x: number, y: number, z: number, st: number): number => {
    let out = st;
    for (const d of MUSHROOM_SIDES) {
      const [dx, dy, dz] = SIDE_OFFSET[d];
      if (STATE_BLOCK[w.getState(x + dx, y + dy, z + dz)] === block.id) out = block.with(out, d, false);
    }
    return out;
  };
  const small = name === 'brown_mushroom_block' ? 'brown_mushroom' : name === 'red_mushroom_block' ? 'red_mushroom' : null;
  registerBehavior(name, {
    /** vanilla getStateForPlacement: each side closed where the block beside it is of its kind */
    placement: (ctx) => closeUp(ctx.world, ctx.x, ctx.y, ctx.z, block.defaultState),
    /** vanilla updateShape: a side against a block of its kind closes */
    updateShape: (w, x, y, z, st) => closeUp(w, x, y, z, st),
    /**
     * vanilla loot tables blocks/*_mushroom_block and mushroom_stem: itself with silk touch; otherwise a cap block drops
     * uniform(-6, 2) small mushrooms, none below none (0 seven times in nine), and the stem nothing
     */
    drops(_st, _tool, r, silk) {
      if (silk) return [ItemStack.of(name)];
      if (!small) return [];
      const n = Math.max(0, r.nextInt(9) - 6);
      return n > 0 ? [ItemStack.of(small, n)] : [];
    },
  });
}

// ---------------------------------------------------------------------------
// small mushrooms

/** the brightest the sky or a lamp makes (x, y, z), undarkened (vanilla getRawBrightness(pos, 0)) */
function rawLight(w: World, x: number, y: number, z: number): number {
  const l = w.getLight(x, y, z);
  return Math.max(l >> 4, l & 15);
}

/**
 * vanilla MushroomBlock.canSurvive: on #mushroom_grow_block always; otherwise in raw light under 13, on something
 * solid (mayPlaceOn: isSolidRender)
 */
function mushroomSurvives(w: World, x: number, y: number, z: number): boolean {
  const below = w.getState(x, y - 1, z);
  if (MUSHROOM_GROW_BLOCK.has(nameOf(below))) return true;
  return rawLight(w, x, y, z) < 13 && (FLAGS[below] & F_OPAQUE) !== 0;
}

/** the loaded level as a huge mushroom grows in it (vanilla setBlock with its updates, where nothing solid is) */
function levelAccess(level: Level): MushroomAccess {
  return {
    get: (x, y, z) => level.getState(x, y, z),
    set: (x, y, z, st) => {
      if (!isSolid(level.getState(x, y, z))) level.setBlock(x, y, z, st);
    },
  };
}

/**
 * vanilla MushroomBlock.growMushroom: the small mushroom taken away and a huge one grown from where it stood (on the
 * level's random); where it can't grow, the small one is put back. True if it grew
 */
export function growHugeMushroom(level: Level, x: number, y: number, z: number, st: number): boolean {
  const kind: HugeMushroomKind = nameOf(st) === 'brown_mushroom' ? 'brown' : 'red';
  level.setBlock(x, y, z, 0);
  if (placeHugeMushroom(levelAccess(level), level.random, kind, x, y, z)) return true;
  level.setBlock(x, y, z, st);
  return false;
}

for (const name of ['brown_mushroom', 'red_mushroom']) {
  const block: Block = getBlock(name);
  registerBehavior(name, {
    canSurvive: (w, x, y, z) => mushroomSurvives(w, x, y, z),
    /**
     * vanilla randomTick: one tick in 25, unless five of its kind are within 4 across and 1 up or down, it creeps: four
     * hops of one block across (and up or down) at random from where it is, each onto a free spot it could live on, and
     * a mushroom where the last lands, if that's free and it could live there
     */
    randomTick(level, x, y, z, st) {
      const r = level.random, w = level.world;
      if (r.nextInt(25) !== 0) return;
      let left = 5;
      for (let dx = -4; dx <= 4; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -4; dz <= 4; dz++) if (STATE_BLOCK[w.getState(x + dx, y + dy, z + dz)] === block.id && --left <= 0) return;
      const hop = (px: number, py: number, pz: number): [number, number, number] => [px + r.nextInt(3) - 1, py + r.nextInt(2) - r.nextInt(2), pz + r.nextInt(3) - 1];
      let [px, py, pz] = [x, y, z];
      let [qx, qy, qz] = hop(px, py, pz);
      const free = (a: number, b: number, c: number) => (FLAGS[w.getState(a, b, c)] & F_AIR) !== 0 && mushroomSurvives(w, a, b, c);
      for (let k = 0; k < 4; k++) {
        if (free(qx, qy, qz)) [px, py, pz] = [qx, qy, qz];
        [qx, qy, qz] = hop(px, py, pz);
      }
      if (free(qx, qy, qz)) level.setBlock(qx, qy, qz, st);
    },
    /**
     * vanilla isValidBonemealTarget (always), isBonemealSuccess (four times in ten) and performBonemeal
     * (growMushroom): the bone meal is used whether it grows or not
     */
    performBonemeal(level, x, y, z, st) {
      if (level.random.nextFloat() < 0.4) growHugeMushroom(level, x, y, z, st);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// mycelium

registerBehavior('mycelium', {
  /** vanilla MyceliumBlock.animateTick: one tick in ten, a spore drifting up from somewhere on its top */
  animateTick(level, x, y, z) {
    if (Math.floor(Math.random() * 10) !== 0) return;
    level.particles.spawn?.('mycelium', x + Math.random(), y + 1.1, z + Math.random(), 0, 0, 0);
  },
});
