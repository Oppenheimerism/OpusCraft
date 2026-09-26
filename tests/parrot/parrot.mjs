// Headless checks for parrots and flying (node tests/parrot/parrot.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/textures/mobs.ts',
  '/src/entity/parrot.ts', '/src/entity/ai/pathfinder.ts', '/src/entity/monsters.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, biomes, mobs, P, PF, monsters] = mods;
const { ItemStack } = itemMod;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

function makeLevel(biome = 'jungle') {
  const world = new worldMod.World();
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n, x, y, z, v, p) => sounds.push({ n, v, p }), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const st = S('stone'), gs = S('grass_block');
  for (let x = -60; x <= 60; x++) for (let z = -60; z <= 60; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = 6000;
  level.difficulty = 'normal';
  return { world, level, sounds };
}
function playerAt(level, x, y, z, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.setGameMode(mode);
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const mobAt = (level, type, x, y, z) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg'); level.addEntity(m); return m; };
const settle = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const nameAt = (w, x, y, z) => BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name;

// --- registered
{
  check('registered with a spawn egg and a name', !!spawner.MOB_TYPES.parrot && !!itemMod.ITEMS.get('parrot_spawn_egg') && !!mobs.SPAWN_EGG_TEXTURES.parrot_spawn_egg && spawner.entityDisplayName('parrot') === 'Parrot');
  const { level } = makeLevel();
  const p = spawner.createMob('parrot', level);
  check('0.5 x 0.9, eyes at 0.54; 6 health, speed 0.2, flying 0.4', near(p.width, 0.5) && near(p.height, 0.9) && near(p.eyeHeight, 0.54) && p.maxHealth === 6 && near(p.moveSpeedAttr, 0.2) && near(p.flyingSpeedAttr, 0.4));
  check('flies: a flying navigation that floats, and a flying move control', p.navigation.constructor.name === 'FlyingPathNavigation' && p.navigation.canFloat && !p.navigation.canOpenDoors && p.moveControl.constructor.name === 'FlyingMoveControl');
  check('minds fire and cocoa pods', p.malus(PF.PathType.DAMAGE_FIRE) === -1 && p.malus(PF.PathType.DANGER_FIRE) === -1 && p.malus(PF.PathType.COCOA) === -1);
}

// --- colours, and never a chick
{
  const { level } = makeLevel();
  const seen = new Set();
  let babies = 0;
  const group = {};
  for (let i = 0; i < 60; i++) {
    const m = spawner.createMob('parrot', level);
    m.moveTo(0.5, 64, 0.5, 0, 0);
    m.finalizeSpawn('natural', group);
    seen.add(m.variant);
    if (m.isBaby()) babies++;
  }
  check('all five colours come up', seen.size === 5, [...seen].join());
  check('never a chick, even in a flock', babies === 0);
  check('the variant names', P.PARROT_VARIANTS.join() === 'red_blue,blue,green,yellow_blue,gray');
}

// --- in the air
{
  const { level } = makeLevel('plains');
  playerAt(level, 20, 64, 20);
  const p = mobAt(level, 'parrot', 0, 80, 0);
  p.aiStep = ((orig) => function () { this.goalSelector.goals?.length; orig.call(this); })(p.aiStep);
  // (its goals held off, it only falls)
  p.goalSelector.tick = () => {};
  let minDy = 0;
  for (let i = 0; i < 40; i++) { level.tick(); minDy = Math.min(minDy, p.dy); }
  check('left alone in the air it drifts down slowly (its wings)', minDy > -0.2 && p.y < 80 && p.y > 70, `dy ${minDy.toFixed(3)}, y ${p.y.toFixed(2)}`);
  check('its wings beat while it\'s up', p.flapSpeed === 1 && p.flap > 0);
  for (let i = 0; i < 400 && !p.onGround; i++) level.tick();
  check('...and lands unhurt, however far', p.onGround && p.health === 6 && p.fallDistance === 0, `${p.y}`);
  settle(level, 10);
  check('on the ground the beat dies away', p.flapSpeed === 0);
}

// --- flying somewhere
{
  const { world, level, sounds } = makeLevel('plains');
  playerAt(level, 20, 64, 20);
  // a wall two high, between it and where it's going
  // (vanilla's search counts a cell's walk from whichever cell looked at it last, so it gives up on a wall much
  // higher than this close in front: a parrot's hops are short ones)
  for (let z = -6; z <= 6; z++) for (let y = 64; y <= 65; y++) world.setState(3, y, z, S('stone'));
  const p = mobAt(level, 'parrot', 0, 64, 0);
  p.goalSelector.tick = () => {};
  const path = p.navigation.createPath(6.5, 64, 0.5, 0);
  check('a path over the wall', path && path.canReach() && path.nodes.some((n) => n.y >= 66), path && path.nodes.map((n) => `${n.x},${n.y},${n.z}`).join(' '));
  const walker = mobAt(level, 'pig', 0, 64, -2);
  walker.goalSelector.tick = () => {};
  settle(level, 2);
  const wp = walker.navigation.createPath(6.5, 64, -1.5, 0);
  check('(where a pig has none)', walker.onGround && (!wp || !wp.canReach()));
  p.navigation.moveTo(6.5, 64, 0.5, 1);
  let top = 0;
  for (let i = 0; i < 300 && !(p.x > 6 && Math.abs(p.z - 0.5) < 1.5); i++) { level.tick(); top = Math.max(top, p.y); }
  check('it flies over and gets there', p.x > 5.5 && top >= 66, `at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}, highest ${top.toFixed(1)}`);
  check('its wingbeats heard as it goes', sounds.some((s) => s.n === 'entity.parrot.fly' && near(s.v, 0.15)));
  // up to somewhere in the air
  // (a path's last node counts as reached within a block of it: to 72, with 1 to spare, it's done past 70)
  p.navigation.moveTo(p.x, 72, p.z, 1);
  let up = 0;
  for (let i = 0; i < 300 && !p.navigation.isDone(); i++) { level.tick(); up = Math.max(up, p.y); }
  check('and straight up into the air', up > 70, `${up.toFixed(2)}`);
  settle(level, 40);
  check('...where, with nowhere to go, it sinks again (it doesn\'t hover)', p.y < up - 1 && !p.noGravityFlag, `${p.y.toFixed(2)}`);
}

// --- perching in the trees
{
  const { world, level } = makeLevel();
  playerAt(level, 20, 64, 20);
  // a tree: a trunk to 69, leaves round the top
  for (let y = 64; y <= 69; y++) world.setState(2, y, 2, S('jungle_log'));
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) if (x !== 2 || z !== 2) world.setState(x, 69, z, getBlock('jungle_leaves').defaultState);
  const p = mobAt(level, 'parrot', 0, 66, 0);
  level.tick();
  const wander = p.goalSelector.goals.map((g) => g.goal).find((g) => g.constructor.name === 'ParrotWanderGoal');
  const t = wander?.treePos();
  check('its wander looks for a perch: on the leaves or the log, room above', t && t[1] === 70 && t[0] >= 1 && t[0] <= 3 && t[2] >= 1 && t[2] <= 3, `${t}`);
}

// --- taming, sitting, cookies
{
  const { level, sounds } = makeLevel('plains');
  const pl = playerAt(level, 0, 64, 0);
  const p = mobAt(level, 'parrot', 1, 64, 0);
  settle(level, 5);
  const seeds = ItemStack.of('wheat_seeds', 64);
  pl.inventory.setSelectedItem(seeds);
  let tries = 0;
  while (!p.isTame() && tries < 100) { p.interact(pl, seeds); tries++; }
  check('seeds tame it, one time in ten or so', p.isTame() && p.ownerUUID === pl.uuid && tries >= 1, `${tries} seeds`);
  check('each one eaten', seeds.count === 64 - tries && sounds.some((s) => s.n === 'entity.parrot.eat'));
  check('tamed, it doesn\'t sit down of itself', !p.orderedToSit);
  // (its goals held off till it's down on the ground)
  const tickGoals = p.goalSelector.tick;
  p.goalSelector.tick = () => {};
  for (let i = 0; i < 400 && !p.onGround; i++) level.tick();
  p.goalSelector.tick = tickGoals;
  const ground = p.onGround;
  check('its owner\'s click on the ground: it sits', ground && p.interact(pl, null) && p.orderedToSit, `onGround ${ground}`);
  settle(level, 3);
  check('...in its sitting pose', p.inSittingPose);
  check('seeds to a tame one: no more taming, it just gets up', p.interact(pl, seeds) && !p.orderedToSit && seeds.count === 64 - tries);
  check('it never breeds', !p.isFood(seeds) && p.makeBaby(p) === null);
  const w = mobAt(level, 'parrot', -1, 64, 0);
  const cookie = ItemStack.of('cookie', 2);
  pl.inventory.setSelectedItem(cookie);
  w.interact(pl, cookie);
  check('a cookie kills it', w.health <= 0 && cookie.count === 1);
  const u = spawner.createMob('parrot', level);
  p.variant = 3;
  p.orderedToSit = true;
  u.load(p.save());
  check('saved: its colour, its owner, sitting', u.variant === 3 && u.isTame() && u.ownerUUID === pl.uuid && u.orderedToSit);
}

// --- the shoulder
{
  const { level } = makeLevel('plains');
  const pl = playerAt(level, 0, 64, 0);
  const a = mobAt(level, 'parrot', 0, 64, 0);
  a.tameBy(pl);
  a.variant = 2;
  settle(level, 5);
  check('not onto the shoulder in its first five seconds', level.entities.includes(a) && !pl.shoulderLeft);
  a.moveTo(pl.x, pl.y + 0.5, pl.z, 0, 0);
  for (let i = 0; i < 120 && !pl.shoulderLeft; i++) { a.moveTo(pl.x, pl.y + 0.5, pl.z, 0, 0); level.tick(); }
  check('then onto its owner\'s left shoulder as it touches them', pl.shoulderLeft && pl.shoulderLeft.id === 'parrot' && !level.entities.includes(a) && a.removed, `${pl.shoulderLeft?.id}`);
  check('...keeping its colour', P.shoulderVariant(pl.shoulderLeft) === 2);
  const b = mobAt(level, 'parrot', 0, 64, 0);
  b.tameBy(pl);
  for (let i = 0; i < 120 && !pl.shoulderRight; i++) { b.moveTo(pl.x, pl.y + 0.5, pl.z, 0, 0); level.tick(); }
  check('a second one on the right', pl.shoulderRight && pl.shoulderRight.id === 'parrot');
  settle(level, 25);
  pl.hurt(1, 'generic', null);
  const back = level.entities.filter((e) => e.type === 'parrot');
  check('hurt, both fly off: back in the world, still its own', back.length === 2 && !pl.shoulderLeft && !pl.shoulderRight && back.every((e) => e.ownerUUID === pl.uuid), `${back.length}`);
  check('...just over its head', back.every((e) => near(e.y, pl.y + 0.7, 0.6)), back.map((e) => (e.y - pl.y).toFixed(2)).join());
  // back up, then the player takes off flying
  const c = back[0];
  for (let i = 0; i < 150 && !pl.shoulderLeft; i++) { c.moveTo(pl.x, pl.y + 0.5, pl.z, 0, 0); level.tick(); }
  check('five seconds on, up again', !!pl.shoulderLeft);
  settle(level, 25);
  // (a player on the ground stops flying: up in the air)
  pl.moveTo(pl.x, pl.y + 3, pl.z, 0, 0);
  pl.onGround = false;
  pl.mayFly = true;
  pl.flying = true;
  level.tick();
  check('flying, it gets off', !pl.shoulderLeft && level.entities.some((e) => e.type === 'parrot' && e !== back[1]));
  pl.flying = false;
  const ok = pl.setEntityOnShoulder({ id: 'parrot', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 6, fire: 0 });
  pl.inWater = true;
  check('not while it\'s in the water', !pl.setEntityOnShoulder({ id: 'parrot', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 6, fire: 0 }) || !ok);
}

// --- mimicking
{
  const { level, sounds } = makeLevel('plains');
  playerAt(level, 30, 64, 30);
  const p = mobAt(level, 'parrot', 0, 64, 0);
  const z = mobAt(level, 'zombie', 4, 64, 0);
  z.aiStep = () => {};
  const r = level.random;
  const orig = r.nextInt.bind(r);
  r.nextInt = (n) => (n === 2 ? 0 : orig(n));
  const did = P.imitateNearbyMobs(level, p);
  r.nextInt = orig;
  const s = sounds.find((x) => x.n.startsWith('entity.parrot.imitate'));
  check('it mimics a zombie near it', did && s && s.n === 'entity.parrot.imitate.zombie' && near(s.v, 0.7), s && s.n);
  z.remove();
  const cow = mobAt(level, 'cow', 3, 64, 0);
  r.nextInt = (n) => (n === 2 ? 0 : orig(n));
  const did2 = P.imitateNearbyMobs(level, p);
  r.nextInt = orig;
  check('not a cow', !did2);
  cow.remove();
}

// --- spawning
{
  const { world, level } = makeLevel();
  world.setState(0, 70, 0, getBlock('jungle_leaves').defaultState);
  check('leaves will do to spawn on, for a parrot or an ocelot only', monsters.validSpawnBlock(level, 0, 70, 0, false, 'parrot') && monsters.validSpawnBlock(level, 0, 70, 0, false, 'ocelot') && !monsters.validSpawnBlock(level, 0, 70, 0, false, 'zombie'));
  const jungle = spawner.biomeSettings(biomes.BIOME_ID.jungle).creature.find((d) => d.type === 'parrot');
  const bamboo = spawner.biomeSettings(biomes.BIOME_ID.bamboo_jungle).creature.find((d) => d.type === 'parrot');
  const sparse = spawner.biomeSettings(biomes.BIOME_ID.sparse_jungle).creature.find((d) => d.type === 'parrot');
  check('in the jungle and the bamboo jungle, 40, in ones and twos; not the sparse jungle', jungle && jungle.weight === 40 && jungle.min === 1 && jungle.max === 2 && bamboo && bamboo.weight === 40 && !sparse);
}

{
  const l = new P.Parrot(makeLevel().level).lootTable();
  check('a feather or two when it dies', l.length === 1 && l[0].item === 'feather' && l[0].min === 1 && l[0].max === 2);
}

// --- looks and sounds
{
  const { mods: [, , T, A, R], close: close2 } = await loadModules(['/src/world/blocks.ts', '/src/item/item.ts', '/src/textures/mobs.ts', '/src/audio/synth.ts', '/src/render/parrotRenderer.ts']);
  const def = R.parrotModel();
  const names = [...def.root.children.keys()].sort().join(',');
  check('the model: body, tail, wings, head (with its crest, beak and tuft) and legs, on 32x32', names === 'body,head,left_leg,left_wing,right_leg,right_wing,tail' && [...def.root.child('head').children.keys()].join(',') === 'head2,beak1,beak2,feather' && def.texW === 32 && def.texH === 32);
  let skins = 0;
  for (const v of P.PARROT_VARIANTS) {
    const f = T.MOB_TEXTURES['parrot_' + v];
    if (!f) continue;
    const t = f();
    const px = (x, y) => t.data[(y * t.w + x) * 4 + 3];
    // the head's front, the eye on its right side (at the front edge), the tuft's top row only at its back
    if (t.w === 32 && t.h === 32 && px(4, 4) === 255 && px(3, 5) === 255 && px(2, 22) === 255 && px(5, 22) === 0 && px(6, 22) === 0 && px(9, 22) === 255) skins++;
  }
  check('five skins, one for each colour', skins === 5, String(skins));
  const S = A.SOUNDS;
  const own = { ambient: 6, hurt: 2, death: 2, eat: 5, fly: 4, step: 5 };
  let good = 0;
  for (const [k, n] of Object.entries(own)) {
    const g = S['entity.parrot.' + k];
    if (!g || g.variants !== n) continue;
    let ok = true;
    for (let i = 0; i < n; i++) {
      const b = g.generate(i, 44100);
      let peak = 0, finite = true;
      for (const x of b) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.2 || b.length < 1000 || b.length > 44100 * 1.5) ok = false;
    }
    if (ok) good++;
  }
  check('its own sounds, every take heard', good === 6, String(good));
  const imitated = Object.keys(S).filter((k) => k.startsWith('entity.parrot.imitate.'));
  const z = S['entity.parrot.imitate.zombie'].generate(0, 44100).length, z0 = S['entity.zombie.ambient'].generate(0, 44100).length;
  check('35 mobs it mimics, the zombie pitched up from its own', imitated.length === 35 && Math.abs(z - z0 / 1.8) < z0 * 0.1, `${imitated.length} ${z} ${z0}`);
  await close2();
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
