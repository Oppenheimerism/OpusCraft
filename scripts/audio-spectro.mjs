// Render log-frequency spectrograms (+ amplitude envelope strip) of procedural sounds to a PNG
// contact sheet so they can be inspected visually.
// usage: node scripts/audio-spectro.mjs <nameRegex> <out.png> [variants=1] [cols=4] [cellW=300]
//        node scripts/audio-spectro.mjs --music <out.png>   (all music tracks, one per row)
import { loadModules } from './load.mjs';
import { writePNG } from './png.mjs';
import { fft } from './audio-lib.mjs';

const args = process.argv.slice(2);
const SR = 44100;
const music = args[0] === '--music';
const re = music ? null : new RegExp(args[0] ?? '.');
const out = args[1] ?? 'tmp/audio/spectro.png';
const nVar = +(args[2] ?? 1);
const cols = music ? 1 : +(args[3] ?? 4);
const cellW = music ? 1800 : +(args[4] ?? 300);
const specH = music ? 220 : 128, envH = 28, pad = 6;
const cellH = specH + envH + pad * 2;

const { mods: [m], close } = await loadModules(['/src/audio/synth.ts']);
const items = [];
if (music) {
  for (let i = 0; i < m.MUSIC_TRACK_COUNT; i++) items.push([`music_${i}`, m.generateMusicTrack(i, SR)]);
  items.push(['menu', m.generateMenuMusic(SR)]);
} else {
  for (const [name, g] of Object.entries(m.SOUNDS)) {
    if (!re.test(name)) continue;
    for (let v = 0; v < Math.min(nVar, g.variants); v++) items.push([`${name}#${v}`, g.generate(v, SR)]);
  }
}
const W = cols * (cellW + pad * 2);
const rows = Math.ceil(items.length / cols);
const H = rows * cellH;
const img = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) { img[i * 4] = 18; img[i * 4 + 1] = 18; img[i * 4 + 2] = 22; img[i * 4 + 3] = 255; }
const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; img[i] = r; img[i + 1] = g; img[i + 2] = b; };
const cmap = (v) => { // 0..1 -> inferno-ish
  const stops = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const x = Math.max(0, Math.min(0.9999, v)) * (stops.length - 1); const k = Math.floor(x), f = x - k;
  return stops[k].map((c, j) => Math.round(c + (stops[k + 1][j] - c) * f));
};
const N = music ? 4096 : 1024;
const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
const fLo = 40, fHi = 16000;
items.forEach(([name, x], idx) => {
  const ox = (idx % cols) * (cellW + pad * 2) + pad, oy = Math.floor(idx / cols) * cellH + pad;
  const cols2 = cellW;
  const spec = [];
  let gmax = 1e-20;
  for (let c = 0; c < cols2; c++) {
    const center = Math.floor(((c + 0.5) / cols2) * x.length);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[center - N / 2 + i] || 0) * win[i];
    fft(re, im);
    const p = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) { p[k] = re[k] * re[k] + im[k] * im[k]; if (p[k] > gmax) gmax = p[k]; }
    spec.push(p);
  }
  for (let c = 0; c < cols2; c++) {
    for (let r = 0; r < specH; r++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - r / (specH - 1));
      const kf = (f * N) / SR; const k = Math.floor(kf), fr = kf - k;
      const p = (spec[c][k] || 0) * (1 - fr) + (spec[c][k + 1] || 0) * fr;
      const dB = 10 * Math.log10(p / gmax + 1e-12);
      const [R, G, B] = cmap((dB + 75) / 75);
      put(ox + c, oy + r, R, G, B);
    }
  }
  // frequency gridlines at 100, 1k, 10k
  for (const gf of [100, 1000, 10000]) {
    const r = Math.round((1 - Math.log(gf / fLo) / Math.log(fHi / fLo)) * (specH - 1));
    for (let c = 0; c < cols2; c += 4) put(ox + c, oy + r, 90, 200, 90);
  }
  // envelope strip
  const ey = oy + specH + 2;
  for (let c = 0; c < cols2; c++) {
    const a0 = Math.floor((c / cols2) * x.length), a1 = Math.floor(((c + 1) / cols2) * x.length);
    let pk = 0; for (let i = a0; i < a1; i++) pk = Math.max(pk, Math.abs(x[i]));
    const h = Math.round(pk * (envH - 2));
    for (let r = 0; r < h; r++) put(ox + c, ey + envH - 2 - r, 120, 190, 255);
  }
});
writePNG(out, W, H, img);
console.log(items.map(([n, x], i) => `${i}:${n}(${(x.length / SR).toFixed(2)}s)`).join('  '));
await close();
