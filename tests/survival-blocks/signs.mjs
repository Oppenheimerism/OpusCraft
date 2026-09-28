// Headless checks for signs and hanging signs (node tests/survival-blocks/signs.mjs): the 44 blocks and their items,
// recipes, placing (standing, on a wall, hanging, hanging from a wall, chained), what keeps them up, the editor opening
// and what it may write (vanilla handleSignUpdate's checks), dyes, glow ink, ink and wax, which side is clicked, saving
// and loading, the text as it's drawn, and the editor's lines.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 180000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/game/interaction.ts', '/src/game/signs.ts', '/src/world/blockEntity.ts',
  '/src/world/signBlockEntity.ts', '/src/world/blocksSigns.ts', '/src/inventory/recipes.ts', '/src/game/blockRules.ts',
  '/src/render/signRenderer.ts', '/src/gui/screens/signEdit.ts', '/src/audio/synth.ts', '/src/textures/signs.ts',
  '/src/textures/items.ts', '/src/textures/blocks.ts', '/src/inventory/recipeBook.ts', '/src/world/mapColors.ts', '/src/game/shapeUpdates.ts',
  '/src/game/advancements.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, interMod, signs, beMod, sbe, bs, rec, rules, rend, edit, synth, tex, itemTex, blockTex, book, mapColors, , adv] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK, OUTLINE, COLLISION, FLAGS, F_WATERLOGGED } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra && !cond ? ' ' + extra : ''}`); };

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped'];

// ---------------------------------------------------------------------------
// the blocks
{
  const all = WOODS.flatMap((w) => [`${w}_sign`, `${w}_wall_sign`, `${w}_hanging_sign`, `${w}_wall_hanging_sign`]);
  check('44 sign blocks, one of each kind for every wood', all.every((n) => blockMod.BLOCK_BY_NAME.has(n)));
  const oak = getBlock('oak_sign'), wall = getBlock('oak_wall_sign'), hang = getBlock('oak_hanging_sign'), wh = getBlock('oak_wall_hanging_sign');
  check('standing: 16 rotations, waterloggable', oak.props.map((p) => p.name).join() === 'rotation,waterlogged' && oak.stateCount === 32);
  check('wall: facing, waterloggable', wall.props.map((p) => p.name).join() === 'facing,waterlogged' && wall.stateCount === 8);
  check('hanging: attached, 16 rotations, waterloggable', hang.props.map((p) => p.name).join() === 'attached,rotation,waterlogged' && hang.stateCount === 64);
  check('wall hanging: facing, waterloggable', wh.props.map((p) => p.name).join() === 'facing,waterlogged' && wh.stateCount === 8);
  check('strength 1, blast resistance 1, an axe', all.every((n) => getBlock(n).hardness === 1 && getBlock(n).resistance === 1 && getBlock(n).tool === 'axe'));
  check('no collision but the wall hanging sign\'s bracket', COLLISION[oak.defaultState] === null && COLLISION[wall.defaultState] === null && COLLISION[hang.defaultState] === null && COLLISION[wh.defaultState]?.length === 1);
  const box = (st) => JSON.stringify(OUTLINE[st].map((b) => b.map((v) => Math.round(v * 16 * 2) / 2)));
  check('shapes: the stick\'s column', box(oak.defaultState) === '[[4,0,4,12,16,12]]');
  check('shapes: a wall sign on the wall behind it', box(wall.state({ facing: 'north' })) === '[[0,4.5,14,16,12.5,16]]' && box(wall.state({ facing: 'east' })) === '[[0,4.5,0,2,12.5,16]]');
  check('shapes: a hanging sign square to the world, or turned between', box(hang.state({ rotation: 0 })) === '[[1,0,7,15,10,9]]' && box(hang.state({ rotation: 4 })) === '[[7,0,1,9,10,15]]' && box(hang.state({ rotation: 3 })) === '[[3,0,3,13,16,13]]');
  check('shapes: a wall hanging sign\'s bracket and board', box(wh.state({ facing: 'north' })) === '[[0,14,6,16,16,10],[1,0,7,15,10,9]]' && box(wh.state({ facing: 'west' })) === '[[6,14,0,10,16,16],[7,0,1,9,10,15]]');
  check('waterlogged states hold water', (FLAGS[oak.state({ waterlogged: true })] & F_WATERLOGGED) !== 0 && (FLAGS[wh.state({ waterlogged: true })] & F_WATERLOGGED) !== 0);
  check('sounds: signs their wood\'s', getBlock('oak_sign').sound === 'wood' && getBlock('cherry_wall_sign').sound === 'cherry_wood' && getBlock('bamboo_sign').sound === 'bamboo_wood' && getBlock('crimson_sign').sound === 'nether_wood');
  check('sounds: hanging signs their own', hang.sound === 'hanging_sign' && getBlock('cherry_hanging_sign').sound === 'cherry_wood_hanging_sign' && getBlock('bamboo_wall_hanging_sign').sound === 'bamboo_wood_hanging_sign' && getBlock('warped_hanging_sign').sound === 'nether_wood_hanging_sign');
  const S2 = synth.SOUNDS;
  check('the hanging signs\' sounds exist, all five of each', ['hanging_sign', 'nether_wood_hanging_sign', 'bamboo_wood_hanging_sign', 'cherry_wood_hanging_sign'].every((k) => ['break', 'step', 'place', 'hit', 'fall'].every((e) => S2[`block.${k}.${e}`])));
  check('the waxed knock, the ink sacs\' and the dyes\'', ['block.sign.waxed_interact_fail', 'item.ink_sac.use', 'item.glow_ink_sac.use', 'item.dye.use', 'item.honeycomb.wax_on'].every((k) => S2[k]));
  const take = S2['block.hanging_sign.break'].generate(0, 22050);
  check('a hanging sign\'s break is a sound', take.length > 1000 && take.some((v) => Math.abs(v) > 0.1));
  check('lava lights the overworld woods\', not the nether ones\'', getBlock('oak_sign').s.flammable === true && getBlock('crimson_sign').s.flammable === false);
  check('map colours: their planks\'', mapColors.unmappedBlocks().filter((n) => /sign/.test(n)).length === 0);
  check('particles: planks, and a hanging sign\'s stripped log', JSON.stringify(oak.s.model(oak.view(oak.defaultState))).includes('oak_planks') && JSON.stringify(hang.s.model(hang.view(hang.defaultState))).includes('stripped_oak_log'));
  check('bamboo\'s planks and stripped block drawn for its specks', typeof blockTex.BLOCK_TEXTURES['bamboo_planks'] === 'function' && blockTex.BLOCK_TEXTURES['stripped_bamboo_block']().w === 16);
}

// ---------------------------------------------------------------------------
// the items and recipes
{
  const it = (id) => itemMod.ITEMS.get(id);
  check('22 items: every wood\'s sign and hanging sign, no wall ones', WOODS.every((w) => it(`${w}_sign`) && it(`${w}_hanging_sign`)) && !it('oak_wall_sign') && !it('oak_wall_hanging_sign'));
  check('sixteen to a stack', WOODS.every((w) => it(`${w}_sign`).maxStack === 16 && it(`${w}_hanging_sign`).maxStack === 16));
  check('each places its block', it('birch_sign').block?.name === 'birch_sign' && it('birch_hanging_sign').block?.name === 'birch_hanging_sign');
  check('drawn as their sprites, which exist', WOODS.every((w) => it(`${w}_sign`).texture === `${w}_sign` && itemTex.ITEM_TEXTURES[`${w}_sign`] && itemTex.ITEM_TEXTURES[`${w}_hanging_sign`]?.().w === 16));
  check('functional blocks tab', it('oak_sign').creativeTab === 'functional' && it('warped_hanging_sign').creativeTab === 'functional');
  check('fuel: a sign 200, a hanging sign 800, the nether woods\' none', rec.fuelTime(ItemStack.of('spruce_sign')) === 200 && rec.fuelTime(ItemStack.of('spruce_hanging_sign')) === 800 && rec.fuelTime(ItemStack.of('crimson_sign')) === 0 && rec.fuelTime(ItemStack.of('warped_hanging_sign')) === 0);
  check('a wall sign picks as its sign', itemMod.itemForBlock('jungle_wall_sign')?.id === 'jungle_sign' && itemMod.itemForBlock('jungle_wall_hanging_sign')?.id === 'jungle_hanging_sign');
  const signR = (w) => rec.RECIPES.filter((r) => r.result === `${w}_sign`);
  const hangR = (w) => rec.RECIPES.filter((r) => r.result === `${w}_hanging_sign`);
  const okSign = (w) => signR(w).length === 1 && signR(w)[0].count === 3 && signR(w)[0].pattern.join('|') === '###|###| X ' && signR(w)[0].key['#'] === `${w}_planks` && signR(w)[0].key.X === 'stick';
  const log = (w) => (w === 'crimson' || w === 'warped' ? `stripped_${w}_stem` : `stripped_${w}_log`);
  const okHang = (w) => hangR(w).length === 1 && hangR(w)[0].count === 6 && hangR(w)[0].pattern.join('|') === 'X X|###|###' && hangR(w)[0].key['#'] === log(w) && hangR(w)[0].key.X === 'chain';
  const have = WOODS.filter((w) => w !== 'bamboo');
  check('6 planks and a stick make 3 signs (every wood with planks)', have.every(okSign), have.filter((w) => !okSign(w)).join());
  check('2 chains and 6 stripped logs make 6 hanging signs', have.every(okHang), have.filter((w) => !okHang(w)).join());
  check('bamboo\'s wait for its planks and stripped block', signR('bamboo').length === 0 && hangR('bamboo').length === 0);
  const g = book.BOOK_RECIPES.find((r) => r.result === 'oak_hanging_sign'), g2 = book.BOOK_RECIPES.find((r) => r.result === 'crimson_sign');
  check('the recipe book groups them: wooden_sign and hanging_sign', g?.group === 'hanging_sign' && g2?.group === 'wooden_sign', `${g?.group} ${g2?.group}`);
}

// ---------------------------------------------------------------------------
// a level to try them in
const world = new worldMod.World();
for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push([n, x, y, z, v, p]), playUI() {} };
const particles = [];
level.particles = { blockBreak() {}, spawn: (k) => particles.push(k) };
const player = new playerMod.Player(level);
player.setGameMode?.('survival');
player.gameMode = 'survival';
level.player = player;
level.addEntity?.(player);
player.moveTo(0.5, 64, -2.5, 0, 0);
const inv = player.inventory;
const name = (x, y, z) => BLOCKS[STATE_BLOCK[level.getState(x, y, z)]].name;
const prop = (x, y, z, p) => { const st = level.getState(x, y, z); return BLOCKS[STATE_BLOCK[st]].get(st, p); };
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'));
const inter = new interMod.Interaction(level, player);
const opened = [];
signs.setSignEditorHook((p, be, front) => opened.push({ p, x: be.x, y: be.y, z: be.z, front }));
const place = (id, hit, yaw, pitch, sneak = false) => {
  const s = ItemStack.of(id, 4);
  inv.main[0] = s;
  inv.selected = 0;
  player.yaw = yaw;
  player.pitch = pitch;
  player.crouching = sneak;
  const ok = inter['placeBlock']({ ...hit, state: level.getState(hit.x, hit.y, hit.z), dist: 3 }, s);
  player.crouching = false;
  return ok;
};
const use = (x, y, z, face, stack) => {
  inv.main[0] = stack;
  inv.selected = 0;
  return inter['useOnBlock']({ x, y, z, face, hx: x + 0.5, hy: y + 0.5, hz: z + 0.5, state: level.getState(x, y, z), dist: 3 }, stack, true, false);
};

// ---------------------------------------------------------------------------
// placing
{
  opened.length = 0;
  let ok = place('oak_sign', { x: 0, y: 63, z: 0, face: 1, hx: 0.5, hy: 64, hz: 0.5 }, 0, 60);
  check('on the floor: a standing sign turned to face the player (yaw 0: rotation 8)', ok && name(0, 64, 0) === 'oak_sign' && prop(0, 64, 0, 'rotation') === 8, name(0, 64, 0));
  const be = world.getBlockEntity(0, 64, 0);
  check('its block entity: a sign, blank, black, not glowing, not waxed', be instanceof sbe.SignBlockEntity && !(be instanceof sbe.HangingSignBlockEntity) && be.frontText.messages.join('') === '' && be.frontText.color === 'black' && !be.frontText.glowing && !be.waxed);
  check('placed: its editor opens for the front, for the placer', opened.length === 1 && opened[0].p === player && opened[0].front === true && opened[0].x === 0 && opened[0].y === 64);
  check('...and only the placer may edit it now', be.playerWhoMayEdit === player.uuid);
  check('a sign\'s lines: 90 wide, 10 apart; a hanging sign\'s 60 and 9', be.maxTextLineWidth === 90 && be.textLineHeight === 10 && new sbe.HangingSignBlockEntity(0, 0, 0).maxTextLineWidth === 60 && new sbe.HangingSignBlockEntity(0, 0, 0).textLineHeight === 9);
  check('rotation segments (vanilla RotationSegment): yaw 180 → 0, 90 → 12, 11 → 8, 12 → 9', signs.signRotation(180) === 0 && signs.signRotation(90) === 12 && signs.signRotation(11) === 8 && signs.signRotation(12) === 9);
  level.setBlock(3, 64, 3, S('stone'));
  ok = place('spruce_sign', { x: 3, y: 64, z: 3, face: 2, hx: 3.5, hy: 64.5, hz: 3 }, 0, 0);
  check('the north face of a block: a wall sign facing north', ok && name(3, 64, 2) === 'spruce_wall_sign' && prop(3, 64, 2, 'facing') === 'north', name(3, 64, 2));
  check('...its item was the sign', itemMod.itemForBlock('spruce_wall_sign').id === 'spruce_sign');
  // nothing to stand on or hang against: can't go
  ok = place('birch_sign', { x: 6, y: 70, z: 6, face: 1, hx: 6.5, hy: 71, hz: 6.5 }, 0, 60);
  check('in the air: no sign', !ok && name(6, 71, 6) === 'air');
  // a sign on a sign (vanilla forceSolidOn)
  ok = place('oak_sign', { x: 0, y: 64, z: 0, face: 1, hx: 0.5, hy: 65, hz: 0.5 }, 90, 60);
  check('a sign stands on a sign (signs are forced solid)', ok && name(0, 65, 0) === 'oak_sign' && prop(0, 65, 0, 'rotation') === 12);
  // under a stone ceiling: a hanging sign on straight chains, square to the world, facing the player
  level.setBlock(-3, 67, 0, S('stone'));
  ok = place('oak_hanging_sign', { x: -3, y: 67, z: 0, face: 0, hx: -2.5, hy: 67, hz: 0.5 }, 30, -60);
  check('under a full block: a hanging sign on straight chains (not attached)', ok && name(-3, 66, 0) === 'oak_hanging_sign' && prop(-3, 66, 0, 'attached') === false, name(-3, 66, 0));
  check('...square to the world, facing the player (yaw 30 → facing south: rotation 8)', prop(-3, 66, 0, 'rotation') === 8, String(prop(-3, 66, 0, 'rotation')));
  check('...its block entity a hanging sign\'s', world.getBlockEntity(-3, 66, 0) instanceof sbe.HangingSignBlockEntity);
  // sneaking: a vee of chains, turned to any of sixteen
  level.setBlock(-5, 67, 0, S('stone'));
  ok = place('oak_hanging_sign', { x: -5, y: 67, z: 0, face: 0, hx: -4.5, hy: 67, hz: 0.5 }, 30, -60, true);
  check('sneaking: attached (a vee of chains), turned to face the player (yaw 30: rotation 9)', ok && prop(-5, 66, 0, 'attached') === true && prop(-5, 66, 0, 'rotation') === 9, `${prop(-5, 66, 0, 'attached')} ${prop(-5, 66, 0, 'rotation')}`);
  // under a fence: attached
  level.setBlock(-7, 67, 0, S('oak_fence'));
  ok = place('oak_hanging_sign', { x: -7, y: 67, z: 0, face: 0, hx: -6.5, hy: 67, hz: 0.5 }, 0, -60);
  check('under a fence post: attached', ok && name(-7, 66, 0) === 'oak_hanging_sign' && prop(-7, 66, 0, 'attached') === true, name(-7, 66, 0));
  // a bottom slab's underside is whole; a top slab's is air (vanilla isFaceSturdy DOWN, CENTER)
  level.setBlock(-7, 70, 3, S('oak_slab', { type: 'bottom' }));
  ok = place('oak_hanging_sign', { x: -7, y: 70, z: 3, face: 0, hx: -6.5, hy: 70, hz: 3.5 }, 0, -60);
  check('under a bottom slab: a hanging sign on straight chains', ok && name(-7, 69, 3) === 'oak_hanging_sign' && prop(-7, 69, 3, 'attached') === false, name(-7, 69, 3));
  level.setBlock(-7, 70, 6, S('oak_slab', { type: 'top' }));
  ok = place('oak_hanging_sign', { x: -7, y: 70, z: 6, face: 0, hx: -6.5, hy: 70.5, hz: 6.5 }, 0, -60);
  check('under a top slab (nothing at its underside): no hanging sign', !ok && name(-7, 69, 6) === 'air', name(-7, 69, 6));
  // chaining: a hanging sign held to a hanging sign's underside goes under it, straight on when turned the same way
  opened.length = 0;
  const held = ItemStack.of('oak_hanging_sign', 4);
  inv.main[0] = held;
  inv.selected = 0;
  player.yaw = 30;
  player.pitch = -60;
  const chained = inter['useOnBlock']({ x: -3, y: 66, z: 0, face: 0, hx: -2.5, hy: 66, hz: 0.5, state: level.getState(-3, 66, 0), dist: 3 }, held, true, false);
  check('clicking a hanging sign\'s underside with a hanging sign: not its editor', !chained && opened.length === 0);
  ok = inter['placeBlock']({ x: -3, y: 66, z: 0, face: 0, hx: -2.5, hy: 66, hz: 0.5, state: level.getState(-3, 66, 0), dist: 3 }, held);
  check('...the new one hangs under it, straight on (the same way)', ok && name(-3, 65, 0) === 'oak_hanging_sign' && prop(-3, 65, 0, 'attached') === false && prop(-3, 65, 0, 'rotation') === 8, `${name(-3, 65, 0)} ${prop(-3, 65, 0, 'attached')}`);
  // from the side of a block: a wall hanging sign, square across the face clicked
  level.setBlock(4, 66, -4, S('stone'));
  ok = place('acacia_hanging_sign', { x: 4, y: 66, z: -4, face: 2, hx: 4.5, hy: 66.5, hz: -4 }, 0, 0);
  check('the north face of a block: a wall hanging sign, its board across the face (facing east or west)', ok && name(4, 66, -5) === 'acacia_wall_hanging_sign' && ['east', 'west'].includes(prop(4, 66, -5, 'facing')), `${name(4, 66, -5)} ${prop(4, 66, -5, 'facing')}`);
  check('...its bracket stops things (collision), the board doesn\'t', COLLISION[level.getState(4, 66, -5)].length === 1);
  // placed into water: waterlogged
  level.setBlock(6, 64, -6, S('water'));
  ok = place('oak_sign', { x: 6, y: 63, z: -6, face: 1, hx: 6.5, hy: 64, hz: -5.5 }, 0, 60);
  check('placed in water: waterlogged', ok && name(6, 64, -6) === 'oak_sign' && prop(6, 64, -6, 'waterlogged') === true, name(6, 64, -6));
  check('a wall hanging sign with nothing along its bracket: can\'t go there', !place('oak_hanging_sign', { x: 6, y: 70, z: 6, face: 2, hx: 6.5, hy: 70.5, hz: 6 }, 0, 0) || name(6, 70, 5) !== 'oak_wall_hanging_sign');
}

// ---------------------------------------------------------------------------
// what keeps them up
{
  level.setBlock(-6, 64, -6, S('stone'));
  level.setBlock(-6, 65, -6, S('oak_sign'));
  level.setBlock(-6, 64, -7, getBlock('oak_wall_sign').state({ facing: 'north' }));
  level.setBlock(-6, 63, -6, S('air'));
  level.setBlock(-6, 64, -6, S('air'));
  level.updateNeighbors(-6, 64, -6);
  check('the block under a standing sign goes: it breaks', name(-6, 65, -6) === 'air');
  check('the block behind a wall sign goes: it breaks', name(-6, 64, -7) === 'air');
  level.setBlock(-6, 68, 5, S('stone'));
  level.setBlock(-6, 67, 5, getBlock('oak_hanging_sign').state({ rotation: 0 }));
  level.setBlock(-6, 68, 5, S('air'));
  level.updateNeighbors(-6, 68, 5);
  check('the block above a hanging sign goes: it breaks', name(-6, 67, 5) === 'air');
  level.setBlock(-5, 68, 5, S('stone'));
  level.setBlock(-6, 68, 5, getBlock('oak_wall_hanging_sign').state({ facing: 'north' }));
  level.setBlock(-5, 68, 5, S('air'));
  level.updateNeighbors(-5, 68, 5);
  check('the block a wall hanging sign hangs from goes: it stays (vanilla)', name(-6, 68, 5) === 'oak_wall_hanging_sign');
  const drops = rules.blockDrops(getBlock('dark_oak_wall_sign').state({ facing: 'south' }), null, level.random);
  check('a wall sign drops its sign', drops.length === 1 && drops[0].item.id === 'dark_oak_sign' && drops[0].count === 1);
  const d2 = rules.blockDrops(getBlock('mangrove_wall_hanging_sign').defaultState, null, level.random);
  check('a wall hanging sign drops its hanging sign', d2.length === 1 && d2[0].item.id === 'mangrove_hanging_sign');
}

// ---------------------------------------------------------------------------
// writing on it (vanilla handleSignUpdate)
{
  const be = world.getBlockEntity(0, 64, 0);
  const lines = ['Hello', '§cRed?', 'tab\there', 'x'.repeat(384)];
  check('the placer writes: taken', signs.updateSignText(level, player, 0, 64, 0, true, lines));
  check('...formatting codes and control characters taken out', be.frontText.messages[0] === 'Hello' && be.frontText.messages[1] === 'Red?' && be.frontText.messages[2] === 'tabhere' && be.frontText.messages[3].length === 384, JSON.stringify(be.frontText.messages));
  check('...and nobody may edit it now till it\'s opened again', be.playerWhoMayEdit === null);
  check('again without opening it: refused', !signs.updateSignText(level, player, 0, 64, 0, true, ['changed', '', '', '']) && be.frontText.messages[0] === 'Hello');
  be.playerWhoMayEdit = player.uuid;
  check('a line longer than 384: refused', !signs.updateSignText(level, player, 0, 64, 0, true, ['y'.repeat(385), '', '', '']));
  check('three lines: refused', !signs.updateSignText(level, player, 0, 64, 0, true, ['a', 'b', 'c']));
  const other = new playerMod.Player(level);
  other.moveTo(1.5, 64, 1.5, 0, 0);
  level.addEntity?.(other);
  check('somebody else: refused', !signs.updateSignText(level, other, 0, 64, 0, true, ['mine', '', '', '']));
  player.moveTo(0.5, 64, 12.5, 0, 0);
  check('too far away (reach and 4 more): refused', !signs.updateSignText(level, player, 0, 64, 0, true, ['far', '', '', '']));
  player.moveTo(0.5, 64, 6.5, 0, 0);
  check('within reach and 4: taken, the back side', signs.updateSignText(level, player, 0, 64, 0, false, ['Back', '', '', '']) && be.backText.messages[0] === 'Back' && be.frontText.messages[0] === 'Hello');
  player.moveTo(0.5, 64, -2.5, 0, 0);
  check('no sign there: refused', !signs.updateSignText(level, player, 5, 64, 5, true, ['a', '', '', '']));
  // which side: the rotation-8 sign (put up by a player looking south) shows its front north, to them
  const st = level.getState(0, 64, 0);
  check('which side: a sign put up facing south shows its front to the north, where its placer stood', signs.isFacingFrontText(be, st, { x: 0.5, z: -3 }) && !signs.isFacingFrontText(be, st, { x: 0.5, z: 3 }));
  const ws = world.getBlockEntity(3, 64, 2);
  check('a wall sign facing north: its front is north of it', signs.isFacingFrontText(ws, level.getState(3, 64, 2), { x: 3.5, z: 0 }) && !signs.isFacingFrontText(ws, level.getState(3, 64, 2), { x: 3.5, z: 2.95 }));
  // clicking it: the editor for the side the player's on
  opened.length = 0;
  be.playerWhoMayEdit = null;
  player.moveTo(0.5, 64, -2.5, 0, 0);
  check('clicked from the front: its editor, for the front', use(0, 64, 0, 2, null) && opened.length === 1 && opened[0].front === true);
  player.moveTo(0.5, 64, 3.5, 0, 0);
  be.playerWhoMayEdit = null;
  check('clicked from behind: for the back', use(0, 64, 0, 3, null) && opened.length === 2 && opened[1].front === false);
  check('clicked holding a block: still its editor (sneak to place against it)', use(0, 64, 0, 3, ItemStack.of('dirt', 3)) && opened.length === 3);
  be.playerWhoMayEdit = other.uuid;
  check('while somebody else edits it: no editor', !use(0, 64, 0, 3, null) && opened.length === 3);
  be.playerWhoMayEdit = null;
  player.gameMode = 'adventure';
  check('in adventure mode: no editor', !use(0, 64, 0, 3, null) && opened.length === 3);
  player.gameMode = 'survival';
  // the editor's owner walks off: forgotten (vanilla SignBlockEntity.tick)
  be.playerWhoMayEdit = player.uuid;
  player.moveTo(0.5, 64, 20.5, 0, 0);
  be.tick(level);
  check('the editing player walks away: forgotten', be.playerWhoMayEdit === null);
  player.moveTo(0.5, 64, -2.5, 0, 0);
}

// ---------------------------------------------------------------------------
// dyes, glow ink, ink and wax
{
  const be = world.getBlockEntity(0, 64, 0);
  player.moveTo(0.5, 64, -2.5, 0, 0); // in front
  sounds = [];
  let dye = ItemStack.of('red_dye', 2);
  check('a dye on the written side: red text', use(0, 64, 0, 2, dye) && be.frontText.color === 'red' && be.backText.color === 'black');
  check('...the dye used up, its sound', dye.count === 1 && sounds.some((s) => s[0] === 'item.dye.use'));
  const again = ItemStack.of('red_dye', 1);
  opened.length = 0;
  use(0, 64, 0, 2, again);
  check('the same dye again: not used (nothing changes), the editor opens instead', again.count === 1 && be.frontText.color === 'red' && opened.length === 1);
  be.playerWhoMayEdit = null;
  const blankSide = world.getBlockEntity(0, 65, 0);
  const blue = ItemStack.of('blue_dye', 1);
  use(0, 65, 0, 2, blue);
  check('a dye on a blank sign: not used', blue.count === 1 && blankSide.frontText.color === 'black' && blankSide.backText.color === 'black');
  blankSide.playerWhoMayEdit = null;
  sounds = [];
  const triggers = [];
  level.onPlayerTrigger = (p, t, payload) => triggers.push({ p, t, payload });
  const glow = ItemStack.of('glow_ink_sac', 1);
  check('a glow ink sac: the text glows', use(0, 64, 0, 2, glow) && be.frontText.glowing && sounds.some((s) => s[0] === 'item.glow_ink_sac.use'));
  const pa = new adv.PlayerAdvancements();
  for (const t of triggers) if (t.p === player) pa.trigger(t.t, t.payload);
  check('...Glow and Behold! (vanilla item_used_on_block: a glow ink sac on any sign)', pa.isDone(adv.ADVANCEMENTS.get('husbandry/make_a_sign_glow')), JSON.stringify(triggers.map((t) => [t.t, t.payload])));
  const pa2 = new adv.PlayerAdvancements();
  pa2.trigger('item_used_on_block', { usedOnBlock: { item: 'ink_sac', block: 'oak_sign' } });
  pa2.trigger('item_used_on_block', { usedOnBlock: { item: 'glow_ink_sac', block: 'stone' } });
  check('...not for an ink sac, nor on anything but a sign', !pa2.isDone(adv.ADVANCEMENTS.get('husbandry/make_a_sign_glow')));
  pa2.trigger('item_used_on_block', { usedOnBlock: { item: 'glow_ink_sac', block: 'warped_wall_hanging_sign' } });
  check('...on a wall hanging sign too', pa2.isDone(adv.ADVANCEMENTS.get('husbandry/make_a_sign_glow')));
  level.onPlayerTrigger = null;
  sounds = [];
  check('an ink sac: it stops', use(0, 64, 0, 2, ItemStack.of('ink_sac', 1)) && !be.frontText.glowing && sounds.some((s) => s[0] === 'item.ink_sac.use'));
  player.gameMode = 'creative';
  dye = ItemStack.of('lime_dye', 1);
  check('in creative a dye isn\'t used up', use(0, 64, 0, 2, dye) && be.frontText.color === 'lime' && dye.count === 1);
  player.gameMode = 'survival';
  particles.length = 0;
  sounds = [];
  const comb = ItemStack.of('honeycomb', 1);
  check('honeycomb waxes it: specks and the wax sound', use(0, 64, 0, 2, comb) && be.waxed && particles.includes('wax_on') && sounds.some((s) => s[0] === 'item.honeycomb.wax_on'));
  check('honeycomb waxes a blank sign too', use(0, 65, 0, 2, ItemStack.of('honeycomb', 1)) && blankSide.waxed);
  sounds = [];
  opened.length = 0;
  const blue2 = ItemStack.of('blue_dye', 1);
  check('waxed: no more dye (it knocks instead)', use(0, 64, 0, 2, blue2) && blue2.count === 1 && be.frontText.color === 'lime' && opened.length === 0 && sounds.some((s) => s[0] === 'block.sign.waxed_interact_fail'));
  opened.length = 0;
  sounds = [];
  check('waxed: clicked, it only knocks', use(0, 64, 0, 2, null) && opened.length === 0 && sounds.some((s) => s[0] === 'block.sign.waxed_interact_fail'));
  be.playerWhoMayEdit = player.uuid;
  check('waxed: nothing written', !signs.updateSignText(level, player, 0, 64, 0, true, ['wax', '', '', '']) && be.frontText.messages[0] === 'Hello');
}

// ---------------------------------------------------------------------------
// saving and loading
{
  const be = world.getBlockEntity(0, 64, 0);
  const saved = JSON.parse(JSON.stringify(be.save()));
  check('saved as vanilla has it: front_text, back_text, is_waxed', saved.id === 'sign' && typeof saved.data.front_text === 'string' && saved.data.is_waxed === 1 && JSON.parse(saved.data.front_text).color === 'lime');
  const back = beMod.loadBlockEntity(saved);
  check('loaded: the same text, colour, glow and wax', back instanceof sbe.SignBlockEntity && back.frontText.messages.join('|') === be.frontText.messages.join('|') && back.frontText.color === 'lime' && back.backText.messages[0] === 'Back' && back.waxed);
  const h = world.getBlockEntity(-3, 66, 0);
  const hs = JSON.parse(JSON.stringify(h.save()));
  check('a hanging sign saves as one', hs.id === 'hanging_sign' && beMod.loadBlockEntity(hs) instanceof sbe.HangingSignBlockEntity);
  // a crafted save: whatever's wrong is put right
  const bad = { id: 'sign', x: 0, y: 70, z: 0, items: [], data: { front_text: JSON.stringify({ messages: ['§4bad\u0001', 7, 'z'.repeat(500)], color: 'plaid', has_glowing_text: 'yes' }), back_text: 'not json', is_waxed: 3 } };
  const fixed = beMod.loadBlockEntity(bad);
  check('a bad save: lines cleaned, cut to 384, four of them, an unknown colour black, not glowing, not waxed', fixed.frontText.messages[0] === 'bad' && fixed.frontText.messages[1] === '' && fixed.frontText.messages[2].length === 384 && fixed.frontText.messages.length === 4 && fixed.frontText.color === 'black' && !fixed.frontText.glowing && !fixed.waxed && fixed.backText.messages.join('') === '');
  check('the old kind of sign id loads as a sign (by block name too)', beMod.createBlockEntity('oak_sign', 0, 0, 0) instanceof sbe.SignBlockEntity && beMod.createBlockEntity('crimson_wall_hanging_sign', 0, 0, 0) instanceof sbe.HangingSignBlockEntity);
  // through a chunk's saved block entities (as a world save keeps them)
  const list = world.chunkBlockEntities(0, 0).map((b) => JSON.parse(JSON.stringify(b.save())));
  const w2 = new worldMod.World();
  const c2 = new chunkMod.Chunk(0, 0);
  w2.chunks.set(c2.key, c2);
  let n = 0;
  for (const d of list) {
    const b = beMod.loadBlockEntity(d);
    if (b instanceof sbe.SignBlockEntity) n++;
  }
  check('a chunk\'s signs come back from its save', n >= 3 && list.some((d) => d.id === 'sign' && d.data.front_text.includes('Hello')));
}

// ---------------------------------------------------------------------------
// the text as it's drawn
{
  check('dark colour: the dye\'s at 0.4 (red → 0x660000), black stays black', rend.signDarkColor(new sbe.SignText(['a'], 'red')) === 0x660000 && rend.signDarkColor(new sbe.SignText(['a'], 'black')) === 0);
  check('glowing black text\'s outline: pale cream', rend.signDarkColor(new sbe.SignText(['a'], 'black', true)) === 0xf0ebcc);
  check('a line too wide is cut at the board\'s width (after the last space that fits)', rend.firstLine('aaaa bbbb cccc dddd eeee ffff gggg', 60) === 'aaaa bbbb' && rend.firstLine('aaaa bbbb cccc dddd', 90) === 'aaaa bbbb cccc' && rend.firstLine('short', 90) === 'short');
  check('a word wider than the line is broken', rend.firstLine('w'.repeat(40), 60).length === 10);
  check('the dye text colours (vanilla DyeColor.getTextColor)', sbe.SIGN_TEXT_COLORS.orange === 0xff681f && sbe.SIGN_TEXT_COLORS.light_blue === 0x9ac0cd && sbe.SIGN_TEXT_COLORS.brown === 0x8b4513);
  const t = tex.signTexture('oak'), ht = tex.hangingSignTexture('crimson'), gt = tex.hangingSignGuiTexture('bamboo');
  check('textures: 64×32 sheets, a 16×16 editor picture', t.w === 64 && t.h === 32 && ht.w === 64 && ht.h === 32 && gt.w === 16 && gt.h === 16);
  const a = (img, x, y) => img.data[(y * img.w + x) * 4 + 3];
  check('the sign sheet has the board\'s front and the stick', a(t, 10, 8) === 255 && a(t, 3, 20) === 255 && a(t, 60, 30) === 0);
  check('the hanging sheet has the bracket, chains and board', a(ht, 10, 5) === 255 && a(ht, 10, 18) === 255 && [1, 2].some((x) => a(ht, x, 8) === 255));
}

// ---------------------------------------------------------------------------
// the editor's lines (vanilla AbstractSignEditScreen with TextFieldHelper)
{
  const be = world.getBlockEntity(3, 64, 2);
  be.playerWhoMayEdit = player.uuid;
  const game = { level, player, client: null, setScreen() {}, gui: { font: null } };
  const scr = new edit.SignEditScreen(game, be, true);
  check('its title', scr.title === 'Edit Sign Message');
  for (const ch of 'Hi there') scr.charTyped(ch);
  check('typing goes on the first line', scr.messages[0] === 'Hi there');
  check('...and shows on the sign meanwhile, in this game only', signs.signTextShown(be, true).messages[0] === 'Hi there' && be.frontText.messages[0] === '');
  scr.keyPressed({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
  for (const ch of 'W'.repeat(40)) scr.charTyped(ch);
  check('Enter: the next line; a line holds no more than 90 pixels', scr.line === 1 && scr.messages[1] === 'W'.repeat(15), scr.messages[1]);
  scr.keyPressed({ key: 'ArrowUp', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
  scr.keyPressed({ key: 'ArrowUp', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
  check('up from the first line: the last', scr.line === 3);
  scr.charTyped('§');
  scr.charTyped('\u0007');
  check('a section sign or a control character can\'t be typed', scr.messages[3] === '');
  scr.line = 0;
  scr.field.setCursorToEnd();
  scr.keyPressed({ key: 'Backspace', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
  check('backspace', scr.messages[0] === 'Hi ther');
  scr.keyPressed({ key: 'a', shiftKey: false, ctrlKey: true, metaKey: false, altKey: false });
  check('select all', scr.field.cursorPos === 7 && scr.field.selectionPos === 0);
  scr.charTyped('Z');
  check('typing replaces the selection', scr.messages[0] === 'Z');
  scr.removed();
  check('closed: what was typed is written, the preview gone', be.frontText.messages[0] === 'Z' && be.frontText.messages[1] === 'W'.repeat(15) && signs.signTextShown(be, true) === be.frontText);
  const hb = world.getBlockEntity(-3, 66, 0);
  hb.playerWhoMayEdit = player.uuid;
  player.moveTo(-2.5, 64, 2.5, 0, 0);
  const hs = new edit.SignEditScreen(game, hb, false);
  for (const ch of 'W'.repeat(40)) hs.charTyped(ch);
  check('a hanging sign\'s editor: its title, lines of 60 pixels', hs.title === 'Edit Hanging Sign Message' && hs.messages[0] === 'W'.repeat(10));
  hs.removed();
  check('...written on the back', hb.backText.messages[0] === 'W'.repeat(10) && hb.frontText.messages[0] === '');
}

await close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
