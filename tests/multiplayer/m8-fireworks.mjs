// Firework rockets and guests (vanilla FireworkRocketEntity, FireworkRocketItem, CrossbowItem). A rocket used while
// gliding is fixed to the glider and pushes it along its look: on the host the push goes to the host's copy of a
// guest's player, which the guest's own moves overwrite, so a guest's copy of the rocket gives the guest's own player
// the push, as vanilla's client copy does; a guest then speeds up as the host's own player does. A rocket set off on
// a block and one shot from a crossbow fly, burst and hurt as they do for the host, and the guest sees and hears them.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/entity/elytra.ts', '/src/item/fireworks.ts', '/src/item/crossbow.ts', '/src/entity/animals.ts']);

const host = flatHost(m, 6, { guestGameMode: 'survival', gameMode: 'survival' });
const level = host.level;
const g = makeGuest(host, 'Alex', { viewDistance: 4 });
step(host, 40);
const ha = hostCopy(host, g);
const sess = host.server.sessionOf(ha);
const hp = host.player;

/** what the guest's player wears and holds (the host's to say, the guest told) */
function equip(p, { chest = null, main = null, off = null }) {
  const inv = p.inventory;
  inv.armor[2] = chest;
  inv.main[0] = main;
  inv.offhand = off;
  inv.selected = 0;
  inv.version++;
}
/** a click of the guest's use button (sent with its next tick, acted on by the host in the one after) */
function use() {
  g.session.input(false, false, true, false, null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 1);
}
const speed = (p) => Math.hypot(p.x - p.xo, p.z - p.zo);
const rocketsOf = (who) => level.entities.filter((e) => e instanceof m.FireworkRocket && !e.removed && e.attachedTo === who);

/**
 * every rocket the host has had, where it was set off and the guest's copy of it (each kept as it came: over a slow
 * network a fast one can come and go within one of the guest's ticks); and the two gliders' speeds, tick by tick, to
 * look back over
 */
const rockets = new Map();
const copies = new Map();
const ticks = [];
let onTick = null;
const levelTick = level.tick.bind(level);
level.tick = () => {
  levelTick();
  const gp = g.player;
  ticks.push({ guest: speed(gp), host: speed(hp), at: [gp.x, gp.y, gp.z], boosted: g.level.entities.some((e) => e instanceof m.FireworkRocket && !e.removed && e.attachedTo === gp) });
  onTick?.();
};
const addEntity = level.addEntity.bind(level);
level.addEntity = (e) => {
  if (e instanceof m.FireworkRocket) rockets.set(e, { y: e.y });
  return addEntity(e);
};
const addCopy = g.level.addMirrorEntity.bind(g.level);
g.level.addMirrorEntity = (e) => {
  if (e instanceof m.FireworkRocket) copies.set(g.session.copies.get(e)?.netId, e);
  return addCopy(e);
};
/** the first rocket (since `from`) that `test` takes */
const rocketSince = (from, test) => [...rockets.keys()].slice(from).find(test) ?? null;
/** the guest's copy of the host's rocket `e`, as it was last (gone or not) */
const copyOfRocket = (e) => (e && copies.get(e.id)) ?? null;

// ---------------------------------------------------------------------------
// gliding, a rocket used: the guest speeds up along its look as the host's own player does
{
  equip(ha, { chest: m.ItemStack.of('elytra'), main: new m.ItemStack(m.getItem('firework_rocket'), 16) });
  equip(hp, { chest: m.ItemStack.of('elytra') });
  sess.teleportTo(0.5, 260, 0.5, 0, 0);
  step(host, 4);
  hp.moveTo(40.5, 260, 0.5, 0, 0);
  hp.dx = hp.dy = hp.dz = 0;
  // (both off the ground, gliding, looking south and a little up, which bleeds a glide's speed away (a long glide
  // looking level comes to a rocket's pace by itself): the jump key in the air, Player.tryToStartFallFlying)
  for (let k = 0; k < 3; k++) {
    step(host, 1);
    g.player.yaw = hp.yaw = 0;
    g.player.pitch = hp.pitch = -20;
  }
  const a = m.tryToStartFallFlying(g.player), b = m.tryToStartFallFlying(hp);
  step(host, 8);
  check('glide: the guest glides with its elytra, and the host has it gliding', a && b && g.player.fallFlying && ha.fallFlying && hp.fallFlying);
  // the guest uses a rocket; the host's own player sets one off as the guest's comes (as its own game's use would)
  const from = ticks.length;
  let hostFrom = -1;
  onTick = () => {
    if (hostFrom < 0 && rocketsOf(ha).length) {
      level.addEntity(m.FireworkRocket.attached(level, m.ItemStack.of('firework_rocket'), hp));
      hostFrom = ticks.length;
    }
  };
  use();
  step(host, 14);
  onTick = null;
  const rocket = rocketSince(0, (e) => e.attachedTo === ha);
  check('glide: the guest\'s rocket is fixed to it, on the host and on its own screen (where it isn\'t drawn)', !!rocket && copyOfRocket(rocket)?.attachedTo === g.player && ha.inventory.main[0]?.count === 15 && g.player.inventory.main[0]?.count === 15);
  const pushed = ticks.findIndex((t, i) => i >= from && t.boosted);
  const before = pushed > 0 ? ticks[pushed - 1].guest : NaN;
  const guestMost = Math.max(...ticks.slice(pushed, pushed + 12).map((t) => t.guest));
  const hostMost = Math.max(...ticks.slice(hostFrom, hostFrom + 12).map((t) => t.host));
  check('glide: the guest speeds up along its look (from its glide to a rocket\'s pace)', pushed > 0 && guestMost - before > 0.4 && guestMost > 1.2, `${before?.toFixed(2)} → ${guestMost.toFixed(2)} blocks a tick`);
  check('glide: as fast as the host\'s own player with its rocket', Math.abs(guestMost - hostMost) < 0.25, `guest ${guestMost.toFixed(2)}, host ${hostMost.toFixed(2)}`);
  // (the host's copy where the guest was a few ticks before: its moves taken as they came, none sent back)
  const behind = Math.min(...ticks.slice(-15).map((t) => Math.hypot(ha.x - t.at[0], ha.y - t.at[1], ha.z - t.at[2])));
  check('glide: the host has the guest where it flew (its moves taken, none sent back)', behind < 2 && ha.z > 10, `host copy at ${ha.z.toFixed(1)}, ${behind.toFixed(2)} from where the guest was`);
  for (let k = 0; k < 40 && rocketsOf(ha).length; k++) step(host, 1);
  step(host, 2);
  check('glide: the rocket spent, it\'s gone from the guest\'s world too', !rocketsOf(ha).length && !!copyOfRocket(rocket) && !g.level.entities.includes(copyOfRocket(rocket)));
  const spent = ticks.length;
  step(host, 10);
  check('glide: and the push is gone with it (the glide slows)', ticks.slice(spent).every((t) => !t.boosted) && speed(g.player) < guestMost);
  // (down: what happens on the ground next)
  equip(ha, {});
  equip(hp, {});
  sess.teleportTo(0.5, 64, 0.5, 0, 0);
  hp.moveTo(0.5, 64, 6.5, 180, 0);
  step(host, 10);
}

// ---------------------------------------------------------------------------
// set off on a block: it flies up from where the guest clicked, bursts, and the guest sees and hears it
{
  const RED = 0xb3312c;
  const star = m.fireworkRocket(1, [m.explosion('small_ball', [RED])], 3);
  equip(ha, { main: star });
  step(host, 3);
  // looking at the ground two blocks before it
  g.player.yaw = 0;
  g.player.pitch = 50;
  const s0 = g.level.sounds.length, p0 = g.level.particleCalls.length, r0 = rockets.size;
  use();
  step(host, 8);
  const rocket = rocketSince(r0, (e) => e.owner === ha && !e.attachedTo);
  const from = rocket && rockets.get(rocket).y, copy = copyOfRocket(rocket);
  check('on a block: the guest\'s rocket set off from the ground it clicked, one used up', !!rocket && Math.abs(from - 64) < 1.5 && ha.inventory.main[0]?.count === 2, rocket ? `from ${from.toFixed(2)}` : 'none');
  check('on a block: the guest sees it fly up, and hears it go', !!copy && copy.y > from + 1 && g.level.sounds.slice(s0).some((x) => x.name === 'entity.firework_rocket.launch'));
  for (let k = 0; k < 40 && rocket && !rocket.removed; k++) step(host, 1);
  step(host, 2);
  const bursts = g.level.particleCalls.slice(p0).filter((x) => x.method === 'fireworks');
  check('on a block: it bursts in the guest\'s sky, its star as it was made', !!rocket?.removed && !copyOf(g, rocket) && bursts.length === 1 && bursts[0].args[6]?.[0]?.shape === 'small_ball', `${bursts.length} bursts`);
  check('on a block: and its sparks trailed it on the way up', g.level.particleCalls.slice(p0).filter((x) => x.args[0] === 'firework').length > 5);
}

// ---------------------------------------------------------------------------
// from a crossbow: loaded with the rocket in the guest's other hand, shot along its look, bursting on what it hits
{
  const RED = 0xb3312c;
  const pig = m.createMob('pig', level);
  pig.moveTo(0.5, 64, 10.5, 0, 0);
  level.addEntity(pig);
  equip(ha, { main: m.ItemStack.of('crossbow'), off: m.fireworkRocket(1, [m.explosion('large_ball', [RED])], 2) });
  step(host, 3);
  g.player.yaw = 0;
  g.player.pitch = -2;
  // drawn (vanilla: 25 ticks), then let go: loaded
  g.session.input(false, false, true, true, null);
  step(host, 1);
  for (let k = 0; k < 30; k++) {
    g.session.input(false, false, false, true, null);
    step(host, 1);
  }
  g.session.input(false, false, false, false, null);
  step(host, 3);
  const charged = ha.inventory.main[0]?.tag?.charged ?? [];
  check('crossbow: drawn and let go, it\'s loaded with the rocket from the other hand (and the guest sees it so)', charged.length === 1 && charged[0].id === 'firework_rocket' && ha.inventory.offhand?.count === 1 && (g.player.inventory.main[0]?.tag?.charged ?? []).length === 1);
  const health = pig.health;
  // (the pig where it was, held still (its wandering mind stopped); the guest's look on the middle of it)
  pig.serverAiStep = () => {};
  pig.moveTo(0.5, 64, 10.5, 0, 0);
  pig.dx = pig.dy = pig.dz = 0;
  g.player.pitch = (Math.atan2(g.player.y + g.player.eyeHeight - (64 + pig.height / 2), 10) * 180) / Math.PI;
  const s0 = g.level.sounds.length, r0 = rockets.size;
  use();
  step(host, 1);
  const rocket = rocketSince(r0, (e) => e.owner === ha && e.shotAtAngle);
  const copy = copyOfRocket(rocket);
  check('crossbow: shot, the rocket flies along the guest\'s look, on its back as a crossbow\'s does (on its screen too)', !!rocket && rocket.dz > 1 && copy?.shotAtAngle === true, rocket ? `dz ${rocket.dz.toFixed(2)}` : 'none');
  check('crossbow: and the guest heard it shot', g.level.sounds.slice(s0).some((x) => x.name === 'item.crossbow.shoot'));
  for (let k = 0; k < 20 && rocket && !rocket.removed; k++) step(host, 1);
  step(host, 2);
  check('crossbow: it bursts on the pig it hits, and hurts it', !!rocket?.removed && pig.health < health && !copyOf(g, rocket), `${health} → ${pig.health}`);
  check('crossbow: the guest unhurt, out of its reach', ha.health === ha.maxHealth);
}

exitWithStatus(close);
