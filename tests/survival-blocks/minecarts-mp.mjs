// Multiplayer checks for the minecarts and rails (node tests/survival-blocks/minecarts-mp.mjs): guests see the host's
// hopper, TNT and furnace minecarts as their kinds, where they are (a lit furnace minecart lit and smoking, not what a
// hopper minecart holds); a guest climbs into a minecart and rides it over powered rails, its copy eased along a tick
// or two behind the host's (as vanilla eases a cart), sped up, as evenly when the host's ticks come unevenly, and just
// where the host has it once it stops, the guest in its seat all the way and the other guest seeing it there; holding
// forward in a stopped cart pushes it along as the host's own player's would; guests see a detector rail and the
// powered rails it leads to powered while a cart is on it, and off after; a guest feeds a furnace minecart coal and
// it pushes off away from them, lit for everyone; a guest opens a hopper minecart's menu and takes from it; a TNT
// minecart lit on an activator rail hisses for the guests, its fuse burning down and flashing on their side as on the
// host, and goes off, the rails left; a guest sets a hopper minecart on a rail; a guest who joins late sees a switched
// off hopper minecart (and its name), a lit furnace minecart, a lit TNT minecart and the rails' power as they are.
import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, check, exitWithStatus, SETTLE } from '../multiplayer/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/entity/minecartVariants.ts', '/src/game/poweredRails.ts', '/src/game/openMenu.ts', '/src/net/menus.ts',
  '/src/net/client/clientMenus.ts', '/src/net/server/menuSync.ts', '/src/inventory/hopperMenu.ts', '/src/game/redstone/hopper.ts',
  '/src/render/minecartContents.ts', '/src/game/rails.ts',
]);
const { ItemStack } = m;

const host = flatHost(m, 5, { guestGameMode: 'survival', gameMode: 'survival' });
const lvl = host.level;
const a = makeGuest(host, 'Alex', { viewDistance: 4 });
const b = makeGuest(host, 'Steve', { viewDistance: 4 });
for (const g of [a, b]) {
  g.shown = [];
  g.hidden = [];
  g.session.hooks.openMenu = (menu) => g.shown.push(menu);
  g.session.hooks.closeMenu = (menu) => g.hidden.push(menu);
}
// (the host's own game shows a guest's menu to its guest, as Game.showMenu does)
m.setShowMenu((p, menu) => host.server.showMenu(p, menu));
m.installMenuHooks();
step(host, 30);
const ha = hostCopy(host, a);
const G = 64;
const near = (x, y, e = 1e-6) => Math.abs(x - y) <= e;
const heard = (g, n) => g.level.sounds.filter((s) => s.name === n).length;
const countIn = (c, id = null) => c.items.reduce((n, s) => n + (s && (!id || s.item.id === id) ? s.count : 0), 0);
/** a line of `name` rails running east-west at height G, from x0 to x1 */
function track(name, x0, x1, z) {
  for (let x = x0; x <= x1; x++) lvl.setBlock(x, G, z, m.getBlock(name).state({ shape: 'east_west' }));
}
/** a cart of the host's, of `type`, on the rail at (x, z) */
function cart(type, x, z, f) {
  const c = m.createMinecart(type, lvl);
  c.moveTo(x + 0.5, G + 0.0625, z + 0.5, 0, 0);
  f?.(c);
  lvl.addEntity(c);
  return c;
}
/** a property of the block at (x, y, z) in `g`'s world */
const gprop = (g, x, y, z, k) => {
  const st = g.world.getState(x, y, z);
  return m.blockOf(st).get(st, k);
};
/** the guest holding `stack` in its first hotbar slot, as the host gives it */
function give(g, stack) {
  const inv = hostCopy(host, g).inventory;
  inv.main[0] = stack;
  inv.selected = 0;
  g.player.inventory.selected = 0;
  inv.version++;
  step(host, 3);
}
/** the guest put at (x, y, z) by the host, turned so (a teleport: a jump of more than 8 blocks is put back otherwise) */
function put(g, x, y, z, yaw, pitch) {
  [...host.server.sessions.values()].find((s) => s.name === g.name).teleport(x, y, z, yaw, pitch);
  step(host, 3);
}
/** a click of `button` ('attack' or 'use') with `e`'s copy under the guest's crosshair (none: a block or the air) */
function click(g, button, e) {
  g.session.input(button === 'attack', false, button === 'use', false, e ? copyOf(g, e) : null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 3);
}
/** the guest 2 blocks north of cart `c`, looking at its side */
function aim(g, c) {
  put(g, c.x, G, c.z - 2, 0, (Math.atan2(G + 1.62 - (c.y + 0.4), c.bb.minZ - (c.z - 2)) * 180) / Math.PI);
}
/** the guest gets out (the sneak key) */
function getOut(g) {
  g.player.input.sneak = true;
  step(host, 3);
  g.player.input.sneak = false;
  step(host, 4);
}
/** (drift) the host's tick with no guest's after it: the guests get it with the host's next, at their next tick */
function hostTick() {
  host.server.receive();
  lvl.tick();
  host.server.tick();
  host.net.deliver();
}
/** (drift) the guests' tick with none of the host's since their last */
function guestTick() {
  for (const g of host.guests) g.session.tick();
  host.net.deliver();
}
/** whether a TNT minecart's block is drawn flashing white now */
function flashing(e) {
  let white = false;
  m.renderMinecartContents({ setOverlay: (...o) => (white ||= o.join() === '1,1,1,0.75') }, { scale() {} }, { renderBlockState() {} }, e, e.displayState(), 0);
  return white;
}

// ---------------------------------------------------------------------------
// seen
{
  track('rail', -4, 12, 6);
  const hc = cart('hopper_minecart', 0, 6, (c) => c.container.set(0, ItemStack.of('diamond', 5)));
  const tc = cart('tnt_minecart', 4, 6);
  const fc = cart('furnace_minecart', 8, 6, (c) => (c.fuel = 2000));
  step(host, 5);
  const [ch, ct, cf] = [hc, tc, fc].map((c) => copyOf(a, c));
  check('seen: the guests see each kind of minecart as its kind', ch instanceof m.MinecartHopper && ct instanceof m.MinecartTNT && cf instanceof m.MinecartFurnace && copyOf(b, hc) instanceof m.MinecartHopper && copyOf(b, fc) instanceof m.MinecartFurnace);
  check('seen: where the host has them', [hc, tc, fc].every((c) => near(copyOf(a, c).x, c.x) && near(copyOf(a, c).y, c.y) && near(copyOf(a, c).z, c.z)));
  check('seen: a furnace minecart with fuel lit (its furnace drawn lit), a TNT one unlit, a hopper one on', cf.lit && cf.displayState() === m.getBlock('furnace').state({ facing: 'north', lit: true }) && ct.fuse === -1 && !flashing(ct) && ch.enabled);
  check('seen: not what a hopper minecart holds (vanilla sends none of it)', countIn(ch.container) === 0 && countIn(hc.container) === 5);
  step(host, 20);
  check('seen: a lit furnace minecart smokes on the guests\' side', a.level.particleCalls.some((p) => p.args[0] === 'large_smoke') && b.level.particleCalls.some((p) => p.args[0] === 'large_smoke'));
  check('seen: only that it\'s lit, not its fuel\'s count as it burns (vanilla\'s hasFuel)', copyOf(a, fc).lit && copyOf(a, fc).fuel !== fc.fuel, `${copyOf(a, fc).fuel} ${fc.fuel}`);
  const loot = cart('chest_minecart', -3, 6, (c) => {
    c.lootTable = 'chests/abandoned_mineshaft';
    c.lootSeed = 99;
  });
  step(host, 3);
  check('seen: not a minecart\'s loot table nor its seed', copyOf(a, loot) instanceof m.MinecartChest && copyOf(a, loot).lootTable === null && copyOf(a, loot).lootSeed === 0 && loot.lootTable !== null);
  loot.remove();
}

// ---------------------------------------------------------------------------
// riding over powered rails
{
  track('rail', -12, -1, 12);
  track('powered_rail', 0, 20, 12);
  for (const x of [0, 9, 18]) lvl.setBlock(x, G, 13, m.S('redstone_block'));
  track('rail', 21, 75, 12);
  const ride = cart('minecart', -4, 12);
  step(host, 3);
  give(a, null);
  aim(a, ride);
  click(a, 'use', ride);
  const cr = copyOf(a, ride);
  check('riding: a guest\'s click gets it into the minecart, on the host and its own side', ha.vehicle === ride && a.player.vehicle === cr && cr.passengers[0] === a.player);
  check('riding: the other guest sees it in the cart', b.session.mirrors.get(ha.id)?.vehicle === copyOf(b, ride));
  ride.dx = 0.15;
  const hostX = [], copyX = [], otherX = [];
  let seated = true, unseated = '';
  for (let t = 0; t < 70; t++) {
    step(host, 1);
    hostX.push(ride.x);
    copyX.push(cr.x);
    otherX.push(copyOf(b, ride)?.x ?? NaN);
    if (seated && !(a.player.vehicle === cr && near(a.player.x, cr.x) && near(a.player.z, cr.z) && near(a.player.y, cr.y + cr.passengerAttachmentY(a.player) - a.player.vehicleAttachmentY()))) {
      seated = false;
      unseated = `${t}: ${a.player.vehicle === cr} ${a.player.x} ${cr.x} ${a.player.z} ${cr.z} ${a.player.y} ${cr.y}`;
    }
  }
  const moves = copyX.slice(1).map((x, i) => x - copyX[i]);
  const behind = (xs) => xs.every((x, i) => x <= hostX[i] + 1e-6 && hostX[i] - x <= 0.81);
  check('riding: on the guest\'s side the cart is where the host has it, eased in a tick or two behind (as vanilla eases a cart)', behind(copyX) && behind(otherX), copyX.slice(0, 3).map((x, i) => `${x.toFixed(2)}/${hostX[i].toFixed(2)}`).join(' '));
  check('riding: and it moves on every tick, never jumping (smooth)', moves.every((d) => d > 0 && d <= 0.4 + 1e-6), moves.slice(0, 6).map((d) => d.toFixed(3)).join(' '));
  check('riding: sped up by the powered rails', Math.max(...moves) > 0.3 && ride.x > 10, `${Math.max(...moves).toFixed(3)} ${ride.x.toFixed(1)}`);
  check('riding: the guest in its seat all the way', seated, unseated);
  // (the two games' clocks drifting: now and then a guest's tick comes with none of the host's since its last, and its
  // next with two; with MP_LAG the ticks are the network's to spread, not this test's)
  if (!SETTLE) {
    const at = [cr.x], from = ride.x;
    for (let k = 0; k < 4; k++) {
      step(host, 1);
      at.push(cr.x);
      guestTick();
      at.push(cr.x);
      hostTick();
      step(host, 1);
      at.push(cr.x);
    }
    const v = (ride.x - from) / (at.length - 1), even = at.slice(1).map((x, i) => x - at[i]);
    check('riding: as evenly when one of the host\'s ticks comes late and the next with it (no stop and jump)', v > 0.3 && even.every((d) => Math.abs(d - v) <= v / 4), `${v.toFixed(3)}: ${even.map((d) => d.toFixed(3)).join(' ')}`);
  }
  ride.dx = ride.dz = 0;
  step(host, 3);
  check('riding: and just where the host has it once it stops', near(cr.x, ride.x) && near(copyOf(b, ride).x, ride.x) && near(a.player.x, ride.x) && a.player.vehicle === cr, `${cr.x} ${ride.x}`);
  getOut(a);
  check('riding: and out with the sneak key', ha.vehicle === null && a.player.vehicle === null);
  ride.remove();
  step(host, 2);
}

// ---------------------------------------------------------------------------
// holding forward in a stopped cart
{
  track('rail', -12, 30, 18);
  const c = cart('minecart', 0, 18);
  step(host, 3);
  aim(a, c);
  click(a, 'use', c);
  a.player.yaw = -90;
  a.player.input.forward = true;
  step(host, 40);
  a.player.input.forward = false;
  check('nudged: holding forward in a stopped cart pushes it slowly the way the guest looks (east)', ha.vehicle === c && c.x > 0.8 && c.dx > 0 && Math.abs(c.z - 18.5) < 1e-6, `${c.x} ${c.dx}`);
  getOut(a);
  c.remove();
  step(host, 2);
}

// ---------------------------------------------------------------------------
// a detector rail and the powered rails it leads to, as the guests see them
{
  track('rail', 30, 34, 6);
  lvl.setBlock(35, G, 6, m.getBlock('detector_rail').state({ shape: 'east_west' }));
  track('powered_rail', 36, 38, 6);
  track('rail', 39, 45, 6);
  step(host, 3);
  const c = cart('chest_minecart', 35, 6);
  step(host, 3);
  check('detector: the guests see it powered with a cart on it, and the powered rails it leads to', gprop(a, 35, G, 6, 'powered') === true && [36, 37, 38].every((x) => gprop(a, x, G, 6, 'powered')) && gprop(b, 35, G, 6, 'powered') === true);
  c.remove();
  step(host, 25);
  check('detector: and off again a second after it\'s gone', gprop(a, 35, G, 6, 'powered') === false && ![36, 37, 38].some((x) => gprop(a, x, G, 6, 'powered')) && gprop(b, 35, G, 6, 'powered') === false);
}

// ---------------------------------------------------------------------------
// a guest feeds a furnace minecart
{
  track('rail', -4, 40, 24);
  const f = cart('furnace_minecart', 6, 24);
  step(host, 3);
  give(a, ItemStack.of('coal', 2));
  put(a, 4.5, G, 24.5, -90, (Math.atan2(1.62 - 0.4, 1.51) * 180) / Math.PI);
  click(a, 'use', f);
  check('furnace minecart: a guest feeds it coal (one used, on both sides)', f.fuel > 3500 && ha.inventory.main[0]?.count === 1 && a.player.inventory.main[0]?.count === 1, `${f.fuel} ${ha.inventory.main[0]?.count}`);
  step(host, 20);
  check('furnace minecart: it pushes off away from the guest (east), lit for everyone', f.x > 8 && f.xPush > 0 && copyOf(a, f).lit && copyOf(b, f).lit && Math.abs(copyOf(a, f).x - f.x) <= 0.81, `${f.x}`);
  f.remove();
  step(host, 2);
}

// ---------------------------------------------------------------------------
// a guest opens a hopper minecart
{
  track('rail', -4, 20, 30);
  const h = cart('hopper_minecart', 12, 30, (c) => c.container.set(2, ItemStack.of('apple', 7)));
  step(host, 3);
  give(a, null);
  aim(a, h);
  click(a, 'use', h);
  const gm = a.session.menus.open?.menu;
  check('hopper minecart: a guest\'s click opens its menu, a hopper\'s five slots titled "Minecart with Hopper"', gm instanceof m.HopperMenu && gm.title === 'Minecart with Hopper' && gm.slots.length === 41 && gm.slots[2].item?.item.id === 'apple' && gm.slots[2].item.count === 7, gm && `${gm.constructor.name} ${gm.title}`);
  gm?.clicked(2, 0, 'quick_move');
  step(host, 2);
  check('hopper minecart: the apples taken out, on the host', !h.container.get(2) && ha.inventory.main.some((s) => s?.item.id === 'apple' && s.count === 7));
  gm?.removed();
  step(host, 2);
  h.remove();
  step(host, 2);
  check('hopper minecart: its menu shut', host.server.sessionOf(ha).menus.containerId === 0);
}

// ---------------------------------------------------------------------------
// a TNT minecart lit on an activator rail
{
  track('rail', 40, 50, 30);
  lvl.setBlock(45, G, 30, m.getBlock('activator_rail').state({ shape: 'east_west' }));
  // (the guests near enough to hear it, out of its blast's reach)
  put(a, 45.5, G, 19.5, 180, 0);
  put(b, 52.5, G, 21.5, 180, 0);
  step(host, 3);
  const h0 = heard(a, 'entity.tnt.primed'), hb0 = heard(b, 'entity.tnt.primed');
  const t = cart('tnt_minecart', 45, 30);
  lvl.setBlock(45, G, 31, m.S('redstone_block'));
  step(host, 2);
  const ct = copyOf(a, t);
  check('TNT minecart: lit on the host, the guests hear its hiss and see its fuse burning', t.isPrimed() && ct && ct.fuse > 0 && ct.fuse < 80 && heard(a, 'entity.tnt.primed') === h0 + 1 && heard(b, 'entity.tnt.primed') === hb0 + 1, `${ct?.fuse}`);
  const same = [];
  for (let i = 0; i < 12; i++) {
    step(host, 1);
    same.push(ct.fuse === t.fuse && flashing(ct) === flashing(t));
  }
  check('TNT minecart: counting down and flashing on the guest\'s side as on the host', same.every(Boolean) && ct.fuse < 70, `${ct.fuse} ${t.fuse}`);
  const e0 = heard(a, 'entity.generic.explode');
  step(host, 75);
  check('TNT minecart: it goes off, heard by the guests, gone from their worlds', t.removed && heard(a, 'entity.generic.explode') === e0 + 1 && !a.session.entities.has(t.id));
  check('TNT minecart: the rails left, on the guests\' side too', [43, 44, 45, 46, 47].every((x) => m.isRail(lvl.getState(x, G, 30)) && m.isRail(a.world.getState(x, G, 30))));
}

// ---------------------------------------------------------------------------
// a guest sets a hopper minecart on a rail
{
  track('rail', 20, 22, 36);
  step(host, 3);
  give(a, ItemStack.of('hopper_minecart'));
  put(a, 21.5, G, 34.5, 0, (Math.atan2(1.62 - 0.06, 2) * 180) / Math.PI);
  click(a, 'use', null);
  const placed = lvl.entities.find((e) => e.type === 'hopper_minecart' && !e.removed && near(e.x, 21.5) && near(e.z, 36.5));
  check('placing: a guest sets a hopper minecart on the rail it clicked (one used), the other guest sees it', placed && !ha.inventory.main[0] && copyOf(b, placed) instanceof m.MinecartHopper);
}

// ---------------------------------------------------------------------------
// one who joins late
{
  track('rail', 55, 65, 40);
  lvl.setBlock(60, G, 40, m.getBlock('activator_rail').state({ shape: 'east_west' }));
  lvl.setBlock(60, G, 41, m.S('redstone_block'));
  const off = cart('hopper_minecart', 60, 40, (c) => c.setCustomName('Hoppy'));
  const lit = cart('furnace_minecart', 56, 40, (c) => (c.fuel = 3000));
  track('rail', 55, 65, 44);
  const tnt = cart('tnt_minecart', 58, 44, (c) => (c.fuse = 1500));
  step(host, 5);
  const c = makeGuest(host, 'Kai', { viewDistance: 4 });
  step(host, 40);
  put(c, 58.5, G, 36.5, 180, 0);
  step(host, 10);
  const [co, cl, cn] = [off, lit, tnt].map((e) => copyOf(c, e));
  check('late: a guest who joins late sees a switched-off hopper minecart as it is, its name too', off.enabled === false && co instanceof m.MinecartHopper && co.enabled === false && co.customName === 'Hoppy');
  check('late: a lit furnace minecart lit, a lit TNT minecart burning', cl instanceof m.MinecartFurnace && cl.lit && cn instanceof m.MinecartTNT && cn.fuse > 0 && cn.fuse === tnt.fuse);
  check('late: the activator rail powered', gprop(c, 60, G, 40, 'powered') === true);
  lvl.setBlock(60, G, 41, 0);
  step(host, 3);
  check('late: and the rail\'s power going, for it too', gprop(c, 60, G, 40, 'powered') === false && copyOf(c, off).enabled === true);
  tnt.remove();
  step(host, 2);
}

await exitWithStatus(close);
