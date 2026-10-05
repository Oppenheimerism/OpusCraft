// (the beacon) The beacon's screen (vanilla BeaconScreen): "Primary Power" with a row of buttons for each of the three
// tiers (speed and haste; resistance and jump boost; strength), "Secondary Power" with regeneration and the primary's
// own II, each power's button dark until the beacon's tiers reach it; the five payment items drawn beside the payment
// slot, the player's inventory below; Done (with a payment in and a primary chosen) and Cancel. Choosing a power only
// marks it here; Done sends both (a menu button) and closes. Whenever the beacon's numbers change, the choice goes back
// to the beacon's own (vanilla's dataChanged). Every button is a 22 px square that a tap presses as a click does, and
// a power's name shows over it under the pointer or the finger.

import type { Game } from '../../game/game';
import { Widget, playClick } from '../screen';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import { BeaconMenu, beaconButton } from '../../inventory/beaconMenu';
import { BEACON_EFFECTS } from '../../game/beacon';
import { MOB_EFFECTS } from '../../entity/effects';
import { ItemStack } from '../../item/item';
import '../../textures/beaconGui';

/** vanilla BeaconScreen's label colour (14737632) */
const LABEL = 0xe0e0e0;

/** vanilla BeaconScreen.BeaconScreenButton: 22x22, its sprite by its state, an icon on it */
abstract class BeaconScreenButton extends Widget {
  selected = false;
  constructor(x: number, y: number, tooltip?: string) {
    super(x, y, 22, 22);
    this.tooltip = tooltip;
  }
  render(g: GuiGraphics, mx: number, my: number): void {
    if (!this.visible) return;
    const sprite = !this.active ? 'beacon_button_disabled' : this.selected ? 'beacon_button_selected' : this.isMouseOver(mx, my) || this.focused ? 'beacon_button_highlighted' : 'beacon_button';
    g.sprite(sprite, this.x, this.y, 22, 22);
    this.renderIcon(g);
  }
  protected abstract renderIcon(g: GuiGraphics): void;
  abstract onPress(): void;
  abstract updateStatus(levels: number): void;
  override mouseClicked(mx: number, my: number, b: number): boolean {
    if (b !== 0 || !this.active || !this.isMouseOver(mx, my)) return false;
    playClick();
    this.onPress();
    return true;
  }
}

export class BeaconScreen extends AbstractContainerScreen<BeaconMenu> {
  /** vanilla primary and secondary: the powers chosen on the screen (not yet the beacon's) */
  primary: string | null;
  secondary: string | null;
  private readonly beaconButtons: BeaconScreenButton[] = [];
  /** the menu's numbers as last seen (vanilla's ContainerListener.dataChanged) */
  private seen: string;
  private static readonly PAYMENT = ['netherite_ingot', 'emerald', 'diamond', 'gold_ingot', 'iron_ingot'].map((id) => ItemStack.of(id));

  constructor(game: Game, menu: BeaconMenu, title = 'Beacon') {
    super(game, menu, title);
    this.imageWidth = 230;
    this.imageHeight = 219;
    this.primary = menu.primary;
    this.secondary = menu.secondary;
    this.seen = this.data();
  }

  private data(): string {
    return `${this.menu.levels} ${this.menu.primary} ${this.menu.secondary}`;
  }

  override init(): void {
    super.init();
    this.beaconButtons.length = 0;
    const L = this.leftPos, T = this.topPos;
    this.addBeaconButton(new ConfirmButton(this, L + 164, T + 107));
    this.addBeaconButton(new CancelButton(this, L + 190, T + 107));
    for (let i = 0; i <= 2; i++) {
      const j = BEACON_EFFECTS[i].length, k = j * 22 + (j - 1) * 2;
      for (let l = 0; l < j; l++) this.addBeaconButton(new PowerButton(this, L + 76 + l * 24 - Math.floor(k / 2), T + 22 + i * 25, BEACON_EFFECTS[i][l], true, i));
    }
    const j1 = BEACON_EFFECTS[3].length + 1, k1 = j1 * 22 + (j1 - 1) * 2;
    for (let l1 = 0; l1 < j1 - 1; l1++) this.addBeaconButton(new PowerButton(this, L + 167 + l1 * 24 - Math.floor(k1 / 2), T + 47, BEACON_EFFECTS[3][l1], false, 3));
    this.addBeaconButton(new UpgradeButton(this, L + 167 + (j1 - 1) * 24 - Math.floor(k1 / 2), T + 47, BEACON_EFFECTS[0][0]));
    this.updateButtons();
  }

  private addBeaconButton(b: BeaconScreenButton): void {
    this.beaconButtons.push(this.add(b));
  }

  /** vanilla updateButtons: each button's state for the beacon's tiers and what's chosen */
  updateButtons(): void {
    const levels = this.menu.levels;
    for (const b of this.beaconButtons) b.updateStatus(levels);
  }

  /** vanilla containerTick (and dataChanged: the choice back to the beacon's own when its numbers change) */
  override tick(): void {
    super.tick();
    const d = this.data();
    if (d !== this.seen) {
      this.seen = d;
      this.primary = this.menu.primary;
      this.secondary = this.menu.secondary;
    }
    this.updateButtons();
  }

  /** vanilla BeaconConfirmButton.onPress: both powers to the beacon (ServerboundSetBeaconPacket), and closed */
  confirm(): void {
    this.menu.clickMenuButton(beaconButton(this.primary, this.secondary));
    this.onClose();
  }

  renderBg(g: GuiGraphics): void {
    const i = this.leftPos, j = this.topPos;
    g.sprite('container_beacon', i, j, 230, 219);
    const P = BeaconScreen.PAYMENT;
    g.stack(P[0], i + 20, j + 109);
    g.stack(P[1], i + 41, j + 109);
    g.stack(P[2], i + 41 + 22, j + 109);
    g.stack(P[3], i + 42 + 44, j + 109);
    g.stack(P[4], i + 42 + 66, j + 109);
  }

  /** vanilla renderLabels: just the two headings (no title, no "Inventory") */
  override renderLabels(g: GuiGraphics): void {
    g.centered('Primary Power', 62, 10, LABEL);
    g.centered('Secondary Power', 169, 10, LABEL);
  }
}

/** vanilla BeaconPowerButton: one power; pressed, it's chosen as the primary or the secondary */
class PowerButton extends BeaconScreenButton {
  constructor(protected readonly screen: BeaconScreen, x: number, y: number, public effect: string, private readonly isPrimary: boolean, protected readonly tier: number) {
    super(x, y);
    this.setEffect(effect);
  }
  protected setEffect(effect: string): void {
    this.effect = effect;
    this.tooltip = this.description(effect);
  }
  protected description(effect: string): string {
    return MOB_EFFECTS[effect]?.name ?? effect;
  }
  onPress(): void {
    if (this.selected) return;
    if (this.isPrimary) this.screen.primary = this.effect;
    else this.screen.secondary = this.effect;
    this.screen.updateButtons();
  }
  protected renderIcon(g: GuiGraphics): void {
    g.sprite('mob_effect_' + this.effect, this.x + 2, this.y + 2, 18, 18);
  }
  updateStatus(levels: number): void {
    this.active = this.tier < levels;
    this.selected = this.effect === (this.isPrimary ? this.screen.primary : this.screen.secondary);
  }
}

/** vanilla BeaconUpgradePowerButton: the primary's own II as the secondary, shown once a primary's chosen */
class UpgradeButton extends PowerButton {
  constructor(screen: BeaconScreen, x: number, y: number, effect: string) {
    super(screen, x, y, effect, false, 3);
  }
  protected override description(effect: string): string {
    return `${super.description(effect)} II`;
  }
  override updateStatus(levels: number): void {
    const p = this.screen.primary;
    if (p !== null) {
      this.visible = true;
      this.setEffect(p);
      super.updateStatus(levels);
    } else this.visible = false;
  }
}

/** vanilla BeaconConfirmButton: Done, with a payment in and a primary chosen */
class ConfirmButton extends BeaconScreenButton {
  constructor(private readonly screen: BeaconScreen, x: number, y: number) {
    super(x, y, 'Done');
  }
  protected renderIcon(g: GuiGraphics): void {
    g.sprite('beacon_confirm', this.x + 2, this.y + 2, 18, 18);
  }
  onPress(): void {
    this.screen.confirm();
  }
  updateStatus(): void {
    this.active = this.screen.menu.hasPayment() && this.screen.primary !== null;
  }
}

/** vanilla BeaconCancelButton: closed, nothing changed (the payment given back as the menu closes) */
class CancelButton extends BeaconScreenButton {
  constructor(private readonly screen: BeaconScreen, x: number, y: number) {
    super(x, y, 'Cancel');
  }
  protected renderIcon(g: GuiGraphics): void {
    g.sprite('beacon_cancel', this.x + 2, this.y + 2, 18, 18);
  }
  onPress(): void {
    this.screen.onClose();
  }
  updateStatus(): void {}
}
