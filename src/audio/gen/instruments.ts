// Instrument voices for the procedural soundtrack: an additive piano model, plus soft pads,
// celesta-like bells, a gentle synth pluck and a sub bass.

import { Rng, SVF, TAU, addMode, clamp, mtof, sinCyc } from './dsp';

// ------------------------------------------------------------------ piano

/**
 * One piano note at reference velocity, `n` samples long (the caller applies velocity,
 * brightness and damper release when mixing).
 *
 * Model: partials f_k = k f0 sqrt(1 + B k^2) (string stiffness / stretch), amplitudes shaped
 * by hammer strike position (comb notches near k = 7, 14), hammer felt low-pass and soundboard
 * radiation; each partial is a *pair* of slightly detuned damped sinusoids — a fast "prompt"
 * component and a slow "aftersound" component — which reproduces the piano's two-stage decay
 * and the gentle beating of unison strings. Higher partials decay faster (frequency-dependent
 * losses). A short filtered-noise hammer knock and a soundboard thud complete the attack.
 */
export function pianoNote(midi: number, n: number, sr: number, seed: number, tone = 0.5): Float32Array {
  const out = new Float32Array(n);
  const rng = new Rng(seed);
  const f0 = mtof(midi);
  const B = clamp(0.00038 * Math.pow(2, ((midi - 60) / 12) * 0.95), 0.00006, 0.004);
  const T1 = pianoDecay(midi);
  const beta = 1 / rng.range(7.1, 7.9);
  const fc = (1200 + 2400 * tone) * Math.max(1, Math.pow(f0 / 262, 0.5));
  const fmax = Math.min(sr * 0.45, 6500);
  const fd = 1600;
  const lf0 = 1 + (f0 / fd) * (f0 / fd);
  const maxK = midi < 45 ? 36 : midi < 60 ? 28 : 20;
  for (let k = 1; k <= maxK; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > fmax) break;
    const strike = Math.pow(Math.abs(Math.sin(Math.PI * k * beta)), 0.5);
    const hammer = 1 / (1 + (fk / fc) * (fk / fc));
    const board = (fk * fk) / (fk * fk + 90 * 90);
    const a = (strike * hammer * board) / Math.pow(k, 0.6);
    if (a < 2e-4) continue;
    const loss = (1 + (fk / fd) * (fk / fd)) / lf0;
    const Ts = T1 / loss;
    const det = (0.12 + 0.45 * rng.next()) * (rng.next() < 0.5 ? -1 : 1) * Math.min(3, Math.sqrt(k));
    addMode(out, 0, sr, fk, a * 0.55, Ts / 3, n); // prompt sound
    addMode(out, 0, sr, fk + det, a * 0.45, Ts, n); // aftersound (detuned unison string)
  }
  // loudness balance across the keyboard: RMS over the first 0.3 s
  const m = Math.min(n, Math.round(0.3 * sr));
  let s2 = 0;
  for (let i = 0; i < m; i++) s2 += out[i] * out[i];
  const rms = Math.sqrt(s2 / Math.max(1, m));
  const reg = (1 + 0.3 * clamp((57 - midi) / 24, 0, 1)) * (1 - 0.22 * clamp((midi - 76) / 20, 0, 1));
  const g = rms > 1e-9 ? (0.25 * reg) / rms : 0;
  for (let i = 0; i < n; i++) out[i] *= g;
  // hammer knock + soundboard thud
  const kb = new SVF(clamp(f0 * 4, 700, 3200), 0.8, sr);
  const kn = Math.min(n, Math.round(0.04 * sr));
  const kk = Math.exp(-1 / (0.005 * sr));
  let e = 0.09 * reg;
  for (let i = 0; i < kn; i++) {
    out[i] += kb.band(rng.bi()) * e;
    e *= kk;
  }
  const th = Math.min(n, Math.round(0.12 * sr));
  const kt = Math.exp(-1 / (0.025 * sr));
  let et = 0.06 * reg;
  for (let i = 0; i < th; i++) {
    out[i] += et * sinCyc((75 * i) / sr);
    et *= kt;
  }
  // gentle 4 ms fade at the very end in case the tail is truncated
  const fl = Math.min(n >> 1, Math.round(0.004 * sr));
  for (let i = 0; i < fl; i++) out[n - 1 - i] *= i / fl;
  return out;
}

/** -60 dB decay time of a piano note's fundamental (used to cap cached note lengths). */
export function pianoDecay(midi: number): number {
  return clamp(30 * Math.pow(2, -(midi - 36) / 16), 2.5, 20);
}

// ------------------------------------------------------------------ pads

const PAD_N = 2048;
let padTab: Float32Array | null = null;

/** Band-limited soft "string" wave: harmonics 1..10 with a gentle roll-off. */
function padTable(): Float32Array {
  if (padTab) return padTab;
  const t = new Float32Array(PAD_N + 1);
  let peak = 0;
  for (let i = 0; i < PAD_N; i++) {
    let v = 0;
    for (let h = 1; h <= 10; h++) v += Math.sin((TAU * h * i) / PAD_N + h * 0.7) / Math.pow(h, 1.35);
    t[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < PAD_N; i++) t[i] /= peak;
  t[PAD_N] = t[0];
  padTab = t;
  return t;
}

export interface PadNote {
  t: number;
  dur: number;
  midi: number;
  vel: number;
}

export interface PadOpts {
  attack: number;
  release: number;
  voices: number;
  detune: number; // cents between voices
  cutoff: number;
  /** slow filter movement depth (0..1) */
  move?: number;
}

/** Warm, slowly breathing pad chords (detuned wavetable voices through a low-pass). */
export function renderPads(out: Float32Array, sr: number, rng: Rng, notes: PadNote[], o: PadOpts): void {
  const tab = padTable();
  const bus = new Float32Array(out.length);
  const na = Math.max(1, Math.round(o.attack * sr));
  const kr = Math.exp(-1 / ((o.release / 3) * sr));
  for (const nt of notes) {
    const s = Math.max(0, Math.round(nt.t * sr));
    const hold = Math.round(nt.dur * sr);
    const len = Math.min(out.length - s, hold + Math.round(o.release * 1.6 * sr));
    if (len <= 0) continue;
    for (let v = 0; v < o.voices; v++) {
      const cents = (v - (o.voices - 1) / 2) * o.detune + rng.range(-1.5, 1.5);
      const inc = ((mtof(nt.midi) * Math.pow(2, cents / 1200)) / sr) * PAD_N;
      let ph = rng.next() * PAD_N;
      const g = nt.vel / o.voices;
      let rel = 1;
      for (let i = 0; i < len; i++) {
        let env: number;
        if (i < na) {
          const x = i / na;
          env = x * x * (3 - 2 * x);
        } else env = 1;
        if (i >= hold) {
          rel *= kr;
          env *= rel;
        }
        ph += inc;
        if (ph >= PAD_N) ph -= PAD_N;
        const k = ph | 0;
        bus[s + i] += g * env * (tab[k] + (tab[k + 1] - tab[k]) * (ph - k));
      }
    }
  }
  // gently moving low-pass
  const f = new SVF(o.cutoff, 0.6, sr);
  const mv = o.move ?? 0.25;
  const lfo = rng.range(0.05, 0.09);
  const ph0 = rng.next();
  for (let i = 0; i < bus.length; i++) {
    if ((i & 63) === 0) f.set(o.cutoff * (1 + mv * sinCyc((lfo * i) / sr + ph0)), 0.6, sr);
    out[i] += f.low(bus[i]);
  }
}

// ------------------------------------------------------------------ bells

/** Celesta / music-box like bell: a few inharmonic partials with long soft decay. */
export function addBell(out: Float32Array, sr: number, t: number, midi: number, vel: number): void {
  const f = mtof(midi);
  const s = Math.max(0, Math.round(t * sr));
  const T = clamp(2.6 * Math.pow(880 / f, 0.35), 0.9, 3.5);
  addMode(out, s, sr, f, vel, T);
  addMode(out, s, sr, f * 2.0, vel * 0.18, T * 0.55);
  addMode(out, s, sr, f * 3.99, vel * 0.28, T * 0.35);
  addMode(out, s, sr, f * 5.93, vel * 0.05, T * 0.2);
  addMode(out, s, sr, f * 8.12, vel * 0.025, T * 0.12);
}

// ------------------------------------------------------------------ pluck (menu arpeggios)

/** Soft square-ish pluck (odd harmonics, higher ones fading first) with a slightly detuned twin. */
export function pluckNote(midi: number, n: number, sr: number): Float32Array {
  const out = new Float32Array(n);
  const f = mtof(midi);
  for (let h = 1; h <= 9; h += 2) {
    const fh = f * h;
    if (fh > sr * 0.42) break;
    const T = 0.9 / Math.pow(h, 0.7);
    addMode(out, 0, sr, fh, 1 / h, T, n);
    addMode(out, 0, sr, fh * 1.0023, 0.5 / h, T * 0.9, n);
  }
  // soften the attack slightly (3 ms)
  const na = Math.min(n, Math.round(0.003 * sr));
  for (let i = 0; i < na; i++) out[i] *= i / na;
  return out;
}

// ------------------------------------------------------------------ sub bass

export function renderBass(out: Float32Array, sr: number, notes: PadNote[]): void {
  const na = Math.round(0.06 * sr);
  const kr = Math.exp(-1 / (0.18 * sr));
  for (const nt of notes) {
    const s = Math.max(0, Math.round(nt.t * sr));
    const hold = Math.round(nt.dur * sr);
    const len = Math.min(out.length - s, hold + Math.round(1.2 * sr));
    const f = mtof(nt.midi) / sr;
    let ph = 0;
    let rel = 1;
    for (let i = 0; i < len; i++) {
      let env = i < na ? i / na : 1;
      if (i >= hold) {
        rel *= kr;
        env *= rel;
      }
      ph += f;
      out[s + i] += nt.vel * env * (sinCyc(ph) + 0.22 * sinCyc(2 * ph));
    }
  }
}
