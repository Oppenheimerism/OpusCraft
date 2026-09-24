// Banners (vanilla BannerBlock and WallBannerBlock, one of each for every dye colour): a standing banner turns to
// any of sixteen directions, a wall banner hangs on the face of a block. The block itself draws nothing (vanilla
// block/banner.json has only its particle, oak planks); BannerRenderer draws the pole, the bar and the flag with its
// patterns from the block entity. What they do is in game/banners.ts.

import { registerBlock, intProp, P, type Box } from './block';
import type { ModelDef } from './models';
import { BANNER_COLORS } from './bannerPatterns';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla BannerBlock.ROTATION (BlockStateProperties.ROTATION_16) */
export const BANNER_ROTATION = intProp('rotation', 0, 15);

/** vanilla BannerBlock.SHAPE: the pole */
const STANDING_SHAPE = [bx(4, 0, 4, 12, 16, 12)];

/** vanilla WallBannerBlock.SHAPES: the bar along the wall it hangs on */
const WALL_SHAPES: Record<string, Box[]> = {
  north: [bx(0, 0, 14, 16, 12.5, 16)],
  south: [bx(0, 0, 0, 16, 12.5, 2)],
  west: [bx(14, 0, 0, 16, 12.5, 16)],
  east: [bx(0, 0, 0, 2, 12.5, 16)],
};

/** nothing to mesh, only oak planks' specks when it breaks */
const PARTICLE_ONLY: ModelDef = { particle: 'oak_planks', elements: [] };

export function registerBannerBlocks(): void {
  // (vanilla Blocks.*_BANNER: wood's colour on maps, strength 1, wood's sounds, no collision, set alight by lava)
  const common = {
    hardness: 1, sound: 'wood', tool: 'axe' as const, flammable: true, mapColor: 0x8f7748,
    collision: 'none' as const, opaque: false, aoCaster: false, opacity: 0, faceOcclusion: 0,
    model: () => ({ model: PARTICLE_ONLY }),
  };
  for (const c of BANNER_COLORS) {
    registerBlock(`${c}_banner`, { ...common, props: [BANNER_ROTATION], outline: STANDING_SHAPE });
  }
  // (vanilla wallVariant: a wall banner is its standing banner's item and drops it)
  for (const c of BANNER_COLORS) {
    registerBlock(`${c}_wall_banner`, {
      ...common, props: [P.facingH], item: `${c}_banner`,
      outline: (s) => WALL_SHAPES[s.get<string>('facing')],
    });
  }
}
