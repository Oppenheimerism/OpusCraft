// Headless checks for the minecarts and rails (node tests/survival-blocks/minecarts.mjs): the powered, detector and
// activator rails (their items, recipes, recipe book, creative order and textures; placing them straight only, joined
// up, sloping, waterlogged, popping off with nothing under them); a powered rail's power carried along eight rails of
// its kind (a slope too, not across, not through another kind), from a redstone block or a lever; carts sped up,
// started off a block and braked by powered rails, and held to 8 m/s; the detector rail (powered while a cart is on
// it, strongly into the block under it, a second after it's gone; powering the rails it leads to; a comparator
// reading a container cart on it; put right by a random tick when its check a second on was lost, as it is when the
// world is saved and loaded); the activator rail (a rider thrown out with a shake, a TNT cart lit, a hopper cart
// switched off and on again); a plain rail's junction flipped by a lever; the hopper minecart (items over it, beside
// it, out of a chest over it, a hopper under it emptying it, a hopper filling it, its menu, spilling, saving); the TNT
// minecart (dropped at rest, lit with a short fuse when broken moving or by fire or lava, set off by a burning arrow,
// a fall, a crash; its fuse, smoke and hiss; its blast sparing the rails and lighting other TNT carts; saving); the
// furnace minecart (coal and charcoal, three minutes a lump up to 32000, none used in creative, pushing away from the
// player at up to 4 m/s round a bend, running out, lit, saving); every cart set on a rail by its item or a dispenser
// (and a name kept, through a save too); /summon's entity data for each kind; and drawing a lit TNT cart (the flash
// and the swell).
import { load, check, exitWithStatus, flatLevel, place, prop, use } from '../redstone2/lib.mjs';
import { readFileSync } from 'node:fs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/entity/player.ts', '/src/game/interaction.ts', '/src/entity/minecart.ts', '/src/entity/minecartVariants.ts', '/src/game/poweredRails.ts',
  '/src/game/rails.ts', '/src/world/blocksRails.ts', '/src/item/itemsMinecarts.ts', '/src/game/redstone/comparator.ts', '/src/game/redstone/dispenseItems.ts',
  '/src/game/spawner.ts', '/src/inventory/recipeBook.ts', '/src/textures/items.ts', '/src/textures/blocks.ts', '/src/entity/arrow.ts', '/src/game/explosion.ts',
  '/src/render/minecartContents.ts', '/src/game/openMenu.ts', '/src/inventory/hopperMenu.ts', '/src/game/redstone/components.ts',
  '/src/game/commands.ts',
]);
const { ItemStack } = m;
const G = 64;
const [DOWN, UP, NORTH, SOUTH, WEST, EAST] = [0, 1, 2, 3, 4, 5];
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const tick = (level, n = 1) => {
  for (let i = 0; i < n; i++) level.tick();
};
const live = (level, cls) => level.entities.filter((e) => !e.removed && (!cls || e instanceof cls));
const items = (level, id) => live(level, m.ItemEntity).filter((e) => !id || e.stack.item.id === id);
const shape = (level, x, y, z) => prop(m, level, x, y, z, 'shape');
const powered = (level, x, y, z) => prop(m, level, x, y, z, 'powered');
const heard = (sounds, n) => sounds.filter((s) => s.name === n).length;
/** a rail of `name` at (x, y, z), laid by a player looking along `axis` ('z': north-south, 'x': east-west) */
const rail = (level, name, x, y, z, axis = 'z') => place(m, level, name, x, y, z, { yaw: axis === 'z' ? 0 : 90 });
/** a line of `name` rails from (x0, z0) to (x1, z1) along one axis, at height y */
function line(level, name, x0, z0, x1, z1, y = G) {
  const axis = x0 === x1 ? 'z' : 'x';
  const [a, b] = axis === 'z' ? [z0, z1] : [x0, x1];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) axis === 'z' ? rail(level, name, x0, y, i, 'z') : rail(level, name, i, y, z0, 'x');
}
/** a cart of `type` on the rail at (x, y, z), as its item sets one (half a block up on a slope) */
function cart(level, type, x, y, z, f) {
  const c = m.createMinecart(type, level);
  const st = level.getState(x, y, z);
  c.moveTo(x + 0.5, y + 0.0625 + (m.isRail(st) && m.isAscending(m.railShape(st)) ? 0.5 : 0), z + 0.5, 0, 0);
  f?.(c);
  level.addEntity(c);
  return c;
}
/** a player of the level, at (x, y, z) */
function player(level, x, y, z, mode = 'survival') {
  const p = new m.Player(level);
  p.setGameMode(mode);
  p.moveTo(x, y, z, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const hold = (p, s) => {
  p.inventory.main[0] = s;
  p.inventory.selected = 0;
  p.inventory.offhand = null;
};
/** fill a container with `n` of `id`, 64 to a slot */
function fill(c, n, id = 'stone') {
  for (let i = 0; i < c.size; i++) c.set(i, null);
  for (let i = 0; n > 0; i++) {
    c.set(i, ItemStack.of(id, Math.min(64, n)));
    n -= 64;
  }
}
const countIn = (c, id = null) => c.items.reduce((n, s) => n + (s && (!id || s.item.id === id) ? s.count : 0), 0);
/** a comparator at (x, y, z) reading the block the `facing` way of it */
const comparatorAt = (level, x, y, z, facing) => place(m, level, 'comparator', x, y, z, { props: { facing, mode: 'compare', powered: false } }) && m.behaviorOf(level.getState(x, y, z)).setPlacedBy(level, x, y, z, level.getState(x, y, z), { gameMode: 'survival' });
/** what the comparator at (x, y, z) gives out of its front */
const out = (level, x, y, z) => {
  const st = level.getState(x, y, z);
  return m.getSignal(level.world, x, y, z, ['down', 'up', 'north', 'south', 'west', 'east'].indexOf(m.blockOf(st).get(st, 'facing')));
};
/** a level of our own, with its game events heard */
function world(cx0 = -1, cz0 = -1, cx1 = 1, cz1 = 1) {
  const w = flatLevel(m, cx0, cz0, cx1, cz1);
  w.events = [];
  const ge = w.level.gameEvent.bind(w.level);
  w.level.gameEvent = (e, x, y, z, ctx) => {
    w.events.push({ e, x, y, z, entity: ctx?.entity });
    ge(e, x, y, z, ctx);
  };
  return w;
}
const save = (e) => m.saveEntity(e);
const reload = (e, level) => m.loadEntity(JSON.parse(JSON.stringify(save(e))), level);

// ---------------------------------------------------------------------------
// the items, recipes, recipe book, creative order, names and textures
{
  for (const [id, name] of [['hopper_minecart', 'Minecart with Hopper'], ['tnt_minecart', 'Minecart with TNT'], ['furnace_minecart', 'Minecart with Furnace']]) {
    const it = m.ITEMS.get(id);
    check(`item: ${name}, one to a stack, its sprite, the tools tab`, it?.name === name && it.maxStack === 1 && it.texture === id && it.creativeTab === 'tools' && m.ITEM_TEXTURES[id]?.().w === 16, it && `${it.name} ${it.maxStack} ${it.texture} ${it.creativeTab}`);
    check(`entity: ${name}, by that name, summonable, one of the minecarts`, m.entityDisplayName(id) === name && m.summonableTypes().includes(id) && m.MINECART_TYPES.includes(id));
  }
  for (const id of ['powered_rail', 'detector_rail', 'activator_rail']) {
    const it = m.ITEMS.get(id);
    check(`item: the ${id.replace('_', ' ')} drawn flat in its block's texture, 64 to a stack, the tools tab`, it?.texture === `block:${id}` && it.maxStack === 64 && it.creativeTab === 'tools', it && `${it.texture} ${it.maxStack} ${it.creativeTab}`);
  }
  const ids = m.ITEM_LIST.map((i) => i.id);
  const at = ids.indexOf('rail');
  check('creative: the rails then the minecarts, after the boats, in vanilla\'s order', m.RAIL_AND_MINECART_ORDER.join() === 'rail,powered_rail,detector_rail,activator_rail,minecart,hopper_minecart,chest_minecart,furnace_minecart,tnt_minecart' && m.RAIL_AND_MINECART_ORDER.every((id, i) => ids[at + i] === id) && /_(boat|raft)$/.test(ids[at - 1]), ids.slice(at - 1, at + 10).join());
  const src = readFileSync(new URL('../../src/gui/screens/creative.ts', import.meta.url), 'utf8');
  check('creative: listed with the redstone blocks as well, after the observer', /REDSTONE_ORDER\.splice\(REDSTONE_ORDER\.indexOf\('observer'\) \+ 1, 0, \.\.\.RAIL_AND_MINECART_ORDER\)/.test(src) && /for \(const id of RAIL_AND_MINECART_ORDER\) REDSTONE_ALSO\.add\(id\)/.test(src));
  const R = (id) => m.RECIPES.filter((r) => r.result === id);
  const [pr] = R('powered_rail'), [dr] = R('detector_rail'), [ar] = R('activator_rail');
  check('recipe: six powered rails from six gold ingots, a stick and a redstone', R('powered_rail').length === 1 && pr.count === 6 && pr.pattern.join('|') === 'X X|X#X|XRX' && pr.key.X === 'gold_ingot' && pr.key['#'] === 'stick' && pr.key.R === 'redstone');
  check('recipe: six detector rails from six iron ingots, a stone pressure plate and a redstone', R('detector_rail').length === 1 && dr.count === 6 && dr.pattern.join('|') === 'X X|X#X|XRX' && dr.key.X === 'iron_ingot' && dr.key['#'] === 'stone_pressure_plate' && dr.key.R === 'redstone');
  check('recipe: six activator rails from six iron ingots, two sticks and a redstone torch', R('activator_rail').length === 1 && ar.count === 6 && ar.pattern.join('|') === 'XSX|X#X|XSX' && ar.key.X === 'iron_ingot' && ar.key['#'] === 'redstone_torch' && ar.key.S === 'stick');
  const grid = (cells) => cells.map((id) => (id ? ItemStack.of(id) : null));
  check('crafting: each rail made on a table', m.findRecipe(grid(['gold_ingot', null, 'gold_ingot', 'gold_ingot', 'stick', 'gold_ingot', 'gold_ingot', 'redstone', 'gold_ingot']), 3, 3)?.result === 'powered_rail'
    && m.findRecipe(grid(['iron_ingot', null, 'iron_ingot', 'iron_ingot', 'stone_pressure_plate', 'iron_ingot', 'iron_ingot', 'redstone', 'iron_ingot']), 3, 3)?.result === 'detector_rail'
    && m.findRecipe(grid(['iron_ingot', 'stick', 'iron_ingot', 'iron_ingot', 'redstone_torch', 'iron_ingot', 'iron_ingot', 'stick', 'iron_ingot']), 3, 3)?.result === 'activator_rail');
  check('crafting: not a powered rail with an oak pressure plate for the stick, nor a detector rail with a wooden plate', m.findRecipe(grid(['gold_ingot', null, 'gold_ingot', 'gold_ingot', 'oak_pressure_plate', 'gold_ingot', 'gold_ingot', 'redstone', 'gold_ingot']), 3, 3)?.result !== 'powered_rail'
    && m.findRecipe(grid(['iron_ingot', null, 'iron_ingot', 'iron_ingot', 'oak_pressure_plate', 'iron_ingot', 'iron_ingot', 'redstone', 'iron_ingot']), 3, 3)?.result !== 'detector_rail');
  for (const [id, block] of [['hopper_minecart', 'hopper'], ['tnt_minecart', 'tnt'], ['furnace_minecart', 'furnace']]) {
    const r = R(id);
    check(`recipe: a ${id.replace('_', ' ')} from a ${block} and a minecart, anywhere in the grid (and in the inventory's)`, r.length === 1 && r[0].kind === 'shapeless' && r[0].count === 1 && [...r[0].ingredients].sort().join() === [block, 'minecart'].sort().join()
      && m.findRecipe(grid([null, null, null, null, 'minecart', null, null, null, block]), 3, 3)?.result === id && m.findRecipe(grid([block, null, null, 'minecart']), 2, 2)?.result === id);
  }
  for (const [id, by] of [['powered_rail', 'rail'], ['detector_rail', 'rail'], ['activator_rail', 'rail'], ['hopper_minecart', 'minecart'], ['tnt_minecart', 'minecart'], ['furnace_minecart', 'minecart']]) {
    const b = m.BOOK_BY_ID.get(id);
    check(`recipe book: the ${id.replace('_', ' ')} found by holding a ${by}, with the misc`, !!b && [...b.unlockBy].join() === by && b.category === 'crafting_misc', b && `${[...b.unlockBy]} ${b.category}`);
  }
  const names = ['powered_rail', 'detector_rail', 'activator_rail'];
  const tex = names.flatMap((n) => [m.BLOCK_TEXTURES[n]?.(), m.BLOCK_TEXTURES[`${n}_on`]?.()]);
  check('textures: each rail unpowered and powered, 16 by 16, see-through between the sleepers', tex.every((t) => t?.w === 16 && t.h === 16 && [...t.data].some((v, i) => i % 4 === 3 && v === 0) && [...t.data].some((v, i) => i % 4 === 3 && v === 255)));
  const red = (t) => {
    let n = 0;
    for (let i = 0; i < t.data.length; i += 4) if (t.data[i + 3] && t.data[i] > 150 && t.data[i] > t.data[i + 1] * 2) n++;
    return n;
  };
  check('textures: the redstone glows bright red when powered', [0, 2, 4].every((i) => red(tex[i + 1]) > red(tex[i]) + 4), [0, 2, 4].map((i) => `${red(tex[i])}/${red(tex[i + 1])}`).join());
  check('textures: the powered rail on gold, the others on iron', (() => {
    const px = (t, x, y) => t.data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 3);
    const [r, g, b] = px(tex[0], 3, 0), [r2, g2, b2] = px(tex[2], 3, 0);
    return r > b + 60 && g > b + 30 && Math.abs(r2 - b2) < 20 && Math.abs(g2 - b2) < 20;
  })());
  for (const n of names) {
    const b = m.getBlock(n);
    const st = b.state({ shape: 'ascending_west', powered: true, waterlogged: true });
    const drops = m.blockDrops(b.defaultState, null, new m.Rand(1)).map((s) => `${s.item.id}x${s.count}`).join();
    check(`block: the ${n.replace('_', ' ')}: its shape (straight only), powered, waterlogged; 0.7 to break, walked through, drops itself`, b.get(st, 'shape') === 'ascending_west' && b.get(st, 'powered') === true && b.get(st, 'waterlogged') === true
      && b.get(b.defaultState, 'shape') === 'north_south' && b.get(b.defaultState, 'powered') === false && b.hardness === 0.7 && !m.COLLISION[b.defaultState]?.length && drops === `${n}x1` && m.isRail(b.defaultState), drops);
  }
}

// ---------------------------------------------------------------------------
// laying them
{
  const { level } = world();
  rail(level, 'powered_rail', 0, G, 0, 'z');
  rail(level, 'detector_rail', 2, G, 0, 'x');
  check('placed: north-south looking along it, east-west across', shape(level, 0, G, 0) === 'north_south' && shape(level, 2, G, 0) === 'east_west' && powered(level, 0, G, 0) === false);
  line(level, 'powered_rail', 0, 4, 2, 4);
  // (laid looking south, each turns to join the one before)
  for (let x = 4; x <= 6; x++) rail(level, 'activator_rail', x, G, 4, 'z');
  check('joined: a row laid across its own way joins up east-west', [0, 1, 2].every((x) => shape(level, x, G, 4) === 'east_west') && [4, 5, 6].every((x) => shape(level, x, G, 4) === 'east_west'), [0, 1, 2, 4, 5, 6].map((x) => shape(level, x, G, 4)).join());
  // a slope: up onto a rail on a block to the east
  level.setBlock(4, G, 8, m.S('stone'));
  rail(level, 'powered_rail', 4, G + 1, 8, 'z');
  rail(level, 'powered_rail', 3, G, 8, 'x');
  check('sloped: up onto a rail a block higher (ascending east), the rail up there joined east-west', shape(level, 3, G, 8) === 'ascending_east' && shape(level, 4, G + 1, 8) === 'east_west', `${shape(level, 3, G, 8)} ${shape(level, 4, G + 1, 8)}`);
  // no curves: at a corner it stays as laid
  rail(level, 'rail', 0, G, 12, 'x');
  rail(level, 'rail', 1, G, 13, 'z');
  rail(level, 'powered_rail', 1, G, 12, 'z');
  rail(level, 'rail', 4, G, 12, 'x');
  rail(level, 'rail', 5, G, 13, 'z');
  rail(level, 'detector_rail', 5, G, 12, 'x');
  check('no curves: at a corner a powered or detector rail stays straight, as it was laid', shape(level, 1, G, 12) === 'north_south' && shape(level, 5, G, 12) === 'east_west', `${shape(level, 1, G, 12)} ${shape(level, 5, G, 12)}`);
  // a plain rail still curves onto one
  rail(level, 'powered_rail', 8, G, 12, 'x');
  rail(level, 'rail', 9, G, 13, 'z');
  rail(level, 'rail', 9, G, 12, 'z');
  check('curves: a plain rail curves onto a powered one', shape(level, 9, G, 12) === 'south_west' && shape(level, 8, G, 12) === 'east_west', shape(level, 9, G, 12));
  // in water: waterlogged
  level.setBlock(8, G, 0, m.S('water'));
  rail(level, 'activator_rail', 8, G, 0, 'z');
  check('placed in water: waterlogged', level.getBlockName(8, G, 0) === 'activator_rail' && prop(m, level, 8, G, 0, 'waterlogged') === true);
  // nothing under it: it pops off as an item
  level.setBlock(0, G - 1, 0, 0);
  check('support: with nothing under it, it drops as an item', level.getBlockName(0, G, 0) === 'air' && items(level, 'powered_rail').length === 1);
  // a slope loses the block under its top end
  level.setBlock(4, G, 8, 0);
  check('support: a slope with nothing under its high end drops too (and the rail up there)', level.getBlockName(3, G, 8) === 'air' && level.getBlockName(4, G + 1, 8) === 'air' && items(level, 'powered_rail').length === 3);
  level.gameRules.doTileDrops = false;
  level.setBlock(2, G - 1, 0, 0);
  check('support: doTileDrops off, it just goes', level.getBlockName(2, G, 0) === 'air' && items(level, 'detector_rail').length === 0);
}

// ---------------------------------------------------------------------------
// a powered rail's power
{
  const { level } = world();
  line(level, 'powered_rail', 0, 0, 0, 11);
  const on = () => [...Array(12).keys()].filter((z) => powered(level, 0, G, z)).join();
  check('power: none to start with', on() === '');
  level.setBlock(1, G, 0, m.S('redstone_block'));
  check('power: a redstone block beside the first powers it and the eight rails after', on() === '0,1,2,3,4,5,6,7,8', on());
  level.setBlock(1, G, 0, 0);
  check('power: gone when the redstone block goes', on() === '', on());
  level.setBlock(1, G, 11, m.S('redstone_block'));
  check('power: from the other end, back along eight', on() === '3,4,5,6,7,8,9,10,11', on());
  level.setBlock(1, G, 11, 0);
  // a lever, flipped on and off
  place(m, level, 'lever', -1, G, 0, { props: { face: 'floor', facing: 'north', powered: false } });
  use(m, level, -1, G, 0);
  const lever = on();
  use(m, level, -1, G, 0);
  check('power: a lever beside it, on then off', lever === '0,1,2,3,4,5,6,7,8' && on() === '', `${lever} / ${on()}`);
  // another kind in the line stops it
  level.setBlock(0, G, 5, 0);
  rail(level, 'activator_rail', 0, G, 5, 'z');
  level.setBlock(1, G, 0, m.S('redstone_block'));
  check('power: not carried through an activator rail in the line (a kind of its own)', on() === '0,1,2,3,4' && powered(level, 0, G, 5) === false, on());
  level.setBlock(-1, G, 5, m.S('redstone_block'));
  check('power: the activator rail powered itself, the powered rails past it still not', powered(level, 0, G, 5) === true && on() === '0,1,2,3,4,5', on());
  level.setBlock(-1, G, 5, 0);
  level.setBlock(1, G, 0, 0);
  // activator rails carry theirs just the same
  line(level, 'activator_rail', 4, 0, 4, 10);
  level.setBlock(5, G, 0, m.S('redstone_block'));
  const act = [...Array(11).keys()].filter((z) => powered(level, 4, G, z)).join();
  check('power: activator rails carry theirs along eight too', act === '0,1,2,3,4,5,6,7,8', act);
  level.setBlock(5, G, 0, 0);
  // up a slope and down again
  level.setBlock(8, G, 3, m.S('stone'));
  level.setBlock(8, G, 4, m.S('stone'));
  rail(level, 'powered_rail', 8, G + 1, 3, 'z');
  rail(level, 'powered_rail', 8, G + 1, 4, 'z');
  rail(level, 'powered_rail', 8, G, 0, 'z');
  rail(level, 'powered_rail', 8, G, 1, 'z');
  rail(level, 'powered_rail', 8, G, 2, 'z');
  const slope = () => [[G, 0], [G, 1], [G, 2], [G + 1, 3], [G + 1, 4]].map(([y, z]) => (powered(level, 8, y, z) ? 1 : 0)).join('');
  check('slope: the rail between the levels slopes up south', shape(level, 8, G, 2) === 'ascending_south', shape(level, 8, G, 2));
  level.setBlock(9, G, 0, m.S('redstone_block'));
  check('slope: power carried up it', slope() === '11111', slope());
  level.setBlock(9, G, 0, 0);
  const off = slope();
  level.setBlock(9, G + 1, 4, m.S('redstone_block'));
  check('slope: and down it (and gone again)', off === '00000' && slope() === '11111', `${off} ${slope()}`);
  level.setBlock(9, G + 1, 4, 0);
  // not across: a line running east-west at the end of a north-south one
  line(level, 'powered_rail', 11, 14, 13, 14);
  line(level, 'powered_rail', 12, 10, 12, 13);
  level.setBlock(13, G, 10, m.S('redstone_block'));
  check('across: a line running the other way at its end isn\'t powered', [10, 11, 12, 13].every((z) => powered(level, 12, G, z)) && [11, 12, 13].every((x) => !powered(level, x, G, 14) && shape(level, x, G, 14) === 'east_west'));
  level.setBlock(13, G, 10, 0);
  // what's under a powered rail hears of it (vanilla: the block below, a slope's the block above too)
  const told = [];
  const un = level.updateNeighborsAt.bind(level);
  level.updateNeighborsAt = (x, y, z, source, ...a) => {
    told.push(`${x},${y - G},${z},${m.BLOCKS[source].name}`);
    return un(x, y, z, source, ...a);
  };
  level.setBlock(1, G, 0, m.S('redstone_block'));
  const onTold = told.splice(0);
  level.setBlock(1, G, 0, 0);
  const offTold = told.splice(0);
  level.setBlock(9, G + 1, 4, m.S('redstone_block'));
  const slopeTold = told.splice(0);
  level.setBlock(9, G + 1, 4, 0);
  level.updateNeighborsAt = un;
  check('power: the blocks round the one under it are told as it turns on and off', onTold.includes('0,-1,0,powered_rail') && onTold.includes('0,-1,4,powered_rail') && offTold.includes('0,-1,4,powered_rail'), onTold.filter((s) => s.includes(',-1,')).join(' '));
  check('power: a slope tells the blocks round the one over it too', slopeTold.includes('8,1,2,powered_rail') && slopeTold.includes('8,-1,2,powered_rail'), slopeTold.join(' '));
}

// ---------------------------------------------------------------------------
// carts on powered rails
{
  const { level } = world(-1, -1, 2, 1);
  const speed = (c) => Math.hypot(c.dx, c.dz);
  // a boost: three powered rails in a plain track
  line(level, 'rail', 0, 0, 9, 0);
  line(level, 'powered_rail', 10, 0, 12, 0);
  line(level, 'rail', 13, 0, 40, 0);
  level.setBlock(10, G, 1, m.S('redstone_block'));
  const c = cart(level, 'minecart', 8, G, 0, (c) => (c.dx = 0.2));
  let v0 = 0;
  for (let t = 0; t < 40 && c.x < 13.2; t++) {
    if (c.x < 10) v0 = speed(c);
    tick(level);
  }
  check('boost: a cart comes off three powered rails a good deal faster than it went on', c.x >= 13 && speed(c) > v0 + 0.1, `${v0.toFixed(3)} → ${speed(c).toFixed(3)} at ${c.x.toFixed(2)}`);
  // started off a solid block at rest
  line(level, 'powered_rail', 20, 4, 22, 4);
  line(level, 'rail', 23, 4, 40, 4);
  level.setBlock(19, G, 4, m.S('stone'));
  level.setBlock(20, G, 5, m.S('redstone_block'));
  const r = cart(level, 'minecart', 20, G, 4);
  tick(level);
  const first = r.dx;
  tick(level, 20);
  check('start: a cart at rest on a powered rail against a block is pushed off away from it', near(first, 0.02) && r.x > 23, `${first} ${r.x}`);
  // not without the block
  line(level, 'powered_rail', 20, 8, 22, 8);
  level.setBlock(20, G, 9, m.S('redstone_block'));
  const idle = cart(level, 'minecart', 21, G, 8);
  tick(level, 10);
  check('start: with no block at either end it stays put', near(idle.x, 21.5) && idle.dx === 0);
  // braked by unpowered ones (an empty chest minecart rolls far)
  line(level, 'rail', 0, 12, 9, 12);
  line(level, 'powered_rail', 10, 12, 12, 12);
  line(level, 'rail', 13, 12, 40, 12);
  const b = cart(level, 'chest_minecart', 1, G, 12, (c) => (c.dx = 0.3));
  tick(level, 60);
  check('brake: unpowered powered rails stop a cart', b.x >= 10 && b.x < 13 && speed(b) === 0, `${b.x} ${speed(b)}`);
  line(level, 'rail', 0, 14, 40, 14);
  const free = cart(level, 'chest_minecart', 1, G, 14, (c) => (c.dx = 0.3));
  tick(level, 60);
  check('brake: the same cart on plain rails goes on past', free.x > 13, `${free.x}`);
  // 8 m/s at most
  line(level, 'powered_rail', 0, 16, 30, 16);
  for (const x of [0, 9, 18, 27]) level.setBlock(x, G, 17, m.S('redstone_block'));
  const fast = cart(level, 'minecart', 0, G, 16, (c) => (c.dx = 0.05));
  let most = 0, last = 0;
  for (let t = 0; t < 60 && fast.x < 29; t++) {
    const x0 = fast.x;
    tick(level);
    last = fast.x - x0;
    most = Math.max(most, last);
  }
  check('speed: sped up to 8 m/s (0.4 a tick) and no faster', most <= 0.4 + 1e-9 && near(last, 0.4, 1e-6), `${most} ${last}`);
}

// ---------------------------------------------------------------------------
// the detector rail
{
  const { level, events } = world();
  line(level, 'rail', 0, 0, 0, 1);
  rail(level, 'detector_rail', 0, G, 2, 'z');
  line(level, 'powered_rail', 0, 3, 0, 5);
  place(m, level, 'redstone_lamp', 1, G, 2);
  level.setBlock(1, G - 1, 1, m.S('redstone_lamp'));
  comparatorAt(level, -1, G, 2, 'east');
  const lit = (x, y, z) => prop(m, level, x, y, z, 'lit');
  check('detector: joined into the line, off, with no cart', shape(level, 0, G, 2) === 'north_south' && !powered(level, 0, G, 2) && !lit(1, G, 2));
  const c = cart(level, 'minecart', 0, G, 2);
  tick(level);
  check('detector: a cart on it powers it', powered(level, 0, G, 2) === true);
  check('detector: a lamp beside it lights', lit(1, G, 2) === true);
  check('detector: the block under it is strongly powered (a lamp by that lights)', m.hasNeighborSignal(level.world, 1, G - 1, 2) && !m.hasNeighborSignal(level.world, -2, G, 2));
  place(m, level, 'stone', 0, G, 7);
  check('detector: the powered rails it leads to are powered, and carry it along', [3, 4, 5].every((z) => powered(level, 0, G, z)));
  check('detector: a comparator reading a cart with no container gets nothing', (tick(level, 4), out(level, -1, G, 2) === 0));
  c.remove();
  tick(level, 10);
  const still = powered(level, 0, G, 2);
  tick(level, 12);
  check('detector: still on half a second after the cart\'s gone, off within a second', still === true && powered(level, 0, G, 2) === false && ![3, 4, 5].some((z) => powered(level, 0, G, z)));
  tick(level, 5);
  check('detector: the lamp goes out', lit(1, G, 2) === false);
  // a container cart read by the comparator
  const ch = cart(level, 'chest_minecart', 0, G, 2, (c) => fill(c.container, 27 * 64));
  tick(level, 4);
  const full = out(level, -1, G, 2);
  ch.container.set(0, null);
  fill(ch.container, 1);
  tick(level, 22);
  const one = out(level, -1, G, 2);
  ch.remove();
  tick(level, 25);
  check('comparator: a full chest minecart on it reads 15, one item 1, none once it\'s gone', full === 15 && one === 1 && out(level, -1, G, 2) === 0, `${full} ${one} ${out(level, -1, G, 2)}`);
  const hc = cart(level, 'hopper_minecart', 0, G, 2, (c) => fill(c.container, 3 * 64));
  // (a hopper minecart picks up items: keep the ground clear)
  tick(level, 4);
  check('comparator: a hopper minecart three slots full of five reads 9', out(level, -1, G, 2) === 9, `${out(level, -1, G, 2)}`);
  hc.remove();
  tick(level, 25);
  // an unopened mineshaft cart: reading it rolls its loot
  const loot = cart(level, 'chest_minecart', 0, G, 2, (c) => {
    c.lootTable = 'chests/abandoned_mineshaft';
    c.lootSeed = 7;
  });
  tick(level, 4);
  check('comparator: reading a cart with a loot table rolls it', loot.lootTable === null && countIn(loot.container) > 0 && out(level, -1, G, 2) === m.redstoneSignal(loot.container) && out(level, -1, G, 2) > 0);
  loot.remove();
  tick(level, 25);
  check('detector: no game events of its own (as vanilla)', !events.some((e) => /block_(activate|deactivate)/.test(e.e) && near(e.x, 0.5, 0.6) && near(e.z, 2.5, 0.6)));
  // it only runs straight: at a corner it stays as laid, and a cart passes over it
  line(level, 'rail', 6, 0, 6, 10);
  rail(level, 'detector_rail', 6, G, 11, 'z');
  line(level, 'rail', 6, 12, 6, 20);
  const pass = cart(level, 'chest_minecart', 6, G, 3, (c) => (c.dz = 0.3));
  let seen = false;
  for (let t = 0; t < 60; t++) {
    tick(level);
    if (powered(level, 6, G, 11)) seen = true;
  }
  check('detector: a cart rolling over it powers it on the way', seen && pass.z > 12);
  // (its check a second on isn't saved with the world here, nor kept for a chunk that unloads: a random tick looks again)
  const randomTick = (x, y, z) => m.behaviorOf(level.getState(x, y, z)).randomTick(level, x, y, z, level.getState(x, y, z));
  const randomly = (x, y, z) => !!(m.FLAGS[level.getState(x, y, z)] & m.F_RANDOM_TICK);
  check('detector: it gets random ticks (the plain and powered rails don\'t)', randomly(0, G, 2) && !randomly(0, G, 3) && !randomly(0, G, 0));
  const gone = cart(level, 'minecart', 0, G, 2);
  tick(level, 2);
  gone.remove();
  // (the world saved and loaded again just after the cart went: its check lost)
  level.blockTicks.clear();
  tick(level, 40);
  const stuck = powered(level, 0, G, 2);
  randomTick(0, G, 2);
  tick(level, 5);
  check('detector: left powered with its check lost (saved and loaded just after a cart went), a random tick switches it off', stuck === true && powered(level, 0, G, 2) === false && !lit(1, G, 2) && ![3, 4, 5].some((z) => powered(level, 0, G, z)));
  const sits = cart(level, 'minecart', 0, G, 2);
  tick(level, 2);
  level.blockTicks.clear();
  randomTick(0, G, 2);
  const kept = powered(level, 0, G, 2) && level.hasScheduledTick(0, G, 2, m.getBlock('detector_rail').id);
  sits.remove();
  tick(level, 22);
  check('detector: with a cart still on it, it stays on, its check due again, and goes off once the cart has gone', kept && !powered(level, 0, G, 2));
}

// ---------------------------------------------------------------------------
// the activator rail
{
  const { level, sounds, particles } = world(-1, -1, 2, 1);
  const p = player(level, -10.5, G, -10.5);
  // a rider thrown out, the cart shaken
  line(level, 'rail', 0, 0, 9, 0);
  line(level, 'activator_rail', 10, 0, 11, 0);
  line(level, 'rail', 12, 0, 40, 0);
  level.setBlock(10, G, 1, m.S('redstone_block'));
  const c = cart(level, 'minecart', 5, G, 0, (c) => (c.dx = 0.3));
  tick(level);
  p.startRiding(c);
  let out = -1, wobble = 0, dmg = 0;
  for (let t = 0; t < 80 && out < 0; t++) {
    tick(level);
    if (!p.vehicle) {
      out = c.x;
      wobble = c.hurtTime;
      dmg = c.damage;
    }
  }
  check('activator: a powered one throws out the rider', out >= 10 && out < 12.5 && p.vehicle === null, `${out}`);
  check('activator: and shakes the cart (without breaking it)', wobble > 0 && dmg > 40 && !c.removed, `${wobble} ${dmg}`);
  // unpowered: nothing
  line(level, 'rail', 0, 4, 9, 4);
  line(level, 'activator_rail', 10, 4, 11, 4);
  line(level, 'rail', 12, 4, 40, 4);
  const c2 = cart(level, 'minecart', 5, G, 4, (c) => (c.dx = 0.3));
  tick(level);
  p.startRiding(c2);
  tick(level, 40);
  check('activator: unpowered, the rider stays in', p.vehicle === c2 && c2.x > 13 && c2.hurtTime === 0, `${c2.x}`);
  p.stopRiding();
  // a TNT cart lit
  line(level, 'rail', 20, 8, 30, 8);
  level.setBlock(25, G, 8, 0);
  rail(level, 'activator_rail', 25, G, 8, 'x');
  level.setBlock(25, G, 9, m.S('redstone_block'));
  level.setBlock(24, G - 1, 10, m.S('dirt'));
  const tnt = cart(level, 'tnt_minecart', 25, G, 8);
  const hiss = heard(sounds, 'entity.tnt.primed');
  tick(level);
  const s = sounds.filter((s) => s.name === 'entity.tnt.primed').pop();
  check('activator: a TNT minecart on a powered one lights, with its hiss', tnt.isPrimed() && tnt.fuse === 79 && heard(sounds, 'entity.tnt.primed') === hiss + 1 && s.volume === 1 && s.pitch === 1, `${tnt.fuse}`);
  const smoke0 = particles.filter((q) => q.kind === 'smoke').length;
  tick(level, 10);
  check('TNT: smoking as its fuse burns down, lit only once', tnt.fuse === 69 && particles.filter((q) => q.kind === 'smoke').length - smoke0 === 10 && heard(sounds, 'entity.tnt.primed') === hiss + 1);
  const other = cart(level, 'tnt_minecart', 29, G, 8);
  const booms = heard(sounds, 'entity.generic.explode');
  tick(level, 69);
  const waiting = !tnt.removed && tnt.fuse === 0;
  tick(level);
  check('TNT: it goes off four seconds after it was lit', waiting && tnt.removed && heard(sounds, 'entity.generic.explode') === booms + 1);
  check('TNT: its blast leaves the rails and the blocks under them', [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].every((x) => m.isRail(level.getState(x, G, 8)) && level.getBlockName(x, G - 1, 8) === 'stone'));
  check('TNT: other blocks near it are blown up', level.getBlockName(24, G - 1, 10) === 'air' || level.getBlockName(26, G - 1, 9) === 'air');
  check('TNT: another TNT minecart in the blast lights with a short fuse', !other.removed && other.fuse >= 0 && other.fuse < 40, `${other.fuse}`);
  tick(level, 40);
  check('TNT: which goes off in turn', other.removed && heard(sounds, 'entity.generic.explode') === booms + 2);
  // a hopper cart switched off and on
  line(level, 'rail', 20, 16, 30, 16);
  level.setBlock(25, G, 16, 0);
  rail(level, 'activator_rail', 25, G, 16, 'x');
  level.setBlock(25, G, 17, m.S('redstone_block'));
  const h = cart(level, 'hopper_minecart', 25, G, 16);
  tick(level);
  const drop = new m.ItemEntity(level, ItemStack.of('apple', 3));
  drop.moveTo(25.5, G + 1, 16.5, 0, 0);
  drop.dx = drop.dy = drop.dz = 0;
  level.addEntity(drop);
  tick(level, 10);
  const whileOff = countIn(h.container);
  level.setBlock(25, G, 17, 0);
  tick(level, 3);
  check('activator: a powered one switches a hopper minecart off (it takes nothing in)', whileOff === 0 && h.enabled === true && countIn(h.container, 'apple') === 3, `${whileOff} ${h.enabled} ${countIn(h.container)}`);
  check('activator: and an unpowered one on again', h.enabled === true);
  level.setBlock(25, G, 17, m.S('redstone_block'));
  tick(level);
  const offAgain = h.enabled;
  h.dx = 0.3;
  tick(level, 20);
  check('activator: switched off, it stays off after it\'s left the rail, till an unpowered one', offAgain === false && h.enabled === false && h.x > 27, `${offAgain} ${h.enabled} ${h.x}`);
  void drop;
}

// ---------------------------------------------------------------------------
// a plain rail's junction, flipped by a lever
{
  const { level } = world();
  rail(level, 'rail', 0, G, -1, 'z');
  rail(level, 'rail', 0, G, 1, 'z');
  rail(level, 'rail', 1, G, 0, 'x');
  rail(level, 'rail', 0, G, 0, 'z');
  const first = shape(level, 0, G, 0);
  place(m, level, 'lever', -1, G, 0, { props: { face: 'floor', facing: 'north', powered: false } });
  const placed = shape(level, 0, G, 0);
  use(m, level, -1, G, 0);
  const on = shape(level, 0, G, 0);
  use(m, level, -1, G, 0);
  check('junction: a T curves south-east unpowered, north-east with a lever flipped on, and back', first === 'south_east' && placed === 'south_east' && on === 'north_east' && shape(level, 0, G, 0) === 'south_east', `${first} ${placed} ${on} ${shape(level, 0, G, 0)}`);
  level.setBlock(0, G + 1, 0, m.S('redstone_block'));
  const block = shape(level, 0, G, 0);
  level.setBlock(0, G + 1, 0, 0);
  check('junction: a redstone block set down doesn\'t flip it (vanilla tells it of the air it replaced); taken away, it re-picks unpowered', block === 'south_east' && shape(level, 0, G, 0) === 'south_east', `${block} ${shape(level, 0, G, 0)}`);
  rail(level, 'powered_rail', 5, G, -1, 'z');
  rail(level, 'powered_rail', 5, G, 1, 'z');
  rail(level, 'powered_rail', 6, G, 0, 'x');
  rail(level, 'powered_rail', 5, G, 0, 'z');
  place(m, level, 'lever', 4, G, 0, { props: { face: 'floor', facing: 'north', powered: false } });
  use(m, level, 4, G, 0);
  check('junction: a powered rail never curves, only powers', shape(level, 5, G, 0) === 'north_south' && powered(level, 5, G, 0) === true);
}

// ---------------------------------------------------------------------------
// the hopper minecart
{
  const { level, events } = world();
  const p = player(level, -10.5, G, -10.5);
  line(level, 'rail', 0, 0, 12, 0);
  const h = cart(level, 'hopper_minecart', 0, G, 0);
  check('hopper minecart: a hopper in it, a pixel up, on and empty', h.displayState() === m.getBlock('hopper').defaultState && h.displayOffset() === 1 && h.enabled && h.container.size === 5 && countIn(h.container) === 0);
  m.ItemEntity.drop(level, 0, G + 1, 0, ItemStack.of('apple', 10));
  tick(level, 2);
  check('hopper minecart: takes in an item lying over it, the whole stack at once', countIn(h.container, 'apple') === 10 && items(level, 'apple').length === 0);
  const side = new m.ItemEntity(level, ItemStack.of('bread', 2));
  side.moveTo(1.25, G, 0.5, 0, 0);
  side.dx = side.dy = side.dz = 0;
  level.addEntity(side);
  tick(level, 2);
  check('hopper minecart: and one right beside it', countIn(h.container, 'bread') === 2, `${countIn(h.container, 'bread')}`);
  // a chest over it
  place(m, level, 'chest', 0, G + 1, 0, { props: { facing: 'north' } });
  const chest = level.world.getBlockEntity(0, G + 1, 0);
  chest.container.set(0, ItemStack.of('stick', 3));
  tick(level);
  const oneTick = countIn(h.container, 'stick');
  tick(level, 3);
  check('hopper minecart: takes out of a chest over it, an item a tick (no cooldown)', oneTick === 1 && countIn(h.container, 'stick') === 3 && countIn(chest.container) === 0, `${oneTick}`);
  const late = new m.ItemEntity(level, ItemStack.of('egg', 1));
  late.moveTo(1.25, G, 0.5, 0, 0);
  late.dx = late.dy = late.dz = 0;
  level.addEntity(late);
  tick(level, 2);
  check('hopper minecart: with the chest over it empty, it still takes what\'s beside it', countIn(h.container, 'egg') === 1);
  level.setBlock(0, G + 1, 0, 0);
  for (const e of items(level)) e.remove();
  // a hopper under the rail empties it, one taking in fills it
  const u = cart(level, 'hopper_minecart', 4, G, 0);
  level.setBlock(4, G, 0, 0);
  place(m, level, 'hopper', 4, G - 1, 0, { props: { facing: 'down', enabled: true } });
  rail(level, 'rail', 4, G, 0, 'x');
  u.container.set(0, ItemStack.of('stone', 3));
  tick(level, 40);
  const under = level.world.getBlockEntity(4, G - 1, 0);
  check('hopper under the rail: rails sit on a hopper, which empties the cart over it', m.isRail(level.getState(4, G, 0)) && countIn(u.container) === 0 && countIn(under.container, 'stone') === 3, `${countIn(u.container)} ${under && countIn(under.container)}`);
  place(m, level, 'hopper', 8, G, 1, { props: { facing: 'north', enabled: true } });
  const into = level.world.getBlockEntity(8, G, 1);
  into.container.set(0, ItemStack.of('coal', 2));
  const f = cart(level, 'hopper_minecart', 8, G, 0);
  tick(level, 30);
  check('hopper beside the rail: fills a hopper minecart it points into', countIn(f.container, 'coal') === 2 && countIn(into.container) === 0, `${countIn(f.container)}`);
  // its menu
  const e0 = events.length;
  const menu = m.entityContainerMenu(level, p, h);
  check('menu: a hopper\'s five slots, titled "Minecart with Hopper"', menu instanceof m.HopperMenu && menu.title === 'Minecart with Hopper' && menu.slots.length === 41 && menu.slots[0].item?.item.id === 'apple');
  check('menu: CONTAINER_OPEN where the cart is, by the player', events.slice(e0).some((e) => e.e === 'container_open' && e.entity === p && near(e.x, h.x)));
  p.moveTo(0.5, G, 2.5, 180, 0);
  const valid = menu.stillValid(p);
  p.moveTo(0.5, G, 30.5, 180, 0);
  check('menu: good while the player\'s near it, not from afar', valid && !menu.stillValid(p));
  menu.removed();
  check('menu: CONTAINER_CLOSE when it\'s shut', events.slice(e0).some((e) => e.e === 'container_close'));
  // opened by a right-click
  const inter = new m.Interaction(level, p);
  let opened = null;
  inter.onOpenEntityContainer = (e) => (opened = e);
  p.moveTo(h.x, G, h.z - 2, 0, 0);
  p.pitch = (Math.atan2(p.eyeHeight - 0.4, 2 - 0.49) * 180) / Math.PI;
  hold(p, null);
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.use(true, true);
  inter.rightClickDelay = 0;
  check('menu: opened by right-clicking the cart', opened === h, `${inter.hit?.entity?.type ?? inter.hit?.state}`);
  // saved and loaded
  h.enabled = false;
  const back = reload(h, level);
  check('saving: its items and whether it\'s on kept', back instanceof m.MinecartHopper && countIn(back.container, 'apple') === 10 && countIn(back.container, 'bread') === 2 && back.enabled === false);
  back.remove();
  h.enabled = true;
  // broken: its items spill, and it drops as itself
  const n0 = items(level).length;
  h.hurt(5, 'player', p, p);
  tick(level);
  const dropped = items(level).slice(n0).map((e) => `${e.stack.item.id}x${e.stack.count}`).sort().join();
  check('broken: its items spill out, and a hopper minecart', h.removed && dropped === 'apple x10,bread x2,egg x1,hopper_minecart x1,stick x3'.replace(/ x/g, 'x'), dropped);
  // a creative player's blow: the items still spill, no cart
  const k = cart(level, 'hopper_minecart', 10, G, 0, (c) => c.container.set(2, ItemStack.of('diamond', 4)));
  p.setGameMode('creative');
  const n1 = items(level).length;
  k.hurt(1, 'player', p, p);
  const cre = items(level).slice(n1).map((e) => e.stack.item.id).join();
  p.setGameMode('survival');
  check('broken in creative: gone, its items spilled, no cart dropped', k.removed && cre === 'diamond', cre);
}

// ---------------------------------------------------------------------------
// the TNT minecart
{
  const { level, sounds, events } = world(-2, -2, 2, 2);
  const p = player(level, -30.5, G, -30.5);
  const booms = () => heard(sounds, 'entity.generic.explode');
  line(level, 'rail', 0, 0, 12, 0);
  const t = cart(level, 'tnt_minecart', 2, G, 0);
  check('TNT minecart: TNT in it, not lit', t.displayState() === m.getBlock('tnt').defaultState && !t.isPrimed() && t.fuse === -1);
  t.hurt(5, 'player', p, p);
  check('broken at rest: it drops as a TNT minecart, not lit, no blast', t.removed && items(level, 'tnt_minecart').length === 1 && booms() === 0);
  // broken on the move: lit with a short fuse, dropping nothing
  const mv = cart(level, 'tnt_minecart', 6, G, 0, (c) => (c.dx = 0.2));
  tick(level);
  mv.hurt(5, 'player', p, p);
  check('broken on the move: lit with a short fuse instead (under two seconds), nothing dropped', !mv.removed && mv.fuse >= 0 && mv.fuse < 39 && items(level, 'tnt_minecart').length === 1, `${mv.fuse}`);
  tick(level, 40);
  check('broken on the move: it goes off', mv.removed && booms() === 1);
  // fire: lit, whatever its speed
  line(level, 'rail', 0, 20, 12, 20);
  const f = cart(level, 'tnt_minecart', 2, G, 20);
  const i0 = items(level, 'tnt_minecart').length;
  f.hurt(1, 'inFire');
  check('fire: a burn lights it at once, with a short fuse (dropping nothing)', !f.removed && f.fuse >= 0 && f.fuse < 39 && items(level, 'tnt_minecart').length === i0, `${f.fuse}`);
  tick(level, 40);
  check('fire: then it goes off', f.removed && booms() === 2);
  // lava
  level.setBlock(20, G, 20, m.S('lava'));
  const lv = m.createMinecart('tnt_minecart', level);
  lv.moveTo(20.5, G, 20.5, 0, 0);
  level.addEntity(lv);
  tick(level, 2);
  check('lava: it lights in lava', lv.isPrimed() || lv.removed, `${lv.fuse}`);
  tick(level, 40);
  level.setBlock(20, G, 20, 0);
  // a creative player's blow: gone, nothing lit or dropped
  line(level, 'rail', 30, 20, 34, 20);
  const cr = cart(level, 'tnt_minecart', 32, G, 20, (c) => (c.dx = 0.3));
  tick(level);
  p.setGameMode('creative');
  const b0 = booms(), i1 = items(level, 'tnt_minecart').length;
  cr.hurt(1, 'player', p, p);
  p.setGameMode('survival');
  tick(level, 45);
  check('creative: a creative player\'s blow just removes it', cr.removed && booms() === b0 && items(level, 'tnt_minecart').length === i1);
  // a burning arrow sets it off at once, the blast the shooter's
  line(level, 'rail', 0, 40, 12, 40);
  const a = cart(level, 'tnt_minecart', 2, G, 40);
  const shooter = player(level, -5.5, G, 40.5);
  level.player = p;
  const cold = new m.Arrow(level, shooter);
  a.hurt(2, 'arrow', shooter, cold);
  const b1 = booms();
  check('arrow: a cold arrow doesn\'t set it off', !a.removed && booms() === b1);
  const hot = new m.Arrow(level, shooter);
  hot.dx = 2;
  hot.remainingFireTicks = 100;
  a.hurt(2, 'arrow', shooter, hot);
  check('arrow: a burning one sets it off at once, the blast credited to the shooter', a.removed && booms() === b1 + 1 && a.owner === shooter);
  // a burning arrow in flight
  line(level, 'rail', 20, 40, 30, 40);
  const a2 = cart(level, 'tnt_minecart', 25, G, 40);
  const fly = new m.Arrow(level, shooter);
  fly.moveTo(20.5, G + 0.4, 40.5, 0, 0);
  fly.dx = 1.5;
  fly.dy = 0.04;
  fly.dz = 0;
  fly.remainingFireTicks = 200;
  level.addEntity(fly);
  tick(level, 10);
  check('arrow: a burning arrow shot into it sets it off', a2.removed && booms() === b1 + 2);
  // a fall of three blocks or more
  const fall = m.createMinecart('tnt_minecart', level);
  fall.moveTo(-20.5, G + 5, 0.5, 0, 0);
  level.addEntity(fall);
  const b2 = booms();
  tick(level, 30);
  check('fall: dropped five blocks it goes off as it lands', fall.removed && booms() === b2 + 1);
  const drop = m.createMinecart('tnt_minecart', level);
  drop.moveTo(-20.5, G + 2, -20.5, 0, 0);
  level.addEntity(drop);
  tick(level, 30);
  check('fall: two blocks, it lands whole', !drop.removed && booms() === b2 + 1 && near(drop.y, G));
  // a crash
  level.setBlock(-27, G, 18, m.S('stone'));
  level.setBlock(-27, G, 19, m.S('stone'));
  const crash = m.createMinecart('tnt_minecart', level);
  crash.moveTo(-27.6, G, 18.5, 0, 0);
  level.addEntity(crash);
  crash.dx = 0.3;
  crash.dz = 0.3;
  const b3 = booms();
  tick(level, 3);
  check('crash: running fast into a block it goes off', crash.removed && booms() === b3 + 1);
  level.setBlock(-27, G, 30, m.S('stone'));
  const straight = m.createMinecart('tnt_minecart', level);
  straight.moveTo(-28.6, G, 30.5, 0, 0);
  level.addEntity(straight);
  straight.dx = 0.4;
  tick(level, 5);
  check('crash: head-on it doesn\'t (its speed that way is gone once it\'s stopped, as in vanilla)', !straight.removed && booms() === b3 + 1);
  // saved lit
  line(level, 'rail', 0, -20, 8, -20);
  const sv = cart(level, 'tnt_minecart', 2, G, -20, (c) => (c.fuse = 50));
  const back = reload(sv, level);
  sv.remove();
  check('saving: its fuse kept', back instanceof m.MinecartTNT && back.fuse === 50);
  level.addEntity(back);
  tick(level, 49);
  const b4 = booms();
  tick(level, 2);
  check('saving: and it goes off on time', back.removed && booms() === b4 + 1);
  check('game events: the blasts are heard', events.filter((e) => e.e === 'explode').length === booms());
}

// ---------------------------------------------------------------------------
// the furnace minecart
{
  const { level, particles } = world(-1, -1, 2, 2);
  const p = player(level, 3.5, G, 0.5);
  line(level, 'rail', 0, 0, 40, 0);
  const f = cart(level, 'furnace_minecart', 5, G, 0);
  check('furnace minecart: a furnace in it facing north, unlit, no fuel', f.displayState() === m.getBlock('furnace').state({ facing: 'north', lit: false }) && f.fuel === 0 && !f.lit);
  hold(p, null);
  check('fuel: an empty hand does nothing but swing (no push without fuel)', f.playerInteract(p, null) === true && f.xPush === 0 && f.zPush === 0);
  hold(p, ItemStack.of('coal', 2));
  f.playerInteract(p, p.inventory.main[0]);
  check('fuel: a lump of coal gives it three minutes, one used, and it pushes away from the player', f.fuel === 3600 && p.inventory.main[0]?.count === 1 && near(f.xPush, 2) && near(f.zPush, 0));
  const smoke0 = particles.filter((q) => q.kind === 'large_smoke').length;
  const xs = [];
  for (let t = 0; t < 40; t++) {
    const x0 = f.x;
    tick(level);
    xs.push(f.x - x0);
  }
  check('push: off it goes, east, at 4 m/s (0.2 a tick) and no faster', xs.every((d) => d <= 0.2 + 1e-9 && d >= 0) && near(xs[39], 0.2) && f.x > 12, xs.slice(0, 4).map((d) => d.toFixed(3)).join());
  check('fuel: burning down a tick at a time, lit, smoking', f.fuel === 3560 && f.lit && f.displayState() === m.getBlock('furnace').state({ facing: 'north', lit: true }) && particles.filter((q) => q.kind === 'large_smoke').length - smoke0 > 3);
  f.playerInteract(p, p.inventory.main[0]);
  check('fuel: another lump adds three more minutes', f.fuel === 7160 && !p.inventory.main[0]);
  hold(p, ItemStack.of('charcoal', 1));
  f.playerInteract(p, p.inventory.main[0]);
  check('fuel: charcoal too', f.fuel === 10760 && !p.inventory.main[0]);
  f.fuel = 30000;
  hold(p, ItemStack.of('coal', 5));
  f.playerInteract(p, p.inventory.main[0]);
  check('fuel: not past 32000 ticks (none used)', f.fuel === 30000 && p.inventory.main[0].count === 5);
  hold(p, ItemStack.of('apple', 1));
  f.fuel = 100;
  f.playerInteract(p, p.inventory.main[0]);
  check('fuel: an apple\'s no fuel (though with fuel it still pushes off)', f.fuel === 100 && p.inventory.main[0].count === 1 && f.xPush > 0);
  p.setGameMode('creative');
  hold(p, ItemStack.of('coal', 1));
  f.playerInteract(p, p.inventory.main[0]);
  p.setGameMode('survival');
  check('fuel: none used in creative', f.fuel === 3700 && p.inventory.main[0].count === 1);
  // running out
  f.fuel = 3;
  tick(level, 3);
  const v = f.dx;
  tick(level);
  check('fuel: run out, it stops pushing and goes out', f.fuel === 0 && !f.lit && f.xPush === 0 && f.dx < v);
  tick(level, 200);
  check('fuel: then it rolls to a stop', Math.abs(f.dx) < 0.01);
  // round a bend
  line(level, 'rail', 0, 10, 9, 10);
  rail(level, 'rail', 10, G, 11, 'z');
  rail(level, 'rail', 10, G, 10, 'z');
  line(level, 'rail', 10, 12, 10, 40);
  check('bend: laid', shape(level, 10, G, 10) === 'south_west', shape(level, 10, G, 10));
  const bend = cart(level, 'furnace_minecart', 3, G, 10);
  p.moveTo(1.5, G, 10.5, 0, 0);
  hold(p, ItemStack.of('coal', 1));
  bend.playerInteract(p, p.inventory.main[0]);
  tick(level, 80);
  check('bend: its push turns with the track (south now), and it keeps going', near(bend.x, 10.5, 1e-3) && bend.z > 16 && near(bend.xPush, 0, 1e-6) && bend.zPush > 0, `${bend.x} ${bend.z} ${bend.xPush} ${bend.zPush}`);
  // right-clicked
  const inter = new m.Interaction(level, p);
  const rc = cart(level, 'furnace_minecart', 20, G, 0);
  p.moveTo(18.5, G, 0.5, -90, 0);
  p.pitch = (Math.atan2(p.eyeHeight - 0.4, 2 - 0.49) * 180) / Math.PI;
  hold(p, ItemStack.of('coal', 3));
  p.swinging = false;
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.use(true, true);
  inter.rightClickDelay = 0;
  check('right-click: coal fed to it, one used, the hand swung, pushed away from the player', rc.fuel === 3600 && p.inventory.main[0].count === 2 && p.swinging && rc.xPush > 0, `${inter.hit?.entity?.type} ${rc.fuel}`);
  // saved and loaded
  const back = reload(rc, level);
  check('saving: its fuel and push kept, lit', back instanceof m.MinecartFurnace && back.fuel === 3600 && near(back.xPush, rc.xPush) && near(back.zPush, rc.zPush) && back.lit);
  back.remove();
  // broken
  rc.hurt(5, 'player', p, p);
  check('broken: it drops as a furnace minecart', rc.removed && items(level, 'furnace_minecart').length === 1);
}

// ---------------------------------------------------------------------------
// every cart set on a rail by its item, or by a dispenser; a name kept
{
  const { level, events } = world();
  const p = player(level, 0.5, G, 0.5);
  const inter = new m.Interaction(level, p);
  const types = ['minecart', 'chest_minecart', 'hopper_minecart', 'tnt_minecart', 'furnace_minecart'];
  const made = [];
  types.forEach((id, i) => {
    const x = i * 3;
    rail(level, 'rail', x, G, 2, 'z');
    p.moveTo(x + 0.5, G, 0.5, 0, 0);
    p.pitch = (Math.atan2(p.eyeHeight - 0.1, 2) * 180) / Math.PI;
    hold(p, ItemStack.of(id, 1));
    const e0 = events.length;
    p.swinging = false;
    inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
    inter.use(true, true);
    inter.rightClickDelay = 0;
    const c = live(level, m.AbstractMinecart).find((c) => near(c.x, x + 0.5) && near(c.z, 2.5));
    made.push(c && c.type === id && near(c.y, G + 0.0625) && !p.inventory.main[0] && p.swinging && events.slice(e0).some((e) => e.e === 'entity_place' && e.entity === p));
  });
  check('placed: each kind of minecart set on the rail clicked, one used, ENTITY_PLACE', made.every(Boolean), made.join());
  // on a slope, half a block up; in creative, none used
  level.setBlock(17, G, 3, m.S('stone'));
  rail(level, 'rail', 17, G + 1, 3, 'z');
  rail(level, 'rail', 17, G, 2, 'z');
  p.setGameMode('creative');
  p.moveTo(17.5, G, 0.5, 0, 0);
  p.pitch = (Math.atan2(p.eyeHeight - 0.3, 2) * 180) / Math.PI;
  hold(p, ItemStack.of('furnace_minecart', 1));
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.use(true, true);
  inter.rightClickDelay = 0;
  const up = live(level, m.MinecartFurnace).find((c) => near(c.x, 17.5));
  check('placed: on a slope, half a block up; in creative, none used', shape(level, 17, G, 2) === 'ascending_south' && up && near(up.y, G + 0.5625) && p.inventory.main[0]?.count === 1, up && `${up.y}`);
  p.setGameMode('survival');
  // a name
  rail(level, 'rail', 20, G, 2, 'z');
  p.moveTo(20.5, G, 0.5, 0, 0);
  p.pitch = (Math.atan2(p.eyeHeight - 0.1, 2) * 180) / Math.PI;
  const named = ItemStack.of('tnt_minecart', 1);
  named.tag = { customName: 'Boom' };
  hold(p, named);
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.use(true, true);
  inter.rightClickDelay = 0;
  const nc = live(level, m.MinecartTNT).find((c) => near(c.x, 20.5));
  check('name: a named item\'s cart has its name', nc?.customName === 'Boom' && m.entityDisplayName(nc) === 'Boom');
  const kept = reload(nc, level);
  check('name: kept when the world is saved and loaded', kept?.customName === 'Boom' && !kept.customNameVisible && reload(live(level, m.MinecartFurnace).find((c) => near(c.x, 17.5)), level)?.customName === null);
  nc.hurt(5, 'player', p, p);
  const it = items(level, 'tnt_minecart')[0];
  check('name: and breaking it, the item keeps it', it?.stack.tag?.customName === 'Boom');
  // not on a plain block
  hold(p, ItemStack.of('hopper_minecart', 1));
  p.moveTo(25.5, G, 0.5, 0, 0);
  p.pitch = (Math.atan2(p.eyeHeight, 2) * 180) / Math.PI;
  const n0 = live(level, m.AbstractMinecart).length;
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.use(true, true);
  inter.rightClickDelay = 0;
  check('placed: not on the ground', live(level, m.AbstractMinecart).length === n0 && p.inventory.main[0]?.count === 1);
  // dispensers
  const kinds = [];
  ['hopper_minecart', 'tnt_minecart', 'furnace_minecart'].forEach((id, i) => {
    const z = 8 + i * 3;
    rail(level, 'rail', 1, G, z, 'x');
    place(m, level, 'dispenser', 0, G, z, { props: { facing: 'east' } });
    const s = ItemStack.of(id, 1);
    if (id === 'furnace_minecart') s.tag = { customName: 'Puffer' };
    const src = { level, x: 0, y: G, z, facing: EAST, be: level.world.getBlockEntity(0, G, z), success: true };
    m.dispenseBehaviorFor(s)(src, s);
    const c = live(level, m.AbstractMinecart).find((c) => near(c.z, z + 0.5) && c.x < 3);
    kinds.push(c && c.type === id && near(c.x, 1.625) && near(c.y, G + 0.1) && s.count === 0 && (id !== 'furnace_minecart' || c.customName === 'Puffer'));
  });
  check('dispensers: each set on the rail in front (a name kept)', kinds.every(Boolean), kinds.join());
}

// ---------------------------------------------------------------------------
// a chest minecart as before (a creative player's blow now spills it, as vanilla's discard does)
{
  const { level } = world();
  const p = player(level, -5.5, G, -5.5);
  rail(level, 'rail', 0, G, 0, 'z');
  const c = cart(level, 'chest_minecart', 0, G, 0, (c) => c.container.set(5, ItemStack.of('gold_ingot', 7)));
  p.setGameMode('creative');
  c.hurt(1, 'player', p, p);
  check('chest minecart: a creative player\'s blow removes it, its contents spilled', c.removed && items(level, 'gold_ingot').length === 1 && items(level, 'chest_minecart').length === 0);
  const back = reload(cart(level, 'chest_minecart', 0, G, 0, (c) => c.container.set(1, ItemStack.of('iron_ingot', 3))), level);
  check('chest minecart: saved and loaded as before', back instanceof m.MinecartChest && countIn(back.container, 'iron_ingot') === 3);
}

// ---------------------------------------------------------------------------
// /summon's entity data (vanilla readAdditionalSaveData, and Entity's CustomName and Motion)
{
  const { level } = world();
  const p = player(level, 0.5, G, 0.5);
  const chats = [];
  const game = { meta: { allowCommands: true }, chat: (t) => chats.push(t), player: p, playerName: 'Tester', level, world: level.world, sound: { play() {} } };
  const summon = (line) => {
    m.executeCommand(game, line);
    return live(level, m.AbstractMinecart).pop();
  };
  const t = summon('summon minecraft:tnt_minecart ~ ~ ~2 {TNTFuse:30}');
  check('summon: a TNT minecart\'s TNTFuse (lit)', t instanceof m.MinecartTNT && t.fuse === 30 && t.isPrimed(), chats.join(' | '));
  const f = summon('summon furnace_minecart ~2 ~ ~2 {Fuel:200s,PushX:1.0d,PushZ:0.0d}');
  check('summon: a furnace minecart\'s Fuel, PushX and PushZ (lit)', f instanceof m.MinecartFurnace && f.fuel === 200 && f.xPush === 1 && f.zPush === 0 && f.lit);
  const h = summon('summon hopper_minecart ~4 ~ ~2 {Enabled:0b,Items:[{Slot:2b,id:"minecraft:diamond",count:5},{Slot:9b,id:"minecraft:stone",count:1}]}');
  check('summon: a hopper minecart\'s Enabled and Items, each in its slot (none past its five)', h instanceof m.MinecartHopper && !h.enabled && h.container.get(2)?.item.id === 'diamond' && h.container.get(2).count === 5 && countIn(h.container) === 5);
  const c = summon('summon chest_minecart ~6 ~ ~2 {LootTable:"minecraft:chests/abandoned_mineshaft",LootTableSeed:7L}');
  check('summon: a chest minecart\'s LootTable and LootTableSeed, rolled only when it\'s opened', c instanceof m.MinecartChest && c.lootTable === 'chests/abandoned_mineshaft' && c.lootSeed === 7 && countIn(c.container) === 0);
  const n = summon('summon minecart ~8 ~ ~2 {CustomName:\'"Bob"\',CustomNameVisible:1b,Motion:[0.25d,0.0d,20.0d]}');
  check('summon: a name (shown) and Motion (a part over 10 taken as 0)', n instanceof m.Minecart && n.customName === 'Bob' && n.customNameVisible && m.entityDisplayName(n) === 'Bob' && near(n.dx, 0.25) && n.dz === 0);
  const plain = summon('summon hopper_minecart ~10 ~ ~2');
  check('summon: with none, as it\'s made (a hopper minecart on, empty)', plain instanceof m.MinecartHopper && plain.enabled && countIn(plain.container) === 0 && plain.customName === null);
}

// ---------------------------------------------------------------------------
// drawing a lit TNT minecart
{
  const { level } = world();
  const t = new m.MinecartTNT(level);
  const draw = (fuse, pt) => {
    t.fuse = fuse;
    const b = { overlays: [], setOverlay(...a) { this.overlays.push(a); } };
    const pose = { scaled: null, scale(x, y, z) { this.scaled = [x, y, z]; } };
    const its = { drawn: [], renderBlockState(_b, _p, st) { this.drawn.push(st); } };
    m.renderMinecartContents(b, pose, its, t, t.displayState(), pt);
    return { white: b.overlays.some((o) => o.join() === '1,1,1,0.75'), scale: pose.scaled?.[0] ?? 1, drawn: its.drawn };
  };
  const unlit = draw(-1, 0);
  check('drawn: unlit, just its TNT', !unlit.white && unlit.scale === 1 && unlit.drawn.join() === String(m.getBlock('tnt').defaultState));
  check('drawn: lit, it flashes white every quarter second', draw(80, 0).white && !draw(77, 0).white && draw(70, 0).white && !draw(65, 0).white);
  const late = draw(4, 0.5), end = draw(0, 1);
  check('drawn: in its last half second it swells, up to 1.3 times its size', draw(20, 0).scale === 1 && near(late.scale, 1 + 0.55 ** 4 * 0.3) && near(end.scale, 1.3));
  const h = new m.MinecartHopper(level);
  const b = { overlays: [], setOverlay(...a) { this.overlays.push(a); } };
  const its = { drawn: [], renderBlockState(_b, _p, st) { this.drawn.push(st); } };
  m.renderMinecartContents(b, { scale() { throw new Error('scaled'); } }, its, h, h.displayState(), 0);
  check('drawn: another cart\'s block as it is', its.drawn.length === 1 && b.overlays.length === 0);
}

await exitWithStatus(close);
