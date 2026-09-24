// Ocean monuments in the running game (Stage 5: ocean; the structure itself is world/gen/monument.ts): the guardians
// that keep turning up anywhere in a monument's box (vanilla structure spawn_overrides: monster, bounding_box "full",
// guardian weight 1, two to four at a time) and /locate structure monument. Where a monument is (and its box: it
// always stands at y 39 to 61) comes from the biome noise alone.

import type { Level } from './level';
import { monumentLocator, type OceanMonuments } from '../world/gen/monument';

/** vanilla monument spawn_overrides.monster: guardians, 2 to 4 */
const MONUMENT_SPAWNS = [{ type: 'guardian', weight: 1, min: 2, max: 4 }];

let rt: { seed: string; monuments: OceanMonuments } | null = null;

function monuments(level: Level): OceanMonuments {
  if (!rt || rt.seed !== level.seed) rt = { seed: level.seed, monuments: monumentLocator(level.seed) };
  return rt.monuments;
}

/**
 * vanilla ChunkGenerator.getMobsAt, the structures' spawn_overrides with bounding_box "full": inside a monument's box,
 * the monsters that spawn are its guardians (null: no monument here)
 */
export function monumentSpawnsAt(level: Level, cat: string, x: number, y: number, z: number): typeof MONUMENT_SPAWNS | null {
  if (cat !== 'monster' || level.world.dim.id !== 'overworld') return null;
  // (the box is at y 39 to 61: nothing to look up outside that)
  if (y < 39 || y > 61) return null;
  return monuments(level).structureAt(x, y, z) ? MONUMENT_SPAWNS : null;
}

/** /locate structure monument: the nearest start chunk's corner */
export function locateMonument(level: Level, x: number, z: number): [number, number] | null {
  return monuments(level).nearest(x, z);
}
