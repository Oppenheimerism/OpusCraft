// M2c: the bastion chests' loot (1.21's chests/bastion_treasure, bastion_other, bastion_hoglin_stable and
// bastion_bridge): every item in the tables exists, each table rolled many times gives everything it lists and nothing
// else, the treasure room's netherite upgrade template and the bridge's lodestone every time, the snout trim one
// chest in twelve and (but for the treasure) the upgrade template one in ten, the worn and enchanted gear as listed.

import { load, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load(['/src/game/bastionLoot.ts', '/src/game/loot.ts', '/src/inventory/container.ts']);
const TABLES = m.BASTION_LOOT_TABLES;
const N = 4000;

check('tables: the four, registered', TABLES.length === 4 && TABLES.every((t) => Array.isArray(m.LOOT_TABLES[t]) && m.LOOT_TABLES[t].length >= 4));
// (spectral arrows aren't in the game yet: their entries stay, weighted as vanilla's, and roll nothing till they are)
const NOT_YET = new Set(['spectral_arrow']);
const missing = [];
for (const t of TABLES) for (const pool of m.LOOT_TABLES[t]) for (const e of pool.entries) if (e.item && !m.ITEMS.get(e.item) && !NOT_YET.has(e.item)) missing.push(`${t}: ${e.item}`);
check('tables: every item they list is in the game (spectral arrows to come)', missing.length === 0, missing.join(', '));

const rolls = {};
for (const t of TABLES) {
  rolls[t] = [];
  for (let i = 0; i < N; i++) rolls[t].push(m.rollLoot(t, new m.Rand(0x5eed + i * 7919, 0x100f)));
}
const has = (items, id) => items.some((s) => s.item.id === id);
const freq = (t, id) => rolls[t].filter((items) => has(items, id)).length / N;

// everything listed turns up, nothing else does
for (const t of TABLES) {
  const listed = new Set(m.LOOT_TABLES[t].flatMap((p) => p.entries.map((e) => e.item)).filter((id) => id && !NOT_YET.has(id)));
  if (listed.has('book')) listed.add('enchanted_book');
  const seen = new Set(rolls[t].flat().map((s) => s.item.id));
  const never = [...listed].filter((id) => !seen.has(id) && id !== 'book');
  const extra = [...seen].filter((id) => !listed.has(id));
  check(`${t}: all ${listed.size} of its items turn up in ${N} chests, nothing else`, never.length === 0 && extra.length === 0, `never ${never.join(', ')}; extra ${extra.join(', ')}`);
}

// the templates, the lodestone
check('bastion_treasure: a netherite upgrade template every time, just the one', rolls['chests/bastion_treasure'].every((items) => items.filter((s) => s.item.id === 'netherite_upgrade_smithing_template').reduce((a, s) => a + s.count, 0) === 1));
check('bastion_bridge: a lodestone every time', rolls['chests/bastion_bridge'].every((items) => has(items, 'lodestone')));
for (const t of TABLES) {
  const snout = freq(t, 'snout_armor_trim_smithing_template');
  check(`${t}: the snout armour trim template one chest in twelve (${(snout * 100).toFixed(1)} %)`, Math.abs(snout - 1 / 12) < 0.015);
  if (t === 'chests/bastion_treasure') continue;
  const up = freq(t, 'netherite_upgrade_smithing_template');
  check(`${t}: the netherite upgrade template one chest in ten (${(up * 100).toFixed(1)} %)`, Math.abs(up - 0.1) < 0.015);
}

// how many things a chest holds (entries, before stacks are split): the pools' rolls
const entries = (t) => rolls[t].map((items) => items.length);
const range = (a) => [Math.min(...a), Math.max(...a)];
{
  const [lo, hi] = range(entries('chests/bastion_treasure'));
  // (a roll that lands on spectral arrows gives nothing for now)
  check(`bastion_treasure: 3 + 3-4 + the template, and the odd trim (${lo}-${hi} stacks)`, lo >= 4 && hi <= 9);
  const [lo2, hi2] = range(entries('chests/bastion_bridge'));
  check(`bastion_bridge: the lodestone + 1-2 + 2-4, the odd template (${lo2}-${hi2} stacks)`, lo2 >= 3 && hi2 <= 9);
}

// the gear: worn as listed, enchanted as listed
{
  const dur = (s) => 1 - s.damage / s.item.maxDamage;
  const tre = rolls['chests/bastion_treasure'].flat().filter((s) => /^diamond_(sword|chestplate|helmet|leggings|boots)$/.test(s.item.id));
  const worn = tre.filter((s) => s.damage > 0), enchanted = tre.filter((s) => s.tag?.enchantments && Object.keys(s.tag.enchantments).length);
  check(`bastion_treasure: diamond gear, half of it worn to 80-100 % and enchanted, the rest as new (${worn.length} worn, ${enchanted.length} enchanted of ${tre.length})`,
    worn.every((s) => dur(s) >= 0.79) && Math.abs(enchanted.length / tre.length - 30 / 55) < 0.05 && tre.filter((s) => !s.tag?.enchantments).every((s) => s.damage === 0));
  const books = rolls['chests/bastion_other'].flat().filter((s) => s.item.id === 'enchanted_book');
  check(`bastion_other: its books are soul speed I-III (${books.length})`, books.length > 0 && books.every((s) => Object.keys(s.tag.stored).join() === 'soul_speed' && s.tag.stored.soul_speed >= 1 && s.tag.stored.soul_speed <= 3) &&
    new Set(books.map((s) => s.tag.stored.soul_speed)).size === 3);
  const boots = rolls['chests/bastion_other'].flat().filter((s) => s.item.id === 'golden_boots');
  const ssBoots = boots.filter((s) => s.tag?.enchantments?.soul_speed);
  check(`bastion_other: golden boots, some with soul speed (${ssBoots.length} of ${boots.length})`, ssBoots.length > 0 && ssBoots.length < boots.length);
  const xb = rolls['chests/bastion_other'].flat().filter((s) => s.item.id === 'crossbow' && s.damage > 0);
  check(`bastion_other: worn crossbows at 10-90 % (${xb.length})`, xb.length > 0 && xb.every((s) => dur(s) >= 0.09 && dur(s) <= 0.91));
  const stable = rolls['chests/bastion_hoglin_stable'].flat().filter((s) => s.item.id === 'diamond_pickaxe');
  check(`bastion_hoglin_stable: diamond pickaxes worn to 15-95 % and enchanted (${stable.length})`, stable.length > 0 && stable.every((s) => s.damage > 0 && dur(s) >= 0.14 && dur(s) <= 0.96 && Object.keys(s.tag?.enchantments ?? {}).length === 1));
}

// counts
{
  const counts = (t, id) => rolls[t].flat().filter((s) => s.item.id === id).map((s) => s.count);
  const inRange = (t, id, lo, hi) => {
    const c = counts(t, id);
    return c.length > 0 && Math.min(...c) === lo && Math.max(...c) === hi;
  };
  check('counts: 2-6 diamonds, 8-23 quartz, 5-15 gilded blackstone in the treasure', inRange('chests/bastion_treasure', 'diamond', 2, 6) && inRange('chests/bastion_treasure', 'quartz', 8, 23) && inRange('chests/bastion_treasure', 'gilded_blackstone', 5, 15));
  check('counts: 2-4 blocks of gold, 8-17 golden carrots in the stables', inRange('chests/bastion_hoglin_stable', 'gold_block', 2, 4) && inRange('chests/bastion_hoglin_stable', 'golden_carrot', 8, 17));
  check('counts: 8-12 gilded blackstone, 1 block of gold on the bridge', inRange('chests/bastion_bridge', 'gilded_blackstone', 8, 12) && inRange('chests/bastion_bridge', 'gold_block', 1, 1));
  check('counts: 2-10 chains, 5-17 arrows elsewhere', inRange('chests/bastion_other', 'chain', 2, 10) && inRange('chests/bastion_other', 'arrow', 5, 17));
  // Pigstep: one chest in twenty-two of the other chests (5 of 99 in the first pool)
  const pig = freq('chests/bastion_other', 'music_disc_pigstep');
  check(`bastion_other: Pigstep one chest in twenty (${(pig * 100).toFixed(1)} %)`, Math.abs(pig - 5 / 99) < 0.012);
}

// a chest filled from its seed: the same every time, and everything in it
{
  const c1 = new m.SimpleContainer(27), c2 = new m.SimpleContainer(27);
  m.fillContainer(c1, 'chests/bastion_treasure', 12345);
  m.fillContainer(c2, 'chests/bastion_treasure', 12345);
  const dump = (c) => c.items.map((s) => (s ? `${s.item.id}x${s.count}` : '-')).join(',');
  check('a chest: the same loot from the same seed', dump(c1) === dump(c2) && c1.items.some(Boolean));
  const total = c1.items.filter(Boolean).reduce((a, s) => a + s.count, 0);
  const rolled = m.rollLoot('chests/bastion_treasure', new m.Rand(12345, 0x100f)).reduce((a, s) => a + s.count, 0);
  check(`a chest: all the rolled items in it (${total})`, total === rolled);
}

await exitWithStatus(close);
