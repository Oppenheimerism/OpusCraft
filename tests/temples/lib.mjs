// Shared helpers for the temple tests: load the game's modules, generate real chunks round a structure, put them in
// a World with a Level on top, and report "ok   <name>" / "FAIL <name>" lines.

import { loadModules } from '../../scripts/load.mjs';

export const MODULES = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/world/gen/generator.ts', '/src/world/gen/temples.ts', '/src/world/constants.ts', '/src/world/gen/biomes.ts',
  '/src/game/loot.ts', '/src/item/item.ts', '/src/game/spawner.ts', '/src/game/structureSpawns.ts', '/src/game/temples.ts',
  '/src/game/commands.ts', '/src/world/dimension.ts', '/src/world/gen/structure.ts', '/src/world/gen/context.ts',
  '/src/core/rng.ts', '/src/entity/monsters.ts', '/src/entity/tnt.ts', '/src/world/gen/desertPyramid.ts', '/src/world/gen/swampHut.ts',
  '/src/world/blockEntity.ts', '/src/entity/itemEntity.ts', '/src/entity/witch.ts',
  '/src/world/lightlocal.ts', '/src/game/blockRules.ts', '/src/game/shapeUpdates.ts', '/src/game/blockBehavior.ts', '/src/world/dir.ts',
  '/src/game/redstone/signal.ts', '/src/game/redstone/wire.ts', '/src/world/redstoneColor.ts',
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
    console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}
export function failures() {
  return failed;
}

/** generate chunks cx0..cx1, cz0..cz1 into a new World, and a Level over it (sounds and particles stubbed) */
export function buildLevel(m, gen, seed, cx0, cz0, cx1, cz1) {
  const world = new m.World();
  const outs = [];
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) {
      const out = gen.generate(cx, cz);
      outs.push(out);
      world.addChunk({ ...out });
    }
  const level = new m.Level(world, seed);
  const sounds = [];
  level.sound = { play: (name, x, y, z) => sounds.push({ name, x, y, z }), playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn() {}, dust() {}, poof() {}, blockParticle() {}, fallingDust() {} };
  return { world, level, outs, sounds };
}

export function blockName(m, st) {
  return m.BLOCKS[m.STATE_BLOCK[st]].name;
}

/** a piece's local block, read back through its orientation */
export function localGet(m, world, piece, x, y, z) {
  return world.getState(piece.worldX(x, z), piece.worldY(y), piece.worldZ(x, z));
}

export function exitWithStatus(close) {
  return close().then(() => {
    console.log(failed ? `${failed} failed` : 'all passed');
    process.exit(failed ? 1 : 0);
  });
}

/** a flat world of chunks cx0..cx1, cz0..cz1: stone below `ground`, air above (plains), with a Level over it */
export function flatLevel(m, cx0, cz0, cx1, cz1, ground = 64, seed = 'flat') {
  const world = new m.World();
  const STONE = m.S('stone');
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) {
      const blocks = new Uint16Array(m.COLUMN_VOLUME);
      for (let y = m.MIN_Y; y < ground; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) blocks[m.colIndex(lx, y, lz)] = STONE;
      world.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks), biomes: new Uint8Array(256).fill(m.B.plains), pending: [] });
    }
  const level = new m.Level(world, seed);
  const sounds = [];
  level.sound = { play: (name, x, y, z, volume, pitch) => sounds.push({ name, x, y, z, volume, pitch, t: level.gameTime }), playUI() {} };
  const particles = [];
  level.particles = {
    blockBreak() {}, blockHit() {}, poof() {}, blockParticle() {}, fallingDust() {},
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
