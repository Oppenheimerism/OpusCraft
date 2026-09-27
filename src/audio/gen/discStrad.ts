// (the eleven discs) Music disc strad (vanilla music_disc.strad, 3:08): a piece of our own in the disc's cheerful,
// chiptune-ish mood, for the discs' band (discBand.ts) at half the sample rate. An old games console's four voices: a
// quarter pulse singing the tune with a vibrato that comes in late, a thinner pulse for harmonies and the echo, a
// square rattling through the chords in arpeggios, a triangle for the bass, and noise for the drums. In G major: an
// opening, a tune, a second tune, the first with its echo, a wistful turn to E minor, a driving stretch, and the tune
// once more a step higher, as such tunes like to end, before a last run up the chord.

import { Rng } from './dsp';
import { type Note, Mix } from './netherMusic';
import { burst, thump } from './texture';
import { Clock, type Chord, above, across, chords, close, finishSong, lead, line } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 188) */
export const STRAD_SECONDS = 188;

const C = new Clock(146);
const OPEN = chords('G Em C D G Em C D', 4);
const A = chords('G Bm C D G Em Am7 D G Bm C D Em C D G', 4);
const B = chords('C D Bm Em Am D G G7 C D B7 Em Am D Gsus4 G', 4);
const CC = chords('Em C D Bm Em Am B7 B7', 4);
const D = chords('C D Em Em C D G G', 4);
const A_UP = chords('A C#m D E A F#m Bm7 E A C#m D E F#m D E A', 4);
const CLOSE = chords('A F#m D E A F#m D:2 E:2 A A:8', 4);

const TUNE_A = [
  'D5:1 G5:1 B5:2 A5:1 G5:1 D5:2', 'F#5:3 D5:1 B4:2 D5:2', 'E5:1 G5:1 C6:2 B5:1 A5:1 G5:2', 'A5:6 r:2',
  'B5:1 D6:1 B5:1 G5:1 A5:2 B5:2', 'G5:2 E5:2 B4:2 E5:2', 'C6:2 B5:1 A5:1 G5:2 E5:2', 'F#5:4 A5:4',
  'D5:1 G5:1 B5:2 A5:1 G5:1 D5:2', 'F#5:3 A5:1 B5:2 D6:2', 'E6:2 D6:1 C6:1 B5:2 G5:2', 'A5:2 F#5:2 D5:4',
  'G5:1 B5:1 E6:2 D6:1 B5:1 G5:2', 'E5:1 G5:1 C6:2 E6:2 C6:2', 'D6:2 C6:1 B5:1 A5:2 F#5:2', 'G5:6 r:2',
].join(' | ');
const TUNE_B = [
  'E5:3 G5:1 C6:3 E6:1', 'D6:3 C6:1 A5:4', 'B5:3 A5:1 F#5:2 D5:2', 'E5:6 G5:2', 'A5:3 C6:1 E6:3 D6:1', 'C6:2 A5:2 F#5:2 D6:2', 'B5:4 D6:2 G6:2', 'F6:4 D6:4',
  'E6:3 D6:1 C6:3 G5:1', 'A5:3 B5:1 C6:2 D6:2', 'D#6:2 F#6:2 A6:2 F#6:2', 'G6:4 E6:4', 'C6:2 E6:2 A6:2 G6:2', 'F#6:2 E6:2 D6:2 C6:2', 'C6:4 D6:4', 'B5:6 r:2',
].join(' | ');
const TUNE_C = 'B5:4 G5:2 E5:2 | E5:4 G5:4 | F#5:4 A5:2 D6:2 | B5:8 | E6:4 D6:2 B5:2 | C6:4 A5:2 E5:2 | D#5:4 F#5:2 A5:2 | B5:8';
const TUNE_D = 'E5:1 G5:1 C6:1 G5:1 E6:2 C6:2 | F#5:1 A5:1 D6:1 A5:1 F#6:2 D6:2 | G5:1 B5:1 E6:1 B5:1 G6:2 E6:2 | F#6:2 E6:2 D6:2 B5:2 | E6:2 C6:1 G5:1 C6:2 E6:2 | D6:2 A5:1 F#5:1 A5:2 D6:2 | B5:1 D6:1 G6:1 D6:1 B5:1 G5:1 D5:2 | G5:6 r:2';
const TUNE_CLOSE = 'E5:1 A5:1 C#6:2 B5:1 A5:1 E5:2 | C#6:4 A5:4 | F#5:1 A5:1 D6:2 C#6:1 B5:1 A5:2 | B5:6 r:2 | E5:1 A5:1 C#6:2 B5:1 A5:1 E5:2 | C#6:4 E6:4 | D6:2 C#6:2 B5:2 G#5:2 | A5:8';

/** where each part begins, in bars (114 in all) */
const S_A1 = 8, S_B = 24, S_A2 = 40, S_C = 56, S_D = 72, S_A3 = 88, S_CLOSE = 104, END = 114;

const SONG = [
  ...across(OPEN, 0, 4), ...across(A, S_A1, 4), ...across(B, S_B, 4), ...across(A, S_A2, 4), ...across(CC, S_C, 4), ...across(CC, S_C + 8, 4),
  ...across(D, S_D, 4), ...across(D, S_D + 8, 4), ...across(A_UP, S_A3, 4), ...across(CLOSE, S_CLOSE, 4),
];

/** the console's noise channel: a burst whose level steps down as a sound chip's volume does */
function noiseHit(b: Float32Array, sr: number, rng: Rng, t: number, len: number, amp: number, hp: number): void {
  burst(b, sr, rng, { t, dur: len, tau: len, amp, hp, env: (x) => Math.round(15 * Math.max(0, 1 - x / len)) / 15 });
}

/** the arpeggio channel: the chord's notes in turn, a thirty-second each, as one unbroken tone */
function arps(sect: { ch: Chord; beat: number }[], vel: number): Note[] {
  const out: Note[] = [];
  for (const { ch, beat } of sect) {
    const v = close(ch, 67, 3);
    for (let k = 0; k < ch.beats * 8; k++) out.push(C.note(0, beat + k / 8, 1 / 8, v[k % v.length], vel));
  }
  return out;
}

export function renderStrad(sr: number): Float32Array {
  const rng = new Rng(0x57ad0);
  const L = STRAD_SECONDS;
  const m = new Mix(sr / 2, L);
  const inBars = (from: number, to: number) => SONG.filter(({ beat }) => beat >= from * 4 && beat < to * 4);

  // the tune: a quarter pulse, its vibrato arriving late on the long notes
  m.part(-2, (b, hs) => {
    const notes = [
      ...line(C, TUNE_A, S_A1, 0.5, 8, 0.85), ...line(C, TUNE_B, S_B, 0.5, 8, 0.85), ...line(C, TUNE_A, S_A2, 0.5, 8, 0.85),
      ...line(C, TUNE_C, S_C, 0.5, 8, 0.8), ...line(C, TUNE_C, S_C + 8, 0.5, 8, 0.85), ...line(C, TUNE_D, S_D, 0.5, 8, 0.85),
      ...line(C, TUNE_D, S_D + 8, 0.5, 8, 0.9), ...line(C, TUNE_A, S_A3, 0.5, 8, 0.9, 2), ...line(C, TUNE_CLOSE, S_CLOSE, 0.5, 8, 0.85),
    ].map((n) => ({ ...n, dur: n.dur * 0.9 }));
    lead(b, hs, rng, notes, { wave: 'pulse', attack: 0.004, release: 0.03, vib: [6.5, 0.012, 0.22], slur: 0, cutoff: { base: 5200, key: 0 } });
  });

  // the thin pulse: a third below the tune in the second tune, and the tune's echo, three sixteenths behind, the second time
  m.part(-10, (b, hs) => {
    const third = line(C, TUNE_B, S_B, 0.5, 8, 0.7).map((n) => ({ ...n, midi: n.midi - (isMajorThird(n.midi) ? 4 : 3), dur: n.dur * 0.85 }));
    const echoed = [...line(C, TUNE_A, S_A2, 0.5, 8, 0.6), ...line(C, TUNE_A, S_A3, 0.5, 8, 0.6, 2)].map((n) => ({ ...n, t: n.t + 0.75 * C.spb, dur: n.dur * 0.85 }));
    lead(b, hs, rng, [...third, ...echoed], { wave: 'thin', attack: 0.004, release: 0.03, slur: 0, cutoff: { base: 4500, key: 0 } });
  });

  // the arpeggios: through the opening, under the wistful turn and the driving stretch, and at the close
  m.part(-11, (b, hs) => {
    const notes = [...arps(inBars(0, S_A1), 0.7), ...arps(inBars(S_C, S_D + 16), 0.75), ...arps(inBars(S_CLOSE, END - 2), 0.7)];
    // (a last run up the chord, and the chord rattling on, dying away)
    for (let k = 0; k < 8; k++) notes.push(C.note(END - 2, k / 4, 1 / 4, [69, 73, 76][k % 3] + 12 * Math.floor(k / 3), 0.75));
    for (let k = 0; k < 48; k++) notes.push(C.note(END - 2, 2 + k / 8, 1 / 8, [81, 85, 88][k % 3], 0.7 * (1 - k / 52)));
    lead(b, hs, rng, notes, { wave: 'square', attack: 0.003, release: 0.05, slur: 0.01, cutoff: { base: 4000, key: 0 } });
  });

  // the triangle's bass: root and octave in eighths, from the fifth bar to the end
  m.part(-6, (b, hs) => {
    const notes: Note[] = [];
    for (const { ch, beat } of SONG) {
      if (beat < 16 || beat >= (END - 2) * 4) continue;
      const root = above(ch.bass, 31);
      const busy = beat >= S_D * 4 && beat < S_A3 * 4;
      for (let k = 0; k < ch.beats * 2; k++) notes.push(C.note(0, beat + k / 2, busy ? 0.4 : 0.45, root + (k % 2 ? 12 : 0), 0.9));
    }
    notes.push(C.note(END - 2, 3, 4, 45, 0.9));
    lead(b, hs, rng, notes, { wave: 'tri', attack: 0.003, release: 0.03, slur: 0 });
  });

  // the noise channel: a kick on one and three (the driving stretch adds the and of two), a snare on two and four, hats in eighths
  m.part(-8, (b, hs) => {
    for (let bar = 4; bar < END - 2; bar++) {
      const full = bar >= 6;
      const drive = bar >= S_D && bar < S_A3;
      if (full) for (const bt of drive ? [0, 1.5, 2] : [0, 2]) thump(b, hs, { t: C.at(bar, bt), f0: 190, f1: 55, glide: 0.018, tau: 0.07, amp: 1 });
      if (full) for (const bt of [1, 3]) noiseHit(b, hs, rng, C.at(bar, bt), 0.13, 0.9, 900);
      for (let k = 0; k < 8; k++) noiseHit(b, hs, rng, C.at(bar, k / 2), k % 2 ? 0.03 : 0.05, k % 2 ? 0.35 : 0.5, 7000);
      // (a fill at the end of every eighth bar)
      if (full && bar % 8 === 7) for (const bt of [3.25, 3.5, 3.75]) noiseHit(b, hs, rng, C.at(bar, bt), 0.08, 0.7, 1200);
    }
  });

  return finishSong(m, sr, { t60: 0.9, wet: 0.12, size: 1 }, 3, 0.1, L);
}

/** whether the note a major third below `midi` is in G major (else a minor third is) */
function isMajorThird(midi: number): boolean {
  const pc = (((midi - 4) % 12) + 12) % 12;
  return [7, 9, 11, 0, 2, 4, 6].includes(pc);
}
