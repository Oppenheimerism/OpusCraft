// Nether blocks (vanilla 1.16+): netherrack and its ores, soul sand and soul
// soil, basalt, blackstone, the nyliums and wart blocks, ancient debris, and
// the nether portal.

import { registerBlock, P, Layer, StateView, Box, enumProp } from './block';
import type { ModelDef, ModelChoice, Variant } from './models';
import { cubeAll, cubeColumn, cubeBottomTop } from './models';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

function axisModel(m: ModelDef) {
  return (s: StateView): ModelChoice => {
    const a = s.get('axis');
    if (a === 'y') return { model: m };
    if (a === 'z') return { model: m, x: 90 };
    return { model: m, x: 90, y: 90 };
  };
}

/** vanilla netherrack.json: every one of the 16 x/y turns, so the rock never tiles */
function allTurns(m: ModelDef): Variant[] {
  const out: Variant[] = [];
  for (const x of [0, 90, 180, 270]) for (const y of [0, 90, 180, 270]) out.push({ model: m, x, y } as Variant);
  return out;
}

export const PORTAL_AXIS = enumProp('axis', ['x', 'z']);

export function registerNetherBlocks(): void {
  const rack = cubeAll('netherrack');
  registerBlock('netherrack', { hardness: 0.4, resistance: 0.4, sound: 'netherrack', tool: 'pickaxe', requiresTool: true, model: () => allTurns(rack) });
  registerBlock('nether_quartz_ore', { hardness: 3, resistance: 3, sound: 'nether_ore', tool: 'pickaxe', requiresTool: true, model: () => ({ model: cubeAll('nether_quartz_ore') }) });
  registerBlock('nether_gold_ore', { hardness: 3, resistance: 3, sound: 'nether_gold_ore', tool: 'pickaxe', requiresTool: true, model: () => ({ model: cubeAll('nether_gold_ore') }) });
  // vanilla SoulSandBlock: sinks you in a little (14px collision) and slows you down
  registerBlock('soul_sand', {
    hardness: 0.5, sound: 'soul_sand', tool: 'shovel', speedFactor: 0.4, collision: [bx(0, 0, 0, 16, 14, 16)], opaque: true,
    model: () => ({ model: cubeAll('soul_sand') }),
  });
  registerBlock('soul_soil', { hardness: 0.5, sound: 'soul_soil', tool: 'shovel', model: () => ({ model: cubeAll('soul_soil') }) });
  registerBlock('basalt', {
    props: [P.axis], defaults: { axis: 'y' }, hardness: 1.25, resistance: 4.2, sound: 'basalt', tool: 'pickaxe', requiresTool: true,
    model: axisModel(cubeColumn('basalt_side', 'basalt_top')),
  });
  registerBlock('blackstone', { hardness: 1.5, resistance: 6, sound: 'stone', tool: 'pickaxe', requiresTool: true, model: () => ({ model: cubeColumn('blackstone', 'blackstone_top') }) });
  for (const k of ['crimson', 'warped']) {
    // vanilla NyliumBlock: turns back into netherrack when smothered (randomTicks)
    registerBlock(`${k}_nylium`, {
      hardness: 0.4, resistance: 0.4, sound: 'nylium', tool: 'pickaxe', requiresTool: true, randomTicks: true,
      model: () => ({ model: cubeBottomTop(`${k}_nylium_side`, 'netherrack', `${k}_nylium`) }),
    });
  }
  registerBlock('nether_wart_block', { hardness: 1, resistance: 1, sound: 'wart_block', tool: 'hoe', model: () => ({ model: cubeAll('nether_wart_block') }) });
  registerBlock('warped_wart_block', { hardness: 1, resistance: 1, sound: 'wart_block', tool: 'hoe', model: () => ({ model: cubeAll('warped_wart_block') }) });
  registerBlock('ancient_debris', {
    hardness: 30, resistance: 1200, sound: 'ancient_debris', tool: 'pickaxe', requiresTool: true, tier: 3,
    model: () => ({ model: cubeColumn('ancient_debris_side', 'ancient_debris_top') }),
  });

  // vanilla NetherPortalBlock: a thin pane of swirling light across its axis, walked through
  const pane = (axis: string): ModelDef =>
    axis === 'x'
      ? { particle: 'nether_portal', elements: [{ from: [0, 0, 6], to: [16, 16, 10], faces: { north: { tex: 'nether_portal', uv: [0, 0, 16, 16] }, south: { tex: 'nether_portal', uv: [0, 0, 16, 16] } } }] }
      : { particle: 'nether_portal', elements: [{ from: [6, 0, 0], to: [10, 16, 16], faces: { east: { tex: 'nether_portal', uv: [0, 0, 16, 16] }, west: { tex: 'nether_portal', uv: [0, 0, 16, 16] } } }] };
  const portalX = pane('x'), portalZ = pane('z');
  registerBlock('nether_portal', {
    props: [PORTAL_AXIS], hardness: -1, resistance: 0, sound: 'glass', light: 11, layer: Layer.TRANSLUCENT, opaque: false, opacity: 0,
    collision: 'none', outline: (s) => (s.get('axis') === 'x' ? [bx(0, 0, 6, 16, 16, 10)] : [bx(6, 0, 0, 10, 16, 16)]),
    faceOcclusion: 0, aoCaster: false, randomTicks: true, item: false, noDrop: true,
    model: (s) => ({ model: s.get('axis') === 'x' ? portalX : portalZ }),
  });
}
