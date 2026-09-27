// Cooking on a campfire (vanilla CampfireBlock.useItemOn, CampfireBlockEntity): raw food right-clicked onto either
// campfire goes on in its first free place of four, one from the hand (none in creative); a lit fire cooks it in 600
// ticks and it drops out cooked where the fire is, with a game event; put out, what's on it stays and cools two ticks'
// worth a tick, cooking on from there once lit again; a full fire, or what won't cook, passes the click on; broken, it
// drops what's on it; what's on it and how far it's got go through a save; wisps of smoke rise off each place with food
// on it; a guest is sent what's on the fire. And dried kelp, what kelp cooks into: a quick bite, from a furnace or a
// smoker too, nine to a dried kelp block (a hoe's block, and fuel for 4000 ticks) and back.

import { load, check, exitWithStatus, flatLevel, addPlayer } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/villageBlocks.ts', '/src/game/blockBehavior.ts', '/src/game/blockRules.ts', '/src/item/item.ts', '/src/entity/itemEntity.ts',
  '/src/world/blockEntity.ts', '/src/inventory/recipes.ts', '/src/net/chunkData.ts', '/src/textures/blocks.ts',
]);

const { world, level } = flatLevel(m, -1, -1, 1, 1, 64, 'stone', 'campfire');
const p = addPlayer(m, level, 3.5, 64, 0.5);
const events = [];
const gameEvent = level.gameEvent.bind(level);
level.gameEvent = (e, x, y, z, ctx) => (events.push({ e, x, y, z, ctx }), gameEvent(e, x, y, z, ctx));
let parts = [];
level.particles.spawn = (k, x, y, z, dx, dy, dz) => parts.push({ k, x, y, z, dx, dy, dz });

const tick = (n) => { for (let i = 0; i < n; i++) level.tick(); };
const stateAt = (x, y, z) => world.getState(x, y, z);
const prop = (x, y, z, k) => m.BLOCKS[m.STATE_BLOCK[stateAt(x, y, z)]].get(stateAt(x, y, z), k);
/** a campfire at (x, 64, z) facing `facing`, lit or not */
function campfire(x, z, name = 'campfire', lit = true, facing = 'north') {
  level.setBlock(x, 64, z, m.getBlock(name).state({ lit, facing, signal_fire: false, waterlogged: false }));
  return world.getBlockEntity(x, 64, z);
}
/** right-click the fire at (x, 64, z) holding `stack` in the main hand, as Interaction does */
function click(x, z, stack) {
  p.inventory.main[p.inventory.selected] = stack;
  const ctx = { player: p, face: 1, hx: x + 0.5, hy: 64 + 7 / 16, hz: z + 0.5, hand: 'main' };
  return p.inventory.withHand('main', () => m.behaviorOf(stateAt(x, 64, z)).useItemOn(level, x, 64, z, stateAt(x, 64, z), stack, ctx));
}
const itemsAround = (x, z, id) => level.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id === id && Math.abs(e.x - (x + 0.5)) < 1 && Math.abs(e.z - (z + 0.5)) < 1);
const onFire = (be) => be.container.items.map((s) => (s ? s.item.id : '-')).join(' ');

// --- putting food on
{
  const be = campfire(0, 0);
  events.length = 0;
  const r = click(0, 0, m.ItemStack.of('beef', 5));
  check('raw beef clicked onto a lit campfire goes on it', r === 'success' && onFire(be) === 'beef - - -', `${r} ${onFire(be)}`);
  check('one of it, from the hand', p.inventory.main[p.inventory.selected]?.count === 4);
  check('to cook for 600 ticks', be.cookingTime[0] === 600 && be.cookingProgress[0] === 0);
  check('a game event, by the player', events.some((e) => e.e === 'block_change' && e.ctx?.entity === p));
  for (const food of ['porkchop', 'potato']) click(0, 0, m.ItemStack.of(food, 1));
  check('the next goes in the next place', onFire(be) === 'beef porkchop potato -');
  check('the last of a stack goes too', !p.inventory.main[p.inventory.selected]);
  click(0, 0, m.ItemStack.of('kelp', 1));
  check('four places', onFire(be) === 'beef porkchop potato kelp');
  const full = m.ItemStack.of('chicken', 3);
  check('a full fire passes the click on (to eat the chicken, say)', click(0, 0, full) === 'pass' && full.count === 3 && onFire(be).split(' ').length === 4);
  const empty = campfire(3, 0);
  check('what won\'t cook is passed on', click(3, 0, m.ItemStack.of('stone', 1)) === 'pass' && click(3, 0, m.ItemStack.of('cooked_beef', 1)) === 'pass' && onFire(empty) === '- - - -');
}

// --- cooking
{
  const be = campfire(0, 0);
  const cooked = ['cooked_beef', 'cooked_porkchop', 'baked_potato', 'dried_kelp'];
  tick(599);
  check('nothing done after 599 ticks', onFire(be) === 'beef porkchop potato kelp' && cooked.every((id) => itemsAround(0, 0, id).length === 0));
  events.length = 0;
  tick(1);
  check('at 600 all four drop out cooked', onFire(be) === '- - - -' && cooked.every((id) => itemsAround(0, 0, id).length === 1), onFire(be));
  const drops = cooked.flatMap((id) => itemsAround(0, 0, id));
  check('one each, where the fire is', drops.every((e) => e.stack.count === 1 && e.y >= 64 && e.y < 65.1));
  check('a game event for each, of the fire', events.filter((e) => e.e === 'block_change').length === 4 && events.every((e) => e.e !== 'block_change' || e.ctx?.state === stateAt(0, 64, 0)));
  for (const e of drops) e.removed = true;
}

// --- every recipe
{
  const pairs = [['beef', 'cooked_beef'], ['porkchop', 'cooked_porkchop'], ['chicken', 'cooked_chicken'], ['mutton', 'cooked_mutton'], ['cod', 'cooked_cod'], ['salmon', 'cooked_salmon'], ['rabbit', 'cooked_rabbit'], ['potato', 'baked_potato'], ['kelp', 'dried_kelp']];
  check('nine foods cook on a campfire, each into its cooked self', pairs.every(([a, b]) => m.campfireCookingResult(m.ItemStack.of(a)) === b));
  check('nothing else does', ['iron_ore', 'sand', 'cooked_beef', 'rotten_flesh', 'wet_sponge', 'cactus'].every((id) => m.campfireCookingResult(m.ItemStack.of(id)) === null));
  const be = campfire(-3, 3, 'soul_campfire');
  click(-3, 3, m.ItemStack.of('salmon', 1));
  tick(600);
  check('the soul campfire cooks too', itemsAround(-3, 3, 'cooked_salmon').length === 1 && onFire(be) === '- - - -');
}

// --- put out and lit again
{
  const be = campfire(0, 4);
  click(0, 4, m.ItemStack.of('mutton', 1));
  tick(300);
  check('half done', be.cookingProgress[0] === 300);
  m.dowseCampfire(level, 0, 64, 4, p);
  check('put out, the mutton stays on', prop(0, 64, 4, 'lit') === false && onFire(be) === 'mutton - - -');
  tick(100);
  check('and cools two ticks a tick', be.cookingProgress[0] === 100, `${be.cookingProgress[0]}`);
  tick(100);
  check('down to nothing, no further', be.cookingProgress[0] === 0 && onFire(be) === 'mutton - - -');
  m.lightCampfire(level, 0, 64, 4);
  tick(599);
  check('lit again it starts over from where it had got to', itemsAround(0, 4, 'cooked_mutton').length === 0);
  tick(1);
  check('and is done 600 ticks on', itemsAround(0, 4, 'cooked_mutton').length === 1);
  const cold = campfire(3, 4, 'campfire', false);
  check('food goes on a campfire that\'s out', click(3, 4, m.ItemStack.of('cod', 1)) === 'success' && onFire(cold) === 'cod - - -');
  tick(700);
  check('but doesn\'t cook there', onFire(cold) === 'cod - - -' && cold.cookingProgress[0] === 0 && itemsAround(3, 4, 'cooked_cod').length === 0);
}

// --- creative
{
  p.setGameMode('creative');
  const be = campfire(-3, -3);
  const held = m.ItemStack.of('rabbit', 2);
  check('in creative, nothing is used up', click(-3, -3, held) === 'success' && held.count === 2 && onFire(be) === 'rabbit - - -');
  p.setGameMode('survival');
}

// --- saved and loaded, broken
{
  const be = campfire(0, -4, 'campfire', true, 'east');
  click(0, -4, m.ItemStack.of('chicken', 1));
  click(0, -4, m.ItemStack.of('potato', 1));
  tick(250);
  const d = be.save();
  const back = new m.CampfireBlockEntity(0, 64, -4);
  back.load(JSON.parse(JSON.stringify(d)));
  check('saved: what\'s on it, how far it\'s got and how long it takes', onFire(back) === 'chicken potato - -' && back.cookingProgress.join() === '250,250,0,0' && back.cookingTime.join() === '600,600,0,0', JSON.stringify(d.data));
  check('an empty one saves no cooking', campfire(3, -4).save().data === undefined);
  check('a guest is sent what\'s on the fire', m.visibleBlockEntity(be).items.length === 2);

  // smoke off the food: facing east, the first place lies over the fire's south-west corner, the second the north-west
  parts = [];
  tick(200);
  const wisps = parts.filter((q) => q.k === 'smoke' && Math.abs(q.x - 0.5) < 0.5 && Math.abs(q.z + 3.5) < 0.5);
  const at = (x, z) => wisps.filter((q) => Math.abs(q.x - x) < 1e-9 && Math.abs(q.z - z) < 1e-9 && Math.abs(q.y - 64.5) < 1e-9).length;
  check('wisps of smoke rise off the food, four at a time', wisps.length > 20 && wisps.length % 4 === 0 && wisps.every((q) => q.dx === 0 && q.dy === 5e-4 && q.dz === 0), `${wisps.length}`);
  check('over their own corners (facing east: the south-west, then the north-west)', at(0.1875, -3.1875) > 0 && at(0.1875, -3.8125) > 0 && at(0.8125, -3.1875) === 0 && at(0.8125, -3.8125) === 0,
    `${at(0.1875, -3.1875)} ${at(0.1875, -3.8125)} ${at(0.8125, -3.1875)} ${at(0.8125, -3.8125)}`);

  level.destroyBlock(0, 64, -4, true);
  check('broken, it drops what was on it', itemsAround(0, -4, 'chicken').length === 1 && itemsAround(0, -4, 'potato').length === 1 && itemsAround(0, -4, 'charcoal').length === 1);
}

// --- dried kelp
{
  const food = m.ITEMS.get('dried_kelp')?.food;
  check('dried kelp: a quick bite (1 hunger, saturation 0.3, eaten fast)', food?.nutrition === 1 && food.saturation === 0.3 && food.fast === true);
  const kelp = m.ItemStack.of('kelp');
  check('kelp dries in a furnace and a smoker too', m.cookingResult('furnace', kelp)?.result === 'dried_kelp' && m.cookingResult('smoker', kelp)?.result === 'dried_kelp' && m.cookingResult('blast_furnace', kelp) === null);
  check('nine to a dried kelp block, and back', m.RECIPES.some((r) => r.kind === 'shaped' && r.result === 'dried_kelp_block' && r.pattern.join('') === '#########' && r.key['#'] === 'dried_kelp')
    && m.RECIPES.some((r) => r.kind === 'shapeless' && r.result === 'dried_kelp' && r.count === 9 && r.ingredients.length === 1 && r.ingredients[0] === 'dried_kelp_block'));
  const b = m.getBlock('dried_kelp_block');
  check('the block: strength 0.5, 2.5 against blasts, a hoe\'s, with its item', b.hardness === 0.5 && b.resistance === 2.5 && b.tool === 'hoe' && !!m.ITEMS.get('dried_kelp_block'));
  check('fuel for 4000 ticks', m.fuelTime(m.ItemStack.of('dried_kelp_block')) === 4000);
  check('its sides, top and bottom drawn', ['dried_kelp_side', 'dried_kelp_top', 'dried_kelp_bottom'].every((t) => { const f = m.BLOCK_TEXTURES[t]; if (!f) return false; const img = f(); return img.data.length === 16 * 16 * 4; }));
}

await exitWithStatus(close);
