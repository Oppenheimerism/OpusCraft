// (cake) The cake and the candle cakes (vanilla CakeBlock and CandleCakeBlock). A cake is a 14 x 8 x 14 slab of sponge
// under frosting, eaten from its west side a slice at a time (vanilla BITES 0..6: 2 pixels a slice); strength 0.5,
// wool's sounds, forced solid (vanilla forceSolidOn: another cake, a sign or a banner stands on it) and broken by
// pistons. An uneaten cake takes a candle of any colour on top and becomes that candle's candle cake (17 of them,
// lit or not), which gives light 3 while it burns and is otherwise the cake it was (vanilla
// Properties.ofLegacyCopy(CAKE)); its item is the cake's (a candle cake has none of its own). What they do is
// game/cake.ts's.

import { registerBlock, P, Layer, type Box, type StateView } from './block';
import { box, type ElementDef, type ModelDef } from './models';
import { CANDLE_NAMES } from './blocksDeepDark';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla CakeBlock.SHAPE_BY_BITE: the cake, eaten from x = 1 by 2 pixels a slice */
export const CAKE_SHAPES: Box[] = [0, 1, 2, 3, 4, 5, 6].map((b) => bx(1 + 2 * b, 0, 1, 15, 8, 15));
/** vanilla CandleCakeBlock.CAKE_SHAPE and CANDLE_SHAPE */
export const CANDLE_CAKE_SHAPES: Box[] = [bx(1, 0, 1, 15, 8, 15), bx(7, 8, 7, 9, 14, 9)];

/** the candle cakes, in the candles' order: candle_cake, white_candle_cake, ..., black_candle_cake */
export const CANDLE_CAKE_NAMES = CANDLE_NAMES.map((c) => `${c}_cake`);

/** the candle cake a candle makes of a cake (vanilla CandleCakeBlock.byCandle), or null if it's no candle */
export function candleCakeFor(candle: string): string | null {
  return CANDLE_NAMES.includes(candle) ? `${candle}_cake` : null;
}

/** the candle a candle cake stands (vanilla CandleCakeBlock.candleBlock) */
export function candleOf(candleCake: string): string {
  return candleCake.slice(0, -'_cake'.length);
}

/** vanilla block/cake.json and cake_slice1..6.json: the cut face (west) shows the inside */
function cakeModel(bites: number): ModelDef {
  const side = 'cake_side';
  return {
    particle: side,
    elements: [box([1 + 2 * bites, 0, 1], [15, 8, 15], { down: 'cake_bottom', up: 'cake_top', north: side, south: side, west: bites ? 'cake_inner' : side, east: side })],
  };
}

/**
 * vanilla block/template_cake_with_candle.json: the whole cake with a candle standing in its middle, the candle's
 * texture as a candle's (the side from v 8 down, the top at v 6..8, the bottom at v 14..16) and its wick two crossed
 * one-pixel planes turned 45 degrees
 */
function candleCakeModel(candleTex: string): ModelDef {
  const tex = candleTex, body = { tex, uv: [0, 8, 2, 14] as [number, number, number, number] };
  const wick = { tex, uv: [0, 5, 1, 6] as [number, number, number, number] };
  const rot = { origin: [8, 14, 8] as [number, number, number], axis: 'y' as const, angle: 45 };
  const candle: ElementDef[] = [
    { from: [7, 8, 7], to: [9, 14, 9], faces: { north: body, south: body, west: body, east: body, up: { tex, uv: [0, 6, 2, 8] }, down: { tex, uv: [0, 14, 2, 16] } } },
    { from: [7.5, 14, 8], to: [8.5, 15, 8], shade: false, rot, faces: { north: wick, south: wick } },
    { from: [8, 14, 7.5], to: [8, 15, 8.5], shade: false, rot, faces: { west: wick, east: wick } },
  ];
  return { particle: 'cake_side', elements: [...cakeModel(0).elements, ...candle] };
}

export function registerCakeBlocks(): void {
  const cakes = [0, 1, 2, 3, 4, 5, 6].map(cakeModel);
  // vanilla Blocks.CAKE: strength 0.5, SoundType.WOOL, forceSolidOn, PushReaction.DESTROY (game/redstone/piston.ts)
  registerBlock('cake', {
    props: [P.bites], hardness: 0.5, resistance: 0.5, sound: 'wool', opaque: false, aoCaster: false, faceOcclusion: 0,
    collision: (s: StateView) => [CAKE_SHAPES[s.get('bites') as number]],
    outline: (s: StateView) => [CAKE_SHAPES[s.get('bites') as number]],
    model: (s) => ({ model: cakes[s.get('bites') as number] }),
  });
  // vanilla Blocks.CANDLE_CAKE and the dyed ones: the cake's properties, light 3 while lit (litBlockEmission(3)),
  // drawn cut out for the wick; its item (and what picking it gives) is the cake
  for (const name of CANDLE_NAMES) {
    const models = [candleCakeModel(name), candleCakeModel(`${name}_lit`)];
    registerBlock(`${name}_cake`, {
      props: [P.lit], hardness: 0.5, resistance: 0.5, sound: 'wool', opaque: false, aoCaster: false, faceOcclusion: 0, layer: Layer.CUTOUT,
      light: (s: StateView) => (s.get('lit') ? 3 : 0),
      collision: CANDLE_CAKE_SHAPES, outline: CANDLE_CAKE_SHAPES,
      model: (s) => ({ model: models[s.get('lit') ? 1 : 0] }),
      item: 'cake',
    });
  }
}
