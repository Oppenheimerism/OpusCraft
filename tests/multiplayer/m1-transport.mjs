// Multiplayer M1: the transport the game uses between two windows of a browser (net/transport/broadcastChannel.ts),
// here between ends in one process (Node has BroadcastChannel too). A guest knocks on the world's channel and is let in
// on a channel of its own; bytes go both ways as they were sent; either end closing is heard by the other; posts that
// aren't the protocol's are ignored; a guest nobody answers gives up after vanilla's 30 seconds. And a whole visit over
// it: login, chunks, a block placed, leaving.

import { loadNet, flatHost, makeGuest, hostCopy, assertMirrorEquals, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet(['/src/net/transport/broadcastChannel.ts']);

/** waits (the channels deliver between tasks) until `cond` holds, 5 s at most; whether it did */
async function until(cond, ms = 5000) {
  for (let t = 0; t < ms && !cond(); t += 5) await new Promise((r) => setTimeout(r, 5));
  return cond();
}
const settle = () => new Promise((r) => setTimeout(r, 100));
/** an end's peers and messages, written down */
function listen(end) {
  const e = { peers: [], got: [] };
  end.onPeer((p, joined) => e.peers.push([p, joined]));
  end.onMessage((p, d) => e.got.push([p, [...d].join()]));
  return e;
}
const joined = (e, p) => e.peers.some(([q, j]) => q === p && j);
const left = (e, p) => e.peers.some(([q, j]) => q === p && !j);

// ---------------------------------------------------------------------------
// let in, bytes both ways, and each end hearing the other go
{
  const id = m.randomId();
  const host = new m.BroadcastHostTransport(id);
  const h = listen(host);
  const a = new m.BroadcastGuestTransport(id), b = new m.BroadcastGuestTransport(id);
  const ea = listen(a), eb = listen(b);
  await until(() => joined(ea, m.HOST_PEER) && joined(eb, m.HOST_PEER));
  check('knock: the host lets each guest in, and hears of it', joined(h, a.peerId) && joined(h, b.peerId) && a.peerId !== b.peerId);
  check('knock: each guest hears the host take it in', joined(ea, m.HOST_PEER) && joined(eb, m.HOST_PEER));
  a.send(m.HOST_PEER, new Uint8Array([1, 2, 3, 250]));
  b.send(m.HOST_PEER, new Uint8Array([7]));
  host.send(a.peerId, new Uint8Array([9, 8]));
  await until(() => h.got.length === 2 && ea.got.length === 1);
  await settle();
  check('data: the host gets each guest\'s bytes, as sent, from that guest', h.got.some(([p, d]) => p === a.peerId && d === '1,2,3,250') && h.got.some(([p, d]) => p === b.peerId && d === '7'));
  check('data: a guest gets what the host sent it, and nobody else does', ea.got.length === 1 && ea.got[0][0] === m.HOST_PEER && ea.got[0][1] === '9,8' && eb.got.length === 0);
  // a big message (a tick's chunks) goes whole
  const big = new Uint8Array(3 << 20).map((_, i) => i & 255);
  host.send(b.peerId, big);
  await until(() => eb.got.length === 1);
  check('data: 3 MB goes whole', eb.got[0]?.[1] === [...big].join());
  a.close();
  await until(() => left(h, a.peerId));
  check('bye: the host hears a guest leave', left(h, a.peerId));
  a.send(m.HOST_PEER, new Uint8Array([5]));
  host.send(a.peerId, new Uint8Array([5]));
  await settle();
  check('bye: nothing more goes either way', h.got.length === 2 && ea.got.length === 1);
  host.disconnect(b.peerId);
  await until(() => left(eb, m.HOST_PEER));
  check('bye: a guest the host lets go hears it', left(eb, m.HOST_PEER) && left(h, b.peerId));
  const c = new m.BroadcastGuestTransport(id), ec = listen(c);
  await until(() => joined(ec, m.HOST_PEER));
  host.close();
  await until(() => left(ec, m.HOST_PEER));
  check('close: the world closing is heard by every guest in it', left(ec, m.HOST_PEER));
  const late = new m.BroadcastGuestTransport(id), el = listen(late);
  await settle();
  check('close: nobody is let in afterwards', !joined(el, m.HOST_PEER));
  late.close();
}

// ---------------------------------------------------------------------------
// posts that aren't the protocol's (from any page of the same origin) are ignored
{
  const id = m.randomId();
  const host = new m.BroadcastHostTransport(id);
  const h = listen(host);
  const door = new BroadcastChannel(`mc-mp:${id}`);
  for (const post of [null, 'connect', 42, [1], { t: 'connect' }, { t: 'connect', from: 5 }, { t: 'connect', from: '../../etc' }, { t: 'connect', from: 'NOT-HEX-AT-ALL' }, { t: 'connect', from: 'a'.repeat(65) }, { t: 'data', d: new Uint8Array(1) }])
    door.postMessage(post);
  await settle();
  check('door: knocks that aren\'t one let nobody in', h.peers.length === 0, JSON.stringify(h.peers));
  const g = new m.BroadcastGuestTransport(id), eg = listen(g);
  await until(() => joined(eg, m.HOST_PEER));
  const pair = new BroadcastChannel(`mc-mp:${id}:${g.peerId}`);
  for (const post of [null, { t: 'data', side: 'g', d: 'text' }, { t: 'data', side: 'g', d: [1, 2] }, { t: 'data', side: 'g' }, { t: 'data', d: new Uint8Array(1) }, { t: 'shout', side: 'g' }])
    pair.postMessage(post);
  await settle();
  check('pair: posts that aren\'t bytes from the guest\'s side aren\'t delivered', h.got.length === 0, JSON.stringify(h.got));
  door.postMessage({ t: 'connect', from: g.peerId });
  await settle();
  check('door: a guest already in knocking again changes nothing', h.peers.length === 1 && !left(h, g.peerId));
  pair.close();
  door.close();
  host.close();
  await until(() => left(eg, m.HOST_PEER));
}

// ---------------------------------------------------------------------------
// nobody answers: the guest waits vanilla's 30 seconds (a busy window next door can take a while), then gives up
{
  const real = globalThis.setTimeout;
  let timer = null;
  globalThis.setTimeout = (fn, ms, ...rest) => {
    if (ms === 30_000) return (timer = { fn, ms }), 0;
    return real(fn, ms, ...rest);
  };
  let g;
  try {
    g = new m.BroadcastGuestTransport(m.randomId());
  } finally {
    globalThis.setTimeout = real;
  }
  const eg = listen(g);
  await settle();
  check('nobody answers: the guest waits 30 s for an answer', timer?.ms === 30_000 && eg.peers.length === 0);
  timer.fn();
  check('nobody answers: then gives up, and hears the host isn\'t there', eg.peers.length === 1 && eg.peers[0][0] === m.HOST_PEER && eg.peers[0][1] === false);
  // (an answer that comes late, but in time, lets it in: a slow host)
  const id = m.randomId();
  let slowTimer = null;
  globalThis.setTimeout = (fn, ms, ...rest) => (ms === 30_000 ? ((slowTimer = fn), 0) : real(fn, ms, ...rest));
  let slow;
  try {
    slow = new m.BroadcastGuestTransport(id);
  } finally {
    globalThis.setTimeout = real;
  }
  const es = listen(slow);
  await new Promise((r) => real(r, 300));
  // (the host's window only now gets round to the knock: it was posted before this host listened, so it knocks again
  // by hand here, as the same guest)
  const host = new m.BroadcastHostTransport(id);
  const h = listen(host);
  new BroadcastChannel(`mc-mp:${id}`).postMessage({ t: 'connect', from: slow.peerId });
  await until(() => joined(es, m.HOST_PEER));
  check('slow host: an answer after a while still lets the guest in', joined(es, m.HOST_PEER) && joined(h, slow.peerId));
  slowTimer?.();
  await settle();
  check('slow host: (and its timer, run late, changes nothing)', !left(es, m.HOST_PEER));
  host.close();
  await until(() => left(es, m.HOST_PEER));
}

// ---------------------------------------------------------------------------
// a whole visit over it: the host's server on one end, a guest's session on the other
{
  const id = m.randomId();
  const bh = new m.BroadcastHostTransport(id);
  const host = flatHost(m, 3, { transport: bh, x: -20.5, z: -20.5 });
  const g = makeGuest(host, 'Alex', { transport: new m.BroadcastGuestTransport(id) });
  /** the game's ticks, with the channels' deliveries between them, until `cond` or `n` ticks */
  async function play(n, cond = () => false) {
    for (let i = 0; i < n && !cond(); i++) {
      host.server.receive();
      host.level.tick();
      host.server.tick();
      await new Promise((r) => setTimeout(r, 2));
      g.session.tick();
      await new Promise((r) => setTimeout(r, 2));
    }
    return cond();
  }
  check('visit: the guest logs in over the channels', await play(200, () => g.session.state === 'play'), g.session.state);
  check('visit: the host has its player', hostCopy(host, g) !== null && host.chat.includes('§eAlex joined the game'));
  check('visit: its chunks come (37 for view distance 3)', await play(200, () => g.world.chunks.size === 37), `${g.world?.chunks.size}`);
  await play(5);
  assertMirrorEquals(host, g, 'over the channels');
  const p = g.player;
  p.flying = true;
  p.moveTo(2.5, 67, 2.5, 0, 90);
  p.inventory.main[0] = new m.ItemStack(m.getItem('gold_block'), 64);
  p.inventory.version++;
  await play(5);
  g.session.input(false, false, true, false);
  check('visit: a block it places is the host\'s', await play(50, () => host.world.getState(2, 64, 2) === m.S('gold_block') && g.world.getState(2, 64, 2) === m.S('gold_block')));
  g.session.chat('hello over the channels');
  check('visit: its chat reaches the host', await play(50, () => host.chat.includes('<Alex> hello over the channels')));
  g.session.leave();
  check('visit: it leaves, and the host drops it', await play(50, () => hostCopy(host, g) === null && host.chat.includes('§eAlex left the game')));
  host.server.close('The host closed the world.');
}

await exitWithStatus(close);
