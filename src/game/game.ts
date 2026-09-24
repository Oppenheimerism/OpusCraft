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
import { biomeTemperature } from '../world/gen/temperature';
import { ItemStack, ITEMS, saveStack, loadStack } from '../item/item';
import { hasShapeUpdates, updateShape } from './shapeUpdates';
import { MIN_Y, MAX_Y } from '../world/constants';
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
import { timeOfDay, skyDarkenInt, blendBiomeColors } from '../render/environment';
import { GameOptions, loadOptions, saveOptions } from './options';
import { DEFAULT_GAME_RULES } from './gameRules';
import { ItemEntity } from '../entity/itemEntity';
import { ExperienceOrb } from '../entity/xpOrb';
import { GuiEntityRenderer } from '../render/guiEntity';
import type { SkinParts } from '../render/entityRenderers';
import { InventoryMenu, CraftingMenu, FurnaceMenu, ChestMenu } from '../inventory/menus';
import { EnchantmentMenu, AnvilMenu, GrindstoneMenu } from '../inventory/enchantMenus';
import { hasVanishing } from '../item/enchantHelper';
import { ChestBlockEntity, FurnaceBlockEntity, BarrelBlockEntity } from '../world/blockEntity';
import { useBed, findRespawn, BED_YROT, MSG, SleepHost } from './sleep';
import { AmbientTicker } from './animateTick';
import { ToastComponent, AdvancementToast, RecipeToast } from '../gui/toasts';
import { PlayerAdvancements, announcement, AdvancementDef } from './advancements';
import { PlayerRecipeBook, BookRecipe } from '../inventory/recipeBook';
import { Tutorial, TutorialStep } from './tutorial';
import { keyDisplayName } from './input';
import { LivingEntity } from '../entity/living';
import { Monster } from '../entity/monsters';
import { Piglin, isLovedItem } from '../entity/piglin';
import type { MinecartChest } from '../entity/minecart';
import { ChestBoat } from '../entity/boat';
import { nightVisionScale, blindnessFog, applyNausea } from '../render/effectVisuals';
import { OVERWORLD, THE_NETHER, dimensionById, teleportationScale, type DimensionType } from '../world/dimension';
import { PortalPoi, portalRectangle, relativePortalPosition, portalExit, createPortal, isPortal, portalAxis, type PortalRect } from './portal';
import { setVillageMenuHook } from './villageBlocks';

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
  /** vanilla ToastComponent */
  readonly toasts = new ToastComponent((name, v, pitch) => this.sound.playUI(name, v, pitch));
  advancements = new PlayerAdvancements();
  recipeBook = new PlayerRecipeBook();
  readonly tutorial = new Tutorial({
    toasts: this.toasts,
    isSurvival: () => this.player?.gameMode === 'survival' || this.player?.gameMode === 'adventure',
    inventoryItems: () => this.inventoryItemIds(),
    keyName: (a) => keyDisplayName(this.opts.keys[a] ?? ''),
    getStep: () => this.opts.tutorialStep as TutorialStep,
    setStepOption: (st) => {
      this.opts.tutorialStep = st;
      this.saveOptions();
    },
  });
  advancementsScreenFactory: (() => Screen) | null = null;
  private lastInvVersion = -1;
  /** highest point of the current fall (vanilla fall_from_world_height) */
  private fallStartY: number | null = null;
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
  /** vanilla ReceivingLevelScreen, shown while changing dimension */
  receivingScreenFactory: ((portal: boolean) => Screen) | null = null;
  /** nether portal blocks in every dimension (vanilla POI records) */
  readonly portalPoi = new PortalPoi();
  /** after a change of dimension: puts the player in place once the chunks are in (false: wait some more) */
  private arrival: ((g: Game) => boolean) | null = null;
  /** the loading screen shows the portal's swirl */
  private receivingPortal = false;
  /** where the player left the Overworld for the Nether (vanilla enteredNetherPosition, not saved) */
  private enteredNetherAt: [number, number] | null = null;
  private leftOverworldAt: [number, number] | null = null;
  /** where the player's mount went into lava (vanilla ServerPlayer.enteredLavaOnVehiclePosition) */
  private lavaRideFrom: [number, number] | null = null;
  /** the tutorial hints start on first joining the world, not on every change of dimension */
  private joined = false;
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
          // vanilla isServerControlledInventory: in a chest boat the key opens its chest
          const v = this.player.vehicle;
          if (v instanceof ChestBoat) this.openEntityContainer(v);
          else {
            if (this.inventoryScreenFactory) this.setScreen(this.inventoryScreenFactory());
            this.tutorial.onOpenInventory();
          }
          return true;
        }
        if (e.code === KEYS.advancements && !e.repeat && this.advancementsScreenFactory) {
          this.setScreen(this.advancementsScreenFactory());
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
      if (!(s as { keepsMouse?: boolean }).keepsMouse) this.input.unlock();
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
    this.world.dim = dimensionById(meta.player && !meta.player.dead ? meta.player.dimension : 'overworld');
    this.portalPoi.load(meta.portals);
    this.world.onPortalChanged = (x, y, z, present) => this.portalPoi.changed(this.world.dim.id, x, y, z, present);
    this.arrival = null;
    this.receivingPortal = false;
    this.joined = false;
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
        const sc = serializeChunk(this.meta.id, c, this.world.chunkBlockEntities(c.cx, c.cz).map((b) => b.save()), this.world.dim.storage);
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
    setVillageMenuHook((kind, x, y, z) => this.openContainer(kind, x, y, z));
    this.interaction.onOpenEntityContainer = (e) => this.openEntityContainer(e);
    this.interaction.onMounted = () => this.hud.setOverlayMessage(`Press ${keyDisplayName(KEYS.sneak)} to Dismount`);
    this.interaction.onUseBed = (x, y, z) => useBed(this.sleepHost(), x, y, z);
    this.level.onPortal = (e, x, y, z) => {
      if (e === this.player) this.portalTravel(x, y, z);
    };
    // vanilla ClientPacketListener.handleTakeItemEntity: the pop, and what was taken flying to whoever took it
    this.level.onTake = (e, taker) => {
      const r = Math.random;
      if (e instanceof ExperienceOrb) this.level.sound.play('entity.experience_orb.pickup', e.x, e.y, e.z, 0.1, (r() - r()) * 0.35 + 0.9);
      else this.level.sound.play('entity.item.pickup', e.x, e.y, e.z, 0.2, (r() - r()) * 1.4 + 2);
      this.renderer.entities.addPickup(e instanceof ItemEntity ? e.copy() : e, taker);
    };
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
    particles.onDripstoneDripLand = (x, y, z, lava) => this.sound.play(lava ? 'block.pointed_dripstone.drip_lava' : 'block.pointed_dripstone.drip_water', x, y, z, 0.3 + Math.random() * 0.7, 1);
    this.level.particles = {
      blockBreak: (x, y, z, s) => particles.blockBreak(x, y, z, s),
      blockHit: (x, y, z, s, f) => particles.blockHit(x, y, z, s, f),
      poof: (e) => particles.poof(e),
      spawn: (k, x, y, z, dx, dy, dz) => particles.spawn(k, x, y, z, dx, dy, dz),
      emitAround: (k, e) => particles.emitAround(k, e),
      fallingDust: (x, y, z, c) => particles.fallingDust(x, y, z, c),
      blockParticle: (x, y, z, xd, yd, zd, st, bx, by, bz) => particles.blockParticle(x, y, z, xd, yd, zd, st, bx, by, bz),
      entityEffect: (x, y, z, c, a) => particles.entityEffect(x, y, z, c, a),
      dust: (x, y, z, r, g, b, s) => particles.dust(x, y, z, r, g, b, s),
    };
    this.spawner = new NaturalSpawner(this.level, hashString(meta.seed));
    this.ambient = new AmbientTicker(this.level);
    this.renderer.weather.tempAt = (biome, x, y, z) => {
      const b = BIOMES[biome];
      return biomeTemperature(b.temperature, !!b.frozen, x, y, z);
    };
    this.hookPlayerSounds();
    this.hud = new Hud();
    this.toasts.clear();
    this.advancements = new PlayerAdvancements();
    this.recipeBook = new PlayerRecipeBook();
    this.hookProgress();
    // player data
    const pd = meta.player;
    this.advancements.load(pd?.advancements);
    this.recipeBook.load(pd?.recipeBook);
    if (pd) {
      this.player.moveTo(pd.x, pd.y, pd.z, pd.yaw, pd.pitch);
      // effects before health so health boost holds (a player who died comes back without them)
      if (!pd.dead && pd.health > 0) this.player.loadEffects(pd.effects);
      this.player.health = pd.health;
      this.player.food.level = pd.food;
      this.player.food.saturation = pd.saturation;
      this.player.food.exhaustion = pd.exhaustion;
      this.player.xpLevel = pd.xpLevel;
      this.player.xpProgress = pd.xpProgress;
      this.player.xpTotal = pd.xpTotal;
      this.player.enchantmentSeed = pd.xpSeed ?? 0;
      this.player.setGameMode(pd.gameMode as GameMode);
      this.player.flying = pd.flying && this.player.mayFly;
      this.player.inventory.selected = pd.selected;
      pd.inventory.forEach((s, i) => {
        this.player.inventory.main[i] = loadStack(s);
      });
      pd.armor.forEach((s, i) => {
        this.player.inventory.armor[i] = loadStack(s);
      });
      [this.player.spawnX, this.player.spawnY, this.player.spawnZ] = pd.spawn;
      if (pd.respawn) {
        this.player.respawnPos = [pd.respawn[0], pd.respawn[1], pd.respawn[2]];
        this.player.respawnForced = pd.respawn[3] === 1;
      }
      this.spawnSearch = false;
      // vanilla RootVehicle: back in the minecart you left the game in
      const v = pd.vehicle && !pd.dead ? loadEntity(pd.vehicle, this.level) : null;
      if (v) {
        this.level.addEntity(v);
        this.player.startRiding(v, true);
      }
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
    const key = chunkKey(this.meta.id, cx, cz, this.world.dim.storage);
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
    const st = (s: ItemStack | null) => (s ? saveStack(s) : null);
    m.player = {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      health: p.health, food: p.food.level, saturation: p.food.saturation, exhaustion: p.food.exhaustion,
      xpLevel: p.xpLevel, xpProgress: p.xpProgress, xpTotal: p.xpTotal, xpSeed: p.enchantmentSeed,
      gameMode: p.gameMode, flying: p.flying, selected: p.inventory.selected,
      inventory: p.inventory.main.map(st), armor: p.inventory.armor.map(st),
      spawn: [p.spawnX, p.spawnY, p.spawnZ],
      respawn: p.respawnPos ? [...p.respawnPos, p.respawnForced ? 1 : 0] : null,
      advancements: this.advancements.save(),
      recipeBook: this.recipeBook.save(),
      dead: p.health <= 0,
      effects: p.saveEffects(),
      vehicle: p.vehicle ? saveEntity(p.vehicle) : null,
      dimension: this.world.dim.id,
    };
    m.portals = this.portalPoi.save();
    const list = [];
    for (const c of this.world.chunks.values()) {
      if (!c.modified) continue;
      const sc = serializeChunk(m.id, c, this.world.chunkBlockEntities(c.cx, c.cz).map((b) => b.save()), this.world.dim.storage);
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
    return chunkKey(this.meta!.id, cx, cz, this.world.dim.storage);
  }

  /** vanilla LevelChunk.postProcessGeneration: blocks marked by structures take the shape their neighbours give them */
  private postProcessChunk(c: Chunk): void {
    if (!c.postProcess) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!this.world.getChunk(c.cx + dx, c.cz + dz)) return;
    const t = c.postProcess;
    c.postProcess = null;
    for (let i = 0; i < t.length; i += 3) {
      const x = c.cx * 16 + t[i], y = t[i + 1], z = c.cz * 16 + t[i + 2];
      const st = this.world.getState(x, y, z);
      if (!hasShapeUpdates(st)) continue;
      const nu = updateShape(this.world, x, y, z, st);
      if (nu && nu !== st) this.world.setState(x, y, z, nu);
    }
  }

  /** a chunk became available: restore its saved entities or run chunk-generation spawning */
  private chunkEntitiesLoaded(c: Chunk): void {
    if (!this.meta || !this.level) return;
    // springs and other generated fluids start flowing (vanilla post-processing)
    if (c.fluidTicks) {
      const t = c.fluidTicks;
      c.fluidTicks = null;
      for (let i = 0; i < t.length; i += 3) {
        const x = c.cx * 16 + t[i], y = t[i + 1], z = c.cz * 16 + t[i + 2];
        const f = FLAGS[this.world.getState(x, y, z)];
        if (f & (F_WATER | F_LAVA)) this.level.scheduleTick(x, y, z, f & F_LAVA ? (this.world.dim.ultraWarm ? 10 : 30) : 5);
      }
    }
    // structure fences connect to what's around them, once the chunks around are there too (vanilla
    // postProcessGeneration runs as a chunk starts ticking, with its neighbours loaded)
    this.postProcessChunk(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.world.getChunk(c.cx + dx, c.cz + dz);
      if (n?.postProcess) this.postProcessChunk(n);
    }
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
    } else {
      // a new chunk: its structure entities, then the chunk-generation animals
      if (c.genEntities) {
        for (const d of c.genEntities) {
          const e = loadEntity(d, lvl);
          if (e) lvl.addEntity(e);
        }
        this.entityDirty.add(key);
      }
      if (this.spawner?.spawnForNewChunk(c.cx, c.cz).length) this.entityDirty.add(key);
    }
    c.genEntities = null;
  }

  private entitiesIn(cx: number, cz: number): Entity[] {
    return this.level.entities.filter((e) => !e.removed && isChunkSaved(e) && Math.floor(e.x) >> 4 === cx && Math.floor(e.z) >> 4 === cz);
  }

  private unloadChunkEntities(c: Chunk): void {
    if (!this.meta || !this.level) return;
    const key = this.entityChunkKey(c.cx, c.cz);
    const list = this.entitiesIn(c.cx, c.cz);
    // serialized before removal (a removed entity saves as nothing)
    const saved = list.map(saveEntity).filter((d) => d !== null);
    // projectiles and orbs in unloaded chunks are dropped
    for (const e of this.level.entities) if (e !== this.player && !e.removed && Math.floor(e.x) >> 4 === c.cx && Math.floor(e.z) >> 4 === c.cz) e.remove();
    if (this.meta.transient || this.entityLoading.has(key)) return;
    if (!list.length && !this.entityKeys.has(key) && !this.entityDirty.has(key)) return;
    const rec: SavedEntityChunk = { key, entities: saved };
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
    this.tutorial.stop();
    this.toasts.clear();
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
      if (src === 'fall' || src === 'stalagmite') return;
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

  containerScreenFactory: ((menu: InventoryMenu | CraftingMenu | FurnaceMenu | ChestMenu | EnchantmentMenu | AnvilMenu | GrindstoneMenu) => Screen) | null = null;

  /** right-clicked a block with a menu */
  openContainer(kind: string, x: number, y: number, z: number): void {
    if (!this.containerScreenFactory) return;
    const p = this.player;
    if (kind === 'crafting_table') this.setScreen(this.containerScreenFactory(new CraftingMenu(p, [x, y, z])));
    else if (kind === 'furnace' || kind === 'smoker' || kind === 'blast_furnace') {
      const be = this.world.getBlockEntity(x, y, z);
      if (be instanceof FurnaceBlockEntity) this.setScreen(this.containerScreenFactory(new FurnaceMenu(p, be)));
    } else if (kind === 'chest') {
      const be = this.world.getBlockEntity(x, y, z);
      if (!(be instanceof ChestBlockEntity)) return;
      // a solid block above keeps the lid shut (vanilla ChestBlock.isChestBlockedAt)
      if (FLAGS[this.world.getState(x, y + 1, z)] & F_OPAQUE) return;
      be.unpackLoot();
      this.setScreen(this.containerScreenFactory(new ChestMenu(p, be)));
      if (be.openCount++ === 0) this.sound.play('block.chest.open', x + 0.5, y + 0.5, z + 0.5, 0.5, Math.random() * 0.1 + 0.9);
    } else if (kind === 'barrel') {
      // vanilla BarrelBlock.useWithoutItem: a chest's menu, titled Barrel; the lid opens
      const be = this.world.getBlockEntity(x, y, z);
      if (!(be instanceof BarrelBlockEntity)) return;
      be.unpackLoot();
      this.setScreen(this.containerScreenFactory(new ChestMenu(p, be, 'Barrel')));
      be.startOpen(this.level);
    } else if (kind === 'enchanting_table') {
      const m = new EnchantmentMenu(p, [x, y, z]);
      m.onEnchanted = () => this.advancements.trigger('enchanted_item');
      this.setScreen(this.containerScreenFactory(m));
    } else if (kind.endsWith('anvil')) this.setScreen(this.containerScreenFactory(new AnvilMenu(p, [x, y, z])));
    else if (kind === 'grindstone') this.setScreen(this.containerScreenFactory(new GrindstoneMenu(p, [x, y, z])));
    // (cartography_table, loom, stonecutter, smithing_table, brewing_stand and a lectern's book come here too, from
    // game/villageBlocks: their screens are still to come)
  }

  /** right-clicked a chest minecart or chest boat (vanilla ContainerEntity.interactWithContainerVehicle: no sound, no lid) */
  openEntityContainer(e: MinecartChest | ChestBoat): void {
    if (!this.containerScreenFactory) return;
    e.unpackLoot();
    this.setScreen(this.containerScreenFactory(new ChestMenu(this.player, e, entityDisplayName(e))));
  }

  /** chest closed (called by the chest screen) */
  chestClosed(be: ChestBlockEntity): void {
    if (be instanceof BarrelBlockEntity) return be.stopOpen(this.level);
    be.openCount = Math.max(0, be.openCount - 1);
    if (be.openCount === 0) this.sound.play('block.chest.close', be.x + 0.5, be.y + 0.5, be.z + 0.5, 0.5, Math.random() * 0.1 + 0.9);
  }

  private guiEntity: GuiEntityRenderer | null = null;

  /** options: Skin Customization, as the player model shows it */
  private skinParts(): SkinParts {
    const o = this.opts;
    return { hat: o.skinHat, jacket: o.skinJacket, leftSleeve: o.skinLeftSleeve, rightSleeve: o.skinRightSleeve, leftPants: o.skinLeftPants, rightPants: o.skinRightPants };
  }

  /** vanilla InventoryScreen.renderEntityInInventoryFollowsMouse */
  renderEntityInInventory(g: GuiGraphics, x1: number, y1: number, x2: number, y2: number, scale: number, yOffset: number, mx: number, my: number): void {
    this.guiEntity ??= new GuiEntityRenderer(this.gl, this.renderer.batch, this.renderer.entities);
    const c = this.guiEntity.render(this.player, { shadows: false, drawPlayer: true, distanceScale: 1, skinParts: this.skinParts(), mainArm: this.opts.mainHand }, g.scale, x1, y1, x2, y2, scale, yOffset, mx, my);
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
      case 'badRespawnPoint':
        return `${n} was killed by [Intentional Game Design]`;
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
      case 'lightningBolt':
        return `${n} was struck by lightning`;
      case 'inWall':
        return `${n} suffocated in a wall`;
      case 'cactus':
        return `${n} was pricked to death`;
      case 'sweetBerryBush':
        return `${n} was poked to death by a sweet berry bush`;
      case 'genericKill':
        return `${n} was killed`;
      case 'magic':
        return `${n} was killed by magic`;
      case 'wither':
        return `${n} withered away`;
      case 'stalagmite':
        return `${n} was impaled on a stalagmite`;
      case 'fallingStalactite':
        return `${n} was skewered by a falling stalactite`;
      case 'anvil':
        return `${n} was squashed by a falling anvil`;
      case 'fallingBlock':
        return `${n} was squashed by a falling block`;
      case 'thorns':
        return `${n} was killed while trying to hurt ${kn}`;
      default:
        return `${n} died`;
    }
  }

  /** vanilla Player.dropEquipment: curse of vanishing items are destroyed, then Inventory.dropAll flings every stack */
  private dropAllItems(): void {
    const p = this.player;
    const inv = p.inventory;
    const drop = (s: ItemStack | null) => {
      if (!s || hasVanishing(s)) return;
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
    drop(inv.offhand);
    inv.offhand = null;
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
    // vanilla respawns a fresh player: no effects carry over
    p.removeAllEffects();
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
    p.portal = null;
    p.portalCooldown = 0;
    p.spinningEffectIntensity = p.oSpinningEffectIntensity = 0;
    // vanilla PlayerList.respawn: at the bed (facing it) if it's still there and clear
    const place = (g: Game): boolean => {
      const at = findRespawn(g.level, p);
      if (at) g.teleport(at.x, at.y, at.z, at.yaw, 0);
      else {
        if (p.respawnPos) {
          p.respawnPos = null;
          g.chat(MSG.noRespawnBlock);
        }
        g.teleport(p.spawnX + 0.5, p.spawnY, p.spawnZ + 0.5, 0, 0);
      }
      return true;
    };
    if (!this.level.entities.includes(p)) this.level.addEntity(p);
    if (this.world.dim !== OVERWORLD) {
      // the bed (and the world spawn) are in the Overworld: go back there, then find the spot
      const [x, y, z] = p.respawnPos ?? [p.spawnX, p.spawnY, p.spawnZ];
      this.changeDimension(OVERWORLD, x + 0.5, y, z + 0.5, place, false);
      return;
    }
    place(this);
    this.setScreen(null);
  }

  /** hardcore "Spectate World": revive where the player died */
  respawnInPlace(): void {
    const p = this.player;
    p.removeAllEffects();
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
    // vanilla ServerPlayer.teleportTo gets out of any vehicle first (as does respawning)
    this.player.removeVehicle();
    this.player.moveTo(x, y, z, yaw ?? this.player.yaw, pitch ?? this.player.pitch);
    this.player.dx = this.player.dy = this.player.dz = 0;
    this.player.fallDistance = 0;
  }

  // -------------------------------------------------------------------------
  // Dimensions (vanilla ServerPlayer.changeDimension)

  /**
   * Take the player to another dimension: what's loaded here is saved and let go, the player waits at
   * (x, y, z) on the "Loading terrain..." screen until the chunks round there are in, and then `arrive`
   * puts them in place (returning false to wait again, having moved them somewhere else).
   */
  changeDimension(dim: DimensionType, x: number, y: number, z: number, arrive: ((g: Game) => boolean) | null, portal: boolean): void {
    const p = this.player;
    if (p.isSleeping()) p.stopSleepInBed(true);
    p.removeVehicle();
    for (const c of [...this.world.chunks.values()]) {
      this.chunks.onChunkUnloaded?.(c);
      this.world.removeChunk(c.cx, c.cz);
      this.renderer.world.disposeChunk(c.cx, c.cz);
    }
    // (vanilla Minecraft.setLevel stops every sound, the music too; the portal's whoosh comes on arrival)
    this.sound.stopAll();
    this.world.reset(dim);
    this.chunks.reset();
    this.level.resetForDimension();
    this.renderer.particles?.clear();
    this.interaction.hit = null;
    p.moveTo(x, y, z, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    p.fallDistance = 0;
    this.chunks.setCenter(x, z);
    this.arrival = arrive;
    this.spawned = false;
    this.receivingPortal = portal;
    this.setScreen(this.receivingScreenFactory ? this.receivingScreenFactory(portal) : null);
  }

  /**
   * vanilla NetherPortalBlock.getPortalDestination: the other dimension, at this position scaled by 8 (or
   * 1/8), through the nearest portal there within 128 blocks (16 in the Nether), or through a new one
   */
  private portalTravel(bx: number, by: number, bz: number): void {
    const p = this.player, w = this.world;
    if (p.vehicle || p.passengers.length || p.health <= 0) return;
    const st = w.getState(bx, by, bz);
    if (!isPortal(st)) return;
    const from = w.dim, to = from.id === 'the_nether' ? OVERWORLD : THE_NETHER;
    const axis = portalAxis(st);
    // where in its portal the player stands, to come out at the same place in the other
    const rel = relativePortalPosition(portalRectangle(w, bx, by, bz), axis, p.x, p.y, p.z, p.width, p.height);
    const scale = teleportationScale(from, to);
    const BORDER = 29999984;
    const tx = Math.floor(clamp(p.x * scale, -BORDER, BORDER)), ty = Math.floor(p.y), tz = Math.floor(clamp(p.z * scale, -BORDER, BORDER));
    const radius = to.id === 'the_nether' ? 16 : 128;
    const yaw = p.yaw, pitch = p.pitch, vx = p.dx, vy = p.dy, vz = p.dz;
    let target = this.portalPoi.closest(to.id, tx, ty, tz, radius);
    const arrive = (g: Game): boolean => {
      let rect: PortalRect;
      if (target) {
        const [px, py, pz] = target;
        if (!isPortal(g.world.getState(px, py, pz))) {
          // the record of a portal that's not there any more
          g.portalPoi.changed(to.id, px, py, pz, false);
          target = g.portalPoi.closest(to.id, tx, ty, tz, radius);
          const [wx, wy, wz] = target ?? [tx, ty, tz];
          g.player.moveTo(wx + 0.5, wy, wz + 0.5, yaw, pitch);
          g.chunks.setCenter(g.player.x, g.player.z);
          return false;
        }
        rect = portalRectangle(g.world, px, py, pz);
      } else rect = createPortal(g.world, to, tx, ty, tz, axis);
      const exitAxis = portalAxis(g.world.getState(rect.x, rect.y, rect.z));
      const e = portalExit(rect, exitAxis, axis, rel, g.player.width, g.player.height);
      g.player.moveTo(e.x, e.y, e.z, yaw + e.turn, pitch);
      // (the momentum turns with the portal)
      if (e.turn) [g.player.dx, g.player.dy, g.player.dz] = [vz, vy, -vx];
      else [g.player.dx, g.player.dy, g.player.dz] = [vx, vy, vz];
      g.player.portalCooldown = g.player.dimensionChangingDelay();
      g.sound.playUI('block.portal.travel', 0.25, Math.random() * 0.4 + 0.8);
      g.onChangedDimension(from, to);
      return true;
    };
    const [wx, wy, wz] = target ?? [tx, ty, tz];
    this.leftOverworldAt = from.id === 'overworld' ? [p.x, p.z] : null;
    this.changeDimension(to, wx + 0.5, wy, wz + 0.5, arrive, true);
  }

  /** the player arrived in another dimension (vanilla ServerPlayer.triggerDimensionChangeTriggers) */
  private onChangedDimension(from: DimensionType, to: DimensionType): void {
    const p = this.player;
    this.advancements.trigger('changed_dimension', { dimension: { from: from.id, to: to.id } });
    if (from.id === 'the_nether' && to.id === 'overworld' && this.enteredNetherAt)
      this.advancements.trigger('nether_travel', { netherTravel: Math.hypot(p.x - this.enteredNetherAt[0], p.z - this.enteredNetherAt[1]) });
    if (to.id === 'the_nether' && from.id === 'overworld') this.enteredNetherAt = this.leftOverworldAt;
    else if (to.id !== 'the_nether') this.enteredNetherAt = null;
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
      // vanilla Entity.turn: last tick's angles turn too (a rider's view lerps between ticks), and a
      // boat clamps how far its riders look round
      const p = this.player, dyaw = mx * k * 0.15, dpitch = my * k * 0.15 * (this.opts.invertMouse ? -1 : 1);
      p.yaw += dyaw;
      p.yawO += dyaw;
      p.pitch = clamp(p.pitch + dpitch, -90, 90);
      p.pitchO = clamp(p.pitchO + dpitch, -90, 90);
      if ((mx || my) && p.vehicle) p.vehicle.onPassengerTurned(p);
      if (mx || my) this.tutorial.onMouse(mx * k, my * k);
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
      // (the loading screen's portal swirl keeps turning)
      this.atlas.tick();
      // (the world spawn is looked for in the Overworld only)
      if (this.spawnSearch && this.world.dim === OVERWORLD) {
        if (this.findSpawn()) this.spawnSearch = false;
        else return;
      }
      if (this.chunks.isReady(this.player.x, this.player.z, 2)) {
        if (this.arrival) {
          if (!this.arrival(this)) return;
          this.arrival = null;
        }
        this.spawned = true;
        this.receivingPortal = false;
        if (!this.joined) this.tutorial.start();
        this.joined = true;
        if (this.screen) this.setScreen(null);
        this.input.lock();
      } else return;
    }
    const inp = this.input;
    const p = this.player;
    // vanilla Minecraft.tick: asleep → the in-bed chat screen; woken → close it
    if (!this.screen && p.isSleeping() && p.health > 0 && this.inBedScreenFactory) this.setScreen(this.inBedScreenFactory());
    else if (this.screen && (this.screen as { inBed?: boolean }).inBed && !p.isSleeping()) (this.screen as unknown as { onPlayerWokeUp(): void }).onPlayerWokeUp();
    // vanilla LocalPlayer.handleConfusionTransitionEffect: standing in a portal closes whatever's open (not the pause or death screens)
    if (p.portal?.inside && this.screen && !this.screen.isPauseScreen() && p.health > 0) {
      (this.screen as { onClose?(): void }).onClose?.();
      if (this.screen) this.setScreen(null);
    }
    this.screen?.tick();
    const noScreen = !this.screen;
    for (const code of inp.pressed()) {
      if (!noScreen) continue;
      if (code === KEYS.debug) this.showDebug = !this.showDebug;
      else if (code === KEYS.hideGui) this.hideGui = !this.hideGui;
      else if (code === KEYS.togglePerspective) this.thirdPerson = (this.thirdPerson + 1) % 3;
      else if (code === KEYS.drop) this.interaction.drop(inp.isDown('ControlLeft') || inp.isDown('MetaLeft'));
      else if (code === KEYS.swapHands) this.interaction.swapHands();
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
    this.tickProgress();
    this.ambient?.tick(p.x, p.y, p.z);
    this.ambient?.tickRain(p.x, p.y + p.eyeHeight, p.z, this.opts.graphics >= 1);
    if (this.freezeTime) this.level.dayTime--;
    if (p.y < this.world.dim.minY - 64 && p.health > 0) p.hurt(4, 'void');
    this.atlas.tick();
    this.renderer.lightmap.tick();
    this.renderer.hand.tick(p);
    this.renderer.particles?.tick();
    this.renderer.entities.tickPickups();
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
      if (this.inWorld && this.receivingPortal) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.overlay.renderScreenSprite('nether_portal', 1, this.canvas.width, this.canvas.height);
      } else if (this.panorama && this.panorama.state === 'ready') this.panorama.render(this.panoramaFade);
      else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      if (this.screen) this.screen.render(g, this.mouseX, this.mouseY, partial);
      this.toasts.render(g);
      this.applyBlur();
      return;
    }
    this.renderWorld(partial);
    if (!this.hideGui) this.hud.render(g, this, partial, !!this.screen && (this.screen as { isChat?: boolean }).isChat === true);
    if (this.screen) this.screen.render(g, this.mouseX, this.mouseY, partial);
    // vanilla GameRenderer: toasts over everything, hidden with F1
    if (!this.hideGui) this.toasts.render(g);
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
    applyNausea(bob, p, partial, this.ticks, this.opts.screenEffectScale);
    let fov = this.opts.fov * (this.fovModO + (this.fovMod - this.fovModO) * partial);
    const eyeFluid = this.cameraFluid(ex, ey, ez);
    if (eyeFluid === FLUID_WATER) fov *= 0.85714287;
    if (p.health <= 0) {
      const f = Math.min(p.deathTime + partial, 20);
      fov /= (1 - 500 / (f + 500)) * 2 + 1;
    }
    let cx = ex, cy = ey, cz = ez;
    // vanilla LocalPlayer.getViewYRot: a rider's view turns smoothly with the vehicle
    let yaw = p.vehicle ? p.yawO + (p.yaw - p.yawO) * partial : p.yaw, pitch = p.pitch;
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
    const biome = this.world.getBiome3(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
    const b = BIOMES[biome];
    const w = this.world;
    this.renderer.hand.netherLighting = w.dim.effects.constantAmbientLight;
    this.renderer.render(cam, {
      dayTime: this.level.dayTime,
      ticks: this.ticks,
      partial,
      weather: { rain: this.level.rainLevel(partial), thunder: this.level.thunderLevel(partial), flash: this.level.skyFlash },
      biome,
      gamma: this.opts.gamma,
      nightVision: nightVisionScale(p, partial),
      blindness: blindnessFog(p, Math.max(this.opts.renderDistance * 16, 32)),
      bob: camOverride ? null : bob,
      underwater: eyeFluid === FLUID_WATER,
      waterFogColor: [((b.waterFog >> 16) & 255) / 255, ((b.waterFog >> 8) & 255) / 255, (b.waterFog & 255) / 255],
      lava: eyeFluid !== FLUID_LAVA ? null : p.gameMode === 'spectator' ? 'spectator' : p.hasEffect('fire_resistance') ? 'fire_resistant' : 'normal',
      dim: w.dim,
      biomeColors: blendBiomeColors(cam.x, cam.y, cam.z, (qx, qy, qz) => BIOMES[w.getBiome3(qx * 4 + 2, qy * 4 + 2, qz * 4 + 2)] ?? b),
      level: this.level,
      entityOptions: { shadows: this.opts.entityShadows, drawPlayer: this.thirdPerson > 0 && !camOverride, distanceScale: this.opts.entityDistanceScaling, skinParts: this.skinParts(), mainArm: this.opts.mainHand },
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
    return skyDarkenInt(timeOfDay(this.level.skyTime()), { rain: this.level.rainLevel(1), thunder: this.level.thunderLevel(1), flash: 0 });
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
      this.renderer.hand.render(this.renderer.batch, p, partial, this.canvas.width, this.canvas.height, hf, handBob, (l & 15) * 16, (l >> 4) * 16, this.renderer.viewRot, this.opts.mainHand);
    }
    if (this.thirdPerson === 0 && p.isOnFire() && p.gameMode !== 'spectator') {
      this.renderer.entities.renderScreenFire(this.renderer.batch, this.canvas.width, this.canvas.height, 70, this.level.gameTime);
    }
    if (this.opts.fancy && !this.hideGui) this.overlay.renderVignette(this.gui.sprites.get('vignette'), this.hud.vignetteBrightness, this.canvas.width, this.canvas.height);
    // vanilla Gui.renderPortalOverlay: the portal's swirl fades in over the screen while standing in one
    const spin = p.oSpinningEffectIntensity + (p.spinningEffectIntensity - p.oSpinningEffectIntensity) * partial;
    if (spin > 0 && !this.hideGui && !p.hasEffect('nausea')) {
      let a = spin;
      if (a < 1) {
        a *= a;
        a *= a;
        a = a * 0.8 + 0.2;
      }
      this.overlay.renderScreenSprite('nether_portal', a, this.canvas.width, this.canvas.height);
    }
  }

  private cameraFluid(x: number, y: number, z: number): number {
    const st = this.world.getState(Math.floor(x), Math.floor(y), Math.floor(z));
    if (FLAGS[st] & F_WATER) {
      const h = Math.floor(y) + fluidHeight(this.world, Math.floor(x), Math.floor(y), Math.floor(z), FLUID_WATER);
      if (y < h) return FLUID_WATER;
    }
    if (FLAGS[st] & F_LAVA) {
      const h = Math.floor(y) + fluidHeight(this.world, Math.floor(x), Math.floor(y), Math.floor(z), FLUID_LAVA);
      if (y <= h) return FLUID_LAVA;
    }
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

  inventoryItemIds(): Set<string> {
    const inv = this.player.inventory;
    const out = new Set<string>();
    for (const s of [...inv.main, ...inv.armor, inv.offhand]) if (s && s.count > 0) out.add(s.item.id);
    return out;
  }

  /** vanilla ClientAdvancements: toast + chat announcement for a finished advancement */
  private onAdvancement(a: AdvancementDef): void {
    if (a.toast !== false) this.toasts.add(new AdvancementToast(a.title, a.frame, a.icon));
    if (a.announce !== false && this.level.gameRules.announceAdvancements) this.chat(announcement(this.playerName, a));
  }

  /** vanilla RecipeToast.addOrUpdate for each newly unlocked recipe */
  private onRecipesUnlocked(rs: BookRecipe[]): void {
    for (const r of rs) {
      const symbol = r.type === 'crafting' ? 'crafting_table' : r.type;
      const t = this.toasts.get<RecipeToast>('recipe');
      if (t) t.addItem(r.result, symbol);
      else this.toasts.add(new RecipeToast(r.result, symbol));
    }
  }

  /** wire player progress (advancements, recipes, tutorial) to world events */
  private hookProgress(): void {
    this.advancements.onAward = (a) => this.onAdvancement(a);
    this.recipeBook.onUnlock = (rs) => this.onRecipesUnlocked(rs);
    this.lastInvVersion = -1;
    const lvl = this.level;
    lvl.onEntityDied = (victim, source, attacker) => {
      const p = this.player;
      if (victim === p) {
        if (p.killer instanceof LivingEntity && p.killer !== p) this.advancements.trigger('killed_by');
        return;
      }
      // vanilla getKillCredit: whoever hurt it last (the player, within 100 ticks)
      const credit = victim.lastHurtByPlayer === p || attacker === p;
      if (!credit || !(victim instanceof LivingEntity)) return;
      const killed = { type: victim.type, hostile: victim instanceof Monster, distance: Math.sqrt(p.distanceToSqr(victim.x, victim.y, victim.z)), byArrow: source === 'arrow', byFireball: source === 'fireball' };
      this.advancements.trigger('kill', { killed });
      this.advancements.trigger('sniper', { killed });
      this.advancements.trigger('return_to_sender', { killed });
    };
    lvl.onBred = (child, cause) => {
      if (cause === this.player) this.advancements.trigger('breed', { breed: child.type });
    };
    lvl.onPlayerArrowHit = () => this.advancements.trigger('shoot_arrow');
    lvl.onThrownItemPickedUp = (stack, by) => {
      if (by instanceof Piglin && by.isAdult() && isLovedItem(stack)) this.advancements.trigger('distract_piglin', { distract: 'thrown' });
    };
    this.interaction.onInteractedWithEntity = (stack, e) => {
      if (e instanceof Piglin && e.isAdult() && stack?.item.id === 'gold_ingot') this.advancements.trigger('distract_piglin', { distract: 'directly' });
    };
    lvl.onPlayerCrossbowKill = (killed) => this.advancements.trigger('killed_by_crossbow', { crossbowKills: killed.map((e) => e.type) });
    this.interaction.onShotCrossbow = () => this.advancements.trigger('shot_crossbow');
    this.interaction.onItemUsed = (hand) => this.renderer.hand.itemUsed(hand);
    this.interaction.onPlaced = (name) => this.advancements.trigger('place', { place: name });
    this.interaction.onConsumed = (id) => this.advancements.trigger('consume', { consume: id });
    this.interaction.onItemDurability = (item, vehicle) => this.advancements.trigger('item_durability', { durability: { item, vehicle } });
    this.interaction.onDestroyProgress = (name, progress) => this.tutorial.onDestroyBlock(name, progress);
  }

  /** per-tick progress checks: inventory contents, location, tutorial */
  private tickProgress(): void {
    const p = this.player;
    const inv = p.inventory;
    if (inv.version !== this.lastInvVersion) {
      this.lastInvVersion = inv.version;
      const ids = this.inventoryItemIds();
      this.recipeBook.checkInventory([...inv.main, ...inv.armor, inv.offhand]);
      this.advancements.trigger('inventory', { inventory: ids });
      this.tutorial.onGetItem(ids);
    }
    if (this.ticks % 20 === 0) {
      const b = BIOMES[this.world.getBiome3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))];
      if (b) this.advancements.trigger('biome', { biome: b.name });
      // vanilla LocationPredicate.inStructure: inside one of the structure's pieces
      if (this.world.dim.id === 'the_nether' && this.level.fortresses().pieceAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) this.advancements.trigger('structure', { structures: ['fortress'] });
    }
    // vanilla trackEnteredOrExitedLavaOnVehicle: how far a mount has carried the player across lava (ride_entity_in_lava)
    const v = p.vehicle;
    if (v?.inLava) {
      if (!this.lavaRideFrom) this.lavaRideFrom = [p.x, p.z];
      else this.advancements.trigger('ride_in_lava', { lavaRide: { vehicle: v.type, distance: Math.hypot(p.x - this.lavaRideFrom[0], p.z - this.lavaRideFrom[1]), dimension: this.world.dim.id } });
    }
    if (this.lavaRideFrom && !v?.inLava) this.lavaRideFrom = null;
    // vanilla fall_from_world_height: from the build limit to the bottom, alive
    if (!p.onGround && !p.flying && p.y >= MAX_Y - 1) this.fallStartY = p.y;
    if (p.onGround || p.flying || p.inWater) {
      if (this.fallStartY !== null && p.y <= MIN_Y + 5 && p.health > 0) this.advancements.trigger('fall_from_height');
      this.fallStartY = null;
    }
    this.tutorial.onInput(p.input.forward || p.input.back || p.input.left || p.input.right || p.input.jump);
    const hit = this.interaction.hit;
    if (hit) this.tutorial.onLookAt(BLOCKS[STATE_BLOCK[hit.state]].name);
    this.tutorial.tick();
  }

  sleepHost(): SleepHost {
    return {
      level: this.level,
      player: this.player,
      overlay: (m) => this.hud.setOverlayMessage(m),
      chat: (m) => this.chat(m),
      onSlept: () => this.advancements.trigger('slept'),
    };
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
