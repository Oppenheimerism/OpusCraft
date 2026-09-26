// Headless checks for Stage 5 M1 (node tests/ocean/m1.mjs): the prismarines, their slabs, stairs and wall, the
// shards and crystals, the recipes, sponges soaking up water, the wet sponge, the sea lantern's drops.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/inventory/recipes.ts', '/src/inventory/stonecutting.ts', '/src/world/blockEntity.ts',
  '/src/game/blockRules.ts', '/src/textures/blocks.ts', '/src/audio/gen/ocean.ts', '/src/entity/itemEntity.ts', '/src/core/rng.ts', '/src/game/blockBehavior.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, recipes, stonecut, beMod, rules, tex, oceanAudio, itemEnt, rng, beh] = mods;
const { S, BLOCKS, STATE_BLOCK, getBlock } = blockMod;
const { ItemStack, ITEMS } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const nameAt = (w, x, y, z) => BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name;

// --- blocks and items
for (const n of ['prismarine', 'prismarine_bricks', 'dark_prismarine']) {
  const b = getBlock(n);
  check(`${n}: 1.5 hard, 6 resistant, a pickaxe for it`, b.hardness === 1.5 && b.s.resistance === 6 && b.requiresTool && b.tool === 'pickaxe' && ITEMS.has(n));
}
const fam = ['prismarine_slab', 'prismarine_stairs', 'prismarine_wall', 'prismarine_brick_slab', 'prismarine_brick_stairs', 'dark_prismarine_slab', 'dark_prismarine_stairs'];
check('their slabs and stairs, and prismarine\'s wall', fam.every((n) => ITEMS.has(n)), fam.filter((n) => !ITEMS.has(n)).join());
check('no brick or dark prismarine wall (vanilla has none)', !ITEMS.has('prismarine_brick_wall') && !ITEMS.has('dark_prismarine_wall'));
check('wet sponge: 0.6 hard, by the sponge in the tab', getBlock('wet_sponge').hardness === 0.6 && ITEMS.get('wet_sponge').creativeTab === ITEMS.get('sponge').creativeTab);
check('prismarine shards and crystals', ITEMS.has('prismarine_shard') && ITEMS.has('prismarine_crystals'));

// --- recipes
const grid = (rows, key) => {
  const g = [];
  for (const row of rows) for (const ch of row) g.push(ch === ' ' ? null : ItemStack.of(key[ch]));
  return g;
};
const craft = (rows, key) => recipes.findRecipe(grid(rows, key), rows[0].length, rows.length);
const r1 = craft(['SS', 'SS'], { S: 'prismarine_shard' });
check('4 shards: prismarine', r1?.result === 'prismarine' && r1.count === 1);
check('9 shards: prismarine bricks', craft(['SSS', 'SSS', 'SSS'], { S: 'prismarine_shard' })?.result === 'prismarine_bricks');
check('8 shards round a black dye: dark prismarine', craft(['SSS', 'SIS', 'SSS'], { S: 'prismarine_shard', I: 'black_dye' })?.result === 'dark_prismarine');
check('4 shards and 5 crystals: a sea lantern', craft(['SCS', 'CCC', 'SCS'], { S: 'prismarine_shard', C: 'prismarine_crystals' })?.result === 'sea_lantern');
const slab = craft(['###'], { '#': 'prismarine_bricks' }), stairs = craft(['#  ', '## ', '###'], { '#': 'dark_prismarine' }), wall = craft(['###', '###'], { '#': 'prismarine' });
check('slabs (6), stairs (4) and the wall (6)', slab?.result === 'prismarine_brick_slab' && slab.count === 6 && stairs?.result === 'dark_prismarine_stairs' && stairs.count === 4 && wall?.result === 'prismarine_wall' && wall.count === 6);
const sc = stonecut.stonecuttingRecipesFor(ItemStack.of('prismarine')).map((r) => `${r.result}x${r.count}`);
check('the stonecutter cuts them too', sc.includes('prismarine_slabx2') && sc.includes('prismarine_wallx1') && stonecut.stonecuttingRecipesFor(ItemStack.of('dark_prismarine')).length === 2, sc.join());
const sm = recipes.smeltingResult(ItemStack.of('wet_sponge'));
check('a wet sponge smelts dry (0.15 xp)', sm?.result === 'sponge' && sm.xp === 0.15);

// --- a flat world for the rest
function setup() {
  const world = new worldMod.World();
  for (let cx = -3; cx < 3; cx++) for (let cz = -3; cz < 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) { const c = world.getChunk(x >> 4, z >> 4); for (let y = 40; y <= 49; y++) c.setState(x & 15, y, z & 15, S('stone')); }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new levelMod.Level(world, 'test');
  const sounds = [], parts = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z }); } };
  return { level, world, sounds, parts };
}

// --- a sponge in a big pool: 65 at most, within six steps
{
  const { level, world, sounds } = setup();
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) for (let y = 50; y <= 60; y++) world.setState(x, y, z, S('water'));
  const before = [];
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) for (let y = 50; y <= 60; y++) before.push([x, y, z]);
  level.setBlock(0, 55, 0, S('sponge'));
  const gone = before.filter(([x, y, z]) => !(x === 0 && y === 55 && z === 0) && nameAt(world, x, y, z) === 'air');
  const far = Math.max(...gone.map(([x, y, z]) => Math.abs(x) + Math.abs(y - 55) + Math.abs(z)));
  // (vanilla: each search takes 64 at most; the first block taken tells the sponge its neighbour changed, which runs a
  // second search at once — so in open water it can take more, all still within six steps)
  check('a sponge set in the water soaks it up, none more than six steps off', gone.length >= 64 && gone.length <= 128 && far <= 6, `${gone.length} taken, farthest ${far}`);
  check('...and is wet, with a slurp', nameAt(world, 0, 55, 0) === 'wet_sponge' && sounds.some((s) => s.n === 'block.sponge.absorb'));
}

// --- waterlogged blocks, kelp and seagrass; flowing water; a sponge woken by its neighbour
{
  const { level, world } = setup();
  world.setState(1, 50, 0, S('oak_slab', { type: 'bottom', waterlogged: true }));
  world.setState(0, 50, 1, S('kelp'));
  world.setState(0, 51, 1, S('water'));
  world.setState(-1, 50, 0, S('seagrass'));
  world.setState(0, 50, -1, S('water', { level: 3 }));
  world.setState(0, 51, 0, S('stone'));
  level.setBlock(0, 50, 0, S('sponge'));
  const slab = world.getState(1, 50, 0);
  check('it takes the water out of a waterlogged slab (the slab stays)', nameAt(world, 1, 50, 0) === 'oak_slab' && getBlock('oak_slab').get(slab, 'waterlogged') === false);
  check('...pulls up kelp and seagrass, and takes flowing water', nameAt(world, 0, 50, 1) === 'air' && nameAt(world, -1, 50, 0) === 'air' && nameAt(world, 0, 50, -1) === 'air' && nameAt(world, 0, 51, 1) === 'air');
  const kelp = level.entities.filter((e) => e instanceof itemEnt.ItemEntity && e.stack.item.id === 'kelp');
  check('...the kelp dropping as kelp', kelp.length === 1);
  // a dry sponge with nothing round it stays dry, until water comes next to it
  level.setBlock(10, 50, 10, S('sponge'));
  check('no water, it stays dry', nameAt(world, 10, 50, 10) === 'sponge');
  level.setBlock(11, 50, 10, S('water'));
  check('water set beside it: it soaks it up', nameAt(world, 10, 50, 10) === 'wet_sponge' && nameAt(world, 11, 50, 10) === 'air');
}

// --- the wet sponge: in the Nether it steams dry; it drips
{
  const { level, world, sounds, parts } = setup();
  world.dim = { ...world.dim, ultraWarm: true };
  level.setBlock(0, 50, 0, S('wet_sponge'));
  check('a wet sponge set down in the Nether dries at once, hissing and steaming', nameAt(world, 0, 50, 0) === 'sponge' && sounds.some((s) => s.n === 'block.wet_sponge.dries') && parts.filter((p) => p.k === 'poof').length === 8);
}
{
  const { level, world, parts } = setup();
  level.setBlock(0, 55, 0, S('wet_sponge'));
  for (let i = 0; i < 400; i++) beh.behaviorOf(world.getState(0, 55, 0)).animateTick(level, 0, 55, 0, world.getState(0, 55, 0));
  const drips = parts.filter((p) => p.k === 'dripping_water');
  check('the wet sponge drips (from any side but the top)', drips.length > 200 && drips.every((p) => p.y <= 55.8 + 1e-9 && p.y >= 54.9), `${drips.length}`);
}

// --- the furnace dries it, filling a bucket in the fuel slot
{
  const { level, world } = setup();
  world.setState(0, 50, 0, S('furnace'));
  const f = new beMod.FurnaceBlockEntity(0, 50, 0);
  f.container.items[0] = ItemStack.of('wet_sponge');
  f.container.items[1] = ItemStack.of('bucket');
  f.litTime = f.litDuration = 1000;
  for (let i = 0; i < 201; i++) f.tick(level);
  check('the furnace dries a wet sponge and fills the bucket there with its water', f.container.get(2)?.item.id === 'sponge' && f.container.get(1)?.item.id === 'water_bucket');
}

// --- the sea lantern's drops
{
  const r = new rng.Rand(7);
  const counts = new Set();
  let ok = true;
  for (let i = 0; i < 200; i++) {
    const d = rules.blockDrops(S('sea_lantern'), null, r);
    if (d.length !== 1 || d[0].item.id !== 'prismarine_crystals') ok = false;
    else counts.add(d[0].count);
  }
  check('a sea lantern breaks into 2-3 prismarine crystals', ok && [...counts].sort().join() === '2,3', [...counts].join());
  let max = 0;
  for (let i = 0; i < 300; i++) max = Math.max(max, rules.blockDrops(S('sea_lantern'), null, r, false, 3)[0].count);
  check('...fortune adds, five at most', max === 5);
  check('...with silk touch, itself', rules.blockDrops(S('sea_lantern'), null, r, true)[0].item.id === 'sea_lantern');
}

// --- textures and sounds
{
  const T = tex.BLOCK_TEXTURES;
  const p = T['prismarine']();
  check('prismarine\'s texture shifts its hue (animated, 15 s a frame, blended)', p.frames?.length === 4 && p.frameTime === 300 && p.interpolate);
  check('the bricks, the dark prismarine and the wet sponge are drawn', ['prismarine_bricks', 'dark_prismarine', 'wet_sponge'].every((n) => T[n]?.().data?.length === 16 * 16 * 4));
  const snd = oceanAudio.oceanSounds();
  let good = true;
  for (const [n, g] of Object.entries(snd).filter(([n]) => n.includes('sponge'))) for (let v = 0; v < g.variants; v++) { const b = g.generate(v, 44100); let pk = 0; for (const x of b) { if (!Number.isFinite(x)) good = false; pk = Math.max(pk, Math.abs(x)); } if (pk < 0.1) good = false; }
  check('the slurp and the hiss synthesize', good && snd['block.sponge.absorb'] && snd['block.wet_sponge.dries']);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
