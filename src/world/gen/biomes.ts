// Overworld biomes: climate parameters, colors, and the multi-noise biome
// selection logic modelled on vanilla's OverworldBiomeBuilder.

import { hsvToRgb, clamp } from '../../core/math';

export interface Biome {
  id: number;
  name: string;
  displayName: string;
  temperature: number;
  downfall: number;
  frozen?: boolean; // temperature modifier "frozen" (frozen oceans)
  precipitation: boolean;
  grass: number;
  foliage: number;
  water: number;
  waterFog: number;
  sky: number;
  fog: number;
  grassModifier?: 'dark_forest' | 'swamp';
}

export const BIOMES: Biome[] = [];
export const BIOME_ID: Record<string, number> = {};

function skyColor(temp: number): number {
  let f = temp / 3;
  f = clamp(f, -1, 1);
  return hsvToRgb(0.62222224 - f * 0.05, 0.5 + f * 0.1, 1.0);
}

/** Approximation of vanilla's grass colormap (triangle blend). */
export function colormapGrass(temp: number, downfall: number): number {
  const t = clamp(temp, 0, 1);
  const d = clamp(downfall, 0, 1) * t;
  return triBlend(t, d, [0x47, 0xcd, 0x33], [0xbf, 0xb7, 0x55], [0x80, 0xb4, 0x97]);
}
export function colormapFoliage(temp: number, downfall: number): number {
  const t = clamp(temp, 0, 1);
  const d = clamp(downfall, 0, 1) * t;
  return triBlend(t, d, [0x1a, 0xbf, 0x00], [0xae, 0xa4, 0x2a], [0x60, 0xa1, 0x7b]);
}
function triBlend(t: number, d: number, wet: number[], dry: number[], cold: number[]): number {
  // corners: (t=1,d=1) wet ; (t=1,d=0) dry ; (t=0) cold
  const wCold = 1 - t;
  const wWet = d;
  const wDry = t - d;
  const c = [0, 1, 2].map((i) => Math.round(wet[i] * wWet + dry[i] * wDry + cold[i] * wCold));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}

function def(
  name: string,
  temperature: number,
  downfall: number,
  o: Partial<Pick<Biome, 'grass' | 'foliage' | 'water' | 'waterFog' | 'frozen' | 'grassModifier' | 'precipitation'>> = {},
): number {
  const id = BIOMES.length;
  const displayName = name;
  BIOMES.push({
    id,
    name,
    displayName,
    temperature,
    downfall,
    frozen: o.frozen,
    precipitation: o.precipitation ?? true,
    grass: o.grass ?? colormapGrass(temperature, downfall),
    foliage: o.foliage ?? colormapFoliage(temperature, downfall),
    water: o.water ?? 0x3f76e4,
    waterFog: o.waterFog ?? 0x050533,
    sky: skyColor(temperature),
    fog: 0xc0d8ff,
    grassModifier: o.grassModifier,
  });
  BIOME_ID[name] = id;
  return id;
}

export const B = {
  the_void: def('the_void', 0.5, 0.5, { precipitation: false }),
  plains: def('plains', 0.8, 0.4, { grass: 0x91bd59, foliage: 0x77ab2f }),
  sunflower_plains: def('sunflower_plains', 0.8, 0.4, { grass: 0x91bd59, foliage: 0x77ab2f }),
  snowy_plains: def('snowy_plains', 0.0, 0.5, { grass: 0x80b497, foliage: 0x60a17b }),
  ice_spikes: def('ice_spikes', 0.0, 0.5, { grass: 0x80b497, foliage: 0x60a17b }),
  desert: def('desert', 2.0, 0.0, { grass: 0xbfb755, foliage: 0xaea42a, precipitation: false }),
  swamp: def('swamp', 0.8, 0.9, { grass: 0x6a7039, foliage: 0x6a7039, water: 0x617b64, waterFog: 0x232317, grassModifier: 'swamp' }),
  mangrove_swamp: def('mangrove_swamp', 0.8, 0.9, { grass: 0x6a7039, foliage: 0x8db127, water: 0x3a7a6a, waterFog: 0x4d7a60, grassModifier: 'swamp' }),
  forest: def('forest', 0.7, 0.8, { grass: 0x79c05a, foliage: 0x59ae30 }),
  flower_forest: def('flower_forest', 0.7, 0.8, { grass: 0x79c05a, foliage: 0x59ae30 }),
  birch_forest: def('birch_forest', 0.6, 0.6, { grass: 0x88bb67, foliage: 0x6ba941 }),
  dark_forest: def('dark_forest', 0.7, 0.8, { grass: 0x507a32, foliage: 0x59ae30, grassModifier: 'dark_forest' }),
  old_growth_birch_forest: def('old_growth_birch_forest', 0.6, 0.6, { grass: 0x88bb67, foliage: 0x6ba941 }),
  old_growth_pine_taiga: def('old_growth_pine_taiga', 0.3, 0.8, { grass: 0x86b87f, foliage: 0x68a55f }),
  old_growth_spruce_taiga: def('old_growth_spruce_taiga', 0.25, 0.8, { grass: 0x86b783, foliage: 0x68a464 }),
  taiga: def('taiga', 0.25, 0.8, { grass: 0x86b783, foliage: 0x68a464 }),
  snowy_taiga: def('snowy_taiga', -0.5, 0.4, { grass: 0x80b497, foliage: 0x60a17b, water: 0x3d57d6 }),
  savanna: def('savanna', 2.0, 0.0, { grass: 0xbfb755, foliage: 0xaea42a, precipitation: false }),
  savanna_plateau: def('savanna_plateau', 2.0, 0.0, { grass: 0xbfb755, foliage: 0xaea42a, precipitation: false }),
  windswept_hills: def('windswept_hills', 0.2, 0.3, { grass: 0x8ab689, foliage: 0x6da36b }),
  windswept_gravelly_hills: def('windswept_gravelly_hills', 0.2, 0.3, { grass: 0x8ab689, foliage: 0x6da36b }),
  windswept_forest: def('windswept_forest', 0.2, 0.3, { grass: 0x8ab689, foliage: 0x6da36b }),
  windswept_savanna: def('windswept_savanna', 2.0, 0.0, { grass: 0xbfb755, foliage: 0xaea42a, precipitation: false }),
  jungle: def('jungle', 0.95, 0.9, { grass: 0x59c93c, foliage: 0x30bb0b }),
  sparse_jungle: def('sparse_jungle', 0.95, 0.8, { grass: 0x64c73f, foliage: 0x3eb80f }),
  bamboo_jungle: def('bamboo_jungle', 0.95, 0.9, { grass: 0x59c93c, foliage: 0x30bb0b }),
  badlands: def('badlands', 2.0, 0.0, { grass: 0x90814d, foliage: 0x9e814d, precipitation: false }),
  eroded_badlands: def('eroded_badlands', 2.0, 0.0, { grass: 0x90814d, foliage: 0x9e814d, precipitation: false }),
  wooded_badlands: def('wooded_badlands', 2.0, 0.0, { grass: 0x90814d, foliage: 0x9e814d, precipitation: false }),
  meadow: def('meadow', 0.5, 0.8, { grass: 0x83bb6d, foliage: 0x63a948, water: 0x0e4ecf }),
  cherry_grove: def('cherry_grove', 0.5, 0.8, { grass: 0xb6db61, foliage: 0xb6db61, water: 0x5db7ef, waterFog: 0x5db7ef }),
  grove: def('grove', -0.2, 0.8, { grass: 0x80b497, foliage: 0x60a17b }),
  snowy_slopes: def('snowy_slopes', -0.3, 0.9, { grass: 0x80b497, foliage: 0x60a17b }),
  frozen_peaks: def('frozen_peaks', -0.7, 0.9, { grass: 0x80b497, foliage: 0x60a17b }),
  jagged_peaks: def('jagged_peaks', -0.7, 0.9, { grass: 0x80b497, foliage: 0x60a17b }),
  stony_peaks: def('stony_peaks', 1.0, 0.3, { grass: 0x9abe4b, foliage: 0x82ac1e }),
  river: def('river', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d }),
  frozen_river: def('frozen_river', 0.0, 0.5, { grass: 0x80b497, foliage: 0x60a17b, water: 0x3938c9 }),
  beach: def('beach', 0.8, 0.4, { grass: 0x91bd59, foliage: 0x77ab2f }),
  snowy_beach: def('snowy_beach', 0.05, 0.3, { grass: 0x83b593, foliage: 0x64a278, water: 0x3d57d6 }),
  stony_shore: def('stony_shore', 0.2, 0.3, { grass: 0x8ab689, foliage: 0x6da36b }),
  warm_ocean: def('warm_ocean', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d, water: 0x43d5ee, waterFog: 0x041f33 }),
  lukewarm_ocean: def('lukewarm_ocean', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d, water: 0x45adf2, waterFog: 0x041633 }),
  deep_lukewarm_ocean: def('deep_lukewarm_ocean', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d, water: 0x45adf2, waterFog: 0x041633 }),
  ocean: def('ocean', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d }),
  deep_ocean: def('deep_ocean', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d }),
  cold_ocean: def('cold_ocean', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d, water: 0x3d57d6 }),
  deep_cold_ocean: def('deep_cold_ocean', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d, water: 0x3d57d6 }),
  frozen_ocean: def('frozen_ocean', 0.0, 0.5, { grass: 0x80b497, foliage: 0x60a17b, water: 0x3938c9, frozen: true }),
  deep_frozen_ocean: def('deep_frozen_ocean', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d, water: 0x3938c9, frozen: true }),
  mushroom_fields: def('mushroom_fields', 0.9, 1.0, { grass: 0x55c93f, foliage: 0x2bbb0f }),
  dripstone_caves: def('dripstone_caves', 0.8, 0.4, { grass: 0x91bd59, foliage: 0x77ab2f }),
  lush_caves: def('lush_caves', 0.5, 0.5, { grass: 0x8eb971, foliage: 0x71a74d }),
  deep_dark: def('deep_dark', 0.8, 0.4, { grass: 0x91bd59, foliage: 0x77ab2f }),
};

// Pretty names for F3 ("minecraft:plains" style is used there).
for (const b of BIOMES) b.displayName = 'minecraft:' + b.name;

const OCEANS = [
  [B.deep_frozen_ocean, B.deep_cold_ocean, B.deep_ocean, B.deep_lukewarm_ocean, B.warm_ocean],
  [B.frozen_ocean, B.cold_ocean, B.ocean, B.lukewarm_ocean, B.warm_ocean],
];
const MIDDLE = [
  [B.snowy_plains, B.snowy_plains, B.snowy_plains, B.snowy_taiga, B.taiga],
  [B.plains, B.plains, B.forest, B.taiga, B.old_growth_spruce_taiga],
  [B.flower_forest, B.plains, B.forest, B.birch_forest, B.dark_forest],
  [B.savanna, B.savanna, B.forest, B.jungle, B.jungle],
  [B.desert, B.desert, B.desert, B.desert, B.desert],
];
const N = -1;
const MIDDLE_VAR = [
  [B.ice_spikes, N, B.snowy_taiga, N, N],
  [N, N, N, N, B.old_growth_pine_taiga],
  [B.sunflower_plains, N, N, B.old_growth_birch_forest, N],
  [N, N, B.plains, B.sparse_jungle, B.bamboo_jungle],
  [N, N, N, N, N],
];
const PLATEAU = [
  [B.snowy_plains, B.snowy_plains, B.snowy_plains, B.snowy_taiga, B.snowy_taiga],
  [B.meadow, B.meadow, B.forest, B.taiga, B.old_growth_spruce_taiga],
  [B.meadow, B.meadow, B.meadow, B.meadow, B.dark_forest],
  [B.savanna_plateau, B.savanna_plateau, B.forest, B.forest, B.jungle],
  [B.badlands, B.badlands, B.badlands, B.wooded_badlands, B.wooded_badlands],
];
const PLATEAU_VAR = [
  [B.ice_spikes, N, N, N, N],
  [B.cherry_grove, N, B.meadow, B.meadow, B.old_growth_pine_taiga],
  [B.cherry_grove, B.cherry_grove, B.forest, B.birch_forest, N],
  [N, N, N, N, N],
  [B.eroded_badlands, B.eroded_badlands, N, N, N],
];
const SHATTERED = [
  [B.windswept_gravelly_hills, B.windswept_gravelly_hills, B.windswept_hills, B.windswept_forest, B.windswept_forest],
  [B.windswept_gravelly_hills, B.windswept_gravelly_hills, B.windswept_hills, B.windswept_forest, B.windswept_forest],
  [B.windswept_hills, B.windswept_hills, B.windswept_hills, B.windswept_forest, B.windswept_forest],
  [N, N, N, N, N],
  [N, N, N, N, N],
];

function idx(v: number, cuts: number[]): number {
  let i = 0;
  while (i < cuts.length && v >= cuts[i]) i++;
  return i;
}

const T_CUTS = [-0.45, -0.15, 0.2, 0.55];
const H_CUTS = [-0.35, -0.1, 0.1, 0.3];
const E_CUTS = [-0.78, -0.375, -0.2225, 0.05, 0.45, 0.55];

function pickMiddle(t: number, h: number, wNeg: boolean): number {
  if (wNeg) return MIDDLE[t][h];
  const v = MIDDLE_VAR[t][h];
  return v === N ? MIDDLE[t][h] : v;
}
function pickBadlands(h: number, wNeg: boolean): number {
  if (h < 2) return wNeg ? B.badlands : B.eroded_badlands;
  return h < 3 ? B.badlands : B.wooded_badlands;
}
function pickMiddleOrBadlands(t: number, h: number, wNeg: boolean): number {
  return t === 4 ? pickBadlands(h, wNeg) : pickMiddle(t, h, wNeg);
}
function pickPlateau(t: number, h: number, wNeg: boolean): number {
  if (!wNeg) {
    const v = PLATEAU_VAR[t][h];
    if (v !== N) return v;
  }
  return PLATEAU[t][h];
}
function pickSlope(t: number, h: number, wNeg: boolean): number {
  if (t >= 3) return pickPlateau(t, h, wNeg);
  return h <= 1 ? B.snowy_slopes : B.grove;
}
function pickMiddleOrBadlandsOrSlope(t: number, h: number, wNeg: boolean): number {
  return t === 0 ? pickSlope(t, h, wNeg) : pickMiddleOrBadlands(t, h, wNeg);
}
function pickPeak(t: number, h: number, wNeg: boolean): number {
  if (t <= 2) return wNeg ? B.jagged_peaks : B.frozen_peaks;
  return t === 3 ? B.stony_peaks : pickBadlands(h, wNeg);
}
function pickShattered(t: number, h: number, wNeg: boolean): number {
  const v = SHATTERED[t][h];
  return v === N ? pickMiddle(t, h, wNeg) : v;
}
function windsweptSavannaOr(t: number, h: number, wNeg: boolean, fallback: number): number {
  return t > 1 && h < 4 && !wNeg ? B.windswept_savanna : fallback;
}
function pickBeach(t: number): number {
  if (t === 0) return B.snowy_beach;
  return t === 4 ? B.desert : B.beach;
}
function pickShatteredCoast(t: number, h: number, wNeg: boolean): number {
  const r = !wNeg ? pickMiddle(t, h, wNeg) : pickBeach(t);
  return windsweptSavannaOr(t, h, wNeg, r);
}

// Weirdness slices
const enum Slice { MID, HIGH, PEAKS, LOW, VALLEY }
const SLICE_BOUNDS: [number, Slice][] = [
  [-0.93333334, Slice.MID],
  [-0.7666667, Slice.HIGH],
  [-0.56666666, Slice.PEAKS],
  [-0.4, Slice.HIGH],
  [-0.26666668, Slice.MID],
  [-0.05, Slice.LOW],
  [0.05, Slice.VALLEY],
  [0.26666668, Slice.LOW],
  [0.4, Slice.MID],
  [0.56666666, Slice.HIGH],
  [0.7666667, Slice.PEAKS],
  [0.93333334, Slice.HIGH],
  [Infinity, Slice.MID],
];

/**
 * Surface biome from climate parameters.
 * @param T temperature, H humidity (vegetation), C continentalness, E erosion, W weirdness (ridges)
 */
export function pickSurfaceBiome(T: number, H: number, C: number, E: number, W: number): number {
  const t = idx(T, T_CUTS);
  const h = idx(H, H_CUTS);
  if (C < -1.05) return B.mushroom_fields;
  if (C < -0.455) return OCEANS[0][t];
  if (C < -0.19) return OCEANS[1][t];
  // continent band: 0 coast, 1 near, 2 mid, 3 far
  const c = C < -0.11 ? 0 : C < 0.03 ? 1 : C < 0.3 ? 2 : 3;
  const e = idx(E, E_CUTS);
  let slice = Slice.MID;
  for (const [ub, s] of SLICE_BOUNDS) {
    if (W < ub) {
      slice = s;
      break;
    }
  }
  const wNeg = W < -0.05 && slice !== Slice.VALLEY;
  const frozen = t === 0;

  switch (slice) {
    case Slice.VALLEY: {
      if (c === 0 && e <= 1) return frozen ? B.frozen_river : B.river;
      if (c === 1 && e <= 1) return frozen ? B.frozen_river : B.river;
      if (e >= 2 && e <= 5) return frozen ? B.frozen_river : B.river;
      if (c === 0 && e === 6) return frozen ? B.frozen_river : B.river;
      if (e === 6) {
        if (frozen) return B.frozen_river;
        return t <= 2 ? B.swamp : B.mangrove_swamp;
      }
      // mid/far, e0-1
      return pickMiddleOrBadlands(t, h, wNeg);
    }
    case Slice.PEAKS: {
      const peak = pickPeak(t, h, wNeg);
      if (e === 0) return peak;
      if (e === 1) return c <= 1 ? pickMiddleOrBadlandsOrSlope(t, h, wNeg) : peak;
      if (e === 2) return c <= 1 ? pickMiddle(t, h, wNeg) : pickPlateau(t, h, wNeg);
      if (e === 3) return c <= 1 ? pickMiddle(t, h, wNeg) : c === 2 ? pickMiddleOrBadlands(t, h, wNeg) : pickPlateau(t, h, wNeg);
      if (e === 4) return pickMiddle(t, h, wNeg);
      if (e === 5) {
        const sh = pickShattered(t, h, wNeg);
        return c <= 1 ? windsweptSavannaOr(t, h, wNeg, sh) : sh;
      }
      return pickMiddle(t, h, wNeg);
    }
    case Slice.HIGH: {
      if (c === 0 && e <= 1) return pickMiddle(t, h, wNeg);
      if (e === 0) return c === 1 ? pickSlope(t, h, wNeg) : pickPeak(t, h, wNeg);
      if (e === 1) return c === 1 ? pickMiddleOrBadlandsOrSlope(t, h, wNeg) : pickSlope(t, h, wNeg);
      if (e === 2) return c <= 1 ? pickMiddle(t, h, wNeg) : pickPlateau(t, h, wNeg);
      if (e === 3) return c <= 1 ? pickMiddle(t, h, wNeg) : c === 2 ? pickMiddleOrBadlands(t, h, wNeg) : pickPlateau(t, h, wNeg);
      if (e === 4) return pickMiddle(t, h, wNeg);
      if (e === 5) {
        const sh = pickShattered(t, h, wNeg);
        return c <= 1 ? windsweptSavannaOr(t, h, wNeg, sh) : sh;
      }
      return pickMiddle(t, h, wNeg);
    }
    case Slice.MID: {
      if (c === 0 && e <= 2) return B.stony_shore;
      if (c >= 1 && e === 6 && !frozen) return t <= 2 ? B.swamp : B.mangrove_swamp;
      if (e === 0) return pickSlope(t, h, wNeg);
      if (e === 1) return c <= 2 ? pickMiddleOrBadlandsOrSlope(t, h, wNeg) : t === 0 ? pickSlope(t, h, wNeg) : pickPlateau(t, h, wNeg);
      if (e === 2) return c === 1 ? pickMiddle(t, h, wNeg) : c === 2 ? pickMiddleOrBadlands(t, h, wNeg) : pickPlateau(t, h, wNeg);
      if (e === 3) return c <= 1 ? pickMiddle(t, h, wNeg) : pickMiddleOrBadlands(t, h, wNeg);
      if (e === 4) return c === 0 && wNeg ? pickBeach(t) : pickMiddle(t, h, wNeg);
      if (e === 5) {
        if (c === 0) return pickShatteredCoast(t, h, wNeg);
        if (c === 1) return windsweptSavannaOr(t, h, wNeg, pickMiddle(t, h, wNeg));
        return pickShattered(t, h, wNeg);
      }
      // e6
      if (c === 0) return wNeg ? pickBeach(t) : pickMiddle(t, h, wNeg);
      return pickMiddle(t, h, wNeg); // frozen inland
    }
    case Slice.LOW:
    default: {
      if (c === 0 && e <= 2) return B.stony_shore;
      if (c >= 1 && e === 6 && !frozen) return t <= 2 ? B.swamp : B.mangrove_swamp;
      if (e <= 1) return c === 1 ? pickMiddleOrBadlands(t, h, wNeg) : c === 0 ? pickMiddle(t, h, wNeg) : pickMiddleOrBadlandsOrSlope(t, h, wNeg);
      if (e <= 3) {
        if (c === 0) return e === 3 ? pickBeach(t) : pickMiddle(t, h, wNeg);
        return c === 1 ? pickMiddle(t, h, wNeg) : pickMiddleOrBadlands(t, h, wNeg);
      }
      if (e === 4) return c === 0 ? pickBeach(t) : pickMiddle(t, h, wNeg);
      if (e === 5) {
        if (c === 0) return pickShatteredCoast(t, h, wNeg);
        if (c === 1) return windsweptSavannaOr(t, h, wNeg, pickMiddle(t, h, wNeg));
        return pickMiddle(t, h, wNeg);
      }
      if (c === 0) return pickBeach(t);
      return pickMiddle(t, h, wNeg);
    }
  }
}

/** Underground biome override (depth > ~0.2). Returns -1 if none. */
export function pickCaveBiome(H: number, C: number, E: number, depth: number): number {
  if (depth < 0.2) return -1;
  // deep dark near the bottom with low erosion
  if (depth > 0.9 && E < -0.375) return B.deep_dark;
  if (C > 0.8) return B.dripstone_caves;
  if (H > 0.7) return B.lush_caves;
  return -1;
}

export function isOcean(b: number): boolean {
  return (
    b === B.ocean || b === B.deep_ocean || b === B.cold_ocean || b === B.deep_cold_ocean || b === B.frozen_ocean ||
    b === B.deep_frozen_ocean || b === B.lukewarm_ocean || b === B.deep_lukewarm_ocean || b === B.warm_ocean
  );
}

export function isSnowyBiome(b: number): boolean {
  return BIOMES[b].temperature < 0.15;
}
