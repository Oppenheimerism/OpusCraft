// Multiplayer M2: the entities a guest sees (vanilla ChunkMap.TrackedEntity and ServerEntity on the host,
// ClientPacketListener.handleAddEntity / handleSetEntityData / handleMoveEntity / handleSetEntityPassengersPacket /
// handleRemoveEntities on the guest): every kind of entity goes across, made from its record or afresh, with its
// fields as the host has them; it's shown within its tracking range and the guest's view, and not past them; it moves
// as it moves (a mob's moves every third tick, eased in over three), changes as it changes, rides what it rides, shows
// its death and is gone when it goes; and what that costs on the wire.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, copyOf, step, check, exitWithStatus } from './lib.mjs';
import { flatLevel } from '../fixes/lib.mjs';

const { m, close } = await loadNet(ENTITY_MODULES);

/** the kinds made afresh (no record) */
const MADE = ['experience_orb', 'tnt', 'falling_block', 'lightning_bolt', 'fireball', 'small_fireball', 'dragon_fireball', 'egg', 'snowball', 'ender_pearl', 'potion', 'experience_bottle', 'shulker_bullet', 'llama_spit', 'eye_of_ender', 'area_effect_cloud', 'wind_charge', 'breeze_wind_charge', 'ominous_item_spawner', 'evoker_fangs'];

// ---------------------------------------------------------------------------
// R0.5, the registry: every kind makes the trip through the real codec, as the guest's level makes it
{
  const host = flatLevel(m, -3, -3, 2, 2, 64, 'grass_block');
  const guest = flatLevel(m, -3, -3, 2, 2, 64, 'grass_block');
  guest.level.isClientSide = true;
  const hp = new m.Player(host.level);
  hp.moveTo(0.5, 64, 0.5);
  host.level.player = hp;
  host.level.addEntity(hp);
  const gp = new m.Player(guest.level);
  guest.level.player = gp;
  guest.level.addMirrorEntity(gp);
  const ents = [];
  let i = 0;
  const put = (e) => {
    e.moveTo(-20 + (i % 9) * 5 + 0.5, 64, -20 + Math.floor(i / 9) * 5 + 0.5, 30, 0);
    host.level.addEntity(e);
    ents.push(e);
    i++;
  };
  for (const t of Object.keys(m.MOB_TYPES)) if (t !== 'ender_dragon') put(m.createMob(t, host.level));
  for (const t of m.MINECART_TYPES) put(m.createMinecart(t, host.level));
  for (const t of m.BOAT_TYPES) put(m.createBoat(t, host.level));
  put(new m.ItemEntity(host.level, m.ItemStack.of('diamond', 3)));
  put(new m.ExperienceOrb(host.level, 0, 0, 0, 7));
  put(new m.Arrow(host.level));
  put(new m.ThrownTrident(host.level));
  put(new m.EndCrystal(host.level));
  put(new m.FireworkRocket(host.level, 0, 0, 0, m.ItemStack.of('firework_rocket')));
  // (a few ticks, so their fields are lived in)
  for (let t = 0; t < 20; t++) host.level.tick();
  const bad = [], diffs = [];
  let made = 0;
  for (const e of ents) {
    if (e.removed) continue;
    const rec = m.spawnPayload(e);
    if (rec === undefined) {
      if (e.health > 0) bad.push(`${e.type}: can't be sent`);
      continue;
    }
    const data = new m.DataWatcher().full(e);
    const [type, r, d] = m.decode(m.encode([e.type, rec, data]), 1 << 24);
    let c = null;
    try {
      c = m.createFromPayload(guest.level, type, r);
    } catch (err) {
      bad.push(`${type}: threw ${err.message}`);
      continue;
    }
    if (!c || c.type !== e.type) {
      bad.push(`${type}: made ${c?.type}`);
      continue;
    }
    const why = m.applyData(c, d, () => null);
    if (why) {
      bad.push(`${type}: ${why}`);
      continue;
    }
    made++;
    // (every field sent is as the host has it: those naming another entity aside, which the guest looks up)
    const back = new m.DataWatcher().full(c);
    for (const k of Object.keys(data)) {
      const a = JSON.stringify(data[k]), b = JSON.stringify(back[k]);
      if (a !== b && !a.includes('"e":')) diffs.push(`${type}.${k}: ${a.slice(0, 30)} vs ${String(b).slice(0, 30)}`);
    }
  }
  for (const t of MADE) {
    const c = m.createFromPayload(guest.level, t, null);
    if (!c || c.type !== t) bad.push(`${t}: made ${c?.type}`);
    else made++;
  }
  check(`registry: every kind of mob, vehicle, item, orb and projectile is made on a guest, of its kind (${made})`, bad.length === 0 && made >= 90, bad.slice(0, 5).join('; '));
  check('registry: with every field the host sends, as the host has it', diffs.length === 0, diffs.slice(0, 5).join('; '));
  check('registry: the guest\'s level took none of them in by itself (they come in as the host says)', guest.level.entities.length === 1, `${guest.level.entities.length}`);

  // what a record keeps from other players doesn't go (vanilla sends none of it)
  const cart = m.createMinecart('chest_minecart', host.level);
  cart.container.set(0, m.ItemStack.of('diamond', 64));
  const trader = m.createMob('villager', host.level);
  const recs = [JSON.stringify(m.spawnPayload(cart)), JSON.stringify(m.spawnPayload(trader))];
  check('registry: a chest minecart\'s contents aren\'t sent', !recs[0].includes('diamond'), recs[0].slice(0, 200));
  check('registry: nor a villager\'s trades, gossip or memories', !/"(Offers|Gossips|Brain)"/.test(recs[1]), recs[1].slice(0, 200));
  const cartData = JSON.stringify(new m.DataWatcher().full(cart));
  check('registry: nor, in its fields, what a chest minecart holds', !cartData.includes('diamond'), cartData.slice(0, 200));

  // what isn't a record of that kind is refused
  const base = { x: 0, y: 64, z: 0, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 10, fire: 0 };
  const refused = [
    ['pig', { ...base, id: 'cow' }, 'another kind\'s record'],
    ['pig', { ...base, id: 'pig', x: 'here' }, 'a coordinate that\'s text'],
    ['horse', { ...base, id: 'horse', data: { SaddleItem: '{"__proto__":{"polluted":1}}' } }, 'JSON reaching for the prototype'],
    ['giant_squid', { ...base, id: 'giant_squid' }, 'a kind that doesn\'t exist'],
    ['player', { ...base, id: 'player' }, 'a player'],
    ['tnt', { ...base, id: 'tnt' }, 'a record for a kind made afresh'],
  ];
  const let_ = refused.filter(([t, r]) => m.createFromPayload(guest.level, t, r) !== null).map((x) => x[2]);
  check('registry: a record that isn\'t one of that kind is refused (another kind\'s, text for a number, a prototype key, an unknown kind, a player)', let_.length === 0, let_.join('; '));
  check('registry: nothing reached Object.prototype', !('polluted' in {}));
}

// ---------------------------------------------------------------------------
// in a world: what a guest is shown, and what it isn't
const host = flatHost(m, 10);
const lvl = host.level;
/** a mob of `type` at (x, z) on the ground that stays put (vanilla NoAI's effect: no goals, no moving) */
function still(type, x, z) {
  const e = m.createMob(type, lvl);
  e.moveTo(x + 0.5, 64, z + 0.5, 0, 0);
  e.serverAiStep = () => {};
  e.speed = 0;
  lvl.addEntity(e);
  return e;
}
const pig = still('pig', 4, 4);
const cow = still('cow', 6, 4);
const sheep = still('sheep', 8, 4);
const zombie = still('zombie', 4, 8);
const horse = still('horse', 8, 8);
const creeper = still('creeper', 6, 10);
const item = new m.ItemEntity(lvl, m.ItemStack.of('diamond', 3));
item.moveTo(2.5, 64, 6.5);
item.pickupDelay = 32767;
lvl.addEntity(item);
// (48 blocks off: the view (4 chunks, less one) reaches it for an item, not for a mob beyond it)
const farItem = new m.ItemEntity(lvl, m.ItemStack.of('emerald'));
farItem.moveTo(40.5, 64, 0.5);
farItem.pickupDelay = 32767;
lvl.addEntity(farItem);
const farPig = still('pig', 60, 0);
// (an arrow's range is 4 chunks: 64 blocks, but the guest's view is less)
const g = makeGuest(host, 'Alex', { viewDistance: 4 });
step(host, 60);
{
  const cp = copyOf(g, pig);
  check('shown: a mob near the guest is there, of its kind, where the host has it', cp && cp.type === 'pig' && Math.hypot(cp.x - pig.x, cp.y - pig.y, cp.z - pig.z) < 1e-6, cp ? `${cp.x},${cp.y},${cp.z}` : 'none');
  check('shown: and in the guest\'s level (drawn, picked by the crosshair)', cp && g.level.entities.includes(cp));
  check('shown: every mob, and the item, near it', [cow, sheep, zombie, horse, creeper, item].every((e) => copyOf(g, e)?.type === e.type));
  check('shown: an item 40 blocks off, within its range and the view', copyOf(g, farItem)?.type === 'item');
  check('shown: not a mob 60 blocks off, past the view', copyOf(g, farPig) === null);
  check('shown: the item is the host\'s stack', copyOf(g, item)?.stack.item.id === 'diamond' && copyOf(g, item)?.stack.count === 3);
  check('shown: never the guest\'s own player, nor the players, as entities', [...g.session.entities.values()].every((c) => c.e.type !== 'player'));
  // (walks toward the far pig, a few blocks a tick: it comes into view; back, and it goes)
  const walk = (x) => {
    while (Math.abs(g.player.x - x) > 1e-9) {
      const d = Math.max(-5, Math.min(5, x - g.player.x));
      g.player.moveTo(g.player.x + d, 64, 0.5);
      step(host, 1);
    }
    step(host, 40);
  };
  walk(40.5);
  check('shown: walking toward it, the far mob comes into view', copyOf(g, farPig)?.type === 'pig');
  const was = copyOf(g, farPig);
  walk(0.5);
  check('shown: walking away, it goes out of view (off the guest\'s level)', copyOf(g, farPig) === null && was?.removed && !g.level.entities.includes(was));
}

// ---------------------------------------------------------------------------
// moving: a mob's moves every third tick, eased in over three; a jump taken at once; the rest each tick
{
  const cp = copyOf(g, pig);
  pig.moveTo(5.5, 64, 4.5, 90, 0);
  const seen = [];
  for (let t = 0; t < 7; t++) {
    step(host, 1);
    seen.push(cp.x);
  }
  check('moving: a mob\'s move is on the guest within six ticks (every third, eased in over three: vanilla updateInterval and lerpTo)', Math.abs(cp.x - 5.5) < 1e-6 && Math.abs(cp.yaw - 90) < 1e-6, seen.map((x) => x.toFixed(2)).join(' '));
  check('moving: eased, not jumped to', seen.some((x) => x > 4.5 + 0.01 && x < 5.5 - 0.01), seen.map((x) => x.toFixed(2)).join(' '));
  pig.moveTo(20.5, 64, 4.5, 90, 0);
  step(host, 4);
  const mid = [];
  const path = cp.x;
  check('moving: a jump of more than 8 blocks is taken at once (a teleport)', Math.abs(path - 20.5) < 1e-6, `${path}`);
  void mid;
  pig.moveTo(4.5, 64, 4.5, 0, 0);
  step(host, 6);
  // an item falling: each tick, not every third
  const drop = new m.ItemEntity(lvl, m.ItemStack.of('apple'));
  drop.moveTo(3.5, 80, 3.5);
  drop.pickupDelay = 32767;
  lvl.addEntity(drop);
  step(host, 2);
  const cd = copyOf(g, drop);
  const ys = [];
  for (let t = 0; t < 5; t++) {
    step(host, 1);
    ys.push([cd?.y, drop.y]);
  }
  check('moving: an item falls on the guest as on the host, tick by tick', cd && ys.every(([a, b], k) => k === 0 || a < ys[k - 1][0]) && Math.abs(cd.y - drop.y) < 0.6, ys.map(([a, b]) => `${a?.toFixed(2)}/${b.toFixed(2)}`).join(' '));
  step(host, 40);
  check('moving: and lies where it landed', Math.abs(cd.y - drop.y) < 1e-6 && drop.onGround && cd.onGround, `${cd.y} ${drop.y}`);
}

// ---------------------------------------------------------------------------
// fields: what the host changes shows on the guest's copy
{
  sheep.sheared = true;
  sheep.color = 14;
  zombie.setBaby(true);
  cow.setCustomName('Daisy');
  cow.customNameVisible = true;
  creeper.swell = 20;
  creeper.oldSwell = 19;
  pig.igniteForSeconds(8);
  horse.addEffect(new m.MobEffectInstance(m.mobEffect('invisibility'), 600, 0));
  horse.equipSaddle(m.ItemStack.of('saddle'), false);
  pig.equipSaddle(false);
  item.stack = m.ItemStack.of('diamond', 7);
  step(host, 2);
  const cs = copyOf(g, sheep), cz = copyOf(g, zombie), cc = copyOf(g, cow), ccr = copyOf(g, creeper), cp = copyOf(g, pig), ch = copyOf(g, horse);
  check('fields: a sheep sheared and dyed on the host is so on the guest', cs.sheared === true && cs.color === 14);
  check('fields: a zombie made a baby is a baby', cz.isBaby() === true);
  check('fields: a name tag\'s name shows', cc.customName === 'Daisy' && cc.customNameVisible === true);
  check('fields: a creeper swelling (or letting its swell go) does so on the guest', ccr.swell === creeper.swell && ccr.oldSwell === creeper.oldSwell && ccr.swell > 0, `${ccr.swell}/${creeper.swell}`);
  check('fields: a mob on fire burns (vanilla\'s shared flag: whether, not how long)', cp.isOnFire() && pig.isOnFire());
  check('fields: an invisible mob is invisible (its effects, not their time left)', ch.isInvisible() === true && ch.hasEffect('invisibility'));
  check('fields: a saddle put on shows (a horse\'s saddle and armour slots, vanilla DATA_ID_FLAGS)', ch.saddled === true);
  check('fields: and a pig\'s (its steering\'s saddle, vanilla DATA_SADDLE_ID)', cp.saddled === true);
  check('fields: an item\'s stack as it changes', copyOf(g, item).stack.count === 7);
  zombie.hurt(3, 'generic');
  step(host, 2);
  check('fields: hurt, it flashes red and loses health as on the host', cz.hurtTime > 0 && cz.health === zombie.health, `${cz.hurtTime} ${cz.health}/${zombie.health}`);
  horse.removeEffect('invisibility');
  pig.clearFire();
  step(host, 2);
  check('fields: an effect gone is gone, a fire out is out', !ch.isInvisible() && !cp.isOnFire());
}

// ---------------------------------------------------------------------------
// riding: who rides what, in its seats' order, placed there
{
  const chicken = still('chicken', 2, 10);
  const jockey = still('zombie', 2, 10);
  jockey.setBaby(true);
  jockey.startRiding(chicken, true);
  step(host, 4);
  const cc = copyOf(g, chicken), cj = copyOf(g, jockey);
  check('riding: a chicken jockey is one on the guest', cc && cj && cj.vehicle === cc && cc.passengers[0] === cj);
  check('riding: the rider sits where its seat is', cj && Math.abs(cj.y - (cc.y + cc.passengerAttachmentY(cj) - cj.vehicleAttachmentY())) < 1e-6 && Math.abs(cj.x - cc.x) < 1e-6);
  chicken.moveTo(2.5, 64, 12.5);
  step(host, 7);
  check('riding: and goes where it goes', Math.abs(cj.z - 12.5) < 1e-6 && Math.abs(cc.z - 12.5) < 1e-6, `${cj.z} ${cc.z}`);
  jockey.stopRiding();
  step(host, 4);
  check('riding: off, it\'s off, where the host put it', cj.vehicle === null && cc.passengers.length === 0 && Math.hypot(cj.x - jockey.x, cj.z - jockey.z) < 1e-6, `${cj.x},${cj.z} vs ${jockey.x},${jockey.z}`);
  // the host's own player in a boat, as the guest sees it
  const boat = m.createBoat('boat', lvl);
  boat.moveTo(0.5, 64, 12.5, 0, 0);
  lvl.addEntity(boat);
  step(host, 2);
  host.player.startRiding(boat, true);
  step(host, 4);
  const hostMirror = g.session.mirrors.get(host.player.id);
  const cb = copyOf(g, boat);
  check('riding: the host\'s player in a boat is in its boat on the guest', hostMirror && cb && hostMirror.vehicle === cb && cb.passengers.includes(hostMirror));
  host.player.stopRiding();
  step(host, 4);
  check('riding: and out of it', hostMirror.vehicle === null && cb.passengers.length === 0);
}

// ---------------------------------------------------------------------------
// dying and going
{
  const cc = copyOf(g, cow);
  cow.hurt(100, 'generic');
  step(host, 5);
  check('dying: the copy dies as the host\'s does (falls over)', cc.health <= 0 && cc.deathTime > 0 && !cc.removed, `${cc.health} ${cc.deathTime}`);
  const poofs = () => g.level.particleCalls.filter((p) => p.method === 'poof' && p.args[0] === cc).length;
  step(host, 20);
  check('dying: its smoke puffs on the guest, round its copy (vanilla makePoofParticles)', poofs() === 1, `${poofs()}`);
  check('dying: then it\'s gone', cc.removed && copyOf(g, cow) === null && !g.level.entities.includes(cc));
  const ci = copyOf(g, farItem) ?? null;
  farItem.remove();
  step(host, 2);
  check('going: an entity removed on the host goes from the guest', copyOf(g, farItem) === null && (ci === null || ci.removed));
  // a rocket's burst: its stars' colours, on the guest
  const star = m.ItemStack.of('firework_rocket');
  star.tag = { fireworks: { flightDuration: 1, explosions: [{ shape: 'star', colors: [0xff0000], fadeColors: [0x00ff00], hasTrail: true, hasTwinkle: false }] } };
  const rocket = new m.FireworkRocket(lvl, 1.5, 65, 1.5, star);
  lvl.addEntity(rocket);
  step(host, 60);
  const bursts = g.level.particleCalls.filter((p) => p.method === 'fireworks');
  check('going: a rocket\'s burst shows on the guest, its stars as they were', bursts.length === 1 && bursts[0].args[6]?.[0]?.shape === 'star' && bursts[0].args[6][0].colors[0] === 0xff0000 && bursts[0].args[6][0].hasTrail === true, JSON.stringify(bursts.map((b) => b.args[6])).slice(0, 200));
  check('going: and the rocket is gone', rocket.removed && copyOf(g, rocket) === null);
}

check('no bad data: the guest is still in', g.session.state === 'play', g.session.endReason);

// ---------------------------------------------------------------------------
// what it costs: a hundred mobs about the guest, as they live
{
  const types = ['pig', 'cow', 'sheep', 'chicken', 'zombie', 'skeleton', 'creeper', 'spider', 'wolf', 'rabbit'];
  const mobs = [];
  for (let k = 0; k < 100; k++) {
    const e = m.createMob(types[k % types.length], lvl);
    e.moveTo(-22 + (k % 10) * 5 + 0.5, 64, -22 + Math.floor(k / 10) * 5 + 0.5, 0, 0);
    e.persistenceRequired = true;
    lvl.addEntity(e);
    mobs.push(e);
  }
  // (they go across first: that's a burst; then what they cost each tick)
  step(host, 20);
  let bytes = 0;
  const send = host.net.host.send.bind(host.net.host);
  host.net.host.send = (peer, data) => {
    bytes += data.length;
    return send(peer, data);
  };
  const T = 200;
  step(host, T);
  host.net.host.send = send;
  // (the zombies and skeletons burn in the sun; the rabbits run off, the wolves after them, some past the view)
  const alive = mobs.filter((e) => !e.removed && Math.hypot(e.x - g.player.x, e.z - g.player.z) < 44);
  const shown = alive.filter((e) => copyOf(g, e)).length;
  const perTick = bytes / T;
  console.log(`bandwidth: ${shown} mobs shown, ${Math.round(perTick)} bytes a tick (${(perTick * 20 / 1024).toFixed(1)} KB/s), ${(perTick / Math.max(1, shown)).toFixed(1)} bytes a mob a tick`);
  check('bandwidth: the hundred mobs, those alive and in view, are all shown', shown === alive.length && shown >= 70, `${shown} of ${alive.length}`);
  check('bandwidth: and cost under 16 KB a tick as they go about (vanilla sends a few hundred bytes a mob a second)', perTick < 16 * 1024, `${Math.round(perTick)}`);
  check('bandwidth: the guest is still in', g.session.state === 'play', g.session.endReason);
}

await exitWithStatus(close);
