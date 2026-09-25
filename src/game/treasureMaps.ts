// Where the sea's structures are, for the running game (Stage 5: ocean): /locate for shipwrecks, ocean ruins and
// buried treasure; the maps that lead to them (vanilla ExplorationMapFunction: the buried treasure map found in
// shipwrecks' map chests and ocean ruins' chests, zoomed in once, its target a red cross; and
// VillagerTrades.TreasureMapForEmeralds: the ocean explorer map an apprentice cartographer sells for 13 emeralds and
// a compass, zoomed out twice, its target an ocean monument no other explorer map in the world leads to), each drawn
// with a picture of where the water is (MapItem.renderBiomePreviewMap: orange stripes on the water, a brown edge
// along the coasts); and the ruin or wreck a dolphin fed a fish leads you to (ServerLevel.findNearestMapStructure).
// Where they are comes from the biome noise alone (world/gen/oceanStructures.ts).

import type { Level } from './level';
import type { Rand } from '../core/rng';
import { createMap, getSavedData } from './maps';
import { MAP_SIZE, currentMapWorld, type MapItemSavedData } from './mapData';
import { monuments } from './monuments';
import type { LootOrigin } from './loot';
import type { ItemStack } from '../item/item';
import { oceanStructureLocator, type OceanStructures, type OceanStructureKind } from '../world/gen/oceanStructures';
import { B } from '../world/gen/biomes';
import { MapColor, Brightness, packedId } from '../world/mapColors';
import { onWorldMetaSave } from '../storage/worldStore';
import { VILLAGER_TRADES, MerchantOffer, type Trader } from '../entity/trading';
import { dolphinHooks } from '../entity/dolphin';

let rt: { seed: string; ocean: OceanStructures } | null = null;

/** the shipwrecks, ocean ruins and buried treasure of the level's world */
export function oceanStructures(level: Level): OceanStructures {
  if (!rt || rt.seed !== level.seed) rt = { seed: level.seed, ocean: oceanStructureLocator(level.seed) };
  return rt.ocean;
}

/** /locate structure <name> for the sea's smaller structures (null: not one of them, or none near) */
export function locateOceanStructure(level: Level, name: string, x: number, z: number): [number, number] | null {
  const kind = name.replace(/^minecraft:/, '') as OceanStructureKind;
  if (!['shipwreck', 'shipwreck_beached', 'ocean_ruin_cold', 'ocean_ruin_warm', 'buried_treasure'].includes(kind)) return null;
  if (level.world.dim.id !== 'overworld') return null;
  return oceanStructures(level).nearest(kind, x, z);
}

// ---------------------------------------------------------------------------------------------------------------
// Explorer maps' targets: each monument start is led to by one map at most (vanilla StructureStart references)

let refs: { worldId: string; set: Set<string> } | null = null;

/** the monuments explorer maps already lead to, in the world being played (kept with its save) */
function references(): Set<string> {
  const w = currentMapWorld();
  const id = w?.meta.id ?? '';
  if (!refs || refs.worldId !== id) {
    const saved = (w?.meta as { structureReferences?: string[] } | undefined)?.structureReferences;
    refs = { worldId: id, set: new Set(Array.isArray(saved) ? saved : []) };
  }
  return refs.set;
}

onWorldMetaSave(async (m) => {
  if (refs && refs.worldId === m.id && refs.set.size) (m as { structureReferences?: string[] }).structureReferences = [...refs.set];
});

/** vanilla StructureTags: #on_treasure_maps, #on_ocean_explorer_maps, #dolphin_located */
export type MapStructureTag = 'on_treasure_maps' | 'on_ocean_explorer_maps' | 'dolphin_located';

/**
 * vanilla ServerLevel.findNearestMapStructure / ChunkGenerator.findNearestMapStructure: ring by ring out from the
 * position (up to `radius` rings of each set's regions), for each set of structures the tag takes in the first start
 * met going round that ring (with `skipKnown`, only one no map has been made for yet, which it then is); at the first
 * ring where any set has one, the nearest of those; its locate position (y 0)
 */
export function findNearestMapStructure(level: Level, tag: MapStructureTag, x: number, y: number, z: number, radius: number, skipKnown: boolean): [number, number, number] | null {
  if (level.world.dim.id !== 'overworld') return null;
  let best: [number, number, number] | null = null, bestD = Infinity;
  const consider = (pos: [number, number] | null | undefined) => {
    if (!pos) return;
    const d = (pos[0] - x) ** 2 + y * y + (pos[1] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [pos[0], 0, pos[1]];
    }
  };
  const ocean = oceanStructures(level);
  switch (tag) {
    case 'on_treasure_maps':
      consider(ocean.nearestIn('buried_treasures', ['buried_treasure'], x, z, radius)?.pos);
      break;
    case 'dolphin_located':
      for (let ring = 0; ring <= radius && !best; ring++) {
        consider(ocean.inRing('ocean_ruins', ['ocean_ruin_cold', 'ocean_ruin_warm'], x, z, ring)?.pos);
        consider(ocean.inRing('shipwrecks', ['shipwreck', 'shipwreck_beached'], x, z, ring)?.pos);
      }
      break;
    case 'on_ocean_explorer_maps': {
      const known = references();
      const key = (s: { cx: number; cz: number }) => `monument:${s.cx},${s.cz}`;
      let found: string | null = null;
      consider(
        monuments(level).nearest(x, z, radius, (s) => {
          if (skipKnown && known.has(key(s))) return true;
          found = key(s);
          return false;
        }),
      );
      if (skipKnown && found) known.add(found);
      break;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// The maps

/** vanilla BiomeTags.WATER_ON_MAP_OUTLINES: the seas, the rivers and the swamps */
const WATERY = new Set<number>([
  B.ocean, B.deep_ocean, B.frozen_ocean, B.deep_frozen_ocean, B.cold_ocean, B.deep_cold_ocean, B.lukewarm_ocean, B.deep_lukewarm_ocean,
  B.warm_ocean, B.river, B.frozen_river, B.swamp, B.mangrove_swamp,
]);

/** vanilla Mth.sin: its table of 65536 */
function mthSin(v: number): number {
  const i = Math.trunc(Math.fround(Math.fround(v) * Math.fround(10430.378))) & 65535;
  return Math.fround(Math.sin((i * Math.PI * 2) / 65536));
}

/**
 * vanilla MapItem.renderBiomePreviewMap: which of the map's pixels are over water (the biome at each, at y 0, a
 * quart at a time: here the surface's); then each pixel inside the edge from how many of its eight neighbours are
 * water: water deep among water in orange stripes on every other row (none on the rows between), its edges orange
 * shading darker toward the shore, and the land along the shore brown
 */
export function renderBiomePreviewMap(level: Level, d: MapItemSavedData): void {
  if (level.world.dim.id !== d.dimension) return;
  const biome = oceanStructures(level).quartBiome;
  const i = 1 << d.scale;
  const l = Math.trunc(d.centerX / i) - 64, i1 = Math.trunc(d.centerZ / i) - 64;
  const watery = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const cache = new Map<number, boolean>();
  for (let pz = 0; pz < MAP_SIZE; pz++)
    for (let px = 0; px < MAP_SIZE; px++) {
      const x = (l + px) * i, z = (i1 + pz) * i;
      const key = (x >> 2) * 1048576 + (z >> 2);
      let w = cache.get(key);
      if (w === undefined) cache.set(key, (w = WATERY.has(biome(x, z))));
      watery[pz * MAP_SIZE + px] = w ? 1 : 0;
    }
  const at = (x: number, z: number) => watery[z * MAP_SIZE + x] === 1;
  for (let x = 1; x < MAP_SIZE - 1; x++)
    for (let z = 1; z < MAP_SIZE - 1; z++) {
      let n = 0;
      for (let a = -1; a < 2; a++) for (let b = -1; b < 2; b++) if ((a !== 0 || b !== 0) && at(x + a, z + b)) n++;
      let brightness = Brightness.LOWEST;
      let color: number = MapColor.NONE;
      if (at(x, z)) {
        color = MapColor.COLOR_ORANGE;
        if (n > 7 && z % 2 === 0) {
          switch (Math.trunc((x + Math.trunc(Math.fround(mthSin(z) * 7))) / 8) % 5) {
            case 0:
            case 4:
              brightness = Brightness.LOW;
              break;
            case 1:
            case 3:
              brightness = Brightness.NORMAL;
              break;
            case 2:
              brightness = Brightness.HIGH;
              break;
          }
        } else if (n > 7) color = MapColor.NONE;
        else if (n > 5) brightness = Brightness.NORMAL;
        else if (n > 3) brightness = Brightness.LOW;
        else if (n > 1) brightness = Brightness.LOW;
      } else if (n > 0) {
        color = MapColor.COLOR_BROWN;
        brightness = n > 3 ? Brightness.NORMAL : Brightness.LOWEST;
      }
      if (color !== MapColor.NONE) d.updateColor(x, z, packedId(color, brightness));
    }
}

/** vanilla MapDecorationType.mapColor of the targets that tint their map (the monument's) */
const TARGET_TINT: Record<string, number> = { monument: 3830373 };

/**
 * a map leading to (x, z): vanilla MapItem.create (tracking, without limit), renderBiomePreviewMap and
 * MapItemSavedData.addTargetDecoration (the marker "+", turned 180 degrees, carried by the item)
 */
export function explorerMap(level: Level, x: number, z: number, zoom: number, target: 'red_x' | 'monument'): ItemStack {
  const s = createMap(level, x, z, zoom, true, true);
  const d = getSavedData(s, level);
  if (d) renderBiomePreviewMap(level, d);
  s.tag = { ...s.tag, mapDecorations: { '+': { type: target, x, z, rotation: 180 } } };
  if (TARGET_TINT[target] !== undefined) s.tag.mapColor = TARGET_TINT[target];
  return s;
}

/**
 * vanilla loot functions exploration_map (to #on_treasure_maps, red_x, zoom 1, 50 rings, not skipping any) and
 * set_name (item_name "Buried Treasure Map"), as the shipwrecks' and ocean ruins' chests have them: an empty map
 * becomes the map to the nearest buried treasure from the chest, if there is one (else it stays an empty map, named
 * all the same)
 */
export function buriedTreasureMap(stack: ItemStack, _r: Rand, origin: LootOrigin | null): ItemStack {
  let out = stack;
  const level = currentMapWorld()?.level;
  if (stack.item.id === 'map' && origin && level) {
    const pos = findNearestMapStructure(level, 'on_treasure_maps', origin.x, origin.y, origin.z, 50, false);
    if (pos) out = explorerMap(level, pos[0], pos[2], 1, 'red_x');
  }
  out.tag = { ...out.tag, itemName: 'Buried Treasure Map' };
  return out;
}

/**
 * vanilla VillagerTrades.TreasureMapForEmeralds(13, #on_ocean_explorer_maps, "filled_map.monument", OCEAN_MONUMENT,
 * 12, 5): the ocean explorer map, for 13 emeralds and a compass, if there's a monument within 100 regions no other
 * explorer map leads to (else no offer); 12 uses, 5 experience, price multiplier 0.2
 */
export function oceanExplorerMapForEmeralds(t: Trader): MerchantOffer | null {
  const v = t as Trader & { level?: Level; x?: number; y?: number; z?: number };
  if (!v.level || v.x === undefined || v.y === undefined || v.z === undefined) return null;
  const pos = findNearestMapStructure(v.level, 'on_ocean_explorer_maps', Math.floor(v.x), Math.floor(v.y), Math.floor(v.z), 100, true);
  if (!pos) return null;
  const s = explorerMap(v.level, pos[0], pos[2], 2, 'monument');
  s.tag = { ...s.tag, itemName: 'Ocean Explorer Map' };
  return new MerchantOffer({ id: 'emerald', count: 13 }, { id: 'compass', count: 1 }, s, 12, 5, 0.2);
}

// (vanilla VillagerTrades: the cartographer's second level, after the glass panes)
VILLAGER_TRADES.cartographer[1].push(oceanExplorerMapForEmeralds);

// vanilla DolphinSwimToTreasureGoal: the nearest ruin or wreck, 50 rings out
dolphinHooks.findTreasure = (level, x, y, z) => findNearestMapStructure(level, 'dolphin_located', x, y, z, 50, false);

/** (for the tests) forget the references explorer maps have made */
export function resetStructureReferences(): void {
  refs = null;
}
