// The End Poem and guests (vanilla ServerPlayer.showEndCredits, WinScreen, PERFORM_RESPAWN → PlayerList.respawn(player,
// true)). The host going home through the End's exit portal takes its guests along, as it takes them everywhere; before,
// its arrival waited for its own poem and its guests sat on "Loading terrain..." for all of it. Now, in a world open to
// LAN, the world goes on as vanilla's server does: home comes in behind the host's poem and the host's player is put
// there, out of the level till its poem is over (vanilla's is out of every level: not among the players, not ticking,
// not hurt, not seen), while each guest taken along that hasn't seen the poem gets its own, and comes home when its own
// is over or skipped: at its bed or by the world spawn, keeping everything (vanilla's respawn after the credits). A guest
// that has seen it, or is dead, comes in with the host. Nobody waits on anyone else's poem, and nobody times out.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, step, stepIdle, hostChangeDimension, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/game/endTravel.ts', '/src/game/sleep.ts', '/src/game/respawnLogic.ts']);

const saved = new Map();
let host = null;
/** where a guest comes back with no bed, as Game.guestSpawnPoint has it: by the world spawn in the Overworld, else by the host */
const SPAWN = [0.5, 64, 0.5];
const spawnPoint = () => (host.world.dim.id === 'overworld' ? [...SPAWN] : [host.player.x, host.player.y, host.player.z]);
host = flatHost(m, 4, { guestGameMode: 'survival', gameMode: 'survival', hooks: { spawnPoint, saveGuest: (uuid, d) => saved.set(uuid, d) } });
const lvl = host.level, hp = host.player;

// (what each guest's game says on its loading screen when it asks for the world again, and the host when asked)
const asking = [];
const warn = console.warn;
console.warn = (...a) => {
  if (typeof a[0] === 'string' && a[0].includes('loading screen')) asking.push(a[0]);
  else warn(...a);
};

/** the host's world has the chunks in [cx0, cx1] x [cz0, cz1] (the new dimension's round the host, as its game loads them) */
function fill(cx0, cz0, cx1, cz1) {
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) if (!lvl.world.getChunk(cx, cz)) host.makeChunk(cx, cz);
}
const near = (p, x, z, r = 1e-6) => Math.hypot(p.x - x, p.z - z) < r;

const NAMES = ['Alex', 'Bea', 'Cleo', 'Dee', 'Eve', 'Fay'];
const G = {}, H = {}, S = {};
for (const n of NAMES) G[n] = makeGuest(host, n);
step(host, 40);
for (const n of NAMES) {
  H[n] = hostCopy(host, G[n]);
  S[n] = host.server.sessionOf(H[n]);
}
check('(six guests in)', NAMES.every((n) => S[n]?.state === 'play'));

// to the End, everyone
hostChangeDimension(host, 'the_end', 100.5, 65, 0.5, 'end_portal');
stepIdle(host, 3);
fill(4, -3, 8, 3);
host.server.hostArrived();
step(host, 20);
check('(everyone in the End)', NAMES.every((n) => G[n].world.dim.id === 'the_end' && !S[n].travelling) && lvl.world.dim.id === 'the_end');

// Bea has been through the exit portal before; Dee dies; Alex carries a few things, and has a bed far off
H.Bea.seenCredits = true;
H.Dee.hurt(100, 'genericKill');
const DIAMONDS = m.ItemStack.of('diamond', 5);
H.Alex.inventory.main[3] = DIAMONDS.copy();
H.Alex.inventory.version++;
H.Alex.xpLevel = 7;
H.Alex.health = 15;
const BX = 200, BZ = 200;
H.Alex.respawnPos = [BX, 64, BZ + 1];
H.Alex.respawnForced = false;
step(host, 5);
check('(Dee dead)', H.Dee.health === 0 && G.Dee.player.health === 0);

// (the far bed's chunks held back till `loadBed`: the respawn's ticket for them noted)
const asked = [];
let holdBed = true;
const setTicket = host.server.hooks.setTicket;
host.server.hooks.setTicket = (name, t) => {
  if (name.startsWith('respawn:') && t) {
    asked.push(name);
    if (holdBed) return;
  }
  setTicket(name, t);
};
function loadBed() {
  holdBed = false;
  for (let cz = (BZ >> 4) - 1; cz <= (BZ >> 4) + 1; cz++) for (let cx = (BX >> 4) - 1; cx <= (BX >> 4) + 1; cx++) lvl.world.getChunk(cx, cz) || host.makeChunk(cx, cz);
  lvl.world.setState(BX, 64, BZ, m.S('red_bed', { part: 'foot', facing: 'south' }));
  lvl.world.setState(BX, 64, BZ + 1, m.S('red_bed', { part: 'head', facing: 'south' }));
}

// (the host's own game, on a stand-in: Game.changeDimension's part on the level, its screens, its arrival)
let arrive = null, screen = null, spawned = true;
const changed = [];
const game = {
  world: host.world, level: lvl, player: hp, server: host.server, worldSpawn: [0, 64, 0], meta: { gameMode: 'survival' },
  get spawned() {
    return spawned;
  },
  sound: { playUI() {} },
  changeDimension(dim, x, y, z, a, portal) {
    hostChangeDimension(host, dim.id, x, y, z, portal ? 'end_portal' : 'other');
    arrive = a;
    spawned = false;
  },
  setScreen: (s) => (screen = s),
  winScreenFactory: (done) => ({ kind: 'win', done }),
  receivingScreenFactory: (r) => ({ kind: 'receiving ' + r }),
  teleport: (x, y, z, yaw, pitch) => hp.moveTo(x, y, z, yaw, pitch),
  chat() {},
  onChangedDimension: (a, b) => changed.push(`${a.id}>${b.id}`),
  chunks: { setTicket() {}, setCenter() {} },
};
const progressOf = {};
for (const n of NAMES) {
  progressOf[n] = [];
  const f = S[n].progress.changedDimension.bind(S[n].progress);
  S[n].progress.changedDimension = (from, to, p) => {
    progressOf[n].push(`${from}>${to}`);
    return f(from, to, p);
  };
}

// ---------------------------------------------------------------------------
// the host through the exit portal for the first time: its poem over the loading, everyone taken along, and those of
// the guests alive that haven't seen it get theirs

const dims0 = Object.fromEntries(NAMES.map((n) => [n, G[n].dims.length]));
m.endPortalTravel(game, hp);
check('the host: seen now, out of the End at once, its poem over the loading', hp.seenCredits === true && lvl.world.dim.id === 'overworld' && screen?.kind === 'win');
check('...and out of the level till its poem is over (a world open to LAN goes on meanwhile)', hp.wonGame === true);
stepIdle(host, 4);
check('every guest taken along, with the end portal\'s stars', NAMES.filter((n) => n !== 'Fay' || true).every((n) => G[n].dims.length === dims0[n] + 1 && G[n].dims.at(-1).join() === 'overworld,end_portal'));
check('the guests alive that haven\'t seen the poem get theirs (Alex, Cleo, Eve, Fay)', ['Alex', 'Cleo', 'Eve', 'Fay'].every((n) => G[n].poems === 1 && H[n].seenCredits === true), NAMES.map((n) => `${n} ${G[n].poems}`).join(', '));
check('...not one that has seen it (Bea), nor a dead one (Dee)', G.Bea.poems === 0 && G.Dee.poems === 0 && H.Dee.seenCredits === false);

// Cleo skips hers at once, before the host is home itself
G.Cleo.session.creditsOver();
stepIdle(host, 3);
check('Cleo skips its poem before the host is home: it waits for the host, as it would have anyway', S.Cleo.travelling && G.Cleo.session.stillLoading && !lvl.entities.includes(H.Cleo));

// home is in: the host comes home with its poem still rolling
fill(-4, -4, 4, 4);
const home = arrive(game);
// (somewhere within the spawn radius of the world spawn, 10 blocks, as vanilla's adjustSpawnLocation has it)
check('home in, the host is put there at once, not waiting for its poem (still rolling)', home === true && screen?.kind === 'win' && hp.wonGame === true && Math.abs(hp.x - 0.5) <= 11 && Math.abs(hp.z - 0.5) <= 11, `${hp.x.toFixed(1)},${hp.z.toFixed(1)}`);
spawned = true;
host.server.hostArrived();
step(host, 10);
const t0 = lvl.gameTime, ticked0 = hp.tickCount, hy = hp.y;
check('Bea, who has seen it, comes in beside the host as always', !S.Bea.travelling && near(H.Bea, hp.x, hp.z) && near(G.Bea.player, hp.x, hp.z) && !G.Bea.session.stillLoading);
check('Dee comes along dead beside it, on its death screen as it was', !S.Dee.travelling && near(H.Dee, hp.x, hp.z) && H.Dee.health === 0 && G.Dee.player.health === 0);
check('Cleo, its poem skipped, is home by the world spawn (no bed), here and in its game', !S.Cleo.travelling && near(H.Cleo, SPAWN[0], SPAWN[2]) && near(G.Cleo.player, SPAWN[0], SPAWN[2]) && !G.Cleo.session.stillLoading);
check('...as a player keeping everything, and its trip from the End counted (advancements)', progressOf.Cleo.includes('the_end>overworld') && H.Cleo.health === 20);
check('Alex, Eve and Fay, still watching theirs, are out of the world: not put in, nothing sent them yet', ['Alex', 'Eve', 'Fay'].every((n) => S[n].travelling && !lvl.entities.includes(H[n]) && G[n].session.stillLoading && !progressOf[n].length));

// meanwhile the level goes on, and the host is out of it
step(host, 20);
check('meanwhile the level goes on for the guests', lvl.gameTime >= t0 + 20, `${lvl.gameTime - t0} ticks`);
check('...the host\'s player not in it: not among the players, nor the entities anything finds, nor nearest to anything', !lvl.players().includes(hp) && !lvl.getEntities(hp.bb.inflate(2)).includes(hp) && lvl.nearestPlayer(hp.x, hp.y, hp.z) !== hp);
check('...not ticking, not hurt', hp.tickCount === ticked0 && hp.y === hy && hp.hurt(6, 'mobAttack') === false && hp.health === hp.maxHealth);
check('...and gone from the guests\' worlds (as vanilla\'s is from its level)', !G.Bea.session.mirrors.has(hp.id) && !G.Cleo.session.mirrors.has(hp.id) && G.Bea.session.mirrors.has(H.Cleo.id));

// Fay leaves in the middle of hers: kept as it was where it was, the poem seen
G.Fay.session.leave();
step(host, 5);
const fay = saved.get(H.Fay.uuid);
check('Fay leaves in the middle of its poem: kept where it was in the End, the poem seen', S.Fay.state === 'gone' && fay?.dimension === 'the_end' && fay?.seenCredits === true, JSON.stringify({ dim: fay?.dimension, seen: fay?.seenCredits }));

// the End Poem's minutes: nobody times out, and nobody asks for the world again
step(host, 900);
check('a long poem (45 seconds here): nobody times out, both still watching', ['Alex', 'Eve'].every((n) => G[n].disconnected === null && S[n].state === 'play' && S[n].travelling) && G.Bea.disconnected === null);
check('...and nobody\'s loading screen asks for the world again meanwhile (it\'s not stuck, it\'s watching)', asking.length === 0, asking.join(' | '));

// ---------------------------------------------------------------------------
// Alex's poem over: home at its far bed, once the bed's chunks are in, keeping everything but its fire and its breath

H.Alex.remainingFireTicks = 100;
H.Alex.air = 20;
G.Alex.session.creditsOver();
step(host, 5);
check('Alex\'s poem over: its far bed\'s chunks asked for, waited for, out of the world meanwhile', asked.includes(`respawn:${H.Alex.id}`) && S.Alex.travelling && !lvl.entities.includes(H.Alex));
loadBed();
step(host, 20);
check('...once they\'re in, it\'s home beside its bed, here and in its game', !S.Alex.travelling && Math.hypot(H.Alex.x - (BX + 0.5), H.Alex.z - (BZ + 1.5)) < 2.5 && near(G.Alex.player, H.Alex.x, H.Alex.z) && !G.Alex.session.stillLoading, `${H.Alex.x.toFixed(1)},${H.Alex.z.toFixed(1)} guest ${G.Alex.player.x.toFixed(2)},${G.Alex.player.z.toFixed(2)} loading ${G.Alex.session.stillLoading}`);
check('...keeping everything: what it carried, its levels, its health (healing since as ever, not a new player\'s 20)', m.stackKey(H.Alex.inventory.main[3]) === m.stackKey(DIAMONDS) && H.Alex.xpLevel === 7 && H.Alex.health >= 15 && H.Alex.health < 20 && m.stackKey(G.Alex.player.inventory.main[3]) === m.stackKey(DIAMONDS), `health ${H.Alex.health}`);
check('...but its fire and its breath, as a new player\'s (vanilla respawn after the credits)', H.Alex.remainingFireTicks === 0 && H.Alex.air === 300);
check('...its bed still its own, and its trip from the End counted', H.Alex.respawnPos?.join() === `${BX},64,${BZ + 1}` && progressOf.Alex.join() === 'the_end>overworld');

// ---------------------------------------------------------------------------
// the host's poem over: back in the level where home put it, for everyone to see

const at = [hp.x, hp.y, hp.z].join();
screen.done();
check('the host\'s poem over: back in the level, the poem gone (not "Loading terrain...": home is in)', hp.wonGame === false && screen === null && [hp.x, hp.y, hp.z].join() === at);
step(host, 5);
check('...among the players again, ticking, and back in the guests\' worlds', lvl.players().includes(hp) && hp.tickCount > ticked0 && G.Bea.session.mirrors.has(hp.id) && G.Alex.session.mirrors.has(hp.id) === Math.hypot(H.Alex.x - hp.x, H.Alex.z - hp.z) < 3 * 16);
check('...its trip home counted, once', changed.join() === 'the_end>overworld');

// ---------------------------------------------------------------------------
// Eve still watching when the host goes on to the Nether: taken along again (its poem rolling on), and home is then
// beside the host there

const evePoems = G.Eve.poems, eveDims = G.Eve.dims.length;
hostChangeDimension(host, 'the_nether', 8.5, 65, 8.5, 'nether_portal');
stepIdle(host, 3);
fill(-3, -3, 3, 3);
host.server.hostArrived();
step(host, 10);
check('the host goes on to the Nether while Eve watches: Eve taken along, its poem not started again, still out', G.Eve.dims.length === eveDims + 1 && G.Eve.dims.at(-1)[0] === 'the_nether' && G.Eve.poems === evePoems && S.Eve.travelling && !lvl.entities.includes(H.Eve));
check('...the others in beside the host', ['Alex', 'Bea', 'Cleo'].every((n) => !S[n].travelling && near(H[n], 8.5, 8.5)));
G.Eve.session.creditsOver();
step(host, 20);
check('Eve\'s poem over: in beside the host in the Nether, here and in its game', !S.Eve.travelling && near(H.Eve, hp.x, hp.z) && near(G.Eve.player, hp.x, hp.z) && G.Eve.world.dim.id === 'the_nether' && !G.Eve.session.stillLoading, `host ${hp.x},${hp.z} copy ${H.Eve.x},${H.Eve.z} guest ${G.Eve.player.x},${G.Eve.player.z} loading ${G.Eve.session.stillLoading} ${S.Eve.travelling}`);
check('...its trip from the End counted where it came in', progressOf.Eve.join() === 'the_end>the_nether');
check('nobody dropped, all along', ['Alex', 'Bea', 'Cleo', 'Dee', 'Eve'].every((n) => G[n].disconnected === null && S[n].state === 'play'));

host.server.hooks.setTicket = setTicket;
console.warn = warn;
exitWithStatus(close);
