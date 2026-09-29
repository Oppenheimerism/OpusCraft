// (remaining mobs: the armadillo) vanilla WolfArmorLayer: a wolf's armour, on a copy of its model a fifth of a pixel
// bigger all round (ModelLayers.WOLF_ARMOR: WolfModel with CubeDeformation(0.2)) posed as the wolf is: the armour's
// own texture; then, dyed, its overlay in the dye's colour (maybeRenderColoredLayer); then, worn, its cracks drawn
// see-through (maybeRenderCracks, by Crackiness.WOLF_ARMOR). Drawn whether or not the wolf is invisible, and never
// flashing red as it's hurt (OverlayTexture.NO_OVERLAY).

import type { EntityBatch } from './entityRenderer';
import type { LivingKit } from './illagerRenderers';
import type { MobModelDef } from './mobModels';
import type { ModelPart } from './model';
import { wolfModel } from './wolfModel';
import type { Wolf } from '../entity/wolf';
import { wolfArmorCrackiness } from '../entity/wolfArmor';
import { dyedColor } from '../item/dyedColor';
import '../textures/armadillo';

/** the wolf's pose, part by part and all the way down, on the armour's model (vanilla runs setupAnim on it again) */
function copyPoseDeep(from: ModelPart, to: ModelPart): void {
  for (const [n, c] of from.children) {
    const t = to.children.get(n);
    if (!t) continue;
    t.x = c.x;
    t.y = c.y;
    t.z = c.z;
    t.xRot = c.xRot;
    t.yRot = c.yRot;
    t.zRot = c.zRot;
    t.visible = c.visible;
    copyPoseDeep(c, t);
  }
}

export class WolfArmorLayer {
  private readonly model = wolfModel(0.2);

  constructor(private readonly kit: LivingKit) {}

  /** after the wolf (and its collar) are drawn with `parent`, posed */
  render(b: EntityBatch, e: Wolf, parent: MobModelDef, baby: boolean): void {
    const armor = e.bodyArmor;
    if (!armor || armor.item.id !== 'wolf_armor') return;
    const kit = this.kit;
    const tex = kit.tex('wolf_armor');
    if (!tex) return;
    copyPoseDeep(parent.root, this.model.root);
    b.setOverlay(0, 0, 0, 0);
    b.begin(kit.state(tex));
    kit.drawModel(b, this.model, baby);
    // (vanilla DyedItemColor.getOrDefault(stack, 0): undyed, alpha 0, nothing; dyed, the colour made opaque)
    const c = dyedColor(armor, -1);
    const ot = c >= 0 ? kit.tex('wolf_armor_overlay') : null;
    if (ot) {
      b.begin(kit.state(ot));
      kit.drawModel(b, this.model, baby, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
    }
    const level = wolfArmorCrackiness(armor);
    const ct = level !== 'none' ? kit.tex(`wolf_armor_crackiness_${level}`) : null;
    if (ct) {
      // (vanilla RenderType.entityTranslucent)
      b.begin(kit.state(ct, { blend: true, cutoff: 0.01 }));
      kit.drawModel(b, this.model, baby);
      b.flush();
    }
  }
}
