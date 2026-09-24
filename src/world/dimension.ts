// Dimension types (vanilla DimensionType + DimensionSpecialEffects). Every
// dimension keeps the same chunk storage (y -64..320); the build limits,
// light and sky behaviour differ.

export type DimensionId = 'overworld' | 'the_nether' | 'the_end';

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
    /** vanilla SkyType: the Overworld's sky, none (the Nether), or the End's box of static */
    sky: 'normal' | 'none' | 'end';
    /** flat face shading (vanilla constantAmbientLight: tops and bottoms both 0.9) and nether entity lights */
    constantAmbientLight: boolean;
    /** thick biome-coloured fog everywhere (vanilla isFoggyAt) */
    foggy: boolean;
    /** clouds (vanilla cloudLevel NaN = none) */
    clouds: boolean;
    /** vanilla forceBrightLightmap (the End): the lightmap ignores sky light and is lifted toward a pale green-white */
    forceBrightLightmap?: boolean;
    /** vanilla getBrightnessDependentFogColor: the biome fog dims with the daylight, stays as it is, or is scaled by a constant */
    fog: 'daylight' | 'constant' | number;
  };
  /** the packed light (sky << 4 | block) of open space outside any chunk data */
  lightDefault: number;
  /** vanilla monster_spawn_block_light_limit: monsters spawn only where block light is at most this */
  monsterSpawnBlockLightLimit: number;
  /** vanilla monster_spawn_light_level: the brightness they need to be at or under (null: a random 0..7) */
  monsterSpawnLightLevel: number | null;
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
  effects: { sky: 'normal', constantAmbientLight: false, foggy: false, clouds: true, fog: 'daylight' },
  lightDefault: 0xf0,
  monsterSpawnBlockLightLimit: 0,
  monsterSpawnLightLevel: null,
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
  effects: { sky: 'none', constantAmbientLight: true, foggy: true, clouds: false, fog: 'constant' },
  lightDefault: 0,
  monsterSpawnBlockLightLimit: 15,
  monsterSpawnLightLevel: 7,
  storage: 'nether/',
};

/**
 * vanilla BuiltinDimensionTypes.END: always noon, no sky light and no ceiling, 256 high; beds and respawn anchors
 * blow up; monsters spawn only in the dark (block light 0). EndEffects: the End sky, fog at 0.15 of the biome's,
 * a bright lightmap, no clouds.
 */
export const THE_END: DimensionType = {
  id: 'the_end',
  minY: 0,
  maxY: 256,
  logicalHeight: 256,
  hasSkyLight: false,
  hasCeiling: false,
  ultraWarm: false,
  natural: false,
  coordinateScale: 1,
  bedWorks: false,
  respawnAnchorWorks: false,
  piglinSafe: false,
  ambientLight: 0,
  fixedTime: 6000,
  effects: { sky: 'end', constantAmbientLight: false, foggy: false, clouds: false, forceBrightLightmap: true, fog: 0.15 },
  lightDefault: 0,
  monsterSpawnBlockLightLimit: 0,
  monsterSpawnLightLevel: null,
  storage: 'end/',
};

export const DIMENSIONS: Record<DimensionId, DimensionType> = { overworld: OVERWORLD, the_nether: THE_NETHER, the_end: THE_END };

export function dimensionById(id: string | undefined | null): DimensionType {
  return DIMENSIONS[(id ?? 'overworld') as DimensionId] ?? OVERWORLD;
}

/** vanilla DimensionType.getTeleportationScale */
export function teleportationScale(from: DimensionType, to: DimensionType): number {
  return from.coordinateScale / to.coordinateScale;
}
