// M5b: the 1.21 advancements. The tree (Minecraft: Trial(s) Edition, under the game's own name, under Adventure, its six children, Revaulting
// under Under Lock and Key; frames and icons); Trial(s) Edition inside a trial chambers' piece (every 20 ticks, the
// Overworld only); Blowback for a breeze killed by a breeze's wind charge turned back by the player (not a player's own
// charge, not another mob); Who Needs Rockets? for a wind charge throwing the player 7 blocks up (a jump and a charge;
// thrown down as the jump starts, through the game's use of the item; a charge alone isn't enough, nor one thrown a
// tick late, nor a breeze's); Over-Overkill for a mace smash of 100 or more (not 90, not a sword);
// the breeze and the bogged in Monster Hunter and Monsters Hunted. Crafters Crafting Crafters is in m5a-crafter.mjs;
// Lighten Up, Under Lock and Key and Revaulting were earned in their own tests (m1b, m2b).

import { load, check, flatLevel, playerAt, rightClick, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/brand.ts', '/src/game/spawner.ts', '/src/entity/breeze.ts', '/src/entity/windCharge.ts', '/src/game/combat.ts', '/src/game/mace.ts', '/src/game/windBurst.ts', '/src/game/windCharges.ts',
  '/src/game/trialChamberProgress.ts', '/src/game/trialChamberStructure.ts', '/src/entity/effects.ts',
]);
const G = 64;
const A = (id) => m.ADVANCEMENTS.get(`adventure/${id}`);
/** a fresh set of advancements, given the triggers a level heard */
function earned(triggers) {
  const adv = new m.PlayerAdvancements();
  for (const t of triggers) adv.trigger(t.type, t.payload);
  return adv;
}

// ---------------------------------------------------------------------------------------------------------------
// The tree

{
  const kids = ['under_lock_and_key', 'blowback', 'who_needs_rockets', 'crafters_crafting_crafters', 'lighten_up', 'overoverkill'];
  check('Trial(s) Edition, with the game\'s name before it, under Adventure, "Step foot in a Trial Chamber", chiseled tuff',
    A('minecraft_trials_edition')?.parent === 'adventure/root' && A('minecraft_trials_edition').title === `${m.GAME_NAME}: Trial(s) Edition` && A('minecraft_trials_edition').icon === 'chiseled_tuff');
  check('its six children, and Revaulting under Under Lock and Key', kids.every((k) => A(k)?.parent === 'adventure/minecraft_trials_edition') && A('revaulting').parent === 'adventure/under_lock_and_key');
  check('frames: Blowback and Over-Overkill challenges, Revaulting a goal, the rest tasks',
    A('blowback').frame === 'challenge' && A('overoverkill').frame === 'challenge' && A('revaulting').frame === 'goal' &&
    ['minecraft_trials_edition', 'under_lock_and_key', 'who_needs_rockets', 'crafters_crafting_crafters', 'lighten_up'].every((k) => A(k).frame === 'task'));
  const all = ['minecraft_trials_edition', ...kids, 'revaulting'];
  check('every one of them can be earned (none left impossible)', all.every((k) => Object.values(A(k).criteria).every((c) => c.t !== 'impossible')), all.filter((k) => Object.values(A(k).criteria).some((c) => c.t === 'impossible')).join());
}

// ---------------------------------------------------------------------------------------------------------------
// Minecraft: Trial(s) Edition

{
  // seed 12345's nearest trial chambers: its end room at -474, -33, -311 (tests/trial-chambers/m3b-generation.mjs)
  const inside = { x: -474.5, y: -33, z: -310.5 };
  check('the spot is inside a piece of a trial chambers', m.inTrialChambers('12345', inside.x, inside.y, inside.z));
  const over = (t) => ({ gameTime: t, seed: '12345', dim: { id: 'overworld' } });
  const got = (level, p) => {
    const adv = new m.PlayerAdvancements();
    m.tickTrialChamberProgress(level, p, adv);
    return adv.isDone(A('minecraft_trials_edition'));
  };
  check('standing in one: earned (on the twentieth tick)', got(over(40), inside));
  check('only every 20 ticks', !got(over(41), inside));
  check('not outside one', !got(over(40), { x: -474.5, y: 70, z: -310.5 }) && !got(over(40), { x: 0.5, y: -33, z: 0.5 }));
  check('not in the Nether at the same spot', !got({ gameTime: 40, seed: '12345', dim: { id: 'the_nether' } }, inside));
}

// ---------------------------------------------------------------------------------------------------------------
// Blowback

/** a breeze (or `victimType`) with half a point of health 3 blocks south of a player; a wind charge of `kind` coming at the player, struck back */
function turnBack(kind, victimType = 'breeze') {
  const { level, triggers } = flatLevel(m, -2, -2, 2, 2);
  const p = playerAt(m, level, 0.5, G, 0.5, { yaw: 0, pitch: 0 });
  p.gameMode = 'survival';
  const victim = m.createMob(victimType, level);
  victim.moveTo(0.5, G, 3.5, 0, 0);
  level.addEntity(victim);
  // (half a point: a zombie's armour takes the charge's point down to 0.94)
  victim.health = 0.5;
  const shooter = m.createMob('breeze', level);
  shooter.moveTo(0.5, G, 8.5, 0, 0);
  level.addEntity(shooter);
  const c = kind === 'breeze' ? new m.BreezeWindCharge(level, shooter) : new m.WindCharge(level, p);
  c.moveTo(0.5, G + 1, 1.8, 0, 0);
  c.shoot(0, 0, -1, 0.7, 0);
  level.addEntity(c);
  if (kind === 'breeze') {
    // (it's a block and a bit off, coming at them: struck now, as a breeze's charge may be the moment it's in reach)
    p.attackStrengthTicker = 100;
    m.playerAttack(level, p, c, () => {});
  } else c.shoot(0, 0, 1, 1, 0);
  for (let i = 0; i < 20 && !c.removed; i++) c.tick();
  return { victim, triggers, owner: c.owner, p };
}
{
  const t = turnBack('breeze');
  check("a breeze's charge struck back is the player's, and kills the breeze", t.owner === t.p && !t.victim.isAlive);
  const kill = t.triggers.find((x) => x.type === 'player_killed_entity');
  check('the kill is told with the charge as its direct entity', kill?.payload.killedWith.victim === 'breeze' && kill.payload.killedWith.direct === 'breeze_wind_charge', JSON.stringify(kill?.payload));
  check('Blowback', earned(t.triggers).isDone(A('blowback')));
  const own = turnBack('player');
  check("a player's own charge killing a breeze: not Blowback", !own.victim.isAlive && !earned(own.triggers).isDone(A('blowback')));
  const zombie = turnBack('breeze', 'zombie');
  check('a breeze\'s charge struck back killing a zombie: not Blowback', !zombie.victim.isAlive && !earned(zombie.triggers).isDone(A('blowback')));
}

// ---------------------------------------------------------------------------------------------------------------
// Who Needs Rockets?

/** a survival player thrown up by a burst at their feet (jumping as it goes off, or not); how high, what was heard */
function launch(kind, jump) {
  const { level, triggers } = flatLevel(m, -2, -2, 2, 2);
  const p = playerAt(m, level, 0.5, G, 0.5);
  p.gameMode = 'survival';
  for (let i = 0; i < 2; i++) level.tick();
  if (jump) {
    // (vanilla LivingEntity.jumpFromGround: 0.42 up)
    p.dy = 0.42;
    p.onGround = false;
  }
  const c = kind === 'breeze' ? new m.BreezeWindCharge(level, null) : new m.WindCharge(level, p);
  c.explode(p.x, p.y + 0.25, p.z);
  let top = p.y;
  for (let i = 0; i < 200; i++) {
    level.tick();
    top = Math.max(top, p.y);
    if (i > 5 && p.onGround) break;
  }
  return { rise: top - G, triggers, fall: triggers.find((x) => x.type === 'fall_after_explosion') };
}
{
  check('the game listens for falls after a burst', m.impulseHooks.fallAfterExplosion === m.fallAfterExplosionTrigger);
  const jumpy = launch('player', true);
  check(`a jump and a wind charge: up ${jumpy.rise.toFixed(1)} blocks, the start of the fall told`, jumpy.rise >= 7 && jumpy.fall?.payload.fallAfterExplosion.cause === 'wind_charge' && jumpy.fall.payload.fallAfterExplosion.rise >= 7, JSON.stringify(jumpy.fall?.payload));
  check('Who Needs Rockets?', earned(jumpy.triggers).isDone(A('who_needs_rockets')));
  const flat = launch('player', false);
  check(`a wind charge alone: up ${flat.rise.toFixed(1)} blocks, not enough`, flat.rise < 7 && !!flat.fall && !earned(flat.triggers).isDone(A('who_needs_rockets')));
  const breeze = launch('breeze', true);
  check("a breeze's charge: not a wind charge of one's own", !earned(breeze.triggers).isDone(A('who_needs_rockets')), JSON.stringify(breeze.fall?.payload));
}

/** a survival player throwing a wind charge straight down (used as the game uses it), `late` ticks into a jump (-1: no jump) */
function thrown(late) {
  const { level, triggers } = flatLevel(m, -3, -3, 3, 3);
  const p = playerAt(m, level, 0.5, G, 0.5, { yaw: 0, pitch: 90, held: m.ItemStack.of('wind_charge', 16) });
  p.gameMode = 'survival';
  for (let i = 0; i < 3; i++) level.tick();
  if (late >= 0) {
    p.dy = 0.42;
    p.onGround = false;
    for (let i = 0; i < late; i++) level.tick();
  }
  rightClick(m, level, p);
  for (let i = 0; i < 200; i++) {
    level.tick();
    if (i > 5 && p.onGround) break;
  }
  const fall = triggers.find((x) => x.type === 'fall_after_explosion');
  return { triggers, told: fall?.payload.fallAfterExplosion.rise ?? 0 };
}
{
  const now = thrown(0), late = thrown(1), still = thrown(-1);
  check(`thrown straight down as the jump starts: ${now.told.toFixed(1)} blocks up from the burst, Who Needs Rockets?`, now.told >= 7 && earned(now.triggers).isDone(A('who_needs_rockets')));
  check(`a tick into the jump (${late.told.toFixed(1)}) or with no jump (${still.told.toFixed(1)}): not enough`, late.told > 3 && late.told < 7 && still.told > 3 && still.told < 7 &&
    !earned(late.triggers).isDone(A('who_needs_rockets')) && !earned(still.triggers).isDone(A('who_needs_rockets')));
}

// ---------------------------------------------------------------------------------------------------------------
// Over-Overkill

/** a survival player falling `fall` blocks onto a zombie with `weapon`, the blow struck */
function smash(fall, weapon = 'mace', ench = {}) {
  const { level, triggers } = flatLevel(m, -2, -2, 2, 2);
  const w = m.ItemStack.of(weapon);
  if (Object.keys(ench).length) w.tag = { enchantments: { ...ench } };
  const p = playerAt(m, level, 0.5, G + 2.2, 0.5, { held: w });
  p.gameMode = 'survival';
  p.onGround = false;
  p.fallDistance = fall;
  p.dy = -1;
  const z = m.createMob('zombie', level);
  z.moveTo(0.5, G, 1.2, 0, 0);
  level.addEntity(z);
  z.maxHealth = z.health = 1000;
  p.attackStrengthTicker = 100;
  m.playerAttack(level, p, z, () => {});
  const hurt = triggers.find((x) => x.type === 'player_hurt_entity');
  return { triggers, hurt: hurt?.payload.hurtEntity };
}
{
  const big = smash(50);
  check(`a smash from 50 blocks: ${big.hurt?.dealt} dealt, a mace smash, the mace in hand`, big.hurt?.dealt === (6 + 22 + 42) * 1.5 && big.hurt.source === 'maceSmash' && big.hurt.weapon === 'mace', JSON.stringify(big.hurt));
  check('Over-Overkill', earned(big.triggers).isDone(A('overoverkill')));
  const small = smash(40);
  check(`from 40 blocks: ${small.hurt?.dealt}, not enough`, small.hurt?.dealt === 90 && !earned(small.triggers).isDone(A('overoverkill')));
  const dense = smash(20, 'mace', { density: 5 });
  check(`Density V from 20 blocks: ${dense.hurt?.dealt}, enough`, dense.hurt?.dealt >= 100 && earned(dense.triggers).isDone(A('overoverkill')));
  const adv = new m.PlayerAdvancements();
  adv.trigger('player_hurt_entity', { hurtEntity: { dealt: 150, source: 'player', weapon: 'netherite_sword' } });
  check('a sword blow of 150: not Over-Overkill', !adv.isDone(A('overoverkill')));
}

// ---------------------------------------------------------------------------------------------------------------
// Monster Hunter and Monsters Hunted

{
  const hunter = m.ADVANCEMENTS.get('adventure/kill_a_mob'), hunted = m.ADVANCEMENTS.get('adventure/kill_all_mobs');
  check('Monsters Hunted asks for the breeze and the bogged', !!hunted && ['breeze', 'bogged'].every((t) => Object.values(hunted.criteria).some((c) => c.t === 'kill' && c.type === t)));
  const adv = new m.PlayerAdvancements();
  adv.trigger('kill', { killed: { type: 'breeze', hostile: true, distance: 2, byArrow: false } });
  check('Monster Hunter for a breeze', adv.isDone(hunter));
  const adv2 = new m.PlayerAdvancements();
  adv2.trigger('kill', { killed: { type: 'bogged', hostile: true, distance: 2, byArrow: true } });
  check('Monster Hunter for a bogged', adv2.isDone(hunter));
}

await exitWithStatus(close);
