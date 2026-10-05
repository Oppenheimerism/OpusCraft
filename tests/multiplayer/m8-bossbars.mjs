// Guests' boss bars (vanilla ServerBossEvent and ClientboundBossEventPacket): every boss bar the host's world shows a
// player is shown to that player's guest too, whatever kind it is (game/bossBars.ts: the dragon's, a raid's, and any
// source added later, as the wither's will be), with its name, progress, colour, notches and the flags that darken the
// sky, play the boss music and close in the fog; only to the players the bar is for; changed as it changes (the guest's
// overlay sliding its progress along), and taken away when it goes. A host whose bars make no sense is left.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, step, stepIdle, hostChangeDimension, check, exitWithStatus, SETTLE } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/game/bossBars.ts', '/src/gui/bossOverlay.ts', '/src/game/endDragonFight.ts']);

const host = flatHost(m, 6, { guestGameMode: 'survival', gameMode: 'survival' });
const lvl = host.level;
const a = makeGuest(host, 'Alex', { viewDistance: 4 });
const b = makeGuest(host, 'Steve', { viewDistance: 4 });
step(host, 40);
const ha = hostCopy(host, a), hb = hostCopy(host, b);
/** what `g`'s own screen shows (gui/hud.ts: every bar shown to its player, its host's among them) */
const overlay = (g) => {
  const o = new m.BossHealthOverlay();
  o.update(m.bossBarsShownTo(g.level, g.player));
  return o;
};
const bars = (g) => m.bossBarsShownTo(g.level, g.player);
const sent = (g, id) => g.session.bossBars.size;

// ---------------------------------------------------------------------------
// any boss event: a source of bars added as the wither's would be, a purple bar that darkens the sky, for Alex only
{
  const wither = { name: 'Wither', color: 'purple', overlay: 'progress', progress: 1, playBossMusic: false, createWorldFog: false, darkenScreen: true };
  let showTo = new Set([ha]);
  m.addBossBarSource((level, viewer) => (level === lvl && showTo.has(viewer) ? [wither] : []));
  step(host, 2);
  const got = bars(a);
  check('any: a bar from a source added later reaches the guest it\'s shown to', got.length === 1 && got[0].name === 'Wither' && got[0].color === 'purple' && got[0].overlay === 'progress' && got[0].progress === 1, JSON.stringify(got));
  check('any: with its flags: the sky darkened, no music, no fog', got[0]?.darkenScreen === true && got[0].playBossMusic === false && got[0].createWorldFog === false);
  check('any: the guest\'s screen shows it, and darkens', overlay(a).shouldDarkenScreen() && !overlay(a).shouldPlayMusic() && !overlay(a).shouldCreateWorldFog());
  check('any: the other guest, whom it isn\'t shown to, has none', bars(b).length === 0 && !overlay(b).shouldDarkenScreen());
  const copy = got[0];
  wither.progress = 0.5;
  step(host, 1);
  check('any: its progress follows within the tick, the same bar on the guest (its overlay slides it along)', bars(a)[0] === copy && copy.progress === 0.5);
  const o = new m.BossHealthOverlay();
  o.update(bars(a));
  wither.progress = 0.25;
  step(host, 1);
  o.update(bars(a));
  check('any: the overlay keeps the bar and slides to the new value', o.events.size === 1 && [...o.events.values()][0].progress(performance.now() + 1000) === 0.25);
  const before = a.session.bossBars.size;
  step(host, 5);
  check('any: nothing sent while nothing changes', a.session.bossBars.size === before && bars(a)[0] === copy);
  wither.name = 'Bob';
  wither.color = 'red';
  wither.overlay = 'notched_10';
  wither.darkenScreen = false;
  wither.playBossMusic = true;
  step(host, 1);
  check('any: its name, colour, notches and flags changed: changed on the guest', copy.name === 'Bob' && copy.color === 'red' && copy.overlay === 'notched_10' && !copy.darkenScreen && copy.playBossMusic);
  showTo = new Set([ha, hb]);
  step(host, 1);
  check('any: shown to the other guest too: it has it, as it is now', bars(b).length === 1 && bars(b)[0].name === 'Bob' && bars(b)[0].progress === 0.25);
  showTo = new Set([hb]);
  step(host, 1);
  check('any: not shown to Alex any more: gone from its screen, still on Steve\'s', bars(a).length === 0 && bars(b).length === 1);
  showTo = new Set();
  step(host, 1);
  check('any: gone for everyone', bars(a).length === 0 && bars(b).length === 0);
}

// ---------------------------------------------------------------------------
// the ender dragon's: shown to the players in its arena (game/endDragonFight.ts), pink, with the boss music and the fog
{
  hostChangeDimension(host, 'the_end', 0.5, 65, 0.5, 'end_portal');
  for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) host.makeChunk(cx, cz);
  host.server.hostArrived();
  // (a fight under way whose arena isn't loaded: nothing made, the bar as it is)
  const fight = new m.EndDragonFight(lvl, { needsStateScanning: false, dragonKilled: false, previouslyKilled: true, dragonUUID: 'x' });
  lvl.dragonFight = fight;
  step(host, 30);
  const got = bars(a);
  check('dragon: in the End within its arena, the guest has the dragon\'s bar', got.length === 1 && got[0].name === 'Ender Dragon' && got[0].color === 'pink' && got[0].overlay === 'progress' && got[0].progress === 1, JSON.stringify(got));
  check('dragon: with the boss music and the fog, not darkening the sky', got[0]?.playBossMusic && got[0].createWorldFog && !got[0].darkenScreen);
  check('dragon: its screen asks for the dragon\'s music and the fog', overlay(a).shouldPlayMusic() && overlay(a).shouldCreateWorldFog());
  check('dragon: both guests have it', bars(b).length === 1);
  fight.bossEvent.progress = 0.4;
  step(host, 1);
  check('dragon: the dragon hurt, its bar goes down on the guest', bars(a)[0]?.progress === 0.4);
  hb.moveTo(400, 65, 0.5, 0, 0);
  b.player.moveTo(400, 65, 0.5, 0, 0);
  step(host, 25);
  check('dragon: a guest gone out of its arena (192 blocks) loses it; the other keeps it', bars(b).length === 0 && bars(a).length === 1);
  fight.dragonKilled = true;
  step(host, 2);
  check('dragon: killed, its bar goes', bars(a).length === 0);
  fight.dragonKilled = false;
  hb.moveTo(0.5, 65, 2.5, 0, 0);
  b.player.moveTo(0.5, 65, 2.5, 0, 0);
  step(host, 25);
  check('dragon: (both have it again)', bars(a).length === 1 && bars(b).length === 1);
  // home: the bars of the End are gone with it
  hostChangeDimension(host, 'overworld', 0.5, 65, 0.5, 'end_portal');
  lvl.dragonFight = null;
  for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) if (!lvl.world.getChunk(cx, cz)) host.makeChunk(cx, cz);
  stepIdle(host, 2);
  check('dragon: taken home, the guest\'s bars are let go at once', bars(a).length === 0 && bars(b).length === 0);
  host.server.hostArrived();
  step(host, 10);
  check('dragon: and none come in the Overworld', bars(a).length === 0 && bars(b).length === 0);
}

// ---------------------------------------------------------------------------
// a host whose bars make no sense: the guest leaves, saying why
{
  function fakeHost() {
    const net = new m.MemoryNetwork();
    const f = { m, net, guests: [], peer: null };
    net.host.onPeer((peer, joined) => {
      if (joined) f.peer = peer;
    });
    net.host.onMessage(() => {});
    f.send = (packets) => net.host.send(f.peer, m.encode(packets));
    f.tick = (k = 1) => {
      for (let i = 0; i < k + SETTLE; i++) {
        net.deliver();
        for (const g of f.guests) g.session.tick();
        net.deliver();
      }
    };
    return f;
  }
  const LOGIN = {
    playerId: 7, worldName: 'Elsewhere', dimension: 'overworld', gameMode: 'survival', difficulty: 'normal', hardcore: false, gameRules: { doDaylightCycle: true },
    gameTime: 100, dayTime: 100, raining: false, thundering: false, rainLevel: 0, thunderLevel: 0, x: 0.5, y: 65, z: 0.5, yRot: 0, xRot: 0, viewDistance: 3, hostName: 'Other',
  };
  function hostSends(label, pks, want, after = null) {
    const f = fakeHost();
    const g = makeGuest(f, 'Alex');
    f.tick(1);
    f.send([[m.CB.Login, LOGIN]]);
    f.tick(1);
    let threw = null;
    try {
      f.send(pks);
      f.tick(2);
    } catch (e) {
      threw = e;
    }
    const ok = want === null ? g.disconnected === null && (!after || after(g)) : g.disconnected !== null && want.test(g.disconnected);
    check(`host sends ${label}: ${want === null ? 'taken' : 'the guest leaves, saying why'}`, !threw && ok, threw ? String(threw.stack ?? threw).slice(0, 300) : `${g.disconnected}`);
  }
  const BE = m.CB.BossEvent;
  hostSends('a colour that isn\'t one', [[BE, 1, 'X', 'constructor', 'progress', 1, 0]], /bad field 2/);
  hostSends('an overlay that isn\'t one', [[BE, 1, 'X', 'pink', 'notched_7', 1, 0]], /bad field 3/);
  hostSends('progress past the end', [[BE, 1, 'X', 'pink', 'progress', 2, 0]], /bad field 4/);
  hostSends('a flag that isn\'t one', [[BE, 1, 'X', 'pink', 'progress', 1, 8]], /bad field 5/);
  hostSends('a name of 257 characters', [[BE, 1, 'x'.repeat(257), 'pink', 'progress', 1, 0]], /bad field 1/);
  hostSends('a bar without its flags', [[BE, 1, 'X', 'pink', 'progress', 1]], /5 fields/);
  hostSends('a name with formatting: shown plain', [[BE, 1, '§cBob\u0007', 'pink', 'progress', 0.5, 7]], null, (g) => g.session.bossBars.get(1)?.name === 'cBob' && g.session.bossBars.get(1).darkenScreen && g.session.bossBars.get(1).playBossMusic && g.session.bossBars.get(1).createWorldFog);
  hostSends('a bar taken away that it never had', [[m.CB.BossEventRemove, 99]], null, (g) => g.session.bossBars.size === 0);
}

exitWithStatus(close);
