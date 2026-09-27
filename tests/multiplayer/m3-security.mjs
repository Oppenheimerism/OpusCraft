// Multiplayer M3: the menu packets are data from another computer too. On the host: a guest's clicks, buttons, anvil
// names, trades, crafter switches, recipe-book clicks, book pages and vehicle inventory key are checked for their types
// and ranges, and a malformed one has it disconnected with a reason. Well-formed ones it couldn't have made (a menu
// that isn't open, a slot the menu hasn't, a button it hasn't, a trade past the list, a switch that isn't a crafter's,
// a recipe that isn't one or isn't this menu's, a book that isn't there, more clicks in a tick than a hand can make)
// do nothing, or have the menu sent again as it is. What a guest says it has after a click is only what it says: the
// host clicks for itself and sends back whatever came out otherwise, so a guest that lies about what it holds is put
// right and gets nothing by it. On a guest: a menu the host opens that can't be one, contents of the wrong size,
// slots and values the menu hasn't, offers of items that don't exist have it leave, saying why; a title is plain text.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, rawGuest, hostCopy, step, SETTLE, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/game/openMenu.ts', '/src/net/menus.ts', '/src/net/client/clientMenus.ts', '/src/net/server/menuSync.ts',
  '/src/inventory/container.ts', '/src/inventory/menus.ts', '/src/inventory/enchantMenus.ts', '/src/inventory/merchantMenu.ts',
  '/src/inventory/crafterMenu.ts', '/src/inventory/recipeBook.ts', '/src/entity/villager.ts', '/src/entity/trading.ts', '/src/game/books.ts', '/src/game/crafter.ts',
]);
const S = (id, n = 1) => m.ItemStack.of(id, n);
const key = (s) => m.stackKey(s);

// ---------------------------------------------------------------------------
// the host: a malformed menu packet has the guest disconnected, with a reason, and nobody else notices
{
  const host = flatHost(m, 3, { guestGameMode: 'survival' });
  const a = makeGuest(host, 'Alex');
  step(host, 3);
  let n = 0;
  function attack(label, packets, want) {
    const r = rawGuest(host);
    const name = `Bad${n++}`;
    step(host, 1);
    r.hello(name);
    step(host, 2);
    const inGame = hostCopy(host, { name }) !== null;
    let threw = null;
    try {
      r.send(packets);
      step(host, 3);
    } catch (e) {
      threw = e;
    }
    const reason = r.reason();
    check(`${label}: the guest is disconnected, with a reason`, inGame && r.gone && reason !== null && want.test(reason), `${reason}`);
    check(`${label}: (the host's tick didn't throw; Alex plays on)`, !threw && hostCopy(host, { name }) === null && a.session.state === 'play', threw ? String(threw.stack ?? threw).slice(0, 300) : '');
  }
  const click = (fields) => [[m.SB.ContainerClick, ...fields]];
  attack('a click in a menu past 255', click([256, 0, 0, 0, 0, [], 0]), /^Bad data: packet \d+: bad field 0/);
  attack('a click on slot -1000', click([0, 0, -1000, 0, 0, [], 0]), /^Bad data: packet \d+: bad field 2/);
  attack(`a click on slot ${m.MAX_MENU_SLOTS}`, click([0, 0, m.MAX_MENU_SLOTS, 0, 0, [], 0]), /^Bad data: packet \d+: bad field 2/);
  attack('a click with button 41', click([0, 0, 9, 41, 0, [], 0]), /^Bad data: packet \d+: bad field 3/);
  attack('a click of a kind there isn\'t', click([0, 0, 9, 0, m.CLICK_TYPES.length, [], 0]), /^Bad data: packet \d+: bad field 4/);
  attack(`a click changing ${m.MAX_MENU_SLOTS + 1} slots`, click([0, 0, 9, 0, 0, Array.from({ length: m.MAX_MENU_SLOTS + 1 }, (_, i) => [i % 40, 1]), 0]), /^Bad data: packet \d+: bad field 5/);
  attack('a changed slot that isn\'t a pair', click([0, 0, 9, 0, 0, [[1]], 0]), /^Bad data: packet \d+: bad field 5/);
  attack('a changed slot past the menu\'s most', click([0, 0, 9, 0, 0, [[m.MAX_MENU_SLOTS, 1]], 0]), /^Bad data: packet \d+: bad field 5/);
  attack('a slot\'s hash past 32 bits', click([0, 0, 9, 0, 0, [[9, 2 ** 32]], 0]), /^Bad data: packet \d+: bad field 5/);
  attack('a cursor hash that isn\'t a whole number', click([0, 0, 9, 0, 0, [], 1.5]), /^Bad data: packet \d+: bad field 6/);
  attack('a click without its cursor', click([0, 0, 9, 0, 0, []]), /^Bad data: packet \d+: 6 fields/);
  attack('a button past 4095', [[m.SB.ContainerButtonClick, 1, 4096]], /^Bad data: packet \d+: bad field 1/);
  attack('an anvil name of 51 characters', [[m.SB.RenameItem, 'x'.repeat(51)]], /^Bad data: packet \d+: bad field 0/);
  attack('a trade past 255', [[m.SB.SelectTrade, 256]], /^Bad data: packet \d+: bad field 0/);
  attack('a crafter slot past 8', [[m.SB.SlotStateChanged, 1, 9, true]], /^Bad data: packet \d+: bad field 1/);
  attack('a recipe with no name', [[m.SB.PlaceRecipe, 0, '', false]], /^Bad data: packet \d+: bad field 1/);
  // (128 at most: the book's longest is 75, cracked_polished_blackstone_bricks_from_smelting_polished_blackstone_bricks)
  attack('a recipe name of 129 characters', [[m.SB.PlaceRecipe, 0, 'x'.repeat(129), false]], /^Bad data: packet \d+: bad field 1/);
  attack('a book in slot 41', [[m.SB.EditBook, 41, ['a'], null]], /^Bad data: packet \d+: bad field 0/);
  attack('a book of 101 pages', [[m.SB.EditBook, 0, Array.from({ length: 101 }, () => 'a'), null]], /^Bad data: packet \d+: bad field 1/);
  attack('a page of 1025 characters', [[m.SB.EditBook, 0, ['x'.repeat(1025)], null]], /^Bad data: packet \d+: bad field 1/);
  attack('a title of 33 characters', [[m.SB.EditBook, 0, ['a'], 'x'.repeat(33)]], /^Bad data: packet \d+: bad field 2/);
  attack('an empty title', [[m.SB.EditBook, 0, ['a'], '']], /^Bad data: packet \d+: bad field 2/);
  attack('an action past the inventory key', [[m.SB.PlayerAction, m.Action.OPEN_INVENTORY + 1, 0]], /^Bad data: packet \d+: bad field 0/);
}

// ---------------------------------------------------------------------------
// the host: well-formed, but not what the guest could have done: nothing comes of it, or the menu is sent again
{
  const host = flatHost(m, 3, { guestGameMode: 'survival' });
  const lvl = host.level;
  m.setShowMenu((p, menu) => host.server.showMenu(p, menu));
  m.installMenuHooks();
  lvl.onOpenMerchant = (v, p) => host.server.showMenu(p, new m.MerchantMenu(p, v));
  const a = makeGuest(host, 'Alex', { viewDistance: 3 });
  step(host, 30);
  const ha = hostCopy(host, a);
  const sess = () => host.server.sessionOf(ha);
  /** packets from Alex's own connection, as a changed game of its would send them */
  const send = (packets) => {
    a.transport.send(m.HOST_PEER, m.encode(packets));
    step(host, 3);
  };
  const alive = (label) => check(`${label}: (Alex is still in)`, a.session.state === 'play' && hostCopy(host, a) === ha);
  const give = (i, s) => {
    ha.inventory.main[i] = s;
    ha.inventory.version++;
    step(host, 2);
  };
  give(9, S('oak_log', 5));

  // clicks in a menu that isn't open, on a slot its menu hasn't, a swap with a key that isn't one
  send([[m.SB.ContainerClick, 7, 0, 0, 0, 0, [], 0]]);
  check('a click in a menu that isn\'t open: nothing', ha.inventory.main[9]?.count === 5 && !sess().menus.inventory.carried);
  alive('a click in a menu that isn\'t open');
  send([[m.SB.ContainerClick, 0, 0, 60, 0, 0, [], 0]]);
  check('a click on a slot the inventory hasn\'t: nothing', ha.inventory.main[9]?.count === 5 && !sess().menus.inventory.carried);
  send([[m.SB.ContainerClick, 0, 0, 9, 20, m.CLICK_TYPES.indexOf('swap'), [], 0]]);
  check('a swap with hotbar key 21: nothing', ha.inventory.main[9]?.count === 5);
  send([[m.SB.ContainerClick, 0, 0, 9, 7, m.CLICK_TYPES.indexOf('pickup'), [], 0]]);
  check('a pickup with button 7: nothing', ha.inventory.main[9]?.count === 5 && !sess().menus.inventory.carried);
  alive('clicks that couldn\'t be');

  // a lie: it says it picked up a stack of 64 diamonds from an empty slot; the host clicks for itself, and puts it right
  const inv = a.session.menus.inventory;
  inv.slots[10].container.set(inv.slots[10].slot, S('diamond', 64));
  inv.carried = S('diamond', 64);
  send([[m.SB.ContainerClick, 0, 0, 10, 0, 0, [[10, m.keyHash(key(null))], [11, m.keyHash(key(S('diamond', 64)))]], m.keyHash(key(S('diamond', 64)))]]);
  check('a lie about what it holds: the host has no diamonds for it', !ha.inventory.main.some((s) => s?.item.id === 'diamond') && !sess().menus.inventory.carried);
  check('a lie about what it holds: and its game is put right', !a.player.inventory.main.some((s) => s?.item.id === 'diamond') && !inv.carried && a.player.inventory.main[9]?.count === 5);
  alive('a lie');

  // more clicks in a tick than a hand can make: the rest are refused (81 pickups: the 81st would have left the logs on the cursor)
  const pickups = Array.from({ length: m.MAX_CLICKS_PER_TICK + 1 }, () => [m.SB.ContainerClick, 0, 0, 9 + 27, 0, 0, [], 0]);
  give(0, S('oak_log', 5));
  give(9, null);
  a.transport.send(m.HOST_PEER, m.encode(pickups.slice(0, 41)));
  a.transport.send(m.HOST_PEER, m.encode(pickups.slice(41)));
  step(host, 3);
  check(`${m.MAX_CLICKS_PER_TICK + 1} clicks in a tick: past ${m.MAX_CLICKS_PER_TICK}, refused`, ha.inventory.main[0]?.count === 5 && !sess().menus.inventory.carried, `${key(ha.inventory.main[0])} ${key(sess().menus.inventory.carried)}`);
  check('(and its game shows the logs where they are)', a.player.inventory.main[0]?.count === 5 && !inv.carried);
  alive('too many clicks');

  // buttons, names, trades, switches and recipes with nothing open for them
  send([[m.SB.ContainerButtonClick, 0, 0], [m.SB.ContainerButtonClick, 3, 1], [m.SB.RenameItem, 'Shiny'], [m.SB.SelectTrade, 3], [m.SB.SlotStateChanged, 0, 3, false], [m.SB.PlaceRecipe, 5, 'torch', true], [m.SB.ContainerClose, 42]]);
  check('buttons, a name, a trade, a switch, a recipe and a close with nothing open for them: nothing', ha.inventory.main[0]?.count === 5 && sess().menus.containerId === 0);
  alive('nothing open');
  // the recipe book in the inventory's own grid: a recipe that isn't one, a furnace's, one too big for a 2x2 grid (each
  // one the guest has unlocked, holding what it's made of, so only that stops it)
  give(1, S('coal', 4));
  give(2, S('stick', 4));
  give(3, S('cobblestone', 8));
  give(6, S('raw_iron', 2));
  const known = sess().recipes.known;
  check('recipe book: (holding them, it has unlocked the torch, the furnace and smelting raw iron)', known.has('torch') && known.has('furnace') && known.has('iron_ingot_from_smelting_raw_iron'));
  send([[m.SB.PlaceRecipe, 0, 'no_such_recipe', false], [m.SB.PlaceRecipe, 0, 'iron_ingot_from_smelting_raw_iron', false], [m.SB.PlaceRecipe, 0, 'furnace', false]]);
  check('recipe book: an unknown recipe, a furnace\'s, one too big for the 2x2 grid: the grid stays empty', !sess().menus.inventory.craft.items.some(Boolean));
  // (the book's longest name: no bad data; a furnace's recipe, so nothing in the grid)
  const longest = 'cracked_polished_blackstone_bricks_from_smelting_polished_blackstone_bricks';
  send([[m.SB.PlaceRecipe, 0, longest, false]]);
  check(`recipe book: a recipe named in ${longest.length} characters, the book's longest, taken`, !sess().menus.inventory.craft.items.some(Boolean) && m.BOOK_BY_ID.has(longest));
  alive('the longest recipe name');
  // (vanilla ServerRecipeBook.contains: a recipe it hasn't unlocked isn't placed, nor shown in outline)
  const ghosts = [];
  a.session.hooks.ghostRecipe = (_menu, r) => ghosts.push(r);
  send([[m.SB.PlaceRecipe, 0, 'tnt', false]]);
  check('recipe book: TNT, never having held gunpowder or sand: not unlocked, nothing placed, not shown in outline', !known.has('tnt') && !sess().menus.inventory.craft.items.some(Boolean) && ghosts.length === 0);
  give(6, null);
  send([[m.SB.PlaceRecipe, 0, 'torch', false]]);
  check('recipe book: (a torch does fit)', sess().menus.inventory.craft.items.filter(Boolean).length === 2);
  send([[m.SB.ContainerClose, 0]]);
  // the vehicle inventory key on foot
  send([[m.SB.PlayerAction, m.Action.OPEN_INVENTORY, 0]]);
  check('the inventory key for a vehicle, on foot: nothing opens', sess().menus.containerId === 0);
  // books: a slot with no book and quill; a written book
  send([[m.SB.EditBook, 0, ['hello'], null], [m.SB.EditBook, 40, ['hello'], 'Title']]);
  check('a book edited where there\'s none: nothing', ha.inventory.main[0]?.item.id === 'oak_log' && !ha.inventory.offhand);
  const signed = S('written_book');
  signed.tag = { book: { title: 'Mine', author: 'Host', generation: 0, pages: ['x'] } };
  give(3, signed);
  send([[m.SB.EditBook, 3, ['rewritten'], null], [m.SB.EditBook, 3, ['again'], 'Stolen']]);
  check('a written book: not written in or signed again', key(ha.inventory.main[3]) === key(signed));
  give(4, S('writable_book'));
  send([[m.SB.EditBook, 4, ['\u0000\u001b[31m §kred'], '\u0007  ']]);
  check('a title of nothing but control characters and spaces: not signed', ha.inventory.main[4]?.item.id === 'writable_book');
  send([[m.SB.EditBook, 4, ['\u0000\u001b[31m §kred'], null]]);
  check('a page\'s control characters and formatting signs taken out', ha.inventory.main[4]?.tag?.pages?.[0] === '[31m kred', JSON.stringify(ha.inventory.main[4]?.tag));
  alive('books');

  // in a crafting table: the switch is a crafter's; a button it hasn't; a trade
  lvl.setBlock(2, 64, 0, m.S('crafting_table'));
  step(host, 2);
  const menu = m.blockMenu(lvl, ha, 'crafting_table', 2, 64, 0);
  host.server.showMenu(ha, menu);
  step(host, 2);
  const id = sess().menus.containerId;
  check('(a crafting table open for Alex)', id > 0 && a.session.menus.open?.menu instanceof m.CraftingMenu);
  send([[m.SB.SlotStateChanged, id, 3, false], [m.SB.ContainerButtonClick, id, 2], [m.SB.SelectTrade, 0], [m.SB.RenameItem, 'x']]);
  check('a crafter\'s switch, a button, a trade and a name in a crafting table: nothing', sess().menus.menu === menu && !menu.craft.items.some(Boolean));
  send([[m.SB.PlaceRecipe, id, 'iron_ingot_from_smelting_raw_iron', false]]);
  check('a furnace\'s recipe in a crafting table: nothing', !menu.craft.items.some(Boolean));
  // a stale click (an old state number): done, then the whole menu sent again
  const log = sess().menus.menu.slots.findIndex((s) => s.item?.item.id === 'oak_log');
  send([[m.SB.ContainerClick, id, 12345, log, 0, 0, [], 0]]);
  check('a click on an old view of the menu: made, and all sent again', menu.carried?.item.id === 'oak_log' && a.session.menus.open.menu.carried?.item.id === 'oak_log' && !a.player.inventory.main[0]);
  send([[m.SB.ContainerClick, id, 0, log, 0, 0, [], 0]]);
  // closed by the guest, then clicked in: nothing
  send([[m.SB.ContainerClose, id], [m.SB.ContainerClick, id, 0, log, 0, 0, [], 0]]);
  check('a click in a menu it has closed: nothing', sess().menus.containerId === 0 && ha.inventory.main[0]?.count === 5);
  alive('a crafting table');

  // an enchanting table's button with no lapis, no levels: nothing; an offer past the third
  lvl.setBlock(-2, 64, 0, m.S('enchanting_table'));
  step(host, 2);
  const et = m.blockMenu(lvl, ha, 'enchanting_table', -2, 64, 0);
  host.server.showMenu(ha, et);
  step(host, 2);
  const eid = sess().menus.containerId;
  et.enchantSlots.set(0, S('iron_sword'));
  ha.xpLevel = 0;
  step(host, 2);
  send([[m.SB.ContainerButtonClick, eid, 0], [m.SB.ContainerButtonClick, eid, 2], [m.SB.ContainerButtonClick, eid, 3], [m.SB.ContainerButtonClick, eid, 4095]]);
  check('enchanting table: offers with no lapis and no levels, and offers it hasn\'t: nothing', !et.enchantSlots.get(0)?.tag);
  host.server.sessionOf(ha).menus.close();
  step(host, 2);

  // a villager: a trade past its list
  const v = new m.Villager(lvl);
  v.moveTo(1.5, 64, 2.5, 0, 0);
  v.profession = 'farmer';
  v.xp = 5;
  v.setOffers([new m.MerchantOffer({ id: 'wheat', count: 20 }, null, S('emerald'), 16, 2, 0.05)]);
  lvl.addEntity(v);
  step(host, 2);
  const mm = new m.MerchantMenu(ha, v);
  v.tradingPlayer = ha;
  host.server.showMenu(ha, mm);
  give(5, S('wheat', 30));
  send([[m.SB.SelectTrade, 1], [m.SB.SelectTrade, 255]]);
  check('villager: a trade past its list: nothing moves', !mm.trade.items[0] && ha.inventory.main[5]?.count === 30);
  send([[m.SB.SelectTrade, 0]]);
  check('villager: (its one trade does)', mm.trade.items[0]?.count === 30);
  alive('a villager');
  host.server.sessionOf(ha).menus.close();
  step(host, 2);
  check('villager: closed, it stops trading, the wheat back', v.tradingPlayer === null && ha.inventory.main.some((s) => s?.item.id === 'wheat' && s.count === 30));
}

// ---------------------------------------------------------------------------
// a guest: a host whose menus make no sense is left, saying why; what it can let be, it does
{
  const LOGIN = {
    playerId: 7, worldName: 'Elsewhere', dimension: 'overworld', gameMode: 'survival', difficulty: 'normal', hardcore: false, gameRules: { doDaylightCycle: true },
    gameTime: 100, dayTime: 100, raining: false, thundering: false, rainLevel: 0, thunderLevel: 0, x: 0.5, y: 65, z: 0.5, yRot: 0, xRot: 0, viewDistance: 3, hostName: 'Other',
  };
  function fakeHost() {
    const net = new m.MemoryNetwork();
    const f = { m, net, guests: [], got: [], peer: null };
    net.host.onPeer((peer, joined) => {
      if (joined) f.peer = peer;
    });
    net.host.onMessage((_peer, data) => f.got.push(...m.decode(data, m.MAX_GUEST_MESSAGE)));
    f.send = (packets) => net.host.send(f.peer, m.encode(packets));
    // (with MP_LAG, SETTLE more, as step() does)
    f.tick = (k = 1) => {
      for (let i = 0; i < k + SETTLE; i++) {
        net.deliver();
        for (const g of f.guests) g.session.tick();
        net.deliver();
      }
    };
    f.said = (id) => f.got.filter((p) => p[0] === id);
    return f;
  }
  const blocks = () => Array.from({ length: m.SECTIONS }, (_, s) => (s === 4 ? new Uint16Array(4096).fill(m.S('stone')) : null));
  const chunk = (cx, cz) => [m.CB.LevelChunk, cx, cz, blocks(), new Uint8Array(256).fill(m.B.plains), null, []];
  function joined() {
    const f = fakeHost();
    const g = makeGuest(f, 'Alex');
    g.shown = [];
    g.books = [];
    f.tick(1);
    f.send([[m.CB.Login, LOGIN], chunk(0, 0)]);
    f.tick(1);
    g.session.hooks.openMenu = (menu) => g.shown.push(menu);
    g.session.hooks.openBook = (hand) => g.books.push(hand);
    return { f, g };
  }
  function badHost(label, packets, want) {
    const { f, g } = joined();
    let threw = null;
    try {
      f.send(packets);
      f.tick(2);
    } catch (e) {
      threw = e;
    }
    check(`host sends ${label}: the guest leaves, saying why`, !threw && g.disconnected !== null && want.test(g.disconnected), threw ? String(threw.stack ?? threw).slice(0, 300) : `${g.disconnected}`);
  }
  function fineHost(label, packets, test = () => true) {
    const { f, g } = joined();
    let threw = null;
    try {
      f.send(packets);
      f.tick(2);
    } catch (e) {
      threw = e;
    }
    let ok = false;
    try {
      ok = test(g, f);
    } catch (e) {
      threw = e;
    }
    check(`host sends ${label}: the guest stays, and it's as it should be`, !threw && g.session.state === 'play' && ok, threw ? String(threw.stack ?? threw).slice(0, 300) : `${g.session.state} ${g.disconnected}`);
  }
  const open = (kind, title = '', extra = {}) => [m.CB.OpenScreen, 1, kind, title, extra];
  const offer = (cost = 'wheat', result = ['emerald', 1, 0, null]) => [cost, 20, null, 0, result, 0, 16, 2, 0.05, 0, 0];

  badHost('a menu that isn\'t one', [open('nether_portal')], /^Bad data from the host: a menu that does not exist$/);
  badHost('a menu of the wrong size', [open('chest'), [m.CB.ContainerSetContent, 1, 1, Array.from({ length: 10 }, () => null), null]], /^Bad data from the host: a menu of the wrong size$/);
  badHost('a slot a hopper hasn\'t', [open('hopper'), [m.CB.MenuSetSlot, 1, 1, 50, null]], /^Bad data from the host: a slot that does not exist$/);
  badHost('a furnace value it hasn\'t', [open('furnace'), [m.CB.ContainerSetData, 1, 9, 5]], /^Bad data from the host: a menu value that does not exist$/);
  badHost('an anvil value it hasn\'t', [open('anvil'), [m.CB.ContainerSetData, 1, 1, 5]], /^Bad data from the host: a menu value that does not exist$/);
  badHost('an offer of an item that doesn\'t exist', [open('merchant', 'Farmer'), [m.CB.MerchantOffers, 1, [offer('no_such_item')], 1, 0, false, false]], /^Bad data from the host: an offer of an item that does not exist$/);
  badHost('an offer whose result doesn\'t exist', [open('merchant', 'Farmer'), [m.CB.MerchantOffers, 1, [offer('wheat', ['no_such_item', 1, 0, null])], 1, 0, false, false]], /^Bad data from the host: an offer of an item that does not exist$/);
  badHost('an offer of the wrong shape', [open('merchant', 'Farmer'), [m.CB.MerchantOffers, 1, [['wheat', 20]], 1, 0, false, false]], /^Bad data from the host: packet \d+: bad field 1$/);
  badHost('65 offers', [open('merchant', 'Farmer'), [m.CB.MerchantOffers, 1, Array.from({ length: 65 }, () => offer()), 1, 0, false, false]], /^Bad data from the host: packet \d+: bad field 1$/);
  badHost(`a slot past ${m.MAX_MENU_SLOTS - 1}`, [[m.CB.MenuSetSlot, 0, 1, m.MAX_MENU_SLOTS, null]], /^Bad data from the host: packet \d+: bad field 2$/);
  badHost('a menu value past 31', [[m.CB.ContainerSetData, 0, 32, 1]], /^Bad data from the host: packet \d+: bad field 1$/);
  badHost('a menu title of 300 characters', [open('chest', 'x'.repeat(300))], /^Bad data from the host: packet \d+: bad field 2$/);
  badHost('a menu numbered 0 opened', [[m.CB.OpenScreen, 0, 'chest', '', {}]], /^Bad data from the host: packet \d+: bad field 0$/);
  badHost('a use of an item for 100000 ticks', [[m.CB.SetUsingItem, 0, 100000, 5]], /^Bad data from the host: packet \d+: bad field 1$/);
  badHost('a book opened in a third hand', [[m.CB.OpenBook, 2]], /^Bad data from the host: packet \d+: bad field 0$/);
  badHost('a recipe unlocked that isn\'t one', [[m.CB.RecipeBookAdd, ['torch', 'no_such_recipe'], false]], /^Bad data from the host: a recipe that does not exist$/);
  badHost('a recipe named in 129 characters', [[m.CB.RecipeBookAdd, ['x'.repeat(129)], false]], /^Bad data from the host: packet \d+: bad field 0$/);
  badHost('4097 recipes unlocked at once', [[m.CB.RecipeBookAdd, Array.from({ length: 4097 }, () => 'torch'), false]], /^Bad data from the host: packet \d+: bad field 0$/);
  check('prototype: nothing reached Object.prototype', ({}).polluted === undefined);

  fineHost('a chest titled with formatting and control characters: plain text', [open('chest', '§4Red\u0007 Chest')], (g) => g.session.menus.open?.menu.title === '4Red Chest' && g.shown.length === 1);
  fineHost('a horse\'s inventory for a horse it hasn\'t: closed again', [open('horse', '', { entity: 99, columns: 0 })], (g, f) => !g.session.menus.open && f.said(m.SB.ContainerClose).some((p) => p[1] === 1));
  fineHost('an item that doesn\'t exist in a slot: an empty slot', [open('chest'), [m.CB.MenuSetSlot, 1, 1, 0, ['no_such_item', 1, 0, null]]], (g) => g.session.menus.open && !g.session.menus.open.menu.slots[0].item);
  fineHost('slots, values, a cursor and a close for a menu that isn\'t open (let be)', [[m.CB.MenuSetSlot, 5, 1, 0, ['stone', 1, 0, null]], [m.CB.ContainerSetData, 5, 0, 1], [m.CB.SetCarried, 5, 1, ['stone', 1, 0, null]], [m.CB.ContainerClose, 5], [m.CB.MerchantOffers, 5, [], 1, 0, false, false], [m.CB.PlaceGhostRecipe, 5, 'torch']], (g) => !g.session.menus.open && !g.session.menus.inventory.carried && !g.player.inventory.main.some(Boolean));
  fineHost('offers for a menu that isn\'t a trader\'s (let be)', [open('chest'), [m.CB.MerchantOffers, 1, [offer()], 1, 0, false, false]], (g) => g.session.menus.open?.kind === 'chest');
  fineHost('a lectern turned to page -5 (the first)', [open('lectern'), [m.CB.ContainerSetData, 1, 0, -5]], (g) => g.session.menus.open.menu.lectern.page === 0);
  fineHost('a book opened in the offhand', [[m.CB.OpenBook, 1]], (g) => g.books.length === 1 && g.books[0] === 'off');
  fineHost('the use of an item it doesn\'t hold (nothing in hand: nothing used)', [[m.CB.SetUsingItem, 0, 32, 10]], (g) => g.player.useItem === null && !g.player.isUsingItem());
  fineHost('recipes unlocked (with their toasts), then all it knows replaced (without)', [[m.CB.RecipeBookAdd, ['torch', 'stick'], false], [m.CB.RecipeBookAdd, ['furnace', 'torch'], true]], (g) => g.toasts.join() === 'torch,stick' && [...g.recipes].sort().join() === 'furnace,torch');
  fineHost('a crafter\'s switches and its lit value', [open('crafter'), [m.CB.ContainerSetData, 1, 4, 1], [m.CB.ContainerSetData, 1, 9, 1]], (g) => g.session.menus.open.menu.crafter.isSlotDisabled(4) && g.session.menus.open.menu.crafter.triggered);
}

await exitWithStatus(close);
