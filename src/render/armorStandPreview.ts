// The armour stand the smithing screen shows its result on (vanilla SmithingScreen's armorStandPreview: an
// ArmorStand with arms and no base plate, drawn by InventoryScreen.renderEntityInInventory through
// ArmorStandRenderer), rendered offscreen and copied onto the 2D GUI canvas like the inventory's player.

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack } from './entityRenderer';
import { ModelPart } from './model';
import { ArmorLayer } from './armorLayer';
import { drawArmItem } from './playerPose';
import type { ItemRenderer } from './itemRenderer';
import { mat4, ortho } from '../core/math';
import type { ItemStack } from '../item/item';
import { armorIndex } from '../item/equipment';
import { BLOCK_TEXTURES } from '../textures/blocks';
import { isAnim, type TexDef, type TexImage } from '../textures/tex';

const DEG = Math.PI / 180;

/**
 * vanilla ArmorStandModel.createBodyLayer (64x64): the stand's sticks, in ArmorStand's default pose (DEFAULT_*_POSE,
 * set by ArmorStandArmorModel.setupAnim); the base plate is there but the smithing screen's stand has none
 */
export function armorStandModel(): ModelPart {
  const root = new ModelPart();
  root.add('head', new ModelPart([{ x: -1, y: -7, z: -1, w: 2, h: 7, d: 2, u: 0, v: 0 }], [0, 1, 0]));
  root.add('body', new ModelPart([{ x: -6, y: 0, z: -1.5, w: 12, h: 3, d: 3, u: 0, v: 26 }]));
  root.add('right_arm', new ModelPart([{ x: -2, y: -2, z: -1, w: 2, h: 12, d: 2, u: 24, v: 0 }], [-5, 2, 0], [-15 * DEG, 0, 10 * DEG]));
  root.add('left_arm', new ModelPart([{ x: 0, y: -2, z: -1, w: 2, h: 12, d: 2, u: 32, v: 16, mirror: true }], [5, 2, 0], [-10 * DEG, 0, -10 * DEG]));
  root.add('right_leg', new ModelPart([{ x: -1, y: 0, z: -1, w: 2, h: 11, d: 2, u: 8, v: 0 }], [-1.9, 12, 0], [1 * DEG, 0, 1 * DEG]));
  root.add('left_leg', new ModelPart([{ x: -1, y: 0, z: -1, w: 2, h: 11, d: 2, u: 40, v: 16, mirror: true }], [1.9, 12, 0], [-1 * DEG, 0, -1 * DEG]));
  root.add('right_body_stick', new ModelPart([{ x: -3, y: 3, z: -1, w: 2, h: 7, d: 2, u: 16, v: 0 }]));
  root.add('left_body_stick', new ModelPart([{ x: 1, y: 3, z: -1, w: 2, h: 7, d: 2, u: 48, v: 16 }]));
  root.add('shoulder_stick', new ModelPart([{ x: -4, y: 10, z: -1, w: 8, h: 2, d: 2, u: 0, v: 48 }]));
  root.add('base_plate', new ModelPart([{ x: -6, y: 11, z: -6, w: 12, h: 1, d: 12, u: 0, v: 32 }], [0, 12, 0]));
  return root;
}

/**
 * the stand's wood (vanilla textures/entity/armorstand/wood.png, 64x64): oak planks all over and smooth stone where
 * the base plate's faces are. An approximation drawn from the block textures, not a copy of vanilla's ((armour stand)
 * the world's stands too: render/armorStandRenderer.ts)
 */
export function armorStandTexture(): Uint8ClampedArray {
  const still = (t: TexDef): TexImage => (isAnim(t) ? { w: t.w, h: t.h, data: t.frames[0] } : t);
  const wood = still(BLOCK_TEXTURES['oak_planks']()), stone = still(BLOCK_TEXTURES['smooth_stone']());
  const out = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const src = x < 48 && y >= 32 && y < 45 ? stone : wood;
      const i = ((y & 15) * src.w + (x & 15)) * 4, o = (y * 64 + x) * 4;
      out[o] = src.data[i];
      out[o + 1] = src.data[i + 1];
      out[o + 2] = src.data[i + 2];
      out[o + 3] = 255;
    }
  return out;
}

export class ArmorStandPreview {
  private fb: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private depth: WebGLRenderbuffer | null = null;
  private w = 0;
  private h = 0;
  private readonly pose = new PoseStack();
  private readonly proj = mat4();
  private readonly out = document.createElement('canvas');
  private pixels = new Uint8Array(0);
  private readonly model = armorStandModel();
  private readonly armor: ArmorLayer;
  private woodTex: WebGLTexture | null = null;
  /** what the stand wears (feet to head, EquipmentSlot order) and holds in its off hand */
  private readonly worn: (ItemStack | null)[] = [null, null, null, null];
  private offhand: ItemStack | null = null;

  constructor(private readonly gl: GL, private readonly batch: EntityBatch, private readonly items: ItemRenderer) {
    this.armor = new ArmorLayer(gl);
    // vanilla subInit: setShowArms(true), setNoBasePlate(true)
    this.model.child('base_plate').visible = false;
  }

  /**
   * vanilla SmithingScreen.updateArmorStandPreview: everything taken off, then the result put on (armour in its
   * slot, anything else in the off hand)
   */
  setItem(s: ItemStack | null): void {
    this.worn.fill(null);
    this.offhand = null;
    if (!s) return;
    const copy = s.copy();
    if (s.item.armor) this.worn[armorIndex(s.item.armor.slot)] = copy;
    else this.offhand = copy;
  }

  private ensure(w: number, h: number): void {
    if (this.fb && w === this.w && h === this.h) return;
    const gl = this.gl;
    if (this.fb) {
      gl.deleteFramebuffer(this.fb);
      gl.deleteTexture(this.tex);
      gl.deleteRenderbuffer(this.depth);
    }
    this.w = w;
    this.h = h;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    this.fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.out.width = w;
    this.out.height = h;
    this.pixels = new Uint8Array(w * h * 4);
  }

  /**
   * Draw the stand into the GUI rect (x1,y1)-(x2,y2) (GUI pixels) with its feet at (x, y), `scale` GUI pixels per
   * block. Returns a canvas to blit at (x1, y1).
   */
  render(guiScale: number, x1: number, y1: number, x2: number, y2: number, x: number, y: number, scale: number): HTMLCanvasElement {
    const W = Math.max(1, Math.round((x2 - x1) * guiScale)), H = Math.max(1, Math.round((y2 - y1) * guiScale));
    this.ensure(W, H);
    const gl = this.gl;
    this.woodTex ??= createTexture(gl, 64, 64, armorStandTexture());
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    ortho(this.proj, x1, x2, y2, y1, -1000, 1000);
    const b = this.batch;
    b.proj = this.proj;
    b.view = mat4();
    b.fog = [0, 0];
    b.lightB = 240;
    b.lightS = 240;
    b.light0 = [0.2, -1, 1];
    b.light1 = [-0.2, -1, 0];
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    // InventoryScreen.renderEntityInInventory: T(x, y, 50) S(s, s, -s), then ARMOR_STAND_ANGLE (rotationXYZ(25°, 0, 180°))
    pose.translate(x, y, 50);
    pose.scale(scale, scale, -scale);
    pose.rotX(25);
    pose.rotZ(180);
    // LivingEntityRenderer.render: ArmorStandRenderer.setupRotations (180 - yBodyRot 210), the flip and the drop
    pose.rotY(180 - 210);
    pose.scale(-1, -1, 1);
    pose.translate(0, -1.501, 0);
    // the stand (entityCutoutNoCull), its armour (HumanoidArmorLayer) and what it holds (ItemInHandLayer: the main
    // arm is the right, so the off hand is the left)
    b.begin({ texture: this.woodTex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true });
    this.model.render(b, pose, 64, 64);
    this.armor.render(b, pose, this.model, this.worn, false);
    if (this.offhand) drawArmItem(b, this.items, pose, this.model, this.offhand, true, -1);
    b.flush();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const ctx = this.out.getContext('2d')!;
    const id = ctx.createImageData(W, H);
    const px = this.pixels;
    for (let yy = 0; yy < H; yy++) id.data.set(px.subarray((H - 1 - yy) * W * 4, (H - yy) * W * 4), yy * W * 4);
    ctx.putImageData(id, 0, 0);
    return this.out;
  }
}
