// Nether features that reach over chunk borders: glowstone clumps, fire and
// mushroom patches, the basalt deltas' lava pools and columns, and the soul
// sand valley's pillars. Each runs twice over: once in the chunk that places
// it (writing only there, with the neighbours guessed from the noise
// terrain), then again from the same seed in each neighbour it reaches once
// that neighbour exists (writing only there, reading the real blocks). A
// feature keeps its own writes in an overlay so both runs see the whole of it.

import { BLOCKS, BLOCK_BY_NAME, STATE_BLOCK, FLAGS, F_AIR, F_OPAQUE, F_REPLACEABLE, S } from '../block';
import type { BlockAccess } from './patches';
import type { GenContext } from './context';
import { Rand, hash32 } from '../../core/rng';

export const F_GLOWSTONE = 1, F_FIRE = 2, F_BROWN_MUSHROOM = 3, F_RED_MUSHROOM = 4, F_DELTA = 5, F_SMALL_COLUMNS = 6, F_LARGE_COLUMNS = 7, F_PILLAR = 8;
export const F_CRIMSON_FUNGUS = 9, F_WARPED_FUNGUS = 10, F_CRIMSON_VEGETATION = 11, F_WARPED_VEGETATION = 12, F_NETHER_SPROUTS = 13, F_WEEPING_VINES = 14, F_TWISTING_VINES = 15;
export const F_SOUL_FIRE = 16;

/** how far from its origin each feature can write */
const REACH: Record<number, number> = {
  [F_GLOWSTONE]: 7, [F_FIRE]: 7, [F_BROWN_MUSHROOM]: 7, [F_RED_MUSHROOM]: 7, [F_DELTA]: 9, [F_SMALL_COLUMNS]: 10, [F_LARGE_COLUMNS]: 12, [F_PILLAR]: 3,
  [F_CRIMSON_FUNGUS]: 4, [F_WARPED_FUNGUS]: 4, [F_CRIMSON_VEGETATION]: 7, [F_WARPED_VEGETATION]: 7, [F_NETHER_SPROUTS]: 7, [F_WEEPING_VINES]: 7, [F_TWISTING_VINES]: 8, [F_SOUL_FIRE]: 7,
};

export const NETHER_SEA_LEVEL = 32;

interface NB {
  NETHERRACK: number; LAVA: number; BEDROCK: number; BASALT: number; BLACKSTONE: number; GLOWSTONE: number; MAGMA: number;
  FIRE: number; BROWN_MUSHROOM: number; RED_MUSHROOM: number;
}
let NBLK: NB | null = null;
export function netherBlocks(): NB {
  return (NBLK ??= {
    NETHERRACK: S('netherrack'), LAVA: S('lava'), BEDROCK: S('bedrock'), BASALT: S('basalt'), BLACKSTONE: S('blackstone'), GLOWSTONE: S('glowstone'),
    MAGMA: S('magma_block'), FIRE: S('fire'), BROWN_MUSHROOM: S('brown_mushroom'), RED_MUSHROOM: S('red_mushroom'),
  });
}

const nameOf = (st: number) => BLOCKS[STATE_BLOCK[st]].name;

/** blocks as a feature sees them: -1 where nothing is known */
abstract class FeatureWorld {
  private readonly overlay = new Map<number, number>();
  constructor(private readonly ox: number, private readonly oz: number) {}
  protected abstract read(x: number, y: number, z: number): number;
  protected abstract write(x: number, y: number, z: number, st: number): void;
  /** is an unknown block rock? */
  abstract guessSolid(x: number, y: number, z: number): boolean;
  private key(x: number, y: number, z: number): number {
    return ((x - this.ox + 512) * 1024 + (y + 64)) * 1024 + (z - this.oz + 512);
  }
  get(x: number, y: number, z: number): number {
    const o = this.overlay.get(this.key(x, y, z));
    return o !== undefined ? o : this.read(x, y, z);
  }
  set(x: number, y: number, z: number, st: number): void {
    if (y < -64 || y >= 320) return;
    this.overlay.set(this.key(x, y, z), st);
    this.write(x, y, z, st);
  }
  /** air, or (unknown) not rock */
  isEmpty(x: number, y: number, z: number): boolean {
    const st = this.get(x, y, z);
    return st >= 0 ? (FLAGS[st] & F_AIR) !== 0 : !this.guessSolid(x, y, z);
  }
}

/** the first run, in the generating chunk */
class GenWorld extends FeatureWorld {
  constructor(private readonly ctx: GenContext, ox: number, oz: number) {
    super(ox, oz);
  }
  protected read(x: number, y: number, z: number): number {
    return this.ctx.get(x, y, z);
  }
  protected write(x: number, y: number, z: number, st: number): void {
    if (this.ctx.inChunk(x, z)) this.ctx.set(x, y, z, st);
  }
  guessSolid(x: number, y: number, z: number): boolean {
    return this.ctx.solidGuess ? this.ctx.solidGuess(x, y, z) : true;
  }
}

/** the replay in a neighbour, against the loaded world */
class ReplayWorld extends FeatureWorld {
  constructor(private readonly acc: BlockAccess, private readonly cx: number, private readonly cz: number, ox: number, oz: number) {
    super(ox, oz);
  }
  protected read(x: number, y: number, z: number): number {
    return this.acc.get(x, y, z);
  }
  protected write(x: number, y: number, z: number, st: number): void {
    if (x >> 4 === this.cx && z >> 4 === this.cz) this.acc.set(x, y, z, st);
  }
  guessSolid(): boolean {
    return true;
  }
}

/** run a feature in the chunk being generated; when it placed anything, send it on to the neighbours it reaches */
export function placeNetherFeature(ctx: GenContext, f: number, seed: number, x: number, y: number, z: number): void {
  const param = run(f, new GenWorld(ctx, x, z), seed, x, y, z, -1);
  if (param < 0) return;
  const reach = REACH[f];
  for (let ncx = (x - reach) >> 4; ncx <= (x + reach) >> 4; ncx++)
    for (let ncz = (z - reach) >> 4; ncz <= (z + reach) >> 4; ncz++) if (ncx !== ctx.cx || ncz !== ctx.cz) ctx.deferFeature(ncx, ncz, [f, x, y, z, seed, param]);
}

/** a neighbour's feature, replayed into chunk (cx, cz); `param` is what the first run measured (a pillar's foot) */
export function replayNetherFeature(acc: BlockAccess, cx: number, cz: number, op: ArrayLike<number>, i: number): void {
  const f = op[i], x = op[i + 1], y = op[i + 2], z = op[i + 3], seed = op[i + 4], param = op[i + 5];
  run(f, new ReplayWorld(acc, cx, cz, x, z), seed, x, y, z, param);
}

/** the ints a deferred feature takes in PendingWrites.feats */
export const FEATURE_OP_SIZE = 6;

/** runs a feature (`replay` >= 0: again, with the first run's measure); -1 when nothing was placed, else what a replay needs */
function run(f: number, w: FeatureWorld, seed: number, x: number, y: number, z: number, replay: number): number {
  const r = new Rand(seed, 7);
  const K = netherBlocks();
  const again = replay >= 0;
  const ok = (b: boolean) => (b ? 0 : -1);
  switch (f) {
    case F_GLOWSTONE: return ok(glowstone(w, r, x, y, z, again));
    case F_FIRE: return ok(patch(w, r, x, y, z, K.FIRE, (st) => st === K.NETHERRACK));
    case F_SOUL_FIRE: return ok(patch(w, r, x, y, z, S('soul_fire'), (st) => st === S('soul_sand') || st === S('soul_soil')));
    case F_BROWN_MUSHROOM: return ok(patch(w, r, x, y, z, K.BROWN_MUSHROOM, mushroomGround));
    case F_RED_MUSHROOM: return ok(patch(w, r, x, y, z, K.RED_MUSHROOM, mushroomGround));
    case F_DELTA: return ok(delta(w, r, x, y, z));
    case F_SMALL_COLUMNS: return ok(basaltColumns(w, r, x, y, z, 1, 1, 1, 4, again));
    case F_LARGE_COLUMNS: return ok(basaltColumns(w, r, x, y, z, 2, 3, 5, 10, again));
    case F_PILLAR: return basaltPillar(w, r, x, y, z, replay);
    case F_CRIMSON_FUNGUS: return ok(hugeFungus(w, r, seed, x, y, z, true, again));
    case F_WARPED_FUNGUS: return ok(hugeFungus(w, r, seed, x, y, z, false, again));
    case F_CRIMSON_VEGETATION: return ok(forestVegetation(w, r, x, y, z, CRIMSON_VEGETATION, again));
    case F_WARPED_VEGETATION: return ok(forestVegetation(w, r, x, y, z, WARPED_VEGETATION, again));
    case F_NETHER_SPROUTS: return ok(forestVegetation(w, r, x, y, z, SPROUTS, again));
    case F_WEEPING_VINES: return ok(weepingVines(w, r, x, y, z, again));
    case F_TWISTING_VINES: return ok(twistingVines(w, r, x, y, z, again));
  }
  return -1;
}

const DIRS6: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

/** vanilla GlowstoneFeature: a clump hanging from a netherrack, basalt or blackstone ceiling */
function glowstone(w: FeatureWorld, r: Rand, x: number, y: number, z: number, replay: boolean): boolean {
  const K = netherBlocks();
  if (!replay) {
    if (!w.isEmpty(x, y, z)) return false;
    const up = w.get(x, y + 1, z);
    if (up !== K.NETHERRACK && up !== K.BASALT && up !== K.BLACKSTONE) return false;
  }
  w.set(x, y, z, K.GLOWSTONE);
  for (let i = 0; i < 1500; i++) {
    const px = x + r.nextInt(8) - r.nextInt(8), py = y - r.nextInt(12), pz = z + r.nextInt(8) - r.nextInt(8);
    if (!w.isEmpty(px, py, pz)) continue;
    let n = 0;
    for (const [dx, dy, dz] of DIRS6) {
      if (w.get(px + dx, py + dy, pz + dz) === K.GLOWSTONE) n++;
      if (n > 1) break;
    }
    if (n === 1) w.set(px, py, pz, K.GLOWSTONE);
  }
  return true;
}

/** vanilla RandomPatchFeature with a SimpleBlock: 96 spots within 7 across and 3 up or down, where the plant fits */
function patch(w: FeatureWorld, r: Rand, x: number, y: number, z: number, state: number, ground: (st: number) => boolean): boolean {
  for (let i = 0; i < 96; i++) {
    const px = x + r.nextInt(8) - r.nextInt(8), py = y + r.nextInt(4) - r.nextInt(4), pz = z + r.nextInt(8) - r.nextInt(8);
    const here = w.get(px, py, pz);
    if (here < 0 || !(FLAGS[here] & F_AIR)) continue;
    const below = w.get(px, py - 1, pz);
    if (below < 0 || !ground(below)) continue;
    w.set(px, py, pz, state);
  }
  // (the spots over the border are the replays' to fill, whatever happened here)
  return true;
}

/** vanilla MushroomBlock.canSurvive during generation: a solid, full block below (no light yet) */
function mushroomGround(st: number): boolean {
  return st > 0 && (FLAGS[st] & F_OPAQUE) !== 0;
}

const NO_DELTA = new Set(['bedrock', 'nether_bricks', 'nether_brick_fence', 'nether_brick_stairs', 'nether_wart', 'chest', 'spawner']);

/** vanilla DeltaFeature: a pool of lava let into the floor (y is the floor block), with a crescent of magma along one side */
function delta(w: FeatureWorld, r: Rand, x: number, y: number, z: number): boolean {
  const K = netherBlocks();
  const rim = r.nextDouble() < 0.9;
  const ri = rim ? r.nextInt(3) : 0, rj = rim ? r.nextInt(3) : 0;
  const withRim = rim && ri !== 0 && rj !== 0;
  const k = 3 + r.nextInt(5), l = 3 + r.nextInt(5);
  const m = Math.max(k, l);
  const clear = (px: number, py: number, pz: number) => {
    const st = w.get(px, py, pz);
    if (st < 0 || st === K.LAVA || NO_DELTA.has(nameOf(st))) return false;
    for (const [dx, dy, dz] of DIRS6) if (w.isEmpty(px + dx, py + dy, pz + dz) !== (dy === 1)) return false;
    return true;
  };
  // vanilla BlockPos.withinManhattan: nearest first
  const spots: [number, number][] = [];
  for (let dx = -k; dx <= k; dx++) for (let dz = -l; dz <= l; dz++) if (Math.abs(dx) + Math.abs(dz) <= m) spots.push([dx, dz]);
  spots.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])));
  let placed = false;
  for (const [dx, dz] of spots) {
    const px = x + dx, pz = z + dz;
    if (!clear(px, y, pz)) continue;
    if (withRim) {
      w.set(px, y, pz, K.MAGMA);
      placed = true;
    }
    if (clear(px + ri, y, pz + rj)) {
      w.set(px + ri, y, pz + rj, K.LAVA);
      placed = true;
    }
  }
  return placed;
}

const NO_COLUMN = new Set(['lava', 'bedrock', 'magma_block', 'soul_sand', 'nether_bricks', 'nether_brick_fence', 'nether_brick_stairs', 'nether_wart', 'chest', 'spawner']);

/** vanilla BasaltColumnsFeature: a cluster of basalt columns standing on the floor (or in the lava sea); y is the air over the floor */
function basaltColumns(w: FeatureWorld, r: Rand, x: number, y: number, z: number, reachLo: number, reachHi: number, hLo: number, hHi: number, replay: boolean): boolean {
  const K = netherBlocks();
  const airOrSea = (px: number, py: number, pz: number) => {
    const st = w.get(px, py, pz);
    if (st < 0) return !w.guessSolid(px, py, pz);
    return (FLAGS[st] & F_AIR) !== 0 || (st === K.LAVA && py <= NETHER_SEA_LEVEL);
  };
  const canPlaceAt = (px: number, py: number, pz: number) => {
    if (!airOrSea(px, py, pz)) return false;
    const below = w.get(px, py - 1, pz);
    if (below < 0) return w.guessSolid(px, py - 1, pz);
    return !(FLAGS[below] & F_AIR) && !NO_COLUMN.has(nameOf(below));
  };
  if (!replay && !canPlaceAt(x, y, z)) return false;
  const height = hLo + r.nextInt(hHi - hLo + 1);
  const tall = r.nextFloat() < 0.9;
  const spread = Math.min(height, tall ? 5 : 8);
  const n = tall ? 50 : 15;
  let placed = false;
  for (let k = 0; k < n; k++) {
    const cx = x - spread + r.nextInt(2 * spread + 1), cz = z - spread + r.nextInt(2 * spread + 1);
    const dist = height - (Math.abs(cx - x) + Math.abs(cz - z));
    if (dist < 0) continue;
    const reach = reachLo + r.nextInt(reachHi - reachLo + 1);
    for (let px = cx - reach; px <= cx + reach; px++)
      for (let pz = cz - reach; pz <= cz + reach; pz++) {
        const d = Math.abs(px - cx) + Math.abs(pz - cz);
        let py = y, left = d, found: number | null = null;
        if (airOrSea(px, py, pz)) {
          // findSurface: down to where it can stand
          while (py > 1 && left > 0) {
            left--;
            if (canPlaceAt(px, py, pz)) {
              found = py;
              break;
            }
            py--;
          }
        } else {
          // findAir: up out of the ground
          while (py < 255 && left > 0) {
            left--;
            const st = w.get(px, py, pz);
            if (st >= 0 && NO_COLUMN.has(nameOf(st))) break;
            if (w.isEmpty(px, py, pz)) {
              found = py;
              break;
            }
            py++;
          }
        }
        if (found === null) continue;
        for (let j = dist - (d >> 1), yy = found; j >= 0; j--) {
          if (airOrSea(px, yy, pz)) {
            w.set(px, yy++, pz, K.BASALT);
            placed = true;
          } else if (w.get(px, yy, pz) === K.BASALT) yy++;
          else break;
        }
      }
  }
  return placed;
}

/**
 * vanilla BasaltPillarFeature: a pillar from the ceiling down to the floor, ragged at the sides, splayed at the foot.
 * Returns the pillar's foot (so a replay can walk the same length down it), -1 when it didn't fit.
 */
function basaltPillar(w: FeatureWorld, r: Rand, x: number, y: number, z: number, foot: number): number {
  const K = netherBlocks();
  const replay = foot >= 0;
  const empty = (px: number, py: number, pz: number) => (replay ? py > foot : w.isEmpty(px, py, pz));
  if (!replay && (!w.isEmpty(x, y, z) || w.isEmpty(x, y + 1, z))) return -1;
  const hang = [true, true, true, true];
  const sides: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  let py = y;
  while (empty(x, py, z)) {
    if (py < 0) return 0;
    w.set(x, py, z, K.BASALT);
    sides.forEach(([dx, dz], s) => {
      if (!hang[s]) return;
      if (r.nextInt(10) !== 0) w.set(x + dx, py, z + dz, K.BASALT);
      else hang[s] = false;
    });
    py--;
  }
  const bottom = py;
  py++;
  for (const [dx, dz] of sides) if (r.nextBool()) w.set(x + dx, py, z + dz, K.BASALT);
  py--;
  for (let i = -3; i < 4; i++)
    for (let j = -3; j < 4; j++) {
      if (r.nextInt(10) >= 10 - Math.abs(i) * Math.abs(j)) continue;
      let yy = py;
      for (let l = 3; w.isEmpty(x + i, yy - 1, z + j); ) {
        yy--;
        if (--l <= 0) break;
      }
      if (!w.isEmpty(x + i, yy - 1, z + j)) w.set(x + i, yy, z + j, K.BASALT);
    }
  return bottom;
}

// ---------------------------------------------------------------------------
// The nether forests
//
// (Where a choice hangs on what's in a block, the dice are rolled whatever the answer, or come from the
// block's own position, so a replay across the border makes the same choices as the first run.)

interface Flora {
  CRIMSON_NYLIUM: number; WARPED_NYLIUM: number; CRIMSON_STEM: number; WARPED_STEM: number; WART: number; WARPED_WART: number; SHROOMLIGHT: number;
  CRIMSON_ROOTS: number; WARPED_ROOTS: number; CRIMSON_FUNGUS: number; WARPED_FUNGUS: number; SPROUTS: number;
  WEEPING_PLANT: number; TWISTING_PLANT: number;
}
let FLORA: Flora | null = null;
function flora(): Flora {
  return (FLORA ??= {
    CRIMSON_NYLIUM: S('crimson_nylium'), WARPED_NYLIUM: S('warped_nylium'), CRIMSON_STEM: S('crimson_stem'), WARPED_STEM: S('warped_stem'),
    WART: S('nether_wart_block'), WARPED_WART: S('warped_wart_block'), SHROOMLIGHT: S('shroomlight'),
    CRIMSON_ROOTS: S('crimson_roots'), WARPED_ROOTS: S('warped_roots'), CRIMSON_FUNGUS: S('crimson_fungus'), WARPED_FUNGUS: S('warped_fungus'),
    SPROUTS: S('nether_sprouts'), WEEPING_PLANT: S('weeping_vines_plant'), TWISTING_PLANT: S('twisting_vines_plant'),
  });
}
const vineHead = (name: 'weeping_vines' | 'twisting_vines', age: number) => BLOCK_BY_NAME.get(name)!.state({ age });

/** a die for one block of a feature: the same whichever run asks */
function at(seed: number, dx: number, dy: number, dz: number, salt: number): number {
  let h = hash32(seed ^ Math.imul(dx + 64, 0x27d4eb2d));
  h = hash32(h ^ Math.imul(dy + 64, 0x165667b1));
  h = hash32(h ^ Math.imul(dz + 64, 0x9e3779b1) ^ salt);
  return (h >>> 8) / 16777216;
}

/** vanilla HugeFungusConfiguration.replaceableBlocks (#replaceable_by_trees-ish: plants and the like) */
const FUNGUS_REPLACEABLE = /(_sapling|_mushroom|_fungus|_roots|^(dandelion|poppy|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|torchflower|nether_sprouts|weeping_vines|weeping_vines_plant|twisting_vines|twisting_vines_plant|nether_wart|sugar_cane|wheat|carrots|potatoes|beetroots|sweet_berry_bush|lily_pad|moss_carpet|azalea|flowering_azalea|spore_blossom|cave_vines|cave_vines_plant|short_grass|fern|tall_grass|large_fern|dead_bush))$/;

function fungusReplaceable(w: FeatureWorld, x: number, y: number, z: number, config: boolean): boolean {
  const st = w.get(x, y, z);
  if (st < 0) return false;
  if (FLAGS[st] & (F_AIR | F_REPLACEABLE)) return true;
  return config && FUNGUS_REPLACEABLE.test(nameOf(st));
}

/**
 * vanilla HugeFungusFeature (crimson_fungus / warped_fungus, not planted): on its nylium, a stem 4 to 13 tall
 * (now and then twice that; a few are three wide), under a hat of wart block studded with shroomlight, and
 * (crimson) weeping vines hanging from the hat's rim
 */
function hugeFungus(w: FeatureWorld, r: Rand, seed: number, x: number, y: number, z: number, crimson: boolean, replay: boolean): boolean {
  const K = flora();
  if (!replay && w.get(x, y - 1, z) !== (crimson ? K.CRIMSON_NYLIUM : K.WARPED_NYLIUM)) return false;
  let height = 4 + r.nextInt(10);
  if (r.nextInt(12) === 0) height *= 2;
  if (y + height + 1 >= 128) return false;
  const huge = r.nextFloat() < 0.06;
  const stem = crimson ? K.CRIMSON_STEM : K.WARPED_STEM, hat = crimson ? K.WART : K.WARPED_WART;
  w.set(x, y, z, 0);
  // stem
  const s = huge ? 1 : 0;
  for (let dx = -s; dx <= s; dx++)
    for (let dz = -s; dz <= s; dz++) {
      const corner = huge && Math.abs(dx) === s && Math.abs(dz) === s;
      for (let l = 0; l < height; l++) {
        if (!fungusReplaceable(w, x + dx, y + l, z + dz, true)) continue;
        if (!corner || at(seed, dx, l, dz, 1) < 0.1) w.set(x + dx, y + l, z + dz, stem);
      }
    }
  // hat
  const i = Math.min(r.nextInt(1 + Math.floor(height / 3)) + 5, height);
  const j = height - i;
  for (let k = j; k <= height; k++) {
    let l = k < height - r.nextInt(3) ? 2 : 1;
    if (i > 8 && k < j + 4) l = 3;
    if (huge) l++;
    for (let dx = -l; dx <= l; dx++)
      for (let dz = -l; dz <= l; dz++) {
        const xEdge = dx === -l || dx === l, zEdge = dz === -l || dz === l;
        const inside = !xEdge && !zEdge && k !== height;
        const corner = xEdge && zEdge;
        const lower = k < j + 3;
        const px = x + dx, py = y + k, pz = z + dz;
        if (!fungusReplaceable(w, px, py, pz, false)) continue;
        const d = (salt: number) => at(seed, dx, k, dz, salt);
        if (lower) {
          if (inside) continue;
          // vanilla placeHatDropBlock: the hat's skirt hangs on in strands
          if (w.get(px, py - 1, pz) === hat) w.set(px, py, pz, hat);
          else if (d(2) < 0.15) {
            w.set(px, py, pz, hat);
            if (crimson && Math.floor(d(3) * 11) === 0) hatVines(w, seed, px, py, pz, dx, k, dz);
          }
          continue;
        }
        const [deco, hatP, vineP] = inside ? [0.1, 0.2, crimson ? 0.1 : 0] : corner ? [0.01, 0.7, crimson ? 0.083 : 0] : [0.0005, 0.98, crimson ? 0.07 : 0];
        if (d(4) < deco) w.set(px, py, pz, K.SHROOMLIGHT);
        else if (d(5) < hatP) {
          w.set(px, py, pz, hat);
          if (d(6) < vineP) hatVines(w, seed, px, py, pz, dx, k, dz);
        }
      }
  }
  return true;
}

/** vanilla HugeFungusFeature.tryPlaceWeepingVines: a short vine under a piece of the hat */
function hatVines(w: FeatureWorld, seed: number, x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
  if (!w.isEmpty(x, y - 1, z)) return;
  const r = new Rand(hash32(seed ^ Math.imul(dx + 64, 0x632be5ab) ^ Math.imul(dy + 64, 0x85ebca77) ^ Math.imul(dz + 64, 0xc2b2ae3d)), 13);
  let n = 1 + r.nextInt(5);
  if (r.nextInt(7) === 0) n *= 2;
  weepingColumn(w, r, x, y - 1, z, n, 23, 25);
}

/** vanilla WeepingVinesFeature.placeWeepingVinesColumn: plant pieces down to a head of some age */
function weepingColumn(w: FeatureWorld, r: Rand, x: number, y: number, z: number, length: number, minAge: number, maxAge: number): void {
  const age = minAge + r.nextInt(maxAge - minAge + 1);
  const K = flora();
  for (let i = 0; i <= length; i++, y--) {
    if (!w.isEmpty(x, y, z)) continue;
    if (i === length || !w.isEmpty(x, y - 1, z)) {
      w.set(x, y, z, vineHead('weeping_vines', age));
      return;
    }
    w.set(x, y, z, K.WEEPING_PLANT);
  }
}

interface Vegetation {
  /** [state name, weight] */
  states: [string, number][];
}
const CRIMSON_VEGETATION: Vegetation = { states: [['crimson_roots', 87], ['crimson_fungus', 11], ['warped_fungus', 1]] };
const WARPED_VEGETATION: Vegetation = { states: [['warped_roots', 85], ['crimson_roots', 1], ['warped_fungus', 13], ['crimson_fungus', 1]] };
const SPROUTS: Vegetation = { states: [['nether_sprouts', 1]] };
const FLORA_SOIL = new Set(['crimson_nylium', 'warped_nylium', 'soul_soil', 'grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium', 'moss_block', 'farmland', 'mud']);

/** vanilla NetherForestVegetationFeature: 64 tries within 7 across and 3 up or down, from a nylium floor */
function forestVegetation(w: FeatureWorld, r: Rand, x: number, y: number, z: number, v: Vegetation, replay: boolean): boolean {
  if (!replay) {
    const below = w.get(x, y - 1, z);
    if (below < 0 || !/_nylium$/.test(nameOf(below))) return false;
  }
  if (y < 1 || y + 1 >= 256) return false;
  const total = v.states.reduce((a, [, n]) => a + n, 0);
  let placed = 0;
  for (let k = 0; k < 64; k++) {
    const px = x + r.nextInt(8) - r.nextInt(8), py = y + r.nextInt(4) - r.nextInt(4), pz = z + r.nextInt(8) - r.nextInt(8);
    let pick = v.states.length > 1 ? r.nextInt(total) : 0;
    let name = v.states[0][0];
    for (const [n, wgt] of v.states) {
      if (pick < wgt) {
        name = n;
        break;
      }
      pick -= wgt;
    }
    const here = w.get(px, py, pz);
    if (here < 0 || !(FLAGS[here] & F_AIR) || py <= 0) continue;
    const below = w.get(px, py - 1, pz);
    if (below < 0 || !FLORA_SOIL.has(nameOf(below))) continue;
    w.set(px, py, pz, S(name));
    placed++;
  }
  return replay || placed > 0;
}

/** vanilla WeepingVinesFeature: a knot of wart block on the ceiling and vines hanging round it */
function weepingVines(w: FeatureWorld, r: Rand, x: number, y: number, z: number, replay: boolean): boolean {
  const K = flora(), NR = netherBlocks().NETHERRACK;
  const roof = (st: number) => st === NR || st === K.WART;
  if (!replay && (!w.isEmpty(x, y, z) || !roof(w.get(x, y + 1, z)))) return false;
  w.set(x, y, z, K.WART);
  for (let i = 0; i < 200; i++) {
    const px = x + r.nextInt(6) - r.nextInt(6), py = y + r.nextInt(2) - r.nextInt(5), pz = z + r.nextInt(6) - r.nextInt(6);
    if (!w.isEmpty(px, py, pz)) continue;
    let n = 0;
    for (const [dx, dy, dz] of DIRS6) {
      if (roof(w.get(px + dx, py + dy, pz + dz))) n++;
      if (n > 1) break;
    }
    if (n === 1) w.set(px, py, pz, K.WART);
  }
  for (let i = 0; i < 100; i++) {
    const px = x + r.nextInt(8) - r.nextInt(8), py = y + r.nextInt(2) - r.nextInt(7), pz = z + r.nextInt(8) - r.nextInt(8);
    let len = 1 + r.nextInt(8);
    if (r.nextInt(6) === 0) len *= 2;
    if (r.nextInt(5) === 0) len = 1;
    const cr = new Rand(r.nextU32(), 5);
    if (!w.isEmpty(px, py, pz) || !roof(w.get(px, py + 1, pz))) continue;
    weepingColumn(w, cr, px, py, pz, len, 17, 25);
  }
  return true;
}

/** vanilla TwistingVinesFeature: 64 vines rising from the netherrack, warped nylium and warped wart round the spot */
function twistingVines(w: FeatureWorld, r: Rand, x: number, y: number, z: number, replay: boolean): boolean {
  const K = flora(), NR = netherBlocks().NETHERRACK;
  const invalid = (px: number, py: number, pz: number) => {
    if (!w.isEmpty(px, py, pz)) return true;
    const b = w.get(px, py - 1, pz);
    return b !== NR && b !== K.WARPED_NYLIUM && b !== K.WARPED_WART;
  };
  if (!replay && invalid(x, y, z)) return false;
  for (let i = 0; i < 64; i++) {
    let px = x + r.nextInt(17) - 8, py = y + r.nextInt(9) - 4, pz = z + r.nextInt(17) - 8;
    let len = 1 + r.nextInt(8);
    if (r.nextInt(6) === 0) len *= 2;
    if (r.nextInt(5) === 0) len = 1;
    const age = 17 + r.nextInt(9);
    // (findFirstAirBlockAboveGround: down through the air to what's under it)
    let ground = false;
    for (;;) {
      py--;
      if (py < 0) break;
      const st = w.get(px, py, pz);
      if (st < 0 || !(FLAGS[st] & F_AIR)) {
        ground = st >= 0;
        break;
      }
    }
    py++;
    if (!ground || invalid(px, py, pz)) continue;
    for (let k = 1; k <= len; k++, py++) {
      if (!w.isEmpty(px, py, pz)) continue;
      if (k === len || !w.isEmpty(px, py + 1, pz)) {
        w.set(px, py, pz, vineHead('twisting_vines', age));
        break;
      }
      w.set(px, py, pz, K.TWISTING_PLANT);
    }
    void pz;
    px = px | 0;
  }
  return true;
}
