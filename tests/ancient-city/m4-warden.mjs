// M4: the warden, with the level ticking. Its size and attributes; summoned by a shrieker at the fourth warning,
// where there's room (and not where there isn't), it comes up out of the ground in place, untouchable, a block tall;
// vibrations, a shot (a little the first time, the full measure the second), bumping into it, being sniffed out and
// above all hurting it anger it at whoever did it; angry enough it roars and then goes after them: a blow of 30 that
// knocks a raised shield down, and, when it hasn't landed one for a while, the sonic boom (scaled by difficulty, past
// armour, enchantments and shields, not past resistance), with its cooldowns. Left a minute undisturbed it digs back
// down and is gone (not if it's named; at once if it came with no minute to wait). Darkness pulses from it; its
// heart beats faster the angrier it is; it drops a sculk catalyst and 5 experience; it's saved and loaded with its
// anger, its listener and its memories; its own steps go unheard; it's untouched by blasts while it digs or emerges,
// and by fire always.
// Run: node tests/ancient-city/m4-warden.mjs

import { load, check, exitWithStatus, flatLevel, place, prop, ticks, stackOf } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/entity/warden.ts', '/src/entity/wardenAi.ts', '/src/entity/wardenAnger.ts', '/src/entity/player.ts', '/src/game/spawner.ts',
  '/src/entity/effects.ts', '/src/game/sculkShrieker.ts', '/src/game/sculkSensor.ts', '/src/game/wardenSpawnTracker.ts', '/src/entity/arrow.ts',
  '/src/game/explosion.ts', '/src/game/vibrations.ts',
]);

const G = 64;

/**
 * a flat deepslate world (chunks -3..3, the ground's top at G) on normal difficulty, its particles and block
 * particles logged, its experience awarded to a list, and every game event logged
 */
function scene({ difficulty = 'normal' } = {}) {
  const sc = flatLevel(m, -3, -3, 3, 3, { under: 'deepslate' });
  const { level, particles } = sc;
  level.difficulty = difficulty;
  let blockBits = 0;
  level.particles.blockParticle = () => blockBits++;
  Object.assign(level.particles, { vibration() {}, shriek() {}, sculkCharge() {}, dustTransition() {} });
  const xp = [];
  level.awardExperience = (x, y, z, n) => xp.push(n);
  const events = [];
  const post = level.gameEvent.bind(level);
  level.gameEvent = (event, x, y, z, ctx = {}) => {
    events.push({ event, x, y, z, entity: ctx.entity ?? null, t: level.gameTime });
    post(event, x, y, z, ctx);
  };
  return { ...sc, particles, xp, events, blockBits: () => blockBits };
}

/** a player at (x, y, z) in `mode` (health `hp` of as much), the level's own unless `local` is false */
function addPlayer(level, x, y, z, { mode = 'survival', local = true, hp = 20, yaw = 0 } = {}) {
  const p = new m.Player(level);
  p.gameMode = mode;
  p.moveTo(x, y, z, yaw, 0);
  p.headYaw = p.headYawO = p.bodyYaw = p.bodyYawO = yaw;
  p.maxHealth = p.health = hp;
  level.addEntity(p);
  if (local) level.player = p;
  return p;
}

/** a warden at (x, y, z), spawned as /summon does without data (a minute before it digs away) */
function addWarden(level, x, y, z, { reason = 'command', yaw = 0 } = {}) {
  const w = m.createMob('warden', level);
  w.moveTo(x, y, z, yaw, 0);
  w.headYaw = w.headYawO = w.bodyYaw = w.bodyYawO = yaw;
  if (reason) w.finalizeSpawn(reason);
  level.addEntity(w);
  return w;
}

const named = (sounds, name, t0 = -1) => sounds.filter((s) => s.name === name && s.t > t0);
const wardens = (level) => level.entities.filter((e) => e.type === 'warden' && !e.removed);
const anger = (w, e) => w.anger.getActiveAnger(e);
/** ticks until `cond` holds (at most `max`): how many it took, or -1 */
function until(level, cond, max) {
  for (let i = 1; i <= max; i++) {
    level.tick();
    if (cond()) return i;
  }
  return -1;
}
/** deepslate walls four high round the blocks x0..x1, z0..z1 (a warden kept in, and near) */
function pen(level, x0, z0, x1, z1) {
  const DS = m.S('deepslate');
  for (let y = G; y < G + 4; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) for (const z of [z0 - 1, z1 + 1]) level.world.setStateQuiet(x, y, z, DS);
    for (let z = z0 - 1; z <= z1 + 1; z++) for (const x of [x0 - 1, x1 + 1]) level.world.setStateQuiet(x, y, z, DS);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// What it is

{
  const { level } = scene();
  const w = m.createMob('warden', level);
  check('attributes: 500 health, 30 attack, 0.3 speed, full knockback resistance, 24 follow range, 1.5 attack knockback', w instanceof m.Warden && w.maxHealth === 500 && w.health === 500 && w.attackDamage === 30 && w.moveSpeedAttr === 0.3 && w.kbResist === 1 && w.followRange === 24 && w.attackKnockback === 1.5);
  check('size: 0.9 by 2.9, listening from its eyes', Math.abs(w.bb.maxX - w.bb.minX - 0.9) < 1e-9 && Math.abs(w.bb.maxY - w.bb.minY - 2.9) < 1e-9 && Math.abs(w.listener.listenerPosition(level)[1] - (w.y + 2.9 * 0.85)) < 1e-9);
  check('it can\'t burn, disables shields, dampens vibrations, never despawns', w.fireImmune() && w.canDisableShield() && w.dampensVibrations() && !w.removeWhenFarAway());
  check('it drops a sculk catalyst and gives 5 experience', JSON.stringify(w.lootTable().map((l) => [l.item, l.min, l.max])) === '[["sculk_catalyst",1,1]]' && w.xpReward === 5);
  check('its egg and its name', !!m.ITEMS.get('warden_spawn_egg') && m.entityDisplayName('warden') === 'Warden');
}

// ---------------------------------------------------------------------------------------------------------------
// Summoned by a shrieker: at the fourth warning, where there's room; coming up out of the ground

{
  const { level, sounds, blockBits } = scene();
  level.setBlock(0, G, 0, m.getBlock('sculk_shrieker').state({ can_summon: true }));
  const p = addPlayer(level, 3.5, G, 0.5);
  p.wardenSpawnTracker.warningLevel = 3;
  const be = m.shriekerAt(level, 0, G, 0);
  be.tryShriek(level, p);
  check('summon: the fourth warning', be.warningLevel === 4 && p.wardenSpawnTracker.warningLevel === 4 && prop(m, level, 0, G, 0, 'shrieking') === true);
  ticks(level, 89);
  check('summon: nothing yet while it shrieks', wardens(level).length === 0);
  level.tick();
  const t0 = level.gameTime;
  const [w] = wardens(level);
  check('summon: as the shriek ends, a warden, within 5 blocks of the shrieker, on the ground', !!w && Math.abs(w.x - 0.5) <= 5 && Math.abs(w.z - 0.5) <= 5 && w.y === G && (w.x % 1 === 0.5 || w.x % 1 === -0.5));
  check('summon: emerging, a block tall, agitated', w.pose === 'emerging' && Math.abs(w.bb.maxY - w.bb.minY - 1) < 1e-9 && named(sounds, 'entity.warden.agitated', t0 - 1).length === 1 && w.mem.has('is_emerging') && w.mem.has('dig_cooldown'));
  check('summon: and no answer from the dark but the warden itself', named(sounds, 'entity.warden.listening_angry', t0 - 1).length === 0 && p.getEffect('darkness')?.duration === 260);
  const x0 = w.x, z0 = w.z, h0 = w.health, bits0 = blockBits();
  ticks(level, 3);
  check('emerging: its sound, loud, as it starts', named(sounds, 'entity.warden.emerge', t0).length === 1 && named(sounds, 'entity.warden.emerge', t0)[0].volume === 5);
  check('emerging: the ground breaks up round it', blockBits() - bits0 >= 60);
  check('emerging: nothing hurts it', w.hurt(10, 'playerAttack', p) === false && w.health === h0 && anger(w, p) === 0 && !w.attackTarget);
  const n = until(level, () => w.pose !== 'emerging', 200);
  check('emerging: it stays where it is, for the emerge\'s 134 ticks', level.gameTime - t0 >= 134 && level.gameTime - t0 <= 137 && w.x === x0 && w.z === z0, `${n} ${level.gameTime - t0}`);
  check('emerging: then it stands, 2.9 tall', w.pose === 'standing' || w.pose === 'sniffing' ? Math.abs(w.bb.maxY - w.bb.minY - 2.9) < 1e-9 && !w.mem.has('is_emerging') : false, w.pose);
  const bits1 = blockBits();
  ticks(level, 5);
  check('emerging: the ground stopped breaking up after 4.5 seconds', blockBits() === bits1);
  // a warden about: a shrieker warns nobody, and so doesn't shriek
  ticks(level, 120);
  p.wardenSpawnTracker.cooldownTicks = 0;
  be.tryShriek(level, p);
  check('summon: with a warden within 48 blocks, no one\'s warned and it doesn\'t shriek', prop(m, level, 0, G, 0, 'shrieking') === false && p.wardenSpawnTracker.warningLevel === 4);
}

{
  // no room: a low roof over everything round the shrieker
  const { level, sounds } = scene();
  level.setBlock(0, G, 0, m.getBlock('sculk_shrieker').state({ can_summon: true }));
  const DS = m.S('deepslate');
  for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) for (let y = G + 2; y <= G + 8; y++) level.world.setStateQuiet(x, y, z, DS);
  const p = addPlayer(level, 3.5, G, 0.5);
  p.wardenSpawnTracker.warningLevel = 3;
  m.shriekerAt(level, 0, G, 0).tryShriek(level, p);
  ticks(level, 90);
  const t = level.gameTime;
  check('summon: under a roof too low for it, no warden: twenty tries, each heard', wardens(level).length === 0 && named(sounds, 'entity.warden.agitated', t - 1).length === 20);
  check('summon: and the fourth warning\'s answer from the dark instead', named(sounds, 'entity.warden.listening_angry', t - 1).length === 1);
}

{
  // the summoning itself: twenty tries, up to 5 across and 6 up or down, standing on what's solid
  const { level } = scene();
  const DS = m.S('deepslate');
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) level.world.setStateQuiet(x, G + 3, z, DS);
  const spots = new Set();
  for (let i = 0; i < 60; i++) {
    const w = m.summonWarden(level, 0, G, 0);
    if (w) {
      spots.add(`${w.x},${w.y},${w.z}`);
      w.remove();
    }
  }
  const all = [...spots].map((s) => s.split(',').map(Number));
  check('summonWarden: on the ground or on the platform, never inside it, within 5 across', all.length > 5 && all.every(([x, y, z]) => (y === G || y === G + 4) && Math.abs(x - 0.5) <= 5 && Math.abs(z - 0.5) <= 5) && all.some(([, y]) => y === G + 4));
}

// ---------------------------------------------------------------------------------------------------------------
// Anger: vibrations, then the roar, the fight and the blow

{
  const { level, sounds } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 10.5, G, 0.5, { hp: 100, yaw: 90 });
  ticks(level, 5);
  const t0 = level.gameTime;
  level.gameEvent('step', p.x, p.y, p.z, { entity: p });
  const n = until(level, () => anger(w, p) > 0, 30);
  check('anger: a player\'s step 10 blocks off reaches it (as a vibration does, 10 ticks) and angers it at them: 35', n === 10 && anger(w, p) === 35, `${n} ${anger(w, p)}`);
  check('anger: its tendrils twitch and click; it listens, calm', w.tendrilAnimation >= 9 && named(sounds, 'entity.warden.tendril_clicks', t0).length === 1 && named(sounds, 'entity.warden.listening', t0).length === 1 && w.angerLevel() === 'calm');
  check('anger: and it goes to see (unless it\'s angry): the disturbance, looked at', JSON.stringify(w.mem.get('disturbance_location')) === JSON.stringify([10, G, 0]) && w.mem.has('vibration_cooldown'));
  level.gameEvent('step', p.x, p.y, p.z, { entity: p });
  ticks(level, 15);
  check('anger: deaf for two seconds after a vibration', anger(w, p) <= 35 && named(sounds, 'entity.warden.tendril_clicks', t0).length === 1);
  const a0 = anger(w, p);
  ticks(level, 21);
  check('anger: which cools a point a second', anger(w, p) === a0 - 1 || anger(w, p) === a0 - 2, `${a0} ${anger(w, p)}`);
  // step after step till it's angry
  let roarAt = -1;
  for (let i = 0; i < 6 && roarAt < 0; i++) {
    level.gameEvent('step', p.x, p.y, p.z, { entity: p });
    for (let k = 0; k < 45; k++) {
      level.tick();
      if (w.pose === 'roaring' && roarAt < 0) roarAt = level.gameTime;
    }
  }
  check('anger: 80 and it\'s angry, and roars at them', roarAt > 0 && w.roarTarget === p || w.attackTarget === p, `${roarAt} ${w.pose} ${anger(w, p)}`);
  const roar = named(sounds, 'entity.warden.roar', roarAt - 1);
  check('roar: the roar itself a second and a quarter in, loud', roar.length === 1 && roar[0].t - roarAt >= 24 && roar[0].t - roarAt <= 26 && roar[0].volume === 3, JSON.stringify(roar.map((s) => s.t - roarAt)));
  const f = until(level, () => w.attackTarget === p, 200);
  check('roar: 84 ticks, then it goes after them', f > 0 && level.gameTime - roarAt >= 83 && level.gameTime - roarAt <= 86 && w.activity() === 'fight' && w.pose === 'standing', `${level.gameTime - roarAt}`);
  check('fight: ten seconds of the blow before the sonic boom', w.mem.ttl('sonic_boom_cooldown') >= 195 && w.mem.ttl('sonic_boom_cooldown') <= 200);
  const hp = p.health;
  const hit = until(level, () => p.health < hp, 300);
  check('fight: it comes after them and strikes: 30 on normal', hit > 0 && hp - p.health === 30, `${hit} ${hp - p.health}`);
  check('fight: the blow\'s sound, loud; its arms\' swing; the boom two seconds off', named(sounds, 'entity.warden.attack_impact').length === 1 && named(sounds, 'entity.warden.attack_impact')[0].volume === 10 && w.attackAnimStart === w.tickCount && w.mem.ttl('sonic_boom_cooldown') >= 38 && w.mem.ttl('sonic_boom_cooldown') <= 40);
  check('fight: the blow knocks them back', Math.hypot(p.dx, p.dz) > 0.5);
}

{
  // hurting it: 100 at whoever did it, and after them at once if they did it themselves
  const { level } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 3.5, G, 0.5, { hp: 100 });
  const q = addPlayer(level, 12.5, G, 0.5, { local: false });
  ticks(level, 3);
  check('hurt: a blow angers it at the player by 100, and it goes after them', w.hurt(5, 'playerAttack', p) && w.health === 495 && anger(w, p) === 100 && w.attackTarget === p && w.angerLevel() === 'angry');
  check('hurt: after them, ten seconds before its sonic boom', w.mem.ttl('sonic_boom_cooldown') === 200);
  const arrow = new m.Arrow(level, q);
  w.invulnerableTime = 0;
  w.hurt(3, 'arrow', q, arrow);
  check('hurt: shot from 12 blocks off, angry at the archer too, but it keeps after the first', anger(w, q) === 100 && w.attackTarget === p);
}

{
  // shot at: 10 the first time, the full 35 if they shoot again within 5 seconds (and then it heads for them)
  const { level } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 14.5, G, 0.5);
  ticks(level, 3);
  const arrow = new m.Arrow(level, p);
  arrow.moveTo(4.5, G, 4.5, 0, 0);
  level.gameEvent('projectile_land', 4.5, G, 4.5, { entity: arrow });
  ticks(level, 12);
  check('shot: an arrow landing near it angers it a little at the archer (10)', anger(w, p) === 10 && w.mem.has('recent_projectile') && JSON.stringify(w.mem.get('disturbance_location')) === JSON.stringify([4, G, 4]));
  ticks(level, 40);
  level.gameEvent('projectile_land', 4.5, G, 4.5, { entity: arrow });
  ticks(level, 12);
  check('shot: again within five seconds: the full 35, and it makes for the archer', anger(w, p) >= 42 && anger(w, p) <= 45 && JSON.stringify(w.mem.get('disturbance_location')) === JSON.stringify([14, G, 0]), `${anger(w, p)} ${JSON.stringify(w.mem.get('disturbance_location'))}`);
}

{
  // bumping into it
  const { level } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 0.5, G, 1.1);
  ticks(level, 2);
  check('touch: bumping into it angers it at them (35), once a second at most', anger(w, p) === 35 && w.mem.ttl('touch_cooldown') >= 18, `${anger(w, p)}`);
}
{
  // being sniffed out: the warden penned in, the player just outside, never 6 blocks apart
  const { level, sounds } = scene();
  pen(level, -1, -1, 2, 2);
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 4.5, G, 0.5);
  const t0 = level.gameTime;
  const s = until(level, () => w.pose === 'sniffing', 400);
  const a = anger(w, p);
  const e = until(level, () => w.pose !== 'sniffing', 100);
  check('sniff: with someone it may target about and nothing else going on, it stops to sniff', s > 0 && named(sounds, 'entity.warden.sniff', t0).length === 1 && named(sounds, 'entity.warden.sniff', t0)[0].t - t0 - s <= 2);
  // (the sniff starts the tick after it stops to sniff, and runs its 84 ticks)
  check('sniff: 84 ticks, then angrier (35) at the nearest within 6 blocks', e >= 84 && e <= 87 && anger(w, p) >= a + 35 - 5, `${e} ${a} ${anger(w, p)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The sonic boom

/**
 * a warden fighting a player (health 100) standing on a pillar 8 blocks off, out of its reach; `ready`: the boom's
 * cooldown cut short. The ticks till the boom lands, the damage, and what else is worth knowing
 */
function boom({ difficulty = 'normal', ready = true, dress = null } = {}) {
  const { level, sounds, particles } = scene({ difficulty });
  const DS = m.S('deepslate');
  for (let y = G; y < G + 4; y++) level.world.setStateQuiet(8, y, 0, DS);
  const w = addWarden(level, 0.5, G, 0.5, { yaw: -90 });
  const p = addPlayer(level, 8.5, G + 4, 0.5, { hp: 100, yaw: 90 });
  dress?.(p);
  ticks(level, 2);
  w.increaseAngerAt(p, 100, false);
  w.setAttackTarget(p);
  const cd = w.mem.ttl('sonic_boom_cooldown');
  if (ready) w.mem.set('sonic_boom_cooldown', true, 5);
  const t0 = level.gameTime, hp = p.health;
  // (the push, and where the two of them were as it came)
  let push = null;
  const own = p.push.bind(p);
  p.push = (x, y, z) => {
    push ??= { v: [x, y, z], from: [w.x, w.y + m.WARDEN_CHEST_Y, w.z], to: [p.x, p.y + p.eyeHeight, p.z] };
    own(x, y, z);
  };
  const n = until(level, () => p.health < hp, 400);
  const charge = named(sounds, 'entity.warden.sonic_charge', t0);
  const bang = named(sounds, 'entity.warden.sonic_boom', t0);
  return { level, sounds, w, p, n, t0, cd, dmg: hp - p.health, charge, bang, push, rings: particles.filter((q) => q.kind === 'sonic_boom').length };
}

{
  const r = boom({ ready: false });
  check('sonic boom: set on them, ten seconds of the blow first', r.cd === 200 && r.charge.length === 1 && r.charge[0].t - r.t0 >= 199 && r.charge[0].t - r.t0 <= 202, `${r.cd} ${r.charge.map((s) => s.t - r.t0)}`);
  // (its SONIC_BOOM_SOUND_DELAY of 34 runs out as vanilla's memories do: gone the tick after it reaches 0, so the boom
  // comes 35 ticks after the charge, a tick after the animation's)
  check('sonic boom: it charges (its chest opening), and a second and three quarters on it lands, loud', r.bang.length === 1 && r.bang[0].t - r.charge[0].t === 35 && r.bang[0].volume === 3 && r.charge[0].volume === 3 && r.w.sonicBoomAnimStart >= 0, `${r.bang.map((s) => s.t - r.charge[0].t)}`);
  check('sonic boom: 10 on normal, through the air between (rings along the way)', r.dmg === 10 && r.rings >= 3, `${r.dmg} ${r.rings}`);
  const q = r.push, d = q && q.to.map((c, i) => c - q.from[i]), len = d && Math.hypot(...d);
  check('sonic boom: it throws them away from its chest, 2.5 across and 0.5 up', !!q && Math.abs(q.v[0] - (d[0] / len) * 2.5) < 1e-6 && Math.abs(q.v[1] - (d[1] / len) * 0.5) < 1e-6 && Math.abs(q.v[2] - (d[2] / len) * 2.5) < 1e-6 && q.v[1] > 0, JSON.stringify(q));
  ticks(r.level, 30);
  check('sonic boom: two seconds before the next', r.w.mem.ttl('sonic_boom_cooldown') >= 36 && r.w.mem.ttl('sonic_boom_cooldown') <= 40 && named(r.sounds, 'entity.warden.sonic_boom').length === 1, `${r.w.mem.ttl('sonic_boom_cooldown')}`);
}
{
  check('sonic boom: 6 on easy', boom({ difficulty: 'easy' }).dmg === 6);
  check('sonic boom: 15 on hard', boom({ difficulty: 'hard' }).dmg === 15);
  const armoured = boom({
    dress: (p) => {
      ['diamond_boots', 'diamond_leggings', 'diamond_chestplate', 'diamond_helmet'].forEach((id, i) => {
        const s = stackOf(m, id);
        s.tag = { ...(s.tag ?? {}), enchantments: { protection: 4 } };
        p.inventory.armor[i] = s;
      });
    },
  });
  check('sonic boom: diamond armour with Protection IV all over: still 10', armoured.dmg === 10, `${armoured.dmg}`);
  const shielded = boom({
    dress: (p) => {
      const s = stackOf(m, 'shield');
      p.inventory.offhand = s;
      p.startUsingItem(s, 72000);
      p.useItemRemaining -= 20;
    },
  });
  check('sonic boom: a raised shield doesn\'t stop it', shielded.dmg === 10 && shielded.p.useItem?.item.id === 'shield', `${shielded.dmg}`);
  const resisting = boom({ dress: (p) => p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.resistance, 6000, 0)) });
  check('sonic boom: resistance does (a fifth off)', Math.abs(resisting.dmg - 8) < 1e-6, `${resisting.dmg}`);
}

{
  // its blow knocks a raised shield down
  const { level, sounds } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 0.5, G, 2.2, { hp: 100, yaw: 180 });
  const s = stackOf(m, 'shield');
  p.inventory.offhand = s;
  p.startUsingItem(s, 72000);
  p.useItemRemaining -= 20;
  ticks(level, 1);
  w.increaseAngerAt(p, 100, false);
  w.setAttackTarget(p);
  const n = until(level, () => named(sounds, 'entity.warden.attack_impact').length > 0, 100);
  check('shield: its blow on a raised shield: none of it gets through, and the shield\'s down for 5 seconds', n > 0 && p.health === 100 && !p.useItem && p.cooldowns.get('shield') >= 99, `${n} ${p.health} ${p.cooldowns.get('shield')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Digging away

{
  const { level, sounds, xp } = scene();
  pen(level, -2, -2, 2, 2);
  const w = addWarden(level, 0.5, G, 0.5);
  addPlayer(level, 12.5, G, 0.5, { mode: 'creative' });
  const t0 = level.gameTime;
  let walking = -1;
  const n = until(level, () => {
    if (walking < 0 && !w.mem.has('dig_cooldown') && w.walkTarget) walking = level.gameTime;
    return w.pose === 'digging';
  }, 1600);
  // (vanilla Digging waits for it to get where it was walking to)
  check('dig: a minute undisturbed and it digs down (once it isn\'t walking anywhere)', n >= 1200 && (n <= 1203 || walking > 0) && !w.walkTarget && named(sounds, 'entity.warden.dig', t0).length === 1, `${n} ${walking}`);
  check('dig: a block tall, untouchable', Math.abs(w.bb.maxY - w.bb.minY - 1) < 1e-9 && !w.hurt(10, 'mobAttack', null) && w.health === 500);
  const g = until(level, () => w.removed, 200);
  check('dig: gone 100 ticks on, leaving nothing', g >= 99 && g <= 101 && !level.entities.some((e) => e.type === 'item') && xp.length === 0, `${g}`);
}
{
  const { level } = scene();
  pen(level, -2, -2, 2, 2);
  const w = addWarden(level, 0.5, G, 0.5);
  addPlayer(level, 12.5, G, 0.5, { mode: 'creative' });
  ticks(level, 1000);
  // a block placed near it (nobody's doing): it goes to see, and that's another minute
  level.gameEvent('block_place', w.x + 4, w.y, w.z, {});
  ticks(level, 400);
  check('dig: a disturbance starts the minute over', !w.removed && w.pose !== 'digging' && w.mem.ttl('dig_cooldown') > 700, `${w.mem.ttl('dig_cooldown')}`);
}
{
  const { level } = scene();
  pen(level, -2, -2, 2, 2);
  const w = addWarden(level, 0.5, G, 0.5);
  w.setCustomName('Wardy');
  w.persistenceRequired = true;
  addPlayer(level, 12.5, G, 0.5, { mode: 'creative' });
  ticks(level, 1500);
  check('dig: named, it never digs away', !w.removed && w.pose !== 'digging' && w.mem.ttl('dig_cooldown') >= 1199);
}
{
  const { level } = scene();
  const w = addWarden(level, 0.5, G, 0.5, { reason: null });
  addPlayer(level, 12.5, G, 0.5, { mode: 'creative' });
  const n = until(level, () => w.pose === 'digging', 20);
  check('dig: summoned with data (no minute to wait), it digs down at once', n > 0 && n <= 3, `${n}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Darkness, its heart, its death, saving

{
  const { level } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const near = addPlayer(level, 15.5, G, 0.5, { mode: 'adventure' });
  const far = addPlayer(level, 24.5, G, 0.5, { local: false });
  const n = until(level, () => !!near.getEffect('darkness'), 130);
  check('darkness: every six seconds, on the players within 20 blocks (13 seconds of it)', n > 0 && near.getEffect('darkness').duration >= 259 && !far.getEffect('darkness'));
  near.removeEffect?.('darkness');
  const k = until(level, () => !!near.getEffect('darkness'), 130);
  check('darkness: and again six seconds later', k === 120 || (k > 0 && near.getEffect('darkness') && k <= 120), `${k}`);
  void w;
}
{
  const { level, sounds } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 20.5, G, 0.5, { hp: 100 });
  ticks(level, 40);
  const beats = (n) => {
    const t = level.gameTime;
    ticks(level, n);
    return named(sounds, 'entity.warden.heartbeat', t).length;
  };
  const calm = beats(80);
  w.anger.increaseAnger(p, 150);
  ticks(level, 21);
  const angry = beats(80);
  check('heart: calm, a beat every two seconds; angry, every half second (loud)', calm === 2 && angry === 8 && named(sounds, 'entity.warden.heartbeat')[0].volume === 5, `${calm} ${angry}`);
  check('heart: each beat lights it', w.heartAnimation > 0 || w.heartAnimationO > 0 || named(sounds, 'entity.warden.heartbeat', level.gameTime - 10).length === 1);
}
{
  const { level, sounds, xp } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 3.5, G, 0.5, { hp: 100 });
  ticks(level, 2);
  w.hurt(1000, 'playerAttack', p);
  const drops = level.entities.filter((e) => e.type === 'item').map((e) => `${e.stack.item.id}x${e.stack.count}`);
  check('death: killed by a player: a sculk catalyst and 5 experience, and its death cry', w.dead && drops.join() === 'sculk_catalystx1' && xp.join() === '5' && named(sounds, 'entity.warden.death').length === 1, `${drops} ${xp}`);
}
{
  const { level } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  const p = addPlayer(level, 9.5, G, 0.5, { hp: 100 });
  ticks(level, 2);
  w.increaseAngerAt(p, 60, false);
  w.mem.set('sniff_cooldown', true, 77);
  const before = JSON.parse(JSON.stringify(w.save()));
  level.gameEvent('step', 9.5, G, 0.5, { entity: p });
  level.tick();
  const saved = JSON.parse(JSON.stringify(w.save()));
  const w2 = m.createMob('warden', level);
  w2.load(saved);
  check('save: its memories, with the time they have left', w2.mem.ttl('sniff_cooldown') === w.mem.ttl('sniff_cooldown') && w2.mem.ttl('dig_cooldown') === w.mem.ttl('dig_cooldown') && w2.mem.ttl('dig_cooldown') > 1100);
  check('save: its listener, with the vibration on its way', w2.vibration.current?.event === 'step' && w2.vibration.travelTime === w.vibration.travelTime && w2.vibration.travelTime > 0, JSON.stringify(saved.data?.listener));
  // its anger (60, saved before the step) is kept by uuid, and finds the player again within its first two coolings
  const w3 = m.createMob('warden', level);
  w3.load(before);
  w.remove();
  level.addEntity(w3);
  ticks(level, 41);
  check('save: its anger at the player, found again by their uuid (cooled a point a second)', anger(w3, p) === 58, `${anger(w3, p)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// What it's spared

{
  const { level, events } = scene();
  place(m, level, 'sculk_sensor', 2, G, 3);
  const w = addWarden(level, 0.5, G, 0.5);
  addPlayer(level, 14.5, G, 0.5, { mode: 'creative' });
  ticks(level, 2);
  w.walkTarget = { t: { pos: [0, G, 8] }, speed: 1, closeEnough: 0 };
  ticks(level, 60);
  const steps = events.filter((e) => e.event === 'step' && e.entity === w).length;
  check('its own steps: it makes them, and no sensor hears them', steps >= 3 && prop(m, level, 2, G, 3, 'sculk_sensor_phase') === 'inactive', `${steps}`);
}
{
  const { level } = scene();
  const w = addWarden(level, 0.5, G, 0.5, { reason: 'triggered' });
  addPlayer(level, 12.5, G, 0.5, { mode: 'creative' });
  ticks(level, 5);
  m.explode(level, null, 2.5, G, 0.5, 4, false, 'tnt');
  check('blast: emerging, it\'s untouched and unmoved', w.health === 500 && w.dx === 0 && w.dz === 0);
  const s = addWarden(level, 0.5, G, 6.5);
  ticks(level, 2);
  m.explode(level, null, 2.5, G, 6.5, 4, false, 'tnt');
  check('blast: standing, it\'s hurt (and thrown, knockback resistance or not)', s.health < 500 && Math.abs(s.dx) > 0);
}
{
  const { level } = scene();
  const w = addWarden(level, 0.5, G, 0.5);
  addPlayer(level, 12.5, G, 0.5, { mode: 'creative' });
  ticks(level, 2);
  level.setBlock(0, G, 0, m.S('lava'));
  w.setOnFire?.(8);
  ticks(level, 60);
  check('fire: lava and fire don\'t hurt it', w.health === 500);
}

await exitWithStatus(close);
