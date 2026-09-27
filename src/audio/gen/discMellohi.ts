// (the eleven discs) Music disc mellohi (vanilla music_disc.mellohi, 1:36): a piece of our own in the disc's slow,
// woozy, faintly eerie mood, for the discs' band (discBand.ts) at half the sample rate. A slow waltz in C minor on a
// music box whose tines are a little out of true, heard off a tape that wanders in pitch more and more as it goes: an
// organ's hollow drone and a dark, choir-like pad under it, a reedy organ voice sliding through the second tune while
// the box answers, reversed swells of bells at the turns, and at the end the tape itself running down.

import { Rng, clamp, reverse, sinCyc } from './dsp';
import { addBell, renderPads } from './instruments';
import { type Note, Mix, synth } from './netherMusic';
import { Clock, above, across, chords, close, finishSong, kalimba, lead, line } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 96) */
export const MELLOHI_SECONDS = 96;

const C = new Clock(60, 3);
const INTRO = chords('Cm Cm Ab/C Cm', 3);
const A = chords('Cm G/B Cm/Bb F/A Abmaj7 Fm Dm7b5 G7', 3);
const B = chords('Ab Eb/G Fm Cm/Eb Db Cm/Eb Dm7b5 G7', 3);
const A2 = chords('Cm G/B Cm/Bb F/A Abmaj7 G7', 3);
const CODA = chords('Cm Db/C Cm:6', 3);

const TUNE_A = 'G5:2 Eb5:2 C5:2 | D5:4 B4:2 | C5:2 Eb5:2 G5:2 | A5:4 F5:2 | G5:3 Ab5:1 G5:2 | F5:2 Ab5:2 C6:2 | Ab5:4 F5:2 | D5:2 F5:2 B4:2';
const TUNE_B = 'C5:4 Eb5:2 | Bb4:6 | Ab4:2 C5:2 F5:2 | Eb5:4 G4:2 | Db5:4 F5:2 | G5:4 Eb5:2 | F5:2 D5:2 Ab4:2 | B4:6';
const ANSWER = 'r:3 Ab5:3 | r:3 G5:3 | r:3 F5:3 | r:3 G5:3 | r:3 Ab5:3 | r:3 G5:3 | r:3 F5:3 | r:3 D5:3';
const TUNE_A2 = 'G5:2 Eb5:2 C5:2 | D5:4 B4:2 | C5:2 Eb5:2 G5:2 | A5:4 F5:2 | G5:3 Ab5:1 G5:2 | D5:2 B4:2 G4:2';
const LAST = 'C5:6 | r:2 Db5:4 | G4:2 Eb4:2 C4:2 | r:6';

/** where each part begins, in bars of three (30 in all) */
const S_A = 4, S_B = 12, S_A2 = 20, S_CODA = 26, END = 30;

const SONG = [...across(INTRO, 0, 3), ...across(A, S_A, 3), ...across(B, S_B, 3), ...across(A2, S_A2, 3), ...across(CODA, S_CODA, 3)];

/**
 * a tape that won't hold its speed: a delay swinging slowly and, faster and slighter, fluttering; `depth(t)` (s) how
 * far the slow swing goes, `sag(t)` (s) how far behind the tape has fallen (running down)
 */
function tape(buf: Float32Array, sr: number, depth: (t: number) => number, sag: (t: number) => number): Float32Array {
  const out = new Float32Array(buf.length);
  const base = 0.012 * sr;
  for (let i = 0; i < buf.length; i++) {
    const t = i / sr;
    const d = base + sr * (depth(t) * (0.6 * sinCyc(0.43 * t) + 0.4 * sinCyc(0.71 * t + 0.2)) + 0.00008 * sinCyc(6.1 * t) + sag(t));
    const p = i - d, k = Math.floor(p);
    if (k < 0 || k + 1 >= buf.length) continue;
    out[i] = buf[k] + (buf[k + 1] - buf[k]) * (p - k);
  }
  return out;
}

export function renderMellohi(sr: number): Float32Array {
  const rng = new Rng(0x3e110b);
  const L = MELLOHI_SECONDS;
  const m = new Mix(sr / 2, L);
  const endT = C.at(END);
  // the wandering grows from barely there to a lurch
  const depth = (t: number) => 0.0012 + 0.0038 * clamp(t / endT, 0, 1) ** 1.5;
  // and over the last bars the tape runs down
  const sag = (t: number) => {
    const x = clamp((t - C.at(S_CODA + 1)) / (endT + 4 - C.at(S_CODA + 1)), 0, 1);
    return 0.6 * x * x;
  };

  // the music box: each tine twice, the second a little sharp; the tunes and its answers
  m.part(-2, (b, hs) => {
    const notes = [...line(C, TUNE_A, S_A, 0.5, 6, 0.8), ...line(C, ANSWER, S_B, 0.5, 6, 0.55), ...line(C, TUNE_A2, S_A2, 0.5, 6, 0.8), ...line(C, LAST, S_CODA, 0.5, 6, 0.7)];
    // (and under the tunes, the waltz's bass and chord on the box's low tines)
    for (const { ch, beat } of SONG) {
      if (beat < S_A * 3 || beat >= S_CODA * 3) continue;
      notes.push(C.note(0, beat, 1, above(ch.bass, 48), 0.45));
      for (const midi of close(ch, 55, 3).slice(1)) {
        notes.push(C.note(0, beat + 1, 1, midi, 0.28));
        notes.push(C.note(0, beat + 2, 1, midi, 0.24));
      }
    }
    for (const n of notes) {
      kalimba(b, hs, { ...n, t: n.t + rng.gauss() * 0.01 });
      kalimba(b, hs, { ...n, midi: n.midi + 0.14, vel: n.vel * 0.5 });
    }
    b.set(tape(b, hs, depth, sag));
  });

  // the organ's drone: C and G, low and hollow, the two pipes of each beating slowly against each other
  m.part(-10, (b, hs) => {
    const drone: Note[] = [{ t: 0, dur: endT - 1, midi: 36, vel: 0.8 }, { t: 2, dur: endT - 3, midi: 43, vel: 0.5 }];
    synth(b, hs, rng, drone, { wave: 'soft', voices: 2, detune: 7, attack: 4, release: 3, maxF: 1500 });
    b.set(tape(b, hs, depth, sag));
  });

  // the dark pad, like a choir humming with its mouth closed
  m.part(-10, (b, hs) => {
    const notes = SONG.flatMap(({ ch, beat }) => close(ch, 53, 4).map((midi) => ({ t: C.time(beat), dur: ch.beats * C.spb + 0.4, midi, vel: 0.7 })));
    renderPads(b, hs, rng, notes, { attack: 2.4, release: 3, voices: 3, detune: 10, cutoff: 720, move: 0.3 });
    b.set(tape(b, hs, depth, sag));
  });

  // the second tune on a reedy organ stop, sliding from note to note
  m.part(-4, (b, hs) => {
    lead(b, hs, rng, line(C, TUNE_B, S_B, 0.5, 6, 0.8), {
      wave: 'square', attack: 0.12, release: 0.3, glide: 0.12, slur: 0.08, vib: [3.6, 0.008, 0.2], cutoff: { base: 1100, amt: 0.5, key: 0.3 },
      formants: [[620, 2.5, 0.25]],
    });
    b.set(tape(b, hs, depth, sag));
  });

  // bells played backwards, swelling up into the turns of the piece
  m.part(-12, (b, hs) => {
    for (const [bar, midi] of [[S_A, 79], [S_B, 75], [S_A2, 79], [S_CODA, 72]]) {
      const len = Math.round(3.5 * hs);
      const one = new Float32Array(len);
      addBell(one, hs, 0, midi, 0.8);
      addBell(one, hs, 0, midi - 12, 0.4);
      const back = reverse(one);
      const s = Math.round(C.at(bar) * hs) - len;
      for (let i = 0; i < len; i++) if (s + i >= 0 && s + i < b.length) b[s + i] += back[i];
    }
  });

  return finishSong(m, sr, { t60: 3.5, wet: 0.8, size: 1.8 }, 5, 0.075, L);
}
