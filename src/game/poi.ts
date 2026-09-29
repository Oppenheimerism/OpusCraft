// Points of interest (vanilla PoiManager / PoiTypes): the beds, workstations and bells villagers claim. Each chunk's
// are found the first time something asks about them and kept up to date as blocks change; a point has a number of
// tickets (a bed or a workstation one, a bell 32) and a villager takes one when it claims the place. (Vanilla saves
// the tickets with the points; here each ticket names its holder, a holder gone from the world holds nothing, and a
// villager takes its tickets again when it's loaded.)

import { BLOCKS, STATE_BLOCK } from '../world/block';
import type { World } from '../world/world';
import type { Chunk } from '../world/chunk';
import { MIN_Y } from '../world/constants';

/** vanilla PoiTypes: a profession's job site, a home (bed) or the meeting point (bell) */
export type PoiKind =
  | 'armorer' | 'butcher' | 'cartographer' | 'cleric' | 'farmer' | 'fisherman' | 'fletcher' | 'leatherworker' | 'librarian' | 'mason'
  | 'shepherd' | 'toolsmith' | 'weaponsmith' | 'home' | 'meeting'
  // (trial chambers) where lightning strikes (vanilla PoiTypes.LIGHTNING_ROD: no tickets)
  | 'lightning_rod'
  // (remaining mobs: the bee) the bees' homes (vanilla PoiTypes.BEE_NEST and BEEHIVE, #bee_home: no tickets)
  | 'bee_nest' | 'beehive';

/** vanilla PoiTypes: which blocks are which point */
const BY_BLOCK: Record<string, PoiKind> = {
  blast_furnace: 'armorer', smoker: 'butcher', cartography_table: 'cartographer', brewing_stand: 'cleric', composter: 'farmer', barrel: 'fisherman',
  fletching_table: 'fletcher', cauldron: 'leatherworker', water_cauldron: 'leatherworker', lava_cauldron: 'leatherworker', powder_snow_cauldron: 'leatherworker',
  lectern: 'librarian', stonecutter: 'mason', loom: 'shepherd', smithing_table: 'toolsmith', grindstone: 'weaponsmith', bell: 'meeting',
  lightning_rod: 'lightning_rod',
  // (remaining mobs: the bee)
  bee_nest: 'bee_nest', beehive: 'beehive',
};

const KINDS: PoiKind[] = ['armorer', 'butcher', 'cartographer', 'cleric', 'farmer', 'fisherman', 'fletcher', 'leatherworker', 'librarian', 'mason', 'shepherd', 'toolsmith', 'weaponsmith', 'home', 'meeting', 'lightning_rod', 'bee_nest', 'beehive'];

let KIND_OF_STATE: Uint8Array | null = null;

/** the point a block state is (vanilla PoiTypes.forState): 0 none, else 1 + its index in KINDS (a bed only at its head) */
function kindIndex(st: number): number {
  if (!KIND_OF_STATE) {
    KIND_OF_STATE = new Uint8Array(STATE_BLOCK.length);
    for (let s = 0; s < STATE_BLOCK.length; s++) {
      const b = BLOCKS[STATE_BLOCK[s]];
      const k = b.name.endsWith('_bed') ? (b.get(s, 'part') === 'head' ? 'home' : null) : BY_BLOCK[b.name] ?? null;
      KIND_OF_STATE[s] = k ? KINDS.indexOf(k) + 1 : 0;
    }
  }
  return KIND_OF_STATE[st];
}

export function poiKindOf(st: number): PoiKind | null {
  const i = kindIndex(st);
  return i ? KINDS[i - 1] : null;
}

/** vanilla PoiType.maxTickets */
function maxTickets(k: PoiKind): number {
  return k === 'meeting' ? 32 : k === 'lightning_rod' || k === 'bee_nest' || k === 'beehive' ? 0 : 1;
}

const posKey = (x: number, y: number, z: number): string => x + ',' + y + ',' + z;

/** whoever holds a ticket: gone from the world, it holds none */
export interface PoiHolder {
  readonly removed: boolean;
}

export class PoiManager {
  /** each loaded chunk's points: position key → [x, y, z, kind] */
  private readonly byChunk = new WeakMap<Chunk, Map<string, [number, number, number, PoiKind]>>();
  /** tickets taken, by position: who holds them */
  private readonly taken = new Map<string, Set<PoiHolder>>();

  constructor(private readonly world: World) {}

  private chunkPois(c: Chunk): Map<string, [number, number, number, PoiKind]> {
    let m = this.byChunk.get(c);
    if (m) return m;
    m = new Map();
    for (let si = 0; si < c.blocks.length; si++) {
      const sec = c.blocks[si];
      if (!sec || !c.nonAir[si]) continue;
      for (let i = 0; i < 4096; i++) {
        const k = kindIndex(sec[i]);
        if (!k) continue;
        const x = c.cx * 16 + (i & 15), z = c.cz * 16 + ((i >> 4) & 15), y = MIN_Y + si * 16 + (i >> 8);
        m.set(posKey(x, y, z), [x, y, z, KINDS[k - 1]]);
      }
    }
    this.byChunk.set(c, m);
    return m;
  }

  /** a block changed kind (World.onTypeChanged) */
  changed(x: number, y: number, z: number, old: number, now: number): void {
    const ko = kindIndex(old), kn = kindIndex(now);
    if (!ko && !kn) return;
    const c = this.world.getChunk(x >> 4, z >> 4);
    const m = c && this.byChunk.get(c);
    const k = posKey(x, y, z);
    if (m) {
      if (kn) m.set(k, [x, y, z, KINDS[kn - 1]]);
      else m.delete(k);
    }
    // (vanilla PoiManager.remove: the claims on a point go with it)
    if (!kn || KINDS[kn - 1] !== KINDS[ko - 1]) this.taken.delete(k);
  }

  /** what point is at (x, y, z), if any */
  kindAt(x: number, y: number, z: number): PoiKind | null {
    return poiKindOf(this.world.getState(x, y, z));
  }

  /** vanilla PoiManager.exists: a point of a wanted kind is there */
  exists(x: number, y: number, z: number, want: (k: PoiKind) => boolean): boolean {
    const k = this.kindAt(x, y, z);
    return !!k && want(k);
  }

  /** the tickets of a point still held (a holder that's left the world lets go) */
  private held(k: string): number {
    const s = this.taken.get(k);
    if (!s) return 0;
    for (const o of s) if (o.removed) s.delete(o);
    if (!s.size) this.taken.delete(k);
    return s.size;
  }

  /** vanilla PoiRecord.isOccupied: someone holds one of its tickets */
  isOccupied(x: number, y: number, z: number): boolean {
    return this.held(posKey(x, y, z)) > 0;
  }

  hasSpace(x: number, y: number, z: number): boolean {
    const k = this.kindAt(x, y, z);
    return !!k && this.held(posKey(x, y, z)) < maxTickets(k);
  }

  /** vanilla PoiManager.take: claim a ticket (false if it's all taken or not a point at all) */
  take(x: number, y: number, z: number, holder: PoiHolder): boolean {
    if (!this.hasSpace(x, y, z)) return false;
    const k = posKey(x, y, z);
    let s = this.taken.get(k);
    if (!s) this.taken.set(k, (s = new Set()));
    s.add(holder);
    return true;
  }

  /** vanilla PoiManager.release */
  release(x: number, y: number, z: number, holder: PoiHolder): void {
    const k = posKey(x, y, z);
    const s = this.taken.get(k);
    if (!s) return;
    s.delete(holder);
    if (!s.size) this.taken.delete(k);
  }

  /**
   * the village centres (vanilla PoiManager.isVillageCenter: sections holding a village point someone has claimed, a
   * bed, a workstation or a bell), as sections (x, y, z), in the chunks within `r` of a chunk
   */
  villageSectionsNear(cx0: number, cz0: number, r: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    const seen = new Set<string>();
    for (let cx = cx0 - r; cx <= cx0 + r; cx++)
      for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
        const c = this.world.getChunk(cx, cz);
        if (!c) continue;
        for (const p of this.chunkPois(c).values()) {
          const k = cx + ',' + (p[1] >> 4) + ',' + cz;
          if (seen.has(k) || !this.isOccupied(p[0], p[1], p[2])) continue;
          seen.add(k);
          out.push([cx, p[1] >> 4, cz]);
        }
      }
    return out;
  }

  /**
   * vanilla PoiManager.sectionsToVillage: how many sections (diagonals counting one) this section is from a village
   * centre, 0 to 6, or 7 when it's further than that
   */
  sectionsToVillage(sx: number, sy: number, sz: number): number {
    let best = 7;
    for (const [x, y, z] of this.villageSectionsNear(sx, sz, 6)) best = Math.min(best, Math.max(Math.abs(x - sx), Math.abs(y - sy), Math.abs(z - sz)));
    return best;
  }

  /** vanilla ServerLevel.isVillage: within a section of a village point */
  isVillage(x: number, y: number, z: number): boolean {
    const sy = y >> 4;
    return this.villageSectionsNear(x >> 4, z >> 4, 1).some((s) => Math.abs(s[1] - sy) <= 1);
  }

  /**
   * vanilla PoiManager.findAllClosestFirstWithType: the points of the wanted kinds within `radius` (a sphere around
   * the block), nearest first; `free` keeps only those with a ticket left
   */
  findAll(x: number, y: number, z: number, radius: number, want: (k: PoiKind) => boolean, free: boolean): [number, number, number, PoiKind][] {
    const out: [number, number, number, PoiKind, number][] = [];
    const r2 = radius * radius;
    const c0x = (x - radius) >> 4, c1x = (x + radius) >> 4, c0z = (z - radius) >> 4, c1z = (z + radius) >> 4;
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        const c = this.world.getChunk(cx, cz);
        if (!c) continue;
        for (const p of this.chunkPois(c).values()) {
          const d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;
          if (d > r2 || !want(p[3]) || (free && !this.hasSpace(p[0], p[1], p[2]))) continue;
          out.push([p[0], p[1], p[2], p[3], d]);
        }
      }
    out.sort((a, b) => a[4] - b[4]);
    return out.map(([px, py, pz, k]) => [px, py, pz, k]);
  }
}
