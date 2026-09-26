// Item frames (headless): node tests/end/frames.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods: [, blockMod, worldMod, chunkMod, dimMod, levelMod, itemMod, playerMod, synthMod, frameMod, spawnerMod, interMod, explMod, arrowMod, frRendMod, texItems, itemEntMod, behMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/dimension.ts', '/src/game/level.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/audio/synth.ts', '/src/entity/itemFrame.ts', '/src/game/spawner.ts', '/src/game/interaction.ts',
  '/src/game/explosion.ts', '/src/entity/arrow.ts', '/src/render/itemFrameRenderer.ts', '/src/textures/items.ts', '/src/entity/itemEntity.ts', '/src/game/itemBehavior.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const { S } = blockMod;
const { ItemStack, ITEMS } = itemMod;
const { ItemFrame } = frameMod;
const { ItemEntity } = itemEntMod;

// --- registration, sounds
check('entity names', spawnerMod.entityDisplayName('item_frame') === 'Item Frame' && spawnerMod.entityDisplayName('glow_item_frame') === 'Glow Item Frame');
check('summonable', spawnerMod.summonableTypes().includes('item_frame') && spawnerMod.summonableTypes().includes('glow_item_frame'));
check('items and their sprites', ITEMS.has('item_frame') && ITEMS.has('glow_item_frame') && typeof texItems.ITEM_TEXTURES['item_frame'] === 'function' && typeof texItems.ITEM_TEXTURES['glow_item_frame'] === 'function');
{
  const bad = [];
  for (const t of ['item_frame', 'glow_item_frame'])
    for (const [ev, k] of [['place', 4], ['add_item', 4], ['remove_item', 4], ['rotate_item', 4], ['break', 3]]) {
      const n = `entity.${t}.${ev}`;
      const g = synthMod.SOUNDS[n];
      if (!g || g.variants !== k) { bad.push(n + ' missing/takes'); continue; }
      for (let v = 0; v < k; v++) {
        const b = g.generate(v, 44100);
        let pk = 0, fin = true;
        for (const x of b) { if (!Number.isFinite(x)) fin = false; pk = Math.max(pk, Math.abs(x)); }
        if (!fin || pk < 0.3 || b.length < 4000) bad.push(`${n}#${v} (${b.length}, ${pk.toFixed(2)})`);
      }
    }
  check('ten sound events, all their takes render', bad.length === 0, bad.join('; '));
}

// --- a world: a stone floor at y 59, a stone pillar at (0, 60..61, 0)
const world = new worldMod.World();
world.reset(dimMod.OVERWORLD);
for (let cx = -3; cx <= 2; cx++) for (let cz = -3; cz <= 2; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
for (let x = -30; x < 30; x++) for (let z = -30; z < 30; z++) world.setState(x, 59, z, S('stone'));
world.setState(0, 60, 0, S('stone'));
world.setState(0, 61, 0, S('stone'));
const level = new levelMod.Level(world, '42');
const log = { sounds: [] };
level.sound = { play: (n, x, y, z, v, p) => log.sounds.push({ n, x, y, z, v, p }), playUI: () => {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn() {}, emitAround() {} };
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };
const player = new playerMod.Player(level);
player.moveTo(0.5, 60, 3.5, 180, 0);
level.player = player;
level.addEntity(player);
player.gameMode = 'survival';
const heard = (n) => log.sounds.filter((s) => s.n === n).length;
const inter = new interMod.Interaction(level, player);
const EYE = 1.62;
/** point the player's eyes at (x, y, z) and pick */
const aim = (x, y, z) => {
  const ex = player.x, ey = player.y + EYE, ez = player.z;
  const dx = x - ex, dy = y - ey, dz = z - ez;
  const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  player.yaw = yaw; player.pitch = pitch;
  inter.pick(ex, ey, ez, yaw, pitch);
};
const hold = (id, n = 1) => { player.inventory.main[0] = id ? ItemStack.of(id, n) : null; player.inventory.selected = 0; };
const use = () => { inter.rightClickDelay = 0; inter.use(true, false); };
const attack = () => { inter.missTime = 0; player.attackStrengthTicker = 100; inter.startAttack(); };
const frames = () => level.entities.filter((e) => e instanceof ItemFrame && !e.removed);
const drops = (id) => level.entities.filter((e) => e instanceof ItemEntity && !e.removed && e.stack.item.id === id);
const clearDrops = () => { for (const e of level.entities) if (e instanceof ItemEntity) e.remove(); tick(); };

// --- hanging one on the pillar's south face
hold('item_frame', 3);
aim(0.5, 60.5, 1.0);
check('aiming at the pillar', inter.hit && inter.hit.x === 0 && inter.hit.y === 60 && inter.hit.z === 0 && inter.hit.face === 3 && !inter.entityHit);
use();
let f = frames()[0];
check('placed: facing south, in the block in front', !!f && f.direction === 3 && f.tileX === 0 && f.tileY === 60 && f.tileZ === 1 && f.type === 'item_frame');
check('its box: a sixteenth deep against the wall, 0.75 across', f && Math.abs(f.bb.minZ - 1) < 1e-9 && Math.abs(f.bb.maxZ - 1.0625) < 1e-9 && Math.abs(f.bb.minX - 0.125) < 1e-9 && Math.abs(f.bb.maxY - 60.875) < 1e-9);
check('stands at its box\'s middle, yaw 0, pitch 0', f && Math.abs(f.x - 0.5) < 1e-9 && Math.abs(f.y - 60.5) < 1e-9 && Math.abs(f.z - 1.03125) < 1e-9 && f.yaw === 0 && f.pitch === 0);
check('one frame used, the place sound', player.inventory.main[0]?.count === 2 && heard('entity.item_frame.place') === 1);
// a second frame in the same spot fails
use();
check('no second frame where one hangs', frames().length === 1 && player.inventory.main[0]?.count === 2);

// --- giving it a diamond
aim(0.5, 60.5, 1.05);
check('the frame is what the player looks at', inter.entityHit === f);
hold('diamond', 5);
use();
check('it takes one diamond, with the sound', f.item?.item.id === 'diamond' && f.item.count === 1 && player.inventory.main[0]?.count === 4 && heard('entity.item_frame.add_item') === 1);
hold(null);
use();
use();
check('an empty hand turns it, a notch a click, with the sound', f.rotation === 2 && heard('entity.item_frame.rotate_item') === 2);
hold('diamond', 4);
for (let i = 0; i < 7; i++) use();
check('eight notches round (not given another)', f.rotation === 1 && f.item.count === 1 && player.inventory.main[0]?.count === 4);
check('a comparator would read its turn + 1', f.analogOutput() === 2);

// --- struck: the diamond comes out, then the frame comes down
attack();
check('struck: the diamond pops out with the sound, the frame stays', !f.item && !f.removed && drops('diamond').length === 1 && heard('entity.item_frame.remove_item') === 1);
const d0 = drops('diamond')[0];
check('it drops a little out from the wall', d0 && Math.abs(d0.z - (f.z + 0.15)) < 1e-9 && Math.abs(d0.y - f.y) < 1e-9);
attack();
tick();
check('struck empty: down it comes with the sound, the frame dropped', f.removed && drops('item_frame').length === 1 && heard('entity.item_frame.break') === 1);
clearDrops();

// --- creative: nothing drops
player.gameMode = 'creative';
hold('item_frame');
aim(0.5, 60.5, 1.0);
use();
f = frames()[0];
check('creative: placed without using the frame up', !!f && player.inventory.main[0]?.count === 1);
aim(0.5, 60.5, 1.05);
hold('emerald');
use();
check('creative: given an emerald, still holding it', f.item?.item.id === 'emerald' && player.inventory.main[0]?.count === 1);
attack();
check('creative: struck, the emerald goes without a drop', !f.item && drops('emerald').length === 0);
attack();
tick();
check('creative: struck again, gone without a drop', f.removed && drops('item_frame').length === 0);
player.gameMode = 'survival';

// --- a floor frame and a ceiling frame
const place = (type, x, y, z, face) => {
  const n = frames().length;
  player.inventory.main[0] = ItemStack.of(type);
  const r = behMod.itemBehaviorOf(type).useOn(level, player, player.inventory.main[0], { x, y, z, face, hx: x + 0.5, hy: y + 0.5, hz: z + 0.5, state: world.getState(x, y, z), dist: 1 });
  return { r, f: frames().length > n ? frames()[frames().length - 1] : null };
};
{
  const { r, f: up } = place('item_frame', 5, 59, 5, 1);
  check('on a floor: facing up, pitched -90, flat', r === 'success' && up && up.direction === 1 && up.pitch === -90 && up.yaw === 0 && Math.abs(up.bb.maxY - up.bb.minY - 0.0625) < 1e-9 && up.bb.minY === 60);
  world.setState(5, 62, 8, S('stone'));
  const { r: r2, f: down } = place('glow_item_frame', 5, 62, 8, 0);
  check('under a ceiling: facing down, pitched 90', r2 === 'success' && down && down.direction === 0 && down.pitch === 90 && down.bb.maxY === 62 && down.type === 'glow_item_frame');
  check('the glow frame\'s own place sound', heard('entity.glow_item_frame.place') === 1);
  // nothing solid to hang on: a flower
  world.setState(8, 60, 8, S('poppy'));
  const { r: r3 } = place('item_frame', 8, 60, 8, 3);
  check('won\'t hang on a flower', r3 === 'fail');
  // the walls: horizontal frames face as vanilla's yaw says
  world.setState(10, 60, 10, S('stone'));
  const want = { 2: 180, 3: 0, 4: 90, 5: 270 };
  const bad = [];
  for (const face of [2, 3, 4, 5]) {
    const { f: w } = place('item_frame', 10, 60, 10, face);
    if (!w || w.direction !== face || w.yaw !== want[face]) bad.push(`${face}: ${w?.direction} ${w?.yaw}`);
  }
  check('wall frames: yaw south 0, west 90, north 180, east 270', bad.length === 0, bad.join('; '));
  // a wall frame on a slab (solid enough) and on a fence (taller than a block: solid)
  world.setState(12, 60, 12, S('oak_fence'));
  check('hangs on a fence', place('item_frame', 12, 60, 12, 3).r === 'success');
}

// --- the wall goes: it drops within 100 ticks
{
  world.setState(15, 60, 15, S('stone'));
  const { f: w } = place('item_frame', 15, 60, 15, 3);
  w.setItem(ItemStack.of('gold_ingot'));
  world.setState(15, 60, 15, 0);
  let t = 0;
  while (!w.removed && t < 120) { tick(); t++; }
  check('with nothing behind it, it drops off at its next check (and what it held)', w.removed && t <= 101 && drops('gold_ingot').length === 1 && drops('item_frame').length >= 1, `after ${t}`);
  clearDrops();
}

// --- a blast brings it down with what it holds
{
  world.setState(18, 60, 18, S('obsidian'));
  const { f: w } = place('item_frame', 18, 60, 18, 3);
  w.setItem(ItemStack.of('iron_ingot'));
  explMod.explode(level, null, 18.5, 60.5, 21, 3, false, 'none');
  tick();
  check('blown up: the frame and its iron come down', w.removed && drops('iron_ingot').length === 1 && drops('item_frame').length === 1);
  clearDrops();
}

// --- an arrow knocks the item out
{
  world.setState(-10, 60, -10, S('stone'));
  world.setState(-10, 61, -10, S('stone'));
  const { f: w } = place('item_frame', -10, 60, -10, 3);
  w.setItem(ItemStack.of('apple'));
  const a = new arrowMod.Arrow(level, null);
  a.moveTo(-9.5, 60.5, -6, 0, 0);
  a.dx = 0; a.dy = 0; a.dz = -1.5;
  level.addEntity(a);
  let t = 0;
  while (!a.removed && t < 40) { tick(); t++; }
  check('an arrow knocks the apple out, and is spent', !w.item && !w.removed && drops('apple').length === 1 && a.removed);
  clearDrops();
}

// --- a map makes the frame's box the whole block
{
  world.setState(-14, 60, -14, S('stone'));
  const { f: w } = place('item_frame', -14, 60, -14, 3);
  const m = ItemStack.of('filled_map');
  m.tag = { mapId: 3 };
  w.setItem(m);
  check('a map: the frame\'s box a whole block across', Math.abs(w.bb.maxX - w.bb.minX - 1) < 1e-9 && w.hasFramedMap());
  w.setItem(null);
  check('empty again: 0.75', Math.abs(w.bb.maxX - w.bb.minX - 0.75) < 1e-9);
}

// --- saved and loaded
{
  world.setState(-18, 60, -18, S('stone'));
  const { f: w } = place('glow_item_frame', -18, 60, -18, 5);
  const s = ItemStack.of('diamond_sword');
  s.damage = 12;
  w.setItem(s);
  w.setRotation(5);
  w.fixed = true;
  const d = JSON.parse(JSON.stringify(spawnerMod.saveEntity(w)));
  const back = spawnerMod.loadEntity(d, level);
  check('saved and loaded: type, face, place, item, turn, fixed', back instanceof ItemFrame && back.type === 'glow_item_frame' && back.direction === 5 && back.tileX === -17 && back.item?.item.id === 'diamond_sword' && back.item.damage === 12 && back.rotation === 5 && back.fixed && Math.abs(back.x - w.x) < 1e-9);
  check('kept with its chunk', spawnerMod.isChunkSaved(w));
  // fixed: survival can't touch it
  const n = log.sounds.length;
  check('a fixed frame shrugs off a survival blow and a click', !w.hurt(1, 'player', player) && !w.playerInteract(player, ItemStack.of('stone')) && w.item && !w.removed && log.sounds.length === n);
}

// --- summoned with entity data
{
  const w = new ItemFrame(level, 'item_frame', 3, 64, 3);
  w.readEntityData('{Facing:1b,Item:{id:"minecraft:compass",count:1},ItemRotation:3b,Invisible:1b}');
  check('/summon data: facing, item, turn, invisible', w.direction === 1 && w.item?.item.id === 'compass' && w.rotation === 3 && w.invisible && w.pitch === -90);
}

// --- a block may go where a frame hangs; the frame then drops
{
  clearDrops();
  world.setState(20, 60, 20, S('stone'));
  world.setState(20, 61, 20, S('stone'));
  player.moveTo(20.5, 60, 23.5, 180, 0);
  const { f: w } = place('item_frame', 20, 60, 20, 3);
  hold('cobblestone', 4);
  aim(20.5, 60.0, 21.8);
  check('aiming at the floor in front of the frame', inter.hit && inter.hit.y === 59 && inter.hit.z === 21 && inter.hit.face === 1 && !inter.entityHit);
  use();
  check('the cobblestone goes in the frame\'s block', blockMod.BLOCKS[blockMod.STATE_BLOCK[world.getState(20, 60, 21)]].name === 'cobblestone');
  let t = 0;
  while (!w.removed && t < 120) { tick(); t++; }
  check('the frame, now inside it, drops off', w.removed && drops('item_frame').length >= 1);
}

// --- drawing: where the back and the item go for each face
{
  const R = new frRendMod.ItemFrameRenderer(null, { render: (b, pose, stack, ctx) => { const o = [0, 0, 0]; pose.transform(0, 0, 0, o); itemAt.push({ o, ctx, id: stack.item.id }); } });
  R.texture = () => 'tex';
  const itemAt = [];
  const quads = [];
  const b = {
    lightS: 0, lightB: 0,
    setOverlay() {},
    begin() {},
    quad(ps, p) { const v = []; for (let i = 0; i < 4; i++) { const o = [0, 0, 0]; ps.transform(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], o); v.push(o); } quads.push(v); },
  };
  const bad = [];
  for (const face of [0, 1, 2, 3, 4, 5]) {
    const w = new ItemFrame(level, 'item_frame', 0, 100, 0, face);
    w.item = ItemStack.of('stick');
    quads.length = 0; itemAt.length = 0;
    R.render(b, w, w.x, w.y, w.z);
    // every vertex within the block, the back plate's side against the face it hangs on
    const DXs = [0, 0, 0, 0, -1, 1], DYs = [-1, 1, 0, 0, 0, 0], DZs = [0, 0, -1, 1, 0, 0];
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const q of quads) for (const v of q) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); }
    const wall = [-DXs[face], -DYs[face] + 0, -DZs[face]];
    const axis = wall.findIndex((c) => c !== 0);
    const lo = [0, 100, 0], hi = [1, 101, 1];
    const against = wall[axis] < 0 ? Math.abs(mn[axis] - lo[axis]) < 1e-6 && Math.abs(mx[axis] - (lo[axis] + 1 / 16)) < 1e-6 : Math.abs(mx[axis] - hi[axis]) < 1e-6 && Math.abs(mn[axis] - (hi[axis] - 1 / 16)) < 1e-6;
    const it = itemAt[0];
    const itemOk = it && it.ctx === 'fixed' && Math.abs(it.o[axis] - (wall[axis] < 0 ? lo[axis] + 1 / 16 : hi[axis] - 1 / 16)) < 1e-6;
    if (!against || !itemOk) bad.push(`face ${face}: [${mn.map((x) => x.toFixed(3))}]..[${mx.map((x) => x.toFixed(3))}] item ${it?.o.map((x) => x.toFixed(3))}`);
  }
  check('drawn: the frame against what it hangs on, the item just in front of the back', bad.length === 0, bad.join('; '));
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
