// Per-block behaviour hooks (vanilla BlockBehaviour's overridable methods) for the blocks that have them: the
// redstone components and the blocks redstone works. The level, interaction, entities and ambient ticker call them
// where vanilla's Level, LevelChunk, Entity and ClientLevel do; signals only read blocks, so they take the world.

import { BLOCK_BY_NAME, STATE_BLOCK } from '../world/block';
import type { Dir } from '../world/dir';
import type { World } from '../world/world';
import type { Level } from './level';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import type { Item, ItemStack } from '../item/item';
import type { Rand } from '../core/rng';
import type { Hand } from '../item/inventory';
import type { PlaceContext } from './blockRules';
import type { BlockEntity } from '../world/blockEntity';
import type { Block } from '../world/block';

/** a right click on the block (vanilla BlockHitResult) */
export interface UseContext {
  player: Player;
  face: number;
  /** where the click landed, in world coordinates */
  hx: number;
  hy: number;
  hz: number;
  /** the hand doing it (useItemOn; useWithoutItem is always the main hand's) */
  hand?: Hand;
}

/** where a projectile struck the block (vanilla BlockHitResult) */
export interface ProjectileHit {
  face: number;
  px: number;
  py: number;
  pz: number;
}

/**
 * vanilla ItemInteractionResult: 'success' (the click did something), 'pass' (PASS_TO_DEFAULT_BLOCK_INTERACTION:
 * the block's own use, then the item's, get their turn), 'skip' (SKIP_DEFAULT_BLOCK_INTERACTION: straight on to the
 * item's own use), 'consume' (nothing happened, but the click is spent)
 */
export type ItemUseResult = 'success' | 'pass' | 'skip' | 'consume';

export interface BlockBehavior {
  /** vanilla getStateForPlacement (null: can't go there) */
  placement?(ctx: PlaceContext): number | null;
  /** vanilla canSurvive */
  canSurvive?(world: World, x: number, y: number, z: number, state: number): boolean;
  /** vanilla onPlace: `state` is now in the world, where `old` was */
  onPlace?(level: Level, x: number, y: number, z: number, state: number, old: number, moving: boolean): void;
  /** vanilla onRemove: `state` was replaced by `now` (already in the world) */
  onRemove?(level: Level, x: number, y: number, z: number, state: number, now: number, moving: boolean): void;
  /** vanilla neighborChanged: `source` (a block id) at (fx, fy, fz) changed */
  neighborChanged?(level: Level, x: number, y: number, z: number, state: number, source: number, fx: number, fy: number, fz: number, moving: boolean): void;
  /** vanilla tick: a scheduled block tick */
  tick?(level: Level, x: number, y: number, z: number, state: number): void;
  /** vanilla randomTick: one of the random ticks a chunk's blocks get (for a block registered with randomTicks) */
  randomTick?(level: Level, x: number, y: number, z: number, state: number): void;
  /**
   * vanilla updateShape scheduling the block's own tick when it can no longer stay (chorus plants): it breaks that many
   * ticks later, in its tick, rather than at once
   */
  breakDelay?: number;
  /** vanilla isSignalSource */
  isSignalSource?(state: number): boolean;
  /** vanilla getSignal: the (weak) power toward whoever asks; `dir` points from the asker to this block */
  getSignal?(world: World, x: number, y: number, z: number, state: number, dir: Dir): number;
  /** vanilla getDirectSignal: the strong power, which a conductor passes on to all its neighbours */
  getDirectSignal?(world: World, x: number, y: number, z: number, state: number, dir: Dir): number;
  /** vanilla useWithoutItem: true if it did something, 'consume' if the click is spent without the arm swinging */
  use?(level: Level, x: number, y: number, z: number, state: number, ctx: UseContext): boolean | 'consume';
  /** vanilla attack: a survival player starts breaking the block (a dragon egg jumps away) */
  attack?(level: Level, x: number, y: number, z: number, state: number, player: Player): void;
  /** vanilla useItemOn: `stack` (in ctx.hand) used on the block, before the block's own use and the item's */
  useItemOn?(level: Level, x: number, y: number, z: number, state: number, stack: ItemStack, ctx: UseContext): ItemUseResult;
  /** vanilla onProjectileHit: `projectile` struck the block */
  projectileHit?(level: Level, x: number, y: number, z: number, state: number, hit: ProjectileHit, projectile: Entity): void;
  /** vanilla updateShape, from all the neighbours at once: the state to become (0: it breaks) */
  updateShape?(world: World, x: number, y: number, z: number, state: number): number;
  /**
   * vanilla updateShape's side effects, one neighbour at a time: the block toward `dir` was set or reshaped (an
   * observer watching that way starts its pulse)
   */
  shapeUpdate?(level: Level, x: number, y: number, z: number, state: number, dir: Dir): void;
  /** vanilla LiquidBlockContainer.placeLiquid: a water bucket emptied into the block; true if it took it */
  placeLiquid?(level: Level, x: number, y: number, z: number, state: number): boolean;
  /** the block's loot table (vanilla block loot): what breaking it with `tool` drops, when it has one of its own */
  drops?(state: number, tool: Item | null, r: Rand, silk: boolean, fortune: number, be?: BlockEntity | null): ItemStack[];
  /**
   * vanilla spawnAfterBreak: the block was broken with its drops (by a player with `stack`, by a mob or a blast with
   * nothing), and may leave something behind besides them (an infested block's silverfish); (remaining mobs: the bee)
   * `source` is who or what broke it (vanilla getDrops' THIS_ENTITY: a blast's direct source), `be` its block entity
   * as it was
   */
  spawnAfterBreak?(level: Level, x: number, y: number, z: number, state: number, stack: ItemStack | null, source?: Entity | null, be?: BlockEntity | null): void;
  /** vanilla entityInside: `e`'s box overlaps the block */
  entityInside?(level: Level, x: number, y: number, z: number, state: number, e: Entity): void;
  /** vanilla stepOn: `e`, on the ground, stands on the block holding it up this tick (a sculk sensor or shrieker set off, a turtle egg underfoot) */
  stepOn?(level: Level, x: number, y: number, z: number, state: number, e: Entity): void;
  /** vanilla getAnalogOutputSignal: what a comparator reads from the block (those with hasAnalogOutputSignal) */
  analogOutput?(level: Level, x: number, y: number, z: number, state: number): number;
  /** vanilla animateTick (client ambient effects) */
  animateTick?(level: Level, x: number, y: number, z: number, state: number): void;
  /** vanilla setPlacedBy: a player placed it (after it's in the world) */
  setPlacedBy?(level: Level, x: number, y: number, z: number, state: number, placer: Player): void;
  /**
   * vanilla playerWillDestroy: `player` is about to break it (in any game mode), holding `held`, before it goes (a
   * shulker box broken in creative drops itself with what's in it)
   */
  playerWillDestroy?(level: Level, x: number, y: number, z: number, state: number, player: Player, held: ItemStack | null): void;
  /** vanilla triggerEvent: a block event queued for it (Level.blockEvent) comes up; true if it did something */
  triggerEvent?(level: Level, x: number, y: number, z: number, state: number, id: number, param: number): boolean;
  /** vanilla getCloneItemStack: the item a pick-block gives, when it depends on the state (a piston head's piston) */
  cloneItem?(state: number): string;
  /** vanilla getCloneItemStack, when it depends on the block entity (a decorated pot's sides); null: the usual */
  cloneStack?(level: Level, x: number, y: number, z: number, state: number): ItemStack | null;
  /** vanilla getSoundType(state).getBreakSound(), where it isn't the block's own (a cracked pot's shatter) */
  breakSound?(state: number): string;
  // (Stage 5: ocean) the turtle egg's
  /** vanilla fallOn: `e` landed on the block from `dist` up (before the landing's damage) */
  fallOn?(level: Level, x: number, y: number, z: number, state: number, e: Entity, dist: number): void;
  /** vanilla canBeReplaced(BlockPlaceContext): placing `stack` on the block goes into it (a turtle egg more in a clutch) */
  canBeReplaced?(state: number, stack: ItemStack, sneaking: boolean): boolean;
  /** vanilla playerDestroy: a survival player broke it, holding `held` (it's gone, and what it drops has dropped) */
  playerDestroy?(level: Level, x: number, y: number, z: number, state: number, player: Player, held: ItemStack | null): void;
  // (remaining mobs: the panda) bamboo's
  /**
   * vanilla BonemealableBlock, for a block with its own: isValidBonemealTarget, then performBonemeal (when
   * isBonemealSuccess comes up); false when it isn't a target, and the bone meal isn't used
   */
  performBonemeal?(level: Level, x: number, y: number, z: number, state: number): boolean;
  /** vanilla getDestroyProgress, where a block has its own (a sword through bamboo at a stroke); undefined: the usual */
  destroyProgress?(state: number, item: Item | null): number | undefined;
}

const BEHAVIORS: (BlockBehavior | undefined)[] = [];

/** add hooks to a block (merged with any it already has) */
export function registerBehavior(name: string, b: BlockBehavior): void {
  const block = BLOCK_BY_NAME.get(name);
  if (!block) throw new Error('no block ' + name);
  BEHAVIORS[block.id] = { ...BEHAVIORS[block.id], ...b };
}

export function behaviorOf(state: number): BlockBehavior | undefined {
  return BEHAVIORS[STATE_BLOCK[state]];
}

export function behaviorOfBlock(id: number): BlockBehavior | undefined {
  return BEHAVIORS[id];
}
