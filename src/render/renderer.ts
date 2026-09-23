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
import { EntityBatch, PoseStack } from './entityRenderer';
import { ItemRenderer } from './itemRenderer';
import { HandRenderer } from './handRenderer';
import type { Level } from '../game/level';
import type { TexImage } from '../textures/tex';
import { ParticleEngine } from './particles';
import { WeatherRenderer } from './weather';
import { EntityRenderDispatcher, EntityRenderOptions } from './entityRenderers';
import { buildParticleAtlas } from './particleAtlas';
import type { BlindnessFog } from './effectVisuals';

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
  /** blindness fog (effectVisuals.blindnessFog) */
  blindness?: BlindnessFog | null;
  /** extra (e.g. view bobbing) applied to view matrix */
  bob?: Mat4 | null;
  underwater?: boolean;
  waterFogColor?: [number, number, number];
  level?: Level;
  entityOptions?: EntityRenderOptions;
}

export class Renderer {
  readonly lightmap: Lightmap;
  readonly sky: SkyRenderer;
  readonly world: WorldRenderer;
  readonly clouds: CloudRenderer;
  readonly batch: EntityBatch;
  readonly items: ItemRenderer;
  readonly hand: HandRenderer;
  readonly weather: WeatherRenderer;
  readonly entities: EntityRenderDispatcher;
  private particleAtlas: ReturnType<typeof buildParticleAtlas> | null = null;
  particles: ParticleEngine | null = null;
  fancy = true;
  private readonly pose = new PoseStack();
  lastFogStart = 0;
  lastFogEnd = 0;
  readonly proj = mat4();
  readonly view = mat4();
  readonly viewRot = mat4();
  readonly viewProj = mat4();
  readonly frustum = new Frustum();
  renderDistance = 12;
  cloudsEnabled = true;
  skipClouds = false;
  width = 1;
  height = 1;
  lastFog: [number, number, number] = [0, 0, 0];

  constructor(readonly gl: GL, readonly atlas: Atlas, itemTextures: Record<string, () => TexImage> | null, blockImages: Map<string, TexImage>) {
    this.lightmap = new Lightmap(gl);
    this.sky = new SkyRenderer(gl);
    this.world = new WorldRenderer(gl);
    this.clouds = new CloudRenderer(gl);
    this.batch = new EntityBatch(gl);
    this.items = new ItemRenderer(gl, atlas, itemTextures, blockImages);
    this.hand = new HandRenderer(gl, this.items);
    this.weather = new WeatherRenderer(gl);
    this.entities = new EntityRenderDispatcher(gl, this.items, this.hand.skinTexture);
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
    // vanilla FogRenderer: blindness darkens the fog colour and pulls the fog in to a few blocks
    const blind = e.blindness;
    if (blind) {
      if (blind.darkness < 1) {
        const d = Math.max(0, blind.darkness) ** 2;
        fog = [fog[0] * d, fog[1] * d, fog[2] * d];
      }
      fogStart = blind.end * 0.25;
      fogEnd = blind.end;
    }
    // vanilla FogRenderer.setupColor: night vision brightens the fog (underwater, water vision does)
    const nv = e.underwater ? 0 : e.nightVision;
    if (nv > 0 && fog[0] !== 0 && fog[1] !== 0 && fog[2] !== 0) {
      const k = Math.min(1 / fog[0], 1 / fog[1], 1 / fog[2]);
      fog = [fog[0] * (1 - nv) + fog[0] * k * nv, fog[1] * (1 - nv) + fog[1] * k * nv, fog[2] * (1 - nv) + fog[2] * k * nv];
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
    // vanilla LevelRenderer.renderSky: no sky while blind (doesMobEffectBlockSky)
    if (!e.underwater && !blind) {
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
    this.lastFogStart = fogStart;
    this.lastFogEnd = fogEnd;
    this.world.cull(tp, rdBlocks);
    this.world.drawOpaque(tp);
    if (e.level) this.renderEntities(e.level, cam, e.partial, fog, fogStart, fogEnd, e.entityOptions);
    this.world.drawTranslucent(tp);
    if (this.particles) {
      this.batch.proj = this.proj;
      this.batch.view = this.view;
      this.batch.fog = [fogStart, fogEnd];
      this.batch.fogColor = fog;
      this.batch.lightmap = this.lightmap.texture;
      this.particles.render(this.batch, cam, e.partial, this.atlas.texture!);
      if (!this.particleAtlas) {
        this.particleAtlas = buildParticleAtlas(this.gl);
      }
      this.particles.spriteTexture = this.particleAtlas.texture;
      this.particles.spriteRects = this.particleAtlas.rects;
      this.particles.renderSprites(this.batch, cam, e.partial);
    }
    if (this.cloudsEnabled && !e.underwater && !this.skipClouds && !blind) {
      const cc = env.cloudColor(tod, e.weather);
      this.clouds.render(this.proj, this.view, cam.x, cam.y, cam.z, e.ticks + e.partial, cc, fog, rdBlocks);
    }
    if (e.level && e.weather.rain > 0) {
      this.batch.proj = this.proj;
      this.batch.view = this.view;
      this.batch.fog = [fogStart, fogEnd];
      this.batch.fogColor = fog;
      this.batch.lightmap = this.lightmap.texture;
      const gl2 = this.gl;
      gl2.depthMask(false);
      this.weather.render(this.batch, e.level.world, cam, e.weather.rain, e.ticks, e.partial, this.fancy);
      gl2.depthMask(true);
    }
  }

  private renderEntities(level: Level, cam: Camera, partial: number, fog: [number, number, number], fogStart: number, fogEnd: number, opts?: EntityRenderOptions): void {
    const b = this.batch;
    b.proj = this.proj;
    b.view = this.view;
    b.lightmap = this.lightmap.texture;
    b.fogColor = fog;
    b.fog = [fogStart, fogEnd];
    b.light0 = [0.2, 1.0, -0.7];
    b.light1 = [-0.2, 1.0, 0.7];
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.entities.render(b, level, cam, partial, this.frustum, opts ?? { shadows: true, drawPlayer: false, distanceScale: 1 });
  }
}
