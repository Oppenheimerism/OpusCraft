// Vanilla-style lightmap: a 16x16 texture indexed by (block light, sky light).

import type { GL } from './gl';

/** vanilla LightTexture.getBrightness: the curve lifted by the dimension's ambient light */
function brightness(level: number, ambient: number): number {
  const f = level / 15;
  const b = f / (4 - 3 * f);
  return b + (1 - b) * ambient;
}

function notGamma(v: number): number {
  const f = 1 - v;
  return 1 - f * f * f * f;
}

export class Lightmap {
  readonly texture: WebGLTexture;
  private readonly data = new Uint8Array(16 * 16 * 4);
  private flicker = 0;

  constructor(private readonly gl: GL) {
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  tick(): void {
    this.flicker += (Math.random() - Math.random()) * Math.random() * Math.random() * 0.1;
    this.flicker *= 0.9;
  }

  /**
   * @param skyDarken vanilla level.getSkyDarken (0.2..1)
   * @param flash lightning flash active
   * @param gamma brightness option (0 moody .. 1 bright), default 0.5
   * @param nightVision 0..1
   * @param ambient the dimension's ambient light (0.1 in the Nether)
   * @param forceBright vanilla forceBrightLightmap (the End): sky light plays no part, and the block light's
   * colour is lifted a quarter of the way toward (0.99, 1.12, 1.0)
   */
  update(skyDarken: number, flash: boolean, gamma: number, nightVision: number, ambient = 0, forceBright = false): void {
    const f1 = flash ? 1 : skyDarken * 0.95 + 0.05;
    // skyVec = (f, f, 1) lerp (1,1,1) 0.35
    const sv0 = skyDarken + (1 - skyDarken) * 0.35;
    const sv2 = 1;
    const flick = this.flicker + 1.5;
    const d = this.data;
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        const skyB = brightness(i, ambient) * f1;
        const br = brightness(j, ambient) * flick;
        const bg = br * ((br * 0.6 + 0.4) * 0.6 + 0.4);
        const bb = br * (br * br * 0.6 + 0.4);
        let r: number, g: number, b: number;
        if (forceBright) {
          r = Math.min(1, Math.max(0, br + (0.99 - br) * 0.25));
          g = Math.min(1, Math.max(0, bg + (1.12 - bg) * 0.25));
          b = Math.min(1, Math.max(0, bb + (1.0 - bb) * 0.25));
        } else {
          r = br + sv0 * skyB;
          g = bg + sv0 * skyB;
          b = bb + sv2 * skyB;
          r += (0.75 - r) * 0.04;
          g += (0.75 - g) * 0.04;
          b += (0.75 - b) * 0.04;
        }
        if (nightVision > 0) {
          const m = Math.max(r, g, b);
          if (m < 1) {
            const k = 1 / m;
            r += (r * k - r) * nightVision;
            g += (g * k - g) * nightVision;
            b += (b * k - b) * nightVision;
          }
        }
        r = Math.min(1, Math.max(0, r));
        g = Math.min(1, Math.max(0, g));
        b = Math.min(1, Math.max(0, b));
        const gm = Math.max(0, gamma);
        r += (notGamma(r) - r) * gm;
        g += (notGamma(g) - g) * gm;
        b += (notGamma(b) - b) * gm;
        r += (0.75 - r) * 0.04;
        g += (0.75 - g) * 0.04;
        b += (0.75 - b) * 0.04;
        const o = (i * 16 + j) * 4;
        d[o] = Math.min(255, Math.max(0, r * 255));
        d[o + 1] = Math.min(255, Math.max(0, g * 255));
        d[o + 2] = Math.min(255, Math.max(0, b * 255));
        d[o + 3] = 255;
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, d);
  }

  /** CPU sample (for entity/hand lighting): returns [r,g,b] 0..1 for light levels */
  sample(block: number, sky: number): [number, number, number] {
    const u = Math.min(15.5 / 16, Math.max(0.5 / 16, (block * 16) / 256)) * 16 - 0.5;
    const v = Math.min(15.5 / 16, Math.max(0.5 / 16, (sky * 16) / 256)) * 16 - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    const at = (x: number, y: number, c: number) => this.data[((Math.min(15, y)) * 16 + Math.min(15, x)) * 4 + c] / 255;
    const out: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const a = at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx;
      const b = at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx;
      out[c] = a * (1 - fy) + b * fy;
    }
    return out;
  }
}
