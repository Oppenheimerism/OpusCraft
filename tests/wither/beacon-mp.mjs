// Multiplayer checks for the beacon (node tests/wither/beacon-mp.mjs; the beacon, milestone 2), over the multiplayer
// harness (tests/multiplayer/lib.mjs): a guest sets a renamed beacon on an iron pyramid (the host places it, its name
// kept); it lights for the guest (its world's copy lit, with the beam and its stained glass colours the host found,
// the power-up sound heard, Bring Home the Beacon raised for the guest); the guest opens its menu (the host's, slot
// for slot, its tiers shown), pays with an iron ingot and chooses Speed (the host sets it, takes the payment, the
// selection sound heard); a choice its tiers don't reach, or one without a payment, is refused by the host; the guest
// gets Speed (ambient) and a guest out of range doesn't; a payment left in is dropped at the guest's feet when its
// screen closes, or when it walks away; the beam's glass taken away and the pyramid broken show on the guest (dark,
// the power-down sound heard); a beacon broken with its menu open closes it.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, check, exitWithStatus } from '../multiplayer/lib.mjs';

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/game/openMenu.ts', '/src/net/menus.ts', '/src/net/client/clientMenus.ts', '/src/net/server/menuSync.ts',
  '/src/inventory/container.ts', '/src/game/beacon.ts', '/src/inventory/beaconMenu.ts', '/src/game/blockBehavior.ts',
]);

const host = flatHost(m, 6, { guestGameMode: 'survival', gameMode: 'survival' });
const lvl = host.level;
lvl.doDaylightCycle = false;
lvl.dayTime = 6000;
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
const triggers = [];
lvl.onPlayerTrigger = (p, type, payload) => triggers.push({ p, type, payload });
step(host, 40);
const ha = hostCopy(host, a), hb = hostCopy(host, b);
check('(both guests are in, in survival)', !!ha && !!hb && ha.gameMode === 'survival' && hb.gameMode === 'survival');
const sess = (g) => host.server.sessionOf(hostCopy(host, g));
const key = (s) => m.stackKey(s);
const S = (id, n = 1) => m.ItemStack.of(id, n);
const heard = (g, name) => g.level.sounds.filter((s) => s.name === name).length;
const invSlot = (menu, i) => menu.slots.findIndex((sl) => sl.container instanceof m.PlayerContainer && sl.slot === i);
const invOf = (menu, id) => menu.slots.findIndex((sl) => sl.container instanceof m.PlayerContainer && sl.item?.item.id === id);
const ironDrops = () => lvl.entities.filter((e) => e instanceof m.ItemEntity && !e.removed && e.stack?.item.id === 'iron_ingot');

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
/** a press of the use button */
function use(g) {
  g.session.input(false, false, true, false, null);
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
/** the host's copy of `g`'s player given `stack` in hotbar slot `i` (and that slot selected) */
function give(g, i, stack) {
  const hp = hostCopy(host, g), inv = hp.inventory;
  inv.main[i] = stack;
  inv.selected = i;
  g.player.inventory.selected = i;
  inv.version++;
  step(host, 2);
}
/** whether what `g` shows of its open menu is the host's, slot for slot, and its cursor */
function same(g, label) {
  const gm = g.session.menus.open?.menu, hm = sess(g).menus.menu;
  const out = [];
  if (!gm || !hm || gm.slots.length !== hm.slots.length) out.push(`${gm?.slots.length} slots vs ${hm?.slots.length}`);
  else for (let i = 0; i < gm.slots.length; i++) if (key(gm.slots[i].item) !== key(hm.slots[i].item)) out.push(`${i}: ${key(gm.slots[i].item) || '-'} vs ${key(hm.slots[i].item) || '-'}`);
  if (gm && hm && key(gm.carried) !== key(hm.carried)) out.push(`cursor: ${key(gm.carried) || '-'} vs ${key(hm.carried) || '-'}`);
  check(`${label}: what ${g.name} shows is the host's`, !out.length, out.slice(0, 4).join('; '));
}
/** the menu's click, as the guest's screen makes it, and the ticks after */
function click(g, menu, slot, button, type, n = 2) {
  menu.clicked(slot, button, type);
  step(host, n);
}
/** the guest's screen closed (Escape, or Cancel) */
function shut(g, menu) {
  menu.removed();
  step(host, 2);
}
const clear = (g) => {
  const inv = hostCopy(host, g).inventory;
  inv.main.fill(null);
  inv.version++;
  step(host, 2);
};
/** the beam as a string ("colour:height,..."), the host's or a guest's copy's */
const beamOf = (be) => (be ? m.encodeBeam(be.beamSections) : '(none)');

// the pyramid: a 3x3 of iron blocks round (5, 64, 0); red stained glass two blocks over where the beacon goes and
// blue two more over that (the beam white, then red, then red and blue mixed)
const BX = 5, BY = 65, BZ = 0;
for (let x = BX - 1; x <= BX + 1; x++) for (let z = BZ - 1; z <= BZ + 1; z++) lvl.setBlock(x, BY - 1, z, m.S('iron_block'));
lvl.setBlock(BX, BY + 2, BZ, m.S('red_stained_glass'));
lvl.setBlock(BX, BY + 4, BZ, m.S('blue_stained_glass'));
walkTo(a, 2.5, 0.5);
walkTo(b, 2.5, 30.5);
step(host, 4);

// ---------------------------------------------------------------------------
// the guest sets down a renamed beacon on the pyramid: the host places it, with its name
{
  const beacon = S('beacon');
  beacon.tag = { customName: 'Lighthouse' };
  give(a, 0, beacon);
  lookAt(a, BX + 0.6, BY, BZ + 0.5);
  step(host, 2);
  use(a);
  const hbe = lvl.world.getBlockEntity(BX, BY, BZ);
  check('placed by the guest: a beacon on the host, its block entity there', hbe instanceof m.BeaconBlockEntity, `${lvl.getState(BX, BY, BZ)}`);
  check('...with the item\'s name, and the beacon gone from the guest\'s hand', hbe?.customName === 'Lighthouse' && !ha.inventory.main[0] && !a.player.inventory.main[0]);
  const gbe = a.world.getBlockEntity(BX, BY, BZ);
  check('...and in the guest\'s world, dark as yet', gbe instanceof m.BeaconBlockEntity && gbe.levels === 0 && gbe.shownBeam().length === 0);
}

const hbe = lvl.world.getBlockEntity(BX, BY, BZ);
const gbe = () => a.world.getBlockEntity(BX, BY, BZ);

// ---------------------------------------------------------------------------
// it lights within four seconds: the guest's copy lit, with the host's beam; heard; Bring Home the Beacon
{
  const before = heard(a, 'block.beacon.activate');
  step(host, 85);
  check('lit on the host: one tier, the beam white, red, then red and blue mixed', hbe.levels === 1 && beamOf(hbe) === 'f9fffe:2,b02e26:2,763968:2', beamOf(hbe));
  check('the guest\'s copy lit too, its beam the host\'s', gbe()?.levels === 1 && beamOf(gbe()) === beamOf(hbe), `${gbe()?.levels} ${beamOf(gbe())}`);
  check('...and what it draws (the stained glass colours)', gbe()?.shownBeam().map((s) => s.color.toString(16)).join() === 'f9fffe,b02e26,763968');
  check('the guest hears it power up (once), from the beacon', heard(a, 'block.beacon.activate') === before + 1 && a.level.sounds.some((s) => s.name === 'block.beacon.activate' && Math.abs(s.x - (BX + 0.5)) < 0.01 && Math.abs(s.z - (BZ + 0.5)) < 0.01));
  check('Bring Home the Beacon: construct_beacon (one tier) for the guest beside it', triggers.some((t) => t.p === ha && t.type === 'construct_beacon' && t.payload.beaconLevel === 1));
  check('...not for the guest 30 blocks off', !triggers.some((t) => t.p === hb && t.type === 'construct_beacon'));
  check('nothing saved or sent of what it draws but those two (no Levels read back by the guest from the save)', !('shown_levels' in (hbe.save() ?? {})) && !('beam' in (hbe.save() ?? {})));
}

// ---------------------------------------------------------------------------
// its menu, opened by the guest: the payment slot and the inventory, the beacon's tiers shown; an iron ingot paid in
let glc, hlc;
{
  give(a, 0, S('iron_ingot', 2));
  glc = openAt(a, BX, BY, BZ);
  hlc = sess(a).menus.menu;
  check('the guest uses the beacon: its menu opens for the guest (and the host has it)', glc instanceof m.BeaconMenu && hlc instanceof m.BeaconMenu && hlc.beacon === hbe && a.shown.includes(glc));
  check('...37 slots (the payment and the inventory)', glc?.slots.length === 37 && hlc?.slots.length === 37);
  check('...the beacon\'s tier, and no power yet, shown on the guest', glc?.levels === 1 && glc?.primary === null && glc?.secondary === null);
  same(a, 'opened');
  // two ingots don't shift-click in (vanilla: only one on its own does); one picked up and put in does
  click(a, glc, invSlot(glc, 0), 0, 'quick_move');
  check('a stack of two isn\'t shift-clicked into the payment slot (it goes up into the inventory)', !hlc.hasPayment() && !glc.hasPayment() && !ha.inventory.main[0] && ha.inventory.main.slice(9).some((s) => s?.item.id === 'iron_ingot' && s.count === 2));
  same(a, 'shift-clicked');
  const at = invOf(glc, 'iron_ingot');
  click(a, glc, at, 1, 'pickup');
  check('(a right-click picks up one of the two)', hlc.carried?.count === 1 && glc.carried?.count === 1);
  click(a, glc, 0, 0, 'pickup');
  check('one ingot put in by hand: paid on the host and shown on the guest', hlc.hasPayment() && hlc.payment.get(0)?.count === 1 && glc.hasPayment() && !hlc.carried);
  same(a, 'paid');
  click(a, glc, at, 0, 'pickup');
  click(a, glc, 0, 0, 'pickup');
  check('a second can\'t go in with it (one at a time)', hlc.payment.get(0)?.count === 1 && hlc.carried?.count === 1 && glc.carried?.count === 1);
  click(a, glc, at, 0, 'pickup');
  check('(the other ingot put back)', ha.inventory.main.some((s) => s?.item.id === 'iron_ingot' && s.count === 1) && !hlc.carried);
}

// ---------------------------------------------------------------------------
// the powers chosen (Done): a tier the beacon doesn't reach refused, Speed accepted, paid for, heard
{
  const t0 = heard(a, 'block.beacon.power_select');
  glc.clickMenuButton(m.beaconButton('strength', null));
  step(host, 3);
  check('Strength with one tier (a screen can\'t ask for it): refused by the host, the payment kept', hbe.primary === null && hlc.hasPayment() && glc.hasPayment());
  glc.clickMenuButton(m.beaconButton('resistance', null));
  glc.clickMenuButton(7 * 8);
  glc.clickMenuButton(4095);
  glc.clickMenuButton(m.beaconButton(null, null));
  glc.clickMenuButton(m.beaconButton(null, 'regeneration'));
  step(host, 3);
  check('...nor Resistance, buttons past the last, or no primary at all', hbe.primary === null && hbe.secondary === null && hlc.hasPayment());
  check('(and the guest is still in)', !!sess(a) && glc === a.session.menus.open?.menu);
  glc.clickMenuButton(m.beaconButton('speed', null));
  step(host, 3);
  check('Speed chosen by the guest: set by the host, the payment taken', hbe.primary === 'speed' && hbe.secondary === null && !hlc.hasPayment(), `${hbe.primary} ${hlc.hasPayment()}`);
  check('...and shown on the guest (its menu\'s numbers, its payment slot empty)', glc.primary === 'speed' && glc.secondary === null && !glc.hasPayment());
  check('...the selection sound heard by the guest', heard(a, 'block.beacon.power_select') === t0 + 1);
  same(a, 'powers chosen');
  glc.clickMenuButton(m.beaconButton('haste', null));
  step(host, 3);
  check('with no payment in, another choice is refused', hbe.primary === 'speed');
  check('the guest\'s copy of the block keeps its powers too (sent with it)', gbe()?.primary === 'speed');
}

// ---------------------------------------------------------------------------
// the guest gets Speed (ambient: the faint swirls), for 11 seconds at one tier; the guest 30 blocks off doesn't
{
  step(host, 85);
  const e = ha.getEffect('speed'), ge = a.player.getEffect('speed');
  check('the guest beside it gets Speed I, ambient, from the host', !!e && e.amplifier === 0 && e.ambient === true && e.duration > 140 && e.duration <= 220, `${e?.amplifier} ${e?.ambient} ${e?.duration}`);
  check('...shown on the guest\'s own player', !!ge && ge.amplifier === 0 && ge.ambient === true);
  check('the guest 30 blocks off (out of a tier\'s 20) gets nothing', !hb.hasEffect('speed') && !b.player.hasEffect('speed'));
  check('the hum heard every four seconds while it\'s lit', heard(a, 'block.beacon.ambient') >= 1);
}

// ---------------------------------------------------------------------------
// a payment left in: dropped at the guest's feet when the screen closes (vanilla BeaconMenu.removed)
{
  clear(a);
  give(a, 0, S('iron_ingot'));
  click(a, glc, invSlot(glc, 0), 0, 'quick_move');
  check('a single ingot shift-clicked into the payment slot', hlc.hasPayment() && glc.hasPayment() && !ha.inventory.main[0]);
  const n0 = ironDrops().length;
  shut(a, glc);
  const drops = ironDrops();
  check('closed: the menu shut on the host', sess(a).menus.containerId === 0 && !a.session.menus.open);
  check('...the ingot dropped at the guest\'s feet, not back in its inventory', drops.length === n0 + 1 && drops.some((e) => Math.hypot(e.x - ha.x, e.z - ha.z) < 2) && !ha.inventory.main.some((s) => s?.item.id === 'iron_ingot'));
  check('...and the guest sees it there (no copy made on its own side)', drops.every((e) => !!copyOf(a, e)) && !a.player.inventory.main.some((s) => s?.item.id === 'iron_ingot'));
  for (const e of drops) e.remove();
  step(host, 2);
}

// ---------------------------------------------------------------------------
// walked more than eight blocks off with a payment in: the host closes it, the ingot dropped where the guest is
{
  give(a, 0, S('iron_ingot'));
  const gm = openAt(a, BX, BY, BZ), hm = sess(a).menus.menu;
  click(a, gm, invSlot(gm, 0), 0, 'quick_move');
  check('(opened again, an ingot in)', gm instanceof m.BeaconMenu && hm?.hasPayment());
  walkTo(a, 2.5, 20.5);
  step(host, 3);
  check('walked off: closed by the host, and on the guest', sess(a).menus.containerId === 0 && !a.session.menus.open && a.hidden.includes(gm));
  // (dropped where the guest was as it went out of reach, more than 8 blocks from the beacon, thrown the way it looked)
  const drops = ironDrops();
  check('...the ingot dropped where the guest went out of reach (none kept)', drops.length === 1 && Math.abs(drops[0].x - 2.5) < 4 && drops[0].z > 6 && drops[0].z < 16 && !ha.inventory.main.some((s) => s?.item.id === 'iron_ingot') && !hm.hasPayment(), `${drops.map((e) => `${e.x.toFixed(1)},${e.z.toFixed(1)}`)}`);
  for (const e of ironDrops()) e.remove();
  walkTo(a, 2.5, 0.5);
}

// ---------------------------------------------------------------------------
// the beam's glass taken away, then the pyramid: what the guest's copy draws follows; the power-down sound heard
{
  lvl.setBlock(BX, BY + 4, BZ, 0);
  step(host, 6);
  check('the blue glass gone: the beam rescanned, white then red, on the host and the guest', beamOf(hbe) === 'f9fffe:2,b02e26:2' && beamOf(gbe()) === beamOf(hbe), `${beamOf(hbe)} / ${beamOf(gbe())}`);
  // (vanilla: a beam cut off keeps the beacon's tiers, as they're only counted again with a beam; no sound, no powers)
  const d0 = heard(a, 'block.beacon.deactivate'), t0 = lvl.gameTime;
  lvl.setBlock(BX, BY + 2, BZ, m.S('stone'));
  step(host, 85);
  check('stone over it: no beam on the host or the guest (nothing drawn), its tier kept as in Minecraft', !hbe.beamSections.length && !gbe()?.beamSections.length && gbe()?.shownBeam().length === 0 && hbe.levels === 1 && gbe()?.levels === 1);
  check('...and no sound for it', heard(a, 'block.beacon.deactivate') === d0);
  const sp = ha.getEffect('speed');
  check('...no more powers: Speed not renewed', !sp || sp.duration <= 220 - (lvl.gameTime - t0) + 2, `${sp?.duration}`);
  lvl.setBlock(BX, BY + 2, BZ, 0);
  step(host, 85);
  check('the stone taken away: its beam back, for both', hbe.levels === 1 && gbe()?.levels === 1 && beamOf(hbe) === 'f9fffe:2' && beamOf(gbe()) === 'f9fffe:2', `${beamOf(hbe)} / ${beamOf(gbe())}`);
  const d1 = heard(a, 'block.beacon.deactivate');
  lvl.setBlock(BX - 1, BY - 1, BZ - 1, m.S('stone'));
  step(host, 85);
  check('a corner of the pyramid gone: no tiers, dark for both, heard', hbe.levels === 0 && gbe()?.levels === 0 && gbe()?.shownBeam().length === 0 && heard(a, 'block.beacon.deactivate') === d1 + 1);
  lvl.setBlock(BX - 1, BY - 1, BZ - 1, m.S('iron_block'));
  step(host, 85);
  check('(the corner put back: lit again)', hbe.levels === 1 && gbe()?.levels === 1);
}

// ---------------------------------------------------------------------------
// the beacon broken while its menu's open: the menu closed, the power-down sound heard, the block gone for the guest
{
  clear(a);
  const gm = openAt(a, BX, BY, BZ);
  check('(its menu open again, the beacon\'s power still Speed)', gm instanceof m.BeaconMenu && gm.primary === 'speed');
  const d0 = heard(a, 'block.beacon.deactivate');
  lvl.setBlock(BX, BY, BZ, 0);
  step(host, 3);
  check('broken: its menu closed on the host and the guest', sess(a).menus.containerId === 0 && !a.session.menus.open && a.hidden.includes(gm));
  check('...the power-down sound heard', heard(a, 'block.beacon.deactivate') === d0 + 1);
  check('...and it\'s gone from the guest\'s world', !a.world.getBlockEntity(BX, BY, BZ) && a.world.getState(BX, BY, BZ) === 0);
}

await exitWithStatus(close);
