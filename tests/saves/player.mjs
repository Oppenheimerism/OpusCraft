// A player saved with the world and read back (game/playerData.ts, what Game.writeWorld and setUpWorld use): what's in
// the offhand is kept now (before, it was lost on Save and Quit), with its damage and its enchantments and name; an empty
// offhand stays empty; a save from before the offhand was kept reads with an empty one and everything else as it was;
// and the rest of the record is what it always was.

import { load, check, exitWithStatus, flatLevel } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();

const { m, close } = await load(['/src/game/playerData.ts', '/src/item/item.ts', '/src/entity/effects.ts']);

const { level } = flatLevel(m, -1, -1, 1, 1);

/** a survival player with things in its hands, armour and an effect */
function kitted() {
  const p = new m.Player(level);
  p.setGameMode('survival');
  p.moveTo(3.5, 64, -2.25, 90, 10);
  const inv = p.inventory;
  inv.main[0] = m.ItemStack.of('diamond_sword');
  inv.main[4] = m.ItemStack.of('torch', 40);
  inv.selected = 4;
  inv.armor[3] = m.ItemStack.of('iron_helmet');
  const shield = m.ItemStack.of('shield');
  shield.damage = 17;
  shield.tag = { enchantments: { unbreaking: 3 }, customName: 'Guard' };
  inv.offhand = shield;
  p.health = 13;
  p.xpLevel = 5;
  return p;
}

/** as IndexedDB keeps it: structured-cloned */
const stored = (d) => structuredClone(d);

// ---------------------------------------------------------------------------
// what's in the offhand comes back

{
  const p = kitted();
  const d = m.savePlayer(p, 'overworld');
  check('the offhand is in the save', Array.isArray(d.offhand) && d.offhand[0] === 'shield', JSON.stringify(d.offhand));
  const q = new m.Player(level);
  m.loadPlayer(q, stored(d));
  const off = q.inventory.offhand;
  check('...and comes back: the same item', off?.item.id === 'shield' && off.count === 1, off && `${off.item.id} x${off.count}`);
  check('...as worn as it was', off?.damage === 17, String(off?.damage));
  check('...with its enchantments and name', off?.tag?.enchantments?.unbreaking === 3 && off.tag.customName === 'Guard', JSON.stringify(off?.tag));
  check('...a stack of its own, not the saved one', off !== p.inventory.offhand && off?.tag !== p.inventory.offhand.tag);
  check('the hands and armour as they were', q.inventory.main[0]?.item.id === 'diamond_sword' && q.inventory.main[4]?.count === 40 && q.inventory.selected === 4 && q.inventory.armor[3]?.item.id === 'iron_helmet');
  check('health and levels as they were', q.health === 13 && q.xpLevel === 5, `${q.health} ${q.xpLevel}`);
  // (a stack of 16 in the offhand: a count past 1)
  p.inventory.offhand = m.ItemStack.of('ender_pearl', 16);
  const q2 = new m.Player(level);
  m.loadPlayer(q2, stored(m.savePlayer(p, 'overworld')));
  check('a stack in the offhand keeps its count', q2.inventory.offhand?.item.id === 'ender_pearl' && q2.inventory.offhand.count === 16);
}

// ---------------------------------------------------------------------------
// an empty offhand, and saves from before

{
  const p = kitted();
  p.inventory.offhand = null;
  const d = m.savePlayer(p, 'overworld');
  check('an empty offhand saves as nothing', d.offhand === null);
  const q = new m.Player(level);
  q.inventory.offhand = m.ItemStack.of('stick');
  m.loadPlayer(q, stored(d));
  check('...and reads back empty', q.inventory.offhand === null);

  const old = stored(m.savePlayer(kitted(), 'overworld'));
  delete old.offhand;
  const r = new m.Player(level);
  m.loadPlayer(r, old);
  check('a save from before the offhand was kept reads with an empty offhand', r.inventory.offhand === null);
  check('...and everything else as it was', r.inventory.main[0]?.item.id === 'diamond_sword' && r.inventory.armor[3]?.item.id === 'iron_helmet' && r.health === 13);
}

// ---------------------------------------------------------------------------
// the record is what it was, with the offhand beside the armour

{
  const d = m.savePlayer(kitted(), 'the_nether', { advancements: { 'story/root': ['crafting_table'] }, recipeBook: undefined });
  const keys = Object.keys(d).join(',');
  const want = 'x,y,z,yaw,pitch,health,food,saturation,exhaustion,xpLevel,xpProgress,xpTotal,xpSeed,uuid,gameMode,flying,selected,inventory,armor,offhand,spawn,respawn,advancements,recipeBook,dead,effects,vehicle,dimension,seenCredits,lastDeath,shoulderLeft,shoulderRight,wardenSpawnTracker';
  check('the record has every field it had, and the offhand', keys === want, keys);
  check('...its dimension and books as given', d.dimension === 'the_nether' && d.advancements['story/root'][0] === 'crafting_table');
  check('...its inventory 36 slots and its armour 4', d.inventory.length === 36 && d.armor.length === 4);
}

await exitWithStatus(close);
