// M5c: what the crafter looks and sounds like. Its fourteen textures (16x16 and solid; its top and front the
// advancement icon's; its redstone dim until it's powered and lit when it is, its cells, mouth and ports amber while it
// crafts; each west side the east's mirror); every one of its 48 states' models asks for them and no others, turned as
// its orientation says (its mouth to the front, its grid to the top, every face's picture the right way up); its item
// drawn as the block; the screen's sprites (the panel with its grid, arrow and result slot, the barred slot, the
// redstone lit and not); its sounds, rendered clean; and the white smoke it puffs.

import fs from 'node:fs';
import { load, check, flatLevel, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/textures/blocks.ts', '/src/textures/blocklib/iconblocks.ts', '/src/textures/items.ts', '/src/textures/gui.ts', '/src/textures/crafterGui.ts',
  '/src/audio/synth.ts', '/src/render/particles.ts', '/src/render/mesher.ts', '/src/game/crafter.ts',
]);

const px = (t, x, y) => {
  const i = (y * t.w + x) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2], t.data[i + 3]];
};
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const mirrored = (a, b) => {
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (px(a, x, y).join() !== px(b, a.w - 1 - x, y).join()) return false;
  return true;
};
const solid = (t) => t.data.every((v, i) => i % 4 !== 3 || v === 255);
const lum = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114;
const meanLum = (t) => {
  let s = 0, n = 0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (px(t, x, y)[3]) (s += lum(px(t, x, y))), n++;
  return n ? s / n : 0;
};
/** lit redstone: a strong red (the icon's shades 0x8c1209 to 0xff6b52) */
const litRed = ([r, g, b]) => r >= 130 && r > 2.2 * g && r > 2.2 * b;
/** redstone lying dark (unpowered) */
const dimRed = ([r, g, b]) => r >= 45 && r < 110 && r > 2.5 * g && r > 2.5 * b;
/** a bright amber glow */
const amber = ([r, g, b]) => r >= 190 && g >= 0.5 * r && g < r && b < g;
const count = (t, f) => {
  let n = 0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (f(px(t, x, y))) n++;
  return n;
};
/** the pixels that differ between two textures, as [before, after] */
const changed = (a, b) => {
  const out = [];
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (px(a, x, y).join() !== px(b, x, y).join()) out.push([px(a, x, y), px(b, x, y)]);
  return out;
};
const tex = (n) => m.BLOCK_TEXTURES[n]?.();

// ---------------------------------------------------------------------------------------------------------------
// Textures

const NAMES = ['crafter_top', 'crafter_top_triggered', 'crafter_top_crafting', 'crafter_bottom', 'crafter_north', 'crafter_north_crafting', 'crafter_south', 'crafter_south_triggered',
  'crafter_east', 'crafter_east_triggered', 'crafter_east_crafting', 'crafter_west', 'crafter_west_triggered', 'crafter_west_crafting'];
const T = Object.fromEntries(NAMES.map((n) => [n, tex(n)]));
{
  check(`textures: all ${NAMES.length} of the crafter's, 16x16 and solid`, NAMES.every((n) => T[n]?.w === 16 && T[n].h === 16 && solid(T[n])), NAMES.filter((n) => !T[n] || T[n].w !== 16 || !solid(T[n])).join());
  const dup = [];
  for (let i = 0; i < NAMES.length; i++) for (let j = i + 1; j < NAMES.length; j++) if (same(T[NAMES[i]], T[NAMES[j]])) dup.push(`${NAMES[i]}=${NAMES[j]}`);
  check('textures: no two alike', dup.length === 0, dup.join());
  check("textures: its top and front are the advancement icon's (Crafters Crafting Crafters)", same(T.crafter_top, m.crafterTop()) && same(T.crafter_north, m.crafterNorth()));
  check("textures: its side powered is the icon's side", same(T.crafter_east_triggered, m.crafterSide()));
  check('textures: each west side is its east side mirrored', ['', '_triggered', '_crafting'].every((s) => mirrored(T[`crafter_east${s}`], T[`crafter_west${s}`])));
  const idle = ['crafter_top', 'crafter_bottom', 'crafter_north', 'crafter_south', 'crafter_east', 'crafter_west'];
  check('textures: idle, none of its redstone lit; its top, front and bottom with nothing amber', idle.every((n) => count(T[n], litRed) === 0) && ['crafter_top', 'crafter_north', 'crafter_bottom'].every((n) => count(T[n], amber) === 0),
    idle.map((n) => `${n}:${count(T[n], litRed)}/${count(T[n], amber)}`).join(' '));
  check('textures: its sides and back show their redstone dark', ['crafter_east', 'crafter_west', 'crafter_south'].every((n) => count(T[n], dimRed) >= 6), ['crafter_east', 'crafter_south'].map((n) => count(T[n], dimRed)).join(' '));
  // powered: what changes lights up red
  // (the side: its groove either side of the port, 16 pixels, and the port's core, 6)
  const lit = [['crafter_top', 'crafter_top_triggered', 4], ['crafter_south', 'crafter_south_triggered', 6], ['crafter_east', 'crafter_east_triggered', 22], ['crafter_west', 'crafter_west_triggered', 22]];
  for (const [a, b, n] of lit) {
    const d = changed(T[a], T[b]);
    check(`textures: ${b}: its redstone lit (${d.length} pixels, all lit red)`, d.length >= n && d.every(([, after]) => litRed(after)), d.filter(([, after]) => !litRed(after)).slice(0, 3).map(([, x]) => x.join()).join(' '));
  }
  // crafting (only ever while it's powered): what changes from the powered look (the front's from its only one) warms,
  // glowing amber
  const glow = [['crafter_top_triggered', 'crafter_top_crafting', 36], ['crafter_north', 'crafter_north_crafting', 36], ['crafter_east_triggered', 'crafter_east_crafting', 6], ['crafter_west_triggered', 'crafter_west_crafting', 6]];
  for (const [a, b, n] of glow) {
    const d = changed(T[a], T[b]);
    const warmer = d.every(([before, after]) => after[0] - after[2] > before[0] - before[2] || amber(after));
    const bright = d.filter(([, after]) => amber(after)).length;
    check(`textures: ${b}: ${bright} pixels glowing amber, all it changes warmer`, warmer && bright >= n, `${d.length} changed, ${bright} amber`);
  }
  check('textures: crafting, its redstone stays lit (only the port\'s core and the grid\'s cells turn amber)', count(T.crafter_east_crafting, litRed) === count(T.crafter_east_triggered, litRed) - 6 && changed(T.crafter_east_triggered, T.crafter_east_crafting).length === 6 &&
    count(T.crafter_top_crafting, litRed) === 4);
  check('textures: the bottom is dark grey stone with a sunken vent', meanLum(T.crafter_bottom) < 80 && count(T.crafter_bottom, ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 12) === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Models

const DIRS = ['down', 'up', 'north', 'south', 'west', 'east'];
const V = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] };
const neg = (v) => v.map((x) => -x);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dirOf = (v) => DIRS.find((d) => V[d].every((x, i) => Math.abs(x - v[i]) < 1e-6));
/** which way the top edge of a quad's picture points (its v = 0 corners, from the quad's middle) */
function pictureUp(q) {
  const c = [0, 0, 0], t = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 3; k++) c[k] += q.pos[i * 3 + k] / 4;
    if (Math.abs(q.uv[i * 2 + 1]) < 1e-6) {
      for (let k = 0; k < 3; k++) t[k] += q.pos[i * 3 + k];
      n++;
    }
  }
  const d = t.map((x, k) => x / n - c[k]);
  const l = Math.hypot(...d) || 1;
  return dirOf(d.map((x) => Math.round(x / l)));
}

const asked = new Set();
m.initMesher(new Proxy({}, { get: (_, n) => (asked.add(n), { u0: 0, v0: 0, u1: 1, v1: 1 }) }));
const crafter = m.getBlock('crafter');
{
  const bad = [], strays = new Set();
  let states = 0;
  for (let st = crafter.baseState; st < crafter.baseState + crafter.stateCount; st++) {
    states++;
    const view = m.STATE_VIEWS[st];
    const [o, trig, craft] = [view.get('orientation'), view.get('triggered'), view.get('crafting')];
    const [fName, tName] = o.split('_');
    const front = V[fName], top = V[tName], east = cross(front, top);
    asked.clear();
    const models = m.bakeChoice(crafter.s.model(view));
    for (const n of asked) if (typeof n === 'string' && !m.BLOCK_TEXTURES[n]) strays.add(n);
    const q = models.variants[0].quads;
    const by = (prefix) => q.filter((x) => x.tex.startsWith(prefix));
    const want = {
      [craft ? 'crafter_north_crafting' : 'crafter_north']: [front, top],
      [trig ? 'crafter_south_triggered' : 'crafter_south']: [neg(front), top],
      [craft ? 'crafter_top_crafting' : trig ? 'crafter_top_triggered' : 'crafter_top']: [top, front],
      crafter_bottom: [neg(top), neg(front)],
      [craft ? 'crafter_east_crafting' : trig ? 'crafter_east_triggered' : 'crafter_east']: [east, top],
      [craft ? 'crafter_west_crafting' : trig ? 'crafter_west_triggered' : 'crafter_west']: [neg(east), top],
    };
    const got = q.map((x) => x.tex).sort().join();
    if (q.length !== 6 || got !== Object.keys(want).sort().join()) bad.push(`${o},${trig},${craft}: ${got}`);
    for (const [name, [faces, up]] of Object.entries(want)) {
      const f = by(name).filter((x) => x.tex === name)[0];
      if (!f) continue;
      if (DIRS[f.dir] !== dirOf(faces)) bad.push(`${o}: ${name} faces ${DIRS[f.dir]}, not ${dirOf(faces)}`);
      if (f.cull !== f.dir || !f.full || !f.flush) bad.push(`${o}: ${name} not a whole face culled its way`);
      if (pictureUp(f) !== dirOf(up)) bad.push(`${o}: ${name}'s picture points ${pictureUp(f)}, not ${dirOf(up)}`);
    }
    if (models.variants[0].particle !== 'crafter_north') bad.push(`${o}: particle ${models.variants[0].particle}`);
  }
  check(`models: all ${states} states a whole cube of the right textures, its mouth to its front, its grid to its top, each picture upright`, states === 48 && bad.length === 0, bad.slice(0, 6).join(' | '));
  check('models: they ask for no texture that isn\'t there', strays.size === 0, [...strays].join());
  const def = m.STATE_VIEWS[crafter.defaultState];
  check('models: placed as it comes, facing north with its top up, idle', def.get('orientation') === 'north_up' && !def.get('triggered') && !def.get('crafting'));
}
{
  const it = m.ITEMS.get('crafter');
  const models = m.getItemModels(crafter);
  const q = models?.variants[0].quads ?? [];
  check('item: the crafter in the hand and the inventory is its block (idle, its mouth north)', !!it && it.block === crafter && !it.texture && q.length === 6 && DIRS[q.find((x) => x.tex === 'crafter_north')?.dir] === 'north', JSON.stringify({ block: it?.block?.name, texture: it?.texture }));
}

// ---------------------------------------------------------------------------------------------------------------
// The screen's sprites

{
  const G = (n) => m.GUI_TEXTURES[n]?.();
  const panel = G('container_crafter'), off = G('crafter_disabled_slot'), on = G('crafter_powered_redstone'), dark = G('crafter_unpowered_redstone');
  check('screen: the panel 176x166, a barred slot 18x18, the redstone 16x16 lit and not', panel?.w === 176 && panel.h === 166 && off?.w === 18 && off.h === 18 && on?.w === 16 && on.h === 16 && dark?.w === 16 && dark.h === 16);
  const SLOT = px(panel, 26, 17).join();
  const plain = (x, y) => {
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (px(panel, x + i, y + j).join() !== SLOT) return false;
    return px(panel, x - 1, y - 1).join() !== SLOT && px(panel, x + 16, y + 16).join() !== SLOT;
  };
  const grid = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) grid.push([26 + j * 18, 17 + i * 18]);
  const inv = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) inv.push([8 + c * 18, 84 + r * 18]);
  for (let c = 0; c < 9; c++) inv.push([8 + c * 18, 142]);
  check('screen: its 3x3 grid where the menu puts it, the 36 inventory slots under it (the menu\'s places)', grid.every(([x, y]) => plain(x, y)) && inv.every(([x, y]) => plain(x, y)));
  let big = true;
  for (let y = 31; y < 55; y++) for (let x = 130; x < 154; x++) if (px(panel, x, y).join() !== SLOT) big = false;
  check('screen: the big result slot round what it would make (134, 35)', big);
  let arrow = 0;
  for (let y = 36; y < 51; y++) for (let x = 115; x < 128; x++) if (px(panel, x, y).join() === SLOT) arrow++;
  let clear = true;
  const bg = px(panel, 104, 30).join();
  for (let y = 35; y < 51; y++) for (let x = 97; x < 113; x++) if (px(panel, x, y).join() !== bg) clear = false;
  check(`screen: an arrow (${arrow} pixels) from the redstone's place (left bare for it) to the result`, arrow >= 60 && clear);
  const diag = [3, 6, 9, 12].every((i) => lum(px(off, i, i)) < lum(px(off, 1, 8)) - 20 && lum(px(off, 17 - i, i)) < lum(px(off, 1, 8)) - 20);
  check('screen: the switched-off slot darker than a slot, crossed', diag && lum(px(off, 1, 8)) < lum(SLOT.split(',').map(Number)) && px(off, 0, 0)[3] === 255);
  const shape = (t) => t.data.filter((_, i) => i % 4 === 3).join();
  const redness = (t) => {
    let s = 0, n = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const [r, g, b, a] = px(t, x, y); if (a) (s += r - (g + b) / 2), n++; }
    return s / n;
  };
  check(`screen: the redstone the same dust lit (red ${redness(on).toFixed(0)}) as unlit (${redness(dark).toFixed(0)}), much brighter`, shape(on) === shape(dark) && count(on, () => true) > 60 && redness(on) > redness(dark) + 80 && meanLum(on) > meanLum(dark) * 2);
}

// ---------------------------------------------------------------------------------------------------------------
// Sounds

{
  const played = new Set();
  for (const f of ['src/game/crafter.ts', 'src/gui/screens/crafter.ts'])
    for (const [, n] of fs.readFileSync(f, 'utf8').matchAll(/'((?:block|item|entity|event|ui)\.[a-z_.]+[a-z])'/g)) played.add(n);
  const missing = [...played].filter((n) => !m.SOUNDS[n]);
  check(`sounds: every one the crafter and its screen play is there (${[...played].join(', ')})`, played.size === 3 && missing.length === 0, missing.join());
  check('sounds: the craft three takes, the fail two', m.SOUNDS['block.crafter.craft']?.variants === 3 && m.SOUNDS['block.crafter.fail']?.variants === 2);
  const bad = [], lens = {};
  for (const n of ['block.crafter.craft', 'block.crafter.fail']) {
    const g = m.SOUNDS[n];
    for (let v = 0; v < g.variants; v++) {
      const b = g.generate(v, 44100);
      let peak = 0;
      for (const x of b) peak = Math.max(peak, Math.abs(x));
      (lens[n] ??= []).push(b.length / 44100);
      if (!(b.length > 441 && b.length < 44100 * 2 && peak > 0.05 && peak <= 1 && b.every(Number.isFinite))) bad.push(`${n}#${v} ${(b.length / 44100).toFixed(2)}s ${peak.toFixed(2)}`);
    }
  }
  check('sounds: all five render, clean and under two seconds', bad.length === 0, bad.join());
  check(`sounds: the fail shorter than the craft (${Math.max(...lens['block.crafter.fail']).toFixed(2)}s, ${Math.min(...lens['block.crafter.craft']).toFixed(2)}s)`, Math.max(...lens['block.crafter.fail']) < Math.min(...lens['block.crafter.craft']));
  const differ = (n, a, b) => { const g = m.SOUNDS[n]; const x = g.generate(a, 22050), y = g.generate(b, 22050); return x.length !== y.length || x.some((v, i) => v !== y[i]); };
  check('sounds: the takes differ from each other', differ('block.crafter.craft', 0, 1) && differ('block.crafter.craft', 1, 2) && differ('block.crafter.fail', 0, 1));
}

// ---------------------------------------------------------------------------------------------------------------
// White smoke

{
  const { world } = flatLevel(m, -1, -1, 0, 0);
  const atlas = { sprites: new Proxy({}, { get: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) }) };
  const pe = new m.ParticleEngine(atlas, world, () => 0xffffff);
  for (let i = 0; i < 300; i++) pe.spawn('white_smoke', 0.5, 65, 0.5, 0.1, 0, 0);
  const w = pe.sprites.filter((p) => p.kind === 'white_smoke');
  const lives = w.map((p) => p.lifetime);
  check('white smoke: vanilla WhiteSmokeParticle\'s own pale grey (0xbab1c2), every puff', w.length === 300 && w.every((p) => p.r === 0.7294118 && p.g === 0.69411767 && p.b === 0.7607843));
  check(`white smoke: the smoke's puff otherwise: 8 to 40 ticks (${Math.min(...lives)}..${Math.max(...lives)}), rising, slowing, growing`,
    Math.min(...lives) >= 8 && Math.max(...lives) <= 40 && w.every((p) => p.friction === 0.96 && p.gravity === -0.1 && p.grow && p.physics && p.frames.length === 8));
  const avg = w.reduce((s, p) => s + p.dx, 0) / w.length;
  check(`white smoke: sent the way it's shot (${avg.toFixed(3)} across for 0.1)`, Math.abs(avg - 0.1) < 0.01);
  const before = pe.sprites.length;
  for (let i = 0; i < 50; i++) pe.spawn('smoke', 0.5, 65, 0.5, 0, 0, 0);
  const s = pe.sprites.slice(before);
  check('smoke: still its own dark greys', s.length === 50 && s.every((p) => p.r === p.g && p.g === p.b && p.r <= 0.3));
}

await exitWithStatus(close);
