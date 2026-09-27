// (the eleven discs) Music disc mall (vanilla music_disc.mall, 3:17): a piece of our own in the disc's easy,
// lounge-like mood, for the discs' band (discBand.ts) at half the sample rate. A relaxed bossa in F with jazz chords:
// an electric piano comping on its tremolo, a double bass in a lazy two, a cross-stick tapping out the clave with a
// shaker and brushes; a vibraphone plays the tune, a breathy flute the second one, the two together, then the electric
// piano takes a turn of its own before the vibraphone brings the tune back and the band vamps out.

import { Rng } from './dsp';
import { type Note, Mix } from './netherMusic';
import { Clock, type Chord, above, across, brush, chords, epiano, finishSong, kick, lead, line, pluck, rim, rootless, shaker, tremolo, vibes } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 197) */
export const MALL_SECONDS = 197;

const C = new Clock(98);
const OPEN = chords('Fmaj9 Bb13 Am7:2 D7:2 Gm9:2 C13:2', 4);
const A = chords('Fmaj9 Bb13 Am7:2 D7:2 Gm9:2 C13:2 Fmaj9 Ebmaj7 Dm9:2 G13:2 Gm9:2 C7b9:2 Fmaj9 Bb13 Am7:2 D7:2 Gm9:2 C13:2 Am7 Dm9 Gm9:2 C13:2 Fmaj9', 4);
const B = chords('Bbmaj7 Bbm6 Am7 D7b9 Gm7 C7 Am7:2 D7:2 Gm7:2 C7:2 Bbmaj7 Bbm6 Am7 D7b9 Gm7 C7 Am7:2 D7:2 Gm7:2 C7:2', 4);
const VAMP = chords('Fmaj9 Bb13 Fmaj9:8', 4);

const TUNE_A = [
  'A5:3 G5:1 E5:2 C5:2', 'D5:6 r:2', 'C5:2 E5:2 F#5:2 A5:2', 'A5:3 Bb5:1 A5:2 G5:2', 'E5:6 r:2', 'G5:2 Bb5:2 D6:3 C6:1', 'C6:2 A5:2 B5:2 E5:2', 'F5:2 E5:2 Db5:2 C5:2',
  'A5:3 G5:1 E5:2 C5:2', 'D5:2 F5:2 G5:4', 'E5:2 G5:2 F#5:2 C6:2', 'Bb5:3 A5:1 G5:2 E5:2', 'G5:4 E5:4', 'F5:2 A5:2 C6:2 E6:2', 'D6:3 C6:1 Bb5:2 A5:2', 'F5:6 r:2',
].join(' | ');
const TUNE_B = [
  'F5:4 D5:2 A5:2', 'G5:4 F5:2 Db5:2', 'C5:6 E5:2', 'Eb5:4 F#5:2 A5:2', 'Bb5:4 A5:2 F5:2', 'E5:4 G5:2 Bb5:2', 'A5:2 G5:2 F#5:2 D5:2', 'F5:2 D5:2 E5:4',
  'D6:4 C6:2 A5:2', 'Bb5:4 G5:2 F5:2', 'E5:6 G5:2', 'F#5:2 A5:2 C6:2 Eb6:2', 'D6:4 Bb5:2 G5:2', 'Bb5:4 G5:2 E5:2', 'C6:2 A5:2 F#5:2 A5:2', 'G5:4 E5:4',
].join(' | ');
const GUIDE = 'A4:8 | Ab4:8 | G4:4 F#4:4 | F4:4 E4:4 | A4:8 | G4:8 | F4:4 F4:4 | F4:4 E4:4 | A4:8 | Ab4:8 | G4:4 F#4:4 | F4:4 E4:4 | G4:8 | F4:8 | F4:4 E4:4 | E4:8';
const TURN = [
  'C5:1 E5:1 G5:1 A5:1 C6:2 A5:2', 'Ab5:2 G5:1 F5:1 D5:4', 'E5:1 G5:1 C6:2 F#5:1 A5:1 C6:2', 'Bb5:2 A5:2 G5:1 E5:1 D5:2', 'C5:6 r:2', 'Bb4:1 D5:1 G5:1 Bb5:1 D6:2 C6:2', 'A5:2 F5:2 E5:2 D5:2', 'Bb5:2 A5:2 Db6:2 C6:2',
  'A5:2 C6:2 E6:4', 'D6:2 C6:1 Bb5:1 Ab5:2 F5:2', 'G5:2 E5:2 F#5:2 D5:2', 'A5:3 G5:1 E5:4', 'E6:2 C6:2 A5:2 G5:2', 'F5:2 A5:2 E5:4', 'D5:2 F5:2 A5:2 E5:2', 'F5:8',
].join(' | ');

/** where each part begins, in bars (80 in all) */
const S_A1 = 4, S_B = 20, S_A2 = 36, S_TURN = 52, S_A3 = 68, S_VAMP = 76, END = 80;

const A_HALF = chords('Fmaj9 Bb13 Am7:2 D7:2 Gm9:2 C13:2 Fmaj9 Ebmaj7 Dm9:2 G13:2 Gm9:2 C7b9:2', 4);
const SONG = [
  ...across(OPEN, 0, 4), ...across(A, S_A1, 4), ...across(B, S_B, 4), ...across(A, S_A2, 4), ...across(A, S_TURN, 4),
  ...across(A_HALF, S_A3, 4), ...across(VAMP, S_VAMP, 4),
];

/** the electric piano's comping: a chord on one held into two, another on the and of three, pushed */
function comp(ch: Chord, beat: number, rng: Rng, vel: number): Note[] {
  const v = rootless(ch, 57);
  const hits: [number, number][] = ch.beats >= 4 ? [[0, 2], [2.5, 1]] : [[0, 1.4]];
  return hits.flatMap(([bt, len]) => v.map((midi, k) => ({ t: C.time(beat + bt) + k * 0.008 + rng.gauss() * 0.006, dur: len * C.spb, midi, vel: vel * (bt ? 0.8 : 1) })));
}

export function renderMall(sr: number): Float32Array {
  const rng = new Rng(0x3a11);
  const L = MALL_SECONDS;
  const m = new Mix(sr / 2, L);
  const inside = (beat: number, from: number, to: number) => beat >= from * 4 && beat < to * 4;

  // the electric piano: comping throughout, and its own turn over the tune's chords
  m.part(-4, (b, hs) => {
    const notes = SONG.flatMap(({ ch, beat }) => (beat < (END - 2) * 4 ? comp(ch, beat, rng, inside(beat, S_TURN, S_A3) ? 0.3 : 0.4) : []));
    // (the last chord, spread and left to ring)
    for (const [k, midi] of [53, 57, 60, 64, 67, 69].entries()) notes.push({ t: C.at(END - 2, k * 0.15), dur: 2 * C.bar, midi, vel: 0.45 });
    notes.push(...line(C, TURN, S_TURN, 0.5, 8, 0.72));
    for (const n of notes) epiano(b, hs, n, rng);
    tremolo(b, hs, 4.6, 0.2);
  });

  // the double bass in two: the root on one and the and of two, the fifth on three and the and of four
  m.part(-5, (b, hs) => {
    for (const { ch, beat } of SONG) {
      if (beat >= (END - 2) * 4) continue;
      const root = above(ch.bass, 29);
      const fifth = root + 7 > 43 ? root - 5 : root + 7;
      const fig: [number, number, number][] = ch.beats >= 4 ? [[0, 1.4, root], [1.5, 0.45, root], [2, 1.4, fifth], [3.5, 0.45, fifth]] : [[0, 1.4, root], [1.5, 0.45, root]];
      for (const [bt, len, midi] of fig) pluck(b, hs, { t: C.time(beat + bt), dur: len * C.spb, midi, vel: bt % 2 === 0 ? 0.9 : 0.65 }, rng, { t60: 1.8, bright: 0.22, damp: 0.07, pos: 0.2 });
    }
    pluck(b, hs, { t: C.at(END - 2), dur: 2 * C.bar, midi: 29, vel: 0.9 }, rng, { t60: 2.5, bright: 0.22, damp: 0.3, pos: 0.2 });
  });

  // the vibraphone: the tune, twice, and half of it at the end
  m.part(-3, (b, hs) => {
    const notes = [...line(C, TUNE_A, S_A1, 0.5, 8, 0.72), ...line(C, TUNE_A, S_A2, 0.5, 8, 0.72), ...line(C, TUNE_A.split(' | ').slice(0, 8).join(' | '), S_A3, 0.5, 8, 0.7)];
    for (const n of notes) vibes(b, hs, n);
    tremolo(b, hs, 5, 0.25);
  });

  // the flute: the second tune, then the long guide notes under the vibraphone's tune
  m.part(-5, (b, hs) => {
    const notes = [...line(C, TUNE_B, S_B, 0.5, 8, 0.75), ...line(C, GUIDE, S_A2, 0.5, 8, 0.55)];
    lead(b, hs, rng, notes, { wave: 'soft', attack: 0.06, release: 0.15, glide: 0.04, vib: [5, 0.005, 0.3], cutoff: { base: 1700, amt: 0.6, key: 0.6 }, breath: 0.14 });
  });

  // the cross-stick's clave over two bars, a soft kick with the bass
  m.part(-12, (b, hs) => {
    for (let bar = 0; bar < END - 2; bar++) {
      for (const bt of bar % 2 ? [1, 2.5] : [0, 1.5, 3]) rim(b, hs, rng, C.at(bar, bt) + rng.gauss() * 0.004, 0.8);
      if (bar >= S_A1) for (const bt of [0, 2]) kick(b, hs, rng, C.at(bar, bt), 0.6, 95);
    }
  });

  // the shaker in sixteenths and the brushes' swish on two and four
  m.part(-17, (b, hs) => {
    for (let bar = S_A1; bar < END - 2; bar++) {
      for (let k = 0; k < 16; k++) shaker(b, hs, rng, C.at(bar, k / 4) + rng.gauss() * 0.003, k % 2 ? 0.4 : 0.7, 0.06);
      for (const bt of [1, 3]) brush(b, hs, rng, C.at(bar, bt) - 0.05, 0.28, 0.9);
    }
  });

  return finishSong(m, sr, { t60: 1.6, wet: 0.3, size: 1.3 }, 5, 0.09, L);
}
