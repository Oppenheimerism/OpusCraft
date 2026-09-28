// vanilla SignBlockEntity and HangingSignBlockEntity: a sign's two sides of text (vanilla SignText: four lines, a dye
// colour, black to start, and whether the text glows), whether it's waxed (then nobody edits it) and, while somebody
// has its editor open, who (vanilla playerWhoMayEdit: nobody else may edit it meanwhile, not saved). A standing or wall
// sign's lines are 90 pixels wide at most, 10 apart; a hanging sign's 60 wide and 9 apart. Saved with the chunk as
// vanilla saves them: front_text and back_text ({"messages", "color", "has_glowing_text"}) and is_waxed.

import { BlockEntity, registerBlockEntity } from './blockEntity';
import { BLOCKS, STATE_BLOCK } from './block';
import { signOf, isHangingSign } from './blocksSigns';
import type { Level } from '../game/level';

/** vanilla DyeColor, in id order */
export const SIGN_COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;
export type SignColor = (typeof SIGN_COLORS)[number];

/** vanilla DyeColor.getTextColor */
export const SIGN_TEXT_COLORS: Readonly<Record<SignColor, number>> = {
  white: 0xffffff, orange: 0xff681f, magenta: 0xff00ff, light_blue: 0x9ac0cd, yellow: 0xffff00, lime: 0xbfff00,
  pink: 0xff69b4, gray: 0x808080, light_gray: 0xd3d3d3, cyan: 0x00ffff, purple: 0xa020f0, blue: 0x0000ff,
  brown: 0x8b4513, green: 0x00ff00, red: 0xff0000, black: 0x000000,
};

/** vanilla SignText.LINES */
export const SIGN_LINES = 4;

/** vanilla SignText: one side's lines, colour and glow (immutable; the set* methods give a new one when it changes) */
export class SignText {
  constructor(
    readonly messages: readonly string[] = ['', '', '', ''],
    readonly color: SignColor = 'black',
    readonly glowing = false,
  ) {}
  /** vanilla setMessage */
  setMessage(i: number, text: string): SignText {
    if (this.messages[i] === text) return this;
    const m = this.messages.slice();
    m[i] = text;
    return new SignText(m, this.color, this.glowing);
  }
  /** vanilla setColor: the same text when it's that colour already */
  setColor(c: SignColor): SignText {
    return c === this.color ? this : new SignText(this.messages, c, this.glowing);
  }
  /** vanilla setHasGlowingText */
  setGlowing(g: boolean): SignText {
    return g === this.glowing ? this : new SignText(this.messages, this.color, g);
  }
  /** vanilla hasMessage: some line has something on it */
  hasMessage(): boolean {
    return this.messages.some((m) => m.length > 0);
  }
  /** vanilla SignText.DIRECT_CODEC, as JSON (the lines as plain strings) */
  toJSON(): string {
    return JSON.stringify({ messages: this.messages, color: this.color, has_glowing_text: this.glowing });
  }
  /** a side from its saved JSON, whatever's wrong with it put right (a line too long is cut, an unknown colour black) */
  static parse(v: unknown): SignText {
    if (typeof v !== 'string') return new SignText();
    let o: unknown;
    try {
      o = JSON.parse(v);
    } catch {
      return new SignText();
    }
    if (typeof o !== 'object' || o === null) return new SignText();
    const r = o as { messages?: unknown; color?: unknown; has_glowing_text?: unknown };
    const lines = Array.isArray(r.messages) ? r.messages : [];
    const messages: string[] = [];
    for (let i = 0; i < SIGN_LINES; i++) messages.push(typeof lines[i] === 'string' ? cleanSignLine(lines[i] as string) : '');
    const color = SIGN_COLORS.includes(r.color as SignColor) ? (r.color as SignColor) : 'black';
    return new SignText(messages, color, r.has_glowing_text === true || r.has_glowing_text === 1);
  }
}

/** vanilla ServerboundSignUpdatePacket's readUtf(384): the longest a line can be */
export const MAX_SIGN_LINE_LENGTH = 384;

/**
 * vanilla SharedConstants.isAllowedChatCharacter and ChatFormatting.stripFormatting: what a line may hold (no control
 * characters, no section signs and so no formatting codes), and no longer than a line can be
 */
export function cleanSignLine(s: string): string {
  return s.replace(/§./gs, '').replace(/[\u0000-\u001f\u007f§]/g, '').slice(0, MAX_SIGN_LINE_LENGTH);
}

export class SignBlockEntity extends BlockEntity {
  readonly id: string = 'sign';
  frontText = new SignText();
  backText = new SignText();
  /** vanilla isWaxed */
  waxed = false;
  /** vanilla playerWhoMayEdit: the uuid of the player whose editor is open on it (not saved) */
  playerWhoMayEdit: string | null = null;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  /** vanilla getMaxTextLineWidth */
  get maxTextLineWidth(): number {
    return 90;
  }
  /** vanilla getTextLineHeight */
  get textLineHeight(): number {
    return 10;
  }

  /** vanilla getText */
  getText(front: boolean): SignText {
    return front ? this.frontText : this.backText;
  }

  /** vanilla setText: true if it changed */
  setText(t: SignText, front: boolean): boolean {
    if (t === this.getText(front)) return false;
    if (front) this.frontText = t;
    else this.backText = t;
    this.markUpdated();
    return true;
  }

  /** vanilla updateText */
  updateText(f: (t: SignText) => SignText, front: boolean): boolean {
    return this.setText(f(this.getText(front)), front);
  }

  /** vanilla setWaxed: true if it changed */
  setWaxed(w: boolean): boolean {
    if (this.waxed === w) return false;
    this.waxed = w;
    this.markUpdated();
    return true;
  }

  /**
   * vanilla markUpdated (setChanged, and the block update that sends it to whoever sees it): the world marks the chunk
   * changed and counts the change (world.ts addBlockEntity), and the host sends it round (net/)
   */
  markUpdated(): void {
    if (this.container.onChange) this.container.onChange();
    else this.version++;
  }

  /**
   * vanilla SignBlockEntity.tick (SignBlock.getTicker / CeilingHangingSignBlock.getTicker; a wall hanging sign has
   * none): whoever may edit it is forgotten once they're too far away to (or gone)
   */
  override tick(level: Level): void {
    const who = this.playerWhoMayEdit;
    if (who === null) return;
    const name = BLOCKS[STATE_BLOCK[level.getState(this.x, this.y, this.z)]].name;
    if (signOf(name)?.kind === 'wall_hanging_sign') return;
    if (playerTooFarToEdit(level, this, who)) this.playerWhoMayEdit = null;
  }

  protected override saveData(): Record<string, number | string> {
    return { front_text: this.frontText.toJSON(), back_text: this.backText.toJSON(), is_waxed: this.waxed ? 1 : 0 };
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.frontText = SignText.parse(d.front_text);
    this.backText = SignText.parse(d.back_text);
    this.waxed = d.is_waxed === 1;
  }
}

/** vanilla HangingSignBlockEntity: narrower lines, closer together */
export class HangingSignBlockEntity extends SignBlockEntity {
  override readonly id: string = 'hanging_sign';
  override get maxTextLineWidth(): number {
    return 60;
  }
  override get textLineHeight(): number {
    return 9;
  }
}

/**
 * vanilla SignBlockEntity.playerIsTooFarAwayToEdit → Player.canInteractWithBlock(pos, 4): the player's eyes must be
 * within their reach (4.5 blocks, 5 in creative) and 4 more of the block's box
 */
export function playerTooFarToEdit(level: Level, be: BlockEntity, uuid: string): boolean {
  const p = level.playerByUuid(uuid);
  if (!p || p.removed) return true;
  return !canInteractWithBlock(p, be.x, be.y, be.z, 4);
}

/** vanilla Player.canInteractWithBlock: the block's box within the player's reach plus `extra` of their eyes */
export function canInteractWithBlock(p: { x: number; y: number; z: number; eyeHeight: number; gameMode: string }, x: number, y: number, z: number, extra: number): boolean {
  const range = (p.gameMode === 'creative' ? 5 : 4.5) + extra;
  const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
  const dx = Math.max(x - ex, 0, ex - (x + 1)), dy = Math.max(y - ey, 0, ey - (y + 1)), dz = Math.max(z - ez, 0, ez - (z + 1));
  return dx * dx + dy * dy + dz * dz < range * range;
}

// (vanilla BlockEntityType.SIGN, every standing and wall sign, and HANGING_SIGN, every hanging and wall hanging sign)
registerBlockEntity((name, x, y, z) => {
  if (name === 'hanging_sign' || isHangingSign(name)) return new HangingSignBlockEntity(x, y, z);
  if (name === 'sign' || signOf(name)) return new SignBlockEntity(x, y, z);
  return null;
});
