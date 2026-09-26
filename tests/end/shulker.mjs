// Shulkers and their bullets (headless): node tests/end/shulker.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods: [, blockMod, worldMod, chunkMod, dimMod, levelMod, itemMod, playerMod, synthMod, shMod, bulletMod, spawnerMod, effMod, advMod, progMod, arrowMod, sbeMod, zombieMod, texItems], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/dimension.ts', '/src/game/level.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/audio/synth.ts', '/src/entity/shulker.ts', '/src/entity/shulkerBullet.ts', '/src/game/spawner.ts',
  '/src/entity/effects.ts', '/src/game/advancements.ts', '/src/game/outerEndProgress.ts', '/src/entity/arrow.ts', '/src/world/shulkerBoxEntity.ts',
  '/src/entity/monsters.ts', '/src/textures/items.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const { S } = blockMod;
const { ItemStack, ITEMS } = itemMod;
const { Shulker } = shMod;
const { ShulkerBullet } = bulletMod;
const { MobEffectInstance, MOB_EFFECTS } = effMod;

// --- registration, sounds
check('entity names', spawnerMod.entityDisplayName('shulker') === 'Shulker' && spawnerMod.entityDisplayName('shulker_bullet') === 'Shulker Bullet');
check('summonable', spawnerMod.summonableTypes().includes('shulker'));
check('spawn egg item and texture', ITEMS.get('shulker_spawn_egg')?.creativeTab === 'spawn_eggs' && typeof texItems.ITEM_TEXTURES['shulker_spawn_egg'] === 'function');
{
  const EV = { 'entity.shulker.ambient': 7, 'entity.shulker.hurt': 4, 'entity.shulker.hurt_closed': 5, 'entity.shulker.death': 4, 'entity.shulker.open': 5, 'entity.shulker.close': 5, 'entity.shulker.shoot': 4, 'entity.shulker_bullet.hit': 4, 'entity.shulker_bullet.hurt': 4 };
  const bad = [];
  for (const [n, k] of Object.entries(EV)) {
    const g = synthMod.SOUNDS[n];
    if (!g || g.variants !== k) { bad.push(n + ' missing/takes'); continue; }
    for (let v = 0; v < k; v++) {
      const b = g.generate(v, 44100);
      let pk = 0, fin = true;
      for (const x of b) { if (!Number.isFinite(x)) fin = false; pk = Math.max(pk, Math.abs(x)); }
      if (!fin || pk < 0.3 || b.length < 4000) bad.push(`${n}#${v} (${b.length}, ${pk.toFixed(2)})`);
    }
  }
  check('nine sound events, all their takes render', bad.length === 0, bad.join('; '));
}

// --- a world: a stone floor at y 59
const world = new worldMod.World();
world.reset(dimMod.OVERWORLD ?? dimMod.THE_END);
for (let cx = -4; cx <= 3; cx++) for (let cz = -4; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
for (let x = -60; x < 60; x++) for (let z = -60; z < 60; z++) world.setState(x, 59, z, S('stone'));
const level = new levelMod.Level(world, '42');
const log = { sounds: [], particles: [] };
level.sound = { play: (n, x, y, z, v, p) => log.sounds.push({ n, x, y, z, v, p }), playUI: () => {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn: (k, x, y, z) => log.particles.push({ k, x, y, z }) };
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };
const player = new playerMod.Player(level);
player.moveTo(0.5, 60, 40.5, 0, 0);
level.player = player;
level.addEntity(player);
player.gameMode = 'creative';
const heard = (n) => log.sounds.filter((s) => s.n === n).length;
check('createMob makes one', spawnerMod.createMob('shulker', level) instanceof Shulker);

/** its goals stopped (for looking at its shape without it peeking on its own) */
const noAi = (m) => {
  for (const g of [m.goalSelector, m.targetSelector]) g.tick = g.tickRunningGoals = () => {};
  return m;
};
const spawn = (x, y, z) => {
  const s = new Shulker(level);
  s.moveTo(x, y, z);
  s.finalizeSpawn('command');
  level.addEntity(s);
  return s;
};

// --- shape and place
const s = spawn(0.3, 60.2, 0.7);
check('snapped to the middle of its block', s.x === 0.5 && s.y === 60 && s.z === 0.5, `${s.x} ${s.y} ${s.z}`);
check('shut: a block-sized box, 30 health, eyes at 0.5', s.bb.minX === 0 && s.bb.maxX === 1 && s.bb.minY === 60 && s.bb.maxY === 61 && s.health === 30 && s.eyeHeight === 0.5);
check('it clings to the floor', s.attachFace === 0 && s.canStayAt(0, 60, 0, 0));
check('solid to others, not pushed, fire immune, stays when far', s.canBeCollidedWith() && s.fireImmune() && !s.removeWhenFarAway(1e9));
s.dx = 3; s.dy = 3; s.knockback(1, 1, 0);
check('no motion of its own (nothing sets any)', s.dx === 0 && s.dy === 0 && s.dz === 0);
tick(40);
check('it doesn\'t fall or move', s.x === 0.5 && s.y === 60 && s.z === 0.5 && !s.removed);
check('no armour until it first shuts (and 20 once it has)', s.covered ? s.armorValue() === 20 : s.armorValue() === 0, `covered ${s.covered}`);
check('a new one has none', spawn(40.5, 60, 40.5).armorValue() === 0);
// a block overhead leaves no room to open: it moves to another side or away
{
  world.setState(0, 61, 0, S('stone'));
  const where = [s.blockX, s.blockY, s.blockZ].join();
  for (let i = 0; i < 100 && [s.blockX, s.blockY, s.blockZ].join() === where; i++) tick(1);
  check('a block over it (no room to open): it teleports', [s.blockX, s.blockY, s.blockZ].join() !== where && heard('entity.shulker.teleport') >= 1, [s.blockX, s.blockY, s.blockZ, s.attachFace].join());
  world.setState(0, 61, 0, 0);
}
// on a wall: the floor gone, the side it can hold to
{
  const w = noAi(spawn(20.5, 63, 20.5));
  world.setState(20, 63, 19, S('stone'));
  tick(1);
  check('in the air beside a wall it takes hold of the wall', w.attachFace === 2 && w.blockX === 20 && w.blockY === 63 && w.blockZ === 20, `face ${w.attachFace} at ${w.blockX},${w.blockY},${w.blockZ}`);
  check('its box: the block, opening away from the wall (south)', w.bb.minZ === 20 && w.bb.maxZ === 21 && w.bb.minY === 63 && w.bb.maxY === 64);
  w.setRawPeekAmount(100);
  tick(25);
  check('open, it reaches a block out from the wall', Math.abs(w.bb.maxZ - 22) < 1e-6 && w.bb.minZ === 20, `${w.bb.minZ} ${w.bb.maxZ}`);
  world.setState(20, 63, 19, 0);
  const before = [w.blockX, w.blockY, w.blockZ].join();
  let moved = -1;
  for (let i = 0; i < 100 && moved < 0; i++) {
    tick(1);
    if ([w.blockX, w.blockY, w.blockZ].join() !== before) moved = i;
  }
  check('the wall gone: it tries each tick to teleport somewhere it can cling (the floor, or under it)', moved >= 0 && w.canStayAt(w.blockX, w.blockY, w.blockZ, w.attachFace), `after ${moved} ticks: ${[w.blockX, w.blockY, w.blockZ, w.attachFace].join()}`);
  check('teleported: shut again, gliding in from where it was (6 ticks, one gone)', w.isClosed() && w.teleportInterp === 5 && w.oldAttach?.join() === '20,63,20', `${w.teleportInterp} ${w.oldAttach}`);
  const off = w.renderOffset(0), k = (5 / 6) ** 2;
  check('drawn most of the way back toward the old block, easing in', off && Math.abs(off[0] - (20 - w.blockX) * k) < 1e-9 && Math.abs(off[1] - (63 - w.blockY) * k) < 1e-9, JSON.stringify(off));
  tick(5);
  check('and in place after 6 ticks', w.renderOffset(0) === null);
  w.remove();
  // high in the air with nothing within 8 blocks: it stays put
  const f = spawn(-30.5, 90, -30.5);
  tick(3);
  check('floating with nothing to reach: it stays', f.blockY === 90 && !f.removed);
  f.remove();
}
// a ceiling
{
  const c = noAi(spawn(-20.5, 64, -20.5));
  world.setState(-21, 65, -21, S('stone'));
  tick(1);
  check('under a ceiling, it hangs from it', c.attachFace === 1, 'face ' + c.attachFace);
  c.setRawPeekAmount(100);
  tick(25);
  check('open, it reaches down a block', Math.abs(c.bb.minY - 63) < 1e-6 && c.bb.maxY === 65, `${c.bb.minY} ${c.bb.maxY}`);
  world.setState(-21, 65, -21, 0);
  c.remove();
}

// --- peeking
{
  const p = spawn(-10.5, 60, -10.5);
  log.sounds.length = 0;
  let peeked = 0;
  for (let i = 0; i < 1200; i++) { tick(); if (!p.isClosed()) peeked++; }
  const opens = log.sounds.filter((x) => x.n === 'entity.shulker.open' && x.x === p.x && x.z === p.z).length, shuts = log.sounds.filter((x) => x.n === 'entity.shulker.close' && x.x === p.x && x.z === p.z).length;
  check('alone, it peeks now and then (open and shut sounds)', opens >= 3 && shuts >= 3 && peeked > 60, `opens ${opens}, shuts ${shuts}, open ${peeked} ticks`);
  const d = JSON.parse(JSON.stringify(p.save()));
  check('after shutting: 20 armour', p.isClosed() ? p.armorValue() === 20 : true, 'armour ' + p.armorValue());
  noAi(p);
  // peeking height
  p.setRawPeekAmount(30);
  tick(10);
  check('peeking (30): its lid out a fifth of a block', Math.abs(p.bb.maxY - (61 + shMod.physicalPeek(0.3))) < 1e-4 && Math.abs(shMod.physicalPeek(0.3) - 0.2061) < 1e-3, p.bb.maxY.toFixed(4));
  check('open: no armour', p.armorValue() === 0);
  p.setRawPeekAmount(0);
  tick(10);
  check('shut again: 20 armour, a block high', p.armorValue() === 20 && p.bb.maxY === 61);
  void d;
  p.remove();
}

// --- the lid lifts what's on it
{
  const l = noAi(spawn(10.5, 60, 10.5));
  const z = new zombieMod.Zombie(level);
  z.moveTo(10.5, 61, 10.5, 0, 0);
  level.addEntity(z);
  tick(2);
  const y0 = z.y;
  l.setRawPeekAmount(100);
  let maxY = y0;
  for (let i = 0; i < 25; i++) { tick(); maxY = Math.max(maxY, z.y); }
  check('opening, it lifts a zombie standing on it a block', maxY > y0 + 0.9, `${y0.toFixed(2)} → ${maxY.toFixed(2)}`);
  z.remove();
  l.remove();
}

// --- fighting: a survival player in sight
{
  player.gameMode = 'survival';
  player.moveTo(0.5, 60, 8.5, 180, 0);
  player.health = 20;
  // (only this one fights: shulkers left from earlier checks, and their bullets, go first, or one of them may shoot
  // the player before this one has opened)
  for (const e of level.entities) if (e.type === 'shulker' || e instanceof ShulkerBullet) e.remove();
  tick();
  const a = spawn(0.5, 60, 0.5);
  log.sounds.length = 0;
  let bullets = 0, targeted = false, fullyOpen = false, hitAt = -1;
  for (let i = 0; i < 400 && hitAt < 0; i++) {
    tick();
    if (a.target === player) targeted = true;
    if (a.peek === 1) fullyOpen = true;
    bullets = Math.max(bullets, level.entities.filter((e) => e instanceof ShulkerBullet && !e.removed).length);
    if (player.hasEffect('levitation')) hitAt = i;
  }
  check('it targets the player and opens right up', targeted && fullyOpen, `targeted ${targeted}, open ${fullyOpen}`);
  check('open: its box is two blocks tall', a.peek !== 1 || Math.abs(a.bb.maxY - 62) < 1e-6);
  check('it fires bullets, with the shoot sound', bullets >= 1 && heard('entity.shulker.shoot') >= 1, `bullets ${bullets}`);
  check('a bullet reaches the player: levitation for 10 s, 4 damage', hitAt >= 0 && player.getEffect('levitation')?.duration > 190 && player.health <= 16.5, `hit at ${hitAt}, health ${player.health}`);
  check('end rod motes trail the bullets', log.particles.some((p) => p.k === 'end_rod'));
  // levitation lifts
  const y0 = player.y;
  const ys = [];
  for (let i = 0; i < 60; i++) { tick(); ys.push(player.y); }
  const rate = (ys[59] - ys[39]) / 20;
  check('levitating, the player rises about 0.9 blocks a second', rate > 0.04 && rate < 0.05 && player.y > y0 + 2, `${(rate * 20).toFixed(3)} blocks/s, up ${(player.y - y0).toFixed(2)}`);
  player.removeEffect('levitation');
  player.gameMode = 'creative';
  player.moveTo(0.5, 60, 40.5, 0, 0);
  tick(5);
  // the bullets left over drop
  for (const e of level.entities) if (e instanceof ShulkerBullet) e.remove();
  a.remove();
}

// --- levitation lifts a mob
{
  const z = new zombieMod.Zombie(level);
  z.moveTo(30.5, 60, 30.5, 0, 0);
  level.addEntity(z);
  tick(3);
  z.addEffect(new MobEffectInstance(MOB_EFFECTS.levitation, 100));
  const y0 = z.y;
  tick(60);
  check('a levitating zombie floats up', z.y > y0 + 2, `${y0} → ${z.y.toFixed(2)}`);
  z.remove();
}

// --- arrows glance off it while it's shut
{
  const t = spawn(-30.5, 60, 0.5);
  t.setRawPeekAmount(0);
  const arrow = new arrowMod.Arrow(level, player);
  const h0 = t.health;
  const r1 = t.hurt(5, 'arrow', player, arrow);
  check('shut: an arrow does nothing', r1 === false && t.health === h0);
  t.setRawPeekAmount(100);
  const r2 = t.hurt(5, 'arrow', player, arrow);
  check('open: it hurts, with its hurt sound', r2 === true && t.health < h0 && heard('entity.shulker.hurt') >= 1);
  t.setRawPeekAmount(0);
  t.invulnerableTime = 0;
  log.sounds.length = 0;
  t.hurt(1, 'player', player, player);
  check('struck shut: the shell\'s knock', heard('entity.shulker.hurt_closed') === 1);
  t.remove();
}

// --- badly hurt, it teleports now and then
{
  let tried = 0, tries = 0, moved = 0;
  for (let k = 0; k < 400; k++) {
    const t = spawn(-40.5, 60, -40.5);
    t.health = 12;
    t.invulnerableTime = 0;
    t.teleportSomewhere = () => (tried++, false);
    t.hurt(1, 'player', player, player);
    tries++;
    t.remove();
  }
  check('under half health, a hit tries to teleport it one time in four', tried > 70 && tried < 130, `${tried}/${tries}`);
  for (let k = 0; k < 40; k++) {
    const t = spawn(-40.5, 60, -40.5);
    t.health = 12;
    t.invulnerableTime = 0;
    for (let i = 0; i < 4; i++) { t.invulnerableTime = 0; t.hurt(0.1, 'player', player, player); }
    if (t.blockX !== -41 || t.blockZ !== -41) moved++;
    t.remove();
  }
  check('and it does go (when it finds somewhere)', moved > 0, `${moved}/40 moved after 4 hits`);
}

// --- a bullet's hit: teleport and maybe a copy (1.17+)
{
  let dup = 0, same = 0, n = 0;
  for (let k = 0; k < 150; k++) {
    const shooter = spawn(-50.5, 60, 30.5);
    const t = spawn(-45.5, 60, 30.5);
    t.color = 'red';
    t.setRawPeekAmount(100);
    const b = new ShulkerBullet(level, shooter, t, 1);
    const before = level.entities.filter((e) => e instanceof Shulker && !e.removed).length;
    t.hurt(4, 'mobProjectile', shooter, b);
    // (only when it found somewhere to go)
    if (t.blockX !== -46 || t.blockY !== 60 || t.blockZ !== 30) n++;
    const all = level.entities.filter((e) => e instanceof Shulker && !e.removed);
    if (all.length > before) {
      dup++;
      const nu = all.find((e) => e !== shooter && e !== t && e.blockX === -46 && e.blockZ === 30);
      if (nu && nu.color === 'red' && nu.blockX === -46 && nu.blockZ === 30) same++;
      else console.log('  odd copy', all.length, before, all.map((e) => [e === shooter ? 'S' : e === t ? 'T' : 'N', e.color, e.blockX, e.blockY, e.blockZ].join(':')).join(' '));
    }
    for (const e of all) e.remove();
    tick();
  }
  check('an open shulker hit by a bullet leaves a copy of its colour where it was, most times (2 about: 80%)', dup > n * 0.55 && dup < n * 0.97 && same === dup, `${dup}/${n} copies, ${same} red in place`);
  // shut: no copy
  const shooter = spawn(-50.5, 60, 30.5);
  const t = spawn(-45.5, 60, 30.5);
  t.setRawPeekAmount(0);
  const cnt = level.entities.filter((e) => e instanceof Shulker && !e.removed).length;
  t.hurt(4, 'mobProjectile', shooter, new ShulkerBullet(level, shooter, t, 1));
  check('a shut one doesn\'t', level.entities.filter((e) => e instanceof Shulker && !e.removed).length === cnt);
  shooter.remove();
  t.remove();
  // crowded: six or more about — never
  const crowd = [];
  for (let i = 0; i < 7; i++) crowd.push(spawn(-50.5 + i * 2, 60, 45.5));
  crowd[3].setRawPeekAmount(100);
  const c0 = level.entities.filter((e) => e instanceof Shulker && !e.removed).length;
  crowd[3].hurt(4, 'mobProjectile', crowd[0], new ShulkerBullet(level, crowd[0], crowd[3], 1));
  check('with six others about, no copy', level.entities.filter((e) => e instanceof Shulker && !e.removed).length === c0);
  for (const e of crowd) e.remove();
}

// --- the bullet: breaking it, peaceful
{
  const sh = spawn(5.5, 60, -30.5);
  const b = new ShulkerBullet(level, sh, player, 1);
  level.addEntity(b);
  log.sounds.length = 0;
  check('a bullet can be struck (pickable), breaking it', b.isPickable() && b.hurt(1, 'player', player, player) && b.removed && heard('entity.shulker_bullet.hurt') === 1);
  const arrow = new arrowMod.Arrow(level, player);
  const b2 = new ShulkerBullet(level, sh, player, 1);
  level.addEntity(b2);
  // (an arrow's filter)
  check('arrows can hit bullets', arrow['canHit'](b2));
  level.difficulty = 'peaceful';
  tick();
  check('in peaceful, bullets vanish, the shulker stays', b2.removed && !sh.removed);
  level.difficulty = 'normal';
  // a bullet with no target falls, bursting on the floor
  const b3 = new ShulkerBullet(level, sh, null, 1);
  b3.moveTo(5.5, 64, -25.5);
  level.addEntity(b3);
  log.sounds.length = 0;
  for (let i = 0; i < 60 && !b3.removed; i++) tick();
  check('with no target it falls and bursts on a block', b3.removed && heard('entity.shulker_bullet.hit') === 1 && log.particles.some((p) => p.k === 'explosion'));
  sh.remove();
}

// --- the shell: half the time
{
  let shells = 0;
  const N = 400;
  for (let k = 0; k < N; k++) {
    const t = spawn(40.5, 60, -40.5);
    t.setRawPeekAmount(100);
    t.hurt(100, 'player', player, player);
    tick();
    for (const e of level.entities) if (e.type === 'item' && !e.removed) { if (e.stack.item.id === 'shulker_shell') shells++; e.remove(); }
    for (const e of level.entities) if (e instanceof Shulker) e.remove();
  }
  check('killed, it drops its shell about half the time', shells > N * 0.4 && shells < N * 0.6, `${shells}/${N}`);
}

// --- saving
{
  const t = spawn(15.5, 60, -15.5);
  t.color = 'lime';
  t.setRawPeekAmount(0);
  t.setAttachFace(0);
  const d = JSON.parse(JSON.stringify(spawnerMod.saveEntity(t)));
  const r = spawnerMod.loadEntity(d, level);
  check('saved and loaded: colour, face, armour', r instanceof Shulker && r.color === 'lime' && r.attachFace === 0 && r.armorValue() === 20 && r.x === 15.5 && r.y === 60, JSON.stringify(d.data));
  t.readEntityData('{Color:14b,AttachFace:1b}');
  check('/summon entity data: Color and AttachFace', t.color === 'red' && t.attachFace === 1);
  t.readEntityData('{Color:16b}');
  check('Color 16: undyed', t.color === null);
  t.remove();
}

// --- a shulker box's lid rising into one sends it off
{
  level.setBlock(25, 60, -5, S('shulker_box'));
  const t = spawn(25.5, 61, -4.5);
  tick(1);
  check('on a shulker box it clings to its top', t.attachFace === 0 && t.blockY === 61);
  const be = world.getBlockEntity(25, 60, -5);
  be.startOpen(level);
  for (let i = 0; i < 12; i++) tick();
  check('the box opening under it: it teleports away', !(t.blockX === 25 && t.blockY === 61 && t.blockZ === -5), [t.blockX, t.blockY, t.blockZ].join());
  t.remove();
}

// --- Great View From Up Here
{
  const adv = new advMod.PlayerAdvancements();
  const A = advMod.ADVANCEMENTS.get('end/levitate');
  player.moveTo(0.5, 60, 40.5, 0, 0);
  player.gameMode = 'survival';
  player.addEffect(new MobEffectInstance(MOB_EFFECTS.levitation, 2000, 4));
  progMod.tickOuterEndProgress(level, player, adv);
  let got = false, at = 0;
  for (let i = 0; i < 1500 && !got; i++) {
    tick();
    progMod.tickOuterEndProgress(level, player, adv);
    if (adv.isDone(A)) { got = true; at = player.y; }
  }
  check('Great View From Up Here: 50 blocks up on levitation', got && at - 60 >= 50 && at - 60 < 52, `at y ${at.toFixed(1)}`);
  player.removeAllEffects();
  player.gameMode = 'creative';
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
