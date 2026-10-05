// The ender dragon fight from a guest's side (vanilla EnderDragon and its parts, EnderDragonPart; DragonPhaseManager;
// EndDragonFight). A guest's copy of the dragon is laid out as vanilla's client lays out its own: its eight parts round
// it, its 64-tick trail for its neck and tail, its phase as the host says (DATA_PHASE). A guest hits the part under
// its crosshair, which it names as vanilla does (the dragon's id, then one for each part: EnderDragon.setId): the
// head takes the blow in full, the rest a quarter plus one, its reach checked against that part's own box; arrows
// glance off a perched dragon. Then the rest of the fight as a guest has it: the phases, the trail, the wings, the
// breath and the fireballs, the crystals' healing beam, a crystal broken, the death, the experience, the exit portal,
// the egg and a gateway, and through it.

import { loadNet, ENTITY_MODULES, makeHost, makeGuest, hostCopy, copyOf, step, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000).unref();

const centre = (e) => [(e.bb.minX + e.bb.maxX) / 2, (e.bb.minY + e.bb.maxY) / 2, (e.bb.minZ + e.bb.maxZ) / 2];
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const { m, close } = await loadNet([
  ...ENTITY_MODULES, '/src/world/gen/theEnd.ts', '/src/world/gen/endFeatures.ts', '/src/game/endDragonFight.ts', '/src/entity/enderDragon.ts',
  '/src/entity/dragonPhases.ts', '/src/entity/dragonFireball.ts', '/src/entity/areaEffectCloud.ts', '/src/game/gatewayTravel.ts', '/src/game/endGateway.ts', '/src/core/math.ts',
  '/src/game/advancements.ts',
]);
const { PHASE } = m;

// ---------------------------------------------------------------------------
// the End, as a world makes it (its island, pillars and crystals), the host on the island and a guest with it
const seed = '12345';
const gen = new m.EndGenerator(seed);
const world = new m.World();
world.reset(m.THE_END);
const level = new m.Level(world, seed);
const makeChunk = (cx, cz) => {
  if (world.getChunk(cx, cz)) return;
  const out = gen.generate(cx, cz);
  world.addChunk(out);
  for (const d of out.entities ?? []) {
    const e = m.loadEntity(d, level);
    if (e) level.addEntity(e);
  }
};
for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) makeChunk(cx, cz);
const host = makeHost(m, { world, level }, { makeChunk, x: 20.5, y: world.heightAt(20, 20), z: 20.5, gameMode: 'survival', guestGameMode: 'survival' });
level.simulationDistance = 12;
const fight = new m.EndDragonFight(level, null);
level.dragonFight = fight;
const g = makeGuest(host, 'Alex', { viewDistance: 8 });
step(host, 60);
const ha = hostCopy(host, g);
const sess = host.server.sessionOf(ha);
const d = level.entities.find((e) => e instanceof m.EnderDragon && !e.removed);
const c = d && copyOf(g, d);
check('setup: the fight\'s dragon, and the guest\'s copy of it', !!d && c instanceof m.EnderDragon);
/**
 * the host's dragon these last 40 ticks (what a guest's copy, a few ticks behind it, and more over a slow network, is
 * compared with): its parts, the heading it's drawn with, its wings' beat, the crystal healing it
 */
const past = [];
/** what else a check looks at on every one of the host's ticks */
const watch = new Set();
const levelTick = level.tick.bind(level);
level.tick = () => {
  levelTick();
  for (const f of watch) f();
  past.push({
    parts: d.subEntities.map((p) => centre(p)), yaw: d.getLatencyPos(7, 1)[0], flap: d.flapTime, crystal: d.nearestCrystal, phase: d.phaseManager.current.id,
    // (and the guest's copy as it was then: its flinch and its phase)
    copyHurt: c.hurtTime, copyPhase: c.phaseManager.current.id,
  });
  if (past.length > 40) past.shift();
};
/** the guest's player as good as new (between the parts of the fight, so that one doesn't end the next) */
function heal() {
  ha.health = ha.maxHealth;
  ha.food.foodLevel = 20;
}

/** the guest's player put at (x, y, z) by the host, looking (yaw, pitch), as a command would (vanilla teleportTo) */
function putGuest(x, y, z, yaw = 0, pitch = 0) {
  sess.teleportTo(x, y, z, yaw, pitch);
  step(host, 3);
}
/** (yaw, pitch) from the guest's eyes to (x, y, z) */
function lookAt(x, y, z) {
  const p = g.player, ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
  const dx = x - ex, dy = y - ey, dz = z - ez;
  return [(-Math.atan2(dx, dz) * 180) / Math.PI, (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI];
}
/** the guest's own crosshair (Game.tick's pick), looking at (x, y, z): what's under it */
function guestPick(x, y, z) {
  const [yaw, pitch] = lookAt(x, y, z);
  g.player.yaw = g.player.yawO = yaw;
  g.player.pitch = g.player.pitchO = pitch;
  const it = new m.Interaction(g.level, g.player);
  it.pick(g.player.x, g.player.y + g.player.eyeHeight, g.player.z, yaw, pitch);
  return it.entityHit;
}
/** a click of the attack button with `target` under the guest's crosshair */
function attack(target) {
  g.session.input(true, false, false, false, target);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 2);
}

// ---------------------------------------------------------------------------
// the guest's copy: laid out as vanilla's client lays out its own
{
  const names = ['head', 'neck', 'body', 'tail1', 'tail2', 'tail3', 'wing1', 'wing2'];
  check('copy: its eight parts are its own (none taken for the host\'s entities)', names.every((n, i) => c[n] instanceof m.EnderDragonPart && c[n].parent === c && c.subEntities[i] === c[n]));
  check('copy: (the host\'s parts are numbered after it, as vanilla\'s: EnderDragon.setId)', d.subEntities.every((p, i) => p.id === d.id + 1 + i));
  // (the guest out of its way while it circles: what it does to a guest comes later)
  putGuest(20.5, level.motionBlockingHeight(20, 26), 26.5);
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('resistance'), 100000, 4));
  let worst = 0, yawOff = 0, flap = true, moved = 0;
  const start = c.getLatencyPos(0, 1)[0];
  for (let k = 0; k < 40; k++) {
    step(host, 1);
    heal();
    // (each against the host's, as it was a few ticks before: the nearest of those)
    const parts = c.subEntities.map((p) => centre(p));
    worst = Math.max(worst, Math.min(...past.map((h) => Math.max(...h.parts.map((q, i) => apart(q, parts[i]))))));
    yawOff = Math.max(yawOff, Math.min(...past.map((h) => Math.abs(m.wrapDegrees(h.yaw - c.getLatencyPos(7, 1)[0])))));
    flap &&= past.some((h) => h.flap === c.flapTime);
    moved = Math.max(moved, Math.abs(m.wrapDegrees(c.getLatencyPos(0, 1)[0] - start)));
  }
  check('copy: its parts laid out round it where the host had them a few ticks before', worst < 3, `worst ${worst.toFixed(2)} blocks`);
  check('copy: its trail turns with it (the way it\'s drawn facing, its neck and tail)', moved > 20 && yawOff < 10, `turned ${moved.toFixed(1)}°, off by ${yawOff.toFixed(1)}° at most`);
  check('copy: its wings beat as the host\'s did', flap);
  ha.removeEffect('resistance');
  check('copy: circling, as the host has it', d.phaseManager.current.id === PHASE.HOLDING_PATTERN && c.phaseManager.current.id === PHASE.HOLDING_PATTERN && !c.isSitting());
  d.phaseManager.setPhase(PHASE.LANDING_APPROACH);
  step(host, 1);
  check('copy: its phase follows the host\'s (vanilla DATA_PHASE)', c.phaseManager.current.id === PHASE.LANDING_APPROACH);
}

// ---------------------------------------------------------------------------
// the perched dragon: a guest's sword reaches the part under its crosshair
const [px, py, pz] = d.podiumTop();
/**
 * the dragon perched on the exit portal's pillar, facing north, just come down (scanning for someone to roar at, which
 * it does after 25 ticks, turning to whoever isn't straight ahead of it); its crystals not healing it, so that each
 * blow's damage shows
 */
function perch() {
  d.moveTo(px + 0.5, py, pz + 0.5, 0, 0);
  d.dx = d.dy = d.dz = d.yRotA = 0;
  d.phaseManager.setPhase(PHASE.HOVERING);
  d.phaseManager.setPhase(PHASE.SITTING_SCANNING);
  d.sittingDamageReceived = 0;
  d.nearestCrystal = null;
  // (long enough for its trail to be of here: its neck's climb is worked out from ticks 5 to 10 ago)
  step(host, 15);
}
/**
 * a spot on the ground `out` blocks from the middle of `part`'s box, away from the dragon (where its bite doesn't
 * reach; straight ahead of it, for its head, where it doesn't turn)
 */
function besidePart(part, out) {
  const [x, , z] = centre(part);
  let vx = x - d.x, vz = z - d.z;
  const l = Math.hypot(vx, vz) || 1;
  vx /= l;
  vz /= l;
  const gx = x + vx * out, gz = z + vz * out;
  return [gx, level.motionBlockingHeight(Math.floor(gx), Math.floor(gz)), gz];
}
// (its crystals' healing held off while it's perched here: put back below)
d.checkCrystals = () => {};
{
  perch();
  check('perched: sitting on the portal, on the host and the guest', d.isSitting() && c.isSitting() && c.phaseManager.current.id === PHASE.SITTING_SCANNING);
  ha.inventory.main[0] = new m.ItemStack(m.getItem('diamond_sword'), 1);
  ha.inventory.selected = 0;
  ha.inventory.version++;
  const [gx, gy, gz] = besidePart(d.head, 2.2);
  putGuest(gx, gy, gz);
  perch();
  const health = ha.health;
  const sword = m.getItem('diamond_sword').attackDamage;
  // (the head's box is inside the neck's, and from in front they share a face: whichever the crosshair lands on, as in vanilla)
  const hit = guestPick(...centre(c.head));
  check('perched: the guest\'s crosshair, on its head, finds its copy\'s head or neck', hit === c.head || hit === c.neck, hit ? `${hit.name}` : 'nothing');
  let before = d.health;
  attack(hit);
  const want = hit === c.head ? sword : sword / 4 + 1;
  check('perched: the guest\'s sword hurts the dragon through that part (the neck a quarter plus one)', Math.abs(before - d.health - want) < 1e-6, `${hit?.name}: ${before} → ${d.health} (sword ${sword})`);
  check('perched: and the guest sees it lose that health, flinching', c.health === d.health && past.slice(-15).some((h) => h.copyHurt > 0));
  check('perched: (the guest wasn\'t bitten or flung where it stood)', ha.health === health, `${health} → ${ha.health}`);
  check('perched: (it counts toward its taking off again, vanilla sittingDamageReceived)', Math.abs(d.sittingDamageReceived - want) < 1e-6);
  perch();
  before = d.health;
  guestPick(...centre(c.head));
  attack(c.head);
  check('perched: a blow to its head counts in full', Math.abs(before - d.health - sword) < 1e-6, `${before} → ${d.health}`);
  perch();
  before = d.health;
  guestPick(...centre(c.neck));
  attack(c.neck);
  check('perched: a blow to its neck, a quarter plus one', Math.abs(before - d.health - (sword / 4 + 1)) < 1e-6, `${before} → ${d.health}`);
  // its reach: against the part's own box (vanilla canInteractWithEntity: 3 blocks and 3 more), not the dragon's, whose
  // box, 16 wide, the guest stands within 3 of
  const dist = (e) => {
    const b = e.bb, p = g.player, ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
    return Math.hypot(Math.max(b.minX - ex, 0, ex - b.maxX), Math.max(b.minY - ey, 0, ey - b.maxY), Math.max(b.minZ - ez, 0, ez - b.maxZ));
  };
  for (const name of ['wing1', 'wing2', 'tail3']) {
    perch();
    before = d.health;
    guestPick(...centre(c[name]));
    attack(c[name]);
    check(`perched: its ${name}, out of reach (${dist(d[name]).toFixed(1)} blocks; the dragon's own box ${dist(d).toFixed(1)}), isn't hurt`, d.health === before && dist(d[name]) > 3 + 3 && dist(d) < 3, `${before} → ${d.health}`);
  }
  perch();
  before = d.health;
  guestPick(...centre(c.body));
  attack(c);
  check('perched: the dragon itself, which can\'t be picked (only its parts), isn\'t hit', d.health === before);
  // (the ids a guest may name: the dragon's, then one for each of its eight parts, and no more)
  const t = sess.tracker;
  check('perched: a part named by an id past its eight, or of nothing shown, is nothing', t.partById(d.id + 1) === d.head && t.partById(d.id + 8) === d.wing2 && t.partById(d.id + 9) === null && t.partById(d.id) === null && t.partById(-5) === null);
  // an arrow glances off a perched dragon, set alight (vanilla AbstractDragonSittingPhase.onHurt)
  perch();
  before = d.health;
  const [hx, hy, hz] = centre(d.head);
  const arrow = new m.Arrow(level, ha);
  arrow.shoot(hx - arrow.x, hy - arrow.y, hz - arrow.z, 3, 0);
  level.addEntity(arrow);
  let lit = false;
  const lighting = () => (lit ||= arrow.remainingFireTicks > 0);
  watch.add(lighting);
  step(host, 10);
  watch.delete(lighting);
  check('perched: an arrow of the guest\'s does it no harm, and is set alight', d.health === before && lit, `${before} → ${d.health}, lit ${lit}`);
}

// ---------------------------------------------------------------------------
// hit hard enough while it sits (a quarter of its health), it takes off again
{
  heal();
  perch();
  d.sittingDamageReceived = 0.25 * d.maxHealth - 1;
  // (it takes off through where the guest stands, biting: Resistance V spares it here)
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('resistance'), 100000, 4));
  guestPick(...centre(c.neck));
  attack(c.neck);
  const recent = past.slice(-15);
  check('takeoff: hit hard enough by the guest while it sits, it takes off, on the guest\'s screen too', recent.some((h) => h.phase === PHASE.TAKEOFF) && recent.some((h) => h.copyPhase === PHASE.TAKEOFF));
  ha.removeEffect('resistance');
}

// ---------------------------------------------------------------------------
// perched before the guest: its roar heard, its breath seen, its cloud of breath on the ground, which hurts
{
  heal();
  perch();
  const [gx, gy, gz] = besidePart(d.head, 2.2);
  putGuest(gx, gy, gz);
  perch();
  const s0 = g.level.sounds.length, p0 = g.level.particleCalls.length;
  d.phaseManager.setPhase(PHASE.SITTING_ATTACKING);
  step(host, 5);
  const growls = g.level.sounds.slice(s0).filter((x) => x.name === 'entity.ender_dragon.growl').length;
  check('breath: roaring before it breathes, the guest hears it', growls >= 3 && c.phaseManager.current.id === PHASE.SITTING_ATTACKING, `${growls} growls`);
  const health = ha.health;
  d.phaseManager.setPhase(PHASE.SITTING_FLAMING);
  step(host, 12);
  const puffs = g.level.particleCalls.slice(p0).filter((x) => x.args[0] === 'dragon_breath').length;
  check('breath: the guest sees it breathe', puffs > 0 && c.phaseManager.current.id === PHASE.SITTING_FLAMING);
  const cloud = level.entities.find((e) => e instanceof m.AreaEffectCloud && e.owner === d && !e.removed);
  const cc = cloud && copyOf(g, cloud);
  check('breath: its cloud lies on the ground before it, on the guest\'s screen too', !!cc && cc.particle === 'dragon_breath' && cc.radius === 5, cloud ? `copy ${!!cc}` : 'no cloud');
  step(host, 30);
  check('breath: the guest, standing in it, is hurt (instant damage), and sees so', ha.health < health && g.player.health === ha.health, `${health} → ${ha.health}`);
  heal();
}
delete d.checkCrystals;

// ---------------------------------------------------------------------------
// a fireball spat at the guest as the dragon swoops at it: on its screen, and its cloud where it bursts
{
  putGuest(30.5, level.motionBlockingHeight(30, 0), 0.5);
  d.moveTo(0.5, 110, 0.5, 0, 0);
  d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
  step(host, 15);
  d.phaseManager.setPhase(PHASE.STRAFE_PLAYER);
  d.phaseManager.getPhase(PHASE.STRAFE_PLAYER).setTarget(ha);
  let ball = null, seen = false, cloud = null, cloudSeen = false, heard = false;
  const s0 = g.level.sounds.length;
  for (let k = 0; k < 1200 && !cloudSeen; k++) {
    step(host, 1);
    ball ??= level.entities.find((e) => e instanceof m.DragonFireball && e.owner === d) ?? null;
    if (ball && !ball.removed && copyOf(g, ball)) seen = true;
    if (ball?.removed) cloud ??= level.entities.find((e) => e instanceof m.AreaEffectCloud && e.radius < 4 && !e.removed) ?? null;
    if (cloud && copyOf(g, cloud)?.particle === 'dragon_breath') cloudSeen = true;
    heal();
  }
  heard = g.level.sounds.slice(s0).some((x) => x.name === 'entity.ender_dragon.shoot');
  check('fireball: the dragon swoops at the guest and spits a fireball, which the guest sees and hears', !!ball && seen && heard, `ball ${!!ball}, seen ${seen}, heard ${heard}`);
  check('fireball: where it bursts, its cloud of breath, on the guest\'s screen too', cloudSeen);
}

// ---------------------------------------------------------------------------
// the crystals: the beam that heals it drawn to the crystal the host has it drawn to; one broken by the guest
{
  d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
  let beams = 0, wrong = 0;
  for (let k = 0; k < 400; k++) {
    step(host, 1);
    heal();
    // (drawn to one the host had it drawn to these last ticks; to the host's own once that's held a while)
    const recent = past.slice(-12), nc = d.nearestCrystal;
    if (c.nearestCrystal && !recent.some((h) => h.crystal && copyOf(g, h.crystal) === c.nearestCrystal)) wrong++;
    if (nc && copyOf(g, nc) && recent.every((h) => h.crystal === nc)) {
      beams++;
      if (c.nearestCrystal !== copyOf(g, nc)) wrong++;
    }
  }
  check('crystals: its healing beam drawn to the crystal the host has it drawn to', beams > 0 && wrong === 0, `${beams} ticks with a beam, ${wrong} wrong`);
  // (the blast of a crystal at arm's length would kill the guest, as it would in vanilla: Resistance V spares it here)
  putGuest(20.5, level.motionBlockingHeight(20, 26), 26.5);
  ha.addEffect(new m.MobEffectInstance(m.mobEffect('resistance'), 200, 4));
  const gx = ha.x + 2.5, gz = ha.z;
  const crystal = new m.EndCrystal(level, gx, ha.y, gz);
  crystal.showBottom = false;
  level.addEntity(crystal);
  step(host, 25);
  const copy = copyOf(g, crystal);
  check('crystals: a crystal set down near the guest, which it sees (without its plinth)', !!copy && copy.showBottom === false);
  const hit = guestPick(...centre(copy));
  attack(hit);
  check('crystals: the guest\'s blow blows it up, and it\'s gone from its screen', hit === copy && crystal.removed && !copyOf(g, crystal), `picked ${hit?.type}`);
}

// ---------------------------------------------------------------------------
// the death: the guest's blow brings it down; it flies to the portal and dies there, the guest watching and hearing,
// and taking its experience; the exit portal opens, the egg is set on it and a gateway opens, all in the guest's world
let gate = null;
{
  const [gx, gy, gz] = [px + 6.5, level.motionBlockingHeight(px + 6, pz), pz + 0.5];
  putGuest(gx, gy, gz);
  d.moveTo(0.5, 100, 40.5, 0, 0);
  d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
  step(host, 15);
  const s0 = g.level.sounds.length;
  d.hurtPart(d.head, 1000, 'player', ha, ha);
  step(host, 1);
  check('death: brought down by the guest in flight, it makes for the portal (its phase on the guest too)', d.phaseManager.current.id === PHASE.DYING && c.phaseManager.current.id === PHASE.DYING && d.health === 1);
  check('death: Free the End is the guest\'s, whose blow it was', sess.progress.advancements.isDone(m.ADVANCEMENTS.get('end/kill_dragon')));
  let dissolving = 0, lastDeath = 0, under = false;
  for (let k = 0; k < 1500 && !d.removed; k++) {
    step(host, 1);
    heal();
    if (c.dragonDeathTime > lastDeath) dissolving++;
    lastDeath = c.dragonDeathTime;
    if (d.health <= 0 && !under) {
      // (its throes begun over the portal: the guest under it, where its experience falls, but clear of the portal)
      under = true;
      const ux = d.x - (px + 0.5), uz = d.z - (pz + 0.5), r = Math.hypot(ux, uz) || 1, k2 = Math.max(r, 5) / r;
      const tx = px + 0.5 + ux * k2, tz = pz + 0.5 + uz * k2;
      putGuest(tx, level.motionBlockingHeight(Math.floor(tx), Math.floor(tz)), tz);
    }
  }
  step(host, 5);
  check('death: it dies over the portal, and the guest watches it come apart (its death time, which it\'s drawn by)', d.removed && dissolving >= 10 && lastDeath > 150, `removed ${d.removed}, ${dissolving} times, to ${lastDeath}`);
  check('death: its death roar heard by the guest', g.level.sounds.slice(s0).some((x) => x.name === 'entity.ender_dragon.death'));
  check('death: gone from the guest\'s world', !g.level.entities.includes(c) && !copyOf(g, d));
  for (let k = 0; k < 200; k++) {
    step(host, 1);
    heal();
  }
  check('death: its experience, which the guest took', ha.xpLevel >= 30 && g.player.xpLevel === ha.xpLevel, `host ${ha.xpLevel}, guest ${g.player.xpLevel}`);
  const name = (w, x, y, z) => m.BLOCKS[m.STATE_BLOCK[w.getState(x, y, z)]].name;
  const [ox, oy, oz] = fight.portalLocation;
  let portal = 0, portalGuest = 0;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (name(world, ox + dx, oy, oz + dz) === 'end_portal') portal++;
    if (name(g.world, ox + dx, oy, oz + dz) === 'end_portal') portalGuest++;
  }
  check('death: the exit portal open, in the guest\'s world too', portal > 0 && portalGuest === portal, `${portal} on the host, ${portalGuest} on the guest`);
  check('death: the dragon egg set on its pillar, in the guest\'s world too', name(world, ox, oy + 4, oz) === 'dragon_egg' && name(g.world, ox, oy + 4, oz) === 'dragon_egg');
  for (let x = -100; x <= 100 && !gate; x++) for (let z = -100; z <= 100 && !gate; z++) if (name(world, x, 75, z) === 'end_gateway') gate = [x, 75, z];
  check('death: a gateway opened, in the guest\'s world too', !!gate && name(g.world, ...gate) === 'end_gateway', JSON.stringify(gate));
  check('death: and the boss bar gone from the guest\'s screen', g.session.bossBars.size === 0);
}

// ---------------------------------------------------------------------------
// through the gateway: the guest, walking into it, comes out on the outer islands, and is told where it is
{
  // (Game.portalEntered's end gateway, for anything, a guest's player too)
  level.onPortal = (e, x, y, z, kind) => kind === 'end_gateway' && m.gatewayTravel(level, e, x, y, z);
  const [gx, gy, gz] = gate;
  putGuest(gx + 0.5, gy, gz + 0.5);
  for (let k = 0; k < 400 && Math.hypot(ha.x, ha.z) < 500; k++) {
    // (the chunks the gateway asks for, as a world's chunk tickets are served)
    for (const t of level.tickets.values()) for (let dz = -t.load; dz <= t.load; dz++) for (let dx = -t.load; dx <= t.load; dx++) makeChunk(t.cx + dx, t.cz + dz);
    step(host, 1);
    heal();
  }
  check('gateway: the guest walking into it comes out far off, on the outer islands', Math.hypot(ha.x, ha.z) > 700, `at ${ha.x.toFixed(1)}, ${ha.y.toFixed(1)}, ${ha.z.toFixed(1)}`);
  step(host, 40);
  check('gateway: and is told where it is, the world round it there sent', Math.hypot(g.player.x - ha.x, g.player.z - ha.z) < 1 && !!g.world.getChunk(Math.floor(ha.x) >> 4, Math.floor(ha.z) >> 4), `guest at ${g.player.x.toFixed(1)}, ${g.player.z.toFixed(1)}`);
}

exitWithStatus(close);
