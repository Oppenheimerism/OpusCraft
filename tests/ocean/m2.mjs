// Headless checks for Stage 5 M2 (node tests/ocean/m2.mjs): guardians and elder guardians — swimming, flopping on
// land, the laser (charge, damage, losing sight), thorns, loot, the elder's curse, spawn rules, saving — and their
// renderers (textures, the model's animation, the beam, the ghostly face) through stand-ins, and their sounds.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/entity/guardian.ts', '/src/game/ocean.ts', '/src/item/item.ts',
  '/src/render/oceanRenderers.ts', '/src/textures/mobs.ts', '/src/render/entityRenderer.ts', '/src/audio/gen/ocean.ts',
  '/src/textures/items.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, G, ocean, itemMod, R, texMobs, entityRenderer, oceanAudio, itemTex] = mods;
const { S, BLOCKS, STATE_BLOCK } = blockMod;
const { ITEMS } = itemMod;
const { MOB_TEXTURES } = texMobs;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

/** stone from y 40 to 49; water from 50 to 62 over x, z in [-24, 24); dry floor round it */
function setup({ difficulty = 'normal' } = {}) {
  const world = new worldMod.World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -64; x < 64; x++) for (let z = -64; z < 64; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 40; y <= 49; y++) c.setState(x & 15, y, z & 15, S('stone'));
    if (x >= -24 && x < 24 && z >= -24 && z < 24) for (let y = 50; y <= 62; y++) c.setState(x & 15, y, z & 15, S('water'));
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new levelMod.Level(world, 'test');
  const sounds = [], parts = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z }); }, entityEffect() {} };
  level.difficulty = difficulty;
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 10;
  const player = new playerMod.Player(level);
  player.moveTo(0.5, 55, 8.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts };
}
const spawn = (level, type, x, y, z) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  level.addEntity(m);
  return m;
};
/** ticks the level, the player held where it is */
const tickPinned = (level, player, n, until) => {
  const [px, py, pz] = [player.x, player.y, player.z];
  for (let i = 0; i < n; i++) {
    level.tick();
    player.moveTo(px, py, pz, player.yaw, player.pitch);
    player.dx = player.dy = player.dz = 0;
    player.fallDistance = 0;
    player.air = 300;
    if (until?.()) return i + 1;
  }
  return n;
};

// --- what they are
{
  const { level } = setup();
  const g = spawner.createMob('guardian', level), e = spawner.createMob('elder_guardian', level);
  check('guardian: 30 health, 0.85 across, 6 to bite, 10 xp', g instanceof G.Guardian && g.maxHealth === 30 && g.width === 0.85 && g.height === 0.85 && g.attackDamage === 6 && g.xpReward === 10);
  check('elder: 80 health, 1.9975 across, 8 to bite, never despawns', e instanceof G.ElderGuardian && e.maxHealth === 80 && Math.abs(e.width - 1.9975) < 1e-9 && e.attackDamage === 8 && e.persistenceRequired);
  check('their eyes halfway up', g.eyeHeight === 0.425 && Math.abs(e.eyeHeight - 0.99875) < 1e-9);
  check('the laser charges 80 ticks (the elder\'s 60)', g.attackDuration() === 80 && e.attackDuration() === 60);
  check('names', spawner.entityDisplayName('guardian') === 'Guardian' && spawner.entityDisplayName('elder_guardian') === 'Elder Guardian');
  check('spawn eggs, with sprites', ['guardian', 'elder_guardian'].every((m) => ITEMS.get(`${m}_spawn_egg`)?.creativeTab === 'spawn_eggs' && itemTex.ITEM_TEXTURES[`${m}_spawn_egg`]));
  const d = spawner.saveEntity(e);
  e.health = 50;
  const d2 = spawner.saveEntity(e);
  const back = spawner.loadEntity(d2, level);
  check('saved and loaded', d && back instanceof G.ElderGuardian && back.health === 50);
}

// --- swimming about, and flopping on land
{
  const { level, player, sounds, parts } = setup();
  player.gameMode = 'creative';
  const g = spawn(level, 'guardian', 0.5, 56, -10.5);
  const land = spawn(level, 'guardian', 40.5, 50, 0.5);
  let moved = 0, wasMoving = false, minY = 99, maxY = 0, landTop = 0, tail0 = g.tailAnimation;
  const x0 = g.x, z0 = g.z;
  for (let i = 0; i < 600; i++) {
    level.tick();
    moved = Math.max(moved, Math.hypot(g.x - x0, g.z - z0));
    wasMoving ||= g.moving;
    minY = Math.min(minY, g.y);
    maxY = Math.max(maxY, g.y);
    if (i < 80) landTop = Math.max(landTop, land.y);
  }
  check('a guardian swims about', moved > 3 && wasMoving, `moved ${moved.toFixed(1)}`);
  // (it may bob up out of the surface for a moment, as vanilla's do)
  check('...staying in the water', minY >= 49.9 && maxY < 63.6, `${minY.toFixed(2)}..${maxY.toFixed(2)}`);
  check('...its tail swishing', g.tailAnimation > tail0 + 30);
  check('...bubbles behind it as it swims', parts.some((p) => p.k === 'bubble'));
  check('...never drowning', g.isAlive && g.health === 30);
  check('on land it flops about (a block or so high)', landTop > 50.8 && landTop < 52 && sounds.some((s) => s.n === 'entity.guardian.flop'), `top ${landTop.toFixed(2)}`);
  check('...its spikes twitching', land.spikesAnimation !== land.spikesAnimationO);
  const amb = sounds.filter((s) => s.n.startsWith('entity.guardian.ambient'));
  check('ambient squeals, "_land" out of the water', amb.some((s) => s.n === 'entity.guardian.ambient') && amb.some((s) => s.n === 'entity.guardian.ambient_land'), `${amb.length}`);
}

// --- the laser
{
  const { level, player, sounds } = setup();
  const g = spawn(level, 'guardian', 0.5, 55, 0.5);
  let beamOn = -1, tickHit = -1, pitch = 0, targeted = false;
  for (let i = 0; i < 500 && tickHit < 0; i++) {
    tickPinned(level, player, 1);
    if (beamOn < 0 && g.activeAttackTarget() === player) {
      beamOn = i;
      targeted = g.target === player;
      pitch = sounds.find((s) => s.n === 'entity.guardian.attack')?.p ?? 0;
    }
    if (player.health < 20) tickHit = i;
  }
  check('it turns its laser on a player 8 blocks off', beamOn >= 0 && targeted, `on at tick ${beamOn}`);
  check('...with the charging hum (pitch 1)', pitch === 1);
  check('...and after 80 ticks, it hits: 1 magic, then its 6 bite (5 more past the magic)', tickHit - beamOn === 80 && player.health === 14, `after ${tickHit - beamOn}, health ${player.health}`);
  // (vanilla: if its target goal picks the player straight back up, the spent laser fires again at once — the
  // player's hurt cooldown takes it — before it lets go)
  const off = tickPinned(level, player, 40, () => g.activeAttackTarget() === null);
  check('...then lets go', g.activeAttackTarget() === null && player.health === 14, `after ${off} ticks`);
  // the next charge, and a wall put up between them
  const got = tickPinned(level, player, 400, () => g.activeAttackTarget() === player);
  check('it charges again', g.activeAttackTarget() === player, `${got} ticks`);
  for (let x = -3; x <= 3; x++) for (let y = 50; y <= 62; y++) level.world.setState(x, y, 4, S('stone'));
  tickPinned(level, player, 3);
  check('a wall between them breaks it off', g.activeAttackTarget() === null && g.target !== player);
  check('in creative it doesn\'t go for you', (() => {
    const s2 = setup();
    s2.player.gameMode = 'creative';
    const g2 = spawn(s2.level, 'guardian', 0.5, 55, 0.5);
    tickPinned(s2.level, s2.player, 200);
    return g2.activeAttackTarget() === null && s2.player.health === 20;
  })());
  check('not within 3 blocks', (() => {
    const s2 = setup();
    s2.player.moveTo(0.5, 55, 2.5, 0, 0);
    const g2 = spawn(s2.level, 'guardian', 0.5, 55, 0.5);
    let ever = false;
    tickPinned(s2.level, s2.player, 150, () => {
      g2.moveTo(0.5, 55, 0.5, g2.yaw, g2.pitch);
      ever ||= g2.target === s2.player;
    });
    return !ever && g2.activeAttackTarget() === null;
  })());
}
{
  // the elder: 60 ticks, 3 magic
  const { level, player, sounds } = setup();
  const e = spawn(level, 'elder_guardian', 0.5, 54, -1.5);
  let on = -1, hit = -1;
  for (let i = 0; i < 500 && hit < 0; i++) {
    tickPinned(level, player, 1);
    if (on < 0 && e.activeAttackTarget() === player) on = i;
    if (player.health < 20) hit = i;
  }
  const pitch = sounds.find((s) => s.n === 'entity.guardian.attack')?.p ?? 0;
  check('the elder\'s laser: 60 ticks, 3 magic then its 8 bite (5 more)', on >= 0 && hit - on === 60 && player.health === 12, `after ${hit - on}, health ${player.health}`);
  check('...its hum played faster (80/60)', Math.abs(pitch - 80 / 60) < 1e-9);
}

// --- thorns
{
  const { level, player } = setup();
  const g = spawn(level, 'guardian', 0.5, 55, 0.5);
  g.hurt(1, 'player', player);
  check('struck while still, its spikes prick back (2)', player.health === 18, `${player.health}`);
  const s2 = setup();
  const g2 = spawn(s2.level, 'guardian', 0.5, 55, 0.5);
  g2.moving = true;
  g2.hurt(1, 'player', s2.player);
  check('...not while it swims', s2.player.health === 20);
  const s3 = setup();
  const g3 = spawn(s3.level, 'guardian', 0.5, 55, 0.5);
  g3.hurt(1, 'magic', s3.player);
  g3.invulnerableTime = 0;
  const arrow = { x: 0, y: 0, z: 0, type: 'arrow' };
  g3.hurt(1, 'arrow', s3.player, arrow);
  check('...nor for magic, nor an arrow', s3.player.health === 20);
}

// --- loot
{
  const { level } = setup();
  const tally = {};
  let sponges = 0, n = 400;
  for (let i = 0; i < n; i++) {
    const g = spawner.createMob(i % 2 ? 'elder_guardian' : 'guardian', level);
    g.moveTo(0.5, 55, 0.5, 0, 0);
    const drops = [];
    g.spawnAtLocation = (s) => drops.push(s);
    g.dropLoot(true, 0);
    for (const s of drops) {
      const k = `${i % 2 ? 'e' : 'g'}:${s.item.id}`;
      tally[k] = (tally[k] ?? 0) + s.count;
      if (s.item.id === 'wet_sponge') sponges++;
    }
  }
  const per = (k) => (tally[k] ?? 0) / (n / 2);
  check('0-2 shards a guardian (about 1)', Math.abs(per('g:prismarine_shard') - 1) < 0.2, per('g:prismarine_shard').toFixed(2));
  check('cod and crystals about as often (2 in 5 each)', Math.abs(per('g:cod') - 0.4) < 0.1 && Math.abs(per('g:prismarine_crystals') - 0.4) < 0.1, `${per('g:cod').toFixed(2)} ${per('g:prismarine_crystals').toFixed(2)}`);
  check('the elder: cod more often (1 in 2)', Math.abs(per('e:cod') - 0.5) < 0.12, per('e:cod').toFixed(2));
  check('a wet sponge from every elder a player kills', sponges === n / 2);
  const e = spawner.createMob('elder_guardian', level);
  const drops = [];
  e.spawnAtLocation = (s) => drops.push(s);
  e.dropLoot(false, 0);
  check('...but not otherwise', !drops.some((s) => s.item.id === 'wet_sponge'));
}

// --- the elder's curse
{
  const { level, player, sounds } = setup();
  const e = spawn(level, 'elder_guardian', 0.5, 55, -30.5);
  const curse = () => {
    e.tickCount = 1200 * 5 - e.id;
    e.customServerAiStep();
  };
  curse();
  const mf = player.getEffect('mining_fatigue');
  check('every minute: Mining Fatigue III for 5 minutes, 39 blocks off', mf?.amplifier === 2 && mf.duration === 6000);
  check('...with its moan at the player', sounds.some((s) => s.n === 'entity.elder_guardian.curse' && s.x === player.x && s.v === 1 && s.p === 1));
  check('...and its ghostly face', ocean.elderAppearance.level === level && ocean.elderAppearance.start === level.gameTime);
  check('it keeps within 16 of home', e.hasRestriction() && e.restrictRadius === 16);
  sounds.length = 0;
  curse();
  check('not again while more than a minute of it is left', !sounds.some((s) => s.n === 'entity.elder_guardian.curse'));
  player.getEffect('mining_fatigue').duration = 1100;
  curse();
  check('...but with less than a minute left, again', sounds.some((s) => s.n === 'entity.elder_guardian.curse') && player.getEffect('mining_fatigue').duration === 6000);
  const s2 = setup();
  s2.player.gameMode = 'creative';
  const e2 = spawn(s2.level, 'elder_guardian', 0.5, 55, 0.5);
  e2.tickCount = 1200 - e2.id;
  e2.customServerAiStep();
  check('not on a creative player', !s2.player.getEffect('mining_fatigue'));
  const s3 = setup();
  const e3 = spawn(s3.level, 'elder_guardian', 0.5, 55, -44.5);
  s3.player.moveTo(0.5, 55, 8.5, 0, 0);
  e3.tickCount = 1200 - e3.id;
  e3.customServerAiStep();
  check('not 53 blocks off', !s3.player.getEffect('mining_fatigue'));
}

// --- spawn rules
{
  const { level } = setup();
  const rule = (x, y, z, k) => G.checkGuardianSpawnRules(level, x, y, z, () => k);
  check('in open water under the sky: 1 time in 20', rule(0, 55, 0, 5) === false && rule(0, 55, 0, 0) === true);
  level.world.setState(0, 70, 0, S('stone'));
  check('under a roof: always', rule(0, 55, 0, 5) === true);
  check('with no water under it: never', rule(0, 50, 0, 0) === false);
  level.difficulty = 'peaceful';
  check('in peaceful: never', rule(0, 55, 0, 0) === false);
}

// --- sounds
{
  const gens = oceanAudio.oceanSounds();
  const names = ['attack', 'ambient', 'ambient_land', 'hurt', 'hurt_land', 'death', 'death_land', 'flop'].map((k) => `entity.guardian.${k}`);
  names.push(...names.slice(1).map((n) => n.replace('guardian', 'elder_guardian')), 'entity.elder_guardian.curse');
  const bad = [];
  for (const n of names) {
    const s = gens[n];
    if (!s) { bad.push(`${n} missing`); continue; }
    for (let v = 0; v < s.variants; v++) {
      const buf = s.generate(v, 22050);
      let peak = 0, finite = true;
      for (const x of buf) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.05 || buf.length < 2000) bad.push(`${n}#${v} peak ${peak.toFixed(3)}`);
    }
  }
  check(`their ${names.length} sounds`, bad.length === 0, bad.join(', '));
}

// --- the renderers
function faces(c) {
  const { u, v, w, h, d } = c;
  return { down: [u + d, v, w, d], up: [u + d + w, v, w, d], west: [u, v + d, d, h], north: [u + d, v + d, w, h], east: [u + d + w, v + d, d, h], south: [u + 2 * d + w, v + d, w, h] };
}
function walk(part, name, out) {
  part.cubes.forEach((c, i) => out.push([`${name}#${i}`, c]));
  for (const [n, ch] of part.children) walk(ch, n, out);
}
{
  const def = R.guardianModel();
  for (const tex of ['guardian', 'elder_guardian']) {
    const img = MOB_TEXTURES[tex]();
    const cubes = [];
    walk(def.root, 'root', cubes);
    const bad = [];
    for (const [n, c] of cubes) for (const [f, [x0, y0, w, h]] of Object.entries(faces(c))) {
      let clear = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3] === 0) clear++;
      // (the fin's corners are cut)
      if (clear / (w * h) > (n === 'tail2#1' ? 0.1 : 0.02)) bad.push(`${n}.${f} ${clear}/${w * h}`);
    }
    check(`${tex}: 64x64, every face painted`, img.w === 64 && img.h === 64 && bad.length === 0, bad.slice(0, 6).join(', '));
  }
  const beam = MOB_TEXTURES.guardian_beam();
  check('the beam texture: 16x16, see-through at its edges', beam.w === 16 && beam.h === 16 && beam.data[3] === 0 && beam.data[(3 * 16 + 3) * 4 + 3] === 255);
  check('12 spikes, the eye, the tail in three', [...Array(12).keys()].every((i) => def.root.child('head').child(`spike${i}`)) && def.root.child('head').child('eye') && def.root.child('head').child('tail0').child('tail1').child('tail2'));
}
{
  const { level, player } = setup();
  const g = spawn(level, 'guardian', 0.5, 55, 0.5);
  const def = R.guardianModel(), head = def.root.child('head');
  const A = { limbSwing: 0, limbAmount: 0, age: 100, headYaw: 30, headPitch: -12 };
  const spikeR = () => { const s = head.child('spike4'); return Math.hypot(s.x, s.y - 16, s.z); };
  g.spikesAnimation = g.spikesAnimationO = 1;
  R.animateGuardian(def.root, g, A, 0.5);
  const out = spikeR();
  g.spikesAnimation = g.spikesAnimationO = 0;
  R.animateGuardian(def.root, g, A, 0.5);
  const inn = spikeR();
  check('spikes out while it idles, 0.55 of the way in as it swims', Math.abs(out / inn - 1 / 0.45) < 0.05, `${out.toFixed(2)} / ${inn.toFixed(2)}`);
  check('the head turned and tipped', Math.abs(head.yRot - (30 * Math.PI) / 180) < 1e-9 && Math.abs(head.xRot - (-12 * Math.PI) / 180) < 1e-9);
  // (facing south, +z; the player 8 south)
  g.headYaw = g.headYawO = 0;
  g.pitch = g.pitchO = 0;
  player.moveTo(0.5, 60, 8.5, 0, 0);
  player.moveTo(0.5, 60, 8.5, 0, 0);
  R.animateGuardian(def.root, g, A, 0.5);
  const eye = head.child('eye');
  check('the eye rolls up to a player above', eye.y === 0);
  player.moveTo(6.5, 50, 4.5, 0, 0);
  player.moveTo(6.5, 50, 4.5, 0, 0);
  R.animateGuardian(def.root, g, A, 0.5);
  const x1 = eye.x;
  player.moveTo(-5.5, 50, 4.5, 0, 0);
  player.moveTo(-5.5, 50, 4.5, 0, 0);
  R.animateGuardian(def.root, g, A, 0.5);
  check('...down to one below, and across toward the side it\'s on', eye.y === 1 && Math.sign(x1) === -Math.sign(eye.x) && Math.abs(x1) > 0.5 && Math.abs(x1) <= 2, `${x1.toFixed(2)} / ${eye.x.toFixed(2)}`);
  g.tailAnimation = g.tailAnimationO = Math.PI / 2;
  R.animateGuardian(def.root, g, A, 0.5);
  check('the tail swings (0.05, 0.1, 0.15 of a half turn)', Math.abs(head.child('tail0').child('tail1').child('tail2').yRot - Math.PI * 0.15) < 1e-9);

  // drawn through a stand-in batch and kit
  let quads = 0, beamLight = 0, lightCalls = [];
  const batch = { quad() { quads++; lightCalls.push(this.lightB); }, begin() {}, flush() {}, setOverlay() {}, lightB: 100, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new entityRenderer.PoseStack();
  const kit = {
    pose, items: {}, tex: (n) => (MOB_TEXTURES[n] ? {} : null),
    setupLiving: () => { pose.reset(); return A; }, overlay() {},
    drawBody: (b, e, d) => d.root.render(b, pose, d.texW, d.texH),
    state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const gl = new Proxy({}, { get: (_t, k) => (k === 'createTexture' ? () => ({}) : typeof k === 'string' && k === k.toUpperCase() ? 0 : () => {}) });
  const rr = new R.OceanRenderers(gl, kit);
  const cow = spawner.createMob('cow', level);
  check('a cow is not ours', rr.render(batch, cow, 0, 0, 0, 0) === false);
  quads = 0;
  check('a guardian is drawn', rr.render(batch, g, 0, 0, 0, 0.5) && quads > 30, `${quads} quads`);
  const body = quads;
  g.setBeamTarget(player);
  g.attackTime = 40;
  quads = 0;
  lightCalls = [];
  rr.render(batch, g, 0, 0, 0, 0.5);
  check('...with its laser: three quads more, lit by their own light', quads === body + 3 && lightCalls.slice(-3).every((l) => l === 240) && batch.lightB === 100, `${quads - body}`);
  const e = spawn(level, 'elder_guardian', 0.5, 55, 0.5);
  quads = 0;
  check('an elder is drawn', rr.render(batch, e, 0, 0, 0, 0.5) && quads === body);
  // the ghost
  const cam = { x: 0, y: 60, z: 0, yaw: 30, pitch: 10, fov: 70 };
  ocean.elderAppearance.level = level;
  ocean.elderAppearance.start = level.gameTime;
  let alpha = -1;
  batch.quad = function () { quads++; alpha = this.color[3]; };
  quads = 0;
  rr.renderAppearance(batch, level, cam, 0);
  check('the ghostly face is drawn, faint at first', quads === body && Math.abs(alpha - 0.05) < 1e-6 && batch.color[3] === 1, `${quads} quads, alpha ${alpha}`);
  level.gameTime += 15;
  rr.renderAppearance(batch, level, cam, 0);
  check('...clearest halfway', Math.abs(alpha - 0.55) < 1e-6);
  level.gameTime += 16;
  quads = 0;
  rr.renderAppearance(batch, level, cam, 0);
  check('...gone after a second and a half', quads === 0);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
