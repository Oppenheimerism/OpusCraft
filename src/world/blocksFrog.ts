// The frogs' blocks (M9): frogspawn (vanilla FrogspawnBlock; its hatching and the rest are game/frogspawn.ts) and
// the three froglights (vanilla RotatedPillarBlock), what a frog makes of a small magma cube: ochre from a temperate
// frog, verdant from a cold one, pearlescent from a warm one.

import { registerBlock, P, Layer, type StateView } from './block';
import { cubeColumn, flatPlane, type ModelChoice, type ModelDef } from './models';

/** a pillar's model turned to its axis (vanilla blockstates of a RotatedPillarBlock) */
function axisModel(m: ModelDef) {
  return (s: StateView): ModelChoice => {
    const a = s.get('axis');
    if (a === 'y') return { model: m };
    if (a === 'z') return { model: m, x: 90 };
    return { model: m, x: 90, y: 90 };
  };
}

export function registerFrogBlocks(): void {
  // vanilla Blocks.FROGSPAWN: water's colour on maps, broken at a touch, no occlusion, nothing to bump into (a sliver
  // 1.5 pixels high to aim at), SoundType.FROGSPAWN, a piston breaks it; drawn as a film on the water (translucent,
  // vanilla block/frogspawn). (Random ticks only to find its hatching again when its chunk was saved or unloaded
  // before it hatched: game/frogspawn.ts)
  const spawn = flatPlane('frogspawn', 0.25);
  registerBlock('frogspawn', {
    hardness: 0, sound: 'frogspawn', collision: 'none', outline: [[0, 0, 0, 1, 1.5 / 16, 1]], layer: Layer.TRANSLUCENT, opaque: false, faceOcclusion: 0,
    aoCaster: false, randomTicks: true, model: () => ({ model: spawn }),
  });
  // vanilla Blocks.OCHRE_FROGLIGHT, VERDANT_FROGLIGHT and PEARLESCENT_FROGLIGHT: strength 0.3, light 15,
  // SoundType.FROGLIGHT, set along any axis (vanilla block/*_froglight: cube_column)
  for (const c of ['ochre', 'verdant', 'pearlescent']) {
    const n = `${c}_froglight`;
    registerBlock(n, { props: [P.axis], defaults: { axis: 'y' }, hardness: 0.3, sound: 'froglight', light: 15, model: axisModel(cubeColumn(`${n}_side`, `${n}_top`)) });
  }
}
