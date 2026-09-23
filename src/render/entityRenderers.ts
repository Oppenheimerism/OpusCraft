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
import * as M from './mobModels';
import type { MobModelDef } from './mobModels';
import type { Level } from '../game/level';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { Mob } from '../entity/mob';
import { ItemEntity } from '../entity/itemEntity';
import { Arrow } from '../entity/arrow';
import { ExperienceOrb } from '../entity/xpOrb';
import { PrimedTnt } from '../entity/tnt';
import { FallingBlockEntity } from '../entity/fallingBlock';
import { Sheep, Chicken, sheepFurColor } from '../entity/animals';
import { Zombie, Skeleton, Creeper, Enderman, Slime } from '../entity/monsters';
import { Squid } from '../entity/water';
import { ThrownItem } from '../entity/throwable';
import { AbstractMinecart } from '../entity/minecart';
import type { Player } from '../entity/player';
import { MOB_TEXTURES, FIRE_TEXTURES } from '../textures/mobs';
import { FLAGS, F_FULL_COLLISION, F_AIR, OUTLINE, S } from '../world/block';
import type { ItemStack } from '../item/item';
import { SpawnerBlockEntity } from '../world/blockEntity';
import { createMob } from '../game/spawner';

export interface EntityRenderOptions {
  shadows: boolean;
  /** draw the local player (third-person views) */
  drawPlayer: boolean;
  distanceScale: number;
  skinParts?: Record<string, boolean>;
}

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

  constructor(private readonly gl: GL, private readonly items: ItemRenderer, private readonly skin: WebGLTexture) {
    this.models = {
      pig: M.pigModel(),
      cow: M.cowModel(),
      sheep: M.sheepModel(),
      sheep_fur: M.sheepFurModel(),
      chicken: M.chickenModel(),
      zombie: M.zombieModel(),
      skeleton: M.skeletonModel(),
      creeper: M.creeperModel(),
      spider: M.spiderModel(),
      enderman: M.endermanModel(),
      squid: M.squidModel(),
      slime: M.slimeInnerModel(),
      slime_outer: M.slimeOuterModel(),
      minecart: M.minecartModel(),
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
    t = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
    this.textures.set(name, t);
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
    let drawn = 0;
    for (const e of level.entities) {
      if (e.removed) continue;
      if (e === level.player && !opts.drawPlayer) continue;
      const x = e.lerpX(partial), y = e.lerpY(partial), z = e.lerpZ(partial);
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const bb = e.bb;
      let size = (bb.maxX - bb.minX + bb.maxY - bb.minY + bb.maxZ - bb.minZ) / 3 || 1;
      if (e instanceof Arrow) size *= 10;
      const maxD = size * 64 * opts.distanceScale;
      if (d2 >= maxD * maxD) continue;
      const hw = (bb.maxX - bb.minX) / 2 + 0.5, h = bb.maxY - bb.minY + 0.5;
      if (!frustum.testBox(dx - hw, dy - 0.5, dz - hw, dx + hw, dy + h, dz + hw)) continue;
      this.renderEntity(b, level, e, x, y, z, dx, dy, dz, partial, cam);
      drawn++;
      if (opts.shadows) {
        const r = shadowRadius(e);
        if (r > 0) this.shadows.push({ x, y, z, radius: r, strength: e instanceof ItemEntity || e instanceof ExperienceOrb ? 0.75 : 1 });
      }
    }
    this.rendered = drawn;
    this.renderSpawners(b, level, cam, partial, frustum);
    b.setOverlay(0, 0, 0, 0);
    b.flush();
    if (this.shadows.length) this.renderShadows(b, level, cam);
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

  private setLight(b: EntityBatch, level: Level, e: Entity, x: number, y: number, z: number): void {
    const l = level.world.getLight(Math.floor(x), Math.floor(y + e.eyeHeight), Math.floor(z));
    b.lightS = (l >> 4) * 16;
    b.lightB = (e.isOnFire() ? 15 : l & 15) * 16;
  }

  private renderEntity(b: EntityBatch, level: Level, e: Entity, x: number, y: number, z: number, dx: number, dy: number, dz: number, p: number, cam: Camera): void {
    this.setLight(b, level, e, x, y, z);
    if (e instanceof ItemEntity) this.renderItemEntity(b, e, dx, dy, dz, p);
    else if (e instanceof Mob) this.renderMob(b, e, dx, dy, dz, p);
    else if (e instanceof LivingEntity && e.type === 'player') this.renderPlayer(b, e as Player, dx, dy, dz, p);
    else if (e instanceof Arrow) this.renderArrow(b, e, dx, dy, dz, p);
    else if (e instanceof ExperienceOrb) this.renderOrb(b, level, e, x, y, z, dx, dy, dz, p, cam);
    else if (e instanceof PrimedTnt) this.renderTnt(b, e, dx, dy, dz, p);
    else if (e instanceof FallingBlockEntity) this.renderFalling(b, e, dx, dy, dz);
    else if (e instanceof ThrownItem) this.renderThrown(b, e, dx, dy, dz, cam);
    else if (e instanceof AbstractMinecart) this.renderMinecart(b, e, x, y, z, dx, dy, dz, p);
    if (e.isOnFire() && !(e instanceof ItemEntity) && !(e instanceof ExperienceOrb)) this.renderFlame(b, e, dx, dy, dz, cam, level.gameTime);
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
    const bed = e.type === 'player' ? (e as Player).bedOrientation() : null;
    if (bed) {
      // vanilla LivingEntityRenderer: a sleeper lies along the bed, head on the pillow
      const f4 = 1.62 - 0.1;
      pose.translate(-BED_STEP[bed][0] * f4, 0, -BED_STEP[bed][1] * f4);
      pose.rotY(SLEEP_ROT[bed]);
      pose.rotZ(flip);
      pose.rotY(270);
    } else pose.rotY(180 - bodyYaw);
    if (e.deathTime > 0) {
      let f = ((e.deathTime + p - 1) / 20) * 1.6;
      f = Math.sqrt(Math.max(0, f));
      if (f > 1) f = 1;
      pose.rotZ(f * flip);
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

  /** vanilla AgeableListModel.renderToBuffer */
  private drawModel(b: EntityBatch, def: MobModelDef, baby: boolean, r = 1, g = 1, bl = 1, a = 1): void {
    const pose = this.pose;
    if (baby && def.baby) {
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
    const type = e.type;
    const def = this.models[type];
    const tex = this.tex(type);
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
      scale = (pose) => {
        pose.scale(0.999, 0.999, 0.999);
        pose.translate(0, 0.001, 0);
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
    const a = this.setupLiving(e, dx + jx, dy, dz + jz, p, type === 'spider' ? 180 : 90, scale);
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
        M.animateHumanoidMob(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attack, 'empty', !!e.vehicle);
        M.animateZombieArms(def.root, (e as Zombie).aggressive, attack, a.age);
        break;
      case 'skeleton': {
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
        M.animateSpider(def.root, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch);
        break;
      case 'enderman': {
        const en = e as Enderman;
        M.animateEnderman(def.root, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attack, en.carried !== 0, en.creepy);
        break;
      }
    }
    this.overlay(b, e, white);
    b.begin(this.state(tex));
    this.drawModel(b, def, baby);
    // layers
    if (e instanceof Sheep && !e.sheared) {
      const fur = this.models.sheep_fur, ft = this.tex('sheep_fur');
      if (fur && ft) {
        copyPose(def.root, fur.root);
        const [r, g, bl] = sheepFurColor(e.color);
        b.begin(this.state(ft));
        this.drawModel(b, fur, baby, r, g, bl);
      }
    }
    if (type === 'spider') this.drawEyes(b, def, 'spider_eyes', baby);
    if (e instanceof Enderman) {
      this.drawEyes(b, def, 'enderman_eyes', false);
      if (e.carried) this.drawCarriedBlock(b, e.carried);
    }
    if (e instanceof Slime) {
      const outer = this.models.slime_outer;
      if (outer) {
        this.overlay(b, e);
        b.begin(this.state(tex, { blend: true, cutoff: 0.01 }));
        this.drawModel(b, outer, false);
        b.flush();
      }
    }
    if (e.mainHand && (e instanceof Zombie || e instanceof Skeleton)) {
      b.setOverlay(0, 0, 0, 0);
      this.drawHeldItem(b, def.root, e.mainHand, baby, e.usingItem ? e.useItemTicks + p : -1);
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
    b.begin(this.state(tex));
    this.drawModel(b, def, false);
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

  /** vanilla ItemInHandLayer (right hand) */
  private drawHeldItem(b: EntityBatch, root: ModelPart, stack: ItemStack, baby: boolean, useTicks: number): void {
    const pose = this.pose;
    pose.push();
    if (baby) {
      pose.translate(0, 0.75, 0);
      pose.scale(0.5, 0.5, 0.5);
    }
    root.translateAndRotate(pose);
    root.child('right_arm').translateAndRotate(pose);
    pose.rotX(-90);
    pose.rotY(180);
    pose.translate(1 / 16, 0.125, -0.625);
    let tex: string | undefined;
    if (stack.item.id === 'bow' && useTicks >= 0) {
      const pull = useTicks / 20;
      tex = pull >= 0.9 ? 'bow_pulling_2' : pull >= 0.65 ? 'bow_pulling_1' : 'bow_pulling_0';
    }
    this.items.render(b, pose, stack, 'thirdperson_righthand', false, tex);
    pose.pop();
  }

  private renderPlayer(b: EntityBatch, e: Player, dx: number, dy: number, dz: number, p: number): void {
    const crouch = e.crouching && !e.flying;
    const a = this.setupLiving(e, dx, dy + (crouch ? -0.125 : 0), dz, p, 90, (pose) => pose.scale(0.9375, 0.9375, 0.9375));
    const m = this.player;
    animateHumanoid(m, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, attackAnim(e, p), crouch, !!e.vehicle);
    const held = e.inventory.selectedItem;
    if (held) {
      const ra = m.child('right_arm');
      ra.xRot = ra.xRot * 0.5 - Math.PI / 10;
    }
    this.overlay(b, e);
    b.begin(this.state(this.skin));
    m.render(b, this.pose, 64, 64);
    if (held) {
      b.setOverlay(0, 0, 0, 0);
      this.pose.push();
      m.translateAndRotate(this.pose);
      m.child('right_arm').translateAndRotate(this.pose);
      this.pose.rotX(-90);
      this.pose.rotY(180);
      this.pose.translate(1 / 16, 0.125, -0.625);
      this.items.render(b, this.pose, held, 'thirdperson_righthand');
      this.pose.pop();
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

  private renderFalling(b: EntityBatch, e: FallingBlockEntity, dx: number, dy: number, dz: number): void {
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx - 0.5, dy, dz - 0.5);
    this.items.renderBlockState(b, pose, e.state);
  }

  /** vanilla EntityRenderDispatcher.renderFlame */
  private renderFlame(b: EntityBatch, e: Entity, dx: number, dy: number, dz: number, cam: Camera, time: number): void {
    const t = this.fire();
    if (!t) return;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    const f = e.width * 1.4;
    pose.scale(f, f, f);
    let f1 = 0.5, f3 = e.height / f, f4 = 0, f5 = 0;
    pose.rotY(-cam.yaw + 180);
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
function attackAnim(e: LivingEntity, p: number): number {
  let f = e.attackAnim - e.attackAnimO;
  if (f < 0) f++;
  return e.attackAnimO + f * p;
}

/** vanilla renderer shadow radii (babies half) */
function shadowRadius(e: Entity): number {
  let r = 0;
  switch (e.type) {
    case 'pig':
    case 'cow':
    case 'sheep':
      r = 0.7;
      break;
    case 'chicken':
      r = 0.3;
      break;
    case 'spider':
      r = 0.8;
      break;
    case 'minecart':
    case 'chest_minecart':
      r = 0.7;
      break;
    case 'squid':
      r = 0.7;
      break;
    case 'enderman':
      r = 0.5;
      break;
    case 'slime':
      r = 0.25 * (e as Slime).size;
      break;
    case 'zombie':
    case 'skeleton':
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
