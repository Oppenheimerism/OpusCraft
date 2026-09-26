// M1: music disc Pigstep's song renders as a music pool of one: about vanilla's 149 s, no NaNs or clipping, peak at
// the music level, a fade at the end, a real beat (energy in the lows every beat), and the jukebox song entry.
// usage: node tests/bastions/m1c-pigstep.mjs [out.wav]
import { loadModules } from '../../scripts/load.mjs';
import { writeWav, analyze } from '../../scripts/audio-lib.mjs';
import { check, exitWithStatus } from './lib.mjs';

setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/audio/synth.ts', '/src/item/jukeboxSongs.ts', '/src/item/item.ts']);
const m = Object.assign({}, ...mods);
const SR = 44100;

check('pigstep pool listed', m.MUSIC_POOLS['music_disc.pigstep'] === 1);
const t0 = performance.now();
const x = m.generatePoolMusic('music_disc.pigstep', 0, SR);
const ms = performance.now() - t0;
const s = analyze(x, SR);
console.log(`dur ${s.dur.toFixed(1)} s, peak ${s.peak.toFixed(2)}, centroid ${s.centroid | 0} Hz, ${ms | 0} ms`);
check('length: the jukebox song\'s 149 s, near enough (the music running to its end)', s.dur > 147 && s.dur <= 149.5, `${s.dur}`);
check('no NaN', !s.nan);
check('no clipping', !s.clip);
check('peak within the music level', s.peak > 0.3 && s.peak <= 0.62, `${s.peak}`);
let tail = 0;
for (const v of x.subarray(x.length - Math.round(SR * 0.05))) tail = Math.max(tail, Math.abs(v));
check('fades out at the end', tail < 0.01, `${tail}`);
check('renders in under 10 s', ms < 10000, `${ms}`);
// the beat: energy below 150 Hz at the kick (bar starts in the groove) against halfway between
const BEAT = 60 / 83.5, BAR = BEAT * 4;
const lowEnergy = (t) => {
  const i0 = Math.round(t * SR), n = Math.round(0.08 * SR);
  let lp = 0, e = 0;
  for (let i = i0; i < i0 + n && i < x.length; i++) {
    lp += (x[i] - lp) * 0.02;
    e += lp * lp;
  }
  return e;
};
let on = 0, off = 0;
for (let bar = 5; bar < 11; bar++) {
  on += lowEnergy(bar * BAR);
  off += lowEnergy(bar * BAR + BEAT * 1.5);
}
check('a kick on the beat', on > off * 1.25, `${on.toFixed(3)} vs ${off.toFixed(3)}`);
const song = m.JUKEBOX_SONGS.music_disc_pigstep;
check('jukebox song entry', song && song.sound === 'music_disc.pigstep' && song.lengthSeconds === 149 && song.comparatorOutput === 13);
const disc = m.ITEMS.get('music_disc_pigstep');
check('the disc item: rare, one to a stack, its description', disc && disc.rarity === 'rare' && disc.maxStack === 1 && disc.lore?.[0] === 'Lena Raine - Pigstep');
const out = process.argv[2];
if (out) writeWav(out, x, SR);
await exitWithStatus(close);
