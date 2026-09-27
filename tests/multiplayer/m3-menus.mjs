// Multiplayer M3: a guest's inventory and the menus of the blocks and entities it uses, the host deciding (vanilla
// ServerPlayer.openMenu and its ContainerSynchronizer, ServerGamePacketListenerImpl.handleContainerClick /
// ButtonClick / Close, handleRenameItem, handleSelectTrade, handleContainerSlotStateChanged, handlePlaceRecipe,
// handleEditBook; the client's MultiPlayerGameMode.handleInventoryMouseClick). A click is made at once in the guest's
// own copy of the menu, and by the host for real, which sends back whatever came out otherwise; so after each step
// what the guest shows is what the host has, slot for slot. The inventory's 2x2 grid, a crafting table's, chests and
// barrels (and two players in one at once), shulker boxes, a chest minecart, furnaces, the brewing stand, enchanting
// table, anvil, grindstone, a villager's trades, the stonecutter, smithing table, loom, cartography table, a lectern's
// book, dispensers, droppers, hoppers, a crafter's switches and a horse's inventory; books written in and signed; an
// item eaten or a bow drawn, as the guest and the others see it.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/game/openMenu.ts', '/src/net/menus.ts', '/src/net/client/clientMenus.ts', '/src/net/server/menuSync.ts',
  '/src/inventory/container.ts', '/src/inventory/menus.ts', '/src/inventory/enchantMenus.ts', '/src/inventory/merchantMenu.ts', '/src/inventory/recipeBook.ts',
  '/src/inventory/stonecutterMenu.ts', '/src/inventory/loomMenu.ts', '/src/inventory/lecternMenu.ts', '/src/inventory/crafterMenu.ts',
  '/src/inventory/horseMenu.ts', '/src/inventory/smithingMenu.ts', '/src/inventory/shulkerBoxMenu.ts', '/src/inventory/cartographyMenu.ts',
  '/src/inventory/dispenserMenu.ts', '/src/inventory/hopperMenu.ts', '/src/entity/villager.ts', '/src/entity/trading.ts', '/src/game/books.ts',
  '/src/game/villageBlocks.ts', '/src/game/crafter.ts', '/src/game/redstone/dispenser.ts', '/src/game/redstone/hopper.ts', '/src/game/shulkerBox.ts',
  '/src/entity/shield.ts', '/src/item/crossbow.ts',
]);

const host = flatHost(m, 6, { guestGameMode: 'survival', gameMode: 'survival' });
const lvl = host.level;
const a = makeGuest(host, 'Alex', { viewDistance: 4 });
const b = makeGuest(host, 'Steve', { viewDistance: 4 });
// (what the guests' games show: the menus the host opens, and the books)
for (const g of [a, b]) {
  g.shown = [];
  g.hidden = [];
  g.books = [];
  g.ghosts = [];
  g.session.hooks.openMenu = (menu) => g.shown.push(menu);
  g.session.hooks.closeMenu = (menu) => g.hidden.push(menu);
  g.session.hooks.openBook = (hand) => g.books.push(hand);
  g.session.hooks.ghostRecipe = (menu, r) => g.ghosts.push(r);
}
// (the host's own game shows a guest's menu to its guest, as Game.showMenu does)
m.setShowMenu((p, menu) => host.server.showMenu(p, menu));
m.installMenuHooks();
m.setVillageMenuHook((kind, x, y, z, p) => {
  const menu = m.blockMenu(lvl, p, kind, x, y, z);
  if (menu) host.server.showMenu(p, menu);
});
m.setShulkerBoxMenuHook((menu) => host.server.showMenu(menu.player, menu));
lvl.onOpenMerchant = (v, p) => host.server.showMenu(p, new m.MerchantMenu(p, v));
m.setItemGuiHook((p, _s, hand) => host.server.openBook(p, hand));
step(host, 40);
const ha = hostCopy(host, a), hb = hostCopy(host, b);
const sess = (g) => host.server.sessionOf(hostCopy(host, g));
const key = (s) => m.stackKey(s);
const S = (id, n = 1) => m.ItemStack.of(id, n);
const heard = (g, name) => g.level.sounds.filter((s) => s.name === name).length;

/** put the guest's player at (x, z), a few blocks a tick, as it would walk there */
function walkTo(g, x, z) {
  for (let k = 0; k < 40; k++) {
    const p = g.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 1e-9) break;
    const f = Math.min(1, 4 / d);
    p.moveTo(p.x + dx * f, 64, p.z + dz * f, p.yaw, p.pitch);
    step(host, 1);
  }
  step(host, 3);
}
/** the guest's player looking at (x, y, z) */
function lookAt(g, x, y, z) {
  const p = g.player, eye = p.y + p.eyeHeight;
  const tx = x - p.x, ty = y - eye, tz = z - p.z;
  p.yaw = (Math.atan2(-tx, tz) * 180) / Math.PI;
  p.pitch = (-Math.atan2(ty, Math.hypot(tx, tz)) * 180) / Math.PI;
}
/** a press of the use button (with `target`'s copy under the crosshair) */
function use(g, target = null) {
  g.session.input(false, false, true, false, target);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 3);
}
/** the guest uses the block at (x, y, z): the menu the host opened for it, as its game has it */
function openAt(g, x, y, z) {
  lookAt(g, x + 0.5, y + 0.5, z + 0.5);
  step(host, 2);
  use(g);
  return g.session.menus.open?.menu ?? null;
}
/** the block `name` at (x, y, z), and its block entity */
function put(name, x, y, z) {
  lvl.setBlock(x, y, z, m.S(name));
  return lvl.world.getBlockEntity(x, y, z);
}
/** the host's copy of `g`'s player given `stack` in inventory slot `i` */
function give(g, i, stack) {
  const inv = hostCopy(host, g).inventory;
  if (i < 36) inv.main[i] = stack;
  else if (i < 40) inv.armor[i - 36] = stack;
  else inv.offhand = stack;
  inv.version++;
  step(host, 2);
}
/** whether what `g` shows of its open menu (or its inventory's) is the host's, slot for slot, and its cursor */
function same(g, label) {
  const gm = g.session.menus.open?.menu ?? g.session.menus.inventory;
  const hm = sess(g).menus.menu;
  const out = [];
  if (gm.slots.length !== hm.slots.length) out.push(`${gm.slots.length} slots vs ${hm.slots.length}`);
  else for (let i = 0; i < gm.slots.length; i++) if (key(gm.slots[i].item) !== key(hm.slots[i].item)) out.push(`${i}: ${key(gm.slots[i].item) || '-'} vs ${key(hm.slots[i].item) || '-'}`);
  if (key(gm.carried) !== key(hm.carried)) out.push(`cursor: ${key(gm.carried) || '-'} vs ${key(hm.carried) || '-'}`);
  const gi = g.player.inventory, hi = hostCopy(host, g).inventory;
  for (let i = 0; i < 41; i++) {
    const x = i < 36 ? gi.main[i] : i < 40 ? gi.armor[i - 36] : gi.offhand, y = i < 36 ? hi.main[i] : i < 40 ? hi.armor[i - 36] : hi.offhand;
    if (key(x) !== key(y)) out.push(`inventory ${i}: ${key(x) || '-'} vs ${key(y) || '-'}`);
  }
  check(`${label}: what ${g.name} shows is the host's`, !out.length, out.slice(0, 4).join('; '));
}
/** the menu's click, as the guest's screen makes it, and the tick after */
function click(g, menu, slot, button, type, n = 2) {
  menu.clicked(slot, button, type);
  step(host, n);
}
/** the guest's screen closed (Escape) */
function shut(g, menu) {
  menu.removed();
  step(host, 2);
}
const clear = (g) => {
  const inv = hostCopy(host, g).inventory;
  inv.main.fill(null);
  inv.armor.fill(null);
  inv.offhand = null;
  inv.version++;
  step(host, 2);
};

walkTo(a, 0.5, 0.5);
walkTo(b, 0.5, 3.5);

// ---------------------------------------------------------------------------
// the inventory's own menu (containerId 0): picking up and putting down, halves, shift-clicks, armour, the 2x2 grid,
// dragging, a double-click, the number keys and F, throwing out, and what's in the grid and on the cursor put back
// when it's closed
{
  const inv = a.session.menus.inventory;
  give(a, 0, S('oak_log', 10));
  give(a, 1, S('iron_chestplate'));
  same(a, 'inventory: given by the host');
  click(a, inv, 36, 0, 'pickup');
  check('inventory: a stack picked up, on the cursor', key(inv.carried) === key(S('oak_log', 10)) && !a.player.inventory.main[0]);
  check('inventory: and on the host\'s', key(sess(a).menus.inventory.carried) === key(S('oak_log', 10)) && !ha.inventory.main[0]);
  click(a, inv, 10, 1, 'pickup');
  check('inventory: a right-click puts one down', ha.inventory.main[10]?.count === 1 && sess(a).menus.inventory.carried?.count === 9);
  click(a, inv, 11, 0, 'pickup');
  same(a, 'inventory: the rest put down');
  click(a, inv, 11, 1, 'pickup');
  check('inventory: a right-click on a stack picks up half', ha.inventory.main[11]?.count === 4 && sess(a).menus.inventory.carried?.count === 5, `${ha.inventory.main[11]?.count}`);
  click(a, inv, 11, 0, 'pickup');
  same(a, 'inventory: (put back)');
  // shift-click: the chestplate onto the body; logs from the inventory to the hotbar
  click(a, inv, 37, 0, 'quick_move');
  check('inventory: a shift-clicked chestplate goes on', ha.inventory.armor[2]?.item.id === 'iron_chestplate' && a.player.inventory.armor[2]?.item.id === 'iron_chestplate');
  click(a, inv, 10, 0, 'quick_move');
  check('inventory: a shift-click from the inventory goes to the hotbar', ha.inventory.main.slice(0, 9).some((s) => s?.item.id === 'oak_log' && s.count === 1));
  same(a, 'inventory: shift-clicks');
  // the 2x2 grid: a log makes four planks; a shift-click on the result makes all it can
  clear(a);
  give(a, 0, S('oak_log', 3));
  click(a, inv, 36, 0, 'pickup');
  click(a, inv, 1, 0, 'pickup');
  check('grid: a log in the 2x2 grid, planks in the result (the host\'s)', sess(a).menus.inventory.craft.items[0]?.count === 3 && sess(a).menus.inventory.result.items[0]?.item.id === 'oak_planks');
  check('grid: and the guest\'s', inv.slots[0].item?.item.id === 'oak_planks' && inv.slots[0].item.count === 4);
  click(a, inv, 0, 0, 'quick_move');
  check('grid: a shift-click on the result crafts all it can', ha.inventory.main.filter(Boolean).reduce((n, s) => n + (s.item.id === 'oak_planks' ? s.count : 0), 0) === 12 && !sess(a).menus.inventory.craft.items[0]);
  same(a, 'grid: after crafting');
  // a log left in the grid and one on the cursor go back when the screen closes (vanilla InventoryMenu.removed)
  give(a, 5, S('birch_log', 2));
  click(a, inv, 41, 0, 'pickup');
  click(a, inv, 2, 1, 'pickup');
  shut(a, inv);
  check('grid: closed, what was in the grid and on the cursor is back in the inventory', ha.inventory.main.filter(Boolean).reduce((n, s) => n + (s.item.id === 'birch_log' ? s.count : 0), 0) === 2 && !sess(a).menus.inventory.craft.items[1] && !sess(a).menus.inventory.carried);
  same(a, 'grid: closed');
  // dragging (vanilla quick craft): 9 sticks spread over three slots, three each
  clear(a);
  give(a, 0, S('stick', 9));
  click(a, inv, 36, 0, 'pickup', 0);
  click(a, inv, -999, m.quickcraftMask(0, 0), 'quick_craft', 0);
  for (const i of [18, 19, 20]) click(a, inv, i, m.quickcraftMask(1, 0), 'quick_craft', 0);
  click(a, inv, -999, m.quickcraftMask(2, 0), 'quick_craft');
  check('drag: nine sticks spread three to a slot', [18, 19, 20].every((i) => ha.inventory.main[i]?.count === 3) && !sess(a).menus.inventory.carried);
  same(a, 'drag');
  // a double-click gathers them up again (vanilla PICKUP_ALL)
  click(a, inv, 18, 0, 'pickup', 0);
  click(a, inv, 18, 0, 'pickup_all');
  check('double-click: the rest gathered onto the cursor', sess(a).menus.inventory.carried?.count === 9 && !ha.inventory.main[19] && !ha.inventory.main[20]);
  click(a, inv, 36, 0, 'pickup');
  // the number keys and F over a slot (vanilla SWAP)
  give(a, 20, S('apple', 3));
  click(a, inv, 20, 4, 'swap');
  check('swap: the 5 key over a slot swaps it with hotbar slot 5', ha.inventory.main[4]?.item.id === 'apple' && !ha.inventory.main[20]);
  click(a, inv, 40, 40, 'swap');
  check('swap: F puts it in the offhand', ha.inventory.offhand?.item.id === 'apple' && a.player.inventory.offhand?.item.id === 'apple');
  same(a, 'swap');
  // throwing out: Q over a slot, and the cursor's stack dropped outside the window
  const items = () => lvl.entities.filter((e) => e.type === 'item' && !e.removed);
  const had = items().length;
  click(a, inv, 36, 0, 'throw');
  check('throw: Q over a slot throws one out into the host\'s world', items().length === had + 1 && ha.inventory.main[0]?.count === 8);
  click(a, inv, 36, 0, 'pickup');
  click(a, inv, -999, 0, 'pickup');
  check('throw: a stack let go of outside the window lands in the world', items().length === had + 2 && !sess(a).menus.inventory.carried && !ha.inventory.main[0]);
  const copies = new Set(items().map((e) => copyOf(a, e)));
  check('throw: the guest\'s own game drops nothing of its own', a.level.entities.every((e) => e.type !== 'item' || copies.has(e)) && copies.size === 2 && !copies.has(null));
  same(a, 'throw');
  shut(a, inv);
  for (const e of items()) e.remove();
  step(host, 2);
}

// ---------------------------------------------------------------------------
// a chest (vanilla ChestBlock.useWithoutItem → ChestMenu): opened by the host for the guest, its lid heard by everyone
// near; taken out of and put into; a second guest in it at once, each seeing the other's changes and the host's own,
// both clicking the same stack; out of reach, it's closed (and the lid stays up while the other's still in it);
// broken, it's closed; the last one out, or gone, shuts the lid
{
  const be = put('chest', 2, 64, 0);
  be.container.set(0, S('diamond', 5));
  be.container.set(13, S('bread', 7));
  step(host, 2);
  const opened = (g) => heard(g, 'block.chest.open'), closed = (g) => heard(g, 'block.chest.close');
  const [a0, b0] = [opened(a), opened(b)];
  const gm = openAt(a, 2, 64, 0);
  const hm = sess(a).menus.menu;
  check('chest: the host opened a chest menu for the guest', hm instanceof m.ChestMenu && hm.chest === be && be.openCount === 1);
  check('chest: and its game shows a copy of its own', gm instanceof m.ChestMenu && gm !== hm && a.shown.at(-1) === gm && gm.slots.length === 63 && gm.title === 'Chest');
  same(a, 'chest: opened');
  check('chest: its lid heard by both guests', opened(a) === a0 + 1 && opened(b) === b0 + 1);
  click(a, gm, 0, 0, 'pickup');
  check('chest: the diamonds taken out onto the cursor', !be.container.get(0) && hm.carried?.count === 5);
  click(a, gm, 27, 0, 'pickup');
  check('chest: and put in the inventory (menu slot 27, inventory 9)', ha.inventory.main[9]?.count === 5 && a.player.inventory.main[9]?.count === 5);
  same(a, 'chest: taken out');
  const gb = openAt(b, 2, 64, 0);
  check('chest: a second guest opens it too, the lid heard only the once', be.openCount === 2 && gb instanceof m.ChestMenu && opened(a) === a0 + 1 && sess(b).menus.menu.chest === be);
  same(b, 'chest: opened by the second');
  click(a, gm, 13, 0, 'quick_move');
  check('chest: bread shift-clicked out by the first', !be.container.get(13) && a.player.inventory.main.some((s) => s?.item.id === 'bread'));
  check('chest: gone from the second\'s copy', !gb.slots[13].item);
  same(a, 'chest: shift-click');
  same(b, 'chest: the other\'s shift-click');
  click(b, gb, 30, 0, 'quick_move');
  check('chest: nothing to shift-click, nothing done', !be.container.get(0));
  be.container.set(20, S('emerald', 3));
  step(host, 2);
  check('chest: emeralds put in by the host\'s world show in both copies', gm.slots[20].item?.item.id === 'emerald' && gb.slots[20].item?.item.id === 'emerald');
  // (both click the same stack in the same tick: the host takes the first; the second's cursor is put right)
  click(a, gm, 20, 0, 'pickup', 0);
  click(b, gb, 20, 0, 'pickup', 3);
  check('chest: two guests grabbing the same emeralds: the first\'s', hm.carried?.item.id === 'emerald' && gm.carried?.item.id === 'emerald' && !be.container.get(20));
  check('chest: and not the second\'s, whose copy is put right', !sess(b).menus.menu.carried && !gb.carried && !gb.slots[20].item);
  same(a, 'chest: the same stack, first');
  same(b, 'chest: the same stack, second');
  // (the first walks off with the emeralds on its cursor: past 8 blocks, the host closes its menu)
  walkTo(a, 12.5, 0.5);
  check('chest: out of reach, the host closes it for the guest', sess(a).menus.containerId === 0 && a.hidden.includes(gm) && !a.session.menus.open);
  check('chest: what was on its cursor back in its inventory', ha.inventory.main.some((s) => s?.item.id === 'emerald' && s.count === 3) && !sess(a).menus.menu.carried);
  same(a, 'chest: closed out of reach');
  check('chest: its lid still up for the second, not heard shutting', be.openCount === 1 && closed(b) === 0 && sess(b).menus.menu.chest === be);
  // (the second leaves it with Escape: the lid shuts, heard)
  shut(b, gb);
  check('chest: the last one out, the lid shuts, heard', be.openCount === 0 && closed(b) === 1 && sess(b).menus.containerId === 0);
  check('chest: closed by the guest, nothing sent back to close it', !b.hidden.includes(gb));
  // (broken while open: closed)
  walkTo(a, 0.5, 0.5);
  const gm2 = openAt(a, 2, 64, 0);
  check('chest: opened again', gm2 instanceof m.ChestMenu && be.openCount === 1);
  lvl.setBlock(2, 64, 0, 0);
  step(host, 2);
  check('chest: broken, its menu is closed', a.hidden.includes(gm2) && sess(a).menus.containerId === 0);
  for (const e of lvl.entities.filter((e) => e.type === 'item')) e.remove();
  step(host, 2);
}

// ---------------------------------------------------------------------------
// a barrel (its block opened, and shut again, for everyone), a shulker box (no box goes in a box), a chest minecart,
// a chest boat and a donkey's chest opened with the inventory key while riding them (vanilla OPEN_INVENTORY)
{
  const barrel = put('barrel', 0, 64, -2);
  barrel.container.set(4, S('gold_ingot', 2));
  step(host, 2);
  const gm = openAt(a, 0, 64, -2);
  const isOpen = (g, x, y, z) => { const st = g.world.getState(x, y, z); return m.BLOCKS[m.STATE_BLOCK[st]].get(st, 'open'); };
  check('barrel: opened for the guest, titled Barrel', gm instanceof m.ChestMenu && gm.title === 'Barrel' && sess(a).menus.menu.chest === barrel);
  check('barrel: open for everyone to see, and heard', isOpen(a, 0, 64, -2) === true && isOpen(b, 0, 64, -2) === true && heard(b, 'block.barrel.open') === 1);
  click(a, gm, 4, 0, 'quick_move');
  check('barrel: the gold shift-clicked out', !barrel.container.get(4) && ha.inventory.main.some((s) => s?.item.id === 'gold_ingot'));
  same(a, 'barrel');
  shut(a, gm);
  step(host, 2);
  check('barrel: shut again for everyone, heard', isOpen(b, 0, 64, -2) === false && heard(b, 'block.barrel.close') === 1);

  const box = put('shulker_box', -2, 64, 0);
  step(host, 2);
  clear(a);
  give(a, 0, S('red_shulker_box'));
  give(a, 1, S('cobblestone', 20));
  const gs = openAt(a, -2, 64, 0);
  check('shulker box: opened for the guest', gs instanceof m.ShulkerBoxMenu && sess(a).menus.menu instanceof m.ShulkerBoxMenu && box.openCount === 1);
  click(a, gs, 54, 0, 'pickup');
  click(a, gs, 0, 0, 'pickup');
  check('shulker box: a box won\'t go in a box, on the host or the guest', !box.container.get(0) && !gs.slots[0].item && sess(a).menus.menu.carried?.item.id === 'red_shulker_box' && gs.carried?.item.id === 'red_shulker_box');
  same(a, 'shulker box: refused');
  click(a, gs, 54, 0, 'pickup');
  click(a, gs, 55, 0, 'quick_move');
  check('shulker box: cobblestone shift-clicked in', box.container.get(0)?.item.id === 'cobblestone' && box.container.get(0).count === 20);
  same(a, 'shulker box');
  shut(a, gs);
  check('shulker box: its lid shuts', box.openCount === 0);
  lvl.setBlock(-2, 64, 0, 0);
  lvl.setBlock(0, 64, -2, 0);

  const cart = new m.MinecartChest(lvl);
  cart.moveTo(-1.5, 64, 1.5, 0, 0);
  lvl.addEntity(cart);
  cart.container.set(26, S('rail', 16));
  step(host, 4);
  use(a, copyOf(a, cart));
  const gc = a.session.menus.open?.menu;
  check('chest minecart: opened for the guest, titled as vanilla', gc instanceof m.ChestMenu && gc.title === 'Minecart with Chest' && sess(a).menus.menu.chest === cart);
  check('chest minecart: its rails there', gc?.slots[26].item?.item.id === 'rail' && gc.slots[26].item.count === 16);
  click(a, gc, 26, 0, 'quick_move');
  check('chest minecart: the rails taken', !cart.container.get(26) && ha.inventory.main.some((s) => s?.item.id === 'rail'));
  same(a, 'chest minecart');
  cart.remove();
  step(host, 2);
  check('chest minecart: gone, its menu closed', a.hidden.includes(gc) && sess(a).menus.containerId === 0);

  const boat = m.createBoat('chest_boat', lvl);
  boat.moveTo(-1.5, 64, -1.5, 0, 0);
  lvl.addEntity(boat);
  boat.container.set(0, S('cod', 3));
  step(host, 4);
  use(a, copyOf(a, boat));
  check('chest boat: the guest gets in', ha.vehicle === boat && a.player.vehicle === copyOf(a, boat));
  a.session.openVehicleInventory();
  step(host, 3);
  const gb = a.session.menus.open?.menu;
  check('chest boat: the inventory key while in it opens its chest', gb instanceof m.ChestMenu && sess(a).menus.menu.chest === boat && gb.slots[0].item?.item.id === 'cod');
  same(a, 'chest boat');
  shut(a, gb);
  a.player.input.sneak = true;
  step(host, 4);
  a.player.input.sneak = false;
  step(host, 4);
  check('chest boat: (out again)', !ha.vehicle);
  boat.remove();

  const donkey = new m.Donkey(lvl);
  donkey.moveTo(1.5, 64, -1.5, 0, 0);
  donkey.tamed = true;
  donkey.hasChest = true;
  donkey.equipSaddle(S('saddle'), false);
  lvl.addEntity(donkey);
  give(a, 9, S('cobblestone', 8));
  step(host, 4);
  a.session.openVehicleInventory();
  step(host, 3);
  check('donkey: the inventory key while riding nothing opens nothing', !a.session.menus.open && sess(a).menus.containerId === 0);
  use(a, copyOf(a, donkey));
  check('donkey: the guest gets on', ha.vehicle === donkey && a.player.vehicle === copyOf(a, donkey));
  a.session.openVehicleInventory();
  step(host, 3);
  const gd = a.session.menus.open?.menu;
  check('donkey: the inventory key while riding opens its inventory, a chest of 15', gd instanceof m.HorseInventoryMenu && gd.horse === copyOf(a, donkey) && gd.columns === 5 && gd.slots.length === 2 + 15 + 36);
  check('donkey: the host has the same menu open', sess(a).menus.menu instanceof m.HorseInventoryMenu && sess(a).menus.menu.horse === donkey);
  same(a, 'donkey: opened');
  const cob = gd.slots.findIndex((sl, i) => i >= gd.horseSlots && sl.item?.item.id === 'cobblestone');
  click(a, gd, cob, 0, 'quick_move');
  check('donkey: cobblestone shift-clicked into its chest', cob > 0 && donkey.inventory.items.some((s) => s?.item.id === 'cobblestone' && s.count === 8) && !ha.inventory.main[9]);
  same(a, 'donkey: its chest');
  click(a, gd, 0, 0, 'pickup');
  check('donkey: its saddle taken off, by the host', !donkey.saddled && sess(a).menus.menu.carried?.item.id === 'saddle');
  step(host, 2);
  check('donkey: and the guest\'s copy is unsaddled too', !copyOf(a, donkey).saddled);
  click(a, gd, 0, 0, 'pickup');
  check('donkey: saddled again', donkey.saddled && copyOf(a, donkey).saddled);
  same(a, 'donkey: saddle');
  shut(a, gd);
  a.player.input.sneak = true;
  step(host, 4);
  a.player.input.sneak = false;
  step(host, 4);
  donkey.remove();
  walkTo(a, 0.5, 0.5);
  clear(a);
}

// ---------------------------------------------------------------------------
// a crafting table (its 3x3 grid, a shift-click on the result, the recipe book filling the grid from the inventory, or
// showing a recipe in outline without the ingredients), a furnace (its flame and arrow as the host's, what it smelted
// taken with its experience, given once), and a brewing stand's fuel
{
  const inv = () => ha.inventory.main.filter(Boolean).map((s) => `${s.item.id}x${s.count}`).join(',');
  const count = (id) => ha.inventory.main.reduce((n, s) => n + (s?.item.id === id ? s.count : 0), 0);
  clear(a);
  put('crafting_table', 2, 64, 0);
  give(a, 0, S('oak_planks', 4));
  const gm = openAt(a, 2, 64, 0);
  const hm = sess(a).menus.menu;
  check('crafting table: opened for the guest', gm instanceof m.CraftingMenu && hm instanceof m.CraftingMenu && gm.slots.length === 46);
  click(a, gm, 37, 0, 'pickup');
  click(a, gm, 1, 1, 'pickup');
  click(a, gm, 4, 1, 'pickup');
  click(a, gm, 37, 0, 'pickup');
  check('crafting table: two planks, one above the other: sticks (the host\'s)', hm.result.items[0]?.item.id === 'stick' && hm.result.items[0].count === 4);
  check('crafting table: and the guest\'s', gm.slots[0].item?.item.id === 'stick' && gm.slots[0].item.count === 4);
  same(a, 'crafting table: the grid');
  click(a, gm, 0, 0, 'quick_move');
  check('crafting table: the sticks shift-clicked out', count('stick') === 4 && !hm.craft.items[0] && !hm.craft.items[3] && count('oak_planks') === 2, inv());
  same(a, 'crafting table: crafted');
  // the recipe book: what the guest holds unlocks recipes on the host (vanilla's recipe advancements), its game told
  // with a toast for each; the recipe book's clicks count only for those (m3-security.mjs)
  const before = new Set(sess(a).recipes.known);
  const spare = ha.inventory.main.findIndex((s, i) => i >= 9 && !s);
  give(a, spare, S('gunpowder'));
  const fresh = [...sess(a).recipes.known].filter((id) => !before.has(id));
  check('recipe book: gunpowder held unlocks TNT and the rest it makes, on the host', !before.has('tnt') && fresh.includes('tnt'), fresh.join(','));
  check('recipe book: the guest\'s game told, with their toasts', fresh.every((id) => a.recipes.has(id) && a.toasts.includes(id)));
  check('recipe book: the guest\'s is the host\'s, recipe for recipe', a.recipes.size === sess(a).recipes.known.size && [...a.recipes].every((id) => sess(a).recipes.known.has(id)), `${a.recipes.size} ${sess(a).recipes.known.size}`);
  check('recipe book: the other guest, who never held gunpowder, hasn\'t TNT', !sess(b).recipes.known.has('tnt') && !b.recipes.has('tnt'));
  give(a, spare, null);
  // the recipe book: torches, without coal (shown in outline), then with it
  a.session.placeRecipe(gm, 'torch', false);
  step(host, 3);
  check('recipe book: no coal, the torch shown in outline', a.ghosts.at(-1) === 'torch' && !hm.craft.items.some(Boolean));
  give(a, 5, S('coal', 3));
  a.session.placeRecipe(gm, 'torch', false);
  step(host, 3);
  check('recipe book: with coal, one torch\'s worth put in the grid by the host', hm.craft.items.filter(Boolean).length === 2 && hm.result.items[0]?.item.id === 'torch' && count('coal') === 2 && count('stick') === 3, hm.craft.items.map((s) => s?.item.id ?? '-').join(','));
  same(a, 'recipe book: placed');
  a.session.placeRecipe(gm, 'torch', true);
  step(host, 3);
  check('recipe book: shift: as many as can be', hm.craft.items.filter(Boolean).every((s) => s.count === 3) && count('coal') === 0 && count('stick') === 1, hm.craft.items.map((s) => s ? `${s.item.id}x${s.count}` : '-').join(','));
  same(a, 'recipe book: all');
  a.session.placeRecipe(gm, 'iron_ingot_from_smelting_raw_iron', false);
  a.session.placeRecipe(gm, 'no_such_recipe', false);
  step(host, 3);
  check('recipe book: a furnace\'s recipe, or one there isn\'t, does nothing in a crafting table', hm.craft.items.filter(Boolean).every((s) => s.count === 3) && a.session.state === 'play');
  shut(a, gm);
  check('crafting table: closed, what was in the grid back in the inventory', count('coal') === 3 && count('stick') === 4 && !hm.craft.items.some(Boolean), inv());
  same(a, 'crafting table: closed');
  lvl.setBlock(2, 64, 0, 0);

  // a furnace
  const fbe = put('furnace', 0, 64, -2);
  clear(a);
  give(a, 0, S('raw_iron', 2));
  give(a, 1, S('coal', 1));
  const gf = openAt(a, 0, 64, -2);
  const hf = sess(a).menus.menu;
  check('furnace: opened for the guest', gf instanceof m.FurnaceMenu && hf instanceof m.FurnaceMenu && hf.furnace === fbe && gf.slots.length === 39);
  click(a, gf, 30, 0, 'quick_move');
  click(a, gf, 31, 0, 'quick_move');
  check('furnace: the raw iron shift-clicked into its top, the coal into its fuel (and lit)', fbe.container.get(0)?.item.id === 'raw_iron' && count('coal') === 0 && fbe.isLit, `${key(fbe.container.get(0))} ${key(fbe.container.get(1))}`);
  same(a, 'furnace: filled');
  step(host, 20);
  check('furnace: burning, its flame and arrow the host\'s', fbe.litTime > 0 && gf.furnace.litTime === fbe.litTime && gf.furnace.litDuration === fbe.litDuration && gf.furnace.cookingProgress === fbe.cookingProgress && gf.furnace.cookingTotalTime === fbe.cookingTotalTime && gf.furnace.cookingProgress > 0, `${gf.furnace.litTime}/${fbe.litTime} ${gf.furnace.cookingProgress}/${fbe.cookingProgress}`);
  step(host, 200);
  check('furnace: an iron ingot smelted, shown', fbe.container.get(2)?.item.id === 'iron_ingot' && gf.slots[2].item?.item.id === 'iron_ingot');
  fbe.storedXp = 3;
  const xp0 = ha.xpTotal;
  click(a, gf, 2, 0, 'quick_move');
  check('furnace: the ingot taken, with its experience, once', count('iron_ingot') === 1 && ha.xpTotal === xp0 + 3 && a.player.xpTotal === ha.xpTotal && fbe.storedXp === 0, `${xp0} → ${ha.xpTotal} / ${a.player.xpTotal}`);
  same(a, 'furnace: taken');
  const ids = [...a.level.entities].filter((e) => e.type === 'experience_orb').length;
  check('furnace: no orbs of the guest\'s own', ids === 0);
  shut(a, gf);
  lvl.setBlock(0, 64, -2, 0);

  // a brewing stand
  const bbe = put('brewing_stand', -2, 64, 0);
  give(a, 2, S('blaze_powder', 2));
  give(a, 3, S('dirt', 1));
  const gb = openAt(a, -2, 64, 0);
  check('brewing stand: opened for the guest', gb instanceof m.BrewingStandMenu && sess(a).menus.menu.stand === bbe);
  const powder = gb.slots.findIndex((sl, i) => i >= 5 && sl.item?.item.id === 'blaze_powder');
  click(a, gb, powder, 0, 'quick_move');
  step(host, 2);
  check('brewing stand: blaze powder put in, its fuel bar the host\'s', bbe.fuel === 20 && gb.stand.fuel === 20 && bbe.container.get(4)?.count === 1, `${bbe.fuel} ${gb.stand.fuel}`);
  const dirt = gb.slots.findIndex((sl, i) => i >= 5 && sl.item?.item.id === 'dirt');
  click(a, gb, dirt, 0, 'pickup');
  click(a, gb, 0, 0, 'pickup');
  check('brewing stand: dirt won\'t go in a bottle\'s place', !bbe.container.get(0) && !gb.slots[0].item);
  click(a, gb, dirt, 0, 'pickup');
  same(a, 'brewing stand');
  shut(a, gb);
  lvl.setBlock(-2, 64, 0, 0);
  clear(a);
}

// ---------------------------------------------------------------------------
// the enchanting table (its three offers and their hints the host's, a button paid for in lapis and levels, one that
// can't be paid for not even sent), the anvil (a name typed, the result's cost, taken for levels), the grindstone (the
// enchantments ground off, their experience dropped in the host's world)
{
  clear(a);
  ha.xpLevel = 30;
  put('enchanting_table', 2, 64, 0);
  give(a, 0, S('iron_sword'));
  give(a, 1, S('lapis_lazuli', 3));
  const ge = openAt(a, 2, 64, 0);
  const he = sess(a).menus.menu;
  check('enchanting table: opened for the guest', ge instanceof m.EnchantmentMenu && he instanceof m.EnchantmentMenu && a.player.xpLevel === 30);
  click(a, ge, 29, 0, 'quick_move');
  click(a, ge, 30, 0, 'quick_move');
  check('enchanting table: sword and lapis in', he.enchantSlots.get(0)?.item.id === 'iron_sword' && he.enchantSlots.get(1)?.count === 3);
  check('enchanting table: the host\'s three offers shown, costs, hints and all', he.costs[0] > 0 && ge.costs.join() === he.costs.join() && ge.enchantClue.join() === he.enchantClue.join() && ge.levelClue.join() === he.levelClue.join() && ge.enchantmentSeed === he.enchantmentSeed, `${ge.costs} / ${he.costs}; ${ge.enchantClue} / ${he.enchantClue}`);
  same(a, 'enchanting table: offers');
  const cost = he.costs[0], seed = he.enchantmentSeed;
  check('enchanting table: the first offer taken', ge.clickMenuButton(0) === true);
  step(host, 3);
  const sword = he.enchantSlots.get(0);
  check('enchanting table: the sword enchanted by the host, a lapis and a level paid', sword?.tag?.enchantments && Object.keys(sword.tag.enchantments).length > 0 && he.enchantSlots.get(1)?.count === 2 && ha.xpLevel === 29 && a.player.xpLevel === 29, `${JSON.stringify(sword?.tag)} lapis ${he.enchantSlots.get(1)?.count} lvl ${ha.xpLevel}; cost ${cost}`);
  check('enchanting table: and shown so, with the next offers', key(ge.slots[0].item) === key(sword) && ge.enchantmentSeed === he.enchantmentSeed && he.enchantmentSeed !== seed);
  same(a, 'enchanting table: enchanted');
  // (the lapis taken out: no offer can be paid for, and nothing's sent)
  click(a, ge, 1, 0, 'quick_move');
  check('enchanting table: without lapis, an offer isn\'t taken', ge.clickMenuButton(0) === false);
  step(host, 3);
  check('enchanting table: (nothing changed on the host)', key(he.enchantSlots.get(0)) === key(sword) && ha.xpLevel === 29);
  click(a, ge, 0, 0, 'quick_move');
  same(a, 'enchanting table: emptied');
  shut(a, ge);
  lvl.setBlock(2, 64, 0, 0);

  // the anvil: a name
  const anvil = 'anvil';
  put(anvil, 0, 64, -2);
  give(a, 5, S('diamond', 2));
  const ga = openAt(a, 0, 64, -2);
  const hA = sess(a).menus.menu;
  check('anvil: opened for the guest', ga instanceof m.AnvilMenu && hA instanceof m.AnvilMenu);
  const dia = ga.slots.findIndex((sl, i) => i >= 3 && sl.item?.item.id === 'diamond');
  click(a, ga, dia, 0, 'quick_move');
  ga.setItemName('Shiny');
  step(host, 3);
  check('anvil: the name typed reaches the host: a renamed diamond, for a level', hA.itemName === 'Shiny' && hA.resultSlots.get(0)?.tag?.customName === 'Shiny' && hA.cost === 1, `${hA.itemName} ${JSON.stringify(hA.resultSlots.get(0)?.tag)} ${hA.cost}`);
  check('anvil: the guest shows the same, and the same cost', key(ga.slots[2].item) === key(hA.resultSlots.get(0)) && ga.cost === 1);
  const before = ha.xpLevel;
  click(a, ga, 2, 0, 'quick_move');
  check('anvil: the renamed diamonds taken, a level paid', ha.inventory.main.some((s) => s?.tag?.customName === 'Shiny' && s.count === 2) && ha.xpLevel === before - 1 && a.player.xpLevel === before - 1);
  same(a, 'anvil: taken');
  // (an anvil's wear is the host's to roll: the guest's copy of the world gets whatever the host's has)
  step(host, 2);
  check('anvil: the anvil as the host has it', a.world.getState(0, 64, -2) === lvl.world.getState(0, 64, -2));
  shut(a, ga);
  lvl.setBlock(0, 64, -2, 0);

  // the grindstone: the enchanted sword's enchantments ground off, for experience in the host's world
  put('grindstone', -2, 64, 0);
  give(a, 6, ha.inventory.main.find((s) => s?.tag?.enchantments).copy());
  const gg = openAt(a, -2, 64, 0);
  check('grindstone: opened for the guest', gg instanceof m.GrindstoneMenu && sess(a).menus.menu instanceof m.GrindstoneMenu);
  const sw = gg.slots.findIndex((sl, i) => i >= 3 && sl.item?.item.id === 'iron_sword');
  click(a, gg, sw, 0, 'quick_move');
  check('grindstone: the plain sword in its result', gg.slots[2].item?.item.id === 'iron_sword' && !gg.slots[2].item.tag?.enchantments && key(sess(a).menus.menu.slots[2].item) === key(gg.slots[2].item));
  const orbs = () => lvl.entities.filter((e) => e.type === 'experience_orb' && !e.removed).length;
  const o0 = orbs();
  click(a, gg, 2, 0, 'quick_move');
  check('grindstone: taken, the enchantments\' experience in orbs in the host\'s world', orbs() > o0 && ha.inventory.main.some((s) => s?.item.id === 'iron_sword' && !s.tag?.enchantments));
  const copies = new Set(lvl.entities.filter((e) => e.type === 'experience_orb').map((e) => copyOf(a, e)));
  check('grindstone: none of the guest\'s own, only its copies of the host\'s', a.level.entities.every((e) => e.type !== 'experience_orb' || copies.has(e)));
  same(a, 'grindstone');
  shut(a, gg);
  lvl.setBlock(-2, 64, 0, 0);
  for (const e of lvl.entities.filter((e) => e.type === 'experience_orb')) e.remove();
  step(host, 2);
  clear(a);
}

// ---------------------------------------------------------------------------
// a villager's trades (vanilla MerchantMenu and ClientboundMerchantOffersPacket): its offers shown as the host has them,
// an offer picked (its price put in from the inventory, vanilla ServerboundSelectTradePacket), the trade made, its use
// counted and its experience given, both shown; nobody else can trade with it meanwhile; closed, it stops trading
{
  clear(a);
  const v = new m.Villager(lvl);
  v.moveTo(2.5, 64, 0.5, 90, 0);
  v.profession = 'farmer';
  // (traded with before, so it keeps its profession without a job site: vanilla ResetProfession)
  v.xp = 5;
  v.setOffers([new m.MerchantOffer({ id: 'wheat', count: 20 }, null, S('emerald'), 16, 2, 0.05), new m.MerchantOffer({ id: 'emerald', count: 1 }, null, S('bread', 6), 16, 1, 0.05)]);
  lvl.addEntity(v);
  give(a, 0, S('wheat', 40));
  step(host, 4);
  use(a, copyOf(a, v));
  const gm = a.session.menus.open?.menu, hm = sess(a).menus.menu;
  check('villager: trading with the guest', v.tradingPlayer === ha && hm instanceof m.MerchantMenu && hm.trader === v);
  check('villager: its menu on the guest, named as the host names it', gm instanceof m.MerchantMenu && a.shown.at(-1) === gm);
  const offers = gm?.trader.getOffers() ?? [];
  check('villager: its offers as the host has them', offers.length === 2 && offers[0].costA().item.id === 'wheat' && offers[0].costA().count === 20 && offers[0].result.item.id === 'emerald' && offers[1].result.count === 6 && offers[0].maxUses === 16, JSON.stringify(offers.map((o) => [key(o.costA()), key(o.result), o.uses, o.maxUses])));
  check('villager: its level and experience', gm.trader.merchantLevel === v.merchantLevel && gm.trader.xp === v.xp, `${gm.trader.merchantLevel}/${v.merchantLevel} ${gm.trader.xp}/${v.xp}`);
  use(b, copyOf(b, v));
  check('villager: nobody else trades with it meanwhile', !b.session.menus.open && sess(b).menus.containerId === 0 && v.tradingPlayer === ha);
  gm.tryMoveItems(0);
  step(host, 3);
  check('villager: the offer picked, its price put in by the host', hm.trade.items[0]?.item.id === 'wheat' && hm.trade.items[0].count === 40 && hm.trade.items[2]?.item.id === 'emerald', key(hm.trade.items[0]));
  same(a, 'villager: offer picked');
  const xp0 = v.xp;
  click(a, gm, 2, 0, 'pickup');
  check('villager: the emerald bought, 20 wheat paid, the offer used once, the villager\'s experience up', hm.carried?.item.id === 'emerald' && hm.trade.items[0]?.count === 20 && v.getOffers()[0].uses === 1 && v.xp === xp0 + 2, `${key(hm.carried)} ${key(hm.trade.items[0])} ${v.getOffers()[0].uses} ${v.xp}`);
  step(host, 2);
  check('villager: the guest sees it used, its experience too', gm.trader.getOffers()[0].uses === 1 && gm.trader.xp === v.xp && gm.carried?.item.id === 'emerald');
  same(a, 'villager: traded');
  click(a, gm, 38, 0, 'pickup');
  shut(a, gm);
  check('villager: closed, it stops trading; the wheat left back in the inventory', v.tradingPlayer === null && ha.inventory.main.reduce((n, s) => n + (s?.item.id === 'wheat' ? s.count : 0), 0) === 20 && ha.inventory.main[8]?.item.id === 'emerald');
  same(a, 'villager: closed');
  v.remove();
  step(host, 2);
  clear(a);
}

// ---------------------------------------------------------------------------
// the job sites and the rest: a stonecutter's recipe and a loom's pattern picked (shown at once, and by the host,
// vanilla ServerboundContainerButtonClickPacket), a smithing table's netherite upgrade, a cartography table; a lectern's
// book (put on by a guest, its pages turned for everyone, its slot not the guest's to click, taken off, which closes
// it); a crafter's slots switched off and on (vanilla ServerboundContainerSlotStateChangedPacket), and a switched-on
// slot with something in it staying on; a dispenser's, a dropper's and a hopper's slots
{
  /** the menu's slot showing inventory slot `i` */
  const invSlot = (menu, i) => menu.slots.findIndex((sl) => sl.container instanceof m.PlayerContainer && sl.slot === i);
  /** the menu's slot showing the inventory's `id` */
  const invOf = (menu, id) => menu.slots.findIndex((sl) => sl.container instanceof m.PlayerContainer && sl.item?.item.id === id);
  clear(a);
  // the stonecutter
  put('stonecutter', 2, 64, 0);
  give(a, 0, S('stone', 3));
  const gs = openAt(a, 2, 64, 0), hs = sess(a).menus.menu;
  check('stonecutter: opened for the guest', gs instanceof m.StonecutterMenu && hs instanceof m.StonecutterMenu);
  click(a, gs, invSlot(gs, 0), 0, 'quick_move');
  const k = hs.recipes.findIndex((r) => r.result === 'stone_bricks' || r.result?.item?.id === 'stone_bricks' || r.output === 'stone_bricks');
  check('stonecutter: stone in, the same recipes to pick from', hs.recipes.length > 1 && gs.recipes.length === hs.recipes.length && k >= 0, `${hs.recipes.length} ${gs.recipes.length} ${k}`);
  check('stonecutter: a recipe picked, shown at once', gs.clickMenuButton(k) === true && gs.selectedRecipeIndex === k && gs.slots[1].item?.item.id === 'stone_bricks');
  step(host, 3);
  check('stonecutter: and by the host', hs.selectedRecipeIndex === k && hs.slots[1].item?.item.id === 'stone_bricks');
  click(a, gs, 1, 0, 'quick_move');
  check('stonecutter: the result shift-clicked: all three cut', ha.inventory.main.reduce((n, s) => n + (s?.item.id === 'stone_bricks' ? s.count : 0), 0) === 3 && !hs.slots[0].item);
  same(a, 'stonecutter');
  shut(a, gs);
  lvl.setBlock(2, 64, 0, 0);
  // the loom
  clear(a);
  put('loom', 0, 64, -2);
  give(a, 0, S('white_banner'));
  give(a, 1, S('red_dye', 2));
  const gl = openAt(a, 0, 64, -2), hl = sess(a).menus.menu;
  check('loom: opened for the guest', gl instanceof m.LoomMenu && hl instanceof m.LoomMenu);
  click(a, gl, invSlot(gl, 0), 0, 'quick_move');
  click(a, gl, invSlot(gl, 1), 0, 'quick_move');
  check('loom: banner and dye in, the same patterns to pick from', hl.selectablePatterns.length > 0 && gl.selectablePatterns.join() === hl.selectablePatterns.join());
  check('loom: a pattern picked, shown at once', gl.clickMenuButton(1) === true && gl.selectedBannerPatternIndex === 1 && gl.slots[3].item?.item.id === 'white_banner');
  step(host, 3);
  check('loom: and by the host, the same banner', hl.selectedBannerPatternIndex === 1 && key(hl.slots[3].item) === key(gl.slots[3].item) && !!hl.slots[3].item?.tag);
  click(a, gl, 3, 0, 'quick_move');
  check('loom: the patterned banner taken, a dye spent', ha.inventory.main.some((s) => s?.item.id === 'white_banner' && s.tag) && hl.inputContainer.get(1)?.count === 1);
  same(a, 'loom');
  shut(a, gl);
  lvl.setBlock(0, 64, -2, 0);
  // the smithing table
  clear(a);
  put('smithing_table', -2, 64, 0);
  give(a, 0, S('netherite_upgrade_smithing_template'));
  give(a, 1, S('diamond_sword'));
  give(a, 2, S('netherite_ingot'));
  const gsm = openAt(a, -2, 64, 0), hsm = sess(a).menus.menu;
  check('smithing table: opened for the guest', gsm instanceof m.SmithingMenu && hsm instanceof m.SmithingMenu);
  for (const i of [0, 1, 2]) click(a, gsm, invSlot(gsm, i), 0, 'quick_move');
  check('smithing table: template, sword and ingot in: a netherite sword, on both', hsm.slots[3].item?.item.id === 'netherite_sword' && gsm.slots[3].item?.item.id === 'netherite_sword');
  click(a, gsm, 3, 0, 'quick_move');
  check('smithing table: taken', ha.inventory.main.some((s) => s?.item.id === 'netherite_sword') && !hsm.slots[0].item && !hsm.slots[1].item && !hsm.slots[2].item);
  same(a, 'smithing table');
  shut(a, gsm);
  lvl.setBlock(-2, 64, 0, 0);
  // the cartography table
  clear(a);
  put('cartography_table', 2, 64, 0);
  give(a, 0, S('paper', 4));
  const gct = openAt(a, 2, 64, 0);
  check('cartography table: opened for the guest', gct instanceof m.CartographyTableMenu && sess(a).menus.menu instanceof m.CartographyTableMenu);
  click(a, gct, invSlot(gct, 0), 0, 'quick_move');
  check('cartography table: paper in', sess(a).menus.menu.slots[1].item?.item.id === 'paper');
  same(a, 'cartography table');
  shut(a, gct);
  check('cartography table: closed, the paper back', ha.inventory.main.some((s) => s?.item.id === 'paper' && s.count === 4));
  lvl.setBlock(2, 64, 0, 0);

  // a lectern: a written book put on by the guest, read, turned, taken
  clear(a);
  put('lectern', 0, 64, -2);
  const book = S('written_book');
  book.tag = { book: { title: 'Notes', author: 'Host', generation: 0, pages: ['one', 'two', 'three'] } };
  give(a, 0, book);
  a.player.inventory.selected = 0;
  sess(a).player.inventory.selected = 0;
  step(host, 2);
  lookAt(a, 0.5, 64.5, -1.5);
  step(host, 2);
  use(a);
  const lbe = lvl.world.getBlockEntity(0, 64, -2);
  check('lectern: the guest puts its book on it', lbe?.book?.item.id === 'written_book' && !ha.inventory.main[0]);
  check('lectern: and nothing opens yet', !a.session.menus.open);
  const glc = openAt(a, 0, 64, -2), hlc = sess(a).menus.menu;
  check('lectern: used again, its book opens for the guest', glc instanceof m.LecternMenu && hlc instanceof m.LecternMenu && glc.lectern.book?.tag?.book?.pages.length === 3 && glc.lectern.page === 0);
  let turned = 0;
  glc.onPageChanged = () => turned++;
  const t0 = heard(b, 'item.book.page_turn');
  glc.clickMenuButton(2);
  step(host, 3);
  check('lectern: the next page, turned by the host, shown and heard', lbe.page === 1 && glc.lectern.page === 1 && turned === 1 && heard(b, 'item.book.page_turn') === t0 + 1);
  glc.clickMenuButton(100 + 2);
  glc.clickMenuButton(100 + 3000);
  step(host, 3);
  check('lectern: a page jumped to, and one past the end is the last', lbe.page === 2 && glc.lectern.page === 2);
  click(a, glc, 0, 0, 'pickup');
  check('lectern: its book isn\'t the guest\'s to click out', lbe.book?.item.id === 'written_book' && glc.slots[0].item?.item.id === 'written_book' && !glc.carried && !hlc.carried);
  glc.clickMenuButton(3);
  step(host, 3);
  check('lectern: the book taken, into the inventory, the lectern empty', !lbe.book && ha.inventory.main.some((s) => s?.item.id === 'written_book') && a.player.inventory.main.some((s) => s?.item.id === 'written_book'));
  check('lectern: and with no book its menu closes', a.hidden.includes(glc) && sess(a).menus.containerId === 0);
  lvl.setBlock(0, 64, -2, 0);

  // a crafter
  clear(a);
  const cbe = put('crafter', -2, 64, 0);
  give(a, 0, S('oak_planks', 1));
  const gcr = openAt(a, -2, 64, 0), hcr = sess(a).menus.menu;
  check('crafter: opened for the guest', gcr instanceof m.CrafterMenu && hcr instanceof m.CrafterMenu && hcr.crafter === cbe);
  gcr.setSlotState(4, false);
  step(host, 3);
  check('crafter: a slot switched off, by the host, shown', cbe.isSlotDisabled(4) && gcr.crafter.isSlotDisabled(4));
  click(a, gcr, invSlot(gcr, 0), 0, 'pickup');
  click(a, gcr, 4, 0, 'pickup');
  check('crafter: nothing goes in a switched-off slot', !cbe.container.get(4) && !gcr.slots[4].item);
  click(a, gcr, 0, 0, 'pickup');
  check('crafter: something in another', cbe.container.get(0)?.item.id === 'oak_planks');
  gcr.setSlotState(0, false);
  step(host, 3);
  check('crafter: a slot with something in it can\'t be switched off', !cbe.isSlotDisabled(0) && !gcr.crafter.isSlotDisabled(0));
  gcr.setSlotState(4, true);
  step(host, 3);
  check('crafter: switched on again', !cbe.isSlotDisabled(4) && !gcr.crafter.isSlotDisabled(4));
  same(a, 'crafter');
  shut(a, gcr);
  lvl.setBlock(-2, 64, 0, 0);

  // a dispenser, a dropper and a hopper
  clear(a);
  give(a, 0, S('arrow', 16));
  for (const [kind, x, z] of [['dispenser', 2, 0], ['dropper', 0, -2], ['hopper', -2, 0]]) {
    const be = put(kind, x, 64, z);
    const g = openAt(a, x, 64, z), h = sess(a).menus.menu;
    check(`${kind}: opened for the guest, its slots`, g && h && g.constructor === h.constructor && g.slots.length === h.slots.length && sess(a).menus.containerId > 0 && a.session.menus.open?.kind === kind, `${a.session.menus.open?.kind}`);
    click(a, g, invOf(g, 'arrow'), 0, 'quick_move');
    check(`${kind}: the arrows shift-clicked in`, be.container.items.some((s) => s?.item.id === 'arrow' && s.count === 16));
    same(a, kind);
    click(a, g, 0, 0, 'quick_move');
    shut(a, g);
    lvl.setBlock(x, 64, z, 0);
  }
  clear(a);
}

// ---------------------------------------------------------------------------
// books: a book and quill used opens its screen on the guest (vanilla ClientboundOpenBookPacket); what's written in it
// is written by the host (vanilla ServerboundEditBookPacket), as plain text; signed, it's a written book by the guest
{
  clear(a);
  give(a, 0, S('writable_book'));
  a.player.inventory.selected = 0;
  sess(a).player.inventory.selected = 0;
  lookAt(a, a.player.x, a.player.y + 100, a.player.z + 1);
  step(host, 2);
  use(a);
  check('book: the guest\'s book and quill opens, in its main hand', a.books.at(-1) === 'main');
  a.session.editBook(0, ['Dear diary §4red', 'bell\u0007 and\nnew line'], null);
  step(host, 3);
  const pages = ha.inventory.main[0]?.tag?.pages;
  check('book: written in by the host, as plain text (no formatting, no control characters but new lines)', pages?.length === 2 && pages[0] === 'Dear diary 4red' && pages[1] === 'bell and\nnew line', JSON.stringify(pages));
  check('book: and the guest\'s own copy the same', key(a.player.inventory.main[0]) === key(ha.inventory.main[0]));
  a.session.editBook(0, ['The end'], '  §lMy Book  ');
  step(host, 3);
  const signed = ha.inventory.main[0];
  check('book: signed, a written book by the guest', signed?.item.id === 'written_book' && signed.tag?.book?.title === 'lMy Book' && signed.tag.book.author === 'Alex' && signed.tag.book.pages[0] === 'The end' && signed.tag.book.generation === 0, JSON.stringify(signed?.tag));
  check('book: and so on the guest', key(a.player.inventory.main[0]) === key(signed));
  a.session.editBook(0, ['again'], null);
  step(host, 3);
  check('book: a written book isn\'t written in again', key(ha.inventory.main[0]) === key(signed));
  use(a);
  check('book: the written book opens to be read', a.books.length === 2 && a.books[1] === 'main');
  lookAt(a, 2.5, 64.5, 0.5);
  clear(a);
}

// ---------------------------------------------------------------------------
// dying with a chest open: closed by the host, the lid shut, what was on the cursor dropped with the rest; a
// spectator's clicks are refused (vanilla: the whole menu sent back as it is); leaving with a chest open shuts its lid,
// and what the guest held on its cursor, or in its inventory's crafting grid, falls where it stood (vanilla
// dropOrPlaceInInventory for a player that's disconnected)
{
  const be = put('chest', 2, 64, 0);
  be.container.set(0, S('diamond', 4));
  step(host, 2);
  const gm = openAt(a, 2, 64, 0);
  click(a, gm, 0, 0, 'pickup');
  check('death: (the diamonds on the guest\'s cursor)', sess(a).menus.menu.carried?.item.id === 'diamond');
  const drops = () => lvl.entities.filter((e) => e.type === 'item' && !e.removed);
  ha.hurt(100, 'genericKill');
  step(host, 3);
  check('death: its chest closed by the host, told', a.hidden.includes(gm) && sess(a).menus.containerId === 0 && be.openCount === 0);
  check('death: the diamonds from its cursor dropped where it died', drops().some((e) => e.stack.item.id === 'diamond' && e.stack.count === 4) && !sess(a).menus.menu.carried);
  check('death: a dead guest\'s clicks do nothing', (a.session.menus.inventory.clicked(9, 0, 'pickup'), step(host, 2), true) && !sess(a).menus.inventory.carried);
  a.session.respawn();
  step(host, 4);
  for (const e of drops()) e.remove();
  walkTo(a, 0.5, 0.5);
  // (with keepInventory the rest is kept, but not what the menus held: vanilla drops that where the player died)
  lvl.gameRules.keepInventory = true;
  give(a, 9, S('oak_log', 3));
  give(a, 0, S('stick', 2));
  const ginv = a.session.menus.inventory;
  click(a, ginv, 9, 0, 'pickup');
  click(a, ginv, 1, 1, 'pickup');
  ha.hurt(100, 'genericKill');
  step(host, 3);
  const kept = drops().filter((e) => e.stack.item.id === 'oak_log').reduce((n, e) => n + e.stack.count, 0);
  check('death, keepInventory: the inventory kept, but what was in the grid and on the cursor dropped', kept === 3 && ha.inventory.main[0]?.item.id === 'stick' && !ha.inventory.main.some((s) => s?.item.id === 'oak_log'), `${kept} ${key(ha.inventory.main[0])}`);
  a.session.respawn();
  step(host, 4);
  lvl.gameRules.keepInventory = false;
  check('death, keepInventory: (back, with the sticks, the grid empty)', a.player.inventory.main[0]?.item.id === 'stick' && !sess(a).menus.inventory.craft.items.some(Boolean) && !a.player.inventory.main.some((s) => s?.item.id === 'oak_log'));
  for (const e of drops()) e.remove();
  clear(a);
  walkTo(a, 0.5, 0.5);

  // a spectator's clicks
  be.container.set(0, S('diamond', 4));
  const gm2 = openAt(a, 2, 64, 0);
  check('spectator: (the chest open)', gm2 instanceof m.ChestMenu && be.openCount === 1);
  ha.setGameMode('spectator');
  step(host, 3);
  check('spectator: (the guest a spectator)', a.player.gameMode === 'spectator');
  click(a, gm2, 0, 0, 'pickup', 3);
  check('spectator: its click refused: the diamonds still in the chest, and shown there again', be.container.get(0)?.count === 4 && gm2.slots[0].item?.count === 4 && !gm2.carried && !sess(a).menus.menu.carried);
  shut(a, gm2);
  ha.setGameMode('survival');
  step(host, 3);

  // leaving with a chest open: the diamonds on the cursor fall where it stood
  const c = makeGuest(host, 'Sam', { viewDistance: 4 });
  step(host, 20);
  const hc = hostCopy(host, c);
  walkTo(c, 0.5, -1.5);
  lookAt(c, 2.5, 64.5, 0.5);
  step(host, 2);
  use(c);
  const gc = c.session.menus.open?.menu;
  check('leaving: (Sam has the chest open)', gc instanceof m.ChestMenu && be.openCount === 1);
  click(c, gc, 0, 0, 'pickup');
  const shut0 = heard(a, 'block.chest.close');
  c.session.leave();
  step(host, 3);
  check('leaving: its lid shuts, heard', be.openCount === 0 && heard(a, 'block.chest.close') === shut0 + 1);
  const fell = drops().find((e) => e.stack.item.id === 'diamond');
  check('leaving: the diamonds on its cursor fall where it stood', fell && fell.stack.count === 4 && Math.hypot(fell.x - hc.x, fell.z - hc.z) < 1.5);
  for (const e of drops()) e.remove();
  // leaving with its inventory's crafting grid in use
  const d = makeGuest(host, 'Kim', { viewDistance: 4 });
  step(host, 20);
  const hd = hostCopy(host, d);
  hd.inventory.main[0] = S('oak_log', 3);
  hd.inventory.version++;
  step(host, 2);
  const dinv = d.session.menus.inventory;
  click(d, dinv, 36, 0, 'pickup');
  click(d, dinv, 1, 1, 'pickup');
  check('leaving: (a log in Kim\'s grid, two on its cursor)', sess(d).menus.inventory.craft.items[0]?.count === 1 && sess(d).menus.inventory.carried?.count === 2);
  d.session.leave();
  step(host, 3);
  const logs = drops().filter((e) => e.stack.item.id === 'oak_log').reduce((n, e) => n + e.stack.count, 0);
  check('leaving: what was in its grid and on its cursor falls where it stood', logs === 3 && hd.inventory.main.every((s) => !s || s.item.id !== 'oak_log'));
  for (const e of drops()) e.remove();
  lvl.setBlock(2, 64, 0, 0);
  step(host, 2);
}

// ---------------------------------------------------------------------------
// using an item over time (vanilla LivingEntity.startUsingItem on the server, its DATA_LIVING_ENTITY_FLAGS for the
// others): the guest eats as the host has it, slowed as it eats, heard munching by the others, who see it eat; the
// bread gone and the food bar up at the end; a bow drawn and let go, the arrow the host's; a crossbow; a trident
// thrown; a shield raised in the offhand, blocking as the others see it
{
  clear(a);
  const mirror = (g, p) => g.session.mirrors.get(p.id);
  const hold = (g, on) => g.session.input(false, false, on, on, null);
  const walked = (g, ticks) => {
    const x0 = g.player.x, z0 = g.player.z;
    g.player.input.forward = true;
    step(host, ticks);
    g.player.input.forward = false;
    step(host, 3);
    return Math.hypot(g.player.x - x0, g.player.z - z0);
  };
  walkTo(a, 0.5, -3.5);
  a.player.yaw = ha.yaw = 180;
  a.player.pitch = 0;
  step(host, 2);
  const free = walked(a, 6);
  walkTo(a, 0.5, -3.5);
  a.player.yaw = 180;
  give(a, 0, S('bread', 3));
  ha.food.level = 10;
  a.player.inventory.selected = 0;
  sess(a).player.inventory.selected = 0;
  step(host, 3);
  const munch = heard(b, 'entity.generic.eat'), munchA = heard(a, 'entity.generic.eat');
  hold(a, true);
  step(host, 3);
  check('eating: the host has the guest eating, and says so', ha.useItem?.item.id === 'bread' && a.player.useItem?.item.id === 'bread' && a.player.isUsingItem() && a.player.usingItemTicks > 0);
  check('eating: counted down alike', Math.abs(a.player.useItemRemaining - ha.useItemRemaining) <= 1 && a.player.useDuration === ha.useDuration, `${a.player.useItemRemaining} / ${ha.useItemRemaining}`);
  check('eating: the other guest sees it eat', mirror(b, ha)?.useItem?.item.id === 'bread' && mirror(b, ha).isUsingItem());
  const slowed = walked(a, 6);
  check('eating: walking while eating is slow (a fifth)', slowed < free * 0.4 && slowed > 0, `${slowed.toFixed(3)} vs ${free.toFixed(3)}`);
  step(host, 40);
  check('eating: done: a bread gone, the food bar up, on both sides', ha.inventory.main[0]?.count === 2 && a.player.inventory.main[0]?.count === 2 && ha.food.level === 15 && a.player.food.level === 15, `${ha.inventory.main[0]?.count} ${ha.food.level}/${a.player.food.level}`);
  check('eating: munching heard by the other guest, and by the eater, once each', heard(b, 'entity.generic.eat') > munch && heard(a, 'entity.generic.eat') - munchA === heard(b, 'entity.generic.eat') - munch, `${heard(a, 'entity.generic.eat') - munchA} / ${heard(b, 'entity.generic.eat') - munch}`);
  hold(a, false);
  step(host, 3);
  check('eating: let go, it isn\'t eating any more, anywhere', !ha.isUsingItem() && !a.player.isUsingItem() && !mirror(b, ha)?.isUsingItem());
  // a bow
  clear(a);
  give(a, 0, S('bow'));
  give(a, 9, S('arrow', 5));
  step(host, 2);
  const arrows = () => lvl.entities.filter((e) => e.type === 'arrow' && !e.removed);
  const n0 = arrows().length;
  hold(a, true);
  step(host, 25);
  check('bow: drawn, as the host has it and the others see it', ha.useItem?.item.id === 'bow' && a.player.useItem?.item.id === 'bow' && mirror(b, ha)?.useItem?.item.id === 'bow' && mirror(b, ha).ticksUsingItem() > 15);
  hold(a, false);
  step(host, 3);
  check('bow: let go, the host\'s arrow flies, an arrow spent', arrows().length === n0 + 1 && arrows().at(-1).owner === ha && ha.inventory.main[9]?.count === 4 && a.player.inventory.main[9]?.count === 4 && !a.player.isUsingItem());
  check('bow: the guest sees the host\'s arrow, and has none of its own', copyOf(a, arrows().at(-1)) && a.level.entities.filter((e) => e.type === 'arrow').length === 1);
  for (const e of arrows()) e.remove();
  // a crossbow: loaded while held (its countdown running on below zero till it's let go), then fired with a click
  clear(a);
  give(a, 0, S('crossbow'));
  give(a, 9, S('arrow', 5));
  step(host, 2);
  hold(a, true);
  step(host, 40);
  check('crossbow: held past its loading, still held, as the host has it', ha.useItem?.item.id === 'crossbow' && a.player.useItem?.item.id === 'crossbow' && ha.useItemRemaining < 0 && Math.abs(a.player.useItemRemaining - ha.useItemRemaining) <= 1, `${a.player.useItemRemaining} / ${ha.useItemRemaining}`);
  hold(a, false);
  step(host, 3);
  check('crossbow: let go, loaded, on both sides', m.isCharged(ha.inventory.main[0]) && m.isCharged(a.player.inventory.main[0]) && ha.inventory.main[9]?.count === 4 && !a.player.isUsingItem());
  use(a);
  check('crossbow: a click fires it, the host\'s bolt', arrows().length === 1 && !m.isCharged(ha.inventory.main[0]) && !m.isCharged(a.player.inventory.main[0]));
  for (const e of arrows()) e.remove();
  // a trident: held back, then thrown by the host, gone from the hand (it's in the air)
  clear(a);
  give(a, 0, S('trident'));
  step(host, 2);
  const tridents = () => lvl.entities.filter((e) => e.type === 'trident' && !e.removed);
  hold(a, true);
  step(host, 15);
  check('trident: held back, as the host has it and the others see it', ha.useItem?.item.id === 'trident' && a.player.useItem?.item.id === 'trident' && mirror(b, ha)?.useItem?.item.id === 'trident');
  hold(a, false);
  step(host, 3);
  check('trident: let go, the host throws it, and it\'s gone from the hand on both sides', tridents().length === 1 && tridents()[0].owner === ha && !ha.inventory.main[0] && !a.player.inventory.main[0] && !a.player.isUsingItem(), `${tridents().length} ${key(ha.inventory.main[0])} ${key(a.player.inventory.main[0])}`);
  check('trident: the guest sees it fly', !!copyOf(a, tridents()[0]));
  for (const e of tridents()) e.remove();
  // a shield in the offhand
  clear(a);
  give(a, 40, S('shield'));
  step(host, 2);
  hold(a, true);
  step(host, 8);
  check('shield: raised in the offhand, blocking on the host', ha.useItem?.item.id === 'shield' && ha.useHand === 'off' && m.isBlocking(ha));
  check('shield: raised on the guest, and for the others to see', a.player.useItem?.item.id === 'shield' && a.player.useHand === 'off' && m.isBlocking(a.player) && m.isBlocking(mirror(b, ha)));
  hold(a, false);
  step(host, 3);
  check('shield: lowered', !ha.isUsingItem() && !a.player.isUsingItem() && !mirror(b, ha).isUsingItem());
  clear(a);
  walkTo(a, 0.5, 0.5);
}

await exitWithStatus(close);
