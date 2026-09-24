// The shield as an item (vanilla ShieldItem and ShieldDecorationRecipe): the use button holds it up (blocking is
// entity/shield.ts) unless an axe has knocked it down; a banner crafted with a shield that has no patterns yet puts
// its colour and patterns on it, and the shield is then named for the colour ("Red Shield") and lists the patterns
// like the banner does. Its looks are render/shieldRenderer.ts.

import { ITEMS, type ItemStack } from '../item/item';
import { registerItemBehavior } from './itemBehavior';
import { registerHoverText } from '../item/hoverText';
import { registerCustomRecipe, type Grid } from '../inventory/customRecipes';
import { COLOR_NAMES, bannerColorOf, layerDescription } from '../world/bannerPatterns';
import { isBanner } from './banners';

registerItemBehavior('shield', {
  // vanilla ShieldItem.use (ItemUtils.startUsingInstantly): held up for as long as the button is (72000 ticks); an
  // item on cooldown can't be used at all (vanilla ServerPlayerGameMode.useItem)
  use(_level, p, stack) {
    if (p.cooldowns.get('shield')) return 'pass';
    p.startUsingItem(stack, 72000);
    return 'success';
  },
});

// vanilla ShieldItem.getName: "<Colour> Shield" once a banner has given it a base colour
ITEMS.get('shield')!.stackName = (s) => {
  const c = s.tag?.baseColor;
  return c && COLOR_NAMES[c] ? `${COLOR_NAMES[c]} Shield` : 'Shield';
};

// vanilla ShieldItem.appendHoverText → BannerItem.appendHoverTextFromBannerBlockEntityTag: the first six layers, grey
registerHoverText('shield', (s) => (s.tag?.patterns ?? []).slice(0, 6).map((l) => `§7${layerDescription(l.pattern, l.color)}`));

/**
 * vanilla ShieldDecorationRecipe.matches: one banner and one shield without patterns (a colour alone doesn't stop it),
 * nothing else
 */
function decorationInput(grid: Grid): { shield: ItemStack; banner: ItemStack } | null {
  let shield: ItemStack | null = null, banner: ItemStack | null = null;
  for (const s of grid) {
    if (!s) continue;
    // (the cast: isBanner narrows, and anything else is looked at below)
    if (isBanner(s as ItemStack | null)) {
      if (banner) return null;
      banner = s;
    } else {
      if (s.item.id !== 'shield' || shield || s.tag?.patterns?.length) return null;
      shield = s;
    }
  }
  return shield && banner ? { shield, banner } : null;
}

registerCustomRecipe({
  // (vanilla canCraftInDimensions: any grid of two or more slots) the shield, copied, with the banner's patterns and
  // its colour as the base (vanilla assemble)
  assemble(grid, width) {
    if (grid.length < 2 || width < 1) return null;
    const input = decorationInput(grid);
    if (!input) return null;
    const out = input.shield.copyWithCount(1);
    const tag = { ...(out.tag ?? {}) };
    const layers = input.banner.tag?.patterns;
    if (layers?.length) tag.patterns = layers.map((l) => ({ ...l }));
    else delete tag.patterns;
    tag.baseColor = bannerColorOf(input.banner.item.id)!;
    out.tag = tag;
    return out;
  },
});
