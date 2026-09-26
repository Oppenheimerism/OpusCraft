// Multiplayer M1: the chunks a guest gets (vanilla ChunkMap.updateChunkTracking and ClientboundLevelChunkWithLightPacket):
// the ones in its view, nearest first; the same blocks, biomes and block entities as the host's, and, once the guest has
// lit them itself, the same light; forgotten when it moves away; and every change the host makes (its own, the world's,
// generation reaching into a chunk from a neighbour made later) in the guest's copy by the end of the tick.

import { loadNet, genHost, flatHost, makeGuest, hostCopy, step, mirrorDiff, assertMirrorEquals, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet(['/src/world/gen/generator.ts', '/src/world/blockEntity.ts']);

/** the chunks a guest at chunk (cx, cz) with view distance r has (vanilla ChunkTrackingView.isInViewDistance) */
function circle(cx, cz, r) {
  const out = new Set();
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r + r) out.add(`${cx + dx},${cz + dz}`);
  return out;
}
const had = (g) => new Set([...g.world.chunks.values()].map((c) => `${c.cx},${c.cz}`));
const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

// ---------------------------------------------------------------------------
// a generated world: hills, caves, water, trees and what the generator puts across chunk borders
{
  const host = genHost(m, 'multiplayer', 5, { spawn: [8.5, 100, 8.5], x: 8.5, y: 100, z: 8.5 });
  const g = makeGuest(host, 'Alex', { viewDistance: 4 });
  step(host, 2);
  const firstBatch = g.chunkAdds;
  step(host, 1);
  check('chunks: at most six a tick', g.chunkAdds - firstBatch <= m.CHUNKS_PER_TICK && g.chunkAdds - firstBatch > 0, `${g.chunkAdds - firstBatch}`);
  step(host, 20);
  check('chunks: exactly those in the guest\'s view (61 for view distance 4)', sameSet(had(g), circle(0, 0, 4)), `${g.world.chunks.size}`);
  const inner = [...g.world.chunks.values()].filter((c) => g.world.hasAllNeighbours(c.cx, c.cz)).length;
  check('chunks: (most of them with all their neighbours, lit as the host\'s)', inner >= 37, `${inner}`);
  assertMirrorEquals(host, g, 'a generated world');
  // (the light compared on purpose: the host's, not the guest's own, is the reference)
  const sky = [...g.world.chunks.values()].find((c) => g.world.hasAllNeighbours(c.cx, c.cz));
  check('chunks: the light is really compared (a guest chunk with its light blanked differs)', (() => {
    const s = sky.light.findIndex((l) => l);
    const saved = sky.light[s].slice();
    sky.light[s].fill(0);
    const d = mirrorDiff(host, g).some((x) => x.includes('light'));
    sky.light[s].set(saved);
    return d;
  })());

  // walking east, 8 blocks a tick, 6 chunks: the far chunks are forgotten, the new ones come, new chunks the host
  // generates on the way reach into the old ones (trees across borders), and the guest sees all of it
  const forgets = [];
  const handle = g.session.handle.bind(g.session);
  g.session.handle = (p) => {
    if (p[0] === m.CB.ForgetLevelChunk) forgets.push(`${p[1]},${p[2]}`);
    return handle(p);
  };
  for (let i = 0; i < 12; i++) {
    g.player.moveTo(g.player.x + 8, 100, g.player.z, 0, 0);
    g.player.flying = true;
    step(host, 1);
  }
  step(host, 30);
  const cx = Math.floor(g.player.x) >> 4;
  check('moving: the guest is 6 chunks east', cx === 6, `${cx}`);
  const now = had(g), view = circle(6, 0, 4), margin = circle(6, 0, 5);
  check('moving: it has every chunk in its view round where it is now', [...view].every((k) => now.has(k)), [...view].filter((k) => !now.has(k)).join(' '));
  check('moving: and none beyond a chunk past it (kept that far so as not to forget and resend at a border)', [...now].every((k) => margin.has(k)), [...now].filter((k) => !margin.has(k)).join(' '));
  check('moving: those left behind were forgotten (vanilla ClientboundForgetLevelChunkPacket)', forgets.includes('-4,0') && forgets.includes('0,4') && !forgets.includes('6,0'), forgets.slice(0, 8).join(' '));
  const hp = hostCopy(host, g);
  check('moving: the host keeps the chunks round it loaded (its ticket moved)', JSON.stringify(host.tickets.get(`player:${hp.id}`)) === JSON.stringify([6, 0, 4]));
  assertMirrorEquals(host, g, 'after moving 6 chunks');

  // changes the host makes reach the guest within the tick: blocks, and the light the guest works out from them
  const y = host.world.heightAt(100, 5);
  host.level.setBlock(100, y, 5, m.S('glowstone'));
  host.level.setBlock(101, y + 3, 5, m.S('gold_block'));
  host.world.setState(102, y, 5, m.S('torch'));
  step(host, 1);
  check('host setBlock: the guest has it at the end of the tick', g.world.getState(100, y, 5) === m.S('glowstone') && g.world.getState(101, y + 3, 5) === m.S('gold_block') && g.world.getState(102, y, 5) === m.S('torch'));
  host.level.setBlock(101, y + 3, 5, m.S('air'));
  step(host, 1);
  check('host setBlock: and when it\'s gone again', g.world.getState(101, y + 3, 5) === 0);
  assertMirrorEquals(host, g, 'after the host\'s changes (the light round the glowstone included)');

}

// ---------------------------------------------------------------------------
// block entities: what they show goes to the guest (a lectern's book, a campfire's food), what they hold doesn't (a
// chest's items: vanilla sends those only to whoever opens it)
{
  const host = flatHost(m, 4);
  const g = makeGuest(host, 'Alex', { viewDistance: 3 });
  step(host, 20);
  host.level.setBlock(3, 64, 3, m.S('chest'));
  const chest = host.world.getBlockEntity(3, 64, 3);
  chest.container.set(0, new m.ItemStack(m.getItem('diamond'), 5));
  host.level.setBlock(5, 64, 3, m.S('lectern'));
  const lectern = host.world.getBlockEntity(5, 64, 3);
  step(host, 1);
  const gc = g.world.getBlockEntity(3, 64, 3);
  check('block entities: a chest placed by the host is a chest on the guest', gc && gc.id === chest.id);
  check('block entities: what\'s in it isn\'t sent', gc && gc.container.get(0) === null && chest.container.get(0)?.count === 5);
  check('block entities: the lectern is there', g.world.getBlockEntity(5, 64, 3)?.id === lectern.id);
  assertMirrorEquals(host, g, 'a chest and a lectern');
  // a book put on the lectern: what it shows changed, so it's sent again (vanilla BlockEntity.setChanged)
  lectern.container.set(0, new m.ItemStack(m.getItem('writable_book'), 1));
  step(host, 1);
  check('block entities: the book on the lectern shows on the guest\'s', g.world.getBlockEntity(5, 64, 3)?.container.get(0)?.item.id === 'writable_book');
  assertMirrorEquals(host, g, 'a book on the lectern');
  lectern.container.set(0, null);
  step(host, 1);
  check('block entities: and goes when it\'s taken', g.world.getBlockEntity(5, 64, 3)?.container.get(0) === null);
  // replaced by another block in one tick, the same kind again: made afresh on both sides
  host.level.setBlock(3, 64, 3, m.S('air'));
  host.level.setBlock(3, 64, 3, m.S('chest'));
  step(host, 1);
  check('block entities: a chest broken and placed again in a tick is a new, empty one', g.world.getBlockEntity(3, 64, 3) !== gc && g.world.getBlockEntity(3, 64, 3)?.container.get(0) === null);
  assertMirrorEquals(host, g, 'a chest broken and placed again in a tick');
  host.level.setBlock(5, 64, 3, m.S('air'));
  step(host, 1);
  check('block entities: gone with the block', g.world.getBlockEntity(5, 64, 3) === null);
  assertMirrorEquals(host, g, 'a lectern broken');
  // nothing more is sent while nothing changes (the check every second finds them as the guest has them)
  const handle = g.session.handle.bind(g.session);
  let beData = 0;
  g.session.handle = (p) => {
    if (p[0] === m.CB.BlockEntityData) beData++;
    return handle(p);
  };
  step(host, 40);
  check('block entities: nothing sent again while nothing changed', beData === 0, `${beData}`);
}

await exitWithStatus(close);
