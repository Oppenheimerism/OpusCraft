// Chorus plants and flowers, purpur, end rods, chorus fruit (headless): node tests/end/chorus.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods: [, blockMod, worldMod, chunkMod, dimMod, levelMod, ib, bb, itemMod, playerMod, recMod, synthMod, texMod, genEnd, chorusGen, ctxMod, biomes, cutMod, rulesMod, arrowMod, mesher], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/dimension.ts', '/src/game/level.ts',
  '/src/game/itemBehavior.ts', '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/player.ts', '/src/inventory/recipes.ts', '/src/audio/synth.ts',
  '/src/textures/blocks.ts', '/src/world/gen/theEnd.ts', '/src/world/gen/chorusPlant.ts', '/src/world/gen/context.ts', '/src/world/gen/biomes.ts',
  '/src/inventory/stonecutting.ts', '/src/game/blockRules.ts', '/src/entity/arrow.ts', '/src/render/mesher.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const { S, BLOCKS, STATE_BLOCK, getBlock, LIGHT_EMISSION, COLLISION } = blockMod;
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;

// --- the blocks
for (const n of ['purpur_block', 'purpur_pillar', 'purpur_stairs', 'purpur_slab', 'end_rod', 'chorus_plant', 'chorus_flower']) check(`block ${n}`, blockMod.BLOCK_BY_NAME.has(n));
check('purpur 1.5/6, the slab 2/6, a pickaxe to drop', getBlock('purpur_block').hardness === 1.5 && getBlock('purpur_pillar').hardness === 1.5 && getBlock('purpur_stairs').hardness === 1.5 && getBlock('purpur_slab').hardness === 2 && getBlock('purpur_slab').resistance === 6 && getBlock('purpur_block').requiresTool);
check('purpur pillar has an axis', getBlock('purpur_pillar').propIndex('axis') >= 0);
check('chorus 0.4, wood, an axe', getBlock('chorus_plant').hardness === 0.4 && getBlock('chorus_flower').hardness === 0.4 && getBlock('chorus_plant').sound === 'wood' && getBlock('chorus_plant').tool === 'axe');
check('end rod: instant, wood, six facings', getBlock('end_rod').hardness === 0 && getBlock('end_rod').sound === 'wood' && getBlock('end_rod').stateCount === 6);
check('end rod light 14', blockMod.EMISSION[S('end_rod')] === 14, String(blockMod.EMISSION[S('end_rod')]));
{
  const c = (f) => JSON.stringify(COLLISION[S('end_rod', { facing: f })]);
  check('end rod shapes by axis', c('up') === c('down') && c('north') === c('south') && c('east') === c('west') && c('up') !== c('north') && c('north') !== c('east'), c('up') + c('north') + c('east'));
  const core = COLLISION[S('chorus_plant')];
  check('lone chorus piece: the 10-across core', core.length === 1 && Math.abs(core[0][0] - 3 / 16) < 1e-9 && Math.abs(core[0][3] - 13 / 16) < 1e-9);
  check('chorus flower: a whole block', JSON.stringify(COLLISION[S('chorus_flower')]) === '[[0,0,0,1,1,1]]');
}
// every texture the new blocks' models use exists
{
  const need = new Set(['purpur_block', 'purpur_pillar', 'purpur_pillar_top', 'end_rod', 'chorus_plant', 'chorus_flower', 'chorus_flower_dead']);
  const missing = [...need].filter((t) => typeof texMod.BLOCK_TEXTURES[t] !== 'function');
  check('block textures', missing.length === 0, missing.join());
  for (const t of need) {
    const im = texMod.BLOCK_TEXTURES[t]();
    let opaque = 0;
    for (let i = 3; i < im.data.length; i += 4) if (im.data[i] === 255) opaque++;
    if (t !== 'end_rod') check(`texture ${t} is solid`, opaque === 256, String(opaque));
  }
}
// items, recipes
{
  const it = itemMod.ITEMS;
  check('chorus fruit: food 4 / 0.3, always edible', it.get('chorus_fruit')?.food?.nutrition === 4 && it.get('chorus_fruit').food.saturation === 0.3 && it.get('chorus_fruit').food.alwaysEat);
  check('popped chorus fruit', !!it.get('popped_chorus_fruit') && !it.get('popped_chorus_fruit').food);
  check('tabs', it.get('chorus_plant').creativeTab === 'natural' && it.get('chorus_flower').creativeTab === 'natural' && it.get('end_rod').creativeTab === 'functional' && it.get('purpur_block').creativeTab === 'building');
  const R = recMod.RECIPES;
  const rec = (res) => R.filter((r) => r.result === res);
  check('purpur block: 4 from 4 popped fruit', rec('purpur_block').some((r) => r.count === 4 && JSON.stringify(r.key) === '{"F":"popped_chorus_fruit"}'));
  check('purpur pillar from two slabs', rec('purpur_pillar').some((r) => r.count === 1 && r.pattern.length === 2));
  check('purpur stairs / slab', rec('purpur_stairs').some((r) => r.count === 4) && rec('purpur_slab').some((r) => r.count === 6));
  check('end rods: 4 from a blaze rod on a popped fruit', rec('end_rod').some((r) => r.count === 4 && r.key['/'] === 'blaze_rod'));
  check('chorus fruit smelts to popped', recMod.SMELTING.some((s) => s.inputs.includes('chorus_fruit') && s.result === 'popped_chorus_fruit' && s.xp === 0.1));
  const cut = cutMod.STONECUTTING ?? cutMod.RECIPES ?? null;
  check('stonecutter', !cut || JSON.stringify(cut).includes('purpur_pillar'));
}
{
  const rect = { u0: 0, v0: 0, u1: 1, v1: 1 };
  let err = null;
  try { mesher.initMesher(new Proxy({}, { get: () => rect })); } catch (e) { err = e; }
  check('models bake', !err, err?.message);
  const q = (st) => mesher.getStateModels(st).variants.reduce((a, v) => a + v.quads.length, 0);
  const lone = mesher.getStateModels(S('chorus_plant'));
  check('a lone chorus piece: six knobs, picked by position', lone && lone.multipart && lone.randomParts?.length === 6 && lone.randomParts.every((p) => p.length === 4));
  const all = mesher.getStateModels(S('chorus_plant', { north: true, south: true, east: true, west: true, up: true, down: true }));
  check('all six arms: 6 x 5 faces', all && q(S('chorus_plant', { north: true, south: true, east: true, west: true, up: true, down: true })) === 30, String(all && q(S('chorus_plant', { north: true, south: true, east: true, west: true, up: true, down: true }))));
  check('end rod: rod and foot', q(S('end_rod', { facing: 'north' })) === 11, String(q(S('end_rod', { facing: 'north' }))));
  check('chorus flower: 6 boxes', q(S('chorus_flower')) === 36, String(q(S('chorus_flower'))));
  const it = mesher.getItemModels(getBlock('chorus_plant'));
  check('chorus plant item: a cube', it && it.variants[0].quads.length === 6);
}
check('sounds: chorus flower grow and death', !!synthMod.SOUNDS['block.chorus_flower.grow'] && !!synthMod.SOUNDS['block.chorus_flower.death']);
{
  const g = synthMod.SOUNDS['block.chorus_flower.grow'].generate(0, 44100), d = synthMod.SOUNDS['block.chorus_flower.death'].generate(1, 44100);
  let pk = 0;
  for (const v of g) pk = Math.max(pk, Math.abs(v));
  check('they render', g.length > 10000 && d.length > 10000 && pk > 0.5 && [...g].every(Number.isFinite), `${g.length} ${d.length} ${pk.toFixed(2)}`);
}

// --- a world of end stone
function endWorld() {
  const world = new worldMod.World();
  world.reset(dimMod.THE_END ?? dimMod.END);
  for (let cx = -3; cx <= 2; cx++) for (let cz = -3; cz <= 2; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -40; x < 40; x++) for (let z = -40; z < 40; z++) world.setState(x, 49, z, S('end_stone'));
  const level = new levelMod.Level(world, '42');
  const log = { sounds: [], particles: {} };
  level.sound = { play: (n, x, y, z, v, p) => log.sounds.push({ n, x, y, z, v, p }), playUI: () => {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn: (k, x, y, z, dx, dy, dz) => (log.particles[k] ??= []).push([x, y, z, dx, dy, dz]) };
  return { world, level, log };
}
const { world, level, log } = endWorld();
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };
const plant = getBlock('chorus_plant');
const conn = (x, y, z) => { const st = world.getState(x, y, z); return plant.props.filter((p) => plant.get(st, p.name)).map((p) => p.name).join(','); };
const place = (x, y, z, n) => {
  const b = getBlock(n);
  const ctx = { world, x, y, z, face: 1, hitY: 0.5, yaw: 0, pitch: 0, sneaking: false, clickedState: world.getState(x, y - 1, z) };
  const st = rulesMod.placementState(b, ctx);
  if (st === null || !rulesMod.canSurvive(world, x, y, z, st, true)) return false;
  level.setBlock(x, y, z, st);
  return true;
};

// --- a stem: pieces join each other, the bottom joins the end stone
check('a chorus piece goes on end stone', place(0, 50, 0, 'chorus_plant'));
check('and on more plant', place(0, 51, 0, 'chorus_plant') && place(0, 52, 0, 'chorus_plant'));
check('not on the side of nothing', !place(3, 51, 3, 'chorus_plant') && !place(3, 60, 3, 'chorus_flower'));
check('connections: bottom down to the stone and up', conn(0, 50, 0) === 'up,down', conn(0, 50, 0));
check('middle up and down, top down', conn(0, 51, 0) === 'up,down' && conn(0, 52, 0) === 'down', `${conn(0, 51, 0)} / ${conn(0, 52, 0)}`);
check('a branch off the side, held by the stem', place(1, 52, 0, 'chorus_plant') && conn(1, 52, 0) === 'west' && conn(0, 52, 0) === 'east,down', `${conn(1, 52, 0)} / ${conn(0, 52, 0)}`);
check('a flower on the end of it', place(1, 53, 0, 'chorus_flower') && conn(1, 52, 0) === 'west,up');
check('a flower can hang off the side of the plant in the air', place(-1, 52, 0, 'chorus_flower'));

// --- breaking the stem at the bottom: the rest goes a tick at a time
{
  for (const it of level.entities.filter((e) => e.type === 'item')) it.remove();
  level.destroyBlock(0, 50, 0, true);
  const alive = () => [[0, 51, 0], [0, 52, 0], [1, 52, 0], [1, 53, 0], [-1, 52, 0]].filter(([x, y, z]) => name(world.getState(x, y, z)).startsWith('chorus'));
  const seq = [alive().length];
  for (let i = 0; i < 6; i++) {
    tick(1);
    seq.push(alive().length);
  }
  check('the plant above breaks a tick at a time, not all at once', seq[0] === 5 && seq[1] === 4 && seq[seq.length - 1] === 0, seq.join(' '));
  const drops = level.entities.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack.item.id);
  check('pieces drop chorus fruit (0-1 each), flowers themselves', drops.filter((d) => d === 'chorus_flower').length === 2 && drops.every((d) => d === 'chorus_fruit' || d === 'chorus_flower'), drops.join());
}

// --- a flower grows: up, out, and dies
{
  const lr = level.random;
  const grow = getBlock('chorus_flower');
  const own = bb.behaviorOf(S('chorus_flower')).randomTick;
  let sizes = [];
  const origSet = level.setBlock.bind(level), origDestroy = level.destroyBlock.bind(level);
  let watch = null, stepNo = 0;
  if (process.env.DEBUG) {
    level.setBlock = (x, y, z, st, f) => { if (watch && x === watch[0] && z === watch[1]) console.log(`  [${stepNo}] set ${x - watch[0]},${y},${z - watch[1]} ${name(st)}${name(st) === 'chorus_flower' ? ':' + getBlock('chorus_flower').get(st, 'age') : ''} flags ${f}`); return origSet(x, y, z, st, f); };
    level.destroyBlock = (x, y, z, ...a) => { if (watch && x === watch[0] && z === watch[1]) console.log(`  [${stepNo}] destroy ${x - watch[0]},${y},${z - watch[1]} ${name(world.getState(x, y, z))}`); return origDestroy(x, y, z, ...a); };
  }
  for (let trial = 0; trial < 6; trial++) {
    const ox = -30 + trial * 10, oz = -25;
    if (trial === 3) watch = [ox, oz];
    else watch = null;
    world.setState(ox, 50, oz, grow.state({ age: 0 }));
    // tick every flower in the area until none can grow
    for (let step = 0; step < 400; step++) {
      stepNo = step;
      let any = false;
      for (let x = ox - 5; x <= ox + 5; x++)
        for (let z = oz - 5; z <= oz + 5; z++)
          for (let y = 50; y < 80; y++) {
            const st = world.getState(x, y, z);
            if (STATE_BLOCK[st] === grow.id && grow.get(st, 'age') < 5) {
              own(level, x, y, z, st);
              any = true;
            }
          }
      tick(1);
      if (!any) break;
    }
    // (whatever lost its footing breaks a tick at a time)
    tick(40);
    let pieces = 0, flowers = 0, live = 0, bad = 0;
    for (let x = ox - 6; x <= ox + 6; x++)
      for (let z = oz - 6; z <= oz + 6; z++)
        for (let y = 50; y < 80; y++) {
          const st = world.getState(x, y, z);
          const n = name(st);
          if (n === 'chorus_plant') {
            pieces++;
            if (!rulesMod.canSurvive(world, x, y, z, st)) { bad++; console.log('  unsupported piece at', x - ox, y, z - oz, conn(x, y, z)); }
            // its connections are what's round it now
            const want = chorusGen.plantWithConnections((a, b, c) => world.getState(a, b, c), x, y, z);
            if (want !== st) { bad++; console.log('  wrong connections at', x - ox, y, z - oz, conn(x, y, z)); }
          } else if (n === 'chorus_flower') {
            flowers++;
            if (grow.get(st, 'age') < 5) live++;
            if (!rulesMod.canSurvive(world, x, y, z, st)) {
              bad++;
              const around = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map(([a, b, c]) => name(world.getState(x + a, y + b, z + c)));
              console.log('  unsupported flower at', x - ox, y, z - oz, 'age', grow.get(st, 'age'), 'around (below, above, +x, -x, +z, -z):', around.join(' '));
            }
          }
        }
    sizes.push(`${pieces}+${flowers}`);
    check(`grown plant ${trial}: all flowers dead in the end, every piece supported and joined`, live === 0 && bad === 0 && flowers >= 1, `${pieces} pieces ${flowers} flowers ${live} live ${bad} bad`);
  }
  console.log('  grown plants (pieces+flowers):', sizes.join(' '));
  check('growing sounds', log.sounds.some((s) => s.n === 'block.chorus_flower.grow') && log.sounds.some((s) => s.n === 'block.chorus_flower.death'));
}

// --- an arrow breaks a flower
{
  world.setState(20, 50, 20, S('chorus_flower', { age: 2 }));
  const before = level.entities.length;
  const hit = { face: 2, px: 20.5, py: 50.5, pz: 20 };
  rulesMod.onProjectileHit(level, 20, 50, 20, hit, { type: 'arrow' });
  check('an arrow knocks a flower off, and it drops', name(world.getState(20, 50, 20)) === 'air' && level.entities.slice(before).some((e) => e.stack?.item.id === 'chorus_flower'));
}

// --- end rods
{
  const rod = getBlock('end_rod');
  const ctx = (x, y, z, face) => ({ world, x, y, z, face, hitY: 0.5, yaw: 0, pitch: 0, sneaking: false, clickedState: 0 });
  check('put on a side, it sticks out of it', rulesMod.placementState(rod, ctx(10, 51, 10, 2)) === S('end_rod', { facing: 'north' }) && rulesMod.placementState(rod, ctx(10, 51, 10, 5)) === S('end_rod', { facing: 'east' }));
  world.setState(10, 50, 10, S('end_rod', { facing: 'up' }));
  check('on the end of a rod pointing at it, it points back', rulesMod.placementState(rod, ctx(10, 51, 10, 1)) === S('end_rod', { facing: 'down' }));
  world.setState(10, 50, 11, S('end_rod', { facing: 'east' }));
  check('on the side of one, as on anything', rulesMod.placementState(rod, ctx(10, 51, 11, 1)) === S('end_rod', { facing: 'up' }));
  const at = bb.behaviorOf(S('end_rod')).animateTick;
  log.particles.end_rod = [];
  for (let i = 0; i < 1000; i++) at(level, 10, 50, 10, S('end_rod', { facing: 'up' }));
  const ps = log.particles.end_rod;
  check('motes now and then (one in five)', ps.length > 150 && ps.length < 250, String(ps.length));
  check('along the rod, barely moving', ps.every(([x, y, z, dx, dy, dz]) => Math.abs(x - 10.5) < 0.06 && Math.abs(z - 10.5) < 0.06 && y > 50.05 && y < 51.0 && Math.abs(dx) < 0.03 && Math.abs(dy) < 0.03), JSON.stringify(ps[0]));
}

// --- chorus fruit
{
  const player = new playerMod.Player(level);
  player.moveTo(0.5, 50, 0.5, 0, 0);
  level.player = player;
  level.addEntity(player);
  player.gameMode = 'survival';
  const fruit = itemMod.ItemStack.of('chorus_fruit', 64);
  player.inventory.main[0] = fruit;
  player.inventory.selected = 0;
  player.food.level = 20;
  const beh = ib.itemBehaviorOf('chorus_fruit');
  check('eaten when full (always edible)', beh.use(level, player, fruit) === 'success' && player.useItem === fruit && player.useDuration === 32);
  player.stopUsingItem();
  player.food.level = 10;
  const moved = [];
  for (let i = 0; i < 20; i++) {
    const [x0, y0, z0] = [player.x, player.y, player.z];
    player.cooldowns.clear();
    log.sounds.length = 0;
    player.inventory.main[0] = fruit;
    beh.finishUsing(level, player, fruit);
    const tp = log.sounds.find((s) => s.n === 'item.chorus_fruit.teleport');
    if (tp) moved.push([player.x - x0, player.y - y0, player.z - z0]);
    player.moveTo(0.5, 50, 0.5);
  }
  check('it teleports its eater (on the end stone floor)', moved.length >= 15, String(moved.length));
  check('within 8 across', moved.every(([dx, , dz]) => Math.abs(dx) <= 8 && Math.abs(dz) <= 8));
  check('onto the ground', moved.every(([, dy]) => dy === 0), moved.map((m) => m[1]).join(','));
  check('a second before another can be eaten', player.cooldowns.get('chorus_fruit') === 20 && beh.use(level, player, fruit) === 'pass');
  check('eaten: fed, one used up each time', player.food.level > 10 && fruit.count === 64 - 20, `${player.food.level} ${fruit.count}`);
  player.cooldowns.clear();
  player.gameMode = 'creative';
  const c0 = fruit.count;
  beh.finishUsing(level, player, fruit);
  check('creative: none used up', fruit.count === c0);
}

// --- generation: a plant grown whole on end stone
{
  const blocks = new Uint16Array(16 * 16 * 384);
  const ctx = new ctxMod.GenContext(0, 0, blocks, new Uint8Array(256), null);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 40; y < 50; y++) ctx.set(x, y, z, S('end_stone'));
  ctx.computeHeightmaps();
  let n = 0, tall = 0;
  const r = { s: 7, nextInt(k) { this.s = (this.s * 1103515245 + 12345) >>> 0; return (this.s >>> 8) % k; } };
  const ok = chorusGen.generateChorusPlant(ctx, r, 8, 50, 8, 8);
  let dead = 0;
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++)
      for (let y = 50; y < 90; y++) {
        const st = ctx.get(x, y, z);
        if (name(st) === 'chorus_plant') {
          n++;
          tall = Math.max(tall, y);
        } else if (name(st) === 'chorus_flower') dead += getBlock('chorus_flower').get(st, 'age') === 5 ? 1 : 100;
      }
  check('a plant grows on end stone, its branches ending in dead flowers', ok && n >= 2 && dead >= 1 && dead < 100, `${n} pieces, top ${tall}, dead ${dead}`);
  check('none on air', !chorusGen.generateChorusPlant(ctx, r, 3, 70, 3, 8));
}
// the End's highlands grow them
{
  const gen = new genEnd.EndGenerator('42');
  let found = null;
  for (let cx = 70; cx < 140 && !found; cx++)
    for (let cz = -10; cz < 10 && !found; cz++) if (gen.biomeOfChunk(cx, cz) === biomes.B.end_highlands) found = [cx, cz];
  check('found a highlands chunk', !!found, String(found));
  let plants = 0, flowers = 0, chunks = 0;
  if (found) {
    for (let dx = 0; dx < 4; dx++)
      for (let dz = 0; dz < 4; dz++) {
        const cx = found[0] + dx, cz = found[1] + dz;
        if (gen.biomeOfChunk(cx, cz) !== biomes.B.end_highlands) continue;
        chunks++;
        const out = gen.generate(cx, cz);
        for (const st of out.blocks) {
          if (!st) continue;
          const n = name(st);
          if (n === 'chorus_plant') plants++;
          else if (n === 'chorus_flower') flowers++;
        }
      }
  }
  check('chorus plants in the highlands', plants > 10 && flowers > 2, `${chunks} chunks: ${plants} pieces, ${flowers} flowers`);
}

await close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
