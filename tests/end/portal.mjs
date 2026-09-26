// Eyes of ender in frames, the portal opening, going through (headless): node tests/end/portal.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods: [, blockMod, worldMod, chunkMod, dimMod, levelMod, ib, ep, et, itemMod, itemEntMod, playerMod, featMod, genMod, storeMod, spawnerMod, advMod, constMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/dimension.ts', '/src/game/level.ts',
  '/src/game/itemBehavior.ts', '/src/game/endPortal.ts', '/src/game/endTravel.ts', '/src/item/item.ts', '/src/entity/itemEntity.ts', '/src/entity/player.ts',
  '/src/world/gen/endFeatures.ts', '/src/world/gen/theEnd.ts', '/src/storage/worldStore.ts', '/src/game/spawner.ts', '/src/game/advancements.ts', '/src/world/constants.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const { BLOCKS, STATE_BLOCK, S } = blockMod;
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;

function flatWorld(dim) {
  const world = new worldMod.World();
  world.reset(dim);
  for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) world.setState(x, 39, z, S('stone'));
  const level = new levelMod.Level(world, 'test');
  const log = { sounds: [], particles: 0 };
  level.sound = { play: (n, x, y, z, v, p) => log.sounds.push({ n, x, y, z, v, p }), playUI: () => {} };
  level.particles = { spawn: (k) => { if (k === 'smoke') log.particles++; } };
  return { world, level, log };
}
const frame = (facing, eye = false) => S('end_portal_frame', { facing, eye });
// a ring round the 3x3 middle (0..2, 40, 0..2), every frame facing in
function ring(world, y = 40, flip = null) {
  const at = [];
  for (let k = 0; k < 3; k++) {
    at.push([k, y, -1, 'south'], [k, y, 3, 'north'], [-1, y, k, 'east'], [3, y, k, 'west']);
  }
  for (const [x, yy, z, f] of at) world.setState(x, yy, z, frame(flip && flip[0] === x && flip[1] === z ? flip[2] : f));
  return at;
}

const { world, level, log } = flatWorld(dimMod.OVERWORLD);
const player = new playerMod.Player(level);
player.moveTo(1.5, 40, 1.5, 0, 0);
level.player = player;
level.addEntity(player);
player.setGameMode?.('survival');
const eyeStack = itemMod.ItemStack.of('ender_eye');
eyeStack.count = 16;
player.inventory.main[0] = eyeStack;
player.inventory.selected = 0;
const useOn = ib.itemBehaviorOf('ender_eye').useOn, use = ib.itemBehaviorOf('ender_eye').use;
const frames = ring(world);
{
  let ok = true;
  for (let i = 0; i < frames.length; i++) {
    const [x, y, z] = frames[i];
    const r = useOn(level, player, eyeStack, { x, y, z, face: 1 });
    if (r !== 'success' || !BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].get(world.getState(x, y, z), 'eye')) ok = false;
    if (i < 11 && name(world.getState(1, 40, 1)) !== 'air') ok = false;
  }
  check('twelve eyes go in, one each', ok && eyeStack.count === 4, `left ${eyeStack.count}`);
  let portal = 0;
  for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) if (name(world.getState(x, 40, z)) === 'end_portal') portal++;
  check('the twelfth opens the 3x3 portal', portal === 9 && name(world.getState(-1, 40, -1)) === 'air' && name(world.getState(3, 40, 3)) === 'air');
  check('portal blocks have their block entities', world.getBlockEntity(1, 40, 1)?.id === 'end_portal');
  const fills = log.sounds.filter((s) => s.n === 'block.end_portal_frame.fill'), spawn = log.sounds.filter((s) => s.n === 'block.end_portal.spawn');
  check('a fill sound for each eye, 16 smoke puffs each', fills.length === 12 && log.particles === 12 * 16, `${fills.length} ${log.particles}`);
  const sp = spawn[0];
  const eye = [player.x, player.y + player.eyeHeight, player.z];
  const dist = sp ? Math.hypot(sp.x - eye[0], sp.y - eye[1], sp.z - eye[2]) : -1;
  check('one opening sound, 2 blocks from the player toward the middle', spawn.length === 1 && Math.abs(dist - 2) < 1e-6 && sp.v === 1 && sp.p === 1, `${spawn.length} d=${dist.toFixed(3)}`);
  check('a frame that has its eye passes (the item\'s own use next)', useOn(level, player, eyeStack, { x: frames[0][0], y: 40, z: frames[0][2], face: 1 }) === 'pass');
  check('not a frame: passes', useOn(level, player, eyeStack, { x: 5, y: 39, z: 5, face: 1 }) === 'pass');
  let all = true;
  for (const [x, y, z] of frames) if (ep.findPortalShape(world, x, y, z)?.join() !== '3,40,3') all = false;
  check('found from any of its frames, at its south-east corner', all);
}
{
  // one frame facing out: no portal; creative uses no eyes
  const t = flatWorld(dimMod.OVERWORLD);
  const fr = ring(t.world, 40, [3, 1, 'east']);
  const p = { gameMode: 'creative', inventory: { consumeSelected: () => { throw new Error('used an eye in creative'); } }, swing: () => {} };
  for (const [x, y, z] of fr) useOn(t.level, p, eyeStack, { x, y, z, face: 1 });
  check('a frame facing out: no portal', name(t.world.getState(1, 40, 1)) === 'air');
  t.world.setState(3, 40, 1, frame('west', false));
  useOn(t.level, p, eyeStack, { x: 3, y: 40, z: 1, face: 1 });
  check('turned round and filled: the portal opens', name(t.world.getState(1, 40, 1)) === 'end_portal');
  // a ring 3 above the one filled, within reach, opens too (vanilla searches up to 4 up)
  const u = flatWorld(dimMod.OVERWORLD);
  const up = ring(u.world, 43);
  for (const [x, y, z] of up) u.world.setState(x, y, z, frame(BLOCKS[STATE_BLOCK[u.world.getState(x, y, z)]].get(u.world.getState(x, y, z), 'facing'), true));
  u.world.setState(0, 40, -1, frame('south', false));
  useOn(u.level, p, eyeStack, { x: 0, y: 40, z: -1, face: 1 });
  check('the frame filled finds a complete ring above it', name(u.world.getState(1, 43, 1)) === 'end_portal');
}
{
  // someone standing on the frame is lifted onto the eye
  const t = flatWorld(dimMod.OVERWORLD);
  t.world.setState(5, 40, 5, frame('north'));
  const it = new itemEntMod.ItemEntity(t.level, itemMod.ItemStack.of('stone'));
  it.moveTo(5.5, 40.8125, 5.5, 0, 0);
  t.level.addEntity(it);
  useOn(t.level, { gameMode: 'creative', inventory: {}, swing: () => {} }, eyeStack, { x: 5, y: 40, z: 5, face: 1 });
  check('what stands on the frame is pushed up onto the eye', Math.abs(it.y - 41) < 1e-9, String(it.y));
}
{
  // the eye in the air: looking at a frame passes; else it's used (with no stronghold to find, nothing flies)
  const hooks = { ...ep.EYE_OF_ENDER };
  ep.EYE_OF_ENDER.locate = () => null;
  player.moveTo(1.5, 40, -4.5, 0, 60);
  let r = use(level, player, eyeStack);
  check('used in the air: in use, nothing thrown', r === 'success' && player.isUsingItem() && eyeStack.count === 4);
  player.stopUsingItem();
  player.moveTo(1.5, 40.5, -2.5, 0, 50); // looking south, down at the frame row at z = -1
  r = use(level, player, eyeStack);
  check('looking at a frame: passes', r === 'pass' && !player.isUsingItem());
  let located = null;
  ep.EYE_OF_ENDER.locate = (_l, x, y, z) => { located = [x, y, z]; return [100, 30, 200]; };
  let launched = null;
  ep.EYE_OF_ENDER.launch = (_l, _p, _s, target) => { launched = target; };
  player.moveTo(1.5, 40, -4.5, 0, -30);
  use(level, player, eyeStack);
  check('with a stronghold to find, the hook throws toward it', located && launched?.join() === '100,30,200');
  Object.assign(ep.EYE_OF_ENDER, hooks);
  player.stopUsingItem();
}
{
  // into the portal: an item falling into its slab goes at once; standing on a frame beside it doesn't
  const seen = [];
  level.onPortal = (e, x, y, z, kind) => seen.push([e, x, y, z, kind]);
  const it = new itemEntMod.ItemEntity(level, itemMod.ItemStack.of('diamond'));
  it.moveTo(1.5, 40.5, 1.5, 0, 0);
  level.addEntity(it);
  it.dy = 0;
  it.tick();
  it.tick();
  check('an item in the portal: through on the next tick, an end portal', seen.length === 1 && seen[0][0] === it && seen[0][4] === 'end' && seen[0].slice(1, 4).join() === '1,40,1', JSON.stringify(seen.map((s) => s.slice(1))));
  seen.length = 0;
  const it2 = new itemEntMod.ItemEntity(level, itemMod.ItemStack.of('diamond'));
  it2.moveTo(-0.9, 40.8125, 0.5, 0, 0); // on the west frame's top, its box poking into the portal's column
  level.addEntity(it2);
  it2.checkInsideBlocks();
  check('above the slab (on a frame\'s top): not in', !it2.portal);
  // the player: no nausea swirl, no trigger sound for an end portal
  const p2 = player;
  p2.portal = null;
  p2.portalCooldown = 0;
  p2.moveTo(1.5, 40.4, 1.5, 0, 0);
  p2.setAsInsidePortal('end', 1, 40, 1);
  const spin = p2.spinningEffectIntensity;
  p2.tick();
  check('a player in an end portal: through at once, no swirl', seen.length === 1 && seen[0][0] === p2 && seen[0][4] === 'end' && p2.spinningEffectIntensity === spin);
  seen.length = 0;
  p2.portal = null;
  p2.portalCooldown = 0;
  p2.setAsInsidePortal('nether', 1, 40, 1);
  p2.setAsInsidePortal('end', 1, 40, 1);
  check('a different portal starts a new count', p2.portal.kind === 'end' && p2.portal.time === 0);
  p2.portal = null;
}
{
  // the platform: obsidian under the spawn point, air above, what was there dropped
  const gen = new genMod.EndGenerator('12345');
  const w = new worldMod.World();
  w.reset(dimMod.THE_END);
  for (let cx = 5; cx <= 7; cx++) for (let cz = -1; cz <= 1; cz++) w.addChunk(gen.generate(cx, cz));
  const lv = new levelMod.Level(w, '12345');
  lv.sound = { play: () => {}, playUI: () => {} };
  lv.particles = { spawn: () => {}, blockBreak: () => {} };
  const E = featMod.END_SPAWN_POINT;
  w.setState(E.x + 1, E.y, E.z, S('end_stone'));
  w.setState(E.x - 2, E.y - 2, E.z + 2, S('end_stone'));
  const before = lv.entities.length;
  et.createEndPlatform(lv, E.x, E.y - 1, E.z);
  let ok = true;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (name(w.getState(E.x + dx, E.y - 2, E.z + dz)) !== 'obsidian') ok = false;
    for (let y = E.y - 1; y <= E.y + 1; y++) if (name(w.getState(E.x + dx, y, E.z + dz)) !== 'air') ok = false;
  }
  const drops = lv.entities.slice(before).filter((e) => e.stack?.item.id === 'end_stone');
  check('the landing: 5x5 obsidian, three of air above, what was in the way dropped', ok && drops.length === 2, `drops ${drops.length}`);
}
{
  // things sent through while the player stays: waiting for their chunk in the other dimension
  const arrivals = new et.PortalArrivals();
  const g = { world, player, arrivals, worldSpawn: [8, 64, -3] };
  const it = new itemEntMod.ItemEntity(level, itemMod.ItemStack.of('ender_pearl'));
  it.moveTo(1.5, 40.5, 1.5, 0, 0);
  it.dx = 0.1;
  level.addEntity(it);
  et.endPortalTravel(g, it);
  check('an item through the portal is gone from here', it.removed);
  const saved = JSON.parse(JSON.stringify(arrivals.save()));
  const back = new et.PortalArrivals();
  back.load(saved);
  const endW = new worldMod.World();
  endW.reset(dimMod.THE_END);
  const list = back.take(endW, 6, 0);
  check('... and waits at the End spawn point (saved with the world)', list.length === 1 && list[0].x === 100.5 && list[0].y === 50 && list[0].z === 0.5 && list[0].yaw === 90 && list[0].dx === 0.1 && list[0].data.item === 'ender_pearl', JSON.stringify(list[0]));
  check('taken once', back.take(endW, 6, 0).length === 0 && back.save() === undefined);
  // from the End: to the top of the world spawn
  const g2 = { world: endW, player, arrivals, worldSpawn: [8, 64, -3] };
  const lvE = new levelMod.Level(endW, 'x');
  const it2 = new itemEntMod.ItemEntity(lvE, itemMod.ItemStack.of('end_stone'));
  it2.moveTo(0.5, 60, 0.5, 0, 0);
  lvE.addEntity(it2);
  et.endPortalTravel(g2, it2);
  const ow = new worldMod.World();
  ow.reset(dimMod.OVERWORLD);
  const c = new chunkMod.Chunk(0, -1);
  ow.chunks.set(c.key, c);
  for (let y = -64; y < 70; y++) ow.setState(8, y, -3, S('stone'));
  ow.setState(8, 70, -3, S('oak_leaves'));
  ow.setState(8, 71, -3, S('oak_leaves'));
  const got = arrivals.take(ow, 0, -1);
  check('from the End: on top of the world spawn (leaves don\'t count)', got.length === 1 && got[0].x === 8.5 && got[0].z === -2.5 && got[0].y === 70, JSON.stringify(got[0] && [got[0].x, got[0].y, got[0].z]));
}
{
  // the player's trip: to the End (landing made, facing west, the whoosh, the advancement trigger)
  const calls = [];
  const g = {
    world, player,
    changeDimension: (dim, x, y, z, arrive, portal) => calls.push({ dim, x, y, z, arrive, portal }),
  };
  player.moveTo(1.5, 40.3, 1.5, 200, 10);
  player.dy = -0.4;
  et.endPortalTravel(g, player);
  const c = calls[0];
  check('player to the End: changes dimension to 100.5 49 0.5 by a portal', c && c.dim === dimMod.THE_END && c.x === 100.5 && c.y === 49 && c.z === 0.5 && c.portal === true);
  const gen = new genMod.EndGenerator('12345');
  const w = new worldMod.World();
  w.reset(dimMod.THE_END);
  for (let cx = 5; cx <= 7; cx++) for (let cz = -1; cz <= 1; cz++) w.addChunk(gen.generate(cx, cz));
  const lv = new levelMod.Level(w, '12345');
  lv.sound = { play: () => {}, playUI: () => {} };
  lv.particles = { spawn: () => {}, blockBreak: () => {} };
  w.setState(100, 48, 0, S('end_stone'));
  const ui = [], changed = [];
  const g2 = { level: lv, player, sound: { playUI: (n, v, p) => ui.push([n, v, p]) }, onChangedDimension: (f, t) => changed.push([f.id, t.id]) };
  const done = c.arrive(g2);
  check('... arrives on the rebuilt landing, facing west, still falling, with the whoosh', done && name(w.getState(100, 48, 0)) === 'obsidian' && player.x === 100.5 && player.y === 49 && player.z === 0.5 && player.yaw === 90 && player.pitch === 10 && player.dy === -0.4 && ui[0]?.[0] === 'block.portal.travel' && ui[0][1] === 0.25, JSON.stringify(ui));
  check('... and it counts as changing dimension (overworld -> the_end)', changed[0]?.join() === 'overworld,the_end');
  // home from the End: bed gone -> world spawn, told so, no sound
  calls.length = 0;
  const gEnd = { world: w, player, changeDimension: (dim, x, y, z, arrive, portal) => calls.push({ dim, x, y, z, arrive, portal }) };
  player.respawnPos = [3, 40, 3];
  player.spawnX = 0; player.spawnY = 64; player.spawnZ = 0;
  et.endPortalTravel(gEnd, player);
  const h = calls[0];
  check('player from the End: home toward the bed', h && h.dim === dimMod.OVERWORLD && h.x === 3.5 && h.y === 40 && h.z === 3.5);
  const chats = [], tps = [];
  const g3 = { level, player, chunks: { setTicket() {}, setCenter() {} }, chat: (m) => chats.push(m), teleport: (x, y, z, yaw, pitch) => tps.push([x, y, z, yaw, pitch]), onChangedDimension: (f, t) => changed.push([f.id, t.id]), sound: { playUI: (n) => ui.push([n]) } };
  ui.length = 0;
  h.arrive(g3);
  // (vanilla PlayerList.respawn: a missing respawn block clears the respawn point)
  check('... no bed there: near the world spawn (vanilla adjustSpawnLocation), told so, the spawn point cleared, no whoosh', tps[0] && Math.abs(tps[0][0] - 0.5) <= 10 && Math.abs(tps[0][2] - 0.5) <= 10 && chats.length === 1 && !player.respawnPos && ui.length === 0, JSON.stringify([tps, chats, player.respawnPos]));
  check('... the_end -> overworld', changed[1]?.join() === 'the_end,overworld');
  player.respawnPos = null;
}
{
  // the advancements
  const a = advMod.ADVANCEMENTS;
  const endRoot = a.get('end/root'), enter = a.get('story/enter_the_end');
  check('End tab: end/root and story/enter_the_end on entering the End', endRoot && enter && JSON.stringify(Object.values(endRoot.criteria)) === JSON.stringify([{ t: 'changed_dimension', to: 'the_end' }]) && JSON.stringify(Object.values(enter.criteria)) === JSON.stringify([{ t: 'changed_dimension', to: 'the_end' }]) && advMod.TABS.map((t) => t.root).join() === 'story/root,nether/root,end/root,adventure/root,husbandry/root');
}
{
  // an End chunk round trip through the save format, under the End's own keys
  const gen = new genMod.EndGenerator('12345');
  const w = new worldMod.World();
  w.reset(dimMod.THE_END);
  const c = w.addChunk(gen.generate(2, 0));
  w.setState(40, 70, 5, S('end_stone_bricks'));
  const sc = storeMod.serializeChunk('world1', c, [], dimMod.THE_END.storage);
  const back = storeMod.deserializeChunk(sc);
  const { colIndex } = constMod;
  check('End chunks save under their own keys and come back', sc.key.includes('end/') && back.blocks[colIndex(40 & 15, 70, 5)] === S('end_stone_bricks') && back.blocks[colIndex(0, 30, 0)] === c.getState(0, 30, 0), sc.key);
}
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
