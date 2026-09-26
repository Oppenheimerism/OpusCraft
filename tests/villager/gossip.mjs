// Headless checks for villager gossip and reputation (node tests/villager/gossip.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/villager.ts', '/src/entity/player.ts', '/src/item/item.ts', '/src/entity/ironGolem.ts', '/src/entity/gossip.ts', '/src/game/spawner.ts', '/src/entity/trading.ts', '/src/core/rng.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, vil, playerMod, itemMod, golemMod, gossipMod, spawner, trading, rng] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
function makeLevel() {
  const world = new worldMod.World();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  const level = new levelMod.Level(world, 'test');
  level.sound = { play() {}, playUI() {} };
  level.particles = { spawn() {}, blockBreak() {} };
  const gs = S('grass_block');
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; }
  level.dayTime = 1000;
  level.difficulty = 'normal';
  return { world, level };
}
const spawn = (level, x, z) => { const v = new vil.Villager(level); v.moveTo(x + 0.5, 64, z + 0.5, 0, 0); v.finalizeSpawn('egg'); level.addEntity(v); return v; };
const tick = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const addPlayer = (level, x, z) => { const p = new playerMod.Player(level); p.gameMode = 'survival'; p.moveTo(x + 0.5, 64, z + 0.5, 0, 0); level.player = p; level.addEntity(p); return p; };

// --- the container itself
{
  const G = gossipMod.GossipContainer;
  const g = new G();
  g.add('p', 'minor_negative', 25);
  g.add('p', 'minor_negative', 25);
  check('two hits: -50', g.reputation('p') === -50);
  for (let i = 0; i < 10; i++) g.add('p', 'minor_negative', 25);
  check('capped at 200 (-200)', g.reputation('p') === -200);
  g.add('p', 'trading', 2);
  check('a trade adds 2', g.reputation('p') === -198);
  g.add('q', 'major_positive', 20);
  g.add('q', 'minor_positive', 25);
  check('a cure: +125', g.reputation('q') === 125);
  g.decay();
  check('a day fades them (minor -20, trading -2 → gone, minor+ -1, major+ stays)', g.reputation('p') === -180 && g.reputation('q') === 124, `${g.reputation('p')} ${g.reputation('q')}`);
  const h = new G();
  h.transferFrom(g, new rng.Rand(1), 10);
  const e = h.entries();
  check('passing it on weakens it', e.every((x) => (x.type === 'minor_negative' && x.value === 160) || (x.type === 'minor_positive' && x.value === 19)) && e.some((x) => x.type === 'minor_negative'), JSON.stringify(e));
  check("a cure's big news isn't passed on (decays 100 a telling)", !e.some((x) => x.type === 'major_positive'));
  const l = new G();
  l.load(g.save());
  check('saves and loads', l.reputation('p') === -180 && l.reputation('q') === 124);
}

// --- hurting a villager: it remembers; four hits and a golem comes for you
{
  const { level } = makeLevel();
  const v = spawn(level, 0, 0);
  const p = addPlayer(level, 2, 0);
  const g = new golemMod.IronGolem(level);
  g.moveTo(-3.5, 64, 0.5, 0, 0);
  level.addEntity(g);
  tick(level, 5);
  v.hurt(1, 'player', p, p);
  check('one hit: -25', v.playerReputation(p) === -25, `${v.playerReputation(p)}`);
  for (let i = 0; i < 3; i++) { tick(level, 21); v.hurt(1, 'player', p, p); }
  check('four hits: -100', v.playerReputation(p) === -100, `${v.playerReputation(p)}`);
  let t = 0;
  while (g.target !== p && t < 100) { tick(level, 1); t++; }
  check('the golem turns on the player', g.target === p, `after ${t} ticks; target ${g.target?.type}`);
}
// a player's own golem doesn't
{
  const { level } = makeLevel();
  const v = spawn(level, 0, 0);
  const p = addPlayer(level, 2, 0);
  const g = new golemMod.IronGolem(level);
  g.playerCreated = true;
  g.moveTo(-3.5, 64, 0.5, 0, 0);
  level.addEntity(g);
  v.gossips.add(p.uuid, 'minor_negative', 150);
  tick(level, 100);
  check('a player-made golem stays loyal', g.target !== p);
}
// a creative player is left alone
{
  const { level } = makeLevel();
  const v = spawn(level, 0, 0);
  const p = addPlayer(level, 2, 0);
  p.gameMode = 'creative';
  const g = new golemMod.IronGolem(level);
  g.moveTo(-3.5, 64, 0.5, 0, 0);
  level.addEntity(g);
  v.gossips.add(p.uuid, 'minor_negative', 150);
  tick(level, 100);
  check('not a creative player', g.target !== p);
}

// --- killing a villager: every villager that saw it remembers
{
  const { level } = makeLevel();
  const a = spawn(level, 0, 0), b = spawn(level, 3, 0), c = spawn(level, -3, 0);
  const p = addPlayer(level, 0, 3);
  tick(level, 30);
  a.hurt(100, 'player', p, p);
  check('the dead villager is dead', !a.isAlive);
  check('every witness: -125', b.playerReputation(p) === -125 && c.playerReputation(p) === -125, `${b.playerReputation(p)} ${c.playerReputation(p)}`);
}

// --- trading: +2 a trade, and prices follow reputation
{
  const { level } = makeLevel();
  const v = spawn(level, 0, 0);
  v.setProfession('farmer');
  const p = addPlayer(level, 2, 0);
  const offers = v.getOffers();
  const o = offers[0];
  const base = o.costA().count;
  v.gossips.add(p.uuid, 'major_positive', 20);
  v.gossips.add(p.uuid, 'minor_positive', 25);
  v.interact(p, null, true);
  const disc = o.costA().count;
  check('a cured villager gives a discount', disc === Math.max(1, base - Math.floor(125 * o.priceMultiplier)), `${base} -> ${disc} (x${o.priceMultiplier})`);
  v.stopTrading();
  check('the discount goes when trading stops', o.costA().count === base);
  v.gossips.removeAll(p.uuid, 'major_positive');
  v.gossips.removeAll(p.uuid, 'minor_positive');
  v.gossips.add(p.uuid, 'minor_negative', 100);
  v.interact(p, null, true);
  check('a disliked player pays more', o.costA().count === base + 5, `${base} -> ${o.costA().count}`);
  // a trade
  v.notifyTrade(o);
  tick(level, 2);
  check('a trade: +2', v.playerReputation(p) === -98, `${v.playerReputation(p)}`);
  v.stopTrading();
}

// --- two villagers chatting pass on what they know
{
  const { level } = makeLevel();
  const a = spawn(level, 0, 0), b = spawn(level, 1, 0);
  const p = addPlayer(level, 10, 10);
  a.gossips.add(p.uuid, 'minor_negative', 100);
  b.gossip(a, level.gameTime + 2000);
  check('b heard it from a (weaker)', b.playerReputation(p) === -80, `${b.playerReputation(p)}`);
}

// --- a day's decay, and saving
{
  const { level } = makeLevel();
  const v = spawn(level, 0, 0);
  const p = addPlayer(level, 10, 10);
  tick(level, 1);
  v.gossips.add(p.uuid, 'minor_negative', 100);
  level.gameTime += 24000;
  v.tick();
  check('a day later it has faded', v.playerReputation(p) === -80, `${v.playerReputation(p)}`);
  const d = v.save();
  const v2 = spawner.loadEntity(d, level);
  check('gossip saves with the villager', v2.playerReputation(p) === -80);
  check('no uuid saved until something needs one', !v.hasUuid && !('uuid' in d && d.uuid));
  v.uuid;
  const v3 = spawner.loadEntity(v.save(), level);
  check('uuid kept', v3.uuid === v.uuid);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
