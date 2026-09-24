// Smithing recipes (vanilla RecipeType.SMITHING): a template, a base and an addition. SmithingTransformRecipe is the
// netherite upgrade: diamond gear, the upgrade template and a netherite ingot make the netherite piece, which keeps
// everything the diamond one had (its wear, enchantments, name, trim).

import { ITEMS, ItemStack, cloneTag } from '../item/item';

export interface SmithingRecipe {
  isTemplateIngredient(s: ItemStack): boolean;
  isBaseIngredient(s: ItemStack): boolean;
  isAdditionIngredient(s: ItemStack): boolean;
  /** vanilla matches: all three slots fit */
  matches(template: ItemStack | null, base: ItemStack | null, addition: ItemStack | null): boolean;
  /** vanilla assemble (null: vanilla's EMPTY) */
  assemble(template: ItemStack | null, base: ItemStack | null, addition: ItemStack | null): ItemStack | null;
}

/** vanilla SmithingTransformRecipe */
class SmithingTransformRecipe implements SmithingRecipe {
  constructor(readonly template: string, readonly base: string, readonly addition: string, readonly result: string) {}
  isTemplateIngredient(s: ItemStack): boolean {
    return s.item.id === this.template;
  }
  isBaseIngredient(s: ItemStack): boolean {
    return s.item.id === this.base;
  }
  isAdditionIngredient(s: ItemStack): boolean {
    return s.item.id === this.addition;
  }
  matches(t: ItemStack | null, b: ItemStack | null, a: ItemStack | null): boolean {
    return !!t && !!b && !!a && this.isTemplateIngredient(t) && this.isBaseIngredient(b) && this.isAdditionIngredient(a);
  }
  /** the result with the base's components (ItemStack.applyComponents(base.getComponentsPatch())) */
  assemble(_t: ItemStack | null, b: ItemStack | null): ItemStack | null {
    if (!b) return null;
    return new ItemStack(ITEMS.get(this.result)!, 1, b.damage, cloneTag(b.tag));
  }
}

/**
 * vanilla SmithingTemplateItem: what the smithing screen shows with a template in its first slot, the empty base and
 * addition slots' icons (cycled through) and their onboarding tooltips
 */
export interface SmithingTemplate {
  baseIcons: string[];
  additionIcons: string[];
  baseDescription: string;
  additionDescription: string;
}

export const SMITHING_TEMPLATES: Record<string, SmithingTemplate> = {
  // vanilla SmithingTemplateItem.createNetheriteUpgradeTemplate
  netherite_upgrade_smithing_template: {
    baseIcons: ['slot_helmet', 'slot_sword', 'slot_chestplate', 'slot_pickaxe', 'slot_leggings', 'slot_axe', 'slot_boots', 'slot_hoe', 'slot_shovel'],
    additionIcons: ['slot_ingot'],
    baseDescription: 'Add diamond armor, weapon, or tool',
    additionDescription: 'Add Netherite Ingot',
  },
};

/** every smithing recipe, in the order the recipe manager has them */
export const SMITHING: SmithingRecipe[] = [];

// vanilla VanillaRecipeProvider.netheriteSmithing
for (const g of ['chestplate', 'leggings', 'helmet', 'boots', 'sword', 'axe', 'pickaxe', 'hoe', 'shovel']) {
  if (ITEMS.has(`diamond_${g}`) && ITEMS.has(`netherite_${g}`))
    SMITHING.push(new SmithingTransformRecipe('netherite_upgrade_smithing_template', `diamond_${g}`, 'netherite_ingot', `netherite_${g}`));
}

/** vanilla RecipeManager.getRecipesFor(SMITHING, input) */
export function smithingRecipesFor(t: ItemStack | null, b: ItemStack | null, a: ItemStack | null): SmithingRecipe[] {
  return SMITHING.filter((r) => r.matches(t, b, a));
}
