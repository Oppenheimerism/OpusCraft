// M2: the redstone components on a flat stone world with a ticking Level — dust (power, connections, dot and cross,
// steps), torches (inverting after 2 ticks, burning out), repeaters (delay, locking), and the rest as they come.

import { load, check, flatLevel, place, prop, ticks, blockName, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load();
const G = 64; // the floor: stone below, air from y 64

/** a lever on the top of the block below (x, y, z), switched on or off like a player does */
function flip(level, x, y, z) {
  const st = level.getState(x, y, z);
  m.behaviorOf(st).use(level, x, y, z, st, { player: { gameMode: 'survival' }, face: 1, hx: x + 0.5, hy: y, hz: z + 0.5 });
}

// ---------------------------------------------------------------------------------------------------------------
// Redstone dust

{
  const { level, world } = flatLevel(m, -1, -1, 2, 2);
  place(m, level, 'redstone_block', 0, G, 0);
  for (let x = 1; x <= 17; x++) place(m, level, 'redstone_wire', x, G, 0);
  ticks(level, 2);
  const powers = [];
  for (let x = 1; x <= 17; x++) powers.push(prop(m, level, x, G, 0, 'power'));
  check('dust: 15 next to a redstone block, one less a block after', powers.join() === '15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,0', powers.join());
  check('dust: a line connects east-west, not north-south', prop(m, level, 5, G, 0, 'east') === 'side' && prop(m, level, 5, G, 0, 'west') === 'side' && prop(m, level, 5, G, 0, 'north') === 'none');
  check('dust: the end of a line is drawn through', prop(m, level, 17, G, 0, 'east') === 'side' && prop(m, level, 17, G, 0, 'west') === 'side');
  check('dust: next to the redstone block it connects to it', prop(m, level, 1, G, 0, 'west') === 'side');
  // colour: vanilla getColorForPower
  check('dust: its colour follows its power (0x4c0000 at 0, 0xff3300 at 15)', m.redstoneColor(0) === 0x4c0000 && m.redstoneColor(15) === 0xff3300, m.redstoneColor(0).toString(16) + ' ' + m.redstoneColor(15).toString(16));
  // the power goes with the source
  level.setBlock(0, G, 0, 0);
  ticks(level, 1);
  let all0 = true;
  for (let x = 1; x <= 17; x++) if (prop(m, level, x, G, 0, 'power') !== 0) all0 = false;
  check('dust: all of it goes dark when the redstone block goes', all0);
  // a lone piece: a cross, a dot once clicked, a cross again
  place(m, level, 'redstone_wire', 5, G, 8);
  const sides = () => ['north', 'east', 'south', 'west'].map((d) => prop(m, level, 5, G, 8, d)).join();
  const cross0 = sides();
  const st = level.getState(5, G, 8);
  m.behaviorOf(st).use(level, 5, G, 8, st, { player: { gameMode: 'survival' } });
  const dot = sides();
  const st2 = level.getState(5, G, 8);
  m.behaviorOf(st2).use(level, 5, G, 8, st2, { player: { gameMode: 'survival' } });
  check('dust: a lone piece is a cross; right-click makes it a dot and back', cross0 === 'side,side,side,side' && dot === 'none,none,none,none' && sides() === cross0, `${cross0} / ${dot} / ${sides()}`);
  // a dot stays a dot until something connects, then it's a line
  m.behaviorOf(level.getState(5, G, 8)).use(level, 5, G, 8, level.getState(5, G, 8), { player: { gameMode: 'survival' } });
  place(m, level, 'stone', 5, G, 10);
  const stillDot = sides();
  place(m, level, 'redstone_wire', 5, G, 9);
  check('dust: a dot stays a dot by a block, and becomes a line when dust joins it', stillDot === 'none,none,none,none' && sides() === 'side,none,side,none', `${stillDot} / ${sides()}`);
  // adventure mode can't change it
  const st3 = level.getState(5, G, 8);
  check('dust: adventure mode can\'t click it', !m.behaviorOf(st3).use(level, 5, G, 8, st3, { player: { gameMode: 'adventure' } }));
  // it needs a floor
  place(m, level, 'redstone_wire', 9, G, 5);
  level.setBlock(9, G - 1, 5, 0);
  check('dust: without its floor it pops off', blockName(m, level.getState(9, G, 5)) === 'air');
  // no dust on glass? (vanilla: any sturdy top, glass included) — and not on a slab's bottom half
  place(m, level, 'glass', 12, G, 12);
  check('dust: it can go on glass', place(m, level, 'redstone_wire', 12, G + 1, 12) !== null && blockName(m, level.getState(12, G + 1, 12)) === 'redstone_wire');
  place(m, level, 'stone_slab', 13, G, 12);
  check('dust: it can\'t go on a bottom slab', !m.canSurvive(level.world, 13, G + 1, 12, m.S('redstone_wire')));
  void world;
}

{
  // steps: dust climbs the side of a block that has dust on top, and power goes up and down it
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'redstone_block', 0, G, 0);
  place(m, level, 'redstone_wire', 1, G, 0);
  place(m, level, 'stone', 2, G, 0);
  place(m, level, 'redstone_wire', 2, G + 1, 0);
  place(m, level, 'redstone_wire', 3, G, 0);
  ticks(level, 2);
  check('dust: up the side of a block with dust on it', prop(m, level, 1, G, 0, 'east') === 'up' && prop(m, level, 2, G + 1, 0, 'west') === 'side');
  check('dust: and down the far side', prop(m, level, 3, G, 0, 'west') === 'up' && prop(m, level, 2, G + 1, 0, 'east') === 'side');
  const p = [prop(m, level, 1, G, 0, 'power'), prop(m, level, 2, G + 1, 0, 'power'), prop(m, level, 3, G, 0, 'power')];
  check('dust: power climbs the step and comes down it, one less a block', p.join() === '15,14,13', p.join());
  // a solid block over the lower dust cuts the step
  place(m, level, 'stone', 1, G + 1, 0);
  ticks(level, 2);
  check('dust: a block over the lower dust cuts it', prop(m, level, 1, G, 0, 'east') !== 'up' && prop(m, level, 2, G + 1, 0, 'power') === 0, `${prop(m, level, 1, G, 0, 'east')} ${prop(m, level, 2, G + 1, 0, 'power')}`);
}

{
  // what dust powers: the block under it, and a block it points into (strongly), not one beside it
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'redstone_lamp', 1, G, 0);
  place(m, level, 'stone', 2, G, 0);
  place(m, level, 'stone', 2, G, 1);
  place(m, level, 'redstone_block', 0, G + 1, 0);
  place(m, level, 'redstone_wire', 1, G + 1, 0);
  place(m, level, 'redstone_wire', 2, G + 1, 0);
  // a line ending at a lamp, and a lamp beside the line
  place(m, level, 'redstone_lamp', 3, G + 1, 0);
  place(m, level, 'redstone_lamp', 2, G + 1, 1);
  ticks(level, 6);
  check('dust: powers the lamp under it', prop(m, level, 1, G, 0, 'lit') === true);
  check('dust: powers the lamp it points into', prop(m, level, 3, G + 1, 0, 'lit') === true);
  check('dust: not the lamp beside the line', prop(m, level, 2, G + 1, 1, 'lit') === false);
}

// ---------------------------------------------------------------------------------------------------------------
// Redstone torches

{
  const { level, sounds, particles } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'stone', 0, G, 0);
  place(m, level, 'redstone_torch', 0, G + 1, 0);
  check('torch: placed on top of a block it stands, lit', blockName(m, level.getState(0, G + 1, 0)) === 'redstone_torch' && prop(m, level, 0, G + 1, 0, 'lit') === true);
  check('torch: it gives light 7', m.EMISSION[level.getState(0, G + 1, 0)] === 7);
  place(m, level, 'redstone_torch', 1, G, 0, { face: 5 });
  check('torch: placed on the side of a block it hangs on the wall', blockName(m, level.getState(1, G, 0)) === 'redstone_wall_torch' && prop(m, level, 1, G, 0, 'facing') === 'east');
  // a lever on the block: the torch goes out 2 ticks later, and lights 2 ticks after the lever is off
  place(m, level, 'lever', 0, G, -1, { props: { face: 'wall', facing: 'north', powered: false } });
  place(m, level, 'stone', 0, G, 1);
  place(m, level, 'redstone_wire', 0, G + 1, 1);
  ticks(level, 1);
  check('torch: lit, it powers the dust beside it', prop(m, level, 0, G + 1, 1, 'power') === 15);
  flip(level, 0, G, -1);
  ticks(level, 1);
  const a = prop(m, level, 0, G + 1, 0, 'lit');
  ticks(level, 1);
  const b = prop(m, level, 0, G + 1, 0, 'lit');
  check('torch: power in its block puts it out two ticks later', a === true && b === false, `${a} ${b}`);
  check('torch: out, the dust beside goes dark', prop(m, level, 0, G + 1, 1, 'power') === 0);
  flip(level, 0, G, -1);
  ticks(level, 2);
  check('torch: it lights again two ticks after the power goes', prop(m, level, 0, G + 1, 0, 'lit') === true);
  // it strongly powers the block above: a lamp next to that block lights
  place(m, level, 'stone', 0, G + 2, 0);
  place(m, level, 'redstone_lamp', -1, G + 2, 0);
  ticks(level, 2);
  check('torch: strongly powers the block above it', prop(m, level, -1, G + 2, 0, 'lit') === true);
  // burnout: switched on and off faster than 8 times in 60 ticks (after the toggle above has aged out of the count)
  ticks(level, 70);
  let burnt = -1;
  for (let i = 0; i < 12 && burnt < 0; i++) {
    flip(level, 0, G, -1);
    ticks(level, 3);
    flip(level, 0, G, -1);
    ticks(level, 3);
    if (sounds.some((s) => s.name === 'block.redstone_torch.burnout')) burnt = i + 1;
  }
  check('torch: put out 8 times in 60 ticks it burns out, with a fizz and smoke', burnt === 8 && particles.some((p) => p.kind === 'smoke'), `after ${burnt}`);
  // unpowered now, it stays out for a while, then lights again (160 ticks after)
  if (prop(m, level, 0, G, -1, 'powered')) flip(level, 0, G, -1);
  ticks(level, 20);
  const outStill = prop(m, level, 0, G + 1, 0, 'lit') === false;
  ticks(level, 160);
  check('torch: burnt out it stays dark, then lights again', outStill && prop(m, level, 0, G + 1, 0, 'lit') === true);
}

// ---------------------------------------------------------------------------------------------------------------
// Repeaters

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  // west to east: lever-powered dust → repeater (input west) → dust
  place(m, level, 'lever', 0, G, 0, { props: { face: 'floor', facing: 'north', powered: false } });
  place(m, level, 'redstone_wire', 1, G, 0);
  place(m, level, 'repeater', 2, G, 0, { yaw: -90 });
  place(m, level, 'redstone_wire', 3, G, 0);
  check('repeater: placed facing the player (its input toward them)', prop(m, level, 2, G, 0, 'facing') === 'west', prop(m, level, 2, G, 0, 'facing'));
  const out = () => prop(m, level, 3, G, 0, 'power');
  for (const delay of [1, 2, 3, 4]) {
    level.setBlock(2, G, 0, m.blockOf(level.getState(2, G, 0)).with(level.getState(2, G, 0), 'delay', delay));
    ticks(level, 20);
    flip(level, 0, G, 0);
    let t = 0;
    while (out() === 0 && t < 20) {
      level.tick();
      t++;
    }
    check(`repeater: delay ${delay} passes the signal on after ${delay * 2} ticks`, t === delay * 2, `${t}`);
    check(`repeater: delay ${delay} puts out 15`, out() === 15);
    flip(level, 0, G, 0);
    ticks(level, 20);
  }
  // right-click cycles the delay
  const d0 = prop(m, level, 2, G, 0, 'delay');
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const st = level.getState(2, G, 0);
    m.behaviorOf(st).use(level, 2, G, 0, st, { player: { gameMode: 'survival' } });
    seq.push(prop(m, level, 2, G, 0, 'delay'));
  }
  check('repeater: right-click cycles 1-4', d0 === 4 && seq.join() === '1,2,3,4', `${d0}: ${seq.join()}`);
  // a weak input still gives 15 out: dust at power 1 into it
  const { level: l2 } = flatLevel(m, -1, -1, 2, 1);
  place(m, l2, 'redstone_block', -14, G, 0);
  for (let x = -13; x <= 1; x++) place(m, l2, 'redstone_wire', x, G, 0);
  place(m, l2, 'repeater', 2, G, 0, { yaw: -90 });
  place(m, l2, 'redstone_wire', 3, G, 0);
  ticks(l2, 6);
  check('repeater: dust at 1 into it gives 15 out', prop(m, l2, 1, G, 0, 'power') === 1 && prop(m, l2, 3, G, 0, 'power') === 15, `${prop(m, l2, 1, G, 0, 'power')} ${prop(m, l2, 3, G, 0, 'power')}`);
  // it takes nothing from the side
  place(m, l2, 'redstone_block', 2, G, 1);
  const { level: l3 } = flatLevel(m, -1, -1, 1, 1);
  place(m, l3, 'repeater', 2, G, 0, { yaw: -90 });
  place(m, l3, 'redstone_wire', 3, G, 0);
  place(m, l3, 'redstone_block', 2, G, 1);
  ticks(l3, 6);
  check('repeater: power at its side doesn\'t turn it on', prop(m, l3, 2, G, 0, 'powered') === false);
}

{
  // locking: a powered repeater pointing into the side of another holds it as it is
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'lever', 0, G, 0, { props: { face: 'floor', facing: 'north', powered: false } });
  place(m, level, 'redstone_wire', 1, G, 0);
  place(m, level, 'repeater', 2, G, 0, { yaw: -90 }); // B: west → east
  place(m, level, 'redstone_wire', 3, G, 0);
  place(m, level, 'lever', 2, G, 3, { props: { face: 'floor', facing: 'north', powered: false } });
  place(m, level, 'redstone_wire', 2, G, 2);
  place(m, level, 'repeater', 2, G, 1, { yaw: 180 }); // A: its input south, pointing north into B's side
  ticks(level, 4);
  flip(level, 0, G, 0);
  ticks(level, 4);
  check('lock: B passes its input on while unlocked', prop(m, level, 3, G, 0, 'power') === 15);
  flip(level, 2, G, 3);
  ticks(level, 4);
  check('lock: a powered repeater into its side locks it', prop(m, level, 2, G, 0, 'locked') === true);
  flip(level, 0, G, 0);
  ticks(level, 10);
  check('lock: locked, it holds its output though the input went', prop(m, level, 2, G, 0, 'powered') === true && prop(m, level, 3, G, 0, 'power') === 15);
  flip(level, 2, G, 3);
  ticks(level, 10);
  check('lock: unlocked, it follows its input again', prop(m, level, 2, G, 0, 'locked') === false && prop(m, level, 2, G, 0, 'powered') === false);
  // dust into its side doesn't lock it (diodes only)
  place(m, level, 'redstone_block', 2, G, -2);
  place(m, level, 'redstone_wire', 2, G, -1);
  ticks(level, 4);
  check('lock: dust into its side doesn\'t lock it', prop(m, level, 2, G, 0, 'locked') === false);
}

await exitWithStatus(close);
