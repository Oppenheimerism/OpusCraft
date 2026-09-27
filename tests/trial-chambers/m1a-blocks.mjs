// M1a: the tuff and copper families as blocks and items — every block there, its strength, sound, tool, light, map
// colour and shape as vanilla 1.21 has them, what each drops, the items (the heavy core, trial keys, mace, wind
// charge, breeze rod, honeycomb, discs, sherds) and where the creative tabs list them, and every crafting and
// stonecutting recipe with its recipe book category.

import { load, check, flatLevel, place, prop, blockName, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/world/mapColors.ts']);
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const AGES = ['', 'exposed_', 'weathered_', 'oxidized_'];
const KINDS = ['copper_block', 'chiseled_copper', 'copper_grate', 'cut_copper', 'cut_copper_stairs', 'cut_copper_slab', 'copper_door', 'copper_trapdoor', 'copper_bulb'];
const nameOf = (kind, age, waxed) => `${waxed ? 'waxed_' : ''}${AGES[age]}${kind === 'copper_block' && age ? 'copper' : kind}`;
const ALL_COPPER = [];
for (const waxed of [false, true]) for (let age = 0; age < 4; age++) for (const kind of KINDS) ALL_COPPER.push({ name: nameOf(kind, age, waxed), kind, age, waxed });
const TUFF = ['tuff_slab', 'tuff_stairs', 'tuff_wall', 'chiseled_tuff', 'polished_tuff', 'polished_tuff_slab', 'polished_tuff_stairs', 'polished_tuff_wall', 'tuff_bricks', 'tuff_brick_slab', 'tuff_brick_stairs', 'tuff_brick_wall', 'chiseled_tuff_bricks'];
const blockN = (n) => m.BLOCK_BY_NAME.get(n);
const r = new m.Rand(1, 2);
const drops = (st, tool) => m.blockDrops(st, tool ? m.ITEMS.get(tool) : null, r).map((s) => `${s.item.id}x${s.count}`).join(',');

// ---------------------------------------------------------------------------------------------------------------
// Tuff

{
  check('tuff: all 13 new tuff blocks are there, each with its item', TUFF.every((n) => blockN(n) && m.ITEMS.get(n)?.block), TUFF.filter((n) => !blockN(n)).join());
  check('tuff: strength 1.5 / 6 (a copy of tuff), a pickaxe to drop anything', TUFF.every((n) => blockN(n).hardness === 1.5 && blockN(n).resistance === 6 && blockN(n).requiresTool && blockN(n).s.tool === 'pickaxe'));
  const snd = (n) => blockN(n).sound;
  check('tuff: SoundType.TUFF, POLISHED_TUFF and TUFF_BRICKS by family', ['tuff_slab', 'tuff_stairs', 'tuff_wall', 'chiseled_tuff'].every((n) => snd(n) === 'tuff') &&
    ['polished_tuff', 'polished_tuff_slab', 'polished_tuff_stairs', 'polished_tuff_wall'].every((n) => snd(n) === 'polished_tuff') &&
    ['tuff_bricks', 'tuff_brick_slab', 'tuff_brick_stairs', 'tuff_brick_wall', 'chiseled_tuff_bricks'].every((n) => snd(n) === 'tuff_bricks'), TUFF.map(snd).join());
  check('tuff: grey terracotta on maps, all of them', TUFF.every((n) => m.mapColorOf(blockN(n).defaultState) === 43), TUFF.map((n) => m.mapColorOf(blockN(n).defaultState)).join());
  check('tuff: a wooden pickaxe will do; by hand, nothing', drops(m.S('tuff_bricks'), 'wooden_pickaxe') === 'tuff_bricksx1' && drops(m.S('tuff_bricks'), null) === '');
  check('tuff: a double slab drops two', drops(m.S('tuff_slab', { type: 'double' }), 'wooden_pickaxe') === 'tuff_slabx2');
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'tuff_wall', 0, 64, 0);
  place(m, level, 'polished_tuff_wall', 1, 64, 0);
  check('tuff: walls join up with each other', prop(m, level, 0, 64, 0, 'east') !== 'none' && prop(m, level, 1, 64, 0, 'west') !== 'none');
  place(m, level, 'tuff_stairs', 0, 64, 3, { yaw: 180 });
  check('tuff: stairs face the way the player looks', prop(m, level, 0, 64, 3, 'facing') === 'north');
  check('tuff: chiseled tuff has its column top and side textures', blockN('chiseled_tuff').s.model !== undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// Copper

{
  check('copper: all 72 copper blocks (9 kinds, 4 ages, waxed or not), each with its item', ALL_COPPER.every((c) => blockN(c.name) && m.ITEMS.get(c.name)?.block), ALL_COPPER.filter((c) => !blockN(c.name)).map((c) => c.name).join());
  check('copper: strength 3 / 6 throughout', ALL_COPPER.every((c) => blockN(c.name).hardness === 3 && blockN(c.name).resistance === 6));
  const tiered = ALL_COPPER.filter((c) => !/door|trapdoor/.test(c.kind));
  check('copper: a stone pickaxe for the drop (vanilla needs_stone_tool)', tiered.every((c) => blockN(c.name).requiresTool && blockN(c.name).s.tool === 'pickaxe' && blockN(c.name).s.tier === 1));
  check('copper: a wooden pickaxe breaks it for nothing; a stone one drops it', drops(m.S('oxidized_cut_copper'), 'wooden_pickaxe') === '' && drops(m.S('oxidized_cut_copper'), 'stone_pickaxe') === 'oxidized_cut_copperx1');
  check('copper: random ticks while there is an age to go to, never waxed', ALL_COPPER.every((c) => !!blockN(c.name).s.randomTicks === (!c.waxed && c.age < 3)),
    ALL_COPPER.filter((c) => !!blockN(c.name).s.randomTicks !== (!c.waxed && c.age < 3)).map((c) => c.name).join());
  const MAP = [15, 44, 56, 55];
  check('copper: orange, light grey terracotta, warped stem and warped nylium on maps by age', ALL_COPPER.every((c) => m.mapColorOf(blockN(c.name).defaultState) === MAP[c.age]),
    ALL_COPPER.filter((c) => m.mapColorOf(blockN(c.name).defaultState) !== MAP[c.age]).map((c) => c.name).join());
  check('copper: SoundType.COPPER, the grate\'s and the bulb\'s their own', ALL_COPPER.every((c) => blockN(c.name).sound === (c.kind === 'copper_grate' ? 'copper_grate' : c.kind === 'copper_bulb' ? 'copper_bulb' : 'copper')));
  // the bulb
  const LIGHT = [15, 12, 8, 4];
  check('bulb: lit and powered, off to begin with', ALL_COPPER.filter((c) => c.kind === 'copper_bulb').every((c) => { const b = blockN(c.name); return b.get(b.defaultState, 'lit') === false && b.get(b.defaultState, 'powered') === false; }));
  check('bulb: lit it gives light 15, 12, 8, 4 by age (waxed the same), none when out', ALL_COPPER.filter((c) => c.kind === 'copper_bulb').every((c) => m.EMISSION[m.S(c.name, { lit: true })] === LIGHT[c.age] && m.EMISSION[m.S(c.name, { lit: false })] === 0));
  check('bulb: a full, opaque block', m.FLAGS[m.S('copper_bulb')] & m.F_OPAQUE);
  // the grate
  const grate = blockN('copper_grate');
  check('grate: waterloggable, seen through (not opaque, cut out), a full block to walk on', grate.propIndex('waterlogged') >= 0 && !(m.FLAGS[grate.defaultState] & m.F_OPAQUE) && m.FLAGS[grate.defaultState] & m.F_COLLIDE);
  // the doors and trapdoors
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'weathered_copper_door', 0, 64, 0, { yaw: 0 });
  check('door: placed as two halves of the same door', blockName(m, level.getState(0, 64, 0)) === 'weathered_copper_door' && blockName(m, level.getState(0, 65, 0)) === 'weathered_copper_door' && prop(m, level, 0, 65, 0, 'half') === 'upper');
  check('door: the lower half drops the door (any pickaxe), the upper nothing', drops(level.getState(0, 64, 0), 'wooden_pickaxe') === 'weathered_copper_doorx1' && drops(level.getState(0, 65, 0), 'wooden_pickaxe') === '');
  check('door: by hand, nothing', drops(level.getState(0, 64, 0), null) === '');
  check('trapdoor: any pickaxe', drops(m.S('waxed_copper_trapdoor'), 'wooden_pickaxe') === 'waxed_copper_trapdoorx1');
  check('slab: a double cut copper slab drops two', drops(m.S('exposed_cut_copper_slab', { type: 'double' }), 'stone_pickaxe') === 'exposed_cut_copper_slabx2');
  check('bulb: drops itself, lit or not', drops(m.S('copper_bulb', { lit: true, powered: true }), 'stone_pickaxe') === 'copper_bulbx1');
}

// ---------------------------------------------------------------------------------------------------------------
// The lightning rod and the heavy core

{
  const rod = blockN('lightning_rod');
  check('rod: facing, powered and waterlogged; up, unpowered and dry to begin with', rod.propIndex('facing') >= 0 && rod.get(rod.defaultState, 'facing') === 'up' && rod.get(rod.defaultState, 'powered') === false && rod.get(rod.defaultState, 'waterlogged') === false);
  check('rod: strength 3 / 6, a stone pickaxe, orange on maps', rod.hardness === 3 && rod.resistance === 6 && rod.s.tier === 1 && rod.requiresTool && m.mapColorOf(rod.defaultState) === 15);
  const { level, world } = flatLevel(m, -1, -1, 1, 1);
  for (const [face, facing] of [[1, 'up'], [0, 'down'], [2, 'north'], [3, 'south'], [4, 'west'], [5, 'east']]) {
    const st = m.placementState(rod, { world, x: 0, y: 66, z: 0, face, hitY: 0.5, hitX: 0.5, hitZ: 0.5, yaw: 0, pitch: 0, sneaking: false, clickedState: 0, replaceClicked: false });
    check(`rod: put on a block's ${facing} face it points ${facing}`, rod.get(st, 'facing') === facing);
  }
  level.setBlock(0, 70, 0, m.S('water'));
  const wet = m.placementState(rod, { world, x: 0, y: 70, z: 0, face: 1, hitY: 0.5, hitX: 0.5, hitZ: 0.5, yaw: 0, pitch: 0, sneaking: false, clickedState: 0, replaceClicked: false });
  check('rod: placed in still water it is waterlogged', rod.get(wet, 'waterlogged') === true);
  const boxes = (facing) => m.COLLISION_BOXES?.[m.S('lightning_rod', { facing })] ?? rod.s.collision({ get: (k) => (k === 'facing' ? facing : false) });
  const b = (facing) => JSON.stringify(boxes(facing)?.[0]?.map((v) => Math.round(v * 16)));
  check('rod: a 4-wide post through the block along its axis', b('up') === '[6,0,6,10,16,10]' && b('north') === '[6,6,0,10,10,16]' && b('east') === '[0,6,6,16,10,10]', `${b('up')} ${b('north')} ${b('east')}`);
  check('rod: drops itself to a stone pickaxe, nothing to a wooden one', drops(m.S('lightning_rod'), 'stone_pickaxe') === 'lightning_rodx1' && drops(m.S('lightning_rod'), 'wooden_pickaxe') === '');
  const core = blockN('heavy_core');
  check('heavy core: strength 10, blast resistance 1200', core.hardness === 10 && core.resistance === 1200);
  check('heavy core: waterloggable, metal on maps', core.propIndex('waterlogged') >= 0 && m.mapColorOf(core.defaultState) === 6);
  check('heavy core: drops itself even by hand', drops(core.defaultState, null) === 'heavy_corex1');
  const cb = JSON.stringify(core.s.collision[0].map((v) => Math.round(v * 16)));
  check('heavy core: an 8-pixel cube on the floor', cb === '[4,0,4,12,8,12]', cb);
}

// ---------------------------------------------------------------------------------------------------------------
// Items and the creative tabs

{
  const it = (id) => m.ITEMS.get(id);
  check('items: the trial key and the ominous trial key', it('trial_key') && it('ominous_trial_key') && it('trial_key').maxStack === 64);
  check('items: the mace, one to a stack, 500 uses, epic', it('mace')?.maxStack === 1 && it('mace').maxDamage === 500 && it('mace').rarity === 'epic');
  check('items: the wind charge (64 to a stack) and the breeze rod', it('wind_charge')?.maxStack === 64 && !!it('breeze_rod'));
  check('items: the heavy core, epic', it('heavy_core')?.rarity === 'epic');
  check('items: honeycomb', !!it('honeycomb'));
  const discs = ['music_disc_creator', 'music_disc_creator_music_box', 'music_disc_precipice'];
  check('items: the three music discs, one to a stack; Creator rare, the others uncommon', discs.every((d) => it(d)?.maxStack === 1) && it('music_disc_creator').rarity === 'rare' && it('music_disc_creator_music_box').rarity === 'uncommon' && it('music_disc_precipice').rarity === 'uncommon');
  check('items: the flow, guster and scrape sherds', ['flow', 'guster', 'scrape'].every((s) => it(`${s}_pottery_sherd`)));
  const tab = (t) => m.ITEM_LIST.filter((i) => i.creativeTab === t).map((i) => i.id);
  const building = tab('building');
  const bi = (id) => building.indexOf(id);
  check('tabs: the tuff family just before the bricks, in vanilla\'s order', TUFF.length === 13 && bi('bricks') - bi('tuff_stairs') === 13 &&
    ['tuff_stairs', 'tuff_slab', 'tuff_wall', 'chiseled_tuff', 'polished_tuff', 'polished_tuff_stairs', 'polished_tuff_slab', 'polished_tuff_wall', 'tuff_bricks', 'tuff_brick_stairs', 'tuff_brick_slab', 'tuff_brick_wall', 'chiseled_tuff_bricks'].every((id, i) => bi(id) === bi('tuff_stairs') + i));
  const cop = [];
  for (const waxed of [false, true]) for (let age = 0; age < 4; age++) for (const kind of KINDS) cop.push(nameOf(kind, age, waxed));
  check('tabs: all the copper after the block of copper, age by age, then the waxed', cop.every((id, i) => bi(id) === bi('copper_block') + i), cop.filter((id, i) => bi(id) !== bi('copper_block') + i).slice(0, 3).join());
  const fn = tab('functional');
  check('tabs: the lightning rod with the functional blocks, after the suspicious gravel', fn.indexOf('lightning_rod') === fn.indexOf('suspicious_gravel') + 1);
  const combat = tab('combat');
  check('tabs: the mace after the trident, the wind charge before the bow', combat.indexOf('mace') === combat.indexOf('trident') + 1 && combat.indexOf('wind_charge') === combat.indexOf('bow') - 1);
  const ing = tab('ingredients');
  check('tabs: honeycomb after the rabbit hide; breeze rod after the blaze rod, heavy core after it; the keys', ing.indexOf('honeycomb') === ing.indexOf('rabbit_hide') + 1 &&
    ing.indexOf('breeze_rod') === ing.indexOf('blaze_rod') + 1 && ing.indexOf('heavy_core') === ing.indexOf('breeze_rod') + 1 && ing.includes('trial_key') && ing.indexOf('ominous_trial_key') === ing.indexOf('trial_key') + 1);
  const tools = tab('tools').filter((id) => id.startsWith('music_disc_'));
  // (bastions) Pigstep follows 5
  check('tabs: Creator (Music Box), Creator and Precipice among the discs in vanilla\'s order', tools.join() === 'music_disc_13,music_disc_cat,music_disc_blocks,music_disc_chirp,music_disc_far,music_disc_mall,music_disc_mellohi,music_disc_stal,music_disc_strad,music_disc_ward,music_disc_11,music_disc_creator_music_box,music_disc_wait,music_disc_creator,music_disc_precipice,music_disc_otherside,music_disc_relic,music_disc_5,music_disc_pigstep', tools.join());
  const sherds = m.ITEM_LIST.filter((i) => i.id.endsWith('_pottery_sherd')).map((i) => i.id);
  const at = m.ITEM_LIST.findIndex((i) => i.id.endsWith('_pottery_sherd'));
  check('tabs: the sherds together, in name order', sherds.join() === [...sherds].sort().join() && sherds.every((id, i) => m.ITEM_LIST[at + i].id === id));
}

// ---------------------------------------------------------------------------------------------------------------
// Recipes

{
  const craft = (w, h, cells) => {
    const grid = cells.map((c) => (c ? stack(c) : null));
    const rec = m.findRecipe(grid, w, h);
    return rec ? `${rec.result}x${rec.count}` : 'none';
  };
  const _ = null;
  check('recipe: polished tuff, 4 from 2x2 tuff', craft(2, 2, ['tuff', 'tuff', 'tuff', 'tuff']) === 'polished_tuffx4');
  check('recipe: tuff bricks, 4 from 2x2 polished tuff', craft(2, 2, ['polished_tuff', 'polished_tuff', 'polished_tuff', 'polished_tuff']) === 'tuff_bricksx4');
  check('recipe: chiseled tuff from two tuff slabs', craft(1, 2, ['tuff_slab', 'tuff_slab']) === 'chiseled_tuffx1');
  check('recipe: chiseled tuff bricks from two tuff brick slabs', craft(1, 2, ['tuff_brick_slab', 'tuff_brick_slab']) === 'chiseled_tuff_bricksx1');
  check('recipe: tuff stairs 4, slab 6, wall 6', craft(3, 3, ['tuff', _, _, 'tuff', 'tuff', _, 'tuff', 'tuff', 'tuff']) === 'tuff_stairsx4' && craft(3, 1, ['tuff', 'tuff', 'tuff']) === 'tuff_slabx6' && craft(3, 2, Array(6).fill('polished_tuff')) === 'polished_tuff_wallx6');
  check('recipe: cut copper, 4 from 2x2 of each age\'s block (and the waxed)', craft(2, 2, Array(4).fill('weathered_copper')) === 'weathered_cut_copperx4' && craft(2, 2, Array(4).fill('waxed_copper_block')) === 'waxed_cut_copperx4');
  check('recipe: chiseled copper from two cut copper slabs', craft(1, 2, ['oxidized_cut_copper_slab', 'oxidized_cut_copper_slab']) === 'oxidized_chiseled_copperx1');
  check('recipe: copper grate, 4 from four blocks in a diamond', craft(3, 3, [_, 'exposed_copper', _, 'exposed_copper', _, 'exposed_copper', _, 'exposed_copper', _]) === 'exposed_copper_gratex4');
  check('recipe: copper bulb, 4 from three blocks round a blaze rod over redstone', craft(3, 3, [_, 'copper_block', _, 'copper_block', 'blaze_rod', 'copper_block', _, 'redstone', _]) === 'copper_bulbx4' &&
    craft(3, 3, [_, 'waxed_oxidized_copper', _, 'waxed_oxidized_copper', 'blaze_rod', 'waxed_oxidized_copper', _, 'redstone', _]) === 'waxed_oxidized_copper_bulbx4');
  check('recipe: copper door, 3 from six ingots', craft(2, 3, Array(6).fill('copper_ingot')) === 'copper_doorx3');
  check('recipe: copper trapdoor, 1 from four ingots', craft(2, 2, Array(4).fill('copper_ingot')) === 'copper_trapdoorx1');
  check('recipe: lightning rod, three ingots stood up', craft(1, 3, ['copper_ingot', 'copper_ingot', 'copper_ingot']) === 'lightning_rodx1');
  check('recipe: a waxed block of copper back into 9 ingots', craft(1, 1, ['waxed_copper_block']) === 'copper_ingotx9');
  check('recipe: any copper and a honeycomb waxes it', craft(2, 1, ['weathered_copper_door', 'honeycomb']) === 'waxed_weathered_copper_doorx1' && craft(2, 1, ['honeycomb', 'copper_bulb']) === 'waxed_copper_bulbx1');
  const waxing = m.RECIPES.filter((x) => x.kind === 'shapeless' && x.ingredients.includes('honeycomb'));
  check('recipe: 36 waxing recipes, one for every unwaxed copper block', waxing.length === 36 && new Set(waxing.map((x) => x.result)).size === 36);
  check('recipe: 4 wind charges from a breeze rod', craft(1, 1, ['breeze_rod']) === 'wind_chargex4');
  check('recipe: the mace, the heavy core on a breeze rod', craft(1, 2, ['heavy_core', 'breeze_rod']) === 'macex1' && craft(3, 3, [_, 'heavy_core', _, _, 'breeze_rod', _, _, _, _]) === 'macex1');
  const book = (result) => m.BOOK_RECIPES.filter((b) => b.result === result).map((b) => b.category);
  check('book: waxing under building blocks, even a door\'s', book('waxed_copper_door').join() === 'crafting_building_blocks');
  check('book: the bulb under redstone (made), building (waxed)', book('waxed_copper_bulb').sort().join() === 'crafting_building_blocks,crafting_redstone' && book('copper_bulb').join() === 'crafting_redstone');
  check('book: exposed cut copper and a grate under building blocks', book('exposed_cut_copper').join() === 'crafting_building_blocks' && book('copper_grate').join() === 'crafting_building_blocks');
  check('book: the mace and wind charge under equipment, the rod under redstone', book('mace').join() === 'crafting_equipment' && book('wind_charge').join() === 'crafting_equipment' && book('lightning_rod').join() === 'crafting_redstone');
  check('book: tuff walls under misc (decorations)', book('tuff_wall').join() === 'crafting_misc');
}

// ---------------------------------------------------------------------------------------------------------------
// Stonecutting

{
  const cut = (id) => m.stonecuttingRecipesFor(stack(id)).map((x) => `${x.result}x${x.count}`).join(',');
  check('stonecutter: tuff into all 13 of its family', m.stonecuttingRecipesFor(stack('tuff')).length === 13);
  check('stonecutter: polished tuff into 8, tuff bricks into 4', m.stonecuttingRecipesFor(stack('polished_tuff')).length === 8 && m.stonecuttingRecipesFor(stack('tuff_bricks')).length === 4);
  check('stonecutter: a slab comes two to a block', cut('tuff').includes('tuff_slabx2') && cut('tuff').includes('chiseled_tuff_bricksx1'));
  check('stonecutter: the block of copper into 4 cut, 4 stairs, 8 slabs, 4 chiseled, 4 grates (sorted by id)',
    cut('copper_block') === 'chiseled_copperx4,copper_gratex4,cut_copperx4,cut_copper_slabx8,cut_copper_stairsx4', cut('copper_block'));
  check('stonecutter: cut copper into stairs, 2 slabs, chiseled', cut('waxed_weathered_cut_copper') === 'waxed_weathered_chiseled_copperx1,waxed_weathered_cut_copper_slabx2,waxed_weathered_cut_copper_stairsx1', cut('waxed_weathered_cut_copper'));
  check('stonecutter: every age and the waxed have theirs', cut('oxidized_copper').startsWith('oxidized_chiseled_copperx4') && cut('waxed_exposed_copper').startsWith('waxed_exposed_chiseled_copperx4'));
}

await exitWithStatus(close);
