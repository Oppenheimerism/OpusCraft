// Headless checks for polar bears (node tests/polarbear/bear.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/textures/mobs.ts',
  '/src/entity/polarBear.ts', '/src/entity/ai/pathfinder.ts', '/src/entity/monsters.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, biomes, mobs, P, PF, monsters] = mods;
const { ItemStack } = itemMod;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

function makeLevel(biome = 'snowy_plains') {
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
  check('registered with a spawn egg and a name', !!spawner.MOB_TYPES.polar_bear && !!itemMod.ITEMS.get('polar_bear_spawn_egg') && !!mobs.SPAWN_EGG_TEXTURES.polar_bear_spawn_egg && spawner.entityDisplayName('polar_bear') === 'Polar Bear');
  const { level } = makeLevel();
  const b = spawner.createMob('polar_bear', level);
  check('1.4 x 1.4; 30 health, 6 damage, speed 0.25, follows 20', near(b.width, 1.4) && near(b.height, 1.4) && b.maxHealth === 30 && b.attackDamage === 6 && near(b.moveSpeedAttr, 0.25) && b.followRange === 20);
  check('swims well (0.98), not to be bred', near(b.waterSlowDown(), 0.98) && !b.isFood(new ItemStack(itemMod.ITEMS.get('cod'), 1)) && !b.isFood(new ItemStack(itemMod.ITEMS.get('salmon'), 1)));
  const group = {};
  const a = spawner.createMob('polar_bear', level), c = spawner.createMob('polar_bear', level);
  a.finalizeSpawn('natural', group);
  c.finalizeSpawn('natural', group);
  check('a pack: the first grown, the second a cub', !a.isBaby() && c.isBaby());
  const egg = spawner.createMob('polar_bear', level);
  egg.finalizeSpawn('egg');
  check('from a spawn egg: grown', !egg.isBaby());
}

// --- where they spawn
{
  const pick = (biome, type) => spawner.biomeSettings(biomes.BIOME_ID[biome]).creature.find((d) => d.type === type);
  const ok = (d) => d && d.weight === 1 && d.min === 1 && d.max === 2;
  check('the snowy plains and ice spikes (1, in ones and twos, beside the rabbits\' 10), the frozen oceans', ok(pick('snowy_plains', 'polar_bear')) && ok(pick('ice_spikes', 'polar_bear')) && pick('snowy_plains', 'rabbit')?.weight === 10 && ok(pick('frozen_ocean', 'polar_bear')) && ok(pick('deep_frozen_ocean', 'polar_bear')) && !pick('plains', 'polar_bear'));
  const { world, level } = makeLevel('frozen_ocean');
  world.setState(3, 64, 3, S('ice'));
  const ns = new spawner.NaturalSpawner(level);
  const rule = (x, y, z) => ns.checkSpawnRules('polar_bear', x, y, z);
  check('on the frozen ocean, only on ice', rule(3, 65, 3) && !rule(0, 64, 0));
  const { level: l2 } = makeLevel('snowy_plains');
  check('elsewhere, on grass as any animal', new spawner.NaturalSpawner(l2).checkSpawnRules('polar_bear', 0, 64, 0));
}

// --- neutral, but not near its cubs
{
  const { level } = makeLevel();
  const pl = playerAt(level, 0, 64, 0);
  const bear = mobAt(level, 'polar_bear', 6, 64, 0);
  bear.moveSpeedAttr = 0;
  settle(level, 200);
  check('alone, it leaves a player be', bear.target === null);
  const cub = mobAt(level, 'polar_bear', 8, 64, 2);
  cub.setAge(-24000);
  cub.moveSpeedAttr = 0;
  let got = false;
  for (let i = 0; i < 400 && !got; i++) { level.tick(); got = bear.target === pl; }
  check('with a cub about, it comes for a player within 10', got);
  const { level: l2 } = makeLevel();
  const pl2 = playerAt(l2, 0, 64, 0);
  const b2 = mobAt(l2, 'polar_bear', 14, 64, 0), c2 = mobAt(l2, 'polar_bear', 16, 64, 2);
  c2.setAge(-24000);
  b2.moveSpeedAttr = c2.moveSpeedAttr = 0;
  settle(l2, 300);
  check('...but not one 14 blocks off', b2.target === null);
  const { level: l3 } = makeLevel();
  const p3 = playerAt(l3, 0, 64, 0, 'creative');
  const b3 = mobAt(l3, 'polar_bear', 5, 64, 0), c3 = mobAt(l3, 'polar_bear', 6, 64, 2);
  c3.setAge(-24000);
  settle(l3, 300);
  check('...nor a player in creative', b3.target === null && !!p3);
}

// --- hurt: angry, and the cubs call for help
{
  const { level, sounds } = makeLevel();
  const pl = playerAt(level, 0, 64, 0);
  const bear = mobAt(level, 'polar_bear', 4, 64, 0);
  settle(level, 5);
  bear.hurt(1, 'player', pl);
  settle(level, 3);
  check('hurt by a player: angry at them for 20 to 39 seconds', bear.target === pl && bear.angerTarget === pl && bear.angerTime > 380 && bear.angerTime <= 780, String(bear.angerTime));
  // closing in: it rears up and growls, then drops to strike
  let stood = false, warned = false, struck = false;
  const h0 = pl.health;
  for (let i = 0; i < 200 && !struck; i++) {
    level.tick();
    if (bear.standing) stood = true;
    if (sounds.some((s) => s.n === 'entity.polar_bear.warning')) warned = true;
    if (pl.health < h0) struck = true;
  }
  check('rears up with a warning growl before it strikes', stood && warned && struck);
  settle(level, 8);
  check('rears up over six ticks, and down again', bear.standAnim >= 0 && bear.standAnim <= 6);

  const { level: l2 } = makeLevel();
  const p2 = playerAt(l2, 0, 64, 0);
  const mom = mobAt(l2, 'polar_bear', 8, 64, 0), cub = mobAt(l2, 'polar_bear', 4, 64, 0);
  cub.setAge(-24000);
  mom.moveSpeedAttr = 0;
  settle(l2, 5);
  cub.hurt(1, 'player', p2);
  settle(l2, 3);
  check('a hurt cub leaves the fighting to the grown bears about', cub.target === null && mom.target === p2);
  let running = false;
  for (let i = 0; i < 20 && !running; i++) {
    running = cub.goalSelector.goals.some((g) => g.running && g.goal.constructor.name === 'PolarBearPanicGoal');
    l2.tick();
  }
  check('...and runs', running);
  const { level: l3 } = makeLevel();
  const p3 = playerAt(l3, 0, 64, 0);
  const grown = mobAt(l3, 'polar_bear', 4, 64, 0);
  settle(l3, 5);
  grown.hurt(1, 'player', p3);
  settle(l3, 3);
  check('a grown bear stands its ground', !grown.goalSelector.goals.some((g) => g.running && g.goal.constructor.name === 'PolarBearPanicGoal'));
}

// --- loot, saving
{
  const { level } = makeLevel();
  const b = spawner.createMob('polar_bear', level);
  const seen = new Set();
  for (let i = 0; i < 200; i++) for (const e of b.lootTable()) seen.add(`${e.item}:${e.min}-${e.max}:${e.cooked}`);
  check('cod or salmon, none to two, cooked if it burned', seen.has('cod:0-2:cooked_cod') && seen.has('salmon:0-2:cooked_salmon') && seen.size === 2);
  b.angerTime = 321;
  const d = b.save();
  const b2 = spawner.createMob('polar_bear', level);
  b2.load(d);
  check('its anger kept', b2.angerTime === 321);
}

// --- looks and sounds
{
  const { mods: [, , T, A, R], close: close2 } = await loadModules(['/src/world/blocks.ts', '/src/item/item.ts', '/src/textures/mobs.ts', '/src/audio/synth.ts', '/src/render/polarBearRenderer.ts']);
  const def = R.polarBearModel();
  check('the model: head, body and four legs, 128x64, the cub\'s head drawn big', [...def.root.children.keys()].sort().join(',') === 'body,head,left_front_leg,left_hind_leg,right_front_leg,right_hind_leg' && def.texW === 128 && def.baby?.headScale === 2.25);
  const t = T.MOB_TEXTURES.polar_bear?.();
  const px = (x, y) => t.data[(y * t.w + x) * 4 + 3];
  check('a skin with its eyes and nose', !!t && t.w === 128 && t.h === 64 && px(8, 10) === 255 && px(4, 47) === 255 && px(55, 30) === 255);
  const own = { ambient: 4, ambient_baby: 4, hurt: 4, death: 3, step: 4, warning: 3 };
  let good = 0;
  for (const [k, n] of Object.entries(own)) {
    const g = A.SOUNDS['entity.polar_bear.' + k];
    if (!g || g.variants !== n) continue;
    let ok = true;
    for (let i = 0; i < n; i++) {
      const b = g.generate(i, 44100);
      let peak = 0, finite = true;
      for (const x of b) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.2 || b.length < 1000 || b.length > 44100 * 2) ok = false;
    }
    if (ok) good++;
  }
  check('its sounds, every take heard', good === 6, String(good));
  await close2();
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
