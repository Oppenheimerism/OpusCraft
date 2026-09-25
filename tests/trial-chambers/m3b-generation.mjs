// M3b: the trial chambers in the world — real chunks round seed 12345's nearest one (its end room, its chests with
// their loot tables, its trial spawners with the structure's mobs, its vaults normal and ominous, its pots with
// theirs), every loot table the pieces name (there, and giving only what they hold), a pot's loot (rolled the first
// time it's looked in, kept until then through saving), the pieces' processors (waxed copper bulbs left to age by
// their position, nothing put over a spawner or a chest, water shut out rather than soaked in), the ground round it
// filled in solid (vanilla ENCAPSULATE, checked against the formula), /locate, being in one, and what it costs.

import { load, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load([
  '/src/world/gen/generator.ts', '/src/world/gen/jigsaw.ts', '/src/world/gen/trialChambers.ts', '/src/world/gen/trialChamberTemplates.ts',
  '/src/world/gen/trialChamberPieces.ts', '/src/game/trialChamberStructure.ts', '/src/game/commands.ts', '/src/game/loot.ts', '/src/game/decoratedPot.ts',
  '/src/game/trialSpawner.ts', '/src/game/vault.ts', '/src/inventory/container.ts', '/src/world/blockEntity.ts',
]);
const SEED = '12345';
const gen = new m.ChunkGenerator(SEED);
const tc = gen.trialChambers;
const name = (st) => m.BLOCKS[m.STATE_BLOCK[st]].name;

// an independent java.util.Random and Mth.getSeed (for the copper bulbs)
const MASK48 = (1n << 48n) - 1n;
class JRand {
  constructor(seed) { this.s = (BigInt.asIntN(64, BigInt(seed)) ^ 0x5deece66dn) & MASK48; }
  next(bits) { this.s = (this.s * 0x5deece66dn + 0xbn) & MASK48; return Number(BigInt.asIntN(32, this.s >> BigInt(48 - bits))); }
  nextFloat() { return this.next(24) / 16777216; }
}
const getSeed = (x, y, z) => {
  let l = BigInt.asIntN(64, BigInt(BigInt.asIntN(32, BigInt(x) * 3129871n)) ^ (BigInt(z) * 116129781n) ^ BigInt(y));
  l = BigInt.asIntN(64, l * l * 42317861n + l * 11n);
  return l >> 16n;
};

// ---------------------------------------------------------------------------------------------------------------
// Real chunks

const [lx, lz] = tc.nearest(0, 0);
const rx = Math.floor((lx >> 4) / 34), rz = Math.floor((lz >> 4) / 34);
const L = tc.layout(rx, rz);
const stub = tc.stub(rx, rz);
const start = L.pieces[0];
// the chunks over the end room and the first chamber put by it (a door of the end room's own)
const isChamber = (p) => /chamber\/(chamber_\d|assembly|eruption|slanted|pedestal)$/.test(p.element.template.id);
const first = L.pieces.find(isChamber);
const bx0 = Math.min(start.box.minX, first.box.minX), bz0 = Math.min(start.box.minZ, first.box.minZ);
const bx1 = Math.max(start.box.maxX, first.box.maxX), bz1 = Math.max(start.box.maxZ, first.box.maxZ);
const world = new m.World();
const outs = [];
let t0 = performance.now();
for (let cx = (bx0 >> 4) - 1; cx <= (bx1 >> 4) + 1; cx++)
  for (let cz = (bz0 >> 4) - 1; cz <= (bz1 >> 4) + 1; cz++) {
    const out = gen.generate(cx, cz);
    outs.push(out);
    world.addChunk({ ...out });
  }
const level = new m.Level(world, SEED);
level.sound = { play() {}, playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn() {}, dust() {}, poof() {}, blockParticle() {}, fallingDust() {} };
console.log(`     (the trial chambers at ${lx},${lz}: start ${stub.x},${stub.y},${stub.z}, ${L.pieces.length} pieces; ${outs.length} chunks generated in ${(performance.now() - t0).toFixed(0)} ms)`);
console.log(`     (its end room ${start.element.template.id.split('/').pop()} from ${start.box.minX},${start.box.minY},${start.box.minZ} to ${start.box.maxX},${start.box.maxY},${start.box.maxZ}; first chamber ${first.element.template.id.split('/').pop()} at ${first.box.minX},${first.box.minY},${first.box.minZ} to ${first.box.maxX},${first.box.maxY},${first.box.maxZ})`);

{
  const cx = Math.trunc((start.box.minX + start.box.maxX) / 2), cz = Math.trunc((start.box.minZ + start.box.maxZ) / 2);
  const floor = name(world.getState(cx, start.y, cz)), inside = [1, 2, 3].map((dy) => name(world.getState(cx + 3, start.y + dy, cz)));
  check('real chunks: the end room is there, its floor of tuff and copper, carved out above', /tuff|copper/.test(floor) && inside.every((n) => n === 'air'), `${floor} / ${inside}`);
  const bes = outs.flatMap((o) => o.blockEntities);
  const inStart = bes.filter((b) => start.box.isInside(b.x, b.y, b.z));
  const entrance = inStart.filter((b) => b.id === 'chest');
  const loaded = entrance.map((b) => world.getBlockEntity(b.x, b.y, b.z));
  check('real chunks: the end room\'s two entrance chests, each with the entrance loot table and a seed of its own', entrance.length === 2 &&
    loaded.every((be) => be instanceof m.ChestBlockEntity && be.lootTable === 'chests/trial_chambers/entrance') && loaded[0].lootSeed !== loaded[1].lootSeed);
  const spawners = bes.filter((b) => b.id === 'trial_spawner').map((b) => world.getBlockEntity(b.x, b.y, b.z));
  const mobs = new Set([...L.aliases.values()].map((p) => p.replace('trial_chambers/spawner/', 'trial_chamber/')));
  check(`real chunks: the trial spawners (${spawners.length}) with their configs, each the structure's own mob or a breeze`, spawners.length >= 2 &&
    spawners.every((s) => s instanceof m.TrialSpawnerBlockEntity && (mobs.has(s.normalConfig.replace(/\/normal$/, '')) || s.normalConfig === 'trial_chamber/breeze/normal') &&
      s.ominousConfig === s.normalConfig.replace(/normal$/, 'ominous') && m.TRIAL_SPAWNER_CONFIGS[s.normalConfig] && m.TRIAL_SPAWNER_CONFIGS[s.ominousConfig]));
  const vaults = bes.filter((b) => b.id === 'vault').map((b) => world.getBlockEntity(b.x, b.y, b.z));
  const ominous = vaults.filter((v) => m.blockOf(world.getState(v.x, v.y, v.z)).get(world.getState(v.x, v.y, v.z), 'ominous') === true);
  check(`real chunks: the chamber's vaults (${vaults.length}): the normal ones taking a trial key, the ominous ones (${ominous.length}) an ominous trial key for the ominous loot`,
    vaults.length >= 1 && vaults.every((v) => v instanceof m.VaultBlockEntity) &&
    vaults.every((v) => (ominous.includes(v) ? v.config.keyItem === 'ominous_trial_key' && v.config.lootTable === 'chests/trial_chambers/reward_ominous' : v.config.keyItem === 'trial_key' && v.config.lootTable === 'chests/trial_chambers/reward')));
  // the vaults face into their room: out of the dais, toward the chamber's door
  const facing = new Set(vaults.map((v) => m.blockOf(world.getState(v.x, v.y, v.z)).get(world.getState(v.x, v.y, v.z), 'facing')));
  check('real chunks: the vaults all face the same way, into their chamber', facing.size === 1);
  const pots = bes.filter((b) => b.id === 'decorated_pot').map((b) => world.getBlockEntity(b.x, b.y, b.z));
  check(`real chunks: the pots (${pots.length}) with the corridors' pot loot`, pots.length >= 1 && pots.every((p) => p instanceof m.DecoratedPotBlockEntity && p.lootTable === 'pots/trial_chambers/corridor'));
  // a chest opened: its loot
  const chest = loaded[0];
  chest.unpackLoot();
  const got = chest.container.items.filter(Boolean).map((s) => s.item.id);
  check(`real chunks: an entrance chest opened holds entrance loot (${got.join(', ')})`, got.length >= 2 && got.every((id) => ['trial_key', 'stick', 'wooden_axe', 'honeycomb', 'arrow'].includes(id)) && chest.lootTable === null);
  // the ground round it
  let solid = 0, open = 0;
  const inPiece = (x, y, z) => L.pieces.some((p) => p.box.isInside(x, y, z));
  for (const p of [start, first])
    for (let y = p.box.minY - 1; y <= p.box.maxY + 1; y++)
      for (let z = p.box.minZ - 1; z <= p.box.maxZ + 1; z++)
        for (let x = p.box.minX - 1; x <= p.box.maxX + 1; x++) {
          if (p.box.isInside(x, y, z) || inPiece(x, y, z)) continue;
          const n = name(world.getState(x, y, z));
          if (n === 'air' || n === 'cave_air' || n === 'water' || n === 'lava') open++;
          else solid++;
        }
  console.log(`     (the ground just round the end room and the chamber: ${solid} solid, ${open} open)`);
  check('real chunks: the ground just round them is filled in (nine tenths of it solid)', solid / (solid + open) > 0.9);
  check('being in one: inside the end room, yes; high above it, no', m.inTrialChambers(SEED, cx + 0.5, start.y + 1, cz + 0.5) && !m.inTrialChambers(SEED, cx, 100, cz));
}

// ---------------------------------------------------------------------------------------------------------------
// Loot

{
  // every table a piece names
  const tables = new Set();
  const configs = new Set();
  for (const [pname, p] of m.POOLS) {
    if (!pname.startsWith('trial_chambers/')) continue;
    for (const e of p.templates) for (const b of e.t?.blockEntities ?? []) {
      if (b.table) tables.add(b.table);
      if (b.data.normal_config) configs.add(b.data.normal_config).add(b.data.ominous_config);
      if (b.data.config) tables.add(JSON.parse(b.data.config).loot_table.replace('minecraft:', ''));
    }
  }
  const missing = [...tables].filter((t) => !m.LOOT_TABLES[t]);
  check(`loot: every table the pieces name is there (${tables.size})`, missing.length === 0, missing.join(', '));
  check(`loot: every spawner config the pieces name is there (${configs.size})`, [...configs].every((c) => m.TRIAL_SPAWNER_CONFIGS[c]));
  // each gives only what it holds
  const allowed = (t) => {
    const out = new Set();
    for (const pool of m.LOOT_TABLES[t]) for (const e of pool.entries) out.add(e.item);
    return out;
  };
  let only = true, some = true;
  const counts = {};
  for (const t of [...tables].filter((t) => !t.includes('reward'))) {
    const ok = allowed(t);
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c = new m.SimpleContainer(27);
      m.fillContainer(c, t, seed * 7919);
      for (const s of c.items) if (s) {
        total += s.count;
        if (!ok.has(s.item.id)) only = false;
      }
    }
    counts[t] = total;
    if (total === 0) some = false;
  }
  check('loot: the chests, barrels, dispensers and pots give only what their tables hold', only);
  check('loot: and every one of them gives something', some, JSON.stringify(counts));
  // the supply chest: 3 to 5 rolls
  let lo = Infinity, hi = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const items = m.rollLoot('chests/trial_chambers/supply', new m.Rand(seed, 0x100f));
    const potions = items.filter((s) => s.item.id === 'potion').length;
    const n = items.length - potions / 2;
    lo = Math.min(lo, n);
    hi = Math.max(hi, n);
  }
  check(`loot: a supply chest rolls 3 to 5 times (${lo} to ${hi}; its potions come in twos)`, lo >= 3 && hi <= 5);
  const arrows = [];
  for (let seed = 1; seed <= 100; seed++) arrows.push(...m.rollLoot('dispensers/trial_chambers/corridor', new m.Rand(seed, 1)).map((s) => s.count));
  check('loot: a corridor dispenser holds 4 to 8 arrows', arrows.length === 100 && Math.min(...arrows) >= 4 && Math.max(...arrows) <= 8);
  const worn = [];
  for (let seed = 1; seed <= 400; seed++) for (const s of m.rollLoot('chests/trial_chambers/intersection_barrel', new m.Rand(seed, 2))) if (s.item.id === 'golden_axe') worn.push(s);
  check('loot: the golden axes in an intersection\'s barrel come worn (15 to 80% left) and enchanted', worn.length > 5 &&
    worn.every((s) => s.damage >= Math.floor(0.2 * s.item.maxDamage) - 1 && s.damage <= Math.ceil(0.85 * s.item.maxDamage) + 1) && worn.every((s) => Object.keys(s.tag?.enchantments ?? {}).length === 1));

  // a pot's loot: rolled the first time it's looked in, kept through saving until then
  const pot = new m.DecoratedPotBlockEntity(5, 64, 5);
  pot.load({ id: 'decorated_pot', x: 5, y: 64, z: 5, items: [], data: { sherds: 'flow_pottery_sherd,brick,brick,flow_pottery_sherd', lootTable: 'pots/trial_chambers/corridor', lootSeed: 12345 } });
  const saved = pot.save();
  const again = new m.DecoratedPotBlockEntity(5, 64, 5);
  again.load(saved);
  const item = again.theItem;
  check('pots: a pot\'s loot table and sherds are kept through saving', saved.data.lootTable === 'pots/trial_chambers/corridor' && saved.data.lootSeed === 12345 && again.decorations[0] === 'flow_pottery_sherd');
  check(`pots: looked in, it holds its loot (${item?.count} ${item?.item.id}) and the table's gone`, item && ['emerald', 'arrow', 'iron_ingot', 'trial_key', 'music_disc_creator_music_box', 'diamond', 'enchanted_golden_apple'].includes(item.item.id) && again.lootTable === null && !again.save().data?.lootTable);
  const tally = {};
  for (let seed = 1; seed <= 2000; seed++) {
    const p = new m.DecoratedPotBlockEntity(0, 0, 0);
    p.lootTable = 'pots/trial_chambers/corridor';
    p.lootSeed = seed * 104729;
    const s = p.theItem;
    tally[s?.item.id ?? 'nothing'] = (tally[s?.item.id ?? 'nothing'] ?? 0) + 1;
  }
  check(`pots: emeralds most often, then arrows and iron, trial keys now and then (${JSON.stringify(tally)})`, tally.emerald > 600 && tally.emerald < 850 && tally.arrow > 450 && tally.iron_ingot > 450 && tally.trial_key > 20 && tally.trial_key < 110 && !tally.nothing);
  // broken: what's in it spills out
  const pl = new m.Level(new m.World(), 'pots');
  const blocks = new Uint16Array(m.COLUMN_VOLUME);
  for (let y = m.MIN_Y; y < 64; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) blocks[m.colIndex(x, y, z)] = m.S('stone');
  pl.world.addChunk({ cx: 0, cz: 0, blocks, light: m.computeChunkLight(blocks), biomes: new Uint8Array(256).fill(m.B.plains), pending: [] });
  pl.sound = { play() {}, playUI() {} };
  pl.particles = { blockBreak() {}, blockHit() {}, spawn() {}, dust() {}, poof() {}, blockParticle() {}, fallingDust() {} };
  pl.setBlock(5, 64, 5, m.getBlock('decorated_pot').defaultState);
  const be = pl.world.getBlockEntity(5, 64, 5);
  be.lootTable = 'pots/trial_chambers/corridor';
  be.lootSeed = 99;
  pl.destroyBlock(5, 64, 5, false);
  const spilled = pl.entities.filter((e) => e.type === 'item').map((e) => e.stack.item.id);
  check(`pots: broken, its loot spills out (${spilled.join(', ')})`, spilled.length >= 1 && spilled.some((id) => ['emerald', 'arrow', 'iron_ingot', 'trial_key', 'music_disc_creator_music_box', 'diamond', 'enchanted_golden_apple'].includes(id)));
}

// ---------------------------------------------------------------------------------------------------------------
// The processors

/** a fake piece of world to place pieces into: `fill` whatever's there before */
function fakeWorld(fill = () => -1) {
  const cells = new Map();
  const bes = [];
  const ctx = {
    set(x, y, z, st) { cells.set(`${x},${y},${z}`, st); },
    getOrAir(x, y, z) { const v = cells.get(`${x},${y},${z}`); if (v !== undefined) return v; const f = fill(x, y, z); return f < 0 ? m.S('stone') : f; },
    blockEntities: bes, markForPostprocessing() {}, scheduleFluid() {},
  };
  return { cells, bes, ctx };
}

{
  // the bulbs of a whole structure, each against vanilla's positional random
  const { cells, ctx, bes } = fakeWorld();
  const chunk = new m.Box(L.box.minX, m.MIN_Y, L.box.minZ, L.box.maxX, m.MAX_Y - 1, L.box.maxZ);
  for (const p of L.pieces) p.element.place({ ctx, chunk, salt: 1 }, p);
  // its vaults, normal and ominous
  const vaults = bes.filter((b) => b.id === 'vault');
  const omen = vaults.filter((b) => m.blockOf(cells.get(`${b.x},${b.y},${b.z}`)).get(cells.get(`${b.x},${b.y},${b.z}`), 'ominous') === true);
  check(`vaults: the whole structure's ominous vaults (${omen.length} of ${vaults.length}) take an ominous trial key for the ominous loot, the rest the defaults`, omen.length >= 1 &&
    omen.every((b) => { const c = JSON.parse(b.data.config); return c.key_item === 'minecraft:ominous_trial_key' && c.loot_table === 'minecraft:chests/trial_chambers/reward_ominous'; }) &&
    vaults.filter((b) => !omen.includes(b)).every((b) => !b.data.config));
  let bulbs = 0, right = 0;
  const aged = { waxed_copper_bulb: 0, oxidized_copper_bulb: 0, weathered_copper_bulb: 0, exposed_copper_bulb: 0 };
  for (const [k, st] of cells) {
    const n = name(st);
    if (!(n in aged)) continue;
    const [x, y, z] = k.split(',').map(Number);
    bulbs++;
    aged[n]++;
    const r = new JRand(getSeed(x, y, z));
    const want = r.nextFloat() < 0.1 ? 'oxidized_copper_bulb' : r.nextFloat() < 0.33333334 ? 'weathered_copper_bulb' : r.nextFloat() < 0.5 ? 'exposed_copper_bulb' : 'waxed_copper_bulb';
    if (want === n && m.blockOf(st).get(st, 'lit') === true) right++;
  }
  console.log(`     (a whole structure's copper bulbs: ${JSON.stringify(aged)})`);
  check(`processors: every waxed copper bulb aged or not as vanilla's random at its position says, and lit (${right} of ${bulbs})`, bulbs > 50 && right === bulbs);

  // nothing put over a spawner, a chest, bedrock...
  const corridor = m.POOLS.get('trial_chambers/corridor').templates.find((e) => e.template.id === 'trial_chambers/corridor/straight_1');
  const piece = new m.Piece(corridor, 0, 0, 0, 0, corridor.box(0, 0, 0, 0), 1);
  const keep = { '3,2,4': m.S('spawner'), '3,0,4': m.S('bedrock'), '0,3,2': m.getBlock('chest').defaultState, '3,6,2': m.S('trial_spawner') };
  const w = fakeWorld((x, y, z) => keep[`${x},${y},${z}`] ?? -1);
  piece.element.place({ ctx: w.ctx, chunk: new m.Box(-16, m.MIN_Y, -16, 31, m.MAX_Y - 1, 31), salt: 1 }, piece);
  check('processors: nothing is put over a spawner, bedrock, a chest or a trial spawner (#features_cannot_replace)', Object.keys(keep).every((k) => !w.cells.has(k)) && w.cells.get('3,2,5') === 0);

  // into water: its rooms dry, nothing of it waterlogged
  const wet = fakeWorld(() => m.S('water'));
  piece.element.place({ ctx: wet.ctx, chunk: new m.Box(-16, m.MIN_Y, -16, 31, m.MAX_Y - 1, 31), salt: 1 }, piece);
  const placed = [...wet.cells.values()];
  const logged = placed.filter((st) => st > 0 && m.blockOf(st).propIndex('waterlogged') >= 0 && m.blockOf(st).get(st, 'waterlogged') === true);
  check('processors: placed in water, its air is dry and none of its stairs take the water in (vanilla IGNORE_WATERLOGGING)', wet.cells.get('3,3,4') === 0 && logged.length === 0 &&
    placed.some((st) => st > 0 && name(st).endsWith('_stairs')));
}

// ---------------------------------------------------------------------------------------------------------------
// The ground round it (vanilla Beardifier, TerrainAdjustment.ENCAPSULATE)

{
  // vanilla's sum, worked out afresh from the pieces
  const kernel = (x, y, z) => Math.exp(-(x * x + (y + 0.5) * (y + 0.5) + z * z) / 16);
  const beard = (x, y, z, l) => {
    if (x < -12 || x >= 12 || y < -12 || y >= 12 || z < -12 || z >= 12) return 0;
    const d = l + 0.5, e = x * x + d * d + z * z;
    return (-d / Math.sqrt(e / 2) / 2) * kernel(x, y, z);
  };
  const vanilla = (cx, cz, x, y, z) => {
    let d = 0;
    for (const lay of tc.near(cx, cz))
      for (const p of lay.pieces) {
        const b = p.box;
        if (!b.intersectsXZ(cx * 16 - 12, cz * 16 - 12, cx * 16 + 27, cz * 16 + 27)) continue;
        const mm = Math.max(0, b.minX - x, x - b.maxX), q = Math.max(0, b.minY - y, y - b.maxY), k = Math.max(0, b.minZ - z, z - b.maxZ);
        d += Math.max(0, Math.min(1, 1 - Math.hypot(mm / 2, q / 2, k / 2) / 6)) * 0.8;
        for (const j of p.junctions) {
          if (j.x <= cx * 16 - 12 || j.z <= cz * 16 - 12 || j.x >= cx * 16 + 27 || j.z >= cz * 16 + 27) continue;
          d += beard(x - j.x, y - j.groundY, z - j.z, y - j.groundY) * 0.4;
        }
      }
    return d;
  };
  let n = 0, same = 0, maxDiff = 0;
  const scx = stub.x >> 4, scz = stub.z >> 4;
  for (const [cx, cz] of [[scx, scz], [scx + 1, scz - 1], [scx - 2, scz + 1]]) {
    const bury = tc.encapsulateFor(cx, cz);
    for (let i = 0; i < 300; i++) {
      const x = cx * 16 + ((i * 7) % 16), z = cz * 16 + ((i * 11) % 16), y = bury.minY + ((i * 13) % (bury.maxY - bury.minY + 1));
      const a = bury.compute(x, y, z), b = vanilla(cx, cz, x, y, z);
      n++;
      maxDiff = Math.max(maxDiff, Math.abs(a - b));
      // (the kernel's a table of floats, as vanilla's BEARD_KERNEL is)
      if (Math.abs(a - b) < 1e-6) same++;
    }
  }
  check(`encapsulation: the pull toward solid ground is vanilla's sum (${same} of ${n} points, off by at most ${maxDiff.toExponential(1)})`, same === n);
  // and nothing far away
  const far = tc.encapsulateFor((L.box.maxX >> 4) + 40, (L.box.maxZ >> 4) + 40);
  check('encapsulation: none where no trial chambers is near', far === null || far.compute(((L.box.maxX >> 4) + 40) * 16, -30, ((L.box.maxZ >> 4) + 40) * 16) === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// /locate

{
  const chat = [];
  const game = { meta: { allowCommands: true }, chat: (s) => chat.push(s), world, level, player: { x: 0.5, y: 64, z: 0.5 } };
  m.executeCommand(game, 'locate structure minecraft:trial_chambers');
  const want = m.locateTrialChambers(SEED, 0, 0);
  check(`/locate: the nearest trial chambers, its start chunk's corner (${chat.join(' ')})`, chat.join(' ').includes(`[${want[0]}, ~, ${want[1]}]`) && want[0] === lx && want[1] === lz);
  chat.length = 0;
  const nether = new m.World();
  nether.dim = { ...world.dim, id: 'the_nether' };
  m.executeCommand({ ...game, world: nether }, 'locate structure trial_chambers');
  check('/locate: none in the Nether', /Could not find/.test(chat.join(' ')), chat.join(' '));
}

// ---------------------------------------------------------------------------------------------------------------
// What it costs chunk generation

{
  const bare = new m.ChunkGenerator(SEED);
  bare.trialChambers.place = () => {};
  bare.trialChambers.encapsulateFor = () => null;
  const fresh = new m.ChunkGenerator(SEED);
  const time = (g, cx0, cz0) => {
    const t = performance.now();
    for (let cx = cx0; cx < cx0 + 4; cx++) for (let cz = cz0; cz < cz0 + 4; cz++) g.generate(cx, cz);
    return (performance.now() - t) / 16;
  };
  const cx0 = (stub.x >> 4) - 2, cz0 = (stub.z >> 4) - 2;
  time(fresh, cx0 + 8, cz0 + 8);
  time(bare, cx0 + 8, cz0 + 8);
  // (the best of five, taken in turns: the machine's other work shows up as noise)
  let withT = Infinity, without = Infinity;
  for (let rep = 0; rep < 5; rep++) {
    withT = Math.min(withT, time(fresh, cx0, cz0));
    without = Math.min(without, time(bare, cx0, cz0));
  }
  console.log(`     (round the start: ${withT.toFixed(1)} ms a chunk with the trial chambers, ${without.toFixed(1)} without)`);
  check('cost: chunks round a trial chambers take no more than half as long again', withT < without * 1.5);
}

await exitWithStatus(close);
