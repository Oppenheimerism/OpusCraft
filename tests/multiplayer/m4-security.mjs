// Stage 4's packets, checked. On the host, while it's on its way to another dimension (its level standing still,
// ServerPlayerSession.idleTick): what a guest sends is checked as ever, and whoever sends anything wrong (bytes that
// aren't data, a packet that fails its checks, one only a host sends, a second hello, too much too fast, chat spam, or
// nothing at all for 30 seconds) is let go with a reason, the host's tick doesn't throw, and the other guests go on
// with the host. On a guest: a ChangeDimension (or a login) naming a dimension that isn't one of the three, a reason
// that isn't one, a wrong number of fields, or coming before the login has it leave, saying why; a good one, twice
// over, takes it along.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, rawGuest, hostCopy, step, stepIdle, hostChangeDimension, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet(ENTITY_MODULES);

// ---------------------------------------------------------------------------
// the host, on its way: whoever sends anything wrong is let go, with a reason, and the rest go on with it
{
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex');
  step(host, 3);
  let n = 0, trips = 0;

  /**
   * guests that log in, then (the host gone for another dimension) each sends what its `send` does; each must be let
   * go with a reason matching its `want`, after `ticks` of the host's waiting
   */
  function onTheWay(attacks, ticks = 3) {
    const rs = attacks.map(() => rawGuest(host));
    step(host, 1);
    rs.forEach((r, i) => r.hello(`Bad${n + i}`));
    step(host, 2);
    const names = attacks.map((_, i) => `Bad${n + i}`);
    n += attacks.length;
    const inGame = names.every((name) => hostCopy(host, { name }) !== null);
    const [dim, back] = trips++ % 2 ? ['overworld', 'the_nether'] : ['the_nether', 'overworld'];
    hostChangeDimension(host, dim, 0.5, 65, 0.5, 'nether_portal');
    let threw = null;
    try {
      stepIdle(host, 1);
      attacks.forEach(([, send], i) => send(rs[i]));
      stepIdle(host, ticks);
    } catch (e) {
      threw = e;
    }
    attacks.forEach(([label, , want], i) => {
      const r = rs[i], reason = r.reason();
      const told = r.packets(m.CB.ChangeDimension);
      check(`on the way, ${label}: the guest is let go, with a reason`, inGame && told.length === 1 && told[0].join() === `${m.CB.ChangeDimension},${dim},nether_portal` && r.gone && reason !== null && want.test(reason), `${reason}`);
    });
    check(`on the way (${attacks.map(([l]) => l).join('; ')}): the host's waiting didn't throw; Alex is still with it`, !threw && a.session.state === 'play' && a.dims.at(-1)?.[0] === dim && host.server.guestCount() === 1, threw ? String(threw.stack ?? threw).slice(0, 300) : `${host.server.guestCount()} guests`);
    // (there: the level ticks again; nobody but Alex comes in)
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) host.makeChunk(cx, cz);
    host.server.hostArrived();
    step(host, 3);
    check(`...and there, only Alex comes in (${back} left behind)`, host.level.players().length === 2 && hostCopy(host, a) !== null && names.every((name) => hostCopy(host, { name }) === null));
  }

  onTheWay([
    ['garbage bytes', (r) => r.sendBytes(new Uint8Array([0xff, 0x13, 0x37])), /^Bad data: unknown tag 255/],
    ['a move whose coordinate is text', (r) => r.send([[m.SB.MovePlayer, '0', 65, 0.5, 0, 0, 0, -1]]), /^Bad data: packet \d+: bad field 0/],
    ['a packet only a host sends (ChangeDimension)', (r) => r.send([[m.CB.ChangeDimension, 'the_end', 'end_portal']]), /^Bad data: unknown packet 45/],
    ['a hello after logging in', (r) => r.hello('Again'), /^Already here$/],
    [`more than ${m.MAX_GUEST_BACKLOG} messages before a tick`, (r) => {
      for (let i = 0; i <= m.MAX_GUEST_BACKLOG; i++) r.send([[m.SB.KeepAlive, 1]]);
    }, /^Sending too much, too fast$/],
    ['a chat line in a click\'s place (a menu button that\'s text)', (r) => r.send([[m.SB.ContainerButtonClick, 0, 'go']]), /^Bad data: packet \d+: bad field 1/],
  ]);
  onTheWay([
    ['chat spam (heard on the way, counted as ever)', (r) => {
      for (let i = 0; i < 12; i++) r.send([[m.SB.Chat, `hello ${i}`]]);
    }, /^Kicked for spamming$/],
    ['a chat line that isn\'t allowed', (r) => r.send([[m.SB.Chat, 'a\u0007b']]), /^Illegal characters in chat$/],
    ['nothing at all for 30 seconds (the host still waiting)', () => {}, /^Timed out$/],
  ], m.TIMEOUT_TICKS + 5);
}

// ---------------------------------------------------------------------------
// a guest: a host whose ChangeDimension (or login) makes no sense is left, saying why; a good one takes it along
{
  const LOGIN = {
    playerId: 7, worldName: 'Elsewhere', dimension: 'overworld', gameMode: 'survival', difficulty: 'normal', hardcore: false, gameRules: { doDaylightCycle: true },
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
    return f;
  }
  const blocks = () => Array.from({ length: m.SECTIONS }, (_, s) => (s === 4 ? new Uint16Array(4096).fill(m.S('stone')) : null));
  const chunk = (cx, cz) => [m.CB.LevelChunk, cx, cz, blocks(), new Uint8Array(256).fill(m.B.plains), null, []];
  /** a guest let in by a fake host (with `login` in place of the usual), and shown a chunk */
  function joined(login = LOGIN) {
    const f = fakeHost();
    const g = makeGuest(f, 'Alex');
    f.tick(1);
    f.send([[m.CB.Login, login], chunk(0, 0)]);
    f.tick(1);
    return { f, g };
  }
  function badHost(label, packets, want, login) {
    const { f, g } = joined(login);
    let threw = null;
    try {
      f.send(packets);
      f.tick(2);
    } catch (e) {
      threw = e;
    }
    check(`host sends ${label}: the guest leaves, saying why`, !threw && g.disconnected !== null && want.test(g.disconnected) && g.dims.length === 0, threw ? String(threw.stack ?? threw).slice(0, 300) : `${g.disconnected}`);
  }
  const CD = m.CB.ChangeDimension;
  for (const dim of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'the_moon', 'Overworld', '', 42, null, true, ['the_end']])
    badHost(`a ChangeDimension to ${JSON.stringify(dim)}`, [[CD, dim, 'other']], /bad field 0/);
  for (const reason of ['portal', 'constructor', '', 2, null])
    badHost(`a ChangeDimension for the reason ${JSON.stringify(reason)}`, [[CD, 'the_nether', reason]], /bad field 1/);
  badHost('a ChangeDimension without its reason', [[CD, 'the_nether']], /1 fields/);
  badHost('a ChangeDimension with a field too many', [[CD, 'the_nether', 'nether_portal', 1]], /3 fields/);
  // (a login naming a dimension that isn't one: before, "constructor" was taken, and made a world of Object's constructor)
  for (const dim of ['constructor', '__proto__', 'the_moon'])
    badHost(`a login in dimension ${JSON.stringify(dim)}`, [], /bad login/, { ...LOGIN, dimension: dim });
  {
    const f = fakeHost();
    const g = makeGuest(f, 'Alex');
    f.tick(1);
    f.send([[CD, 'the_nether', 'nether_portal']]);
    f.tick(2);
    check('host sends a ChangeDimension before letting the guest in: it leaves, saying why', g.disconnected !== null && /let in first/.test(g.disconnected) && g.dims.length === 0, `${g.disconnected}`);
  }
  {
    const { f, g } = joined();
    check('(the guest in, with a chunk)', g.session.state === 'play' && g.world.chunks.size === 1);
    f.send([[CD, 'the_nether', 'nether_portal'], [CD, 'the_end', 'end_portal']]);
    f.tick(2);
    check('host sends two good ChangeDimensions: the guest stays, taken along each time, its world the End\'s and empty', g.session.state === 'play' && g.disconnected === null && g.dims.map((d) => d.join()).join(' ') === 'the_nether,nether_portal the_end,end_portal' && g.world.dim.id === 'the_end' && g.world.chunks.size === 0);
    f.send([[m.CB.PlayerPosition, 100.5, 49, 0.5, 90, 0, 1], chunk(6, 0)]);
    f.tick(2);
    check('...and put where the host says there, shown what it sends', g.player.x === 100.5 && g.player.z === 0.5 && g.world.getChunk(6, 0) !== null && f.got.some((p) => p[0] === m.SB.AcceptTeleportation && p[1] === 1));
  }
}

await exitWithStatus(close);
