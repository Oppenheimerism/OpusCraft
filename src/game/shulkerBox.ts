// What shulker boxes do (vanilla ShulkerBoxBlock, ShulkerBoxColoring, CauldronInteraction.SHULKER_BOX,
// BlockItem.onDestroyed): the lid opens away from the face the box was put against, if there's room for it; the box
// keeps what's in it (and its name) when it's broken, even in creative; its tooltip lists what it holds; a dye in the
// crafting grid colours it, a water cauldron washes the colour off; a box burnt or blown up as an item spills out.
// The blocks are in world/blocksShulker, the block entity in world/shulkerBoxEntity, the looks in
// render/shulkerRenderer.

// (the water cauldron's own uses are registered there first; washing a box goes in front of them)
import './villageBlocks';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_REPLACEABLE, getBlock, COLLISION, type Box } from '../world/block';
import { DIR_NAMES, DX, DY, DZ } from '../world/dir';
import { registerBehavior, behaviorOfBlock, type ItemUseResult, type UseContext } from './blockBehavior';
import { ShulkerBoxBlockEntity, contentsStacks, progressDeltaBox } from '../world/shulkerBoxEntity';
import { SHULKER_BOXES, isShulkerBox, shulkerBoxColor, shulkerBoxOf } from '../world/blocksShulker';
import { registerDynamicShape } from '../world/dynamicShapes';
import { ShulkerBoxMenu } from '../inventory/shulkerBoxMenu';
import { ItemStack, ITEMS, getItem, cloneTag } from '../item/item';
import { ItemEntity } from '../entity/itemEntity';
import { LivingEntity } from '../entity/living';
import { AABB } from '../core/aabb';
import { registerHoverText } from '../item/hoverText';
import { registerCustomRecipe, type Grid } from '../inventory/customRecipes';
import { GUARDED_BY_PIGLINS, Piglin } from '../entity/piglin';
import type { Level } from './level';
import type { Player } from '../entity/player';
import type { World } from '../world/world';

/** the game's container screens: shows the box's menu (set by Game) */
type MenuOpener = (menu: ShulkerBoxMenu) => void;
let openMenu: MenuOpener | null = null;

export function setShulkerBoxMenuHook(fn: MenuOpener | null): void {
  openMenu = fn;
}

/**
 * vanilla ShulkerBoxBlock.canOpen: an open lid (or one on its way) can always be looked under; a shut one only opens
 * if nothing solid is in the half block its lid rises into
 */
export function canOpen(level: Level, x: number, y: number, z: number, st: number, be: ShulkerBoxBlockEntity): boolean {
  if (be.animationStatus !== 'closed') return true;
  const facing = BLOCKS[STATE_BLOCK[st]].get<string>(st, 'facing');
  const b = progressDeltaBox(facing, 0, 0.5).move(x, y, z).inflate(-1e-6);
  return noCollision(level, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
}

/** vanilla Level.noCollision for a box: no block's collision shape in it, nor anything solid (a boat, a shulker) */
function noCollision(level: Level, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const w = level.world;
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++)
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++)
      for (let z = Math.floor(z0); z <= Math.floor(z1); z++) {
        const boxes = COLLISION[w.getState(x, y, z)];
        if (!boxes) continue;
        for (const c of boxes)
          if (x + c[0] < x1 && x + c[3] > x0 && y + c[1] < y1 && y + c[4] > y0 && z + c[2] < z1 && z + c[5] > z0) return false;
      }
  for (const e of level.entities) {
    if (e.removed || !e.canBeCollidedWith()) continue;
    const b = e.bb;
    if (b.minX < x1 && b.maxX > x0 && b.minY < y1 && b.maxY > y0 && b.minZ < z1 && b.maxZ > z0) return false;
  }
  return true;
}

/** the box's item as it leaves the block: its colour, with its name and what it holds (vanilla collectComponents) */
function boxItem(name: string, be: ShulkerBoxBlockEntity | null): ItemStack {
  const s = ItemStack.of(name);
  if (be) s.tag = be.itemTag();
  return s;
}

/** vanilla ItemEntity(level, x, y, z, stack): at the point, with the usual little random toss */
function spawnItem(level: Level, x: number, y: number, z: number, s: ItemStack): ItemEntity {
  const e = new ItemEntity(level, s);
  e.moveTo(x, y, z, Math.random() * 360, 0);
  e.dx = Math.random() * 0.2 - 0.1;
  e.dy = 0.2;
  e.dz = Math.random() * 0.2 - 0.1;
  level.addEntity(e);
  return e;
}

const FULL: Box[] = [[0, 0, 0, 1, 1, 1]];

for (const [name] of SHULKER_BOXES) {
  const block = getBlock(name);
  registerBehavior(name, {
    // vanilla getStateForPlacement: the lid toward whoever put it there (away from the face it was put against)
    placement: (ctx) => block.state({ facing: DIR_NAMES[ctx.face] }),
    // vanilla useWithoutItem: the box's menu, if the lid has room to open; piglins that see it take it badly
    use(level, x, y, z, st, ctx) {
      const be = level.world.getBlockEntity(x, y, z);
      if (!(be instanceof ShulkerBoxBlockEntity)) return false;
      const p = ctx.player;
      if (p.gameMode === 'spectator') return 'consume';
      if (canOpen(level, x, y, z, st, be)) {
        be.unpackLoot();
        openMenu?.(new ShulkerBoxMenu(p, be, be.displayName()));
        be.startOpen(level, p);
        Piglin.angerNearbyPiglins(p, true);
      }
      return true;
    },
    // vanilla playerWillDestroy: in creative a box with anything in it still drops, contents and all
    playerWillDestroy(level, x, y, z, _st, p) {
      const be = level.world.getBlockEntity(x, y, z);
      if (!(be instanceof ShulkerBoxBlockEntity)) return;
      if (p.gameMode === 'creative' && !be.isEmpty()) spawnItem(level, x + 0.5, y + 0.5, z + 0.5, boxItem(name, be));
      else be.unpackLoot();
    },
    // vanilla loot table blocks/<colour>_shulker_box: the box, copying CUSTOM_NAME and CONTAINER from its block entity
    drops: (_st, _tool, _r, _silk, _fortune, be) => [boxItem(name, be instanceof ShulkerBoxBlockEntity ? be : null)],
  });
  // vanilla ShulkerBoxBlock.getShape: the box, and its lid's reach while it's up
  registerDynamicShape(block, (w: World, x, y, z, st) => {
    const be = w.getBlockEntity(x, y, z);
    if (!(be instanceof ShulkerBoxBlockEntity) || be.progress === 0) return FULL;
    const b = progressDeltaBox(block.get<string>(st, 'facing'), -1, 0.5 * be.progress);
    return [[b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ]];
  });
  // vanilla ShulkerBoxBlock.appendHoverText: the first five stacks it holds by name and count, then how many more
  registerHoverText(name, (s) => {
    const items = contentsStacks(s.tag?.container).filter((x): x is ItemStack => !!x);
    const lines = items.slice(0, 5).map((x) => `${x.displayName()} x${x.count}`);
    if (items.length > 5) lines.push(`§oand ${items.length - 5} more...`);
    return lines;
  });
  // vanilla BlockItem.onDestroyed (ItemUtils.onContainerDestroyed): a box burnt or blown apart spills what it held
  ITEMS.get(name)!.onDestroyed = (e) => {
    const inside = contentsStacks(e.stack.tag?.container);
    if (e.stack.tag) delete e.stack.tag.container;
    for (const s of inside) if (s) spawnItem(e.level, e.x, e.y, e.z, s);
  };
  // vanilla #guarded_by_piglins has the shulker boxes
  GUARDED_BY_PIGLINS.add(name);
}

// ---------------------------------------------------------------------------
// Dyeing (vanilla ShulkerBoxColoring): one box and one dye anywhere in the grid make the box that colour, as it was

registerCustomRecipe({
  assemble(grid: Grid): ItemStack | null {
    let box: ItemStack | null = null, dye: string | null = null;
    for (const s of grid) {
      if (!s || s.count <= 0) continue;
      if (isShulkerBox(s.item.id)) {
        if (box) return null;
        box = s;
      } else if (s.item.id.endsWith('_dye')) {
        if (dye) return null;
        dye = s.item.id.slice(0, -4);
      } else return null;
    }
    if (!box || !dye) return null;
    // (vanilla transmuteCopy: the same components on the new item)
    return new ItemStack(getItem(shulkerBoxOf(dye)), 1, 0, cloneTag(box.tag));
  },
});

// ---------------------------------------------------------------------------
// Washing (vanilla CauldronInteraction.SHULKER_BOX, in the water cauldron's interactions)

/** vanilla LayeredCauldronBlock.lowerFillLevel */
function lowerFillLevel(level: Level, x: number, y: number, z: number, st: number): void {
  const b = BLOCKS[STATE_BLOCK[st]];
  const l = b.get<number>(st, 'level') - 1;
  const now = l === 0 ? getBlock('cauldron').defaultState : b.with(st, 'level', l);
  level.setBlock(x, y, z, now);
  level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { state: now });
}

/**
 * vanilla ItemUtils.createFilledResult(held, player, result, false): one of the held stack spent for `result` (in
 * creative none is, and the result goes in the inventory besides)
 */
function takeResult(p: Player, held: ItemStack, result: ItemStack): void {
  const inv = p.inventory;
  if (p.gameMode !== 'creative') held.count--;
  if (held.count <= 0) {
    inv.setSelectedItem(result);
    return;
  }
  const left = inv.add(result);
  if (left > 0) p.dropItem(result.copyWithCount(left), false);
}

/** a dyed box comes out undyed, as it was otherwise, for a level of water */
function washBox(level: Level, x: number, y: number, z: number, st: number, stack: ItemStack, ctx: UseContext): ItemUseResult {
  if (!shulkerBoxColor(stack.item.id)) return 'pass';
  takeResult(ctx.player, stack, new ItemStack(getItem('shulker_box'), 1, 0, cloneTag(stack.tag)));
  lowerFillLevel(level, x, y, z, st);
  return 'success';
}

{
  const cauldron = getBlock('water_cauldron');
  const theirs = behaviorOfBlock(cauldron.id)?.useItemOn;
  registerBehavior('water_cauldron', {
    useItemOn(level, x, y, z, st, stack, ctx) {
      if (shulkerBoxColor(stack.item.id)) return washBox(level, x, y, z, st, stack, ctx);
      return theirs ? theirs(level, x, y, z, st, stack, ctx) : 'pass';
    },
  });
}

// ---------------------------------------------------------------------------
// Dispensers (redstone/dispenseItems.ts calls this). Pistons break boxes rather than push them (vanilla
// PushReaction.DESTROY: redstone/piston.ts), dropping them with what they hold as any block broken so.

/** vanilla Entity.blocksBuilding, besides living things: minecarts, boats and rafts, primed TNT, falling blocks, end crystals */
const BLOCKS_BUILDING = /^(tnt|falling_block|end_crystal|.*minecart|.*_boat|.*_raft)$/;

/**
 * vanilla ShulkerBoxDispenseItemBehavior: a dispenser facing `facing` (a Dir) at (x, y, z) places the box in front of
 * it — facing the same way, or up when there's nothing under the spot — as a player placing it would (its contents and
 * name with it), if nothing stands there (vanilla Level.isUnobstructed). True if it went down (the dispenser then
 * spends the item; else it clicks as a failed dispense).
 */
export function dispenseShulkerBox(level: Level, x: number, y: number, z: number, facing: number, stack: ItemStack): boolean {
  const name = stack.item.id;
  if (!isShulkerBox(name)) return false;
  const tx = x + DX[facing], ty = y + DY[facing], tz = z + DZ[facing];
  const w = level.world;
  if (!(FLAGS[w.getState(tx, ty, tz)] & F_REPLACEABLE)) return false;
  const cell = new AABB(tx, ty, tz, tx + 1, ty + 1, tz + 1);
  if (level.getEntities(cell, (e) => !e.removed && (e instanceof LivingEntity || BLOCKS_BUILDING.test(e.type))).length) return false;
  const face = FLAGS[w.getState(tx, ty - 1, tz)] & F_AIR ? facing : 1;
  const box = getBlock(name).state({ facing: DIR_NAMES[face] });
  level.setBlock(tx, ty, tz, box);
  w.getBlockEntity(tx, ty, tz)?.applyComponents(stack);
  level.sound.play('block.stone.place', tx + 0.5, ty + 0.5, tz + 0.5, 1, 0.8);
  return true;
}
