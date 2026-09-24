// Structures' spawn_overrides (vanilla StructureSpawnOverride, applied in ChunkGenerator.getMobsAt): where a
// structure with an override for a mob category stands, only the override's list spawns there, anywhere in the
// structure's bounds (bounding_box "full") or only inside one of its pieces ("piece"). The first structure that
// holds the block decides; elsewhere it's the biome's list.

import type { Level } from './level';
import type { MobCategory } from '../entity/mob';
import type { BoundingBox } from '../world/gen/structure';
import { templesFor } from './temples';

/** an entry of a spawn list (vanilla MobSpawnSettings.SpawnerData) */
export interface SpawnEntry {
  type: string;
  weight: number;
  min: number;
  max: number;
}

/** vanilla StructureSpawnOverride */
export interface StructureSpawnOverride {
  /** vanilla BoundingBoxType: PIECE ("piece") or STRUCTURE ("full") */
  boundingBox: 'piece' | 'full';
  spawns: SpawnEntry[];
}

/** a kind of structure with spawn overrides, and a way to find its starts about a block */
export interface OverridingStructure {
  overrides: Partial<Record<MobCategory, StructureSpawnOverride>>;
  /** the structure's starts that may hold (x, z) (vanilla StructureManager.getAllStructuresAt) */
  startsAt(level: Level, x: number, z: number): { bounds: BoundingBox; pieces: { box: BoundingBox }[] }[];
}

const STRUCTURES: OverridingStructure[] = [];

export function registerSpawnOverrides(s: OverridingStructure): void {
  STRUCTURES.push(s);
}

/** the list a structure puts in place of the biome's at a block, or null where none does */
export function structureMobsAt(level: Level, cat: MobCategory, x: number, y: number, z: number): SpawnEntry[] | null {
  for (const s of STRUCTURES) {
    const o = s.overrides[cat];
    if (!o) continue;
    for (const st of s.startsAt(level, x, z))
      if (o.boundingBox === 'full' ? st.bounds.isInside(x, y, z) : st.pieces.some((p) => p.box.isInside(x, y, z))) return o.spawns;
  }
  return null;
}

/** the swamp huts whose starts may hold (x, z) (overworld only) */
const swampHutsAt = (level: Level, x: number, z: number) => (level.world.dim.id === 'overworld' ? templesFor(level.seed).startsNear('swamp_hut', x >> 4, z >> 4) : []);

// vanilla worldgen/structure/swamp_hut.json: only witches and cats inside the hut's box
registerSpawnOverrides({
  overrides: {
    monster: { boundingBox: 'piece', spawns: [{ type: 'witch', weight: 1, min: 1, max: 1 }] },
    creature: { boundingBox: 'piece', spawns: [{ type: 'cat', weight: 1, min: 1, max: 1 }] },
  },
  startsAt: swampHutsAt,
});

/**
 * vanilla StructureManager.getStructureWithPieceAt(pos, #cats_spawn_as_black / #cats_spawn_in): inside a swamp hut's
 * piece (a cat finalized there comes out black and stays; the cat spawner keeps one about)
 */
export function inSwampHut(level: Level, x: number, y: number, z: number): boolean {
  return swampHutsAt(level, x, z).some((st) => st.pieces.some((p) => p.box.isInside(x, y, z)));
}
