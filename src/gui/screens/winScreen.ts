// The End Poem and the credits (vanilla WinScreen): what rolls up the screen the first time a player leaves the
// End through its exit portal, over the end portal's starfield (which the game draws beneath while home loads).
//
// The Minecraft logo comes first, 50 pixels below the bottom of the screen, and then the lines, 12 pixels apart:
// the poem's paragraphs wrapped at 256 pixels with an empty line after each, eight empty lines, the credits
// (section names between rows of "=", yellow; disciplines yellow; titles grey and their names white, indented
// 11 spaces), and the closing text like the poem's. It scrolls half a pixel a tick (three quarters without the
// poem), five times as fast while space is held and fifteen more for each control key held with it, and backwards
// while the up arrow is. Words the player cannot read yet are scrambled letters, new ones every frame. The last
// line stops halfway up the screen. The edges are darkened (the credits vignette) so the lines fade in at the
// bottom and out at the top. It's over — and the player goes home — once everything has scrolled by, or at Escape.
// Its music (music.credits) plays from the start, again whenever it ends, and stops with it.

import type { Game } from '../../game/game';
import { Screen } from '../screen';
import { COLOR_CODES, type GuiGraphics } from '../guiGraphics';
import { JavaRandom } from '../../core/rng';
import { FONT, glyphWidth } from '../../textures/font';
import { END_POEM, CREDITS, POSTCREDITS } from './endTexts';

/** vanilla OBFUSCATE_TOKEN (white, obfuscated, green, aqua): where the poem has words the player can't read */
const OBFUSCATE_TOKEN = '§f§k§a§b';
/** vanilla SECTION_HEADING and NAME_PREFIX */
const SECTION_HEADING = '§f============';
const NAME_PREFIX = '           ';
/** vanilla SPEEDUP_FACTOR and SPEEDUP_FACTOR_FAST */
const SPEEDUP = 5, SPEEDUP_FAST = 15;
/** the lines' spacing, and how wide the poem is wrapped */
const LINE_HEIGHT = 12, WRAP = 256;
/** vanilla: the seed of the scrambled words' lengths */
const OBFUSCATE_SEED = 8124371;

export interface CreditsLine {
  /** with § formatting codes */
  text: string;
  centered: boolean;
}

/** a string's width as the font lays it out, formatting codes taking none */
export function textWidth(s: string): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '§' && i + 1 < s.length) {
      i++;
      continue;
    }
    w += glyphWidth(s[i]) + 1;
  }
  return w;
}

/** the colour and scrambling in force at the end of `s`, as codes to start the next line with */
function formattingAt(s: string): string {
  let color = '', obfuscated = false;
  for (let i = 0; i + 1 < s.length; i++) {
    if (s[i] !== '§') continue;
    const c = s[++i].toLowerCase();
    // (vanilla: a colour resets the other formatting)
    if (COLOR_CODES[c] !== undefined) {
      color = '§' + c;
      obfuscated = false;
    } else if (c === 'k') obfuscated = true;
    else if (c === 'r') {
      color = '';
      obfuscated = false;
    }
  }
  return color + (obfuscated ? '§k' : '');
}

/**
 * vanilla Font.split(text, maxWidth): broken at spaces into lines no wider than `maxWidth` (a word too long for a
 * line on its own), each line carrying on the formatting the one before it ended with
 */
export function splitLines(text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = '', carry = '';
  const push = (): void => {
    out.push(carry + line);
    carry = formattingAt(carry + line);
  };
  for (const word of text.split(' ')) {
    const cand = line ? line + ' ' + word : word;
    if (!line || textWidth(cand) <= maxWidth) line = cand;
    else {
      push();
      line = word;
    }
  }
  push();
  return out;
}

/**
 * vanilla WinScreen.init: the poem (its reader's name in, its unreadable words scrambled), the credits and what
 * comes after, as lines
 */
export function creditsLines(playerName: string, poem: boolean): CreditsLine[] {
  const lines: CreditsLine[] = [];
  const empty = (): void => {
    lines.push({ text: '', centered: false });
  };
  // vanilla addPoemFile: a paragraph a line, wrapped, an empty line after each and eight at the end
  const addPoem = (paragraphs: readonly string[]): void => {
    const random = new JavaRandom(OBFUSCATE_SEED);
    for (let s of paragraphs) {
      s = s.replaceAll('PLAYERNAME', playerName);
      let i: number;
      while ((i = s.indexOf(OBFUSCATE_TOKEN)) !== -1) s = s.slice(0, i) + '§f§k' + 'XXXXXXXX'.slice(0, random.nextInt(4) + 3) + s.slice(i + OBFUSCATE_TOKEN.length);
      for (const l of splitLines(s, WRAP)) lines.push({ text: l, centered: false });
      empty();
    }
    for (let j = 0; j < 8; j++) empty();
  };
  if (poem) addPoem(END_POEM);
  // vanilla addCreditsFile
  for (const sec of CREDITS) {
    lines.push({ text: SECTION_HEADING, centered: true }, { text: '§e' + sec.section, centered: true }, { text: SECTION_HEADING, centered: true });
    empty();
    empty();
    for (const d of sec.disciplines) {
      if (d.discipline) {
        lines.push({ text: '§e' + d.discipline, centered: true });
        empty();
        empty();
      }
      for (const t of d.titles) {
        lines.push({ text: '§7' + t.title, centered: false });
        for (const n of t.names) lines.push({ text: '§f' + NAME_PREFIX + n, centered: false });
        empty();
        empty();
      }
    }
  }
  if (poem) addPoem(POSTCREDITS);
  return lines;
}

/** the font's glyphs by their width, to scramble letters with others as wide (vanilla FontSet.getRandomGlyph) */
let byWidth: Map<number, string[]> | null = null;
function scramble(s: string): string {
  if (!byWidth) {
    byWidth = new Map();
    for (const ch of Object.keys(FONT.glyphs)) {
      if (ch === ' ' || ch.length !== 1) continue;
      const w = glyphWidth(ch);
      const l = byWidth.get(w);
      if (l) l.push(ch);
      else byWidth.set(w, [ch]);
    }
  }
  let out = '';
  for (const ch of s) {
    const l = ch === ' ' ? undefined : byWidth.get(glyphWidth(ch));
    out += l ? l[Math.floor(Math.random() * l.length)] : ch;
  }
  return out;
}

export class WinScreen extends Screen {
  /** (the mouse stays grabbed: the game carries straight on afterwards) */
  readonly keepsMouse = true;
  private lines: CreditsLine[] | null = null;
  private totalScrollLength = 0;
  private scroll = 0;
  private readonly unmodifiedScrollSpeed: number;
  private lastFrame = -1;
  private finished = false;
  private vignette: HTMLCanvasElement | null = null;

  constructor(game: Game, readonly poem: boolean, private readonly onFinished: () => void) {
    super(game, '');
    this.unmodifiedScrollSpeed = poem ? 0.5 : 0.75;
  }

  init(): void {
    if (this.lines) return;
    this.lines = creditsLines(this.game.playerName, this.poem);
    this.totalScrollLength = this.lines.length * LINE_HEIGHT;
  }

  /** vanilla: going on (the credits after the End) doesn't pause the game */
  override isPauseScreen(): boolean {
    return !this.poem;
  }

  /** vanilla calculateScrollSpeed, from the keys held: space speeds it up (control keys with it more), up reverses */
  scrollSpeed(): number {
    const inp = this.game.input;
    const dir = inp.isDown('ArrowUp') ? -1 : 1;
    if (!inp.isDown('Space')) return this.unmodifiedScrollSpeed * dir;
    const mods = (inp.isDown('ControlLeft') ? 1 : 0) + (inp.isDown('ControlRight') ? 1 : 0);
    return this.unmodifiedScrollSpeed * (SPEEDUP + mods * SPEEDUP_FAST) * dir;
  }

  /** how far it has scrolled, and whether it's over */
  get scrolled(): number {
    return this.scroll;
  }

  /**
   * vanilla render's scroll (by the real time since the last frame, in ticks) and tick's end (once everything has
   * gone by), for `ms` milliseconds
   */
  advance(ms: number): void {
    this.scroll = Math.max(0, this.scroll + (ms / 50) * this.scrollSpeed());
    if (this.scroll > this.totalScrollLength + this.height + this.height + 24) this.finish();
  }

  /** vanilla onClose (Escape) and respawn: over */
  override onClose(): void {
    this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onFinished();
  }

  override removed(): void {
    this.game.sound.stopSituationalMusic('music.credits');
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    const now = performance.now();
    // (a frame after a long stall — the tab hidden — moves it on no more than a quarter of a second)
    if (this.lastFrame >= 0) this.advance(Math.min(250, now - this.lastFrame));
    this.lastFrame = now;
    if (this.finished) return;
    // vanilla MusicManager: the credits' music while this is open, from the start and again whenever it ends
    this.game.sound.keepSituationalMusic('music.credits');
    // (with the poem, the end portal's starfield is what's behind: vanilla fillRenderType(RenderType.endPortal()))
    if (!this.poem) this.renderBackground(g);
    const lines = this.lines!;
    const x = Math.floor(this.width / 2) - 128;
    const top = this.height + 50;
    const f = -this.scroll;
    // the logo, as on the title screen
    const lx = Math.floor(this.width / 2) - 137;
    if (!g.sprite('title_logo', lx, top + f)) g.centered('MINECRAFT', Math.floor(this.width / 2), top + f + 16, 0xffffff, true);
    g.sprite('title_edition', lx + 88, top + f + 37);
    let k = top + 100;
    let shift = 0;
    for (let l = 0; l < lines.length; l++) {
      // the last line stays halfway up
      if (l === lines.length - 1) {
        const over = k + f - (Math.floor(this.height / 2) - 6);
        if (over < 0) shift = -over;
      }
      if (k + f + LINE_HEIGHT + 8 > 0 && k + f < this.height && lines[l].text) this.drawLine(g, lines[l], x, k + f + shift);
      k += LINE_HEIGHT;
    }
    this.renderVignette(g);
    void mx;
    void my;
    void partial;
  }

  /** one line, run by run of its formatting (each with its own shadow), scrambled where it says so */
  private drawLine(g: GuiGraphics, line: CreditsLine, x: number, y: number): void {
    const s = line.text;
    let cx = line.centered ? x + 128 - Math.floor(textWidth(s) / 2) : x;
    let color = 0xffffff, obfuscated = false, run = '';
    const flush = (): void => {
      if (run) cx = g.text(obfuscated ? scramble(run) : run, cx, y, color, true);
      run = '';
    };
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '§' && i + 1 < s.length) {
        flush();
        const c = s[++i].toLowerCase();
        if (COLOR_CODES[c] !== undefined) {
          color = COLOR_CODES[c];
          obfuscated = false;
        } else if (c === 'k') obfuscated = true;
        else if (c === 'r') {
          color = 0xffffff;
          obfuscated = false;
        }
        continue;
      }
      run += s[i];
    }
    flush();
  }

  /**
   * vanilla's credits vignette (blended ZERO, ONE_MINUS_SRC_COLOR over the screen): the edges and more so the corners
   * darkened, over the starfield beneath and the lines alike — black, as opaque as the vignette is bright
   */
  private renderVignette(g: GuiGraphics): void {
    if (!this.vignette) {
      if (typeof document === 'undefined') return;
      const S = 64;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(S, S);
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const dx = ((x + 0.5) / S) * 2 - 1, dy = ((y + 0.5) / S) * 2 - 1;
          // 0 in the middle, 1 at the middle of each edge, 2 at the corners
          const r2 = dx * dx + dy * dy;
          const d = Math.min(1, Math.pow(Math.max(0, (r2 - 0.2) / 1.05), 1.3));
          img.data[(y * S + x) * 4 + 3] = Math.round(d * 255);
        }
      ctx.putImageData(img, 0, 0);
      this.vignette = c;
    }
    const ctx = g.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.vignette, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}
