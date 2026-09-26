// The End's new music, headless: node tests/end/music.mjs [pool] [--wav]
import { loadModules } from '../../scripts/load.mjs';
import { analyze, writeWav } from '../../scripts/audio-lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods: [m, synth], close } = await loadModules(['/src/audio/gen/endMusic.ts', '/src/audio/synth.ts']);
const SR = 44100;
const pools = process.argv[2] && !process.argv[2].startsWith('--') ? [process.argv[2]] : ['music.dragon', 'music.credits'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
check('the pools are known to the game (MUSIC_POOLS)', synth.MUSIC_POOLS['music.dragon'] === 1 && synth.MUSIC_POOLS['music.credits'] === 1 && synth.MUSIC_POOLS['music.end'] === 1, JSON.stringify(synth.MUSIC_POOLS));
for (const pool of pools) {
  const t0 = performance.now();
  const x = m.renderEndMusic(pool, 0, SR);
  const ms = performance.now() - t0;
  const s = analyze(x, SR);
  const dbfs = (v) => (20 * Math.log10(v)).toFixed(1);
  console.log(`${pool}: ${(x.length / SR).toFixed(1)} s, peak ${s.peak.toFixed(3)}, active rms ${dbfs(s.activeRms)} dB, centroid ${s.centroid | 0} Hz, bands ${s.bandFrac.map((b) => Math.round(b * 100)).join('/')}, dc ${s.dc.toFixed(4)}, rendered in ${(ms / 1000).toFixed(1)} s`);
  // loudness every 10 s: the shape of the piece
  const prof = [];
  for (let t = 0; t + 10 <= x.length / SR; t += 10) {
    let e = 0;
    const a = Math.round(t * SR), b = Math.round((t + 10) * SR);
    for (let i = a; i < b; i++) e += x[i] * x[i];
    prof.push(dbfs(Math.sqrt(e / (b - a)) + 1e-9));
  }
  console.log('  rms per 10 s:', prof.join(' '));
  check(`${pool}: no NaN, no clipping`, !s.nan && !s.clip);
  // (the pool pieces are levelled by loudness, capped at the music's peak: as the Nether's and the End's own)
  const want = pool === 'music.credits' ? 0.09 : 0.105;
  check(`${pool}: levelled like the other pool pieces`, s.peak <= 0.601 && Math.abs(20 * Math.log10(s.activeRms / want)) < 1, `peak ${s.peak.toFixed(3)} rms ${dbfs(s.activeRms)} dB`);
  check(`${pool}: no DC`, Math.abs(s.dc) < 0.005);
  const tail = x.subarray(x.length - Math.round(SR * 0.05));
  let tp = 0;
  for (const v of tail) tp = Math.max(tp, Math.abs(v));
  check(`${pool}: fades out at the end`, tp < 0.01, tp.toFixed(4));
  check(`${pool}: no silent stretch inside (every 10 s above -50 dB)`, prof.slice(0, -1).every((d) => +d > -50));
  if (process.argv.includes('--wav')) writeWav(`tmp/end/${pool}.wav`, x, SR);
}
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
