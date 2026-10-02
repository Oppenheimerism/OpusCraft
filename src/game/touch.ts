// Touch controls: a phone or a tablet plays the game with fingers on the glass. Java Edition has none, so this is the
// one part of the game with nothing in the original to follow; the scheme is the one Bedrock Edition's players know
// (its crosshair touch controls). The left thumb slides a stick to walk (pushed past its ring, to sprint); a finger
// dragged anywhere else turns the view; a tap uses or places what the crosshair is on, or hits the mob there; a finger
// held still breaks what the crosshair is on for as long as it stays; and buttons jump, sneak (tapped on, tapped off)
// and use (held: eating, drawing a bow, talking to a villager). A hotbar slot is tapped to hold what's in it, the three
// dots beside the hotbar open the inventory, and the bars in the corner pause. Three fingers at once are F3.
//
// On a screen (the menus, the inventory) a finger is the mouse's left button, and a drag that nothing on the screen
// takes scrolls it as the wheel would. A screen in the world that Escape would close (the inventory, a chest: they
// have no button that does) has a cross in the corner, which is that Escape.
//
// All of it goes in through Input, as the keys and buttons it stands for: the game beyond doesn't know a finger from
// a key. Positions here are the GUI's (GuiGraphics' units); sizes are given in CSS pixels, so a button is as big under
// a thumb whatever the screen's density and the GUI's scale.

import { KEYS, type Input } from './input';
import type { GuiGraphics } from '../gui/guiGraphics';

/** what the controls need of the game (Game; the tests hand them less) */
export interface TouchHost {
  readonly input: Input;
  readonly gui: { width: number; height: number };
  readonly screen: unknown;
  readonly inWorld: boolean;
  readonly spawned: boolean;
  /** how many of the GUI's units a CSS pixel is */
  cssPx(): number;
  /** the crosshair is on an entity */
  crosshairEntity(): boolean;
  /** a key as the keyboard would send it: Escape pauses, or closes the open screen; the inventory key opens it */
  tapKey(code: string): void;
  /** a screen is open in the world that Escape would close */
  screenCloses(): boolean;
  /** a finger on the open screen, as the mouse's left button there: whether the screen took it */
  touchScreen(type: 'down' | 'up' | 'move', mx: number, my: number): boolean;
  /** the wheel over the open screen, `d` notches (up is positive) */
  scrollScreen(mx: number, my: number, d: number): void;
}

/** sizes, in CSS pixels */
const BUTTON = 56, GAP = 12, MARGIN = 18, STICK = 56, KNOB = 24, CORNER = 38;
/** a finger that has moved less than this hasn't moved: it taps, or holds */
const SLOP = 9;
/** how long a finger stays still before it breaks rather than taps */
export const HOLD_MS = 280;
/** how far the stick is pushed, in its radii, before the player walks, and before the player sprints */
const DEAD = 0.28, SPRINT = 1.25;
/** a CSS pixel of a finger's drag, in the mouse's counts (the mouse sensitivity option applies after) */
const LOOK = 3;
/** a GUI unit of a finger's drag over a screen, in notches of the wheel */
const SCROLL = 1 / 14;
/** the jump button stays down at least this long: a tick must see it, or two quick taps wouldn't start a flight */
const JUMP_MS = 70;
/** how far above the bottom the stick and the buttons go on a screen too narrow to have them beside the hotbar */
const LIFT = 54;

type Role = 'none' | 'screen' | 'stick' | 'look' | 'jump' | 'use';

interface Finger {
  role: Role;
  /** where it came down, and where it is */
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  moved: boolean;
  /** it has stayed still long enough: the attack button is held for it */
  breaking: boolean;
  /** (on a screen) the screen has the drag: a slider, a scroll bar, an item being spread */
  taken: boolean;
  /** (on a screen) what's left of the drag that hasn't made a notch of the wheel yet */
  scroll: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TouchLayout {
  /** the stick where it rests: its middle, and its radius */
  stick: { x: number; y: number; r: number };
  knob: number;
  jump: Rect;
  sneak: Rect;
  use: Rect;
  pause: Rect;
  /** over a screen: the cross that closes it */
  close: Rect;
  /** the three dots: the inventory */
  more: Rect;
  hotbar: Rect;
  /** a finger that comes down here, on nothing else, is the stick's */
  stickZone: Rect;
}

const inside = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad;

/**
 * a device played by touch alone: a phone or a tablet, with nothing that hovers (a laptop with a touch screen has a
 * trackpad; an iPad calls itself a Mac, and gives itself away by its touch points)
 */
export function touchOnly(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && typeof matchMedia === 'function' && !matchMedia('(any-hover: hover)').matches);
}

export class TouchControls {
  private readonly fingers = new Map<number, Finger>();
  /** the sneak button is on */
  sneaking = false;
  /** the jump button was let go too soon for a tick to have seen it: the key goes up at this time */
  private jumpUntil = 0;
  private jumpHeld = false;

  constructor(private readonly host: TouchHost) {}

  layout(): TouchLayout {
    const W = this.host.gui.width, H = this.host.gui.height, u = this.host.cssPx();
    const cx = Math.floor(W / 2);
    const b = Math.round(BUTTON * u), gap = Math.round(GAP * u), m = Math.round(MARGIN * u), r = Math.round(STICK * u), c = Math.round(CORNER * u);
    // (a screen too narrow for them beside the hotbar and the hearts, a phone held upright: above those)
    const lift = m + 2 * r > cx - 95 || W - m - 2 * b - gap < cx + 95 ? LIFT : 0;
    const jump = { x: W - m - b, y: H - m - b - lift, w: b, h: b };
    return {
      stick: { x: m + r, y: H - m - r - lift, r },
      knob: Math.round(KNOB * u),
      jump,
      sneak: { x: jump.x - gap - b, y: jump.y, w: b, h: b },
      use: { x: jump.x, y: jump.y - gap - b, w: b, h: b },
      pause: { x: m, y: m, w: c, h: c },
      // (where the pause button is in the world; the other corner is the toasts')
      close: { x: m, y: m, w: c, h: c },
      more: { x: cx + 91 + 3, y: H - 22, w: 22, h: 22 },
      hotbar: { x: cx - 91, y: H - 22, w: 182, h: 22 },
      stickZone: { x: 0, y: H * 0.28, w: W * 0.42, h: H * 0.72 },
    };
  }

  private playing(): boolean {
    return this.host.inWorld && this.host.spawned && !this.host.screen;
  }

  /** a finger comes down at (x, y) */
  start(id: number, x: number, y: number, now: number): void {
    const inp = this.host.input;
    inp.touch = true;
    inp.touchAt = now;
    const f: Finger = { role: 'none', x0: x, y0: y, x, y, t0: now, moved: false, breaking: false, taken: false, scroll: 0 };
    this.fingers.set(id, f);
    if (this.host.screen) {
      if (this.host.screenCloses() && inside(this.layout().close, x, y, 3)) return this.host.tapKey('Escape');
      // (one finger is the mouse; another beside it is nothing)
      for (const o of this.fingers.values()) if (o.role === 'screen') return;
      f.role = 'screen';
      this.host.touchScreen('down', x, y);
      return;
    }
    if (!this.playing()) return;
    if (this.fingers.size >= 3) {
      // (three fingers: F3. None of them taps or breaks)
      for (const o of this.fingers.values()) o.moved = true;
      inp.press(KEYS.debug);
      return;
    }
    const L = this.layout();
    if (inside(L.pause, x, y, 3)) return this.host.tapKey('Escape');
    if (inside(L.more, x, y, 3)) return this.host.tapKey(KEYS.inventory);
    if (inside(L.jump, x, y, 3)) {
      f.role = 'jump';
      this.jumpHeld = true;
      this.jumpUntil = now + JUMP_MS;
      inp.down.add(KEYS.jump);
      return;
    }
    if (inside(L.use, x, y, 3)) {
      f.role = 'use';
      inp.clicks.push(2);
      inp.buttons[2] = true;
      return;
    }
    if (inside(L.sneak, x, y, 3)) return this.setSneak(!this.sneaking);
    if (inside(L.hotbar, x, y, 4)) {
      const slot = Math.max(0, Math.min(8, Math.floor((x - L.hotbar.x - 1) / 20)));
      return inp.press(KEYS[`hotbar${slot + 1}` as keyof typeof KEYS]);
    }
    let stick = false;
    for (const o of this.fingers.values()) stick ||= o.role === 'stick';
    if (!stick && inside(L.stickZone, x, y)) {
      // (the stick is wherever the thumb comes down, kept whole on the screen)
      f.role = 'stick';
      f.x0 = Math.max(L.stick.r + 2, x);
      f.y0 = Math.min(this.host.gui.height - L.stick.r - 2, y);
      this.steer(f);
      return;
    }
    f.role = 'look';
  }

  /** a finger moves to (x, y) */
  move(id: number, x: number, y: number, now: number): void {
    const f = this.fingers.get(id);
    if (!f) return;
    const inp = this.host.input;
    inp.touchAt = now;
    const dx = x - f.x, dy = y - f.y, u = this.host.cssPx();
    f.x = x;
    f.y = y;
    const was = f.moved;
    f.moved ||= Math.hypot(x - f.x0, y - f.y0) > SLOP * u;
    if (f.role === 'screen') {
      f.taken = this.host.touchScreen('move', x, y) || f.taken;
      if (f.taken || !f.moved) return;
      f.scroll += dy * SCROLL;
      const notches = Math.trunc(f.scroll);
      if (notches) {
        f.scroll -= notches;
        this.host.scrollScreen(x, y, notches);
      }
    } else if (f.role === 'stick') this.steer(f);
    else if ((f.role === 'look' || f.role === 'jump' || f.role === 'use') && was) {
      // (the view turns once the finger is past the slop, from where it is then: a tap doesn't nudge the crosshair)
      inp.mouseDX += (dx / u) * LOOK;
      inp.mouseDY += (dy / u) * LOOK;
    }
  }

  /** a finger is lifted; `cancelled`, the browser took it away (it does nothing more) */
  end(id: number, x: number, y: number, now: number, cancelled = false): void {
    const f = this.fingers.get(id);
    if (!f) return;
    this.fingers.delete(id);
    const inp = this.host.input;
    inp.touchAt = now;
    if (f.role === 'screen') this.host.touchScreen('up', x, y);
    else if (f.role === 'stick') this.steer(null);
    else if (f.role === 'jump') {
      this.jumpHeld = false;
      if (now >= this.jumpUntil) inp.down.delete(KEYS.jump);
    } else if (f.role === 'use') inp.buttons[2] = false;
    else if (f.role === 'look') {
      if (f.breaking) inp.buttons[0] = false;
      else if (!f.moved && !cancelled && this.playing()) inp.clicks.push(this.host.crosshairEntity() ? 0 : 2);
    }
  }

  /** every frame: a finger that has stayed still long enough starts to break; a jump tapped too briefly ends */
  frame(now: number): void {
    const inp = this.host.input;
    if (!this.jumpHeld && this.jumpUntil && now >= this.jumpUntil) {
      this.jumpUntil = 0;
      inp.down.delete(KEYS.jump);
    }
    // (the sneak button is the world's: out of it, or the mouse back in charge, it's off)
    if (this.sneaking && (!inp.touch || !this.host.inWorld)) this.setSneak(false);
    if (!this.playing()) return;
    for (const f of this.fingers.values()) {
      if (f.role !== 'look' || f.breaking || f.moved || now - f.t0 < HOLD_MS) continue;
      f.breaking = true;
      inp.clicks.push(0);
      inp.buttons[0] = true;
      if (typeof navigator !== 'undefined') navigator.vibrate?.(8);
    }
  }

  private setSneak(on: boolean): void {
    this.sneaking = on;
    if (on) this.host.input.down.add(KEYS.sneak);
    else this.host.input.down.delete(KEYS.sneak);
  }

  /** the stick's keys from where its finger is (null: let go) */
  private steer(f: Finger | null): void {
    const keys = this.host.input.down;
    const set = (code: string, on: boolean) => (on ? keys.add(code) : keys.delete(code));
    const r = Math.max(1, STICK * this.host.cssPx());
    const dx = f ? (f.x - f.x0) / r : 0, dy = f ? (f.y - f.y0) / r : 0, d = Math.hypot(dx, dy);
    // (eight ways: straight ahead is 0, to the right a quarter turn)
    const a = Math.atan2(dx, -dy), s = Math.abs(a), on = d >= DEAD;
    const forward = on && s < (Math.PI * 3) / 8;
    set(KEYS.forward, forward);
    set(KEYS.back, on && s > (Math.PI * 5) / 8);
    set(KEYS.right, on && a > Math.PI / 8 && a < (Math.PI * 7) / 8);
    set(KEYS.left, on && a < -Math.PI / 8 && a > (-Math.PI * 7) / 8);
    set(KEYS.sprint, forward && d >= SPRINT);
  }

  /** hear the fingers on `target` (the game's canvas); `toGui` turns a place on the page into the GUI's, `lifted` is told of each finger lifted */
  attach(target: HTMLElement, toGui: (clientX: number, clientY: number) => [number, number], lifted: () => void): void {
    const each = (e: TouchEvent, f: (id: number, x: number, y: number, now: number) => void) => {
      // (and no scrolling, no zooming, no mouse events made up after it)
      e.preventDefault();
      const now = performance.now();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const [x, y] = toGui(t.clientX, t.clientY);
        f(t.identifier, x, y, now);
      }
    };
    const opts = { passive: false } as const;
    target.addEventListener('touchstart', (e) => each(e, (id, x, y, now) => this.start(id, x, y, now)), opts);
    target.addEventListener('touchmove', (e) => each(e, (id, x, y, now) => this.move(id, x, y, now)), opts);
    target.addEventListener('touchend', (e) => {
      each(e, (id, x, y, now) => this.end(id, x, y, now));
      lifted();
    }, opts);
    target.addEventListener('touchcancel', (e) => each(e, (id, x, y, now) => this.end(id, x, y, now, true)), opts);
    // (Safari: two fingers would zoom the page)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  /** the stick and the buttons, over the HUD (nothing while a screen is open, or before a finger has touched) */
  render(g: GuiGraphics): void {
    if (!this.host.input.touch || !this.playing()) return;
    const L = this.layout();
    let stick: Finger | null = null;
    const held = new Set<Role>();
    for (const f of this.fingers.values()) {
      held.add(f.role);
      if (f.role === 'stick') stick = f;
    }
    const sx = stick ? stick.x0 : L.stick.x, sy = stick ? stick.y0 : L.stick.y, r = L.stick.r;
    disc(g, sx, sy, r, stick ? 0x48000000 : 0x30000000);
    ring(g, sx, sy, r, stick ? 0x90ffffff : 0x50ffffff);
    let kx = 0, ky = 0;
    if (stick) {
      kx = stick.x - stick.x0;
      ky = stick.y - stick.y0;
      const d = Math.hypot(kx, ky);
      if (d > r) {
        kx *= r / d;
        ky *= r / d;
      }
    }
    disc(g, Math.round(sx + kx), Math.round(sy + ky), L.knob, stick ? 0xb0ffffff : 0x60ffffff);
    button(g, L.jump, held.has('jump'), ARROW);
    button(g, L.sneak, this.sneaking, [...ARROW].reverse());
    button(g, L.use, held.has('use'), null);
    g.centered('USE', L.use.x + L.use.w / 2, L.use.y + (L.use.h - 8) / 2, 0xffffff, false);
    button(g, L.pause, false, BARS);
    button(g, L.more, false, DOTS);
    if (g.height > g.width) g.centered('Turn your phone sideways', g.width / 2, Math.floor(g.height * 0.3), 0xffffff);
  }

  /** over an open screen: the cross that closes it */
  renderOver(g: GuiGraphics): void {
    if (this.host.input.touch && this.host.screen && this.host.screenCloses()) button(g, this.layout().close, false, CROSS);
  }
}

const ARROW = ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..', '..###..'];
const BARS = ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##'];
const DOTS = ['##.##.##', '##.##.##'];
const CROSS = ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'];

/** half of how wide a disc of radius `r` is, `dy` rows from its middle */
const halfWidth = (r: number, dy: number) => Math.round(Math.sqrt(Math.max(0, r * r - (dy + 0.5) * (dy + 0.5))));

/** a disc of the GUI's own pixels, row by row */
function disc(g: GuiGraphics, cx: number, cy: number, r: number, argb: number): void {
  for (let dy = -r; dy < r; dy++) {
    const hw = halfWidth(r, dy);
    if (hw > 0) g.fill(cx - hw, cy + dy, cx + hw, cy + dy + 1, argb);
  }
}

/** a disc's rim, a pixel wide */
function ring(g: GuiGraphics, cx: number, cy: number, r: number, argb: number): void {
  for (let dy = -r; dy < r; dy++) {
    const o = halfWidth(r, dy);
    if (o <= 0) continue;
    const i = Math.min(o - 1, dy <= -r + 1 || dy >= r - 2 ? 0 : halfWidth(r - 1, dy));
    if (i <= 0) g.fill(cx - o, cy + dy, cx + o, cy + dy + 1, argb);
    else {
      g.fill(cx - o, cy + dy, cx - i, cy + dy + 1, argb);
      g.fill(cx + i, cy + dy, cx + o, cy + dy + 1, argb);
    }
  }
}

/** a button: a square with its corners off, lit while it's held, and a picture in its middle (rows of #) */
function button(g: GuiGraphics, r: Rect, lit: boolean, picture: string[] | null): void {
  const body = lit ? 0x70ffffff : 0x50000000, edge = lit ? 0xc0ffffff : 0x70ffffff;
  g.fill(r.x + 1, r.y + 1, r.x + r.w - 1, r.y + r.h - 1, body);
  g.fill(r.x + 1, r.y, r.x + r.w - 1, r.y + 1, edge);
  g.fill(r.x + 1, r.y + r.h - 1, r.x + r.w - 1, r.y + r.h, edge);
  g.fill(r.x, r.y + 1, r.x + 1, r.y + r.h - 1, edge);
  g.fill(r.x + r.w - 1, r.y + 1, r.x + r.w, r.y + r.h - 1, edge);
  if (!picture) return;
  const s = Math.max(1, Math.floor(r.w / 14));
  const x0 = r.x + Math.floor((r.w - picture[0].length * s) / 2), y0 = r.y + Math.floor((r.h - picture.length * s) / 2);
  for (let y = 0; y < picture.length; y++)
    for (let x = 0; x < picture[y].length; x++) if (picture[y][x] === '#') g.fill(x0 + x * s, y0 + y * s, x0 + (x + 1) * s, y0 + (y + 1) * s, 0xf0ffffff);
}
