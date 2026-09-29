// The dispenser's and dropper's screen (vanilla DispenserScreen): the 3x3 grid under its name, centred. And the
// hopper's (vanilla HopperScreen): its row of five slots on a shorter panel.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import type { DispenserMenu } from '../../inventory/dispenserMenu';
import type { HopperMenu } from '../../inventory/hopperMenu';
import '../../textures/redstoneGui';

const LABEL = 0x404040;

export class DispenserScreen extends AbstractContainerScreen<DispenserMenu> {
  constructor(game: Game, menu: DispenserMenu) {
    super(game, menu, menu.dispenser.id === 'dropper' ? 'Dropper' : 'Dispenser');
  }

  /** vanilla init: the title centred over the grid */
  override renderLabels(g: GuiGraphics): void {
    g.text(this.title, Math.floor((this.imageWidth - g.textWidth(this.title)) / 2), this.titleLabelY, LABEL, false);
    g.text('Inventory', this.inventoryLabelX, this.inventoryLabelY, LABEL, false);
  }

  renderBg(g: GuiGraphics): void {
    g.sprite('container_dispenser', this.leftPos, this.topPos, 176, 166);
  }
}

export class HopperScreen extends AbstractContainerScreen<HopperMenu> {
  constructor(game: Game, menu: HopperMenu) {
    // ((minecarts) a hopper minecart's name)
    super(game, menu, menu.title);
    // (vanilla HopperScreen: 133 high, so the inventory's label sits at 39)
    this.imageHeight = 133;
  }

  renderBg(g: GuiGraphics): void {
    g.sprite('container_hopper', this.leftPos, this.topPos, 176, 133);
  }
}
