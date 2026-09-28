// Bone meal (vanilla BoneMealItem and each BonemealableBlock.performBonemeal): what it grows on crops, stems,
// saplings, grass, moss, the Nether's plants and the rest, and the green sparkles it leaves. Used by players and by
// farmer villagers alike.

import type { Level } from './level';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_OPAQUE, OUTLINE, getBlock, S } from '../world/block';
import { growHugeFungus, nyliumBoneMeal } from '../world/gen/netherFeatures';
import type { BlockAccess } from '../world/gen/patches';
import { runPatchColumn } from '../world/gen/patches';
import { patchColumns, MOSS_BONEMEAL } from '../world/gen/lush';
import { Rand } from '../core/rng';
// (remaining mobs: the panda)
import { behaviorOf } from './blockBehavior';

/** vanilla BoneMealItem.addGrowthParticles */
export function boneMealParticles(lvl: Level, x: number, y: number, z: number): void {
  const st = lvl.getState(x, y, z);
  if (FLAGS[st] & F_AIR) return;
  let count = 15, spread = 0.5, height: number;
  if (FLAGS[st] & F_OPAQUE) {
    // grass and other full blocks: flowers spring up all around
    y++;
    count *= 3;
    spread = 3;
    height = 1;
  } else height = Math.max(0, ...(OUTLINE[st]?.map((b) => b[4]) ?? [1]));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  lvl.particles.spawn?.('happy_villager', x + 0.5, y + 0.5, z + 0.5, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const px = x + 0.5 - spread + Math.random() * spread * 2, py = y + Math.random() * height, pz = z + 0.5 - spread + Math.random() * spread * 2;
    if (FLAGS[lvl.getState(Math.floor(px), Math.floor(py) - 1, Math.floor(pz))] & F_AIR) continue;
    lvl.particles.spawn?.('happy_villager', px, py, pz, gauss() * 0.02, gauss() * 0.02, gauss() * 0.02);
  }
}

/** vanilla BonemealableBlock.performBonemeal for crops, stems, saplings and grass */
export function performBoneMeal(lvl: Level, x: number, y: number, z: number, st: number): boolean {
  // (remaining mobs: the panda) a block with bone meal of its own (bamboo and its shoot)
  const own = behaviorOf(st)?.performBonemeal;
  if (own) return own(lvl, x, y, z, st);
  const b = BLOCKS[STATE_BLOCK[st]];
  const n = b.name;
  if (n === 'wheat' || n === 'carrots' || n === 'potatoes' || n === 'beetroots') {
    const max = n === 'beetroots' ? 3 : 7;
    const age = b.get<number>(st, 'age');
    if (age >= max) return false;
    const grow = n === 'beetroots' ? 1 : 2 + Math.floor(Math.random() * 4);
    lvl.setBlock(x, y, z, b.with(st, 'age', Math.min(max, age + grow)));
    return true;
  }
  if (n === 'pumpkin_stem' || n === 'melon_stem') {
    const age = b.get<number>(st, 'age');
    if (age >= 7) return false;
    lvl.setBlock(x, y, z, b.with(st, 'age', Math.min(7, age + 2 + Math.floor(Math.random() * 4))));
    return true;
  }
  if (n.endsWith('_sapling')) {
    if (Math.random() < 0.45) lvl.randomTicks.advanceSapling(x, y, z, st);
    return true;
  }
  // vanilla AzaleaBlock: grows into an azalea tree 45% of the time, if nothing wet is above it
  if (n === 'azalea' || n === 'flowering_azalea') {
    if (FLAGS[lvl.getState(x, y + 1, z)] & F_WATER) return false;
    if (Math.random() < 0.45) lvl.randomTicks.growAzalea(x, y, z, st);
    return true;
  }
  // vanilla CaveVines.performBonemeal: a glow berry
  if (n === 'cave_vines' || n === 'cave_vines_plant') {
    if (b.get(st, 'berries')) return false;
    lvl.setBlock(x, y, z, b.with(st, 'berries', true));
    return true;
  }
  // vanilla MossBlock.performBonemeal: a small moss patch with plants spreads round it (moss_patch_bonemeal)
  if (n === 'moss_block') {
    if (!(FLAGS[lvl.getState(x, y + 1, z)] & F_AIR)) return false;
    const r = new Rand((Math.random() * 2 ** 31) | 0);
    for (const c of patchColumns(r, MOSS_BONEMEAL, x, y + 1, z)) runPatchColumn(lvl.world.access, c);
    return true;
  }
  // vanilla RootedDirtBlock.performBonemeal: hanging roots under it
  if (n === 'rooted_dirt') {
    if (!(FLAGS[lvl.getState(x, y - 1, z)] & F_AIR)) return false;
    lvl.setBlock(x, y - 1, z, S('hanging_roots'));
    return true;
  }
  // vanilla BigDripleafBlock / BigDripleafStemBlock.performBonemeal: the leaf rises a block on a longer stem
  if (n === 'big_dripleaf' || n === 'big_dripleaf_stem') {
    let ty = y;
    while (BLOCKS[STATE_BLOCK[lvl.getState(x, ty, z)]].name === 'big_dripleaf_stem') ty++;
    const top = lvl.getState(x, ty, z);
    if (BLOCKS[STATE_BLOCK[top]].name !== 'big_dripleaf') return false;
    const above = lvl.getState(x, ty + 1, z);
    if (ty + 1 >= 320 || !(FLAGS[above] & F_AIR || BLOCKS[STATE_BLOCK[above]].name === 'water')) return false;
    const facing = BLOCKS[STATE_BLOCK[top]].get(top, 'facing');
    const water = (st: number) => BLOCKS[STATE_BLOCK[st]].name === 'water' && BLOCKS[STATE_BLOCK[st]].get(st, 'level') === 0 || !!(FLAGS[st] & F_WATER && BLOCKS[STATE_BLOCK[st]].propIndex('waterlogged') >= 0 && BLOCKS[STATE_BLOCK[st]].get(st, 'waterlogged'));
    lvl.setBlock(x, ty + 1, z, getBlock('big_dripleaf').state({ facing, waterlogged: water(above) }), false);
    lvl.setBlock(x, ty, z, getBlock('big_dripleaf_stem').state({ facing, waterlogged: water(top) }));
    return true;
  }
  // vanilla SmallDripleafBlock.performBonemeal: it grows into a big dripleaf 2 to 5 blocks tall
  if (n === 'small_dripleaf') {
    const by = b.get(st, 'half') === 'upper' ? y - 1 : y;
    const lower = lvl.getState(x, by, z);
    const facing = b.get(lower, 'facing');
    const upperState = lvl.getState(x, by + 1, z);
    lvl.setBlock(x, by + 1, z, b.get(upperState, 'waterlogged') ? S('water') : 0, false);
    const want = 2 + Math.floor(Math.random() * 4);
    let fit = 0;
    for (; fit < want && by + fit < 320; fit++) {
      const t = lvl.getState(x, by + fit, z);
      const tn = BLOCKS[STATE_BLOCK[t]].name;
      if (!(FLAGS[t] & F_AIR || tn === 'water' || tn === 'small_dripleaf')) break;
    }
    const inWater = (yy: number) => {
      const t = lvl.getState(x, yy, z);
      return BLOCKS[STATE_BLOCK[t]].name === 'water' || !!(BLOCKS[STATE_BLOCK[t]].propIndex('waterlogged') >= 0 && BLOCKS[STATE_BLOCK[t]].get(t, 'waterlogged'));
    };
    for (let yy = by; yy < by + fit - 1; yy++) lvl.setBlock(x, yy, z, getBlock('big_dripleaf_stem').state({ facing, waterlogged: inWater(yy) }), false);
    lvl.setBlock(x, by + Math.max(0, fit - 1), z, getBlock('big_dripleaf').state({ facing, waterlogged: inWater(by + Math.max(0, fit - 1)) }));
    return true;
  }
  // the nether: nylium sprouts its undergrowth, netherrack next to nylium turns into it, a fungus on its nylium may
  // grow huge, and vines grow on a few blocks
  if (n === 'crimson_nylium' || n === 'warped_nylium') {
    if (!(FLAGS[lvl.getState(x, y + 1, z)] & F_AIR)) return false;
    nyliumBoneMeal(liveAccess(lvl), x, y, z, n === 'crimson_nylium', (Math.random() * 0x100000000) >>> 0);
    return true;
  }
  if (n === 'netherrack') {
    let crimson = false, warped = false;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const nn = BLOCKS[STATE_BLOCK[lvl.getState(x + dx, y + dy, z + dz)]].name;
          if (nn === 'crimson_nylium') crimson = true;
          if (nn === 'warped_nylium') warped = true;
        }
    if (!crimson && !warped) return false;
    const above = lvl.getState(x, y + 1, z);
    if (FLAGS[above] & F_OPAQUE) return false;
    lvl.setBlock(x, y, z, S(crimson && warped ? (Math.random() < 0.5 ? 'warped_nylium' : 'crimson_nylium') : warped ? 'warped_nylium' : 'crimson_nylium'));
    return true;
  }
  if (n === 'crimson_fungus' || n === 'warped_fungus') {
    const crimson = n === 'crimson_fungus';
    if (BLOCKS[STATE_BLOCK[lvl.getState(x, y - 1, z)]].name !== (crimson ? 'crimson_nylium' : 'warped_nylium')) return false;
    if (Math.random() < 0.4) growHugeFungus(liveAccess(lvl), x, y, z, crimson, (Math.random() * 0x100000000) >>> 0);
    return true;
  }
  if (/^(weeping|twisting)_vines(_plant)?$/.test(n)) {
    // (on a piece of the plant, the head at its end grows)
    const head = n.replace('_plant', ''), dy = head === 'weeping_vines' ? -1 : 1;
    let hy = y;
    while (BLOCKS[STATE_BLOCK[lvl.getState(x, hy, z)]].name === head + '_plant') hy += dy;
    const hs = lvl.getState(x, hy, z);
    const hb = BLOCKS[STATE_BLOCK[hs]];
    if (hb.name !== head || !(FLAGS[lvl.getState(x, hy + dy, z)] & F_AIR)) return false;
    // vanilla NetherVines.getBlocksToGrowWhenBonemealed
    let count = 0;
    for (let p = 1; Math.random() < p; p *= 0.826) count++;
    let age = Math.min(hb.get<number>(hs, 'age') + 1, 25);
    for (let k = 0, ny = hy + dy; k < count && FLAGS[lvl.getState(x, ny, z)] & F_AIR; k++, ny += dy) {
      lvl.setBlock(x, ny, z, hb.with(hs, 'age', age));
      age = Math.min(age + 1, 25);
    }
    return true;
  }
  if (n === 'grass_block') {
    // scatter grass and flowers on nearby grass blocks
    for (let i = 0; i < 128; i++) {
      let px = x, py = y + 1, pz = z;
      let ok = true;
      for (let j = 0; j < i / 16; j++) {
        px += Math.floor(Math.random() * 3) - 1;
        py += Math.floor((Math.floor(Math.random() * 3) - 1) * Math.floor(Math.random() * 3) / 2);
        pz += Math.floor(Math.random() * 3) - 1;
        if (BLOCKS[STATE_BLOCK[lvl.getState(px, py - 1, pz)]].name !== 'grass_block') {
          ok = false;
          break;
        }
      }
      if (!ok || !(FLAGS[lvl.getState(px, py, pz)] & F_AIR)) continue;
      const r = Math.random();
      const plant = r < 0.8 ? 'short_grass' : r < 0.9 ? 'dandelion' : 'poppy';
      lvl.setBlock(px, py, pz, S(plant));
    }
    return true;
  }
  return false;
}

/** the level as a feature sees it (for what bone meal grows) */
function liveAccess(lvl: Level): BlockAccess {
  return { get: (x, y, z) => lvl.getState(x, y, z), set: (x, y, z, st) => lvl.setBlock(x, y, z, st) };
}
