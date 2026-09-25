// M4d: the mace, on a flat stone world. Its smash attack: the damage by the height fallen (4 a block for 3, 2 a block
// for the next 5, 1 after that; density's half a block a level; before a critical hit's half again; none under a block
// and a half, or gliding); the blow stops the fall (the wielder hangs and forgives the fall back below the blow), the
// sounds by what the target stood on and how far the fall was, the dust pillar, the push round the target (twice
// from over 5 blocks; not the wielder, the target, their pets or a spectator), the landing spray. Breach against
// armour, wind burst's throw back up, its wear (a point a blow, two a block, none in creative, no blocks broken in
// creative), the enchantments it takes and the table's, its enchantability and its repair with breeze rods.

import { load, check, flatLevel, playerAt, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/spawner.ts', '/src/game/combat.ts', '/src/game/mace.ts', '/src/game/windBurst.ts', '/src/item/enchantHelper.ts',
  '/src/item/enchantments.ts', '/src/inventory/enchantMenus.ts', '/src/entity/wolf.ts',
]);
const G = 64;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const count = (sounds, name) => sounds.filter((s) => s.name === name).length;

function mace(ench = {}) {
  const s = new m.ItemStack(m.ITEMS.get('mace'), 1);
  if (Object.keys(ench).length) s.tag = { ...(s.tag ?? {}), enchantments: { ...ench } };
  return s;
}

/** a survival player falling `fall` blocks onto a zombie (and pigs 2 and 6 blocks from it); the blow struck */
function smash({ ench = {}, fall = 10, targetOnGround = true, armor = 0, hp = 1000, creative = false, extra } = {}) {
  const { level, sounds } = flatLevel(m, -2, -2, 2, 2);
  let dust = 0, spray = 0;
  level.particles.dustPillar = () => dust++;
  level.particles.blockParticle = () => spray++;
  const weapon = mace(ench);
  const p = playerAt(m, level, 0.5, G + 2.2, 0.5, { held: weapon });
  p.gameMode = creative ? 'creative' : 'survival';
  p.onGround = false;
  p.fallDistance = fall;
  p.dy = -1;
  const z = m.createMob('zombie', level);
  z.moveTo(0.5, targetOnGround ? G : G + 0.2, 1.2, 0, 0);
  level.addEntity(z);
  z.onGround = targetOnGround;
  z.maxHealth = z.health = hp;
  if (armor) z.armorValue = () => armor;
  const pig = m.createMob('pig', level);
  pig.moveTo(2.5, G, 1.2, 0, 0);
  level.addEntity(pig);
  const far = m.createMob('pig', level);
  far.moveTo(6.5, G, 1.2, 0, 0);
  level.addEntity(far);
  extra?.(level, p, z);
  p.attackStrengthTicker = 100;
  let worn = 0;
  const hp0 = z.health, fall0 = p.fallDistance;
  m.playerAttack(level, p, z, (n) => (worn += n));
  return { level, sounds, p, z, pig, far, weapon, dealt: hp0 - z.health, worn, fall0, dustCount: () => dust, sprayCount: () => spray };
}
/** vanilla's formula, for checking against: (6 + bonus) x 1.5 for the critical hit, less the zombie's 2 armour */
function expected(fall, density = 0, crit = fall > 0) {
  const b = fall <= 1.5 ? 0 : fall <= 3 ? 4 * fall : fall <= 8 ? 12 + 2 * (fall - 3) : 22 + fall - 8;
  const d = (6 + b + (fall > 1.5 ? 0.5 * density * fall : 0)) * (crit ? 1.5 : 1);
  return d * (1 - Math.max(2 * 0.2, 2 - d / 2) / 25);
}

// ---------------------------------------------------------------------------------------------------------------
// The damage

for (const fall of [0, 1, 1.5, 2, 3, 5, 8, 10, 20]) {
  const r = smash({ fall });
  check(`fall ${fall}: ${r.dealt.toFixed(2)} damage`, near(r.dealt, expected(fall), 1e-3), expected(fall).toFixed(3));
}
{
  const r = smash({ fall: 10, ench: { density: 5 } });
  check(`density V, fall 10: ${r.dealt.toFixed(2)} (25 more before the critical hit)`, near(r.dealt, expected(10, 5), 1e-3));
  const glide = smash({ fall: 10, extra: (_l, p) => (p.fallFlying = true) });
  check('gliding: no smash, only the critical hit', near(glide.dealt, expected(0, 0, true), 1e-3) && glide.dustCount() === 0, glide.dealt);
  const kill = smash({ fall: 10, hp: 20 });
  check("a smash's damage is its own (death.attack.mace_smash)", kill.z.lastDamageSource === 'maceSmash' && !kill.z.isAlive);
  const plain = smash({ fall: 0, hp: 20 });
  check('a plain blow is a player attack', plain.z.lastDamageSource === 'player');
}

// ---------------------------------------------------------------------------------------------------------------
// The smash

{
  const r = smash({ fall: 10 });
  check('smash: the fall stops dead (0.01 up, its fall distance spent)', near(r.p.dy, 0.01, 1e-9) && r.p.fallDistance === 0);
  const imp = m.impulseOf(r.p);
  check('smash: where it was struck is remembered, the fall back forgiven for two seconds', imp.ignoreFall && imp.grace === 40 && near(imp.impactPos[1], G + 2.2, 1e-9));
  check('smash: a heavy crash off a standing target from more than 5 blocks', count(r.sounds, 'item.mace.smash_ground_heavy') === 1 && count(r.sounds, 'item.mace.smash_ground') === 0);
  check('smash: a pillar of dust off its block (750: 250 in the middle, 500 in a ring)', r.dustCount() === 750, r.dustCount());
  check('smash: the pig 2 blocks off thrown (3.5 - 2) x 0.7 x 2 away and 0.7 up', near(r.pig.dx, 2.1, 1e-9) && near(r.pig.dy, 0.7, 1e-9) && near(r.pig.dz, 0, 1e-9), `${r.pig.dx} ${r.pig.dy}`);
  check('smash: the pig 6 blocks off left alone', r.far.dx === 0 && r.far.dy === 0);
  check('smash: a point of wear', r.worn === 1 && r.p.fallDistance === 0);
  const light = smash({ fall: 4 });
  check('from 4 blocks: the lighter crash, half the push', count(light.sounds, 'item.mace.smash_ground') === 1 && near(light.pig.dx, 1.05, 1e-9));
  const air = smash({ fall: 4, targetOnGround: false });
  check('a target in the air: the thwack instead', count(air.sounds, 'item.mace.smash_air') === 1 && count(air.sounds, 'item.mace.smash_ground') === 0);
  const low = smash({ fall: 1 });
  check('under a block and a half: no smash (no sound, dust, push or stop), the fall goes on', low.dustCount() === 0 && low.pig.dx === 0 && low.p.dy === -1 && low.p.fallDistance === 1 && count(low.sounds, 'item.mace.smash_ground') === 0);
  const creative = smash({ fall: 10, creative: true });
  check('creative: the smash, no wear', creative.worn === 0 && creative.dustCount() === 750 && creative.p.fallDistance === 0);
  // who isn't pushed: a spectator, the wielder's own tame wolf (another's is)
  const who = smash({
    fall: 10,
    extra: (level, p) => {
      const spec = new m.Player(level);
      spec.gameMode = 'spectator';
      spec.moveTo(-1.5, G, 1.2, 0, 0);
      level.addEntity(spec);
      for (const [x, owner] of [[0.5, p], [1.5, null]]) {
        const w = m.createMob('wolf', level);
        w.moveTo(x, G, 3.2, 0, 0);
        level.addEntity(w);
        if (owner) w.tameBy(owner);
      }
    },
  });
  const [spec] = who.level.entities.filter((e) => e.type === 'player' && e.gameMode === 'spectator');
  const [mine, stray] = who.level.entities.filter((e) => e.type === 'wolf');
  check("not pushed: a spectator, the wielder's own tame wolf", spec.dx === 0 && spec.dy === 0 && mine.dy === 0 && mine.isTame() && mine.isOwnedBy(who.p), `${spec.dy} ${mine.dy}`);
  check('pushed: a wild wolf', stray.dy > 0.6);
}
{
  // the landing after: a spray of the ground, and no fall damage from the height before the blow
  const r = smash({ fall: 20 });
  const imp = m.impulseOf(r.p);
  check('smash on a standing target: its landing kicks up the ground', imp.extraParticlesOnFall === true);
  const z = r.z;
  z.remove?.();
  for (let i = 0; i < 60 && !r.p.onGround; i++) r.level.tick();
  check(`landing: ${r.sprayCount()} specks (50 a block fallen)`, r.p.onGround && r.sprayCount() >= 100 && r.sprayCount() <= 120, r.sprayCount());
  check('landing: no fall damage for the 20 blocks before the blow', r.p.health === 20 && imp.extraParticlesOnFall === false, r.p.health);
}

// ---------------------------------------------------------------------------------------------------------------
// Breach, wind burst

{
  const plain = smash({ fall: 0, armor: 20 });
  const breach = smash({ fall: 0, armor: 20, ench: { breach: 4 } });
  // 6 damage on 20 armour: 0.68 of it effective; breach IV takes 0.6 off that
  check(`breach IV on 20 armour: ${breach.dealt.toFixed(2)} of 6, where it would be ${plain.dealt.toFixed(2)}`, near(plain.dealt, 6 * 0.32, 1e-6) && near(breach.dealt, 6 * 0.92, 1e-6));
  const b1 = smash({ fall: 0, armor: 4, ench: { breach: 2 } });
  check('breach II on 4 armour: none of it left (clamped at nothing)', near(b1.dealt, 6, 1e-6), b1.dealt);
}
for (const [lvl, k] of [[1, 1.2], [2, 1.75], [3, 2.2]]) {
  const r = smash({ fall: 5, ench: { wind_burst: lvl } });
  check(`wind burst ${lvl}: thrown back up at ${r.p.dy.toFixed(3)} (0.01 + ${k})`, near(r.p.dy, 0.01 + k, 1e-6) && count(r.sounds, 'entity.wind_charge.wind_burst') === 1);
}
{
  const low = smash({ fall: 1.2, ench: { wind_burst: 3 } });
  check('wind burst: nothing from under a block and a half', count(low.sounds, 'entity.wind_charge.wind_burst') === 0 && low.p.dy === -1);
  const r = smash({ fall: 5, ench: { wind_burst: 1 } });
  const imp = m.impulseOf(r.p);
  check("wind burst: no source, so the fall back isn't forgiven", imp.ignoreFall === false && imp.cause === null);
}

// ---------------------------------------------------------------------------------------------------------------
// Wear from mining, creative; enchanting and repair

{
  const { level } = flatLevel(m, -2, -2, 2, 2);
  const p = playerAt(m, level, 0.5, G, 0.5, { held: mace() });
  p.gameMode = 'survival';
  const inter = new m.Interaction(level, p);
  level.setBlock(2, G, 0, m.S('stone'));
  level.setBlock(3, G, 0, m.S('poppy'));
  inter.destroyBlock(2, G, 0);
  const afterStone = p.inventory.selectedItem.damage;
  inter.destroyBlock(3, G, 0);
  check('mining: two points of wear for a block, none for one that breaks at once', afterStone === 2 && p.inventory.selectedItem.damage === 2 && level.getState(2, G, 0) === 0);
  p.gameMode = 'creative';
  level.setBlock(2, G, 0, m.S('stone'));
  inter.destroyBlock(2, G, 0);
  check("creative: it doesn't break blocks", level.getState(2, G, 0) === m.S('stone'));
}
{
  const it = m.ITEMS.get('mace');
  check('enchantability 15', m.enchantmentValue(it) === 15);
  check('repaired with breeze rods', m.isValidRepairItem(it, new m.ItemStack(m.ITEMS.get('breeze_rod'), 1)) && !m.isValidRepairItem(it, new m.ItemStack(m.ITEMS.get('iron_ingot'), 1)));
  const takes = [...m.ENCHANTMENTS.values()].filter((e) => e.supported(it)).map((e) => e.id).sort();
  const want = ['bane_of_arthropods', 'breach', 'density', 'fire_aspect', 'mending', 'smite', 'unbreaking', 'vanishing_curse', 'wind_burst'];
  check(`takes: ${takes.join(', ')}`, JSON.stringify(takes) === JSON.stringify(want));
  const table = m.TABLE_ENCHANTMENTS.filter((e) => m.isPrimaryItem(e, it)).map((e) => e.id).sort();
  check(`the enchanting table offers: ${table.join(', ')}`, JSON.stringify(table) === JSON.stringify(['breach', 'density', 'fire_aspect', 'unbreaking']));
  check('density and breach exclude each other and smite', !m.areCompatible('density', 'breach') && !m.areCompatible('density', 'smite') && m.areCompatible('density', 'fire_aspect'));
}

await exitWithStatus(close);
