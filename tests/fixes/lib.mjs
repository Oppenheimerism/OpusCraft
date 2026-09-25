// Shared helpers for the play-test fixes: load the game's modules, generate real chunks into a World with a Level on
// top (sounds and particles stubbed), and report "ok   <name>" / "FAIL <name>" lines.

import { loadModules } from '../../scripts/load.mjs';

export const MODULES = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/world/gen/generator.ts', '/src/world/constants.ts', '/src/world/gen/biomes.ts', '/src/entity/player.ts',
  '/src/world/lightlocal.ts', '/src/core/aabb.ts',
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

export function exitWithStatus(close) {
  return close().then(() => {
    console.log(failed ? `${failed} failed` : 'all passed');
    process.exit(failed ? 1 : 0);
  });
}

/** stub a level's sounds and particles */
export function stubLevel(level) {
  level.sound = { play() {}, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, poof() {}, blockParticle() {}, fallingDust() {}, spawn() {}, dust() {}, emitAround() {}, entityEffect() {}, spell() {} };
  return level;
}

/** generate chunks cx0..cx1, cz0..cz1 into `world` (a new World if none), and a Level over it */
export function genLevel(m, gen, seed, cx0, cz0, cx1, cz1, world = null) {
  const w = world ?? new m.World();
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) if (!w.getChunk(cx, cz)) w.addChunk({ ...gen.generate(cx, cz) });
  return { world: w, level: world ? null : stubLevel(new m.Level(w, seed)) };
}

/** a flat world of chunks cx0..cx1, cz0..cz1: `under` below `ground`, air above (plains), with a Level over it */
export function flatLevel(m, cx0, cz0, cx1, cz1, ground = 64, under = 'stone', seed = 'flat') {
  const world = new m.World();
  const UNDER = m.S(under);
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) {
      const blocks = new Uint16Array(m.COLUMN_VOLUME);
      for (let y = m.MIN_Y; y < ground; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) blocks[m.colIndex(lx, y, lz)] = UNDER;
      world.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks), biomes: new Uint8Array(256).fill(m.B.plains), pending: [] });
    }
  return { world, level: stubLevel(new m.Level(world, seed)) };
}

/** a survival player in the level, its hurts written down */
export function addPlayer(m, level, x, y, z) {
  const p = new m.Player(level);
  p.setGameMode('survival');
  p.moveTo(x, y, z, 0, 0);
  level.player = p;
  level.addEntity(p);
  p.hurts = [];
  const hurt = p.hurt.bind(p);
  p.hurt = (amount, source, ...rest) => {
    p.hurts.push(source);
    return hurt(amount, source, ...rest);
  };
  return p;
}
