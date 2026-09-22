// Core DSP primitives shared by every procedural sound / music generator.
// Pure TypeScript: no Web Audio, no DOM, no Math.random. Everything is deterministic
// (seeded PRNG) and allocation-light so it runs in Node, the main thread or a Web Worker.

export const TAU = Math.PI * 2;
const LN_1000 = 6.907755278982137; // e^-LN_1000 = -60 dB

// ------------------------------------------------------------------ hashing / PRNG

/** 32-bit integer hash (lowbias32). */
export function mix32(x: number): number {
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** FNV-1a string hash, finalised with mix32. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/** mulberry32 PRNG. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = mix32(seed ^ 0x2545f491) | 0;
  }
  /** uniform [0, 1) */
  next(): number {
    const t0 = (this.s = (this.s + 0x6d2b79f5) | 0);
    let t = Math.imul(t0 ^ (t0 >>> 15), t0 | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** uniform [-1, 1) */
  bi(): number {
    return this.next() * 2 - 1;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** log-uniform in [a, b) */
  logRange(a: number, b: number): number {
    return a * Math.pow(b / a, this.next());
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** standard normal */
  gauss(): number {
    const u = Math.max(1e-12, this.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * this.next());
  }
  /** random sign */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
  fork(salt: number): Rng {
    return new Rng(mix32(this.s ^ Math.imul(salt | 0, 0x9e3779b1)));
  }
}

// ------------------------------------------------------------------ small helpers

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const db = (d: number): number => Math.pow(10, d / 20);
export const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function nsamp(sec: number, sr: number): number {
  return Math.max(1, Math.round(sec * sr));
}
export function alloc(sec: number, sr: number): Float32Array {
  return new Float32Array(nsamp(sec, sr));
}

// ------------------------------------------------------------------ envelopes

/** Half-sine attack of length a, then exponential decay with time-constant tau. */
export function envAD(t: number, a: number, tau: number): number {
  if (t < 0) return 0;
  if (t < a) return Math.sin((0.5 * Math.PI * t) / a);
  return Math.exp(-(t - a) / tau);
}

/** Attack a, hold h, exponential decay tau. */
export function envAHD(t: number, a: number, h: number, tau: number): number {
  if (t < 0) return 0;
  if (t < a) return Math.sin((0.5 * Math.PI * t) / a);
  if (t < a + h) return 1;
  return Math.exp(-(t - a - h) / tau);
}

/** Smooth bump that rises over `a` seconds and falls (raised-cosine) over `r` seconds. */
export function envBump(t: number, a: number, r: number): number {
  if (t <= 0) return 0;
  if (t < a) {
    const x = t / a;
    return x * x * (3 - 2 * x);
  }
  if (t < a + r) return 0.5 + 0.5 * Math.cos((Math.PI * (t - a)) / r);
  return 0;
}

/** Piecewise-linear envelope; p is flat [t0, v0, t1, v1, ...] with increasing t. */
export function envPts(t: number, p: readonly number[]): number {
  if (t <= p[0]) return p[1];
  for (let i = 2; i < p.length; i += 2) {
    if (t < p[i]) {
      const t0 = p[i - 2];
      const v0 = p[i - 1];
      return v0 + ((p[i + 1] - v0) * (t - t0)) / (p[i] - t0);
    }
  }
  return p[p.length - 1];
}

/** Piecewise exponential (geometric) interpolation — for frequency contours. Values must be > 0. */
export function envExpPts(t: number, p: readonly number[]): number {
  if (t <= p[0]) return p[1];
  for (let i = 2; i < p.length; i += 2) {
    if (t < p[i]) {
      const t0 = p[i - 2];
      const v0 = p[i - 1];
      return v0 * Math.pow(p[i + 1] / v0, (t - t0) / (p[i] - t0));
    }
  }
  return p[p.length - 1];
}

// ------------------------------------------------------------------ filters

/**
 * Topology-preserving-transform state-variable filter (A. Simper). Stable under fast
 * modulation, which makes it the workhorse for swept band-passes and formants.
 */
export class SVF {
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  k = 1;
  private ic1 = 0;
  private ic2 = 0;
  lp = 0;
  bp = 0;
  hp = 0;
  constructor(fc = 1000, q = 0.7071, sr = 44100) {
    this.set(fc, q, sr);
  }
  set(fc: number, q: number, sr: number): void {
    const f = fc < 1 ? 1 : fc > sr * 0.49 ? sr * 0.49 : fc;
    const g = Math.tan((Math.PI * f) / sr);
    const k = 1 / (q < 0.05 ? 0.05 : q);
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  tick(x: number): void {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
  }
  /** band-pass normalised to 0 dB at the centre frequency */
  band(x: number): number {
    this.tick(x);
    return this.bp * this.k;
  }
  low(x: number): number {
    this.tick(x);
    return this.lp;
  }
  high(x: number): number {
    this.tick(x);
    return this.hp;
  }
  reset(): void {
    this.ic1 = this.ic2 = 0;
  }
}

/** RBJ-cookbook biquad in transposed direct form II. */
export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  private z1 = 0;
  private z2 = 0;
  private setN(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): this {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }
  private static w(fc: number, sr: number): number {
    return (TAU * clamp(fc, 1, sr * 0.49)) / sr;
  }
  lowpass(fc: number, q: number, sr: number): this {
    const w = Biquad.w(fc, sr);
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.setN((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
  }
  highpass(fc: number, q: number, sr: number): this {
    const w = Biquad.w(fc, sr);
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.setN((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }
  /** constant 0 dB peak gain band-pass */
  bandpass(fc: number, q: number, sr: number): this {
    const w = Biquad.w(fc, sr);
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.setN(al, 0, -al, 1 + al, -2 * c, 1 - al);
  }
  peak(fc: number, q: number, gainDb: number, sr: number): this {
    const w = Biquad.w(fc, sr);
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    return this.setN(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
  }
  lowShelf(fc: number, gainDb: number, sr: number): this {
    const w = Biquad.w(fc, sr);
    const c = Math.cos(w);
    const A = Math.pow(10, gainDb / 40);
    const al = (Math.sin(w) / 2) * Math.SQRT2;
    const sa = 2 * Math.sqrt(A) * al;
    return this.setN(
      A * (A + 1 - (A - 1) * c + sa),
      2 * A * (A - 1 - (A + 1) * c),
      A * (A + 1 - (A - 1) * c - sa),
      A + 1 + (A - 1) * c + sa,
      -2 * (A - 1 + (A + 1) * c),
      A + 1 + (A - 1) * c - sa,
    );
  }
  highShelf(fc: number, gainDb: number, sr: number): this {
    const w = Biquad.w(fc, sr);
    const c = Math.cos(w);
    const A = Math.pow(10, gainDb / 40);
    const al = (Math.sin(w) / 2) * Math.SQRT2;
    const sa = 2 * Math.sqrt(A) * al;
    return this.setN(
      A * (A + 1 + (A - 1) * c + sa),
      -2 * A * (A - 1 + (A + 1) * c),
      A * (A + 1 + (A - 1) * c - sa),
      A + 1 - (A - 1) * c + sa,
      2 * (A - 1 - (A + 1) * c),
      A + 1 - (A - 1) * c - sa,
    );
  }
  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  run(buf: Float32Array, from = 0, to = buf.length): Float32Array {
    const { b0, b1, b2, a1, a2 } = this;
    let z1 = this.z1;
    let z2 = this.z2;
    for (let i = from; i < to; i++) {
      const x = buf[i];
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      buf[i] = y;
    }
    this.z1 = z1;
    this.z2 = z2;
    return buf;
  }
}

export const lowpass = (buf: Float32Array, fc: number, sr: number, q = 0.7071): Float32Array =>
  new Biquad().lowpass(fc, q, sr).run(buf);
export const highpass = (buf: Float32Array, fc: number, sr: number, q = 0.7071): Float32Array =>
  new Biquad().highpass(fc, q, sr).run(buf);
export const bandpass = (buf: Float32Array, fc: number, q: number, sr: number): Float32Array =>
  new Biquad().bandpass(fc, q, sr).run(buf);
export const peakEq = (buf: Float32Array, fc: number, q: number, gainDb: number, sr: number): Float32Array =>
  new Biquad().peak(fc, q, gainDb, sr).run(buf);
export const lowShelf = (buf: Float32Array, fc: number, gainDb: number, sr: number): Float32Array =>
  new Biquad().lowShelf(fc, gainDb, sr).run(buf);
export const highShelf = (buf: Float32Array, fc: number, gainDb: number, sr: number): Float32Array =>
  new Biquad().highShelf(fc, gainDb, sr).run(buf);

/** One-pole low-pass, in place. */
export function onePoleLP(buf: Float32Array, fc: number, sr: number): Float32Array {
  const a = 1 - Math.exp((-TAU * fc) / sr);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += a * (buf[i] - y);
    buf[i] = y;
  }
  return buf;
}

/** Schroeder all-pass diffuser, in place. */
export function allpass(buf: Float32Array, delay: number, g: number): Float32Array {
  const d = new Float32Array(Math.max(1, delay));
  const n = d.length;
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const wd = d[p];
    const w = buf[i] + g * wd;
    buf[i] = wd - g * w;
    d[p] = w;
    if (++p >= n) p = 0;
  }
  return buf;
}

// ------------------------------------------------------------------ noise

export function white(n: number, rng: Rng): Float32Array {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = rng.bi();
  return b;
}

/** Pink-ish noise (Paul Kellet's economy filter), roughly unit peak. */
export function pink(n: number, rng: Rng): Float32Array {
  const b = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.bi();
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    b[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return b;
}

/** Brown (red) noise via leaky integration, roughly unit peak. */
export function brown(n: number, rng: Rng, leak = 0.996): Float32Array {
  const b = new Float32Array(n);
  let y = 0;
  const g = Math.sqrt(1 - leak * leak) * 1.6;
  for (let i = 0; i < n; i++) {
    y = leak * y + g * rng.bi();
    b[i] = y;
  }
  return b;
}

// ------------------------------------------------------------------ oscillators / modal synthesis

/**
 * Add an exponentially decaying sinusoid (one resonant mode) starting at sample `start`
 * with sine phase (click-free). t60 is the -60 dB decay time in seconds.
 * Uses the 2-pole recurrence y[n] = 2r cos(w) y[n-1] - r^2 y[n-2]: 3 flops per sample.
 */
export function addMode(out: Float32Array, start: number, sr: number, f: number, amp: number, t60: number, maxLen = Infinity): void {
  if (!(f > 0) || f >= sr * 0.49 || amp === 0 || start >= out.length) return;
  const w = (TAU * f) / sr;
  const r = Math.exp(-LN_1000 / (Math.max(1e-4, t60) * sr));
  let n = Math.ceil(t60 * sr * 1.34); // to about -80 dB
  if (n > maxLen) n = maxLen;
  let s0 = start;
  if (s0 < 0) s0 = 0;
  const end = Math.min(out.length, start + n);
  const c = 2 * r * Math.cos(w);
  const r2 = r * r;
  // closed-form state at s0 (handles negative start)
  const k0 = s0 - start;
  let y1 = amp * Math.pow(r, k0) * Math.sin(w * k0); // y[k0]
  let y0 = amp * Math.pow(r, k0 - 1) * Math.sin(w * (k0 - 1)); // y[k0-1]
  for (let i = s0; i < end; i++) {
    out[i] += y1;
    const y2 = c * y1 - r2 * y0;
    y0 = y1;
    y1 = y2;
  }
}

/** Add several modes: flat list of [freq, amp, t60] triples. */
export function addModes(out: Float32Array, start: number, sr: number, modes: readonly number[], fscale = 1, ascale = 1, tscale = 1): void {
  for (let i = 0; i + 2 < modes.length; i += 3) addMode(out, start, sr, modes[i] * fscale, modes[i + 1] * ascale, modes[i + 2] * tscale);
}

const SIN_N = 4096;
const SIN_T = new Float32Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN_T[i] = Math.sin((TAU * i) / SIN_N);

/** sin(2*pi*p) for a phase p in cycles, p >= 0 (table lookup with linear interpolation). */
export function sinCyc(p: number): number {
  const x = (p - Math.floor(p)) * SIN_N;
  const k = x | 0;
  return SIN_T[k] + (SIN_T[k + 1] - SIN_T[k]) * (x - k);
}

/**
 * Sine oscillator with time-varying frequency and amplitude functions, added into out.
 * The functions are evaluated at control rate (every 32 samples) and linearly interpolated.
 */
export function addOsc(
  out: Float32Array,
  sr: number,
  t0: number,
  dur: number,
  freq: (t: number) => number,
  amp: (t: number) => number,
  phase = 0,
): void {
  const s = Math.round(t0 * sr);
  const n = Math.min(out.length - s, Math.round(dur * sr));
  const BLK = 32;
  let ph = phase / TAU;
  ph -= Math.floor(ph);
  const inv = 1 / sr;
  for (let i0 = Math.max(0, -s); i0 < n; i0 += BLK) {
    const i1 = Math.min(n, i0 + BLK);
    const len = i1 - i0;
    const fa = freq(i0 * inv) * inv;
    const fb = freq(i1 * inv) * inv;
    const aa = amp(i0 * inv);
    const ab = amp(i1 * inv);
    const df = (fb - fa) / len;
    const da = (ab - aa) / len;
    let f = fa;
    let a = aa;
    for (let i = i0; i < i1; i++) {
      ph += f;
      if (ph >= 1) ph -= Math.floor(ph);
      const x = ph * SIN_N;
      const k = x | 0;
      out[s + i] += a * (SIN_T[k] + (SIN_T[k + 1] - SIN_T[k]) * (x - k));
      f += df;
      a += da;
    }
  }
}

// ------------------------------------------------------------------ effects

export interface ReverbOpts {
  /** decay time (s) for low/mid frequencies */
  t60: number;
  /** HF decay time as a fraction of t60 (damping), default 0.5 */
  hf?: number;
  /** delay-length scale (room size), default 1 */
  size?: number;
  /** predelay in seconds */
  pre?: number;
  wet: number;
  dry?: number;
  /** seconds appended for the tail (default 0.8 * t60) */
  tail?: number;
  /** input diffusion all-pass gain, 0 = off (default 0.6) */
  diffuse?: number;
  /** high-pass the reverb input (Hz) */
  lowcut?: number;
  /** low-pass the reverb input (Hz) */
  highcut?: number;
}

const FDN_MS = [23.1, 29.7, 34.3, 39.7, 45.1, 51.7, 58.3, 66.1];

/**
 * 8-line feedback-delay-network reverb (Householder feedback, per-line HF damping).
 * `wet` is energy-normalised: wet = 1 gives a tail with roughly the same energy as the input impulse.
 * The inner loop is fully unrolled (all state in locals) — this runs over whole music tracks.
 */
export function reverb(input: Float32Array, sr: number, o: ReverbOpts): Float32Array {
  const size = o.size ?? 1;
  const tailN = Math.round((o.tail ?? o.t60 * 0.8) * sr);
  const total = input.length + tailN;
  const out = new Float32Array(total);
  const dry = o.dry ?? 1;
  const pre = Math.round((o.pre ?? 0.01) * sr);
  const wetIn = new Float32Array(total);
  for (let i = 0; i < input.length && i + pre < total; i++) wetIn[i + pre] = input[i];
  if (o.lowcut) highpass(wetIn, o.lowcut, sr);
  if (o.highcut) lowpass(wetIn, o.highcut, sr);
  const dg = o.diffuse ?? 0.6;
  if (dg > 0) {
    allpass(wetIn, Math.round(0.0047 * sr * size), dg);
    allpass(wetIn, Math.round(0.0073 * sr * size), dg);
    allpass(wetIn, Math.round(0.0109 * sr * size), dg * 0.9);
  }
  const hf = clamp(o.hf ?? 0.5, 0.02, 1);
  const len: number[] = [];
  const g: number[] = [];
  const d: number[] = [];
  let lsum = 0;
  for (let j = 0; j < 8; j++) {
    const l = Math.max(16, Math.round((FDN_MS[j] * size * sr) / 1000));
    len.push(l);
    lsum += l;
    const gl = Math.pow(10, (-3 * l) / (o.t60 * sr));
    const gh = Math.pow(10, (-3 * l) / (o.t60 * hf * sr));
    g.push(gl);
    const r = gh / gl;
    d.push((1 - r) / (1 + r));
  }
  const line = new Float32Array(lsum);
  const [l0, l1, l2, l3, l4, l5, l6, l7] = len;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g;
  const [d0, d1, d2, d3, d4, d5, d6, d7] = d;
  const o0 = 0;
  const o1 = o0 + l0;
  const o2 = o1 + l1;
  const o3 = o2 + l2;
  const o4 = o3 + l3;
  const o5 = o4 + l4;
  const o6 = o5 + l5;
  const o7 = o6 + l6;
  let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0, p7 = 0;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, s6 = 0, s7 = 0;
  const outScale = o.wet / Math.sqrt((0.58 * o.t60 * sr) / (lsum / 8));
  const inLen = input.length;
  for (let i = 0; i < total; i++) {
    const x = wetIn[i];
    let v = line[o0 + p0];
    s0 = v + d0 * (s0 - v);
    v = line[o1 + p1];
    s1 = v + d1 * (s1 - v);
    v = line[o2 + p2];
    s2 = v + d2 * (s2 - v);
    v = line[o3 + p3];
    s3 = v + d3 * (s3 - v);
    v = line[o4 + p4];
    s4 = v + d4 * (s4 - v);
    v = line[o5 + p5];
    s5 = v + d5 * (s5 - v);
    v = line[o6 + p6];
    s6 = v + d6 * (s6 - v);
    v = line[o7 + p7];
    s7 = v + d7 * (s7 - v);
    const h = (s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7) * 0.25;
    const y = s0 - s1 + s2 - s3 - s4 + s5 - s6 + s7;
    line[o0 + p0] = g0 * (s0 - h) + x;
    line[o1 + p1] = g1 * (s1 - h) - x;
    line[o2 + p2] = g2 * (s2 - h) + x;
    line[o3 + p3] = g3 * (s3 - h) - x;
    line[o4 + p4] = g4 * (s4 - h) - x;
    line[o5 + p5] = g5 * (s5 - h) + x;
    line[o6 + p6] = g6 * (s6 - h) - x;
    line[o7 + p7] = g7 * (s7 - h) + x;
    if (++p0 === l0) p0 = 0;
    if (++p1 === l1) p1 = 0;
    if (++p2 === l2) p2 = 0;
    if (++p3 === l3) p3 = 0;
    if (++p4 === l4) p4 = 0;
    if (++p5 === l5) p5 = 0;
    if (++p6 === l6) p6 = 0;
    if (++p7 === l7) p7 = 0;
    out[i] = (i < inLen ? input[i] * dry : 0) + y * outScale;
  }
  return out;
}

/** Feedback echo (in place, same length). */
export function echo(buf: Float32Array, sr: number, time: number, fb: number, mix: number, lpHz = 4000): Float32Array {
  const n = Math.max(1, Math.round(time * sr));
  const line = new Float32Array(n);
  const a = 1 - Math.exp((-TAU * lpHz) / sr);
  let p = 0;
  let lp = 0;
  for (let i = 0; i < buf.length; i++) {
    const del = line[p];
    lp += a * (del - lp);
    const x = buf[i];
    line[p] = x + lp * fb;
    buf[i] = x + lp * mix;
    if (++p >= n) p = 0;
  }
  return buf;
}

/**
 * Change playback rate (rate 0.5 = an octave lower and twice as long), cubic Hermite
 * interpolation. Pre-filters when speeding up to limit aliasing.
 */
export function resample(src: Float32Array, rate: number): Float32Array {
  if (rate === 1) return src.slice();
  let s = src;
  if (rate > 1) {
    s = src.slice();
    const fc = 0.45 / rate;
    new Biquad().lowpass(fc, 0.7071, 1).run(s);
    new Biquad().lowpass(fc, 0.7071, 1).run(s);
  }
  const n = Math.max(1, Math.floor((s.length - 1) / rate));
  const out = new Float32Array(n);
  const last = s.length - 1;
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const k = p | 0;
    const f = p - k;
    const x0 = s[k];
    const xm1 = k > 0 ? s[k - 1] : x0;
    const x1 = k + 1 <= last ? s[k + 1] : x0;
    const x2 = k + 2 <= last ? s[k + 2] : x1;
    const c1 = 0.5 * (x1 - xm1);
    const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
    const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
    out[i] = ((c3 * f + c2) * f + c1) * f + x0;
  }
  return out;
}

/**
 * 2x upsampling with a 4-tap (Catmull-Rom style) half-sample interpolator. With `wrap` the
 * buffer is treated as periodic (for seamless loops rendered at half rate).
 */
export function upsample2(x: Float32Array, wrap = false): Float32Array {
  const n = x.length;
  const out = new Float32Array(n * 2);
  const at = (i: number): number => (wrap ? x[((i % n) + n) % n] : x[i < 0 ? 0 : i >= n ? n - 1 : i]);
  for (let i = 0; i < n; i++) {
    out[2 * i] = x[i];
    out[2 * i + 1] = (-at(i - 1) + 9 * x[i] + 9 * at(i + 1) - at(i + 2)) * 0.0625;
  }
  return out;
}

export function reverse(buf: Float32Array): Float32Array {
  const n = buf.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf[n - 1 - i];
  return out;
}

export function peakOf(buf: Float32Array, from = 0, to = buf.length): number {
  let m = 0;
  for (let i = from; i < to; i++) {
    const a = Math.abs(buf[i]);
    if (a > m) m = a;
  }
  return m;
}

export function rmsOf(buf: Float32Array, from = 0, to = buf.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

export function normalize(buf: Float32Array, peak: number): Float32Array {
  const m = peakOf(buf);
  if (m > 1e-12) {
    const g = peak / m;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }
  return buf;
}

export function scale(buf: Float32Array, g: number): Float32Array {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

export function fadeIn(buf: Float32Array, n: number): Float32Array {
  const m = Math.min(n, buf.length);
  for (let i = 0; i < m; i++) buf[i] *= Math.sin((0.5 * Math.PI * i) / m);
  return buf;
}

export function fadeOut(buf: Float32Array, n: number): Float32Array {
  const len = buf.length;
  const m = Math.min(n, len);
  for (let i = 0; i < m; i++) buf[len - 1 - i] *= Math.sin((0.5 * Math.PI * i) / m);
  return buf;
}

/** Smooth saturation: tanh-like, unity slope at 0. */
export function softClip(buf: Float32Array, drive: number): Float32Array {
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) * norm;
  return buf;
}

/** Add src into dst at offset with gain. */
export function mixInto(dst: Float32Array, src: Float32Array, offset = 0, gain = 1): void {
  const s0 = Math.max(0, -offset);
  const end = Math.min(src.length, dst.length - offset);
  for (let i = s0; i < end; i++) dst[i + offset] += src[i] * gain;
}

/** Make a seamless loop: the last `x` samples are cross-faded (equal power) into the start. */
export function loopify(buf: Float32Array, x: number): Float32Array {
  const L = buf.length - x;
  const out = buf.slice(0, L);
  for (let i = 0; i < x; i++) {
    const a = (0.5 * Math.PI * i) / x;
    out[i] = buf[i] * Math.sin(a) + buf[L + i] * Math.cos(a);
  }
  return out;
}

export interface FinishOpts {
  /** DC/rumble high-pass (Hz), default 22; 0 disables */
  hp?: number;
  /** fade-in seconds (default 0.0006) */
  fadeIn?: number;
  /** fade-out seconds (default 0.012) */
  fadeOut?: number;
  /** trim trailing samples below this level relative to peak (dB, default -62); null = no trim */
  trimDb?: number | null;
  /** trim leading samples below this level relative to peak (dB), default no trim */
  trimStartDb?: number;
  /** seamless loop — skips fades & trimming */
  loop?: boolean;
}

/** Sanitise, DC-block, trim, fade and peak-normalise a finished buffer. */
export function finish(buf: Float32Array, sr: number, peak: number, o: FinishOpts = {}): Float32Array {
  for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) buf[i] = 0;
  const hp = o.hp ?? 22;
  if (hp > 0) {
    if (o.loop) {
      // warm the filter up on the loop's tail so its state is continuous across the seam
      const bq = new Biquad().highpass(hp, 0.7071, sr);
      bq.run(buf.slice(Math.max(0, buf.length - Math.round(0.5 * sr))));
      bq.run(buf);
    } else {
      new Biquad().highpass(hp, 0.7071, sr).run(buf);
    }
  }
  let out = buf;
  if (!o.loop) {
    const m = peakOf(out);
    if (m > 1e-9) {
      if (o.trimStartDb !== undefined) {
        const th = m * Math.pow(10, o.trimStartDb / 20);
        let s = 0;
        while (s < out.length - 1 && Math.abs(out[s]) < th) s++;
        s = Math.max(0, s - Math.round(0.002 * sr));
        if (s > 0) out = out.slice(s);
      }
      if (o.trimDb !== null) {
        const th = m * Math.pow(10, (o.trimDb ?? -62) / 20);
        let e = out.length - 1;
        while (e > 0 && Math.abs(out[e]) < th) e--;
        e = Math.min(out.length, e + Math.round(0.004 * sr));
        if (e < out.length) out = out.slice(0, Math.max(e, 16));
      }
    }
    fadeIn(out, Math.round((o.fadeIn ?? 0.0006) * sr));
    fadeOut(out, Math.min(Math.round((o.fadeOut ?? 0.012) * sr), out.length >> 2));
  }
  return normalize(out, peak);
}

/** Render `fill` into a fresh buffer of length n, normalise its peak to `peak` and add it to out. */
export function layer(out: Float32Array, peak: number, fill: (b: Float32Array) => void, offset = 0): void {
  const b = new Float32Array(out.length);
  fill(b);
  const m = peakOf(b);
  if (m < 1e-12) return;
  mixInto(out, b, offset, peak / m);
}

/** Like layer() but normalises RMS over the non-silent part. */
export function layerRms(out: Float32Array, rms: number, fill: (b: Float32Array) => void): void {
  const b = new Float32Array(out.length);
  fill(b);
  const pk = peakOf(b);
  if (pk < 1e-12) return;
  // RMS over region above -40 dB of the peak
  const th = pk * 0.01;
  let s = 0;
  let c = 0;
  for (let i = 0; i < b.length; i++) {
    const a = Math.abs(b[i]);
    if (a > th) {
      s += b[i] * b[i];
      c++;
    }
  }
  const r = Math.sqrt(s / Math.max(1, c));
  if (r < 1e-12) return;
  mixInto(out, b, 0, rms / r);
}
