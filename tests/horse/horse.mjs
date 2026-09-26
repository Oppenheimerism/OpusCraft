// Headless checks for horses, donkeys and mules (node tests/horse/horse.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 400000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/entity/horse.ts', '/src/world/gen/biomes.ts',
  '/src/render/horseRenderer.ts', '/src/textures/mobs.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, H, biomes, hr, mobs] = mods;
const { ItemStack } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/** flat grass at y=63 (standing at 64) over stone */
function makeLevel({ biome = 'plains' } = {}) {
  const world = new worldMod.World();
  for (let cx = -5; cx <= 5; cx++) for (let cz = -5; cz <= 5; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const st = S('stone'), gs = S('grass_block');
  for (let x = -80; x <= 80; x++) for (let z = -80; z <= 80; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 55; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = 6000;
  level.difficulty = 'normal';
  return { world, level, sounds };
}
const mobAt = (level, type, x, y, z, group) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg', group); level.addEntity(m); return m; };
function playerAt(level, x, y, z, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.gameMode = mode;
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const hold = (p, id, n = 64) => p.inventory.setSelectedItem(id ? ItemStack.of(id, n) : null);
const settle = (level, n = 20) => { for (let i = 0; i < n; i++) level.tick(); };
const tame = (h, p) => { h.tameWithName(p); return h; };

// --- registered
{
  const ok = ['horse', 'donkey', 'mule'].every((t) => !!spawner.MOB_TYPES[t] && !!itemMod.ITEMS.get(t + '_spawn_egg'));
  check('horse, donkey and mule registered, with spawn eggs and names', ok && spawner.entityDisplayName('horse') === 'Horse' && spawner.entityDisplayName('donkey') === 'Donkey' && spawner.entityDisplayName('mule') === 'Mule');
}

// --- sizes: vanilla EntityType (horse and mule 1.3964844 x 1.6, donkey x 1.5), eyes at 0.95; a foal half a horse
{
  const { level } = makeLevel();
  const h = mobAt(level, 'horse', 0, 64, 0), d = mobAt(level, 'donkey', 4, 64, 0), m = mobAt(level, 'mule', 8, 64, 0);
  check('horse 1.3964844 x 1.6, eyes at 1.52', near(h.width, 1.3964844) && near(h.height, 1.6) && near(h.eyeHeight, 1.52));
  check('donkey 1.3964844 x 1.5, eyes at 1.425', near(d.width, 1.3964844) && near(d.height, 1.5) && near(d.eyeHeight, 1.425), `${d.width} x ${d.height}`);
  check('mule 1.3964844 x 1.6', near(m.width, 1.3964844) && near(m.height, 1.6));
  for (const t of ['horse', 'donkey', 'mule']) {
    const b = spawner.createMob(t, level);
    b.setAge(-24000);
    b.refreshSize();
    // (vanilla AbstractChestedHorse.babyDimensions: a donkey's or mule's foal is half its own kind)
    const hh = t === 'donkey' ? 0.75 : 0.8;
    check(`a ${t} foal is half its kind (0.698 x ${hh})`, near(b.width, 0.6982422) && near(b.height, hh), `${b.width} x ${b.height}`);
  }
  check('the seat: horse 1.44375, donkey 1.1125, mule 1.2125', near(h.passengerAttachmentY(h), 1.44375) && near(d.passengerAttachmentY(d), 1.1125) && near(m.passengerAttachmentY(m), 1.2125));
}

// --- spawning: rolled strengths; a herd shares a coat
{
  const { level } = makeLevel();
  let hOk = true, sOk = true, jOk = true;
  const coats = new Set(), marks = new Set();
  for (let i = 0; i < 300; i++) {
    const h = spawner.createMob('horse', level);
    h.moveTo(0.5, 64, 0.5, 0, 0);
    h.finalizeSpawn('natural', {});
    if (h.maxHealth < 15 || h.maxHealth > 30 || h.health !== h.maxHealth) hOk = false;
    if (h.moveSpeedAttr < 0.1125 - 1e-9 || h.moveSpeedAttr > 0.3375 + 1e-9) sOk = false;
    if (h.jumpStrength < 0.4 || h.jumpStrength > 1.0) jOk = false;
    coats.add(h.color);
    marks.add(h.markings);
  }
  check('health 15-30, speed 0.1125-0.3375, jump 0.4-1.0', hOk && sOk && jOk);
  check('all seven coats and five markings come up', coats.size === 7 && marks.size === 5, `${coats.size} ${marks.size}`);
  const g = {};
  const herd = Array.from({ length: 4 }, () => { const h = spawner.createMob('horse', level); h.moveTo(0.5, 64, 0.5, 0, 0); h.finalizeSpawn('natural', g); return h.color; });
  check('a herd shares one coat', new Set(herd).size === 1);
  const d = spawner.createMob('donkey', level);
  d.moveTo(0.5, 64, 0.5, 0, 0);
  d.finalizeSpawn('natural', {});
  check('a donkey: speed 0.175, jump 0.5', near(d.moveSpeedAttr, 0.175) && near(d.jumpStrength, 0.5));
}

// --- taming: a wild one bucks you off, or takes to you; food sweetens its temper
{
  const { level } = makeLevel();
  const p = playerAt(level, 3, 64, 3);
  const h = mobAt(level, 'horse', 0, 64, 0);
  hold(p, null);
  h.interact(p, null);
  check('empty-handed, you climb on a wild horse', p.vehicle === h);
  h.temper = 99;
  let tamed = false;
  for (let i = 0; i < 600 && !tamed; i++) { level.tick(); tamed = h.tamed; }
  check('ridden long enough, a willing one is tamed', tamed && h.ownerUUID === p.uuid);
  const w = mobAt(level, 'horse', 10, 64, 0);
  p.stopRiding?.();
  w.temper = 0;
  w.interact(p, null);
  let thrown = false;
  for (let i = 0; i < 600 && !thrown; i++) { level.tick(); thrown = p.vehicle !== w; }
  check('an unwilling one throws you off, a little more willing', thrown && !w.tamed && w.temper === 5, `temper ${w.temper}`);
  const f = mobAt(level, 'horse', 20, 64, 0);
  hold(p, 'wheat');
  f.interact(p, p.inventory.selectedItem);
  check('wheat sweetens a wild one\'s temper by 3', f.temper === 3 && p.inventory.selectedItem.count === 63, String(f.temper));
  hold(p, 'stick');
  const was = f.standing;
  f.interact(p, p.inventory.selectedItem);
  check('anything else, and it rears', !was && f.standing);
}

// --- eating: it heals, the mouth opens
{
  const { level, sounds } = makeLevel();
  const p = playerAt(level, 3, 64, 3);
  const h = tame(mobAt(level, 'horse', 0, 64, 0), p);
  h.health = h.maxHealth - 5;
  hold(p, 'apple');
  h.interact(p, p.inventory.selectedItem);
  check('an apple heals 3', near(h.health, h.maxHealth - 2) && sounds.includes('entity.horse.eat'));
  settle(level, 3);
  check('the mouth opens as it eats', h.mouthAnim > 0.9 && h.mouthAnimAt(0.5) > 0.9);
  settle(level, 40);
  check('and closes again', h.mouthAnim === 0);
  h.setEating(true);
  settle(level, 4);
  check('grazing, the head goes down', h.eatAnimAt(1) > 0.9);
}

// --- saddle and armour; a donkey's chest
{
  const { level } = makeLevel();
  const p = playerAt(level, 3, 64, 3);
  const h = tame(mobAt(level, 'horse', 0, 64, 0), p);
  hold(p, 'saddle', 1);
  h.interact(p, p.inventory.selectedItem);
  check('a saddle goes on a tame horse', h.saddled && !p.inventory.selectedItem);
  hold(p, 'diamond_horse_armor', 1);
  h.interact(p, p.inventory.selectedItem);
  check('diamond armour: 11 armour points', h.bodyArmor()?.item.id === 'diamond_horse_armor' && h.armorValue() === 11);
  const d = tame(mobAt(level, 'donkey', 5, 64, 0), p);
  hold(p, 'iron_horse_armor', 1);
  d.interact(p, p.inventory.selectedItem);
  check('a donkey wears no armour', !d.bodyArmor());
  p.stopRiding?.();
  hold(p, 'chest', 1);
  d.interact(p, p.inventory.selectedItem);
  check('a chest goes on a tame donkey (17 slots)', d.hasChest && d.inventory.size === 17);
  d.inventory.set(5, ItemStack.of('cobblestone', 10));
  const before = level.entities.filter((e) => e.type === 'item').length;
  d.die('generic');
  const drops = level.entities.filter((e) => e.type === 'item').map((e) => e.stack?.item.id);
  check('dying, it drops the chest and what was in it', drops.includes('chest') && drops.includes('cobblestone'), drops.join(','));
  void before;
}

// --- breeding: horse and donkey make a mule; a mule can't breed
{
  const { level } = makeLevel();
  const h = new H.Horse(level), d = new H.Donkey(level), m = new H.Mule(level), h2 = new H.Horse(level);
  check('a horse and a donkey make a mule', h.makeBaby(d) instanceof H.Mule && d.makeBaby(h) instanceof H.Mule);
  check('two horses make a horse, two donkeys a donkey', h.makeBaby(h2) instanceof H.Horse && d.makeBaby(new H.Donkey(level)) instanceof H.Donkey);
  check('a mule can\'t mate', !m.canMate(h));
}

// --- saving
{
  const { level } = makeLevel();
  const p = playerAt(level, 3, 64, 3);
  const h = tame(mobAt(level, 'horse', 0, 64, 0), p);
  h.color = 'gray';
  h.markings = 'white_dots';
  h.equipSaddle(ItemStack.of('saddle'), false);
  h.setArmor(ItemStack.of('golden_horse_armor'));
  h.jumpStrength = 0.91;
  const data = h.save();
  const back = spawner.createMob('horse', level);
  back.load(data);
  check('saved and loaded: coat, markings, tame, saddle, armour, jump', back.color === 'gray' && back.markings === 'white_dots' && back.tamed && back.saddled && back.bodyArmor()?.item.id === 'golden_horse_armor' && near(back.jumpStrength, 0.91));
  const d = tame(mobAt(level, 'donkey', 5, 64, 0), p);
  d.hasChest = true;
  const db = spawner.createMob('donkey', level);
  db.load(d.save());
  check('a donkey keeps its chest, and its height', db.hasChest && near(db.height, 1.5));
}

// --- riding: jumps as charged; falls hurt from past six blocks, at half
{
  const { level } = makeLevel();
  const p = playerAt(level, 3, 64, 3);
  const h = tame(mobAt(level, 'horse', 0, 64, 0), p);
  h.equipSaddle(ItemStack.of('saddle'), false);
  hold(p, null);
  h.interact(p, null);
  check('climbing on a saddled one, you hold the reins', p.vehicle === h && h.controllingPassenger() === p);
  h.jumpStrength = 0.7;
  h.onPlayerJump(100);
  check('a full charge: the whole jump', near(h.playerJumpPendingScale, 1));
  h.onPlayerJump(45);
  check('half a charge: 0.4 + 0.4 x 45/90', near(h.playerJumpPendingScale, 0.6));
  h.onGround = true;
  h.onPlayerJump(100);
  let peak = h.y;
  for (let i = 0; i < 40; i++) { level.tick(); peak = Math.max(peak, h.y); }
  check('it leaps (jump strength 0.7: over a block)', peak - 64 > 1.0, (peak - 64).toFixed(2));
  const q = tame(mobAt(level, 'horse', 20, 64, 20), p);
  const hp = q.health;
  q.causeFallDamage(10);
  check('a ten-block fall: 2 damage', near(q.health, hp - 2), String(hp - q.health));
}

// --- the rider's charged jump: hold to charge, let go to leap; no flying off it in creative
{
  const { level } = makeLevel();
  const p = playerAt(level, 3, 64, 3, 'creative');
  const h = tame(mobAt(level, 'horse', 0, 64, 0), p);
  hold(p, null);
  h.interact(p, null);
  check('no saddle, no jump bar', p.vehicle === h && p.jumpableVehicle() === null);
  p.stopRiding();
  h.equipSaddle(ItemStack.of('saddle'), false);
  settle(level, 5);
  h.interact(p, null);
  settle(level, 5);
  check('saddled, it leaps for you', p.jumpableVehicle() === h);
  h.jumpStrength = 0.7;
  p.input.jump = true;
  for (let i = 0; i < 6; i++) level.tick();
  check('held five ticks past the press: half a charge', near(p.jumpRidingScale, 0.5, 1e-9), String(p.jumpRidingScale));
  for (let i = 0; i < 7; i++) level.tick();
  check('held twelve: easing back (0.8 + 2/3 of 0.1)', near(p.jumpRidingScale, 0.8 + (2 / 3) * 0.1, 1e-9), String(p.jumpRidingScale));
  p.input.jump = false;
  const y0 = h.y;
  let peak = h.y;
  level.tick();
  check('letting go: the leap waits, the bar rests', p.jumpRidingTicks === -10 && near(h.playerJumpPendingScale, 0.4 + (0.4 * 86) / 90, 1e-9) || h.y > y0, `${p.jumpRidingTicks} ${h.playerJumpPendingScale}`);
  for (let i = 0; i < 30; i++) { level.tick(); peak = Math.max(peak, h.y); }
  check('and it leaps', peak - y0 > 1, (peak - y0).toFixed(2));
  check('not flying after all that jumping', !p.flying);
  // double-tapping jump in creative on horseback doesn't take off
  for (const j of [true, false, true, false]) { p.input.jump = j; level.tick(); }
  check('double-tapping jump on horseback: still riding, not flying', p.vehicle === h && !p.flying);
  p.input.forward = true;
  const x0 = h.x, z0 = h.z;
  for (let i = 0; i < 40; i++) level.tick();
  p.input.forward = false;
  check('forward: it goes where you look', Math.hypot(h.x - x0, h.z - z0) > 3, Math.hypot(h.x - x0, h.z - z0).toFixed(2));
}

// --- the model: rest, grazing, rearing; a foal's legs; the tack
{
  const def = hr.horseModel();
  const a = { limbSwing: 0, limbAmount: 0, age: 0, headYaw: 0, headPitch: 0 };
  const fake = (o = {}) => ({ eatAnimAt: () => 0, standAnimAt: () => 0, mouthAnimAt: () => 0, inWater: false, tailCounter: 0, isBaby: () => false, saddled: false, isVehicle: () => false, ...o });
  hr.animateHorse(def.root, fake(), a, 0);
  const neck = def.root.child('head_parts');
  check('at rest the neck leans 30 degrees forward, at (0, 4, -12)', near(neck.xRot, Math.PI / 6) && near(neck.y, 4) && near(neck.z, -12));
  check('the forelegs stand at y 14, z -10', near(def.root.child('left_front_leg').y, 14) && near(def.root.child('left_front_leg').z, -10));
  hr.animateHorse(def.root, fake({ eatAnimAt: () => 1 }), a, 0);
  check('grazing, the head goes right down', near(neck.xRot, 2.1816616, 1e-3) && near(neck.y, 11) && near(neck.z, -12));
  hr.animateHorse(def.root, fake({ standAnimAt: () => 1 }), a, 0);
  check('rearing, the body tips back 45 degrees, forelegs up', near(def.root.child('body').xRot, -Math.PI / 4) && def.root.child('left_front_leg').xRot < -0.5);
  hr.animateHorse(def.root, fake({ isBaby: () => true }), a, 0);
  check('a foal stands on its long legs', !def.root.child('left_front_leg').visible && def.root.child('left_front_baby_leg').visible);
  hr.animateHorse(def.root, fake({ saddled: true }), a, 0);
  check('saddled: the saddle and bridle, no reins till ridden', def.root.child('body').child('saddle').visible && neck.child('head_saddle').visible && !neck.child('left_saddle_line').visible);
  hr.animateHorse(def.root, fake({ saddled: true, isVehicle: () => true }), a, 0);
  check('ridden: the reins', neck.child('left_saddle_line').visible && neck.child('right_saddle_line').visible);
  const chested = hr.horseModel(0, true);
  check('the donkey\'s model has the chests and long ears', chested.root.child('body').children.has('left_chest') && chested.root.child('head_parts').child('head').child('left_ear').cubes[0].h === 7);
}

// --- textures: every coat, marking and armour; markings and armour leave the rest clear
{
  const names = ['white', 'creamy', 'chestnut', 'brown', 'black', 'gray', 'dark_brown'].map((c) => 'horse_' + c)
    .concat(['donkey', 'mule'], ['white', 'white_field', 'white_dots', 'black_dots'].map((m) => 'horse_markings_' + m), ['leather', 'iron', 'gold', 'diamond'].map((m) => 'horse_armor_' + m));
  const alpha = (t, x, y) => t.data[(y * t.w + x) * 4 + 3];
  let ok = true;
  for (const n of names) {
    const f = mobs.MOB_TEXTURES[n];
    const t = f?.();
    if (!t || t.w !== 64 || t.h !== 64) { ok = false; console.log('  missing', n); }
  }
  check('all 17 textures, 64 x 64', ok);
  const coat = mobs.MOB_TEXTURES.horse_brown();
  check('a coat has its saddle (26,9) and body (0,54)', alpha(coat, 30, 12) === 255 && alpha(coat, 5, 58) === 255);
  const mk = mobs.MOB_TEXTURES.horse_markings_white();
  let opaque = 0;
  for (let i = 3; i < mk.data.length; i += 4) if (mk.data[i]) opaque++;
  check('markings cover only a little of the sheet', opaque > 20 && opaque < 64 * 64 * 0.2, String(opaque));
  const ar = mobs.MOB_TEXTURES.horse_armor_iron();
  check('armour: none on the mane or tail, some on the body', alpha(ar, 57, 40) === 0 && alpha(ar, 44, 45) === 0 && alpha(ar, 5, 56) === 255);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
