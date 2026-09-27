// The crafter's screen (1.21; vanilla CrafterScreen): its grid under its name, centred; beside it its redstone, lit while
// it's powered, and what the grid would make. Clicking an empty slot of the grid with nothing in hand switches it off
// (it's barred, and takes nothing); clicking a switched-off slot, or swapping an item into it with a number key,
// switches it back on. Each switch clicks, lower for off. Hovering an empty slot that's on says it can be switched off.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import type { Slot, ClickType } from '../../inventory/container';
import { AbstractContainerScreen } from './container';
import { CrafterMenu, CrafterSlot } from '../../inventory/crafterMenu';
import '../../textures/crafterGui';

const LABEL = 0x404040;
/** vanilla gui.togglable_slot */
const DISABLED_SLOT_TOOLTIP = 'Click to disable slot';

export class CrafterScreen extends AbstractContainerScreen<CrafterMenu> {
  constructor(game: Game, menu: CrafterMenu) {
    super(game, menu, 'Crafter');
  }

  private get spectator(): boolean {
    return this.game.player.gameMode === 'spectator';
  }

  /** vanilla init: the title centred */
  override renderLabels(g: GuiGraphics): void {
    g.text(this.title, Math.floor((this.imageWidth - g.textWidth(this.title)) / 2), this.titleLabelY, LABEL, false);
    g.text('Inventory', this.inventoryLabelX, this.inventoryLabelY, LABEL, false);
  }

  /** vanilla renderBg and renderRedstone (its dust at the middle of the screen, 9 right and 48 up) */
  renderBg(g: GuiGraphics): void {
    g.sprite('container_crafter', this.leftPos, this.topPos, 176, 166);
    g.sprite(this.menu.powered ? 'crafter_powered_redstone' : 'crafter_unpowered_redstone', this.leftPos + 97, this.topPos + 35, 16, 16);
  }

  /** vanilla renderSlot / renderDisabledSlot: a switched-off slot drawn barred */
  protected override renderSlot(g: GuiGraphics, slot: Slot): void {
    if (slot instanceof CrafterSlot && this.menu.isSlotDisabled(slot.slot)) {
      g.sprite('crafter_disabled_slot', slot.x - 1, slot.y - 1, 18, 18);
      return;
    }
    super.renderSlot(g, slot);
  }

  /** vanilla slotClicked: switching an empty grid slot on or off, then the click as usual */
  protected override slotClicked(slot: Slot | null, slotId: number, button: number, type: ClickType): void {
    if (slot instanceof CrafterSlot && !slot.hasItem() && !this.spectator) {
      const off = this.menu.isSlotDisabled(slot.slot);
      if (type === 'pickup') {
        if (off) this.updateSlotState(slot.slot, true);
        else if (!this.menu.carried) this.updateSlotState(slot.slot, false);
      } else if (type === 'swap') {
        const inv = this.game.player.inventory;
        const held = button === 40 ? inv.offhand : inv.main[button];
        if (off && held) this.updateSlotState(slot.slot, true);
      }
    }
    super.slotClicked(slot, slotId, button, type);
  }

  /** vanilla updateSlotState: the switch, and its click (pitch 1 on, 0.75 off) */
  private updateSlotState(i: number, on: boolean): void {
    this.menu.setSlotState(i, on);
    this.game.sound.playUI('ui.button.click', 0.4, on ? 1 : 0.75);
  }

  /** vanilla render: the item's tooltip, or over an empty slot that's on (nothing in hand), how to switch it off */
  override renderTooltip(g: GuiGraphics, mx: number, my: number): void {
    const h = this.hoveredSlot;
    if (h instanceof CrafterSlot && !this.menu.isSlotDisabled(h.slot) && !this.menu.carried && !h.hasItem() && !this.spectator) {
      g.tooltip([DISABLED_SLOT_TOOLTIP], mx, my);
      return;
    }
    super.renderTooltip(g, mx, my);
  }

  /** what the grid makes can change without a click (a dropper filling it) */
  override tick(): void {
    super.tick();
    this.menu.refreshRecipeResult();
  }
}
