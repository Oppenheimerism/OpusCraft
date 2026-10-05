// vanilla BossHealthOverlay and LerpingBossEvent: the boss bars across the top of the screen (the ender dragon's),
// each with its name over it, sliding to a new value over a tenth of a second. A bar asks for its boss music
// (music.dragon over the End's) and for the world's fog to close in.

import '../textures/bossBar';
// (Stage 4: raids) a raid's red, notched bar
import '../textures/raidBar';
import type { GuiGraphics } from './guiGraphics';

/**
 * (Stage 4: raids) a bar the overlay shows (vanilla BossEvent): the dragon's (game/endDragonFight.ts BossEvent) or a
 * raid's (game/raids.ts RaidBar); `overlay` is vanilla's BossBarOverlay, 'progress' (plain) or 'notched_N'
 */
export interface BossBar {
  readonly name: string;
  readonly color: string;
  readonly overlay: string;
  readonly progress: number;
  readonly playBossMusic: boolean;
  readonly createWorldFog: boolean;
  /** vanilla BossEvent.darkenScreen (the wither's): the sky darkens while it's shown (absent: no) */
  readonly darkenScreen?: boolean;
}

/** vanilla LerpingBossEvent */
class LerpingBossEvent {
  private from: number;
  private target: number;
  private setTime = 0;

  constructor(readonly event: BossBar) {
    this.from = this.target = event.progress;
  }

  /** follow the event: a new value slides in from wherever the bar is now */
  sync(now: number): void {
    if (this.event.progress === this.target) return;
    this.from = this.progress(now);
    this.target = this.event.progress;
    this.setTime = now;
  }

  progress(now: number): number {
    const f = Math.max(0, Math.min(1, (now - this.setTime) / 100));
    return this.from + (this.target - this.from) * f;
  }
}

export class BossHealthOverlay {
  private readonly events = new Map<BossBar, LerpingBossEvent>();

  /** once a tick: the bars shown to the player now (vanilla ClientboundBossEventPacket add, update and remove) */
  update(shown: (BossBar | null)[]): void {
    const now = performance.now();
    const live = new Set(shown.filter((e): e is BossBar => !!e));
    for (const e of [...this.events.keys()]) if (!live.has(e)) this.events.delete(e);
    for (const e of live) {
      const l = this.events.get(e);
      if (l) l.sync(now);
      else this.events.set(e, new LerpingBossEvent(e));
    }
  }

  clear(): void {
    this.events.clear();
  }

  /** vanilla BossHealthOverlay.render: 182 wide, from 12 down, 19 apart, no lower than a third of the screen */
  render(g: GuiGraphics): void {
    if (!this.events.size) return;
    const now = performance.now();
    const w = g.width;
    let y = 12;
    for (const l of this.events.values()) {
      const x = Math.floor(w / 2) - 91;
      const color = l.event.color;
      // (Stage 4: raids) vanilla drawBar: the bar, then its notches (a raid's bar has ten)
      const notched = l.event.overlay !== 'progress' ? `boss_bar_${l.event.overlay}` : null;
      g.sprite(`boss_bar_${color}_background`, x, y, 182, 5);
      if (notched) g.sprite(`${notched}_background`, x, y, 182, 5);
      // (vanilla Mth.lerpDiscrete(progress, 0, 182))
      const p = l.progress(now);
      const i = Math.floor(p * 181) + (p > 0 ? 1 : 0);
      if (i > 0) {
        g.sprite(`boss_bar_${color}_progress`, x, y, i, 5, 0, 0, i, 5);
        if (notched) g.sprite(`${notched}_progress`, x, y, i, 5, 0, 0, i, 5);
      }
      const name = l.event.name;
      g.text(name, Math.floor(w / 2) - Math.floor(g.textWidth(name) / 2), y - 9, 0xffffff, true);
      y += 10 + 9;
      if (y >= g.height / 3) break;
    }
  }

  /** vanilla shouldPlayMusic */
  shouldPlayMusic(): boolean {
    for (const l of this.events.keys()) if (l.playBossMusic) return true;
    return false;
  }

  /** vanilla shouldCreateWorldFog */
  shouldCreateWorldFog(): boolean {
    for (const l of this.events.keys()) if (l.createWorldFog) return true;
    return false;
  }

  /** vanilla shouldDarkenScreen */
  shouldDarkenScreen(): boolean {
    for (const l of this.events.keys()) if (l.darkenScreen) return true;
    return false;
  }
}
