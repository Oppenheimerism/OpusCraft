// (the eleven discs) Music disc Relic (vanilla music_disc.relic, 3:38): a piece of our own in the disc's warm,
// wistful mood, for the discs' band (discBand.ts) at half the sample rate. A slow piano in B-flat, its left hand
// rocking through broken chords, sings a tune that keeps leaning on a borrowed minor chord; a cello takes the tune up
// under it, strings swell in for the second tune, which the cello sings too with the piano answering high above;
// bells ring through a short pause, piano and cello play the first tune together in octaves, and the piano is left to
// wander home alone.

import { Rng } from './dsp';
import { addBell, renderBass, renderPads } from './instruments';
import { type Note, Mix, piano } from './netherMusic';
import { Clock, above, across, chords, close, finishSong, lead, line } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 218) */
export const RELIC_SECONDS = 218;

const C = new Clock(63);
const INTRO = chords('Bbmaj9 Ebmaj9 Bbmaj9 F7sus4', 4);
const A = chords('Bb Dm7/A Gm7 Ebmaj7 Bb/D Cm7 Ebm6 F7sus4:2 F7:2', 4);
const B = chords('Gm Dm/F Ebmaj7 Bb/D Cm7 Gm7 Ab F', 4);
const PAUSE = chords('Ebmaj7 Bb/D Cm7 F7sus4:2 F7:2', 4);
const CODA = chords('Bb Ebm6/Bb Bb Ebm6/Bb Gm7 Ebmaj7 Bbmaj9:8', 4);

const TUNE_A = 'D5:4 F5:2 Bb5:2 | A5:4 F5:2 D5:2 | F5:3 D5:1 Bb4:4 | G4:2 Bb4:2 D5:4 | F5:3 Eb5:1 D5:2 Bb4:2 | C5:2 Eb5:2 G5:4 | Gb5:4 F5:2 Eb5:2 | F5:4 Eb5:2 C5:2';
const TUNE_B = 'Bb5:4 A5:2 G5:2 | F5:4 D5:4 | Eb5:2 G5:2 Bb5:2 D6:2 | D6:4 C6:2 Bb5:2 | C6:3 Bb5:1 G5:2 Eb5:2 | D5:4 F5:4 | Eb5:3 C5:1 Ab4:4 | A4:4 C5:4';
const ANSWER = 'r:4 D6:2 Bb5:2 | A5:4 r:4 | r:4 G6:2 D6:2 | F6:4 r:4 | r:4 Eb6:2 C6:2 | Bb5:4 r:4 | r:4 C6:2 Eb6:2 | C6:4 A5:4';
const HOME = 'D5:4 F5:2 Bb5:2 | Gb5:8 | F5:3 D5:1 Bb4:4 | C5:4 Bb4:4 | G4:2 Bb4:2 D5:4 | G4:2 Bb4:2 Eb5:4 | D5:8';
const OPENING = 'r:2 F5:2 D5:4 | r:2 G5:2 Bb4:4 | r:2 F5:2 D5:2 C5:2 | Eb5:4 C5:4';
const BELLS = 'Bb6:4 G6:4 | F6:8 | Eb6:4 G6:4 | F6:4 A6:4';

/** where each part begins, in bars (56 in all, the last chord ringing to the end) */
const S_A1 = 4, S_A2 = 12, S_B1 = 20, S_B2 = 28, S_PAUSE = 36, S_A3 = 40, S_CODA = 48;

const SONG = [
  ...across(INTRO, 0, 4), ...across(A, S_A1, 4), ...across(A, S_A2, 4), ...across(B, S_B1, 4), ...across(B, S_B2, 4),
  ...across(PAUSE, S_PAUSE, 4), ...across(A, S_A3, 4), ...across(CODA, S_CODA, 4),
];

/** how strongly each part is played: rising to the octaves, and falling away at the end */
function dyn(beat: number): number {
  const bar = beat / 4;
  if (bar < S_A1) return 0.75;
  if (bar < S_B1) return 0.85;
  if (bar < S_B2) return 0.95;
  if (bar < S_PAUSE) return 1;
  if (bar < S_A3) return 0.78;
  if (bar < S_CODA) return 1.05;
  return 0.85 - 0.25 * ((bar - S_CODA) / 8);
}

/** the left hand: the bass, then the chord above it broken in eighths, rocking up and back; the last chord rolled */
function leftHand(rng: Rng): Note[] {
  const out: Note[] = [];
  for (const { ch, beat } of SONG) {
    const bass = above(ch.bass, 34);
    const v = [bass, ...close(ch, bass + 7, 3)];
    if (ch.beats > 4) {
      v.forEach((midi, k) => out.push(at(beat + k * 0.35, ch.beats - k * 0.35, midi, 0.42 * dyn(beat), rng)));
      continue;
    }
    const pat = [0, 1, 2, 3, 2, 1, 2, 1];
    for (let k = 0; k < ch.beats * 2; k++) {
      const b = beat + k / 2;
      out.push(at(b, beat + ch.beats - b + 0.1, v[pat[k % 8]], (k === 0 ? 0.46 : k % 2 ? 0.3 : 0.34) * dyn(b), rng));
    }
  }
  return out;
}

function at(b: number, beats: number, midi: number, vel: number, rng: Rng): Note {
  return { t: Math.max(0, C.time(b) + rng.gauss() * 0.006), dur: beats * C.spb, midi, vel };
}

/** a line's notes played with the piece's dynamics */
const shaped = (ns: Note[]): Note[] => ns.map((n) => ({ ...n, vel: n.vel * dyn(n.t / C.spb) }));

export function renderRelic(sr: number): Float32Array {
  const rng = new Rng(0x9e11c5);
  const L = RELIC_SECONDS;
  const m = new Mix(sr / 2, L);

  // the piano: its left hand throughout, the tunes in its right, its answers high up, and the way home
  m.part(-2, (b, hs) => {
    const notes = [
      ...leftHand(rng),
      ...shaped(line(C, TUNE_A, S_A1, 0.5, 8, 0.6)), ...shaped(line(C, TUNE_B, S_B1, 0.5, 8, 0.62)), ...shaped(line(C, ANSWER, S_B2, 0.5, 8, 0.45)),
      ...shaped(line(C, TUNE_A, S_A3, 0.5, 8, 0.62)), ...shaped(line(C, HOME, S_CODA, 0.5, 8, 0.5)), ...shaped(line(C, OPENING, 0, 0.5, 8, 0.5)),
    ];
    piano(b, hs, rng, notes, 0x9e11c5, 0.3);
  });

  // the cello: the first tune an octave down, then the second, then the first again with the piano, in octaves
  m.part(-5, (b, hs) => {
    const notes = [...line(C, TUNE_A, S_A2, 0.5, 8, 0.75, -12), ...line(C, TUNE_B, S_B2, 0.5, 8, 0.8, -12), ...line(C, TUNE_A, S_A3, 0.5, 8, 0.82, -12)];
    lead(b, hs, rng, notes, {
      wave: 'saw', attack: 0.2, release: 0.35, glide: 0.06, slur: 0.1, vib: [5.2, 0.006, 0.3],
      cutoff: { base: 850, amt: 0.9, key: 0.3 }, formants: [[290, 2.2, 0.45], [1150, 3, 0.18]], breath: 0.03,
    });
  });

  // the strings, soft under the second cello and fuller from the second tune on
  m.part(-12, (b, hs) => {
    const notes = SONG.filter(({ beat }) => beat >= S_A2 * 4 && beat < S_CODA * 4 + 16).flatMap(({ ch, beat }) =>
      close(ch, 55, 4).map((midi) => ({ t: C.time(beat), dur: ch.beats * C.spb + 0.4, midi, vel: 0.45 + 0.35 * (beat >= S_B1 * 4 ? 1 : 0) })));
    renderPads(b, hs, rng, notes, { attack: 2.2, release: 3, voices: 3, detune: 9, cutoff: 1300, move: 0.25 });
  });

  // the bass under the second tune and the octaves
  m.part(-10, (b, hs) => {
    const notes = SONG.filter(({ beat }) => (beat >= S_B1 * 4 && beat < S_PAUSE * 4) || (beat >= S_A3 * 4 && beat < S_CODA * 4))
      .map(({ ch, beat }) => ({ t: C.time(beat), dur: (ch.beats - 0.2) * C.spb, midi: above(ch.bass, 29), vel: 0.8 }));
    renderBass(b, hs, notes);
  });

  // bells in the pause
  m.part(-12, (b, hs) => {
    for (const n of line(C, BELLS, S_PAUSE, 0.5, 8, 0.6)) addBell(b, hs, n.t, n.midi, n.vel);
  });

  return finishSong(m, sr, { t60: 3.2, wet: 0.55, size: 2 }, 7, 0.08, L);
}
