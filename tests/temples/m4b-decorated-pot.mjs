// M4b: decorated pots — the recipes (four bricks, or sherds in the diamond), the pot's item and its sides, placing
// it, putting items in and knocking on it (the wobbles, the sounds, the dust), breaking it by hand, with a tool and
// with silk touch, shattering it with a projectile, what it spills, the tooltip, pick-block and saving.

import { load, check, flatLevel, place, prop, ticks, blockName, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/archaeology.ts', '/src/game/decoratedPot.ts', '/src/game/interaction.ts', '/src/entity/player.ts', '/src/inventory/recipes.ts',
  '/src/inventory/customRecipes.ts', '/src/item/hoverText.ts', '/src/entity/arrow.ts', '/src/entity/throwable.ts', '/src/item/enchantHelper.ts',
  '/src/game/redstone/piston.ts',
]);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const live = (level, cls) => level.entities.filter((e) => !e.removed && (!cls || e instanceof cls));
const count = (sounds, name) => sounds.filter((s) => s.name === name).length;
const SHERDS = ['archer_pottery_sherd', 'miner_pottery_sherd', 'prize_pottery_sherd', 'skull_pottery_sherd'];

/** a crafting table's grid with these in slots 0-8 */
const grid = (slots) => Array.from({ length: 9 }, (_, i) => (slots[i] ? stack(slots[i]) : null));
const craft = (g, w = 3) => {
  const plain = m.findRecipe(g, w, g.length / w);
  if (plain) return m.ItemStack.of(plain.result, plain.count);
  return m.customRecipeFor(g, w)?.result ?? null;
};

// ---------------------------------------------------------------------------------------------------------------
// Crafting and the item

{
  const plain = craft(grid({ 1: 'brick', 3: 'brick', 5: 'brick', 7: 'brick' }));
  check('recipe: four bricks in a diamond make a plain decorated pot', plain?.item.id === 'decorated_pot' && plain.count === 1 && !plain.tag);
  const pot = craft(grid({ 1: 'archer_pottery_sherd', 3: 'miner_pottery_sherd', 5: 'prize_pottery_sherd', 7: 'skull_pottery_sherd' }));
  check('recipe: sherds in the diamond: top the back, left the left, right the right, bottom the front', pot?.item.id === 'decorated_pot' && pot.tag?.potDecorations?.join() === 'archer_pottery_sherd,miner_pottery_sherd,prize_pottery_sherd,skull_pottery_sherd');
  const mixed = craft(grid({ 1: 'brick', 3: 'brick', 5: 'skull_pottery_sherd', 7: 'brick' }));
  check('recipe: sherds and bricks together', mixed?.tag?.potDecorations?.join() === 'brick,brick,skull_pottery_sherd,brick');
  const allBricks = m.customRecipeFor(grid({ 1: 'brick', 3: 'brick', 5: 'brick', 7: 'brick' }), 3)?.result;
  check('recipe: the special recipe with four bricks gives the plain pot too (no decorations)', allBricks?.item.id === 'decorated_pot' && !allBricks.tag && allBricks.sameItem(plain));
  check('recipe: not with a fifth item', craft(grid({ 1: 'brick', 3: 'brick', 5: 'brick', 7: 'brick', 4: 'brick' }))?.item.id !== 'decorated_pot');
  check('recipe: not with something else in the diamond', craft(grid({ 1: 'brick', 3: 'brick', 5: 'stone', 7: 'archer_pottery_sherd' })) === null);
  check('recipe: not off the diamond', craft(grid({ 0: 'archer_pottery_sherd', 3: 'brick', 5: 'brick', 7: 'brick' })) === null);
  check('recipe: not in the 2x2 grid', craft([stack('archer_pottery_sherd'), stack('brick'), stack('brick'), stack('brick')], 2) === null);
  check('item: 64 to a stack, in the functional blocks tab', m.ITEMS.get('decorated_pot').maxStack === 64 && m.ITEMS.get('decorated_pot').creativeTab === 'functional');
  const lines = m.hoverText(pot);
  check('tooltip: a blank line, then the front, left, right and back, grey', lines.join('|') === '|§7Skull Pottery Sherd|§7Miner Pottery Sherd|§7Prize Pottery Sherd|§7Archer Pottery Sherd', lines.join('|'));
  check('tooltip: bricks named for the plain sides', m.hoverText(mixed).join('|') === '|§7Brick|§7Brick|§7Skull Pottery Sherd|§7Brick');
  check('tooltip: nothing for a plain pot', m.hoverText(plain).length === 0);
  check('item: two pots with different sides don\'t stack', !pot.sameItem(mixed) && !pot.sameItem(plain) && pot.sameItem(pot.copy()));
}

// ---------------------------------------------------------------------------------------------------------------
// Placing it, putting things in

/** a flat world with a player standing south of (0, G, 0) looking at it */
function scene() {
  const { level, world, sounds, particles } = flatLevel(m, -1, -1, 1, 1);
  const p = new m.Player(level);
  p.moveTo(0.5, G, 2.5, 180, 30);
  level.addEntity(p);
  level.player = p;
  const inter = new m.Interaction(level, p);
  return { level, world, sounds, particles, p, inter };
}

/** right-click the pot at (0, G, 0) with `s` in the main hand */
function useOn(sc, s) {
  const { p, inter } = sc;
  p.inventory.main[0] = s;
  p.inventory.selected = 0;
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.rightClickDelay = 0;
  inter.use(true, true);
}

{
  const sc = scene();
  const { level, world, sounds, particles, p, inter } = sc;
  // placed by the item, looking north: facing north (its front toward the player)
  const pot = m.decoratedPotItem(['archer_pottery_sherd', 'brick', 'brick', 'skull_pottery_sherd']);
  place(m, level, 'decorated_pot', 0, G, 0, { yaw: 180 });
  world.getBlockEntity(0, G, 0).applyComponents(pot);
  check('place: facing the way the player looks', prop(m, level, 0, G, 0, 'facing') === 'north' && prop(m, level, 0, G, 0, 'cracked') === false);
  const be = world.getBlockEntity(0, G, 0);
  check('place: its block entity takes the item\'s sides', be instanceof m.DecoratedPotBlockEntity && be.decorations.join() === 'archer_pottery_sherd,brick,brick,skull_pottery_sherd');
  place(m, level, 'water', 3, G, 0);
  place(m, level, 'decorated_pot', 3, G, 0, { yaw: 90 });
  check('place: in water it\'s waterlogged; looking west it faces west', prop(m, level, 3, G, 0, 'waterlogged') === true && prop(m, level, 3, G, 0, 'facing') === 'west');
  // an empty hand knocks
  useOn(sc, null);
  check('knock: an empty hand knocks, with the fail sound', count(sounds, 'block.decorated_pot.insert_fail') === 1 && !p.swinging);
  ticks(level, 1);
  check('knock: the other wobble (10 ticks) starts', be.lastWobbleStyle === m.WOBBLE_NEGATIVE && be.wobbleStartedAtTick === level.gameTime);
  // an item goes in
  const dirt = stack('dirt', 5);
  useOn(sc, dirt);
  check('insert: one goes in', be.theItem?.item.id === 'dirt' && be.theItem.count === 1 && dirt.count === 4);
  const ins = sounds.filter((s) => s.name === 'block.decorated_pot.insert');
  check('insert: the insert sound, pitched 0.7 + 0.5 x fullness', ins.length === 1 && Math.abs(ins[0].pitch - (0.7 + 0.5 / 64)) < 1e-9, ins[0] && `${ins[0].pitch}`);
  check('insert: seven puffs of dust above it', particles.filter((q) => q.kind === 'dust_plume').length === 7 && particles.filter((q) => q.kind === 'dust_plume').every((q) => q.y === G + 1.2 && q.x === 0.5 && q.z === 0.5));
  check('insert: no swing', !p.swinging);
  ticks(level, 1);
  check('insert: its wobble (7 ticks)', be.lastWobbleStyle === m.WOBBLE_POSITIVE);
  useOn(sc, dirt);
  useOn(sc, dirt);
  check('insert: more of the same stacks up', be.theItem.count === 3 && dirt.count === 2);
  const fails = count(sounds, 'block.decorated_pot.insert_fail');
  const stone = stack('stone', 3);
  useOn(sc, stone);
  check('insert: something else won\'t go in: a knock instead', be.theItem.item.id === 'dirt' && stone.count === 3 && count(sounds, 'block.decorated_pot.insert_fail') === fails + 1);
  be.theItem.count = 64;
  const d2 = stack('dirt', 3);
  useOn(sc, d2);
  check('insert: a full stack takes no more', be.theItem.count === 64 && d2.count === 3);
  // creative puts one in without using it up
  be.container.items[0] = null;
  p.gameMode = 'creative';
  const d3 = stack('dirt', 2);
  useOn(sc, d3);
  check('insert: in creative the stack isn\'t used up', be.theItem?.count === 1 && d3.count === 2);
  p.gameMode = 'survival';
  // sneaking with an item: no insert, the item's own use (placing the block against it)
  p.crouching = true;
  const before = be.theItem.count;
  useOn(sc, stack('stone', 1));
  p.crouching = false;
  check('sneaking: nothing goes in (the stone is placed against it instead)', be.theItem.count === before && blockName(m, level.getState(0, G, 1)) === 'stone');
  level.setBlock(0, G, 1, 0);
  // pick block
  p.gameMode = 'creative';
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  p.inventory.main.fill(null);
  inter.pickBlock();
  const picked = p.inventory.main[p.inventory.selected];
  check('pick block: the pot with its sides', picked?.item.id === 'decorated_pot' && picked.tag?.potDecorations?.join() === 'archer_pottery_sherd,brick,brick,skull_pottery_sherd');
  // saving
  const saved = m.loadBlockEntity(JSON.parse(JSON.stringify(be.save())));
  check('save: the sides and what\'s in it come back', saved.decorations.join() === be.decorations.join() && saved.theItem?.item.id === 'dirt');
  const plainSaved = JSON.parse(JSON.stringify(world.getBlockEntity(3, G, 0).save()));
  check('save: a plain pot keeps no sides', !plainSaved.data);
}

// ---------------------------------------------------------------------------------------------------------------
// Breaking it

/** a pot at (x, G, 0) with sides `d` and `inside`, broken by a survival player holding `held` */
function breakPot(sc, x, d, inside, held) {
  const { level, world, p, inter } = sc;
  place(m, level, 'decorated_pot', x, G, 0, { yaw: 180 });
  const be = world.getBlockEntity(x, G, 0);
  be.decorations = d;
  if (inside) be.container.items[0] = inside;
  p.moveTo(x + 0.5, G, 2.5, 180, 30);
  p.inventory.main[0] = held;
  p.inventory.selected = 0;
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  const before = new Set(live(level, m.ItemEntity));
  inter.destroyBlock(x, G, 0);
  return live(level, m.ItemEntity).filter((e) => !before.has(e)).map((e) => e.stack);
}

{
  const sc = scene();
  const { level, sounds } = sc;
  const D = ['archer_pottery_sherd', 'brick', 'prize_pottery_sherd', 'brick'];
  const byHand = breakPot(sc, 0, D, stack('diamond', 3), null);
  const potOut = byHand.find((s) => s.item.id === 'decorated_pot');
  check('by hand: the pot drops whole, with its sides', potOut && potOut.tag?.potDecorations?.join() === D.join());
  check('by hand: what was in it spills out', byHand.some((s) => s.item.id === 'diamond' && s.count === 3));
  check('by hand: the pot\'s break sound', count(sounds, 'block.decorated_pot.break') === 1 && count(sounds, 'block.decorated_pot.shatter') === 0);
  const withPick = breakPot(sc, 2, D, null, stack('iron_pickaxe'));
  check('with a pickaxe: it shatters into its four sides\' items', withPick.map((s) => s.item.id).sort().join() === [...D].sort().join() && withPick.every((s) => s.count === 1), withPick.map((s) => s.item.id).join());
  check('with a pickaxe: the shatter sound', count(sounds, 'block.decorated_pot.shatter') === 1);
  const sword = breakPot(sc, 4, m.NO_DECORATIONS, null, stack('stone_sword'));
  check('with a sword: four bricks', sword.length === 4 && sword.every((s) => s.item.id === 'brick'));
  const silky = stack('diamond_pickaxe');
  silky.tag = { enchantments: { silk_touch: 1 } };
  const silk = breakPot(sc, 6, D, null, silky);
  check('with silk touch: whole', silk.length === 1 && silk[0].item.id === 'decorated_pot' && silk[0].tag?.potDecorations?.join() === D.join());
  const shears = breakPot(sc, 8, D, null, stack('shears'));
  check('with shears (not a #breaks_decorated_pots tool): whole', shears.length === 1 && shears[0].item.id === 'decorated_pot');
  const shovel = breakPot(sc, 10, m.NO_DECORATIONS, null, stack('wooden_shovel'));
  check('with a shovel: four bricks', shovel.length === 4);
  check('hardness 0: breaks at once, no tool needed', m.getBlock('decorated_pot').s.hardness === 0);
  // an arrow shatters it
  place(m, level, 'decorated_pot', 12, G, 0);
  sc.world.getBlockEntity(12, G, 0).decorations = ['skull_pottery_sherd', 'brick', 'brick', 'brick'];
  const arrow = new m.Arrow(level, sc.p);
  arrow.moveTo(12.5, G + 0.5, 3.5, 180, 0);
  arrow.dx = 0; arrow.dy = 0; arrow.dz = -1.5;
  level.addEntity(arrow);
  const before = new Set(live(level, m.ItemEntity));
  ticks(level, 6);
  const shot = live(level, m.ItemEntity).filter((e) => !before.has(e)).map((e) => e.stack.item.id);
  check('arrow: a player\'s arrow shatters it', blockName(m, level.getState(12, G, 0)) === 'air' && shot.sort().join() === 'brick,brick,brick,skull_pottery_sherd', `${blockName(m, level.getState(12, G, 0))} ${shot.join()}`);
  level.gameRules.projectilesCanBreakBlocks = false;
  place(m, level, 'decorated_pot', 14, G, 0);
  const a2 = new m.Arrow(level, sc.p);
  a2.moveTo(14.5, G + 0.5, 3.5, 180, 0);
  a2.dx = 0; a2.dy = 0; a2.dz = -1.5;
  level.addEntity(a2);
  ticks(level, 6);
  check('arrow: not with projectilesCanBreakBlocks off', blockName(m, level.getState(14, G, 0)) === 'decorated_pot');
  // pushed by a piston it's destroyed (vanilla PushReaction.DESTROY), as suspicious blocks are
  check('pistons: pots and suspicious blocks are destroyed when pushed', ['decorated_pot', 'suspicious_sand', 'suspicious_gravel'].every((n) => m.pushReaction(m.getBlock(n).defaultState) === 'destroy'));
}

await exitWithStatus(close);
