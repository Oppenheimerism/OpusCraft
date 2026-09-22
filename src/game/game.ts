// Game shell: owns renderer, world, level, player; runs the 20 TPS tick loop
// and per-frame rendering like vanilla's Minecraft.runTick / GameRenderer.

import '../world/blocks';
import { generateBlockTextures } from '../textures/index';
import { Atlas } from '../render/atlas';
import { Renderer, Camera } from '../render/renderer';
import { World } from '../world/world';
import { WorkerPool } from '../worker/pool';
import { ChunkManager } from '../world/chunkManager';
import { Level } from './level';
import { Player, GameMode } from '../entity/player';
import { Input, KEYS } from './input';
import { Interaction } from './interaction';
import { mat4, translate, rotateX, rotateZ, rotateY, DEG, clamp } from '../core/math';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_LAVA, F_OPAQUE, F_COLLIDE } from '../world/block';
import { FLUID_WATER, FLUID_LAVA } from '../world/fluids';
import { BIOMES } from '../world/gen/biomes';
import { ItemStack } from '../item/item';
import { MIN_Y } from '../world/constants';
import { Overlay } from '../render/overlay';
import { isAnim, TexImage } from '../textures/tex';
import { ParticleEngine } from '../render/particles';

export interface GameOptions {
  seed: string;
  renderDistance: number;
  fov: number;
  sensitivity: number;
  gamma: number;
  bobView: boolean;
  smoothLighting: boolean;
  fancy: boolean;
  guiScale: number; // 0 = auto
}

export const DEFAULT_OPTIONS: GameOptions = {
  seed: 'test',
  renderDistance: 12,
  fov: 70,
  sensitivity: 0.5,
  gamma: 0.5,
  bobView: true,
  smoothLighting: true,
  fancy: true,
  guiScale: 0,
};

export class Game {
  gl!: WebGL2RenderingContext;
  atlas!: Atlas;
  renderer!: Renderer;
  pool!: WorkerPool;
  world!: World;
  chunks!: ChunkManager;
  level!: Level;
  player!: Player;
  input: Input;
  interaction!: Interaction;
  overlay!: Overlay;
  opts: GameOptions;
  ticks = 0;
  private acc = 0;
  private last = 0;
  fps = 0;
  private frames = 0;
  private fpsTime = 0;
  fovMod = 1;
  fovModO = 1;
  showDebug = false;
  hideGui = false;
  thirdPerson = 0;
  spawned = false;
  paused = false;
  freezeTime = false;
  frameTimeMs = 0;
  private spawnSearch: { cx: number; cz: number } | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly ui: HTMLCanvasElement, opts: Partial<GameOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.input = new Input(canvas);
  }

  async init(): Promise<void> {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not supported by this browser');
    this.gl = gl;
    const { textures, missing } = generateBlockTextures();
    if (missing.length) console.warn('missing textures', missing);
    this.atlas = new Atlas(textures);
    this.atlas.upload(gl);
    const blockImages = new Map<string, TexImage>();
    for (const [n, t] of textures) blockImages.set(n, isAnim(t) ? { w: t.w, h: t.h, data: t.frames[0] } : t);
    const itemMods = import.meta.glob('../textures/items.ts', { eager: true }) as Record<string, { ITEM_TEXTURES?: Record<string, () => TexImage> }>;
    const itemTextures = Object.values(itemMods)[0]?.ITEM_TEXTURES ?? null;
    this.renderer = new Renderer(gl, this.atlas, itemTextures, blockImages);
    this.overlay = new Overlay(gl, this.atlas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ui.width = this.canvas.width;
    this.ui.height = this.canvas.height;
    this.renderer?.resize(this.canvas.width, this.canvas.height);
  }

  async startWorld(seed: string, mode: GameMode): Promise<void> {
    this.opts.seed = seed;
    const workers = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
    this.pool = new WorkerPool(workers, seed, this.atlas.sprites);
    await this.pool.ready;
    this.world = new World();
    this.chunks = new ChunkManager(this.world, this.pool, this.renderer.world);
    this.chunks.renderDistance = this.opts.renderDistance;
    this.chunks.smoothLighting = this.opts.smoothLighting;
    this.chunks.fancyLeaves = this.opts.fancy;
    this.renderer.renderDistance = this.opts.renderDistance;
    this.level = new Level(this.world, seed);
    this.level.dayTime = 0;
    this.player = new Player(this.level);
    this.player.setGameMode(mode);
    this.level.player = this.player;
    this.level.addEntity(this.player);
    this.interaction = new Interaction(this.level, this.player);
    const world = this.world;
    const particles = new ParticleEngine(this.atlas, world, (x, _y, z, st) => {
      const c = world.getChunk(x >> 4, z >> 4);
      if (!c) return 0xffffff;
      world.ensureTints(c);
      const b = BLOCKS[STATE_BLOCK[st]];
      const i = ((z & 15) << 4) | (x & 15);
      if (b.tint === 'grass') return c.grassTint![i];
      if (b.tint === 'foliage') return c.foliageTint![i];
      if (b.tint === 'water') return c.waterTint![i];
      if (b.tint === 'birch') return 0x80a755;
      if (b.tint === 'spruce') return 0x619961;
      return 0xffffff;
    });
    this.renderer.particles = particles;
    this.level.particles = { blockBreak: (x, y, z, s) => particles.blockBreak(x, y, z, s), blockHit: (x, y, z, s, f) => particles.blockHit(x, y, z, s, f) };
    this.renderer.weather.tempAt = (biome, x, y, z) => {
      const b = BIOMES[biome];
      if (y > 80) return b.temperature - ((Math.sin(x * 0.13 + z * 0.07) * 4 + y - 80) * 0.05) / 40;
      return b.temperature;
    };
    this.player.moveTo(0.5, 120, 0.5, 0, 0);
    this.spawned = false;
    this.spawnSearch = { cx: 0, cz: 0 };
    this.chunks.setCenter(0, 0);
  }

  /** Teleport and mark spawned (used by URL params / commands). */
  teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
    this.player.moveTo(x, y, z, yaw ?? this.player.yaw, pitch ?? this.player.pitch);
    this.player.dx = this.player.dy = this.player.dz = 0;
    this.player.fallDistance = 0;
  }

  private findSpawn(): boolean {
    // search loaded chunks near origin for a dry grass/sand surface (vanilla PlayerSpawnFinder-ish)
    const w = this.world;
    const R = 3;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) if (!w.getChunk(dx, dz)) return false;
    let best: [number, number, number] | null = null;
    let bestD = Infinity;
    for (let z = -R * 16; z < R * 16; z++)
      for (let x = -R * 16; x < R * 16; x++) {
        const d = x * x + z * z;
        if (d >= bestD) continue;
        const h = w.heightAt(x, z);
        const top = w.getState(x, h - 1, z);
        const name = BLOCKS[STATE_BLOCK[top]].name;
        if (name !== 'grass_block' && name !== 'sand' && name !== 'snow' && name !== 'podzol' && name !== 'snow_block') continue;
        if (FLAGS[w.getState(x, h, z)] & (F_WATER | F_LAVA)) continue;
        best = [x, h, z];
        bestD = d;
      }
    if (!best) best = [0, w.heightAt(0, 0), 0];
    this.player.moveTo(best[0] + 0.5, best[1], best[2] + 0.5, 0, 0);
    this.player.spawnX = best[0];
    this.player.spawnY = best[1];
    this.player.spawnZ = best[2];
    return true;
  }

  // -------------------------------------------------------------------------

  run(): void {
    this.last = performance.now();
    let lastFrame = performance.now();
    const frame = (now: number) => {
      lastFrame = performance.now();
      this.frame(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    // rAF stops when the page is hidden; keep the simulation running with a timer
    setInterval(() => {
      const now = performance.now();
      if (now - lastFrame > 250) {
        lastFrame = now;
        this.frame(now);
      }
    }, 50);
  }

  private frame(now: number): void {
    const t0 = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.acc += dt;
    this.handleFrameInput();
    let n = 0;
    while (this.acc >= 0.05 && n < 10) {
      this.acc -= 0.05;
      this.tick();
      n++;
    }
    if (n >= 10) this.acc = 0;
    const partial = this.paused ? 1 : this.acc / 0.05;
    this.chunks.setCenter(this.player.x, this.player.z);
    this.chunks.update();
    this.render(partial);
    this.frames++;
    if (now - this.fpsTime > 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.fpsTime = now;
    }
    this.frameTimeMs = performance.now() - t0;
  }

  private handleFrameInput(): void {
    const inp = this.input;
    // mouse look (vanilla MouseHandler.turnPlayer)
    const [mx, my] = inp.consumeMouse();
    if (this.spawned && inp.locked && !this.paused) {
      const s = this.opts.sensitivity * 0.6 + 0.2;
      const k = s * s * s * 8;
      this.player.yaw += mx * k * 0.15;
      this.player.pitch = clamp(this.player.pitch + my * k * 0.15, -90, 90);
    }
    // pick target every frame
    if (this.spawned) {
      const p = this.player;
      const eye = p.y + p.eyeHeight;
      this.interaction.pick(p.x, eye, p.z, p.yaw, p.pitch);
    }
  }

  private tick(): void {
    this.ticks++;
    if (!this.spawned) {
      if (this.spawnSearch && this.findSpawn()) {
        this.spawnSearch = null;
        this.spawned = true;
      } else return;
    }
    const inp = this.input;
    const p = this.player;
    // key presses
    for (const code of inp.pressed()) {
      if (code === KEYS.debug) this.showDebug = !this.showDebug;
      else if (code === KEYS.hideGui) this.hideGui = !this.hideGui;
      else if (code === KEYS.togglePerspective) this.thirdPerson = (this.thirdPerson + 1) % 3;
      else if (code === KEYS.drop) this.interaction.drop(inp.isDown('ControlLeft') || inp.isDown('MetaLeft'));
      else if (code.startsWith('Digit')) {
        const d = +code.slice(5);
        if (d >= 1 && d <= 9) {
          p.inventory.selected = d - 1;
          p.inventory.version++;
        }
      }
    }
    const wheel = inp.consumeWheel();
    if (wheel !== 0 && inp.locked) {
      p.inventory.selected = (((p.inventory.selected + wheel) % 9) + 9) % 9;
      p.inventory.version++;
    }
    // movement input
    const locked = inp.locked;
    p.input.forward = locked && inp.isDown(KEYS.forward);
    p.input.back = locked && inp.isDown(KEYS.back);
    p.input.left = locked && inp.isDown(KEYS.left);
    p.input.right = locked && inp.isDown(KEYS.right);
    p.input.jump = locked && inp.isDown(KEYS.jump);
    p.input.sneak = locked && (inp.isDown(KEYS.sneak) || inp.isDown('ShiftRight'));
    p.input.sprint = locked && (inp.isDown(KEYS.sprint) || inp.isDown('ControlRight'));
    // mouse buttons
    const clicks = inp.consumeClicks();
    if (locked) {
      if (clicks.includes(0)) this.interaction.startAttack();
      this.interaction.continueAttack(inp.buttons[0]);
      this.interaction.use(clicks.includes(2), inp.buttons[2]);
      if (clicks.includes(1)) this.interaction.pickBlock();
    } else {
      this.interaction.continueAttack(false);
    }
    // fov modifier (vanilla GameRenderer.tickFov)
    this.fovModO = this.fovMod;
    const target = clamp(p.fovModifier(), 0.1, 1.5);
    this.fovMod += (target - this.fovMod) * 0.5;
    this.level.tick();
    if (this.freezeTime) this.level.dayTime--;
    // void
    if (p.y < MIN_Y - 64) p.hurt(4, 'void');
    this.atlas.tick();
    this.renderer.lightmap.tick();
    this.renderer.hand.tick(p);
    this.renderer.particles?.tick();
  }

  // -------------------------------------------------------------------------

  private render(partial: number): void {
    const p = this.player;
    if (!this.spawned) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.overlay.renderLoading(this.ui, this.chunks.pendingGen(), this.world.chunks.size);
      return;
    }
    const ex = p.lerpX(partial), ez = p.lerpZ(partial);
    const eyeH = p.eyeHeightCamO + (p.eyeHeightCam - p.eyeHeightCamO) * partial;
    const ey = p.lerpY(partial) + eyeH;
    // view bobbing + hurt tilt (vanilla bobHurt / bobView)
    const bob = mat4();
    this.bobHurt(bob, partial);
    if (this.opts.bobView && this.thirdPerson === 0) this.bobView(bob, partial);
    let fov = this.opts.fov * (this.fovModO + (this.fovMod - this.fovModO) * partial);
    const eyeFluid = this.cameraFluid(ex, ey, ez);
    if (eyeFluid === FLUID_WATER) fov *= 0.85714287;
    if (p.health <= 0) {
      const f = Math.min(p.deathTime + partial, 20);
      fov /= (1 - 500 / (f + 500)) * 2 + 1;
    }
    let cx = ex, cy = ey, cz = ez;
    let yaw = p.yaw, pitch = p.pitch;
    if (this.thirdPerson > 0) {
      // camera pulled back 4 blocks (front view flips)
      if (this.thirdPerson === 2) {
        yaw += 180;
        pitch = -pitch;
      }
      const [lx, ly, lz] = lookVec(yaw, pitch);
      const dist = this.cameraDistance(ex, ey, ez, -lx, -ly, -lz, 4);
      cx = ex - lx * dist;
      cy = ey - ly * dist;
      cz = ez - lz * dist;
    }
    const cam: Camera = { x: cx, y: cy, z: cz, yaw, pitch, fov };
    const biome = this.world.getBiome(Math.floor(cx), Math.floor(cz));
    const b = BIOMES[biome];
    this.renderer.render(cam, {
      dayTime: this.level.dayTime,
      ticks: this.ticks,
      partial,
      weather: { rain: this.level.rainLevel(partial), thunder: this.level.thunderLevel(partial), flash: this.level.skyFlash },
      biome,
      gamma: this.opts.gamma,
      nightVision: 0,
      bob,
      underwater: eyeFluid === FLUID_WATER,
      waterFogColor: [((b.waterFog >> 16) & 255) / 255, ((b.waterFog >> 8) & 255) / 255, (b.waterFog & 255) / 255],
      level: this.level,
    });
    // world overlays: selection box and crack
    const hit = this.interaction.hit;
    if (hit && !this.hideGui && p.gameMode !== 'spectator') {
      this.overlay.renderSelection(this.renderer, cam, hit.x, hit.y, hit.z, hit.state);
      const stage = this.interaction.destroyStage;
      if (stage >= 0) this.overlay.renderCrack(this.renderer, cam, hit.x, hit.y, hit.z, hit.state, stage);
    }
    // first-person hand
    if (this.thirdPerson === 0 && !this.hideGui && p.gameMode !== 'spectator') {
      const gl = this.gl;
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const handBob = mat4();
      this.bobHurt(handBob, partial);
      if (this.opts.bobView) this.bobView(handBob, partial);
      const l = this.world.getLight(Math.floor(ex), Math.floor(ey), Math.floor(ez));
      let hf = 1;
      if (eyeFluid === FLUID_WATER) hf *= 0.85714287;
      this.renderer.hand.render(this.renderer.batch, p, partial, this.canvas.width, this.canvas.height, hf, handBob, (l & 15) * 16, (l >> 4) * 16, this.renderer.viewRot);
    }
    this.overlay.renderHud(this, partial);
  }

  private cameraFluid(x: number, y: number, z: number): number {
    const st = this.world.getState(Math.floor(x), Math.floor(y), Math.floor(z));
    if (FLAGS[st] & F_WATER) {
      const h = Math.floor(y) + fluidSurface(this.world, Math.floor(x), Math.floor(y), Math.floor(z));
      if (y < h) return FLUID_WATER;
    }
    if (FLAGS[st] & F_LAVA) return FLUID_LAVA;
    return 0;
  }

  private cameraDistance(x: number, y: number, z: number, dx: number, dy: number, dz: number, max: number): number {
    // vanilla Camera.getMaxZoom: test 8 corner rays
    let d = max;
    for (let i = 0; i < 8; i++) {
      const ox = ((i & 1) * 2 - 1) * 0.1, oy = (((i >> 1) & 1) * 2 - 1) * 0.1, oz = (((i >> 2) & 1) * 2 - 1) * 0.1;
      const sx = x + ox, sy = y + oy, sz = z + oz;
      for (let t = 0; t < d; t += 0.05) {
        const st = this.world.getState(Math.floor(sx + dx * t), Math.floor(sy + dy * t), Math.floor(sz + dz * t));
        if (FLAGS[st] & (F_OPAQUE | F_COLLIDE)) {
          d = Math.max(0, t - 0.05);
          break;
        }
      }
    }
    return d;
  }

  private bobView(m: Float32Array, partial: number): void {
    const p = this.player;
    const f = p.walkDist - p.walkDistO;
    const f1 = -(p.walkDist + f * partial);
    const f2 = p.bobO + (p.bob - p.bobO) * partial;
    translate(m, m, Math.sin(f1 * Math.PI) * f2 * 0.5, -Math.abs(Math.cos(f1 * Math.PI) * f2), 0);
    rotateZ(m, m, Math.sin(f1 * Math.PI) * f2 * 3 * DEG);
    rotateX(m, m, Math.abs(Math.cos(f1 * Math.PI - 0.2) * f2) * 5 * DEG);
  }

  private bobHurt(m: Float32Array, partial: number): void {
    const p = this.player;
    let f = p.hurtTime - partial;
    if (p.health <= 0) {
      const f1 = Math.min(p.deathTime + partial, 20);
      rotateZ(m, m, (40 - 8000 / (f1 + 200)) * DEG);
    }
    if (f < 0) return;
    f /= p.hurtDuration;
    f = Math.sin(f * f * f * f * Math.PI);
    const hurtDir = 0;
    rotateY(m, m, -hurtDir * DEG);
    rotateZ(m, m, -f * 14 * DEG);
    rotateY(m, m, hurtDir * DEG);
  }

  giveStarterItems(): void {
    const inv = this.player.inventory;
    const ids = ['grass_block', 'dirt', 'stone', 'cobblestone', 'oak_planks', 'oak_log', 'glass', 'torch', 'diamond_pickaxe'];
    ids.forEach((id, i) => inv.setSlot(i, ItemStack.of(id, id === 'diamond_pickaxe' ? 1 : 64)));
  }
}

function lookVec(yaw: number, pitch: number): [number, number, number] {
  const pr = pitch * DEG, yr = yaw * DEG;
  return [-Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr)];
}

import { fluidHeight } from '../world/fluids';
function fluidSurface(w: World, x: number, y: number, z: number): number {
  return fluidHeight(w, x, y, z, FLUID_WATER);
}
