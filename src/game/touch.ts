// Touch controls: a phone or a tablet plays the game with fingers on the glass. Java Edition has none, so this is the
// one part of the game that follows Bedrock Edition instead (its touch settings and its Controls, as the Minecraft Wiki
// has them), in its two ways of touching the world:
//
//   tap to interact (Bedrock's "Joystick & tap to interact", the default there and here): the world is touched where
//     it is. A tap on a block places against it or uses it, a tap on a mob hits it, a tap on nothing uses what's in
//     hand (a snowball thrown). A finger held still on a block breaks it, and goes on to the next for as long as it
//     stays, a ring round the finger filling as the block gives way; held on a mob it uses what's in hand on it (wheat
//     fed, a villager's trades); held on nothing it uses what's in hand for as long as it stays (eating, a bow drawn).
//     There is no crosshair.
//   aim crosshair ("Joystick & aim crosshair"): the crosshair is what's aimed at, and two more buttons, a sword and
//     four marks, are the mouse's attack and use buttons, held as long as they are held.
//
// In both, the stick on the left walks (eight ways; pushed past its plate, sprinting), a finger dragged anywhere else
// turns the view, and buttons on the right jump, sneak (tapped on, tapped off; held, while flying, to go down) and
// sprint. A hotbar slot is tapped to hold what's in it, and held to throw its whole stack out; the dots at the
// hotbar's end open the inventory, the bars at the top pause. Three fingers at once are F3.
//
// On a screen (the menus, the inventory) a finger is the mouse's left button, and a drag that nothing on the screen
// takes scrolls it as the wheel would. A screen in the world that Escape would close (the inventory, a chest: they
// have no button that does) has a cross in the corner, which is that Escape.
//
// All of it goes in through Input, as the keys and buttons it stands for: the game beyond doesn't know a finger from
// a key. Positions here are the GUI's (GuiGraphics' units). The buttons' sprites are textures/touchControls.ts's.

import { KEYS, type Input } from './input';
import type { GuiGraphics } from '../gui/guiGraphics';

export type TouchMode = 'tap' | 'crosshair';

/** what the controls need of the game (Game; the tests hand them less) */
export interface TouchHost {
  readonly input: Input;
  readonly gui: { width: number; height: number };
  readonly screen: unknown;
  readonly inWorld: boolean;
  readonly spawned: boolean;
  /** how many of the GUI's units a CSS pixel is */
  cssPx(): number;
  /** how far in from each edge the screen is clear of a phone's notch, corners and home bar, in the GUI's units */
  insets(): { left: number; right: number; top: number; bottom: number };
  /** which of the two ways of touching the world is on */
  touchMode(): TouchMode;
  /** aim through (x, y) on the screen, now: what is there, within reach */
  targetAt(x: number, y: number): 'entity' | 'block' | null;
  /** a key as the keyboard would send it: Escape pauses, or closes the open screen; the inventory key opens it */
  tapKey(code: string): void;
  /** a screen is open in the world that Escape would close */
  screenCloses(): boolean;
  /** a finger on the open screen, as the mouse's left button there: whether the screen took it */
  touchScreen(type: 'down' | 'up' | 'move', mx: number, my: number): boolean;
  /** the wheel over the open screen, `d` notches (up is positive) */
  scrollScreen(mx: number, my: number, d: number): void;
  /** the player is flying: the buttons are up and down, and down is held rather than tapped on */
  flying(): boolean;
  /** throw out the whole stack in hand */
  dropStack(): void;
  /** how far the block being broken has given way, 0 to 1 */
  breakProgress(): number;
}

/**
 * sizes: a share of the screen's shorter side (as Bedrock's are of a phone's, measured off its "Customize controls"
 * screen), and no more than so many CSS pixels (a tablet's buttons aren't a hand wide)
 */
const BUTTON = 0.133, BUTTON_MAX = 60, STICK = 0.333, STICK_MAX = 150, TOP = 0.095, TOP_MAX = 40;
/** a finger that has moved less than this (CSS pixels) hasn't moved: it taps, or holds */
const SLOP = 9;
/** how long a finger stays still before it holds rather than taps */
export const HOLD_MS = 280;
/** how long a finger stays on a hotbar slot before its stack is thrown out */
export const DROP_MS = 1500;
/** how far the stick is pushed, in halves of its plate, before the player walks, and before the player sprints */
const DEAD = 0.15, SPRINT = 1.1;
/** a CSS pixel of a finger's drag, in the mouse's counts (the mouse sensitivity option applies after) */
const LOOK = 3;
/** a GUI unit of a finger's drag over a screen, in notches of the wheel */
const SCROLL = 1 / 14;
/** a button's key stays down at least this long: a tick must see it, or two quick taps of jump wouldn't start a flight */
const KEY_MS = 70;

type Role = 'none' | 'screen' | 'stick' | 'look' | 'jump' | 'sneak' | 'sprint' | 'attack' | 'interact' | 'hotbar';
/** the buttons a finger can go on to turn the view from, without letting go */
const TURNS = new Set<Role>(['look', 'jump', 'sneak', 'sprint', 'attack', 'interact']);

interface Finger {
  role: Role;
  /** where it came down, and where it is */
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  moved: boolean;
  /** (tap to interact) it has stayed still long enough: breaking the block under it, using what's in hand, or done with (a mob used) */
  holding: '' | 'break' | 'use' | 'done';
  /** (on the hotbar) its slot, and whether its stack has gone */
  slot: number;
  dropped: boolean;
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
  /** the stick's plate, and how wide the cap on it is */
  stick: Rect;
  knob: number;
  jump: Rect;
  sneak: Rect;
  sprint: Rect;
  /** (aim crosshair) the sword, and the four marks */
  attack: Rect;
  interact: Rect;
  pause: Rect;
  /** over a screen: the cross that closes it */
  close: Rect;
  /** the dots at the hotbar's end: the inventory */
  more: Rect;
  hotbar: Rect;
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

/**
 * the way a player looking (yaw, pitch) aims through a place on the screen: `nx` and `ny` from -1 to 1, right and up
 * of its middle; `fov` the view's height in degrees, `aspect` its width over its height. The middle is (yaw, pitch).
 */
export function aimAngles(yaw: number, pitch: number, fov: number, aspect: number, nx: number, ny: number): [number, number] {
  const yr = (yaw * Math.PI) / 180, pr = (pitch * Math.PI) / 180, t = Math.tan((fov * Math.PI) / 360);
  const a = nx * t * aspect, b = ny * t;
  const sy = Math.sin(yr), cy = Math.cos(yr), sp = Math.sin(pr), cp = Math.cos(pr);
  // (ahead, plus `a` to the right, plus `b` up: the view's own right and up)
  const dx = -sy * cp - cy * a - sy * sp * b;
  const dy = -sp + cp * b;
  const dz = cy * cp - sy * a + cy * sp * b;
  return [(Math.atan2(-dx, dz) * 180) / Math.PI, (-Math.asin(dy / Math.hypot(dx, dy, dz)) * 180) / Math.PI];
}

export class TouchControls {
  private readonly fingers = new Map<number, Finger>();
  /** the sneak button is on */
  sneaking = false;
  /** keys let go too soon for a tick to have seen them: each goes up at its time */
  private readonly keyUntil = new Map<string, number>();
  private readonly keyHeld = new Set<string>();
  /** (tap to interact) where a tap or a hold has just landed, aimed through till a tick has acted on it */
  private latch: [number, number] | null = null;

  constructor(private readonly host: TouchHost) {}

  layout(): TouchLayout {
    const W = this.host.gui.width, H = this.host.gui.height, u = this.host.cssPx();
    const m = Math.min(W, H), cx = Math.floor(W / 2);
    const b = Math.round(Math.min(m * BUTTON, BUTTON_MAX * u)), s = Math.round(Math.min(m * STICK, STICK_MAX * u)), c = Math.round(Math.min(m * TOP, TOP_MAX * u));
    // (the right hand's buttons: a column by the edge, jump over sneak over the four marks, each a button and a half
    // below the last; and a column beside it, sprint and the sword, each between two of those)
    // (in from the sides by what a phone's notch takes: the world is drawn under it, the controls aren't put there)
    const I = this.host.insets(), left = Math.round(I.left), right = Math.round(I.right), over = Math.round(I.top), clear = W - left - right;
    const col = W - right - Math.round(clear * 0.045) - b, col2 = col - b - Math.round(clear * 0.04);
    const top = Math.round(H * 0.333), step = Math.round(b * 1.5);
    const at = (x: number, y: number): Rect => ({ x, y, w: b, h: b });
    const edge = Math.round(m * 0.03);
    return {
      stick: { x: left + Math.round(clear * 0.075), y: Math.round(H * 0.55 - s / 2), w: s, h: s },
      knob: Math.round(s / 2),
      jump: at(col, top),
      sneak: at(col, top + step),
      interact: at(col, top + 2 * step),
      sprint: at(col2, top + Math.round(step / 2)),
      attack: at(col2, top + Math.round(step * 1.5)),
      pause: { x: cx - (c >> 1), y: over + edge, w: c, h: c },
      // (the corner away from the toasts')
      close: { x: left + edge, y: over + edge, w: c, h: c },
      more: { x: cx + 91, y: H - 22, w: 20, h: 22 },
      hotbar: { x: cx - 91, y: H - 22, w: 182, h: 22 },
    };
  }

  private playing(): boolean {
    return this.host.inWorld && this.host.spawned && !this.host.screen;
  }

  /** a button's key goes down */
  private keyDown(code: string, now: number): void {
    this.keyHeld.add(code);
    this.keyUntil.set(code, now + KEY_MS);
    this.host.input.down.add(code);
  }

  /** ...and up: now, or once a tick has had the time to see it */
  private keyUp(code: string, now: number): void {
    this.keyHeld.delete(code);
    if (now >= (this.keyUntil.get(code) ?? 0)) {
      this.keyUntil.delete(code);
      this.host.input.down.delete(code);
    }
  }

  /** a finger comes down at (x, y) */
  start(id: number, x: number, y: number, now: number): void {
    const inp = this.host.input;
    inp.touch = true;
    inp.touchAt = now;
    const f: Finger = { role: 'none', x0: x, y0: y, x, y, t0: now, moved: false, holding: '', slot: 0, dropped: false, taken: false, scroll: 0 };
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
      // (three fingers: F3. None of them taps or holds)
      for (const o of this.fingers.values()) o.moved = true;
      inp.press(KEYS.debug);
      return;
    }
    const L = this.layout();
    if (inside(L.pause, x, y, 3)) return this.host.tapKey('Escape');
    // (the hotbar's row, a little above it too: the dots past its end, the slots up to it)
    const row = y >= L.hotbar.y - 4;
    if (row && x >= L.more.x && x < L.more.x + L.more.w + 3) return this.host.tapKey(KEYS.inventory);
    if (inside(L.jump, x, y, 3)) {
      f.role = 'jump';
      return this.keyDown(KEYS.jump, now);
    }
    if (inside(L.sneak, x, y, 3)) {
      if (!this.host.flying()) return this.setSneak(!this.sneaking);
      f.role = 'sneak';
      return this.keyDown(KEYS.sneak, now);
    }
    if (inside(L.sprint, x, y, 3)) {
      f.role = 'sprint';
      return this.keyDown(KEYS.sprint, now);
    }
    if (this.host.touchMode() === 'crosshair') {
      const attack = inside(L.attack, x, y, 3);
      if (attack || inside(L.interact, x, y, 3)) {
        f.role = attack ? 'attack' : 'interact';
        inp.clicks.push(attack ? 0 : 2);
        inp.buttons[attack ? 0 : 2] = true;
        return;
      }
    }
    if (row && x >= L.hotbar.x - 3 && x < L.more.x) {
      f.role = 'hotbar';
      f.slot = Math.max(0, Math.min(8, Math.floor((x - L.hotbar.x - 1) / 20)));
      return inp.press(KEYS[`hotbar${f.slot + 1}` as keyof typeof KEYS]);
    }
    let stick = false;
    for (const o of this.fingers.values()) stick ||= o.role === 'stick';
    if (!stick && inside(L.stick, x, y, L.stick.w / 4)) {
      f.role = 'stick';
      this.steer(f, L);
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
    } else if (f.role === 'stick') this.steer(f, this.layout());
    else if (TURNS.has(f.role) && was) {
      // (the view turns once the finger is past the slop, from where it is then: a tap doesn't nudge the view)
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
    else if (f.role === 'stick') this.steer(null, null);
    else if (f.role === 'jump') this.keyUp(KEYS.jump, now);
    else if (f.role === 'sneak') this.keyUp(KEYS.sneak, now);
    else if (f.role === 'sprint') this.keyUp(KEYS.sprint, now);
    else if (f.role === 'attack') inp.buttons[0] = false;
    else if (f.role === 'interact') inp.buttons[2] = false;
    else if (f.role === 'look') {
      if (f.holding === 'break') inp.buttons[0] = false;
      else if (f.holding === 'use') inp.buttons[2] = false;
      else if (!f.holding && !f.moved && !cancelled && this.playing() && this.host.touchMode() === 'tap') {
        // (a tap: a mob is hit; a block, or nothing, has what's in hand used on it)
        inp.clicks.push(this.host.targetAt(x, y) === 'entity' ? 0 : 2);
        this.latch = [x, y];
      }
    }
  }

  /** the fingers on the glass are these and no others: any other we still have is let go of, doing nothing more */
  only(ids: Set<number>, now: number): void {
    for (const [id, f] of this.fingers) if (!ids.has(id)) this.end(id, f.x, f.y, now, true);
  }

  /** every frame: a finger that has stayed still long enough holds; keys tapped too briefly go up */
  frame(now: number): void {
    const inp = this.host.input;
    for (const [code, until] of this.keyUntil)
      if (now >= until && !this.keyHeld.has(code)) {
        this.keyUntil.delete(code);
        inp.down.delete(code);
      }
    // (the sneak button is the walking world's: out of it, in the air, or the mouse back in charge, it's off)
    if (this.sneaking && (!inp.touch || !this.host.inWorld || this.host.flying())) this.setSneak(false);
    if (!this.playing()) return;
    const tap = this.host.touchMode() === 'tap';
    for (const f of this.fingers.values()) {
      if (f.role === 'hotbar' && !f.dropped && !f.moved && now - f.t0 >= DROP_MS) {
        f.dropped = true;
        this.host.dropStack();
        buzz();
      }
      if (!tap || f.role !== 'look' || f.holding || f.moved || now - f.t0 < HOLD_MS) continue;
      const target = this.host.targetAt(f.x, f.y);
      if (target === 'block') {
        f.holding = 'break';
        inp.clicks.push(0);
        inp.buttons[0] = true;
        buzz();
      } else if (target === 'entity') {
        f.holding = 'done';
        inp.clicks.push(2);
        this.latch = [f.x, f.y];
      } else {
        f.holding = 'use';
        inp.clicks.push(2);
        inp.buttons[2] = true;
      }
    }
  }

  /**
   * (tap to interact) where on the screen the player is aiming: under the finger that is breaking a block, or where a
   * tap or a hold has just landed; null, at nothing (a finger only turning the view aims at nothing)
   */
  aim(): [number, number] | null {
    for (const f of this.fingers.values()) if (f.role === 'look' && f.holding === 'break') return [f.x, f.y];
    return this.latch;
  }

  /** a tick has acted on the clicks: a tap's aim is done with */
  ticked(): void {
    this.latch = null;
  }

  private setSneak(on: boolean): void {
    this.sneaking = on;
    if (on) this.host.input.down.add(KEYS.sneak);
    else this.host.input.down.delete(KEYS.sneak);
  }

  /** the stick's keys from where its finger is on its plate (null: let go) */
  private steer(f: Finger | null, L: TouchLayout | null): void {
    const keys = this.host.input.down;
    const set = (code: string, on: boolean) => (on ? keys.add(code) : keys.delete(code));
    let dx = 0, dy = 0;
    if (f && L) {
      const r = Math.max(1, L.stick.w / 2);
      dx = (f.x - (L.stick.x + r)) / r;
      dy = (f.y - (L.stick.y + r)) / r;
    }
    // (eight ways: straight ahead is 0, to the right a quarter turn)
    const d = Math.hypot(dx, dy), a = Math.atan2(dx, -dy), s = Math.abs(a), on = d >= DEAD;
    const forward = on && s < (Math.PI * 3) / 8;
    set(KEYS.forward, forward);
    set(KEYS.back, on && s > (Math.PI * 5) / 8);
    set(KEYS.right, on && a > Math.PI / 8 && a < (Math.PI * 7) / 8);
    set(KEYS.left, on && a < -Math.PI / 8 && a > (-Math.PI * 7) / 8);
    // (vanilla Bedrock: sprinting starts when the stick is dragged a little past its plate. The sprint button's key is its own)
    if (!this.keyHeld.has(KEYS.sprint) && !this.keyUntil.has(KEYS.sprint)) set(KEYS.sprint, forward && d >= SPRINT);
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
    target.addEventListener('touchstart', (e) => {
      // (a finger whose lifting was never heard isn't on the glass: the browser's own list of them says who is)
      const on = new Set<number>();
      for (let i = 0; i < e.touches.length; i++) on.add(e.touches[i].identifier);
      this.only(on, performance.now());
      each(e, (id, x, y, now) => this.start(id, x, y, now));
    }, opts);
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
  render(g: GuiGraphics, now: number): void {
    if (!this.host.input.touch || !this.playing()) return;
    const L = this.layout(), fly = this.host.flying(), u = this.host.cssPx();
    let stick: Finger | null = null;
    const held = new Set<Role>();
    for (const f of this.fingers.values()) {
      held.add(f.role);
      if (f.role === 'stick') stick = f;
    }
    // the stick: its plate, and its cap where the thumb has pushed it (to the plate's edge; past it, sprinting)
    g.sprite('touch_stick', L.stick.x, L.stick.y, L.stick.w, L.stick.h, 0, 0, 32, 32, 0.45);
    const r = L.stick.w / 2, mx = L.stick.x + r, my = L.stick.y + r;
    let kx = 0, ky = 0;
    if (stick) {
      kx = stick.x - mx;
      ky = stick.y - my;
      const d = Math.hypot(kx, ky), reach = d >= r * SPRINT ? r * 0.85 : r * 0.5;
      if (d > reach) {
        kx *= reach / d;
        ky *= reach / d;
      }
    }
    g.sprite(stick ? 'touch_knob_lit' : 'touch_knob', Math.round(mx + kx - L.knob / 2), Math.round(my + ky - L.knob / 2), L.knob, L.knob, 0, 0, 16, 16, stick ? 0.85 : 0.7);
    button(g, fly ? 'ascend' : 'jump', L.jump, held.has('jump'));
    button(g, fly ? 'descend' : 'sneak', L.sneak, this.sneaking || held.has('sneak'));
    button(g, 'sprint', L.sprint, held.has('sprint'));
    if (this.host.touchMode() === 'crosshair') {
      button(g, 'attack', L.attack, held.has('attack'));
      button(g, 'interact', L.interact, held.has('interact'));
    }
    button(g, 'pause', L.pause, false);
    // the hotbar's end: one more slot, with the dots that open the inventory
    g.sprite('hotbar', L.more.x - 1, L.more.y, 21, 22, 161, 0, 21, 22);
    for (let i = 0; i < 3; i++) {
      g.fill(L.more.x + 3 + i * 5, L.more.y + 11, L.more.x + 6 + i * 5, L.more.y + 14, 0xff3f3f3f);
      g.fill(L.more.x + 3 + i * 5, L.more.y + 10, L.more.x + 5 + i * 5, L.more.y + 12, 0xffffffff);
    }
    for (const f of this.fingers.values()) {
      if (f.role === 'hotbar' && !f.dropped && !f.moved && now - f.t0 > HOLD_MS) {
        // (held on a slot: it fills, and at the top its stack goes)
        const h = Math.round(16 * Math.min(1, (now - f.t0 - HOLD_MS) / (DROP_MS - HOLD_MS)));
        const x = L.hotbar.x + 3 + f.slot * 20;
        g.fill(x, L.hotbar.y + 19 - h, x + 16, L.hotbar.y + 19, 0x9040d040);
      }
      if (f.role === 'look' && f.holding === 'break') {
        // (the ring round the finger that breaks: 24 marks, lit as the block gives way)
        const lit = Math.max(0, Math.min(24, Math.round(this.host.breakProgress() * 24))), d = Math.round(72 * u);
        g.sprite(`touch_ring_${lit}`, Math.round(f.x - d / 2), Math.round(f.y - d / 2), d, d, 0, 0, 33, 33, 0.9);
      }
    }
    if (g.height > g.width) g.centered('Turn your phone sideways', g.width / 2, Math.floor(g.height * 0.2), 0xffffff);
  }

  /** over an open screen: the cross that closes it */
  renderOver(g: GuiGraphics): void {
    if (this.host.input.touch && this.host.screen && this.host.screenCloses()) button(g, 'close', this.layout().close, false);
  }
}

/** a button: its key cap (textures/touchControls.ts), lit while it's held or on, part see-through */
function button(g: GuiGraphics, name: string, r: Rect, lit: boolean): void {
  g.sprite(`touch_${name}${lit ? '_lit' : ''}`, r.x, r.y, r.w, r.h, 0, 0, 22, 22, lit ? 0.9 : 0.7);
}

/** (Bedrock: "Vibrate when breaking blocks") a short buzz, where the device has one */
function buzz(): void {
  if (typeof navigator !== 'undefined') navigator.vibrate?.(8);
}
