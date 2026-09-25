// A player's warning level (vanilla WardenSpawnTracker): every time a sculk shrieker shrieks at them it goes up by
// one, to four at most, but not again for ten seconds; it falls back by one after ten minutes without a warning. At
// four a shrieker that can summon calls up the warden. Players near each other (16 blocks) share it: a shriek raises
// the highest of theirs and gives it to all of them.

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
