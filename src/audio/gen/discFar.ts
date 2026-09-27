// (the eleven discs) Music disc far (vanilla music_disc.far, 2:54): a piece of our own in the disc's dreamy, distant
// mood, for the discs' band (discBand.ts) at half the sample rate. Slow and floating in D lydian, rocking between D and
// E over D: wide, slowly breathing pads, a piano heard as if across a valley, a vibraphone's tune shimmering on its
// motor and echoing away, a horn answering from somewhere further off, and high glints of light in the pauses; all of
// it in a great deal of air.

import { Rng, addOsc, clamp, echo, lowpass, smooth } from './dsp';
import { renderBass, renderPads } from './instruments';
import { type Note, Mix, piano } from './netherMusic';
import { Clock, above, across, chords, close, finishSong, lead, line, tremolo, vibes } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 174) */
export const FAR_SECONDS = 174;

const C = new Clock(66);
const DRIFT = chords('Dmaj9 E/D Dmaj9 E/D', 4);
const A = chords('Dmaj7 E/D Dmaj7 E/D Bm7 C#m7 Dmaj7#11 E6', 4);
const B = chords('Bm9 F#m7 Gmaj7 D/F# Bm9 A6 Gmaj7 E/G#', 4);
const LAST = chords('Dmaj9 E/D Dmaj9:8', 4);

const TUNE_A = 'A5:4 F#5:2 E5:2 | G#5:6 r:2 | A5:2 C#6:2 E6:4 | B5:6 r:2 | D6:3 C#6:1 B5:2 F#5:2 | G#5:4 E5:4 | F#5:2 G#5:2 A5:2 C#6:2 | C#6:4 B5:4';
const TUNE_A2 = 'A5:4 F#5:2 E5:2 | G#5:6 r:2 | A5:2 C#6:2 E6:2 F#6:2 | E6:6 r:2 | D6:3 C#6:1 B5:2 A5:2 | G#5:4 B5:4 | C#6:2 A5:2 F#5:2 E5:2 | E5:8';
const TUNE_B = 'F#5:2 A5:2 C#6:4 | E5:6 r:2 | D6:3 B5:1 F#5:4 | A5:8 | F#5:2 B5:2 D6:2 E6:2 | C#6:4 A5:4 | B5:2 D6:2 F#6:4 | E6:8';
const HORN = 'r:8 | r:2 E4:2 B4:4 | r:8 | r:2 G#4:2 E4:4 | r:8 | r:2 C#4:2 G#4:4 | r:8 | r:2 B3:2 E4:4';

/** where each part begins, in bars (46 in all) */
const S_A1 = 6, S_A2 = 14, S_B = 22, S_DRIFT = 30, S_A3 = 34, S_LAST = 42;

const SONG = [
  ...across(DRIFT, 0, 4), ...across(DRIFT.slice(0, 2), 4, 4), ...across(A, S_A1, 4), ...across(A, S_A2, 4), ...across(B, S_B, 4),
  ...across(DRIFT, S_DRIFT, 4), ...across(A, S_A3, 4), ...across(LAST, S_LAST, 4),
];

export function renderFar(sr: number): Float32Array {
  const rng = new Rng(0xfa7d15);
  const L = FAR_SECONDS;
  const m = new Mix(sr / 2, L);

  // the pads: wide and slow, the filter breathing
  m.part(-5, (b, hs) => {
    const notes = SONG.flatMap(({ ch, beat }) => close(ch, 57, 4).map((midi) => ({ t: C.time(beat), dur: ch.beats * C.spb + 0.5, midi, vel: 0.8 })));
    renderPads(b, hs, rng, notes, { attack: 3, release: 4, voices: 4, detune: 12, cutoff: 950, move: 0.35 });
  });

  // the piano far off: each chord rolled up slowly from the bass and left to ring, dulled by the distance
  m.part(-7, (b, hs) => {
    const notes: Note[] = [];
    for (const { ch, beat } of SONG) {
      const bass = above(ch.bass, 38);
      const v = [bass, ...close(ch, bass + 7, 3), ...close(ch, bass + 19, 2)];
      const bars = ch.beats / 4;
      for (let k = 0; k < bars; k++) {
        const b0 = beat + k * 4;
        v.forEach((midi, i) => notes.push({ t: C.time(b0 + i * 0.5 + (i > 2 ? 0.5 : 0)) + rng.gauss() * 0.01, dur: (4 - i * 0.5) * C.spb, midi, vel: 0.34 - i * 0.03 }));
      }
    }
    piano(b, hs, rng, notes, 0xfa7d15, 0.25);
    lowpass(b, 1700, hs);
    echo(b, hs, C.spb * 1.5, 0.35, 0.35, 1400);
  });

  // the vibraphone's tunes, on its motor, echoing away
  m.part(-3, (b, hs) => {
    const notes = [
      ...line(C, TUNE_A, S_A1, 0.5, 8, 0.7), ...line(C, TUNE_A2, S_A2, 0.5, 8, 0.72), ...line(C, TUNE_B, S_B, 0.5, 8, 0.75),
      ...line(C, TUNE_A, S_A3, 0.5, 8, 0.72),
    ];
    for (const n of notes) vibes(b, hs, n);
    // (the last time through, soft glints an octave up)
    for (const n of line(C, TUNE_A, S_A3, 0.5, 8, 0.22, 12)) vibes(b, hs, n);
    tremolo(b, hs, 5.2, 0.32);
    echo(b, hs, C.spb * 1.5, 0.42, 0.32, 2400);
  });

  // the horn, further off still, answering in the gaps
  m.part(-10, (b, hs) => {
    lead(b, hs, rng, [...line(C, HORN, S_A2, 0.5, 8, 0.7), ...line(C, HORN, S_A3, 0.5, 8, 0.75)], {
      wave: 'soft', attack: 0.35, release: 0.5, glide: 0.08, vib: [4.4, 0.004, 0.4], cutoff: { base: 700, amt: 0.6, key: 0.4 },
      formants: [[500, 2, 0.3]], breath: 0.04,
    });
    lowpass(b, 1500, hs);
  });

  // the bass, a soft root under it all
  m.part(-12, (b, hs) => {
    renderBass(b, hs, SONG.filter(({ beat }) => beat >= S_A1 * 4).map(({ ch, beat }) => ({ t: C.time(beat), dur: (ch.beats - 0.3) * C.spb, midi: above(ch.bass, 31), vel: 0.7 })));
  });

  // glints of light in the drifting parts: high chord tones swelling in and out, each a pair a few cents apart
  m.part(-17, (b, hs) => {
    for (const { ch, beat } of SONG) {
      const bar = beat / 4;
      if (!(bar < S_A1 || (bar >= S_DRIFT && bar < S_A3) || bar >= S_LAST)) continue;
      const t0 = C.time(beat) + 0.4;
      const len = ch.beats * C.spb + 1.5;
      for (const midi of close(ch, 86, 3)) {
        const f = 440 * Math.pow(2, (midi - 69) / 12);
        const env = (t: number) => smooth(clamp(t / (len * 0.4), 0, 1)) * smooth(clamp((len - t) / (len * 0.5), 0, 1)) * 0.3;
        addOsc(b, hs, t0, len, () => f, env);
        addOsc(b, hs, t0, len, () => f * 1.0035, env);
      }
    }
  });

  return finishSong(m, sr, { t60: 5.5, wet: 1.1, size: 2.4 }, 8, 0.075, L);
}
