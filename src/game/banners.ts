// What banners do (vanilla BannerBlock, WallBannerBlock, StandingAndWallBlockItem, BannerItem, BannerPatternItem,
// BannerDuplicateRecipe, CauldronInteraction.BANNER and Raid.getLeaderBannerInstance): a banner stands on a block or
// hangs from the side of one, whichever way the player looks first allows; it keeps its patterns (and name) when
// placed and broken; a patterned banner copies onto a blank one of its colour; a water cauldron washes its top layer
// off. The blocks are in world/blocksBanners, the block entity in world/blockEntity, the looks in render/bannerRenderer.

// (the water cauldron's own uses are registered there first; washing a banner goes in front of them)
import './villageBlocks';
import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { DOWN, UP, DX, DZ, OPPOSITE, DIR_NAMES } from '../world/dir';
import type { World } from '../world/world';
import { registerBehavior, behaviorOfBlock, type ItemUseResult, type UseContext } from './blockBehavior';
import { lookingDirections, type PlaceContext } from './blockRules';
import { isSolidBlock } from '../world/gen/patches';
import { BannerBlockEntity } from '../world/blockEntity';
import { ItemStack, type BannerLayer } from '../item/item';
import { registerHoverText } from '../item/hoverText';
import { registerCustomRecipe, type Grid } from '../inventory/customRecipes';
import { BANNER_COLORS, PATTERN_ITEMS, layerDescription, bannerColorOf } from '../world/bannerPatterns';
import type { Level } from './level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/**
 * vanilla BlockStateBase.isSolid: the legacy "solid" flag (a collision shape filling most of the block); banners and
 * signs are forced solid (Properties.forceSolidOn), so one can stand on another
 */
export function legacySolid(st: number): boolean {
  return /_(banner|sign)$/.test(blk(st).name) || isSolidBlock(st);
}

/** vanilla BannerBlock.canSurvive: something solid under it */
function standingSurvives(world: World, x: number, y: number, z: number): boolean {
  return legacySolid(world.getState(x, y - 1, z));
}

/** vanilla WallBannerBlock.canSurvive: something solid behind it */
function wallSurvives(world: World, x: number, y: number, z: number, st: number): boolean {
  const f = DIR_NAMES.indexOf(blk(st).get<string>(st, 'facing') as (typeof DIR_NAMES)[number]);
  return legacySolid(world.getState(x - DX[f], y, z - DZ[f]));
}

/**
 * vanilla BlockPlaceContext.getNearestLookingDirections: the way the player looks, nearest first, but the side the
 * clicked face looks away from before all (unless the click replaces what was there)
 */
function nearestLookingDirections(ctx: PlaceContext): number[] {
  const dirs = lookingDirections(ctx.yaw, ctx.pitch);
  if (ctx.replaceClicked) return dirs;
  const first = OPPOSITE[ctx.face];
  return [first, ...dirs.filter((d) => d !== first)];
}

/** vanilla BannerBlock.getStateForPlacement: turned to face the player (RotationSegment.convertToSegment(yRot + 180)) */
export function bannerRotation(yaw: number): number {
  return Math.floor(((yaw + 180) * 16) / 360 + 0.5) & 15;
}

/** vanilla WallBannerBlock.getStateForPlacement: the first horizontal way the player looks with a solid block there */
function wallPlacement(wall: Block, ctx: PlaceContext): number | null {
  for (const d of nearestLookingDirections(ctx)) {
    if (d === UP || d === DOWN) continue;
    const st = wall.state({ facing: DIR_NAMES[OPPOSITE[d]] });
    if (wallSurvives(ctx.world, ctx.x, ctx.y, ctx.z, st)) return st;
  }
  return null;
}

/** the banner item its patterns, name and the rest go back onto (vanilla loot: copy_components from the block entity) */
function bannerDrop(color: string, be: unknown): ItemStack[] {
  const s = ItemStack.of(`${color}_banner`);
  if (be instanceof BannerBlockEntity) s.tag = be.itemTag();
  return [s];
}

for (const color of BANNER_COLORS) {
  const standing = getBlock(`${color}_banner`), wall = getBlock(`${color}_wall_banner`);
  registerBehavior(standing.name, {
    /**
     * vanilla StandingAndWallBlockItem.getPlacementState (attached below): in the order the player looks, standing
     * when that's down, hanging on the wall when it's to a side; never from above
     */
    placement(ctx) {
      const onWall = wallPlacement(wall, ctx);
      const upright = standing.state({ rotation: bannerRotation(ctx.yaw) });
      for (const d of nearestLookingDirections(ctx)) {
        if (d === UP) continue;
        const st = d === DOWN ? upright : onWall;
        if (st !== null && (d === DOWN ? standingSurvives(ctx.world, ctx.x, ctx.y, ctx.z) : wallSurvives(ctx.world, ctx.x, ctx.y, ctx.z, st))) return st;
      }
      return null;
    },
    canSurvive: (w, x, y, z) => standingSurvives(w, x, y, z),
    drops: (_st, _tool, _r, _silk, _fortune, be) => bannerDrop(color, be),
  });
  registerBehavior(wall.name, {
    canSurvive: wallSurvives,
    drops: (_st, _tool, _r, _silk, _fortune, be) => bannerDrop(color, be),
  });
  // vanilla BannerItem.appendHoverTextFromBannerBlockEntityTag: the first six layers, grey
  registerHoverText(`${color}_banner`, (s) => (s.tag?.patterns ?? []).slice(0, 6).map((l) => `§7${layerDescription(l.pattern, l.color)}`));
}

// vanilla BannerPatternItem.appendHoverText: what it weaves, grey
for (const [id, p] of Object.entries(PATTERN_ITEMS)) registerHoverText(id, () => [`§7${p.desc}`]);

/** a banner item's layers (none when it's blank) */
export function bannerLayers(s: ItemStack | null): BannerLayer[] {
  return s?.tag?.patterns ?? [];
}

/** vanilla BannerItem: one of the sixteen banners */
export function isBanner(s: ItemStack | null): s is ItemStack {
  return !!s && bannerColorOf(s.item.id) !== null && !s.item.id.includes('_wall_');
}

/**
 * vanilla BannerDuplicateRecipe: a banner with patterns (six at most) and a blank one of its colour, nothing else:
 * the blank one becomes a copy and the patterned one stays in the grid
 */
function duplicateInput(grid: Grid): { patterned: ItemStack } | null {
  let color: string | null = null;
  let patterned: ItemStack | null = null, blank: ItemStack | null = null;
  for (const s of grid) {
    if (!s) continue;
    if (!isBanner(s)) return null;
    const c = bannerColorOf(s.item.id);
    if (color === null) color = c;
    else if (color !== c) return null;
    const n = bannerLayers(s).length;
    if (n > 6) return null;
    if (n > 0) {
      if (patterned) return null;
      patterned = s;
    } else {
      if (blank) return null;
      blank = s;
    }
  }
  return patterned && blank ? { patterned } : null;
}

registerCustomRecipe({
  // (vanilla canCraftInDimensions: any grid of two or more slots)
  assemble(grid, width) {
    if (grid.length < 2 || width < 1) return null;
    const input = duplicateInput(grid);
    return input ? input.patterned.copyWithCount(1) : null;
  },
  remaining(grid) {
    return grid.map((s) => (s && bannerLayers(s).length ? s.copyWithCount(1) : null));
  },
});

// ---------------------------------------------------------------------------
// Washing (vanilla CauldronInteraction.BANNER, in the water cauldron's interactions)

/** vanilla LayeredCauldronBlock.lowerFillLevel */
function lowerFillLevel(level: Level, x: number, y: number, z: number, st: number): void {
  const l = blk(st).get<number>(st, 'level') - 1;
  const now = l === 0 ? getBlock('cauldron').defaultState : blk(st).with(st, 'level', l);
  level.setBlock(x, y, z, now);
  level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { state: now });
}

/** vanilla CauldronInteraction.bannerInteraction: one banner of the stack loses its top layer, for a level of water */
function washBanner(level: Level, x: number, y: number, z: number, st: number, stack: ItemStack, ctx: UseContext): ItemUseResult {
  const layers = bannerLayers(stack);
  if (!layers.length) return 'pass';
  const p = ctx.player, inv = p.inventory;
  const washed = stack.copyWithCount(1);
  washed.tag!.patterns = layers.slice(0, -1).map((l) => ({ ...l }));
  if (!washed.tag!.patterns.length) delete washed.tag!.patterns;
  if (!Object.keys(washed.tag!).length) washed.tag = null;
  // (vanilla ItemStack.consume: creative players keep theirs)
  if (p.gameMode !== 'creative') stack.count--;
  if (stack.count <= 0) inv.setSelectedItem(washed);
  else {
    const left = inv.add(washed);
    if (left > 0) p.dropItem(washed.copyWithCount(left), false);
  }
  lowerFillLevel(level, x, y, z, st);
  return 'success';
}

{
  const cauldron = getBlock('water_cauldron');
  const theirs = behaviorOfBlock(cauldron.id)?.useItemOn;
  registerBehavior('water_cauldron', {
    useItemOn(level, x, y, z, st, stack, ctx) {
      if (isBanner(stack)) {
        const r = washBanner(level, x, y, z, st, stack, ctx);
        if (r !== 'pass') return r;
      }
      return theirs ? theirs(level, x, y, z, st, stack, ctx) : 'pass';
    },
  });
}

// ---------------------------------------------------------------------------

/**
 * vanilla Raid.getLeaderBannerInstance: the ominous banner, its patterns kept off the tooltip (vanilla's name is gold;
 * here it takes its rarity's yellow). No raids or patrols carry it yet; it's here for whatever lists or gives it
 */
export function ominousBanner(): ItemStack {
  const s = ItemStack.of('white_banner');
  const layers: [string, string][] = [
    ['rhombus', 'cyan'], ['stripe_bottom', 'light_gray'], ['stripe_center', 'gray'], ['border', 'light_gray'],
    ['stripe_middle', 'black'], ['half_horizontal', 'light_gray'], ['circle', 'light_gray'], ['border', 'black'],
  ];
  s.tag = {
    patterns: layers.map(([pattern, color]) => ({ pattern, color })),
    hideAdditional: true,
    itemName: 'Ominous Banner',
    rarity: 'uncommon',
  };
  return s;
}
