// Headless checks for pillager patrols (node tests/illagers/patrols.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/game/patrolSpawner.ts', '/src/entity/illagers.ts', '/src/entity/raider.ts',
  '/src/world/gen/biomes.ts', '/src/game/difficulty.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, patrolMod, ill, raider, biomes, diff] = mods;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

function setup() {
  const world = new worldMod.World();
  for (let cx = -6; cx <= 5; cx++) for (let cz = -6; cz <= 5; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -96; x < 96; x++) for (let z = -96; z < 96; z++) { const c = world.getChunk(x >> 4, z >> 4); for (let y = 58; y <= 63; y++) c.setState(x & 15, y, z & 15, S('stone')); }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new levelMod.Level(world, 'test');
  level.sound = { play() {}, playUI() {} };
  level.particles = { blockBreak() {}, spawn() {}, entityEffect() {} };
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 5 * 24000 + 1000;
  const player = new playerMod.Player(level);
  player.moveTo(0.5, 64, 0.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  level.skyDarken = 0;
  return { level, player };
}
const pillagers = (level) => level.entities.filter((e) => e.type === 'pillager');
/** tries until a patrol forms (each try: one in five) */
function force(level, ps, tries = 60) {
  for (let i = 0; i < tries; i++) {
    ps.nextTick = 0;
    const n = ps.tick(level, true);
    if (n > 0) return { n, tries: i + 1 };
  }
  return { n: 0, tries };
}

// --- a patrol forms: a captain with the banner and patrol target, the rest patrolling, 24-47 blocks off
{
  const { level, player } = setup();
  const ps = new patrolMod.PatrolSpawner();
  const { n, tries } = force(level, ps);
  const ps_ = pillagers(level);
  const eff = diff.currentDifficultyAt(level, ps_[0]?.x ?? 0, 64, ps_[0]?.z ?? 0).effective;
  check('a patrol forms, one try in about five', n > 0 && tries <= 40, `tries=${tries}`);
  check('its size is the local difficulty rounded up, plus one', ps_.length === Math.ceil(eff) + 1, `${ps_.length} for ${eff.toFixed(2)}`);
  const caps = ps_.filter((p) => p.patrolLeader);
  check('one captain, wearing the ominous banner', caps.length === 1 && raider.isOminousBanner(caps[0].armorItems[3]) && caps[0].isCaptain?.() !== false);
  check('the captain has somewhere to go, within 500 of the origin', caps[0]?.patrolTarget && Math.abs(caps[0].patrolTarget[0]) <= 500 && Math.abs(caps[0].patrolTarget[2]) <= 500, JSON.stringify(caps[0]?.patrolTarget));
  check('all are patrolling, the rest without a target of their own', ps_.every((p) => p.patrolling) && ps_.filter((p) => !p.patrolLeader).every((p) => !p.patrolTarget));
  const c = caps[0];
  const dx = Math.abs(c.x - Math.floor(player.x)), dz = Math.abs(c.z - Math.floor(player.z));
  check('the captain appears 24-47 blocks off on each axis', dx >= 24 && dx <= 47 && dz >= 24 && dz <= 47, `dx=${dx} dz=${dz}`);
  check('on the surface, at a block corner', ps_.every((p) => p.y === 64) && Number.isInteger(c.x) && Number.isInteger(c.z));
  check('with crossbows', ps_.every((p) => p.mainHand?.item.id === 'crossbow'));
  check('patrol members stay when far off (up to 128)', ps_.every((p) => !p.removeWhenFarAway(100 * 100) && p.removeWhenFarAway(130 * 130)));
  // they set off: the captain towards its target, the others after it
  const start = ps_.map((p) => [p.x, p.z]);
  for (let i = 0; i < 400; i++) level.tick();
  const moved = ps_.filter((p, i) => Math.hypot(p.x - start[i][0], p.z - start[i][1]) > 3).length;
  check('the patrol walks off together', moved === ps_.length && ps_.filter((p) => !p.patrolLeader).every((p) => p.patrolTarget), `moved=${moved}/${ps_.length}`);
  const spread = Math.max(...ps_.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
  check('and keeps together', spread < 20, `spread=${spread.toFixed(1)}`);
}

// --- no patrols: before day 5, at night, in peaceful, with the rule off, near a village, in the mushroom fields, elsewhere than the overworld
for (const [name, tweak] of [
  ['before the fifth day', (l) => { l.dayTime = 4 * 24000 + 1000; }],
  ['at night', (l) => { l.dayTime = 5 * 24000 + 18000; l.skyDarken = 11; }],
  ['in peaceful', (l) => { l.difficulty = 'peaceful'; }],
  ['with doPatrolSpawning off', (l) => { l.gameRules.doPatrolSpawning = false; }],
  ['near a village', (l) => { l.poi.sectionsToVillage = () => 2; }],
  ['in the mushroom fields', (l) => { const id = biomes.BIOMES.findIndex((b) => b.name === 'mushroom_fields'); l.world.getBiome3 = () => id; }],
  ['in a spectator\'s company', (l) => { l.player.gameMode = 'spectator'; }],
]) {
  const { level } = setup();
  tweak(level);
  const ps = new patrolMod.PatrolSpawner();
  const spawnEnemies = level.difficulty !== 'peaceful';
  for (let i = 0; i < 60; i++) { ps.nextTick = 0; ps.tick(level, spawnEnemies); }
  check(`no patrol ${name}`, pillagers(level).length === 0);
}

// --- a bright spot: the captain can't stand there, so no patrol at all
{
  const { level } = setup();
  let tried = 0;
  const w = level.world, get = w.getLight.bind(w);
  w.getLight = (x, y, z) => (y === 64 ? 0xf0 | 12 : get(x, y, z));
  const ps = new patrolMod.PatrolSpawner();
  for (let i = 0; i < 60; i++) { ps.nextTick = 0; tried += ps.tick(level, true); }
  check('no patrol where it is lit (block light over 8)', tried > 0 && pillagers(level).length === 0, `tries that got as far=${tried}`);
}

// --- the timer: once a try is made, the next is 12000-13199 ticks off; the natural spawner drives it
{
  const { level } = setup();
  const ns = new spawner.NaturalSpawner(level, 1);
  ns.tick();
  const t = ns.patrols.nextTick;
  check('the natural spawner ticks the patrol spawner (first try at once)', t >= 11999 && t <= 13199, `nextTick=${t}`);
  ns.tick();
  check('then counts down', ns.patrols.nextTick === t - 1);
  level.gameRules.doMobSpawning = false;
  ns.tick();
  check('not with doMobSpawning off', ns.patrols.nextTick === t - 1);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
