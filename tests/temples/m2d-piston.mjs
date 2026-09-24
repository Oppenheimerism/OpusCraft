// M2d: pistons and sticky pistons on a flat stone world with a ticking Level — the blocks, placement, power (and
// quasi-connectivity), the block events, pushing (12 blocks, what won't move, what breaks), pulling, short pulses,
// the moving blocks' timing, collision and saving, entities pushed along, the head, sounds and recipes.

import { load, check, flatLevel, place, prop, ticks, blockName, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/redstone/piston.ts', '/src/inventory/recipes.ts', '/src/entity/player.ts', '/src/entity/areaEffectCloud.ts',
  '/src/entity/fallingBlock.ts', '/src/audio/synth.ts', '/src/textures/index.ts', '/src/world/blockEntity.ts', '/src/core/aabb.ts',
  '/src/entity/entity.ts', '/src/storage/worldStore.ts',
]);
const G = 64; // the floor: stone below, air from y 64
const [DOWN, UP, NORTH, SOUTH, WEST, EAST] = [0, 1, 2, 3, 4, 5];
const DIR = ['down', 'up', 'north', 'south', 'west', 'east'];

const name = (level, x, y, z) => blockName(m, level.getState(x, y, z));
const count = (sounds, n) => sounds.filter((s) => s.name === n).length;
const live = (level, cls) => level.entities.filter((e) => !e.removed && (!cls || e instanceof cls));
const drops = (level, id) => live(level, m.ItemEntity).filter((e) => !id || e.stack.item.id === id);
const be = (level, x, y, z) => level.world.getBlockEntity(x, y, z);

/** a piston (or sticky piston) at (x, y, z) facing `facing`, placed as a player would place it (props given) */
function piston(level, x, y, z, facing, kind = 'piston') {
  return place(m, level, kind, x, y, z, { props: { facing: DIR[facing] } });
}
const power = (level, x, y, z) => place(m, level, 'redstone_block', x, y, z);
const unpower = (level, x, y, z) => level.setBlock(x, y, z, 0);
const put = (level, x, y, z, n) => level.setBlock(x, y, z, typeof n === 'number' ? n : m.S(n));
const row = (level, x, y, z, n) => [...Array(n)].map((_, i) => name(level, x + i, y, z)).join(' ');

// ---------------------------------------------------------------------------------------------------------------
// The blocks

{
  const p = m.getBlock('piston'), s = m.getBlock('sticky_piston'), h = m.getBlock('piston_head'), mv = m.getBlock('moving_piston');
  check('blocks: piston, sticky piston, head and moving piston exist', !!p && !!s && !!h && !!mv);
  check('blocks: pistons and heads are 1.5 hard, a moving piston unbreakable', p.hardness === 1.5 && s.hardness === 1.5 && h.hardness === 1.5 && mv.hardness < 0);
  const drop = (st, tool) => m.blockDrops(st, tool ? m.ITEMS.get(tool) : null, new m.Rand(1)).map((q) => `${q.item.id}x${q.count}`).join();
  check('drops: a piston drops itself, even by hand', drop(p.defaultState) === 'pistonx1' && drop(s.defaultState) === 'sticky_pistonx1' && drop(p.state({ extended: true })) === 'pistonx1');
  check('drops: the head and a moving piston drop nothing of their own', drop(h.defaultState) === '' && drop(mv.defaultState) === '');
  check('items: pistons are items, the head and moving piston aren\'t', !!m.ITEMS.get('piston') && !!m.ITEMS.get('sticky_piston') && !m.ITEMS.get('piston_head') && !m.ITEMS.get('moving_piston'));
  check('power: a piston isn\'t a conductor (vanilla isRedstoneConductor never)', !m.isConductor(p.defaultState) && !m.isConductor(s.defaultState));
  const col = (st) => JSON.stringify(m.COLLISION[st]);
  check('shape: retracted, a full block', col(p.state({ facing: 'east' })) === JSON.stringify([[0, 0, 0, 1, 1, 1]]));
  check('shape: extended east, the base is 12 deep', col(p.state({ facing: 'east', extended: true })) === JSON.stringify([[0, 0, 0, 0.75, 1, 1]]));
  const hb = m.COLLISION[h.state({ facing: 'east' })];
  check('shape: the head, a platform and an arm reaching 4 into the base', hb.length === 2 && hb[0][0] === 0.75 && hb[1][0] === -0.25 && hb[1][3] === 0.75, JSON.stringify(hb));
  const hs = m.COLLISION[h.state({ facing: 'east', short: true })];
  check('shape: a short head\'s arm stops at its own block', hs[1][0] === 0 && hs[1][3] === 0.75, JSON.stringify(hs));
  check('shape: a moving piston has none of its own', m.COLLISION[mv.defaultState] === null);
  check('render: a moving piston isn\'t meshed', m.LAYER[mv.defaultState] === m.Layer.NONE);
  check('light: retracted it blocks light; extended it doesn\'t', m.OPACITY[p.state({ extended: false })] === 15 && m.OPACITY[p.state({ extended: true })] === 0);
  const { textures } = m.generateBlockTextures();
  check('textures: the five piston textures', ['piston_top', 'piston_top_sticky', 'piston_side', 'piston_bottom', 'piston_inner'].every((t) => textures.has(t)));
  check('sounds: extend and contract', !!m.SOUNDS['block.piston.extend'] && !!m.SOUNDS['block.piston.contract']);
  const snd = m.SOUNDS['block.piston.extend'].generate(0, 22050);
  check('sounds: they generate', snd.length > 2000 && snd.some((v) => Math.abs(v) > 0.5));
}

// ---------------------------------------------------------------------------------------------------------------
// Placement and power

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'piston', 0, G, 0, { yaw: 0, pitch: 0 }); // looking south
  check('placement: it faces the player (looking south, it faces north)', prop(m, level, 0, G, 0, 'facing') === 'north' && prop(m, level, 0, G, 0, 'extended') === false);
  place(m, level, 'sticky_piston', 2, G, 0, { yaw: 0, pitch: 80 });
  check('placement: looking down at it, it faces up', prop(m, level, 2, G, 0, 'facing') === 'up');
  place(m, level, 'piston', 4, G + 3, 0, { yaw: 90, pitch: -80 });
  check('placement: looking up at it, it faces down', prop(m, level, 4, G + 3, 0, 'facing') === 'down');
  place(m, level, 'piston', 6, G, 0, { yaw: 90, pitch: 0 }); // looking west
  check('placement: looking west, it faces east', prop(m, level, 6, G, 0, 'facing') === 'east');
}

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  const sides = [[-1, 0, 0, 'behind'], [0, 0, 1, 'beside'], [0, -1, 0, 'under'], [0, 1, 0, 'on top']];
  sides.forEach(([dx, dy, dz, where], i) => {
    const z = i * 4;
    piston(level, 0, G + 1, z, EAST);
    power(level, dx, G + 1 + dy, z + dz);
    ticks(level, 1);
    check(`power: a redstone block ${where} it pushes it out`, prop(m, level, 0, G + 1, z, 'extended') === true);
  });
  // into its front: power there doesn't count
  piston(level, 0, G + 1, 20, EAST);
  power(level, 1, G + 1, 20);
  ticks(level, 3);
  check('power: a redstone block in front of it doesn\'t', prop(m, level, 0, G + 1, 20, 'extended') === false);
  const ext = sounds.filter((s) => s.name === 'block.piston.extend');
  check('sound: extend, at the piston, volume 0.5, pitch 0.6-0.85', ext.length === 4 && ext.every((s) => s.volume === 0.5 && s.pitch >= 0.6 && s.pitch < 0.85 && s.x === 0.5), JSON.stringify(ext[0]));
}

{
  // quasi-connectivity: power beside the block above counts, but the piston only notices when something updates it
  const { level } = flatLevel(m, -1, -1, 1, 1);
  piston(level, 0, G, 0, EAST);
  power(level, 0, G + 2, 0);
  ticks(level, 3);
  check('quasi-connectivity: power two above doesn\'t reach it by itself', prop(m, level, 0, G, 0, 'extended') === false);
  check('quasi-connectivity: yet it counts as powered', m.pistonPowered(level.world, 0, G, 0, EAST) === true);
  put(level, 0, G, 1, 'dirt'); // an update
  ticks(level, 1);
  check('quasi-connectivity: a block placed beside it sets it off', prop(m, level, 0, G, 0, 'extended') === true);
  piston(level, 0, G, 4, EAST);
  power(level, -1, G + 1, 4); // diagonally above-behind
  ticks(level, 3);
  const before = prop(m, level, 0, G, 4, 'extended');
  put(level, 0, G, 5, 'dirt');
  ticks(level, 1);
  check('quasi-connectivity: diagonally above, the same', before === false && prop(m, level, 0, G, 4, 'extended') === true);
  // unpowering the same way: it stays out till something updates it
  unpower(level, 0, G + 2, 0);
  ticks(level, 3);
  const still = prop(m, level, 0, G, 0, 'extended');
  put(level, 0, G, 1, 0);
  ticks(level, 4);
  check('quasi-connectivity: power gone from above, it stays out till an update', still === true && prop(m, level, 0, G, 0, 'extended') === false);
}

// ---------------------------------------------------------------------------------------------------------------
// Extending: the event, the moving blocks, their timing

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  piston(level, 0, G, 0, EAST);
  put(level, 1, G, 0, 'oak_log');
  put(level, 2, G, 0, m.getBlock('oak_stairs').state({ facing: 'west', half: 'top' }));
  const stairs = level.getState(2, G, 0);
  power(level, -1, G, 0);
  check('event: nothing moves before the tick\'s block events', prop(m, level, 0, G, 0, 'extended') === false && name(level, 1, G, 0) === 'oak_log');
  ticks(level, 1);
  check('event: the tick after, the piston is out and the head and blocks are on the move', prop(m, level, 0, G, 0, 'extended') === true && row(level, 1, G, 0, 3) === 'moving_piston moving_piston moving_piston', row(level, 0, G, 0, 4));
  const head = be(level, 1, G, 0), log = be(level, 2, G, 0);
  check('moving: the head\'s block entity carries the head, extending, as the piston\'s own', head instanceof m.PistonMovingBlockEntity && blockName(m, head.moved) === 'piston_head' && head.extending && head.source && head.direction === EAST);
  check('moving: the log\'s carries the log, not as the source', log instanceof m.PistonMovingBlockEntity && blockName(m, log.moved) === 'oak_log' && log.extending && !log.source);
  check('moving: half a block along after the tick it started', head.progress === 0.5 && head.progressO === 0 && log.progress === 0.5);
  check('moving: its moving_piston faces the push', prop(m, level, 3, G, 0, 'facing') === 'east' && prop(m, level, 1, G, 0, 'type') === 'normal');
  ticks(level, 1);
  check('moving: all the way the tick after', head.progress === 1 && head.progressO === 0.5 && name(level, 3, G, 0) === 'moving_piston');
  ticks(level, 1);
  check('moving: the tick after that they\'re put down', row(level, 0, G, 0, 4) === 'piston piston_head oak_log oak_stairs', row(level, 0, G, 0, 4));
  check('moving: the block entities are gone', !be(level, 1, G, 0) && !be(level, 2, G, 0) && head.removed);
  check('moving: blocks keep their state (stairs still upside down facing west)', level.getState(3, G, 0) === stairs);
  check('head: facing east, not short, a normal one', prop(m, level, 1, G, 0, 'facing') === 'east' && prop(m, level, 1, G, 0, 'short') === false && prop(m, level, 1, G, 0, 'type') === 'normal');
  check('sound: one extend', count(sounds, 'block.piston.extend') === 1 && count(sounds, 'block.piston.contract') === 0);
  // a sticky piston's head is sticky
  piston(level, 0, G, 4, EAST, 'sticky_piston');
  power(level, -1, G, 4);
  ticks(level, 3);
  check('head: a sticky piston\'s is sticky', prop(m, level, 1, G, 4, 'type') === 'sticky');
  check('event: no events left over', level.handlingTick === false);
}

// ---------------------------------------------------------------------------------------------------------------
// What moves, what doesn't, what breaks

{
  const { level } = flatLevel(m, -2, -2, 2, 2);
  const tryPush = (z, blocks, facing = EAST) => {
    piston(level, 0, G, z, facing);
    blocks.forEach((b, i) => b && put(level, 1 + i, G, z, b));
    power(level, -1, G, z);
    ticks(level, 3);
    return prop(m, level, 0, G, z, 'extended');
  };
  check('push: 12 blocks', tryPush(0, Array(12).fill('stone')) === true && name(level, 13, G, 0) === 'stone' && name(level, 1, G, 0) === 'piston_head');
  check('push: not 13', tryPush(2, Array(13).fill('stone')) === false && name(level, 1, G, 2) === 'stone' && name(level, 14, G, 2) === 'air');
  check('push: 12 and a gap and more beyond is fine', tryPush(4, [...Array(12).fill('dirt'), null, 'stone', 'stone']) === true && name(level, 13, G, 4) === 'dirt' && name(level, 14, G, 4) === 'stone');
  const immovable = ['obsidian', 'crying_obsidian', 'bedrock', 'chest', 'furnace', 'anvil', 'grindstone', 'enchanting_table', 'barrel', 'spawner', 'end_portal_frame', 'white_banner'];
  immovable.forEach((b, i) => check(`push: ${b} won't move`, tryPush(6 + i * 2, [b]) === false && name(level, 1, G, 6 + i * 2) === b));
  check('push: a line ending at obsidian won\'t move', tryPush(-2, ['stone', 'stone', 'obsidian']) === false);
  // blocks without a block entity that vanilla pushes: glass, a crafting table, a composter, a cauldron, rails, fences
  const movable = ['glass', 'crafting_table', 'composter', 'cauldron', 'oak_fence', 'iron_bars', 'oak_trapdoor', 'white_carpet', 'hay_block', 'tnt', 'redstone_lamp', 'white_wool', 'ice', 'magma_block'];
  movable.forEach((b, i) => {
    const z = -4 - i * 2;
    const moved = tryPush(z, ['stone', b]);
    check(`push: ${b} moves`, moved === true && name(level, 3, G, z) === b, row(level, 0, G, z, 4));
  });
}

{
  // pistons: a retracted one moves, an extended one doesn't; a sticky one pulls a retracted one back
  const { level } = flatLevel(m, -1, -1, 1, 1);
  piston(level, 0, G, 0, EAST);
  piston(level, 1, G, 0, SOUTH);
  power(level, -1, G, 0);
  ticks(level, 3);
  check('push: a retracted piston moves', name(level, 2, G, 0) === 'piston' && prop(m, level, 2, G, 0, 'facing') === 'south');
  piston(level, 0, G, 4, EAST);
  piston(level, 1, G, 4, NORTH);
  power(level, 1, G, 5); // (beside the second: it pushes out north)
  ticks(level, 3);
  power(level, -1, G, 4);
  ticks(level, 3);
  check('push: an extended one doesn\'t', prop(m, level, 1, G, 4, 'extended') === true && prop(m, level, 0, G, 4, 'extended') === false);
  // the head of another piston won't move either
  piston(level, 0, G, 8, EAST);
  piston(level, 1, G, 7, SOUTH);
  power(level, 1, G, 6);
  ticks(level, 3);
  power(level, -1, G, 8);
  ticks(level, 3);
  check('push: nor another piston\'s head', name(level, 1, G, 8) === 'piston_head' && prop(m, level, 0, G, 8, 'extended') === false);
  // at the build limit
  const { maxY, minY } = level.world.dim;
  piston(level, 6, maxY - 1, 0, UP);
  power(level, 7, maxY - 1, 0);
  ticks(level, 3);
  check('limits: facing up at the top of the world, it can\'t come out', prop(m, level, 6, maxY - 1, 0, 'extended') === false);
  piston(level, 8, maxY - 2, 0, UP);
  put(level, 8, maxY - 1, 0, 'stone');
  power(level, 9, maxY - 2, 0);
  ticks(level, 3);
  check('limits: nor push a block off the top', prop(m, level, 8, maxY - 2, 0, 'extended') === false && name(level, 8, maxY - 1, 0) === 'stone');
  put(level, 10, minY, 0, 'stone');
  piston(level, 10, minY + 1, 0, DOWN);
  power(level, 11, minY + 1, 0);
  ticks(level, 3);
  check('limits: nor push a block out of the bottom', prop(m, level, 10, minY + 1, 0, 'extended') === false);
  put(level, 12, minY, 0, 'air');
  piston(level, 12, minY + 1, 0, DOWN);
  power(level, 13, minY + 1, 0);
  ticks(level, 3);
  check('limits: into air at the bottom row, fine', prop(m, level, 12, minY + 1, 0, 'extended') === true && name(level, 12, minY, 0) === 'piston_head');
}

{
  // breaking what's in the way
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  const breakIt = (z, blocks, below = null) => {
    piston(level, 0, G, z, EAST);
    blocks.forEach((b, i) => {
      if (!b) return;
      if (below) put(level, 1 + i, G - 1, z, below);
      put(level, 1 + i, G, z, b);
    });
    power(level, -1, G, z);
    ticks(level, 3);
    return prop(m, level, 0, G, z, 'extended');
  };
  check('break: a torch in front breaks and the head comes out', breakIt(0, ['torch']) === true && name(level, 1, G, 0) === 'piston_head' && drops(level, 'torch').length === 1);
  check('break: a poppy at the end of a line breaks, the line moves', breakIt(2, ['stone', 'stone', 'poppy'], 'grass_block') === true && name(level, 3, G, 2) === 'stone' && drops(level, 'poppy').length === 1);
  check('break: no break sound (just the particles)', !sounds.some((s) => s.name.endsWith('.break')));
  const before = level.entities.length;
  check('break: water in front goes, dropping nothing', breakIt(4, ['water']) === true && name(level, 1, G, 4) === 'piston_head' && level.entities.length === before);
  check('break: a lantern drops itself (no tool needed, unlike a player)', breakIt(6, ['lantern']) === true && drops(level, 'lantern').length === 1);
  check('break: a cobweb drops string', breakIt(8, ['cobweb']) === true && drops(level, 'string').length === 1);
  check('break: a snow layer drops a snowball', breakIt(10, ['snow']) === true && drops(level, 'snowball').length === 1);
  check('break: redstone dust, a repeater, a lever, a button, a pressure plate', breakIt(12, ['redstone_wire']) && breakIt(14, ['repeater']) && breakIt(16, ['stone_button']) && breakIt(18, ['stone_pressure_plate']) && drops(level, 'redstone').length === 1 && drops(level, 'repeater').length === 1);
  check('break: a pumpkin and a melon', breakIt(20, ['pumpkin']) && breakIt(22, ['melon']) && drops(level, 'pumpkin').length === 1 && drops(level, 'melon_slice').length === 1);
  put(level, 1, G, 25, m.getBlock('red_bed').state({ facing: 'south', part: 'head' }));
  put(level, 1, G, 24, m.getBlock('red_bed').state({ facing: 'south', part: 'foot' }));
  check('break: a bed breaks, both halves, dropping one bed', breakIt(24, []) === true && name(level, 1, G, 25) === 'air' && drops(level, 'red_bed').length === 1);
  check('break: fire goes out', breakIt(26, ['fire']) === true);
  check('break: leaves', breakIt(28, ['oak_leaves']) === true && name(level, 1, G, 28) === 'piston_head');
  level.gameRules.doTileDrops = false;
  const n = drops(level).length;
  breakIt(-2, ['torch']);
  check('break: with doTileDrops off, nothing dropped', drops(level).length === n);
  level.gameRules.doTileDrops = true;
  check('reaction: the table (vanilla PushReaction)', m.pushReaction(m.S('stone')) === 'normal' && m.pushReaction(m.S('torch')) === 'destroy' && m.pushReaction(m.S('anvil')) === 'block' && m.pushReaction(m.S('piston_head')) === 'block' && m.pushReaction(m.S('iron_door')) === 'destroy' && m.pushReaction(m.S('moss_carpet')) === 'destroy' && m.pushReaction(m.S('white_carpet')) === 'normal');
}

// ---------------------------------------------------------------------------------------------------------------
// Retracting and pulling

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  piston(level, 0, G, 0, EAST);
  power(level, -1, G, 0);
  ticks(level, 3);
  unpower(level, -1, G, 0);
  check('retract: the pull waits for the block events', prop(m, level, 0, G, 0, 'extended') === true);
  ticks(level, 1);
  const base = be(level, 0, G, 0);
  check('retract: the head goes at once, the base is on the move', name(level, 1, G, 0) === 'air' && name(level, 0, G, 0) === 'moving_piston');
  check('retract: carrying the piston back in, as the source', base instanceof m.PistonMovingBlockEntity && blockName(m, base.moved) === 'piston' && !base.extending && base.source && base.direction === EAST);
  check('retract: its moved state is the plain piston facing east', prop(m, level, 0, G, 0, 'facing') === 'east' && m.blockOf(base.moved).get(base.moved, 'extended') === false && m.blockOf(base.moved).get(base.moved, 'facing') === 'east');
  ticks(level, 2);
  check('retract: two ticks later, a retracted piston', name(level, 0, G, 0) === 'piston' && prop(m, level, 0, G, 0, 'extended') === false && !be(level, 0, G, 0));
  const con = sounds.filter((s) => s.name === 'block.piston.contract');
  check('sound: contract, volume 0.5, pitch 0.6-0.75', con.length === 1 && con[0].volume === 0.5 && con[0].pitch >= 0.6 && con[0].pitch < 0.75);
}

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const pull = (z, blocks, kind = 'sticky_piston') => {
    piston(level, 0, G, z, EAST, kind);
    blocks.forEach((b, i) => b && put(level, 1 + i, G, z, b));
    power(level, -1, G, z);
    ticks(level, 4);
    unpower(level, -1, G, z);
    ticks(level, 4);
    return row(level, 0, G, z, blocks.length + 2);
  };
  check('pull: a sticky piston pulls its block back', pull(0, ['stone']) === 'sticky_piston stone air');
  check('pull: only the one block of a line', pull(2, ['stone', 'dirt', 'cobblestone']) === 'sticky_piston stone air dirt cobblestone');
  check('pull: a plain piston leaves it', pull(4, ['stone'], 'piston') === 'piston air stone');
  // things it won't pull: only pushable NORMAL blocks come back (pistons too)
  piston(level, 0, G, 6, EAST, 'sticky_piston');
  power(level, -1, G, 6);
  ticks(level, 3);
  put(level, 2, G, 6, 'obsidian');
  unpower(level, -1, G, 6);
  ticks(level, 4);
  check('pull: not obsidian', row(level, 0, G, 6, 3) === 'sticky_piston air obsidian');
  piston(level, 0, G, 8, EAST, 'sticky_piston');
  power(level, -1, G, 8);
  ticks(level, 3);
  put(level, 2, G - 1, 8, 'grass_block');
  put(level, 2, G, 8, 'poppy');
  unpower(level, -1, G, 8);
  ticks(level, 4);
  check('pull: not a flower (it would break)', row(level, 0, G, 8, 3) === 'sticky_piston air poppy');
  piston(level, 0, G, 10, EAST, 'sticky_piston');
  power(level, -1, G, 10);
  ticks(level, 3);
  put(level, 2, G, 10, 'chest');
  unpower(level, -1, G, 10);
  ticks(level, 4);
  check('pull: not a chest', row(level, 0, G, 10, 3) === 'sticky_piston air chest');
  check('pull: a retracted piston comes back', pull(12, ['piston']) === 'sticky_piston piston air');
  piston(level, 0, G, 14, EAST, 'sticky_piston');
  power(level, -1, G, 14);
  ticks(level, 3);
  put(level, 2, G, 14, 'anvil');
  unpower(level, -1, G, 14);
  ticks(level, 4);
  check('pull: not an anvil', row(level, 0, G, 14, 3) === 'sticky_piston air anvil');
  // pulling a block down (a sticky piston facing down lifts it back up)
  piston(level, 20, G + 5, 0, DOWN, 'sticky_piston');
  put(level, 20, G + 4, 0, 'gold_block');
  power(level, 20, G + 6, 0);
  ticks(level, 4);
  const down = name(level, 20, G + 3, 0);
  unpower(level, 20, G + 6, 0);
  ticks(level, 4);
  check('pull: facing down, it pushes a block down and lifts it back', down === 'gold_block' && name(level, 20, G + 4, 0) === 'gold_block' && name(level, 20, G + 3, 0) === 'air');
}

// ---------------------------------------------------------------------------------------------------------------
// Short pulses and changes of mind

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  // a short pulse: a sticky piston spits its block out and leaves it (TRIGGER_DROP)
  piston(level, 0, G, 0, EAST, 'sticky_piston');
  put(level, 1, G, 0, 'stone');
  power(level, -1, G, 0);
  ticks(level, 1); // pushed, the stone half way
  unpower(level, -1, G, 0);
  ticks(level, 1);
  check('pulse: the stone is put down at once where it was going', name(level, 2, G, 0) === 'stone' && name(level, 1, G, 0) === 'air' && name(level, 0, G, 0) === 'moving_piston', row(level, 0, G, 0, 3));
  ticks(level, 2);
  check('pulse: the piston comes back without it', row(level, 0, G, 0, 3) === 'sticky_piston air stone');
  // a pull after the push is done brings it back
  piston(level, 0, G, 2, EAST, 'sticky_piston');
  put(level, 1, G, 2, 'stone');
  power(level, -1, G, 2);
  ticks(level, 3);
  unpower(level, -1, G, 2);
  ticks(level, 3);
  check('pulse: a longer one brings it back', row(level, 0, G, 2, 3) === 'sticky_piston stone air');
  // the power gone before its event comes up: nothing happens
  const n = count(sounds, 'block.piston.extend');
  piston(level, 0, G, 4, EAST);
  power(level, -1, G, 4);
  unpower(level, -1, G, 4);
  ticks(level, 3);
  check('mind: powered and unpowered between ticks, it stays in', prop(m, level, 0, G, 4, 'extended') === false && name(level, 1, G, 4) === 'air' && count(sounds, 'block.piston.extend') === n);
  // the power back before the pull: it stays out
  const c = count(sounds, 'block.piston.contract');
  piston(level, 0, G, 6, EAST);
  power(level, -1, G, 6);
  ticks(level, 3);
  unpower(level, -1, G, 6);
  power(level, -1, G, 6);
  ticks(level, 3);
  check('mind: unpowered and powered again, it stays out', prop(m, level, 0, G, 6, 'extended') === true && name(level, 1, G, 6) === 'piston_head' && count(sounds, 'block.piston.contract') === c);
  // events are queued once each
  piston(level, 0, G, 8, EAST);
  power(level, -1, G, 8);
  const st = level.getState(0, G, 8);
  for (let i = 0; i < 3; i++) m.behaviorOf(st).neighborChanged(level, 0, G, 8, st, 0, 0, G, 7, false);
  const k = count(sounds, 'block.piston.extend');
  ticks(level, 1);
  check('event: the same event queued three times runs once', count(sounds, 'block.piston.extend') === k + 1);
}

{
  // a repeater turning on in the scheduled ticks sets a piston off in the same tick's block events
  const { level } = flatLevel(m, -1, -1, 1, 1);
  piston(level, 2, G, 0, EAST);
  place(m, level, 'repeater', 1, G, 0, { props: { facing: 'west' } }); // (vanilla facing: pointing east, it faces west)
  power(level, 0, G, 0);
  let t = 0;
  while (!prop(m, level, 2, G, 0, 'extended') && t < 10) {
    ticks(level, 1);
    t++;
  }
  const rep = prop(m, level, 1, G, 0, 'powered');
  check('event: a delay-1 repeater (2 ticks) moves the piston on the tick it turns on', rep === true && t === 2, `t=${t}`);
}

// ---------------------------------------------------------------------------------------------------------------
// What the moves do to the world

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  // a redstone block pushed: power moves with it
  piston(level, 0, G, 0, EAST);
  put(level, 1, G, 0, 'redstone_block');
  place(m, level, 'redstone_lamp', 1, G, 1);
  place(m, level, 'redstone_lamp', 2, G, 1);
  check('power moves: the lamp beside the redstone block is lit', prop(m, level, 1, G, 1, 'lit') === true && prop(m, level, 2, G, 1, 'lit') === false);
  power(level, -1, G, 0);
  ticks(level, 8);
  check('power moves: pushed along, the next lamp lights and the first goes out', prop(m, level, 2, G, 1, 'lit') === true && prop(m, level, 1, G, 1, 'lit') === false);
  // TNT pushed next to power is primed
  piston(level, 0, G, 4, EAST);
  put(level, 1, G, 4, 'tnt');
  put(level, 2, G, 5, 'redstone_block');
  power(level, -1, G, 4);
  ticks(level, 3);
  check('tnt: pushed next to power, it\'s lit', name(level, 2, G, 4) === 'air' && live(level, m.PrimedTnt).length === 1);
  // sand pushed over a gap falls
  put(level, 3, G - 1, 8, 'air');
  piston(level, 0, G, 8, EAST);
  put(level, 1, G, 8, 'stone');
  put(level, 2, G, 8, 'sand');
  power(level, -1, G, 8);
  ticks(level, 6);
  check('sand: pushed over a hole, it falls', name(level, 3, G, 8) !== 'sand' && (live(level, m.FallingBlockEntity).length === 1 || name(level, 3, G - 1, 8) === 'sand'));
  // a carpet pushed out over air breaks
  put(level, 3, G - 1, 12, 'air');
  piston(level, 0, G, 12, EAST);
  put(level, 1, G, 12, 'stone');
  put(level, 2, G, 12, 'white_carpet');
  power(level, -1, G, 12);
  ticks(level, 4);
  check('carpet: pushed where nothing holds it up, it breaks and drops', name(level, 3, G, 12) === 'air' && drops(level, 'white_carpet').length === 1);
  // waterlogged: the water stays behind (it's lost)
  piston(level, 0, G, 16, EAST);
  put(level, 1, G, 16, m.getBlock('oak_stairs').state({ facing: 'north', waterlogged: true }));
  power(level, -1, G, 16);
  ticks(level, 3);
  check('waterlogged: a pushed block comes out dry', name(level, 2, G, 16) === 'oak_stairs' && prop(m, level, 2, G, 16, 'waterlogged') === false);
  // something hanging on a pushed block pops off
  piston(level, 0, G, 20, EAST);
  put(level, 1, G, 20, 'stone');
  put(level, 1, G, 21, m.getBlock('wall_torch').state({ facing: 'south' }));
  power(level, -1, G, 20);
  ticks(level, 3);
  check('attached: a torch on a pushed block pops off', name(level, 1, G, 21) === 'air' && drops(level, 'torch').length >= 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Entities

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const z = new m.Zombie(level);
  z.moveTo(1.5, G, 0.5, 0, 0);
  level.addEntity(z);
  piston(level, 0, G, 0, EAST);
  power(level, -1, G, 0);
  const x0 = z.x;
  ticks(level, 1);
  const x1 = z.x;
  ticks(level, 2);
  check('entities: a zombie in front is pushed along with the head', x1 - x0 > 0.2 && x1 - x0 <= 0.52 && z.x - x0 > 0.7, `${x0} ${x1} ${z.x}`);
  check('entities: it ends up clear of the head (east of 2)', z.bb.minX >= 2 - 1e-6, `${z.bb.minX}`);
  // lifted by a piston facing up
  const it = new m.ItemEntity(level, new m.ItemStack(m.ITEMS.get('stone'), 1));
  it.moveTo(4.5, G + 1, 4.5);
  level.addEntity(it);
  piston(level, 4, G, 4, UP);
  power(level, 5, G, 4);
  ticks(level, 3);
  check('entities: an item on top of an upward piston is lifted', it.y >= G + 2 - 1e-6, `${it.y}`);
  // on top of a block pushed sideways: left behind (only honey carries)
  const it2 = new m.ItemEntity(level, new m.ItemStack(m.ITEMS.get('dirt'), 1));
  it2.moveTo(9.5, G + 1, 8.5);
  it2.dx = it2.dy = it2.dz = 0;
  level.addEntity(it2);
  piston(level, 8, G, 8, EAST);
  put(level, 9, G, 8, 'stone');
  power(level, 7, G, 8);
  ticks(level, 3);
  check('entities: riding on a block pushed sideways, it isn\'t carried', Math.abs(it2.x - 9.5) < 1e-6, `${it2.x}`);
  // a flying player and an effect cloud are left alone
  const p = new m.Player(level);
  p.flying = true;
  p.moveTo(13.5, G, 12.5, 0, 0);
  level.addEntity(p);
  piston(level, 12, G, 12, EAST);
  power(level, 11, G, 12);
  ticks(level, 3);
  check('entities: a flying player isn\'t pushed (vanilla IGNORE)', Math.abs(p.x - 13.5) < 1e-6);
  const cloud = new m.AreaEffectCloud(level, 17.5, G, 16.5);
  level.addEntity(cloud);
  piston(level, 16, G, 16, EAST);
  power(level, 15, G, 16);
  ticks(level, 3);
  check('entities: nor an area effect cloud', Math.abs(cloud.x - 17.5) < 1e-6);
  const p2 = new m.Player(level);
  p2.moveTo(21.5, G, 20.5, 0, 0);
  level.addEntity(p2);
  piston(level, 20, G, 20, EAST);
  power(level, 19, G, 20);
  ticks(level, 3);
  check('entities: a player on foot is', p2.x > 22 - 1e-6, `${p2.x}`);
  // however many pistons push it, 0.51 along an axis a tick at most (vanilla limitPistonMovement)
  const z2 = new m.Zombie(level);
  z2.moveTo(0.5, G, 26.5, 0, 0);
  level.addEntity(z2);
  const zx = z2.x;
  m.pistonMove(level, z2, EAST, 0.4, EAST);
  m.pistonMove(level, z2, EAST, 0.4, EAST);
  const once = z2.x - zx;
  m.pistonMove(level, z2, UP, 0.3, UP);
  ticks(level, 1);
  m.pistonMove(level, z2, EAST, 0.4, EAST);
  check('entities: two pushes in a tick move it 0.51 along an axis, not 0.8; another axis is free; next tick, fresh', Math.abs(once - 0.51) < 1e-9 && z2.y > G + 0.29 && Math.abs(z2.x - zx - 0.91) < 1e-9, `${once} ${z2.y} ${z2.x - zx}`);
}

{
  // collision of what's moving
  const { level } = flatLevel(m, -1, -1, 1, 1);
  piston(level, 0, G, 0, EAST);
  power(level, -1, G, 0);
  ticks(level, 1);
  const col = m.DYNAMIC_COLLISION[m.getBlock('moving_piston').id];
  const boxes = col(level.world, 1, G, 0, level.getState(1, G, 0));
  check('collision: the moving head is solid where it has got to', !!boxes && boxes.length === 2 && Math.abs(boxes[0][0] - 0.25) < 1e-9, JSON.stringify(boxes));
  // an entity walking into it is stopped
  const z = new m.Zombie(level);
  z.moveTo(2.2, G, 0.5, 0, 0);
  level.addEntity(z);
  z.move(-1, 0, 0);
  check('collision: something walking into the moving head is stopped by it', z.bb.minX >= 1.5 - 1e-6 && z.bb.minX < 2.2, `${z.bb.minX}`);
  ticks(level, 2);
  put(level, -1, G, 0, 'air');
  ticks(level, 1);
  const base = col(level.world, 0, G, 0, level.getState(0, G, 0));
  check('collision: a retracting piston\'s base stays solid, and its head with it', !!base && base.length === 3 && base[0][3] === 0.75, JSON.stringify(base));
}

// ---------------------------------------------------------------------------------------------------------------
// The head

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const extended = (z, kind = 'piston') => {
    piston(level, 0, G, z, EAST, kind);
    power(level, 0, G, z + 1);
    ticks(level, 3);
    level.setBlock(0, G, z + 1, 0);
    // (keep it out: power from below instead, then the redstone block beside it goes)
    return prop(m, level, 0, G, z, 'extended');
  };
  put(level, 0, G - 1, 0, 'redstone_block');
  extended(0);
  check('head: set up (out, powered from below)', prop(m, level, 0, G, 0, 'extended') === true && name(level, 1, G, 0) === 'piston_head');
  level.destroyBlock(1, G, 0, true);
  check('head: broken, the piston goes too and drops', name(level, 0, G, 0) === 'air' && drops(level, 'piston').length === 1 && drops(level, 'piston_head').length === 0);
  put(level, 0, G - 1, 4, 'redstone_block');
  extended(4, 'sticky_piston');
  const player = new m.Player(level);
  player.gameMode = 'creative';
  const hs = level.getState(1, G, 4);
  m.behaviorOf(hs).playerWillDestroy(level, 1, G, 4, hs, player, null);
  level.destroyBlock(1, G, 4, false);
  check('head: broken in creative, the piston goes without dropping', name(level, 0, G, 4) === 'air' && drops(level, 'sticky_piston').length === 0);
  put(level, 0, G - 1, 8, 'redstone_block');
  extended(8);
  level.destroyBlock(0, G, 8, true);
  check('head: the piston broken, the head goes with it (dropping just the piston)', name(level, 1, G, 8) === 'air' && drops(level, 'piston').length === 2);
  put(level, 5, G, 12, m.getBlock('piston_head').state({ facing: 'east' }));
  put(level, 5, G, 13, 'dirt'); // (an update)
  check('head: without its piston it can\'t stay', name(level, 5, G, 12) === 'air');
  put(level, 0, G, 16, m.getBlock('piston').state({ facing: 'east', extended: true }));
  const headOf = (type, facing = 'east') => m.getBlock('piston_head').state({ facing, type });
  check('head: it needs an extended piston of its kind facing its way behind it', m.canSurvive(level.world, 1, G, 16, headOf('normal')) && !m.canSurvive(level.world, 1, G, 16, headOf('sticky')) && !m.canSurvive(level.world, 1, G, 16, headOf('normal', 'west')));
}

{
  const h = m.getBlock('piston_head');
  const clone = (type) => m.behaviorOf(h.state({ type })).cloneItem(h.state({ type }));
  check('head: pick-block gives its piston', clone('normal') === 'piston' && clone('sticky') === 'sticky_piston');
}

{
  // water doesn't flow into a moving block (vanilla forceSolidOn)
  const { level } = flatLevel(m, -1, -1, 1, 1);
  for (let x = -2; x <= 4; x++) for (let z = -2; z <= 2; z++) if (x !== 1 || z !== 0) put(level, x, G, z, 'stone');
  put(level, 1, G, 0, m.getBlock('moving_piston').state({ facing: 'east' }));
  level.world.blockEntities.delete(be(level, 1, G, 0).key); // (held where it is: no block entity to finish it)
  put(level, 1, G + 1, 0, 'water');
  ticks(level, 12);
  check('fluids: water on top of a moving block stays out of it', name(level, 1, G, 0) === 'moving_piston' && name(level, 1, G + 1, 0) === 'water');
}

// ---------------------------------------------------------------------------------------------------------------
// Saving

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  piston(level, 0, G, 0, EAST, 'sticky_piston');
  put(level, 1, G, 0, m.getBlock('oak_stairs').state({ facing: 'south', half: 'top' }));
  const stairs = level.getState(1, G, 0);
  power(level, -1, G, 0);
  ticks(level, 1);
  const d = be(level, 2, G, 0).save();
  const copy = m.loadBlockEntity(d);
  check('save: a moving block keeps what it carries, its way, how far and its role', copy instanceof m.PistonMovingBlockEntity && copy.moved === stairs && copy.direction === EAST && copy.extending === true && copy.source === false && copy.progress === copy.progressO, JSON.stringify(d));
  const hd = m.loadBlockEntity(be(level, 1, G, 0).save());
  check('save: and the head as the piston\'s own', blockName(m, hd.moved) === 'piston_head' && hd.source === true && m.blockOf(hd.moved).get(hd.moved, 'type') === 'sticky');
}

// ---------------------------------------------------------------------------------------------------------------
// Recipes

{
  const grid = (rows, key) => {
    const cells = [];
    for (const r of rows) for (const ch of r.padEnd(3)) cells.push(ch === ' ' ? null : new m.ItemStack(m.ITEMS.get(key[ch]), 1));
    return cells;
  };
  const p = m.findRecipe(grid(['TTT', '#X#', '#R#'], { T: 'oak_planks', '#': 'cobblestone', X: 'iron_ingot', R: 'redstone' }), 3, 3);
  check('recipe: planks, cobblestone, iron and redstone make a piston', p?.result === 'piston' && p.count === 1);
  const p2 = m.findRecipe(grid(['TTT', '#X#', '#R#'], { T: 'spruce_planks', '#': 'cobbled_deepslate', X: 'iron_ingot', R: 'redstone' }), 3, 3);
  check('recipe: any planks, and cobbled deepslate will do', p2?.result === 'piston');
  const s = m.findRecipe(grid(['S  ', 'P  '], { S: 'slime_ball', P: 'piston' }), 3, 3);
  check('recipe: a slimeball on a piston makes a sticky piston', s?.result === 'sticky_piston' && s.count === 1);
}

await exitWithStatus(close);
