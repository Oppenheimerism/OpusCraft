// Map data (vanilla MapItemSavedData, MapDecoration and MapIndex): what a filled map shows — where it's centred, its
// scale and dimension, its 128×128 colours, whether it's locked, and the markers on it — kept per world by id and saved
// with the world (vanilla data/map_<id>.dat, and idcounts.dat for the last id handed out).

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { ItemStack } from '../item/item';
import type { DimensionId } from '../world/dimension';
import { loadWorldData, saveWorldData, worldDataKey, onWorldMetaSave, type WorldMeta } from '../storage/worldStore';
import { BannerBlockEntity } from '../world/blockEntity';
import { BANNER_COLORS, bannerColorOf } from '../world/bannerPatterns';

export const MAP_SIZE = 128;

/**
 * vanilla MapDecorationTypes (those the game has): a player, off the map or far off it, a banner of each colour;
 * (Stage 5: ocean) and the targets of treasure and explorer maps: a red cross, an ocean monument
 */
export type DecorationType = 'player' | 'player_off_map' | 'player_off_limits' | `banner_${(typeof BANNER_COLORS)[number]}` | 'red_x' | 'monument';

/** whether item frames (and the cartography table) show a marker, and whether it counts toward a map's limit */
export const DECORATION_TYPES = {
  player: { showOnItemFrame: false, trackCount: true },
  player_off_map: { showOnItemFrame: false, trackCount: true },
  player_off_limits: { showOnItemFrame: false, trackCount: true },
  ...Object.fromEntries(BANNER_COLORS.map((c) => [`banner_${c}`, { showOnItemFrame: true, trackCount: true }])),
  // (Stage 5: ocean)
  red_x: { showOnItemFrame: true, trackCount: false },
  monument: { showOnItemFrame: true, trackCount: false },
} as Record<DecorationType, { showOnItemFrame: boolean; trackCount: boolean }>;

/** (Stage 5: ocean) vanilla MapDecorationType.explorationMapElement: what marks a map as a cartographer's explorer map */
const EXPLORATION_ELEMENTS: ReadonlySet<DecorationType> = new Set(['monument']);

/** vanilla MapDecoration: x and y in half map pixels from the centre (-128..127), rot in sixteenths of a turn */
export interface MapDecoration {
  type: DecorationType;
  x: number;
  y: number;
  rot: number;
  name: string | null;
}

/** vanilla MapBanner: a banner a map was used on, its base colour and name as they were */
export interface MapBanner {
  x: number;
  y: number;
  z: number;
  color: string;
  name: string | null;
}

/** vanilla MapBanner.getId */
const bannerId = (b: MapBanner): string => `banner-${b.x},${b.y},${b.z}`;

/** vanilla MapBanner.fromWorld: the banner at the place, if there is one */
function bannerAt(level: Level, x: number, y: number, z: number): MapBanner | null {
  const be = level.world.getBlockEntity(x, y, z);
  const color = be instanceof BannerBlockEntity ? bannerColorOf(level.getBlockName(x, y, z)) : null;
  return color ? { x, y, z, color, name: (be as BannerBlockEntity).customName ?? null } : null;
}

const sameBanner = (a: MapBanner, b: MapBanner | null): boolean => !!b && a.x === b.x && a.y === b.y && a.z === b.z && a.color === b.color && a.name === b.name;

/** what a map is saved as (vanilla MapItemSavedData.save) */
export interface SavedMapData {
  dimension: DimensionId;
  xCenter: number;
  zCenter: number;
  scale: number;
  trackingPosition: boolean;
  unlimitedTracking: boolean;
  locked: boolean;
  colors: Uint8Array;
  banners?: MapBanner[];
}

/** vanilla MapItemSavedData.HoldingPlayer: someone carrying the map, and where their sweep of it has got to */
interface HoldingPlayer {
  player: Player;
  step: number;
}

/** (Java's byte cast) */
const toByte = (v: number): number => (v << 24) >> 24;

export class MapItemSavedData {
  /** vanilla colors: a packed MapColor per pixel, row by row (0: nothing drawn) */
  colors = new Uint8Array(MAP_SIZE * MAP_SIZE);
  /** vanilla decorations, in the order they were added */
  readonly decorations = new Map<string, MapDecoration>();
  /** vanilla bannerMarkers: the banners marked on it, by id */
  readonly bannerMarkers = new Map<string, MapBanner>();
  trackedDecorationCount = 0;
  private readonly carriedBy = new Map<Player, HoldingPlayer>();
  /** bumped whenever a colour changes (the renderers re-upload the picture) */
  colorVersion = 0;
  /** changed since last saved (vanilla SavedData.isDirty) */
  dirty = false;

  constructor(
    readonly centerX: number,
    readonly centerZ: number,
    readonly scale: number,
    readonly trackingPosition: boolean,
    readonly unlimitedTracking: boolean,
    readonly locked: boolean,
    readonly dimension: DimensionId,
  ) {}

  /** vanilla createFresh: centred on the scale's grid, the one (x, z) is in */
  static createFresh(x: number, z: number, scale: number, trackingPosition: boolean, unlimitedTracking: boolean, dimension: DimensionId): MapItemSavedData {
    const i = MAP_SIZE * (1 << scale);
    const j = Math.floor((x + 64) / i), k = Math.floor((z + 64) / i);
    return new MapItemSavedData(j * i + i / 2 - 64, k * i + i / 2 - 64, scale, trackingPosition, unlimitedTracking, false, dimension);
  }

  /** vanilla scaled: a fresh map one step further out, centred again on the bigger grid (nothing drawn yet) */
  scaled(): MapItemSavedData {
    return MapItemSavedData.createFresh(this.centerX, this.centerZ, Math.max(0, Math.min(4, this.scale + 1)), this.trackingPosition, this.unlimitedTracking, this.dimension);
  }

  /** vanilla locked: a copy that won't change any more, markers and all */
  lockedCopy(): MapItemSavedData {
    const d = new MapItemSavedData(this.centerX, this.centerZ, this.scale, this.trackingPosition, this.unlimitedTracking, true, this.dimension);
    for (const [k, v] of this.bannerMarkers) d.bannerMarkers.set(k, { ...v });
    for (const [k, v] of this.decorations) d.decorations.set(k, { ...v });
    d.trackedDecorationCount = this.trackedDecorationCount;
    d.colors.set(this.colors);
    d.dirty = true;
    return d;
  }

  /** vanilla isExplorationMap: made by a cartographer to lead somewhere (it shows where: an ocean monument) */
  isExplorationMap(): boolean {
    for (const d of this.decorations.values()) if (EXPLORATION_ELEMENTS.has(d.type)) return true;
    return false;
  }

  /** vanilla getHoldingPlayer */
  holdingPlayer(p: Player): HoldingPlayer {
    let h = this.carriedBy.get(p);
    if (!h) this.carriedBy.set(p, (h = { player: p, step: 0 }));
    return h;
  }

  /**
   * vanilla tickCarriedBy: whoever carries the map is marked on it (when it's their dimension's and it tracks
   * positions); someone who no longer has it, or has gone, loses their marker
   */
  tickCarriedBy(player: Player, stack: ItemStack): void {
    this.holdingPlayer(player);
    for (const [p] of this.carriedBy) {
      const id = decorationId(p);
      if (!p.removed && carries(p, stack)) {
        if (p.level.world.dim.id === this.dimension && this.trackingPosition) this.addDecoration('player', p.level, id, p.x, p.z, p.yaw, null);
      } else {
        this.carriedBy.delete(p);
        this.removeDecoration(id);
      }
    }
    // (Stage 5: ocean) the markers the map item itself carries (vanilla MAP_DECORATIONS: an explorer map's target),
    // put on it the first time it's carried
    const marks = stack.tag?.mapDecorations;
    if (marks)
      for (const [id, m] of Object.entries(marks))
        if (!this.decorations.has(id) && m.type in DECORATION_TYPES) this.addDecoration(m.type as DecorationType, player.level, id, m.x, m.z, m.rotation, null);
  }

  /**
   * vanilla addDecoration: placed in half pixels from the centre and turned in sixteenths (spinning at random in the
   * Nether); a player off the map sits on its edge (a smaller dot past 320 pixels out, and only on maps that track
   * without limit), anything else off the map is taken off it
   */
  addDecoration(type: DecorationType, level: Level | null, id: string, x: number, z: number, rotation: number, name: string | null): void {
    const i = 1 << this.scale;
    const f = Math.fround(Math.fround(x - this.centerX) / i), f1 = Math.fround(Math.fround(z - this.centerZ) / i);
    let b0 = toByte(Math.trunc(Math.fround(f * 2) + 0.5));
    let b1 = toByte(Math.trunc(Math.fround(f1 * 2) + 0.5));
    let b2: number;
    if (f >= -63 && f1 >= -63 && f <= 63 && f1 <= 63) {
      rotation += rotation < 0 ? -8 : 8;
      b2 = toByte(Math.trunc((rotation * 16) / 360));
      if (this.dimension === 'the_nether' && level) {
        const l = Math.trunc(level.dayTime / 10);
        b2 = ((Math.imul(Math.imul(l, l), 34187121) + Math.imul(l, 121)) >> 15) & 15;
      }
    } else {
      if (type !== 'player') {
        this.removeDecoration(id);
        return;
      }
      if (Math.abs(f) < 320 && Math.abs(f1) < 320) type = 'player_off_map';
      else {
        if (!this.unlimitedTracking) {
          this.removeDecoration(id);
          return;
        }
        type = 'player_off_limits';
      }
      b2 = 0;
      if (f <= -63) b0 = -128;
      if (f1 <= -63) b1 = -128;
      if (f >= 63) b0 = 127;
      if (f1 >= 63) b1 = 127;
    }
    const d: MapDecoration = { type, x: b0, y: b1, rot: b2, name };
    const old = this.decorations.get(id);
    this.decorations.set(id, d);
    if (!old || old.type !== d.type || old.x !== d.x || old.y !== d.y || old.rot !== d.rot || old.name !== d.name) {
      if (old && DECORATION_TYPES[old.type].trackCount) this.trackedDecorationCount--;
      if (DECORATION_TYPES[type].trackCount) this.trackedDecorationCount++;
    }
  }

  /**
   * vanilla toggleBanner: a banner on the map is marked with its colour (and name), or unmarked if it was already;
   * false (and the use fails) off the map, for no banner, or past 256 markers
   */
  toggleBanner(level: Level, x: number, y: number, z: number): boolean {
    const d0 = x + 0.5, d1 = z + 0.5;
    const i = 1 << this.scale;
    const d2 = (d0 - this.centerX) / i, d3 = (d1 - this.centerZ) / i;
    if (d2 < -63 || d3 < -63 || d2 > 63 || d3 > 63) return false;
    const b = bannerAt(level, x, y, z);
    if (!b) return false;
    const id = bannerId(b);
    const had = this.bannerMarkers.get(id);
    if (had && sameBanner(had, b)) {
      this.bannerMarkers.delete(id);
      this.removeDecoration(id);
      this.dirty = true;
      return true;
    }
    if (this.trackedDecorationCount >= 256) return false;
    this.bannerMarkers.set(id, b);
    this.addDecoration(`banner_${b.color}` as DecorationType, level, id, d0, d1, 180, b.name);
    this.dirty = true;
    return true;
  }

  /** vanilla checkBanners: marked banners in this column that have gone (or changed) come off the map */
  checkBanners(level: Level, x: number, z: number): void {
    if (!this.bannerMarkers.size) return;
    for (const [id, b] of this.bannerMarkers) {
      if (b.x !== x || b.z !== z || sameBanner(b, bannerAt(level, b.x, b.y, b.z))) continue;
      this.bannerMarkers.delete(id);
      this.removeDecoration(id);
      this.dirty = true;
    }
  }

  /** vanilla removeDecoration */
  removeDecoration(id: string): void {
    const d = this.decorations.get(id);
    if (!d) return;
    this.decorations.delete(id);
    if (DECORATION_TYPES[d.type].trackCount) this.trackedDecorationCount--;
  }

  /** vanilla updateColor: true when the pixel changed */
  updateColor(x: number, z: number, color: number): boolean {
    const i = x + z * MAP_SIZE;
    if (this.colors[i] === color) return false;
    this.colors[i] = color;
    this.colorVersion++;
    this.dirty = true;
    return true;
  }

  /** vanilla save (the markers of players aren't kept) */
  save(): SavedMapData {
    return {
      dimension: this.dimension, xCenter: this.centerX, zCenter: this.centerZ, scale: this.scale,
      trackingPosition: this.trackingPosition, unlimitedTracking: this.unlimitedTracking, locked: this.locked,
      colors: new Uint8Array(this.colors), banners: [...this.bannerMarkers.values()].map((b) => ({ ...b })),
    };
  }

  /** vanilla load: the scale kept to 0..4, the colours only when there are all of them */
  static load(d: SavedMapData): MapItemSavedData {
    const dim: DimensionId = d.dimension === 'the_nether' || d.dimension === 'the_end' ? d.dimension : 'overworld';
    const m = new MapItemSavedData(d.xCenter | 0, d.zCenter | 0, Math.max(0, Math.min(4, d.scale | 0)), d.trackingPosition !== false, !!d.unlimitedTracking, !!d.locked, dim);
    if (d.colors instanceof Uint8Array && d.colors.length === MAP_SIZE * MAP_SIZE) m.colors.set(d.colors);
    // (vanilla marks them again at the block's corner, not its middle)
    for (const b of d.banners ?? []) {
      if (!(BANNER_COLORS as readonly string[]).includes(b.color)) continue;
      const banner = { x: b.x | 0, y: b.y | 0, z: b.z | 0, color: b.color, name: typeof b.name === 'string' ? b.name : null };
      m.bannerMarkers.set(bannerId(banner), banner);
      m.addDecoration(`banner_${banner.color}` as DecorationType, null, bannerId(banner), banner.x, banner.z, 180, banner.name);
    }
    return m;
  }
}

/** (vanilla keys a player's marker by their name) */
function decorationId(p: Player): string {
  return `player:${(p as { uuid?: string }).uuid ?? 'local'}`;
}

/** vanilla Inventory.contains: the very stack is somewhere in the player's inventory */
function carries(p: Player, stack: ItemStack): boolean {
  const inv = p.inventory;
  return inv.main.includes(stack) || inv.armor.includes(stack) || inv.offhand === stack;
}

// ---------------------------------------------------------------------------
// The world's maps (vanilla the overworld's DimensionDataStorage, which every dimension shares)

export class MapStorage {
  private readonly maps = new Map<number, MapItemSavedData>();
  /** ids looked for in the save already (read, being read, or not there) */
  private readonly asked = new Set<number>();

  /** `worldId`: the save the maps are read from (null: kept in memory only); `lastId`: vanilla MapIndex's "map" */
  constructor(readonly worldId: string | null, public lastId: number) {}

  /** vanilla Level.getFreeMapId: the next id */
  freeMapId(): number {
    return ++this.lastId;
  }

  /** vanilla Level.getMapData: null for no such map, or while it's still being read from the save */
  get(id: number): MapItemSavedData | null {
    const d = this.maps.get(id);
    if (d) return d;
    if (this.worldId && id >= 0 && id <= this.lastId && !this.asked.has(id)) {
      this.asked.add(id);
      const world = this.worldId;
      void loadWorldData<SavedMapData>(world, `map_${id}`).then(
        (rec) => {
          if (rec && !this.maps.has(id)) this.maps.set(id, MapItemSavedData.load(rec));
        },
        () => this.asked.delete(id),
      );
    }
    return null;
  }

  /** vanilla Level.setMapData */
  set(id: number, data: MapItemSavedData): void {
    this.maps.set(id, data);
    data.dirty = true;
  }

  /** vanilla DimensionDataStorage.save: the maps changed since they were last written, and the last id */
  async save(m: WorldMeta): Promise<void> {
    if (!this.worldId || m.id !== this.worldId) return;
    m.lastMapId = this.lastId;
    const recs = [];
    for (const [id, d] of this.maps) {
      if (!d.dirty) continue;
      d.dirty = false;
      recs.push({ key: worldDataKey(this.worldId, `map_${id}`), data: d.save() });
    }
    await saveWorldData(recs);
  }
}

/** the game's world, for the maps: the level being played and the save it's from */
export interface MapWorld {
  level: Level;
  meta: { id: string; transient?: boolean; lastMapId?: number };
}
let worldSource: (() => MapWorld | null) | null = null;

/** where the game says what world is being played (gui/screens/jobSites.ts installs it) */
export function setMapWorldSource(f: (() => MapWorld | null) | null): void {
  worldSource = f;
}

const STORAGES = new WeakMap<Level, MapStorage>();
let lastStorage: MapStorage | null = null;

/** the maps of the world `level` belongs to */
export function mapStorage(level: Level): MapStorage {
  let s = STORAGES.get(level);
  if (!s) {
    const w = worldSource?.() ?? null;
    const meta = w && w.level === level ? w.meta : null;
    s = new MapStorage(meta && !meta.transient ? meta.id : null, meta?.lastMapId ?? -1);
    STORAGES.set(level, s);
  }
  lastStorage = s;
  return s;
}

/** the maps of the world being played (vanilla's client level: what tooltips and recipes look at) */
export function currentMapStorage(): MapStorage | null {
  const w = worldSource?.();
  return w ? mapStorage(w.level) : lastStorage;
}

// the maps are written whenever the world is (vanilla MinecraftServer.saveAllChunks → DimensionDataStorage.save)
onWorldMetaSave(async (m) => {
  const w = worldSource?.();
  const s = w && w.meta.id === m.id ? STORAGES.get(w.level) : null;
  if (s) await s.save(m);
});

/** (Stage 5: ocean) the world being played and its save, for what rolls a treasure map with no level at hand */
export function currentMapWorld(): MapWorld | null {
  return worldSource?.() ?? null;
}
