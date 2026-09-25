// M3: vibrations and the sculk at work, with the level ticking. A game event near a sculk sensor becomes a vibration
// that travels to it a block a tick and sets it off with power by distance; the nearest of a tick's is heard; wool in
// the way stops one and wool or carpet where it happens muffles it; sneaking hides steps and landings; the calibrated
// sensor hears 16 blocks and only the frequency its back is powered at; amethyst passes a frequency on. Shriekers
// warn the players (and what answers each warning), darkness falls, a catalyst takes a death's experience and
// spreads sculk from where it fell; Swift Sneak; saving a vibration on its way; and the game events the world makes.
// Run: node tests/ancient-city/m3-vibrations.mjs

import { load, check, exitWithStatus, flatLevel, place, prop, ticks, stackOf, blockName } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/sculkSensor.ts', '/src/game/sculkShrieker.ts', '/src/game/sculkCatalyst.ts', '/src/game/vibrations.ts', '/src/game/gameEvents.ts',
  '/src/game/wardenSpawnTracker.ts', '/src/entity/player.ts', '/src/game/interaction.ts', '/src/entity/monsters.ts', '/src/entity/animals.ts',
  '/src/entity/effects.ts', '/src/game/redstone/signal.ts', '/src/entity/arrow.ts', '/src/entity/tnt.ts',
  '/src/game/turtleEggs.ts', '/src/entity/turtle.ts', '/src/entity/fox.ts', '/src/entity/rabbit.ts', '/src/game/goatHorn.ts',
  '/src/entity/fireworkRocket.ts', '/src/entity/frog.ts',
]);

const G = 64;
const STONE = m.S('stone');
const f32 = Math.fround;

/**
 * a flat stone world (chunks -2..2, the ground's top at G) whose particle sink takes the sculk's particles too, with
 * every game event and player trigger logged
 */
function scene() {
  const sc = flatLevel(m, -2, -2, 2, 2);
  const { level, particles } = sc;
  Object.assign(level.particles, {
    vibration: (x, y, z, target, n) => particles.push({ kind: 'vibration', x, y, z, target, ticks: n, t: level.gameTime }),
    shriek: (x, y, z, delay) => particles.push({ kind: 'shriek', x, y, z, delay, t: level.gameTime }),
    sculkCharge: (x, y, z) => particles.push({ kind: 'sculk_charge', x, y, z, t: level.gameTime }),
    dustTransition: (x, y, z) => particles.push({ kind: 'dust_transition', x, y, z, t: level.gameTime }),
  });
  const events = [];
  const post = level.gameEvent.bind(level);
  level.gameEvent = (event, x, y, z, ctx = {}) => {
    events.push({ event, x, y, z, entity: ctx.entity ?? null, state: ctx.state ?? null, t: level.gameTime });
    post(event, x, y, z, ctx);
  };
  const triggers = [];
  level.onPlayerTrigger = (_p, type) => triggers.push(type);
  return { ...sc, events, triggers };
}

/** a player at (x, y, z) in `mode`, the level's own player unless `local` is false */
function addPlayer(level, x, y, z, { yaw = 0, pitch = 0, mode = 'survival', local = true } = {}) {
  const p = new m.Player(level);
  p.gameMode = mode;
  p.moveTo(x, y, z, yaw, pitch);
  level.addEntity(p);
  if (local) level.player = p;
  return p;
}

const phase = (level, x, y, z) => prop(m, level, x, y, z, 'sculk_sensor_phase');
const power = (level, x, y, z) => prop(m, level, x, y, z, 'power');

/** tick until the sensor at (x, y, z) goes active, at most `max` ticks: how many it took and its power (or null) */
function untilActive(level, x, y, z, max = 40) {
  for (let i = 1; i <= max; i++) {
    level.tick();
    if (phase(level, x, y, z) === 'active') return { ticks: i, power: power(level, x, y, z) };
  }
  return null;
}

/** vanilla: a vibration `d` blocks from a sensor listening `r` blocks gives this power */
const strength = (d, r) => Math.max(1, 15 - Math.floor((15 / r) * d));

// ---------------------------------------------------------------------------------------------------------------
// A block placed five blocks away, tick by tick

{
  const { level, sounds, particles, events } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const be = m.sensorAt(level, 0, G, 0);
  check('sensor: placed listening, with no power, its block entity on the listeners', phase(level, 0, G, 0) === 'inactive' && power(level, 0, G, 0) === 0 && !!be);
  const t0 = level.gameTime;
  level.gameEvent('block_place', 5.5, G + 0.5, 0.5, { state: STONE });
  const cand = be.vibration.selector.current;
  check('vibration: a block placed 5 blocks off is a candidate that tick, 5 from the sensor\'s middle', cand?.info.event === 'block_place' && cand.info.distance === 5 && cand.tick === t0);
  level.tick();
  const vp = particles.filter((p) => p.kind === 'vibration');
  check(
    'vibration: it sets off the tick after, the particle flying from where it happened to the sensor in 5 ticks',
    vp.length === 1 && vp[0].x === 5.5 && vp[0].y === G + 0.5 && vp[0].z === 0.5 && vp[0].ticks === 5 && vp[0].target().join() === `0.5,${G + 0.5},0.5` && vp[0].t === t0 + 1,
    JSON.stringify(vp),
  );
  const seen = [phase(level, 0, G, 0)];
  for (let i = 2; i <= 5; i++) {
    level.tick();
    seen.push(phase(level, 0, G, 0));
  }
  check('vibration: a block a tick: the sensor goes active 5 ticks after the block was placed', seen.join() === 'inactive,inactive,inactive,inactive,active', seen.join());
  check('sensor: power 6 for a vibration 5 blocks off (15 - floor(15/8 x 5))', power(level, 0, G, 0) === 6, `${power(level, 0, G, 0)}`);
  check('sensor: its tendrils click as it goes active (the sound, and the event for shriekers)', sounds.some((s) => s.name === 'block.sculk_sensor.clicking' && s.t === t0 + 5) && events.some((e) => e.event === 'sculk_sensor_tendrils_clicking' && e.t === t0 + 5));
  check('sensor: a comparator reads the frequency it went active with (block_place: 13)', m.sensorAnalogOutput(level, 0, G, 0, level.getState(0, G, 0)) === 13 && be.lastVibrationFrequency === 13);
  check('sensor: it powers the blocks round it, and strongly the one under it', m.getSignal(level.world, 0, G, 0, m.WEST) === 6 && m.getSignal(level.world, 0, G, 0, m.NORTH) === 6 && m.behaviorOf(level.getState(0, G, 0)).getDirectSignal(level.world, 0, G, 0, level.getState(0, G, 0), m.UP) === 6);
  // while it's active or cooling down it hears nothing
  level.gameEvent('block_destroy', 2.5, G + 0.5, 0.5, { state: STONE });
  check('sensor: while active it hears nothing', be.vibration.selector.current === null);
  ticks(level, 29);
  check('sensor: still active 29 ticks in', phase(level, 0, G, 0) === 'active' && power(level, 0, G, 0) === 6 && level.gameTime === t0 + 34);
  level.tick();
  check('sensor: 30 ticks after it went active it cools down, its power gone', phase(level, 0, G, 0) === 'cooldown' && power(level, 0, G, 0) === 0 && m.sensorAnalogOutput(level, 0, G, 0, level.getState(0, G, 0)) === 0);
  level.gameEvent('block_destroy', 2.5, G + 0.5, 0.5, { state: STONE });
  check('sensor: cooling down it hears nothing either', be.vibration.selector.current === null);
  ticks(level, 9);
  check('sensor: cooling down for 10 ticks', phase(level, 0, G, 0) === 'cooldown');
  level.tick();
  check('sensor: then listening again, with the tendrils\' stop sound', phase(level, 0, G, 0) === 'inactive' && sounds.some((s) => s.name === 'block.sculk_sensor.clicking_stop' && s.t === t0 + 45));
  level.gameEvent('block_destroy', 2.5, G + 0.5, 0.5, { state: STONE });
  const r = untilActive(level, 0, G, 0);
  check('sensor: listening again it hears the next (a block broken 2 blocks off: 2 ticks, power 12)', r?.ticks === 2 && r.power === 12 && be.lastVibrationFrequency === 12, JSON.stringify(r));
}

// ---------------------------------------------------------------------------------------------------------------
// Power and timing by distance: a sensor 8 blocks, a calibrated sensor 16

{
  const { level } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const got = [], want = [];
  for (let d = 1; d <= 8; d++) {
    level.gameEvent('block_place', d + 0.5, G + 0.5, 0.5, { state: STONE });
    const r = untilActive(level, 0, G, 0);
    got.push(r ? `${r.ticks}:${r.power}` : '-');
    want.push(`${d}:${strength(d, 8)}`);
    ticks(level, 45);
  }
  check('sensor: 1 to 8 blocks off it goes active that many ticks later with power 14 12 10 8 6 4 2 1', got.join() === want.join() && want.map((w) => w.split(':')[1]).join(' ') === '14 12 10 8 6 4 2 1', got.join());
  level.gameEvent('block_place', 9.5, G + 0.5, 0.5, { state: STONE });
  check('sensor: 9 blocks off it hears nothing', untilActive(level, 0, G, 0, 20) === null);
  level.gameEvent('block_place', 0.5, G + 8.5, 0.5, { state: STONE });
  check('sensor: 8 blocks straight up it hears, power 1', untilActive(level, 0, G, 0)?.power === 1);
  ticks(level, 45);
  // (5, 3, 4) off: sqrt(50) = 7.07 blocks, 7 ticks, power 15 - floor(13.26) = 2
  level.gameEvent('block_place', 5.5, G + 3.5, 4.5, { state: STONE });
  const r = untilActive(level, 0, G, 0);
  check('sensor: a vibration from (5, 3, 4) off: 7 ticks, power 2', r?.ticks === 7 && r.power === 2, JSON.stringify(r));
}

{
  const { level } = scene();
  // placed looking south: it faces south, its back (the input) to the north
  place(m, level, 'calibrated_sculk_sensor', 0, G, 0, { yaw: 0 });
  check('calibrated sensor: placed facing the way the player looked', prop(m, level, 0, G, 0, 'facing') === 'south');
  const got = [], want = [];
  for (const d of [4, 8, 12, 16]) {
    level.gameEvent('block_place', d + 0.5, G + 0.5, 0.5, { state: STONE });
    const r = untilActive(level, 0, G, 0);
    got.push(r ? `${r.ticks}:${r.power}` : '-');
    want.push(`${d}:${strength(d, 16)}`);
    ticks(level, 25);
  }
  check('calibrated sensor: it hears 16 blocks, power by distance out of 16 (4: 12, 8: 8, 12: 4, 16: 1)', got.join() === want.join() && want.join() === '4:12,8:8,12:4,16:1', got.join());
  level.gameEvent('block_place', 17.5, G + 0.5, 0.5, { state: STONE });
  check('calibrated sensor: 17 blocks off it hears nothing', untilActive(level, 0, G, 0, 25) === null);
  level.gameEvent('block_place', 2.5, G + 0.5, 0.5, { state: STONE });
  untilActive(level, 0, G, 0);
  ticks(level, 9);
  const at9 = phase(level, 0, G, 0);
  level.tick();
  check('calibrated sensor: active for 10 ticks, not 30', at9 === 'active' && phase(level, 0, G, 0) === 'cooldown');
  ticks(level, 10);
  check('calibrated sensor: then 10 ticks cooling down', phase(level, 0, G, 0) === 'inactive');
  // its power goes out all round but its back
  level.gameEvent('block_place', 2.5, G + 0.5, 0.5, { state: STONE });
  untilActive(level, 0, G, 0);
  const p = power(level, 0, G, 0);
  check('calibrated sensor: no power out of its back (to the north), the rest all round', m.getSignal(level.world, 0, G, 0, m.SOUTH) === 0 && m.getSignal(level.world, 0, G, 0, m.NORTH) === p && m.getSignal(level.world, 0, G, 0, m.WEST) === p && p > 0);
  ticks(level, 25);
  // a redstone block against its back: 15 in, so only frequency 15 (a death, an explosion)
  level.setBlock(0, G, -1, m.S('redstone_block'));
  level.gameEvent('block_place', 3.5, G + 0.5, 0.5, { state: STONE });
  check('calibrated sensor: 15 into its back: a block placed (13) is not heard', untilActive(level, 0, G, 0, 12) === null);
  level.gameEvent('explode', 3.5, G + 0.5, 0.5, {});
  check('calibrated sensor: 15 into its back: an explosion (15) is', untilActive(level, 0, G, 0)?.ticks === 3 && m.sensorAt(level, 0, G, 0).lastVibrationFrequency === 15);
  ticks(level, 25);
  // at its side it's no input: it hears anything again
  level.setBlock(0, G, -1, 0);
  level.setBlock(1, G, 0, m.S('redstone_block'));
  level.gameEvent('block_place', 0.5, G + 0.5, 3.5, { state: STONE });
  check('calibrated sensor: power into its side is no filter', untilActive(level, 0, G, 0)?.ticks === 3);
  ticks(level, 25);
  level.setBlock(1, G, 0, 0);
  // redstone dust running into its back from a redstone block 3 blocks off: 13 in, only frequency 13
  level.setBlock(0, G, -4, m.S('redstone_block'));
  for (let z = -3; z <= -1; z++) place(m, level, 'redstone_wire', 0, G, z);
  const into = prop(m, level, 0, G, -1, 'power');
  check('calibrated sensor: the dust at its back carries 13', into === 13, `${into}`);
  level.gameEvent('block_destroy', 3.5, G + 0.5, 0.5, { state: STONE });
  check('calibrated sensor: 13 into its back: a block broken (12) is not heard', untilActive(level, 0, G, 0, 12) === null);
  level.gameEvent('block_place', 3.5, G + 0.5, 0.5, { state: STONE });
  check('calibrated sensor: 13 into its back: a block placed (13) is', untilActive(level, 0, G, 0)?.ticks === 3 && m.sensorAt(level, 0, G, 0).lastVibrationFrequency === 13);
}

// ---------------------------------------------------------------------------------------------------------------
// Which of a tick's vibrations is heard

{
  const { level } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const be = m.sensorAt(level, 0, G, 0);
  level.gameEvent('block_place', 6.5, G + 0.5, 0.5, { state: STONE });
  level.gameEvent('block_destroy', 3.5, G + 0.5, 0.5, { state: STONE });
  level.gameEvent('step', 7.5, G + 0.5, 0.5, {});
  const r = untilActive(level, 0, G, 0);
  check('selector: of a tick\'s vibrations the nearest is heard (3 blocks: 3 ticks, power 10, frequency 12)', r?.ticks === 3 && r.power === 10 && be.lastVibrationFrequency === 12, JSON.stringify(r));
  ticks(level, 45);
  level.gameEvent('step', 4.5, G + 0.5, 0.5, {});
  level.gameEvent('block_change', 0.5, G + 0.5, 4.5, {});
  level.gameEvent('item_interact_finish', -3.5, G + 0.5, 0.5, {});
  untilActive(level, 0, G, 0);
  const tie1 = be.lastVibrationFrequency;
  ticks(level, 45);
  level.gameEvent('block_change', 0.5, G + 0.5, 4.5, {});
  level.gameEvent('step', 4.5, G + 0.5, 0.5, {});
  untilActive(level, 0, G, 0);
  check('selector: on a tie the higher frequency is heard, whichever came first', tie1 === 11 && be.lastVibrationFrequency === 11, `${tie1} ${be.lastVibrationFrequency}`);
  ticks(level, 45);
  // one on its way: the sensor hears nothing else till it's there
  level.gameEvent('block_place', 7.5, G + 0.5, 0.5, { state: STONE });
  level.tick();
  level.gameEvent('block_place', 1.5, G + 0.5, 0.5, { state: STONE });
  check('selector: while a vibration is on its way nothing else is taken', be.vibration.current?.x === 7.5 && be.vibration.selector.current === null);
  const r2 = untilActive(level, 0, G, 0);
  check('selector: the far one arrives in its own time (7 ticks, power 2)', r2?.ticks === 6 && r2.power === 2, JSON.stringify(r2));
  // (vanilla VibrationSelector: a candidate from a later tick never replaces one waiting from an earlier tick)
  const sel = new m.VibrationSelector();
  sel.addCandidate({ event: 'step', distance: 6 }, 10);
  sel.addCandidate({ event: 'block_place', distance: 3 }, 11);
  check('selector: a nearer one from a later tick doesn\'t replace the one waiting', sel.chosenCandidate(11)?.distance === 6 && sel.chosenCandidate(10) === null);
}

// ---------------------------------------------------------------------------------------------------------------
// Wool: in the way, it stops a vibration; where it happens, it muffles it

{
  const { level, events } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const be = m.sensorAt(level, 0, G, 0);
  level.setBlock(3, G, 0, m.S('white_wool'));
  level.gameEvent('block_place', 5.5, G + 0.5, 0.5, { state: STONE });
  check('wool: a wool block between them stops the vibration', be.vibration.selector.current === null && untilActive(level, 0, G, 0, 10) === null);
  level.setBlock(3, G, 0, m.S('lime_carpet'));
  level.gameEvent('block_place', 5.5, G + 0.5, 0.5, { state: STONE });
  check('wool: a carpet in the way doesn\'t', untilActive(level, 0, G, 0)?.ticks === 5);
  ticks(level, 45);
  level.setBlock(3, G, 0, 0);
  level.setBlock(3, G, 1, m.S('black_wool'));
  level.setBlock(3, G + 1, 0, m.S('black_wool'));
  level.gameEvent('block_place', 5.5, G + 0.5, 0.5, { state: STONE });
  check('wool: wool beside the line doesn\'t', untilActive(level, 0, G, 0)?.ticks === 5);
  ticks(level, 45);
  level.setBlock(3, G, 1, 0);
  level.setBlock(3, G + 1, 0, 0);
  // (vanilla isOccluded: six lines, each nudged out of a face of the event's block; one clear line is enough) a
  // vibration from (2, 0, 2) runs corner to corner past (2, 0, 1) and (1, 0, 2): one of them wool, it slips past
  level.setBlock(2, G, 1, m.S('white_wool'));
  level.gameEvent('block_place', 2.5, G + 0.5, 2.5, { state: STONE });
  check('wool: a vibration slips past the corner of one wool block', untilActive(level, 0, G, 0)?.ticks === 2);
  ticks(level, 45);
  level.setBlock(1, G, 2, m.S('white_wool'));
  level.gameEvent('block_place', 2.5, G + 0.5, 2.5, { state: STONE });
  check('wool: not between two meeting at the corner', untilActive(level, 0, G, 0, 10) === null);
  check('wool: occlusion goes from the middle of one block to the middle of the other', m.isOccluded(level, 2.5, G + 0.5, 2.5, 0.5, G + 0.5, 0.5) && m.isOccluded(level, 2.9, G + 0.1, 2.1, 0.2, G + 0.8, 0.7));
  level.setBlock(2, G, 1, 0);
  level.setBlock(1, G, 2, 0);
  for (const st of ['white_wool', 'red_wool', 'black_carpet', 'light_blue_carpet']) {
    level.gameEvent('block_place', 3.5, G + 0.5, 0.5, { state: m.S(st) });
    check(`wool: a ${st.replace('_', ' ')} placed makes no vibration`, be.vibration.selector.current === null);
  }
  level.gameEvent('block_place', 3.5, G + 0.5, 0.5, { state: m.S('oak_planks') });
  check('wool: planks placed do', untilActive(level, 0, G, 0)?.ticks === 3);
  ticks(level, 45);
  // a player walking over carpet: its steps are the carpet's, muffled
  for (let x = 1; x <= 9; x++) level.setBlock(x, G, 2, m.S('gray_carpet'));
  const p = addPlayer(level, 8.5, G + 1 / 16, 2.5, { yaw: 90 });
  p.input.forward = true;
  let active = false;
  for (let i = 0; i < 25; i++) {
    level.tick();
    if (phase(level, 0, G, 0) !== 'inactive') active = true;
  }
  p.input.forward = false;
  const steps = events.filter((e) => e.event === 'step' && e.entity === p);
  check('wool: a player walking over carpet makes steps on the carpet, which set nothing off', steps.length >= 2 && steps.every((e) => blockName(m, e.state) === 'gray_carpet') && !active && p.x < 5, `${steps.length} ${active} ${p.x}`);
}

// ---------------------------------------------------------------------------------------------------------------
// A player walking up to a sensor, sneaking up to one, and landing

{
  const { level, events } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const p = addPlayer(level, 7.5, G, 0.5, { yaw: 90 });
  p.input.forward = true;
  let wentActive = -1;
  for (let i = 0; i < 60 && wentActive < 0; i++) {
    level.tick();
    if (phase(level, 0, G, 0) === 'active') wentActive = level.gameTime;
  }
  p.input.forward = false;
  const step = events.find((e) => e.event === 'step' && e.entity === p);
  check('steps: a player walking makes steps, on the stone', !!step && step.state === STONE);
  const dist = f32(Math.hypot(step.x - 0.5, step.y - (G + 0.5), step.z - 0.5));
  const inBlocks = m.distanceInBlocks(Math.floor(step.x), Math.floor(step.y), Math.floor(step.z), 0, G, 0);
  check(
    'steps: the first sets the sensor off as far off in ticks as it was in blocks, with power by distance',
    wentActive === step.t + Math.max(1, Math.floor(dist)) && power(level, 0, G, 0) === strength(inBlocks, 8),
    `step at ${step.x.toFixed(2)} t${step.t}, active at ${wentActive} power ${power(level, 0, G, 0)}`,
  );
}

{
  const { level, events, triggers } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const p = addPlayer(level, 7.5, G, 0.5, { yaw: 90 });
  p.input.forward = true;
  p.input.sneak = true;
  let active = false;
  for (let i = 0; i < 80; i++) {
    level.tick();
    if (phase(level, 0, G, 0) !== 'inactive') active = true;
  }
  p.input.forward = false;
  const steps = events.filter((e) => e.event === 'step' && e.entity === p).length;
  check('sneaking: a sneaking player\'s steps are made but not heard', steps >= 1 && !active && p.x > 1.5, `${steps} steps, x ${p.x.toFixed(2)}, active ${active}`);
  check('sneaking: a sensor not hearing a sneaking player earns Sneak 100', triggers.includes('avoid_vibration'));
  // landing from a jump off a block: not heard sneaking, heard not
  p.moveTo(3.5, G + 2, 0.5, 90, 0);
  p.dy = 0;
  ticks(level, 20);
  const land = events.filter((e) => e.event === 'hit_ground' && e.entity === p);
  check('sneaking: a sneaking player landing makes hit_ground, unheard', land.length === 1 && phase(level, 0, G, 0) === 'inactive', `${land.length}`);
  p.input.sneak = false;
  ticks(level, 5);
  p.moveTo(3.5, G + 2, 0.5, 90, 0);
  p.dy = 0;
  let r = null;
  for (let i = 0; i < 20 && !r; i++) {
    level.tick();
    if (phase(level, 0, G, 0) === 'active') r = m.sensorAt(level, 0, G, 0).lastVibrationFrequency;
  }
  check('landing: not sneaking it\'s heard (frequency 2)', r === 2, `${r}`);
}

{
  // stepping onto a sensor sets it off even sneaking (vanilla SculkSensorBlock.stepOn)
  const { level } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const be = m.sensorAt(level, 0, G, 0);
  const p = addPlayer(level, 0.5, G + 0.75, 0.5);
  p.input.sneak = true;
  let stepped = -1;
  for (let i = 0; i < 10 && stepped < 0; i++) {
    level.tick();
    if (be.vibration.selector.current?.tick === level.gameTime) stepped = level.gameTime;
  }
  const cand = be.vibration.selector.current?.info;
  check('stepping on: a player sneaking onto a sensor makes a step it hears, from where they stand', stepped > 0 && cand.event === 'step' && cand.entity === p && cand.distance === 0 && phase(level, 0, G, 0) === 'inactive');
  level.tick();
  check('stepping on: the tick after, it goes active with power 15', phase(level, 0, G, 0) === 'active' && power(level, 0, G, 0) === 15);
}

// ---------------------------------------------------------------------------------------------------------------
// Dropped items: a wool or carpet one lands without a sound a sensor hears

{
  const { level, events } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const drop = (id) => {
    const it = new m.ItemEntity(level, stackOf(m, id));
    it.moveTo(3.5, G + 2, 0.5, 0, 0);
    it.dx = it.dy = it.dz = 0;
    level.addEntity(it);
    return it;
  };
  const wool = drop('white_wool');
  let active = false;
  for (let i = 0; i < 30; i++) {
    level.tick();
    if (phase(level, 0, G, 0) !== 'inactive') active = true;
  }
  check('items: a dropped wool block lands (hit_ground) unheard', events.some((e) => e.event === 'hit_ground' && e.entity === wool) && !active);
  const stone = drop('cobblestone');
  let heard = false;
  for (let i = 0; i < 30 && !heard; i++) {
    level.tick();
    if (phase(level, 0, G, 0) === 'active') heard = true;
  }
  check('items: a dropped cobblestone landing is heard', events.some((e) => e.event === 'hit_ground' && e.entity === stone) && heard);
}

// ---------------------------------------------------------------------------------------------------------------
// Amethyst passes the frequency on

{
  const { level, sounds, events } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  level.setBlock(1, G, 0, m.S('amethyst_block'));
  place(m, level, 'sculk_sensor', 8, G, 0);
  const t0 = level.gameTime;
  level.gameEvent('block_place', -4.5, G + 0.5, 0.5, { state: STONE });
  const a = untilActive(level, 0, G, 0);
  const res = events.find((e) => e.event === 'resonate_13');
  const chime = sounds.find((s) => s.name === 'block.amethyst_block.resonate');
  check('amethyst: the sensor against it goes active (5 blocks off, power 6)', a?.ticks === 5 && a.power === 6);
  check('amethyst: it resonates the frequency on from the amethyst block (resonate_13)', res?.x === 1.5 && res.y === G + 0.5 && res.z === 0.5 && res.t === t0 + 5);
  check('amethyst: with a chime at that frequency\'s pitch (2^(9/12))', chime && Math.abs(chime.pitch - f32(Math.pow(2, 9 / 12))) < 1e-6, `${chime?.pitch}`);
  const b = untilActive(level, 8, G, 0);
  check('amethyst: the sensor 7 blocks from it hears the resonance 7 ticks later (power 2)', b?.ticks === 7 && b.power === 2, JSON.stringify(b));
  check('amethyst: and gives out the first vibration\'s frequency (13)', m.sensorAt(level, 8, G, 0).lastVibrationFrequency === 13 && m.sensorAnalogOutput(level, 8, G, 0, level.getState(8, G, 0)) === 13);
}

// ---------------------------------------------------------------------------------------------------------------
// A vibration on its way when the sensor is saved

{
  const { level, particles } = scene();
  place(m, level, 'sculk_sensor', 0, G, 0);
  const be = m.sensorAt(level, 0, G, 0);
  level.gameEvent('block_place', 6.5, G + 0.5, 0.5, { state: STONE });
  ticks(level, 2);
  const saved = be.save();
  const again = m.loadBlockEntity(JSON.parse(JSON.stringify(saved)));
  check('save: the vibration on its way is saved and loaded (event, where from, how far, ticks left)', again.vibration.current?.event === 'block_place' && again.vibration.current.x === 6.5 && again.vibration.current.distance === 6 && again.vibration.travelTime === be.vibration.travelTime && be.vibration.travelTime === 4);
  // swap the loaded one in: it shows the particle again from where it had got to, and arrives on time
  level.world.blockEntities.set(be.key, again);
  const before = particles.filter((p) => p.kind === 'vibration').length;
  const r = untilActive(level, 0, G, 0);
  const shown = particles.filter((p) => p.kind === 'vibration').slice(before);
  check('save: loaded, the vibration particle is shown again a third of the way along', shown.length === 1 && Math.abs(shown[0].x - (6.5 - 6 * (2 / 6))) < 1e-9 && shown[0].ticks === 4, JSON.stringify(shown.map((p) => [p.x, p.ticks])));
  check('save: and the vibration arrives when it would have (4 more ticks)', r?.ticks === 4 && r.power === strength(6, 8), JSON.stringify(r));
}

// ---------------------------------------------------------------------------------------------------------------
// Shriekers: a player sets off a sensor, whose clicking sets off a shrieker, which warns them; what answers

const shrieker = (props) => m.getBlock('sculk_shrieker').state(props);
const shrieking = (level, x, y, z) => prop(m, level, x, y, z, 'shrieking');
const answers = (sounds, t) => sounds.filter((s) => s.t === t && s.name.startsWith('entity.warden.'));

{
  const { level, sounds, particles, events } = scene();
  level.setBlock(0, G, 0, shrieker({ can_summon: true }));
  place(m, level, 'sculk_sensor', 4, G, 0);
  const p = addPlayer(level, 7.5, G, 0.5);
  const tr = p.wardenSpawnTracker;
  /** the player makes a step 3 blocks from the sensor: 3 ticks on the sensor clicks, 4 more on the shrieker hears it */
  const round = () => {
    const t = level.gameTime;
    level.gameEvent('step', 7.5, G, 0.5, { entity: p, state: STONE });
    ticks(level, 6);
    const early = shrieking(level, 0, G, 0);
    level.tick();
    return { t, early, shrieked: shrieking(level, 0, G, 0) };
  };
  const r1 = round();
  check('shrieker: a player\'s step sets off the sensor, whose clicking reaches the shrieker 4 ticks later: it shrieks', !r1.early && r1.shrieked && level.gameTime === r1.t + 7);
  check('shrieker: it warned the player: warning level 1, no more for 10 seconds', tr.warningLevel === 1 && tr.cooldownTicks === 200 && m.shriekerAt(level, 0, G, 0).warningLevel === 1);
  const rings = particles.filter((q) => q.kind === 'shriek' && q.t === level.gameTime);
  check('shrieker: ten rings rise from it a quarter second apart, and it shrieks', rings.length === 10 && rings.map((q) => q.delay).join() === '0,5,10,15,20,25,30,35,40,45' && sounds.some((s) => s.name === 'block.sculk_shrieker.shriek' && s.t === level.gameTime && s.volume === 2));
  check('shrieker: the shriek is a game event (for wardens), by the player', events.some((e) => e.event === 'shriek' && e.t === level.gameTime && e.entity === p && e.x === 0.5 && e.y === G + 0.5));
  ticks(level, 89);
  check('shrieker: shrieking for 90 ticks', shrieking(level, 0, G, 0) === true && answers(sounds, level.gameTime).length === 0);
  level.tick();
  const a1 = answers(sounds, level.gameTime);
  check('shrieker: then something answers from the dark (entity.warden.nearby_close), loud, within 10 blocks', !shrieking(level, 0, G, 0) && a1.length === 1 && a1[0].name === 'entity.warden.nearby_close' && a1[0].volume === 5 && Math.abs(a1[0].x) <= 10 && Math.abs(a1[0].y - G) <= 10 && Math.abs(a1[0].z) <= 10, JSON.stringify(a1));
  const dark = p.getEffect('darkness');
  check('shrieker: and darkness falls on the player for 13 seconds', dark?.duration === 260 && dark.amplifier === 0);
  // within the 10 seconds the shrieker hears the next but can't warn, so doesn't shriek
  ticks(level, 10);
  const r2 = round();
  check('shrieker: warned in the last 10 seconds, a player isn\'t warned again, and the shrieker stays quiet', !r2.shrieked && tr.warningLevel === 1 && tr.cooldownTicks > 0);
  const want = ['entity.warden.nearby_closer', 'entity.warden.nearby_closest', 'entity.warden.listening_angry'];
  const got = [];
  for (let i = 0; i < 3; i++) {
    while (tr.cooldownTicks > 0) level.tick();
    ticks(level, 45);
    const r = round();
    ticks(level, 90);
    got.push(`${r.shrieked}:${tr.warningLevel}:${answers(sounds, level.gameTime).map((s) => s.name).join('+')}`);
  }
  check('shrieker: warnings 2, 3 and 4 are answered nearer each time, then angrily (no warden to come yet)', got.join() === want.map((w, i) => `true:${i + 2}:${w}`).join(), got.join());
  // the fifth: still at 4, the warden's summoning hook is called (the warden itself: M4), and nothing else answers
  const calls = [];
  m.shriekerHooks.summonWarden = (_lvl, x, y, z) => (calls.push([x, y, z]), true);
  while (tr.cooldownTicks > 0) level.tick();
  ticks(level, 45);
  const r5 = round();
  ticks(level, 90);
  m.shriekerHooks.summonWarden = null;
  check('shrieker: at warning 4 it calls the warden up, from where it is, and nothing answers instead', r5.shrieked && tr.warningLevel === 4 && calls.length === 1 && calls[0].join() === `0,${G},0` && answers(sounds, level.gameTime).length === 0);
  // a zombie's steps set the sensor off, but the shrieker hears only a player behind it (the zombie isn't let loose
  // in the level, or it would go for the player, whose being hurt the sensor hears)
  const z = new m.Zombie(level);
  z.moveTo(7.5, G, 0.5, 0, 0);
  while (tr.cooldownTicks > 0) level.tick();
  ticks(level, 45);
  level.gameEvent('step', 7.5, G, 0.5, { entity: z, state: STONE });
  const zr = untilActive(level, 4, G, 0);
  ticks(level, 6);
  check('shrieker: a sensor set off by a zombie doesn\'t set it off', zr?.ticks === 3 && !shrieking(level, 0, G, 0));
  // an arrow the player shot does
  ticks(level, 45);
  const arrow = new m.Arrow(level, p);
  arrow.moveTo(7.5, G + 0.1, 0.5, 0, 0);
  level.gameEvent('projectile_land', 7.5, G + 0.1, 0.5, { entity: arrow });
  ticks(level, 7);
  check('shrieker: a sensor set off by the player\'s arrow does (the player shot it)', shrieking(level, 0, G, 0) === true);
}

{
  // a shrieker a player placed can't summon: it shrieks at a player stepping on it, but warns nobody
  const { level, sounds } = scene();
  const p = addPlayer(level, 0.5, G + 0.75, 0.5);
  place(m, level, 'sculk_shrieker', 0, G, 0);
  check('shrieker: placed by a player it can\'t summon', prop(m, level, 0, G, 0, 'can_summon') === false);
  let t = -1;
  for (let i = 0; i < 10 && t < 0; i++) {
    level.tick();
    if (shrieking(level, 0, G, 0)) t = level.gameTime;
  }
  check('shrieker: a player stepping on it sets it off there and then, sneaking or not', t > 0);
  ticks(level, 91);
  check('shrieker: one that can\'t summon warns nobody, nothing answers, no darkness', p.wardenSpawnTracker.warningLevel === 0 && sounds.every((s) => !s.name.startsWith('entity.warden.')) && !p.getEffect('darkness'));
}

{
  // peaceful, or doWardenSpawning off: a shrieker that could summon just shrieks
  const { level, sounds } = scene();
  level.setBlock(0, G, 0, shrieker({ can_summon: true }));
  const p = addPlayer(level, 3.5, G, 0.5);
  level.difficulty = 'peaceful';
  m.shriekerAt(level, 0, G, 0).tryShriek(level, p);
  check('shrieker: in peaceful it shrieks without warning', shrieking(level, 0, G, 0) === true && p.wardenSpawnTracker.warningLevel === 0);
  ticks(level, 91);
  level.difficulty = 'normal';
  level.gameRules.doWardenSpawning = false;
  m.shriekerAt(level, 0, G, 0).tryShriek(level, p);
  check('shrieker: with doWardenSpawning off too', shrieking(level, 0, G, 0) === true && p.wardenSpawnTracker.warningLevel === 0);
  ticks(level, 91);
  check('shrieker: and nothing answers', sounds.every((s) => !s.name.startsWith('entity.warden.')) && !p.getEffect('darkness'));
  level.gameRules.doWardenSpawning = true;
  // broken mid-shriek it answers there and then
  m.shriekerAt(level, 0, G, 0).tryShriek(level, p);
  check('shrieker: warning again once it may', shrieking(level, 0, G, 0) === true && p.wardenSpawnTracker.warningLevel === 1);
  ticks(level, 20);
  level.setBlock(0, G, 0, 0);
  check('shrieker: broken mid-shriek it answers at once', answers(sounds, level.gameTime).map((s) => s.name).join() === 'entity.warden.nearby_close' && p.getEffect('darkness')?.duration === 260);
}

{
  // players near one another share their warning level; the one furthest along sets it
  const { level } = scene();
  level.setBlock(0, G, 0, shrieker({ can_summon: true }));
  const a = addPlayer(level, 3.5, G, 0.5);
  const b = addPlayer(level, 0.5, G, 12.5, { local: false });
  const c = addPlayer(level, 0.5, G, 20.5, { local: false });
  const d = addPlayer(level, -30.5, G, 0.5, { local: false, mode: 'creative' });
  b.wardenSpawnTracker.setWarningLevel(2);
  c.wardenSpawnTracker.setWarningLevel(1);
  m.shriekerAt(level, 0, G, 0).tryShriek(level, a);
  check('tracker: the players within 16 blocks take the highest warning level among them, one up', a.wardenSpawnTracker.warningLevel === 3 && b.wardenSpawnTracker.warningLevel === 3 && a.wardenSpawnTracker.cooldownTicks === 200 && b.wardenSpawnTracker.cooldownTicks === 200);
  check('tracker: one further off keeps their own', c.wardenSpawnTracker.warningLevel === 1 && c.wardenSpawnTracker.cooldownTicks === 0);
  ticks(level, 90);
  check('darkness: on the survival players within 40 blocks, not a creative one', !!a.getEffect('darkness') && !!b.getEffect('darkness') && !!c.getEffect('darkness') && !d.getEffect('darkness'));
  // one of them still cooling down: nobody is warned
  a.wardenSpawnTracker.cooldownTicks = 0;
  ticks(level, 5);
  m.shriekerAt(level, 0, G, 0).tryShriek(level, a);
  check('tracker: a player near who was warned lately stops the warning (and the shriek)', a.wardenSpawnTracker.warningLevel === 3 && !shrieking(level, 0, G, 0));
}

{
  // the tracker on its own: vanilla WardenSpawnTracker
  const t = new m.WardenSpawnTracker();
  t.increaseWarningLevel();
  const cool = t.cooldownTicks;
  t.increaseWarningLevel();
  check('tracker: raised to 1, with 200 ticks before it can go up again', t.warningLevel === 1 && cool === 200);
  for (let i = 0; i < 200; i++) t.tick();
  t.increaseWarningLevel();
  check('tracker: after 200 ticks it can', t.warningLevel === 2);
  for (let i = 0; i < 12000; i++) t.tick();
  const before = t.warningLevel;
  t.tick();
  check('tracker: it falls by one after ten minutes without a warning', before === 2 && t.warningLevel === 1);
  for (let i = 0; i < 12001; i++) t.tick();
  for (let i = 0; i < 12001; i++) t.tick();
  check('tracker: and on to 0, no lower', t.warningLevel === 0);
  for (let i = 0; i < 6; i++) {
    t.cooldownTicks = 0;
    t.increaseWarningLevel();
  }
  check('tracker: 4 at most', t.warningLevel === 4);
  const u = new m.WardenSpawnTracker();
  u.load(JSON.parse(JSON.stringify(t.save())));
  check('tracker: saved and loaded (ticks since the last warning, the level, the cooldown)', u.warningLevel === 4 && u.cooldownTicks === t.cooldownTicks && u.ticksSinceLastWarning === t.ticksSinceLastWarning && Object.keys(t.save()).sort().join() === 'cooldown_ticks,ticks_since_last_warning,warning_level');
  u.load({ warning_level: 9, cooldown_ticks: -5 });
  check('tracker: a saved level out of range is clamped', u.warningLevel === 4 && u.cooldownTicks === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// The catalyst: a death near it

/** the sculk and veins within `r` blocks of (x, y, z) */
function sculkAround(level, x, y, z, r) {
  let sculk = 0, veins = 0;
  for (let i = -r; i <= r; i++)
    for (let j = -r; j <= r; j++)
      for (let k = -r; k <= r; k++) {
        const n = blockName(m, level.getState(x + i, y + j, z + k));
        if (n === 'sculk') sculk++;
        else if (n === 'sculk_vein') veins++;
      }
  return { sculk, veins };
}

{
  const { level, sounds, particles, events, triggers } = scene();
  place(m, level, 'sculk_catalyst', 0, G, 0);
  const cat = level.world.getBlockEntity(0, G, 0);
  const p = addPlayer(level, 6.5, G, 6.5);
  const z = new m.Zombie(level);
  z.moveTo(4.5, G, 0.5, 0, 0);
  level.addEntity(z);
  level.tick();
  const t = level.gameTime;
  z.hurt(1000, 'player', p);
  check('catalyst: a zombie killed 4 blocks off dies (entity_die, by the zombie)', z.dead && events.some((e) => e.event === 'entity_die' && e.entity === z && e.t === t));
  check('catalyst: it takes the zombie\'s experience: charge 5 set off from where it fell', cat.spreader.cursors.length === 1 && cat.spreader.cursors[0].charge === 5 && cat.spreader.cursors[0].x === 4 && cat.spreader.cursors[0].y === G && cat.spreader.cursors[0].z === 0, JSON.stringify(cat.spreader.cursors));
  check('catalyst: so the zombie drops no experience', z.skipDropExperience && !level.entities.some((e) => e.type === 'experience_orb'));
  check('catalyst: it blooms, a sigh and two souls rising from it', prop(m, level, 0, G, 0, 'bloom') === true && sounds.some((s) => s.name === 'block.sculk_catalyst.bloom' && s.t === t) && particles.filter((q) => q.kind === 'sculk_soul' && q.t === t && Math.abs(q.y - (G + 1.15)) < 1e-9).length === 2);
  check('catalyst: the player who killed it earns It Spreads', triggers.includes('kill_mob_near_sculk_catalyst'));
  ticks(level, 7);
  const b7 = prop(m, level, 0, G, 0, 'bloom');
  level.tick();
  check('catalyst: the bloom lasts 8 ticks', b7 === true && prop(m, level, 0, G, 0, 'bloom') === false);
  ticks(level, 200);
  const s = sculkAround(level, 4, G - 1, 0, 3);
  check('catalyst: the charge spreads sculk through the stone where the zombie fell', s.sculk >= 2, JSON.stringify(s));
  check('catalyst: the charge glows over the sculk as it goes', particles.some((q) => q.kind === 'sculk_charge') && sounds.some((q) => q.name === 'block.sculk.charge'));
  check('catalyst: and is used up', cat.spreader.cursors.length === 0, JSON.stringify(cat.spreader.cursors));
}

{
  const { level } = scene();
  place(m, level, 'sculk_catalyst', 0, G, 0);
  place(m, level, 'sculk_catalyst', 7, G, 0);
  const near = level.world.getBlockEntity(0, G, 0), far = level.world.getBlockEntity(7, G, 0);
  const z = new m.Zombie(level);
  z.moveTo(2.5, G, 0.5, 0, 0);
  level.addEntity(z);
  level.tick();
  z.hurt(1000, 'generic');
  check('catalyst: of two catalysts the nearer takes it, the other gets nothing', near.spreader.cursors.length === 1 && far.spreader.cursors.length === 0 && prop(m, level, 0, G, 0, 'bloom') && !prop(m, level, 7, G, 0, 'bloom'));
  // saving the charges on their way
  const again = m.loadBlockEntity(JSON.parse(JSON.stringify(near.save())));
  check('catalyst: its charges are saved and loaded', JSON.stringify(again.spreader.cursors) === JSON.stringify(near.spreader.cursors) && again.spreader.cursors.length === 1);
  // a baby's death: no experience, but it blooms all the same
  ticks(level, 300);
  const baby = new m.Zombie(level);
  baby.setBaby(true);
  baby.moveTo(-2.5, G, 0.5, 0, 0);
  level.addEntity(baby);
  level.tick();
  baby.hurt(1000, 'generic');
  check('catalyst: a baby zombie dying gives no charge, but it blooms', near.spreader.cursors.length === 0 && prop(m, level, 0, G, 0, 'bloom') === true);
  // 9 blocks off: too far
  ticks(level, 10);
  const z2 = new m.Zombie(level);
  z2.moveTo(-8.5, G, 0.5, 0, 0);
  level.addEntity(z2);
  level.tick();
  const p = addPlayer(level, -8.5, G, 3.5);
  z2.hurt(1000, 'player', p);
  check('catalyst: a death 9 blocks off is too far: its experience drops', near.spreader.cursors.length === 0 && !prop(m, level, 0, G, 0, 'bloom') && level.entities.some((e) => e.type === 'experience_orb'));
}

{
  // a player dying near it: 7 a level, up to 100 (none with keepInventory)
  const { level } = scene();
  place(m, level, 'sculk_catalyst', 0, G, 0);
  const cat = level.world.getBlockEntity(0, G, 0);
  const p = addPlayer(level, 3.5, G, 0.5);
  p.xpLevel = 3;
  level.tick();
  p.hurt(1000, 'generic');
  check('catalyst: a player level 3 dying near it: charge 21', cat.spreader.cursors.length === 1 && cat.spreader.cursors[0].charge === 21, JSON.stringify(cat.spreader.cursors));
}

// ---------------------------------------------------------------------------------------------------------------
// Swift Sneak: faster sneaking, by 0.15 of walking a level

{
  const walk = (level, legs, sneak) => {
    const p = addPlayer(level, 0.5, G, 0.5, { yaw: 90 });
    if (legs) p.inventory.armor[1] = legs;
    level.tick();
    p.input.sneak = sneak;
    p.input.forward = true;
    ticks(level, 40);
    p.input.forward = false;
    return 0.5 - p.x;
  };
  const leggings = (lvl) => new m.ItemStack(m.ITEMS.get('diamond_leggings'), 1, 0, lvl ? { enchantments: { swift_sneak: lvl } } : null);
  const plain = walk(scene().level, leggings(0), true);
  const got = [1, 2, 3].map((lvl) => walk(scene().level, leggings(lvl), true) / plain);
  check('swift sneak: sneaking with it goes 0.45, 0.6, 0.75 of walking for levels I, II, III (0.3 without)', got.every((r, i) => Math.abs(r - (0.3 + 0.15 * (i + 1)) / 0.3) < 0.01), got.map((r) => r.toFixed(3)).join(' '));
  const w0 = walk(scene().level, leggings(0), false), w3 = walk(scene().level, leggings(3), false);
  check('swift sneak: walking it makes no difference', Math.abs(w3 - w0) < 1e-9 && w0 > plain * 3);
}

// ---------------------------------------------------------------------------------------------------------------
// The game events the world makes (a few of each kind)

/** look from the player's eyes at (tx, ty, tz) and right-click with `s` */
function useAt(inter, p, s, tx, ty, tz) {
  p.inventory.main[0] = s;
  p.inventory.selected = 0;
  const ey = p.y + p.eyeHeight, dx = tx - p.x, dy = ty - ey, dz = tz - p.z;
  p.yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
  p.pitch = (Math.atan2(-dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  inter.pick(p.x, ey, p.z, p.yaw, p.pitch);
  inter.rightClickDelay = 0;
  inter.use(true, true);
}

{
  const { level, events } = scene();
  const p = addPlayer(level, 0.5, G, 3.5);
  const inter = new m.Interaction(level, p);
  level.tick();
  const since = () => {
    const out = events.slice(since.n);
    since.n = events.length;
    return out;
  };
  since.n = events.length;
  useAt(inter, p, stackOf(m, 'cobblestone', 4), 0.5, G, 0.5);
  const placed = since().find((e) => e.event === 'block_place');
  check('events: a block placed: block_place by the player, at the block, with what was placed', placed?.entity === p && placed.x === 0.5 && placed.y === G + 0.5 && placed.z === 0.5 && blockName(m, placed.state) === 'cobblestone');
  level.setBlock(0, G, 0, 0);
  useAt(inter, p, stackOf(m, 'flint_and_steel'), 0.5, G, 0.5);
  const fire = since().find((e) => e.event === 'block_place');
  check('events: fire lit with flint and steel: block_place at the block clicked (a vanilla quirk), not the fire', blockName(m, level.getState(0, G, 0)) === 'fire' && fire?.entity === p && fire.y === G - 0.5);
  level.setBlock(0, G, 0, 0);
  // a sheep sheared: shear, then the interaction itself
  const sheep = new m.Sheep(level);
  sheep.moveTo(0.5, G, 0.5, 0, 0);
  level.addEntity(sheep);
  level.tick();
  since();
  useAt(inter, p, stackOf(m, 'shears'), 0.5, G + 0.7, 0.5);
  const sh = since();
  check('events: a sheep sheared: shear by the player, then entity_interact by the player at the sheep', sheep.sheared && sh.map((e) => e.event).filter((e) => e === 'shear' || e === 'entity_interact').join() === 'shear,entity_interact' && sh.every((e) => e.event !== 'entity_interact' || (e.entity === p && e.x === sheep.x && e.z === sheep.z)), sh.map((e) => e.event).join());
  // mobs: hurt, equipped, dying
  const z = new m.Zombie(level);
  z.moveTo(-3.5, G, 0.5, 0, 0);
  level.addEntity(z);
  level.tick();
  since();
  z.hurt(2, 'player', p);
  check('events: a zombie hurt: entity_damage, by the zombie', since().some((e) => e.event === 'entity_damage' && e.entity === z));
  z.setItemSlot('head', stackOf(m, 'iron_helmet'));
  z.setItemSlot('head', stackOf(m, 'iron_helmet'));
  z.setItemSlot('head', null);
  z.setItemSlot('mainhand', stackOf(m, 'stick'));
  check('events: a helmet put on a zombie: equip; the same again: nothing; taken off: unequip; a stick in hand: unequip', since().filter((e) => e.entity === z).map((e) => e.event).join() === 'equip,unequip,unequip');
  const fresh = new m.Zombie(level);
  fresh.moveTo(-5.5, G, 0.5, 0, 0);
  fresh.setItemSlot('head', stackOf(m, 'iron_helmet'));
  check('events: nothing on a mob\'s first tick (spawning with its gear)', !since().some((e) => e.entity === fresh));
  // a player's armour: only armour slots, and never a spectator
  m.equipEvent(p, null, stackOf(m, 'diamond_chestplate'));
  p.gameMode = 'spectator';
  m.equipEvent(p, null, stackOf(m, 'diamond_boots'));
  p.gameMode = 'survival';
  check('events: a player putting armour on: equip; a spectator: nothing', since().filter((e) => e.entity === p).map((e) => e.event).join() === 'equip');
  // TNT: primed, then the explosion
  const tnt = m.PrimedTnt.prime(level, 10, G, 10, p);
  const pr = since().find((e) => e.event === 'prime_fuse');
  check('events: TNT lit: prime_fuse at the block, by who lit it', pr?.entity === p && pr.x === 10.5 && pr.z === 10.5);
  ticks(level, 81);
  const ex = since().find((e) => e.event === 'explode');
  check('events: TNT going off: explode, by the TNT', ex?.entity === tnt && tnt.removed);
  // an arrow shot, then landing
  const arrow = new m.Arrow(level, p);
  arrow.moveTo(0.5, G + 3, -6.5, 0, 0);
  arrow.shoot(0, -1, 0.3, 1, 0);
  level.addEntity(arrow);
  let landed = null;
  for (let i = 0; i < 40 && !landed; i++) {
    level.tick();
    landed = events.find((e) => e.event === 'projectile_land' && e.entity === arrow) ?? null;
  }
  const shot = events.find((e) => e.event === 'projectile_shoot' && e.entity === p);
  check('events: an arrow flying: projectile_shoot by the one who shot it, once', !!shot && events.filter((e) => e.event === 'projectile_shoot' && e.entity === p).length === 1);
  check('events: an arrow landing: projectile_land at the middle of the block it stuck in, with that block', !!landed && landed.x % 1 === 0.5 && landed.y === G - 0.5 && landed.z % 1 === -0.5 && blockName(m, landed.state) === 'stone', JSON.stringify(landed && { x: landed.x, y: landed.y, z: landed.z }));
}

// ---------------------------------------------------------------------------------------------------------------
// Main's creatures and things make theirs too: turtle eggs, foxes, rabbits, goat horns, firework rockets

/** the goal of `mob` that is a `name` */
const goalOf = (mob, name) => mob.goalSelector.goals.find((w) => w.goal.constructor.name === name)?.goal ?? null;

{
  const { level, events } = scene();
  let n = events.length;
  const since = () => events.slice(n, (n = events.length));
  // turtle eggs on sand: one of a clutch broken, cracking, hatching
  level.setBlock(3, G - 1, 0, m.S('sand'));
  const EGG = m.getBlock('turtle_egg');
  let st = EGG.state({ eggs: 3 });
  level.setBlock(3, G, 0, st);
  since();
  m.decreaseEggs(level, 3, G, 0, st);
  let ev = since();
  check('turtle eggs: one of a clutch broken: block_destroy of the clutch as it was, by no one', ev.some((e) => e.event === 'block_destroy' && e.entity === null && e.state === st && e.x === 3.5 && e.y === G + 0.5) && prop(m, level, 3, G, 0, 'eggs') === 2);
  level.dayTime = 21600;
  st = level.getState(3, G, 0);
  m.behaviorOf(st).randomTick(level, 3, G, 0, st);
  ev = since();
  check('turtle eggs: cracking, in the hour before dawn: block_change, of the eggs as they were', ev.some((e) => e.event === 'block_change' && e.state === st) && prop(m, level, 3, G, 0, 'hatch') === 1);
  level.setBlock(3, G, 0, EGG.state({ eggs: 2, hatch: 2 }));
  st = level.getState(3, G, 0);
  since();
  m.behaviorOf(st).randomTick(level, 3, G, 0, st);
  ev = since();
  check('turtle eggs: hatching: block_destroy of the eggs, and the babies come out', ev.some((e) => e.event === 'block_destroy' && e.state === st) && level.getState(3, G, 0) === 0 && level.entities.filter((e) => e.type === 'turtle').length === 2);
  // a fox eating a chorus fruit: eat, then teleport from where it was
  const fox = new m.Fox(level);
  fox.moveTo(-4.5, G, 0.5, 0, 0);
  level.addEntity(fox);
  level.tick();
  since();
  fox.eatHeld(stackOf(m, 'chorus_fruit'));
  ev = since().filter((e) => e.entity === fox);
  check('foxes: eating a chorus fruit: eat, then teleport where it stood', ev.map((e) => e.event).join() === 'eat,teleport' && ev[1].x === -4.5 && ev[1].z === 0.5, ev.map((e) => e.event).join());
  // picking berries off a bush and a cave vine
  level.gameRules.mobGriefing = true;
  const berries = goalOf(fox, 'FoxEatBerriesGoal');
  level.setBlock(6, G, 6, m.getBlock('sweet_berry_bush').state({ age: 3 }));
  Object.assign(berries, { bx: 6, by: G, bz: 6 });
  fox.setItemSlot('mainhand', null);
  since();
  berries.onReachedTarget();
  ev = since();
  check('foxes: picking a sweet berry bush: block_change by the fox (and its mouth full: unequip)', prop(m, level, 6, G, 6, 'age') === 1 && ev.some((e) => e.event === 'block_change' && e.entity === fox && e.x === 6.5) && ev.some((e) => e.event === 'unequip' && e.entity === fox));
  level.setBlock(6, G + 3, 6, m.S('stone'));
  level.setBlock(6, G + 2, 6, m.getBlock('cave_vines').state({ berries: true }));
  Object.assign(berries, { bx: 6, by: G + 2, bz: 6 });
  berries.onReachedTarget();
  ev = since();
  check('foxes: picking glow berries off a cave vine: block_change by the fox, with the vine now bare', ev.some((e) => e.event === 'block_change' && e.entity === fox && e.state === level.getState(6, G + 2, 6)) && prop(m, level, 6, G + 2, 6, 'berries') === false);
  // a rabbit nibbling a carrot back a stage (the last bite takes it without a sound a sensor hears, as in vanilla)
  const rabbit = new m.Rabbit(level);
  level.setBlock(-6, G - 1, -6, m.S('farmland'));
  level.setBlock(-6, G, -6, m.getBlock('carrots').state({ age: 1 }));
  level.addEntity(rabbit);
  level.tick();
  rabbit.moveTo(-5.5, G - 0.0625, -5.5, 0, 0);
  const raid = goalOf(rabbit, 'RaidGardenGoal');
  Object.assign(raid, { bx: -6, by: G - 1, bz: -6, canRaid: true });
  since();
  raid.tick();
  ev = since();
  check('rabbits: a bite of a carrot: block_change by the rabbit', prop(m, level, -6, G, -6, 'age') === 0 && ev.some((e) => e.event === 'block_change' && e.entity === rabbit));
  Object.assign(raid, { canRaid: true });
  raid.tick();
  ev = since();
  check('rabbits: the last bite: the carrot gone, no game event (vanilla\'s destroyBlock finds air)', level.getState(-6, G, -6) === 0 && !ev.some((e) => e.event.startsWith('block_')));
}

{
  // a frog laying its spawn on the water beside it: block_place by the frog
  const { level, events } = scene();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) level.setBlock(x, G - 1, z, m.S('grass_block'));
  level.setBlock(1, G - 1, 0, m.S('water'));
  const f = new m.Frog(level);
  f.moveTo(0.5, G, 0.5, 0, 0);
  level.addEntity(f);
  level.tick();
  f.isPregnant = true;
  f.walkTarget = { t: { pos: [0, G, 2] }, speed: 1, closeEnough: 0 };
  let laid = null;
  for (let i = 0; i < 40 && !laid; i++) {
    level.tick();
    laid = events.find((e) => e.event === 'block_place' && e.entity === f) ?? null;
  }
  check('frogs: laying spawn on the water: block_place by the frog, of the frogspawn, where it went', !!laid && laid.x === 1.5 && laid.y === G + 0.5 && laid.z === 0.5 && blockName(m, laid.state) === 'frogspawn' && blockName(m, level.getState(1, G, 0)) === 'frogspawn');
}

{
  const { level, events } = scene();
  let n = events.length;
  const since = () => events.slice(n, (n = events.length));
  const p = addPlayer(level, 0.5, G, 0.5);
  const inter = new m.Interaction(level, p);
  level.tick();
  // a goat horn blown: instrument_play (and the item being used)
  p.inventory.main[0] = m.goatHornStack(m.GOAT_HORN_INSTRUMENTS[0]);
  p.inventory.selected = 0;
  p.pitch = -90;
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.rightClickDelay = 0;
  since();
  inter.use(true, true);
  const ev = since().filter((e) => e.entity === p).map((e) => e.event);
  check('goat horn: blowing one: item_interact_start and instrument_play, by the player', ev.includes('instrument_play') && ev.includes('item_interact_start'), ev.join());
  p.stopUsingItem?.();
  // a firework rocket: shot by who set it off, then bursting (a plain one, no stars: its puffs)
  const rocket = new m.FireworkRocket(level, 4.5, G, 4.5, stackOf(m, 'firework_rocket'), p);
  level.addEntity(rocket);
  since();
  level.tick();
  let shot = since().filter((e) => e.entity === p && e.event === 'projectile_shoot');
  check('fireworks: a rocket going up: projectile_shoot by the player who set it off, where it started', shot.length === 1 && shot[0].x === 4.5 && shot[0].y === G && shot[0].z === 4.5);
  let boom = null;
  for (let i = 0; i < 80 && !boom; i++) {
    level.tick();
    boom = events.find((e) => e.event === 'explode' && e.entity === p) ?? null;
  }
  check('fireworks: it bursts: explode, by the player, where it is', !!boom && rocket.removed && Math.abs(boom.y - rocket.y) < 1e-9 && events.filter((e) => e.event === 'projectile_shoot' && e.entity === p).length === 1);
  // one under a ceiling lands on it
  level.setBlock(-4, G + 3, -4, m.S('stone'));
  const low = new m.FireworkRocket(level, -3.5, G, -3.5, stackOf(m, 'firework_rocket'), p);
  level.addEntity(low);
  let landed = null;
  for (let i = 0; i < 40 && !landed; i++) {
    level.tick();
    landed = events.find((e) => e.event === 'projectile_land' && e.entity === low) ?? null;
  }
  check('fireworks: a rocket hitting the ceiling: projectile_land at the block, with the block', !!landed && landed.x === -3.5 && landed.y === G + 3.5 && landed.z === -3.5 && blockName(m, landed.state) === 'stone', JSON.stringify(landed && [landed.x, landed.y, landed.z]));
}

await exitWithStatus(close);
