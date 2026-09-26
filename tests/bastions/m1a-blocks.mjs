// M1a: the blocks and items the bastion remnants need, as vanilla 1.21 has them: polished basalt, the block of
// netherite and the lodestone (strength, tool, sound, map colour, state, drops), and the blackstone family the
// templates use (cracked and chiseled polished blackstone, the pressure plate and button, gilded blackstone's nugget
// chance, basalt, magma, the wart blocks, gold, soul lanterns); the new items (netherite scrap, Pigstep, the snout
// trim's template, the netherite upgrade's); where the creative tabs list them; their crafting, smelting and
// stonecutting recipes.

import { load, check, flatLevel, place, prop, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/world/mapColors.ts', '/src/textures/blocks.ts', '/src/textures/items.ts', '/src/inventory/smithing.ts']);
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const blockN = (n) => m.BLOCK_BY_NAME.get(n);
const r = new m.Rand(1, 2);
const drops = (st, tool) => m.blockDrops(st, tool ? m.ITEMS.get(tool) : null, r).map((s) => `${s.item.id}x${s.count}`).join(',');

// ---------------------------------------------------------------------------------------------------------------
// The new blocks

{
  const pb = blockN('polished_basalt');
  check('polished basalt: a block with its item, an axis (y by default)', pb && m.ITEMS.get('polished_basalt')?.block && pb.get(pb.defaultState, 'axis') === 'y');
  check('polished basalt: basalt\'s strength (1.25 / 4.2) and sound, a pickaxe to drop it', pb.hardness === 1.25 && pb.resistance === 4.2 && pb.sound === 'basalt' && pb.requiresTool && pb.s.tool === 'pickaxe');
  check('polished basalt: drops itself with any pickaxe, nothing by hand', drops(m.S('polished_basalt', { axis: 'x' }), 'wooden_pickaxe') === 'polished_basaltx1' && drops(m.S('polished_basalt'), null) === '');
  check('polished basalt: black on maps', m.mapColorOf(pb.defaultState) === 29, `${m.mapColorOf(pb.defaultState)}`);
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'polished_basalt', 0, 64, 0, { face: 4 });
  check('polished basalt: placed on a side, it lies along that axis', prop(m, level, 0, 64, 0, 'axis') === 'x');

  const nb = blockN('netherite_block');
  check('netherite block: 50 / 1200, SoundType.NETHERITE_BLOCK', nb && nb.hardness === 50 && nb.resistance === 1200 && nb.sound === 'netherite_block');
  check('netherite block: a diamond pickaxe to drop it (an iron one breaks it for nothing)', drops(nb.defaultState, 'diamond_pickaxe') === 'netherite_blockx1' && drops(nb.defaultState, 'iron_pickaxe') === '');
  check('netherite block: black on maps', m.mapColorOf(nb.defaultState) === 29);

  const ls = blockN('lodestone');
  check('lodestone: 3.5 / 3.5, SoundType.LODESTONE', ls && ls.hardness === 3.5 && ls.resistance === 3.5 && ls.sound === 'lodestone');
  check('lodestone: any pickaxe drops it', drops(ls.defaultState, 'wooden_pickaxe') === 'lodestonex1' && drops(ls.defaultState, null) === '');
  check('lodestone: metal on maps', m.mapColorOf(ls.defaultState) === 6, `${m.mapColorOf(ls.defaultState)}`);
  for (const n of ['polished_basalt', 'netherite_block', 'lodestone']) check(`${n}: a full opaque cube`, (m.FLAGS[blockN(n).defaultState] & m.F_OPAQUE) !== 0);
  for (const t of ['polished_basalt_side', 'polished_basalt_top', 'netherite_block', 'lodestone_side', 'lodestone_top']) {
    const img = m.BLOCK_TEXTURES[t]?.();
    check(`texture ${t}: drawn, 16x16, opaque`, img && img.w === 16 && img.h === 16 && [...Array(256).keys()].every((i) => img.data[i * 4 + 3] === 255));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The blackstone family and the rest the templates place

{
  for (const n of ['blackstone', 'polished_blackstone', 'polished_blackstone_bricks', 'cracked_polished_blackstone_bricks', 'chiseled_polished_blackstone', 'gilded_blackstone',
    'polished_blackstone_brick_stairs', 'polished_blackstone_brick_slab', 'polished_blackstone_brick_wall', 'blackstone_stairs', 'blackstone_slab', 'blackstone_wall',
    'polished_blackstone_stairs', 'polished_blackstone_slab', 'polished_blackstone_wall', 'polished_blackstone_pressure_plate', 'polished_blackstone_button',
    'basalt', 'magma_block', 'nether_wart_block', 'warped_wart_block', 'crimson_stem', 'warped_stem', 'gold_block', 'soul_lantern', 'chain', 'soul_sand', 'soul_soil',
    'crying_obsidian', 'lava', 'chest', 'iron_bars', 'soul_fire', 'ancient_debris', 'nether_gold_ore', 'crimson_fungus', 'crimson_roots', 'lantern']) {
    check(`template block ${n} there`, !!blockN(n));
  }
  check('cracked polished blackstone bricks: 1.5 / 6, pickaxe', blockN('cracked_polished_blackstone_bricks').hardness === 1.5 && blockN('cracked_polished_blackstone_bricks').requiresTool);
  check('polished blackstone pressure plate and button: obtainable', !!m.ITEMS.get('polished_blackstone_pressure_plate') && !!m.ITEMS.get('polished_blackstone_button'));
  // gilded blackstone: 10 % 2-5 gold nuggets, else itself (vanilla gilded_blackstone.json)
  let nug = 0, self = 0;
  const rr = new m.Rand(7, 7);
  for (let i = 0; i < 4000; i++) {
    const d = m.blockDrops(m.S('gilded_blackstone'), m.ITEMS.get('stone_pickaxe'), rr);
    if (d[0]?.item.id === 'gold_nugget') {
      nug++;
      if (d[0].count < 2 || d[0].count > 5) nug = -1e9;
    } else if (d[0]?.item.id === 'gilded_blackstone') self++;
  }
  check('gilded blackstone: 2-5 gold nuggets a tenth of the time, else itself', nug > 320 && nug < 480 && nug + self === 4000, `${nug} ${self}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Items and the creative tabs

{
  const it = (id) => m.ITEMS.get(id);
  check('netherite scrap: an item', !!it('netherite_scrap') && it('netherite_scrap').creativeTab === 'ingredients');
  check('snout template: "Smithing Template", uncommon, its lore', it('snout_armor_trim_smithing_template')?.name === 'Smithing Template' && it('snout_armor_trim_smithing_template').rarity === 'uncommon' &&
    it('snout_armor_trim_smithing_template').lore[0] === 'Snout Armor Trim');
  check('netherite upgrade template: an item', !!it('netherite_upgrade_smithing_template'));
  check('piglin banner pattern (snout): an item', !!it('piglin_banner_pattern'));
  const idx = (id) => m.ITEM_LIST.findIndex((i) => i.id === id);
  check('tabs: scrap just before the netherite ingot', idx('netherite_scrap') + 1 === idx('netherite_ingot'));
  check('tabs: the netherite block just after the diamond block', idx('netherite_block') === idx('diamond_block') + 1);
  check('tabs: the lodestone a functional block, after the conduit', it('lodestone').creativeTab === 'functional' && idx('lodestone') === idx('conduit') + 1);
  check('tabs: Pigstep after 5', idx('music_disc_pigstep') === idx('music_disc_5') + 1);
  check('tabs: the snout template before the flow template', idx('snout_armor_trim_smithing_template') + 1 === idx('flow_armor_trim_smithing_template'));
  check('tabs: polished basalt a building block with the blackstone', it('polished_basalt').creativeTab === 'building' && idx('polished_basalt') + 1 === idx('blackstone_stairs'));
  for (const id of ['netherite_scrap', 'music_disc_pigstep', 'snout_armor_trim_smithing_template']) check(`sprite ${id}`, !!m.ITEM_TEXTURES[it(id).texture]);
}

// ---------------------------------------------------------------------------------------------------------------
// Recipes

{
  const craft = (w, h, cells) => {
    const grid = cells.map((c) => (c ? stack(c) : null));
    const rec = m.findRecipe(grid, w, h);
    return rec ? `${rec.result}x${rec.count}` : 'none';
  };
  check('recipe: polished basalt, 4 from 2x2 basalt', craft(2, 2, Array(4).fill('basalt')) === 'polished_basaltx4');
  check('recipe: the netherite block from 9 ingots, and back', craft(3, 3, Array(9).fill('netherite_ingot')) === 'netherite_blockx1' && craft(1, 1, ['netherite_block']) === 'netherite_ingotx9');
  check('recipe: a netherite ingot from four scrap and four gold', craft(3, 3, ['netherite_scrap', 'gold_ingot', 'netherite_scrap', 'gold_ingot', 'netherite_scrap', 'gold_ingot', 'netherite_scrap', 'gold_ingot', null]) === 'netherite_ingotx1');
  const S = 'chiseled_stone_bricks';
  check('recipe: the lodestone', craft(3, 3, [S, S, S, S, 'netherite_ingot', S, S, S, S]) === 'lodestonex1');
  check('recipe: two snout templates from one, seven diamonds and blackstone',
    craft(3, 3, ['diamond', 'snout_armor_trim_smithing_template', 'diamond', 'diamond', 'blackstone', 'diamond', 'diamond', 'diamond', 'diamond']) === 'snout_armor_trim_smithing_templatex2');
  check('recipe: two netherite upgrade templates from one, seven diamonds and netherrack',
    craft(3, 3, ['diamond', 'netherite_upgrade_smithing_template', 'diamond', 'diamond', 'netherrack', 'diamond', 'diamond', 'diamond', 'diamond']) === 'netherite_upgrade_smithing_templatex2');
  check('smelting: ancient debris into netherite scrap (2 xp) in a furnace and a blast furnace',
    m.smeltingResult(stack('ancient_debris'))?.result === 'netherite_scrap' && m.smeltingResult(stack('ancient_debris')).xp === 2 && m.cookingResult('blast_furnace', stack('ancient_debris'))?.result === 'netherite_scrap');
  check('smelting: polished blackstone bricks crack', m.smeltingResult(stack('polished_blackstone_bricks'))?.result === 'cracked_polished_blackstone_bricks');
  const cut = (id) => m.stonecuttingRecipesFor(stack(id)).map((x) => `${x.result}x${x.count}`).join(',');
  check('stonecutter: basalt into polished basalt', cut('basalt') === 'polished_basaltx1', cut('basalt'));
  check('stonecutter: blackstone into its 12', m.stonecuttingRecipesFor(stack('blackstone')).length === 12);
  check('smithing: diamond gear + the upgrade template + an ingot makes netherite', m.SMITHING.some((x) => x.template === 'netherite_upgrade_smithing_template' && x.base === 'diamond_sword'));
}

await exitWithStatus(close);
