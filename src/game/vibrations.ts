// Vibrations (vanilla VibrationSystem with its Data, User, Listener and Ticker, VibrationSelector and VibrationInfo):
// what a sculk sensor, a shrieker or a warden makes of the game events round it. An event within its range that it
// can hear becomes a candidate, the nearest of a tick's candidates (the higher frequency on a tie) is picked the tick
// after, and a vibration travels from where it happened to the listener, a block a tick, shown by the vibration
// particle, before the listener takes it in. Wool in the way stops it; wool or carpet where it happened muffles it;
// something sneaking makes no vibration by stepping, landing, swimming, eating or shooting.

import type { Entity } from '../entity/entity';
import type { Level } from './level';
import { STATE_BLOCK, BLOCKS } from '../world/block';
import { vibrationFrequency, GAME_EVENT_TAGS, dampensVibrations, occludesVibrations, itemDampensVibrations, type GameEventName } from './gameEvents';

/** vanilla GameEvent.Context: what made the event, and the block it was done to or on */
export interface GameEventContext {
  entity?: Entity | null;
  state?: number | null;
}

/** vanilla VibrationInfo */
export interface VibrationInfo {
  event: GameEventName;
  distance: number;
  x: number;
  y: number;
  z: number;
  entity: Entity | null;
  /** the owner of the projectile that made it, if one did */
  owner: Entity | null;
}

/** vanilla VibrationSelector: of a tick's candidates, the nearest (on a tie the higher frequency), chosen the tick after */
export class VibrationSelector {
  private current: { info: VibrationInfo; tick: number } | null = null;

  addCandidate(info: VibrationInfo, tick: number): void {
    if (this.shouldReplace(info, tick)) this.current = { info, tick };
  }

  private shouldReplace(info: VibrationInfo, tick: number): boolean {
    const c = this.current;
    if (!c) return true;
    if (tick !== c.tick) return false;
    if (info.distance < c.info.distance) return true;
    if (info.distance > c.info.distance) return false;
    return vibrationFrequency(info.event) > vibrationFrequency(c.info.event);
  }

  chosenCandidate(tick: number): VibrationInfo | null {
    return this.current && this.current.tick < tick ? this.current.info : null;
  }

  startOver(): void {
    this.current = null;
  }
}

/** vanilla VibrationSystem.Data: the vibration on its way, how long it has left, and the selector */
export class VibrationData {
  current: VibrationInfo | null = null;
  travelTime = 0;
  readonly selector = new VibrationSelector();
  /** vanilla reloadVibrationParticle: the travelling particle is shown again once the listener is loaded */
  reloadParticle = true;
}

/** vanilla VibrationSystem.User: the listener's side of it */
export interface VibrationUser {
  /** vanilla getListenerRadius */
  readonly radius: number;
  /** vanilla getPositionSource: where it listens from (null when it isn't anywhere) */
  position(): [number, number, number] | null;
  /** vanilla getListenableEvents (#vibrations unless it says otherwise) */
  readonly listenable?: Set<string>;
  /** vanilla canTriggerAvoidVibration: a sneaking player it didn't hear earns Sneak 100 */
  readonly canTriggerAvoidVibration?: boolean;
  canReceive(level: Level, x: number, y: number, z: number, event: GameEventName, ctx: GameEventContext): boolean;
  onReceive(level: Level, x: number, y: number, z: number, event: GameEventName, entity: Entity | null, owner: Entity | null, distance: number): void;
  /** vanilla calculateTravelTimeInTicks (a block a tick) */
  travelTime?(distance: number): number;
  /** vanilla onDataChanged */
  onDataChanged?(): void;
}

const travelTime = (user: VibrationUser, distance: number) => (user.travelTime ? user.travelTime(distance) : Math.floor(distance));

/** a player's game mode, if it's a player */
const gameModeOf = (e: Entity): string | null => ('gameMode' in e ? String((e as { gameMode: unknown }).gameMode) : null);

/** vanilla Entity.isSteppingCarefully: sneaking */
const steppingCarefully = (e: Entity): boolean => e.isShiftKeyDown();

/** vanilla Entity.dampensVibrations: a dropped wool or carpet */
function entityDampens(e: Entity): boolean {
  const item = (e as { item?: { item?: { id?: string } } }).item;
  return e.type === 'item' && !!item?.item?.id && itemDampensVibrations(item.item.id);
}

/** what's to award a player that sneaked by a sensor unheard (game/advancements: adventure/avoid_vibration) */
export const vibrationHooks: { avoided: ((player: Entity) => void) | null } = { avoided: null };

/** vanilla VibrationSystem.User.isValidVibration */
export function isValidVibration(user: VibrationUser, event: GameEventName, ctx: GameEventContext): boolean {
  if (!(user.listenable ?? GAME_EVENT_TAGS.vibrations).has(event)) return false;
  const e = ctx.entity;
  if (e) {
    if (gameModeOf(e) === 'spectator') return false;
    if (steppingCarefully(e) && GAME_EVENT_TAGS.ignore_vibrations_sneaking.has(event)) {
      if (user.canTriggerAvoidVibration && gameModeOf(e) !== null) vibrationHooks.avoided?.(e);
      return false;
    }
    if (entityDampens(e)) return false;
  }
  return ctx.state == null || !dampensVibrations(ctx.state);
}

/** vanilla VibrationSystem.getRedstoneStrengthForDistance */
export function redstoneStrengthForDistance(distance: number, maxDistance: number): number {
  const d = 15 / maxDistance;
  return Math.max(1, 15 - Math.floor(d * distance));
}

/** vanilla VibrationSystem.Listener.distanceBetweenInBlocks: between the blocks the two positions are in */
export function distanceInBlocks(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = Math.floor(ax) - Math.floor(bx), dy = Math.floor(ay) - Math.floor(by), dz = Math.floor(az) - Math.floor(bz);
  return Math.fround(Math.sqrt(dx * dx + dy * dy + dz * dz));
}

/**
 * vanilla VibrationSystem.Listener.isOccluded: from the middle of the event's block to the middle of the listener's,
 * a line nudged out of each of its six faces in turn; the vibration gets through if any of them meets no wool
 */
export function isOccluded(level: Level, ex: number, ey: number, ez: number, lx: number, ly: number, lz: number): boolean {
  const ax = Math.floor(ex) + 0.5, ay = Math.floor(ey) + 0.5, az = Math.floor(ez) + 0.5;
  const bx = Math.floor(lx) + 0.5, by = Math.floor(ly) + 0.5, bz = Math.floor(lz) + 0.5;
  const E = Math.fround(1e-5);
  for (const [ox, oy, oz] of [[0, -E, 0], [0, E, 0], [0, 0, -E], [0, 0, E], [-E, 0, 0], [E, 0, 0]])
    if (!woolInLine(level, ax + ox, ay + oy, az + oz, bx, by, bz)) return false;
  return true;
}

/** vanilla BlockGetter.isBlockInLine with a ClipBlockStateContext for #occludes_vibration_signals: the blocks the line passes through */
function woolInLine(level: Level, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  // (vanilla BlockGetter.traverseBlocks: the line, stepped block by block, from just short of each end)
  const sx = x1 + (x0 - x1) * -1e-7, sy = y1 + (y0 - y1) * -1e-7, sz = z1 + (z0 - z1) * -1e-7;
  const fx = x0 + (x1 - x0) * -1e-7, fy = y0 + (y1 - y0) * -1e-7, fz = z0 + (z1 - z0) * -1e-7;
  let bx = Math.floor(fx), by = Math.floor(fy), bz = Math.floor(fz);
  if (occludesVibrations(level.getState(bx, by, bz))) return true;
  const dx = sx - fx, dy = sy - fy, dz = sz - fz;
  const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
  const tdx = stepX === 0 ? Number.MAX_VALUE : stepX / dx, tdy = stepY === 0 ? Number.MAX_VALUE : stepY / dy, tdz = stepZ === 0 ? Number.MAX_VALUE : stepZ / dz;
  const frac = (v: number) => v - Math.floor(v);
  let tx = tdx * (stepX > 0 ? 1 - frac(fx) : frac(fx)), ty = tdy * (stepY > 0 ? 1 - frac(fy) : frac(fy)), tz = tdz * (stepZ > 0 ? 1 - frac(fz) : frac(fz));
  while (tx <= 1 || ty <= 1 || tz <= 1) {
    if (tx < ty) {
      if (tx < tz) {
        bx += stepX;
        tx += tdx;
      } else {
        bz += stepZ;
        tz += tdz;
      }
    } else if (ty < tz) {
      by += stepY;
      ty += tdy;
    } else {
      bz += stepZ;
      tz += tdz;
    }
    if (occludesVibrations(level.getState(bx, by, bz))) return true;
  }
  return false;
}

/** the name of a block (for tests and messages) */
export const blockName = (st: number): string => BLOCKS[STATE_BLOCK[st]].name;
