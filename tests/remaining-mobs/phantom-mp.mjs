// Multiplayer checks for the phantom (node tests/remaining-mobs/phantom-mp.mjs; remaining mobs, milestone 2), over the
// multiplayer harness (tests/multiplayer/lib.mjs): a guest sees a phantom as the host has it (its size, its pitch, its
// wings in time with the host's) and hears its wingbeats; a guest who hasn't slept in three days draws phantoms of its
// own, which go for it and bite it; a guest can lie down in a bed with phantoms about, which puts its insomnia back to
// nothing; and a guest's time since rest is kept with its player when it leaves and is there again when it comes back.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, assertMirrorEquals, check, exitWithStatus } from '../multiplayer/lib.mjs';

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/entity/phantom.ts', '/src/game/phantomSpawner.ts', '/src/game/playerData.ts']);

const saved = new Map();
const host = flatHost(m, 4, { guestGameMode: 'survival', hooks: { saveGuest: (uuid, d) => saved.set(uuid, d), loadGuest: (uuid) => Promise.resolve(saved.get(uuid) ?? null) } });
const lvl = host.level;
lvl.doDaylightCycle = false;
lvl.dayTime = 18000;
lvl.difficulty = 'hard';
host.player.timeSinceRest = 0;
const later = () => new Promise((r) => setImmediate(r));
/** `n` ticks, with the tasks a read from the save needs between them */
async function settle(n = 1) {
  for (let i = 0; i < n; i++) {
    step(host);
    for (let j = 0; j < 4; j++) await later();
  }
}
let g = makeGuest(host, 'Alex', { viewDistance: 3 });
await settle(30);
let hg = hostCopy(host, g);
check('(the guest is in, in survival, at night)', !!hg && !!g.world && hg.gameMode === 'survival' && !lvl.isDay());
const phantoms = () => lvl.entities.filter((e) => e instanceof m.Phantom && !e.removed);

// ---------------------------------------------------------------------------
// seeing a phantom
{
  const ph = m.createMob('phantom', lvl);
  // (within 16 blocks of the guest: as far as a wingbeat carries)
  ph.moveTo(3.5, 72, 3.5, 0, 0);
  ph.finalizeSpawn('command');
  ph.setPhantomSize(3);
  ph.serverAiStep = () => {};
  lvl.addEntity(ph);
  step(host, 4);
  const c = copyOf(g, ph);
  check('a guest has a copy of the host\'s phantom, a phantom, as big as the host\'s (size 3)', c instanceof m.Phantom && c.size === 3 && Math.abs(c.width - 0.9 * 1.45) < 1e-6 && Math.abs(c.height - 0.5 * 1.45) < 1e-6, `${c?.size} ${c?.width}`);
  ph.pitch = 25;
  step(host, 3);
  check('...pitched as the host\'s is', Math.abs(c.pitch - 25) < 0.5, `${c.pitch}`);
  check('...its wings in time with the host\'s (the same beat: its offset, the world\'s time)', c.flapOffset === ph.flapOffset && Math.abs(c.flapTicks(0) - ph.flapTicks(0)) <= 1, `${c.flapTicks(0)} vs ${ph.flapTicks(0)}`);
  g.level.sounds.length = 0;
  g.level.particleCalls.length = 0;
  step(host, 60);
  const flaps = g.level.sounds.filter((s) => s.name === 'entity.phantom.flap').length;
  const specks = g.level.particleCalls.filter((p) => p.method === 'spawn' && p.args[0] === 'mycelium').length;
  check('...its wingbeats heard by the guest, the specks off its wingtips seen', flaps >= 1 && specks > 20, `${flaps} flaps, ${specks} specks`);
  assertMirrorEquals(host, g, 'with a phantom about');
  ph.remove();
  step(host, 3);
  check('...gone when it is', !copyOf(g, ph));
}

// ---------------------------------------------------------------------------
// a guest's insomnia draws phantoms, which go for it
{
  const p = g.player;
  p.flying = false;
  p.moveTo(6.5, 64, 3.5, 0, 0);
  step(host, 4);
  hg.timeSinceRest = 2000000000;
  const sp = new m.PhantomSpawner();
  let n = 0;
  for (let i = 0; i < 40 && !n; i++) {
    sp.nextTick = 0;
    n = sp.tick(lvl, true);
  }
  const got = phantoms();
  check('a guest awake for days out under the night sky: phantoms come, over it', n > 0 && got.length === n && got.every((e) => e.y >= Math.floor(hg.y) + 20 && Math.abs(e.x - hg.x) <= 11 && Math.abs(e.z - hg.z) <= 11), `${n} ${got.map((e) => `${e.x},${e.y},${e.z}`).join(' ')}`);
  step(host, 3);
  check('...the guest sees them', got.every((e) => copyOf(g, e) instanceof m.Phantom));
  for (const e of got.slice(1)) e.remove();
  const ph = got[0];
  const h0 = hg.health;
  let targeted = false;
  for (let i = 0; i < 600 && hg.health >= h0; i++) {
    step(host, 1);
    if (ph.target === hg) targeted = true;
    p.moveTo(6.5, 64, 3.5, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
  }
  step(host, 3);
  check('...one goes for the guest and bites it (6, on hard 9), the guest\'s game showing the hurt', targeted && hg.health === h0 - 9 && g.player.health === hg.health, `${targeted} ${h0} → ${hg.health}, the guest's ${g.player.health}`);
  // a guest lies down in a bed with phantoms about (they don't keep a player awake)
  lvl.setBlock(6, 64, 5, m.S('red_bed', { facing: 'north', part: 'head' }));
  lvl.setBlock(6, 64, 6, m.S('red_bed', { facing: 'north', part: 'foot' }));
  step(host, 3);
  const before = hg.timeSinceRest;
  const dx = 6.5 - 6.5, dy = 64.4 - (64 + p.eyeHeight), dz = 5.5 - 3.5;
  p.moveTo(6.5, 64, 3.5, (Math.atan2(dz, dx) * 180) / Math.PI - 90, (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI);
  step(host, 3);
  g.session.input(false, false, true, false);
  step(host, 1);
  g.session.input(false, false, false, false);
  step(host, 5);
  check('a guest can lie down in a bed with phantoms about: asleep, its insomnia gone', before > 2000000000 && hg.isSleeping() && hg.timeSinceRest === 0 && phantoms().length > 0, `${before} → ${hg.timeSinceRest}, asleep ${hg.isSleeping()}`);
  for (const e of phantoms()) e.remove();
  hg.stopSleeping();
  step(host, 5);
}

// ---------------------------------------------------------------------------
// a guest's time since rest, kept with its player
{
  hg.timeSinceRest = 123456;
  g.session.leave();
  await settle(3);
  const d = saved.get(m.offlinePlayerUuid('Alex'));
  check('a guest leaving: its time since rest kept with its player', d?.timeSinceRest >= 123456 && d.timeSinceRest < 123470, `${d?.timeSinceRest}`);
  g = makeGuest(host, 'Alex', { viewDistance: 3 });
  await settle(10);
  hg = hostCopy(host, g);
  check('...and there again when it comes back', hg && hg.timeSinceRest >= 123456 && hg.timeSinceRest < 123500, `${hg?.timeSinceRest}`);
}

await exitWithStatus(close);
