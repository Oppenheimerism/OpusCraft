// Ocean monuments in the running game (Stage 5: ocean; the structure itself is world/gen/monument.ts): its spawn
// overrides (vanilla worldgen/structure/monument.json, all with bounding_box "full": guardians are the only monsters
// anywhere in its box, two to four at a time, and no glow squid or axolotls turn up in it) and /locate structure
// monument. Where a monument is (and its box: it always stands at y 39 to 61) comes from the biome noise alone.

import type { Level } from './level';
import { monumentLocator, type OceanMonuments } from '../world/gen/monument';
import { registerSpawnOverrides } from './structureSpawns';

/** vanilla monument spawn_overrides.monster: guardians, 2 to 4 */
const MONUMENT_SPAWNS = [{ type: 'guardian', weight: 1, min: 2, max: 4 }];

let rt: { seed: string; monuments: OceanMonuments } | null = null;

/** the monuments of the level's world, where they are (treasure maps look for them too) */
export function monuments(level: Level): OceanMonuments {
  if (!rt || rt.seed !== level.seed) rt = { seed: level.seed, monuments: monumentLocator(level.seed) };
  return rt.monuments;
}

// vanilla monument.json spawn_overrides (ChunkGenerator.getMobsAt)
registerSpawnOverrides({
  overrides: {
    monster: { boundingBox: 'full', spawns: MONUMENT_SPAWNS },
    underground_water_creature: { boundingBox: 'full', spawns: [] },
    axolotls: { boundingBox: 'full', spawns: [] },
  },
  startsAt: (level, x, z) => (level.world.dim.id === 'overworld' ? monuments(level).startsAt(x, z) : []),
});

/** /locate structure monument: the nearest start chunk's corner */
export function locateMonument(level: Level, x: number, z: number): [number, number] | null {
  return monuments(level).nearest(x, z);
}
