// The touch controls (src/game/touch.ts): a phone's fingers as the keys and the mouse. The left thumb's stick walks
// eight ways and sprints past its ring; a drag turns the view, from past the slop on; a tap uses, or hits the mob under
// the crosshair; a finger held still breaks till it lifts; the buttons jump (a tick long at least), sneak (on, off) and
// use (while held); a hotbar slot, the three dots and the pause bars are tapped; three fingers are F3. On a screen a
// finger is the left button, and a drag the screen doesn't take scrolls it.

import { load, check, exitWithStatus } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();

const { m, close } = await load(['/src/game/touch.ts', '/src/game/input.ts']);
const K = m.KEYS;

function setup(width = 640, height = 296, u = 0.75) {
  const input = { down: new Set(), clicks: [], buttons: [false, false, false], mouseDX: 0, mouseDY: 0, touch: false, touchAt: -Infinity, pressed: [], press(c) { this.pressed.push(c); } };
  const host = {
    input, gui: { width, height }, screen: null, inWorld: true, spawned: true, entity: false, takes: false, keys: [], events: [], scrolls: [],
    cssPx: () => u,
    crosshairEntity() { return this.entity; },
    tapKey(c) { this.keys.push(c); },
    screenCloses() { return !!this.screen && this.closes; },
    touchScreen(type, x, y) { this.events.push(`${type} ${x},${y}`); return this.takes; },
    scrollScreen(x, y, d) { this.scrolls.push(d); },
  };
  return { input, host, t: new m.TouchControls(host) };
}
const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const keys = (input) => [...input.down].sort().join();
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// where things are
{
  const { t } = setup();
  const L = t.layout();
  const rects = { jump: L.jump, sneak: L.sneak, use: L.use, pause: L.pause, more: L.more, hotbar: L.hotbar, stick: { x: L.stick.x - L.stick.r, y: L.stick.y - L.stick.r, w: 2 * L.stick.r, h: 2 * L.stick.r } };
  const names = Object.keys(rects);
  const onScreen = names.every((n) => rects[n].x >= 0 && rects[n].y >= 0 && rects[n].x + rects[n].w <= 640 && rects[n].y + rects[n].h <= 296);
  const clashes = names.flatMap((a, i) => names.slice(i + 1).filter((b) => overlap(rects[a], rects[b])).map((b) => `${a}/${b}`));
  check('a phone on its side: the stick, the buttons and the hotbar all on the screen, none over another', onScreen && clashes.length === 0, clashes.join());
  check('...a button as big as a thumb: 56 CSS pixels, whatever the GUI\'s scale', L.jump.w === 42 && setup(640, 296, 0.5).t.layout().jump.w === 28, `${L.jump.w}`);
  const P = setup(393, 852, 1).t.layout();
  check('a phone held upright: the stick and the buttons above the hotbar and the hearts', P.jump.y + P.jump.h <= 852 - 54 && P.stick.y + P.stick.r <= 852 - 54 && P.jump.x + P.jump.w <= 393, `jump ends ${P.jump.y + P.jump.h}`);
}

// the stick
{
  const { t, input } = setup();
  const L = t.layout(), r = L.stick.r, [x, y] = [L.stick.x, L.stick.y];
  t.start(1, x, y, 0);
  check('the first finger: the fingers play (the world goes on without the pointer\'s lock)', input.touch === true && input.touchAt === 0);
  check('a thumb down on the left: nothing yet (inside the dead middle)', keys(input) === '');
  t.move(1, x, y - r * 0.6, 10);
  check('pushed up: forward', keys(input) === K.forward, keys(input));
  t.move(1, x + r * 0.5, y - r * 0.5, 20);
  check('up and right: forward and right', keys(input) === [K.forward, K.right].sort().join(), keys(input));
  t.move(1, x + r * 0.7, y, 30);
  check('right: right alone', keys(input) === K.right, keys(input));
  t.move(1, x, y + r * 0.7, 40);
  check('down: back', keys(input) === K.back, keys(input));
  t.move(1, x - r * 0.5, y + r * 0.5, 50);
  check('down and left: back and left', keys(input) === [K.back, K.left].sort().join(), keys(input));
  t.move(1, x, y - r * 1.4, 60);
  check('pushed up past the ring: forward, sprinting', keys(input) === [K.forward, K.sprint].sort().join(), keys(input));
  t.move(1, x + r * 1.4, y, 70);
  check('...sideways past the ring: no sprint', keys(input) === K.right, keys(input));
  t.end(1, x, y, 80);
  check('let go: every key up', keys(input) === '' && input.clicks.length === 0, keys(input));
}

// looking, tapping, holding
{
  const { t, input, host } = setup();
  t.start(1, 400, 120, 0);
  t.move(1, 410, 120, 10);
  check('a finger dragged on the right: nothing till it is past the slop', input.mouseDX === 0 && input.mouseDY === 0);
  t.move(1, 440, 135, 20);
  check('...then the view turns with it: 3 of the mouse\'s counts to a CSS pixel', Math.abs(input.mouseDX - 120) < 1e-9 && Math.abs(input.mouseDY - 60) < 1e-9, `${input.mouseDX}, ${input.mouseDY}`);
  t.frame(1000);
  t.end(1, 440, 135, 1010);
  check('a drag is no tap and no hold', input.clicks.length === 0 && !input.buttons[0]);

  t.start(2, 400, 120, 2000);
  t.frame(2100);
  t.end(2, 401, 120, 2150);
  check('a tap: the use button, once', input.clicks.join() === '2' && !input.buttons[2] && !input.buttons[0], input.clicks.join());
  input.clicks.length = 0;
  host.entity = true;
  t.start(3, 400, 120, 3000);
  t.end(3, 400, 120, 3100);
  check('a tap with a mob under the crosshair: the attack button', input.clicks.join() === '0', input.clicks.join());
  input.clicks.length = 0;
  host.entity = false;

  t.start(4, 400, 120, 4000);
  t.frame(4000 + m.HOLD_MS - 1);
  check('a finger held still: not yet', input.clicks.length === 0 && !input.buttons[0]);
  t.frame(4000 + m.HOLD_MS);
  check('...then the attack button, pressed and held', input.clicks.join() === '0' && input.buttons[0] === true);
  t.frame(4600);
  t.move(4, 430, 120, 4650);
  t.move(4, 460, 120, 4700);
  check('...held while the finger moves on (the view turning with it)', input.clicks.join() === '0' && input.buttons[0] === true && input.mouseDX > 120);
  t.end(4, 460, 120, 5000);
  check('lifted: let go, and no tap', input.clicks.join() === '0' && input.buttons[0] === false);
}

// the buttons
{
  const { t, input, host } = setup();
  const L = t.layout();
  t.start(1, ...mid(L.jump), 0);
  check('the jump button: the jump key down', keys(input) === K.jump);
  t.end(1, ...mid(L.jump), 20);
  check('...let go at once: still down, till a tick has seen it', keys(input) === K.jump);
  t.frame(60);
  t.frame(80);
  check('...and up after', keys(input) === '');
  t.start(1, ...mid(L.jump), 100);
  t.frame(300);
  check('held: down while it is held', keys(input) === K.jump);
  t.end(1, ...mid(L.jump), 400);
  check('...and up when it is let go', keys(input) === '');

  t.start(2, ...mid(L.use), 500);
  check('the use button: the use button pressed and held', input.clicks.join() === '2' && input.buttons[2] === true);
  t.frame(1500);
  t.end(2, ...mid(L.use), 1600);
  check('...let go: released, nothing else pressed', input.clicks.join() === '2' && input.buttons[2] === false && !input.buttons[0]);
  input.clicks.length = 0;

  t.start(3, ...mid(L.sneak), 2000);
  t.end(3, ...mid(L.sneak), 2050);
  check('the sneak button: tapped on', t.sneaking && keys(input) === K.sneak);
  t.frame(2100);
  t.start(3, ...mid(L.sneak), 2200);
  t.end(3, ...mid(L.sneak), 2250);
  check('...and tapped off', !t.sneaking && keys(input) === '');
  t.start(3, ...mid(L.sneak), 2300);
  t.end(3, ...mid(L.sneak), 2350);
  host.inWorld = false;
  t.frame(2400);
  check('...and off out of the world', !t.sneaking && keys(input) === '');
  host.inWorld = true;

  t.start(4, L.hotbar.x + 1 + 20 * 2 + 10, L.hotbar.y + 11, 3000);
  t.end(4, L.hotbar.x + 51, L.hotbar.y + 11, 3050);
  t.start(4, L.hotbar.x + 181, L.hotbar.y + 2, 3100);
  t.end(4, L.hotbar.x + 181, L.hotbar.y + 2, 3150);
  check('the hotbar: its third slot and its last, as their keys', input.pressed.join() === [K.hotbar3, K.hotbar9].join() && input.clicks.length === 0, input.pressed.join());
  t.start(5, ...mid(L.more), 3200);
  t.end(5, ...mid(L.more), 3250);
  t.start(5, ...mid(L.pause), 3300);
  t.end(5, ...mid(L.pause), 3350);
  check('the three dots: the inventory key; the bars: Escape', host.keys.join() === [K.inventory, 'Escape'].join() && input.clicks.length === 0, host.keys.join());

  input.pressed.length = 0;
  t.start(6, 300, 100, 4000);
  t.start(7, 350, 100, 4010);
  t.start(8, 400, 100, 4020);
  t.end(6, 300, 100, 4100);
  t.end(7, 350, 100, 4100);
  t.end(8, 400, 100, 4100);
  check('three fingers: F3, and none of them taps', input.pressed.join() === K.debug && input.clicks.length === 0, `${input.pressed.join()}; ${input.clicks.join()}`);
}

// two thumbs at once
{
  const { t, input } = setup();
  const L = t.layout();
  t.start(1, L.stick.x, L.stick.y, 0);
  t.move(1, L.stick.x, L.stick.y - L.stick.r, 10);
  t.start(2, 450, 100, 20);
  t.move(2, 470, 100, 30);
  t.move(2, 500, 100, 40);
  check('walking with one thumb and looking with the other', keys(input) === K.forward && input.mouseDX > 0 && input.clicks.length === 0);
  t.end(2, 500, 100, 50);
  check('...the stick still held when the other lifts', keys(input) === K.forward);
  t.end(1, L.stick.x, L.stick.y - L.stick.r, 60);
}

// on a screen
{
  const { t, input, host } = setup();
  host.screen = {};
  t.start(1, 100, 50, 0);
  t.start(2, 300, 50, 5);
  t.end(2, 300, 50, 8);
  check('on a screen: a finger is the mouse\'s left button; a second beside it is nothing', host.events.join('; ') === 'down 100,50', host.events.join('; '));
  t.move(1, 100, 90, 10);
  check('a drag the screen doesn\'t take scrolls it, as the wheel would (dragged down: the wheel up)', host.scrolls.length > 0 && host.scrolls.every((d) => d > 0), host.scrolls.join());
  const before = host.scrolls.length;
  t.move(1, 100, 20, 20);
  check('...and dragged up: the wheel down', host.scrolls.length > before && host.scrolls.slice(before).every((d) => d < 0), host.scrolls.join());
  t.end(1, 100, 20, 30);
  check('lifted: the button released there', host.events.at(-1) === 'up 100,20' && input.clicks.length === 0 && keys(input) === '', host.events.at(-1));
  host.scrolls.length = 0;
  host.takes = true;
  t.start(3, 100, 50, 100);
  t.move(3, 100, 120, 110);
  t.end(3, 100, 120, 120);
  check('a drag the screen takes (a slider): no scrolling', host.scrolls.length === 0);
  host.takes = false;
  t.start(4, 400, 120, 200);
  t.frame(200 + m.HOLD_MS + 50);
  t.end(4, 400, 120, 600);
  check('a finger held on a screen breaks nothing', input.clicks.length === 0 && !input.buttons[0]);
  const L = t.layout(), n = host.events.length;
  t.start(5, L.close.x + 5, L.close.y + 5, 700);
  t.end(5, L.close.x + 5, L.close.y + 5, 750);
  check('a screen Escape wouldn\'t close (the death screen): its corner is the screen\'s own', host.keys.length === 0 && host.events.length === n + 2, host.keys.join());
  host.closes = true;
  t.start(6, L.close.x + 5, L.close.y + 5, 800);
  t.end(6, L.close.x + 5, L.close.y + 5, 850);
  check('one it would (the inventory): the cross in the corner is that Escape, and no click on the screen', host.keys.join() === 'Escape' && host.events.length === n + 2, host.keys.join());
}

await exitWithStatus(close);
