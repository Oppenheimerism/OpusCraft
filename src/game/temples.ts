// The temples on the main thread, laid out just as the chunk workers lay them out (world/gen/temples): for /locate
// and for the witch hut's spawns. Working out where one stands needs the terrain noise, so the Overworld's generator
// is made here the first time it's wanted.

import { ChunkGenerator } from '../world/gen/generator';
import type { Temples, TempleKind } from '../world/gen/temples';

let cached: { seed: string; temples: Temples } | null = null;

/** the Overworld's temples for a world seed */
export function templesFor(seed: string): Temples {
  if (cached?.seed !== seed) cached = { seed, temples: new ChunkGenerator(seed).temples };
  return cached.temples;
}

/** the structure ids /locate knows them by */
const IDS: Record<string, TempleKind> = {
  'minecraft:desert_pyramid': 'desert_pyramid',
  'minecraft:igloo': 'igloo',
  'minecraft:jungle_pyramid': 'jungle_pyramid',
  'minecraft:swamp_hut': 'swamp_hut',
};

/** the temple kind of a structure id, if it's one of them */
export function templeKind(id: string): TempleKind | null {
  return IDS[id] ?? null;
}

/** vanilla /locate structure for a temple: the corner of the nearest one's start chunk */
export function locateTemple(seed: string, kind: TempleKind, x: number, z: number): [number, number] | null {
  return templesFor(seed).nearest(kind, x, z);
}
