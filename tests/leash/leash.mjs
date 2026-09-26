// Headless checks for leads, fence knots and name tags (node tests/leash/leash.mjs).
import { load, check, flatLevel, place, exitWithStatus } from '../../tests/temples/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/entity/leash.ts', '/src/entity/player.ts', '/src/entity/horse.ts', '/src/entity/wolf.ts', '/src/entity/illagers.ts', '/src/entity/ai/goals.ts', '/src/entity/villager.ts', '/src/entity/bat.ts', '/src/entity/water.ts', '/src/entity/hoglin.ts', '/src/entity/ironGolem.ts']);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);

function setup(mode = 'survival') {
  const { level, sounds } = flatLevel(m, -3, -3, 3, 3);
  const p = new m.Player(level);
  p.gameMode = mode;
  p.moveTo(0.5, G, 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return { level, p, sounds };
}
const mobAt = (level, type, x, z) => { const e = m.createMob(type, level); e.moveTo(x + 0.5, G, z + 0.5, 0, 0); e.finalizeSpawn('egg'); level.addEntity(e); return e; };
const hold = (p, s) => { p.inventory.selected = 0; p.inventory.main[0] = s; };
const items = (level, id) => level.entities.filter((e) => e instanceof m.ItemEntity && !e.removed && e.stack.item.id === id).reduce((n, e) => n + e.stack.count, 0);
const tick = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// --- tying on and letting go
{
  const { level, p } = setup();
  const sheep = mobAt(level, 'sheep', 2, 0);
  hold(p, stack('lead', 2));
  check('a lead on a sheep: tied to the player, one lead used', sheep.interactLeashOrName(p, p.inventory.main[0]) && sheep.leashHolder === p && p.inventory.main[0].count === 1);
  check('a second lead does nothing to a sheep already on one', !sheep.interactLeashOrName(p, p.inventory.main[0]) || sheep.leashHolder !== p);
  // (the click that let it go above: tie it on again)
  if (sheep.leashHolder !== p) sheep.interactLeashOrName(p, p.inventory.main[0]);
  hold(p, stack('wheat'));
  const before = items(level, 'lead');
  check('clicked by the one holding it (with anything): let go, the lead dropped', sheep.interactLeashOrName(p, p.inventory.main[0]) && sheep.leashHolder === null && items(level, 'lead') === before + 1 && p.inventory.main[0]?.item.id === 'wheat');
  const c = setup('creative');
  const cow = mobAt(c.level, 'cow', 2, 0);
  hold(c.p, stack('lead'));
  cow.interactLeashOrName(c.p, c.p.inventory.main[0]);
  const kept = c.p.inventory.main[0]?.count === 1;
  cow.interactLeashOrName(c.p, null);
  check('in creative: the lead isn\'t used, and none drops letting go', kept && cow.leashHolder === null && items(c.level, 'lead') === 0);
}

// --- what goes on a lead
{
  const { level, p } = setup();
  const can = (type) => mobAt(level, type, 3, 3).canHaveALeashAttachedToIt();
  check('animals, golems, hoglins and zoglins go on leads', can('cow') && can('horse') && can('wolf') && can('iron_golem') && can('hoglin') && can('zoglin'));
  check('villagers, monsters, squid and bats don\'t', !can('villager') && !can('zombie') && !can('creeper') && !can('squid') && !can('bat'));
}

// --- following, tugging, snapping
{
  const { level, p } = setup();
  const cow = mobAt(level, 'cow', 1, 0);
  hold(p, stack('lead'));
  cow.interactLeashOrName(p, p.inventory.main[0]);
  p.moveTo(8.5, G, 0.5, 0, 0);
  tick(level, 1);
  check('six blocks off: it\'s kept within five blocks of where the player stands', cow.hasRestriction() && cow.restrictRadius === 5 && cow.restrictCenter.join() === `8,${G},0`);
  tick(level, 80);
  check('and it walks after the player (to within about two blocks)', dist(cow, p) < 3.5, dist(cow, p).toFixed(2));
  // a tug: past six blocks it's pulled
  p.moveTo(cow.x + 8, G, cow.z, 0, 0);
  cow.dx = cow.dz = 0;
  cow.tickLeash();
  check('eight blocks off: pulled toward the player', cow.dx > 0.2 && Math.abs(cow.dz) < 1e-6, cow.dx.toFixed(3));
  const leads = items(level, 'lead');
  p.moveTo(cow.x + 12, G, cow.z, 0, 0);
  cow.tickLeash();
  check('past ten blocks the lead snaps: dropped, and it goes where it likes again', cow.leashHolder === null && items(level, 'lead') === leads + 1 && !cow.hasRestriction());
  // a sitting wolf isn't pulled
  const wolf = mobAt(level, 'wolf', 0, 3);
  wolf.tame = true;
  wolf.ownerUUID = p.uuid;
  wolf.orderedToSit = wolf.inSittingPose = true;
  wolf.setLeashedTo(p);
  p.moveTo(wolf.x + 8, G, wolf.z, 0, 0);
  wolf.dx = 0;
  wolf.tickLeash();
  check('a sitting wolf isn\'t tugged at eight blocks', wolf.dx === 0 && wolf.leashHolder === p);
  p.moveTo(wolf.x + 11, G, wolf.z, 0, 0);
  wolf.tickLeash();
  check('but its lead still snaps past ten', wolf.leashHolder === null);
}

// --- a leashed mob's wanders keep near the holder
{
  const { level, p } = setup();
  const cow = mobAt(level, 'cow', 0, 0);
  cow.restrictTo(0, G, 0, 5);
  let inside = 0, n = 0;
  for (let i = 0; i < 200; i++) {
    const pos = m.landRandomPos(cow, 10, 7);
    if (!pos) continue;
    n++;
    if (pos[0] ** 2 + (pos[1] - G) ** 2 + pos[2] ** 2 < 25) inside++;
  }
  check('its random walks stay within five blocks of where it\'s kept', n > 50 && inside === n, `${inside}/${n}`);
}

// --- fences and knots
{
  const { level, p, sounds } = setup();
  place(m, level, 'oak_fence', 3, G, 0);
  const a = mobAt(level, 'cow', 1, 2), b = mobAt(level, 'sheep', 2, -2), far = mobAt(level, 'pig', 20, 0);
  for (const e of [a, b, far]) e.setLeashedTo(p);
  check('a fence with nothing on the player\'s leads: nothing tied', !m.bindPlayerMobs(level, new m.Player(level), 3, G, 0));
  check('using the fence ties the animals within seven blocks to a knot', m.bindPlayerMobs(level, p, 3, G, 0) && a.leashHolder instanceof m.LeashKnot && a.leashHolder === b.leashHolder && far.leashHolder === p);
  const knot = a.leashHolder;
  check('the knot: round the post, 0.375 up, with its sound', knot.bx === 3 && knot.by === G && knot.x === 3.5 && knot.y === G + 0.375 && sounds.some((s) => s.name === 'entity.leash_knot.place'));
  check('a second fence use finds the same knot', m.getOrCreateKnot(level, 3, G, 0) === knot);
  // the knot used with the pig on the lead: the pig is tied there too
  far.moveTo(4.5, G, 0.5, 0, 0);
  knot.interact(p);
  check('using the knot ties on what the player holds', far.leashHolder === knot && !knot.removed);
  const leads = items(level, 'lead');
  knot.interact(p);
  tick(level, 1);
  check('used again with nothing held: undone, and the three drop their leads', knot.removed && a.leashHolder === null && b.leashHolder === null && far.leashHolder === null && items(level, 'lead') === leads + 3);
  // taking the fence away
  a.setLeashedTo(p);
  m.bindPlayerMobs(level, p, 3, G, 0);
  const k2 = a.leashHolder;
  level.setBlock(3, G, 0, 0);
  tick(level, 102);
  check('with the fence gone the knot comes undone (on its next check) and the lead drops', k2.removed && a.leashHolder === null && sounds.some((s) => s.name === 'entity.leash_knot.break'));
  // hitting it
  place(m, level, 'oak_fence', 3, G, 0);
  b.setLeashedTo(p);
  m.bindPlayerMobs(level, p, 3, G, 0);
  const k3 = b.leashHolder;
  check('a knot is hit and gone', k3.hurt(1, 'player', p) && k3.removed);
}

// --- saved and loaded
{
  const { level, p } = setup();
  place(m, level, 'oak_fence', -3, G, 0);
  const cow = mobAt(level, 'cow', -1, 0);
  cow.setLeashedTo(p);
  m.bindPlayerMobs(level, p, -3, G, 0);
  const sheep = mobAt(level, 'sheep', 1, 1);
  sheep.setLeashedTo(p);
  const dc = m.saveEntity(cow), ds = m.saveEntity(sheep), dk = m.saveEntity(cow.leashHolder);
  check('saved: the cow\'s lead as its fence, the sheep\'s as the player', dc.leash?.x === -3 && dc.leash?.y === G && ds.leash?.uuid === p.uuid && dk?.id === 'leash_knot');
  const w2 = setup();
  w2.p.uuid = p.uuid;
  place(m, w2.level, 'oak_fence', -3, G, 0);
  const c2 = m.loadEntity(dc, w2.level), s2 = m.loadEntity(ds, w2.level), k2 = m.loadEntity(dk, w2.level);
  for (const e of [k2, c2, s2]) w2.level.addEntity(e);
  tick(w2.level, 1);
  check('loaded: the cow tied to the loaded knot, the sheep to the player', c2.leashHolder === k2 && s2.leashHolder === w2.p);
  const lone = m.loadEntity({ ...ds, leash: { uuid: 'nobody' } }, w2.level);
  w2.level.addEntity(lone);
  tick(w2.level, 50);
  const early = lone.leashHolder === null && items(w2.level, 'lead') === 0;
  tick(w2.level, 60);
  check('a lead whose holder never turns up drops after five seconds', early && items(w2.level, 'lead') === 1);
}

// --- name tags
{
  const { level, p } = setup();
  const cow = mobAt(level, 'cow', 2, 0);
  hold(p, stack('name_tag'));
  check('a name tag with no name does nothing', !cow.interactLeashOrName(p, p.inventory.main[0]) && cow.customName === null);
  const tag = stack('name_tag');
  tag.tag = { customName: 'Bessie' };
  hold(p, tag);
  check('a named one names it, for good, and is used up', cow.interactLeashOrName(p, p.inventory.main[0]) && cow.customName === 'Bessie' && cow.persistenceRequired && !p.inventory.main[0]);
  check('it goes by its name', m.entityDisplayName(cow) === 'Bessie');
  const d = m.saveEntity(cow);
  const back = m.loadEntity(d, level);
  check('its name is saved', d.name === 'Bessie' && back.customName === 'Bessie' && !back.customNameVisible);
  const v = mobAt(level, 'vindicator', 0, 3);
  const j = stack('name_tag');
  j.tag = { customName: 'Johnny' };
  hold(p, j);
  v.interactLeashOrName(p, p.inventory.main[0]);
  check('a vindicator named Johnny is Johnny', v.johnny === true && v.customName === 'Johnny');
}

// --- /summon with a name
{
  const { level, p } = setup('creative');
  const out = [];
  const game = { player: p, level, world: level.world, playerName: 'Steve', meta: { allowCommands: true }, chat: (s) => out.push(s) };
  const before = new Set(level.entities);
  m.executeCommand(game, `summon cow 2 ${G} 2 {CustomName:'"Daisy"',CustomNameVisible:1b}`);
  const cow = level.entities.find((e) => !before.has(e) && e.type === 'cow');
  check('/summon with CustomName and CustomNameVisible', cow?.customName === 'Daisy' && cow.customNameVisible === true, out.join(' | '));
  m.executeCommand(game, `summon vindicator 2 ${G} 4 {Johnny:1b}`);
  const v = level.entities.find((e) => !before.has(e) && e.type === 'vindicator');
  check('/summon with the Johnny flag: Johnny, but no name', v?.johnny === true && v.customName === null, out.join(' | '));
  m.executeCommand(game, `summon pig 2 ${G} 6 {CustomName:'{"text":"Hamlet"}'}`);
  const pig = level.entities.find((e) => !before.has(e) && e.type === 'pig');
  check('/summon with a name as a text object', pig?.customName === 'Hamlet', out.join(' | '));
}

await exitWithStatus(close);
