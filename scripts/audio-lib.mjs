// Shared helpers for the audio check / spectrogram scripts: WAV writer, FFT, analysis.
import fs from 'node:fs';

export function writeWav(path, data, sr) {
  const n = data.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, data[i] || 0));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path, buf);
}

/** in-place radix-2 FFT on (re, im) of length N (power of two) */
export function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Power spectra of Hann-windowed frames. Returns { frames: Float64Array[], N, hop } */
export function stft(x, N = 2048, hop = 1024, maxFrames = 4000) {
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const frames = [];
  const count = Math.max(1, Math.ceil((x.length - N) / hop) + 1);
  const step = Math.max(1, Math.ceil(count / maxFrames));
  for (let f = 0; f < count; f += step) {
    const re = new Float64Array(N), im = new Float64Array(N);
    const o = f * hop;
    for (let i = 0; i < N; i++) re[i] = (x[o + i] || 0) * win[i];
    fft(re, im);
    const p = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    frames.push(p);
  }
  return { frames, N, hop: hop * step };
}

export function analyze(x, sr) {
  let peak = 0, sum = 0, sum2 = 0, nan = 0, clip = 0, zc = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clip++;
    sum += v; sum2 += v * v;
    if (i > 0 && (x[i - 1] < 0) !== (v < 0)) zc++;
  }
  const n = x.length;
  const rms = Math.sqrt(sum2 / Math.max(1, n));
  const dc = sum / Math.max(1, n);
  // onset: first sample above 10% of peak
  let onset = 0;
  while (onset < n && Math.abs(x[onset]) < peak * 0.1) onset++;
  // active RMS (above -40 dB of peak, in 10 ms blocks)
  const blk = Math.round(sr * 0.01);
  let act = 0, actN = 0;
  for (let i = 0; i + blk <= n; i += blk) {
    let s = 0;
    for (let j = 0; j < blk; j++) s += x[i + j] * x[i + j];
    const r = Math.sqrt(s / blk);
    if (r > peak * 0.01) { act += s; actN += blk; }
  }
  const activeRms = Math.sqrt(act / Math.max(1, actN));
  // spectral centroid (energy-weighted over frames)
  const { frames, N } = stft(x, 2048, 1024, 400);
  let cw = 0, ce = 0;
  const avg = new Float64Array(N / 2);
  for (const p of frames) {
    let e = 0, c = 0;
    for (let k = 1; k < N / 2; k++) { e += p[k]; c += p[k] * (k * sr / N); avg[k] += p[k]; }
    if (e > 0) { cw += c; ce += e; }
  }
  const centroid = ce > 0 ? cw / ce : 0;
  // band energy fractions
  const bands = [0, 250, 1000, 4000, sr / 2];
  const bandE = [0, 0, 0, 0];
  let tot = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    for (let b = 0; b < 4; b++) if (f >= bands[b] && f < bands[b + 1]) bandE[b] += avg[k];
    tot += avg[k];
  }
  const bandFrac = bandE.map((e) => (tot > 0 ? e / tot : 0));
  // f0 estimate by normalised autocorrelation on loudest window
  const W = Math.min(n, 4096);
  let best = 0, bestE = -1;
  for (let i = 0; i + W <= n; i += Math.max(1, W >> 2)) {
    let s = 0;
    for (let j = 0; j < W; j += 4) s += x[i + j] * x[i + j];
    if (s > bestE) { bestE = s; best = i; }
  }
  let f0 = 0, clarity = 0;
  if (W >= 512) {
    const seg = x.subarray(best, best + W);
    const minLag = Math.floor(sr / 2000), maxLag = Math.min(Math.floor(sr / 45), W >> 1);
    let r0 = 0;
    for (let j = 0; j < W; j++) r0 += seg[j] * seg[j];
    const r = new Float64Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0, e1 = 0, e2 = 0;
      for (let j = 0; j + lag < W; j++) { s += seg[j] * seg[j + lag]; e1 += seg[j] * seg[j]; e2 += seg[j + lag] * seg[j + lag]; }
      r[lag] = s / Math.sqrt(e1 * e2 + 1e-12);
    }
    // first strong peak (avoid octave errors: pick first lag whose r >= 0.9 * max)
    let mx = 0;
    for (let lag = minLag; lag <= maxLag; lag++) if (r[lag] > mx) mx = r[lag];
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (r[lag] >= 0.9 * mx && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) { f0 = sr / lag; clarity = r[lag]; break; }
    }
  }
  return { dur: n / sr, peak, rms, activeRms, dc, nan, clip, zcr: zc / (n / sr), onset: onset / sr, centroid, bandFrac, f0, clarity };
}
