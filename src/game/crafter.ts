// The crafter (1.21; vanilla CrafterBlock and CrafterBlockEntity). Its nine slots hold a crafting grid, and any of the
// empty ones can be switched off (they take nothing, and droppers skip them). Power reaching it (not the block above:
// no quasi-connectivity) sets it off once; four ticks later it crafts what its grid makes, as a crafting table would,
// and puts the result into the container it faces, or out of its front as an item with a clunk and a puff of white
// smoke; what's left over (a bucket, the book it copied) goes the same way, and one of each item in the grid is used.
// Nothing to make, it clicks dully. It glows while powered and for a few ticks as it crafts. Droppers fill it evenly,
// one item at a time into the fullest slot that has no emptier or smaller one after it. A player near enough when it
// crafts a crafter earns Crafters Crafting Crafters. The block is world/blocksCrafter.ts, its screen
// inventory/crafterMenu.ts and gui/screens/crafter.ts.
//
// vanilla CrafterBlock.getPotentialResults asks the level's crafting recipes (RecipeType.CRAFTING, the special ones
// among them) about its grid, as the crafting table does: here findRecipe, then the special recipes in the order the
// crafting menus ask them (CraftingMenuBase.slotsChanged).

import { ItemStack } from '../item/item';
import { findRecipe, craftingRemainder } from '../inventory/recipes';
import { customRecipeFor } from '../inventory/customRecipes';
import { armorDye, tippedArrow } from '../inventory/menus';
import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { DX, DY, DZ, DIR_NAMES, OPPOSITE, UP, DOWN, dirFromYaw, type Dir } from '../world/dir';
import { AABB } from '../core/aabb';
import { fillContainer } from './loot';
import { registerBehavior } from './blockBehavior';
import { lookingDirections } from './blockRules';
import { hasNeighborSignal } from './redstone/signal';
import { containerAt, insertItem, CONTAINER_TARGETS } from './redstone/dispenser';
import { spawnItem } from './redstone/dispenseItems';
import { onCraftedPostProcess } from './maps';
import type { Level } from './level';
import type { Player } from '../entity/player';

/** vanilla CrafterBlock.CRAFTING_TICK_DELAY: from being set off to crafting */
export const CRAFTER_TICK_DELAY = 4;
/** vanilla CrafterBlock.MAX_CRAFTING_TICKS: how long it shows it's crafting */
export const CRAFTER_CRAFTING_TICKS = 6;
/** vanilla CrafterBlock.CRAFTER_ADVANCEMENT_DIAMETER: the box round it whose players hear of what it crafted */
export const CRAFTER_ADVANCEMENT_DIAMETER = 17;

// ---------------------------------------------------------------------------
// What it crafts

export interface CrafterCraft {
  /** vanilla CraftingRecipe.assemble */
  result: ItemStack;
  /**
   * vanilla RecipeHolder.id: a plain recipe's is its result ('crafter' for the crafter's own, as vanilla's
   * minecraft:crafter); a special one's its kind
   */
  recipe: string;
  /** vanilla getRemainingItems, slot by slot: the buckets, bottles, or the book or banner copied from */
  remaining: (ItemStack | null)[];
}

/** each item's own crafting remainder (vanilla CraftingRecipe.defaultCraftingReminder) */
function remainders(grid: readonly (ItemStack | null)[]): (ItemStack | null)[] {
  return grid.map((s) => (s ? craftingRemainder(s) : null));
}

/** what a 3x3 grid crafts, or null (vanilla CrafterBlock.getPotentialResults, then assemble) */
export function crafterCraft(grid: (ItemStack | null)[]): CrafterCraft | null {
  if (!grid.some((s) => s && s.count > 0)) return null;
  const r = findRecipe(grid, 3, 3);
  if (r) return { result: ItemStack.of(r.result, r.count), recipe: r.result, remaining: remainders(grid) };
  const dyed = armorDye(grid);
  if (dyed) return { result: dyed, recipe: 'armor_dye', remaining: remainders(grid) };
  const tipped = tippedArrow(grid, 3);
  if (tipped) return { result: tipped, recipe: 'tipped_arrow', remaining: remainders(grid) };
  const special = customRecipeFor(grid, 3);
  if (special) return { result: special.result, recipe: 'special', remaining: special.recipe.remaining?.(grid, 3) ?? remainders(grid) };
  return null;
}

// ---------------------------------------------------------------------------
// Its block entity

/** vanilla CrafterBlockEntity: nine slots, which of them are switched off, whether it's powered, its crafting ticks */
export class CrafterBlockEntity extends BlockEntity {
  readonly id = 'crafter';
  /** vanilla LootTable / LootTableSeed (RandomizableContainerBlockEntity) */
  lootTable: string | null = null;
  lootSeed = 0;
  /** vanilla containerData's slot states (SLOT_DISABLED) */
  readonly disabled: boolean[] = new Array(9).fill(false);
  /** vanilla containerData's DATA_TRIGGERED: shown on its screen */
  triggered = false;
  /** vanilla craftingTicksRemaining */
  craftingTicks = 0;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 9);
    // vanilla setItem: whatever puts something into a switched-off slot switches it back on
    const set = this.container.set.bind(this.container);
    this.container.set = (i, s) => {
      if (s && s.count > 0 && this.isSlotDisabled(i)) this.disabled[i] = false;
      set(i, s);
    };
  }

  override unpackLoot(): void {
    if (!this.lootTable) return;
    const table = this.lootTable;
    this.lootTable = null;
    fillContainer(this.container, table, this.lootSeed);
  }

  isSlotDisabled(i: number): boolean {
    return i >= 0 && i < 9 && this.disabled[i];
  }

  /** vanilla slotCanBeDisabled: only an empty slot can be switched, either way */
  private slotCanBeDisabled(i: number): boolean {
    return i > -1 && i < 9 && !this.container.get(i);
  }

  /** vanilla setSlotState: a slot switched on (true) or off */
  setSlotState(i: number, enabled: boolean): void {
    if (!this.slotCanBeDisabled(i)) return;
    this.disabled[i] = !enabled;
    this.container.changed();
  }

  /**
   * vanilla canPlaceItem (a hopper's or dropper's test): never into a switched-off or full slot, always into an empty
   * one, and into a filled one only if no slot after it that's on is empty or holds fewer of the same
   */
  canPlaceItem(slot: number, _s: ItemStack): boolean {
    if (this.isSlotDisabled(slot)) return false;
    const there = this.container.get(slot);
    if (!there) return true;
    if (there.count >= there.maxStack) return false;
    return !this.smallerStackExist(there.count, there, slot);
  }

  /** vanilla smallerStackExist */
  private smallerStackExist(count: number, s: ItemStack, slot: number): boolean {
    for (let i = slot + 1; i < 9; i++) {
      if (this.isSlotDisabled(i)) continue;
      const there = this.container.get(i);
      if (!there || (there.count < count && there.sameItem(s))) return true;
    }
    return false;
  }

  /** vanilla getRedstoneSignal (its comparator output): the slots that are filled or switched off */
  redstoneSignal(): number {
    let n = 0;
    for (let i = 0; i < 9; i++) if (this.container.get(i) || this.isSlotDisabled(i)) n++;
    return n;
  }

  /** vanilla serverTick: its crafting look goes when the ticks run out */
  override tick(level: Level): void {
    if (this.craftingTicks <= 0 || !level.isEntityTicking(this.x, this.z)) return;
    this.craftingTicks--;
    if (this.craftingTicks > 0) return;
    const st = level.getState(this.x, this.y, this.z);
    if (STATE_BLOCK[st] === crafter().id) level.setBlock(this.x, this.y, this.z, crafter().with(st, 'crafting', false), 3);
  }

  protected override saveData(): Record<string, number | string> | undefined {
    const d: Record<string, number | string> = {
      crafting_ticks_remaining: this.craftingTicks,
      disabled_slots: this.disabled.flatMap((off, i) => (off ? [i] : [])).join(','),
      triggered: this.triggered ? 1 : 0,
    };
    if (this.lootTable) {
      d.lootTable = this.lootTable;
      d.lootSeed = this.lootSeed;
    }
    return d;
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.craftingTicks = Number(d.crafting_ticks_remaining ?? 0);
    this.disabled.fill(false);
    for (const i of String(d.disabled_slots ?? '').split(',').filter(Boolean).map(Number)) if (this.slotCanBeDisabled(i)) this.disabled[i] = true;
    this.triggered = Number(d.triggered ?? 0) === 1;
    if (typeof d.lootTable === 'string') {
      this.lootTable = d.lootTable;
      this.lootSeed = Number(d.lootSeed ?? 0);
    }
  }
}

registerBlockEntityType('crafter', (x, y, z) => new CrafterBlockEntity(x, y, z));

// a dropper (or, some day, a hopper) puts things in by its rule
CONTAINER_TARGETS.push((be) => (be instanceof CrafterBlockEntity ? { container: be.container, canPlace: (slot, s) => be.canPlaceItem(slot, s) } : null));

/** the crafter's comparator output (vanilla getAnalogOutputSignal), for when the game has comparators */
export function crafterAnalogOutput(level: Level, x: number, y: number, z: number): number {
  const be = level.world.getBlockEntity(x, y, z);
  return be instanceof CrafterBlockEntity ? be.redstoneSignal() : 0;
}

// ---------------------------------------------------------------------------
// The block

let block: Block | null = null;
const crafter = (): Block => (block ??= getBlock('crafter'));

/** the way its front faces (vanilla FrontAndTop.front) */
export function crafterFront(st: number): Dir {
  const o = BLOCKS[STATE_BLOCK[st]].get<string>(st, 'orientation');
  return DIR_NAMES.indexOf(o.split('_')[0] as (typeof DIR_NAMES)[number]) as Dir;
}

function crafterAt(level: Level, x: number, y: number, z: number): CrafterBlockEntity | null {
  const be = level.world.getBlockEntity(x, y, z);
  return be instanceof CrafterBlockEntity ? be : null;
}

/** vanilla Random.nextGaussian (Box-Muller) */
function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** level event 2010 (LevelRenderer.shootParticles with WHITE_SMOKE): ten puffs of white smoke out of its front */
function whiteSmoke(level: Level, x: number, y: number, z: number, f: Dir): void {
  const i = DX[f], j = DY[f], k = DZ[f];
  for (let n = 0; n < 10; n++) {
    const d = Math.random() * 0.2 + 0.01;
    const px = x + i * 0.6 + 0.5 + i * 0.01 + (Math.random() - 0.5) * k * 0.5;
    const py = y + j * 0.6 + 0.5 + j * 0.01 + (Math.random() - 0.5) * j * 0.5;
    const pz = z + k * 0.6 + 0.5 + k * 0.01 + (Math.random() - 0.5) * i * 0.5;
    level.particles.spawn?.('white_smoke', px, py, pz, i * d + gauss() * 0.01, j * d + gauss() * 0.01, k * d + gauss() * 0.01);
  }
}

/**
 * vanilla CrafterBlock.dispenseItem: into the container it faces (another crafter one item at a time, by its rule;
 * anything else the whole stack, as much as goes); what doesn't go in comes out of its front as an item, with the
 * craft's sound (level event 1049) and puff (2010), and every player within the box round it hears what it crafted
 * (CriteriaTriggers.CRAFTER_RECIPE_CRAFTED; only then, as in vanilla)
 */
function dispenseItem(level: Level, x: number, y: number, z: number, stack: ItemStack, face: Dir, recipe: string): void {
  const tx = x + DX[face], ty = y + DY[face], tz = z + DZ[face];
  const target = containerAt(level, tx, ty, tz);
  const into = OPPOSITE[face] as Dir;
  let s: ItemStack | null = stack.copy();
  if (target && (level.world.getBlockEntity(tx, ty, tz) instanceof CrafterBlockEntity || s.count > Math.min(target.container.maxStackSize ?? 99, s.maxStack))) {
    while (s.count > 0) {
      if (insertItem(target, s.copyWithCount(1), into)) break;
      s.count--;
    }
  } else if (target) {
    while (s && s.count > 0) {
      const n = s.count;
      const rest = insertItem(target, s, into);
      if (!rest) s = null;
      else if (rest.count === n) break;
      else s = rest;
    }
  }
  if (!s || s.count <= 0) return;
  spawnItem(level, s, 6, face, [x + 0.5 + 0.7 * DX[face], y + 0.5 + 0.7 * DY[face], z + 0.5 + 0.7 * DZ[face]]);
  const r = CRAFTER_ADVANCEMENT_DIAMETER / 2;
  const box = new AABB(x + 0.5 - r, y + 0.5 - r, z + 0.5 - r, x + 0.5 + r, y + 0.5 + r, z + 0.5 + r);
  for (const p of level.getEntities(box, (e) => e.type === 'player' && (e as Player).gameMode !== 'spectator'))
    level.onPlayerTrigger?.(p as Player, 'crafter_recipe_crafted', { crafterCrafted: { recipe } });
  level.sound.play('block.crafter.craft', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  whiteSmoke(level, x, y, z, face);
}

/**
 * vanilla CrafterBlock.dispenseFrom: what its grid makes, or the fail sound (level event 1050); crafting, it shows it
 * for six ticks, sends out the result and then each remainder, and uses one of every item in the grid
 */
function dispenseFrom(level: Level, x: number, y: number, z: number, st: number): void {
  const be = crafterAt(level, x, y, z);
  if (!be) return;
  be.unpackLoot();
  const craft = crafterCraft(be.container.items);
  if (!craft || craft.result.count <= 0) {
    level.sound.play('block.crafter.fail', x + 0.5, y + 0.5, z + 0.5, 1, 1);
    return;
  }
  be.craftingTicks = CRAFTER_CRAFTING_TICKS;
  level.setBlock(x, y, z, crafter().with(st, 'crafting', true), 2);
  // vanilla ItemStack.onCraftedBySystem: a map zoomed out or locked becomes its new map
  onCraftedPostProcess(craft.result, level);
  const face = crafterFront(st);
  dispenseItem(level, x, y, z, craft.result, face, craft.recipe);
  for (const rest of craft.remaining) if (rest && rest.count > 0) dispenseItem(level, x, y, z, rest, face, craft.recipe);
  for (let i = 0; i < 9; i++) {
    const s = be.container.get(i);
    if (!s) continue;
    s.count--;
    if (s.count <= 0) be.container.items[i] = null;
  }
  be.container.changed();
}

type MenuOpener = (be: CrafterBlockEntity, player: Player) => void;
let openMenu: MenuOpener | null = null;

/** the game's screens (gui/screens/crafter.ts): how a crafter's screen is opened */
export function setCrafterMenuHook(fn: MenuOpener | null): void {
  openMenu = fn;
}

registerBehavior('crafter', {
  // vanilla getStateForPlacement: its front toward the player; its top up, or (set facing up or down) toward where
  // the player faces (looking down at it) or away (looking up); powered if it's placed where power reaches
  placement(ctx) {
    const front = OPPOSITE[lookingDirections(ctx.yaw, ctx.pitch)[0]];
    const facing = dirFromYaw(ctx.yaw);
    const top = front === DOWN ? OPPOSITE[facing] : front === UP ? facing : UP;
    return crafter().state({ orientation: `${DIR_NAMES[front]}_${DIR_NAMES[top]}`, triggered: hasNeighborSignal(ctx.world, ctx.x, ctx.y, ctx.z) });
  },
  // vanilla newBlockEntity: its block entity knows whether it was placed powered
  onPlace(level, x, y, z, st, old) {
    if (STATE_BLOCK[old] === crafter().id) return;
    const be = crafterAt(level, x, y, z);
    if (be) be.triggered = crafter().get(st, 'triggered') === true;
  },
  // vanilla setPlacedBy: placed powered, it goes off four ticks later
  setPlacedBy(level, x, y, z, st) {
    if (crafter().get(st, 'triggered') === true) level.scheduleBlockTick(x, y, z, crafter().id, CRAFTER_TICK_DELAY);
  },
  // vanilla neighborChanged: power arriving sets it off (once, until the power goes); the power going stops its glow
  neighborChanged(level, x, y, z, st) {
    const on = hasNeighborSignal(level.world, x, y, z);
    const was = crafter().get(st, 'triggered') === true;
    const be = crafterAt(level, x, y, z);
    if (on && !was) {
      level.scheduleBlockTick(x, y, z, crafter().id, CRAFTER_TICK_DELAY);
      level.setBlock(x, y, z, crafter().with(st, 'triggered', true), 2);
      if (be) be.triggered = true;
    } else if (!on && was) {
      level.setBlock(x, y, z, crafter().with(crafter().with(st, 'triggered', false), 'crafting', false), 2);
      if (be) be.triggered = false;
    }
  },
  tick(level, x, y, z, st) {
    dispenseFrom(level, x, y, z, st);
  },
  // vanilla useWithoutItem: its screen
  use(level, x, y, z, _st, ctx) {
    const be = crafterAt(level, x, y, z);
    if (!be) return false;
    be.unpackLoot();
    openMenu?.(be, ctx.player);
    return true;
  },
});
