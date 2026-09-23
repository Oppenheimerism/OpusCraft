// Game shell: owns renderer, GUI, world, level, player; runs the 20 TPS tick
// loop and per-frame rendering like vanilla's Minecraft.runTick / GameRenderer.

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
import { FLUID_WATER, FLUID_LAVA, fluidHeight } from '../world/fluids';
import { BIOMES } from '../world/gen/biomes';
import { ItemStack, ITEMS } from '../item/item';
import { MIN_Y } from '../world/constants';
import { Overlay } from '../render/overlay';
import { isAnim, TexImage } from '../textures/tex';
import { ParticleEngine } from '../render/particles';
import { GuiGraphics, SpriteSheet, BitmapFont, autoGuiScale } from '../gui/guiGraphics';
import { ItemIcons } from '../gui/itemIcons';
import { Hud } from '../gui/hud';
import type { Screen } from '../gui/screen';
import { setClickSound } from '../gui/screen';
import type { FontData } from '../textures/font';
import { WorldMeta, saveWorldMeta, serializeChunk, saveChunks, savedChunkKeys, chunkKey, loadChunk, deserializeChunk, entityChunkKeys, saveEntityChunks, loadEntityChunk, SavedEntityChunk } from '../storage/worldStore';
import { NaturalSpawner, saveEntity, loadEntity, isChunkSaved, entityDisplayName } from './spawner';
import { hashString } from '../core/rng';
import type { Chunk } from '../world/chunk';
import type { Entity } from '../entity/entity';
import { Mob } from '../entity/mob';
import { SoundManager } from '../audio/soundManager';
import { Panorama } from '../render/panorama';
import { timeOfDay, skyDarkenInt } from '../render/environment';
import { GameOptions, loadOptions, saveOptions } from './options';
import { DEFAULT_GAME_RULES } from './gameRules';
import { ItemEntity } from '../entity/itemEntity';
import { GuiEntityRenderer } from '../render/guiEntity';
import { InventoryMenu, CraftingMenu, FurnaceMenu, ChestMenu } from '../inventory/menus';
import { ChestBlockEntity, FurnaceBlockEntity } from '../world/blockEntity';
import { useBed, findRespawn, BED_YROT, MSG, SleepHost } from './sleep';
import { AmbientTicker } from './animateTick';

export type { GameOptions } from './options';

export class Game {
  gl!: WebGL2RenderingContext;
  atlas!: Atlas;
  renderer!: Renderer;
  pool: WorkerPool | null = null;
  world!: World;
  chunks!: ChunkManager;
  level!: Level;
  player!: Player;
  input: Input;
  interaction!: Interaction;
  overlay!: Overlay;
  opts: GameOptions;
  gui!: GuiGraphics;
  icons!: ItemIcons;
  hud = new Hud();
  sound = new SoundManager();
  panorama: Panorama | null = null;
  screen: Screen | null = null;
  inWorld = false;
  meta: WorldMeta | null = null;
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
  freezeTime = false;
  frameTimeMs = 0;
  mouseX = 0;
  mouseY = 0;
  private spawnSearch = false;
  private blockImages = new Map<string, TexImage>();
  private savedKeys = new Set<string>();
  private autosaveTimer = 0;
  titleScreenFactory: (() => Screen) | null = null;
  pauseScreenFactory: (() => Screen) | null = null;
  deathScreenFactory: (() => Screen) | null = null;
  loadingScreenFactory: (() => Screen) | null = null;
  chatScreenFactory: ((initial: string) => Screen) | null = null;
  /** vanilla InBedChatScreen (chat + Leave Bed) */
  inBedScreenFactory: (() => Screen) | null = null;
  inventoryScreenFactory: (() => Screen) | null = null;
  onCommand: ((cmd: string) => void) | null = null;
  worldSpawn: [number, number, number] | null = null;
  spawner: NaturalSpawner | null = null;
  /** vanilla ClientLevel.animateTick (torch flames, drips, lava pops...) */
  ambient: AmbientTicker | null = null;
  /** chunks with a saved entity record / with entities not yet saved / with a record load in flight */
  private entityKeys = new Set<string>();
  private entityDirty = new Set<string>();
  private entityLoading = new Set<string>();

  constructor(readonly canvas: HTMLCanvasElement, readonly ui: HTMLCanvasElement) {
    this.opts = loadOptions();
    this.input = new Input(canvas);
  }

  saveOptions(): void {
    saveOptions(this.opts);
  }

  /** push current video options into the renderer / chunk manager */
  applyVideoOptions(remesh = false): void {
    const o = this.opts;
    o.fancy = o.graphics >= 1;
    this.renderer.fancy = o.fancy;
    this.renderer.cloudsEnabled = o.clouds > 0;
    this.renderer.renderDistance = o.renderDistance;
    if (this.inWorld && this.chunks) {
      const rdChanged = this.chunks.renderDistance !== o.renderDistance;
      const lightChanged = this.chunks.smoothLighting !== o.smoothLighting || this.chunks.fancyLeaves !== o.fancy;
      this.chunks.renderDistance = o.renderDistance;
      this.chunks.smoothLighting = o.smoothLighting;
      this.chunks.fancyLeaves = o.fancy;
      if (rdChanged) this.chunks.refreshRadius();
      if (lightChanged || remesh) this.chunks.remeshAll();
      this.level.simulationDistance = o.simulationDistance;
    }
  }

  async init(): Promise<void> {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not supported by this browser');
    this.gl = gl;
    const { textures, missing } = generateBlockTextures();
    if (missing.length) console.warn('missing textures', missing);
    this.atlas = new Atlas(textures);
    this.atlas.upload(gl);
    for (const [n, t] of textures) this.blockImages.set(n, isAnim(t) ? { w: t.w, h: t.h, data: t.frames[0] } : t);
    const itemMods = import.meta.glob('../textures/items.ts', { eager: true }) as Record<string, { ITEM_TEXTURES?: Record<string, () => TexImage> }>;
    const itemTextures = Object.values(itemMods)[0]?.ITEM_TEXTURES ?? null;
    this.renderer = new Renderer(gl, this.atlas, itemTextures, this.blockImages);
    this.overlay = new Overlay(gl, this.atlas);
    // GUI resources
    const guiMods = import.meta.glob('../textures/gui.ts', { eager: true }) as Record<string, { GUI_TEXTURES?: Record<string, () => TexImage> }>;
    const fontMods = import.meta.glob('../textures/font.ts', { eager: true }) as Record<string, { FONT?: FontData }>;
    const sprites = new SpriteSheet(Object.values(guiMods)[0]?.GUI_TEXTURES ?? {});
    const font = Object.values(fontMods)[0]?.FONT;
    if (!font) throw new Error('font missing');
    this.icons = new ItemIcons(this.renderer, this.blockImages);
    this.gui = new GuiGraphics(this.ui.getContext('2d')!, sprites, new BitmapFont(font), this.icons);
    setClickSound(() => this.sound.playUI('ui.button.click', 0.25, 1));
    this.setupInputRouting();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.panorama = new Panorama(this);
  }

  guiScale(): number {
    return autoGuiScale(this.canvas.width, this.canvas.height, this.opts.guiScale);
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ui.width = this.canvas.width;
    this.ui.height = this.canvas.height;
    this.renderer?.resize(this.canvas.width, this.canvas.height);
    if (this.gui) {
      const s = this.guiScale();
      this.gui.setup(this.canvas.width, this.canvas.height, s);
      if (this.screen) this.screen.initScreen(this.gui.width, this.gui.height);
    }
  }

  private setupInputRouting(): void {
    const inp = this.input;
    const toGui = (e: MouseEvent): [number, number] => {
      const r = this.canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.canvas.width;
      const py = ((e.clientY - r.top) / r.height) * this.canvas.height;
      return [px / this.gui.scale, py / this.gui.scale];
    };
    inp.onMouse = (e, type) => {
      if (!this.screen) {
        if (type === 'down' && this.inWorld && !inp.locked && this.spawned) {
          // the click that grabs the mouse does not attack/use (vanilla MouseHandler)
          inp.lock();
          inp.buttons[0] = inp.buttons[1] = inp.buttons[2] = false;
          inp.consumeClicks();
        }
        return;
      }
      const [mx, my] = toGui(e);
      this.mouseX = mx;
      this.mouseY = my;
      if (type === 'down') this.screen.mouseClicked(mx, my, e.button);
      else if (type === 'up') this.screen.mouseReleased(mx, my, e.button);
      else if (e.buttons) this.screen.mouseDragged(mx, my);
    };
    inp.onWheelRaw = (d) => {
      if (this.screen) this.screen.mouseScrolled(this.mouseX, this.mouseY, -d);
    };
    inp.onKey = (e) => {
      if (e.code === 'F11') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.();
        return true;
      }
      if (e.code === 'F2' && this.inWorld) {
        this.takeScreenshot();
        return true;
      }
      if (this.screen) {
        if (this.screen.keyPressed(e)) return true;
        if (e.key.length === 1) this.screen.charTyped(e.key);
        return e.key !== 'F12';
      }
      if (this.inWorld && this.spawned) {
        if (e.code === 'Escape') {
          this.openPause();
          return true;
        }
        if (e.code === KEYS.chat && !e.repeat) {
          if (this.chatScreenFactory) this.setScreen(this.chatScreenFactory(''));
          return true;
        }
        if (e.code === KEYS.command && !e.repeat) {
          if (this.chatScreenFactory) this.setScreen(this.chatScreenFactory('/'));
          return true;
        }
        if (e.code === KEYS.inventory && !e.repeat) {
          if (this.inventoryScreenFactory) this.setScreen(this.inventoryScreenFactory());
          return true;
        }
      }
      return false;
    };
    inp.onLockChange = (locked) => {
      if (!locked && this.inWorld && this.spawned && !this.screen) this.openPause();
    };
    // the browser refused to grab the mouse (no recent click): show the pause menu so a click on
    // "Back to Game" can grab it
    inp.onLockError = () => {
      if (this.inWorld && this.spawned && !this.screen && !inp.forceLocked) this.openPause();
    };
  }

  openPause(): void {
    if (this.pauseScreenFactory) this.setScreen(this.pauseScreenFactory());
  }

  setScreen(s: Screen | null): void {
    const prev = this.screen;
    prev?.removed();
    if (!s && !this.inWorld && this.titleScreenFactory) s = this.titleScreenFactory();
    if (!s && this.inWorld && this.player && this.player.health <= 0 && this.deathScreenFactory) s = this.deathScreenFactory();
    this.screen = s;
    // clicks/held buttons that opened or closed a screen never reach the world
    this.input.buttons[0] = this.input.buttons[1] = this.input.buttons[2] = false;
    this.input.consumeClicks();
    if (s) {
      s.initScreen(this.gui.width, this.gui.height);
      this.input.unlock();
    } else if (this.inWorld) {
      this.input.lock();
    }
  }

  // -------------------------------------------------------------------------
  // World lifecycle

  async startWorld(meta: WorldMeta): Promise<void> {
    this.meta = meta;
    const workers = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
    this.pool?.terminate();
    this.pool = new WorkerPool(workers, meta.seed, this.atlas.sprites);
    await this.pool.ready;
    this.savedKeys = await savedChunkKeys(meta.id);
    this.entityKeys = meta.transient ? new Set() : await entityChunkKeys(meta.id);
    this.entityDirty.clear();
    this.entityLoading.clear();
    this.world = new World();
    this.renderer.world.meshes.forEach((_m, k) => this.renderer.world.dispose(k));
    this.chunks = new ChunkManager(this.world, this.pool, this.renderer.world);
    this.chunks.renderDistance = this.opts.renderDistance;
    this.chunks.smoothLighting = this.opts.smoothLighting;
    this.chunks.fancyLeaves = this.opts.fancy;
    this.chunks.savedLoader = (cx, cz) => this.loadSavedChunk(cx, cz);
    this.chunks.onChunkLoaded = (c) => this.chunkEntitiesLoaded(c);
    this.chunks.onChunkUnloaded = (c) => {
      this.unloadChunkEntities(c);
      if (c.modified && this.meta && !this.meta.transient) {
        const sc = serializeChunk(this.meta.id, c, this.world.chunkBlockEntities(c.cx, c.cz).map((b) => b.save()));
        this.savedKeys.add(sc.key);
        void saveChunks([sc]);
      }
    };
    this.renderer.renderDistance = this.opts.renderDistance;
    this.renderer.fancy = this.opts.fancy;
    this.renderer.cloudsEnabled = this.opts.clouds > 0;
    this.level = new Level(this.world, meta.seed);
    this.level.dayTime = meta.dayTime;
    this.level.gameTime = meta.gameTime;
    this.level.difficulty = meta.difficulty as Level['difficulty'];
    this.level.raining = meta.raining;
    this.level.thundering = meta.thundering;
    if (meta.rainTime) this.level.rainTime = meta.rainTime;
    if (meta.thunderTime) this.level.thunderTime = meta.thunderTime;
    this.level.clearWeatherTime = meta.clearWeatherTime ?? 0;
    this.level.rain = this.level.rainO = meta.raining ? 1 : 0;
    this.level.thunder = this.level.thunderO = meta.thundering ? 1 : 0;
    this.level.simulationDistance = this.opts.simulationDistance;
    this.level.gameRules = { ...DEFAULT_GAME_RULES, ...(meta.gameRules ?? {}) };
    this.worldSpawn = meta.worldSpawn ?? null;
    this.level.sound = this.sound;
    this.player = new Player(this.level);
    this.player.setGameMode(meta.gameMode as GameMode);
    this.player.food.difficulty = this.level.difficulty;
    this.level.player = this.player;
    this.level.addEntity(this.player);
    this.interaction = new Interaction(this.level, this.player);
    this.interaction.onOpenContainer = (kind, x, y, z) => this.openContainer(kind, x, y, z);
    this.interaction.onUseBed = (x, y, z) => useBed(this.sleepHost(), x, y, z);
    this.player.dropHandler = (s) => this.interaction.throwItem(s);
    this.applyGameRules();
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
    this.level.particles = {
      blockBreak: (x, y, z, s) => particles.blockBreak(x, y, z, s),
      blockHit: (x, y, z, s, f) => particles.blockHit(x, y, z, s, f),
      poof: (e) => particles.poof(e),
      spawn: (k, x, y, z, dx, dy, dz) => particles.spawn(k, x, y, z, dx, dy, dz),
      emitAround: (k, e) => particles.emitAround(k, e),
      fallingDust: (x, y, z, c) => particles.fallingDust(x, y, z, c),
      blockParticle: (x, y, z, xd, yd, zd, st, bx, by, bz) => particles.blockParticle(x, y, z, xd, yd, zd, st, bx, by, bz),
    };
    this.spawner = new NaturalSpawner(this.level, hashString(meta.seed));
    this.ambient = new AmbientTicker(this.level);
    this.renderer.weather.tempAt = (biome, x, y, z) => {
      const b = BIOMES[biome];
      if (y > 80) return b.temperature - ((Math.sin(x * 0.13 + z * 0.07) * 4 + y - 80) * 0.05) / 40;
      return b.temperature;
    };
    this.hookPlayerSounds();
    this.hud = new Hud();
    // player data
    const pd = meta.player;
    if (pd) {
      this.player.moveTo(pd.x, pd.y, pd.z, pd.yaw, pd.pitch);
      this.player.health = pd.health;
      this.player.food.level = pd.food;
      this.player.food.saturation = pd.saturation;
      this.player.food.exhaustion = pd.exhaustion;
      this.player.xpLevel = pd.xpLevel;
      this.player.xpProgress = pd.xpProgress;
      this.player.xpTotal = pd.xpTotal;
      this.player.setGameMode(pd.gameMode as GameMode);
      this.player.flying = pd.flying && this.player.mayFly;
      this.player.inventory.selected = pd.selected;
      pd.inventory.forEach((s, i) => {
        if (s && ITEMS.has(s[0])) this.player.inventory.main[i] = new ItemStack(ITEMS.get(s[0])!, s[1], s[2]);
      });
      pd.armor.forEach((s, i) => {
        if (s && ITEMS.has(s[0])) this.player.inventory.armor[i] = new ItemStack(ITEMS.get(s[0])!, s[1], s[2]);
      });
      [this.player.spawnX, this.player.spawnY, this.player.spawnZ] = pd.spawn;
      if (pd.respawn) {
        this.player.respawnPos = [pd.respawn[0], pd.respawn[1], pd.respawn[2]];
        this.player.respawnForced = pd.respawn[3] === 1;
      }
      this.spawnSearch = false;
      if (pd.dead || pd.health <= 0) {
        // died before quitting: come back respawned at spawn
        this.player.health = this.player.maxHealth;
        this.player.food.level = 20;
        this.player.food.saturation = 5;
        this.player.moveTo(pd.spawn[0] + 0.5, pd.spawn[1], pd.spawn[2] + 0.5, 0, 0);
      }
    } else {
      this.player.moveTo(0.5, 120, 0.5, 0, 0);
      this.spawnSearch = true;
    }
    this.spawned = false;
    this.inWorld = true;
    this.chunks.setCenter(this.player.x, this.player.z);
    this.autosaveTimer = 0;
    if (this.loadingScreenFactory) this.setScreen(this.loadingScreenFactory());
    this.sound.stopMusic();
  }

  private async loadSavedChunk(cx: number, cz: number): Promise<ReturnType<typeof deserializeChunk> | null> {
    if (!this.meta) return null;
    const key = chunkKey(this.meta.id, cx, cz);
    if (!this.savedKeys.has(key)) return null;
    const s = await loadChunk(key);
    if (!s) return null;
    return deserializeChunk(s);
  }

  async saveWorld(): Promise<void> {
    if (!this.meta || !this.inWorld || this.meta.transient) return;
    const m = this.meta;
    const p = this.player;
    m.lastPlayed = Date.now();
    m.dayTime = this.level.dayTime;
    m.gameTime = this.level.gameTime;
    m.raining = this.level.raining;
    m.thundering = this.level.thundering;
    m.rainTime = this.level.rainTime;
    m.thunderTime = this.level.thunderTime;
    m.clearWeatherTime = this.level.clearWeatherTime;
    m.gameRules = { ...this.level.gameRules };
    if (this.worldSpawn) m.worldSpawn = this.worldSpawn;
    const st = (s: ItemStack | null): [string, number, number] | null => (s ? [s.item.id, s.count, s.damage] : null);
    m.player = {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      health: p.health, food: p.food.level, saturation: p.food.saturation, exhaustion: p.food.exhaustion,
      xpLevel: p.xpLevel, xpProgress: p.xpProgress, xpTotal: p.xpTotal,
      gameMode: p.gameMode, flying: p.flying, selected: p.inventory.selected,
      inventory: p.inventory.main.map(st), armor: p.inventory.armor.map(st),
      spawn: [p.spawnX, p.spawnY, p.spawnZ],
      respawn: p.respawnPos ? [...p.respawnPos, p.respawnForced ? 1 : 0] : null,
      dead: p.health <= 0,
    };
    const list = [];
    for (const c of this.world.chunks.values()) {
      if (!c.modified) continue;
      const sc = serializeChunk(m.id, c, this.world.chunkBlockEntities(c.cx, c.cz).map((b) => b.save()));
      this.savedKeys.add(sc.key);
      list.push(sc);
      c.modified = false;
    }
    await saveChunks(list);
    await this.saveLoadedEntities();
    await saveWorldMeta(m);
  }

  // -------------------------------------------------------------------------
  // entity persistence (per-chunk records, like vanilla's entities/ region files)

  private entityChunkKey(cx: number, cz: number): string {
    return chunkKey(this.meta!.id, cx, cz);
  }

  /** a chunk became available: restore its saved entities or run chunk-generation spawning */
  private chunkEntitiesLoaded(c: Chunk): void {
    if (!this.meta || !this.level) return;
    const key = this.entityChunkKey(c.cx, c.cz);
    const lvl = this.level;
    if (this.entityKeys.has(key)) {
      this.entityLoading.add(key);
      void loadEntityChunk(key).then((rec) => {
        this.entityLoading.delete(key);
        if (!rec || this.level !== lvl || !this.world.getChunk(c.cx, c.cz)) return;
        for (const d of rec.entities) {
          const e = loadEntity(d, lvl);
          if (e) lvl.addEntity(e);
        }
      });
    } else if (this.spawner) {
      if (this.spawner.spawnForNewChunk(c.cx, c.cz).length) this.entityDirty.add(key);
    }
  }

  private entitiesIn(cx: number, cz: number): Entity[] {
    return this.level.entities.filter((e) => !e.removed && isChunkSaved(e) && Math.floor(e.x) >> 4 === cx && Math.floor(e.z) >> 4 === cz);
  }

  private unloadChunkEntities(c: Chunk): void {
    if (!this.meta || !this.level) return;
    const key = this.entityChunkKey(c.cx, c.cz);
    const list = this.entitiesIn(c.cx, c.cz);
    // projectiles and orbs in unloaded chunks are dropped
    for (const e of this.level.entities) if (e !== this.player && !e.removed && Math.floor(e.x) >> 4 === c.cx && Math.floor(e.z) >> 4 === c.cz) e.remove();
    if (this.meta.transient || this.entityLoading.has(key)) return;
    if (!list.length && !this.entityKeys.has(key) && !this.entityDirty.has(key)) return;
    const rec: SavedEntityChunk = { key, entities: list.map(saveEntity).filter((d) => d !== null) };
    void saveEntityChunks([rec]);
    this.entityKeys.add(key);
    this.entityDirty.delete(key);
  }

  private async saveLoadedEntities(): Promise<void> {
    if (!this.meta || this.meta.transient) return;
    const groups = new Map<string, Entity[]>();
    for (const e of this.level.entities) {
      if (e.removed || !isChunkSaved(e)) continue;
      const key = this.entityChunkKey(Math.floor(e.x) >> 4, Math.floor(e.z) >> 4);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(e);
    }
    const out: SavedEntityChunk[] = [];
    for (const c of this.world.chunks.values()) {
      const key = this.entityChunkKey(c.cx, c.cz);
      if (this.entityLoading.has(key)) continue;
      const g = groups.get(key) ?? [];
      if (!g.length && !this.entityKeys.has(key) && !this.entityDirty.has(key)) continue;
      out.push({ key, entities: g.map(saveEntity).filter((d) => d !== null) });
      this.entityKeys.add(key);
      this.entityDirty.delete(key);
    }
    await saveEntityChunks(out);
  }

  async leaveWorld(): Promise<void> {
    if (this.player.isSleeping()) this.player.stopSleepInBed(true);
    await this.saveWorld();
    this.level.entities.length = 0;
    this.inWorld = false;
    this.spawned = false;
    this.pool?.terminate();
    this.pool = null;
    for (const k of [...this.renderer.world.meshes.keys()]) this.renderer.world.dispose(k);
    this.renderer.particles?.clear();
    this.meta = null;
    this.sound.stopAll();
    this.setScreen(this.titleScreenFactory ? this.titleScreenFactory() : null);
  }

  private hookPlayerSounds(): void {
    const p = this.player;
    const lvl = this.level;
    p.onStepSound = (pl) => {
      const st = lvl.getState(Math.floor(pl.x), Math.floor(pl.y - 0.2), Math.floor(pl.z));
      if (FLAGS[st] & F_WATER) return;
      const above = lvl.getState(Math.floor(pl.x), Math.floor(pl.y), Math.floor(pl.z));
      const useAbove = BLOCKS[STATE_BLOCK[above]].name === 'snow';
      const b = BLOCKS[STATE_BLOCK[useAbove ? above : st]];
      this.sound.play(`block.${b.sound}.step`, pl.x, pl.y, pl.z, 0.15, 1);
    };
    p.onSwimSound = (pl) => this.sound.play('entity.player.swim', pl.x, pl.y, pl.z, Math.min(1, Math.hypot(pl.dx * 0.44, pl.dy, pl.dz * 0.44) * 0.35), 1 + (Math.random() - Math.random()) * 0.4);
    p.onHurtSound = (pl, src) => {
      if (src === 'fall') return;
      // vanilla Player.getHurtSound: fire / drowning / freezing variants
      const name = src === 'onFire' || src === 'inFire' || src === 'lava' ? 'entity.player.hurt_on_fire' : src === 'drown' ? 'entity.player.hurt_drown' : src === 'freeze' ? 'entity.player.hurt_freeze' : src === 'sweetBerryBush' ? 'entity.player.hurt_sweet_berry_bush' : 'entity.player.hurt';
      this.sound.play(name, pl.x, pl.y, pl.z, 1, (Math.random() - Math.random()) * 0.2 + 1);
    };
    p.onFall = (pl, _dmg, dist) => {
      this.sound.play(dist > 4 + 3 ? 'entity.player.big_fall' : 'entity.player.small_fall', pl.x, pl.y, pl.z, 1, 1);
      this.sound.play('entity.player.hurt', pl.x, pl.y, pl.z, 1, (Math.random() - Math.random()) * 0.2 + 1);
    };
    p.onDeath = (_pl, source) => {
      this.sound.play('entity.player.death', p.x, p.y, p.z, 1, 1);
      const rules = this.level.gameRules;
      if (rules.showDeathMessages) this.chat(this.deathMessage(source));
      if (!rules.keepInventory) {
        this.dropAllItems();
        p.xpLevel = 0;
        p.xpProgress = 0;
      }
      if (rules.doImmediateRespawn) {
        setTimeout(() => this.inWorld && this.respawn(), 0);
        return;
      }
      if (this.deathScreenFactory && this.inWorld) this.setScreen(this.deathScreenFactory());
    };
  }

  containerScreenFactory: ((menu: InventoryMenu | CraftingMenu | FurnaceMenu | ChestMenu) => Screen) | null = null;

  /** right-clicked a block with a menu */
  openContainer(kind: string, x: number, y: number, z: number): void {
    if (!this.containerScreenFactory) return;
    const p = this.player;
    if (kind === 'crafting_table') this.setScreen(this.containerScreenFactory(new CraftingMenu(p, [x, y, z])));
    else if (kind === 'furnace') {
      const be = this.world.getBlockEntity(x, y, z);
      if (be instanceof FurnaceBlockEntity) this.setScreen(this.containerScreenFactory(new FurnaceMenu(p, be)));
    } else if (kind === 'chest') {
      const be = this.world.getBlockEntity(x, y, z);
      if (!(be instanceof ChestBlockEntity)) return;
      // a solid block above keeps the lid shut (vanilla ChestBlock.isChestBlockedAt)
      if (FLAGS[this.world.getState(x, y + 1, z)] & F_OPAQUE) return;
      this.setScreen(this.containerScreenFactory(new ChestMenu(p, be)));
      if (be.openCount++ === 0) this.sound.play('block.chest.open', x + 0.5, y + 0.5, z + 0.5, 0.5, Math.random() * 0.1 + 0.9);
    }
  }

  /** chest closed (called by the chest screen) */
  chestClosed(be: ChestBlockEntity): void {
    be.openCount = Math.max(0, be.openCount - 1);
    if (be.openCount === 0) this.sound.play('block.chest.close', be.x + 0.5, be.y + 0.5, be.z + 0.5, 0.5, Math.random() * 0.1 + 0.9);
  }

  private guiEntity: GuiEntityRenderer | null = null;

  /** vanilla InventoryScreen.renderEntityInInventoryFollowsMouse */
  renderEntityInInventory(g: GuiGraphics, x1: number, y1: number, x2: number, y2: number, scale: number, yOffset: number, mx: number, my: number): void {
    this.guiEntity ??= new GuiEntityRenderer(this.gl, this.renderer.batch, this.renderer.hand.skinTexture);
    const c = this.guiEntity.render(this.player, this.opts, g.scale, x1, y1, x2, y2, scale, yOffset, mx, my, this.ticks);
    const ctx = g.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const t = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, t.e, t.f);
    ctx.drawImage(c, Math.round(x1 * g.scale), Math.round(y1 * g.scale));
    ctx.restore();
  }

  /** vanilla combat tracker death messages */
  deathMessage(source: string): string {
    const n = this.playerName;
    const k = this.player.killer;
    const kn = k ? entityDisplayName(k) : '';
    switch (source) {
      case 'mob':
        return `${n} was slain by ${kn}`;
      case 'player':
        return `${n} was slain by ${kn}`;
      case 'arrow':
        return k && k !== this.player && k.type !== 'arrow' ? `${n} was shot by ${kn}` : `${n} was shot by Arrow`;
      case 'explosion':
        return `${n} blew up`;
      case 'playerExplosion':
        return k === this.player || !k ? `${n} blew up` : `${n} was blown up by ${kn}`;
      case 'fall':
        return `${n} fell from a high place`;
      case 'drown':
        return `${n} drowned`;
      case 'starve':
        return `${n} starved to death`;
      case 'void':
        return `${n} fell out of the world`;
      case 'lava':
        return `${n} tried to swim in lava`;
      case 'inFire':
        return `${n} went up in flames`;
      case 'onFire':
        return `${n} burned to death`;
      case 'inWall':
        return `${n} suffocated in a wall`;
      case 'cactus':
        return `${n} was pricked to death`;
      case 'sweetBerryBush':
        return `${n} was poked to death by a sweet berry bush`;
      case 'genericKill':
        return `${n} was killed`;
      default:
        return `${n} died`;
    }
  }

  /** vanilla Inventory.dropAll: every stack flung in a random direction */
  private dropAllItems(): void {
    const p = this.player;
    const inv = p.inventory;
    const drop = (s: ItemStack | null) => {
      if (!s) return;
      const e = new ItemEntity(this.level, s);
      e.moveTo(p.x, p.y + p.eyeHeight - 0.3, p.z);
      e.pickupDelay = 40;
      const f = Math.random() * 0.5, a = Math.random() * Math.PI * 2;
      e.dx = -Math.sin(a) * f;
      e.dy = 0.2;
      e.dz = Math.cos(a) * f;
      this.level.addEntity(e);
    };
    for (let i = 0; i < inv.main.length; i++) {
      drop(inv.main[i]);
      inv.main[i] = null;
    }
    for (let i = 0; i < inv.armor.length; i++) {
      drop(inv.armor[i]);
      inv.armor[i] = null;
    }
    inv.version++;
  }

  applyGameRules(): void {
    const r = this.level.gameRules;
    this.level.doDaylightCycle = !!r.doDaylightCycle;
    this.level.randomTicks.speed = Number(r.randomTickSpeed);
    this.player.food.naturalRegen = !!r.naturalRegeneration;
  }

  respawn(): void {
    const p = this.player;
    p.health = p.maxHealth;
    p.deathTime = 0;
    p.hurtTime = 0;
    p.dead = false;
    p.killer = null;
    p.lastHurtByMob = null;
    p.remainingFireTicks = 0;
    p.stopUsingItem();
    p.food.level = 20;
    p.food.saturation = 5;
    p.food.exhaustion = 0;
    p.air = 300;
    p.fallDistance = 0;
    p.removed = false;
    p.xpLevel = 0;
    p.xpProgress = 0;
    p.sleepingPos = null;
    p.sleepCounter = 0;
    p.setSize(0.6, 1.8);
    // vanilla PlayerList.respawn: at the bed (facing it) if it's still there and clear
    const at = findRespawn(this.level, p);
    if (at) this.teleport(at.x, at.y, at.z, at.yaw, 0);
    else {
      if (p.respawnPos) {
        p.respawnPos = null;
        this.chat(MSG.noRespawnBlock);
      }
      this.teleport(p.spawnX + 0.5, p.spawnY, p.spawnZ + 0.5, 0, 0);
    }
    if (!this.level.entities.includes(p)) this.level.addEntity(p);
    this.setScreen(null);
  }

  /** hardcore "Spectate World": revive where the player died */
  respawnInPlace(): void {
    const p = this.player;
    p.health = p.maxHealth;
    p.deathTime = 0;
    p.hurtTime = 0;
    p.dead = false;
    p.killer = null;
    p.remainingFireTicks = 0;
    p.removed = false;
    p.fallDistance = 0;
    if (!this.level.entities.includes(p)) this.level.addEntity(p);
    this.setScreen(null);
  }

  teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
    this.player.moveTo(x, y, z, yaw ?? this.player.yaw, pitch ?? this.player.pitch);
    this.player.dx = this.player.dy = this.player.dz = 0;
    this.player.fallDistance = 0;
  }

  private findSpawn(): boolean {
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
    let lastDrawn = 0;
    const frame = (now: number) => {
      lastFrame = performance.now();
      const cap = this.opts.maxFps;
      // vanilla limits menus to 60 fps; in-game uses the Max Framerate option
      const limit = !this.inWorld || (this.screen && this.isPaused()) ? Math.min(60, cap) : cap;
      if (limit < 260 && now - lastDrawn < 1000 / limit - 2) {
        requestAnimationFrame(frame);
        return;
      }
      lastDrawn = now;
      this.frame(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    setInterval(() => {
      const now = performance.now();
      if (now - lastFrame > 250) {
        lastFrame = now;
        this.frame(now);
      }
    }, 50);
  }

  isPaused(): boolean {
    return !!this.screen && this.screen.isPauseScreen() && this.inWorld && this.spawned;
  }

  private frame(now: number): void {
    const t0 = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const paused = this.isPaused();
    if (!paused) this.acc += dt;
    if (this.inWorld) this.handleFrameInput();
    let n = 0;
    while (this.acc >= 0.05 && n < 10) {
      this.acc -= 0.05;
      this.tick();
      n++;
    }
    if (n >= 10) this.acc = 0;
    if (!this.inWorld) this.menuTick(dt);
    if (this.screen) this.input.consumeClicks();
    const partial = paused ? 1 : this.acc / 0.05;
    if (this.inWorld) {
      this.chunks.setCenter(this.player.x, this.player.z);
      this.chunks.update();
    }
    this.render(partial);
    this.frames++;
    if (now - this.fpsTime > 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.fpsTime = now;
    }
    this.frameTimeMs = performance.now() - t0;
    this.sound.update(this.inWorld ? this.player : null, this.opts);
  }

  private menuTick(dt: number): void {
    this.panorama?.update(dt);
    this.screen?.tick();
    this.sound.menuMusic(this.opts);
  }

  private handleFrameInput(): void {
    const inp = this.input;
    const [mx, my] = inp.consumeMouse();
    if (this.spawned && inp.locked && !this.screen) {
      const s = this.opts.sensitivity * 0.6 + 0.2;
      const k = s * s * s * 8;
      this.player.yaw += mx * k * 0.15;
      this.player.pitch = clamp(this.player.pitch + my * k * 0.15 * (this.opts.invertMouse ? -1 : 1), -90, 90);
    }
    if (this.spawned) {
      const p = this.player;
      const eye = p.y + p.eyeHeight;
      this.interaction.pick(p.x, eye, p.z, p.yaw, p.pitch);
    }
  }

  private tick(): void {
    this.ticks++;
    if (!this.inWorld) return;
    if (!this.spawned) {
      if (this.spawnSearch) {
        if (this.findSpawn()) this.spawnSearch = false;
        else return;
      }
      if (this.chunks.isReady(this.player.x, this.player.z, 2)) {
        this.spawned = true;
        if (this.screen) this.setScreen(null);
        this.input.lock();
      } else return;
    }
    const inp = this.input;
    const p = this.player;
    // vanilla Minecraft.tick: asleep → the in-bed chat screen; woken → close it
    if (!this.screen && p.isSleeping() && p.health > 0 && this.inBedScreenFactory) this.setScreen(this.inBedScreenFactory());
    else if (this.screen && (this.screen as { inBed?: boolean }).inBed && !p.isSleeping()) (this.screen as unknown as { onPlayerWokeUp(): void }).onPlayerWokeUp();
    this.screen?.tick();
    const noScreen = !this.screen;
    for (const code of inp.pressed()) {
      if (!noScreen) continue;
      if (code === KEYS.debug) this.showDebug = !this.showDebug;
      else if (code === KEYS.hideGui) this.hideGui = !this.hideGui;
      else if (code === KEYS.togglePerspective) this.thirdPerson = (this.thirdPerson + 1) % 3;
      else if (code === KEYS.drop) this.interaction.drop(inp.isDown('ControlLeft') || inp.isDown('MetaLeft'));
      else {
        for (let d = 1; d <= 9; d++)
          if (code === KEYS[`hotbar${d}` as keyof typeof KEYS]) {
            p.inventory.selected = d - 1;
            p.inventory.version++;
          }
      }
    }
    const wheel = inp.consumeWheel();
    if (wheel !== 0 && inp.locked && noScreen) {
      p.inventory.selected = (((p.inventory.selected + wheel) % 9) + 9) % 9;
      p.inventory.version++;
    }
    const active = inp.locked && noScreen && p.health > 0;
    p.input.forward = active && inp.isDown(KEYS.forward);
    p.input.back = active && inp.isDown(KEYS.back);
    p.input.left = active && inp.isDown(KEYS.left);
    p.input.right = active && inp.isDown(KEYS.right);
    p.input.jump = active && inp.isDown(KEYS.jump);
    p.input.sneak = active && (inp.isDown(KEYS.sneak) || inp.isDown('ShiftRight'));
    p.input.sprint = active && (inp.isDown(KEYS.sprint) || inp.isDown('ControlRight'));
    const clicks = inp.consumeClicks();
    if (active) {
      if (clicks.includes(0)) this.interaction.startAttack();
      this.interaction.continueAttack(inp.buttons[0] && !p.isUsingItem());
      this.interaction.use(clicks.includes(2), inp.buttons[2]);
      if (clicks.includes(1)) this.interaction.pickBlock();
    } else {
      this.interaction.continueAttack(false);
      if (p.isUsingItem()) this.interaction.releaseUsingItem();
    }
    this.interaction.tickUsingItem();
    this.fovModO = this.fovMod;
    const target = clamp(1 + (p.fovModifier() - 1) * this.opts.fovEffects, 0.1, 1.5);
    this.fovMod += (target - this.fovMod) * 0.5;
    this.level.tick();
    this.spawner?.tick();
    this.ambient?.tick(p.x, p.y, p.z);
    this.ambient?.tickRain(p.x, p.y + p.eyeHeight, p.z, this.opts.graphics >= 1);
    if (this.freezeTime) this.level.dayTime--;
    if (p.y < MIN_Y - 64 && p.health > 0) p.hurt(4, 'void');
    this.atlas.tick();
    this.renderer.lightmap.tick();
    this.renderer.hand.tick(p);
    this.renderer.particles?.tick();
    this.hud.tick(this);
    this.sound.tick(this);
    if (++this.autosaveTimer >= 6000) {
      this.autosaveTimer = 0;
      void this.saveWorld();
    }
  }

  // -------------------------------------------------------------------------

  /** vanilla 1.21 Screen.renderBackground: blurred world/panorama + menu background texture */
  renderMenuBackground(g: GuiGraphics, _s: Screen, x = 0, y = 0, w = g.width, h = g.height): void {
    this.requestBlur();
    if (this.inWorld && this.spawned) this.blurGuiSoFar(g);
    this.menuBackgroundTexture(g, x, y, w, h);
  }

  private blurScratch: HTMLCanvasElement | null = null;

  /** vanilla blurs the HUD together with the world behind in-game menus */
  private blurGuiSoFar(g: GuiGraphics): void {
    const r = this.opts.menuBlur;
    if (r < 1) return;
    const ctx = g.ctx;
    const c = ctx.canvas;
    const b = (this.blurScratch ??= document.createElement('canvas'));
    if (b.width !== c.width || b.height !== c.height) {
      b.width = c.width;
      b.height = c.height;
    }
    const bc = b.getContext('2d')!;
    bc.clearRect(0, 0, b.width, b.height);
    bc.drawImage(c, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.filter = `blur(${Math.sqrt((2 * ((2 * r + 1) ** 2 - 1)) / 12).toFixed(2)}px)`;
    ctx.drawImage(b, 0, 0);
    ctx.restore();
  }

  menuBackgroundTexture(g: GuiGraphics, x = 0, y = 0, w = g.width, h = g.height): void {
    const inWorld = this.inWorld && this.spawned;
    g.tile(inWorld ? 'inworld_menu_background' : 'menu_background', x, y, w, h, 1, 2);
  }

  /** vanilla renderTransparentBackground (container screens) */
  renderTransparentBackground(g: GuiGraphics): void {
    g.fillGradient(0, 0, g.width, g.height, 0xc0101010, 0xd0101010);
  }

  private render(partial: number): void {
    const g = this.gui;
    const guiScale = this.guiScale();
    if (g.scale !== guiScale) {
      g.setup(this.canvas.width, this.canvas.height, guiScale);
      this.screen?.initScreen(g.width, g.height);
    }
    if (this.icons.builtScale !== guiScale) this.icons.build(guiScale);
    g.clear();
    this.blurRequested = false;
    if (!this.inWorld || !this.spawned) {
      const gl = this.gl;
      if (this.panorama && this.panorama.state === 'ready') this.panorama.render(this.panoramaFade);
      else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      if (this.screen) this.screen.render(g, this.mouseX, this.mouseY, partial);
      this.applyBlur();
      return;
    }
    this.renderWorld(partial);
    if (!this.hideGui) this.hud.render(g, this, partial, !!this.screen && (this.screen as { isChat?: boolean }).isChat === true);
    if (this.screen) this.screen.render(g, this.mouseX, this.mouseY, partial);
    this.applyBlur();
  }

  /** menu background blur (vanilla 1.20.5+ post-effect), done with a CSS filter on the 3D canvas */
  private blurRequested = false;
  private blurApplied = '';
  panoramaFade = 1;

  requestBlur(): void {
    this.blurRequested = true;
  }

  private applyBlur(): void {
    let f = '';
    const r = this.opts.menuBlur;
    if (this.blurRequested && r >= 1) {
      // two box-blur passes of radius r ~ gaussian sigma sqrt(2*((2r+1)^2-1)/12) framebuffer pixels
      const sigma = Math.sqrt((2 * ((2 * r + 1) ** 2 - 1)) / 12) / (window.devicePixelRatio || 1);
      f = `blur(${sigma.toFixed(2)}px)`;
    }
    if (f !== this.blurApplied) {
      this.blurApplied = f;
      this.canvas.style.filter = f;
    }
  }

  renderWorld(partial: number, camOverride?: Camera): void {
    const p = this.player;
    const ex = p.lerpX(partial), ez = p.lerpZ(partial);
    const eyeH = p.eyeHeightCamO + (p.eyeHeightCam - p.eyeHeightCamO) * partial;
    const ey = p.lerpY(partial) + eyeH;
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
    const bed = p.bedOrientation();
    if (this.thirdPerson === 0 && bed) {
      // vanilla Camera.setup: asleep, look down the bed from the pillow
      yaw = BED_YROT[bed] - 180;
      pitch = 0;
      cy += 0.3;
    } else if (this.thirdPerson > 0) {
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
    const cam: Camera = camOverride ?? { x: cx, y: cy, z: cz, yaw, pitch, fov };
    const biome = this.world.getBiome(Math.floor(cam.x), Math.floor(cam.z));
    const b = BIOMES[biome];
    this.renderer.render(cam, {
      dayTime: this.level.dayTime,
      ticks: this.ticks,
      partial,
      weather: { rain: this.level.rainLevel(partial), thunder: this.level.thunderLevel(partial), flash: this.level.skyFlash },
      biome,
      gamma: this.opts.gamma,
      nightVision: 0,
      bob: camOverride ? null : bob,
      underwater: eyeFluid === FLUID_WATER,
      waterFogColor: [((b.waterFog >> 16) & 255) / 255, ((b.waterFog >> 8) & 255) / 255, (b.waterFog & 255) / 255],
      level: this.level,
      entityOptions: { shadows: this.opts.entityShadows, drawPlayer: this.thirdPerson > 0 && !camOverride, distanceScale: this.opts.entityDistanceScaling },
    });
    if (camOverride) return;
    const hit = this.interaction.hit;
    if (hit && !this.hideGui && p.gameMode !== 'spectator') {
      this.overlay.renderSelection(this.renderer, cam, hit.x, hit.y, hit.z, hit.state);
      const stage = this.interaction.destroyStage;
      if (stage >= 0) this.overlay.renderCrack(this.renderer, cam, hit.x, hit.y, hit.z, hit.state, stage);
    }
    this.renderHandAndEffects(partial, p, ex, ey, ez, eyeFluid);
  }

  /** vanilla level.getSkyDarken as an int (0..11) for the current time/weather */
  skyDarkenInt(): number {
    return skyDarkenInt(timeOfDay(this.level.dayTime), { rain: this.level.rainLevel(1), thunder: this.level.thunderLevel(1), flash: 0 });
  }

  private renderHandAndEffects(partial: number, p: Player, ex: number, ey: number, ez: number, eyeFluid: number): void {
    if (this.thirdPerson === 0 && !this.hideGui && p.gameMode !== 'spectator' && !p.isSleeping()) {
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
    if (this.thirdPerson === 0 && p.isOnFire() && p.gameMode !== 'spectator') {
      this.renderer.entities.renderScreenFire(this.renderer.batch, this.canvas.width, this.canvas.height, 70, this.level.gameTime);
    }
    if (this.opts.fancy && !this.hideGui) this.overlay.renderVignette(this.gui.sprites.get('vignette'), this.hud.vignetteBrightness, this.canvas.width, this.canvas.height);
  }

  private cameraFluid(x: number, y: number, z: number): number {
    const st = this.world.getState(Math.floor(x), Math.floor(y), Math.floor(z));
    if (FLAGS[st] & F_WATER) {
      const h = Math.floor(y) + fluidHeight(this.world, Math.floor(x), Math.floor(y), Math.floor(z), FLUID_WATER);
      if (y < h) return FLUID_WATER;
    }
    if (FLAGS[st] & F_LAVA) return FLUID_LAVA;
    return 0;
  }

  private cameraDistance(x: number, y: number, z: number, dx: number, dy: number, dz: number, max: number): number {
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
    // vanilla bobHurt: tilt away from the damage direction
    const d = p.hurtDir;
    rotateY(m, m, -d * DEG);
    rotateZ(m, m, -f * 14 * this.opts.damageTiltStrength * DEG);
    rotateY(m, m, d * DEG);
  }

  takeScreenshot(): void {
    try {
      const url = this.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      a.download = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.png`;
      a.href = url;
      a.click();
      this.hud.addChat(`Saved screenshot as ${a.download}`, this.ticks);
    } catch (e) {
      console.warn(e);
    }
  }

  chat(msg: string): void {
    this.hud.addChat(msg, this.ticks);
  }

  sleepHost(): SleepHost {
    return { level: this.level, player: this.player, overlay: (m) => this.hud.setOverlayMessage(m), chat: (m) => this.chat(m) };
  }

  /** the in-bed screen's Leave Bed button / Escape (vanilla sendWakeUp) */
  leaveBed(): void {
    if (this.player.isSleeping()) this.player.stopSleepInBed(false);
  }

  readonly chatHistory: string[] = [];

  get playerName(): string {
    return this.opts.username || 'Player';
  }

  /** send a chat line typed by the player (vanilla ChatScreen.handleChatInput) */
  sendChat(text: string): void {
    const msg = text.trim().replace(/\s+/g, ' ');
    if (!msg) return;
    if (this.chatHistory[this.chatHistory.length - 1] !== msg) this.chatHistory.push(msg);
    if (this.chatHistory.length > 100) this.chatHistory.shift();
    if (msg.startsWith('/')) {
      this.onCommand?.(msg.slice(1));
      return;
    }
    this.chat(`<${this.playerName}> ${msg}`);
  }

  /** "Save and Quit to Title" */
  async quitToTitle(savingScreen: Screen | null): Promise<void> {
    if (savingScreen) this.setScreen(savingScreen);
    await this.leaveWorld();
  }
}

function lookVec(yaw: number, pitch: number): [number, number, number] {
  const pr = pitch * DEG, yr = yaw * DEG;
  return [-Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr)];
}
