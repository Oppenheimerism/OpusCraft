// Headless checks for zombie villagers: infection, curing, saving (node tests/villager/zombie.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/villager.ts', '/src/entity/player.ts', '/src/item/item.ts', '/src/entity/monsters.ts', '/src/entity/zombieVillager.ts', '/src/game/spawner.ts', '/src/entity/effects.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, vil, playerMod, itemMod, monsters, zvMod, spawner, effects] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
function makeLevel(difficulty = 'hard') {
  const world = new worldMod.World();
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {} };
  const gs = S('grass_block');
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; }
  level.dayTime = 1000;
  level.difficulty = difficulty;
  return { world, level, sounds };
}
const villager = (level, x, z) => { const v = new vil.Villager(level); v.moveTo(x + 0.5, 64, z + 0.5, 0, 0); v.finalizeSpawn('egg'); level.addEntity(v); return v; };
const zombie = (level, x, z) => { const zb = new monsters.Zombie(level); zb.moveTo(x + 0.5, 64, z + 0.5, 0, 0); level.addEntity(zb); return zb; };
const live = (level, type) => level.entities.filter((e) => e.type === type && !e.removed);

// --- a zombie kills a villager on hard: it rises as a zombie villager, keeping all it was
{
  const { level, sounds } = makeLevel('hard');
  const v = villager(level, 0, 0);
  v.setProfession('librarian');
  v.merchantLevel = 2;
  v.xp = 15;
  v.villagerType = 'taiga';
  const offers = v.getOffers().map((o) => o.save());
  v.gossips.add('someone', 'minor_negative', 50);
  const zb = zombie(level, 1, 0);
  v.hurt(1000, 'mob', zb, zb);
  const zvs = live(level, 'zombie_villager');
  check('the villager is gone', v.removed && live(level, 'villager').length === 0);
  check('a zombie villager rises in its place', zvs.length === 1 && Math.abs(zvs[0].x - v.x) < 1e-9 && Math.abs(zvs[0].z - v.z) < 1e-9);
  const zv = zvs[0];
  check('same outfit, trade and level', zv && zv.villagerType === 'taiga' && zv.profession === 'librarian' && zv.merchantLevel === 2 && zv.xp === 15);
  check('its offers kept', zv && JSON.stringify(zv.tradeOffers) === JSON.stringify(offers), `${zv?.tradeOffers?.length} offers`);
  check('its memories kept', zv && zv.gossips?.some((g) => g.target === 'someone' && g.value === 50));
  check('with the infection\'s groan', sounds.includes('entity.zombie.infect'));
  check('no loot or orbs from the villager', !level.entities.some((e) => (e.type === 'item' || e.type === 'experience_orb') && !e.removed));
  check('not despawnable once it has traded', zv && !zv.removeWhenFarAway(200 * 200));
}
// a baby villager rises as a baby
{
  const { level } = makeLevel('hard');
  const v = villager(level, 0, 0);
  v.setAge(-24000);
  const zb = zombie(level, 1, 0);
  v.hurt(1000, 'mob', zb, zb);
  const zv = live(level, 'zombie_villager')[0];
  check('a baby stays a baby', zv && zv.isBaby());
}
// easy: never; normal: about half the time; killed by a player: never
{
  const { level } = makeLevel('easy');
  const v = villager(level, 0, 0);
  const zb = zombie(level, 1, 0);
  v.hurt(1000, 'mob', zb, zb);
  check('on easy the villager just dies', live(level, 'zombie_villager').length === 0);
}
{
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const { level } = makeLevel('normal');
    const v = villager(level, 0, 0);
    const zb = zombie(level, 1, 0);
    v.hurt(1000, 'mob', zb, zb);
    n += live(level, 'zombie_villager').length;
  }
  check('on normal about half rise', n > 15 && n < 45, `${n}/60`);
}
{
  const { level } = makeLevel('hard');
  const v = villager(level, 0, 0);
  const p = new playerMod.Player(level);
  v.hurt(1000, 'player', p, p);
  check('killed by a player: no zombie', live(level, 'zombie_villager').length === 0);
}

// --- the cure
{
  const { level, sounds } = makeLevel('normal');
  const zv = new zvMod.ZombieVillager(level);
  zv.moveTo(0.5, 64, 0.5, 0, 0);
  zv.finalizeSpawn('natural');
  zv.setBaby(false);
  zv.profession = 'farmer';
  // (one that had traded: an untraded novice with no job site goes jobless again, vanilla ResetProfession)
  zv.xp = 5;
  level.addEntity(zv);
  const p = new playerMod.Player(level);
  p.gameMode = 'survival';
  p.moveTo(2.5, 64, 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  p.inventory.setSelectedItem(ItemStack.of('golden_apple', 2));
  check('without weakness the apple does nothing (and isn\'t eaten)', zv.interact(p, p.inventory.selectedItem) === 'consume' && !zv.converting && p.inventory.selectedItem.count === 2);
  zv.addEffect(new effects.MobEffectInstance(effects.MOB_EFFECTS.weakness, 1800, 0));
  check('weakened, it takes the apple', zv.interact(p, p.inventory.selectedItem) === 'success' && zv.converting && p.inventory.selectedItem.count === 1);
  check('the cure takes 3600-6000 ticks', zv.conversionTime >= 3600 && zv.conversionTime <= 6000, `${zv.conversionTime}`);
  check('weakness gone, strong while it lasts', !zv.hasEffect('weakness') && zv.hasEffect('strength'));
  check('with the hiss of the cure', sounds.includes('entity.zombie_villager.cure'));
  zv.xp = 0;
  check('it won\'t despawn while being cured', !zv.removeWhenFarAway(200 * 200));
  zv.xp = 5;
  // saving mid-cure
  const d = zv.save();
  const zv2 = spawner.loadEntity(d, level);
  check('saved mid-cure, the cure goes on', zv2.converting && zv2.conversionTime === zv.conversionTime && zv2.conversionStarter === p.uuid && zv2.profession === 'farmer');
  // a few ticks from the end
  let cured = null;
  level.onCuredZombieVillager = (pl, v) => { cured = v; };
  zv.conversionTime = 3;
  for (let i = 0; i < 5; i++) level.tick();
  const vs = live(level, 'villager');
  check('a villager again', zv.removed && vs.length === 1 && vs[0].profession === 'farmer', `removed ${zv.removed} n ${vs.length} prof ${vs.map((x) => x.profession)}`);
  const v = vs[0];
  check('the cure is reported (Zombie Doctor)', cured === v);
  check('grateful: +125 reputation', v && v.playerReputation(p) === 125, `${v?.playerReputation(p)}`);
  check('dizzy for 10 s', v && v.hasEffect('nausea'));
  check('with the converted sound', sounds.includes('entity.zombie_villager.converted'));
  const o = v.getOffers()[0];
  if (o) {
    const base = o.costA().count;
    v.interact(p, null, true);
    check('and cheap', o.costA().count < base || o.costA().count === 1, `${base} -> ${o.costA().count}`);
    v.stopTrading();
  }
}

// --- natural spawns: zombie villagers come alone, 5 in (100+5) of the zombies
{
  const { level } = makeLevel();
  const zv = spawner.createMob('zombie_villager', level);
  check('a spawnable mob', !!zv && zv.type === 'zombie_villager');
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
