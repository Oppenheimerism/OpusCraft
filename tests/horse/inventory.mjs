// Headless checks for a horse's inventory, leather horse armour and what dispensers put on horses
// (node tests/horse/inventory.mjs).
import { load, check, flatLevel, place, exitWithStatus } from '../../tests/temples/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/entity/horse.ts', '/src/entity/player.ts', '/src/inventory/horseMenu.ts', '/src/inventory/recipes.ts', '/src/item/dyedColor.ts',
  '/src/game/redstone/dispenser.ts', '/src/game/redstone/dispenseItems.ts', '/src/item/itemColors.ts',
]);
const G = 64;
const EAST = 5;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);

function setup() {
  const { level } = flatLevel(m, -2, -2, 2, 2);
  const p = new m.Player(level);
  p.gameMode = 'survival';
  p.moveTo(0.5, G, 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return { level, p };
}
const horseAt = (level, type, x, z) => { const h = m.createMob(type, level); h.moveTo(x + 0.5, G, z + 0.5, 0, 0); h.finalizeSpawn('egg'); level.addEntity(h); return h; };

// --- the menu's slots
{
  const { level, p } = setup();
  const h = horseAt(level, 'horse', 2, 0);
  h.tameWithName(p);
  const menu = new m.HorseInventoryMenu(p, h);
  const pos = (i) => [menu.slots[i].x, menu.slots[i].y].join(',');
  check('a horse: the saddle (8,18), the armour (8,36), then the inventory (8,84) and hotbar (8,142)', menu.slots.length === 38 && pos(0) === '8,18' && pos(1) === '8,36' && pos(2) === '8,84' && pos(29) === '8,142');
  check('the saddle slot takes only a saddle; the armour slot only horse armour', menu.slots[0].mayPlace(stack('saddle')) && !menu.slots[0].mayPlace(stack('stick')) && menu.slots[1].mayPlace(stack('iron_horse_armor')) && !menu.slots[1].mayPlace(stack('iron_chestplate')));
  const d = horseAt(level, 'donkey', 0, 2);
  d.tameWithName(p);
  check('a donkey without a chest: no chest slots, no armour slot', new m.HorseInventoryMenu(p, d).slots.length === 38 && !new m.HorseInventoryMenu(p, d).slots[1].isActive());
  d.hasChest = true;
  const dm = new m.HorseInventoryMenu(p, d);
  check('with its chest: three rows of five from (80,18)', dm.slots.length === 53 && dm.columns === 5 && [dm.slots[2].x, dm.slots[2].y].join() === '80,18' && [dm.slots[16].x, dm.slots[16].y].join() === '152,54');
  // shift-clicks
  p.inventory.main[0] = stack('saddle');
  p.inventory.main[1] = stack('diamond_horse_armor');
  p.inventory.main[2] = stack('cobblestone', 20);
  const hs = (i) => 38 - 9 + i; // the hotbar's slots in a horse's menu
  menu.quickMoveStack(p, hs(0));
  menu.quickMoveStack(p, hs(1));
  check('shift-clicked: the saddle and the armour go on', h.saddled && h.bodyArmor()?.item.id === 'diamond_horse_armor' && !p.inventory.main[0] && !p.inventory.main[1]);
  const dh = (i) => 53 - 9 + i;
  dm.quickMoveStack(p, dh(2));
  check('shift-clicked into a donkey: into its chest', d.inventory.get(2)?.item.id === 'cobblestone' && d.inventory.get(2).count === 20 && !p.inventory.main[2]);
  dm.quickMoveStack(p, 2);
  check('and back out', !d.inventory.get(2) && p.inventory.main.some((s) => s?.item.id === 'cobblestone' && s.count === 20));
  menu.quickMoveStack(p, 0);
  check('the saddle comes off by shift-click', !h.saddled && p.inventory.main.some((s) => s?.item.id === 'saddle'));
  check('in reach it stays open; walked off, it closes', menu.stillValid(p) && (p.moveTo(20.5, G, 0.5, 0, 0), !menu.stillValid(p)));
}

// --- who opens it
{
  const { level, p } = setup();
  let opened = null;
  m.horseHooks.openInventory = (h) => (opened = h);
  const wild = horseAt(level, 'horse', 2, 0);
  wild.interact(p, null);
  p.isShiftKeyDown = () => false;
  wild.openInventory(p);
  check('riding a wild horse, the inventory key opens nothing', p.vehicle === wild && opened === null);
  p.stopRiding();
  const tame = horseAt(level, 'horse', -2, 0);
  tame.tameWithName(p);
  p.isShiftKeyDown = () => true;
  tame.interact(p, null);
  check('sneak-clicking a tame one opens it', opened === tame);
  m.horseHooks.openInventory = null;
}

// --- leather horse armour
{
  const r = m.findRecipe([stack('leather'), null, stack('leather'), stack('leather'), stack('leather'), stack('leather'), stack('leather'), null, stack('leather')], 3, 3);
  check('seven leather make leather horse armour', r?.result === 'leather_horse_armor', String(r?.result));
  const a = stack('leather_horse_armor');
  check('it\'s dyeable, brown until dyed', m.isDyeable(a.item) && m.dyedColor(a) === 0xa06540 && m.layerTint(a) === 0xa06540);
  const red = m.applyDyes(a, ['red']);
  check('dyed red', red && red.tag.dyedColor !== undefined && m.dyedColor(red) !== 0xa06540);
  const { level, p } = setup();
  const h = horseAt(level, 'horse', 2, 0);
  h.tameWithName(p);
  h.setArmor(red);
  check('a horse wears it: 3 armour points', h.armorValue() === 3);
}

// --- dispensers: a saddle, armour, a chest
{
  const { level, p } = setup();
  place(m, level, 'dispenser', 0, G, 0, { props: { facing: 'east' } });
  const src = { level, x: 0, y: G, z: 0, facing: EAST, be: level.world.getBlockEntity(0, G, 0), success: true };
  const dispense = (s) => m.dispenseBehaviorFor(s)(src, s);
  const h = horseAt(level, 'horse', 1, 0);
  const s = stack('diamond_horse_armor');
  dispense(s);
  check('armour isn\'t put on a wild horse (thrown out)', !h.bodyArmor());
  h.tameWithName(p);
  dispense(stack('saddle'));
  dispense(stack('diamond_horse_armor'));
  check('a tame one in front: saddled and armoured', h.saddled && h.bodyArmor()?.item.id === 'diamond_horse_armor');
  h.remove();
  const d = horseAt(level, 'donkey', 1, 0);
  d.tameWithName(p);
  dispense(stack('chest'));
  check('a chest onto a tame donkey', d.hasChest);
}

exitWithStatus(close);
