// The trading screen (vanilla MerchantScreen): the villager's offers as a scrolling list of seven buttons on the left,
// the payment and result slots with the villager's level and experience bar on the right, and the inventory below.

import type { Game } from '../../game/game';
import { Button } from '../screen';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen, itemTooltip } from './container';
import type { MerchantMenu } from '../../inventory/merchantMenu';
import type { MerchantOffer } from '../../entity/trading';
import type { ItemStack } from '../../item/item';
import { LEVEL_NAMES, canLevelUp, minXpPerLevel, maxXpPerLevel } from '../../entity/villager';
import { entityDisplayName } from '../../game/spawner';
import '../../textures/villagerGui';

const LABEL = 0x404040;
const BUTTONS = 7;
const SCROLL_H = 139;
const SCROLLER_H = 27;

/** a stack's count as vanilla renderItemDecorations draws it (with `force`, a lone item shows its 1 too) */
function count(g: GuiGraphics, n: number, x: number, y: number, force: boolean): void {
  if (n <= 1 && !force) return;
  const s = String(n);
  g.text(s, x + 19 - 2 - g.textWidth(s), y + 6 + 3, 0xffffff, true);
}

function decorated(g: GuiGraphics, s: ItemStack, x: number, y: number): void {
  g.stack(s, x, y);
  g.itemDecorations(s.count, s.damage, s.item.maxDamage, x, y);
}

/** vanilla MerchantScreen.TradeOfferButton: an 88x20 button showing one offer */
class TradeOfferButton extends Button {
  constructor(private readonly screen: MerchantScreen, x: number, y: number, readonly index: number, onPress: (b: Button) => void) {
    super(x, y, 88, 20, '', onPress);
    this.visible = false;
  }

  offer(): MerchantOffer | null {
    return this.screen.menu.offers()[this.index + this.screen.scrollOff] ?? null;
  }

  override render(g: GuiGraphics, mx: number, my: number): void {
    super.render(g, mx, my);
    if (!this.visible) return;
    const o = this.offer();
    if (!o) return;
    const L = this.screen.leftPos;
    const y = this.y + 1;
    const real = o.costA(), base = o.baseCostA;
    const x = L + 10;
    // vanilla renderAndDecorateCostA: a changed price shows the old count struck through and the new one beside it
    g.stack(real, x, y);
    if (base.count === real.count) g.itemDecorations(real.count, real.damage, real.item.maxDamage, x, y);
    else {
      count(g, base.count, x, y, base.count === 1);
      count(g, real.count, x + 14, y, real.count === 1);
      g.sprite('villager_discount_strikethrough', x + 7, y + 12, 9, 2);
    }
    const b = o.costBStack();
    if (b) decorated(g, b, L + 5 + 35, y);
    g.sprite(o.isOutOfStock() ? 'villager_trade_arrow_out_of_stock' : 'villager_trade_arrow', L + 5 + 35 + 20, y + 3, 10, 9);
    decorated(g, o.result, L + 5 + 68, y);
  }

  /** vanilla renderToolTip: whichever of the offer's items is under the mouse */
  hoveredStack(mx: number): ItemStack | null {
    const o = this.offer();
    if (!o) return null;
    if (mx < this.x + 20) return o.costA();
    if (mx < this.x + 50 && mx > this.x + 30) return o.costBStack();
    if (mx > this.x + 65) return o.result;
    return null;
  }
}

export class MerchantScreen extends AbstractContainerScreen<MerchantMenu> {
  /** the offer picked last (vanilla shopItem) */
  private shopItem = 0;
  scrollOff = 0;
  private dragging = false;
  private readonly buttons: TradeOfferButton[] = [];

  constructor(game: Game, menu: MerchantMenu) {
    super(game, menu, entityDisplayName(menu.trader));
    this.imageWidth = 276;
    this.inventoryLabelX = 107;
  }

  override init(): void {
    super.init();
    this.buttons.length = 0;
    let y = this.topPos + 16 + 2;
    for (let i = 0; i < BUTTONS; i++) {
      const b = this.add(
        new TradeOfferButton(this, this.leftPos + 5, y, i, (btn) => {
          this.shopItem = (btn as TradeOfferButton).index + this.scrollOff;
          for (const o of this.buttons) o.focused = o === btn;
          this.postButtonClick();
        }),
      );
      this.buttons.push(b);
      y += 20;
    }
    this.updateButtons();
  }

  /** vanilla postButtonClick (and the server's handleSelectTrade) */
  private postButtonClick(): void {
    this.menu.setSelectionHint(this.shopItem);
    this.menu.tryMoveItems(this.shopItem);
  }

  private canScroll(n: number): boolean {
    return n > BUTTONS;
  }

  private updateButtons(): void {
    const n = this.menu.offers().length;
    for (const b of this.buttons) b.visible = b.index < n;
  }

  override renderLabels(g: GuiGraphics): void {
    const lvl = this.menu.traderLevel();
    const title = lvl > 0 && lvl <= 5 && this.menu.showProgressBar() ? `${this.title} - ${LEVEL_NAMES[lvl - 1]}` : this.title;
    g.text(title, 49 + Math.floor(this.imageWidth / 2) - Math.floor(g.textWidth(title) / 2), 6, LABEL, false);
    g.text('Inventory', this.inventoryLabelX, this.inventoryLabelY, LABEL, false);
    const trades = 'Trades';
    g.text(trades, 5 - Math.floor(g.textWidth(trades) / 2) + 48, 6, LABEL, false);
  }

  renderBg(g: GuiGraphics): void {
    const i = this.leftPos, j = this.topPos;
    this.updateButtons();
    g.sprite('container_villager', i, j, 276, 166);
    const offers = this.menu.offers();
    if (!offers.length) return;
    const sel = offers[this.shopItem];
    if (sel?.isOutOfStock()) g.sprite('villager_out_of_stock', i + 83 + 99, j + 35, 28, 21);
    this.renderScroller(g, i, j, offers.length);
    if (sel && this.menu.showProgressBar()) this.renderProgressBar(g, i, j);
  }

  /** vanilla renderProgressBar: the villager's experience toward its next level, and what the offer in the slot adds */
  private renderProgressBar(g: GuiGraphics, x: number, y: number): void {
    const lvl = this.menu.traderLevel(), xp = this.menu.traderXp();
    if (lvl >= 5) return;
    g.sprite('villager_experience_bar_background', x + 136, y + 16, 102, 5);
    const min = minXpPerLevel(lvl);
    if (xp < min || !canLevelUp(lvl)) return;
    const f = 102 / (maxXpPerLevel(lvl) - min);
    const cur = Math.min(Math.floor(f * (xp - min)), 102);
    if (cur > 0) g.sprite('villager_experience_bar_current', x + 136, y + 16, cur, 5, 0, 0, cur, 5);
    const future = this.menu.futureTraderXp();
    if (future > 0) {
      const w = Math.min(Math.floor(future * f), 102 - cur);
      if (w > 0) g.sprite('villager_experience_bar_result', x + 136 + cur, y + 16, w, 5, cur, 0, w, 5);
    }
  }

  /** vanilla renderScroller */
  private renderScroller(g: GuiGraphics, x: number, y: number, n: number): void {
    const i = n + 1 - BUTTONS;
    if (i > 1) {
      const j = SCROLL_H - (SCROLLER_H + Math.floor(((i - 1) * SCROLL_H) / i));
      const k = 1 + Math.floor(j / i) + Math.floor(SCROLL_H / i);
      let off = Math.min(113, this.scrollOff * k);
      if (this.scrollOff === i - 1) off = 113;
      g.sprite('villager_scroller', x + 94, y + 18 + off, 6, 27);
    } else g.sprite('villager_scroller_disabled', x + 94, y + 18, 6, 27);
  }

  override renderTooltip(g: GuiGraphics, mx: number, my: number): void {
    const offers = this.menu.offers();
    const sel = offers[this.shopItem];
    const x = mx - this.leftPos, y = my - this.topPos;
    // vanilla merchant.deprecated: over the crossed-out arrow of a sold-out offer
    if (sel?.isOutOfStock() && x >= 185 && x < 186 + 22 + 1 && y >= 34 && y < 35 + 21 + 1 && this.menu.canRestock()) {
      g.tooltip(['Villagers restock up to two times per day.'], mx, my);
      return;
    }
    if (!this.menu.carried)
      for (const b of this.buttons) {
        if (!b.visible || !b.isMouseOver(mx, my)) continue;
        const s = b.hoveredStack(mx);
        if (s) {
          g.tooltip(itemTooltip(s), mx, my);
          return;
        }
      }
    super.renderTooltip(g, mx, my);
  }

  override mouseScrolled(mx: number, my: number, d: number): boolean {
    if (super.mouseScrolled(mx, my, d)) return true;
    const n = this.menu.offers().length;
    if (this.canScroll(n)) this.scrollOff = Math.max(0, Math.min(n - BUTTONS, this.scrollOff - d));
    return true;
  }

  override mouseDragged(mx: number, my: number): boolean {
    const n = this.menu.offers().length;
    if (this.dragging) {
      const top = this.topPos + 18, bottom = top + SCROLL_H;
      const l = n - BUTTONS;
      const f = ((my - top - 13.5) / (bottom - top - 27)) * l + 0.5;
      this.scrollOff = Math.max(0, Math.min(l, Math.trunc(f)));
      return true;
    }
    return super.mouseDragged(mx, my);
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    this.dragging = false;
    const i = this.leftPos, j = this.topPos;
    if (this.canScroll(this.menu.offers().length) && mx > i + 94 && mx < i + 94 + 6 && my > j + 18 && my <= j + 18 + SCROLL_H + 1) this.dragging = true;
    return super.mouseClicked(mx, my, button);
  }

  override mouseReleased(mx: number, my: number, button: number): boolean {
    this.dragging = false;
    return super.mouseReleased(mx, my, button);
  }
}
