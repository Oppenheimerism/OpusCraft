// Block entity renderers of the archaeology blocks: vanilla DecoratedPotRenderer (the pot, each side with its sherd's
// pattern, wobbling when something goes in or it's knocked) and BrushableBlockRenderer (the find coming out of
// suspicious sand or gravel as it's brushed), drawn with the entity batch after the entities like the bell; and the
// pot as an item (vanilla BlockEntityWithoutLevelRenderer: in the hand, on the ground, in a frame, and as the
// inventory's icon, drawn offscreen at the GUI's angle and kept, like the banner's).

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import { addSpecialItemRenderer, type DisplayContext, type ItemRenderer } from './itemRenderer';
import type { Camera } from './renderer';
import { addStackIconHook } from '../gui/guiGraphics';
import { mat4, ortho, type Frustum } from '../core/math';
import type { Level } from '../game/level';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { DX, DY, DZ, UP, DOWN, NORTH, SOUTH, WEST, EAST } from '../world/dir';
import { DecoratedPotBlockEntity, potDecorations, WOBBLE_POSITIVE, WOBBLE_DURATION, type PotDecorations } from '../game/decoratedPot';
import { BrushableBlockEntity } from '../game/archaeology';
import { decoratedPotBaseTexture, decoratedPotSideTexture, patternOf } from '../textures/decoratedPot';
import type { TexImage } from '../textures/tex';

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

/** vanilla Direction.toYRot */
const Y_ROT: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

const DEG = 180 / Math.PI;

interface PotModel {
  neck: ModelPart;
  top: ModelPart;
  bottom: ModelPart;
  /** back, left, right, front (PotDecorations' order) */
  sides: ModelPart[];
}

/**
 * vanilla DecoratedPotRenderer.createBaseLayer (32x32: the neck and lip upside down over the body, the top and bottom
 * as flat plates) and createSidesLayer (16x16: a 14x16 face turned to each side; only its outer face is drawn, the
 * inner one faces into the pot and is culled)
 */
function potModel(): PotModel {
  const plate = (): Cube[] => [{ x: 0, y: 0, z: 0, w: 14, h: 0, d: 14, u: -14, v: 13 }];
  const side = (): Cube[] => [{ x: 0, y: 0, z: 0, w: 14, h: 16, d: 0, u: 1, v: 0 }];
  return {
    neck: new ModelPart(
      [
        { x: 4, y: 17, z: 4, w: 8, h: 3, d: 8, u: 0, v: 0, inflate: -0.1 },
        { x: 5, y: 20, z: 5, w: 6, h: 1, d: 6, u: 0, v: 5, inflate: 0.2 },
      ],
      [0, 37, 16],
      [Math.PI, 0, 0],
    ),
    top: new ModelPart(plate(), [1, 16, 1]),
    bottom: new ModelPart(plate(), [1, 0, 1]),
    sides: [
      new ModelPart(side(), [15, 16, 1], [0, 0, Math.PI]),
      new ModelPart(side(), [1, 16, 1], [0, -Math.PI / 2, Math.PI]),
      new ModelPart(side(), [15, 16, 15], [0, Math.PI / 2, Math.PI]),
      new ModelPart(side(), [1, 16, 15], [Math.PI, 0, 0]),
    ],
  };
}

interface Transform {
  rot: [number, number, number];
  trans: [number, number, number];
  scale: number;
}

/**
 * the pot item's display transforms, taken as models/item/template_chest.json's over block.json's (the pot is drawn
 * facing north, its front toward the viewer at the GUI's 45 degrees; see the report)
 */
const DISPLAY: Record<DisplayContext, Transform> = {
  gui: { rot: [30, 45, 0], trans: [0, 0, 0], scale: 0.625 },
  ground: { rot: [0, 0, 0], trans: [0, 3, 0], scale: 0.25 },
  fixed: { rot: [0, 180, 0], trans: [0, 0, 0], scale: 0.5 },
  head: { rot: [0, 180, 0], trans: [0, 0, 0], scale: 1 },
  thirdperson_righthand: { rot: [75, 315, 0], trans: [0, 2.5, 0], scale: 0.375 },
  thirdperson_lefthand: { rot: [75, 315, 0], trans: [0, 2.5, 0], scale: 0.375 },
  firstperson_righthand: { rot: [0, 315, 0], trans: [0, 0, 0], scale: 0.4 },
  firstperson_lefthand: { rot: [0, 225, 0], trans: [0, 0, 0], scale: 0.4 },
};

/**
 * the GUI's lights for a 3D item (vanilla Lighting.setupFor3DItems), in a GUI space whose y points up: the top lit
 * full, the left side a little and the right more shaded, as the block items' icons
 */
const GUI_LIGHT0: [number, number, number] = [-0.2225, 0.1716, 0.9597];
const GUI_LIGHT1: [number, number, number] = [-0.2151, 0.9718, 0.0966];

/** how many icons to keep before the oldest goes */
const ICON_CACHE = 64;

function upload(gl: GL, t: TexImage): WebGLTexture {
  return createTexture(gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength));
}

export class ArchaeologyRenderers {
  private readonly pose = new PoseStack();
  private readonly model = potModel();
  private baseTex: WebGLTexture | null = null;
  /** each side's texture by its pattern ('' the plain side) */
  private readonly sideTex = new Map<string, WebGLTexture>();
  private readonly icons = new Map<string, HTMLCanvasElement>();
  private iconBatch: EntityBatch | null = null;
  private fb: WebGLFramebuffer | null = null;
  private fbTex: WebGLTexture | null = null;
  private depth: WebGLRenderbuffer | null = null;
  private size = 0;
  private readonly proj = mat4();

  constructor(private readonly gl: GL) {
    addSpecialItemRenderer({
      render: (b, pose, s, ctx, left) => {
        if (s.item.id !== 'decorated_pot') return false;
        this.drawItem(b, pose, potDecorations(s), ctx, left);
        return true;
      },
      displayScaleY: (s, ctx) => (s.item.id === 'decorated_pot' ? DISPLAY[ctx].scale : undefined),
    });
    addStackIconHook((g, s, x, y) => {
      if (s.item.id !== 'decorated_pot') return false;
      const size = Math.max(1, Math.round(16 * g.scale));
      const icon = this.icon(potDecorations(s), size);
      if (!icon) return false;
      g.ctx.imageSmoothingEnabled = false;
      g.ctx.drawImage(icon, Math.round(x * g.scale), Math.round(y * g.scale), size, size);
      return true;
    });
  }

  private state(tex: WebGLTexture, useLightmap: boolean): DrawState {
    // (vanilla entitySolid: opaque, back faces culled)
    return { texture: tex, cutoff: -1, blend: false, cull: true, lit: true, useLightmap };
  }

  private side(item: string): WebGLTexture {
    const pattern = patternOf(item) ?? '';
    let t = this.sideTex.get(pattern);
    if (!t) this.sideTex.set(pattern, (t = upload(this.gl, decoratedPotSideTexture(pattern || null))));
    return t;
  }

  /** the pot in block space at the pose (vanilla DecoratedPotRenderer.render after its turn and wobble) */
  private drawPot(b: EntityBatch, pose: PoseStack, d: PotDecorations, useLightmap: boolean): void {
    const m = this.model;
    b.begin(this.state((this.baseTex ??= upload(this.gl, decoratedPotBaseTexture())), useLightmap));
    m.neck.render(b, pose, 32, 32);
    m.top.render(b, pose, 32, 32);
    m.bottom.render(b, pose, 32, 32);
    // (vanilla's order: the front, the back, the left, the right)
    for (const i of [3, 0, 1, 2]) {
      b.begin(this.state(this.side(d[i]), useLightmap));
      m.sides[i].render(b, pose, 16, 16);
    }
  }

  render(b: EntityBatch, items: ItemRenderer, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    for (const be of level.world.blockEntities.values()) {
      const pot = be instanceof DecoratedPotBlockEntity;
      if (be.removed || !(pot || be instanceof BrushableBlockEntity)) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx - 0.5, dy - 0.5, dz - 0.5, dx + 1.5, dy + 1.5, dz + 1.5)) continue;
      const st = level.getState(be.x, be.y, be.z);
      if (be instanceof DecoratedPotBlockEntity) this.renderPot(b, level, be, st, dx, dy, dz, partial);
      else if (be instanceof BrushableBlockEntity) this.renderBrushable(b, items, level, be, st, dx, dy, dz);
    }
  }

  /** vanilla DecoratedPotRenderer.render: turned to its facing, and its wobble while one runs */
  private renderPot(b: EntityBatch, level: Level, be: DecoratedPotBlockEntity, st: number, dx: number, dy: number, dz: number, partial: number): void {
    const block = BLOCKS[STATE_BLOCK[st]];
    if (block.name !== 'decorated_pot') return;
    const l = level.world.getLight(be.x, be.y, be.z);
    b.lightS = (l >> 4) * 16;
    b.lightB = (l & 15) * 16;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx + 0.5, dy, dz + 0.5);
    pose.rotY(180 - Y_ROT[block.get<string>(st, 'facing')]);
    const style = be.lastWobbleStyle;
    if (style !== null) {
      const g = (level.gameTime - be.wobbleStartedAtTick + partial) / WOBBLE_DURATION[style];
      if (g >= 0 && g <= 1) {
        // (vanilla rotateAround the middle of the pot's foot)
        if (style === WOBBLE_POSITIVE) {
          const k = g * Math.PI * 2;
          const tip = -1.5 * (Math.cos(k) + 0.5) * Math.sin(k / 2);
          pose.rotX(tip * 0.015625 * DEG);
          pose.rotZ(Math.sin(k) * 0.015625 * DEG);
        } else {
          const h = Math.sin(-g * 3 * Math.PI) * 0.125;
          pose.rotY(h * (1 - g) * DEG);
        }
      }
    }
    pose.translate(-0.5, 0, -0.5);
    this.drawPot(b, pose, be.decorations, true);
  }

  /**
   * vanilla BrushableBlockRenderer.render: once it's been brushed, the find sticks out of the face being brushed, a
   * little further at each stage, turned and at half size, lit by the light in front of that face
   */
  private renderBrushable(b: EntityBatch, items: ItemRenderer, level: Level, be: BrushableBlockEntity, st: number, dx: number, dy: number, dz: number): void {
    const block = BLOCKS[STATE_BLOCK[st]];
    if (block.propIndex('dusted') < 0) return;
    const k = block.get<number>(st, 'dusted');
    const dir = be.hitDirection;
    if (k <= 0 || dir === null || !be.item || be.item.count <= 0) return;
    const f = (k / 10) * 0.75;
    let tx = 0.5, ty = 0, tz = 0.5;
    if (dir === EAST) tx = 0.73 + f;
    else if (dir === WEST) tx = 0.25 - f;
    else if (dir === UP) ty = 0.25 + f;
    else if (dir === DOWN) ty = -0.23 - f;
    else if (dir === NORTH) tz = 0.25 - f;
    else if (dir === SOUTH) tz = 0.73 + f;
    const l = level.world.getLight(be.x + DX[dir], be.y + DY[dir], be.z + DZ[dir]);
    b.lightS = (l >> 4) * 16;
    b.lightB = (l & 15) * 16;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx + tx, dy + 0.5 + ty, dz + tz);
    pose.rotY(75);
    pose.rotY((dir === EAST || dir === WEST ? 90 : 0) + 11);
    pose.scale(0.5, 0.5, 0.5);
    items.render(b, pose, be.item, 'fixed');
  }

  /** vanilla BlockEntityWithoutLevelRenderer: the pot item, drawn as its block entity facing north with no level */
  private drawItem(b: EntityBatch, pose: PoseStack, d: PotDecorations, ctx: DisplayContext, left: boolean): void {
    const t = DISPLAY[ctx];
    pose.push();
    // (vanilla ItemTransform.apply: the left hand's is mirrored)
    pose.translate(((left ? -1 : 1) * t.trans[0]) / 16, t.trans[1] / 16, t.trans[2] / 16);
    pose.rotX(t.rot[0]);
    pose.rotY(left ? -t.rot[1] : t.rot[1]);
    pose.rotZ(left ? -t.rot[2] : t.rot[2]);
    pose.scale(t.scale, t.scale, t.scale);
    pose.translate(-0.5, -0.5, -0.5);
    // (facing north: vanilla's rotY(180 - 180) is none)
    this.drawPot(b, pose, d, ctx !== 'gui');
    pose.pop();
  }

  /** the inventory icon of a pot with these sides (vanilla renders the item with its GUI transform, lit as a 3D item) */
  private icon(d: PotDecorations, size: number): HTMLCanvasElement | null {
    const key = `${d.join(',')}@${size}`;
    const have = this.icons.get(key);
    if (have) {
      // (most recently used last)
      this.icons.delete(key);
      this.icons.set(key, have);
      return have;
    }
    if (typeof document === 'undefined') return null;
    const gl = this.gl;
    this.ensure(size);
    const b = (this.iconBatch ??= new EntityBatch(gl));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, size, size);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    ortho(this.proj, -8, 8, -8, 8, -100, 100);
    b.proj = this.proj;
    b.view = mat4();
    b.fog = [0, 0];
    b.lightB = 240;
    b.lightS = 240;
    b.light0 = GUI_LIGHT0;
    b.light1 = GUI_LIGHT1;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.scale(16, 16, 16);
    this.drawItem(b, pose, d, 'gui', false);
    b.flush();
    const pixels = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const id = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) id.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(id, 0, 0);
    this.icons.set(key, c);
    if (this.icons.size > ICON_CACHE) this.icons.delete(this.icons.keys().next().value!);
    return c;
  }

  private ensure(size: number): void {
    if (this.fb && size === this.size) return;
    const gl = this.gl;
    if (this.fb) {
      gl.deleteFramebuffer(this.fb);
      gl.deleteTexture(this.fbTex);
      gl.deleteRenderbuffer(this.depth);
    }
    this.size = size;
    this.fbTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
    this.fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
