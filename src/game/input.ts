// Keyboard / mouse input with pointer lock (vanilla default key bindings).

export const KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sneak: 'ShiftLeft',
  sprint: 'ControlLeft',
  inventory: 'KeyE',
  drop: 'KeyQ',
  chat: 'KeyT',
  command: 'Slash',
  togglePerspective: 'F5',
  debug: 'F3',
  hideGui: 'F1',
  screenshot: 'F2',
  fullscreen: 'F11',
  swapHands: 'KeyF',
  playerList: 'Tab',
  hotbar1: 'Digit1',
  hotbar2: 'Digit2',
  hotbar3: 'Digit3',
  hotbar4: 'Digit4',
  hotbar5: 'Digit5',
  hotbar6: 'Digit6',
  hotbar7: 'Digit7',
  hotbar8: 'Digit8',
  hotbar9: 'Digit9',
  loadToolbar: 'KeyX',
  saveToolbar: 'KeyC',
  advancements: 'KeyL',
  socialInteractions: 'KeyP',
  cinematic: '',
  spectatorOutlines: '',
};

export class Input {
  readonly down = new Set<string>();
  private readonly pressedQueue: string[] = [];
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  readonly buttons = [false, false, false];
  readonly clicks: number[] = [];
  private realLocked = false;
  /** test hook: behave as if the pointer were locked */
  forceLocked = false;
  get locked(): boolean {
    return this.realLocked || this.forceLocked;
  }
  onLockChange: ((locked: boolean) => void) | null = null;
  /** requestPointerLock was refused (e.g. no recent user gesture) */
  onLockError: (() => void) | null = null;
  /** raw key events for text input (chat, fields) */
  onKey: ((e: KeyboardEvent) => boolean) | null = null;
  onChar: ((ch: string) => void) | null = null;
  onMouse: ((e: MouseEvent, type: 'down' | 'up' | 'move') => void) | null = null;
  onWheelRaw: ((d: number) => void) | null = null;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // held-key state is tracked even while a screen consumes the event (shift-click etc.)
      if (!e.repeat) this.down.add(e.code);
      if (this.onKey && this.onKey(e)) {
        e.preventDefault();
        return;
      }
      if (!e.repeat) {
        this.down.add(e.code);
        this.pressedQueue.push(e.code);
      }
      // keep browser shortcuts from stealing game keys
      if (['Space', 'Tab', 'F1', 'F3', 'F5', 'Slash', 'Quote'].includes(e.code) || (e.code.startsWith('Key') && !e.metaKey)) e.preventDefault();
      if (e.key.length === 1 && this.onChar) this.onChar(e.key);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.buttons[0] = this.buttons[1] = this.buttons[2] = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
      this.onMouse?.(e, 'move');
    });
    target.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.onMouse) return;
      if (e.button <= 2) {
        this.buttons[e.button] = true;
        this.clicks.push(e.button);
      }
      this.onMouse?.(e, 'down');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button <= 2) this.buttons[e.button] = false;
      this.onMouse?.(e, 'up');
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        this.onWheelRaw?.(Math.sign(e.deltaY));
        e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener('pointerlockerror', () => this.onLockError?.());
    document.addEventListener('pointerlockchange', () => {
      this.realLocked = document.pointerLockElement === this.target;
      if (!this.locked) {
        this.buttons[0] = this.buttons[1] = this.buttons[2] = false;
      }
      this.onLockChange?.(this.locked);
    });
  }

  lock(): void {
    if (!this.locked) {
      const p = this.target.requestPointerLock?.({ unadjustedMovement: true } as never) as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function')
        p.catch(() => {
          // raw input unsupported: retry plain, and report a refusal
          const p2 = this.target.requestPointerLock?.() as unknown as Promise<void> | undefined;
          if (p2 && typeof p2.catch === 'function') p2.catch(() => this.onLockError?.());
        });
    }
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Consume key presses since last call. */
  pressed(): string[] {
    return this.pressedQueue.splice(0, this.pressedQueue.length);
  }

  consumeClicks(): number[] {
    return this.clicks.splice(0, this.clicks.length);
  }

  consumeMouse(): [number, number] {
    const r: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
}
