// Llamas (Stage 6: tameable animals): vanilla LlamaRenderer with LlamaModel, the long neck carrying the head, a
// chest either side once it has one, and the legs swinging in pairs as it walks; a baby's head, body and legs each
// scaled on their own. LlamaDecorLayer lays its carpet over it (the same model half a pixel bigger), or a trader
// llama's livery if it has none. LlamaSpitRenderer: seven little gobs in a cross.

import type { EntityBatch, PoseStack, DrawState } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Llama } from '../entity/llama';
import '../textures/llama';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

const LEGS = ['right_hind_leg', 'left_hind_leg', 'right_front_leg', 'left_front_leg'];

/** vanilla LlamaModel.createBodyLayer (`g`: the decor's CubeDeformation(0.5)), 128x64 */
export function llamaModel(g = 0): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([
    { x: -2, y: -14, z: -10, w: 4, h: 4, d: 9, u: 0, v: 0, inflate: g },
    { x: -4, y: -16, z: -6, w: 8, h: 18, d: 6, u: 0, v: 14, inflate: g },
    { x: -4, y: -19, z: -4, w: 3, h: 3, d: 2, u: 17, v: 0, inflate: g },
    { x: 1, y: -19, z: -4, w: 3, h: 3, d: 2, u: 17, v: 0, inflate: g },
  ], [0, 7, -6]));
  root.add('body', part([{ x: -6, y: -10, z: -7, w: 12, h: 18, d: 10, u: 29, v: 0, inflate: g }], [0, 5, 2], [PI / 2, 0, 0]));
  root.add('right_chest', part([{ x: -3, y: 0, z: 0, w: 8, h: 8, d: 3, u: 45, v: 28, inflate: g }], [-8.5, 3, 3], [0, PI / 2, 0]));
  root.add('left_chest', part([{ x: -3, y: 0, z: 0, w: 8, h: 8, d: 3, u: 45, v: 41, inflate: g }], [5.5, 3, 3], [0, PI / 2, 0]));
  const legs: [string, number, number][] = [['right_hind_leg', -3.5, 6], ['left_hind_leg', 3.5, 6], ['right_front_leg', -3.5, -5], ['left_front_leg', 3.5, -5]];
  for (const [n, x, z] of legs) root.add(n, part([{ x: -2, y: 0, z: -2, w: 4, h: 14, d: 4, u: 29, v: 29, inflate: g }], [x, 10, z]));
  // (vanilla LlamaModel.renderToBuffer, young: the head, the body, and the legs and chests each their own size)
  return {
    root, texW: 128, texH: 64,
    babyGroups: [
      { parts: ['head'], scale: [0.71428573, 0.64935064, 0.7936508], translate: [0, 1.3125, 0.22] },
      { parts: ['body'], scale: [0.625, 0.45454544, 0.45454544], translate: [0, 2.0625, 0] },
      { parts: [...LEGS, 'right_chest', 'left_chest'], scale: [0.45454544, 0.41322312, 0.45454544], translate: [0, 2.0625, 0] },
    ],
  };
}

/** vanilla LlamaModel.setupAnim */
function animateLlama(root: ModelPart, e: Llama, a: LivingAnim): void {
  const head = root.child('head');
  head.xRot = a.headPitch * RAD;
  head.yRot = a.headYaw * RAD;
  const f = Math.cos(a.limbSwing * 0.6662) * 1.4 * a.limbAmount, g = Math.cos(a.limbSwing * 0.6662 + PI) * 1.4 * a.limbAmount;
  root.child('right_hind_leg').xRot = f;
  root.child('left_hind_leg').xRot = g;
  root.child('right_front_leg').xRot = g;
  root.child('left_front_leg').xRot = f;
  root.child('right_chest').visible = root.child('left_chest').visible = !e.isBaby() && e.hasChest;
}

/** vanilla LlamaRenderer's shadow */
export const LLAMA_SHADOW_RADII: Record<string, number> = { llama: 0.7, trader_llama: 0.7 };

export class LlamaRenderers {
  private readonly model = llamaModel();
  /** (vanilla ModelLayers.LLAMA_DECOR) */
  private readonly decor = llamaModel(0.5);

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a llama (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Llama)) return false;
    const kit = this.kit;
    const tex = kit.tex(e.texture());
    if (!tex) return true;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    animateLlama(this.model.root, e, a);
    const baby = e.isBaby();
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, baby);
    // vanilla LlamaDecorLayer: its carpet, else a trader llama's livery; never flashing red (NO_OVERLAY)
    const swag = e.swag();
    const dt = swag ? kit.tex('llama_decor_' + swag) : e.isTraderLlama() ? kit.tex('llama_decor_trader') : null;
    if (dt) {
      animateLlama(this.decor.root, e, a);
      b.setOverlay(0, 0, 0, 0);
      b.begin(kit.state(dt));
      kit.drawModel(b, this.decor, baby);
    }
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}

/** vanilla LlamaSpitModel: seven 2x2x2 gobs, all on the one patch of texture */
const SPIT = new ModelPart(
  ([[-4, 0, 0], [0, -4, 0], [0, 0, -4], [0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]] as const).map(([x, y, z]) => ({ x, y, z, w: 2, h: 2, d: 2, u: 0, v: 0 })),
);

/** vanilla LlamaSpitRenderer: at camera-relative (dx, dy, dz), turned along its flight (`yaw`, `pitch` already lerped) */
export function renderSpit(b: EntityBatch, pose: PoseStack, state: DrawState, dx: number, dy: number, dz: number, yaw: number, pitch: number): void {
  b.setOverlay(0, 0, 0, 0);
  b.begin(state);
  pose.reset();
  pose.translate(dx, dy + 0.15, dz);
  pose.rotY(yaw - 90);
  pose.rotZ(pitch);
  SPIT.render(b, pose, 64, 32);
}
