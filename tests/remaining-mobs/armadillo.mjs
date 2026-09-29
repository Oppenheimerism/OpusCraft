// Headless checks for the armadillo (node tests/remaining-mobs/armadillo.mjs; remaining mobs, milestone 5): its numbers,
// items and creative tabs; where it lives and its spawn rules (the other animals' as they were); what scares it (a
// sprinting or riding player, anything undead, whatever hurt it; not a walking player, a spectator, anything out of
// reach) and how it rolls up, lands, peeks and unrolls (and rolls back up); blows (half, less half a heart, rolled up;
// a blow rolling it up) and fire (out, to run); water and leads; the brush and its scutes, shedding; food, breeding and
// its young; saving and /summon. Then wolf armour: its recipe, dyeing and washing, the anvil; put on, sheared off,
// mended; taking blows, cracking and breaking; what gets past it; its drop, saving, /summon and dispensers (and the
// brush's). The advancements; the sounds; the textures and the renderers (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/armadillo.ts', '/src/entity/wolf.ts', '/src/entity/wolfArmor.ts',
  '/src/entity/itemEntity.ts', '/src/game/interaction.ts', '/src/game/advancements.ts', '/src/game/commands.ts', '/src/core/rng.ts',
  '/src/render/armadilloRenderer.ts', '/src/render/wolfArmorLayer.ts', '/src/render/entityRenderer.ts', '/src/render/wolfModel.ts', '/src/textures/mobs.ts',
  '/src/textures/items.ts', '/src/audio/synth.ts', '/src/game/redstone/dispenseItems.ts', '/src/inventory/recipes.ts',
  '/src/item/dyedColor.ts', '/src/item/itemColors.ts', '/src/inventory/enchantMenus.ts', '/src/inventory/recipeBook.ts', '/src/entity/boat.ts',
  '/src/item/enchantHelper.ts', '/src/entity/living.ts', '/src/inventory/menus.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK } = M['world/block'];
const { ITEMS, ITEM_LIST, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const { Armadillo, hidesInShell, armadilloState } = M['entity/armadillo'];
const { Wolf } = M['entity/wolf'];
const WA = M['entity/wolfArmor'];
const { ItemEntity } = M['entity/itemEntity'];
const spawner = M['game/spawner'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const stack = (id, n = 1) => ItemStack.of(id, n);

/** flat `top` at y 63 on stone (they stand at 64) in `biome`, for x, z in [-48, 48); day, clear. The player's sprint is the test's to set */
function setup({ biome = B.savanna, top = 'grass_block' } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -3; cx < 3; cx++) for (let cz = -3; cz < 3; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(biome); world.chunks.set(c.key, c); }
  const st = S('stone'), t = S(top);
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, t);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'armadillos');
  const sounds = [], parts = [], events = [], bred = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = {
    blockBreak() {}, blockHit() {}, blockParticle() {}, spawn(k, x, y, z, dx, dy, dz) { parts.push({ k, x, y, z, dx, dy, dz, t: level.gameTime }); }, entityEffect() {}, poof() {}, dust() {}, emitAround() {},
    spell() {}, fallingDust() {},
  };
  level.onBred = (child, cause) => bred.push({ child, cause });
  const ge = level.gameEvent.bind(level);
  level.gameEvent = (e, x, y, z, ctx) => { events.push({ e, x, y, z, who: ctx?.entity }); ge(e, x, y, z, ctx); };
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.updateSkyBrightness();
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(30.5, 64, 30.5, 0, 0);
  player.gameMode = 'survival';
  // (whether it sprints: the test's say, not its (absent) input's)
  let sprint = false;
  Object.defineProperty(player, 'sprinting', { get: () => sprint, set: () => {}, configurable: true });
  const setSprint = (v) => { sprint = v; };
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, events, bred, setSprint };
}
/** an armadillo (or `type`) made as /summon makes it, standing (its first ticks on the ground done) */
function spawn(level, x, y, z, { type = 'armadillo', baby = false, settle = true } = {}) {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  if (baby) m.setAge(-24000);
  level.addEntity(m);
  if (settle) {
    const ai = m.serverAiStep;
    m.serverAiStep = () => {};
    for (let i = 0; i < 3; i++) m.tick();
    m.serverAiStep = ai;
  }
  return m;
}
/** ticks the level, the player held where it is */
const tick = (level, n) => {
  const p = level.player, [x, y, z] = [p.x, p.y, p.z];
  for (let i = 0; i < n; i++) {
    level.tick();
    p.moveTo(x, y, z, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    p.fallDistance = 0;
  }
};
/** ticks until `cond` (at most `max`), the ticks it took (max + 1 if it never came) */
const tickUntil = (level, cond, max) => {
  for (let i = 0; i <= max; i++) {
    if (cond()) return i;
    tick(level, 1);
  }
  return max + 1;
};
const newItems = (level, before) => level.entities.filter((e) => !before.has(e) && e.type === 'item' && !e.removed);
/** an Interaction for `player`: looking at (tx, ty, tz) from where it stands, a use */
function hands(level, player) {
  const ia = new M['game/interaction'].Interaction(level, player);
  const look = (tx, ty, tz) => {
    const dx = tx - player.x, dy = ty - (player.y + player.eyeHeight), dz = tz - player.z;
    const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    player.moveTo(player.x, player.y, player.z, yaw, pitch);
    ia.pick(player.x, player.y + player.eyeHeight, player.z, yaw, pitch);
  };
  const use = (tx, ty, tz) => {
    look(tx, ty, tz);
    ia.rightClickDelay = 0;
    ia.use(true, true);
  };
  return { ia, look, use };
}
/**
 * `player` beside `m`, holding `held` (survival unless `creative`), clicking it; what the advancements were told
 * (as game.ts tells them: the item as it was, the mob, the body armour it wears after)
 */
function useOn(level, player, m, held, { creative = false, advancements = null } = {}) {
  player.gameMode = creative ? 'creative' : 'survival';
  player.moveTo(m.x - 1.5, m.y, m.z, 0, 0);
  player.inventory.main[player.inventory.selected] = held;
  player.inventory.version++;
  const h = hands(level, player);
  h.ia.onInteractedWithEntity = (s, e) => {
    const armor = e.bodyArmor;
    advancements?.trigger('player_interacted_with_entity', { interacted: { item: s?.item.id ?? null, entity: e.type, variant: typeof e.variant === 'string' ? e.variant : undefined, bodyArmor: armor ? { item: armor.item.id, damage: armor.damage } : null } });
  };
  h.use(m.x, m.y + m.height * 0.5, m.z);
}
const heldOf = (player) => player.inventory.selectedItem;
const heard = (sounds, n) => sounds.filter((s) => s.n === n);

// ===========================================================================
// its numbers, its items
{
  const { level } = setup();
  const a = spawn(level, 0.5, 64, 0.5);
  check('an armadillo: 12 health, speed 0.14, 0.7 wide and 0.65 tall, its eyes 0.26 up', a.maxHealth === 12 && a.health === 12 && near(a.moveSpeedAttr, 0.14) && near(a.width, 0.7) && near(a.height, 0.65) && near(a.eyeHeight, 0.26));
  const b = spawn(level, 3.5, 64, 0.5, { baby: true });
  check('...a baby 0.6 of that (0.42 by 0.39)', near(b.width, 0.42) && near(b.height, 0.39) && near(b.eyeHeight, 0.156));
  const xs = new Set();
  for (let i = 0; i < 60; i++) xs.add(a.experienceReward());
  check('...it drops nothing, and 1 to 3 experience', a.lootTable().length === 0 && [...xs].sort().join() === '1,2,3');
  check('...its head turns 32 degrees from its body at most (vanilla getMaxHeadYRot)', a.maxHeadYRot() === 32);
  const tabOf = (id) => ITEMS.get(id)?.creativeTab;
  const inTab = (t) => ITEM_LIST.filter((i) => i.creativeTab === t).map((i) => i.id);
  const ing = inTab(tabOf('turtle_scute')), cmb = inTab('combat');
  check('its spawn egg, with the spawn eggs', tabOf('armadillo_spawn_egg') === 'spawn_eggs' && !!M['textures/items'].ITEM_TEXTURES.armadillo_spawn_egg);
  check('its scute, with the ingredients after the turtle scute', ing.indexOf('armadillo_scute') === ing.indexOf('turtle_scute') + 1 && ITEMS.get('armadillo_scute').maxStack === 64, ing.slice(ing.indexOf('turtle_scute'), ing.indexOf('turtle_scute') + 2).join());
  const wa = ITEMS.get('wolf_armor');
  check('wolf armour: one to a stack, 64 uses, with the combat items after the diamond horse armour', wa.maxStack === 1 && wa.maxDamage === 64 && cmb.indexOf('wolf_armor') === cmb.indexOf('diamond_horse_armor') + 1);
  check('...not a player\'s armour (no armour slot), nor enchantable', !wa.armor && !(wa.enchantability > 0));
}

// ===========================================================================
// where it lives
{
  const cre = (biome) => spawner.biomeSettings(B[biome]).creature;
  const pick = (biome) => cre(biome).find((d) => d.type === 'armadillo');
  const sav = ['savanna', 'savanna_plateau', 'windswept_savanna'].map(pick);
  check('armadillos in the savannas (10, in twos and threes), with the farm animals, horses and donkeys', sav.every((d) => d?.weight === 10 && d.min === 2 && d.max === 3) && cre('savanna').some((d) => d.type === 'horse') && cre('savanna').some((d) => d.type === 'cow'));
  const bad = ['badlands', 'eroded_badlands', 'wooded_badlands'].map((b) => spawner.biomeSettings(B[b]));
  check('...and the badlands (6, in ones and twos; few at the world\'s making: 0.03), the wooded badlands\' wolves too', bad.every((s) => s.creature.some((d) => d.type === 'armadillo' && d.weight === 6 && d.min === 1 && d.max === 2) && near(s.creatureProbability, 0.03) && s.monster.length > 0) && bad[2].creature.some((d) => d.type === 'wolf'), JSON.stringify(bad[0].creature));
  check('...not elsewhere (plains, desert)', !pick('plains') && !pick('desert'));
  const { level } = setup();
  const ns = new spawner.NaturalSpawner(level, 1);
  const tops = {
    grass_block: true, red_sand: true, coarse_dirt: true, terracotta: true, white_terracotta: true, yellow_terracotta: true, orange_terracotta: true, red_terracotta: true,
    brown_terracotta: true, light_gray_terracotta: true, sand: false, dirt: false, stone: false, blue_terracotta: false, podzol: false, mycelium: false,
  };
  const wrong = [];
  let x = -30;
  for (const [n, ok] of Object.entries(tops)) {
    level.setBlock(x, 63, 10, S(n));
    if (ns.checkSpawnRules('armadillo', x, 64, 10) !== ok) wrong.push(n);
    x += 2;
  }
  check('spawn rules: on grass, red sand, coarse dirt or the badlands\' terracotta (not sand, dirt, stone, blue terracotta...)', wrong.length === 0, wrong.join(' '));
  level.dayTime = 18000;
  level.updateSkyBrightness();
  const night = ns.checkSpawnRules('armadillo', -30, 64, 10);
  for (let xx = -1; xx <= 1; xx++) for (let z = 19; z <= 21; z++) for (let y = 64; y <= 66; y++) if (xx || z !== 20 || y === 66) level.setBlock(xx, y, z, S('stone'));
  check('...by the sky\'s light, day or night (raw brightness over 8), not in the dark', night && !ns.checkSpawnRules('armadillo', 0, 64, 20));
  level.setBlock(4, 63, 0, S('red_sand'));
  const animals = ['pig', 'cow', 'sheep', 'chicken', 'horse', 'donkey', 'mule', 'llama', 'mooshroom', 'panda'];
  const changed = animals.filter((t) => ns.checkSpawnRules(t, 4, 64, 0) || (t !== 'mooshroom' && !ns.checkSpawnRules(t, 0, 64, 0)));
  check('...the other animals\' as they were (on grass, not on red sand)', changed.length === 0, changed.join(' '));
  // new savanna chunks: some come with armadillos
  let groups = 0, n = 0, grown = true;
  for (let i = 0; i < 400 && groups < 4; i++) {
    const s2 = new spawner.NaturalSpawner(level, 7000 + i);
    const out = s2.spawnForNewChunk((i % 6) - 3, (Math.floor(i / 6) % 6) - 3);
    const as = out.filter((e) => e instanceof Armadillo);
    if (as.length) groups++;
    n += as.length;
    for (const e of out) {
      if (e instanceof Armadillo && e.isBaby()) grown = false;
      e.remove();
    }
  }
  check('...new savanna chunks come with a few armadillos, in twos and threes', groups >= 2 && n >= groups * 2, `${groups} groups, ${n} armadillos`);
}

// ===========================================================================
// what scares it, rolling up, peeking, rolling out
{
  const { level, player, sounds, events, setSprint } = setup();
  const a = spawn(level, 0.5, 64, 0.5);
  player.moveTo(4.5, 64, 0.5, 90, 0);
  tick(level, 60);
  check('a player walking about 4 blocks off: nothing', a.state === 'idle' && a.dangerTimeUntilExpiry() === 0);
  setSprint(true);
  sounds.length = 0;
  const t1 = tickUntil(level, () => a.state !== 'idle', 60);
  check('...sprinting: it rolls up, within the second or so its senses take', a.state === 'rolling' && t1 <= 26 && a.activity() === 'panic', `${t1} ticks`);
  check('...stopping, the roll heard, a vibration of its doing', heard(sounds, 'entity.armadillo.roll').length === 1 && events.some((e) => e.e === 'entity_action' && e.who === a) && a.navigation.isDone());
  const t2 = tickUntil(level, () => a.state === 'scared', 20);
  const land = heard(sounds, 'entity.armadillo.land')[0];
  check('...rolled up eleven ticks on, landing with a thump at its block\'s middle', a.state === 'scared' && t2 >= 9 && t2 <= 11 && !!land && near(land.x, Math.floor(a.x) + 0.5) && near(land.z, Math.floor(a.z) + 0.5), `${t2}`);
  check('drawn as a ball: rolling up after five ticks, rolled up, rolling out till four ticks from the end', !hidesInShell('rolling', 5) && hidesInShell('rolling', 6) && hidesInShell('scared', 0) && hidesInShell('unrolling', 25) && !hidesInShell('unrolling', 26) && !hidesInShell('idle', 0) && a.shouldHideInShell());
  const [x0, z0, yaw0] = [a.x, a.z, a.bodyYaw];
  sounds.length = 0;
  let peekedAt = -1;
  for (let i = 0; i < 480 && a.state === 'scared'; i++) {
    tick(level, 1);
    if (peekedAt < 0 && a.peeks > 0) peekedAt = i;
  }
  check('...the danger still about, it peeks out once in a while (7.5 to 22.5 s), heard, and stays rolled up', a.peeks >= 1 && peekedAt >= 140 && heard(sounds, 'entity.armadillo.peek').length === a.peeks && a.state === 'scared', `${a.peeks} peeks, first at ${peekedAt}`);
  check('...not moving, its body not turning, its head straight on', near(a.x, x0) && near(a.z, z0) && a.bodyYaw === yaw0 && near(a.headYaw, a.bodyYaw, 1e-3) && a.maxHeadYRot() === 0);
  setSprint(false);
  sounds.length = 0;
  const tu = tickUntil(level, () => a.state === 'unrolling', 80);
  check('...the danger gone: unrolling after 2.5 s (its sound), no ball any more 26 ticks on', a.state === 'unrolling' && tu >= 44 && tu <= 52 && heard(sounds, 'entity.armadillo.unroll_start').length === 1, `${tu}`);
  const ti = tickUntil(level, () => a.state === 'idle', 60);
  check('...and out 1.5 s after that (its sound)', a.state === 'idle' && ti >= 28 && ti <= 31 && heard(sounds, 'entity.armadillo.unroll_finish').length === 1 && a.activity() === 'idle', `${ti}`);
  // rolling back up while unrolling
  setSprint(true);
  tickUntil(level, () => a.state === 'scared', 60);
  setSprint(false);
  tickUntil(level, () => a.state === 'unrolling', 80);
  tick(level, 5);
  setSprint(true);
  const back = tickUntil(level, () => a.state === 'scared', 30);
  check('the danger back while it unrolls: rolled up again', a.state === 'scared' && back <= 25, `${back}`);
  setSprint(false);
  tickUntil(level, () => a.state === 'idle', 200);
  // a spectator, sprinting; or someone out of reach
  player.gameMode = 'spectator';
  setSprint(true);
  tick(level, 60);
  check('a spectator sprinting: nothing', a.state === 'idle');
  player.gameMode = 'survival';
  // (held where it is: it wanders)
  const hold = (n) => { const [x, z] = [a.x, a.z]; for (let i = 0; i < n; i++) { tick(level, 1); a.moveTo(x, 64, z, a.yaw, 0); } };
  player.moveTo(a.x + 8.5, 64, a.z, 90, 0);
  hold(60);
  const far = a.state === 'idle';
  player.moveTo(a.x + 2, 67.1, a.z, 90, 0);
  player.flying = true;
  hold(60);
  check('...nor someone sprinting 8.5 blocks off, or 3 up', far && a.state === 'idle', `${far} ${a.state}`);
  player.flying = false;
  setSprint(false);
}

// riding, the undead, whoever hurt it; blows; fire
{
  const { level, player, sounds, setSprint } = setup();
  const a = spawn(level, 0.5, 64, 0.5);
  const boat = new M['entity/boat'].Boat(level);
  boat.moveTo(4.5, 64, 0.5, 0, 0);
  level.addEntity(boat);
  player.moveTo(4.5, 64, 0.5, 0, 0);
  player.startRiding(boat, true);
  const tr = tickUntil(level, () => a.state !== 'idle', 60);
  check('a player riding by: it rolls up', a.state !== 'idle' && tr <= 30, `${tr}`);
  player.stopRiding();
  boat.remove();
  player.moveTo(30.5, 64, 30.5, 0, 0);
  tickUntil(level, () => a.state === 'idle', 200);
  const b = spawn(level, 10.5, 64, 10.5);
  const z = spawn(level, 13.5, 64, 10.5, { type: 'zombie' });
  z.serverAiStep = () => {};
  z.isSunBurnTick = () => false;
  const tz = tickUntil(level, () => b.state !== 'idle', 60);
  check('...a zombie near: it rolls up', b.state !== 'idle' && tz <= 30, `${tz}`);
  z.remove();
  // a blow from something living rolls it up; rolled up, a blow does half, less half a heart
  const c = spawn(level, -10.5, 64, -10.5);
  const pig = spawn(level, -8.5, 64, -10.5, { type: 'pig' });
  pig.serverAiStep = () => {};
  sounds.length = 0;
  c.hurt(2, 'fall', null, null);
  check('a fall: hurt (its squeak), not rolled up', c.health === 10 && c.state === 'idle' && heard(sounds, 'entity.armadillo.hurt').length === 1);
  tick(level, 20);
  c.invulnerableTime = 0;
  sounds.length = 0;
  c.hurt(1, 'mob', pig, pig);
  check('a blow from a pig: 1 hurt, rolled up at once, the danger remembered (4 s); heard as the shell\'s knock (vanilla: it\'s rolling by the time the hurt sound\'s picked)', c.health === 9 && c.state === 'rolling' && c.dangerTimeUntilExpiry() === 80 && heard(sounds, 'entity.armadillo.hurt_reduced').length === 1, `${c.health} ${c.state} ${c.dangerTimeUntilExpiry()} ${sounds.map((x) => x.n).join()}`);
  tick(level, 15);
  c.invulnerableTime = 0;
  sounds.length = 0;
  c.hurt(5, 'mob', pig, pig);
  check('...rolled up, another of 5 does 2 (its shell knocked, not its hurt)', c.health === 7 && heard(sounds, 'entity.armadillo.hurt_reduced').length === 1 && heard(sounds, 'entity.armadillo.hurt').length === 0, `${c.health}`);
  tick(level, 60);
  check('...the pig by it, the one that hurt it: still rolled up', c.state === 'scared');
  // fire brings it out, running
  c.invulnerableTime = 0;
  sounds.length = 0;
  c.hurt(1, 'lava', null, null);
  check('...lava: out at once (its sound)', c.state === 'idle' && heard(sounds, 'entity.armadillo.unroll_finish').length === 1);
  const tp = tickUntil(level, () => c.isPanicking, 30);
  // (vanilla too: in the tick its panic starts, with the pig that hurt it by, it may roll up once more, then its scare
  // sense (it can't stay rolled up running) has it straight out again)
  tick(level, 10);
  let rolled = false;
  const [px, pz] = [c.x, c.z];
  for (let i = 0; i < 30; i++) {
    tick(level, 1);
    if (c.state !== 'idle') rolled = true;
  }
  check('...and running, out of its shell (the pig by it or not)', tp <= 22 && !rolled && c.isPanicking && Math.hypot(c.x - px, c.z - pz) > 1, `${tp} ${rolled} ${Math.hypot(c.x - px, c.z - pz).toFixed(2)}`);
  pig.remove();
  setSprint(false);
}

// water, leads
{
  const { level, player, setSprint } = setup();
  const a = spawn(level, 0.5, 64, 0.5);
  a.setLeashedTo(player);
  player.moveTo(3.5, 64, 0.5, 0, 0);
  setSprint(true);
  tick(level, 60);
  check('on a lead: it doesn\'t roll up', a.state === 'idle' && a.dangerTimeUntilExpiry() === 0);
  a.dropLeash?.() ?? (a.leashHolder = null);
  const t = tickUntil(level, () => a.state === 'scared', 60);
  check('...let go: it does', a.state === 'scared', `${t}`);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) level.setBlock(x, 64, z, S('water'));
  a.moveTo(0.5, 64.1, 0.5, a.yaw, 0);
  const tw = tickUntil(level, () => a.state === 'idle', 20);
  check('...in the water: out again straight away (can\'t stay rolled up there)', a.state === 'idle' && tw <= 8, `${tw}`);
  tick(level, 40);
  check('...and not rolling up in it', a.state === 'idle');
  setSprint(false);
}

// ===========================================================================
// the brush, scutes
{
  const { level, player, sounds, events } = setup();
  const a = spawn(level, 0.5, 64, 0.5);
  const adv = new M['game/advancements'].PlayerAdvancements();
  const brushAdv = M['game/advancements'].ADVANCEMENTS.get('husbandry/brush_armadillo');
  let before = new Set(level.entities);
  useOn(level, player, a, stack('brush'), { advancements: adv });
  const got = newItems(level, before);
  check('a brush on a grown one: a scute comes off (its sound, a vibration), the brush worn 16', got.length === 1 && got[0].stack.item.id === 'armadillo_scute' && heldOf(player)?.damage === 16 && heard(sounds, 'entity.armadillo.brush').length === 1 && events.some((e) => e.e === 'entity_interact' && e.who === a));
  check('...Isn\'t It Scute? (under Husbandry)', adv.isDone(brushAdv) && brushAdv.parent === 'husbandry/root' && brushAdv.icon === 'armadillo_scute');
  before = new Set(level.entities);
  useOn(level, player, a, stack('brush'), { creative: true });
  check('...in creative, the brush unworn', newItems(level, before).length === 1 && heldOf(player)?.damage === 0);
  const b = spawn(level, 3.5, 64, 0.5, { baby: true });
  before = new Set(level.entities);
  const adv2 = new M['game/advancements'].PlayerAdvancements();
  useOn(level, player, b, stack('brush'), { advancements: adv2 });
  check('...on a baby: nothing (the brush unworn, no advancement)', newItems(level, before).length === 0 && heldOf(player)?.damage === 0 && !adv2.isDone(brushAdv));
  a.rollUp();
  before = new Set(level.entities);
  useOn(level, player, a, stack('brush'));
  check('...rolled up, it still gives one', newItems(level, before).length === 1);
  const worn = stack('brush');
  worn.damage = 50;
  sounds.length = 0;
  useOn(level, player, a, worn);
  check('...a brush with less than 16 uses left breaks doing it', !heldOf(player) && heard(sounds, 'entity.item.break').length === 1);
  // shedding
  const c = spawn(level, -4.5, 64, 0.5);
  check('it sheds a scute every 5 to 10 minutes', c.scuteTime >= 6000 && c.scuteTime < 12000, `${c.scuteTime}`);
  c.scuteTime = 2;
  sounds.length = 0;
  events.length = 0;
  before = new Set(level.entities);
  tick(level, 2);
  const shed = newItems(level, before).filter((e) => e.stack.item.id === 'armadillo_scute');
  const s = heard(sounds, 'entity.armadillo.scute_drop')[0];
  check('...when its time comes: a scute (its sound, pitched 0.8 to 1.2; a vibration), and the next time picked', shed.length === 1 && !!s && s.p >= 0.8 && s.p <= 1.2 && events.some((e) => e.e === 'entity_place' && e.who === c) && c.scuteTime >= 5999 && c.scuteTime < 12000);
  b.scuteTime = 2;
  before = new Set(level.entities);
  tick(level, 5);
  check('...not a baby (its count doesn\'t run)', newItems(level, before).length === 0 && b.scuteTime === 2);
}

// ===========================================================================
// food, breeding, the young; temptation
{
  const { level, player, sounds, bred } = setup();
  const a = spawn(level, 0.5, 64, 0.5), b = spawn(level, 2.5, 64, 0.5);
  check('its food: spider eyes', a.isFood(stack('spider_eye')) && !a.isFood(stack('wheat')));
  useOn(level, player, a, stack('spider_eye', 4));
  check('a spider eye to a grown one: in love (one eaten, its eating heard)', a.isInLove() && heldOf(player)?.count === 3 && heard(sounds, 'entity.armadillo.eat').length === 1);
  useOn(level, player, b, stack('spider_eye', 4));
  tick(level, 200);
  const babies = level.entities.filter((e) => e instanceof Armadillo && e.isBaby() && !e.removed);
  check('...two of them: a baby (the breeding trigger)', babies.length === 1 && bred.length === 1 && bred[0].cause === player);
  const kid = babies[0];
  for (const e of [a, b]) e.moveTo(e.x, 64, e.z + 8, 0, 0);
  kid.moveTo(-6.5, 64, -6.5, 0, 0);
  const age = kid.age;
  sounds.length = 0;
  useOn(level, player, kid, stack('spider_eye', 4));
  check('...a spider eye to a baby: it grows (its eating heard)', kid.age > age && heard(sounds, 'entity.armadillo.eat').length === 1, `${age} -> ${kid.age}`);
  const c = spawn(level, 6.5, 64, 0.5);
  c.rollUp();
  useOn(level, player, c, stack('spider_eye', 4));
  check('...rolled up: it takes nothing', !c.isInLove() && heldOf(player)?.count === 4 && !c.canFallInLove());
  // temptation
  const d = spawn(level, -10.5, 64, 0.5);
  player.moveTo(-3.5, 64, 0.5, 90, 0);
  player.inventory.main[player.inventory.selected] = stack('spider_eye');
  player.inventory.version++;
  const d0 = Math.hypot(d.x - player.x, d.z - player.z);
  tick(level, 200);
  const d1 = Math.hypot(d.x - player.x, d.z - player.z);
  check('a player holding a spider eye 7 blocks off: it comes to 2 blocks of them', d.temptingPlayer === player && d1 < 3 && d1 < d0, `${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
}

// ===========================================================================
// saving, /summon
{
  const { level, player } = setup();
  const a = spawn(level, 0.5, 64, 0.5);
  a.rollUp();
  a.switchToState('scared');
  a.scuteTime = 777;
  const s = JSON.parse(JSON.stringify(a.save()));
  const c = new Armadillo(level);
  c.load(s);
  check('saved: its state and scute_time', c.state === 'scared' && c.scuteTime === 777 && s.data.state === 'scared' && s.data.scute_time === 777, JSON.stringify(s.data));
  check('...an unknown state is idle (vanilla ArmadilloState.fromName)', armadilloState('bogus') === 'idle' && armadilloState('unrolling') === 'unrolling');
  const cmd = M['game/commands'];
  const game = { meta: { allowCommands: true }, chat() {}, player, playerName: 'Tester', level, world: level.world, sound: { play() {} }, applyGameRules() {}, teleport() {}, changeDimension() {} };
  const at = (x) => level.entities.find((e) => e instanceof Armadillo && Math.abs(e.x - x) < 0.01);
  cmd.executeCommand(game, 'summon armadillo 10.5 64 10.5 {state:"scared",scute_time:1234}');
  check('/summon armadillo {state:"scared",scute_time:1234}', at(10.5)?.state === 'scared' && at(10.5).scuteTime === 1234);
  cmd.executeCommand(game, 'summon armadillo 12.5 64 10.5 {Age:-24000}');
  check('...{Age:-24000}: a baby', at(12.5)?.isBaby() && near(at(12.5).width, 0.42));
  cmd.executeCommand(game, 'summon armadillo 14.5 64 10.5 {state:"purple"}');
  check('...an unknown state: idle', at(14.5)?.state === 'idle');
}

// ===========================================================================
// wolf armour: the recipe, dyeing, the cauldron, the anvil
{
  const R = M['inventory/recipes'];
  const X = 'armadillo_scute';
  const g = (rows) => rows.flatMap((r) => [...r].map((c) => (c === 'X' ? stack(X) : null)));
  const r = R.findRecipe(g(['X  ', 'XXX', 'X X']), 3, 3);
  check('six scutes in a dog coat\'s shape: wolf armour (combat equipment in the recipe book)', r?.result === 'wolf_armor' && (r.count ?? 1) === 1 && M['inventory/recipeBook'].bookCategoryOf?.('wolf_armor', r) !== 'crafting_misc');
  check('...mirrored too; not five', R.findRecipe(g(['  X', 'XXX', 'X X']), 3, 3)?.result === 'wolf_armor' && R.findRecipe(g(['X  ', 'XX ', 'X X']), 3, 3)?.result !== 'wolf_armor');
  const dyed = M['inventory/menus'].armorDye([stack('wolf_armor'), stack('red_dye'), null, null, null, null, null, null, null]);
  check('dyed in the crafting grid (as leather is)', dyed?.item.id === 'wolf_armor' && typeof dyed.tag?.dyedColor === 'number');
  const IC = M['item/itemColors'];
  const layers = IC.itemLayers(ITEMS.get('wolf_armor'));
  check('...its item: the scutes, and over them the dye (vanilla layer1, wolf_armor_dyed), not drawn undyed', layers?.layers.join() === 'wolf_armor,wolf_armor_dyed' && layers.tinted === 1 && IC.layerTint(stack('wolf_armor')) < 0 && IC.layerTint(dyed) === dyed.tag.dyedColor);
  const IT = M['textures/items'].ITEM_TEXTURES;
  check('...both sprites there, and the scute\'s', !!IT.wolf_armor && !!IT.wolf_armor_dyed && !!IT.armadillo_scute);
  const atlas = (await import('node:fs')).readFileSync('src/render/particleAtlas.ts', 'utf8');
  check('...the scute\'s and the armour\'s sprites in the particle atlas (the cracks\' chips, the broken pieces)', /\['armadillo_scute', 'wolf_armor'\]/.test(atlas));
  const EM = M['inventory/enchantMenus'];
  check('mended on an anvil with scutes (not leather)', EM.isValidRepairItem(ITEMS.get('wolf_armor'), stack('armadillo_scute')) && !EM.isValidRepairItem(ITEMS.get('wolf_armor'), stack('leather')));
  // washed in a cauldron
  const { level, player } = setup();
  level.setBlock(0, 64, 2, M['world/block'].getBlock('water_cauldron').defaultState);
  const wc = M['world/block'].getBlock('water_cauldron');
  level.setBlock(0, 64, 2, wc.with(wc.defaultState, 'level', 3));
  player.moveTo(0.5, 64, 0.5, 0, 0);
  player.inventory.main[player.inventory.selected] = dyed.copy();
  player.inventory.version++;
  hands(level, player).use(0.5, 64.9, 2.5);
  check('...washed in a cauldron: undyed, a level of water gone', heldOf(player)?.item.id === 'wolf_armor' && heldOf(player).tag?.dyedColor === undefined && wc.get(level.getState(0, 64, 2), 'level') === 2);
}

// wolf armour on a wolf: on, off, mended; the advancements
{
  const { level, player, sounds, events } = setup();
  const ADV = M['game/advancements'];
  const adv = new ADV.PlayerAdvancements();
  const w = spawn(level, 0.5, 64, 0.5, { type: 'wolf' });
  w.tameBy(player);
  w.serverAiStep = () => {};
  const other = new M['entity/player'].Player(level);
  other.moveTo(-20.5, 64, -20.5, 0, 0);
  level.addEntity(other);
  useOn(level, other, w, stack('wolf_armor'));
  other.moveTo(-20.5, 64, -20.5, 0, 0);
  check('wolf armour: not from someone else\'s hand', !w.bodyArmor && heldOf(other)?.item.id === 'wolf_armor');
  const pup = spawn(level, 6.5, 64, 0.5, { type: 'wolf', baby: true });
  pup.tameBy(player);
  pup.serverAiStep = () => {};
  useOn(level, player, pup, stack('wolf_armor'));
  check('...not on a pup', !pup.bodyArmor);
  const wild = spawn(level, 10.5, 64, 0.5, { type: 'wolf' });
  wild.serverAiStep = () => {};
  useOn(level, player, wild, stack('wolf_armor'));
  check('...not on a wild wolf', !wild.bodyArmor);
  sounds.length = 0;
  events.length = 0;
  const armorBefore = w.armorValue();
  useOn(level, player, w, stack('wolf_armor'));
  check('...its owner\'s, on a grown one: on it (the stack spent, its equip sound, an equip vibration)', w.bodyArmor?.item.id === 'wolf_armor' && !heldOf(player) && heard(sounds, 'item.armor.equip_wolf').length === 1 && events.some((e) => e.e === 'equip' && e.who === w) && w.persistenceRequired);
  check('...11 points of armour', w.armorValue() === armorBefore + 11);
  useOn(level, player, w, stack('wolf_armor'));
  check('...one at a time (a second not taken)', heldOf(player)?.count === 1);
  const w2 = spawn(level, -6.5, 64, 0.5, { type: 'wolf' });
  w2.tameBy(player);
  w2.serverAiStep = () => {};
  useOn(level, player, w2, stack('wolf_armor'), { creative: true });
  check('...in creative, not spent', !!w2.bodyArmor && heldOf(player)?.count === 1);
  // mending: the owner's scute on a sitting wolf's worn armour
  w.bodyArmor.damage = 20;
  w.orderedToSit = false;
  w.inSittingPose = false;
  useOn(level, player, w, stack('armadillo_scute', 4));
  check('a scute on the wolf standing: not mended', w.bodyArmor.damage === 20);
  w.orderedToSit = true;
  w.inSittingPose = true;
  sounds.length = 0;
  useOn(level, player, w, stack('armadillo_scute', 4), { advancements: adv });
  check('...sitting: an eighth mended (8), the scute spent, its sound', w.bodyArmor.damage === 12 && heldOf(player)?.count === 3 && heard(sounds, 'item.wolf_armor.repair').length === 1);
  const good = ADV.ADVANCEMENTS.get('husbandry/repair_wolf_armor');
  check('...not as good as new yet: no Good as New', !adv.isDone(good));
  useOn(level, player, w, stack('armadillo_scute', 4), { creative: true, advancements: adv });
  check('...in creative, the scute spent all the same (vanilla shrink)', w.bodyArmor.damage === 4 && heldOf(player)?.count === 3);
  useOn(level, player, w, stack('armadillo_scute', 4), { advancements: adv });
  check('...mended to new: Good as New', w.bodyArmor.damage === 0 && adv.isDone(good) && good.parent === 'husbandry/remove_wolf_armor');
  useOn(level, player, w, stack('armadillo_scute', 4));
  check('...no scute taken for armour that isn\'t worn', heldOf(player)?.count === 4);
  // shearing it off
  w.bodyArmor.damage = 9;
  const shear = ADV.ADVANCEMENTS.get('husbandry/remove_wolf_armor');
  useOn(level, other, w, stack('shears'), { advancements: adv });
  other.moveTo(-20.5, 64, -20.5, 0, 0);
  check('shears: not in someone else\'s hand', !!w.bodyArmor && !adv.isDone(shear));
  sounds.length = 0;
  let before = new Set(level.entities);
  useOn(level, player, w, stack('shears'), { advancements: adv });
  const off = newItems(level, before);
  check('...the owner\'s: off it, dropped as it was (9 worn), the shears worn one, its sound; Shear Brilliance', !w.bodyArmor && off.length === 1 && off[0].stack.item.id === 'wolf_armor' && off[0].stack.damage === 9 && heldOf(player)?.damage === 1 && heard(sounds, 'item.armor.unequip_wolf').length === 1 && adv.isDone(shear) && shear.parent === 'husbandry/tame_an_animal');
  const cursed = stack('wolf_armor');
  M['item/enchantHelper'].setEnchantment?.(cursed, 'binding_curse', 1) ?? (cursed.tag = { ...(cursed.tag ?? {}), enchantments: { binding_curse: 1 } });
  w.setBodyArmorItem(cursed);
  useOn(level, player, w, stack('shears'));
  const kept = !!w.bodyArmor;
  useOn(level, player, w, stack('shears'), { creative: true });
  check('...cursed with binding: it stays on (in creative, it comes off)', kept && !w.bodyArmor, `${M['item/enchantHelper'].hasBinding(cursed)}`);
  // the sit toggle doesn't count as a use of what's in hand (vanilla SUCCESS_NO_ITEM_USED)
  const adv3 = new ADV.PlayerAdvancements();
  w.orderedToSit = false;
  useOn(level, player, w, stack('shears'), { advancements: adv3 });
  check('...shears on it with none on: it sits, and that\'s no Shear Brilliance', w.orderedToSit && !adv3.isDone(shear));
}

// wolf armour taking blows: wear, cracks, breaking; what gets past it; its drop; saving; /summon
{
  const { level, player, sounds, parts } = setup();
  const w = spawn(level, 0.5, 64, 0.5, { type: 'wolf' });
  w.tameBy(player);
  w.serverAiStep = () => {};
  w.setBodyArmorItem(stack('wolf_armor'));
  const h = w.health;
  sounds.length = 0;
  w.hurt(3.5, 'mob', null, null);
  check('a blow of 3.5 on an armoured wolf: the armour takes it (4 wear), the wolf nothing, the armour\'s knock heard (not its yelp)', w.health === h && w.bodyArmor.damage === 4 && heard(sounds, 'item.wolf_armor.damage').length === 1 && heard(sounds, 'entity.wolf.hurt').length === 0);
  check('...60 uses of 64 left (under 95%): cracked a little, a crack heard and 20 chips of scute', WA.wolfArmorCrackiness(w.bodyArmor) === 'low' && heard(sounds, 'item.wolf_armor.crack').length === 1 && parts.filter((p) => p.k === 'item_armadillo_scute').length === 20);
  const crackAt = (dmg) => { const s = stack('wolf_armor'); s.damage = dmg; return WA.wolfArmorCrackiness(s); };
  check('its cracks by what\'s left: none to 95%, a little to 69%, more to 32%, badly below', crackAt(3) === 'none' && crackAt(4) === 'low' && crackAt(19) === 'low' && crackAt(20) === 'medium' && crackAt(43) === 'medium' && crackAt(44) === 'high' && crackAt(63) === 'high');
  sounds.length = 0;
  w.invulnerableTime = 0;
  w.hurt(1, 'mob', null, null);
  check('...no crack when it cracks no further', heard(sounds, 'item.wolf_armor.crack').length === 0 && w.bodyArmor.damage === 5);
  // what gets past it
  const bypass = ['drown', 'inWall', 'cramming', 'dryOut', 'freeze', 'starve', 'magic', 'indirectMagic', 'wither', 'thorns', 'void', 'genericKill', 'outsideBorder'];
  const held = ['mob', 'player', 'arrow', 'explosion', 'trident', 'sting', 'fall', 'lava', 'inFire', 'onFire', 'campfire', 'cactus', 'hotFloor', 'lightningBolt', 'sweetBerryBush', 'generic', 'sonicBoom'];
  check('what gets past it (vanilla #bypasses_wolf_armor: drowning, suffocating, cramming, drying out, freezing, starving, magic, the wither, thorns, the void, /kill, the border), what doesn\'t (blows, arrows, blasts, falls, fire, lava, cactus, lightning...)', bypass.every((s) => WA.bypassesWolfArmor(s)) && held.every((s) => !WA.bypassesWolfArmor(s)), bypass.filter((s) => !WA.bypassesWolfArmor(s)).concat(held.filter((s) => WA.bypassesWolfArmor(s))).join());
  w.invulnerableTime = 0;
  const h2 = w.health;
  sounds.length = 0;
  w.hurt(4, 'lava', null, null);
  check('...lava: the armour takes it (4 wear), the wolf unburnt, the armour\'s knock heard (not its yelp)', w.health === h2 && w.bodyArmor.damage === 9 && heard(sounds, 'item.wolf_armor.damage').length === 1 && heard(sounds, 'entity.wolf.hurt').length === 0);
  w.invulnerableTime = 0;
  sounds.length = 0;
  w.hurt(3, 'drown', null, null);
  check('...drowning: past it, the wolf takes it all (no armour counts for it), the armour untouched, its yelp', near(h2 - w.health, 3, 1e-3) && w.bodyArmor.damage === 9 && heard(sounds, 'entity.wolf.hurt').length === 1 && heard(sounds, 'item.wolf_armor.damage').length === 0);
  w.invulnerableTime = 0;
  const ht = w.health;
  w.hurt(3, 'thorns', null, null);
  const expect = 3 * (1 - Math.min(20, Math.max(11 - 3 / 2, 11 * 0.2)) / 25);
  check('...thorns: past it too, the armour\'s 11 points taking some off what the wolf takes', near(ht - w.health, expect, 1e-3) && w.bodyArmor.damage === 9, `${(ht - w.health).toFixed(3)} vs ${expect.toFixed(3)}`);
  // breaking
  w.bodyArmor.damage = 62;
  w.invulnerableTime = 0;
  sounds.length = 0;
  parts.length = 0;
  const h3 = w.health;
  w.hurt(2.5, 'mob', null, null);
  check('worn through: it breaks (its sound, five pieces of it, a last crack), gone from the wolf, the wolf unhurt', !w.bodyArmor && heard(sounds, 'item.wolf_armor.break').length === 1 && parts.filter((p) => p.k === 'item_wolf_armor').length === 5 && heard(sounds, 'item.wolf_armor.crack').length === 1 && w.health === h3);
  // saving
  const worn = stack('wolf_armor');
  worn.damage = 30;
  worn.tag = { ...(worn.tag ?? {}), dyedColor: 0x3355ff };
  w.setBodyArmorItem(worn);
  const saved = JSON.parse(JSON.stringify(w.save()));
  const w2 = new Wolf(level);
  w2.load(saved);
  check('saved with the wolf (body_armor_item): its wear and dye', w2.bodyArmor?.item.id === 'wolf_armor' && w2.bodyArmor.damage === 30 && w2.bodyArmor.tag?.dyedColor === 0x3355ff && w2.armorValue() >= 11);
  const bare = new Wolf(level);
  bare.load(JSON.parse(JSON.stringify(spawn(level, 5.5, 64, 5.5, { type: 'wolf' }).save())));
  check('...none, none', bare.bodyArmor === null);
  // its drop
  const before = new Set(level.entities);
  w.invulnerableTime = 0;
  w.hurt(1000, 'magic', null, null);
  tick(level, 25);
  const dropped = newItems(level, before).filter((e) => e.stack.item.id === 'wolf_armor');
  check('the wolf dead: its armour drops as it was', dropped.length === 1 && dropped[0].stack.damage === 30 && dropped[0].stack.tag?.dyedColor === 0x3355ff);
  // /summon
  const cmd = M['game/commands'];
  const game = { meta: { allowCommands: true }, chat() {}, player, playerName: 'Tester', level, world: level.world, sound: { play() {} }, applyGameRules() {}, teleport() {}, changeDimension() {} };
  cmd.executeCommand(game, 'summon wolf 12.5 64 12.5 {body_armor_item:{id:"minecraft:wolf_armor",count:1}}');
  const sw = level.entities.find((e) => e instanceof Wolf && near(e.x, 12.5, 0.01));
  check('/summon wolf {body_armor_item:{id:"minecraft:wolf_armor",count:1}}: in it', sw?.bodyArmor?.item.id === 'wolf_armor');
}

// dispensers: wolf armour, the brush
{
  const { level, player } = setup();
  const D = M['game/redstone/dispenseItems'];
  const src = (z) => ({ level, x: 0, y: 64, z, facing: 3, be: { addItem: () => -1 }, success: true });
  level.setBlock(0, 64, 1, S('dispenser'));
  const w = spawn(level, 0.5, 64, 2.5, { type: 'wolf' });
  w.serverAiStep = () => {};
  let s1 = src(1), before = new Set(level.entities);
  let left = D.dispenseBehaviorFor(stack('wolf_armor'))(s1, stack('wolf_armor'));
  check('a dispenser\'s wolf armour: not onto a wild wolf (thrown out instead)', !w.bodyArmor && newItems(level, before).length === 1);
  w.tameBy(player);
  s1 = src(1);
  left = D.dispenseBehaviorFor(stack('wolf_armor'))(s1, stack('wolf_armor'));
  check('...onto a tame one', w.bodyArmor?.item.id === 'wolf_armor' && (!left || left.count === 0) && w.persistenceRequired);
  level.setBlock(0, 64, 11, S('dispenser'));
  const a = spawn(level, 0.5, 64, 12.5);
  a.serverAiStep = () => {};
  const s2 = src(11);
  before = new Set(level.entities);
  const brush = D.dispenseBehaviorFor(stack('brush'))(s2, stack('brush'));
  check('a dispenser\'s brush brushes a scute off an armadillo in front (worn 16)', newItems(level, before).some((e) => e.stack.item.id === 'armadillo_scute') && brush?.damage === 16 && s2.success);
  a.remove();
  const s3 = src(11);
  const brush2 = D.dispenseBehaviorFor(stack('brush'))(s3, stack('brush'));
  check('...none there: it fails, the brush kept', !s3.success && brush2?.damage === 0);
}

// ===========================================================================
// the sounds
{
  const SND = M['audio/synth'].SOUNDS;
  const want = {
    'entity.armadillo.ambient': 6, 'entity.armadillo.brush': 3, 'entity.armadillo.death': 2, 'entity.armadillo.eat': 4, 'entity.armadillo.hurt': 4, 'entity.armadillo.hurt_reduced': 4,
    'entity.armadillo.land': 3, 'entity.armadillo.peek': 3, 'entity.armadillo.roll': 4, 'entity.armadillo.scute_drop': 3, 'entity.armadillo.step': 5, 'entity.armadillo.unroll_finish': 3,
    'entity.armadillo.unroll_start': 3, 'item.armor.equip_wolf': 3, 'item.armor.unequip_wolf': 2, 'item.wolf_armor.break': 2, 'item.wolf_armor.crack': 3, 'item.wolf_armor.damage': 4,
    'item.wolf_armor.repair': 3,
  };
  const bad = [];
  let takes = 0;
  for (const [k, n] of Object.entries(want)) {
    const s = SND[k];
    if (!s) { bad.push(`${k} missing`); continue; }
    if (s.variants !== n) bad.push(`${k} has ${s.variants} takes`);
    for (let i = 0; i < s.variants; i++) {
      const buf = s.generate(i, 22050);
      let pk = 0;
      for (const v of buf) if (!Number.isFinite(v)) { pk = NaN; break; } else pk = Math.max(pk, Math.abs(v));
      if (!(pk > 0.3 && pk <= 1) || buf.length < 22050 * 0.03 || buf.length > 22050 * 1.5) bad.push(`${k}#${i} peak ${pk} length ${buf.length}`);
      takes++;
    }
  }
  check(`the armadillo's sounds and wolf armour's (${takes} takes in all)`, bad.length === 0, bad.join(', '));
  const { level } = setup();
  const a = spawn(level, 0.5, 64, 0.5);
  const quiet = a.ambientSound() === 'entity.armadillo.ambient' && a.hurtSound() === 'entity.armadillo.hurt' && a.deathSound() === 'entity.armadillo.death' && a.stepSound() === 'entity.armadillo.step';
  a.rollUp();
  check('...its voice; rolled up, no ambient sound, its hurt the shell\'s knock', quiet && a.ambientSound() === null && a.hurtSound() === 'entity.armadillo.hurt_reduced');
}

// ===========================================================================
// the textures, the renderers
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const t = MT.armadillo?.();
  const alpha = (x, y) => t.data[(y * t.w + x) * 4 + 3];
  const opaque = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!alpha(x, y)) return false; return true; };
  const avg = (x0, y0, w, h) => { let r = 0, g = 0, b = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * 64 + x) * 4; r += t.data[i]; g += t.data[i + 1]; b += t.data[i + 2]; } const n = w * h; return [r / n, g / n, b / n]; };
  const shell = avg(12, 20, 8, 12), skin = avg(20, 40, 8, 12);
  check('its skin: 64x64 on ArmadilloModel\'s layout: the ball, the shell\'s top and sides, the head, the legs, the tail painted', t?.w === 64 && t.h === 64 && opaque(0, 10, 40, 10) && opaque(10, 0, 20, 10) && opaque(12, 20, 8, 12) && opaque(43, 17, 10, 5) && opaque(42, 33, 8, 3) && opaque(51, 45, 8, 3) && opaque(44, 54, 4, 6));
  check('...the shell open underneath (the skin shows there), dusty rose over pale pink skin', !alpha(20, 20) && !alpha(27, 31) && opaque(20, 40, 8, 12) && shell[0] > shell[1] && shell[0] > shell[2] && skin[0] > shell[0] && skin[1] > shell[1], `${shell.map((v) => v.toFixed(0))} ${skin.map((v) => v.toFixed(0))}`);
  const armorTex = ['wolf_armor', 'wolf_armor_overlay', 'wolf_armor_crackiness_low', 'wolf_armor_crackiness_medium', 'wolf_armor_crackiness_high'].map((n) => MT[n]?.());
  const count = (x) => { let n = 0; for (let i = 3; i < x.data.length; i += 4) if (x.data[i]) n++; return n; };
  const [base, over, lo, mid, hi] = armorTex;
  const inside = (x, img) => { for (let i = 3; i < x.data.length; i += 4) if (x.data[i] && !img.data[i]) return false; return true; };
  check('wolf armour\'s textures: 64x32 (the wolf\'s layout), its head and tail bare; the dye overlay within the armour; more cracks at each level', armorTex.every((x) => x?.w === 64 && x.h === 32) && !base.data[(2 * 64 + 2) * 4 + 3] && count(base) > 200 && inside(over, base) && count(over) > 100 && count(lo) < count(mid) && count(mid) < count(hi) && inside(hi, base), `${count(base)} ${count(over)} ${count(lo)} ${count(mid)} ${count(hi)}`);
  // the renderer, through stand-ins
  const RR = M['render/armadilloRenderer'];
  const { level } = setup();
  const a = spawn(level, 0.5, 64, 0.5);
  const A = { limbSwing: 0, limbAmount: 0, age: 100, headYaw: 20, headPitch: 0 };
  const drawn = [], scales = [];
  let quads = 0;
  const batch = { quad() { quads++; }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const kit = {
    pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: (e, dx, dy, dz, p, flip, scale) => { pose.reset(); if (scale) { scales.push(true); scale(pose); } else scales.push(false); return A; }, overlay() {},
    drawBody: (b, e, d, tex) => { drawn.push(tex.n); d.root.render(b, pose, d.texW, d.texH); },
    drawModel: () => {}, state: (tx, extra) => ({ texture: tx, ...extra }), attackAnim: () => 0,
  };
  const rend = new RR.ArmadilloRenderers(kit);
  const cow = spawn(level, 4.5, 64, 0.5, { type: 'cow', settle: false });
  check('drawn in its own skin (a cow not)', rend.render(batch, a, 0, 0, 0, 0.5) && !rend.render(batch, cow, 0, 0, 0, 0.5) && drawn.join() === 'armadillo' && quads > 0);
  const model = RR.armadilloModel();
  RR.animateArmadillo(model.root, a, 0, 0, 20, 0, 0.5);
  const body = model.root.child('body');
  const out1 = body.child('body_cubes').visible && !model.root.child('cube').visible && model.root.child('right_hind_leg').visible && body.child('tail').visible && near(body.child('head').yRot, (20 * Math.PI) / 180, 1e-6);
  a.rollUp();
  a.switchToState('scared');
  a.anim.inStateTicks = 3;
  RR.animateArmadillo(model.root, a, 0, 0, 20, 0, 0.5);
  const inBall = !body.child('body_cubes').visible && model.root.child('cube').visible && !model.root.child('right_hind_leg').visible && !body.child('tail').visible && body.child('head').visible && model.root.child('right_front_leg').visible;
  check('...out: its body, legs and tail, the head turned where it looks; rolled up: the ball, its head and front legs (inside it) and nothing else', out1 && inBall);
  check('...its head turned no further than 32.5 degrees, up 22.5 or down 25', (() => { a.switchToState('idle'); RR.animateArmadillo(model.root, a, 0, 0, 80, -60, 0); const hd = body.child('head'); return near(hd.yRot, (32.5 * Math.PI) / 180, 1e-6) && near(hd.xRot, (-22.5 * Math.PI) / 180, 1e-6); })());
  const kid = spawn(level, 8.5, 64, 0.5, { baby: true });
  scales.length = 0;
  rend.render(batch, kid, 0, 0, 0, 0.5);
  check('...a baby drawn whole at 0.6 (at its feet)', scales[0] === true);
  check('its shadow: 0.4 (a baby\'s half)', RR.ARMADILLO_SHADOW_RADII.armadillo === 0.4);
  // the animations: rolling up 0.5 s, peeking 2.5 s, rolling out 1.5 s (vanilla ArmadilloState's animation lengths)
  check('...its moves as long as vanilla\'s states have them: rolling up 0.5 s, peeking 2.5 s, rolling out 1.5 s; the walk looping', RR.ARMADILLO_ROLL_UP.length === 0.5 && RR.ARMADILLO_PEEK.length === 2.5 && RR.ARMADILLO_ROLL_OUT.length === 1.5 && RR.ARMADILLO_WALK.looping && !RR.ARMADILLO_PEEK.looping);
  // the wolf armour layer, through stand-ins
  const WL = M['render/wolfArmorLayer'];
  const WM = M['render/wolfModel'];
  const passes = [];
  let cur = null;
  const kit2 = {
    ...kit, tex: (n) => (MT[n] ? { n } : null),
    state: (tx, extra) => ({ texture: tx, ...extra }),
    drawModel: (b, d, baby, r = 1, g = 1, bl = 1) => passes.push({ tex: cur.texture.n, blend: !!cur.blend, rgb: [r, g, bl], inflated: d.root.child('body').cubes?.[0]?.inflate }),
  };
  const batch2 = { ...batch, begin(s) { cur = s; }, setOverlay(...o) { passes.push({ overlay: o }); } };
  const layer = new WL.WolfArmorLayer(kit2);
  const w = spawn(level, 12.5, 64, 0.5, { type: 'wolf' });
  const parent = WM.wolfModel();
  layer.render(batch2, w, parent, false);
  check('the wolf armour layer: nothing on a wolf without it', passes.length === 0);
  w.bodyArmor = stack('wolf_armor');
  layer.render(batch2, w, parent, false);
  const p1 = passes.filter((x) => x.tex).map((x) => x.tex);
  check('...undyed and unworn: the armour alone, on the wolf\'s model a fifth of a pixel bigger, no hurt flash', p1.join() === 'wolf_armor' && passes.some((x) => x.overlay?.every((v) => v === 0)) && passes.find((x) => x.tex)?.inflated === 0.2, p1.join());
  passes.length = 0;
  w.bodyArmor.tag = { dyedColor: 0xff0000 };
  w.bodyArmor.damage = 50;
  layer.render(batch2, w, parent, false);
  const p2 = passes.filter((x) => x.tex);
  check('...dyed red and badly worn: the armour, its overlay in red, then its worst cracks see-through', p2.map((x) => x.tex).join() === 'wolf_armor,wolf_armor_overlay,wolf_armor_crackiness_high' && p2[1].rgb.join() === '1,0,0' && p2[2].blend && !p2[0].blend, p2.map((x) => x.tex).join());
}

close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
