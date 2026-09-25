// Entity rendering (vanilla EntityRenderDispatcher + LivingEntityRenderer and
// the per-type renderers): mobs with baby models, hurt/white overlays, death
// tilt, render layers (sheep wool, spider eyes, held items), arrows, XP orbs,
// primed TNT, falling blocks, dropped items, fire and blob shadows.

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, DrawState } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import { wrapDegrees } from '../core/math';
import { ModelPart, playerModel, animateHumanoid } from './model';
import { drawArmItem, drawPlayerHeldItems, playerArms } from './playerPose';
import * as M from './mobModels';
import type { MobModelDef } from './mobModels';
import type { Level } from '../game/level';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { Mob } from '../entity/mob';
import { ItemEntity } from '../entity/itemEntity';
import { Arrow } from '../entity/arrow';
import { ThrownTrident } from '../entity/thrownTrident';
import { ExperienceOrb } from '../entity/xpOrb';
import { PrimedTnt } from '../entity/tnt';
import { FallingBlockEntity } from '../entity/fallingBlock';
import { Sheep, Chicken, Pig, sheepFurColor } from '../entity/animals';
import { Zombie, Skeleton, Creeper, Enderman, Slime, MagmaCube } from '../entity/monsters';
import { Ghast } from '../entity/ghast';
import { Blaze } from '../entity/blaze';
import { Hoglin, Zoglin } from '../entity/hoglin';
import { Strider } from '../entity/strider';
import { Piglin } from '../entity/piglin';
import { Villager } from '../entity/villager';
import { WanderingTrader } from '../entity/wanderingTrader';
import { SnowGolem } from '../entity/snowGolem';
import { IronGolem } from '../entity/ironGolem';
import '../textures/ironGolem';
import '../textures/snowGolem';
import '../textures/witch';
import '../textures/biomeMobs';
import '../textures/drowned';
import '../textures/silverfish';
import { silverfishModel, animateSilverfish } from './silverfishModel';
import '../textures/wolf';
import { wolfModel, animateWolf } from './wolfModel';
import { Wolf } from '../entity/wolf';
import '../textures/cat';
import { catModel, animateCat } from './catModel';
import { Cat } from '../entity/cat';
import type { Ocelot } from '../entity/ocelot';
import { AABB } from '../core/aabb';
import { DYE_DIFFUSE } from '../entity/animals';
import { Witch } from '../entity/witch';
import { villagerTexture, zombieVillagerTexture } from '../textures/villager';
import { ZombieVillager } from '../entity/zombieVillager';
import { Fireball, LargeFireball } from '../entity/fireball';
import { LightningBolt } from '../entity/lightning';
import { Rand } from '../core/rng';
import { Squid } from '../entity/water';
import { ThrownItem } from '../entity/throwable';
import { AbstractMinecart } from '../entity/minecart';
import { Boat } from '../entity/boat';
import { EndCrystal } from '../entity/endCrystal';
import { EyeOfEnder } from '../entity/eyeOfEnder';
import { EndCrystalRenderer } from './endCrystalRenderer';
import { EnderDragon } from '../entity/enderDragon';
import { DragonFireball } from '../entity/dragonFireball';
import { EnderDragonRenderer } from './enderDragonRenderer';
// (Stage 4: illagers)
import { RaiderRenderers, RAIDER_SHADOW_RADII } from './illagerRenderers';
// (Stage 5: ocean)
import { OceanRenderers, OCEAN_SHADOW_RADII } from './oceanRenderers';
// (M8: goats)
import { GoatRenderers, GOAT_SHADOW_RADII } from './goatRenderer';
import { HorseRenderers, HORSE_SHADOW_RADII } from './horseRenderer';
import { LlamaRenderers, LLAMA_SHADOW_RADII, renderSpit } from './llamaRenderer';
import { ParrotRenderers, PARROT_SHADOW_RADII } from './parrotRenderer';
import { PolarBearRenderers, POLAR_BEAR_SHADOW_RADII } from './polarBearRenderer';
import { RabbitRenderers, RABBIT_SHADOW_RADII } from './rabbitRenderer';
import { FoxRenderers, FOX_SHADOW_RADII } from './foxRenderer';
// (M9: frogs)
import { FrogRenderers, FROG_SHADOW_RADII } from './frogRenderer';
import { LlamaSpit } from '../entity/llama';
import { LeashKnot } from '../entity/leash';
import { renderKnot, renderLeash } from './leashRenderer';
import { NameTagRenderer } from './nameTagRenderer';
import { Guardian } from '../entity/guardian';
import { EvokerFangs } from '../entity/evoker';
import type { Bat } from '../entity/bat';
import type { Player } from '../entity/player';
import { MOB_TEXTURES, FIRE_TEXTURES } from '../textures/mobs';
import { FLAGS, F_FULL_COLLISION, F_AIR, OUTLINE, S } from '../world/block';
import type { ItemStack } from '../item/item';
import { crossbowTexture, crossbowChargeProgress, isCharged } from '../item/crossbow';
import { SpawnerBlockEntity, EnchantingTableBlockEntity } from '../world/blockEntity';
import { bookModel, bookTexture, renderTableBook } from './bookRenderer';
import { VillageBlockRenderers } from './villageRenderers';
import { ShulkerRenderers } from './shulkerRenderer';
import { Shulker } from '../entity/shulker';
import { ShulkerBullet } from '../entity/shulkerBullet';
import { ItemFrame } from '../entity/itemFrame';
import { ItemFrameRenderer } from './itemFrameRenderer';
import { SkullRenderer } from './skullRenderer';
import { ElytraLayer } from './elytraLayer';
import { FireworkRocket } from '../entity/fireworkRocket';
import { renderFireworkRocket } from './fireworkRenderer';
import { viewVector } from '../entity/elytra';
import { PistonRenderer } from './pistonRenderer';
import { ArchaeologyRenderers } from './archaeologyRenderers';
// (trial chambers)
import { TrialChamberRenderers } from './trialChamberRenderers';
import { OminousItemSpawner } from '../entity/ominousItemSpawner';
import { createMob } from '../game/spawner';
import { ArmorLayer, renderHeadItem, PIGLIN_HEAD_ITEM_SCALE } from './armorLayer';
import type { ArmorModelSet } from './armorLayer';

/** the mobs with vanilla's HumanoidArmorLayer and CustomHeadLayer, and their armour models */
const ARMOR_WEARERS: Record<string, ArmorModelSet> = { zombie: 'humanoid', husk: 'humanoid', drowned: 'humanoid', zombie_villager: 'zombie_villager', skeleton: 'humanoid', stray: 'humanoid', wither_skeleton: 'humanoid', piglin: 'piglin', zombified_piglin: 'piglin' };

export interface EntityRenderOptions {
  shadows: boolean;
  /** draw the local player (third-person views) */
  drawPlayer: boolean;
  distanceScale: number;
  skinParts?: SkinParts;
  /** the player's main arm (options: Main Hand) */
  mainArm?: 'left' | 'right';
  /** what the crosshair is on (vanilla crosshairPickEntity: a named mob shows its name then) */
  crosshairEntity?: Entity | null;
  /** names over mobs are drawn (vanilla Minecraft.renderNames: not with the GUI hidden) */
  renderNames?: boolean;
}

/** options: Skin Customization (vanilla PlayerModelPart; the cape aside) */
export interface SkinParts {
  hat: boolean;
  jacket: boolean;
  leftSleeve: boolean;
  rightSleeve: boolean;
  leftPants: boolean;
  rightPants: boolean;
}

const ALL_SKIN_PARTS: SkinParts = { hat: true, jacket: true, leftSleeve: true, rightSleeve: true, leftPants: true, rightPants: true };

const RAD = Math.PI / 180;

function rotLerp(p: number, a: number, b: number): number {
  return a + wrapDegrees(b - a) * p;
}

interface ShadowJob {
  x: number;
  y: number;
  z: number;
  radius: number;
  strength: number;
}

/** vanilla LivingEntityRenderer.sleepDirectionToRotation and the bed's step */
const SLEEP_ROT: Record<string, number> = { south: 90, west: 0, north: 270, east: 180 };
const BED_STEP: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

export class EntityRenderDispatcher {
  private readonly textures = new Map<string, WebGLTexture>();
  private readonly pose = new PoseStack();
  private readonly models: Record<string, MobModelDef>;
  private readonly player: ModelPart = playerModel(false);
  private readonly shadowTex: WebGLTexture;
  private fireTex: WebGLTexture | null = null;
  private fireFrames = 32;
  private readonly shadows: ShadowJob[] = [];
  /** entities drawn last frame (F3 "E:") */
  rendered = 0;
  /** model matrix living renderers start from instead of identity (mobs drawn inside spawners) */
  private base: Float32Array | null = null;
  private readonly spawnerPose = new PoseStack();
  private whiteTex: WebGLTexture | null = null;
  private mainArm: 'left' | 'right' = 'right';
  private skinParts = ALL_SKIN_PARTS;
  /** vanilla ItemPickupParticle: what was just picked up, flying to whoever took it */
  private readonly pickups: { e: Entity; target: Entity; life: number; tx: number; ty: number; tz: number; txo: number; tyo: number; tzo: number }[] = [];
  private readonly boatModels: Record<string, M.BoatModelDef> = { boat: M.boatModel(), chest_boat: M.chestBoatModel() };
  /** boat water masks, drawn once every entity is down so riders' legs aren't masked out */
  private readonly waterPatches: { m: Float32Array; part: ModelPart; tex: WebGLTexture; texW: number; texH: number }[] = [];
  private readonly armor: ArmorLayer;
  /** the bell (and the other village blocks' block entity renderers) */
  private readonly village: VillageBlockRenderers;
  /** the pistons' moving blocks */
  private readonly pistons = new PistonRenderer();
  /** the decorated pots, and the finds coming out of suspicious sand and gravel */
  private readonly archaeology: ArchaeologyRenderers;
  /** (trial chambers) the trial spawner's mob, the vault's item and the ominous item spawner */
  private readonly trialChambers = new TrialChamberRenderers();
  private readonly endCrystals: EndCrystalRenderer;
  private readonly dragons: EnderDragonRenderer;
  /** shulker boxes (and the shulkers themselves) */
  private readonly shulkers: ShulkerRenderers;
  private readonly frames: ItemFrameRenderer;
  /** mob heads: placed, held, worn and in the inventory */
  private readonly skulls: SkullRenderer;
  /** worn elytra (and the broken one's torn look as an item) */
  private readonly elytra: ElytraLayer;
  /** (Stage 4: illagers) the pillager, vindicator, evoker, vex, ravager and the evoker's fangs */
  private readonly raiders: RaiderRenderers;
  /** (Stage 5: ocean) the guardians, their lasers, the elder's ghostly face */
  private readonly ocean: OceanRenderers;
  // (M8: goats)
  private readonly goats: GoatRenderers;
  /** (Stage 6: tameable animals) horses, donkeys and mules, their markings and armour */
  private readonly horses: HorseRenderers;
  /** (Stage 6: tameable animals) llamas and their decor */
  private readonly llamas: LlamaRenderers;
  /** parrots, and the ones on a player's shoulders */
  private readonly parrots: ParrotRenderers;
  private readonly polarBears: PolarBearRenderers;
  private readonly rabbits: RabbitRenderers;
  private readonly foxes: FoxRenderers;
  /** (M9: frogs) and tadpoles */
  private readonly frogs: FrogRenderers;
  /** names over mobs, drawn once every entity is down */
  private readonly nameTags: NameTagRenderer;
  /** this frame's options: names shown at all (not with the GUI hidden), and what the crosshair is on */
  private renderNames = true;
  private crosshair: Entity | null = null;

  constructor(private readonly gl: GL, private readonly items: ItemRenderer, private readonly skin: WebGLTexture) {
    this.armor = new ArmorLayer(gl);
    this.village = new VillageBlockRenderers(gl);
    this.shulkers = new ShulkerRenderers(gl);
    this.frames = new ItemFrameRenderer(gl, items);
    this.skulls = new SkullRenderer(gl);
    this.elytra = new ElytraLayer(gl, items);
    this.archaeology = new ArchaeologyRenderers(gl);
    this.endCrystals = new EndCrystalRenderer(gl);
    this.dragons = new EnderDragonRenderer(gl, this.endCrystals.beam);
    // (Stage 4: illagers) lent this dispatcher's living-renderer steps
    this.raiders = new RaiderRenderers({
      pose: this.pose,
      items,
      tex: (n) => this.tex(n),
      setupLiving: (e, dx, dy, dz, p, flip, scale) => this.setupLiving(e, dx, dy, dz, p, flip, scale),
      overlay: (b, e, white) => this.overlay(b, e, white),
      drawBody: (b, e, def, t, baby, extra) => this.drawBody(b, e, def, t, baby, extra),
      drawModel: (b, def, baby, r, g, bl, a) => this.drawModel(b, def, baby, r, g, bl, a),
      state: (t, extra) => this.state(t, extra),
      attackAnim,
    });
    // (Stage 5: ocean) lent the same steps
    this.ocean = new OceanRenderers(gl, this.raiders.kit);
    // (M8: goats)
    this.goats = new GoatRenderers(this.raiders.kit);
    // (Stage 6: tameable animals) and again
    this.horses = new HorseRenderers(this.raiders.kit);
    this.llamas = new LlamaRenderers(this.raiders.kit);
    this.parrots = new ParrotRenderers(this.raiders.kit);
    this.polarBears = new PolarBearRenderers(this.raiders.kit);
    this.rabbits = new RabbitRenderers(this.raiders.kit);
    this.foxes = new FoxRenderers(this.raiders.kit);
    this.frogs = new FrogRenderers(this.raiders.kit);
    this.nameTags = new NameTagRenderer(gl);
    this.models = {
      pig: M.pigModel(),
      pig_saddle: M.pigModel(0.5),
      cow: M.cowModel(),
      sheep: M.sheepModel(),
      sheep_fur: M.sheepFurModel(),
      chicken: M.chickenModel(),
      zombie: M.zombieModel(),
      skeleton: M.skeletonModel(),
      creeper: M.creeperModel(),
      creeper_armor: M.creeperModel(2),
      spider: M.spiderModel(),
      cave_spider: M.spiderModel(),
      enderman: M.endermanModel(),
      squid: M.squidModel(),
      slime: M.slimeInnerModel(),
      slime_outer: M.slimeOuterModel(),
      magma_cube: M.magmaCubeModel(),
      zombified_piglin: M.piglinModel(),
      piglin: M.piglinModel(),
      ghast: M.ghastModel(),
      blaze: M.blazeModel(),
      wither_skeleton: M.skeletonModel(),
      minecart: M.minecartModel(),
      bat: M.batModel(),
      hoglin: M.hoglinModel(),
      zoglin: M.hoglinModel(),
      strider: M.striderModel(),
      villager: M.villagerModel(),
      wandering_trader: M.villagerModel(),
      snow_golem: M.snowGolemModel(),
      zombie_villager: M.zombieVillagerModel(),
      iron_golem: M.ironGolemModel(),
      witch: M.witchModel(),
      husk: M.zombieModel(),
      stray: M.skeletonModel(),
      stray_outer: M.strayOuterModel(),
      drowned: M.drownedModel(),
      drowned_outer: M.drownedModel(0.25),
      silverfish: silverfishModel(),
      wolf: wolfModel(),
      cat: catModel(),
      cat_collar: catModel(0.01),
      ocelot: catModel(),
    };
    // vanilla textures/misc/shadow.png: soft black disc
    const n = 32, data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1;
        const r = Math.sqrt(dx * dx + dy * dy);
        const a = r >= 1 ? 0 : r < 0.75 ? 1 : 1 - (r - 0.75) / 0.25;
        data[(y * n + x) * 4 + 3] = Math.round(a * 255);
      }
    this.shadowTex = createTexture(gl, n, n, data, { nearest: false });
  }

  private tex(name: string): WebGLTexture | null {
    let t = this.textures.get(name);
    if (t) return t;
    const gen = MOB_TEXTURES[name];
    if (!gen) return null;
    const img = gen();
    // (the charged creeper's swirl scrolls, so its texture wraps)
    t = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), { clamp: name !== 'creeper_armor' });
    this.textures.set(name, t);
    return t;
  }

  /** a villager's skin for its type, profession and level (vanilla VillagerProfessionLayer's layers, painted as one) */
  private villagerTex(v: Villager): WebGLTexture {
    const baby = v.isBaby();
    const key = `villager/${v.villagerType}/${baby ? 'none' : v.profession}/${v.merchantLevel}/${baby}`;
    let t = this.textures.get(key);
    if (!t) {
      const img = villagerTexture(v.villagerType, v.profession, v.merchantLevel, baby);
      t = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), { clamp: true });
      this.textures.set(key, t);
    }
    return t;
  }

  /** a zombie villager's skin, dressed as the villager it was (vanilla ZombieVillagerRenderer's layers, painted as one) */
  private zombieVillagerTex(v: ZombieVillager): WebGLTexture {
    const baby = v.isBaby();
    const key = `zombie_villager/${v.villagerType}/${baby ? 'none' : v.profession}/${v.merchantLevel}/${baby}`;
    let t = this.textures.get(key);
    if (!t) {
      const img = zombieVillagerTexture(v.villagerType, v.profession, v.merchantLevel, baby);
      t = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), { clamp: true });
      this.textures.set(key, t);
    }
    return t;
  }

  private fire(): WebGLTexture | null {
    if (this.fireTex) return this.fireTex;
    const a = FIRE_TEXTURES['fire_0']?.(), b = FIRE_TEXTURES['fire_1']?.();
    if (!a || !b) return null;
    const frames = Math.min(a.frames.length, b.frames.length);
    this.fireFrames = frames;
    const W = 32, H = 16 * frames, data = new Uint8Array(W * H * 4);
    for (let f = 0; f < frames; f++)
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++)
          for (let c = 0; c < 4; c++) {
            data[((f * 16 + y) * W + x) * 4 + c] = a.frames[f][(y * 16 + x) * 4 + c];
            data[((f * 16 + y) * W + 16 + x) * 4 + c] = b.frames[f][(y * 16 + x) * 4 + c];
          }
    this.fireTex = createTexture(this.gl, W, H, data);
    return this.fireTex;
  }

  /** draw all entities; call between opaque and translucent terrain */
  render(b: EntityBatch, level: Level, cam: Camera, partial: number, frustum: Frustum, opts: EntityRenderOptions): void {
    this.shadows.length = 0;
    this.mainArm = opts.mainArm ?? 'right';
    this.skinParts = opts.skinParts ?? ALL_SKIN_PARTS;
    this.renderNames = opts.renderNames ?? true;
    this.crosshair = opts.crosshairEntity ?? null;
    let drawn = 0;
    for (const e of level.entities) {
      if (e.removed) continue;
      if (e === level.player && !opts.drawPlayer) continue;
      const x = e.lerpX(partial), y = e.lerpY(partial), z = e.lerpZ(partial);
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (e instanceof LightningBolt) {
        // vanilla LightningBolt: never frustum culled (noCulling), but drawn only within 64 blocks
        const md = 64 * opts.distanceScale;
        if (d2 < md * md) this.renderLightning(b, e, dx, dy, dz);
        continue;
      }
      const bb = e.bb;
      let size = (bb.maxX - bb.minX + bb.maxY - bb.minY + bb.maxZ - bb.minZ) / 3 || 1;
      if (e instanceof Arrow) size *= 10;
      // (vanilla AbstractHurtingProjectile.shouldRenderAtSqrDistance: fireballs are seen from four times as far)
      else if (e instanceof Fireball) size *= 4;
      // (vanilla ShulkerBullet.shouldRenderAtSqrDistance: within 128 blocks)
      else if (e instanceof ShulkerBullet) size = 2;
      // (vanilla ItemFrame.shouldRenderAtSqrDistance: as though 16 blocks across)
      else if (e instanceof ItemFrame) size = 16;
      // (vanilla FireworkRocketEntity.shouldRenderAtSqrDistance: within 64 blocks)
      else if (e instanceof FireworkRocket) size = 1;
      const maxD = size * 64 * opts.distanceScale;
      // (vanilla EndCrystalRenderer.shouldRender: a crystal with a beam is always drawn; the dragon is never culled)
      const beam = e instanceof EndCrystal && e.beamTarget !== null;
      // (Stage 5: ocean) vanilla GuardianRenderer.shouldRender: so is a guardian with its laser on
      const laser = e instanceof Guardian && e.activeAttackTarget() !== null;
      // (vanilla MobRenderer.shouldRender: out of sight or too far, a mob is still drawn while what holds its lead is in view)
      const lead = e instanceof Mob && e.leashHolder !== null && leashHolderInView(e.leashHolder, cam, frustum);
      if (d2 >= maxD * maxD && !beam && !laser && !lead) continue;
      const hw = (bb.maxX - bb.minX) / 2 + 0.5, h = bb.maxY - bb.minY + 0.5;
      if (!beam && !laser && !lead && !(e instanceof EnderDragon) && !frustum.testBox(dx - hw, dy - 0.5, dz - hw, dx + hw, dy + h, dz + hw)) continue;
      this.renderEntity(b, level, e, x, y, z, dx, dy, dz, partial, cam);
      drawn++;
      if (opts.shadows && !(e instanceof LivingEntity && e.isInvisible())) {
        const r = shadowRadius(e);
        if (r > 0) this.shadows.push({ x, y, z, radius: r, strength: e instanceof ItemEntity || e instanceof ExperienceOrb ? 0.75 : 1 });
      }
    }
    this.rendered = drawn;
    for (const pk of this.pickups) {
      // (vanilla ItemPickupParticle.renderCustom: easing in over its three ticks, to halfway up the taker)
      let f = (pk.life + partial) / 3;
      f *= f;
      const tx = pk.txo + (pk.tx - pk.txo) * partial, ty = pk.tyo + (pk.ty - pk.tyo) * partial, tz = pk.tzo + (pk.tz - pk.tzo) * partial;
      const e = pk.e;
      const x = e.x + (tx - e.x) * f, y = e.y + (ty - e.y) * f, z = e.z + (tz - e.z) * f;
      this.renderEntity(b, level, e, x, y, z, x - cam.x, y - cam.y, z - cam.z, partial, cam);
      if (opts.shadows) {
        const r = shadowRadius(e);
        if (r > 0) this.shadows.push({ x, y, z, radius: r, strength: e instanceof ItemEntity || e instanceof ExperienceOrb ? 0.75 : 1 });
      }
    }
    this.renderWaterPatches(b);
    this.renderSpawners(b, level, cam, partial, frustum);
    this.renderEnchantingBooks(b, level, cam, partial, frustum);
    this.village.render(b, level, cam, partial, frustum);
    this.shulkers.renderBlockEntities(b, level, cam, partial, frustum);
    this.skulls.renderBlockEntities(b, level, cam, partial, frustum);
    this.pistons.render(b, this.items, level, cam, partial, frustum);
    this.archaeology.render(b, this.items, level, cam, partial, frustum);
    // (trial chambers) drawn in their cages as the spawner's mob is (vanilla SpawnerRenderer.renderEntityInSpawner)
    this.trialChambers.render(b, this.items, level, cam, partial, frustum, (mob, base) => {
      this.base = base;
      this.renderMob(b, mob, 0, 0, 0, partial);
      this.base = null;
    });
    b.setOverlay(0, 0, 0, 0);
    b.flush();
    if (this.shadows.length) this.renderShadows(b, level, cam);
    // (Stage 5: ocean) the elder guardian's ghostly face, over everything
    this.ocean.renderAppearance(b, level, cam, partial);
    this.nameTags.flush(b, this.pose, cam.yaw, cam.pitch);
  }

  /** vanilla ItemPickupParticle: `e` (a copy, for a dropped item) flies to `target` over the next three ticks */
  addPickup(e: Entity, target: Entity): void {
    const tx = target.x, ty = target.y + target.eyeHeight / 2, tz = target.z;
    this.pickups.push({ e, target, life: 0, tx, ty, tz, txo: tx, tyo: ty, tzo: tz });
  }

  /** once a game tick (vanilla ItemPickupParticle.tick): following the taker, gone on its third */
  tickPickups(): void {
    let w = 0;
    for (const pk of this.pickups) {
      if (++pk.life >= 3) continue;
      pk.txo = pk.tx;
      pk.tyo = pk.ty;
      pk.tzo = pk.tz;
      pk.tx = pk.target.x;
      pk.ty = pk.target.y + pk.target.eyeHeight / 2;
      pk.tz = pk.target.z;
      this.pickups[w++] = pk;
    }
    this.pickups.length = w;
  }

  /** vanilla SpawnerRenderer (block entity view distance 64): the spawner's mob spinning in the cage */
  private renderSpawners(b: EntityBatch, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    for (const be of level.world.blockEntities.values()) {
      if (!(be instanceof SpawnerBlockEntity) || be.removed || !be.entityId) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > 64 * 64) continue;
      if (!frustum.testBox(dx - 0.5, dy, dz - 0.5, dx + 1.5, dy + 1.5, dz + 1.5)) continue;
      let mob = be.display as Mob | null;
      if (!mob || mob.type !== be.entityId) {
        mob = createMob(be.entityId, level);
        be.display = mob;
        if (!mob) continue;
      }
      // vanilla SpawnerRenderer.renderEntityInSpawner
      let f = 0.53125;
      const size = Math.max(mob.width, mob.height);
      if (size > 1) f /= size;
      const ps = this.spawnerPose;
      ps.reset();
      ps.translate(dx + 0.5, dy + 0.4, dz + 0.5);
      ps.rotY((be.oSpin + (be.spin - be.oSpin) * partial) * 10);
      ps.translate(0, -0.2, 0);
      ps.rotX(-30);
      ps.scale(f, f, f);
      this.base = ps.m;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      this.renderMob(b, mob, 0, 0, 0, partial);
      this.base = null;
    }
  }

  private readonly book = bookModel();
  private bookTex: WebGLTexture | null = null;

  /** vanilla EnchantTableRenderer (block entity view distance 64) */
  private renderEnchantingBooks(b: EntityBatch, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    for (const be of level.world.blockEntities.values()) {
      if (!(be instanceof EnchantingTableBlockEntity) || be.removed) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > 64 * 64) continue;
      if (!frustum.testBox(dx, dy + 0.5, dz, dx + 1, dy + 1.5, dz + 1)) continue;
      this.bookTex ??= bookTexture(this.gl);
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      b.setOverlay(0, 0, 0, 0);
      b.begin(this.state(this.bookTex));
      renderTableBook(b, this.pose, this.book, be, dx, dy, dz, partial);
    }
  }

  private setLight(b: EntityBatch, level: Level, e: Entity, x: number, y: number, z: number): void {
    const l = level.world.getLight(Math.floor(x), Math.floor(y + e.eyeHeight), Math.floor(z));
    b.lightS = (l >> 4) * 16;
    // (vanilla MagmaCubeRenderer and BlazeRenderer.getBlockLightLevel: they glow by their own light; Stage 4: VexRenderer too)
    b.lightB = (e.isOnFire() || e instanceof MagmaCube || e instanceof Blaze || e.type === 'vex' ? 15 : l & 15) * 16;
  }

  private renderEntity(b: EntityBatch, level: Level, e: Entity, x: number, y: number, z: number, dx: number, dy: number, dz: number, p: number, cam: Camera): void {
    this.setLight(b, level, e, x, y, z);
    if (e instanceof ItemEntity) this.renderItemEntity(b, e, dx, dy, dz, p);
    else if (e instanceof EnderDragon) this.dragons.render(b, this.pose, e, dx, dy, dz, p);
    else if (e instanceof Shulker) this.shulkers.renderShulker(b, e, dx, dy, dz, p);
    else if (e instanceof ShulkerBullet) this.shulkers.renderBullet(b, e, dx, dy, dz, p);
    else if (e instanceof ItemFrame) this.frames.render(b, e, dx, dy, dz);
    else if (e instanceof Mob) this.renderMob(b, e, dx, dy, dz, p);
    else if (e instanceof LivingEntity && e.type === 'player') this.renderPlayer(b, e as Player, dx, dy, dz, p);
    else if (e instanceof ThrownTrident) this.items.trident.renderThrown(b, this.pose, e, dx, dy, dz, p, rotLerp(p, e.yawO, e.yaw));
    else if (e instanceof Arrow) this.renderArrow(b, e, dx, dy, dz, p);
    else if (e instanceof ExperienceOrb) this.renderOrb(b, level, e, x, y, z, dx, dy, dz, p, cam);
    else if (e instanceof PrimedTnt) this.renderTnt(b, e, dx, dy, dz, p);
    else if (e instanceof FallingBlockEntity) this.renderFalling(b, e, dx, dy, dz);
    else if (e instanceof ThrownItem) this.renderThrown(b, e, dx, dy, dz, cam);
    else if (e instanceof FireworkRocket) renderFireworkRocket(b, this.pose, this.items, e, dx, dy, dz, cam);
    else if (e instanceof EyeOfEnder) this.renderEyeOfEnder(b, e, dx, dy, dz, cam);
    else if (e instanceof DragonFireball) this.dragons.renderFireball(b, this.pose, dx, dy, dz, cam);
    else if (e instanceof Fireball) this.renderFireball(b, e, dx, dy, dz, cam);
    else if (e instanceof AbstractMinecart) this.renderMinecart(b, e, x, y, z, dx, dy, dz, p);
    else if (e instanceof Boat) this.renderBoat(b, e, dx, dy, dz, p);
    else if (e instanceof EndCrystal) this.endCrystals.render(b, this.pose, e, dx, dy, dz, p);
    else if (e instanceof EvokerFangs) this.raiders.renderFangs(b, e, dx, dy, dz, p); // (Stage 4: illagers)
    else if (e instanceof LlamaSpit) {
      const t = this.tex('llama_spit');
      if (t) renderSpit(b, this.pose, this.state(t), dx, dy, dz, rotLerp(p, e.yawO, e.yaw), e.pitchO + (e.pitch - e.pitchO) * p);
    }
    else if (e instanceof LeashKnot) {
      const t = this.tex('lead_knot');
      if (t) renderKnot(b, this.pose, this.state(t), dx, dy, dz);
    }
    // (trial chambers)
    else if (e instanceof OminousItemSpawner) this.trialChambers.renderItemSpawner(b, this.items, level, e, dx, dy, dz, p);
    if (e instanceof Mob) {
      if (e.leashHolder) {
        this.whiteTex ??= createTexture(this.gl, 1, 1, new Uint8Array([255, 255, 255, 255]));
        renderLeash(b, { texture: this.whiteTex, cutoff: -1, blend: false, cull: false, lit: false, useLightmap: true }, e, e.leashHolder, cam.x, cam.y, cam.z, p, (lx, ly, lz) => level.world.getLight(lx, ly, lz));
      }
      // (vanilla EntityRenderer.render → renderNameTag, the light the mob's in)
      if (this.showsName(e, dx * dx + dy * dy + dz * dz)) {
        this.setLight(b, level, e, x, y, z);
        this.nameTags.add(e.customName!, dx, dy + e.height + 0.5, dz, b.lightB, b.lightS);
      }
    }
    // (at the renderer's offset: a crouching player's flames sink with it)
    if (e.isOnFire() && !(e instanceof ItemEntity) && !(e instanceof ExperienceOrb)) this.renderFlame(b, e, dx, dy + renderOffsetY(e), dz, cam.yaw, level.gameTime);
  }

  /**
   * vanilla LivingEntityRenderer.shouldShowName and MobRenderer.shouldShowName: a named mob within 64 blocks, not
   * invisible and not carrying anyone, while it's looked at (always, with its name set visible); never with the GUI
   * hidden
   */
  private showsName(e: Mob, d2: number): boolean {
    if (!this.renderNames || e.customName === null || d2 >= 64 * 64) return false;
    if (e.isInvisible() || e.passengers.length > 0) return false;
    return e.customNameVisible || e === this.crosshair;
  }

  /**
   * vanilla InventoryScreen.renderEntityInInventory: the player as the dispatcher draws it anywhere (at partial
   * tick 1, full bright), from the screen's matrix `base`, at whatever angles the screen has given it; the camera
   * looks at it head on, so its flames face the screen
   */
  /** an entity in a screen (the player in its inventory, a horse in its own), drawn as in the world */
  renderInGui(b: EntityBatch, e: LivingEntity, base: Float32Array, opts: EntityRenderOptions): void {
    if (e.type === 'player') return this.renderPlayerInGui(b, e as Player, base, opts);
    if (!(e instanceof Mob)) return;
    this.base = base;
    b.lightB = b.lightS = 240;
    this.renderMob(b, e, 0, 0, 0, 1);
    this.base = null;
    b.setOverlay(0, 0, 0, 0);
  }

  renderPlayerInGui(b: EntityBatch, e: Player, base: Float32Array, opts: EntityRenderOptions): void {
    this.mainArm = opts.mainArm ?? 'right';
    this.skinParts = opts.skinParts ?? ALL_SKIN_PARTS;
    this.base = base;
    b.lightB = b.lightS = 240;
    this.renderPlayer(b, e, 0, 0, 0, 1);
    if (e.isOnFire()) this.renderFlame(b, e, 0, renderOffsetY(e), 0, 0, e.level.gameTime);
    this.base = null;
    b.setOverlay(0, 0, 0, 0);
  }

  // -------------------------------------------------------------------------
  // living entities

  /** vanilla LivingEntityRenderer.render up to the model draw; returns false if the texture is missing */
  private setupLiving(e: LivingEntity, dx: number, dy: number, dz: number, p: number, flip = 90, scale?: (pose: PoseStack) => void): { limbSwing: number; limbAmount: number; age: number; headYaw: number; headPitch: number } {
    const pose = this.pose;
    pose.reset(this.base ?? undefined);
    pose.translate(dx, dy, dz);
    const bodyYaw = rotLerp(p, e.bodyYawO, e.bodyYaw);
    const headYaw = rotLerp(p, e.headYawO, e.headYaw);
    const net = wrapDegrees(headYaw - bodyYaw);
    const pitch = e.pitchO + (e.pitch - e.pitchO) * p;
    const bed = e.type === 'player' ? (e as Player).bedOrientation() : e instanceof Villager ? e.bedOrientation() : null;
    if (bed) {
      // vanilla LivingEntityRenderer: a sleeper lies along the bed, head on the pillow (its standing eye height up it)
      const f4 = (e instanceof Villager ? e.standingEyeHeight() : 1.62) - 0.1;
      pose.translate(-BED_STEP[bed][0] * f4, 0, -BED_STEP[bed][1] * f4);
      pose.rotY(SLEEP_ROT[bed]);
      pose.rotZ(flip);
      pose.rotY(270);
    } else pose.rotY(180 - bodyYaw - shakeYaw(e));
    if (e.deathTime > 0) {
      let f = ((e.deathTime + p - 1) / 20) * 1.6;
      f = Math.sqrt(Math.max(0, f));
      if (f > 1) f = 1;
      pose.rotZ(f * flip);
    } else if (e.isAutoSpinAttack()) {
      // (vanilla: whirling in a riptide, laid along the look and spun about it)
      pose.rotX(-90 - e.pitch);
      pose.rotY((e.tickCount + p) * -75);
    } else if (!bed && isUpsideDown(e)) {
      // (vanilla isEntityUpsideDown: named Dinnerbone or Grumm, it's upside down)
      pose.translate(0, e.height + 0.1, 0);
      pose.rotZ(180);
    }
    // vanilla PlayerRenderer.setupRotations: gliding, a player tips over to lie along the look over the glide's first
    // ten ticks, then rolls toward the way it's actually going (the angle from the look to its motion, sideways)
    if (e.type === 'player' && e.fallFlying) {
      const h = e.fallFlyTicks + p;
      if (!e.isAutoSpinAttack()) pose.rotX(Math.min(1, (h * h) / 100) * (-90 - pitch));
      const [lx, , lz] = viewVector(pitch, rotLerp(p, e.yawO, e.yaw));
      const d = e.dx * e.dx + e.dz * e.dz, l = lx * lx + lz * lz;
      if (d > 0 && l > 0) {
        const j = (e.dx * lx + e.dz * lz) / Math.sqrt(d * l);
        const k = e.dx * lz - e.dz * lx;
        pose.rotY((Math.sign(k) * Math.acos(Math.max(-1, Math.min(1, j))) * 180) / Math.PI);
      }
    }
    // vanilla CatRenderer.setupRotations: lying down, it rolls onto its side (a touch further over by a sleeper)
    if (e instanceof Cat) {
      const j = e.lieDown(p);
      if (j > 0) {
        pose.translate(0.4 * j, 0.15 * j, 0.1 * j);
        pose.rotZ(90 * j);
        const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
        const pl = e.level.player;
        if (pl?.isSleeping() && pl.bb.intersects(new AABB(bx - 2, by - 2, bz - 2, bx + 3, by + 3, bz + 3))) pose.translate(0.15 * j, 0, 0);
      }
    }
    // vanilla DrownedRenderer.setupRotations: swimming, it leans into its look, about the middle of its body
    if (e.type === 'drowned') {
      const swim = e.swimAmountAt(p);
      if (swim > 0) {
        const h = e.height / 2;
        pose.translate(0, h, 0);
        pose.rotX(swim * (-10 - e.pitch));
        pose.translate(0, -h, 0);
      }
    }
    pose.scale(-1, -1, 1);
    scale?.(pose);
    pose.translate(0, -1.501, 0);
    let limbAmount = 0, limbSwing = 0;
    // vanilla shouldSit: a rider's legs don't walk
    if (e.isAlive && !e.vehicle) {
      limbAmount = Math.min(1, e.walkAnimSpeedO + (e.walkAnimSpeed - e.walkAnimSpeedO) * p);
      limbSwing = e.walkAnimPos - e.walkAnimSpeed * (1 - p);
      if (e instanceof Mob && e.isBaby()) limbSwing *= 3;
    }
    if (bed) return { limbSwing, limbAmount, age: e.tickCount + p, headYaw: 0, headPitch: 0 };
    return { limbSwing, limbAmount, age: e.tickCount + p, headYaw: net, headPitch: pitch };
  }

  private overlay(b: EntityBatch, e: LivingEntity, white = 0): void {
    if (e.hurtTime > 0 || e.deathTime > 0) b.setOverlay(1, 0, 0, 0.3);
    else if (white > 0) b.setOverlay(1, 1, 1, (Math.floor(white * 15) / 15) * 0.75);
    else b.setOverlay(0, 0, 0, 0);
  }

  private state(tex: WebGLTexture, extra: Partial<DrawState> = {}): DrawState {
    return { texture: tex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true, ...extra };
  }

  /** vanilla AgeableListModel.renderToBuffer (or a model's own, in groups) */
  private drawModel(b: EntityBatch, def: MobModelDef, baby: boolean, r = 1, g = 1, bl = 1, a = 1): void {
    const pose = this.pose;
    const groups = baby ? def.babyGroups : def.groups;
    if (groups) {
      for (const grp of groups) {
        pose.push();
        pose.scale(grp.scale[0], grp.scale[1], grp.scale[2]);
        pose.translate(grp.translate[0], grp.translate[1], grp.translate[2]);
        for (const n of grp.parts) def.root.child(n).render(b, pose, def.texW, def.texH, r, g, bl, a);
        pose.pop();
      }
    } else if (baby && def.baby) {
      const bd = def.baby;
      pose.push();
      if (bd.scaleHead) {
        const s = 1.5 / bd.headScale;
        pose.scale(s, s, s);
      }
      pose.translate(0, bd.yHead / 16, bd.zHead / 16);
      for (const n of bd.headParts) def.root.child(n).render(b, pose, def.texW, def.texH, r, g, bl, a);
      pose.pop();
      pose.push();
      const s = 1 / bd.bodyScale;
      pose.scale(s, s, s);
      pose.translate(0, bd.bodyY / 16, 0);
      for (const [n, c] of def.root.children) if (!bd.headParts.includes(n)) c.render(b, pose, def.texW, def.texH, r, g, bl, a);
      pose.pop();
    } else def.root.render(b, this.pose, def.texW, def.texH, r, g, bl, a);
  }

  private renderMob(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): void {
    // (Stage 4: illagers) the raiders have their own renderers
    if (this.raiders.render(b, e, dx, dy, dz, p)) return;
    // (Stage 5: ocean)
    if (this.ocean.render(b, e, dx, dy, dz, p)) return;
    // (M8: goats)
    if (this.goats.render(b, e, dx, dy, dz, p)) return;
    // (Stage 6: tameable animals; a llama before the horses it's kin to)
    if (this.llamas.render(b, e, dx, dy, dz, p)) return;
    if (this.horses.render(b, e, dx, dy, dz, p)) return;
    if (this.parrots.render(b, e, dx, dy, dz, p)) return;
    if (this.polarBears.render(b, e, dx, dy, dz, p)) return;
    if (this.rabbits.render(b, e, dx, dy, dz, p)) return;
    if (this.foxes.render(b, e, dx, dy, dz, p)) return;
    // (M9: frogs)
    if (this.frogs.render(b, e, dx, dy, dz, p)) return;
    const type = e.type;
    const def = this.models[type];
    // (vanilla GhastRenderer.getTextureLocation: its face while charging a shot)
    // (vanilla StriderRenderer.getTextureLocation: purple while it's cold)
    const tex = e instanceof Villager ? this.villagerTex(e) : e instanceof ZombieVillager ? this.zombieVillagerTex(e) : this.tex(e instanceof Ghast && e.charging ? 'ghast_shooting' : e instanceof Strider && e.suffocating ? 'strider_cold' : e instanceof Wolf || e instanceof Cat ? e.texture() : type);
    if (!def || !tex) return;
    const baby = e.isBaby();
    let white = 0;
    let scale: ((pose: PoseStack) => void) | undefined;
    let jx = 0, jz = 0;
    if (e instanceof Enderman && e.creepy) {
      // vanilla EndermanRenderer.getRenderOffset: jitter while angry
      jx = gaussian() * 0.02;
      jz = gaussian() * 0.02;
    }
    if (e instanceof Squid) {
      this.renderSquid(b, e, dx, dy, dz, p, def, tex);
      return;
    }
    if (e instanceof Slime) {
      const f = e.size;
      const f1 = (e.oSquish + (e.squish - e.oSquish) * p) / (f * 0.5 + 1);
      const f2 = 1 / (f1 + 1);
      // (vanilla MagmaCubeRenderer.scale skips the slime's hair of shrink)
      const magma = e instanceof MagmaCube;
      scale = (pose) => {
        if (!magma) {
          pose.scale(0.999, 0.999, 0.999);
          pose.translate(0, 0.001, 0);
        }
        pose.scale(f2 * f, (1 / f2) * f, f2 * f);
      };
    }
    if (e instanceof Creeper) {
      const sw = e.swelling(p);
      const f1 = 1 + Math.sin(sw * 100) * sw * 0.01;
      let f = Math.max(0, Math.min(1, sw));
      f *= f;
      f *= f;
      const f2 = (1 + f * 0.4) * f1, f3 = (1 + f * 0.1) / f1;
      scale = (pose) => pose.scale(f2, f3, f2);
      white = Math.floor(sw * 10) % 2 === 0 ? 0 : Math.max(0.5, Math.min(1, sw));
    }
    // vanilla CaveSpiderRenderer.scale
    if (type === 'cave_spider') scale = (pose) => pose.scale(0.7, 0.7, 0.7);
    // vanilla GhastRenderer.scale
    if (type === 'ghast') scale = (pose) => pose.scale(4.5, 4.5, 4.5);
    // vanilla WitherSkeletonRenderer.scale
    if (type === 'wither_skeleton') scale = (pose) => pose.scale(1.2, 1.2, 1.2);
    // vanilla StriderRenderer.scale: a baby is the whole model at half size
    if (type === 'strider' && baby) scale = (pose) => pose.scale(0.5, 0.5, 0.5);
    // vanilla CatRenderer.scale
    if (type === 'cat') scale = (pose) => pose.scale(0.8, 0.8, 0.8);
    // vanilla HuskRenderer.scale: 17/16
    if (type === 'husk') scale = (pose) => pose.scale(1.0625, 1.0625, 1.0625);
    // vanilla WitchRenderer.scale: 15/16
    if (type === 'witch') scale = (pose) => pose.scale(0.9375, 0.9375, 0.9375);
    // vanilla VillagerRenderer.scale: 15/16, a baby half that
    if (type === 'villager') {
      const f = baby ? 0.46875 : 0.9375;
      scale = (pose) => pose.scale(f, f, f);
    }
    // vanilla WanderingTraderRenderer.scale: 15/16
    if (type === 'wandering_trader') scale = (pose) => pose.scale(0.9375, 0.9375, 0.9375);
    // vanilla IronGolemRenderer.setupRotations: it rocks from side to side as it walks
    if (e instanceof IronGolem && e.walkAnimSpeed >= 0.01) {
      const j = e.walkAnimPos - e.walkAnimSpeed * (1 - p) + 6;
      const k = (Math.abs((j % 13) - 6.5) - 3.25) / 3.25;
      scale = (pose) => pose.rotZ(6.5 * k);
    }
    const spiderLike = type === 'spider' || type === 'cave_spider';
    // (vanilla SpiderRenderer / SilverfishRenderer.getFlipDegrees: they die rolled right over)
    const a = this.setupLiving(e, dx + jx, dy, dz + jz, p, spiderLike || type === 'silverfish' ? 180 : 90, scale);
    const attack = attackAnim(e, p);
    let armPose: M.ArmPose = 'empty';
    switch (type) {
      case 'pig':
      case 'cow':
        M.animateQuadruped(def.root, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch);
        break;
      case 'sheep': {
        const sh = e as Sheep;
        M.animateQuadruped(def.root, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch);
        const head = def.root.child('head');
        head.y = 6 + sh.headEatPositionScale(p) * 9;
        head.xRot = sh.headEatAngleScale(p, a.headPitch);
        break;
      }
      case 'chicken': {
        const c = e as Chicken;
        const flap = c.flapO + (c.flap - c.flapO) * p, fs = c.flapSpeedO + (c.flapSpeed - c.flapSpeedO) * p;
        M.animateChicken(def.root, a.limbSwing, a.limbAmount, (Math.sin(flap) + 1) * fs, a.headYaw, a.headPitch);
        break;
      }
      case 'zombie':
      case 'husk':
      case 'zombie_villager':
        M.animateHumanoidMob(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attack, 'empty', !!e.vehicle);
        M.animateZombieArms(def.root, (e as Zombie).aggressive, attack, a.age);
        break;
      case 'zombified_piglin':
        M.animateHumanoidMob(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attack, 'empty', !!e.vehicle);
        M.animatePiglinEars(def.root, a.limbSwing, a.limbAmount, a.age);
        M.animateZombieArms(def.root, (e as Zombie).aggressive, attack, a.age);
        break;
      case 'drowned':
        M.animateHumanoidMob(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attack, 'empty', !!e.vehicle);
        M.animateZombieArms(def.root, e.aggressive, attack, a.age);
        // (vanilla DrownedModel.prepareMobModel: THROW_SPEAR with a trident while aggressive)
        M.animateDrowned(def.root, a.limbSwing, a.age, e.aggressive && e.mainHand?.item.id === 'trident', e.swimAmountAt(p));
        break;
      case 'piglin':
        M.animateHumanoidMob(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attack, 'empty', !!e.vehicle);
        M.animatePiglinEars(def.root, a.limbSwing, a.limbAmount, a.age);
        M.animatePiglinPose(def.root, (e as Piglin).armPose(), a.age, attack, crossbowChargeProgress(e.mainHand, e.useItemTicks));
        break;
      case 'skeleton':
      case 'stray':
      case 'wither_skeleton': {
        const bow = e.mainHand?.item.id === 'bow';
        armPose = bow && e.aggressive ? 'bow' : 'empty';
        M.animateHumanoidMob(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attack, armPose, !!e.vehicle);
        if (e.aggressive && !bow) M.animateSkeletonMelee(def.root, attack, a.age);
        break;
      }
      case 'creeper':
        M.animateCreeper(def.root, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch);
        break;
      case 'spider':
      case 'cave_spider':
        M.animateSpider(def.root, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch);
        break;
      case 'enderman': {
        const en = e as Enderman;
        M.animateEnderman(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attack, en.carried !== 0, en.creepy);
        break;
      }
      case 'ghast':
        M.animateGhast(def.root, a.age);
        break;
      case 'blaze':
        M.animateBlaze(def.root, a.age, a.headYaw, a.headPitch);
        break;
      case 'magma_cube': {
        const mc = e as MagmaCube;
        M.animateMagmaCube(def.root, mc.oSquish + (mc.squish - mc.oSquish) * p);
        break;
      }
      case 'strider':
        M.animateStrider(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, e.isVehicle());
        break;
      case 'hoglin':
      case 'zoglin':
        M.animateHoglin(def.root, a.limbSwing, a.limbAmount, a.headYaw, (e as Hoglin | Zoglin).attackAnimationRemainingTicks, baby);
        break;
      case 'villager':
        M.animateVillager(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, (e as Villager).unhappyCounter > 0);
        break;
      case 'wandering_trader':
        M.animateVillager(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, false);
        break;
      case 'snow_golem':
        M.animateSnowGolem(def.root, a.headYaw, a.headPitch);
        break;
      case 'witch':
        // (vanilla WitchRenderer.render: setHoldingItem while there's something in its hand)
        M.animateWitch(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, e.id, e.tickCount, !!e.mainHand);
        break;
      case 'iron_golem': {
        const g = e as IronGolem;
        M.animateIronGolem(def.root, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch, g.attackAnimationTick > 0 ? g.attackAnimationTick - p : 0, g.offerFlowerTick);
        break;
      }
      case 'silverfish':
        animateSilverfish(def.root, a.age);
        break;
      case 'wolf': {
        const w = e as Wolf;
        animateWolf(def.root, {
          limbSwing: a.limbSwing, limbAmount: a.limbAmount, headYaw: a.headYaw, headPitch: a.headPitch,
          angry: w.isAngry(), sitting: w.inSittingPose, tailAngle: w.tailAngle(), headRoll: w.headRollAngle(p), bodyRoll: (o) => w.bodyRollAngle(p, o),
        });
        break;
      }
      case 'cat': {
        const c = e as Cat;
        animateCat(def.root, {
          limbSwing: a.limbSwing, limbAmount: a.limbAmount, headYaw: a.headYaw, headPitch: a.headPitch,
          crouching: c.crouching, sprinting: c.sprinting, sitting: c.inSittingPose, lieDown: c.lieDown(p), lieDownTail: c.lieDownTail(p), relaxStateOne: c.relaxStateOneAt(p),
        });
        break;
      }
      // (vanilla OcelotModel alone: it never sits or lies down)
      case 'ocelot': {
        const o = e as Ocelot;
        animateCat(def.root, {
          limbSwing: a.limbSwing, limbAmount: a.limbAmount, headYaw: a.headYaw, headPitch: a.headPitch,
          crouching: o.crouching, sprinting: o.sprinting, sitting: false, lieDown: 0, lieDownTail: 0, relaxStateOne: 0,
        });
        break;
      }
      case 'bat': {
        // vanilla AnimationState: seconds since each loop started (a tick is 50 ms)
        const bat = e as Bat;
        const t = (start: number) => (start < 0 ? -1 : Math.max(0, (e.tickCount + p - start) * 0.05));
        M.animateBat(def.root, bat.resting, a.headYaw, t(bat.flyAnimStart), t(bat.restAnimStart));
        break;
      }
    }
    this.overlay(b, e, white);
    // vanilla BatModel renders entityCutout (culled: its flat wings have a front and a back side)
    // (vanilla WolfRenderer.render: a wet wolf's coat is darker)
    this.drawBody(b, e, def, tex, baby, type === 'bat' ? { cull: true } : undefined, e instanceof Wolf && e.wet ? e.wetShade(p) : 1);
    // vanilla SaddleLayer: the saddle texture over the same model (the pig's a half pixel bigger all round)
    if (e instanceof Strider && e.saddled && !e.isInvisible()) {
      const st = this.tex('strider_saddle');
      if (st) {
        b.begin(this.state(st));
        this.drawModel(b, def, false);
      }
    }
    if (e instanceof Pig && e.saddled && !e.isInvisible()) {
      const sm = this.models.pig_saddle, st = this.tex('pig_saddle');
      if (sm && st) {
        copyPose(def.root, sm.root);
        b.begin(this.state(st));
        this.drawModel(b, sm, false);
      }
    }
    // layers (vanilla draws them even for invisible mobs: an invisible spider still shows its eyes)
    if (e instanceof Sheep && !e.sheared && !e.isInvisible()) {
      const fur = this.models.sheep_fur, ft = this.tex('sheep_fur');
      if (fur && ft) {
        copyPose(def.root, fur.root);
        const [r, g, bl] = e.customName === 'jeb_' ? jebColor(e, p) : sheepFurColor(e.color);
        b.begin(this.state(ft));
        this.drawModel(b, fur, baby, r, g, bl);
      }
    }
    // vanilla WolfCollarLayer: a tame wolf's collar in its dye colour
    if (e instanceof Wolf && e.isTame() && !e.isInvisible()) {
      const ct = this.tex('wolf_collar');
      if (ct) {
        const c = DYE_DIFFUSE[e.collarColor];
        b.begin(this.state(ct));
        this.drawModel(b, def, baby, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
      }
    }
    // vanilla CatCollarLayer: a tame cat's collar in its dye colour, on a hair-bigger copy of the model
    if (e instanceof Cat && e.isTame() && !e.isInvisible()) {
      const cm = this.models.cat_collar, ct = this.tex('cat_collar');
      if (cm && ct) {
        const c = DYE_DIFFUSE[e.collarColor];
        copyPose(def.root, cm.root);
        b.begin(this.state(ct));
        this.drawModel(b, cm, baby, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
      }
    }
    // vanilla SkeletonClothingLayer: the stray's rags over its bones, posed as they are
    if (type === 'stray' && !e.isInvisible()) {
      const cl = this.models.stray_outer, ct = this.tex('stray_overlay');
      if (cl && ct) {
        copyPose(def.root, cl.root);
        b.begin(this.state(ct));
        this.drawModel(b, cl, false);
      }
    }
    // vanilla DrownedOuterLayer: the seaweed it wears, posed as it is
    if (type === 'drowned' && !e.isInvisible()) {
      const ol = this.models.drowned_outer, ot = this.tex('drowned_outer_layer');
      if (ol && ot) {
        copyPose(def.root, ol.root);
        b.begin(this.state(ot));
        this.drawModel(b, ol, baby);
      }
    }
    if (e instanceof Creeper && e.powered) this.drawPowerSwirl(b, e, def, p);
    if (e instanceof IronGolem) this.drawGolemLayers(b, e, def);
    if (spiderLike) this.drawEyes(b, def, 'spider_eyes', baby);
    if (e instanceof Enderman) {
      this.drawEyes(b, def, 'enderman_eyes', false);
      if (e.carried) this.drawCarriedBlock(b, e.carried);
    }
    if (e instanceof Slime && !(e instanceof MagmaCube) && !e.isInvisible()) {
      const outer = this.models.slime_outer;
      if (outer) {
        this.overlay(b, e);
        b.begin(this.state(tex, { blend: true, cutoff: 0.01 }));
        this.drawModel(b, outer, false);
        b.flush();
      }
    }
    if (e.mainHand && (e instanceof Zombie || e instanceof Skeleton || e instanceof Piglin)) {
      b.setOverlay(0, 0, 0, 0);
      this.drawHeldItem(b, def.root, e.mainHand, baby, e.usingItem ? e.useItemTicks + p : -1);
    }
    // vanilla SnowGolemHeadLayer: its carved pumpkin, on its head (flashing red with it when it's hurt)
    if (e instanceof SnowGolem && e.hasPumpkin && !e.isInvisible()) {
      const pose = this.pose;
      pose.push();
      def.root.child('head').translateAndRotate(pose);
      pose.translate(0, -0.34375, 0);
      pose.rotY(180);
      pose.scale(0.625, -0.625, -0.625);
      pose.translate(-0.5, -0.5, -0.5);
      this.items.renderBlockState(b, pose, S('carved_pumpkin'));
      pose.pop();
    }
    // vanilla CrossedArmsItemLayer: what a villager (or a wandering trader) holds up shows in its folded arms
    if ((e instanceof Villager || e instanceof WanderingTrader) && e.mainHand) {
      b.setOverlay(0, 0, 0, 0);
      const pose = this.pose;
      pose.push();
      pose.translate(0, 0.4, -0.4);
      pose.rotX(180);
      this.items.render(b, pose, e.mainHand, 'ground');
      pose.pop();
    }
    // vanilla WitchItemLayer: a potion it's drinking is tipped up to its lips, under the raised nose; anything else
    // is held in the folded arms like a villager's
    if (e instanceof Witch && e.mainHand) {
      b.setOverlay(0, 0, 0, 0);
      const pose = this.pose;
      pose.push();
      if (e.mainHand.item.id === 'potion') {
        const head = def.root.child('head');
        head.translateAndRotate(pose);
        head.child('nose').translateAndRotate(pose);
        pose.translate(0.0625, 0.25, 0);
        pose.rotZ(180);
        pose.rotX(140);
        pose.rotZ(10);
        pose.translate(0, -0.4, 0.4);
      }
      pose.translate(0, 0.4, -0.4);
      pose.rotX(180);
      this.items.render(b, pose, e.mainHand, 'ground');
      pose.pop();
    }
    // (the offhand in the left: a piglin's, the gold it's admiring)
    if (e.offHand && (e instanceof Zombie || e instanceof Skeleton || e instanceof Piglin)) {
      b.setOverlay(0, 0, 0, 0);
      this.drawHeldItem(b, def.root, e.offHand, baby, -1, true);
    }
    // vanilla HumanoidArmorLayer and CustomHeadLayer (worn by the invisible too)
    const armorSet = ARMOR_WEARERS[type];
    if (armorSet) {
      this.armor.render(b, this.pose, def.root, e.armorItems, baby, armorSet);
      const head = e.armorItems[3];
      const s = armorSet === 'piglin' ? PIGLIN_HEAD_ITEM_SCALE : 1;
      // (a mob head's jaw works with the walk: the vehicle's when riding one)
      const w = e.vehicle instanceof LivingEntity ? e.vehicle : e;
      if (head && !head.item.armor) renderHeadItem(b, this.pose, this.items, def.root, head, baby, s, 1, s, w.walkAnimPos - w.walkAnimSpeed * (1 - p), type === 'zombie_villager');
      // vanilla HumanoidMobRenderer's ElytraLayer
      this.elytra.render(b, this.pose, e, e.armorItems[2], baby, false);
    }
  }

  /**
   * vanilla LivingEntityRenderer body pass: invisible entities skip it (their layers still draw), and a
   * spectator sees them at 15% opacity
   */
  private drawBody(b: EntityBatch, e: LivingEntity, def: MobModelDef, tex: WebGLTexture, baby: boolean, extra?: Partial<DrawState>, shade = 1): void {
    if (!e.isInvisible()) {
      b.begin(this.state(tex, extra));
      this.drawModel(b, def, baby, shade, shade, shade);
    } else if (e.level.player?.gameMode === 'spectator') {
      b.begin(this.state(tex, { blend: true, cutoff: 0.01, depthWrite: false }));
      this.drawModel(b, def, baby, shade, shade, shade, 38 / 255);
      b.flush();
    }
  }

  /**
   * vanilla IronGolemCrackinessLayer (the cracks of how hurt it is, over the same model) and IronGolemFlowerLayer (the
   * poppy in its right hand while it offers it)
   */
  private drawGolemLayers(b: EntityBatch, e: IronGolem, def: MobModelDef): void {
    const cr = e.crackiness();
    if (cr !== 'none' && !e.isInvisible()) {
      const t = this.tex('iron_golem_crackiness_' + cr);
      if (t) {
        b.begin(this.state(t));
        this.drawModel(b, def, false);
      }
    }
    if (e.offerFlowerTick > 0) {
      const pose = this.pose;
      b.setOverlay(0, 0, 0, 0);
      pose.push();
      def.root.child('right_arm').translateAndRotate(pose);
      pose.translate(-1.1875, 1.0625, -0.9375);
      pose.translate(0.5, 0.5, 0.5);
      pose.scale(0.5, 0.5, 0.5);
      pose.rotX(-90);
      pose.translate(-0.5, -0.5, -0.5);
      this.items.renderBlockState(b, pose, S('poppy'));
      pose.pop();
    }
  }

  /** vanilla CarriedBlockLayer */
  private drawCarriedBlock(b: EntityBatch, state: number): void {
    const pose = this.pose;
    b.setOverlay(0, 0, 0, 0);
    pose.push();
    pose.translate(0, 0.6875, -0.75);
    pose.rotX(20);
    pose.rotY(45);
    pose.translate(0.25, 0.1875, 0.25);
    pose.scale(-0.5, -0.5, 0.5);
    pose.rotY(90);
    this.items.renderBlockState(b, pose, state);
    pose.pop();
  }

  /** vanilla SquidRenderer (custom body rotations, tentacle bob) */
  private renderSquid(b: EntityBatch, e: Squid, dx: number, dy: number, dz: number, p: number, def: MobModelDef, tex: WebGLTexture): void {
    const pose = this.pose;
    pose.reset(this.base ?? undefined);
    pose.translate(dx, dy, dz);
    const bodyYaw = rotLerp(p, e.bodyYawO, e.bodyYaw);
    const xr = e.xBodyRotO + (e.xBodyRot - e.xBodyRotO) * p;
    const zr = e.zBodyRotO + (e.zBodyRot - e.zBodyRotO) * p;
    pose.translate(0, 0.5, 0);
    pose.rotY(180 - bodyYaw);
    pose.rotX(xr);
    pose.rotY(zr);
    pose.translate(0, -1.2, 0);
    if (e.deathTime > 0) {
      let f = ((e.deathTime + p - 1) / 20) * 1.6;
      f = Math.sqrt(Math.max(0, f));
      pose.rotZ(Math.min(1, f) * 90);
    }
    pose.scale(-1, -1, 1);
    pose.translate(0, -1.501, 0);
    M.animateSquid(def.root, e.oldTentacleAngle + (e.tentacleAngle - e.oldTentacleAngle) * p);
    this.overlay(b, e);
    this.drawBody(b, e, def, tex, false);
  }

  private drawEyes(b: EntityBatch, def: MobModelDef, texName: string, baby: boolean): void {
    const t = this.tex(texName);
    if (!t) return;
    b.setOverlay(0, 0, 0, 0);
    const lb = b.lightB, ls = b.lightS;
    b.lightB = b.lightS = 240;
    b.begin(this.state(t, { cutoff: -1, blend: true, additive: true, depthWrite: false, lit: false, useLightmap: false }));
    this.drawModel(b, def, baby);
    b.flush();
    b.lightB = lb;
    b.lightS = ls;
  }

  /**
   * vanilla CreeperPowerLayer (EnergySwirlLayer): the model blown up by 2 in creeper_armor, scrolling diagonally, added
   * at half strength over whatever is behind — no lighting, no hurt flash, both sides
   */
  private drawPowerSwirl(b: EntityBatch, e: Creeper, def: MobModelDef, p: number): void {
    const sm = this.models.creeper_armor, t = this.tex('creeper_armor');
    if (!sm || !t) return;
    copyPose(def.root, sm.root);
    const f = e.tickCount + p;
    const u = (f * 0.01) % 1;
    b.setOverlay(0, 0, 0, 0);
    b.begin(this.state(t, { cutoff: 0.1, blend: true, additive: true, lit: false, useLightmap: false, uvOffset: [u, u] }));
    this.drawModel(b, sm, false, 0.5, 0.5, 0.5, 1);
    b.flush();
  }

  /**
   * vanilla LightningBoltRenderer: eight 16-block segments jittering down from the sky to the strike point, two
   * branches off it, each drawn as four nested square tubes (the main one widening with height) in faint blue-white,
   * added onto the scene
   */
  private renderLightning(b: EntityBatch, e: LightningBolt, dx: number, dy: number, dz: number): void {
    this.whiteTex ??= createTexture(this.gl, 1, 1, new Uint8Array([255, 255, 255, 255]));
    b.setOverlay(0, 0, 0, 0);
    b.begin({ texture: this.whiteTex, cutoff: -1, blend: true, additive: true, cull: true, lit: false, useLightmap: false });
    const xs = new Float32Array(8), zs = new Float32Array(8);
    let fx = 0, fz = 0;
    const r0 = new Rand(e.seed);
    for (let i = 7; i >= 0; i--) {
      xs[i] = fx;
      zs[i] = fz;
      fx += r0.nextInt(11) - 5;
      fz += r0.nextInt(11) - 5;
    }
    // (vanilla blends SRC_ALPHA, ONE: colour 0.45, 0.45, 0.5 at alpha 0.3)
    const cr = 0.45 * 0.3, cg = 0.45 * 0.3, cb = 0.5 * 0.3;
    const quad = (x1: number, z1: number, j: number, x2: number, z2: number, o1: number, o2: number, e1: boolean, s1: boolean, e2: boolean, s2: boolean) => {
      const y0 = dy + j * 16, y1 = dy + (j + 1) * 16;
      const v = [
        dx + x1 + (e1 ? o2 : -o2), y0, dz + z1 + (s1 ? o2 : -o2),
        dx + x2 + (e1 ? o1 : -o1), y1, dz + z2 + (s1 ? o1 : -o1),
        dx + x2 + (e2 ? o1 : -o1), y1, dz + z2 + (s2 ? o1 : -o1),
        dx + x1 + (e2 ? o2 : -o2), y0, dz + z1 + (s2 ? o2 : -o2),
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) b.vertexRaw(v[k * 3], v[k * 3 + 1], v[k * 3 + 2], 0, 0, cr, cg, cb, 0.3, 0, 1, 0);
    };
    for (let j = 0; j < 4; j++) {
      const r1 = new Rand(e.seed);
      for (let k = 0; k < 3; k++) {
        const top = k > 0 ? 7 - k : 7;
        const bottom = k > 0 ? top - 2 : 0;
        let x = xs[top] - fx, z = zs[top] - fz;
        for (let s = top; s >= bottom; s--) {
          const px = x, pz = z;
          if (k === 0) {
            x += r1.nextInt(11) - 5;
            z += r1.nextInt(11) - 5;
          } else {
            x += r1.nextInt(31) - 15;
            z += r1.nextInt(31) - 15;
          }
          let o1 = 0.1 + j * 0.2;
          if (k === 0) o1 *= s * 0.1 + 1;
          let o2 = 0.1 + j * 0.2;
          if (k === 0) o2 *= (s - 1) * 0.1 + 1;
          quad(x, z, s, px, pz, o1, o2, false, false, true, false);
          quad(x, z, s, px, pz, o1, o2, true, false, true, true);
          quad(x, z, s, px, pz, o1, o2, true, true, false, true);
          quad(x, z, s, px, pz, o1, o2, false, true, false, false);
        }
      }
    }
    b.flush();
  }

  /** vanilla ItemInHandLayer (the right hand, or the left) */
  private drawHeldItem(b: EntityBatch, root: ModelPart, stack: ItemStack, baby: boolean, useTicks: number, left = false): void {
    drawArmItem(b, this.items, this.pose, root, stack, left, useTicks, baby);
  }

  private renderPlayer(b: EntityBatch, e: Player, dx: number, dy: number, dz: number, p: number): void {
    const crouch = e.crouching && !e.flying;
    const a = this.setupLiving(e, dx, dy + renderOffsetY(e), dz, p, 90, (pose) => pose.scale(0.9375, 0.9375, 0.9375));
    const m = this.player;
    // vanilla PlayerRenderer.setModelProperties: the skin's outer layer as the options have it; a spectator is
    // only a head
    const spectator = e.gameMode === 'spectator', sp = this.skinParts;
    for (const [name, part] of m.children) part.visible = !spectator || name === 'head';
    m.child('head').child('hat').visible = spectator || sp.hat;
    m.child('body').child('jacket').visible = sp.jacket;
    m.child('right_arm').child('right_sleeve').visible = sp.rightSleeve;
    m.child('left_arm').child('left_sleeve').visible = sp.leftSleeve;
    m.child('right_leg').child('right_pants').visible = sp.rightPants;
    m.child('left_leg').child('left_pants').visible = sp.leftPants;
    // vanilla HumanoidModel.setupAnim: well into a glide the head bends back to look ahead and the limbs barely swing
    // (the swing divided by (speed² / 0.2)³)
    const gliding = e.fallFlyTicks > 4;
    const still = gliding ? Math.max(1, ((e.dx * e.dx + e.dy * e.dy + e.dz * e.dz) / 0.2) ** 3) : 1;
    animateHumanoid(m, a.limbSwing, a.limbAmount / still, a.age, a.headYaw, gliding ? -45 : a.headPitch, attackAnim(e, p), crouch, !!e.vehicle, playerArms(e, this.mainArm));
    this.overlay(b, e);
    // vanilla: an invisible player's body isn't drawn (a spectator's is, faintly, to the spectator: themselves), the
    // armour and held items still are; a spectator has no layers at all
    if (!e.isInvisible()) {
      b.begin(this.state(this.skin));
      m.render(b, this.pose, 64, 64);
    } else if (e.level.player?.gameMode === 'spectator') {
      b.begin(this.state(this.skin, { blend: true, cutoff: 0.01, depthWrite: false }));
      m.render(b, this.pose, 64, 64, 1, 1, 1, 38 / 255);
      b.flush();
    }
    b.setOverlay(0, 0, 0, 0);
    // (vanilla PlayerRenderer's layers: HumanoidArmorLayer, then PlayerItemInHandLayer)
    if (!spectator) {
      this.armor.render(b, this.pose, m, e.inventory.armor, false);
      drawPlayerHeldItems(b, this.items, this.pose, m, e, this.mainArm);
      // vanilla CustomHeadLayer: what's worn on the head that isn't a helmet (a mob head, a carved pumpkin)
      const head = e.inventory.armor[3];
      const w = e.vehicle instanceof LivingEntity ? e.vehicle : e;
      if (head && !head.item.armor) renderHeadItem(b, this.pose, this.items, m, head, false, 1, 1, 1, w.walkAnimPos - w.walkAnimSpeed * (1 - p));
      // vanilla ElytraLayer
      this.elytra.render(b, this.pose, e, e.inventory.armor[2], false, crouch);
      // vanilla ParrotOnShoulderLayer: the left shoulder's, then the right's
      if (e.shoulderLeft) this.parrots.renderOnShoulder(b, this.pose, e.shoulderLeft, true, crouch, a, e.tickCount);
      if (e.shoulderRight) this.parrots.renderOnShoulder(b, this.pose, e.shoulderRight, false, crouch, a, e.tickCount);
      // vanilla SpinAttackEffectLayer
      if (e.isAutoSpinAttack()) this.items.trident.renderSpin(b, this.pose, a.age);
    }
  }

  // -------------------------------------------------------------------------
  // other entities

  private renderItemEntity(b: EntityBatch, ent: ItemEntity, dx: number, dy: number, dz: number, partial: number): void {
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    const age = ent.age + partial;
    const bobY = Math.sin(age / 10 + ent.bobOffset) * 0.1 + 0.1;
    const sy = this.items.displayScaleY(ent.stack, 'ground');
    pose.translate(0, bobY + 0.25 * sy, 0);
    pose.rotY(((age / 20 + ent.bobOffset) * 180) / Math.PI);
    const c = ent.stack.count;
    const copies = c > 48 ? 5 : c > 32 ? 4 : c > 16 ? 3 : c > 1 ? 2 : 1;
    const block3d = this.items.isBlockModel(ent.stack.item);
    let seed = ent.stack.item.id.length * 31 + 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < copies; i++) {
      pose.push();
      if (i > 0) {
        if (block3d) pose.translate((rnd() * 2 - 1) * 0.15, (rnd() * 2 - 1) * 0.15, (rnd() * 2 - 1) * 0.15);
        else pose.translate((rnd() * 2 - 1) * 0.15 * 0.5, (rnd() * 2 - 1) * 0.15 * 0.5, 0);
      }
      this.items.render(b, pose, ent.stack, 'ground');
      pose.pop();
      if (!block3d) pose.translate(0, 0, 0.09375);
    }
  }

  /** vanilla ArrowRenderer */
  private renderArrow(b: EntityBatch, e: Arrow, dx: number, dy: number, dz: number, p: number): void {
    const t = this.tex('arrow');
    if (!t) return;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.rotY(rotLerp(p, e.yawO, e.yaw) - 90);
    pose.rotZ(e.pitchO + (e.pitch - e.pitchO) * p);
    const f9 = e.shakeTime - p;
    if (f9 > 0) pose.rotZ(-Math.sin(f9 * 3) * f9);
    pose.rotX(45);
    pose.scale(0.05625, 0.05625, 0.05625);
    pose.translate(-4, 0, 0);
    b.begin(this.state(t, { cull: true }));
    const u5 = 0.15625, u3 = 0.3125;
    b.quad(pose, [-7, -2, -2, -7, -2, 2, -7, 2, 2, -7, 2, -2], [0, u5, u5, u5, u5, u3, 0, u3], -1, 0, 0);
    b.quad(pose, [-7, 2, -2, -7, 2, 2, -7, -2, 2, -7, -2, -2], [0, u5, u5, u5, u5, u3, 0, u3], 1, 0, 0);
    for (let j = 0; j < 4; j++) {
      pose.rotX(90);
      b.quad(pose, [-8, -2, 0, 8, -2, 0, 8, 2, 0, -8, 2, 0], [0, 0, 0.5, 0, 0.5, u5, 0, u5], 0, 1, 0);
    }
  }

  /** vanilla ExperienceOrbRenderer */
  private renderOrb(b: EntityBatch, level: Level, e: ExperienceOrb, x: number, y: number, z: number, dx: number, dy: number, dz: number, p: number, cam: Camera): void {
    const t = this.tex('experience_orb');
    if (!t) return;
    b.setOverlay(0, 0, 0, 0);
    const l = level.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    b.lightB = Math.min(15, (l & 15) + 7) * 16;
    b.lightS = (l >> 4) * 16;
    const icon = e.icon;
    const u0 = ((icon % 4) * 16) / 64, u1 = ((icon % 4) * 16 + 16) / 64;
    const v0 = (Math.floor(icon / 4) * 16) / 64, v1 = (Math.floor(icon / 4) * 16 + 16) / 64;
    const f8 = (e.tickCount + p) / 2;
    const r = (Math.sin(f8) + 1) * 0.5, bl = (Math.sin(f8 + 4.1887903) + 1) * 0.1;
    const yr = cam.yaw * RAD, pr = cam.pitch * RAD;
    const rx = -Math.cos(yr) * 0.3, rz = -Math.sin(yr) * 0.3;
    const ux = -Math.sin(yr) * Math.sin(pr) * 0.3, uy = Math.cos(pr) * 0.3, uz = Math.cos(yr) * Math.sin(pr) * 0.3;
    const cx = dx, cy = dy + 0.1, cz = dz;
    const P = (sx: number, sy: number): [number, number, number] => [cx + rx * sx + ux * sy, cy + uy * sy, cz + rz * sx + uz * sy];
    b.begin(this.state(t, { blend: true, cutoff: 0.01, lit: false }));
    const q: [number, number, number, number, number][] = [
      [...P(-0.5, -0.25), u0, v1],
      [...P(0.5, -0.25), u1, v1],
      [...P(0.5, 0.75), u1, v0],
      [...P(-0.5, 0.75), u0, v0],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) b.vertexRaw(q[k][0], q[k][1], q[k][2], q[k][3], q[k][4], r, 1, bl, 128 / 255, 0, 1, 0);
    b.flush();
  }

  /** vanilla TntRenderer */
  private renderTnt(b: EntityBatch, e: PrimedTnt, dx: number, dy: number, dz: number, p: number): void {
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy + 0.5, dz);
    const i = e.fuse;
    if (i - p + 1 < 10) {
      let f = 1 - (i - p + 1) / 10;
      f = Math.max(0, Math.min(1, f));
      f *= f;
      f *= f;
      const s = 1 + f * 0.3;
      pose.scale(s, s, s);
    }
    pose.rotY(-90);
    pose.translate(-0.5, -0.5, 0.5);
    pose.rotY(90);
    if (Math.floor(i / 5) % 2 === 0) b.setOverlay(1, 1, 1, 0.75);
    else b.setOverlay(0, 0, 0, 0);
    this.items.renderBlockState(b, pose, S('tnt'));
    b.setOverlay(0, 0, 0, 0);
  }

  /** vanilla ThrownItemRenderer: the item sprite facing the camera */
  /** vanilla ThrownItemRenderer(fullBright) for fireballs: a fire charge, glowing (3x for the ghast's, 0.75x for the blaze's) */
  private renderFireball(b: EntityBatch, e: Fireball, dx: number, dy: number, dz: number, cam: Camera): void {
    if (e.tickCount < 2 && dx * dx + dy * dy + dz * dz < 12.25) return;
    b.setOverlay(0, 0, 0, 0);
    b.lightB = 240;
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy + e.height / 2, dz);
    const sc = e instanceof LargeFireball ? 3 : 0.75;
    pose.scale(sc, sc, sc);
    pose.rotY(180 - cam.yaw);
    pose.rotX(-cam.pitch);
    this.items.render(b, pose, e.stack, 'ground');
  }

  private renderThrown(b: EntityBatch, e: ThrownItem, dx: number, dy: number, dz: number, cam: Camera): void {
    if (e.tickCount < 2 && dx * dx + dy * dy + dz * dz < 12.25) return;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.rotY(180 - cam.yaw);
    pose.rotX(-cam.pitch);
    this.items.render(b, pose, e.stack, 'ground');
  }

  /** vanilla ThrownItemRenderer(1, fullBright) for an eye of ender: the eye facing the camera, lit as if by a torch */
  private renderEyeOfEnder(b: EntityBatch, e: EyeOfEnder, dx: number, dy: number, dz: number, cam: Camera): void {
    if (e.tickCount < 2 && dx * dx + dy * dy + dz * dz < 12.25) return;
    b.setOverlay(0, 0, 0, 0);
    b.lightB = 240;
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.rotY(180 - cam.yaw);
    pose.rotX(-cam.pitch);
    this.items.render(b, pose, e.stack, 'ground');
  }

  /**
   * vanilla MinecartRenderer: drawn on the rail's centre line between its front and back wheel points
   * (0.3 either way), turned and tilted along the track, wobbling after a hit, with its block (the
   * chest) inside at 3/4 size.
   */
  private renderMinecart(b: EntityBatch, e: AbstractMinecart, x: number, y: number, z: number, dx: number, dy: number, dz: number, p: number): void {
    const def = this.models.minecart, tex = this.tex('minecart');
    if (!tex) return;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    const j = minecartJitter(e.id);
    pose.translate(j[0], j[1], j[2]);
    let yaw = e.yawO + (e.yaw - e.yawO) * p;
    let pitch = e.pitchO + (e.pitch - e.pitchO) * p;
    const on = e.getPos(x, y, z);
    if (on) {
      const front = e.getPosOffs(x, y, z, 0.3) ?? on, back = e.getPosOffs(x, y, z, -0.3) ?? on;
      pose.translate(on[0] - x, (front[1] + back[1]) / 2 - y, on[2] - z);
      let vx = back[0] - front[0], vy = back[1] - front[1], vz = back[2] - front[2];
      const l = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (l !== 0) {
        vx /= l;
        vy /= l;
        vz /= l;
        yaw = (Math.atan2(vz, vx) * 180) / Math.PI;
        pitch = Math.atan(vy) * 73;
      }
    }
    pose.translate(0, 0.375, 0);
    pose.rotY(180 - yaw);
    pose.rotZ(-pitch);
    const f5 = e.hurtTime - p, f6 = Math.max(0, e.damage - p);
    if (f5 > 0) pose.rotX(((Math.sin(f5) * f5 * f6) / 10) * e.hurtDir);
    const display = e.displayState();
    if (display) {
      pose.push();
      pose.scale(0.75, 0.75, 0.75);
      pose.translate(-0.5, (e.displayOffset() - 8) / 16, 0.5);
      pose.rotY(90);
      this.items.renderBlockState(b, pose, display);
      pose.pop();
    }
    pose.scale(-1, -1, 1);
    M.animateMinecart(def.root, -0.1);
    b.begin(this.state(tex));
    def.root.render(b, pose, def.texW, def.texH);
  }

  /** vanilla BoatRenderer */
  private renderBoat(b: EntityBatch, e: Boat, dx: number, dy: number, dz: number, p: number): void {
    const def = this.boatModels[e.type], tex = this.tex(`${e.type}_${e.variant}`);
    if (!def || !tex) return;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.translate(0, 0.375, 0);
    pose.rotY(180 - (e.yawO + (e.yaw - e.yawO) * p));
    // the hurt wobble
    const f = e.hurtTime - p, f1 = Math.max(0, e.damage - p);
    if (f > 0) pose.rotX(((Math.sin(f) * f * f1) / 10) * e.hurtDir);
    // rocking over a bubble column, about the (1, 0, 1) axis
    const bubble = e.bubbleAngleO + (e.bubbleAngle - e.bubbleAngleO) * p;
    if (bubble !== 0) {
      pose.rotY(-45);
      pose.rotX(bubble);
      pose.rotY(45);
    }
    pose.scale(-1, -1, 1);
    pose.rotY(90);
    M.animateBoat(def.root, e.getRowingTime(0, p), e.getRowingTime(1, p));
    b.begin(this.state(tex));
    def.root.render(b, pose, def.texW, def.texH);
    // vanilla RenderType.waterMask: the hull's inside written to depth only, so no water shows in the boat
    if (!e.isUnderWater()) this.waterPatches.push({ m: new Float32Array(pose.m), part: def.waterPatch, tex, texW: def.texW, texH: def.texH });
  }

  private renderWaterPatches(b: EntityBatch): void {
    if (!this.waterPatches.length) return;
    b.setOverlay(0, 0, 0, 0);
    for (const w of this.waterPatches) {
      this.pose.reset(w.m);
      b.begin(this.state(w.tex, { cutoff: -1, cull: true, lit: false, colorWrite: false }));
      w.part.render(b, this.pose, w.texW, w.texH);
    }
    b.flush();
    this.waterPatches.length = 0;
  }

  private renderFalling(b: EntityBatch, e: FallingBlockEntity, dx: number, dy: number, dz: number): void {
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx - 0.5, dy, dz - 0.5);
    this.items.renderBlockState(b, pose, e.state);
  }

  /** vanilla EntityRenderDispatcher.renderFlame */
  private renderFlame(b: EntityBatch, e: Entity, dx: number, dy: number, dz: number, camYaw: number, time: number): void {
    const t = this.fire();
    if (!t) return;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset(this.base ?? undefined);
    pose.translate(dx, dy, dz);
    const f = e.width * 1.4;
    pose.scale(f, f, f);
    let f1 = 0.5, f3 = e.height / f, f4 = 0, f5 = 0;
    pose.rotY(-camYaw + 180);
    pose.translate(0, 0, 0.3 - Math.floor(f3) * 0.02);
    const lb = b.lightB, ls = b.lightS;
    b.lightB = b.lightS = 240;
    b.begin(this.state(t, { lit: false }));
    const frame = time % this.fireFrames;
    const vh = 16 / (16 * this.fireFrames);
    for (let i = 0; f3 > 0; i++) {
      const variant = i % 2;
      let u0 = variant * 0.5, u1 = u0 + 0.5;
      const v0 = frame * vh, v1 = v0 + vh;
      if (Math.floor(i / 2) % 2 === 0) [u0, u1] = [u1, u0];
      b.quad(pose, [f1, -f4, f5, -f1, -f4, f5, -f1, 1.4 - f4, f5, f1, 1.4 - f4, f5], [u1, v1, u0, v1, u0, v0, u1, v0], 0, 1, 0);
      f3 -= 0.45;
      f4 -= 0.45;
      f1 *= 0.9;
      f5 += 0.03;
    }
    b.flush();
    b.lightB = lb;
    b.lightS = ls;
  }

  /** vanilla ScreenEffectRenderer.renderFire: two flame sheets over the lower screen */
  renderScreenFire(b: EntityBatch, width: number, height: number, fovDeg: number, time: number): void {
    const t = this.fire();
    if (!t) return;
    const gl = this.gl;
    const proj = new Float32Array(16);
    const f = 1 / Math.tan((fovDeg * Math.PI) / 360), near = 0.05, far = 100;
    proj[0] = f / (width / height);
    proj[5] = f;
    proj[10] = (far + near) / (near - far);
    proj[11] = -1;
    proj[14] = (2 * far * near) / (near - far);
    b.proj = proj;
    b.view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    b.fog = [0, 0];
    b.setOverlay(0, 0, 0, 0);
    b.lightB = b.lightS = 240;
    gl.depthFunc(gl.ALWAYS);
    b.begin(this.state(t, { blend: true, cutoff: 0.01, lit: false, useLightmap: false, depthWrite: false }));
    const frame = time % this.fireFrames;
    const vh = 1 / this.fireFrames;
    const u0 = 0.5, u1 = 1, v0 = frame * vh, v1 = v0 + vh;
    const pose = this.pose;
    for (let i = 0; i < 2; i++) {
      pose.reset();
      pose.translate(-(i * 2 - 1) * 0.24, -0.3, 0);
      pose.rotY((i * 2 - 1) * 10);
      b.quad(pose, [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5], [u1, v1, u0, v1, u0, v0, u1, v0], 0, 0, 1, 1, 1, 1, 0.9);
    }
    b.flush();
    gl.depthFunc(gl.LEQUAL);
  }

  // -------------------------------------------------------------------------

  /** vanilla EntityRenderDispatcher.renderShadow: projected onto full blocks below */
  private renderShadows(b: EntityBatch, level: Level, cam: Camera): void {
    const w = level.world;
    b.setOverlay(0, 0, 0, 0);
    b.begin({ texture: this.shadowTex, cutoff: -1, blend: true, cull: false, lit: false, useLightmap: false, depthWrite: false });
    for (const s of this.shadows) {
      const d2 = (s.x - cam.x) ** 2 + (s.y - cam.y) ** 2 + (s.z - cam.z) ** 2;
      const weight = (1 - d2 / 256) * s.strength;
      if (weight <= 0) continue;
      const size = s.radius;
      const f = Math.min(weight / 0.5, size);
      const i0 = Math.floor(s.x - size), i1 = Math.floor(s.x + size);
      const k0 = Math.floor(s.y - f), k1 = Math.floor(s.y);
      const j0 = Math.floor(s.z - size), j1 = Math.floor(s.z + size);
      for (let bz = j0; bz <= j1; bz++)
        for (let bx = i0; bx <= i1; bx++)
          for (let by = k0; by <= k1; by++) {
            const wgt = weight - (s.y - by) * 0.5;
            const below = w.getState(bx, by - 1, bz);
            if (FLAGS[below] & F_AIR || !(FLAGS[below] & F_FULL_COLLISION)) continue;
            const lvl = level.rawBrightness(bx, by, bz);
            if (lvl <= 3) continue;
            const fl = lvl / 15;
            const bright = fl / (4 - 3 * fl);
            let alpha = wgt * 0.5 * bright;
            if (alpha < 0) continue;
            if (alpha > 1) alpha = 1;
            const box = OUTLINE[below]?.[0] ?? [0, 0, 0, 1, 1, 1];
            const x0 = bx + box[0] - s.x, x1 = bx + box[3] - s.x;
            const yy = by + 0.0015 - s.y;
            const z0 = bz + box[2] - s.z, z1 = bz + box[5] - s.z;
            const u0 = -x0 / 2 / size + 0.5, u1 = -x1 / 2 / size + 0.5;
            const v0 = -z0 / 2 / size + 0.5, v1 = -z1 / 2 / size + 0.5;
            const ox = s.x - cam.x, oy = s.y - cam.y, oz = s.z - cam.z;
            const V: [number, number, number, number, number][] = [
              [x0, yy, z0, u0, v0],
              [x0, yy, z1, u0, v1],
              [x1, yy, z1, u1, v1],
              [x1, yy, z0, u1, v0],
            ];
            for (const k of [0, 1, 2, 0, 2, 3]) b.vertexRaw(V[k][0] + ox, V[k][1] + oy, V[k][2] + oz, V[k][3], V[k][4], 1, 1, 1, alpha, 0, 1, 0);
          }
    }
    b.flush();
  }
}

function gaussian(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

/** vanilla MinecartRenderer: a fixed per-cart offset of up to ±2 mm so carts in one spot don't z-fight */
function minecartJitter(id: number): [number, number, number] {
  let i = BigInt.asIntN(64, BigInt(id) * 493286711n);
  i = BigInt.asIntN(64, i * i * 4392167121n + i * 98761n);
  const f = (shift: bigint) => ((Number((i >> shift) & 7n) + 0.5) / 8 - 0.5) * 0.004;
  return [f(16n), f(20n), f(24n)];
}

/** vanilla LivingEntity.getAttackAnim */
/** vanilla EntityRenderer.getRenderOffset (PlayerRenderer: a crouching player sinks 2 pixels) */
function renderOffsetY(e: Entity): number {
  return e.type === 'player' && (e as Player).crouching && !(e as Player).flying ? -0.125 : 0;
}

function attackAnim(e: LivingEntity, p: number): number {
  let f = e.attackAnim - e.attackAnimO;
  if (f < 0) f++;
  return e.attackAnimO + f * p;
}

/**
 * vanilla LivingEntityRenderer.isShaking (HoglinRenderer: while it's turning into a zoglin; StriderRenderer: while
 * it's cold): the body twitches ±1.26°
 */
function shakeYaw(e: LivingEntity): number {
  return (e instanceof Hoglin && e.isConverting()) || (e instanceof Piglin && e.isConverting()) || (e instanceof Strider && e.suffocating) || (e instanceof ZombieVillager && e.converting) || (e instanceof Zombie && e.underWaterConverting)
    ? Math.cos(e.tickCount * 3.25) * Math.PI * 0.4
    : 0;
}

/** vanilla renderer shadow radii (babies half) */
function shadowRadius(e: Entity): number {
  // (Stage 4: illagers)
  if (RAIDER_SHADOW_RADII[e.type] !== undefined) return RAIDER_SHADOW_RADII[e.type];
  // (Stage 5: ocean)
  if (OCEAN_SHADOW_RADII[e.type] !== undefined) return OCEAN_SHADOW_RADII[e.type] * (e instanceof Mob && e.isBaby() ? 0.5 : 1);
  // (M8: goats)
  if (GOAT_SHADOW_RADII[e.type] !== undefined) return GOAT_SHADOW_RADII[e.type] * (e instanceof Mob && e.isBaby() ? 0.5 : 1);
  // (M9: frogs)
  if (FROG_SHADOW_RADII[e.type] !== undefined) return FROG_SHADOW_RADII[e.type];
  // (Stage 6: tameable animals; a foal's is half)
  let r = HORSE_SHADOW_RADII[e.type] ?? LLAMA_SHADOW_RADII[e.type] ?? PARROT_SHADOW_RADII[e.type] ?? POLAR_BEAR_SHADOW_RADII[e.type] ?? RABBIT_SHADOW_RADII[e.type] ?? FOX_SHADOW_RADII[e.type] ?? 0;
  switch (e.type) {
    case 'pig':
    case 'cow':
    case 'sheep':
      r = 0.7;
      break;
    case 'chicken':
    case 'silverfish':
      r = 0.3;
      break;
    case 'spider':
      r = 0.8;
      break;
    case 'cave_spider':
      r = 0.8 * 0.7;
      break;
    case 'minecart':
    case 'chest_minecart':
      r = 0.7;
      break;
    case 'squid':
      r = 0.7;
      break;
    case 'hoglin':
    case 'zoglin':
      r = 0.7;
      break;
    case 'cat':
    case 'ocelot':
      r = 0.4;
      break;
    case 'wolf':
    case 'strider':
    case 'villager':
    case 'wandering_trader':
    case 'snow_golem':
    case 'end_crystal':
    case 'ender_dragon':
      r = 0.5;
      break;
    case 'iron_golem':
      r = 0.7;
      break;
    case 'bat':
      r = 0.25;
      break;
    case 'boat':
    case 'chest_boat':
      r = 0.8;
      break;
    case 'enderman':
      r = 0.5;
      break;
    case 'ghast':
      r = 1.5;
      break;
    case 'slime':
    case 'magma_cube':
      r = 0.25 * (e as Slime).size;
      break;
    case 'zombie':
    case 'husk':
    case 'drowned':
    case 'zombie_villager':
    case 'zombified_piglin':
    case 'piglin':
    case 'skeleton':
    case 'stray':
    case 'wither_skeleton':
    case 'blaze':
    case 'creeper':
    case 'player':
    case 'tnt':
    case 'falling_block':
      r = 0.5;
      break;
    case 'item':
    case 'experience_orb':
      r = 0.15;
      break;
  }
  if (e instanceof Mob && e.isBaby()) r *= 0.5;
  return r;
}

/** vanilla EntityModel.copyPropertiesTo for layer models */
function copyPose(from: ModelPart, to: ModelPart): void {
  for (const [n, c] of from.children) {
    const t = to.children.get(n);
    if (!t) continue;
    t.x = c.x;
    t.y = c.y;
    t.z = c.z;
    t.xRot = c.xRot;
    t.yRot = c.yRot;
    t.zRot = c.zRot;
  }
}

/** vanilla MobRenderer.shouldRender's other half: the lead's holder (its culling box) is in view */
function leashHolderInView(h: Entity, cam: Camera, frustum: Frustum): boolean {
  const bb = h.bb;
  return frustum.testBox(bb.minX - cam.x, bb.minY - cam.y, bb.minZ - cam.z, bb.maxX - cam.x, bb.maxY - cam.y, bb.maxZ - cam.z);
}

/** vanilla LivingEntityRenderer.isEntityUpsideDown: a mob named Dinnerbone or Grumm */
function isUpsideDown(e: LivingEntity): boolean {
  return e.type !== 'player' && (e.customName === 'Dinnerbone' || e.customName === 'Grumm');
}

/** vanilla SheepFurLayer for a sheep named jeb_: its wool runs through the sixteen colours, a second and a quarter each */
function jebColor(e: Sheep, p: number): [number, number, number] {
  const i = Math.floor(e.tickCount / 25) + e.id;
  const a = sheepFurColor(i % 16), c = sheepFurColor((i + 1) % 16);
  const f = ((e.tickCount % 25) + p) / 25;
  return [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f];
}
