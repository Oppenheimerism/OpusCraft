// The overworld's water spawn lists (Stage 5: ocean; vanilla OverworldBiomes and BiomeDefaultFeatures.oceanSpawns,
// warmOceanSpawns and caveSpawns): what each biome spawns in the water — squid and dolphins as water creatures, the
// fish (cod, salmon, pufferfish, tropical fish) as water ambient, the glow squid of the dark water underground, and
// the lush caves' axolotls (not in the game yet: their list stays empty).

import type { SpawnEntry } from './structureSpawns';

const E = (type: string, weight: number, min: number, max: number): SpawnEntry => ({ type, weight, min, max });

export interface WaterSpawns {
  /** water_creature */
  water: SpawnEntry[];
  water_ambient: SpawnEntry[];
  underground_water_creature: SpawnEntry[];
  axolotls: SpawnEntry[];
}

/** vanilla BiomeDefaultFeatures.oceanSpawns: squid (a weight and most in a group), and cod in threes to sixes */
const oceanSpawns = (squid: number, squidMax: number, cod: number): Pick<WaterSpawns, 'water' | 'water_ambient'> => ({
  water: [E('squid', squid, 1, squidMax)],
  water_ambient: [E('cod', cod, 3, 6)],
});

/** the water lists of an overworld biome (the Nether and the End have none) */
export function waterSpawnsFor(name: string): WaterSpawns {
  // vanilla BiomeDefaultFeatures.caveSpawns (through commonSpawns and the rest): glow squid everywhere in the overworld
  // but the deep dark, in fours to sixes (checkGlowSquidSpawnRules keeps them deep in the dark)
  const underground = name === 'deep_dark' || name === 'the_void' ? [] : [E('glow_squid', 10, 4, 6)];
  const out: WaterSpawns = { water: [], water_ambient: [], underground_water_creature: underground, axolotls: [] };
  switch (name) {
    case 'ocean':
    case 'deep_ocean':
      Object.assign(out, oceanSpawns(1, 4, 10));
      out.water.push(E('dolphin', 1, 1, 2));
      break;
    case 'cold_ocean':
    case 'deep_cold_ocean':
      Object.assign(out, oceanSpawns(3, 4, 15));
      out.water_ambient.push(E('salmon', 15, 1, 5));
      break;
    case 'lukewarm_ocean':
    case 'deep_lukewarm_ocean':
      Object.assign(out, name === 'deep_lukewarm_ocean' ? oceanSpawns(8, 4, 8) : oceanSpawns(10, 2, 15));
      out.water_ambient.push(E('pufferfish', 5, 1, 3), E('tropical_fish', 25, 8, 8));
      out.water.push(E('dolphin', 2, 1, 2));
      break;
    // vanilla warmOcean: pufferfish, then warmOceanSpawns(10, 4): squid in ones to fours, tropical fish in eights, dolphins
    case 'warm_ocean':
      out.water_ambient.push(E('pufferfish', 15, 1, 3), E('tropical_fish', 25, 8, 8));
      out.water.push(E('squid', 10, 1, 4), E('dolphin', 2, 1, 2));
      break;
    case 'frozen_ocean':
    case 'deep_frozen_ocean':
      out.water.push(E('squid', 1, 1, 4));
      out.water_ambient.push(E('salmon', 15, 1, 5));
      break;
    case 'river':
    case 'frozen_river':
      out.water.push(E('squid', 2, 1, 4));
      out.water_ambient.push(E('salmon', 5, 1, 5));
      break;
    case 'mangrove_swamp':
      out.water_ambient.push(E('tropical_fish', 25, 8, 8));
      break;
    // vanilla lushCaves: tropical fish in its pools (at any height: TropicalFish.checkTropicalFishSpawnRules), and
    // axolotls (10, in fours to sixes) once there are any
    case 'lush_caves':
      out.water_ambient.push(E('tropical_fish', 25, 8, 8));
      break;
  }
  return out;
}
