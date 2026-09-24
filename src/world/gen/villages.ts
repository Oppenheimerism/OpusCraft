// Villages (vanilla structure set minecraft:villages): where they go, which kind each one is, its pieces laid out
// once, the terrain bent around them, and each chunk's share placed as the chunk is generated.

import { B, pickSurfaceBiome } from './biomes';
import { OverworldRouter, newColumn } from './router';
import { SeedSource } from './noise';
import { MIN_Y, MAX_Y } from '../constants';
import type { GenContext } from './context';
import { POOLS, Box, Beardifier, jigsawStart, jigsawAssemble, largeFeatureRandom, saltedRandom, worldSeed64, type Piece, type PoolElement } from './jigsaw';
import { ZOMBIE_TOWN_CENTERS as PLAINS_ZOMBIES } from './villagePlains';

export type VillageKind = 'plains' | 'desert' | 'savanna' | 'snowy' | 'taiga';

/** vanilla structure set minecraft:villages, weight 1 each, in its order */
export const VILLAGE_KINDS: VillageKind[] = ['plains', 'desert', 'savanna', 'snowy', 'taiga'];

/** vanilla #minecraft:has_structure/village_<kind> */
const BIOME_SETS: Record<VillageKind, number[]> = {
  plains: [B.plains, B.meadow],
  desert: [B.desert],
  savanna: [B.savanna],
  snowy: [B.snowy_plains],
  taiga: [B.taiga],
};

// vanilla RandomSpreadStructurePlacement for villages
const SPACING = 34, SEPARATION = 8, SALT = 10387312;
// vanilla JigsawStructure village_*: size 6, max_distance_from_center 80, use_expansion_hack true
const SIZE = 6, MAX_DISTANCE = 80;

/**
 * Hook for zombie villages (vanilla's zombie town centers, weight 1 or 2 against 50-150): the start still draws them,
 * so villages come as often as in vanilla, but they're built as ordinary villages until zombie villagers exist
 */
const ZOMBIE_STARTS = new Set<PoolElement>([...PLAINS_ZOMBIES]);

export interface VillageTerrain {
  /** vanilla getFirstFreeHeight(WORLD_SURFACE_WG) on the bare noise terrain */
  firstFreeHeight(x: number, z: number): number;
  /** the biome at a quart (vanilla getNoiseBiome) */
  quartBiome(x: number, z: number): number;
}

export interface VillageStub {
  kind: VillageKind;
  /** the start chunk */
  cx: number;
  cz: number;
  /** the start piece's centre */
  x: number;
  z: number;
  /** drew a zombie town centre (see ZOMBIE_STARTS) */
  zombie: boolean;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

export class Villages {
  private readonly stubs = new Map<number, VillageStub | null>();
  private readonly built = new Map<number, Piece[]>();
  private readonly salt: number;

  constructor(private readonly seed: bigint, private readonly terrain: VillageTerrain) {
    this.salt = Number(BigInt.asIntN(32, seed ^ (seed >> 32n)));
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (linear spread) */
  potentialChunk(rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, SALT);
    const i = r.nextInt(SPACING - SEPARATION), j = r.nextInt(SPACING - SEPARATION);
    return [rx * SPACING + i, rz * SPACING + j];
  }

  /**
   * The village a region has, if any: vanilla ChunkGenerator.createStructures draws a kind by weight, and a kind whose
   * start piece's centre isn't in one of its biomes is struck off and the rest are drawn from (Structure.isValidBiome)
   */
  stub(rx: number, rz: number): VillageStub | null {
    const key = rx * 65536 + rz;
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(rx, rz);
    const pick = largeFeatureRandom(this.seed, cx, cz);
    const left = VILLAGE_KINDS.slice();
    let total = left.length;
    let found: VillageStub | null = null;
    while (left.length) {
      let j = pick.nextInt(total), k = 0;
      for (let n = 0; n < left.length; n++) {
        j -= 1;
        if (j < 0) break;
        k++;
      }
      const kind = left[k];
      const startPool = POOLS.get(`village/${kind}/town_centers`);
      if (startPool) {
        const s = jigsawStart(startPool, largeFeatureRandom(this.seed, cx, cz), cx, cz, null);
        if (s && BIOME_SETS[kind].includes(this.terrain.quartBiome(s.x, s.z))) {
          found = { kind, cx, cz, x: s.x, z: s.z, zombie: ZOMBIE_STARTS.has(s.piece.element) };
          break;
        }
      }
      left.splice(k, 1);
      total -= 1;
    }
    this.stubs.set(key, found);
    return found;
  }

  /** the pieces of a region's village, laid out the first time they're wanted (vanilla JigsawPlacement.addPieces) */
  pieces(rx: number, rz: number): Piece[] | null {
    const s = this.stub(rx, rz);
    if (!s) return null;
    const key = rx * 65536 + rz;
    let p = this.built.get(key);
    if (p) return p;
    if (this.built.size > 48) this.built.clear();
    const r = largeFeatureRandom(this.seed, s.cx, s.cz);
    const height = (x: number, z: number) => this.terrain.firstFreeHeight(x, z);
    const start = jigsawStart(POOLS.get(`village/${s.kind}/town_centers`)!, r, s.cx, s.cz, height)!;
    p = jigsawAssemble(start, r, SIZE, MAX_DISTANCE, true, height);
    this.built.set(key, p);
    return p;
  }

  /** the villages whose pieces may reach a chunk (a start refers to chunks within 8 of it, as vanilla's references) */
  private near(cx: number, cz: number): Piece[][] {
    const out: Piece[][] = [];
    for (let rx = floorDiv(cx - 8, SPACING); rx <= floorDiv(cx + 8, SPACING); rx++)
      for (let rz = floorDiv(cz - 8, SPACING); rz <= floorDiv(cz + 8, SPACING); rz++) {
        const s = this.stub(rx, rz);
        if (!s || Math.abs(s.cx - cx) > 8 || Math.abs(s.cz - cz) > 8) continue;
        const p = this.pieces(rx, rz);
        if (p) out.push(p);
      }
    return out;
  }

  /** what the villages around do to a chunk's terrain before it's filled (null when nothing) */
  beardFor(cx: number, cz: number): Beardifier | null {
    const b = new Beardifier();
    for (const pieces of this.near(cx, cz)) b.add(pieces, cx, cz);
    return b.empty ? null : b;
  }

  /** vanilla StructureStart.placeInChunk for every village reaching this chunk */
  place(ctx: GenContext): void {
    const chunk = new Box(ctx.x0, MIN_Y, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    let first = true;
    for (const pieces of this.near(ctx.cx, ctx.cz)) {
      for (const p of pieces) {
        if (!p.box.intersects(chunk)) continue;
        if (first) {
          ctx.computeHeightmaps();
          first = false;
        }
        p.element.place({ ctx, chunk, salt: this.salt }, p);
      }
    }
  }

  /**
   * vanilla ChunkGenerator.getNearestGeneratedStructure for /locate: rings of regions outwards from the one the
   * position is in, and the first start of the kind met going round a ring (not always the closest one of it);
   * the start chunk's corner is what's reported (StructurePlacement.getLocatePos)
   */
  nearest(kind: VillageKind, x: number, z: number, radius = 100): [number, number] | null {
    const rx0 = floorDiv(x >> 4, SPACING), rz0 = floorDiv(z >> 4, SPACING);
    for (let ring = 0; ring <= radius; ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (i !== -ring && i !== ring && j !== -ring && j !== ring) continue;
          const s = this.stub(rx0 + i, rz0 + j);
          if (s && s.kind === kind) return [s.cx * 16, s.cz * 16];
        }
    return null;
  }
}

/** villages for /locate on the main thread: only the biome noise is needed to know where they are */
export function villageLocator(seed: string): Villages {
  const router = new OverworldRouter(SeedSource.fromWorldSeed(seed));
  const quartBiome = (x: number, z: number) => {
    const c = router.column(x & ~3, z & ~3, newColumn());
    return pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
  };
  return new Villages(worldSeed64(seed), { firstFreeHeight: () => 64, quartBiome });
}
