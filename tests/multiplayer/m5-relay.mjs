// Stage 5: the relay (scripts/relay.mjs), on a server of its own in this process, hooked up as vite.config.ts hooks it
// up (with the game's limits from src/net/config.ts), and tried with real WebSockets (the ws package's client, which
// can say what a browser says, or what a browser wouldn't): from this computer's loopback address and from its address
// on the network. Who may connect (the page's own site only, asked for by an address or an allowed name), who may host
// (a page on this computer asked for as localhost, not one through a proxy or tunnel), one host at a time, the host's
// and guests' frames passed along as they are, a guest let go by the host, the host going, the Multiplayer screens told,
// and the relay's own limits: connections in all and from one place, guests, a message's size and a guest's rate, how
// much may wait for a slow guest, saying nothing in time, going quiet, and frames that aren't the relay's.

import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { loadConfigFromFile } from 'vite';
import { WebSocket } from 'ws';
import { attachRelay, CLOSE, OP } from '../../scripts/relay.mjs';
import { load, check, exitWithStatus } from '../fixes/lib.mjs';

const { m, close } = await load(['/src/net/config.ts']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAN_IP = Object.values(networkInterfaces()).flat().find((i) => i && !i.internal && (i.family === 'IPv4' || i.family === 4))?.address ?? null;
if (!LAN_IP) console.log('(no network address here: the checks from another computer are left out)');

/** a server with the relay on it, listening on every address; `opts` over the quick timings the tests use */
async function relayServer(opts = {}) {
  const server = http.createServer((_q, r) => r.end('page'));
  const lines = [];
  const relay = attachRelay(server, { handshakeMs: 400, idleMs: 800, pingMs: 100, log: (s) => lines.push(s), ...opts });
  // (as Vite's servers do: every socket let go when it stops, upgraded ones too)
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((r) => server.listen(0, '0.0.0.0', r));
  const port = server.address().port;
  const stop = () =>
    new Promise((r) => {
      relay.close();
      server.close(() => r());
      for (const s of sockets) s.destroy();
    });
  return { server, relay, port, lines, stop };
}

/**
 * a WebSocket to `srv`'s relay as `role`: from this computer ('local', 127.0.0.1) or from its network address ('lan'),
 * with the Origin of the page it would be on unless `origin` says otherwise, and any `headers`. What it hears is in
 * `got` (binary as Buffers, text as strings); `opened` says whether the relay took it, `status` what it answered if not;
 * `closed` resolves with the close's code and reason
 */
function connect(srv, role, { via = 'local', origin, headers = {}, host, autoPong = true, path = '/__mp' } = {}) {
  const addr = via === 'lan' ? LAN_IP : '127.0.0.1';
  const hostHeader = host ?? (via === 'lan' ? `${LAN_IP}:${srv.port}` : `localhost:${srv.port}`);
  const c = { got: [], opened: false, status: null, code: null, reason: null };
  const ws = new WebSocket(`ws://${addr}:${srv.port}${path}${role ? `?role=${role}` : ''}`, {
    headers: { Host: hostHeader, ...headers },
    ...(origin === null ? {} : { origin: origin ?? `http://${hostHeader}` }),
    autoPong,
  });
  c.ws = ws;
  c.ready = new Promise((res) => {
    ws.on('open', () => {
      c.opened = true;
      res(c);
    });
    ws.on('unexpected-response', (_q, r) => {
      c.status = r.statusCode;
      res(c);
    });
    ws.on('error', () => res(c));
  });
  c.closed = new Promise((res) =>
    ws.on('close', (code, reason) => {
      c.code = code;
      c.reason = reason.toString();
      res(c);
    }),
  );
  ws.on('message', (d, binary) => c.got.push(binary ? Buffer.from(d) : d.toString()));
  return c;
}

/** what a host hears, frame by frame: [op, guest id, payload] */
const frames = (h) => h.got.filter((d) => Buffer.isBuffer(d)).map((b) => [b[0], b.readUInt32BE(1), b.subarray(5)]);
const hostFrame = (op, id, payload = Buffer.alloc(0)) => Buffer.concat([Buffer.from([op, id >>> 24, (id >>> 16) & 255, (id >>> 8) & 255, id & 255]), payload]);
/** a host page, open with its world said */
async function openHost(srv, world = { id: 'w-1', name: 'World', host: 'Host', players: 1, max: 8, protocol: 6, build: 'b' }) {
  const h = await connect(srv, 'host').ready;
  if (h.opened) h.ws.send(JSON.stringify({ t: 'world', world }));
  return h;
}
const until = async (f, ms = 2000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await sleep(10);
  return !!f();
};

// ---------------------------------------------------------------------------
// who may connect
{
  const srv = await relayServer();
  const refused = async (label, role, opts, want = 403) => {
    const c = await connect(srv, role, opts).ready;
    check(`who: ${label} is refused (${want})`, !c.opened && c.status === want, `opened ${c.opened} status ${c.status}`);
  };
  await refused('a page that says no Origin', 'list', { origin: null });
  await refused("another site's page", 'list', { origin: 'http://evil.example' });
  await refused('a page of the same address on another port', 'list', { origin: `http://localhost:${srv.port + 1}` });
  await refused('an Origin of "null" (a file, a sandboxed frame)', 'list', { origin: 'null' });
  await refused('a page asked for by a name that isn\'t this computer\'s (DNS rebinding), even with its Origin to match', 'list', { host: `evil.example:${srv.port}` });
  await refused("a tunnel's name, when it's not in tunnel mode", 'guest', { host: 'abc.trycloudflare.com', origin: 'https://abc.trycloudflare.com', headers: { 'Cf-Connecting-Ip': '203.0.113.9' } });
  await refused('a kind of connection there is none of', 'player', {}, 400);
  await refused('no kind at all', null, {}, 400);
  const other = connect(srv, 'list', { path: '/elsewhere' });
  await Promise.race([other.ready, sleep(300)]);
  check("who: a WebSocket to another path isn't the relay's to answer (it's left alone)", !other.opened && other.status === null);
  other.ws.terminate();
  const ok = await connect(srv, 'list').ready;
  check('who: a page of the site, asked for as localhost, is let in', ok.opened);
  if (LAN_IP) {
    const lan = await connect(srv, 'list', { via: 'lan' }).ready;
    check('who: so is one asked for by the network address, from another computer', lan.opened);
    lan.ws.close();
  }
  ok.ws.close();
  await srv.stop();

  const tun = await relayServer({ allowedHosts: ['.trycloudflare.com'], tunnel: true });
  const t = await connect(tun, 'list', { host: 'abc.trycloudflare.com', origin: 'https://abc.trycloudflare.com', headers: { 'Cf-Connecting-Ip': '203.0.113.9', 'X-Forwarded-Proto': 'https' } }).ready;
  check("who: a tunnel's name, in tunnel mode (npm run lan -- --tunnel), is let in", t.opened);
  const t2 = await connect(tun, 'list', { host: 'evil.example', origin: 'https://evil.example' }).ready;
  check('who: but no other name', !t2.opened && t2.status === 403);
  t.ws.close();
  await tun.stop();
}

// ---------------------------------------------------------------------------
// who may host
{
  const srv = await relayServer();
  const refused = async (label, opts) => {
    const c = await connect(srv, 'host', opts).ready;
    check(`host: ${label} can't`, !c.opened && c.status === 403, `opened ${c.opened} status ${c.status}`);
  };
  if (LAN_IP) {
    await refused('a page on another computer', { via: 'lan' });
    await refused('a page on this computer asked for by its network address', { via: 'local', host: `${LAN_IP}:${srv.port}` });
  }
  for (const [h, v] of [['X-Forwarded-For', '203.0.113.9'], ['Cf-Connecting-Ip', '203.0.113.9'], ['Forwarded', 'for=203.0.113.9'], ['X-Real-Ip', '203.0.113.9'], ['Via', '1.1 proxy']])
    await refused(`one come through a proxy or a tunnel on this computer (${h})`, { headers: { [h]: v } });
  const h = await openHost(srv);
  check('host: a page on this computer, asked for as localhost, can', h.opened);
  await until(() => h.got.length > 0);
  const hello = JSON.parse(h.got.find((d) => typeof d === 'string') ?? '{}');
  check('host: and is told where friends can open the game (this computer\'s network addresses)', hello.t === 'relay' && Array.isArray(hello.lan) && hello.tunnel === false && (!LAN_IP || hello.lan.includes(`http://${LAN_IP}:${srv.port}`)), JSON.stringify(hello));
  const h2 = await connect(srv, 'host').ready;
  await h2.closed;
  check('host: only one at a time: a second is told another page hosts already', h2.code === CLOSE.HOST_TAKEN && h2.reason === 'host-taken', `${h2.code} ${h2.reason}`);
  h.ws.close();
  await h.closed;
  await sleep(50);
  const h3 = await openHost(srv);
  check('host: once the first has gone, another can', h3.opened && (await Promise.race([h3.closed.then(() => false), sleep(150).then(() => true)])));
  h3.ws.close();
  await srv.stop();

  const tun = await relayServer({ allowedHosts: ['.trycloudflare.com'], tunnel: true });
  const th = await connect(tun, 'host').ready;
  await until(() => th.got.length > 0);
  const said = JSON.parse(th.got[0] ?? '{}');
  check('host: in tunnel mode, it hears friends come through the tunnel (no network addresses)', said.tunnel === true && said.lan.length === 0, JSON.stringify(said));
  const viaTunnel = await connect(tun, 'host', { host: 'abc.trycloudflare.com', origin: 'https://abc.trycloudflare.com', headers: { 'Cf-Connecting-Ip': '203.0.113.9' } }).ready;
  check("host: a page come in through the tunnel can't host", !viaTunnel.opened && viaTunnel.status === 403);
  th.ws.close();
  await tun.stop();
}

// ---------------------------------------------------------------------------
// guests, and the host's frames
{
  const srv = await relayServer();
  const early = connect(srv, 'guest');
  await early.closed;
  check('guest: with no world open, it\'s told so', early.opened && early.code === CLOSE.NO_HOST && early.reason === 'no-host', `${early.code} ${early.reason}`);

  const h = await openHost(srv);
  const g = await connect(srv, 'guest', { via: LAN_IP ? 'lan' : 'local' }).ready;
  await until(() => frames(h).length >= 1);
  const [join] = frames(h);
  const gid = join?.[1];
  check('guest: the host hears it join, with where it connects from', join?.[0] === OP.JOIN && join[2].toString() === (LAN_IP ?? '127.0.0.1'), join ? `${join[0]} ${join[2]}` : 'none');
  g.ws.send(Buffer.from([0, 1, 2, 3, 250]));
  await until(() => frames(h).length >= 2);
  const d = frames(h)[1];
  check("guest: what it sends reaches the host as it is, under the guest's number", d?.[0] === OP.DATA && d[1] === gid && d[2].equals(Buffer.from([0, 1, 2, 3, 250])));
  h.ws.send(hostFrame(OP.DATA, gid, Buffer.from([0, 9, 8, 7])));
  await until(() => g.got.length >= 1);
  check("guest: and what the host sends it reaches it as it is, the relay's header gone", Buffer.isBuffer(g.got[0]) && g.got[0].equals(Buffer.from([0, 9, 8, 7])));
  h.ws.send(hostFrame(OP.DATA, 999999, Buffer.from([0, 1])));
  await sleep(50);
  check("guest: what the host sends to a guest that isn't there goes nowhere (the host isn't let go for it)", h.ws.readyState === WebSocket.OPEN);

  // (let go by the host: after what was sent it, and the host isn't told what it did itself)
  h.ws.send(hostFrame(OP.DATA, gid, Buffer.from([0, 42])));
  h.ws.send(hostFrame(OP.KICK, gid));
  await g.closed;
  check('guest: let go by the host, it hears what was sent it first, then the close', g.got.length === 2 && g.got[1].equals(Buffer.from([0, 42])) && g.code === CLOSE.KICKED, `${g.got.length} ${g.code}`);
  await sleep(50);
  check("guest: the host isn't told of a guest it let go itself", !frames(h).some((f) => f[0] === OP.LEAVE && f[1] === gid));

  const g2 = await connect(srv, 'guest').ready;
  await until(() => frames(h).filter((f) => f[0] === OP.JOIN).length >= 2);
  const gid2 = frames(h).filter((f) => f[0] === OP.JOIN)[1][1];
  check('guest: each guest gets a number of its own', gid2 !== gid);
  g2.ws.send(Buffer.from([0]));
  g2.ws.close();
  await until(() => frames(h).some((f) => f[0] === OP.LEAVE && f[1] === gid2));
  check('guest: one that leaves: the host hears it went', frames(h).some((f) => f[0] === OP.LEAVE && f[1] === gid2));

  const g3 = await connect(srv, 'guest').ready;
  const g4 = await connect(srv, 'guest').ready;
  g3.ws.send(Buffer.from([0]));
  g4.ws.send(Buffer.from([0]));
  await sleep(50);
  h.ws.close();
  await Promise.all([g3.closed, g4.closed]);
  check('host goes: every guest is told the host went ("host-left")', [g3, g4].every((c) => c.code === CLOSE.HOST_LEFT && c.reason === 'host-left'), `${g3.code} ${g4.code}`);
  await srv.stop();
}

// ---------------------------------------------------------------------------
// the Multiplayer screens
{
  const srv = await relayServer();
  const l = await connect(srv, 'list').ready;
  await until(() => l.got.length >= 1);
  check('list: told at once that no world is open', l.got[0] === '{"t":"worlds","worlds":[]}', l.got[0]);
  const world = { id: 'w-2', name: 'Friends', host: 'Hosty', players: 1, max: 8, protocol: 6, build: 'b' };
  const h = await openHost(srv, world);
  await until(() => l.got.length >= 2);
  check("list: told when a world opens: what the host said of it, as it said it", JSON.stringify(JSON.parse(l.got[1]).worlds) === JSON.stringify([world]), l.got[1]);
  h.ws.send(JSON.stringify({ t: 'world', world: { ...world, players: 2 } }));
  await until(() => l.got.length >= 3);
  check('list: and when it changes', JSON.parse(l.got[2] ?? '{}').worlds?.[0]?.players === 2);
  h.ws.send(JSON.stringify({ t: 'world', world: { ...world, players: 2 } }));
  await sleep(50);
  check("list: not when it's said again the same", l.got.length === 3);
  const late = await connect(srv, 'list').ready;
  await until(() => late.got.length >= 1);
  check('list: a screen opened later hears of it at once', JSON.parse(late.got[0] ?? '{}').worlds?.[0]?.name === 'Friends');
  h.ws.close();
  await until(() => l.got.length >= 4);
  check('list: told when the world closes', l.got[3] === '{"t":"worlds","worlds":[]}');
  l.ws.send('hello?');
  await l.closed;
  check('list: a screen that says anything is let go', l.code === CLOSE.BAD);
  late.ws.close();
  await srv.stop();
}

// ---------------------------------------------------------------------------
// where a guest connects from, for the join code's cooldown
{
  const srv = await relayServer();
  const h = await openHost(srv);
  const joins = () => frames(h).filter((f) => f[0] === OP.JOIN).map((f) => f[2].toString());
  const tunnel = { host: `localhost:${srv.port}` };
  const a = await connect(srv, 'guest', { ...tunnel, headers: { 'Cf-Connecting-Ip': '203.0.113.9', 'X-Forwarded-For': '198.51.100.1, 203.0.113.9' } }).ready;
  const b = await connect(srv, 'guest', { ...tunnel, headers: { 'X-Forwarded-For': '198.51.100.7, 203.0.113.20' } }).ready;
  const c = await connect(srv, 'guest', { ...tunnel, headers: { Via: '1.1 proxy' } }).ready;
  await until(() => joins().length >= 3);
  check("source: through a tunnel on this computer, a guest is where the tunnel says (Cf-Connecting-Ip)", joins()[0] === '203.0.113.9', joins()[0]);
  check('source: or where the nearest proxy says (the last X-Forwarded-For)', joins()[1] === '203.0.113.20', joins()[1]);
  check('source: or, saying nowhere, "proxied" (one place for all such)', joins()[2] === 'proxied', joins()[2]);
  if (LAN_IP) {
    const d = await connect(srv, 'guest', { via: 'lan', headers: { 'X-Forwarded-For': '203.0.113.99', 'Cf-Connecting-Ip': '203.0.113.99' } }).ready;
    await until(() => joins().length >= 4);
    check("source: a guest on another computer can't say it's somewhere else (headers from it aren't a proxy's)", joins()[3] === LAN_IP, joins()[3]);
    d.ws.close();
  }
  for (const x of [a, b, c]) x.ws.close();
  h.ws.close();
  await srv.stop();
}

// ---------------------------------------------------------------------------
// limits
{
  const perPlace = await relayServer({ maxPerAddress: 3 });
  const h = await openHost(perPlace);
  const lists = [await connect(perPlace, 'list').ready, await connect(perPlace, 'list').ready];
  const third = await connect(perPlace, 'list').ready;
  check('limits: from one place, only so many connections (maxPerAddress)', lists.every((l) => l.opened) && !third.opened && third.status === 503, `${third.opened} ${third.status}`);
  const elsewhere = await connect(perPlace, 'list', { headers: { 'Cf-Connecting-Ip': '203.0.113.8' } }).ready;
  check('limits: another place can still connect', elsewhere.opened);
  lists[0].ws.close();
  await lists[0].closed;
  await sleep(50);
  const again = await connect(perPlace, 'list').ready;
  check('limits: and once one of the first place\'s has closed, it can again', again.opened);
  for (const x of [h, lists[1], elsewhere, again]) x.ws.close();
  await perPlace.stop();

  const guests = await relayServer({ maxGuests: 2 });
  const gh = await openHost(guests);
  const g1 = await connect(guests, 'guest', { headers: { 'Cf-Connecting-Ip': '203.0.113.1' } }).ready;
  const g2 = await connect(guests, 'guest', { headers: { 'Cf-Connecting-Ip': '203.0.113.2' } }).ready;
  const g3 = connect(guests, 'guest', { headers: { 'Cf-Connecting-Ip': '203.0.113.3' } });
  await g3.closed;
  check("limits: only so many guests at once (maxGuests): one more is told it's full", g1.opened && g2.opened && g3.code === CLOSE.FULL, `${g3.code}`);
  for (const x of [gh, g1, g2]) x.ws.close();
  await guests.stop();

  const screens = await relayServer({ maxListeners: 2 });
  const l1 = await connect(screens, 'list', { headers: { 'Cf-Connecting-Ip': '203.0.113.4' } }).ready;
  const l2 = await connect(screens, 'list', { headers: { 'Cf-Connecting-Ip': '203.0.113.5' } }).ready;
  const l3 = connect(screens, 'list', { headers: { 'Cf-Connecting-Ip': '203.0.113.6' } });
  await l3.closed;
  check('limits: only so many Multiplayer screens at once (maxListeners)', l1.opened && l2.opened && l3.code === CLOSE.FULL, `${l3.code}`);
  for (const x of [l1, l2]) x.ws.close();
  await screens.stop();

  const all = await relayServer({ maxConnections: 4 });
  const ah = await openHost(all);
  const some = [];
  for (let i = 0; i < 3; i++) some.push(await connect(all, 'list', { headers: { 'Cf-Connecting-Ip': `203.0.113.${20 + i}` } }).ready);
  const over = await connect(all, 'list', { headers: { 'Cf-Connecting-Ip': '203.0.113.30' } }).ready;
  check('limits: and only so many connections in all (maxConnections)', some.every((c) => c.opened) && !over.opened && over.status === 503, `${over.opened} ${over.status}`);
  for (const x of [ah, ...some]) x.ws.close();
  await all.stop();
}

// ---------------------------------------------------------------------------
// a guest's messages: size and rate
{
  const srv = await relayServer({ maxGuestMessage: 1000, guestMessagesPerSecond: 50, guestBurst: 20, guestBytesPerSecond: 4000, guestBurstBytes: 3000 });
  const h = await openHost(srv);
  const big = await connect(srv, 'guest').ready;
  big.ws.send(Buffer.alloc(1000 + 17));
  await big.closed;
  check('size: a message bigger than the game takes (and the relay\'s framing) ends the guest\'s connection', big.code === 1009, `${big.code}`);
  const fits = await connect(srv, 'guest').ready;
  fits.ws.send(Buffer.alloc(1000));
  await sleep(100);
  check('size: one as big as the game takes goes through', fits.ws.readyState === WebSocket.OPEN && frames(h).some((f) => f[0] === OP.DATA && f[2].length === 1000));
  const text = await connect(srv, 'guest').ready;
  text.ws.send('text');
  await text.closed;
  check("frames: a guest's text frame (the game sends none) ends its connection", text.code === CLOSE.BAD);
  const fast = await connect(srv, 'guest').ready;
  for (let i = 0; i < 25; i++) fast.ws.send(Buffer.from([0, i]));
  await fast.closed;
  check('rate: more messages at once than the burst lets through ends it ("too-much")', fast.code === CLOSE.TOO_MUCH && fast.reason === 'too-much', `${fast.code} ${fast.reason}`);
  const steady = await connect(srv, 'guest').ready;
  for (let i = 0; i < 30; i++) {
    steady.ws.send(Buffer.from([0, i]));
    await sleep(25);
  }
  check('rate: as many at a steady pace (40 a second, under 50) are fine', steady.ws.readyState === WebSocket.OPEN);
  const bulky = await connect(srv, 'guest').ready;
  for (let i = 0; i < 4; i++) bulky.ws.send(Buffer.alloc(900));
  await bulky.closed;
  check('rate: so are too many bytes at once', bulky.code === CLOSE.TOO_MUCH);
  await sleep(50);
  const leaves = frames(h).filter((f) => f[0] === OP.LEAVE).length;
  check('rate: the host hears each guest let go for it went', leaves >= 4, `${leaves}`);
  for (const x of [fits, steady]) x.ws.close();
  h.ws.close();
  await srv.stop();
}

// ---------------------------------------------------------------------------
// a guest that can't keep up with what the host sends it
{
  const srv = await relayServer({ maxGuestBuffer: 256 * 1024 });
  const h = await openHost(srv);
  const g = await connect(srv, 'guest').ready;
  g.ws.send(Buffer.from([0]));
  await until(() => frames(h).length >= 2);
  const gid = frames(h)[0][1];
  // (its end stops reading: what the host sends piles up at the relay)
  g.ws._socket.pause();
  const chunk = Buffer.alloc(1024 * 1024, 7);
  for (let i = 0; i < 64 && !frames(h).some((f) => f[0] === OP.LEAVE); i++) {
    h.ws.send(hostFrame(OP.DATA, gid, chunk));
    await sleep(20);
  }
  await until(() => frames(h).some((f) => f[0] === OP.LEAVE && f[1] === gid), 3000);
  check("slow guest: with more than the relay keeps for it waiting, it's let go and the host told", frames(h).some((f) => f[0] === OP.LEAVE && f[1] === gid));
  g.ws.terminate();
  h.ws.close();
  await srv.stop();
}

// ---------------------------------------------------------------------------
// timeouts, and frames that aren't the relay's
{
  const srv = await relayServer();
  const h = await connect(srv, 'host').ready;
  await h.closed;
  check("handshake: a host that doesn't say what its world is in time is let go", h.code === CLOSE.TIMED_OUT, `${h.code}`);
  const host = await openHost(srv);
  const mute = await connect(srv, 'guest').ready;
  await mute.closed;
  check("handshake: a guest that says nothing in time is let go (\"timed-out\")", mute.code === CLOSE.TIMED_OUT && mute.reason === 'timed-out', `${mute.code}`);
  await until(() => frames(host).some((f) => f[0] === OP.LEAVE));
  check('handshake: and the host hears it went', frames(host).some((f) => f[0] === OP.LEAVE));
  const talker = await connect(srv, 'guest').ready;
  talker.ws.send(Buffer.from([0]));
  await sleep(600);
  check('handshake: one that said something in time stays (answering pings)', talker.ws.readyState === WebSocket.OPEN);
  const deaf = await connect(srv, 'guest', { autoPong: false }).ready;
  deaf.ws.send(Buffer.from([0]));
  const t0 = Date.now();
  await deaf.closed;
  check("idle: one that stops answering pings is let go after the idle time", Date.now() - t0 >= 500 && Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
  await sleep(50);
  const leftIds = frames(host).filter((f) => f[0] === OP.LEAVE).length;
  check('idle: and the host hears it went', leftIds >= 2, `${leftIds}`);
  talker.ws.close();
  host.ws.close();
  await srv.stop();

  const bad = async (label, send) => {
    const s = await relayServer();
    const hh = await openHost(s);
    send(hh.ws);
    await Promise.race([hh.closed, sleep(1000)]);
    check(`frames: a host that sends ${label} is let go`, hh.code === CLOSE.BAD, `${hh.code}`);
    await s.stop();
  };
  await bad('a frame too short for the header', (ws) => ws.send(Buffer.from([2, 0, 0])));
  await bad('a frame of no kind there is', (ws) => ws.send(hostFrame(9, 1)));
  await bad('text that isn\'t JSON', (ws) => ws.send('{nope'));
  await bad('JSON that isn\'t its world', (ws) => ws.send(JSON.stringify({ t: 'other' })));
  await bad('a world too long to be one', (ws) => ws.send(JSON.stringify({ t: 'world', world: { name: 'x'.repeat(4000) } })));

  const s2 = await relayServer();
  const hh = await openHost(s2);
  const raw = await connect(s2, 'guest').ready;
  // (an unmasked frame from a client, which the protocol forbids: the ws package's own check, as for any broken frame)
  raw.ws._socket.write(Buffer.from([0x82, 0x01, 0x00]));
  await Promise.race([raw.closed, sleep(1000)]);
  check('frames: a broken WebSocket frame ends that connection', raw.code === 1002 || raw.code === 1006, `${raw.code}`);
  await until(() => frames(hh).some((f) => f[0] === OP.LEAVE));
  check('frames: and the host hears the guest went', frames(hh).some((f) => f[0] === OP.LEAVE));
  hh.ws.close();
  await s2.stop();
}

// ---------------------------------------------------------------------------
// vite.config.ts: the relay on the preview server, with the game's limits (src/net/config.ts)
{
  const { config } = await loadConfigFromFile({ command: 'serve', mode: 'production', isPreview: true }, 'vite.config.ts');
  const plugin = config.plugins.flat().find((p) => p?.name === 'mp-relay');
  check('vite.config.ts: the relay is one of its plugins, on the preview server and the dev server', !!plugin?.configurePreviewServer && !!plugin?.configureServer);
  const server = http.createServer((_q, r) => r.end('page'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const logger = { info() {}, warn() {}, error() {} };
  plugin.configurePreviewServer({ httpServer: server, config: { preview: { allowedHosts: [] }, logger } });
  plugin.configureServer({ httpServer: null, config: { server: { allowedHosts: [] }, logger } });
  const srv = { port: server.address().port };
  const h = await openHost(srv);
  const g = await connect(srv, 'guest').ready;
  g.ws.send(Buffer.alloc(m.MAX_GUEST_MESSAGE + 1));
  await until(() => frames(h).some((f) => f[0] === OP.DATA));
  check("vite.config.ts: a guest's biggest message (the game's MAX_GUEST_MESSAGE, and the byte in front) goes through", frames(h).some((f) => f[0] === OP.DATA && f[2].length === m.MAX_GUEST_MESSAGE + 1));
  g.ws.send(Buffer.alloc(m.MAX_GUEST_MESSAGE + 17));
  await Promise.race([g.closed, sleep(2000)]);
  check('vite.config.ts: one bigger than that and the framing ends the connection', g.code === 1009, `${g.code}`);
  const hello = JSON.parse(h.got.find((d) => typeof d === 'string') ?? '{}');
  check("vite.config.ts: a server on this computer only tells the host friends can't open it (no network addresses)", hello.t === 'relay' && hello.lan.length === 0 && hello.tunnel === false, JSON.stringify(hello));
  h.ws.close();
  g.ws.terminate();
  await sleep(50);
  await new Promise((r) => server.close(r));
}

await exitWithStatus(close);
