// Multiplayer M2: the entity packets are data from another computer too. On the host: a guest's new fields (the entity
// under its crosshair, a riding jump's power, a drop's slot) are checked for their types and ranges, and one that
// isn't right has it disconnected with a reason. On a guest: an entity the host sends that can't be made is left out;
// fields that aren't the host's to send (bad items, effects that don't exist, names that can't be a field's, lists
// past their length, keys reaching for a prototype) have it leave, saying why; fields its copy hasn't, or of another
// kind than it holds, or that are the guest's own to work out, are let be; ids it doesn't know of are ignored; a field
// naming an entity that comes later has it once it comes, and what waits for that is bounded.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, rawGuest, hostCopy, copyOf, step, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet(ENTITY_MODULES);

// ---------------------------------------------------------------------------
// the host: a guest's new fields, checked
{
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex');
  step(host, 3);
  let n = 0;
  function attack(label, packets, want) {
    const r = rawGuest(host);
    const name = `Bad${n++}`;
    step(host, 1);
    r.hello(name);
    step(host, 2);
    const inGame = hostCopy(host, { name }) !== null;
    let threw = null;
    try {
      r.send(packets);
      step(host, 3);
    } catch (e) {
      threw = e;
    }
    const reason = r.reason();
    check(`${label}: the guest is disconnected, with a reason`, inGame && r.gone && reason !== null && want.test(reason), `${reason}`);
    check(`${label}: (the host's tick didn't throw; Alex plays on)`, !threw && hostCopy(host, { name }) === null && a.session.state === 'play', threw ? String(threw.stack ?? threw).slice(0, 300) : '');
  }
  attack('a crosshair entity id below -1', [[m.SB.MovePlayer, 0.5, 65, 0.5, 0, 0, 0, -2]], /^Bad data: packet \d+: bad field 6/);
  attack('a crosshair entity id that isn\'t a whole number', [[m.SB.MovePlayer, 0.5, 65, 0.5, 0, 0, 0, 1.5]], /^Bad data: packet \d+: bad field 6/);
  attack('a move without the crosshair\'s entity (a stage 1 guest)', [[m.SB.MovePlayer, 0.5, 65, 0.5, 0, 0, 0]], /^Bad data: packet \d+: 6 fields/);
  attack('a riding jump past 100', [[m.SB.PlayerAction, m.Action.RIDING_JUMP, 101]], /^Bad data: packet \d+: bad field 1/);
  attack('an action without its argument', [[m.SB.PlayerAction, m.Action.DROP]], /^Bad data: packet \d+: 1 fields/);
  // (the bit past the last there is: stage 3 added the wall a glide runs into)
  attack('movement keys that don\'t exist', [[m.SB.MovePlayer, 0.5, 65, 0.5, 0, 0, Math.max(...Object.values(m.PoseFlag)) * 2, -1]], /^Bad data: packet \d+: bad field 5/);
  attack('a slot below -1', [[m.SB.SetCreativeModeSlot, -2, null]], /^Bad data: packet \d+: bad field 0/);
  attack('throwing out two swords at once', [[m.SB.SetCreativeModeSlot, -1, ['diamond_sword', 2, 0, null]]], /^Invalid creative inventory action$/);
  // (fine, and doing nothing: a riding jump on nothing, throwing out nothing)
  const r = rawGuest(host);
  step(host, 1);
  r.hello('Fine');
  step(host, 2);
  r.send([[m.SB.PlayerAction, m.Action.RIDING_JUMP, 100], [m.SB.SetCreativeModeSlot, -1, null], [m.SB.PlayerAction, m.Action.DROP_ALL, 0]]);
  step(host, 3);
  check('fine: a riding jump with nothing to ride, throwing out nothing, a drop with nothing in hand: nothing happens', !r.gone && hostCopy(host, { name: 'Fine' }) !== null && !host.level.entities.some((e) => e.type === 'item'));
}

// ---------------------------------------------------------------------------
// the host's own slips: what a guest would have to refuse (and leave over) isn't sent, and the rest of the tick still is
{
  let bad = 0;
  const bytes = m.encodeBundle([[1, 2], [3, NaN], [4, 'x']], () => bad++);
  check('wire: a number that isn\'t one can\'t be sent (a guest refuses a message with one)', (() => {
    try {
      m.encode([1, NaN]);
      return false;
    } catch (e) {
      return e instanceof m.CodecError;
    }
  })());
  check('wire: in a tick\'s packets, the one with it is left out and the others go', bad === 1 && JSON.stringify(m.decode(bytes, 1 << 20)) === '[[1,2],[4,"x"]]', JSON.stringify(m.decode(bytes, 1 << 20)));
  const host = flatHost(m, 3);
  const g = makeGuest(host, 'Alex');
  step(host, 30);
  // (a zombie whose fire count isn't a number: its record would carry it; a pig beside it, the same tick)
  const zombie = m.createMob('zombie', host.level);
  zombie.moveTo(2.5, 64, 2.5, 0, 0);
  zombie.remainingFireTicks = NaN;
  host.level.addEntity(zombie);
  const pig = m.createMob('pig', host.level);
  pig.moveTo(-2.5, 64, 2.5, 0, 0);
  host.level.addEntity(pig);
  // (a bat past the height the wire takes, above the guest)
  const bat = m.createMob('bat', host.level);
  bat.moveTo(0.5, 25_000_000, 0.5, 0, 0);
  bat.noGravity = true;
  bat.serverAiStep = () => {};
  host.level.addEntity(bat);
  step(host, 5);
  check('host slips: the guest is still in', g.session.state === 'play', g.disconnected);
  check('host slips: it isn\'t shown what can\'t be sent (a zombie whose record has a number that isn\'t one, a bat past the height)', copyOf(g, zombie) === null && copyOf(g, bat) === null);
  check('host slips: and is shown what came in the same tick (the pig)', copyOf(g, pig)?.type === 'pig');
  zombie.remainingFireTicks = 0;
  step(host, 5);
  check('host slips: the zombie is shown once it can be', copyOf(g, zombie)?.type === 'zombie' && g.session.state === 'play');
}

// ---------------------------------------------------------------------------
// a guest: what a host sends about entities
const LOGIN = {
  playerId: 7, worldName: 'Elsewhere', dimension: 'overworld', gameMode: 'creative', difficulty: 'normal', hardcore: false, gameRules: { doDaylightCycle: true },
  gameTime: 100, dayTime: 100, raining: false, thundering: false, rainLevel: 0, thunderLevel: 0, x: 0.5, y: 65, z: 0.5, yRot: 0, xRot: 0, viewDistance: 3, hostName: 'Other',
};
function fakeHost() {
  const net = new m.MemoryNetwork();
  const f = { m, net, guests: [], got: [], peer: null };
  net.host.onPeer((peer, joined) => {
    if (joined) f.peer = peer;
  });
  net.host.onMessage((_peer, data) => f.got.push(...m.decode(data, m.MAX_GUEST_MESSAGE)));
  f.send = (packets) => net.host.send(f.peer, m.encode(packets));
  f.tick = (k = 1) => {
    for (let i = 0; i < k; i++) {
      net.deliver();
      for (const g of f.guests) g.session.tick();
      net.deliver();
    }
  };
  f.said = (id) => f.got.filter((p) => p[0] === id);
  return f;
}
const blocks = () => Array.from({ length: m.SECTIONS }, (_, s) => (s === 4 ? new Uint16Array(4096).fill(m.S('stone')) : null));
const chunk = (cx, cz) => [m.CB.LevelChunk, cx, cz, blocks(), new Uint8Array(256).fill(m.B.plains), null, []];
/** a pig's AddEntity as a host makes it (a real pig's record and fields), with `data` in place of its fields if given */
function addPig(id, { x = 2.5, data } = {}) {
  const hl = new m.Level(new m.World(), 'h');
  const pig = m.createMob('pig', hl);
  pig.moveTo(x, 64, 0.5, 0, 0);
  return [m.CB.AddEntity, id, 'pig', m.spawnPayload(pig), x, 64, 0.5, 0, 0, 0, 0, 1, data ?? new m.DataWatcher().full(pig)];
}
function joined() {
  const f = fakeHost();
  const g = makeGuest(f, 'Alex');
  f.tick(1);
  f.send([[m.CB.Login, LOGIN], chunk(0, 0)]);
  f.tick(1);
  return { f, g };
}
/** the guest must leave, saying why */
function badHost(label, packets, want) {
  const { f, g } = joined();
  let threw = null;
  try {
    f.send(packets);
    f.tick(2);
  } catch (e) {
    threw = e;
  }
  check(`host sends ${label}: the guest leaves, saying why`, !threw && g.disconnected !== null && want.test(g.disconnected), threw ? String(threw.stack ?? threw).slice(0, 300) : `${g.disconnected}`);
}
/** the guest must take it (or let it be) and stay */
function fineHost(label, packets, test = () => true) {
  const { f, g } = joined();
  let threw = null;
  try {
    f.send(packets);
    f.tick(2);
  } catch (e) {
    threw = e;
  }
  let ok = false;
  try {
    ok = test(g);
  } catch (e) {
    threw = e;
  }
  check(`host sends ${label}: the guest stays, and it's as it should be`, !threw && g.session.state === 'play' && ok, threw ? String(threw.stack ?? threw).slice(0, 300) : `${g.session.state} ${g.disconnected}`);
  return g;
}
const pigOf = (g, id) => g.session.entities.get(id)?.e ?? null;

badHost('an entity kind that can\'t be one', [[m.CB.AddEntity, 20, 'Pig!', null, 0, 64, 0, 0, 0, 0, 0, 0, {}]], /^Bad data from the host: packet \d+: bad field 1$/);
badHost('an entity off the world', [[m.CB.AddEntity, 20, 'pig', null, 1e9, 64, 0, 0, 0, 0, 0, 0, {}]], /^Bad data from the host: packet \d+: bad field 3$/);
badHost('an item that can\'t be one in a field', [addPig(20, { data: { mainHand: { i: ['stone', 500, 0, null] } } })], /^Bad data from the host: bad entity data$/);
badHost('an item that can\'t be one in a list', [addPig(20), [m.CB.SetEntityData, 20, { armorItems: [null, { i: ['stone', 1, -1, null] }, null, null] }]], /^Bad data from the host: bad entity data$/);
badHost('an effect that doesn\'t exist', [addPig(20), [m.CB.SetEntityData, 20, { $effects: [['no_such_effect', 0]] }]], /^Bad data from the host: bad effects$/);
badHost('an effect of amplifier 1000', [addPig(20), [m.CB.SetEntityData, 20, { $effects: [['speed', 1000]] }]], /^Bad data from the host: bad effects$/);
badHost('a field name that can\'t be one', [addPig(20), [m.CB.SetEntityData, 20, { 'health; drop': 3 }]], /^Bad data from the host: bad entity field$/);
badHost('an entity where a list goes', [addPig(20), [m.CB.SetEntityData, 20, { armorItems: { e: 20 } }]], /^Bad data from the host: bad entity list$/);
badHost('a list past 256', [addPig(20), [m.CB.SetEntityData, 20, { armorItems: Array.from({ length: 300 }, () => null) }]], /^Bad data from the host: bad entity list$/);
badHost('an object that isn\'t an item or an entity', [addPig(20), [m.CB.SetEntityData, 20, { health: { x: 1 } }]], /^Bad data from the host: bad entity data$/);
badHost('a "__proto__" key in its fields', [addPig(20), [m.CB.SetEntityData, 20, { ['__proto__']: { polluted: true } }]], /^Bad data from the host: bad key/);
check('prototype: nothing reached Object.prototype', ({}).polluted === undefined);

fineHost('a record of another kind than it says (not shown)', [[m.CB.AddEntity, 20, 'cow', addPig(21)[3], 2.5, 64, 0.5, 0, 0, 0, 0, 1, {}]], (g) => pigOf(g, 20) === null && g.level.entities.length === 1);
fineHost('a pig, as a host makes one', [addPig(20)], (g) => pigOf(g, 20)?.type === 'pig' && g.level.entities.includes(pigOf(g, 20)));
fineHost('fields of another kind than the copy holds (text for its health, a number for a flag, an item for a number)', [addPig(20), [m.CB.SetEntityData, 20, { health: 'lots', customNameVisible: 5, age: { i: ['stone', 1, 0, null] } }]], (g) => {
  const p = pigOf(g, 20);
  return p.health === 10 && p.customNameVisible === false && p.age === 0;
});
fineHost('fields a copy works out for itself, or doesn\'t have (let be)', [addPig(20), [m.CB.SetEntityData, 20, { x: 1e6, removed: true, level: 5, passengers: [], noSuchField: 1, tickCount: 1e9 }]], (g) => {
  const p = pigOf(g, 20);
  return Math.abs(p.x - 2.5) < 1e-9 && !p.removed && p.level === g.level && p.tickCount < 100 && !('noSuchField' in p);
});
fineHost('its own player as an entity (let be)', [[m.CB.AddEntity, 7, 'pig', addPig(7)[3], 2.5, 64, 0.5, 0, 0, 0, 0, 1, {}]], (g) => g.session.entities.size === 0);
fineHost('moves, fields, riders and pickups of entities it doesn\'t know (ignored)', [
  [m.CB.MoveEntity, 55, 1, 64, 1, 0, 0, 0, 0, 1],
  [m.CB.SetEntityData, 55, { health: 1 }],
  [m.CB.SetPassengers, 55, [7, 56]],
  [m.CB.TakeItemEntity, 55, 7, 1],
  [m.CB.RemoveEntities, [55, 56]],
  [m.CB.LevelParticles, 'poof', [55]],
  [m.CB.LevelParticles, 'emitAround', ['crit', 55]],
], (g) => g.session.entities.size === 0 && g.player.vehicle === null);
fineHost('riders that can\'t be (a pig riding itself, a loop of two)', [addPig(20), addPig(21, { x: 4.5 }), [m.CB.SetPassengers, 20, [20]], [m.CB.SetPassengers, 20, [21]], [m.CB.SetPassengers, 21, [20]]], (g) => {
  const a = pigOf(g, 20), b = pigOf(g, 21);
  return a.vehicle === null && b.vehicle === a && a.passengers.length === 1;
});
fineHost('particles that don\'t make sense (a crit of another kind, a burst of stars that aren\'t)', [
  addPig(20),
  [m.CB.LevelParticles, 'emitAround', ['explosion', 20]],
  [m.CB.LevelParticles, 'fireworks', [0, 64, 0, 0, 0, 0, [['not_a_shape', [1], [], true, false]]]],
  [m.CB.LevelParticles, 'fireworks', [0, 64, 0, 0, 0, 0, [['star', [0x1000000], [], true, false]]]],
  [m.CB.LevelParticles, 'poof', ['20']],
], (g) => !g.level.particleCalls.some((c) => c.method === 'fireworks' || c.method === 'emitAround' || c.method === 'poof'));
fineHost('our player put on a pig, then the pig gone: off it', [addPig(20), [m.CB.SetPassengers, 20, [7]], [m.CB.RemoveEntities, [20]]], (g) => g.player.vehicle === null && g.mounted.length === 1);
// a field naming an entity that comes later has it once it comes; what waits is bounded
{
  const hl = new m.Level(new m.World(), 'h');
  const zombie = m.createMob('zombie', hl);
  zombie.moveTo(1.5, 64, 1.5);
  const add = [m.CB.AddEntity, 30, 'zombie', m.spawnPayload(zombie), 1.5, 64, 1.5, 0, 0, 0, 0, 1, new m.DataWatcher().full(zombie)];
  fineHost('a zombie whose target comes after it (the target filled in as it comes)', [add, [m.CB.SetEntityData, 30, { target: { e: 20 } }], addPig(20)], (g) => pigOf(g, 30)?.target === pigOf(g, 20) && pigOf(g, 20) !== null);
  const many = Array.from({ length: 6000 }, (_, i) => [m.CB.SetEntityData, 30, { target: { e: 1000 + i } }]);
  fineHost('six thousand targets that never come (what waits for them is bounded)', [add, ...many], (g) => g.session.waitingCount <= 4096 && pigOf(g, 30).target === null);
}

await exitWithStatus(close);
