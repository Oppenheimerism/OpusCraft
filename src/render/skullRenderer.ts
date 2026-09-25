// Mob heads as they're drawn (vanilla SkullBlockRenderer and its models: SkullModel for the skeletons', the creeper's,
// the zombie's and the player's heads, PiglinHeadModel and DragonHeadModel). A head block stands on the floor turned
// to one of sixteen ways or hangs against its wall; the item is the same head (vanilla BlockEntityWithoutLevelRenderer:
// renderSkull(null, 180) through models/item/template_skull.json's display) in the hand, on the ground, in a frame and
// in the inventory; worn, it sits a size up on the wearer's head (vanilla CustomHeadLayer). A powered dragon's head
// works its jaw and a piglin's its ears, from the block entity's count (world/skullBlockEntity.ts); worn, from the
// wearer's walk.

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import { setSpecialItemRenderer, type DisplayContext } from './itemRenderer';
import { setWornHeadRenderer } from './armorLayer';
import { setIconModelHook } from '../gui/itemIcons';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { DIR_NAMES, DX, DZ } from '../world/dir';
import { SkullBlockEntity } from '../world/skullBlockEntity';
import { skullOf, skullItemType, type SkullType } from '../world/blocksSkulls';
import { MOB_TEXTURES } from '../textures/mobs';
import { steveSkin } from '../textures/skin';
import { dragonTextures } from '../textures/enderDragon';
import type { TexImage } from '../textures/tex';
import type { Item, ItemStack } from '../item/item';

const DEG = Math.PI / 180;

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

/** vanilla Lighting.setupFor3DItems (the items with gui_light "side"), in a GUI space whose y points up */
const ITEM3D_LIGHT0: [number, number, number] = [-0.9334, 0.2627, -0.2443];
const ITEM3D_LIGHT1: [number, number, number] = [-0.1036, 0.9766, 0.1884];

interface HeadModel {
  /** vanilla SkullModelBase.setupAnim(mouthAnimation, yRot, xRot): degrees */
  setupAnim(mouth: number, yRot: number, xRot: number): void;
  /** vanilla renderToBuffer, the texture `w` by `h` */
  render(b: EntityBatch, pose: PoseStack, w: number, h: number): void;
}

const box = (x: number, y: number, z: number, w: number, h: number, d: number, u: number, v: number, mirror = false): Cube => ({ x, y, z, w, h, d, u, v, mirror });

/**
 * vanilla SkullModel: the 8-pixel head (createMobHeadLayer: the skeletons' and the creeper's) and, over it a quarter
 * pixel out, the hat (createHumanoidHeadLayer: the zombie's and the player's)
 */
function skullModel(hat: boolean): HeadModel {
  const head = new ModelPart([box(-4, -8, -4, 8, 8, 8, 0, 0)]);
  if (hat) head.add('hat', new ModelPart([{ ...box(-4, -8, -4, 8, 8, 8, 32, 0), inflate: 0.25 }]));
  return {
    setupAnim(_mouth, yRot, xRot) {
      head.yRot = yRot * DEG;
      head.xRot = xRot * DEG;
    },
    render: (b, pose, w, h) => head.render(b, pose, w, h),
  };
}

/** vanilla PiglinHeadModel: the piglin's head (PiglinModel.addHead: snout and tusks, the ears), the ears flapping */
function piglinHeadModel(): HeadModel {
  const head = new ModelPart([box(-5, -8, -4, 10, 8, 8, 0, 0), box(-2, -4, -5, 4, 4, 1, 31, 1), box(2, -2, -5, 1, 2, 1, 2, 4), box(-3, -2, -5, 1, 2, 1, 2, 0)]);
  const leftEar = head.add('left_ear', new ModelPart([box(0, 0, -2, 1, 5, 4, 51, 6)], [4.5, -6, 0], [0, 0, -Math.PI / 6]));
  const rightEar = head.add('right_ear', new ModelPart([box(-1, 0, -2, 1, 5, 4, 39, 6)], [-4.5, -6, 0], [0, 0, Math.PI / 6]));
  return {
    setupAnim(mouth, yRot, xRot) {
      head.yRot = yRot * DEG;
      head.xRot = xRot * DEG;
      leftEar.zRot = -(Math.cos(mouth * Math.PI * 0.2 * 1.2) + 2.5) * 0.2;
      rightEar.zRot = (Math.cos(mouth * Math.PI * 0.2) + 2.5) * 0.2;
    },
    render: (b, pose, w, h) => head.render(b, pose, w, h),
  };
}

/**
 * vanilla DragonHeadModel: the dragon's head as its body has it (the snout, the horns and nostrils, the jaw hinged
 * under it), three quarters its size; the jaw opens and shuts with the animation
 */
function dragonHeadModel(): HeadModel {
  const head = new ModelPart([
    box(-6, -1, -24, 12, 5, 16, 176, 44), // upper lip
    box(-8, -8, -10, 16, 16, 16, 112, 30), // upper head
    box(-5, -12, -4, 2, 4, 6, 0, 0, true), // scale
    box(-5, -3, -22, 2, 2, 4, 112, 0, true), // nostril
    box(3, -12, -4, 2, 4, 6, 0, 0),
    box(3, -3, -22, 2, 2, 4, 112, 0),
  ]);
  const jaw = head.add('jaw', new ModelPart([box(-6, 0, -16, 12, 4, 16, 176, 65)], [0, 4, -8]));
  return {
    setupAnim(mouth, yRot, xRot) {
      jaw.xRot = (Math.sin(mouth * Math.PI * 0.2) + 1) * 0.2;
      head.yRot = yRot * DEG;
      head.xRot = xRot * DEG;
    },
    render(b, pose, w, h) {
      pose.push();
      pose.translate(0, -0.374375, 0);
      pose.scale(0.75, 0.75, 0.75);
      head.render(b, pose, w, h);
      pose.pop();
    },
  };
}

/** vanilla SkullBlockRenderer.SKIN_BY_TYPE (a player head with no owner wears the default skin) */
const SKINS: Record<SkullType, () => TexImage> = {
  skeleton: () => MOB_TEXTURES.skeleton(),
  wither_skeleton: () => MOB_TEXTURES.wither_skeleton(),
  player: steveSkin,
  zombie: () => MOB_TEXTURES.zombie(),
  creeper: () => MOB_TEXTURES.creeper(),
  piglin: () => MOB_TEXTURES.piglin(),
  dragon: () => dragonTextures().skin,
};

interface Transform {
  rot: [number, number, number];
  trans: [number, number, number];
  scale: number;
}
const T = (rot: [number, number, number], trans: [number, number, number], scale: number): Transform => ({ rot, trans, scale });

/** vanilla models/item/template_skull.json's display (the left hand the right's, mirrored) */
const SKULL_DISPLAY: Record<DisplayContext, Transform> = {
  gui: T([30, 45, 0], [0, 3, 0], 1),
  ground: T([0, 0, 0], [0, 3, 0], 0.5),
  head: T([0, 180, 0], [0, 0, 0], 1),
  fixed: T([0, 180, 0], [0, 0, 0], 1),
  thirdperson_righthand: T([45, 45, 0], [0, 5, 2], 0.5),
  thirdperson_lefthand: T([45, 45, 0], [0, 5, 2], 0.5),
  firstperson_righthand: T([0, 135, 0], [0, 4, 0], 0.5),
  firstperson_lefthand: T([0, 135, 0], [0, 4, 0], 0.5),
};
/** vanilla models/item/dragon_head.json: in the inventory smaller, and off to one side so the snout fits */
const DRAGON_DISPLAY: Record<DisplayContext, Transform> = { ...SKULL_DISPLAY, gui: T([30, 45, 0], [-2, 2, 0], 0.6) };

const displayOf = (t: SkullType): Record<DisplayContext, Transform> => (t === 'dragon' ? DRAGON_DISPLAY : SKULL_DISPLAY);

/** vanilla ItemTransform.apply (drawn left: mirrored) */
function applyTransform(pose: PoseStack, t: Transform, left: boolean): void {
  const i = left ? -1 : 1;
  pose.translate((i * t.trans[0]) / 16, t.trans[1] / 16, t.trans[2] / 16);
  pose.rotX(t.rot[0]);
  pose.rotY(i * t.rot[1]);
  pose.rotZ(i * t.rot[2]);
  pose.scale(t.scale, t.scale, t.scale);
}

export class SkullRenderer {
  private readonly pose = new PoseStack();
  private readonly models: Record<SkullType, HeadModel> = {
    skeleton: skullModel(false),
    wither_skeleton: skullModel(false),
    player: skullModel(true),
    zombie: skullModel(true),
    creeper: skullModel(false),
    piglin: piglinHeadModel(),
    dragon: dragonHeadModel(),
  };
  private readonly textures = new Map<SkullType, { tex: WebGLTexture; w: number; h: number }>();

  constructor(private readonly gl: GL) {
    setSpecialItemRenderer('skull', {
      render: (b, pose, s, ctx, left) => this.renderItem(b, pose, s, ctx, left),
      displayScaleY: (s, ctx) => {
        const t = skullItemType(s.item.id);
        return t ? displayOf(t)[ctx].scale : undefined;
      },
    });
    setIconModelHook('skull', (it, b, pose) => this.renderIcon(it, b, pose));
    setWornHeadRenderer((b, pose, s, walk, villager) => this.renderWorn(b, pose, s, walk, villager));
  }

  /** the head's skin, made the first time it's drawn */
  private skin(t: SkullType): { tex: WebGLTexture; w: number; h: number } {
    let s = this.textures.get(t);
    if (!s) {
      const img = SKINS[t]();
      s = { tex: createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength)), w: img.w, h: img.h };
      this.textures.set(t, s);
    }
    return s;
  }

  /** vanilla RenderType.entityCutoutNoCullZOffset (in the inventory, lit as the GUI lights it: no lightmap) */
  private state(tex: WebGLTexture, gui: boolean): DrawState {
    return { texture: tex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: !gui };
  }

  /**
   * vanilla SkullBlockRenderer.renderSkull: the head of `type` in the block at the pose — on the floor (`facing` null)
   * in its middle, or against the wall behind `facing` (a Dir), half a block up — turned `yRot` degrees, at animation
   * `anim`
   */
  renderSkull(b: EntityBatch, pose: PoseStack, facing: number | null, yRot: number, anim: number, type: SkullType, gui = false): void {
    const m = this.models[type];
    const s = this.skin(type);
    pose.push();
    if (facing === null) pose.translate(0.5, 0, 0.5);
    else pose.translate(0.5 - DX[facing] * 0.25, 0.25, 0.5 - DZ[facing] * 0.25);
    pose.scale(-1, -1, 1);
    b.begin(this.state(s.tex, gui));
    m.setupAnim(anim, yRot, 0);
    m.render(b, pose, s.w, s.h);
    pose.pop();
  }

  /**
   * vanilla SkullBlockRenderer.render for every head in view: a wall head turned away from its wall, a floor head to
   * its rotation's sixteenth of a turn
   */
  renderBlockEntities(b: EntityBatch, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    const pose = this.pose;
    for (const be of level.world.blockEntities.values()) {
      if (!(be instanceof SkullBlockEntity) || be.removed) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      // (the dragon's reaches well past its block)
      if (!frustum.testBox(dx - 1, dy - 1, dz - 1, dx + 2, dy + 2, dz + 2)) continue;
      const st = level.getState(be.x, be.y, be.z);
      const block = BLOCKS[STATE_BLOCK[st]];
      const s = skullOf(block.name);
      if (!s) continue;
      let facing: number | null = null, yRot: number;
      if (s.wall) {
        facing = (DIR_NAMES as readonly string[]).indexOf(block.get<string>(st, 'facing'));
        // (vanilla RotationSegment.convertToSegment(facing.getOpposite()): the wall's side, in sixteenths)
        yRot = { north: 0, east: 90, south: 180, west: 270 }[DIR_NAMES[facing] as 'north' | 'east' | 'south' | 'west'];
      } else yRot = block.get<number>(st, 'rotation') * 22.5;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      b.setOverlay(0, 0, 0, 0);
      pose.reset();
      pose.translate(dx, dy, dz);
      this.renderSkull(b, pose, facing, yRot, be.getAnimation(partial), s.type);
    }
  }

  /**
   * vanilla BlockEntityWithoutLevelRenderer's heads: the item's display transform, then the head as on the floor of
   * the block, turned round (renderSkull(null, 180, 0))
   */
  renderItem(b: EntityBatch, pose: PoseStack, stack: ItemStack, ctx: DisplayContext, left: boolean): boolean {
    const t = skullItemType(stack.item.id);
    if (!t) return false;
    pose.push();
    applyTransform(pose, displayOf(t)[ctx], left);
    pose.translate(-0.5, -0.5, -0.5);
    this.renderSkull(b, pose, null, 180, 0, t, ctx === 'gui');
    pose.pop();
    return true;
  }

  /** the inventory icon: the item in its GUI transform, lit as vanilla lights 3D items there (gui_light "side") */
  private renderIcon(it: Item, b: EntityBatch, pose: PoseStack): boolean {
    const t = skullItemType(it.id);
    if (!t) return false;
    const l0 = b.light0, l1 = b.light1;
    b.light0 = ITEM3D_LIGHT0;
    b.light1 = ITEM3D_LIGHT1;
    b.setOverlay(0, 0, 0, 0);
    pose.push();
    applyTransform(pose, displayOf(t).gui, false);
    pose.translate(-0.5, -0.5, -0.5);
    this.renderSkull(b, pose, null, 180, 0, t, true);
    pose.pop();
    b.flush();
    b.light0 = l0;
    b.light1 = l1;
    return true;
  }

  /**
   * vanilla CustomHeadLayer's skull branch, from the head's pivot: 1.1875 times the size (a villager's a pixel
   * higher), set over the head as if on the floor of a block there, turned round; the jaw works with `walk`
   */
  renderWorn(b: EntityBatch, pose: PoseStack, stack: ItemStack, walk: number, villager: boolean): boolean {
    const t = skullItemType(stack.item.id);
    if (!t) return false;
    pose.push();
    pose.scale(1.1875, -1.1875, -1.1875);
    if (villager) pose.translate(0, 0.0625, 0);
    pose.translate(-0.5, 0, -0.5);
    this.renderSkull(b, pose, null, 180, walk, t);
    pose.pop();
    return true;
  }
}
