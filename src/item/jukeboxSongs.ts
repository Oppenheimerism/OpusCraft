// vanilla JukeboxSongs (data/minecraft/jukebox_song/*.json): each disc's song, its sound event, the description its
// tooltip shows, how long it plays and the comparator signal a jukebox playing it gives. The jukebox (game/jukebox.ts)
// plays these; the songs themselves are music pools of their sound events (audio/gen/discMusic.ts, disc5.ts).

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
  music_disc_otherside: { sound: 'music_disc.otherside', description: 'Lena Raine - otherside', lengthSeconds: 195, comparatorOutput: 14 },
  music_disc_5: { sound: 'music_disc.5', description: 'Samuel Åberg - 5', lengthSeconds: 178, comparatorOutput: 15 },
  // (jukebox) the trial chambers' discs
  music_disc_creator: { sound: 'music_disc.creator', description: 'Lena Raine - Creator', lengthSeconds: 176, comparatorOutput: 12 },
  music_disc_creator_music_box: { sound: 'music_disc.creator_music_box', description: 'Lena Raine - Creator (Music Box)', lengthSeconds: 73, comparatorOutput: 11 },
  music_disc_precipice: { sound: 'music_disc.precipice', description: 'Aaron Cherof - Precipice', lengthSeconds: 299, comparatorOutput: 13 },
};

/** vanilla JukeboxSong.lengthInTicks: the length rounded up to a whole tick */
export function lengthInTicks(song: JukeboxSong): number {
  return Math.ceil(song.lengthSeconds * 20);
}

/** vanilla JukeboxSong.hasFinished: a second past its length */
export function hasFinished(song: JukeboxSong, ticks: number): boolean {
  return ticks >= lengthInTicks(song) + 20;
}
