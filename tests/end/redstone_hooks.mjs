// Shulker boxes with main's real dispensers and pistons: node tests/end/redstone_hooks.mjs
import { load, check, flatLevel, place, prop, ticks, blockName, exitWithStatus } from '../../tests/temples/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();

const { m, close } = await load([
  '/src/game/redstone/dispenser.ts', '/src/game/redstone/dispenseItems.ts', '/src/game/redstone/piston.ts', '/src/game/shulkerBox.ts',
  '/src/world/shulkerBoxEntity.ts', '/src/entity/animals.ts', '/src/entity/itemEntity.ts', '/src/core/aabb.ts',
]);
const G = 64;
const name = (level, x, y, z) => blockName(m, level.getState(x, y, z));
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const live = (level, cls) => level.entities.filter((e) => !e.removed && (!cls || e instanceof cls));
const drops = (level, id) => live(level, m.ItemEntity).filter((e) => !id || e.stack.item.id === id);
const heard = (sounds, n) => sounds.filter((s) => s.name === n).length;
function pulse(level, [px, py, pz], n = 6) {
  place(m, level, 'redstone_block', px, py, pz);
  ticks(level, n);
  level.setBlock(px, py, pz, 0);
  ticks(level, 1);
}

{
  const { level, world, sounds } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'dispenser', 0, G, 0, { props: { facing: 'east' } });
  const be = world.getBlockEntity(0, G, 0);
  const box = stack('cyan_shulker_box', 2);
  box.tag = { container: [{ slot: 1, id: 'arrow', count: 16 }], customName: 'Kit' };
  be.container.set(0, box);
  pulse(level, [-1, G, 0]);
  check('a dispenser sets a shulker box down in front (the floor under it: facing up)', name(level, 1, G, 0) === 'cyan_shulker_box' && prop(m, level, 1, G, 0, 'facing') === 'up', name(level, 1, G, 0));
  const placed = world.getBlockEntity(1, G, 0);
  check('with what it held, and its name', placed?.container.items[1]?.count === 16 && placed?.customName === 'Kit', JSON.stringify(placed?.save?.()));
  check('one spent from the slot', be.container.get(0)?.count === 1);
  check('the click and the place sound, no fail click', heard(sounds, 'block.dispenser.dispense') === 1 && heard(sounds, 'block.stone.place') === 1 && heard(sounds, 'block.dispenser.fail') === 0);
  sounds.length = 0;
  pulse(level, [-1, G, 0]);
  check('the spot taken: the fail click, the box kept', heard(sounds, 'block.dispenser.fail') === 1 && be.container.get(0)?.count === 1 && !drops(level).length);

  // over a drop it faces the way the dispenser does
  place(m, level, 'dispenser', 0, G + 3, 4, { props: { facing: 'east' } });
  world.getBlockEntity(0, G + 3, 4).container.set(0, stack('shulker_box'));
  pulse(level, [-1, G + 3, 4]);
  check('over a drop: facing east, as the dispenser', name(level, 1, G + 3, 4) === 'shulker_box' && prop(m, level, 1, G + 3, 4, 'facing') === 'east');
  check('the last one spent: the slot empty', !world.getBlockEntity(0, G + 3, 4).container.get(0));

  // something standing there
  place(m, level, 'dispenser', 0, G, 8, { props: { facing: 'east' } });
  world.getBlockEntity(0, G, 8).container.set(0, stack('red_shulker_box'));
  const pig = new m.Pig(level);
  pig.moveTo(1.5, G, 8.5, 0, 0);
  level.addEntity(pig);
  sounds.length = 0;
  pulse(level, [-1, G, 8]);
  check('a pig in the way: not placed, the fail click', name(level, 1, G, 8) === 'air' && heard(sounds, 'block.dispenser.fail') === 1 && world.getBlockEntity(0, G, 8).container.get(0)?.count === 1);
  // (the pig moves off; the next pulse works)
  pig.remove();
  pulse(level, [-1, G, 8]);
  check('the pig gone: placed', name(level, 1, G, 8) === 'red_shulker_box');

  // a dropper throws it out instead
  place(m, level, 'dropper', 0, G, 12, { props: { facing: 'east' } });
  world.getBlockEntity(0, G, 12).container.set(0, stack('blue_shulker_box'));
  pulse(level, [-1, G, 12]);
  check('a dropper throws it out as an item', name(level, 1, G, 12) === 'air' && drops(level, 'blue_shulker_box').length === 1);
}

{
  const { level, world, sounds } = flatLevel(m, -1, -1, 1, 1);
  check('the push reaction: shulker boxes break', m.pushReaction(m.S('shulker_box')) === 'destroy' && m.pushReaction(m.getBlock('lime_shulker_box').state({ facing: 'north' })) === 'destroy');
  check('so do the chorus plant and flower', m.pushReaction(m.S('chorus_plant')) === 'destroy' && m.pushReaction(m.S('chorus_flower')) === 'destroy');
  check('purpur and end rods move', m.pushReaction(m.S('purpur_block')) === 'normal' && m.pushReaction(m.S('end_rod')) === 'normal');
  place(m, level, 'piston', 0, G, 0, { props: { facing: 'east' } });
  level.setBlock(1, G, 0, m.getBlock('lime_shulker_box').state({ facing: 'up' }));
  world.getBlockEntity(1, G, 0).container.set(3, stack('diamond', 5));
  place(m, level, 'redstone_block', -1, G, 0);
  ticks(level, 3);
  const d = drops(level, 'lime_shulker_box');
  check('a piston breaks a shulker box and the head comes out', prop(m, level, 0, G, 0, 'extended') === true && name(level, 1, G, 0) === 'piston_head', name(level, 1, G, 0));
  check('it drops, with what it held', d.length === 1 && d[0].stack.tag?.container?.some((c) => c.id === 'diamond' && c.count === 5), JSON.stringify(d.map((e) => e.stack.tag)));
  check('once', drops(level).length === 1, drops(level).map((e) => e.stack.item.id).join());
  // a line of stone ending in a box: the stone moves, the box breaks
  place(m, level, 'piston', 0, G, 4, { props: { facing: 'east' } });
  level.setBlock(1, G, 4, m.S('stone'));
  level.setBlock(2, G, 4, m.S('shulker_box'));
  place(m, level, 'redstone_block', -1, G, 4);
  ticks(level, 3);
  check('at the end of a line: the line moves, the box breaks', name(level, 2, G, 4) === 'stone' && drops(level, 'shulker_box').length === 1);
}

await exitWithStatus(close);
