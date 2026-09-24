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
