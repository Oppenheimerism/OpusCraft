// Toast notifications (vanilla ToastComponent and its toasts): up to five
// 160x32 slots at the top-right of the screen, each sliding in and out over
// 600 ms (in real time, not game ticks). Advancement, recipe, tutorial and
// system toasts.

import type { GuiGraphics } from './guiGraphics';

export type Visibility = 'show' | 'hide';

export interface Toast {
  readonly width: number;
  readonly height: number;
  /** vanilla getToken: at most one toast per kind+token can be queued/visible */
  readonly kind: string;
  readonly token?: string;
  /** draw at (0,0); `since` = ms since the toast finished sliding in */
  render(g: GuiGraphics, since: number, tc: ToastComponent): Visibility;
}

const SLOTS = 5;
const ANIM = 600;

class ToastInstance {
  animationTime = -1;
  visibleTime = -1;
  visibility: Visibility = 'show';
  constructor(readonly toast: Toast, readonly index: number, readonly slots: number) {}

  private progress(now: number): number {
    let f = Math.max(0, Math.min(1, (now - this.animationTime) / ANIM));
    f *= f;
    return this.visibility === 'hide' ? 1 - f : f;
  }

  /** true once it has fully slid out */
  render(g: GuiGraphics, screenW: number, now: number, tc: ToastComponent): boolean {
    if (this.animationTime < 0) {
      this.animationTime = now;
      tc.playSound(this.visibility);
    }
    if (this.visibility === 'show' && now - this.animationTime <= ANIM) this.visibleTime = now;
    g.pushTransform(screenW - this.toast.width * this.progress(now), this.index * 32);
    const v = this.toast.render(g, now - this.visibleTime, tc);
    g.popTransform();
    if (v !== this.visibility) {
      this.animationTime = now - Math.floor((1 - this.progress(now)) * ANIM);
      this.visibility = v;
      tc.playSound(v);
    }
    return this.visibility === 'hide' && now - this.animationTime > ANIM;
  }
}

export class ToastComponent {
  private visible: ToastInstance[] = [];
  private readonly occupied = new Array<boolean>(SLOTS).fill(false);
  private queued: Toast[] = [];
  /** vanilla notificationDisplayTime option (multiplier) */
  displayTime = 1;

  constructor(private readonly sound: (name: string, volume: number, pitch: number) => void) {}

  playSound(v: Visibility): void {
    this.sound(v === 'show' ? 'ui.toast.in' : 'ui.toast.out', 1, 1);
  }

  play(name: string): void {
    this.sound(name, 1, 1);
  }

  add(t: Toast): void {
    this.queued.push(t);
  }

  /** vanilla getToast(class, token): a visible or queued toast to update in place */
  get<T extends Toast>(kind: string, token?: string): T | null {
    for (const i of this.visible) if (i.toast.kind === kind && i.toast.token === token) return i.toast as T;
    for (const t of this.queued) if (t.kind === kind && t.token === token) return t as T;
    return null;
  }

  clear(): void {
    this.occupied.fill(false);
    this.visible = [];
    this.queued = [];
  }

  render(g: GuiGraphics, now = performance.now()): void {
    const w = g.width;
    this.visible = this.visible.filter((inst) => {
      if (inst.render(g, w, now, this)) {
        for (let k = inst.index; k < inst.index + inst.slots; k++) this.occupied[k] = false;
        return false;
      }
      return true;
    });
    if (this.queued.length && this.occupied.includes(false)) {
      this.queued = this.queued.filter((t) => {
        const n = Math.max(1, Math.ceil(t.height / 32));
        const at = this.freeIndex(n);
        if (at < 0) return true;
        this.visible.push(new ToastInstance(t, at, n));
        for (let k = at; k < at + n; k++) this.occupied[k] = true;
        return false;
      });
    }
  }

  private freeIndex(n: number): number {
    let run = 0;
    for (let i = 0; i < SLOTS; i++) {
      if (this.occupied[i]) run = 0;
      else if (++run === n) return i - n + 1;
    }
    return -1;
  }
}

// ---------------------------------------------------------------------------
// the toasts

export type FrameType = 'task' | 'goal' | 'challenge';
const FRAME_TITLE: Record<FrameType, string> = { task: 'Advancement Made!', goal: 'Goal Reached!', challenge: 'Challenge Complete!' };

/** vanilla AdvancementToast */
export class AdvancementToast implements Toast {
  readonly width = 160;
  readonly height = 32;
  readonly kind = 'advancement';
  private playedSound = false;
  constructor(readonly title: string, readonly frame: FrameType, readonly icon: string) {}

  render(g: GuiGraphics, since: number, tc: ToastComponent): Visibility {
    g.sprite('toast_advancement', 0, 0, 160, 32);
    const lines = g.wrap(this.title, 125);
    const color = this.frame === 'challenge' ? 0xff88ff : 0xffff00;
    if (lines.length === 1) {
      g.text(FRAME_TITLE[this.frame], 30, 7, color, false);
      g.text(lines[0], 30, 18, 0xffffff, false);
    } else if (since < 1500) {
      // long names: the frame title first, then the wrapped name fades in
      const a = Math.max(0, Math.min(1, (1500 - since) / 300));
      g.text(FRAME_TITLE[this.frame], 30, 11, color, false, Math.max(a, 4 / 255));
    } else {
      const a = Math.max(0, Math.min(1, (since - 1500) / 300)) * (252 / 255);
      let y = Math.floor(this.height / 2 - (lines.length * 9) / 2);
      for (const l of lines) {
        g.text(l, 30, y, 0xffffff, false, Math.max(a, 4 / 255));
        y += 9;
      }
    }
    if (!this.playedSound && since > 0) {
      this.playedSound = true;
      if (this.frame === 'challenge') tc.play('ui.toast.challenge_complete');
    }
    g.item(this.icon, 8, 8);
    return since >= 5000 * tc.displayTime ? 'hide' : 'show';
  }
}

/** vanilla RecipeToast: cycles through the recipes unlocked while it's up */
export class RecipeToast implements Toast {
  readonly width = 160;
  readonly height = 32;
  readonly kind = 'recipe';
  private readonly recipes: { result: string; symbol: string }[] = [];
  private changed = false;
  private lastChanged = 0;

  constructor(result: string, symbol: string) {
    this.recipes.push({ result, symbol });
  }

  addItem(result: string, symbol: string): void {
    this.recipes.push({ result, symbol });
    this.changed = true;
  }

  render(g: GuiGraphics, since: number, tc: ToastComponent): Visibility {
    if (this.changed) {
      this.lastChanged = since;
      this.changed = false;
    }
    if (!this.recipes.length) return 'hide';
    g.sprite('toast_recipe', 0, 0, 160, 32);
    g.text('New Recipes Unlocked!', 30, 7, 0x500050, false);
    g.text('Check your recipe book', 30, 18, 0x000000, false);
    const per = Math.max(1, (5000 * tc.displayTime) / this.recipes.length);
    const r = this.recipes[Math.floor(since / per) % this.recipes.length];
    // the workstation badge (crafting table / furnace) small in the corner, the result over it
    g.pushTransform(0, 0, 0, 0.6);
    g.item(r.symbol, 3, 3);
    g.popTransform();
    g.item(r.result, 8, 8);
    return since - this.lastChanged >= 5000 * tc.displayTime ? 'hide' : 'show';
  }
}

export type TutorialIcon = 'movement_keys' | 'mouse' | 'tree' | 'recipe_book' | 'wooden_planks' | 'social_interactions' | 'right_click';

/** vanilla TutorialToast: hint with an icon and an optional progress bar */
export class TutorialToast implements Toast {
  readonly width = 160;
  readonly height = 32;
  readonly kind = 'tutorial';
  private visibility: Visibility = 'show';
  private lastProgressTime = 0;
  private lastProgress = 0;
  private progressValue = 0;

  constructor(readonly icon: TutorialIcon, readonly title: string, readonly message: string | null, readonly progressable: boolean) {}

  render(g: GuiGraphics, since: number): Visibility {
    g.sprite('toast_tutorial', 0, 0, 160, 32);
    g.sprite('toast_' + this.icon, 6, 6, 20, 20);
    if (!this.message) g.text(this.title, 30, 12, 0x500050, false);
    else {
      g.text(this.title, 30, 7, 0x500050, false);
      g.text(this.message, 30, 18, 0x000000, false);
    }
    if (this.progressable) {
      g.fill(3, 28, 157, 29, 0xffffffff);
      const t = Math.max(0, Math.min(1, (since - this.lastProgressTime) / 100));
      const f = this.lastProgress + (this.progressValue - this.lastProgress) * t;
      const color = this.progressValue >= this.lastProgress ? 0xff006500 : 0xff550000;
      g.fill(3, 28, Math.floor(3 + 154 * f), 29, color);
      this.lastProgress = f;
      this.lastProgressTime = since;
    }
    return this.visibility;
  }

  hide(): void {
    this.visibility = 'hide';
  }

  updateProgress(p: number): void {
    this.progressValue = p;
  }
}

/** vanilla SystemToast (e.g. "Unable to save" messages) */
export class SystemToast implements Toast {
  readonly width = 160;
  readonly height = 32;
  readonly kind = 'system';
  constructor(readonly token: string, readonly title: string, readonly message: string | null) {}

  render(g: GuiGraphics, since: number, tc: ToastComponent): Visibility {
    g.sprite('toast_system', 0, 0, 160, 32);
    if (!this.message) g.text(this.title, 18, 12, 0xffff00, false);
    else {
      g.text(this.title, 18, 7, 0xffff00, false);
      g.text(this.message, 18, 18, 0xffffff, false);
    }
    return since < 5000 * tc.displayTime ? 'show' : 'hide';
  }
}
