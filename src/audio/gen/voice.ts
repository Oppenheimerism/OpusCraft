// Source-filter (formant) voice synthesis for player grunts and mob vocalisations.
// Source: Rosenberg glottal pulse (with jitter, shimmer, period-doubling roughness,
// aspiration noise, vibrato, growl AM). Filter: parallel bank of time-varying resonant
// band-passes (TPT SVF) — one per formant — with individual gains.

import { Rng, SVF, TAU } from './dsp';

export type Param = number | ((t: number) => number);
const val = (v: Param, t: number): number => (typeof v === 'number' ? v : v(t));

export interface Formant {
  f: Param;
  bw: Param;
  g: Param;
}

export interface VoiceOpts {
  t?: number;
  dur: number;
  f0: Param;
  amp: (t: number) => number;
  formants: Formant[];
  /** open quotient 0.3..0.9 (lower = brighter, more pressed) */
  oq?: number;
  /** per-period random pitch deviation (fraction, e.g. 0.02) */
  jitter?: number;
  /** per-period random amplitude deviation (fraction) */
  shimmer?: number;
  /** aspiration noise level (relative to voiced source) */
  breath?: Param;
  /** alternate-period amplitude drop (sub-harmonic roughness) 0..1 */
  rough?: number;
  /** alternate-period length offset (period doubling) 0..0.4 */
  sub?: number;
  /** [rate Hz, depth fraction] pitch vibrato */
  vib?: [number, number];
  /** [rate Hz, depth 0..1] irregular amplitude modulation (growl / bleat) */
  growl?: [number, number];
  /** voiced-source gain over time (0 = only noise) */
  voiced?: Param;
  gain?: number;
}

/** Rosenberg glottal flow pulse at phase p (0..1). */
function glottal(p: number, tp: number, tn: number): number {
  if (p < tp) return 0.5 * (1 - Math.cos((Math.PI * p) / tp));
  if (p < tp + tn) return Math.cos((0.5 * Math.PI * (p - tp)) / tn);
  return 0;
}

export function voice(out: Float32Array, sr: number, rng: Rng, o: VoiceOpts): void {
  const start = Math.round((o.t ?? 0) * sr);
  const n = Math.min(out.length - start, Math.round(o.dur * sr));
  if (n <= 0) return;
  const nf = o.formants.length;
  const filt: SVF[] = [];
  for (let k = 0; k < nf; k++) filt.push(new SVF());
  const gains = new Float64Array(nf);
  const oq = o.oq ?? 0.6;
  const tp = oq * 0.68;
  const tn = oq * 0.32;
  const jitter = o.jitter ?? 0.01;
  const shimmer = o.shimmer ?? 0.04;
  const rough = o.rough ?? 0;
  const sub = o.sub ?? 0;
  const gain = o.gain ?? 1;
  const vibR = o.vib ? o.vib[0] : 0;
  const vibD = o.vib ? o.vib[1] : 0;
  const grR = o.growl ? o.growl[0] : 0;
  const grD = o.growl ? o.growl[1] : 0;
  const grPh = rng.next() * TAU;
  const vibPh = rng.next() * TAU;
  let phase = rng.next() * 0.2;
  let jit = 0;
  let shim = 1;
  let cyc = 0;
  let gPrev = 0;
  let f0 = 100;
  let br = 0;
  let vc = 1;
  let grNoise = 0;
  let grTarget = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 31) === 0) {
      for (let k = 0; k < nf; k++) {
        const F = o.formants[k];
        const f = val(F.f, t);
        const bw = Math.max(10, val(F.bw, t));
        filt[k].set(f, Math.max(0.3, f / bw), sr);
        gains[k] = val(F.g, t);
      }
      f0 = Math.max(20, val(o.f0, t));
      br = o.breath === undefined ? 0.05 : val(o.breath, t);
      vc = o.voiced === undefined ? 1 : val(o.voiced, t);
      if (grD > 0 && (i & 255) === 0) grTarget = rng.bi();
    }
    let f = f0;
    if (vibD) f *= 1 + vibD * Math.sin(TAU * vibR * t + vibPh);
    phase += (f * (1 + jit)) / sr;
    if (phase >= 1) {
      phase -= 1;
      cyc++;
      jit = jitter * rng.gauss() + (sub ? (cyc & 1 ? sub : -sub) : 0);
      shim = 1 + shimmer * rng.gauss();
      if (shim < 0) shim = 0;
      if (rough && cyc & 1) shim *= 1 - rough;
    }
    const g = glottal(phase, tp, tn) * shim;
    const src = ((g - gPrev) * sr) / (f * 10);
    gPrev = g;
    const asp = rng.bi() * br * (0.35 + g);
    const x = src * vc + asp;
    let y = 0;
    for (let k = 0; k < nf; k++) y += gains[k] * filt[k].band(x);
    let a = o.amp(t) * gain;
    if (grD > 0) {
      grNoise += (grTarget - grNoise) * 0.002;
      const m = 0.5 + 0.5 * Math.sin(TAU * grR * t + grPh + 2.5 * grNoise);
      a *= 1 - grD * m;
    }
    out[start + i] += y * a;
  }
}

/** Formant sets (Hz) for common vowels, adult-male reference. [F1, F2, F3, F4] */
export const VOWELS: Record<string, [number, number, number, number]> = {
  a: [730, 1090, 2440, 3400],
  uh: [640, 1190, 2390, 3300],
  aw: [570, 840, 2410, 3300],
  o: [450, 800, 2600, 3300],
  u: [300, 870, 2240, 3300],
  oo: [440, 1020, 2240, 3300],
  e: [530, 1840, 2480, 3500],
  ae: [660, 1720, 2410, 3500],
  i: [270, 2290, 3010, 3700],
  ih: [390, 1990, 2550, 3600],
  er: [490, 1350, 1690, 3300],
  m: [260, 1000, 2200, 3300],
};

/** Linear interpolation between two vowels over time; returns formant frequency functions. */
export function vowelGlide(
  from: string,
  to: string,
  t0: number,
  t1: number,
  scale = 1,
): [(t: number) => number, (t: number) => number, (t: number) => number, (t: number) => number] {
  const A = VOWELS[from];
  const B = VOWELS[to];
  const mk = (k: number) => (t: number) => {
    const x = t <= t0 ? 0 : t >= t1 ? 1 : (t - t0) / (t1 - t0);
    const s = x * x * (3 - 2 * x);
    return (A[k] + (B[k] - A[k]) * s) * scale;
  };
  return [mk(0), mk(1), mk(2), mk(3)];
}
