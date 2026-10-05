// Silverfish and infested blocks, headless: node tests/end/silverfish.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods: [, blockMod, worldMod, chunkMod, dimMod, levelMod, itemMod, itemEntMod, playerMod, spawnerMod, sfMod, infMod, explMod, synthMod, mobTexMod, sfModel, beMod, bsMod, genMod, biomesMod, sfTexMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/dimension.ts', '/src/game/level.ts',
  '/src/item/item.ts', '/src/entity/itemEntity.ts', '/src/entity/player.ts', '/src/game/spawner.ts', '/src/entity/silverfish.ts', '/src/world/blocksInfested.ts',
  '/src/game/explosion.ts', '/src/audio/synth.ts', '/src/textures/mobs.ts', '/src/render/silverfishModel.ts', '/src/world/blockEntity.ts', '/src/game/baseSpawner.ts',
  '/src/world/gen/generator.ts', '/src/world/gen/biomes.ts', '/src/textures/silverfish.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const { BLOCKS, STATE_BLOCK, S, getBlock } = blockMod;
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;

// --- the blocks
const INF = ['infested_stone', 'infested_cobblestone', 'infested_stone_bricks', 'infested_mossy_stone_bricks', 'infested_cracked_stone_bricks', 'infested_chiseled_stone_bricks', 'infested_deepslate'];
check('seven infested blocks', INF.every((n) => blockMod.BLOCK_BY_NAME.has(n)));
check('half the host hardness, resistance 0.75', getBlock('infested_stone').hardness === 0.75 && getBlock('infested_cobblestone').hardness === 1 && getBlock('infested_deepslate').hardness === 1.5 && getBlock('infested_stone').resistance === 0.75,
  `${getBlock('infested_stone').hardness} ${getBlock('infested_cobblestone').hardness} ${getBlock('infested_deepslate').hardness}`);
check('no tool needed, a pickaxe is quicker', !getBlock('infested_stone').requiresTool && getBlock('infested_stone').tool === 'pickaxe');
check('infested deepslate keeps its axis', infMod.infestedStateByHost(S('deepslate', { axis: 'x' })) === S('infested_deepslate', { axis: 'x' }) && infMod.hostStateByInfested(S('infested_deepslate', { axis: 'z' })) === S('deepslate', { axis: 'z' }));
check('hosts', infMod.isCompatibleHostBlock(S('stone')) && infMod.isCompatibleHostBlock(S('mossy_stone_bricks')) && !infMod.isCompatibleHostBlock(S('granite')) && !infMod.isCompatibleHostBlock(S('infested_stone')));
check('infested', infMod.isInfestedBlock(S('infested_cracked_stone_bricks')) && !infMod.isInfestedBlock(S('stone')));
check('items: the blocks among the natural blocks, and the spawn egg', INF.every((n) => itemMod.ITEMS.get(n)?.creativeTab === 'natural') && itemMod.ITEMS.get('silverfish_spawn_egg')?.creativeTab === 'spawn_eggs');
check('spawn egg texture', typeof mobTexMod.SPAWN_EGG_TEXTURES.silverfish_spawn_egg === 'function');

// --- a flat world of stone
function flatWorld() {
  const world = new worldMod.World();
  world.reset(dimMod.OVERWORLD);
  for (let cx = -3; cx <= 2; cx++) for (let cz = -3; cz <= 2; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -40; x < 40; x++) for (let z = -40; z < 40; z++) world.setState(x, 39, z, S('stone'));
  const level = new levelMod.Level(world, 'test');
  const log = { sounds: [], poofs: 0 };
  level.sound = { play: (n) => log.sounds.push(n), playUI: () => {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn() {}, poof: () => log.poofs++ };
  return { world, level, log };
}
const { world, level, log } = flatWorld();
const player = new playerMod.Player(level);
player.moveTo(30.5, 40, 30.5, 0, 0);
level.player = player;
level.addEntity(player);
player.setGameMode('survival');
level.difficulty = 'normal';
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };
const fish = () => level.entities.filter((e) => e.type === 'silverfish' && !e.removed);
const clearFish = () => { for (const e of fish()) e.remove(); tick(1); };
const items = () => level.entities.filter((e) => e instanceof itemEntMod.ItemEntity && !e.removed);

// --- the mob
{
  const s = spawnerMod.createMob('silverfish', level);
  check('createMob', s instanceof sfMod.Silverfish);
  check('0.4 x 0.3, 8 health, 1 damage, speed 0.25', s.width === 0.4 && s.height === 0.3 && s.maxHealth === 8 && s.attackDamage === 1 && s.moveSpeedAttr === 0.25, `${s.width} ${s.height}`);
  check('monster, 5 xp, no loot', s.category === 'monster' && s.xpReward === 5 && s.lootTable().length === 0);
}

// --- breaking an infested block: a silverfish, no drop
{
  world.setState(0, 40, 0, S('infested_stone'));
  level.destroyBlock(0, 40, 0, true, null, true, null);
  const f = fish();
  check('broken by hand: a silverfish comes out, in the middle of the block', f.length === 1 && f[0].x === 0.5 && f[0].y === 40 && f[0].z === 0.5 && items().length === 0, `${f.length} ${items().length}`);
  check('in a puff', log.poofs >= 1);
  clearFish();
  const pick = itemMod.ItemStack.of('diamond_pickaxe');
  pick.tag = { enchantments: { silk_touch: 1 } };
  world.setState(1, 40, 0, S('infested_stone_bricks'));
  level.destroyBlock(1, 40, 0, true, pick.item, true, pick);
  const it = items();
  check('silk touch: the host block drops, no silverfish', fish().length === 0 && it.length === 1 && it[0].stack.item.id === 'stone_bricks', it.map((e) => e.stack.item.id).join());
  for (const e of it) e.remove();
  world.setState(2, 40, 0, S('infested_cobblestone'));
  level.destroyBlock(2, 40, 0, false, null, true, null);
  check('in creative (no drops): nothing comes out', fish().length === 0);
  level.gameRules.doTileDrops = false;
  world.setState(3, 40, 0, S('infested_stone'));
  level.destroyBlock(3, 40, 0, true, null, true, null);
  check('doTileDrops off: nothing comes out', fish().length === 0);
  level.gameRules.doTileDrops = true;
}

// --- a blast: every infested block caught in it lets its silverfish out
{
  for (let x = -12; x <= -8; x++) for (let z = -2; z <= 2; z++) world.setState(x, 40, z, S('infested_stone'));
  explMod.explode(level, null, -10, 41, 0, 4, false, 'block');
  let left = 0;
  for (let x = -12; x <= -8; x++) for (let z = -2; z <= 2; z++) if (name(world.getState(x, 40, z)) === 'infested_stone') left++;
  const n = fish().length;
  // ((the wither) vanilla BlockBehaviour.onExplosionHit: the stone floor under them caught in the blast leaves cobblestone)
  check('a blast breaks infested blocks and lets their silverfish out', n > 0 && n === 25 - left && items().every((e) => e.stack.item.id === 'cobblestone'), `${n} silverfish, ${left} left`);
  clearFish();
}

// --- burrowing into stone
{
  // a silverfish in a one-block hole in stone, walled in: sooner or later it goes into the wall
  for (let x = -3; x <= 3; x++) for (let z = 10; z <= 16; z++) for (let y = 40; y <= 42; y++) world.setState(x, y, z, S('stone'));
  world.setState(0, 40, 13, 0);
  world.setState(0, 41, 13, 0);
  const s = spawnerMod.createMob('silverfish', level);
  s.moveTo(0.5, 40, 13.5, 0, 0);
  level.addEntity(s);
  let t = 0;
  while (!s.removed && t < 2000) { tick(1); t++; }
  let infested = 0;
  for (let x = -1; x <= 1; x++) for (let z = 12; z <= 14; z++) for (let y = 39; y <= 42; y++) if (name(world.getState(x, y, z)) === 'infested_stone') infested++;
  check('it burrows into the stone next to it', s.removed && infested === 1, `after ${t} ticks, ${infested} infested`);
  // not with mobGriefing off
  level.gameRules.mobGriefing = false;
  const s2 = spawnerMod.createMob('silverfish', level);
  s2.moveTo(0.5, 40, 13.5, 0, 0);
  level.addEntity(s2);
  tick(600);
  check('not with mobGriefing off', !s2.removed);
  level.gameRules.mobGriefing = true;
  s2.remove();
  tick(1);
}

// --- waking friends
{
  for (let x = 14; x <= 26; x++) for (let z = -6; z <= 6; z++) world.setState(x, 39, z, S('infested_stone'));
  const s = spawnerMod.createMob('silverfish', level);
  s.moveTo(20.5, 40, 0.5, 0, 0);
  level.addEntity(s);
  tick(2);
  const before = fish().length;
  s.hurt(1, 'playerAttack', player);
  tick(8);
  check('not straight away', fish().length === before);
  tick(30);
  let broken = 0;
  for (let x = 14; x <= 26; x++) for (let z = -6; z <= 6; z++) if (name(world.getState(x, 39, z)) !== 'infested_stone') broken++;
  const woke = fish().length - before;
  check('a second later its friends break out of the stone about', woke >= 1 && woke === broken, `${woke} out, ${broken} broken`);
  check('alerted: they go for the player', fish().filter((f) => f !== s).every((f) => f.target === null || f.target === player));
  clearFish();
  // mobGriefing off: the blocks just turn back to stone
  for (let x = 14; x <= 26; x++) for (let z = -6; z <= 6; z++) world.setState(x, 39, z, S('infested_stone'));
  level.gameRules.mobGriefing = false;
  const s3 = spawnerMod.createMob('silverfish', level);
  s3.moveTo(20.5, 40, 0.5, 0, 0);
  level.addEntity(s3);
  tick(2);
  s3.hurt(1, 'magic');
  tick(40);
  let stone = 0;
  for (let x = 14; x <= 26; x++) for (let z = -6; z <= 6; z++) if (name(world.getState(x, 39, z)) === 'stone') stone++;
  check('mobGriefing off: they turn back to stone, nothing comes out (magic counts as a blow)', stone >= 1 && fish().length === 1, `${stone} stone, ${fish().length} fish`);
  level.gameRules.mobGriefing = true;
  const s4 = fish()[0];
  const beforeFall = stone;
  s4.hurt(1, 'fall');
  tick(40);
  let stone2 = 0;
  for (let x = 14; x <= 26; x++) for (let z = -6; z <= 6; z++) if (name(world.getState(x, 39, z)) === 'stone') stone2++;
  // (with mobGriefing back on it may well slip into the stone under it, vanilla SilverfishMergeWithStoneGoal)
  const merged = s4.removed && fish().length === 0 ? 1 : 0;
  check('a fall doesn\'t wake them', stone2 === beforeFall - merged && fish().length === 1 - merged, merged ? '(it merged into the stone)' : '');
  clearFish();
}

// --- the spawner and its rule
{
  check('spawn rule: no survival player within 5', !sfMod.Silverfish.checkSpawnRules(level, 30, 40, 27, true) && sfMod.Silverfish.checkSpawnRules(level, 30, 40, 20, true));
  player.setGameMode('creative');
  check('a creative player doesn\'t count', sfMod.Silverfish.checkSpawnRules(level, 30, 40, 27, true));
  player.setGameMode('survival');
  level.difficulty = 'peaceful';
  check('none in peaceful', !sfMod.Silverfish.checkSpawnRules(level, 30, 40, 20, true));
  level.difficulty = 'normal';
  for (let x = -24; x <= -16; x++) for (let z = 16; z <= 24; z++) for (let y = 40; y <= 43; y++) world.setState(x, y, z, 0);
  world.setState(-20, 41, 20, S('spawner'));
  const be = new beMod.SpawnerBlockEntity(-20, 41, 20);
  be.setEntityId('silverfish');
  be.spawnDelay = 0;
  player.moveTo(-20.5, 40, 30.5, 0, 0);
  let n = 0;
  for (let k = 0; k < 20 && n === 0; k++) { be.spawnDelay = 0; bsMod.tickSpawner(be, level); n = fish().length; }
  check('a spawner spawns silverfish', n > 0, String(n));
  clearFish();
  player.moveTo(30.5, 40, 30.5, 0, 0);
}

// --- sounds
{
  for (const k of ['entity.silverfish.ambient', 'entity.silverfish.hurt', 'entity.silverfish.death', 'entity.silverfish.step']) {
    const g = synthMod.SOUNDS[k];
    let ok = !!g;
    let info = '';
    if (g) for (let v = 0; v < g.variants; v++) {
      const b = g.generate(v, 44100);
      let pk = 0, fin = true;
      for (const x of b) { if (!Number.isFinite(x)) fin = false; pk = Math.max(pk, Math.abs(x)); }
      info += ` ${(b.length / 44100).toFixed(2)}s`;
      if (!fin || pk < 0.5 || pk > 0.86 || b.length < 2000) ok = false;
    }
    check(`${k}: ${g?.variants} takes`, ok, info);
  }
  check('variants as vanilla (4, 3, 1, 4)', synthMod.SOUNDS['entity.silverfish.ambient'].variants === 4 && synthMod.SOUNDS['entity.silverfish.hurt'].variants === 3 && synthMod.SOUNDS['entity.silverfish.death'].variants === 1 && synthMod.SOUNDS['entity.silverfish.step'].variants === 4);
}

// --- texture and model
{
    const texMod = mobTexMod;
  const f = texMod.MOB_TEXTURES.silverfish;
  check('texture registered', typeof f === 'function');
  if (f) {
    const t = f();
    const a = (x, y) => t.data[(y * t.w + x) * 4 + 3];
    let clearL = 0, solidL = 0;
    for (let y = 3; y < 11; y++) for (let x = 23; x < 33; x++) (a(x, y) ? solidL++ : clearL++);
    check('64x32', t.w === 64 && t.h === 32);
    check('the segments are solid', a(3, 12) === 255 && a(4, 19) === 255 && a(2, 2) === 255);
    check('the bristles let the body through', clearL > 10 && solidL > 20, `${solidL} solid, ${clearL} clear`);
  }
  const m = sfModel.silverfishModel();
  check('model: 7 segments and 3 layers, 64x32', m.root.children.size === 10 && m.texW === 64 && m.texH === 32);
  check('segments nose to tail', m.root.child('segment0').z === -3.5 && m.root.child('segment6').z === 11.5 && m.root.child('segment2').y === 20);
  sfModel.animateSilverfish(m.root, 10);
  check('it wriggles', m.root.child('segment0').x !== 0 && m.root.child('segment2').x === 0 && m.root.child('layer1').x === m.root.child('segment4').x);
}

// --- generation: infested stone under the windswept hills
{
  const gen = new genMod.ChunkGenerator('12345');
  const B = biomesMod.B;
  let spot = null;
  for (let r = 0; r < 60 && !spot; r++) for (let a = 0; a < 16 && !spot; a++) {
    const x = Math.round(Math.cos(a / 16 * 2 * Math.PI) * r * 256), z = Math.round(Math.sin(a / 16 * 2 * Math.PI) * r * 256);
    const cx = x >> 4, cz = z >> 4;
    if (gen.biomeAt(cx * 16 + 8, cz * 16 + 8) === B.windswept_hills) spot = [cx, cz];
  }
  check('found windswept hills', !!spot, JSON.stringify(spot));
  if (spot) {
    const out = gen.generate(spot[0], spot[1]);
    const inf = S('infested_stone'), infD = S('infested_deepslate', { axis: 'y' });
    let n = 0, nd = 0, high = 0;
    for (let i = 0; i < out.blocks.length; i++) {
      if (out.blocks[i] === inf) n++;
      else if (out.blocks[i] === infD) nd++;
    }
    // (the column layout: y-major? count above 63 through the chunk)
    check('infested stone in the chunk', n + nd > 0, `${n} stone, ${nd} deepslate`);
    void high;
    // plains: none
    let plain = null;
    for (let r = 0; r < 60 && !plain; r++) for (let a = 0; a < 16 && !plain; a++) {
      const x = Math.round(Math.cos(a / 16 * 2 * Math.PI) * r * 256), z = Math.round(Math.sin(a / 16 * 2 * Math.PI) * r * 256);
      if (gen.biomeAt((x >> 4) * 16 + 8, (z >> 4) * 16 + 8) === B.plains) plain = [x >> 4, z >> 4];
    }
    if (plain) {
      const o2 = gen.generate(plain[0], plain[1]);
      let m = 0;
      for (let i = 0; i < o2.blocks.length; i++) if (o2.blocks[i] === inf || o2.blocks[i] === infD) m++;
      check('none under the plains', m === 0, String(m));
    }
  }
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
