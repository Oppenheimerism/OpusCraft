// Keeping a world's save safe from the page going away. Vanilla's saves are files; a browser's can be evicted
// under storage pressure and a tab closed at any moment. So while a world is open the browser is asked to keep the
// saves (navigator.storage.persist), the world is saved when its tab is hidden or the page is left, and in a build
// leaving the page asks first, so a stray Cmd+W doesn't lose the play since the last autosave (up to five minutes).

/** what the page needs of the game (game/game.ts) */
export interface SavingGame {
  readonly inWorld: boolean;
  /** in the world, not on a loading screen (a world is saved only then, as autosave has it) */
  readonly spawned: boolean;
  readonly meta: { transient?: boolean } | null;
  /** a save is being written */
  readonly isSaving: boolean;
  saveWorld(): Promise<void>;
}

/** one save at a time: one asked for while another is written waits for it, and asks meanwhile share that one */
export class SaveQueue {
  private current: Promise<void> | null = null;
  private queued: Promise<void> | null = null;

  constructor(private readonly save: () => Promise<void>) {}

  get running(): boolean {
    return this.current !== null;
  }

  run(): Promise<void> {
    if (this.current) {
      return (this.queued ??= this.current.catch(() => {}).then(() => {
        this.queued = null;
        return this.run();
      }));
    }
    const p = this.save().finally(() => {
      if (this.current === p) this.current = null;
    });
    this.current = p;
    return p;
  }
}

let persistAsked = false;

/** asks the browser once not to evict the saves under storage pressure (never waited on; some browsers can't) */
export function requestPersistentStorage(): void {
  if (persistAsked) return;
  persistAsked = true;
  // (navigator.storage is only there on https and localhost)
  const s = typeof navigator !== 'undefined' ? (navigator as { storage?: StorageManager }).storage : undefined;
  if (!s || typeof s.persist !== 'function') return;
  void (typeof s.persisted === 'function' ? s.persisted() : Promise.resolve(false))
    .then((kept) => kept || s.persist())
    .catch(() => false);
}

let watched: SavingGame | null = null;

function open(g: SavingGame | null): g is SavingGame {
  return !!g && g.inWorld && !!g.meta && !g.meta.transient;
}

/**
 * best effort: the page may be gone before it's written. Not on a loading screen (the player isn't in place yet),
 * and no second save starts while one is being written.
 */
function saveNow(): void {
  const g = watched;
  if (!open(g) || !g.spawned || g.isSaving) return;
  g.saveWorld().catch((e) => console.warn('saving as the page went away failed', e));
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') saveNow();
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (!open(watched)) return;
  saveNow();
  // (the browser's own "Leave site?" asks; staying lets the save finish)
  e.preventDefault();
  e.returnValue = true;
}

/**
 * from opening a world (Game.startWorld) till it's left (Game.leaveWorld): saves when the tab is hidden or the page
 * left, and `askBeforeLeaving` (production builds) has the browser confirm leaving the page while the world is open.
 * Quick-test worlds are never saved, so they're left alone.
 */
export function watchPageLeave(game: SavingGame, askBeforeLeaving = !import.meta.env.DEV): void {
  unwatchPageLeave();
  if (!game.meta || game.meta.transient) return;
  requestPersistentStorage();
  watched = game;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', saveNow);
  if (askBeforeLeaving) window.addEventListener('beforeunload', onBeforeUnload);
}

export function unwatchPageLeave(): void {
  if (!watched) return;
  watched = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', saveNow);
  window.removeEventListener('beforeunload', onBeforeUnload);
}
