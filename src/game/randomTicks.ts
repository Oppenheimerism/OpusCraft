// Random block ticks (vanilla randomTickSpeed = 3 per section per tick).

import { BLOCKS, STATE_BLOCK, FLAGS, OPACITY, F_AIR, F_WATER, F_LEAVES, F_OPAQUE, F_RANDOM_TICK, getBlock, S } from '../world/block';
import type { Level } from './level';
import { MIN_Y, SECTIONS } from '../world/constants';
import { placeTree, TreeKind } from '../world/gen/trees';
import { canSurvive } from './blockRules';
import { lavaRandomTick } from './fire';
import { DX, DY, DZ, DIR_NAMES } from '../world/dir';

const SAPLING_TREE: Record<string, TreeKind> = {
  oak_sapling: 'oak', spruce_sapling: 'spruce', birch_sapling: 'birch', jungle_sapling: 'jungle',
  acacia_sapling: 'acacia', dark_oak_sapling: 'dark_oak', cherry_sapling: 'cherry',
};

const AMETHYST_NEXT: Record<string, string> = { small_amethyst_bud: 'medium_amethyst_bud', medium_amethyst_bud: 'large_amethyst_bud', large_amethyst_bud: 'amethyst_cluster' };

export class RandomTicker {
  speed = 3;
  constructor(private readonly level: Level) {}

  private light(x: number, y: number, z: number): number {
    const l = this.level.world.getLight(x, y, z);
    return Math.max(l >> 4, l & 15);
  }

  private skyLightRaw(x: number, y: number, z: number): number {
    return this.level.world.getLight(x, y, z) >> 4;
  }

  tick(centerX: number, centerZ: number, radiusChunks: number): void {
    const world = this.level.world;
    const ccx = Math.floor(centerX) >> 4, ccz = Math.floor(centerZ) >> 4;
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++)
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const c = world.getChunk(ccx + dx, ccz + dz);
        if (!c) continue;
        for (let si = 0; si < SECTIONS; si++) {
          const sec = c.blocks[si];
          if (!sec || c.nonAir[si] === 0) continue;
          for (let k = 0; k < this.speed; k++) {
            const i = (Math.random() * 4096) | 0;
            const st = sec[i];
            if (!(FLAGS[st] & F_RANDOM_TICK)) continue;
            const lx = i & 15, lz = (i >> 4) & 15, ly = i >> 8;
            this.randomTick(c.cx * 16 + lx, MIN_Y + si * 16 + ly, c.cz * 16 + lz, st);
          }
        }
      }
  }

  private randomTick(x: number, y: number, z: number, st: number): void {
    const lvl = this.level;
    const b = BLOCKS[STATE_BLOCK[st]];
    const n = b.name;
    if (n === 'lava') {
      lavaRandomTick(lvl, x, y, z);
      return;
    }
    if (n === 'fire') {
      // scheduled ticks are not saved with chunks: restart a loaded fire
      lvl.scheduleTick(x, y, z, 30 + lvl.random.nextInt(10));
      return;
    }
    if (n === 'crimson_nylium' || n === 'warped_nylium') {
      // vanilla NyliumBlock.randomTick: smothered under a block that lets no light through, it's netherrack again
      const above = lvl.getState(x, y + 1, z);
      if (OPACITY[above] >= 15 && FLAGS[above] & F_OPAQUE) lvl.setBlock(x, y, z, S('netherrack'));
      return;
    }
    if (n === 'grass_block' || n === 'mycelium') {
      // vanilla SpreadingSnowyDirtBlock
      const above = lvl.getState(x, y + 1, z);
      if (!this.canBeGrass(x, y, z, above)) {
        lvl.setBlock(x, y, z, S('dirt'));
        return;
      }
      if (this.light(x, y + 1, z) >= 9) {
        for (let i = 0; i < 4; i++) {
          const tx = x + Math.floor(Math.random() * 3) - 1, ty = y + Math.floor(Math.random() * 5) - 3, tz = z + Math.floor(Math.random() * 3) - 1;
          const t = lvl.getState(tx, ty, tz);
          if (BLOCKS[STATE_BLOCK[t]].name === 'dirt' && this.canPropagate(tx, ty, tz)) {
            const snowy = BLOCKS[STATE_BLOCK[lvl.getState(tx, ty + 1, tz)]].name.startsWith('snow');
            lvl.setBlock(tx, ty, tz, b.state({ snowy }));
          }
        }
      }
      return;
    }
    if (n === 'budding_amethyst') {
      // vanilla BuddingAmethystBlock.randomTick: 1 in 5 ticks, start a bud on a random side or grow the one there
      if (Math.random() * 5 >= 1) return;
      const d = Math.floor(Math.random() * 6);
      const tx = x + DX[d], ty = y + DY[d], tz = z + DZ[d];
      const t = lvl.getState(tx, ty, tz);
      const tb = BLOCKS[STATE_BLOCK[t]];
      const face = DIR_NAMES[d];
      const level = tb.name === 'water' ? tb.get<number>(t, 'level') : -1;
      let next: string | undefined;
      // canClusterGrowAtState: air, or still or falling water
      if (FLAGS[t] & F_AIR || level === 0 || level >= 8) next = 'small_amethyst_bud';
      else if (tb.propIndex('facing') >= 0 && tb.get(t, 'facing') === face) next = AMETHYST_NEXT[tb.name];
      if (!next) return;
      const water = level === 0 || (tb.propIndex('waterlogged') >= 0 && tb.get<boolean>(t, 'waterlogged'));
      lvl.setBlock(tx, ty, tz, getBlock(next).state({ facing: face, waterlogged: water }));
      return;
    }
    if (b.s.isLeaves) {
      if (b.get(st, 'persistent')) return;
      const d = b.get<number>(st, 'distance');
      if (d === 7) lvl.destroyBlock(x, y, z, true, null, false);
      return;
    }
    if (n in SAPLING_TREE) {
      if (this.light(x, y + 1, z) >= 9 && Math.random() < 1 / 7) {
        const stage = b.get<number>(st, 'stage');
        if (stage === 0) lvl.setBlock(x, y, z, b.with(st, 'stage', 1));
        else this.growTree(x, y, z, SAPLING_TREE[n], st);
      }
      return;
    }
    if (n === 'wheat' || n === 'carrots' || n === 'potatoes' || n === 'beetroots') {
      // vanilla CropBlock.randomTick (beetroots only grow on 1/3 of ticks)
      if (n === 'beetroots' && Math.random() * 3 >= 1) return;
      const max = n === 'beetroots' ? 3 : 7;
      const age = b.get<number>(st, 'age');
      if (age < max && this.light(x, y, z) >= 9) {
        const f = growthSpeed(lvl, x, y, z, b.name);
        if (Math.floor(Math.random() * (Math.floor(25 / f) + 1)) === 0) lvl.setBlock(x, y, z, b.with(st, 'age', age + 1));
      }
      return;
    }
    if (n === 'pumpkin_stem' || n === 'melon_stem') {
      // vanilla StemBlock.randomTick: grow, then place the fruit beside it
      if (this.light(x, y, z) < 9) return;
      const f = growthSpeed(lvl, x, y, z, b.name);
      if (Math.floor(Math.random() * (Math.floor(25 / f) + 1)) !== 0) return;
      const age = b.get<number>(st, 'age');
      if (age < 7) {
        lvl.setBlock(x, y, z, b.with(st, 'age', age + 1));
        return;
      }
      const dirs: [string, number, number][] = [['north', 0, -1], ['south', 0, 1], ['west', -1, 0], ['east', 1, 0]];
      const [dname, dx, dz] = dirs[Math.floor(Math.random() * 4)];
      const fx = x + dx, fz = z + dz;
      const soil = BLOCKS[STATE_BLOCK[lvl.getState(fx, y - 1, fz)]].name;
      if (FLAGS[lvl.getState(fx, y, fz)] & F_AIR && (soil === 'farmland' || soil === 'dirt' || soil === 'grass_block' || soil === 'coarse_dirt' || soil === 'podzol' || soil === 'rooted_dirt' || soil === 'mud' || soil === 'moss_block')) {
        const fruit = n === 'pumpkin_stem' ? 'pumpkin' : 'melon';
        lvl.setBlock(fx, y, fz, S(fruit));
        lvl.setBlock(x, y, z, getBlock(`attached_${fruit}_stem`).state({ facing: dname }));
      }
      return;
    }
    if (n === 'sugar_cane' || n === 'cactus') {
      if (lvl.getState(x, y + 1, z) !== 0) return;
      let h = 1;
      while (BLOCKS[STATE_BLOCK[lvl.getState(x, y - h, z)]] === b) h++;
      if (h >= 3) return;
      const age = b.get<number>(st, 'age');
      if (age === 15) {
        const ns = b.defaultState;
        if (canSurvive(lvl.world, x, y + 1, z, ns)) lvl.setBlock(x, y + 1, z, ns);
        lvl.setBlock(x, y, z, b.with(st, 'age', 0), false);
      } else lvl.setBlock(x, y, z, b.with(st, 'age', age + 1), false);
      return;
    }
    if (n === 'nether_wart') {
      // vanilla NetherWartBlock.randomTick: one in ten grows it an age
      const age = b.get<number>(st, 'age');
      if (age < 3 && Math.floor(Math.random() * 10) === 0) lvl.setBlock(x, y, z, b.with(st, 'age', age + 1), false);
      return;
    }
    if (n === 'weeping_vines' || n === 'twisting_vines') {
      // vanilla GrowingPlantHeadBlock.randomTick: 1 in 10 grows on (down, or up) into air, one age older
      const age = b.get<number>(st, 'age');
      const ny = n === 'weeping_vines' ? y - 1 : y + 1;
      if (age < 25 && Math.random() < 0.1 && FLAGS[lvl.getState(x, ny, z)] & F_AIR) lvl.setBlock(x, ny, z, b.with(st, 'age', age + 1));
      return;
    }
    if (n === 'cave_vines') {
      // vanilla GrowingPlantHeadBlock.randomTick: 1 in 10 grows a block down into air (with a berry 11% of the time)
      const age = b.get<number>(st, 'age');
      if (age < 25 && Math.random() < 0.1 && FLAGS[lvl.getState(x, y - 1, z)] & F_AIR) {
        lvl.setBlock(x, y - 1, z, b.with(b.with(st, 'age', age + 1), 'berries', Math.random() < 0.11));
      }
      return;
    }
    if (n === 'sweet_berry_bush') {
      const age = b.get<number>(st, 'age');
      if (age < 3 && Math.random() < 0.2 && this.light(x, y + 1, z) >= 9) lvl.setBlock(x, y, z, b.with(st, 'age', age + 1));
      return;
    }
    if (n === 'ice') {
      if ((this.level.world.getLight(x, y, z) & 15) > 11 - OPACITY[st]) lvl.setBlock(x, y, z, S('water'));
      return;
    }
    if (n === 'snow') {
      if ((this.level.world.getLight(x, y, z) & 15) > 11) lvl.destroyBlock(x, y, z, true, null, false);
      return;
    }
    if (n === 'farmland') {
      const moisture = b.get<number>(st, 'moisture');
      let wet = false;
      for (let dx = -4; dx <= 4 && !wet; dx++)
        for (let dz = -4; dz <= 4 && !wet; dz++)
          for (let dy = 0; dy <= 1; dy++) if (FLAGS[lvl.getState(x + dx, y + dy, z + dz)] & F_WATER) wet = true;
      if (wet) {
        if (moisture < 7) lvl.setBlock(x, y, z, b.with(st, 'moisture', 7), false);
      } else if (moisture > 0) lvl.setBlock(x, y, z, b.with(st, 'moisture', moisture - 1), false);
      else if (!MAINTAINS_FARMLAND.has(BLOCKS[STATE_BLOCK[lvl.getState(x, y + 1, z)]].name)) lvl.setBlock(x, y, z, S('dirt'));
      return;
    }
    void F_AIR;
    void F_LEAVES;
  }

  /** vanilla AzaleaBlock.performBonemeal: TreeGrower.AZALEA */
  growAzalea(x: number, y: number, z: number, st: number): void {
    this.growTree(x, y, z, 'azalea', st);
  }

  /** vanilla SaplingBlock.advanceTree (bone meal) */
  advanceSapling(x: number, y: number, z: number, st: number): void {
    const b = BLOCKS[STATE_BLOCK[st]];
    const kind = SAPLING_TREE[b.name];
    if (!kind) return;
    if (b.get<number>(st, 'stage') === 0) this.level.setBlock(x, y, z, b.with(st, 'stage', 1));
    else this.growTree(x, y, z, kind, st);
  }

  private canBeGrass(x: number, y: number, z: number, above: number): boolean {
    const ab = BLOCKS[STATE_BLOCK[above]];
    if (ab.name === 'snow' && ab.get(above, 'layers') === 1) return true;
    if (FLAGS[above] & F_WATER) return false;
    // light blocking: fully opaque above kills grass
    return OPACITY[above] < 15 || !(FLAGS[above] & F_OPAQUE);
  }

  private canPropagate(x: number, y: number, z: number): boolean {
    const above = this.level.getState(x, y + 1, z);
    return this.canBeGrass(x, y, z, above) && !(FLAGS[above] & F_WATER);
  }

  private growTree(x: number, y: number, z: number, kind: TreeKind, saplingState: number): void {
    const lvl = this.level;
    // temporarily remove sapling, try to place via a small generation context over the live world
    lvl.world.setState(x, y, z, 0);
    const ok = growTreeInWorld(lvl, kind, x, y, z);
    if (!ok) lvl.world.setState(x, y, z, saplingState);
  }
}

import { GenContext } from '../world/gen/context';
import { Rand } from '../core/rng';
import { colIndex } from '../world/constants';

/** Grow a tree in the live world by running the generator over a 3x3 chunk scratch area. */
export function growTreeInWorld(lvl: Level, kind: TreeKind, x: number, y: number, z: number): boolean {
  const world = lvl.world;
  const cx = x >> 4, cz = z >> 4;
  const c = world.getChunk(cx, cz);
  if (!c) return false;
  // build a column copy of the center chunk
  const blocks = new Uint16Array(16 * 16 * 384);
  for (let lx = 0; lx < 16; lx++)
    for (let lz = 0; lz < 16; lz++)
      for (let yy = -64; yy < 320; yy++) blocks[colIndex(lx, yy, lz)] = c.getState(lx, yy, lz);
  const ctx = new GenContext(cx, cz, blocks, c.biomes);
  ctx.computeHeightmaps();
  const ok = placeTree(ctx, kind, x, y, z, new Rand((Math.random() * 1e9) | 0));
  if (!ok) return false;
  // apply diff inside the chunk
  for (let lx = 0; lx < 16; lx++)
    for (let lz = 0; lz < 16; lz++)
      for (let yy = -64; yy < 320; yy++) {
        const v = blocks[colIndex(lx, yy, lz)];
        if (v !== c.getState(lx, yy, lz)) world.setState(cx * 16 + lx, yy, cz * 16 + lz, v);
      }
  // writes that spilled into neighbours
  for (const p of ctx.pendingWrites()) {
    for (let i = 0; i < p.data.length; i += 5) {
      const wx = p.cx * 16 + p.data[i], wy = p.data[i + 1], wz = p.cz * 16 + p.data[i + 2];
      const cur = world.getState(wx, wy, wz);
      const f = FLAGS[cur];
      if (f & F_AIR || (p.data[i + 4] === 2 && f & F_LEAVES)) world.setState(wx, wy, wz, p.data[i + 3]);
    }
  }
  return true;
}

/** vanilla #maintains_farmland */
const MAINTAINS_FARMLAND = new Set(['wheat', 'carrots', 'potatoes', 'beetroots', 'pumpkin_stem', 'melon_stem', 'attached_pumpkin_stem', 'attached_melon_stem', 'torchflower_crop', 'pitcher_crop']);

/** vanilla CropBlock.getGrowthSpeed: moist farmland around, penalty for crowded rows */
function growthSpeed(lvl: Level, x: number, y: number, z: number, name: string): number {
  let f = 1;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const st = lvl.getState(x + i, y - 1, z + j);
      const b = BLOCKS[STATE_BLOCK[st]];
      let f1 = 0;
      if (b.name === 'farmland') {
        f1 = 1;
        if (b.get<number>(st, 'moisture') > 0) f1 = 3;
      }
      if (i !== 0 || j !== 0) f1 /= 4;
      f += f1;
    }
  const same = (dx: number, dz: number) => BLOCKS[STATE_BLOCK[lvl.getState(x + dx, y, z + dz)]].name === name;
  const ew = same(-1, 0) || same(1, 0);
  const ns = same(0, -1) || same(0, 1);
  if (ew && ns) f /= 2;
  else if (same(-1, -1) || same(1, -1) || same(1, 1) || same(-1, 1)) f /= 2;
  return f;
}
