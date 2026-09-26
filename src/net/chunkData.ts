// Chunks and block entities as the packets carry them: what the host sends (only what can be seen: a chest's lid,
// not what's in it) and how a guest takes it in (checked, since it came from another game).

import type { Value } from './codec';
import { CB } from './protocol';
import type { World } from '../world/world';
import type { Chunk } from '../world/chunk';
import { BlockEntity, loadBlockEntity, type SavedBlockEntity } from '../world/blockEntity';
import { MIN_Y, MAX_Y, SECTIONS, NO_CAVE_BIOME } from '../world/constants';
import { stateCount } from '../world/block';
import { BIOMES } from '../world/gen/biomes';

/** block entities whose contents don't show (vanilla sends a chest's items only to whoever opens it) */
const HIDDEN_CONTENTS = /(^|_)(chest|barrel|shulker_box|furnace|smoker|hopper|dispenser|dropper|brewing_stand|crafter)$/;

/** what of `be` a guest needs to draw it (vanilla BlockEntity.getUpdateTag): its data, and its items if they show */
export function visibleBlockEntity(be: BlockEntity): Record<string, Value> {
  const s = be.save();
  const out: Record<string, Value> = { id: s.id, x: s.x, y: s.y, z: s.z, items: HIDDEN_CONTENTS.test(s.id) ? [] : (s.items as unknown as Value[]) };
  if (s.data) {
    // (a loot chest's table is the host's secret: a guest's copy has no data, as a chest without one saves)
    const data: Record<string, Value> = {};
    for (const [k, v] of Object.entries(s.data)) if (k !== 'lootTable' && k !== 'lootSeed') data[k] = v;
    if (Object.keys(data).length) out.data = data;
  }
  return out;
}

/** CB.LevelChunk for `c` (vanilla ClientboundLevelChunkWithLightPacket, less the light: the guest works that out) */
export function levelChunkPacket(world: World, c: Chunk): Value[] {
  const sections: Value[] = [];
  for (let s = 0; s < SECTIONS; s++) {
    const b = c.blocks[s];
    sections.push(b && c.nonAir[s] > 0 ? b : null);
  }
  return [CB.LevelChunk, c.cx, c.cz, sections, c.biomes, c.caveBiomes, world.chunkBlockEntities(c.cx, c.cz).map(visibleBlockEntity)];
}

/** a column of blocks from CB.LevelChunk's sections, or null if a state doesn't exist here */
export function columnFromSections(sections: (Uint16Array | null)[]): Uint16Array | null {
  const n = stateCount();
  const out = new Uint16Array(SECTIONS * 4096);
  for (let s = 0; s < SECTIONS; s++) {
    const b = sections[s];
    if (!b) continue;
    for (let i = 0; i < 4096; i++) if (b[i] >= n) return null;
    out.set(b, s * 4096);
  }
  return out;
}

/** whether biome ids (and underground ones, where 255 is "the surface's") are all real */
export function biomesOk(biomes: Uint8Array, cave: Uint8Array | null): boolean {
  const n = BIOMES.length;
  for (let i = 0; i < biomes.length; i++) if (biomes[i] >= n) return false;
  if (cave) for (let i = 0; i < cave.length; i++) if (cave[i] >= n && cave[i] !== NO_CAVE_BIOME) return false;
  return true;
}

const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** `v` as a block entity record the game can load, if it has the shape of one (inside chunk cx, cz when given) */
export function savedBlockEntity(v: Value, cx?: number, cz?: number): SavedBlockEntity | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || ArrayBuffer.isView(v)) return null;
  const o = v as Record<string, Value>;
  if (typeof o.id !== 'string' || o.id.length > 64 || !int(o.x, -30_000_000, 30_000_000) || !int(o.y, MIN_Y, MAX_Y - 1) || !int(o.z, -30_000_000, 30_000_000)) return null;
  if (cx !== undefined && ((o.x as number) >> 4 !== cx || (o.z as number) >> 4 !== cz)) return null;
  if (!Array.isArray(o.items) || o.items.length > 64) return null;
  for (const it of o.items)
    if (!Array.isArray(it) || it.length < 4 || it.length > 5 || !int(it[0], 0, 63) || typeof it[1] !== 'string' || !int(it[2], 1, 127) || !int(it[3], 0, 65535) || (it.length === 5 && (typeof it[4] !== 'object' || it[4] === null)))
      return null;
  if (o.data !== undefined) {
    if (typeof o.data !== 'object' || o.data === null || Array.isArray(o.data) || ArrayBuffer.isView(o.data)) return null;
    for (const d of Object.values(o.data)) if (typeof d !== 'number' && !(typeof d === 'string' && d.length <= 65536)) return null;
  }
  return o as unknown as SavedBlockEntity;
}

/** a block entity from the host, made as the game makes its own from a save (null if the game can't) */
export function blockEntityFromHost(d: SavedBlockEntity): BlockEntity | null {
  try {
    return loadBlockEntity(d);
  } catch {
    return null;
  }
}
