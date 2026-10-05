// The Game Rules screen, opened from Create New World's More tab (vanilla EditGameRulesScreen): the rules by
// category, each with its name and an ON/OFF button or a box for its number; Done hands the rules back, Cancel
// leaves them as they were.

import { Screen, Button, CycleButton, EditBox } from '../screen';
import { ScrollList } from '../list';
import type { GuiGraphics } from '../guiGraphics';
import type { Game } from '../../game/game';
import { DEFAULT_GAME_RULES, GAME_RULE_CATEGORIES, GAME_RULE_INFO, parseGameRuleInt, type GameRules } from '../../game/gameRules';

/** a rule's row: its name (wrapped once drawn), its button or box, and whether what's in the box is a number it takes */
interface RuleEntry {
  rule: string;
  name: string;
  initial: boolean | number;
  label: string[] | null;
  tooltip: string[] | null;
  widget: CycleButton<boolean> | EditBox;
  valid: boolean;
}
type RuleRow = { category: string } | RuleEntry;

/** vanilla EditGameRulesScreen.RuleList: rows 24 apart, 220 wide */
class RuleList extends ScrollList<RuleRow> {
  constructor(w: number, top: number, h: number) {
    super(0, top, w, h, 24, 220);
    this.selectable = false;
  }

  private place(e: RuleRow, left: number, top: number): void {
    if ('category' in e) return;
    e.widget.x = left + this.rowWidth - 45;
    e.widget.y = top;
  }

  renderEntry(g: GuiGraphics, e: RuleRow, _i: number, left: number, top: number, _w: number, _h: number, mx: number, my: number): void {
    if ('category' in e) {
      // vanilla CategoryRuleEntry: the category's name, bold and yellow, in the middle
      g.centered(`§e§l${e.category}`, left + this.rowWidth / 2, top + 5, 0xffffff, true);
      return;
    }
    // vanilla GameRuleEntry.renderLabel: the name, on two lines where it's wider than 175 (no shadow)
    e.label ??= g.wrap(e.name, 175);
    if (e.label.length === 1) g.text(e.label[0], left, top + 5, 0xffffff, false);
    else {
      g.text(e.label[0], left, top, 0xffffff, false);
      g.text(e.label[1], left, top + 10, 0xffffff, false);
    }
    this.place(e, left, top);
    e.widget.render(g, mx, my);
  }

  private layoutAll(): void {
    const left = this.rowLeft();
    this.entries.forEach((e, i) => this.place(e, left, this.rowTop(i)));
  }

  override mouseClicked(mx: number, my: number, b: number): boolean {
    for (const e of this.entries) if (!('category' in e) && e.widget instanceof EditBox) e.widget.focused = false;
    if (my < this.y || my >= this.bottom) return false;
    const sx = this.scrollbarX();
    if (this.maxScroll() > 0 && mx >= sx && mx < sx + 6) return super.mouseClicked(mx, my, b);
    this.layoutAll();
    for (const e of this.entries) if (!('category' in e) && e.widget.mouseClicked(mx, my, b)) return true;
    return false;
  }

  override keyPressed(ev: KeyboardEvent): boolean {
    for (const e of this.entries) if (!('category' in e) && e.widget.keyPressed(ev)) return true;
    return false;
  }

  override charTyped(ch: string): boolean {
    for (const e of this.entries) if (!('category' in e) && e.widget.charTyped(ch)) return true;
    return false;
  }

  /** the rule row under the mouse (its tooltip is shown anywhere on the row) */
  hovered(mx: number, my: number): RuleRow | null {
    const i = this.entryAt(mx, my);
    return i < 0 ? null : this.entries[i];
  }
}

export class EditGameRulesScreen extends Screen {
  private readonly rules: GameRules;
  private list: RuleList | null = null;
  private rows: RuleRow[] | null = null;
  private done: Button | null = null;

  /** `rules` is copied; `onDone` gets the edited copy when Done is pressed */
  constructor(game: Game, parent: Screen | null, rules: GameRules, private readonly onDone: (rules: GameRules) => void) {
    super(game, 'Edit Game Rules');
    this.parent = parent;
    this.rules = { ...rules };
  }

  /** the list's rows: each category that has rules, then its rules by id (vanilla sorts both so) */
  private buildRows(): RuleRow[] {
    const rows: RuleRow[] = [];
    for (const [cat, catName] of GAME_RULE_CATEGORIES) {
      const ids = Object.keys(DEFAULT_GAME_RULES).filter((id) => GAME_RULE_INFO[id]?.category === cat).sort();
      if (!ids.length) continue;
      rows.push({ category: catName });
      for (const id of ids) {
        const info = GAME_RULE_INFO[id];
        const def = this.rules[id];
        let widget: CycleButton<boolean> | EditBox;
        if (typeof def === 'boolean') {
          widget = new CycleButton(0, 0, 44, 20, '', [true, false], def, (v) => (v ? 'ON' : 'OFF'), (v) => (this.rules[id] = v));
        } else {
          const box = new EditBox(0, 0, 44, 20, String(def));
          box.onChange = (s) => {
            // vanilla IntegerRuleEntry: a number the rule takes is kept; anything else turns red and holds Done back
            const n = parseGameRuleInt(id, s);
            row.valid = n !== null;
            box.textColor = n !== null ? 0xe0e0e0 : 0xff0000;
            if (n !== null) this.rules[id] = n;
            if (this.done) this.done.active = this.allValid();
          };
          widget = box;
        }
        const row: RuleEntry = { rule: id, name: info.name, initial: def, label: null, tooltip: null, widget, valid: true };
        rows.push(row);
      }
    }
    return rows;
  }

  private allValid(): boolean {
    return !this.rows || this.rows.every((r) => 'category' in r || r.valid);
  }

  init(): void {
    // vanilla HeaderAndFooterLayout: 33 for the title, 33 for the buttons, the list between
    const scroll = this.list?.scroll ?? 0;
    this.rows ??= this.buildRows();
    this.list = this.add(new RuleList(this.width, 33, this.height - 66));
    this.list.entries = this.rows;
    this.list.scroll = scroll;
    for (const r of this.rows) if (!('category' in r)) r.label = null;
    const cx = Math.floor(this.width / 2);
    this.done = this.add(new Button(cx - 154, this.height - 27, 150, 20, 'Done', () => {
      this.onDone({ ...this.rules });
      this.onClose();
    }));
    this.done.active = this.allValid();
    this.add(new Button(cx + 4, this.height - 27, 150, 20, 'Cancel', () => this.onClose()));
  }

  override titleY(): number {
    return 12;
  }

  /** vanilla RuleList.renderWidget: the hovered rule's tooltip: its id in yellow, what it does, its value when the screen opened in grey */
  override renderTooltip(g: GuiGraphics, mx: number, my: number): void {
    const e = this.list?.hovered(mx, my);
    if (!e || 'category' in e) return super.renderTooltip(g, mx, my);
    const info = GAME_RULE_INFO[e.rule];
    e.tooltip ??= [`§e${e.rule}`, ...(info.description ? g.wrap(info.description, 150) : []), `§7Default: ${e.initial}`];
    g.tooltip(e.tooltip, mx, my, true);
  }
}
