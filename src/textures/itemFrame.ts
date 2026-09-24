// Item frames' textures (vanilla block/item_frame.png and block/glow_item_frame.png: the leather backs, 16x16, of
// which a frame shows the middle 10x10 and a map's frame the middle 14x14; the moulding round them is birch planks).
// Hand-drawn approximations, not copies of vanilla's: a tanned leather, creased and mottled, and the glow frame's the
// same dyed with glow ink, flecked with its brighter light.

import { img, setPx, mixC, mulC, isAnim, valueNoise, type TexImage, type TexDef } from './tex';
import { Rand } from '../core/rng';
import { BLOCK_TEXTURES } from './blocks';

/** a leather back: `base` its tone, `fleck` the odd brighter speck (the glow ink's) or null */
function leather(seed: number, base: number, dark: number, light: number, fleck: number | null): TexImage {
  const t = img(16, 16);
  const r = new Rand(seed, 3);
  const n = valueNoise(r, 16, 16, 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let v = n[y * 16 + x];
      // a crease or two across it, and the hide a shade darker toward its edges
      if ((x + 2 * y) % 11 === 0 || (3 * x - y + 40) % 13 === 0) v -= 0.25;
      const e = Math.min(x, y, 15 - x, 15 - y);
      if (e === 0) v -= 0.3;
      let c = v < 0.3 ? mixC(dark, base, v / 0.3) : v < 0.7 ? base : mixC(base, light, (v - 0.7) / 0.3);
      if (r.chance(0.08)) c = mulC(c, 0.9);
      if (fleck !== null && e > 0 && r.chance(0.07)) c = mixC(c, fleck, 0.7);
      setPx(t, x, y, c);
    }
  return t;
}

/** vanilla block/item_frame.png */
export function itemFrameBack(): TexImage {
  return leather(0x1f3a, 0x7c5030, 0x5e3b22, 0x946338, null);
}

/** vanilla block/glow_item_frame.png */
export function glowItemFrameBack(): TexImage {
  return leather(0x6b10, 0x2f8f80, 0x1d6b60, 0x4fb8a4, 0xb8f5e4);
}

let SHEET: TexImage | null = null;

/** the frames' textures side by side (48x16): birch planks, then the frame's back, then the glow frame's */
export function itemFrameSheet(): TexImage {
  if (SHEET) return SHEET;
  const still = (t: TexDef): TexImage => (isAnim(t) ? { w: t.w, h: t.h, data: t.frames[0] } : t);
  const parts = [still(BLOCK_TEXTURES['birch_planks']()), itemFrameBack(), glowItemFrameBack()];
  const t = img(48, 16);
  parts.forEach((p, i) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const s = (y * p.w + x) * 4, d = (y * 48 + i * 16 + x) * 4;
        for (let k = 0; k < 4; k++) t.data[d + k] = p.data[s + k];
      }
  });
  SHEET = t;
  return t;
}
