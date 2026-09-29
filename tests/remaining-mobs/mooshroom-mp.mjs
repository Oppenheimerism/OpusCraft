// Multiplayer checks for the mooshroom (node tests/remaining-mobs/mooshroom-mp.mjs; remaining mobs, milestone 4), over
// the multiplayer harness (tests/multiplayer/lib.mjs): a guest sees a mooshroom as the host has it (red or brown, a
// calf's size) and sees it turn when lightning strikes it, hearing it; a guest's bowl gets mushroom stew, the host
// deciding (the stew in the guest's hand, its sound heard); a guest's flower goes into a brown one and the next bowl
// comes back as suspicious stew with its effect; a guest's shears leave a cow and five mushrooms (the mooshroom gone
// for the guest too, the puff seen, the shears worn); a guest's huge mushroom from bone meal; and a guest in creative
// takes a suspicious stew from the creative tabs with its effect kept.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, assertMirrorEquals, check, exitWithStatus } from '../multiplayer/lib.mjs';

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/entity/mooshroom.ts', '/src/entity/animals.ts', '/src/game/suspiciousStew.ts', '/src/entity/lightning.ts', '/src/game/mushrooms.ts',
  '/src/item/creativeStacks.ts',
]);

const host = flatHost(m, 4, { guestGameMode: 'survival' });
const lvl = host.level;
lvl.doDaylightCycle = false;
lvl.dayTime = 6000;
const g = makeGuest(host, 'Alex', { viewDistance: 3 });
step(host, 30);
const hg = hostCopy(host, g);
check('(the guest is in, in survival)', !!hg && !!g.world && hg.gameMode === 'survival');

/** a mooshroom of `variant` at (x, 64, z), standing still */
function mooshroom(x, z, variant = 'red', { baby = false } = {}) {
  const e = m.createMob('mooshroom', lvl);
  e.moveTo(x, 64, z, 0, 0);
  e.finalizeSpawn('command');
  e.variant = variant;
  e.persistenceRequired = true;
  if (baby) e.setAge(-24000);
  e.serverAiStep = () => {};
  lvl.addEntity(e);
  return e;
}
/** what the guest holds in its first hotbar slot (the host's copy given it, as /give would) */
function give(stack) {
  hg.inventory.main[0] = stack;
  hg.inventory.selected = 0;
  hg.inventory.version++;
  step(host, 3);
}
/** a click of `button` ('attack' or 'use') with `e`'s copy under the crosshair */
function click(button, e) {
  g.session.input(button === 'attack', false, button === 'use', false, e ? copyOf(g, e) : null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 3);
}
/** the guest standing at (x, 64, z) looking at (tx, ty, tz) */
function standLooking(x, z, tx, ty, tz) {
  const p = g.player;
  p.flying = false;
  p.dx = p.dy = p.dz = 0;
  const dx = tx - x, dy = ty - (64 + p.eyeHeight), dz = tz - z;
  const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  p.moveTo(x, 64, z, yaw, pitch);
  step(host, 4);
}
const heard = (name) => g.level.sounds.filter((s) => s.name === name);

// ---------------------------------------------------------------------------
// seeing a mooshroom, and lightning
{
  const e = mooshroom(3.5, 3.5, 'red');
  step(host, 4);
  const c = copyOf(g, e);
  check('a guest has a copy of the host\'s mooshroom, a mooshroom (a cow), red as the host\'s', c instanceof m.Mooshroom && c instanceof m.Cow && c.variant === 'red', `${c?.type} ${c?.variant}`);
  g.level.sounds.length = 0;
  const bolt = new m.LightningBolt(lvl);
  bolt.moveTo(3.5, 64, 3.5, 0, 0);
  e.thunderHit(bolt);
  step(host, 3);
  check('...struck by lightning on the host: brown for the guest too, the shimmer heard', c.variant === 'brown' && heard('entity.mooshroom.convert').length === 1 && e.health === 10);
  const calf = mooshroom(-3.5, 3.5, 'brown', { baby: true });
  step(host, 4);
  const cc = copyOf(g, calf);
  check('...a calf: half the size (0.45 by 0.7), brown', cc?.isBaby() && Math.abs(cc.width - 0.45) < 1e-6 && Math.abs(cc.height - 0.7) < 1e-6 && cc.variant === 'brown');
  step(host, 20);
  assertMirrorEquals(host, g, 'with mooshrooms about');
  e.remove();
  calf.remove();
  step(host, 3);
  check('...gone when they are', !copyOf(g, e) && !copyOf(g, calf));
}

// ---------------------------------------------------------------------------
// a guest's bowl, flowers and suspicious stew
{
  const e = mooshroom(2.5, -2.5, 'brown');
  step(host, 4);
  standLooking(0.5, -2.5, e.x, e.y + 0.8, e.z);
  give(m.ItemStack.of('bowl'));
  g.level.sounds.length = 0;
  click('use', e);
  check('a guest\'s bowl on a mooshroom: mushroom stew in its hand, the host\'s doing', hg.inventory.main[0]?.item.id === 'mushroom_stew');
  step(host, 3);
  check('...the guest\'s too, the milking heard', g.player.inventory.main[0]?.item.id === 'mushroom_stew' && heard('entity.mooshroom.milk').length === 1);
  give(m.ItemStack.of('lily_of_the_valley', 2));
  g.level.particleCalls.length = 0;
  click('use', e);
  check('a guest\'s flower to a brown one: taken (one used), in it on the host', hg.inventory.main[0]?.count === 1 && JSON.stringify(e.stewEffects) === JSON.stringify([{ id: 'poison', duration: 220 }]));
  step(host, 3);
  const swirls = g.level.particleCalls.filter((x) => x.method === 'spell' && x.args[0] === 'effect').length;
  check('...the guest sees its swirls, hears it munch', swirls === 4 && heard('entity.mooshroom.eat').length === 1 && g.player.inventory.main[0]?.count === 1, `${swirls}`);
  check('...(what\'s in it isn\'t the guest\'s to know)', copyOf(g, e).stewEffects === null);
  give(m.ItemStack.of('bowl'));
  click('use', e);
  step(host, 3);
  const s = g.player.inventory.main[0];
  check('...then its bowl: suspicious stew with the poison in it, in the guest\'s hand', s?.item.id === 'suspicious_stew' && JSON.stringify(s.tag?.stewEffects) === JSON.stringify([{ id: 'poison', duration: 220 }]) && e.stewEffects === null && heard('entity.mooshroom.suspicious_milk').length === 1);
  e.remove();
  step(host, 3);
  assertMirrorEquals(host, g, 'after the stew');
}

// ---------------------------------------------------------------------------
// a guest's shears
{
  const e = mooshroom(2.5, 6.5, 'red');
  step(host, 4);
  standLooking(0.5, 6.5, e.x, e.y + 0.8, e.z);
  give(m.ItemStack.of('shears'));
  const before = new Set(lvl.entities);
  g.level.particleCalls.length = 0;
  click('use', e);
  step(host, 3);
  const cow = lvl.entities.find((x) => !before.has(x) && x.type === 'cow');
  const drops = lvl.entities.filter((x) => !before.has(x) && x.type === 'item' && x.stack.item.id === 'red_mushroom');
  check('a guest\'s shears on a mooshroom: a cow in its place and five red mushrooms on the host, the shears worn', e.removed && !!cow && drops.length === 5 && hg.inventory.main[0]?.damage === 1);
  const cc = cow && copyOf(g, cow);
  check('...the guest\'s copy of it gone, a cow (not a mooshroom) there instead, the mushrooms there too, the puff seen', !copyOf(g, e) && cc instanceof m.Cow && !(cc instanceof m.Mooshroom) && drops.every((d) => copyOf(g, d)) && g.level.particleCalls.some((x) => x.method === 'spawn' && x.args[0] === 'explosion') && heard('entity.mooshroom.shear').length === 1);
  cow?.remove();
  for (const d of drops) d.remove();
  step(host, 3);
  assertMirrorEquals(host, g, 'after the shearing');
}

// ---------------------------------------------------------------------------
// a guest's bone meal on a mushroom
{
  // (a patch of mycelium just ahead of where the guest stands)
  for (let x = -6; x <= 6; x++) for (let z = 8; z <= 16; z++) lvl.setBlock(x, 63, z, m.S('mycelium'));
  lvl.setBlock(0, 64, 10, m.S('red_mushroom'));
  step(host, 3);
  give(m.ItemStack.of('bone_meal', 64));
  standLooking(0.5, 7.5, 0.5, 64.2, 10.5);
  let grew = false, used = 0;
  for (let i = 0; i < 40 && !grew; i++) {
    click('use', null);
    used++;
    grew = m.blockOf(lvl.getState(0, 64, 10)).name === 'mushroom_stem';
  }
  step(host, 3);
  check('a guest\'s bone meal on a mushroom: sooner or later a huge one (a bone meal a try), the host growing it, the guest seeing it', grew && g.world.getState(0, 64, 10) === lvl.getState(0, 64, 10) && hg.inventory.main[0]?.count === 64 - used, `${used} used`);
  assertMirrorEquals(host, g, 'after the huge mushroom');
}

// ---------------------------------------------------------------------------
// a guest in creative takes a suspicious stew from the creative tabs
{
  hg.setGameMode('creative');
  step(host, 5);
  const stews = m.stacksOf(m.getItem('suspicious_stew'));
  const pick = stews.find((s) => s.tag.stewEffects[0].id === 'blindness');
  g.player.inventory.main[5] = pick.copy();
  g.player.inventory.version++;
  step(host, 5);
  const got = hg.inventory.main[5];
  check('a guest in creative takes the blindness stew from the creative tabs: the host\'s copy has it, blindness and all', got?.item.id === 'suspicious_stew' && JSON.stringify(got.tag?.stewEffects) === JSON.stringify([{ id: 'blindness', duration: 220 }]), JSON.stringify(got?.tag));
  g.player.inventory.main[6] = new m.ItemStack(m.getItem('suspicious_stew'), 1, 0, { stewEffects: [{ id: 'instant_health', duration: 1 }] });
  g.player.inventory.version++;
  step(host, 5);
  check('...one no tab has is a plain stew on the host', hg.inventory.main[6]?.item.id === 'suspicious_stew' && !hg.inventory.main[6].tag?.stewEffects, JSON.stringify(hg.inventory.main[6]?.tag));
  hg.setGameMode('survival');
  step(host, 5);
}

await exitWithStatus(close);
