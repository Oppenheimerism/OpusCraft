// Headless checks for the End's blocks, items and recipes (node tests/end/blocks.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/game/blockRules.ts', '/src/item/item.ts', '/src/inventory/recipes.ts', '/src/render/mesher.ts',
  '/src/world/world.ts', '/src/world/chunk.ts',
]);
const [, blockMod, rules, itemMod, recipes, mesher, worldMod, chunkMod] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK, EMISSION, COLLISION, OUTLINE, OPACITY, FACE_OCC } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

for (const n of ['end_stone', 'end_stone_bricks', 'end_stone_brick_slab', 'end_stone_brick_stairs', 'end_stone_brick_wall']) {
  const b = getBlock(n);
  check(`${n}: strength 3/9, pickaxe`, b.hardness === 3 && b.resistance === 9 && b.tool === 'pickaxe' && b.requiresTool, `${b.hardness}/${b.resistance}/${b.tool}`);
  check(`${n} has an item in building`, itemMod.ITEMS.get(n)?.creativeTab === 'building', itemMod.ITEMS.get(n)?.creativeTab);
}
const frame = getBlock('end_portal_frame');
check('frame unbreakable, glass, light 1', frame.hardness === -1 && frame.resistance === 3600000 && frame.sound === 'glass' && EMISSION[frame.defaultState] === 1);
const withEye = frame.state({ eye: true, facing: 'east' });
check('frame collision: base, + eye', COLLISION[frame.defaultState].length === 1 && COLLISION[withEye].length === 2 && Math.abs(COLLISION[frame.defaultState][0][4] - 13 / 16) < 1e-9);
check('frame: bottom face occludes, light passes', FACE_OCC[frame.defaultState] === 1 && OPACITY[frame.defaultState] === 0);
check('frame item is functional', itemMod.ITEMS.get('end_portal_frame')?.creativeTab === 'functional');
const world = new worldMod.World();
const c = new chunkMod.Chunk(0, 0);
world.chunks.set(c.key, c);
for (const [yaw, want] of [[0, 'north'], [90, 'east'], [180, 'south'], [270, 'west']]) {
  const st = rules.placementState(frame, { world, x: 1, y: 64, z: 1, face: 1, hitY: 1, yaw, pitch: 30, sneaking: false, clickedState: 0 });
  check(`frame placed looking yaw ${yaw} faces ${want}`, st !== null && frame.get(st, 'facing') === want && frame.get(st, 'eye') === false, st !== null ? frame.get(st, 'facing') : 'null');
}
const portal = getBlock('end_portal');
check('portal: no collision, light 15, no item, unbreakable', COLLISION[portal.defaultState] === null && EMISSION[portal.defaultState] === 15 && !itemMod.ITEMS.has('end_portal') && portal.hardness === -1);
check('portal outline is the 6..12 slice', JSON.stringify(OUTLINE[portal.defaultState]) === JSON.stringify([[0, 0.375, 0, 1, 0.75, 1]]));

check('Eye of Ender', itemMod.ITEMS.get('ender_eye')?.name === 'Eye of Ender' && itemMod.ITEMS.get('ender_eye')?.creativeTab === 'tools');
const cr = itemMod.ITEMS.get('end_crystal');
check('End Crystal: rare, glint, combat', cr?.name === 'End Crystal' && cr.rarity === 'rare' && cr.glint === true && cr.creativeTab === 'combat');

const I = (id) => (id ? itemMod.ItemStack.of(id) : null);
const find = (ids, w, h) => recipes.findRecipe(ids.map(I), w, h);
let r = find(['blaze_powder', 'ender_pearl', null, null], 2, 2);
check('eye of ender from pearl + powder', r?.result === 'ender_eye' && r.count === 1);
r = find(['glass', 'glass', 'glass', 'glass', 'ender_eye', 'glass', 'glass', 'ghast_tear', 'glass'], 3, 3);
check('end crystal recipe', r?.result === 'end_crystal' && r.count === 1);
r = find(['end_stone', 'end_stone', 'end_stone', 'end_stone'], 2, 2);
check('4 end stone bricks', r?.result === 'end_stone_bricks' && r.count === 4);
r = find(['end_stone_bricks', 'end_stone_bricks', 'end_stone_bricks', null, null, null, null, null, null], 3, 3);
check('6 slabs', r?.result === 'end_stone_brick_slab' && r.count === 6);
r = find(['end_stone_bricks', null, null, 'end_stone_bricks', 'end_stone_bricks', null, 'end_stone_bricks', 'end_stone_bricks', 'end_stone_bricks'], 3, 3);
check('4 stairs', r?.result === 'end_stone_brick_stairs' && r.count === 4);
r = find(['end_stone_bricks', 'end_stone_bricks', 'end_stone_bricks', 'end_stone_bricks', 'end_stone_bricks', 'end_stone_bricks', null, null, null], 3, 3);
check('6 walls', r?.result === 'end_stone_brick_wall' && r.count === 6);

// every state's model bakes
const rect = { u0: 0, v0: 0, u1: 1, v1: 1 };
let err = null;
try { mesher.initMesher(new Proxy({}, { get: () => rect })); } catch (e) { err = e; }
check('models bake', !err, err?.message);
const fm = mesher.getStateModels(withEye);
check('filled frame bakes two boxes of quads', fm && fm.variants[0].quads.length === 11, fm && String(fm.variants[0].quads?.length));

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
