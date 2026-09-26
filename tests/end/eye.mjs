// Eyes of ender thrown toward the nearest stronghold (headless): node tests/end/eye.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 200000).unref();
const { mods: [, blockMod, worldMod, chunkMod, dimMod, levelMod, ib, ep, itemMod, playerMod, eyeMod, advMod, recMod, synthMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/dimension.ts', '/src/game/level.ts',
  '/src/game/itemBehavior.ts', '/src/game/endPortal.ts', '/src/item/item.ts', '/src/entity/player.ts', '/src/entity/eyeOfEnder.ts', '/src/game/advancements.ts',
  '/src/inventory/recipes.ts', '/src/audio/synth.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const { S } = blockMod;
const SEED = '12345';

function flatWorld(dim) {
  const world = new worldMod.World();
  world.reset(dim);
  for (let cx = -3; cx <= 2; cx++) for (let cz = -3; cz <= 2; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -40; x < 40; x++) for (let z = -40; z < 40; z++) world.setState(x, 39, z, S('stone'));
  const level = new levelMod.Level(world, SEED);
  const log = { sounds: [], particles: {} };
  level.sound = { play: (n, x, y, z, v, p) => log.sounds.push({ n, x, y, z, v, p }), playUI: () => {} };
  level.particles = { spawn: (k, x, y, z, dx, dy, dz) => { (log.particles[k] ??= []).push([x, y, z, dx, dy, dz]); } };
  return { world, level, log };
}
function setup(dim = dimMod.OVERWORLD, mode = 'survival') {
  const t = flatWorld(dim);
  const player = new playerMod.Player(t.level);
  player.moveTo(0.5, 40, 0.5, 0, -30);
  t.level.player = player;
  t.level.addEntity(player);
  player.setGameMode?.(mode);
  player.gameMode = mode;
  const stack = itemMod.ItemStack.of('ender_eye');
  stack.count = 5;
  player.inventory.main[0] = stack;
  player.inventory.selected = 0;
  return { ...t, player, stack };
}
const use = ib.itemBehaviorOf('ender_eye').use;
const eyes = (level) => level.entities.filter((e) => e instanceof eyeMod.EyeOfEnder);

// --- thrown
const t = setup();
const [sx, sz] = t.level.strongholds().nearest(t.player.x, t.player.y, t.player.z);
console.log(`  nearest stronghold from spawn: [${sx}, ${sz}] ${Math.round(Math.hypot(sx, sz))} blocks`);
const r = use(t.level, t.player, t.stack);
const [eye] = eyes(t.level);
check('used in the air, an eye flies off', r === 'success' && !!eye);
check('one eye used up', t.stack.count === 4, String(t.stack.count));
const launch = t.log.sounds.find((s) => s.n === 'entity.ender_eye.launch');
check('the launch sound, pitched a third to a half', launch && launch.v === 1 && launch.p >= 0.33 && launch.p <= 0.5, JSON.stringify(launch));
check('from the middle of the player', eye && Math.abs(eye.y - (t.player.y + t.player.height / 2)) < 1e-9 && eye.x === t.player.x, eye && `${eye.x} ${eye.y} ${eye.z}`);
{
  const [tx, ty, tz] = eye.target;
  const d = Math.hypot(tx - eye.x, tz - eye.z);
  const a1 = Math.atan2(tz - eye.z, tx - eye.x), a2 = Math.atan2(sz - eye.z, sx - eye.x);
  check('it heads 12 blocks toward the stronghold, 8 up', Math.abs(d - 12) < 1e-9 && Math.abs(ty - (eye.y + 8)) < 1e-9 && Math.abs(a1 - a2) < 1e-9);
}
{
  const y0 = eye.y, x0 = eye.x, z0 = eye.z;
  let maxY = -1e9, n = 0;
  const path = [];
  while (!eye.removed && n < 200) {
    eye.tick();
    n++;
    maxY = Math.max(maxY, eye.y);
    if (n % 10 === 0) path.push(`${(Math.hypot(eye.x - x0, eye.z - z0)).toFixed(1)}/${(eye.y - y0).toFixed(1)}`);
  }
  console.log(`   flight (across/up every 10 ticks): ${path.join(' ')}`);
  check('it lasts 81 ticks', n === 81, String(n));
  const across = Math.hypot(eye.x - x0, eye.z - z0);
  const dir = Math.atan2(eye.z - z0, eye.x - x0), want = Math.atan2(sz - z0, sx - x0);
  check('it drifts toward the stronghold', across > 1 && across < 12.5 && Math.abs(dir - want) < 0.01, `${across.toFixed(2)} blocks`);
  check('it rises about 8 blocks', maxY - y0 > 5 && maxY - y0 < 12, (maxY - y0).toFixed(2));
  check('with a trail of portal particles', (t.log.particles.portal?.length ?? 0) >= 80);
  check('and the death sound', t.log.sounds.some((s) => s.n === 'entity.ender_eye.death' && s.v === 1 && s.p === 1));
  const items = t.level.entities.filter((e) => e.type === 'item');
  if (eye.surviveAfterDeath) check('it dropped as an eye', items.length === 1 && items[0].stack.item.id === 'ender_eye' && items[0].stack.count === 1 && items[0].pickupDelay === 0);
  else check('it shattered', (t.log.particles.item_ender_eye?.length ?? 0) === 8 && items.length === 0);
}
{
  // four in five drop back
  let surv = 0;
  for (let i = 0; i < 2000; i++) {
    const e = new eyeMod.EyeOfEnder(t.level, 0, 50, 0, t.stack);
    e.signalTo(1000, 0, 1000);
    if (e.surviveAfterDeath) surv++;
  }
  check('four in five drop back', Math.abs(surv / 2000 - 0.8) < 0.03, (surv / 2000).toFixed(3));
  // shattering: crumbs and two rings of portal particles, five blocks out
  const lg = flatWorld(dimMod.OVERWORLD);
  eyeMod.eyeShatter(lg.level, 10, 60, 10);
  const p = lg.log.particles.portal ?? [];
  const rOk = p.every(([x, y, z]) => Math.abs(Math.hypot(x - 10.5, z - 10.5) - 5) < 1e-9 && Math.abs(y - 59.6) < 1e-9);
  check('a shattering eye: 8 crumbs, 80 portal particles in a ring of 5', (lg.log.particles.item_ender_eye?.length ?? 0) === 8 && p.length === 80 && rOk);
}
{
  // near the stronghold it goes to the spot itself
  const e = new eyeMod.EyeOfEnder(t.level, sx + 5.5, 30, sz + 3.5, t.stack);
  e.signalTo(sx, 0, sz);
  check('within 12 blocks it heads for the stronghold itself', e.target.join() === `${sx},0,${sz}`);
  for (let i = 0; i < 80; i++) e.tick();
  check('and goes down to it', e.y < 30 && Math.hypot(e.x - sx, e.z - sz) < Math.hypot(5.5, 3.5), `y ${e.y.toFixed(1)}, ${Math.hypot(e.x - sx, e.z - sz).toFixed(2)} away`);
}
{
  // under water: bubbles
  const w = setup();
  for (let x = -3; x <= 3; x++) for (let y = 40; y < 60; y++) for (let z = -3; z <= 3; z++) w.world.setState(x, y, z, S('water'));
  const e = new eyeMod.EyeOfEnder(w.level, 0.5, 45, 0.5, w.stack);
  w.level.addEntity(e);
  e.signalTo(500, 0, 500);
  for (let i = 0; i < 5; i++) e.tick();
  check('under water it leaves bubbles', (w.log.particles.bubble?.length ?? 0) >= 16 && !(w.log.particles.portal?.length), `${w.log.particles.bubble?.length} bubbles`);
}
{
  // creative keeps its eyes; the Nether has nothing to find
  const c = setup(dimMod.OVERWORLD, 'creative');
  use(c.level, c.player, c.stack);
  check('creative: thrown, none used up', eyes(c.level).length === 1 && c.stack.count === 5);
  const n = setup(dimMod.NETHER ?? dimMod.THE_NETHER);
  const rn = use(n.level, n.player, n.stack);
  check('in the Nether nothing flies', eyes(n.level).length === 0 && n.stack.count === 5 && rn === 'success' && n.player.isUsingItem());
}
{
  // Eye Spy: being in a stronghold
  const adv = new advMod.PlayerAdvancements();
  const a = advMod.ADVANCEMENTS.get('story/follow_ender_eye');
  adv.trigger('structure', { structures: ['fortress'] });
  const before = adv.isDone(a);
  adv.trigger('structure', { structures: ['stronghold'] });
  check('Eye Spy for walking into a stronghold', !before && adv.isDone(a));
}
{
  // the recipe
  const grid = [itemMod.ItemStack.of('ender_pearl'), itemMod.ItemStack.of('blaze_powder'), null, null];
  const rec = recMod.findRecipe(grid, 2, 2);
  check('an ender pearl and blaze powder make an eye', rec && JSON.stringify(rec).includes('ender_eye'));
}
{
  // the sounds
  for (const name of ['entity.ender_eye.launch', 'entity.ender_eye.death', 'block.end_portal_frame.fill', 'block.end_portal.spawn']) {
    const g = synthMod.SOUNDS[name];
    let ok = !!g, info = '';
    if (g) for (let v = 0; v < g.variants; v++) {
      const b = g.generate(v, 44100);
      let pk = 0, nan = false;
      for (const x of b) { if (!Number.isFinite(x)) nan = true; pk = Math.max(pk, Math.abs(x)); }
      info += `${(b.length / 44100).toFixed(2)}s pk ${pk.toFixed(2)} `;
      if (nan || pk < 0.05 || pk > 1.0001) ok = false;
    }
    check(`${name} (${g?.variants} takes)`, ok, info);
  }
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
