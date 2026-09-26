// Shared helpers for the second half of redstone (hoppers, comparators, observers, daylight detectors): load the
// game's modules, build a flat stone world with a ticking Level over it (sounds and particles stubbed), place blocks
// as a player would, and report "ok   <name>" / "FAIL <name>" lines.

import { loadModules } from '../../scripts/load.mjs';

export const MODULES = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/world/constants.ts', '/src/world/gen/biomes.ts', '/src/world/lightlocal.ts', '/src/world/dir.ts',
  '/src/game/blockRules.ts', '/src/game/shapeUpdates.ts', '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/core/aabb.ts',
  '/src/core/rng.ts', '/src/entity/itemEntity.ts', '/src/world/blockEntity.ts', '/src/inventory/recipes.ts',
  '/src/game/redstone/signal.ts', '/src/game/redstone/wire.ts', '/src/game/redstone/dispenser.ts', '/src/game/redstone/hopper.ts',
];

export async function load(extra = []) {
  const { mods, close } = await loadModules([...MODULES, ...extra]);
  const m = {};
  for (const mod of mods) Object.assign(m, mod);
  return { m, mods, close };
}

let failed = 0;
export function check(name, cond, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else {
    failed++;
    console.log(`FAIL ${name}${detail !== '' ? ' — ' + detail : ''}`);
  }
}

export function exitWithStatus(close) {
  return close().then(() => {
    console.log(failed ? `${failed} failed` : 'all passed');
    process.exit(failed ? 1 : 0);
  });
}

/** a flat world of chunks cx0..cx1, cz0..cz1: stone below `ground`, air above (plains), with a Level over it */
export function flatLevel(m, cx0, cz0, cx1, cz1, ground = 64) {
  const world = new m.World();
  const STONE = m.S('stone');
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) {
      const blocks = new Uint16Array(m.COLUMN_VOLUME);
      for (let y = m.MIN_Y; y < ground; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) blocks[m.colIndex(lx, y, lz)] = STONE;
      world.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks), biomes: new Uint8Array(256).fill(m.B.plains), pending: [] });
    }
  const level = new m.Level(world, 'flat');
  const sounds = [];
  level.sound = { play: (name, x, y, z, volume, pitch) => sounds.push({ name, x, y, z, volume, pitch, t: level.gameTime }), playUI() {} };
  const particles = [];
  level.particles = {
    blockBreak() {}, blockHit() {}, poof() {}, blockParticle() {}, fallingDust() {}, emitAround() {}, entityEffect() {}, spell() {},
    spawn: (kind, x, y, z) => particles.push({ kind, x, y, z }),
    dust: (x, y, z, r, g, b, scale) => particles.push({ kind: 'dust', x, y, z, r, g, b, scale }),
  };
  return { world, level, sounds, particles };
}

/**
 * place a block as a player would (vanilla BlockItem.place): its placement state from where the player stands and
 * looks, its connections, then setPlacedBy. `face` is the clicked face (default: the top of the block below)
 */
export function place(m, level, name, x, y, z, { yaw = 0, pitch = 0, face = 1, props = null, player = null } = {}) {
  const block = m.getBlock(name);
  let st;
  if (props) st = block.state(props);
  else {
    st = m.placementState(block, { world: level.world, x, y, z, face, hitY: 0.5, hitX: 0.5, hitZ: 0.5, yaw, pitch, sneaking: false, clickedState: 0, replaceClicked: false });
    if (st === null) return null;
    if (m.hasShapeUpdates(st)) {
      const u = m.updateShape(level.world, x, y, z, st);
      if (u) st = u;
    }
  }
  level.setBlock(x, y, z, st);
  const now = level.getState(x, y, z);
  m.behaviorOf(now)?.setPlacedBy?.(level, x, y, z, now, player ?? { gameMode: 'survival' });
  return now;
}

/** the value of a property of the block at (x, y, z) */
export function prop(m, level, x, y, z, name) {
  const st = level.getState(x, y, z);
  return m.blockOf(st).get(st, name);
}

export function ticks(level, n) {
  for (let i = 0; i < n; i++) level.tick();
}

/** right-click the block at (x, y, z) with an empty hand */
export function use(m, level, x, y, z, player = { gameMode: 'survival' }) {
  const st = level.getState(x, y, z);
  return m.behaviorOf(st)?.use?.(level, x, y, z, st, { player, face: 1, hx: x + 0.5, hy: y + 1, hz: z + 0.5 });
}

export const stack = (m, id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);

/** how many of `id` (or of anything) a container holds */
export function countIn(container, id = null) {
  let n = 0;
  for (let i = 0; i < container.size; i++) {
    const s = container.get(i);
    if (s && (!id || s.item.id === id)) n += s.count;
  }
  return n;
}
