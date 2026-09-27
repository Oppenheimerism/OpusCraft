// (the eleven discs) Music disc blocks (vanilla music_disc.blocks, 5:45): a piece of our own in the disc's long,
// upbeat and playful mood, for the discs' band (discBand.ts) at half the sample rate. A funky romp in F: a marimba
// bouncing through a syncopated riff over a rubbery synth bass, hand claps and hi-hats, an electric piano jabbing at
// the off-beats and an ocarina singing the tunes, a slide whistle whooping it in. On the way it stops for a break of
// woodblock and cowbell calling to each other, sinks into D minor at half the pace with plucked strings and bells,
// climbs back out on a snare roll, wanders off to B-flat for the marimba's own tune, lets the marimba take the second
// tune under the ocarina's long notes, and comes home for a last chorus in harmony before the slide whistle takes it down.

import { Rng } from './dsp';
import { addBell } from './instruments';
import { type Note, Mix } from './netherMusic';
import { burst, sweep } from './texture';
import {
  Clock, type Chord, type LeadOpts, above, across, chords, clap, close, cowbell, epiano, finishSong, hat, kick, lead, line, marimba, pluck, rim, snare,
  tambourine, woodblock,
} from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 345) */
export const BLOCKS_SECONDS = 345;

const C = new Clock(109, 4, 0.54);
const A = chords('F F/A Bb C Dm Bb Gm7 C7', 4);
const B = chords('Bbmaj7 Am7 Gm7 F/A Bb C Dm C', 4);
const BREAK = chords('F Eb/F F Eb/F F Eb/F Gm7 C7', 4);
const CC = chords('Dm Dm/C Bb A7 Dm Gm Eb A7', 4);
const BUILD = chords('Bb C Bb C Gm7 Am7 Bb C7', 4);
const BRIDGE = chords('Ebmaj7 F Dm7 Gm7 Cm7 F7 Bb C7', 4);
const OUTRO = chords('F Eb/F F:8', 4);

const TUNE_A = [
  'C5:2 A4:2 C5:2 F5:4 E5:2 D5:2 C5:2', 'D5:3 C5:1 A4:4 r:2 G4:2 A4:2 C5:2', 'D5:2 F5:2 D5:2 Bb4:2 C5:4 D5:4', 'E5:2 G5:2 E5:2 C5:2 D5:6 r:2',
  'F5:2 E5:2 D5:2 A4:2 F5:4 E5:2 D5:2', 'D5:3 C5:1 Bb4:4 D5:2 F5:6', 'G5:2 F5:2 D5:2 Bb4:2 A4:2 G4:2 A4:2 Bb4:2', 'C5:6 E5:2 G5:4 r:4',
  'C5:2 A4:2 C5:2 F5:4 E5:2 D5:2 C5:2', 'D5:3 C5:1 A4:4 C5:2 D5:2 F5:2 A5:2', 'Bb5:4 A5:2 G5:2 F5:4 D5:4', 'E5:2 F5:2 G5:4 C5:4 r:4',
  'A5:2 G5:2 F5:2 D5:2 A5:4 G5:2 F5:2', 'F5:3 D5:1 Bb4:4 D5:4 F5:4', 'G5:2 A5:2 Bb5:2 G5:2 E5:4 C5:4', 'E5:2 D5:2 C5:2 D5:2 E5:4 r:4',
].join(' | ');
const TUNE_B = [
  'D5:6 C5:2 D5:4 F5:4', 'E5:6 C5:2 A4:8', 'Bb4:4 D5:4 F5:4 E5:2 D5:2', 'C5:12 r:4', 'D5:2 F5:2 Bb5:4 A5:2 G5:2 F5:4', 'G5:4 E5:4 C5:4 D5:2 E5:2', 'F5:6 E5:2 D5:4 A4:4', 'G4:4 A4:2 Bb4:2 C5:8',
  'F5:6 E5:2 D5:4 F5:4', 'E5:6 D5:2 C5:8', 'D5:4 F5:4 A5:4 G5:2 F5:2', 'E5:12 r:4', 'D5:2 F5:2 Bb5:4 C6:2 Bb5:2 A5:4', 'G5:4 C6:4 G5:4 E5:4', 'F5:4 A5:4 D6:4 C6:2 A5:2', 'G5:8 E5:4 C5:4',
].join(' | ');
/** the ocarina's long notes under the marimba's second tune, the last time through it */
const COUNTER = 'A4:16 | G4:16 | F4:8 Bb4:8 | A4:16 | F4:8 D5:8 | E5:16 | F5:8 D5:8 | E5:8 C5:8 | A4:16 | G4:16 | F4:8 E4:8 | F4:16 | F4:8 Bb4:8 | C5:8 E5:8 | F5:8 A5:8 | G5:16';
const TUNE_C = [
  'D5:4 F5:4 A5:4 G5:2 F5:2', 'E5:4 C5:4 D5:8', 'D5:2 F5:2 Bb5:4 A5:2 G5:2 F5:4', 'E5:4 C#5:4 A4:8',
  'D5:4 F5:4 A5:4 D6:4', 'C6:2 Bb5:2 G5:4 Bb5:4 D5:4', 'Eb5:4 G5:4 Bb5:4 G5:4', 'A5:6 G5:2 E5:4 C#5:4',
].join(' | ');
const BRIDGE_TUNE = [
  'G5:4 Bb5:4 D6:4 C6:2 Bb5:2', 'A5:4 C6:4 F5:8', 'A5:2 F5:2 D5:2 F5:2 A5:4 C6:4', 'Bb5:6 A5:2 G5:8',
  'G5:2 Eb5:2 C5:2 Eb5:2 G5:4 Bb5:4', 'A5:6 G5:2 F5:4 Eb5:4', 'D5:4 F5:4 Bb5:8', 'C6:4 Bb5:2 G5:2 E5:8',
].join(' | ');

/** where each part begins, in bars (156 in all, the last chord ringing through the last two) */
const S_GROOVE = 8, S_A1 = 24, S_B1 = 40, S_BREAK = 56, S_C = 64, S_BUILD = 80, S_A2 = 88, S_BRIDGE = 104, S_B2 = 120, S_FIN = 136, S_OUTRO = 152, END = 156;

const SONG = [
  ...across(A, 0, 4), ...across(A, S_GROOVE, 4), ...across(A, S_GROOVE + 8, 4), ...across(A, S_A1, 4), ...across(A, S_A1 + 8, 4),
  ...across(B, S_B1, 4), ...across(B, S_B1 + 8, 4), ...across(BREAK, S_BREAK, 4), ...across(CC, S_C, 4), ...across(CC, S_C + 8, 4),
  ...across(BUILD, S_BUILD, 4), ...across(A, S_A2, 4), ...across(A, S_A2 + 8, 4), ...across(BRIDGE, S_BRIDGE, 4), ...across(BRIDGE, S_BRIDGE + 8, 4),
  ...across(B, S_B2, 4), ...across(B, S_B2 + 8, 4), ...across(A, S_FIN, 4), ...across(A, S_FIN + 8, 4), ...across(OUTRO, S_OUTRO, 4),
];

/** whether `beat` falls in bars `from` to `to` */
const within = (beat: number, from: number, to: number): boolean => beat >= from * 4 && beat < to * 4;
const inBars = (from: number, to: number) => SONG.filter(({ beat }) => within(beat, from, to));

/** the marimba's riff over a bar, in sixteenths: [step, which of the chord's four notes, velocity] */
const RIFF: [number, number, number][] = [[0, 0, 1], [3, 2, 0.75], [6, 1, 0.85], [8, 3, 0.8], [10, 2, 0.75], [11, 1, 0.65], [14, 2, 0.85]];

function riff(ch: Chord, beat: number, vel: number): Note[] {
  const v = close(ch, 65, 4);
  while (v.length < 4) v.push(v[0] + 12);
  return RIFF.filter(([s]) => s < ch.beats * 4).map(([s, k, a]) => C.note(0, beat + s / 4, 0.5, v[k], vel * a));
}

/** a marimba's tune, the notes longer than a beat rolled (struck over and over, a thirty-second apart) */
function rolled(notes: Note[]): Note[] {
  const out: Note[] = [];
  const step = C.spb / 8;
  for (const n of notes) {
    if (n.dur <= C.spb * 1.05) out.push(n);
    else for (let t = 0, k = 0; t < n.dur - step * 0.5; t += step, k++) out.push({ t: n.t + t, dur: step, midi: n.midi, vel: n.vel * (k === 0 ? 1 : k % 2 ? 0.5 : 0.6) });
  }
  return out;
}

/** the bass's figures over a bar, in sixteenths: [step, sixteenths long, the root, its octave, the fifth or a step into the next chord, velocity] */
type Fig = [number, number, 'R' | 'O' | '5' | 'N', number][];
const FUNK: Fig = [[0, 2, 'R', 1], [3, 1, 'R', 0.7], [6, 2, 'O', 0.9], [8, 2, '5', 0.85], [11, 1, 'R', 0.7], [12, 2, 'O', 0.85], [14, 2, 'N', 0.8]];
const BUSY: Fig = [[0, 2, 'R', 1], [3, 1, 'R', 0.7], [4, 1, 'O', 0.8], [6, 2, '5', 0.9], [8, 1, 'R', 0.85], [10, 2, 'O', 0.85], [12, 1, '5', 0.7], [13, 1, 'O', 0.7], [14, 2, 'N', 0.8]];
const HALF: Fig = [[0, 5, 'R', 1], [6, 2, 'R', 0.75], [8, 4, '5', 0.9], [14, 2, 'N', 0.7]];
const LONG: Fig = [[0, 6, 'R', 1], [6, 2, '5', 0.8], [8, 4, 'O', 0.85], [12, 4, '5', 0.75]];

function bassLine(fig: Fig, ch: Chord, beat: number, next: Chord | undefined): Note[] {
  const r = above(ch.bass, 29), five = above(ch.root + 7, 29);
  const nr = next ? above(next.bass, 29) : r;
  const into = nr === r ? five : nr > r ? nr - 1 : nr + 1;
  const out: Note[] = [];
  for (let o = 0; o < ch.beats; o += 4) {
    for (const [s, len, what, vel] of fig) {
      if (o + s / 4 >= ch.beats) continue;
      const midi = what === 'R' ? r : what === 'O' ? r + 12 : what === '5' || o + 4 < ch.beats ? five : into;
      out.push(C.note(0, beat + o + s / 4, len / 4, midi, vel));
    }
  }
  return out;
}

/** F major and B-flat major, the keys the harmony a third under the tunes keeps to */
const F_MAJOR = [5, 7, 9, 10, 0, 2, 4], B_FLAT = [10, 0, 2, 3, 5, 7, 9];

function thirdBelow(midi: number, key: number[]): number {
  for (const d of [3, 4]) if (key.includes((((midi - d) % 12) + 12) % 12)) return midi - d;
  return midi - 3;
}

const OCARINA: LeadOpts = { wave: 'soft', attack: 0.02, release: 0.07, glide: 0.03, slur: 0.02, vib: [5.5, 0.006, 0.25], cutoff: { base: 2600, amt: 0.4, key: 0.7 }, breath: 0.07 };
const BASS: LeadOpts = { wave: 'saw', attack: 0.004, release: 0.05, slur: 0, cutoff: { base: 260, amt: 5, decay: 0.12, key: 0.3, q: 1.3 } };
const WHISTLE: LeadOpts = { wave: 'sine', attack: 0.02, release: 0.06, glide: 0.25, slur: 0.05, vib: [7, 0.012, 0], breath: 0.04 };

export function renderBlocks(sr: number): Float32Array {
  const rng = new Rng(0xb10c5);
  const L = BLOCKS_SECONDS;
  const m = new Mix(sr / 2, L);
  const riffing = (beat: number) => beat < S_BREAK * 4 || within(beat, S_A2, S_BRIDGE) || within(beat, S_FIN, END - 2);
  const stabbing = (beat: number) => within(beat, S_GROOVE, S_BREAK) || within(beat, S_A2, S_BRIDGE) || within(beat, S_B2, END - 2);

  // the marimba: the riff, the climbing arpeggios of the build, its own tune in B-flat and the second tune the last time
  m.part(-4, (b, hs) => {
    const notes: Note[] = [];
    for (const { ch, beat } of SONG) if (riffing(beat)) notes.push(...riff(ch, beat, within(beat, S_FIN, END) ? 0.8 : 0.72));
    inBars(S_BUILD, S_A2).forEach(({ ch, beat }, bar) => {
      const v = close(ch, 60, 4);
      const n = bar < 4 ? 8 : 16;
      for (let k = 0; k < n; k++) notes.push(C.note(0, beat + (k * 4) / n, 4 / n, v[k % 4] + 12 * (Math.floor(k / 4) % 2), 0.45 + (0.4 * (bar + k / n)) / 8));
    });
    notes.push(...rolled(line(C, BRIDGE_TUNE, S_BRIDGE, 0.25, 16, 0.75)), ...rolled(line(C, BRIDGE_TUNE, S_BRIDGE + 8, 0.25, 16, 0.78)));
    notes.push(...rolled(line(C, BRIDGE_TUNE, S_BRIDGE + 8, 0.25, 16, 0.5).map((n) => ({ ...n, midi: thirdBelow(n.midi, B_FLAT) }))));
    notes.push(...rolled(line(C, TUNE_B, S_B2, 0.25, 16, 0.78)));
    // (the last chord, rolled)
    for (const midi of [65, 69, 72, 77]) notes.push(...rolled([C.note(END - 2, 0, 4, midi, 0.6)]));
    for (const n of notes) marimba(b, hs, n);
  });

  // the bass: the funk figure, a busier one in the break, half the pace in D minor, long notes under the marimba's tune;
  // in the build the root in eighths, its filter opening wider every bar
  m.part(-6, (b, hs) => {
    const notes: Note[] = [];
    SONG.forEach(({ ch, beat }, i) => {
      if (beat < S_GROOVE * 4 || beat >= (END - 2) * 4 || within(beat, S_BUILD, S_A2)) return;
      const fig = within(beat, S_BREAK, S_C) ? BUSY : within(beat, S_C, S_BUILD) ? HALF : within(beat, S_BRIDGE, S_B2) ? LONG : FUNK;
      notes.push(...bassLine(fig, ch, beat, SONG[i + 1]?.ch));
    });
    notes.push(C.note(END - 2, 0, 6, 29, 1));
    lead(b, hs, rng, notes, BASS);
    inBars(S_BUILD, S_A2).forEach(({ ch, beat }, bar) => {
      const r = above(ch.bass, 29);
      const ns = Array.from({ length: 8 }, (_, e) => C.note(0, beat + e / 2, 0.4, r + (e % 2 ? 12 : 0), 0.9));
      lead(b, hs, rng, ns, { ...BASS, cutoff: { base: 260 * Math.pow(1.3, bar), amt: 4, decay: 0.1, key: 0.3, q: 1.3 } });
    });
  });

  // the kick: syncopated, on every beat through the build, half the pace in D minor
  m.part(-6, (b, hs) => {
    for (let bar = S_GROOVE; bar < END - 2; bar++) {
      const beat = bar * 4;
      const steps = within(beat, S_C, S_BUILD) ? (bar % 2 ? [0, 7, 10] : [0, 10]) : within(beat, S_BUILD, S_A2) ? [0, 4, 8, 12]
        : within(beat, S_BRIDGE, S_B2) ? (bar % 2 ? [0, 8] : [0, 6, 8]) : bar % 2 ? [0, 6, 8, 11] : [0, 6, 8];
      for (const s of steps) kick(b, hs, rng, C.at(bar, s / 4), 0.9, 120);
    }
    kick(b, hs, rng, C.at(END - 2), 1, 120);
  });

  // claps on two and four (a snare and clap on three in D minor, a cross-stick under the marimba's tune), a fill every
  // eighth bar, and the build's roll, eighths and then sixteenths, swelling into the tune's return
  m.part(-7, (b, hs) => {
    for (let bar = S_GROOVE; bar < END - 2; bar++) {
      const beat = bar * 4;
      if (within(beat, S_BUILD, S_A2)) {
        for (const s of [4, 12]) clap(b, hs, rng, C.at(bar, s / 4), 0.7);
        continue;
      }
      if (within(beat, S_C, S_BUILD)) {
        snare(b, hs, rng, C.at(bar, 2), 0.8);
        clap(b, hs, rng, C.at(bar, 2), 0.5);
      } else if (within(beat, S_BRIDGE, S_B2)) for (const s of [4, 12]) rim(b, hs, rng, C.at(bar, s / 4), 0.9);
      else for (const s of [4, 12]) clap(b, hs, rng, C.at(bar, s / 4), 0.9);
      if (bar % 8 === 7) for (const s of [13, 14, 15]) snare(b, hs, rng, C.at(bar, s / 4), 0.35 + 0.1 * (s - 13), 0.6);
    }
    for (let bar = S_BUILD + 4; bar < S_A2; bar++) {
      const n = bar < S_BUILD + 6 ? 8 : 16;
      for (let k = 0; k < n; k++) snare(b, hs, rng, C.at(bar, (k * 4) / n), 0.25 + (0.6 * (bar - S_BUILD - 4 + k / n)) / 4, 0.6);
    }
  });

  // the hi-hats: eighths with a ghost or two, opening on the and of four; quarters in the break, sixteenths as the build swells
  m.part(-11, (b, hs) => {
    for (let bar = 4; bar < END - 2; bar++) {
      const beat = bar * 4;
      if (within(beat, S_BREAK, S_C)) {
        for (const s of [0, 4, 8, 12]) hat(b, hs, rng, C.at(bar, s / 4), 0.7);
        continue;
      }
      const build = within(beat, S_BUILD, S_A2);
      const soft = bar < S_GROOVE || within(beat, S_BRIDGE, S_B2) ? 0.7 : 1;
      for (let s = 0; s < 16; s++) {
        if (s % 2 === 0) hat(b, hs, rng, C.at(bar, s / 4), (s % 4 === 0 ? 0.8 : 0.6) * soft, s === 14 && !build && (bar % 2 === 1 || !within(beat, S_C, S_BUILD)));
        else if (build ? bar >= S_BUILD + 4 : s === 7 || s === 15) hat(b, hs, rng, C.at(bar, s / 4), 0.3 * soft);
      }
    }
  });

  // a crash at the head of each part and the build's rising rush of noise
  m.part(-15, (b, hs) => {
    for (const bar of [S_GROOVE, S_A1, S_B1, S_C, S_A2, S_BRIDGE, S_B2, S_FIN, END - 2]) burst(b, hs, rng, { t: C.at(bar), dur: 3, tau: 0.9, amp: 1, hp: 4000 });
    const t = C.at(S_BUILD + 4), dur = C.at(S_A2) - t;
    sweep(b, hs, rng, { t, dur, f: (x) => 400 * Math.pow(15, x / dur), q: 1.2, amp: (x) => 0.6 * (x / dur) ** 2 });
  });

  // the electric piano: short chords on the and of one and three, longer ones under the marimba's tune, and the last chord
  m.part(-8, (b, hs) => {
    const notes: Note[] = [];
    for (const { ch, beat } of SONG) {
      if (stabbing(beat)) {
        const v = close(ch, 60, 4);
        for (const s of ch.beats >= 4 ? [2, 10] : [2]) v.forEach((midi, k) => notes.push({ t: C.time(beat + s / 4) + k * 0.004 + rng.gauss() * 0.003, dur: 0.17, midi, vel: 0.5 }));
      } else if (within(beat, S_BRIDGE, S_B2)) {
        const v = close(ch, 55, 4);
        for (const [bt, len] of [[0, 2.4], [2.5, 1.4]]) v.forEach((midi, k) => notes.push({ t: C.time(beat + bt) + k * 0.006, dur: len * C.spb, midi, vel: bt ? 0.3 : 0.38 }));
      }
    }
    for (const [k, midi] of [53, 57, 60, 65, 69, 72].entries()) notes.push({ t: C.at(END - 2) + k * 0.01, dur: 2 * C.bar, midi, vel: 0.6 });
    for (const n of notes) epiano(b, hs, n, rng);
  });

  // the ocarina: the first tune, the second, the D minor tune's second half, the first again, long notes under the
  // marimba's second tune, and the first tune once more
  m.part(-4, (b, hs) => {
    const notes = [
      ...line(C, TUNE_A, S_A1, 0.25, 16, 0.8), ...line(C, TUNE_B, S_B1, 0.25, 16, 0.8), ...line(C, TUNE_C, S_C + 8, 0.25, 16, 0.75),
      ...line(C, TUNE_A, S_A2, 0.25, 16, 0.85), ...line(C, COUNTER, S_B2, 0.25, 16, 0.6), ...line(C, TUNE_A, S_FIN, 0.25, 16, 0.9),
    ].map((n) => ({ ...n, dur: n.dur * 0.92 }));
    lead(b, hs, rng, notes, OCARINA);
  });

  // a second ocarina a third under the first tune, its second and last times
  m.part(-10, (b, hs) => {
    const notes = [...line(C, TUNE_A, S_A2, 0.25, 16, 0.7), ...line(C, TUNE_A, S_FIN, 0.25, 16, 0.75)].map((n) => ({ ...n, midi: thirdBelow(n.midi, F_MAJOR), dur: n.dur * 0.92 }));
    lead(b, hs, rng, notes, OCARINA);
  });

  // bells: the D minor tune, then an octave over the ocarina's half of it, and over the last time through the first tune
  m.part(-8, (b, hs) => {
    for (const n of line(C, TUNE_C, S_C, 0.25, 16, 0.7)) addBell(b, hs, n.t, n.midi, n.vel);
    for (const n of line(C, TUNE_C, S_C + 8, 0.25, 16, 0.35, 12)) addBell(b, hs, n.t, n.midi, n.vel);
    for (const n of line(C, TUNE_A, S_FIN, 0.25, 16, 0.3, 12)) addBell(b, hs, n.t, n.midi, n.vel);
    for (const midi of [89, 93, 96]) addBell(b, hs, C.at(END - 2), midi, 0.4);
  });

  // plucked strings in eighths through the D minor part
  m.part(-7, (b, hs) => {
    for (const { ch, beat } of inBars(S_C, S_BUILD)) {
      const v = close(ch, 50, 4);
      while (v.length < 4) v.push(v[0] + 12);
      [0, 1, 2, 3, 2, 1, 2, 1].forEach((k, e) => pluck(b, hs, C.note(0, beat + e / 2, 0.5, v[k], e % 2 ? 0.6 : 0.8), rng, { t60: 1.4, bright: 0.45, damp: 0.12, pos: 0.14 }));
    }
  });

  // the break's woodblock calling and cowbell answering; the cowbell again on the and of two and four the second and
  // last times through the first tune, the tambourine on two and four the last time
  m.part(-13, (b, hs) => {
    for (let bar = S_BREAK; bar < S_C; bar++) {
      if ((bar - S_BREAK) % 2 === 0) for (const [s, f] of [[0, 1180], [3, 820], [6, 1180], [8, 1180], [10, 820]]) woodblock(b, hs, C.at(bar, s / 4), f, 0.9);
      else for (const s of [2, 5, 8, 12, 14]) cowbell(b, hs, C.at(bar, s / 4), 0.7);
    }
    for (const from of [S_A2, S_FIN]) {
      for (let bar = from; bar < from + 16; bar++) {
        for (const s of [6, 14]) cowbell(b, hs, C.at(bar, s / 4), 0.45);
        if (from === S_FIN) for (const s of [4, 12]) tambourine(b, hs, rng, C.at(bar, s / 4), 0.8);
      }
    }
  });

  // the slide whistle: up into the groove, down into the break, up into the last time through the tune, down at the end
  m.part(-14, (b, hs) => {
    const slide = (bar: number, beat: number, beats: number, from: number, to: number) => {
      const t = C.at(bar, beat), end = C.at(bar, beat + beats);
      lead(b, hs, rng, [{ t, dur: 0.08, midi: from, vel: 0.8 }, { t: t + 0.08, dur: end - t - 0.08, midi: to, vel: 0.8 }], WHISTLE);
    };
    slide(S_GROOVE - 1, 2, 2, 67, 91);
    slide(S_BREAK - 1, 2.5, 1.5, 91, 70);
    slide(S_FIN - 1, 2, 2, 67, 91);
    slide(END - 2, 1, 3, 93, 60);
  });

  return finishSong(m, sr, { t60: 1.4, wet: 0.18, size: 1.2 }, 4, 0.1, L);
}
