// (trial chambers) The 1.21 items, and where vanilla's creative tabs list them: the tuff family before the bricks and
// every copper block after the block of copper (vanilla CreativeModeTabs.BUILDING_BLOCKS: each age's blocks in turn,
// then the waxed ones'), the lightning rod with the functional blocks, honeycomb (vanilla HoneycombItem: it waxes
// copper, game/copper.ts; creative only while there are no bees) after the rabbit hide, the breeze rod after the
// blaze rod and the heavy core (epic) after that, the trial keys, the mace and the wind charge in the combat tab, the
// three new music discs where vanilla lists them among the others, and the flow, guster and scrape pottery sherds
// sorted in with the rest; the trial spawner after the spawner and the vault after the end portal frame, with the
// functional blocks. And what the vaults give that the game didn't have: the honey bottle (game/honeyBottle.ts)
// after the milk bucket, and the flow and bolt armour trims' smithing templates after the netherite upgrade's (there
// are no armour trims yet: they're kept, not used).

import type { Item, Rarity } from './item';
import { COPPER_KINDS, copperName } from '../world/blocksCopper';

type Reg = (i: Partial<Item> & { id: string }) => Item;

export function registerTrialChamberItems(reg: Reg, items: Map<string, Item>, list: Item[]): void {
  const take = (id: string): Item | null => {
    const i = list.findIndex((x) => x.id === id);
    return i < 0 ? null : list.splice(i, 1)[0];
  };
  const after = (id: string, prev: string): void => {
    if (!items.has(prev)) return;
    const it = take(id);
    if (it) list.splice(list.indexOf(items.get(prev)!) + 1, 0, it);
  };
  const before = (id: string, next: string): void => {
    if (!items.has(next)) return;
    const it = take(id);
    if (it) list.splice(list.indexOf(items.get(next)!), 0, it);
  };
  const run = (ids: string[], prev: string): void => {
    for (const id of ids) {
      after(id, prev);
      prev = id;
    }
  };

  // the tuff family (tuff itself is with the natural blocks) just before the bricks
  for (const id of ['tuff_stairs', 'tuff_slab', 'tuff_wall', 'chiseled_tuff', 'polished_tuff', 'polished_tuff_stairs', 'polished_tuff_slab',
    'polished_tuff_wall', 'tuff_bricks', 'tuff_brick_stairs', 'tuff_brick_slab', 'tuff_brick_wall', 'chiseled_tuff_bricks']) before(id, 'bricks');
  // every age's copper blocks, unwaxed then waxed, after the block of copper
  const copper: string[] = [];
  for (const waxed of [false, true]) for (let age = 0; age < 4; age++) for (const kind of COPPER_KINDS) copper.push(copperName(kind, age, waxed));
  run(copper.filter((n) => n !== 'copper_block'), 'copper_block');
  // (vanilla lists the lightning rod among the functional blocks after the suspicious gravel, and among the redstone
  // blocks too; an item here has one tab)
  if (items.has('lightning_rod')) items.get('lightning_rod')!.creativeTab = 'functional';
  after('lightning_rod', 'suspicious_gravel');

  // vanilla Items.HONEYCOMB
  reg({ id: 'honeycomb', texture: 'honeycomb' });
  after('honeycomb', 'rabbit_hide');
  // vanilla Items.BREEZE_ROD after the blaze rod, and Items.HEAVY_CORE (a block item, epic) after it
  after('breeze_rod', 'blaze_rod');
  if (items.has('heavy_core')) {
    Object.assign(items.get('heavy_core')!, { rarity: 'epic', creativeTab: 'ingredients' });
    after('heavy_core', 'breeze_rod');
  }
  // vanilla Items.TRIAL_KEY and OMINOUS_TRIAL_KEY, what unlocks a vault and an ominous vault (game/vault.ts)
  reg({ id: 'trial_key', texture: 'trial_key' });
  reg({ id: 'ominous_trial_key', texture: 'ominous_trial_key' });
  // vanilla MaceItem: 500 uses, epic, 6 attack damage at 0.6 attacks a second (its smash attack is game/mace.ts),
  // after the trident; vanilla WindChargeItem (thrown, entity/windCharge.ts) just before the bow
  reg({ id: 'mace', texture: 'mace', maxStack: 1, creativeTab: 'combat', maxDamage: 500, attackDamage: 6, attackSpeed: 0.6, rarity: 'epic' });
  after('mace', 'trident');
  reg({ id: 'wind_charge', texture: 'wind_charge', creativeTab: 'combat' });
  before('wind_charge', 'bow');
  // (M4) vanilla Items.BREEZE_SPAWN_EGG and BOGGED_SPAWN_EGG (the spawn eggs tab sorts itself by name)
  for (const m of ['breeze', 'bogged']) reg({ id: `${m}_spawn_egg`, texture: `${m}_spawn_egg`, creativeTab: 'spawn_eggs' });
  // vanilla JukeboxSongs CREATOR_MUSIC_BOX, CREATOR and PRECIPICE, where CreativeModeTabs.TOOLS_AND_UTILITIES has
  // them: 13, cat, blocks, chirp, far, mall, mellohi, stal, strad, ward, 11, Creator (Music Box), wait, Creator,
  // Precipice, otherside, relic, 5, pigstep (each after the last of those before it that the game has)
  const DISCS = ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'creator_music_box', 'wait', 'creator', 'precipice'].map((d) => `music_disc_${d}`);
  for (const [id, desc, rarity] of [
    ['music_disc_creator_music_box', 'Lena Raine - Creator (Music Box)', 'uncommon'], ['music_disc_creator', 'Lena Raine - Creator', 'rare'],
    ['music_disc_precipice', 'Aaron Cherof - Precipice', 'uncommon'],
  ] as [string, string, Rarity][]) {
    reg({ id, name: 'Music Disc', texture: id, maxStack: 1, creativeTab: 'tools', rarity, lore: [desc] });
    const prev = DISCS.slice(0, DISCS.indexOf(id)).reverse().find((d) => items.has(d));
    if (prev) after(id, prev);
  }
  // the trial spawner after the spawner (vanilla's spawn eggs tab opens with the two; the spawner is with the
  // functional blocks here) and the vault with the functional blocks after the end portal frame
  for (const id of ['trial_spawner', 'vault']) if (items.has(id)) items.get(id)!.creativeTab = 'functional';
  after('trial_spawner', 'spawner');
  after('vault', 'end_portal_frame');
  // vanilla Items.HONEY_BOTTLE (HoneyBottleItem): a drink of 6 food, 16 to a stack
  reg({ id: 'honey_bottle', texture: 'honey_bottle', creativeTab: 'food', maxStack: 16, food: { nutrition: 6, saturation: 0.1 } });
  after('honey_bottle', 'milk_bucket');
  // vanilla SmithingTemplateItem.createArmorTrimTemplate for TrimPatterns.FLOW and BOLT (uncommon): the pattern,
  // what it applies to and needs, as the netherite upgrade's shows them; vanilla's ingredients tab ends ..., flow, bolt
  for (const [id, pattern] of [['flow', 'Flow Armor Trim'], ['bolt', 'Bolt Armor Trim']]) {
    const tid = `${id}_armor_trim_smithing_template`;
    reg({ id: tid, name: 'Smithing Template', texture: tid, rarity: 'uncommon', lore: [pattern, '', 'Applies to:', ' §9Armor', 'Ingredients:', ' §9Ingots & Crystals'] });
  }
  run(['flow_armor_trim_smithing_template', 'bolt_armor_trim_smithing_template'], 'netherite_upgrade_smithing_template');
  // the trial chambers' pottery sherds (game/decoratedPot.ts), all the sherds then in name order where the first was
  for (const s of ['flow', 'guster', 'scrape']) reg({ id: `${s}_pottery_sherd`, texture: `${s}_pottery_sherd` });
  const sherds = list.filter((x) => x.id.endsWith('_pottery_sherd')).sort((a, b) => (a.id < b.id ? -1 : 1));
  const first = list.findIndex((x) => x.id.endsWith('_pottery_sherd'));
  for (const it of sherds) list.splice(list.indexOf(it), 1);
  list.splice(first, 0, ...sherds);
}
