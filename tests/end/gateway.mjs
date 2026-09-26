// End gateways, headless: node tests/end/gateway.mjs [seed]
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods: [, blockMod, worldMod, dimMod, levelMod, genMod, gwMod, travelMod, playerMod, thrownMod, beMod, itemEntMod, itemMod, behMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/dimension.ts', '/src/game/level.ts', '/src/world/gen/theEnd.ts',
  '/src/game/endGateway.ts', '/src/game/gatewayTravel.ts', '/src/entity/player.ts', '/src/entity/throwable.ts', '/src/world/blockEntity.ts',
  '/src/entity/itemEntity.ts', '/src/item/item.ts', '/src/game/blockBehavior.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const { BLOCKS, STATE_BLOCK } = blockMod;
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;

const seed = process.argv[2] ?? '12345';
const gen = new genMod.EndGenerator(seed);
const world = new worldMod.World();
world.reset(dimMod.THE_END);
const level = new levelMod.Level(world, seed);
const particles = new Map();
level.sound = { play() {}, playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn: (k) => particles.set(k, (particles.get(k) ?? 0) + 1) };
const load = (cx, cz) => { if (!world.getChunk(cx, cz)) world.addChunk(gen.generate(cx, cz)); };
for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) load(cx, cz);
// the game's side of the tickets: whatever they name gets loaded (here at once, at the end of the tick)
let loadedForTickets = 0;
const pump = () => {
  for (const t of level.tickets.values())
    for (let cz = t.cz - t.load; cz <= t.cz + t.load; cz++)
      for (let cx = t.cx - t.load; cx <= t.cx + t.load; cx++) if (!world.getChunk(cx, cz)) { load(cx, cz); loadedForTickets++; }
};
const tick = (n = 1) => { for (let i = 0; i < n; i++) { level.tick(); pump(); } };
// (the game's hook)
level.onPortal = (e, x, y, z, kind) => { if (kind === 'end_gateway') travelMod.gatewayTravel(level, e, x, y, z); };
const at = (x, y, z) => name(world.getState(x, y, z));

const player = new playerMod.Player(level);
player.setGameMode('survival');
level.player = player;
level.addEntity(player);

// a gateway on the ring (vanilla spawnNewGateway's first spot is one of 20, 96 out at y 75)
const gx = 96, gy = 75, gz = 0;
gwMod.placeEndGateway(level, gx, gy, gz, null, false);
check('the gateway and its bedrock', at(gx, gy, gz) === 'end_gateway' && at(gx, gy + 1, gz) === 'bedrock' && at(gx, gy + 2, gz) === 'bedrock' && at(gx + 1, gy + 1, gz) === 'bedrock' && at(gx + 1, gy, gz) === 'air' && at(gx + 1, gy + 2, gz) === 'air');
const be = world.getBlockEntity(gx, gy, gz);
check('its block entity, leading nowhere yet, spawning', be instanceof beMod.EndGatewayBlockEntity && be.exitPortal === null && be.isSpawning());

// the player stands on a platform next to it; a pearl thrown from there into the gateway
for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) world.setState(gx - 3 + dx, gy - 2, gz + dz, blockMod.S('obsidian'));
player.moveTo(gx - 3 + 0.5, gy - 1, gz + 0.5, -90, 0);
tick(210);
check('done spawning after 200 ticks', !be.isSpawning() && !be.isCoolingDown());
const pearl = new thrownMod.ThrownItem(level, 'ender_pearl', player);
pearl.moveTo(gx - 1 + 0.5, gy + 0.4, gz + 0.5, 0, 0);
pearl.dx = 0.5; pearl.dy = 0; pearl.dz = 0;
level.addEntity(pearl);
let held = false, teleported = false, t = 0;
const before = [player.x, player.y, player.z];
for (; t < 200 && !teleported; t++) {
  tick(1);
  if (level.inTransit.has(pearl)) held = true;
  if (process.env.DBG) console.log('  t', t, 'pearl', pearl.x.toFixed(2), pearl.y.toFixed(2), pearl.z.toFixed(2), 'removed', pearl.removed, 'transit', level.inTransit.has(pearl), 'tickets', level.tickets.size, 'exit', JSON.stringify(be.exitPortal));
  teleported = Math.abs(player.x - before[0]) > 100 || Math.abs(player.z - before[2]) > 100;
}
check('the pearl was held while the far side loaded', held, `${loadedForTickets} chunks loaded for it`);
check('the pearl took the player through', teleported, `after ${t} ticks, at ${player.x.toFixed(1)} ${player.y.toFixed(1)} ${player.z.toFixed(1)}`);
check('the gateway went into its cooldown', be.teleportCooldown > 0 || t > 40);
const exit = be.exitPortal;
if (process.env.DBG) {
  const [a, b, c] = exit;
  for (let dz = -3; dz <= 3; dz++) { let row = ''; for (let dx = -3; dx <= 3; dx++) { let top = -1; for (let y = b - 3; y > 0; y--) if (at(a + dx, y, c + dz) !== 'air') { top = y; break; } row += String(top).padStart(4); } console.log('  tops', row); }
  console.log('  column at pearl', [76, 75, 74, 73].map((y) => at(1274, y, -2)).join());
}
check('the gateway now leads somewhere', !!exit, JSON.stringify(exit));
const [ex, ey, ez] = exit;
const d = Math.hypot(ex, ez);
check('out along its own line, 768..1280 out', d > 700 && d < 1330 && Math.abs(ez) < 40, `(${ex}, ${ez}) ${d.toFixed(0)} out`);
check('a gateway back there, leading here', at(ex, ey, ez) === 'end_gateway' && JSON.stringify(world.getBlockEntity(ex, ey, ez)?.exitPortal) === JSON.stringify([gx, gy, gz]) && world.getBlockEntity(ex, ey, ez).exactTeleport === false);
check('with its bedrock', at(ex, ey + 2, ez) === 'bedrock' && at(ex, ey - 2, ez) === 'bedrock' && at(ex, ey - 1, ez + 1) === 'bedrock');
// ten blocks over the highest ground within 16 of where it settled: that ground is in the gateway's own column
{
  let clear = true;
  for (let y = ey - 9; y <= ey - 3; y++) if (at(ex, y, ez) !== 'air') clear = false;
  check('ten blocks over the ground in its column', at(ex, ey - 10, ez) === 'end_stone' && clear, `gateway y ${ey}, under it ${at(ex, ey - 10, ez)}`);
}
check('the player stands within 5 of it on the ground', Math.abs(player.x - (ex + 0.5)) <= 5.5 && Math.abs(player.z - (ez + 0.5)) <= 5.5 && player.y < ey && at(Math.floor(player.x), Math.floor(player.y) - 1, Math.floor(player.z)) === 'end_stone',
  `${player.x.toFixed(1)} ${player.y.toFixed(1)} ${player.z.toFixed(1)} on ${at(Math.floor(player.x), Math.floor(player.y) - 1, Math.floor(player.z))}`);
check('5 hearts less for the pearl', player.health === 15, String(player.health));
check('the far side stays loaded a while (portal ticket)', [...level.tickets.keys()].some((k) => k.startsWith('portal ')));
check('no gateway search tickets left', ![...level.tickets.keys()].some((k) => k.startsWith('gateway ')));

// back: straight into the gateway over there (as if flown in): out on top of the ring gateway's bedrock (the
// platform the pearl was thrown from gone: it would be the highest ground within 5)
for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) world.setState(gx - 3 + dx, gy - 2, gz + dz, 0);
player.health = 20;
tick(60);
const be2 = world.getBlockEntity(ex, ey, ez);
be2.age = 1000;
player.moveTo(ex + 0.5, ey, ez + 0.5, 0, 0);
player.dx = player.dy = player.dz = 0;
let back = false;
for (t = 0; t < 100 && !back; t++) {
  tick(1);
  back = Math.hypot(player.x - gx, player.z - gz) < 20;
}
check('the gateway back takes the player home', back, `${player.x.toFixed(1)} ${player.y.toFixed(1)} ${player.z.toFixed(1)}`);
{
  // (the highest ground within 5 of the ring gateway, not bedrock and not its own column: the island's edge under
  // it, or failing that the top of its own bedrock)
  let best = null;
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
    if (!i && !j) continue;
    for (let y = 255; y > (best ? best[1] : 0); y--) { const n = at(gx + i, y, gz + j); if (n === 'end_stone' || n === 'obsidian') { best = [gx + i, y, gz + j]; break; } }
  }
  const want = best ? [best[0] + 0.5, best[1] + 1, best[2] + 0.5] : [gx + 0.5, gy + 3, gz + 0.5];
  check('onto the highest ground within 5 of the ring gateway', Math.abs(player.x - want[0]) < 0.01 && Math.abs(player.y - want[1]) < 0.01 && Math.abs(player.z - want[2]) < 0.01, `${player.x.toFixed(2)} ${player.y.toFixed(2)} ${player.z.toFixed(2)} want ${want}`);
}

// an item thrown into a cooling-down gateway stays; once it's cool, through it goes
const it = new itemEntMod.ItemEntity(level, new itemMod.ItemStack(itemMod.ITEMS.get('stick'), 1));
be.teleportCooldown = 40;
it.moveTo(gx + 0.5, gy + 0.2, gz + 0.5, 0, 0);
it.dx = it.dy = it.dz = 0;
level.addEntity(it);
tick(2);
check('a cooling-down gateway takes nothing', Math.floor(it.x) === gx && Math.floor(it.z) === gz);
tick(60);
check('once cool, an item goes through too', Math.hypot(it.x - ex, it.z - ez) < 10, `${it.x.toFixed(1)} ${it.y.toFixed(1)} ${it.z.toFixed(1)}`);

// every 2 minutes a gateway flashes its cooldown beam
const b3 = world.getBlockEntity(gx, gy, gz);
b3.teleportCooldown = 0;
b3.age = 2399;
b3.tick(level);
check('every 2400 ticks it cools down (the purple flash)', b3.teleportCooldown === 40);

// particles: 4 faces show (the sides), so 4 portal particles a call
particles.clear();
const GW = world.getState(gx, gy, gz);
for (let i = 0; i < 10; i++) behMod.behaviorOf(GW).animateTick(level, gx, gy, gz, GW);
check('4 faces show, 4 portal particles a tick', particles.get('portal') === 40 && [0, 1, 2, 3, 4, 5].filter((d) => be.shouldRenderFace(world, d)).join() === '2,3,4,5', String(particles.get('portal')));
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
