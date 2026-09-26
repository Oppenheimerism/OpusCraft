// (bastions) Music disc Pigstep (vanilla JukeboxSongs.PIGSTEP, sound event music_disc.pigstep, 2:29): a piece of our
// own in the spirit of the bastions' record, built with the Nether music's helpers (netherMusic.ts) at half the sample
// rate. A slow, heavy, swung beat in F minor: a fat detuned bass that wobbles under a low-pass, a stomping kick and a
// clap on two and four with shuffling hats, stabs of a dark square chord, a nasal lead with a hook that keeps coming
// back, and now and then a grunt, a snort pitched to the key. Intro, two grooves, the hook, a breakdown over the bass
// alone, the hook again an octave up, and an outro that strips it back down.

import { Rng, TAU, clamp, echo, highpass, lowpass } from './dsp';
import { burst, thump } from './texture';
import { type Note, Mix, chordOf, legato, lowpassSweep, master, melody, nm, synth } from './netherMusic';

/** the song's length (vanilla JukeboxSong length_in_seconds 149) */
export const PIGSTEP_SECONDS = 149;

const BPM = 86;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
/** the swing: every second sixteenth is pushed late by this share of a sixteenth */
const SWING = 0.28;
/** where each part begins, in bars (52 bars in all, about 145 s, and the tail) */
const INTRO = 0, GROOVE = 4, HOOK = 12, GROOVE2 = 20, BREAK = 28, HOOK2 = 32, OUTRO = 44, END = 52;

/** the time of sixteenth `s` of bar `bar`, swung */
function at(bar: number, s: number): number {
  return bar * BAR + (s + (s % 2 ? SWING : 0)) * (BEAT / 4);
}

/** the four-bar chord loop, one chord a bar: Fm, Db, Eb, C (with its major third, the hook's pull home) */
const CHORDS = ['F3 Ab3 C4 Eb4', 'Db3 F3 Ab3 C4', 'Eb3 G3 Bb3 Db4', 'C3 E3 G3 Bb3'];
const ROOTS = ['F1', 'Db1', 'Eb1', 'C1'];

/** a snort pitched to the key: a buzzing saw sliding down through a nasal band, a breath of noise over it */
function grunt(b: Float32Array, hs: number, rng: Rng, t: number, midi: number, amp: number): void {
  const s = Math.round(t * hs), n = Math.min(b.length - s, Math.round(0.34 * hs));
  if (n <= 0) return;
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const tmp = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = f0 * (1.25 - 0.35 * x) * (1 + 0.03 * Math.sin(TAU * 31 * (i / hs)));
    ph += f / hs;
    const saw = 2 * (ph - Math.floor(ph)) - 1;
    const e = Math.min(1, i / (0.012 * hs)) * Math.pow(1 - x, 1.6);
    tmp[i] = saw * e;
  }
  // the nose: a low and a high formant (an "o" pinched towards "n")
  const lo = new Float32Array(tmp), hi = new Float32Array(tmp);
  lowpass(lo, 700, hs, 4);
  highpass(hi, 1100, hs);
  lowpass(hi, 1600, hs, 3);
  for (let i = 0; i < n; i++) b[s + i] += amp * (lo[i] * 0.8 + hi[i] * 0.5);
  burst(b, hs, rng, { t, dur: 0.25, tau: 0.08, amp: amp * 0.25, bp: [1800, 1.5] });
}

export function renderPigstep(sr: number): Float32Array {
  const rng = new Rng(0x9195ee9);
  const L = PIGSTEP_SECONDS;
  const m = new Mix(sr / 2, L);
  /** whether bar `bar` has the full beat */
  const beatOn = (bar: number) => bar >= GROOVE && bar < OUTRO + 4 && (bar < BREAK || bar >= HOOK2);

  // the kick: a stomp on one and three, a skip before three, fills at the end of each four bars
  m.part(-2, (b, hs) => {
    for (let bar = GROOVE; bar < END - 2; bar++) {
      if (!beatOn(bar) && bar !== BREAK + 3) continue;
      const hits = bar % 4 === 3 ? [0, 6, 8, 11, 14] : [0, 6, 8];
      for (const s of hits) thump(b, hs, { t: at(bar, s), f0: 120, f1: 44, glide: 0.035, tau: 0.13, amp: s === 0 ? 1 : 0.8, h2: 0.3 });
    }
    lowpass(b, 900, hs);
  });

  // the clap on two and four: a snap of noise over a short tone
  m.part(-7, (b, hs) => {
    for (let bar = GROOVE; bar < END - 2; bar++) {
      if (!beatOn(bar)) continue;
      for (const s of [4, 12]) {
        for (const d of [0, 0.011, 0.023]) burst(b, hs, rng, { t: at(bar, s) + d, dur: 0.16, tau: 0.035, amp: 0.7, bp: [1400, 0.9] });
        thump(b, hs, { t: at(bar, s), f0: 210, f1: 170, glide: 0.02, tau: 0.05, amp: 0.35 });
      }
    }
  });

  // the hats: swung sixteenths, the off-beats open, lighter in the grooves than under the hook
  m.part(-13, (b, hs) => {
    for (let bar = GROOVE; bar < END - 1; bar++) {
      if (!beatOn(bar) && bar < BREAK + 2) continue;
      const hook = (bar >= HOOK && bar < GROOVE2) || (bar >= HOOK2 && bar < OUTRO);
      for (let s = 0; s < 16; s++) {
        if (!hook && s % 2) continue;
        const open = s % 4 === 2;
        burst(b, hs, rng, { t: at(bar, s), dur: open ? 0.2 : 0.05, tau: open ? 0.07 : 0.018, amp: s % 4 === 0 ? 0.9 : 0.6, hp: 7000 });
      }
    }
  });

  // the bass: the loop's roots in a syncopated figure, a fat detuned saw, its filter wobbling in eighth-note triplets
  m.part(-1, (b, hs) => {
    const notes: Note[] = [];
    for (let bar = INTRO; bar < END - 1; bar++) {
      const root = nm(ROOTS[bar % 4]);
      // root, the octave pop, root again late in the bar, and the fifth leading on
      const figure: [number, number, number][] = [[0, 5, 0], [6, 2, 12], [8, 4, 0], [14, 2, 7]];
      for (const [s, len, up] of figure) {
        if (bar >= OUTRO + 6 && s > 0) continue;
        notes.push({ t: at(bar, s), dur: (len * BEAT) / 4, midi: root + up + 12, vel: s === 0 ? 1 : 0.8 });
      }
    }
    synth(b, hs, rng, notes, { wave: 'saw', voices: 3, detune: 14, attack: 0.008, release: 0.08, maxF: 3000 });
    const wob = (t: number) => {
      const bar = t / BAR;
      const depth = bar < GROOVE ? 0.25 : bar >= BREAK && bar < HOOK2 ? 1 : 0.6;
      const w = 0.5 - 0.5 * Math.cos(TAU * (t / (BEAT / 3)));
      return 180 + 900 * depth * w + (bar < GROOVE ? 300 * clamp(bar / GROOVE, 0, 1) : 400);
    };
    lowpassSweep(b, hs, wob, 1.6);
  });

  // the stabs: the chord on the and-of-two and on four, a dark square, short
  m.part(-9, (b, hs) => {
    const notes: Note[] = [];
    for (let bar = GROOVE; bar < OUTRO + 4; bar++) {
      if (bar >= BREAK && bar < HOOK2) continue;
      for (const s of [6, 12]) for (const n of chordOf(CHORDS[bar % 4])) notes.push({ t: at(bar, s), dur: BEAT * 0.4, midi: n, vel: 0.7 });
    }
    synth(b, hs, rng, notes, { wave: 'square', voices: 2, detune: 10, attack: 0.004, release: 0.06, maxF: 2600 });
    lowpass(b, 1800, hs);
    echo(b, hs, BEAT * 0.75, 0.25, 0.25, 2200);
  });

  // a pad under the hooks and the breakdown
  m.part(-14, (b, hs) => {
    const notes: Note[] = [];
    for (const [from, to] of [[HOOK, GROOVE2], [BREAK, HOOK2], [HOOK2, OUTRO]])
      for (let bar = from; bar < to; bar++) for (const n of chordOf(CHORDS[bar % 4])) notes.push({ t: bar * BAR, dur: BAR, midi: n + 12, vel: 0.6 });
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 4, detune: 20, attack: 0.9, release: 1.2, vib: [0.3, 0.002], maxF: 3500 });
  });

  // the lead: the hook, a call and its answer over the loop, nasal and a little bent
  m.part(-5, (b, hs) => {
    const step = BEAT / 4;
    const HOOK_A = 'F4:3 Ab4:3 C5:2 Bb4:4 Ab4:4 | F4:3 Ab4:3 Db5:2 C5:8 | Eb5:3 Db5:3 C5:2 Bb4:4 G4:4 | C5:6 Bb4:2 G4:4 E4:4';
    const HOOK_B = 'F4:3 Ab4:3 C5:2 Eb5:4 C5:4 | Db5:6 C5:2 Ab4:8 | Bb4:3 C5:3 Db5:2 Eb5:4 Db5:4 | C5:12 r:4';
    const up = (spec: string) => spec.replace(/([A-G][#b]?)(\d)/g, (_, n, o) => `${n}${+o + 1}`);
    const notes: Note[] = [];
    const phrase = (spec: string, bar: number, vel: number) => {
      for (const n of melody(spec, bar * BAR, step, 16, vel)) {
        // swing the lead with the beat
        const s = Math.round((n.t - bar * BAR) / step);
        notes.push({ ...n, t: at(bar, 0) + (s + (s % 2 ? SWING : 0)) * step });
      }
    };
    phrase(HOOK_A, HOOK, 0.9);
    phrase(HOOK_B, HOOK + 4, 0.9);
    phrase(HOOK_A, GROOVE2 + 4, 0.7);
    phrase(up(HOOK_A), HOOK2, 0.9);
    phrase(up(HOOK_B), HOOK2 + 4, 0.95);
    phrase(HOOK_A, HOOK2 + 8, 0.85);
    synth(b, hs, rng, notes, { wave: 'square', voices: 2, detune: 16, attack: 0.02, release: 0.12, vib: [5.2, 0.008], maxF: 4200 });
    // the nose of it: a band round 1.2 kHz
    lowpass(b, 2600, hs, 2.2);
    echo(b, hs, BEAT * 0.75, 0.3, 0.3, 3000);
  });

  // the grunts: in the gaps of the grooves, the breakdown's answers, one to close
  m.part(-8, (b, hs) => {
    const hits: [number, number, string][] = [
      [GROOVE + 1, 14, 'F3'], [GROOVE + 3, 14, 'C3'], [GROOVE + 5, 14, 'F3'], [GROOVE + 7, 12, 'Eb3'],
      [GROOVE2 + 1, 14, 'F3'], [GROOVE2 + 3, 12, 'Ab3'], [BREAK, 8, 'F3'], [BREAK + 1, 8, 'Db3'], [BREAK + 2, 8, 'Eb3'], [BREAK + 3, 4, 'C3'],
      [BREAK + 3, 12, 'C3'], [OUTRO + 3, 14, 'F3'], [OUTRO + 7, 0, 'F2'],
    ];
    for (const [bar, s, n] of hits) grunt(b, hs, rng, at(bar, s), nm(n), 0.8);
    echo(b, hs, BEAT * 0.5, 0.22, 0.25, 2500);
  });

  return master(m, sr, { t60: 1.6, wet: 0.16, size: 1.2 }, 4);
}

/** the song as a music pool of one track (vanilla sound event music_disc.pigstep) */
export const PIGSTEP_MUSIC_POOLS: Record<string, number[]> = { 'music_disc.pigstep': [0] };

export function renderPigstepMusic(_pool: string, sr: number): Float32Array {
  return renderPigstep(sr);
}
