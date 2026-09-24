// The temples (vanilla structure sets desert_pyramids, igloos, jungle_temples and swamp_huts): at most one of each
// kind per 32 x 32-chunk region, in a chunk drawn from the region's salted random (vanilla RandomSpreadStructurePlacement,
// spacing 32, separation 8), where the biome at the middle of the chunk is one of the kind's (#has_structure/<kind>).
// Pyramids also need the ground at the corners of their footprint to be at sea level or above (SinglePieceStructure).
// Each is laid out once from the start chunk's large-feature random, moved to the height of the ground under it,
// and placed chunk by chunk in the SURFACE_STRUCTURES step. The chunk workers and the main thread (/locate, the
// witch hut's spawns) work them out alike.

import { Rand, hash2 } from '../../core/rng';
import { B } from './biomes';
import { MIN_Y, MAX_Y, SEA_LEVEL } from '../constants';
import type { GenContext } from './context';
import { largeFeatureRandom, saltedRandom } from './jigsaw';
import { BoundingBox, type StructurePiece } from './structure';
import { DesertPyramidPiece } from './desertPyramid';
import { SwampHutPiece } from './swampHut';

export type TempleKind = 'desert_pyramid' | 'igloo' | 'jungle_pyramid' | 'swamp_hut';

/** the kinds placed so far, in vanilla's order in the SURFACE_STRUCTURES step (the structures by name) */
export const TEMPLE_KINDS: TempleKind[] = ['desert_pyramid', 'swamp_hut'];

interface TempleSet {
  /** vanilla worldgen/structure_set/<set>.json salt */
  salt: number;
  /** vanilla #has_structure/<kind> */
  biomes: number[];
  /** vanilla SinglePieceStructure: the width and depth getLowestY looks at the corners of (null: no such rule) */
  footprint: [number, number] | null;
}

const SETS: Record<TempleKind, TempleSet> = {
  desert_pyramid: { salt: 14357617, biomes: [B.desert], footprint: [21, 21] },
  igloo: { salt: 14357618, biomes: [B.snowy_taiga, B.snowy_plains, B.snowy_slopes], footprint: null },
  jungle_pyramid: { salt: 14357619, biomes: [B.jungle, B.bamboo_jungle], footprint: [12, 15] },
  // (vanilla SwampHutStructure isn't a SinglePieceStructure: huts stand in water as well)
  swamp_hut: { salt: 14357620, biomes: [B.swamp], footprint: null },
};
const KIND_INDEX: Record<TempleKind, number> = { desert_pyramid: 0, igloo: 1, jungle_pyramid: 2, swamp_hut: 3 };

// vanilla RandomSpreadStructurePlacement for all four
const SPACING = 32, SEPARATION = 8;

export interface TempleTerrain {
  /** vanilla getBaseHeight(WORLD_SURFACE_WG) on the bare noise terrain: the first block above it (water counts) */
  firstFreeHeight(x: number, z: number): number;
  /** vanilla OCEAN_FLOOR_WG: the first block above the highest solid one (water doesn't count) */
  oceanFloorHeight(x: number, z: number): number;
  /** the biome at a quart (vanilla getNoiseBiome) */
  quartBiome(x: number, z: number): number;
}

export interface TempleStub {
  kind: TempleKind;
  /** the start chunk (vanilla locate reports its corner) */
  cx: number;
  cz: number;
}

export interface TempleStart extends TempleStub {
  pieces: StructurePiece[];
  /** vanilla PiecesContainer.calculateBoundingBox */
  bounds: BoundingBox;
  /** vanilla Structure.afterPlace, after the pieces in each chunk */
  afterPlace?: (ctx: GenContext, chunk: BoundingBox) => void;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

export class Temples {
  private readonly stubs = new Map<number, TempleStub | null>();
  private readonly starts = new Map<number, TempleStart>();
  private readonly seedHash: number;

  constructor(readonly seed: bigint, private readonly terrain: TempleTerrain) {
    this.seedHash = Number(BigInt.asIntN(32, seed ^ (seed >> 32n)));
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (linear spread) */
  potentialChunk(kind: TempleKind, rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, SETS[kind].salt);
    const i = r.nextInt(SPACING - SEPARATION), j = r.nextInt(SPACING - SEPARATION);
    return [rx * SPACING + i, rz * SPACING + j];
  }

  private key(kind: TempleKind, rx: number, rz: number): number {
    return (KIND_INDEX[kind] * 131072 + (rx + 65536)) * 131072 + (rz + 65536);
  }

  /**
   * The temple of a kind a region has, if any (vanilla Structure.findValidGenerationPoint): the biome at the middle
   * of the chunk (onTopOfChunkCenter, then isValidBiome), and for pyramids getLowestY: the lowest of the first
   * occupied heights at the corners of the footprint, which mustn't be below sea level
   */
  stub(kind: TempleKind, rx: number, rz: number): TempleStub | null {
    const key = this.key(kind, rx, rz);
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(kind, rx, rz);
    const set = SETS[kind];
    let s: TempleStub | null = null;
    if (set.biomes.includes(this.terrain.quartBiome(cx * 16 + 8, cz * 16 + 8))) {
      s = { kind, cx, cz };
      if (set.footprint) {
        const [w, d] = set.footprint;
        const x = cx * 16, z = cz * 16;
        const h = (a: number, b: number) => this.terrain.firstFreeHeight(a, b) - 1;
        if (Math.min(h(x, z), h(x, z + d), h(x + w, z), h(x + w, z + d)) < SEA_LEVEL) s = null;
      }
    }
    if (this.stubs.size > 8192) this.stubs.clear();
    this.stubs.set(key, s);
    return s;
  }

  /** a region's temple laid out (vanilla Structure.generate: the pieces from the start chunk's large-feature random) */
  start(kind: TempleKind, rx: number, rz: number): TempleStart | null {
    const s = this.stub(kind, rx, rz);
    if (!s) return null;
    const key = this.key(kind, rx, rz);
    let st = this.starts.get(key);
    if (st) return st;
    st = this.layout(s);
    if (this.starts.size > 256) this.starts.clear();
    this.starts.set(key, st);
    return st;
  }

  private layout(s: TempleStub): TempleStart {
    const r = largeFeatureRandom(this.seed, s.cx, s.cz);
    const x0 = s.cx * 16, z0 = s.cz * 16;
    const t = this.terrain;
    switch (s.kind) {
      case 'desert_pyramid': {
        const p = new DesertPyramidPiece(this.seed, r, x0, z0);
        // vanilla updateHeightPositionToLowestGroundHeight(level, -random.nextInt(3)): down to the lowest ocean floor
        // under the whole of it, and 0-2 lower (drawn here, once, rather than by whichever chunk comes first)
        let low = MAX_Y;
        for (let z = p.box.minZ; z <= p.box.maxZ; z++) for (let x = p.box.minX; x <= p.box.maxX; x++) low = Math.min(low, t.oceanFloorHeight(x, z));
        p.moveToY(low - r.nextInt(3));
        return { ...s, pieces: [p], bounds: copy(p.box), afterPlace: (ctx, chunk) => p.afterPlace(ctx, chunk) };
      }
      case 'swamp_hut': {
        const p = new SwampHutPiece(this.seed, r, x0, z0);
        p.moveToY(averageGround(t, p.box));
        return { ...s, pieces: [p], bounds: copy(p.box) };
      }
      default:
        throw new Error('no layout for ' + s.kind);
    }
  }

  /** the temples of a kind whose start chunk is next to the chunk (none reaches further from its start) */
  startsNear(kind: TempleKind, cx: number, cz: number): TempleStart[] {
    const out: TempleStart[] = [];
    for (let rx = floorDiv(cx - 1, SPACING); rx <= floorDiv(cx + 1, SPACING); rx++)
      for (let rz = floorDiv(cz - 1, SPACING); rz <= floorDiv(cz + 1, SPACING); rz++) {
        const s = this.stub(kind, rx, rz);
        if (!s || Math.abs(s.cx - cx) > 1 || Math.abs(s.cz - cz) > 1) continue;
        const st = this.start(kind, rx, rz);
        if (st) out.push(st);
      }
    return out;
  }

  /** vanilla StructureStart.placeInChunk for every temple reaching this chunk, kind by kind */
  place(ctx: GenContext): void {
    const chunk = new BoundingBox(ctx.x0, MIN_Y + 1, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    for (const kind of TEMPLE_KINDS) {
      // vanilla ChunkGenerator.applyBiomeDecoration: one random per structure for the chunk (setFeatureSeed)
      let r: Rand | null = null;
      for (const s of this.startsNear(kind, ctx.cx, ctx.cz)) {
        if (!s.bounds.intersects(chunk)) continue;
        r ??= new Rand(hash2(ctx.cx, ctx.cz, this.seedHash ^ SETS[kind].salt), 0x7e);
        for (const p of s.pieces) if (p.box.intersects(chunk)) p.postProcess(ctx, chunk, r);
        s.afterPlace?.(ctx, chunk);
      }
    }
  }

  /**
   * vanilla ChunkGenerator.getNearestGeneratedStructure for /locate: rings of regions outwards from the one the
   * position is in, and the first start met going round a ring (not always the closest one); the start chunk's
   * corner is what's reported (StructurePlacement.getLocatePos)
   */
  nearest(kind: TempleKind, x: number, z: number, radius = 100): [number, number] | null {
    const rx0 = floorDiv(x >> 4, SPACING), rz0 = floorDiv(z >> 4, SPACING);
    for (let ring = 0; ring <= radius; ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (i !== -ring && i !== ring && j !== -ring && j !== ring) continue;
          const s = this.stub(kind, rx0 + i, rz0 + j);
          if (s) return [s.cx * 16, s.cz * 16];
        }
    return null;
  }
}

function copy(b: BoundingBox): BoundingBox {
  return new BoundingBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
}

/**
 * vanilla ScatteredFeaturePiece.updateAverageGroundHeight: the mean MOTION_BLOCKING_NO_LEAVES height under the part of
 * the piece in the chunk being placed (rounded toward zero), which for a piece that fits in its start chunk is all of it
 */
function averageGround(t: TempleTerrain, b: BoundingBox): number {
  let sum = 0, n = 0;
  for (let z = b.minZ; z <= b.maxZ; z++)
    for (let x = b.minX; x <= b.maxX; x++) {
      sum += t.firstFreeHeight(x, z);
      n++;
    }
  return Math.trunc(sum / n);
}
