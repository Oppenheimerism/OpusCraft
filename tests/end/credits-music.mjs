// The End Poem's music (vanilla Musics.CREDITS) starts with the poem: once the dragon is dead, a player in the End who
// hasn't seen the credits has the piece rendered ahead, so the credits screen starts it at once (and again at once
// whenever it ends) instead of after the seconds it takes to render; it's let go when the credits close or the player
// leaves the End some other way, and never made for one who has seen them. The SoundManager is run with stand-ins
// for Web Audio and the audio worker (a piece takes 3 s to render), as tests/fixes/menu-music.mjs does.

import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

let failed = 0;
function check(name, cond, detail = '') {
  console.log(cond ? `ok   ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// (the SoundManager listens for the first click or key on the window)
globalThis.window = { addEventListener() {} };
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/audio/soundManager.ts']);
const { SoundManager } = mods[1];

let now = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
const LENGTH = 240; // seconds the stand-in piece lasts
const sm = new SoundManager();
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
sm.musicCount = 5;
sm.musicPools = { 'music.end': 1, 'music.dragon': 1, 'music.credits': 1 };
// (the worker: a piece arrives 3 s after it's asked for)
sm.request = (msg) => new Promise((resolve) => {
  requests.push({ ...msg, t: now });
  waiting.push({ at: now + 3000, resolve: () => resolve(new Float32Array(LENGTH * 44100)) });
});
// (what the game has round the player that doesn't matter here: no minecarts, no elytra, the End's own music)
sm.minecarts = { tick() {} };
sm.elytra = { tick() {} };
sm.biomeAmbience = { tick: () => true, music: () => (game.world.dim.id === 'the_end' ? 'music.end' : null) };
const game = {
  player: { x: 0, y: 64, z: 0, eyeHeight: 1.62, seenCredits: false },
  level: { dragonFight: { dragonKilled: false } },
  world: { dim: { id: 'the_end' }, getState: () => 1, getLight: () => 0 },
};
const credits = () => requests.filter((r) => r.pool === 'music.credits');
/** a game tick's worth of time: the worker's pieces arrive, pieces playing end, the game ticks (if `tick`) */
async function step(ms = 50, tick = true) {
  const end = now + ms;
  while (now < end) {
    now += 50;
    for (let i = waiting.length - 1; i >= 0; i--) if (now >= waiting[i].at) waiting.splice(i, 1)[0].resolve();
    await new Promise((r) => setImmediate(r));
    for (const s of sources) if (!s.ended && !s.stoppedAt && now >= s.at + LENGTH * 1000) { s.ended = true; s.onended?.(); }
    if (tick) sm.tick(game);
  }
}

// the fight: nothing made ahead
await step(10000);
check('while the dragon lives, the credits\' music isn\'t made', credits().length === 0);
// the dragon dies
game.level.dragonFight.dragonKilled = true;
await step(50);
check('the dragon dead, a player who hasn\'t seen the credits has their music made', credits().length === 1 && credits()[0].type === 'pool');
await step(10000);
check('...once', credits().length === 1);

// into the exit portal: the credits screen (the game doesn't tick while home loads beneath it)
game.player.seenCredits = true;
const n0 = sources.length;
sm.keepSituationalMusic('music.credits');
await step(0, false);
const first = sources[n0];
check('the credits screen starts it at once, without asking for it again', !!first && first.at === now && credits().length === 1, `${first?.at} ${now}`);
check('...cutting off whatever was playing', sources.slice(0, n0).every((s) => s.stoppedAt !== undefined || s.ended));
// (the credits screen keeps it going each frame)
for (let i = 0; i < 20 * LENGTH + 40; i++) {
  await step(50, false);
  sm.keepSituationalMusic('music.credits');
}
const again = sources.slice(n0 + 1);
check('when it ends it starts again at once, from the piece made ahead', again.length === 1 && again[0].at - (first.at + LENGTH * 1000) <= 50 && credits().length === 1, `${again.map((s) => s.at - first.at).join(' ')}`);
// the credits over
sm.stopSituationalMusic('music.credits');
check('the credits over, their music stops', sources.at(-1).stoppedAt !== undefined);
sm.keepSituationalMusic('music.credits');
check('...and is let go: wanted again, it\'s made again', credits().length === 2);
sm.stopSituationalMusic('music.credits');

// leaving the End another way: let go
game.player.seenCredits = false;
game.world.dim.id = 'the_end';
await step(5000);
const before = credits().length;
game.world.dim.id = 'overworld';
await step(50);
sm.keepSituationalMusic('music.credits');
check('a player who leaves the End some other way lets it go', credits().length === before + 1 && before >= 3, `${before}`);
sm.stopSituationalMusic('music.credits');

// someone who has seen them: nothing made ahead, and the credits' music as it always came
game.player.seenCredits = true;
game.world.dim.id = 'the_end';
const c0 = credits().length;
await step(10000);
check('nothing is made ahead for a player who has seen the credits', credits().length === c0);
const n1 = sources.length;
sm.keepSituationalMusic('music.credits');
await step(2950, false);
const early = sources.length - n1;
await step(100, false);
check('...whose credits (seen again by command, say) start as soon as the piece is made', early === 0 && sources.length - n1 === 1);

await close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
