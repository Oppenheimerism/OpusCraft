// Foley building blocks: stochastic particle textures (PhISEM), modal impacts, bubbles,
// creaks, swept noise, thumps. All write *additively* into a caller-provided buffer.

import { Biquad, Rng, SVF, addMode, clamp, sinCyc } from './dsp';

export interface Band {
  /** centre frequency (Hz) */
  f: number;
  q: number;
  /** gain of this band in the mix */
  g: number;
  /** random re-tune (± fraction) at every collision — gives the "many different grains" colour */
  spread?: number;
}

export interface PhisemOpts {
  /** start time (s) */
  t?: number;
  /** length of the rendered region (s) */
  dur: number;
  /** collisions per second when energy = 1 */
  rate: number;
  /** system-energy envelope 0..1 */
  energy: (t: number) => number;
  /** decay time-constant (s) of the noise burst each collision creates */
  grain: number;
  /** collision amplitude distribution exponent: amp = u^heavy (bigger = spikier) */
  heavy?: number;
  bands: Band[];
  /** unfiltered noise mix */
  dry?: number;
  gain?: number;
}

/**
 * Physically-informed stochastic event modelling (after Perry Cook): random collisions
 * inject energy into a fast-decaying "sound level" that modulates white noise, which is
 * coloured by a small bank of (randomly re-tuned) resonant band-passes. Great for gravel,
 * sand, snow, leaves, crunching, sizzles.
 */
export function phisem(out: Float32Array, sr: number, rng: Rng, o: PhisemOpts): void {
  const start = Math.round((o.t ?? 0) * sr);
  const n = Math.min(out.length - start, Math.round(o.dur * sr));
  if (n <= 0) return;
  const nb = o.bands.length;
  const filt: SVF[] = [];
  const gains = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    filt.push(new SVF(o.bands[b].f, o.bands[b].q, sr));
    gains[b] = o.bands[b].g;
  }
  const decay = Math.exp(-1 / (Math.max(5e-5, o.grain) * sr));
  const p = o.rate / sr;
  const heavy = o.heavy ?? 2;
  const dry = o.dry ?? 0;
  const gain = o.gain ?? 1;
  let level = 0;
  let e = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 7) === 0) e = o.energy(i / sr);
    if (e > 0 && rng.next() < p * e) {
      level += e * Math.pow(rng.next(), heavy);
      for (let b = 0; b < nb; b++) {
        const band = o.bands[b];
        if (band.spread) filt[b].set(band.f * (1 + band.spread * rng.bi()), band.q, sr);
      }
    }
    level *= decay;
    const x = rng.bi() * level;
    let y = dry * x;
    for (let b = 0; b < nb; b++) y += gains[b] * filt[b].band(x);
    out[start + i] += y * gain;
  }
}

export interface TickOpts {
  t?: number;
  dur: number;
  /** events per second at energy 1 */
  rate: number;
  energy: (t: number) => number;
  /** fundamental range (Hz), log-uniform */
  f: [number, number];
  /** t60 range (s) */
  t60: [number, number];
  /** partial ratios (default a small inharmonic set) */
  ratios?: number[];
  /** partial amplitude weights */
  weights?: number[];
  amp?: number;
  heavy?: number;
  /** add a tiny noise click to each tick (amount) */
  click?: number;
}

/** Sparse modal "ticks": pebbles, shards, bones, crackles with pitch. */
export function ticks(out: Float32Array, sr: number, rng: Rng, o: TickOpts): number {
  const ratios = o.ratios ?? [1, 1.59, 2.37];
  const weights = o.weights ?? [1, 0.5, 0.25];
  const amp = o.amp ?? 1;
  const heavy = o.heavy ?? 2;
  const t0 = o.t ?? 0;
  let t = 0;
  let count = 0;
  for (;;) {
    t += -Math.log(1 - rng.next()) / o.rate;
    if (t >= o.dur) break;
    const e = o.energy(t);
    if (rng.next() > e) continue;
    const a = amp * (0.15 + 0.85 * Math.pow(rng.next(), heavy));
    const f = rng.logRange(o.f[0], o.f[1]);
    const tt = rng.logRange(o.t60[0], o.t60[1]);
    const s = Math.round((t0 + t) * sr);
    for (let k = 0; k < ratios.length; k++) {
      addMode(out, s, sr, f * ratios[k] * (1 + 0.02 * rng.bi()), a * weights[k] * (0.6 + 0.4 * rng.next()), tt / (1 + 0.5 * k));
    }
    if (o.click) {
      const len = Math.round(0.0008 * sr);
      for (let i = 0; i < len && s + i < out.length; i++) out[s + i] += o.click * a * rng.bi() * (1 - i / len);
    }
    count++;
  }
  return count;
}

export interface ImpactOpts {
  t?: number;
  /** flat [f, amp, t60, f, amp, t60, ...] */
  modes: number[];
  /** random frequency jitter (fraction) */
  jitter?: number;
  /** contact-noise amplitude relative to modes */
  noise?: number;
  /** contact-noise decay time constant (s) */
  noiseTau?: number;
  /** contact-noise band-pass [f, q] */
  noiseBp?: [number, number];
  gain?: number;
}

/** A struck object: sum of damped modes plus a short filtered contact noise. */
export function impact(out: Float32Array, sr: number, rng: Rng, o: ImpactOpts): void {
  const s = Math.round((o.t ?? 0) * sr);
  const g = o.gain ?? 1;
  const j = o.jitter ?? 0;
  for (let i = 0; i + 2 < o.modes.length; i += 3) {
    addMode(out, s, sr, o.modes[i] * (1 + j * rng.bi()), o.modes[i + 1] * g, o.modes[i + 2]);
  }
  if (o.noise) {
    const tau = o.noiseTau ?? 0.004;
    const n = Math.min(out.length - s, Math.round(tau * 7 * sr));
    const bp = o.noiseBp ? new SVF(o.noiseBp[0], o.noiseBp[1], sr) : null;
    const k = Math.exp(-1 / (tau * sr));
    let env = 1;
    for (let i = 0; i < n; i++) {
      const x = rng.bi() * env;
      out[s + i] += (bp ? bp.band(x) : x) * o.noise * g;
      env *= k;
    }
  }
}

export interface BurstOpts {
  t?: number;
  dur: number;
  attack?: number;
  tau: number;
  amp?: number;
  hp?: number;
  lp?: number;
  bp?: [number, number];
  /** 'white' | 'brown' */
  color?: 'white' | 'brown';
  /** extra amplitude-modulation envelope */
  env?: (t: number) => number;
}

/** Filtered noise with attack/decay envelope. */
export function burst(out: Float32Array, sr: number, rng: Rng, o: BurstOpts): void {
  const s = Math.round((o.t ?? 0) * sr);
  const n = Math.min(out.length - s, Math.round(o.dur * sr));
  if (n <= 0) return;
  const a = Math.max(1e-4, o.attack ?? 0.001);
  const amp = o.amp ?? 1;
  const hp = o.hp ? new Biquad().highpass(o.hp, 0.7071, sr) : null;
  const lp = o.lp ? new Biquad().lowpass(o.lp, 0.7071, sr) : null;
  const bp = o.bp ? new SVF(o.bp[0], o.bp[1], sr) : null;
  const k = Math.exp(-1 / (o.tau * sr));
  let dec = 1;
  let br = 0;
  const brown = o.color === 'brown';
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let e: number;
    if (t < a) e = Math.sin((0.5 * Math.PI * t) / a);
    else {
      e = dec;
      dec *= k;
    }
    if (o.env) e *= o.env(t);
    let x: number;
    if (brown) {
      br = 0.985 * br + 0.17 * rng.bi();
      x = br;
    } else x = rng.bi();
    if (hp) x = hp.process(x);
    if (lp) x = lp.process(x);
    if (bp) x = bp.band(x);
    out[s + i] += x * e * amp;
  }
}

export interface ThumpOpts {
  t?: number;
  f0: number;
  f1?: number;
  /** pitch glide time-constant (s) */
  glide?: number;
  tau: number;
  amp?: number;
  attack?: number;
  /** 2nd harmonic amount */
  h2?: number;
  /** length (s), default 6 * tau */
  dur?: number;
}

/** Low sine thump with exponential pitch drop (kick-drum style body). */
export function thump(out: Float32Array, sr: number, o: ThumpOpts): void {
  const s = Math.round((o.t ?? 0) * sr);
  const n = Math.min(out.length - s, Math.round((o.dur ?? o.tau * 6) * sr));
  const f1 = o.f1 ?? o.f0;
  const gl = Math.exp(-1 / ((o.glide ?? 0.03) * sr));
  const a = Math.max(1e-4, o.attack ?? 0.0015);
  const na = Math.round(a * sr);
  const amp = o.amp ?? 1;
  const h2 = o.h2 ?? 0;
  const kd = Math.exp(-1 / (o.tau * sr));
  let df = o.f0 - f1;
  let e = amp;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (f1 + df) / sr;
    df *= gl;
    const att = i < na ? Math.sin((0.5 * Math.PI * i) / na) : 1;
    out[s + i] += e * att * (h2 ? sinCyc(ph) + h2 * sinCyc(2 * ph) : sinCyc(ph));
    e *= kd;
  }
}

/**
 * Minnaert bubble: exponentially decaying sine whose pitch rises as the bubble nears the
 * surface (van den Doel). `rise` = fractional pitch increase per time-constant.
 */
export function bubble(out: Float32Array, sr: number, t: number, f: number, amp: number, tau?: number, rise = 0.3): void {
  const s = Math.round(t * sr);
  const T = tau ?? clamp(3.5 / f + 0.003, 0.004, 0.06);
  const n = Math.min(out.length - s, Math.round(T * 5 * sr));
  const na = Math.max(1, Math.round(0.0006 * sr));
  const kd = Math.exp(-1 / (T * sr));
  const df = (f * rise) / (T * sr * sr); // per-sample increment of (frequency / sr)
  let inc = f / sr;
  let ph = 0;
  let e = amp;
  for (let i = 0; i < n; i++) {
    ph += inc;
    inc += df;
    out[s + i] += e * (i < na ? i / na : 1) * sinCyc(ph);
    e *= kd;
  }
}

export interface SweepOpts {
  t?: number;
  dur: number;
  /** centre frequency over time */
  f: (t: number) => number;
  q: number | ((t: number) => number);
  amp: (t: number) => number;
  color?: 'white' | 'pink';
  /** use low-pass instead of band-pass */
  mode?: 'bp' | 'lp' | 'hp';
}

/** Noise through a time-varying resonant filter: whooshes, swooshes, squelches, wind. */
export function sweep(out: Float32Array, sr: number, rng: Rng, o: SweepOpts): void {
  const s = Math.round((o.t ?? 0) * sr);
  const n = Math.min(out.length - s, Math.round(o.dur * sr));
  const f = new SVF(o.f(0), typeof o.q === 'number' ? o.q : o.q(0), sr);
  const mode = o.mode ?? 'bp';
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  const pinkN = o.color === 'pink';
  let q = typeof o.q === 'number' ? o.q : o.q(0);
  let a = o.amp(0);
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / sr;
      if (typeof o.q !== 'number') q = o.q(t);
      f.set(o.f(t), q, sr);
      a = o.amp(t);
    }
    let x = rng.bi();
    if (pinkN) {
      b0 = 0.99765 * b0 + x * 0.099046;
      b1 = 0.963 * b1 + x * 0.2965164;
      b2 = 0.57 * b2 + x * 1.0526913;
      x = (b0 + b1 + b2 + x * 0.1848) * 0.25;
    }
    const y = mode === 'bp' ? f.band(x) : mode === 'lp' ? f.low(x) : f.high(x);
    out[s + i] += y * a;
  }
}

export interface CreakOpts {
  t?: number;
  dur: number;
  /** stick-slip pulse rate (Hz) over time */
  rate: (t: number) => number;
  amp: (t: number) => number;
  /** random period jitter (fraction) */
  jitter?: number;
  /** body resonances */
  bands: Band[];
}

/** Stick-slip friction (hinges, wood creaks): a jittery pulse train through body resonances. */
export function creak(out: Float32Array, sr: number, rng: Rng, o: CreakOpts): void {
  const s = Math.round((o.t ?? 0) * sr);
  const n = Math.min(out.length - s, Math.round(o.dur * sr));
  const filt = o.bands.map((b) => new SVF(b.f, b.q, sr));
  const jit = o.jitter ?? 0.1;
  let ph = 0;
  let per = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (o.rate(t) * per) / sr;
    let x = 0;
    if (ph >= 1) {
      ph -= 1;
      per = 1 + jit * rng.gauss() * 0.5;
      x = (0.6 + 0.4 * rng.next()) * (rng.next() < 0.85 ? 1 : -0.6);
    }
    x += rng.bi() * 0.03;
    let y = 0;
    for (let b = 0; b < filt.length; b++) y += o.bands[b].g * filt[b].band(x);
    out[s + i] += y * o.amp(t);
  }
}

/** Two-bump energy envelope (e.g. heel then toe of a footstep). */
export function twoBump(a1: number, d1: number, t2: number, k2: number, a2: number, d2: number): (t: number) => number {
  return (t: number) => {
    const e1 = t < a1 ? t / a1 : Math.exp(-(t - a1) / d1);
    const u = t - t2;
    const e2 = u <= 0 ? 0 : u < a2 ? (k2 * u) / a2 : k2 * Math.exp(-(u - a2) / d2);
    return Math.min(1, e1 + e2);
  };
}
