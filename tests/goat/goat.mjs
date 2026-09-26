// Headless checks for M8 (node tests/goat/goat.mjs): goats — their attributes and size (and a long jump's), kids,
// screaming goats and one-horned ones, spawning in the peaks and slopes, wheat (tempting, feeding, breeding, a kid's
// screams), panicking, the long jump onto a ledge it can't walk to (and none where it can walk anywhere), the ram
// (the start four to seven blocks off, the head lowered, the charge, the knockback, a shield, creative players, other
// goats, no anger), horns snapping on stone and logs (not dirt) as goat horns with the goat's own call, milking, the
// fall, saving, the goat horn (its calls, the cooldown, the pose, the creative tab, the outposts' loot), and the
// sounds, texture, model and renderer (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/goat.ts', '/src/game/goatHorn.ts',
  '/src/game/itemBehavior.ts', '/src/entity/shield.ts', '/src/item/hoverText.ts', '/src/game/loot.ts', '/src/game/outposts.ts',
  '/src/render/goatRenderer.ts', '/src/render/entityRenderer.ts', '/src/render/model.ts', '/src/render/playerPose.ts',
  '/src/textures/mobs.ts', '/src/textures/items.ts', '/src/audio/synth.ts', '/src/core/rng.ts', '/src/entity/boat.ts', '/src/game/advancements.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S } = M['world/block'];
const { ITEMS, ITEM_LIST, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const G = M['entity/goat'], H = M['game/goatHorn'];
const spawner = M['game/spawner'];
const { Goat } = G;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** a mountain top: stone from y 58 to 62 under a top of `ground` at 63 (so they stand at 64), for x, z in [-48, 48) */
function setup({ biome = B.frozen_peaks, ground = 'stone' } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(biome); world.chunks.set(c.key, c); }
  const st = S('stone'), top = S(ground);
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, top);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'goats');
  const sounds = [], parts = [], triggers = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z, t: level.gameTime }); }, entityEffect() {} };
  level.onPlayerTrigger = (p, type, payload) => triggers.push({ type, payload });
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(30.5, 64, 30.5, 0, 0);
  // (creative, so that no goat rams it unless a check wants it to)
  player.gameMode = 'creative';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, triggers };
}
const put = (world, x, y, z, n) => world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, S(n));
/** a goat (or `type`), neither screaming nor one-horned, its long jump and ram (unless `ready`) far off */
const spawn = (level, x, y, z, { type = 'goat', ready = false } = {}) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  if (m instanceof Goat) {
    m.screaming = false;
    m.addHorns();
    if (!ready) m.ramCooldown = m.longJumpCooldown = 1e6;
  }
  level.addEntity(m);
  return m;
};
/** ticks the level, the player (and `still`) held where they are; stops early when `until` holds */
const tickPinned = (level, player, n, until, still = []) => {
  const held = [player, ...still].map((e) => [e, e.x, e.y, e.z]);
  for (let i = 0; i < n; i++) {
    level.tick();
    for (const [e, x, y, z] of held) {
      e.moveTo(x, y, z, e.yaw, e.pitch);
      e.dx = e.dy = e.dz = 0;
      e.fallDistance = 0;
    }
    player.air = 300;
    player.health = player.maxHealth;
    if (until?.(i)) return i + 1;
  }
  return n;
};
const hold = (player, id, count = 1) => player.inventory.setSelectedItem(id ? ItemStack.of(id, count) : null);
/** the brain's activity switched now (vanilla GoatAi.updateActivity) rather than at the end of its next tick */
const refreshActivity = (g) => g.brain.setActiveActivityToFirstValid(['ram', 'long_jump', 'idle'], g);
/**
 * its ram due now, any stroll it's on dropped (as in vanilla, a goat mid-stroll keeps on it, at the pace it would take
 * to its start, till it's done: here, with what it's to ram held in place, it may be walking into them)
 */
const readyToRam = (g) => {
  g.walkTarget = null;
  g.navigation.stop();
  g.ramCooldown = -1;
  refreshActivity(g);
};
/** the knockbacks and hurts `e` takes */
function spy(e, level, g) {
  const kb = [], hurts = [];
  const k0 = e.knockback.bind(e), h0 = e.hurt.bind(e);
  e.knockback = (s, x, z) => { kb.push({ s, x, z, speed: g?.speed, t: level.gameTime }); k0(s, x, z); };
  e.hurt = (amount, source, attacker, direct) => { const r = h0(amount, source, attacker, direct); hurts.push({ amount, source, attacker, r, t: level.gameTime }); return r; };
  return { kb, hurts };
}
// vanilla's UUID.hashCode and new Random(seed).nextInt(a power of two), worked out apart from the game's own
const javaUuidHash = (u) => {
  const h = u.replace(/-/g, '');
  const x = BigInt('0x' + h.slice(0, 16)) ^ BigInt('0x' + h.slice(16));
  return Number(BigInt.asIntN(32, (x >> 32n) ^ x));
};
const javaNextIntPow2 = (seed, bound) => {
  const mask = (1n << 48n) - 1n;
  let s = (BigInt.asUintN(64, BigInt(seed)) ^ 0x5deece66dn) & mask;
  s = (s * 0x5deece66dn + 0xbn) & mask;
  return Number((BigInt(bound) * (s >> 17n)) >> 31n);
};
const hornsOnGround = (level) => level.entities.filter((e) => e.type === 'item' && e.stack.item.id === 'goat_horn');

// --- the goat itself
{
  const { level } = setup();
  const g = spawn(level, 0.5, 64, 0.5, { ready: true });
  check('a goat: 10 health, speed 0.2, 2 attack damage, 0.9 x 1.3, a creature', g instanceof Goat && g.maxHealth === 10 && g.health === 10 && near(g.moveSpeedAttr, 0.2) && g.attackDamage === 2 && near(g.width, 0.9) && near(g.height, 1.3) && g.category === 'creature');
  check('...eats wheat (only), turns its head 15 degrees at most, floats', g.isFood(ItemStack.of('wheat')) && !g.isFood(ItemStack.of('carrot')) && g.maxHeadYRot() === 15 && g.navigation.canFloat);
  check('...a long jump (30 seconds to a minute) and a ram (30 seconds to 5 minutes) a while off from its spawning', g.longJumpCooldown >= 600 && g.longJumpCooldown <= 1200 && g.ramCooldown >= 600 && g.ramCooldown <= 6000, `${g.longJumpCooldown} ${g.ramCooldown}`);
  g.setLongJumping(true);
  const [jw, jh] = [g.width, g.height];
  g.setLongJumping(false);
  check('...pulled in to 0.63 x 0.91 in a long jump', near(jw, 0.63) && near(jh, 0.91) && near(g.width, 0.9) && near(g.height, 1.3));
  g.setAge(-24000);
  check('a kid: half the size, no horns, butts for 1', near(g.width, 0.45) && near(g.height, 0.65) && !g.hasLeftHorn && !g.hasRightHorn && g.attackDamage === 1);
  g.setLongJumping(true);
  check('...and half that in a long jump', near(g.width, 0.315) && near(g.height, 0.455));
  g.setLongJumping(false);
  g.setAge(0);
  check('...grown: both horns, 2 again', g.hasLeftHorn && g.hasRightHorn && g.attackDamage === 2 && near(g.width, 0.9));
  check('its name, a summonable mob', spawner.entityDisplayName('goat') === 'Goat' && spawner.summonableTypes().includes('goat'));
  // one in fifty screaming, a tenth of the grown ones one-horned
  let screaming = 0, one = 0, left = 0, right = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const m = spawner.createMob('goat', level);
    m.moveTo(0.5, 64, 0.5, 0, 0);
    m.finalizeSpawn('natural');
    if (m.screaming) screaming++;
    if (m.hasLeftHorn !== m.hasRightHorn) { one++; if (m.hasLeftHorn) left++; else right++; }
  }
  check('one in fifty spawns screaming', screaming > 0.01 * N && screaming < 0.032 * N, `${screaming}/${N}`);
  check('a tenth one-horned (either horn)', one > 0.08 * N && one < 0.12 * N && left > 0.35 * one && right > 0.35 * one, `${one}/${N} (${left} left)`);
}

// --- spawning
{
  for (const b of ['frozen_peaks', 'jagged_peaks', 'snowy_slopes']) {
    const s = spawner.biomeSettings(B[b]);
    const e = s.creature.find((d) => d.type === 'goat');
    check(`${b}: goats, weight 5, in ones to threes`, B[b] !== undefined && !!e && e.weight === 5 && e.min === 1 && e.max === 3);
  }
  check('...and not on the stony peaks, in the meadows, the groves or the snowy plains', ['stony_peaks', 'meadow', 'grove', 'snowy_plains'].every((b) => B[b] !== undefined && !spawner.biomeSettings(B[b]).creature.some((d) => d.type === 'goat')));
  check('the snowy slopes have no farm animals (vanilla: rabbits and goats)', !spawner.biomeSettings(B.snowy_slopes).creature.some((d) => ['sheep', 'pig', 'cow', 'chicken'].includes(d.type)));
  const { level, world } = setup();
  const rule = (x, y, z) => Goat.checkGoatSpawnRules(level, x, y, z);
  const on = { 2: 'dirt', 3: 'snow_block', 4: 'packed_ice', 5: 'gravel', 6: 'grass_block', 7: 'sand', 8: 'snow' };
  for (const [x, n] of Object.entries(on)) put(world, +x, 63, 0, n);
  check('it spawns on stone, snow, snow blocks, packed ice, gravel and grass; not dirt or sand', rule(0, 64, 0) && rule(3, 64, 0) && rule(4, 64, 0) && rule(5, 64, 0) && rule(6, 64, 0) && rule(8, 64, 0) && !rule(2, 64, 0) && !rule(7, 64, 0));
  const sp = new spawner.NaturalSpawner(level, 1);
  check('...through the spawner too', sp.checkSpawnRules('goat', 0, 64, 0) && !sp.checkSpawnRules('goat', 2, 64, 0));
  world.getChunk(1, 1).setLight(4, 64, 4, 0);
  check('...in the light only', rule(0, 64, 0) && !rule(20, 64, 20));
}

// --- wheat: tempting, feeding, breeding; a kid's screams
{
  const { level, player, sounds } = setup();
  player.gameMode = 'survival';
  player.moveTo(7.5, 64, 0.5, 90, 0);
  const g = spawn(level, 0.5, 64, 0.5);
  const { hurts } = spy(player, level, g);
  hold(player, 'wheat');
  tickPinned(level, player, 25);
  const tempted = g.temptingPlayer === player && g.isTempted;
  // (tempted, it may not ram)
  g.ramCooldown = -1;
  let rammed = false;
  tickPinned(level, player, 100, () => { rammed ||= g.activity() === 'ram'; return false; });
  const d = Math.hypot(g.x - player.x, g.z - player.z);
  check('wheat tempts it: it comes up to the player, and doesn\'t ram them the while', tempted && d < 3.5 && !rammed && hurts.length === 0 && g.ramTarget === null, `${tempted} ${d.toFixed(2)} ${rammed}`);
  g.ramCooldown = 1e6;
  const b = spawn(level, 3.5, 64, 3.5);
  g.screaming = b.screaming = true;
  const s0 = sounds.length;
  const ok = g.interact(player, player.inventory.selectedItem);
  const eat = sounds.slice(s0).find((s) => s.n.startsWith('entity.goat.'));
  check('fed wheat, it\'s in love, with its eating sound (a screaming goat\'s own), a little higher or lower', ok && g.isInLove() && eat?.n === 'entity.goat.screaming.eat' && eat.p >= 0.8 && eat.p <= 1.2);
  hold(player, 'wheat');
  b.interact(player, player.inventory.selectedItem);
  hold(player, null);
  let baby = null;
  tickPinned(level, player, 600, () => { baby = level.entities.find((e) => e.type === 'goat' && e !== g && e !== b); return !!baby; });
  check('two in love have a kid: no horns, butting for 1', !!baby && baby.isBaby() && !baby.hasLeftHorn && !baby.hasRightHorn && baby.attackDamage === 1);
  check('...screaming, as its screaming parents do; its long jump and ram a while off', baby?.screaming && baby.longJumpCooldown > 0 && baby.longJumpCooldown <= 1200 && baby.ramCooldown > 0 && baby.ramCooldown <= 6000);
  // the kid takes after one parent or the other (one in fifty screaming anyway)
  const quiet = spawn(level, -10.5, 64, 0.5), loud = spawn(level, -12.5, 64, 0.5);
  loud.screaming = true;
  const count = (a, c) => { let n = 0; for (let i = 0; i < 1000; i++) if (a.makeBaby(c).screaming) n++; return n; };
  const [q, l, m] = [count(quiet, quiet), count(loud, loud), count(quiet, loud)];
  check('...a kid of two quiet goats screams one time in fifty; of two screamers always; of one of each about half the time', q > 5 && q < 40 && l === 1000 && m > 430 && m < 580, `${q} ${l} ${m}`);
  // a kid keeps to the grown ones
  const kid = spawn(level, -20.5, 64, -10.5);
  kid.setAge(-24000);
  const ad = spawn(level, -30.5, 64, -10.5);
  let follows = false;
  tickPinned(level, player, 400, () => { follows = !!kid.nearestVisibleAdult && !kid.nearestVisibleAdult.isBaby() && kid.walkTarget?.t.entity === kid.nearestVisibleAdult; return follows; });
  check('a kid keeps to a grown goat it sees, five to sixteen blocks off', follows);
}

// --- panicking
{
  const { level, player } = setup();
  const g = spawn(level, 0.5, 64, 0.5);
  player.gameMode = 'survival';
  player.moveTo(2.5, 64, 0.5, 90, 0);
  g.hurt(1, 'player', player);
  let panic = false;
  tickPinned(level, player, 30, () => { panic = g.walkTarget?.speed === 2; return panic; });
  check('hurt, it runs (at twice its pace)', panic);
}

// --- the long jump
{
  const { level, world, player, sounds } = setup();
  // a ledge three blocks up, four across: it can't walk up there
  for (let x = 3; x <= 5; x++) for (let z = -2; z <= 2; z++) for (let y = 64; y <= 66; y++) put(world, x, y, z, 'stone');
  const g = spawn(level, 0.5, 64, 0.5);
  g.onGround = true;
  g.longJumpCooldown = -1;
  refreshActivity(g);
  const act = g.activity();
  let jumpT = -1, landT = -1, flying = false, small = false, looked = null;
  const t0 = level.gameTime;
  tickPinned(level, player, 200, () => {
    if (!looked && g.lookTarget?.pos) looked = [...g.lookTarget.pos];
    if (jumpT < 0 && sounds.some((s) => s.n === 'entity.goat.long_jump')) jumpT = level.gameTime;
    if (jumpT >= 0 && !g.onGround && g.longJumping) { flying = true; small ||= near(g.width, 0.63); }
    if (landT < 0 && sounds.some((s) => s.n === 'entity.goat.step' && s.v === 2)) landT = level.gameTime;
    return landT >= 0;
  });
  const snd = sounds.find((s) => s.n === 'entity.goat.long_jump');
  check('its long jump comes (no walk target, no wheat, no cooldown)', act === 'long_jump');
  check('...it eyes a ledge within five blocks it can\'t walk to, for two seconds, then leaps (the long jump sound)', !!looked && looked[1] === 67 && looked[0] >= 3 && looked[0] <= 5 && jumpT - t0 >= 40 && jumpT - t0 <= 43 && snd?.v === 1, `${looked} ${jumpT - t0}`);
  check('...pulled in to 0.63 wide in the air', flying && small);
  check('...landing on the ledge with a heavy step (volume 2), and waits 30 seconds to a minute for the next', landT > 0 && g.onGround && near(g.y, 67) && g.x > 2.5 && g.x < 6.5 && !g.longJumping && near(g.width, 0.9) && g.longJumpCooldown >= 580 && g.longJumpCooldown <= 1200 && !g.longJumpMidJump, `${g.x.toFixed(2)} ${g.y.toFixed(2)} ${g.longJumpCooldown}`);
  tickPinned(level, player, 2);
  check('...its brain idle again', g.activity() === 'idle');
  // nowhere it can't walk to: no jump, and half the wait
  const { level: l2, player: p2, sounds: s2 } = setup();
  const h = spawn(l2, 0.5, 64, 0.5);
  h.onGround = true;
  h.longJumpCooldown = -1;
  refreshActivity(h);
  tickPinned(l2, p2, 3);
  check('where it can walk anywhere it might land, no jump, and half the wait (15 to 30 seconds)', !s2.some((s) => s.n === 'entity.goat.long_jump') && h.longJumpCooldown >= 295 && h.longJumpCooldown <= 600, `${h.longJumpCooldown}`);
  // not in the water
  const { level: l3, world: w3, player: p3 } = setup();
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { put(w3, x, 63, z, 'water'); put(w3, x, 62, z, 'stone'); }
  const k = spawn(l3, 0.5, 63, 0.5);
  tickPinned(l3, p3, 5);
  k.longJumpCooldown = -1;
  k.walkTarget = null;
  refreshActivity(k);
  tickPinned(l3, p3, 2);
  check('...nor from the water', k.longJumpCooldown >= 295 && k.longJumpCooldown <= 600, `${k.longJumpCooldown}`);
}

// --- the ram
{
  const { level, player, sounds } = setup();
  player.gameMode = 'survival';
  player.moveTo(6.5, 64, 0.5, 90, 0);
  player.headYaw = 90;
  const g = spawn(level, 0.5, 64, 0.5);
  tickPinned(level, player, 25);
  readyToRam(g);
  const { kb, hurts } = spy(player, level, g);
  let start = null, lowestT = -1, prepT = -1, act = null;
  const t0 = level.gameTime;
  tickPinned(level, player, 300, () => {
    act ||= g.activity() === 'ram' ? 'ram' : null;
    if (g.isLoweringHead && !start) start = [Math.floor(g.x), Math.floor(g.y), Math.floor(g.z)];
    if (lowestT < 0 && g.lowerHeadTick === 20) lowestT = level.gameTime;
    if (prepT < 0 && sounds.some((s) => s.n === 'entity.goat.prepare_ram')) prepT = level.gameTime;
    return kb.length > 0;
  });
  const prep = sounds.find((s) => s.n === 'entity.goat.prepare_ram');
  check('its ram comes: it sees the player (in survival)...', act === 'ram');
  check('...walks off to the nearest spot four to seven blocks from them in line with them (here seven, west)', !!start && start[0] === -1 && start[2] === 0, `${start}`);
  check('...lowers its head there, a second, and marks the far side of their block (the prepare sound, at its own pitch)', lowestT > 0 && prepT > 0 && prepT >= lowestT && !!prep && prep.v === 1 && prep.p >= 0.8 && prep.p <= 1.2);
  // (vanilla: the hurt throws them back a little first, as any hit, then the ram's own)
  const k = kb.at(-1);
  check('...charges (at 3) and butts them: 2 damage, a goat\'s ram', hurts.length === 1 && hurts[0].amount === 2 && hurts[0].source === 'mobAttackNoAggro' && hurts[0].attacker === g && hurts[0].r, JSON.stringify(hurts.map((h) => [h.amount, h.source])));
  check('...throwing them back hard: 2.5 times its speed\'s worth (1.65 times its speed of 0.6)', kb.length === 2 && near(kb[0].s, 0.4) && !!k && near(k.speed, 0.6, 1e-6) && near(k.s, 2.5 * Math.min(3, Math.max(0.2, 1.65 * k.speed)), 1e-6) && near(k.x, -8 / Math.hypot(8, 0.5)) && near(k.z, -0.5 / Math.hypot(8, 0.5)), k ? `${k.s.toFixed(4)} at ${k.speed}` : '');
  const impact = sounds.find((s) => s.n === 'entity.goat.ram_impact');
  check('...with the impact sound; then its head comes up, and the next ram is 30 seconds to 5 minutes off', !!impact && g.ramTarget === null && !g.isLoweringHead && g.ramCooldown >= 590 && g.ramCooldown <= 6000, `${g.ramCooldown}`);
  tickPinned(level, player, 10);
  check('...the head up again in half the time it took to go down', g.lowerHeadTick === 0 && g.rammingXHeadRot() === 0);
  // behind a shield: half as far, and no harm
  const shield = ItemStack.of('shield');
  const inv = player.inventory;
  inv.offhand = shield;
  inv.activeHand = 'off';
  M['game/itemBehavior'].itemBehaviorOf('shield').use(level, player, shield);
  inv.activeHand = 'main';
  player.useItemRemaining = player.useDuration - 10;
  g.moveTo(0.5, 64, 0.5, 0, 0);
  tickPinned(level, player, 3);
  readyToRam(g);
  kb.length = hurts.length = 0;
  tickPinned(level, player, 300, () => kb.length > 0);
  check('behind a raised shield: thrown half as far, unhurt', M['entity/shield'].isBlocking(player) && kb.length >= 1 && near(kb.at(-1).s, 0.5 * 2.5 * Math.min(3, Math.max(0.2, 1.65 * kb.at(-1).speed)), 1e-6) && hurts.length === 1 && !hurts[0].r, kb.length ? `${kb.at(-1).s.toFixed(4)}` : 'no ram');
  // a kid: its own knockback (once, not 2.5 times)
  inv.offhand = null;
  player.stopUsingItem?.();
  player.useItem = null;
  player.useItemRemaining = 0;
  g.setAge(-24000);
  g.moveTo(0.5, 64, 0.5, 0, 0);
  tickPinned(level, player, 3);
  readyToRam(g);
  kb.length = hurts.length = 0;
  tickPinned(level, player, 300, () => kb.length > 0);
  check('a kid rams for 1, throwing them its speed\'s worth once', kb.length === 2 && near(kb.at(-1).s, Math.min(3, Math.max(0.2, 1.65 * kb.at(-1).speed)), 1e-6) && hurts[0]?.amount === 1, kb.length ? `${kb.at(-1).s.toFixed(4)} at ${kb.at(-1).speed}` : 'no ram');
}
{
  // creative players and other goats aren't rammed: with nothing else there, it gives up for its shortest wait
  const { level, player } = setup();
  player.moveTo(6.5, 64, 0.5, 90, 0);
  const g = spawn(level, 0.5, 64, 0.5), o = spawn(level, 0.5, 64, 5.5);
  tickPinned(level, player, 25);
  const saw = g.visibleLiving.includes(player) && g.visibleLiving.includes(o);
  g.ramCooldown = -1;
  tickPinned(level, player, 3);
  check('it sees a creative player and another goat, rams neither, and waits 30 seconds before looking again', saw && g.ramTarget === null && g.ramCooldown > 590 && g.ramCooldown <= 600, `${saw} ${g.ramCooldown}`);
  g.screaming = true;
  g.ramCooldown = -1;
  tickPinned(level, player, 3);
  check('...a screaming goat 5 seconds', g.ramTarget === null && g.ramCooldown > 90 && g.ramCooldown <= 100, `${g.ramCooldown}`);
}
{
  // any other mob: hurt and thrown, and not angered
  const { level, player, sounds } = setup();
  const g = spawn(level, 0.5, 64, 0.5);
  const pig = spawn(level, 6.5, 64, 0.5, { type: 'pig' });
  g.screaming = true;
  tickPinned(level, player, 25, null, [pig]);
  readyToRam(g);
  const { kb, hurts } = spy(pig, level, g);
  tickPinned(level, player, 300, () => kb.length > 0, [pig]);
  check('a pig is rammed too: hurt, thrown back, and not angered by it', kb.length === 2 && near(kb.at(-1).s, 2.5 * Math.min(3, Math.max(0.2, 1.65 * kb.at(-1).speed)), 1e-6) && hurts[0]?.amount === 2 && pig.health === pig.maxHealth - 2 && pig.lastHurtByMob === null);
  check('...a screaming goat\'s screams; the next ram 5 to 15 seconds off', sounds.some((s) => s.n === 'entity.goat.screaming.prepare_ram') && sounds.some((s) => s.n === 'entity.goat.screaming.ram_impact') && g.ramCooldown >= 90 && g.ramCooldown <= 300, `${g.ramCooldown}`);
}

// --- horns snapping
{
  const { level, world, player, sounds } = setup();
  for (let z = -3; z <= 3; z++) for (let y = 64; y <= 65; y++) { put(world, 7, y, z, 'stone'); put(world, 7, y, z + 20, 'oak_log'); put(world, 7, y, z - 20, 'dirt'); }
  const g = spawn(level, 0.5, 64, 0.5);
  g.uuid = '00000000-0000-0000-0000-000000000000';
  /**
   * charges it from (`x0`, `z`) east at the wall (as when what it charged stood with its back to it, and stepped
   * aside: the far edge of that block the wall's face); its impact and horn-break sounds
   */
  const charge = (m, z, x0) => {
    m.moveTo(x0, 64, z, 0, 0);
    m.dx = m.dz = 0;
    tickPinned(level, player, 2);
    m.moveTo(x0, 64, z, 0, 0);
    m.dx = m.dz = 0;
    m.walkTarget = null;
    m.navigation.stop();
    m.ramTarget = [7, 64, z];
    m.ramCooldown = -1;
    refreshActivity(m);
    const s0 = sounds.length;
    tickPinned(level, player, 250, () => m.ramTarget === null);
    return sounds.slice(s0).map((s) => s.n).filter((n) => /^entity\.goat\.(screaming\.)?(ram_impact|horn_break)$/.test(n));
  };
  // (vanilla looks a block ahead of it as it charges: a goat's last step may take it from short of that to against
  // the wall, where it's stopped and sees nothing ahead; so from a few starts, till one strikes)
  const STARTS = [0.8, 0.5, 1.1, 0.65, 0.95, 0.35, 1.25];
  let misses = 0;
  const ram = (m, z = 0.5) => {
    for (const x0 of STARTS) {
      const s = charge(m, z, x0);
      if (s.length) return s;
      misses++;
    }
    return [];
  };
  const s1 = ram(g);
  const h1 = hornsOnGround(level);
  const want = H.REGULAR_GOAT_HORNS[javaNextIntPow2(javaUuidHash(g.uuid), 4)];
  check('charging into stone, a horn snaps off (the impact, then the crack)', s1.join() === 'entity.goat.ram_impact,entity.goat.horn_break' && g.hasLeftHorn !== g.hasRightHorn, s1.join());
  check('...and pops out as a goat horn to be picked up at once', h1.length === 1 && h1[0].pickupDelay === 0 && h1[0].dy > 0.2 && h1[0].dy <= 0.7);
  check('...with a regular goat\'s call: the one vanilla gives its UUID (00000000-...: Seek)', h1[0]?.stack.tag?.instrument === want && want === 'seek_goat_horn', `${h1[0]?.stack.tag?.instrument} ${want}`);
  check('...its next ram 30 seconds to 5 minutes off', g.ramCooldown >= 590 && g.ramCooldown <= 6000);
  const s2 = ram(g, 20.5);
  const h2 = hornsOnGround(level);
  check('into a log, the other horn: the same call', s2.includes('entity.goat.horn_break') && !g.hasLeftHorn && !g.hasRightHorn && h2.length === 2 && h2.every((e) => e.stack.tag?.instrument === want));
  const s3 = ram(g);
  check('...no horns left, just the impact', s3.join() === 'entity.goat.ram_impact' && hornsOnGround(level).length === 2, s3.join());
  const d = spawn(level, 0.5, 64, -19.5);
  const s4 = STARTS.flatMap((x0) => charge(d, -19.5, x0));
  check('into dirt, from any start: nothing snaps (the charge just ends)', s4.length === 0 && d.hasLeftHorn && d.hasRightHorn && d.ramTarget === null && hornsOnGround(level).length === 2, s4.join());
  const sc = spawn(level, 0.5, 64, 0.5);
  sc.screaming = true;
  const calls = new Set();
  for (let i = 0; i < 12; i++) {
    const m = spawner.createMob('goat', level);
    m.screaming = i % 2 === 0;
    const hs = m.createHorn();
    calls.add(`${m.screaming ? 's' : 'r'}:${hs.tag.instrument}`);
    if (hs.tag.instrument !== (m.screaming ? H.SCREAMING_GOAT_HORNS : H.REGULAR_GOAT_HORNS)[javaNextIntPow2(javaUuidHash(m.uuid), 4)]) calls.add('mismatch');
  }
  g.moveTo(0.5, 64, 10.5, 0, 0);
  const s5 = ram(sc, 2.5);
  const h5 = hornsOnGround(level).find((e) => !h2.includes(e));
  check('a screaming goat\'s horn has a screaming call; its own impact and crack', s5.join() === 'entity.goat.screaming.ram_impact,entity.goat.screaming.horn_break' && H.SCREAMING_GOAT_HORNS.includes(h5?.stack.tag?.instrument), s5.join());
  check('...every goat\'s horn the one vanilla\'s random picks for its UUID', !calls.has('mismatch') && [...calls].every((c) => (c[0] === 's' ? H.SCREAMING_GOAT_HORNS : H.REGULAR_GOAT_HORNS).includes(c.slice(2))), [...calls].join());
  check(`(its charges stopped short of striking: ${misses} of ${misses + 4})`, misses <= 8);
}

// --- milking
{
  const { level, player, sounds } = setup();
  player.gameMode = 'survival';
  const g = spawn(level, 0.5, 64, 0.5);
  hold(player, 'bucket');
  const ok = g.interact(player, player.inventory.selectedItem);
  const s = sounds.find((x) => x.n === 'entity.goat.milk');
  check('a bucket milks it: a bucket of milk, the milking sound at the player', ok && player.inventory.selectedItem?.item.id === 'milk_bucket' && !!s && s.x === player.x && s.z === player.z);
  g.screaming = true;
  hold(player, 'bucket', 3);
  g.interact(player, player.inventory.selectedItem);
  check('...from a stack of buckets, one (the milk goes in with the rest); a screaming goat\'s own sound', player.inventory.selectedItem?.count === 2 && player.inventory.findSlot((x) => x.item.id === 'milk_bucket') >= 0 && sounds.some((x) => x.n === 'entity.goat.screaming.milk'));
  const kid = spawn(level, 3.5, 64, 0.5);
  kid.setAge(-24000);
  hold(player, 'bucket');
  const kidOk = kid.interact(player, player.inventory.selectedItem);
  check('...not a kid', !kidOk && player.inventory.selectedItem?.item.id === 'bucket');
  player.gameMode = 'creative';
  for (let i = 0; i < player.inventory.main.length; i++) player.inventory.main[i] = null;
  hold(player, 'bucket');
  g.interact(player, player.inventory.selectedItem);
  check('...in creative the bucket stays, with a bucket of milk beside it', player.inventory.selectedItem?.item.id === 'bucket' && player.inventory.findSlot((x) => x.item.id === 'milk_bucket') >= 0);
}

// --- the fall, saving
{
  const { level } = setup();
  const g = spawn(level, 0.5, 64, 0.5);
  g.causeFallDamage(13);
  const h1 = g.health;
  g.causeFallDamage(20);
  check('falls hurt it 10 less: 13 blocks nothing, 20 blocks 7', h1 === 10 && g.health === 3, `${h1} ${g.health}`);
  const s = spawn(level, 3.5, 64, 0.5);
  s.screaming = true;
  s.hasLeftHorn = false;
  s.longJumpCooldown = 321;
  s.ramCooldown = 45;
  s.temptationCooldown = 7;
  const u = spawner.loadEntity(spawner.saveEntity(s), level);
  check('saved and loaded: screaming, its horns, its cooldowns', u instanceof Goat && u.screaming && !u.hasLeftHorn && u.hasRightHorn && u.longJumpCooldown === 321 && u.ramCooldown === 45 && u.temptationCooldown === 7 && u.attackDamage === 2);
  const k = spawn(level, 6.5, 64, 0.5);
  k.setAge(-500);
  const v = spawner.loadEntity(spawner.saveEntity(k), level);
  check('...a kid still a kid: no horns, butting for 1', v.isBaby() && !v.hasLeftHorn && !v.hasRightHorn && v.attackDamage === 1);
}

// --- the goat horn
{
  const { level, player, sounds } = setup();
  player.gameMode = 'survival';
  const IB = M['game/itemBehavior'];
  const use = (s) => IB.itemBehaviorOf('goat_horn').use(level, player, s);
  const horn = H.goatHornStack('feel_goat_horn');
  player.inventory.setSelectedItem(horn);
  const r1 = use(horn);
  const toots = () => sounds.filter((s) => s.n.startsWith('item.goat_horn.sound.'));
  const t = toots()[0];
  check('blowing a horn plays its call (Feel: the fourth), heard 256 blocks round (volume 16)', r1 === 'success' && t?.n === 'item.goat_horn.sound.3' && t.v === 16 && t.p === 1);
  check('...raised to the lips for seven seconds at most, and seven seconds before it may be blown again', player.useItem === horn && player.useDuration === 140 && player.useHand === 'main' && player.cooldowns.get('goat_horn') === 140);
  const arms = M['render/playerPose'].playerArms(player, 'right');
  check('...the toot-horn pose, in the hand blowing it', arms.right === 'toot_horn' && arms.usingArm === 'right' && arms.left === 'empty');
  const root = M['render/model'].playerModel();
  M['render/model'].animateHumanoid(root, 0, 0, 0, 10, 20, 0, false, false, arms);
  const head = root.child('head'), arm = root.child('right_arm');
  check('...the arm raised along the look and turned in across the face', near(arm.xRot, Math.max(-1.2, Math.min(1.2, head.xRot)) - 1.4835298, 1e-6) && near(arm.yRot, head.yRot - Math.PI / 6, 1e-6), `${arm.xRot.toFixed(3)} ${arm.yRot.toFixed(3)}`);
  check('...not while it cools', use(horn) === 'pass' && toots().length === 1);
  player.cooldowns.clear();
  check('a horn with no call does nothing', use(ItemStack.of('goat_horn')) === 'fail' && toots().length === 1);
  check('...each call its own sound', H.GOAT_HORN_INSTRUMENTS.every((c, i) => { player.cooldowns.clear(); use(H.goatHornStack(c)); return toots().at(-1).n === `item.goat_horn.sound.${i}`; }));
  check('eight calls in their sounds\' order: Ponder, Sing, Seek, Feel a regular goat\'s; Admire, Call, Yearn, Dream a screaming one\'s', H.REGULAR_GOAT_HORNS.join() === 'ponder_goat_horn,sing_goat_horn,seek_goat_horn,feel_goat_horn' && H.SCREAMING_GOAT_HORNS.join() === 'admire_goat_horn,call_goat_horn,yearn_goat_horn,dream_goat_horn');
  const lines = M['item/hoverText'].hoverText(horn);
  check('its call named under it, grey', lines.includes('§7Feel'), JSON.stringify(lines));
  const it = ITEMS.get('goat_horn');
  const cs = it.creativeStacks();
  check('one to a stack; in the tools just before the music discs, one of each call', it.maxStack === 1 && it.creativeTab === 'tools' && ITEM_LIST.indexOf(it) + 1 === ITEM_LIST.indexOf(ITEMS.get('music_disc_13')) && ITEM_LIST.indexOf(ITEMS.get('tnt_minecart') ?? ITEMS.get('minecart')) < ITEM_LIST.indexOf(it) && cs.length === 8 && cs.map((s) => s.tag.instrument).join() === H.GOAT_HORN_INSTRUMENTS.join());
  const a = H.goatHornStack('seek_goat_horn'), b = H.goatHornStack('seek_goat_horn'), c = H.goatHornStack('call_goat_horn');
  check('...horns stack apart by call (and copy theirs)', M['item/item'].sameTag(a.tag, b.tag) && !M['item/item'].sameTag(a.tag, c.tag) && M['item/item'].cloneTag(c.tag).instrument === 'call_goat_horn');
  const { Rand } = M['core/rng'];
  const got = [];
  for (let i = 0; i < 400 && got.length < 20; i++) got.push(...M['game/loot'].rollLoot('chests/pillager_outpost', new Rand(i + 1)).filter((s) => s.item.id === 'goat_horn'));
  check('a pillager outpost\'s chest may hold a goat horn, with a regular goat\'s call', got.length > 0 && got.every((s) => H.REGULAR_GOAT_HORNS.includes(s.tag?.instrument)) && new Set(got.map((s) => s.tag.instrument)).size > 1, `${got.length}`);
}

// --- Whatever Floats Your Goat!
{
  const { level, player, triggers } = setup();
  const ADV = M['game/advancements'];
  const adv = ADV.ADVANCEMENTS.get('husbandry/ride_a_boat_with_a_goat');
  const done = () => {
    const pa = new ADV.PlayerAdvancements();
    for (const t of triggers) pa.trigger(t.type, t.payload);
    return pa.isDone(adv);
  };
  const boat = new M['entity/boat'].Boat(level);
  boat.moveTo(0.5, 64, 0.5, 0, 0);
  level.addEntity(boat);
  const g = spawn(level, 0.5, 64, 2.5);
  player.gameMode = 'survival';
  const inGoat = g.startRiding(boat);
  const before = triggers.length;
  const inPlayer = player.startRiding(boat);
  check('getting in a boat a goat sits in: Whatever Floats Your Goat!', inGoat && inPlayer && before === 0 && triggers.filter((t) => t.type === 'started_riding').length === 1 && done());
  player.stopRiding();
  g.stopRiding();
  triggers.length = 0;
  // (forced: whoever just got off must otherwise wait three seconds to board again)
  player.startRiding(boat, true);
  const alone = done();
  const pig = spawn(level, 0.5, 64, 4.5, { type: 'pig' });
  pig.startRiding(boat);
  const withPig = done();
  pig.stopRiding();
  g.startRiding(boat, true);
  check('...or a goat getting in the boat they sit in (not alone, nor with a pig)', !alone && !withPig && done() && triggers.filter((t) => t.type === 'started_riding').length === 3);
}

// --- sounds
{
  const SND = M['audio/synth'].SOUNDS;
  const base = ['ambient', 'hurt', 'death', 'eat', 'long_jump', 'milk', 'prepare_ram', 'ram_impact', 'horn_break'];
  const want = [...base.map((n) => 'entity.goat.' + n), 'entity.goat.step', ...base.map((n) => 'entity.goat.screaming.' + n)];
  for (let i = 0; i < 8; i++) want.push(`item.goat_horn.sound.${i}`);
  const bad = [];
  let takes = 0;
  const bufs = [];
  for (const n of want) {
    const s = SND[n];
    if (!s) { bad.push(`${n} missing`); continue; }
    for (let i = 0; i < s.variants; i++) {
      const buf = s.generate(i, 22050);
      takes++;
      if (n.startsWith('item.goat_horn')) bufs.push(buf);
      let peak = 0, finite = true;
      for (const x of buf) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.05 || buf.length < 1000) bad.push(`${n}#${i} peak ${peak.toFixed(3)} len ${buf.length}`);
    }
  }
  check(`the goat's sounds, a screaming goat's, and the eight horn calls (${takes} takes)`, bad.length === 0, bad.join(', '));
  check('...the calls long (a few seconds) and all different', bufs.length === 8 && bufs.every((b) => b.length > 22050 * 1.5) && new Set(bufs.map((b) => b.length + ':' + b[4000].toFixed(5))).size === 8);
  const { level } = setup();
  const g = spawn(level, 0.5, 64, 0.5);
  const quiet = [g.ambientSound(), g.hurtSound(), g.deathSound(), g.stepSound()].join();
  g.screaming = true;
  const loud = [g.ambientSound(), g.hurtSound(), g.deathSound(), g.stepSound()].join();
  check('a goat\'s calls; a screaming goat\'s own (the same step)', quiet === 'entity.goat.ambient,entity.goat.hurt,entity.goat.death,entity.goat.step' && loud === 'entity.goat.screaming.ambient,entity.goat.screaming.hurt,entity.goat.screaming.death,entity.goat.step', loud);
}

// --- the texture, the model, the renderer
function faces(c) {
  const { u, v, w, h, d } = c;
  return { down: [u + d, v, w, d], up: [u + d + w, v, w, d], west: [u, v + d, d, h], north: [u + d, v + d, w, h], east: [u + d + w, v + d, d, h], south: [u + 2 * d + w, v + d, w, h] };
}
function walk(part, nm, out) {
  part.cubes.forEach((c, i) => out.push([`${nm}#${i}`, c]));
  for (const [n, ch] of part.children) walk(ch, n, out);
}
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const RR = M['render/goatRenderer'];
  const def = RR.goatModel();
  const cubes = [];
  walk(def.root, 'root', cubes);
  const img = MT.goat?.();
  const bad = [];
  if (!img || img.w !== 64 || img.h !== 64) bad.push('missing');
  else
    for (const [n, c] of cubes) for (const [f, [x0, y0, w, h]] of Object.entries(faces(c))) {
      if (!w || !h) continue;
      let clear = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3] === 0) clear++;
      const flat = !c.w || !c.h || !c.d;
      if (flat ? clear > (w * h) / 3 : clear) bad.push(`${n}.${f} ${clear}/${w * h}`);
    }
  check('its skin: 64x64, every face of the model painted (the beard ragged at its end)', bad.length === 0, bad.slice(0, 6).join(', '));
  const names = [];
  const collect = (p, nm) => { names.push(nm); for (const [n, ch] of p.children) collect(ch, n); };
  collect(def.root, 'root');
  check('the model: a head (ears, beard, two horns, the long face), the body and its coat, four legs; a kid with its head drawn big', cubes.length === 12 && ['head', 'left_horn', 'right_horn', 'nose', 'body', 'left_hind_leg', 'right_hind_leg', 'left_front_leg', 'right_front_leg'].every((n) => names.includes(n)) && def.texW === 64 && def.texH === 64 && def.baby.headParts.join() === 'head' && def.baby.headScale === 2.5 && def.baby.bodyScale === 2 && def.baby.yHead === 19 && def.baby.zHead === 1, names.join());
  const IT = M['textures/items'].ITEM_TEXTURES;
  const opaque = (t) => { let n = 0; for (let k = 3; k < t.data.length; k += 4) if (t.data[k]) n++; return n; };
  check('the spawn egg and the goat horn drawn', IT.goat_spawn_egg && opaque(IT.goat_spawn_egg()) > 60 && IT.goat_horn && opaque(IT.goat_horn()) > 30);

  // the renderer through stand-ins
  const { level } = setup();
  const A = { limbSwing: 1.3, limbAmount: 0.8, age: 100, headYaw: 10, headPitch: 20 };
  let quads = 0;
  const drawn = [];
  const batch = { quad() { quads++; }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const kit = {
    pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: () => { pose.reset(); return A; }, overlay() {},
    drawBody: (b, e, d, tex, baby) => { drawn.push(`${tex.n}${baby ? ':baby' : ''}`); d.root.render(b, pose, d.texW, d.texH); },
    state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const rr = new RR.GoatRenderers(kit);
  const g = spawn(level, 0.5, 64, 0.5);
  const ok = rr.render(batch, g, 0, 0, 0, 0.5);
  const q1 = quads;
  g.hasLeftHorn = false;
  rr.render(batch, g, 0, 0, 0, 0.5);
  const q2 = quads - q1;
  g.setAge(-100);
  rr.render(batch, g, 0, 0, 0, 0.5);
  const pig = spawn(level, 3.5, 64, 0.5, { type: 'pig' });
  check('drawn in its skin (a kid small); a snapped horn not drawn; not a pig', ok && q1 > 0 && q2 === q1 - 6 && drawn.join() === 'goat,goat,goat:baby' && !rr.render(batch, pig, 0, 0, 0, 0.5), `${q1} ${q2} ${drawn.join()}`);
  // the head lowered to ram, in place of its look up or down
  const root = RR.goatModel().root;
  g.setAge(0);
  g.lowerHeadTick = 0;
  RR.animateGoat(root, g, A);
  const look = root.child('head').xRot;
  g.lowerHeadTick = 20;
  RR.animateGoat(root, g, A);
  const ram = root.child('head').xRot;
  g.lowerHeadTick = 10;
  RR.animateGoat(root, g, A);
  const half = root.child('head').xRot;
  check('looking, its head follows its look; ramming, it\'s lowered, 30 degrees at most', near(look, (20 * Math.PI) / 180) && near(ram, Math.PI / 6) && near(half, Math.PI / 12), `${look.toFixed(3)} ${ram.toFixed(3)} ${half.toFixed(3)}`);
  const legs = ['right_hind_leg', 'left_hind_leg', 'right_front_leg', 'left_front_leg'].map((n) => root.child(n).xRot);
  check('...its legs swing as any four-legged mob\'s', near(legs[0], legs[3]) && near(legs[1], legs[2]) && near(legs[0], -legs[1]) && Math.abs(legs[0]) > 0.1);
  check('...its shadow 0.7 (a kid\'s half)', RR.GOAT_SHADOW_RADII.goat === 0.7);
}

close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
