// Headless checks for potions and brewing (node tests/potions/potions.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/item/potions.ts', '/src/entity/thrownPotion.ts',
  '/src/entity/arrow.ts', '/src/world/blockEntity.ts', '/src/inventory/menus.ts', '/src/game/itemBehavior.ts', '/src/game/blockBehavior.ts',
  '/src/entity/trading.ts', '/src/game/advancements.ts', '/src/item/crossbow.ts', '/src/entity/effects.ts', '/src/inventory/recipes.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, P, tp, arrowMod, beMod, menus, ib, bb, trading, adv, xbow, fx, recipes] = mods;
const { ItemStack } = itemMod;
const { S, BLOCKS, STATE_BLOCK, getBlock } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const nameAt = (w, x, y, z) => BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name;
const hex = (n) => '0x' + (n >>> 0).toString(16).padStart(6, '0');

function makeLevel() {
  const world = new worldMod.World();
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {} };
  const gs = S('grass_block');
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; }
  level.dayTime = 6000;
  return { world, level, sounds };
}
const player = (level, mode = 'survival') => { const p = new playerMod.Player(level); p.gameMode = mode; p.moveTo(0.5, 64, 0.5, 0, 0); level.addEntity(p); return p; };
const mob = (level, type, x, z) => { const m = spawner.createMob(type, level); m.moveTo(x, 64, z, 0, 0); level.addEntity(m); return m; };
const lines = (s) => { const l = []; s.item.hoverText?.(s, l); return l; };

// --- names, tooltips, colours
{
  const n = (item, p) => P.potionStack(item, p).displayName();
  check('water bottle names', n('potion', 'water') === 'Water Bottle' && n('splash_potion', 'water') === 'Splash Water Bottle' && n('lingering_potion', 'water') === 'Lingering Water Bottle' && n('tipped_arrow', 'water') === 'Arrow of Splashing');
  check('base potion names', n('potion', 'awkward') === 'Awkward Potion' && n('splash_potion', 'mundane') === 'Mundane Splash Potion' && n('lingering_potion', 'thick') === 'Thick Lingering Potion' && n('tipped_arrow', 'awkward') === 'Tipped Arrow', `${n('splash_potion', 'mundane')} / ${n('tipped_arrow', 'awkward')}`);
  check('effect potion names', n('potion', 'strong_swiftness') === 'Potion of Swiftness' && n('splash_potion', 'long_night_vision') === 'Splash Potion of Night Vision' && n('lingering_potion', 'turtle_master') === 'Lingering Potion of the Turtle Master' && n('tipped_arrow', 'poison') === 'Arrow of Poison', `${n('lingering_potion', 'turtle_master')}`);
  check('uncraftable names', ItemStack.of('potion').displayName() === 'Uncraftable Potion' && ItemStack.of('tipped_arrow').displayName() === 'Uncraftable Tipped Arrow', ItemStack.of('potion').displayName());
  const sw = lines(P.potionStack('potion', 'strong_swiftness'));
  check('Swiftness II tooltip', sw[0] === '§9Speed II (01:30)' && sw[2] === '§5When Applied:' && sw[3] === '§9+40% Speed', JSON.stringify(sw));
  check('lingering lasts a quarter', lines(P.potionStack('lingering_potion', 'long_swiftness'))[0] === '§9Speed (02:00)', lines(P.potionStack('lingering_potion', 'long_swiftness'))[0]);
  check('tipped arrow an eighth', lines(P.potionStack('tipped_arrow', 'long_swiftness'))[0] === '§9Speed (01:00)', lines(P.potionStack('tipped_arrow', 'long_swiftness'))[0]);
  check('harmful in red, instant with no time', lines(P.potionStack('potion', 'strong_harming'))[0] === '§cInstant Damage II', lines(P.potionStack('potion', 'strong_harming'))[0]);
  check('water has no effects', lines(P.potionStack('potion', 'water'))[0] === '§7No Effects');
  const tm = lines(P.potionStack('potion', 'turtle_master'));
  check('turtle master: slowness IV and resistance III', tm[0] === '§cSlowness IV (00:20)' && tm[1] === '§9Resistance III (00:20)' && tm.includes('§c-60% Speed'), JSON.stringify(tm));
  check('water colour', P.potionColor({ potion: 'water' }) === 0x385dc6, hex(P.potionColor({ potion: 'water' })));
  check('swiftness colour (speed)', P.potionColor({ potion: 'swiftness' }) === 0x33ebff, hex(P.potionColor({ potion: 'swiftness' })));
  check('awkward: the base colour', P.potionColor({ potion: 'awkward' }) === 0x385dc6);
  check('46 potions', P.POTIONS.size === 46, `${P.POTIONS.size}`);
  const creative = ItemStack.of('potion').item.creativeStacks();
  check('one creative stack per potion', creative.length === 46 && creative[0].displayName() === 'Water Bottle');
}

// --- brewing mixes
{
  const mix = (reagent, item, potion) => { const r = P.brewMix(ItemStack.of(reagent), P.potionStack(item, potion)); return r ? `${r.item.id}:${P.contentsOf(r)?.potion}` : null; };
  check('water + nether wart → awkward', mix('nether_wart', 'potion', 'water') === 'potion:awkward');
  check('water + redstone → mundane, + glowstone → thick', mix('redstone', 'potion', 'water') === 'potion:mundane' && mix('glowstone_dust', 'potion', 'water') === 'potion:thick');
  check('awkward + sugar → swiftness', mix('sugar', 'potion', 'awkward') === 'potion:swiftness');
  check('swiftness + redstone / glowstone', mix('redstone', 'potion', 'swiftness') === 'potion:long_swiftness' && mix('glowstone_dust', 'potion', 'swiftness') === 'potion:strong_swiftness');
  check('fermented spider eye corrupts', mix('fermented_spider_eye', 'potion', 'swiftness') === 'potion:slowness' && mix('fermented_spider_eye', 'potion', 'night_vision') === 'potion:invisibility');
  check('gunpowder → splash, dragon breath → lingering', mix('gunpowder', 'potion', 'strong_healing') === 'splash_potion:strong_healing' && mix('dragon_breath', 'splash_potion', 'poison') === 'lingering_potion:poison');
  check('no gunpowder on a splash one', !P.hasMix(P.potionStack('splash_potion', 'poison'), ItemStack.of('gunpowder')));
  check('1.21 potions', mix('breeze_rod', 'potion', 'awkward') === 'potion:wind_charged' && mix('cobweb', 'potion', 'awkward') === 'potion:weaving' && mix('stone', 'potion', 'awkward') === 'potion:infested');
  check('turtle master from the shell', mix('turtle_helmet', 'potion', 'awkward') === 'potion:turtle_master');
  check('ingredients', P.isBrewingIngredient(ItemStack.of('nether_wart')) && P.isBrewingIngredient(ItemStack.of('gunpowder')) && !P.isBrewingIngredient(ItemStack.of('dirt')));
}

// --- the brewing stand
{
  const { level, sounds } = makeLevel();
  level.setBlock(0, 64, 0, S('brewing_stand'));
  const be = new beMod.BrewingStandBlockEntity(0, 64, 0);
  const c = be.container;
  for (let i = 0; i < 3; i++) c.items[i] = P.potionStack('potion', 'water');
  c.items[3] = ItemStack.of('nether_wart', 2);
  c.items[4] = ItemStack.of('blaze_powder', 1);
  be.tick(level);
  check('blaze powder lights it (20 brews, one used)', be.fuel === 19 && !c.items[4] && be.brewTime === 400, `fuel ${be.fuel} brew ${be.brewTime}`);
  for (let t = 0; t < 400; t++) be.tick(level);
  const out = [0, 1, 2].map((i) => P.contentsOf(c.items[i])?.potion);
  check('400 ticks later: three awkward potions', out.every((p) => p === 'awkward'), out.join());
  check('one wart used', c.items[3]?.count === 1);
  check('the brew sound', sounds.includes('block.brewing_stand.brew'));
  // an ingredient taken away stops the brew
  c.items[3] = ItemStack.of('sugar', 1);
  be.tick(level);
  const started = be.brewTime;
  c.items[3] = ItemStack.of('redstone', 1);
  be.tick(level);
  check('changing the ingredient stops the brew', started === 400 && be.brewTime === 0, `${started} → ${be.brewTime}`);
  // dragon's breath leaves its bottle
  for (let i = 0; i < 3; i++) c.items[i] = P.potionStack('splash_potion', 'poison');
  c.items[3] = ItemStack.of('dragon_breath', 1);
  for (let t = 0; t < 402; t++) be.tick(level);
  check('dragon breath: lingering potions and an empty bottle back', [0, 1, 2].every((i) => c.items[i]?.item.id === 'lingering_potion') && c.items[3]?.item.id === 'glass_bottle', c.items[3]?.item.id);
  // the menu: taking a brewed potion is Local Brewery
  const p = player(level);
  const m = new menus.BrewingStandMenu(p, be);
  let brewed = null;
  m.onBrewed = (id) => (brewed = id);
  const st = m.slots[0].item;
  m.slots[0].onTake(p, st);
  check('taking a potion out: brewed_potion', brewed === 'poison', `${brewed}`);
  const pa = new adv.PlayerAdvancements();
  pa.trigger('brewed_potion', { potion: 'poison' });
  check('Local Brewery', pa.isDone(adv.ADVANCEMENTS.get('nether/brew_potion')));
  // shift-click: blaze powder goes to the fuel slot, a bottle to a potion slot
  c.items[4] = null; c.items[0] = null;
  p.inventory.main[9] = ItemStack.of('blaze_powder', 3);
  p.inventory.main[10] = P.potionStack('potion', 'water');
  const idx = (inv) => m.slots.findIndex((s) => s.container !== c && s.getContainerSlot?.() === inv);
  const slotOf = (item) => m.slots.findIndex((s) => s.container !== c && s.item === item);
  m.quickMoveStack(p, slotOf(p.inventory.main[9]));
  check('shift-click: blaze powder to fuel', c.items[4]?.item.id === 'blaze_powder' && c.items[4].count === 3, `${c.items[4]?.item.id}`);
  m.quickMoveStack(p, slotOf(p.inventory.main[10]));
  check('shift-click: a bottle to a potion slot', c.items[0]?.item.id === 'potion', `${c.items[0]?.item.id}`);
}

// --- drinking
{
  const { level } = makeLevel();
  const p = player(level);
  const s = P.potionStack('potion', 'fire_resistance');
  p.inventory.main[p.inventory.selected] = s;
  ib.itemBehaviorOf('potion').finishUsing(level, p, s);
  check('drunk: fire resistance 3:00', p.getEffect('fire_resistance')?.duration === 3600);
  check('an empty bottle in its place', p.inventory.selectedItem?.item.id === 'glass_bottle');
  p.health = 10;
  const h = P.potionStack('potion', 'strong_healing');
  p.inventory.main[p.inventory.selected] = h;
  ib.itemBehaviorOf('potion').finishUsing(level, p, h);
  check('healing II heals 8', p.health === 18, `${p.health}`);
  const c = player(level, 'creative');
  const cs = P.potionStack('potion', 'swiftness');
  c.inventory.main[c.inventory.selected] = cs;
  ib.itemBehaviorOf('potion').finishUsing(level, c, cs);
  check('in creative the potion stays', c.inventory.selectedItem === cs && c.getEffect('speed'));
}

// --- splashing
{
  const { level, sounds } = makeLevel();
  const p = player(level);
  const cow = mob(level, 'cow', 5.5, 5.5);
  const near = mob(level, 'cow', 7.5, 5.5);
  const t = new tp.ThrownPotion(level, p, P.potionStack('splash_potion', 'poison'));
  t.moveTo(5.5, 64, 5.5, 0, 0);
  t.onHit(5.5, 64, 5.5, cow);
  check('struck: the whole 0:45', cow.getEffect('poison')?.duration === 900, `${cow.getEffect('poison')?.duration}`);
  check('2 blocks off: half of it', near.getEffect('poison')?.duration === 450, `${near.getEffect('poison')?.duration}`);
  check('the bottle breaks', t.removed && sounds.includes('entity.splash_potion.break'));
  const far = mob(level, 'cow', 10.5, 5.5);
  const t2 = new tp.ThrownPotion(level, p, P.potionStack('splash_potion', 'swiftness'));
  t2.moveTo(5.5, 64, 5.5, 0, 0);
  t2.onHit(5.5, 64, 5.5, null);
  check('5 blocks off: untouched', !far.getEffect('speed'));
  // water puts a burning cow out
  cow.igniteForSeconds(5);
  const w = new tp.ThrownPotion(level, p, P.potionStack('splash_potion', 'water'));
  w.moveTo(6.5, 64, 5.5, 0, 0);
  w.onHit(6.5, 64, 5.5, null);
  check('water puts out the fire', !cow.isOnFire());
  // an enderman is hurt by water (and tries to teleport)
  const em = mob(level, 'enderman', 3.5, -3.5);
  const hp = em.health;
  const w2 = new tp.ThrownPotion(level, p, P.potionStack('splash_potion', 'water'));
  w2.moveTo(3.5, 64, -3.5, 0, 0);
  w2.onHit(3.5, 64, -3.5, null);
  check('water hurts an enderman', em.health < hp, `${hp} → ${em.health}`);
  // splash harming on a zombie heals it (undead), on a cow hurts it
  const zb = mob(level, 'zombie', -6.5, -6.5);
  zb.health = 10;
  const hurtCow = mob(level, 'cow', -6.5, -4.5);
  const hm = new tp.ThrownPotion(level, p, P.potionStack('splash_potion', 'harming'));
  hm.moveTo(-6.5, 64, -6.5, 0, 0);
  hm.onHit(-6.5, 64, -6.5, zb);
  check('harming heals the undead', zb.health > 10, `${zb.health}`);
  check('and hurts the living (2 blocks: half of 6)', hurtCow.health === hurtCow.maxHealth - 3, `${hurtCow.health}/${hurtCow.maxHealth}`);
}

// --- water bottles: mud, cauldrons, filling
{
  const { level, world } = makeLevel();
  const p = player(level);
  world.setState(2, 64, 2, S('dirt'));
  const wb = P.potionStack('potion', 'water');
  p.inventory.main[p.inventory.selected] = wb;
  const r = ib.itemBehaviorOf('potion').useOn(level, p, wb, { x: 2, y: 64, z: 2, face: 1, state: world.getState(2, 64, 2) });
  check('a water bottle on dirt makes mud', r === 'success' && nameAt(world, 2, 64, 2) === 'mud' && p.inventory.selectedItem?.item.id === 'glass_bottle');
  world.setState(4, 64, 4, S('cauldron'));
  const ctx = { player: p, hand: 'main' };
  const wb2 = P.potionStack('potion', 'water');
  p.inventory.main[p.inventory.selected] = wb2;
  bb.behaviorOf(world.getState(4, 64, 4)).useItemOn(level, 4, 64, 4, world.getState(4, 64, 4), wb2, ctx);
  const lvl = () => { const st = world.getState(4, 64, 4); return nameAt(world, 4, 64, 4) === 'water_cauldron' ? BLOCKS[STATE_BLOCK[st]].get(st, 'level') : 0; };
  check('a bottle in an empty cauldron: a third full', lvl() === 1, `${nameAt(world, 4, 64, 4)} ${lvl()}`);
  const wb3 = P.potionStack('potion', 'water');
  p.inventory.main[p.inventory.selected] = wb3;
  bb.behaviorOf(world.getState(4, 64, 4)).useItemOn(level, 4, 64, 4, world.getState(4, 64, 4), wb3, ctx);
  check('another tops it up', lvl() === 2);
  const gb = ItemStack.of('glass_bottle');
  p.inventory.main[p.inventory.selected] = gb;
  bb.behaviorOf(world.getState(4, 64, 4)).useItemOn(level, 4, 64, 4, world.getState(4, 64, 4), gb, ctx);
  check('a glass bottle takes some back', lvl() === 1 && P.contentsOf(p.inventory.selectedItem)?.potion === 'water');
}

// --- tipped arrows
{
  const { level } = makeLevel();
  const p = player(level);
  const cow = mob(level, 'cow', 3.5, 3.5);
  const a = new arrowMod.Arrow(level, p);
  a.setPickupStack(P.potionStack('tipped_arrow', 'poison', 64));
  check('an arrow of poison is its colour', a.color === P.potionColor({ potion: 'poison' }));
  check('and picks up as itself, one', a.pickupItem.item.id === 'tipped_arrow' && a.pickupItem.count === 1 && P.contentsOf(a.pickupItem).potion === 'poison');
  a.doPostHurtEffects(cow);
  check('it poisons for an eighth (112 ticks)', cow.getEffect('poison')?.duration === 112, `${cow.getEffect('poison')?.duration}`);
  // 600 ticks in the ground, it's a plain arrow
  a.inGround = true;
  a.inGroundTime = 600;
  a.makeParticle = () => {};
  a.tickArrow = () => {};
  a.tick();
  check('after 30 s in the ground: a plain arrow', a.pickupItem.item.id === 'arrow' && a.color === -1);
  // crossbows load and shoot them
  const cb = ItemStack.of('crossbow');
  const ammo = P.potionStack('tipped_arrow', 'slowness', 3);
  const list = xbow.draw(cb, ammo, false);
  check('a crossbow loads a tipped arrow with its potion', list.length === 1 && list[0].id === 'tipped_arrow' && list[0].tag?.potion?.potion === 'slowness' && ammo.count === 2);
  cb.tag = { charged: list };
  const before = new Set(level.entities);
  xbow.performShooting(level, p, cb, 3.15, 1, null);
  const shot = level.entities.find((e) => !before.has(e) && e instanceof arrowMod.Arrow);
  check('and shoots it', shot && shot.pickupItem.item.id === 'tipped_arrow' && P.contentsOf(shot.pickupItem).potion === 'slowness' && shot.color === P.potionColor({ potion: 'slowness' }));
  // crafting: 8 arrows round a lingering potion
  const cm = new menus.CraftingMenu(p, [0, 64, 0]);
  for (let i = 0; i < 9; i++) cm.craft.items[i] = i === 4 ? P.potionStack('lingering_potion', 'long_strength') : ItemStack.of('arrow', 2);
  cm.slotsChanged();
  const res = cm.result.items[0];
  check('8 arrows and a lingering potion: 8 tipped arrows', res?.item.id === 'tipped_arrow' && res.count === 8 && P.contentsOf(res).potion === 'long_strength', `${res?.item.id} ${res?.count}`);
  cm.craft.items[4] = P.potionStack('splash_potion', 'long_strength');
  cm.slotsChanged();
  check('not with a splash potion', !cm.result.items[0]);
  cm.craft.items[4] = P.potionStack('lingering_potion', 'long_strength');
  cm.craft.items[0] = null;
  cm.slotsChanged();
  check('nor with an arrow missing', !cm.result.items[0]);
  // the fletcher's master trade
  const listing = trading.VILLAGER_TRADES.fletcher[4][2];
  const offer = listing({ random: level.random, villagerType: 'plains' });
  const c = P.contentsOf(offer.result);
  check('the fletcher sells 5 tipped arrows for 2 emeralds and 5 arrows', offer.result.item.id === 'tipped_arrow' && offer.result.count === 5 && offer.baseCostA.id === 'emerald' && offer.baseCostA.count === 2 && offer.costB.id === 'arrow' && offer.costB.count === 5 && P.potionEffects(c.potion).length > 0, c?.potion);
}

// --- effects that do things: turtle shell, a furious cocktail
{
  const { level } = makeLevel();
  const p = player(level);
  p.inventory.armor[3] = ItemStack.of('turtle_helmet');
  p.tick();
  const wbE = p.getEffect('water_breathing');
  check('a turtle shell out of water: 10 s of water breathing', wbE && wbE.duration >= 199 && !wbE.visible && wbE.showIcon, `${wbE?.duration}`);
  const pa = new adv.PlayerAdvancements();
  const all = ['speed', 'slowness', 'strength', 'jump_boost', 'regeneration', 'fire_resistance', 'water_breathing', 'invisibility', 'night_vision', 'weakness', 'poison', 'slow_falling', 'resistance', 'oozing', 'infested', 'wind_charged', 'weaving'];
  pa.trigger('effects_changed', { effects: new Set(all.slice(1)) });
  check('A Furious Cocktail needs them all', !pa.isDone(adv.ADVANCEMENTS.get('nether/all_potions')));
  pa.trigger('effects_changed', { effects: new Set(all) });
  check('A Furious Cocktail', pa.isDone(adv.ADVANCEMENTS.get('nether/all_potions')));
  // the game's hook fires on effect changes
  let fired = 0;
  p.onEffectsChanged = () => fired++;
  p.addEffect(new fx.MobEffectInstance(fx.MOB_EFFECTS.speed, 100));
  check('effects changing tell the advancements', fired > 0);
}

// --- the 1.21 effects on death
{
  const { level, world } = makeLevel();
  level.gameRules.mobGriefing = true;
  const cow = mob(level, 'cow', 0.5, 0.5);
  cow.addEffect(new fx.MobEffectInstance(fx.MOB_EFFECTS.weaving, 1000));
  cow.triggerOnDeathMobEffects();
  let webs = 0;
  for (let x = -1; x <= 1; x++) for (let y = 63; y <= 65; y++) for (let z = -1; z <= 1; z++) if (nameAt(world, x, y, z) === 'cobweb') webs++;
  check('weaving: 2 or 3 webs where it died', webs >= 2 && webs <= 3, `${webs}`);
  const cow2 = mob(level, 'cow', 8.5, 8.5);
  cow2.addEffect(new fx.MobEffectInstance(fx.MOB_EFFECTS.oozing, 1000));
  const before = level.entities.filter((e) => e.type === 'slime').length;
  cow2.triggerOnDeathMobEffects();
  const slimes = level.entities.filter((e) => e.type === 'slime' && !e.removed);
  check('oozing: two slimes of size 2', slimes.length - before === 2 && slimes.every((s) => s.getSize?.() === 2 || s.size === 2), `${slimes.length - before}`);
  const cow3 = mob(level, 'cow', -8.5, 8.5);
  const pig = mob(level, 'pig', -7.5, 8.5);
  cow3.addEffect(new fx.MobEffectInstance(fx.MOB_EFFECTS.wind_charged, 1000));
  cow3.triggerOnDeathMobEffects();
  check('wind charged: a burst pushes what\'s near', Math.hypot(pig.dx, pig.dy, pig.dz) > 0.1, `${pig.dx.toFixed(2)},${pig.dy.toFixed(2)},${pig.dz.toFixed(2)}`);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
process.exit(fails ? 1 : 0);
