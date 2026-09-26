// Headless checks for the illagers (node tests/illagers/illagers.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/game/spawner.ts', '/src/entity/illagers.ts', '/src/entity/evoker.ts',
  '/src/entity/ravager.ts', '/src/entity/raider.ts', '/src/entity/animals.ts', '/src/entity/arrow.ts', '/src/entity/witch.ts',
  '/src/game/itemBehavior.ts', '/src/entity/shield.ts', '/src/game/shields.ts', '/src/game/advancements.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, spawner, ill, evk, rav, raider, animals, arrowMod, witchMod, ib, shieldMod, , advMod] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

function setup() {
  const world = new worldMod.World();
  for (let cx = -3; cx <= 2; cx++) for (let cz = -3; cz <= 2; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) { const c = world.getChunk(x >> 4, z >> 4); for (let y = 50; y <= 63; y++) c.setState(x & 15, y, z & 15, S('stone')); }
  const level = new levelMod.Level(world, 'test');
  level.sounds = [];
  level.sound = { play: (n, x, y, z, v, p) => level.sounds.push(n), playUI() {} };
  level.particles = { blockBreak() {}, spawn() {}, entityEffect() {} };
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  const player = new playerMod.Player(level);
  player.moveTo(0.5, 64, 0.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  return { level, player };
}
const tick = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };

// --- registration
{
  const { level } = setup();
  for (const t of ['pillager', 'vindicator', 'evoker', 'vex', 'ravager']) {
    const m = spawner.createMob(t, level);
    check(`${t} made by createMob, named ${spawner.entityDisplayName(t)}`, m && m.type === t && spawner.entityDisplayName(t) !== t);
    check(`${t} spawn egg registered`, !!itemMod.ITEMS.get(`${t}_spawn_egg`));
  }
  check('totem registered, one to a stack', itemMod.ITEMS.get('totem_of_undying')?.maxStack === 1);
  check('ominous bottle registered', !!itemMod.ITEMS.get('ominous_bottle'));
}

// --- pillager
{
  const { level, player } = setup();
  const p = new ill.Pillager(level);
  p.moveTo(0.5, 64, 8.5, 180, 0);
  p.finalizeSpawn('structure');
  level.addEntity(p);
  check('pillager: 24 hp, crossbow in hand', p.maxHealth === 24 && p.mainHand?.item.id === 'crossbow');
  check('pillager arm pose: crossbow held', p.armPose() === 'crossbow_hold');
  let arrows = 0, charged = false;
  for (let i = 0; i < 200; i++) {
    level.tick();
    if (p.armPose() === 'crossbow_charge') charged = true;
    arrows = Math.max(arrows, level.entities.filter((e) => e instanceof arrowMod.Arrow).length);
  }
  check('pillager targets the player', p.target === player);
  check('pillager draws its crossbow', charged);
  check('pillager shoots arrows at the player', arrows > 0, `arrows=${arrows} hp=${player.health}`);
  check('pillager ambient sound name', p.ambientSound() === 'entity.pillager.ambient');
}

// --- captains
{
  const { level } = setup();
  let caps = 0;
  for (let i = 0; i < 2000; i++) { const p = new ill.Pillager(level); p.moveTo(0, 64, 0, 0, 0); p.finalizeSpawn('natural'); if (p.patrolLeader) caps++; }
  check('about 6% of naturally spawned pillagers are captains', caps > 70 && caps < 180, `caps=${caps}/2000`);
  const c = new ill.Pillager(level);
  c.moveTo(0, 64, 0, 0, 0);
  c.patrolLeader = true;
  c.finalizeSpawn('patrol');
  check('a patrol captain wears the ominous banner (sure drop) and is a captain', raider.isOminousBanner(c.armorItems[3]) && c.armorDropChances[3] === 2 && c.isCaptain());
  check('a patrol member is patrolling', c.patrolling);
  // killed: the banner and an ominous bottle
  level.addEntity(c);
  const triggers = [];
  level.onPlayerTrigger = (p, t) => triggers.push(t);
  c.lastHurtByPlayerTime = 100;
  c.hurt(100, 'genericKill', level.player);
  const drops = level.entities.filter((e) => e.stack).map((e) => e.stack);
  const bottle = drops.find((s) => s.item.id === 'ominous_bottle');
  check('a captain killed outside a raid drops its banner and an ominous bottle (amplifier 0-4)', drops.some((s) => raider.isOminousBanner(s)) && bottle && bottle.tag.ominousAmplifier >= 0 && bottle.tag.ominousAmplifier <= 4, drops.map((s) => s.item.id).join(','));
  check('the player killing a captain counts for Voluntary Exile', triggers.includes('killed_raid_captain'), triggers.join(','));
  const plain = new ill.Pillager(level);
  plain.moveTo(0, 64, 0, 0, 0);
  plain.finalizeSpawn('patrol');
  level.addEntity(plain);
  triggers.length = 0;
  plain.hurt(100, 'genericKill', level.player);
  check('...a plain pillager does not', triggers.length === 0);
  // a captain killed by something else (lava, a golem): no bottle
  for (const e of level.entities) if (e.stack) e.removed = true;
  level.entities = level.entities.filter((e) => !e.removed);
  const c2 = new ill.Pillager(level);
  c2.moveTo(0, 64, 0, 0, 0);
  c2.patrolLeader = true;
  c2.finalizeSpawn('patrol');
  level.addEntity(c2);
  c2.hurt(100, 'lava');
  const drops2 = level.entities.filter((e) => e.stack && !e.removed).map((e) => e.stack.item.id);
  check('a captain not killed by a player drops no ominous bottle', !drops2.includes('ominous_bottle'), drops2.join(','));
  const A = advMod.ADVANCEMENTS;
  check('Voluntary Exile and Who\'s the Pillager Now? can be earned', A.get('adventure/voluntary_exile').criteria.c.t === 'killed_raid_captain' && A.get('adventure/whos_the_pillager_now').criteria.c.victims?.[0] === 'pillager');
}

// --- vindicator
{
  const { level, player } = setup();
  const v = new ill.Vindicator(level);
  v.moveTo(0.5, 64, 6.5, 180, 0);
  v.finalizeSpawn('structure');
  level.addEntity(v);
  check('vindicator: iron axe, arms crossed while calm', v.mainHand?.item.id === 'iron_axe' && v.armPose() === 'crossed');
  const hp = player.health;
  let attacking = false;
  for (let i = 0; i < 200 && player.health === hp; i++) { level.tick(); if (v.armPose() === 'attacking') attacking = true; }
  check('vindicator goes for the player and hits it', player.health < hp, `hp=${player.health}`);
  check('vindicator raises its axe (attacking pose)', attacking);
  // Johnny
  const j = new ill.Vindicator(level);
  j.moveTo(20.5, 64, 20.5, 0, 0);
  j.finalizeSpawn('command');
  j.setCustomName('Johnny');
  level.addEntity(j);
  const cow = new animals.Cow(level);
  cow.moveTo(22.5, 64, 20.5, 0, 0);
  level.addEntity(cow);
  const pl = new ill.Pillager(level);
  pl.moveTo(20.5, 64, 22.5, 0, 0);
  level.addEntity(pl);
  player.gameMode = 'creative';
  for (let i = 0; i < 60 && j.target !== cow; i++) level.tick();
  check('Johnny goes for a cow, not a pillager', j.target === cow, `target=${j.target?.type}`);
}

// --- evoker
{
  const { level, player } = setup();
  const e = new evk.Evoker(level);
  e.moveTo(0.5, 64, 10.5, 180, 0);
  e.finalizeSpawn('structure');
  level.addEntity(e);
  let fangs = 0, vexes = 0, spell = false, fangHurt = false;
  const hp0 = player.health;
  for (let i = 0; i < 600; i++) {
    level.tick();
    if (e.spell !== 'none') spell = true;
    fangs = Math.max(fangs, level.entities.filter((x) => x instanceof evk.EvokerFangs).length);
    vexes = Math.max(vexes, level.entities.filter((x) => x instanceof evk.Vex).length);
    if (player.health < hp0) fangHurt = true;
    // (kept alive, so the evoker goes on casting whatever the dice say)
    player.health = hp0;
  }
  check('evoker casts (arms up)', spell);
  check('evoker summons vexes', vexes >= 3, `vexes=${vexes}`);
  check('evoker conjures fangs', fangs > 0, `fangs=${fangs}`);
  check('the player gets hurt (fangs or vexes)', fangHurt, `hp=${player.health}`);
  const vex = level.entities.find((x) => x instanceof evk.Vex);
  check('vexes carry iron swords that never drop, and take the evoker as owner', vex && vex.mainHand?.item.id === 'iron_sword' && vex.handDropChance === 0 && vex.owner() === e);
  // the fangs spare the evoker's allies
  const pil = new ill.Pillager(level);
  pil.moveTo(30.5, 64, 30.5, 0, 0);
  level.addEntity(pil);
  const f = new evk.EvokerFangs(level, 30.5, 64, 30.5, 0, 0, e);
  level.addEntity(f);
  const cow = new animals.Cow(level);
  cow.moveTo(30.5, 64, 30.5, 0, 0);
  level.addEntity(cow);
  const php = pil.health, chp = cow.health;
  tick(level, 12);
  check('fangs bite a cow for 6 and spare a pillager', cow.health === chp - 6 && pil.health === php, `cow ${chp}->${cow.health} pil ${php}->${pil.health}`);
  // wololo
  const { level: l2 } = setup();
  l2.player.gameMode = 'creative';
  const e2 = new evk.Evoker(l2);
  e2.moveTo(0.5, 64, 0.5, 0, 0);
  l2.addEntity(e2);
  const sheep = new animals.Sheep(l2);
  sheep.moveTo(4.5, 64, 0.5, 0, 0);
  sheep.color = 11;
  l2.addEntity(sheep);
  for (let i = 0; i < 400 && sheep.color === 11; i++) l2.tick();
  check('wololo: a blue sheep turns red', sheep.color === 14, `color=${sheep.color}`);
  // loot
  const e3 = new evk.Evoker(l2);
  e3.moveTo(10.5, 64, 10.5, 0, 0);
  l2.addEntity(e3);
  e3.lastHurtByPlayerTime = 100;
  e3.hurt(100, 'genericKill', l2.player);
  check('the evoker drops a totem of undying', l2.entities.some((x) => x.stack?.item.id === 'totem_of_undying'));
}

// --- vex life
{
  const { level } = setup();
  level.player.gameMode = 'creative';
  const v = new evk.Vex(level);
  v.moveTo(0.5, 70, 0.5, 0, 0);
  v.finalizeSpawn('summoned');
  v.setLimitedLife(10);
  level.addEntity(v);
  tick(level, 10);
  const h1 = v.health;
  tick(level, 20);
  check('a vex past its time starves a point a second', h1 === 13 && v.health === 12, `h1=${h1} h2=${v.health}`);
  // through walls
  const w = new evk.Vex(level);
  w.moveTo(0.5, 60.5, 0.5, 0, 0);
  level.addEntity(w);
  const hp = w.health;
  tick(level, 20);
  check('a vex inside stone takes no suffocation', w.health === hp);
}

// --- ravager
{
  const { level, player } = setup();
  const r = new rav.Ravager(level);
  r.moveTo(0.5, 64, 3.5, 180, 0);
  r.finalizeSpawn('command');
  level.addEntity(r);
  check('ravager: 100 hp, 12 damage, 0.75 knockback resistance', r.maxHealth === 100 && r.attackDamage === 12 && r.kbResist === 0.75);
  // a shield up in front of the player
  const shield = ItemStack.of('shield');
  player.inventory.offhand = shield;
  player.inventory.activeHand = 'off';
  ib.itemBehaviorOf('shield').use(level, player, shield);
  player.inventory.activeHand = 'main';
  player.headYaw = player.yaw = 0;
  for (let i = 0; i < 6; i++) player.useItemRemaining--;
  let stunned = 0, knocked = 0;
  for (let k = 0; k < 40; k++) {
    r.stunnedTick = 0; r.roarTick = 0;
    player.invulnerableTime = 0;
    player.dx = player.dz = 0;
    r.random.nextFloat();
    const ok = player.hurt(12, 'mob', r);
    if (r.stunnedTick === 40) stunned++;
    else if (player.dz < -0.5) knocked++;
    if (ok) break;
  }
  check('a ravager blocked by a shield is stunned or shoves hard, about half each', stunned > 5 && knocked > 5, `stunned=${stunned} knocked=${knocked}`);
  // the roar
  r.stunnedTick = 1; r.roarTick = 0;
  const cow = new animals.Cow(level);
  cow.moveTo(2.5, 64, 3.5, 0, 0);
  level.addEntity(cow);
  const pil = new ill.Pillager(level);
  pil.moveTo(-1.5, 64, 3.5, 0, 0);
  level.addEntity(pil);
  const chp = cow.health, php = pil.health;
  level.sounds = [];
  tick(level, 12);
  check('after the stun it roars: the sound, 6 to a cow, none to a pillager, both shoved', level.sounds.includes('entity.ravager.roar') && cow.health === chp - 6 && pil.health === php, `cow ${chp}->${cow.health} pil ${php}->${pil.health}`);
}

// --- witch as a raider
{
  const { level } = setup();
  const w = new witchMod.Witch(level);
  check('the witch is a raider now, never a captain', w instanceof raider.Raider && !w.canBeLeader());
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
