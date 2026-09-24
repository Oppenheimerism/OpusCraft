// Suspicious sand and suspicious gravel (vanilla block/suspicious_sand_0..3, suspicious_gravel_0..3): the block with
// something buried in it, a little heaped and pitted where it lies (stage 0) and brushed out deeper at each stage
// after (the BrushableBlock's DUSTED 1..3), a hollow opening in the middle lit along its far side.

import { TexImage, Rand, getPx, plot, mixC, mulC } from '../tex';
import { hashString } from '../../core/rng';

type Gen = () => TexImage;

function R(name: string): Rand {
  return new Rand(hashString(name), 77);
}

/** how far (x, y) is into a lumpy round hollow of radius `rad` at (cx, cy): 1 at its middle, 0 at its edge, < 0 out */
function hollow(r: Rand, rad: number, cx: number, cy: number): (x: number, y: number) => number {
  const bumps = Array.from({ length: 6 }, () => (r.next() - 0.5) * 0.36);
  return (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const a = ((Math.atan2(dy, dx) / (Math.PI * 2)) * 6 + 6) % 6;
    const i = Math.floor(a), f = a - i;
    const k = bumps[i] + (bumps[(i + 1) % 6] - bumps[i]) * f;
    return 1 - Math.hypot(dx, dy) / (rad * (1 + k));
  };
}

/**
 * `base` brushed to `stage`: stage 0 the grains a little heaped here and pitted there; each stage after a wider,
 * deeper hollow in the middle, shaded on its near (top left) side and lit on its far one, with a lip of what was
 * brushed out round it
 */
function suspicious(base: TexImage, name: string, stage: number, deep: number): TexImage {
  const t = base;
  const r = R(`${name}_${stage}`);
  // (every stage keeps the stage-0 disturbance: little pits, each with a heap of what came out of it below right)
  const marks = R(name);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(marks.next() * 15), y = Math.floor(marks.next() * 15);
    plot(t, x, y, mulC(getPx(t, x, y), 0.8));
    if (marks.chance(0.6)) plot(t, x + 1, y, mulC(getPx(t, x + 1, y), 0.88));
    plot(t, x + 1, y + 1, mulC(getPx(t, x + 1, y + 1), 1.1));
  }
  if (stage === 0) return t;
  const rad = [0, 3.1, 4.6, 6.1][stage];
  const h = hollow(r, rad, 8, 8.5);
  const src = new Uint32Array(256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) src[y * 16 + x] = getPx(t, x, y);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const v = h(x, y);
      const c = src[y * 16 + x];
      if (v >= 0) {
        // the slope's light: the top left wall faces away from the light, the bottom right one into it
        const up = h(x, y - 1), left = h(x - 1, y), down = h(x, y + 1), right = h(x + 1, y);
        const slope = (up - down + left - right) * rad * 0.5;
        const depth = Math.min(1, v * (0.6 + stage * 0.15));
        let col = mixC(c, deep, depth * (0.5 + stage * 0.08));
        col = mulC(col, 1 + slope * 0.24 + (r.next() - 0.5) * 0.06);
        plot(t, x, y, col);
      } else if (v > -0.28) {
        // the brushed-out grains heaped round the rim, brighter where they face the light
        const s = x + y < 16.5 ? 1.06 : 1.1;
        plot(t, x, y, mulC(c, s));
      }
    }
  return t;
}

/** add the suspicious blocks' textures to a registry (textures/blocks.ts) */
export function registerArchaeologyTextures(T: Record<string, () => TexImage | { w: number; h: number; frames: Uint8ClampedArray[] }>): void {
  const G = T as Record<string, Gen>;
  for (let stage = 0; stage < 4; stage++) {
    G[`suspicious_sand_${stage}`] = () => suspicious(G['sand'](), 'suspicious_sand', stage, 0x7d6a48);
    G[`suspicious_gravel_${stage}`] = () => suspicious(G['gravel'](), 'suspicious_gravel', stage, 0x2a2625);
  }
}
