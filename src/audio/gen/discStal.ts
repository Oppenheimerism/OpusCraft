// (the eleven discs) Music disc stal (vanilla music_disc.stal, 2:30): a piece of our own in the disc's smooth, jazzy
// mood, for the discs' band (discBand.ts) at half the sample rate. A late-night quartet swinging gently in E-flat: a
// mellow, breathy tenor saxophone sings the tune, sliding into its notes, with a piano comping under it, a double bass
// walking and a ride cymbal, hi-hat and brushes keeping time; the saxophone steps aside for the piano's own chorus, comes
// back for the last eight bars and holds its last note over the final chord.

import { Rng } from './dsp';
import { type Note, Mix, piano } from './netherMusic';
import { Clock, type Chord, above, across, brush, chords, finishSong, hat, lead, line, pluck, ride, rootless } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 150) */
export const STAL_SECONDS = 150;

const C = new Clock(88, 4, 0.62);
const OPEN = chords('Ebmaj7 Cm7 Fm7 Bb7', 4);
const A = chords('Ebmaj7 Cm7 Fm7 Bb7 Gm7 C7 Fm7 Bb7 Ebmaj7 Eb7 Abmaj7 Db7 Gm7 C7 Fm7:2 Bb7:2 Ebmaj7', 4);
const BRIDGE = chords('Am7b5 D7 Gm7 C7 Fm7 Bb7 Gm7:2 C7:2 Fm7:2 Bb7:2', 4);
const LAST = chords('Ebmaj7 Eb7 Abmaj7 Db7 Gm7 C7 Fm7:2 Bb7:2 Ebmaj7 Ebmaj9', 4);

const TUNE = [
  'Bb4:2 G4:1 Bb4:1 D5:4', 'C5:3 Bb4:1 G4:4', 'Ab4:2 C5:2 Eb5:3 D5:1', 'D5:6 r:2', 'Bb4:2 D5:2 F5:3 D5:1', 'E5:4 C5:2 Bb4:2', 'Ab4:3 G4:1 F4:2 Ab4:2', 'G4:6 r:2',
  'Bb4:2 Eb5:2 G5:3 F5:1', 'Db5:4 Bb4:2 G4:2', 'C5:3 Eb5:1 G5:4', 'F5:2 Eb5:2 B4:2 Ab4:2', 'Bb4:2 D5:2 F5:4', 'E5:3 D5:1 C5:2 Bb4:2', 'Ab4:2 C5:2 D5:2 F5:2', 'Eb5:6 r:2',
];
const BRIDGE_TUNE = 'C5:2 Eb5:2 G5:4 | F#5:3 E5:1 D5:2 C5:2 | Bb4:4 D5:4 | E5:2 G4:2 Bb4:2 C5:2 | Ab4:3 C5:1 Eb5:4 | D5:2 Ab4:2 F4:4 | G4:2 Bb4:2 E5:2 G5:2 | F5:2 Eb5:2 D5:2 Bb4:2';
const CHORUS = [
  'G5:1 Bb5:1 D6:1 F6:1 Eb6:2 D6:2', 'C6:2 Bb5:1 G5:1 Eb5:2 G5:2', 'Ab5:1 C6:1 Eb6:2 Db6:1 C6:1 Ab5:2', 'D6:2 C6:1 Bb5:1 Ab5:2 F5:2',
  'Bb5:2 D6:2 F6:2 D6:2', 'E6:1 D6:1 C6:1 Bb5:1 G5:2 E5:2', 'F5:1 Ab5:1 C6:1 Eb6:1 D6:2 C6:2', 'Bb5:4 r:4',
  'Eb5:1 G5:1 Bb5:1 D6:1 G6:4', 'F6:1 Eb6:1 Db6:1 Bb5:1 G5:2 Eb5:2', 'C6:2 Eb6:2 G6:2 Eb6:2', 'F6:2 Eb6:1 B5:1 Ab5:2 F5:2',
  'D6:2 Bb5:2 G5:2 F5:2', 'E5:1 G5:1 Bb5:1 D6:1 C6:2 Bb5:2', 'Ab5:2 F5:2 D6:2 Bb5:2', 'G5:4 r:4',
].join(' | ');
const FAREWELL = 'r:2 Bb4:2 D5:4';

/** where each part begins, in bars (53 in all, the last chord ringing on) */
const S_A = 4, S_BRIDGE = 20, S_CHORUS = 28, S_LAST = 44, END = 53;

const SONG = [...across(OPEN, 0, 4), ...across(A, S_A, 4), ...across(BRIDGE, S_BRIDGE, 4), ...across(A, S_CHORUS, 4), ...across(LAST, S_LAST, 4)];

/** the bass walking in quarters: the root on the chord's first beat, chord tones after it, and a step into the next root */
function walk(rng: Rng): Note[] {
  const out: Note[] = [];
  const low = (ch: Chord) => above(ch.root, 31);
  for (let i = 0; i < SONG.length; i++) {
    const { ch, beat } = SONG[i];
    const root = low(ch);
    if (i === SONG.length - 1) {
      out.push(C.note(0, beat, 4, root, 0.9));
      break;
    }
    const next = low(SONG[i + 1].ch);
    const into = next + (rng.chance(0.5) ? 1 : -1);
    const third = root + ch.tones[1], fifth = root + (ch.tones.includes(7) ? 7 : ch.tones[2]);
    const steps = ch.beats >= 4 ? [root, rng.chance(0.5) ? third : fifth, rng.chance(0.5) ? fifth : root + 12, into] : [root, into];
    steps.forEach((midi, k) => out.push(C.note(0, beat + k, 0.9, midi, k === 0 ? 0.95 : 0.8)));
  }
  return out;
}

export function renderStal(sr: number): Float32Array {
  const rng = new Rng(0x57a1);
  const L = STAL_SECONDS;
  const m = new Mix(sr / 2, L);

  // the saxophone: breathy and mellow, sliding into its notes, the vibrato blooming late
  m.part(-2, (b, hs) => {
    const notes = [
      ...line(C, TUNE.join(' | '), S_A, 0.5, 8, 0.8), ...line(C, BRIDGE_TUNE, S_BRIDGE, 0.5, 8, 0.85), ...line(C, TUNE.slice(8).join(' | '), S_LAST, 0.5, 8, 0.82),
      ...line(C, FAREWELL, END - 1, 0.5, 8, 0.7),
    ];
    // (the last note held on over the chord)
    notes[notes.length - 1].dur += 1.5 * C.bar;
    lead(b, hs, rng, notes, {
      wave: 'saw', attack: 0.05, release: 0.14, glide: 0.035, slur: 0.06, vib: [5, 0.007, 0.35],
      cutoff: { base: 850, amt: 1.6, key: 0.4, q: 0.9 }, formants: [[520, 3, 0.35], [1400, 4, 0.18], [2600, 5, 0.07]], breath: 0.09,
    });
  });

  // the piano: comping on one and the and of two, then its own chorus over sparser chords
  m.part(-5, (b, hs) => {
    const notes: Note[] = [];
    for (const { ch, beat } of SONG) {
      const solo = beat >= S_CHORUS * 4 && beat < S_LAST * 4;
      const v = rootless(ch, 57);
      const hits: [number, number, number][] = beat >= (END - 1) * 4 ? [[0, 4, 0.4]] : solo ? [[0, 1.6, 0.26]] : ch.beats >= 4 ? [[0, 1.2, 0.36], [1.5, 0.6, 0.3]] : [[0, 1.2, 0.34]];
      for (const [bt, len, vel] of hits) v.forEach((midi, k) => notes.push({ t: C.time(beat + bt) + k * 0.01 + rng.gauss() * 0.006, dur: len * C.spb, midi, vel }));
    }
    notes.push(...line(C, CHORUS, S_CHORUS, 0.5, 8, 0.58));
    piano(b, hs, rng, notes, 0x57a1, 0.35);
  });

  // the double bass walking
  m.part(-5, (b, hs) => {
    for (const n of walk(rng)) pluck(b, hs, n, rng, { t60: 1.6, bright: 0.24, damp: 0.1, pos: 0.2 });
  });

  // the ride in a swing, the hi-hat's foot on two and four
  m.part(-14, (b, hs) => {
    for (let bar = 0; bar < END - 1; bar++) {
      for (const bt of [0, 1, 1.5, 2, 3, 3.5]) ride(b, hs, rng, C.at(bar, bt) + rng.gauss() * 0.004, bt % 2 === 1 ? 0.8 : bt % 1 ? 0.45 : 0.6);
      for (const bt of [1, 3]) hat(b, hs, rng, C.at(bar, bt), 0.5);
    }
    ride(b, hs, rng, C.at(END - 1), 0.7);
  });

  // the brushes circling the snare, a stroke a beat
  m.part(-20, (b, hs) => {
    for (let bar = S_A; bar < END - 1; bar++) for (let bt = 0; bt < 4; bt++) brush(b, hs, rng, C.at(bar, bt), 0.9 * C.spb, bt % 2 ? 1 : 0.7);
  });

  return finishSong(m, sr, { t60: 1.8, wet: 0.35, size: 1.4 }, 5, 0.085, L);
}
