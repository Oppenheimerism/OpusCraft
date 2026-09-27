// (the eleven discs) Music disc ward (vanilla music_disc.ward, 4:11): a piece of our own in the disc's changeable
// mood, strange by turns and bouncy by turns, for the discs' band (discBand.ts) at half the sample rate. It opens
// somewhere odd: a low drone a tritone wide, whole-tone chimes falling at random, bells swelling backwards, metal
// scraping and slow thumps that keep no time. Then a little band strikes up a march in F (a clarinet's tune, a tuba's
// oom-pah, pizzicato strings, snare and bass drum) until the tuba sags and the strangeness seeps back in; the band
// returns with a mischievous tune in D minor, fades into the drone again, the thumps fall into step and bring the march
// back once more with a glockenspiel on top, and it all ends in the drone and a last struck gong.

import { Rng, clamp, reverse, smooth } from './dsp';
import { addBell } from './instruments';
import { type Note, Mix, gong, lowpassSweep, synth } from './netherMusic';
import { burst, creak, thump } from './texture';
import { Clock, type Chord, above, across, chords, close, finishSong, kalimba, kick, lead, line, pluck, snare } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 251) */
export const WARD_SECONDS = 251;

/** the three marches, each on its own clock (132 to the minute) starting where it strikes up (s) */
const BPM = 132;
const M1 = new Clock(BPM, 4, 0.5, 36), M2 = new Clock(BPM, 4, 0.5, 108), M3 = new Clock(BPM, 4, 0.5, 190);
const M1_BARS = 24, M2_BARS = 32, M3_BARS = 24;
const M1_END = M1.at(M1_BARS), M2_END = M2.at(M2_BARS), M3_END = M3.at(M3_BARS);

const MARCH = chords('F C7 F Bb F/C C7 F F Dm A7 Dm G7 C G7 C7 C7 F C7 F Bb Bbm F/C:2 C7:2 F F', 4);
const MINOR = chords('Dm Dm A7 A7 Dm Dm Gm A7 Gm Dm A7 Dm Bb Gm A7 Dm', 4);

const TUNE_M = [
  'C5:1 C5:1 F5:1 A5:1 C6:2 A5:2', 'Bb5:1 G5:1 E5:1 C5:1 G5:2 E5:2', 'F5:1 A5:1 C6:1 F6:1 E6:1 D6:1 C6:2', 'D6:2 Bb5:2 F5:2 D5:2',
  'C5:1 F5:1 A5:1 C6:1 A5:1 F5:1 A5:2', 'G5:1 A5:1 Bb5:1 C6:1 D6:2 E6:2', 'F6:2 C6:2 A5:2 F5:2', 'r:2 C5:1 D5:1 E5:1 F5:1 G5:1 A5:1',
  'A5:2 D6:2 F6:2 D6:2', 'E6:1 C#6:1 A5:1 G5:1 E5:2 C#5:2', 'D5:1 F5:1 A5:1 D6:1 C6:1 A5:1 F5:2', 'G5:2 B5:2 D6:2 F6:2',
  'E6:2 C6:2 G5:2 E5:2', 'F5:1 G5:1 A5:1 B5:1 D6:2 B5:2', 'C6:2 G5:2 E5:2 Bb5:2', 'r:2 C5:1 E5:1 G5:1 Bb5:1 C6:1 E6:1',
  'C6:1 C6:1 A5:1 F5:1 C6:2 F6:2', 'E6:1 C6:1 G5:1 E5:1 Bb5:2 G5:2', 'A5:1 C6:1 F6:1 C6:1 A5:1 F5:1 C5:2', 'D5:2 F5:2 Bb5:2 D6:2',
  'Db6:2 Bb5:2 F5:2 Db5:2', 'C5:2 A5:2 G5:2 E5:2', 'F5:2 A5:1 C6:1 F6:2 r:2', 'F5:1 r:1 C5:1 r:1 F4:2 r:2',
].join(' | ');
const TUNE_MINOR = [
  'D5:1 E5:1 F5:1 A5:1 D6:2 A5:2', 'Bb5:1 A5:1 G5:1 F5:1 E5:2 D5:2', 'C#5:1 E5:1 A5:1 C#6:1 E6:2 C#6:2', 'D6:1 C#6:1 Bb5:1 A5:1 G5:2 E5:2',
  'F5:2 A5:2 D6:2 F6:2', 'E6:1 F6:1 E6:1 D6:1 C#6:2 A5:2', 'Bb5:2 D6:2 G6:2 D6:2', 'C#6:1 D6:1 E6:1 C#6:1 A5:4',
  'G5:1 A5:1 Bb5:1 D6:1 G6:2 D6:2', 'F6:1 E6:1 D6:1 A5:1 F5:2 D5:2', 'E5:1 G5:1 Bb5:1 C#6:1 E6:2 C#6:2', 'D6:2 A5:2 F5:2 D5:2',
  'D6:2 F6:2 Bb5:2 F5:2', 'G5:2 Bb5:2 D6:2 Bb5:2', 'A5:1 C#6:1 E6:1 G6:1 F6:1 E6:1 C#6:2', 'D6:4 r:4',
].join(' | ');
/** the glockenspiel's answers the second time through the minor tune, on the pah of two and four */
const GLINTS = [
  'r:2 A6:2 r:2 F6:2', 'r:2 D6:2 r:2 A6:2', 'r:2 E6:2 r:2 G6:2', 'r:2 C#7:2 r:2 A6:2', 'r:2 F6:2 r:2 A6:2', 'r:2 D7:2 r:2 A6:2', 'r:2 G6:2 r:2 Bb6:2', 'r:2 E6:2 r:2 C#7:2',
  'r:2 G6:2 r:2 D7:2', 'r:2 F6:2 r:2 A6:2', 'r:2 C#7:2 r:2 E7:2', 'r:2 D7:2 r:2 A6:2', 'r:2 F6:2 r:2 D7:2', 'r:2 Bb6:2 r:2 G6:2', 'r:2 E6:2 r:2 G6:2', 'r:2 F6:2 D6:4',
].join(' | ');

/** the stretches of strangeness (s) and the root of each one's drone (a tritone above it sounds with it) */
const STRANGE: { from: number; to: number; root: number }[] = [
  { from: 0, to: M1.start, root: 36 }, { from: M1_END, to: M2.start, root: 38 }, { from: M2_END, to: M3.start, root: 40 }, { from: M3_END, to: WARD_SECONDS - 1, root: 36 },
];
const CODA = STRANGE[STRANGE.length - 1];

/** a march's oom-pah from bar `bar` on: the tuba's root on one and fifth on three, the strings' short chords on two and four */
function oomPah(c: Clock, prog: Chord[], bar: number, tuba: Note[], pizz: Note[]): void {
  for (const { ch, beat } of across(prog, bar, 4)) {
    const root = above(ch.bass, 34);
    const fifth = root + 7 > 46 ? root - 5 : root + 7;
    for (const [bt, midi] of ch.beats >= 4 ? [[0, root], [2, fifth]] : [[0, root]]) tuba.push(c.note(0, beat + bt, 0.75, midi, 0.85));
    for (const bt of ch.beats >= 4 ? [1, 3] : [1]) for (const midi of close(ch, 55, 3)) pizz.push(c.note(0, beat + bt, 0.3, midi, 0.55));
  }
}

export function renderWard(sr: number): Float32Array {
  const rng = new Rng(0x3a4d);
  const L = WARD_SECONDS;
  const m = new Mix(sr / 2, L);

  // the clarinet, short and reedy: the march's tune, the minor tune twice, the march's tune again
  m.part(-3, (b, hs) => {
    const notes = [...line(M1, TUNE_M, 0, 0.5, 8, 0.8), ...line(M2, TUNE_MINOR, 0, 0.5, 8, 0.8), ...line(M2, TUNE_MINOR, 16, 0.5, 8, 0.85), ...line(M3, TUNE_M, 0, 0.5, 8, 0.85)]
      .map((n) => ({ ...n, dur: n.dur * 0.72 }));
    lead(b, hs, rng, notes, {
      wave: 'square', attack: 0.015, release: 0.05, vib: [5.5, 0.004, 0.3], slur: 0, cutoff: { base: 1500, amt: 0.8, key: 0.5 }, formants: [[1400, 3, 0.12]], breath: 0.04,
    });
  });

  // the tuba's oom and the strings' pah; at the end of the first march the tuba sags a tritone and goes on sinking
  m.part(-5, (b, hs) => {
    const tuba: Note[] = [], pizz: Note[] = [];
    oomPah(M1, MARCH, 0, tuba, pizz);
    oomPah(M2, MINOR, 0, tuba, pizz);
    oomPah(M2, MINOR, 16, tuba, pizz);
    oomPah(M3, MARCH, 0, tuba, pizz);
    const tone = { wave: 'saw' as const, attack: 0.03, release: 0.08, cutoff: { base: 320, amt: 1.3, key: 0.3 }, formants: [[420, 2, 0.25]] as [number, number, number][] };
    lead(b, hs, rng, tuba, { ...tone, slur: 0 });
    lead(b, hs, rng, [{ t: M1_END, dur: 1.2, midi: 41, vel: 0.9 }, { t: M1_END + 1.2, dur: 3.5, midi: 35, vel: 0.7 }], { ...tone, glide: 1.1, slur: 0.1, vib: [2.5, 0.02, 0.5] });
    for (const n of pizz) pluck(b, hs, n, rng, { t60: 0.6, bright: 0.55, damp: 0.04, pos: 0.18 });
  });

  // the glockenspiel: answers the second time through the minor tune, and the march's tune an octave up the last time
  m.part(-9, (b, hs) => {
    for (const n of line(M2, GLINTS, 16, 0.5, 8, 0.6)) addBell(b, hs, n.t, n.midi, n.vel);
    for (const n of line(M3, TUNE_M, 0, 0.5, 8, 0.45, 12)) addBell(b, hs, n.t, n.midi, n.vel);
  });

  // the drums: bass drum with the tuba, snare on two and four, a roll into each march and a crash as it strikes up
  m.part(-10, (b, hs) => {
    for (const [c, bars] of [[M1, M1_BARS], [M2, M2_BARS], [M3, M3_BARS]] as [Clock, number][]) {
      for (let bar = 0; bar < bars; bar++) {
        const last = bar === bars - 1;
        for (const bt of last ? [0] : [0, 2]) kick(b, hs, rng, c.at(bar, bt), 0.8, 100);
        if (last) continue;
        for (const bt of [1, 3]) snare(b, hs, rng, c.at(bar, bt), 0.7, 0.8);
        if (bar % 8 === 7) for (const bt of [3.5, 3.75]) snare(b, hs, rng, c.at(bar, bt), 0.5, 0.6);
      }
      // (the roll: sixteenths growing over the bar before)
      for (let k = 0; k < 16; k++) snare(b, hs, rng, c.at(-1, k / 4), 0.15 + 0.5 * (k / 16), 0.5);
      burst(b, hs, rng, { t: c.start, dur: 2.5, tau: 0.7, amp: 0.8, hp: 4500 });
    }
  });

  // the drones of the strange parts, a tritone wide, their filter slowly opening and closing
  m.part(-8, (b, hs) => {
    const notes: Note[] = [];
    for (const s of STRANGE) {
      const t = Math.max(0, s.from - 0.5), end = s.to - 2;
      notes.push({ t, dur: end - t, midi: s.root, vel: 0.8 }, { t: t + 2, dur: end - t - 2, midi: s.root + 6, vel: 0.55 });
    }
    synth(b, hs, rng, notes, { wave: 'soft', voices: 2, detune: 9, attack: 3, release: 1.2, maxF: 2000 });
    lowpassSweep(b, hs, (t) => 260 + 240 * Math.sin(0.21 * t) ** 2, 1.2);
  });

  // chimes falling at random from the whole-tone scale on each drone's root, each a little out of tune, and bells
  // swelling backwards into the middle of each strange part and into the march that ends it
  m.part(-8, (b, hs) => {
    for (const s of STRANGE) {
      for (let t = s.from + 1 + rng.range(0, 1); t < s.to - 1.5; t += rng.range(0.4, 1.6)) {
        const midi = s.root + 36 + 2 * rng.int(6) + (rng.chance(0.3) ? 12 : 0);
        kalimba(b, hs, { t, dur: 1.5, midi: midi + rng.bi() * 0.25, vel: rng.range(0.35, 0.8) });
      }
      for (const at of s === CODA ? [s.from + (s.to - s.from) * 0.45] : [s.from + (s.to - s.from) * 0.45, s.to]) {
        const len = Math.round(3 * hs);
        const one = new Float32Array(len);
        addBell(one, hs, 0, s.root + 43, 0.8);
        addBell(one, hs, 0, s.root + 37, 0.5);
        const back = reverse(one);
        const s0 = Math.round(at * hs) - len;
        for (let i = Math.max(0, -s0); i < len; i++) b[s0 + i] += back[i];
      }
    }
  });

  // metal scraping somewhere in each strange part
  m.part(-19, (b, hs) => {
    for (const s of STRANGE) {
      const t = s.from + (s.to - s.from) * rng.range(0.25, 0.6);
      creak(b, hs, rng, {
        t, dur: 2.2, rate: (x) => 38 + 25 * Math.sin(x * 2.1), amp: (x) => Math.sin(Math.PI * clamp(x / 2.2, 0, 1)), jitter: 0.25,
        bands: [{ f: 1250, q: 18, g: 1 }, { f: 2310, q: 22, g: 0.6 }, { f: 3480, q: 25, g: 0.3 }],
      });
    }
  });

  // the thumps: slow and out of time, but before the last march they fall into step with it
  m.part(-10, (b, hs) => {
    for (const s of STRANGE) {
      const toLast = s.to === M3.start;
      const settle = toLast ? M3.at(-4) : s.to;
      for (let t = s.from + 2 + rng.range(0, 1.5); t < settle - 1; t += rng.range(1.1, 2.6)) thump(b, hs, { t, f0: 70, f1: 42, glide: 0.05, tau: 0.16, amp: rng.range(0.5, 0.9), h2: 0.2 });
      if (toLast) for (let k = 0; k < 16; k++) thump(b, hs, { t: M3.at(-4, k), f0: 70, f1: 42, glide: 0.05, tau: 0.16, amp: 0.5 + 0.4 * smooth(k / 16), h2: 0.2 });
    }
  });

  // the last gong and a high bell over the final drone
  m.part(-9, (b, hs) => {
    gong(b, hs, M3_END + 3, 65.4, 1, 9);
    addBell(b, hs, M3_END + 3.02, 96, 0.5);
  });

  return finishSong(m, sr, { t60: 2.2, wet: 0.4, size: 1.6 }, 6, 0.095, L);
}
