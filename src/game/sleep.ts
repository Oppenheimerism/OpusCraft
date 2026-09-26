// Beds and sleeping (vanilla BedBlock.useWithoutItem, ServerPlayer.startSleepInBed,
// BedBlock.findStandUpPosition / DismountHelper, respawning at a bed).

import { BLOCKS, STATE_BLOCK, FLAGS, COLLISION, F_OPAQUE, F_FULL_COLLISION, Block } from '../world/block';
import type { World } from '../world/world';
import type { Level } from './level';
import type { Player } from '../entity/player';
import type { Entity } from '../entity/entity';
import type { Villager } from '../entity/villager';
import { explode } from './explosion';
import { isBurningBlock } from '../entity/ai/pathfinder';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

const STEP: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const CLOCKWISE: Record<string, string> = { north: 'east', east: 'south', south: 'west', west: 'north' };
const OPPOSITE: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
/** vanilla Direction.toYRot */
export const BED_YROT: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

export const MSG = {
  occupied: 'This bed is occupied',
  tooFar: 'You may not rest now; the bed is too far away',
  obstructed: 'This bed is obstructed',
  notNow: 'You can sleep only at night or during thunderstorms',
  notSafe: 'You may not rest now; there are monsters nearby',
  spawnSet: 'Respawn point set',
  noRespawnBlock: 'You have no home bed or charged respawn anchor, or it was obstructed',
};

export function isBed(st: number): boolean {
  return blk(st).name.endsWith('_bed');
}

/** vanilla BlockState.isSuffocating (full, solid, opaque cubes) */
function suffocating(st: number): boolean {
  return (FLAGS[st] & F_OPAQUE) !== 0 && (FLAGS[st] & F_FULL_COLLISION) !== 0;
}

/** vanilla EntityType.isBlockDangerous for a player */
function dangerous(st: number): boolean {
  const n = blk(st).name;
  return isBurningBlock(st) || n === 'wither_rose' || n === 'sweet_berry_bush' || n === 'cactus' || n === 'powder_snow';
}

/** top of a block's collision shape (ladders/vines and open trapdoors count as empty), -1 if none */
function shapeTop(st: number): number {
  const n = blk(st).name;
  if (n === 'ladder' || n === 'vine' || n === 'scaffolding' || (n.endsWith('_trapdoor') && blk(st).get(st, 'open'))) return -1;
  const boxes = COLLISION[st];
  if (!boxes || !boxes.length) return -1;
  let top = -1;
  for (const b of boxes) top = Math.max(top, b[4]);
  return top;
}

function boxFree(world: World, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  for (let x = Math.floor(x0); x <= Math.floor(x1 - 1e-7); x++)
    for (let y = Math.floor(y0) - 1; y <= Math.floor(y1 - 1e-7); y++)
      for (let z = Math.floor(z0); z <= Math.floor(z1 - 1e-7); z++) {
        const boxes = COLLISION[world.getState(x, y, z)];
        if (!boxes) continue;
        for (const b of boxes) {
          if (x + b[0] < x1 - 1e-7 && x + b[3] > x0 + 1e-7 && y + b[1] < y1 - 1e-7 && y + b[4] > y0 + 1e-7 && z + b[2] < z1 - 1e-7 && z + b[5] > z0 + 1e-7) return false;
        }
      }
  return true;
}

/** vanilla DismountHelper.findSafeDismountLocation for a standing player */
function safeDismount(world: World, x: number, y: number, z: number, checkDangerous: boolean): [number, number, number] | null {
  const here = world.getState(x, y, z);
  if (checkDangerous && dangerous(here)) return null;
  let floor = shapeTop(here);
  if (floor < 0) {
    const below = shapeTop(world.getState(x, y - 1, z));
    floor = below >= 1 ? below - 1 : -Infinity;
  }
  if (!Number.isFinite(floor) || floor >= 1) return null;
  if (checkDangerous && floor <= 0 && dangerous(world.getState(x, y - 1, z))) return null;
  const px = x + 0.5, py = y + floor, pz = z + 0.5;
  if (!boxFree(world, px - 0.3, py, pz - 0.3, px + 0.3, py + 1.8, pz + 0.3)) return null;
  return [px, py, pz];
}

/** vanilla BedBlock.findStandUpPosition: beside the bed on the side the sleeper faces away from, else around it, else on it */
export function findStandUpPosition(world: World, x: number, y: number, z: number, facing: string, yaw: number): [number, number, number] | null {
  const cw = CLOCKWISE[facing];
  const [cx, cz] = STEP[cw];
  const r = (yaw * Math.PI) / 180;
  // vanilla Direction.isFacingAngle
  const side = cx * -Math.sin(r) + cz * Math.cos(r) > 0 ? OPPOSITE[cw] : cw;
  const [sx, sz] = STEP[side];
  const [fx, fz] = STEP[facing];
  const offsets: [number, number][] = [
    [sx, sz], [sx - fx, sz - fz], [sx - fx * 2, sz - fz * 2], [-fx * 2, -fz * 2], [-sx - fx * 2, -sz - fz * 2],
    [-sx - fx, -sz - fz], [-sx, -sz], [-sx + fx, -sz + fz], [fx, fz], [sx + fx, sz + fz],
    [0, 0], [-fx, -fz],
  ];
  for (const danger of [true, false])
    for (const [ox, oz] of offsets) {
      const at = safeDismount(world, x + ox, y, z + oz, danger);
      if (at) return at;
    }
  return null;
}

/** vanilla ServerPlayer.bedInRange / isReachableBedBlock */
function bedInRange(p: Player, x: number, y: number, z: number, facing: string): boolean {
  const near = (bx: number, bz: number) => Math.abs(p.x - (bx + 0.5)) <= 3 && Math.abs(p.y - y) <= 2 && Math.abs(p.z - (bz + 0.5)) <= 3;
  const [fx, fz] = STEP[facing];
  return near(x, z) || near(x - fx, z - fz);
}

/** vanilla ServerPlayer.bedBlocked: room above both halves */
function bedBlocked(world: World, x: number, y: number, z: number, facing: string): boolean {
  const [fx, fz] = STEP[facing];
  return suffocating(world.getState(x, y + 1, z)) || suffocating(world.getState(x - fx, y + 1, z - fz));
}

export interface SleepHost {
  level: Level;
  player: Player;
  /** action bar message */
  overlay(msg: string): void;
  /** system chat message */
  chat(msg: string): void;
  /** vanilla SLEPT_IN_BED trigger */
  onSlept?(): void;
}

/** vanilla ServerPlayer.setRespawnPosition (with the "Respawn point set" message) */
export function setRespawnPosition(host: SleepHost, pos: [number, number, number] | null, forced: boolean, message: boolean): void {
  const p = host.player;
  const same = !!pos && !!p.respawnPos && pos[0] === p.respawnPos[0] && pos[1] === p.respawnPos[1] && pos[2] === p.respawnPos[2];
  if (pos && message && !same) host.chat(MSG.spawnSet);
  p.respawnPos = pos;
  p.respawnForced = pos ? forced : false;
}

/** vanilla BedBlock.useWithoutItem */
export function useBed(host: SleepHost, x: number, y: number, z: number): void {
  const w = host.level.world;
  let st = w.getState(x, y, z);
  const b = blk(st);
  if (b.get(st, 'part') !== 'head') {
    const [fx, fz] = STEP[b.get<string>(st, 'facing')];
    x += fx;
    z += fz;
    st = w.getState(x, y, z);
    if (blk(st) !== b) return;
  }
  if (!host.level.world.dim.bedWorks) {
    // vanilla BedBlock.useWithoutItem: no sleeping outside the Overworld, the bed blows up ([Intentional Game Design])
    host.level.setBlock(x, y, z, 0);
    const [fx, fz] = STEP[b.get<string>(st, 'facing')];
    if (blk(w.getState(x - fx, y, z - fz)) === b) host.level.setBlock(x - fx, y, z - fz, 0);
    explode(host.level, null, x + 0.5, y + 0.5, z + 0.5, 5, true, 'block', 'badRespawnPoint');
    return;
  }
  if (b.get(st, 'occupied')) {
    // vanilla kickVillagerOutOfBed: a villager asleep in it wakes up (and that's all the click does)
    if (kickVillagerOutOfBed(host.level, x, y, z)) return;
    // otherwise nobody can be in it unless it's us: clear a stale flag from an interrupted session
    const p = host.player;
    const ours = p.sleepingPos && p.sleepingPos[0] === x && p.sleepingPos[1] === y && p.sleepingPos[2] === z;
    if (ours) {
      host.overlay(MSG.occupied);
      return;
    }
    st = b.with(st, 'occupied', false);
    host.level.setBlock(x, y, z, st);
  }
  const problem = startSleepInBed(host, x, y, z, st);
  if (problem) host.overlay(problem);
}

/** vanilla BedBlock.kickVillagerOutOfBed: wake the first villager asleep in the bed's head block */
function kickVillagerOutOfBed(level: Level, x: number, y: number, z: number): boolean {
  for (const e of level.entities) {
    if (e.removed || e.type !== 'villager') continue;
    const v = e as Villager;
    const bb = v.bb;
    if (!v.isSleeping() || bb.maxX <= x || bb.minX >= x + 1 || bb.maxY <= y || bb.minY >= y + 1 || bb.maxZ <= z || bb.minZ >= z + 1) continue;
    v.stopSleeping();
    return true;
  }
  return false;
}

/** vanilla ServerPlayer.startSleepInBed: returns the problem message, or null when asleep */
function startSleepInBed(host: SleepHost, x: number, y: number, z: number, st: number): string | null {
  const p = host.player;
  const lvl = host.level;
  if (p.isSleeping() || p.health <= 0) return null;
  const facing = blk(st).get<string>(st, 'facing');
  if (!bedInRange(p, x, y, z, facing)) return MSG.tooFar;
  if (bedBlocked(lvl.world, x, y, z, facing)) return MSG.obstructed;
  setRespawnPosition(host, [x, y, z], false, true);
  if (lvl.isDay()) return MSG.notNow;
  if (p.gameMode !== 'creative') {
    const box = { minX: x + 0.5 - 8, minY: y - 5, minZ: z + 0.5 - 8, maxX: x + 0.5 + 8, maxY: y + 5, maxZ: z + 0.5 + 8 };
    const monsters = lvl.entities.some((e: Entity) => {
      const m = e as Entity & { isPreventingPlayerRest?: (p: Player) => boolean };
      if (e.removed || !m.isPreventingPlayerRest || !m.isPreventingPlayerRest(p)) return false;
      const bb = e.bb;
      return bb.maxX > box.minX && bb.minX < box.maxX && bb.maxY > box.minY && bb.minY < box.maxY && bb.maxZ > box.minZ && bb.minZ < box.maxZ;
    });
    if (monsters) return MSG.notSafe;
  }
  p.startSleeping(x, y, z);
  host.onSlept?.();
  return null;
}

/**
 * vanilla ServerLevel.tick: everyone asleep long enough → skip to morning, clear the weather, wake up (vanilla
 * SleepStatus: every player not spectating asleep, and as many asleep long enough; playersSleepingPercentage isn't
 * heeded yet, as ever: all of them)
 */
export function tickSleeping(level: Level): void {
  const players = level.players();
  let active = 0, sleeping = 0, deep = 0;
  for (const p of players) {
    if (p.isSleepingLongEnough()) deep++;
    if (p.gameMode === 'spectator') continue;
    active++;
    if (p.isSleeping()) sleeping++;
  }
  const needed = Math.max(1, active);
  if (sleeping < needed || deep < needed) return;
  if (level.gameRules.doDaylightCycle) {
    const j = level.dayTime + 24000;
    level.dayTime = j - (j % 24000);
  }
  // (vanilla wakeUpAllPlayers)
  for (const p of players) if (p.isSleeping()) p.stopSleepInBed(false);
  if (level.gameRules.doWeatherCycle && level.isRaining()) {
    level.rainTime = 0;
    level.raining = false;
    level.thunderTime = 0;
    level.thundering = false;
  }
}

/**
 * vanilla ServerPlayer.findRespawnPositionAndUseSpawnBlock: where a player
 * respawns (and which way they face). null = fall back to the world spawn.
 */
export function findRespawn(level: Level, p: Player): { x: number; y: number; z: number; yaw: number } | null {
  const pos = p.respawnPos;
  if (!pos) return null;
  const [x, y, z] = pos;
  const w = level.world;
  const st = w.getState(x, y, z);
  if (isBed(st)) {
    const at = findStandUpPosition(w, x, y, z, blk(st).get<string>(st, 'facing'), p.yaw);
    if (!at) return null;
    const vx = x + 0.5 - at[0], vz = z + 0.5 - at[2];
    const yaw = (Math.atan2(vz, vx) * 180) / Math.PI - 90;
    return { x: at[0], y: at[1], z: at[2], yaw };
  }
  if (p.respawnForced) {
    // /spawnpoint: any spot a player fits (vanilla isPossibleToRespawnInThis on both blocks)
    const free = (s: number) => !COLLISION[s]?.length && !(FLAGS[s] & F_OPAQUE) && !dangerous(s);
    if (free(st) && free(w.getState(x, y + 1, z))) return { x: x + 0.5, y: y + 0.1, z: z + 0.5, yaw: p.yaw };
  }
  return null;
}
