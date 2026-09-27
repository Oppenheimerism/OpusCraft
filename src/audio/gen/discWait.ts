// (the eleven discs) Music disc wait (vanilla music_disc.wait, 3:58): a piece of our own in the disc's calm, gentle
// mood, for the discs' band (discBand.ts) at half the sample rate. A nylon-string guitar picks its way through slow,
// open chords in D; an electric piano sings the first tune over a soft pad and a round bass, a shaker comes in under the
// second, bells ring through a quiet interlude, a flute takes the first tune back, the piano a last one, and the guitar
// is left alone at the end on a long, open chord.

import { Rng } from './dsp';
import { addBell, renderBass, renderPads } from './instruments';
import { type Note, Mix } from './netherMusic';
import { Clock, type Chord, above, across, chords, close, epiano, finishSong, lead, line, pluck, rootless, shaker, tremolo } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 238) */
export const WAIT_SECONDS = 238;

const C = new Clock(76);
const INTRO = chords('Dmaj7 Gmaj7/D Dmaj7 Gmaj7/D', 4);
const A = chords('Dmaj7 Gmaj7/D Dmaj7 A/C# Bm7 Gmaj7 Em7 Asus4:2 A:2 Dmaj7 Gmaj7/D F#m7 Bm7 Gmaj7 A/G F#m7:2 Bm7:2 Em7:2 Asus4:2', 4);
const B = chords('Gmaj7 A6 F#m7 Bm7 Em9 A7sus4 Dmaj7 Dmaj7 Gmaj7 A6 F#m7 Bm7 Em9 Gm6 Dmaj7/A A7', 4);
const INTER = chords('Gmaj7 A6 F#m7 Bm7 Gmaj7 A6 Em9 Asus4:2 A:2', 4);
const CC = chords('Bm7 F#m7 Gmaj7 Dmaj7/F# Em7 Bm7 Gmaj7 Asus4', 4);
const CODA = chords('Dmaj7 Gmaj7/D Dmaj7 Gmaj7/D Dmaj9:8', 4);

const TUNE_A = [
  'F#5:3 E5:1 D5:2 A4:2', 'B4:6 r:2', 'A4:2 D5:2 F#5:2 A5:2', 'E5:6 C#5:2', 'D5:3 C#5:1 B4:2 F#4:2', 'G4:2 B4:2 D5:2 F#5:2', 'E5:4 D5:2 B4:2', 'D5:4 C#5:4',
  'F#5:3 E5:1 D5:2 A5:2', 'B5:4 A5:2 F#5:2', 'A5:3 E5:1 C#5:4', 'D5:2 F#5:2 B5:4', 'A5:3 G5:1 F#5:2 D5:2', 'E5:4 C#5:4', 'C#5:2 E5:2 D5:2 F#5:2', 'E5:4 D5:4',
].join(' | ');
const TUNE_B = [
  'B5:4 A5:2 F#5:2', 'F#5:4 E5:2 C#5:2', 'E5:3 C#5:1 A4:4', 'B4:2 D5:2 F#5:4', 'G5:3 F#5:1 E5:2 B4:2', 'D5:4 E5:4', 'C#5:3 D5:1 E5:2 F#5:2', 'A5:8',
  'D6:4 B5:2 A5:2', 'C#6:4 A5:2 F#5:2', 'E5:4 A5:4', 'F#5:4 D5:4', 'B4:2 E5:2 G5:2 F#5:2', 'E5:4 Bb4:4', 'F#5:4 A5:4', 'G5:4 E5:2 C#5:2',
].join(' | ');
const TUNE_C = ['F#5:4 D5:2 B4:2', 'C#5:6 A4:2', 'B4:2 D5:2 F#5:2 A5:2', 'A5:4 F#5:4', 'G5:4 E5:2 B4:2', 'D5:4 F#5:4', 'B5:6 A5:2', 'A5:8'].join(' | ');
const TUNE_CODA = 'F#5:3 E5:1 D5:2 A4:2 | B4:8 | A4:2 D5:2 F#5:4 | E5:8';

/** where each part begins, in bars (74 in all, the last chord ringing on to the end) */
const S_A = 4, S_B = 20, S_INTER = 36, S_A2 = 44, S_C = 60, S_CODA = 68;

/** how strongly each part of the piece is played: softly at first, fullest in the second tune, fading at the end */
function dyn(beat: number): number {
  const bar = beat / 4;
  return bar < S_A ? 0.8 : bar < S_B ? 0.9 : bar < S_INTER ? 1 : bar < S_A2 ? 0.82 : bar < S_C ? 0.96 : bar < S_CODA ? 0.9 : 0.75;
}

/** the whole piece's chords, each with the beat it starts on */
const SONG = [
  ...across(INTRO, 0, 4), ...across(A, S_A, 4), ...across(B, S_B, 4), ...across(INTER, S_INTER, 4), ...across(A, S_A2, 4),
  ...across(CC, S_C, 4), ...across(CODA, S_CODA, 4),
];

/**
 * the guitar's picking, an eighth at a time: the thumb on the bass on one and on its fifth on three, the fingers on the
 * three strings above between them, every string left ringing until the chord changes; the last chord is rolled slowly
 */
function guitar(rng: Rng): Note[] {
  const out: Note[] = [];
  for (const { ch, beat } of SONG) {
    const bass = above(ch.bass, 40);
    const alt = ch.bass === ch.root ? above(ch.root + 7, bass + 1) : above(ch.root, bass + 1);
    const up = close(ch, 55, 3);
    const end = beat + ch.beats;
    if (ch.beats > 4) {
      [bass, alt, ...up, above(ch.root + 4, 66)].forEach((midi, k) => out.push(noteAt(beat + k * 0.3, end - beat - k * 0.3, midi, (0.55 - k * 0.04) * dyn(beat), rng)));
      continue;
    }
    const pat = [bass, up[0], up[1], up[2], alt, up[1], up[2], up[0]];
    for (let k = 0; k < ch.beats * 2; k++) {
      const b = beat + k / 2;
      out.push(noteAt(b, end - b + 0.1, pat[k % 8], (k % 4 === 0 ? 0.62 : k % 2 ? 0.4 : 0.47) * dyn(b), rng));
    }
  }
  return out;
}

/** a note at beat `b`, a touch early or late as a hand plays it */
function noteAt(b: number, beats: number, midi: number, vel: number, rng: Rng): Note {
  const t = Math.max(0, C.time(b) + rng.gauss() * 0.008);
  return { t, dur: beats * C.spb, midi, vel: vel * (1 + rng.bi() * 0.08) };
}

export function renderWait(sr: number): Float32Array {
  const rng = new Rng(0x3a17c0);
  const L = WAIT_SECONDS;
  const m = new Mix(sr / 2, L);
  const inside = (beat: number, from: number, to: number) => beat >= from * 4 && beat < to * 4;

  // the guitar, a warm nylon string plucked near the bridge
  m.part(-3, (b, hs) => {
    for (const n of guitar(rng)) pluck(b, hs, n, rng, { t60: 3.4, bright: 0.42, pos: 0.14, damp: 0.18 });
  });

  // the pad, low and soft, from the first tune to the end
  m.part(-13, (b, hs) => {
    const notes = SONG.filter(({ beat }) => beat >= S_A * 4).flatMap(({ ch, beat }) =>
      close(ch, 57, 4).map((midi) => ({ t: C.time(beat), dur: ch.beats * C.spb + 0.3, midi, vel: inside(beat, S_B, S_INTER) ? 0.7 : 0.5 })));
    renderPads(b, hs, rng, notes, { attack: 1.6, release: 2.6, voices: 3, detune: 8, cutoff: 1100, move: 0.2 });
  });

  // the bass: the chord's bass on one, and in the second tune its fifth on three as well
  m.part(-8, (b, hs) => {
    const notes = SONG.filter(({ beat }) => beat >= S_A * 4 && beat < (S_CODA + 4) * 4).flatMap(({ ch, beat }) => {
      const low = above(ch.bass, 33);
      const two = (inside(beat, S_B, S_INTER) || inside(beat, S_A2, S_C)) && ch.beats === 4;
      return two
        ? [{ t: C.time(beat), dur: 1.9 * C.spb, midi: low, vel: 0.8 }, { t: C.time(beat + 2), dur: 1.9 * C.spb, midi: ch.bass === ch.root ? low + 7 : above(ch.root, low), vel: 0.6 }]
        : [{ t: C.time(beat), dur: (ch.beats - 0.15) * C.spb, midi: low, vel: 0.8 }];
    });
    renderBass(b, hs, notes);
  });

  // the electric piano: the first tune, the second, and the last; under the flute it keeps to soft chords
  m.part(-4, (b, hs) => {
    const notes = [
      ...line(C, TUNE_A, S_A, 0.5, 8, 0.62), ...line(C, TUNE_B, S_B, 0.5, 8, 0.66), ...line(C, TUNE_C, S_C, 0.5, 8, 0.6),
      ...line(C, TUNE_CODA, S_CODA, 0.5, 8, 0.5),
    ];
    for (const { ch, beat } of SONG) {
      if (!inside(beat, S_A2, S_C)) continue;
      for (const midi of rootless(ch, 60)) notes.push({ t: C.time(beat) + rng.range(0, 0.03), dur: Math.min(3, ch.beats) * C.spb, midi, vel: 0.28 });
    }
    for (const n of notes) epiano(b, hs, n, rng);
    tremolo(b, hs, 4.2, 0.16);
  });

  // the flute, the first tune again after the interlude
  m.part(-5, (b, hs) => {
    lead(b, hs, rng, line(C, TUNE_A, S_A2, 0.5, 8, 0.7), {
      wave: 'soft', attack: 0.07, release: 0.14, glide: 0.035, vib: [4.8, 0.004, 0.25], cutoff: { base: 1500, amt: 0.6, key: 0.6 }, breath: 0.1,
    });
  });

  // the shaker under the second tune and the flute's
  m.part(-19, (b, hs) => {
    for (let bar = S_B; bar < S_C; bar++) {
      if (bar >= S_INTER && bar < S_A2) continue;
      for (let k = 0; k < 8; k++) shaker(b, hs, rng, C.at(bar, k / 2) + rng.gauss() * 0.005, k % 2 ? 0.8 : 0.45);
    }
  });

  // bells through the interlude: the chord's third and fifth high up, each let ring
  m.part(-14, (b, hs) => {
    for (const { ch, beat } of SONG) {
      if (!inside(beat, S_INTER, S_A2)) continue;
      addBell(b, hs, C.time(beat), above(ch.root + ch.tones[1], 79), 0.6);
      if (ch.beats === 4) addBell(b, hs, C.time(beat + 2.5), above(ch.root + ch.tones[2], 79), 0.45);
    }
  });

  return finishSong(m, sr, { t60: 2.4, wet: 0.35, size: 1.6 }, 6, 0.085, L);
}
