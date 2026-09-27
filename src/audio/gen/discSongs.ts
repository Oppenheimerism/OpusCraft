// (the eleven discs) The songs of the music discs the game was missing (vanilla JukeboxSongs BLOCKS, CHIRP, FAR,
// MALL, MELLOHI, STAL, STRAD, WARD, ELEVEN, WAIT and RELIC: the sound events music_disc.<song>). Like the rest of the
// soundtrack they are pieces of our own, nothing of the real ones but the mood: each is written for the discs' band
// (discBand.ts) in a file of its own, about as long as vanilla's song, and served as a music pool of one track
// (synth.ts MUSIC_POOLS) for the jukebox to play (game/jukebox.ts).

import { FAR_SECONDS, renderFar } from './discFar';
import { MELLOHI_SECONDS, renderMellohi } from './discMellohi';
import { RELIC_SECONDS, renderRelic } from './discRelic';
import { WAIT_SECONDS, renderWait } from './discWait';

/** each song's renderer and its length (vanilla JukeboxSong length_in_seconds), by sound event */
const SONGS: Record<string, { seconds: number; render: (sr: number) => Float32Array }> = {
  'music_disc.far': { seconds: FAR_SECONDS, render: renderFar },
  'music_disc.mellohi': { seconds: MELLOHI_SECONDS, render: renderMellohi },
  'music_disc.wait': { seconds: WAIT_SECONDS, render: renderWait },
  'music_disc.relic': { seconds: RELIC_SECONDS, render: renderRelic },
};

/** the songs as music pools of one track each */
export const DISC_SONG_POOLS: Record<string, number[]> = Object.fromEntries(Object.keys(SONGS).map((k) => [k, [0]]));

/** each song's length in seconds, by sound event */
export const DISC_SONG_SECONDS: Record<string, number> = Object.fromEntries(Object.entries(SONGS).map(([k, v]) => [k, v.seconds]));

/** render a song (a pool of one, so there's no index) */
export function renderDiscSong(pool: string, sr: number): Float32Array {
  return SONGS[pool].render(sr);
}
