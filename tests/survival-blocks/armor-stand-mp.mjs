// Multiplayer checks for the armour stand (node tests/survival-blocks/armor-stand-mp.mjs): guests see the host's
// stands where they stand, turned as they are, with what they wear and hold; a guest's right-click dresses one or takes
// off what's where it looked (the host deciding, by its own look at the stand), and everyone sees the change and hears
// the equip; a guest places one (heard and seen by the other); a guest's blow shakes one (the other sees the wobble and
// hears the knock) and a second quick one breaks it (gone for everyone, its drops on the host); a creative guest's one
// blow breaks it; an adventurer's, one out of reach and a marker are refused; a guest who joins late sees a posed,
// small, named stand as it is, and changes to its pose and flags after.
import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, check, exitWithStatus } from '../multiplayer/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/entity/armorStand.ts', '/src/game/itemBehavior.ts', '/src/core/math.ts']);
const { ItemStack } = m;

const host = flatHost(m, 5, { guestGameMode: 'survival', gameMode: 'survival' });
const lvl = host.level;
const a = makeGuest(host, 'Alex', { viewDistance: 4 });
const b = makeGuest(host, 'Steve', { viewDistance: 4 });
step(host, 30);
const ha = hostCopy(host, a);
const G = 64;
const near = (x, y, e = 1e-6) => Math.abs(x - y) <= e;
const heard = (g, n) => g.level.sounds.filter((s) => s.name === n).length;
const standsOnHost = () => lvl.entities.filter((e) => e.type === 'armor_stand' && !e.removed);
const dropsOnHost = () => lvl.entities.filter((e) => e.type === 'item' && !e.removed);
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
/** the guest 2 blocks north of `s`, looking at the point `h` up its front */
function aim(g, s, h) {
  put(g, s.x, G, s.z - 2, 0, (Math.atan2(G + 1.62 - (s.y + h), s.bb.minZ - (s.z - 2)) * 180) / Math.PI);
}
/** a click of `button` ('attack' or 'use') with `e`'s copy under the guest's crosshair (none: a block or the air) */
function click(g, button, e) {
  g.session.input(button === 'attack', false, button === 'use', false, e ? copyOf(g, e) : null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 3);
}
/** a stand of the host's at (x, z), facing north */
function stand(x, z, f = (s) => s) {
  const s = new m.ArmorStand(lvl);
  s.moveTo(x, G, z, 180, 0);
  f(s);
  lvl.addEntity(s);
  step(host, 5);
  return s;
}

// ---------------------------------------------------------------------------
// seen, dressed, undressed
{
  const st = stand(0.5, 3.5, (s) => (s.showArms = true));
  const ca = copyOf(a, st), cb = copyOf(b, st);
  check('seen: both guests see the stand where it stands, turned as it is, its arms shown', ca?.type === 'armor_stand' && cb?.type === 'armor_stand' && near(ca.x, 0.5) && near(ca.y, G) && near(ca.z, 3.5) && near(Math.abs(m.wrapDegrees(ca.yaw)), 180) && near(Math.abs(m.wrapDegrees(ca.bodyYaw)), 180) && ca.showArms && !ca.small);
  check('seen: a guest\'s copy can be clicked (its box as the host\'s)', ca.isPickable() && near(ca.bb.maxY - ca.bb.minY, 1.975) && near(ca.bb.maxX - ca.bb.minX, 0.5));
  give(a, ItemStack.of('iron_chestplate'));
  aim(a, st, 1.2);
  const e0 = heard(b, 'item.armor.equip_iron');
  click(a, 'use', st);
  check('dressed: the host has it wear the guest\'s chestplate, the guest\'s hand emptied on both sides', st.armorItems[2]?.item.id === 'iron_chestplate' && !ha.inventory.main[0] && !a.player.inventory.main[0]);
  check('dressed: both guests see it worn; the equip heard by the other', copyOf(a, st).armorItems[2]?.item.id === 'iron_chestplate' && copyOf(b, st).armorItems[2]?.item.id === 'iron_chestplate' && heard(b, 'item.armor.equip_iron') === e0 + 1);
  give(a, ItemStack.of('stick'));
  click(a, 'use', st);
  check('held: a stick goes in its hand, seen by the other', st.mainHand?.item.id === 'stick' && copyOf(b, st).mainHand?.item.id === 'stick' && !a.player.inventory.main[0]);
  give(a, null);
  aim(a, st, 1.3);
  click(a, 'use', st);
  check('undressed: clicked at the chest, the chestplate comes off into the guest\'s hand, gone for the other', !st.armorItems[2] && ha.inventory.main[0]?.item.id === 'iron_chestplate' && a.player.inventory.main[0]?.item.id === 'iron_chestplate' && !copyOf(b, st).armorItems[2]);
  give(a, null);
  click(a, 'use', st);
  check('undressed: then (nothing worn there) the stick from its hand', !st.mainHand && a.player.inventory.main[0]?.item.id === 'stick' && !copyOf(b, st).mainHand);
  // refused: DisabledSlots, out of reach, a marker
  st.disabledSlots = 1 << 4;
  give(a, ItemStack.of('iron_helmet'));
  aim(a, st, 1.8);
  click(a, 'use', st);
  check('refused: a disabled slot stays empty, the helmet kept', !st.armorItems[3] && ha.inventory.main[0]?.item.id === 'iron_helmet');
  st.disabledSlots = 0;
  // (a stick: a helmet's own use would put it on the guest's head when the stand isn't reached)
  give(a, ItemStack.of('stick'));
  put(a, 0.5, G, -9.5, 0, 0);
  click(a, 'use', st);
  check('refused: from out of its reach, nothing', !st.mainHand && ha.inventory.main[0]?.item.id === 'stick');
  st.setMarker(true);
  step(host, 3);
  aim(a, st, 1.2);
  click(a, 'use', st);
  check('refused: a marker (no box for the host, nor the guest\'s copy)', !st.mainHand && ha.inventory.main[0]?.item.id === 'stick' && !copyOf(a, st).isPickable() && copyOf(a, st).bb.maxY - copyOf(a, st).bb.minY === 0);
  st.remove();
  step(host, 3);
  check('gone: a stand removed on the host is gone from the guests', copyOf(a, st) === null && copyOf(b, st) === null);
}

// ---------------------------------------------------------------------------
// placed by a guest, struck, broken
{
  give(a, ItemStack.of('armor_stand', 2));
  put(a, 3.5, G, 0.5, 0, (Math.atan2(1.62, 2) * 180) / Math.PI);
  const n0 = standsOnHost().length, p0 = heard(b, 'entity.armor_stand.place');
  click(a, 'use', null);
  const placed = standsOnHost().find((s) => near(s.x, 3.5) && near(s.z, 2.5));
  check('placed by a guest: on the host where it looked, turned to face it, one used (on both sides)', standsOnHost().length === n0 + 1 && !!placed && near(Math.abs(m.wrapDegrees(placed.yaw)), 180) && ha.inventory.main[0]?.count === 1 && a.player.inventory.main[0]?.count === 1);
  check('placed by a guest: the other sees it and hears it', copyOf(b, placed)?.type === 'armor_stand' && heard(b, 'entity.armor_stand.place') === p0 + 1);
  give(a, null);
  aim(a, placed, 1);
  const h0 = heard(b, 'entity.armor_stand.hit');
  click(a, 'attack', placed);
  const cb = copyOf(b, placed);
  check('struck by a guest: it shakes on the host; the other sees the wobble and hears the knock', !placed.removed && placed.lastHit > 0 && cb?.lastHit === placed.lastHit && heard(b, 'entity.armor_stand.hit') === h0 + 1);
  check('struck by a guest: the wobble is under way on the other\'s clock', cb && b.level.gameTime - cb.lastHit >= 0 && b.level.gameTime - cb.lastHit < 8, cb && `${b.level.gameTime} ${cb.lastHit}`);
  const b0 = heard(b, 'entity.armor_stand.break');
  click(a, 'attack', placed);
  check('broken by a guest (twice quickly): gone on the host and for both guests, its break heard', placed.removed && copyOf(a, placed) === null && copyOf(b, placed) === null && heard(b, 'entity.armor_stand.break') === b0 + 1);
  check('broken by a guest: it drops itself on the host', dropsOnHost().some((e) => e.stack.item.id === 'armor_stand'));
  dropsOnHost().forEach((e) => e.remove());
  // an adventurer's blows, a creative guest's
  const adv = stand(-2.5, 3.5);
  ha.setGameMode('adventure');
  step(host, 2);
  aim(a, adv, 1);
  click(a, 'attack', adv);
  click(a, 'attack', adv);
  check('an adventurer\'s blows: nothing', !adv.removed && adv.lastHit < 0);
  ha.setGameMode('creative');
  step(host, 2);
  click(a, 'attack', adv);
  check('a creative guest\'s one blow breaks it, dropping nothing', adv.removed && copyOf(b, adv) === null && dropsOnHost().length === 0);
  ha.setGameMode('survival');
  step(host, 2);
}

// ---------------------------------------------------------------------------
// a late joiner; changes after
{
  const fancy = stand(-3.5, 3.5, (s) => {
    s.setSmall(true);
    s.showArms = true;
    s.noBasePlate = true;
    s.headPose = [20, 30, 0];
    s.rightArmPose = [-90, 0, 0];
    s.setCustomName('Bob');
    s.customNameVisible = true;
    s.setItemSlot('head', ItemStack.of('diamond_helmet'));
    s.setItemSlot('offhand', ItemStack.of('shield'));
  });
  const c = makeGuest(host, 'Kai', { viewDistance: 4 });
  step(host, 30);
  const cf = copyOf(c, fancy);
  check('late joiner: sees it small, posed, named, dressed', !!cf && cf.small && near(cf.height, 0.9875) && near(cf.bb.maxY - cf.bb.minY, 0.9875) && cf.noBasePlate && cf.showArms && cf.headPose.join() === '20,30,0' && cf.rightArmPose.join() === '-90,0,0' && cf.customName === 'Bob' && cf.customNameVisible && cf.armorItems[3]?.item.id === 'diamond_helmet' && cf.offHand?.item.id === 'shield');
  fancy.leftArmPose = [-45, 10, 0];
  fancy.invisible = true;
  fancy.setItemSlot('head', null);
  step(host, 3);
  const cf2 = copyOf(c, fancy);
  check('changes after: its pose, invisibility and gear as the host has them', cf2 === cf && cf.leftArmPose.join() === '-45,10,0' && cf.invisible && cf.isInvisible() && !cf.armorItems[3]);
  fancy.setSmall(false);
  step(host, 3);
  check('changes after: grown (its box too)', !cf.small && near(cf.bb.maxY - cf.bb.minY, 1.975));
  fancy.moveTo(-3.5, G + 3, 3.5);
  step(host, 30);
  check('falls on the host, and the guests see it come down', near(fancy.y, G) && near(cf.y, G, 1e-3), `${fancy.y} ${cf.y}`);
}

await exitWithStatus(close);
