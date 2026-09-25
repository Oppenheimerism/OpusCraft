// Respawning (vanilla PlayerList.respawn → ServerPlayer.adjustSpawnLocation, PlayerRespawnLogic): with the world spawn
// buried under blocks, in a cave, under water, among fences, out at sea, and with its chunks not loaded yet, respawn
// many times — the player never ends up in a block or a fluid, and standing there for a while never suffocates.

import { load, check, exitWithStatus, genLevel, flatLevel, addPlayer } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/game/respawnLogic.ts', '/src/game/sleep.ts']);
const SEED = '8675309';
const gen = new m.ChunkGenerator(SEED);
const TRIES = 200;

// a real world, 9 x 9 chunks round a land column near the origin
const { world, level } = genLevel(m, gen, SEED, -4, -4, 4, 4);
const spot = m.spawnPosInChunk(level, 0, 0) ?? m.spawnPosInChunk(level, 1, 1);
check('generated world: a spawn spot on land in the middle chunks', !!spot, String(spot));
const [SX, SY, SZ] = spot;
const p = addPlayer(m, level, SX + 0.5, SY, SZ + 0.5);

const box = (x, y, z) => new m.AABB(x - 0.3, y, z - 0.3, x + 0.3, y + 1.8, z + 0.3);
const liquidIn = (b) => {
  for (let x = Math.floor(b.minX); x <= Math.floor(b.maxX - 1e-7); x++)
    for (let y = Math.floor(b.minY); y <= Math.floor(b.maxY - 1e-7); y++)
      for (let z = Math.floor(b.minZ); z <= Math.floor(b.maxZ - 1e-7); z++) if (m.FLAGS[world.getState(x, y, z)] & (m.F_WATER | m.F_LAVA)) return true;
  return false;
};

/** a fake Game for respawnArrival: tickets and chat written down */
function host(spawn, gameMode = 'survival') {
  const h = {
    level, player: p, worldSpawn: spawn, meta: { gameMode }, tickets: {}, chats: [],
    chunks: { setTicket: (n, t) => { h.tickets[n] = t; }, setCenter() {} },
    teleport(x, y, z, yaw, pitch) {
      p.removeVehicle();
      p.moveTo(x, y, z, yaw ?? p.yaw, pitch ?? p.pitch);
      p.dx = p.dy = p.dz = 0;
      p.fallDistance = 0;
    },
    chat: (msg) => h.chats.push(msg),
  };
  return h;
}

/** respawn `n` times at `spawn`: every time somewhere a standing player fits, clear of fluids; then stand 3 s there */
function respawnMany(name, spawn, { n = TRIES, stand = true, gameMode = 'survival', within = 10 } = {}) {
  let bad = null, far = 0, hurts = new Set(), inWater = 0;
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    p.health = p.maxHealth;
    p.hurts.length = 0;
    const h = host(spawn, gameMode);
    const done = m.respawnArrival()(h);
    if (!done) {
      bad = 'waited with every chunk loaded';
      break;
    }
    seen.add(`${Math.floor(p.x)},${Math.floor(p.z)}`);
    const b = box(p.x, p.y, p.z);
    if (!p.isFree(b)) bad ??= `in a block at ${p.x} ${p.y} ${p.z}`;
    if (liquidIn(b)) bad ??= `in a fluid at ${p.x} ${p.y} ${p.z}`;
    if (Math.max(Math.abs(Math.floor(p.x) - spawn[0]), Math.abs(Math.floor(p.z) - spawn[2])) > within) far++;
    if (stand && i < 20) {
      for (let t = 0; t < 60; t++) level.tick();
      for (const s of p.hurts) hurts.add(s);
      if (p.isInWall()) bad ??= `in a wall after 3 s at ${p.x} ${p.y} ${p.z}`;
      if (p.inWater || p.inLava) inWater++;
    }
  }
  check(`${name}: ${n} respawns, never in a block or a fluid`, !bad, bad ?? '');
  check(`${name}: all within the spawn radius`, far === 0, `${far} outside`);
  if (stand) check(`${name}: standing there 3 s, never suffocating (hurt by: ${[...hurts].join(', ') || 'nothing'})`, !hurts.has('inWall') && !hurts.has('drown'));
  return { seen, inWater };
}

const set = (x, y, z, name) => level.setBlock(x, y, z, m.S(name));
const fill = (x0, y0, z0, x1, y1, z1, name) => {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, name);
};

// ---------------------------------------------------------------------------------------------------------------
// the open spawn: spread over the spawn radius, like vanilla's

{
  const { seen } = respawnMany('open ground', [SX, SY, SZ]);
  check(`open ground: spread over the radius (${seen.size} different columns in ${TRIES})`, seen.size > 40);
}

// buried: a 9 x 9 block of stone from under the spawn to 30 above it
{
  fill(SX - 4, SY - 3, SZ - 4, SX + 4, SY + 30, SZ + 4, 'stone');
  const s = world.getState(SX, SY, SZ);
  check('buried: the spawn itself is inside stone', m.BLOCKS[m.STATE_BLOCK[s]].name === 'stone');
  respawnMany('buried spawn', [SX, SY, SZ]);
  // radius 0 (the gamerule): straight up out of the stone, onto its top
  level.gameRules.spawnRadius = 0;
  let ok = true;
  for (let i = 0; i < 20; i++) {
    m.respawnArrival()(host([SX, SY, SZ]));
    if (Math.floor(p.x) !== SX || Math.floor(p.z) !== SZ || p.y !== SY + 31 || !p.isFree(box(p.x, p.y, p.z))) ok = false;
  }
  check('buried, spawnRadius 0: up out of the stone onto its top', ok, `${p.x} ${p.y} ${p.z}`);
  level.gameRules.spawnRadius = 10;
  fill(SX - 4, SY - 3, SZ - 4, SX + 4, SY + 30, SZ + 4, 'air');
  fill(SX - 4, SY - 3, SZ - 4, SX + 4, SY - 1, SZ + 4, 'dirt');
}

// in a cave: the spawn deep underground in a pocket of air
{
  fill(SX - 3, 9, SZ - 3, SX + 3, 13, SZ + 3, 'stone');
  fill(SX - 2, 10, SZ - 2, SX + 2, 12, SZ + 2, 'air');
  respawnMany('cave spawn (y 11)', [SX, 11, SZ]);
  // an adventure world has no radius: up and down from the spawn, which in the cave is its floor
  const h = host([SX, 11, SZ], 'adventure');
  m.respawnArrival()(h);
  check('cave spawn, adventure: on the cave floor under the spawn', Math.floor(p.x) === SX && Math.floor(p.z) === SZ && p.y === 10 && p.isFree(box(p.x, p.y, p.z)), `${p.x} ${p.y} ${p.z}`);
  fill(SX - 2, 10, SZ - 2, SX + 2, 12, SZ + 2, 'stone');
}

// under water: a pond 13 across, 5 deep, the spawn at its bottom
{
  // (in a rim of stone, so it doesn't run off down the hillside)
  fill(SX - 7, SY - 6, SZ - 7, SX + 7, SY - 1, SZ + 7, 'stone');
  fill(SX - 6, SY - 5, SZ - 6, SX + 6, SY - 1, SZ + 6, 'water');
  fill(SX - 7, SY, SZ - 7, SX + 7, SY + 3, SZ + 7, 'air');
  const { inWater } = respawnMany('under water', [SX, SY - 5, SZ]);
  check('under water: never standing in the pond afterwards', inWater === 0, `${inWater} of 20 in water`);
  fill(SX - 6, SY - 5, SZ - 6, SX + 6, SY - 1, SZ + 6, 'dirt');
}

// fences all round: their tops aren't full and their collision is 1.5 high, so none are stood in
{
  for (let x = SX - 10; x <= SX + 10; x++) for (let z = SZ - 10; z <= SZ + 10; z++) if ((x + z) % 2 === 0) set(x, level.motionBlockingHeight(x, z), z, 'oak_fence');
  respawnMany('among fences', [SX, SY, SZ], { stand: false });
}

// ---------------------------------------------------------------------------------------------------------------
// out at sea: nothing dry within the radius — up to the surface, where a player fits (vanilla does the same)

{
  const { world: w2, level: l2 } = flatLevel(m, -2, -2, 2, 2, 40, 'stone', 'sea');
  for (let x = -32; x < 48; x++) for (let z = -32; z < 48; z++) for (let y = 40; y < 63; y++) w2.setState(x, y, z, m.S('water'));
  const q = addPlayer(m, l2, 8.5, 70, 8.5);
  let bad = null;
  for (let i = 0; i < 50; i++) {
    const pos = m.adjustSpawnLocation(l2, q, 8, 41, 8, false);
    const b = new m.AABB(pos[0] + 0.2, pos[1], pos[2] + 0.2, pos[0] + 0.8, pos[1] + 1.8, pos[2] + 0.8);
    if (pos[0] !== 8 || pos[2] !== 8 || pos[1] !== 63 || !q.isFree(b)) bad = pos.join(' ');
  }
  check('open sea: straight up from the sea floor to the surface (8 63 8)', !bad, bad ?? '');
}

// ---------------------------------------------------------------------------------------------------------------
// chunks not loaded yet: nothing's decided (and the player waits) until the ones it looks in and their neighbours are

{
  const { world: w3, level: l3 } = genLevel(m, gen, SEED, 0, 0, 0, 0);
  const q = addPlayer(m, l3, SX + 0.5, 200, SZ + 0.5);
  const h = { ...host([SX, SY, SZ]), level: l3, player: q, teleport(x, y, z) { q.moveTo(x, y, z, 0, 0); } };
  const arrive = m.respawnArrival();
  let waits = 0, waitedAt = null;
  while (!arrive(h) && waits < 20) {
    waits++;
    waitedAt ??= [q.x, q.y, q.z];
    const t = h.tickets.respawn;
    // (what the chunk manager does for the ticket: the chunks in its square come in)
    genLevel(m, gen, SEED, t[0] - t[2], t[1] - t[2], t[0] + t[2], t[1] + t[2], w3);
  }
  check('unloaded: waits for the chunks round the spawn (a ticket asks for them), then places the player', waits === 1 && h.tickets.respawn === null, `${waits} waits, ticket ${JSON.stringify(h.tickets.respawn)}`);
  check('unloaded: while waiting the player stood at the world spawn', waitedAt && waitedAt[0] === SX + 0.5 && waitedAt[1] === SY && waitedAt[2] === SZ + 0.5, String(waitedAt));
  check('unloaded: then placed clear of blocks and fluids', q.isFree(box(q.x, q.y, q.z)) && !liquidIn.call(null, box(q.x, q.y, q.z)));
  // a wide spawnRadius asks for more chunks
  l3.gameRules.spawnRadius = 40;
  const h2 = { ...h, tickets: {} };
  h2.chunks = { setTicket: (n, t) => { h2.tickets[n] = t; }, setCenter() {} };
  const done = m.respawnArrival()(h2);
  check('spawnRadius 40: waits, with a ticket reaching 40 blocks and a chunk more', !done && h2.tickets.respawn[2] >= 4, JSON.stringify(h2.tickets.respawn));
}

// ---------------------------------------------------------------------------------------------------------------
// the bed first, when it's there; else told so, forgotten, and near the world spawn

{
  const bx = SX + 3, bz = SZ;
  const by = level.motionBlockingHeight(bx, bz);
  fill(bx - 1, by, bz - 2, bx + 1, by + 3, bz + 2, 'air');
  level.setBlock(bx, by, bz, m.S('red_bed', { facing: 'south', part: 'foot' }));
  level.setBlock(bx, by, bz + 1, m.S('red_bed', { facing: 'south', part: 'head' }));
  p.respawnPos = [bx, by, bz + 1];
  p.respawnForced = false;
  const h = host([SX, SY, SZ]);
  m.respawnArrival()(h);
  check('bed: respawned beside it, clear', Math.abs(p.x - bx - 0.5) <= 1.6 && Math.abs(p.z - bz - 1) <= 2.6 && p.isFree(box(p.x, p.y, p.z)) && h.chats.length === 0, `${p.x} ${p.y} ${p.z}`);
  level.setBlock(bx, by, bz, 0);
  level.setBlock(bx, by, bz + 1, 0);
  const h2 = host([SX, SY, SZ]);
  m.respawnArrival()(h2);
  check('bed gone: told so, forgotten, at the world spawn', h2.chats.length === 1 && p.respawnPos === null && Math.abs(p.x - SX) <= 11 && p.isFree(box(p.x, p.y, p.z)));
}

// ---------------------------------------------------------------------------------------------------------------
// after a /tp into chunks that aren't there yet, the player stays put until they come (vanilla LocalPlayer.tick)

{
  p.respawnPos = null;
  p.moveTo(5000.5, 100, 5000.5, 0, 0);
  p.dy = 0;
  for (let i = 0; i < 40; i++) level.tick();
  check('/tp into unloaded chunks: the player waits in the air, not falling', p.y === 100 && p.health === p.maxHealth, `y ${p.y}`);
}

await exitWithStatus(close);
