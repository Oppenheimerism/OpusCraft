// Sprite sheet for non-terrain particles (vanilla particle atlas).

import type { GL } from './gl';
import { createTexture } from './gl';
import { MOB_PARTICLE_TEXTURES } from '../textures/mobs';
import { ITEM_TEXTURES } from '../textures/items';
import { ITEMS } from '../item/item';
import { BLOCK_TEXTURES } from '../textures/blocks';
import { isAnim } from '../textures/tex';
import { sgaParticleTextures } from '../textures/sga';
import { campfireSmokeTextures } from '../textures/campfireSmoke';
import { glitterTextures } from '../textures/blocklib/outerEnd';
import { fireworkParticleTextures } from '../textures/fireworks';
// (the deep dark)
import { sculkParticleTextures } from '../textures/sculkParticles';
// (trial chambers)
import { trialChamberParticleTextures } from '../textures/trialChamberParticles';
import type { SpriteRectUV } from './particles';

export function buildParticleAtlas(gl: GL): { texture: WebGLTexture; rects: Record<string, SpriteRectUV> } {
  const src: Record<string, () => { w: number; h: number; data: Uint8ClampedArray }> = { ...MOB_PARTICLE_TEXTURES };
  // enchanting table runes (vanilla particle/sga_a..sga_z)
  Object.assign(src, sgaParticleTextures());
  // campfire smoke (vanilla particle/big_smoke_0..11)
  Object.assign(src, campfireSmokeTextures());
  // end rod motes and firework sparks (vanilla particle/glitter_0..7)
  Object.assign(src, glitterTextures());
  // a firework's flash (vanilla particle/flash)
  Object.assign(src, fireworkParticleTextures());
  // the deep dark's: vibration, shriek, sculk_charge_0..6, sculk_charge_pop_0..3, sculk_soul_0..10 (and M4's sonic_boom_0..15;
  // Soul Speed's soul_0..10)
  Object.assign(src, sculkParticleTextures());
  // (trial chambers) the trial spawner's detection wisps, Trial Omen's curl, the ominous and vault sparks
  Object.assign(src, trialChamberParticleTextures());
  // item crumb particles (vanilla ItemParticleOption)
  if (ITEM_TEXTURES['slime_ball']) src['item_slime_ball'] = ITEM_TEXTURES['slime_ball'];
  if (ITEM_TEXTURES['egg']) src['item_egg'] = ITEM_TEXTURES['egg'];
  if (ITEM_TEXTURES['snowball']) src['item_snowball'] = ITEM_TEXTURES['snowball'];
  if (ITEM_TEXTURES['ender_eye']) src['item_ender_eye'] = ITEM_TEXTURES['ender_eye'];
  // (foxes) the crumbs of whatever food a mob eats: every food's sprite
  for (const it of ITEMS.values()) if (it.food && it.texture && ITEM_TEXTURES[it.texture]) src[`item_${it.id}`] ??= ITEM_TEXTURES[it.texture];
  // (a splash potion's model's particle texture is its layer0, the untinted liquid: grey glass shards)
  if (ITEM_TEXTURES['potion_overlay']) src['item_splash_potion'] = ITEM_TEXTURES['potion_overlay'];
  if (BLOCK_TEXTURES['cobweb'])
    src['item_cobweb'] = () => {
      const t = BLOCK_TEXTURES['cobweb']();
      return isAnim(t) ? { w: t.w, h: t.h, data: t.frames[0] } : t;
    };
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
