// M1: the deep dark's blocks and items — sculk, the sculk vein, the catalyst, the sensors, the shrieker, reinforced
// deepslate, the cracked and chiseled deepslate, candles; their states, shapes, light, strength, drops and experience,
// placing them, the candles lit and put out; the items (echo shard, recovery compass, disc fragment 5, music disc 5,
// honeycomb), their recipes and creative tabs; the recovery compass's needle; the darkness effect's blend; textures,
// models and sounds all there.

import { load, check, flatLevel, place, prop, ticks, blockName, exitWithStatus, stackOf } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/interaction.ts', '/src/entity/player.ts', '/src/inventory/recipes.ts', '/src/game/redstone/piston.ts', '/src/item/compass.ts',
  '/src/item/jukeboxSongs.ts', '/src/entity/effects.ts', '/src/render/effectVisuals.ts', '/src/textures/blocks.ts', '/src/textures/items.ts',
  '/src/world/models.ts', '/src/audio/synth.ts', '/src/entity/arrow.ts', '/src/item/enchantHelper.ts', '/src/entity/thrownPotion.ts',
]);
const G = 64;
const stack = (id, n = 1) => stackOf(m, id, n);
const B = (name) => m.getBlock(name);
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const box = (bx) => bx.map((v) => Math.round(v * 16));
const CANDLES = m.CANDLE_NAMES;

// ---------------------------------------------------------------------------------------------------------------
// States, shapes, light, strength

{
  check('states: sculk has one state, the vein 128 (six faces and waterlogged)', B('sculk').stateCount === 1 && B('sculk_vein').stateCount === 128);
  check('states: catalyst bloom (2), sensor phase x power x waterlogged (96), calibrated x facing (384), shrieker (8)',
    B('sculk_catalyst').stateCount === 2 && B('sculk_sensor').stateCount === 96 && B('calibrated_sculk_sensor').stateCount === 384 && B('sculk_shrieker').stateCount === 8);
  check('states: 17 candles, each 1-4 x lit x waterlogged (16)', CANDLES.length === 17 && CANDLES.every((n) => B(n).stateCount === 16));
  const sensor = B('sculk_sensor');
  check('sensor: defaults inactive, power 0, dry', sensor.get(sensor.defaultState, 'sculk_sensor_phase') === 'inactive' && sensor.get(sensor.defaultState, 'power') === 0 && sensor.get(sensor.defaultState, 'waterlogged') === false);
  const sh = B('sculk_shrieker');
  check('shrieker: defaults not shrieking, can\'t summon, dry', sh.get(sh.defaultState, 'shrieking') === false && sh.get(sh.defaultState, 'can_summon') === false && sh.get(sh.defaultState, 'waterlogged') === false);
  // shapes
  check('sensor: collides as its lower half (0-8 px)', box(m.COLLISION[sensor.defaultState][0]).join() === '0,0,0,16,8,16');
  check('shrieker: collides as its lower half, outlined as the whole block', box(m.COLLISION[sh.defaultState][0]).join() === '0,0,0,16,8,16' && box(m.OUTLINE[sh.defaultState][0]).join() === '0,0,0,16,16,16');
  const vein = B('sculk_vein');
  const veinDown = vein.state({ down: true });
  check('vein: no collision; outlined as a pixel against each face it covers', m.COLLISION[veinDown] === null && box(m.OUTLINE[veinDown][0]).join() === '0,0,0,16,1,16' && m.OUTLINE[vein.state({ north: true, east: true })].length === 2);
  const candle = B('candle');
  const cbox = (n) => box(m.COLLISION[candle.state({ candles: n })][0]).join();
  check('candles: vanilla ONE..FOUR_AABB', cbox(1) === '7,0,7,9,6,9' && cbox(2) === '5,0,6,11,6,9' && cbox(3) === '5,0,6,10,6,11' && cbox(4) === '5,0,5,11,6,10');
  // light
  const light = (st) => m.EMISSION[st];
  check('light: catalyst 6, sensors 1, shrieker 0, sculk 0', light(B('sculk_catalyst').defaultState) === 6 && light(sensor.defaultState) === 1 && light(B('calibrated_sculk_sensor').defaultState) === 1 && light(sh.defaultState) === 0 && light(B('sculk').defaultState) === 0);
  check('light: 3 for each lit candle, none unlit', [1, 2, 3, 4].every((n) => light(candle.state({ candles: n, lit: true })) === 3 * n && light(candle.state({ candles: n, lit: false })) === 0));
  check('emissive: an active sensor is drawn full bright, not inactive or cooling down', m.EMISSIVE[sensor.state({ sculk_sensor_phase: 'active' })] === 1 && m.EMISSIVE[sensor.state({ sculk_sensor_phase: 'cooldown' })] === 0 && m.EMISSIVE[sensor.defaultState] === 0 &&
    m.EMISSIVE[B('calibrated_sculk_sensor').state({ sculk_sensor_phase: 'active' })] === 1);
  // strength
  const hard = (n) => [B(n).s.hardness, B(n).s.resistance ?? B(n).s.hardness];
  check('strength: sculk and vein 0.2, catalyst and shrieker 3, sensors 1.5, candles 0.1', hard('sculk')[0] === 0.2 && hard('sculk_vein')[0] === 0.2 && hard('sculk_catalyst').join() === '3,3' && hard('sculk_shrieker').join() === '3,3' && hard('sculk_sensor')[0] === 1.5 && hard('calibrated_sculk_sensor')[0] === 1.5 && hard('candle')[0] === 0.1);
  check('strength: reinforced deepslate 55 / 1200', hard('reinforced_deepslate').join() === '55,1200');
  check('strength: cracked and chiseled deepslate as the bricks (3.5 / 6, a pickaxe for drops)', ['cracked_deepslate_bricks', 'cracked_deepslate_tiles', 'chiseled_deepslate'].every((n) => hard(n).join() === '3.5,6' && B(n).s.requiresTool && B(n).s.tool === 'pickaxe'));
  check('tools: the sculk blocks are a hoe\'s', ['sculk', 'sculk_vein', 'sculk_catalyst', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker'].every((n) => B(n).s.tool === 'hoe'));
  check('sounds: the sculk sound groups', B('sculk').s.sound === 'sculk' && B('sculk_vein').s.sound === 'sculk_vein' && B('sculk_catalyst').s.sound === 'sculk_catalyst' && B('sculk_sensor').s.sound === 'sculk_sensor' && B('sculk_shrieker').s.sound === 'sculk_shrieker' && B('candle').s.sound === 'candle' && B('reinforced_deepslate').s.sound === 'deepslate');
}

// ---------------------------------------------------------------------------------------------------------------
// Drops and experience

{
  const r = new m.Rand(1, 2);
  const silky = { enchantments: { silk_touch: 1 } };
  const drops = (st, tool, silk) => m.blockDrops(st, tool ? m.ITEMS.get(tool) : null, r, silk).map((s) => `${s.item.id}x${s.count}`).join();
  for (const n of ['sculk', 'sculk_catalyst', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker']) {
    const st = B(n).defaultState;
    check(`drops: ${n} only with silk touch`, drops(st, 'diamond_hoe', false) === '' && drops(st, null, false) === '' && drops(st, 'diamond_hoe', true) === `${n}x1`);
  }
  const vein = B('sculk_vein').state({ down: true, north: true, up: true });
  check('drops: a sculk vein, one for each face, only with silk touch', drops(vein, 'iron_hoe', true) === 'sculk_veinx3' && drops(vein, 'iron_hoe', false) === '' && drops(vein, 'shears', false) === '');
  check('drops: reinforced deepslate nothing, silk touch neither', drops(B('reinforced_deepslate').defaultState, 'netherite_pickaxe', false) === '' && drops(B('reinforced_deepslate').defaultState, 'netherite_pickaxe', true) === '');
  check('drops: cracked and chiseled deepslate themselves with a pickaxe, nothing by hand', drops(B('cracked_deepslate_bricks').defaultState, 'wooden_pickaxe', false) === 'cracked_deepslate_bricksx1' && drops(B('chiseled_deepslate').defaultState, null, false) === '');
  check('drops: candles, as many as there were', [1, 2, 3, 4].every((n) => drops(B('red_candle').state({ candles: n, lit: true }), null, false) === `red_candlex${n}`));
  const xp = (n, silk) => m.blockExperience(B(n).defaultState, m.ITEMS.get('iron_hoe'), r, silk);
  check('experience: sculk 1, catalyst, sensors and shrieker 5', xp('sculk', false) === 1 && ['sculk_catalyst', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker'].every((n) => xp(n, false) === 5));
  check('experience: none with silk touch, none from the vein', xp('sculk', true) === 0 && xp('sculk_catalyst', true) === 0 && xp('sculk_vein', false) === 0);
  check('experience: by hand too (no tool needed)', m.blockExperience(B('sculk_shrieker').defaultState, null, r, false) === 5);
  void silky;
  // pistons
  const pr = (n) => m.pushReaction(B(n).defaultState);
  check('pistons: the vein and candles are destroyed', pr('sculk_vein') === 'destroy' && pr('candle') === 'destroy' && pr('black_candle') === 'destroy');
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const pushable = (n) => m.isPushable(level, B(n).defaultState, 0, G, 0, 2, true, 2);
  check('pistons: sculk is pushed; reinforced deepslate, the sensors, shrieker and catalyst (block entities) never move', pushable('sculk') && ['reinforced_deepslate', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker', 'sculk_catalyst'].every((n) => !pushable(n)));
}

// ---------------------------------------------------------------------------------------------------------------
// Placing: sensors, shrieker, vein, block entities

{
  const { level, world } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'sculk_sensor', 0, G, 0);
  check('sensor: placed dry, with its block entity', prop(m, level, 0, G, 0, 'waterlogged') === false && world.getBlockEntity(0, G, 0) instanceof m.SculkSensorBlockEntity);
  place(m, level, 'water', 2, G, 0);
  place(m, level, 'sculk_sensor', 2, G, 0);
  check('sensor: placed in still water it\'s waterlogged', prop(m, level, 2, G, 0, 'waterlogged') === true);
  for (const [yaw, facing] of [[0, 'south'], [90, 'west'], [180, 'north'], [270, 'east']]) {
    place(m, level, 'calibrated_sculk_sensor', 4, G, 0, { yaw });
    check(`calibrated sensor: faces the way the player looks (yaw ${yaw}: ${facing})`, prop(m, level, 4, G, 0, 'facing') === facing);
  }
  check('calibrated sensor: its block entity', world.getBlockEntity(4, G, 0) instanceof m.CalibratedSculkSensorBlockEntity);
  place(m, level, 'sculk_shrieker', 6, G, 0);
  place(m, level, 'sculk_catalyst', 8, G, 0);
  check('shrieker and catalyst: their block entities', world.getBlockEntity(6, G, 0) instanceof m.SculkShriekerBlockEntity && world.getBlockEntity(8, G, 0) instanceof m.SculkCatalystBlockEntity);
  const saved = m.loadBlockEntity(JSON.parse(JSON.stringify({ ...world.getBlockEntity(6, G, 0).save(), data: { warning_level: 3 } })));
  check('shrieker: its warning level saved and loaded', saved.warningLevel === 3);
  // the catalyst's bloom fades on its scheduled tick
  level.setBlock(8, G, 0, B('sculk_catalyst').state({ bloom: true }));
  m.behaviorOf(level.getState(8, G, 0)).tick(level, 8, G, 0, level.getState(8, G, 0));
  check('catalyst: a scheduled tick takes the bloom away', prop(m, level, 8, G, 0, 'bloom') === false);
  // the vein: on the floor, then a wall face added to it
  const vein = B('sculk_vein');
  const st = m.placementState(vein, { world, x: 0, y: G, z: 3, face: 1, hitY: 0, hitX: 0.5, hitZ: 0.5, yaw: 0, pitch: 60, sneaking: false, clickedState: 0, replaceClicked: false });
  level.setBlock(0, G, 3, st);
  check('vein: placed on the floor covers its down face', prop(m, level, 0, G, 3, 'down') === true && prop(m, level, 0, G, 3, 'north') === false);
  level.setBlock(0, G, 2, m.S('stone'));
  level.setBlock(0, G + 1, 2, m.S('stone'));
  check('vein: another vein can go into it while it has a free face', m.canReplace(level.getState(0, G, 3), vein) === true);
  const st2 = m.placementState(vein, { world, x: 0, y: G, z: 3, face: 3, hitY: 0.5, hitX: 0.5, hitZ: 0, yaw: 180, pitch: 0, sneaking: false, clickedState: level.getState(0, G, 3), replaceClicked: true });
  level.setBlock(0, G, 3, st2);
  check('vein: the second covers the wall it faces too', prop(m, level, 0, G, 3, 'down') === true && prop(m, level, 0, G, 3, 'north') === true);
  check('vein: any other block goes in its place', m.canReplace(level.getState(0, G, 3), B('stone')) === true);
  level.setBlock(0, G, 2, 0);
  level.setBlock(0, G + 1, 2, 0);
  check('vein: losing the wall loses that face, keeping the floor', prop(m, level, 0, G, 3, 'north') === false && prop(m, level, 0, G, 3, 'down') === true);
}

// ---------------------------------------------------------------------------------------------------------------
// Candles: placing more, lighting, putting out

/** a flat world with a player at (0.5, G, 2.5) looking north and down at (0, G, 0) */
function scene() {
  const { level, world, sounds, particles } = flatLevel(m, -1, -1, 1, 1);
  const p = new m.Player(level);
  p.moveTo(0.5, G, 2.5, 180, 40);
  level.addEntity(p);
  level.player = p;
  const inter = new m.Interaction(level, p);
  return { level, world, sounds, particles, p, inter };
}

/** right-click (0, G, 0) with `s` in the main hand, looking at the middle of its lower part */
function useOn(sc, s, sneaking = false) {
  const { p, inter } = sc;
  p.inventory.main[0] = s;
  p.inventory.selected = 0;
  p.crouching = p.input.sneak = sneaking;
  const ey = p.y + p.eyeHeight;
  p.pitch = (Math.atan2(ey - (G + 0.2), p.z - 0.5) * 180) / Math.PI;
  inter.pick(p.x, ey, p.z, p.yaw, p.pitch);
  inter.rightClickDelay = 0;
  inter.use(true, true);
  p.crouching = p.input.sneak = false;
}

{
  const sc = scene();
  const { level, sounds, particles, p } = sc;
  place(m, level, 'candle', 0, G, 0);
  check('candle: placed, one candle, unlit, dry', prop(m, level, 0, G, 0, 'candles') === 1 && prop(m, level, 0, G, 0, 'lit') === false && prop(m, level, 0, G, 0, 'waterlogged') === false);
  const cs = stack('candle', 5);
  useOn(sc, cs);
  check('candle: another candle used on it goes in beside it', prop(m, level, 0, G, 0, 'candles') === 2 && cs.count === 4, `${prop(m, level, 0, G, 0, 'candles')} ${cs.count}`);
  useOn(sc, cs);
  useOn(sc, cs);
  check('candle: up to four', prop(m, level, 0, G, 0, 'candles') === 4 && cs.count === 2);
  useOn(sc, cs);
  check('candle: a fifth doesn\'t go in', prop(m, level, 0, G, 0, 'candles') === 4);
  level.setBlock(0, G, 0, B('candle').state({ candles: 2 }));
  useOn(sc, stack('red_candle'));
  check('candle: a candle of another colour doesn\'t go in', blockName(m, level.getState(0, G, 0)) === 'candle' && prop(m, level, 0, G, 0, 'candles') === 2);
  useOn(sc, stack('candle'), true);
  check('candle: nor the same while sneaking', prop(m, level, 0, G, 0, 'candles') === 2);
  // lighting
  const fs = stack('flint_and_steel');
  useOn(sc, fs);
  check('light: flint and steel lights them', prop(m, level, 0, G, 0, 'lit') === true && sounds.some((s) => s.name === 'item.flintandsteel.use') && fs.damage === 1);
  check('light: 3 for each, lit', m.EMISSION[level.getState(0, G, 0)] === 6 && level.world.getLight(0, G, 0) % 16 === 6);
  // flames and smoke
  const before = particles.length;
  for (let i = 0; i < 40; i++) m.behaviorOf(level.getState(0, G, 0)).animateTick(level, 0, G, 0, level.getState(0, G, 0));
  const flames = particles.slice(before).filter((q) => q.kind === 'small_flame');
  check('flames: a small flame over each wick every time', flames.length === 80 && flames.every((q) => (near(q.x, 0.375) && near(q.y, G + 7 / 16) && near(q.z, 0.5)) || (near(q.x, 0.625) && near(q.y, G + 0.5) && near(q.z, 7 / 16))), `${flames.length}`);
  check('flames: now and then smoke', particles.slice(before).some((q) => q.kind === 'smoke'));
  // putting out by hand
  useOn(sc, null);
  check('out: an empty hand puts them out, smoke and the extinguish sound', prop(m, level, 0, G, 0, 'lit') === false && sounds.some((s) => s.name === 'block.candle.extinguish'));
  // a fire charge
  const fc = stack('fire_charge', 2);
  useOn(sc, fc);
  check('light: a fire charge lights them, and is used up', prop(m, level, 0, G, 0, 'lit') === true && fc.count === 1 && sounds.some((s) => s.name === 'item.firecharge.use'));
  useOn(sc, stack('stone'));
  check('out: not with something else in the hand', prop(m, level, 0, G, 0, 'lit') === true && blockName(m, level.getState(0, G, 0)) === 'candle');
  level.setBlock(0, G, 1, 0);
  // water poured in
  const wb = stack('water_bucket');
  useOn(sc, wb);
  check('water: a bucket poured in waterlogs them and puts them out', prop(m, level, 0, G, 0, 'waterlogged') === true && prop(m, level, 0, G, 0, 'lit') === false && p.inventory.main[0]?.item.id === 'bucket');
  useOn(sc, stack('flint_and_steel'));
  check('water: waterlogged candles can\'t be lit (flint and steel puts fire elsewhere)', prop(m, level, 0, G, 0, 'lit') === false);
  level.setBlock(0, G, 1, 0);
  // a splash of water puts them out
  level.setBlock(0, G, 0, B('candle').state({ candles: 1, lit: true }));
  check('splash: extinguishCandle puts out a lit one (a splash water bottle)', m.extinguishCandle(level, 0, G, 0) === true && prop(m, level, 0, G, 0, 'lit') === false && m.extinguishCandle(level, 0, G, 0) === false);
  // a burning arrow lights them
  level.setBlock(0, G, 0, B('candle').state({ candles: 1 }));
  const arrow = new m.Arrow(level, p);
  arrow.moveTo(0.5, G + 0.2, 1.5, 180, 0);
  arrow.dx = 0; arrow.dy = 0; arrow.dz = -1.5;
  arrow.igniteForSeconds(5);
  level.addEntity(arrow);
  ticks(level, 4);
  check('arrow: a burning arrow striking it lights it', prop(m, level, 0, G, 0, 'lit') === true);
  // support
  level.setBlock(3, G, 0, B('candle').defaultState);
  level.setBlock(3, G - 1, 0, 0);
  check('support: with nothing under them they break', blockName(m, level.getState(3, G, 0)) === 'air');
  const onAir = m.canSurvive(level.world, 5, G + 1, 0, B('candle').defaultState);
  level.setBlock(5, G, 0, m.S('oak_fence'));
  check('support: they stand on a fence post, not on air', !onAir && m.canSurvive(level.world, 5, G + 1, 0, B('candle').defaultState));
}

// ---------------------------------------------------------------------------------------------------------------
// Items, recipes, creative tabs

{
  const it = (id) => m.ITEMS.get(id);
  check('items: echo shard (uncommon), recovery compass (uncommon, tools), disc fragment 5 (uncommon)', it('echo_shard')?.rarity === 'uncommon' && it('recovery_compass')?.rarity === 'uncommon' && it('recovery_compass').creativeTab === 'tools' && it('disc_fragment_5')?.rarity === 'uncommon');
  check('items: the disc fragment is "Disc Fragment", "Music Disc - 5" under it', it('disc_fragment_5').name === 'Disc Fragment' && it('disc_fragment_5').lore?.join() === 'Music Disc - 5');
  check('items: music disc 5, one to a stack, rare, "Samuel Åberg - 5"', it('music_disc_5')?.maxStack === 1 && it('music_disc_5').rarity === 'rare' && it('music_disc_5').name === 'Music Disc' && it('music_disc_5').lore?.join() === 'Samuel Åberg - 5');
  const song = m.JUKEBOX_SONGS.music_disc_5;
  check('song: 5 plays 178 seconds, a comparator reads 15', song.lengthSeconds === 178 && song.comparatorOutput === 15 && song.sound === 'music_disc.5');
  check('items: honeycomb', !!it('honeycomb'));
  check('items: candles drawn as their sprites, the vein as its texture', CANDLES.every((n) => it(n).texture === n) && it('sculk_vein').texture === 'block:sculk_vein');
  check('tabs: sculk and its kin natural, candles coloured', ['sculk', 'sculk_vein', 'sculk_catalyst', 'sculk_sensor', 'sculk_shrieker'].every((n) => it(n).creativeTab === 'natural') && CANDLES.every((n) => it(n).creativeTab === 'colored'));
  const order = m.ITEM_LIST.map((x) => x.id);
  const after = (a, b) => order.indexOf(a) === order.indexOf(b) + 1;
  check('tabs: in vanilla\'s order among the rest', after('recovery_compass', 'compass') && after('music_disc_5', 'music_disc_otherside') && after('honeycomb', 'rabbit_hide') && after('cracked_deepslate_bricks', 'deepslate_bricks') && after('cracked_deepslate_tiles', 'deepslate_tiles') && after('reinforced_deepslate', 'deepslate_tile_wall') && after('chiseled_deepslate', 'cobbled_deepslate') && order.indexOf('disc_fragment_5') === order.indexOf('white_dye') - 1 && order.indexOf('sculk_sensor') === order.indexOf('cobweb') - 1);
  // recipes
  const grid = (slots) => Array.from({ length: 9 }, (_, i) => (slots[i] ? stack(slots[i]) : null));
  const craft = (g, w = 3) => {
    const r = m.findRecipe(g, w, g.length / w);
    return r ? `${r.result}x${r.count}` : null;
  };
  check('recipe: string over honeycomb makes a candle', craft(grid({ 1: 'string', 4: 'honeycomb' })) === 'candlex1');
  check('recipe: a candle and a dye make a dyed candle', craft(grid({ 0: 'candle', 4: 'lime_dye' })) === 'lime_candlex1' && craft(grid({ 3: 'black_dye', 8: 'candle' })) === 'black_candlex1');
  check('recipe: amethyst over a sculk sensor makes the calibrated sensor', craft(grid({ 1: 'amethyst_shard', 3: 'amethyst_shard', 4: 'sculk_sensor', 5: 'amethyst_shard' })) === 'calibrated_sculk_sensorx1');
  check('recipe: a compass in eight echo shards makes the recovery compass', craft(grid({ 0: 'echo_shard', 1: 'echo_shard', 2: 'echo_shard', 3: 'echo_shard', 4: 'compass', 5: 'echo_shard', 6: 'echo_shard', 7: 'echo_shard', 8: 'echo_shard' })) === 'recovery_compassx1');
  check('recipe: nine disc fragments make music disc 5', craft(grid(Object.fromEntries([...Array(9)].map((_, i) => [i, 'disc_fragment_5'])))) === 'music_disc_5x1' && craft(grid({ 0: 'disc_fragment_5', 1: 'disc_fragment_5' })) === null);
  check('recipe: two cobbled deepslate slabs make chiseled deepslate', craft(grid({ 1: 'cobbled_deepslate_slab', 4: 'cobbled_deepslate_slab' })) === 'chiseled_deepslatex1');
  const sm = (id) => m.smeltingResult(stack(id));
  check('smelting: deepslate bricks and tiles crack (0.1 xp)', sm('deepslate_bricks')?.result === 'cracked_deepslate_bricks' && sm('deepslate_tiles')?.result === 'cracked_deepslate_tiles' && sm('deepslate_tiles').xp === 0.1);
  check('recipe: no recipe for reinforced deepslate or sculk', !m.RECIPES.some((r) => /^(reinforced_deepslate|sculk|sculk_vein|sculk_catalyst|sculk_sensor|sculk_shrieker)$/.test(r.result)));
}

// ---------------------------------------------------------------------------------------------------------------
// The recovery compass

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const p = new m.Player(level);
  p.moveTo(0.5, G, 0.5, 0, 0);
  level.addEntity(p);
  m.setDialViewer(p, [0, G, 0]);
  const rc = stack('recovery_compass');
  const frames = new Set();
  for (let i = 0; i < 40; i++) {
    level.gameTime++;
    frames.add(m.dialTexture(rc));
  }
  check('recovery compass: with no death it spins', frames.size > 3 && [...frames].every((f) => /^recovery_compass_\d\d$/.test(f)), [...frames].join());
  p.die('generic');
  check('death: the player remembers where they died', p.lastDeathLocation?.dim === 'overworld' && p.lastDeathLocation.pos.join() === `0,${G},0`);
  // standing 20 blocks south of it (+z), facing south (yaw 0): the needle settles pointing straight back (down)
  p.lastDeathLocation = { dim: 'overworld', pos: [0, G, -20] };
  p.moveTo(0.5, G, 20.5, 0, 0);
  let f = '';
  for (let i = 0; i < 200; i++) {
    level.gameTime++;
    f = m.dialTexture(rc);
  }
  check('recovery compass: behind the player it points down (frame 16)', f === 'recovery_compass_16', f);
  p.yaw = 180;
  for (let i = 0; i < 200; i++) {
    level.gameTime++;
    f = m.dialTexture(rc);
  }
  check('recovery compass: ahead of the player it points up (frame 0)', f === 'recovery_compass_00', f);
  p.yaw = 90;
  for (let i = 0; i < 200; i++) {
    level.gameTime++;
    f = m.dialTexture(rc);
  }
  check('recovery compass: facing west, north is to the right (frame 8)', f === 'recovery_compass_08', f);
  p.lastDeathLocation = { dim: 'the_nether', pos: [0, G, -20] };
  frames.clear();
  for (let i = 0; i < 40; i++) {
    level.gameTime++;
    frames.add(m.dialTexture(rc));
  }
  check('recovery compass: a death in another dimension: it spins', frames.size > 3);
  check('compass: points to the world spawn; other items have no dial', /^compass_\d\d$/.test(m.dialTexture(stack('compass'))) && m.dialTexture(stack('stone')) === undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// Darkness: its visuals blend in over 22 ticks and out over its last 22

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const p = new m.Player(level);
  p.moveTo(0.5, G, 0.5, 0, 0);
  level.addEntity(p);
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.darkness, 100));
  const inst = p.getEffect('darkness');
  check('darkness: the blend starts at 0', inst.blendFactor(1) === 0);
  for (let i = 0; i < 11; i++) inst.tick(p, () => {});
  check('darkness: half way in after 11 ticks', near(inst.blendFactor(1), 0.5, 1e-6), `${inst.blendFactor(1)}`);
  for (let i = 0; i < 11; i++) inst.tick(p, () => {});
  check('darkness: fully in after 22', near(inst.blendFactor(1), 1, 1e-6));
  while (inst.duration > 11) inst.tick(p, () => {});
  check('darkness: fading out over its last 22 ticks', inst.blendFactor(1) < 0.6 && inst.blendFactor(1) > 0.4, `${inst.blendFactor(1)}`);
  const v = m.darknessVisuals(p, 0, 1);
  check('darkness: the fog factor, gamma and pulse (0.45 x factor at the peak of the cosine)', v && near(v.factor, inst.blendFactor(0)) && near(v.gamma, v.factor) && v.pulse <= 0.45 * v.factor + 1e-9);
  const blind = new m.MobEffectInstance(m.MOB_EFFECTS.blindness, 100);
  blind.tick(p, () => {});
  check('blindness: effects without a blend duration are fully in at once', blind.blendFactor(1) === 1);
  const loaded = new m.MobEffectInstance(m.MOB_EFFECTS.darkness, 300);
  loaded.skipBlending();
  check('darkness: loaded with the world it\'s already in', loaded.blendFactor(0) === 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Textures, models, sounds

{
  const T = m.BLOCK_TEXTURES;
  const deep = ['sculk', 'sculk_vein', 'sculk_catalyst', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker', 'reinforced_deepslate', 'cracked_deepslate_bricks', 'cracked_deepslate_tiles', 'chiseled_deepslate', ...CANDLES];
  const missing = new Set();
  for (const n of deep) {
    const b = B(n);
    for (let st = b.baseState; st < b.baseState + b.stateCount; st++) {
      const choice = b.s.model(m.STATE_VIEWS[st]);
      const variants = Array.isArray(choice) ? choice : 'parts' in choice ? choice.parts.flatMap((p) => p.apply) : [choice];
      for (const v of variants)
        for (const e of v.model.elements) for (const f of Object.values(e.faces)) if (f && !T[f.tex]) missing.add(f.tex);
    }
  }
  check('textures: every face of every model has its texture', missing.size === 0, [...missing].join());
  const anim = ['sculk', 'sculk_vein', 'sculk_catalyst_side_bloom', 'sculk_sensor_tendril_active', 'sculk_shrieker_can_summon_inner_top'];
  check('textures: sculk, the vein, the bloom, the tendrils and the summoning mouth are animated', anim.every((n) => T[n] && T[n]().frames?.length > 1), anim.filter((n) => !T[n]?.().frames).join());
  const I = m.ITEM_TEXTURES;
  const items = ['echo_shard', 'recovery_compass', 'disc_fragment_5', 'music_disc_5', 'honeycomb', ...CANDLES, ...[...Array(32)].map((_, i) => `recovery_compass_${String(i).padStart(2, '0')}`)];
  check('item sprites: every new item and the needle frames', items.every((n) => I[n] && I[n]().w === 16), items.filter((n) => !I[n]).join());
  const S = m.SOUNDS;
  const events = [...['sculk', 'sculk_vein', 'sculk_catalyst', 'sculk_sensor', 'sculk_shrieker', 'candle'].flatMap((g) => ['break', 'step', 'place', 'hit', 'fall'].map((k) => `block.${g}.${k}`)),
    'block.sculk.spread', 'block.sculk.charge', 'block.sculk_sensor.clicking', 'block.sculk_sensor.clicking_stop', 'block.sculk_catalyst.bloom', 'block.sculk_shrieker.shriek', 'block.candle.ambient', 'block.candle.extinguish', 'block.amethyst_block.resonate'];
  check('sounds: the sculk groups and their events', events.every((n) => S[n]), events.filter((n) => !S[n]).join());
  check('music: disc 5\'s song is a pool of its own', m.MUSIC_POOLS['music_disc.5'] === 1);
}

await exitWithStatus(close);
