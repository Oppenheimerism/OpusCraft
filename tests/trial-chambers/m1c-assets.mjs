// M1c: what the tuff and copper families look and sound like — every texture each new block state's model asks for
// is there (and each copper age looks different from the last), the bulbs lit and powered, the rod glowing when
// struck, the item sprites, every sound the blocks and the copper code play (rendered, clean), the four glow
// particles as vanilla's GlowParticle providers make them, and the three new sherds' pot faces.

import fs from 'node:fs';
import { load, check, flatLevel, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/textures/blocks.ts', '/src/textures/items.ts', '/src/textures/decoratedPot.ts', '/src/audio/synth.ts', '/src/render/particles.ts', '/src/render/mesher.ts',
  '/src/game/decoratedPot.ts', '/src/game/redstone/components.ts', '/src/audio/gen/discMusic.ts',
]);
const AGES = ['', 'exposed_', 'weathered_', 'oxidized_'];
const KINDS = ['copper_block', 'chiseled_copper', 'copper_grate', 'cut_copper', 'cut_copper_stairs', 'cut_copper_slab', 'copper_door', 'copper_trapdoor', 'copper_bulb'];
const nameOf = (kind, age, waxed) => `${waxed ? 'waxed_' : ''}${AGES[age]}${kind === 'copper_block' && age ? 'copper' : kind}`;
const COPPER = [];
for (const waxed of [false, true]) for (let age = 0; age < 4; age++) for (const kind of KINDS) COPPER.push(nameOf(kind, age, waxed));
const TUFF = ['tuff_slab', 'tuff_stairs', 'tuff_wall', 'chiseled_tuff', 'polished_tuff', 'polished_tuff_slab', 'polished_tuff_stairs', 'polished_tuff_wall', 'tuff_bricks', 'tuff_brick_slab', 'tuff_brick_stairs', 'tuff_brick_wall', 'chiseled_tuff_bricks'];
const BLOCKS = [...TUFF, ...COPPER, 'lightning_rod', 'heavy_core'];

const px = (t, x, y) => {
  const i = (y * t.w + x) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2], t.data[i + 3]];
};
const lum = (t) => {
  let s = 0, n = 0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const [r, g, b, a] = px(t, x, y);
    if (!a) continue;
    s += r * 0.299 + g * 0.587 + b * 0.114;
    n++;
  }
  return n ? s / n : 0;
};
const hue = (t) => {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < t.data.length; i += 4) if (t.data[i + 3]) {
    r += t.data[i];
    g += t.data[i + 1];
    b += t.data[i + 2];
  }
  return { r, g, b };
};
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const tex = (n) => m.BLOCK_TEXTURES[n]?.();

/** the textures a state's model asks the atlas for */
const asked = new Set();
m.initMesher(new Proxy({}, { get: (_, n) => (asked.add(n), { u0: 0, v0: 0, u1: 1, v1: 1 }) }));
function texturesOf(st) {
  asked.clear();
  const models = m.bakeChoice(m.getBlock(m.BLOCKS[m.STATE_BLOCK[st]].name).s.model(m.STATE_VIEWS[st]));
  return { names: [...asked].filter((n) => typeof n === 'string' && n !== 'missing'), particle: models.variants[0]?.particle, empty: !models.variants.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Block textures

{
  const missing = [];
  let states = 0;
  for (const n of BLOCKS) {
    const b = m.getBlock(n);
    for (let st = b.baseState; st < b.baseState + b.stateCount; st++) {
      states++;
      const { names, particle, empty } = texturesOf(st);
      // (a wall with neither post nor sides, a state vanilla never makes, has no parts)
      if (empty && n.endsWith('_wall')) continue;
      for (const t of [...names, particle]) if (!m.BLOCK_TEXTURES[t]) missing.push(`${n}:${t}`);
      if (!names.length) missing.push(`${n}: no textures`);
    }
  }
  check(`textures: every state of the ${BLOCKS.length} new blocks (${states} states) has its textures`, missing.length === 0, [...new Set(missing)].slice(0, 8).join(' '));
  const solid = (t) => t.data.every((v, i) => i % 4 !== 3 || v === 255);
  const all16 = ['tuff_bricks', 'polished_tuff', 'chiseled_tuff', 'chiseled_tuff_top', 'chiseled_tuff_bricks', 'chiseled_tuff_bricks_top'].filter((n) => m.BLOCK_TEXTURES[n]);
  check('textures: the tuff ones 16x16 and solid', all16.length >= 4 && all16.every((n) => tex(n).w === 16 && tex(n).h === 16 && solid(tex(n))), all16.join());
  check('textures: the waxed blocks look just like the unwaxed', COPPER.filter((n) => n.startsWith('waxed_')).every((n) => JSON.stringify(texturesOf(m.getBlock(n).defaultState).names) === JSON.stringify(texturesOf(m.getBlock(n.slice(6)).defaultState).names)));
  for (const kind of ['copper', 'cut_copper', 'chiseled_copper', 'copper_grate', 'copper_bulb', 'copper_trapdoor', 'copper_door_top', 'copper_door_bottom']) {
    const ts = [0, 1, 2, 3].map((a) => tex(`${a ? AGES[a] : ''}${kind === 'copper' && !a ? 'copper_block' : kind}`));
    const greener = ts.map((t) => { const h = hue(t); return h.g / (h.r + 1); });
    check(`textures: ${kind} at each age, each different and greener than the last`, ts.every(Boolean) && ts.every((t, i) => !i || !same(t, ts[i - 1])) && greener.every((g, i) => !i || g > greener[i - 1]), greener.map((g) => g.toFixed(2)).join(' '));
  }
  for (const a of AGES) {
    const [off, offP, on, onP] = ['', '_powered', '_lit', '_lit_powered'].map((s) => tex(`${a}copper_bulb${s.replace('_lit_powered', '_lit_powered')}`));
    check(`textures: the ${a || 'bare '}bulb brighter lit, the powered ones marked`, on && off && lum(on) > lum(off) + 5 && !same(off, offP) && !same(on, onP));
  }
  check('textures: the grate is holes and bars (some clear pixels)', [0, 1, 2, 3].every((a) => tex(`${AGES[a]}copper_grate`).data.some((v, i) => i % 4 === 3 && v === 0)));
  check('textures: the lightning rod white-hot when struck', lum(tex('lightning_rod_on')) > lum(tex('lightning_rod')) + 20);
  check('textures: the heavy core', !!tex('heavy_core'));
}

// ---------------------------------------------------------------------------------------------------------------
// Item sprites

{
  const items = [...TUFF, ...COPPER, 'lightning_rod', 'heavy_core', 'honeycomb', 'trial_key', 'ominous_trial_key', 'mace', 'wind_charge', 'breeze_rod',
    'music_disc_creator', 'music_disc_creator_music_box', 'music_disc_precipice', 'flow_pottery_sherd', 'guster_pottery_sherd', 'scrape_pottery_sherd'];
  const bad = [];
  for (const id of items) {
    const it = m.ITEMS.get(id);
    if (!it) { bad.push(`${id}: no item`); continue; }
    if (!it.texture) {
      if (!it.block) bad.push(`${id}: no sprite`);
      continue;
    }
    const img = it.texture.startsWith('block:') ? m.BLOCK_TEXTURES[it.texture.slice(6)]?.() : m.ITEM_TEXTURES[it.texture]?.();
    if (!img || img.w !== 16 || img.h !== 16) bad.push(`${id}: ${it.texture}`);
  }
  check(`items: every new item has its icon (a sprite or its block) (${items.length})`, bad.length === 0, bad.join(' '));
  const doors = [0, 1, 2, 3].map((a) => m.ITEM_TEXTURES[`${AGES[a]}copper_door`]?.());
  check('items: a door sprite for each age, each different', doors.every(Boolean) && doors.every((d, i) => !i || !same(d, doors[i - 1])));
  check('items: the waxed doors look like the unwaxed', same(m.ITEM_TEXTURES[m.ITEMS.get('waxed_weathered_copper_door').texture](), m.ITEM_TEXTURES[m.ITEMS.get('weathered_copper_door').texture]()));
  const sprites = ['trial_key', 'ominous_trial_key', 'mace', 'wind_charge', 'breeze_rod', 'honeycomb'].map((id) => m.ITEM_TEXTURES[m.ITEMS.get(id).texture]());
  check('items: the sprites have clear corners and something drawn', sprites.every((t) => px(t, 0, 0)[3] === 0 && t.data.filter((v, i) => i % 4 === 3 && v === 255).length > 20));
  check('items: the two keys differ', !same(sprites[0], sprites[1]));
}

// ---------------------------------------------------------------------------------------------------------------
// Sounds

{
  const events = ['break', 'step', 'place', 'hit', 'fall'];
  const groups = [...new Set(BLOCKS.map((n) => m.getBlock(n).sound))];
  check(`sounds: the blocks' ${groups.length} sound groups (${groups.join(', ')}), each with ${events.join(', ')}`, groups.length === 7 && groups.every((g) => events.every((e) => m.SOUNDS[`block.${g}.${e}`])),
    groups.flatMap((g) => events.filter((e) => !m.SOUNDS[`block.${g}.${e}`]).map((e) => `${g}.${e}`)).join());
  const played = new Set(['block.copper_door.open', 'block.copper_door.close', 'block.copper_trapdoor.open', 'block.copper_trapdoor.close']);
  for (const f of ['src/game/copper.ts'])
    for (const [, n] of fs.readFileSync(f, 'utf8').matchAll(/'((?:block|item|entity)\.[a-z_.]+[a-z])'/g)) played.add(n);
  const missing = [...played].filter((n) => !m.SOUNDS[n]);
  check(`sounds: every event the copper plays is there (${played.size})`, played.size >= 11 && missing.length === 0, missing.join());
  check('sounds: a copper door opens with its own sound', m.openSound('weathered_copper_door', true) === 'block.copper_door.open' && m.openSound('waxed_copper_trapdoor', false) === 'block.copper_trapdoor.close' && m.openSound('oak_door', true) !== 'block.copper_door.open');
  const names = Object.keys(m.SOUNDS).filter((n) => /^(block\.(tuff|polished_tuff|tuff_bricks|copper|copper_grate|copper_bulb|heavy_core|copper_door|copper_trapdoor)\.|item\.(axe\.scrape|axe\.wax_off|honeycomb\.wax_on))/.test(n));
  const bad = [];
  for (const n of names) {
    const g = m.SOUNDS[n];
    for (let v = 0; v < g.variants; v++) {
      const b = g.generate(v, 44100);
      let peak = 0;
      for (const x of b) peak = Math.max(peak, Math.abs(x));
      if (!(b.length > 441 && b.length < 44100 * 1.5 && peak > 0.05 && peak <= 1 && b.every(Number.isFinite))) bad.push(`${n}#${v}`);
    }
  }
  check(`sounds: all ${names.length} of them render, clean and under a second and a half`, names.length >= 40 && bad.length === 0, bad.join());
}

// ---------------------------------------------------------------------------------------------------------------
// The glow particles

{
  const { world } = flatLevel(m, -1, -1, 0, 0);
  const pe = new m.ParticleEngine({ sprites: {} }, world, () => 0xffffff);
  const of = (kind) => pe.sprites.filter((p) => p.kind === kind);
  for (let i = 0; i < 200; i++) for (const k of ['wax_on', 'wax_off', 'scrape', 'electric_spark']) pe.spawn(k, 0.5, 70, 0.5, 0.4, -0.2, 0.3);
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  check('particles: wax on is amber (0.91, 0.55, 0.08), wax off pale (1, 0.9, 1)', of('wax_on').every((p) => close(p.r, 0.91) && close(p.g, 0.55) && close(p.b, 0.08)) && of('wax_off').every((p) => close(p.r, 1) && close(p.g, 0.9) && close(p.b, 1)));
  const greens = new Set(of('scrape').map((p) => `${p.r},${p.g},${p.b}`));
  check('particles: scrape is one of two verdigris greens', greens.size === 2 && [...greens].every((c) => c === '0.29,0.58,0.51' || c === '0.43,0.77,0.62'), [...greens].join(' '));
  check('particles: wax drifts at 0.01 of its speed, half that sideways; scrape 0.01; sparks 0.25', of('wax_on').every((p) => close(p.dx, 0.002) && close(p.dy, -0.002) && close(p.dz, 0.0015)) &&
    of('scrape').every((p) => close(p.dx, 0.004) && close(p.dz, 0.003)) && of('electric_spark').every((p) => close(p.dx, 0.1) && close(p.dy, -0.05)));
  const life = (k) => of(k).map((p) => p.lifetime);
  check('particles: wax and scrape last 10-39 ticks, sparks 2-3', ['wax_on', 'wax_off', 'scrape'].every((k) => Math.min(...life(k)) >= 10 && Math.max(...life(k)) <= 39) && Math.min(...life('electric_spark')) === 2 && Math.max(...life('electric_spark')) === 3);
  check('particles: no collisions, friction 0.96, glowing', pe.sprites.filter((p) => ['wax_on', 'scrape', 'electric_spark'].includes(p.kind)).every((p) => !p.physics && close(p.friction, 0.96) && p.lightMode === 'flame'));
}

// ---------------------------------------------------------------------------------------------------------------
// The sherds on a pot

{
  check('sherds: flow, guster and scrape are decorated pot sherds', ['flow', 'guster', 'scrape'].every((s) => m.SHERDS.includes(`${s}_pottery_sherd`)));
  const faces = ['flow', 'guster', 'scrape'].map((s) => m.decoratedPotSideTexture(m.patternOf(`${s}_pottery_sherd`)));
  const plain = m.decoratedPotSideTexture(null);
  check('sherds: each draws its own motif on the pot', faces.every((f) => f && !same(f, plain)) && !same(faces[0], faces[1]) && !same(faces[1], faces[2]));
}

// ---------------------------------------------------------------------------------------------------------------
// The music discs' songs

{
  const SONGS = { 'music_disc.creator': 176, 'music_disc.creator_music_box': 73, 'music_disc.precipice': 299 };
  check('discs: each song is a music pool of one', Object.keys(SONGS).every((k) => m.MUSIC_POOLS[k] === 1));
  check('discs: the song table names its disc, length and comparator level (vanilla JukeboxSongs)', m.DISC_SONGS?.['music_disc.precipice']?.comparator === 13 && m.DISC_SONGS['music_disc.creator'].disc === 'music_disc_creator');
  for (const [pool, secs] of Object.entries(SONGS)) {
    const x = m.generatePoolMusic(pool, 0, 22050);
    let pk = 0, bad = 0;
    for (const v of x) {
      if (!Number.isFinite(v)) bad++;
      pk = Math.max(pk, Math.abs(v));
    }
    let tail = 0;
    for (const v of x.subarray(x.length - 1100)) tail = Math.max(tail, Math.abs(v));
    const dur = x.length / 22050;
    check(`discs: ${pool} renders about as long as vanilla's (${secs} s), at the music's level, fading out`, !bad && Math.abs(dur - secs) < 4 && Math.abs(pk - 0.6) < 0.01 && tail < 0.01, `${dur.toFixed(1)} s, peak ${pk.toFixed(2)}, tail ${tail.toFixed(3)}`);
  }
}

await exitWithStatus(close);
