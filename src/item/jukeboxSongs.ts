// vanilla JukeboxSongs (data/minecraft/jukebox_song/*.json): each disc's song, its sound event, the description its
// tooltip shows, how long it plays and the comparator signal a jukebox playing it gives. The jukebox (game/jukebox.ts)
// plays these; the songs themselves are music pools of their sound events (audio/gen/discMusic.ts, disc5.ts,
// discPigstep.ts and, for the rest of C418's and Relic, discSongs.ts).

export interface JukeboxSong {
  sound: string;
  description: string;
  lengthSeconds: number;
  comparatorOutput: number;
}

/** by the disc's item id (vanilla DataComponents.JUKEBOX_PLAYABLE) */
export const JUKEBOX_SONGS: Record<string, JukeboxSong> = {
  music_disc_13: { sound: 'music_disc.13', description: 'C418 - 13', lengthSeconds: 178, comparatorOutput: 1 },
  music_disc_cat: { sound: 'music_disc.cat', description: 'C418 - cat', lengthSeconds: 185, comparatorOutput: 2 },
  music_disc_blocks: { sound: 'music_disc.blocks', description: 'C418 - blocks', lengthSeconds: 345, comparatorOutput: 3 },
  music_disc_chirp: { sound: 'music_disc.chirp', description: 'C418 - chirp', lengthSeconds: 185, comparatorOutput: 4 },
  music_disc_far: { sound: 'music_disc.far', description: 'C418 - far', lengthSeconds: 174, comparatorOutput: 5 },
  music_disc_mall: { sound: 'music_disc.mall', description: 'C418 - mall', lengthSeconds: 197, comparatorOutput: 6 },
  music_disc_mellohi: { sound: 'music_disc.mellohi', description: 'C418 - mellohi', lengthSeconds: 96, comparatorOutput: 7 },
  music_disc_stal: { sound: 'music_disc.stal', description: 'C418 - stal', lengthSeconds: 150, comparatorOutput: 8 },
  music_disc_strad: { sound: 'music_disc.strad', description: 'C418 - strad', lengthSeconds: 188, comparatorOutput: 9 },
  music_disc_ward: { sound: 'music_disc.ward', description: 'C418 - ward', lengthSeconds: 251, comparatorOutput: 10 },
  music_disc_11: { sound: 'music_disc.11', description: 'C418 - 11', lengthSeconds: 71, comparatorOutput: 11 },
  music_disc_wait: { sound: 'music_disc.wait', description: 'C418 - wait', lengthSeconds: 238, comparatorOutput: 12 },
  music_disc_otherside: { sound: 'music_disc.otherside', description: 'Lena Raine - otherside', lengthSeconds: 195, comparatorOutput: 14 },
  music_disc_5: { sound: 'music_disc.5', description: 'Samuel Åberg - 5', lengthSeconds: 178, comparatorOutput: 15 },
  // (the trail ruins' disc, from their rare suspicious gravel: there are no trail ruins yet)
  music_disc_relic: { sound: 'music_disc.relic', description: 'Aaron Cherof - Relic', lengthSeconds: 218, comparatorOutput: 14 },
  // (jukebox) the trial chambers' discs
  music_disc_creator: { sound: 'music_disc.creator', description: 'Lena Raine - Creator', lengthSeconds: 176, comparatorOutput: 12 },
  music_disc_creator_music_box: { sound: 'music_disc.creator_music_box', description: 'Lena Raine - Creator (Music Box)', lengthSeconds: 73, comparatorOutput: 11 },
  music_disc_precipice: { sound: 'music_disc.precipice', description: 'Aaron Cherof - Precipice', lengthSeconds: 299, comparatorOutput: 13 },
  // (bastions) its song is audio/gen/discPigstep.ts
  music_disc_pigstep: { sound: 'music_disc.pigstep', description: 'Lena Raine - Pigstep', lengthSeconds: 149, comparatorOutput: 13 },
};

/** vanilla #creeper_drop_music_discs: what a creeper killed by a skeleton drops one of (entity/monsters.ts Creeper) */
export const CREEPER_DROP_MUSIC_DISCS: readonly string[] = ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'wait'].map((d) => `music_disc_${d}`);

/** vanilla JukeboxSong.lengthInTicks: the length rounded up to a whole tick */
export function lengthInTicks(song: JukeboxSong): number {
  return Math.ceil(song.lengthSeconds * 20);
}

/** vanilla JukeboxSong.hasFinished: a second past its length */
export function hasFinished(song: JukeboxSong, ticks: number): boolean {
  return ticks >= lengthInTicks(song) + 20;
}
