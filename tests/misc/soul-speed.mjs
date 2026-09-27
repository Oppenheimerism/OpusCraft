// Soul Speed (vanilla enchantment.soul_speed): boots with it make soul sand and soul soil fast ground instead of
// slow. Stepping on to them on the ground the speed starts (0.0405 for I, 0.0105 more a level, added to the base
// speed) and soul sand stops slowing you; it keeps on in the air and stops once you stand on anything else, or fly.
// A step on to another soul block wears the boots 1 in 25 times (not in creative); and every fifth tick, running
// over them, a soul escapes from under your feet (the soul particle), sighing about a third of the time
// (particle.soul_escape, 0.6 loud, pitched 0.6 to 1). A zombie in the boots gets it too.

import { load, check, exitWithStatus, flatLevel, ticks } from '../bastions/lib.mjs';
import { analyze } from '../../scripts/audio-lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/audio/synth.ts', '/src/entity/monsters.ts', '/src/textures/sculkParticles.ts']);

// stone at y 63 (its top at 64), with a lane of soul sand (x 0..6, z 0..30) and one of soul soil (x 20..26) sunk into it
const { world, level, sounds, particles } = flatLevel(m, -1, -1, 2, 2, 64);
for (let x = 0; x <= 6; x++) for (let z = 0; z <= 30; z++) world.setState(x, 63, z, m.S('soul_sand'));
for (let x = 20; x <= 26; x++) for (let z = 0; z <= 30; z++) world.setState(x, 63, z, m.S('soul_soil'));

const NONE = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
let p = null;
function fresh(x, y, z, boots = null, mode = 'survival') {
  p?.remove();
  p = new m.Player(level);
  p.setGameMode(mode);
  p.moveTo(x, y, z, 0, 0);
  level.player = p;
  level.addEntity(p);
  p.input = { ...NONE };
  p.inventory.armor.fill(null);
  if (boots) p.inventory.armor[0] = boots;
  ticks(level, 2);
  return p;
}
const boots = (lvl, id = 'diamond_boots') => {
  const s = m.ItemStack.of(id);
  if (lvl) s.tag = { enchantments: { soul_speed: lvl } };
  return s;
};
/** how far it walks (+z) in `n` ticks */
function walk(n = 40) {
  p.yaw = 0;
  p.input = { ...NONE, forward: true };
  const z0 = p.z;
  ticks(level, n);
  p.input = { ...NONE };
  return p.z - z0;
}

// --- the speed
fresh(40.5, 64, 2.5);
const dStone = walk();
fresh(3.5, 63.875, 2.5);
const dSand = walk();
check('without the boots, soul sand slows a walk to well under stone\'s', dSand < dStone * 0.6, `${dSand.toFixed(2)} vs ${dStone.toFixed(2)}`);

fresh(3.5, 63.875, 2.5, boots(1));
check('with Soul Speed boots on, standing still on it, not yet', p.soulSpeed === 0);
const dSS1 = walk();
check('walking on soul sand with Soul Speed I: 0.0405 on the speed', Math.abs(p.soulSpeed - 0.0405) < 1e-9, String(p.soulSpeed));
check('...and the sand no longer slows it: faster than a walk on stone', dSS1 > dStone * 1.2, `${dSS1.toFixed(2)} vs ${dStone.toFixed(2)}`);
fresh(3.5, 63.875, 2.5, boots(3));
const dSS3 = walk();
check('Soul Speed III: 0.0615, faster again', Math.abs(p.soulSpeed - 0.0615) < 1e-9 && dSS3 > dSS1 * 1.05, `${p.soulSpeed} ${dSS3.toFixed(2)}`);
fresh(23.5, 64, 2.5, boots(2));
walk(20);
check('on soul soil too (Soul Speed II, 0.051)', Math.abs(p.soulSpeed - 0.051) < 1e-9, String(p.soulSpeed));
fresh(40.5, 64, 2.5, boots(3));
walk(20);
check('on stone, the boots do nothing', p.soulSpeed === 0);

// in the air, and off the sand
fresh(3.5, 63.875, 2.5, boots(1));
walk(10);
p.input = { ...NONE, jump: true, forward: true };
let airborne = false, keptInAir = true;
for (let i = 0; i < 12; i++) {
  ticks(level, 1);
  p.input.jump = false;
  if (!p.onGround) {
    airborne = true;
    if (!(p.soulSpeed > 0)) keptInAir = false;
  }
}
check('jumping, the speed keeps on in the air', airborne && keptInAir);
p.input = { ...NONE };
p.moveTo(3.5, 63.875, 26.5, 0, 0);
p.dx = p.dz = 0;
ticks(level, 2);
const zEnd = walk(30);
check('walking off the end of the sand on to stone, it stops', p.z > 31.5 && p.onGround && p.soulSpeed === 0, `${p.z} ${p.soulSpeed} ${zEnd}`);

// flying
fresh(3.5, 63.875, 2.5, boots(3), 'creative');
walk(10);
const wasOn = p.soulSpeed > 0;
p.flying = true;
p.moveTo(3.5, 66, p.z, 0, 0);
p.onGround = false;
walk(10);
check('taking off to fly (creative) over it, it stops', wasOn && p.flying && !p.onGround && p.soulSpeed === 0, `${wasOn} ${p.flying} ${p.soulSpeed}`);

// --- the boots wear
function wearOver(steps, mode = 'survival') {
  fresh(3.5, 63.875, 2.5, boots(1), mode);
  const s = p.inventory.armor[0];
  for (let i = 0; i < steps; i++) {
    p.moveTo(i % 2 ? 3.5 : 4.5, 63.875, 2.5, 0, 0);
    p.dx = p.dz = 0;
    ticks(level, 1);
  }
  return s.damage;
}
const worn = wearOver(3000);
check('a step on to another soul block wears the boots 1 in 25 times (about 120 in 3000)', worn > 85 && worn < 160, String(worn));
check('...not in creative', wearOver(400, 'creative') === 0);
fresh(40.5, 64, 2.5, boots(1));
{
  const s = p.inventory.armor[0];
  for (let i = 0; i < 400; i++) { p.moveTo(i % 2 ? 40.5 : 41.5, 64, 2.5, 0, 0); ticks(level, 1); }
  check('...nor on stone', s.damage === 0);
}

// --- the soul and its sigh
fresh(3.5, 63.875, 2.5, boots(1));
particles.length = 0;
sounds.length = 0;
p.yaw = 0;
p.input = { ...NONE, forward: true };
const souls = [], ys = [];
for (let i = 0; i < 60; i++) {
  ticks(level, 1);
  for (const q of particles.splice(0)) if (q.kind === 'soul') { souls.push({ q, t: p.tickCount, pdz: p.dz }); ys.push(q.y - p.y); }
}
p.input = { ...NONE };
check('running over it, a soul particle every fifth tick', souls.length >= 10 && souls.length <= 12 && souls.every((s) => s.t % 5 === 0), `${souls.length}`);
check('...just over its feet, in its width, rising 0.1 and flung back from its going', souls.every(({ q, pdz }) => q.dy === 0.1 && Math.abs(q.x - p.x) <= 0.3 && q.dz <= 0 && Math.abs(q.dz + 0.2 * pdz) < 0.2 * Math.abs(pdz) + 1e-9) && ys.every((y) => Math.abs(y - 0.1) < 0.2));
ticks(level, 10);
particles.length = 0;
ticks(level, 20);
check('standing still, none', !particles.some((q) => q.kind === 'soul'));
fresh(3.5, 63.875, 2.5);
particles.length = 0;
walk(30);
check('without the boots, none', !particles.some((q) => q.kind === 'soul'));

// the sigh: about 0.3 of the souls (P(0.4a + b > 0.9) = 0.3)
{
  fresh(3.5, 63.875, 2.5, boots(1));
  sounds.length = 0;
  particles.length = 0;
  let n = 0;
  for (let i = 0; i < 1500; i++) {
    p.moveTo(3.5, 63.875, 2.5 + (i % 20), 0, 0);
    p.dz = 0.2;
    ticks(level, 1);
    p.dz = 0.2;
    n += particles.splice(0).filter((q) => q.kind === 'soul').length;
  }
  const sighs = sounds.filter((s) => s.name === 'particle.soul_escape');
  check('about a third of the souls sigh (particle.soul_escape)', n > 250 && sighs.length > n * 0.2 && sighs.length < n * 0.4, `${sighs.length} of ${n}`);
  check('...0.6 loud, pitched 0.6 to 1', sighs.length > 0 && sighs.every((s) => s.volume === 0.6 && s.pitch >= 0.6 && s.pitch < 1));
}

// --- a zombie in the boots
{
  const z = new m.Zombie(level);
  z.moveTo(3.5, 63.875, 10.5, 0, 0);
  level.addEntity(z);
  z.armorItems[0] = boots(2, 'iron_boots');
  const base = z.moveSpeedAttr;
  for (let i = 0; i < 4; i++) { z.moveTo(3.5, 63.875, 10.5 + i, 0, 0); ticks(level, 1); }
  check('a zombie in Soul Speed II boots on soul sand gets it too (0.051 on its speed)', z.soulSpeed === 0.051 || Math.abs(z.moveSpeedAttr - base - 0.051) < 1e-6 || Math.abs(z.soulSpeed - 0.051) < 1e-9, `${z.soulSpeed} ${base} ${z.moveSpeedAttr}`);
  z.remove();
}

// --- the sound
{
  const gen = m.SOUNDS['particle.soul_escape'];
  check('particle.soul_escape has six takes', gen?.variants === 6);
  const SR = 44100;
  const takes = [0, 1, 2, 3, 4, 5].map((v) => gen.generate(v, SR));
  const stats = takes.map((x) => analyze(x, SR));
  check('...each under about a second, sound and not clipped', stats.every((s) => s.dur > 0.6 && s.dur < 1.3 && !s.nan && !s.clip && s.peak > 0.3), stats.map((s) => `${s.dur.toFixed(2)}/${s.peak.toFixed(2)}`).join(' '));
  const rms = (x, t0, t1) => { let e = 0; const a = Math.round(t0 * SR), b = Math.round(t1 * SR); for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / (b - a)); };
  check('...swelling from nothing and dying away', takes.every((x) => { const d = x.length / SR; return rms(x, 0, 0.03) < rms(x, d * 0.25, d * 0.45) * 0.5 && rms(x, d - 0.05, d) < rms(x, d * 0.25, d * 0.45) * 0.3; }));
  check('...and the takes differ', takes[0].length !== takes[1].length || takes[0].some((v, i) => Math.abs(v - takes[1][i]) > 1e-3));
}

// --- the soul's look
{
  const tex = m.sculkParticleTextures();
  const frames = Array.from({ length: 11 }, (_, i) => tex[`soul_${i}`]?.());
  check('the soul particle has its eleven frames, 16 by 16', frames.every((t) => t && t.w === 16 && t.h === 16));
  const lit = (t) => { let n = 0; for (let i = 3; i < t.data.length; i += 4) if (t.data[i]) n++; return n; };
  const counts = frames.map(lit);
  check('...gathering, whole, then thinning away', counts[0] < counts[4] && counts[10] < counts[4] && counts[4] > 60, counts.join(' '));
  const sculk = tex['sculk_soul_4']();
  check('...paler and greyer than the sculk\'s soul', frames[4].data.some((v, i) => v !== sculk.data[i]));
}

await exitWithStatus(close);
