// Firework rockets and stars (headless): node tests/end/fireworks.mjs
import { load, check, flatLevel, place, ticks, exitWithStatus } from '../../tests/temples/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();

const { m, close } = await load([
  '/src/entity/player.ts', '/src/entity/elytra.ts', '/src/game/interaction.ts', '/src/game/redstone/dispenser.ts', '/src/game/redstone/dispenseItems.ts',
  '/src/item/fireworks.ts', '/src/entity/fireworkRocket.ts', '/src/render/fireworkParticles.ts', '/src/render/particles.ts', '/src/item/crossbow.ts',
  '/src/inventory/menus.ts', '/src/inventory/customRecipes.ts', '/src/inventory/recipes.ts', '/src/inventory/recipeBook.ts', '/src/item/hoverText.ts',
  '/src/item/itemColors.ts', '/src/textures/fireworks.ts', '/src/textures/items.ts', '/src/entity/animals.ts', '/src/entity/effects.ts', '/src/core/aabb.ts',
  '/src/item/enchantHelper.ts', '/src/entity/itemEntity.ts', '/src/game/raycast.ts',
]);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const near = (a, b, e) => Math.abs(a - b) <= e;
const RED = 0xb3312c, BLUE = 0x253192, WHITE = 0xf0f0f0, LIME = 0x41cd34, BLACK = 0x1e1b1b;
const X = (shape, colors, fade = [], trail = false, twinkle = false) => m.explosion(shape, colors, fade, trail, twinkle);
const plain = (s) => !s.tag || s.tag.fireworks === undefined;

// ---------------------------------------------------------------------------
// the items
{
  const R = m.ITEMS.get('firework_rocket'), S = m.ITEMS.get('firework_star');
  check('the items: Firework Rocket (tools) and Firework Star (ingredients), 64 to a stack', R?.name === 'Firework Rocket' && R.creativeTab === 'tools' && R.maxStack === 64 && S?.name === 'Firework Star' && S.creativeTab === 'ingredients' && S.maxStack === 64);
  const ids = m.ITEM_LIST.map((i) => i.id);
  check('listed after the elytra (the rocket) and after the book (the star)', ids.indexOf('firework_rocket') === ids.indexOf('elytra') + 1 && ids.indexOf('firework_star') === ids.indexOf('book') + 1);
  const cs = R.creativeStacks();
  check('creative: rockets of flight 1, 2 and 3 (the first with no component: the item default)', cs.length === 3 && plain(cs[0]) && m.fireworksOf(cs[0]).flightDuration === 1 && cs[1].tag.fireworks.flightDuration === 2 && cs[2].tag.fireworks.flightDuration === 3 && cs.every((s) => !m.fireworksOf(s).explosions.length));
  check('a plain rocket flies for 1 (vanilla default component)', m.fireworksOf(stack('firework_rocket')).flightDuration === 1 && m.fireworksOf(stack('paper')) === null);
  // stacking: a flight-1 rocket made any way stacks with the rest
  const a = m.fireworkRocket(1), b = stack('firework_rocket'), c = m.fireworkRocket(2), d = m.fireworkRocket(1, [X('small_ball', [RED])]);
  check('a flight-1 rocket stacks with a plain one; flight 2, or one with a star, does not', a.sameItem(b) && !a.sameItem(c) && !a.sameItem(d) && d.sameItem(m.fireworkRocket(1, [X('small_ball', [RED])])));
  const back = m.loadStack(JSON.parse(JSON.stringify(m.saveStack(m.fireworkRocket(3, [X('burst', [RED, BLUE], [WHITE], true, false)])))));
  check('saved and loaded, a rocket keeps its stars (and still stacks with its twin)', back.sameItem(m.fireworkRocket(3, [X('burst', [RED, BLUE], [WHITE], true, false)])) && back.tag.fireworks.explosions[0].fadeColors[0] === WHITE);
  const cl = m.cloneTag(d.tag);
  cl.fireworks.explosions[0].colors.push(BLUE);
  check('copies are deep (a copy\'s colours are its own)', d.tag.fireworks.explosions[0].colors.length === 1);
}

// --- tooltips (vanilla Fireworks / FireworkExplosion.addToTooltip)
{
  const t = (s) => m.hoverText(s).map((l) => l.replace(/§./g, ''));
  check('a plain rocket: "Flight Duration: 1"', JSON.stringify(t(stack('firework_rocket'))) === JSON.stringify(['Flight Duration: 1']), JSON.stringify(t(stack('firework_rocket'))));
  const r = m.fireworkRocket(2, [X('small_ball', [RED]), X('small_ball', [RED]), X('large_ball', [RED, BLUE], [WHITE], true, true), X('creeper', [0x123456])]);
  const want = ['Flight Duration: 2', '2 x Small Ball', '  Red', 'Large Ball', '  Red, Blue', '  Fade to White', '  Trail', '  Twinkle', 'Creeper-shaped', '  Custom'];
  check('a rocket: equal stars in a row counted once ("2 x Small Ball"), each with its colours indented', JSON.stringify(t(r)) === JSON.stringify(want), JSON.stringify(t(r)));
  check('all of it grey', m.hoverText(r).every((l) => l.includes('§7')));
  const s = m.fireworkStar(X('star', [LIME, 0xf0f0f0], [0x1e1b1b], false, true));
  check('a star: its shape, colours, fade, twinkle', JSON.stringify(t(s)) === JSON.stringify(['Star-shaped', 'Lime, White', 'Fade to Black', 'Twinkle']), JSON.stringify(t(s)));
  check('a plain star: nothing', t(stack('firework_star')).length === 0);
  check('shape names', ['small_ball', 'large_ball', 'star', 'creeper', 'burst'].map(m.shapeName).join('|') === 'Small Ball|Large Ball|Star-shaped|Creeper-shaped|Burst');
  check('colour names: the dyes, two words for light blue and light grey', m.fireworkColorName(0x6689d3) === 'Light Blue' && m.fireworkColorName(0xababab) === 'Light Gray' && m.fireworkColorName(0x51301a) === 'Brown' && m.fireworkColorName(0x51301b) === 'Custom');
}

// --- the star's icon
{
  const L = m.itemLayers(m.ITEMS.get('firework_star'));
  check('the star: two layers, the overlay (layer1) tinted, grey by default', L && L.layers.join() === 'firework_star,firework_star_overlay' && L.tinted === 1 && L.defaultTint === 0x8a8a8a);
  check('tint: grey with no colours, the colour itself with one', m.layerTint(stack('firework_star')) === 0x8a8a8a && m.layerTint(m.fireworkStar(X('small_ball', [RED]))) === RED);
  // (0xb3+0x25)/2=0x6c, (0x31+0x31)/2=0x31, (0x2c+0x92)/2=0x5f
  check('several: their average, channel by channel', m.layerTint(m.fireworkStar(X('small_ball', [RED, BLUE]))) === 0x6c315f, m.layerTint(m.fireworkStar(X('small_ball', [RED, BLUE]))).toString(16));
  check('the rocket is untinted', m.itemLayers(m.ITEMS.get('firework_rocket')) === null);
  const base = m.FIREWORK_ITEMS.firework_star(), over = m.FIREWORK_ITEMS.firework_star_overlay();
  const opaque = (t) => { let n = 0; for (let i = 3; i < t.data.length; i += 4) if (t.data[i]) n++; return n; };
  let inside = true;
  for (let i = 3; i < over.data.length; i += 4) if (over.data[i] && !base.data[i]) inside = false;
  check('the textures: a grey ball, and a smaller light overlay within it', base.w === 16 && over.w === 16 && opaque(base) > 70 && opaque(over) > 20 && opaque(over) < opaque(base) / 2 && inside, `${opaque(base)} / ${opaque(over)}`);
  check('both registered as item textures (the star overriding the old one)', m.ITEM_TEXTURES.firework_star === m.FIREWORK_ITEMS.firework_star && !!m.ITEM_TEXTURES.firework_star_overlay && !!m.ITEM_TEXTURES.firework_rocket);
  const fl = m.fireworkParticleTextures().flash();
  const a = (x, y) => fl.data[(y * fl.w + x) * 4 + 3];
  check('the flash sprite: a soft white glow, solid in the middle, clear at the edge', a(8, 8) > 200 && a(8, 8) < 256 && a(2, 8) > 0 && a(2, 8) < 120 && a(0, 0) === 0);
}

// ---------------------------------------------------------------------------
// crafting
const grid = (...ids) => {
  const g = new Array(9).fill(null);
  ids.forEach((id, i) => { if (id) g[i] = typeof id === 'string' ? stack(id) : id; });
  return g;
};
const craft = (...ids) => m.customRecipeFor(grid(...ids), 3)?.result ?? null;
const exOf = (s) => s?.tag?.fireworkExplosion;
const same = (a, b) => !!a && m.sameExplosion(a, b);
{
  let s = craft('gunpowder', 'red_dye');
  check('star: gunpowder and a dye → a small red ball', s?.item.id === 'firework_star' && s.count === 1 && same(exOf(s), X('small_ball', [RED])), JSON.stringify(exOf(s)));
  s = craft('red_dye', null, 'gunpowder', 'blue_dye', null, 'red_dye');
  check('the colours in the grid\'s order, a dye twice counts twice', exOf(s)?.colors.join() === [RED, BLUE, RED].join());
  const shapes = { fire_charge: 'large_ball', feather: 'burst', gold_nugget: 'star', creeper_head: 'creeper', skeleton_skull: 'creeper', dragon_head: 'creeper', piglin_head: 'creeper' };
  check('the shape items: fire charge, feather, gold nugget, any head', Object.entries(shapes).every(([id, sh]) => exOf(craft('gunpowder', 'lime_dye', id))?.shape === sh));
  s = craft('diamond', 'gunpowder', 'glowstone_dust', 'white_dye', 'feather');
  check('a diamond for the trail, glowstone dust for the twinkle', exOf(s)?.hasTrail === true && exOf(s)?.hasTwinkle === true && exOf(s)?.shape === 'burst');
  check('not: no dye, no gunpowder, two gunpowder, two shapes, two diamonds, two glowstone, anything else', [
    craft('gunpowder'), craft('red_dye'), craft('gunpowder', 'gunpowder', 'red_dye'), craft('gunpowder', 'red_dye', 'feather', 'fire_charge'),
    craft('gunpowder', 'red_dye', 'diamond', 'diamond'), craft('gunpowder', 'red_dye', 'glowstone_dust', 'glowstone_dust'), craft('gunpowder', 'red_dye', 'stick'),
  ].every((r) => r === null));
  // fading
  const star = m.fireworkStar(X('large_ball', [RED], [], true));
  s = craft(star, 'blue_dye', 'white_dye');
  check('fade: a star and dyes → the star, fading to the dyes (one of it)', s?.count === 1 && same(exOf(s), X('large_ball', [RED], [BLUE, WHITE], true)) && !exOf(star).fadeColors.length, JSON.stringify(exOf(s)));
  s = craft(m.fireworkStar(X('small_ball', [RED], [WHITE])), 'lime_dye');
  check('a fade already there is replaced', exOf(s)?.fadeColors.join() === String(LIME));
  s = craft('firework_star', 'blue_dye');
  check('a plain star fades as a small ball of no colour', same(exOf(s), X('small_ball', [], [BLUE])));
  check('not: two stars, a star alone, with gunpowder', craft(star, star, 'red_dye') === null && craft(star) === null && craft(star, 'red_dye', 'gunpowder') === null);
  // rockets
  const plainR = m.findRecipe(grid('paper', 'gunpowder'), 3, 3);
  check('paper and gunpowder: the plain recipe (in the recipe book), three rockets of flight 1', plainR?.result === 'firework_rocket' && plainR.count === 3 && m.BOOK_BY_ID.get('firework_rocket')?.category === 'crafting_misc');
  s = craft('paper', 'gunpowder');
  check('...the special recipe agrees (no component)', s?.count === 3 && plain(s));
  s = craft('gunpowder', 'paper', 'gunpowder');
  check('two gunpowder: flight 2 (not the plain recipe)', !m.findRecipe(grid('gunpowder', 'paper', 'gunpowder'), 3, 3) && s?.count === 3 && s.tag?.fireworks?.flightDuration === 2 && !s.tag.fireworks.explosions.length);
  const s1 = m.fireworkStar(X('small_ball', [RED])), s2 = m.fireworkStar(X('burst', [BLUE], [], false, true));
  s = craft(s2, 'gunpowder', 'paper', 'gunpowder', s1, 'gunpowder', 'firework_star');
  check('three gunpowder and stars: flight 3, the stars in grid order (a plain star adds none)', s?.tag?.fireworks?.flightDuration === 3 && s.tag.fireworks.explosions.map((e) => e.shape).join() === 'burst,small_ball', JSON.stringify(s?.tag));
  s = craft('paper', 'gunpowder', s1, s1, s1, s1, s1, s1, s1);
  check('seven stars fit with one gunpowder', s?.tag?.fireworks?.explosions.length === 7);
  check('not: four gunpowder, two paper, no gunpowder, no paper, anything else', [
    craft('paper', 'gunpowder', 'gunpowder', 'gunpowder', 'gunpowder'), craft('paper', 'paper', 'gunpowder'), craft('paper', s1), craft('gunpowder', s1), craft('paper', 'gunpowder', 'red_dye'),
  ].every((r) => r === null));
  // in a real crafting table
  const { level } = flatLevel(m, -1, -1, 1, 1, G);
  const p = new m.Player(level);
  p.moveTo(0.5, G, 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  const menu = new m.CraftingMenu(p, [0, G, 0]);
  menu.craft.set(0, stack('paper'));
  menu.craft.set(1, stack('gunpowder', 2));
  menu.craft.set(4, stack('gunpowder'));
  menu.craft.set(8, m.fireworkStar(X('creeper', [LIME]), 2));
  const res = menu.result.items[0];
  check('a crafting table shows it: three flight-2 rockets with the creeper star', res?.count === 3 && res.tag?.fireworks?.flightDuration === 2 && res.tag.fireworks.explosions[0].shape === 'creeper');
  menu.quickMoveStack(p, 0);
  const got = p.inventory.main.filter((s) => s?.item.id === 'firework_rocket').reduce((n, s) => n + s.count, 0);
  check('shift-clicked: made once (the paper runs out), each ingredient one less', got === 3 && !menu.craft.get(0) && menu.craft.get(1)?.count === 1 && !menu.craft.get(4) && menu.craft.get(8)?.count === 1, `${got}`);
}

// ---------------------------------------------------------------------------
// the rocket
const { level, world, sounds, particles } = flatLevel(m, -4, -4, 4, 4, G);
const bursts = [];
level.particles.fireworks = (x, y, z, xd, yd, zd, ex) => bursts.push({ x, y, z, xd, yd, zd, ex });
const heard = (n) => sounds.filter((s) => s.name === n);
const tick = (n = 1) => ticks(level, n);
const player = new m.Player(level);
player.moveTo(0.5, G, 0.5, 0, 0);
level.player = player;
level.addEntity(player);
player.setGameMode('survival');
const live = (cls) => level.entities.filter((e) => !e.removed && (!cls || e instanceof cls));
const clear = () => { for (const e of level.entities) if (e !== player) e.removed = true; tick(); sounds.length = 0; particles.length = 0; bursts.length = 0; };

// --- lifetime (vanilla: 10 × (flight + 1) + nextInt(6) + nextInt(7))
player.moveTo(-40.5, G, -40.5, 0, 0);
{
  let ok = true;
  const seen = {};
  for (const f of [0, 1, 2, 3]) {
    let lo = 1e9, hi = -1;
    for (let i = 0; i < 3000; i++) {
      const r = new m.FireworkRocket(level, 0, 100, 0, f === 1 ? stack('firework_rocket') : m.fireworkRocket(f));
      lo = Math.min(lo, r.lifetime);
      hi = Math.max(hi, r.lifetime);
    }
    seen[f] = `${lo}-${hi}`;
    ok &&= lo === 10 * (f + 1) && hi === 10 * (f + 1) + 11;
  }
  check('lifetimes: flight 0 → 10-21, 1 → 20-31, 2 → 30-41, 3 → 40-51 ticks', ok, JSON.stringify(seen));
  const seq = [0.999, 0.999];
  check('the two rolls: up to 5 and up to 6', m.rocketLifetime(1, () => seq.shift() ?? 0) === 31 && m.rocketLifetime(2, () => 0) === 30);
  // the tick it goes off on
  const r = new m.FireworkRocket(level, 0.5, G + 10, 0.5, stack('firework_rocket'), player);
  r.lifetime = 25;
  level.addEntity(r);
  let n = 0;
  while (!r.removed && n < 100) { tick(); n++; }
  check('it goes off on the tick its life passes its lifetime (lifetime + 1 ticks)', n === 26, `${n}`);
  clear();
}

// --- flight
{
  const r = new m.FireworkRocket(level, 0.5, G + 1, 0.5, stack('firework_rocket'), player);
  r.dx = 0.002;
  r.dz = -0.001;
  r.lifetime = 60;
  level.addEntity(r);
  const y0 = r.y;
  tick();
  check('first tick: the launch sound (volume 3), a spark trailing', heard('entity.firework_rocket.launch').length === 1 && heard('entity.firework_rocket.launch')[0].volume === 3 && particles.filter((p) => p.kind === 'firework').length === 1);
  tick(19);
  // up: 0.05 + 0.04 k over 20 ticks = 1 + 0.02·20·21 = 9.4; across ×1.15 a tick
  check('it rises 0.04 a tick faster each tick: 9.4 blocks in 20 ticks', near(r.y - y0, 9.4, 1e-9) && near(r.dy, 0.05 + 0.04 * 20, 1e-12), `${(r.y - y0).toFixed(6)} ${r.dy}`);
  check('its drift grows by 15 % a tick', near(r.dx, 0.002 * 1.15 ** 20, 1e-12) && near(r.dz, -0.001 * 1.15 ** 20, 1e-12));
  check('one launch sound, a spark every tick', heard('entity.firework_rocket.launch').length === 1 && particles.filter((p) => p.kind === 'firework').length === 20);
  clear();
  // under a roof: it sticks, keeps its speed, and goes off where it is
  level.setBlock(0, G + 4, 0, m.S('stone'));
  const u = new m.FireworkRocket(level, 0.5, G + 1, 0.5, stack('firework_rocket'), player);
  u.dx = u.dz = 0;
  u.lifetime = 30;
  level.addEntity(u);
  tick(20);
  check('under a roof: held under it (no stars: not set off by it), still speeding up', !u.removed && near(u.bb.maxY, G + 4, 1e-6) && u.dy > 0.8, `${u.bb.maxY} ${u.dy}`);
  tick(11);
  check('...and at the end, a puff (two to four poofs), no burst, no harm', u.removed && particles.filter((p) => p.kind === 'poof').length >= 2 && particles.filter((p) => p.kind === 'poof').length <= 4 && !bursts.length);
  const s = new m.FireworkRocket(level, 0.5, G + 1, 0.5, m.fireworkRocket(1, [X('small_ball', [RED])]), player);
  s.dx = s.dz = 0;
  s.lifetime = 30;
  level.addEntity(s);
  let n = 0;
  while (!s.removed && n < 40) { tick(); n++; }
  // (2.25 up after nine ticks, 2.7 after ten: its next move, 0.45 more from its feet, reaches the roof)
  check('with a star it goes off on the roof, the tick its next move would take it there', s.removed && n === 10 && bursts.length === 1 && near(s.y, G + 3.7, 1e-9), `${n} ${s.y}`);
  level.setBlock(0, G + 4, 0, 0);
  clear();
  // the puffs' count over many rockets (vanilla's loop redraws its bound: 2 a third of the time, 3 four ninths, 4 two ninths)
  const count = { 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < 900; i++) {
    const q = new m.FireworkRocket(level, 0.5, G + 30, 0.5, stack('firework_rocket'));
    particles.length = 0;
    q.explode();
    count[particles.filter((p) => p.kind === 'poof').length]++;
  }
  check('the puffs: 2, 3 or 4, about 1/3, 4/9, 2/9', near(count[2] / 900, 1 / 3, 0.06) && near(count[3] / 900, 4 / 9, 0.06) && near(count[4] / 900, 2 / 9, 0.06), JSON.stringify(count));
  clear();
  // shot at an angle: straight on
  const a = m.FireworkRocket.shot(level, stack('firework_rocket'), 0.5, G + 20, 0.5, player);
  a.shoot(1, 0, 0, 1.6, 0);
  a.lifetime = 40;
  level.addEntity(a);
  tick(10);
  check('shot at an angle: a straight line, no rise, no speeding up', near(a.x, 0.5 + 16, 1e-9) && near(a.y, G + 20, 1e-9) && near(a.dx, 1.6, 1e-12) && a.dy === 0 && a.shotAtAngle, `${a.x} ${a.y}`);
  clear();
}

// --- the explosion's damage
{
  const pig = (x, z = 0.5, y = G) => {
    const e = new m.Pig(level);
    e.moveTo(x, y, z, 0, 0);
    level.addEntity(e);
    return e;
  };
  const at = [0.5, G + 1, 0.5];
  const boom = (stars, owner = player) => {
    const r = new m.FireworkRocket(level, ...at, m.fireworkRocket(1, Array.from({ length: stars }, () => X('small_ball', [RED]))), owner);
    level.addEntity(r);
    r.explode();
    return r;
  };
  const pigs = [pig(0.5), pig(2.5), pig(4.5), pig(5.5), pig(-3.5, 0.5, G + 4)];
  const d = pigs.map((p) => Math.hypot(p.x - at[0], p.y - at[1], p.z - at[2]));
  const r = boom(1);
  const want = (f, dd) => (dd > 5 ? 0 : f * Math.sqrt((5 - Math.fround(dd)) / 5));
  const lost = pigs.map((p) => 10 - p.health);
  check('one star: 7 × √((5 - d) / 5) to each living thing within 5 blocks, none beyond', pigs.every((p, i) => near(lost[i], want(7, d[i]), 1e-4)) && lost[3] === 0 && lost[0] > 5, lost.map((x) => x.toFixed(3)).join(' ') + ' / ' + d.map((x, i) => want(7, x).toFixed(3)).join(' '));
  check('the burst set off where it was, with its stars and motion', bursts.length === 1 && bursts[0].ex.length === 1 && bursts[0].x === at[0] && r.removed);
  check('hurt by fireworks (an explosion to armour and blast protection), the one who set it off to blame', pigs[0].lastDamageSource === 'fireworks' && pigs[0].lastHurtByMob === player);
  for (const p of pigs) p.remove();
  clear();
  const three = [pig(2.5), pig(0.5, 3.5)];
  boom(3);
  check('three stars: 11 × √((5 - d) / 5)', three.every((p) => near(10 - p.health, want(11, Math.hypot(p.x - at[0], p.y - at[1], p.z - at[2])), 1e-4)));
  for (const p of three) p.remove();
  clear();
  // out of sight: a wall two high between
  for (const y of [G, G + 1, G + 2]) level.setBlock(2, y, 0, m.S('stone'));
  const hidden = pig(3.5), seenP = pig(0.5, 3.5);
  boom(1);
  check('a wall in the way: unhurt; round the corner in the open: hurt', hidden.health === 10 && seenP.health < 10);
  for (const y of [G, G + 1, G + 2]) level.setBlock(2, y, 0, 0);
  hidden.remove();
  seenP.remove();
  clear();
  // feet hidden, middle seen: still hurt (vanilla looks at both)
  level.setBlock(3, G, 0, m.S('stone_slab'));
  const half = pig(4.5, 0.5);
  const r2 = new m.FireworkRocket(level, 0.5, G + 1, 0.5, m.fireworkRocket(1, [X('small_ball', [RED])]), player);
  level.addEntity(r2);
  const feet = m.clipBlocks(world, 0.5, G + 1, 0.5, 4.5, G, 0.5), mid = m.clipBlocks(world, 0.5, G + 1, 0.5, 4.5, G + 0.45, 0.5);
  r2.explode();
  check('feet behind a slab, middle in view: hurt', !!feet && !mid && half.health < 10, `${!!feet} ${!!mid} ${half.health}`);
  level.setBlock(3, G, 0, 0);
  half.remove();
  clear();
  // no stars: nothing hurt
  const safe = pig(1.5);
  const q = new m.FireworkRocket(level, ...at, stack('firework_rocket'), player);
  level.addEntity(q);
  q.explode();
  check('no stars: nobody hurt, no burst', safe.health === 10 && !bursts.length);
  safe.remove();
  clear();
}

// --- the elytra boost
const gliding = (y = 200, x = -30.5, pitch = 0) => {
  player.moveTo(x, y, 0.5, -90, pitch);
  player.dx = player.dy = player.dz = 0;
  player.inventory.armor[2] = stack('elytra');
  player.health = 20;
  player.fallDistance = 0;
  // (moved up off the ground: it isn't on it any more, as its next move would find)
  player.onGround = false;
  player.fallFlying = true;
  player.invulnerableTime = 0;
};
const inter = new m.Interaction(level, player);
const useHeld = () => {
  inter.pick(player.x, player.y + player.eyeHeight, player.z, player.yaw, player.pitch);
  inter.rightClickDelay = 0;
  inter.use(true, false);
};
{
  const hold = (s) => { player.inventory.main[0] = s; player.inventory.selected = 0; };
  // not gliding: nothing
  player.moveTo(-30.5, 150, 0.5, -90, 0);
  player.fallFlying = false;
  hold(stack('firework_rocket', 5));
  useHeld();
  check('used in the air without gliding: nothing happens', !live(m.FireworkRocket).length && player.inventory.main[0].count === 5);
  // gliding level: the curve, against vanilla's formulas worked through here (the glide's own step, then the push)
  gliding();
  tick();
  hold(stack('firework_rocket', 5));
  useHeld();
  const r = live(m.FireworkRocket)[0];
  check('used while gliding: a rocket fixed to the glider, one used up', r && r.attachedTo === player && player.inventory.main[0].count === 4 && !r.shotAtAngle);
  r.lifetime = 30;
  const model = { dx: player.dx, dy: player.dy, dz: player.dz, pitch: player.pitch, yaw: player.yaw, fallDistance: 0, horizontalCollision: false, onGround: false, fallFlying: true, type: 'model', x: 0, y: 0, z: 0, level: { sound: { play() {} } }, move() {}, hurt() {} };
  const L = m.viewVector(player.pitch, player.yaw);
  let worst = 0;
  const speeds = [];
  let boosted = 0, side = null;
  for (let i = 0; i < 45; i++) {
    const alive = !r.removed;
    tick();
    // (vanilla LivingEntity.aiStep: first any part of the motion under 0.003 is dropped)
    for (const k of ['dx', 'dy', 'dz']) if (Math.abs(model[k]) < 0.003) model[k] = 0;
    m.travelFallFlying(model, 0.08);
    if (alive) {
      boosted++;
      model.dx += L[0] * 0.1 + (L[0] * 1.5 - model.dx) * 0.5;
      model.dy += L[1] * 0.1 + (L[1] * 1.5 - model.dy) * 0.5;
      model.dz += L[2] * 0.1 + (L[2] * 1.5 - model.dz) * 0.5;
    }
    worst = Math.max(worst, Math.abs(player.dx - model.dx), Math.abs(player.dy - model.dy), Math.abs(player.dz - model.dz));
    if (i === 0) side = [r.x - player.x, r.y - player.y, r.z - player.z];
    speeds.push(Math.hypot(player.dx, player.dy, player.dz));
  }
  check('level: every tick as vanilla works it out (the glide, then the push along the look)', worst < 1e-9, `off by ${worst}`);
  check('it pushes for its whole life (31 ticks) and then it is gone', boosted === 31 && r.removed, `${boosted}`);
  // (facing east, the right hand is to the south: half a block along 10° off south)
  check('it rides out by the right hand that holds the rockets', near(side[0], 0.5 * Math.sin(10 * Math.PI / 180), 1e-9) && side[1] === 0 && near(side[2], 0.5 * Math.cos(10 * Math.PI / 180), 1e-9), side.join());
  // (steady: the push leaves 0.5 v + 0.85 of the glide's 0.99 v: about 1.69 a tick, 34 blocks a second)
  check('from a standstill to about 1.69 blocks a tick in a second or so, then easing off after', speeds[9] > 1.5 && near(speeds[29], 1.69, 0.02) && speeds[44] < speeds[30] - 0.05, speeds.filter((_, i) => i % 5 === 4).map((s) => s.toFixed(3)).join(' '));
  check('a plain rocket: no harm to the glider, a puff', player.health === 20 && !bursts.length);
  // climbing
  clear();
  gliding(150, -30.5, -40);
  const y0 = player.y;
  hold(stack('firework_rocket', 5));
  useHeld();
  live(m.FireworkRocket)[0].lifetime = 20;
  tick(21);
  check('looking 40° up: it climbs', player.y - y0 > 8 && player.dy > 0.5, `${(player.y - y0).toFixed(2)} ${player.dy.toFixed(3)}`);
  // with stars: it hurts the glider
  clear();
  gliding(150, -30.5, 0);
  hold(m.fireworkRocket(1, [X('small_ball', [RED]), X('burst', [BLUE])], 2));
  useHeld();
  const rs = live(m.FireworkRocket)[0];
  rs.lifetime = 5;
  tick(6);
  check('with two stars: 9 to the glider when it goes off (5 + 2 a star)', rs.removed && near(20 - player.health, 9, 1e-6) && bursts.length === 1, `${20 - player.health}`);
  // creative keeps it
  clear();
  player.setGameMode('creative');
  gliding(150, -30.5, 0);
  hold(stack('firework_rocket', 5));
  useHeld();
  check('creative: none used up', live(m.FireworkRocket).length === 1 && player.inventory.main[0].count === 5);
  player.setGameMode('survival');
  // the offhand
  clear();
  gliding(150, -30.5, 0);
  hold(null);
  player.inventory.offhand = stack('firework_rocket', 2);
  useHeld();
  check('from the offhand: the same', live(m.FireworkRocket)[0]?.attachedTo === player && player.inventory.offhand.count === 1);
  tick();
  const ro = live(m.FireworkRocket)[0];
  check('...riding out by the left hand', ro && near(ro.x - player.x, 0.5 * Math.sin(10 * Math.PI / 180), 1e-9) && near(ro.z - player.z, -0.5 * Math.cos(10 * Math.PI / 180), 1e-9), ro && `${ro.x - player.x} ${ro.z - player.z}`);
  player.inventory.offhand = null;
  tick();
  check('...and with no rocket left in hand, at the glider itself', ro.x === player.x && ro.z === player.z);
  player.inventory.offhand = null;
  clear();
  player.fallFlying = false;
  player.inventory.armor[2] = null;
}

// --- used on a block: set off from the face clicked
{
  player.moveTo(0.5, G, 0.5, 0, 90);
  player.dx = player.dy = player.dz = 0;
  tick();
  player.inventory.main[0] = stack('firework_rocket', 3);
  player.inventory.selected = 0;
  useHeld();
  const r = live(m.FireworkRocket)[0];
  check('used on the ground: set off from the spot clicked, 0.15 out of the face', r && near(r.y, G + 0.15, 1e-9) && near(r.x, 0.5, 0.05) && near(r.z, 0.5, 0.05) && !r.shotAtAngle && !r.attachedTo, r && `${r.x} ${r.y} ${r.z}`);
  check('one used up, the hand swung', player.inventory.main[0].count === 2 && player.swinging);
  clear();
}

// --- crossbows
{
  const bow = (ench) => {
    const s = stack('crossbow');
    if (ench) s.tag = { enchantments: ench };
    return s;
  };
  const load = () => {
    useHeld();
    for (let i = 0; i < 27; i++) inter.tickUsingItem();
    inter.releaseUsingItem();
  };
  player.moveTo(0.5, G, 0.5, -90, 0);
  const star = m.fireworkRocket(2, [X('small_ball', [RED])], 3);
  player.inventory.main[0] = bow();
  player.inventory.selected = 0;
  player.inventory.offhand = star;
  load();
  const c = player.inventory.main[0];
  check('a rocket in the offhand loads (one of them)', c.tag?.charged?.length === 1 && c.tag.charged[0].id === 'firework_rocket' && c.tag.charged[0].tag?.fireworks?.flightDuration === 2 && player.inventory.offhand.count === 2);
  check('loaded: the firework model, shot at 1.6', m.crossbowTexture(c, -1) === 'crossbow_firework' && m.shootingPower(c) === 1.6);
  const eye = player.y + player.eyeHeight;
  useHeld();
  const r = live(m.FireworkRocket)[0];
  const v = r && Math.hypot(r.dx, r.dy, r.dz);
  check('fired: a rocket shot at an angle from 0.15 below the eyes, the way it looks, at 1.6', r && r.shotAtAngle && near(r.y, eye - 0.15, 1e-9) && near(v, 1.6, 0.06) && r.dx > 1.5 && r.owner === player, r && `${r.y} ${v}`);
  check('the crossbow worn by 3, emptied, its shot sound', c.damage === 3 && !c.tag.charged && heard('item.crossbow.shoot').length === 1);
  check('the rocket keeps its stars, and its launch sound follows', r.explosions().length === 1 && (tick(), heard('entity.firework_rocket.launch').length === 1));
  clear();
  // multishot: three, one used
  player.inventory.main[0] = bow({ multishot: 1 });
  player.inventory.offhand = stack('firework_rocket', 4);
  load();
  check('multishot: three loaded, one used', player.inventory.main[0].tag.charged.length === 3 && player.inventory.offhand.count === 3);
  useHeld();
  check('...three fired, 9 durability', live(m.FireworkRocket).length === 3 && player.inventory.main[0].damage === 9);
  clear();
  // the main hand, with the crossbow in the other
  player.inventory.offhand = bow();
  player.inventory.main[0] = stack('firework_rocket', 2);
  load();
  check('crossbow in the offhand: a rocket in the main hand loads', player.inventory.offhand.tag?.charged?.[0]?.id === 'firework_rocket' && player.inventory.main[0].count === 1);
  // in the bag only: not loaded (the inventory is searched for arrows only)
  player.inventory.offhand = null;
  player.inventory.main[0] = bow();
  player.inventory.main[5] = stack('firework_rocket', 8);
  useHeld();
  check('rockets only in the inventory: nothing to load', !player.isUsingItem() && !player.inventory.main[0].tag?.charged);
  player.inventory.main[5] = null;
  // what a shot rocket hits
  clear();
  const pig = new m.Pig(level);
  pig.moveTo(-6.5, G, 0.5, 0, 0);
  level.addEntity(pig);
  player.inventory.main[0] = bow();
  player.inventory.offhand = m.fireworkRocket(1, [X('small_ball', [RED])], 1);
  player.moveTo(0.5, G, 0.5, 90, 5);
  load();
  useHeld();
  let n = 0;
  while (live(m.FireworkRocket).length && n < 30) { tick(); n++; }
  check('shot at a pig: it goes off on hitting it, and hurts it', n < 8 && bursts.length === 1 && pig.health < 10 && pig.lastDamageSource === 'fireworks', `${n} ${pig.health}`);
  pig.remove();
  clear();
  // at a wall: with a star it goes off there; without, it sits against it till its time is up
  for (let y = G; y < G + 4; y++) level.setBlock(-6, y, 0, m.S('stone'));
  player.moveTo(0.5, G, 0.5, 90, 0);
  player.inventory.offhand = m.fireworkRocket(1, [X('small_ball', [RED])], 1);
  load();
  useHeld();
  n = 0;
  while (live(m.FireworkRocket).length && n < 30) { tick(); n++; }
  check('at a wall, with a star: it goes off on hitting it', n < 8 && bursts.length === 1, `${n}`);
  clear();
  player.inventory.offhand = stack('firework_rocket', 1);
  load();
  useHeld();
  const w = live(m.FireworkRocket)[0];
  tick(8);
  check('without: it stays against the wall', !w.removed && w.bb.minX >= -5 - 1e-6 && w.x < -4, `${w.x}`);
  tick(w.lifetime);
  check('...and puffs when its time is up', w.removed && !bursts.length);
  for (let y = G; y < G + 4; y++) level.setBlock(-6, y, 0, 0);
  player.inventory.main[0] = null;
  player.inventory.offhand = null;
  clear();
}

// --- dispensers
{
  const pulse = (px, py, pz) => {
    place(m, level, 'redstone_block', px, py, pz);
    tick(6);
    level.setBlock(px, py, pz, 0);
    tick(1);
  };
  place(m, level, 'dispenser', 20, G, 20, { props: { facing: 'east' } });
  const be = world.getBlockEntity(20, G, 20);
  be.container.set(0, m.fireworkRocket(1, [X('large_ball', [RED])], 3));
  place(m, level, 'redstone_block', 19, G, 20);
  tick(5);
  const r = live(m.FireworkRocket)[0];
  const v = r && Math.hypot(r.dx, r.dy, r.dz);
  check('a dispenser shoots one out of its front at 0.5, at an angle, with its stars', r && r.shotAtAngle && near(v, 0.5, 0.03) && r.dx > 0.45 && !r.owner && r.explosions().length === 1 && be.container.get(0).count === 2, r && `${v}`);
  // (spawned poking out: its middle 0.37501 out and 0.125 down; its first tick is when the dispenser fires)
  check('from just out of its face, halfway down', r && near(r.z, 20.5, 0.03) && near(r.y - r.life * r.dy, G + 0.375, 0.01) && near(r.x - r.life * r.dx, 20.87501, 0.01), r && `${r.x} ${r.y} ${r.z} life ${r.life}`);
  const s = heard('entity.firework_rocket.shoot');
  check('the firework\'s own shoot sound (pitch 1.2), not the launch click', s.length === 1 && s[0].pitch === 1.2 && !heard('block.dispenser.launch').length && !heard('block.dispenser.dispense').length);
  level.setBlock(19, G, 20, 0);
  clear();
  place(m, level, 'dispenser', 24, G, 24, { props: { facing: 'up' } });
  world.getBlockEntity(24, G, 24).container.set(0, stack('firework_rocket'));
  pulse(23, G, 24);
  const u = live(m.FireworkRocket)[0];
  check('facing up: straight up', u && u.dy > 0.45 && Math.hypot(u.dx, u.dz) < 0.05 && near(u.x, 24.5, 0.03));
  clear();
}

// ---------------------------------------------------------------------------
// the burst (FireworkParticles.Starter), with the particle engine stood in for
{
  const fx = () => {
    const out = { sparks: [], flashes: [], tickers: [] };
    out.engine = {
      spark: (x, y, z, xd, yd, zd, c, f, trail, tw) => out.sparks.push({ xd, yd, zd, c, f, trail, tw }),
      flash: (x, y, z, c) => out.flashes.push(c),
      addTicker: (t) => out.tickers.push(t),
    };
    return out;
  };
  const snd = [];
  const lv = { player: { x: 0, y: 100, z: 0, eyeHeight: 1.62 }, sound: { play: (name, x, y, z, vol, pitch) => snd.push({ name, vol, pitch, at: tickNo }) } };
  let tickNo = 0;
  const run = (ex, at = [0, 101.62, 0], motion = [0, 0.5, 0]) => {
    const o = fx();
    snd.length = 0;
    tickNo = 0;
    const s = new m.FireworkStarter(o.engine, lv, ...at, ...motion, ex);
    let alive = true;
    // (as the particle engine runs them: what a ticker adds is first ticked the tick after)
    for (tickNo = 0; tickNo < 200 && (alive || o.tickers.length); tickNo++) {
      const pending = o.tickers.splice(0);
      if (alive) alive = s.tick();
      for (const t of pending) if (t.tick()) o.tickers.push(t);
    }
    o.lifetime = s.lifetime;
    return o;
  };
  const counts = ['small_ball', 'large_ball', 'star', 'creeper', 'burst'].map((sh) => run([X(sh, [RED])]).sparks.length);
  check('sparks: 98 small ball, 386 large ball, 121 star, 265 creeper, 70 burst', counts.join() === '98,386,121,265,70', counts.join());
  const speed = (o) => o.sparks.reduce((a, s) => a + Math.hypot(s.xd, s.yd, s.zd), 0) / o.sparks.length;
  check('balls thrown out at about 0.25 (small) and 0.5 (large)', near(speed(run([X('small_ball', [RED])])), 0.25, 0.03) && near(speed(run([X('large_ball', [RED])])), 0.5, 0.05));
  const st = run([X('star', [RED])]);
  check('a star\'s first spark straight up at 0.5', near(st.sparks[0].yd, 0.5, 1e-12) && st.sparks[0].xd === 0 && st.sparks[0].zd === 0);
  const bu = run([X('burst', [RED])], undefined, [0.4, 0.6, 0]);
  check('a burst follows half the rocket\'s motion, up and out', bu.sparks.every((s) => s.yd >= 0.3 && s.yd <= 0.8) && near(bu.sparks.reduce((a, s) => a + s.xd, 0) / 70, 0.2, 0.08));
  const col = run([X('small_ball', [RED, BLUE], [WHITE, LIME], true, true)]);
  check('each spark one of the colours and one of the fades, with the trail and twinkle', col.sparks.every((s) => (s.c === RED || s.c === BLUE) && (s.f === WHITE || s.f === LIME) && s.trail && s.tw) && col.sparks.some((s) => s.c === RED) && col.sparks.some((s) => s.c === BLUE));
  check('a flash per star in its first colour; no colour: black', col.flashes.join() === String(RED) && run([X('small_ball', [])]).flashes.join() === String(BLACK) && run([X('small_ball', [])]).sparks.every((s) => s.c === BLACK && s.f === -1));
  const two = run([X('small_ball', [RED]), X('burst', [BLUE])]);
  check('two stars two ticks apart, then done (lifetime 3)', two.lifetime === 3 && two.flashes.join() === `${RED},${BLUE}`);
  // sounds: near, far, large, twinkle, the delay
  let o = run([X('small_ball', [RED])]);
  check('near: the blast, at volume 20, pitch 0.95-1.05, straight away', snd.length === 1 && snd[0].name === 'entity.firework_rocket.blast' && snd[0].vol === 20 && snd[0].pitch >= 0.95 && snd[0].pitch <= 1.05 && snd[0].at === 0);
  o = run([X('small_ball', [RED])], [0, 101.62, 20]);
  check('20 blocks off: the far blast, ten ticks late (half a tick a block)', snd.length === 1 && snd[0].name === 'entity.firework_rocket.blast_far' && snd[0].at === 10, JSON.stringify(snd));
  run([X('large_ball', [RED])]);
  check('a large ball: the large blast', snd[0]?.name === 'entity.firework_rocket.large_blast');
  run([X('small_ball', [RED]), X('small_ball', [RED]), X('burst', [RED])], [0, 101.62, 60]);
  check('three stars, 60 off: the large far blast, 30 ticks late', snd[0]?.name === 'entity.firework_rocket.large_blast_far' && snd[0].at === 30, JSON.stringify(snd));
  o = run([X('small_ball', [RED], [], false, true), X('burst', [BLUE])]);
  check('a twinkling star: fifteen ticks more, then the twinkle (pitch 0.9-1.05)', o.lifetime === 18 && snd.length === 2 && snd[1].name === 'entity.firework_rocket.twinkle' && snd[1].at === 18 && snd[1].pitch >= 0.9 && snd[1].pitch <= 1.05, JSON.stringify(snd));
  run([X('small_ball', [RED], [], false, true)], [0, 101.62, 16]);
  check('...from 16 blocks: the far twinkle', snd[1]?.name === 'entity.firework_rocket.twinkle_far');
}

// --- the particles themselves (render/particles.ts)
{
  const pe = new m.ParticleEngine({ sprites: {} }, world, () => 0xffffff);
  const list = () => pe.sprites;
  pe.spark(0.5, G + 30, 0.5, 0, 0, 0, RED, WHITE, false, false);
  const p = list()[0];
  check('a spark: 48-59 ticks, gravity 0.1, friction 0.91, glowing, its colour', p.lifetime >= 48 && p.lifetime <= 59 && p.gravity === 0.1 && p.friction === 0.91 && p.fullBright && near(p.r, 0xb3 / 255, 1e-9) && p.alpha === 0.99);
  const half = Math.floor(p.lifetime / 2);
  for (let i = 0; i < half + 3; i++) pe.tick();
  check('past half its life: fading out, its colour going over to the fade', p.alpha < 0.99 && p.g > 0x31 / 255 + 0.1);
  pe.clear();
  pe.spark(0.5, G + 30, 0.5, 0.3, 0, 0, BLUE, -1, true, false);
  const t = list()[0];
  for (let i = 0; i < 6; i++) pe.tick();
  const trail = list().filter((q) => q !== t);
  check('a trailing spark leaves a still spark every other tick, its colour, already half through its life', trail.length === 3 && trail.every((q) => q.dx === 0 && q.b === t.b && q.age >= Math.floor(q.lifetime / 2) && !q.fade), `${trail.length}`);
  pe.clear();
  pe.flash(0.5, G + 30, 0.5, LIME);
  const f = list()[0];
  let n = 0;
  while (list().length && n < 10) { pe.tick(); n++; }
  check('a flash lasts four ticks (gone on the fifth), in its colour', n === 5 && near(f.g, 0xcd / 255, 1e-9));
  pe.clear();
  for (let i = 0; i < 20000; i++) pe.spark(0.5, G + 30, 0.5, 0, 0, 0);
  pe.tick();
  check('at most 16384 at once, the oldest dropped', list().length === 16384);
  pe.clear();
  // the plain FIREWORK type, as a rocket trails it
  pe.spawn('firework', 0.5, G + 30, 0.5, 0, -0.2, 0);
  check('the rocket\'s trail: a white spark', list().length === 1 && list()[0].r === 1 && !list()[0].spark.trail);
  const run2 = [];
  pe.addTicker({ tick: () => (run2.push(1), run2.length < 3) });
  for (let i = 0; i < 5; i++) pe.tick();
  check('tickers run until they say they are done', run2.length === 3);
}

// --- a rocket saved and loaded
{
  const r = m.FireworkRocket.shot(level, m.fireworkRocket(3, [X('creeper', [LIME], [], true)]), 1.5, G + 5, 1.5, player);
  r.life = 7;
  const d = JSON.parse(JSON.stringify(m.saveEntity(r)));
  const back = m.loadEntity(d, level);
  check('saved with its chunk and loaded: life, lifetime, its stars, shot at an angle', back instanceof m.FireworkRocket && back.life === 7 && back.lifetime === r.lifetime && back.shotAtAngle && back.explosions()[0]?.shape === 'creeper' && m.isChunkSaved(r), JSON.stringify(d.data));
}

await exitWithStatus(close);
