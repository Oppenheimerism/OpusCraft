// Texture atlas with per-sprite mipmaps (vanilla-style alpha-aware blend)
// and animated sprites.

import type { GL } from './gl';
import type { TexDef, AnimTex, TexImage } from '../textures/tex';
import { isAnim } from '../textures/tex';
import type { SpriteRect } from '../world/models';

const POW22 = new Float32Array(256);
for (let i = 0; i < 256; i++) POW22[i] = Math.pow(i / 255, 2.2);

export const MIP_LEVELS = 4;

interface Placed {
  name: string;
  x: number;
  y: number;
  size: number;
  anim: AnimTex | null;
  frame: number;
  tick: number;
  transparent: boolean;
}

export class Atlas {
  readonly size: number;
  readonly sprites: Record<string, SpriteRect> = {};
  readonly pixels: Uint8ClampedArray; // level 0 RGBA
  texture: WebGLTexture | null = null;
  private readonly placed: Placed[] = [];
  private readonly byName = new Map<string, Placed>();
  private gl: GL | null = null;

  constructor(textures: Map<string, TexDef>, minSize = 256) {
    // sort by size desc for packing
    const entries = [...textures.entries()].sort((a, b) => b[1].w - a[1].w);
    let cells = 0;
    for (const [, t] of entries) cells += Math.ceil(t.w / 16) * Math.ceil(t.h / 16);
    let size = minSize;
    while ((size / 16) * (size / 16) < cells * 1.15) size *= 2;
    // simple shelf packing on a 16px grid
    const grid = size / 16;
    const used = new Uint8Array(grid * grid);
    const fits = (gx: number, gy: number, n: number) => {
      if (gx + n > grid || gy + n > grid) return false;
      for (let y = gy; y < gy + n; y++) for (let x = gx; x < gx + n; x++) if (used[y * grid + x]) return false;
      return true;
    };
    this.pixels = new Uint8ClampedArray(size * size * 4);
    this.size = size;
    for (const [name, t] of entries) {
      const n = Math.max(1, Math.ceil(t.w / 16));
      let placed = false;
      for (let gy = 0; gy < grid && !placed; gy++)
        for (let gx = 0; gx < grid && !placed; gx++) {
          if (!fits(gx, gy, n)) continue;
          for (let y = gy; y < gy + n; y++) for (let x = gx; x < gx + n; x++) used[y * grid + x] = 1;
          const p: Placed = { name, x: gx * 16, y: gy * 16, size: n * 16, anim: isAnim(t) ? t : null, frame: 0, tick: 0, transparent: false };
          const first = isAnim(t) ? t.frames[0] : (t as TexImage).data;
          this.blit(p, first, t.w);
          p.transparent = hasTransparency(isAnim(t) ? t.frames : [first]);
          this.placed.push(p);
          this.byName.set(name, p);
          const inset = 0.004; // texels
          this.sprites[name] = {
            u0: (p.x + inset) / size,
            v0: (p.y + inset) / size,
            u1: (p.x + p.size - inset) / size,
            v1: (p.y + p.size - inset) / size,
          };
          placed = true;
        }
      if (!placed) throw new Error('atlas full');
    }
  }

  private blit(p: Placed, data: Uint8ClampedArray, w: number): void {
    const S = this.size;
    for (let y = 0; y < p.size; y++)
      for (let x = 0; x < p.size; x++) {
        const si = ((y % w) * w + (x % w)) * 4;
        const di = ((p.y + y) * S + (p.x + x)) * 4;
        this.pixels[di] = data[si];
        this.pixels[di + 1] = data[si + 1];
        this.pixels[di + 2] = data[si + 2];
        this.pixels[di + 3] = data[si + 3];
      }
  }

  /** Upload to GL with mip levels. */
  upload(gl: GL): WebGLTexture {
    this.gl = gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, MIP_LEVELS);
    gl.texStorage2D(gl.TEXTURE_2D, MIP_LEVELS + 1, gl.RGBA8, this.size, this.size);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(this.pixels.buffer));
    // build mip levels per sprite
    const levels: Uint8ClampedArray[] = [];
    for (let l = 1; l <= MIP_LEVELS; l++) levels.push(new Uint8ClampedArray((this.size >> l) * (this.size >> l) * 4));
    for (const p of this.placed) this.buildMips(p, levels);
    for (let l = 1; l <= MIP_LEVELS; l++) {
      const s = this.size >> l;
      gl.texSubImage2D(gl.TEXTURE_2D, l, 0, 0, s, s, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(levels[l - 1].buffer));
    }
    this.texture = t;
    return t;
  }

  private buildMips(p: Placed, levels: Uint8ClampedArray[]): void {
    let src = this.extract(p);
    let sz = p.size;
    for (let l = 1; l <= MIP_LEVELS; l++) {
      const dsz = sz >> 1;
      if (dsz < 1) break;
      const dst = downsample(src, sz, p.transparent);
      const lvl = levels[l - 1];
      const S = this.size >> l;
      const ox = p.x >> l, oy = p.y >> l;
      for (let y = 0; y < dsz; y++)
        for (let x = 0; x < dsz; x++) {
          const si = (y * dsz + x) * 4, di = ((oy + y) * S + (ox + x)) * 4;
          lvl[di] = dst[si];
          lvl[di + 1] = dst[si + 1];
          lvl[di + 2] = dst[si + 2];
          lvl[di + 3] = dst[si + 3];
        }
      src = dst;
      sz = dsz;
    }
  }

  private extract(p: Placed): Uint8ClampedArray {
    const out = new Uint8ClampedArray(p.size * p.size * 4);
    for (let y = 0; y < p.size; y++) {
      const si = ((p.y + y) * this.size + p.x) * 4;
      out.set(this.pixels.subarray(si, si + p.size * 4), y * p.size * 4);
    }
    return out;
  }

  /** Advance animations by one game tick; uploads changed frames. */
  tick(): void {
    const gl = this.gl;
    if (!gl || !this.texture) return;
    let bound = false;
    for (const p of this.placed) {
      if (!p.anim) continue;
      p.tick++;
      if (p.tick < p.anim.frameTime) continue;
      p.tick = 0;
      const order = p.anim.order;
      const count = order ? order.length : p.anim.frames.length;
      p.frame = (p.frame + 1) % count;
      const fi = order ? order[p.frame] : p.frame;
      const data = p.anim.frames[fi];
      if (!bound) {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        bound = true;
      }
      // level 0
      const frame = tileTo(data, p.anim.w, p.size);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, p.x, p.y, p.size, p.size, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(frame.buffer));
      let src = frame;
      let sz = p.size;
      for (let l = 1; l <= MIP_LEVELS; l++) {
        const dsz = sz >> 1;
        if (dsz < 1) break;
        const dst = downsample(src, sz, p.transparent);
        gl.texSubImage2D(gl.TEXTURE_2D, l, p.x >> l, p.y >> l, dsz, dsz, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(dst.buffer));
        src = dst;
        sz = dsz;
      }
    }
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }
}

function tileTo(data: Uint8ClampedArray, w: number, size: number): Uint8ClampedArray {
  if (w === size) return data;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const si = ((y % w) * w + (x % w)) * 4, di = (y * size + x) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  return out;
}

function hasTransparency(frames: Uint8ClampedArray[]): boolean {
  for (const f of frames) for (let i = 3; i < f.length; i += 4) if (f[i] === 0) return true;
  return false;
}

/** Vanilla MipmapGenerator-style 2x downsample. */
export function downsample(src: Uint8ClampedArray, sz: number, transparent: boolean): Uint8ClampedArray {
  const d = sz >> 1;
  const out = new Uint8ClampedArray(d * d * 4);
  for (let y = 0; y < d; y++)
    for (let x = 0; x < d; x++) {
      const i0 = ((y * 2) * sz + x * 2) * 4, i1 = i0 + 4, i2 = i0 + sz * 4, i3 = i2 + 4;
      const o = (y * d + x) * 4;
      if (transparent) {
        let a = 0, r = 0, g = 0, b = 0;
        for (const i of [i0, i1, i2, i3]) {
          if (src[i + 3] !== 0) {
            a += POW22[src[i + 3]];
            r += POW22[src[i]];
            g += POW22[src[i + 1]];
            b += POW22[src[i + 2]];
          }
        }
        let ai = Math.floor(Math.pow(a / 4, 1 / 2.2) * 255);
        if (ai < 96) ai = 0;
        out[o] = Math.floor(Math.pow(r / 4, 1 / 2.2) * 255);
        out[o + 1] = Math.floor(Math.pow(g / 4, 1 / 2.2) * 255);
        out[o + 2] = Math.floor(Math.pow(b / 4, 1 / 2.2) * 255);
        out[o + 3] = ai;
      } else {
        for (let c = 0; c < 4; c++) {
          const s = POW22[src[i0 + c]] + POW22[src[i1 + c]] + POW22[src[i2 + c]] + POW22[src[i3 + c]];
          out[o + c] = Math.floor(Math.pow(s * 0.25, 1 / 2.2) * 255);
        }
      }
    }
  return out;
}
