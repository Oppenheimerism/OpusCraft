// (trial chambers) The music discs of 1.21's trial chambers (vanilla JukeboxSongs CREATOR, CREATOR_MUSIC_BOX and
// PRECIPICE: the sound events music_disc.creator, music_disc.creator_music_box and music_disc.precipice). Like the rest
// of the soundtrack these are pieces of our own, written here in scale degrees and rendered by the music engine
// (gen/music.ts), at about the lengths vanilla gives the songs: Creator, bright and driving, with plucked arpeggios
// over a pulse; Creator (Music Box), its theme on a clockwork comb that runs down at the end; Precipice, slow and dark,
// building twice to a climax. They are music pools (synth.ts MUSIC_POOLS), for the jukebox to play when there is one.

import { Rng, addMode, clamp, fadeIn, highShelf, lowShelf, mtof, peakEq, reverb } from './dsp';
import { MODES, MUSIC_PEAK, degMidi, parseChords, parseMelody, renderTrack, type TrackDef } from './music';

/**
 * vanilla JukeboxSongs: each disc's song, its length in seconds and what a comparator reads off a jukebox playing it
 * (hooks for the jukebox; the game has none yet)
 */
export const DISC_SONGS: Record<string, { disc: string; title: string; seconds: number; comparator: number }> = {
  'music_disc.creator': { disc: 'music_disc_creator', title: 'Lena Raine - Creator', seconds: 176, comparator: 12 },
  'music_disc.creator_music_box': { disc: 'music_disc_creator_music_box', title: 'Lena Raine - Creator (Music Box)', seconds: 73, comparator: 11 },
  'music_disc.precipice': { disc: 'music_disc_precipice', title: 'Aaron Cherof - Precipice', seconds: 299, comparator: 13 },
};

/** the music pools (one song each) the synth serves, by sound event */
export const DISC_MUSIC_POOLS: Record<string, readonly string[]> = Object.fromEntries(Object.entries(DISC_SONGS).map(([k, v]) => [k, [v.title]]));

// ------------------------------------------------------------------ Creator

/** the theme both Creators share: a rising call and its answer, then the turn to the relative minor */
const THEME_A = "1:q 3:q 5:q 6:e 5:e | 5:h. 3:q | 4:q 5:q 6:q 1':q | 7:h 5:h | 6:q 5:q 3:q 1:q | 2:h. 5,:q | 1:q 2:q 3:q 4:q | 3:h 2:q 1:q";
const CHORDS_A = '1add9 3m7 4maj7 5 6m7 2m7 4maj7 1';
const THEME_B = "3':h 2':q 1':q | 1':h 6:h | 5:q 6:q 1':q 5:q | 5:w | 3':h 2':q 1':q | 6:h 1':h | 2':q 1':q 6:q 5:q | 5:w";
const CHORDS_B = '6m7 4maj7 1/3 5 6m7 4maj7 2m7 5sus4';
const THEME_C = 'r:h 6:q 5:q | 5:w | r:h 3:q 2:q | 3:w | r:h 6:q 5:q | 5:h 6:h | 4:h. 3:q | 2:w';
const CHORDS_C = '2m9 5sus4 1maj9 6m9 2m9 5sus4 4maj9 5sus2';

const CREATOR: TrackDef = {
  name: 'Creator',
  seed: 0xc4ea70,
  tonic: 77, // F5
  mode: 'ionian',
  bpm: 124,
  beats: 4,
  lhLow: 41,
  tone: 0.52,
  verb: { t60: 2.6, wet: 0.8 },
  pad: { attack: 1.1, release: 2, cutoff: 1800 },
  sections: [
    { bars: 8, chords: CHORDS_A, lh: 'none', vel: 0.34, pad: 1, arp: 0.8 },
    { bars: 8, chords: CHORDS_A, lh: 'arp8', vel: 0.42, mel: THEME_A, arp: 0.7, bass: 0.6, pad: 0.6 },
    { bars: 8, chords: CHORDS_A, lh: 'arp8', vel: 0.46, mel: THEME_A, vary: ['orn', 'thirds'], arp: 0.9, bass: 0.7, bells: 0.5, pad: 0.8 },
    { bars: 8, chords: CHORDS_B, lh: 'pulse', vel: 0.44, mel: THEME_B, arp: 0.8, bass: 0.7, pad: 1 },
    { bars: 8, chords: CHORDS_B, lh: 'arp8b', vel: 0.48, mel: THEME_B, vary: ['double'], arp: 1, bass: 0.8, pad: 1, bells: 0.5 },
    { bars: 4, chords: '4maj7 5sus4 6m7 5', lh: 'block', vel: 0.4, arp: 1, bass: 0.9, pad: 1 },
    { bars: 8, chords: CHORDS_A, lh: 'arp8', vel: 0.5, mel: THEME_A, melOct: 1, vary: ['double'], arp: 1, bass: 0.8, pad: 1, bells: 0.6 },
    { bars: 8, chords: CHORDS_C, lh: 'sparse', vel: 0.36, mel: THEME_C, pad: 1, arp: 0.5 },
    { bars: 4, chords: '2m9 5sus4 4maj9 5sus2', lh: 'sparse', vel: 0.34, pad: 1, arp: 0.7 },
    { bars: 8, chords: CHORDS_A, lh: 'arp8', vel: 0.48, mel: THEME_A, vary: ['orn'], arp: 1, bass: 0.8, pad: 1, bells: 0.5 },
    { bars: 8, chords: CHORDS_A, lh: 'arp8b', vel: 0.5, mel: THEME_A, melOct: 1, vary: ['thirds', 'double'], arp: 1, bass: 0.8, pad: 1, bells: 0.6 },
    { bars: 6, chords: '1add9 4maj7 1add9 4maj7 1add9 1add9', lh: 'sparse', vel: 0.34, pad: 1, arp: 0.6 },
  ],
  endChord: '1add9',
  endHold: 7,
  mix: { pad: 0.3, pluck: 0.5, bass: 0.3, bell: 0.28 },
};

// ------------------------------------------------------------------ Precipice

const THEME_P = "5:h 4:q 3:q | 1:h. 7,:q | 1:q 3:q 5:q 6:q | 5:w | 5:h 6:q 7:q | 1':h 7:q 6:q | 5:q 4:q 3:q 2:q | 1:w";
const CHORDS_P = '1m9 6maj7 4m7 5m7 3maj7 6maj7 4m7 1m9';
const THEME_Q = "3:q 4:q 5:h | 6:h 5:h | 4:q 5:q 6:h | 7:w | 1':h 7:q 6:q | 5:h 3:h | 4:q 3:q 2:q 7,:q | 1:w";
const CHORDS_Q = '3maj7 4m7 6maj7 7 1m9 3maj7 4m7 1m9';

const PRECIPICE: TrackDef = {
  name: 'Precipice',
  seed: 0x9ec1b1,
  tonic: 74, // D5
  mode: 'aeolian',
  bpm: 72,
  beats: 4,
  lhLow: 38,
  tone: 0.38,
  verb: { t60: 3.8, wet: 1.0 },
  pad: { attack: 2.2, release: 3, cutoff: 1200 },
  sections: [
    { bars: 8, chords: CHORDS_P, lh: 'sparse', vel: 0.3, pad: 0.7 },
    { bars: 8, chords: CHORDS_P, lh: 'arp6', vel: 0.36, mel: THEME_P },
    { bars: 8, chords: CHORDS_P, lh: 'arp8', vel: 0.4, mel: THEME_P, vary: ['octave'], pad: 0.8, bass: 0.5 },
    { bars: 8, chords: CHORDS_Q, lh: 'arp8', vel: 0.42, mel: THEME_Q, pad: 1, bass: 0.6 },
    { bars: 8, chords: CHORDS_Q, lh: 'arp8b', vel: 0.46, mel: THEME_Q, vary: ['double'], pad: 1, bass: 0.7, bells: 0.4 },
    { bars: 8, chords: CHORDS_P, lh: 'block', vel: 0.52, mel: THEME_P, melOct: 1, vary: ['thirds'], pad: 1, bass: 0.9, bells: 0.6, arp: 0.6 },
    { bars: 8, chords: '6maj7 3maj7 4m7 1m9 6maj7 3maj7 4m9 5m7', lh: 'sparse', vel: 0.3, pad: 0.8, mel: 'r:w | 5:h 3:h | r:w | 1:w | r:w | 5:h 7:h | 6:h 5:h | 4:w' },
    { bars: 8, chords: CHORDS_Q, lh: 'pulse', vel: 0.4, pad: 1, bass: 0.8, arp: 0.8 },
    { bars: 8, chords: CHORDS_P, lh: 'arp8', vel: 0.54, mel: THEME_P, melOct: 1, vary: ['double', 'orn'], pad: 1, bass: 0.9, bells: 0.7, arp: 0.9 },
    { bars: 8, chords: CHORDS_P, lh: 'arp6', vel: 0.38, mel: THEME_P, vary: ['sparse'], pad: 0.8, bass: 0.5 },
    { bars: 6, chords: '1m9 6maj7 4m9 1m9 6maj7 1m9', lh: 'sparse', vel: 0.28, pad: 0.8 },
  ],
  endChord: '1m9',
  endHold: 9,
  mix: { pad: 0.34, bass: 0.32, bell: 0.24, pluck: 0.36 },
};

// ------------------------------------------------------------------ Creator (Music Box)

/**
 * one tine of a music box's steel comb, plucked by a pin: a ringing fundamental (the lower tines ring longer), a
 * little of the comb's octave, the tine's second bending mode (6.27 times up, as a cantilever's) and a trace of its
 * third, dying fast, over the click of the pin
 */
function tine(out: Float32Array, sr: number, t: number, midi: number, vel: number, rng: Rng): void {
  const f = mtof(midi) * (1 + rng.bi() * 0.002);
  const s = Math.max(0, Math.round(t * sr));
  const T = clamp(2.2 * Math.pow(1000 / f, 0.6), 0.5, 4.5);
  addMode(out, s, sr, f, vel, T);
  addMode(out, s, sr, f * 2.0, vel * 0.08, T * 0.35);
  addMode(out, s, sr, f * 6.27, vel * 0.14, T * 0.1);
  addMode(out, s, sr, f * 17.55, vel * 0.03, T * 0.03);
  const n = Math.round(0.0015 * sr);
  for (let i = 0; i < n && s + i < out.length; i++) out[s + i] += rng.bi() * vel * 0.2 * (1 - i / n);
}

/** Creator's theme on a music box: an intro, the theme twice (the second in thirds), half the turn, the answer, a last chord */
function renderMusicBox(sr: number): Float32Array {
  const rng = new Rng(0x3b0c5);
  const mode = MODES.ionian;
  const tonic = 84; // C6: the box plays it higher, in C
  const bpb = 4, bpm = 96;
  type Part = { bars: number; chords: string; mel?: string; thirds?: boolean };
  const parts: Part[] = [
    { bars: 2, chords: '1add9 3m7' },
    { bars: 8, chords: CHORDS_A, mel: THEME_A },
    { bars: 8, chords: CHORDS_A, mel: THEME_A, thirds: true },
    { bars: 4, chords: '6m7 4maj7 1/3 5', mel: "3':h 2':q 1':q | 1':h 6:h | 5:q 6:q 1':q 5:q | 5:w" },
    { bars: 4, chords: '6m7 2m7 4maj7 1', mel: '6:q 5:q 3:q 1:q | 2:h. 5,:q | 1:q 2:q 3:q 4:q | 3:h 2:q 1:q' },
  ];
  const notes: { b: number; midi: number; vel: number }[] = [];
  let b0 = 0;
  for (const p of parts) {
    // the accompaniment: broken chords in eighths on the comb's lower tines (root, fifth, octave or third, fifth)
    let b = b0;
    for (const ch of parseChords(p.chords, mode, bpb)) {
      const root = 60 + ((((tonic + ch.root - 60) % 12) + 12) % 12);
      const up = (iv: number) => root + iv;
      const third = ch.tones[1], fifth = ch.tones[2] ?? 7;
      const seq = [root, up(fifth), up(12), up(fifth), up(third + 12), up(fifth), up(12), up(fifth)];
      for (let k = 0; k < ch.beats * 2; k++) notes.push({ b: b + k / 2, midi: seq[k % 8], vel: k % 4 === 0 ? 0.5 : 0.36 });
      b += ch.beats;
    }
    if (p.mel) {
      for (const n of parseMelody(p.mel, bpb).notes) {
        const midi = degMidi(tonic, mode, n.deg, n.oct, n.acc);
        notes.push({ b: b0 + n.beat, midi, vel: 0.9 });
        if (p.thirds && n.dur >= 1) notes.push({ b: b0 + n.beat, midi: degMidi(tonic, mode, n.deg - 2, n.oct, 0), vel: 0.5 });
      }
    }
    b0 += p.bars * bpb;
  }
  // the last chord, rolled, with the tonic high over it
  for (const [k, m] of [tonic - 24, tonic - 17, tonic - 12, tonic - 8, tonic].entries()) notes.push({ b: b0 + k * 0.12, midi: m, vel: 0.7 });
  // tempo: the governor's slight unevenness, and the spring running down over the last three bars (to 55%)
  const slowFrom = b0 - 3 * bpb;
  const factor = (b: number) => (b <= slowFrom ? 1 : 1 - 0.45 * clamp((b - slowFrom) / (b0 + 1 - slowFrom), 0, 1));
  const step = 1 / 24;
  const secs: number[] = [0];
  for (let i = 0; i * step < b0 + 2; i++) secs.push(secs[i] + ((60 / (bpm * factor((i + 0.5) * step))) * step));
  const sec = (b: number) => {
    const x = Math.max(0, b) / step, i = Math.min(secs.length - 2, Math.floor(x));
    return secs[i] + (secs[i + 1] - secs[i]) * (x - i);
  };
  const total = sec(b0 + 1) + 4.5;
  const out = new Float32Array(Math.round(total * sr));
  for (const n of notes) tine(out, sr, sec(n.b) + rng.gauss() * 0.004, n.midi, n.vel * (1 + rng.bi() * 0.08), rng);
  // the wooden box under the comb, then a small room
  lowShelf(out, 280, 3, sr);
  peakEq(out, 1900, 1, 1.5, sr);
  highShelf(out, 7000, -4, sr);
  let mixed = reverb(out, sr, { t60: 1.3, hf: 0.4, size: 0.7, pre: 0.01, wet: 0.35, dry: 1, tail: 0, lowcut: 200, highcut: 8000 });
  mixed = mixed.slice(0, out.length);
  const fade = Math.round(2.5 * sr);
  for (let i = 0; i < fade; i++) mixed[mixed.length - 1 - i] *= (i / fade) ** 2;
  fadeIn(mixed, Math.round(0.02 * sr));
  let pk = 0;
  for (const v of mixed) pk = Math.max(pk, Math.abs(v));
  const g = pk > 0 ? MUSIC_PEAK / pk : 0;
  for (let i = 0; i < mixed.length; i++) mixed[i] *= g;
  return mixed;
}

/** render a disc's song (a music pool of one, `index` ignored) */
export function renderDiscMusic(event: string, sr: number): Float32Array {
  if (event === 'music_disc.creator_music_box') return renderMusicBox(sr);
  return renderTrack(event === 'music_disc.precipice' ? PRECIPICE : CREATOR, sr);
}
