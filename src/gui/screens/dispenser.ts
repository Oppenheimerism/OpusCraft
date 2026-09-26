// The dispenser's and dropper's screen (vanilla DispenserScreen): the 3x3 grid under its name, centred. And the
// hopper's (vanilla HopperScreen): its row of five slots on a shorter panel.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import { DispenserMenu } from '../../inventory/dispenserMenu';
import { HopperMenu } from '../../inventory/hopperMenu';
import { setDispenserMenuHook } from '../../game/redstone/dispenser';
import { setHopperMenuHook } from '../../game/redstone/hopper';
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
    super(game, menu, 'Hopper');
    // (vanilla HopperScreen: 133 high, so the inventory's label sits at 39)
    this.imageHeight = 133;
  }

  renderBg(g: GuiGraphics): void {
    g.sprite('container_hopper', this.leftPos, this.topPos, 176, 133);
  }
}

/** a dispenser, dropper or hopper used (game/redstone/dispenser.ts, hopper.ts) opens its screen on it */
export function installDispenserScreen(game: Game): void {
  setDispenserMenuHook((be, p) => {
    if (p === game.player) game.setScreen(new DispenserScreen(game, new DispenserMenu(p, be)));
  });
  setHopperMenuHook((be, p) => {
    if (p === game.player) game.setScreen(new HopperScreen(game, new HopperMenu(p, be)));
  });
}
