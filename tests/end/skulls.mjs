// Mob heads (headless): node tests/end/skulls.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/dimension.ts', '/src/game/level.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/game/interaction.ts', '/src/game/explosion.ts', '/src/entity/itemEntity.ts',
  '/src/world/blocksSkulls.ts', '/src/world/skullBlockEntity.ts', '/src/game/endPortal.ts', '/src/game/blockRules.ts', '/src/world/blockEntity.ts',
  '/src/item/equipment.ts', '/src/item/enchantments.ts', '/src/entity/monsters.ts', '/src/game/spawner.ts', '/src/game/redstone/dispenser.ts',
  '/src/game/redstone/dispenseItems.ts', '/src/game/redstone/piston.ts', '/src/render/skullRenderer.ts', '/src/render/armorLayer.ts', '/src/gui/itemIcons.ts',
  '/src/render/itemRenderer.ts', '/src/render/entityRenderer.ts', '/src/game/skulls.ts',
]);
const m = {};
for (const mod of mods) Object.assign(m, mod);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const { S, ItemStack, ITEMS, getBlock } = m;
const name = (st) => m.BLOCKS[m.STATE_BLOCK[st]].name;
const HEADS = ['skeleton_skull', 'wither_skeleton_skull', 'player_head', 'zombie_head', 'creeper_head', 'piglin_head', 'dragon_head'];
const WALLS = ['skeleton_wall_skull', 'wither_skeleton_wall_skull', 'player_wall_head', 'zombie_wall_head', 'creeper_wall_head', 'piglin_wall_head', 'dragon_wall_head'];

// --- registration
check('fourteen blocks, seven items (the wall ones none of their own)', [...HEADS, ...WALLS].every((n) => getBlock(n)) && HEADS.every((n) => ITEMS.has(n)) && !WALLS.some((n) => ITEMS.has(n)));
check('names', ITEMS.get('wither_skeleton_skull').name === 'Wither Skeleton Skull' && ITEMS.get('dragon_head').name === 'Dragon Head', ITEMS.get('wither_skeleton_skull').name);
check('uncommon, the dragon\'s epic; functional blocks', HEADS.every((n) => ITEMS.get(n).rarity === (n === 'dragon_head' ? 'epic' : 'uncommon') && ITEMS.get(n).creativeTab === 'functional'));
check('strength 1, stone sounds', HEADS.every((n) => getBlock(n).hardness === 1 && getBlock(n).sound === 'stone'));
check('a wall head gives its floor head\'s item', m.itemForBlock?.('dragon_wall_head')?.id === 'dragon_head' || getBlock('dragon_wall_head').s.item === 'dragon_head');
check('worn on the head, enchantable as equipment, vanishable', HEADS.every((n) => m.equipableSlot(ITEMS.get(n)) === 'head' && m.ENCHANTABLE.equippable(ITEMS.get(n)) && m.ENCHANTABLE.vanishing(ITEMS.get(n))) && !m.ENCHANTABLE.durability(ITEMS.get('zombie_head')));
check('equip sound: the generic one', m.equipSound(ITEMS.get('creeper_head')) === 'item.armor.equip_generic');
check('pistons break them', [...HEADS, ...WALLS].every((n) => m.pushReaction(getBlock(n).defaultState) === 'destroy'));
check('shapes: 8x8x8 on the floor, the piglin\'s 10 across; on a wall against it', (() => {
  const f = m.COLLISION[getBlock('zombie_head').defaultState][0], pg = m.COLLISION[getBlock('piglin_head').defaultState][0];
  const w = m.COLLISION[getBlock('zombie_wall_head').state({ facing: 'north' })][0];
  return f.join() === [0.25, 0, 0.25, 0.75, 0.5, 0.75].join() && pg.join() === [3 / 16, 0, 3 / 16, 13 / 16, 0.5, 13 / 16].join() && w.join() === [0.25, 0.25, 0.5, 0.75, 0.75, 1].join();
})());
check('a block entity for each, saved as "skull"', [...HEADS, ...WALLS].every((n) => m.createBlockEntity(n, 0, 0, 0) instanceof m.SkullBlockEntity) && m.createBlockEntity('skull', 0, 0, 0) instanceof m.SkullBlockEntity);

// --- a world
const world = new m.World();
world.reset(m.OVERWORLD);
for (let cx = -3; cx <= 2; cx++) for (let cz = -3; cz <= 2; cz++) { const c = new m.Chunk(cx, cz); world.chunks.set(c.key, c); }
for (let x = -30; x < 30; x++) for (let z = -30; z < 30; z++) world.setState(x, 59, z, S('stone'));
world.setState(0, 60, 0, S('stone'));
world.setState(0, 61, 0, S('stone'));
const level = new m.Level(world, '42');
const log = { sounds: [] };
level.sound = { play: (n, x, y, z, v, p) => log.sounds.push({ n, x, y, z, v, p }), playUI: () => {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn() {}, emitAround() {}, poof() {}, blockParticle() {}, dust() {} };
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };
const player = new m.Player(level);
player.moveTo(0.5, 60, 3.5, 180, 0);
level.player = player;
level.addEntity(player);
player.gameMode = 'survival';
const inter = new m.Interaction(level, player);
const EYE = 1.62;
const aim = (x, y, z) => {
  const ex = player.x, ey = player.y + EYE, ez = player.z;
  const dx = x - ex, dy = y - ey, dz = z - ez;
  const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  player.yaw = yaw; player.pitch = pitch;
  inter.pick(ex, ey, ez, yaw, pitch);
};
const hold = (s) => { player.inventory.main[0] = s; player.inventory.selected = 0; };
const use = () => { inter.rightClickDelay = 0; inter.use(true, false); };
const drops = (id) => level.entities.filter((e) => e instanceof m.ItemEntity && !e.removed && (!id || e.stack.item.id === id));
const clearDrops = () => { for (const e of level.entities) if (e instanceof m.ItemEntity) e.remove(); tick(); };

// on the floor, looking north at it from the south: turned to face the player
hold(ItemStack.of('dragon_head'));
aim(0.5, 60, 2.5);
use();
let st = world.getState(0, 60, 2);
check('placed on the floor, turned to face whoever put it there (rotation 8 looking north)', name(st) === 'dragon_head' && getBlock('dragon_head').get(st, 'rotation') === 8, `${name(st)} ${getBlock('dragon_head').get(st, 'rotation')}`);
check('one spent', !player.inventory.main[0] || player.inventory.main[0].count === 0);
check('the place sound: stone\'s', log.sounds.some((s) => s.n === 'block.stone.place'));
check('with its block entity', world.getBlockEntity(0, 60, 2) instanceof m.SkullBlockEntity);
// sixteenths: a yaw of 30 gives rotation 1 (30*16/360 = 1.33)
check('rotation to the nearest sixteenth', m.skullRotation(30) === 1 && m.skullRotation(34) === 2 && m.skullRotation(-90) === 12 && m.skullRotation(359) === 0);
// on the pillar's south face: a wall head facing south
hold(ItemStack.of('skeleton_skull'));
aim(0.5, 61.5, 1.0);
use();
st = world.getState(0, 61, 1);
check('on a wall: facing out from it', name(st) === 'skeleton_wall_skull' && getBlock('skeleton_wall_skull').get(st, 'facing') === 'south', name(st));
// looking at the top of the pillar from the side: on top, the floor head
hold(ItemStack.of('creeper_head'));
player.moveTo(0.5, 61, 4.5, 180, 0);
aim(0.5, 62, 0.5);
use();
st = world.getState(0, 62, 0);
check('on the top of a block: the floor head', name(st) === 'creeper_head', name(st));
// clicking the side of the floor's hole... in the open, looking down past a block's side: the wall comes first
hold(ItemStack.of('zombie_head'));
player.moveTo(3.5, 60, 3.5, 180, 0);
world.setState(3, 60, 0, S('stone'));
aim(3.5, 60.5, 1.0);
use();
st = world.getState(3, 60, 1);
check('a click on a wall low down: on the wall', name(st) === 'zombie_wall_head' && getBlock('zombie_wall_head').get(st, 'facing') === 'south', name(st));

// --- redstone: a powered dragon's head works its jaw, a skeleton's does nothing
const head = world.getBlockEntity(0, 60, 2);
tick(5);
check('unpowered: still', head.animationTickCount === 0 && !getBlock('dragon_head').get(world.getState(0, 60, 2), 'powered'));
level.setBlock(1, 60, 2, S('redstone_block'));
tick(1);
check('a redstone block beside it: powered', getBlock('dragon_head').get(world.getState(0, 60, 2), 'powered') === true);
tick(10);
const n10 = head.animationTickCount;
check('its count runs while powered', n10 >= 10 && n10 <= 11 && head.isAnimating, `${n10}`);
check('the animation between ticks', Math.abs(head.getAnimation(0.5) - (n10 + 0.5)) < 1e-9);
level.setBlock(1, 60, 2, 0);
tick(5);
check('the power gone: it stops where it was (the jaw stays as it was left)', !getBlock('dragon_head').get(world.getState(0, 60, 2), 'powered') && head.animationTickCount === n10 && head.getAnimation(0.5) === n10);
level.setBlock(1, 61, 1, S('redstone_block'));
tick(5);
const sk = world.getBlockEntity(0, 61, 1);
check('a skeleton skull powered: marked powered, but it doesn\'t count', getBlock('skeleton_wall_skull').get(world.getState(0, 61, 1), 'powered') === true && sk.animationTickCount === 0);
level.setBlock(1, 61, 1, 0);
// placed beside power: powered from the start
level.setBlock(6, 60, 6, S('redstone_block'));
hold(ItemStack.of('piglin_head'));
player.moveTo(5.5, 60, 9.5, 180, 0);
aim(5.5, 60, 6.5);
use();
st = world.getState(5, 60, 6);
check('placed beside power: powered at once', name(st) === 'piglin_head' && getBlock('piglin_head').get(st, 'powered') === true, name(st));
tick(3);
check('a piglin\'s head counts too (its ears)', world.getBlockEntity(5, 60, 6).animationTickCount >= 3);

// --- drops: its item, with the name it was given; nothing in creative
clearDrops();
{
  const named = ItemStack.of('wither_skeleton_skull');
  named.tag = { customName: 'Yorick' };
  hold(named);
  player.moveTo(8.5, 60, 9.5, 180, 0);
  aim(8.5, 60, 6.5);
  use();
  const be = world.getBlockEntity(8, 60, 6);
  check('placed from a named item: the block entity keeps the name', be?.customName === 'Yorick', be?.customName);
  const saved = be.save();
  const back = m.loadBlockEntity(saved);
  check('saved as "skull" with its name, and loaded back', saved.id === 'skull' && back instanceof m.SkullBlockEntity && back.customName === 'Yorick');
  level.destroyBlock(8, 60, 6, true);
  const d = drops('wither_skeleton_skull');
  check('broken: it drops, still named', d.length === 1 && d[0].stack.tag?.customName === 'Yorick', JSON.stringify(d.map((e) => e.stack.tag)));
  clearDrops();
  level.destroyBlock(3, 60, 1, true);
  check('a wall head drops its floor head\'s item', drops('zombie_head').length === 1 && drops().length === 1);
  clearDrops();
  // no tool needed: by hand it drops
  const hand = m.blockDrops(getBlock('dragon_wall_head').state({ facing: 'north' }), null, level.random);
  check('by hand too', hand.length === 1 && hand[0].item.id === 'dragon_head');
}

// --- worn: a disguise, and dispensers put heads on
{
  const zombie = m.createMob('zombie', level), skeleton = m.createMob('skeleton', level);
  player.inventory.armor[3] = ItemStack.of('zombie_head');
  check('wearing a zombie\'s head: zombies notice you at half the distance, skeletons as ever', player.visibilityPercent(zombie) === 0.5 && player.visibilityPercent(skeleton) === 1);
  player.inventory.armor[3] = ItemStack.of('skeleton_skull');
  check('a skeleton skull fools skeletons', player.visibilityPercent(skeleton) === 0.5 && player.visibilityPercent(zombie) === 1);
  player.inventory.armor[3] = ItemStack.of('piglin_head');
  const brute = m.createMob('piglin_brute', level);
  check('a piglin head fools piglin brutes too', !brute || player.visibilityPercent(brute) === 0.5);
  player.inventory.armor[3] = null;
  // a dispenser facing east with a head, a zombie in front
  level.setBlock(12, 60, 12, getBlock('dispenser').state({ facing: 'east' }));
  const dbe = world.getBlockEntity(12, 60, 12);
  dbe.container.set(0, ItemStack.of('creeper_head'));
  zombie.moveTo(13.5, 60, 12.5, 0, 0);
  zombie.canPickUpLoot = true;
  zombie.armorItems[3] = null;
  level.addEntity(zombie);
  log.sounds.length = 0;
  level.setBlock(11, 60, 12, S('redstone_block'));
  tick(6);
  level.setBlock(11, 60, 12, 0);
  tick(1);
  check('a dispenser puts the head on the zombie in front', zombie.armorItems[3]?.item.id === 'creeper_head' && !dbe.container.get(0), zombie.armorItems[3]?.item.id);
  dbe.container.set(0, ItemStack.of('creeper_head'));
  log.sounds.length = 0;
  level.setBlock(11, 60, 12, S('redstone_block'));
  tick(6);
  level.setBlock(11, 60, 12, 0);
  tick(1);
  check('nobody to take it: the failed click, and it keeps the head', log.sounds.some((s) => s.n === 'block.dispenser.fail') && dbe.container.get(0)?.count === 1 && drops('creeper_head').length === 0);
  zombie.remove();
}

// --- a charged creeper's blast takes one head off
{
  const run = (charged, kinds) => {
    clearDrops();
    const mobs = kinds.map((k, i) => {
      const e = m.createMob(k, level);
      e.moveTo(20.5 + i * 0.3, 60, 20.5, 0, 0);
      e.health = 1;
      level.addEntity(e);
      return e;
    });
    const c = m.createMob('creeper', level);
    c.moveTo(21, 60, 21, 0, 0);
    c.powered = charged;
    level.addEntity(c);
    m.explode(level, c, c.x, c.y, c.z, 3 * (charged ? 2 : 1), false, 'mob');
    c.remove();
    tick(1);
    return mobs;
  };
  const heads = () => drops().filter((e) => m.isSkullItem(e.stack.item.id)).map((e) => e.stack.item.id);
  run(true, ['zombie']);
  check('a charged creeper kills a zombie: its head drops', heads().join() === 'zombie_head', heads().join());
  run(false, ['zombie']);
  check('an ordinary one: no head', heads().length === 0);
  run(true, ['skeleton', 'creeper', 'zombie']);
  check('three killed by one blast: one head only', heads().length === 1, heads().join());
  run(true, ['wither_skeleton']);
  check('a wither skeleton: its skull', heads().join() === 'wither_skeleton_skull', heads().join());
  run(true, ['piglin']);
  check('a piglin: its head', heads().join() === 'piglin_head', heads().join());
  run(true, ['stray']);
  check('a stray: none', heads().length === 0, heads().join());
  clearDrops();
}

// --- a piston breaks one
{
  level.setBlock(15, 60, 0, getBlock('piston').state({ facing: 'east' }));
  level.setBlock(16, 60, 0, getBlock('skeleton_skull').state({ rotation: 4 }));
  level.setBlock(14, 60, 0, S('redstone_block'));
  tick(3);
  check('a piston breaks a head, which drops', name(world.getState(16, 60, 0)) === 'piston_head' && drops('skeleton_skull').length === 1);
}

// --- drawn: the geometry the renderer sends (captured on the CPU)
{
  const R = new m.SkullRenderer(null);
  R.skin = (t) => ({ tex: t, w: t === 'dragon' ? 256 : ['skeleton', 'wither_skeleton', 'creeper'].includes(t) ? 64 : 64, h: t === 'dragon' ? 256 : ['skeleton', 'wither_skeleton', 'creeper'].includes(t) ? 32 : 64 });
  const capture = (fn) => {
    const out = [];
    const b = {
      lightS: 0, lightB: 0, light0: [0, 1, 0], light1: [0, 1, 0], tex: null, setOverlay() {}, flush() {},
      begin(s) { this.tex = s.texture; this.state = s; },
      quad(ps, p, uv, nx, ny, nz) {
        const v = [];
        for (let i = 0; i < 4; i++) { const o = [0, 0, 0]; ps.transform(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], o); v.push(o); }
        const n = [0, 0, 0];
        ps.transformNormal(nx, ny, nz, n);
        out.push({ v, n, tex: this.tex, uv, state: this.state });
      },
    };
    fn(b);
    return out;
  };
  const bounds = (qs) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const q of qs) for (const v of q.v) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); }
    return [mn, mx];
  };
  const near = (a, b, e = 1e-4) => a.every((x, i) => Math.abs(x - b[i]) < e);
  const pose = new m.PoseStack();
  const one = (type, facing, yRot, anim = 0) => capture((b) => { pose.reset(); R.renderSkull(b, pose, facing, yRot, anim, type); });
  let [mn, mx] = bounds(one('zombie', null, 0));
  check('a floor head: 8 pixels a side, in the middle of the block, on its floor (the hat a quarter pixel out)', near(mn, [0.25 - 1 / 64, 0 - 1 / 64, 0.25 - 1 / 64]) && near(mx, [0.75 + 1 / 64, 0.5 + 1 / 64, 0.75 + 1 / 64]), `${mn} ${mx}`);
  // the face: the quad showing (8..16, 8..16) of the 64-wide skin faces north at rotation 0, south at 8
  const face = (qs) => qs.find((q) => q.tex === 'skeleton' && Math.min(q.uv[0], q.uv[2], q.uv[4], q.uv[6]) === 8 / 64 && Math.min(q.uv[1], q.uv[3], q.uv[5], q.uv[7]) === 8 / 32);
  const f0 = face(one('skeleton', null, 0)), f8 = face(one('skeleton', null, 180));
  check('rotation 0: the face looks north; 8: south', f0 && f8 && f0.n[2] < -0.99 && f8.n[2] > 0.99, `${f0?.n} ${f8?.n}`);
  // a wall head facing south: against the north side of its block, half a block up, face south
  const wall = one('skeleton', 3, 180);
  [mn, mx] = bounds(wall);
  check('a wall head: against its wall, half a block up, looking out', near(mn, [0.25, 0.25, 0]) && near(mx, [0.75, 0.75, 0.5]) && face(wall).n[2] > 0.99, `${mn} ${mx}`);
  // the dragon's jaw: open at a quarter of its cycle, shut at three quarters
  const jawLow = (qs) => Math.min(...qs.filter((q) => q.uv.some((u, i) => i % 2 === 1 && Math.abs(u - 65 / 256) < 1e-9)).flatMap((q) => q.v.map((v) => v[1])));
  const shut = jawLow(one('dragon', null, 0, 7.5)), open = jawLow(one('dragon', null, 0, 2.5)), rest = jawLow(one('dragon', null, 0, 0));
  check('the dragon\'s jaw: open at 2.5, shut at 7.5, a little open at rest', open < rest && rest < shut, `${open.toFixed(3)} ${rest.toFixed(3)} ${shut.toFixed(3)}`);
  [mn, mx] = bounds(one('dragon', null, 0));
  check('the dragon\'s head reaches out past its block (three quarters of the dragon\'s)', mx[2] - mn[2] > 1 && mx[0] - mn[0] > 0.7 && mx[0] - mn[0] < 0.8, `${mn.map((v) => v.toFixed(2))} ${mx.map((v) => v.toFixed(2))}`);
  // the piglin's ears flap with the count
  const ear = (qs) => qs.filter((q) => q.uv.some((u, i) => i % 2 === 0 && Math.abs(u - 51 / 64) < 1e-9)).flatMap((q) => q.v.map((v) => v[0]));
  const e0 = ear(one('piglin', null, 0, 0)), e1 = ear(one('piglin', null, 0, 2.5));
  check('the piglin\'s ears move with the count', e0.length && e0.some((x, i) => Math.abs(x - e1[i]) > 1e-3));
  // the item: drawn by the special renderer in every context, the icon hook for the inventory
  const s = ItemStack.of('creeper_head');
  const rendered = capture((b) => { pose.reset(); m.ItemRenderer.prototype.render.call({ shield: null, trident: null }, b, pose, s, 'ground'); });
  check('the item on the ground: the head, half size', rendered.length === 6 && (() => { const [a, c] = bounds(rendered); return near([c[0] - a[0], c[1] - a[1]], [0.25, 0.25]); })(), `${rendered.length}`);
  check('its y scale on the ground (for the bob)', m.ItemRenderer.prototype.displayScaleY.call({}, s, 'ground') === 0.5);
  const icon = capture((b) => { pose.reset(); pose.scale(16, 16, 16); R.renderIcon(ITEMS.get('dragon_head'), b, pose); });
  [mn, mx] = bounds(icon);
  check('the dragon head\'s icon fits its slot', icon.length > 0 && mn[0] >= -8 && mx[0] <= 8 && mn[1] >= -8 && mx[1] <= 8, `${mn.map((v) => v.toFixed(1))} ${mx.map((v) => v.toFixed(1))}`);
  const icon2 = capture((b) => { pose.reset(); pose.scale(16, 16, 16); R.renderIcon(ITEMS.get('zombie_head'), b, pose); });
  [mn, mx] = bounds(icon2);
  check('a head\'s icon: in the middle of its slot, lit, no lightmap', icon2.length === 12 && Math.abs((mn[0] + mx[0]) / 2) < 0.5 && Math.abs((mn[1] + mx[1]) / 2) < 1 && icon2[0].state.lit && !icon2[0].state.useLightmap, `${mn.map((v) => v.toFixed(1))} ${mx.map((v) => v.toFixed(1))}`);
  check('not a head: the hook passes', !R.renderIcon(ITEMS.get('stone'), { setOverlay() {} }, pose));
  // worn: from the head's pivot, 1.1875 times the size, sitting on it
  const worn = capture((b) => { pose.reset(); R.renderWorn(b, pose, ItemStack.of('skeleton_skull'), 0, false); });
  [mn, mx] = bounds(worn);
  check('worn: 1.1875 times the head, centred over the head\'s pivot, above it (model space: y down)', near([mx[0] - mn[0], mx[1] - mn[1]], [0.59375, 0.59375]) && near([mn[0] + mx[0], mn[2] + mx[2]], [0, 0]) && mx[1] <= 1e-6, `${mn} ${mx}`);
}

await close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
