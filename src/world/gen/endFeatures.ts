// The features of the End's central biome (vanilla the_end, SURFACE_STRUCTURES):
//
// vanilla SpikeFeature: the ten obsidian pillars in a ring round the End's
// main island, their heights and widths shuffled by the world seed (exactly as
// vanilla shuffles them), the two shortest-but-one caged in iron bars, each
// topped with bedrock and a fire burning on it, an end crystal standing in the
// fire. They go all the way down to the bottom of the world, and clear
// whatever end stone is above y 65 round them.
//
// vanilla EndPlatformFeature: the 5x5 obsidian landing under the End's spawn
// point, with three blocks of air above it. It's made when the End generates,
// and again (dropping whatever is in the way) each time something comes
// through an end portal (game/endPortal.ts).

import { LegacyRandom } from './legacyRandom';
import type { GenContext } from './context';
import { S } from '../block';
import type { Rand } from '../../core/rng';
import type { SavedEntity } from '../../entity/mob';

/** vanilla ServerLevel.END_SPAWN_POINT: where anything coming into the End through a portal arrives */
export const END_SPAWN_POINT = { x: 100, y: 50, z: 0 } as const;

/** the blocks of vanilla EndPlatformFeature.createEndPlatform round `pos`: obsidian a block below it, air in it and the two above */
export function endPlatformBlocks(x: number, y: number, z: number, fn: (x: number, y: number, z: number, obsidian: boolean) => void): void {
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      for (let k = -1; k < 3; k++) fn(x + j, y + k, z + i, k === -1);
}

/** vanilla EndPlacements.END_PLATFORM: EndPlatformFeature at FixedPlacement(END_SPAWN_POINT.below()), in its chunk only */
export function placeEndPlatform(ctx: GenContext): void {
  const x = END_SPAWN_POINT.x, y = END_SPAWN_POINT.y - 1, z = END_SPAWN_POINT.z;
  if (x >> 4 !== ctx.cx || z >> 4 !== ctx.cz) return;
  const OBSIDIAN = S('obsidian');
  endPlatformBlocks(x, y, z, (bx, by, bz, obsidian) => ctx.set(bx, by, bz, obsidian ? OBSIDIAN : 0));
}

/** vanilla SpikeFeature.EndSpike */
export interface EndSpike {
  centerX: number;
  centerZ: number;
  radius: number;
  height: number;
  guarded: boolean;
}

const CACHE = new Map<number, EndSpike[]>();

/**
 * vanilla SpikeFeature.getSpikesForLevel: the spike set keyed by the low 16 bits of the seed's first long, laid out
 * by SpikeCacheLoader: ten spots on a circle of 42 round 0,0, sizes 0..9 shuffled among them (radius 2 + size / 3,
 * height 76 + size * 3; sizes 1 and 2 caged)
 */
export function endSpikes(seed: bigint): EndSpike[] {
  const key = Number(new LegacyRandom(seed).nextLong() & 0xffffn);
  let list = CACHE.get(key);
  if (list) return list;
  // vanilla Util.toShuffledList(IntStream.range(0, 10), RandomSource.create(key))
  const r = new LegacyRandom(key);
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let j = order.length; j > 1; j--) {
    const k = r.nextInt(j);
    const t = order[k];
    order[k] = order[j - 1];
    order[j - 1] = t;
  }
  list = [];
  for (let i = 0; i < 10; i++) {
    const a = 2 * (-Math.PI + (Math.PI / 10) * i);
    const l = order[i];
    list.push({ centerX: Math.floor(42 * Math.cos(a)), centerZ: Math.floor(42 * Math.sin(a)), radius: 2 + Math.floor(l / 3), height: 76 + l * 3, guarded: l === 1 || l === 2 });
  }
  CACHE.set(key, list);
  return list;
}

/** vanilla SpikeFeature.place: every spike whose middle is in this chunk */
export function placeEndSpikes(ctx: GenContext, seed: bigint, r: Rand): void {
  for (const s of endSpikes(seed)) if (s.centerX >> 4 === ctx.cx && s.centerZ >> 4 === ctx.cz) placeSpike(ctx, s, r);
}

/** vanilla SpikeFeature.placeSpike (with a world-generated spike's crystal: not invulnerable, no beam) */
function placeSpike(ctx: GenContext, s: EndSpike, r: Rand): void {
  const OBSIDIAN = S('obsidian');
  const i = s.radius, cx = s.centerX, cz = s.centerZ, h = s.height;
  for (let x = cx - i; x <= cx + i; x++)
    for (let z = cz - i; z <= cz + i; z++)
      for (let y = 0; y <= h + 10; y++) {
        if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= i * i + 1 && y < h) ctx.set(x, y, z, OBSIDIAN);
        else if (y > 65) ctx.set(x, y, z, 0);
      }
  if (s.guarded) {
    // a cage of iron bars 5 wide and 4 high round the top, roofed; each bar joined to its neighbours in the cage
    for (let m = -2; m <= 2; m++)
      for (let n = -2; n <= 2; n++)
        for (let o = 0; o <= 3; o++) {
          const edgeX = Math.abs(m) === 2, edgeZ = Math.abs(n) === 2, top = o === 3;
          if (!edgeX && !edgeZ && !top) continue;
          const alongX = m === -2 || m === 2 || top, alongZ = n === -2 || n === 2 || top;
          const st = S('iron_bars', { north: alongX && n !== -2, south: alongX && n !== 2, west: alongZ && m !== -2, east: alongZ && m !== 2 });
          ctx.set(cx + m, h + o, cz + n, st);
        }
  }
  // the crystal, standing on bedrock in a fire (vanilla: EndCrystal.moveTo(x + 0.5, height + 1, z + 0.5, random yaw))
  const yaw = r.nextFloat() * 360;
  const crystal: SavedEntity = { id: 'end_crystal', x: cx + 0.5, y: h + 1, z: cz + 0.5, yaw, pitch: 0, dx: 0, dy: 0, dz: 0, health: 1, fire: 0 };
  ctx.entities.push(crystal);
  ctx.set(cx, h, cz, S('bedrock'));
  ctx.set(cx, h + 1, cz, S('fire'));
}
