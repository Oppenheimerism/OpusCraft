// Dripstone caves decoration (vanilla DripstoneUtils, LargeDripstoneFeature,
// DripstoneClusterFeature, PointedDripstoneFeature with the dripstone_caves
// placements): giant dripstone columns, clusters of stalactites and
// stalagmites over dripstone floors (with the odd pool), and lone pointed
// dripstone on patches of dripstone block. Blocks in chunks that aren't
// generated yet count as rock; writes into them wait as pending writes.

import { Rand } from '../../core/rng';
import { clampedMap } from '../../core/math';
import { BLOCKS, getBlock, blockOf, FLAGS, F_AIR, F_FULL_COLLISION, S, type Block } from '../block';
import { GenContext, W_BASE_STONE, W_WATER_OR_AIR } from './context';
import { B } from './biomes';
import { MIN_Y, MAX_Y } from '../constants';

let IDS: { dripstone: number; pointed: Block; water: Block; lava: Block; base: Set<number> } | null = null;
function ids(): NonNullable<typeof IDS> {
  if (!IDS) {
    const base = new Set(['stone', 'granite', 'diorite', 'andesite', 'tuff', 'deepslate'].map((n) => BLOCKS.findIndex((b) => b.name === n)));
    IDS = { dripstone: S('dripstone_block'), pointed: getBlock('pointed_dripstone'), water: getBlock('water'), lava: getBlock('lava'), base };
  }
  return IDS;
}

const isAir = (st: number) => st === 0 || (st > 0 && (FLAGS[st] & F_AIR) !== 0);
/** DripstoneUtils.isEmptyOrWater (anything not generated yet is rock) */
const isEmptyOrWater = (st: number) => st >= 0 && (isAir(st) || blockOf(st) === ids().water);
const isEmptyOrWaterOrLava = (st: number) => isEmptyOrWater(st) || (st > 0 && blockOf(st) === ids().lava);
const isNeitherEmptyNorWater = (st: number) => !isEmptyOrWater(st);
const isLava = (st: number) => st > 0 && blockOf(st) === ids().lava;
/** #base_stone_overworld (= #dripstone_replaceable_blocks) */
const isBaseStone = (st: number) => st > 0 && ids().base.has(blockOf(st).id);
const isDripstoneBase = (st: number) => st > 0 && (st === ids().dripstone || isBaseStone(st));
const isDripstoneBaseOrLava = (st: number) => isDripstoneBase(st) || isLava(st);

/** vanilla Mth.randomBetweenInclusive */
const between = (r: Rand, lo: number, hi: number) => lo + r.nextInt(hi - lo + 1);
/** vanilla ClampedNormalFloat.sample */
const clampedNormal = (r: Rand, mean: number, dev: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, mean + r.gaussian() * dev));

/** vanilla Column.scan: the solid floor and ceiling (block y) around an open spot, each within `max` */
function scanColumn(ctx: GenContext, x: number, y: number, z: number, max: number, open: (st: number) => boolean, boundary: (st: number) => boolean): { floor: number | null; ceiling: number | null } | null {
  if (!open(ctx.get(x, y, z))) return null;
  const scan = (d: number) => {
    let yy = y;
    for (let i = 1; i < max && open(ctx.get(x, yy, z)); i++) yy += d;
    return boundary(ctx.get(x, yy, z)) ? yy : null;
  };
  return { ceiling: scan(1), floor: scan(-1) };
}

/** DripstoneUtils.placeDripstoneBlockIfPossible (outside the chunk: wherever the rock turns out to be base stone) */
function placeDripstoneBlock(ctx: GenContext, x: number, y: number, z: number): boolean {
  if (!ctx.inChunk(x, z)) return ctx.set(x, y, z, ids().dripstone, W_BASE_STONE);
  if (!isBaseStone(ctx.get(x, y, z))) return false;
  ctx.set(x, y, z, ids().dripstone);
  return true;
}

/** DripstoneUtils.growPointedDripstone: base, middles, frustum and tip (dir 1 grows up, -1 hangs down) */
function growPointedDripstone(ctx: GenContext, x: number, y: number, z: number, dir: 1 | -1, height: number, mergeTip: boolean): void {
  if (height <= 0 || !isDripstoneBase(ctx.get(x, y - dir, z))) return;
  const parts: string[] = [];
  if (height >= 3) {
    parts.push('base');
    for (let i = 0; i < height - 3; i++) parts.push('middle');
  }
  if (height >= 2) parts.push('frustum');
  parts.push(mergeTip ? 'tip_merge' : 'tip');
  const P = ids().pointed;
  let yy = y;
  for (const th of parts) {
    const cur = ctx.get(x, yy, z);
    const water = cur > 0 && (blockOf(cur) === ids().water || (blockOf(cur).propIndex('waterlogged') >= 0 && blockOf(cur).get<boolean>(cur, 'waterlogged')));
    ctx.set(x, yy, z, P.state({ vertical_direction: dir > 0 ? 'up' : 'down', thickness: th, waterlogged: water }));
    yy += dir;
  }
}

// ---------------------------------------------------------------------------
// PointedDripstoneFeature (with its patch of dripstone block)

const HORIZONTAL: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ALL_DIRS: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

function pointedDripstone(ctx: GenContext, r: Rand, x: number, y: number, z: number): void {
  const up = isDripstoneBase(ctx.get(x, y + 1, z)), down = isDripstoneBase(ctx.get(x, y - 1, z));
  let dir: 1 | -1;
  if (up && down) dir = r.nextBool() ? -1 : 1;
  else if (up) dir = -1;
  else if (down) dir = 1;
  else return;
  // createPatchOfDripstoneBlocks around the block it grows from
  const bx = x, by = y - dir, bz = z;
  placeDripstoneBlock(ctx, bx, by, bz);
  for (const [hx, hz] of HORIZONTAL) {
    if (r.nextFloat() > 0.7) continue;
    let px = bx + hx, py = by, pz = bz + hz;
    placeDripstoneBlock(ctx, px, py, pz);
    if (r.nextFloat() > 0.5) continue;
    let d = ALL_DIRS[r.nextInt(6)];
    px += d[0];
    py += d[1];
    pz += d[2];
    placeDripstoneBlock(ctx, px, py, pz);
    if (r.nextFloat() > 0.5) continue;
    d = ALL_DIRS[r.nextInt(6)];
    placeDripstoneBlock(ctx, px + d[0], py + d[1], pz + d[2]);
  }
  const h = r.nextFloat() < 0.2 && isEmptyOrWater(ctx.get(x, y + dir, z)) ? 2 : 1;
  growPointedDripstone(ctx, x, y, z, dir, h, false);
}

// ---------------------------------------------------------------------------
// DripstoneClusterFeature (dripstone_cluster configuration)

function dripstoneCluster(ctx: GenContext, r: Rand, x: number, y: number, z: number): void {
  if (!isEmptyOrWater(ctx.get(x, y, z))) return;
  const height = between(r, 3, 6);
  const wetness = clampedNormal(r, 0.1, 0.3, 0.1, 0.9);
  const density = 0.3 + r.nextFloat() * 0.4;
  const rx = between(r, 2, 8), rz = between(r, 2, 8);
  for (let dx = -rx; dx <= rx; dx++)
    for (let dz = -rz; dz <= rz; dz++) {
      // fewer columns towards the edge (max distance from edge affecting chance 3, 0.1 at the rim)
      const chance = clampedMap(Math.min(rx - Math.abs(dx), rz - Math.abs(dz)), 0, 3, 0.1, 1);
      clusterColumn(ctx, r, x + dx, y, z + dz, dx, dz, wetness, chance, height, density);
    }
}

function clusterColumn(ctx: GenContext, r: Rand, x: number, y: number, z: number, dx: number, dz: number, wetness: number, chance: number, height: number, density: number): void {
  const col = scanColumn(ctx, x, y, z, 12, isEmptyOrWater, isNeitherEmptyNorWater);
  if (!col || (col.ceiling === null && col.floor === null)) return;
  const ceiling = col.ceiling;
  let floor = col.floor;
  const wet = r.nextFloat() < wetness;
  if (wet && floor !== null && canPlacePool(ctx, x, floor, z)) {
    ctx.set(x, floor, z, S('water'));
    floor--;
  }
  const dripHeight = (h: number) => {
    if (r.nextFloat() > density) return 0;
    const mean = clampedMap(Math.abs(dx) + Math.abs(dz), 0, 8, h / 2, 0);
    return Math.trunc(clampedNormal(r, mean, 3, 0, h));
  };
  let down = 0;
  if (ceiling !== null && r.nextDouble() < chance && !isLava(ctx.get(x, ceiling, z))) {
    replaceWithDripstone(ctx, x, ceiling, z, between(r, 2, 4), 1);
    down = dripHeight(floor !== null ? Math.min(height, ceiling - floor) : height);
  }
  let up = 0;
  if (floor !== null && r.nextDouble() < chance && !isLava(ctx.get(x, floor, z))) {
    replaceWithDripstone(ctx, x, floor, z, between(r, 2, 4), -1);
    up = ceiling !== null ? Math.max(0, down + between(r, -1, 1)) : dripHeight(height);
  }
  let stalactite: number, stalagmite: number;
  if (ceiling !== null && floor !== null && ceiling - down <= floor + up) {
    // they'd overlap: meet at a random height between them
    const lo = Math.max(ceiling - down, floor + 1), hi = Math.min(floor + up, ceiling - 1);
    const meet = hi + 1 >= lo ? between(r, lo, hi + 1) : lo;
    stalactite = ceiling - meet;
    stalagmite = meet - 1 - floor;
  } else {
    stalactite = down;
    stalagmite = up;
  }
  const colHeight = ceiling !== null && floor !== null ? ceiling - floor - 1 : -1;
  const merge = r.nextBool() && stalactite > 0 && stalagmite > 0 && stalactite + stalagmite === colHeight;
  if (ceiling !== null) growPointedDripstone(ctx, x, ceiling - 1, z, -1, stalactite, merge);
  if (floor !== null) growPointedDripstone(ctx, x, floor + 1, z, 1, stalagmite, merge);
}

/** a floor block that can hold water: rock or water on every side and below, no water above */
function canPlacePool(ctx: GenContext, x: number, y: number, z: number): boolean {
  const st = ctx.get(x, y, z);
  if (st < 0 || blockOf(st) === ids().water || st === ids().dripstone || blockOf(st) === ids().pointed) return false;
  const above = ctx.get(x, y + 1, z);
  if (above > 0 && blockOf(above) === ids().water) return false;
  const holds = (s: number) => isBaseStone(s) || (s > 0 && blockOf(s) === ids().water);
  for (const [hx, hz] of HORIZONTAL) if (!holds(ctx.get(x + hx, y, z + hz))) return false;
  return holds(ctx.get(x, y - 1, z));
}

function replaceWithDripstone(ctx: GenContext, x: number, y: number, z: number, thickness: number, dir: 1 | -1): void {
  for (let i = 0; i < thickness; i++) if (!placeDripstoneBlock(ctx, x, y + i * dir, z)) return;
}

// ---------------------------------------------------------------------------
// LargeDripstoneFeature (large_dripstone configuration)

/** DripstoneUtils.getDripstoneHeight: the profile of a dripstone cone */
function dripstoneHeight(radius: number, maxRadius: number, scale: number, minRadius: number): number {
  if (radius < minRadius) radius = minRadius;
  const d1 = (radius / maxRadius) * 0.384;
  const d5 = Math.max(0, scale * (0.75 * Math.pow(d1, 4 / 3) - Math.pow(d1, 2 / 3) - Math.log(d1) / 3));
  return (d5 / 0.384) * maxRadius;
}

interface Wind {
  originY: number;
  x: number;
  z: number;
}
const windOffset = (w: Wind | null, x: number, y: number, z: number): [number, number] =>
  w ? [x + Math.floor(w.x * (w.originY - y)), z + Math.floor(w.z * (w.originY - y))] : [x, z];

class LargeDripstone {
  constructor(public x: number, public y: number, public z: number, readonly up: boolean, public radius: number, readonly bluntness: number, readonly scale: number) {}

  heightAt(r: number): number {
    return Math.trunc(dripstoneHeight(r, this.radius, this.scale, this.bluntness));
  }

  suitableForWind(): boolean {
    return this.radius >= 4 && this.bluntness >= 0.6;
  }

  /** moveBackUntilBaseIsInsideStoneAndShrinkRadiusIfNecessary */
  settle(ctx: GenContext, wind: Wind | null): boolean {
    while (this.radius > 1) {
      let y = this.y;
      const n = Math.min(10, this.heightAt(0));
      for (let j = 0; j < n; j++) {
        if (isLava(ctx.get(this.x, y, this.z))) return false;
        const [wx, wz] = windOffset(wind, this.x, y, this.z);
        if (circleInStone(ctx, wx, y, wz, this.radius)) {
          this.y = y;
          return true;
        }
        y += this.up ? -1 : 1;
      }
      this.radius = Math.trunc(this.radius / 2);
    }
    return false;
  }

  place(ctx: GenContext, r: Rand, wind: Wind | null): void {
    const DS = ids().dripstone;
    for (let i = -this.radius; i <= this.radius; i++)
      for (let j = -this.radius; j <= this.radius; j++) {
        const f = Math.sqrt(i * i + j * j);
        if (f > this.radius) continue;
        let k = this.heightAt(f);
        if (k <= 0) continue;
        if (r.nextFloat() < 0.2) k = Math.trunc(k * (0.8 + r.nextFloat() * 0.2));
        const cx = this.x + i, cz = this.z + j;
        // stalagmites stop at the surface (WORLD_SURFACE_WG)
        const limit = this.up && ctx.inChunk(cx, cz) ? ctx.heightSurface(cx, cz) : Infinity;
        let y = this.y, placed = false;
        for (let n = 0; n < k && y < limit; n++) {
          const [bx, bz] = windOffset(wind, cx, y, cz);
          if (!ctx.inChunk(bx, bz)) {
            ctx.set(bx, y, bz, DS, W_WATER_OR_AIR);
            placed = true;
          } else {
            const st = ctx.get(bx, y, bz);
            if (isEmptyOrWaterOrLava(st)) {
              ctx.set(bx, y, bz, DS);
              placed = true;
            } else if (placed && isBaseStone(st)) break;
          }
          y += this.up ? 1 : -1;
        }
      }
  }
}

/** DripstoneUtils.isCircleMostlyEmbeddedInStone */
function circleInStone(ctx: GenContext, x: number, y: number, z: number, radius: number): boolean {
  if (isEmptyOrWaterOrLava(ctx.get(x, y, z))) return false;
  const step = 6 / radius;
  for (let a = 0; a < Math.PI * 2; a += step) {
    if (isEmptyOrWaterOrLava(ctx.get(x + Math.trunc(Math.cos(a) * radius), y, z + Math.trunc(Math.sin(a) * radius)))) return false;
  }
  return true;
}

function largeDripstone(ctx: GenContext, r: Rand, x: number, y: number, z: number): void {
  if (!isEmptyOrWater(ctx.get(x, y, z))) return;
  const col = scanColumn(ctx, x, y, z, 30, isEmptyOrWater, isDripstoneBaseOrLava);
  if (!col || col.floor === null || col.ceiling === null) return;
  const h = col.ceiling - col.floor - 1;
  if (h < 4) return;
  const maxR = Math.min(19, Math.max(3, Math.trunc(h * 0.33)));
  const radius = between(r, 3, maxR);
  const stalactite = new LargeDripstone(x, col.ceiling - 1, z, false, radius, 0.3 + r.nextFloat() * 0.6, 0.4 + r.nextFloat() * 1.6);
  const stalagmite = new LargeDripstone(x, col.floor + 1, z, true, radius, 0.4 + r.nextFloat() * 0.6, 0.4 + r.nextFloat() * 1.6);
  let wind: Wind | null = null;
  if (stalactite.suitableForWind() && stalagmite.suitableForWind()) {
    const speed = r.nextFloat() * 0.3, angle = r.nextFloat() * Math.PI;
    wind = { originY: y, x: Math.cos(angle) * speed, z: Math.sin(angle) * speed };
  }
  const a = stalactite.settle(ctx, wind), b = stalagmite.settle(ctx, wind);
  if (a) stalactite.place(ctx, r, wind);
  if (b) stalagmite.place(ctx, r, wind);
}

// ---------------------------------------------------------------------------
// placements

const inDripstoneCaves = (ctx: GenContext, x: number, y: number, z: number) => ctx.biomeAt3(x, y, z) === B.dripstone_caves;
/** vanilla ClampedNormalInt.sample */
const clampedNormalInt = (r: Rand, mean: number, dev: number, lo: number, hi: number) => Math.trunc(clampedNormal(r, mean, dev, lo, hi));
const solid = (st: number) => st < 0 || (st > 0 && (FLAGS[st] & F_FULL_COLLISION) !== 0);
const airOrWater = (st: number) => st >= 0 && (isAir(st) || blockOf(st) === ids().water);

/** vanilla EnvironmentScanPlacement: from an open spot to the first solid block within 12 */
function scanTo(ctx: GenContext, x: number, y: number, z: number, dir: 1 | -1): number | null {
  if (!airOrWater(ctx.get(x, y, z))) return null;
  let yy = y;
  for (let i = 0; i < 12; i++) {
    if (solid(ctx.get(x, yy, z))) return yy;
    yy += dir;
    if (yy < MIN_Y || yy >= MAX_Y) return null;
    if (!airOrWater(ctx.get(x, yy, z))) break;
  }
  return solid(ctx.get(x, yy, z)) ? yy : null;
}

/** vanilla large_dripstone (LOCAL_MODIFICATIONS): 10-48 tries a chunk from the bottom to y 256 */
export function largeDripstones(ctx: GenContext, r: Rand): void {
  if (!ctx.caveBiomes) return;
  const n = between(r, 10, 48);
  for (let i = 0; i < n; i++) {
    const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16), y = MIN_Y + r.nextInt(256 - MIN_Y + 1);
    if (inDripstoneCaves(ctx, x, y, z)) largeDripstone(ctx, r, x, y, z);
  }
}

/** vanilla dripstone_cluster and pointed_dripstone (UNDERGROUND_DECORATION) */
export function dripstoneDecoration(ctx: GenContext, r: Rand): void {
  if (!ctx.caveBiomes) return;
  const clusters = between(r, 48, 96);
  for (let i = 0; i < clusters; i++) {
    const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16), y = MIN_Y + r.nextInt(256 - MIN_Y + 1);
    if (inDripstoneCaves(ctx, x, y, z)) dripstoneCluster(ctx, r, x, y, z);
  }
  const spots = between(r, 192, 256);
  for (let i = 0; i < spots; i++) {
    const x0 = ctx.x0 + r.nextInt(16), z0 = ctx.z0 + r.nextInt(16), y0 = MIN_Y + r.nextInt(256 - MIN_Y + 1);
    const count = between(r, 1, 5);
    for (let k = 0; k < count; k++) {
      const x = x0 + clampedNormalInt(r, 0, 3, -10, 10), y = y0 + clampedNormalInt(r, 0, 0.6, -2, 2), z = z0 + clampedNormalInt(r, 0, 3, -10, 10);
      if (!ctx.inChunk(x, z) || !inDripstoneCaves(ctx, x, y, z)) continue;
      // one of two: on the floor below, or hanging from the ceiling above
      const dir: 1 | -1 = r.nextInt(2) === 0 ? -1 : 1;
      const hit = scanTo(ctx, x, y, z, dir);
      if (hit !== null) pointedDripstone(ctx, r, x, hit - dir, z);
    }
  }
}
