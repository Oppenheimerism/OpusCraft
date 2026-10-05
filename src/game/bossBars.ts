// Which boss bars a player is shown (vanilla ServerBossEvent.getPlayers: each bar has the players it's shown to). The
// game's own screen asks for its player's (gui/hud.ts), a host for each of its guests' (net/server/session.ts), and a
// guest's game for the ones its host sent it (net/client/clientSession.ts): every boss event comes through here, so a
// new one only needs a source.

import type { BossBar } from '../gui/bossOverlay';
import type { Level } from './level';
import type { Player } from '../entity/player';

/**
 * the bars a source shows `viewer` in `level` (nulls left out); `viewDistance`: the viewer's, in chunks (the wither's
 * bar goes to the players who track it, which depends on it)
 */
export type BossBarSource = (level: Level, viewer: Player, viewDistance: number) => readonly (BossBar | null)[];

const sources: BossBarSource[] = [
  // the ender dragon's: the players in its arena (game/endDragonFight.ts)
  (level, viewer) => [level.dragonFight?.shownBar(viewer) ?? null],
  // (Stage 4: raids) each raid's: the players round it (game/raids.ts)
  (level, viewer) => level.raids.shownBars(viewer),
];

/** another kind of boss bar (the wither's, say): what it shows to whom */
export function addBossBarSource(s: BossBarSource): void {
  if (!sources.includes(s)) sources.push(s);
}

/**
 * every bar `viewer` is shown in `level`, in the sources' order (vanilla: the ServerBossEvents it was added to);
 * `viewDistance`: the viewer's (the game's own render distance, or a guest's), 10 chunks where no one says
 */
export function bossBarsShownTo(level: Level, viewer: Player | null, viewDistance = 10): BossBar[] {
  const out: BossBar[] = [];
  if (!viewer) return out;
  for (const s of sources) for (const b of s(level, viewer, viewDistance)) if (b && !out.includes(b)) out.push(b);
  return out;
}
