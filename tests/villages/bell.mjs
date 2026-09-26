// Headless checks for the bell (node tests/villages/bell.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/monsters.ts', '/src/world/blockEntity.ts', '/src/audio/synth.ts', '/src/core/rng.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, rules, behavior, itemMod, monsters, beMod, synth, rng] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK, COLLISION } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push(`${n}@${v}/${(+p).toFixed(2)}`), playUI() {} };
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
const prop = (x, y, z, p) => { const st = world.getState(x, y, z); return BLOCKS[STATE_BLOCK[st]].get(st, p); };
const tick = (n) => { for (let i = 0; i < n; i++) level.tick(); };
const use = (x, y, z, face, hy = 0.5) => { const st = world.getState(x, y, z); return behavior.behaviorOf(st).use(level, x, y, z, st, { face, hx: x + 0.5, hy: y + hy, hz: z + 0.5 }); };
const place = (block, x, y, z, face, yaw = 0, pitch = 0) => {
  const st = rules.placementState(getBlock(block), { world, x, y, z, face, hitY: 0.5, yaw, pitch, sneaking: false, clickedState: 0 });
  if (st !== null) level.setBlock(x, y, z, st);
  return st;
};
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'), false);
const DOWN = 0, UP = 1, NORTH = 2, SOUTH = 3, WEST = 4, EAST = 5;

// --- a bell on the floor: rung from the front or back, not the sides or the frame's top ---
const fst = place('bell', 0, 64, 0, UP, 0);
check('floor bell', fst !== null && prop(0, 64, 0, 'attachment') === 'floor', fst !== null ? prop(0, 64, 0, 'facing') : '');
const facing = prop(0, 64, 0, 'facing');
const be = world.getBlockEntity(0, 64, 0);
check('bell has its block entity', be instanceof beMod.BellBlockEntity);
const along = facing === 'north' || facing === 'south' ? [NORTH, SOUTH] : [WEST, EAST];
const across = facing === 'north' || facing === 'south' ? [WEST, EAST] : [NORTH, SOUTH];
sounds = [];
check('side hit passes', use(0, 64, 0, across[0]) === false && sounds.length === 0);
check('top of the frame passes', use(0, 64, 0, along[0], 0.9) === false && use(0, 64, 0, UP, 0.5) === false && sounds.length === 0);
check('front hit rings', use(0, 64, 0, along[1]) === true && sounds.includes('block.bell.use@2/1.00'), sounds.join(' '));
check('it swings away from the struck side', be.shaking && be.ticks === 0 && be.clickDirection === along[1]);
tick(49);
check('still swinging after 49 ticks', be.shaking && be.ticks === 49);
tick(1);
check('still after 50', !be.shaking && be.ticks === 0);
// the floor bell's shape is its frame
const c = COLLISION[world.getState(0, 64, 0)];
check('floor shape is the frame', c.length === 1 && c[0][4] === 1, JSON.stringify(c));

// --- hanging from a wall; a second wall behind makes it hang between them; losing either wall ---
level.setBlock(5, 64, 0, S('stone'));
const wst = place('bell', 5, 64, 1, SOUTH); // clicked the wall's south face
check('wall bell faces its wall', wst !== null && prop(5, 64, 1, 'attachment') === 'single_wall' && prop(5, 64, 1, 'facing') === 'north');
check('wall bell ring: a hit across its facing', use(5, 64, 1, EAST) === true && use(5, 64, 1, SOUTH) === false);
level.setBlock(5, 64, 2, S('stone'));
check('a wall behind: between walls', prop(5, 64, 1, 'attachment') === 'double_wall' && prop(5, 64, 1, 'facing') === 'north');
level.setBlock(5, 64, 0, 0);
check('the front wall gone: hangs from the back one', prop(5, 64, 1, 'attachment') === 'single_wall' && prop(5, 64, 1, 'facing') === 'south');
level.setBlock(5, 64, 2, 0);
check('both walls gone: it drops', name(5, 64, 1) === 'air' && level.entities.some((e) => e.type === 'item' && e.stack?.item.id === 'bell'));
// placed straight between two walls
level.setBlock(-5, 64, 0, S('stone'));
level.setBlock(-5, 64, 2, S('stone'));
place('bell', -5, 64, 1, SOUTH);
check('placed between two walls', prop(-5, 64, 1, 'attachment') === 'double_wall');
// a horizontal face with nothing to hang on: stands on the floor instead
level.setBlock(-7, 64, -5, S('stone'));
const fb = place('bell', -6, 64, -5, EAST); // clicked the east face of a block, but... no wall to the west? there is (-7)
check('clicked a wall: hangs from it', fb !== null && prop(-6, 64, -5, 'attachment') === 'single_wall' && prop(-6, 64, -5, 'facing') === 'west');
const glass = place('bell', 7, 64, 7, EAST); // nothing to the west
check('no wall there: stands on the floor', glass !== null && prop(7, 64, 7, 'attachment') === 'floor' && prop(7, 64, 7, 'facing') === 'west');

// --- hanging from a ceiling, and from a fence ---
level.setBlock(2, 67, -4, S('stone'));
const cst = place('bell', 2, 66, -4, DOWN, 90);
check('ceiling bell', cst !== null && prop(2, 66, -4, 'attachment') === 'ceiling');
check('ceiling bell rings from any side', use(2, 66, -4, NORTH) && use(2, 66, -4, EAST));
level.setBlock(3, 67, -6, S('oak_fence'));
check('hangs under a fence', place('bell', 3, 66, -6, DOWN) !== null);
level.setBlock(2, 67, -4, 0);
check('ceiling gone: it drops', name(2, 66, -4) === 'air');

// --- redstone rings it on the way up only ---
sounds = [];
level.setBlock(1, 64, 0, S('redstone_block'));
check('power rings it', prop(0, 64, 0, 'powered') === true && sounds.filter((s) => s.startsWith('block.bell.use')).length === 1, sounds.join(' '));
check('swinging toward its facing', be.shaking && be.clickDirection === ['down', 'up', 'north', 'south', 'west', 'east'].indexOf(facing));
sounds = [];
level.setBlock(1, 64, 0, 0);
check('power off: unpowered, silent', prop(0, 64, 0, 'powered') === false && sounds.length === 0, sounds.join(' '));

// --- a projectile rings it; villagers within 32 blocks hear it ---
const z = new monsters.Zombie(level);
z.moveTo(6.5, 64, 0.5, 0, 0);
z.heardBellTime = -1;
level.addEntity(z);
const far = new monsters.Zombie(level);
far.moveTo(30.5, 64, 30.5, 0, 0);
far.heardBellTime = -1;
level.addEntity(far);
// (who is around was looked up at the last ring, and is only looked up again 60 ticks on)
tick(3);
rules.onProjectileHit(level, 0, 64, 0, { face: along[0], px: 0.5, py: 64.4, pz: 0.5 }, z);
check('rung again within 3 s: the newcomer is not on the list yet', z.heardBellTime === -1);
tick(58);
sounds = [];
rules.onProjectileHit(level, 0, 64, 0, { face: along[0], px: 0.5, py: 64.4, pz: 0.5 }, z);
check('an arrow rings it', sounds.includes('block.bell.use@2/1.00'));
check('near mob heard it', z.heardBellTime === level.gameTime, `${z.heardBellTime} removed=${z.removed} alive=${z.isAlive} hp=${z.health} pos=${z.x.toFixed(1)},${z.y.toFixed(1)},${z.z.toFixed(1)} list=${be.nearbyEntities?.map((e) => e.type).join(',')} t=${level.gameTime} last=${be.lastRingTimestamp}`);
check('far mob did not', far.heardBellTime === -1);
sounds = [];
rules.onProjectileHit(level, 0, 64, 0, { face: UP, px: 0.5, py: 65, pz: 0.5 }, z);
check('an arrow on the top does not', sounds.length === 0);

// --- item and sound ---
const it = itemMod.ITEMS.get('bell');
check('bell item: flat sprite, functional tab', it && it.texture === 'bell' && it.creativeTab === 'functional', it && `${it.texture} ${it.creativeTab}`);
const pcm = synth.SOUNDS['block.bell.use'].generate(0, 22050);
let peak = 0;
for (const v of pcm) peak = Math.max(peak, Math.abs(v));
check('bell sound renders', pcm.length > 22050 * 2 && peak > 0.5 && Number.isFinite(peak), `${(pcm.length / 22050).toFixed(2)} s, peak ${peak.toFixed(2)}`);
const drops = rules.blockDrops(fst, null, new rng.Rand(1));
check('drops itself by hand', drops.length === 1 && drops[0].item.id === 'bell', drops.map((d) => d.item.id).join(','));

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
