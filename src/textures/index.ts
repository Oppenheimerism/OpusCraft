// Texture registry: generates every texture referenced by block models.

import { BLOCK_TEXTURES } from './blocks';
import { TexDef, AnimTex, img, isAnim, TexImage } from './tex';
import { BLOCKS, STATE_VIEWS } from '../world/block';
import { modelTextures, ModelChoice, Variant } from '../world/models';

function tile2x(t: TexDef): TexDef {
  const tileFrame = (d: Uint8ClampedArray, w: number) => {
    const o = new Uint8ClampedArray(w * 2 * w * 2 * 4);
    for (let y = 0; y < w * 2; y++)
      for (let x = 0; x < w * 2; x++) {
        const si = ((y % w) * w + (x % w)) * 4, di = (y * w * 2 + x) * 4;
        o[di] = d[si]; o[di + 1] = d[si + 1]; o[di + 2] = d[si + 2]; o[di + 3] = d[si + 3];
      }
    return o;
  };
  if (isAnim(t)) return { ...t, w: t.w * 2, h: t.h * 2, frames: t.frames.map((f) => tileFrame(f, t.w)) } as AnimTex;
  return { w: t.w * 2, h: t.h * 2, data: tileFrame((t as TexImage).data, t.w) };
}

export function collectBlockTextureNames(): Set<string> {
  const names = new Set<string>(['missing', 'water_still', 'water_flow', 'water_overlay', 'lava_still', 'lava_flow']);
  const seen = new Set<unknown>();
  for (const b of BLOCKS) {
    if (!b.s.model) continue;
    for (let st = b.baseState; st < b.baseState + b.stateCount; st++) {
      const choice: ModelChoice = b.s.model(STATE_VIEWS[st]);
      const parts = (choice as { parts?: (Variant | Variant[])[] }).parts;
      const variants: Variant[] = Array.isArray(choice) ? choice : parts ? parts.flat() : [choice as Variant];
      for (const v of variants) {
        if (seen.has(v.model)) continue;
        seen.add(v.model);
        modelTextures(v.model, names);
      }
    }
  }
  return names;
}

export function generateBlockTextures(): { textures: Map<string, TexDef>; missing: string[] } {
  const names = collectBlockTextureNames();
  const out = new Map<string, TexDef>();
  const missing: string[] = [];
  for (const n of names) {
    const gen = BLOCK_TEXTURES[n];
    if (gen) {
      let t = gen();
      if (n === 'water_flow' || n === 'lava_flow') t = tile2x(t);
      out.set(n, t);
    } else if (n === 'water_overlay') {
      const t = BLOCK_TEXTURES['water_still']();
      out.set(n, isAnim(t) ? { w: t.w, h: t.h, data: t.frames[0] } : t);
    } else {
      missing.push(n);
      out.set(n, BLOCK_TEXTURES['missing']());
    }
  }
  return { textures: out, missing };
}

export { img };
