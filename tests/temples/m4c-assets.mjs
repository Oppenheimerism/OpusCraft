// M4c: what archaeology looks and sounds like, and what it's worth: the suspicious blocks' four stages, the sherds'
// sprites and the pot's textures, every sound the brush, the suspicious blocks and the pots play, the pot's dust
// plume, and the two archaeology advancements (brushing a suspicious block, a pot made of four sherds).

import fs from 'node:fs';
import { load, check, flatLevel, place, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/archaeology.ts', '/src/game/decoratedPot.ts', '/src/game/interaction.ts', '/src/entity/player.ts', '/src/game/itemBehavior.ts',
  '/src/textures/blocks.ts', '/src/textures/items.ts', '/src/textures/decoratedPot.ts', '/src/audio/synth.ts', '/src/render/particles.ts',
  '/src/game/advancements.ts', '/src/render/mesher.ts',
]);
const G = 64;
const SHERDS = ['archer_pottery_sherd', 'miner_pottery_sherd', 'prize_pottery_sherd', 'skull_pottery_sherd'];
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const px = (t, x, y) => {
  const i = (y * t.w + x) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2], t.data[i + 3]];
};
const lum = (t, x0, y0, w, h) => {
  let s = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const [r, g, b] = px(t, x, y);
    s += r * 0.299 + g * 0.587 + b * 0.114;
  }
  return s / (w * h);
};
const opaque = (t, x0, y0, w, h) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (px(t, x, y)[3] !== 255) return false;
  return true;
};
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
/** the textures a state's model asks the atlas for (baked through a lookup that notes each name) */
const asked = new Set();
m.initMesher(new Proxy({}, { get: (_, n) => (asked.add(n), { u0: 0, v0: 0, u1: 1, v1: 1 }) }));
function texturesOf(st) {
  asked.clear();
  const models = m.bakeChoice(m.getBlock(m.BLOCKS[m.STATE_BLOCK[st]].name).s.model(m.STATE_VIEWS[st]));
  return { names: [...asked].filter((n) => typeof n === 'string' && n !== 'missing'), particle: models.variants[0].particle };
}

// ---------------------------------------------------------------------------------------------------------------
// Textures

for (const base of ['sand', 'gravel']) {
  const name = `suspicious_${base}`;
  const stages = [0, 1, 2, 3].map((i) => m.BLOCK_TEXTURES[`${name}_${i}`]?.());
  check(`${name}: four stage textures, 16x16 and solid`, stages.every((t) => t && t.w === 16 && t.h === 16 && opaque(t, 0, 0, 16, 16)));
  check(`${name}: stage 0 is ${base} disturbed, not plain ${base}`, !same(stages[0], m.BLOCK_TEXTURES[base]()));
  check(`${name}: each stage differs from the last`, stages.every((t, i) => i === 0 || !same(t, stages[i - 1])));
  const middle = stages.map((t) => lum(t, 6, 6, 4, 4));
  check(`${name}: the hollow in the middle darkens stage by stage`, middle[1] < middle[0] && middle[2] < middle[1] && middle[3] < middle[2], middle.map((v) => v.toFixed(0)).join(' '));
  const tex = [0, 1, 2, 3].map((i) => texturesOf(m.S(name, { dusted: i })).names);
  check(`${name}: each stage's model is its own texture, which is there`, tex.every((t, i) => t.length === 1 && t[0] === `${name}_${i}` && m.BLOCK_TEXTURES[t[0]]), JSON.stringify(tex));
}
{
  const sprites = SHERDS.map((s) => m.ITEM_TEXTURES[s]?.());
  check('sherds: a sprite each, 16x16', sprites.every((t) => t && t.w === 16 && t.h === 16));
  check('sherds: alpha only 0 or 255, the corners clear, a fragment of at least 120 pixels', sprites.every((t) => {
    let n = 0;
    for (let i = 3; i < t.data.length; i += 4) {
      if (t.data[i] !== 0 && t.data[i] !== 255) return false;
      if (t.data[i]) n++;
    }
    return n >= 120 && px(t, 0, 0)[3] === 0 && px(t, 15, 15)[3] === 0;
  }));
  check('sherds: each has its own motif', sprites.every((t, i) => sprites.every((u, j) => i === j || !same(t, u))));
  check('items: the brush, the sherds and the pot have their sprites', ['brush', 'decorated_pot', ...SHERDS].every((id) => m.ITEM_TEXTURES[m.ITEMS.get(id).texture]));
}
{
  const base = m.decoratedPotBaseTexture();
  check('pot base: 32x32', base.w === 32 && base.h === 32);
  check('pot base: every face the model uses is painted (lip, neck, top, bottom)', opaque(base, 8, 0, 16, 8) && opaque(base, 0, 8, 32, 3) && opaque(base, 0, 11, 24, 1) && opaque(base, 0, 13, 28, 14));
  check('pot base: the mouth is dark inside its rim', lum(base, 11, 3, 2, 2) < lum(base, 8, 0, 8, 1) / 3);
  const plain = m.decoratedPotSideTexture(null);
  const sides = ['archer', 'miner', 'prize', 'skull'].map((p) => m.decoratedPotSideTexture(p));
  check('pot sides: 16x16, the 14 columns the model uses painted top to bottom', [plain, ...sides].every((t) => t.w === 16 && t.h === 16 && opaque(t, 1, 0, 14, 16)));
  check('pot sides: each pattern its own, none the plain side', sides.every((t, i) => !same(t, plain) && sides.every((u, j) => i === j || !same(t, u))));
  check('pot sides: a sherd names its pattern, a brick none', SHERDS.every((s) => m.patternOf(s) === s.replace('_pottery_sherd', '')) && m.patternOf('brick') === null);
  const pot = texturesOf(m.S('decorated_pot'));
  check('pot: its block model draws nothing (the block entity does), its particles terracotta\'s, which is there', pot.names.length === 0 && pot.particle === 'terracotta' && !!m.BLOCK_TEXTURES['terracotta'], JSON.stringify(pot));
}

// ---------------------------------------------------------------------------------------------------------------
// Sounds

{
  const events = ['break', 'step', 'place', 'hit', 'fall'];
  for (const b of ['suspicious_sand', 'suspicious_gravel', 'decorated_pot']) {
    const sound = m.getBlock(b).sound;
    check(`sounds: ${b}'s own ${events.join(', ')}`, events.every((e) => m.SOUNDS[`block.${sound}.${e}`]), events.filter((e) => !m.SOUNDS[`block.${sound}.${e}`]).join());
  }
  const played = new Set();
  for (const f of ['src/game/archaeology.ts', 'src/game/decoratedPot.ts'])
    for (const [, n] of fs.readFileSync(f, 'utf8').matchAll(/'((?:block|item|entity)\.[a-z_.]+[a-z])'/g)) played.add(n);
  const missing = [...played].filter((n) => !m.SOUNDS[n]);
  check(`sounds: every event the brush and the pot play is there (${played.size})`, played.size >= 8 && missing.length === 0, missing.join());
  const names = Object.keys(m.SOUNDS).filter((n) => /^(block\.(suspicious_|decorated_pot)|item\.brush)/.test(n));
  let bad = [];
  for (const n of names) {
    const g = m.SOUNDS[n];
    for (let v = 0; v < g.variants; v++) {
      const b = g.generate(v, 44100);
      let peak = 0;
      for (const x of b) peak = Math.max(peak, Math.abs(x));
      if (!(b.length > 441 && b.length < 44100 * 1.5 && peak > 0.1 && peak <= 1 && b.every(Number.isFinite))) bad.push(`${n}#${v}`);
    }
  }
  check(`sounds: all ${names.length} of them render, clean and under a second and a half`, names.length >= 23 && bad.length === 0, bad.join());
}

// ---------------------------------------------------------------------------------------------------------------
// The pot's dust plume

{
  const { world } = flatLevel(m, -1, -1, 0, 0);
  const pe = new m.ParticleEngine({ sprites: {} }, world, () => 0xffffff);
  for (let i = 0; i < 7; i++) pe.spawn('dust_plume', 0.5, G + 1.2, 0.5, 0, 0, 0);
  const ps = pe.sprites.filter((p) => p.kind === 'dust_plume');
  check('dust plume: seven of them', ps.length === 7);
  check('dust plume: grey-violet (0xBAB1C2, each channel less the same up to 0.2)', ps.every((p) => {
    const k = 0xba / 255 - p.r;
    return k >= 0 && k < 0.2 && Math.abs(0xb1 / 255 - k - p.g) < 1e-6 && Math.abs(0xc2 / 255 - k - p.b) < 1e-6;
  }));
  check('dust plume: thrown upward, lasting 7 to 35 ticks, with no collisions', ps.every((p) => p.dy > 0.1 && p.dy < 0.32 && p.lifetime >= 7 && p.lifetime <= 35 && !p.physics));
  const y0 = ps.map((p) => p.y);
  pe.tick();
  check('dust plume: its gravity and friction die away each tick (0.88, 0.92)', ps.every((p) => Math.abs(p.gravity - 0.5 * 0.88) < 1e-9 && Math.abs(p.friction - 0.96 * 0.92) < 1e-9));
  check('dust plume: it rises at first', ps.every((p, i) => p.y > y0[i]));
}

// ---------------------------------------------------------------------------------------------------------------
// Advancements

{
  const salvage = m.ADVANCEMENTS.get('adventure/salvage_sherd'), pot = m.ADVANCEMENTS.get('adventure/craft_decorated_pot_using_only_sherds');
  let adv = new m.PlayerAdvancements();
  adv.trigger('container_loot', { lootTable: 'chests/desert_pyramid' });
  check('Respecting the Remnants: not for a chest\'s loot', !adv.isDone(salvage));
  adv.trigger('container_loot', { lootTable: 'archaeology/desert_pyramid' });
  check('Respecting the Remnants: for the desert pyramid\'s archaeology loot', adv.isDone(salvage));
  adv = new m.PlayerAdvancements();
  adv.trigger('recipe_crafted', { crafted: { recipe: 'decorated_pot', ingredients: ['archer_pottery_sherd', 'brick', 'prize_pottery_sherd', 'skull_pottery_sherd'] } });
  check('Careful Restoration: not with a brick among the sherds', !adv.isDone(pot));
  adv.trigger('recipe_crafted', { crafted: { recipe: 'decorated_pot', ingredients: ['skull_pottery_sherd', 'skull_pottery_sherd', 'miner_pottery_sherd', 'skull_pottery_sherd'] } });
  check('Careful Restoration: four sherds (any, the same ones too)', adv.isDone(pot));

  // what feeds them: the first stroke rolling the loot for the player, a sherd pot taken from the grid
  const { level } = flatLevel(m, -1, -1, 0, 0);
  const p = new m.Player(level);
  p.moveTo(0.5, G, 2.5, 180, 30);
  level.addEntity(p);
  const loot = [];
  m.setGenerateLootListener((who, table) => loot.push([who, table]));
  place(m, level, 'suspicious_sand', 0, G, 0, { props: { dusted: 0 } });
  const be = level.world.getBlockEntity(0, G, 0);
  be.lootTable = 'archaeology/desert_pyramid';
  be.lootSeed = 42n;
  be.brush(level, level.gameTime, p, m.SOUTH);
  be.brush(level, level.gameTime + 20, p, m.SOUTH);
  check('Respecting the Remnants: told once, on the first stroke, with the player and the table', loot.length === 1 && loot[0][0] === p && loot[0][1] === 'archaeology/desert_pyramid');
  m.setGenerateLootListener(null);
  const crafted = [];
  m.setPotCraftedListener((who, sides) => crafted.push([who, sides.join()]));
  m.craftedBy(p, m.decoratedPotItem(['archer_pottery_sherd', 'miner_pottery_sherd', 'prize_pottery_sherd', 'skull_pottery_sherd']));
  m.craftedBy(p, stack('decorated_pot'));
  check('Careful Restoration: told of a crafted sherd pot with its sides, not of a plain one', crafted.length === 1 && crafted[0][0] === p && crafted[0][1] === SHERDS.join());
  m.setPotCraftedListener(null);
}

await exitWithStatus(close);
