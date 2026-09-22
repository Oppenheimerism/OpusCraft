// Generate every procedural sound variant + music, write WAVs to tmp/audio/, and print
// measurements (duration, peak, RMS, generation time, spectral stats) with sanity flags.
//
// usage: node scripts/audio-check.mjs [nameRegex] [--no-music] [--music-only] [--no-wav] [--sr=44100] [--quiet]
import fs from 'node:fs';
import { loadModules } from './load.mjs';
import { writeWav, analyze } from './audio-lib.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const filter = args.find((a) => !a.startsWith('--'));
const re = filter ? new RegExp(filter) : null;
const SR = +opt('sr', 44100);
const writeFiles = !flag('--no-wav');
const quiet = flag('--quiet');
const outDir = 'tmp/audio';
if (writeFiles) fs.mkdirSync(outDir, { recursive: true });

const { mods: [m], close } = await loadModules(['/src/audio/synth.ts']);

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
const dbfs = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// ---- expectations: [regex, (stats, name) => warning string | null]
const AMBIENT = /ambient|weather\.|thunder|portal|fire_crackle|levelup|primed|swim|attack\.sweep/;
const rules = [
  [/.*/, (s) => (s.nan ? `NaN/Inf x${s.nan}` : null)],
  [/.*/, (s) => (s.clip ? `clipping x${s.clip}` : null)],
  [/.*/, (s) => (Math.abs(s.dc) > 0.01 ? `DC offset ${f3(s.dc)}` : null)],
  [/.*/, (s) => (s.peak < 0.02 ? 'silent' : null)],
  [/.*/, (s) => (s.peak < 0.78 || s.peak > 0.92 ? `peak ${f2(s.peak)} outside 0.78-0.92` : null)],
  [/.*/, (s) => (s.dur < 0.03 ? `too short ${f3(s.dur)}s` : null)],
  [/.*/, (s, n) => (!AMBIENT.test(n) && !/cave/.test(n) && s.onset > 0.04 ? `late onset ${f3(s.onset)}s` : null)],
  [/.*/, (s) => (s.ms > 20 ? `slow ${f1(s.ms)}ms` : null)],
  [/^block\.(grass|gravel|sand|snow|crop|wet_grass)\.(step|break)$/, (s) => (s.zcr < 1500 ? `not noisy (zcr ${s.zcr | 0})` : null)],
  [/^block\.[a-z_]+\.step$/, (s) => (s.dur > 0.5 ? `step too long ${f2(s.dur)}` : null)],
  [/^block\.[a-z_]+\.hit$/, (s) => (s.centroid > 3500 ? `hit too bright ${s.centroid | 0}Hz` : null)],
  [/^entity\.cow\.ambient$/, (s) => (s.f0 && s.clarity > 0.6 && (s.f0 < 60 || s.f0 > 220) ? `moo f0 ${s.f0 | 0}` : s.centroid > 1600 ? `moo too bright ${s.centroid | 0}` : null)],
  [/^entity\.sheep\.ambient$/, (s) => (s.f0 && s.clarity > 0.6 && (s.f0 < 150 || s.f0 > 450) ? `baa f0 ${s.f0 | 0}` : null)],
  [/^entity\.zombie\.ambient$/, (s) => (s.f0 && s.clarity > 0.6 && s.f0 > 180 ? `groan f0 ${s.f0 | 0}` : null)],
  [/^entity\.item\.pickup$/, (s) => (s.centroid < 900 ? `pop not bright ${s.centroid | 0}` : null)],
  [/^entity\.experience_orb\.pickup$/, (s) => (s.centroid < 1200 ? `orb not bright ${s.centroid | 0}` : null)],
  [/^block\.note_block\.harp$/, (s) => (Math.abs(s.f0 - 369.99) > 8 ? `harp f0 ${f1(s.f0)} (want 370)` : null)],
  [/^entity\.generic\.explode$/, (s) => (s.centroid > 1500 ? `boom too bright ${s.centroid | 0}` : s.dur < 1.5 ? 'boom too short' : null)],
  [/^entity\.lightning_bolt\.thunder$/, (s) => (s.centroid > 1500 ? `thunder too bright ${s.centroid | 0}` : null)],
  [/^ui\.button\.click$/, (s) => (s.dur > 0.2 ? 'click too long' : null)],
  [/^ambient\.cave$/, (s) => (s.dur < 3 || s.dur > 8.5 ? `cave dur ${f2(s.dur)}` : null)],
  [/^weather\.rain/, (s) => (s.dur < 3.9 || s.dur > 6.1 ? `rain dur ${f2(s.dur)}` : s.loopJump > 4 ? `loop seam jump ${f1(s.loopJump)}x` : null)],
];

function loopJump(x) {
  // |x[0]-x[N-1]| relative to median absolute first difference
  const d = [];
  for (let i = 1; i < x.length; i += 7) d.push(Math.abs(x[i] - x[i - 1]));
  d.sort((a, b) => a - b);
  const med = d[d.length >> 1] || 1e-9;
  return Math.abs(x[0] - x[x.length - 1]) / med;
}

const names = Object.keys(m.SOUNDS).filter((n) => !re || re.test(n));
const warnings = [];
const times = [];
let totalDur = 0, totalSamples = 0, count = 0;
if (!flag('--music-only')) {
  // warm up JIT a little so first-call timings are representative
  for (const n of names.slice(0, 3)) m.SOUNDS[n].generate(0, SR);
  if (!quiet) console.log('name'.padEnd(34), 'v', 'dur(s)'.padStart(6), 'peak'.padStart(5), 'rms dB'.padStart(7), 'zcr/s'.padStart(7), 'cent'.padStart(6), 'f0'.padStart(6), 'lo/mid/hi/air %'.padStart(17), 'ms'.padStart(6));
  for (const name of names) {
    const g = m.SOUNDS[name];
    for (let v = 0; v < g.variants; v++) {
      const t0 = performance.now();
      const x = g.generate(v, SR);
      const ms = performance.now() - t0;
      const s = analyze(x, SR);
      s.ms = ms;
      if (/^weather\.rain/.test(name)) s.loopJump = loopJump(x);
      times.push([ms, `${name}#${v}`]);
      totalDur += s.dur; totalSamples += x.length; count++;
      for (const [rx, fn] of rules) {
        if (!rx.test(name)) continue;
        const w = fn(s, name);
        if (w) warnings.push(`${name}#${v}: ${w}`);
      }
      if (!quiet) {
        const bf = s.bandFrac.map((b) => String(Math.round(b * 100)).padStart(3)).join('/');
        console.log(
          name.padEnd(34), String(v), f2(s.dur).padStart(6), f2(s.peak).padStart(5), f1(dbfs(s.activeRms)).padStart(7),
          String(s.zcr | 0).padStart(7), String(s.centroid | 0).padStart(6),
          (s.clarity > 0.5 ? String(s.f0 | 0) : '-').padStart(6), bf.padStart(17), f1(ms).padStart(6),
        );
      }
      if (writeFiles) writeWav(`${outDir}/${name}.${v}.wav`, x, SR);
    }
  }
  times.sort((a, b) => a[0] - b[0]);
  const med = times.length ? times[times.length >> 1][0] : 0;
  const p95 = times.length ? times[Math.floor(times.length * 0.95)][0] : 0;
  const tot = times.reduce((a, b) => a + b[0], 0);
  console.log(`\n${names.length} sounds, ${count} takes, ${f1(totalDur)} s audio (${(totalSamples * 4 / 1048576).toFixed(1)} MB f32)`);
  console.log(`gen time: total ${f1(tot)} ms, median ${f2(med)} ms, p95 ${f2(p95)} ms, max ${f2(times.at(-1)?.[0] ?? 0)} ms (${times.at(-1)?.[1]})`);
  console.log('slowest:', times.slice(-6).reverse().map(([t, n]) => `${n} ${f1(t)}ms`).join(', '));
}

if (!flag('--no-music') && !re) {
  console.log(`\nmusic: ${m.MUSIC_TRACK_COUNT} tracks + menu`);
  const jobs = [];
  for (let i = 0; i < m.MUSIC_TRACK_COUNT; i++) jobs.push([`music_${i}`, () => m.generateMusicTrack(i, SR)]);
  jobs.push(['menu', () => m.generateMenuMusic(SR)]);
  for (const [name, fn] of jobs) {
    const t0 = performance.now();
    const x = fn();
    const ms = performance.now() - t0;
    const s = analyze(x, SR);
    const w = [];
    if (s.nan) w.push(`NaN x${s.nan}`);
    if (s.clip) w.push(`clip x${s.clip}`);
    if (Math.abs(s.peak - 0.6) > 0.05) w.push(`peak ${f2(s.peak)}`);
    if (s.dur < (name === 'menu' ? 60 : 60) || s.dur > (name === 'menu' ? 120 : 150)) w.push(`dur ${f1(s.dur)}s`);
    if (ms > 3000) w.push(`slow ${ms | 0}ms`);
    if (Math.abs(s.dc) > 0.005) w.push(`dc ${f3(s.dc)}`);
    // ending must fade out
    const tail = x.subarray(x.length - Math.round(SR * 0.05));
    let tp = 0; for (const v of tail) tp = Math.max(tp, Math.abs(v));
    if (tp > 0.01) w.push(`abrupt end ${f3(tp)}`);
    for (const ww of w) warnings.push(`${name}: ${ww}`);
    const bf = s.bandFrac.map((b) => String(Math.round(b * 100)).padStart(3)).join('/');
    console.log(`${name.padEnd(10)} dur ${f1(s.dur)}s peak ${f2(s.peak)} rms ${f1(dbfs(s.activeRms))} dB centroid ${s.centroid | 0} Hz bands ${bf} gen ${ms | 0} ms`);
    if (writeFiles) writeWav(`${outDir}/${name}.wav`, x, SR);
  }
}

console.log(warnings.length ? `\n${warnings.length} WARNINGS:\n  ${warnings.join('\n  ')}` : '\nno warnings');
await close();
