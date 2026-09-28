// A guest's name is who it is to the host's world (as on a vanilla LAN world), so coming back by another name is coming
// back as somebody new, with nothing. The name a guest joins by is kept for the next time: in its tab (so two windows of
// one browser can still be two players), and in the browser, so a tab closed and the link opened again in a new one
// comes back by the same name. With none kept, the Multiplayer screen's Name box is empty till one is typed, where it
// used to make one up (Player123) that came back as a stranger.

import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();

/** a Storage as the browser has it, per tab (sessionStorage) or per site (localStorage) */
class MemStorage {
  constructor() {
    this.m = new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  clear() {
    this.m.clear();
  }
}
const local = new MemStorage();
let session = new MemStorage();
Object.defineProperty(globalThis, 'localStorage', { get: () => local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { get: () => session, configurable: true });

const { mods, close } = await loadModules(['/src/gui/screens/multiplayer.ts']);
const [mp] = mods;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const game = { opts: { renderDistance: 8 } };

check('never joined: no name (the Name box is empty till one is typed)', mp.rememberedName() === '');
check('...though ?mp=join (for tests) still makes one up', /^Player\d{3}$/.test(mp.guestName()));

const id = mp.guestIdentity(game, 'Alex', 'ABCD-EFGH');
check('joining as Alex: its uuid is the name\'s', id.name === 'Alex' && id.uuid === mp.guestIdentity(game, 'Alex', '').uuid);
check('...kept in the tab', session.getItem('mc-mp-name') === 'Alex' && mp.rememberedName() === 'Alex');

// the tab closed, the link opened again in a new one
session = new MemStorage();
check('a new tab: the name the browser last joined as (Alex), not a new one', mp.rememberedName() === 'Alex' && mp.guestName() === 'Alex');

// a second window of the same browser, joined as another
mp.guestIdentity(game, 'Steve', '');
check('another window joining as Steve: that window is Steve', mp.rememberedName() === 'Steve');
const steveTab = session;
session = new MemStorage();
session.setItem('mc-mp-name', 'Alex');
check("...and a window that was Alex stays Alex (its tab's own name first)", mp.rememberedName() === 'Alex');
session = steveTab;
check('...Steve\'s stays Steve', mp.rememberedName() === 'Steve');

// what isn't a name is never offered
session = new MemStorage();
local.setItem('mc-mp-name', 'no');
check('a kept name that isn\'t one (too short) is left out', mp.rememberedName() === '');
local.setItem('mc-mp-name', 'Ok_Name_12');
check('...a good one is offered', mp.rememberedName() === 'Ok_Name_12');

// no storage at all (a browser that refuses it): nothing kept, nothing breaks
Object.defineProperty(globalThis, 'localStorage', { get: () => { throw new Error('denied'); }, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { get: () => { throw new Error('denied'); }, configurable: true });
let threw = false;
try {
  mp.guestIdentity(game, 'Alex', '');
  check('no storage: the Name box is simply empty', mp.rememberedName() === '');
} catch {
  threw = true;
}
check('...and nothing breaks', !threw);

await close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
