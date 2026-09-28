// Headless checks for the phantom (node tests/remaining-mobs/phantom.mjs; remaining mobs, milestone 2): the phantom
// itself (its numbers, its size, its loot, undead), insomnia (the player's time since rest: counted, reset by lying down
// and by dying, saved; the spawner's conditions, where and how many), its flight (circling its anchor, finding the
// highest player it can see, the swoop and the bite, broken off by a cat or a hurt, leaving creative players be),
// burning by day, /summon with its size and anchor, the wingbeat's game event, its sound and specks, the advancements
// (Monster Hunter, Two Birds One Arrow), the sounds, the textures, the model and the renderer (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/phantom.ts', '/src/game/phantomSpawner.ts',
  '/src/game/advancements.ts', '/src/game/commands.ts', '/src/game/playerData.ts', '/src/entity/arrow.ts',
  '/src/render/phantomRenderer.ts', '/src/render/entityRenderer.ts', '/src/textures/mobs.ts', '/src/textures/items.ts',
  '/src/audio/synth.ts', '/src/world/constants.ts', '/src/entity/monsters.ts', '/src/world/dimension.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S } = M['world/block'];
const { ITEMS, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const { Phantom, FLAP_DEGREES_PER_TICK } = M['entity/phantom'];
const { PhantomSpawner, INSOMNIA_TICKS } = M['game/phantomSpawner'];
const spawner = M['game/spawner'];
const ADV = M['game/advancements'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** flat grass at y 63 on stone (they stand at 64), for x, z in [-48, 48); night unless `day` */
function setup({ day = false, difficulty = 'normal' } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(B.plains); world.chunks.set(c.key, c); }
  const st = S('stone'), top = S('grass_block');
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, top);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'phantoms');
  const sounds = [], parts = [], triggers = [], events = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, blockParticle() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z, t: level.gameTime }); }, entityEffect() {}, poof() {}, dust() {}, emitAround() {}, spell() {}, fallingDust() {} };
  level.onPlayerTrigger = (p, type, payload) => triggers.push({ type, payload });
  const ge = level.gameEvent.bind(level);
  level.gameEvent = (e, x, y, z, ctx) => { events.push({ e, x, y, z, who: ctx?.entity }); ge(e, x, y, z, ctx); };
  level.difficulty = difficulty;
  level.doDaylightCycle = false;
  level.dayTime = day ? 6000 : 18000;
  level.updateSkyBrightness();
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(0.5, 64, 0.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, triggers, events };
}
const put = (world, x, y, z, n) => world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, typeof n === 'number' ? n : S(n));
/** a phantom (or `type`) made as /summon makes it */
const spawn = (level, x, y, z, { type = 'phantom' } = {}) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  level.addEntity(m);
  return m;
};
/** ticks the level, the player held where it is; stops early when `until` holds */
const tick = (level, n, until) => {
  const p = level.player, [x, y, z] = [p.x, p.y, p.z];
  for (let i = 0; i < n; i++) {
    level.tick();
    p.moveTo(x, y, z, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    p.fallDistance = 0;
    if (until?.(i)) return i + 1;
  }
  return n;
};
const phantoms = (level) => level.entities.filter((e) => e.type === 'phantom' && !e.removed);

// ---------------------------------------------------------------------------
// the phantom itself
{
  const { level, player } = setup();
  const ph = spawn(level, 0.5, 80, 0.5);
  check('a phantom: 20 health, 5 experience, 0.9 by 0.5 (eyes 0.175 up), a bite of 6, undead', ph.maxHealth === 20 && ph.health === 20 && ph.xpReward === 5 && near(ph.width, 0.9) && near(ph.height, 0.5) && near(ph.eyeHeight, 0.175) && ph.attackDamage === 6 && ph.isUndead() && ph.category === 'monster', `${ph.width}x${ph.height} ${ph.attackDamage} ${ph.category}`);
  check('...its anchor 5 blocks over where it came; size 0', ph.flight.anchor.join() === '0,85,0' && ph.size === 0);
  ph.setPhantomSize(4);
  check('size 4: 15% bigger a size (1.44 by 0.8), the bite 10, the eyes 0.28 up', near(ph.width, 0.9 * 1.6) && near(ph.height, 0.5 * 1.6) && ph.attackDamage === 10 && near(ph.eyeHeight, 0.28), `${ph.width} ${ph.height}`);
  ph.setPhantomSize(99);
  const big = ph.size;
  ph.setPhantomSize(-3);
  check('...its size kept to 0 to 64', big === 64 && ph.size === 0);
  check('it doesn\'t keep a player from sleeping; flies (no fall damage)', !ph.isPreventingPlayerRest(player) && (ph.fallDistance = 10, ph.checkFallDamage(-1, true), ph.fallDistance === 0));
  check('its name, summonable; its spawn egg in the spawn eggs tab', spawner.entityDisplayName('phantom') === 'Phantom' && spawner.summonableTypes().includes('phantom') && ITEMS.get('phantom_spawn_egg')?.creativeTab === 'spawn_eggs');
  check('its sounds: phantom ambient, hurt and death', ph.ambientSound() === 'entity.phantom.ambient' && ph.hurtSound() === 'entity.phantom.hurt' && ph.deathSound() === 'entity.phantom.death');
  // loot: a membrane half the time to a player's kill, looting adding up to one a level; nothing otherwise
  const counts = { byPlayer: 0, most: 0, none: 0, looting: 0, mostLooting: 0 };
  for (let i = 0; i < 400; i++) {
    for (const [byPlayer, looting] of [[true, 0], [false, 0], [true, 3]]) {
      const m = spawn(level, 0.5, 70, 0.5);
      const before = new Set(level.entities);
      m.dropLoot(byPlayer, looting);
      for (const e of level.entities) {
        if (before.has(e) || e.type !== 'item') continue;
        if (e.stack.item.id === 'phantom_membrane') {
          if (!byPlayer) counts.none += e.stack.count;
          else if (looting) { counts.looting += e.stack.count; counts.mostLooting = Math.max(counts.mostLooting, e.stack.count); }
          else { counts.byPlayer += e.stack.count; counts.most = Math.max(counts.most, e.stack.count); }
        }
        e.remove();
      }
      m.remove();
    }
  }
  check('loot: a phantom membrane half the time to a player\'s kill, never more than one; none otherwise', counts.byPlayer > 150 && counts.byPlayer < 250 && counts.most === 1 && counts.none === 0, JSON.stringify(counts));
  check('...looting III: up to four, two on average', counts.mostLooting === 4 && counts.looting > 600 && counts.looting < 1000, JSON.stringify(counts));
}

// ---------------------------------------------------------------------------
// insomnia: the player's time since rest
{
  const { level, player } = setup();
  const t0 = player.timeSinceRest;
  tick(level, 50);
  check('a player\'s time since rest counts up a tick at a time', player.timeSinceRest === t0 + 50, `${player.timeSinceRest}`);
  player.timeSinceRest = 100000;
  level.setBlock(0, 64, 0, S('red_bed', { facing: 'north', part: 'head' }));
  level.setBlock(0, 64, 1, S('red_bed', { facing: 'north', part: 'foot' }));
  player.startSleeping(0, 64, 0);
  const slept = player.timeSinceRest;
  for (let i = 0; i < 20; i++) level.tick();
  check('...lying down in a bed puts it back to 0, and it stays there while asleep', slept === 0 && player.timeSinceRest === 0 && player.isSleeping(), `${player.timeSinceRest}`);
  player.stopSleeping();
  player.timeSinceRest = 100000;
  player.hurt(1000, 'generic');
  check('...dying puts it back to 0', player.timeSinceRest === 0);
  const PD = M['game/playerData'];
  const p2 = new M['entity/player'].Player(level);
  p2.timeSinceRest = 123456;
  const saved = JSON.parse(JSON.stringify(PD.savePlayer(p2, 'overworld')));
  const p3 = new M['entity/player'].Player(level);
  PD.loadPlayer(p3, saved);
  const p4 = new M['entity/player'].Player(level);
  PD.loadPlayer(p4, { ...saved, timeSinceRest: undefined });
  check('...saved with the player (a save from before: freshly rested)', saved.timeSinceRest === 123456 && p3.timeSinceRest === 123456 && p4.timeSinceRest === 0);
  check('three days: 72000 ticks', INSOMNIA_TICKS === 72000);
}

// ---------------------------------------------------------------------------
// insomnia: the spawner
{
  /** `tries` tries of a fresh spawner (each its first, as when the world loads) for a player set up by `prep` */
  const trial = (prep, tries = 200, opts = {}) => {
    const env = setup({ difficulty: 'hard', ...opts });
    const { level, player } = env;
    player.timeSinceRest = 2000000000;
    prep?.(env);
    const sp = new PhantomSpawner();
    let n = 0, groups = 0, most = 0, first = null, gap = null;
    for (let i = 0; i < tries; i++) {
      sp.nextTick = 0;
      const before = phantoms(level).length;
      const k = sp.tick(level, level.difficulty !== 'peaceful');
      if (i === 0) gap = sp.nextTick;
      if (k > 0) {
        groups++;
        most = Math.max(most, k);
        const got = phantoms(level).slice(before);
        first ??= got;
      }
      n += k;
    }
    return { n, groups, most, first, gap, level, player };
  };
  const t = trial();
  const pl = t.player;
  const okPlace = t.first?.every((e) => e.y >= Math.floor(pl.y) + 20 && e.y <= Math.floor(pl.y) + 34 && Math.abs(Math.floor(e.x) - Math.floor(pl.x)) <= 10 && Math.abs(Math.floor(e.z) - Math.floor(pl.z)) <= 10 && near(e.x % 1, 0.5) && near(e.y % 1, 0));
  check('three days awake, out under the night sky on hard: phantoms come, 20 to 34 blocks over the player, 10 out at most', t.groups > 80 && okPlace, `${t.groups} groups, ${t.first?.map((e) => `${e.x},${e.y},${e.z}`).join(' ')}`);
  check('...one to four at a time on hard (1 + up to the difficulty\'s id), together', t.most === 4 && t.first.every((e) => e.x === t.first[0].x && e.y === t.first[0].y && e.z === t.first[0].z));
  check('...each try one to two minutes after the last', t.gap >= 1200 && t.gap < 2400, `${t.gap}`);
  const ns = trial(null, 200, { difficulty: 'normal' });
  check('...on normal, one to three, and less often (the local difficulty must beat a roll of up to 3)', ns.most === 3 && ns.groups < t.groups, `${ns.groups} vs ${t.groups}`);
  check('...none on peaceful', trial(null, 100, { difficulty: 'peaceful' }).n === 0);
  check('...none for a player who slept within three days', trial((e) => { e.player.timeSinceRest = 71999; }, 200).n === 0);
  const early = trial((e) => { e.player.timeSinceRest = 96000; }, 400);
  check('...after three days likelier the longer they\'re awake (4 days: a quarter as often as the rolls allow)', early.groups > 20 && early.groups < 160, `${early.groups}`);
  check('...none by day', trial(null, 100, { day: true }).n === 0);
  check('...none under a roof', trial((e) => { put(e.world, 0, 70, 0, 'stone'); for (const c of e.world.chunks.values()) c.recomputeHeightmap(); }, 100).n === 0);
  check('...none below sea level', trial((e) => { e.player.moveTo(0.5, 62, 0.5, 0, 0); put(e.world, 0, 63, 0, 'air'); put(e.world, 0, 62, 0, 'air'); for (const c of e.world.chunks.values()) c.recomputeHeightmap(); }, 100).n === 0);
  check('...none for a spectator', trial((e) => { e.player.gameMode = 'spectator'; }, 100).n === 0);
  check('...none with the doInsomnia rule off', trial((e) => { e.level.gameRules.doInsomnia = false; }, 100).n === 0);
  check('...nor with mob spawning off (the natural spawner\'s gate)', (() => {
    const env = setup({ difficulty: 'hard' });
    env.player.timeSinceRest = 2000000000;
    env.level.gameRules.doMobSpawning = false;
    const ns2 = new spawner.NaturalSpawner(env.level, 12345);
    for (let i = 0; i < 50; i++) { ns2.phantoms.nextTick = 0; ns2.tick(); }
    return phantoms(env.level).length === 0;
  })());
  check('...none where it isn\'t open air', trial((e) => { for (let y = 84; y < 100; y++) for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) put(e.world, x, y, z, 'glass'); for (const c of e.world.chunks.values()) c.recomputeHeightmap(); }, 100).n === 0);
  const wired = (() => {
    const env = setup({ difficulty: 'hard' });
    env.player.timeSinceRest = 2000000000;
    const ns2 = new spawner.NaturalSpawner(env.level, 12345);
    for (let i = 0; i < 20 && !phantoms(env.level).length; i++) { ns2.phantoms.nextTick = 0; ns2.tick(); }
    return phantoms(env.level).length > 0;
  })();
  check('...the natural spawner runs it (the overworld\'s custom spawners, the phantoms first)', wired);
}

// ---------------------------------------------------------------------------
// its flight: circling, finding a player, the swoop and the bite
{
  const { level, player, sounds } = setup();
  player.gameMode = 'creative';
  const ph = spawn(level, 0.5, 80, 0.5);
  let far = 0, near2 = 0, low = 99;
  tick(level, 400, () => {
    const [ax, , az] = ph.flight.anchor;
    const d = Math.hypot(ph.x - ax, ph.z - az);
    far = Math.max(far, d);
    if (d < 3) near2++;
    low = Math.min(low, ph.y);
  });
  check('with no one to go for it circles its anchor, 5 to 15 blocks out, in the air', far > 4 && far < 19 && low > 70 && ph.target === null, `out ${far.toFixed(1)} low ${low.toFixed(1)}`);
  check('...leaving a creative player be', ph.target === null && player.health === 20);
  check('...pitched with its flight, the body as it faces', Math.abs(ph.bodyYaw - ph.yaw) < 1e-6);
  player.gameMode = 'survival';
  let at = -1;
  const t = tick(level, 200, (i) => { if (at < 0 && ph.target === player) at = i; return ph.target === player && ph.flight.phase === 'swoop'; });
  const swoop = sounds.find((s) => s.n === 'entity.phantom.swoop');
  check('a survival player it can see: its target (looked for every three seconds), and soon it swoops with a screech (volume 10)', ph.target === player && ph.flight.phase === 'swoop' && swoop?.v === 10 && swoop.p >= 0.95 && swoop.p <= 1.05, `after ${at} and ${t} ticks, ${JSON.stringify(swoop)}`);
  const [ax, ay, az] = ph.flight.anchor;
  check('...its anchor 20 to 39 blocks over the player', ay >= 84 && ay <= 103 && ax === 0 && az === 0, ph.flight.anchor.join());
  const h0 = player.health;
  const bt = tick(level, 300, () => player.health < h0);
  const bite = sounds.find((s) => s.n === 'entity.phantom.bite');
  check('...it dives and bites (6 on normal) with the bite\'s sound at its block', player.health === h0 - 6 && bite && bite.v === 0.3 && near(bite.x - Math.floor(bite.x), 0.5) && bite.p >= 0.9 && bite.p <= 1, `after ${bt} ticks: ${player.health}, ${JSON.stringify(bite)}`);
  tick(level, 4);
  check('...then it pulls away: back to circling, its target let go', ph.flight.phase === 'circle' && ph.target === null);
  let again = -1;
  tick(level, 200, (i) => { if (ph.target === player) { again = i; return true; } return false; });
  check('...looking for a player afresh some three seconds on', again > 40 && again < 90, `${again}`);
}
{
  // the highest player first
  const { level, player } = setup();
  const p2 = new M['entity/player'].Player(level);
  p2.moveTo(4.5, 70, 4.5, 0, 0);
  p2.gameMode = 'survival';
  level.addEntity(p2);
  put(level.world, 4, 69, 4, 'stone');
  const ph = spawn(level, 0.5, 90, 0.5);
  tick(level, 60, () => ph.target !== null);
  check('of two players, it goes for the higher one', ph.target === p2, `${ph.target?.y}`);
  void player;
}
{
  // a cat breaks the swoop off, hissing
  const { level, player } = setup();
  const cat = spawn(level, 3.5, 64, 3.5, { type: 'cat' });
  let hisses = 0;
  cat.hiss = () => { hisses++; };
  cat.serverAiStep = () => {};
  const ph = spawn(level, 0.5, 80, 0.5);
  let swooped = false;
  tick(level, 300, () => { if (ph.flight.phase === 'swoop') swooped = true; return swooped && ph.target === null; });
  check('a cat within 16 blocks: the swoop broken off as it starts, the cat hissing, the player unhurt', swooped && hisses > 0 && ph.target === null && player.health === 20, `${swooped} ${hisses} ${player.health}`);
}
{
  // hurt as it swoops, it pulls away
  const { level, player } = setup();
  const ph = spawn(level, 0.5, 80, 0.5);
  tick(level, 200, () => ph.flight.phase === 'swoop');
  tick(level, 4);
  const was = ph.flight.phase;
  ph.hurt(1, 'player', player);
  tick(level, 4);
  check('hurt in a swoop: it breaks off and lets its target go', was === 'swoop' && ph.flight.phase === 'circle' && ph.target === null && player.health === 20, `${was} ${ph.flight.phase}`);
}
{
  // it burns by day
  const { level } = setup({ day: true });
  const ph = spawn(level, 0.5, 80, 0.5);
  const lit = tick(level, 300, () => ph.remainingFireTicks > 0);
  check('by day under the open sky it catches fire (8 seconds)', ph.remainingFireTicks > 100 && ph.remainingFireTicks <= 160, `${lit} ticks, ${ph.remainingFireTicks}`);
  const n = setup();
  const ph2 = spawn(n.level, 0.5, 80, 0.5);
  tick(n.level, 300);
  check('...not at night', ph2.remainingFireTicks <= 0);
}

// ---------------------------------------------------------------------------
// its wings: the game event, the flap and the specks
{
  const { level, sounds, parts, events } = setup();
  const ph = spawn(level, 0.5, 80, 0.5);
  tick(level, 20);
  sounds.length = parts.length = events.length = 0;
  tick(level, 200);
  const flaps = events.filter((e) => e.e === 'flap' && e.who === ph).length;
  const fs = sounds.filter((s) => s.n === 'entity.phantom.flap');
  const specks = parts.filter((p) => p.k === 'mycelium').length;
  check('in flight, a wingbeat game event every 25 ticks', flaps === 8, `${flaps}`);
  check('...its flap heard once a beat (every 48 ticks or so), volume and pitch 0.95 to 1', fs.length >= 4 && fs.length <= 5 && fs.every((s) => s.v >= 0.95 && s.v <= 1 && s.p >= 0.95 && s.p <= 1), `${fs.length}`);
  check('...a speck of mycelium off each wingtip every tick', specks === 400, `${specks}`);
  const f0 = ph.flapTicks(0), f1 = ph.flapTicks(0.5);
  check('...its beat from the world\'s time and its own offset (its id × 3), the same for host and guests', near(f1 - f0, 0.5) && ph.flapOffset === ph.id * 3 && near(f0, ph.id * 3 + level.gameTime), `${f0}`);
  check('the beat: 7.448451° a tick', FLAP_DEGREES_PER_TICK === 7.448451);
}

// ---------------------------------------------------------------------------
// saving, /summon
{
  const { level, player } = setup();
  const ph = spawn(level, 0.5, 80, 0.5);
  ph.setPhantomSize(7);
  ph.flight.anchor = [3, 99, -4];
  const s = JSON.parse(JSON.stringify(ph.save()));
  const c = new Phantom(level);
  c.load(s);
  check('saved: its size and its anchor (AX, AY, AZ)', c.size === 7 && c.flight.anchor.join() === '3,99,-4' && near(c.width, 0.9 * 2.05) && c.attackDamage === 13, JSON.stringify(s.data));
  const cmd = M['game/commands'];
  const game = { meta: { allowCommands: true }, chat() {}, player, playerName: 'Tester', level, world: level.world, sound: { play() {} }, applyGameRules() {}, teleport() {}, changeDimension() {} };
  cmd.executeCommand(game, 'summon phantom 2.5 70 2.5 {Size:5,AX:10,AY:95,AZ:-6}');
  const sp = phantoms(level).find((e) => e !== ph && Math.abs(e.x - 2.5) < 0.01);
  check('/summon phantom with its size and anchor', sp?.size === 5 && sp.flight.anchor.join() === '10,95,-6' && near(sp.width, 0.9 * 1.75) && sp.attackDamage === 11, `${sp?.size} ${sp?.flight.anchor}`);
  cmd.executeCommand(game, 'summon phantom 5.5 70 5.5');
  const plain = phantoms(level).find((e) => Math.abs(e.x - 5.5) < 0.01);
  check('...without entity data: size 0, its anchor 5 blocks up (made as a natural one is)', plain?.size === 0 && plain.flight.anchor.join() === '5,75,5', `${plain?.flight.anchor}`);
  cmd.executeCommand(game, 'summon phantom -5.5 72 -5.5 {Size:2}');
  const bare = phantoms(level).find((e) => Math.abs(e.x + 5.5) < 0.01);
  const none = bare?.flight.anchor.join();
  tick(level, 6);
  check('...with entity data but no anchor: none, until it takes where it is as its anchor, first thing', none === '0,0,0' && bare.size === 2 && Math.abs(bare.flight.anchor[1] - 72) <= 1 && Math.abs(bare.flight.anchor[0] + 6) <= 1, `${none} then ${bare?.flight.anchor}`);
}

// ---------------------------------------------------------------------------
// the advancements
{
  const { level, player } = setup();
  const pa = new ADV.PlayerAdvancements();
  const ph = spawn(level, 0.5, 66, 0.5);
  ph.lastHurtByPlayer = player;
  ph.lastHurtByPlayerTime = 100;
  // (the game's hookup: its kill trigger, as game.ts sends it)
  ph.die('player', player);
  pa.trigger('kill', { killed: { type: ph.type, hostile: true, distance: 1, byArrow: false, byFireball: false } });
  check('Monster Hunter: a phantom counts among the hostile mobs (and toward Monsters Hunted)', pa.isDone(ADV.ADVANCEMENTS.get('adventure/kill_a_mob')) && ADV.ADVANCEMENTS.get('adventure/kill_all_mobs').criteria.phantom !== undefined);
  // Two Birds, One Arrow: a piercing crossbow arrow through two phantoms
  const killed = [];
  level.onPlayerCrossbowKill = (list, p) => { if (p === player) killed.push(list.map((e) => e.type)); };
  const a = spawn(level, 0.5, 70, 5.5), b = spawn(level, 0.5, 70, 7.5);
  for (const m of [a, b]) { m.health = 1; m.serverAiStep = () => {}; m.travel = () => {}; }
  const arrow = new M['entity/arrow'].Arrow(level, player);
  arrow.weapon = ItemStack.of('crossbow');
  arrow.pierceLevel = 1;
  arrow.moveTo(0.5, 70.25, 2.5, 0, 0);
  arrow.dx = 0;
  arrow.dy = 0;
  arrow.dz = 3;
  level.addEntity(arrow);
  run: for (let i = 0; i < 20; i++) { level.tick(); if (!a.isAlive && !b.isAlive) break run; }
  const last = killed[killed.length - 1] ?? [];
  const pa2 = new ADV.PlayerAdvancements();
  pa2.trigger('killed_by_crossbow', { crossbowKills: last });
  check('Two Birds, One Arrow: one piercing crossbow arrow kills two phantoms', !a.isAlive && !b.isAlive && last.join() === 'phantom,phantom' && pa2.isDone(ADV.ADVANCEMENTS.get('adventure/two_birds_one_arrow')), JSON.stringify(killed));
}

// ---------------------------------------------------------------------------
// sounds
{
  const SND = M['audio/synth'].SOUNDS;
  const want = { ambient: 5, bite: 2, death: 3, flap: 6, hurt: 3, swoop: 4 };
  const bad = [];
  let takes = 0;
  for (const [k, n] of Object.entries(want)) {
    const s = SND['entity.phantom.' + k];
    if (!s) { bad.push(`${k} missing`); continue; }
    if (s.variants !== n) bad.push(`${k} has ${s.variants} takes`);
    for (let i = 0; i < s.variants; i++) {
      const buf = s.generate(i, 22050);
      let pk = 0;
      for (const v of buf) if (!Number.isFinite(v)) { pk = NaN; break; } else pk = Math.max(pk, Math.abs(v));
      if (!(pk > 0.3 && pk <= 1)) bad.push(`${k}#${i} peak ${pk}`);
      takes++;
    }
  }
  check(`the phantom's sounds (vanilla's takes: ambient 5, bite 2, death 3, flap 6, hurt 3, swoop 4; ${takes} in all)`, bad.length === 0, bad.join(', '));
  check('...a parrot mimics its screech', !!SND['entity.parrot.imitate.phantom'] && SND['entity.parrot.imitate.phantom'] !== SND['entity.parrot.ambient']);
}

// ---------------------------------------------------------------------------
// textures, the model, the renderer
function faces(c) {
  const { u, v, w, h, d } = c;
  return { top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h] };
}
function walk(part, nm, out) {
  part.cubes.forEach((c, i) => out.push([`${nm}#${i}`, c]));
  for (const [n, ch] of part.children) walk(ch, n, out);
}
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const RR = M['render/phantomRenderer'];
  const opaqueIn = (img, [x0, y0, w, h]) => { let n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3]) n++; return n; };
  const def = RR.phantomModel();
  const cubes = [];
  walk(def.root, 'root', cubes);
  const img = MT.phantom?.(), eyes = MT.phantom_eyes?.();
  const bad = [];
  for (const [cn, c] of cubes) for (const [f, r] of Object.entries(faces(c))) {
    const o = opaqueIn(img, r), all = r[2] * r[3];
    // (the wingtip's trailing edge ragged: gaps in it)
    if (/wing_tip/.test(cn) && f !== 'front' && f !== 'right' && f !== 'left') { if (o < all * 0.6) bad.push(`${cn}.${f} ${o}/${all}`); continue; }
    if (o !== all) bad.push(`${cn}.${f} ${o}/${all}`);
  }
  check('the phantom\'s skin: 64x64, every box painted (the wingtips ragged at their trailing edge)', img && img.w === 64 && img.h === 64 && bad.length === 0, bad.slice(0, 8).join(', '));
  const head = cubes.find(([n]) => n === 'head#0')[1];
  let lit = 0, elsewhere = 0;
  const fr = faces(head).front;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (eyes.data[(y * 64 + x) * 4 + 3]) { if (x >= fr[0] && x < fr[0] + fr[2] && y >= fr[1] && y < fr[1] + fr[3]) lit++; else elsewhere++; }
  check('...its eyes (drawn glowing): on the face, two each side, nothing else', eyes.w === 64 && lit === 4 && elsewhere === 0, `${lit} ${elsewhere}`);
  check('...its spawn egg (blue-grey with green spots)', !!M['textures/items'].ITEM_TEXTURES.phantom_spawn_egg);
  const names = [];
  const collect = (p, nm) => { names.push(nm); for (const [n, ch] of p.children) collect(ch, n); };
  collect(def.root, 'top');
  check('the model: a body with the head, the tail (base and tip), two wings (base and tip)', ['body', 'head', 'tail_base', 'tail_tip', 'left_wing_base', 'left_wing_tip', 'right_wing_base', 'right_wing_tip'].every((n) => names.includes(n)) && def.texW === 64 && def.texH === 64);
  const root = def.root, body = root.child('body');
  RR.animatePhantom(root, 0);
  const up = body.child('left_wing_base').zRot, tail0 = body.child('tail_base').xRot;
  RR.animatePhantom(root, 360 / FLAP_DEGREES_PER_TICK / 2);
  const down = body.child('left_wing_base').zRot;
  check('its wings beat 16° up and down (the right against the left, both joints together), the tail swaying', near(up, 16 * Math.PI / 180, 1e-4) && near(down, -16 * Math.PI / 180, 1e-4) && near(body.child('right_wing_base').zRot, -down) && near(body.child('left_wing_base').child('left_wing_tip').zRot, down) && near(tail0, -10 * Math.PI / 180, 1e-4), `${up} ${down} ${tail0}`);

  const { level } = setup();
  let quads = 0;
  const drawn = [], states = [];
  const batch = { quad() { quads++; }, begin(s) { states.push(s); }, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const A = { limbSwing: 0, limbAmount: 0, age: 100, headYaw: 0, headPitch: 0 };
  let scaled = null;
  const kit = {
    pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: (e, dx, dy, dz, p, flip, scale) => { pose.reset(); scale?.(pose); scaled = { flip, m: [...pose.m], had: !!scale }; return A; }, overlay() {},
    drawBody: (b, e, d, tex) => { drawn.push(tex.n); d.root.render(b, pose, d.texW, d.texH); },
    drawModel: (b, d) => { drawn.push('model'); d.root.render(b, pose, d.texW, d.texH); },
    state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const rr = new RR.PhantomRenderers(kit);
  const ph = spawn(level, 0.5, 80, 0.5);
  const pig = spawn(level, 4.5, 64, 0.5, { type: 'pig' });
  const ok1 = rr.render(batch, ph, 0, 0, 0, 0.5) && !rr.render(batch, pig, 0, 0, 0, 0.5);
  const eyeState = states.find((s) => s.texture?.n === 'phantom_eyes');
  check('drawn in its skin, then its eyes glowing over it (full bright, added), not a pig', ok1 && quads > 0 && drawn.join() === 'phantom,model' && eyeState?.additive && eyeState.lit === false && eyeState.depthWrite === false && batch.lightB === 96, drawn.join());
  // (size 0, level: no turn, 1.3125 up and 0.1875 back; size 4 pitched 30°: grown 1.6 and turned about x)
  const m0 = scaled?.m;
  ph.setPhantomSize(4);
  ph.pitch = 30;
  rr.render(batch, ph, 0, 0, 0, 0.5);
  const m1 = scaled?.m;
  const colLen = (m) => Math.hypot(m[4], m[5], m[6]);
  check('...grown by its size, pitched with its flight (vanilla PhantomRenderer.scale and setupRotations)', scaled?.had && scaled.flip === 90 && near(m0[13], 1.3125) && near(m0[14], 0.1875) && near(colLen(m0), 1) && near(colLen(m1), 1.6, 1e-5) && near(m1[5] / 1.6, Math.cos(30 * Math.PI / 180), 1e-5) && near(m1[6] / 1.6, -Math.sin(30 * Math.PI / 180), 1e-5), `${m1?.slice(4, 7).map((x) => x.toFixed(3))}`);
  check('its shadow: 0.75', RR.PHANTOM_SHADOW_RADII.phantom === 0.75);
}

close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
