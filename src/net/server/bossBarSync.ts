// (guests' boss bars) The boss bars a guest's player is shown (game/bossBars.ts: the dragon's, a raid's, any other), as
// the guest was last told them: vanilla ServerBossEvent.addPlayer and removePlayer, and its broadcasts when the bar
// changes, worked out for each guest at the end of each tick.

import type { Value } from '../codec';
import { CB } from '../protocol';
import { bossBarsShownTo } from '../../game/bossBars';
import type { BossBar } from '../../gui/bossOverlay';
import type { Level } from '../../game/level';
import type { Player } from '../../entity/player';

/** each bar's id, the same for every guest (vanilla BossEvent's uuid) */
const ids = new WeakMap<BossBar, number>();
let nextId = 1;
function idOf(b: BossBar): number {
  let id = ids.get(b);
  if (id === undefined) {
    id = nextId;
    nextId = nextId >= 0x7fffffff ? 1 : nextId + 1;
    ids.set(b, id);
  }
  return id;
}

/** vanilla ClientboundBossEventPacket's properties, as bits: the sky darkened, the boss music, the fog */
export function bossBarFlags(b: BossBar): number {
  return (b.darkenScreen ? 1 : 0) | (b.playBossMusic ? 2 : 0) | (b.createWorldFog ? 4 : 0);
}

export class BossBarSync {
  /** the bars the guest has, with how each was last sent */
  private readonly told = new Map<BossBar, { id: number; key: string }>();

  /** what `viewer` is shown now against what its guest has: a bar come or changed (all of it), a bar gone */
  sync(level: Level, viewer: Player, send: (p: Value[]) => void): void {
    const shown = bossBarsShownTo(level, viewer);
    for (const b of shown) {
      const name = String(b.name).slice(0, 256), progress = Number.isFinite(b.progress) ? Math.max(0, Math.min(1, b.progress)) : 0, flags = bossBarFlags(b);
      const key = `${name}\u0000${b.color}\u0000${b.overlay}\u0000${progress}\u0000${flags}`;
      let t = this.told.get(b);
      if (!t) this.told.set(b, (t = { id: idOf(b), key: '' }));
      if (t.key === key) continue;
      t.key = key;
      send([CB.BossEvent, t.id, name, b.color, b.overlay, progress, flags]);
    }
    for (const [b, t] of this.told)
      if (!shown.includes(b)) {
        this.told.delete(b);
        send([CB.BossEventRemove, t.id]);
      }
  }

  /** (the guest taken to another dimension, which lets go of every bar it had) nothing told */
  clear(): void {
    this.told.clear();
  }
}
