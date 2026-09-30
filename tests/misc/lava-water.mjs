// Lava meeting water (vanilla LiquidBlock.onPlace / neighborChanged → shouldSpreadLiquid): a lava source with water
// above it or beside it turns to obsidian there and then, flowing lava to cobblestone, with the fizz, rather than at
// the lava's next tick (30 ticks in the Overworld), by when the water would have flowed in over it. So a water bucket
// emptied into a lava lake leaves obsidian round the water at once, and water poured over a lake leaves an obsidian
// floor under it as it spreads, as speedrunners' portals are made.

import { load, check, exitWithStatus } from '../bastions/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/game/fluidTicks.ts']);

// stone to y 62, a lake of lava sources x -6..6, z -6..6 at y 63, stone round it at y 63, air above (chunks -1..0)
const world = new m.World();
const STONE = m.S('stone'), LAVA = m.S('lava'), WATER = m.S('water'), OBSIDIAN = m.S('obsidian');
for (let cx = -1; cx <= 0; cx++)
  for (let cz = -1; cz <= 0; cz++) {
    const blocks = new Uint16Array(m.COLUMN_VOLUME);
    for (let y = m.MIN_Y; y < 64; y++)
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const x = cx * 16 + lx, z = cz * 16 + lz;
          blocks[m.colIndex(lx, y, lz)] = y === 63 && Math.abs(x) <= 6 && Math.abs(z) <= 6 ? LAVA : STONE;
        }
    world.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks), biomes: new Uint8Array(256).fill(m.B.plains), pending: [] });
  }
const level = new m.Level(world, 'lava-water');
const fizzes = [], smoke = [];
level.sound = { play(name) { if (name === 'block.fire.extinguish') fizzes.push(name); }, playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, poof() {}, blockParticle() {}, fallingDust() {}, spawn(kind) { if (kind === 'large_smoke') smoke.push(kind); }, dust() {} };
const at = (x, y, z) => world.getState(x, y, z);
const count = (st) => {
  let n = 0;
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (at(x, 63, z) === st) n++;
  return n;
};

// a water bucket emptied into the lake (vanilla BucketItem: the lava there is replaced by the water)
level.setBlock(0, 63, 0, WATER);
const ring = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => at(dx, 63, dz) === OBSIDIAN);
check('water emptied into a lava lake: the lava beside it is obsidian at once, before any tick', ring, [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => m.BLOCKS[m.STATE_BLOCK[at(dx, 63, dz)]].name).join());
check('...with the fizz and its smoke, once for each', fizzes.length === 4 && smoke.length === 32, `${fizzes.length} fizzes, ${smoke.length} puffs`);
for (let i = 0; i < 200; i++) level.tick();
check('...and ten seconds on, the water is held in its ring: the rest of the lake is still lava', at(0, 63, 0) === WATER && count(OBSIDIAN) === 4 && count(LAVA) === 13 * 13 - 5, `obsidian ${count(OBSIDIAN)}, lava ${count(LAVA)}, water ${count(WATER)}`);

// water poured over the lake from above: an obsidian floor under it as it spreads, and no lava left under any water
level.setBlock(4, 65, 4, WATER);
for (let i = 0; i < 400; i++) level.tick();
let under = 0, floor = 0;
for (let x = -6; x <= 6; x++)
  for (let z = -6; z <= 6; z++) {
    if (!(m.FLAGS[at(x, 64, z)] & m.F_WATER)) continue;
    if (at(x, 63, z) === LAVA) under++;
    if (at(x, 63, z) === OBSIDIAN) floor++;
  }
check('water poured over a lava lake: no lava is left under any of the water, obsidian where it was', under === 0 && floor >= 20, `${under} lava under water, ${floor} obsidian under water`);
check('...and the lava under no water stays lava', count(LAVA) > 0 && count(LAVA) + count(OBSIDIAN) + count(WATER) === 13 * 13, `lava ${count(LAVA)}, obsidian ${count(OBSIDIAN)}, water ${count(WATER)}`);

await exitWithStatus(close);
