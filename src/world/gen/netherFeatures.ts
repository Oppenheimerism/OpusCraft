// Nether features that reach over chunk borders: glowstone clumps, fire and
// mushroom patches, the basalt deltas' lava pools and columns, and the soul
// sand valley's pillars. Each runs twice over: once in the chunk that places
// it (writing only there, with the neighbours guessed from the noise
// terrain), then again from the same seed in each neighbour it reaches once
// that neighbour exists (writing only there, reading the real blocks). A
// feature keeps its own writes in an overlay so both runs see the whole of it.

import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_OPAQUE, S } from '../block';
import type { BlockAccess } from './patches';
import type { GenContext } from './context';
import { Rand } from '../../core/rng';

export const F_GLOWSTONE = 1, F_FIRE = 2, F_BROWN_MUSHROOM = 3, F_RED_MUSHROOM = 4, F_DELTA = 5, F_SMALL_COLUMNS = 6, F_LARGE_COLUMNS = 7, F_PILLAR = 8;

/** how far from its origin each feature can write */
const REACH: Record<number, number> = {
  [F_GLOWSTONE]: 7, [F_FIRE]: 7, [F_BROWN_MUSHROOM]: 7, [F_RED_MUSHROOM]: 7, [F_DELTA]: 9, [F_SMALL_COLUMNS]: 10, [F_LARGE_COLUMNS]: 12, [F_PILLAR]: 3,
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
    case F_BROWN_MUSHROOM: return ok(patch(w, r, x, y, z, K.BROWN_MUSHROOM, mushroomGround));
    case F_RED_MUSHROOM: return ok(patch(w, r, x, y, z, K.RED_MUSHROOM, mushroomGround));
    case F_DELTA: return ok(delta(w, r, x, y, z));
    case F_SMALL_COLUMNS: return ok(basaltColumns(w, r, x, y, z, 1, 1, 1, 4, again));
    case F_LARGE_COLUMNS: return ok(basaltColumns(w, r, x, y, z, 2, 3, 5, 10, again));
    case F_PILLAR: return basaltPillar(w, r, x, y, z, replay);
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
