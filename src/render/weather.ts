// Rain and snow (vanilla LevelRenderer.renderSnowAndRain).

import { createTexture, GL } from './gl';
import { EntityBatch } from './entityRenderer';
import { rainTexture, snowTexture } from '../textures/env';
import type { World } from '../world/world';
import type { Camera } from './renderer';
import { BIOMES } from '../world/gen/biomes';

export class WeatherRenderer {
  private readonly rainTex: WebGLTexture;
  private readonly snowTex: WebGLTexture;
  private readonly rainSizeX = new Float32Array(1024);
  private readonly rainSizeZ = new Float32Array(1024);
  /** height-adjusted temperature function (from the generator's decorator) */
  tempAt: ((biome: number, x: number, y: number, z: number) => number) | null = null;

  constructor(gl: GL) {
    const r = rainTexture();
    this.rainTex = createTexture(gl, r.w, r.h, new Uint8Array(r.data.buffer), { clamp: false });
    const s = snowTexture();
    this.snowTex = createTexture(gl, s.w, s.h, new Uint8Array(s.data.buffer), { clamp: false });
    for (let i = 0; i < 32; i++)
      for (let j = 0; j < 32; j++) {
        const f = j - 16, f1 = i - 16;
        const f2 = Math.sqrt(f * f + f1 * f1);
        this.rainSizeX[(i << 5) | j] = -f1 / f2;
        this.rainSizeZ[(i << 5) | j] = f / f2;
      }
  }

  render(batch: EntityBatch, world: World, cam: Camera, rain: number, ticks: number, partial: number, fancy: boolean): void {
    if (rain <= 0) return;
    const cx = Math.floor(cam.x), cy = Math.floor(cam.y), cz = Math.floor(cam.z);
    const radius = fancy ? 10 : 5;
    const camY = cam.y;
    const f1 = ticks + partial;
    const rnd = (seed: number) => {
      let s = seed | 0;
      return () => {
        s = (Math.imul(s, 1103515245) + 12345) | 0;
        return ((s >>> 8) & 0xffff) / 65536;
      };
    };
    for (const mode of ['rain', 'snow'] as const) {
      let any = false;
      for (let z = cz - radius; z <= cz + radius; z++)
        for (let x = cx - radius; x <= cx + radius; x++) {
          const idx = ((z - cz + 16) << 5) | (x - cx + 16);
          const sx = this.rainSizeX[idx] * 0.5, sz = this.rainSizeZ[idx] * 0.5;
          const biome = world.getBiome(x, z);
          const b = BIOMES[biome];
          if (!b || !b.precipitation) continue;
          const h = world.heightAt(x, z);
          let y0 = cy - radius, y1 = cy + radius;
          if (y0 < h) y0 = h;
          if (y1 < h) y1 = h;
          let yr = h;
          if (yr < cy) yr = cy;
          if (y0 === y1) continue;
          const temp = this.tempAt ? this.tempAt(biome, x, y0, z) : b.temperature;
          const isSnow = temp < 0.15;
          if ((mode === 'snow') !== isSnow) continue;
          if (!any) {
            batch.begin({ texture: mode === 'rain' ? this.rainTex : this.snowTex, cutoff: 0.01, blend: true, cull: false, lit: false, useLightmap: true });
            any = true;
          }
          const r = rnd(x * x * 3121 + x * 45238971 ^ z * z * 418711 + z * 13761);
          const dx = x + 0.5 - cam.x, dz = z + 0.5 - cam.z;
          const dist = Math.sqrt(dx * dx + dz * dz) / radius;
          const l = world.getLight(x, yr, z);
          batch.lightS = (l >> 4) * 16;
          batch.lightB = (l & 15) * 16;
          let v0: number, v1: number, u0 = 0, u1 = 1, alpha: number;
          if (mode === 'rain') {
            const i1 = (ticks + x * x * 3121 + x * 45238971 + z * z * 418711 + z * 13761) & 31;
            const f2 = -((i1 + partial) / 32) * (3 + r());
            alpha = ((1 - dist * dist) * 0.5 + 0.5) * rain;
            v0 = y0 * 0.25 + f2;
            v1 = y1 * 0.25 + f2;
          } else {
            const f5 = -((ticks & 511) + partial) / 512;
            const f6 = r() + f1 * 0.01 * (r() - 0.5);
            const f7 = r() + f1 * r() * 0.001;
            alpha = ((1 - dist * dist) * 0.3 + 0.5) * rain;
            v0 = y0 * 0.25 + f5 + f7;
            v1 = y1 * 0.25 + f5 + f7;
            u0 = f6;
            u1 = 1 + f6;
            // snow uses brighter light (vanilla bumps packed light)
            batch.lightS = Math.min(240, batch.lightS * 3 / 4 + 60);
          }
          const X = x + 0.5 - cam.x, Z = z + 0.5 - cam.z;
          const Y0 = y0 - camY, Y1 = y1 - camY;
          const q = [
            [X - sx, Y1, Z - sz, u0, v0],
            [X + sx, Y1, Z + sz, u1, v0],
            [X + sx, Y0, Z + sz, u1, v1],
            [X - sx, Y0, Z - sz, u0, v1],
          ];
          for (const k of [0, 1, 2, 0, 2, 3]) batch.vertexRaw(q[k][0], q[k][1], q[k][2], q[k][3], q[k][4], 1, 1, 1, alpha, 0, 1, 0);
        }
      if (any) batch.flush();
    }
  }
}
