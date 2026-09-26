// Scratch checks for mob equipment, dyeing and regional difficulty (node tests/armor/equip-test.mjs).
import { loadModules } from '../../scripts/load.mjs';

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(2);
}, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/item/item.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/entity/monsters.ts',
  '/src/entity/piglin.ts', '/src/item/dyedColor.ts', '/src/game/difficulty.ts', '/src/item/enchantHelper.ts', '/src/entity/itemEntity.ts',
  '/src/game/commands.ts', '/src/item/inventory.ts', '/src/inventory/menus.ts', '/src/gui/screens/container.ts',
  '/src/entity/player.ts', '/src/game/interaction.ts',
]);
const [, itemMod, levelMod, worldMod, monsters, piglinMod, dyed, diff, ench, itemEnt, cmdMod, invMod, menusMod, tipMod, playerMod, interMod] = mods;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`);
};
const S = (id, n = 1) => ItemStack.of(id, n);

// --- regional difficulty ---
const DI = diff.DifficultyInstance;
check('normal start 1.5', new DI('normal', 0, 0, 1).effective === 1.5);
check('normal max 4.0', new DI('normal', 1e9, 1e9, 1).effective === 4);
check('hard max 6.75', new DI('hard', 1e9, 1e9, 1).effective === 6.75);
check('easy max 1.5', new DI('easy', 1e9, 1e9, 1).effective === 1.5);
check('hard start 2.25 special 0.125', new DI('hard', 0, 0, 1).effective === 2.25 && new DI('hard', 0, 0, 1).specialMultiplier() === 0.125);
check('normal max special 1', new DI('normal', 1e9, 1e9, 1).specialMultiplier() === 1);

// --- dyeing ---
const red = dyed.applyDyes(S('leather_chestplate'), ['red']);
check('red leather', red.tag.dyedColor === 0xb02e26, red.tag.dyedColor.toString(16));
const ry = dyed.applyDyes(red, ['yellow']);
check('red then yellow', ry.tag.dyedColor === 0xd78331, ry.tag.dyedColor.toString(16));
const bw = dyed.applyDyes(S('leather_boots'), ['blue', 'white']);
console.log('     blue+white', bw.tag.dyedColor.toString(16));
check('not dyeable', dyed.applyDyes(S('iron_chestplate'), ['red']) === null);

// --- a level ---
const world = new worldMod.World();
const level = new levelMod.Level(world, 'test');
const sounds = [];
level.sound = { play: (n) => sounds.push(n), playUI() {} };
level.gameRules.mobGriefing = true;

const z = new monsters.Zombie(level);
z.moveTo(0.5, 64, 0.5, 0, 0);
level.addEntity(z);
check('zombie base armour 2', z.armorValue() === 2);
z.tickCount = 5;
// iron chestplate: into the chest slot, a sure drop, persistent
let got = z.equipItemIfPossible(S('iron_chestplate'));
check('chestplate on', z.armorItems[2]?.item.id === 'iron_chestplate' && got && z.armorDropChances[2] === 2 && z.persistenceRequired);
check('equip sound iron', sounds.includes('item.armor.equip_iron'), sounds.join(','));
check('armour 2+6', z.armorValue() === 8);
// diamond replaces iron; the iron drops (chance 2)
const before = level.entities.length;
got = z.equipItemIfPossible(S('diamond_chestplate'));
check('diamond replaces', z.armorItems[2]?.item.id === 'diamond_chestplate' && level.entities.length === before + 1);
check('toughness 2', z.armorToughness() === 2);
// leather is worse: the armour slot refuses, the empty hand takes it
got = z.equipItemIfPossible(S('leather_chestplate'));
check('worse armour to empty hand', z.mainHand?.item.id === 'leather_chestplate' && z.armorItems[2]?.item.id === 'diamond_chestplate');
// swords beat anything but a better sword
check('sword over chestplate in hand', z.canReplaceCurrentItem(S('wooden_sword'), z.mainHand));
check('iron sword over stone sword', z.canReplaceCurrentItem(S('iron_sword'), S('stone_sword')));
check('stone sword not over iron sword', !z.canReplaceCurrentItem(S('stone_sword'), S('iron_sword')));
check('pickaxe over a block', z.canReplaceCurrentItem(S('iron_pickaxe'), S('dirt')));
check('pickaxe not over a sword', !z.canReplaceCurrentItem(S('iron_pickaxe'), S('iron_sword')));
const worn = S('iron_sword'); worn.damage = 10;
check('less worn equal sword', z.canReplaceCurrentItem(S('iron_sword'), worn));
const ench1 = S('iron_sword'); ench1.tag = { enchantments: { sharpness: 1 } };
check('enchanted equal sword', z.canReplaceCurrentItem(ench1, S('iron_sword')));
const bound = S('leather_helmet'); bound.tag = { enchantments: { binding_curse: 1 } };
check('never over binding', !z.canReplaceCurrentItem(S('diamond_helmet'), bound));
// a stack of armour: one piece goes on
const zz = new monsters.Zombie(level);
zz.moveTo(4.5, 64, 0.5, 0, 0);
level.addEntity(zz);
const ie = new itemEnt.ItemEntity(level, S('golden_boots', 3));
ie.moveTo(4.5, 64, 0.5, 0, 0);
ie.pickupDelay = 0;
level.addEntity(ie);
zz.canPickUpLoot = true;
const takes = [];
level.onTake = (e, taker, n) => takes.push({ e, taker, n, removed: e.removed, count: e.stack?.count });
zz.aiStep();
check('picked one boot of three', zz.armorItems[0]?.item.id === 'golden_boots' && ie.stack.count === 2, `count ${ie.stack.count}`);
check('take(e, 1) before the stack shrinks', takes.length === 1 && takes[0].e === ie && takes[0].taker === zz && takes[0].n === 1 && !takes[0].removed && takes[0].count === 3, JSON.stringify(takes.map((t) => [t.n, t.removed, t.count])));

// death drops: sure drops as they were, the rest need a recent player hit
const zd = new monsters.Zombie(level);
zd.moveTo(8.5, 64, 0.5, 0, 0);
level.addEntity(zd);
const helm = S('iron_helmet'); helm.damage = 7;
zd.setItemSlotAndDropWhenKilled('head', helm);
zd.armorItems[1] = S('diamond_leggings');
zd.armorDropChances[1] = 1; // always, but worn
const n0 = level.entities.length;
zd.dropCustomDeathLoot(null, true, 0);
const drops = level.entities.slice(n0).map((e) => e.stack);
const dh = drops.find((s) => s.item.id === 'iron_helmet');
const dl = drops.find((s) => s.item.id === 'diamond_leggings');
check('sure drop as it was', dh && dh.damage === 7);
check('non-sure drop worn', dl && dl.damage > 0 && dl.damage <= dl.item.maxDamage, dl ? `${dl.damage}/${dl.item.maxDamage}` : '');
const zn = new monsters.Zombie(level);
zn.armorItems[3] = S('iron_helmet');
zn.armorDropChances[3] = 1;
const n1 = level.entities.length;
zn.dropCustomDeathLoot(null, false, 0);
check('no recent hit: no drop', level.entities.length === n1 && zn.armorItems[3]);
zn.armorDropChances[3] = 0;
zn.dropCustomDeathLoot(null, true, 0);
check('chance 0 never drops', zn.armorItems[3]);

// save / load
const zs = new monsters.Zombie(level);
zs.setItemSlotAndDropWhenKilled('chest', S('chainmail_chestplate'));
zs.armorItems[0] = S('leather_boots');
zs.armorItems[0].tag = { dyedColor: 0x123456 };
zs.canPickUpLoot = true;
const saved = JSON.parse(JSON.stringify(zs.save()));
const zl = new monsters.Zombie(level);
zl.load(saved);
check('load armour', zl.armorItems[2]?.item.id === 'chainmail_chestplate' && zl.armorDropChances[2] === 2 && zl.armorItems[0]?.tag?.dyedColor === 0x123456 && zl.canPickUpLoot);

// sun: a helmet takes the burn
const zb = new monsters.Zombie(level);
zb.armorItems[3] = S('iron_helmet');
zb.isSunBurnTick = () => true;
let dmg = 0;
for (let i = 0; i < 200; i++) zb.burnInSunUnlessHelmeted();
dmg = zb.armorItems[3]?.damage ?? -1;
check('helmet wears in sun, no fire', dmg > 50 && dmg < 150 && zb.remainingFireTicks <= 0, `damage ${dmg}`);
for (let i = 0; i < 400; i++) zb.burnInSunUnlessHelmeted();
check('helmet breaks, then fire', !zb.armorItems[3] && zb.remainingFireTicks > 0);

// spawn equipment rolls (a forced special multiplier)
const stats = { suits: 0, pieces: 0, tiers: {}, ench: 0 };
const N = 20000;
for (let i = 0; i < N; i++) {
  const m = new monsters.Zombie(level);
  const d = new DI('hard', 1e9, 1e9, 1);
  m.populateDefaultEquipmentSlots(d);
  m.populateDefaultEquipmentEnchantments(d);
  const worn = m.armorItems.filter((a) => a);
  if (worn.length) stats.suits++;
  stats.pieces += worn.length;
  for (const a of worn) {
    const t = a.item.id.split('_')[0];
    stats.tiers[t] = (stats.tiers[t] ?? 0) + 1;
    if (a.tag?.enchantments) stats.ench++;
  }
}
console.log('     hard, special 1:', `suits ${(stats.suits / N * 100).toFixed(1)}%`, `pieces/suit ${(stats.pieces / stats.suits).toFixed(2)}`, `enchanted ${(stats.ench / stats.pieces * 100).toFixed(1)}%`, JSON.stringify(stats.tiers));
check('suit chance ~15%', Math.abs(stats.suits / N - 0.15) < 0.01);
check('armour enchant ~50%', Math.abs(stats.ench / stats.pieces - 0.5) < 0.03);

// mob spawn enchanting
const counts = {};
for (let i = 0; i < 2000; i++) {
  const s = S('iron_sword');
  ench.enchantMobSpawnEquipment(s, 1, level.random);
  for (const [k, v] of Object.entries(s.tag?.enchantments ?? {})) counts[`${k}${v}`] = (counts[`${k}${v}`] ?? 0) + 1;
}
console.log('     sword enchants at special 1:', JSON.stringify(counts));

// skeleton: a bow, and a sword it picks up turns it to melee
const sk = new monsters.Skeleton(level);
sk.moveTo(12.5, 64, 0.5, 0, 0);
sk.finalizeSpawn('natural');
check('skeleton bow', sk.mainHand?.item.id === 'bow');
const ws = new monsters.WitherSkeleton(level);
ws.finalizeSpawn('natural');
check('wither skeleton stone sword, no armour', ws.mainHand?.item.id === 'stone_sword' && ws.armorItems.every((a) => !a));
const zp = new monsters.ZombifiedPiglin(level);
zp.finalizeSpawn('natural');
check('zombified piglin golden sword, no armour', zp.mainHand?.item.id === 'golden_sword' && zp.armorItems.every((a) => !a));

// piglin: golden helmet → off hand to admire → on its head
const pg = new piglinMod.Piglin(level);
pg.moveTo(20.5, 64, 0.5, 0, 0);
level.addEntity(pg);
pg.tickCount = 5;
pg.mainHand = S('golden_sword');
const gh = new itemEnt.ItemEntity(level, S('golden_helmet'));
gh.moveTo(20.5, 64, 0.5, 0, 0);
gh.pickupDelay = 0;
level.addEntity(gh);
check('piglin wants golden helmet', pg.wantsToPickUp(gh.stack));
takes.length = 0;
pg.pickUpItem(gh);
check('admiring the helmet', pg.offHand?.item.id === 'golden_helmet' && gh.removed);
check('piglin take(e, 1)', takes.length === 1 && takes[0].e === gh && takes[0].n === 1 && !takes[0].removed);
pg.stopHoldingOffHandItem(true);
check('then wears it', pg.armorItems[3]?.item.id === 'golden_helmet' && !pg.offHand && pg.armorDropChances[3] === 2);
check('piglin wants iron chestplate (chest empty)', pg.wantsToPickUp(S('iron_chestplate')));
pg.armorItems[2] = S('golden_chestplate');
check('piglin keeps gold over diamond', !pg.wantsToPickUp(S('diamond_chestplate')));
// conversion carries the armour
pg.finishConversion();
const conv = level.entities.find((e) => e.type === 'zombified_piglin' && !e.removed && e.armorItems[3]);
check('zombified keeps helmet and pickup', conv && conv.armorItems[3]?.item.id === 'golden_helmet' && conv.armorDropChances[3] === 2 && conv.canPickUpLoot && conv.armorItems[2]?.item.id === 'golden_chestplate');

// commands: /summon with entity data, /give with dyed_color
const chats = [];
const fakePlayer = { x: 30.5, y: 64, z: 0.5, inventory: new invMod.Inventory(), level };
const game = { meta: { allowCommands: true }, chat: (m) => chats.push(m), player: fakePlayer, playerName: 'Tester', level, world, sound: { play() {} } };
cmdMod.executeCommand(game, 'summon minecraft:zombie ~ ~ ~ {ArmorItems:[{id:"minecraft:leather_boots",count:1,components:{"minecraft:dyed_color":16711680}},{},{},{id:"minecraft:diamond_helmet",count:1,components:{"minecraft:enchantments":{levels:{"minecraft:protection":4}}}}],HandItems:[{id:"minecraft:iron_sword",count:1},{}],ArmorDropChances:[0.5f,0.085f,0.085f,2.0f],CanPickUpLoot:1b}');
const sz = level.entities[level.entities.length - 1];
check('summon: armour from data', sz.type === 'zombie' && sz.armorItems[0]?.tag?.dyedColor === 0xff0000 && sz.armorItems[3]?.tag?.enchantments?.protection === 4 && !sz.armorItems[1] && sz.mainHand?.item.id === 'iron_sword', chats.join(' | '));
check('summon: drop chances, loot', sz.armorDropChances[0] === 0.5 && sz.armorDropChances[3] === 2 && sz.canPickUpLoot);
cmdMod.executeCommand(game, 'summon minecraft:creeper ~ ~ ~ {powered:1b}');
const sc = level.entities[level.entities.length - 1];
check('summon: charged creeper from data', sc.type === 'creeper' && sc.powered === true, chats[chats.length - 1]);
// (at the start of a world the special multiplier is 0: no gear either way, but 5% come as babies when finalized)
let babies = 0, dataBabies = 0;
for (let i = 0; i < 300; i++) {
  cmdMod.executeCommand(game, 'summon minecraft:zombie ~ ~ ~');
  if (level.entities[level.entities.length - 1].isBaby()) babies++;
  cmdMod.executeCommand(game, 'summon minecraft:zombie ~ ~ ~ {}');
  if (level.entities[level.entities.length - 1].isBaby()) dataBabies++;
}
check('summon without data is finalized, with {} it is not', babies > 0 && dataBabies === 0, `babies ${babies}/300, with data ${dataBabies}/300`);
cmdMod.executeCommand(game, 'give @s leather_chestplate[dyed_color={rgb:255,show_in_tooltip:false}]');
const given = fakePlayer.inventory.main.find((s) => s?.item.id === 'leather_chestplate');
check('give dyed_color hidden', given?.tag?.dyedColor === 255 && given.tag.dyedHidden === true, chats.join(' | '));
cmdMod.executeCommand(game, 'give @s leather_boots[dyed_color=65280]');
const boots = fakePlayer.inventory.main.find((s) => s?.item.id === 'leather_boots');
check('give dyed_color int', boots?.tag?.dyedColor === 65280);
const tip = tipMod.itemTooltip(boots);
check('tooltip Dyed', tip.includes('§7§oDyed'), JSON.stringify(tip));
check('hidden: no Dyed line', !tipMod.itemTooltip(given).includes('§7§oDyed'));

// the dye recipe in the 2x2 grid, and the armour slot's equip sound
fakePlayer.gameMode = 'survival';
const menu = new menusMod.InventoryMenu(fakePlayer);
menu.craft.items[0] = S('leather_helmet');
menu.craft.items[1] = S('red_dye');
menu.craft.items[3] = S('yellow_dye');
menu.slotsChanged();
check('dye recipe red+yellow', menu.result.items[0]?.tag?.dyedColor === 0xd78331 && menu.result.items[0].item.id === 'leather_helmet', menu.result.items[0]?.tag?.dyedColor?.toString(16));
menu.craft.items[2] = S('leather_boots');
menu.slotsChanged();
check('two pieces: nothing', menu.result.items[0] === null);
menu.craft.items[2] = S('stick');
menu.slotsChanged();
check('a stick: nothing', menu.result.items[0] === null);
menu.craft.items[2] = null;
menu.craft.items[1] = null;
menu.craft.items[3] = null;
menu.slotsChanged();
check('no dye: nothing', menu.result.items[0] === null);
sounds.length = 0;
const headSlot = menu.slots.find((s) => s instanceof menusMod.ArmorSlot && s.slot === 39);
headSlot.set(S('golden_helmet'));
check('armour slot equip sound', sounds.includes('item.armor.equip_gold') && fakePlayer.inventory.armor[3]?.item.id === 'golden_helmet', sounds.join(','));
sounds.length = 0;
headSlot.set(null);
check('taking it off: silent', sounds.length === 0);

// right-click equipping from either hand (main's per-hand use loop: a false return passes to the other hand)
const pl = new playerMod.Player(level);
pl.moveTo(40.5, 64, 0.5, 0, 0);
pl.gameMode = 'survival';
const inter = new interMod.Interaction(level, pl);
pl.inventory.offhand = S('iron_helmet');
sounds.length = 0;
const r1 = pl.inventory.withHand('off', () => inter.useItem(pl.inventory.selectedItem));
check('offhand helmet goes on', r1 === true && pl.inventory.armor[3]?.item.id === 'iron_helmet' && !pl.inventory.offhand && sounds.includes('item.armor.equip_iron'), sounds.join(','));
pl.inventory.main[pl.inventory.selected] = S('iron_helmet');
sounds.length = 0;
const r2 = inter.useItem(pl.inventory.selectedItem);
check('the very same helmet: fails, silent', r2 === false && pl.inventory.main[pl.inventory.selected]?.item.id === 'iron_helmet' && sounds.length === 0);
pl.inventory.main[pl.inventory.selected] = S('diamond_helmet');
const r3 = inter.useItem(pl.inventory.selectedItem);
check('swap: diamond on, iron to hand', r3 === true && pl.inventory.armor[3]?.item.id === 'diamond_helmet' && pl.inventory.main[pl.inventory.selected]?.item.id === 'iron_helmet');

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
