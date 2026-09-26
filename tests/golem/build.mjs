// Headless checks for building iron golems from a pumpkin on iron blocks (node tests/golem/build.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/advancements.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, adv] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
const sounds = [], dust = [];
level.sound = { play: (n) => sounds.push(n), playUI() {} };
level.particles = { spawn() {}, blockBreak: (x, y, z, st) => dust.push(BLOCKS[STATE_BLOCK[st]].name) };
{ const gs = S('grass_block'); for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; } }
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
const summoned = [];
level.onSummonedEntity = (e) => summoned.push(e);
const iron = S('iron_block');
const put = (x, y, z, st) => level.setBlock(x, y, z, st);
const golems = () => level.entities.filter((e) => e.type === 'iron_golem' && !e.removed);
const pumpkin = getBlock('carved_pumpkin').state({ facing: 'south' });
const lantern = getBlock('jack_o_lantern').state({ facing: 'east' });

// upright, facing along x: the golem stands where its foot was
put(0, 64, 0, iron); put(-1, 65, 0, iron); put(0, 65, 0, iron); put(1, 65, 0, iron);
check('four iron blocks alone do nothing', golems().length === 0);
put(0, 66, 0, pumpkin);
let g = golems()[0];
check('a pumpkin on top brings it to life', golems().length === 1);
check('standing on the foot\'s block', g && g.x === 0.5 && Math.abs(g.y - 64.05) < 1e-9 && g.z === 0.5, g && `${g.x},${g.y},${g.z}`);
check('a player\'s golem', g?.playerCreated === true);
check('the blocks are gone', [[0, 64, 0], [-1, 65, 0], [0, 65, 0], [1, 65, 0], [0, 66, 0]].every(([x, y, z]) => name(x, y, z) === 'air'));
check('crumbling with dust and sound', dust.filter((d) => d === 'iron_block').length === 4 && dust.includes('carved_pumpkin') && sounds.includes('block.metal.break'), `${dust} ${[...new Set(sounds)]}`);
check('the summoning is told', summoned.length === 1 && summoned[0] === g);
g.remove();

// arms across z, and a jack o'lantern
put(10, 64, 0, iron); put(10, 65, -1, iron); put(10, 65, 0, iron); put(10, 65, 1, iron);
put(10, 66, 0, lantern);
g = golems()[0];
check('turned the other way, with a jack o\'lantern', g && g.x === 10.5 && g.z === 0.5, g && `${g.x},${g.y},${g.z}`);
g?.remove();

// lying flat on the ground
put(20, 64, 0, iron); put(20, 64, 1, iron); put(19, 64, 1, iron); put(21, 64, 1, iron);
put(20, 64, 2, pumpkin);
g = golems()[0];
check('lying down works too', g && g.x === 20.5 && Math.abs(g.y - 64.05) < 1e-9 && g.z === 0.5, g && `${g.x},${g.y},${g.z}`);
g?.remove();

// upside down: the foot on top
put(30, 66, 0, iron); put(29, 65, 0, iron); put(30, 65, 0, iron); put(31, 65, 0, iron);
put(30, 64, 0, pumpkin);
g = golems()[0];
check('and upside down (it stands at the foot)', g && g.x === 30.5 && Math.abs(g.y - 66.05) < 1e-9, g && `${g.x},${g.y},${g.z}`);
g?.remove();

// something in the gap beside the foot spoils it
put(-10, 64, 10, iron); put(-11, 65, 10, iron); put(-10, 65, 10, iron); put(-9, 65, 10, iron);
put(-11, 64, 10, S('dirt'));
put(-10, 66, 10, pumpkin);
check('not with a block beside its foot', golems().length === 0 && name(-10, 66, 10) === 'carved_pumpkin');
// nor a plain pumpkin
put(-20, 64, 10, iron); put(-21, 65, 10, iron); put(-20, 65, 10, iron); put(-19, 65, 10, iron);
put(-20, 66, 10, S('pumpkin'));
check('nor with an uncarved pumpkin', golems().length === 0);
// a pumpkin already there doesn't count: the golem comes when the pumpkin is placed last
put(-30, 66, 10, pumpkin);
put(-30, 64, 10, iron); put(-31, 65, 10, iron); put(-30, 65, 10, iron); put(-29, 65, 10, iron);
check('the pumpkin has to go on last', golems().length === 0);
// turning the pumpkin in place (the same block) doesn't wake it
put(-30, 66, 10, getBlock('carved_pumpkin').state({ facing: 'north' }));
check('nor turning the pumpkin that\'s there', golems().length === 0);

// the Hired Help advancement
const pa = new adv.PlayerAdvancements();
pa.trigger('summoned_entity', { summoned: 'iron_golem' });
const hired = adv.ADVANCEMENTS.get('adventure/summon_iron_golem');
check('Hired Help', !!hired && pa.isDone(hired));

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
