// Ruined portals (vanilla structure set ruined_portals: RuinedPortalStructure and RuinedPortalPiece). At most one in
// each 40 x 40-chunk region (random spread, spacing 40, separation 15), of one of seven kinds: the start chunk's
// large-feature random draws a kind and strikes it off until one fits the biome at the spot it picks (standard,
// desert, jungle, swamp, mountain and ocean in the Overworld, nether in the Nether). Each lays one of thirteen ruins
// (world/gen/ruinedPortalTemplates) turned and mirrored about its middle, at a height its setup picks: on the ground
// or the sea bed, half buried in sand, in a pocket underground or inside a mountain, anywhere in the Nether. Vanilla's
// processors age it as it goes in (gold taken, lava cooled to magma or netherrack, crying obsidian, cracked and
// mossy bricks, blackstone in the Nether), then netherrack and magma spread round it, drip below it, and vines and
// jungle leaves grow on it where the kind has them.
// Vanilla builds the whole portal from the chunk its middle is in, looking into the chunks round it; here each chunk
// builds its own part, so the template and its processors come out as vanilla's (their randoms go by position), and
// the netherrack, the drips, the vines and the leaves are drawn column by column rather than in vanilla's order.

import { Rand, hash2, hash3 } from '../../core/rng';
import { B, BIOMES, pickCaveBiome, pickSurfaceBiome } from './biomes';
import { S, blockOf, getBlock, FLAGS, COLLISION, F_AIR, F_COLLIDE, F_FULL_COLLISION, F_WATERLOGGED, faceMaskFromBoxes } from '../block';
import { MIN_Y, MAX_Y, colIndex } from '../constants';
import { W_AIR, type GenContext } from './context';
import { BoundingBox } from './structure';
import { largeFeatureRandom, saltedRandom, rotateState } from './jigsaw';
import { mirrorState, NO_MIRROR, FRONT_BACK, type Mirror, type Rot } from './mansion';
import { LegacyRandom } from './legacyRandom';
import { positionSeed } from './templePiece';
import { coldEnoughToSnow } from './temperature';
import { newColumn, type OverworldRouter } from './router';
import { SUB_SOLID, SUB_FLUID } from './geode';
import { PORTALS, GIANT_PORTALS, portalTemplate } from './ruinedPortalTemplates';
import type { MansionTemplate } from './mansionBuilder';
import type { NetherGenerator } from './nether';

const SPACING = 40, SEPARATION = 15, SALT = 34222645;
/** how many chunks from its start chunk a portal reaches: its box, turned about its middle, and the netherrack round it */
const REACH = 2;

export type PortalKind = 'standard' | 'desert' | 'jungle' | 'swamp' | 'mountain' | 'ocean' | 'nether';

/** vanilla RuinedPortalPiece.VerticalPlacement */
export type VerticalPlacement = 'on_land_surface' | 'partly_buried' | 'on_ocean_floor' | 'in_mountain' | 'underground' | 'in_nether';

/** vanilla RuinedPortalStructure.Setup */
export interface Setup {
  placement: VerticalPlacement;
  airPocket: number;
  mossiness: number;
  overgrown: boolean;
  vines: boolean;
  canBeCold: boolean;
  blackstone: boolean;
  weight: number;
}

const setup = (placement: VerticalPlacement, airPocket: number, mossiness: number, overgrown: boolean, vines: boolean, canBeCold: boolean, blackstone: boolean, weight = 1): Setup => ({
  placement, airPocket, mossiness, overgrown, vines, canBeCold, blackstone, weight,
});

interface Kind {
  kind: PortalKind;
  /** vanilla #has_structure/ruined_portal_<kind> */
  biomes: Set<number>;
  setups: Setup[];
}

// vanilla's biome tags as the kinds use them
const IS_BEACH = [B.beach, B.snowy_beach], IS_RIVER = [B.river, B.frozen_river];
const IS_TAIGA = [B.taiga, B.snowy_taiga, B.old_growth_pine_taiga, B.old_growth_spruce_taiga];
const IS_FOREST = [B.forest, B.flower_forest, B.birch_forest, B.old_growth_birch_forest, B.dark_forest, B.grove];
const IS_JUNGLE = [B.jungle, B.sparse_jungle, B.bamboo_jungle];
const IS_BADLANDS = [B.badlands, B.eroded_badlands, B.wooded_badlands];
const IS_HILL = [B.windswept_hills, B.windswept_forest, B.windswept_gravelly_hills];
const IS_MOUNTAIN = [B.meadow, B.frozen_peaks, B.jagged_peaks, B.stony_peaks, B.snowy_slopes, B.cherry_grove];
const IS_OCEAN = [B.deep_frozen_ocean, B.deep_cold_ocean, B.deep_ocean, B.deep_lukewarm_ocean, B.frozen_ocean, B.ocean, B.cold_ocean, B.lukewarm_ocean, B.warm_ocean];
const IS_NETHER = [B.nether_wastes, B.soul_sand_valley, B.crimson_forest, B.warped_forest, B.basalt_deltas];

/** vanilla structure set ruined_portals, in its order (each weight 1), with each structure's setups */
const KINDS: Kind[] = [
  {
    kind: 'standard',
    biomes: new Set([...IS_BEACH, ...IS_RIVER, ...IS_TAIGA, ...IS_FOREST, B.mushroom_fields, B.ice_spikes, B.dripstone_caves, B.lush_caves, B.savanna, B.snowy_plains, B.plains, B.sunflower_plains]),
    setups: [setup('underground', 1, 0.2, false, false, true, false, 0.5), setup('on_land_surface', 0.5, 0.2, false, false, true, false, 0.5)],
  },
  { kind: 'desert', biomes: new Set([B.desert]), setups: [setup('partly_buried', 0, 0, false, false, false, false)] },
  { kind: 'jungle', biomes: new Set(IS_JUNGLE), setups: [setup('on_land_surface', 0.5, 0.8, true, true, false, false)] },
  { kind: 'swamp', biomes: new Set([B.swamp, B.mangrove_swamp]), setups: [setup('on_ocean_floor', 0, 0.5, false, true, false, false)] },
  {
    kind: 'mountain',
    biomes: new Set([...IS_BADLANDS, ...IS_HILL, B.savanna_plateau, B.windswept_savanna, B.stony_shore, ...IS_MOUNTAIN]),
    setups: [setup('in_mountain', 1, 0.2, false, false, true, false, 0.5), setup('on_land_surface', 0.5, 0.2, false, false, true, false, 0.5)],
  },
  { kind: 'ocean', biomes: new Set(IS_OCEAN), setups: [setup('on_ocean_floor', 0, 0.8, false, false, true, false)] },
  { kind: 'nether', biomes: new Set(IS_NETHER), setups: [setup('in_nether', 0.5, 0, false, false, false, true)] },
];
const CAVE_BIOMES = new Set([B.dripstone_caves, B.lush_caves, B.deep_dark]);

/** the structure id /locate knows each kind by */
export const PORTAL_IDS: Record<string, PortalKind> = {
  'minecraft:ruined_portal': 'standard', 'minecraft:ruined_portal_desert': 'desert', 'minecraft:ruined_portal_jungle': 'jungle',
  'minecraft:ruined_portal_swamp': 'swamp', 'minecraft:ruined_portal_mountain': 'mountain', 'minecraft:ruined_portal_ocean': 'ocean',
  'minecraft:ruined_portal_nether': 'nether',
};

/** the terrain a portal's spot is worked out on (the bare noise terrain, before surface rules and carvers) */
export interface PortalTerrain {
  readonly dimension: 'overworld' | 'the_nether';
  /** the dimension's lowest y */
  readonly minY: number;
  /** vanilla getBaseHeight: the first block above the terrain (WORLD_SURFACE_WG; with `floor`, OCEAN_FLOOR_WG) */
  baseHeight(x: number, z: number, floor: boolean): number;
  /** a column of the terrain (vanilla getBaseColumn): whether its block at a height counts for that heightmap */
  column(x: number, z: number, floor: boolean): (y: number) => boolean;
  /** the biome at a block's quart, underground ones included (vanilla getNoiseBiome) */
  biome(x: number, y: number, z: number): number;
  /** the surface biome at a quart (what the biome is anywhere a cave biome isn't) */
  surfaceBiome(x: number, z: number): number;
}

/** the Overworld's terrain for ruined portals */
export function overworldPortalTerrain(g: {
  router: OverworldRouter;
  firstFreeHeight(x: number, z: number, oceanFloor?: boolean): number;
  substanceAt(x: number, y: number, z: number): number;
  quartBiome(x: number, z: number): number;
}): PortalTerrain {
  return {
    dimension: 'overworld',
    minY: MIN_Y,
    baseHeight: (x, z, floor) => g.firstFreeHeight(x, z, floor),
    column: (x, z, floor) => {
      const top = g.firstFreeHeight(x, z, floor);
      return (y) => {
        if (y >= top) return false;
        const s = g.substanceAt(x, y, z);
        return s === SUB_SOLID || (!floor && s === SUB_FLUID);
      };
    },
    biome: (x, y, z) => {
      const c = g.router.column(x & ~3, z & ~3, newColumn());
      const cave = pickCaveBiome(c.humidity, c.continents, c.erosion, g.router.depth(y & ~3, c));
      return cave >= 0 ? cave : pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
    },
    surfaceBiome: (x, z) => g.quartBiome(x, z),
  };
}

/** the Nether's terrain for ruined portals: netherrack from the noise, lava below y 32 */
export function netherPortalTerrain(g: NetherGenerator): PortalTerrain {
  return {
    dimension: 'the_nether',
    minY: 0,
    baseHeight: () => 128,
    column: (x, z) => (y) => y >= 0 && y < 128 && (y < 32 || g.solidAt(x, y, z)),
    biome: (x, _y, z) => g.biomeAtQuart(x >> 2, z >> 2),
    surfaceBiome: (x, z) => g.biomeAtQuart(x >> 2, z >> 2),
  };
}

export interface PortalStub {
  kind: PortalKind;
  /** the start chunk (vanilla locate reports its corner) */
  cx: number;
  cz: number;
  template: string;
  rot: Rot;
  mirror: Mirror;
  /** where the template's corner goes (the start chunk's corner, at the height found) */
  x: number;
  y: number;
  z: number;
  setup: Setup;
  airPocket: boolean;
  /** vanilla RuinedPortalPiece.Properties.cold: lava turns to netherrack, and no magma */
  cold: boolean;
  box: BoundingBox;
}

const f32 = Math.fround;
const floorDiv = (a: number, b: number) => Math.floor(a / b);
/** vanilla Mth.randomBetweenInclusive */
const between = (r: { nextInt(n: number): number }, lo: number, hi: number) => r.nextInt(hi - lo + 1) + lo;

/** vanilla StructureTemplate.transform with a pivot: mirrored about the template's corner, then turned about the pivot */
export function transformAbout(x: number, z: number, mirror: Mirror, rot: Rot, px: number, pz: number): [number, number] {
  if (mirror === FRONT_BACK) x = -x;
  else if (mirror !== NO_MIRROR) z = -z;
  switch (rot) {
    case 1: return [px + pz - z, pz - px + x];
    case 2: return [px + px - x, pz + pz - z];
    case 3: return [px - pz + z, px + pz - x];
    default: return [x, z];
  }
}

/** vanilla StructureTemplate.getBoundingBox for a template placed at (x, y, z) */
function templateBox(t: MansionTemplate, x: number, y: number, z: number, rot: Rot, mirror: Mirror, px: number, pz: number): BoundingBox {
  const [ax, az] = transformAbout(0, 0, mirror, rot, px, pz), [bx, bz] = transformAbout(t.sx - 1, t.sz - 1, mirror, rot, px, pz);
  return new BoundingBox(x + Math.min(ax, bx), y, z + Math.min(az, bz), x + Math.max(ax, bx), y + t.sy - 1, z + Math.max(az, bz));
}

/** vanilla BoundingBox.getCenter (x and z) */
function centre(b: BoundingBox): [number, number] {
  return [b.minX + ((b.maxX - b.minX + 1) >> 1), b.minZ + ((b.maxZ - b.minZ + 1) >> 1)];
}

export class RuinedPortals {
  private readonly stubs = new Map<number, PortalStub | null>();
  private readonly seedHash: number;

  constructor(readonly seed: bigint, private readonly terrain: PortalTerrain) {
    this.seedHash = Number(BigInt.asIntN(32, seed ^ (seed >> 32n))) ^ 0x2e7ba1;
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (linear spread) */
  potentialChunk(rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, SALT);
    const i = r.nextInt(SPACING - SEPARATION), j = r.nextInt(SPACING - SEPARATION);
    return [rx * SPACING + i, rz * SPACING + j];
  }

  private key(rx: number, rz: number): number {
    return (rx + 65536) * 131072 + (rz + 65536);
  }

  /**
   * a region's portal, if it has one (vanilla ChunkGenerator.createStructures for a set of several): the kinds drawn
   * by weight from the start chunk's large-feature random, each struck off when it can't generate there, until one can
   */
  stub(rx: number, rz: number): PortalStub | null {
    const key = this.key(rx, rz);
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(rx, rz);
    const pick = largeFeatureRandom(this.seed, cx, cz);
    const left = KINDS.slice();
    let s: PortalStub | null = null;
    while (left.length && !s) {
      const k = pick.nextInt(left.length);
      s = this.generationPoint(left[k], cx, cz);
      left.splice(k, 1);
    }
    if (this.stubs.size > 4096) this.stubs.clear();
    this.stubs.set(key, s);
    return s;
  }

  /**
   * vanilla RuinedPortalStructure.findGenerationPoint, then isValidBiome at the spot: its own large-feature random
   * picks the setup, whether there's an air pocket, the template, the turn and the mirror, then the height
   */
  private generationPoint(k: Kind, cx: number, cz: number): PortalStub | null {
    const x0 = cx * 16, z0 = cz * 16, t = this.terrain;
    // (the biome at the spot can't be one of the kind's in the other dimension, nor without a cave biome of its own
    // anywhere the surface biome isn't: the spot needn't be worked out)
    if ((k.kind === 'nether') !== (t.dimension === 'the_nether')) return null;
    if (![...k.biomes].some((b) => CAVE_BIOMES.has(b)) && !k.biomes.has(t.surfaceBiome(x0, z0))) return null;
    const r = largeFeatureRandom(this.seed, cx, cz);
    let s = k.setups[0];
    if (k.setups.length > 1) {
      let total = 0;
      for (const u of k.setups) total = f32(total + u.weight);
      let g = r.nextFloat();
      for (const u of k.setups) {
        g = f32(g - f32(u.weight / total));
        if (g < 0) {
          s = u;
          break;
        }
      }
    }
    const airPocket = s.airPocket === 0 ? false : s.airPocket === 1 ? true : r.nextFloat() < f32(s.airPocket);
    const name = r.nextFloat() < f32(0.05) ? GIANT_PORTALS[r.nextInt(GIANT_PORTALS.length)] : PORTALS[r.nextInt(PORTALS.length)];
    const tpl = portalTemplate(name);
    const rot = r.nextInt(4) as Rot;
    const mirror: Mirror = r.nextFloat() < 0.5 ? NO_MIRROR : FRONT_BACK;
    const box = templateBox(tpl, x0, 0, z0, rot, mirror, tpl.sx >> 1, tpl.sz >> 1);
    const [mx, mz] = centre(box);
    const floor = s.placement === 'on_ocean_floor';
    const h = s.placement === 'in_nether' ? 0 : t.baseHeight(mx, mz, floor) - 1;
    const y = this.suitableY(r, s.placement, airPocket, h, tpl.sy, box);
    const biome = t.biome(x0, y, z0);
    if (!k.biomes.has(biome)) return null;
    const b = BIOMES[biome];
    const cold = s.canBeCold && coldEnoughToSnow(b.temperature, !!b.frozen, x0, y, z0);
    box.move(0, y, 0);
    return { kind: k.kind, cx, cz, template: name, rot, mirror, x: x0, y, z: z0, setup: s, airPocket, cold, box };
  }

  /**
   * vanilla RuinedPortalStructure.findSuitableY: a height the placement picks, then down (no lower than 15 above the
   * bottom of the world) until three of the box's four corner columns are solid there
   */
  private suitableY(r: { nextInt(n: number): number; nextFloat(): number }, p: VerticalPlacement, airPocket: boolean, h: number, ySpan: number, box: BoundingBox): number {
    const lo = this.terrain.minY + 15;
    const within = (a: number, b: number) => (a < b ? between(r, a, b) : b);
    let j: number;
    if (p === 'in_nether') j = airPocket ? between(r, 32, 100) : r.nextFloat() < 0.5 ? between(r, 27, 29) : between(r, 29, 100);
    else if (p === 'in_mountain') j = within(70, h - ySpan);
    else if (p === 'underground') j = within(lo, h - ySpan);
    else if (p === 'partly_buried') j = h - ySpan + between(r, 2, 8);
    else j = h;
    const floor = p === 'on_ocean_floor';
    const cols = [
      this.terrain.column(box.minX, box.minZ, floor), this.terrain.column(box.maxX, box.minZ, floor),
      this.terrain.column(box.minX, box.maxZ, floor), this.terrain.column(box.maxX, box.maxZ, floor),
    ];
    let y = j;
    for (; y > lo; y--) {
      let n = 0;
      for (const c of cols) if (c(y) && ++n === 3) return y;
    }
    return y;
  }

  /** the portals that reach the chunk */
  startsNear(cx: number, cz: number): PortalStub[] {
    const out: PortalStub[] = [];
    for (let rx = floorDiv(cx - REACH, SPACING); rx <= floorDiv(cx + REACH, SPACING); rx++)
      for (let rz = floorDiv(cz - REACH, SPACING); rz <= floorDiv(cz + REACH, SPACING); rz++) {
        const [pcx, pcz] = this.potentialChunk(rx, rz);
        if (Math.abs(pcx - cx) > REACH || Math.abs(pcz - cz) > REACH) continue;
        const s = this.stub(rx, rz);
        // (the netherrack spreads 15 blocks from its middle, the vines one block out of its box)
        if (s && s.box.maxX + 16 >= cx * 16 && s.box.minX - 16 <= cx * 16 + 15 && s.box.maxZ + 16 >= cz * 16 && s.box.minZ - 16 <= cz * 16 + 15) out.push(s);
      }
    return out;
  }

  /** vanilla StructureStart.placeInChunk for the portals reaching this chunk: this chunk's part of each */
  place(ctx: GenContext): void {
    for (const s of this.startsNear(ctx.cx, ctx.cz)) placeInChunk(ctx, s, this.seedHash);
  }

  /**
   * vanilla ChunkGenerator.getNearestGeneratedStructure for /locate: rings of regions outwards from the one the
   * position is in, and the first portal of the kind met going round a ring; its start chunk's corner
   */
  nearest(kind: PortalKind, x: number, z: number, radius = 100): [number, number] | null {
    const k = KINDS.find((e) => e.kind === kind)!;
    if ((kind === 'nether') !== (this.terrain.dimension === 'the_nether')) return null;
    const caves = [...k.biomes].some((b) => CAVE_BIOMES.has(b));
    const rx0 = floorDiv(x >> 4, SPACING), rz0 = floorDiv(z >> 4, SPACING);
    for (let ring = 0; ring <= radius; ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (i !== -ring && i !== ring && j !== -ring && j !== ring) continue;
          // (a region whose start chunk isn't in one of the kind's biomes can't have one of the kind)
          if (!caves) {
            const [cx, cz] = this.potentialChunk(rx0 + i, rz0 + j);
            if (!k.biomes.has(this.terrain.surfaceBiome(cx * 16, cz * 16))) continue;
          }
          const s = this.stub(rx0 + i, rz0 + j);
          if (s?.kind === kind) return [s.cx * 16, s.cz * 16];
        }
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Placing one (vanilla RuinedPortalPiece.postProcess)

interface Ids {
  air: number; netherrack: number; magma: number; lava: number; obsidian: number; crying: number; cracked: number; mossy: number;
  mossySlab: number; mossyWall: number; leaves: number;
}
let IDS: Ids | null = null;
const ids = (): Ids =>
  (IDS ??= {
    air: 0, netherrack: S('netherrack'), magma: S('magma_block'), lava: S('lava'), obsidian: S('obsidian'), crying: S('crying_obsidian'),
    cracked: S('cracked_stone_bricks'), mossy: S('mossy_stone_bricks'), mossySlab: S('mossy_stone_brick_slab'), mossyWall: S('mossy_stone_brick_wall'),
    leaves: S('jungle_leaves', { persistent: true }),
  });

/** vanilla #features_cannot_replace (those the game has) */
const PROTECTED = new Set(['bedrock', 'spawner', 'chest', 'end_portal_frame', 'reinforced_deepslate', 'trial_spawner', 'vault']);
/** blocks whose connections are fixed up once the chunks round them are there (vanilla updateFromNeighbourShapes) */
const SHAPED = /(_fence|_pane|_wall|_stairs|^iron_bars|^chest)$/;
/** vanilla BlackstoneReplaceProcessor */
const BLACKSTONE: Record<string, string> = {
  cobblestone: 'blackstone', mossy_cobblestone: 'blackstone', stone: 'polished_blackstone', stone_bricks: 'polished_blackstone_bricks',
  mossy_stone_bricks: 'polished_blackstone_bricks', cobblestone_stairs: 'blackstone_stairs', mossy_cobblestone_stairs: 'blackstone_stairs',
  stone_stairs: 'polished_blackstone_stairs', stone_brick_stairs: 'polished_blackstone_brick_stairs', mossy_stone_brick_stairs: 'polished_blackstone_brick_stairs',
  cobblestone_slab: 'blackstone_slab', mossy_cobblestone_slab: 'blackstone_slab', smooth_stone_slab: 'polished_blackstone_slab', stone_slab: 'polished_blackstone_slab',
  stone_brick_slab: 'polished_blackstone_brick_slab', mossy_stone_brick_slab: 'polished_blackstone_brick_slab', stone_brick_wall: 'polished_blackstone_brick_wall',
  mossy_stone_brick_wall: 'polished_blackstone_brick_wall', cobblestone_wall: 'blackstone_wall', mossy_cobblestone_wall: 'blackstone_wall',
  chiseled_stone_bricks: 'chiseled_polished_blackstone', cracked_stone_bricks: 'cracked_polished_blackstone_bricks', iron_bars: 'chain',
};
/** vanilla Direction.Plane.HORIZONTAL and Half, in the order random picks draw from */
const HORIZONTAL = ['north', 'east', 'south', 'west'] as const;
const HALVES = ['top', 'bottom'] as const;
const STEP: Record<(typeof HORIZONTAL)[number], [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const OPPOSITE = { north: 'south', east: 'west', south: 'north', west: 'east' } as const;
/** the collision-face bit of each side (world/block faceMaskFromBoxes) */
const FACE_BIT = { north: 2, south: 3, west: 4, east: 5 } as const;
/** vanilla spreadNetherrack's chance at each distance from the middle */
const SPREAD = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.9, 0.8, 0.7, 0.6, 0.4, 0.2].map(f32);

const faces = new Map<number, number>();
/** vanilla Block.isFaceFull(collision shape, side) */
function fullFace(st: number, side: keyof typeof FACE_BIT): boolean {
  let m = faces.get(st);
  if (m === undefined) {
    m = faceMaskFromBoxes(COLLISION[st] ?? []);
    faces.set(st, m);
  }
  return ((m >> FACE_BIT[side]) & 1) === 1;
}

/** a vine hanging on one side only (the game's vine is on its south side by default) */
const vine = (side: string) => S('vine', { up: false, north: side === 'north', east: side === 'east', south: side === 'south', west: side === 'west' });
const nameOf = (st: number) => blockOf(st).name;
const isAir = (st: number) => st >= 0 && (FLAGS[st] & F_AIR) !== 0;

/** vanilla getRandomFacingStairs */
function randomStairs(r: LegacyRandom, name: string): number {
  const facing = HORIZONTAL[r.nextInt(4)];
  return S(name, { facing, half: HALVES[r.nextInt(2)] });
}

/**
 * The template block's processors (vanilla makeSettings): RuleProcessor (gold taken, lava cooled, netherrack to magma)
 * and BlockAgeProcessor, each drawing from a random seeded by the block's position (vanilla Mth.getSeed)
 */
function processed(st: number, x: number, y: number, z: number, s: PortalStub): number {
  const I = ids();
  const rand = () => new LegacyRandom(positionSeed(x, y, z));
  let n = nameOf(st);
  // RuleProcessor
  if (n === 'gold_block') {
    if (rand().nextFloat() < f32(0.3)) return I.air;
  } else if (n === 'lava') {
    if (s.setup.placement === 'on_ocean_floor') return I.magma;
    if (s.cold) return I.netherrack;
    return rand().nextFloat() < f32(0.2) ? I.magma : st;
  } else if (n === 'netherrack') {
    return !s.cold && rand().nextFloat() < f32(0.07) ? I.magma : st;
  }
  // BlockAgeProcessor
  const mossiness = f32(s.setup.mossiness);
  n = nameOf(st);
  if (n === 'stone_bricks' || n === 'stone' || n === 'chiseled_stone_bricks') {
    const r = rand();
    if (r.nextFloat() >= 0.5) return st;
    const plain = [I.cracked, randomStairs(r, 'stone_brick_stairs')], mossy = [I.mossy, randomStairs(r, 'mossy_stone_brick_stairs')];
    return (r.nextFloat() < mossiness ? mossy : plain)[r.nextInt(2)];
  }
  if (n.endsWith('_stairs')) {
    const r = rand();
    if (r.nextFloat() >= 0.5) return st;
    const b = blockOf(st);
    const options = [S('mossy_stone_brick_stairs', { facing: b.get<string>(st, 'facing'), half: b.get<string>(st, 'half') }), I.mossySlab];
    return options[r.nextInt(2)];
  }
  if (n.endsWith('_slab')) return rand().nextFloat() < mossiness ? I.mossySlab : st;
  if (n.endsWith('_wall')) return rand().nextFloat() < mossiness ? I.mossyWall : st;
  if (n === 'obsidian') return rand().nextFloat() < f32(0.15) ? I.crying : st;
  return st;
}

/** vanilla BlackstoneReplaceProcessor: the Nether's portals in blackstone (a stair keeps its facing and half, a slab its type) */
function blackstone(st: number): number {
  const b = blockOf(st);
  const to = BLACKSTONE[b.name];
  if (!to) return st;
  const nb = getBlock(to);
  let out = nb.defaultState;
  for (const p of ['facing', 'half', 'type']) if (b.propIndex(p) >= 0 && nb.propIndex(p) >= 0) out = nb.with(out, p, b.get(st, p));
  return out;
}

/** a still water block, or one holding some: what a waterloggable block put there takes in (vanilla placeLiquid) */
function waterSource(st: number): boolean {
  if (st <= 0) return false;
  if (FLAGS[st] & F_WATERLOGGED) return true;
  const b = blockOf(st);
  return b.name === 'water' && (b.propIndex('level') < 0 || b.get(st, 'level') === 0);
}

/** the top block of each of the chunk's columns for the setup's heightmap (vanilla WORLD_SURFACE_WG, OCEAN_FLOOR_WG) */
function groundHeights(ctx: GenContext, floor: boolean): Int16Array {
  const out = new Int16Array(256);
  for (let lz = 0; lz < 16; lz++)
    for (let lx = 0; lx < 16; lx++) {
      const ci = (lz << 4) | lx;
      let y = Math.min(MAX_Y - 1, ctx.surface[ci] - 1);
      for (; y >= MIN_Y; y--) {
        const st = ctx.blocks[colIndex(lx, y, lz)];
        if (floor ? (FLAGS[st] & F_COLLIDE) !== 0 : st !== 0 && !(FLAGS[st] & F_AIR)) break;
      }
      out[ci] = y;
    }
  return out;
}

/** this chunk's part of a portal: the template, then the netherrack round it and below it, then vines and leaves */
function placeInChunk(ctx: GenContext, s: PortalStub, seedHash: number): void {
  const I = ids();
  const box = s.box, x0 = ctx.x0, z0 = ctx.z0, x1 = x0 + 15, z1 = z0 + 15;
  const floor = s.setup.placement === 'on_ocean_floor';
  // (vanilla's WG heightmaps don't move for the blocks placed in the features step: the ground as it was)
  const ground = groundHeights(ctx, floor);
  const salt = hash2(s.cx, s.cz, seedHash);

  // ---- the template (vanilla StructureTemplate.placeInWorld with the piece's processors)
  const t = portalTemplate(s.template);
  const px = t.sx >> 1, pz = t.sz >> 1;
  const b = t.blocks;
  for (let i = 0; i < b.length; i += 4) {
    const [dx, dz] = transformAbout(b[i], b[i + 2], s.mirror, s.rot, px, pz);
    const x = s.x + dx, y = s.y + b[i + 1], z = s.z + dz;
    if (x < x0 || x > x1 || z < z0 || z > z1 || y < MIN_Y || y >= MAX_Y) continue;
    let st = b[i + 3];
    // BlockIgnoreProcessor: air only where there's an air pocket
    if (st === 0 && !s.airPocket) continue;
    st = processed(st, x, y, z, s);
    const cur = ctx.get(x, y, z);
    // ProtectedBlockProcessor, then LavaSubmergedBlockProcessor: lava stays where the block isn't a full one
    if (cur > 0 && PROTECTED.has(nameOf(cur))) continue;
    if (cur > 0 && nameOf(cur) === 'lava' && !(FLAGS[st] & F_FULL_COLLISION)) st = I.lava;
    if (s.setup.blackstone) st = blackstone(st);
    st = rotateState(mirrorState(st, s.mirror), s.rot);
    const blk = blockOf(st);
    if (st > 0 && blk.propIndex('waterlogged') >= 0 && waterSource(cur)) st = blk.with(st, 'waterlogged', true);
    ctx.set(x, y, z, st);
    if (st === 0) continue;
    if (blk.name === 'lava') ctx.scheduleFluid(x, y, z);
    else if (SHAPED.test(blk.name)) ctx.markForPostprocessing(x, y, z);
    if (blk.name === 'chest') ctx.blockEntities.push({ id: 'chest', x, y, z, items: [], data: { lootTable: 'chests/ruined_portal', lootSeed: hash3(x, y, z, salt) >>> 0 } });
  }

  const netherrackOrMagma = (r: Rand, x: number, y: number, z: number) => ctx.set(x, y, z, !s.cold && r.nextFloat() < f32(0.07) ? I.magma : I.netherrack);
  const drip = (r: Rand, x: number, y: number, z: number) => {
    netherrackOrMagma(r, x, y, z);
    for (let n = 8; n > 0 && r.nextFloat() < 0.5; n--) netherrackOrMagma(r, x, --y, z);
  };
  const leavesAbove = (r: Rand, x: number, y: number, z: number) => {
    if (r.nextFloat() < 0.5 && ctx.get(x, y, z) === I.netherrack && isAir(ctx.get(x, y + 1, z))) ctx.set(x, y + 1, z, I.leaves);
  };

  // ---- vanilla spreadNetherrack: the ground round the middle, surely near it and less likely further out
  const [mx, mz] = centre(box);
  const onGround = s.setup.placement === 'on_land_surface' || floor;
  const span = (box.maxX - box.minX + 1 + box.maxZ - box.minZ + 1) >> 1;
  const m = new Rand(salt, 0x5e).nextInt(Math.max(1, 8 - (span >> 1)));
  for (let z = Math.max(z0, mz - SPREAD.length); z <= Math.min(z1, mz + SPREAD.length); z++)
    for (let x = Math.max(x0, mx - SPREAD.length); x <= Math.min(x1, mx + SPREAD.length); x++) {
      const d = Math.max(0, Math.abs(x - mx) + Math.abs(z - mz) + m);
      if (d >= SPREAD.length) continue;
      const r = new Rand(hash2(x, z, salt ^ 0x5b7ead), 0x6e);
      if (!(r.nextDouble() < SPREAD[d])) continue;
      const top = ground[((z - z0) << 4) | (x - x0)];
      const y = onGround ? top : Math.min(box.minY, top);
      if (Math.abs(y - box.minY) > 3) continue;
      // vanilla canBlockBeReplacedByNetherrackOrMagma
      const cur = ctx.get(x, y, z);
      if (isAir(cur) || cur === I.obsidian || PROTECTED.has(nameOf(cur)) || (s.setup.placement !== 'in_nether' && nameOf(cur) === 'lava')) continue;
      netherrackOrMagma(r, x, y, z);
      if (s.setup.overgrown) leavesAbove(r, x, y, z);
      drip(r, x, y - 1, z);
    }

  // ---- vanilla addNetherrackDripColumnsBelowPortal: under the netherrack along the bottom of the box
  for (let z = Math.max(z0, box.minZ + 1); z <= Math.min(z1, box.maxZ - 1); z++)
    for (let x = Math.max(x0, box.minX + 1); x <= Math.min(x1, box.maxX - 1); x++)
      if (ctx.get(x, box.minY, z) === I.netherrack) drip(new Rand(hash2(x, z, salt ^ 0xd21b), 0x6e), x, box.minY - 1, z);

  // ---- vines on the sides of whatever's in the box, and jungle leaves on its netherrack
  if (!s.setup.vines && !s.setup.overgrown) return;
  for (let z = Math.max(z0, box.minZ); z <= Math.min(z1, box.maxZ); z++)
    for (let y = box.minY; y <= box.maxY; y++)
      for (let x = Math.max(x0, box.minX); x <= Math.min(x1, box.maxX); x++) {
        const r = new Rand(hash3(x, y, z, salt ^ 0x71e5), 0x6e);
        const st = ctx.get(x, y, z);
        if (s.setup.vines && !isAir(st) && nameOf(st) !== 'vine') {
          // vanilla maybeAddVines: out of a full side, into air, hanging on that side
          const side = HORIZONTAL[r.nextInt(4)];
          const [sx, sz] = STEP[side];
          const tx = x + sx, tz = z + sz;
          const there = ctx.get(tx, y, tz);
          if ((there < 0 || isAir(there)) && fullFace(st, side)) ctx.set(tx, y, tz, vine(OPPOSITE[side]), W_AIR);
        }
        if (s.setup.overgrown) leavesAbove(r, x, y, z);
      }
}
