// Vibrations (vanilla VibrationSystem with its Data, User, Listener and Ticker, VibrationSelector and VibrationInfo):
// what a sculk sensor, a shrieker or a warden makes of the game events round it. An event within its range that it
// can hear becomes a candidate, the nearest of a tick's candidates (the higher frequency on a tie) is picked the tick
// after, and a vibration travels from where it happened to the listener, a block a tick, shown by the vibration
// particle, before the listener takes it in. Wool in the way stops it; wool or carpet where it happened muffles it;
// something sneaking makes no vibration by stepping, landing, swimming, eating or shooting.

import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import type { ItemStack } from '../item/item';
import type { Level } from './level';
import { STATE_BLOCK, BLOCKS } from '../world/block';
import { equipableSlot } from '../item/equipment';
import { vibrationFrequency, GAME_EVENT_TAGS, dampensVibrations, occludesVibrations, itemDampensVibrations, type GameEventName, type GameEventContext } from './gameEvents';
import type { GameEventListener } from './gameEventDispatcher';

export type { GameEventContext };

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
  /** who made it and who shot it, as saved (looked up again once the vibration is back in the world) */
  entityUuid?: string | null;
  ownerUuid?: string | null;
}

/** vanilla VibrationSelector: of a tick's candidates, the nearest (on a tie the higher frequency), chosen the tick after */
export class VibrationSelector {
  current: { info: VibrationInfo; tick: number } | null = null;

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
  /** vanilla reloadVibrationParticle: a vibration on its way when the listener was saved is shown again once it's back */
  reloadParticle = false;

  /** vanilla VibrationSystem.Data.CODEC: event, selector, event_delay */
  save(): string {
    const sel = this.selector.current;
    return JSON.stringify({
      ...(this.current ? { event: saveInfo(this.current) } : {}),
      selector: sel ? { event: saveInfo(sel.info), tick: sel.tick } : {},
      event_delay: this.travelTime,
    });
  }

  load(text: string | number | undefined): void {
    if (typeof text !== 'string') return;
    try {
      const d = JSON.parse(text) as { event?: SavedInfo; selector?: { event?: SavedInfo; tick?: number }; event_delay?: number };
      this.current = d.event ? loadInfo(d.event) : null;
      this.travelTime = Math.max(0, d.event_delay ?? 0);
      const sel = d.selector?.event ? loadInfo(d.selector.event) : null;
      this.selector.current = sel ? { info: sel, tick: d.selector?.tick ?? 0 } : null;
      this.reloadParticle = true;
    } catch {
      // (a listener that can't be read starts afresh)
    }
  }
}

interface SavedInfo {
  game_event: string;
  distance: number;
  pos: [number, number, number];
  source?: string;
  projectile_owner?: string;
}

function saveInfo(v: VibrationInfo): SavedInfo {
  const source = v.entity?.uuid ?? v.entityUuid ?? undefined, owner = v.owner?.uuid ?? v.ownerUuid ?? undefined;
  return { game_event: v.event, distance: v.distance, pos: [v.x, v.y, v.z], ...(source ? { source } : {}), ...(owner ? { projectile_owner: owner } : {}) };
}

function loadInfo(d: SavedInfo): VibrationInfo | null {
  if (!vibrationFrequency(d.game_event) && !GAME_EVENT_TAGS.warden_can_listen.has(d.game_event)) return null;
  const [x, y, z] = d.pos;
  return { event: d.game_event as GameEventName, distance: d.distance, x, y, z, entity: null, owner: null, entityUuid: d.source ?? null, ownerUuid: d.projectile_owner ?? null };
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
  /** vanilla requiresAdjacentChunksToBeTicking: a vibration waits to be taken in till the chunks round it all tick */
  readonly requiresAdjacentChunksToBeTicking?: boolean;
}

const travelTime = (user: VibrationUser, distance: number) => (user.travelTime ? user.travelTime(distance) : Math.floor(distance));

/** a player's game mode, if it's a player */
const gameModeOf = (e: Entity): string | null => ('gameMode' in e ? String((e as { gameMode: unknown }).gameMode) : null);

/** vanilla Entity.isSteppingCarefully: sneaking */
const steppingCarefully = (e: Entity): boolean => e.isShiftKeyDown();

/** vanilla Entity.dampensVibrations (ItemEntity's: its stack is #dampens_vibrations): a dropped wool or carpet */
function entityDampens(e: Entity): boolean {
  const stack = (e as { stack?: ItemStack | null }).stack;
  return e.type === 'item' && !!stack && itemDampensVibrations(stack.item.id);
}

/** vanilla VibrationSystem.User.isValidVibration */
export function isValidVibration(user: VibrationUser, event: GameEventName, ctx: GameEventContext): boolean {
  if (!(user.listenable ?? GAME_EVENT_TAGS.vibrations).has(event)) return false;
  const e = ctx.entity;
  if (e) {
    if (gameModeOf(e) === 'spectator') return false;
    if (steppingCarefully(e) && GAME_EVENT_TAGS.ignore_vibrations_sneaking.has(event)) {
      // (vanilla CriteriaTriggers.AVOID_VIBRATION: Sneak 100)
      if (user.canTriggerAvoidVibration && e.type === 'player') e.level.onPlayerTrigger?.(e as Player, 'avoid_vibration');
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

/** vanilla Projectile: the entities that have an owner who shot or threw them */
const PROJECTILES = new Set([
  'arrow', 'spectral_arrow', 'trident', 'egg', 'snowball', 'ender_pearl', 'potion', 'experience_bottle', 'fireball', 'small_fireball',
  'dragon_fireball', 'wither_skull', 'shulker_bullet', 'llama_spit', 'firework_rocket', 'fishing_bobber', 'wind_charge', 'breeze_wind_charge',
]);

/** vanilla VibrationInfo.getProjectileOwner: who shot or threw it, if it's a projectile */
export function projectileOwner(e: Entity | null | undefined): Entity | null {
  return e && PROJECTILES.has(e.type) ? ((e as { owner?: Entity | null }).owner ?? null) : null;
}

/** vanilla Projectile.hasBeenShot: the projectiles that have told of being shot (or were loaded, having done so) */
const SHOT = new WeakSet<Entity>();

/**
 * vanilla Projectile.tick's first thing: once, PROJECTILE_SHOOT where the projectile is, by whoever shot or threw it
 * (a sneaking player's shot isn't heard)
 */
export function projectileShot(e: Entity): void {
  if (SHOT.has(e)) return;
  SHOT.add(e);
  e.level.gameEvent?.('projectile_shoot', e.x, e.y, e.z, { entity: projectileOwner(e) });
}

/** vanilla HasBeenShot, loaded: a saved projectile doesn't tell of it again */
export function markShot(e: Entity): void {
  SHOT.add(e);
}

/** vanilla Equipable.get: what can be put on (armour, an elytra, a carved pumpkin or a head, a shield, a horse's armour) */
const isEquipable = (s: ItemStack): boolean => equipableSlot(s.item) !== null || s.item.id === 'shield' || s.item.id.endsWith('_horse_armor') || s.item.id === 'wolf_armor';

/**
 * vanilla LivingEntity.onEquipItem's game event: EQUIP when what went on is equipable, else UNEQUIP (taking a piece
 * off, or something else in its place); never for the very same stack, for nothing where nothing was, on the first
 * tick (spawning, loading) or from a spectator
 */
export function equipEvent(e: Entity, old: ItemStack | null, cur: ItemStack | null): void {
  if ((!old && !cur) || (old && cur && old.sameItem(cur)) || e.tickCount === 0) return;
  if ((e as { gameMode?: string }).gameMode === 'spectator') return;
  e.level.gameEvent?.(cur && isEquipable(cur) ? 'equip' : 'unequip', e.x, e.y, e.z, { entity: e });
}

/** vanilla Projectile.onHit's PROJECTILE_LAND for an entity hit: where the entity stands */
export function projectileLandedOn(e: Entity, hit: Entity): void {
  e.level.gameEvent?.('projectile_land', hit.x, hit.y, hit.z, { entity: e });
}

/** vanilla Projectile.onHit's PROJECTILE_LAND for a block hit: at the block, as it is after the hit */
export function projectileLandedAt(e: Entity, x: number, y: number, z: number): void {
  e.level.gameEvent?.('projectile_land', x + 0.5, y + 0.5, z + 0.5, { entity: e, state: e.level.getState(x, y, z) });
}

/** vanilla VibrationSystem.Listener: a vibration user's ear, as its block entity (or the warden) hands it to the dispatcher */
export class VibrationListener implements GameEventListener {
  constructor(readonly user: VibrationUser, readonly data: VibrationData) {}

  listenerPosition(): [number, number, number] | null {
    return this.user.position();
  }

  listenerRadius(): number {
    return this.user.radius;
  }

  /** vanilla handleGameEvent: nothing while a vibration is on its way; otherwise one it can hear, not stopped by wool */
  handleGameEvent(level: Level, event: GameEventName, ctx: GameEventContext, x: number, y: number, z: number): boolean {
    if (this.data.current) return false;
    if (!isValidVibration(this.user, event, ctx)) return false;
    const p = this.user.position();
    if (!p) return false;
    if (!this.user.canReceive(level, Math.floor(x), Math.floor(y), Math.floor(z), event, ctx)) return false;
    if (isOccluded(level, x, y, z, p[0], p[1], p[2])) return false;
    this.schedule(level, event, ctx, x, y, z, p);
    return true;
  }

  /** vanilla forceScheduleVibration: a candidate however it came (something stepping on a sensor, sneaking or not) */
  forceScheduleVibration(level: Level, event: GameEventName, ctx: GameEventContext, x: number, y: number, z: number): void {
    const p = this.user.position();
    if (p) this.schedule(level, event, ctx, x, y, z, p);
  }

  /** vanilla scheduleVibration: a candidate for this tick, as far as it is from the listener */
  private schedule(level: Level, event: GameEventName, ctx: GameEventContext, x: number, y: number, z: number, p: [number, number, number]): void {
    const distance = Math.fround(Math.sqrt((x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2));
    const e = ctx.entity ?? null;
    this.data.selector.addCandidate({ event, distance, x, y, z, entity: e, owner: projectileOwner(e) }, level.gameTime);
  }
}

/** vanilla VibrationInfo.getEntity / getProjectileOwner: the entity itself, or the one of that uuid now in the level */
function entityOf(level: Level, e: Entity | null, uuid: string | null | undefined): Entity | null {
  if (e || !uuid) return e;
  return level.entities.find((o) => o.hasUuid && o.uuid === uuid) ?? null;
}

/** vanilla VibrationSystem.Ticker.areAdjacentChunksTicking: the chunk the listener is in and the eight round it */
function adjacentChunksTicking(level: Level, x: number, z: number): boolean {
  const cx = x >> 4, cz = z >> 4;
  for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) if (!level.isEntityTicking(i * 16 + 8, j * 16 + 8)) return false;
  return true;
}

/**
 * vanilla VibrationSystem.Ticker.tick: each tick of a listener's block entity (or warden), the vibration chosen from
 * the last tick's candidates sets off (the particle with it), and the one on its way comes a block nearer; once it's
 * there the listener takes it in
 */
export function tickVibrations(level: Level, data: VibrationData, user: VibrationUser): void {
  if (!data.current) trySelectAndScheduleVibration(level, data, user);
  const v = data.current;
  if (!v) return;
  let changed = data.travelTime > 0;
  tryReloadVibrationParticle(level, data, user);
  data.travelTime = Math.max(0, data.travelTime - 1);
  if (data.travelTime <= 0) changed = receiveVibration(level, data, user, v);
  if (changed) user.onDataChanged?.();
}

/** vanilla trySelectAndScheduleVibration: the chosen candidate sets off, a vibration particle flying to the listener */
function trySelectAndScheduleVibration(level: Level, data: VibrationData, user: VibrationUser): void {
  const info = data.selector.chosenCandidate(level.gameTime);
  if (!info) return;
  data.current = info;
  data.travelTime = travelTime(user, info.distance);
  level.particles.vibration?.(info.x, info.y, info.z, () => user.position(), data.travelTime);
  user.onDataChanged?.();
  data.selector.startOver();
}

/** vanilla tryReloadVibrationParticle: a vibration that was on its way when saved is shown again from where it had got to */
function tryReloadVibrationParticle(level: Level, data: VibrationData, user: VibrationUser): void {
  if (!data.reloadParticle) return;
  const v = data.current;
  if (!v) {
    data.reloadParticle = false;
    return;
  }
  const to = user.position() ?? [v.x, v.y, v.z];
  const i = data.travelTime, j = travelTime(user, v.distance);
  const t = j > 0 ? 1 - i / j : 1;
  level.particles.vibration?.(v.x + (to[0] - v.x) * t, v.y + (to[1] - v.y) * t, v.z + (to[2] - v.z) * t, () => user.position(), i);
  data.reloadParticle = false;
}

/** vanilla receiveVibration: the listener takes the vibration in, from the block it happened in */
function receiveVibration(level: Level, data: VibrationData, user: VibrationUser, v: VibrationInfo): boolean {
  const bx = Math.floor(v.x), by = Math.floor(v.y), bz = Math.floor(v.z);
  const p = user.position();
  const lx = p ? Math.floor(p[0]) : bx, ly = p ? Math.floor(p[1]) : by, lz = p ? Math.floor(p[2]) : bz;
  if (user.requiresAdjacentChunksToBeTicking && !adjacentChunksTicking(level, lx, lz)) return false;
  const entity = entityOf(level, v.entity, v.entityUuid), owner = entityOf(level, v.owner, v.ownerUuid);
  user.onReceive(level, bx, by, bz, v.event, entity, owner, distanceInBlocks(bx, by, bz, lx, ly, lz));
  data.current = null;
  return true;
}

/** the name of a block (for tests and messages) */
export const blockName = (st: number): string => BLOCKS[STATE_BLOCK[st]].name;
