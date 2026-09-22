// Frame orchestration: camera matrices, sky, terrain, (entities), clouds.

import { GL } from './gl';
import { Atlas } from './atlas';
import { Lightmap } from './lightmap';
import { SkyRenderer } from './sky';
import { WorldRenderer } from './worldRenderer';
import { CloudRenderer } from './clouds';
import { mat4, perspective, rotateX, rotateY, Frustum, multiply, DEG, Mat4 } from '../core/math';
import * as env from './environment';
import { BIOMES } from '../world/gen/biomes';

export interface Camera {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  fov: number;
}

export interface FrameEnv {
  dayTime: number;
  ticks: number;
  partial: number;
  weather: env.Weather;
  biome: number;
  gamma: number;
  nightVision: number;
  /** extra (e.g. view bobbing) applied to view matrix */
  bob?: Mat4 | null;
  underwater?: boolean;
  waterFogColor?: [number, number, number];
}

export class Renderer {
  readonly lightmap: Lightmap;
  readonly sky: SkyRenderer;
  readonly world: WorldRenderer;
  readonly clouds: CloudRenderer;
  readonly proj = mat4();
  readonly view = mat4();
  readonly viewRot = mat4();
  readonly viewProj = mat4();
  readonly frustum = new Frustum();
  renderDistance = 12;
  cloudsEnabled = true;
  width = 1;
  height = 1;
  lastFog: [number, number, number] = [0, 0, 0];

  constructor(readonly gl: GL, readonly atlas: Atlas) {
    this.lightmap = new Lightmap(gl);
    this.sky = new SkyRenderer(gl);
    this.world = new WorldRenderer(gl);
    this.clouds = new CloudRenderer(gl);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  setupCamera(cam: Camera, bob: Mat4 | null): void {
    const far = Math.max(this.renderDistance * 16 * 4, 256);
    perspective(this.proj, cam.fov * DEG, this.width / this.height, 0.05, far);
    const v = this.viewRot;
    v.fill(0);
    v[0] = v[5] = v[10] = v[15] = 1;
    if (bob) v.set(bob);
    rotateX(v, v, cam.pitch * DEG);
    rotateY(v, v, (cam.yaw + 180) * DEG);
    this.view.set(v);
    multiply(this.viewProj, this.proj, this.view);
    this.frustum.setFromMatrix(this.viewProj);
  }

  render(cam: Camera, e: FrameEnv): void {
    const gl = this.gl;
    const tod = env.timeOfDay(e.dayTime + e.partial);
    const biome = BIOMES[e.biome] ?? BIOMES[1];
    this.setupCamera(cam, e.bob ?? null);
    // look vector
    const pr = cam.pitch * DEG, yr = cam.yaw * DEG;
    const lx = -Math.sin(yr) * Math.cos(pr), ly = -Math.sin(pr), lz = Math.cos(yr) * Math.cos(pr);
    const rdBlocks = this.renderDistance * 16;
    const sky = env.skyColor(biome.sky, tod, e.weather, e.partial);
    let fog = env.fogColor(biome.fog, biome.sky, tod, e.weather, this.renderDistance, lx, ly, lz, cam.y);
    let fogStart = rdBlocks - Math.min(Math.max(rdBlocks / 10, 4), 64);
    let fogEnd = rdBlocks;
    if (e.underwater) {
      fog = e.waterFogColor ?? [0.02, 0.02, 0.2];
      fogStart = -8;
      fogEnd = 96;
    }
    this.lastFog = fog;
    // lightmap
    this.lightmap.update(env.skyDarken(tod, e.weather), e.weather.flash > 0, e.gamma, e.nightVision);
    // clear to fog color
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!e.underwater) {
      this.sky.render({
        proj: this.proj,
        viewRot: this.viewRot,
        skyColor: sky,
        fogColor: fog,
        renderDistanceBlocks: rdBlocks,
        sunrise: env.sunriseColor(tod),
        timeOfDay: tod,
        rain: e.weather.rain,
        starBrightness: env.starBrightness(tod),
        moonPhase: env.moonPhase(e.dayTime),
        horizonDelta: cam.y - 63,
      });
    }
    const tp = {
      proj: this.proj,
      view: this.view,
      camX: cam.x,
      camY: cam.y,
      camZ: cam.z,
      fogColor: fog,
      fogStart,
      fogEnd,
      atlas: this.atlas.texture!,
      lightmap: this.lightmap.texture,
      frustum: this.frustum,
    };
    this.world.cull(tp, rdBlocks);
    this.world.drawOpaque(tp);
    this.world.drawTranslucent(tp);
    if (this.cloudsEnabled && !e.underwater) {
      const cc = env.cloudColor(tod, e.weather);
      this.clouds.render(this.proj, this.view, cam.x, cam.y, cam.z, e.ticks + e.partial, cc, fog, rdBlocks);
    }
  }
}
