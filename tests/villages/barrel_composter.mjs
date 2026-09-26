// Headless checks for the barrel and the composter (node tests/villages/barrel_composter.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/player.ts', '/src/world/blockEntity.ts', '/src/audio/synth.ts', '/src/core/rng.ts',
  '/src/inventory/recipes.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, rules, behavior, itemMod, playerMod, beMod, synth, rng, recipes] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK, COLLISION, FACE_OCC } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
let particles = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push(`${n}@${v}/${(+p).toFixed(2)}`), playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn: (k, x, y, z) => particles.push([k, x, y, z]) };
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
const prop = (x, y, z, p) => { const st = world.getState(x, y, z); return BLOCKS[STATE_BLOCK[st]].get(st, p); };
const tick = (n) => { for (let i = 0; i < n; i++) level.tick(); };
const place = (block, x, y, z, face, yaw = 0, pitch = 0) => {
  const st = rules.placementState(getBlock(block), { world, x, y, z, face, hitY: 0.5, yaw, pitch, sneaking: false, clickedState: 0 });
  if (st !== null) level.setBlock(x, y, z, st);
  return st;
};
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'), false);
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -5.5, 0, 0);
const hold = (id, n = 1) => { player.inventory.main[player.inventory.selected] = id ? ItemStack.of(id, n) : null; };
const held = () => player.inventory.main[player.inventory.selected];
const useItemOn = (x, y, z) => {
  const st = world.getState(x, y, z);
  return behavior.behaviorOf(st).useItemOn(level, x, y, z, st, held(), { player, face: 1, hx: x + 0.5, hy: y + 1, hz: z + 0.5, hand: 'main' });
};
const use = (x, y, z) => { const st = world.getState(x, y, z); return behavior.behaviorOf(st).use(level, x, y, z, st, { player, face: 1, hx: x + 0.5, hy: y + 1, hz: z + 0.5 }); };

// --- barrel: faces the player, opens while looked into, keeps its things ---
place('barrel', 0, 64, 0, 1, 0, 0); // looking south (yaw 0), level
check('barrel faces back toward the player', prop(0, 64, 0, 'facing') === 'north', prop(0, 64, 0, 'facing'));
place('barrel', 2, 64, 0, 1, 0, 90); // looking straight down
check('placed looking down, it faces up', prop(2, 64, 0, 'facing') === 'up', prop(2, 64, 0, 'facing'));
const be = world.getBlockEntity(0, 64, 0);
check('barrel block entity: 27 slots', be instanceof beMod.BarrelBlockEntity && be.container.size === 27 && be.id === 'barrel');
sounds = [];
be.startOpen(level);
check('opened: open, and the lid sounds at its face', prop(0, 64, 0, 'open') === true && sounds.length === 1 && /^block\.barrel\.open@0\.5\/(0\.9\d|1\.00)$/.test(sounds[0]), sounds.join(' '));
be.startOpen(level);
be.stopOpen(level);
check('a second viewer: no second sound, still open', prop(0, 64, 0, 'open') === true && sounds.length === 1);
be.stopOpen(level);
check('the last viewer gone: shut', prop(0, 64, 0, 'open') === false && sounds.length === 2 && sounds[1].startsWith('block.barrel.close@0.5'), sounds.join(' '));
be.container.items[4] = ItemStack.of('diamond', 3);
const saved = be.save();
const loaded = beMod.loadBlockEntity(saved);
check('saves and loads as a barrel', saved.id === 'barrel' && loaded instanceof beMod.BarrelBlockEntity && loaded.container.items[4]?.count === 3);
level.destroyBlock(0, 64, 0, true);
check('broken: its things spill', level.entities.some((e) => e.type === 'item' && e.stack?.item.id === 'diamond') && level.entities.some((e) => e.type === 'item' && e.stack?.item.id === 'barrel'));
check('barrel is fuel for 300 ticks', recipes.fuelTime(ItemStack.of('barrel')) === 300 && recipes.fuelTime(ItemStack.of('composter')) === 300);
check('barrel and composter recipes', recipes.RECIPES.some((r) => r.result === 'barrel') && recipes.RECIPES.some((r) => r.result === 'composter'));

// --- composter ---
level.setBlock(4, 64, 4, S('composter'));
check('empty composter shape: floor at 2 px', COLLISION[world.getState(4, 64, 4)].some((b) => b[4] === 2 / 16 && b[3] === 1));
check('composter sides are sturdy, its top is not', (FACE_OCC[world.getState(4, 64, 4)] & 0b111101) === 0b111101 && !(FACE_OCC[world.getState(4, 64, 4)] & 2));
hold('wheat_seeds', 5);
sounds = []; particles = [];
check('seeds go in', useItemOn(4, 64, 4) === 'success');
check('the first always counts', prop(4, 64, 4, 'level') === 1 && sounds[0] === 'block.composter.fill_success@1/1.00', sounds.join(' '));
check('ten sparkles over the new top', particles.length === 10 && particles.every(([k, , y]) => k === 'composter' && y >= 64 + 3 / 16 + 1 / 32 && y <= 65), JSON.stringify(particles[0]));
check('one seed used', held().count === 4);
hold('stone');
check('stone is not compost', useItemOn(4, 64, 4) === 'pass');
hold('pumpkin_pie', 10);
for (let i = 0; i < 6; i++) useItemOn(4, 64, 4);
check('pumpkin pie always counts: level 7', prop(4, 64, 4, 'level') === 7 && held().count === 4);
sounds = [];
check('full: the click is spent, nothing goes in', useItemOn(4, 64, 4) === 'success' && held().count === 4 && sounds.length === 0);
tick(19);
check('not ready after 19 ticks', prop(4, 64, 4, 'level') === 7);
tick(1);
check('ready after 20', prop(4, 64, 4, 'level') === 8 && sounds.includes('block.composter.ready@1/1.00'), sounds.join(' '));
check('ready composter drops bone meal too', rules.blockDrops(world.getState(4, 64, 4), null, new rng.Rand(1)).map((s) => s.item.id).join(',') === 'composter,bone_meal');
check('ready: compost passes to the block', useItemOn(4, 64, 4) === 'pass');
const n0 = level.entities.length;
sounds = [];
check('emptied by hand', use(4, 64, 4) === true && prop(4, 64, 4, 'level') === 0 && sounds.includes('block.composter.empty@1/1.00'));
const meal = level.entities.slice(n0).find((e) => e.type === 'item');
check('bone meal pops out on top', meal && meal.stack.item.id === 'bone_meal' && meal.y > 64.6 && meal.y < 65.4, meal && meal.y.toFixed(2));
check('an empty composter does nothing by hand', use(4, 64, 4) === false);
// the odds: 1000 seeds into a composter at level 1 go up about 30% of the time
{
  let ups = 0;
  hold('wheat_seeds', 64);
  for (let i = 0; i < 1000; i++) {
    level.setBlock(4, 64, 4, getBlock('composter').state({ level: 1 }));
    player.inventory.main[player.inventory.selected] = ItemStack.of('wheat_seeds', 64);
    useItemOn(4, 64, 4);
    if (prop(4, 64, 4, 'level') === 2) ups++;
  }
  check('seeds raise it 30% of the time', ups > 250 && ups < 350, String(ups));
}
// creative players keep their items
player.gameMode = 'creative';
level.setBlock(4, 64, 4, S('composter'));
hold('apple', 1);
useItemOn(4, 64, 4);
check('creative: nothing used up', held()?.count === 1 && prop(4, 64, 4, 'level') === 1);
player.gameMode = 'survival';

// --- sounds render ---
for (const n of ['block.barrel.open', 'block.barrel.close', 'block.composter.fill', 'block.composter.fill_success', 'block.composter.empty', 'block.composter.ready']) {
  const g = synth.SOUNDS[n];
  let ok = !!g, info = '';
  if (g) for (let v = 0; v < g.variants; v++) {
    const pcm = g.generate(v, 22050);
    let peak = 0;
    for (const x of pcm) peak = Math.max(peak, Math.abs(x));
    ok &&= pcm.length > 2000 && peak > 0.3 && Number.isFinite(peak);
    info += `${(pcm.length / 22050).toFixed(2)}s `;
  }
  check(`sound ${n}`, ok, info);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
