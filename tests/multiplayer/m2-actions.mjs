// Multiplayer M2: what a guest does with the entities it sees, the host deciding (vanilla ServerGamePacketListenerImpl
// handleInteract, handlePlayerAction DROP_ITEM / DROP_ALL_ITEMS, handleSetCreativeModeSlot's slot -1,
// handlePlayerInput and handlePlayerCommand START_RIDING_JUMP; Player.touch and ItemEntity.playerTouch;
// ClientboundTakeItemEntityPacket and ClientboundSetExperiencePacket): its clicks go to the entity under its
// crosshair if it could reach it; it gets in a boat or on a horse and steers it with its keys, a horse leaping as far
// as it charged, and gets off where the host says; it picks up items and orbs, which fly to it; it drops what it
// holds. And what it can't do (hit what it can't reach or wasn't shown, hurt a creative player, throw out too much)
// does nothing (survival players fighting: m3-survival.mjs).

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, rawGuest, hostCopy, copyOf, step, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet(ENTITY_MODULES);

const host = flatHost(m, 6);
const lvl = host.level;
const g = makeGuest(host, 'Alex', { viewDistance: 4 });
const s = makeGuest(host, 'Steve', { viewDistance: 4 });
step(host, 40);
const ha = hostCopy(host, g), hs = hostCopy(host, s);

/** a mob of `type` at (x, z) that stays put */
function still(type, x, z) {
  const e = m.createMob(type, lvl);
  e.moveTo(x + 0.5, 64, z + 0.5, 0, 0);
  e.serverAiStep = () => {};
  e.speed = 0;
  e.persistenceRequired = true;
  lvl.addEntity(e);
  return e;
}
/** put the guest's player at (x, z), a few blocks a tick, as it would walk there */
function walkTo(gg, x, z) {
  for (let k = 0; k < 40; k++) {
    const p = gg.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 1e-9) break;
    const f = Math.min(1, 4 / d);
    p.moveTo(p.x + dx * f, 64, p.z + dz * f, p.yaw, p.pitch);
    step(host, 1);
  }
  step(host, 3);
}
/** what `gg` holds in its hand, from its creative inventory (the host hears of it) */
function hold(gg, stack) {
  const inv = gg.player.inventory;
  inv.selected = 0;
  inv.main[0] = stack;
  inv.version++;
  step(host, 2);
}
/** a click of `button` ('attack' or 'use') with `e`'s copy under the crosshair (or the entity `copy` as given) */
function click(gg, button, e, copy = e ? copyOf(gg, e) : null) {
  gg.session.input(button === 'attack', false, button === 'use', false, copy);
  step(host, 1);
  gg.session.input(false, false, false, false, null);
  step(host, 3);
}

// ---------------------------------------------------------------------------
// hitting: a click on a mob the guest looks at hurts it; one it can't reach, or wasn't shown, doesn't
{
  const pig = still('pig', 3, 0);
  step(host, 3);
  const before = pig.health;
  click(g, 'attack', pig);
  check('hitting: a guest\'s click on a mob under its crosshair hurts it on the host', pig.health < before, `${pig.health}/${before}`);
  check('hitting: and the guest sees it flinch and lose health', copyOf(g, pig).health === pig.health && copyOf(g, pig).hurtTime > 0);
  check('hitting: its arm swings, as the host has it (vanilla ClientboundAnimatePacket)', g.player.swinging || g.player.swingTime > 0 || g.player.attackAnim > 0);
  const far = still('pig', 12, 0);
  step(host, 5);
  pig.invulnerableTime = 0;
  const h2 = far.health;
  click(g, 'attack', far);
  check('hitting: one past its reach (and vanilla\'s 3 blocks of slack) isn\'t hurt', far.health === h2, `${far.health}`);
  // (an id it was never shown: a guest that clicks on the pig in the message it says hello in, before it's been shown
  // anything; and an id nothing has)
  pig.invulnerableTime = 0;
  const h3 = pig.health;
  const r = rawGuest(host);
  step(host, 1);
  r.send([[m.SB.Hello, m.PROTOCOL_VERSION, m.BUILD_ID, 'Sneaky', m.randomId(), 2], [m.SB.MovePlayer, 0.5, 65, 0.5, -90, 0, 0, pig.id], [m.SB.PlayerAction, m.Action.ATTACK, 0]]);
  step(host, 3);
  r.send([[m.SB.MovePlayer, 0.5, 65, 0.5, -90, 0, 0, 999999], [m.SB.PlayerAction, m.Action.ATTACK, 0], [m.SB.PlayerAction, m.Action.USE, 0]]);
  step(host, 3);
  check('hitting: an entity the guest wasn\'t shown, or an id nothing has, isn\'t hit (and it\'s not dropped for it)', pig.health === h3 && !r.gone && hostCopy(host, { name: 'Sneaky' }) !== null, `${pig.health}/${h3} ${r.reason()}`);
  r.send([[m.SB.Disconnect, 'bye']]);
  step(host, 2);
  // a player: a creative one can't be hurt (vanilla: invulnerable), survival ones fight (m3-survival.mjs); and the block
  // behind isn't hit either
  walkTo(g, 0.5, 0.5);
  hs.moveTo(2.5, 64, 0.5);
  s.player.moveTo(2.5, 64, 0.5);
  step(host, 5);
  g.player.yaw = -90;
  g.player.pitch = 30;
  const steveHealth = hs.health;
  click(g, 'attack', null, g.session.mirrors.get(hs.id));
  check('hitting: a creative player under the crosshair isn\'t hurt', hs.gameMode === 'creative' && hs.health === steveHealth && hs.hurtTime === 0);
  g.player.pitch = 0;
  walkTo(s, -6.5, 6.5);
}

// ---------------------------------------------------------------------------
// using: shears, a name tag, a lead
{
  walkTo(g, 0.5, 0.5);
  const sheep = still('sheep', 2, 2);
  const cow = still('cow', -2, 2);
  step(host, 3);
  hold(g, m.ItemStack.of('shears'));
  click(g, 'use', sheep);
  check('using: shears on a sheep shear it on the host', sheep.sheared === true);
  check('using: and the guest sees it sheared', copyOf(g, sheep).sheared === true);
  const wool = lvl.entities.filter((e) => e.type === 'item' && e.stack.item.id.endsWith('_wool'));
  check('using: its wool drops (and the guest sees it)', wool.length > 0 && wool.every((w) => copyOf(g, w)), `${wool.length}`);
  const tag = m.ItemStack.of('name_tag');
  tag.tag = { display: { Name: 'Bessie' } };
  hold(g, m.ItemStack.of('name_tag'));
  // (a creative guest's name tag has the host's creative tab's data, which is none: a name tag with no name does nothing)
  click(g, 'use', cow);
  check('using: a blank name tag does nothing (as in vanilla)', cow.customName === null);
  hold(g, m.ItemStack.of('lead'));
  click(g, 'use', cow);
  check('using: a lead ties the cow to the guest\'s player on the host', cow.leashHolder === ha);
  check('using: and the guest sees the lead to itself', copyOf(g, cow).leashHolder === g.player);
  check('using: the other guest sees it to the first guest\'s player', copyOf(s, cow)?.leashHolder === s.session.mirrors.get(ha.id));
  hold(g, null);
  click(g, 'use', cow);
  check('using: clicked again, let go', cow.leashHolder === null && copyOf(g, cow).leashHolder === null);
}

// ---------------------------------------------------------------------------
// riding a boat: in, steered by the guest's keys, out where the host says
{
  walkTo(g, 0.5, -3.5);
  const boat = m.createBoat('boat', lvl);
  boat.moveTo(0.5, 64, -6.5, 0, 0);
  lvl.addEntity(boat);
  step(host, 3);
  const cb = copyOf(g, boat);
  click(g, 'use', boat);
  check('boat: a guest\'s click gets its player in on the host', ha.vehicle === boat && boat.passengers[0] === ha);
  check('boat: and in its copy on the guest (told once: "Press Shift to Dismount")', g.player.vehicle === cb && cb.passengers[0] === g.player && g.mounted.length === 1 && g.mounted[0] === cb);
  check('boat: the other guest sees it in the boat', s.session.mirrors.get(ha.id)?.vehicle === copyOf(s, boat));
  const start = [boat.x, boat.z];
  g.player.input.forward = true;
  step(host, 40);
  g.player.input.forward = false;
  step(host, 10);
  const moved = Math.hypot(boat.x - start[0], boat.z - start[1]);
  check('boat: its keys row it on the host (vanilla Boat.setInput)', moved > 0.5, `${moved.toFixed(2)}`);
  check('boat: the guest\'s copy goes with it, and the guest sits in it', Math.hypot(cb.x - boat.x, cb.z - boat.z) < 1e-6 && Math.hypot(g.player.x - cb.x, g.player.z - cb.z) < 1.5, `${cb.x},${cb.z} ${g.player.x},${g.player.z}`);
  check('boat: the host has the guest\'s player where its seat is, not where the guest said', Math.hypot(ha.x - boat.x, ha.z - boat.z) < 1.5);
  g.player.input.sneak = true;
  step(host, 4);
  g.player.input.sneak = false;
  step(host, 4);
  check('boat: the sneak key gets it out on the host', ha.vehicle === null && boat.passengers.length === 0);
  check('boat: and on the guest, which is put where the host put it', g.player.vehicle === null && cb.passengers.length === 0 && Math.hypot(g.player.x - ha.x, g.player.y - ha.y, g.player.z - ha.z) < 1e-6, `${g.player.x},${g.player.y},${g.player.z} vs ${ha.x},${ha.y},${ha.z}`);
  step(host, 5);
  check('boat: and walks on from there, believed', Math.hypot(g.player.x - ha.x, g.player.z - ha.z) < 1e-6 && g.session.state === 'play');
}

// ---------------------------------------------------------------------------
// riding a horse: steered by the keys, facing where the guest looks, and a leap as charged
{
  walkTo(g, 6.5, -6.5);
  const horse = m.createMob('horse', lvl);
  horse.moveTo(8.5, 64, -6.5, 0, 0);
  horse.tamed = true;
  horse.equipSaddle(m.ItemStack.of('saddle'), false);
  horse.persistenceRequired = true;
  lvl.addEntity(horse);
  step(host, 3);
  hold(g, null);
  click(g, 'use', horse);
  const ch = copyOf(g, horse);
  check('horse: a tame saddled horse takes the guest\'s player', ha.vehicle === horse && g.player.vehicle === ch);
  g.player.yaw = -90;
  const start = [horse.x, horse.z];
  g.player.input.forward = true;
  step(host, 30);
  g.player.input.forward = false;
  step(host, 5);
  check('horse: forward, it goes the way the guest looks (east)', horse.x - start[0] > 2 && Math.abs(horse.z - start[1]) < 1, `${horse.x - start[0]} ${horse.z - start[1]}`);
  // a jump: charged by holding it, let go (vanilla LocalPlayer.aiStep's riding jump → START_RIDING_JUMP)
  step(host, 10);
  const y0 = horse.y;
  g.player.input.jump = true;
  step(host, 8);
  const charge = g.player.jumpRidingScale;
  g.player.input.jump = false;
  let top = y0;
  for (let k = 0; k < 12; k++) {
    step(host, 1);
    top = Math.max(top, horse.y);
  }
  check('horse: holding jump charges it on the guest (the bar)', charge > 0.5, `${charge}`);
  check('horse: let go, the host\'s horse leaps', top > y0 + 0.5, `${(top - y0).toFixed(2)}`);
  step(host, 20);
  g.player.input.sneak = true;
  step(host, 3);
  g.player.input.sneak = false;
  step(host, 4);
  check('horse: off with the sneak key', ha.vehicle === null && g.player.vehicle === null);
}

// ---------------------------------------------------------------------------
// riding a pig with a carrot on a stick, and a minecart
{
  walkTo(g, -6.5, 6.5);
  const pig = m.createMob('pig', lvl);
  pig.moveTo(-8.5, 64, 6.5, 0, 0);
  pig.equipSaddle(false);
  pig.persistenceRequired = true;
  lvl.addEntity(pig);
  step(host, 3);
  hold(g, null);
  click(g, 'use', pig);
  check('pig: a saddled pig takes the guest\'s player', ha.vehicle === pig && g.player.vehicle === copyOf(g, pig));
  hold(g, m.ItemStack.of('carrot_on_a_stick'));
  g.player.yaw = 0;
  const z0 = pig.z;
  step(host, 30);
  check('pig: with a carrot on a stick in hand, it goes the way the guest looks (south)', pig.z - z0 > 1, `${(pig.z - z0).toFixed(2)}`);
  g.player.input.sneak = true;
  step(host, 3);
  g.player.input.sneak = false;
  step(host, 4);
  check('pig: off with the sneak key', ha.vehicle === null && g.player.vehicle === null);
  walkTo(g, -6.5, -2.5);
  const cart = m.createMinecart('minecart', lvl);
  cart.moveTo(-8.5, 64, -2.5, 0, 0);
  lvl.addEntity(cart);
  step(host, 3);
  hold(g, null);
  click(g, 'use', cart);
  check('minecart: a click gets the guest\'s player in', ha.vehicle === cart && g.player.vehicle === copyOf(g, cart));
  g.player.input.sneak = true;
  step(host, 3);
  g.player.input.sneak = false;
  step(host, 4);
  check('minecart: and out, where the host put it', ha.vehicle === null && g.player.vehicle === null && Math.hypot(g.player.x - ha.x, g.player.z - ha.z) < 1e-6);
}

// ---------------------------------------------------------------------------
// picking up: items and orbs fly to whoever took them, on every guest that sees it
{
  // (away from the host's player, which stands at the spawn and would be first to them)
  walkTo(g, -6.5, -6.5);
  walkTo(s, -2.5, -2.5);
  hold(g, null);
  g.took.length = s.took.length = 0;
  const apple = new m.ItemEntity(lvl, m.ItemStack.of('apple', 2));
  apple.moveTo(ha.x + 2, 64, ha.z);
  apple.pickupDelay = 10;
  lvl.addEntity(apple);
  step(host, 3);
  const ca = copyOf(g, apple);
  apple.moveTo(ha.x, 64, ha.z);
  step(host, 15);
  check('pickup: an item at the guest\'s feet goes into its inventory on the host', ha.inventory.main.some((st) => st?.item.id === 'apple' && st.count === 2) && apple.removed);
  check('pickup: and into its inventory on the guest (vanilla ContainerSetSlot)', g.player.inventory.main.some((st) => st?.item.id === 'apple' && st.count === 2));
  check('pickup: the guest watches it fly to itself (vanilla TakeItemEntity)', g.took.length === 1 && g.took[0].e === ca && g.took[0].taker === g.player && g.took[0].amount === 2, JSON.stringify(g.took.map((t) => [t.e.type, t.amount])));
  check('pickup: the other guest watches it fly to the first', s.took.length === 1 && s.took[0].taker === s.session.mirrors.get(ha.id));
  check('pickup: the guest hears the pop (the host\'s sound, sent to it too)', g.level.sounds.some((x) => x.name === 'entity.item.pickup'));
  check('pickup: and the item\'s copy is gone', ca.removed && copyOf(g, apple) === null);
  // orbs: experience, told to the guest
  g.took.length = 0;
  const orb = new m.ExperienceOrb(lvl, ha.x, ha.y + 0.5, ha.z, 7);
  lvl.addEntity(orb);
  step(host, 20);
  check('pickup: an orb gives the guest\'s player its experience on the host', ha.xpTotal === 7, `${ha.xpTotal}`);
  check('pickup: and the guest\'s bar shows it (vanilla SetExperience)', g.player.xpTotal === 7 && g.player.xpLevel === ha.xpLevel && Math.abs(g.player.xpProgress - ha.xpProgress) < 1e-9, `${g.player.xpTotal} ${g.player.xpLevel} ${g.player.xpProgress}`);
  check('pickup: and hears the orb\'s pop', g.level.sounds.some((x) => x.name === 'entity.experience_orb.pickup'));
}

// ---------------------------------------------------------------------------
// dropping: the drop key, and throwing out of the creative inventory; the host throws, the guest is told what's left
{
  hold(g, m.ItemStack.of('dirt', 5));
  const count = (id) => lvl.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id === id).reduce((n, e) => n + e.stack.count, 0);
  g.session.drop(false);
  step(host, 4);
  check('dropping: the drop key throws one on the host, from the guest\'s player', count('dirt') === 1 && lvl.entities.some((e) => e.type === 'item' && e.stack.item.id === 'dirt' && e.thrower === ha));
  check('dropping: the guest\'s hand has one less (the host says)', g.player.inventory.main[0]?.count === 4 && ha.inventory.main[0]?.count === 4);
  g.session.drop(true);
  step(host, 4);
  check('dropping: with Ctrl, the whole stack', count('dirt') === 5 && g.player.inventory.main[0] === null && ha.inventory.main[0] === null);
  const thrown = lvl.entities.find((e) => e.type === 'item' && e.stack.item.id === 'dirt');
  check('dropping: the guest sees what it threw', !!copyOf(g, thrown));
  g.session.dropCreative(m.ItemStack.of('stone', 16));
  step(host, 4);
  check('dropping: out of the creative inventory, thrown as it was (vanilla slot -1)', count('stone') === 16);
  // (too many too fast: vanilla's 1480, 20 an item, a tick taking 1)
  const r = rawGuest(host);
  step(host, 1);
  r.hello('Thrower');
  step(host, 3);
  const before = count('cobblestone');
  const drops = Array.from({ length: 50 }, () => [m.SB.SetCreativeModeSlot, -1, ['cobblestone', 1, 0, null]]);
  r.send(drops);
  r.send(drops);
  step(host, 2);
  check('dropping: a hundred throws at once: 74 thrown, the rest refused (vanilla dropSpamThrottler)', count('cobblestone') - before === 74 && !r.gone, `${count('cobblestone') - before}`);
  r.send([[m.SB.SetCreativeModeSlot, -1, ['not_an_item', 1, 0, null]]]);
  step(host, 2);
  check('dropping: throwing out an item that isn\'t one: disconnected (vanilla "Invalid creative inventory action")', r.gone && r.reason() === 'Invalid creative inventory action', `${r.reason()}`);
  // (a flood of drop presses in one tick: a few at most)
  const q = rawGuest(host);
  step(host, 1);
  q.hello('Flood');
  step(host, 3);
  q.send([[m.SB.SetCreativeModeSlot, 0, ['sand', 64, 0, null]]]);
  step(host, 2);
  const sand = count('sand');
  q.send(Array.from({ length: 60 }, () => [m.SB.PlayerAction, m.Action.DROP, 0]));
  step(host, 3);
  check('dropping: sixty drop presses in a tick throw four (a player\'s key repeats no faster)', count('sand') - sand === 4, `${count('sand') - sand}`);
  q.send([[m.SB.Disconnect, 'bye']]);
  step(host, 2);
}

check('in: both guests are still in', g.session.state === 'play' && s.session.state === 'play', `${g.session.endReason} ${s.session.endReason}`);
await exitWithStatus(close);
