// The smithing table's screen (vanilla SmithingScreen on ItemCombinerScreen): template, base and addition slots
// with their empty-slot icons cycling, a red cross when they make nothing, onboarding tooltips over the empty slots,
// and the result tried on an armour stand.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import type { SmithingMenu } from '../../inventory/smithingMenu';
import { SMITHING_TEMPLATES } from '../../inventory/smithing';
import type { ContainerMenu } from '../../inventory/container';
import { ArmorStandPreview } from '../../render/armorStandPreview';
import '../../textures/jobSiteGui';

/** vanilla CyclingSlotBackground: an empty slot's icons, changing every 30 ticks with a 4-tick fade */
class CyclingSlotBackground {
  private icons: string[] = [];
  private tickCount = 0;
  private iconIndex = 0;

  constructor(private readonly slotIndex: number) {}

  tick(icons: string[]): void {
    if (this.icons.join() !== icons.join()) {
      this.icons = icons;
      this.iconIndex = 0;
    }
    if (this.icons.length && ++this.tickCount % 30 === 0) this.iconIndex = (this.iconIndex + 1) % this.icons.length;
  }

  render(menu: ContainerMenu, g: GuiGraphics, partial: number, x: number, y: number): void {
    const slot = menu.slots[this.slotIndex];
    if (!this.icons.length || slot.hasItem()) return;
    const fading = this.icons.length > 1 && this.tickCount >= 30;
    const f = fading ? Math.min((this.tickCount % 30) + partial, 4) / 4 : 1;
    if (f < 1) {
      const prev = (((this.iconIndex - 1) % this.icons.length) + this.icons.length) % this.icons.length;
      g.sprite(this.icons[prev], x + slot.x, y + slot.y, 16, 16, 0, 0, undefined, undefined, 1 - f);
    }
    g.sprite(this.icons[this.iconIndex], x + slot.x, y + slot.y, 16, 16, 0, 0, undefined, undefined, f);
  }
}

/** vanilla EMPTY_SLOT_SMITHING_TEMPLATES */
const TEMPLATE_ICONS = ['slot_smithing_template_armor_trim', 'slot_smithing_template_netherite_upgrade'];

/** one armour stand for every smithing screen (its framebuffer is kept) */
let preview: ArmorStandPreview | null = null;

export class SmithingScreen extends AbstractContainerScreen<SmithingMenu> {
  private readonly templateIcon = new CyclingSlotBackground(0);
  private readonly baseIcon = new CyclingSlotBackground(1);
  private readonly additionalIcon = new CyclingSlotBackground(2);
  private readonly stand: ArmorStandPreview;

  constructor(game: Game, menu: SmithingMenu) {
    super(game, menu, 'Upgrade Gear');
    this.titleLabelX = 44;
    this.titleLabelY = 15;
    preview ??= new ArmorStandPreview(game.gl, game.renderer.batch, game.renderer.items);
    this.stand = preview;
    // vanilla subInit and slotChanged (slot 3): the stand wears whatever the result is
    this.stand.setItem(menu.slots[3].item);
    menu.onResultChanged = (s) => this.stand.setItem(s);
  }

  private template() {
    const s = this.menu.slots[0].item;
    return s ? SMITHING_TEMPLATES[s.item.id] ?? null : null;
  }

  /** vanilla containerTick: the icons move on */
  override tick(): void {
    super.tick();
    const t = this.template();
    this.templateIcon.tick(TEMPLATE_ICONS);
    this.baseIcon.tick(t?.baseIcons ?? []);
    this.additionalIcon.tick(t?.additionIcons ?? []);
  }

  renderBg(g: GuiGraphics, _mx: number, _my: number, partial: number): void {
    const i = this.leftPos, j = this.topPos;
    g.sprite('container_smithing', i, j, 176, 166);
    // ItemCombinerScreen.renderErrorIcon
    if (this.hasRecipeError()) g.sprite('smithing_error', i + 65, j + 46, 28, 21);
    this.templateIcon.render(this.menu, g, partial, i, j);
    this.baseIcon.render(this.menu, g, partial, i, j);
    this.additionalIcon.render(this.menu, g, partial, i, j);
    this.renderStand(g, i + 141, j + 75);
  }

  /** InventoryScreen.renderEntityInInventory(141, 75, scale 25): the stand drawn offscreen and copied in */
  private renderStand(g: GuiGraphics, x: number, y: number): void {
    const x1 = x - 45, y1 = y - 65, x2 = x + 45, y2 = y + 20;
    const c = this.stand.render(g.scale, x1, y1, x2, y2, x, y, 25);
    const ctx = g.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const t = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, t.e, t.f);
    ctx.drawImage(c, Math.round(x1 * g.scale), Math.round(y1 * g.scale));
    ctx.restore();
  }

  /** vanilla hasRecipeError: all three inputs in and no result */
  private hasRecipeError(): boolean {
    const s = this.menu.slots;
    return s[0].hasItem() && s[1].hasItem() && s[2].hasItem() && !s[3].hasItem();
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    this.renderOnboardingTooltips(g, mx, my);
  }

  /** vanilla renderOnboardingTooltips: what goes where, over the error cross and the empty input slots */
  private renderOnboardingTooltips(g: GuiGraphics, mx: number, my: number): void {
    let text: string | null = null;
    const rx = mx - this.leftPos, ry = my - this.topPos;
    if (this.hasRecipeError() && rx >= 65 - 1 && rx < 65 + 28 + 1 && ry >= 46 - 1 && ry < 46 + 21 + 1) text = "Item can't be upgraded this way";
    const hovered = this.hoveredSlot;
    if (hovered) {
      const template = this.menu.slots[0].item;
      const index = this.menu.slots.indexOf(hovered);
      if (!template) {
        if (index === 0) text = 'Add Smithing Template';
      } else {
        const t = SMITHING_TEMPLATES[template.item.id];
        if (t && !hovered.hasItem()) {
          if (index === 1) text = t.baseDescription;
          else if (index === 2) text = t.additionDescription;
        }
      }
    }
    // (font.split at 115 pixels; every line in the component's own white)
    if (text) g.tooltip(g.wrap(text, 115).map((l) => '§f' + l), mx, my);
  }
}
