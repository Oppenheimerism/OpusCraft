// Ancient cities (vanilla structure set minecraft:ancient_cities: random_spread, spacing 24, separation 8, salt
// 20083232; and the jigsaw structure minecraft:ancient_city: start pool ancient_city/city_center placed by its
// minecraft:city_anchor connector at y -27, size 7, 116 blocks from the centre at most, only where the deep dark is,
// in the UNDERGROUND_DECORATION step, with terrain adaptation beard_box). The pieces are templates written in code
// (world/gen/ancientCityPieces.ts); unlike a village's, their air is placed too (vanilla SinglePoolElement), so they
// hollow out the cave they stand in. As they're placed they crack and crumble (vanilla's ancient_city_start /
// _generic / _walls_degradation processor lists), and the sculk pieces grow their sculk patches.

import { JavaRandom, Rand, hash3 } from '../../core/rng';
import { BLOCK_BY_NAME } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import { B } from './biomes';
import type { GenContext } from './context';
import type { Bury } from './stronghold';
import { POOLS, Box, Piece, EMPTY, jigsawAssemble, largeFeatureRandom, saltedRandom, shuffle, type Rot } from './jigsaw';
import { VOID, CityElement, CityListElement, CitySculkElement, posKey, tidyCityBlockEntities, type CityPlaceCtx, type SculkSource } from './ancientCityTemplates';
import { sculkPatch, SCULK_PATCH_ANCIENT_CITY } from './deepDark';
import { registerCityPools } from './ancientCityPieces';
import type { SculkLevel } from '../sculkSpreader';

// vanilla RandomSpreadStructurePlacement for ancient_cities
export const CITY_SPACING = 24, CITY_SEPARATION = 8, CITY_SALT = 20083232;
// vanilla JigsawStructure ancient_city
export const CITY_SIZE = 7, CITY_MAX_DISTANCE = 116, CITY_START_Y = -27;
export const CITY_ANCHOR = 'minecraft:city_anchor';

// ---------------------------------------------------------------------------------------------------------------
// A city's pieces

/** one city's pieces, found by chunk, with the sculk its sculk pieces grow */
export class CityLayout implements SculkSource {
  /** piece indices by chunk column the piece's box reaches */
  private readonly byChunk = new Map<number, number[]>();
  /** the sculk pieces, by index */
  private readonly sculkPieces: number[] = [];
  /** the sculk pieces whose patches may reach a chunk column, by chunk */
  private readonly sculkByChunk = new Map<number, number[]>();
  private readonly grown = new Map<number, Map<number, number>>();
  readonly bounds: Box;
  private readonly DEEPSLATE: number;

  constructor(readonly pieces: Piece[], private readonly salt: number) {
    const bs = pieces.map((p) => p.box);
    this.bounds = new Box(
      Math.min(...bs.map((b) => b.minX)), Math.min(...bs.map((b) => b.minY)), Math.min(...bs.map((b) => b.minZ)),
      Math.max(...bs.map((b) => b.maxX)), Math.max(...bs.map((b) => b.maxY)), Math.max(...bs.map((b) => b.maxZ)),
    );
    pieces.forEach((p, i) => {
      if (p.element instanceof CitySculkElement) this.sculkPieces.push(i);
      for (let cx = p.box.minX >> 4; cx <= p.box.maxX >> 4; cx++)
        for (let cz = p.box.minZ >> 4; cz <= p.box.maxZ >> 4; cz++) {
          const k = cx * 65536 + cz;
          let l = this.byChunk.get(k);
          if (!l) this.byChunk.set(k, (l = []));
          l.push(i);
        }
    });
    this.DEEPSLATE = BLOCK_BY_NAME.get('deepslate')!.defaultState;
  }

  /** the pieces whose boxes reach a chunk column, in the order they're placed */
  inChunk(cx: number, cz: number): number[] {
    return this.byChunk.get(cx * 65536 + cz) ?? [];
  }

  /** the sculk pieces before `upTo` whose patches may reach a block (they reach 16 across at most) */
  private patchesNear(x: number, z: number, upTo: number, reach = 16): number[] {
    return this.sculkPieces.filter((i) => i < upTo && Math.abs(this.pieces[i].x - x) <= reach && Math.abs(this.pieces[i].z - z) <= reach);
  }

  /**
   * what stands at a position once the pieces before `upTo` are placed: the last of them that puts something there;
   * where none does, the ground under the city's floor and the rock round the city are solid, the rest hollowed out
   */
  stateAt(x: number, y: number, z: number, upTo: number): number {
    const list = this.inChunk(x >> 4, z >> 4);
    let inside = false, best = VOID, bestIndex = -1;
    for (let n = list.length - 1; n >= 0; n--) {
      const i = list[n];
      if (i >= upTo) continue;
      const p = this.pieces[i], e = p.element;
      if (!(e instanceof CityElement || e instanceof CityListElement) || !p.box.isInside(x, y, z)) continue;
      inside = true;
      const st = e.stateAt(p, x, y, z);
      if (st !== VOID) {
        best = st;
        bestIndex = i;
        break;
      }
    }
    // (a later sculk patch over it)
    for (const i of this.sculkNearChunk(x >> 4, z >> 4)) {
      if (i <= bestIndex || i >= upTo) continue;
      const p = this.pieces[i];
      if (Math.abs(p.x - x) > 16 || Math.abs(p.z - z) > 16) continue;
      const st = this.grown.get(i)?.get(posKey(x, y, z, p));
      if (st !== undefined) {
        best = st;
        bestIndex = i;
      }
    }
    if (best !== VOID) return best;
    if (!inside) return this.DEEPSLATE;
    return y < this.floorUnder(x, z) ? this.DEEPSLATE : 0;
  }

  /** the sculk pieces within 16 blocks of a chunk column, in order */
  private sculkNearChunk(cx: number, cz: number): number[] {
    const k = cx * 65536 + cz;
    let l = this.sculkByChunk.get(k);
    if (!l) this.sculkByChunk.set(k, (l = this.patchesNear(cx * 16 + 8, cz * 16 + 8, this.pieces.length, 24)));
    return l;
  }

  /** the lowest floor of the pieces over a column (below it, the terrain is filled in) */
  private floorUnder(x: number, z: number): number {
    let f = Infinity;
    for (const i of this.inChunk(x >> 4, z >> 4)) {
      const b = this.pieces[i].box;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) f = Math.min(f, b.minY + this.pieces[i].groundLevelDelta);
    }
    return f;
  }

  /** whether a block is inside one of the city's pieces */
  private insidePieces(x: number, y: number, z: number): boolean {
    return this.inChunk(x >> 4, z >> 4).some((i) => this.pieces[i].box.isInside(x, y, z));
  }

  /**
   * the sculk the sculk piece at `index` grows, worked out the first time it's asked for: on the city as it stands
   * when that piece's turn comes (the patches before it grown first)
   */
  sculk(index: number): Map<number, number> {
    let m = this.grown.get(index);
    if (m) return m;
    const p = this.pieces[index];
    for (const i of this.patchesNear(p.x, p.z, index, 34)) this.sculk(i);
    const overlay = new Map<number, number>();
    const seen = new Map<number, number>();
    const view: SculkLevel = {
      getState: (x, y, z) => {
        const k = posKey(x, y, z, p);
        let st = overlay.get(k) ?? seen.get(k);
        if (st === undefined) seen.set(k, (st = this.stateAt(x, y, z, index)));
        return st;
      },
      // (only what falls within the city's pieces is kept: the rock round it isn't known)
      setState: (x, y, z, st) => {
        if (this.insidePieces(x, y, z)) overlay.set(posKey(x, y, z, p), st);
      },
    };
    sculkPatch(view, p.x, p.y, p.z, new Rand(hash3(p.x, p.y, p.z, this.salt ^ 0xfea7), 0x5f), SCULK_PATCH_ANCIENT_CITY);
    this.grown.set(index, overlay);
    return overlay;
  }

  /** vanilla StructureStart.placeInChunk: every piece reaching the chunk, in order (and the sculk patches reaching it) */
  place(ctx: GenContext, chunk: Box): void {
    const order = new Set(this.inChunk(ctx.cx, ctx.cz));
    for (const i of this.patchesNear(ctx.x0 + 8, ctx.z0 + 8, this.pieces.length, 24)) order.add(i);
    for (const i of [...order].sort((a, b) => a - b)) {
      const p = this.pieces[i];
      if (!(p.element instanceof CitySculkElement) && !p.box.intersects(chunk)) continue;
      const pc: CityPlaceCtx = { ctx, chunk, salt: this.salt, city: this, index: i };
      p.element.place(pc, p);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Terrain adaptation (vanilla Beardifier with TerrainAdjustment.BEARD_BOX)

/** vanilla BEARD_KERNEL: exp(-(x² + (y + ½)² + z²) / 16) over -12..11 on each axis, indexed [z][x][y] */
const KERNEL = (() => {
  const k = new Float32Array(24 * 24 * 24);
  for (let z = 0; z < 24; z++)
    for (let x = 0; x < 24; x++)
      for (let y = 0; y < 24; y++) {
        const dx = x - 12, dy = y - 12 + 0.5, dz = z - 12;
        k[(z * 24 + x) * 24 + y] = Math.exp(-(dx * dx + dy * dy + dz * dz) / 16);
      }
  return k;
})();

/** vanilla Beardifier.getBeardContribution */
function beard(x: number, y: number, z: number, height: number): number {
  const i = x + 12, j = y + 12, k = z + 12;
  if (i < 0 || i >= 24 || j < 0 || j >= 24 || k < 0 || k >= 24) return 0;
  const d = height + 0.5;
  const e = x * x + d * d + z * z;
  return ((-d / Math.sqrt(e / 2)) / 2) * KERNEL[(k * 24 + i) * 24 + j];
}

/**
 * The density the cities round a chunk add to its terrain (vanilla Beardifier.compute with BEARD_BOX): every piece's
 * whole box is hollowed out and the ground under its floor filled in, fading out over 12 blocks, and every junction
 * eases the ground towards its height
 */
function cityBeard(cities: CityLayout[], cx: number, cz: number): Bury | null {
  const rigid: number[] = [];
  const junctions: number[] = [];
  let minY = Infinity, maxY = -Infinity;
  const x0 = cx * 16, z0 = cz * 16;
  for (const city of cities)
    for (const p of city.pieces) {
      const b = p.box;
      // (vanilla isCloseToChunk(chunk, 12))
      if (!b.intersectsXZ(x0 - 12, z0 - 12, x0 + 15 + 12, z0 + 15 + 12)) continue;
      const floor = b.minY + p.groundLevelDelta;
      rigid.push(b.minX, b.minZ, b.maxX, b.maxZ, floor, b.maxY);
      minY = Math.min(minY, floor - 12);
      maxY = Math.max(maxY, b.maxY + 12);
      for (const j of p.junctions)
        if (j.x > x0 - 12 && j.z > z0 - 12 && j.x < x0 + 15 + 12 && j.z < z0 + 15 + 12) {
          junctions.push(j.x, j.groundY, j.z);
          minY = Math.min(minY, j.groundY - 12);
          maxY = Math.max(maxY, j.groundY + 12);
        }
    }
  if (!rigid.length && !junctions.length) return null;
  // (what reaches each column of the chunk, worked out the first time the column is asked about: for a rigid piece its
  // offset in each flat direction and its floor and top, for a junction its offsets and height)
  const columns: (number[] | null)[] = new Array(256).fill(null);
  const column = (x: number, z: number): number[] => {
    const out: number[] = [];
    for (let n = 0; n < rigid.length; n += 6) {
      const i1 = Math.max(0, rigid[n] - x, x - rigid[n + 2]);
      const j1 = Math.max(0, rigid[n + 1] - z, z - rigid[n + 3]);
      if (i1 < 12 && j1 < 12) out.push(0, i1, j1, rigid[n + 4], rigid[n + 5]);
    }
    for (let n = 0; n < junctions.length; n += 3) {
      const dx = x - junctions[n], dz = z - junctions[n + 2];
      if (dx > -12 && dx < 12 && dz > -12 && dz < 12) out.push(1, dx, dz, junctions[n + 1], 0);
    }
    return out;
  };
  return {
    minY,
    maxY,
    compute(x: number, y: number, z: number): number {
      const lx = x - x0, lz = z - z0;
      const list = lx >= 0 && lx < 16 && lz >= 0 && lz < 16 ? (columns[(lz << 4) | lx] ??= column(x, z)) : column(x, z);
      let d = 0;
      for (let n = 0; n < list.length; n += 5) {
        if (list[n] === 0) {
          const floor = list[n + 3];
          const i2 = Math.max(0, floor - y, y - list[n + 4]);
          if (i2 < 12) d += beard(list[n + 1], i2, list[n + 2], y - floor) * 0.8;
        } else {
          const l = y - list[n + 3];
          d += beard(list[n + 1], l, list[n + 2], l) * 0.4;
        }
      }
      return d;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Placement

export interface CityTerrain {
  /** the biome at a block, underground ones included (vanilla getNoiseBiome at its quart) */
  biome3(x: number, y: number, z: number): number;
}

export interface CityStub {
  /** the start chunk */
  cx: number;
  cz: number;
  /** vanilla GenerationStub position: the centre of the start piece, at y -27 */
  x: number;
  y: number;
  z: number;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

/**
 * vanilla JigsawPlacement.addPieces up to the start piece, for a start_jigsaw_name: a random turn and centre piece,
 * placed so its city_anchor connector is at the chunk's corner at y -27, then (having no heightmap to meet) lowered by
 * its ground level delta
 */
export function cityStart(r: JavaRandom, cx: number, cz: number): { piece: Piece; x: number; y: number; z: number } | null {
  registerCityPools();
  const rot = r.nextInt(4) as Rot;
  const e = POOLS.get('ancient_city/city_center')!.getRandomTemplate(r);
  if (e === EMPTY) return null;
  const px = cx * 16, py = CITY_START_Y, pz = cz * 16;
  // vanilla getRandomNamedJigsaw
  const js = e.jigsaws(px, py, pz, rot);
  shuffle(js, r);
  const anchor = js.find((j) => j.info.name === CITY_ANCHOR);
  if (!anchor) return null;
  const vx = anchor.x - px, vy = anchor.y - py, vz = anchor.z - pz;
  const bx = px - vx, by = py - vy, bz = pz - vz;
  const box = e.box(bx, by, bz, rot);
  const piece = new Piece(e, bx, by, bz, rot, box, e.groundLevelDelta);
  const i = Math.trunc((box.maxX + box.minX) / 2), j = Math.trunc((box.maxZ + box.minZ) / 2);
  piece.move(by - (box.minY + piece.groundLevelDelta));
  return { piece, x: i, y: by + vy, z: j };
}

export class AncientCities {
  private readonly stubs = new Map<number, CityStub | null>();
  private readonly built = new Map<number, CityLayout>();
  readonly salt: number;

  constructor(private readonly seed: bigint, private readonly terrain: CityTerrain) {
    this.salt = Number(BigInt.asIntN(32, seed ^ (seed >> 32n))) ^ 0xa4c17e;
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (linear spread) */
  potentialChunk(rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, CITY_SALT);
    const i = r.nextInt(CITY_SPACING - CITY_SEPARATION), j = r.nextInt(CITY_SPACING - CITY_SEPARATION);
    return [rx * CITY_SPACING + i, rz * CITY_SPACING + j];
  }

  /** the city a region has, if any: its start piece's centre, at y -27, has to be in the deep dark (Structure.isValidBiome) */
  stub(rx: number, rz: number): CityStub | null {
    const k = rx * 65536 + rz;
    const c = this.stubs.get(k);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(rx, rz);
    const s = cityStart(largeFeatureRandom(this.seed, cx, cz), cx, cz);
    const found = s && this.terrain.biome3(s.x, s.y, s.z) === B.deep_dark ? { cx, cz, x: s.x, y: s.y, z: s.z } : null;
    this.stubs.set(k, found);
    return found;
  }

  /** a region's city, laid out the first time it's wanted (vanilla JigsawPlacement.addPieces) */
  layout(rx: number, rz: number): CityLayout | null {
    const s = this.stub(rx, rz);
    if (!s) return null;
    const k = rx * 65536 + rz;
    let l = this.built.get(k);
    if (l) return l;
    if (this.built.size > 8) this.built.clear();
    const r = largeFeatureRandom(this.seed, s.cx, s.cz);
    const start = cityStart(r, s.cx, s.cz)!;
    const pieces = jigsawAssemble(start, r, CITY_SIZE, CITY_MAX_DISTANCE, false, () => MIN_Y);
    l = new CityLayout(pieces, this.salt);
    this.built.set(k, l);
    return l;
  }

  /** the cities that reach a chunk (a start refers to chunks within 8 of it, as vanilla's references) */
  near(cx: number, cz: number): CityLayout[] {
    const out: CityLayout[] = [];
    for (let rx = floorDiv(cx - 8, CITY_SPACING); rx <= floorDiv(cx + 8, CITY_SPACING); rx++)
      for (let rz = floorDiv(cz - 8, CITY_SPACING); rz <= floorDiv(cz + 8, CITY_SPACING); rz++) {
        const s = this.stub(rx, rz);
        if (!s || Math.abs(s.cx - cx) > 8 || Math.abs(s.cz - cz) > 8) continue;
        const l = this.layout(rx, rz);
        if (l && l.bounds.intersectsXZ(cx * 16 - 16, cz * 16 - 16, cx * 16 + 31, cz * 16 + 31)) out.push(l);
      }
    return out;
  }

  /** what the cities round a chunk do to its terrain before it's filled (null when nothing) */
  beardFor(cx: number, cz: number): Bury | null {
    const near = this.near(cx, cz);
    return near.length ? cityBeard(near, cx, cz) : null;
  }

  /** vanilla StructureStart.placeInChunk for every city reaching this chunk */
  place(ctx: GenContext): void {
    const near = this.near(ctx.cx, ctx.cz);
    if (!near.length) return;
    const chunk = new Box(ctx.x0, MIN_Y, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    for (const city of near) city.place(ctx, chunk);
    tidyCityBlockEntities(ctx);
  }

  /** vanilla getNearestGeneratedStructure for /locate: rings of regions outwards, the first city met on a ring */
  nearest(x: number, z: number, radius = 100): [number, number] | null {
    const rx0 = floorDiv(x >> 4, CITY_SPACING), rz0 = floorDiv(z >> 4, CITY_SPACING);
    for (let ring = 0; ring <= radius; ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (i !== -ring && i !== ring && j !== -ring && j !== ring) continue;
          const s = this.stub(rx0 + i, rz0 + j);
          if (s) return [s.cx * 16, s.cz * 16];
        }
    return null;
  }

  /** the city whose pieces hold a block, if any (vanilla getStructureWithPieceAt) */
  pieceAt(x: number, y: number, z: number): CityLayout | null {
    for (const l of this.near(x >> 4, z >> 4))
      if (l.bounds.isInside(x, y, z) && l.inChunk(x >> 4, z >> 4).some((i) => l.pieces[i].box.isInside(x, y, z))) return l;
    return null;
  }
}

