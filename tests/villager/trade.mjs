// Headless checks for trading (node tests/villager/trade.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/villager.ts', '/src/entity/player.ts', '/src/inventory/merchantMenu.ts', '/src/item/item.ts', '/src/entity/trading.ts', '/src/game/sleep.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, vil, playerMod, mm, itemMod, trading, sleep] = mods;
const { S, getBlock } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
const sounds = [];
level.sound = { play: (n) => sounds.push(n), playUI() {} };
{ const gs = S('grass_block'); for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; } }
const xpOrbs = [];
level.awardExperience = (x, y, z, n) => xpOrbs.push(n);

const p = new playerMod.Player(level);
p.moveTo(0.5, 64, 2.5, 180, 0);
level.player = p;
level.addEntity(p);
p.gameMode = 'survival';

const v = new vil.Villager(level);
v.moveTo(0.5, 64, 0.5, 0, 0);
v.finalizeSpawn('egg');
level.addEntity(v);
v.setProfession('librarian');
// a known offer list: 24 paper for an emerald, and 9 emeralds + a book for a bookshelf
v.offers = [
  new trading.MerchantOffer({ id: 'paper', count: 24 }, null, ItemStack.of('emerald', 1), 16, 2, 0.05),
  new trading.MerchantOffer({ id: 'emerald', count: 9 }, null, ItemStack.of('bookshelf', 1), 12, 1, 0.05),
];
let opened = null;
level.onOpenMerchant = (vv, pp) => { opened = new mm.MerchantMenu(pp, vv); };
check('right-click opens trading', v.interact(p, null, true) && opened && v.isTrading());
const m = opened;
check('still valid in reach', m.stillValid(p));

// put paper in the payment slot: the emerald shows in the result
p.inventory.main[0] = ItemStack.of('paper', 64);
p.inventory.main[1] = ItemStack.of('emerald', 20);
m.clicked(m.slots.findIndex((s) => s.slot === 0 && s.container === p.inventory || false), 0, 'pickup');
// pick up the 64 paper from hotbar slot 0 (menu index 30) and drop it in payment slot 0
m.clicked(30, 0, 'pickup');
check('carrying the paper', m.carried?.item.id === 'paper' && m.carried.count === 64);
m.clicked(0, 0, 'pickup');
check('paper in the payment slot', m.trade.items[0]?.count === 64);
check('result shows an emerald', m.trade.items[2]?.item.id === 'emerald', String(m.trade.items[2]?.item.id));
check('villager says yes', sounds.includes('entity.villager.yes'), sounds.join());
check('future xp', m.futureTraderXp() === 2);

// take it
m.clicked(2, 0, 'pickup');
check('took the emerald', m.carried?.item.id === 'emerald' && m.carried.count === 1);
check('paid 24 paper', m.trade.items[0]?.count === 40, String(m.trade.items[0]?.count));
check('offer used once', v.offers[0].uses === 1);
check('villager xp +2', v.xp === 2);
check('player got experience', xpOrbs.length === 1 && xpOrbs[0] >= 3 && xpOrbs[0] <= 6, xpOrbs.join());
check('result refilled (still enough paper)', m.trade.items[2]?.item.id === 'emerald');
// put the emerald down in the inventory
m.clicked(31 + 2, 0, 'pickup');

// shift-click the result: trades as long as the paper lasts (40 → 16 left, one more trade)
m.clicked(2, 0, 'quick_move');
check('shift-click trades once more', v.offers[0].uses === 2 && m.trade.items[0]?.count === 16, `${v.offers[0].uses} ${m.trade.items[0]?.count}`);
check('no result without enough paper', !m.trade.items[2]);

// choose the bookshelf offer: the paper goes back, 9+ emeralds come in
m.setSelectionHint(1);
m.tryMoveItems(1);
check('paper put back', !m.trade.items[0] || m.trade.items[0].item.id === 'emerald');
check('emeralds moved into payment', m.trade.items[0]?.item.id === 'emerald' && m.trade.items[0].count >= 9, `${m.trade.items[0]?.item.id} ${m.trade.items[0]?.count}`);
check('bookshelf result', m.trade.items[2]?.item.id === 'bookshelf');
const emeraldsInv = p.inventory.main.filter((s) => s?.item.id === 'emerald').reduce((a, s) => a + s.count, 0);
check('all emeralds went to the slot', emeraldsInv === 0, `${emeraldsInv} left in inventory, ${m.trade.items[0]?.count} in slot`);

// demand: an offer bought past its stock costs more after a restock
const o = v.offers[0];
o.uses = 16;
check('sold out', o.isOutOfStock());
m.trade.set(1, ItemStack.of('paper', 30));
m.trade.set(0, null);
check('sold-out offer gives nothing', !m.trade.items[2]);
v.restock();
check('restocked', o.uses === 0 && o.demand === 16, `demand ${o.demand}`);
check('price up with demand', o.costA().count === 24 + Math.floor(24 * 16 * 0.05), String(o.costA().count));

// close: payments come back, trading stops
m.removed();
check('trading stops on close', !v.isTrading());
check('payment slots emptied', !m.trade.items[0] && !m.trade.items[1]);
const paper = p.inventory.main.filter((s) => s?.item.id === 'paper').reduce((a, s) => a + s.count, 0);
check('paper back in inventory', paper === 16 + 30, String(paper));

// level up: 10 xp for apprentice, after trading ends and 40 ticks
v.offers[0].uses = 0;
v.xp = 9;
v.tradingPlayer = p;
v.notifyTrade(v.offers[0]);
v.stopTrading();
for (let i = 0; i < 45; i++) level.tick();
check('levelled up to apprentice', v.merchantLevel === 2, `level ${v.merchantLevel} xp ${v.xp}`);
check('two more offers', v.getOffers().length === 4, String(v.getOffers().length));

// a baby shakes its head
const baby = new vil.Villager(level);
baby.moveTo(3.5, 64, 0.5, 0, 0);
baby.finalizeSpawn('egg');
baby.setAge(-24000);
level.addEntity(baby);
sounds.length = 0;
opened = null;
check('baby refuses', baby.interact(p, null, true) && !opened && baby.unhappyCounter > 0 && sounds.includes('entity.villager.no'));

// kicked out of bed
world.setState(-8, 64, 0, getBlock('red_bed').state({ part: 'head', facing: 'north' }));
world.setState(-8, 64, 1, getBlock('red_bed').state({ part: 'foot', facing: 'north' }));
level.dayTime = 13000;
v.updateActivityFromSchedule(level.gameTime, true);
v.moveTo(-7.5, 64, 0.5, 0, 0);
v.startSleeping([-8, 64, 0]);
p.moveTo(-7.5, 64, 2.5, 180, 0);
for (let i = 0; i < 5; i++) level.tick();
const occ = () => { const st = world.getState(-8, 64, 0); return getBlock('red_bed').get(st, 'occupied'); };
check('villager asleep, bed occupied', v.isSleeping() && occ());
const msgs = [];
sleep.useBed({ level, player: p, overlay: (m) => msgs.push(m), chat() {} }, -8, 64, 1);
check('player click wakes the villager', !v.isSleeping() && !occ() && !p.isSleeping() && !msgs.length, msgs.join());
await close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
