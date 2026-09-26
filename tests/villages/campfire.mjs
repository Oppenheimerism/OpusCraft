// Headless checks for campfires (node tests/villages/campfire.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/monsters.ts', '/src/world/blockEntity.ts', '/src/audio/synth.ts', '/src/core/rng.ts',
  '/src/game/villageBlocks.ts', '/src/inventory/recipes.ts', '/src/textures/blocks.ts', '/src/textures/campfireSmoke.ts', '/src/entity/living.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, rules, behavior, itemMod, monsters, beMod, synth, rng, village, recipes, tex, smoke, living] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK, COLLISION, EMISSION, FLAGS, F_WATER } = blockMod;
const { ItemStack, ITEMS } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push(n), playUI() {} };
let parts = [];
level.particles = { blockBreak() {}, blockHit() {}, spawn: (k, x, y, z, dx, dy, dz) => parts.push({ k, x, y, z, dx, dy, dz }) };
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
const prop = (x, y, z, p) => { const st = world.getState(x, y, z); return BLOCKS[STATE_BLOCK[st]].get(st, p); };
const tick = (n) => { for (let i = 0; i < n; i++) level.tick(); };
const place = (block, x, y, z, yaw = 0) => {
  const st = rules.placementState(getBlock(block), { world, x, y, z, face: 1, hitY: 0.5, yaw, pitch: 0, sneaking: false, clickedState: 0 });
  if (st !== null) level.setBlock(x, y, z, st);
  return st;
};
const hook = (x, y, z) => behavior.behaviorOf(world.getState(x, y, z));
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'), false);

// placing
place('campfire', 0, 64, 0, 0);
check('lit as it goes down, facing the way the player looks', prop(0, 64, 0, 'lit') === true && prop(0, 64, 0, 'facing') === 'south' && prop(0, 64, 0, 'signal_fire') === false);
check('a slab-high block, light 15', COLLISION[world.getState(0, 64, 0)][0][4] === 7 / 16 && EMISSION[world.getState(0, 64, 0)] === 15);
place('soul_campfire', 3, 64, 0, 90);
check('soul campfire: light 10, facing west', EMISSION[world.getState(3, 64, 0)] === 10 && prop(3, 64, 0, 'facing') === 'west');
level.setBlock(0, 64, 0, prop(0, 64, 0, 'lit') ? world.getState(0, 64, 0) : 0);
check('unlit: dark', EMISSION[getBlock('campfire').with(world.getState(0, 64, 0), 'lit', false)] === 0);
// a hay bale underneath makes a signal fire
level.setBlock(6, 63, 0, S('hay_block'));
place('campfire', 6, 64, 0);
check('over hay: a signal fire', prop(6, 64, 0, 'signal_fire') === true);
level.setBlock(6, 63, 0, S('stone'));
check('the hay taken away: an ordinary fire again', prop(6, 64, 0, 'signal_fire') === false);
level.setBlock(6, 63, 0, S('hay_block'));
check('and back', prop(6, 64, 0, 'signal_fire') === true);
// into water: out and waterlogged
level.setBlock(0, 64, 4, S('water'));
place('campfire', 0, 64, 4);
check('placed in water: out, and wet', prop(0, 64, 4, 'lit') === false && prop(0, 64, 4, 'waterlogged') === true && (FLAGS[world.getState(0, 64, 4)] & F_WATER) !== 0);
check('a wet campfire can\'t be lit', village.lightCampfire(level, 0, 64, 4) === false);

// the smoke
const be = world.getBlockEntity(0, 64, 0);
check('a block entity with four places', be instanceof beMod.CampfireBlockEntity && be.container.size === 4);
parts = [];
tick(400);
const cosy = parts.filter((p) => p.k === 'campfire_cosy_smoke');
const signal = parts.filter((p) => p.k === 'campfire_signal_smoke');
check('smoke rises from the lit fires', cosy.length > 60 && signal.length > 20, `${cosy.length} ${signal.length}`);
check('from the middle, going up', cosy.every((p) => Math.abs(p.x - 0.5) <= 1 / 3 + 1e-9 || Math.abs(p.x - 3.5) <= 1 / 3 + 1e-9) && cosy.every((p) => p.dy === 0.07 && p.y >= 64 && p.y <= 66));
check('none from the wet one', parts.every((p) => Math.abs(p.z - 4.5) > 1));

// animateTick: crackles, embers from the ordinary fire only
sounds = [];
parts = [];
for (let i = 0; i < 400; i++) { hook(0, 64, 0).animateTick(level, 0, 64, 0, world.getState(0, 64, 0)); hook(3, 64, 0).animateTick(level, 3, 64, 0, world.getState(3, 64, 0)); }
check('it crackles', sounds.filter((s) => s === 'block.campfire.crackle').length > 40);
check('embers from the campfire, not the soul campfire', parts.some((p) => p.k === 'lava' && p.x === 0.5) && !parts.some((p) => p.k === 'lava' && p.x === 3.5));

// standing in it
const z1 = new monsters.Zombie(level);
z1.moveTo(0.5, 64, 0.5, 0, 0);
level.addEntity(z1);
const h1 = z1.health;
hook(0, 64, 0).entityInside(level, 0, 64, 0, world.getState(0, 64, 0), z1);
const z2 = new monsters.Zombie(level);
z2.moveTo(3.5, 64, 0.5, 0, 0);
level.addEntity(z2);
const h2 = z2.health;
hook(3, 64, 0).entityInside(level, 3, 64, 0, world.getState(3, 64, 0), z2);
// (a zombie's 2 points of armour take 6% off)
check('burns: 1, soul fire 2 (less armour)', Math.abs(h1 - z1.health - 0.94) < 1e-6 && Math.abs(h2 - z2.health - 1.92) < 1e-6, `${h1 - z1.health} ${h2 - z2.health}`);
check('the campfire\'s is fire damage', living.FIRE_SOURCES.has('campfire'));

// putting it out, lighting it again
sounds = [];
parts = [];
check('a shovel puts it out', village.dowseCampfire(level, 0, 64, 0) === true && prop(0, 64, 0, 'lit') === false);
check('with a hiss and a cloud of smoke', sounds.includes('block.fire.extinguish') && parts.filter((p) => p.k === 'campfire_cosy_smoke').length === 20 && parts.filter((p) => p.k === 'smoke').length === 20);
check('not twice', village.dowseCampfire(level, 0, 64, 0) === false);
const z3 = new monsters.Zombie(level);
z3.moveTo(0.5, 64, 0.5, 0, 0);
level.addEntity(z3);
const h3 = z3.health;
hook(0, 64, 0).entityInside(level, 0, 64, 0, world.getState(0, 64, 0), z3);
check('out: harmless', z3.health === h3);
parts = [];
tick(100);
check('out: no smoke', !parts.some((p) => Math.abs(p.x - 0.5) < 0.5 && p.k.startsWith('campfire')));
check('flint and steel lights it', village.lightCampfire(level, 0, 64, 0) === true && prop(0, 64, 0, 'lit') === true);
check('not when already lit', village.lightCampfire(level, 0, 64, 0) === false);
// a burning arrow
village.dowseCampfire(level, 0, 64, 0);
const arrow = { isOnFire: () => true, type: 'arrow', owner: null };
hook(0, 64, 0).projectileHit(level, 0, 64, 0, world.getState(0, 64, 0), { face: 1, px: 0.5, py: 64.4, pz: 0.5 }, arrow);
check('a burning arrow lights it', prop(0, 64, 0, 'lit') === true);
village.dowseCampfire(level, 0, 64, 0);
hook(0, 64, 0).projectileHit(level, 0, 64, 0, world.getState(0, 64, 0), { face: 1, px: 0.5, py: 64.4, pz: 0.5 }, { isOnFire: () => false, type: 'arrow', owner: null });
check('a cold one doesn\'t', prop(0, 64, 0, 'lit') === false);
level.gameRules.mobGriefing = false;
hook(0, 64, 0).projectileHit(level, 0, 64, 0, world.getState(0, 64, 0), { face: 1, px: 0.5, py: 64.4, pz: 0.5 }, { isOnFire: () => false, type: 'small_fireball', owner: z1 });
check('a blaze\'s fireball, with mob griefing off, doesn\'t', prop(0, 64, 0, 'lit') === false);
level.gameRules.mobGriefing = true;
hook(0, 64, 0).projectileHit(level, 0, 64, 0, world.getState(0, 64, 0), { face: 1, px: 0.5, py: 64.4, pz: 0.5 }, { isOnFire: () => false, type: 'small_fireball', owner: z1 });
check('with it on, does', prop(0, 64, 0, 'lit') === true);
// water from a bucket
sounds = [];
parts = [];
check('water poured in', hook(0, 64, 0).placeLiquid(level, 0, 64, 0, world.getState(0, 64, 0)) === true && prop(0, 64, 0, 'waterlogged') === true && prop(0, 64, 0, 'lit') === false);
check('puts it out with a fizz', sounds.includes('entity.generic.extinguish_fire') && parts.filter((p) => p.k === 'campfire_cosy_smoke').length === 20);
check('no more goes in', hook(0, 64, 0).placeLiquid(level, 0, 64, 0, world.getState(0, 64, 0)) === false);

// loot
const r = new rng.Rand(1);
const drop = (n, silk = false) => rules.blockDrops(S(n), ITEMS.get('iron_axe'), r, silk).map((s) => `${s.item.id}x${s.count}`).join();
check('two charcoal', drop('campfire') === 'charcoalx2');
check('soul soil', drop('soul_campfire') === 'soul_soilx1');
check('silk touch: itself', drop('campfire', true) === 'campfirex1' && drop('soul_campfire', true) === 'soul_campfirex1');
// items, recipes, textures, sound
check('flat items', ITEMS.get('campfire')?.texture === 'campfire' && ITEMS.get('soul_campfire')?.texture === 'soul_campfire' && ITEMS.get('campfire')?.creativeTab === 'functional');
check('recipes', recipes.RECIPES.some((x) => x.result === 'campfire') && recipes.RECIPES.some((x) => x.result === 'soul_campfire'));
check('textures', ['campfire_log', 'campfire_log_lit', 'campfire_fire', 'soul_campfire_log_lit', 'soul_campfire_fire'].every((t) => tex.BLOCK_TEXTURES[t]));
const sm = smoke.campfireSmokeTextures();
check('twelve smoke puffs', Object.keys(sm).length === 12 && Object.values(sm).every((f) => { const t = f(); let n = 0; for (let i = 3; i < t.data.length; i += 4) if (t.data[i]) n++; return n > 20; }));
{
  const g = synth.SOUNDS['block.campfire.crackle'];
  let ok = !!g && g.variants === 6;
  if (g) for (let v = 0; v < g.variants; v++) {
    const pcm = g.generate(v, 22050);
    let peak = 0;
    for (const x of pcm) peak = Math.max(peak, Math.abs(x));
    ok &&= pcm.length > 22050 && peak > 0.2;
  }
  check('sound block.campfire.crackle', ok);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
