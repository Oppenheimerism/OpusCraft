// Decorated pots (vanilla DecoratedPotBlock, DecoratedPotBlockEntity, DecoratedPotRecipe, PotDecorations): crafted
// from four bricks or pottery sherds in a diamond (the one at the top the back, at the left and right those sides,
// at the bottom the front), each sherd's pattern on its side of the pot and a plain side for a brick. Right-clicked
// with an item it takes one of it (a stack's worth of one kind at most) with a wobble and a puff of dust; knocked
// on with nothing to put in, or a different item, it wobbles the other way. Broken with a tool it shatters into its
// four sherds and bricks (silk touch keeps it whole), otherwise it drops as the pot it was; what's in it spills out.
// A projectile shatters it too. The pot is drawn by its block entity's renderer (render/potRenderer.ts).

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { DIR_NAMES, dirFromYaw } from '../world/dir';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { ITEMS, ItemStack } from '../item/item';
import { levelOf } from '../item/enchantHelper';
import { registerHoverText } from '../item/hoverText';
import { registerCustomRecipe } from '../inventory/customRecipes';
import { registerBehavior } from './blockBehavior';
import { registerItemBehavior } from './itemBehavior';
import type { Level } from './level';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/**
 * vanilla ItemTags.DECORATED_POT_SHERDS, as far as the game has them (the desert wells' arms up and brewer; (Stage 5:
 * ocean) the ocean ruins' angler, blade, explorer, mourner, plenty, shelter and snort; the trial chambers' flow, guster and
 * scrape)
 */
export const SHERDS = [
  'angler_pottery_sherd', 'archer_pottery_sherd', 'arms_up_pottery_sherd', 'blade_pottery_sherd', 'brewer_pottery_sherd', 'explorer_pottery_sherd',
  // (trial chambers) the flow, guster and scrape sherds
  'flow_pottery_sherd', 'guster_pottery_sherd',
  'miner_pottery_sherd', 'mourner_pottery_sherd', 'plenty_pottery_sherd', 'prize_pottery_sherd', 'scrape_pottery_sherd', 'shelter_pottery_sherd',
  'skull_pottery_sherd', 'snort_pottery_sherd',
];
/** vanilla ItemTags.DECORATED_POT_INGREDIENTS: bricks and the sherds */
const INGREDIENTS = new Set(['brick', ...SHERDS]);

/** vanilla PotDecorations: the back, left, right and front sides' sherds, 'brick' for a plain side */
export type PotDecorations = readonly [string, string, string, string];
export const NO_DECORATIONS: PotDecorations = ['brick', 'brick', 'brick', 'brick'];

/** a pot item's decorations (vanilla getOrDefault(POT_DECORATIONS, EMPTY)) */
export function potDecorations(s: ItemStack | null): PotDecorations {
  const d = s?.tag?.potDecorations;
  return [0, 1, 2, 3].map((i) => (d?.[i] && ITEMS.has(d[i]) ? d[i] : 'brick')) as unknown as PotDecorations;
}

/** vanilla DecoratedPotBlockEntity.createDecoratedPotItem: a pot with these sides (all bricks: the plain pot, no component) */
export function decoratedPotItem(d: PotDecorations): ItemStack {
  const s = ItemStack.of('decorated_pot');
  if (d.some((x) => x !== 'brick')) s.tag = { potDecorations: [...d] };
  return s;
}

/** vanilla DecoratedPotBlockEntity.WobbleStyle: after an item goes in (7 ticks), after a knock (10) */
export const WOBBLE_POSITIVE = 0;
export const WOBBLE_NEGATIVE = 1;
export const WOBBLE_DURATION = [7, 10];

/**
 * vanilla DecoratedPotBlockEntity: the pot's sides and the one stack it holds (its container's one slot, which is
 * what breaking it spills), and the wobble it last gave (for the renderer)
 */
export class DecoratedPotBlockEntity extends BlockEntity {
  readonly id = 'decorated_pot';
  decorations: PotDecorations = NO_DECORATIONS;
  wobbleStartedAtTick = 0;
  lastWobbleStyle: number | null = null;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 1);
  }
  /** vanilla getTheItem */
  get theItem(): ItemStack | null {
    return this.container.get(0);
  }
  /** vanilla applyImplicitComponents: the item's decorations (the pots here carry no contents) */
  override applyComponents(s: ItemStack): void {
    this.decorations = potDecorations(s);
    this.container.changed();
  }
  /** vanilla getPotAsItem: a pot like this one */
  potAsItem(): ItemStack {
    return decoratedPotItem(this.decorations);
  }
  /** vanilla wobble: the block event (1, style) that starts it */
  wobble(level: Level, style: number): void {
    level.blockEvent(this.x, this.y, this.z, STATE_BLOCK[level.getState(this.x, this.y, this.z)], 1, style);
  }
  /** vanilla saveAdditional: the sherds, back, left, right, front (not for a plain pot) */
  protected override saveData(): Record<string, number | string> | undefined {
    return this.decorations.some((x) => x !== 'brick') ? { sherds: this.decorations.join(',') } : undefined;
  }
  protected override loadData(d: Record<string, number | string>): void {
    const s = typeof d.sherds === 'string' ? d.sherds.split(',') : [];
    this.decorations = [0, 1, 2, 3].map((i) => (s[i] && ITEMS.has(s[i]) ? s[i] : 'brick')) as unknown as PotDecorations;
  }
}

registerBlockEntityType('decorated_pot', (x, y, z) => new DecoratedPotBlockEntity(x, y, z));

/** vanilla ItemTags.BREAKS_DECORATED_POTS: swords, axes, pickaxes, shovels, hoes, the trident and the mace */
function breaksPots(s: ItemStack | null): boolean {
  const t = s?.item.tool?.type;
  return t === 'sword' || t === 'axe' || t === 'pickaxe' || t === 'shovel' || t === 'hoe' || s?.item.id === 'trident' || s?.item.id === 'mace';
}

/** vanilla EntityTypeTags.IMPACT_PROJECTILES: what shatters a pot it hits */
const IMPACT_PROJECTILES = new Set([
  'arrow', 'spectral_arrow', 'firework_rocket', 'snowball', 'egg', 'fireball', 'small_fireball', 'wither_skull', 'dragon_fireball', 'trident',
  'llama_spit', 'wind_charge', 'breeze_wind_charge',
]);

/** vanilla Projectile.mayInteract: a mob's projectile changes blocks only while mobs may grief */
function mayInteract(level: Level, projectile: Entity): boolean {
  const owner = (projectile as Entity & { owner?: Entity | null }).owner;
  return !owner || owner.type === 'player' || !!level.gameRules.mobGriefing;
}

const pot = getBlock('decorated_pot');

registerBehavior('decorated_pot', {
  /** vanilla getStateForPlacement: facing the way the player looks (its front toward them), in still water waterlogged */
  placement(ctx) {
    const here = ctx.world.getState(ctx.x, ctx.y, ctx.z);
    const water = blk(here).name === 'water' && blk(here).get(here, 'level') === 0;
    return pot.state({ facing: DIR_NAMES[dirFromYaw(ctx.yaw)], waterlogged: water, cracked: false });
  },
  /**
   * vanilla useItemOn: an item goes in when the pot's empty or holds fewer than a stack of the same (with a wobble,
   * the insert sound higher the fuller it is, and a puff of dust); anything else, and the main hand knocks on it
   * (useWithoutItem). The arm doesn't swing either way (the client's CONSUME)
   */
  useItemOn(level, x, y, z, st, stack, ctx) {
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof DecoratedPotBlockEntity)) return 'pass';
    const inside = be.theItem;
    if (stack.count > 0 && (!inside || (inside.sameItem(stack) && inside.count < inside.maxStack))) {
      be.wobble(level, WOBBLE_POSITIVE);
      const one = stack.copyWithCount(1);
      if (ctx.player.gameMode !== 'creative') ctx.player.inventory.consumeSelected(1);
      let fill: number;
      if (!inside) {
        be.container.items[0] = one;
        fill = one.count / one.maxStack;
      } else {
        inside.count++;
        fill = inside.count / inside.maxStack;
      }
      level.sound.play('block.decorated_pot.insert', x + 0.5, y + 0.5, z + 0.5, 1, 0.7 + 0.5 * fill);
      // (vanilla ServerLevel.sendParticles: 7, no spread, no speed)
      for (let i = 0; i < 7; i++) level.particles.spawn?.('dust_plume', x + 0.5, y + 1.2, z + 0.5, 0, 0, 0);
      be.container.changed();
      return 'consume';
    }
    if (ctx.hand !== 'off') knock(level, x, y, z, st);
    return 'consume';
  },
  /** vanilla useWithoutItem: an empty hand knocks on it (no swing: the client's CONSUME from useItemOn) */
  use(level, x, y, z, st) {
    knock(level, x, y, z, st);
    return 'consume';
  },
  /** vanilla DecoratedPotBlockEntity.triggerEvent(1, style): the wobble starts now */
  triggerEvent(level, x, y, z, _st, id, param) {
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof DecoratedPotBlockEntity) || id !== 1 || param < 0 || param >= WOBBLE_DURATION.length) return false;
    be.wobbleStartedAtTick = level.gameTime;
    be.lastWobbleStyle = param;
    return true;
  },
  /**
   * vanilla playerWillDestroy: a tool from #breaks_decorated_pots in the main hand (without silk touch,
   * #prevents_decorated_pot_shattering) cracks it first (UPDATE_INVISIBLE), so it breaks with the shatter and drops its sherds
   */
  playerWillDestroy(level, x, y, z, st, _player, held) {
    if (breaksPots(held) && levelOf(held, 'silk_touch') === 0) level.world.setStateQuiet(x, y, z, pot.with(st, 'cracked', true));
  },
  /** vanilla blocks/decorated_pot.json: cracked, its four sides' items (the dynamic "sherds" drop); else the pot as it was */
  drops(st, _tool, _r, _silk, _fortune, be) {
    const d = be instanceof DecoratedPotBlockEntity ? be.decorations : null;
    if (pot.get(st, 'cracked')) return d ? d.map((id) => ItemStack.of(id)) : [];
    return [decoratedPotItem(d ?? NO_DECORATIONS)];
  },
  /** vanilla onProjectileHit: an impact projectile that may change blocks (and may break them) shatters it */
  projectileHit(level, x, y, z, st, _hit, projectile) {
    if (!IMPACT_PROJECTILES.has(projectile.type) || level.gameRules.projectilesCanBreakBlocks === false || !mayInteract(level, projectile)) return;
    level.world.setStateQuiet(x, y, z, pot.with(st, 'cracked', true));
    level.destroyBlock(x, y, z, true, null, true);
  },
  /** vanilla getSoundType: a cracked pot's is SoundType.DECORATED_POT_CRACKED, whose break is the shatter */
  breakSound(st) {
    return pot.get(st, 'cracked') ? 'block.decorated_pot.shatter' : 'block.decorated_pot.break';
  },
  /** vanilla getCloneItemStack: the pot with its sides */
  cloneStack(level, x, y, z) {
    const be = level.world.getBlockEntity(x, y, z);
    return be instanceof DecoratedPotBlockEntity ? be.potAsItem() : null;
  },
});

/** vanilla DecoratedPotBlock.useWithoutItem: the knock's sound and the other wobble */
function knock(level: Level, x: number, y: number, z: number, _st: number): void {
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof DecoratedPotBlockEntity)) return;
  level.sound.play('block.decorated_pot.insert_fail', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  be.wobble(level, WOBBLE_NEGATIVE);
}

// vanilla DecoratedPotBlock.appendHoverText: for a decorated one, a blank line and then its front, left, right and
// back, grey (a brick for a plain side)
registerHoverText('decorated_pot', (s) => {
  if (!s.tag?.potDecorations) return [];
  const [back, left, right, front] = potDecorations(s);
  return ['', ...[front, left, right, back].map((id) => `§7${ITEMS.get(id)!.name}`)];
});

// vanilla DecoratedPotRecipe (crafting_decorated_pot): in a 3x3 grid, exactly four bricks or sherds, one each above,
// left of, right of and below the middle
registerCustomRecipe({
  assemble(grid, width) {
    if (width !== 3 || grid.length !== 9) return null;
    if (grid.filter((s) => s && s.count > 0).length !== 4) return null;
    const sides = [1, 3, 5, 7].map((i) => grid[i]);
    if (!sides.every((s) => s && INGREDIENTS.has(s.item.id))) return null;
    return decoratedPotItem(sides.map((s) => s!.item.id) as unknown as PotDecorations);
  },
});

let onCrafted: ((p: Player, sides: string[]) => void) | null = null;

/** the advancements' hook (vanilla RecipeCraftedTrigger): a pot taken from the crafting grid, with what its sides are */
export function setPotCraftedListener(f: ((p: Player, sides: string[]) => void) | null): void {
  onCrafted = f;
}

registerItemBehavior('decorated_pot', {
  /** vanilla ResultSlot.checkTakeAchievements: the special recipe's pot, its four sides the grid's four items */
  onCraftedBy(_level, p, stack) {
    if (stack.tag?.potDecorations) onCrafted?.(p, [...stack.tag.potDecorations]);
  },
});
