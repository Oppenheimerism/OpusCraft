// Multiplayer checks for the cake and the candle cakes (node tests/survival-blocks/cake-mp.mjs): a guest's clicks act
// on the host, which decides: a hungry guest eats a slice (its food and the cake's bites the same on both sides), a
// full one doesn't; a guest puts a candle in, lights it with flint and steel and puts it out with its hand, everyone
// near hearing it; it eats a candle cake (the candle dropped for all to see); a guest who joins later sees each cake as
// it is.
import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, step, check, exitWithStatus } from '../multiplayer/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/game/cake.ts', '/src/game/candles.ts', '/src/world/blocksCake.ts']);

const host = flatHost(m, 5, { guestGameMode: 'survival', gameMode: 'survival' });
const lvl = host.level;
const a = makeGuest(host, 'Alex', { viewDistance: 4 });
step(host, 30);
const ha = hostCopy(host, a);
const S = (id, n = 1) => m.ItemStack.of(id, n);
const name = (w, x, y, z) => m.BLOCKS[m.STATE_BLOCK[w.getState(x, y, z)]].name;
const prop = (w, x, y, z, k) => {
  const st = w.getState(x, y, z);
  return m.BLOCKS[m.STATE_BLOCK[st]].get(st, k);
};
const heard = (g, n) => g.level.sounds.filter((s) => s.name === n).length;

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
/** the guest holding `stack` (null: nothing), in its first hotbar slot, as the host gives it */
function hold(g, stack) {
  const inv = hostCopy(host, g).inventory;
  inv.main[0] = stack;
  inv.selected = 0;
  g.player.inventory.selected = 0;
  inv.version++;
  step(host, 3);
}
/** the guest's food, as the host sets it */
function food(g, n) {
  hostCopy(host, g).food.level = n;
  step(host, 3);
}
/** a press of the use button looking at (x, y, z) */
function useAt(g, x, y, z) {
  lookAt(g, x, y, z);
  step(host, 2);
  g.session.input(false, false, true, false, null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 4);
}
const same = (x, y, z) => a.world.getState(x, y, z) === lvl.getState(x, y, z);

walkTo(a, 2.5, -2.5);
lvl.setBlock(2, 64, 0, m.S('cake'));
lvl.setBlock(4, 64, 0, m.S('cake'));
step(host, 3);
check('setup: the guest sees the cakes', name(a.world, 2, 64, 0) === 'cake' && name(a.world, 4, 64, 0) === 'cake');

// ---------------------------------------------------------------------------
// eating
{
  hold(a, null);
  food(a, 20);
  useAt(a, 2.5, 64.25, 0.1);
  check('full: the guest eats nothing', prop(lvl, 2, 64, 0, 'bites') === 0 && ha.food.level === 20);
  food(a, 10);
  check('hungry: (the guest is told its food)', a.player.food.level === 10);
  useAt(a, 2.5, 64.25, 0.1);
  check('eat: a slice gone on the host', prop(lvl, 2, 64, 0, 'bites') === 1 && ha.food.level === 12);
  check('eat: and in the guest\'s world', prop(a.world, 2, 64, 0, 'bites') === 1 && same(2, 64, 0));
  check('eat: the guest is told its food', a.player.food.level === 12, String(a.player.food.level));
  useAt(a, 2.5, 64.25, 0.2);
  check('eat: another', prop(lvl, 2, 64, 0, 'bites') === 2 && same(2, 64, 0) && ha.food.level === 14);
}

// ---------------------------------------------------------------------------
// a candle in, lit, put out
{
  walkTo(a, 4.5, -2.5);
  hold(a, S('red_candle', 2));
  const c0 = heard(a, 'block.cake.add_candle');
  useAt(a, 4.5, 64.25, 0.1);
  check('candle: the red candle cake on the host', name(lvl, 4, 64, 0) === 'red_candle_cake' && prop(lvl, 4, 64, 0, 'lit') === false);
  check('candle: and in the guest\'s world', same(4, 64, 0));
  check('candle: one used, the guest\'s inventory too', ha.inventory.main[0]?.count === 1 && a.player.inventory.main[0]?.count === 1);
  check('candle: heard by the guest', heard(a, 'block.cake.add_candle') === c0 + 1);
  hold(a, S('flint_and_steel'));
  food(a, 5);
  useAt(a, 4.5, 64.7, 0.45);
  check('lit: flint and steel lights it, host and guest (not eaten)', prop(lvl, 4, 64, 0, 'lit') === true && same(4, 64, 0) && ha.food.level === 5);
  check('lit: the guest hears the flint and steel', heard(a, 'item.flintandsteel.use') >= 1);
  check('lit: light 3 in the guest\'s world', (a.world.getLight(4, 64, 0) & 15) === 3, String(a.world.getLight(4, 64, 0) & 15));
  hold(a, null);
  const x0 = heard(a, 'block.candle.extinguish');
  useAt(a, 4.5, 64.7, 0.45);
  check('out: the guest\'s hand on the candle puts it out, host and guest', prop(lvl, 4, 64, 0, 'lit') === false && same(4, 64, 0) && ha.food.level === 5);
  check('out: its hiss heard', heard(a, 'block.candle.extinguish') === x0 + 1);
}

// ---------------------------------------------------------------------------
// eating a candle cake; a late joiner
{
  const items0 = lvl.entities.filter((e) => e.type === 'item').length;
  useAt(a, 4.5, 64.25, 0.1);
  check('eat: the candle cake eaten: a cake with a slice gone, host and guest', name(lvl, 4, 64, 0) === 'cake' && prop(lvl, 4, 64, 0, 'bites') === 1 && same(4, 64, 0) && ha.food.level === 7);
  const dropped = lvl.entities.filter((e) => e.type === 'item').slice(items0);
  check('eat: its candle dropped on the host', dropped.length === 1 && (dropped[0].stack ?? dropped[0].item)?.item.id === 'red_candle');
  check('eat: the guest sees the candle', dropped.length === 1 && !!a.session.entities.get(dropped[0].id));
  lvl.setBlock(0, 64, 0, m.BLOCK_BY_NAME.get('cyan_candle_cake').state({ lit: true }));
  step(host, 3);
  const b = makeGuest(host, 'Steve', { viewDistance: 4 });
  step(host, 30);
  check('late joiner: sees the bitten cakes and the lit candle cake as they are', prop(b.world, 2, 64, 0, 'bites') === 2 && prop(b.world, 4, 64, 0, 'bites') === 1 && name(b.world, 0, 64, 0) === 'cyan_candle_cake' && prop(b.world, 0, 64, 0, 'lit') === true);
}

await exitWithStatus(close);
