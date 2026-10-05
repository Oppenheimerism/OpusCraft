// Guests under load (a basalt delta's crowd of magma cubes): what a guest's game works out for itself isn't sent it,
// as vanilla's client works it out for itself (a slime's squish, a blaze's smoke and its burning, an enderman's portal
// specks, a dragon's breath's puffs, a hurt mob's flash running out), so a crowd of 48 magma cubes costs a guest tens of
// packets a second, not a thousand; and a guest that falls behind (its connection, or its game, not keeping up) is
// sent only what can't wait till it catches up, then how everything looks afresh, rather than being let go when what
// waits for it overflows. The guest that keeps up meanwhile is sent everything, as ever.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, check, exitWithStatus, SETTLE } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/entity/monsters.ts', '/src/entity/animals.ts', '/src/entity/areaEffectCloud.ts']);
const CBN = new Map(Object.entries(m.CB).map(([k, v]) => [v, k]));

// (what the host and the guests say in the console: this suite's to read)
const said = [];
const info = console.info;
console.info = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('multiplayer:')) said.push(args[0]);
  else info(...args);
};

const host = flatHost(m, 6, { guestGameMode: 'creative', gameMode: 'creative' });
const lvl = host.level;
lvl.difficulty = 'normal';
lvl.dayTime = 18000;
const a = makeGuest(host, 'Alex', { viewDistance: 4 });
step(host, 40);
const sessionOf = (g) => host.server.sessionOf(hostCopy(host, g));

/** what the host sends each guest from now on, by guest name: messages, bytes, packets by kind and by entity */
const meters = new Map();
let hostTicks = 0;
{
  const tick = host.server.tick.bind(host.server);
  host.server.tick = () => {
    hostTicks++;
    return tick();
  };
  const t = host.server.transport, send = t.send.bind(t);
  t.send = (peer, bytes) => {
    for (const [name, st] of meters) {
      if (sessionOf(st.g)?.peer !== peer) continue;
      st.messages++;
      st.bytes += bytes.length;
      for (const p of m.decode(bytes, 1 << 30)) {
        const n = CBN.get(p[0]) ?? String(p[0]);
        st.kinds.set(n, (st.kinds.get(n) ?? 0) + 1);
        if (n === 'SetEntityData') for (const f of Object.keys(p[2])) st.fields.push([p[1], f]);
        if (n === 'LevelParticles') st.particles.push(p[1] === 'spawn' ? p[2]?.[0] : p[1]);
      }
      void name;
    }
    return send(peer, bytes);
  };
}
function meter(g) {
  const st = { g, messages: 0, bytes: 0, kinds: new Map(), fields: [], particles: [], from: hostTicks };
  meters.set(g.name, st);
  return {
    st,
    /** a kind's packets a second (at the game's 20 ticks a second) */
    rate: (kind) => ((st.kinds.get(kind) ?? 0) * 20) / Math.max(1, hostTicks - st.from),
    perSecond: () => ([...st.kinds.values()].reduce((x, y) => x + y, 0) * 20) / Math.max(1, hostTicks - st.from),
    bytesPerSecond: () => (st.bytes * 20) / Math.max(1, hostTicks - st.from),
    count: (kind) => st.kinds.get(kind) ?? 0,
    reset() {
      st.messages = st.bytes = 0;
      st.kinds.clear();
      st.fields.length = st.particles.length = 0;
      st.from = hostTicks;
    },
  };
}

/** a mob of `kind` at (x, z), kept */
function spawn(kind, x, z, y = 64) {
  const e = m.createMob(kind, lvl);
  e.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  e.persistenceRequired = true;
  lvl.addEntity(e);
  return e;
}

// ---------------------------------------------------------------------------
// a basalt delta's crowd round a guest: 48 magma cubes, and a fortress's blazes and a warped forest's endermen
const cubes = [], blazes = [], endermen = [];
for (let i = 0; i < 48; i++) {
  const ang = (i / 48) * Math.PI * 2, d = 5 + (i % 4) * 3;
  cubes.push(spawn('magma_cube', Math.round(Math.cos(ang) * d), Math.round(Math.sin(ang) * d)));
}
for (let i = 0; i < 4; i++) blazes.push(spawn('blaze', -12 + i * 8, 14));
for (let i = 0; i < 4; i++) endermen.push(spawn('enderman', -12 + i * 8, -14));
step(host, 60);
{
  const ma = meter(a);
  const n0 = a.level.particleCalls.length;
  let squished = 0;
  const tickCopies = [];
  for (let t = 0; t < 200; t++) {
    step(host, 1);
    for (const c of cubes) if (Math.abs(copyOf(a, c)?.squish ?? 0) > 0.01) squished++;
  }
  for (const c of cubes) tickCopies.push(Math.abs((copyOf(a, c)?.tickCount ?? -1e9) - c.tickCount));
  const calls = a.level.particleCalls.slice(n0), named = (n) => calls.filter((x) => x.args[0] === n).length;
  const secs = (hostTicks - ma.st.from) / 20;
  const cubeData = ma.st.fields.filter(([id]) => cubes.some((c) => c.id === id)).length;
  console.log(`(the crowd: ${ma.perSecond().toFixed(0)} packets a second, ${(ma.bytesPerSecond() / 1024).toFixed(1)} KiB a second, ${ma.rate('SetEntityData').toFixed(1)} of them SetEntityData, ${ma.rate('LevelParticles').toFixed(1)} LevelParticles)`);
  check('crowd: the magma cubes\' squish isn\'t sent (vanilla\'s client works it out), so their data comes seldom, not each tick', cubeData / secs / cubes.length < 0.5, `${(cubeData / secs).toFixed(1)} fields a second for ${cubes.length}`);
  check('crowd: no particles are sent for what the guest\'s copies make themselves (blazes\' smoke, endermen\'s specks, cubes landing)', ma.count('LevelParticles') === 0, String(ma.count('LevelParticles')));
  check('crowd: 48 magma cubes, 4 blazes and 4 endermen cost the guest under 200 packets a second (were over 1000) and under 12 KiB', ma.perSecond() < 200 && ma.bytesPerSecond() < 12 * 1024, `${ma.perSecond().toFixed(0)}/s, ${(ma.bytesPerSecond() / 1024).toFixed(1)} KiB/s`);
  check('crowd: the guest\'s copies squish as they hop and land (worked out from their moves)', squished > 50, String(squished));
  check('crowd: the copies\' landings splash flame specks on the guest', named('flame') > 0, String(named('flame')));
  check('crowd: each blaze\'s copy smokes on the guest, two puffs a tick as on the host', named('large_smoke') >= blazes.length * 2 * 190, `${named('large_smoke')} for ${blazes.length} blazes`);
  check('crowd: each enderman\'s copy trails portal specks on the guest, two a tick', named('portal') >= endermen.length * 2 * 190, `${named('portal')} for ${endermen.length}`);
  check('crowd: and the blazes burn now and then, a sound the guest\'s copies make', a.level.sounds.some((s) => s.name === 'entity.blaze.burn'));
  check('crowd: the host still sees its own smoke and specks', lvl.particleCalls.some((x) => x.args[0] === 'large_smoke') && lvl.particleCalls.some((x) => x.args[0] === 'portal'));
  check('crowd: each copy counts its age from the host\'s, so animations the host starts at an age play on time', tickCopies.every((d) => d <= 3 + SETTLE), tickCopies.join(','));
}

// ---------------------------------------------------------------------------
// a hurt mob's flash: sent as it starts, counted down by the copy (vanilla's hurtTime, which its client counts down)
{
  const ma = meter(a);
  const c = cubes[0];
  const copy = copyOf(a, c);
  // (what the copy shows each of the guest's ticks)
  const seen = [];
  const animate = copy.animateMirror.bind(copy);
  copy.animateMirror = () => {
    animate();
    seen.push(copy.hurtTime);
  };
  c.hurt(0.5, 'generic');
  step(host, 14);
  const first = Math.max(...seen), from = seen.indexOf(first);
  seen.splice(0, from);
  const sent = ma.st.fields.filter(([id, f]) => id === c.id && f === 'hurtTime').length;
  check('hurt: the copy flashes red as the host\'s mob is hurt', first >= 8 && first <= 10, String(first));
  check('hurt: the flash runs out on the copy as on the host, a tick at a time', seen.at(-1) === 0 && seen.every((v, i) => i === 0 || v <= seen[i - 1]), seen.join(','));
  check('hurt: its hurtTime was sent once, as it started, not each tick of the count', sent === 1, String(sent));
}

// ---------------------------------------------------------------------------
// a dragon's breath: its puffs the copy's own (vanilla AreaEffectCloud.clientTick runs on each client)
{
  const ma = meter(a);
  const cloud = new m.AreaEffectCloud(lvl, 2.5, 64, 2.5);
  cloud.radius = 3;
  cloud.duration = 1000;
  lvl.addEntity(cloud);
  const n0 = a.level.particleCalls.length;
  step(host, 40);
  const puffs = a.level.particleCalls.slice(n0).filter((x) => x.args[0] === 'dragon_breath').length;
  const sent = ma.st.particles.filter((x) => x === 'dragon_breath').length;
  check('breath: the cloud\'s puffs are made by the guest\'s copy (none sent: were 580 a second for one cloud)', puffs > 500 && sent === 0, `${puffs} puffs, ${sent} sent`);
  cloud.remove();
}

// ---------------------------------------------------------------------------
// a guest falls behind: its game stops taking what the host sends (a stall, or a connection that can't keep up), and
// the host, its pings unanswered, sends it only what can't wait; once it takes it all again it's sent how everything
// looks now, and is where the host's world is
const b = makeGuest(host, 'Bea', { viewDistance: 4 });
step(host, 60);
const sheep = spawn('sheep', 3, -3);
const pigWas = spawn('pig', -3, 3);
step(host, 20);
{
  const sb = sessionOf(b), sa = sessionOf(a);
  check('slow: two guests that keep up are neither of them behind', !sb.slow && !sa.slow);
  // (Bea's game stops: what the host sends her waits for her, unread)
  host.guests.splice(host.guests.indexOf(b), 1);
  step(host, 60);
  check('slow: not behind yet, three seconds on (a slow tick or a hiccup isn\'t falling behind)', !sb.slow);
  const mb = meter(b), ma = meter(a);
  step(host, 60);
  check('slow: past five seconds unanswered, the host takes her for behind', sb.slow && said.some((s) => /Bea is .* behind/.test(s)), said.join(' | '));
  check('slow: and doesn\'t let her go', sb.state === 'play' && !b.disconnected);
  mb.reset();
  ma.reset();
  // (meanwhile the world goes on: a sheep dyed, a cube taken far off, another gone, a pig come, a blaze hurt)
  sheep.color = 11;
  const moved = cubes[1];
  moved.moveTo(20.5, 64, 20.5, 90, 0);
  const goneCube = cubes[2];
  goneCube.remove();
  pigWas.remove();
  const pig = spawn('pig', -6, 6);
  blazes[0].hurt(2, 'generic');
  step(host, 40);
  const quiet = ['MoveEntity', 'SetEntityData', 'LevelParticles', 'Sound', 'LevelChunk', 'AddEntity'].filter((k) => mb.count(k) > 0);
  check('slow: while she\'s behind she\'s sent nothing of where things are or how they look, nor sounds and specks', quiet.length === 0, quiet.map((k) => `${k} ${mb.count(k)}`).join(', '));
  check('slow: a few small messages a second at most (the time, the pings), not a crowd\'s', mb.st.messages * 20 / Math.max(1, hostTicks - mb.st.from) <= 4 && mb.bytesPerSecond() < 300, `${mb.st.messages} messages, ${mb.st.bytes} bytes in 40 ticks`);
  check('slow: the guest that keeps up is sent it all meanwhile', !sa.slow && ma.count('MoveEntity') > 0 && ma.st.fields.some(([id, f]) => id === sheep.id && f === 'color'));
  check('slow: her game hasn\'t been flooded either (what waits for her is small)', b.session.inbox.length < 400 && !b.session.flooded, String(b.session.inbox.length));
  // (her game goes on)
  host.guests.push(b);
  let caught = -1;
  for (let i = 0; i < 100 && caught < 0; i++) {
    step(host, 1);
    if (!sb.slow) caught = i;
  }
  step(host, 10);
  check('slow: she catches up within a second or two of her game going on, and is told so', caught >= 0 && caught <= 40 + SETTLE * 2 && said.some((s) => /Bea has caught up/.test(s)), String(caught));
  check('slow: she was never let go', sb.state === 'play' && !b.disconnected && b.session.state === 'play');
  const sheepCopy = copyOf(b, sheep), movedCopy = copyOf(b, moved);
  check('slow: afterwards her copy of the dyed sheep has its new colour', sheepCopy?.color === 11, String(sheepCopy?.color));
  check('slow: the cube taken off is where the host has it', movedCopy && Math.abs(movedCopy.x - moved.x) < 0.5 && Math.abs(movedCopy.z - moved.z) < 0.5, movedCopy ? `${movedCopy.x},${movedCopy.z} vs ${moved.x},${moved.z}` : 'none');
  check('slow: what went while she was behind is gone from her world, and what came is there', !copyOf(b, goneCube) && !copyOf(b, pigWas) && !!copyOf(b, pig));
  const off = [];
  for (const e of lvl.entities) {
    if (e.type === 'player' || e.removed || !sb.tracker.has(e)) continue;
    const c = copyOf(b, e);
    if (!c) off.push(`${e.type} ${e.id}: none`);
    else if (Math.abs(c.x - e.x) > 1 || Math.abs(c.z - e.z) > 1 || (e.size !== undefined && c.size !== e.size) || Math.abs((c.health ?? 0) - (e.health ?? 0)) > 0.01) off.push(`${e.type} ${e.id}`);
  }
  check('slow: every entity she\'s shown is where the host has it, and as it is (size, health)', off.length === 0, off.slice(0, 6).join('; '));
  check('slow: and the guest that kept up was never behind', !sa.slow && !said.some((s) => /Alex is .* behind/.test(s)));
}

host.server.close('done');
exitWithStatus(close);
