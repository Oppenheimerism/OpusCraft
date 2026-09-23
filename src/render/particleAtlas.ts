// Sprite sheet for non-terrain particles (vanilla particle atlas).

import type { GL } from './gl';
import { createTexture } from './gl';
import { MOB_PARTICLE_TEXTURES } from '../textures/mobs';
import { ITEM_TEXTURES } from '../textures/items';
import { sgaParticleTextures } from '../textures/sga';
import type { SpriteRectUV } from './particles';

export function buildParticleAtlas(gl: GL): { texture: WebGLTexture; rects: Record<string, SpriteRectUV> } {
  const src: Record<string, () => { w: number; h: number; data: Uint8ClampedArray }> = { ...MOB_PARTICLE_TEXTURES };
  // enchanting table runes (vanilla particle/sga_a..sga_z)
  Object.assign(src, sgaParticleTextures());
  // item crumb particles (vanilla ItemParticleOption)
  if (ITEM_TEXTURES['slime_ball']) src['item_slime_ball'] = ITEM_TEXTURES['slime_ball'];
  if (ITEM_TEXTURES['egg']) src['item_egg'] = ITEM_TEXTURES['egg'];
  if (ITEM_TEXTURES['snowball']) src['item_snowball'] = ITEM_TEXTURES['snowball'];
  const names = Object.keys(src);
  const cell = 16;
  const cols = 8;
  const rows = Math.max(1, Math.ceil(names.length / cols));
  const W = cols * cell;
  let H = 16;
  while (H < rows * cell) H *= 2;
  const data = new Uint8Array(W * H * 4);
  const rects: Record<string, SpriteRectUV> = {};
  names.forEach((n, i) => {
    const t = src[n]();
    const gx = (i % cols) * cell, gy = Math.floor(i / cols) * cell;
    for (let y = 0; y < Math.min(t.h, cell); y++)
      for (let x = 0; x < Math.min(t.w, cell); x++)
        for (let c = 0; c < 4; c++) data[((gy + y) * W + gx + x) * 4 + c] = t.data[(y * t.w + x) * 4 + c];
    const e = 0.001;
    rects[n] = { u0: (gx + e) / W, v0: (gy + e) / H, u1: (gx + Math.min(t.w, cell) - e) / W, v1: (gy + Math.min(t.h, cell) - e) / H };
  });
  return { texture: createTexture(gl, W, H, data), rects };
}
