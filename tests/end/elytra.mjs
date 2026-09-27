// The elytra (headless): node tests/end/elytra.mjs
import { readFileSync } from 'node:fs';
import { load, check, flatLevel, place, ticks, exitWithStatus } from '../../tests/temples/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();

const { m, close } = await load([
  '/src/entity/player.ts', '/src/entity/elytra.ts', '/src/item/equipment.ts', '/src/item/enchantments.ts', '/src/item/enchantHelper.ts',
  '/src/inventory/enchantMenus.ts', '/src/inventory/menus.ts', '/src/game/interaction.ts', '/src/game/redstone/dispenser.ts',
  '/src/game/redstone/dispenseItems.ts', '/src/game/advancements.ts', '/src/entity/effects.ts', '/src/core/aabb.ts', '/src/entity/itemEntity.ts',
  '/src/textures/itemlib/end.ts', '/src/textures/elytra.ts', '/src/entity/animals.ts',
]);
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const G = 64;
const near = (a, b, e) => Math.abs(a - b) <= e;

// --- the item
const E = m.ITEMS.get('elytra');
check('the item: Elytra, one to a stack, 432 durability, epic, in the tools tab', E && E.name === 'Elytra' && E.maxStack === 1 && E.maxDamage === 432 && E.rarity === 'epic' && E.creativeTab === 'tools', `${E?.name} ${E?.maxStack} ${E?.maxDamage} ${E?.rarity} ${E?.creativeTab}`);
check('worn in the chest slot, with its own equip sound', m.equipableSlot(E) === 'chest' && m.equipSound(E) === 'item.armor.equip_elytra');
check('takes Unbreaking, Mending and the curses, not Protection; not at an enchanting table', m.ENCHANTABLE.durability(E) && m.ENCHANTABLE.equippable(E) && m.ENCHANTABLE.vanishing(E) && !m.ENCHANTABLE.chest_armor(E) && !m.ENCHANTABLE.armor(E) && m.enchantmentValue(E) === 0);
check('mended with phantom membrane', m.isValidRepairItem(E, stack('phantom_membrane')) && !m.isValidRepairItem(E, stack('leather')));
check('flies until its last point', m.isFlyEnabled(Object.assign(stack('elytra'), { damage: 430 })) && !m.isFlyEnabled(Object.assign(stack('elytra'), { damage: 431 })));
{
  const icons = [m.END_ITEMS.elytra(), m.END_ITEMS.broken_elytra()];
  const opaque = (t) => { let n = 0; for (let i = 3; i < t.data.length; i += 4) if (t.data[i]) n++; return n; };
  check('icons: the elytra, and the broken one with less of it', icons.every((t) => t.w === 16 && opaque(t) > 100) && opaque(icons[1]) < opaque(icons[0]), icons.map(opaque).join('/'));
  const w = m.elytraTexture();
  const a = (u, v) => w.data[(v * w.w + u) * 4 + 3];
  check('the wing texture: 64 x 32, the wing shape on both faces (full at the shoulder, narrowing to the tip)', w.w === 64 && w.h === 32 && a(24, 2) && a(33, 2) && a(33, 21) && !a(24, 21) && a(36, 21) && !a(45, 21) && a(34, 10) && a(42, 0) && !a(34, 0));
}

// --- the glide's arithmetic on its own (vanilla LivingEntity.travel's fall-flying branch, gravity 0.08)
{
  const glider = (pitch) => ({ dx: 0, dy: 0, dz: 0, pitch, yaw: -90, fallDistance: 0, horizontalCollision: false, onGround: false, fallFlying: true, type: 'test', x: 0, y: 0, z: 0, level: { sound: { play() {} } }, move() {}, hurt() {} });
  const g = glider(0);
  for (let i = 0; i < 3000; i++) m.travelFallFlying(g, 0.08);
  // (steady: vy = 0.882 (vy - 0.02); forward h = 0.99 (h + 0.9 m), m = -0.1 (vy - 0.02))
  const vy = -0.01764 / 0.118, h = (0.99 * 0.9 * -0.1 * (vy - 0.02)) / 0.01;
  check('level: it settles at about 1.51 blocks a tick forward and 0.15 down (30 and 3 a second, ten on for one down)', near(g.dx, h, 0.002) && near(g.dy, vy, 0.0005) && Math.abs(g.dz) < 1e-9 && near(g.dx / -g.dy, 10.1, 0.1), `${g.dx.toFixed(4)} ${g.dy.toFixed(4)} (${h.toFixed(4)} ${vy.toFixed(4)})`);
  const d = glider(90);
  for (let i = 0; i < 1000; i++) m.travelFallFlying(d, 0.08);
  check('straight down: close to a free fall, 3.92 a tick at the most, no drift', near(d.dy, -3.92, 0.001) && Math.hypot(d.dx, d.dz) < 1e-6, `${d.dy.toFixed(4)}`);
  const s = glider(0);
  s.fallDistance = 30;
  s.dy = -0.3;
  m.travelFallFlying(s, 0.08);
  check('slower than half a block a tick down, a fall counts from a block at the most', s.fallDistance === 1);
}

// --- a world and a player
const { level, sounds } = flatLevel(m, -4, -4, 4, 4, G);
const heard = (n) => sounds.filter((s) => s.name === n).length;
const player = new m.Player(level);
player.moveTo(0.5, G, 0.5, 0, 0);
level.player = player;
level.addEntity(player);
player.setGameMode('survival');
const inter = new m.Interaction(level, player);
const hold = (s) => { player.inventory.main[0] = s; player.inventory.selected = 0; };
const chest = () => player.inventory.armor[2];
const input = (o = {}) => Object.assign(player.input, { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false }, o);
const tick = (n = 1) => ticks(level, n);
const height = () => player.bb.maxY - player.bb.minY;

// right-click in the air: put on
hold(stack('elytra'));
player.pitch = -90;
inter.pick(player.x, player.y + 1.62, player.z, 0, -90);
inter.rightClickDelay = 0;
inter.use(true, false);
check('used in the hand: put on, the hand empty', chest()?.item.id === 'elytra' && !player.inventory.main[0], `${chest()?.item.id} / ${player.inventory.main[0]?.item.id}`);
check('with its equip sound', heard('item.armor.equip_elytra') === 1);
// swapped for a chestplate
hold(stack('iron_chestplate'));
inter.rightClickDelay = 0;
inter.use(true, false);
check('a chestplate used swaps with it', chest()?.item.id === 'iron_chestplate' && player.inventory.main[0]?.item.id === 'elytra');
// the inventory: shift-clicked in, and only the chest slot takes it
{
  player.inventory.armor[2] = null;
  const menu = new m.InventoryMenu(player);
  const from = menu.slots.findIndex((s, i) => i >= 9 && s.item?.item.id === 'elytra');
  menu.quickMoveStack(player, from);
  check('shift-clicked from the inventory: into the chest slot', chest()?.item.id === 'elytra', `slot ${from}`);
  check('the armour slots: only the chest one takes it', menu.slots[6].mayPlace(stack('elytra')) && !menu.slots[5].mayPlace(stack('elytra')) && !menu.slots[7].mayPlace(stack('elytra')) && !menu.slots[8].mayPlace(stack('elytra')));
}

// --- spreading it
/** the player still in the air at (x, y), facing east, everything reset: health, speed, the double tap's timer */
const air = (y = 150, x = -40.5) => {
  player.moveTo(x, y, 0.5, -90, 0);
  player.dx = player.dy = player.dz = 0;
  player.fallDistance = 0;
  player.fallFlying = false;
  player.flying = false;
  player.health = 20;
  player.jumpTriggerTime = 0;
  input();
  tick();
};
/** jump let go for a tick, then pressed for one: a fresh press */
const jump = () => { input(); tick(); input({ jump: true }); tick(); input(); };
/** ticks with the glider held still (the glide goes on; it doesn't drift off or come down) */
const hover = (n) => { for (let i = 0; i < n; i++) { player.dx = player.dy = player.dz = 0; tick(); } };

player.inventory.armor[2] = stack('elytra');
air();
jump();
check('a jump in mid-air spreads it', player.fallFlying);
check('from that very tick: 0.6 by 0.6, the eyes 0.4 up (vanilla updatePlayerPose, at the end of the tick)', near(height(), 0.6, 1e-9) && near(player.bb.maxX - player.bb.minX, 0.6, 1e-9) && player.eyeHeight === 0.4, `${height()} ${player.eyeHeight}`);
// holding jump from the ground: the jump off it doesn't spread it, nor does keeping it held; a fresh press does
player.moveTo(-40.5, G, 0.5, -90, 0);
player.dx = player.dy = player.dz = 0;
player.fallFlying = false;
input();
tick(3);
input({ jump: true });
tick(8);
check('jump held down through a jump off the ground: it stays folded', !player.fallFlying && !player.onGround && player.y > G + 0.5, `y ${player.y.toFixed(2)}`);
jump();
check('...a fresh press on the way down spreads it', player.fallFlying);
player.inventory.armor[2] = null;
air();
jump();
check('without one: nothing', !player.fallFlying);
player.inventory.armor[2] = Object.assign(stack('elytra'), { damage: 431 });
air();
jump();
check('broken (its last point): nothing', !player.fallFlying);
player.inventory.armor[2] = stack('elytra');
player.moveTo(0.5, G, 0.5, 0, 0);
input();
tick(3);
input({ jump: true });
tick();
input();
check('on the ground a jump is just a jump', !player.fallFlying && player.dy > 0);
tick(20);
player.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.levitation, 100, 0));
air();
jump();
check('levitating: nothing', !player.fallFlying);
player.removeAllEffects();
player.setGameMode('creative');
air();
player.flying = true;
jump();
check('flying in creative: nothing', !player.fallFlying);
air();
jump();
check('in creative, not flying: it spreads', player.fallFlying);
jump();
check('a second press straight after (the double tap to fly): flying, the elytra folded', player.flying && !player.fallFlying);
player.setGameMode('survival');

// --- the glide in the world
{
  air(200, -60.5);
  jump();
  tick(60);
  check('level, from a standstill: off it goes the way it looks, coming down slowly', player.fallFlying && player.dx > 0.3 && Math.abs(player.dz) < 1e-6 && player.dy < -0.1 && player.dy > -0.2, `${player.dx.toFixed(3)} ${player.dy.toFixed(3)}`);
  // look up: speed turns into height
  air(150, -60.5);
  jump();
  player.dx = 1.2;
  player.dy = 0;
  const y0 = player.y;
  player.pitch = -30;
  tick(10);
  // (worked through by hand from vanilla's formula: 1.837 up over the ten ticks, 1.2 a tick forward down to 0.907)
  check('looking up at speed (30° up at 1.2 a tick): climbs 1.84 in half a second, slowing to 0.91', player.fallFlying && near(player.y - y0, 1.837, 0.01) && near(Math.hypot(player.dx, player.dz), 0.9067, 0.002), `${(player.y - y0).toFixed(3)} up, ${Math.hypot(player.dx, player.dz).toFixed(4)}`);
  // turn: the motion swings round toward the look
  air(150, -60.5);
  jump();
  player.dx = 1.2;
  player.dy = 0;
  player.yaw = 0;
  tick(10);
  const ang = (Math.atan2(player.dz, player.dx) * 180) / Math.PI;
  check('turned to look south: the motion swings round to follow', ang > 35, `${ang.toFixed(1)}° from east`);
  // a dive, then pulling up out of it
  air(250, -50.5);
  jump();
  player.pitch = 90;
  tick(25);
  check('straight down: falling faster and faster, no drift', player.dy < -1.2 && Math.hypot(player.dx, player.dz) < 0.05, `${player.dy.toFixed(3)}`);
  const dive = player.dy;
  player.pitch = -20;
  let peak = 0, at = 0;
  for (let i = 1; i <= 40; i++) {
    tick();
    if (player.dx > peak) [peak, at] = [player.dx, i];
  }
  // (by hand from vanilla's formula, pulling up 20° out of 1.65 a tick down: the forward speed peaks near 0.87 after
  // about 17 ticks, the climb starts after about 24 and bleeds it off again)
  console.log("  pull-up:", peak.toFixed(4), at, player.dy.toFixed(4), player.dx.toFixed(4)); check('pulling up out of it: the fall turned into speed forward, then climbing', player.fallFlying && near(peak, 0.868, 0.02) && at >= 14 && at <= 20 && player.dy > 0 && player.dx < peak, `${dive.toFixed(3)} → ${player.dy.toFixed(3)}, forward peaking at ${peak.toFixed(3)} (tick ${at}), ${player.dx.toFixed(3)} at the end`);
}

// --- wear
{
  player.inventory.armor[2] = stack('elytra');
  air(250, 0.5);
  jump();
  hover(18);
  check('19 ticks gliding: not worn yet', player.fallFlying && chest().damage === 0, `${chest().damage}`);
  hover(1);
  check('20: a point', chest().damage === 1, `${chest().damage}`);
  hover(20);
  check('40: two', chest().damage === 2, `${chest().damage}`);
  // Unbreaking holds most of it off (vanilla: a damageable non-armour item keeps a point with chance L / (L + 1))
  player.inventory.armor[2] = Object.assign(stack('elytra'), { tag: { enchantments: { unbreaking: 3 } } });
  air(250, 0.5);
  jump();
  hover(20 * 40 - 1);
  const d = chest().damage;
  check('with Unbreaking III: about a quarter of the wear (40 seconds)', player.fallFlying && d >= 3 && d <= 20, `${d}`);
  // creative: none
  player.inventory.armor[2] = stack('elytra');
  player.setGameMode('creative');
  air(250, 0.5);
  jump();
  hover(60);
  check('in creative it doesn\'t wear', chest().damage === 0 && player.fallFlying);
  player.setGameMode('survival');
  // down to its last point: it stops working, and stays
  player.inventory.armor[2] = Object.assign(stack('elytra'), { damage: 430 });
  air(250, 0.5);
  jump();
  hover(18);
  check('one short of its last point: gliding', player.fallFlying && chest().damage === 430);
  hover(1);
  check('worn to its last point on the twentieth tick (the glide still holds that tick, as in vanilla)', chest()?.damage === 431 && player.fallFlying);
  hover(1);
  check('...then the glide ends, the elytra still there', !player.fallFlying && chest()?.item.id === 'elytra' && chest().count === 1);
}

// --- ending it
{
  // (in creative, so the landing can't hurt)
  player.setGameMode('creative');
  player.inventory.armor[2] = stack('elytra');
  air(G + 30, -60.5);
  jump();
  player.pitch = 20;
  let landed = -1, standing = false;
  for (let i = 0; i < 400 && landed < 0; i++) {
    tick();
    if (!player.fallFlying) {
      landed = i;
      standing = near(height(), 1.8, 1e-9) && !player.crouching;
    }
  }
  check('landing ends it', landed >= 0 && player.onGround, `after ${landed} ticks at ${player.x.toFixed(1)}, ${player.y.toFixed(2)}`);
  check('standing again on the very tick it lands', standing, `${height()}`);
  player.setGameMode('survival');
  // gliding in under a low ceiling (1.75 clear, over a floor of snow): landing there, it crouches
  const SNOW = m.getBlock('snow').state({ layers: 3 });
  for (let x = 14; x <= 26; x++) for (let z = -2; z <= 2; z++) level.setBlock(x, G, z, SNOW);
  for (let x = 18; x <= 26; x++) for (let z = -2; z <= 2; z++) level.setBlock(x, G + 2, z, m.S('stone'));
  air(G + 1, 16.5);
  jump();
  player.dx = 0.35;
  player.dy = 0;
  let crouched = false;
  for (let i = 0; i < 60 && player.fallFlying; i++) {
    tick();
    if (!player.fallFlying) crouched = player.crouching && near(height(), 1.5, 1e-9);
  }
  check('landing under a ceiling too low to stand: crouching', crouched && player.x > 18.3, `${height()} ${player.crouching} at x ${player.x.toFixed(2)}`);
  for (let x = 14; x <= 26; x++) for (let z = -2; z <= 2; z++) level.setBlock(x, G + 2, z, 0);
  for (let x = 14; x <= 26; x++) for (let z = -2; z <= 2; z++) level.setBlock(x, G, z, 0);
  player.moveTo(16.5, G, 0.5, -90, 0);
  input();
  tick(3);
  // levitation
  air(200);
  jump();
  tick(5);
  player.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.levitation, 100, 0));
  tick();
  check('Levitation ends it', !player.fallFlying);
  player.removeAllEffects();
  // a gentle landing hurts little: the fall counted from a block while slower than half a block a tick
  air(G + 12, -60.5);
  jump();
  player.pitch = 5;
  for (let i = 0; i < 400 && player.fallFlying; i++) tick();
  check('a gentle glide down: no fall damage', player.health === 20 && player.onGround, `${player.health} at ${player.x.toFixed(1)}`);
}

// --- into a wall
{
  for (let y = G; y < G + 40; y++) for (let z = -8; z <= 8; z++) level.setBlock(12, y, z, m.S('stone'));
  player.inventory.armor[2] = stack('elytra');
  air(G + 20, 0.5);
  jump();
  player.yaw = -90;
  player.pitch = 0;
  player.dx = 1.5;
  player.dy = 0;
  sounds.length = 0;
  let hit = false;
  for (let i = 0; i < 20 && !hit; i++) {
    tick();
    if (player.health < 20) hit = true;
  }
  check('flying into a wall fast: hurt by the speed lost (1.5 a tick: 12)', hit && near(20 - player.health, 12, 1.01), `${20 - player.health}`);
  check('with the big fall sound', heard('entity.player.big_fall') === 1);
  check('the death message: experienced kinetic energy', readFileSync('src/game/playerDeath.ts', 'utf8').includes("case 'flyIntoWall':\n      return `${n} experienced kinetic energy`"));
}

// --- a dispenser puts it on
{
  const { level: l2, world: w2 } = flatLevel(m, -1, -1, 1, 1, G);
  const p2 = new m.Player(l2);
  p2.moveTo(1.5, G, 0.5, 0, 0);
  l2.player = p2;
  l2.addEntity(p2);
  place(m, l2, 'dispenser', 0, G, 0, { props: { facing: 'east' } });
  w2.getBlockEntity(0, G, 0).container.set(0, stack('elytra'));
  place(m, l2, 'redstone_block', -1, G, 0);
  ticks(l2, 6);
  check('a dispenser puts it on the player in front', p2.inventory.armor[2]?.item.id === 'elytra' && !w2.getBlockEntity(0, G, 0).container.get(0));
}

// --- an anvil mends it with membrane
{
  const menu = new m.AnvilMenu(player, { x: 0, y: G, z: 0 });
  menu.inputSlots.set(0, Object.assign(stack('elytra'), { damage: 400 }));
  menu.inputSlots.set(1, stack('phantom_membrane', 2));
  const out = menu.resultSlots.items[0];
  check('an anvil: two membranes mend it by a quarter each (108 points), for 2 levels', out?.item.id === 'elytra' && out.damage === 400 - 216 && menu.cost === 2, `${out?.damage} cost ${menu.cost}`);
  menu.inputSlots.set(1, stack('leather', 2));
  check('leather doesn\'t', !menu.resultSlots.items[0]);
}

// --- Sky's the Limit, Remote Getaway
{
  const adv = new m.PlayerAdvancements();
  const A = m.ADVANCEMENTS.get('end/elytra');
  check('Sky\'s the Limit: a goal, after The City at the End of the Game', A?.title === "Sky's the Limit" && A.frame === 'goal' && A.parent === 'end/find_end_city');
  adv.trigger('inventory', { inventory: new Set(['stone']) });
  const before = adv.isDone(A);
  adv.trigger('inventory', { inventory: new Set(['stone', 'elytra']) });
  check('...earned on getting one', !before && adv.isDone(A));
  const R = m.ADVANCEMENTS.get('end/enter_end_gateway');
  adv.trigger('enter_block', { enteredBlock: 'end_gateway' });
  check('Remote Getaway: stepping into a gateway', adv.isDone(R));
  check('...which the game triggers when the player goes through one', /if \(e === this\.player\) this\.advancements\.trigger\('enter_block', \{ enteredBlock: 'end_gateway' \}\)/.test(readFileSync('src/game/game.ts', 'utf8')));
}

await exitWithStatus(close);
