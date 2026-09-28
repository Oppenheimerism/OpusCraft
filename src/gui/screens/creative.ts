// Creative inventory (vanilla CreativeModeInventoryScreen): tabs, item grid,
// search, scrollbar, survival-inventory tab with the destroy-item slot.

import type { Game } from '../../game/game';
import { EditBox } from '../screen';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen, itemTooltip } from './container';
import { ContainerMenu, Slot, SimpleContainer, ClickType } from '../../inventory/container';
import { CreativeMenu, InventoryMenu } from '../../inventory/menus';
import { ITEM_LIST, ItemStack, Item } from '../../item/item';
import { enchantmentLine, tooltipOrder } from '../../item/enchantments';
import { enchantedBooks, stacksOf } from '../../item/creativeStacks';
import { craftingEnchants } from '../../item/enchantHelper';
// (remaining mobs: the mooshroom)
import { tooltipFlag } from '../../item/hoverText';
import { KEYS } from '../../game/input';

interface Tab {
  id: string;
  name: string;
  icon: string;
  top: boolean;
  col: number;
  right?: boolean;
  type?: 'search' | 'inventory' | 'hotbar';
  items: Item[];
  /** stacks listed after the items (the ingredients tab's enchanted books) */
  extra?: ItemStack[];
}

/** the search tab's stacks: every item, with the books of every level among the ingredients (before the spawn eggs) */
let SEARCH: ItemStack[] | null = null;
function searchStacks(): ItemStack[] {
  if (SEARCH) return SEARCH;
  const stacks = tabs().find((t) => t.id === 'search')!.items.flatMap(stacksOf);
  const i = stacks.findIndex((s) => s.item.creativeTab === 'spawn_eggs');
  stacks.splice(i < 0 ? stacks.length : i, 0, ...enchantedBooks(true));
  return (SEARCH = stacks);
}

/**
 * what the search matches a stack by (vanilla SessionSearchTrees.CREATIVE_NAMES): its tooltip, every line without its
 * formatting — the name, a book's enchantments, a potion's effects
 */
const SEARCH_TEXT = new WeakMap<ItemStack, string>();
function searchText(s: ItemStack): string {
  let t = SEARCH_TEXT.get(s);
  if (t === undefined) {
    const ench = tooltipOrder(craftingEnchants(s)).map(([id, l]) => enchantmentLine(id, l).text);
    // (remaining mobs: the mooshroom) vanilla SessionSearchTrees: the tooltips as creative mode shows them
    tooltipFlag.creative = true;
    t = [...itemTooltip(s), ...ench].map((l) => l.replace(/§./g, '').trim().toLowerCase()).join('\n');
    SEARCH_TEXT.set(s, t);
  }
  return t;
}

/** vanilla CreativeModeTabs.REDSTONE_BLOCKS, in its order (as far as the game has them) */
const REDSTONE_ORDER = [
  'redstone', 'redstone_torch', 'redstone_block', 'repeater', 'lever', 'oak_button', 'stone_button', 'oak_pressure_plate', 'stone_pressure_plate', 'light_weighted_pressure_plate',
  'heavy_weighted_pressure_plate', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker', 'amethyst_block', 'white_wool', 'tripwire_hook', 'piston',
  'sticky_piston', 'dispenser', 'dropper', 'tnt', 'redstone_lamp',
];
// (trial chambers) the crafter, after the dropper as in vanilla
REDSTONE_ORDER.splice(REDSTONE_ORDER.indexOf('dropper') + 1, 0, 'crafter');
// (the hopper after the crafter, as in vanilla)
REDSTONE_ORDER.splice(REDSTONE_ORDER.indexOf('crafter') + 1, 0, 'hopper');
// (the comparator after the repeater)
REDSTONE_ORDER.splice(REDSTONE_ORDER.indexOf('repeater') + 1, 0, 'comparator');
// (the observer after the hopper)
REDSTONE_ORDER.splice(REDSTONE_ORDER.indexOf('hopper') + 1, 0, 'observer');
// (the daylight detector after the tripwire hook)
REDSTONE_ORDER.splice(REDSTONE_ORDER.indexOf('tripwire_hook') + 1, 0, 'daylight_detector');
/** (the deep dark) listed in the redstone tab as well as their own, as vanilla does: the sensor, the shrieker, and what they react to */
const REDSTONE_ALSO = new Set(['sculk_sensor', 'sculk_shrieker', 'amethyst_block', 'white_wool']);
// (jukebox) vanilla lists the jukebox (a signal source while it plays) with the redstone blocks too, after the crafter
REDSTONE_ORDER.splice(REDSTONE_ORDER.indexOf('crafter') + 1, 0, 'jukebox');
REDSTONE_ALSO.add('jukebox');
// (remaining mobs: the bee) the honey block after the sticky piston (vanilla: after the slime block, which the game
// hasn't), listed with the natural blocks as well
REDSTONE_ORDER.splice(REDSTONE_ORDER.indexOf('sticky_piston') + 1, 0, 'honey_block');
REDSTONE_ALSO.add('honey_block');
const REDSTONE = new Set(REDSTONE_ORDER.filter((id) => !REDSTONE_ALSO.has(id)));
const FUNCTIONAL = new Set(['oak_sign', 'painting', 'item_frame', 'red_bed', 'jack_o_lantern', 'carved_pumpkin']);
const DYE_ORDER = ['white', 'light_gray', 'gray', 'black', 'brown', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink'];
/** vanilla CreativeModeTabs.FUNCTIONAL_BLOCKS, in its order (as far as the game has them; the rest follow) */
const FUNCTIONAL_ORDER = [
  'torch', 'soul_torch', 'redstone_torch', 'lantern', 'soul_lantern', 'chain', 'end_rod', 'sea_lantern', 'redstone_lamp', 'glowstone',
  'shroomlight', 'ochre_froglight', 'verdant_froglight', 'pearlescent_froglight', 'crying_obsidian', 'glow_lichen', 'magma_block',
  'crafting_table', 'stonecutter', 'cartography_table', 'fletching_table', 'smithing_table', 'grindstone', 'loom', 'furnace', 'smoker',
  'blast_furnace', 'campfire', 'soul_campfire', 'anvil', 'chipped_anvil', 'damaged_anvil', 'composter', 'note_block', 'jukebox',
  'enchanting_table', 'end_crystal', 'brewing_stand', 'cauldron', 'bell', 'beacon', 'conduit', 'lodestone', 'ladder', 'scaffolding',
  'bee_nest', 'beehive', 'suspicious_sand', 'suspicious_gravel', 'lightning_rod', 'flower_pot', 'decorated_pot', 'armor_stand',
  'item_frame', 'glow_item_frame', 'painting', 'bookshelf', 'chiseled_bookshelf', 'lectern', 'tinted_glass', 'oak_sign', 'chest', 'barrel',
  'ender_chest', 'respawn_anchor', ...DYE_ORDER.map((c) => `${c}_bed`),
];
const BUILDING = new Set(['oak_door', 'iron_door']);
const TOOLS = new Set(['minecart', 'chest_minecart', 'oak_boat', 'saddle', 'lead', 'name_tag', 'filled_map', 'map', 'milk_bucket', 'experience_bottle']);
/** vanilla lists seeds with the natural blocks */
const NATURAL = new Set(['wheat_seeds', 'cocoa_beans', 'pumpkin_seeds', 'melon_seeds', 'beetroot_seeds']);
/** (remaining mobs: the bee) listed with the natural blocks as well as their own, each after the one given, as vanilla does */
const NATURAL_ALSO: [string, string][] = [['bee_nest', 'hay_block']];

function tabOf(it: Item): string {
  if (REDSTONE.has(it.id)) return 'redstone_blocks';
  if (FUNCTIONAL.has(it.id)) return 'functional_blocks';
  if (BUILDING.has(it.id)) return 'building_blocks';
  if (TOOLS.has(it.id)) return 'tools';
  if (NATURAL.has(it.id)) return 'natural_blocks';
  switch (it.creativeTab) {
    case 'building':
      return 'building_blocks';
    case 'colored':
      return 'colored_blocks';
    case 'natural':
      return 'natural_blocks';
    case 'functional':
      return 'functional_blocks';
    case 'tools':
      return 'tools';
    case 'combat':
      return 'combat';
    case 'food':
      return 'food';
    case 'spawn_eggs':
      return 'spawn_eggs';
    default:
      return 'ingredients';
  }
}

let TABS: Tab[] | null = null;
function tabs(): Tab[] {
  if (TABS) return TABS;
  const t: Tab[] = [
    { id: 'building_blocks', name: 'Building Blocks', icon: 'bricks', top: true, col: 0, items: [] },
    { id: 'colored_blocks', name: 'Colored Blocks', icon: 'cyan_wool', top: true, col: 1, items: [] },
    { id: 'natural_blocks', name: 'Natural Blocks', icon: 'grass_block', top: true, col: 2, items: [] },
    { id: 'functional_blocks', name: 'Functional Blocks', icon: 'oak_sign', top: true, col: 3, items: [] },
    { id: 'redstone_blocks', name: 'Redstone Blocks', icon: 'redstone', top: true, col: 4, items: [] },
    { id: 'hotbar', name: 'Saved Hotbars', icon: 'bookshelf', top: true, col: 5, right: true, type: 'hotbar', items: [] },
    { id: 'search', name: 'Search Items', icon: 'compass', top: true, col: 6, right: true, type: 'search', items: [] },
    { id: 'tools', name: 'Tools & Utilities', icon: 'diamond_pickaxe', top: false, col: 0, items: [] },
    { id: 'combat', name: 'Combat', icon: 'netherite_sword', top: false, col: 1, items: [] },
    { id: 'food', name: 'Food & Drinks', icon: 'golden_apple', top: false, col: 2, items: [] },
    { id: 'ingredients', name: 'Ingredients', icon: 'iron_ingot', top: false, col: 3, items: [] },
    { id: 'spawn_eggs', name: 'Spawn Eggs', icon: 'pig_spawn_egg', top: false, col: 4, items: [] },
    { id: 'inventory', name: 'Survival Inventory', icon: 'chest', top: false, col: 6, right: true, type: 'inventory', items: [] },
  ];
  const byId = new Map(t.map((x) => [x.id, x]));
  // (no bare enchanted book: vanilla lists one per enchantment instead)
  const listed = ITEM_LIST.filter((it) => it.id !== 'enchanted_book');
  for (const it of listed) byId.get(tabOf(it))?.items.push(it);
  for (const it of listed) if (REDSTONE_ALSO.has(it.id)) byId.get('redstone_blocks')!.items.push(it);
  for (const [id, after] of NATURAL_ALSO) {
    const it = listed.find((x) => x.id === id), natural = byId.get('natural_blocks')!.items;
    if (it) natural.splice(natural.findIndex((x) => x.id === after) + 1, 0, it);
  }
  byId.get('redstone_blocks')!.items.sort((a, b) => REDSTONE_ORDER.indexOf(a.id) - REDSTONE_ORDER.indexOf(b.id));
  const rank = (it: Item) => (FUNCTIONAL_ORDER.includes(it.id) ? FUNCTIONAL_ORDER.indexOf(it.id) : FUNCTIONAL_ORDER.length);
  byId.get('functional_blocks')!.items.sort((a, b) => rank(a) - rank(b));
  // (Stage 4) vanilla CreativeModeTabs.SPAWN_EGGS: by name, wherever the eggs were registered
  byId.get('spawn_eggs')!.items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  byId.get('ingredients')!.extra = enchantedBooks(false);
  byId.get('search')!.items = listed;
  TABS = t;
  return t;
}

let lastTab = 'building_blocks';

export class CreativeInventoryScreen extends AbstractContainerScreen<ContainerMenu> {
  private readonly picker: CreativeMenu;
  private readonly invMenu: InventoryMenu;
  private readonly destroyContainer = new SimpleContainer(1);
  private destroySlot!: Slot;
  private tab!: Tab;
  private scrollOffs = 0;
  private scrolling = false;
  private search!: EditBox;
  private searchText = '';
  private hasClickedOutsideFlag = false;

  constructor(game: Game) {
    const picker = new CreativeMenu(game.player);
    super(game, picker, '');
    this.picker = picker;
    this.invMenu = new InventoryMenu(game.player);
    this.imageWidth = 195;
    this.imageHeight = 136;
    this.setupInventorySlots();
    this.selectTab(tabs().find((t) => t.id === lastTab) ?? tabs()[0]);
  }

  /** survival-inventory tab: reposition the inventory menu's slots (vanilla SlotWrapper layout) */
  private setupInventorySlots(): void {
    const m = this.invMenu;
    m.slots.forEach((s, l) => {
      if (l >= 5 && l < 9) {
        const k = l - 5;
        s.x = 54 + Math.floor(k / 2) * 54;
        s.y = 6 + (k % 2) * 27;
      } else if (l < 5) {
        s.x = -2000;
        s.y = -2000;
      } else if (l === 45) {
        s.x = 35;
        s.y = 20;
      } else {
        const k = l - 9;
        s.x = 9 + (k % 9) * 18;
        s.y = l >= 36 ? 112 : 54 + Math.floor(k / 9) * 18;
      }
    });
    this.destroySlot = m.addSlot(new Slot(this.destroyContainer, 0, 173, 112));
  }

  override init(): void {
    super.init();
    this.search = this.add(new EditBox(this.leftPos + 82, this.topPos + 6, 80, 9, this.searchText));
    this.search.bordered = false;
    this.search.maxLength = 50;
    this.search.visible = this.tab.type === 'search';
    this.search.focused = this.tab.type === 'search';
    this.search.onChange = (v) => {
      this.searchText = v;
      this.refreshSearch();
    };
  }

  private selectTab(t: Tab): void {
    const carried = this.menu.carried;
    this.menu.carried = null;
    this.tab = t;
    lastTab = t.id;
    this.scrollOffs = 0;
    this.menu = t.type === 'inventory' ? this.invMenu : this.picker;
    this.menu.carried = carried;
    if (t.type !== 'inventory') {
      this.picker.items = t.type === 'search' ? this.filtered() : [...t.items.flatMap(stacksOf), ...(t.extra ?? []).map((x) => x.copy())];
      this.picker.scrollTo(0);
    }
    if (this.search) {
      this.search.visible = t.type === 'search';
      this.search.focused = t.type === 'search';
    }
  }

  private filtered(): ItemStack[] {
    const q = this.searchText.toLowerCase();
    return searchStacks()
      .filter((x) => !q || searchText(x).includes(q) || x.item.id.includes(q.replace(/ /g, '_')))
      .map((x) => x.copy());
  }

  private refreshSearch(): void {
    this.picker.items = this.filtered();
    this.scrollOffs = 0;
    this.picker.scrollTo(0);
  }

  private tabX(t: Tab): number {
    return t.right ? this.imageWidth - 27 * (7 - t.col) + 1 : 27 * t.col;
  }

  private tabAt(mx: number, my: number): Tab | null {
    for (const t of tabs()) {
      const x = this.leftPos + this.tabX(t);
      const y = t.top ? this.topPos - 32 : this.topPos + this.imageHeight;
      if (mx >= x && mx <= x + 26 && my >= y && my <= y + 32) return t;
    }
    return null;
  }

  private renderTabButton(g: GuiGraphics, t: Tab): void {
    const sel = t === this.tab;
    const x = this.leftPos + this.tabX(t);
    const y = t.top ? this.topPos - 28 : this.topPos + this.imageHeight - 4;
    const n = Math.min(7, t.col + 1);
    g.sprite(`creative_tab_${t.top ? 'top' : 'bottom'}_${sel ? 'selected' : 'unselected'}_${n}`, x, y, 26, 32);
    g.item(t.icon, x + 5, y + 8 + (t.top ? 1 : -1));
  }

  renderBg(g: GuiGraphics, mx: number, my: number): void {
    for (const t of tabs()) if (t !== this.tab) this.renderTabButton(g, t);
    const bg = this.tab.type === 'search' ? 'creative_tab_item_search' : this.tab.type === 'inventory' ? 'creative_tab_inventory' : 'creative_tab_items';
    g.sprite(bg, this.leftPos, this.topPos);
    if (this.tab.type !== 'inventory') {
      const x = this.leftPos + 175, y0 = this.topPos + 18, y1 = y0 + 112;
      const can = this.picker.canScroll();
      g.sprite(can ? 'scroller' : 'scroller_disabled', x, y0 + Math.floor((y1 - y0 - 17) * this.scrollOffs), 12, 15);
    }
    this.renderTabButton(g, this.tab);
    if (this.tab.type === 'inventory') this.game.renderEntityInInventory(g, this.leftPos + 73, this.topPos + 6, this.leftPos + 105, this.topPos + 49, 20, 0.0625, mx, my);
  }

  override renderLabels(g: GuiGraphics): void {
    if (this.tab.type !== 'search' && this.tab.type !== 'inventory') g.text(this.tab.name, 8, 6, 0x404040, false);
  }

  override renderTooltip(g: GuiGraphics, mx: number, my: number): void {
    const t = this.tabAt(mx, my);
    if (t) {
      g.tooltip([t.name], mx, my);
      return;
    }
    const h = this.hoveredSlot;
    if (!this.menu.carried && h?.hasItem()) {
      if (h === this.destroySlot) return;
      // (remaining mobs: the mooshroom) vanilla TooltipFlag: creative mode's
      tooltipFlag.creative = true;
      const lines = itemTooltip(h.item!);
      if (this.tab.type === 'search') lines.splice(1, 0, `§9${tabs().find((x) => x.id === tabOf(h.item!.item))?.name ?? ''}`);
      g.tooltip(lines, mx, my);
      return;
    }
    if (!this.menu.carried && h === this.destroySlot) g.tooltip(['Destroy Item'], mx, my);
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
  }

  /** vanilla CreativeModeInventoryScreen is an EffectRenderingInventoryScreen too */
  override canSeeEffects(): boolean {
    return this.width - (this.leftPos + this.imageWidth + 2) >= 32;
  }

  // ---------------------------------------------------------------------------
  // input

  override mouseClicked(mx: number, my: number, button: number): boolean {
    if (button === 0) {
      if (this.tabAt(mx, my)) return true;
      if (this.tab.type !== 'inventory' && this.insideScrollbar(mx, my)) {
        this.scrolling = this.picker.canScroll();
        this.dragScroll(my);
        return true;
      }
    }
    this.hasClickedOutsideFlag = this.hasClickedOutside(mx, my) && !this.tabAt(mx, my);
    return super.mouseClicked(mx, my, button);
  }

  override mouseReleased(mx: number, my: number, button: number): boolean {
    if (button === 0) {
      const t = this.tabAt(mx, my);
      if (t) {
        if (t !== this.tab) this.selectTab(t);
        this.initScreen(this.width, this.height);
        return true;
      }
      this.scrolling = false;
    }
    return super.mouseReleased(mx, my, button);
  }

  override mouseDragged(mx: number, my: number): boolean {
    if (this.scrolling) {
      this.dragScroll(my);
      return true;
    }
    return super.mouseDragged(mx, my);
  }

  override mouseScrolled(_mx: number, _my: number, d: number): boolean {
    if (this.tab.type === 'inventory' || !this.picker.canScroll()) return false;
    const rows = Math.ceil(this.picker.items.length / 9) - 5;
    this.scrollOffs = Math.max(0, Math.min(1, this.scrollOffs - d / rows));
    this.picker.scrollTo(this.scrollOffs);
    return true;
  }

  private insideScrollbar(mx: number, my: number): boolean {
    const x = this.leftPos + 175, y = this.topPos + 18;
    return mx >= x && my >= y && mx < x + 14 && my < y + 112;
  }

  private dragScroll(my: number): void {
    const y0 = this.topPos + 18, y1 = y0 + 112;
    this.scrollOffs = Math.max(0, Math.min(1, (my - y0 - 7.5) / (y1 - y0 - 15)));
    this.picker.scrollTo(this.scrollOffs);
  }

  protected override hasClickedOutside(mx: number, my: number): boolean {
    return super.hasClickedOutside(mx, my) && !this.tabAt(mx, my);
  }

  /** vanilla CreativeModeInventoryScreen.slotClicked */
  protected override slotClicked(slot: Slot | null, slotId: number, button: number, type: ClickType): void {
    const p = this.game.player;
    const shift = type === 'quick_move';
    if (slotId === -999 && type === 'pickup') type = 'throw';
    const menu = this.menu;
    if (!slot && this.tab.type !== 'inventory' && type !== 'quick_craft') {
      const c = menu.carried;
      if (c && this.hasClickedOutsideFlag) {
        if (button === 0) {
          p.dropItem(c, true);
          menu.carried = null;
        } else if (button === 1) {
          p.dropItem(c.split(1), true);
          if (c.count <= 0) menu.carried = null;
        }
      }
      return;
    }
    if (slot && !slot.mayPickup(p)) return;
    if (slot === this.destroySlot && shift) {
      p.inventory.clear();
      return;
    }
    if (this.tab.type === 'inventory') {
      if (slot === this.destroySlot) {
        menu.carried = null;
        return;
      }
      if (type === 'throw' && slot && slot.hasItem()) {
        const got = slot.remove(button === 0 ? 1 : slot.item!.maxStack);
        if (got) p.dropItem(got, true);
        return;
      }
      if (type === 'throw' && slotId === -999 && menu.carried) {
        p.dropItem(menu.carried, true);
        menu.carried = null;
        return;
      }
      menu.clicked(slot ? slot.index : slotId, button, type);
      return;
    }
    if (slot && type !== 'quick_craft' && slot.container === this.picker.display) {
      const carried = menu.carried;
      const inSlot = slot.item;
      if (type === 'swap') {
        if (inSlot) {
          p.inventory.main[button] = inSlot.copyWithCount(inSlot.maxStack);
          p.inventory.version++;
        }
        return;
      }
      if (type === 'clone') {
        if (!carried && inSlot) menu.carried = inSlot.copyWithCount(inSlot.maxStack);
        return;
      }
      if (type === 'throw') {
        if (inSlot) p.dropItem(inSlot.copyWithCount(button === 0 ? 1 : inSlot.maxStack), true);
        return;
      }
      if (carried && inSlot && carried.sameItem(inSlot)) {
        if (button === 0) {
          if (shift) carried.count = carried.maxStack;
          else if (carried.count < carried.maxStack) carried.count++;
        } else {
          carried.count--;
          if (carried.count <= 0) menu.carried = null;
        }
      } else if (inSlot && !carried) {
        menu.carried = inSlot.copyWithCount(shift ? inSlot.maxStack : inSlot.count);
      } else if (button === 0) menu.carried = null;
      else if (carried) {
        carried.count--;
        if (carried.count <= 0) menu.carried = null;
      }
      return;
    }
    menu.clicked(slot ? slot.index : slotId, button, type);
  }

  override keyPressed(e: KeyboardEvent): boolean {
    if (this.tab.type === 'search') {
      if (e.key === 'Escape') {
        this.onClose();
        return true;
      }
      if (this.search.keyPressed(e)) return true;
      // typing goes to the search box; the inventory key doesn't close while searching
      if (e.key.length === 1) return false;
    } else if (e.code === KEYS.chat && !this.hoveredSlot?.hasItem()) {
      this.selectTab(tabs().find((t) => t.type === 'search')!);
      this.initScreen(this.width, this.height);
      return true;
    }
    return super.keyPressed(e);
  }

  override charTyped(ch: string): boolean {
    if (this.tab.type !== 'search') return false;
    return this.search.charTyped(ch);
  }

  override removed(): void {
    this.menu.removed();
  }
}
