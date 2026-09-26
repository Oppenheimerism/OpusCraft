// Headless checks for snow golems (node tests/golem/snow.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/textures/mobs.ts',
  '/src/render/mobModels.ts', '/src/textures/snowGolem.ts', '/src/entity/snowGolem.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, biomes, mobs, M, , SG] = mods;
const { ItemStack } = itemMod;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

function makeLevel(biome = 'plains') {
  const world = new worldMod.World();
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [], dust = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak: (x, y, z, st) => dust.push(BLOCKS[STATE_BLOCK[st]].name), spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const st = S('stone'), gs = S('grass_block');
  for (let x = -60; x <= 60; x++) for (let z = -60; z <= 60; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = 6000;
  level.difficulty = 'normal';
  return { world, level, sounds, dust };
}
function playerAt(level, x, y, z, mode = 'creative') {
  const p = new playerMod.Player(level);
  p.gameMode = mode;
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const mobAt = (level, type, x, y, z) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg'); level.addEntity(m); return m; };
const name = (w, x, y, z) => BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name;
const settle = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };

// --- registered
{
  check('registered with a spawn egg and a name', !!spawner.MOB_TYPES.snow_golem && !!itemMod.ITEMS.get('snow_golem_spawn_egg') && !!mobs.SPAWN_EGG_TEXTURES.snow_golem_spawn_egg && spawner.entityDisplayName('snow_golem') === 'Snow Golem');
  const t = mobs.MOB_TEXTURES.snow_golem?.();
  check('its skin, 64 x 64', t && t.w === 64 && t.h === 64 && t.data[(10 * 64 + 9) * 4 + 3] === 255);
  const def = M.snowGolemModel();
  check('the model: head, two balls, two arms', ['head', 'upper_body', 'lower_body', 'left_arm', 'right_arm'].every((n) => !!def.root.child(n)) && def.texW === 64);
  M.animateSnowGolem(def.root, 40, 10);
  check('the upper ball turns a quarter as far as the head, the arms with it', near(def.root.child('upper_body').yRot, (40 * Math.PI) / 180 / 4) && near(def.root.child('left_arm').yRot, def.root.child('upper_body').yRot));
}

// --- building one
{
  const { world, level, sounds, dust } = makeLevel();
  playerAt(level, 30, 64, 30);
  const summoned = [];
  level.onSummonedEntity = (e) => summoned.push(e);
  const snow = S('snow_block');
  level.setBlock(0, 64, 0, snow);
  level.setBlock(0, 65, 0, snow);
  check('two snow blocks alone do nothing', !level.entities.some((e) => e.type === 'snow_golem'));
  level.setBlock(0, 66, 0, getBlock('carved_pumpkin').state({ facing: 'south' }));
  const g = level.entities.find((e) => e.type === 'snow_golem');
  check('a carved pumpkin on top: a snow golem, where the bottom block was', g && g.x === 0.5 && near(g.y, 64.05) && g.z === 0.5, g && `${g.x},${g.y},${g.z}`);
  check('the blocks crumble away', ['air', 'air', 'air'].join() === [name(world, 0, 64, 0), name(world, 0, 65, 0), name(world, 0, 66, 0)].join() && dust.filter((d) => d === 'snow_block').length === 2 && sounds.includes('block.snow.break'));
  check('the summoning is told', summoned.length === 1 && summoned[0] === g);
  level.setBlock(10, 64, 0, snow);
  level.setBlock(11, 64, 0, snow);
  level.setBlock(12, 64, 0, getBlock('jack_o_lantern').state({ facing: 'east' }));
  check('lying down, with a jack o\'lantern', level.entities.filter((e) => e.type === 'snow_golem').length === 2);
}

// --- the golem
{
  const { world, level } = makeLevel();
  // (within 32 blocks, or it soon stops wandering: vanilla noActionTime)
  playerAt(level, 12, 64, 12);
  const g = mobAt(level, 'snow_golem', 0, 64, 0);
  check('0.7 x 1.9, eyes at 1.7; 4 health, speed 0.2; stays when far', near(g.width, 0.7) && near(g.height, 1.9) && near(g.eyeHeight, 1.7) && g.maxHealth === 4 && near(g.moveSpeedAttr, 0.2) && !g.removeWhenFarAway());
  let trail = 0;
  for (let i = 0; i < 600; i++) level.tick();
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) if (name(world, x, 64, z) === 'snow') trail++;
  check('a trail of snow where it walks', trail >= 3, `${trail} layers`);
  check('unhurt in the plains', g.health === 4);
  const { world: w2, level: l2 } = makeLevel();
  playerAt(l2, 12, 64, 12);
  l2.gameRules.mobGriefing = false;
  mobAt(l2, 'snow_golem', 0, 64, 0);
  settle(l2, 400);
  let t2 = 0;
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) if (name(w2, x, 64, z) === 'snow') t2++;
  check('none with mobGriefing off', t2 === 0);
}

// --- melting
{
  const { level } = makeLevel('desert');
  playerAt(level, 30, 64, 30);
  const g = mobAt(level, 'snow_golem', 0, 64, 0);
  settle(level, 5);
  check('it melts in the desert', g.health < 4 || g.dead || g.removed);
  const { level: l2 } = makeLevel('plains');
  playerAt(l2, 30, 64, 30);
  const g2 = mobAt(l2, 'snow_golem', 0, 64, 0);
  l2.raining = true; l2.rain = l2.rainO = 1;
  l2.rainLevel = () => 1;
  settle(l2, 5);
  check('and in the rain', g2.health < 4 || g2.dead);
}

// --- pelting monsters
{
  const { level, sounds } = makeLevel();
  const p = playerAt(level, -20, 64, -20, 'survival');
  const g = mobAt(level, 'snow_golem', 0, 64, 0);
  const z = mobAt(level, 'zombie', 6, 64, 0);
  // (the zombie held where it stands, so the count doesn't hang on where it wanders)
  z.aiStep = () => {};
  const v = mobAt(level, 'villager', 0, 64, 6);
  let balls = 0, targeted = false, pushed = 0;
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    level.tick();
    targeted ||= g.target === z;
    for (const e of level.entities) if (e.type === 'snowball' && !seen.has(e)) { seen.add(e); balls++; }
    pushed = Math.max(pushed, Math.hypot(z.dx, z.dz));
    z.health = z.maxHealth;
  }
  check('it goes for the zombie', targeted);
  check('snowballs at it, one a second', balls >= 4 && balls <= 8, `${balls}`);
  check('with the bow\'s sound', sounds.includes('entity.snow_golem.shoot'));
  check('not at the player or the villager', g.target !== p && g.target !== v);
  p.gameMode = 'creative';
  const b = mobAt(level, 'blaze', -6, 64, 0);
  b.aiStep = () => {};
  z.remove();
  const h0 = b.health;
  let hurt = false;
  for (let i = 0; i < 300 && !hurt; i++) { level.tick(); hurt = b.health < h0; }
  check('a blaze is hurt by them', hurt, `${h0} -> ${b.health}`);
}

// --- shears
{
  const { level, sounds } = makeLevel();
  const p = playerAt(level, 1, 64, 0, 'survival');
  const g = mobAt(level, 'snow_golem', 0, 64, 0);
  const shears = ItemStack.of('shears', 1);
  p.inventory.setSelectedItem(shears);
  check('shears take its pumpkin off', g.interact(p, shears) && !g.hasPumpkin && sounds.includes('entity.snow_golem.shear'));
  const drop = level.entities.find((e) => e.type === 'item' && e.stack?.item.id === 'carved_pumpkin');
  check('dropped from its head', drop && drop.y > g.y + 1.5, drop && `${drop.y - g.y}`);
  check('the shears wear', shears.damage === 1);
  check('nothing more to shear', !g.interact(p, shears) && shears.damage === 1);
  const u = spawner.createMob('snow_golem', level);
  u.load(g.save());
  check('saved without its pumpkin', !u.hasPumpkin);
  const loot = g.lootTable();
  check('0-15 snowballs, no looting', loot.length === 1 && loot[0].item === 'snowball' && loot[0].min === 0 && loot[0].max === 15 && loot[0].noLooting);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
