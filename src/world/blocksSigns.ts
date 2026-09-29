// Signs and hanging signs (vanilla StandingSignBlock, WallSignBlock, CeilingHangingSignBlock and WallHangingSignBlock,
// one of each for every wood type): a standing sign turns to any of sixteen directions on its stick, a wall sign sits
// on the face of a block, a hanging sign hangs from the underside of one (on a vee of chains when it hangs from
// something narrower than a full face, `attached`) and a wall hanging sign swings from a bracket out of the side of one.
// All four take water in. The blocks draw nothing themselves (vanilla block/oak_sign.json has only its particle, the
// planks; a hanging sign's is its stripped log): render/signRenderer.ts draws the sign and its text from the block
// entity (world/signBlockEntity.ts). Placing, editing, dyeing and waxing are game/signs.ts.

import { registerBlock, intProp, boolProp, P, type Box } from './block';
import type { ModelDef } from './models';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla WoodType.values() that have signs, in vanilla's order (the creative tab's and the recipe book's) */
export const SIGN_WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped'] as const;
export type SignWood = (typeof SIGN_WOODS)[number];

/** vanilla SignBlock.ROTATION / CeilingHangingSignBlock.ROTATION (BlockStateProperties.ROTATION_16) */
export const SIGN_ROTATION = intProp('rotation', 0, 15);
/** vanilla CeilingHangingSignBlock.ATTACHED: hung from a narrow block on a vee of chains, not from a full face */
export const SIGN_ATTACHED = boolProp('attached');

/** vanilla WoodType.soundType: the sign's sounds */
export function signSound(w: SignWood): string {
  return w === 'cherry' ? 'cherry_wood' : w === 'bamboo' ? 'bamboo_wood' : w === 'crimson' || w === 'warped' ? 'nether_wood' : 'wood';
}

/** vanilla WoodType.hangingSignSoundType: the hanging sign's (SoundType.HANGING_SIGN and its cherry, bamboo and nether kin) */
export function hangingSignSound(w: SignWood): string {
  return w === 'cherry' ? 'cherry_wood_hanging_sign' : w === 'bamboo' ? 'bamboo_wood_hanging_sign' : w === 'crimson' || w === 'warped' ? 'nether_wood_hanging_sign' : 'hanging_sign';
}

/** the planks a wood's sign is made from (its particle, vanilla block/<wood>_sign.json) */
export function signPlanks(w: SignWood): string {
  return `${w}_planks`;
}

/** the stripped log a wood's hanging sign is made from (its particle, vanilla block/<wood>_hanging_sign.json) */
export function hangingSignLog(w: SignWood): string {
  return w === 'crimson' || w === 'warped' ? `stripped_${w}_stem` : w === 'bamboo' ? 'stripped_bamboo_block' : `stripped_${w}_log`;
}

/** vanilla SignBlock.SHAPE: the stick's column */
const STANDING_SHAPE = [bx(4, 0, 4, 12, 16, 12)];

/** vanilla WallSignBlock.AABBS: the board against the wall behind the way it faces */
const WALL_SHAPES: Record<string, Box[]> = {
  north: [bx(0, 4.5, 14, 16, 12.5, 16)],
  south: [bx(0, 4.5, 0, 16, 12.5, 2)],
  east: [bx(0, 4.5, 0, 2, 12.5, 16)],
  west: [bx(14, 4.5, 0, 16, 12.5, 16)],
};

/** vanilla CeilingHangingSignBlock.AABBS: the board when it's square to the world, SHAPE when it's turned between */
const HANGING_ALONG_X = [bx(1, 0, 7, 15, 10, 9)];
const HANGING_ALONG_Z = [bx(7, 0, 1, 9, 10, 15)];
const HANGING_SHAPE = [bx(3, 0, 3, 13, 16, 13)];

/** vanilla WallHangingSignBlock.PLANK_NORTHSOUTH / PLANK_EASTWEST: the bracket (the only part that's solid) */
const PLANK_NS = bx(0, 14, 6, 16, 16, 10);
const PLANK_EW = bx(6, 14, 0, 10, 16, 16);
/** vanilla WallHangingSignBlock.SHAPE_NORTHSOUTH / SHAPE_EASTWEST: the bracket and the board under it */
const WALL_HANGING_NS = [PLANK_NS, bx(1, 0, 7, 15, 10, 9)];
const WALL_HANGING_EW = [PLANK_EW, bx(7, 0, 1, 9, 10, 15)];

/** vanilla CeilingHangingSignBlock.getShape */
export function hangingSignShape(rotation: number): Box[] {
  return rotation === 0 || rotation === 8 ? HANGING_ALONG_X : rotation === 4 || rotation === 12 ? HANGING_ALONG_Z : HANGING_SHAPE;
}

export function registerSignBlocks(): void {
  for (const w of SIGN_WOODS) {
    const nether = w === 'crimson' || w === 'warped';
    // (vanilla Blocks.*_SIGN: forced solid, no collision, strength 1, lit by lava unless it's a nether wood; an axe
    // takes it down quickest, #mineable/axe)
    const common = {
      hardness: 1, tool: 'axe' as const, flammable: !nether, collision: 'none' as const,
      opaque: false, aoCaster: false, faceOcclusion: 0,
    };
    const sign: ModelDef = { particle: signPlanks(w), elements: [] };
    const hanging: ModelDef = { particle: hangingSignLog(w), elements: [] };
    registerBlock(`${w}_sign`, {
      ...common, sound: signSound(w), props: [SIGN_ROTATION, P.waterlogged], outline: STANDING_SHAPE,
      model: () => ({ model: sign }),
    });
    // (vanilla wallVariant: a wall sign is its standing sign's item, drops it and is named after it)
    registerBlock(`${w}_wall_sign`, {
      ...common, sound: signSound(w), props: [P.facingH, P.waterlogged], item: `${w}_sign`,
      outline: (s) => WALL_SHAPES[s.get<string>('facing')], model: () => ({ model: sign }),
    });
    registerBlock(`${w}_hanging_sign`, {
      ...common, sound: hangingSignSound(w), props: [SIGN_ATTACHED, SIGN_ROTATION, P.waterlogged],
      outline: (s) => hangingSignShape(s.get<number>('rotation')), model: () => ({ model: hanging }),
    });
    // (vanilla WallHangingSignBlock.getCollisionShape: the bracket is solid, whatever noCollission says)
    registerBlock(`${w}_wall_hanging_sign`, {
      ...common, sound: hangingSignSound(w), props: [P.facingH, P.waterlogged], item: `${w}_hanging_sign`,
      collision: (s) => [s.get<string>('facing') === 'east' || s.get<string>('facing') === 'west' ? PLANK_EW : PLANK_NS],
      outline: (s) => (s.get<string>('facing') === 'east' || s.get<string>('facing') === 'west' ? WALL_HANGING_EW : WALL_HANGING_NS),
      model: () => ({ model: hanging }),
    });
  }
}

const KINDS = new Map<string, { wood: SignWood; kind: 'sign' | 'wall_sign' | 'hanging_sign' | 'wall_hanging_sign' }>();
for (const w of SIGN_WOODS) {
  for (const kind of ['sign', 'wall_sign', 'hanging_sign', 'wall_hanging_sign'] as const) KINDS.set(`${w}_${kind}`, { wood: w, kind });
}

/** a sign block's wood and kind (undefined: not a sign) */
export function signOf(name: string): { wood: SignWood; kind: 'sign' | 'wall_sign' | 'hanging_sign' | 'wall_hanging_sign' } | undefined {
  return KINDS.get(name);
}

/** vanilla BlockTags.ALL_HANGING_SIGNS */
export function isHangingSign(name: string): boolean {
  const k = KINDS.get(name)?.kind;
  return k === 'hanging_sign' || k === 'wall_hanging_sign';
}

/** vanilla BlockTags.WALL_HANGING_SIGNS */
export function isWallHangingSign(name: string): boolean {
  return KINDS.get(name)?.kind === 'wall_hanging_sign';
}
