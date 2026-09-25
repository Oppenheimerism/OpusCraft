// Where a player comes (back) into the Overworld: vanilla PlayerRespawnLogic (over the first block with a full top
// at or under a column's motion-blocking height, never where the surface is water) and ServerPlayer.adjustSpawnLocation
// (the first such spot within the spawnRadius gamerule of the world spawn that a standing player fits in, clear of
// blocks and fluids, else straight up from the spawn until they fit and back down while there's room below); and where
// a new world's spawn is (vanilla MinecraftServer.setInitialSpawn: the first chunk with such a spot in a spiral round
// the one the climate points to).
//
// Nothing is decided until every column it looks at is in a loaded chunk whose neighbours are loaded too (so what
// generation put across chunk borders, a neighbour's tree or house, is there): till then the answer is WAIT, and the
// Game holds the player still on "Loading terrain..." where the chunks are wanted.

import type { Level } from './level';
import type { Entity } from '../entity/entity';
import type { Game } from './game';
import type { World } from '../world/world';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_LAVA, F_FULL_COLLISION, COLLISION } from '../world/block';
import { MIN_Y, MAX_Y, SEA_LEVEL } from '../world/constants';
import { isSolidBlock } from '../world/gen/patches';
import { AABB } from '../core/aabb';
import { findRespawn, MSG } from './sleep';
import { SpawnFinder } from '../world/gen/spawnFinder';

export type Pos = [number, number, number];

/** not decided yet: a chunk it has to look in (or a neighbour of one) isn't loaded */
export const WAIT = 'wait';

/** vanilla WorldBorder: the Overworld's edges, 29999984 blocks out from the origin each way */
const BORDER = 29999984;

/** vanilla BlockBehaviour.blocksMotion: solid, cobwebs and bamboo shoots aside */
function blocksMotion(st: number): boolean {
  if (!isSolidBlock(st)) return false;
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return n !== 'cobweb' && n !== 'bamboo_sapling';
}

/** vanilla Heightmap.Types.OCEAN_FLOOR: above the highest block that stops movement (fluids don't) */
function oceanFloorHeight(level: Level, x: number, z: number): number {
  const w = level.world;
  for (let y = w.heightAt(x, z) - 1; y >= MIN_Y; y--) if (blocksMotion(w.getState(x, y, z))) return y + 1;
  return MIN_Y;
}

/** vanilla Heightmap.Types.WORLD_SURFACE: above the highest block that isn't air */
function worldSurfaceHeight(level: Level, x: number, z: number): number {
  const c = level.world.getChunk(x >> 4, z >> 4);
  if (!c) return MIN_Y;
  for (let s = c.blocks.length - 1; s >= 0; s--) {
    if (!c.blocks[s] || !c.nonAir[s]) continue;
    for (let y = MIN_Y + s * 16 + 15; y >= MIN_Y + s * 16; y--) if (!(FLAGS[c.getState(x & 15, y, z & 15)] & F_AIR)) return y + 1;
  }
  return MIN_Y;
}

const fullTop = new Map<number, boolean>();

/** vanilla Block.isFaceFull(collision shape, UP): the block's collision covers the whole of its top */
function topFaceFull(st: number): boolean {
  if (FLAGS[st] & F_FULL_COLLISION) return true;
  const boxes = COLLISION[st];
  if (!boxes || !boxes.length) return false;
  let full = fullTop.get(st);
  if (full === undefined) {
    // (checked on a grid of sixteenths, which every shape is made of)
    full = true;
    for (let i = 0; i < 16 && full; i++)
      for (let j = 0; j < 16 && full; j++) {
        const px = (i + 0.5) / 16, pz = (j + 0.5) / 16;
        full = boxes.some((b) => b[4] >= 1 - 1e-6 && b[0] <= px && b[3] >= px && b[2] <= pz && b[5] >= pz);
      }
    fullTop.set(st, full);
  }
  return full;
}

/**
 * vanilla PlayerRespawnLogic.getOverworldRespawnPos: over the first block with a full top at or below the column's
 * motion-blocking height, looking no further down than a fluid, and none where the surface is water (WORLD_SURFACE
 * at or under MOTION_BLOCKING and above OCEAN_FLOOR)
 */
export function overworldRespawnPos(level: Level, x: number, z: number): Pos | null {
  const w = level.world;
  const i = level.motionBlockingHeight(x, z);
  if (i < MIN_Y) return null;
  // (the world surface is never under the motion-blocking height, so it's only needed where a fluid is on top)
  if (oceanFloorHeight(level, x, z) < i && worldSurfaceHeight(level, x, z) <= i) return null;
  for (let k = i + 1; k >= MIN_Y; k--) {
    const st = w.getState(x, k, z);
    if (FLAGS[st] & (F_WATER | F_LAVA)) break;
    if (topFaceFull(st)) return [x, k + 1, z];
  }
  return null;
}

/** vanilla PlayerRespawnLogic.getSpawnPosInChunk: the first column (x, then z, ascending) with a respawn spot */
export function spawnPosInChunk(level: Level, cx: number, cz: number): Pos | null {
  for (let x = cx * 16; x < cx * 16 + 16; x++)
    for (let z = cz * 16; z < cz * 16 + 16; z++) {
      const p = overworldRespawnPos(level, x, z);
      if (p) return p;
    }
  return null;
}

/**
 * vanilla MinecraftServer.setInitialSpawn: from the chunk the climate points to (world/gen/spawnFinder), round an
 * 11 x 11 spiral of chunks for the first with a respawn spot (spawnPosInChunk); failing that, the first chunk's middle
 * just over sea level (vanilla getSpawnHeight). Looked for as the chunks come in: next() is WAIT, with `need` the
 * chunk it has come to, while that one or a neighbour of it isn't loaded.
 */
export class InitialSpawn {
  /** the chunk the climate points to */
  readonly cx: number;
  readonly cz: number;
  readonly need: [number, number] = [0, 0];
  private i = 0;
  private dx = 0;
  private dz = 0;
  private stepX = 0;
  private stepZ = -1;

  constructor(seed: string) {
    const [x, z] = new SpawnFinder(seed).find();
    this.cx = x >> 4;
    this.cz = z >> 4;
  }

  next(level: Level): Pos | typeof WAIT {
    for (; this.i < 11 * 11; this.i++) {
      if (this.dx >= -5 && this.dx <= 5 && this.dz >= -5 && this.dz <= 5) {
        const cx = this.cx + this.dx, cz = this.cz + this.dz;
        if (!areaComplete(level.world, cx * 16, cz * 16, cx * 16 + 15, cz * 16 + 15)) {
          this.need[0] = cx;
          this.need[1] = cz;
          return WAIT;
        }
        const p = spawnPosInChunk(level, cx, cz);
        if (p) return p;
      }
      // (turning at the corners)
      if (this.dx === this.dz || (this.dx < 0 && this.dx === -this.dz) || (this.dx > 0 && this.dx === 1 - this.dz)) {
        const t = this.stepX;
        this.stepX = -this.stepZ;
        this.stepZ = t;
      }
      this.dx += this.stepX;
      this.dz += this.stepZ;
    }
    return [this.cx * 16 + 8, SEA_LEVEL + 1, this.cz * 16 + 8];
  }
}

/** every chunk under the blocks (x0, z0)..(x1, z1) is loaded, and so is each one's every neighbour */
export function areaComplete(world: World, x0: number, z0: number, x1: number, z1: number): boolean {
  for (let cx = (x0 >> 4) - 1; cx <= (x1 >> 4) + 1; cx++)
    for (let cz = (z0 >> 4) - 1; cz <= (z1 >> 4) + 1; cz++) if (!world.getChunk(cx, cz)) return false;
  return true;
}

/**
 * vanilla adjustSpawnLocation's radius: the spawnRadius gamerule, no further than the world border (and at least 1
 * right by it); none in a world whose game mode is adventure
 */
export function spawnRadius(level: Level, x: number, z: number, adventure: boolean): number {
  if (adventure) return 0;
  let i = Math.max(0, Math.floor(Number(level.gameRules.spawnRadius)));
  const j = Math.floor(Math.min(x + BORDER, BORDER - x, z + BORDER, BORDER - z));
  if (j < i) i = j;
  if (j <= 1) i = 1;
  return i;
}

/**
 * vanilla ServerPlayer.adjustSpawnLocation round the world spawn (x, y, z): unless the world is adventure, the columns
 * within the spawn radius in a random order (a random start, stepping by a number coprime to their count: vanilla
 * getCoprime), taking the first respawn spot (overworldRespawnPos) where a standing player's box has no collision and
 * no fluid; failing that, up from the spawn until the box is free, then down while it's free below. WAIT while a
 * chunk it would look in, or a neighbour of one, isn't loaded.
 */
export function adjustSpawnLocation(level: Level, p: Entity, x: number, y: number, z: number, adventure: boolean): Pos | typeof WAIT {
  const r = spawnRadius(level, x, z, adventure);
  // (the box's collision is looked for a block round it: a fence's reaches up from the block below)
  if (!areaComplete(level.world, x - r - 1, z - r - 1, x + r + 1, z + r + 1)) return WAIT;
  // vanilla noCollisionNoLiquid, for the standing box (0.6 x 1.8) at the block's bottom centre
  const free = (bx: number, by: number, bz: number) => p.isFree(new AABB(bx + 0.2, by, bz + 0.2, bx + 0.8, by + 1.8, bz + 0.8));
  if (!adventure) {
    const side = r * 2 + 1, n = side * side;
    const step = n <= 16 ? n - 1 : 17;
    const start = Math.floor(Math.random() * n);
    for (let l = 0; l < n; l++) {
      const i = (start + step * l) % n;
      const pos = overworldRespawnPos(level, x + (i % side) - r, z + Math.floor(i / side) - r);
      if (pos && free(pos[0], pos[1], pos[2])) return pos;
    }
  }
  let by = y;
  while (!free(x, by, z) && by < MAX_Y - 1) by++;
  while (free(x, by - 1, z) && by > MIN_Y + 1) by--;
  return [x, by, z];
}

/** the world spawn: /setworldspawn's, or the one found when the world was made (older worlds keep it on the player) */
export function worldSpawnOf(g: Pick<Game, 'worldSpawn' | 'player'>): Pos {
  return g.worldSpawn ?? [g.player.spawnX, g.player.spawnY, g.player.spawnZ];
}

/** what respawning needs of the game */
export type RespawnHost = Pick<Game, 'level' | 'player' | 'chunks' | 'worldSpawn' | 'meta' | 'teleport' | 'chat'>;

/**
 * vanilla ServerPlayer.findRespawnPositionAndUseSpawnBlock, as the Game's arrival (called once the chunks round the
 * player are in): the bed, facing it, or the /spawnpoint, if it's still there and clear (sleep.findRespawn), else near
 * the world spawn (adjustSpawnLocation). False while that isn't decided yet, the player moved to the world spawn to wait
 * for the chunks round it, with a ticket keeping those a wide spawnRadius reaches loaded. `forget`: a bed that's gone
 * is forgotten (PlayerList.respawn), not kept (going home through the End's exit portal alive)
 */
export function respawnArrival(forget = true): (g: RespawnHost) => boolean {
  let bedChecked = false;
  return (g) => {
    const p = g.player;
    if (!bedChecked) {
      bedChecked = true;
      const at = findRespawn(g.level, p);
      if (at) {
        g.teleport(at.x, at.y, at.z, at.yaw, 0);
        return true;
      }
      // (vanilla DimensionTransition.missingRespawnBlock: told so)
      if (p.respawnPos) {
        g.chat(MSG.noRespawnBlock);
        if (forget) p.respawnPos = null;
      }
    }
    const [x, y, z] = worldSpawnOf(g);
    const pos = adjustSpawnLocation(g.level, p, x, y, z, g.meta?.gameMode === 'adventure');
    if (pos === WAIT) {
      const r = spawnRadius(g.level, x, z, g.meta?.gameMode === 'adventure');
      g.chunks.setTicket('respawn', [x >> 4, z >> 4, ((r + 16) >> 4) + 1]);
      p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
      g.chunks.setCenter(p.x, p.z);
      return false;
    }
    g.chunks.setTicket('respawn', null);
    g.teleport(pos[0] + 0.5, pos[1], pos[2] + 0.5, 0, 0);
    return true;
  };
}
