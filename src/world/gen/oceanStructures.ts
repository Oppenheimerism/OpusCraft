// Where the sea's smaller structures are (Stage 5: ocean; vanilla structure sets shipwrecks, ocean_ruins and
// buried_treasures): at most one shipwreck in every 24 x 24-chunk region (RandomSpreadStructurePlacement, spacing 24,
// separation 4), in the sea (#is_ocean) or, beached, on a beach; at most one ocean ruin in every 20 x 20 (spacing
// 20, separation 8), cold or warm by the sea it's in; and buried treasure in any beach chunk that one in a hundred
// chances allows (spacing 1, frequency 0.01 by vanilla's legacy_type_2 reduction). Which kind a chunk gets is the
// biome at its middle's. Wrecks and ruins are laid out once from the start chunk's large-feature random and placed
// chunk by chunk in the SURFACE_STRUCTURES step; buried treasure in UNDERGROUND_STRUCTURES. The chunk workers and the
// main thread (/locate, treasure maps, dolphins) find them alike, from the biome noise alone.

import { Rand, hash2 } from '../../core/rng';
import { B, pickSurfaceBiome } from './biomes';
import { MIN_Y, MAX_Y } from '../constants';
import { S, blockOf } from '../block';
import type { GenContext } from './context';
import { largeFeatureRandom, saltedRandom, worldSeed64 } from './jigsaw';
import { BoundingBox, PieceList, type StructurePiece } from './structure';
import { ScatteredPiece } from './templePiece';
import { shipwreckPiece, type ShipwreckTerrain } from './shipwreck';
import { oceanRuinPieces } from './oceanRuins';
import { OverworldRouter, newColumn } from './router';
import { SeedSource } from './noise';

export type OceanStructureKind = 'shipwreck' | 'shipwreck_beached' | 'ocean_ruin_cold' | 'ocean_ruin_warm' | 'buried_treasure';

interface OceanSet {
  /** vanilla worldgen/structure_set/<set>.json */
  salt: number;
  spacing: number;
  separation: number;
  kinds: OceanStructureKind[];
  /** vanilla frequency (legacy_type_2), when it's under 1 */
  frequency?: number;
  /** vanilla locate_offset (x, z) */
  locateOffset: [number, number];
}

export type OceanSetName = 'shipwrecks' | 'ocean_ruins' | 'buried_treasures';

const SETS: Record<OceanSetName, OceanSet> = {
  shipwrecks: { salt: 165745295, spacing: 24, separation: 4, kinds: ['shipwreck', 'shipwreck_beached'], locateOffset: [0, 0] },
  ocean_ruins: { salt: 14357621, spacing: 20, separation: 8, kinds: ['ocean_ruin_cold', 'ocean_ruin_warm'], locateOffset: [0, 0] },
  buried_treasures: { salt: 0, spacing: 1, separation: 0, kinds: ['buried_treasure'], frequency: 0.01, locateOffset: [9, 9] },
};
const SET_INDEX: Record<OceanSetName, number> = { shipwrecks: 0, ocean_ruins: 1, buried_treasures: 2 };
/** the set a structure is placed by */
export const SET_OF: Record<OceanStructureKind, OceanSetName> = {
  shipwreck: 'shipwrecks', shipwreck_beached: 'shipwrecks', ocean_ruin_cold: 'ocean_ruins', ocean_ruin_warm: 'ocean_ruins', buried_treasure: 'buried_treasures',
};

/** vanilla StructurePlacement.legacyArbitrarySaltProbabilityReducer's salt */
const LEGACY_TYPE_2_SALT = 10387320;

const OCEANS = [B.ocean, B.deep_ocean, B.frozen_ocean, B.deep_frozen_ocean, B.cold_ocean, B.deep_cold_ocean, B.lukewarm_ocean, B.deep_lukewarm_ocean, B.warm_ocean];
/** vanilla #has_structure/<kind> */
const BIOMES: Record<OceanStructureKind, Set<number>> = {
  shipwreck: new Set(OCEANS),
  shipwreck_beached: new Set([B.beach, B.snowy_beach]),
  ocean_ruin_cold: new Set([B.frozen_ocean, B.cold_ocean, B.ocean, B.deep_frozen_ocean, B.deep_cold_ocean, B.deep_ocean]),
  ocean_ruin_warm: new Set([B.lukewarm_ocean, B.warm_ocean, B.deep_lukewarm_ocean]),
  buried_treasure: new Set([B.beach, B.snowy_beach]),
};

/** how far (in chunks) from its start chunk a wreck or a ruin cluster can reach */
const REACH = 3;

export interface OceanStub {
  kind: OceanStructureKind;
  /** the start chunk */
  cx: number;
  cz: number;
}

export interface OceanStart extends OceanStub {
  pieces: StructurePiece[];
  bounds: BoundingBox;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

/** vanilla BuriedTreasurePieces.BuriedTreasurePiece: a chest under the sand at (9, 9) of its chunk */
export class BuriedTreasurePiece extends ScatteredPiece {
  constructor(worldSeed: bigint, x: number, z: number) {
    super(worldSeed, x, 90, z, 1, 1, 1, 'north');
  }

  /**
   * vanilla postProcess: down from the ocean floor to the first place over sandstone, stone, andesite, granite or
   * diorite; the six blocks round it made solid where they're air or liquid (with what's under the place when they'd
   * be left hanging over air or liquid, else with the place's own block, or sand); then the chest there
   */
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const x = this.box.minX, z = this.box.minZ;
    if (!ctx.inChunk(x, z)) return;
    const BASE = new Set(['sandstone', 'stone', 'andesite', 'granite', 'diorite'].map((n) => S(n)));
    const liquid = (st: number) => st === S('water') || st === S('lava');
    const empty = (st: number) => st <= 0 || blockOf(st).name === 'air' || blockOf(st).name === 'cave_air' || liquid(st);
    for (let y = ctx.heightOceanFloor(x, z); y > MIN_Y; y--) {
      const st = ctx.getOrAir(x, y, z), below = ctx.getOrAir(x, y - 1, z);
      if (!BASE.has(below)) continue;
      const fill = empty(st) ? S('sand') : st;
      // (vanilla Direction.values(): down, up, north, south, west, east)
      for (const [dx, dy, dz] of [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!empty(ctx.getOrAir(nx, ny, nz))) continue;
        ctx.set(nx, ny, nz, empty(ctx.getOrAir(nx, ny - 1, nz)) && dy !== 1 ? below : fill);
      }
      this.box = new BoundingBox(x, y, z, x, y, z);
      this.createChest(ctx, chunk, r, 0, 0, 0, 'chests/buried_treasure');
      return;
    }
  }
}

export interface OceanTerrain extends ShipwreckTerrain {}

export class OceanStructures {
  private readonly stubs = new Map<number, OceanStub | null>();
  private readonly starts = new Map<number, OceanStart>();
  private readonly seedHash: number;

  /**
   * `quartBiome`: the biome at a quart (vanilla getNoiseBiome); `terrain`: the heights the wrecks and ruins settle to
   * (none on the main thread, which only needs to know where they are)
   */
  constructor(readonly seed: bigint, readonly quartBiome: (x: number, z: number) => number, private readonly terrain: OceanTerrain | null) {
    this.seedHash = Number(BigInt.asIntN(32, seed ^ (seed >> 32n))) ^ 0x5eaf00d;
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (linear spread) */
  potentialChunk(set: OceanSetName, rx: number, rz: number): [number, number] {
    const s = SETS[set];
    if (s.spacing === 1) return [rx, rz];
    const r = saltedRandom(this.seed, rx, rz, s.salt);
    const n = s.spacing - s.separation;
    const i = r.nextInt(n), j = r.nextInt(n);
    return [rx * s.spacing + i, rz * s.spacing + j];
  }

  private key(set: OceanSetName, rx: number, rz: number): number {
    return (SET_INDEX[set] * 4194304 + (rx + 2097152)) * 4194304 + (rz + 2097152);
  }

  /**
   * the structure a region of a set has, if any: the frequency reduction first (buried treasure), then the kind whose
   * biomes the middle of the chunk is in (vanilla tries the set's kinds in a random order, but no biome has two)
   */
  stub(set: OceanSetName, rx: number, rz: number): OceanStub | null {
    const key = this.key(set, rx, rz);
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const s = SETS[set];
    const [cx, cz] = this.potentialChunk(set, rx, rz);
    let found: OceanStub | null = null;
    if (!s.frequency || saltedRandom(this.seed, cx, cz, LEGACY_TYPE_2_SALT).nextFloat() < s.frequency) {
      const biome = this.quartBiome(cx * 16 + 8, cz * 16 + 8);
      const kind = s.kinds.find((k) => BIOMES[k].has(biome));
      if (kind) found = { kind, cx, cz };
    }
    if (this.stubs.size > 65536) this.stubs.clear();
    this.stubs.set(key, found);
    return found;
  }

  /** a region's structure laid out (vanilla Structure.generate: its pieces from the start chunk's large-feature random) */
  start(set: OceanSetName, rx: number, rz: number): OceanStart | null {
    const s = this.stub(set, rx, rz);
    if (!s || !this.terrain) return null;
    const key = this.key(set, rx, rz);
    let st = this.starts.get(key);
    if (st) return st;
    const r = largeFeatureRandom(this.seed, s.cx, s.cz);
    const x0 = s.cx * 16, z0 = s.cz * 16, t = this.terrain;
    let pieces: StructurePiece[];
    switch (s.kind) {
      case 'shipwreck':
      case 'shipwreck_beached':
        pieces = [shipwreckPiece(this.seed, r, x0, z0, s.kind === 'shipwreck_beached', t)];
        break;
      case 'ocean_ruin_cold':
      case 'ocean_ruin_warm':
        pieces = oceanRuinPieces(this.seed, r, x0, z0, s.kind === 'ocean_ruin_warm', (x, z) => t.oceanFloorHeight(x, z));
        break;
      default:
        pieces = [new BuriedTreasurePiece(this.seed, x0 + 9, z0 + 9)];
    }
    const list = new PieceList();
    for (const p of pieces) list.add(p);
    st = { ...s, pieces, bounds: list.bounds() };
    if (this.starts.size > 256) this.starts.clear();
    this.starts.set(key, st);
    return st;
  }

  /** the starts of a set that may reach a chunk */
  private startsNear(set: OceanSetName, cx: number, cz: number, reach: number): OceanStart[] {
    const sp = SETS[set].spacing;
    const out: OceanStart[] = [];
    for (let rx = floorDiv(cx - reach, sp); rx <= floorDiv(cx + reach, sp); rx++)
      for (let rz = floorDiv(cz - reach, sp); rz <= floorDiv(cz + reach, sp); rz++) {
        const s = this.stub(set, rx, rz);
        if (!s || Math.abs(s.cx - cx) > reach || Math.abs(s.cz - cz) > reach) continue;
        const st = this.start(set, rx, rz);
        if (st) out.push(st);
      }
    return out;
  }

  private placeSet(ctx: GenContext, set: OceanSetName, reach: number): void {
    const chunk = new BoundingBox(ctx.x0, MIN_Y + 1, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    // vanilla ChunkGenerator.applyBiomeDecoration: one random per structure for the chunk (setFeatureSeed)
    let r: Rand | null = null;
    for (const s of this.startsNear(set, ctx.cx, ctx.cz, reach)) {
      if (!s.bounds.intersects(chunk)) continue;
      r ??= new Rand(hash2(ctx.cx, ctx.cz, this.seedHash ^ SETS[set].salt), 0x51e);
      for (const p of s.pieces) if (p.box.intersects(chunk)) p.postProcess(ctx, chunk, r);
    }
  }

  /** vanilla StructureStart.placeInChunk for the wrecks and ruins reaching this chunk (SURFACE_STRUCTURES) */
  place(ctx: GenContext): void {
    this.placeSet(ctx, 'shipwrecks', REACH);
    this.placeSet(ctx, 'ocean_ruins', REACH);
  }

  /** the chunk's buried treasure, if it has one (UNDERGROUND_STRUCTURES; it never reaches past its chunk) */
  placeUnderground(ctx: GenContext): void {
    this.placeSet(ctx, 'buried_treasures', 0);
  }

  /** where /locate and the maps say a start is (vanilla StructurePlacement.getLocatePos) */
  locatePos(s: OceanStub): [number, number] {
    const [ox, oz] = SETS[SET_OF[s.kind]].locateOffset;
    return [s.cx * 16 + ox, s.cz * 16 + oz];
  }

  /**
   * vanilla ChunkGenerator.getNearestGeneratedStructure (the one taking a ring) for the structures of one set: going
   * round ring `ring` of regions out from the one (x, z) is in, the first start of one of `kinds` met (not always the
   * closest one), leaving out those `skip` turns down; its locate position
   */
  inRing(set: OceanSetName, kinds: OceanStructureKind[], x: number, z: number, ring: number, skip?: (s: OceanStub) => boolean): { stub: OceanStub; pos: [number, number] } | null {
    const sp = SETS[set].spacing;
    const rx0 = floorDiv(x >> 4, sp), rz0 = floorDiv(z >> 4, sp);
    for (let i = -ring; i <= ring; i++)
      for (let j = -ring; j <= ring; j++) {
        if (i !== -ring && i !== ring && j !== -ring && j !== ring) continue;
        const s = this.stub(set, rx0 + i, rz0 + j);
        if (s && kinds.includes(s.kind) && !skip?.(s)) return { stub: s, pos: this.locatePos(s) };
      }
    return null;
  }

  /** vanilla ChunkGenerator.findNearestMapStructure for one set: ring by ring out to `radius`, the first one found */
  nearestIn(set: OceanSetName, kinds: OceanStructureKind[], x: number, z: number, radius: number, skip?: (s: OceanStub) => boolean): { stub: OceanStub; pos: [number, number] } | null {
    for (let ring = 0; ring <= radius; ring++) {
      const f = this.inRing(set, kinds, x, z, ring, skip);
      if (f) return f;
    }
    return null;
  }

  /** /locate structure <kind>: the nearest start's locate position (vanilla searches 100 rings out) */
  nearest(kind: OceanStructureKind, x: number, z: number, radius = 100): [number, number] | null {
    return this.nearestIn(SET_OF[kind], [kind], x, z, radius)?.pos ?? null;
  }
}

/** the sea's structures for the main thread (locating them): only the biome noise is needed to know where they are */
export function oceanStructureLocator(seed: string): OceanStructures {
  const router = new OverworldRouter(SeedSource.fromWorldSeed(seed));
  const col = newColumn();
  const quartBiome = (x: number, z: number) => {
    const c = router.column(x & ~3, z & ~3, col);
    return pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
  };
  return new OceanStructures(worldSeed64(seed), quartBiome, null);
}
