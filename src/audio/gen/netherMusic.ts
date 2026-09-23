// Procedural Nether soundtrack. Vanilla's Nether biomes each play their own music pool
// (music.nether.<biome>): the same dark, droning ambient pieces everywhere, plus one piece per
// group of biomes. The pieces here are original compositions in that spirit — drones, low
// piano, metallic resonances and choirs for the shared ones; a pulsing, rhythmic piece for the
// wastes; a glassy, crystalline one for the forests; a deep choral one for the soul sand valley
// and the basalt deltas. Everything lives below ~9 kHz, so tracks render at half the sample rate
// and are upsampled at the end (about a second or two of work each, in the audio worker).

import {
  Rng,
  SVF,
  TAU,
  addMode,
  addOsc,
  brown,
  clamp,
  echo,
  fadeIn,
  lowpass,
  mixInto,
  mtof,
  reverb,
  sinCyc,
  smooth,
  softClip,
  upsample2,
} from './dsp';
import { addBell, pianoDecay, pianoNote } from './instruments';
import { MUSIC_PEAK } from './music';
import { phisem, sweep, thump } from './texture';
import { VOWELS } from './voice';

type Fn = (t: number) => number;

interface Note {
  t: number;
  dur: number;
  midi: number;
  vel: number;
}

// ------------------------------------------------------------------ notes & timing

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#3" -> MIDI note number */
function nm(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`netherMusic: bad note "${s}"`);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const chordOf = (s: string): number[] => s.trim().split(/\s+/).map(nm);

/**
 * Melody in steps: "B4:3 C5:1 B4:4 | G#4:6 A4:2 | r:8" — note:steps (r = rest), "|" checks
 * the bar is full. Returns notes timed from `t0` with `step` seconds per step.
 */
function melody(spec: string, t0: number, step: number, stepsPerBar: number, vel = 1): Note[] {
  const out: Note[] = [];
  let pos = 0;
  for (const tok of spec.trim().split(/\s+/)) {
    if (tok === '|') {
      if (pos % stepsPerBar !== 0) throw new Error(`netherMusic: bar not full at step ${pos} in "${spec}"`);
      continue;
    }
    const [n, s] = tok.split(':');
    const k = +s;
    if (n !== 'r') out.push({ t: t0 + pos * step, dur: k * step, midi: nm(n), vel });
    pos += k;
  }
  return out;
}

// ------------------------------------------------------------------ oscillators

const TAB_N = 2048;
const TABS = new Map<string, Float32Array>();

/** band-limited wavetable with H harmonics: saw (1/h), square (odd 1/h) or soft (1/h^1.7) */
function waveTable(kind: 'saw' | 'square' | 'soft', H: number): Float32Array {
  const key = kind + H;
  let t = TABS.get(key);
  if (t) return t;
  t = new Float32Array(TAB_N + 1);
  let pk = 0;
  for (let i = 0; i < TAB_N; i++) {
    let v = 0;
    for (let h = 1; h <= H; h++) {
      if (kind === 'square' && !(h & 1)) continue;
      const a = kind === 'soft' ? 1 / Math.pow(h, 1.7) : 1 / h;
      v += a * Math.sin((TAU * h * i) / TAB_N + (kind === 'soft' ? h * 0.7 : 0));
    }
    t[i] = v;
    pk = Math.max(pk, Math.abs(v));
  }
  for (let i = 0; i < TAB_N; i++) t[i] /= pk;
  t[TAB_N] = t[0];
  TABS.set(key, t);
  return t;
}

const H_STEPS = [3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];
/** the largest harmonic count keeping the top partial below maxF */
function harmonics(f: number, maxF: number): number {
  let h = H_STEPS[0];
  for (const s of H_STEPS) if (s * f <= maxF) h = s;
  return h;
}

interface SynthOpts {
  wave: 'saw' | 'square' | 'soft';
  /** unison voices and their spread in cents */
  voices: number;
  detune: number;
  attack: number;
  /** release time-constant (s) after the note's hold */
  release: number;
  /** [rate Hz, depth fraction] vibrato */
  vib?: [number, number];
  /** highest partial (Hz) */
  maxF?: number;
}

/** Merge notes of the same pitch that touch or overlap into one held note (pads keep common tones). */
function legato(notes: Note[]): Note[] {
  const by = new Map<number, Note[]>();
  for (const n of notes) {
    const l = by.get(n.midi);
    if (l) l.push({ ...n });
    else by.set(n.midi, [{ ...n }]);
  }
  const out: Note[] = [];
  for (const l of by.values()) {
    l.sort((a, b) => a.t - b.t);
    let cur = l[0];
    for (let i = 1; i < l.length; i++) {
      const n = l[i];
      if (n.t <= cur.t + cur.dur + 0.05) {
        cur.dur = Math.max(cur.dur, n.t + n.dur - cur.t);
        cur.vel = Math.max(cur.vel, n.vel);
      } else {
        out.push(cur);
        cur = n;
      }
    }
    out.push(cur);
  }
  return out;
}

/** Wavetable notes (drones, pads, choirs, leads) added into out; vibrato is applied at control rate. */
function synth(out: Float32Array, sr: number, rng: Rng, notes: Note[], o: SynthOpts): void {
  const BLK = 16;
  for (const nt of notes) {
    const f = mtof(nt.midi);
    const tab = waveTable(o.wave, harmonics(f, o.maxF ?? 5000));
    const s = Math.max(0, Math.round(nt.t * sr));
    const hold = Math.round(nt.dur * sr);
    const len = Math.min(out.length - s, hold + Math.round(o.release * 4 * sr));
    if (len <= 0) continue;
    const na = Math.max(1, Math.round(o.attack * sr));
    const kr = Math.exp(-1 / (o.release * sr));
    const vr = o.vib ? (o.vib[0] * BLK) / sr : 0;
    const vd = o.vib ? o.vib[1] : 0;
    for (let v = 0; v < o.voices; v++) {
      const cents = (o.voices > 1 ? (v / (o.voices - 1) - 0.5) * o.detune : 0) + rng.range(-1.5, 1.5);
      const inc = ((f * Math.pow(2, cents / 1200)) / sr) * TAB_N;
      let ph = rng.next() * TAB_N;
      let vph = rng.next();
      const g = nt.vel / o.voices;
      let rel = 1;
      for (let i0 = 0; i0 < len; i0 += BLK) {
        const i1 = Math.min(len, i0 + BLK);
        let d = inc;
        if (vd) {
          vph += vr;
          d *= 1 + vd * sinCyc(vph);
        }
        // envelope: linear across the block from its value at i0 to its value at i1
        const e0 = (i0 < na ? smooth(i0 / na) : 1) * rel;
        let r1 = rel;
        for (let i = Math.max(i0, hold); i < i1; i++) r1 *= kr;
        const e1 = (i1 < na ? smooth(i1 / na) : 1) * r1;
        rel = r1;
        const de = (e1 - e0) / (i1 - i0);
        let env = e0 * g;
        const dg = de * g;
        for (let i = i0; i < i1; i++) {
          ph += d;
          if (ph >= TAB_N) ph -= TAB_N;
          const k = ph | 0;
          out[s + i] += env * (tab[k] + (tab[k + 1] - tab[k]) * (ph - k));
          env += dg;
        }
      }
    }
  }
}

/** time-varying resonant low-pass over a whole bus, in place */
function lowpassSweep(buf: Float32Array, sr: number, fc: Fn, q = 0.8): Float32Array {
  const f = new SVF(fc(0), q, sr);
  for (let i = 0; i < buf.length; i++) {
    if ((i & 31) === 0) f.set(fc(i / sr), q, sr);
    buf[i] = f.low(buf[i]);
  }
  return buf;
}

/** vowel formant bank over a bus (choirs): formant frequencies morph along `vowel(t)` = [from, to, x] */
function formantBank(buf: Float32Array, sr: number, vowel: (t: number) => [string, string, number], scale = 1): Float32Array {
  const fs = [new SVF(), new SVF(), new SVF()];
  const bw = [90, 110, 170];
  const gains = [1, 0.55, 0.18];
  for (let i = 0; i < buf.length; i++) {
    if ((i & 63) === 0) {
      const [a, b, x] = vowel(i / sr);
      const A = VOWELS[a];
      const B = VOWELS[b];
      for (let k = 0; k < 3; k++) {
        const f = (A[k] + (B[k] - A[k]) * smooth(x)) * scale;
        fs[k].set(f, f / bw[k], sr);
      }
    }
    const x = buf[i];
    let y = 0;
    for (let k = 0; k < 3; k++) y += gains[k] * fs[k].band(x);
    buf[i] = y;
  }
  return buf;
}

/** Give `x` the loudness contour of `ref` (0.5 s blocks, smoothly interpolated) — e.g. a choir after its vowel filter. */
function matchLevel(ref: Float32Array, x: Float32Array, sr: number, win = 0.5): void {
  const W = Math.max(1, Math.round(win * sr));
  const nb = Math.ceil(x.length / W);
  const g = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    let er = 0;
    let ex = 0;
    for (let i = b * W, e = Math.min(x.length, (b + 1) * W); i < e; i++) {
      er += ref[i] * ref[i];
      ex += x[i] * x[i];
    }
    g[b] = ex > 1e-14 ? Math.min(8, Math.sqrt(er / ex)) : 0;
  }
  const sm = g.map((v, b) => (g[Math.max(0, b - 1)] + 2 * v + g[Math.min(nb - 1, b + 1)]) / 4);
  for (let i = 0; i < x.length; i++) {
    const p = clamp(i / W - 0.5, 0, nb - 1);
    const b = Math.min(nb - 2, Math.floor(p));
    const f = p - b;
    x[i] *= nb > 1 ? sm[b] + (sm[b + 1] - sm[b]) * f : sm[0];
  }
}

/** Piano part: one cached take per pitch, velocity sets level and brightness, damper after the hold. */
function piano(out: Float32Array, sr: number, rng: Rng, notes: Note[], seed: number, tone = 0.35): void {
  const relTau = (m: number) => 0.12 + 0.35 * clamp((60 - m) / 36, 0, 1);
  // each pitch's take only needs to be as long as its longest hold plus the damper tail
  const need = new Map<number, number>();
  for (const nt of notes) need.set(nt.midi, Math.max(need.get(nt.midi) ?? 0, nt.dur + relTau(nt.midi) * 7));
  const cache = new Map<number, Float32Array>();
  for (const nt of notes) {
    let src = cache.get(nt.midi);
    if (!src) {
      const len = Math.round(Math.min(pianoDecay(nt.midi) * 1.1, need.get(nt.midi)!, 12) * sr);
      src = pianoNote(nt.midi, len, sr, seed ^ Math.imul(nt.midi, 0x9e3779b1), tone);
      cache.set(nt.midi, src);
    }
    const s = Math.max(0, Math.round((nt.t + rng.gauss() * 0.006) * sr));
    const hold = Math.round(nt.dur * sr);
    const rt = relTau(nt.midi);
    const kr = Math.exp(-1 / (rt * sr));
    const end = Math.min(src.length, hold + Math.round(rt * 7 * sr), out.length - s);
    const vel = clamp(nt.vel * (1 + rng.gauss() * 0.04), 0.05, 1);
    const fc = clamp(mtof(nt.midi) * (2.5 + 14 * vel * vel), 400, 8000);
    const a = 1 - Math.exp((-TAU * fc) / sr);
    let lp = 0;
    let env = Math.pow(vel, 1.6);
    for (let k = 0; k < end; k++) {
      lp += a * (src[k] - lp);
      if (k >= hold) env *= kr;
      out[s + k] += lp * env;
    }
  }
}

/** A struck metal plate / gong: inharmonic partials with a long, darkening decay. */
function gong(out: Float32Array, sr: number, t: number, f: number, vel: number, t60: number): void {
  const s = Math.max(0, Math.round(t * sr));
  const R = [1, 1.47, 2.09, 2.56, 3.14, 3.92, 4.73];
  const A = [1, 0.62, 0.45, 0.33, 0.24, 0.14, 0.08];
  for (let k = 0; k < R.length; k++) addMode(out, s, sr, f * R[k], vel * A[k], t60 / (1 + 0.4 * k));
}

/** Filtered-noise swells (wind, breath, roars): a resonant band following fc(t), shaped by amp(t). */
function noise(out: Float32Array, sr: number, rng: Rng, t: number, dur: number, fc: Fn, q: number, amp: Fn): void {
  sweep(out, sr, rng, { t, dur, f: fc, q, amp, color: 'pink' });
}

/** Grinding metal / stone texture. */
function grind(out: Float32Array, sr: number, rng: Rng, t: number, dur: number, amp: Fn, f = 1): void {
  phisem(out, sr, rng, {
    t,
    dur,
    rate: 2600,
    energy: amp,
    grain: 0.004,
    heavy: 2.2,
    bands: [
      { f: 330 * f, q: 4, g: 1, spread: 0.2 },
      { f: 720 * f, q: 4, g: 0.7, spread: 0.2 },
      { f: 1500 * f, q: 3, g: 0.3, spread: 0.25 },
    ],
  });
}

/** envelope: rises over a, holds, falls over r, all smooth; zero outside [t0, t0 + len] */
const swell = (t0: number, len: number, a: number, r: number): Fn => (t) => {
  const u = t - t0;
  if (u <= 0 || u >= len) return 0;
  if (u < a) return smooth(u / a);
  if (u > len - r) return smooth((len - u) / r);
  return 1;
};

// ------------------------------------------------------------------ mixing

/** RMS over the active (non-silent) part of a buffer */
function activeRms(b: Float32Array): number {
  let pk = 0;
  for (let i = 0; i < b.length; i += 5) pk = Math.max(pk, Math.abs(b[i]));
  const blk = 1024;
  let s = 0;
  let c = 0;
  for (let i = 0; i + blk <= b.length; i += blk) {
    let e = 0;
    for (let j = i; j < i + blk; j += 2) e += b[j] * b[j];
    if (Math.sqrt(e / (blk / 2)) > pk * 0.03) {
      s += e;
      c += blk / 2;
    }
  }
  return Math.sqrt(s / Math.max(1, c));
}

/** A track being assembled at half rate: parts are rendered one at a time and mixed at a level in dB. */
class Mix {
  readonly buf: Float32Array;
  constructor(readonly hs: number, readonly len: number) {
    this.buf = new Float32Array(Math.round(len * hs));
  }
  part(db: number, fill: (b: Float32Array, hs: number) => void): void {
    const b = new Float32Array(this.buf.length);
    fill(b, this.hs);
    const r = activeRms(b);
    if (r > 1e-9) mixInto(this.buf, b, 0, (0.1 * Math.pow(10, db / 20)) / r);
  }
}

/** Nether tracks sit a little louder than the calm overworld piano, as vanilla's do (RMS target, peak capped). */
const TARGET_RMS = 0.105;

function master(m: Mix, sr: number, verb: { t60: number; wet: number; size?: number }, fadeSec: number): Float32Array {
  const hs = m.hs;
  const wet = reverb(m.buf, hs, { t60: verb.t60, hf: 0.3, size: verb.size ?? 1.8, pre: 0.03, wet: verb.wet, dry: 1, tail: Math.min(6, verb.t60), lowcut: 90, highcut: 6000 });
  let out = upsample2(wet);
  lowpass(out, 9500, sr);
  lowpass(out, 9500, sr);
  // tame peaks before levelling so every track behaves the same
  let pk = 0;
  for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < out.length; i++) out[i] /= pk;
  softClip(out, 1.4);
  // trim trailing near-silence, fade the ending
  let e = out.length - 1;
  while (e > 0 && Math.abs(out[e]) < 0.0015) e--;
  out = out.slice(0, Math.min(out.length, e + Math.round(0.2 * sr)));
  const fl = Math.min(out.length >> 2, Math.round(fadeSec * sr));
  for (let i = 0; i < fl; i++) {
    const x = i / fl;
    out[out.length - 1 - i] *= x * x;
  }
  fadeIn(out, Math.round(0.05 * sr));
  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i];
  mean /= out.length;
  pk = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] -= mean;
    pk = Math.max(pk, Math.abs(out[i]));
  }
  const g = Math.min(MUSIC_PEAK / pk, TARGET_RMS / Math.max(1e-9, activeRms(out)));
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

// ------------------------------------------------------------------ the pieces

/**
 * "Cinder Halls" (shared): a grinding drone on D under a Phrygian pad (the flat second leaning on
 * the pedal), metal plates ringing at each change, low piano fragments, a hot wind.
 */
function cinderHalls(sr: number): Float32Array {
  const rng = new Rng(0xc1d3a1);
  const seg = 17;
  const chords = ['D3 F3 A3 E4', 'D3 Eb3 G3 Bb3', 'D3 F3 A3 C4', 'D3 F3 Bb3 A3', 'D3 G3 Bb3 A3', 'D3 Eb3 G3 Bb3', 'D3 F3 A3 E4', 'D3 F3 A3'];
  const L = chords.length * seg + 12;
  const m = new Mix(sr / 2, L);
  const open: Fn = (t) => 140 + 560 * Math.pow(Math.sin(Math.PI * clamp(t / (L - 10), 0, 1)), 1.5);
  // the drone: D1 and A1 on a detuned saw, the filter slowly opening and closing again
  m.part(0, (b, hs) => {
    synth(b, hs, rng, [
      { t: 0, dur: L - 9, midi: nm('D1'), vel: 0.7 },
      { t: 0, dur: L - 9, midi: nm('A1'), vel: 0.5 },
      { t: 0, dur: L - 9, midi: nm('D2'), vel: 0.5 },
    ], { wave: 'saw', voices: 3, detune: 14, attack: 6, release: 3, maxF: 2500 });
    lowpassSweep(b, hs, (t) => open(t) * (1 + 0.15 * Math.sin(TAU * 0.07 * t)), 1.1);
  });
  // the pad
  m.part(-2, (b, hs) => {
    const notes: Note[] = [];
    chords.forEach((c, k) => chordOf(c).forEach((n) => notes.push({ t: k * seg, dur: seg + 1.5, midi: n, vel: 1 })));
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 3, detune: 12, attack: 4, release: 2.2, vib: [0.2, 0.002], maxF: 3000 });
    lowpassSweep(b, hs, (t) => 500 + 700 * smooth(clamp(t / 60, 0, 1)) * (0.8 + 0.2 * Math.sin(TAU * 0.05 * t)), 0.7);
  });
  // metal plates at each change
  m.part(-9, (b, hs) => {
    for (let k = 0; k < chords.length; k++) gong(b, hs, k * seg + 0.3, k % 2 ? 77.8 : 73.4, k % 3 === 0 ? 1 : 0.7, 7);
    lowpass(b, 2200, hs);
  });
  // low piano fragments
  m.part(-3, (b, hs) => {
    const frag = (t: number, spec: string) => spec.split(' ').forEach((n, i) => piano1(i, n, t));
    const notes: Note[] = [];
    const piano1 = (i: number, n: string, t: number) => notes.push({ t: t + i * 1.6, dur: 2.5, midi: nm(n), vel: 0.42 - 0.05 * i });
    frag(20, 'D3 F3');
    frag(38, 'E3 D3 A2');
    frag(55, 'A2');
    frag(72, 'D3 F3 E3');
    frag(90, 'Bb2 A2');
    frag(107, 'G2 A2 D3');
    frag(124, 'Eb3 D3');
    frag(138, 'D2');
    piano(b, hs, rng, notes, 0xc1d3a1, 0.3);
  });
  // grinding and hot wind
  m.part(-13, (b, hs) => {
    grind(b, hs, rng, 28, 22, swell(0, 22, 8, 10));
    grind(b, hs, rng, 94, 24, swell(0, 24, 9, 12), 0.8);
    lowpass(b, 1800, hs);
  });
  const windEnv = swell(0, L - 6, 10, 12);
  m.part(-12, (b, hs) => noise(b, hs, rng, 0, L - 6, (t) => 260 + 180 * Math.sin(TAU * 0.031 * t), 1.3, (t) => (0.5 + 0.5 * Math.sin(TAU * 0.045 * t + 1)) * windEnv(t)));
  // two falling whistles high up
  m.part(-17, (b, hs) => {
    for (const t0 of [50, 101]) addOsc(b, hs, t0, 7, (t) => 1180 * Math.pow(0.76, t / 7) * (1 + 0.004 * Math.sin(TAU * 5 * t)), (t) => Math.sin((Math.PI * t) / 7));
  });
  return master(m, sr, { t60: 5, wet: 1.1 }, 9);
}

/**
 * "Dead Embers" (shared): a throbbing low C# drone, a minor-second cluster hanging high above
 * it, a sparse low piano motif, embers falling (high sine glides) and distant pulses.
 */
function deadEmbers(sr: number): Float32Array {
  const rng = new Rng(0xdead3b);
  const L = 142;
  const m = new Mix(sr / 2, L);
  const throb = 0.72;
  const pulse: Fn = (t) => Math.pow(0.5 + 0.5 * Math.sin(TAU * throb * t), 3);
  const arc: Fn = swell(0, L - 4, 12, 16);
  m.part(-1, (b, hs) => {
    synth(b, hs, rng, [
      { t: 0, dur: L - 12, midi: nm('C#1'), vel: 0.75 },
      { t: 0, dur: L - 12, midi: nm('C#2'), vel: 0.55 },
      { t: 30, dur: L - 45, midi: nm('G#1'), vel: 0.35 },
    ], { wave: 'saw', voices: 3, detune: 10, attack: 8, release: 3, maxF: 2200 });
    lowpassSweep(b, hs, (t) => (120 + 380 * arc(t)) * (1 + 0.9 * pulse(t)), 1.4);
    for (let i = 0; i < b.length; i++) b[i] *= 0.7 + 0.3 * pulse(i / hs);
  });
  // the cluster above: C#5 + D5 (+ a tritone G4 in the middle section)
  m.part(-7, (b, hs) => {
    synth(b, hs, rng, [
      { t: 26, dur: 30, midi: nm('C#5'), vel: 0.8 },
      { t: 29, dur: 27, midi: nm('D5'), vel: 0.6 },
      { t: 84, dur: 30, midi: nm('C#5'), vel: 0.8 },
      { t: 86, dur: 28, midi: nm('D5'), vel: 0.55 },
      { t: 90, dur: 22, midi: nm('G4'), vel: 0.6 },
    ], { wave: 'soft', voices: 2, detune: 9, attack: 7, release: 3, vib: [4.8, 0.003], maxF: 3000 });
    lowpass(b, 2400, hs);
  });
  // the motif, low on the piano (C#3 E3 D3 ... G2), returning a little changed
  m.part(-2, (b, hs) => {
    const q = 1.4;
    const notes: Note[] = [
      ...melody('C#3:1 E3:1 D3:2 r:2 G2:2', 12, q, 8, 0.45),
      ...melody('C#3:1 E3:1 G3:1 F#3:1 D3:2 r:2', 40, q, 8, 0.42),
      ...melody('C#3:1 E3:1 D3:2 r:2 G2:2', 68, q, 8, 0.48),
      ...melody('A2:2 C#3:1 D3:1 C#3:2 r:2', 96, q, 8, 0.42),
      ...melody('C#3:1 E3:1 D3:2 r:1 C#2:3', 118, q, 8, 0.38),
    ];
    piano(b, hs, rng, notes, 0xdead3b, 0.28);
  });
  // falling embers
  m.part(-16, (b, hs) => {
    for (let t0 = 8; t0 < L - 20; t0 += rng.range(7, 12)) {
      const f0 = rng.range(1700, 2600);
      const d = rng.range(1.8, 2.8);
      addOsc(b, hs, t0, d, (t) => f0 * Math.pow(0.5, t / d), (t) => Math.sin((Math.PI * t) / d) * (0.8 + 0.2 * Math.sin(TAU * 7 * t)));
    }
  });
  // hot air swelling now and then
  m.part(-12, (b, hs) => {
    for (const t0 of [18, 52, 78, 110]) noise(b, hs, rng, t0, 14, (t) => 300 + 900 * Math.sin((Math.PI * t) / 14), 1.1, swell(0, 14, 6, 7));
  });
  // distant pulses (low thumps on the throb) through the middle
  m.part(-9, (b, hs) => {
    for (let t = 44; t < 92; t += 1 / throb) thump(b, hs, { t: t + 0.25 / throb, f0: 52, f1: 38, glide: 0.08, tau: 0.18, attack: 0.02, amp: 0.6 + 0.4 * Math.sin((Math.PI * (t - 44)) / 48) });
  });
  return master(m, sr, { t60: 5.5, wet: 1.15 }, 10);
}

/**
 * "Crucible" (nether wastes): 80 bpm in E Phrygian dominant — a pulsing filtered bass in eighths,
 * a dark synth lead with a dotted echo, metallic ticks, and a pad; builds, breaks down, returns.
 */
function crucible(sr: number): Float32Array {
  const rng = new Rng(0xc7c1b1);
  const beat = 60 / 80;
  const bar = 4 * beat;
  const e8 = beat / 2;
  const BARS = 38;
  const L = BARS * bar + 10;
  const m = new Mix(sr / 2, L);
  // chords per bar (roots for the bass, tones for the pad)
  const prog: string[] = [
    'E3 G#3 B3', 'E3 G#3 B3', 'E3 G#3 B3', 'F3 A3 C4', // 1-4 intro
    'E3 G#3 B3', 'F3 A3 C4', 'E3 G#3 B3', 'D3 F3 A3', 'E3 G#3 B3', 'F3 A3 C4', 'D3 F3 A3', 'E3 G#3 B3', // 5-12 A
    'A3 C4 E4', 'F3 A3 C4', 'D3 F3 A3', 'E3 G#3 B3', 'A3 C4 E4', 'C4 E4 G#4', 'D3 F3 A3', 'E3 G#3 B3', // 13-20 B
    'A3 C4 E4', 'F3 A3 C4', 'D3 F3 A3', 'E3 G#3 B3', // 21-24 break
    'E3 G#3 B3', 'F3 A3 C4', 'E3 G#3 B3', 'D3 F3 A3', 'E3 G#3 B3', 'F3 A3 C4', 'D3 F3 A3', 'E3 G#3 B3', // 25-32 A'
    'E3 G#3 B3', 'F3 A3 C4', 'E3 G#3 B3', 'E3 G#3 B3', 'E3 G#3 B3', 'E3 G#3 B3', // 33-38 outro
  ];
  const inBreak = (k: number) => k >= 20 && k < 24;
  // pad
  m.part(-6, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => chordOf(c).forEach((n) => notes.push({ t: k * bar, dur: bar + 0.4, midi: n, vel: k < 2 ? 0.6 : 1 })));
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 3, detune: 10, attack: 0.9, release: 0.9, maxF: 3500 });
    lowpassSweep(b, hs, (t) => 900 + 500 * Math.sin(TAU * 0.02 * t), 0.7);
  });
  // pulsing bass: eighths on the root, octave lift on the "and" of 2 and 4, filter plucked per note
  m.part(-1, (b, hs) => {
    const f = new SVF(400, 2.2, hs);
    for (let k = 2; k < BARS - 2; k++) {
      if (inBreak(k)) continue;
      const root = chordOf(prog[k])[0] - 24;
      const fade = k < 4 ? (k - 1) / 3 : k >= BARS - 5 ? (BARS - 2 - k) / 3 : 1;
      for (let j = 0; j < 8; j++) {
        const midi = root + (j === 3 || j === 7 ? 12 : 0);
        const t0 = k * bar + j * e8;
        const s = Math.round(t0 * hs);
        const n = Math.round(e8 * 0.9 * hs);
        const fq = mtof(midi);
        const tab = waveTable('saw', harmonics(fq, 3000));
        const inc = (fq / hs) * TAB_N;
        const fr = fq / hs;
        const acc = (j % 2 === 0 ? 1 : 0.75) * fade;
        let ph = 0;
        let tp = 0;
        for (let i = 0; i < n && s + i < b.length; i++) {
          const u = i / hs;
          if ((i & 15) === 0) f.set(160 + 900 * Math.exp(-u / 0.09) * acc, 2.2, hs);
          ph += fr;
          tp += inc;
          if (tp >= TAB_N) tp -= TAB_N;
          const k2 = tp | 0;
          const saw = tab[k2] + (tab[k2 + 1] - tab[k2]) * (tp - k2);
          const env = Math.min(1, u / 0.004) * Math.exp(-u / 0.35) * (i > n - 64 ? (n - i) / 64 : 1);
          b[s + i] += acc * env * (0.55 * f.low(saw) + 0.6 * sinCyc(ph));
        }
      }
    }
  });
  // lead melody (steps = eighths, 8 per bar)
  const A1 = 'B4:3 C5:1 B4:4 | A4:6 B4:2 | G#4:2 F4:2 E4:4 | F4:8';
  const A2 = 'E4:2 G#4:2 B4:2 C5:2 | D5:6 C5:2 | B4:2 A4:2 G#4:2 F4:2 | E4:8';
  const B1 = 'A4:3 B4:1 C5:4 | A4:4 F4:4 | D5:2 C5:2 B4:2 A4:2 | G#4:8';
  const B2 = 'A4:3 B4:1 C5:2 E5:2 | E5:4 D5:2 C5:2 | D5:2 F5:2 E5:2 D5:2 | B4:4 G#4:4';
  const BRK = 'E5:8 | F5:4 E5:4 | D5:8 | B4:8';
  const OUT = 'B4:4 C5:4 | A4:8 | G#4:4 F4:4 | E4:8';
  const lead: Note[] = [
    ...melody(`${A1} | ${A2}`, 4 * bar, e8, 8, 0.9),
    ...melody(`${B1} | ${B2}`, 12 * bar, e8, 8, 0.95),
    ...melody(BRK, 20 * bar, e8, 8, 0.7),
    ...melody(`${A1} | ${A2}`, 24 * bar, e8, 8, 1),
    ...melody(OUT, 32 * bar, e8, 8, 0.75),
  ];
  m.part(-3, (b, hs) => {
    synth(b, hs, rng, lead, { wave: 'square', voices: 2, detune: 8, attack: 0.025, release: 0.18, vib: [5.2, 0.004], maxF: 4000 });
    lowpass(b, 2200, hs);
    echo(b, hs, beat * 0.75, 0.38, 0.45, 1800);
  });
  // bells doubling the lead an octave up in A'
  m.part(-12, (b, hs) => {
    for (const n of lead) if (n.t >= 24 * bar && n.t < 32 * bar && n.dur >= beat) addBell(b, hs, n.t, n.midi + 12, 0.8);
  });
  // metallic ticks on the off-beats, a low boom on each downbeat, a clank every other bar
  m.part(-9, (b, hs) => {
    for (let k = 4; k < BARS - 3; k++) {
      if (inBreak(k)) continue;
      for (let j = 1; j < 8; j += 2) {
        const t0 = k * bar + j * e8;
        const f0 = rng.range(3200, 4200);
        addMode(b, Math.round(t0 * hs), hs, f0, 0.25, 0.05);
        addMode(b, Math.round(t0 * hs), hs, f0 * 1.51, 0.12, 0.035);
      }
      thump(b, hs, { t: k * bar, f0: 62, f1: 40, glide: 0.05, tau: 0.16, amp: 1 });
      if (k % 2 === 1) gong(b, hs, k * bar + 2 * beat, 185, 0.45, 0.9);
    }
    lowpass(b, 6000, hs);
  });
  // a hot drone under the break and the ends
  m.part(-8, (b, hs) => {
    synth(b, hs, rng, [
      { t: 0, dur: 4 * bar, midi: nm('E1'), vel: 1 },
      { t: 20 * bar, dur: 4 * bar, midi: nm('E1'), vel: 1 },
      { t: 33 * bar, dur: 5 * bar, midi: nm('E1'), vel: 1 },
    ], { wave: 'saw', voices: 3, detune: 12, attack: 2.5, release: 2, maxF: 1500 });
    lowpass(b, 400, hs);
  });
  return master(m, sr, { t60: 3.6, wet: 0.8, size: 1.5 }, 7);
}

/**
 * "Spore Alchemy" (crimson & warped forests): 70 bpm in B minor with Lydian-leaning chords — a
 * glassy bell arpeggio cascading through a dotted echo, a warm pad, low piano roots and a slow
 * glass-flute melody.
 */
function sporeAlchemy(sr: number): Float32Array {
  const rng = new Rng(0x5a0e2c);
  const beat = 60 / 70;
  const bar = 4 * beat;
  const e8 = beat / 2;
  const main = ['G3 B3 D4 F#4 C#5', 'E3 G3 B3 D4 F#4', 'B2 D3 F#3 A3 C#4', 'F#3 A3 C#4 E4'];
  const bridge = ['D3 F#3 A3 C#4 E4', 'A2 C#3 E3 B3', 'E3 G3 B3 D4 F#4', 'F#3 B3 C#4 E4'];
  const prog: string[] = [];
  for (let k = 0; k < 20; k++) prog.push(main[k % 4]);
  for (let k = 0; k < 8; k++) prog.push(bridge[k % 4]);
  for (let k = 0; k < 6; k++) prog.push(main[k % 4]);
  prog.push('B2 D3 F#3 C#4', 'B2 D3 F#3 C#4');
  const BARS = prog.length;
  const L = BARS * bar + 10;
  const m = new Mix(sr / 2, L);
  // glass arpeggio: chord tones up two octaves, eighths, through a dotted-eighth echo
  m.part(-2, (b, hs) => {
    for (let k = 0; k < BARS; k++) {
      const tones = chordOf(prog[k]).map((n) => n + 24);
      const seq = [0, 2, 1, 3, 2, 4, 3, 1].map((i) => tones[i % tones.length]);
      const thin = k >= 20 && k < 28 ? 0.7 : k >= BARS - 2 ? 0.55 : 1;
      const intro = k < 2 ? 0.6 + 0.2 * k : 1;
      for (let j = 0; j < 8; j++) {
        if (k >= BARS - 2 && j > 4) continue;
        if (thin < 1 && j % 2 === 1 && k < BARS - 2) continue;
        addBell(b, hs, k * bar + j * e8 + rng.gauss() * 0.004, seq[j], (j === 0 ? 1 : 0.72) * thin * intro * rng.range(0.9, 1));
      }
    }
    lowpass(b, 5200, hs);
    echo(b, hs, beat * 0.75, 0.45, 0.55, 3000);
  });
  // pad (from bar 3)
  m.part(-6, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => {
      if (k < 2) return;
      chordOf(c).slice(0, 4).forEach((n) => notes.push({ t: k * bar, dur: bar + 0.5, midi: n, vel: 1 }));
    });
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 3, detune: 9, attack: 1.4, release: 1.2, vib: [0.25, 0.0015], maxF: 3200 });
    lowpassSweep(b, hs, (t) => 1100 + 500 * Math.sin(TAU * 0.025 * t), 0.7);
  });
  // low piano roots on the downbeats from bar 5
  m.part(-7, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => {
      if (k < 4 || k >= BARS - 1) return;
      const r = chordOf(c)[0];
      notes.push({ t: k * bar, dur: bar * 0.95, midi: r - 12, vel: 0.5 });
      if (k % 2 === 1) notes.push({ t: k * bar + 2 * beat, dur: 2 * beat, midi: r, vel: 0.36 });
    });
    piano(b, hs, rng, notes, 0x5a0e2c, 0.4);
  });
  // the glass flute (quarter-note steps, 4 per bar)
  const M1 = 'F#5:2 E5:1 D5:1 | E5:3 B4:1 | D5:1 C#5:1 B4:2 | C#5:4';
  const M2 = 'F#5:2 A5:1 G5:1 | F#5:2 E5:2 | D5:1 E5:1 F#5:1 D5:1 | C#5:3 r:1';
  const M3 = 'B5:2 A5:1 F#5:1 | G5:3 E5:1 | F#5:1 E5:1 D5:2 | C#5:4';
  const flute: Note[] = [...melody(`${M1} | ${M2}`, 12 * bar, beat, 4, 0.9), ...melody(`${M3} | ${M1}`, 28 * bar, beat, 4, 0.85)];
  m.part(-4, (b, hs) => {
    for (const n of flute) {
      const f = mtof(n.midi);
      const d = n.dur + 0.25;
      const env: Fn = (t) => n.vel * Math.min(1, t / 0.09) * (t > n.dur ? Math.exp(-(t - n.dur) / 0.12) : 1);
      const vib: Fn = (t) => 1 + 0.0055 * Math.sin(TAU * 5 * t) * Math.min(1, t / 0.4);
      addOsc(b, hs, n.t, d, (t) => f * vib(t), env);
      addOsc(b, hs, n.t, d, (t) => 2 * f * vib(t), (t) => 0.22 * env(t));
      addOsc(b, hs, n.t, d, (t) => 3 * f * vib(t), (t) => 0.07 * env(t));
      sweep(b, hs, rng, { t: n.t, dur: d, f: () => f * 2, q: 3, amp: (t) => 0.05 * env(t), color: 'pink' });
    }
    echo(b, hs, beat * 1.5, 0.3, 0.3, 2500);
  });
  // spores in the air: faint high glints
  m.part(-18, (b, hs) => {
    for (let t0 = 3; t0 < L - 12; t0 += rng.range(1.5, 4)) addMode(b, Math.round(t0 * hs), hs, rng.range(2500, 4200), rng.range(0.3, 1), rng.range(0.4, 0.9));
  });
  return master(m, sr, { t60: 4.2, wet: 1, size: 1.7 }, 8);
}

/**
 * "Below the Ash" (soul sand valley & basalt deltas): a slow choir of low "ooh"s opening to "aah"
 * and closing again over an F# pedal, deep piano octaves at the changes, metal plates, hollow wind.
 */
function belowTheAsh(sr: number): Float32Array {
  const rng = new Rng(0xb310a5);
  const seg = 13;
  const chords = ['F#3 A3 C#4 F#4', 'F#3 A3 D4 F#4', 'F#3 G3 B3 D4', 'F#3 A3 C#4 E4', 'F#3 B3 D4 F#4', 'G#3 B3 C#4 E#4', 'F#3 A3 D4 F#4', 'G3 B3 D4 F#4', 'F#3 A3 C#4 F#4', 'F#3 C#4 F#4'];
  const L = chords.length * seg + 12;
  const m = new Mix(sr / 2, L);
  const vowelAt = (t: number): [string, string, number] => {
    const u = t / (L - 12);
    if (u < 0.35) return ['u', 'o', u / 0.35];
    if (u < 0.6) return ['o', 'a', (u - 0.35) / 0.25];
    if (u < 0.8) return ['a', 'o', (u - 0.6) / 0.2];
    return ['o', 'u', Math.min(1, (u - 0.8) / 0.2)];
  };
  // the choir: detuned saw voices with vibrato, through a morphing vowel filter, and a breath
  m.part(0, (b, hs) => {
    const notes: Note[] = [];
    chords.forEach((c, k) => chordOf(c).forEach((n, i) => notes.push({ t: k * seg + i * 0.35, dur: seg + 1, midi: n - (i === 0 ? 12 : 0), vel: i === 0 ? 0.8 : 1 })));
    synth(b, hs, rng, legato(notes), { wave: 'saw', voices: 2, detune: 14, attack: 3, release: 1.6, vib: [4.6, 0.005], maxF: 4200 });
    const air = new Float32Array(b.length);
    const airEnv = swell(0, L - 8, 6, 8);
    noise(air, hs, rng, 0, L, () => 900, 0.5, (t) => 0.02 * airEnv(t));
    for (let i = 0; i < b.length; i++) b[i] += air[i];
    const dry = b.slice();
    formantBank(b, hs, vowelAt, 1.05);
    lowpass(b, 3200, hs);
    matchLevel(dry, b, hs);
  });
  // pedal: F#1 sub drone
  m.part(-4, (b, hs) => {
    synth(b, hs, rng, [{ t: 0, dur: L - 10, midi: nm('F#1'), vel: 1 }, { t: 0, dur: L - 10, midi: nm('F#2'), vel: 0.3 }], { wave: 'soft', voices: 2, detune: 6, attack: 7, release: 3, maxF: 900 });
    for (let i = 0; i < b.length; i++) b[i] *= 0.75 + 0.25 * Math.sin((TAU * 0.05 * i) / hs);
  });
  // deep piano octaves at each change, a falling three-note figure twice
  m.part(-5, (b, hs) => {
    const notes: Note[] = [];
    chords.forEach((c, k) => {
      if (k === chords.length - 1) return;
      const r = chordOf(c)[0] - 24;
      notes.push({ t: k * seg + 0.2, dur: seg * 0.8, midi: r, vel: 0.5 }, { t: k * seg + 0.24, dur: seg * 0.8, midi: r + 12, vel: 0.38 });
    });
    notes.push(...melody('C#4:1 A3:1 F#3:2', 3.5 * seg, 1.6, 4, 0.34), ...melody('D4:1 B3:1 F#3:2', 6.5 * seg, 1.6, 4, 0.32));
    piano(b, hs, rng, notes, 0xb310a5, 0.25);
  });
  // metal plates, low
  m.part(-11, (b, hs) => {
    for (const k of [0, 2, 5, 7, 9]) gong(b, hs, k * seg + 0.1, k === 5 ? 103.8 : 92.5, 0.8, 8);
    lowpass(b, 1800, hs);
  });
  // hollow wind through the valley
  m.part(-11, (b, hs) => {
    for (const t0 of [4, 34, 62, 92, 118]) {
      const f0 = rng.range(240, 320);
      noise(b, hs, rng, t0, 16, (t) => f0 * (0.85 + 0.3 * Math.sin((Math.PI * t) / 16)), 5, swell(0, 16, 7, 8));
    }
  });
  // far-off rumble under the middle
  m.part(-14, (b, hs) => {
    const r = brown(b.length, rng, 0.9995);
    lowpass(r, 90, hs);
    const env = swell(40, 60, 20, 25);
    for (let i = 0; i < b.length; i++) b[i] = r[i] * env(i / hs);
  });
  return master(m, sr, { t60: 6, wet: 1.25, size: 2 }, 10);
}

// ------------------------------------------------------------------ registry

const TRACKS: { name: string; render: (sr: number) => Float32Array }[] = [
  { name: 'Cinder Halls', render: cinderHalls },
  { name: 'Dead Embers', render: deadEmbers },
  { name: 'Crucible', render: crucible },
  { name: 'Spore Alchemy', render: sporeAlchemy },
  { name: 'Below the Ash', render: belowTheAsh },
];

/** vanilla music.nether.<biome> pools: the shared pieces plus each group's own (indices into TRACKS) */
export const NETHER_MUSIC_POOLS: Record<string, number[]> = {
  'music.nether.nether_wastes': [0, 1, 2],
  'music.nether.crimson_forest': [0, 1, 3],
  'music.nether.warped_forest': [0, 1, 3],
  'music.nether.soul_sand_valley': [0, 1, 4],
  'music.nether.basalt_deltas': [0, 1, 4],
};

export const NETHER_TRACK_NAMES = TRACKS.map((t) => t.name);

/** Render track `index` of the pool `pool` (vanilla picks uniformly from the event's sounds). */
export function renderNetherMusic(pool: string, index: number, sr: number): Float32Array {
  const p = NETHER_MUSIC_POOLS[pool] ?? NETHER_MUSIC_POOLS['music.nether.nether_wastes'];
  const i = ((Math.floor(index) % p.length) + p.length) % p.length;
  return TRACKS[p[i]].render(sr);
}

/** Dev helper: render a track by its index in the full list. */
export function renderNetherTrack(i: number, sr: number): Float32Array {
  return TRACKS[((i % TRACKS.length) + TRACKS.length) % TRACKS.length].render(sr);
}
