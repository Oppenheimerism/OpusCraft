// vanilla JukeboxSongs (data/minecraft/jukebox_song/*.json): each disc's song, its sound event, the description its
// tooltip shows, how long it plays and the comparator signal a jukebox playing it gives. The game has no jukebox yet;
// when it does, it plays these (music disc 5's song is rendered by audio/gen/disc5.ts, as the music pool of its
// sound event).

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
  // (bastions) its song is audio/gen/discPigstep.ts
  music_disc_pigstep: { sound: 'music_disc.pigstep', description: 'Lena Raine - Pigstep', lengthSeconds: 149, comparatorOutput: 13 },
};
