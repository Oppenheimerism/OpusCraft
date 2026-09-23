// Dimension types (vanilla DimensionType + DimensionSpecialEffects). Every
// dimension keeps the same chunk storage (y -64..320); the build limits,
// light and sky behaviour differ.

export type DimensionId = 'overworld' | 'the_nether';

export interface DimensionType {
  id: DimensionId;
  /** vanilla min_y / min_y + height: where blocks can be (build limits) */
  minY: number;
  maxY: number;
  /** vanilla logical_height: the top for portals, chorus fruit and the like */
  logicalHeight: number;
  hasSkyLight: boolean;
  hasCeiling: boolean;
  /** water evaporates, lava flows further and faster, sponges dry out */
  ultraWarm: boolean;
  /** compasses and clocks work, sleeping works, portals spawn zombified piglins */
  natural: boolean;
  coordinateScale: number;
  bedWorks: boolean;
  respawnAnchorWorks: boolean;
  piglinSafe: boolean;
  /** vanilla ambient_light: the lightmap's floor */
  ambientLight: number;
  /** vanilla fixed_time: the time of day the sky (and lightmap) always shows */
  fixedTime: number | null;
  /** vanilla DimensionSpecialEffects */
  effects: {
    sky: 'normal' | 'none';
    /** flat face shading (vanilla constantAmbientLight: tops and bottoms both 0.9) and nether entity lights */
    constantAmbientLight: boolean;
    /** thick biome-coloured fog everywhere (vanilla isFoggyAt) */
    foggy: boolean;
    /** clouds (vanilla cloudLevel NaN = none) */
    clouds: boolean;
  };
  /** the packed light (sky << 4 | block) of open space outside any chunk data */
  lightDefault: number;
  /** chunk/entity storage key prefix within a world ('' for the overworld, so old saves still load) */
  storage: string;
}

export const OVERWORLD: DimensionType = {
  id: 'overworld',
  minY: -64,
  maxY: 320,
  logicalHeight: 384,
  hasSkyLight: true,
  hasCeiling: false,
  ultraWarm: false,
  natural: true,
  coordinateScale: 1,
  bedWorks: true,
  respawnAnchorWorks: false,
  piglinSafe: false,
  ambientLight: 0,
  fixedTime: null,
  effects: { sky: 'normal', constantAmbientLight: false, foggy: false, clouds: true },
  lightDefault: 0xf0,
  storage: '',
};

export const THE_NETHER: DimensionType = {
  id: 'the_nether',
  minY: 0,
  maxY: 256,
  logicalHeight: 128,
  hasSkyLight: false,
  hasCeiling: true,
  ultraWarm: true,
  natural: false,
  coordinateScale: 8,
  bedWorks: false,
  respawnAnchorWorks: true,
  piglinSafe: true,
  ambientLight: 0.1,
  fixedTime: 18000,
  effects: { sky: 'none', constantAmbientLight: true, foggy: true, clouds: false },
  lightDefault: 0,
  storage: 'nether/',
};

export const DIMENSIONS: Record<DimensionId, DimensionType> = { overworld: OVERWORLD, the_nether: THE_NETHER };

export function dimensionById(id: string | undefined | null): DimensionType {
  return DIMENSIONS[(id ?? 'overworld') as DimensionId] ?? OVERWORLD;
}

/** vanilla DimensionType.getTeleportationScale */
export function teleportationScale(from: DimensionType, to: DimensionType): number {
  return from.coordinateScale / to.coordinateScale;
}
