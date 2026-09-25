// M3a: the trial chambers structure — where they go (a random spread of 34 × 34-chunk regions, 12 kept clear, salt
// 94251327; any Overworld biome but the deep dark, as it is down at the start), the start (height -40 to -20 drawn
// first, the start room at the start chunk's corner lowered to it), the pool aliases (the same mob for every spawner
// of a kind, ranged and slow ranged together, drawn as vanilla's positional random would), the layouts (no piece in
// another's room, all within 116 blocks of the start and 10 above the bottom of the world, every spawner the
// structure's mob, every chamber furnished), the pieces themselves (every way in leads to every way out and to every
// vault and chest), whole structures walked from the start room, and how long it all takes.

import { load, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load(['/src/world/gen/jigsaw.ts', '/src/world/gen/trialChambers.ts', '/src/world/gen/trialChamberTemplates.ts', '/src/world/gen/trialChamberPieces.ts']);
const SEED = '12345';
const WORLD = m.worldSeed64(SEED);

// an independent java.util.Random (and vanilla's LegacyRandomSource, Mth.getSeed) to check the game's randoms against
const MASK48 = (1n << 48n) - 1n;
class JRand {
  constructor(seed) { this.s = (BigInt.asIntN(64, BigInt(seed)) ^ 0x5deece66dn) & MASK48; }
  next(bits) { this.s = (this.s * 0x5deece66dn + 0xbn) & MASK48; return Number(BigInt.asIntN(32, this.s >> BigInt(48 - bits))); }
  nextInt(n) {
    if ((n & -n) === n) return Number((BigInt(n) * BigInt(this.next(31))) >> 31n);
    let bits, val;
    do { bits = this.next(31); val = bits % n; } while (bits - val + (n - 1) > 2147483647);
    return val;
  }
  nextLong() { const hi = BigInt(this.next(32)), lo = BigInt(this.next(32)); return BigInt.asIntN(64, (hi << 32n) + lo); }
  nextFloat() { return this.next(24) / 16777216; }
}
const getSeed = (x, y, z) => {
  let l = BigInt.asIntN(64, BigInt(BigInt.asIntN(32, BigInt(x) * 3129871n)) ^ (BigInt(z) * 116129781n) ^ BigInt(y));
  l = BigInt.asIntN(64, l * l * 42317861n + l * 11n);
  return l >> 16n;
};

// ---------------------------------------------------------------------------------------------------------------
// Where they go

{
  const plains = new m.TrialChambers(WORLD, { biome: () => m.B.plains });
  let ok = true, inWindow = true;
  for (const [rx, rz] of [[0, 0], [3, -2], [-5, 7], [11, 11]]) {
    // vanilla setLargeFeatureWithSalt(seed, rx, rz, 94251327), then nextInt(22) for x and for z (linear)
    const r = new JRand(BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + WORLD + 94251327n);
    const i = r.nextInt(22), j = r.nextInt(22);
    const [cx, cz] = plains.potentialChunk(rx, rz);
    if (cx !== rx * 34 + i || cz !== rz * 34 + j) ok = false;
  }
  for (let rx = -10; rx < 10; rx++)
    for (let rz = -10; rz < 10; rz++) {
      const [cx, cz] = plains.potentialChunk(rx, rz);
      if (cx - rx * 34 < 0 || cx - rx * 34 > 21 || cz - rz * 34 < 0 || cz - rz * 34 > 21) inWindow = false;
    }
  check('placement: the start chunk drawn from the salt 94251327 as vanilla draws it (spacing 34, separation 12)', ok);
  check('placement: every start chunk in its region\'s first 22 x 22 chunks', inWindow);

  // the start height, drawn first from the large feature random (vanilla UniformHeight -40..-20)
  const heights = new Set();
  let all = true, inRange = true, drawn = true;
  for (let rx = -12; rx < 12; rx++)
    for (let rz = -12; rz < 12; rz++) {
      const s = plains.stub(rx, rz);
      if (!s) { all = false; continue; }
      heights.add(s.y);
      if (s.y < -40 || s.y > -20) inRange = false;
      if (rx >= -1 && rx <= 1 && rz >= -1 && rz <= 1) {
        const r = new JRand(WORLD);
        const l = r.nextLong(), mm = r.nextLong();
        const h = -40 + new JRand(BigInt.asIntN(64, BigInt(s.cx) * l) ^ BigInt.asIntN(64, BigInt(s.cz) * mm) ^ WORLD).nextInt(21);
        if (h !== s.y) drawn = false;
      }
    }
  check('placement: a trial chambers in every region of an all-plains world', all);
  check(`placement: the start heights from -40 to -20, all 21 of them seen (${heights.size})`, inRange && heights.size === 21);
  check('placement: the start height is the large feature random\'s first draw (vanilla setLargeFeatureSeed)', drawn);

  const deep = new m.TrialChambers(WORLD, { biome: () => m.B.deep_dark });
  let none = true;
  for (let rx = -5; rx < 5; rx++) for (let rz = -5; rz < 5; rz++) if (deep.stub(rx, rz)) none = false;
  check('biomes: none in the deep dark', none);
  // the biome is the one down at the start's own height (the deep dark only below y -30 here)
  const low = new m.TrialChambers(WORLD, { biome: (_x, y) => (y < -30 ? m.B.deep_dark : m.B.plains) });
  let n = 0, above = true;
  for (let rx = -10; rx < 10; rx++)
    for (let rz = -10; rz < 10; rz++) {
      const s = low.stub(rx, rz);
      if (!s) continue;
      n++;
      if (s.y < -30) above = false;
    }
  check(`biomes: looked for at the start's height: with the deep dark below y -30 only the higher starts are kept (${n} of 400)`, above && n > 100 && n < 400);
  check('biomes: every Overworld biome but the deep dark takes them', m.BIOMES.every((b, i) => m.trialChambersBiome(i) === (i !== m.B.deep_dark)));

  // the start room: from the start pool, its floor a block under the start height, the start at its middle
  let start = true;
  for (let rx = -3; rx < 3; rx++)
    for (let rz = -3; rz < 3; rz++) {
      const s = plains.stub(rx, rz);
      const L = plains.layout(rx, rz);
      const p = L.pieces[0];
      const id = p.element.template.id;
      if (!/^trial_chambers\/chamber\/end_[12]$/.test(id) || p.box.minY !== s.y - 1 || s.x !== Math.trunc((p.box.minX + p.box.maxX) / 2) || s.z !== Math.trunc((p.box.minZ + p.box.maxZ) / 2)) start = false;
    }
  check('the start: an end room, its floor one below the start height, the start at its middle', start);

  const real = m.trialChambersLocator(SEED);
  const found = real.stubsIn(-3, -3, 2, 2);
  const near = real.nearest(0, 0);
  console.log(`     (seed ${SEED}, 6 x 6 regions: ${found.length} trial chambers; nearest to 0,0 at ${near.join(',')})`);
  check('seed 12345: trial chambers in most regions', found.length >= 25);
}

// ---------------------------------------------------------------------------------------------------------------
// The pool aliases (vanilla PoolAliasLookup.create: LegacyRandomSource(seed).forkPositional().at(corner at the height))

{
  const RANGED = ['skeleton', 'stray', 'poison_skeleton'], MELEE = ['zombie', 'husk', 'spider'], SMALL = ['slime', 'cave_spider', 'silverfish', 'baby_zombie'];
  let same = true, together = true;
  const seen = { ranged: new Set(), melee: new Set(), small: new Set() };
  for (let k = 0; k < 300; k++) {
    const x = (k * 7919) % 20000 - 10000, y = -40 + (k % 21), z = (k * 104729) % 20000 - 10000;
    const got = m.resolveAliases(m.ALIAS_BINDINGS, WORLD, x, y, z);
    const fork = new JRand(WORLD).nextLong();
    const r = new JRand(getSeed(x, y, z) ^ fork);
    const ranged = RANGED[r.nextInt(3)], melee = MELEE[r.nextInt(3)], small = SMALL[r.nextInt(4)];
    const name = (kind) => got.get(`trial_chambers/spawner/contents/${kind}`)?.split('/').pop();
    if (name('ranged') !== ranged || name('slow_ranged') !== ranged || name('melee') !== melee || name('small_melee') !== small) same = false;
    if (got.get('trial_chambers/spawner/contents/ranged').split('/').pop() !== got.get('trial_chambers/spawner/contents/slow_ranged').split('/').pop()) together = false;
    seen.ranged.add(name('ranged'));
    seen.melee.add(name('melee'));
    seen.small.add(name('small_melee'));
  }
  check('aliases: drawn as vanilla\'s positional random draws them (300 starts)', same);
  check('aliases: the ranged and slow ranged spawners always the same mob', together);
  check('aliases: every mob comes up', seen.ranged.size === 3 && seen.melee.size === 3 && seen.small.size === 4);
}

// ---------------------------------------------------------------------------------------------------------------
// Layouts

const tc = m.trialChambersLocator(SEED);
const stubs = tc.stubsIn(-3, -3, 2, 2).sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz)).slice(0, 12);
const layouts = stubs.map((s) => ({ s, L: tc.layout(Math.floor(s.cx / 34), Math.floor(s.cz / 34)) }));
const idOf = (p) => p.element.template.id.replace('trial_chambers/', '');
const isChamber = (id) => /^chamber\/(chamber_\d|assembly|eruption|slanted|pedestal)$/.test(id);
{
  let overlaps = 0, outside = 0, wrongMob = 0, bare = 0, chamberCounts = [], pieceCounts = [], doors = 0, doorsIn = 0;
  const STEP = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
  for (const { s, L } of layouts) {
    for (let i = 0; i < L.pieces.length; i++)
      for (let j = i + 1; j < L.pieces.length; j++) {
        const a = L.pieces[i].box, b = L.pieces[j].box;
        if (a.intersects(b) && !a.within(b) && !b.within(a)) overlaps++;
      }
    for (const p of L.pieces) {
      const b = p.box;
      if (b.minX < s.x - 116 || b.maxX > s.x + 116 || b.minZ < s.z - 116 || b.maxZ > s.z + 116 || b.minY < m.MIN_Y + 10 || b.maxY > s.y + 116) outside++;
      const id = idOf(p);
      const sp = /^spawner\/(melee|small_melee|ranged|slow_ranged)\/(\w+)$/.exec(id);
      if (sp && L.aliases.get(`trial_chambers/spawner/contents/${sp[1]}`) !== `trial_chambers/${id}`) wrongMob++;
      if (/^spawner\/contents\/(melee|small_melee|ranged|slow_ranged)$/.test(id)) wrongMob++;
    }
    // every chamber has its vaults and spawners (children in its box)
    let chambers = 0;
    for (const p of L.pieces) {
      if (!isChamber(idOf(p))) continue;
      chambers++;
      const inside = L.pieces.filter((q) => q !== p && q.box.within(p.box)).map(idOf);
      if (!inside.some((x) => x.startsWith('reward/')) || !inside.some((x) => x.startsWith('spawner/'))) bare++;
    }
    chamberCounts.push(chambers);
    pieceCounts.push(L.pieces.length);
    // the doors: into a chamber, or walled off
    const at = new Map();
    for (const p of L.pieces) for (const j of p.element.jigsaws(p.x, p.y, p.z, p.rot)) at.set(`${j.x},${j.y},${j.z}`, p);
    for (const p of L.pieces)
      for (const j of p.element.jigsaws(p.x, p.y, p.z, p.rot)) {
        if (j.info.pool !== 'trial_chambers/chambers/end') continue;
        doors++;
        const [dx, dy, dz] = STEP[j.front];
        const o = at.get(`${j.x + dx},${j.y + dy},${j.z + dz}`);
        if (o && (isChamber(idOf(o)) || idOf(o) === 'chamber/storeroom')) doorsIn++;
      }
  }
  const sorted = [...chamberCounts].sort((a, b) => a - b);
  console.log(`     (12 structures: ${Math.min(...pieceCounts)} to ${Math.max(...pieceCounts)} pieces, ${sorted[0]} to ${sorted[sorted.length - 1]} chambers, median ${sorted[6]}; ${doorsIn} of ${doors} doors lead into a chamber or a storeroom)`);
  check('layouts: no piece in another\'s space (but what stands in a room: its spawners, vaults, chests and pots)', overlaps === 0);
  check('layouts: every piece within 116 blocks of the start across, and 10 clear of the bottom of the world', outside === 0);
  check('layouts: every spawner the structure\'s own mob for its kind (the aliases)', wrongMob === 0);
  check('layouts: every chamber has its spawners and its vaults, even at the structure\'s last step', bare === 0);
  check('layouts: every trial chambers has chambers (at least 4), the median one 8 or more', sorted[0] >= 4 && sorted[6] >= 8);
  check('layouts: a few hundred pieces, never thousands', Math.max(...pieceCounts) < 1500 && Math.min(...pieceCounts) > 40);
  check('layouts: most doors lead somewhere (a chamber, or a storeroom where there was no room for one)', doorsIn / doors > 0.6);
}

// ---------------------------------------------------------------------------------------------------------------
// Walking round them: a player stands in two cells of room over something solid, steps or jumps up one, drops down

const COBWEB = m.S('cobweb');
/** flood fill from `starts` over a grid; `get(x, y, z)` is -1 outside anything, 0 air, else a block */
function walk(get, inb, starts) {
  const pass = (x, y, z) => { const v = get(x, y, z); return v === 0 || v === COBWEB || (v === -1 && !inb(x, y, z)); };
  const solid = (x, y, z) => inb(x, y, z) && !pass(x, y, z);
  const stand = (x, y, z) => inb(x, y, z) && pass(x, y, z) && pass(x, y + 1, z) && solid(x, y - 1, z);
  const seen = new Set();
  const q = [];
  const push = (x, y, z) => { const k = `${x},${y},${z}`; if (!seen.has(k) && stand(x, y, z)) { seen.add(k); q.push([x, y, z]); } };
  for (const [x, y, z] of starts) push(x, y, z);
  for (let h = 0; h < q.length; h++) {
    const [x, y, z] = q[h];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!inb(nx, y, nz)) continue;
      if (pass(x, y + 2, z)) push(nx, y + 1, nz);
      if (stand(nx, y, nz)) push(nx, y, nz);
      else if (pass(nx, y, nz) && pass(nx, y + 1, nz)) for (let yy = y - 1; yy > y - 40; yy--) { if (!pass(nx, yy, nz)) break; if (stand(nx, yy, nz)) { push(nx, yy, nz); break; } }
    }
  }
  return seen;
}
/** a block's in reach of a player standing within 4.5 of it (eyes 1.62 up) */
function usable(seen, x, y, z) {
  for (let yy = y - 5; yy <= y + 3; yy++)
    for (let zz = z - 4; zz <= z + 4; zz++)
      for (let xx = x - 4; xx <= x + 4; xx++) if (seen.has(`${xx},${yy},${zz}`) && Math.hypot(xx - x, yy + 1.62 - y - 0.5, zz - z) <= 4.5) return true;
  return false;
}

{
  // every piece on its own: from every way in, every way out and every vault and chest
  const els = new Set();
  for (const [name, p] of m.POOLS) if (name.startsWith('trial_chambers/')) for (const e of p.templates) if (e.t) els.add(e);
  const bad = [];
  let tried = 0;
  for (const e of els) {
    const t = e.template;
    // (the caps are a wall and nothing more)
    if (t.sx * t.sz <= 1 || t.sy <= 1 || t.sz === 1 || /_cap$|fallback$/.test(t.id)) continue;
    const I = (x, y, z) => (y * t.sz + z) * t.sx + x;
    const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < t.sx && y < t.sy && z < t.sz;
    const g = new Int32Array(t.sx * t.sy * t.sz).fill(-1);
    for (let i = 0; i < e.t.airs.length; i += 3) g[I(e.t.airs[i], e.t.airs[i + 1], e.t.airs[i + 2])] = 0;
    for (let i = 0; i < t.blocks.length; i += 4) g[I(t.blocks[i], t.blocks[i + 1], t.blocks[i + 2])] = t.blocks[i + 3];
    const targets = [];
    for (const j of t.jigsaws) if (j.front === 'up' && /reward|chests/.test(j.pool)) (g[I(j.x, j.y + 1, j.z)] = 1), targets.push([j.x, j.y + 1, j.z, j.pool]);
    for (let i = 0; i < t.blocks.length; i += 4) if (/^(chest|barrel)$/.test(m.blockOf(t.blocks[i + 3]).name)) targets.push([t.blocks[i], t.blocks[i + 1], t.blocks[i + 2], 'chest']);
    const get = (x, y, z) => (inb(x, y, z) ? g[I(x, y, z)] : -1);
    const ways = t.jigsaws.filter((j) => j.front !== 'up' && j.front !== 'down' && (j.pool !== 'empty' || j.name === 'trial_chambers:chamber_entrance'));
    for (const w of ways) {
      tried++;
      const seen = walk(get, inb, [[w.x, w.y + 1, w.z]]);
      for (const o of ways) {
        const [bx, bz] = o.front === 'north' ? [0, 1] : o.front === 'south' ? [0, -1] : o.front === 'west' ? [1, 0] : [-1, 0];
        if (!seen.has(`${o.x},${o.y + 1},${o.z}`) && !seen.has(`${o.x + bx},${o.y + 1},${o.z + bz}`)) bad.push(`${t.id}: ${o.x},${o.y},${o.z} from ${w.x},${w.y},${w.z}`);
      }
      for (const [x, y, z, what] of targets) if (!usable(seen, x, y, z)) bad.push(`${t.id}: ${what} at ${x},${y},${z} from ${w.x},${w.y},${w.z}`);
    }
  }
  check(`pieces: from every way in (${tried}), every way out and every vault and chest can be walked to`, bad.length === 0, bad.slice(0, 4).join('; '));

  // whole structures, from the start room
  let n = 0, reached = 0;
  const missed = {};
  for (const { L } of layouts.slice(0, 4)) {
    const cells = new Map();
    const bes = [];
    const ctx = {
      set(x, y, z, st) { cells.set(`${x},${y},${z}`, st); },
      getOrAir(x, y, z) { return cells.get(`${x},${y},${z}`) ?? 1; },
      blockEntities: bes, markForPostprocessing() {}, scheduleFluid() {},
    };
    const chunk = new m.Box(L.box.minX, m.MIN_Y, L.box.minZ, L.box.maxX, m.MAX_Y - 1, L.box.maxZ);
    for (const p of L.pieces) p.element.place({ ctx, chunk, salt: 1 }, p);
    const get = (x, y, z) => cells.get(`${x},${y},${z}`) ?? -1;
    const inb = (x, y, z) => L.box.isInside(x, y, z);
    const s = L.pieces[0];
    const starts = [];
    for (let x = s.box.minX; x <= s.box.maxX; x++) for (let z = s.box.minZ; z <= s.box.maxZ; z++) starts.push([x, s.y + 1, z]);
    const seen = walk(get, inb, starts);
    for (const b of bes) {
      if (!/^(chest|barrel|vault|dispenser|decorated_pot)$/.test(b.id)) continue;
      n++;
      if (usable(seen, b.x, b.y, b.z)) reached++;
      else missed[b.id] = (missed[b.id] ?? 0) + 1;
    }
  }
  check(`whole structures: every vault, chest, barrel, dispenser and pot can be reached from the start room (${reached} of ${n})`, reached === n, JSON.stringify(missed));
}

// ---------------------------------------------------------------------------------------------------------------
// What it costs

{
  const fresh = m.trialChambersLocator(SEED);
  let t0 = performance.now();
  let k = 0;
  for (let rx = 3; rx < 6; rx++) for (let rz = 3; rz < 6; rz++) if (fresh.layout(rx, rz)) k++;
  const per = (performance.now() - t0) / k;
  console.log(`     (laying out a trial chambers: ${per.toFixed(1)} ms)`);
  check('cost: laying one out takes well under a tenth of a second', per < 100);
  t0 = performance.now();
  let n = 0;
  for (let cx = -200; cx < 200; cx += 3) for (let cz = -200; cz < 200; cz += 3) { fresh.hasStartNear(cx, cz); n++; }
  const each = (performance.now() - t0) / n;
  console.log(`     (looking for trial chambers round a chunk: ${(each * 1000).toFixed(1)} µs)`);
  check('cost: looking for trial chambers round a chunk takes well under a millisecond', each < 1);
}

await exitWithStatus(close);
