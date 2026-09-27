// Multiplayer M3: guests in survival, the host deciding (vanilla ServerPlayer and ServerGamePacketListenerImpl:
// ClientboundSetHealthPacket, SetEntityMotion, UpdateMobEffect, PlayerCombatKill, Respawn, ClientCommand, the bed's
// packets, handleMovePlayer's fall damage and jump exhaustion). A guest is hurt by mobs, the host's player and other
// guests, knocked back, burnt, fed and starved as the host's own player would be, and sees its hearts, food, air and
// effects as the host has them; it falls and lands hard; it dies, drops what it carries, reads how on its death screen
// and respawns at its bed or the world spawn; it sleeps, and a night passes when everyone does; its hands swap, its
// pick-block and its cooldowns are the host's. The other players see it hurt, burning, dying and asleep.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, rawGuest, hostCopy, step, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/game/combat.ts', '/src/game/sleep.ts', '/src/game/playerDeath.ts']);

const host = flatHost(m, 6, { guestGameMode: 'survival', gameMode: 'survival' });
const lvl = host.level;
lvl.difficulty = 'normal';
const a = makeGuest(host, 'Alex', { viewDistance: 4 });
const b = makeGuest(host, 'Steve', { viewDistance: 4 });
step(host, 40);
const ha = hostCopy(host, a), hb = hostCopy(host, b);
const mirrorOf = (g, p) => g.session.mirrors.get(p.id);
const heard = (g, name) => g.level.sounds.filter((s) => s.name === name).length;
const zombieAt = (x, z) => {
  const e = m.createMob('zombie', lvl);
  e.moveTo(x, 64, z, 0, 0);
  e.serverAiStep = () => {};
  e.speed = 0;
  lvl.addEntity(e);
  return e;
};
/** put `g`'s player at (x, z), a few blocks a tick, as it would walk there */
function walkTo(g, x, z, y = 64) {
  for (let k = 0; k < 40; k++) {
    const p = g.player, dx = x - p.x, dz = z - p.z, dy = y - p.y, d = Math.hypot(dx, dy, dz);
    if (d < 1e-9) break;
    const f = Math.min(1, 4 / d);
    p.moveTo(p.x + dx * f, p.y + dy * f, p.z + dz * f, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    step(host, 1);
  }
  step(host, 3);
}
/** the host's copy of `g`'s player whole again, still, and its game's too */
function heal(g) {
  const h = hostCopy(host, g);
  h.health = h.maxHealth;
  h.hurtTime = h.invulnerableTime = 0;
  h.food.level = 20;
  h.food.saturation = 5;
  h.food.exhaustion = 0;
  h.remainingFireTicks = -1;
  h.fallDistance = 0;
  step(host, 2);
}

// ---------------------------------------------------------------------------
// joining in survival: the LAN screen's game mode, and a player whole and fed
{
  check('join: the guests play in survival, as the host picked', ha.gameMode === 'survival' && a.player.gameMode === 'survival' && hb.gameMode === 'survival' && b.session.info.gameMode === 'survival');
  check('join: whole and fed, as the host has it', a.player.health === 20 && a.player.food.level === 20 && a.player.food.saturation === 5 && a.player.air === 300);
  check('join: not invulnerable any more', !ha.invulnerable && !ha.isInvulnerableTo('mob'));
}

// ---------------------------------------------------------------------------
// hurt by a mob: the host's copy loses the health, the guest's hearts say so, it flinches and is knocked back (vanilla
// ClientboundSetHealthPacket, the hurt animation, ClientboundSetEntityMotionPacket), everyone hears it, the other
// guest sees it flash red
{
  walkTo(a, 0.5, 0.5);
  walkTo(b, 4.5, 0.5);
  a.level.sounds.length = b.level.sounds.length = 0;
  const z = zombieAt(-1.5, 0.5);
  step(host, 2);
  ha.hurt(5, 'mob', z);
  const knockX = ha.dx;
  lvl.tick();
  host.server.tick();
  host.net.deliver();
  const beforeX = a.player.x;
  a.session.receive();
  check('mob: the host\'s copy is hurt (5 on normal)', ha.health === 15, `${ha.health}`);
  check('mob: the guest\'s hearts say so', a.player.health === 15, `${a.player.health}`);
  check('mob: it flinches (its hurt time), the camera tilting away from the zombie', a.player.hurtTime > 0 && a.player.invulnerableTime > 10 && Math.abs(Math.abs(a.player.hurtDir) - 180) < 1, `${a.player.hurtTime} ${a.player.hurtDir}`);
  check('mob: it\'s knocked back away from the zombie (vanilla SetEntityMotion, the guest moving itself)', a.player.dx > 0.3 && Math.abs(a.player.dx - knockX) < 1e-9 && a.player.dy > 0.3, `${a.player.dx} ${a.player.dy}`);
  a.session.tickLevel();
  a.session.sendTick();
  host.net.deliver();
  for (const g of host.guests) if (g !== a) g.session.tick();
  host.net.deliver();
  // (the slide over, a second or so: the host has where it stopped)
  step(host, 25);
  check('mob: and goes where the knock took it, the host believing it', a.player.x > beforeX + 0.3 && Math.abs(ha.x - a.player.x) < 1e-9, `${beforeX} → ${a.player.x}, host ${ha.x}`);
  check('mob: it hears itself hurt (the host\'s sound, sent to it too)', heard(a, 'entity.player.hurt') === 1);
  check('mob: the other guest hears it, and sees it flash red', heard(b, 'entity.player.hurt') === 1 && mirrorOf(b, ha).hurtTime >= 0);
  lvl.removeEntity?.(z);
  z.remove();
  heal(a);
}

// ---------------------------------------------------------------------------
// fighting: a guest hits another, the host's player hits a guest, and a guest the host's player (vanilla: pvp on, as
// on a LAN world)
{
  walkTo(a, 0.5, 0.5);
  walkTo(b, 2.5, 0.5);
  a.player.yaw = -90;
  a.player.pitch = 0;
  step(host, 5);
  const before = hb.health;
  const mb = mirrorOf(a, hb);
  a.session.input(true, false, false, false, mb);
  step(host, 1);
  a.session.input(false, false, false, false, null);
  step(host, 2);
  check('pvp: a guest\'s attack on another guest it looks at hurts it', hb.health < before && hb.lastHurtByPlayer === ha && b.player.health === hb.health, `${before} → ${hb.health}, its game ${b.player.health}`);
  check('pvp: and knocks it away', b.player.x > 2.5 || hb.x > 2.5, `${b.player.x}`);
  check('pvp: the attacker sees its victim flinch', mirrorOf(a, hb).hurtTime > 0 || mirrorOf(a, hb).health < before);
  heal(b);
  // the host's player hits a guest, as its Game's Interaction does
  const hp = host.player;
  hp.moveTo(-1.5, 64, 0.5, -90, 0);
  step(host, 20);
  const it = new m.Interaction(lvl, hp);
  const before2 = ha.health;
  it.entityHit = ha;
  it.hit = null;
  it.startAttack();
  step(host, 2);
  check('pvp: the host\'s player hits a guest', ha.health < before2 && a.player.health === ha.health, `${before2} → ${ha.health}`);
  heal(a);
  // a guest hits the host's player
  walkTo(a, 0.5, 0.5);
  a.player.yaw = 90;
  step(host, 20);
  const before3 = hp.health;
  a.session.input(true, false, false, false, mirrorOf(a, hp));
  step(host, 1);
  a.session.input(false, false, false, false, null);
  step(host, 2);
  check('pvp: a guest hits the host\'s player', hp.health < before3 && hp.lastHurtByPlayer === ha, `${before3} → ${hp.health}`);
  hp.health = hp.maxHealth;
  hp.moveTo(0.5, 64, -8.5, 0, 0);
  // a spectator isn't there to be hit
  hb.setGameMode('spectator');
  step(host, 3);
  walkTo(b, 2.5, 0.5);
  a.player.yaw = -90;
  step(host, 20);
  a.session.input(true, false, false, false, mirrorOf(a, hb));
  step(host, 1);
  a.session.input(false, false, false, false, null);
  step(host, 2);
  check('pvp: a spectator isn\'t hit', hb.health === hb.maxHealth && hb.hurtTime === 0);
  check('pvp: its game is told its game mode', b.player.gameMode === 'spectator' && b.player.flying);
  hb.setGameMode('survival');
  step(host, 3);
  check('pvp: and back', b.player.gameMode === 'survival' && !b.player.mayFly);
  heal(a);
  heal(b);
}

// ---------------------------------------------------------------------------
// falling: the guest's own game falls; the host, hearing it land, hurts it for the fall (vanilla
// ServerPlayer.doCheckFallDamage), heard by the others (the guest plays its own landing)
{
  walkTo(a, -3.5, -3.5);
  walkTo(a, -3.5, -3.5, 74);
  a.level.sounds.length = b.level.sounds.length = 0;
  // (its own physics from here: it falls ten blocks)
  a.player.dy = 0;
  let landed = false;
  for (let i = 0; i < 60 && !landed; i++) {
    step(host, 1);
    landed = a.player.onGround && a.player.y < 64.5;
  }
  step(host, 2);
  check('fall: the guest fell ten blocks and landed', landed && Math.abs(a.player.y - 64) < 1e-6, `${a.player.y}`);
  check('fall: the host hurt it for the seven past the first three', ha.health === 13 && a.player.health === 13 && ha.lastDamageSource === 'fall', `${ha.health} ${ha.lastDamageSource}`);
  check('fall: the other guest heard it land hard', heard(b, 'entity.player.small_fall') + heard(b, 'entity.player.big_fall') === 1);
  check('fall: the guest wasn\'t sent its own landing (its game plays it)', heard(a, 'entity.player.small_fall') + heard(a, 'entity.player.big_fall') === 0 && heard(a, 'entity.player.hurt') === 0);
  heal(a);
  // (slow falling: no damage)
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('slow_falling'), 400, 0));
  walkTo(a, -3.5, -3.5, 74);
  a.player.dy = 0;
  for (let i = 0; i < 400 && !(a.player.onGround && a.player.y < 64.5); i++) step(host, 1);
  step(host, 2);
  check('fall: with slow falling, it lands whole', a.player.onGround && ha.health === 20 && a.player.health === 20, `${ha.health}`);
  ha.removeEffect('slow_falling');
  step(host, 2);
  check('fall: the effect gone on the host is gone for the guest', !a.player.hasEffect('slow_falling'));
}

// ---------------------------------------------------------------------------
// hunger: a jump costs food as the host's own player's do (vanilla handleMovePlayer → jumpFromGround); what's left is
// the guest's to see (vanilla ClientboundSetHealthPacket's food and saturation)
{
  walkTo(a, -3.5, -3.5);
  ha.food.exhaustion = 3.99;
  step(host, 2);
  a.player.input.jump = true;
  step(host, 1);
  a.player.input.jump = false;
  step(host, 20);
  check('hunger: a jump took the saturation down a point', ha.food.saturation === 4 && a.player.food.saturation === 4, `${ha.food.saturation} ${a.player.food.saturation} ex ${ha.food.exhaustion}`);
  ha.food.saturation = 0;
  ha.food.exhaustion = 3.99;
  step(host, 2);
  a.player.input.jump = true;
  step(host, 1);
  a.player.input.jump = false;
  step(host, 20);
  check('hunger: then the food bar', ha.food.level === 19 && a.player.food.level === 19, `${ha.food.level} ${a.player.food.level}`);
  // (starving on hard: it dies of it; normal leaves half a heart, easy five)
  ha.food.level = 0;
  ha.health = 2;
  step(host, 90);
  check('hunger: starving hurts, down to a heart on normal', ha.health === 1 && a.player.health === 1, `${ha.health}`);
  heal(a);
}

// ---------------------------------------------------------------------------
// effects, fire and air: as the host has them (vanilla UpdateMobEffect / RemoveMobEffect, the on-fire flag, air)
{
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('speed'), 200, 1));
  step(host, 2);
  const sp = a.player.getEffect('speed');
  check('effects: an effect given is the guest\'s, its level and time', sp && sp.amplifier === 1 && Math.abs(sp.duration - ha.getEffect('speed').duration) <= 2, `${sp?.amplifier} ${sp?.duration}/${ha.getEffect('speed')?.duration}`);
  step(host, 40);
  check('effects: its time counts down on both', Math.abs(a.player.getEffect('speed').duration - ha.getEffect('speed').duration) <= 2);
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('speed'), 1200, 1));
  step(host, 2);
  check('effects: drunk again, the time goes back up', Math.abs(a.player.getEffect('speed').duration - 1198) <= 3, `${a.player.getEffect('speed').duration}`);
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('absorption'), 600, 1));
  step(host, 2);
  check('effects: absorption\'s golden hearts, as the host gave them', a.player.absorption === 8 && ha.absorption === 8, `${a.player.absorption}`);
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('health_boost'), 600, 0));
  ha.health = 24;
  step(host, 2);
  check('effects: health boost\'s hearts', a.player.maxHealth === 24 && a.player.health === 24, `${a.player.maxHealth} ${a.player.health}`);
  ha.removeAllEffects();
  step(host, 2);
  check('effects: milk takes them all', a.player.activeEffects.size === 0 && a.player.absorption === 0 && a.player.maxHealth === 20);
  check('effects: the other guest sees what it shows of them (glowing)', (() => {
    ha.addEffect(new m.MobEffectInstance(m.mobEffect('glowing'), 200, 0));
    step(host, 2);
    const ok = mirrorOf(b, ha).hasEffect('glowing');
    ha.removeAllEffects();
    step(host, 2);
    return ok && !mirrorOf(b, ha).hasEffect('glowing');
  })());
  ha.igniteForSeconds(4);
  step(host, 2);
  check('fire: the guest burns as the host says (its screen\'s flames)', a.player.isOnFire() && mirrorOf(b, ha).isOnFire());
  step(host, 30);
  check('fire: burning hurts, told to the guest', ha.health < 20 && a.player.health === ha.health && ha.lastDamageSource === 'onFire', `${ha.health}`);
  check('fire: and it still burns on its screen', a.player.isOnFire());
  ha.clearFire();
  step(host, 2);
  check('fire: put out', !a.player.isOnFire() && !mirrorOf(b, ha).isOnFire());
  ha.air = 120;
  step(host, 2);
  check('air: its bubbles as the host has them', Math.abs(a.player.air - ha.air) <= 4, `${a.player.air} ${ha.air}`);
  heal(a);
}

// ---------------------------------------------------------------------------
// dying: vanilla ServerPlayer.die → the death screen (ClientboundPlayerCombatKillPacket), its items dropped, the
// message for everyone; respawning (ClientCommand PERFORM_RESPAWN → Respawn) at the world spawn, whole
{
  walkTo(a, 2.5, -2.5);
  ha.inventory.main[3] = new m.ItemStack(m.getItem('dirt'), 5);
  ha.inventory.version++;
  ha.xpLevel = 3;
  step(host, 3);
  check('death: (the guest has the dirt it\'s to drop)', a.player.inventory.main[3]?.count === 5);
  a.level.sounds.length = b.level.sounds.length = 0;
  const z = zombieAt(1.5, -2.5);
  ha.hurt(100, 'mob', z);
  step(host, 3);
  check('death: the host\'s copy is dead', ha.health === 0 && ha.dead);
  check('death: its game shows the death screen, saying how', a.died.length === 1 && a.died[0] === 'Alex was slain by Zombie' && a.player.health === 0, a.died.join('; '));
  check('death: everyone is told', a.chat.includes('Alex was slain by Zombie') && b.chat.includes('Alex was slain by Zombie') && host.chat.includes('Alex was slain by Zombie'));
  check('death: its death is heard, by itself too', heard(a, 'entity.player.death') === 1 && heard(b, 'entity.player.death') === 1);
  const drops = lvl.entities.filter((e) => e.type === 'item' && e.stack.item.id === 'dirt' && !e.removed);
  check('death: what it carried lies where it died', drops.length === 1 && drops[0].stack.count === 5 && Math.hypot(drops[0].x - 2.5, drops[0].z + 2.5) < 2);
  check('death: and its inventory is empty, its game told', a.player.inventory.main[3] === null && ha.inventory.main[3] === null);
  check('death: some of its experience drops as orbs', lvl.entities.some((e) => e.type === 'experience_orb' && !e.removed) && a.player.xpLevel === 0);
  check('death: the other guest sees it die (its fall to the ground, red)', mirrorOf(b, ha).health === 0 && mirrorOf(b, ha).deathTime > 0);
  const deadX = ha.x;
  a.player.moveTo(deadX + 3, 64, -2.5, 0, 0);
  step(host, 3);
  check('death: the dead don\'t walk', ha.x === deadX);
  a.session.input(true, false, true, false, null);
  step(host, 2);
  check('death: or click', ha.health === 0);
  z.remove();
  a.session.respawn();
  step(host, 3);
  check('respawn: back at the world spawn', Math.abs(ha.x - 0.5) < 1e-9 && Math.abs(ha.z - 0.5) < 1e-9 && Math.abs(a.player.x - 0.5) < 1e-9 && a.respawned === 1);
  check('respawn: whole and fed, no effects, no fire', ha.health === 20 && a.player.health === 20 && a.player.food.level === 20 && !a.player.isOnFire() && a.player.activeEffects.size === 0 && !a.player.dead);
  check('respawn: the other guest sees it alive again', mirrorOf(b, ha)?.health === 20 && mirrorOf(b, ha).deathTime === 0);
  a.session.respawn();
  step(host, 3);
  check('respawn: asked again while alive, nothing happens', a.respawned === 1 && ha.health === 20);
  // keepInventory
  lvl.gameRules.keepInventory = true;
  ha.inventory.main[0] = new m.ItemStack(m.getItem('iron_sword'), 1);
  ha.inventory.version++;
  step(host, 2);
  ha.hurt(100, 'genericKill');
  step(host, 2);
  check('keepInventory: dead, it keeps what it had', ha.health === 0 && ha.inventory.main[0]?.item.id === 'iron_sword' && a.player.inventory.main[0]?.item.id === 'iron_sword');
  a.session.respawn();
  step(host, 3);
  lvl.gameRules.keepInventory = false;
  // doImmediateRespawn
  lvl.gameRules.doImmediateRespawn = true;
  ha.hurt(100, 'genericKill');
  step(host, 3);
  check('doImmediateRespawn: straight back, without the death screen\'s button', ha.health === 20 && a.player.health === 20 && a.respawned === 3);
  lvl.gameRules.doImmediateRespawn = false;
  heal(a);
}

// ---------------------------------------------------------------------------
// beds: a guest sleeps in one (its respawn point set), gets up, and a night passes once everyone's asleep; it respawns
// at its bed, and at the world spawn once the bed's gone
{
  const bx = -4, bz = 3;
  lvl.world.setState(bx, 64, bz, m.S('red_bed', { part: 'foot', facing: 'south' }));
  lvl.world.setState(bx, 64, bz + 1, m.S('red_bed', { part: 'head', facing: 'south' }));
  lvl.dayTime = 14000;
  step(host, 25);
  /** `a` looking at the foot of the bed */
  const lookAtBed = () => {
    const eye = a.player.y + a.player.eyeHeight;
    const tx = bx + 0.5 - a.player.x, ty = 64.3 - eye, tz = bz + 0.5 - a.player.z;
    a.player.yaw = (Math.atan2(-tx, tz) * 180) / Math.PI;
    a.player.pitch = (-Math.atan2(ty, Math.hypot(tx, tz)) * 180) / Math.PI;
  };
  walkTo(a, bx + 0.5, bz - 1.2);
  lookAtBed();
  step(host, 2);
  a.session.input(false, false, true, true, null);
  step(host, 1);
  a.session.input(false, false, false, false, null);
  step(host, 3);
  check('bed: the guest\'s player sleeps in it (its head)', ha.isSleeping() && ha.sleepingPos?.join() === `${bx},64,${bz + 1}`, `${ha.sleepingPos}`);
  check('bed: its game lies it down there', a.player.isSleeping() && a.player.sleepingPos?.join() === `${bx},64,${bz + 1}`);
  check('bed: its respawn point is set, and it\'s told', ha.respawnPos?.join() === `${bx},64,${bz + 1}` && a.chat.some((t) => t === 'Respawn point set'));
  check('bed: the bed is occupied, for everyone', m.BLOCKS[m.STATE_BLOCK[lvl.world.getState(bx, 64, bz + 1)]].get(lvl.world.getState(bx, 64, bz + 1), 'occupied') === true && a.world.getState(bx, 64, bz + 1) === lvl.world.getState(bx, 64, bz + 1));
  check('bed: the other guest sees it asleep', mirrorOf(b, ha).sleepingPos?.join() === `${bx},64,${bz + 1}`);
  const lying = [ha.x, ha.y, ha.z].join();
  a.player.moveTo(bx + 3, 64, bz, 0, 0);
  step(host, 2);
  check('bed: a sleeper doesn\'t move', [ha.x, ha.y, ha.z].join() === lying);
  check('bed: the night doesn\'t pass while the others are awake', lvl.dayTime < 24000 && ha.isSleeping());
  a.session.stopSleeping();
  step(host, 3);
  check('bed: Leave Bed gets it up, beside the bed, here and on the host', !ha.isSleeping() && !a.player.isSleeping() && Math.abs(a.player.x - ha.x) < 1e-9 && Math.abs(a.player.z - ha.z) < 1e-9 && Math.hypot(ha.x - (bx + 0.5), ha.z - (bz + 1.5)) < 2.5, `${ha.x},${ha.z}`);
  check('bed: and the bed is free again', m.BLOCKS[m.STATE_BLOCK[lvl.world.getState(bx, 64, bz + 1)]].get(lvl.world.getState(bx, 64, bz + 1), 'occupied') === false);
  // everyone asleep: the host's player and Steve out of it as spectators
  host.player.setGameMode('spectator');
  hb.setGameMode('spectator');
  step(host, 2);
  walkTo(a, bx + 0.5, bz - 1.2);
  lookAtBed();
  step(host, 2);
  a.session.input(false, false, true, true, null);
  step(host, 1);
  a.session.input(false, false, false, false, null);
  step(host, 2);
  check('bed: (asleep again)', ha.isSleeping());
  const day = Math.floor(lvl.dayTime / 24000);
  for (let i = 0; i < 130 && ha.isSleeping(); i++) step(host, 1);
  step(host, 3);
  check('bed: with everyone else spectating, its sleep brings the morning', Math.floor(lvl.dayTime / 24000) === day + 1 && lvl.dayTime % 24000 < 200, `${lvl.dayTime}`);
  check('bed: and it wakes, here too, the clock with it', !ha.isSleeping() && !a.player.isSleeping() && Math.abs(a.level.dayTime - lvl.dayTime) <= 1, `${a.level.dayTime} ${lvl.dayTime}`);
  host.player.setGameMode('survival');
  hb.setGameMode('survival');
  // respawning at the bed, then (its bed broken) at the world spawn
  ha.hurt(100, 'genericKill');
  step(host, 2);
  a.session.respawn();
  step(host, 3);
  check('bed: dead, it respawns beside its bed', Math.hypot(ha.x - (bx + 0.5), ha.z - (bz + 1.5)) < 2.5 && Math.abs(a.player.x - ha.x) < 1e-9, `${ha.x},${ha.z}`);
  lvl.setBlock(bx, 64, bz + 1, 0);
  lvl.setBlock(bx, 64, bz, 0);
  ha.hurt(100, 'genericKill');
  step(host, 2);
  a.chat.length = 0;
  a.session.respawn();
  step(host, 3);
  check('bed: its bed gone, it respawns at the world spawn, told why', Math.abs(ha.x - 0.5) < 1e-9 && Math.abs(ha.z - 0.5) < 1e-9 && a.chat.some((t) => t.startsWith('You have no home bed')) && ha.respawnPos === null);
  lvl.dayTime = 1000;
  step(host, 3);
}

// ---------------------------------------------------------------------------
// hands, pick-block and cooldowns: the host's to do in survival, and to tell (vanilla SWAP_ITEM_WITH_OFFHAND,
// ServerboundPickItemPacket, ClientboundSetCarriedItemPacket, ClientboundCooldownPacket)
{
  const inv = ha.inventory;
  inv.selected = 0;
  inv.main[0] = new m.ItemStack(m.getItem('iron_sword'), 1);
  inv.offhand = new m.ItemStack(m.getItem('torch'), 7);
  inv.main[20] = new m.ItemStack(m.getItem('stone'), 30);
  inv.version++;
  step(host, 3);
  a.session.swapHands();
  step(host, 3);
  check('hands: swapped by the host, the guest told', inv.offhand?.item.id === 'iron_sword' && inv.main[0]?.item.id === 'torch' && a.player.inventory.offhand?.item.id === 'iron_sword' && a.player.inventory.main[0]?.count === 7);
  a.session.pickSlot(20);
  step(host, 3);
  check('pick-block: the stone past the hotbar comes into the hand, the torches going where it was', inv.main[0]?.item.id === 'stone' && inv.main[20]?.item.id === 'torch' && a.player.inventory.main[0]?.count === 30 && a.player.inventory.main[20]?.count === 7);
  // (a survival guest's own changes to its inventory are nobody's: the host's copy stays as it was, and says so)
  a.player.inventory.main[5] = new m.ItemStack(m.getItem('diamond_block'), 64);
  a.player.inventory.version++;
  step(host, 3);
  check('inventory: a survival guest can\'t put things in its own inventory', inv.main[5] === null);
  inv.selected = 4;
  inv.version++;
  step(host, 2);
  check('hotbar: the slot the host puts in its hand is the guest\'s', a.player.inventory.selected === 4);
  a.player.inventory.selected = 2;
  a.player.inventory.version++;
  step(host, 2);
  check('hotbar: and the guest\'s choice is the host\'s', inv.selected === 2);
  ha.cooldowns.set('ender_pearl', 20);
  step(host, 2);
  check('cooldown: an item cooling down on the host is on the guest\'s', Math.abs((a.player.cooldowns.get('ender_pearl') ?? 0) - ha.cooldowns.get('ender_pearl')) <= 1, `${a.player.cooldowns.get('ender_pearl')}`);
  step(host, 25);
  check('cooldown: and done on both', !a.player.cooldowns.has('ender_pearl') && !ha.cooldowns.has('ender_pearl'));
  ha.cooldowns.set('shield', 100);
  ha.cooldownTotals.set('shield', 100);
  step(host, 2);
  ha.cooldowns.delete('shield');
  step(host, 2);
  check('cooldown: cut short, told so', !a.player.cooldowns.has('shield'));
}

// ---------------------------------------------------------------------------
// a glide into a wall: the speed the guest says it lost hurts (vanilla handleFallFlyingCollisions, the move's
// horizontalCollision), from a raw guest's moves
{
  const r = rawGuest(host);
  step(host, 1);
  r.hello('Glider');
  step(host, 3);
  const hg = hostCopy(host, { name: 'Glider' });
  const glide = m.PoseFlag.FALL_FLYING | m.PoseFlag.GLIDE_POSE;
  let x = 0.5;
  for (let i = 0; i < 3; i++) {
    x += 1.5;
    r.send([[m.SB.MovePlayer, x, 70, 0.5, -90, 0, glide, -1]]);
    step(host, 1);
  }
  r.send([[m.SB.MovePlayer, x, 70, 0.5, -90, 0, glide | m.PoseFlag.HORIZONTAL_COLLISION, -1]]);
  step(host, 2);
  check('glide: into a wall at a block and a half a tick, it\'s hurt for twelve', hg.health === 8 && hg.lastDamageSource === 'flyIntoWall', `${hg.health} ${hg.lastDamageSource}`);
  r.send([[m.SB.Disconnect, 'bye']]);
  step(host, 2);
}

check('at the end: both guests are still in', !a.disconnected && !b.disconnected && host.server.guestCount() === 2, `${a.disconnected} ${b.disconnected}`);

await exitWithStatus(close);
