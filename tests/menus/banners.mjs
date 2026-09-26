// Headless checks for banners (node tests/menus/banners.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/game/interaction.ts', '/src/game/banners.ts', '/src/world/blockEntity.ts',
  '/src/inventory/menus.ts', '/src/gui/screens/container.ts', '/src/inventory/recipes.ts', '/src/entity/itemEntity.ts',
  '/src/textures/bannerTextures.ts', '/src/game/blockBehavior.ts', '/src/game/blockRules.ts', '/src/world/bannerPatterns.ts', '/src/core/rng.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, interMod, banners, beMod, menus, cont, rec, itemEnt, tex, bb, rules, bp, rng] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push([n, v, p]), playUI() {} };
level.particles = { blockBreak() {}, spawn() {} };
const player = new playerMod.Player(level);
player.moveTo(0.5, 65, -3.5, 0, 0);
const inv = player.inventory;
const name = (x, y, z) => BLOCKS[STATE_BLOCK[level.getState(x, y, z)]].name;
const prop = (x, y, z, p) => { const st = level.getState(x, y, z); return BLOCKS[STATE_BLOCK[st]].get(st, p); };
for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) level.setBlock(x, 63, z, S('stone'));

// the items
const white = itemMod.ITEMS.get('white_banner');
check('banners stack to 16, burn for 300 ticks, colored blocks tab', white.maxStack === 16 && white.fuel === 300 && white.creativeTab === 'colored');
check('sixteen banners and eight pattern items', itemMod.ITEM_LIST.filter((i) => i.id.endsWith('_banner')).length === 16 && itemMod.ITEM_LIST.filter((i) => i.id.endsWith('_banner_pattern')).length === 8);
check('no wall banner item', !itemMod.ITEMS.has('white_wall_banner'));
check('a wall banner picks as its banner', itemMod.itemForBlock('red_wall_banner')?.id === 'red_banner');
const pat = itemMod.ITEMS.get('mojang_banner_pattern');
check('pattern items: "Banner Pattern", one to a stack, their rarity', pat.name === 'Banner Pattern' && pat.maxStack === 1 && pat.rarity === 'epic' && itemMod.ITEMS.get('flow_banner_pattern').rarity === 'rare');
check('the pattern item\'s tooltip', JSON.stringify(cont.itemTooltip(ItemStack.of('mojang_banner_pattern'))) === JSON.stringify(['§dBanner Pattern', '§7Thing']), JSON.stringify(cont.itemTooltip(ItemStack.of('mojang_banner_pattern'))));

// the recipes
const r = rec.RECIPES.find((x) => x.result === 'lime_banner');
check('a banner: six wool over a stick', r && r.pattern.join('|') === '###|###| | ' && r.key['#'] === 'lime_wool' && r.key['|'] === 'stick');
check('flower, mojang, creeper and skull patterns craft (paper and a creeper head, paper and a wither skeleton skull)', ['flower', 'mojang', 'creeper', 'skull'].every((p) => rec.RECIPES.some((x) => x.result === p + '_banner_pattern')) && rec.RECIPES.some((x) => x.result === 'creeper_banner_pattern' && JSON.stringify(x).includes('creeper_head')) && rec.RECIPES.some((x) => x.result === 'skull_banner_pattern' && JSON.stringify(x).includes('wither_skeleton_skull')));
check('banner fuel', rec.fuelTime(ItemStack.of('red_banner')) === 300);

// placing: standing when looking down at the floor, turned to face the player
const inter = new interMod.Interaction(level, player);
const patterned = (c, layers) => { const s = ItemStack.of(`${c}_banner`); s.tag = { patterns: layers.map(([pattern, color]) => ({ pattern, color })) }; return s; };
const flagged = patterned('red', [['triangle_bottom', 'yellow'], ['circle', 'black']]);
flagged.tag.customName = 'Our Flag';
inv.main[0] = flagged;
inv.selected = 0;
player.yaw = 0; // facing south
player.pitch = 60;
let ok = inter['placeBlock']({ x: 0, y: 63, z: 0, face: 1, hx: 0.5, hy: 64, hz: 0.5, state: level.getState(0, 63, 0), dist: 3 }, flagged);
check('placed on the floor: a standing banner', ok && name(0, 64, 0) === 'red_banner', name(0, 64, 0));
check('facing the player (yaw 0 → rotation 8)', prop(0, 64, 0, 'rotation') === 8, String(prop(0, 64, 0, 'rotation')));
check('rotation segments: yaw 180 → 0, yaw 90 → 12, yaw 11 → 8, yaw 12 → 9', banners.bannerRotation(180) === 0 && banners.bannerRotation(90) === 12 && banners.bannerRotation(11) === 8 && banners.bannerRotation(12) === 9);
let be = world.getBlockEntity(0, 64, 0);
check('its block entity has the patterns and the name', be instanceof beMod.BannerBlockEntity && be.patterns.length === 2 && be.patterns[1].pattern === 'circle' && be.customName === 'Our Flag');
check('the item was used up', !inv.main[0]);
// the block entity saves and loads
const saved = be.save();
const loaded = beMod.loadBlockEntity(JSON.parse(JSON.stringify(saved)));
check('saved and loaded', loaded instanceof beMod.BannerBlockEntity && JSON.stringify(loaded.patterns) === JSON.stringify(be.patterns) && loaded.customName === 'Our Flag', JSON.stringify(saved));

// placing against the side of a block: a wall banner facing away from it
level.setBlock(2, 64, 2, S('stone'));
const w = ItemStack.of('blue_banner');
inv.main[0] = w;
player.yaw = 0; player.pitch = 0;
ok = inter['placeBlock']({ x: 2, y: 64, z: 2, face: 2, hx: 2.5, hy: 64.5, hz: 2, state: level.getState(2, 64, 2), dist: 3 }, w);
check('clicked the north face: a wall banner facing north', ok && name(2, 64, 1) === 'blue_wall_banner' && prop(2, 64, 1, 'facing') === 'north', name(2, 64, 1) + ' ' + prop(2, 64, 1, 'facing'));
// clicked under a ledge while looking up: it hangs from the side it can, never from above
level.setBlock(-2, 66, 0, S('stone'));
level.setBlock(-3, 65, 0, S('stone'));
const u = ItemStack.of('green_banner');
inv.main[0] = u;
player.yaw = 90; player.pitch = -60; // facing west, looking up
ok = inter['placeBlock']({ x: -2, y: 66, z: 0, face: 0, hx: -1.5, hy: 66, hz: 0.5, state: level.getState(-2, 66, 0), dist: 3 }, u);
check('under a ledge looking up and west: hangs on the block to the west', ok && name(-2, 65, 0) === 'green_wall_banner' && prop(-2, 65, 0, 'facing') === 'east', name(-2, 65, 0));

// banners stand on banners (forceSolidOn), not on air
check('a banner is solid to stand another on', banners.legacySolid(level.getState(0, 64, 0)));
check('air is not', !banners.legacySolid(0));

// breaking keeps the patterns and name
level.entities.length = 0;
level.destroyBlock(0, 64, 0, true);
let drops = level.entities.filter((e) => e instanceof itemEnt.ItemEntity).map((e) => e.stack);
check('broken: a red banner with its patterns and name', drops.length === 1 && drops[0].item.id === 'red_banner' && drops[0].tag?.patterns?.length === 2 && drops[0].tag.customName === 'Our Flag', JSON.stringify(drops.map((d) => [d.item.id, d.tag])));
// losing its support breaks a wall banner, dropping the standing one's item
level.entities.length = 0;
level.destroyBlock(2, 64, 2, false);
drops = level.entities.filter((e) => e instanceof itemEnt.ItemEntity).map((e) => e.stack);
check('its wall gone, the wall banner drops a blue banner', name(2, 64, 1) === 'air' && drops.some((d) => d.item.id === 'blue_banner'), name(2, 64, 1) + ' ' + JSON.stringify(drops.map((d) => d.item.id)));
// the floor gone, a standing one breaks
inv.main[0] = ItemStack.of('white_banner');
player.yaw = 0; player.pitch = 60;
inter['placeBlock']({ x: 3, y: 63, z: -3, face: 1, hx: 3.5, hy: 64, hz: -2.5, state: level.getState(3, 63, -3), dist: 3 }, inv.main[0]);
check('placed another', name(3, 64, -3) === 'white_banner');
level.destroyBlock(3, 63, -3, false);
check('its floor gone, it breaks', name(3, 64, -3) === 'air');
// explosions keep the patterns too
{
  level.setBlock(0, 64, 3, S('lime_banner'));
  world.getBlockEntity(0, 64, 3).applyComponents(patterned('lime', [['creeper', 'black']]));
  const loot = rules.blockDrops(level.getState(0, 64, 3), null, new rng.Rand(1), false, 0, world.getBlockEntity(0, 64, 3));
  check('loot given the block entity (as an explosion gives it) keeps the patterns', loot.length === 1 && loot[0].tag?.patterns?.[0]?.pattern === 'creeper');
  const bare = rules.blockDrops(level.getState(0, 64, 3), null, new rng.Rand(1));
  check('without it, a plain banner', bare.length === 1 && bare[0].item.id === 'lime_banner' && !bare[0].tag);
}

// tooltips: the first six layers, grey; the ominous banner's hidden
const six = patterned('white', [['base', 'red'], ['stripe_top', 'blue'], ['cross', 'black'], ['circle', 'yellow'], ['border', 'green'], ['flower', 'pink'], ['skull', 'gray']]);
const tip = cont.itemTooltip(six);
check('tooltip: the name and six layers', tip.length === 7 && tip[1] === '§7Fully Red Field' && tip[2] === '§7Blue Chief' && tip[6] === '§7Pink Flower Charge', JSON.stringify(tip));
const omen = banners.ominousBanner();
const otip = cont.itemTooltip(omen);
check('the ominous banner: its name, uncommon, nothing else', otip.length === 1 && otip[0] === '§eOminous Banner', JSON.stringify(otip));
check('eight layers on the ominous banner', omen.tag.patterns.length === 8 && omen.tag.patterns[0].pattern === 'rhombus');

// copying a banner at the crafting table
level.setBlock(4, 64, 4, S('crafting_table'));
const cm = new menus.CraftingMenu(player, [4, 64, 4]);
const design = patterned('red', [['stripe_top', 'blue'], ['circle', 'black']]);
cm.craft.set(0, design);
cm.craft.set(4, ItemStack.of('red_banner'));
let res = cm.result.items[0];
check('a patterned banner and a blank one: a copy', res?.item.id === 'red_banner' && res.count === 1 && res.tag?.patterns?.length === 2);
cm.clicked(0, 0, 'pickup');
check('taken: the patterned one stays, the blank one is used', cm.carried?.tag?.patterns?.length === 2 && cm.craft.items[0]?.tag?.patterns?.length === 2 && !cm.craft.items[4]);
cm.carried = null;
cm.craft.set(4, ItemStack.of('blue_banner'));
check('not onto another colour', !cm.result.items[0]);
cm.craft.set(4, patterned('red', [['cross', 'white']]));
check('not onto a patterned one', !cm.result.items[0]);
cm.craft.set(4, null);
cm.craft.set(0, null);
cm.removed();
const im = new menus.InventoryMenu(player);
im.craft.set(0, patterned('red', [['cross', 'white']]));
im.craft.set(3, ItemStack.of('red_banner'));
check('the 2x2 grid copies too', im.result.items[0]?.tag?.patterns?.[0]?.pattern === 'cross');
im.craft.set(0, null); im.craft.set(3, null);
im.removed();

// washing in a cauldron: the top layer off one banner, a level of water used
level.setBlock(-1, 64, -1, getBlock('water_cauldron').state({ level: 3 }));
for (let i = 0; i < 36; i++) inv.main[i] = null;
const stack = patterned('yellow', [['stripe_top', 'blue'], ['circle', 'black']]);
stack.count = 2;
inv.main[0] = stack;
inv.selected = 0;
const useOn = bb.behaviorOf(level.getState(-1, 64, -1)).useItemOn;
let rr = inv.withHand('main', () => useOn(level, -1, 64, -1, level.getState(-1, 64, -1), stack, { player, face: 1, hx: -0.5, hy: 65, hz: -0.5, hand: 'main' }));
check('washed: success', rr === 'success');
check('one banner of the two washed, into the inventory', inv.main[0]?.count === 1 && inv.main[0].tag.patterns.length === 2 && inv.main.some((s, i) => i > 0 && s?.item.id === 'yellow_banner' && s.tag?.patterns?.length === 1 && s.tag.patterns[0].pattern === 'stripe_top'), JSON.stringify(inv.main.filter(Boolean).map((s) => [s.count, s.tag])));
check('the cauldron lost a level', prop(-1, 64, -1, 'level') === 2);
const plain = ItemStack.of('yellow_banner');
inv.main[0] = plain;
rr = inv.withHand('main', () => useOn(level, -1, 64, -1, level.getState(-1, 64, -1), plain, { player, face: 1, hx: -0.5, hy: 65, hz: -0.5, hand: 'main' }));
check('a blank banner: passes, no water used', rr === 'pass' && prop(-1, 64, -1, 'level') === 2);
const last = patterned('yellow', [['circle', 'black']]);
inv.main[0] = last;
rr = inv.withHand('main', () => useOn(level, -1, 64, -1, level.getState(-1, 64, -1), last, { player, face: 1, hx: -0.5, hy: 65, hz: -0.5, hand: 'main' }));
check('the last banner of a stack washed in the hand, blank now', rr === 'success' && inv.main[0]?.item.id === 'yellow_banner' && !inv.main[0].tag, JSON.stringify(inv.main[0]?.tag));
// the other water uses still work (a bucket takes a full cauldron's water)
level.setBlock(-1, 64, -1, getBlock('water_cauldron').state({ level: 3 }));
const bucket = ItemStack.of('bucket');
inv.main[0] = bucket;
rr = inv.withHand('main', () => useOn(level, -1, 64, -1, level.getState(-1, 64, -1), bucket, { player, face: 1, hx: -0.5, hy: 65, hz: -0.5, hand: 'main' }));
check('the cauldron\'s own uses still work', rr === 'success' && name(-1, 64, -1) === 'cauldron');

// the textures
const t = tex.bannerTexture('red', [{ pattern: 'stripe_top', color: 'blue' }]);
const at = (u, v) => [t.data[(v * 64 + u) * 4], t.data[(v * 64 + u) * 4 + 1], t.data[(v * 64 + u) * 4 + 2]];
const [r1, , b1] = at(5, 3); // front, in the chief
const [r2, , b2] = at(5, 30); // front, below it
check('the chief is blue over red', b1 > r1 && r2 > b2, JSON.stringify([at(5, 3), at(5, 30)]));
const [r3, , b3] = at(22 + 19 - 4, 3); // the back, mirrored
check('the back shows it too', b3 > r3);
const bare = Object.keys(bp.BANNER_PATTERN_NAMES).filter((p) => !tex.patternMask(p).some((a) => a > 0));
check('every pattern has a mask', bare.length === 0, JSON.stringify(bare));
check('the loom\'s list: 34 patterns, each with a name', bp.NO_ITEM_REQUIRED.length === 34 && bp.NO_ITEM_REQUIRED.every((p) => bp.BANNER_PATTERN_NAMES[p]));
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
