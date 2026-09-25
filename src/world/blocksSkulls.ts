// Mob heads (vanilla SkullBlock and WallSkullBlock for each SkullBlock.Types, PiglinheadBlock's shapes for the
// piglin's): a head on the floor turned to one of sixteen ways, or on a wall facing out from it, each powered when
// redstone reaches it (the dragon's jaw and the piglin's ears move then). The block draws nothing itself (vanilla
// RenderShape.ENTITYBLOCK_ANIMATED): render/skullRenderer.ts draws the head from its block entity
// (world/skullBlockEntity.ts); placing, powering and drops are game/skulls.ts. Its break specks are soul sand's
// (vanilla models/block/skull.json).

import { registerBlock, intProp, P, type Box } from './block';
import type { ModelDef } from './models';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla SkullBlock.Types, in its order */
export const SKULL_TYPES = ['skeleton', 'wither_skeleton', 'player', 'zombie', 'creeper', 'piglin', 'dragon'] as const;
export type SkullType = (typeof SKULL_TYPES)[number];

/** each type's floor block (also its item) and wall block, vanilla's names */
export const SKULL_BLOCKS: Record<SkullType, [floor: string, wall: string]> = {
  skeleton: ['skeleton_skull', 'skeleton_wall_skull'],
  wither_skeleton: ['wither_skeleton_skull', 'wither_skeleton_wall_skull'],
  player: ['player_head', 'player_wall_head'],
  zombie: ['zombie_head', 'zombie_wall_head'],
  creeper: ['creeper_head', 'creeper_wall_head'],
  piglin: ['piglin_head', 'piglin_wall_head'],
  dragon: ['dragon_head', 'dragon_wall_head'],
};

const TYPE_OF = new Map<string, { type: SkullType; wall: boolean }>();
for (const t of SKULL_TYPES) {
  TYPE_OF.set(SKULL_BLOCKS[t][0], { type: t, wall: false });
  TYPE_OF.set(SKULL_BLOCKS[t][1], { type: t, wall: true });
}

/** a mob head block's type and whether it's the wall one (undefined: not a head) */
export function skullOf(name: string): { type: SkullType; wall: boolean } | undefined {
  return TYPE_OF.get(name);
}

/** the head an item is (vanilla #skulls: the floor block's item stands for both) */
export function skullItemType(id: string): SkullType | undefined {
  const s = TYPE_OF.get(id);
  return s && !s.wall ? s.type : undefined;
}

/** vanilla #skulls */
export function isSkullItem(id: string): boolean {
  return skullItemType(id) !== undefined;
}

/**
 * vanilla LivingEntity.getVisibilityPercent: the mob whose own head is worn notices the wearer at half the distance
 * (piglin brutes are fooled by a piglin's head too)
 */
export const HEAD_DISGUISES: Readonly<Record<string, string>> = {
  skeleton: 'skeleton_skull', zombie: 'zombie_head', piglin: 'piglin_head', piglin_brute: 'piglin_head', creeper: 'creeper_head',
};

/**
 * vanilla dropCustomDeathLoot's charged creeper heads (Skeleton, WitherSkeleton, Zombie.getSkull, Creeper, Piglin): the
 * head a charged creeper's blast knocks off each kind (husks, drowned and zombie villagers are zombies there; strays and
 * zombified piglins give none)
 */
export const CHARGED_CREEPER_HEADS: Readonly<Record<string, string>> = {
  skeleton: 'skeleton_skull', wither_skeleton: 'wither_skeleton_skull', zombie: 'zombie_head', husk: 'zombie_head', drowned: 'zombie_head',
  zombie_villager: 'zombie_head', creeper: 'creeper_head', piglin: 'piglin_head',
};

/** vanilla SkullBlock.ROTATION (ROTATION_16) */
export const SKULL_ROTATION = intProp('rotation', 0, 15);

/** vanilla SkullBlock.SHAPE, and PiglinheadBlock.SHAPE a pixel wider each way */
const FLOOR: Box[] = [bx(4, 0, 4, 12, 8, 12)];
const PIGLIN_FLOOR: Box[] = [bx(3, 0, 3, 13, 8, 13)];
/** vanilla WallSkullBlock.AABBS (and PiglinWallSkullBlock's): against the wall behind the way it faces */
const WALL: Record<string, Box[]> = {
  north: [bx(4, 4, 8, 12, 12, 16)],
  south: [bx(4, 4, 0, 12, 12, 8)],
  east: [bx(0, 4, 4, 8, 12, 12)],
  west: [bx(8, 4, 4, 16, 12, 12)],
};
const PIGLIN_WALL: Record<string, Box[]> = {
  north: [bx(3, 4, 8, 13, 12, 16)],
  south: [bx(3, 4, 0, 13, 12, 8)],
  east: [bx(0, 4, 3, 8, 12, 13)],
  west: [bx(8, 4, 3, 16, 12, 13)],
};

/** vanilla models/block/skull.json: nothing to mesh, soul sand's specks when it breaks */
const SKULL_MODEL: ModelDef = { particle: 'soul_sand', elements: [] };

export function registerSkullBlocks(): void {
  // vanilla Blocks.*_SKULL / *_HEAD: strength 1, stone's sounds (the default), nothing needed to break them, pushed
  // blocks break them (PushReaction.DESTROY); they don't hide what's round them (SkullBlock.getOcclusionShape empty)
  const common = {
    hardness: 1, resistance: 1, sound: 'stone', opaque: false, aoCaster: false, opacity: 0, faceOcclusion: 0,
    model: () => ({ model: SKULL_MODEL }),
  };
  for (const t of SKULL_TYPES) {
    const [floor, wall] = SKULL_BLOCKS[t];
    const piglin = t === 'piglin';
    registerBlock(floor, { ...common, props: [SKULL_ROTATION, P.powered], collision: piglin ? PIGLIN_FLOOR : FLOOR });
    registerBlock(wall, {
      ...common, props: [P.facingH, P.powered], item: floor,
      collision: (s) => (piglin ? PIGLIN_WALL : WALL)[s.get<string>('facing')],
    });
  }
}
