// Game shell: owns renderer, GUI, world, level, player; runs the 20 TPS tick
// loop and per-frame rendering like vanilla's Minecraft.runTick / GameRenderer.

import '../world/blocks';
import { generateBlockTextures } from '../textures/index';
import { Atlas } from '../render/atlas';
import { Renderer, Camera } from '../render/renderer';
import { EndRenderer } from '../render/endRenderer';
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
import { ItemStack, ITEMS } from '../item/item';
import { hasShapeUpdates, updateShape } from './shapeUpdates';
import { MIN_Y, MAX_Y } from '../world/constants';
import { Overlay } from '../render/overlay';
import { isAnim, TexImage } from '../textures/tex';
import { ParticleEngine } from '../render/particles';
import { createFireworks } from '../render/fireworkParticles';
import { GuiGraphics, SpriteSheet, BitmapFont, autoGuiScale } from '../gui/guiGraphics';
import { ItemIcons } from '../gui/itemIcons';
import { Hud } from '../gui/hud';
import type { Screen } from '../gui/screen';
import type { Hand } from '../item/inventory';
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
import type { ContainerMenu } from '../inventory/container';
import { MerchantMenu } from '../inventory/merchantMenu';
import type { Merchant } from '../entity/trading';
import { useBed, BED_YROT, SleepHost } from './sleep';
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
import { nightVisionScale, blindnessFog, darknessVisuals, applyNausea } from '../render/effectVisuals';
import { OVERWORLD, THE_NETHER, THE_END, dimensionById, teleportationScale, type DimensionType } from '../world/dimension';
import { PortalPoi, portalRectangle, relativePortalPosition, portalExit, createPortal, isPortal, portalAxis, type PortalRect } from './portal';
import { setVillageMenuHook } from './villageBlocks';
import { setShulkerBoxMenuHook } from './shulkerBox';
import { tickOuterEndProgress } from './outerEndProgress';
// (trial chambers)
import { tickTrialChamberProgress } from './trialChamberProgress';
import { tickBastionProgress } from './bastions';
import { setGenerateLootListener } from './archaeology';
import { setPotCraftedListener } from './decoratedPot';
import { setNowPlayingListener } from './jukebox';
import { blockMenu, entityContainerMenu, installMenuHooks, setShowMenu, showMenu, type MenuEvents } from './openMenu';
import { deathMessage, dropDeathLoot, resetForRespawn, playerHurtSound, playerFallSound } from './playerDeath';
import { endPortalTravel, PortalArrivals } from './endTravel';
import { EndDragonFight, ARENA_TICKET_LEVEL } from './endDragonFight';
import { gatewayTravel } from './gatewayTravel';
// (the deep dark)
import { setDialViewer } from '../item/compass';
import { respawnArrival, worldSpawnOf, InitialSpawn, WAIT, adjustSpawnLocation } from './respawnLogic';
import { SaveQueue, watchPageLeave, unwatchPageLeave } from './saveOnLeave';
import { savePlayer, loadPlayer } from './playerData';
// (multiplayer)
import { MULTIPLAYER_ENABLED } from '../net/config';
import { HostServer } from '../net/server/hostServer';
import { ClientSession, type GuestIdentity } from '../net/client/clientSession';
import type { LoginInfo } from '../net/protocol';
import { BroadcastHostTransport, BroadcastGuestTransport } from '../net/transport/broadcastChannel';
import { randomId } from '../net/transport/transport';

export type { GameOptions } from './options';
/** vanilla ReceivingLevelScreen.Reason: what the loading screen shows while changing dimension */
export type ReceivingReason = 'nether_portal' | 'end_portal' | 'other';

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
  /** a new world's spawn, being looked for (vanilla MinecraftServer.setInitialSpawn) */
  private spawnSearch: InitialSpawn | null = null;
  private blockImages = new Map<string, TexImage>();
  private savedKeys = new Set<string>();
  private autosaveTimer = 0;
  /** saves never overlap: one asked for while another is being written runs once that one's done */
  private readonly saves = new SaveQueue(() => this.writeWorld());
  titleScreenFactory: (() => Screen) | null = null;
  pauseScreenFactory: (() => Screen) | null = null;
  deathScreenFactory: (() => Screen) | null = null;
  loadingScreenFactory: (() => Screen) | null = null;
  /** (browser) the paused wait for a click that lets the page grab the mouse again */
  resumeScreenFactory: (() => Screen) | null = null;
  /** vanilla GenericMessageScreen ("Reading world data...", "Saving world") */
  messageScreenFactory: ((title: string) => Screen) | null = null;
  /** vanilla ReceivingLevelScreen, shown while changing dimension */
  receivingScreenFactory: ((reason: ReceivingReason) => Screen) | null = null;
  /** vanilla WinScreen: the End Poem and the credits, `onFinished` once they're over or skipped */
  winScreenFactory: ((onFinished: () => void) => Screen) | null = null;
  /** nether portal blocks in every dimension (vanilla POI records) */
  readonly portalPoi = new PortalPoi();
  /** what went through an end portal to the dimension that isn't loaded (game/endTravel.ts) */
  readonly arrivals = new PortalArrivals();
  /** after a change of dimension: puts the player in place once the chunks are in (false: wait some more) */
  private arrival: ((g: Game) => boolean) | null = null;
  /** the loading screen shows the nether portal's swirl or the end portal's starfield */
  private receivingPortal: ReceivingReason | null = null;
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
  /**
   * (multiplayer) vanilla: a world of our own ('single'), ours open to guests in other windows ('host', HostServer),
   * or another window's that we joined ('client', ClientSession)
   */
  mode: 'single' | 'host' | 'client' = 'single';
  server: HostServer | null = null;
  client: ClientSession | null = null;
  /** vanilla ConnectScreen ("Connecting to the server...", with a Cancel) */
  connectingScreenFactory: ((cancel: () => void) => Screen) | null = null;
  /** vanilla DisconnectedScreen: a title, why, and back to the title screen */
  disconnectedScreenFactory: ((title: string, reason: string) => Screen) | null = null;
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
          // (a guest's: the host opens it, as it rides the host's)
          if (this.client && (v instanceof ChestBoat || (v && 'openInventory' in v))) this.client.openVehicleInventory();
          else if (v instanceof ChestBoat) this.openEntityContainer(v);
          // (vanilla HasCustomInventoryScreen: on a horse, its inventory, or nothing if it won't have you)
          else if (v && 'openInventory' in v) (v as Entity & { openInventory(p: Player): void }).openInventory(this.player);
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
      // (the browser keeps the Escape that lets the mouse go to itself: over a screen that holds on to the mouse,
      // like the credits, letting go of it with the page still in front is that Escape)
      const s = this.screen;
      if (!locked && s && (s as { keepsMouse?: boolean }).keepsMouse && s.shouldCloseOnEsc() && document.hasFocus()) s.onClose();
    };
    // the browser refused to grab the mouse (no recent click: an Escape that closed a screen isn't one): wait, paused,
    // for a click on the world to grab it
    inp.onLockError = () => {
      if (this.inWorld && this.spawned && !this.screen && !inp.forceLocked) {
        if (this.resumeScreenFactory) this.setScreen(this.resumeScreenFactory());
        else this.openPause();
      }
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

  /**
   * `login` (multiplayer): the world is another window's, as its host let us in (joinWorld): a transient copy,
   * made of what the host sends, nothing generated or saved here
   */
  async startWorld(meta: WorldMeta, login?: LoginInfo): Promise<void> {
    // vanilla WorldOpenFlows: a message at once while the save is read and the workers start, then LevelLoadingScreen
    if (!this.inWorld && this.messageScreenFactory) this.setScreen(this.messageScreenFactory(meta.player ? 'Reading world data...' : 'Preparing for world creation...'));
    this.meta = meta;
    // (the browser asked to keep the saves; the world saved as its page goes away, game/saveOnLeave.ts)
    watchPageLeave(this);
    await this.startWorkers(meta.seed);
    this.savedKeys = login ? new Set() : await savedChunkKeys(meta.id);
    this.entityKeys = meta.transient ? new Set() : await entityChunkKeys(meta.id);
    this.setUpWorld(meta, login);
  }

  /** the chunk workers, started afresh for a world (generating with its seed) */
  private async startWorkers(seed: string): Promise<void> {
    const workers = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
    this.pool?.terminate();
    this.pool = new WorkerPool(workers, seed, this.atlas.sprites);
    await this.pool.ready;
  }

  /** (startWorld, once the workers are up and the save's keys read; joinWorld, as the host lets us in) */
  private setUpWorld(meta: WorldMeta, login?: LoginInfo): void {
    this.entityDirty.clear();
    this.entityLoading.clear();
    this.world = new World();
    this.world.dim = dimensionById(login ? login.dimension : meta.player && !meta.player.dead ? meta.player.dimension : 'overworld');
    this.portalPoi.load(meta.portals);
    this.arrivals.load(meta.arrivals);
    this.world.onPortalChanged = (x, y, z, present) => this.portalPoi.changed(this.world.dim.id, x, y, z, present);
    this.arrival = null;
    this.receivingPortal = null;
    this.joined = false;
    this.renderer.world.meshes.forEach((_m, k) => this.renderer.world.dispose(k));
    this.chunks = new ChunkManager(this.world, this.pool!, this.renderer.world);
    this.chunks.renderDistance = this.opts.renderDistance;
    this.chunks.smoothLighting = this.opts.smoothLighting;
    this.chunks.fancyLeaves = this.opts.fancy;
    this.chunks.remote = !!login;
    this.chunks.savedLoader = login ? null : (cx, cz) => this.loadSavedChunk(cx, cz);
    this.chunks.onChunkLoaded = login ? (c) => this.client?.chunkReady(c.cx, c.cz) : (c) => this.chunkEntitiesLoaded(c);
    this.chunks.onChunkUnloaded = login ? null : (c) => {
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
    this.level.isClientSide = !!login;
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
    // (Stage 4: raids)
    this.level.raids.load(meta.raids);
    this.worldSpawn = meta.worldSpawn ?? null;
    this.level.sound = this.sound;
    if (!login) this.attachDragonFight();
    this.player = new Player(this.level);
    this.player.setGameMode(meta.gameMode as GameMode);
    this.player.food.difficulty = this.level.difficulty;
    this.level.player = this.player;
    // (a guest's level takes no entities of its own: its player is put in as the host's are)
    if (login) this.level.addMirrorEntity(this.player);
    else this.level.addEntity(this.player);
    this.interaction = new Interaction(this.level, this.player);
    this.interaction.onOpenContainer = (kind, x, y, z) => this.openContainer(kind, x, y, z);
    setVillageMenuHook((kind, x, y, z, p) => {
      if (p === this.player) return this.openContainer(kind, x, y, z);
      // (a guest's player: its menu, made as the host's own is, and shown to it)
      const m = blockMenu(this.level, p, kind, x, y, z);
      if (m) this.showMenu(p, m);
    });
    // (game/openMenu.ts: the menus of the blocks and entities that aren't opened by name, a shulker box's too)
    setShowMenu((p, menu) => this.showMenu(p, menu));
    installMenuHooks();
    setShulkerBoxMenuHook((menu) => showMenu(menu.player, menu));
    // (the archaeology advancements: a suspicious block's loot rolled for the player, a pot made of four sherds)
    setGenerateLootListener((p, table) => {
      if (p === this.player) this.advancements.trigger('container_loot', { lootTable: table });
    });
    setPotCraftedListener((p, sides) => {
      if (p === this.player) this.advancements.trigger('recipe_crafted', { crafted: { recipe: 'decorated_pot', ingredients: sides } });
    });
    this.interaction.onOpenEntityContainer = (e) => this.openEntityContainer(e);
    this.interaction.onMounted = () => this.hud.setOverlayMessage(`Press ${keyDisplayName(KEYS.sneak)} to Dismount`);
    this.interaction.onUseBed = (x, y, z) => useBed(this.sleepHost(), x, y, z);
    this.level.onOpenMerchant = (v, p) => this.openMerchant(v, p);
    this.level.onPortal = (e, x, y, z, kind) => {
      // (multiplayer: a guest's portals are the host's to take, and stage 1's host doesn't take them)
      if (this.mode === 'client') return;
      if (e.type === 'player' && (e as Player).remote) {
        e.portalCooldown = e.dimensionChangingDelay();
        this.server?.refuse(e as Player, "Portals don't take guests yet.");
        return;
      }
      if (kind === 'end') endPortalTravel(this, e);
      else if (kind === 'end_gateway') {
        // (vanilla enter_block: Remote Getaway)
        if (e === this.player) this.advancements.trigger('enter_block', { enteredBlock: 'end_gateway' });
        gatewayTravel(this.level, e, x, y, z);
      } else if (e === this.player) this.portalTravel(x, y, z);
    };
    this.level.onCuredZombieVillager = (p) => p === this.player && this.advancements.trigger('cured_zombie_villager', { cured: true });
    this.level.onSummonedEntity = (e) => {
      if (e.bb.inflate(5).intersects(this.player.bb)) this.advancements.trigger('summoned_entity', { summoned: e.type });
    };
    // vanilla ClientPacketListener.handleTakeItemEntity: the pop, and what was taken flying to whoever took it
    this.level.onTake = (e, taker) => {
      const r = Math.random;
      if (e instanceof ExperienceOrb) this.level.sound.play('entity.experience_orb.pickup', e.x, e.y, e.z, 0.1, (r() - r()) * 0.35 + 0.9);
      else this.level.sound.play('entity.item.pickup', e.x, e.y, e.z, 0.2, (r() - r()) * 1.4 + 2);
      this.renderer.entities.addPickup(e instanceof ItemEntity ? e.copy() : e, taker);
    };
    // (a guest's drops are the host's to throw: vanilla handleCreativeModeItemDrop)
    this.player.dropHandler = login ? (s) => this.client?.dropCreative(s) : (s) => this.interaction.throwItem(s);
    // (and survival's pick-block from past the hotbar: vanilla ServerboundPickItemPacket)
    if (login) this.interaction.onPickSlot = (slot) => this.client?.pickSlot(slot);
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
      emitAround: (k, e, life) => particles.emitAround(k, e, life),
      fallingDust: (x, y, z, c) => particles.fallingDust(x, y, z, c),
      blockParticle: (x, y, z, xd, yd, zd, st, bx, by, bz) => particles.blockParticle(x, y, z, xd, yd, zd, st, bx, by, bz),
      // (trial chambers)
      dustPillar: (x, y, z, yd, st, bx, by, bz) => particles.dustPillar(x, y, z, yd, st, bx, by, bz),
      entityEffect: (x, y, z, c, a) => particles.entityEffect(x, y, z, c, a),
      dust: (x, y, z, r, g, b, s) => particles.dust(x, y, z, r, g, b, s),
      spell: (k, x, y, z, xd, yd, zd, r, g, b, pw) => particles.spell(k, x, y, z, xd, yd, zd, r, g, b, pw),
      fireworks: (x, y, z, xd, yd, zd, ex) => void createFireworks(particles, this.level, x, y, z, xd, yd, zd, ex),
      vibration: (x, y, z, target, ticks) => particles.sculk.vibration(x, y, z, target, ticks),
      shriek: (x, y, z, delay) => particles.sculk.shriek(x, y, z, delay),
      sculkCharge: (x, y, z, xd, yd, zd, roll) => particles.sculk.sculkCharge(x, y, z, xd, yd, zd, roll),
      dustTransition: (x, y, z, xd, yd, zd, from, to, scale) => particles.sculk.dustTransition(x, y, z, xd, yd, zd, from, to, scale),
    };
    this.spawner = login ? null : new NaturalSpawner(this.level, hashString(meta.seed));
    this.spawner?.traders.load(meta.wanderingTrader);
    this.ambient = new AmbientTicker(this.level);
    this.renderer.weather.tempAt = (biome, x, y, z) => {
      const b = BIOMES[biome];
      return biomeTemperature(b.temperature, !!b.frozen, x, y, z);
    };
    this.hookPlayerSounds();
    this.hud = new Hud();
    // (jukebox) vanilla Gui.setNowPlaying, for a song starting in this level
    setNowPlayingListener((level, description) => level === this.level && this.hud.setNowPlaying(description));
    this.toasts.clear();
    this.advancements = new PlayerAdvancements();
    this.recipeBook = new PlayerRecipeBook();
    this.hookProgress();
    // player data
    const pd = meta.player;
    this.advancements.load(pd?.advancements);
    this.recipeBook.load(pd?.recipeBook);
    if (pd) {
      loadPlayer(this.player, pd);
      this.spawnSearch = null;
      // vanilla RootVehicle: back in the minecart you left the game in
      const v = pd.vehicle && !pd.dead ? loadEntity(pd.vehicle, this.level) : null;
      if (v) {
        this.level.addEntity(v);
        this.player.startRiding(v, true);
      }
      if (pd.dead || pd.health <= 0) {
        // died before quitting: come back respawned, at the bed or near the world spawn once the chunks there are in
        this.player.health = this.player.maxHealth;
        this.player.food.level = 20;
        this.player.food.saturation = 5;
        const [x, y, z] = this.player.respawnPos ?? worldSpawnOf(this);
        this.player.moveTo(x + 0.5, y, z + 0.5, 0, 0);
        this.arrival = respawnArrival();
      }
    } else if (login) {
      // (where the host put us; the host's world spawn, the host's to have found)
      this.spawnSearch = null;
      this.player.moveTo(login.x, login.y, login.z, login.yRot, login.xRot);
    } else {
      // (waiting where the climate says the spawn is, while the chunks round there load)
      this.spawnSearch = new InitialSpawn(meta.seed);
      this.player.moveTo(this.spawnSearch.cx * 16 + 8, 120, this.spawnSearch.cz * 16 + 8, 0, 0);
    }
    this.spawned = false;
    this.inWorld = true;
    this.chunks.setCenter(this.player.x, this.player.z);
    this.autosaveTimer = 0;
    // (vanilla: joining another's world shows ReceivingLevelScreen, "Loading terrain...", till its chunks are here)
    if (login && this.receivingScreenFactory) this.setScreen(this.receivingScreenFactory('other'));
    else if (this.loadingScreenFactory) this.setScreen(this.loadingScreenFactory());
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

  /** a save is being written (the page going away doesn't start another meanwhile) */
  get isSaving(): boolean {
    return this.saves.running;
  }

  saveWorld(): Promise<void> {
    return this.saves.run();
  }

  private async writeWorld(): Promise<void> {
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
    m.player = savePlayer(p, this.world.dim.id, { advancements: this.advancements.save(), recipeBook: this.recipeBook.save() });
    m.portals = this.portalPoi.save();
    m.arrivals = this.arrivals.save();
    if (this.level.dragonFight) m.dragonFight = this.level.dragonFight.save();
    // (Stage 4: raids)
    m.raids = this.level.raids.save();
    if (this.spawner) m.wanderingTrader = this.spawner.traders.save();
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
    // what came through an end portal while this dimension wasn't loaded
    for (const d of this.arrivals.take(this.world, c.cx, c.cz)) {
      const e = loadEntity(d, lvl);
      if (e) lvl.addEntity(e);
      this.entityDirty.add(key);
    }
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

  /** out of the world, saved (unless it's a guest's), to `next` (the title screen if none) */
  async leaveWorld(next: Screen | null = null): Promise<void> {
    if (this.player.isSleeping()) this.player.stopSleepInBed(true);
    // (multiplayer: a guest just leaves, its copy of the world goes unsaved; a host lets its guests go first)
    const guest = this.leaveHost();
    this.stopHosting('The host closed the world.');
    if (!guest) await this.saveWorld();
    this.tutorial.stop();
    this.toasts.clear();
    this.level.entities.length = 0;
    this.inWorld = false;
    unwatchPageLeave();
    this.spawned = false;
    this.pool?.terminate();
    this.pool = null;
    for (const k of [...this.renderer.world.meshes.keys()]) this.renderer.world.dispose(k);
    this.renderer.particles?.clear();
    this.meta = null;
    this.sound.stopAll();
    this.setScreen(next ?? (this.titleScreenFactory ? this.titleScreenFactory() : null));
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
    // (the level's sounds: a host's guests hear its player hurt, land and die, as it hears theirs)
    p.onHurtSound = (pl, src) => playerHurtSound(lvl.sound, pl, src);
    p.onFall = (pl, _dmg, dist) => playerFallSound(lvl.sound, pl, dist);
    p.onDeath = (_pl, source) => {
      lvl.sound.play('entity.player.death', p.x, p.y, p.z, 1, 1);
      const rules = this.level.gameRules;
      if (rules.showDeathMessages) {
        const msg = this.deathMessage(source);
        this.chat(msg);
        this.server?.hostChatted(msg);
      }
      dropDeathLoot(this.level, p);
      if (rules.doImmediateRespawn) {
        setTimeout(() => this.inWorld && this.respawn(), 0);
        return;
      }
      if (this.deathScreenFactory && this.inWorld) this.setScreen(this.deathScreenFactory());
    };
  }

  /** the screen for a menu opened for the game's own player (gui/screens: each kind of menu's own) */
  containerScreenFactory: ((menu: ContainerMenu) => Screen) | null = null;
  /** a book's screen, to write in (a book and quill) or read (a written book), or null for anything else (gui/screens) */
  bookScreenFactory: ((p: Player, stack: ItemStack, hand: Hand) => Screen | null) | null = null;

  /** what opening a menu earns the game's own player (its advancements: game/openMenu.ts) */
  private readonly menuEvents: MenuEvents = {
    loot: (table) => this.advancements.trigger('container_loot', { lootTable: table }),
    brewed: (potion) => this.advancements.trigger('brewed_potion', { potion }),
    enchanted: () => this.advancements.trigger('enchanted_item'),
  };

  /** right-clicked a block with a menu (game/openMenu.ts makes it) */
  openContainer(kind: string, x: number, y: number, z: number): void {
    if (!this.containerScreenFactory) return;
    const m = blockMenu(this.level, this.player, kind, x, y, z, this.menuEvents);
    if (m) this.setScreen(this.containerScreenFactory(m));
  }

  /**
   * (game/openMenu.ts) a menu opened for `p`, a block's or an entity's: the game's own player sees its screen; a guest's
   * player's is shown to its guest (net/server); anyone else's is closed again
   */
  private showMenu(p: Player, menu: ContainerMenu): boolean {
    if (p !== this.player) {
      if (this.server) return this.server.showMenu(p, menu);
      menu.removed();
      return false;
    }
    if (this.containerScreenFactory) this.setScreen(this.containerScreenFactory(menu));
    return true;
  }

  /** a villager started trading with the player (vanilla Merchant.openTradingScreen) */
  openMerchant(v: Merchant, p: Player): void {
    // (a guest's player trades on its guest's screen; its trades earn the host's own player nothing)
    if (p !== this.player) {
      if (this.server) this.server.showMenu(p, new MerchantMenu(p, v));
      else v.stopTrading();
      return;
    }
    if (!this.containerScreenFactory) {
      v.stopTrading();
      return;
    }
    const m = new MerchantMenu(p, v);
    m.onTraded = () => this.advancements.trigger('villager_trade', { tradeY: p.y });
    this.setScreen(this.containerScreenFactory(m));
  }

  /** right-clicked a chest minecart or chest boat (vanilla ContainerEntity.interactWithContainerVehicle: no sound, no lid) */
  openEntityContainer(e: MinecartChest | ChestBoat): void {
    if (!this.containerScreenFactory) return;
    this.setScreen(this.containerScreenFactory(entityContainerMenu(this.level, this.player, e)));
  }

  private guiEntity: GuiEntityRenderer | null = null;

  /** options: Skin Customization, as the player model shows it */
  private skinParts(): SkinParts {
    const o = this.opts;
    return { hat: o.skinHat, jacket: o.skinJacket, leftSleeve: o.skinLeftSleeve, rightSleeve: o.skinRightSleeve, leftPants: o.skinLeftPants, rightPants: o.skinRightPants };
  }

  /** vanilla InventoryScreen.renderEntityInInventoryFollowsMouse */
  renderEntityInInventory(g: GuiGraphics, x1: number, y1: number, x2: number, y2: number, scale: number, yOffset: number, mx: number, my: number, e: LivingEntity = this.player): void {
    this.guiEntity ??= new GuiEntityRenderer(this.gl, this.renderer.batch, this.renderer.entities);
    const c = this.guiEntity.render(e, { shadows: false, drawPlayer: true, distanceScale: 1, skinParts: this.skinParts(), mainArm: this.opts.mainHand }, g.scale, x1, y1, x2, y2, scale, yOffset, mx, my);
    const ctx = g.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const t = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, t.e, t.f);
    ctx.drawImage(c, Math.round(x1 * g.scale), Math.round(y1 * g.scale));
    ctx.restore();
  }

  /** vanilla combat tracker death messages (the player's, or a tame animal's for its owner): game/playerDeath.ts */
  deathMessage(source: string, victim: LivingEntity = this.player, n = this.playerName): string {
    return deathMessage(source, victim, n);
  }

  /** (a guest) how our player died, as the host said */
  private hostDeathMessage = '';

  /** what the death screen says: how the player died (a guest's, as the host said) */
  deathCause(): string {
    return this.client ? this.hostDeathMessage : this.deathMessage(this.player.lastDamageSource);
  }

  applyGameRules(): void {
    const r = this.level.gameRules;
    this.level.doDaylightCycle = !!r.doDaylightCycle;
    this.level.randomTicks.speed = Number(r.randomTickSpeed);
    this.player.food.naturalRegen = !!r.naturalRegeneration;
  }

  respawn(): void {
    // (a guest asks the host, which says where: vanilla ClientCommand PERFORM_RESPAWN)
    if (this.client) return this.client.respawn();
    const p = this.player;
    resetForRespawn(p, !!this.level.gameRules.keepInventory);
    // vanilla PlayerList.respawn: at the bed (facing it) if it's still there and clear, else somewhere free near the
    // world spawn (game/respawnLogic), decided once the chunks there are in
    const place = respawnArrival();
    if (!this.level.entities.includes(p)) this.level.addEntity(p);
    const [x, y, z] = p.respawnPos ?? worldSpawnOf(this);
    if (this.world.dim !== OVERWORLD) {
      // the bed (and the world spawn) are in the Overworld: go back there, then find the spot
      this.changeDimension(OVERWORLD, x + 0.5, y, z + 0.5, place, false);
      return;
    }
    this.setScreen(null);
    if (!this.chunks.isReady(x + 0.5, z + 0.5, 2)) p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
    else if (place(this)) return;
    // ("Loading terrain..." till they are, the player held still there)
    p.dx = p.dy = p.dz = 0;
    this.chunks.setCenter(p.x, p.z);
    this.arrival = place;
    this.spawned = false;
    this.receivingPortal = null;
    this.setScreen(this.receivingScreenFactory ? this.receivingScreenFactory('other') : null);
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
   * puts them in place (returning false to wait again, having moved them somewhere else). `portal`: the
   * player goes alive (through a portal, or teleported), not respawning — the loading screen then shows the
   * nether portal's swirl to or from the Nether, the end portal's starfield to or from the End (vanilla
   * ClientPacketListener.determineLevelLoadingReason).
   */
  changeDimension(dim: DimensionType, x: number, y: number, z: number, arrive: ((g: Game) => boolean) | null, portal: boolean): void {
    const p = this.player;
    const from = this.world.dim.id, to = dim.id;
    const reason: ReceivingReason = !portal ? 'other' : from === 'the_nether' || to === 'the_nether' ? 'nether_portal' : from === 'the_end' || to === 'the_end' ? 'end_portal' : 'other';
    // (multiplayer, stage 1: one dimension a host, so its guests can't follow)
    this.stopHosting("The host went to another dimension, where guests can't follow yet.");
    if (p.isSleeping()) p.stopSleepInBed(true);
    p.removeVehicle();
    for (const c of [...this.world.chunks.values()]) {
      this.chunks.onChunkUnloaded?.(c);
      this.world.removeChunk(c.cx, c.cz);
      this.renderer.world.disposeChunk(c.cx, c.cz);
    }
    // (vanilla Minecraft.setLevel stops every sound, the music too; the portal's whoosh comes on arrival)
    this.sound.stopAll();
    if (this.level.dragonFight && this.meta) this.meta.dragonFight = this.level.dragonFight.save();
    this.world.reset(dim);
    this.chunks.reset();
    this.level.resetForDimension();
    this.attachDragonFight();
    this.renderer.particles?.clear();
    this.interaction.hit = null;
    p.moveTo(x, y, z, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    p.fallDistance = 0;
    this.chunks.setCenter(x, z);
    this.arrival = arrive;
    this.spawned = false;
    this.receivingPortal = reason === 'other' ? null : reason;
    this.setScreen(this.receivingScreenFactory ? this.receivingScreenFactory(reason) : null);
  }

  /** vanilla ServerLevel: the End has its dragon fight (saved with the world), nowhere else does */
  private attachDragonFight(): void {
    const f = this.world.dim === THE_END ? new EndDragonFight(this.level, this.meta?.dragonFight ?? null) : null;
    if (f) f.onDragonSummoned = (_d, p) => p === this.player && this.advancements.trigger('summoned_entity', { summoned: 'ender_dragon' });
    this.level.dragonFight = f;
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
  onChangedDimension(from: DimensionType, to: DimensionType): void {
    const p = this.player;
    this.advancements.trigger('changed_dimension', { dimension: { from: from.id, to: to.id } });
    if (from.id === 'the_nether' && to.id === 'overworld' && this.enteredNetherAt)
      this.advancements.trigger('nether_travel', { netherTravel: Math.hypot(p.x - this.enteredNetherAt[0], p.z - this.enteredNetherAt[1]) });
    if (to.id === 'the_nether' && from.id === 'overworld') this.enteredNetherAt = this.leftOverworldAt;
    else if (to.id !== 'the_nether') this.enteredNetherAt = null;
  }

  /** vanilla MinecraftServer.setInitialSpawn, as the chunks it looks in come in (game/respawnLogic InitialSpawn) */
  private findSpawn(): boolean {
    const s = this.spawnSearch!;
    const pos = s.next(this.level);
    // (the chunk it has come to, kept loaded however far out it is)
    this.chunks.setTicket('spawn', pos === WAIT ? [s.need[0], s.need[1], 1] : null);
    if (pos === WAIT) return false;
    this.worldSpawn = pos;
    [this.player.spawnX, this.player.spawnY, this.player.spawnZ] = pos;
    this.player.moveTo(pos[0] + 0.5, pos[1], pos[2] + 0.5, 0, 0);
    // vanilla ServerPlayer's constructor: a new player starts somewhere free near the world spawn
    this.arrival = respawnArrival();
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
    // (vanilla Minecraft.isPaused: only a world of our own that isn't open to LAN pauses; a guest's never does)
    return !!this.screen && this.screen.isPauseScreen() && this.inWorld && this.spawned && this.mode === 'single';
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
    // (multiplayer: a guest hears the host before anything, the login and the world's first chunks included)
    const client = this.client;
    client?.receive();
    if (!this.inWorld) return client?.sendTick();
    if (!this.spawned) {
      // (the loading screen's portal swirl keeps turning)
      this.atlas.tick();
      // (the world spawn is looked for in the Overworld only)
      if (this.spawnSearch && this.world.dim === OVERWORLD) {
        if (this.findSpawn()) this.spawnSearch = null;
        else return;
      }
      if (this.chunks.isReady(this.player.x, this.player.z, 2)) {
        if (this.arrival) {
          if (!this.arrival(this)) return;
          this.arrival = null;
        }
        this.spawned = true;
        this.receivingPortal = null;
        if (!this.joined) this.tutorial.start();
        this.joined = true;
        if (this.screen) this.setScreen(null);
        this.input.lock();
      } else return client?.sendTick();
    }
    const inp = this.input;
    const p = this.player;
    // vanilla Minecraft.tick: asleep → the in-bed chat screen; woken → close it
    if (!this.screen && p.isSleeping() && p.health > 0 && this.inBedScreenFactory) this.setScreen(this.inBedScreenFactory());
    else if (this.screen && (this.screen as { inBed?: boolean }).inBed && !p.isSleeping()) (this.screen as unknown as { onPlayerWokeUp(): void }).onPlayerWokeUp();
    // vanilla LocalPlayer.handleConfusionTransitionEffect: standing in a portal closes whatever's open (not the pause or death screens)
    if (p.portal?.inside && p.portal.kind === 'nether' && this.screen && !this.screen.isPauseScreen() && p.health > 0) {
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
      else if (code === KEYS.drop) {
        // (a guest's drop is the host's to make: vanilla ServerboundPlayerActionPacket DROP_ITEM, nothing guessed here)
        const all = inp.isDown('ControlLeft') || inp.isDown('MetaLeft');
        if (client) client.drop(all);
        else this.interaction.drop(all);
      }
      // (a guest's hands are the host's to swap, which it tells us: vanilla SWAP_ITEM_WITH_OFFHAND)
      else if (code === KEYS.swapHands) {
        if (client) client.swapHands();
        else this.interaction.swapHands();
      }
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
    if (client) {
      // (a guest's attack and use buttons are the host's to act on; picking a block is the guest's own inventory's)
      client.input(active && clicks.includes(0), active && inp.buttons[0], active && clicks.includes(2), active && inp.buttons[2], this.interaction.entityHit);
      if (active && clicks.includes(1)) this.interaction.pickBlock();
    } else if (active) {
      if (clicks.includes(0)) this.interaction.startAttack();
      this.interaction.continueAttack(inp.buttons[0] && !p.isUsingItem());
      this.interaction.use(clicks.includes(2), inp.buttons[2]);
      if (clicks.includes(1)) this.interaction.pickBlock();
    } else {
      this.interaction.continueAttack(false);
      if (p.isUsingItem()) this.interaction.releaseUsingItem();
    }
    if (!client) this.interaction.tickUsingItem();
    this.fovModO = this.fovMod;
    const target = clamp(1 + (p.fovModifier() - 1) * this.opts.fovEffects, 0.1, 1.5);
    this.fovMod += (target - this.fovMod) * 0.5;
    if (client) client.tickLevel();
    else {
      // (multiplayer: what the guests did since the last tick, before the level's; what it did, to them after)
      this.server?.receive();
      this.level.tick();
      // (vanilla TicketType.DRAGON: the arena stays loaded while the fight has a player; and the level's own tickets)
      this.chunks.setTicket('dragon', this.level.dragonFight?.ticketHeld ? [0, 0, ARENA_TICKET_LEVEL] : null);
      this.chunks.setTickets('level', [...this.level.tickets.values()].map((t) => [t.cx, t.cz, t.load]));
      this.spawner?.tick();
      this.server?.tick();
      this.tickProgress();
    }
    // (the host's ambience is its own: its torches' smoke isn't sent to the guests, who make their own)
    const ambient = () => {
      this.ambient?.tick(p.x, p.y, p.z);
      this.ambient?.tickRain(p.x, p.y + p.eyeHeight, p.z, this.opts.graphics >= 1);
    };
    if (this.server) this.server.runLocal(ambient);
    else ambient();
    if (this.freezeTime) this.level.dayTime--;
    this.atlas.tick();
    this.renderer.lightmap.tick();
    this.renderer.hand.tick(p);
    this.renderer.particles?.tick();
    this.renderer.entities.tickPickups();
    this.hud.tick(this);
    this.sound.tick(this);
    if (client) return client.sendTick();
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
        // (the level's clock stands still till the player is in: the client's keeps the starfield drifting — over the
        // End Poem and the credits, minutes long)
        if (this.receivingPortal === 'end_portal') this.renderer.end.renderScreen(EndRenderer.shaderTime(this.level.gameTime + this.ticks, partial));
        else this.overlay.renderScreenSprite('nether_portal', 1, this.canvas.width, this.canvas.height);
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
    // (the compass and clock needles are read for this player: item/compass.ts)
    setDialViewer(p, this.worldSpawn ?? [p.spawnX, p.spawnY, p.spawnZ]);
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
    // (vanilla Player.getMainArm: which hand holds its leads)
    p.mainArm = this.opts.mainHand;
    this.renderer.render(cam, {
      dayTime: this.level.dayTime,
      ticks: this.ticks,
      partial,
      weather: { rain: this.level.rainLevel(partial), thunder: this.level.thunderLevel(partial), flash: this.level.skyFlash },
      biome,
      gamma: this.opts.gamma,
      nightVision: nightVisionScale(p, partial),
      blindness: blindnessFog(p, Math.max(this.opts.renderDistance * 16, 32)),
      darkness: darknessVisuals(p, partial, this.opts.darknessEffectScale),
      bob: camOverride ? null : bob,
      underwater: eyeFluid === FLUID_WATER,
      waterFogColor: [((b.waterFog >> 16) & 255) / 255, ((b.waterFog >> 8) & 255) / 255, (b.waterFog & 255) / 255],
      lava: eyeFluid !== FLUID_LAVA ? null : p.gameMode === 'spectator' ? 'spectator' : p.hasEffect('fire_resistance') ? 'fire_resistant' : 'normal',
      // (powder snow) vanilla Camera.getFluidInCamera: the camera's block is powder snow
      powderSnow: eyeFluid || BLOCKS[STATE_BLOCK[w.getState(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z))]].name !== 'powder_snow' ? null : p.gameMode === 'spectator' ? 'spectator' : 'normal',
      dim: w.dim,
      worldFog: this.hud.bossOverlay.shouldCreateWorldFog(),
      biomeColors: blendBiomeColors(cam.x, cam.y, cam.z, (qx, qy, qz) => BIOMES[w.getBiome3(qx * 4 + 2, qy * 4 + 2, qz * 4 + 2)] ?? b),
      level: this.level,
      entityOptions: {
        shadows: this.opts.entityShadows, drawPlayer: this.thirdPerson > 0 && !camOverride, distanceScale: this.opts.entityDistanceScaling, skinParts: this.skinParts(), mainArm: this.opts.mainHand,
        crosshairEntity: this.interaction.entityHit, renderNames: !this.hideGui,
      },
    });
    if (camOverride) return;
    // (vanilla LevelRenderer: the cracks others are making in blocks within 32, forgotten after 400 ticks unchanged)
    for (const [id, d] of this.level.destroyProgress) {
      if (this.level.gameTime - d.time > 400) {
        this.level.destroyProgress.delete(id);
        continue;
      }
      if ((d.x - cam.x) ** 2 + (d.y - cam.y) ** 2 + (d.z - cam.z) ** 2 > 1024) continue;
      this.overlay.renderCrack(this.renderer, cam, d.x, d.y, d.z, w.getState(d.x, d.y, d.z), d.stage);
    }
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
    this.player.onEffectsChanged = () => this.advancements.trigger('effects_changed', { effects: new Set(this.player.activeEffects.keys()) });
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
    lvl.onTamed = (animal, by) => {
      if (by === this.player) this.advancements.trigger('tame', { tame: { type: animal.type, variant: animal.variantId() } });
    };
    lvl.onTamedDeath = (animal, source) => this.chat(this.deathMessage(source, animal, entityDisplayName(animal)));
    lvl.onPlayerArrowHit = (_e, p) => p === this.player && this.advancements.trigger('shoot_arrow');
    lvl.onPlayerTridentHit = (_e, p) => p === this.player && this.advancements.trigger('throw_trident');
    lvl.onChanneledLightning = (victims, p) => p === this.player && this.advancements.trigger('channeled_lightning', { channeled: victims.map((e) => e.type) });
    lvl.onThrownItemPickedUp = (stack, by) => {
      if (by instanceof Piglin && by.isAdult() && isLovedItem(stack)) this.advancements.trigger('distract_piglin', { distract: 'thrown' });
    };
    this.interaction.onInteractedWithEntity = (stack, e) => {
      if (e instanceof Piglin && e.isAdult() && stack?.item.id === 'gold_ingot') this.advancements.trigger('distract_piglin', { distract: 'directly' });
      // (M9: frogs) vanilla player_interacted_with_entity: what was in hand, on what kind of mob, of what variant
      const variant = (e as { variant?: unknown }).variant;
      this.advancements.trigger('player_interacted_with_entity', { interacted: { item: stack?.item.id ?? null, entity: e.type, variant: typeof variant === 'string' ? variant : undefined } });
    };
    lvl.onPlayerCrossbowKill = (killed, p) => p === this.player && this.advancements.trigger('killed_by_crossbow', { crossbowKills: killed.map((e) => e.type) });
    // (Stage 4) criteria met out in the world: shields, totems, raids
    lvl.onPlayerTrigger = (p, type, payload) => p === this.player && this.advancements.trigger(type, payload);
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
      if (this.world.dim.id === 'overworld' && this.level.strongholds().pieceAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) this.advancements.trigger('structure', { structures: ['stronghold'] });
    }
    // (Stage 4: the outer End) Great View From Up Here
    tickOuterEndProgress(this.level, p, this.advancements);
    // (trial chambers) Minecraft: Trial(s) Edition
    tickTrialChamberProgress(this.level, p, this.advancements);
    // (bastions) Those Were the Days
    tickBastionProgress(this.level, p, this.advancements);
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

  /** the in-bed screen's Leave Bed button / Escape (vanilla sendWakeUp: a guest asks the host) */
  leaveBed(): void {
    if (this.client) this.client.stopSleeping();
    else if (this.player.isSleeping()) this.player.stopSleepInBed(false);
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
    // (a guest's chat and commands are the host's to hear: it says who may run commands)
    if (this.client) return this.client.chat(msg);
    if (msg.startsWith('/')) {
      this.onCommand?.(msg.slice(1));
      return;
    }
    this.chat(`<${this.playerName}> ${msg}`);
    this.server?.hostChatted(`<${this.playerName}> ${msg}`);
  }

  /** "Save and Quit to Title" */
  async quitToTitle(savingScreen: Screen | null): Promise<void> {
    if (savingScreen) this.setScreen(savingScreen);
    await this.leaveWorld();
  }

  // -------------------------------------------------------------------------
  // multiplayer (net/): this world open to the other windows of this browser, or another window's world joined

  /**
   * vanilla IntegratedServer.publishServer ("Start LAN World"): other windows can join from Multiplayer from now on,
   * playing in `guestMode`
   */
  openToLan(guestMode: GameMode = 'survival'): boolean {
    if (!MULTIPLAYER_ENABLED || this.mode !== 'single' || !this.inWorld || !this.meta) return false;
    const lanId = randomId();
    const transport = new BroadcastHostTransport(lanId);
    if (!transport.available) return false;
    this.server = new HostServer(
      this.level,
      transport,
      {
        spawnPoint: () => this.guestSpawnPoint(),
        hostName: () => this.playerName,
        worldName: () => this.meta?.name ?? '',
        chat: (text) => this.chat(text),
        overlay: (text) => this.hud.setOverlayMessage(text),
        setTicket: (name, t) => this.chunks.setTicket(name, t),
        hostBreaking: () => {
          const it = this.interaction, stage = it.destroyStage;
          return stage >= 0 ? { x: it.dX, y: it.dY, z: it.dZ, stage } : null;
        },
      },
      { lanId, guestGameMode: guestMode },
    );
    this.mode = 'host';
    // (vanilla Player.getDisplayName: the others know the host's player by its name, "slain by" it too)
    this.player.profileName = this.playerName;
    window.addEventListener('pagehide', this.onPageHide);
    this.chat('Local game hosted: other windows of this browser can join it from Multiplayer');
    return true;
  }

  /** the world closes to guests (the host leaving it, or going to another dimension): each is told why */
  stopHosting(reason: string): void {
    const srv = this.server;
    if (!srv) return;
    this.server = null;
    this.mode = 'single';
    this.player.profileName = null;
    window.removeEventListener('pagehide', this.onPageHide);
    srv.close(reason);
  }

  /**
   * where a guest new to the world starts (vanilla PlayerList.placeNewPlayer → adjustSpawnLocation): by the world
   * spawn in the Overworld (its raw place, if its chunks aren't in); in another dimension, by the host
   */
  private guestSpawnPoint(): [number, number, number] {
    if (this.world.dim !== OVERWORLD) return [this.player.x, this.player.y, this.player.z];
    const [x, y, z] = worldSpawnOf(this);
    const pos = adjustSpawnLocation(this.level, this.player, x, y, z, false);
    const [px, py, pz] = pos === WAIT ? [x, y, z] : pos;
    return [px + 0.5, py, pz + 0.5];
  }

  /** (vanilla ConnectScreen.startConnecting) join the world that another window has open to LAN, as `me` */
  async joinWorld(lanId: string, me: GuestIdentity): Promise<void> {
    if (!MULTIPLAYER_ENABLED || this.inWorld || this.client) return;
    let cancelled = false;
    const toTitle = () => this.setScreen(this.titleScreenFactory ? this.titleScreenFactory() : null);
    this.setScreen(this.connectingScreenFactory?.(() => {
      cancelled = true;
      this.leaveHost();
      toTitle();
    }) ?? null);
    await this.startWorkers('guest');
    if (cancelled) return;
    this.mode = 'client';
    window.addEventListener('pagehide', this.onPageHide);
    this.client = new ClientSession(new BroadcastGuestTransport(lanId), {
      login: (info) => {
        const now = Date.now();
        const meta: WorldMeta = {
          id: '__guest', name: info.worldName, seed: 'guest', gameMode: info.gameMode, difficulty: info.difficulty, hardcore: info.hardcore, allowCommands: false,
          created: now, lastPlayed: now, dayTime: info.dayTime, gameTime: info.gameTime, raining: info.raining, thundering: info.thundering,
          rainTime: 0, thunderTime: 0, clearWeatherTime: 0, player: null, version: 1, structures: false, bonusChest: false,
          gameRules: info.gameRules as WorldMeta['gameRules'], transient: true,
        };
        this.meta = meta;
        this.setUpWorld(meta, info);
        this.level.rain = this.level.rainO = info.rainLevel;
        this.level.thunder = this.level.thunderO = info.thunderLevel;
        return {
          level: this.level,
          player: this.player,
          chunks: {
            add: (cx, cz, blocks, biomes, caveBiomes, blockEntities) => this.chunks.addRemote(cx, cz, blocks, biomes, caveBiomes, blockEntities),
            remove: (cx, cz) => this.chunks.removeRemote(cx, cz),
          },
        };
      },
      chat: (text, overlay) => (overlay ? this.hud.setOverlayMessage(text) : this.chat(text)),
      disconnected: (reason) => this.connectionLost(reason),
      // (vanilla handleTakeItemEntity: the host's pop is heard with the rest of its sounds; what was taken flies here)
      took: (e, taker, amount) => {
        const shown = e instanceof ItemEntity ? e.copy() : e;
        if (shown instanceof ItemEntity && amount > 0) shown.stack = shown.stack.copyWithCount(amount);
        this.renderer.entities.addPickup(shown, taker);
      },
      mounted: () => this.hud.setOverlayMessage(`Press ${keyDisplayName(KEYS.sneak)} to Dismount`),
      died: (message) => {
        this.hostDeathMessage = message;
        if (this.deathScreenFactory && this.inWorld) this.setScreen(this.deathScreenFactory());
      },
      respawned: () => {
        if (this.screen && this.player.health > 0) this.setScreen(null);
      },
      openMenu: (menu) => {
        if (this.containerScreenFactory && this.inWorld) this.setScreen(this.containerScreenFactory(menu));
      },
      closeMenu: (menu) => {
        if ((this.screen as { menu?: unknown } | null)?.menu === menu) this.setScreen(null);
      },
      openBook: (hand) => {
        const inv = this.player.inventory, s = hand === 'off' ? inv.offhand : inv.main[inv.selected];
        const screen = s && this.bookScreenFactory ? this.bookScreenFactory(this.player, s, hand) : null;
        if (screen) this.setScreen(screen);
      },
      ghostRecipe: (menu, recipe) => {
        const sc = this.screen as { menu?: unknown; ghostRecipe?(id: string): void } | null;
        if (sc?.menu === menu) sc.ghostRecipe?.(recipe);
      },
      // (our recipe book is the host's to fill, as our player unlocks recipes there: new ones with their toast)
      recipes: (rs, replace) => {
        if (!replace) return this.recipeBook.add(rs);
        this.recipeBook.known.clear();
        for (const r of rs) this.recipeBook.known.add(r.id);
      },
    }, me);
  }

  /** (a guest) leave the host's world, if in one: returns whether we were */
  private leaveHost(): boolean {
    const c = this.client;
    if (!c) return false;
    this.client = null;
    this.mode = 'single';
    window.removeEventListener('pagehide', this.onPageHide);
    c.leave();
    return true;
  }

  /** (a guest) the host went, or let us go (vanilla DisconnectedScreen): out of its world, nothing saved */
  private connectionLost(reason: string): void {
    const wasIn = this.inWorld;
    this.client = null;
    this.mode = 'single';
    window.removeEventListener('pagehide', this.onPageHide);
    const screen = this.disconnectedScreenFactory ? this.disconnectedScreenFactory(wasIn ? 'Connection Lost' : 'Failed to connect to the server', reason) : null;
    if (wasIn) void this.leaveWorld(screen);
    else {
      this.pool?.terminate();
      this.pool = null;
      this.setScreen(screen);
    }
  }

  /** the window is closing: the other end hears it now rather than when it times out */
  private readonly onPageHide = (): void => {
    this.leaveHost();
    this.stopHosting('The host closed the world.');
  };

}

function lookVec(yaw: number, pitch: number): [number, number, number] {
  const pr = pitch * DEG, yr = yaw * DEG;
  return [-Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr)];
}
