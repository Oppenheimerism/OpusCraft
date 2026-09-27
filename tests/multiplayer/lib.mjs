// Multiplayer test helpers: a host and its guests in one process, over MemoryNetwork and the real codec. The host's
// world is a real one (a Level over a World, stubbed sounds and particles written down); each guest gets a World and
// Level of its own, set up as Game.joinWorld does (isClientSide, chunks lit at once with computeChunkLight). `step()`
// runs host tick → deliver → guest ticks → deliver; `mirrorDiff()` compares what a guest has with the host's world.

import { load, check, exitWithStatus, genLevel, flatLevel } from '../fixes/lib.mjs';
import { WsNetwork, closeWsNetworks, lagSeed } from './net/wsNetwork.mjs';
export { check, exitWithStatus };

/**
 * (stage 5) MP_NET=ws: every network a test makes (m.MemoryNetwork's) goes through the relay over WebSockets instead
 * (net/wsNetwork.mjs), carried by the game's WebSocket transports; MP_LAG=20-200 holds each message back 20 to 200 ms
 * of the tests' time as well, in order (MP_LAG_SEED=n: the same lags again)
 */
export const NET_MODE = process.env.MP_NET === 'ws' ? 'ws' : 'memory';
const LAG = /^(\d+)-(\d+)$/.exec(process.env.MP_LAG ?? '');

export const NET_MODULES = [
  '/src/net/codec.ts', '/src/net/protocol.ts', '/src/net/config.ts', '/src/net/items.ts', '/src/net/chunkData.ts', '/src/net/playerState.ts', '/src/net/playerStatus.ts',
  '/src/net/transport/memory.ts', '/src/net/transport/transport.ts', '/src/net/server/hostServer.ts', '/src/net/server/session.ts',
  '/src/net/client/clientSession.ts', '/src/net/client/mirrorPlayer.ts', '/src/world/dimension.ts', '/src/item/item.ts',
  '/src/world/blockEntity.ts', '/src/game/interaction.ts', '/src/net/offlineUuid.ts', '/src/net/joinCode.ts',
];

/** (stage 2) the entities' side of it: the registry, the fields, the trackers and copies, and the kinds the tests make */
export const ENTITY_MODULES = [
  '/src/net/entityNet.ts', '/src/net/entityData.ts', '/src/net/effects.ts', '/src/net/server/entityTracker.ts', '/src/net/client/entityMirror.ts',
  '/src/game/spawner.ts', '/src/entity/itemEntity.ts', '/src/entity/xpOrb.ts', '/src/entity/boat.ts', '/src/entity/minecart.ts', '/src/entity/arrow.ts',
  '/src/entity/thrownTrident.ts', '/src/entity/endCrystal.ts', '/src/entity/itemFrame.ts', '/src/entity/fireworkRocket.ts', '/src/entity/leash.ts',
  '/src/entity/effects.ts', '/src/entity/living.ts', '/src/entity/mob.ts', '/src/entity/horse.ts', '/src/entity/throwable.ts', '/src/entity/tnt.ts',
];

export async function loadNet(extra = []) {
  const r = await load([...NET_MODULES, ...extra]);
  if (NET_MODE !== 'ws') return r;
  const m = r.m;
  const lag = LAG ? { min: +LAG[1], max: Math.max(+LAG[1], +LAG[2]) } : null;
  m.MemoryNetwork = class extends WsNetwork {
    constructor() {
      super(m, lag);
    }
  };
  const close = r.close;
  r.close = async () => {
    await closeWsNetworks();
    await close();
  };
  console.log(`(the networks go through the relay over WebSockets${lag ? `, with ${lag.min} to ${lag.max} ms of lag (MP_LAG_SEED=${lagSeed})` : ''})`);
  return r;
}

/** sounds and particles, written down */
function recordingLevel(level) {
  const sounds = [], particles = [];
  level.sound = { play: (name, x, y, z, v, p) => sounds.push({ name, x, y, z, v, p }), playUI() {} };
  level.particles = new Proxy({}, { get: (_t, k) => (...args) => particles.push({ method: k, args }) });
  level.sounds = sounds;
  level.particleCalls = particles;
  return level;
}

/** (stage 5) the test hosts' join code */
export const TEST_JOIN_CODE = '7E57C0DE';

/**
 * a host: `world`/`level` from genLevel or flatLevel (chunks made on demand by `makeChunk(cx, cz)` when a guest's
 * ticket asks), its own player at (x, y, z)
 */
export function makeHost(m, { world, level }, { makeChunk, x = 0.5, y = 65, z = 0.5, spawn = [0.5, 65, 0.5], hostName = 'Host', gameMode = 'creative', guestGameMode, transport, hooks: more = {} } = {}) {
  recordingLevel(level);
  const p = new m.Player(level);
  p.setGameMode(gameMode);
  p.moveTo(x, y, z, 0, 0);
  level.player = p;
  level.addEntity(p);
  const net = new m.MemoryNetwork();
  const chat = [], overlays = [], tickets = new Map();
  let breaking = null;
  const hooks = {
    spawnPoint: () => spawn,
    hostName: () => hostName,
    worldName: () => 'Test World',
    chat: (t) => chat.push(t),
    // (stage 3) the host's own action bar
    overlay: (t) => overlays.push(t),
    setTicket(name, t) {
      if (!t) return void tickets.delete(name);
      tickets.set(name, t);
      if (makeChunk)
        for (let cz = t[1] - t[2]; cz <= t[1] + t[2]; cz++)
          for (let cx = t[0] - t[2]; cx <= t[0] + t[2]; cx++) if (!world.getChunk(cx, cz)) makeChunk(cx, cz);
    },
    hostBreaking: () => breaking,
    // (stage 4: the guests' players kept with the world, as a test gives them: loadGuest, saveGuest, leaveInDimension)
    ...more,
  };
  // (the pop of something picked up, as the game's own level plays it: Game.setUpWorld's onTake)
  level.onTake = (e) => level.sound.play(e.type === 'experience_orb' ? 'entity.experience_orb.pickup' : 'entity.item.pickup', e.x, e.y, e.z, 0.2, 1);
  // (stage 3) the guests' game mode, as the LAN screen picks it; creative if the test doesn't say, as before
  // (stage 5: its join code, which the harness's guests give unless a test says otherwise)
  const server = new m.HostServer(level, transport ?? net.host, hooks, { lanId: 'test-world-0000', joinCode: TEST_JOIN_CODE, announce: false, guestGameMode });
  return { m, world, level, player: p, net, server, chat, overlays, tickets, guests: [], makeChunk, setBreaking: (b) => (breaking = b) };
}

/**
 * a guest connecting to `host` as `name` (it says hello once `step` delivers the connection), over `transport` if given;
 * its uuid its name's (stage 4: vanilla's offline uuid, which the host holds it to), unless a test gives another; with
 * the host's join code (stage 5), unless a test gives another
 */
export function makeGuest(host, name = 'Guest', { viewDistance = 3, uuid, code, transport = host.net.connect() } = {}) {
  const { m } = host;
  const g = { name, transport, chat: [], overlays: [], disconnected: null, world: null, level: null, player: null, session: null, chunkAdds: 0, took: [], mounted: [], died: [], respawned: 0, recipes: new Set(), toasts: [], dims: [] };
  const hooks = {
    login(info) {
      const world = new m.World();
      world.dim = m.dimensionById(info.dimension);
      const level = recordingLevel(new m.Level(world, 'guest'));
      level.isClientSide = true;
      level.dayTime = info.dayTime;
      level.gameTime = info.gameTime;
      const p = new m.Player(level);
      p.setGameMode(info.gameMode);
      p.moveTo(info.x, info.y, info.z, info.yRot, info.xRot);
      // (stage 4: flying as it was when it left)
      p.flying = !!info.flying && p.mayFly;
      level.player = p;
      level.addMirrorEntity(p);
      g.world = world;
      g.level = level;
      g.player = p;
      const chunks = {
        add(cx, cz, blocks, biomes, caveBiomes, blockEntities) {
          g.chunkAdds++;
          world.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks, world.dim.hasSkyLight), biomes, caveBiomes, pending: [], baked: 0x1ff, blockEntities });
          g.session.chunkReady(cx, cz);
        },
        remove(cx, cz) {
          world.removeChunk(cx, cz);
        },
      };
      return { level, player: p, chunks };
    },
    chat: (t, overlay) => {
      g.chat.push(t);
      if (overlay) g.overlays.push(t);
    },
    disconnected: (r) => (g.disconnected = r),
    took: (e, taker, amount) => g.took.push({ e, taker, amount }),
    mounted: (v) => g.mounted.push(v),
    // (stage 3) the death screen, and back
    died: (msg) => g.died.push(msg),
    respawned: () => g.respawned++,
    // (its recipe book, as the host fills it: new recipes with their toasts, or all it knows)
    recipes: (rs, replace) => {
      if (replace) g.recipes.clear();
      else g.toasts.push(...rs.map((r) => r.id));
      for (const r of rs) g.recipes.add(r.id);
    },
    // (stage 4) taken along to the host's next dimension: its world let go, as Game.guestChangedDimension does
    changeDimension: (dim, reason) => {
      g.dims.push([dim, reason]);
      for (const c of [...g.world.chunks.values()]) g.world.removeChunk(c.cx, c.cz);
      g.world.reset(m.dimensionById(dim));
      g.level.resetForDimension();
      g.player.dx = g.player.dy = g.player.dz = 0;
      g.player.fallDistance = 0;
    },
  };
  g.session = new m.ClientSession(transport, hooks, { name, uuid: uuid ?? m.offlinePlayerUuid(name), viewDistance, code: code ?? host.server?.joinCode ?? '' });
  host.guests.push(g);
  return g;
}

/**
 * a bare connection to `host`, without a ClientSession (for what an honest guest wouldn't send): what the host sends it,
 * decoded, in `got`; `send(packets)` sends one message of them, `sendBytes(b)` any bytes; `reason()` the Disconnect's
 */
export function rawGuest(host) {
  const { m, net } = host;
  const t = net.connect();
  const r = {
    t,
    got: [],
    gone: false,
    /** (stage 5) why its connection ended, if the transport said (the relay's word, over WebSockets) */
    goneReason: null,
    send(packets) {
      t.send(m.HOST_PEER, m.encode(packets));
    },
    sendBytes(b) {
      t.send(m.HOST_PEER, b);
    },
    /** the packets of kind `id` it was sent */
    packets(id) {
      return r.got.flat().filter((p) => p[0] === id);
    },
    /** why it was let go: the host's Disconnect, or else (stage 5) its transport's word */
    reason() {
      return r.packets(m.CB.Disconnect)[0]?.[1] ?? r.goneReason;
    },
    hello(name = 'Raw', { protocol = m.PROTOCOL_VERSION, build = m.BUILD_ID, uuid = m.offlinePlayerUuid(name), viewDistance = 2, code = host.server.joinCode } = {}) {
      r.send([[m.SB.Hello, protocol, build, name, uuid, viewDistance, code]]);
    },
  };
  t.onMessage((_peer, data) => r.got.push(m.decode(data, m.MAX_HOST_MESSAGE)));
  t.onPeer((_peer, joined, reason) => {
    if (joined) return;
    r.gone = true;
    r.goneReason = reason ?? null;
  });
  return r;
}

/** the guest's player as the host has it */
export function hostCopy(host, g) {
  return host.level.players().find((p) => p.profileName === g.name) ?? null;
}

/** (stage 2) `g`'s copy of the host's entity `e` (or null) */
export function copyOf(g, e) {
  return g.session.entities.get(e.id)?.e ?? null;
}

/**
 * (stage 5, MP_LAG) the ticks each step() and stepIdle() goes on for after those asked for: long enough for what was
 * sent in them to arrive, be answered and the answer arrive, at the most lag (the tests' ticks were written for a
 * network that answers within the tick)
 */
export const SETTLE = LAG ? Math.ceil((2 * Math.max(+LAG[1], +LAG[2])) / 50) + 1 : 0;

/** host tick → deliver → each guest's tick → deliver, `n` times (and, with MP_LAG, SETTLE more) */
export function step(host, n = 1) {
  for (let i = 0; i < n + SETTLE; i++) {
    host.server.receive();
    host.level.tick();
    host.server.tick();
    host.net.deliver();
    for (const g of host.guests) g.session.tick();
    host.net.deliver();
  }
}

/** (stage 4) the host on a loading screen, its level standing still (Game.tick before it's spawned), `n` times (and, with MP_LAG, SETTLE more) */
export function stepIdle(host, n = 1) {
  for (let i = 0; i < n + SETTLE; i++) {
    host.server.idleTick();
    host.net.deliver();
    for (const g of host.guests) g.session.tick();
    host.net.deliver();
  }
}

/**
 * (stage 4) the host's player off to dimension `dim`, to wait at (x, y, z) till it's loaded, as Game.changeDimension
 * does it: its guests told first (`told()` then run, the old dimension still there), then this dimension let go.
 * `host.server.hostArrived()` once it's there
 */
export function hostChangeDimension(host, dim, x, y, z, reason = 'other', told = null) {
  const { m, world, level, server, player: p } = host;
  server.hostLeavingDimension(dim, reason);
  told?.();
  if (p.isSleeping()) p.stopSleepInBed(true);
  p.removeVehicle();
  for (const c of [...world.chunks.values()]) world.removeChunk(c.cx, c.cz);
  world.reset(m.dimensionById(dim));
  level.resetForDimension();
  p.moveTo(x, y, z, p.yaw, p.pitch);
  p.dx = p.dy = p.dz = 0;
  p.fallDistance = 0;
}

/** a flat host world of chunks in [-r, r]², made on demand beyond that */
export function flatHost(m, r = 4, opts = {}) {
  const { world, level } = flatLevel(m, -r, -r, r, r, 64, 'stone');
  const makeChunk = (cx, cz) => {
    const blocks = new Uint16Array(m.COLUMN_VOLUME);
    const S = m.S('stone');
    for (let y = m.MIN_Y; y < 64; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) blocks[m.colIndex(lx, y, lz)] = S;
    // (stage 4: lit as its dimension is, the Nether's and the End's without the sky)
    world.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks, world.dim.hasSkyLight), biomes: new Uint8Array(256).fill(m.B.plains), pending: [] });
  };
  return makeHost(m, { world, level }, { makeChunk, ...opts });
}

/** a generated host world (seed), chunks in [-r, r]², made on demand beyond that */
export function genHost(m, seed, r = 4, opts = {}) {
  const gen = new m.ChunkGenerator(seed);
  const { world, level } = genLevel(m, gen, seed, -r, -r, r, r);
  return makeHost(m, { world, level }, { makeChunk: (cx, cz) => genLevel(m, gen, seed, cx, cz, cx, cz, world), ...opts });
}

/**
 * what differs between `g`'s world and the host's (vanilla's invariant for the guest's copy): every block of every
 * chunk it has, its biomes, what its block entities show, and, where all 8 neighbours are there too, the light
 */
export function mirrorDiff(host, g) {
  const { m } = host;
  const out = [];
  if (!g.world) return ['no world'];
  for (const c of g.world.chunks.values()) {
    const h = host.world.getChunk(c.cx, c.cz);
    if (!h) {
      out.push(`chunk ${c.cx},${c.cz}: not on the host`);
      continue;
    }
    for (let s = 0; s < c.blocks.length; s++) {
      const a = c.blocks[s], b = h.blocks[s];
      for (let i = 0; i < 4096; i++)
        if ((a ? a[i] : 0) !== (b ? b[i] : 0)) {
          out.push(`chunk ${c.cx},${c.cz} section ${s} index ${i}: ${a ? a[i] : 0} vs host ${b ? b[i] : 0}`);
          break;
        }
    }
    if (c.biomes.some((v, i) => v !== h.biomes[i])) out.push(`chunk ${c.cx},${c.cz}: biomes`);
    if (String(c.caveBiomes) !== String(h.caveBiomes)) out.push(`chunk ${c.cx},${c.cz}: cave biomes`);
    if (g.world.hasAllNeighbours(c.cx, c.cz))
      for (let s = 0; s < c.light.length; s++) {
        let diff = -1;
        for (let i = 0; i < 4096; i++) if ((c.light[s] ? c.light[s][i] : c.lightDefault) !== (h.light[s] ? h.light[s][i] : h.lightDefault)) {
          diff = i;
          break;
        }
        if (diff >= 0) out.push(`chunk ${c.cx},${c.cz} section ${s}: light at ${diff}`);
      }
    const bes = (w) => w.chunkBlockEntities(c.cx, c.cz).map((be) => JSON.stringify(m.visibleBlockEntity(be))).sort().join('\n');
    if (bes(g.world) !== bes(host.world)) out.push(`chunk ${c.cx},${c.cz}: block entities`);
  }
  return out;
}

export function assertMirrorEquals(host, g, label) {
  const d = mirrorDiff(host, g);
  check(`${label}: ${g.name}'s world is the host's`, d.length === 0, d.slice(0, 5).join('; '));
}
