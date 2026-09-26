// Headless checks for the smoker and the blast furnace (node tests/villages/smoker.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/world/blockEntity.ts', '/src/audio/synth.ts', '/src/inventory/recipes.ts', '/src/inventory/recipeBook.ts',
  '/src/core/rng.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, rules, behavior, itemMod, beMod, synth, recipes, book, rng] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK, EMISSION } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [], particles = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push(`${n}@${v}/${(+p).toFixed(2)}`), playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn: (k, x, y, z) => particles.push([k, x, y, z]) };
const prop = (x, y, z, p) => { const st = world.getState(x, y, z); return BLOCKS[STATE_BLOCK[st]].get(st, p); };
const tick = (n) => { for (let i = 0; i < n; i++) level.tick(); };
const place = (block, x, y, z, face, yaw = 0, pitch = 0) => {
  const st = rules.placementState(getBlock(block), { world, x, y, z, face, hitY: 0.5, yaw, pitch, sneaking: false, clickedState: 0 });
  if (st !== null) level.setBlock(x, y, z, st);
  return st;
};
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'), false);

place('smoker', 0, 64, 0, 1, 0);
place('blast_furnace', 2, 64, 0, 1, 0);
check('smoker faces the player', prop(0, 64, 0, 'facing') === 'north', prop(0, 64, 0, 'facing'));
const sm = world.getBlockEntity(0, 64, 0), bf = world.getBlockEntity(2, 64, 0);
check('their block entities', sm instanceof beMod.FurnaceBlockEntity && sm.id === 'smoker' && bf instanceof beMod.FurnaceBlockEntity && bf.id === 'blast_furnace');
check('smoker cooks food only', recipes.cookingResult('smoker', ItemStack.of('beef'))?.result === 'cooked_beef' && !recipes.cookingResult('smoker', ItemStack.of('raw_iron')));
check('blast furnace: ores only', recipes.cookingResult('blast_furnace', ItemStack.of('raw_iron'))?.result === 'iron_ingot' && !recipes.cookingResult('blast_furnace', ItemStack.of('beef')));
check('blast furnace melts iron gear to nuggets', recipes.cookingResult('blast_furnace', ItemStack.of('iron_sword'))?.result === 'iron_nugget');
check('coal burns 800 ticks in them', recipes.burnDuration('smoker', ItemStack.of('coal')) === 800 && recipes.burnDuration('furnace', ItemStack.of('coal')) === 1600);

sm.container.items[0] = ItemStack.of('beef', 3);
sm.container.items[1] = ItemStack.of('coal', 1);
tick(1);
check('smoker lights', prop(0, 64, 0, 'lit') === true && sm.litTime === 800 && EMISSION[world.getState(0, 64, 0)] === 13, String(sm.litTime));
tick(98);
check('not done at 99 ticks', !sm.container.items[2]);
tick(1);
check('cooked beef at 100 ticks', sm.container.items[2]?.item.id === 'cooked_beef' && sm.container.items[0]?.count === 2, JSON.stringify(sm.container.items[2]?.item.id));
tick(200);
check('three beef in 300 ticks', sm.container.items[2]?.count === 3 && !sm.container.items[0]);
check('smoked xp stored', Math.abs(sm.storedXp - 1.05) < 1e-6, String(sm.storedXp));
tick(500);
check('still lit with one tick of fuel left', prop(0, 64, 0, 'lit') === true && sm.litTime === 1);
tick(1);
check('out of fuel: unlit', prop(0, 64, 0, 'lit') === false);

bf.container.items[0] = ItemStack.of('beef', 1);
bf.container.items[1] = ItemStack.of('coal', 1);
tick(5);
check('blast furnace will not light for beef', prop(2, 64, 0, 'lit') === false && bf.litTime === 0);
bf.container.items[0] = ItemStack.of('raw_iron', 1);
tick(101);
check('raw iron to an ingot in 100 ticks', bf.container.items[2]?.item.id === 'iron_ingot', String(bf.cookingProgress));

// save and load keep the kind
const saved = sm.save();
check('saved as a smoker', saved.id === 'smoker' && beMod.loadBlockEntity(saved)?.id === 'smoker' && beMod.loadBlockEntity(saved).cookingTotalTime === 100);

// effects
level.setBlock(4, 64, 0, getBlock('blast_furnace').state({ lit: true, facing: 'east' }));
particles = []; sounds = [];
for (let i = 0; i < 200; i++) behavior.behaviorOf(world.getState(4, 64, 0)).animateTick(level, 4, 64, 0, world.getState(4, 64, 0));
check('blast furnace smoke at its east face', particles.length === 200 && particles.every(([k, x, y]) => k === 'smoke' && Math.abs(x - 5.02) < 1e-9 && y >= 64 && y <= 64 + 9 / 16));
check('its crackle about one in ten', sounds.length > 5 && sounds.length < 40 && sounds.every((s) => s.startsWith('block.blast_furnace.fire_crackle@1/')), String(sounds.length));
level.setBlock(6, 64, 0, getBlock('smoker').state({ lit: true }));
particles = []; sounds = [];
for (let i = 0; i < 100; i++) behavior.behaviorOf(world.getState(6, 64, 0)).animateTick(level, 6, 64, 0, world.getState(6, 64, 0));
check('smoker smoke out of the top', particles.every(([k, x, y, z]) => k === 'smoke' && x === 6.5 && Math.abs(y - 65.1) < 1e-9 && z === 0.5));

// recipe books
const smokerBook = book.collections('smoker');
const blastBook = book.collections('blast_furnace');
check('smoker book: food', smokerBook.length >= 7 && smokerBook.every((c) => c.category === 'smoker_food'), String(smokerBook.length));
check('blast furnace book: misc', blastBook.length >= 9 && blastBook.every((c) => c.category === 'blast_furnace_misc'), String(blastBook.length));
check('recipes: smoker and blast furnace', recipes.RECIPES.some((r) => r.result === 'smoker') && recipes.RECIPES.some((r) => r.result === 'blast_furnace'));
check('drops need a pickaxe', rules.blockDrops(world.getState(0, 64, 0), null, new rng.Rand(1)).length === 0);

for (const n of ['block.smoker.smoke', 'block.blast_furnace.fire_crackle']) {
  const g = synth.SOUNDS[n];
  let ok = !!g;
  if (g) for (let v = 0; v < g.variants; v++) {
    const pcm = g.generate(v, 22050);
    let peak = 0;
    for (const x of pcm) peak = Math.max(peak, Math.abs(x));
    ok &&= pcm.length > 2000 && peak > 0.3 && Number.isFinite(peak);
  }
  check(`sound ${n}`, ok);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
