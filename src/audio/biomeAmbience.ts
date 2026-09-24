// Biome ambience (vanilla BiomeAmbientSoundsHandler) for biomes that define their own sounds —
// the Nether's: each such biome has a loop that fades in over 40 ticks when you enter it and out
// when you leave (loops of the biomes you pass through overlap while crossfading), a mood sound
// played by the same moodiness accumulator that drives the cave sound (AmbientMoodSettings), and
// random additions played non-positionally (AmbientAdditionsSettings). Also answers which music
// pool the biome at the player asks for (vanilla Biome.getBackgroundMusic).

import type { Game } from '../game/game';
import { BIOMES } from '../world/gen/biomes';
import type { LoopSound, SoundManager } from './soundManager';

/** vanilla BiomeAmbientSoundsHandler.LOOP_SOUND_CROSS_FADE_TIME */
const FADE_TICKS = 40;
/** vanilla AmbientMoodSettings of the Nether biomes: tickDelay, blockSearchExtent, soundPositionOffset */
const MOOD_TICK_DELAY = 6000;
const MOOD_EXTENT = 8;
const MOOD_OFFSET = 2;
/** vanilla BiomeAmbientSoundsHandler.SKY_MOOD_RECOVERY_RATE */
const SKY_MOOD_RECOVERY = 0.001;

/**
 * Playback volumes (what sounds.json's per-sound volumes do in vanilla): the loops sit as a
 * constant bed under everything, additions are quiet details, moods are rare and more present.
 */
const LOOP_VOLUME: Record<string, number> = {
  'ambient.nether_wastes.loop': 0.26,
  'ambient.crimson_forest.loop': 0.25,
  'ambient.warped_forest.loop': 0.24,
  'ambient.soul_sand_valley.loop': 0.26,
  'ambient.basalt_deltas.loop': 0.34,
};
const ADDITIONS_VOLUME = 0.42;
const MOOD_VOLUME = 0.85;

/** vanilla BiomeAmbientSoundsHandler.LoopSoundInstance: volume = fade / 40, stopped once faded below zero */
interface Loop {
  sound: LoopSound;
  volume: number;
  fade: number;
  dir: number;
}

export class BiomeAmbience {
  private readonly loops = new Map<number, Loop>();
  private biome = -1;
  private world: unknown = null;
  private dim: unknown = null;
  private moodiness = 0;

  constructor(private readonly sound: SoundManager) {}

  /**
   * Per game tick. Returns true while the player is in a biome with its own mood sound — the
   * caller's cave mood (vanilla LEGACY_CAVE_SETTINGS) then stands aside for it.
   */
  tick(game: Game): boolean {
    const w = game.world;
    const p = game.player;
    if (w !== this.world || w.dim !== this.dim) {
      // a new world or dimension (the World object is reused across dimensions): vanilla starts a
      // fresh handler with the new player, and the old dimension's loops stop with the level change
      for (const l of this.loops.values()) l.sound.stop();
      this.loops.clear();
      this.biome = -1;
      this.moodiness = 0;
      this.world = w;
      this.dim = w.dim;
    }
    for (const [id, l] of this.loops) if (l.sound.stopped) this.loops.delete(id);
    // vanilla uses the (noise) biome at the player's position
    const id = w.getBiome3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    const amb = BIOMES[id]?.ambient;
    if (id !== this.biome) {
      this.biome = id;
      for (const l of this.loops.values()) {
        l.fade = Math.min(l.fade, FADE_TICKS);
        l.dir = -1;
      }
      if (amb) {
        let l = this.loops.get(id);
        if (!l) {
          const sound = this.sound.loop(amb.loop);
          sound.relative = true;
          l = { sound, volume: LOOP_VOLUME[amb.loop] ?? 0.25, fade: 0, dir: 0 };
          this.loops.set(id, l);
        }
        l.fade = Math.max(0, l.fade);
        l.dir = 1;
      }
    }
    // LoopSoundInstance.tick
    for (const l of this.loops.values()) {
      if (l.fade < 0) {
        l.sound.stop();
        continue;
      }
      l.fade += l.dir;
      l.sound.volume = l.volume * Math.min(1, Math.max(0, l.fade / FADE_TICKS));
    }
    if (!amb) return false;
    // AmbientAdditionsSettings: now and then a detail, heard wherever you are
    if (Math.random() < amb.additionsChance) this.sound.playUI(amb.additions, ADDITIONS_VOLUME, 1);
    // AmbientMoodSettings: darkness around the player slowly builds moodiness; at 1 the mood sound
    // plays from just beyond the sampled block
    const eyeY = p.y + p.eyeHeight;
    const span = MOOD_EXTENT * 2 + 1;
    const bx = Math.floor(p.x + Math.floor(Math.random() * span) - MOOD_EXTENT);
    const by = Math.floor(eyeY + Math.floor(Math.random() * span) - MOOD_EXTENT);
    const bz = Math.floor(p.z + Math.floor(Math.random() * span) - MOOD_EXTENT);
    const light = w.getLight(bx, by, bz);
    const sky = light >> 4;
    if (sky > 0) this.moodiness -= (sky / 15) * SKY_MOOD_RECOVERY;
    else this.moodiness -= ((light & 15) - 1) / MOOD_TICK_DELAY;
    if (this.moodiness >= 1) {
      const dx = bx + 0.5 - p.x, dy = by + 0.5 - eyeY, dz = bz + 0.5 - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const k = d > 1e-6 ? (d + MOOD_OFFSET) / d : 0;
      this.sound.play(amb.mood, p.x + dx * k, eyeY + dy * k, p.z + dz * k, MOOD_VOLUME, 1);
      this.moodiness = 0;
    } else {
      this.moodiness = Math.max(this.moodiness, 0);
    }
    return true;
  }

  /**
   * The music event of the biome at the player's feet (vanilla Biome.getBackgroundMusic), or null
   * for the overworld's own music. In the Nether every biome has one; a column that isn't loaded
   * yet still gets the Nether's rather than the Overworld's.
   */
  music(game: Game): string | null {
    const p = game.player;
    const w = game.world;
    // (vanilla Minecraft.getSituationalMusic: the End has its own, whatever the biome)
    if (w.dim.id === 'the_end') return 'music.end';
    const id = w.getBiome3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    return BIOMES[id]?.ambient?.music ?? (w.dim.id === 'the_nether' ? 'music.nether.nether_wastes' : null);
  }

  /** the moodiness accumulator 0..1 (vanilla getMoodiness) */
  getMoodiness(): number {
    return this.moodiness;
  }
}
