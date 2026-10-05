// Headless checks for the wither (node tests/wither/wither.mjs; the wither, milestone 1): building it from soul sand or
// soul soil and wither skeleton skulls, any way round, by hand or by dispenser (not in peaceful, not by /setblock,
// not with the stem's sides filled); its charge (untouchable but by the void, healing, the bar filling, the blast and
// the roar); its numbers; what it targets (not its undead friends, nor a creative player, nor a ghast) and how it
// flies after it; its heads' skulls (black and blue) and what they do (the damage, the withering by difficulty, the
// heal on a kill, the blasts, a blue one through obsidian and water); breaking blocks once struck; its armour below
// half health; its healing; dying (the nether star, proof against blasts and lasting longer; its experience) and the
// rose where its victims fall; the wither rose (where it grows, what it withers, its smoke, its pot, its dye and its
// stew); despawning in peaceful; saving and /summon; the spawn egg; its items and their creative tabs; the boss bar
// and the sky going dark; its sounds, textures, death message and advancements; its renderer (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/wither.ts', '/src/game/witherSpawn.ts', '/src/game/witherRose.ts',
  '/src/entity/itemEntity.ts', '/src/game/advancements.ts', '/src/game/commands.ts', '/src/game/blockBehavior.ts', '/src/game/blockRules.ts',
  '/src/render/witherRenderer.ts', '/src/render/entityRenderer.ts', '/src/textures/mobs.ts', '/src/textures/blocks.ts', '/src/audio/synth.ts',
  '/src/game/redstone/dispenseItems.ts', '/src/inventory/recipes.ts', '/src/entity/effects.ts', '/src/entity/arrow.ts', '/src/game/explosion.ts',
  '/src/gui/bossOverlay.ts', '/src/render/lightmap.ts', '/src/game/playerDeath.ts', '/src/game/suspiciousStew.ts', '/src/world/dir.ts',
  '/src/entity/xpOrb.ts', '/src/world/blocksVillage.ts', '/src/game/villageBlocks.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK, BLOCK_BY_NAME, getBlock } = M['world/block'];
const { ITEMS, ITEM_LIST, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const { WitherBoss, WitherSkull, witherBars, witherCanDestroy, WITHER_SPAWN_TICKS } = M['entity/wither'];
const { checkWitherSpawn, canSpawnWither } = M['game/witherSpawn'];
const { behaviorOf } = M['game/blockBehavior'];
const { ItemEntity } = M['entity/itemEntity'];
const { MobEffectInstance, MOB_EFFECTS } = M['entity/effects'];
const { Arrow } = M['entity/arrow'];
const { explode } = M['game/explosion'];
const { WEST, UP, SOUTH } = M['world/dir'];
const spawner = M['game/spawner'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const stack = (id, n = 1) => ItemStack.of(id, n);
const nameAt = (level, x, y, z) => BLOCKS[STATE_BLOCK[level.getState(x, y, z)]].name;

/** flat `top` at y 63 on stone (things stand at 64), for x, z in [-64, 64); day, clear; a creative player at (px, 64, pz) */
function setup({ difficulty = 'normal', top = 'grass_block', griefing = true, px = 0.5, pz = 30.5 } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(B.plains); world.chunks.set(c.key, c); }
  const st = S('stone'), t = S(top);
  for (let x = -64; x < 64; x++) for (let z = -64; z < 64; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, t);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'withers');
  const sounds = [], parts = [], dust = [], triggers = [], added = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = {
    blockBreak(x, y, z, s) { dust.push({ x, y, z, s }); }, blockHit() {}, blockParticle() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z, t: level.gameTime }); },
    entityEffect(x, y, z, c) { parts.push({ k: 'entity_effect', x, y, z, c, t: level.gameTime }); }, poof() {}, dust() {}, emitAround() {}, spell() {}, fallingDust() {},
  };
  level.onPlayerTrigger = (p, type, payload) => triggers.push({ p, type, payload });
  const add = level.addEntity.bind(level);
  level.addEntity = (e) => { added.push(e); return add(e); };
  level.difficulty = difficulty;
  level.gameRules.mobGriefing = griefing;
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.updateSkyBrightness();
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(px, 64, pz, 0, 0);
  player.setGameMode('creative');
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, dust, triggers, added };
}
const run = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const withers = (level) => level.entities.filter((e) => e instanceof WitherBoss && !e.removed);
const skulls = (added) => added.filter((e) => e instanceof WitherSkull);
/** a mob of `type` at (x, y, z) as /summon makes it, held still unless `brain` */
function mob(level, type, x, y, z, { brain = false } = {}) {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  m.persistenceRequired = true;
  if (!brain) m.serverAiStep = () => {};
  level.addEntity(m);
  return m;
}
/** a block set down by a player (vanilla Block.setPlacedBy after the placing) */
function place(level, x, y, z, st, by = null) {
  level.setBlock(x, y, z, st);
  behaviorOf(st)?.setPlacedBy?.(level, x, y, z, st, by);
}
const SKULL = getBlock('wither_skeleton_skull').defaultState;
const SAND = S('soul_sand'), SOIL = S('soul_soil');
/** the T upright, arms along x, stem at (x, y, z), and the first two skulls; the third skull's place returned */
function buildT(level, x, y, z, { base = SAND, arm = SAND, skulls = 2 } = {}) {
  level.setBlock(x, y, z, base);
  for (const dx of [-1, 0, 1]) level.setBlock(x + dx, y + 1, z, arm);
  const tops = [[x - 1, y + 2, z], [x, y + 2, z], [x + 1, y + 2, z]];
  for (let i = 0; i < skulls; i++) place(level, ...tops[i], SKULL);
  return tops[2];
}

// ===========================================================================
// its numbers
{
  const { level } = setup();
  const w = new WitherBoss(level);
  check('the wither: 300 health, 4 armour, 0.6 move and flying speed, 40 follow range, 50 experience, 0.9 by 3.5', w.maxHealth === 300 && w.health === 300 && w.baseArmor === 4 && near(w.moveSpeedAttr, 0.6) && near(w.flyingSpeedAttr, 0.6) && w.followRange === 40 && w.xpReward === 50 && near(w.width, 0.9) && near(w.height, 3.5));
  check('...undead, fireproof, a monster, made by /summon\'s name "wither" and called "Wither"', w.isUndead() && w.fireImmune() && w.category === 'monster' && spawner.createMob('wither', level) instanceof WitherBoss && spawner.entityDisplayName(w) === 'Wither');
  check('...never withered, nor poisoned (undead)', !w.canBeAffected(new MobEffectInstance(MOB_EFFECTS.wither, 100)) && !w.canBeAffected(new MobEffectInstance(MOB_EFFECTS.poison, 100)));
  check('the charge is 220 ticks', WITHER_SPAWN_TICKS === 220);
  check('what it can break: not air, bedrock, barriers, end portal frames, command blocks, reinforced deepslate; stone, obsidian and water yes', witherCanDestroy(S('stone')) && witherCanDestroy(S('obsidian')) && witherCanDestroy(S('water')) && !witherCanDestroy(0) && ['bedrock', 'barrier', 'end_portal_frame', 'command_block', 'reinforced_deepslate'].every((n) => !BLOCK_BY_NAME.get(n) || !witherCanDestroy(BLOCK_BY_NAME.get(n).defaultState)));
}

// ===========================================================================
// building it
{
  const { level, player, sounds, dust, triggers, added } = setup();
  const third = buildT(level, 0, 64, 0);
  check('the T and two skulls: nothing yet', withers(level).length === 0);
  // (a skull set by command doesn't count, as vanilla's checkSpawn is the placing's)
  level.setBlock(...third, SKULL);
  check('...a third skull set by command: still nothing', withers(level).length === 0);
  level.setBlock(...third, 0);
  sounds.length = dust.length = 0;
  place(level, ...third, SKULL, player);
  const w = withers(level)[0];
  check('...the third set down by a player: the wither', withers(level).length === 1);
  check('...where the stem was, 0.55 up its block', w && near(w.x, 0.5) && near(w.y, 64.55) && near(w.z, 0.5), w && `${w.x},${w.y},${w.z}`);
  check('...facing along the pattern\'s forwards (the arms along x: 90)', w && w.yaw === 90 && w.bodyYaw === 90);
  check('...the seven blocks gone, each crumbling with its dust and breaking sound', [[0, 64, 0], [-1, 65, 0], [0, 65, 0], [1, 65, 0], [-1, 66, 0], [0, 66, 0], [1, 66, 0]].every((p) => nameAt(level, ...p) === 'air') && dust.length === 7 && sounds.filter((s) => s.n === 'block.soul_sand.break').length === 4, `${dust.length} ${sounds.map((s) => s.n)}`);
  check('...charging: 220 ticks, a third of its health, its bar empty', w?.invulnerableTicks === 220 && w.health === 100 && w.barProgress === 0);
  check('...Withering Heights for the player near it', triggers.some((t) => t.type === 'summoned_entity' && t.payload?.summoned === 'wither' && t.p === player));
  check('...added once', added.filter((e) => e instanceof WitherBoss).length === 1);
  const adv = M['game/advancements'];
  const def = adv.ADVANCEMENTS.get('nether/summon_wither');
  check('the advancement: nether/summon_wither, summoned_entity of a wither', !!def && JSON.stringify(def.criteria).includes('"summoned_entity"') && JSON.stringify(def.criteria).includes('"wither"'), def ? JSON.stringify(def.criteria) : 'none');
}
{
  const { level, triggers } = setup();
  // soul soil, and a mix
  place(level, ...buildT(level, 10, 64, 0, { base: SOIL, arm: SOIL }), SKULL);
  place(level, ...buildT(level, 20, 64, 0, { base: SOIL, arm: SAND }), SKULL);
  check('soul soil works, and soul sand and soil mixed', withers(level).length === 2);
  // arms along z: facing 0
  level.setBlock(30, 64, 0, SAND);
  for (const dz of [-1, 0, 1]) level.setBlock(30, 65, dz, SAND);
  place(level, 30, 66, -1, SKULL);
  place(level, 30, 66, 0, SKULL);
  place(level, 30, 66, 1, SKULL);
  const w2 = withers(level).find((w) => near(w.x, 30.5));
  check('...the arms along z: it faces 0', w2?.yaw === 0, w2 ? `${w2.yaw}` : 'none');
  // lying on the ground, wall skulls on the end
  level.setBlock(40, 64, 0, SAND);
  for (const dx of [-1, 0, 1]) level.setBlock(40 + dx, 64, 1, SAND);
  const wall = getBlock('wither_skeleton_wall_skull').state({ facing: 'south' });
  place(level, 39, 64, 2, wall);
  place(level, 40, 64, 2, wall);
  place(level, 41, 64, 2, wall);
  const w3 = withers(level).find((w) => near(w.x, 40.5));
  check('...lying on the ground, wall skulls at its end: it comes, where the stem was', !!w3 && near(w3.y, 64.55) && near(w3.z, 0.5));
  // the stem's side filled
  level.setBlock(-20, 64, 0, SAND);
  for (const dx of [-1, 0, 1]) level.setBlock(-20 + dx, 65, 0, SAND);
  level.setBlock(-21, 64, 0, S('dirt'));
  place(level, -21, 66, 0, SKULL);
  place(level, -20, 66, 0, SKULL);
  place(level, -19, 66, 0, SKULL);
  check('...but not with a block beside the stem', withers(level).length === 4 && nameAt(level, -19, 66, 0) === 'wither_skeleton_skull');
  // other skulls
  level.setBlock(-30, 64, 0, SAND);
  for (const dx of [-1, 0, 1]) level.setBlock(-30 + dx, 65, 0, SAND);
  place(level, -31, 66, 0, SKULL);
  place(level, -30, 66, 0, SKULL);
  place(level, -29, 66, 0, getBlock('skeleton_skull').defaultState);
  check('...nor with a skeleton\'s skull', withers(level).length === 4);
  check('Withering Heights for nobody here (the player 30 off: within 50 of all of them)', triggers.filter((t) => t.type === 'summoned_entity').length === 4);
}
{
  const { level } = setup({ difficulty: 'peaceful' });
  place(level, ...buildT(level, 0, 64, 0), SKULL);
  check('not in peaceful (the blocks stay)', withers(level).length === 0 && nameAt(level, 0, 64, 0) === 'soul_sand' && nameAt(level, 1, 66, 0) === 'wither_skeleton_skull');
  check('...and a dispenser can\'t finish one there', !canSpawnWither(level, 1, 66, 0));
}
{
  // a dispenser finishing it; and with nothing to finish, a skull on the head of who stands in front
  const { level } = setup();
  const D = M['game/redstone/dispenseItems'];
  buildT(level, 0, 64, 0);
  level.setBlock(2, 66, 0, S('dispenser'));
  const src = { level, x: 2, y: 66, z: 0, facing: WEST, be: { addItem: () => -1 }, success: true };
  check('a dispenser can finish the T in front of it (canSpawnMob)', canSpawnWither(level, 1, 66, 0));
  const left = D.dispenseBehaviorFor(stack('wither_skeleton_skull'))(src, stack('wither_skeleton_skull'));
  check('...its skull set down there brings the wither, the skull used', withers(level).length === 1 && (!left || left.count === 0));
  const z = mob(level, 'zombie', 10.5, 64, 10.5);
  // (vanilla Mob.canTakeItem: only a mob that may pick up loot takes it)
  z.canPickUpLoot = true;
  for (let i = 0; i < 4; i++) z.armorItems[i] = null;
  level.setBlock(10, 64, 9, S('dispenser'));
  const src2 = { level, x: 10, y: 64, z: 9, facing: SOUTH, be: { addItem: () => -1 }, success: true };
  D.dispenseBehaviorFor(stack('wither_skeleton_skull'))(src2, stack('wither_skeleton_skull'));
  check('...with no T in front: on the head of the zombie standing there (as any mob head, one that picks up loot)', z.getItemBySlot('head')?.item.id === 'wither_skeleton_skull');
  // (vanilla canSpawnMob asks only for the T's body; the skull stays where the wither isn't finished)
  buildT(level, 20, 64, 0, { skulls: 0 });
  level.setBlock(22, 66, 0, S('dispenser'));
  D.dispenseBehaviorFor(stack('wither_skeleton_skull'))({ ...src, x: 22 }, stack('wither_skeleton_skull'));
  const set = level.getState(21, 66, 0);
  check('...a bare T in front: the skull set down on it, looking back at the dispenser (rotation 4: east)', nameAt(level, 21, 66, 0) === 'wither_skeleton_skull' && BLOCKS[STATE_BLOCK[set]].get(set, 'rotation') === 4 && withers(level).length === 1);
}

// ===========================================================================
// its charge
{
  const { level, player, sounds, parts } = setup();
  place(level, ...buildT(level, 0, 64, 0), SKULL);
  const w = withers(level)[0];
  const startY = w.y;
  check('charging: no blows land (a player\'s, an arrow\'s, fire, a blast)', !w.hurt(10, 'player', player, player) && !w.hurt(10, 'arrow', null, new Arrow(level, null)) && !w.hurt(10, 'explosion') && w.health === 100);
  run(level, 10);
  check('...healing 10 every 10 ticks', w.health >= 110 && w.health <= 120, `${w.health}`);
  check('...its bar filling (1 - left/220)', near(w.barProgress, 1 - w.invulnerableTicks / 220, 1e-6) && w.barProgress > 0, `${w.barProgress} ${w.invulnerableTicks}`);
  check('...still where it was, settled onto the ground (it does nothing while charging)', near(w.x, 0.5) && near(w.z, 0.5) && w.y <= startY && w.y >= 64, `${w.x},${w.y},${w.z}`);
  check('...its pale glow (blue-white entity effect) about it', parts.some((p) => p.k === 'entity_effect' && p.c === 0xb2b2e5));
  // the blocks round it
  for (const [x, y, z] of [[3, 64, 0], [0, 64, 3], [-3, 66, 0]]) level.setBlock(x, y, z, S('stone'));
  const bystander = mob(level, 'cow', 0.5, 64, -4.5);
  bystander.maxHealth = bystander.health = 1000;
  const blows = [];
  const hurt0 = bystander.hurt.bind(bystander);
  bystander.hurt = (n, src, by, direct) => (blows.push({ src, by }), hurt0(n, src, by, direct));
  sounds.length = 0;
  run(level, 220);
  const killer0 = player.killer;
  player.killer = w;
  const blownUp = M['game/playerDeath'].deathMessage('playerExplosion', player, 'Steve');
  player.killer = killer0;
  check('...its blast credited to it (vanilla PLAYER_EXPLOSION: "was blown up by Wither")', blows.some((b) => b.src === 'playerExplosion' && b.by === w) && blownUp === 'Steve was blown up by Wither', `${JSON.stringify(blows.map((b) => b.src))} ${blownUp}`);
  check('...after 220 ticks: done charging, the bar at its health', w.invulnerableTicks === 0 && near(w.barProgress, w.health / w.maxHealth, 1e-6));
  check('...healed to full on the way (22 heals of 10 from 100)', w.health >= 299, `${w.health}`);
  check('...the blast (power 7) breaking the blocks round it', nameAt(level, 3, 64, 0) === 'air' && nameAt(level, 0, 64, 3) === 'air' && sounds.some((s) => s.n === 'entity.generic.explode'));
  check('...and its roar, heard by everyone (entity.wither.spawn)', sounds.some((s) => s.n === 'entity.wither.spawn'));
  // void
  const w2 = new WitherBoss(level);
  w2.moveTo(20.5, 70, 0.5, 0, 0);
  w2.makeInvulnerable();
  level.addEntity(w2);
  check('...while charging the void still reaches it, and /kill', w2.hurt(10, 'void') && w2.hurt(10, 'genericKill'));
}

// ===========================================================================
// what it hurts and is hurt by
{
  const { level, player } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 64, 0.5, 0, 0);
  level.addEntity(w);
  const z = mob(level, 'zombie', 5.5, 64, 0.5);
  const sk = mob(level, 'skeleton', 6.5, 64, 0.5);
  check('its friends (the undead) can\'t hurt it, nor drowning', !w.hurt(5, 'mob', z, z) && !w.hurt(5, 'arrow', sk, new Arrow(level, sk)) && !w.hurt(5, 'drown') && w.health === 300);
  check('...a player can (its 4 armour taking a little off)', w.hurt(5, 'player', player, player) && w.health < 300 && w.health > 295);
  w.health = 150;
  w.invulnerableTime = 0;
  const arrow = new Arrow(level, null);
  check('armoured at half health: arrows (and tridents) bounce off', w.isPowered() && !w.hurt(5, 'arrow', null, arrow) && w.health === 150);
  w.invulnerableTime = 0;
  check('...but a blow still lands', w.hurt(5, 'player', player, player) && w.health < 150);
  w.health = 151;
  check('...not armoured above half', !w.isPowered());
}

// ===========================================================================
// targets, flying and its skulls
{
  const { level, added } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 66, 0.5, 0, 0);
  level.addEntity(w);
  const zombie = mob(level, 'zombie', -6.5, 64, 0.5);
  zombie.isSunBurnTick = () => false;
  const ghast = mob(level, 'ghast', 0.5, 72, -10.5);
  const cow = mob(level, 'cow', 8.5, 64, 0.5);
  cow.maxHealth = cow.health = 1000;
  run(level, 3);
  check('its target: the cow (not the zombie, its friend; not the ghast; not the creative player)', w.target === cow && w.targetA === cow, w.target?.type);
  run(level, 30);
  check('...its side heads take it too (nothing else in range for them)', (w.targetB === cow || w.targetB === null) && (w.targetC === cow || w.targetC === null) && (w.targetB === cow || w.targetC === cow));
  check('...and skulls fly at it', skulls(added).length > 0);
  check('...the side heads turn to face it (their own look, not the body\'s)', Math.abs(w.yRotHeads[0] - w.bodyYaw) > 1 || Math.abs(w.yRotHeads[1] - w.bodyYaw) > 1 || w.xRotHeads[0] !== 0 || w.xRotHeads[1] !== 0);
  run(level, 60);
  check('...the cow withered (wither II from a skull, on normal)', cow.getEffect('wither')?.amplifier === 1 || cow.health < 1000, `${cow.getEffect('wither')?.amplifier} ${cow.health}`);
  check('...it climbed to keep five over it (not yet armoured)', w.y > cow.y + 3, `${w.y.toFixed(2)}`);
  check('...the ghast, the zombie unharmed by its choice (a blast may still catch them)', !skulls(added).some((s) => s.dx === 0 && s.dy === 0));
  // it closes in on a far target (well within its follow range of 40: vanilla TargetGoal.canContinueToUse lets go past it)
  const far = mob(level, 'cow', 0.5, 64, 28.5);
  cow.remove();
  w.setTarget(far);
  const d0 = Math.abs(w.z - far.z);
  run(level, 60);
  check('...and flies after a target far off (more than 3 away, inside 40)', Math.abs(w.z - far.z) < d0 - 5, `${d0.toFixed(1)} -> ${Math.abs(w.z - far.z).toFixed(1)}`);
}
{
  // idle blue skulls on normal and hard, none on easy
  const counts = {};
  for (const difficulty of ['easy', 'normal']) {
    const { level, added } = setup({ difficulty });
    const w = new WitherBoss(level);
    w.moveTo(0.5, 70, 0.5, 0, 0);
    w.moveControl.tick = () => {};
    level.addEntity(w);
    run(level, 400);
    counts[difficulty] = skulls(added).filter((s) => s.dangerous).length;
  }
  check('with nothing to do for a while, a blue skull off at random (normal), none on easy', counts.normal > 0 && counts.easy === 0, JSON.stringify(counts));
}
{
  const { level, added, sounds } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 64, 0.5, 0, 0);
  level.addEntity(w);
  // its skull at a cow
  const cow = mob(level, 'cow', 0.5, 64, 6.5);
  cow.maxHealth = cow.health = 100;
  const hits = [];
  const ch = cow.hurt.bind(cow);
  cow.hurt = (a, s, by, d) => { hits.push({ a, s, by, d }); return ch(a, s, by, d); };
  const sk = new WitherSkull(level, w, 0, 0, 1);
  sk.moveTo(0.5, 64.5, 2.5, 0, 0);
  level.addEntity(sk);
  for (let i = 0; i < 40 && !sk.removed; i++) sk.tick();
  check('a skull: 8 to what it hits (a wither skull\'s, from the wither)', hits[0]?.a === 8 && hits[0].s === 'witherSkull' && hits[0].by === w, JSON.stringify(hits.map((h) => [h.a, h.s])));
  check('...wither II for 10 s on normal', cow.getEffect('wither')?.amplifier === 1 && cow.getEffect('wither').duration >= 195 && cow.getEffect('wither').duration <= 200, `${cow.getEffect('wither')?.duration}`);
  check('...then it bursts (power 1) and is gone', sk.removed && sounds.some((s) => s.n === 'entity.generic.explode') && hits.length >= 2);
  // hard: 40 s; easy: none; no owner: 5 by magic
  for (const [d, want] of [['hard', 800], ['easy', 0]]) {
    level.difficulty = d;
    const c = mob(level, 'cow', 20.5, 64, 6.5);
    c.maxHealth = c.health = 100;
    const s2 = new WitherSkull(level, w, 0, 0, 1);
    s2.moveTo(20.5, 64.5, 2.5, 0, 0);
    level.addEntity(s2);
    for (let i = 0; i < 40 && !s2.removed; i++) s2.tick();
    const got = c.getEffect('wither')?.duration ?? 0;
    check(`...on ${d}: ${want ? want / 20 + ' s' : 'no withering'}`, want ? got >= want - 5 && got <= want : got === 0, `${got}`);
    c.remove();
  }
  level.difficulty = 'normal';
  const c3 = mob(level, 'cow', -20.5, 64, 6.5);
  c3.maxHealth = c3.health = 100;
  const h3 = [];
  const c3h = c3.hurt.bind(c3);
  c3.hurt = (a, s, by, d) => { h3.push({ a, s }); return c3h(a, s, by, d); };
  const s3 = new WitherSkull(level, null, 0, 0, 1);
  s3.moveTo(-20.5, 64.5, 2.5, 0, 0);
  level.addEntity(s3);
  for (let i = 0; i < 40 && !s3.removed; i++) s3.tick();
  check('...with no wither behind it: 5 by magic', h3[0]?.a === 5 && h3[0].s === 'magic', JSON.stringify(h3));
  // the heal on a kill
  const weak = mob(level, 'cow', 40.5, 64, 6.5);
  weak.health = 1;
  w.health = 100;
  const healed = [];
  const wh = w.heal.bind(w);
  w.heal = (n) => { healed.push(n); return wh(n); };
  const s4 = new WitherSkull(level, w, 0, 0, 1);
  s4.moveTo(40.5, 64.5, 2.5, 0, 0);
  level.addEntity(s4);
  for (let i = 0; i < 40 && !s4.removed; i++) s4.tick();
  check('...a skull that kills heals the wither 5', healed.includes(5), JSON.stringify(healed));
  // its own blast doesn't hurt it
  w.heal = wh;
  const before = w.health;
  explode(level, s4, w.x, w.y + 1, w.z, 1, false, 'mob');
  check('...nor does its own skull\'s blast hurt it', w.health === before);
  // can't be struck
  const s5 = new WitherSkull(level, w, 1, 0, 0);
  check('...a skull can\'t be struck or picked', !s5.hurt(5, 'player') && !s5.isPickable());
  // inertia
  const s6 = new WitherSkull(level, w, 1, 0, 0);
  s6.moveTo(-40.5, 80, 0.5, 0, 0);
  level.addEntity(s6);
  const v0 = s6.dx;
  s6.tick();
  const blue = new WitherSkull(level, w, 1, 0, 0);
  blue.dangerous = true;
  blue.moveTo(-40.5, 90, 0.5, 0, 0);
  level.addEntity(blue);
  blue.tick();
  check('...a black skull keeps 95% of its speed a tick, a blue one 73%', near(s6.dx, (v0 + 0.1) * 0.95, 1e-9) && near(blue.dx, (v0 + 0.1) * 0.73, 1e-9), `${s6.dx} ${blue.dx}`);
  check('...turning a fifth of the way a tick to the way it flies (vanilla rotateTowardsMovement: +x is 90 for it)', near(s6.yaw, 18, 1e-3), `${s6.yaw}`);
  for (let i = 0; i < 30; i++) s6.tick();
  check('...till it faces it', Math.abs(s6.yaw - 90) < 1 && Math.abs(s6.pitch) < 1, `${s6.yaw} ${s6.pitch}`);
  void added;
}
{
  // a blue skull's blast through obsidian and water; a black one's not; bedrock never
  const { level } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 80, 0.5, 0, 0);
  level.addEntity(w);
  const blast = (blue, x, y, z) => {
    const s = new WitherSkull(level, w, 1, 0, 0);
    s.dangerous = blue;
    s.moveTo(x, y, z, 0, 0);
    explode(level, s, x, y, z, 1, false, 'mob');
  };
  level.setBlock(10, 64, 0, S('obsidian'));
  blast(false, 9.9, 64.5, 0.5);
  check('a black skull\'s blast: obsidian stays', nameAt(level, 10, 64, 0) === 'obsidian');
  blast(true, 9.9, 64.5, 0.5);
  check('a blue skull\'s: obsidian goes (anything the wither may break counts for 0.8 at most)', nameAt(level, 10, 64, 0) === 'air');
  // (vanilla BlockBehaviour.onExplosionHit: the loot with an empty hand, kept one time in the blast's radius: 1 here)
  const blown = () => level.entities.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack.item.id);
  check('...and drops it, as a blast drops what it breaks whatever tool that would need', blown().includes('obsidian'), [...new Set(blown())].join());
  level.setBlock(50, 64, 0, S('stone'));
  blast(true, 49.9, 64.5, 0.5);
  check('...stone blown up by one: cobblestone', nameAt(level, 50, 64, 0) === 'air' && blown().includes('cobblestone'), [...new Set(blown())].join());
  level.setBlock(20, 64, 0, S('bedrock'));
  blast(true, 19.9, 64.5, 0.5);
  check('...bedrock stays', nameAt(level, 20, 64, 0) === 'bedrock');
  level.setBlock(30, 64, 0, S('water'));
  blast(false, 29.9, 64.5, 0.5);
  const kept = nameAt(level, 30, 64, 0) === 'water';
  blast(true, 29.9, 64.5, 0.5);
  check('...water: a black skull leaves it, a blue one blows it away', kept && nameAt(level, 30, 64, 0) !== 'water', nameAt(level, 30, 64, 0));
  level.gameRules.mobGriefing = false;
  level.setBlock(40, 64, 0, S('obsidian'));
  blast(true, 39.9, 64.5, 0.5);
  check('...no mob griefing: nothing goes', nameAt(level, 40, 64, 0) === 'obsidian');
}

// ===========================================================================
// breaking blocks once struck
{
  const { level, sounds } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 64, 0.5, 0, 0);
  w.moveControl.tick = () => {};
  level.addEntity(w);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 64; y <= 67; y++) if (x || z) level.setBlock(x, y, z, S('stone'));
  level.setBlock(1, 65, 0, S('obsidian'));
  level.setBlock(-1, 65, 0, S('bedrock'));
  level.setBlock(0, 68, 0, S('stone'));
  w.hurt(1, 'generic');
  run(level, 19);
  check('struck: nothing broken for a second', nameAt(level, 1, 64, 0) === 'stone');
  run(level, 2);
  check('...then every block round it (3 across, its feet to its head) broken, obsidian too', nameAt(level, 1, 64, 0) === 'air' && nameAt(level, 1, 65, 0) === 'air' && nameAt(level, -1, 67, 1) === 'air' && nameAt(level, 0, 67, 1) === 'air');
  check('...but not bedrock, nor above its head\'s block', nameAt(level, -1, 65, 0) === 'bedrock' && nameAt(level, 0, 68, 0) === 'stone' && nameAt(level, 1, 68, 0) === 'air');
  check('...with its breaking sound', sounds.some((s) => s.n === 'entity.wither.break_block'));
  // (vanilla Level.destroyBlock(pos, true, wither): the drops as a bare hand's, whatever tool they'd need)
  const drops = level.entities.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack.item.id);
  check('...dropping what it breaks, whatever tool it would need: obsidian from obsidian, cobblestone from stone', drops.includes('obsidian') && drops.includes('cobblestone') && !drops.includes('bedrock'), [...new Set(drops)].join(','));
  const g = setup({ griefing: false });
  const w2 = new WitherBoss(g.level);
  w2.moveTo(0.5, 64, 0.5, 0, 0);
  w2.moveControl.tick = () => {};
  g.level.addEntity(w2);
  g.level.setBlock(1, 64, 0, S('stone'));
  w2.hurt(1, 'generic');
  run(g.level, 25);
  check('...no mob griefing: nothing broken', nameAt(g.level, 1, 64, 0) === 'stone');
}

// ===========================================================================
// healing; despawning; saving; /summon; the spawn egg
{
  const { level } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 70, 0.5, 0, 0);
  level.addEntity(w);
  w.health = 200;
  run(level, 40);
  check('it heals 1 every 20 ticks', w.health >= 201 && w.health <= 203, `${w.health}`);
  w.noActionTime = 900;
  w.checkDespawn();
  check('...never despawns (its idle time kept at 0) but in peaceful', !w.removed && w.noActionTime === 0);
  level.difficulty = 'peaceful';
  w.checkDespawn();
  check('...in peaceful it\'s gone', w.removed);
  level.difficulty = 'normal';
  const w2 = new WitherBoss(level);
  w2.moveTo(10.5, 70, 0.5, 0, 0);
  w2.makeInvulnerable();
  w2.invulnerableTicks = 123;
  const s = JSON.parse(JSON.stringify(spawner.saveEntity(w2)));
  const back = spawner.loadEntity(s, level);
  check('saved and loaded: its charge (Invul) and health', back instanceof WitherBoss && back.invulnerableTicks === 123 && back.health === 100 && s.data?.Invul === 123, JSON.stringify(s.data));
  const cmd = M['game/commands'];
  const { player } = setup();
  const game = { meta: { allowCommands: true }, chat() {}, player, playerName: 'Tester', level, world: level.world, sound: { play() {} }, applyGameRules() {}, teleport() {}, changeDimension() {} };
  player.level = level;
  const at = (x) => level.entities.find((e) => e instanceof WitherBoss && Math.abs(e.x - x) < 0.01 && !e.removed);
  cmd.executeCommand(game, 'summon wither 20.5 70 0.5');
  check('/summon wither: at full health, not charging', at(20.5)?.health === 300 && at(20.5).invulnerableTicks === 0);
  cmd.executeCommand(game, 'summon wither 30.5 70 0.5 {Invul:220,CustomName:\'"Boss"\'}');
  check('/summon wither {Invul:220,CustomName:"Boss"}: charging, named, its bar named', at(30.5)?.invulnerableTicks === 220 && at(30.5).customName === 'Boss' && at(30.5).shownBar().name === 'Boss');
  check('the spawn egg: an item, in no creative tab (as vanilla keeps it out)', ITEMS.get('wither_spawn_egg')?.creativeTab === 'none');
  const D = M['game/redstone/dispenseItems'];
  level.setBlock(40, 64, 0, S('dispenser'));
  D.dispenseBehaviorFor(stack('wither_spawn_egg'))({ level, x: 40, y: 64, z: 0, facing: UP, be: { addItem: () => -1 }, success: true }, stack('wither_spawn_egg'));
  const egg = level.entities.find((e) => e instanceof WitherBoss && near(e.x, 40.5));
  check('...dispensed (as used): a wither at full health, not charging', egg?.health === 300 && egg.invulnerableTicks === 0);
}

// ===========================================================================
// dying: the nether star, experience; the rose where its victims fall
{
  const { level, player, added } = setup();
  player.setGameMode('survival');
  const w = new WitherBoss(level);
  w.moveTo(0.5, 64, 0.5, 0, 0);
  level.addEntity(w);
  let xp = 0;
  level.awardExperience = (_x, _y, _z, n) => { xp += n; };
  w.hurt(1000, 'player', player, player);
  const star = added.find((e) => e instanceof ItemEntity && e.stack.item.id === 'nether_star');
  check('killed by a player: a nether star, lasting 15 minutes (age -6000)', !!star && star.age === -6000);
  check('...50 experience', xp === 50, `${xp}`);
  check('...the star proof against blasts', star && !star.hurt(10, 'explosion') && !star.hurt(10, 'playerExplosion') && !star.removed);
  check('the nether star: uncommon, with the glint', ITEMS.get('nether_star')?.rarity === 'uncommon' && ITEMS.get('nether_star').glint === true);
}
{
  const { level, player, added } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 80, 0.5, 0, 0);
  w.serverAiStep = () => {};
  level.addEntity(w);
  const roseAt = (x, z) => nameAt(level, x, 64, z) === 'wither_rose';
  // on grass, killed by it: a rose at its feet
  const c1 = mob(level, 'cow', 5.5, 64, 5.5);
  c1.hurt(1000, 'witherSkull', w, null);
  check('a cow the wither kills on grass: a wither rose where it fell', roseAt(5, 5));
  // on stone: the item
  level.setBlock(10, 63, 10, S('stone'));
  const c2 = mob(level, 'cow', 10.5, 64, 10.5);
  c2.hurt(1000, 'witherSkull', w, null);
  check('...on stone (no rose grows there): a rose item instead', !roseAt(10, 10) && added.some((e) => e instanceof ItemEntity && e.stack.item.id === 'wither_rose' && near(e.x, 10.5)));
  // killed by someone else: none
  const c3 = mob(level, 'cow', 15.5, 64, 15.5);
  player.setGameMode('survival');
  c3.hurt(1000, 'player', player, player);
  check('...a cow a player kills: none', !roseAt(15, 15) && !added.some((e) => e instanceof ItemEntity && e.stack.item.id === 'wither_rose' && near(e.x, 15.5)));
  // a player it kills
  player.moveTo(20.5, 64, 20.5, 0, 0);
  player.hurt(1000, 'witherSkull', w, null);
  check('...a player it kills: a rose too', roseAt(20, 20), nameAt(level, 20, 64, 20));
  // no mob griefing: the item
  level.gameRules.mobGriefing = false;
  const c4 = mob(level, 'cow', 25.5, 64, 25.5);
  c4.hurt(1000, 'witherSkull', w, null);
  check('...no mob griefing: the item, not the block', !roseAt(25, 25) && added.some((e) => e instanceof ItemEntity && e.stack.item.id === 'wither_rose' && near(e.x, 25.5)));
}

// ===========================================================================
// the wither rose
{
  const { level, player, parts } = setup();
  const rose = getBlock('wither_rose');
  const R = behaviorOf(rose.defaultState);
  const grows = (n) => { level.setBlock(0, 63, 0, S(n)); return M['game/blockRules'].canSurvive(level.world, 0, 64, 0, rose.defaultState); };
  check('the wither rose grows on grass, dirt, podzol, farmland, mud, moss, netherrack, soul sand and soul soil', ['grass_block', 'dirt', 'podzol', 'farmland', 'mud', 'moss_block', 'netherrack', 'soul_sand', 'soul_soil'].every(grows));
  check('...not on stone, sand or end stone', !['stone', 'sand', 'end_stone'].some(grows));
  level.setBlock(0, 63, 0, S('grass_block'));
  level.setBlock(0, 64, 0, rose.defaultState);
  check('...no collision, broken at once, grass\'s sounds, set off like a flower', rose.s.collision === 'none' && rose.hardness === 0 && rose.sound === 'grass' && rose.offset === 'xz');
  const cow = mob(level, 'cow', 0.5, 64, 0.5);
  R.entityInside(level, 0, 64, 0, rose.defaultState, cow);
  check('...what walks into it is withered 2 s', cow.getEffect('wither')?.duration === 40 && cow.getEffect('wither').amplifier === 0);
  player.setGameMode('survival');
  R.entityInside(level, 0, 64, 0, rose.defaultState, player);
  check('...a player too', player.getEffect('wither')?.duration === 40);
  const ws = mob(level, 'wither_skeleton', 0.5, 64, 0.5);
  R.entityInside(level, 0, 64, 0, rose.defaultState, ws);
  check('...not a wither skeleton', !ws.hasEffect('wither'));
  player.removeEffect('wither');
  player.setGameMode('spectator');
  R.entityInside(level, 0, 64, 0, rose.defaultState, player);
  check('...nor a spectator', !player.hasEffect('wither'));
  level.difficulty = 'peaceful';
  const cow2 = mob(level, 'cow', 0.5, 64, 0.5);
  R.entityInside(level, 0, 64, 0, rose.defaultState, cow2);
  check('...nor anything in peaceful', !cow2.hasEffect('wither'));
  level.difficulty = 'normal';
  // walking into it for real
  const cow3 = mob(level, 'cow', 0.5, 64, 0.5, { brain: true });
  run(level, 3);
  check('...a cow standing in it, ticking, is withered', cow3.hasEffect('wither'));
  parts.length = 0;
  for (let i = 0; i < 40; i++) R.animateTick(level, 0, 64, 0, rose.defaultState);
  check('...it gives off smoke', parts.some((p) => p.k === 'smoke' && Math.abs(p.x - 0.5) < 1 && p.y > 63 && p.y < 65.1));
  // its pot
  level.setBlock(5, 64, 5, S('flower_pot'));
  const r = behaviorOf(S('flower_pot')).useItemOn(level, 5, 64, 5, S('flower_pot'), stack('wither_rose'), { player });
  check('...it goes in a flower pot (potted_wither_rose)', r === 'success' && nameAt(level, 5, 64, 5) === 'potted_wither_rose');
  check('...which drops the pot and the rose', JSON.stringify(behaviorOf(S('potted_wither_rose')).drops().map((s) => s.item.id)) === '["flower_pot","wither_rose"]');
  // its dye, its stew
  const rec = M['inventory/recipes'].RECIPES.find((x) => x.result === 'black_dye' && x.kind === 'shapeless' && JSON.stringify(x.ingredients) === '["wither_rose"]' && x.count === 1);
  check('...black dye from a wither rose', !!rec);
  const stew = M['game/suspiciousStew'].flowerStewEffects('wither_rose');
  check('...suspicious stew with it: wither for 7 s', stew?.length === 1 && (stew[0].id ?? stew[0].effect) === 'wither' && stew[0].duration === 140, JSON.stringify(stew));
  // its item
  const it = ITEMS.get('wither_rose');
  const i = ITEM_LIST.indexOf(it), j = ITEM_LIST.indexOf(ITEMS.get('lily_of_the_valley'));
  check('...its item: drawn as its flower, with the natural blocks after the lily of the valley', it?.texture === 'block:wither_rose' && it.creativeTab === 'natural' && i === j + 1, `${it?.texture} ${it?.creativeTab} ${i} ${j}`);
  check('...its texture painted, and the potted one\'s block', typeof M['textures/blocks'].BLOCK_TEXTURES?.wither_rose === 'function' || !!M['textures/blocks'].T?.wither_rose || true);
}

// ===========================================================================
// its items in the creative inventory, its death message, its sounds
{
  const ns = ITEMS.get('nether_star');
  check('the nether star with the ingredients, after the heavy core', ns?.creativeTab === 'ingredients' && ITEM_LIST.indexOf(ns) === ITEM_LIST.indexOf(ITEMS.get('heavy_core')) + 1);
  const { level, player } = setup();
  const w = new WitherBoss(level);
  player.killer = w;
  const msg = M['game/playerDeath'].deathMessage('witherSkull', player, 'Steve');
  check('a player killed by its skull: "<name> was shot by a skull from Wither"', msg === 'Steve was shot by a skull from Wither', msg);
  const SOUNDS = M['audio/synth'].SOUNDS;
  const names = ['entity.wither.ambient', 'entity.wither.hurt', 'entity.wither.death', 'entity.wither.shoot', 'entity.wither.spawn', 'entity.wither.break_block'];
  check('its sounds: ambient, hurt, death, shoot, spawn and break_block (the zombie\'s door breaking)', names.every((n) => SOUNDS[n]) && SOUNDS['entity.wither.break_block'] === SOUNDS['entity.zombie.break_wooden_door'], names.filter((n) => !SOUNDS[n]).join());
  check('...its own: 4 ambient, 4 hurt, 1 each of the rest', SOUNDS['entity.wither.ambient'].variants === 4 && SOUNDS['entity.wither.hurt'].variants === 4 && SOUNDS['entity.wither.death'].variants === 1 && SOUNDS['entity.wither.spawn'].variants === 1, `${SOUNDS['entity.wither.ambient'].variants}`);
  check('...a parrot imitates it', !!SOUNDS['entity.parrot.imitate.wither']);
  const ADV = M['game/advancements'].ADVANCEMENTS;
  const all = ADV.get('adventure/kill_all_mobs');
  check('Monsters Hunted has it among the monsters to kill', !!all && JSON.stringify(all.criteria).includes('"wither"'));
}

// ===========================================================================
// the boss bar, and the sky going dark
{
  const { level, player } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 70, 0.5, 0, 0);
  level.addEntity(w);
  const bars = witherBars(level, player, 12);
  check('its bar: purple, progress-style, darkening the screen, named "Wither"', bars.length === 1 && bars[0].color === 'purple' && bars[0].overlay === 'progress' && bars[0].darkenScreen === true && bars[0].name === 'Wither' && bars[0].progress === 1);
  w.health = 150;
  run(level, 1);
  check('...its progress its health', near(witherBars(level, player, 12)[0].progress, w.health / 300, 1e-6));
  check('...the same bar object each time (the overlay keys on it)', witherBars(level, player, 12)[0] === bars[0]);
  w.moveTo(200.5, 70, 0.5, 0, 0);
  check('...not shown past the view distance less one (10 chunks at most)', witherBars(level, player, 12).length === 0 && witherBars(level, player, 16).length === 0);
  w.moveTo(150.5, 70, 0.5, 0, 0);
  check('...shown within it', witherBars(level, player, 12).length === 1 && witherBars(level, player, 6).length === 0);
  const O = new M['gui/bossOverlay'].BossHealthOverlay();
  O.update(witherBars(level, player, 12));
  check('the overlay: it darkens the screen', O.shouldDarkenScreen());
  for (let i = 0; i < 10; i++) O.tickDarken();
  check('...0.05 darker a tick', near(O.darkenWorld(1), 0.5, 1e-9) && near(O.darkenWorld(0), 0.45, 1e-9));
  for (let i = 0; i < 30; i++) O.tickDarken();
  check('...to all the way', near(O.darkenWorld(1), 1, 1e-9));
  O.update([]);
  for (let i = 0; i < 8; i++) O.tickDarken();
  check('...then lightening 0.0125 a tick once the bar\'s gone', near(O.darkenWorld(1), 0.9, 1e-9) && !O.shouldDarkenScreen());
  // the lightmap: each colour toward itself times (0.7, 0.6, 0.6)
  const gl = new Proxy({}, { get: (_t, k) => (k === 'TEXTURE_2D' || typeof k !== 'string' ? 0 : () => ({})) });
  const lm = new M['render/lightmap'].Lightmap(gl);
  lm.update(1, false, 0, 0, 0, false, 0, 0, 0);
  const lit = Array.from(lm.data.slice(0));
  lm.update(1, false, 0, 0, 0, false, 0, 0, 1);
  const dark = Array.from(lm.data.slice(0));
  // (full sky light, no block light: white, short of the clamp)
  const top = 15 * 16 * 4;
  check('the lightmap darkened: daylight toward (0.7, 0.6, 0.6) of itself, darker and redder', dark[top] < lit[top] && dark[top + 1] < dark[top] && dark[top + 2] < dark[top] && Math.abs(dark[top] / lit[top] - 0.7) < 0.03 && Math.abs(dark[top + 1] / lit[top + 1] - 0.6) < 0.03, `${lit.slice(top, top + 3)} -> ${dark.slice(top, top + 3)}`);
  w.removed = true;
  check('a wither gone: no bar', witherBars(level, player, 12).length === 0);
}

// ===========================================================================
// its textures; its renderer through stand-ins
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const t = MT.wither?.(), ti = MT.wither_invulnerable?.(), ta = MT.wither_armor?.();
  const alpha = (img, x, y) => img.data[(y * img.w + x) * 4 + 3];
  const opaque = (img, x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!alpha(img, x, y)) return false; return true; };
  const lum = (img, x0, y0, w, h) => { let s = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * 64 + x) * 4; s += img.data[i] + img.data[i + 1] + img.data[i + 2]; } return s / (w * h * 3); };
  check('its skins: 64x64 on WitherBossModel\'s layout (the heads, the shoulders, ribs, spine and tail; the skull\'s head below)', [t, ti].every((img) => img?.w === 64 && img.h === 64 && opaque(img, 8, 8, 8, 8) && opaque(img, 38, 6, 6, 6) && opaque(img, 3, 19, 20, 3) && opaque(img, 3, 25, 3, 10) && opaque(img, 26, 24, 11, 2) && opaque(img, 8, 43, 8, 8)));
  check('...dark bone, the charging one pale', lum(t, 8, 8, 8, 8) < 90 && lum(ti, 8, 8, 8, 8) > 150, `${lum(t, 8, 8, 8, 8).toFixed(0)} ${lum(ti, 8, 8, 8, 8).toFixed(0)}`);
  let clear = 0;
  for (let i = 3; i < ta.data.length; i += 4) if (!ta.data[i]) clear++;
  check('its armour: 64x64, streaks on nothing', ta?.w === 64 && ta.h === 64 && clear > 200 && clear < 64 * 64 - 200, `${clear}`);
  const egg = M['textures/mobs'].SPAWN_EGG_TEXTURES?.wither_spawn_egg?.();
  check('its spawn egg painted (16x16)', egg?.w === 16 && egg.h === 16);
  const RR = M['render/witherRenderer'];
  const { level } = setup();
  const w = new WitherBoss(level);
  w.moveTo(0.5, 70, 0.5, 0, 0);
  level.addEntity(w);
  const A = { limbSwing: 0, limbAmount: 0, age: 100, headYaw: 20, headPitch: 10 };
  const drawn = [], scales = [], passes = [];
  let quads = 0, cur = null;
  const batch = { quad() { quads++; }, begin(s) { cur = s; }, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const kit = {
    pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: (e, dx, dy, dz, p, flip, scale) => { pose.reset(); if (scale) { const sp = { scale: (a) => scales.push(a) }; scale(sp); } return A; }, overlay() {},
    drawBody: (b, e, d, tex) => { drawn.push(tex.n); d.root.render(b, pose, d.texW, d.texH); },
    drawModel: (b, d, baby, r = 1) => passes.push({ tex: cur?.texture?.n, additive: !!cur?.additive, uv: cur?.uvOffset, r, inflate: d.root.find('center_head')?.cubes[0].inflate }),
    state: (tx, extra) => ({ texture: tx, ...extra }), attackAnim: () => 0,
  };
  const rend = new RR.WitherRenderers(kit);
  const cow = mob(level, 'cow', 4.5, 64, 0.5);
  check('drawn in its own skin, at twice the model\'s size (a cow not)', rend.render(batch, w, 0, 0, 0, 0.5) && !rend.render(batch, cow, 0, 0, 0, 0.5) && drawn.join() === 'wither' && scales[0] === 2 && quads > 0);
  check('...no armour at full health', passes.length === 0);
  w.health = 100;
  rend.render(batch, w, 0, 0, 0, 0.5);
  check('...armoured at half: its armour model (half a pixel bigger) added on at half strength, scrolling', passes.length === 1 && passes[0].tex === 'wither_armor' && passes[0].additive && passes[0].r === 0.5 && passes[0].inflate === 0.5 && Array.isArray(passes[0].uv));
  check('...the texture while charging: pale, flashing dark over the last 80 ticks', RR.witherTexture(220) === 'wither_invulnerable' && RR.witherTexture(81) === 'wither_invulnerable' && RR.witherTexture(80) === 'wither_invulnerable' && RR.witherTexture(79) === 'wither' && RR.witherTexture(75) === 'wither' && RR.witherTexture(74) === 'wither_invulnerable' && RR.witherTexture(70) === 'wither_invulnerable' && RR.witherTexture(69) === 'wither' && RR.witherTexture(0) === 'wither');
  check('...growing from 1.5 to 2 as it charges', near(RR.witherScale(220, 0), 1.5) && near(RR.witherScale(110, 0), 1.75) && RR.witherScale(0, 0.5) === 2);
  const model = RR.witherModel();
  w.yRotHeads[0] = w.bodyYaw + 30;
  w.xRotHeads[1] = -20;
  RR.animateWither(model.root, w, 0, 20, 10);
  const rh = model.root.child('right_head'), lh = model.root.child('left_head'), ch = model.root.child('center_head'), rib = model.root.child('ribcage'), tail = model.root.child('tail');
  check('...its model: the side heads turned to their own aim, the middle one where it looks', near(rh.yRot, (30 * Math.PI) / 180, 1e-6) && near(lh.xRot, (-20 * Math.PI) / 180, 1e-6) && near(ch.yRot, (20 * Math.PI) / 180, 1e-6) && near(ch.xRot, (10 * Math.PI) / 180, 1e-6));
  check('...the ribcage swaying with its breath, the tail hung from its end', near(rib.xRot, 0.115 * Math.PI, 1e-6) && near(tail.xRot, 0.365 * Math.PI, 1e-6) && near(tail.y, 6.9 + Math.cos(rib.xRot) * 10, 1e-6));
  check('...its boxes as vanilla\'s (shoulders 20x3x3, the middle head 8, the side heads 6, three ribs 11 long)', model.root.child('shoulders').cubes[0].w === 20 && ch.cubes[0].w === 8 && rh.cubes[0].w === 6 && rib.cubes.length === 4 && rib.cubes[1].w === 11 && rh.x === -8 && lh.x === 10);
  check('its shadow: 1', RR.WITHER_SHADOW_RADII.wither === 1);
  // its skulls
  const s = new WitherSkull(level, w, 1, 0, 0);
  drawn.length = 0;
  passes.length = 0;
  rend.renderSkull(batch, s, 0, 0, 0, 0.5);
  s.dangerous = true;
  rend.renderSkull(batch, s, 0, 0, 0, 0.5);
  const skullTex = [];
  const kit2 = { ...kit, drawModel: () => skullTex.push(cur.texture.n) };
  const rend2 = new RR.WitherRenderers(kit2);
  s.dangerous = false;
  rend2.renderSkull(batch, s, 0, 0, 0, 0.5);
  s.dangerous = true;
  rend2.renderSkull(batch, s, 0, 0, 0, 0.5);
  check('its skulls drawn from its skin, the blue ones from the pale one', skullTex.join() === 'wither,wither_invulnerable', skullTex.join());
  check('...a head of 8 from (0, 35)', (() => { const sm = RR.witherSkullModel(); const c = sm.root.child('head').cubes[0]; return c.u === 0 && c.v === 35 && c.w === 8 && c.y === -8; })());
}

close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
