// (the eleven discs) The band the discs' newer songs play in (gen/discSongs.ts and the pieces it lists), on top of the
// soundtrack's own instruments (instruments.ts: piano, pads, bells, sub bass) and the Nether music's wavetable synth,
// piano, mixing and mastering (netherMusic.ts): struck voices built from decaying partials (an electric piano's tines,
// a vibraphone's and a marimba's bars, a kalimba's tongues), strings plucked by Karplus-Strong (a nylon guitar, a
// double bass, pizzicato), a monophonic lead that slurs and slides from note to note (a saxophone, a clarinet, a cello,
// a whistle, a chip's pulse), a drum kit, and the clock, chord and voicing helpers the pieces are written with. Every
// voice adds into a bus at the rate it's given (the Mix's half rate, in the pieces).

import { Rng, SVF, TAU, clamp, mtof, sinCyc, smooth } from './dsp';
import { burst, sweep, thump } from './texture';
import { type Note, Mix, master, melody } from './netherMusic';

// ------------------------------------------------------------------ time and harmony

/**
 * a piece's clock: beats (quarter notes) to seconds at `bpm`, `beats` to the bar, from `start` seconds; swung, every
 * off-beat eighth falls at `swing` of its beat (0.5 straight, 2/3 a triplet swing) and the sixteenths with them
 */
export class Clock {
  readonly spb: number;
  constructor(readonly bpm: number, readonly beats = 4, readonly swing = 0.5, readonly start = 0) {
    this.spb = 60 / bpm;
  }
  /** seconds per bar */
  get bar(): number {
    return this.beats * this.spb;
  }
  /** the time of `beat` beats in */
  time(beat: number): number {
    const k = Math.floor(beat), x = beat - k;
    const y = x < 0.5 ? x * 2 * this.swing : this.swing + (x - 0.5) * 2 * (1 - this.swing);
    return this.start + (k + y) * this.spb;
  }
  /** the time of beat `beat` of bar `bar` (both from 0) */
  at(bar: number, beat = 0): number {
    return this.time(bar * this.beats + beat);
  }
  /** a note from beat `beat` of bar `bar`, `beats` long */
  note(bar: number, beat: number, beats: number, midi: number, vel: number): Note {
    const t = this.at(bar, beat);
    return { t, dur: this.at(bar, beat + beats) - t, midi, vel };
  }
}

/**
 * a line in netherMusic.melody's notation ("C5:2 A4:1 r:1 | ..."), from bar `bar`, each step `step` beats long and
 * `perBar` steps to the bar, on the clock (swung with it), `transpose` semitones up
 */
export function line(c: Clock, spec: string, bar: number, step: number, perBar: number, vel = 1, transpose = 0): Note[] {
  return melody(spec, 0, 1, perBar, vel).map((n) => {
    const b = bar * c.beats + n.t * step;
    const t = c.time(b);
    return { t, dur: c.time(b + n.dur * step) - t, midi: n.midi + transpose, vel: n.vel };
  });
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim: [0, 3, 6],
  dim7: [0, 3, 6, 9], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14],
  '69': [0, 4, 7, 9, 14], '13': [0, 4, 7, 10, 14, 21], '7b9': [0, 4, 7, 10, 13], 'maj7#11': [0, 4, 7, 11, 18],
  m11: [0, 3, 7, 10, 14, 17], mmaj7: [0, 3, 7, 11],
};

export interface Chord {
  /** pitch class of the root */
  root: number;
  /** semitones above the root */
  tones: number[];
  /** pitch class in the bass */
  bass: number;
  beats: number;
}

const pcOf = (s: string): number => (PC[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0) + 12) % 12;

/** "Fmaj9 Bb13:2 C7:2 Dm/C": chord symbols (root, quality, a bass under a slash), each a bar long or `:beats` */
export function chords(spec: string, perBar: number): Chord[] {
  return spec.trim().split(/\s+/).map((tok) => {
    const m = /^([A-G][#b]?)([^/:]*)(?:\/([A-G][#b]?))?(?::([\d.]+))?$/.exec(tok);
    const q = m && QUALITY[m[2]];
    if (!m || !q) throw new Error(`discBand: bad chord "${tok}"`);
    const root = pcOf(m[1]);
    return { root, tones: q, bass: m[3] ? pcOf(m[3]) : root, beats: m[4] ? +m[4] : perBar };
  });
}

/** each chord of `prog` with the beat it starts on, counted from bar `bar` of a `perBar`-beat clock */
export function across(prog: Chord[], bar: number, perBar: number): { ch: Chord; beat: number }[] {
  let b = bar * perBar;
  return prog.map((ch) => {
    const r = { ch, beat: b };
    b += ch.beats;
    return r;
  });
}

/** pitch class `pc` at or above MIDI note `lo` */
export const above = (pc: number, lo: number): number => lo + ((((pc - lo) % 12) + 12) % 12);

/** the chord in close position from `lo` up (the fifth left out of chords of five notes or more), at most `max` notes */
export function close(ch: Chord, lo: number, max = 4): number[] {
  const t = ch.tones.length > 4 ? ch.tones.filter((x) => x !== 7) : ch.tones;
  return [...new Set(t.map((x) => above(ch.root + x, lo)))].sort((a, b) => a - b).slice(0, max);
}

/** a pianist's rootless voicing from `lo` up: the third, the seventh and the colours, without root or fifth */
export function rootless(ch: Chord, lo: number): number[] {
  let t = ch.tones.filter((x) => x % 12 !== 0 && x !== 7);
  if (t.length < 3) t = [...t, 12];
  return [...new Set(t.map((x) => above(ch.root + x, lo)))].sort((a, b) => a - b);
}

// ------------------------------------------------------------------ struck and plucked

const LN_1000 = Math.log(1000);

/**
 * one decaying partial (as dsp.addMode, from sine phase, down 60 dB in `t60` s) that is damped `hold` seconds in,
 * dying away over `rel` s from then: a bar, a tine or a string let go
 */
export function partial(out: Float32Array, sr: number, t: number, f: number, amp: number, t60: number, hold = Infinity, rel = 0.1): void {
  if (!(f > 0) || f >= sr * 0.45 || amp === 0) return;
  const s = Math.max(0, Math.round(t * sr));
  const r = Math.min(rel, t60);
  const h = Math.min(Math.round(hold * sr), Math.ceil(t60 * sr * 1.34));
  const end = Math.min(out.length, s + h + Math.ceil(r * sr * 1.34));
  const w = (TAU * f) / sr, c = Math.cos(w), sn = Math.sin(w);
  const k1 = Math.exp(-LN_1000 / (Math.max(1e-3, t60) * sr)), k2 = Math.exp(-LN_1000 / (Math.max(1e-3, r) * sr));
  let x = amp, y = 0;
  for (let i = s, n = 0; i < end; i++, n++) {
    out[i] += y;
    const k = n < h ? k1 : k2;
    const nx = k * (x * c - y * sn);
    y = k * (x * sn + y * c);
    x = nx;
  }
}

/**
 * an electric piano: a tine struck over its tone bar, a round fundamental with its octave and twelfth fading sooner
 * and, the harder it's hit, the tine's bark on top; let go, the damper stops it
 */
export function epiano(out: Float32Array, sr: number, n: Note, rng: Rng): void {
  const f = mtof(n.midi) * (1 + rng.bi() * 0.0006), v = n.vel;
  const T = clamp(6 * Math.pow(220 / f, 0.5), 1.2, 9);
  const b = 0.3 + 0.7 * v;
  partial(out, sr, n.t, f, v, T, n.dur, 0.22);
  partial(out, sr, n.t, f * 2, v * 0.28 * b, T * 0.35, n.dur, 0.14);
  partial(out, sr, n.t, f * 3, v * 0.09 * b, T * 0.18, n.dur, 0.1);
  partial(out, sr, n.t, f * 4, v * 0.035 * b, T * 0.12, n.dur, 0.08);
  partial(out, sr, n.t, f * 7.2, v * v * 0.1, 0.14, n.dur, 0.05);
  partial(out, sr, n.t, f * 13.3, v * v * 0.03, 0.07, n.dur, 0.04);
}

/** a vibraphone's bar: a long, pure ring, the two octaves above it (as the bars are tuned) fading first, a soft mallet */
export function vibes(out: Float32Array, sr: number, n: Note): void {
  const f = mtof(n.midi), v = n.vel;
  const T = clamp(9 * Math.pow(262 / f, 0.6), 2.5, 12);
  partial(out, sr, n.t, f, v, T, n.dur, 0.35);
  partial(out, sr, n.t, f * 4, v * 0.2, T * 0.2, n.dur, 0.2);
  partial(out, sr, n.t, f * 9.8, v * 0.04, T * 0.06, n.dur, 0.1);
  partial(out, sr, n.t, f * 2.76, v * 0.05, 0.035);
}

/** a marimba's rosewood bar over its resonator: warm and short, the bar's two tuned overtones (4 and 10 times up) quicker still */
export function marimba(out: Float32Array, sr: number, n: Note): void {
  const f = mtof(n.midi), v = n.vel;
  const T = clamp(1.6 * Math.pow(262 / f, 0.7), 0.25, 3);
  partial(out, sr, n.t, f, v, T, n.dur + 0.3, 0.2);
  partial(out, sr, n.t, f * 4, v * 0.22, T * 0.22);
  partial(out, sr, n.t, f * 9.9, v * 0.05, T * 0.07);
  partial(out, sr, n.t, f * 1.5, v * 0.04, 0.02);
}

/**
 * a kalimba's tongue: a bright ring, its bending mode (six times up) and the box's octave, plucked with a thumb; the
 * thumb comes back to stop it a little after the note's length
 */
export function kalimba(out: Float32Array, sr: number, n: Note): void {
  const f = mtof(n.midi), v = n.vel;
  const T = clamp(2.4 * Math.pow(523 / f, 0.5), 0.6, 3.5);
  const hold = n.dur + 0.3;
  partial(out, sr, n.t, f, v, T, hold, 0.2);
  partial(out, sr, n.t, f * 2, v * 0.06, T * 0.3, hold, 0.15);
  partial(out, sr, n.t, f * 6.1, v * 0.16, T * 0.1);
  partial(out, sr, n.t, f * 16.4, v * 0.03, T * 0.03);
}

export interface PluckOpts {
  /** how long the string rings (s to -60 dB) */
  t60: number;
  /** the pluck's brightness, 0..1 */
  bright: number;
  /** how fast it dies once let go (s) */
  damp?: number;
  /** where along the string it's plucked (a share of its length) */
  pos?: number;
}

/**
 * a plucked string (Karplus-Strong): a burst of noise, as bright as the pluck, circulating through a delay of one
 * period, averaged a little every trip (the higher partials dying first), tuned by an all-pass; damped once let go
 */
export function pluck(out: Float32Array, sr: number, n: Note, rng: Rng, o: PluckOpts): void {
  const f = mtof(n.midi);
  const period = sr / f;
  const N = Math.max(2, Math.floor(period - 0.5));
  const frac = period - 0.5 - N;
  const C = (1 - frac) / (1 + frac);
  const line = new Float32Array(N);
  const a = clamp(o.bright * (0.35 + 0.65 * n.vel), 0.03, 1);
  let lp = 0, mean = 0;
  for (let i = 0; i < N; i++) {
    lp += a * (rng.bi() - lp);
    line[i] = lp;
    mean += lp;
  }
  mean /= N;
  // (plucked at `pos`: the modes with a node there are missing)
  const d = Math.round(N * (o.pos ?? 0));
  const ex = line.map((v, i) => v - mean - (d > 0 ? line[(i + d) % N] - mean : 0));
  let pk = 0;
  for (const v of ex) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < N; i++) line[i] = pk > 0 ? (ex[i] / pk) * n.vel : 0;
  const damp = o.damp ?? 0.08;
  const g = Math.pow(10, (-3 * period) / (o.t60 * sr));
  const gd = Math.pow(10, (-3 * period) / (damp * sr));
  const s = Math.max(0, Math.round(n.t * sr));
  const hold = Math.round(n.dur * sr);
  const len = Math.min(out.length - s, Math.min(hold, Math.round(o.t60 * sr * 1.2)) + Math.round(damp * sr * 1.5));
  let p = 0, prev = 0, apx = 0, apy = 0;
  for (let i = 0; i < len; i++) {
    const x = line[p];
    out[s + i] += x;
    const avg = 0.5 * (x + prev);
    prev = x;
    const ap = C * avg + apx - C * apy;
    apx = avg;
    apy = ap;
    line[p] = ap * (i < hold ? g : gd);
    if (++p >= N) p = 0;
  }
}

/** a bus through an amplifier's tremolo: its level dips by `depth` (0..1) `rate` times a second */
export function tremolo(buf: Float32Array, sr: number, rate: number, depth: number): void {
  const inc = rate / sr;
  for (let i = 0; i < buf.length; i++) buf[i] *= 1 - depth * (0.5 + 0.5 * sinCyc(i * inc));
}

// ------------------------------------------------------------------ the lead

export type Wave = 'saw' | 'square' | 'pulse' | 'thin' | 'tri' | 'sine' | 'soft';

const TAB_N = 2048;
const TABLES = new Map<string, Float32Array>();
const H_STEPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];

/** a band-limited wavetable of `H` harmonics: saw, square, a 25% pulse, a thin 12.5% one, triangle, sine or soft */
function table(w: Wave, H: number): Float32Array {
  const key = w + H;
  let t = TABLES.get(key);
  if (t) return t;
  t = new Float32Array(TAB_N + 1);
  for (let h = 1; h <= (w === 'sine' ? 1 : H); h++) {
    let a = 0, ph = 0;
    if (w === 'saw') a = 1 / h;
    else if (w === 'square') a = h & 1 ? 1 / h : 0;
    else if (w === 'pulse' || w === 'thin') {
      a = Math.sin(Math.PI * h * (w === 'pulse' ? 0.25 : 0.125)) / h;
      ph = Math.PI / 2;
    } else if (w === 'tri') a = h & 1 ? ((h >> 1) & 1 ? -1 : 1) / (h * h) : 0;
    else if (w === 'sine') a = 1;
    else {
      a = 1 / Math.pow(h, 1.7);
      ph = h * 0.7;
    }
    if (a) for (let i = 0; i < TAB_N; i++) t[i] += a * Math.sin((TAU * h * i) / TAB_N + ph);
  }
  let pk = 0;
  for (let i = 0; i < TAB_N; i++) pk = Math.max(pk, Math.abs(t[i]));
  for (let i = 0; i < TAB_N; i++) t[i] /= pk;
  t[TAB_N] = t[0];
  TABLES.set(key, t);
  return t;
}

/** the wavetable of `w` for a note at `f` Hz with no harmonic above `maxF` */
function tableFor(w: Wave, f: number, maxF: number): Float32Array {
  let h = 1;
  for (const s of H_STEPS) if (s * f <= maxF) h = s;
  return table(w, h);
}

export interface LeadOpts {
  wave: Wave;
  /** s to full level */
  attack: number;
  /** time constant (s) of the fade once let go */
  release: number;
  /** time constant (s) of the slide into a slurred note (none without) */
  glide?: number;
  /** [rate Hz, depth as a share of the pitch, s before it swells in] */
  vib?: [number, number, number];
  /** a low-pass: `base` Hz, opened by `amt` times with the level (or, with `decay`, with a pluck dying over `decay` s) and following the pitch by `key` */
  cutoff?: { base: number; amt?: number; decay?: number; key?: number; q?: number };
  /** band-passes beside the low-pass, a voice's colour: [Hz, q, gain] */
  formants?: [number, number, number][];
  /** breath: noise round 1.8 kHz going with the note */
  breath?: number;
  /** a note starting within this many seconds of the last one's end slurs on from it (default 0.03) */
  slur?: number;
  /** the highest partial (Hz) */
  maxF?: number;
}

/**
 * a monophonic voice: each phrase (notes slurring one into the next) is one breath or one bow, sliding in pitch
 * between its notes, its vibrato swelling in on the longer ones; the level follows each note's velocity
 */
export function lead(out: Float32Array, sr: number, rng: Rng, notes: Note[], o: LeadOpts): void {
  const ns = [...notes].sort((a, b) => a.t - b.t);
  const slur = o.slur ?? 0.03;
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1].t - (ns[j].t + ns[j].dur) < slur) j++;
    phrase(out, sr, rng, ns.slice(i, j + 1), o);
    i = j + 1;
  }
}

function phrase(out: Float32Array, sr: number, rng: Rng, ns: Note[], o: LeadOpts): void {
  const BLK = 16;
  const last = ns[ns.length - 1];
  const s0 = Math.max(0, Math.round(ns[0].t * sr));
  const off = Math.round((last.t + last.dur) * sr);
  const s1 = Math.min(out.length, off + Math.round(o.release * 6 * sr));
  const maxF = o.maxF ?? sr * 0.45;
  const kg = o.glide ? Math.exp(-BLK / (o.glide * sr)) : 0;
  const ka = Math.exp(-BLK / (Math.max(0.002, o.attack / 3) * sr));
  const kr = Math.exp(-BLK / (o.release * sr));
  const c = o.cutoff;
  const lp = c ? new SVF(c.base, c.q ?? 0.7, sr) : null;
  const fm = (o.formants ?? []).map(([f, q]) => new SVF(f, q, sr));
  const fg = (o.formants ?? []).map((x) => x[2]);
  const br = o.breath ? new SVF(1800, 0.9, sr) : null;
  let k = 0;
  let lf = Math.log(mtof(ns[0].midi));
  let tab = tableFor(o.wave, mtof(ns[0].midi) * 1.06, maxF);
  let env = 0, ph = rng.next() * TAB_N, vph = rng.next();
  for (let b0 = s0; b0 < s1; b0 += BLK) {
    const t = b0 / sr;
    while (k + 1 < ns.length && t >= ns[k + 1].t) {
      k++;
      tab = tableFor(o.wave, mtof(ns[k].midi) * 1.06, maxF);
    }
    const nt = ns[k];
    const target = Math.log(mtof(nt.midi));
    lf = kg ? target + (lf - target) * kg : target;
    const since = t - nt.t;
    let f = Math.exp(lf);
    if (o.vib) {
      vph += (o.vib[0] * BLK) / sr;
      f *= 1 + o.vib[1] * smooth(clamp((since - o.vib[2]) / 0.5, 0, 1)) * sinCyc(vph);
    }
    const inc = (f / sr) * TAB_N;
    const e0 = env;
    env = b0 < off ? nt.vel + (env - nt.vel) * ka : env * kr;
    if (lp && c) {
      const fe = c.decay ? Math.exp(-since / c.decay) : env / Math.max(0.05, nt.vel);
      lp.set(c.base * Math.pow(f / 262, c.key ?? 0.5) * (1 + (c.amt ?? 0) * fe), c.q ?? 0.7, sr);
    }
    const b1 = Math.min(s1, b0 + BLK);
    const de = (env - e0) / (b1 - b0);
    let e = e0;
    for (let i = b0; i < b1; i++) {
      ph += inc;
      if (ph >= TAB_N) ph -= TAB_N;
      const q = ph | 0;
      let x = tab[q] + (tab[q + 1] - tab[q]) * (ph - q);
      if (br) x += br.band(rng.bi()) * o.breath!;
      let y = lp ? lp.low(x) : x;
      for (let m = 0; m < fm.length; m++) y += fm[m].band(x) * fg[m];
      out[i] += y * e;
      e += de;
    }
  }
}

// ------------------------------------------------------------------ drums

/** a kick: a sine body thumping down from `f0` to 46 Hz, and the beater's click */
export function kick(b: Float32Array, sr: number, rng: Rng, t: number, amp: number, f0 = 130): void {
  thump(b, sr, { t, f0, f1: 46, glide: 0.028, tau: 0.11, amp, h2: 0.12 });
  burst(b, sr, rng, { t, dur: 0.012, tau: 0.003, amp: amp * 0.2, lp: 3000 });
}

/** a snare: the shell's ring under the wires' hiss (`tone` longer or shorter) */
export function snare(b: Float32Array, sr: number, rng: Rng, t: number, amp: number, tone = 1): void {
  thump(b, sr, { t, f0: 240, f1: 185, glide: 0.015, tau: 0.045, amp: amp * 0.5 });
  burst(b, sr, rng, { t, dur: 0.3 * tone, tau: 0.055 * tone, amp, hp: 1200, lp: 7000 });
}

/** a hi-hat, closed or open */
export function hat(b: Float32Array, sr: number, rng: Rng, t: number, amp: number, open = false): void {
  burst(b, sr, rng, { t, dur: open ? 0.35 : 0.06, tau: open ? 0.11 : 0.017, amp, hp: 6500 });
}

/** a hand clap: three quick slaps of noise and the room after them */
export function clap(b: Float32Array, sr: number, rng: Rng, t: number, amp: number): void {
  for (const d of [0, 0.01, 0.021]) burst(b, sr, rng, { t: t + d, dur: 0.03, tau: 0.006, amp: amp * 0.8, bp: [1300, 0.9] });
  burst(b, sr, rng, { t: t + 0.03, dur: 0.2, tau: 0.05, amp: amp * 0.6, bp: [1250, 0.8] });
}

/** a cross-stick: the stick's shaft on the rim, a dry woody click */
export function rim(b: Float32Array, sr: number, rng: Rng, t: number, amp: number): void {
  partial(b, sr, t, 1720, amp, 0.05);
  partial(b, sr, t, 520, amp * 0.6, 0.04);
  burst(b, sr, rng, { t, dur: 0.02, tau: 0.004, amp: amp * 0.5, hp: 2000 });
}

/** a shaker: a swish of beads, soft in and quick out */
export function shaker(b: Float32Array, sr: number, rng: Rng, t: number, amp: number, len = 0.08): void {
  burst(b, sr, rng, { t, dur: len * 2.5, attack: len * 0.45, tau: len * 0.3, amp, hp: 4500 });
}

/** the ride cymbal's struck bell partials (Hz, level, s) */
const RIDE = [[537, 0.4, 2.2], [813, 0.3, 1.9], [1234, 0.35, 1.6], [1717, 0.3, 1.4], [2393, 0.25, 1.2], [3187, 0.25, 1.0], [4127, 0.2, 0.8], [5311, 0.15, 0.6], [6607, 0.12, 0.5]];

/** a ride cymbal: its ringing partials and the wash over them */
export function ride(b: Float32Array, sr: number, rng: Rng, t: number, amp: number): void {
  for (const [f, a, T] of RIDE) partial(b, sr, t, f * (1 + rng.bi() * 0.002), amp * a * 0.3, T);
  burst(b, sr, rng, { t, dur: 0.7, tau: 0.22, amp: amp * 0.5, hp: 5000 });
}

/** a brush swept across the snare's head */
export function brush(b: Float32Array, sr: number, rng: Rng, t: number, dur: number, amp: number): void {
  sweep(b, sr, rng, { t, dur, f: (x) => 3800 + 1600 * (x / dur), q: 0.7, amp: (x) => amp * Math.sin((Math.PI * x) / dur) ** 1.5 });
}

/** a woodblock at `f` */
export function woodblock(b: Float32Array, sr: number, t: number, f: number, amp: number): void {
  partial(b, sr, t, f, amp, 0.14);
  partial(b, sr, t, f * 2.71, amp * 0.35, 0.05);
}

/** a cowbell: two clanging partials and their overtones */
export function cowbell(b: Float32Array, sr: number, t: number, amp: number): void {
  for (const [f, a, T] of [[562, 1, 0.45], [845, 0.8, 0.35], [1690, 0.2, 0.15], [2530, 0.12, 0.1]]) partial(b, sr, t, f, amp * a, T);
}

/** a tambourine's jingles: bright metal and a rattle of noise */
export function tambourine(b: Float32Array, sr: number, rng: Rng, t: number, amp: number): void {
  for (let i = 0; i < 6; i++) partial(b, sr, t + rng.next() * 0.008, rng.range(5200, 9000), amp * 0.12, rng.range(0.08, 0.18));
  burst(b, sr, rng, { t, dur: 0.25, attack: 0.004, tau: 0.06, amp: amp * 0.7, hp: 6000 });
}

// ------------------------------------------------------------------ mastering

/**
 * a disc's song mastered as the Nether's music is (netherMusic.master: its room, levelled to `rms`, the peak capped,
 * the last `fadeSec` faded), then kept within `seconds`: if it rings on past them, it fades out over the same stretch
 * before them instead
 */
export function finishSong(m: Mix, sr: number, verb: { t60: number; wet: number; size?: number }, fadeSec: number, rms: number, seconds: number): Float32Array {
  let out = master(m, sr, verb, fadeSec, rms);
  const max = Math.round(seconds * sr);
  if (out.length > max) {
    const over = out.length - max;
    out = out.slice(0, max);
    // (undo what's left of master's fade, then fade again to the new end)
    const fl = Math.min(max >> 2, Math.round(fadeSec * sr));
    for (let i = 0; i < fl; i++) {
      const was = (i + over) / fl;
      const x = i / fl;
      out[max - 1 - i] *= was < 1 ? (x * x) / Math.max(1e-3, was * was) : x * x;
    }
  }
  return out;
}
