// The dragon fight, headless: node tests/end/dragon.mjs [seed]
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods: [, blockMod, worldMod, dimMod, levelMod, genMod, featMod, fightMod, dragonMod, phaseMod, crystalMod, playerMod, spawnerMod, orbMod, cloudMod, fbMod, arrowMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/dimension.ts', '/src/game/level.ts', '/src/world/gen/theEnd.ts',
  '/src/world/gen/endFeatures.ts', '/src/game/endDragonFight.ts', '/src/entity/enderDragon.ts', '/src/entity/dragonPhases.ts', '/src/entity/endCrystal.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/entity/xpOrb.ts', '/src/entity/areaEffectCloud.ts', '/src/entity/dragonFireball.ts', '/src/entity/arrow.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const { BLOCKS, STATE_BLOCK, S } = blockMod;
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;
const { EnderDragon, EnderDragonPart } = dragonMod;
const { PHASE } = phaseMod;
const { EndCrystal } = crystalMod;
const PHASE_NAME = Object.fromEntries(Object.entries(PHASE).map(([k, v]) => [v, k]));

const seed = process.argv[2] ?? '12345';
const gen = new genMod.EndGenerator(seed);
const world = new worldMod.World();
world.reset(dimMod.THE_END);
const level = new levelMod.Level(world, seed);
const sounds = [];
const particles = new Map();
level.sound = { play: (n, x, y, z, v, p) => sounds.push({ n, x, y, z, v, p }), playUI: () => {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn: (k) => particles.set(k, (particles.get(k) ?? 0) + 1) };
const t0 = performance.now();
const R = 8;
for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
  const out = gen.generate(cx, cz);
  world.addChunk(out);
  for (const d of out.entities ?? []) { const e = spawnerMod.loadEntity(d, level); if (e) level.addEntity(e); }
}
console.log(`generated ${(2 * R + 1) ** 2} chunks in ${(performance.now() - t0).toFixed(0)} ms`);
const at = (x, y, z) => name(world.getState(x, y, z));
const spikes = featMod.endSpikes(gen.seed);

const player = new playerMod.Player(level);
player.setGameMode('survival');
const ph = world.heightAt(20, 20);
player.moveTo(20.5, ph, 20.5, 0, 0);
level.player = player;
level.addEntity(player);
level.simulationDistance = 12;

const fight = new fightMod.EndDragonFight(level, null);
level.dragonFight = fight;
const tick = (n = 1) => { for (let i = 0; i < n; i++) { level.gameTime++; level.tick(); } };

// --- first contact: the podium and the dragon
tick(1);
check('the bar lists the player (within 192 of 0,128,0)', fight.hasPlayer && fight.shownBar()?.name === 'Ender Dragon' && fight.shownBar().color === 'pink');
const portal = fight.portalLocation;
check('the exit portal frame built on the island top', !!portal && portal[0] === 0 && portal[2] === 0, JSON.stringify(portal));
const [px, py, pz] = portal;
{
  let rim = 0, inner = 0, base = 0;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d2 = dx * dx + dz * dz;
    if (d2 >= 8 && d2 <= 10 && at(px + dx, py, pz + dz) === 'bedrock') rim++;
    if (d2 <= 5 && (dx || dz) && at(px + dx, py, pz + dz) === 'air') inner++;
    if (d2 <= 5 && at(px + dx, py - 1, pz + dz) === 'bedrock') base++;
  }
  const pillar = [0, 1, 2, 3].every((i) => at(px, py + i, pz) === 'bedrock');
  const torches = [[0, -1], [0, 1], [-1, 0], [1, 0]].every(([dx, dz]) => at(px + dx, py + 2, pz + dz) === 'wall_torch');
  check('podium: 16 bedrock rim, 20 empty inside, 21 bedrock base, pillar of 4, 4 torches', rim === 16 && inner === 20 && base === 21 && pillar && torches, `rim ${rim} inner ${inner} base ${base} pillar ${pillar} torches ${torches}`);
  check('the frame is found again as the exit portal', fight.findExitPortal()?.join() === portal.join());
}
const dragons = () => level.entities.filter((e) => e instanceof EnderDragon && !e.removed);
check('one dragon, the fight\'s, at 0,128,0 circling', dragons().length === 1 && dragons()[0].uuid === fight.dragonUUID && Math.abs(dragons()[0].y - 128) < 1 && dragons()[0].phaseManager.current.id === PHASE.HOLDING_PATTERN);
const dragon = dragons()[0];
check('200 health, 16x8', dragon.health === 200 && dragon.width === 16 && dragon.height === 8);

// --- the flight graph
dragon.findClosestNode();
const nodes = dragon.graphNodes();
{
  const ring = (i) => (i < 12 ? 60 : i < 20 ? 40 : 20);
  let ok = true;
  for (let i = 0; i < 24; i++) {
    const n = nodes[i];
    const r = Math.hypot(n.x, n.z);
    if (Math.abs(r - ring(i)) > 1.5) ok = false;
    const h = Math.max(level.motionBlockingHeight(n.x, n.z), 0);
    if (n.y !== Math.max(10, h + (i >= 12 && i < 20 ? 15 : 5))) ok = false;
  }
  check('24 nodes on rings of 60, 40, 20; 5, 15, 5 over the ground', ok, nodes.slice(0, 3).map((n) => `${n.x},${n.y},${n.z}`).join(' '));
  check('node 0 due east at 60, node 3 south', nodes[0].x === 60 && nodes[0].z === 0 && nodes[3].x === 0 && nodes[3].z === 60, `${nodes[3].x},${nodes[3].z}`);
  // (for its first 5 seconds the fight hasn't counted the crystals: the dragon keeps to the inner rings)
  const inner = dragon.findPath(0, 6, null);
  check('no crystals counted yet: the path keeps to the inner rings', inner && inner.nodes.slice(1).every((n) => nodes.indexOf(n) >= 12), inner?.nodes.map((n) => nodes.indexOf(n)).join('-'));
  fight.crystalsAlive = 10;
  const path = dragon.findPath(0, 6, null);
  fight.crystalsAlive = 0;
  check('a path round the outer ring from 0 to 6', path && path.nodes[0] === nodes[0] && path.nodes[path.nodes.length - 1] === nodes[6], path?.nodes.map((n) => nodes.indexOf(n)).join('-'));
}

// --- parts
{
  const hits = level.getEntities(dragon.head.bb.inflate(0.1));
  check('the parts are found by getEntities (the dragon\'s own not for itself)', hits.includes(dragon.head) && !level.getEntities(dragon.head.bb.inflate(0.1), undefined, dragon).includes(dragon.head));
  check('parts pickable, the dragon not', dragon.head.isPickable() && !dragon.isPickable());
}

// --- flying: 3000 ticks with the player standing by
const seen = new Set();
let nan = false, maxDist = 0;
const hp0 = player.health;
for (let i = 0; i < 3000; i++) {
  tick();
  if (dragon.removed) break;
  seen.add(PHASE_NAME[dragon.phaseManager.current.id]);
  if (!Number.isFinite(dragon.x + dragon.y + dragon.z)) nan = true;
  maxDist = Math.max(maxDist, Math.hypot(dragon.x, dragon.z));
  if (player.health < 20) { player.health = 20; player.invulnerableTime = 0; }
}
check('it flies (no NaN), keeping near the island', !nan && maxDist < 200, `max ${maxDist.toFixed(0)} from the middle`);
check('phases seen in 3000 ticks', seen.size >= 2, [...seen].join(' '));
check('its wings flap (flap sounds)', sounds.some((s) => s.n === 'entity.ender_dragon.flap'));
check('crystal count is kept', fight.crystalsAlive === 10, String(fight.crystalsAlive));

// --- healing from the nearest crystal
{
  const c = level.entities.find((e) => e instanceof EndCrystal && !e.removed);
  dragon.health = 150;
  dragon.nearestCrystal = c;
  const h0 = dragon.health;
  for (let i = 0; i < 20; i++) { dragon.tickCount++; dragon.checkCrystals?.call(dragon); }
  check('a crystal heals a point every half second', dragon.health > h0, `${h0} → ${dragon.health}`);
}

// --- damage
{
  const d = dragon;
  d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
  d.health = 200;
  d.invulnerableTime = 0;
  d.head.hurt(10, 'player', player, player);
  check('a blow to the head counts in full', d.health === 190, String(d.health));
  d.invulnerableTime = 0;
  d.body.hurt(10, 'player', player, player);
  check('elsewhere a quarter plus one (10 → 3.5)', Math.abs(d.health - 186.5) < 1e-9, String(d.health));
  d.invulnerableTime = 0;
  check('a mob can\'t hurt it', d.head.hurt(50, 'mob', { type: 'zombie' }, null) === true && Math.abs(d.health - 186.5) < 1e-9);
  d.invulnerableTime = 0;
  d.wing1.hurt(8, 'explosion', null, null);
  check('an explosion can (8 → 3)', Math.abs(d.health - 183.5) < 1e-9, String(d.health));
  d.invulnerableTime = 0;
  check('fire can\'t', d.body.hurt(10, 'inFire', player, null) === false);
  d.health = 200;
}

// --- sitting: arrows glance off (set alight), 50 damage sends it up
{
  const d = dragon;
  d.phaseManager.setPhase(PHASE.SITTING_SCANNING);
  const arrow = new arrowMod.Arrow(level, player);
  d.invulnerableTime = 0;
  const took = d.head.hurt(9, 'arrow', player, arrow);
  check('an arrow at a perched dragon: no damage, the arrow alight', !took && d.health === 200 && arrow.remainingFireTicks > 0);
  for (let i = 0; i < 6; i++) { d.invulnerableTime = 0; d.head.hurt(10, 'player', player, player); }
  check('over 50 damage while perched: it takes off', d.phaseManager.current.id === PHASE.TAKEOFF, PHASE_NAME[d.phaseManager.current.id]);
  d.health = 200;
  d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
}

// --- the fireball and its cloud
{
  const d = dragon;
  for (const e of level.entities) if (e instanceof cloudMod.AreaEffectCloud) e.remove();
  const fb = new fbMod.DragonFireball(level, d, 0, -1, 0);
  const gx = 30, gz = -30, gy = world.heightAt(gx, gz);
  fb.moveTo(gx + 0.5, gy + 6, gz + 0.5, 0, 0);
  level.addEntity(fb);
  player.moveTo(gx + 1.5, gy, gz + 0.5, 0, 0);
  sounds.length = 0;
  particles.clear();
  let n = 0;
  while (!fb.removed && n++ < 100) tick();
  const cloud = level.entities.find((e) => e instanceof cloudMod.AreaEffectCloud && !e.removed);
  check('the fireball bursts on the ground into a cloud round the player', fb.removed && cloud && Math.abs(cloud.x - player.x) < 1e-9 && cloud.radius >= 3 && cloud.duration === 600 && cloud.owner === d, cloud ? `${cloud.x},${cloud.y},${cloud.z} r${cloud.radius}` : 'none');
  check('its burst: 200 breath particles and the sound', (particles.get('dragon_breath') ?? 0) >= 200 && sounds.some((s) => s.n === 'entity.dragon_fireball.explode'));
  player.health = 20;
  player.invulnerableTime = 0;
  let hurtAt = -1, first = 0, hits = [];
  for (let i = 0; i < 45; i++) {
    const h = player.health;
    tick();
    if (player.health < h) hits.push(`${cloud.tickCount}:${(h - player.health).toFixed(1)}`);
    if (player.health < 20 && hurtAt < 0) { hurtAt = cloud.tickCount; first = 20 - player.health; }
  }
  check('it waits a second, then instant damage II (6, through armour) once a second', hurtAt === 20 && Math.abs(first - 6) < 1e-6, `hits ${hits.join(' ')}`);
  check('it grows (3 → 7 over 30 s)', cloud.radius > 3 && cloud.radius < 3.2, String(cloud.radius));
  const r0 = cloud.radius;
  const took = cloudMod.takeDragonBreath(level, player);
  check('a bottle takes half a block of it', took === cloud && Math.abs(cloud.radius - (r0 - 0.5)) < 1e-6 && sounds.some((s) => s.n === 'item.bottle.fill_dragonbreath'));
  cloud.remove();
  player.health = 20;
  player.moveTo(20.5, ph, 20.5, 0, 0);
}

// --- a perched dragon's breath
{
  const d = dragon;
  d.phaseManager.setPhase(PHASE.SITTING_FLAMING);
  const before = new Set(level.entities.filter((e) => e instanceof cloudMod.AreaEffectCloud));
  for (let i = 0; i < 9; i++) d.phaseManager.current.doServerTick();
  const none = level.entities.filter((e) => e instanceof cloudMod.AreaEffectCloud && !before.has(e)).length;
  d.phaseManager.current.doServerTick();
  const clouds = level.entities.filter((e) => e instanceof cloudMod.AreaEffectCloud && !before.has(e));
  const c = clouds[0];
  const ground = c && at(Math.floor(c.x), Math.floor(c.y) - 1, Math.floor(c.z));
  check('flaming: at 10 ticks a cloud of radius 5 on the ground in front of its head', none === 0 && clouds.length === 1 && c.radius === 5 && c.duration === 200 && c.harm === 0 && ground !== 'air' && at(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)) === 'air', c ? `${c.x.toFixed(1)},${c.y},${c.z.toFixed(1)} on ${ground}` : 'none');
  d.phaseManager.setPhase(PHASE.SITTING_SCANNING);
  check('and it goes when the flaming ends', c.removed);
  d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
}

// --- a crystal blown up near it
{
  const d = dragon;
  const c = level.entities.find((e) => e instanceof EndCrystal && !e.removed);
  d.nearestCrystal = c;
  d.health = 200;
  d.invulnerableTime = 0;
  c.hurt(1, 'player', player);
  check('its healing crystal destroyed: 10 to the head, and it turns on the player', d.health === 190 && d.phaseManager.current.id === PHASE.STRAFE_PLAYER, `${d.health} ${PHASE_NAME[d.phaseManager.current.id]}`);
  check('the fight counts one fewer crystal', fight.crystalsAlive === 9, String(fight.crystalsAlive));
  d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
}

// --- saving
{
  const data = JSON.parse(JSON.stringify(fight.save()));
  check('fight data saved', data.dragonUUID === dragon.uuid && data.dragonKilled === false && data.previouslyKilled === false && data.exitPortalLocation.join() === portal.join() && data.gateways.length === 20 && data.isRespawning === false);
  const back = new fightMod.EndDragonFight(level, data);
  check('and loaded', back.dragonUUID === dragon.uuid && back.save().gateways.join() === data.gateways.join());
  const sd = spawnerMod.saveEntity(dragon);
  const d2 = spawnerMod.loadEntity(sd, level);
  check('the dragon saves and loads (uuid, phase, health)', d2 instanceof EnderDragon && d2.uuid === dragon.uuid && d2.phaseManager.current.id === dragon.phaseManager.current.id && d2.health === dragon.health, sd.id);
  const fresh = new fightMod.EndDragonFight(level, null).save().gateways;
  check('the gateway order is the seed\'s', fresh.join() === data.gateways.join() && [...fresh].sort((a, b) => a - b).join() === Array.from({ length: 20 }, (_, i) => i).join());
}

// --- the kill
{
  const d = dragon;
  d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
  d.health = 5;
  d.invulnerableTime = 0;
  const orbsBefore = level.entities.filter((e) => e instanceof orbMod.ExperienceOrb).length;
  d.head.hurt(20, 'player', player, player);
  check('brought down in the air: 1 health left, dying', d.health === 1 && d.phaseManager.current.id === PHASE.DYING);
  let n = 0;
  while (d.health > 0 && n++ < 2000) tick();
  check('it flies to the portal to die', d.health <= 0 && Math.hypot(d.x - px, d.z - pz) < 12, `after ${n} ticks at ${d.x.toFixed(1)},${d.y.toFixed(1)},${d.z.toFixed(1)}`);
  sounds.length = 0;
  const y0 = d.y;
  let xp = 0;
  n = 0;
  while (!d.removed && n++ < 300) tick();
  for (const e of level.entities) if (e instanceof orbMod.ExperienceOrb && !e.removed) xp += e.value * e.count;
  check('200 ticks of death throes, rising 20 blocks', n === 200 && Math.abs(dragons().length) === 0 && d.y - y0 > 19, `${n} ticks, rose ${(d.y - y0).toFixed(1)}`);
  check('12000 experience (the first dragon)', xp === 12000, String(xp));
  check('the death roar', sounds.some((s) => s.n === 'entity.ender_dragon.death' && s.v === 5));
  let lit = 0;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (at(px + dx, py, pz + dz) === 'end_portal') lit++;
  check('the exit portal lit (20 portal blocks)', lit === 20, String(lit));
  check('the egg on top of the pillar', at(px, py + 4, pz) === 'dragon_egg');
  check('the fight: killed, previously killed, bar hidden', fight.dragonKilled && fight.previouslyKilled && !fight.shownBar());
  const g = fight.save().gateways;
  check('one gateway used', g.length === 19);
  const gw = [...world.blockEntities.values()].find((b) => b.id === 'end_gateway');
  check('a gateway on the ring of 96 at y 75, capped in bedrock', gw && gw.y === 75 && Math.abs(Math.hypot(gw.x, gw.z) - 96) < 2 && at(gw.x, 77, gw.z) === 'bedrock' && at(gw.x, 73, gw.z) === 'bedrock' && at(gw.x + 1, 76, gw.z) === 'bedrock' && at(gw.x + 1, 75, gw.z) === 'air', gw ? `${gw.x},${gw.y},${gw.z}` : 'none');
  check('its spawn sound', sounds.some((s) => s.n === 'block.end_gateway.spawn' && s.v === 10));
  for (const e of level.entities) if (e instanceof orbMod.ExperienceOrb) e.remove();
}

// --- respawning: a crystal on each side of the portal
{
  const placeCrystal = (x, y, z) => { const c = new EndCrystal(level, x + 0.5, y, z + 0.5); c.showBottom = false; level.addEntity(c); EndCrystal.onPlaced?.(c); return c; };
  const four = [[0, -3], [3, 0], [0, 3], [-3, 0]].map(([dx, dz], i) => (i < 3 ? placeCrystal(px + dx, py + 1, pz + dz) : null));
  check('three crystals: nothing yet', !fight.respawnStage);
  four[3] = placeCrystal(px - 3, py + 1, pz);
  check('the fourth starts the respawn', fight.respawnStage === 'start');
  let lit = 0;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (at(px + dx, py, pz + dz) === 'end_portal') lit++;
  check('the portal goes out (rebuilt unlit)', lit === 0 && at(px, py + 3, pz) === 'bedrock');
  tick(1);
  check('beams up into the sky', four.every((c) => c.beamTarget?.join() === '0,128,0'));
  // knock a pillar's top off to see it rebuilt
  const s0 = spikes[0];
  for (let y = s0.height - 5; y < s0.height; y++) level.setBlock(s0.centerX, y, s0.centerZ, 0);
  const oldTop = level.entities.filter((e) => e instanceof EndCrystal && !e.removed && Math.abs(e.x - s0.centerX - 0.5) < 1 && Math.abs(e.z - s0.centerZ - 0.5) < 1);
  let beamedSpike = false;
  let n = 0;
  sounds.length = 0;
  while (fight.respawnStage && n++ < 1000) {
    tick();
    if (four[0].beamTarget && four[0].beamTarget[1] !== 128) beamedSpike = true;
  }
  check('the sequence runs its course (~30 s)', !fight.respawnStage && n > 590 && n < 620, `${n} ticks`);
  check('the crystals beamed at the pillars, which were rebuilt', beamedSpike && at(s0.centerX, s0.height - 1, s0.centerZ) === 'obsidian' && at(s0.centerX, s0.height, s0.centerZ) === 'bedrock');
  const newCrystals = level.entities.filter((e) => e instanceof EndCrystal && !e.removed && spikes.some((s) => Math.abs(e.x - s.centerX - 0.5) < 0.01 && Math.abs(e.z - s.centerZ - 0.5) < 0.01));
  check('a fresh crystal on each pillar, breakable again, beam off', newCrystals.length === 10 && newCrystals.every((c) => !c.invulnerable && !c.beamTarget), `${newCrystals.length}`);
  check('the four crystals burst and are gone', four.every((c) => c.removed));
  check('a new dragon, the fight\'s', dragons().length === 1 && dragons()[0].uuid === fight.dragonUUID && !fight.dragonKilled);
  check('growls heard (level event 3001)', sounds.filter((s) => s.n === 'entity.ender_dragon.growl' && s.v === 64).length >= 20);
  void oldTop;
}

// --- a second kill: 500 experience, no egg, another gateway
{
  const d = dragons()[0];
  level.setBlock(px, py + 4, pz, 0);
  d.kill();
  check('/kill: gone at once, and the fight is won', d.removed && fight.dragonKilled && fight.save().gateways.length === 18 && at(px, py + 4, pz) === 'air');
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
