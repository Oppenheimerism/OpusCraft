// M4e: what M4's creatures and things look and sound like. The breeze's textures (its head, its glowing eyes, its
// wind tiling seamlessly along its width) and the wind charge's; the bogged's bones and mushroom sprites (each card's
// back the mirror of its front) and its moss; the spawn eggs; the models (the breeze's head, rods and three tiers of
// wind, the wind charge's, the bogged's six mushrooms and its moss a fifth of a pixel out); every sound the breeze,
// the wind charges, the bogged and the mace play, rendered clean; the dust pillar particle; the renderer's hooks.

import fs from 'node:fs';
import { load, check, flatLevel, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/textures/mobs.ts', '/src/textures/breeze.ts', '/src/textures/bogged.ts', '/src/textures/items.ts', '/src/audio/synth.ts',
  '/src/render/particles.ts', '/src/render/mesher.ts', '/src/render/breezeRenderer.ts', '/src/render/boggedModel.ts', '/src/game/spawner.ts',
]);

const px = (t, x, y) => {
  const i = (y * t.w + x) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2], t.data[i + 3]];
};
const drawnIn = (t, x0, y0, w, h) => {
  let n = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (px(t, x, y)[3]) n++;
  return n;
};
const drawn = (t) => drawnIn(t, 0, 0, t.w, t.h);
const tex = (n) => m.MOB_TEXTURES[n]?.();

// ---------------------------------------------------------------------------------------------------------------
// Textures

{
  const [breeze, eyes, wind, charge] = ['breeze', 'breeze_eyes', 'breeze_wind', 'wind_charge'].map(tex);
  check('breeze: 32x32 head and rods, 32x32 eyes, 128x128 wind; the wind charge 64x32', breeze?.w === 32 && breeze.h === 32 && eyes?.w === 32 && eyes.h === 32 && wind?.w === 128 && wind.h === 128 && charge?.w === 64 && charge.h === 32);
  check('breeze: the head drawn all over (its eight-pixel cube)', drawnIn(breeze, 8, 0, 16, 8) === 128 && drawnIn(breeze, 0, 8, 32, 8) === 256);
  check('breeze: the eyes layer only its eyes (a few pixels)', drawn(eyes) > 2 && drawn(eyes) < 40, drawn(eyes));
  // the wind tiles along its width: every row's first and last pixels could sit side by side (no hard seam)
  let seam = 0;
  for (let y = 0; y < 128; y++) {
    const a = px(wind, 0, y), b = px(wind, 127, y);
    if (Math.abs(a[3] - b[3]) > 200) seam++;
  }
  check(`breeze: its wind is streaks that wrap round its width (${seam} hard edges at the seam)`, drawn(wind) > 1000 && seam < 16, seam);
  check('wind charge: its bright knot and swirl drawn', drawn(charge) > 200);
}
{
  const t = tex('bogged'), o = tex('bogged_overlay');
  check('bogged: 64x32 bones, 64x32 moss', t?.w === 64 && t.h === 32 && o?.w === 64 && o.h === 32);
  check('bogged: the skull and ribs drawn, the gaps between the ribs clear', drawnIn(t, 8, 0, 16, 8) === 128 && drawnIn(t, 20, 20, 8, 12) < 96);
  // the mushroom cards: red at 50,16, brown at 50,22 and 50,28; each back (u+6) the front's mirror
  let mirrored = true;
  for (const v of [16, 22, 28])
    for (let y = v; y < v + 4; y++) for (let x = 0; x < 6; x++) if (px(t, 50 + x, y).join() !== px(t, 61 - x, y).join()) mirrored = false;
  check('bogged: three mushroom cards, each back the mirror of its front', mirrored && [16, 22, 28].every((v) => drawnIn(t, 50, v, 6, 4) >= 10));
  const red = (x, y) => { const [r, g, b] = px(t, x, y); return r > g * 1.8 && r > b * 1.8; };
  let reds = 0, browns = 0;
  for (let y = 16; y < 18; y++) for (let x = 50; x < 56; x++) if (red(x, y)) reds++;
  for (let y = 22; y < 24; y++) for (let x = 50; x < 56; x++) { const [r, g, b, a] = px(t, x, y); if (a && r > b && g > b && r < 200) browns++; }
  check('bogged: a red cap and a brown cap', reds >= 5 && browns >= 5, `${reds} ${browns}`);
  let green = 0, any = 0;
  for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3]) { any++; if (o.data[i + 1] > o.data[i] && o.data[i + 1] > o.data[i + 2]) green++; }
  check(`bogged: its moss green (${green} of ${any} pixels)`, any > 300 && green / any > 0.9);
  const [bones] = [t];
  let greyGreen = 0, boneN = 0;
  for (let y = 0; y < 8; y++) for (let x = 8; x < 24; x++) { const [r, g, b, a] = px(bones, x, y); if (!a) continue; boneN++; if (g >= r && g >= b) greyGreen++; }
  check("bogged: its bones a damp grey-green (the stray's are blue, the skeleton's plain)", greyGreen / boneN > 0.8);
}
{
  const egg = (id) => m.ITEM_TEXTURES[m.ITEMS.get(id).texture]?.();
  const [b, g] = [egg('breeze_spawn_egg'), egg('bogged_spawn_egg')];
  check('spawn eggs: both drawn, 16x16, different', b?.w === 16 && g?.w === 16 && drawn(b) > 60 && b.data.some((v, i) => v !== g.data[i]));
}

// ---------------------------------------------------------------------------------------------------------------
// Models

{
  const body = m.breezeModel(32, 32);
  const names = [];
  const walk = (p, pre = '') => { for (const [n, c] of p.children) { names.push(pre + n); walk(c, pre + n + '/'); } };
  walk(body.root);
  const want = ['body', 'body/rods', 'body/rods/rod_1', 'body/rods/rod_2', 'body/rods/rod_3', 'body/head', 'body/head/eyes', 'wind_body', 'wind_body/wind_bottom', 'wind_body/wind_bottom/wind_mid', 'wind_body/wind_bottom/wind_mid/wind_top'];
  check(`breeze model: ${names.join(', ')}`, want.every((n) => names.includes(n)), want.filter((n) => !names.includes(n)).join());
  const ch = m.windChargeModel();
  check('wind charge model: its bone, wind and core', !!ch.root.find('bone') && !!ch.root.find('wind') && !!ch.root.find('wind_charge'));
  const bg = m.boggedModel();
  const mush = bg.root.child('head').child('mushrooms');
  check('bogged model: the skeleton with six mushroom cards on its head', [...mush.children.keys()].join() === 'red_mushroom_1,red_mushroom_2,brown_mushroom_1,brown_mushroom_2,brown_mushroom_3,brown_mushroom_4' &&
    [...mush.children.values()].every((c) => c.cubes[0].d === 0 && c.cubes[0].w === 6 && c.cubes[0].h === 4) && bg.texW === 64 && bg.texH === 32);
  const outer = m.boggedOuterModel();
  check('bogged moss: the humanoid mesh a fifth of a pixel out (its hat seven tenths)', outer.root.child('body').cubes[0].inflate === 0.2 && outer.root.child('head').child('hat').cubes[0].inflate === 0.7 && outer.root.child('right_arm').cubes[0].w === 4);
  check('shadows: the breeze half a block', m.BREEZE_SHADOW_RADII.breeze === 0.5);
}

// ---------------------------------------------------------------------------------------------------------------
// Sounds

{
  const played = new Set();
  const files = ['src/entity/breeze.ts', 'src/entity/bogged.ts', 'src/entity/windCharge.ts', 'src/game/windCharges.ts', 'src/game/windBurst.ts', 'src/game/mace.ts'];
  for (const f of files) for (const [, n] of fs.readFileSync(f, 'utf8').matchAll(/'((?:block|item|entity|event)\.[a-z_.]+[a-z])'/g)) played.add(n);
  const missing = [...played].filter((n) => !m.SOUNDS[n]);
  check(`sounds: every one the breeze, the bogged, the wind charges and the mace play is there (${played.size})`, played.size >= 24 && missing.length === 0, missing.join());
  const names = Object.keys(m.SOUNDS).filter((n) => /^(entity\.(breeze|wind_charge|bogged)\.|item\.mace\.)/.test(n));
  const bad = [];
  for (const n of names) {
    const g = m.SOUNDS[n];
    for (let v = 0; v < g.variants; v++) {
      const b = g.generate(v, 44100);
      let peak = 0;
      for (const x of b) peak = Math.max(peak, Math.abs(x));
      if (!(b.length > 441 && b.length < 44100 * 3 && peak > 0.05 && peak <= 1 && b.every(Number.isFinite))) bad.push(`${n}#${v} ${(b.length / 44100).toFixed(2)}s ${peak.toFixed(2)}`);
    }
  }
  check(`sounds: all ${names.length} of them render, clean and under three seconds`, names.length >= 23 && bad.length === 0, bad.join());
  const differ = (n) => { const g = m.SOUNDS[n]; const a = g.generate(0, 22050), b = g.generate(1, 22050); return a.length !== b.length || a.some((x, i) => x !== b[i]); };
  check('sounds: variants differ from each other', ['entity.breeze.shoot', 'entity.bogged.ambient', 'item.mace.smash_ground'].every(differ));
}

// ---------------------------------------------------------------------------------------------------------------
// Particles

{
  const { world } = flatLevel(m, -1, -1, 0, 0);
  m.initMesher(new Proxy({}, { get: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) }));
  const atlas = { sprites: new Proxy({}, { get: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) }) };
  const pe = new m.ParticleEngine(atlas, world, () => 0xffffff);
  const stone = m.S('stone');
  for (let i = 0; i < 400; i++) pe.dustPillar(0.5, 64, 0.5, 0.3, stone, 0, 63, 0);
  pe.dustPillar(0.5, 64, 0.5, 0.3, 0, 0, 63, 0);
  const list = pe.list;
  const lives = list.map((p) => p.lifetime);
  const avgDy = list.reduce((s, p) => s + p.dy, 0) / list.length;
  check('dust pillar: specks of the block, none of air', list.length === 400 && list.every((p) => p.kind === 'terrain'));
  check(`dust pillar: 20 to 39 ticks (${Math.min(...lives)}..${Math.max(...lives)})`, Math.min(...lives) >= 20 && Math.max(...lives) <= 39);
  check(`dust pillar: shot up at about the speed given (${avgDy.toFixed(3)}), barely drifting`, Math.abs(avgDy - 0.3) < 0.08 && list.every((p) => Math.abs(p.dx) < 0.2 && Math.abs(p.dz) < 0.2));
  const before = pe.sprites.length;
  pe.spawn('gust', 0.5, 65, 0.5, 0, 0, 0);
  check('gust: the wind burst\'s particle is made', pe.sprites.length === before + 1 && pe.sprites.at(-1).kind === 'gust');
}

await exitWithStatus(close);
