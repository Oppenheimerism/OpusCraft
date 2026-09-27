// (the eleven discs) Music disc chirp (vanilla music_disc.chirp, 3:05): a piece of our own in the disc's bright,
// chirpy mood, for the discs' band (discBand.ts) at half the sample rate. A spring morning in A major: a kalimba
// rippling in sixteenths, birds calling to each other in the pauses, a whistled tune over a bouncing plucked bass, soft
// kick, finger snaps and a shaker; a second tune climbing higher, a quiet interlude of birdsong over a pad, the first
// tune on a glockenspiel, a bouncier third tune over offbeat piano chords, and the birds again to close.

import { Rng, addOsc, clamp, smooth } from './dsp';
import { addBell, renderPads } from './instruments';
import { type Note, Mix, piano } from './netherMusic';
import { burst } from './texture';
import { Clock, above, across, chords, close, finishSong, kalimba, kick, lead, line, pluck, rootless, shaker, tambourine } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 185) */
export const CHIRP_SECONDS = 185;

const C = new Clock(126);
const OPEN = chords('A E/G# F#m7 D A E/G# F#m7 D', 4);
const A = chords('A E/G# F#m7 D A/C# D Bm7 E', 4);
const B = chords('D E C#m7 F#m D E A A D E C#m7 F#m Bm7 E A A', 4);
const REST = chords('Dmaj7 A/C# Dmaj7 E Dmaj7 A/C# Bm7 E', 4);
const CC = chords('F#m D A E F#m D B7 E7', 4);
const CLOSE = chords('A E/G# F#m7 D Bm7 E A:8', 4);

const TUNE_A = [
  'E5:1 A5:1 C#6:2 B5:1 A5:1 E5:2', 'B5:3 G#5:1 E5:4', 'F#5:1 A5:1 C#6:2 E6:2 C#6:2', 'D6:3 C#6:1 A5:4',
  'C#6:1 E6:1 C#6:1 A5:1 E5:2 A5:2', 'F#5:2 A5:2 D6:3 C#6:1', 'B5:2 A5:1 F#5:1 D5:2 F#5:2', 'E5:6 r:2',
  'E5:1 A5:1 C#6:2 B5:1 A5:1 E5:2', 'B5:3 G#5:1 B5:2 E6:2', 'F#6:2 E6:1 C#6:1 A5:2 C#6:2', 'D6:2 F#6:2 E6:4',
  'C#6:1 E6:1 A6:2 G#6:1 E6:1 C#6:2', 'D6:2 B5:1 A5:1 F#5:4', 'B5:2 D6:2 C#6:2 B5:2', 'A5:6 r:2',
].join(' | ');
const TUNE_B = [
  'F#5:2 A5:2 D6:2 F#6:2', 'E6:3 D6:1 B5:4', 'C#6:2 E6:2 G#5:4', 'A5:3 C#6:1 F#6:4', 'F#6:2 E6:2 D6:2 A5:2', 'B5:2 E6:2 G#6:4', 'A6:2 E6:2 C#6:2 E6:2', 'A5:8',
  'D6:2 F#6:2 A6:2 F#6:2', 'G#6:3 F#6:1 E6:4', 'E6:2 C#6:2 B5:2 G#5:2', 'A5:2 C#6:2 F#6:4', 'D6:2 B5:2 F#5:2 B5:2', 'E6:3 D6:1 B5:4', 'C#6:8', 'r:8',
].join(' | ');
const TUNE_C = [
  'C#6:2 A5:1 F#5:1 C#6:2 E6:2', 'D6:2 F#6:2 E6:1 D6:1 A5:2', 'C#6:2 E6:2 A6:2 E6:2', 'B5:4 G#5:2 E5:2',
  'F#5:1 A5:1 C#6:1 F#6:1 E6:2 C#6:2', 'D6:3 E6:1 F#6:2 A6:2', 'D#6:2 F#6:2 A6:2 F#6:2', 'G#6:2 E6:2 D6:2 B5:2',
  'C#6:2 A5:1 F#5:1 C#6:2 E6:2', 'F#6:2 D6:2 A5:2 F#5:2', 'E5:2 A5:2 C#6:2 E6:2', 'E6:4 B5:4',
  'A5:1 C#6:1 F#6:1 A6:1 G#6:2 F#6:2', 'F#6:2 E6:2 D6:2 A5:2', 'B5:2 D#6:2 F#6:2 A6:2', 'G#6:4 E6:2 D6:2',
].join(' | ');

/** where each part begins, in bars (96 in all) */
const S_A1 = 8, S_B = 24, S_REST = 40, S_A2 = 48, S_C = 64, S_A3 = 80, S_CLOSE = 88, END = 96;

const SONG = [
  ...across(OPEN, 0, 4), ...across(A, S_A1, 4), ...across(A, S_A1 + 8, 4), ...across(B, S_B, 4), ...across(REST, S_REST, 4),
  ...across(A, S_A2, 4), ...across(A, S_A2 + 8, 4), ...across(CC, S_C, 4), ...across(CC, S_C + 8, 4), ...across(A, S_A3, 4),
  ...across(CLOSE, S_CLOSE, 4),
];

/** whether bar `bar` has the beat (everywhere but the opening bars, the interlude and the close) */
const beatOn = (bar: number): boolean => bar >= 4 && bar < S_CLOSE + 4 && !(bar >= S_REST && bar < S_A2);

/**
 * a bird's call at `t` round `f` Hz: a tweet swooping up, a trill of quick notes, or a whistle falling away; each
 * little note a sine gliding through its pitch, in and out in a few milliseconds
 */
function bird(b: Float32Array, sr: number, rng: Rng, t: number, f: number, kind: 'tweet' | 'trill' | 'fall', amp: number): void {
  const blip = (t0: number, len: number, f0: number, f1: number, a: number) =>
    addOsc(b, sr, t0, len, (x) => f0 * Math.pow(f1 / f0, smooth(x / len)), (x) => a * Math.sin(Math.PI * clamp(x / len, 0, 1)) ** 0.7);
  if (kind === 'tweet') {
    blip(t, 0.07, f, f * 1.5, amp);
    blip(t + 0.11, 0.06, f * 1.1, f * 1.6, amp * 0.8);
  } else if (kind === 'trill') {
    const n = 5 + rng.int(4);
    for (let k = 0; k < n; k++) blip(t + k * 0.045, 0.035, f * (k % 2 ? 1.12 : 1), f * (k % 2 ? 1.2 : 1.06), amp * (1 - k / (n + 2)));
  } else blip(t, 0.22, f * 1.45, f, amp);
}

export function renderChirp(sr: number): Float32Array {
  const rng = new Rng(0xc41c9);
  const L = CHIRP_SECONDS;
  const m = new Mix(sr / 2, L);

  // the kalimba, rippling through each chord in sixteenths, up and back
  m.part(-6, (b, hs) => {
    for (const { ch, beat } of SONG) {
      const v = close(ch, 64, 4);
      const run = [...v, v[0] + 12, ...v.slice(1).reverse()];
      const soft = beat / 4 >= S_REST && beat / 4 < S_A2 ? 0.55 : 1;
      // (the last chord rolled once, slowly, and left to ring)
      if (ch.beats > 4) {
        [...v, v[0] + 12].forEach((midi, k) => kalimba(b, hs, { t: C.time(beat + k / 2), dur: 3, midi, vel: 0.5 }));
        continue;
      }
      for (let k = 0; k < ch.beats * 4; k++) {
        const t = C.time(beat + k / 4) + rng.gauss() * 0.004;
        kalimba(b, hs, { t, dur: 0.12, midi: run[k % run.length], vel: (k % 4 === 0 ? 0.62 : k % 2 ? 0.34 : 0.45) * soft });
      }
    }
  });

  // the whistle: the first tune, the second, the third, and the first again at the end
  m.part(-3, (b, hs) => {
    const notes = [
      ...line(C, TUNE_A, S_A1, 0.5, 8, 0.8), ...line(C, TUNE_B, S_B, 0.5, 8, 0.8), ...line(C, TUNE_A, S_A2, 0.5, 8, 0.45, -12),
      ...line(C, TUNE_C, S_C, 0.5, 8, 0.82), ...line(C, TUNE_A.split(' | ').slice(0, 8).join(' | '), S_A3, 0.5, 8, 0.8),
    ];
    lead(b, hs, rng, notes, { wave: 'sine', attack: 0.02, release: 0.06, glide: 0.018, vib: [6, 0.006, 0.18], breath: 0.06, slur: 0.02 });
  });

  // the glockenspiel with the first tune the second time round
  m.part(-8, (b, hs) => {
    for (const n of line(C, TUNE_A, S_A2, 0.5, 8, 0.8)) addBell(b, hs, n.t, n.midi, n.vel);
  });

  // the bass, plucked short and bouncing: the root, again, its fifth, its octave
  m.part(-4, (b, hs) => {
    for (const { ch, beat } of SONG) {
      const bar = beat / 4;
      if (bar < 4 || bar >= S_CLOSE + 6 || (bar >= S_REST && bar < S_A2)) continue;
      const root = above(ch.bass, 33);
      const fig: [number, number][] = ch.beats === 4 ? [[0, root], [1.5, root], [2, root + 7], [3.5, root + 12]] : [[0, root], [1.5, root + 7]];
      for (const [bt, midi] of fig) pluck(b, hs, { t: C.time(beat + bt), dur: 0.35 * C.spb, midi, vel: bt === 0 ? 0.9 : 0.7 }, rng, { t60: 1.4, bright: 0.3, damp: 0.05 });
    }
  });

  // the drums: a soft kick on one and three, finger snaps on two and four
  m.part(-7, (b, hs) => {
    for (let bar = 4; bar < END; bar++) {
      if (!beatOn(bar)) continue;
      for (const bt of [0, 2]) kick(b, hs, rng, C.at(bar, bt), 0.8, 110);
      for (const bt of [1, 3]) {
        const t = C.at(bar, bt);
        burst(b, hs, rng, { t, dur: 0.05, tau: 0.009, amp: 0.8, bp: [2300, 1.4] });
        burst(b, hs, rng, { t, dur: 0.006, tau: 0.0012, amp: 0.5, hp: 3000 });
      }
    }
  });

  // the shaker in sixteenths, and a tambourine with the glockenspiel and the third tune
  m.part(-16, (b, hs) => {
    for (let bar = 4; bar < END; bar++) {
      if (!beatOn(bar)) continue;
      for (let k = 0; k < 16; k++) shaker(b, hs, rng, C.at(bar, k / 4) + rng.gauss() * 0.003, k % 4 === 2 ? 0.9 : k % 2 ? 0.35 : 0.55, 0.05);
      if (bar >= S_A2 && bar < S_A3) for (const bt of [1, 3]) tambourine(b, hs, rng, C.at(bar, bt), 0.8);
    }
  });

  // the piano's offbeat chords under the third tune
  m.part(-9, (b, hs) => {
    const notes: Note[] = [];
    for (const { ch, beat } of SONG) {
      if (beat < S_C * 4 || beat >= S_A3 * 4) continue;
      for (const bt of [0.5, 1.5, 2.5, 3.5]) for (const midi of rootless(ch, 62)) notes.push({ t: C.time(beat + bt), dur: 0.22 * C.spb, midi, vel: 0.4 });
    }
    piano(b, hs, rng, notes, 0xc41c9, 0.55);
  });

  // a pad under the interlude
  m.part(-12, (b, hs) => {
    const notes = SONG.filter(({ beat }) => beat >= S_REST * 4 && beat < S_A2 * 4).flatMap(({ ch, beat }) =>
      close(ch, 57, 4).map((midi) => ({ t: C.time(beat), dur: ch.beats * C.spb + 0.3, midi, vel: 0.7 })));
    renderPads(b, hs, rng, notes, { attack: 1.2, release: 2, voices: 3, detune: 8, cutoff: 1500, move: 0.2 });
  });

  // the birds: calling back and forth through the opening, the interlude and the close, and now and then at the end of a line
  m.part(-13, (b, hs) => {
    const calls: [number, number, number, 'tweet' | 'trill' | 'fall'][] = [];
    for (const [from, to] of [[0, S_A1], [S_REST, S_A2], [S_CLOSE, END]]) {
      for (let bar = from; bar < to; bar += 2) {
        calls.push([bar, 0.5 + rng.range(0, 0.5), 3300 + rng.range(-200, 300), 'tweet']);
        calls.push([bar, 2.5 + rng.range(0, 0.4), 2500 + rng.range(-150, 150), rng.chance(0.5) ? 'trill' : 'fall']);
        if (rng.chance(0.5)) calls.push([bar + 1, 1.5 + rng.range(0, 0.5), 3800 + rng.range(-200, 200), 'tweet']);
      }
    }
    for (let bar = S_A1 + 7; bar < S_CLOSE; bar += 8) calls.push([bar, 2.5, 3500, 'tweet']);
    for (const [bar, bt, f, kind] of calls) bird(b, hs, rng, C.at(bar, bt), f, kind, 0.7 + rng.range(0, 0.3));
  });

  return finishSong(m, sr, { t60: 1.8, wet: 0.3, size: 1.4 }, 5, 0.1, L);
}
