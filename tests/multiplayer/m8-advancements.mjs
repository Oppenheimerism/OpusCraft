// Guests' advancements (vanilla PlayerAdvancements, one per ServerPlayer, and ClientboundUpdateAdvancementsPacket): a
// guest's player meets criteria in the host's world as the host's own player does (what it holds, kills, eats, sleeps
// in, what it's under, where it is, the dimension the host takes it to, the level's own triggers), each guest its own;
// the guest is told its progress (all of it as it joins, without toasts; then what changes, a toast for each advancement
// it finishes), and everyone reads the chat line, as the announceAdvancements rule says. What it has is kept with its
// player in the world, and is there when it comes back. The host's own advancements are announced to its guests too. A
// guest's own game meets no criteria of its own, and a host that sends advancements that aren't this game's is left.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, hostChangeDimension, check, exitWithStatus, SETTLE } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/game/advancements.ts', '/src/net/advancementSync.ts', '/src/game/sleep.ts', '/src/game/playerDeath.ts', '/src/game/combat.ts',
  '/src/inventory/merchantMenu.ts', '/src/game/game.ts', '/src/game/progressTriggers.ts', '/src/entity/wolf.ts', '/src/entity/villager.ts', '/src/entity/trading.ts', '/src/net/client/clientMenus.ts', '/src/net/server/menuSync.ts',
]);

const saved = new Map();
const host = flatHost(m, 6, { guestGameMode: 'survival', gameMode: 'survival', hooks: { saveGuest: (uuid, d) => saved.set(uuid, structuredClone(d)), loadGuest: async (uuid) => structuredClone(saved.get(uuid) ?? null) } });
const lvl = host.level;
lvl.difficulty = 'normal';
lvl.onOpenMerchant = (v, p) => host.server.showMenu(p, new m.MerchantMenu(p, v));
const later = () => new Promise((r) => setImmediate(r));

/** a guest whose game keeps its advancements as Game.joinWorld does: the host's word applied, a toast for each one finished */
function guest(name, opts) {
  const g = makeGuest(host, name, opts);
  g.adv = new m.PlayerAdvancements();
  g.adv.remote = true;
  g.advToasts = [];
  g.advPackets = [];
  g.session.hooks.advancements = (changes, reset) => {
    g.advPackets.push({ reset, ids: changes.map(([a]) => a.id) });
    for (const a of m.applyProgress(g.adv, changes, reset)) if (a.toast !== false) g.advToasts.push(a.id);
  };
  return g;
}
async function settle(n) {
  for (let i = 0; i < n; i++) {
    step(host);
    await later();
  }
}

const a = guest('Alex', { viewDistance: 4 });
const b = guest('Steve', { viewDistance: 4 });
await settle(40);
const ha = hostCopy(host, a), hb = hostCopy(host, b);
const sa = host.server.sessionOf(ha), sb = host.server.sessionOf(hb);
const A = (id) => m.ADVANCEMENTS.get(id);
const S = (id, n = 1) => m.ItemStack.of(id, n);
const give = (p, i, stack) => {
  p.inventory.main[i] = stack;
  p.inventory.version++;
};
const line = (who, id) => m.announcement(who, A(id));
const zombieAt = (x, z) => {
  const e = m.createMob('zombie', lvl);
  e.moveTo(x, 64, z, 0, 0);
  e.serverAiStep = () => {};
  e.speed = 0;
  lvl.addEntity(e);
  return e;
};
/** put `g`'s player at (x, z), a few blocks a tick, as it would walk there */
function walkTo(g, x, z) {
  for (let k = 0; k < 40; k++) {
    const p = g.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 1e-9) break;
    const f = Math.min(1, 4 / d);
    p.moveTo(p.x + dx * f, p.y, p.z + dz * f, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    step(host, 1);
  }
  step(host, 3);
}

// ---------------------------------------------------------------------------
// joining: the guest is told all it has (nothing yet), as a reset, with no toasts
{
  check('join: each guest is told its advancements first, as a reset (vanilla isFirstPacket)', a.advPackets[0]?.reset === true && b.advPackets[0]?.reset === true, JSON.stringify(a.advPackets));
  const done = (adv) => [...m.ADVANCEMENTS.values()].filter((x) => adv.isDone(x)).map((x) => x.id);
  check('join: a new player has done none, here or on the host', done(a.adv).length === 0 && done(sa.progress.advancements).length === 0, `${done(a.adv)}`);
  const v0 = a.adv.version;
  a.adv.trigger('inventory', { inventory: new Set(['cobblestone']) });
  check('join: its own game meets no criteria by itself (vanilla ClientAdvancements)', a.adv.version === v0 && !a.adv.isDone(A('story/mine_stone')));
}

// ---------------------------------------------------------------------------
// what it holds (inventory_changed): Stone Age, the toast on its own screen, the chat line for everyone
{
  const hostChat = host.chat.length, aChat = a.chat.length, bChat = b.chat.length;
  give(ha, 0, S('cobblestone', 3));
  step(host, 3);
  const id = 'story/mine_stone';
  check('inventory: cobblestone in the guest\'s inventory: Stone Age is the guest\'s on the host', sa.progress.advancements.isDone(A(id)));
  check('inventory: and on the guest, told by the host', a.adv.isDone(A(id)));
  check('inventory: the guest gets its toast, once', a.advToasts.filter((t) => t === id).length === 1, JSON.stringify(a.advToasts));
  check('inventory: the other guest doesn\'t have it, nor its toast', !b.adv.isDone(A(id)) && !sb.progress.advancements.isDone(A(id)) && !b.advToasts.includes(id));
  const want = line('Alex', id);
  check('inventory: "Alex has made the advancement [Stone Age]" in everyone\'s chat: the host\'s and both guests\'', host.chat.slice(hostChat).includes(want) && a.chat.slice(aChat).includes(want) && b.chat.slice(bChat).includes(want), `${want} | ${host.chat.slice(hostChat)}`);
  check('inventory: the line is vanilla\'s', want === 'Alex has made the advancement §a[Stone Age]§r');
  step(host, 5);
  check('inventory: nothing more is said while nothing changes', a.chat.filter((t) => t === want).length === 1 && a.advToasts.filter((t) => t === id).length === 1);
}

// ---------------------------------------------------------------------------
// a root (no toast, not announced), and announceAdvancements off (the toast, no line)
{
  const aChat = a.chat.length;
  give(ha, 1, S('crafting_table'));
  step(host, 3);
  check('root: a crafting table: the story tab opens (done), without a toast or a chat line, as vanilla\'s root', a.adv.isDone(A('story/root')) && !a.advToasts.includes('story/root') && !a.chat.slice(aChat).some((t) => t.includes('[OpusCraft]')));
  lvl.gameRules.announceAdvancements = false;
  give(ha, 2, S('iron_ingot'));
  step(host, 3);
  check('announceAdvancements off: Acquire Hardware is the guest\'s, with its toast', a.adv.isDone(A('story/smelt_iron')) && a.advToasts.includes('story/smelt_iron'));
  check('announceAdvancements off: and nobody reads it', !host.chat.some((t) => t.includes('Acquire Hardware')) && !a.chat.some((t) => t.includes('Acquire Hardware')) && !b.chat.some((t) => t.includes('Acquire Hardware')));
  lvl.gameRules.announceAdvancements = true;
}

// ---------------------------------------------------------------------------
// killing, and being killed (player_killed_entity, entity_killed_player)
{
  walkTo(a, 0.5, 0.5);
  const z = zombieAt(2.5, 0.5);
  step(host, 2);
  z.hurt(100, 'player', ha);
  step(host, 3);
  check('kill: a zombie the guest killed: Monster Hunter is its own', a.adv.isDone(A('adventure/kill_a_mob')) && sa.progress.advancements.progress.get('adventure/kill_a_mob')?.has('zombie'));
  check('kill: and Monsters Hunted has the zombie (1 of its kinds, shown as the host has it)', a.adv.progress.get('adventure/kill_all_mobs')?.has('zombie') && a.adv.progressText(A('adventure/kill_all_mobs')) === sa.progress.advancements.progressText(A('adventure/kill_all_mobs')));
  check('kill: the other guest\'s are untouched', !b.adv.progress.has('adventure/kill_a_mob'));
  walkTo(b, 6.5, 0.5);
  const z2 = zombieAt(8.5, 0.5);
  hb.hurt(100, 'mob', z2);
  step(host, 3);
  check('killed by: the guest the zombie killed gets the adventure tab\'s root (killed_by_something)', b.adv.progress.get('adventure/root')?.has('killed_by_something') && b.adv.isDone(A('adventure/root')));
  b.session.respawn();
  step(host, 5);
  z.remove();
  z2.remove();
}

// ---------------------------------------------------------------------------
// what its clicks do: eating (consume_item), a trade (villager_trade)
{
  give(ha, 3, S('bread', 3));
  ha.food.level = 10;
  a.player.inventory.selected = 3;
  ha.inventory.selected = 3;
  step(host, 3);
  a.session.input(false, false, true, true, null);
  step(host, 40);
  a.session.input(false, false, false, false, null);
  step(host, 3);
  check('eat: bread eaten: the husbandry tab\'s root is done', a.adv.isDone(A('husbandry/root')), `${ha.food.level}`);
  check('eat: and A Balanced Diet has bread, 1 of 40, on the guest as on the host', a.adv.progress.get('husbandry/balanced_diet')?.has('bread') && a.adv.progressText(A('husbandry/balanced_diet')) === '1/40', a.adv.progressText(A('husbandry/balanced_diet')));
  // a villager's trade
  const v = new m.Villager(lvl);
  v.moveTo(ha.x + 2, 64, ha.z, 90, 0);
  v.profession = 'farmer';
  v.xp = 5;
  v.setOffers([new m.MerchantOffer({ id: 'wheat', count: 20 }, null, S('emerald'), 16, 2, 0.05)]);
  lvl.addEntity(v);
  give(ha, 4, S('wheat', 20));
  step(host, 3);
  a.session.input(false, false, true, false, copyOf(a, v));
  step(host, 1);
  a.session.input(false, false, false, false, null);
  step(host, 3);
  const gm = a.session.menus.open?.menu;
  check('trade: (trading with the guest)', sa.menus.menu instanceof m.MerchantMenu && gm instanceof m.MerchantMenu);
  if (gm) {
    gm.tryMoveItems(0);
    step(host, 3);
    gm.clicked(2, 0, 'pickup');
    step(host, 3);
  }
  check('trade: an emerald bought: What a Deal! is the guest\'s', a.adv.isDone(A('adventure/trade')), `${sa.progress.advancements.isDone(A('adventure/trade'))}`);
  if (gm) {
    gm.clicked(4 + 27, 0, 'pickup');
    gm.removed();
  }
  v.remove();
  step(host, 3);
}

// ---------------------------------------------------------------------------
// a horse (player_interacted_with_entity): its body armour is behind a method, a wolf's in a field; the trigger takes
// either, and a guest getting on a tame horse doesn't break the host's tick (it threw, the host's own game's too)
{
  const h = m.createMob('horse', lvl);
  h.moveTo(ha.x + 1.5, 64, ha.z, 0, 0);
  h.tamed = true;
  h.serverAiStep = () => {};
  lvl.addEntity(h);
  const armour = S('iron_horse_armor');
  h.inventory?.setItem?.(1, armour);
  const pl = m.interactedPayload(null, h);
  check('horse: the trigger\'s payload has the horse\'s body armour, from its method', pl.interacted.entity === 'horse' && (h.bodyArmor() ? pl.interacted.bodyArmor?.item === h.bodyArmor().item.id : pl.interacted.bodyArmor === null), JSON.stringify(pl));
  const w = m.createMob('wolf', lvl);
  w.bodyArmor = S('wolf_armor');
  check('horse: and a wolf\'s, from its field', m.interactedPayload(S('armadillo_scute'), w).interacted.bodyArmor?.item === 'wolf_armor' && m.interactedPayload(S('armadillo_scute'), w).interacted.item === 'armadillo_scute');
  step(host, 3);
  let threw = null;
  try {
    a.session.input(false, false, true, false, copyOf(a, h));
    step(host, 1);
    a.session.input(false, false, false, false, null);
    step(host, 3);
  } catch (e) {
    threw = e;
  }
  check('horse: a guest gets on the tame horse; the host\'s tick goes on', !threw && ha.vehicle === h, threw ? String(threw.stack).slice(0, 300) : `${ha.vehicle?.type}`);
  ha.removeVehicle();
  h.remove();
  step(host, 5);
}

// ---------------------------------------------------------------------------
// a bed (slept_in_bed)
{
  const bx = -4, bz = 3;
  lvl.world.setState(bx, 64, bz, m.S('red_bed', { part: 'foot', facing: 'south' }));
  lvl.world.setState(bx, 64, bz + 1, m.S('red_bed', { part: 'head', facing: 'south' }));
  lvl.dayTime = 14000;
  step(host, 25);
  walkTo(a, bx + 0.5, bz - 1.2);
  const eye = a.player.y + a.player.eyeHeight;
  const tx = bx + 0.5 - a.player.x, ty = 64.3 - eye, tz = bz + 0.5 - a.player.z;
  a.player.yaw = (Math.atan2(-tx, tz) * 180) / Math.PI;
  a.player.pitch = (-Math.atan2(ty, Math.hypot(tx, tz)) * 180) / Math.PI;
  step(host, 2);
  a.session.input(false, false, true, true, null);
  step(host, 1);
  a.session.input(false, false, false, false, null);
  step(host, 3);
  check('bed: (asleep)', ha.isSleeping());
  check('bed: asleep in a bed: Sweet Dreams is the guest\'s', a.adv.isDone(A('adventure/sleep_in_bed')) && a.advToasts.includes('adventure/sleep_in_bed'));
  a.session.stopSleeping();
  step(host, 5);
  lvl.dayTime = 1000;
}

// ---------------------------------------------------------------------------
// where it is (location, every 20 ticks): its biome for Adventuring Time; what's on it (effects_changed)
{
  step(host, 21);
  check('biome: standing in plains: Adventuring Time has plains, for the guest', a.adv.progress.get('adventure/adventuring_time')?.has('plains') && sa.progress.advancements.progress.get('adventure/adventuring_time')?.has('plains'));
  for (const e of A('nether/all_potions').criteria.all_effects.effects) ha.addEffect(new m.MobEffectInstance(m.mobEffect(e), 600, 0));
  step(host, 3);
  check('effects: every effect of A Furious Cocktail on the guest at once: it\'s the guest\'s', a.adv.isDone(A('nether/all_potions')) && a.advToasts.includes('nether/all_potions'));
  check('effects: a challenge\'s line: "Alex has completed the challenge [A Furious Cocktail]", in purple', host.chat.includes('Alex has completed the challenge §5[A Furious Cocktail]§r'));
  ha.removeAllEffects?.();
  for (const e of [...ha.activeEffects.keys()]) ha.removeEffect?.(e);
  step(host, 2);
}

// ---------------------------------------------------------------------------
// the host takes them to the Nether (changed_dimension): both guests' We Need to Go Deeper, the Nether tab's root
{
  hostChangeDimension(host, 'the_nether', 0.5, 65, 0.5, 'nether_portal');
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) host.makeChunk(cx, cz);
  host.server.hostArrived();
  step(host, 10);
  check('dimension: arrived in the Nether: We Need to Go Deeper is each guest\'s', a.adv.isDone(A('story/enter_the_nether')) && b.adv.isDone(A('story/enter_the_nether')));
  check('dimension: the Nether tab\'s root too, without a toast', a.adv.isDone(A('nether/root')) && !a.advToasts.includes('nether/root'));
  check('dimension: "Steve has made the advancement [We Need to Go Deeper]" for everyone', a.chat.includes(line('Steve', 'story/enter_the_nether')) && host.chat.includes(line('Steve', 'story/enter_the_nether')));
  hostChangeDimension(host, 'overworld', 0.5, 65, 0.5, 'nether_portal');
  for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) if (!lvl.world.getChunk(cx, cz)) host.makeChunk(cx, cz);
  host.server.hostArrived();
  step(host, 10);
}

// ---------------------------------------------------------------------------
// the host's own advancements are announced to its guests (Game.onAdvancement, on a stand-in for the rest of the game)
{
  const told = [];
  const stand = { toasts: { add() {} }, level: lvl, chat: (t) => told.push(t), playerName: 'Host', server: host.server };
  m.Game.prototype.onAdvancement.call(stand, A('story/mine_stone'));
  step(host, 2);
  const want = line('Host', 'story/mine_stone');
  check('host: the host\'s own advancement in its chat and in both guests\'', told.includes(want) && a.chat.includes(want) && b.chat.includes(want));
}

// ---------------------------------------------------------------------------
// kept with its player: leaving, the record has them; back, it's told them all as a reset, without toasts or lines
{
  const uuid = a.session.me.uuid;
  const had = sa.progress.advancements.save();
  a.session.leave();
  host.guests.splice(host.guests.indexOf(a), 1);
  step(host, 3);
  const rec = saved.get(uuid);
  check('kept: its record holds its advancements, as the host had them', rec && JSON.stringify(rec.advancements) === JSON.stringify(had) && rec.advancements['story/mine_stone']?.includes('get_stone'), JSON.stringify(rec?.advancements)?.slice(0, 200));
  const chat0 = host.chat.length;
  const a2 = guest('Alex', { viewDistance: 4 });
  await settle(20);
  const ha2 = hostCopy(host, a2), sa2 = host.server.sessionOf(ha2);
  check('kept: back, its player has them on the host', sa2 && sa2.progress.advancements.isDone(A('story/mine_stone')) && sa2.progress.advancements.isDone(A('adventure/trade')));
  check('kept: and the guest is told them all, as a reset', a2.advPackets[0]?.reset === true && a2.adv.isDone(A('story/mine_stone')) && a2.adv.isDone(A('nether/all_potions')) && a2.adv.progressText(A('husbandry/balanced_diet')) === '1/40');
  check('kept: without toasts for what it had (vanilla: none on the reset)', a2.advToasts.length === 0, JSON.stringify(a2.advToasts));
  check('kept: nor chat lines for them', !host.chat.slice(chat0).some((t) => t.includes('has made the advancement') || t.includes('has completed')), JSON.stringify(host.chat.slice(chat0)));
}

// ---------------------------------------------------------------------------
// a host whose advancements aren't this game's: the guest leaves, saying why
{
  function fakeHost() {
    const net = new m.MemoryNetwork();
    const f = { m, net, guests: [], peer: null };
    net.host.onPeer((peer, joined) => {
      if (joined) f.peer = peer;
    });
    net.host.onMessage(() => {});
    f.send = (packets) => net.host.send(f.peer, m.encode(packets));
    f.tick = (k = 1) => {
      for (let i = 0; i < k + SETTLE; i++) {
        net.deliver();
        for (const g of f.guests) g.session.tick();
        net.deliver();
      }
    };
    return f;
  }
  const LOGIN = {
    playerId: 7, worldName: 'Elsewhere', dimension: 'overworld', gameMode: 'survival', difficulty: 'normal', hardcore: false, gameRules: { doDaylightCycle: true },
    gameTime: 100, dayTime: 100, raining: false, thundering: false, rainLevel: 0, thunderLevel: 0, x: 0.5, y: 65, z: 0.5, yRot: 0, xRot: 0, viewDistance: 3, hostName: 'Other',
  };
  function hostSends(label, pk, want) {
    const f = fakeHost();
    const g = makeGuest(f, 'Alex');
    g.session.hooks.advancements = () => {};
    f.tick(1);
    f.send([[m.CB.Login, LOGIN]]);
    f.tick(1);
    let threw = null;
    try {
      f.send([pk]);
      f.tick(2);
    } catch (e) {
      threw = e;
    }
    const ok = want === null ? g.disconnected === null : g.disconnected !== null && want.test(g.disconnected);
    check(`host sends ${label}: ${want === null ? 'taken' : 'the guest leaves, saying why'}`, !threw && ok, threw ? String(threw.stack ?? threw).slice(0, 300) : `${g.disconnected}`);
  }
  const UA = m.CB.UpdateAdvancements;
  hostSends('an advancement that isn\'t one', [UA, false, [['story/the_moon', ['c']]]], /an advancement that does not exist/);
  hostSends('"__proto__" for an advancement', [UA, false, [['__proto__', []]]], /an advancement that does not exist/);
  hostSends('a criterion the advancement hasn\'t', [UA, false, [['story/mine_stone', ['get_moon']]]], /an advancement that does not exist/);
  hostSends('"constructor" for a criterion', [UA, false, [['story/mine_stone', ['constructor']]]], /an advancement that does not exist/);
  hostSends('progress that isn\'t a list', [UA, false, { 'story/mine_stone': ['get_stone'] }], /bad field 1/);
  hostSends('an entry of three', [UA, false, [['story/mine_stone', ['get_stone'], 1]]], /bad field 1/);
  hostSends('a criterion that\'s a number', [UA, false, [['story/mine_stone', [7]]]], /bad field 1/);
  hostSends('a reset flag that isn\'t one', [UA, 1, []], /bad field 0/);
  hostSends('a good one', [UA, true, [['story/mine_stone', ['get_stone']]]], null);
}

exitWithStatus(close);
