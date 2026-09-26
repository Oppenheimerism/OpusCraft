// Headless checks for the husk and the stray (node tests/biome-mobs/mobs.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/item/potions.ts', '/src/entity/biomeMonsters.ts',
  '/src/entity/monsters.ts', '/src/entity/effects.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, P, bm, monsters, fx] = mods;
const { ItemStack } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

function makeLevel(difficulty = 'normal', dayTime = 18000) {
  const world = new worldMod.World();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {} };
  const gs = S('grass_block');
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; }
  level.dayTime = dayTime;
  level.difficulty = difficulty;
  return { world, level, sounds };
}
const mobAt = (level, type, x, z, y = 64) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg'); level.addEntity(m); return m; };
const strip = (m) => { for (const s of ['mainhand', 'offhand', 'feet', 'legs', 'chest', 'head']) m.setItemSlot(s, null); };

// --- the husk: sizes, and the sun doesn't burn it
{
  const { level } = makeLevel('normal', 6000);
  const h = mobAt(level, 'husk', 0, 0), z = mobAt(level, 'zombie', 6, 0);
  strip(h), strip(z);
  check('husk: 0.6 x 1.95, 20 health', Math.abs(h.width - 0.6) < 1e-6 && Math.abs(h.height - 1.95) < 1e-6 && h.maxHealth >= 20);
  let zb = false, hb = false;
  for (let t = 0; t < 300; t++) { level.tick(); zb ||= z.isOnFire(); hb ||= h.isOnFire(); }
  check('in the midday sun a zombie burns', zb);
  check('but the husk does not', !hb);
}

// --- its bare-handed hits make you hungry, for 7 s per whole point of local difficulty
{
  const { level } = makeLevel('hard');
  const p = new playerMod.Player(level);
  p.gameMode = 'survival';
  p.moveTo(0.5, 64, 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  const h = mobAt(level, 'husk', 1, 0);
  strip(h);
  const eff = h.spawnDifficulty().effective;
  h.doHurtTarget(p);
  const hunger = p.activeEffects.get('hunger') ?? [...p.activeEffects.values()].find((e) => e.effect.id === 'hunger');
  check('a bare-handed hit: hunger', !!hunger && hunger.duration === 140 * Math.trunc(eff), `${hunger?.duration} (effective ${eff.toFixed(2)})`);
  const p2 = new playerMod.Player(level);
  p2.gameMode = 'survival';
  p2.moveTo(2.5, 64, 0.5, 0, 0);
  level.addEntity(p2);
  h.setItemSlot('mainhand', ItemStack.of('iron_sword'));
  h.doHurtTarget(p2);
  check('a hit with a sword: none', !p2.hasEffect('hunger'));
}

// --- held under water: a husk becomes a zombie; a zombie keeps waiting for the drowned; a zombified piglin never
function flood(world, x0, z0) {
  const w = S('water');
  for (let x = x0 - 2; x <= x0 + 2; x++) for (let z = z0 - 2; z <= z0 + 2; z++) for (let y = 64; y <= 67; y++) world.setState?.(x, y, z, w) ?? world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, w);
}
{
  const { level, world, sounds } = makeLevel();
  flood(world, 0, 0);
  flood(world, 10, 0);
  const h = mobAt(level, 'husk', 0, 0);
  strip(h);
  h.setItemSlot('head', ItemStack.of('iron_helmet'));
  h.setDropChance('head', 0.5);
  h.setBaby(false);
  h.persistenceRequired = true;
  const z = mobAt(level, 'zombie', 10, 0);
  let started = -1, converted = -1, drowned = false, atConversion = null;
  for (let t = 0; t < 1000; t++) {
    level.tick();
    // (keep them under)
    for (const [m, x] of [[h, 0.5], [z, 10.5]]) if (!m.removed) { m.moveTo(x, m.y, 0.5, m.yaw, m.pitch); m.dy = Math.min(m.dy, 0); }
    if (started < 0 && h.underWaterConverting) started = t;
    if (converted < 0 && h.removed) {
      converted = t;
      // (where the zombie stands the moment it takes the husk's place: it's free to wander off after)
      const nz = level.entities.find((e) => e.type === 'zombie' && e !== z && !e.removed);
      if (nz) atConversion = { dx: nz.x - h.x, dz: nz.z - h.z };
    }
    if (h.health < h.maxHealth || z.health < z.maxHealth) drowned = true;
  }
  check('the undead don\'t drown', !drowned, `${h.health}/${h.maxHealth} ${z.health}/${z.maxHealth}`);
  check('after 30 s under, the husk starts to shake', started >= 590 && started <= 610, `at ${started}`);
  check('and 15 s later it\'s gone', converted - started >= 295 && converted - started <= 305, `${converted - started} ticks`);
  const nz = level.entities.find((e) => e.type === 'zombie' && e !== z && !e.removed);
  check('a zombie in its place', !!nz && !!atConversion && Math.abs(atConversion.dx) < 1e-6 && Math.abs(atConversion.dz) < 1e-6, JSON.stringify(atConversion));
  check('wearing its helmet, as likely to drop it', nz?.getItemBySlot('head')?.item.id === 'iron_helmet' && nz.equipmentDropChance('head') === 0.5);
  check('as persistent', nz?.persistenceRequired === true);
  check('with the husk\'s sound', sounds.includes('entity.husk.converted_to_zombie'));
  check('a zombie under water becomes a drowned', z.removed && level.entities.some((e) => e.type === 'drowned' && !e.removed));
}
{
  const { level, world } = makeLevel();
  flood(world, 0, 0);
  const zp = mobAt(level, 'zombified_piglin', 0, 0);
  for (let t = 0; t < 1000; t++) { level.tick(); zp.moveTo(0.5, zp.y, 0.5, zp.yaw, zp.pitch); zp.dy = Math.min(zp.dy, 0); }
  check('a zombified piglin never converts', !zp.removed && !zp.underWaterConverting);
}

// --- saved and loaded mid-conversion
{
  const { level, world } = makeLevel();
  flood(world, 0, 0);
  const h = mobAt(level, 'husk', 0, 0);
  for (let t = 0; t < 700; t++) { level.tick(); h.moveTo(0.5, h.y, 0.5, h.yaw, h.pitch); h.dy = Math.min(h.dy, 0); }
  const d = h.save();
  const h2 = spawner.loadEntity(d, level);
  check('saved and loaded while shaking', h2?.type === 'husk' && h2.underWaterConverting, JSON.stringify({ t: d.data?.drownedConversionTime ?? d.drownedConversionTime }));
}

// --- the stray: its arrows slow for 30 s, in full
{
  const { level } = makeLevel();
  const p = new playerMod.Player(level);
  p.gameMode = 'survival';
  p.moveTo(0.5, 64, 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  const s = mobAt(level, 'stray', 8, 0);
  check('stray: 0.6 x 1.99 with a bow', Math.abs(s.height - 1.99) < 1e-6 && s.mainHand?.item.id === 'bow');
  const a = s.getArrow();
  const c = P.contentsOf(a.pickupItem);
  check('its arrow carries slowness 600 as a custom effect', c?.customEffects?.length === 1 && c.customEffects[0].id.endsWith('slowness') && c.customEffects[0].duration === 600, JSON.stringify(c));
  check('and trails its colour', a.color === 0x8bafe0, a.color.toString(16));
  let hit = -1;
  const orig = level.addEntity.bind(level);
  let arrow = null;
  level.addEntity = (e) => { if (e.type === 'arrow') arrow = e; return orig(e); };
  s.lookAt?.(p, 360, 360);
  s.performRangedAttack(p, 1);
  level.addEntity = orig;
  for (let t = 0; t < 60 && hit < 0; t++) {
    level.tick();
    p.moveTo(0.5, 64, 0.5, 0, 0);
    if (p.hasEffect('slowness')) hit = t;
  }
  const inst = [...p.activeEffects.values()].find((e) => e.effect.id === 'slowness');
  check('a hit: slowed for about 30 s', hit >= 0 && inst.duration > 560, `${inst?.duration} at ${hit} (arrow ${arrow ? 'shot' : 'none'})`);
}

// --- stray loot: a player's kill sometimes drops one arrow of slowness
{
  const { level } = makeLevel();
  const counts = { tipped: 0, maxTipped: 0, plain: 0, noPlayer: 0 };
  for (let i = 0; i < 400; i++) {
    for (const [byPlayer, looting] of [[true, 3], [false, 0]]) {
      const s = mobAt(level, 'stray', 0, 0);
      const before = new Set(level.entities);
      s.dropLoot(byPlayer, looting);
      for (const e of level.entities) {
        if (before.has(e) || e.type !== 'item') continue;
        if (e.stack.item.id === 'tipped_arrow') {
          if (!byPlayer) counts.noPlayer++;
          else {
            counts.tipped++;
            counts.maxTipped = Math.max(counts.maxTipped, e.stack.count);
            if (P.contentsOf(e.stack)?.potion !== 'slowness') counts.plain++;
          }
        }
        e.remove();
      }
      s.remove();
    }
  }
  check('a player\'s kill: arrows of slowness now and then', counts.tipped > 100 && counts.plain === 0, JSON.stringify(counts));
  check('never more than one, looting III and all', counts.maxTipped === 1);
  check('none unless a player killed it', counts.noPlayer === 0);
}

// --- spawning: husks under the open sky, strays too
{
  const { level, world } = makeLevel();
  const ns = new spawner.NaturalSpawner(level, 1);
  // (a tick for the night sky to darken)
  level.tick();
  const rate = (type, x) => { let n = 0; for (let i = 0; i < 400; i++) if (ns.checkSpawnRules(type, x, 64, 0)) n++; return n; };
  check('husk: spawns in the open (at night, now and then)', rate('husk', 0) > 20, `${rate('husk', 0)}/400`);
  // (a roof over it)
  for (let x = 4; x <= 6; x++) for (let z = -1; z <= 1; z++) { world.getChunk(x >> 4, z >> 4).setState(x & 15, 70, z & 15, S('stone')); world.getChunk(x >> 4, z >> 4).heightmap[((z & 15) << 4) | (x & 15)] = 71; }
  check('but not under a roof', rate('husk', 5) === 0);
  check('nor does the stray', rate('stray', 5) === 0 && rate('stray', 0) > 20);
  check('a zombie doesn\'t care', rate('zombie', 5) > 20);
  check('registered', !!spawner.MOB_TYPES.husk && !!spawner.MOB_TYPES.stray);
  check('spawn eggs', !!itemMod.ITEMS.get('husk_spawn_egg') && !!itemMod.ITEMS.get('stray_spawn_egg'));
}

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
process.exit(fails ? 1 : 0);
