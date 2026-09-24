// Procedural audio for the game: every sound effect and all music is synthesised in code
// (no sampled assets). Generators are pure, deterministic functions that return mono PCM
// (Float32Array, -1..1) so they can run on the main thread, in a Web Worker or in Node.

import { blockSounds } from './gen/blocks';
import { mobSounds } from './gen/mobs';
import { MUSIC_TRACKS, MUSIC_TRACK_NAMES, renderMenuMusic, renderMusicTrack } from './gen/music';
import { playerSounds } from './gen/player';
import { worldSounds } from './gen/world';
import { minecartSounds } from './gen/minecart';
import { enchantingSounds } from './gen/enchanting';
import { boatSounds } from './gen/boat';
import { netherBlockSounds } from './gen/netherBlocks';
import { netherSounds } from './gen/nether';
import { netherMobSounds } from './gen/netherMobs';
import { netherMobSounds2 } from './gen/netherMobs2';
import { NETHER_MUSIC_POOLS, renderNetherMusic } from './gen/netherMusic';
import { END_MUSIC_POOLS, renderEndMusic } from './gen/endMusic';
import { crossbowSounds } from './gen/crossbow';
import { armorSounds } from './gen/armor';
import { villagerSounds } from './gen/villager';
import { ironGolemSounds } from './gen/ironGolem';
import { zombieVillagerSounds } from './gen/zombieVillager';
import { zombieDoorSounds } from './gen/zombieDoor';
import { villageSounds } from './gen/village';
import { endSounds } from './gen/end';
import { brewingSounds } from './gen/brewing';
import { witchSounds } from './gen/witch';

export const SAMPLE_RATE = 44100;

export interface SoundGen {
  /** number of distinct takes (the engine picks one at random per play) */
  variants: number;
  /** render take `variant` (0..variants-1) as mono PCM at `sampleRate` */
  generate(variant: number, sampleRate: number): Float32Array;
}

export const SOUNDS: Record<string, SoundGen> = {
  ...blockSounds(),
  ...playerSounds(),
  ...worldSounds(),
  ...mobSounds(),
  ...minecartSounds(),
  ...enchantingSounds(),
  ...boatSounds(),
  ...netherBlockSounds(),
  ...netherSounds(),
  ...netherMobSounds(),
  ...netherMobSounds2(),
  ...crossbowSounds(),
  ...armorSounds(),
  ...villagerSounds(),
  ...ironGolemSounds(),
  ...zombieVillagerSounds(),
  ...zombieDoorSounds(),
  ...villageSounds(),
  ...endSounds(),
  ...brewingSounds(),
  ...witchSounds(),
};

/** Number of in-game (overworld) music tracks. */
export const MUSIC_TRACK_COUNT: number = MUSIC_TRACKS;

/** Display names of the music tracks (index-aligned with generateMusicTrack). */
export const MUSIC_TRACK_TITLES: readonly string[] = MUSIC_TRACK_NAMES;

/**
 * Render in-game music track `index` (0..MUSIC_TRACK_COUNT-1): calm ambient piano, mono,
 * roughly 95–140 s, peak ~0.6, ending on a held chord that fades out. Takes ~1 s in Node,
 * so call it from a worker or during a loading screen.
 */
export function generateMusicTrack(index: number, sampleRate: number): Float32Array {
  return renderMusicTrack(index, sampleRate);
}

/** Render the title-screen music (dreamier, with synth arpeggios), mono, ~100 s, peak ~0.6. */
export function generateMenuMusic(sampleRate: number): Float32Array {
  return renderMenuMusic(sampleRate);
}

/** Situational music pools (vanilla music.nether.<biome>, music.end): event name -> number of tracks in it. */
export const MUSIC_POOLS: Record<string, number> = Object.fromEntries([...Object.entries(NETHER_MUSIC_POOLS), ...Object.entries(END_MUSIC_POOLS)].map(([k, v]) => [k, v.length]));

/**
 * Render track `index` (0..MUSIC_POOLS[pool]-1) of a situational pool: the Nether's dark ambient
 * pieces, mono, 120–150 s, RMS matched to the overworld tracks, peak <= 0.6; ~2 s in Node.
 */
export function generatePoolMusic(pool: string, index: number, sampleRate: number): Float32Array {
  return pool in END_MUSIC_POOLS ? renderEndMusic(pool, index, sampleRate) : renderNetherMusic(pool, index, sampleRate);
}

// ------------------------------------------------------------------ optional playback hints

export interface SoundHint {
  /** typical vanilla playback volume (every generator is peak-normalised to ~0.85) */
  volume: number;
  /** the take is a seamless loop */
  loop?: boolean;
}

const LOOPS = new Set([
  'weather.rain', 'weather.rain.above', 'block.fire.ambient', 'block.lava.ambient', 'block.water.ambient', 'entity.minecart.riding', 'entity.minecart.inside', 'entity.minecart.inside.underwater',
  'ambient.nether_wastes.loop', 'ambient.crimson_forest.loop', 'ambient.warped_forest.loop', 'ambient.soul_sand_valley.loop', 'ambient.basalt_deltas.loop',
]);
const VOLUMES: Record<string, number> = {
  'ui.button.click': 0.25,
  'ui.toast.in': 0.4,
  'ui.toast.out': 0.4,
  'entity.item.pickup': 0.2,
  'entity.experience_orb.pickup': 0.1,
  'entity.player.levelup': 0.75,
  'entity.generic.eat': 0.5,
  'entity.generic.drink': 0.5,
  'entity.player.burp': 0.5,
  'entity.player.swim': 0.35,
  'entity.player.splash': 0.4,
  'entity.player.splash.high_speed': 0.4,
  'weather.rain': 0.2,
  'weather.rain.above': 0.1,
  'ambient.cave': 0.7,
  'block.lava.ambient': 0.2,
  'block.lava.pop': 0.2,
  'block.water.ambient': 0.25,
  'block.chest.open': 0.5,
  'block.chest.close': 0.5,
  'block.stone_button.click_on': 0.3,
  'block.stone_button.click_off': 0.3,
  'block.wooden_button.click_on': 0.3,
  'block.wooden_button.click_off': 0.3,
  'block.stone_pressure_plate.click_on': 0.3,
  'block.stone_pressure_plate.click_off': 0.3,
  'block.wooden_pressure_plate.click_on': 0.3,
  'block.wooden_pressure_plate.click_off': 0.3,
  'block.metal_pressure_plate.click_on': 0.3,
  'block.metal_pressure_plate.click_off': 0.3,
  'block.lever.click': 0.3,
  'entity.bat.ambient': 0.1,
  'entity.bat.takeoff': 0.05,
  // fire, TNT, items
  'entity.tnt.primed': 1,
  'item.flintandsteel.use': 1,
  'item.firecharge.use': 1,
  'item.dye.use': 1,
  'entity.cow.milk': 1,
  'entity.generic.extinguish_fire': 0.7,
  'entity.generic.burn': 0.4,
  // player
  'entity.player.attack.knockback': 1,
  'entity.player.hurt_on_fire': 1,
  'entity.player.hurt_drown': 1,
  'entity.player.hurt_freeze': 1,
  // enderman (stare > 1 = heard from further away, as in vanilla)
  'entity.enderman.stare': 2.5,
  'entity.enderman.scream': 1,
  // squid (vanilla squid volume is 0.4)
  'entity.squid.ambient': 0.4,
  'entity.squid.hurt': 0.4,
  'entity.squid.death': 0.4,
  'entity.squid.squirt': 0.4,
  // slime: vanilla scales by size (0.4 per size step); big/medium vs tiny takes
  'entity.slime.squish': 0.8,
  'entity.slime.jump': 0.8,
  'entity.slime.hurt': 0.8,
  'entity.slime.death': 0.8,
  'entity.slime.attack': 1,
  'entity.slime.squish_small': 0.4,
  'entity.slime.jump_small': 0.4,
  'entity.slime.hurt_small': 0.4,
  'entity.slime.death_small': 0.4,
  'entity.magma_cube.squish': 0.8,
  'entity.magma_cube.jump': 0.8,
  'entity.magma_cube.hurt': 0.8,
  'entity.magma_cube.death': 0.8,
  'entity.magma_cube.squish_small': 0.4,
  'entity.magma_cube.hurt_small': 0.4,
  'entity.magma_cube.death_small': 0.4,
  // doors, trapdoors, gates
  'block.wooden_trapdoor.open': 1,
  'block.wooden_trapdoor.close': 1,
  'block.iron_door.open': 1,
  'block.iron_door.close': 1,
  'block.iron_trapdoor.open': 1,
  'block.iron_trapdoor.close': 1,
  'block.fence_gate.open': 1,
  'block.fence_gate.close': 1,
  // chain & lantern (fall = landing on the block: vanilla plays it at half the block volume)
  'block.chain.break': 1,
  'block.chain.place': 1,
  'block.chain.step': 0.15,
  'block.chain.hit': 0.25,
  'block.chain.fall': 0.5,
  'block.lantern.break': 1,
  'block.lantern.place': 1,
  'block.lantern.step': 0.15,
  'block.lantern.hit': 0.25,
  'block.lantern.fall': 0.5,
  // items & player
  'item.hoe.till': 1,
  'item.bone_meal.use': 1,
  'entity.player.teleport': 1,
  // anvil level events (vanilla LevelRenderer.levelEvent 1029-1031)
  'block.anvil.land': 0.3,
  // nether portal (ambient: from the block, 1 in 100 animate ticks; trigger / travel: non-positional)
  'block.portal.ambient': 0.5,
  'block.portal.trigger': 0.25,
  'block.portal.travel': 0.25,
  // ghast: its voice carries far (Ghast.getSoundVolume() is 5; warn / shoot are level events at 10)
  'entity.ghast.ambient': 5,
  'entity.ghast.hurt': 5,
  'entity.ghast.death': 5,
  'entity.ghast.scream': 5,
  'entity.ghast.warn': 10,
  'entity.ghast.shoot': 10,
  // zombified piglin anger plays at twice the voice volume (and 1.8x the voice pitch)
  'entity.zombified_piglin.angry': 2,
  // blaze fireballs: level event 1018 plays the shoot sound at 2, once per fireball
  'entity.blaze.shoot': 2,
  // village blocks: the bell carries twice as far (BellBlock.attemptToRing plays at 2)
  'block.bell.use': 2,
  'block.barrel.open': 0.5,
  'block.barrel.close': 0.5,
};

/**
 * Vanilla-like playback hints: steps play at 0.15, mining hits at 0.25, break/place at 1.0,
 * plus a few per-event volumes and loop flags. Purely advisory — use or ignore.
 */
export function soundHint(name: string): SoundHint {
  let volume = VOLUMES[name];
  if (volume === undefined) {
    if (/^(block|entity)\.[a-z_]+\.step$/.test(name)) volume = 0.15;
    else if (/^block\.[a-z_]+\.hit$/.test(name)) volume = 0.25;
    else if (/^block\.[a-z_]+\.fall$/.test(name)) volume = 0.5;
    else volume = 1;
  }
  return LOOPS.has(name) ? { volume, loop: true } : { volume };
}

