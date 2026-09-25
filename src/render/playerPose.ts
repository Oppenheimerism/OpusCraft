// What a player's arms do with what they hold (vanilla PlayerRenderer.setModelProperties / getArmPose) and
// drawing a held item in a humanoid hand (vanilla ItemInHandLayer.renderArmWithItem): shared by the world's
// player and the inventory screen's preview.

import type { EntityBatch, PoseStack } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import { twoHanded, type HumanoidArmPose, type HumanoidArms, type ModelPart } from './model';
import type { Player } from '../entity/player';
import type { ItemStack } from '../item/item';
import type { Hand } from '../item/inventory';
import { crossbowChargeProgress, crossbowTexture, isCharged } from '../item/crossbow';

export type Arm = 'left' | 'right';

/** vanilla getArmPose for each hand, put on the arms by the main arm */
export function playerArms(e: Player, mainArm: Arm): HumanoidArms {
  const inv = e.inventory;
  const offArm: Arm = mainArm === 'right' ? 'left' : 'right';
  // drawing a bow or crossbow, holding a loaded crossbow (not mid-swing), or just holding something
  const armPose = (hand: Hand): HumanoidArmPose => {
    const s = inv.inHand(hand);
    if (!s) return 'empty';
    if (e.useHand === hand && e.useItem === s && e.useItemRemaining > 0) {
      if (s.item.id === 'shield') return 'block';
      if (s.item.id === 'bow') return 'bow';
      if (s.item.id === 'crossbow') return 'crossbow_charge';
      if (s.item.id === 'trident') return 'throw_spear';
      if (s.item.id === 'brush') return 'brush';
      // (M8: goats) vanilla UseAnim.TOOT_HORN
      if (s.item.id === 'goat_horn') return 'toot_horn';
    } else if (!e.swinging && s.item.id === 'crossbow' && isCharged(s)) return 'crossbow_hold';
    return 'item';
  };
  const mainPose = armPose('main');
  // (a two-handed pose in the main hand leaves the other arm just holding what it holds)
  const offPose: HumanoidArmPose = twoHanded(mainPose) ? (inv.inHand('off') ? 'item' : 'empty') : armPose('off');
  return {
    right: mainArm === 'right' ? mainPose : offPose,
    left: mainArm === 'right' ? offPose : mainPose,
    mainArm,
    usingArm: e.isUsingItem() ? (e.useHand === 'main' ? mainArm : offArm) : null,
    attackArm: e.swingingArm === 'main' ? mainArm : offArm,
    charge: e.useItem?.item.id === 'crossbow' ? crossbowChargeProgress(e.useItem, e.ticksUsingItem()) : 0,
  };
}

/**
 * vanilla ItemInHandLayer.renderArmWithItem: `stack` in the right or left hand of the humanoid `root` (posed,
 * with `pose` at the model origin); `useTicks`: how long it has been in use (-1: not), for a drawn bow or crossbow
 */
export function drawArmItem(b: EntityBatch, items: ItemRenderer, pose: PoseStack, root: ModelPart, stack: ItemStack, left: boolean, useTicks: number, baby = false): void {
  pose.push();
  if (baby) {
    pose.translate(0, 0.75, 0);
    pose.scale(0.5, 0.5, 0.5);
  }
  root.translateAndRotate(pose);
  root.child(left ? 'left_arm' : 'right_arm').translateAndRotate(pose);
  pose.rotX(-90);
  pose.rotY(180);
  pose.translate((left ? -1 : 1) / 16, 0.125, -0.625);
  let tex: string | undefined;
  if (stack.item.id === 'bow' && useTicks >= 0) {
    const pull = useTicks / 20;
    tex = pull >= 0.9 ? 'bow_pulling_2' : pull >= 0.65 ? 'bow_pulling_1' : 'bow_pulling_0';
  }
  // a crossbow: drawn (useTicks: how long it's been drawing) or loaded
  if (stack.item.id === 'crossbow') tex = crossbowTexture(stack, useTicks);
  // (vanilla's "throwing" model predicate: the trident is being drawn back)
  if (stack.item.id === 'trident' && useTicks >= 0) tex = 'trident_throwing';
  // (vanilla's "blocking" model predicate: the shield is in use, held up)
  if (stack.item.id === 'shield' && useTicks >= 0) tex = 'shield_blocking';
  items.render(b, pose, stack, left ? 'thirdperson_lefthand' : 'thirdperson_righthand', left, tex);
  pose.pop();
}

/** vanilla PlayerItemInHandLayer: the right arm's item, then the left's */
export function drawPlayerHeldItems(b: EntityBatch, items: ItemRenderer, pose: PoseStack, root: ModelPart, e: Player, mainArm: Arm): void {
  for (const arm of ['right', 'left'] as const) {
    const s = e.inventory.inHand(arm === mainArm ? 'main' : 'off');
    if (s) drawArmItem(b, items, pose, root, s, arm === 'left', e.useItem === s ? e.ticksUsingItem() : -1);
  }
}
