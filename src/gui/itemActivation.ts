// The item flung up over the screen when a totem of undying saves you (vanilla GameRenderer.displayItemActivation
// and renderItemActivation): for two seconds the item swells out of the middle of the screen, spinning, drifting
// towards a random corner and back, then shrinks away. Drawn here as the item's icon on the 2D canvas: the spin
// about the vertical axis as a horizontal squeeze (the back of the flat item showing mirrored), the small wobbles
// about the other two axes as a tilt; vanilla draws the item's 3D model (with its sixteenth of thickness) instead.

import type { GuiGraphics } from './guiGraphics';
import type { ItemStack } from '../item/item';

const state: { item: ItemStack | null; ticks: number; offX: number; offY: number } = { item: null, ticks: 0, offX: 0, offY: 0 };

/** vanilla displayItemActivation: 40 ticks of it, towards a random spot a quarter of the screen out at most */
export function displayItemActivation(s: ItemStack): void {
  state.item = s;
  state.ticks = 40;
  state.offX = Math.random() * 2 - 1;
  state.offY = Math.random() * 2 - 1;
}

/** vanilla GameRenderer.tick's part */
export function tickItemActivation(): void {
  if (state.ticks > 0 && --state.ticks === 0) state.item = null;
}

/** vanilla renderItemActivation (under the HUD) */
export function renderItemActivation(g: GuiGraphics, partial: number): void {
  const s = state.item;
  if (!s || state.ticks <= 0 || !g.icons) return;
  const i = 40 - state.ticks;
  const f = (i + partial) / 40;
  const f1 = f * f, f2 = f * f1;
  const f3 = 10.25 * f2 * f1 - 24.95 * f1 * f1 + 25.5 * f2 - 13.8 * f1 + 4 * f;
  const f4 = f3 * Math.PI;
  const f5 = state.offX * Math.floor(g.width / 4), f6 = state.offY * Math.floor(g.height / 4);
  const x = Math.floor(g.width / 2) + f5 * Math.abs(Math.sin(f4 * 2));
  const y = Math.floor(g.height / 2) + f6 * Math.abs(Math.sin(f4 * 2));
  // (the model is a block across: this many GUI pixels)
  const size = 50 + 175 * Math.sin(f4);
  const yRot = (900 * Math.abs(Math.sin(f4)) * Math.PI) / 180;
  const tilt = (6 * Math.cos(f * 8) * Math.PI) / 180;
  const ctx = g.ctx, sc = g.scale;
  ctx.save();
  ctx.translate(x * sc, y * sc);
  ctx.rotate(tilt);
  // (the x-axis wobble foreshortens it a little up and down)
  ctx.scale(Math.cos(yRot), Math.cos(tilt));
  ctx.imageSmoothingEnabled = false;
  const px = size * sc;
  g.icons.drawIcon(ctx, s.item.id, -px / 2, -px / 2, px);
  ctx.restore();
}
