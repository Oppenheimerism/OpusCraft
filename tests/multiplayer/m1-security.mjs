// Multiplayer M1: what another game sends is data from another computer, and is checked before anything is done with
// it. On the host: anything that isn't a well-formed message of known packets with fields of the right types and ranges
// (bytes that aren't data, a message too big, too many packets, nesting too deep, a key reaching for a prototype, a
// number that isn't one, a coordinate off the world) has that guest disconnected with a reason, and nothing more: the
// host's tick doesn't throw, the other guests play on, the world is as it was. So does sending too much too fast, and a
// creative slot that isn't a real item (vanilla "Invalid creative inventory action"); a flood of clicks is one click.
// On a guest: whatever a host sends that it can't take (a block or biome that doesn't exist, an unknown packet, a login
// that isn't one, too much) has it leave, saying why, rather than trip. And what other windows say about their open
// worlds is shown only as plain text.

import { loadNet, flatHost, makeGuest, rawGuest, hostCopy, step, SETTLE, assertMirrorEquals, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet(['/src/item/creativeStacks.ts', '/src/net/transport/lan.ts']);

// raw bytes, as the codec lays them out (net/codec.ts): for what an honest encoder can't write
const T = { INT: 3, FLOAT: 4, STRING: 5, ARRAY: 6, OBJECT: 7, U16: 9, F64: 14 };
const varuint = (n) => {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
};
const wInt = (v) => [T.INT, ...varuint(v >= 0 ? 2 * v : -2 * v - 1)];
const wF64 = (v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return [T.FLOAT, ...b];
};
const wArr = (n) => [T.ARRAY, ...varuint(n)];
const bytes = (...parts) => new Uint8Array(parts.flat());

// ---------------------------------------------------------------------------
// the host: whoever sends anything wrong is let go, with a reason, and nobody else notices
{
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex');
  step(host, 3);
  const players = () => host.level.players().length;
  const polluted = () => ({}).polluted !== undefined || Object.prototype.polluted !== undefined;
  let n = 0;

  /** a guest that logs in, then sends what `send` does; it must be disconnected with a reason matching `want` */
  function attack(label, send, want) {
    const r = rawGuest(host);
    const name = `Bad${n++}`;
    step(host, 1);
    r.hello(name);
    step(host, 2);
    const inGame = hostCopy(host, { name }) !== null;
    let threw = null;
    try {
      send(r);
      step(host, 3);
    } catch (e) {
      threw = e;
    }
    const reason = r.reason();
    check(`${label}: the guest is disconnected, with a reason`, inGame && r.gone && reason !== null && want.test(reason), `${reason}`);
    check(`${label}: (the host's tick didn't throw; its player is gone; Alex plays on)`, !threw && hostCopy(host, { name }) === null && players() === 2 && a.session.state === 'play', threw ? String(threw.stack ?? threw).slice(0, 300) : `${players()} players`);
  }

  // bytes that aren't data
  attack('garbage bytes', (r) => r.sendBytes(bytes([0xff, 0x13, 0x37])), /^Bad data: unknown tag 255/);
  attack('an empty message', (r) => r.sendBytes(new Uint8Array(0)), /^Bad data: cut short/);
  const good = m.encode([[m.SB.KeepAlive, 1]]);
  attack('a message cut short', (r) => r.sendBytes(good.slice(0, good.length - 1)), /^Bad data: cut short/);
  attack('bytes after a message', (r) => r.sendBytes(bytes([...good, 0])), /^Bad data: bytes after the end/);
  attack('text that isn\'t UTF-8', (r) => r.sendBytes(bytes(wArr(1), wArr(2), wInt(m.SB.Chat), [T.STRING, 2, 0xc3, 0x28])), /^Bad data: bad text/);
  attack('a number that isn\'t one (NaN)', (r) => r.sendBytes(bytes(wArr(1), wArr(7), wInt(m.SB.MovePlayer), wF64(NaN), wInt(64), wF64(0.5), wInt(0), wInt(0), wInt(0))), /^Bad data: not a finite number/);
  attack('an infinite coordinate', (r) => r.sendBytes(bytes(wArr(1), wArr(7), wInt(m.SB.MovePlayer), wF64(Infinity), wInt(64), wF64(0.5), wInt(0), wInt(0), wInt(0))), /^Bad data: not a finite number/);
  // lengths that claim more than there is: refused before anything is made that big
  attack('an array claiming two billion elements', (r) => r.sendBytes(bytes(wArr(2 ** 31))), /^Bad data: length past the end/);
  attack('a typed array claiming a billion numbers', (r) => r.sendBytes(bytes([T.F64, ...varuint(1e9)])), /^Bad data: length past the end/);
  attack('a string claiming a gigabyte', (r) => r.sendBytes(bytes(wArr(1), wArr(2), wInt(m.SB.Chat), [T.STRING, ...varuint(2 ** 30)])), /^Bad data: length past the end/);
  attack('a length too long to be one', (r) => r.sendBytes(bytes([T.ARRAY, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])), /^Bad data: number too long/);
  // nesting, and keys that reach for the prototype
  attack('nesting too deep', (r) => r.sendBytes(bytes(Array.from({ length: m.MAX_DEPTH + 5 }, () => wArr(1)).flat(), [0])), /^Bad data: nested too deeply/);
  for (const key of ['__proto__', 'constructor', 'prototype'])
    attack(`a "${key}" key`, (r) => r.send([[m.SB.SetCreativeModeSlot, 0, ['diamond_sword', 1, 0, { [key]: { polluted: true } }]]]), /^Bad data: bad key/);
  check('prototype: nothing reached Object.prototype', !polluted());
  // not a message of packets
  attack('a number for a message', (r) => r.sendBytes(m.encode(5)), /^Bad data: not a message/);
  attack('too many packets in a message', (r) => r.send(Array.from({ length: m.MAX_GUEST_PACKETS + 1 }, () => [m.SB.KeepAlive, 1])), /^Bad data: not a message/);
  attack('a packet that isn\'t a list', (r) => r.send([{ id: 1 }]), /^Bad data: not a packet/);
  attack('an unknown packet', (r) => r.send([[99]]), /^Bad data: unknown packet 99/);
  attack('a packet id that isn\'t a whole number', (r) => r.send([[1.5, 1]]), /^Bad data: unknown packet/);
  attack('a packet id that\'s text', (r) => r.send([['move']]), /^Bad data: unknown packet move/);
  attack('a packet only a host sends', (r) => r.send([[m.CB.SystemChat + 100, 'hi', false]]), /^Bad data: unknown packet/);
  attack('fields missing', (r) => r.send([[m.SB.MovePlayer, 0.5, 65]]), /^Bad data: packet \d+: 2 fields/);
  attack('a field too many', (r) => r.send([[m.SB.KeepAlive, 1, 2]]), /^Bad data: packet \d+: 2 fields/);
  // fields of the wrong type, or out of range
  const move = (x, y, z, yRot = 0, xRot = 0, flags = 0) => [[m.SB.MovePlayer, x, y, z, yRot, xRot, flags, -1]];
  attack('a coordinate that\'s text', (r) => r.send(move('0', 65, 0.5)), /^Bad data: packet \d+: bad field 0/);
  attack('a coordinate off the world', (r) => r.send(move(m.WORLD_EDGE + 1, 65, 0.5)), /^Bad data: packet \d+: bad field 0/);
  attack('a height off the world', (r) => r.send(move(0.5, 3e7, 0.5)), /^Bad data: packet \d+: bad field 1/);
  attack('looking further up than straight up', (r) => r.send(move(0.5, 65, 0.5, 0, -91)), /^Bad data: packet \d+: bad field 4/);
  attack('pose flags that don\'t exist', (r) => r.send(move(0.5, 65, 0.5, 0, 0, 1 << 20)), /^Bad data: packet \d+: bad field 5/);
  attack('a hotbar slot past the ninth', (r) => r.send([[m.SB.SetCarriedItem, 9]]), /^Bad data: packet \d+: bad field 0/);
  // (the first past the last there is: stage 3 added the swap key's and Leave Bed's)
  attack('an action that doesn\'t exist', (r) => r.send([[m.SB.PlayerAction, Math.max(...Object.values(m.Action)) + 1, 0]]), /^Bad data: packet \d+: bad field 0/);
  attack('an inventory slot that doesn\'t exist', (r) => r.send([[m.SB.SetCreativeModeSlot, m.SLOT_COUNT, null]]), /^Bad data: packet \d+: bad field 0/);
  attack('an item of the wrong shape', (r) => r.send([[m.SB.SetCreativeModeSlot, 0, ['stone', 1]]]), /^Bad data: packet \d+: bad field 1/);
  attack('a stack of none', (r) => r.send([[m.SB.SetCreativeModeSlot, 0, ['stone', 0, 0, null]]]), /^Bad data: packet \d+: bad field 1/);
  attack('an empty chat line', (r) => r.send([[m.SB.Chat, '']]), /^Bad data: packet \d+: bad field 0/);
  attack('a hello after logging in', (r) => r.hello('Again'), /^Already here$/);
  // items that aren't (vanilla handleSetCreativeModeSlot)
  attack('an item that doesn\'t exist', (r) => r.send([[m.SB.SetCreativeModeSlot, 0, ['not_an_item', 1, 0, null]]]), /^Invalid creative inventory action$/);
  attack('more than a stack', (r) => r.send([[m.SB.SetCreativeModeSlot, 0, ['stone', 65, 0, null]]]), /^Invalid creative inventory action$/);
  attack('two swords in a stack', (r) => r.send([[m.SB.SetCreativeModeSlot, 0, ['diamond_sword', 2, 0, null]]]), /^Invalid creative inventory action$/);
  attack('damage past breaking', (r) => r.send([[m.SB.SetCreativeModeSlot, 0, ['diamond_sword', 1, m.getItem('diamond_sword').maxDamage + 1, null]]]), /^Invalid creative inventory action$/);
  attack('damage on stone', (r) => r.send([[m.SB.SetCreativeModeSlot, 0, ['stone', 1, 1, null]]]), /^Invalid creative inventory action$/);
  // sizes and floods
  attack(`a message past ${m.MAX_GUEST_MESSAGE / 1024} KB`, (r) => r.sendBytes(new Uint8Array(m.MAX_GUEST_MESSAGE + 1)), /^Bad data: a message too big$/);
  attack('a chat line of a megabyte', (r) => r.send([[m.SB.Chat, 'x'.repeat(1 << 20)]]), /^Bad data: a message too big$/);
  attack(`more than ${m.MAX_GUEST_BACKLOG} messages before a tick`, (r) => {
    for (let i = 0; i <= m.MAX_GUEST_BACKLOG; i++) r.send([[m.SB.KeepAlive, 1]]);
  }, /^Sending too much, too fast$/);
  attack('more than 2 MB before a tick', (r) => {
    const big = m.encode([[m.SB.Chat, 'x'.repeat(60000)]]);
    for (let i = 0; i * big.length <= m.MAX_GUEST_BACKLOG_BYTES; i++) r.sendBytes(big);
  }, /^Sending too much, too fast$/);

  // what's let through: many messages (each a tick's share at most), taken over a few ticks, not all at once
  {
    const r = rawGuest(host);
    step(host, 1);
    r.hello('Busy');
    step(host, 2);
    for (let i = 0; i < 500; i++) r.send([[m.SB.KeepAlive, 1]]);
    step(host, 5);
    check('busy: 500 messages at once, within the limits: still in (40 handled a tick)', !r.gone && hostCopy(host, { name: 'Busy' }) !== null);
    // a flood of clicks is one click: the button counts as pressed once a tick (vanilla handlePlayerAction)
    // (away from the host's player, which stands at the spawn and would be in the way)
    r.send([[m.SB.MovePlayer, 4.5, 65, 4.5, 0, 90, 0, -1], ...Array.from({ length: 60 }, () => [m.SB.PlayerAction, m.Action.ATTACK, 0])]);
    step(host, 20);
    check('clicks: sixty in a tick break one block', host.world.getState(4, 63, 4) === 0 && host.world.getState(4, 62, 4) === m.S('stone'));
    check('clicks: (and it\'s still in)', !r.gone);
    // data on an item that isn't a creative tab's is left off; a creative tab's variant keeps its own
    const busy = hostCopy(host, { name: 'Busy' });
    r.send([[m.SB.SetCreativeModeSlot, 0, ['diamond_sword', 1, 0, { enchantments: { sharpness: 255 }, CustomName: 'x'.repeat(1000) }]]]);
    step(host, 2);
    check('items: a sword with made-up data is a plain sword on the host', busy.inventory.main[0]?.item.id === 'diamond_sword' && !busy.inventory.main[0].tag, JSON.stringify(busy.inventory.main[0]?.tag));
    const potion = m.stacksOf(m.getItem('potion')).find((s) => s.tag);
    r.send([[m.SB.SetCreativeModeSlot, 1, m.itemToWire(potion)]]);
    step(host, 2);
    check('items: a potion from the creative tabs keeps what it is', busy.inventory.main[1] && m.sameTag(busy.inventory.main[1].tag, potion.tag) && busy.inventory.main[1].tag !== potion.tag, JSON.stringify(busy.inventory.main[1]?.tag));
    const more = { ...potion.tag, extra: 'x'.repeat(40000) };
    r.send([[m.SB.SetCreativeModeSlot, 2, ['potion', 1, 0, more]]]);
    step(host, 2);
    const kept = busy.inventory.main[2]?.tag;
    check('items: a potion with more on it is the creative tab\'s potion, the more left off', kept && m.sameTag(kept, potion.tag) && !('extra' in kept), JSON.stringify(kept)?.slice(0, 100));
    r.send([[m.SB.SetCreativeModeSlot, 3, ['potion', 1, 0, { Potion: 'minecraft:no_such_potion' }]]]);
    step(host, 2);
    check('items: a potion no tab has is a plain potion', busy.inventory.main[3]?.item.id === 'potion' && !busy.inventory.main[3].tag, JSON.stringify(busy.inventory.main[3]?.tag));
    check('items: (and it\'s still in)', !r.gone);
    r.send([[m.SB.Disconnect, 'bye']]);
    step(host, 2);
  }

  check('host: Alex is the only guest left, and plays on', host.server.guestCount() === 1 && a.session.state === 'play' && players() === 2, `${host.server.guestCount()} guests, ${players()} players`);
  check('host: everyone let go is "left the game"', host.chat.filter((t) => / left the game$/.test(t)).length === n + 1, `${host.chat.filter((t) => / left the game$/.test(t)).length} of ${n + 1}`);
  // (the world is as it was, bar the block Busy broke, and Alex's copy of it the same)
  step(host, 3);
  assertMirrorEquals(host, a, 'after every attack');
}

// ---------------------------------------------------------------------------
// a guest: a host that sends what it can't take is left, saying why
{
  const LOGIN = {
    playerId: 7, worldName: 'Elsewhere', dimension: 'overworld', gameMode: 'creative', difficulty: 'normal', hardcore: false, gameRules: { doDaylightCycle: true },
    gameTime: 100, dayTime: 100, raining: false, thundering: false, rainLevel: 0, thunderLevel: 0, x: 0.5, y: 65, z: 0.5, yRot: 0, xRot: 0, viewDistance: 3, hostName: 'Other',
  };
  /** a host that's only a transport: it says what the test says */
  function fakeHost() {
    const net = new m.MemoryNetwork();
    const f = { m, net, guests: [], got: [], peer: null };
    net.host.onPeer((peer, joined) => {
      if (joined) f.peer = peer;
    });
    net.host.onMessage((_peer, data) => f.got.push(...m.decode(data, m.MAX_GUEST_MESSAGE)));
    f.send = (packets) => net.host.send(f.peer, m.encode(packets));
    f.sendBytes = (b) => net.host.send(f.peer, b);
    // (with MP_LAG, SETTLE more, as step() does)
    f.tick = (k = 1) => {
      for (let i = 0; i < k + SETTLE; i++) {
        net.deliver();
        for (const g of f.guests) g.session.tick();
        net.deliver();
      }
    };
    f.said = (id) => f.got.filter((p) => p[0] === id);
    return f;
  }
  const blocks = (fill) => Array.from({ length: m.SECTIONS }, (_, s) => (s === 4 ? new Uint16Array(4096).fill(fill) : null));
  const chunk = (cx, cz, { fill = m.S('stone'), biome = m.B.plains } = {}) => [m.CB.LevelChunk, cx, cz, blocks(fill), new Uint8Array(256).fill(biome), null, []];

  /** a guest let in by a fake host, which then sends what `send` does: the guest must leave, saying why */
  function badHost(label, send, want, { login = true } = {}) {
    const f = fakeHost();
    const g = makeGuest(f, 'Alex');
    f.tick(1);
    const helloed = f.said(m.SB.Hello).length === 1;
    if (login) {
      f.send([[m.CB.Login, LOGIN], chunk(0, 0)]);
      f.tick(1);
    }
    const inGame = !login || (g.session.state === 'play' && g.world.getState(0, 0, 0) === m.S('stone'));
    let threw = null;
    try {
      send(f, g);
      f.tick(2);
    } catch (e) {
      threw = e;
    }
    const reason = g.disconnected;
    check(`host sends ${label}: the guest leaves, saying why`, helloed && inGame && !threw && reason !== null && want.test(reason), threw ? String(threw.stack ?? threw).slice(0, 300) : `${reason}`);
    check(`host sends ${label}: (and tells the host)`, f.said(m.SB.Disconnect).some((p) => p[1] === reason) && g.session.state === 'closed');
  }

  badHost('garbage', (f) => f.sendBytes(bytes([0xfe, 1, 2])), /^Bad data from the host: unknown tag 254/);
  badHost('something else before letting it in', (f) => f.send([[m.CB.KeepAlive, 1]]), /^Bad data from the host: expected to be let in first$/, { login: false });
  badHost('a login that isn\'t one', (f) => f.send([[m.CB.Login, { ...LOGIN, x: 'here' }]]), /^Bad data from the host: bad login$/, { login: false });
  badHost('a login with a view distance of a thousand', (f) => f.send([[m.CB.Login, { ...LOGIN, viewDistance: 1000 }]]), /^Bad data from the host: bad login$/, { login: false });
  badHost('a second login', (f) => f.send([[m.CB.Login, LOGIN]]), /^Bad data from the host: let in twice$/);
  badHost('an unknown packet', (f) => f.send([[99, 1]]), /^Bad data from the host: unknown packet 99$/);
  badHost('a packet only a guest sends', (f) => f.send([[m.SB.Chat + 100, 'hi']]), /^Bad data from the host: unknown packet/);
  badHost('a chunk of blocks that don\'t exist', (f) => f.send([chunk(1, 0, { fill: 65535 })]), /^Bad data from the host: a block that does not exist$/);
  badHost('a chunk of biomes that don\'t exist', (f) => f.send([chunk(1, 0, { biome: 250 })]), /^Bad data from the host: a biome that does not exist$/);
  badHost('a chunk with a section of the wrong size', (f) => f.send([[m.CB.LevelChunk, 1, 0, [new Uint16Array(10)], new Uint8Array(256), null, []]]), /^Bad data from the host: packet \d+: bad field 2$/);
  badHost('a block change to a block that doesn\'t exist', (f) => f.send([[m.CB.BlockUpdates, new Int32Array([0, 0, 0, 65535])]]), /^Bad data from the host: a block that does not exist$/);
  badHost('a block change off the world', (f) => f.send([[m.CB.BlockUpdates, new Int32Array([0, 100000, 0, 1])]]), /^Bad data from the host: a block that does not exist$/);
  badHost('a block entity of the wrong shape', (f) => f.send([[m.CB.BlockEntityData, { id: 'chest', x: 0, y: 0, z: 0, items: 'lots' }]]), /^Bad data from the host: bad block entity$/);
  badHost('a player whose name is too long', (f) => f.send([[m.CB.AddPlayer, 9, 'abc', 'x'.repeat(17), 0.5, 65, 0.5, 0, 0, 0, 0, 0, 'creative', [null, null, null, null, null, null]]]), /^Bad data from the host: packet \d+: bad field 2$/);
  badHost('a sound off the world', (f) => f.send([[m.CB.Sound, 'block.stone.break', 1e9, 64, 0, 1, 1]]), /^Bad data from the host: packet \d+: bad field 1$/);
  badHost('rain of 2', (f) => f.send([[m.CB.Weather, true, false, 2, 0]]), /^Bad data from the host: packet \d+: bad field 2$/);
  badHost('a chat line of 5000 characters', (f) => f.send([[m.CB.SystemChat, 'x'.repeat(5000), false]]), /^Bad data from the host: packet \d+: bad field 0$/);
  badHost('a message past 16 MB', (f) => f.sendBytes(new Uint8Array(m.MAX_HOST_MESSAGE + 1)), /^Bad data from the host: too much, too fast$/);
  badHost(`more than ${m.MAX_HOST_BACKLOG} messages before a tick`, (f) => {
    for (let i = 0; i <= m.MAX_HOST_BACKLOG; i++) f.send([[m.CB.KeepAlive, 1]]);
  }, /^Bad data from the host: too much, too fast$/);
  check('prototype: still nothing reached Object.prototype', ({}).polluted === undefined);

  // what's fine is taken: a host's chunks, sounds and particles it knows of; a sound or particle it doesn't is let be
  const f = fakeHost();
  const g = makeGuest(f, 'Alex');
  f.tick(1);
  f.send([[m.CB.Login, LOGIN], chunk(0, 0), chunk(1, 0), [m.CB.Sound, 'no.such.sound', 1, 64, 1, 1, 1], [m.CB.LevelParticles, 'noSuchParticles', [1, 2, 3]], [m.CB.LevelParticles, 'blockBreak', [1, 64, 1, 1]]]);
  f.tick(2);
  check('guest: a host\'s good data is taken (chunks)', g.session.state === 'play' && g.world.getState(16, 0, 0) === m.S('stone') && g.world.chunks.size === 2, `${g.session.state} ${g.world?.chunks.size}`);
  check('guest: a particle kind it doesn\'t know is let be (only the listed ones are made)', !g.level.particleCalls.some((c) => c.method === 'noSuchParticles') && g.level.particleCalls.some((c) => c.method === 'blockBreak'));
}

// ---------------------------------------------------------------------------
// the LAN list: what other windows say of their worlds is shown as plain text, or not at all
{
  // (its clock held still: nothing heard here goes stale while the test waits)
  const list = new m.LanWorldList(() => 0);
  const ch = new BroadcastChannel('mc-mp');
  const say = (w) => ch.postMessage({ t: 'world', protocol: m.PROTOCOL_VERSION, build: m.BUILD_ID, players: 1, max: 8, ...w });
  say({ id: '0123456789abcdef', name: '§4Red <b>World</b>\u0007', host: 'Hosty§k' });
  say({ id: 'fedcba9876543210', name: 'x'.repeat(500), host: 'y'.repeat(100) });
  say({ id: '../../etc', name: 'Bad id', host: 'h' });
  say({ id: 'aaaaaaaaaaaaaaaa', name: 'Bad count', host: 'h', players: -1 });
  say({ id: 'bbbbbbbbbbbbbbbb', name: 'Bad protocol', host: 'h', protocol: 'one' });
  ch.postMessage('just text');
  ch.postMessage(null);
  for (let i = 0; i < 100; i++) say({ id: `${String(i).padStart(4, '0')}dddddddddddd`, name: `Flood ${i}`, host: 'f' });
  // (they come in the order sent: once the flood fills the list, everything before it has been heard)
  for (let waited = 0; list.worlds().length < 32 && waited < 10000; waited += 25) await new Promise((res) => setTimeout(res, 25));
  await new Promise((res) => setTimeout(res, 100));
  const worlds = list.worlds();
  const red = worlds.find((w) => w.id === '0123456789abcdef');
  check('lan: a world\'s name and host come as plain text (no formatting codes or control characters)', red?.name === 'Red <b>World</b>' && red?.host === 'Hosty', JSON.stringify(red));
  const long = worlds.find((w) => w.id === 'fedcba9876543210');
  check('lan: cut to length (a name 64, a host 16)', long?.name.length === 64 && long?.host.length === 16);
  check('lan: a bad id, a bad count or protocol, or not an announcement: not listed', !worlds.some((w) => /^Bad/.test(w.name)));
  check('lan: at most 32 worlds listed at once', worlds.length === 32, `${worlds.length}`);
  list.close();
  ch.close();
}

await exitWithStatus(close);
