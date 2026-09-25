// Flying through water and lava (vanilla Player.isAffectedByFluids / isPushedByFluid: !abilities.flying): a flying
// player, creative or spectator, moves through them just as through air — forwards, up (jump) and down (sneak) — and
// currents don't carry them; their eyes are still in the water (the underwater view and mining stay as they were). A
// player who isn't flying swims exactly as before. "before" is the game with the old inherited behaviour put back.

import { load, check, exitWithStatus, flatLevel, addPlayer } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/world/fluids.ts']);

// three boxes side by side, walled in stone, 12 wide, 40 long, from y 64 to 110: air, still water, still lava
const { world, level } = flatLevel(m, -1, -1, 6, 3, 64, 'stone', 'fluids');
const REGIONS = { air: 0, water: 32, lava: 64 };
for (const [kind, x0] of Object.entries(REGIONS)) {
  for (let x = x0 - 1; x <= x0 + 13; x++)
    for (let z = -1; z <= 41; z++)
      for (let y = 64; y <= 110; y++) {
        const wall = x === x0 - 1 || x === x0 + 13 || z === -1 || z === 41;
        world.setState(x, y, z, wall ? m.S('stone') : kind === 'air' ? 0 : m.S(kind));
      }
}
// a current: flowing water (a level-3 flow on a floor in a box of its own) for the push test
for (let x = 100; x <= 110; x++) for (let z = -1; z <= 13; z++) world.setState(x, 64, z, m.S('stone'));

let p = null, old = false;
function useOld(o) {
  // (the old game: Player didn't have them, so LivingEntity's and Entity's applied: always true)
  old = o;
}
/** a fresh player (nothing carried over from the last run), as the old game or the new */
function fresh(mode) {
  p?.remove();
  p = addPlayer(m, level, 0, 100, 0);
  if (old) p.isAffectedByFluids = p.isPushedByFluid = () => true;
  p.setGameMode(mode);
  // (lava and drowning don't end a run early)
  p.invulnerable = true;
  return p;
}

/** start at the box's end, facing along it, moving as `input` says for `n` ticks; the distance covered in the last 20 (horizontal, vertical) */
function run(kind, mode, input, n = 40, flying = true, y = 80) {
  fresh(mode);
  p.flying = flying;
  p.moveTo(REGIONS[kind] + 6.5, y, 36.5, 180, 0);
  p.input = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false, ...input };
  const track = [];
  for (let i = 0; i < n; i++) {
    level.tick();
    track.push([p.x, p.y, p.z]);
  }
  const a = track[n - 21], b = track[n - 1];
  return { h: Math.hypot(b[0] - a[0], b[2] - a[2]), v: b[1] - a[1], track, eye: p.eyeFluid, inWater: p.inWater, inLava: p.inLava };
}

const fmt = (v) => v.toFixed(3).padStart(7);
console.log('     (blocks covered in 20 ticks, steady)       forward (h)       jump (up)        sneak (down)');
for (const mode of ['creative', 'spectator']) {
  for (const old of [true, false]) {
    useOld(old);
    const res = {};
    for (const kind of ['air', 'water', 'lava']) {
      const f = run(kind, mode, { forward: true }, 30);
      const u = run(kind, mode, { jump: true }, 30, true, 70);
      const d = run(kind, mode, { sneak: true }, 30, true, 100);
      res[kind] = { f, u, d };
      console.log(`     ${old ? 'before' : 'after '} ${mode.padEnd(9)} ${kind.padEnd(6)}           ${fmt(f.h)}          ${fmt(u.v)}          ${fmt(d.v)}`);
    }
    if (!old) {
      for (const kind of ['water', 'lava']) {
        const same = (a, b) => Math.abs(a - b) < 1e-9;
        check(`${mode}, flying through ${kind}: forwards as fast as through air`, same(res[kind].f.h, res.air.f.h), `${res[kind].f.h} vs ${res.air.f.h}`);
        check(`${mode}, flying through ${kind}: up (jump) as fast as through air`, same(res[kind].u.v, res.air.u.v), `${res[kind].u.v} vs ${res.air.u.v}`);
        check(`${mode}, flying through ${kind}: down (sneak) as fast as through air`, same(res[kind].d.v, res.air.d.v), `${res[kind].d.v} vs ${res.air.d.v}`);
      }
      check(`${mode}, flying in water: still in it, eyes and all (the underwater view, the slower mining)`, res.water.f.inWater && res.water.f.eye === m.FLUID_WATER);
    } else if (mode === 'creative') {
      check('before: flying through water was slower than through air (the bug)', res.water.f.h < res.air.f.h * 0.5, `${res.water.f.h} vs ${res.air.f.h}`);
    }
  }
}

// a current carries a swimmer, not a flier
{
  const flow = () => {
    for (let x = 101; x <= 109; x++) for (let z = 0; z <= 12; z++) world.setState(x, 65, z, m.S('water', { level: x - 101 < 7 ? x - 101 + 1 : 7 }));
  };
  flow();
  useOld(false);
  const drift = (flying) => {
    fresh(flying ? 'creative' : 'survival');
    p.flying = flying;
    p.moveTo(103.5, 65.05, 6.5, 0, 0);
    p.dx = p.dy = p.dz = 0;
    p.input = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
    const x0 = p.x;
    for (let i = 0; i < 10; i++) level.tick();
    return p.x - x0;
  };
  const swim = drift(false), fly = drift(true);
  check(`a current: carries a swimmer (${swim.toFixed(3)}), not a flier (${fly.toFixed(3)})`, Math.abs(swim) > 0.05 && Math.abs(fly) < 1e-9);
}

// not flying: exactly as before, swimming about, jumping and sinking in water and lava
{
  let same = true, detail = '';
  for (const kind of ['water', 'lava']) {
    for (const input of [{ forward: true }, { jump: true }, { forward: true, jump: true }, { left: true, sneak: true }, {}]) {
      const tracks = [true, false].map((old) => {
        useOld(old);
        return run(kind, 'survival', input, 60, false, 90).track;
      });
      const d = Math.max(...tracks[0].map((a, i) => Math.max(...a.map((v, j) => Math.abs(v - tracks[1][i][j])))));
      if (d !== 0) {
        same = false;
        detail += `${kind} ${JSON.stringify(input)} off by ${d}; `;
      }
    }
  }
  check('not flying: swimming in water and lava moves exactly as before', same, detail);
}

await exitWithStatus(close);
