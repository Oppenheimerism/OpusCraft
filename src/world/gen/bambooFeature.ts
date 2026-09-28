// Bamboo in the jungles (remaining mobs: the panda): vanilla BambooFeature, as the bamboo jungle's
// VegetationPlacements.BAMBOO (NoiseBasedCountPlacement.of(160, 80, 0.3): ceil((BIOME_INFO_NOISE(x/80, z/80) + 0.3) · 160)
// tries a chunk, at the WORLD_SURFACE height, BambooFeature with a probability of 0.2 of podzol round it) and the
// jungle's BAMBOO_LIGHT (RarityFilter.onAverageOnceEvery(4): one try in one chunk in four, at the MOTION_BLOCKING
// height, no podzol). Each try, where there's air and bamboo can stand on what's under it, grows a thick stalk 5 to 16
// tall (fewer where something is in the way), and from 3 up tops it with the leaves a grown stalk has: large on the top
// two blocks (the top one done growing), small on the one under them. A later try can land on top of an earlier stalk
// and carry on up it, as in vanilla. They come first of the jungles' vegetation, before the trees; on a random of their
// own, so the rest of a chunk comes out as it did where there's no bamboo.

import { Rand, hash2 } from '../../core/rng';
import { S, BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../block';
import { BAMBOO_PLANTABLE_ON } from '../blocksBamboo';
import type { GenContext } from './context';
import { B } from './biomes';
import { biomeInfoNoise } from './temperature';

/** vanilla BlockTags.DIRT (what the podzol goes over) */
const DIRT = new Set(['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'mycelium', 'rooted_dirt', 'moss_block', 'mud', 'muddy_mangrove_roots']);

const nameOf = (st: number): string => BLOCKS[STATE_BLOCK[st]].name;
const isAir = (st: number): boolean => st >= 0 && (FLAGS[st] & F_AIR) !== 0;

/**
 * vanilla BambooFeature.place at (x, y, z) (the foot of the stalk), with `podzol` the chance (ProbabilityFeatureConfiguration)
 * of a disc of podzol, 1 to 4 across, over the dirt round it; true if it placed anything
 */
export function placeBambooFeature(ctx: GenContext, r: Rand, x: number, y: number, z: number, podzol: number): boolean {
  if (!isAir(ctx.get(x, y, z))) return false;
  const below = ctx.get(x, y - 1, z);
  if (below < 0 || !BAMBOO_PLANTABLE_ON.has(nameOf(below))) return false;
  const height = r.nextInt(12) + 5;
  if (r.nextFloat() < podzol) {
    const k = r.nextInt(4) + 1, pz = S('podzol');
    for (let l = x - k; l <= x + k; l++)
      for (let m = z - k; m <= z + k; m++) {
        const n = l - x, o = m - z;
        // (a disc reaching over the chunk's edge stops at it: the neighbour's ground isn't known here)
        if (n * n + o * o > k * k || !ctx.inChunk(l, m)) continue;
        const gy = ctx.heightSurface(l, m) - 1, g = ctx.get(l, gy, m);
        if (g >= 0 && DIRT.has(nameOf(g))) ctx.set(l, gy, m, pz);
      }
  }
  // vanilla BAMBOO_TRUNK (thick, bare, growing), BAMBOO_TOP_SMALL, BAMBOO_TOP_LARGE, BAMBOO_FINAL_LARGE (stage 1)
  const trunk = S('bamboo', { age: 1, leaves: 'none', stage: 0 });
  let yy = y;
  for (let k = 0; k < height && isAir(ctx.get(x, yy, z)); k++) ctx.set(x, yy++, z, trunk);
  if (yy - y >= 3) {
    ctx.set(x, yy, z, S('bamboo', { age: 1, leaves: 'large', stage: 1 }));
    ctx.set(x, yy - 1, z, S('bamboo', { age: 1, leaves: 'large', stage: 0 }));
    ctx.set(x, yy - 2, z, S('bamboo', { age: 1, leaves: 'small', stage: 0 }));
  }
  return true;
}

/** the jungles' bamboo for the chunk `ctx` (vanilla BAMBOO_LIGHT and BAMBOO); true if any grew */
export function bambooVegetation(ctx: GenContext, seed: number): boolean {
  const jungle = ctx.biomes.includes(B.jungle), bambooJungle = ctx.biomes.includes(B.bamboo_jungle);
  if (!jungle && !bambooJungle) return false;
  const r = new Rand(hash2(ctx.cx, ctx.cz, seed ^ 0xba3b00), 14);
  let placed = false;
  // vanilla BAMBOO_LIGHT: RarityFilter.onAverageOnceEvery(4), InSquarePlacement, HEIGHTMAP (MOTION_BLOCKING), BiomeFilter
  if (jungle && r.nextFloat() < 1 / 4) {
    const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
    if (ctx.biomeAt(x, z) === B.jungle) placed = placeBambooFeature(ctx, r, x, ctx.heightMotion(x, z), z, 0) || placed;
  }
  // vanilla BAMBOO: NoiseBasedCountPlacement.of(160, 80, 0.3), InSquarePlacement, HEIGHTMAP_WORLD_SURFACE, BiomeFilter
  if (bambooJungle) {
    const n = Math.ceil((biomeInfoNoise(ctx.x0 / 80, ctx.z0 / 80) + 0.3) * 160);
    for (let i = 0; i < n; i++) {
      const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
      if (ctx.biomeAt(x, z) === B.bamboo_jungle) placed = placeBambooFeature(ctx, r, x, ctx.heightSurface(x, z), z, 0.2) || placed;
    }
  }
  return placed;
}
