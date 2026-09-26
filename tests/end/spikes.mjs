// End spikes, the platform and end crystals, headless: node tests/end/spikes.mjs [seed]
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods: [, genMod, feat, blockMod, worldMod, dimMod, levelMod, spawnerMod, crystalMod, ib, fireMod, itemMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/gen/theEnd.ts', '/src/world/gen/endFeatures.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/dimension.ts',
  '/src/game/level.ts', '/src/game/spawner.ts', '/src/entity/endCrystal.ts', '/src/game/itemBehavior.ts', '/src/game/fire.ts', '/src/item/item.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const { BLOCKS, STATE_BLOCK, S } = blockMod;
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;

const seed = process.argv[2] ?? '12345';
const gen = new genMod.EndGenerator(seed);
const spikes = feat.endSpikes(gen.seed);
console.log('spikes', JSON.stringify(spikes.map((s) => [s.centerX, s.centerZ, s.radius, s.height, s.guarded ? 'G' : ''])));
const CENTERS = [[42, 0], [33, 24], [12, 39], [-13, 39], [-34, 24], [-42, -1], [-34, -25], [-13, -40], [12, -40], [33, -25]];
check('ten spikes at vanilla\'s centres', spikes.length === 10 && spikes.every((s, i) => s.centerX === CENTERS[i][0] && s.centerZ === CENTERS[i][1]));
const sizes = spikes.map((s) => (s.height - 76) / 3).sort((a, b) => a - b);
check('sizes are a shuffle of 0..9', sizes.join() === '0,1,2,3,4,5,6,7,8,9');
check('radius 2 + size/3', spikes.every((s) => s.radius === 2 + Math.floor((s.height - 76) / 9)));
check('the caged ones are sizes 1 and 2 (heights 79, 82)', spikes.filter((s) => s.guarded).map((s) => s.height).sort().join() === '79,82');
check('same seed, same spikes', JSON.stringify(feat.endSpikes(new genMod.EndGenerator(seed).seed)) === JSON.stringify(spikes));
const other = feat.endSpikes(new genMod.EndGenerator('another seed').seed);
check('another seed shuffles differently', JSON.stringify(other) !== JSON.stringify(spikes));

// --- a world of the End round the main island, chunks added the way the game adds them (writes across borders baked)
const world = new worldMod.World();
world.reset(dimMod.THE_END);
const level = new levelMod.Level(world, seed);
const sounds = [];
level.sound = { play: (n) => sounds.push(n) };
let genEntities = [];
const t0 = performance.now();
for (let cz = -4; cz <= 7; cz++) for (let cx = -4; cx <= 7; cx++) {
  const out = gen.generate(cx, cz);
  if (out.entities?.length) genEntities.push(...out.entities);
  world.addChunk(out);
}
console.log(`generated ${12 * 12} chunks in ${(performance.now() - t0).toFixed(0)} ms`);
const at = (x, y, z) => name(world.getState(x, y, z));

check('one crystal per spike from generation', genEntities.length === 10 && genEntities.every((d) => d.id === 'end_crystal'));
for (const s of spikes) {
  const { centerX: cx, centerZ: cz, radius: r, height: h } = s;
  let col = true;
  for (let y = 0; y < h; y++) if (at(cx, y, cz) !== 'obsidian') { col = false; break; }
  let rim = at(cx + r, h - 1, cz) === 'obsidian' && at(cx - r, h - 1, cz + 1) === 'obsidian' && at(cx + 1, h - 1, cz - r) === 'obsidian';
  let out = at(cx + r, h - 1, cz + 2) === (s.guarded && r === 2 ? 'iron_bars' : 'air') || at(cx + r, h - 1, cz + 2) === 'air';
  const cryst = genEntities.find((d) => d.x === cx + 0.5 && d.z === cz + 0.5);
  let cage = true;
  if (s.guarded) {
    cage = at(cx + 2, h, cz) === 'iron_bars' && at(cx - 2, h + 2, cz + 1) === 'iron_bars' && at(cx, h + 3, cz) === 'iron_bars' && at(cx + 1, h + 1, cz + 1) !== 'iron_bars';
    const corner = world.getState(cx - 2, h, cz - 2), top = world.getState(cx, h + 3, cz);
    const b = BLOCKS[STATE_BLOCK[corner]];
    cage &&= b.get(corner, 'south') && b.get(corner, 'east') && !b.get(corner, 'north') && !b.get(corner, 'west');
    cage &&= ['north', 'south', 'east', 'west'].every((k) => b.get(top, k));
  }
  let clear = true;
  for (let y = h + 4; y <= h + 10; y++) if (at(cx, y, cz) !== 'air') clear = false;
  check(`spike (${cx},${cz}) r${r} h${h}${s.guarded ? ' caged' : ''}`, col && rim && out && at(cx, h, cz) === 'bedrock' && at(cx, h + 1, cz) === 'fire' && clear && cage && cryst && cryst.y === h + 1,
    `col=${col} rim=${rim} out=${out} top=${at(cx, h, cz)}/${at(cx, h + 1, cz)} clear=${clear} cage=${cage} crystal=${cryst ? cryst.y : 'none'}`);
}
{
  const E = feat.END_SPAWN_POINT;
  let ok = true;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (at(E.x + dx, E.y - 2, E.z + dz) !== 'obsidian') ok = false;
    for (let y = E.y - 1; y <= E.y + 1; y++) if (at(E.x + dx, y, E.z + dz) !== 'air') ok = false;
  }
  check('the obsidian platform under the spawn point (across two chunks)', ok && at(E.x + 3, E.y - 2, E.z) !== 'obsidian');
}

// --- the crystals
const { EndCrystal } = crystalMod;
const destroyed = [];
EndCrystal.onDestroyed = (c, src) => destroyed.push([c, src]);
for (const d of genEntities) { const e = spawnerMod.loadEntity(d, level); if (e) level.addEntity(e); }
const crystals = level.entities.filter((e) => e instanceof EndCrystal);
check('generated crystals load as EndCrystal, plinth showing', crystals.length === 10 && crystals.every((c) => c.showBottom));
{
  const c = crystals[0];
  const saved = spawnerMod.saveEntity(c);
  const back = spawnerMod.loadEntity(saved, level);
  check('save/load round trip', back instanceof EndCrystal && back.x === c.x && back.y === c.y && back.z === c.z && back.showBottom === true && Math.abs(back.yaw - c.yaw) < 1e-9, JSON.stringify(saved));
  c.showBottom = false; c.invulnerable = true; c.beamTarget = [0, 128, 0];
  const back2 = spawnerMod.loadEntity(spawnerMod.saveEntity(c), level);
  check('save/load keeps no-plinth, invulnerable and the beam', back2.showBottom === false && back2.invulnerable === true && back2.beamTarget?.join() === '0,128,0');
  c.showBottom = true; c.invulnerable = false; c.beamTarget = null;
}
{
  // fire in the End on bedrock never goes out; on obsidian it does
  level.gameRules.doFireTick = true;
  const s = spikes[0];
  for (let i = 0; i < 400; i++) { const st = world.getState(s.centerX, s.height + 1, s.centerZ); if (name(st) !== 'fire') break; fireMod.fireTick(level, s.centerX, s.height + 1, s.centerZ, st); }
  check('fire on bedrock burns forever in the End', at(s.centerX, s.height + 1, s.centerZ) === 'fire');
  const E = feat.END_SPAWN_POINT;
  level.setBlock(E.x, E.y - 1, E.z, S('fire'));
  let n = 0;
  for (; n < 2000; n++) { const st = world.getState(E.x, E.y - 1, E.z); if (name(st) !== 'fire') break; fireMod.fireTick(level, E.x, E.y - 1, E.z, st); }
  check('fire on obsidian burns out', at(E.x, E.y - 1, E.z) !== 'fire', `after ${n} ticks`);
  // the crystal relights its fire
  const c = crystals.find((e) => e.x === s.centerX + 0.5 && e.z === s.centerZ + 0.5);
  level.setBlock(s.centerX, s.height + 1, s.centerZ, 0);
  c.tick();
  check('a crystal in the End relights the fire in its block', at(s.centerX, s.height + 1, s.centerZ) === 'fire');
}
{
  const c = crystals[1];
  check('fire can\'t hurt a crystal', c.hurt(5, 'inFire', null) === false && c.hurt(1, 'onFire', null) === false && !c.removed);
  check('the dragon can\'t hurt a crystal', c.hurt(10, 'mob', { type: 'ender_dragon' }) === false && !c.removed);
}
// the item: only on obsidian or bedrock, room above, no one in the way
const place = ib.itemBehaviorOf('end_crystal').useOn;
let consumed = 0, swung = 0;
const fakePlayer = (mode) => ({ gameMode: mode, inventory: { consumeSelected: (k) => { consumed += k; } }, swing: () => { swung++; } });
const stack = new itemMod.ItemStack(itemMod.ITEMS.get('end_crystal'), 4);
const E = feat.END_SPAWN_POINT;
const px = E.x, py = E.y - 2, pz = E.z;
{
  const before = level.entities.length;
  const r1 = place(level, fakePlayer('survival'), stack, { x: px, y: py, z: pz, face: 1 });
  const placed = level.entities[level.entities.length - 1];
  check('placing on obsidian: a crystal with no plinth, one used', r1 === 'success' && level.entities.length === before + 1 && placed instanceof EndCrystal && !placed.showBottom && placed.x === px + 0.5 && placed.y === py + 1 && placed.z === pz + 0.5 && consumed === 1 && swung === 1);
  check('not where a crystal already is', place(level, fakePlayer('survival'), stack, { x: px, y: py, z: pz, face: 1 }) === 'fail');
  check('not on end stone', place(level, fakePlayer('survival'), stack, { x: 0, y: world.heightAt(0, 0) - 1, z: 0, face: 1 }) === 'fail', at(0, world.heightAt(0, 0) - 1, 0));
  const r2 = place(level, fakePlayer('creative'), stack, { x: px + 2, y: py, z: pz + 2, face: 1 });
  check('creative placing uses none', r2 === 'success' && consumed === 1);
  level.setBlock(px - 2, py + 1, pz, S('end_stone'));
  check('not with a block above', place(level, fakePlayer('survival'), stack, { x: px - 2, y: py, z: pz, face: 1 }) === 'fail');
}
{
  // hit one: it blows up (end stone round it breaks); the other, 2.8 blocks off, is destroyed by the blast but doesn't explode itself
  const [a, b] = level.entities.filter((e) => e instanceof EndCrystal && !e.showBottom);
  const ground = [];
  for (let y = 40; y < 48; y++) for (let x = px - 4; x <= px + 4; x++) for (let z = pz - 4; z <= pz + 4; z++) if (at(x, y, z) === 'end_stone') ground.push([x, y, z]);
  level.setBlock(px, py - 1, pz, S('end_stone'));
  sounds.length = 0; destroyed.length = 0;
  const attacker = { type: 'player', gameMode: 'survival', x: px, y: py + 1, z: pz + 5 };
  const hurt = a.hurt(1, 'player', attacker);
  check('a punch blows a crystal up', hurt && a.removed && sounds.filter((s) => s === 'entity.generic.explode').length === 1);
  check('the blast is the attacker\'s', a.owner === attacker);
  const bEntry = destroyed.find((d) => d[0] === b);
  check('the other crystal is destroyed by it without exploding', b.removed && destroyed.length === 2 && bEntry?.[1] === 'playerExplosion', destroyed.map((d) => d[1]).join());
  check('end stone beside it broke; the obsidian (and what it shields) didn\'t', at(px - 2, py + 1, pz) === 'air' && at(px + 1, py, pz + 1) === 'obsidian' && at(px, py - 1, pz) === 'end_stone', `${at(px - 2, py + 1, pz)} ${at(px + 1, py, pz + 1)} ${at(px, py - 1, pz)}`);
}
{
  // /kill and the void
  const c = new EndCrystal(level, 0.5, 100, 0.5);
  level.addEntity(c);
  c.invulnerable = true;
  check('an invulnerable crystal ignores punches', c.hurt(1, 'player', { type: 'player', gameMode: 'survival' }) === false && !c.removed);
  check('... but not creative players', c.hurt(1, 'player', { type: 'player', gameMode: 'creative' }) === true && c.removed);
}
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
