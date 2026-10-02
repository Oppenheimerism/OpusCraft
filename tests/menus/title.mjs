// The game's own name (src/brand.ts) on the title screen: the logo is drawn from it, every letter of it, as wide as
// the word (so the title screen and the credits centre it by its width), with WEB EDITION under it where vanilla says
// JAVA EDITION; the advancements say the name where vanilla's say Minecraft. And a site with no relay (the game's public
// one: static files, nothing at /__mp): the Multiplayer screen's list of the relay's worlds knows there is none to hear
// from, so the screen can say who can join there. And on a phone or a tablet: going on from the title screen says
// first, once, how the game is played with fingers, the way vanilla warns before Multiplayer, with Proceed and Back.

import { load, check, exitWithStatus } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();

const { m, close } = await load(['/src/brand.ts', '/src/textures/gui.ts', '/src/game/advancements.ts', '/src/net/transport/webSocket.ts', '/src/gui/screens/menus.ts']);

// the logo
const logo = m.GUI_TEXTURES.title_logo();
const alpha = (t, x, y) => t.data[(y * t.w + x) * 4 + 3];
const columnsUsed = (t) => {
  let n = 0;
  for (let x = 0; x < t.w; x++) for (let y = 0; y < t.h; y++) if (alpha(t, x, y)) { n++; break; }
  return n;
};
// (letters apart: runs of columns with something in them, a gap of clear columns between a letter's outline and the next's)
const runs = (t) => {
  let n = 0, inRun = false;
  for (let x = 0; x < t.w; x++) {
    let any = false;
    for (let y = 0; y < t.h && !any; y++) any = alpha(t, x, y) > 0;
    if (any && !inRun) n++;
    inRun = any;
  }
  return n;
};
check('the name is one the logo can be drawn in: letters only, and not Minecraft', /^[A-Za-z]+$/.test(m.GAME_NAME) && !/minecraft/i.test(m.GAME_NAME), m.GAME_NAME);
check('the logo: 44 tall, a letter for every letter of the name, each apart from the next', logo.h === 44 && runs(logo) === m.GAME_NAME.length, `${logo.w}x${logo.h}, ${runs(logo)} letters for "${m.GAME_NAME}"`);
check('...as wide as its word, to the edge on both sides, and narrow enough for the smallest screen (320)', alpha(logo, 0, 20) + alpha(logo, 1, 20) > 0 && columnsUsed(logo) > logo.w - m.GAME_NAME.length * 3 && logo.w <= 320, `${logo.w} wide, ${columnsUsed(logo)} columns drawn`);
const edition = m.GUI_TEXTURES.title_edition();
let left = edition.w, right = -1;
for (let x = 0; x < edition.w; x++) for (let y = 0; y < edition.h; y++) if (alpha(edition, x, y)) { left = Math.min(left, x); right = Math.max(right, x); }
check('the edition badge: 128x14, its words in the middle of it', edition.w === 128 && edition.h === 14 && right > left && Math.abs(left - (edition.w - 1 - right)) <= 2, `${edition.w}x${edition.h}, drawn from ${left} to ${right}`);

// the advancements that say the game's name
const adv = (id) => m.ADVANCEMENTS.get(id);
const all = [...m.ADVANCEMENTS.values()];
check('the Story tab is the game\'s name, and Trial(s) Edition has it before it', adv('story/root')?.title === m.GAME_NAME && adv('adventure/minecraft_trials_edition')?.title === `${m.GAME_NAME}: Trial(s) Edition`, `${adv('story/root')?.title}; ${adv('adventure/minecraft_trials_edition')?.title}`);
check('no advancement is called Minecraft any more', all.length > 50 && !all.some((a) => /minecraft/i.test(a.title)), all.filter((a) => /minecraft/i.test(a.title)).map((a) => a.title).join());

// the relay's list of worlds, on a site with a relay and on one with none
const URL = 'ws://site.test/__mp?role=list';
const fakeSocket = () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {}, send() {} });
{
  const s = fakeSocket();
  const list = new m.RelayWorldList({ url: URL, socket: () => s });
  check('before the relay answers: not connected, not gone', !list.connected && !list.gone);
  s.onopen();
  check('the relay answers: connected, not gone', list.connected && !list.gone);
  s.onclose();
  check('the relay goes: gone, the screen told (its version bumped)', !list.connected && list.gone && list.version === 2, `version ${list.version}`);
}
{
  const s = fakeSocket();
  const list = new m.RelayWorldList({ url: URL, socket: () => s });
  s.onerror();
  s.onclose();
  check('a site with no relay (the socket closes without ever opening): gone', !list.connected && list.gone && list.worlds().length === 0);
}
{
  const list = new m.RelayWorldList({ url: URL, socket: () => { throw new Error('no sockets here'); } });
  check('no sockets at all: gone', !list.connected && list.gone);
}
{
  const s = fakeSocket();
  const list = new m.RelayWorldList({ url: URL, socket: () => s });
  s.onopen();
  list.close();
  check('the screen closing its own list: not "gone"', !list.gone);
}

// a phone or a tablet: the notice before the worlds or the servers
{
  const game = { gui: { wrap: (t) => [t], textWidth: (t) => t.length * 6 }, shown: null, setScreen(sc) { this.shown = sc; } };
  const back = { is: 'the title screen' }, next = { is: 'the worlds' };
  const device = (userAgent, maxTouchPoints, hovers) => {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent, maxTouchPoints }, configurable: true });
    globalThis.matchMedia = (q) => ({ matches: q === '(any-hover: hover)' ? hovers : false });
  };
  device('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36', 0, true);
  check('a computer: not a touch-only device, and straight on to the worlds', !m.touchOnly() && m.afterTouchNotice(game, back, () => next) === next);
  device('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36', 10, true);
  check('a laptop with a touch screen (it has a trackpad): straight on too', !m.touchOnly() && m.afterTouchNotice(game, back, () => next) === next);
  device('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5, false);
  check('an iPad calling itself a Mac, nothing on it that hovers: touch-only', m.touchOnly());
  device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 5, false);
  const warning = m.afterTouchNotice(game, back, () => next);
  check('a phone: the notice first, with Proceed and Back, saying how fingers play the game', m.touchOnly() && warning instanceof m.ConfirmScreen && warning.title === 'Touch Controls' && warning.yes === 'Proceed' && warning.no === 'Back' && /The stick walks/.test(warning.message) && /hold a finger on it to break it/.test(warning.message) && warning.message.startsWith(m.GAME_NAME), `${warning?.title}: ${warning?.message}`);
  warning.callback(false);
  check('Back: the title screen again, and the notice again the next time', game.shown === back && m.afterTouchNotice(game, back, () => next) instanceof m.ConfirmScreen);
  warning.callback(true);
  check('Proceed: on to the worlds, and not asked again this visit', game.shown === next && m.afterTouchNotice(game, back, () => next) === next);
}

await exitWithStatus(close);
