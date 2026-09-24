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
  /** vanilla LiquidBlockContainer.placeLiquid: a water bucket emptied into the block; true if it took it */
  placeLiquid?(level: Level, x: number, y: number, z: number, state: number): boolean;
  /** the block's loot table (vanilla block loot): what breaking it with `tool` drops, when it has one of its own */
  drops?(state: number, tool: Item | null, r: Rand, silk: boolean, fortune: number, be?: BlockEntity | null): ItemStack[];
  /** vanilla entityInside: `e`'s box overlaps the block */
  entityInside?(level: Level, x: number, y: number, z: number, state: number, e: Entity): void;
  /** vanilla animateTick (client ambient effects) */
  animateTick?(level: Level, x: number, y: number, z: number, state: number): void;
  /** vanilla setPlacedBy: a player placed it (after it's in the world) */
  setPlacedBy?(level: Level, x: number, y: number, z: number, state: number, placer: Player): void;
  /** vanilla playerWillDestroy: `player` is about to break it, holding `held` */
  playerWillDestroy?(level: Level, x: number, y: number, z: number, state: number, player: Player, held: ItemStack | null): void;
  /** vanilla triggerEvent: a block event queued for it (Level.blockEvent) comes up; true if it did something */
  triggerEvent?(level: Level, x: number, y: number, z: number, state: number, id: number, param: number): boolean;
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
