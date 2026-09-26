// (bastions) The items that came with the bastion remnants and weren't in the game yet, and where vanilla's creative
// tabs list them (vanilla CreativeModeTabs): netherite scrap (what ancient debris smelts into; four of it and four gold
// make an ingot) before the netherite ingot, the block of netherite after the block of diamond, polished basalt with
// the blackstone family, the lodestone after the conduit, Pigstep (vanilla JukeboxSongs.PIGSTEP, rare) after 5, the
// snout armour trim's smithing template (vanilla SmithingTemplateItem.createArmorTrimTemplate for TrimPatterns.SNOUT,
// uncommon; there are no armour trims yet: it's kept, not used) with the other templates, and (M3) the piglin brute's
// spawn egg.

import type { Item } from './item';

type Reg = (i: Partial<Item> & { id: string }) => Item;

export function registerBastionItems(reg: Reg, items: Map<string, Item>, list: Item[]): void {
  const move = (id: string, to: (i: number) => number, ref: string): void => {
    const it = items.get(id), r = items.get(ref);
    if (!it || !r) return;
    list.splice(list.indexOf(it), 1);
    list.splice(to(list.indexOf(r)), 0, it);
  };
  const after = (id: string, prev: string) => move(id, (i) => i + 1, prev);
  const before = (id: string, next: string) => move(id, (i) => i, next);

  // vanilla Items.NETHERITE_SCRAP
  reg({ id: 'netherite_scrap', texture: 'netherite_scrap' });
  before('netherite_scrap', 'netherite_ingot');
  // the blocks' items (made with the rest from world/blocksBastion.ts)
  after('netherite_block', 'diamond_block');
  before('polished_basalt', 'blackstone_stairs');
  if (items.has('lodestone')) items.get('lodestone')!.creativeTab = 'functional';
  after('lodestone', 'conduit');
  // vanilla Items.MUSIC_DISC_PIGSTEP: Lena Raine's piece (its song is audio/gen/discPigstep.ts)
  reg({ id: 'music_disc_pigstep', name: 'Music Disc', texture: 'music_disc_pigstep', maxStack: 1, creativeTab: 'tools', rarity: 'rare', lore: ['Lena Raine - Pigstep'] });
  after('music_disc_pigstep', 'music_disc_5');
  // vanilla Items.SNOUT_ARMOR_TRIM_SMITHING_TEMPLATE, listed after the tide's (here: before the flow's, the first of
  // those after it the game has)
  const tid = 'snout_armor_trim_smithing_template';
  reg({ id: tid, name: 'Smithing Template', texture: tid, rarity: 'uncommon', lore: ['Snout Armor Trim', '', 'Applies to:', ' §9Armor', 'Ingredients:', ' §9Ingots & Crystals'] });
  if (items.has('flow_armor_trim_smithing_template')) before(tid, 'flow_armor_trim_smithing_template');
  else after(tid, 'netherite_upgrade_smithing_template');
}
