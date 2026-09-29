// (spyglass) The scope over the screen while scoping in first person (vanilla Gui.renderCameraOverlays and
// renderSpyglassOverlay): the scope's round view in a square the screen's shorter side across, growing from half that
// to 1.125 times it as the spyglass comes up (eased by half the way each tick), black all round; drawn under the rest
// of the HUD (the crosshair and the hotbar stay).

import type { GuiGraphics } from './guiGraphics';
import type { Player } from '../entity/player';
import { isScoping } from '../game/spyglass';
import '../textures/spyglassScope';

let scopeScale = 0.5;
let lastFrame = 0;

/** vanilla renderCameraOverlays' spyglass part, once a frame */
export function renderSpyglassOverlay(g: GuiGraphics, p: Player, firstPerson: boolean): void {
  // vanilla: scopeScale = lerp(0.5 × the frame's ticks, scopeScale, 1.125)
  const now = performance.now();
  const ticks = lastFrame ? Math.min(1, (now - lastFrame) / 50) : 0;
  lastFrame = now;
  scopeScale += (1.125 - scopeScale) * 0.5 * ticks;
  if (!firstPerson) return;
  if (!isScoping(p)) {
    scopeScale = 0.5;
    return;
  }
  const W = g.width, H = g.height;
  const size = Math.floor(Math.min(W, H) * scopeScale);
  const x0 = Math.floor((W - size) / 2), y0 = Math.floor((H - size) / 2), x1 = x0 + size, y1 = y0 + size;
  g.sprite('spyglass_scope', x0, y0, size, size, 0, 0, 256, 256);
  g.fill(0, y1, W, H, 0xff000000);
  g.fill(0, 0, W, y0, 0xff000000);
  g.fill(0, y0, x0, y1, 0xff000000);
  g.fill(x1, y0, W, y1, 0xff000000);
}
