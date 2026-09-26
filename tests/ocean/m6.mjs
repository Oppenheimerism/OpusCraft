// Headless checks for Stage 5 M6 (node tests/ocean/m6.mjs): turtles — their attributes, their spawning on beaches,
// breeding into a clutch of eggs dug into the sand by home, the turtle egg (placing it, the clutch, its shapes, drops,
// hatching by random tick, trampling), babies growing up with a scute, the turtle shell's water breathing and the
// potion of the Turtle Master, lightning, zombies stamping out eggs and the hunters of babies on land, the water
// (travel, the sinking rule, its speeds, breathing), saving, and the sounds, textures, block models and renderer
// (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/turtle.ts', '/src/entity/turtlePredators.ts',
  '/src/game/turtleEggs.ts', '/src/game/blockBehavior.ts', '/src/game/interaction.ts', '/src/item/potions.ts', '/src/item/equipment.ts',
  '/src/inventory/recipes.ts', '/src/inventory/enchantMenus.ts', '/src/entity/lightning.ts', '/src/entity/ai/navigation.ts',
  '/src/render/turtleRenderer.ts', '/src/render/oceanRenderers.ts', '/src/render/entityRenderer.ts', '/src/textures/mobs.ts',
  '/src/textures/blocks.ts', '/src/textures/items.ts', '/src/audio/synth.ts', '/src/game/redstone/piston.ts', '/src/render/environment.ts',
  '/src/entity/effects.ts', '/src/world/mapColors.ts', '/src/world/constants.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK, COLLISION, getBlock } = M['world/block'];
const { ITEMS, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const TU = M['entity/turtle'], TP = M['entity/turtlePredators'], BEH = M['game/blockBehavior'], POT = M['item/potions'];
const spawner = M['game/spawner'];
const { Turtle } = TU;
const { SEA_LEVEL } = M['world/constants'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const EGG = getBlock('turtle_egg');

/**
 * a beach: stone below, the sea west of x = 0 (water from y 52 up to the sea's surface, 62, over sand sloping down
 * a block a block out to x = -8), sand east of it up to y 62 (so a turtle stands on it at 63); all of it in the beach
 * biome (or `biome`)
 */
function setup({ biome = B.beach, allSand = false } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(biome); world.chunks.set(c.key, c); }
  for (let x = -64; x < 64; x++) for (let z = -64; z < 64; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 40; y <= 51; y++) c.setState(x & 15, y, z & 15, S('stone'));
    if (x < 0 && !allSand) for (let y = 52; y <= 62; y++) c.setState(x & 15, y, z & 15, S(x >= -8 && y <= 62 + x ? 'sand' : 'water'));
    else {
      for (let y = 52; y <= 58; y++) c.setState(x & 15, y, z & 15, S('stone'));
      for (let y = 59; y <= 62; y++) c.setState(x & 15, y, z & 15, S('sand'));
    }
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'turtles');
  const sounds = [], parts = [], breaks = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak(x, y, z, st) { breaks.push({ x, y, z, st, t: level.gameTime }); }, blockHit() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z, t: level.gameTime }); }, entityEffect() {} };
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(12.5, 63, 20.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, breaks };
}
const spawn = (level, type, x, y, z) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  level.addEntity(m);
  return m;
};
/** ticks the level, the player held where it is; stops early when `until` holds */
const tickPinned = (level, player, n, until) => {
  const [px, py, pz] = [player.x, player.y, player.z];
  for (let i = 0; i < n; i++) {
    level.tick();
    player.moveTo(px, py, pz, player.yaw, player.pitch);
    player.dx = player.dy = player.dz = 0;
    player.fallDistance = 0;
    player.air = 300;
    if (until?.(i)) return i + 1;
  }
  return n;
};
const items = (level, id) => level.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id === id);
const eggAt = (world, x, y, z) => { const st = world.getState(x, y, z); return STATE_BLOCK[st] === EGG.id ? { eggs: EGG.get(st, 'eggs'), hatch: EGG.get(st, 'hatch') } : null; };
const goalsOf = (m) => { m.ensureGoals(); return [...m.goalSelector.goals.map((w) => w.goal), ...m.targetSelector.goals.map((w) => w.goal)]; };

// --- the turtle itself
{
  const { level } = setup();
  const t = spawn(level, 'turtle', 4.5, 63, 4.5);
  check('a turtle: 30 health, speed 0.25, a full block\'s step, 1.2 x 0.4', t instanceof Turtle && t.maxHealth === 30 && t.health === 30 && t.moveSpeedAttr === 0.25 && t.stepHeight === 1 && near(t.width, 1.2) && near(t.height, 0.4));
  check('...its home where it appeared, nowhere to travel yet', t.homePos.join() === '4,63,4' && t.travelPos.join() === '0,0,0' && !t.hasEgg && !t.goingHome && !t.travelling);
  check('...breathes underwater, isn\'t carried by currents, takes a lead', t.canBreatheUnderwater() && !t.isPushedByFluid() && t.canBeLeashed());
  check('...finds its way on land and in water (amphibious)', t.navigation instanceof M['entity/ai/navigation'].AmphibiousPathNavigation);
  check('...seagrass is its food', t.isFood(ItemStack.of('seagrass')) && !t.isFood(ItemStack.of('wheat')));
  const g = goalsOf(t).map((x) => x.constructor.name);
  check('its goals in vanilla\'s order', g.join() === 'TurtlePanicGoal,TurtleBreedGoal,TurtleLayEggGoal,TemptGoal,TurtleGoToWaterGoal,TurtleGoHomeGoal,TurtleTravelGoal,LookAtPlayerGoal,TurtleRandomStrollGoal', g.join());
  t.setAge(-24000);
  check('a baby is 0.3 of the size', t.isBaby() && near(t.width, 0.36) && near(t.height, 0.12));
  t.setAge(0);
  check('...grown, full size again', near(t.width, 1.2) && near(t.height, 0.4));
  check('its name', spawner.entityDisplayName('turtle') === 'Turtle');
}

// --- spawning
{
  const { level, world } = setup();
  const rule = (x, y, z) => Turtle.checkTurtleSpawnRules(level, x, y, z);
  world.setState(20, 62, 20, S('stone'));
  for (let y = 63; y <= 65; y++) world.setState(24, y, 24, S('sand'));
  world.setState(26, 62, 26, S('red_sand'));
  check('spawns on sand, low on the beach, in the light', rule(4, 63, 4) && rule(26, 63, 26) && !rule(20, 63, 20));
  check('...below four over the sea\'s surface', SEA_LEVEL === 63 && rule(24, 66, 24) === true && (world.setState(24, 66, 24, S('sand')), rule(24, 67, 24)) === false);
  const rb = level.rawBrightness;
  level.rawBrightness = () => 8;
  const dark = rule(4, 63, 4);
  level.rawBrightness = () => 9;
  const lit = rule(4, 63, 4);
  level.rawBrightness = rb;
  check('...where the light is over 8', !dark && lit);
  const sp = new spawner.NaturalSpawner(level, 1);
  const list = sp.mobsAt('creature', 4, 63, 4);
  check('a beach\'s creatures: turtles, weight 5, two to five', list.length === 1 && list[0].type === 'turtle' && list[0].weight === 5 && list[0].min === 2 && list[0].max === 5);
  check('...through the spawner\'s own rules', sp.checkSpawnRules('turtle', 4, 63, 4) && !sp.checkSpawnRules('turtle', 20, 63, 20));
  for (const b of [B.snowy_beach, B.stony_shore]) world.getChunk(2, 2).biomes.fill(b), check(`none on a ${b === B.snowy_beach ? 'snowy beach' : 'stony shore'}`, sp.mobsAt('creature', 40, 63, 40).length === 0 || !sp.mobsAt('creature', 40, 63, 40).some((d) => d.type === 'turtle'));
}
{
  // a new stretch of beach: herds of turtles, each at home where it came
  const { level } = setup({ allSand: true });
  let got = [];
  for (let seed = 1; seed <= 4 && got.length === 0; seed++) {
    const sp = new spawner.NaturalSpawner(level, seed);
    for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) got.push(...sp.spawnForNewChunk(cx, cz));
  }
  const turtles = got.filter((e) => e.type === 'turtle');
  check('new beach chunks get turtles', turtles.length > 0 && turtles.length === got.length, `${turtles.length}/${got.length}`);
  check('...on the sand, each at home where it came', turtles.every((t) => t.y === 63 && t.homePos.join() === [Math.floor(t.x), 63, Math.floor(t.z)].join()));
}

// --- breeding: eggs, laid on the sand by home
{
  const { level, world, player, sounds, parts, breaks } = setup();
  const a = spawn(level, 'turtle', 6.5, 63, 6.5), b = spawn(level, 'turtle', 8.5, 63, 6.5);
  player.inventory.main[0] = ItemStack.of('seagrass', 2);
  player.inventory.selected = 0;
  const fedA = a.interact(player, player.inventory.selectedItem);
  const fedB = b.interact(player, player.inventory.selectedItem);
  check('fed seagrass, both fall in love', fedA && fedB && a.isInLove() && b.isInLove() && !player.inventory.selectedItem);
  let bred = null;
  level.onBred = (child, cause) => (bred = { child, cause });
  tickPinned(level, player, 600, () => a.hasEgg || b.hasEgg);
  const mother = a.hasEgg ? a : b, other = mother === a ? b : a;
  const turtles = level.entities.filter((e) => e.type === 'turtle');
  check('bred: one of them carries eggs, and no baby', mother.hasEgg && !other.hasEgg && turtles.length === 2);
  check('...both rest five minutes', a.age > 5900 && b.age > 5900 && !a.isInLove() && !b.isInLove(), `${a.age} ${b.age}`);
  check('...experience for it', level.entities.some((e) => e.type === 'experience_orb'));
  check('...the breeding counted (the pair: there\'s no baby)', bred?.child === mother && bred.cause === player);
  check('...no more love while carrying eggs', !mother.canFallInLove());
  let dug = 0, maxCounter = 0;
  const found = () => {
    for (let x = -10; x <= 30; x++) for (let z = -10; z <= 30; z++) if (eggAt(world, x, 63, z)) return [x, 63, z];
    return null;
  };
  let at = null;
  tickPinned(level, player, 900, () => {
    if (mother.isLayingEgg()) dug++;
    maxCounter = Math.max(maxCounter, mother.layEggCounter);
    return (at = found()) !== null;
  });
  const h = mother.homePos;
  const e = at && eggAt(world, ...at);
  check('laid: a clutch of 1-4 eggs', e && e.eggs >= 1 && e.eggs <= 4 && e.hatch === 0, JSON.stringify(e));
  check('...on sand, within 9 of home', at && name(world.getState(at[0], 62, at[2])) === 'sand' && (at[0] + 0.5 - (h[0] + 0.5)) ** 2 + (at[2] + 0.5 - (h[2] + 0.5)) ** 2 < 81, `${at} home ${h}`);
  // (digging stops while it's off the spot: its way home keeps leading it about, as vanilla's does)
  check('...after digging ten seconds', dug >= 200 && maxCounter === 201, `${dug} ${maxCounter}`);
  const digs = sounds.filter((s) => s.n === 'block.sand.break');
  // (at least every fifth count of its digging; vanilla's check runs every tick, so while its way home holds the
  // count on a multiple of five, every tick)
  check('...sand flying every quarter second while it dug', digs.length >= 38 && breaks.filter((x) => name(x.st) === 'sand').length === digs.length, `${digs.length}`);
  check('...the laying\'s sound (0.3)', sounds.some((s) => s.n === 'entity.turtle.lay_egg' && s.v === 0.3 && s.p >= 0.9 && s.p <= 1.1));
  check('...and done: no eggs carried, no more digging', !mother.hasEgg && !mother.isLayingEgg());
  check('...green sparkles over the new clutch on the sand', parts.filter((p) => p.k === 'happy_villager').length >= 15);
}

// --- the egg: placing, the clutch, shapes, drops
{
  const { level, world, player, sounds, parts } = setup();
  const inter = new M['game/interaction'].Interaction(level, player);
  const hitTop = (x, y, z) => ({ x, y, z, face: 1, hx: x + 0.5, hy: y + 1, hz: z + 0.5, state: world.getState(x, y, z), dist: 3 });
  player.inventory.main[0] = ItemStack.of('turtle_egg', 10);
  player.inventory.selected = 0;
  const place = (x, y, z) => inter.placeBlock(hitTop(x, y, z), player.inventory.selectedItem);
  parts.length = 0;
  place(10, 62, 10);
  check('placed on the sand: one egg', eggAt(world, 10, 63, 10)?.eggs === 1 && player.inventory.selectedItem.count === 9);
  check('...sparkles', parts.filter((p) => p.k === 'happy_villager').length === 15 && parts.every((p) => p.y >= 63 && p.y <= 63 + 7 / 16 + 1e-9));
  for (let i = 0; i < 3; i++) place(10, 63, 10);
  check('more go into the clutch, up to four', eggAt(world, 10, 63, 10)?.eggs === 4 && !eggAt(world, 10, 64, 10));
  place(10, 63, 10);
  check('...a fifth goes on top', eggAt(world, 10, 63, 10)?.eggs === 4 && eggAt(world, 10, 64, 10)?.eggs === 1);
  place(12, 62, 12);
  player.input.sneak = true;
  place(12, 63, 12);
  player.input.sneak = false;
  check('sneaking, one goes beside instead (on top)', eggAt(world, 12, 63, 12)?.eggs === 1 && eggAt(world, 12, 64, 12)?.eggs === 1);
  const box = (st) => COLLISION[st][0].map((v) => Math.round(v * 16)).join();
  check('shapes: one egg 3..12, more 1..15, 7 high', box(S('turtle_egg', { eggs: 1 })) === '3,0,3,12,7,12' && box(S('turtle_egg', { eggs: 3 })) === '1,0,1,15,7,15');
  check('metal\'s sounds (as vanilla has it), strength 0.5, random ticks', EGG.sound === 'metal' && EGG.hardness === 0.5 && EGG.s.randomTicks === true);
  check('a piston breaks it', M['game/redstone/piston'].pushReaction(S('turtle_egg')) === 'destroy');
  check('sand\'s colour on maps', M['world/mapColors'].mapColorOf(S('turtle_egg')) === M['world/mapColors'].mapColorOf(S('sand')));
  // breaking
  world.setState(14, 63, 14, S('turtle_egg', { eggs: 3 }));
  player.inventory.main[0] = null;
  sounds.length = 0;
  inter.destroyBlock(14, 63, 14);
  tickPinned(level, player, 1);
  check('broken by hand: one egg lost, nothing dropped', eggAt(world, 14, 63, 14)?.eggs === 2 && items(level, 'turtle_egg').length === 0 && sounds.some((s) => s.n === 'entity.turtle.egg_break' && s.v === 0.7));
  const pick = ItemStack.of('iron_pickaxe');
  pick.tag = { enchantments: { silk_touch: 1 } };
  player.inventory.main[0] = pick;
  inter.destroyBlock(14, 63, 14);
  tickPinned(level, player, 1);
  check('with silk touch: one egg dropped, the rest stay', eggAt(world, 14, 63, 14)?.eggs === 1 && items(level, 'turtle_egg').length === 1);
  inter.destroyBlock(14, 63, 14);
  tickPinned(level, player, 1);
  check('...the last one takes the block', world.getState(14, 63, 14) === 0 && items(level, 'turtle_egg').reduce((n, e) => n + e.stack.count, 0) === 2);
  player.gameMode = 'creative';
  world.setState(16, 63, 16, S('turtle_egg', { eggs: 4 }));
  inter.destroyBlock(16, 63, 16);
  check('in creative the whole clutch goes', world.getState(16, 63, 16) === 0);
  const it = ITEMS.get('turtle_egg');
  check('the item: a flat egg, with the natural blocks', it.texture === 'turtle_egg' && it.creativeTab === 'natural' && it.block === EGG);
}

// --- hatching by random tick
{
  const { level, world, player, sounds } = setup();
  const env = M['render/environment'];
  check('the hatching hour: 0.65-0.69 of the day (just before dawn)', env.timeOfDay(21500) > 0.65 && env.timeOfDay(21500) < 0.69 && env.timeOfDay(6000) < 0.65 && env.timeOfDay(22500) > 0.69);
  const st0 = S('turtle_egg', { eggs: 3 });
  world.setState(16, 63, 16, st0);
  const rt = (x, y, z) => BEH.behaviorOf(world.getState(x, y, z)).randomTick(level, x, y, z, world.getState(x, y, z));
  const nextInt = level.random.nextInt.bind(level.random);
  level.dayTime = 6000;
  level.random.nextInt = (n) => (n === 500 ? 1 : nextInt(n));
  rt(16, 63, 16);
  check('in the day, most random ticks do nothing', eggAt(world, 16, 63, 16).hatch === 0);
  level.random.nextInt = (n) => (n === 500 ? 0 : nextInt(n));
  rt(16, 63, 16);
  check('...one in 500 cracks it', eggAt(world, 16, 63, 16).hatch === 1 && sounds.some((s) => s.n === 'entity.turtle.egg_crack' && s.v === 0.7));
  level.random.nextInt = (n) => (n === 500 ? 1 : nextInt(n));
  level.dayTime = 21500;
  rt(16, 63, 16);
  check('before dawn every one does', eggAt(world, 16, 63, 16).hatch === 2);
  rt(16, 63, 16);
  level.random.nextInt = nextInt;
  tickPinned(level, player, 1);
  const babies = level.entities.filter((e) => e.type === 'turtle');
  check('cracked twice, it hatches: a baby an egg, the block gone', world.getState(16, 63, 16) === 0 && babies.length === 3 && sounds.some((s) => s.n === 'entity.turtle.egg_hatch'));
  check('...each a baby (-24000), at home there', babies.every((t) => t.isBaby() && t.age >= -24000 && t.age < -23990 && t.homePos.join() === '16,63,16'));
  const xs = babies.map((t) => t.x - 16).sort().map((v) => v.toFixed(1)).join();
  check('...set out in a row', xs === '0.3,0.5,0.7' || babies.every((t) => Math.abs(t.z - 16.3) < 0.2), xs);
  world.setState(18, 63, 18, S('turtle_egg'));
  world.setState(18, 62, 18, S('stone'));
  rt(18, 63, 18);
  check('off the sand it never hatches', eggAt(world, 18, 63, 18).hatch === 0);
  // through the level's own random ticks
  world.setState(20, 63, 20, S('turtle_egg'));
  level.simulationDistance = 1;
  level.randomTicks.speed = 4096;
  let n = 0;
  tickPinned(level, player, 20, () => (++n, !eggAt(world, 20, 63, 20) || eggAt(world, 20, 63, 20).hatch > 0));
  check('...the level\'s random ticks crack it before dawn', !eggAt(world, 20, 63, 20) || eggAt(world, 20, 63, 20).hatch > 0, `${n} ticks`);
  level.randomTicks.speed = 3;
}

// --- trampling
{
  const { level, world, player } = setup();
  const X = 20, Y = 63, Z = 20;
  const set = (n) => world.setState(X, Y, Z, S('turtle_egg', { eggs: n }));
  const standOn = (e) => { e.moveTo(X + 0.5, Y + 7 / 16, Z + 0.5, 0, 0); e.onGround = false; e.move(0, -0.05, 0); };
  const nextInt = level.random.nextInt.bind(level.random);
  const always = (n) => (n === 100 || n === 3 ? 0 : nextInt(n));
  level.random.nextInt = always;
  set(2);
  standOn(player);
  check('walked over, an egg is crushed (1 in 100)', eggAt(world, X, Y, Z)?.eggs === 1);
  set(2);
  player.input.sneak = true;
  standOn(player);
  player.input.sneak = false;
  check('...not by a player sneaking', eggAt(world, X, Y, Z)?.eggs === 2);
  const t = spawn(level, 'turtle', 30.5, 63, 30.5), bat = spawn(level, 'bat', 30.5, 66, 30.5), z = spawn(level, 'zombie', 34.5, 63, 34.5);
  standOn(t);
  standOn(bat);
  check('...not by a turtle or a bat', eggAt(world, X, Y, Z)?.eggs === 2);
  level.gameRules.mobGriefing = false;
  standOn(z);
  check('...a mob only while mob griefing is on', eggAt(world, X, Y, Z)?.eggs === 2);
  level.gameRules.mobGriefing = true;
  standOn(z);
  check('...then a zombie crushes one too', eggAt(world, X, Y, Z)?.eggs === 1);
  standOn(player);
  check('the last one crushed, the block goes', world.getState(X, Y, Z) === 0);
  // falling on them (1 in 3), but not a zombie
  level.random.nextInt = (n) => (n === 3 ? 0 : n === 100 ? 1 : nextInt(n));
  set(3);
  player.moveTo(X + 0.5, Y + 3, Z + 0.5, 0, 0);
  player.fallDistance = 0;
  player.dy = 0;
  player.onGround = false;
  for (let i = 0; i < 20 && !player.onGround; i++) player.move(0, player.dy -= 0.08, 0);
  check('a fall on them crushes one (1 in 3)', player.onGround && eggAt(world, X, Y, Z)?.eggs === 2);
  z.moveTo(X + 0.5, Y + 3, Z + 0.5, 0, 0);
  z.fallDistance = 0;
  z.dy = 0;
  z.onGround = false;
  for (let i = 0; i < 20 && !z.onGround; i++) z.move(0, z.dy -= 0.08, 0);
  check('...not a zombie\'s', z.onGround && eggAt(world, X, Y, Z)?.eggs === 2);
  level.random.nextInt = nextInt;
  // left to chance: a player standing on them a while
  set(4);
  player.moveTo(X + 0.5, Y + 7 / 16, Z + 0.5, 0, 0);
  let k = 0;
  for (; k < 2000 && eggAt(world, X, Y, Z)?.eggs === 4; k++) { player.dy = -0.08; player.move(0, -0.08, 0); }
  check('...standing on them, sooner or later', eggAt(world, X, Y, Z)?.eggs === 3, `${k} steps`);
}

// --- growing up
{
  const { level, player } = setup();
  const baby = spawn(level, 'turtle', 4.5, 63, 4.5);
  baby.setAge(-3);
  tickPinned(level, player, 5);
  const sc = items(level, 'turtle_scute');
  check('a baby growing up sheds a turtle scute', !baby.isBaby() && sc.length === 1 && sc[0].stack.count === 1 && Math.abs(sc[0].y - (baby.y + 1)) < 0.5);
  level.gameRules.doMobLoot = false;
  const b2 = spawn(level, 'turtle', 8.5, 63, 4.5);
  b2.setAge(-3);
  tickPinned(level, player, 5);
  check('...not with mob loot off', !b2.isBaby() && items(level, 'turtle_scute').length === 1);
  const g = spawn(level, 'turtle', 12.5, 63, 4.5);
  g.setAge(-24000);
  g.setAge(0);
  check('...nor grown by a spawn egg or feeding (only on the way up)', items(level, 'turtle_scute').length === 1);
}

// --- the turtle shell
{
  const { level, player, world } = setup();
  const helmet = ITEMS.get('turtle_helmet');
  check('the turtle shell: 2 armour, 275 uses, a helmet', helmet.armor.defense === 2 && helmet.maxDamage === 275 && helmet.armor.slot === 'head' && helmet.name === 'Turtle Shell');
  check('...its equip sound', M['item/equipment'].equipSound(helmet) === 'item.armor.equip_turtle');
  const g = [];
  for (const ch of 'XXXX X') g.push(ch === 'X' ? ItemStack.of('turtle_scute') : null);
  const r = M['inventory/recipes'].findRecipe(g, 3, 2);
  check('...made of five scutes', r?.result === 'turtle_helmet');
  check('...mended with scutes', M['inventory/enchantMenus'].isValidRepairItem(helmet, ItemStack.of('turtle_scute')) && !M['inventory/enchantMenus'].isValidRepairItem(helmet, ItemStack.of('iron_ingot')));
  player.inventory.armor[3] = ItemStack.of('turtle_helmet');
  tickPinned(level, player, 1);
  const wb = player.getEffect('water_breathing');
  check('worn out of the water: water breathing, 10 s, no swirls, the icon', wb && wb.duration >= 199 && wb.duration <= 200 && wb.amplifier === 0 && !wb.ambient && !wb.visible && wb.showIcon, wb && `${wb.duration} ${wb.visible} ${wb.showIcon}`);
  // under the water it isn't topped up
  player.moveTo(-10.5, 55, 20.5, 0, 0);
  tickPinned(level, player, 30);
  const wb2 = player.getEffect('water_breathing');
  check('...under the water it runs down', wb2 && wb2.duration <= 175 && wb2.duration >= 165, wb2 && `${wb2.duration}`);
  player.inventory.armor[3] = null;
  player.moveTo(12.5, 63, 20.5, 0, 0);
  player.removeEffect?.('water_breathing');
  tickPinned(level, player, 2);
  check('...not without it', !player.hasEffect('water_breathing'));
  void world;
}

// --- the potion of the Turtle Master
{
  const awk = POT.potionStack('potion', 'awkward');
  const tm = POT.brewMix(ItemStack.of('turtle_helmet'), awk);
  const long = POT.brewMix(ItemStack.of('redstone'), tm), strong = POT.brewMix(ItemStack.of('glowstone_dust'), tm);
  check('brewed: an awkward potion and a turtle shell', POT.hasMix(awk, ItemStack.of('turtle_helmet')) && POT.contentsOf(tm)?.potion === 'turtle_master');
  check('...redstone for a long one, glowstone for a strong one', POT.contentsOf(long)?.potion === 'long_turtle_master' && POT.contentsOf(strong)?.potion === 'strong_turtle_master');
  const fx = (id) => POT.potionEffects(id).map((e) => `${e.effect.id}:${e.duration}:${e.amplifier}`).join(' ');
  check('...slowness IV and resistance III, 20 s', fx('turtle_master') === 'slowness:400:3 resistance:400:2', fx('turtle_master'));
  check('...long: 40 s', fx('long_turtle_master') === 'slowness:800:3 resistance:800:2');
  check('...strong: slowness VI and resistance IV, 20 s', fx('strong_turtle_master') === 'slowness:400:5 resistance:400:3');
  check('its names', POT.potionName('potion', { potion: 'turtle_master' }) === 'Potion of the Turtle Master' && POT.potionName('splash_potion', { potion: 'strong_turtle_master' }) === 'Splash Potion of the Turtle Master' && POT.potionName('tipped_arrow', { potion: 'long_turtle_master' }) === 'Arrow of the Turtle Master');
  const listed = ['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow'].every((id) => {
    const ps = ITEMS.get(id).creativeStacks().map((s) => POT.contentsOf(s)?.potion);
    return ['turtle_master', 'long_turtle_master', 'strong_turtle_master'].every((p) => ps.includes(p));
  });
  check('...all three in the creative tabs as potions, splash and lingering potions and tipped arrows', listed);
  check('...a lingering one into splash and lingering', POT.contentsOf(POT.brewMix(ItemStack.of('dragon_breath'), POT.brewMix(ItemStack.of('gunpowder'), tm)))?.potion === 'turtle_master' && POT.brewMix(ItemStack.of('dragon_breath'), POT.brewMix(ItemStack.of('gunpowder'), tm)).item.id === 'lingering_potion');
}

// --- lightning
{
  const { level, player } = setup();
  const t = spawn(level, 'turtle', 6.5, 63, 6.5);
  const bolt = new M['entity/lightning'].LightningBolt(level);
  bolt.moveTo(6.5, 63, 6.5, 0, 0);
  level.addEntity(bolt);
  tickPinned(level, player, 3);
  check('struck by lightning, a turtle dies outright', t.dead && t.health <= 0);
  // (the bolt's later flashes strike what it dropped too, as vanilla's do: the drops themselves from one strike)
  const t1 = spawn(level, 'turtle', 26.5, 63, 26.5);
  const bolt1 = new M['entity/lightning'].LightningBolt(level);
  bolt1.moveTo(26.5, 63, 26.5, 0, 0);
  t1.thunderHit(bolt1);
  tickPinned(level, player, 2);
  const bowls = items(level, 'bowl');
  check('...leaving a bowl', t1.dead && bowls.length === 1 && bowls[0].stack.count === 1);
  const t2 = spawn(level, 'turtle', 16.5, 63, 16.5);
  const loot = t2.lootTable();
  check('its loot otherwise: 0-2 seagrass (looting adds), no bowl', loot.length === 1 && loot[0].item === 'seagrass' && loot[0].min === 0 && loot[0].max === 2 && !loot[0].noLooting);
  t2.die('generic', null);
  tickPinned(level, player, 2);
  check('...and no bowl for other deaths', items(level, 'bowl').length === 1 && items(level, 'seagrass').every((e) => e.stack.count <= 2));
}

// --- zombies and the eggs
{
  const { level, world, player, sounds, parts } = setup();
  player.gameMode = 'creative';
  level.dayTime = 18000;
  world.setState(10, 63, 10, S('turtle_egg', { eggs: 2 }));
  const z = spawn(level, 'zombie', 16.5, 63, 10.5);
  z.setBaby?.(false);
  const took = tickPinned(level, player, 900, () => world.getState(10, 63, 10) === 0);
  check('a zombie makes for turtle eggs and stamps them out', world.getState(10, 63, 10) === 0, `${took} ticks`);
  check('...crunching as it stamps, the eggs\' breaking at the end', sounds.some((s) => s.n === 'entity.zombie.destroy_egg' && s.v === 0.5) && sounds.some((s) => s.n === 'entity.turtle.egg_break'));
  check('...bits of egg flying', parts.some((p) => p.k === 'item_egg'));
  const kinds = ['zombie', 'husk', 'drowned', 'zombie_villager', 'zombified_piglin'].filter((k) => goalsOf(spawn(level, k, 30.5, 63, 30.5)).some((g) => g instanceof TP.ZombieAttackTurtleEggGoal && g.acceptedDistance() === 1.14 && g.vRange === 3));
  check('...all the zombie kinds do (priority 4, 3 up and down)', kinds.length === 5, kinds.join());
}
{
  const { level, world, player } = setup();
  player.gameMode = 'creative';
  level.dayTime = 18000;
  level.gameRules.mobGriefing = false;
  world.setState(10, 63, 10, S('turtle_egg', { eggs: 2 }));
  spawn(level, 'zombie', 13.5, 63, 10.5);
  tickPinned(level, player, 400);
  check('...not while mob griefing is off', eggAt(world, 10, 63, 10)?.eggs === 2);
}

// --- hunting the babies on land
{
  const { level, player } = setup();
  const adult = spawn(level, 'turtle', 20.5, 63, 20.5), baby = spawn(level, 'turtle', 10.5, 63, 10.5), wet = spawn(level, 'turtle', -10.5, 56, 10.5);
  baby.setAge(-24000);
  wet.setAge(-24000);
  tickPinned(level, player, 2);
  check('prey: a baby out of the water', TP.babyTurtleOnLand(baby) && !TP.babyTurtleOnLand(adult) && wet.inWater && !TP.babyTurtleOnLand(wet));
  player.gameMode = 'creative';
  const oc = spawn(level, 'ocelot', 14.5, 63, 10.5);
  tickPinned(level, player, 200, () => oc.target === baby);
  check('an ocelot goes after a baby turtle on land', oc.target === baby);
  tickPinned(level, player, 400, () => baby.health < 30);
  check('...and gets its claws into it', baby.health < 30, `${baby.health}`);
}
{
  const { level, player } = setup();
  player.gameMode = 'creative';
  level.dayTime = 18000;
  const baby = spawn(level, 'turtle', 10.5, 63, 10.5);
  baby.setAge(-24000);
  const sk = spawn(level, 'skeleton', 16.5, 63, 10.5);
  tickPinned(level, player, 200, () => sk.target === baby);
  check('a skeleton takes aim at a baby turtle on land', sk.target === baby);
  const targets = (m, pr) => goalsOf(m).some((g) => g.test === TP.babyTurtleOnLand && m.targetSelector.goals.find((w) => w.goal === g)?.priority === pr);
  const zz = spawn(level, 'zombie', 30.5, 63, 30.5), dr = spawn(level, 'drowned', 30.5, 63, 34.5), cat = spawn(level, 'cat', 34.5, 63, 30.5), wolf = spawn(level, 'wolf', 34.5, 63, 34.5), zp = spawn(level, 'zombified_piglin', 38.5, 63, 38.5);
  check('...as zombies and drowned do (5), ocelots (1), cats (1) and wolves (6)', targets(zz, 5) && targets(dr, 5) && targets(sk, 3) && targets(cat, 1) && targets(wolf, 6) && !goalsOf(zp).some((g) => g.test === TP.babyTurtleOnLand));
  const cg = goalsOf(cat).find((g) => g.test === TP.babyTurtleOnLand);
  cat.tameBy(player);
  check('...a cat or a wolf only while it\'s wild', cg.constructor.name === 'NonTameRandomTargetGoal' && cat.isTame() && !cg.canUse());
}

// --- in the water
{
  const { level, player, sounds } = setup();
  const t = spawn(level, 'turtle', -12.5, 56, 10.5);
  t.homePos = [-12, 56, 10];
  // the sinking rule: nothing to go for, not going home
  t.dx = t.dy = t.dz = 0;
  t.inWater = true;
  t.travel(0, 0, 0);
  check('in the water with nothing to go for it sinks a little', near(t.dy, -0.005));
  t.goingHome = true;
  t.dy = 0;
  t.travel(0, 0, 0);
  check('...not on its way home, near it', near(t.dy, 0));
  t.goingHome = false;
  t.dy = 0.1;
  t.travel(0, 0, 0);
  check('...a tenth of its speed lost a tick', near(t.dy, 0.1 * 0.9 - 0.005));
  // the move control's speeds
  const mc = t.moveControl;
  t.dy = 0;
  t.setSpeed(0.5);
  t.homePos = [-12, 56, 10];
  mc.updateSpeed();
  check('its speed in the water: near home as it is (and a little lift)', near(t.speed, 0.5) && near(t.dy, 0.005));
  t.homePos = [-12, 56, 60];
  t.setSpeed(0.5);
  mc.updateSpeed();
  const far = t.speed;
  t.setSpeed(0.1);
  mc.updateSpeed();
  check('...far from home halved, at least 0.08', near(far, 0.25) && near(t.speed, 0.08));
  t.setAge(-24000);
  t.homePos = [-12, 56, 10];
  t.setSpeed(0.3);
  mc.updateSpeed();
  check('...a baby\'s a third, at least 0.06', near(t.speed, 0.1));
  t.setAge(0);
  // breathing, travelling
  t.homePos = [-12, 56, 10];
  t.air = 300;
  let travelled = false, stable = true;
  tickPinned(level, player, 400, () => {
    if (t.travelling) {
      travelled = true;
      if (t.navigation.isStableDestination(0, 63, 0)) stable = false;
    }
    return false;
  });
  check('under the water for 20 s, it never runs out of air', t.air === 300 && !t.dead && t.inWater);
  const tp = t.travelPos;
  check('...it sets off travelling, far off and never above the surface, only water to aim for', travelled && stable && tp[1] <= 62 && Math.abs(tp[0] - -12) <= 513 && Math.abs(tp[2] - 10) <= 513, `${travelled} ${tp}`);
  check('...stroking through the water', sounds.some((s) => s.n === 'entity.turtle.swim'));
  check('no ambient sound in the water; a grown one ashore; never a baby', t.ambientSound() === null && (() => { t.inWater = false; t.onGround = true; const a = t.ambientSound(); t.setAge(-100); const b = t.ambientSound(); t.setAge(0); return a === 'entity.turtle.ambient_land' && b === null; })());
  check('its hurt and death sounds (a baby\'s own)', t.hurtSound() === 'entity.turtle.hurt' && t.deathSound() === 'entity.turtle.death' && (t.setAge(-100), t.hurtSound() === 'entity.turtle.hurt_baby' && t.deathSound() === 'entity.turtle.death_baby' && t.stepSound() === 'entity.turtle.shamble_baby'));
  t.setAge(0);
  check('...its shamble', t.stepSound() === 'entity.turtle.shamble');
}
{
  // ashore, a grown one without eggs heads for the water; one carrying eggs heads home
  const { level, player } = setup();
  const t = spawn(level, 'turtle', 2.5, 63, 4.5);
  tickPinned(level, player, 600, () => t.inWater);
  check('ashore, it makes for the water', t.inWater);
  const m = spawn(level, 'turtle', -20.5, 57, 4.5);
  m.homePos = [6, 63, 4];
  m.hasEgg = true;
  const d0 = Math.hypot(m.x - 6.5, m.z - 4.5);
  let going = false;
  tickPinned(level, player, 400, () => { going ||= m.goingHome; return false; });
  const d1 = Math.hypot(m.x - 6.5, m.z - 4.5);
  check('...carrying eggs, it heads home', going && d1 < d0 - 5, `${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
}

// --- saving
{
  const { level } = setup();
  const t = spawn(level, 'turtle', 4.5, 63, 4.5);
  t.homePos = [1, 2, 3];
  t.travelPos = [4, 5, 6];
  t.hasEgg = true;
  t.setAge(-500);
  const d = JSON.parse(JSON.stringify(t.saveData()));
  const u = new Turtle(level);
  u.loadData(d);
  check('saved and loaded: home, eggs, where it was going, its age', u.homePos.join() === '1,2,3' && u.travelPos.join() === '4,5,6' && u.hasEgg && u.age === -500 && u.isBaby() && near(u.width, 0.36));
}

// --- sounds
{
  const SND = M['audio/synth'].SOUNDS;
  const want = ['ambient_land', 'swim', 'hurt', 'hurt_baby', 'death', 'death_baby', 'shamble', 'shamble_baby', 'lay_egg', 'egg_break', 'egg_crack', 'egg_hatch'].map((n) => 'entity.turtle.' + n);
  want.push('entity.zombie.destroy_egg', 'item.armor.equip_turtle', 'block.metal.break', 'block.metal.place', 'block.metal.step');
  const bad = [];
  let takes = 0;
  for (const n of want) {
    const s = SND[n];
    if (!s) { bad.push(`${n} missing`); continue; }
    for (let i = 0; i < s.variants; i++) {
      const buf = s.generate(i, 22050);
      takes++;
      let peak = 0, finite = true;
      for (const x of buf) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.05 || buf.length < 1000) bad.push(`${n}#${i} peak ${peak.toFixed(3)} len ${buf.length}`);
    }
  }
  check(`the turtle's and its eggs' sounds (${takes} takes)`, bad.length === 0, bad.join(', '));
}

// --- textures, block models, the renderer
function faces(c) {
  const { u, v, w, h, d } = c;
  return { down: [u + d, v, w, d], up: [u + d + w, v, w, d], west: [u, v + d, d, h], north: [u + d, v + d, w, h], east: [u + d + w, v + d, d, h], south: [u + 2 * d + w, v + d, w, h] };
}
function walk(part, nm, out) {
  part.cubes.forEach((c, i) => out.push([`${nm}#${i}`, c]));
  for (const [n, ch] of part.children) walk(ch, n, out);
}
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const RR = M['render/turtleRenderer'];
  const img = MT.turtle?.();
  const def = RR.turtleModel();
  const bad = [];
  const cubes = [];
  walk(def.root, 'root', cubes);
  if (img) for (const [n, c] of cubes) for (const [f, [x0, y0, w, h]] of Object.entries(faces(c))) {
    let clear = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3] === 0) clear++;
    if (clear) bad.push(`${n}.${f} ${clear}/${w * h}`);
  }
  check('the turtle\'s skin, 128x64, every face of the model painted', img && img.w === 128 && img.h === 64 && bad.length === 0, bad.slice(0, 6).join(', '));
  check('the model: head, shell and plastron, egg belly, four flippers; a baby a sixth the size', cubes.length === 8 && def.texW === 128 && def.baby.headScale === 9 && def.baby.bodyScale === 6 && def.baby.yHead === 120 && def.baby.bodyY === 120 && def.baby.scaleHead);
  const BT = M['textures/blocks'].BLOCK_TEXTURES, IT = M['textures/items'].ITEM_TEXTURES;
  const opaque = (t) => { let n = 0; for (let k = 3; k < t.data.length; k += 4) if (t.data[k]) n++; return n; };
  const px = (t) => Array.from(t.data).join();
  const e0 = BT.turtle_egg?.(), e1 = BT.turtle_egg_slightly_cracked?.(), e2 = BT.turtle_egg_very_cracked?.();
  check('the egg\'s three textures, each more cracked', e0 && e1 && e2 && opaque(e0) === 256 && px(e0) !== px(e1) && px(e1) !== px(e2));
  check('the egg item and the spawn egg drawn', IT.turtle_egg && opaque(IT.turtle_egg()) > 60 && IT.turtle_spawn_egg && opaque(IT.turtle_spawn_egg()) > 60 && ITEMS.get('turtle_spawn_egg')?.creativeTab === 'spawn_eggs');
  const mdl = (eggs, hatch) => EGG.s.model(EGG.view(S('turtle_egg', { eggs, hatch })));
  const v = mdl(3, 2);
  check('the block\'s models: an egg a box, cracked by the hatch, turned four ways', Array.isArray(v) && v.length === 4 && v.map((x) => x.y).join() === '0,90,180,270' && v[0].model.elements.length === 3 && mdl(1, 0)[0].model.elements.length === 1 && Object.values(v[0].model.elements[0].faces).every((f) => f.tex === 'turtle_egg_very_cracked'));
  const inside = (eggs) => mdl(eggs, 0)[0].model.elements.every((e) => { const [lo, hi] = eggs > 1 ? [1, 15] : [3, 12]; return e.from[0] >= lo && e.from[2] >= lo && e.to[0] <= hi && e.to[2] <= hi && e.to[1] <= 7; });
  check('...inside their shapes', [1, 2, 3, 4].every(inside));

  // the renderer through stand-ins
  const { level } = setup();
  const A = { limbSwing: 1.3, limbAmount: 0.8, age: 100, headYaw: 20, headPitch: 10 };
  let quads = 0, drawn = [], lifted = [];
  const batch = { quad() { quads++; }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const kit = {
    pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: (e, dx, dy, dz, p, flip, cb) => { pose.reset(); const before = JSON.stringify(pose.m ?? pose); cb?.(pose); lifted.push(!!cb && JSON.stringify(pose.m ?? pose) !== before); return A; }, overlay() {},
    drawBody: (b, e, d, tex, baby) => { drawn.push(`${tex.n}${baby ? ':baby' : ''}`); d.root.render(b, pose, d.texW, d.texH); },
    state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const gl = new Proxy({}, { get: (_t, k) => (k === 'createTexture' ? () => ({}) : typeof k === 'string' && k === k.toUpperCase() ? 0 : () => {}) });
  const rr = new M['render/oceanRenderers'].OceanRenderers(gl, kit);
  const t = spawn(level, 'turtle', 4.5, 63, 4.5);
  t.onGround = true;
  t.inWater = false;
  const ok = rr.render(batch, t, 0, 0, 0, 0.5);
  const q1 = quads;
  const root = RR.turtleModel().root;
  check('drawn in its skin', ok && drawn.join() === 'turtle' && q1 === 7 * 6 && !lifted[0], `${q1} ${drawn}`);
  t.hasEgg = true;
  quads = 0;
  rr.render(batch, t, 0, 0, 0, 0.5);
  check('...carrying eggs: the egg belly, and the whole turtle lifted over it', quads === 8 * 6 && lifted[1]);
  t.setAge(-100);
  quads = 0;
  drawn = [];
  rr.render(batch, t, 0, 0, 0, 0.5);
  check('...a baby: no egg belly, drawn small', quads === 7 * 6 && drawn.join() === 'turtle:baby');
  t.setAge(0);
  const leg = (n) => root.child(n);
  RR.animateTurtle(root, t, 1.3, 0.8, 0, 0);
  const land = [leg('right_front_leg').yRot, leg('right_front_leg').zRot, leg('left_hind_leg').yRot, leg('left_hind_leg').xRot];
  t.onGround = false;
  t.inWater = true;
  RR.animateTurtle(root, t, 1.3, 0.8, 0, 0);
  const swim = [leg('right_front_leg').yRot, leg('right_front_leg').zRot, leg('left_hind_leg').yRot, leg('left_hind_leg').xRot];
  check('on land its flippers swing to and fro; in the water they beat up and down', land[0] !== 0 && land[1] === 0 && land[2] !== 0 && land[3] === 0 && swim[0] === 0 && swim[1] !== 0 && swim[2] === 0 && swim[3] !== 0);
  t.onGround = true;
  t.inWater = false;
  t.setLayingEgg(true);
  RR.animateTurtle(root, t, 0.05, 0.8, 0, 0);
  const dig = leg('left_front_leg').yRot;
  t.setLayingEgg(false);
  RR.animateTurtle(root, t, 0.05, 0.8, 0, 0);
  const walkY = leg('left_front_leg').yRot;
  check('...digging, the front ones faster and wider', near(dig, Math.cos(4 * 0.05 * 5) * 8 * 0.8 * 2) && near(walkY, Math.cos(0.05 * 5) * 8 * 0.8));
  check('its shadow: 0.7 (a baby\'s half)', M['render/oceanRenderers'].OCEAN_SHADOW_RADII.turtle === 0.7);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
