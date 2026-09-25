// The wind while gliding (vanilla ElytraOnPlayerSoundInstance): every time the player's glide starts, a loop of rushing
// air that follows them. It's silent for the first second, fades in over the next, and from then on is as loud as the
// glider is fast (the speed squared over 4, full from two blocks a tick), pitched up a little at the loudest. It stops
// once the glide has ended and at least a second has gone by.

import type { SoundManager, LoopSound } from './soundManager';
import type { Level } from '../game/level';
import type { Player } from '../entity/player';

/** vanilla ElytraOnPlayerSoundInstance.DELAY */
const DELAY = 20;

export class ElytraSounds {
  private level: Level | null = null;
  private wasFlying = false;
  private readonly playing: { s: LoopSound; time: number }[] = [];

  constructor(private readonly sound: SoundManager) {}

  tick(level: Level, player: Player): void {
    if (level !== this.level) {
      for (const i of this.playing) i.s.stop();
      this.playing.length = 0;
      this.level = level;
      this.wasFlying = false;
    }
    // vanilla LocalPlayer.onSyncedDataUpdated: the glide starting starts one
    if (player.fallFlying && !this.wasFlying) this.playing.push({ s: this.sound.loop('item.elytra.flying'), time: 0 });
    this.wasFlying = player.fallFlying;
    for (let k = this.playing.length - 1; k >= 0; k--) {
      const i = this.playing[k], s = i.s;
      i.time++;
      if (player.removed || (i.time > DELAY && !player.fallFlying)) {
        s.stop();
        this.playing.splice(k, 1);
        continue;
      }
      s.x = player.x;
      s.y = player.y;
      s.z = player.z;
      const f = Math.fround(player.dx * player.dx + player.dy * player.dy + player.dz * player.dz);
      let v = f >= 1e-7 ? Math.min(1, Math.max(0, f / 4)) : 0;
      if (i.time < DELAY) v = 0;
      else if (i.time < DELAY * 2) v *= (i.time - DELAY) / DELAY;
      s.volume = v;
      s.pitch = v > 0.8 ? 1 + (v - 0.8) : 1;
    }
  }
}
