// Headless checks for rabbits (node tests/rabbit/rabbit.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/textures/mobs.ts',
  '/src/entity/rabbit.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, biomes, mobs, R] = mods;
const { ItemStack } = itemMod;
const { S, BLOCKS, STATE_BLOCK } = blockMod;
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
const running = (m, name) => m.goalSelector.goals.some((g) => g.running && g.goal.constructor.name === name);
const dropGoal = (m, name) => { for (const w of [...m.goalSelector.goals]) if (w.goal.constructor.name === name) m.goalSelector.removeGoal(w.goal); };
const food = (id) => new ItemStack(itemMod.ITEMS.get(id), 1);

// --- registered, and its build
{
  check('registered with a spawn egg and a name', !!spawner.MOB_TYPES.rabbit && !!itemMod.ITEMS.get('rabbit_spawn_egg') && !!mobs.SPAWN_EGG_TEXTURES.rabbit_spawn_egg && spawner.entityDisplayName('rabbit') === 'Rabbit');
  const { level } = makeLevel();
  const r = spawner.createMob('rabbit', level);
  check('0.4 x 0.5; 3 health, speed 0.3, no armour', near(r.width, 0.4) && near(r.height, 0.5) && r.maxHealth === 3 && near(r.moveSpeedAttr, 0.3) && r.armorValue() === 0);
  r.setAge(-24000);
  check('a baby half the size', near(r.width, 0.2) && near(r.height, 0.25));
  check('bred with carrots, golden carrots and dandelions (not wheat)', r.isFood(food('carrot')) && r.isFood(food('golden_carrot')) && r.isFood(food('dandelion')) && !r.isFood(food('wheat')));
}

// --- coats: by biome, shared by a group
{
  const tally = (biome, n) => {
    const { level } = makeLevel(biome);
    const c = {};
    for (let i = 0; i < n; i++) {
      const m = spawner.createMob('rabbit', level);
      m.moveTo(0.5, 64, 0.5, 0, 0);
      m.finalizeSpawn('egg');
      c[m.variant] = (c[m.variant] ?? 0) + 1;
    }
    return c;
  };
  const d = tally('desert', 300);
  check('gold in the desert', d[4] === 300);
  const s = tally('snowy_plains', 1000), g = tally('grove', 200);
  check('white in the snow, one in five splotched', s[1] + s[3] === 1000 && s[3] > 150 && s[3] < 250 && g[1] + g[3] === 200, JSON.stringify(s));
  const p = tally('plains', 2000);
  check('elsewhere brown half the time, salt two in five, black one in ten', p[0] > 900 && p[0] < 1100 && p[5] > 700 && p[5] < 900 && p[2] > 140 && p[2] < 260 && p[0] + p[5] + p[2] === 2000, JSON.stringify(p));
  const { level } = makeLevel('plains');
  const group = {};
  const pack = [0, 1, 2].map(() => { const m = spawner.createMob('rabbit', level); m.moveTo(0.5, 64, 0.5, 0, 0); m.finalizeSpawn('natural', group); return m; });
  check('a group shares one coat: the first grown, the rest babies', pack.every((m) => m.variant === pack[0].variant) && !pack[0].isBaby() && pack[1].isBaby() && pack[2].isBaby());
  const egg = spawner.createMob('rabbit', level);
  egg.moveTo(0.5, 64, 0.5, 0, 0);
  egg.finalizeSpawn('egg');
  check('from a spawn egg: grown, never the killer bunny', !egg.isBaby() && egg.variant !== 99 && egg.customName === null);
}

// --- breeding: a parent's coat
{
  const { level } = makeLevel('plains');
  const mom = spawner.createMob('rabbit', level), dad = spawner.createMob('rabbit', level);
  mom.moveTo(0.5, 64, 0.5, 0, 0);
  mom.setVariant(1);
  dad.setVariant(3);
  let a = 0, b = 0, other = 0;
  for (let i = 0; i < 4000; i++) {
    const v = mom.makeBaby(dad).variant;
    if (v === 1) a++;
    else if (v === 3) b++;
    else other++;
  }
  check('a baby takes one parent\'s coat or the other\'s, one in twenty the biome\'s', a > 1750 && a < 2050 && b > 1750 && b < 2050 && other > 120 && other < 280, `${a}/${b}/${other}`);
  // the real thing: fed carrots, they breed
  const pl = playerAt(level, 0, 64, 0, 'creative');
  const m1 = mobAt(level, 'rabbit', 2, 64, 0), m2 = mobAt(level, 'rabbit', 3, 64, 1);
  m1.setVariant(2);
  m2.setVariant(2);
  pl.inventory.setSelectedItem(ItemStack.of('carrot', 4));
  m1.interact(pl, pl.inventory.selectedItem);
  m2.interact(pl, pl.inventory.selectedItem);
  let baby = null;
  for (let i = 0; i < 600 && !baby; i++) {
    level.tick();
    baby = level.entities.find((e) => e.type === 'rabbit' && e.isBaby()) ?? null;
  }
  check('fed carrots, two rabbits make a baby', !!baby && m1.age > 0 && m2.age > 0);
}

// --- hopping
{
  const { level, sounds } = makeLevel('plains');
  const pl = playerAt(level, 0, 64, 0, 'creative');
  pl.inventory.setSelectedItem(ItemStack.of('carrot', 1));
  const r = mobAt(level, 'rabbit', 9, 64, 0);
  let jumps = 0, maxY = 0, groundRun = 0, minPause = 99, sawAnim = false, closest = 99;
  let still = true;
  for (let i = 0; i < 400; i++) {
    const wasJumping = r.jumping;
    level.tick();
    if (!wasJumping && r.jumping) jumps++;
    maxY = Math.max(maxY, r.y - 64);
    if (r.jumpCompletion(0.5) > 0.3 && r.jumpCompletion(0.5) < 1) sawAnim = true;
    if (r.onGround && !r.jumping) {
      groundRun++;
      // (between hops it doesn't go on: no speed of its own, only its landing's slide)
      if (r.speed !== 0) still = false;
    } else {
      if (groundRun > 0 && jumps > 1) minPause = Math.min(minPause, groundRun);
      groundRun = 0;
    }
    closest = Math.min(closest, Math.hypot(r.x - pl.x, r.z - pl.z));
  }
  const jumpSounds = sounds.filter((s) => s.n === 'entity.rabbit.jump').length;
  check('it hops after a carrot, never walking', closest < 3.5 && jumps >= 4 && still, `closest ${closest.toFixed(2)} jumps ${jumps}`);
  check('each hop heard', jumpSounds >= jumps, `${jumpSounds}`);
  check('a hurried hop (0.3) rises about 0.7', maxY > 0.6 && maxY < 0.8, maxY.toFixed(3));
  check('half a second\'s pause after each landing', minPause >= 9 && minPause < 20, String(minPause));
  check('the hop\'s animation runs through', sawAnim);
  // hurt: it bolts, landing and away again at once
  const { level: l2 } = makeLevel('plains');
  const p2 = playerAt(l2, 0, 64, 0);
  const r2 = mobAt(l2, 'rabbit', 2, 64, 0);
  settle(l2, 5);
  r2.hurt(1, 'player', p2);
  let pause = 99, run = 0, far = 0, panicked = false, px = r2.x, pz = r2.z;
  for (let i = 0; i < 100; i++) {
    l2.tick();
    if (running(r2, 'RabbitPanicGoal')) panicked = true;
    if (r2.onGround && !r2.jumping) run++;
    else {
      if (run > 0) pause = Math.min(pause, run);
      run = 0;
    }
    // (how far it hops in all, wherever its panic takes it: vanilla's random spot within five blocks)
    far += Math.hypot(r2.x - px, r2.z - pz);
    px = r2.x; pz = r2.z;
  }
  check('hurt, it bolts: hardly a pause between hops', panicked && pause <= 3 && far > 6, `pause ${pause} hopped ${far.toFixed(1)}`);
}

// --- up a step, even ambling (a high hop for a climb)
{
  const { world, level } = makeLevel('plains');
  playerAt(level, -10, 64, -10, 'creative');
  for (let x = 3; x <= 10; x++) for (let z = -3; z <= 3; z++) world.setState(x, 64, z, S('grass_block'));
  const r = mobAt(level, 'rabbit', 0, 64, 0);
  settle(level, 3);
  dropGoal(r, 'WaterAvoidingRandomStrollGoal');
  dropGoal(r, 'RaidGardenGoal');
  r.navigation.moveTo(6.5, 65, 0.5, 0.6);
  let up = false;
  for (let i = 0; i < 400 && !up; i++) {
    level.tick();
    up = r.onGround && r.y >= 65;
    if (r.navigation.isDone() && !up) r.navigation.moveTo(6.5, 65, 0.5, 0.6);
  }
  check('it hops up a block, even ambling', up, r.y.toFixed(2));
}

// --- keeping away
{
  const { level } = makeLevel('plains');
  const pl = playerAt(level, 0, 64, 0);
  const r = mobAt(level, 'rabbit', 4, 64, 0);
  let fled = false, far = 0;
  for (let i = 0; i < 300; i++) {
    level.tick();
    if (running(r, 'RabbitAvoidEntityGoal')) fled = true;
    far = Math.max(far, Math.hypot(r.x - pl.x, r.z - pl.z));
  }
  check('it keeps away from a player', fled && far > 8, far.toFixed(1));
  const { level: l2 } = makeLevel('plains');
  playerAt(l2, 0, 64, 0, 'creative');
  const r2 = mobAt(l2, 'rabbit', 4, 64, 0);
  let fled2 = false;
  for (let i = 0; i < 200; i++) {
    l2.tick();
    if (running(r2, 'RabbitAvoidEntityGoal')) fled2 = true;
  }
  check('...but not from one in creative', !fled2);
  const { level: l3 } = makeLevel('plains');
  playerAt(l3, 20, 64, 20, 'creative');
  const r3 = mobAt(l3, 'rabbit', 0, 64, 0), z = mobAt(l3, 'zombie', 3, 64, 0), w = mobAt(l3, 'wolf', 0, 64, 7);
  z.moveSpeedAttr = 0;
  w.moveSpeedAttr = 0;
  let fromZombie = false;
  for (let i = 0; i < 100; i++) {
    l3.tick();
    if (running(r3, 'RabbitAvoidEntityGoal')) fromZombie = true;
  }
  check('...and from monsters and wolves', fromZombie && !!w);
}

// --- the killer bunny
{
  const { level, sounds } = makeLevel('plains');
  const pl = playerAt(level, 0, 64, 0);
  const k = spawner.createMob('rabbit', level);
  k.moveTo(7.5, 64, 0.5, 0, 0);
  k.readSummonData({ RabbitType: 99 });
  level.addEntity(k);
  check('RabbitType 99: the killer bunny, named, armoured, biting for 8', k.variant === 99 && k.customName === 'The Killer Bunny' && k.armorValue() === 8 && k.attackDamage === 8);
  const named = spawner.createMob('rabbit', level);
  named.setCustomName('Bob');
  named.readSummonData({ RabbitType: 99 });
  check('...keeping a name it has', named.customName === 'Bob' && named.variant === 99);
  let targeted = false, fled = false;
  const h0 = pl.health;
  for (let i = 0; i < 400 && pl.health >= h0; i++) {
    level.tick();
    if (k.target === pl) targeted = true;
    if (running(k, 'RabbitAvoidEntityGoal')) fled = true;
  }
  check('it comes for a player and bites', targeted && pl.health < h0 && !fled, `${h0} -> ${pl.health}`);
  check('its bite is heard', sounds.some((s) => s.n === 'entity.rabbit.attack'));
  const { level: l2 } = makeLevel('plains');
  playerAt(l2, 0, 64, 0, 'creative');
  const k2 = spawner.createMob('rabbit', l2);
  k2.moveTo(4.5, 64, 4.5, 0, 0);
  k2.setVariant(99);
  l2.addEntity(k2);
  const wolf = mobAt(l2, 'wolf', 8, 64, 4);
  // (held still and toothless: a wolf hunts rabbits, and one bite would end the race)
  wolf.moveSpeedAttr = 0;
  wolf.attackDamage = 0;
  let got = false;
  for (let i = 0; i < 400 && !got; i++) {
    l2.tick();
    got = k2.target === wolf;
  }
  check('...and wolves', got);
  // (on its own: a killer bunny that's bitten calls every rabbit about onto its biter, as vanilla's alertOthers does)
  const { level: l3 } = makeLevel('plains');
  playerAt(l3, 0, 64, 0, 'creative');
  const plain = mobAt(l3, 'rabbit', 4, 64, 4);
  const wolf3 = mobAt(l3, 'wolf', 8, 64, 4);
  wolf3.moveSpeedAttr = 0;
  wolf3.attackDamage = 0;
  settle(l3, 100);
  check('an ordinary rabbit hunts nothing', plain.target === null);
}

// --- raiding the garden
{
  const garden = (grief, dist) => {
    const { world, level, sounds } = makeLevel('plains');
    level.gameRules.mobGriefing = grief;
    playerAt(level, -12, 64, -12, 'creative');
    world.setState(3, 63, 0, S('farmland'));
    const ripe = BLOCKS[STATE_BLOCK[S('carrots')]].with(S('carrots'), 'age', 7);
    world.setState(3, 64, 0, ripe);
    const r = mobAt(level, 'rabbit', 3 - dist, 64, 0);
    return { world, level, r, sounds, age: () => BLOCKS[STATE_BLOCK[world.getState(3, 64, 0)]].get(world.getState(3, 64, 0), 'age') };
  };
  const g = garden(true, 0);
  settle(g.level, 4);
  check('a hungry rabbit nibbles a ripe carrot back a stage, with a crunch', g.age() === 6 && g.r.moreCarrotTicks > 30 && g.sounds.some((s) => s.n === 'block.crop.break'), `age ${g.age()} more ${g.r.moreCarrotTicks}`);
  settle(g.level, 600);
  check('...and the carrot no longer ripe, leaves it be', g.age() === 6);
  const off = garden(false, 0);
  settle(off.level, 1200);
  check('not with mobGriefing off', off.age() === 7);
  // from further off: as in vanilla the goal gives up two ticks in (its chosen carrot no longer "valid"), but the
  // path it set carries the rabbit over to the carrot's side (to within a block of it: the path's accuracy)
  const w = garden(true, 5);
  // (the goals are only there after its first tick; then no wandering off)
  w.level.tick();
  dropGoal(w.r, 'WaterAvoidingRandomStrollGoal');
  let started = -1, longest = 0, pathKept = false, wasOn = false;
  for (let i = 0; i < 1000; i++) {
    w.level.tick();
    const on = running(w.r, 'RaidGardenGoal');
    if (on && !wasOn) started = i;
    if (!on && wasOn) {
      longest = Math.max(longest, i - started);
      if (!w.r.navigation.isDone()) pathKept = true;
    }
    wasOn = on;
  }
  const off2 = Math.hypot(w.r.x - 3.5, w.r.z - 0.5);
  check('from five blocks off it hops over to the carrot\'s side (its goal given up two ticks in, its path kept)', started >= 0 && longest <= 3 && pathKept && off2 < 1.6, `longest ${longest} off ${off2.toFixed(2)}`);
}

// --- where they spawn
{
  const pick = (biome) => spawner.biomeSettings(biomes.BIOME_ID[biome]).creature.find((d) => d.type === 'rabbit');
  const is = (d, w, a, b) => !!d && d.weight === w && d.min === a && d.max === b;
  check('snowy plains and ice spikes 10 (2-3), the desert, flower forest, taigas and snowy slopes 4 (2-3), the grove 8, the meadow and cherry grove 2 (2-6)',
    is(pick('snowy_plains'), 10, 2, 3) && is(pick('ice_spikes'), 10, 2, 3) && is(pick('desert'), 4, 2, 3) && is(pick('flower_forest'), 4, 2, 3) && is(pick('taiga'), 4, 2, 3)
    && is(pick('snowy_taiga'), 4, 2, 3) && is(pick('old_growth_pine_taiga'), 4, 2, 3) && is(pick('old_growth_spruce_taiga'), 4, 2, 3) && is(pick('snowy_slopes'), 4, 2, 3)
    && is(pick('grove'), 8, 2, 3) && is(pick('meadow'), 2, 2, 6) && is(pick('cherry_grove'), 2, 2, 6));
  check('none on the plains, in the forest or on the peaks', !pick('plains') && !pick('forest') && !pick('frozen_peaks') && !pick('jagged_peaks') && !pick('savanna'));
  const { world, level } = makeLevel('desert');
  world.setState(2, 63, 0, S('sand'));
  world.setState(4, 63, 0, S('snow_block'));
  world.setState(6, 63, 0, S('stone'));
  const ns = new spawner.NaturalSpawner(level);
  const rule = (x) => ns.checkSpawnRules('rabbit', x, 64, 0);
  check('on grass, sand or snow, in the light; not on stone', rule(0) && rule(2) && rule(4) && !rule(6));
}

// --- saving
{
  const { level } = makeLevel();
  const r = spawner.createMob('rabbit', level);
  r.setVariant(5);
  r.moreCarrotTicks = 33;
  const r2 = spawner.createMob('rabbit', level);
  r2.load(r.save());
  check('its coat and its appetite kept', r2.variant === 5 && r2.moreCarrotTicks === 33);
  const k = spawner.createMob('rabbit', level);
  k.setVariant(99);
  const k2 = spawner.createMob('rabbit', level);
  k2.load(k.save());
  check('the killer bunny comes back itself', k2.variant === 99 && k2.customName === 'The Killer Bunny' && k2.armorValue() === 8);
  const odd = spawner.createMob('rabbit', level);
  odd.readSummonData({ RabbitType: 7 });
  check('an unknown RabbitType is brown', odd.variant === 0);
}

// --- its loot
{
  const { level } = makeLevel('plains');
  const r = mobAt(level, 'rabbit', 0, 64, 0);
  const roll = (n, byPlayer, looting, fire) => {
    const got = {};
    r.spawnAtLocation = (s) => { got[s.item.id] = (got[s.item.id] ?? 0) + s.count; got['#' + s.item.id] = Math.max(got['#' + s.item.id] ?? 0, s.count); };
    r.remainingFireTicks = fire ? 100 : 0;
    for (let i = 0; i < n; i++) r.dropLoot(byPlayer, looting);
    return got;
  };
  const a = roll(4000, false, 0, false);
  check('its hide and its meat, none or one of each (about half the time), no foot but to a player', a['#rabbit_hide'] === 1 && a['#rabbit'] === 1 && a.rabbit_hide > 1800 && a.rabbit_hide < 2200 && a.rabbit > 1800 && a.rabbit < 2200 && !a.rabbit_foot && !a.cooked_rabbit, JSON.stringify(a));
  const b = roll(6000, true, 0, false);
  check('its foot one time in ten when a player kills it', b.rabbit_foot > 510 && b.rabbit_foot < 690 && b['#rabbit_foot'] === 1, String(b.rabbit_foot));
  const c = roll(6000, true, 3, false);
  check('...19% with looting III, and up to four hides and four rabbits', c.rabbit_foot > 1000 && c.rabbit_foot < 1280 && c['#rabbit_hide'] === 4 && c['#rabbit'] === 4, `${c.rabbit_foot} ${c['#rabbit_hide']} ${c['#rabbit']}`);
  const d = roll(2000, false, 0, true);
  check('its meat cooked when it died burning', d.cooked_rabbit > 900 && !d.rabbit, JSON.stringify(d));
}

// --- the foods, and cooking them
{
  const { mods: [, I2, RC, RB], close: close3 } = await loadModules(['/src/world/blocks.ts', '/src/item/item.ts', '/src/inventory/recipes.ts', '/src/inventory/recipeBook.ts']);
  const f = (id) => I2.ITEMS.get(id)?.food;
  const { level } = makeLevel('plains');
  const pl = playerAt(level, 0, 64, 0);
  const eat = (id) => {
    pl.food.level = 5;
    pl.food.saturation = 0;
    pl.food.eat(f(id).nutrition, f(id).saturation);
    return `${pl.food.level - 5},${+pl.food.saturation.toFixed(4)}`;
  };
  check('raw rabbit: 3 hunger, 1.8 saturation', eat('rabbit') === '3,1.8', eat('rabbit'));
  check('cooked rabbit: 5 and 6', eat('cooked_rabbit') === '5,6', eat('cooked_rabbit'));
  check('rabbit stew: 10 and 12, the bowl back, one to a stack', eat('rabbit_stew') === '10,12' && f('rabbit_stew').remainder === 'bowl' && I2.ITEMS.get('rabbit_stew').maxStack === 1, eat('rabbit_stew'));
  check('their names', I2.prettyName('rabbit') === 'Raw Rabbit' && I2.prettyName('cooked_rabbit') === 'Cooked Rabbit' && I2.prettyName('rabbit_stew') === 'Rabbit Stew' && I2.prettyName('rabbit_foot') === "Rabbit's Foot" && I2.prettyName('rabbit_hide') === 'Rabbit Hide');
  const it = (id) => (id ? I2.ItemStack.of(id) : null);
  const craft = (rows) => RC.findRecipe(rows.flat().map(it), 3, 3)?.result;
  const stew = (m) => craft([[null, 'cooked_rabbit', null], ['carrot', 'baked_potato', m], [null, 'bowl', null]]);
  check('rabbit stew: the rabbit over a carrot, a baked potato and a mushroom (brown or red), over a bowl', stew('brown_mushroom') === 'rabbit_stew' && stew('red_mushroom') === 'rabbit_stew');
  const mirrored = craft([[null, 'cooked_rabbit', null], ['red_mushroom', 'baked_potato', 'carrot'], [null, 'bowl', null]]);
  const jumbled = craft([['cooked_rabbit', 'carrot', 'baked_potato'], ['brown_mushroom', 'bowl', null], [null, null, null]]);
  const raw = craft([[null, 'rabbit', null], ['carrot', 'baked_potato', 'red_mushroom'], [null, 'bowl', null]]);
  check('...mirrored too, but not any old way, nor with the rabbit raw', mirrored === 'rabbit_stew' && jumbled === undefined && raw === undefined);
  const sm = RC.smeltingResult(it('rabbit'));
  check('raw rabbit cooks in a furnace and a smoker', sm?.result === 'cooked_rabbit' && near(sm.xp, 0.35) && RC.cookingResult('smoker', it('rabbit'))?.result === 'cooked_rabbit' && RC.cookingResult('blast_furnace', it('rabbit')) === null);
  const book = RB.BOOK_RECIPES.filter((b) => b.result === 'rabbit_stew');
  check('in the recipe book: the two stews on one button', book.length === 2 && book.every((b) => b.group === 'rabbit_stew' && b.category === 'crafting_misc' && b.shaped));
  check('...and cooked rabbit with the furnace\'s and the smoker\'s food', RB.BOOK_RECIPES.some((b) => b.type === 'furnace' && b.result === 'cooked_rabbit' && b.category === 'furnace_food') && RB.BOOK_RECIPES.some((b) => b.type === 'smoker' && b.result === 'cooked_rabbit'));
  await close3();
}

// --- looks and sounds
{
  const { mods: [, , T, A, RR, ER], close: close2 } = await loadModules(['/src/world/blocks.ts', '/src/item/item.ts', '/src/textures/mobs.ts', '/src/audio/synth.ts', '/src/render/rabbitRenderer.ts', '/src/render/entityRenderer.ts']);
  const def = RR.rabbitModel();
  const parts = [...def.root.children.keys()].sort().join(',');
  check('the model: RabbitModel\'s twelve parts, 64x32', parts === 'body,head,left_ear,left_front_leg,left_haunch,left_hind_foot,nose,right_ear,right_front_leg,right_haunch,right_hind_foot,tail' && def.texW === 64 && def.texH === 32, parts);
  // drawn as the dispatcher's drawModel does it, group by group: where its top and its feet are, in blocks (y down)
  const extent = (groups) => {
    const pose = new ER.PoseStack();
    let lo = Infinity, hi = -Infinity, n = 0;
    const batch = { quad(ps, p) { const m = ps.m; for (let i = 0; i < 12; i += 3) { const y = m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13]; lo = Math.min(lo, y); hi = Math.max(hi, y); } n++; } };
    for (const g of groups) {
      pose.push(); pose.scale(...g.scale); pose.translate(...g.translate);
      for (const k of g.parts) def.root.child(k).render(batch, pose, def.texW, def.texH);
      pose.pop();
    }
    return [lo, hi, n];
  };
  const [top, feet, quads] = extent(def.groups);
  check('grown, the whole of it at 0.6, standing on the ground', near(feet, 1.5, 0.01) && quads === 12 * 6 && def.groups[0].scale[0] === 0.6, `${top.toFixed(3)}..${feet.toFixed(3)}`);
  const [btop, bfeet] = extent(def.babyGroups);
  check('a baby: its head big on a small body, on the ground too', near(bfeet, 1.5, 0.01) && def.babyGroups.length === 2 && def.babyGroups[0].parts.includes('head') && def.babyGroups[1].scale[0] === 0.4 && 1.5 - btop < 1.5 - top, `${btop.toFixed(3)}..${bfeet.toFixed(3)}`);
  const { level } = makeLevel();
  const r = spawner.createMob('rabbit', level);
  r.jumpDuration = 10; r.jumpTicks = 5;
  RR.animateRabbit(def.root, r, { headPitch: 10, headYaw: 20 }, 0);
  const deg = (k) => def.root.child(k).xRot / (Math.PI / 180);
  check('mid-hop, its haunches and hind feet kick back and its forelegs reach forward', near(deg('left_haunch'), 29, 1e-3) && near(deg('right_hind_foot'), 50, 1e-3) && near(deg('left_front_leg'), -51, 1e-3) && near(def.root.child('head').yRot, 20 * Math.PI / 180, 1e-6) && near(def.root.child('left_ear').yRot, (20 * Math.PI / 180) + Math.PI / 12, 1e-6));
  r.jumpDuration = 0; r.jumpTicks = 0;
  RR.animateRabbit(def.root, r, { headPitch: 0, headYaw: 0 }, 0);
  check('...and sits folded between hops', near(deg('left_haunch'), -21, 1e-3) && near(deg('left_hind_foot'), 0, 1e-3) && near(deg('right_front_leg'), -11, 1e-3));
  // the skins: every coat, the killer bunny's and Toast's, each part's faces painted, the eyes where the head's sides are
  const cubes = [];
  for (const p of def.root.children.values()) for (const c of p.cubes) cubes.push(c);
  const names = ['brown', 'white', 'black', 'white_splotched', 'gold', 'salt', 'caerbannog', 'toast'];
  let painted = 0;
  const eyes = new Set();
  for (const n of names) {
    const t = T.MOB_TEXTURES['rabbit_' + n]?.();
    if (!t || t.w !== 64 || t.h !== 32) continue;
    const a = (x, y) => t.data[(y * t.w + x) * 4 + 3];
    let holes = 0;
    for (const c of cubes) {
      const f = [[c.u + c.d, c.v, c.w, c.d], [c.u + c.d + c.w, c.v, c.w, c.d], [c.u, c.v + c.d, c.d, c.h], [c.u + c.d, c.v + c.d, c.w, c.h], [c.u + c.d + c.w, c.v + c.d, c.d, c.h], [c.u + 2 * c.d + c.w, c.v + c.d, c.w, c.h]];
      for (const [x0, y0, w, h] of f) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (a(x, y) !== 255) holes++;
    }
    const rgb = (x, y) => (t.data[(y * t.w + x) * 4] << 16) | (t.data[(y * t.w + x) * 4 + 1] << 8) | t.data[(y * t.w + x) * 4 + 2];
    // the head's right side is (32,5) 5x4, its front end at the right; the left side (42,5), its front end at the left
    if (holes === 0 && rgb(35, 6) === rgb(43, 6) && rgb(35, 6) !== rgb(33, 7)) painted++;
    eyes.add(rgb(35, 6));
  }
  check('eight skins, 64x32, every face painted, an eye on each side', painted === 8, String(painted));
  check('...red eyes on the white one and the killer bunny, dark ones on the rest', eyes.size >= 4);
  const tex = (v, name) => { const e = spawner.createMob('rabbit', level); e.setVariant(v); if (name) e.customName = name; return RR.rabbitTexture(e); };
  check('the coats\' skins, the killer bunny\'s its own', tex(0) === 'rabbit_brown' && tex(3) === 'rabbit_white_splotched' && tex(5) === 'rabbit_salt' && tex(99) === 'rabbit_caerbannog');
  check('one named Toast is Toast, whatever its coat (and its name\'s colour)', tex(2, 'Toast') === 'rabbit_toast' && tex(99, '§6Toast') === 'rabbit_toast' && tex(0, 'toast') === 'rabbit_brown');
  check('its shadow', RR.RABBIT_SHADOW_RADII.rabbit === 0.3);
  const own = { ambient: 3, hurt: 4, death: 3, jump: 4, attack: 1 };
  let good = 0;
  for (const [k, n] of Object.entries(own)) {
    const g = A.SOUNDS['entity.rabbit.' + k];
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
  check('its sounds, every take heard', good === 5, String(good));
  await close2();
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
