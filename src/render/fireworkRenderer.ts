// A firework rocket in flight (vanilla FireworkEntityRenderer): its item as it lies on the ground, turned to face the
// camera; one shot at an angle (a crossbow's, a dispenser's) turned on its back and laid along the view. One fixed to
// a glider isn't drawn (vanilla FireworkRocketEntity.shouldRender).

import type { EntityBatch, PoseStack } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import type { Camera } from './renderer';
import type { FireworkRocket } from '../entity/fireworkRocket';

export function renderFireworkRocket(b: EntityBatch, pose: PoseStack, items: ItemRenderer, e: FireworkRocket, dx: number, dy: number, dz: number, cam: Camera): void {
  if (e.attachedTo) return;
  b.setOverlay(0, 0, 0, 0);
  pose.reset();
  pose.translate(dx, dy, dz);
  // (the dispatcher's camera orientation)
  pose.rotY(180 - cam.yaw);
  pose.rotX(-cam.pitch);
  if (e.shotAtAngle) {
    pose.rotZ(180);
    pose.rotY(180);
    pose.rotX(90);
  }
  items.render(b, pose, e.stack, 'ground');
}
