// The bees' buzzing (remaining mobs: the bee; vanilla BeeSoundInstance, BeeFlyingSoundInstance and
// BeeAggressiveSoundInstance): every bee has a loop of its wings that follows it, as loud as it's fast along the
// ground (from a hundredth of a block a tick up to full at half a block, 1.2 at most) and pitched up with its speed
// (0.7 to 1.1, a baby's 1.1 to 1.5), silent when it hovers still. An angry bee's loop is the aggressive one; the
// loop is swapped whenever the bee's anger comes or goes.

import type { SoundManager, LoopSound } from './soundManager';
import type { Level } from '../game/level';
import { Bee } from '../entity/bee';

export class BeeSounds {
  private level: Level | null = null;
  private readonly playing = new Map<Bee, { s: LoopSound; angry: boolean }>();

  constructor(private readonly sound: SoundManager) {}

  tick(level: Level): void {
    if (level !== this.level) {
      this.stopAll();
      this.level = level;
    }
    // vanilla ClientPacketListener.postAddEntitySoundInstance: every bee gets its loop, the aggressive one if angry
    // (a level with no entities to hear, as a stand-in for one may be: nothing new)
    for (const e of level.entities ?? []) if (e instanceof Bee && !e.removed && !this.playing.has(e)) this.start(e);
    for (const [bee, i] of this.playing) {
      if (bee.removed) {
        i.s.stop();
        this.playing.delete(bee);
        continue;
      }
      // vanilla BeeSoundInstance.shouldSwitchSounds: the other loop takes over when the anger changes
      if (bee.isAngry() !== i.angry) {
        i.s.stop();
        this.start(bee);
      }
      const s = this.playing.get(bee)!.s;
      // vanilla BeeSoundInstance.tick: Mth.lerp(clamp(f, min, max), min, max) for the pitch, as vanilla has it
      s.x = bee.x;
      s.y = bee.y;
      s.z = bee.z;
      const f = Math.sqrt(bee.dx * bee.dx + bee.dz * bee.dz);
      if (f >= 0.01) {
        const min = bee.isBaby() ? 1.1 : 0.7, max = bee.isBaby() ? 1.5 : 1.1;
        s.pitch = min + Math.min(max, Math.max(min, f)) * (max - min);
        s.volume = Math.min(0.5, f) * 1.2;
      } else {
        s.pitch = 0;
        s.volume = 0;
      }
    }
  }

  private start(bee: Bee): void {
    const angry = bee.isAngry();
    this.playing.set(bee, { s: this.sound.loop(angry ? 'entity.bee.loop_aggressive' : 'entity.bee.loop'), angry });
  }

  private stopAll(): void {
    for (const i of this.playing.values()) i.s.stop();
    this.playing.clear();
  }
}
