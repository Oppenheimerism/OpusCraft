// The title screen's music (vanilla Musics.MENU): whole pieces, one picked at random each time, with 1 to 30 s of
// quiet between them (20..600 ticks), not a few seconds of one piece over and over. Each piece the audio worker makes
// is rendered to tmp/menu-<n>.wav, checked for its length and, by the autocorrelation of its loudness, for not being a
// short phrase repeated; then the SoundManager is run through half an hour on the title screen with a stand-in for Web
// Audio and the worker (a piece takes 2 s to render), watching what it plays and when.

import { writeFileSync, mkdirSync } from 'node:fs';
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

let failed = 0;
function check(name, cond, detail = '') {
  console.log(cond ? `ok   ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// (the SoundManager listens for the first click or key on the window)
globalThis.window = { addEventListener() {} };
// (the blocks first, as the game loads them: the sound manager's ambience reads the block registry)
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/audio/synth.ts', '/src/audio/gen/music.ts', '/src/audio/soundManager.ts']);
const [, synth, music, { SoundManager }] = mods;
const SR = 44100;

// ---------------------------------------------------------------------------------------------------------------
// the pieces, as the worker makes them

/** 16-bit mono WAV */
function wav(data, sr) {
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2);
  return buf;
}

/** loudness every 20 ms */
function envelope(data, sr) {
  const hop = Math.round(sr * 0.02), out = new Float64Array(Math.floor(data.length / hop));
  for (let f = 0; f < out.length; f++) {
    let s = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) s += data[i] * data[i];
    out[f] = Math.sqrt(s / hop);
  }
  return out;
}

/** the highest normalized autocorrelation of the loudness at lags of 0.5 to 30 s, and where */
function maxAutocorrelation(env) {
  const n = env.length;
  let mean = 0;
  for (const v of env) mean += v;
  mean /= n;
  const x = env.map((v) => v - mean);
  let best = -1, at = 0;
  for (let lag = 25; lag <= Math.min(1500, n >> 1); lag++) {
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i + lag < n; i++) {
      sxy += x[i] * x[i + lag];
      sxx += x[i] * x[i];
      syy += x[i + lag] * x[i + lag];
    }
    const r = sxy / Math.sqrt(sxx * syy);
    if (r > best) [best, at] = [r, lag * 0.02];
  }
  return [best, at];
}

const count = synth.MENU_MUSIC_COUNT;
check(`several title-screen pieces, one picked each time (${count}: ${music.MENU_TRACK_NAMES.join(', ')})`, count >= 4);
const scores = music.checkScores().filter((s) => music.MENU_TRACK_NAMES.includes(s.name));
check('every piece\'s melody fills its bars', scores.every((s) => s.misaligned === 0), JSON.stringify(scores));
mkdirSync('tmp', { recursive: true });
let loopR = 0;
for (let i = 0; i < count; i++) {
  const t0 = performance.now();
  const data = synth.generateMenuMusic(i, SR);
  const ms = performance.now() - t0;
  const file = `tmp/menu-${i}.wav`;
  writeFileSync(file, wav(data, SR));
  const secs = data.length / SR;
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const [r, lag] = maxAutocorrelation(envelope(data, SR));
  console.log(`     ${file}: ${music.MENU_TRACK_NAMES[i]}, ${secs.toFixed(1)} s, peak ${peak.toFixed(2)}, rendered in ${(ms / 1000).toFixed(1)} s; loudness autocorrelation at most ${r.toFixed(2)} (at ${lag.toFixed(2)} s)`);
  check(`${music.MENU_TRACK_NAMES[i]}: a whole piece, 90 s or more`, secs >= 90, `${secs.toFixed(1)} s`);
  check(`${music.MENU_TRACK_NAMES[i]}: no short phrase repeated (autocorrelation ${r.toFixed(2)} under 0.9)`, r < 0.9);
  check(`${music.MENU_TRACK_NAMES[i]}: not clipping (peak ${peak.toFixed(2)})`, peak <= 1);
  if (i === 0) {
    // what the old title screen sounded like: its first 2.5 s over and over — the check sees that at once
    const clip = data.subarray(0, Math.round(2.5 * SR)), looped = new Float32Array(data.length);
    for (let k = 0; k < looped.length; k++) looped[k] = clip[k % clip.length];
    loopR = maxAutocorrelation(envelope(looped, SR))[0];
  }
}
check(`(the check itself: the first 2.5 s looped scores ${loopR.toFixed(2)})`, loopR > 0.95);

// ---------------------------------------------------------------------------------------------------------------
// the SoundManager on the title screen for half an hour

{
  let now = 0;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
  const sm = new SoundManager();
  const LENGTH = 100; // seconds each stand-in piece lasts
  const sources = [], requests = [], waiting = [];
  sm.ctx = {
    createBuffer: (_c, len, sr) => ({ duration: len / sr, copyToChannel() {} }),
    createBufferSource() {
      const s = { buffer: null, onended: null, connect: (g) => g, start() { s.at = now; sources.push(s); }, stop() { s.stoppedAt = now; } };
      return s;
    },
    createGain: () => ({ gain: { value: 0 }, connect: (x) => x }),
  };
  sm.master = {};
  sm.menuCount = count;
  // (the worker: each piece arrives 2 s after it's asked for)
  sm.request = (msg) => new Promise((resolve) => {
    requests.push({ ...msg, t: now });
    waiting.push({ at: now + 2000, resolve: () => resolve(new Float32Array(LENGTH * 44100)) });
  });
  const opts = { musicVolume: 1 };
  for (let frame = 0; now < 30 * 60 * 1000; frame++) {
    now += 1000 / 60;
    for (let i = waiting.length - 1; i >= 0; i--) if (now >= waiting[i].at) waiting.splice(i, 1)[0].resolve();
    await new Promise((r) => setImmediate(r));
    for (const s of sources) if (!s.ended && !s.stoppedAt && now >= s.at + LENGTH * 1000) { s.ended = true; s.onended?.(); }
    sm.menuMusic(opts);
  }
  const cutShort = sources.filter((s) => s.stoppedAt !== undefined && s.stoppedAt < s.at + LENGTH * 1000);
  const gaps = [];
  for (let i = 1; i < sources.length; i++) gaps.push((sources[i].at - (sources[i - 1].at + LENGTH * 1000)) / 1000);
  const idx = requests.map((r) => r.index);
  console.log(`     30 min on the title screen: ${sources.length} pieces (${idx.join(' ')}), first after ${(sources[0]?.at / 1000).toFixed(1)} s; quiet between them ${gaps.map((g) => g.toFixed(1)).join(', ')} s`);
  check('the first piece starts about 5 s in (100 ticks, then 2 s to render it)', sources[0] && Math.abs(sources[0].at / 1000 - 7) < 0.5, String(sources[0]?.at));
  const asked = requests.filter((r) => r.t + 2000 < now).length;
  check('no piece is cut short or started again while it plays', cutShort.length === 0 && asked === sources.length, `${cutShort.length} cut short, ${asked} asked for`);
  check('between pieces, 1 to 30 s of quiet (20..600 ticks, plus the 2 s render)', gaps.length > 0 && gaps.every((g) => g >= 1 + 2 - 0.1 && g <= 30 + 2 + 0.1), gaps.join(', '));
  check('a piece picked at random each time', new Set(idx).size > 1);
  // leaving for a world and coming back: the game's music there is cut off for the menu's, which comes straight away
  sm.musicPlaying = true;
  sm.musicPool = null;
  const before = requests.length;
  let t = now;
  while (requests.length === before && now < t + 2000) {
    now += 1000 / 60;
    sm.menuMusic(opts);
    await new Promise((r) => setImmediate(r));
  }
  check('back on the title screen, other music gives way to the menu\'s within half a second', requests.length > before && now - t <= 600, `${(now - t).toFixed(0)} ms`);
}

await close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
