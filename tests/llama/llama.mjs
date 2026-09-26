// Headless checks for llamas and trader llamas (node tests/llama/llama.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 400000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/entity/llama.ts', '/src/world/gen/biomes.ts',
  '/src/render/llamaRenderer.ts', '/src/textures/mobs.ts', '/src/inventory/horseMenu.ts', '/src/entity/wolf.ts', '/src/game/redstone/dispenseItems.ts',
  '/src/entity/horse.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, L, biomes, lr, mobs, menuMod, wolfMod, disp, H] = mods;
const { ItemStack } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/** flat grass at y=63 (standing at 64) over stone */
function makeLevel({ biome = 'plains' } = {}) {
  const world = new worldMod.World();
  for (let cx = -5; cx <= 5; cx++) for (let cz = -5; cz <= 5; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  const particles = [];
  level.particles = { spawn: (k) => particles.push(k), blockBreak() {}, spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const st = S('stone'), gs = S('grass_block');
  for (let x = -80; x <= 80; x++) for (let z = -80; z <= 80; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 55; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = 6000;
  level.difficulty = 'normal';
  return { world, level, sounds, particles };
}
const mobAt = (level, type, x, y, z, group) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg', group); level.addEntity(m); return m; };
function playerAt(level, x, y, z, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.gameMode = mode;
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const hold = (p, id, n = 64) => p.inventory.setSelectedItem(id ? ItemStack.of(id, n) : null);
const settle = (level, n = 20) => { for (let i = 0; i < n; i++) level.tick(); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// --- registered
{
  const ok = ['llama', 'trader_llama'].every((t) => !!spawner.MOB_TYPES[t] && !!itemMod.ITEMS.get(t + '_spawn_egg') && !!mobs.SPAWN_EGG_TEXTURES[t + '_spawn_egg']);
  check('llama and trader llama registered, with spawn eggs and names', ok && spawner.entityDisplayName('llama') === 'Llama' && spawner.entityDisplayName('trader_llama') === 'Trader Llama');
  const tex = ['creamy', 'white', 'brown', 'gray'].map((v) => mobs.MOB_TEXTURES['llama_' + v]?.());
  check('four coats, 128 x 64', tex.every((t) => t && t.w === 128 && t.h === 64));
  check('a decor for every carpet and the trader\'s, and the spit', ['white', 'red', 'black', 'light_blue'].every((c) => !!mobs.MOB_TEXTURES['llama_decor_' + c]) && !!mobs.MOB_TEXTURES['llama_decor_trader']?.() && mobs.MOB_TEXTURES['llama_spit']?.().w === 64);
  const def = lr.llamaModel();
  check('the model: head, body, two chests, four legs; a baby drawn in three groups', ['head', 'body', 'right_chest', 'left_chest', 'right_hind_leg', 'left_front_leg'].every((n) => !!def.root.child(n)) && def.babyGroups.length === 3);
}

// --- size, spawning
{
  const { level } = makeLevel();
  const l = mobAt(level, 'llama', 0, 64, 0);
  check('0.9 x 1.87, eyes at 1.7765', near(l.width, 0.9) && near(l.height, 1.87) && near(l.eyeHeight, 1.7765), `${l.width} x ${l.height} ${l.eyeHeight}`);
  const b = spawner.createMob('llama', level);
  b.setAge(-24000);
  check('a baby is half a llama (0.45 x 0.935)', near(b.width, 0.45) && near(b.height, 0.935), `${b.width} x ${b.height}`);
  check('the seat 1.37 up (a baby\'s 0.52875)', near(l.passengerAttachmentY(l), 1.37) && near(b.passengerAttachmentY(b), 0.52875));
  const d = spawner.createMob('donkey', level);
  d.setAge(-24000);
  check('(a donkey foal is half a donkey, 0.698 x 0.75)', near(d.width, 0.6982422) && near(d.height, 0.75), `${d.width} x ${d.height}`);
  const strengths = [0, 0, 0, 0, 0, 0], variants = new Set();
  let hOk = true;
  for (let i = 0; i < 3000; i++) {
    const x = spawner.createMob('llama', level);
    x.moveTo(0.5, 64, 0.5, 0, 0);
    x.finalizeSpawn('natural', {});
    strengths[x.strength]++;
    variants.add(x.variant);
    if (x.maxHealth < 15 || x.maxHealth > 30 || !near(x.moveSpeedAttr, 0.175) || !near(x.jumpStrength, 0.5)) hOk = false;
  }
  check('strength 1-3 as a rule, 4 or 5 now and then (about 1.6%)', strengths[0] === 0 && strengths[1] > 800 && strengths[3] > 800 && strengths[4] + strengths[5] > 15 && strengths[4] + strengths[5] < 100, JSON.stringify(strengths));
  check('health 15-30, speed 0.175, jump 0.5; all four coats come up', hOk && variants.size === 4);
  const g = {};
  const herd = Array.from({ length: 5 }, () => { const x = spawner.createMob('llama', level); x.moveTo(0.5, 64, 0.5, 0, 0); x.finalizeSpawn('natural', g); return x.variant; });
  check('a herd shares one coat', new Set(herd).size === 1);
  check('follows from 40 away; a lead tugs it at double speed', l.followRange === 40 && l.followLeashSpeed() === 2);
}

// --- natural spawns: windswept hills and savanna plateaus
for (const [biome, want] of [['windswept_hills', true], ['savanna_plateau', true], ['plains', false]]) {
  const { level } = makeLevel({ biome });
  const ns = new spawner.NaturalSpawner(level, 1234);
  let n = 0;
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) for (const e of ns.spawnForNewChunk(cx, cz)) if (e.type === 'llama') n++;
  check(`llamas ${want ? 'come' : 'don\'t come'} in ${biome}`, want ? n > 0 : n === 0, `${n}`);
}

// --- taming: ride it until it gives in; no saddle; food
{
  const { level, sounds } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const l = mobAt(level, 'llama', 1, 64, 0);
  check('a wild one\'s temper tops out at 30', l.maxTemper() === 30);
  hold(p, 'red_carpet', 1);
  sounds.length = 0;
  l.interact(p, p.inventory.selectedItem);
  check('a carpet on a wild one: it won\'t have it (the angry sound), and doesn\'t rear', !l.bodyArmor() && sounds.includes('entity.llama.angry') && !l.standing);
  hold(p, null);
  l.temper = 30;
  l.interact(p, null);
  check('climbing on', p.vehicle === l);
  for (let i = 0; i < 400 && !l.tamed; i++) level.tick();
  check('ridden with its temper at the top, it gives in', l.tamed && l.ownerUUID === p.uuid);
  check('a tame one takes no saddle', !l.isSaddleable() && l.controllingPassenger() === null);
  p.stopRiding?.();
  l.ejectPassengers();
  l.maxHealth = 30;
  l.health = 10;
  hold(p, 'wheat', 4);
  sounds.length = 0;
  l.interact(p, p.inventory.selectedItem);
  check('wheat heals 2 (its eating sound)', near(l.health, 12) && p.inventory.selectedItem.count === 3 && sounds.includes('entity.llama.eat'));
  check('wheat doesn\'t make a tame one fall in love', !l.isInLove());
  hold(p, 'hay_block', 4);
  l.interact(p, p.inventory.selectedItem);
  check('a hay bale heals 10 and puts a tame grown one in love', near(l.health, 22) && l.isInLove());
  const w = mobAt(level, 'llama', 4, 64, 4);
  w.temper = 0;
  hold(p, 'wheat', 4);
  w.interact(p, p.inventory.selectedItem);
  check('wheat sweetens a wild one\'s temper by 3', w.temper === 3);
  const baby = mobAt(level, 'llama', 6, 64, 6);
  baby.setAge(-24000);
  hold(p, 'wheat', 4);
  baby.interact(p, p.inventory.selectedItem);
  check('wheat brings a baby on 10 seconds', baby.age === -24000 + 200, `${baby.age}`);
  hold(p, 'golden_carrot', 4);
  check('golden carrots aren\'t llama food', !l.isFood(p.inventory.selectedItem));
}

// --- the chest: three slots a point of strength; the carpet
{
  const { level, sounds } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const l = mobAt(level, 'llama', 1, 64, 0);
  l.tameWithName(p);
  l.setStrength(4);
  hold(p, 'chest', 1);
  sounds.length = 0;
  l.interact(p, p.inventory.selectedItem);
  check('a chest goes on a tame one (the chicken\'s plop for the sound)', l.hasChest && sounds.includes('entity.llama.chest'));
  check('strength 4: four columns', l.inventoryColumns() === 4);
  const menu = new menuMod.HorseInventoryMenu(p, l);
  check('its inventory: saddle and carpet slots, 12 in the chest, then the player\'s 36', menu.columns === 4 && menu.slots.length === 2 + 12 + 36, `${menu.slots.length}`);
  check('the saddle slot is off, the carpet slot on', !menu.slots[0].isActive() && menu.slots[1].isActive());
  check('the carpet slot takes carpets, not horse armour', menu.slots[1].mayPlace(ItemStack.of('lime_carpet')) && !menu.slots[1].mayPlace(ItemStack.of('iron_horse_armor')) && !menu.slots[1].mayPlace(ItemStack.of('moss_carpet')));
  hold(p, 'red_carpet', 2);
  sounds.length = 0;
  l.interact(p, p.inventory.selectedItem);
  check('a carpet goes on a tame one: its swag red, with the swag sound', l.swag() === 'red' && l.bodyArmor()?.count === 1 && p.inventory.selectedItem.count === 1 && sounds.includes('entity.llama.swag'));
  sounds.length = 0;
  menu.slots[1].set(ItemStack.of('red_carpet'));
  check('the same colour again: no sound', !sounds.includes('entity.llama.swag'));
  menu.slots[1].set(ItemStack.of('blue_carpet'));
  check('another colour: the sound', l.swag() === 'blue' && sounds.includes('entity.llama.swag'));
  check('a carpet is no armour', l.armorValue() === 0);
  l.inventory.set(2, ItemStack.of('diamond', 5));
  const d = spawner.saveEntity(l);
  const back = spawner.loadEntity(JSON.parse(JSON.stringify(d)), level);
  check('saved and loaded: coat, strength, tame, chest and its load, carpet', back.variant === l.variant && back.strength === 4 && back.tamed && back.hasChest && back.inventory.get(2)?.count === 5 && back.swag() === 'blue');
  const wild = mobAt(level, 'llama', 6, 64, 6);
  wild.hurt(100, 'generic');
  check('(dying, a tame one drops its carpet, chest and load; see below)', true);
  l.hurt(1000, 'generic');
  const dropped = level.entities.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack.item.id);
  check('dying, it drops the carpet, the chest and what was in it', dropped.includes('blue_carpet') && dropped.includes('chest') && dropped.includes('diamond'), dropped.join(','));
}

// --- dispensers put carpets on
{
  const b = disp.dispenseBehaviorFor(ItemStack.of('cyan_carpet'));
  check('a dispenser has a way with carpets (as with horse armour)', b === disp.dispenseBehaviorFor(ItemStack.of('iron_horse_armor')));
}

// --- breeding
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const a = mobAt(level, 'llama', 1, 64, 0), b = mobAt(level, 'llama', 2, 64, 0);
  for (const x of [a, b]) x.tameWithName(p);
  a.setStrength(3);
  b.setStrength(5);
  a.variant = 'brown';
  b.variant = 'white';
  const kids = [];
  for (let i = 0; i < 300; i++) kids.push(a.makeBaby(b));
  check('the babies are llamas, up to the stronger parent\'s strength (now and then one more)', kids.every((k) => k.type === 'llama' && k.strength >= 1 && k.strength <= 5));
  check('each takes one parent\'s coat', kids.every((k) => k.variant === 'brown' || k.variant === 'white') && new Set(kids.map((k) => k.variant)).size === 2);
  check('only with a llama', !a.canMate(mobAt(level, 'horse', 5, 64, 5)));
  const t = mobAt(level, 'trader_llama', 8, 64, 8), u = mobAt(level, 'trader_llama', 9, 64, 8);
  check('a trader llama\'s baby is a trader llama', t.makeBaby(u).type === 'trader_llama');
  a.setInLove(p);
  b.setInLove(p);
  settle(level, 200);
  check('two tame ones in love have a baby', level.entities.some((e) => e.type === 'llama' && e.isBaby?.()));
}

// --- spitting back (it's a spread shot, so over a few tries: at least one lands, and each stings for 1 or misses)
{
  let hits = 0, badDamage = false, spatOnce = true, letBe = true, sound = true, tries = 0;
  let level, l;
  for (; tries < 8 && hits < 2; tries++) {
    const w = makeLevel();
    level = w.level;
    const p = playerAt(level, 0, 64, 0);
    l = mobAt(level, 'llama', 6, 64, 0);
    // (not on its first tick: vanilla HurtByTargetGoal's timestamp starts at 0; each try its own luck)
    settle(level, 5);
    for (let j = 0; j < tries * 17; j++) level.random.nextDouble();
    l.hurt(1, 'player', p);
    w.sounds.length = 0;
    // (the lowest it got: a full player heals it straight back)
    const hp0 = p.health;
    let maxSpits = 0, low = hp0;
    for (let i = 0; i < 80; i++) {
      level.tick();
      low = Math.min(low, p.health);
      maxSpits = Math.max(maxSpits, level.entities.filter((e) => e.type === 'llama_spit' && !e.removed).length);
    }
    const dmg = hp0 - low;
    if (near(dmg, 1)) hits++;
    else if (!near(dmg, 0)) badDamage = true;
    if (maxSpits !== 1 || w.sounds.filter((s) => s === 'entity.llama.spit').length !== 1) spatOnce = false;
    if (!w.sounds.includes('entity.llama.spit')) sound = false;
    if (l.target !== null) letBe = false;
  }
  check('hurt, it spits at whoever did it (with the sound)', sound);
  check('the spit stings for 1 (when it lands)', hits > 0 && !badDamage, `${hits} of ${tries}`);
  check('and it spits only the once', spatOnce);
  check('then lets them be', letBe);
  // a gob into the ground is gone
  const s = new L.LlamaSpit(level, l);
  s.moveTo(l.x, 64.5, l.z + 3, 0, 0);
  level.addEntity(s);
  s.shoot(0, -1, 0, 1.5, 0);
  settle(level, 3);
  check('spit hitting the ground is gone', s.removed);
}

// --- wolves
{
  const { level } = makeLevel();
  const w = mobAt(level, 'wolf', 0, 64, 0);
  const l = mobAt(level, 'llama', 5, 64, 0);
  l.setStrength(5);
  let targeted = false, spat = false;
  // (first held still, so the llama's aim can be seen: a wolf flees a strong llama fast)
  // (it notices a wolf by chance, then takes 40 ticks to spit: give it time)
  for (let i = 0; i < 240 && !spat; i++) {
    w.moveTo(0.5, 64, 0.5, w.yaw, 0);
    w.navigation.stop();
    level.tick();
    if (l.target === w) targeted = true;
    if (level.entities.some((e) => e.type === 'llama_spit')) spat = true;
  }
  check('a llama goes for a wild wolf within 10, spitting', targeted && spat);
  for (let i = 0; i < 120; i++) level.tick();
  check('a wild wolf backs off from a strong llama', dist(w, l) > 8, dist(w, l).toFixed(1));
  const { level: l2 } = makeLevel();
  const p = playerAt(l2, 20, 64, 20);
  const tw = mobAt(l2, 'wolf', 0, 64, 0);
  tw.tameBy(p);
  const ll = mobAt(l2, 'llama', 5, 64, 0);
  ll.setStrength(5);
  let t2 = false;
  for (let i = 0; i < 60; i++) {
    l2.tick();
    if (ll.target === tw) t2 = true;
  }
  check('a tame wolf is let be', !t2);
}

// --- caravans
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const a = mobAt(level, 'llama', 3, 64, 0), b = mobAt(level, 'llama', 8, 64, 0), c = mobAt(level, 'llama', 13, 64, 0);
  a.setLeashedTo(p);
  settle(level, 40);
  check('one led, the next falls in behind it, and the next behind that', b.caravanHead === a && a.caravanTail === b && c.caravanHead === b, `${b.caravanHead?.type} ${c.caravanHead?.type}`);
  // (walked off a block at a time: a lead snaps past ten)
  for (let x = 0; x >= -12; x--) {
    p.moveTo(x + 0.5, 64, 0.5, 0, 0);
    settle(level, 10);
  }
  settle(level, 100);
  check('led off, the caravan follows', dist(a, p) < 8 && dist(b, a) < 5 && dist(c, b) < 5, `${dist(a, p).toFixed(1)} ${dist(b, a).toFixed(1)} ${dist(c, b).toFixed(1)}`);
  a.dropLeash(false);
  settle(level, 10);
  check('let go, the caravan breaks up', b.caravanHead === null && c.caravanHead === null);
}

// --- trader llamas
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const t = mobAt(level, 'trader_llama', 2, 64, 0);
  check('a trader llama wears its livery with no carpet', t.isTraderLlama() && t.swag() === null && t.despawnDelay > 47000);
  t.despawnDelay = 3;
  settle(level, 5);
  check('its time up, it goes', t.removed);
  const u = mobAt(level, 'trader_llama', 4, 64, 0);
  u.tameWithName(p);
  u.despawnDelay = 3;
  const v = mobAt(level, 'trader_llama', 6, 64, 0);
  v.setLeashedTo(p);
  v.despawnDelay = 3;
  settle(level, 5);
  check('a tame one stays, and so does one you\'re leading', !u.removed && !v.removed);
  const d = spawner.saveEntity(u);
  check('its time saved', spawner.loadEntity(JSON.parse(JSON.stringify(d)), level).despawnDelay === u.despawnDelay);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
