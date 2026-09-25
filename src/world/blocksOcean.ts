// The ocean's blocks (Stage 5: ocean): prismarine, prismarine bricks and dark prismarine — the cyan-green stone of
// the ocean monuments, the first slowly shifting its hue (an animated texture) — with prismarine's wall (the only
// one of the three with a wall; their slabs and stairs are in the shared table of blocks.ts), and the wet sponge, a
// sponge full of water (what the sponges do is game/sponge.ts). The sea lantern and the dry sponge were here before.
// And the conduit (vanilla ConduitBlock), which its block entity draws and works (game/conduit.ts). And (M6) the
// turtle egg (vanilla TurtleEggBlock), which game/turtleEggs.ts works.

import { registerBlock, intProp, P, type Box, type StateView } from './block';
import { cubeAll, box, type ElementDef, type ModelDef, type ModelChoice, type UV4 } from './models';
import { registerWall } from './blocksExtra';

const one = (m: ModelDef) => (): ModelChoice => ({ model: m });
const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/**
 * the turtle eggs of a clutch, in the order they join it: where each sits in the block, and the parts of the egg
 * texture its sides and its top show (original models in the manner of vanilla's template_*_turtle_eggs)
 */
const EGG_PLACES: { from: [number, number, number]; to: [number, number, number]; side: UV4; top: UV4 }[] = [
  { from: [5, 0, 4], to: [9, 7, 8], side: [1, 4, 5, 11], top: [0, 0, 4, 4] },
  { from: [1, 0, 7], to: [4, 5, 10], side: [10, 1, 13, 6], top: [6, 7, 9, 10] },
  { from: [6, 0, 9], to: [9, 4, 12], side: [11, 8, 14, 12], top: [6, 12, 9, 15] },
  { from: [10, 0, 4], to: [13, 5, 7], side: [1, 11, 4, 16], top: [12, 13, 15, 16] },
];
const EGG_TEXTURES = ['turtle_egg', 'turtle_egg_slightly_cracked', 'turtle_egg_very_cracked'];

/** the model of `eggs` turtle eggs, cracked `hatch` times */
function turtleEggModel(eggs: number, hatch: number): ModelDef {
  const t = EGG_TEXTURES[hatch];
  const elements: ElementDef[] = EGG_PLACES.slice(0, eggs).map(({ from, to, side, top }) => {
    const e = box(from, to, t);
    for (const [d, f] of Object.entries(e.faces)) if (f) f.uv = d === 'up' || d === 'down' ? top : side;
    return e;
  });
  return { particle: t, elements };
}

export function registerOceanBlocks(): void {
  // vanilla Blocks.PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE: strength 1.5 / 6, only a pickaxe gets them
  for (const name of ['prismarine', 'prismarine_bricks', 'dark_prismarine'])
    registerBlock(name, { hardness: 1.5, resistance: 6, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: one(cubeAll(name)) });
  // vanilla Blocks.PRISMARINE_WALL
  registerWall('prismarine_wall', 'prismarine', 1.5);
  // vanilla Blocks.WET_SPONGE: strength 0.6, SoundType.WET_SPONGE; quickest with a hoe
  registerBlock('wet_sponge', { hardness: 0.6, sound: 'wet_sponge', tool: 'hoe', model: one(cubeAll('wet_sponge')) });
  // vanilla Blocks.CONDUIT: diamond's colour on maps, strength 3, light 15, no occlusion, waterlogged by default (its
  // placement: only in a full block of water, game/conduit.ts); a 6-pixel box in the middle; quickest with a pickaxe.
  // The block draws nothing itself (vanilla RenderShape.ENTITYBLOCK_ANIMATED); its item is a shell (larger than the
  // block's, to show in a slot)
  registerBlock('conduit', {
    props: [P.waterlogged], defaults: { waterlogged: true }, hardness: 3, sound: 'stone', tool: 'pickaxe', light: 15, opaque: false, aoCaster: false,
    faceOcclusion: 0, collision: [bx(5, 5, 5, 11, 11, 11)],
    model: () => ({ model: { particle: 'conduit', elements: [] } }),
    itemModel: { particle: 'conduit', elements: [box([3, 3, 3], [13, 13, 13], 'conduit', { noCull: true })] },
  });
  // (M6) vanilla Blocks.TURTLE_EGG: sand's colour on maps, strength 0.5, METAL's sounds (as vanilla has it), random
  // ticks, no occlusion, a piston breaks it. One to four eggs, cracked up to twice; one egg's shape is 3..12 across,
  // more 1..15, all 7 high (vanilla ONE_EGG_AABB, MULTIPLE_EGGS_AABB). Each position turns the clutch its own way
  // (vanilla's four y-rotated variants)
  const models = [1, 2, 3, 4].map((n) => [0, 1, 2].map((h) => turtleEggModel(n, h)));
  registerBlock('turtle_egg', {
    props: [intProp('eggs', 1, 4), intProp('hatch', 0, 2)], defaults: { eggs: 1, hatch: 0 },
    hardness: 0.5, sound: 'metal', randomTicks: true, opaque: false, faceOcclusion: 0, aoCaster: false,
    collision: (s: StateView) => [s.get<number>('eggs') > 1 ? bx(1, 0, 1, 15, 7, 15) : bx(3, 0, 3, 12, 7, 12)],
    model: (s: StateView): ModelChoice => [0, 90, 180, 270].map((y) => ({ model: models[s.get<number>('eggs') - 1][s.get<number>('hatch')], y })),
  });
}
