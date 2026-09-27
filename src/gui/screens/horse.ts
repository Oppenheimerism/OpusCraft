// A horse's inventory screen (vanilla HorseInventoryScreen): its name over the black box it stands in, turning to
// follow the mouse; the saddle slot if it takes a saddle and the armour slot if it wears armour (a llama's carpet);
// a donkey's, mule's or llama's chest beside it.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import { HorseInventoryMenu } from '../../inventory/horseMenu';
import { horseHooks } from '../../entity/horse';
import { isLlama } from '../../entity/llama';
import { entityDisplayName } from '../../game/spawner';
import '../../textures/horseGui';

export class HorseInventoryScreen extends AbstractContainerScreen<HorseInventoryMenu> {
  constructor(game: Game, menu: HorseInventoryMenu) {
    super(game, menu, entityDisplayName(menu.horse));
  }

  renderBg(g: GuiGraphics, mx: number, my: number): void {
    const i = this.leftPos, j = this.topPos, h = this.menu.horse;
    g.sprite('container_horse', i, j, 176, 166);
    const cols = this.menu.columns;
    if (cols > 0) g.sprite('horse_chest_slots', i + 79, j + 17, cols * 18, 54, 0, 0, cols * 18, 54);
    if (h.isSaddleable()) g.sprite('horse_saddle_slot', i + 7, j + 17, 18, 18);
    // (vanilla: a llama's slot shows a carpet)
    if (h.canWearArmor()) g.sprite(isLlama(h) ? 'llama_armor_slot' : 'horse_armor_slot', i + 7, j + 35, 18, 18);
    this.game.renderEntityInInventory(g, i + 26, j + 18, i + 78, j + 70, 17, 0.25, mx, my, h);
  }
}

/** a horse's inventory opened (entity/horse.ts) shows this screen */
export function installHorseScreen(game: Game): void {
  horseHooks.openInventory = (h, p) => {
    if (p === game.player) game.setScreen(new HorseInventoryScreen(game, new HorseInventoryMenu(p, h)));
    else game.refuseGuestMenu(p);
  };
}
