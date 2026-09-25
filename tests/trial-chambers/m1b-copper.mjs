// M1b: copper at work — weathering (the chance, the neighbours that hold it back, a door weathering from its lower
// half, random ticks doing it), honeycomb and axes through the game's own interaction (scraping an age off, wax on
// and off, the shield in the other hand, a door that opens unless you sneak), the copper bulb toggling on each
// rising edge of power, and the lightning rod: what it draws, its pulse of power, the struck copper cleaned back to
// bare metal, a channeling trident, and the advancements (Wax On, Wax Off, Lighten Up, Surge Protector).

import { load, check, flatLevel, place, prop, blockName, ticks, playerAt, rightClick, hitOn, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/entity/villager.ts']);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const name = (level, x, y, z) => blockName(m, level.getState(x, y, z));
const count = (list, kind) => list.filter((e) => (e.kind ?? e.name) === kind).length;

/** run `fn` with the level's random giving these floats in turn (then 0.99), nextInt 0 */
function withFloats(level, floats, fn) {
  const real = level.random;
  const seq = [...floats];
  level.random = { nextFloat: () => (seq.length ? seq.shift() : 0.99), nextInt: () => 0, next: () => 0.99 };
  try {
    return fn();
  } finally {
    level.random = real;
  }
}
/** a random tick of the block at (x, y, z) with these floats */
const tickWith = (level, x, y, z, floats) => withFloats(level, floats, () => m.behaviorOf(level.getState(x, y, z)).randomTick(level, x, y, z, level.getState(x, y, z)));

// ---------------------------------------------------------------------------------------------------------------
// Weathering

{
  const { level } = flatLevel(m, -2, -2, 2, 2);
  level.setBlock(0, G, 0, m.S('copper_block'));
  tickWith(level, 0, G, 0, [0.0569, 0]);
  check('weather: 0.0569 or over, nothing happens (vanilla 0.05688889)', name(level, 0, G, 0) === 'copper_block');
  tickWith(level, 0, G, 0, [0.0568, 0.751]);
  check('weather: alone, bare copper ages at three quarters of the time: not at 0.751', name(level, 0, G, 0) === 'copper_block');
  tickWith(level, 0, G, 0, [0.0568, 0.749]);
  check('weather: ... but at 0.749 it goes exposed', name(level, 0, G, 0) === 'exposed_copper');
  tickWith(level, 0, G, 0, [0, 0.999]);
  check('weather: exposed and alone, the chance is all of it (1.0 squared)', name(level, 0, G, 0) === 'weathered_copper');
  // an exposed block with three exposed and one weathered round it: ((1 + 1) / (1 + 3 + 1))^2 = 0.16
  level.setBlock(10, G, 0, m.S('exposed_cut_copper'));
  for (const [x, z] of [[11, 0], [9, 0], [10, 1]]) level.setBlock(x, G, z, m.S('exposed_copper'));
  level.setBlock(10, G, -3, m.S('weathered_copper_grate'));
  tickWith(level, 10, G, 0, [0, 0.161]);
  check('weather: three the same age and one older round it: 0.16, not at 0.161', name(level, 10, G, 0) === 'exposed_cut_copper');
  tickWith(level, 10, G, 0, [0, 0.159]);
  check('weather: ... but at 0.159', name(level, 10, G, 0) === 'weathered_cut_copper');
  // a younger one within four (Manhattan) holds it back; five away doesn't; a waxed one doesn't count
  level.setBlock(-10, G, 0, m.S('weathered_copper'));
  level.setBlock(-10, G + 2, 2, m.S('exposed_copper_bulb'));
  tickWith(level, -10, G, 0, [0, 0]);
  check('weather: a younger copper four blocks off (Manhattan) and it doesn\'t age', name(level, -10, G, 0) === 'weathered_copper');
  level.setBlock(-10, G + 2, 2, 0);
  level.setBlock(-10, G + 3, 2, m.S('exposed_copper_bulb'));
  level.setBlock(-12, G, 0, m.S('waxed_copper_block'));
  tickWith(level, -10, G, 0, [0, 0]);
  check('weather: five off, or waxed, it doesn\'t count', name(level, -10, G, 0) === 'oxidized_copper');
  check('weather: oxidized is as far as it goes (no random ticks)', !m.behaviorOf(m.S('oxidized_copper'))?.randomTick && !(m.FLAGS[m.S('oxidized_copper')] & m.F_RANDOM_TICK));
  check('weather: the waxed never tick', !(m.FLAGS[m.S('waxed_exposed_cut_copper_stairs')] & m.F_RANDOM_TICK));
  // properties carry over
  level.setBlock(20, G, 0, m.S('cut_copper_stairs', { facing: 'east', half: 'top' }));
  tickWith(level, 20, G, 0, [0, 0]);
  check('weather: stairs keep their facing and half', name(level, 20, G, 0) === 'exposed_cut_copper_stairs' && prop(m, level, 20, G, 0, 'facing') === 'east' && prop(m, level, 20, G, 0, 'half') === 'top');
  // the odds over many ticks, with the real random
  let n = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) {
    level.setBlock(0, G + 10, 0, m.S('copper_block'), 2);
    m.changeOverTime(level, 0, G + 10, 0, level.getState(0, G + 10, 0));
    if (name(level, 0, G + 10, 0) !== 'copper_block') n++;
  }
  const want = N * 0.05688889 * 0.75;
  check('weather: over 40000 random ticks a lone block of copper ages about 0.0427 of the time', Math.abs(n - want) < want * 0.12, `${n} vs ${want.toFixed(0)}`);
}

{
  // a door weathers from its lower half, the upper following
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'copper_door', 0, G, 0, { yaw: 90 });
  const facing = prop(m, level, 0, G, 0, 'facing');
  tickWith(level, 0, G + 1, 0, [0, 0]);
  check('door: a random tick on the upper half does nothing', name(level, 0, G, 0) === 'copper_door' && name(level, 0, G + 1, 0) === 'copper_door');
  tickWith(level, 0, G, 0, [0, 0]);
  check('door: on the lower half both halves go exposed together, still a door the same way round',
    name(level, 0, G, 0) === 'exposed_copper_door' && name(level, 0, G + 1, 0) === 'exposed_copper_door' && prop(m, level, 0, G + 1, 0, 'half') === 'upper' && prop(m, level, 0, G, 0, 'facing') === facing);
}

{
  // random ticks through the level: fast, a block of copper goes all the way
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const p = playerAt(m, level, 8.5, G, 8.5);
  level.setBlock(3, G, 3, m.S('copper_block'));
  level.randomTicks.speed = 4096;
  let t = 0;
  while (name(level, 3, G, 3) !== 'oxidized_copper' && t < 2000) {
    level.tick();
    t++;
  }
  check('weather: random ticks age a block of copper all the way to oxidized', name(level, 3, G, 3) === 'oxidized_copper', `${name(level, 3, G, 3)} after ${t}`);
  void p;
}

// ---------------------------------------------------------------------------------------------------------------
// Scraping and waxing, through the game's interaction

/** a flat world, `block` at (0, G, 0), a player two blocks south looking at its south face holding `held` */
function scene(block, held, { creative = false, sneak = false, offhand = null, props = null, yaw = 0 } = {}) {
  const s = flatLevel(m, -1, -1, 1, 1);
  place(m, s.level, block, 0, G, 0, { props, yaw });
  const p = playerAt(m, s.level, 0.5, G, 2.5, { yaw: 180, held, creative });
  p.crouching = sneak;
  p.input.sneak = sneak;
  if (offhand) p.inventory.offhand = stack(offhand);
  p.pitch = (Math.atan2(p.y + p.eyeHeight - (G + 0.5), 1.5) * 180) / Math.PI;
  return { ...s, p, held: p.inventory.main[0] };
}

{
  const s = scene('exposed_copper', 'stone_axe');
  rightClick(m, s.level, s.p);
  check('axe: exposed copper is scraped back to the block of copper', name(s.level, 0, G, 0) === 'copper_block');
  check('axe: item.axe.scrape, once', count(s.sounds, 'item.axe.scrape') === 1);
  const n = count(s.particles, 'scrape');
  check('axe: 3 to 5 scrape particles on each face (18 to 30)', n >= 18 && n <= 30, `${n}`);
  const faceOk = s.particles.filter((q) => q.kind === 'scrape').every((q) => [q.x, q.y - G, q.z].filter((v) => Math.abs(Math.abs(v - 0.5) - 0.55) < 1e-9).length >= 1 && [q.x, q.y - G, q.z].every((v) => Math.abs(v - 0.5) <= 0.55 + 1e-9));
  check('axe: ... on the faces, 0.55 out from the middle', faceOk);
  check('axe: the axe wears a point', s.held.damage === 1);
  check('axe: the use is told to the advancements (the block as it was)', s.triggers.some((t) => t.type === 'item_used_on_block' && t.payload.usedOnBlock.item === 'stone_axe' && t.payload.usedOnBlock.block === 'exposed_copper'));
  rightClick(m, s.level, s.p);
  check('axe: bare copper has nothing to scrape', name(s.level, 0, G, 0) === 'copper_block' && count(s.sounds, 'item.axe.scrape') === 1 && s.held.damage === 1);
}
{
  const s = scene('waxed_weathered_cut_copper_stairs', 'iron_axe', { yaw: 90 });
  const facing = prop(m, s.level, 0, G, 0, 'facing');
  rightClick(m, s.level, s.p);
  check('axe: wax comes off first, the age stays (waxed weathered stairs to weathered stairs)', name(s.level, 0, G, 0) === 'weathered_cut_copper_stairs' && prop(m, s.level, 0, G, 0, 'facing') === facing);
  check('axe: item.axe.wax_off and wax_off particles', count(s.sounds, 'item.axe.wax_off') === 1 && count(s.particles, 'wax_off') >= 18);
  rightClick(m, s.level, s.p);
  check('axe: then it scrapes an age off', name(s.level, 0, G, 0) === 'exposed_cut_copper_stairs');
}
{
  const s = scene('exposed_copper', 'stone_axe', { offhand: 'shield' });
  rightClick(m, s.level, s.p);
  check('axe: not with a shield in the other hand (it would go up instead)', name(s.level, 0, G, 0) === 'exposed_copper' && count(s.sounds, 'item.axe.scrape') === 0);
  const t = scene('exposed_copper', 'stone_axe', { offhand: 'shield', sneak: true });
  rightClick(m, t.level, t.p);
  check('axe: ... unless sneaking', name(t.level, 0, G, 0) === 'copper_block');
}
{
  const s = scene('exposed_copper', 'diamond_axe', { creative: true });
  rightClick(m, s.level, s.p);
  check('axe: in creative the axe doesn\'t wear', name(s.level, 0, G, 0) === 'copper_block' && s.held.damage === 0);
}
{
  const s = scene('oxidized_copper', stack('honeycomb', 3));
  rightClick(m, s.level, s.p);
  check('honeycomb: waxes oxidized copper', name(s.level, 0, G, 0) === 'waxed_oxidized_copper');
  check('honeycomb: one used up', s.p.inventory.main[0]?.count === 2);
  check('honeycomb: item.honeycomb.wax_on and wax_on particles', count(s.sounds, 'item.honeycomb.wax_on') === 1 && count(s.particles, 'wax_on') >= 18);
  check('honeycomb: told to the advancements', s.triggers.some((t) => t.type === 'item_used_on_block' && t.payload.usedOnBlock.item === 'honeycomb' && t.payload.usedOnBlock.block === 'oxidized_copper'));
  rightClick(m, s.level, s.p);
  check('honeycomb: waxed copper takes no more', s.p.inventory.main[0]?.count === 2 && count(s.sounds, 'item.honeycomb.wax_on') === 1);
  const c = scene('copper_bulb', 'honeycomb', { creative: true });
  rightClick(m, c.level, c.p);
  check('honeycomb: in creative it isn\'t used up', name(c.level, 0, G, 0) === 'waxed_copper_bulb' && c.p.inventory.main[0]?.count === 1);
}
{
  // (the door facing north, along the south side of its block, towards the player)
  const s = scene('exposed_copper_door', 'stone_axe', { yaw: 180 });
  rightClick(m, s.level, s.p);
  check('door: an axe on a copper door opens it (the door\'s own use comes first)', name(s.level, 0, G, 0) === 'exposed_copper_door' && prop(m, s.level, 0, G, 0, 'open') === true);
  check('door: with the copper door\'s own sound', count(s.sounds, 'block.copper_door.open') === 1);
  const t = scene('exposed_copper_door', 'stone_axe', { sneak: true, yaw: 180 });
  rightClick(m, t.level, t.p);
  check('door: sneaking, the axe scrapes it: both halves', name(t.level, 0, G, 0) === 'copper_door' && name(t.level, 0, G + 1, 0) === 'copper_door' && prop(m, t.level, 0, G + 1, 0, 'half') === 'upper');
  const w = scene('weathered_copper_door', 'honeycomb', { sneak: true, yaw: 180 });
  w.p.pitch = (Math.atan2(w.p.y + w.p.eyeHeight - (G + 1.5), 1.5) * 180) / Math.PI;
  rightClick(m, w.level, w.p);
  check('door: honeycomb on the upper half waxes the whole door', name(w.level, 0, G + 1, 0) === 'waxed_weathered_copper_door' && name(w.level, 0, G, 0) === 'waxed_weathered_copper_door');
}

// ---------------------------------------------------------------------------------------------------------------
// The copper bulb

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'copper_bulb', 0, G, 0);
  const lit = () => prop(m, level, 0, G, 0, 'lit'), powered = () => prop(m, level, 0, G, 0, 'powered');
  check('bulb: placed unpowered, it is out', lit() === false && powered() === false);
  level.setBlock(1, G, 0, m.S('redstone_block'));
  check('bulb: powered, it lights (and plays block.copper_bulb.turn_on)', lit() === true && powered() === true && count(sounds, 'block.copper_bulb.turn_on') === 1);
  level.setBlock(1, G, 0, 0);
  check('bulb: power gone, it stays lit', lit() === true && powered() === false && count(sounds, 'block.copper_bulb.turn_off') === 0);
  level.setBlock(1, G, 0, m.S('redstone_block'));
  check('bulb: powered again, it goes out (block.copper_bulb.turn_off)', lit() === false && powered() === true && count(sounds, 'block.copper_bulb.turn_off') === 1);
  level.setBlock(0, G, 1, m.S('redstone_block'));
  check('bulb: more power while powered changes nothing', lit() === false && powered() === true);
  level.setBlock(1, G, 0, 0);
  level.setBlock(0, G, 1, 0);
  level.setBlock(1, G, 0, m.S('redstone_block'));
  check('bulb: and on again', lit() === true);
  // placed by power it lights at once
  level.setBlock(5, G, 0, m.S('redstone_block'));
  place(m, level, 'oxidized_copper_bulb', 4, G, 0);
  check('bulb: put down next to power it lights at once', prop(m, level, 4, G, 0, 'lit') === true && prop(m, level, 4, G, 0, 'powered') === true);
  check('bulb: comparators would read 15 from a lit bulb, 0 from one that\'s out (a hook)', m.copperBulbAnalogOutput(level.getState(4, G, 0)) === 15 && m.copperBulbAnalogOutput(m.S('copper_bulb')) === 0);
  check('bulb: not a conductor of redstone', !m.isConductor(m.S('copper_bulb')) && m.isConductor(m.S('copper_block')));
}
{
  // Lighten Up: an axe on a lit oxidized bulb; the light goes up as the age comes off
  const s = scene('oxidized_copper_bulb', 'golden_axe', { props: { lit: true, powered: false } });
  rightClick(m, s.level, s.p);
  const st = s.level.getState(0, G, 0);
  check('bulb: scraped, it keeps lit and gets brighter (4 to 8)', name(s.level, 0, G, 0) === 'weathered_copper_bulb' && prop(m, s.level, 0, G, 0, 'lit') === true && m.EMISSION[st] === 8);
  const adv = new m.PlayerAdvancements();
  for (const t of s.triggers) adv.trigger(t.type, t.payload);
  check('advancement: Lighten Up for scraping a copper bulb', adv.isDone(m.ADVANCEMENTS.get('adventure/lighten_up')));
  check('advancement: ... but not Wax Off for it', !adv.isDone(m.ADVANCEMENTS.get('husbandry/wax_off')));
}
{
  const adv = new m.PlayerAdvancements();
  const t = (item, block) => adv.trigger('item_used_on_block', { usedOnBlock: { item, block } });
  t('honeycomb', 'waxed_copper_block');
  check('advancement: no Wax On for honeycomb on waxed copper', !adv.isDone(m.ADVANCEMENTS.get('husbandry/wax_on')));
  t('honeycomb', 'weathered_cut_copper_slab');
  check('advancement: Wax On for honeycomb on copper', adv.isDone(m.ADVANCEMENTS.get('husbandry/wax_on')));
  t('stone_axe', 'weathered_cut_copper_slab');
  check('advancement: no Wax Off for scraping unwaxed copper', !adv.isDone(m.ADVANCEMENTS.get('husbandry/wax_off')));
  t('netherite_axe', 'waxed_copper_trapdoor');
  check('advancement: Wax Off for an axe on waxed copper', adv.isDone(m.ADVANCEMENTS.get('husbandry/wax_off')));
  t('iron_axe', 'waxed_copper_bulb');
  check('advancement: no Lighten Up for the bare copper bulb (it can\'t get brighter)', !adv.isDone(m.ADVANCEMENTS.get('adventure/lighten_up')));
  t('iron_axe', 'waxed_exposed_copper_bulb');
  check('advancement: Lighten Up for a waxed exposed bulb too (vanilla lists them)', adv.isDone(m.ADVANCEMENTS.get('adventure/lighten_up')));
}

// ---------------------------------------------------------------------------------------------------------------
// The lightning rod

/** a thunderstorm now */
function thunder(level) {
  level.raining = level.thundering = true;
  level.rain = level.rainO = level.thunder = level.thunderO = 1;
  level.clearWeatherTime = 0;
  level.rainTime = level.thunderTime = 100000;
}

{
  const { level, particles, triggers } = flatLevel(m, -3, -3, 3, 3);
  level.gameRules.doFireTick = false;
  // a 5x5 of oxidized copper, one of them waxed, a rod on the middle one
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) level.setBlock(x, G, z, m.S('oxidized_cut_copper'));
  level.setBlock(2, G, 2, m.S('waxed_oxidized_cut_copper'));
  place(m, level, 'lightning_rod', 0, G + 1, 0, { face: 1 });
  check('rod: a point of interest for lightning', level.poi.findAll(0, G, 0, 4, (k) => k === 'lightning_rod', false).length === 1);
  const found = m.findLightningRod(level, 40, G, -30);
  check('rod: lightning within 128 blocks comes down on it (the block above it)', JSON.stringify(found) === JSON.stringify([0, G + 2, 0]), JSON.stringify(found));
  check('rod: not from further than 128 off', m.findLightningRod(level, 0, G, 0) && m.findLightningRod(level, 100, G, 100) === null);
  check('rod: a strike aimed at the far side of the chunk goes to the rod', JSON.stringify(level.findLightningTargetAround(40, 40)) === JSON.stringify([0, G + 2, 0]));
  level.setBlock(0, G + 5, 0, m.S('glass'));
  check('rod: not while something is above it', m.findLightningRod(level, 10, G, 10) === null);
  level.setBlock(0, G + 5, 0, 0);
  // a villager standing by, the player watching
  const p = playerAt(m, level, 12.5, G, 0.5);
  const v = new m.Villager(level);
  v.moveTo(-8.5, G, 0.5, 0, 0);
  level.addEntity(v);
  const bolt = new m.LightningBolt(level);
  bolt.moveTo(0.5, G + 2, 0.5, 0, 0);
  level.addEntity(bolt);
  const before = [];
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) before.push(name(level, x, G, z));
  level.tick();
  check('strike: the rod is powered', prop(m, level, 0, G + 1, 0, 'powered') === true);
  check('strike: weak power all round it', m.hasNeighborSignal(level.world, 1, G + 1, 0) && m.hasNeighborSignal(level.world, 0, G + 2, 0));
  check('strike: strong power into what it stands on (a block beside that gets it)', m.getDirectSignalTo(level.world, 0, G, 0) === 15 && m.hasNeighborSignal(level.world, 0, G - 1, 0));
  const sparks = count(particles, 'electric_spark');
  check('strike: sparks: 10-19 along the rod, and more off each copper cleaned', sparks >= 10 + 18, `${sparks}`);
  check('strike: the copper under the rod is back to bare metal', name(level, 0, G, 0) === 'cut_copper');
  const after = [];
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) after.push(name(level, x, G, z));
  const younger = after.filter((n, i) => n !== before[i] && !(n === 'cut_copper' && after.indexOf(n) === 12)).length;
  check('strike: walks from it scrape ages off the copper round it', younger >= 1 && after.filter((n) => n !== 'oxidized_cut_copper').length >= 2, after.join(' '));
  check('strike: the waxed copper is left alone', name(level, 2, G, 2) === 'waxed_oxidized_cut_copper');
  ticks(level, 7);
  check('strike: still powered 7 ticks on', prop(m, level, 0, G + 1, 0, 'powered') === true);
  ticks(level, 1);
  check('strike: 8 ticks and the power is gone', prop(m, level, 0, G + 1, 0, 'powered') === false && !m.hasNeighborSignal(level.world, 1, G + 1, 0));
  ticks(level, 40);
  check('strike: the bolt is gone', bolt.removed);
  const ls = triggers.find((t) => t.type === 'lightning_strike');
  check('strike: the player hears of it with the villager standing by and nothing set alight', ls && ls.payload.lightning.bystanders.includes('villager') && ls.payload.lightning.blocksSetOnFire === 0 && ls.payload.lightning.distance < 30,
    JSON.stringify(ls?.payload));
  check('strike: the villager is still a villager', !v.removed);
  const adv = new m.PlayerAdvancements();
  adv.trigger(ls.type, ls.payload);
  check('advancement: Surge Protector', adv.isDone(m.ADVANCEMENTS.get('adventure/lightning_rod_with_villager_no_fire')));
  const adv2 = new m.PlayerAdvancements();
  adv2.trigger('lightning_strike', { lightning: { ...ls.payload.lightning, blocksSetOnFire: 1 } });
  adv2.trigger('lightning_strike', { lightning: { ...ls.payload.lightning, distance: 31 } });
  adv2.trigger('lightning_strike', { lightning: { ...ls.payload.lightning, bystanders: ['pig'] } });
  check('advancement: not with a fire started, from over 30 blocks off, or with no villager by', !adv2.isDone(m.ADVANCEMENTS.get('adventure/lightning_rod_with_villager_no_fire')));
  void p;
}
{
  // lightning straight onto copper (no rod)
  const { level } = flatLevel(m, -1, -1, 1, 1);
  level.gameRules.doFireTick = false;
  level.setBlock(0, G, 0, m.S('weathered_copper_grate', { waterlogged: true }));
  const bolt = new m.LightningBolt(level);
  bolt.moveTo(0.5, G + 1, 0.5, 0, 0);
  level.addEntity(bolt);
  level.tick();
  check('strike: copper struck itself goes back to bare, keeping its state', name(level, 0, G, 0) === 'copper_grate' && prop(m, level, 0, G, 0, 'waterlogged') === true);
}
{
  // a rod on its side, powering a lamp's block; unpowered by itself if placed powered
  const { level } = flatLevel(m, -1, -1, 1, 1);
  level.setBlock(0, G, 0, m.S('stone'));
  place(m, level, 'lightning_rod', 1, G, 0, { face: 5 });
  m.strikeLightningRod(level, 1, G, 0, level.getState(1, G, 0));
  check('rod: sideways (east), struck, it strongly powers the block west of it', prop(m, level, 1, G, 0, 'facing') === 'east' && m.getDirectSignalTo(level.world, 0, G, 0) === 15);
  level.setBlock(0, G + 3, 0, m.S('lightning_rod', { powered: true }));
  check('rod: set down powered with no tick to end it, it comes unpowered', prop(m, level, 0, G + 3, 0, 'powered') === false);
}
{
  // a channeling trident in a thunderstorm calls lightning down on a rod
  const { level } = flatLevel(m, -1, -1, 1, 1);
  level.gameRules.doFireTick = false;
  place(m, level, 'lightning_rod', 0, G, 0);
  const p = playerAt(m, level, 5.5, G, 0.5);
  const trident = stack('trident');
  trident.tag = { enchantments: { channeling: 1 } };
  const proj = { type: 'trident', pickupItem: trident, owner: p };
  const hit = hitOn(level, 0, G, 0, 1);
  const bolts = () => level.entities.filter((e) => e instanceof m.LightningBolt).length;
  m.behaviorOf(level.getState(0, G, 0)).projectileHit(level, 0, G, 0, level.getState(0, G, 0), hit, proj);
  check('channeling: no storm, no lightning', bolts() === 0);
  thunder(level);
  proj.pickupItem = stack('trident');
  m.behaviorOf(level.getState(0, G, 0)).projectileHit(level, 0, G, 0, level.getState(0, G, 0), hit, proj);
  check('channeling: an unenchanted trident calls nothing', bolts() === 0);
  proj.pickupItem = trident;
  const { sounds } = { sounds: [] };
  level.sound = { play: (n) => sounds.push({ name: n }), playUI() {} };
  m.behaviorOf(level.getState(0, G, 0)).projectileHit(level, 0, G, 0, level.getState(0, G, 0), hit, proj);
  const bolt = level.entities.find((e) => e instanceof m.LightningBolt);
  check('channeling: in a thunderstorm the trident brings lightning down on the rod, the player its cause', !!bolt && bolt.cause === p && Math.abs(bolt.y - (G + 1)) < 1e-9);
  check('channeling: item.trident.thunder', count(sounds, 'item.trident.thunder') === 1);
  // the rod sparks in the storm now and then (animateTick)
  const parts = [];
  level.particles.spawn = (kind) => parts.push({ kind });
  const realRandom = Math.random;
  Math.random = () => 0;
  m.behaviorOf(level.getState(0, G, 0)).animateTick(level, 0, G, 0, level.getState(0, G, 0));
  Math.random = realRandom;
  check('rod: in a thunderstorm it gives a spark or two', count(parts, 'electric_spark') >= 1 && count(parts, 'electric_spark') <= 2);
}

await exitWithStatus(close);
