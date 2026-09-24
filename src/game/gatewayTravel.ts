// Through an end gateway (vanilla EndGatewayBlock and TheEndGatewayBlockEntity).
//
// Anything alive and not riding that touches a gateway goes through at once, unless the gateway is still cooling
// down from the last one (two seconds, its purple beam). The first time, a gateway on the main island's ring works
// out where it leads: out along its own line from 0,0 to 1024 blocks, back past chunks with anything in them (up
// to 16 steps of 16 blocks), then on past empty ones (up to 16 more), and in the chunk it settles on, onto the end
// stone with room over it nearest the world's middle — or, where there's none, onto a new little island made at
// y 75. Ten blocks over the highest ground within 16 of that spot, a new gateway opens that leads back. Whatever
// comes through stands on the highest ground within 5 blocks of the gateway it comes out of (never on bedrock,
// never in that gateway's own column); an ender pearl comes out falling, anything else as it was moving.
//
// Vanilla loads what it needs over there on the spot. Here the chunks are asked for (chunk tickets, like the
// dragon fight's) and the traveller is held where it went in, not ticking, until they're in: a moment, the first
// time a gateway is used, before it goes. The far side then stays loaded a while (vanilla's portal ticket, 15
// seconds), so a pearl lands and whatever came through settles.

import { BLOCKS, STATE_BLOCK, COLLISION, S } from '../world/block';
import { MIN_Y, SECTIONS } from '../world/constants';
import { THE_END } from '../world/dimension';
import { EndGatewayBlockEntity } from '../world/blockEntity';
import type { Chunk } from '../world/chunk';
import { LegacyRandom } from '../world/gen/legacyRandom';
import type { Entity } from '../entity/entity';
import type { Level } from './level';
import { registerBehavior } from './blockBehavior';
import { placeEndGateway } from './endGateway';

/** chunks that have to be loaded before the way out can be worked out */
type Need = [number, number][];
/** where a traveller comes out (the bottom centre of a block), or what's still needed to know */
type Destination = { at: [number, number, number] } | { need: Need } | null;

/** vanilla isCollisionShapeFullBlock, per state (lazily) */
let FULL: Uint8Array | null = null;
function fullCube(st: number): boolean {
  if (!FULL) {
    FULL = new Uint8Array(COLLISION.length);
    COLLISION.forEach((c, i) => {
      const b = c && c.length === 1 ? c[0] : null;
      FULL![i] = b && b[0] <= 0 && b[1] <= 0 && b[2] <= 0 && b[3] >= 1 && b[4] >= 1 && b[5] >= 1 ? 1 : 0;
    });
  }
  return FULL[st] === 1;
}

const blockName = (st: number): string => BLOCKS[STATE_BLOCK[st]].name;

/** vanilla ChunkAccess.getHighestFilledSectionIndex, as the bottom y of that section (null: nothing in the chunk) */
function highestSection(c: Chunk): number | null {
  for (let s = SECTIONS - 1; s >= 0; s--) if (c.nonAir[s] > 0) return MIN_Y + s * 16;
  return null;
}

/** vanilla BlockPos.asLong */
function asLong(x: number, y: number, z: number): bigint {
  return BigInt.asIntN(64, (BigInt(x & 0x3ffffff) << 38n) | (BigInt(z & 0x3ffffff) << 12n) | BigInt(y & 0xfff));
}

/**
 * vanilla findExitPortalXZPosTentative: 1024 out along the gateway's line from 0,0, back past chunks that have
 * anything in them, then on past empty ones. Where it has to look at a chunk that isn't loaded, the chunks it may
 * look at next (that one and a few more along its way).
 */
function tentativeExit(level: Level, x: number, z: number): [number, number] | { need: Need } {
  const len = Math.sqrt(x * x + z * z);
  const vx = len < 1e-4 ? 0 : x / len, vz = len < 1e-4 ? 0 : z / len;
  let px = vx * 1024, pz = vz * 1024;
  for (const [step, whileEmpty] of [[-16, false], [16, true]] as const) {
    let j = 16;
    for (;;) {
      const c = level.world.getChunk(Math.floor(px / 16), Math.floor(pz / 16));
      if (!c) {
        const need: Need = [];
        let qx = px, qz = pz;
        for (let i = 0; i <= Math.min(j, 3); i++, qx += vx * step, qz += vz * step) {
          const cx = Math.floor(qx / 16), cz = Math.floor(qz / 16);
          if (!need.some(([a, b]) => a === cx && b === cz)) need.push([cx, cz]);
        }
        return { need };
      }
      if ((highestSection(c) === null) !== whileEmpty) break;
      if (j-- <= 0) break;
      px += vx * step;
      pz += vz * step;
    }
  }
  return [px, pz];
}

/** vanilla findValidSpawnInChunk: end stone with two blocks of room over it, the one nearest 0,0,0 */
function validSpawnInChunk(level: Level, c: Chunk): [number, number, number] | null {
  const x0 = c.cx * 16, z0 = c.cz * 16;
  // (from y 30 to the top of the highest section with anything in it, whichever way round those are)
  const top = (highestSection(c) ?? level.world.dim.minY) + 16 - 1;
  const y0 = Math.min(30, top), y1 = Math.max(30, top);
  const END_STONE = S('end_stone');
  let best: [number, number, number] | null = null, bestD = 0;
  // (vanilla BlockPos.betweenClosed: x fastest, then y, then z)
  for (let z = z0; z <= z0 + 15; z++)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x0 + 15; x++) {
        if (c.getState(x - x0, y, z - z0) !== END_STONE) continue;
        if (fullCube(c.getState(x - x0, y + 1, z - z0)) || fullCube(c.getState(x - x0, y + 2, z - z0))) continue;
        const d = (x + 0.5) ** 2 + (y + 0.5) ** 2 + (z + 0.5) ** 2;
        if (!best || d < bestD) {
          best = [x, y, z];
          bestD = d;
        }
      }
  return best;
}

/**
 * vanilla findTallestBlock: the highest block with a full collision box within `radius` (a square) of (x, z) —
 * bedrock and the middle column only if `allowBedrock` — or (x, y, z) itself if there's none
 */
function tallestBlock(level: Level, x: number, y: number, z: number, radius: number, allowBedrock: boolean): [number, number, number] {
  const w = level.world;
  let best: [number, number, number] | null = null;
  for (let i = -radius; i <= radius; i++)
    for (let j = -radius; j <= radius; j++) {
      if (i === 0 && j === 0 && !allowBedrock) continue;
      for (let k = w.dim.maxY - 1; k > (best ? best[1] : w.dim.minY); k--) {
        const st = w.getState(x + i, k, z + j);
        if (fullCube(st) && (allowBedrock || blockName(st) !== 'bedrock')) {
          best = [x + i, k, z + j];
          break;
        }
      }
    }
  return best ?? [x, y, z];
}

/** vanilla EndIslandFeature: a little upside-down cone of end stone, 4 to 6 blocks in radius at its top (vanilla's dice) */
function endIsland(level: Level, x: number, y: number, z: number): void {
  const fr = Math.fround;
  const END_STONE = S('end_stone');
  // (vanilla RandomSource.create(pos.asLong()))
  const r = new LegacyRandom(asLong(x, y, z));
  let f = fr(r.nextInt(3) + 4);
  for (let i = 0; f > 0.5; i--) {
    for (let j = Math.floor(-f); j <= Math.ceil(f); j++)
      for (let k = Math.floor(-f); k <= Math.ceil(f); k++) if (fr(j * j + k * k) <= fr(fr(f + 1) * fr(f + 1))) level.setBlock(x + j, y + i, z + k, END_STONE);
    f = fr(f - fr(r.nextInt(2) + 0.5));
  }
}

/** the chunks from (x0, z0) to (x1, z1) in blocks that aren't loaded */
function missing(level: Level, x0: number, z0: number, x1: number, z1: number): Need {
  const out: Need = [];
  for (let cz = z0 >> 4; cz <= z1 >> 4; cz++) for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) if (!level.world.getChunk(cx, cz)) out.push([cx, cz]);
  return out;
}

/**
 * vanilla TheEndGatewayBlockEntity.getPortalPosition: in the End a gateway that doesn't lead anywhere yet finds its
 * way out (findOrCreateValidTeleportPos) and opens the gateway back ten blocks over it; then the spot by its exit
 * (findExitPosition: on the highest ground within 5 blocks), or the exit itself for an exact one
 */
function portalPosition(level: Level, be: EndGatewayBlockEntity): Destination {
  if (!be.exitPortal && level.world.dim === THE_END) {
    const t = tentativeExit(level, be.x, be.z);
    if (!Array.isArray(t)) return t;
    const [px, pz] = t;
    // (everything from here to the new gateway happens at once: all of it round the chunk settled on first loaded)
    const cx = Math.floor(px / 16), cz = Math.floor(pz / 16);
    const need = missing(level, (cx - 2) * 16, (cz - 2) * 16, (cx + 2) * 16, (cz + 2) * 16);
    if (need.length) return { need };
    let spawn = validSpawnInChunk(level, level.world.getChunk(cx, cz)!);
    if (!spawn) {
      spawn = [Math.floor(px + 0.5), 75, Math.floor(pz + 0.5)];
      endIsland(level, spawn[0], spawn[1], spawn[2]);
    }
    const [gx, gy, gz] = tallestBlock(level, spawn[0], spawn[1], spawn[2], 16, true);
    // (vanilla EndGatewayConfiguration.knownExit(pos, false): the new one leads back here)
    placeEndGateway(level, gx, gy + 10, gz, [be.x, be.y, be.z], false);
    be.exitPortal = [gx, gy + 10, gz];
    const c = level.world.getChunk(be.x >> 4, be.z >> 4);
    if (c) c.modified = true;
  }
  if (!be.exitPortal) return null;
  const [ex, ey, ez] = be.exitPortal;
  if (be.exactTeleport) {
    const need = missing(level, ex, ez, ex, ez);
    return need.length ? { need } : { at: [ex + 0.5, ey, ez + 0.5] };
  }
  const need = missing(level, ex - 5, ez - 5, ex + 5, ez + 5);
  if (need.length) return { need };
  const [tx, ty, tz] = tallestBlock(level, ex, ey + 2, ez, 5, false);
  return { at: [tx + 0.5, ty + 1, tz + 0.5] };
}

/** the chunks a gateway is waiting on, kept loaded a second at a time (they lapse if it stops asking) */
function holdChunks(level: Level, key: string, need: Need): void {
  releaseChunks(level, key);
  need.forEach(([cx, cz], i) => level.tickets.set(`${key} ${i}`, { cx, cz, load: 0, ticking: -1, until: level.gameTime + 20 }));
}

function releaseChunks(level: Level, key: string): void {
  for (const k of [...level.tickets.keys()]) if (k.startsWith(key + ' ')) level.tickets.delete(k);
}

/**
 * vanilla Entity.handlePortal → EndGatewayBlock.getPortalDestination → Entity.changeDimension within the level:
 * `e`'s time in the gateway at (x, y, z) came up
 */
export function gatewayTravel(level: Level, e: Entity, x: number, y: number, z: number): void {
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof EndGatewayBlockEntity)) return;
  // vanilla calculateExitMovement: an ender pearl comes out falling straight down, anything else as it went in
  const pearl = e.type === 'ender_pearl';
  const vx = pearl ? 0 : e.dx, vy = pearl ? -1 : e.dy, vz = pearl ? 0 : e.dz;
  const since = level.gameTime;
  const key = `gateway ${x} ${y} ${z}`;
  const go = (): boolean => {
    const d = be.removed ? null : portalPosition(level, be);
    if (d && 'need' in d) {
      // (given up after half a minute of waiting: it stays where it went in)
      if (level.gameTime - since > 600) {
        releaseChunks(level, key);
        return true;
      }
      // (the gateway's own chunk too, for the one waiting in it)
      holdChunks(level, key, [...d.need, [x >> 4, z >> 4]]);
      return false;
    }
    releaseChunks(level, key);
    if (d) arrive(level, e, d.at, vx, vy, vz);
    return true;
  };
  if (!go()) level.inTransit.set(e, go);
}

/** there: facing as it was; a player stops (vanilla's is a teleport), anything else keeps its exit movement */
function arrive(level: Level, e: Entity, [x, y, z]: [number, number, number], vx: number, vy: number, vz: number): void {
  e.moveTo(x, y, z, e.yaw, e.pitch);
  if (e === level.player) e.dx = e.dy = e.dz = 0;
  else [e.dx, e.dy, e.dz] = [vx, vy, vz];
  e.fallDistance = 0;
  // vanilla DimensionTransition.PLACE_PORTAL_TICKET: the far side stays loaded 15 seconds, its middle ticking
  const bx = Math.floor(x), bz = Math.floor(z);
  level.tickets.set(`portal ${bx} ${Math.floor(y)} ${bz}`, { cx: bx >> 4, cz: bz >> 4, load: 2, ticking: 1, until: level.gameTime + 300 });
}

registerBehavior('end_gateway', {
  /**
   * vanilla EndGatewayBlock.entityInside: anything that can use a portal (alive, not riding; never the dragon) goes
   * in, unless the gateway is cooling down; either way it cools down again
   */
  entityInside(level, x, y, z, _st, e) {
    if (e.vehicle || e.removed || !((e as { isAlive?: boolean }).isAlive ?? true) || e.type === 'ender_dragon') return;
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof EndGatewayBlockEntity) || be.isCoolingDown()) return;
    e.setAsInsidePortal('end_gateway', x, y, z);
    be.triggerCooldown();
  },
  /** vanilla animateTick: a portal particle for each face that shows, drifting out through one side or another */
  animateTick(level, x, y, z) {
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof EndGatewayBlockEntity)) return;
    const n = be.particleAmount(level.world);
    const r = Math.random;
    for (let i = 0; i < n; i++) {
      let px = x + r(), pz = z + r(), vx = (r() - 0.5) * 0.5, vz = (r() - 0.5) * 0.5;
      const py = y + r(), vy = (r() - 0.5) * 0.5;
      const k = Math.floor(r() * 2) * 2 - 1;
      if (r() < 0.5) {
        pz = z + 0.5 + 0.25 * k;
        vz = r() * 2 * k;
      } else {
        px = x + 0.5 + 0.25 * k;
        vx = r() * 2 * k;
      }
      level.particles.spawn?.('portal', px, py, pz, vx, vy, vz);
    }
  },
});
