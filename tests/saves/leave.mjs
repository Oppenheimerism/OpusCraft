// Saving as the page goes away: saves never overlap (one asked for meanwhile waits, and the asks share it); with a
// world open a hidden tab or a page being left saves it (not on a loading screen, not while a save is being
// written); leaving asks first in a build (not on a dev server, not outside a world); the browser is asked once to
// keep the saves; quick-test worlds are left alone. (A fake window, document and navigator stand in for the page.)

import { load, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/game/saveOnLeave.ts']);
const turn = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------------------------------------------------------
// SaveQueue

{
  let runs = 0, running = 0, overlapped = false;
  const holds = [];
  const q = new m.SaveQueue(async () => {
    runs++;
    if (++running > 1) overlapped = true;
    await new Promise((r) => holds.push(r));
    running--;
  });
  const a = q.run();
  check('queue: a save runs', runs === 1 && q.running);
  const b = q.run(), c = q.run();
  await turn();
  check('queue: asked for while one is written, nothing more starts', runs === 1);
  check('queue: the asks meanwhile share one save', b === c && b !== a);
  holds.shift()();
  await a;
  await turn();
  check('queue: once it\'s done, the one asked for runs', runs === 2 && q.running);
  holds.shift()();
  await b;
  check('queue: then it\'s idle, and no two ever ran at once', !q.running && runs === 2 && !overlapped);
}
{
  let n = 0;
  const q = new m.SaveQueue(async () => {
    if (++n === 1) throw new Error('quota');
  });
  const a = q.run(), b = q.run();
  const err = await a.then(() => null, (e) => e);
  await b;
  check('queue: a save that fails is heard of, and the next still runs', err?.message === 'quota' && n === 2 && !q.running);
}

// ---------------------------------------------------------------------------------------------------------------
// The page

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(t, f) {
    if (!this.listeners.has(t)) this.listeners.set(t, new Set());
    this.listeners.get(t).add(f);
  }
  removeEventListener(t, f) {
    this.listeners.get(t)?.delete(f);
  }
  count(t) {
    return this.listeners.get(t)?.size ?? 0;
  }
  fire(t, e = {}) {
    for (const f of [...(this.listeners.get(t) ?? [])]) f(e);
    return e;
  }
}
const win = new FakeTarget();
const doc = Object.assign(new FakeTarget(), { visibilityState: 'visible' });
const asked = { persisted: 0, persist: 0 };
const storage = { persisted: async () => (asked.persisted++, false), persist: async () => (asked.persist++, true) };
Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { storage }, configurable: true });

class FakeGame {
  constructor(transient = false) {
    this.inWorld = true;
    this.spawned = true;
    this.meta = { transient };
    this.saves = 0;
    this.holds = [];
    this.queue = new m.SaveQueue(() => (this.saves++, new Promise((r) => this.holds.push(r))));
  }
  get isSaving() {
    return this.queue.running;
  }
  saveWorld() {
    return this.queue.run();
  }
  async finish() {
    this.holds.shift()?.();
    await turn();
  }
}
const beforeUnload = () => ({ prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } });
const hide = () => ((doc.visibilityState = 'hidden'), doc.fire('visibilitychange'));
const show = () => ((doc.visibilityState = 'visible'), doc.fire('visibilitychange'));

{
  m.watchPageLeave(new FakeGame(true), true);
  await turn();
  check('a quick-test world: nothing listened for, the browser not asked', doc.count('visibilitychange') + win.count('pagehide') + win.count('beforeunload') === 0 && asked.persist === 0 && asked.persisted === 0);
}

const g = new FakeGame();
m.watchPageLeave(g);
await turn();
check('a world opened: the browser is asked to keep the saves', asked.persisted === 1 && asked.persist === 1, JSON.stringify(asked));
check('on a dev server, leaving the page doesn\'t ask', win.count('beforeunload') === 0);
check('the page\'s going away is listened for', doc.count('visibilitychange') === 1 && win.count('pagehide') === 1);

hide();
check('the tab hidden: the world is saved', g.saves === 1 && g.isSaving);
win.fire('pagehide');
check('the page left while that save is being written: no second one', g.saves === 1);
await g.finish();
win.fire('pagehide');
check('the page left after: saved', g.saves === 2);
await g.finish();
show();
check('the tab shown again: nothing to do', g.saves === 2);
g.spawned = false;
hide();
check('on a loading screen (the player not in place): not saved', g.saves === 2);
g.spawned = true;
g.inWorld = false;
win.fire('pagehide');
check('out of the world: not saved', g.saves === 2);
g.inWorld = true;

{
  // a production build
  m.watchPageLeave(g, true);
  await turn();
  check('opened again: the browser isn\'t asked twice', asked.persist === 1 && asked.persisted === 1);
  check('in a build, leaving the page is listened for too', win.count('beforeunload') === 1 && doc.count('visibilitychange') === 1 && win.count('pagehide') === 1);
  const e = win.fire('beforeunload', beforeUnload());
  check('leaving (Cmd+W): the browser asks first (preventDefault and returnValue), and a save starts', e.prevented && e.returnValue === true && g.saves === 3);
  const e2 = win.fire('beforeunload', beforeUnload());
  check('asked again while that save is written: asks, but no second save', e2.prevented && g.saves === 3);
  await g.finish();
  g.inWorld = false;
  const e3 = win.fire('beforeunload', beforeUnload());
  check('out of the world (the title screen, the menus): no asking', !e3.prevented && e3.returnValue === undefined && g.saves === 3);
  g.inWorld = true;
}

m.unwatchPageLeave();
check('the world left: nothing listened for', doc.count('visibilitychange') + win.count('pagehide') + win.count('beforeunload') === 0);
hide();
win.fire('pagehide');
const e = win.fire('beforeunload', beforeUnload());
check('the world left: the page going away does nothing', g.saves === 3 && !e.prevented);

await exitWithStatus(close);
