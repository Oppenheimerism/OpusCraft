// The end cities on the main thread, laid out just as the chunk workers lay them out (world/gen/endCity): for /locate
// and for The City at the End of the Game. Where one stands depends on the End's terrain, so the End's generator is
// made here the first time it's wanted.

import { EndGenerator } from '../world/gen/theEnd';
import type { EndCities } from '../world/gen/endCity';

let cached: { seed: string; cities: EndCities } | null = null;

/** the End's cities for a world seed */
export function endCitiesFor(seed: string): EndCities {
  if (cached?.seed !== seed) cached = { seed, cities: new EndGenerator(seed).endCities };
  return cached.cities;
}

/** vanilla /locate structure minecraft:end_city: the corner of the nearest one's start chunk */
export function locateEndCity(seed: string, x: number, z: number): [number, number] | null {
  return endCitiesFor(seed).nearest(x, z);
}

/** vanilla LocationPredicate.inStructure(end_city): whether a block is in one of a city's pieces */
export function inEndCity(seed: string, x: number, y: number, z: number): boolean {
  return endCitiesFor(seed).pieceAt(x, y, z) !== null;
}
