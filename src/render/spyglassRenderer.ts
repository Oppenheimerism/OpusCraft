// (spyglass) The spyglass drawn as a model (vanilla models/item/spyglass_in_hand, and PlayerItemInHandLayer's
// renderArmWithSpyglass; our own model): a copper tube, a narrow eyepiece with a leather grip going into a wider
// barrel with the lens at its end, 13 pixels long. It's its model in the hands, first and third person, and at the
// head; in the inventory, on the ground and in a frame it's its flat sprite (vanilla ItemRenderer: the spyglass's
// 2D model in the GUI, GROUND and FIXED contexts). While in use (and not mid-swing) a player holds it to the eye:
// drawn at the head, before the eye on the using arm's side, pointing along the look.

import type { GL } from './gl';
import { createTexture } from './gl';
import type { DrawState, EntityBatch, PoseStack } from './entityRenderer';
import { setSpecialItemRenderer, type DisplayContext, type ItemRenderer } from './itemRenderer';
import type { ModelPart } from './model';
import type { ItemStack } from '../item/item';
import { SPYGLASS_UV, spyglassModelTexture } from '../textures/spyglass';

interface Transform {
  rot: [number, number, number];
  trans: [number, number, number];
  scale: number;
}

/**
 * the model's display transforms (the tube stands along +y in its 16³ box, eyepiece down): held in the hand pointing
 * forward and a little up; in first person upright, leaning away; at the head turned to point ahead, the eyepiece
 * against the eye
 */
const DISPLAY: Partial<Record<DisplayContext, Transform>> = {
  thirdperson_righthand: { rot: [-20, 0, 0], trans: [0, 3, 0.5], scale: 0.6 },
  thirdperson_lefthand: { rot: [-20, 0, 0], trans: [0, 3, 0.5], scale: 0.6 },
  firstperson_righthand: { rot: [0, -90, 25], trans: [1.13, 4.2, 1.13], scale: 0.55 },
  firstperson_lefthand: { rot: [0, -90, 25], trans: [1.13, 4.2, 1.13], scale: 0.55 },
  head: { rot: [-90, 0, 0], trans: [0, 0, -12.4], scale: 1 },
};

type Box = { from: [number, number, number]; to: [number, number, number]; side: readonly number[]; up: readonly number[]; down: readonly number[] };

/** the eyepiece (grip and all) and the barrel, in 16ths of the item's box */
const BOXES: Box[] = [
  { from: [7, 2, 7], to: [9, 9, 9], side: SPYGLASS_UV.eyepieceSide, up: SPYGLASS_UV.barrelEnd, down: SPYGLASS_UV.eyepieceEnd },
  { from: [6.5, 9, 6.5], to: [9.5, 15, 9.5], side: SPYGLASS_UV.barrelSide, up: SPYGLASS_UV.lens, down: SPYGLASS_UV.barrelEnd },
];

/** a box's six faces as quads: corners anticlockwise from outside (top left first), the texture's top at +y (north, for up and down) */
function boxQuads(b: Box): { pos: number[]; uv: number[]; n: [number, number, number] }[] {
  const [x0, y0, z0] = b.from.map((v) => v / 16), [x1, y1, z1] = b.to.map((v) => v / 16);
  const uvOf = (r: readonly number[]) => {
    const u0 = r[0] / 16, v0 = r[1] / 16, u1 = (r[0] + r[2]) / 16, v1 = (r[1] + r[3]) / 16;
    return [u0, v0, u0, v1, u1, v1, u1, v0];
  };
  const side = uvOf(b.side);
  return [
    { pos: [x0, y1, z1, x0, y0, z1, x1, y0, z1, x1, y1, z1], uv: side, n: [0, 0, 1] },
    { pos: [x1, y1, z0, x1, y0, z0, x0, y0, z0, x0, y1, z0], uv: side, n: [0, 0, -1] },
    { pos: [x1, y1, z1, x1, y0, z1, x1, y0, z0, x1, y1, z0], uv: side, n: [1, 0, 0] },
    { pos: [x0, y1, z0, x0, y0, z0, x0, y0, z1, x0, y1, z1], uv: side, n: [-1, 0, 0] },
    { pos: [x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0], uv: uvOf(b.up), n: [0, 1, 0] },
    { pos: [x0, y0, z1, x0, y0, z0, x1, y0, z0, x1, y0, z1], uv: uvOf(b.down), n: [0, -1, 0] },
  ];
}

export class SpyglassRenderer {
  private tex: WebGLTexture | null = null;
  private readonly quads = BOXES.flatMap(boxQuads);

  constructor(private readonly gl: GL) {
    setSpecialItemRenderer('spyglass', {
      render: (b, pose, s, ctx, left) => this.renderItem(b, pose, s, ctx, left),
      // (the flat sprite's where the scale is asked: on the ground, in a frame)
      displayScaleY: () => undefined,
    });
  }

  /** vanilla ItemRenderer.render for the spyglass: its model in the hands and at the head (false elsewhere: the sprite) */
  private renderItem(b: EntityBatch, pose: PoseStack, s: ItemStack, ctx: DisplayContext, left: boolean): boolean {
    const t = s.item.id === 'spyglass' ? DISPLAY[ctx] : undefined;
    if (!t) return false;
    if (!this.tex) {
      const im = spyglassModelTexture();
      this.tex = createTexture(this.gl, im.w, im.h, new Uint8Array(im.data.buffer, im.data.byteOffset, im.data.byteLength), { clamp: true });
    }
    pose.push();
    // (vanilla ItemTransform.apply: in the left hand mirrored)
    const i = left ? -1 : 1;
    pose.translate((i * t.trans[0]) / 16, t.trans[1] / 16, t.trans[2] / 16);
    pose.rotX(t.rot[0]);
    pose.rotY(i * t.rot[1]);
    pose.rotZ(i * t.rot[2]);
    pose.scale(t.scale, t.scale, t.scale);
    pose.translate(-0.5, -0.5, -0.5);
    const st: DrawState = { texture: this.tex, cutoff: 0.1, blend: false, cull: true, lit: true, useLightmap: true };
    b.begin(st);
    for (const q of this.quads) b.quad(pose, q.pos, q.uv, q.n[0], q.n[1], q.n[2]);
    pose.pop();
    return true;
  }
}

/**
 * vanilla PlayerItemInHandLayer.renderArmWithSpyglass: the spyglass in use held to the eye on the `left` or right arm's
 * side, at the head of the humanoid `root` (posed; `pose` at the model origin), the head's pitch kept between 30° up
 * and 90° down
 */
export function drawSpyglassAtHead(b: EntityBatch, items: ItemRenderer, pose: PoseStack, root: ModelPart, stack: ItemStack, left: boolean): void {
  pose.push();
  root.translateAndRotate(pose);
  const head = root.child('head');
  const xRot = head.xRot;
  head.xRot = Math.max(-Math.PI / 6, Math.min(Math.PI / 2, head.xRot));
  head.translateAndRotate(pose);
  head.xRot = xRot;
  // vanilla CustomHeadLayer.translateToHead
  pose.translate(0, -0.25, 0);
  pose.rotY(180);
  pose.scale(0.625, -0.625, -0.625);
  pose.translate((left ? -2.5 : 2.5) / 16, -0.0625, 0);
  items.render(b, pose, stack, 'head', false);
  pose.pop();
}
