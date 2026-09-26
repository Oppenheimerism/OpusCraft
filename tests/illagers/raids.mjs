// Headless checks for raids (node tests/illagers/raids.mjs): the ominous bottle, the omens, a raid won wave by wave, a
// raid lost, giving up, the bell, the villagers, the raiders' way in, saving and loading.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 290000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/raids.ts', '/src/entity/raider.ts', '/src/entity/illagers.ts', '/src/entity/villager.ts',
  '/src/entity/effects.ts', '/src/item/item.ts', '/src/game/itemBehavior.ts', '/src/world/blockEntity.ts', '/src/game/villageBlocks.ts',
  '/src/game/advancements.ts', '/src/game/spawner.ts', '/src/entity/itemEntity.ts', '/src/entity/trading.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, raids, raider, ill, vill, eff, itemMod, ib, beMod, vb, adv, spawner, itemEnt, trading] = mods;
const { S } = blockMod;
const { ItemStack, ITEMS } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

/** a flat world 256 across, a little village in the middle: a bell, four beds and a composter, all claimed */
function setup({ difficulty = 'normal', claim = true } = {}) {
  const world = new worldMod.World();
  for (let cx = -8; cx < 8; cx++) for (let cz = -8; cz < 8; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -128; x < 128; x++) for (let z = -128; z < 128; z++) { const c = world.getChunk(x >> 4, z >> 4); for (let y = 58; y <= 63; y++) c.setState(x & 15, y, z & 15, S('stone')); }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new levelMod.Level(world, 'test');
  const sounds = [], sparks = [], triggers = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, spawn() {}, entityEffect(x, y, z, c) { sparks.push({ x, y, z, c }); } };
  level.difficulty = difficulty;
  level.doDaylightCycle = false;
  level.dayTime = 1000;
  level.simulationDistance = 10;
  const holder = { removed: false };
  const pois = [[0, 64, 0, S('bell', { attachment: 'floor', facing: 'north' })], [6, 64, 6, S('composter')]];
  for (const [x, z] of [[8, -6], [-8, -6], [-8, 6], [4, 10]]) pois.push([x, 64, z, S('red_bed', { part: 'head', facing: 'north' })]);
  for (const [x, y, z, st] of pois) {
    world.setState(x, y, z, st);
    if (claim) level.poi.take(x, y, z, holder);
  }
  const player = new playerMod.Player(level);
  player.moveTo(0.5, 64, 0.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  level.onPlayerTrigger = (p, t) => triggers.push(t);
  return { level, world, player, sounds, sparks, triggers, holder, pois };
}
const tick = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const raidersOf = (level) => level.entities.filter((e) => e instanceof raider.Raider && !e.removed);
const bottle = (amp) => { const s = ItemStack.of('ominous_bottle'); if (amp !== undefined) s.tag = { ...(s.tag ?? {}), ominousAmplifier: amp }; return s; };

// --- the ominous bottle
{
  const { level, player, sounds } = setup();
  const b = ib.itemBehaviorOf('ominous_bottle');
  const s = bottle(2);
  player.inventory.setSelectedItem(s);
  check('an ominous bottle is drunk over 1.6 seconds', b.use(level, player, s) === 'success' && player.useItem === s && player.useDuration === 32 && b.useAnim === 'drink');
  player.stopUsingItem();
  b.finishUsing(level, player, s);
  const e = player.getEffect('bad_omen');
  check('drunk, it gives Bad Omen of its level for 100 minutes, no swirls but its icon', e && e.amplifier === 2 && e.duration === 120000 && !e.visible && e.showIcon && !e.ambient);
  check('...and is gone (no bottle left behind)', !player.inventory.selectedItem);
  check('with the bottle\'s dark wisp and the omen\'s own sound', sounds.some((x) => x.n === 'item.ominous_bottle.dispose') && sounds.some((x) => x.n === 'event.mob_effect.bad_omen'));
  const lines = [];
  ITEMS.get('ominous_bottle').hoverText(bottle(2), lines);
  const lines0 = [];
  ITEMS.get('ominous_bottle').hoverText(ItemStack.of('ominous_bottle'), lines0);
  check('its tooltip names the omen', lines[0] === '§9Bad Omen III (01:40:00)' && lines0[0] === '§9Bad Omen (01:40:00)', JSON.stringify([lines, lines0]));
  const cs = ITEMS.get('ominous_bottle').creativeStacks();
  check('five in the creative tab, one of each level', cs.length === 5 && cs.every((x, i) => x.tag?.ominousAmplifier === i));
  // in creative it isn't used up
  player.gameMode = 'creative';
  const s2 = bottle(0);
  player.inventory.setSelectedItem(s2);
  b.finishUsing(level, player, s2);
  check('in creative the bottle stays', player.inventory.selectedItem === s2 && s2.count === 1);
}

// --- the omens: Bad Omen turns to Raid Omen in a village, and that starts the raid
{
  const { level, player, sounds, pois } = setup();
  player.addEffect(new eff.MobEffectInstance(eff.MOB_EFFECTS.bad_omen, 120000, 2, false, false, true));
  player.moveTo(100.5, 64, 100.5, 0, 0);
  tick(level, 5);
  check('outside a village Bad Omen stays', player.hasEffect('bad_omen') && !player.hasEffect('raid_omen'));
  level.difficulty = 'peaceful';
  player.moveTo(2.5, 64, 2.5, 0, 0);
  tick(level, 3);
  check('in peaceful too', player.hasEffect('bad_omen') && !player.hasEffect('raid_omen'));
  level.difficulty = 'normal';
  tick(level, 1);
  const ro = player.getEffect('raid_omen');
  check('in a village it turns to Raid Omen of the same level, for 30 seconds', !player.hasEffect('bad_omen') && ro && ro.amplifier === 2 && ro.duration >= 598 && ro.duration <= 600, ro && `${ro.amplifier} ${ro.duration}`);
  check('with the Raid Omen\'s sound', sounds.some((x) => x.n === 'event.mob_effect.raid_omen'));
  check('no raid yet', level.raids.list().length === 0);
  player.moveTo(40.5, 64, 40.5, 0, 0);
  tick(level, 597);
  check('...not quite yet', level.raids.list().length === 0 && player.getEffect('raid_omen')?.duration === 2);
  tick(level, 2);
  check('...until the Raid Omen runs out (wherever the player has gone)', level.raids.list().length === 1 && !player.hasEffect('raid_omen'), `${level.raids.list().length} ${player.getEffect('raid_omen')?.duration}`);
  const raid = level.raids.list()[0];
  const avg = [0, 1, 2].map((i) => Math.floor(pois.reduce((a, p) => a + p[i], 0) / pois.length));
  check('the raid is on the village: its middle the claimed points\' average', raid && raid.center().join() === avg.join(), `${raid?.center()} vs ${avg}`);
  check('its omen level is the omen\'s level + 1, and it has five waves on normal', raid.raidOmenLevel === 3 && raid.waveCount === 5 && raid.enchantOdds() === 0.25);
}

// --- a raid won: the waves, the captain, the horn, the bar, the bonus wave, the heroes
{
  const { level, player, sounds, triggers } = setup();
  const raid = raids.startRaid(level, player, [0, 64, 0], 2);
  check('a raid starts (the test hook)', raid && raid.raidOmenLevel === 2 && !raid.isStarted());
  tick(level, 1);
  check('the bar shows "Raid" to the player in the village', level.raids.shownBars().length === 1 && raid.bar.name === 'Raid' && raid.bar.color === 'red' && raid.bar.overlay === 'notched_10');
  tick(level, 150);
  check('it fills for 15 seconds first', Math.abs(raid.bar.progress - 151 / 300) < 0.01 && raidersOf(level).length === 0, raid.bar.progress.toFixed(3));
  const seen = [];
  const hornAt = [];
  let horns = 0;
  for (let wave = 1; wave <= 6; wave++) {
    let guard = 0;
    while (raid.groupsSpawned() < wave && guard++ < 400) level.tick();
    const rs = raidersOf(level);
    const types = {};
    for (const r of rs) types[r.type] = (types[r.type] ?? 0) + 1;
    seen.push({ wave, n: rs.length, types, riders: rs.filter((r) => r.vehicle).map((r) => r.type), leaders: rs.filter((r) => raider.isOminousBanner(r.armorItems[3])).length });
    const h = sounds.filter((x) => x.n === 'event.raid.horn');
    if (h.length > horns) hornAt.push(h[h.length - 1]);
    horns = h.length;
    if (wave === 1) {
      check('the first wave comes after the bar fills', raid.groupsSpawned() === 1 && raid.isStarted() && rs.length >= 4);
      check('...all in the raid, wave 1, able to join', rs.every((r) => r.raid === raid && r.wave === 1 && r.canJoinRaid));
      const cap = rs.filter((r) => r.patrolLeader);
      check('...one captain with the ominous banner (a sure drop)', cap.length === 1 && raid.leader(1) === cap[0] && raider.isOminousBanner(cap[0].armorItems[3]) && cap[0].armorDropChances?.[3] !== 0);
      const d = Math.hypot(rs[0].x - 0.5, rs[0].z - 0.5);
      check('...from about 64 blocks off, dropped in a block above the ground', d > 55 && d < 75 && rs.every((r) => Math.abs(r.y - 65) < 1.01), `d=${d.toFixed(1)} y=${rs[0].y}`);
      const hn = hornAt[0];
      check('...to the sound of the horn, 13 blocks from the player that way, carrying far', hn && Math.abs(Math.hypot(hn.x - player.x, hn.z - player.z) - 13) < 0.01 && hn.v === 64);
      check('...and the bar is their health', raid.bar.progress === 1 && raid.totalHealth > 0);
      // (vanilla Raider.hurtServer updates the bar before the blow lands, so it shows the hurt one blow late)
      rs[0].hurt(5, 'generic', player);
      tick(level, 1);
      const late = raid.bar.progress;
      rs[0].hurt(1, 'generic', player);
      check('...going down as they\'re hurt (a blow late, as in vanilla)', late === 1 && raid.bar.progress < 1 && raid.bar.progress > 0.9, `${late} ${raid.bar.progress.toFixed(3)}`);
    }
    // all but two killed by the player: the bar counts the rest down
    for (const r of rs.slice(0, -2)) r.hurt(1000, 'generic', player);
    tick(level, 21);
    if (wave === 1) check('two left: "Raid - Raiders Remaining: 2"', raid.bar.name === 'Raid - Raiders Remaining: 2', raid.bar.name);
    for (const r of raidersOf(level)) r.hurt(1000, 'generic', player);
    tick(level, 2);
    if (wave === 1) check('between waves the bar fills again', raid.isBetweenWaves() && raid.raidCooldownTicks <= 300 && raid.raidCooldownTicks > 290, `${raid.raidCooldownTicks}`);
  }
  console.log('waves:', seen.map((s) => `${s.wave}: ${JSON.stringify(s.types)}${s.riders.length ? ' riders ' + s.riders : ''}`).join(' | '));
  check('wave 2 brings vindicators, wave 3 a ravager', (seen[1].types.vindicator ?? 0) >= 2 && seen[2].types.ravager === 1);
  check('wave 4 brings witches, wave 5 an evoker and a ravager ridden by a pillager', (seen[3].types.witch ?? 0) >= 3 && seen[4].types.evoker === 1 && seen[4].riders.includes('pillager'));
  check('an omen level of 2 brings a bonus wave (the last wave\'s again)', seen[5].n > 0 && raid.groupsSpawned() === 6 && seen[5].types.evoker === 1);
  check('each wave has one captain', seen.every((s) => s.leaders === 1));
  check('a horn for each wave', horns === 6, `${horns}`);
  tick(level, 45);
  check('the last raider dead, two seconds later it\'s won', raid.isVictory());
  const hero = player.getEffect('hero_of_the_village');
  check('the player who killed them is the Hero of the Village, a level for each omen level past the first, for 40 minutes', hero && hero.amplifier === 1 && hero.duration > 47900 && !hero.visible, hero && `${hero.amplifier} ${hero.duration}`);
  check('...and earns "Hero of the Village"', triggers.includes('raid_won') && adv.ADVANCEMENTS.get('adventure/hero_of_the_village').criteria.some?.((c) => c.t === 'raid_won') !== false);
  tick(level, 20);
  check('the bar says "Raid - Victory"', raid.bar.name === 'Raid - Victory' && raid.bar.progress === 0 && level.raids.shownBars().length === 1);
  tick(level, 600);
  check('and 30 seconds later it\'s over', level.raids.list().length === 0 && level.raids.shownBars().length === 0);
}

// --- a raid lost: no one left in the village, the raiders celebrate
{
  const { level, player, holder } = setup();
  const raid = raids.startRaid(level, player, [0, 64, 0], 1);
  tick(level, 310);
  const rs = raidersOf(level);
  check('the first wave is here', raid.groupsSpawned() === 1 && rs.length > 0);
  check('an omen level of 1: no bonus wave, no enchantments', raid.enchantOdds() === 0);
  player.gameMode = 'creative';
  holder.removed = true;
  tick(level, 1);
  check('the village gone (nothing claimed), the raid is lost', raid.isLoss());
  tick(level, 60);
  check('the raiders celebrate', rs.some((r) => r.celebrating), rs.map((r) => r.celebrating).join());
  check('the bar says "Raid - Defeat"', raid.bar.name === 'Raid - Defeat');
  tick(level, 560);
  check('and then it\'s over', level.raids.list().length === 0);
}

// --- giving up: in peaceful, after 40 minutes, with disableRaids; no raids in the Nether
{
  let { level, player } = setup();
  let raid = raids.startRaid(level, player, [0, 64, 0], 1);
  level.difficulty = 'peaceful';
  tick(level, 2);
  check('peaceful stops a raid', raid.isStopped() && level.raids.list().length === 0);
  ({ level, player } = setup());
  raid = raids.startRaid(level, player, [0, 64, 0], 1);
  raid.ticksActive = 47998;
  tick(level, 1);
  check('a raid gives up after 40 minutes', !raid.isStopped());
  tick(level, 1);
  check('...not a tick later', raid.isStopped());
  ({ level, player } = setup());
  raid = raids.startRaid(level, player, [0, 64, 0], 1);
  level.gameRules.disableRaids = true;
  tick(level, 1);
  check('the disableRaids rule stops it', raid.isStopped() && raids.startRaid(level, player, [0, 64, 0], 1) === null);
  ({ level, player } = setup({ claim: false }));
  player.addEffect(new eff.MobEffectInstance(eff.MOB_EFFECTS.bad_omen, 1000, 0));
  tick(level, 3);
  check('where nothing is claimed it isn\'t a village', player.hasEffect('bad_omen'));
  ({ level, player } = setup());
  level.world.dim = { ...level.world.dim, id: 'the_nether' };
  check('no raids in the Nether', raids.startRaid(level, player, [0, 64, 0], 1) === null);
}

// --- the bell: rung with raiders about, it resonates, and they glow
{
  const { level, sounds, sparks } = setup();
  const near = new ill.Pillager(level), far = new ill.Pillager(level), v = new vill.Villager(level);
  near.moveTo(20.5, 64, 0.5, 0, 0);
  far.moveTo(0.5, 64, 44.5, 0, 0);
  v.moveTo(3.5, 64, 0.5, 0, 0);
  for (const e of [near, far, v]) level.addEntity(e);
  check('the bell rings', vb.bellRinger.ring(level, 0, 64, 0, null));
  tick(level, 6);
  check('a quarter of a second in, with a raider within 32, it hums', sounds.some((x) => x.n === 'block.bell.resonate'));
  tick(level, 40);
  check('two seconds later the raiders within 48 glow for three seconds', near.hasEffect('glowing') && far.hasEffect('glowing') && near.getEffect('glowing').duration <= 60 && !v.hasEffect('glowing'));
  check('...sparks trailing towards each', sparks.length >= 6);
  // a pillager only at 40 blocks, farther than 32: no resonance
  const s2 = setup();
  const p2 = new ill.Pillager(s2.level);
  p2.moveTo(40.5, 64, 0.5, 0, 0);
  p2.moveSpeedAttr = 0;
  s2.level.addEntity(p2);
  vb.bellRinger.ring(s2.level, 0, 64, 0, null);
  tick(s2.level, 50);
  check('none within 32: it just rings', !s2.sounds.some((x) => x.n === 'block.bell.resonate') && !p2.hasEffect('glowing'));
}

// --- the villagers: to the bell before the wave, hiding while it's on, cheering after; gifts and discounts for the hero
{
  const { level, player, sounds } = setup();
  const vs = [];
  for (let i = 0; i < 3; i++) {
    const v = new vill.Villager(level);
    v.moveTo(-3.5 + i * 3, 64, -3.5, 0, 0);
    v.mem.meetingPoint = [0, 64, 0];
    level.poi.take(0, 64, 0, v);
    level.addEntity(v);
    vs.push(v);
  }
  const raid = raids.startRaid(level, player, [0, 64, 0], 1);
  tick(level, 200);
  check('before the wave: pre_raid (SetRaidStatus)', vs.every((v) => v.brain.isActive('pre_raid')), vs.map((v) => v.brain.activeNonCore()).join());
  check('...gathered at the bell, they ring it', sounds.some((x) => x.n === 'block.bell.use'));
  // (the raiders held where they came, so no one panics)
  let pinned = null;
  for (let i = 0; i < 250; i++) {
    level.tick();
    const rs = raidersOf(level);
    if (rs.length && !pinned) pinned = rs.map((r) => [r, r.x, 64, r.z]);
    if (pinned) for (const [r, x, y, z] of pinned) { r.moveTo(x, y, z, r.yaw, r.pitch); r.fallDistance = 0; }
  }
  check('the wave on: raid', raid.groupsSpawned() === 1 && vs.every((v) => v.brain.isActive('raid')), vs.map((v) => v.brain.activeNonCore()).join());
  const hid = vs.filter((v) => v.mem.hidingPlace || v.mem.walkTarget).length;
  check('...and they make for the beds', hid > 0, `${hid}`);
  // the bell doesn't send them into hiding while there's a raid
  vs[0].heardBellTime = level.gameTime;
  tick(level, 2);
  check('the bell doesn\'t send them to hide in a raid', !vs[0].brain.isActive('hide'));
  vs[0].heardBellTime = null;
  for (let w = 0; w < 6 && !raid.isVictory(); w++) {
    for (const r of raidersOf(level)) r.hurt(1000, 'generic', player);
    const n = raid.groupsSpawned();
    let g = 0;
    while (!raid.isVictory() && raid.groupsSpawned() === n && g++ < 400) level.tick();
  }
  tick(level, 150);
  check('won: the villagers stay in the raid activity to celebrate', raid.isVictory() && vs.every((v) => v.brain.isActive('raid')), vs.map((v) => v.brain.activeNonCore()).join());
  tick(level, 900);
  check('when it\'s over, back to their day', level.raids.list().length === 0 && vs.every((v) => !v.brain.isActive('raid') && !v.brain.isActive('pre_raid')), vs.map((v) => v.brain.activeNonCore()).join());
  // the hero's gifts
  const hero = player.getEffect('hero_of_the_village');
  check('the hero', !!hero);
  const farmer = vs[0];
  farmer.setProfession('farmer');
  farmer.xp = 1; // (traded with once, so it keeps its trade without a job site: vanilla ResetProfession)
  farmer.refreshBrain();
  const baby = new vill.Villager(level);
  baby.setAge(-24000);
  baby.moveTo(1.5, 64, 3.5, 0, 0);
  level.addEntity(baby);
  player.moveTo(0.5, 64, 2.5, 0, 0);
  farmer.moveTo(3.5, 64, 2.5, 0, 0);
  const got = new Set();
  // (a gift only after it has seen the hero for 600 ticks; strolling off out of sight, it waits longer)
  for (let i = 0; i < 2400 && !([...got].some((g) => g.startsWith('farmer:')) && got.has('baby:poppy')); i++) {
    level.tick();
    player.moveTo(0.5, 64, 2.5, 0, 0);
    for (const e of level.entities) if (e instanceof itemEnt.ItemEntity && !e.removed && e.thrower && (e.thrower === farmer || e.thrower === baby)) { got.add(`${e.thrower === baby ? 'baby' : 'farmer'}:${e.stack.item.id}`); e.remove(); }
  }
  check('a farmer throws the hero bread, pie or cookies; a child a poppy', [...got].some((g) => /^farmer:(bread|pumpkin_pie|cookie)$/.test(g)) && got.has('baby:poppy'), [...got].join());
  // the discount
  const smith = new vill.Villager(level);
  smith.setProfession('armorer');
  const offers = smith.getOffers();
  const base = offers.map((o) => o.costA().count);
  smith['updateSpecialPrices'](player);
  const now = offers.map((o) => o.costA().count);
  const want = offers.map((o, i) => Math.max(1, base[i] - Math.max(Math.floor((0.3 + 0.0625 * hero.amplifier) * o.baseCostA.count), 1)));
  check('the hero pays less: 30% off (and 6.25% for each level more), one at least', offers.length > 0 && now.every((n, i) => n === want[i]), `${base} → ${now}`);
}

// --- the raiders' way in: to the village, recruiting on the way; wandering in, they join
{
  const { level, player } = setup();
  player.gameMode = 'creative';
  const raid = raids.startRaid(level, player, [0, 64, 0], 1);
  tick(level, 305);
  const rs = raidersOf(level);
  const start = Math.min(...rs.map((r) => Math.hypot(r.x, r.z)));
  const loner = new ill.Vindicator(level);
  loner.finalizeSpawn('natural');
  const c = rs[0];
  loner.moveTo(c.x + 3, 64, c.z + 3, 0, 0);
  level.addEntity(loner);
  tick(level, 300);
  const end = Math.min(...rs.filter((r) => !r.removed).map((r) => Math.hypot(r.x, r.z)));
  check('they head for the village (PathfindToRaidGoal)', end < start - 15, `${start.toFixed(1)} → ${end.toFixed(1)}`);
  check('bringing along a raider they pass', loner.raid === raid && loner.wave === raid.groupsSpawned());
  const walker = new ill.Pillager(level);
  walker.finalizeSpawn('natural');
  walker.moveTo(3.5, 64, 3.5, 0, 0);
  level.addEntity(walker);
  tick(level, 21);
  check('one that wanders into the raided village joins it', walker.raid === raid);
  const before = raid.totalRaidersAlive();
  const far = rs.find((r) => !r.removed);
  far.moveTo(200.5, 64, 0.5, 0, 0);
  tick(level, 21);
  check('one 112 blocks off has left the raid', far.raid === null && raid.totalRaidersAlive() === before - 1);
}

// --- saving and loading
{
  const { level, player } = setup();
  const raid = raids.startRaid(level, player, [0, 64, 0], 3);
  tick(level, 305);
  const rs = raidersOf(level);
  rs[0].hurt(1000, 'generic', player);
  tick(level, 1);
  const data = JSON.parse(JSON.stringify(level.raids.save()));
  const saved = rs.slice(1).map((r) => spawner.saveEntity(r));
  const s2 = setup();
  s2.level.raids.load(data);
  const r2 = s2.level.raids.get(raid.id);
  check('a saved raid loads with its state', r2 && r2.raidOmenLevel === 3 && r2.groupsSpawned() === 1 && r2.isStarted() && r2.center().join() === raid.center().join() && Math.abs(r2.totalHealth - raid.totalHealth) < 1e-6);
  const back = saved.map((d) => spawner.loadEntity(d, s2.level)).filter(Boolean);
  for (const e of back) s2.level.addEntity(e);
  tick(s2.level, 2);
  check('its raiders find it again, the captain too', back.every((e) => e.raid === r2) && r2.totalRaidersAlive() === back.length && (r2.leader(1) === null || back.includes(r2.leader(1))), `${r2.totalRaidersAlive()} / ${back.length}`);
  check('their health isn\'t counted twice', Math.abs(r2.totalHealth - raid.totalHealth) < 1e-6, `${r2.totalHealth} vs ${raid.totalHealth}`);
  check('the hero is remembered', JSON.stringify(data).includes(player.uuid));
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
