// Multiplayer checks for the bee (node tests/remaining-mobs/bee-mp.mjs; remaining mobs, milestone 1), over the
// multiplayer harness (tests/multiplayer/lib.mjs): a guest sees a bee as the host has it (its nectar, its anger, its
// stinger, its roll, a baby's size) and hears its buzz; a guest's bottle takes honey from a full nest, the host
// deciding (the bees come out after that guest), and the nest's honey is gone in everyone's world; a guest breaking a
// nest with silk touch takes its bees along; and a guest placing that nest puts them back.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, assertMirrorEquals, check, exitWithStatus } from '../multiplayer/lib.mjs';

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/entity/bee.ts', '/src/game/beehive.ts', '/src/world/blocksBees.ts']);

const host = flatHost(m, 4);
const lvl = host.level;
const g = makeGuest(host, 'Alex', { viewDistance: 3 });
step(host, 30);
const hg = hostCopy(host, g);
check('(the guest is in)', !!hg && !!g.world);

/** `g`'s player hovering at (x, y, z) looking at (tx, ty, tz) (the host's copy there too) */
function hoverLooking(x, y, z, tx, ty, tz) {
  const p = g.player;
  p.flying = true;
  p.onGround = false;
  p.dx = p.dy = p.dz = 0;
  const dx = tx - x, dy = ty - (y + p.eyeHeight), dz = tz - z;
  const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  p.moveTo(x, y, z, yaw, pitch);
  step(host, 3);
}
/** what `g` holds in its first hotbar slot */
function hold(stack) {
  const inv = g.player.inventory;
  inv.main[0] = stack;
  inv.selected = 0;
  inv.version++;
  step(host, 2);
}
function click(attack) {
  if (attack) g.session.input(true, false, false, false);
  else g.session.input(false, false, true, false);
  step(host, 1);
  g.session.input(false, false, false, false);
  step(host, 3);
}
const nest = (x, y, z, n, h) => {
  lvl.setBlock(x, y, z, m.getBlock('bee_nest').state({ facing: 'north', honey_level: h }));
  const be = lvl.world.getBlockEntity(x, y, z);
  for (let i = 0; i < n; i++) be.storeBee(m.newOccupant(0));
  be.container.changed();
  return be;
};

// ---------------------------------------------------------------------------
// seeing a bee
{
  const b = m.createMob('bee', lvl);
  b.moveTo(3.5, 66, 3.5, 0, 0);
  b.persistenceRequired = true;
  b.serverAiStep = () => {};
  lvl.addEntity(b);
  step(host, 4);
  const c = copyOf(g, b);
  check('a guest has a copy of the host\'s bee, a bee', c instanceof m.Bee && c.type === 'bee' && Math.abs(c.x - b.x) < 0.1);
  b.hasNectar = true;
  b.angerTime = 300;
  step(host, 3);
  check('...with nectar and angry when the host\'s is (its skin: bee_angry_nectar)', c.hasNectar === true && c.isAngry());
  // (the host works out `rolling` each tick: angry, its stinger in, what it's after within two blocks)
  const pig = m.createMob('pig', lvl);
  pig.moveTo(3.5, 64, 4.5, 0, 0);
  pig.serverAiStep = () => {};
  lvl.addEntity(pig);
  b.setTarget(pig);
  step(host, 6);
  check('...rolling over as it closes in on what it\'s after (the roll worked out on the guest)', b.rolling && c.rolling && c.roll.amount > 0.5, `${b.rolling} ${c.rolling} ${c.roll.amount}`);
  b.setTarget(null);
  pig.remove();
  b.angerTime = 0;
  b.hasStung = true;
  step(host, 12);
  check('...calm again, its stinger gone, its roll eased out', !c.isAngry() && c.hasStung === true && !c.rolling && c.roll.amount === 0);
  b.setAge(-24000);
  step(host, 3);
  check('...a baby when the host\'s is, half the size', c.isBaby() && Math.abs(c.width - 0.35) < 1e-6);
  b.remove();
  step(host, 3);
  check('...gone when it is', !copyOf(g, b));
}

// ---------------------------------------------------------------------------
// a guest takes honey
{
  const be = nest(0, 64, 5, 2, 5);
  step(host, 3);
  check('the guest\'s world has the full nest', g.world.getState(0, 64, 5) === lvl.getState(0, 64, 5) && m.honeyLevel(g.world.getState(0, 64, 5)) === 5);
  hoverLooking(0.5, 64, 3.3, 0.5, 64.5, 5);
  hold(m.ItemStack.of('glass_bottle', 4));
  click(false);
  check('a guest\'s glass bottle on a full nest: the host gives it a honey bottle, the bottle used', hg.inventory.main.some((s) => s?.item.id === 'honey_bottle') && hg.inventory.main[0]?.count === 3);
  step(host, 3);
  check('...the guest has it too', g.player.inventory.main.some((s) => s?.item.id === 'honey_bottle'));
  check('...the nest\'s honey gone, in the host\'s world and the guest\'s', m.honeyLevel(lvl.getState(0, 64, 5)) === 0 && m.honeyLevel(g.world.getState(0, 64, 5)) === 0);
  const out = lvl.entities.filter((e) => e instanceof m.Bee && !e.removed);
  check('...its bees come out after that guest (no campfire under it)', be.isEmpty() && out.length === 2 && out.every((b) => b.target === hg));
  step(host, 3);
  check('...and the guest sees them, angry', out.every((b) => copyOf(g, b)?.isAngry()));
  for (const b of out) b.remove();
  assertMirrorEquals(host, g, 'after the honey');
}

// ---------------------------------------------------------------------------
// a guest breaks a nest with silk touch, and puts it back
{
  nest(6, 64, 5, 3, 2);
  hg.setGameMode('survival');
  step(host, 3);
  // (the axe from the host, as /give would: what a guest's creative slots take is only what the creative tabs list,
  // so survival it is, its slots going by the host's)
  const axe = m.ItemStack.of('diamond_axe');
  axe.tag = { enchantments: { silk_touch: 1 } };
  hg.inventory.main[0] = axe;
  hg.inventory.selected = 0;
  hg.inventory.version++;
  const p = g.player;
  p.flying = false;
  p.dx = p.dy = p.dz = 0;
  p.moveTo(6.5, 64, 3.3, 0, 30);
  step(host, 4);
  check('(the guest has the host\'s axe in hand, on the ground)', p.inventory.main[0]?.item.id === 'diamond_axe' && p.inventory.selected === 0 && hg.onGround);
  g.session.input(true, true, false, false);
  for (let i = 0; i < 40 && lvl.getState(6, 64, 5) !== 0; i++) {
    g.session.input(false, true, false, false);
    step(host, 1);
  }
  g.session.input(false, false, false, false);
  step(host, 3);
  const items = lvl.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id === 'bee_nest');
  const held = hg.inventory.main.find((s) => s?.item.id === 'bee_nest');
  const got = items[0]?.stack ?? held;
  check('a guest breaking a nest with silk touch: it comes away with its 3 bees and its honey, no bee out', lvl.getState(6, 64, 5) === 0 && got?.tag?.bees?.length === 3 && got.tag.blockState?.honey_level === '2' && !lvl.entities.some((e) => e instanceof m.Bee && !e.removed));
  // (walking over to it)
  if (items[0]) p.moveTo(items[0].x, 64, items[0].z, 0, 30);
  step(host, 20);
  const slot = hg.inventory.main.findIndex((s) => s?.item.id === 'bee_nest');
  check('...picked up, it\'s the guest\'s, bees and all', slot >= 0 && slot < 9 && hg.inventory.main[slot].tag?.bees?.length === 3 && p.inventory.main[slot]?.item.id === 'bee_nest', `${slot}`);
  // (placed standing on the ground, in front of it)
  if (slot >= 0 && slot < 9) p.inventory.selected = slot;
  p.inventory.version++;
  const tx = 10.5, ty = 64, tz = 5.5;
  p.moveTo(10.5, 64, 3.3, 0, (Math.atan2(64 + p.eyeHeight - ty, tz - 3.3) * 180) / Math.PI);
  step(host, 4);
  click(false);
  const placed = lvl.world.getBlockEntity(10, 64, 5);
  check('...placed by the guest, the nest has its bees and its honey again', placed?.occupantCount?.() === 3 && m.honeyLevel(lvl.getState(10, 64, 5)) === 2 && !hg.inventory.main.some((s) => s?.item.id === 'bee_nest'), `${m.blockOf(lvl.getState(10, 64, 5)).name}`);
  step(host, 3);
  check('...the guest sees it there, its honey in', g.world.getState(10, 64, 5) === lvl.getState(10, 64, 5));
  step(host, 20);
  check('...not the bees in it: those are the host\'s to know (vanilla: a hive has no update tag)', g.world.getBlockEntity(10, 64, 5)?.occupantCount?.() === 0 && lvl.world.getBlockEntity(10, 64, 5).occupantCount() === 3);
  hg.setGameMode('creative');
  step(host, 2);
  assertMirrorEquals(host, g, 'after the nest');
}

await exitWithStatus(close);
