// A player's warning level (vanilla WardenSpawnTracker): every time a sculk shrieker shrieks at them it goes up by
// one, to four at most, but not again for ten seconds; it falls back by one after ten minutes without a warning. At
// four a shrieker that can summon calls up the warden. Players near each other (16 blocks) share it: a shriek raises
// the highest of theirs and gives it to all of them.

import type { Level } from './level';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import { AABB } from '../core/aabb';

/** vanilla WardenSpawnTracker's saved form */
export interface WardenSpawnTrackerData {
  ticks_since_last_warning: number;
  warning_level: number;
  cooldown_ticks: number;
}

export class WardenSpawnTracker {
  static readonly MAX_WARNING_LEVEL = 4;
  /** vanilla DECREASE_WARNING_LEVEL_EVERY_INTERVAL */
  static readonly DECREASE_EVERY = 12000;
  /** vanilla WARNING_LEVEL_INCREASE_COOLDOWN */
  static readonly COOLDOWN = 200;

  ticksSinceLastWarning = 0;
  warningLevel = 0;
  cooldownTicks = 0;

  /** vanilla tick: once a player tick */
  tick(): void {
    if (this.ticksSinceLastWarning >= WardenSpawnTracker.DECREASE_EVERY) {
      this.decreaseWarningLevel();
      this.ticksSinceLastWarning = 0;
    } else this.ticksSinceLastWarning++;
    if (this.cooldownTicks > 0) this.cooldownTicks--;
  }

  reset(): void {
    this.ticksSinceLastWarning = 0;
    this.warningLevel = 0;
    this.cooldownTicks = 0;
  }

  onCooldown(): boolean {
    return this.cooldownTicks > 0;
  }

  /** vanilla increaseWarningLevel: not while on cooldown */
  increaseWarningLevel(): void {
    if (this.onCooldown()) return;
    this.ticksSinceLastWarning = 0;
    this.cooldownTicks = WardenSpawnTracker.COOLDOWN;
    this.setWarningLevel(this.warningLevel + 1);
  }

  decreaseWarningLevel(): void {
    this.setWarningLevel(this.warningLevel - 1);
  }

  setWarningLevel(level: number): void {
    this.warningLevel = Math.max(0, Math.min(WardenSpawnTracker.MAX_WARNING_LEVEL, level));
  }

  copyData(o: WardenSpawnTracker): void {
    this.warningLevel = o.warningLevel;
    this.cooldownTicks = o.cooldownTicks;
    this.ticksSinceLastWarning = o.ticksSinceLastWarning;
  }

  save(): WardenSpawnTrackerData {
    return { ticks_since_last_warning: this.ticksSinceLastWarning, warning_level: this.warningLevel, cooldown_ticks: this.cooldownTicks };
  }

  load(d: Partial<WardenSpawnTrackerData> | null | undefined): void {
    this.ticksSinceLastWarning = Math.max(0, d?.ticks_since_last_warning ?? 0);
    this.setWarningLevel(d?.warning_level ?? 0);
    this.cooldownTicks = Math.max(0, d?.cooldown_ticks ?? 0);
  }
}

/** vanilla WardenSpawnTracker.hasNearbyWarden: a warden within a 48-block cube round the shrieker */
function hasNearbyWarden(level: Level, x: number, y: number, z: number): boolean {
  const box = new AABB(x + 0.5 - 24, y + 0.5 - 24, z + 0.5 - 24, x + 0.5 + 24, y + 0.5 + 24, z + 0.5 + 24);
  return level.getEntities(box, (e: Entity) => e.type === 'warden').length > 0;
}

/** vanilla WardenSpawnTracker.getNearbyPlayers: players alive, not spectating, within 16 blocks of the shrieker */
function nearbyPlayers(level: Level, x: number, y: number, z: number): Player[] {
  const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
  return level.players().filter((p) => p.isAlive && p.gameMode !== 'spectator' && (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2 < 16 * 16);
}

/**
 * vanilla WardenSpawnTracker.tryWarn: a shrieker at (x, y, z) shrieked at `player`. Unless a warden is already near,
 * or any of the players round it (and `player`) warned in the last ten seconds, the highest warning level among them
 * goes up one and they all share it; that level, or null when nothing happened
 */
export function tryWarn(level: Level, x: number, y: number, z: number, player: Player): number | null {
  if (hasNearbyWarden(level, x, y, z)) return null;
  const list = nearbyPlayers(level, x, y, z);
  if (!list.includes(player)) list.push(player);
  if (list.some((p) => p.wardenSpawnTracker.onCooldown())) return null;
  let top = list[0].wardenSpawnTracker;
  for (const p of list) if (p.wardenSpawnTracker.warningLevel > top.warningLevel) top = p.wardenSpawnTracker;
  top.increaseWarningLevel();
  for (const p of list) if (p.wardenSpawnTracker !== top) p.wardenSpawnTracker.copyData(top);
  return top.warningLevel;
}
