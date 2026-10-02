// The touch controls (src/game/touch.ts): a phone's fingers as the keys and the mouse, in Bedrock Edition's two ways.
// Tap to interact: a tap uses what is under the finger, or hits the mob there; a finger held still on a block breaks
// it till it lifts, on a mob uses what's in hand on it, on nothing uses what's in hand while it stays; and what is
// aimed at is what is under that finger, nothing otherwise. Aim crosshair: the world's taps do nothing, and a sword
// and four marks are the attack and use buttons. In both: the stick walks eight ways and sprints past its plate; a drag
// turns the view, from past the slop on; the buttons jump (a tick long at least), sprint and sneak (on and off; held,
// flying); a hotbar slot is tapped, and held to throw its stack out; the dots and the pause bars are tapped; three
// fingers are F3. On a screen a finger is the left button, and a drag the screen doesn't take scrolls it. A phone
// begins with shorter distances than a computer's, and two chunk workers, for its memory.

import { load, check, exitWithStatus } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();

const { m, close } = await load(['/src/game/touch.ts', '/src/game/input.ts', '/src/textures/touchControls.ts', '/src/game/options.ts', '/src/worker/pool.ts']);
const K = m.KEYS;

function setup(width = 640, height = 296, u = 0.75) {
  const input = { down: new Set(), clicks: [], buttons: [false, false, false], mouseDX: 0, mouseDY: 0, touch: false, touchAt: -Infinity, pressed: [], press(c) { this.pressed.push(c); } };
  const host = {
    input, gui: { width, height }, screen: null, inWorld: true, spawned: true,
    mode: 'tap', target: null, fly: false, closes: false, takes: false, progress: 0,
    keys: [], events: [], scrolls: [], aims: [], drops: 0,
    cssPx: () => u,
    safe: { left: 0, right: 0, top: 0, bottom: 0 },
    insets() { return this.safe; },
    touchMode() { return this.mode; },
    targetAt(x, y) { this.aims.push(`${x},${y}`); return this.target; },
    tapKey(c) { this.keys.push(c); },
    screenCloses() { return !!this.screen && this.closes; },
    touchScreen(type, x, y) { this.events.push(`${type} ${x},${y}`); return this.takes; },
    scrollScreen(x, y, d) { this.scrolls.push(d); },
    flying() { return this.fly; },
    dropStack() { this.drops++; },
    breakProgress() { return this.progress; },
  };
  return { input, host, t: new m.TouchControls(host) };
}
const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const keys = (input) => [...input.down].sort().join();
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const near = (a, b) => Math.abs(a - b) < 1e-6;

// where things are
{
  const W = 640, H = 296;
  const L = setup(W, H).t.layout();
  const rects = { stick: L.stick, jump: L.jump, sneak: L.sneak, sprint: L.sprint, attack: L.attack, interact: L.interact, pause: L.pause, more: L.more, hotbar: L.hotbar };
  const names = Object.keys(rects);
  const onScreen = names.every((n) => rects[n].x >= 0 && rects[n].y >= 0 && rects[n].x + rects[n].w <= W && rects[n].y + rects[n].h <= H);
  const clashes = names.flatMap((a, i) => names.slice(i + 1).filter((b) => overlap(rects[a], rects[b])).map((b) => `${a}/${b}`));
  check('a phone on its side: the stick, the buttons and the hotbar all on the screen, none over another', onScreen && clashes.length === 0, clashes.join());
  check('the stick at the left, a third of the screen high; the buttons at the right, down its middle: jump over sneak over the four marks, a button and a half apart',
    L.stick.w === 99 && L.stick.x < W * 0.1 && L.jump.x === L.sneak.x && L.sneak.x === L.interact.x && L.jump.x + L.jump.w > W * 0.94
    && L.sneak.y - L.jump.y === Math.round(L.jump.h * 1.5) && L.interact.y - L.sneak.y === L.sneak.y - L.jump.y && L.jump.y === Math.round(H / 3),
    `stick ${L.stick.w} at ${L.stick.x}; jump at ${L.jump.x},${L.jump.y}, sneak ${L.sneak.y}, marks ${L.interact.y}`);
  check('...sprint and the sword in a column beside them, each between two of those', L.sprint.x === L.attack.x && L.sprint.x + L.sprint.w < L.jump.x && L.sprint.y > L.jump.y && L.sprint.y < L.sneak.y && L.attack.y > L.sneak.y && L.attack.y < L.interact.y);
  check('...the pause bars at the middle of the top, the dots at the hotbar\'s end', Math.abs(L.pause.x + L.pause.w / 2 - W / 2) <= 1 && L.pause.y < 20 && L.more.x === L.hotbar.x + L.hotbar.w && L.more.y === L.hotbar.y);
  check('a button a share of the screen\'s height, and no wider than 60 CSS pixels on a tablet', L.jump.w === 39 && setup(1180, 820, 1).t.layout().jump.w === 60, `${L.jump.w}`);
  const N = setup(W, H);
  N.host.safe = { left: 44, right: 44, top: 6, bottom: 16 };
  const S = N.t.layout();
  check('a phone with a notch: the stick, the buttons and the cross in from the sides by it, the bars down from the top; the hotbar where it was',
    S.stick.x >= 44 + 30 && S.stick.x > L.stick.x && S.jump.x + S.jump.w <= W - 44 - 20 && S.jump.x < L.jump.x && S.sprint.x < L.sprint.x && S.close.x >= 44 && S.pause.y === L.pause.y + 6
    && S.hotbar.x === L.hotbar.x && S.more.x === L.more.x && Math.abs(S.pause.x - L.pause.x) === 0, `stick ${S.stick.x}, jump ends ${S.jump.x + S.jump.w}`);
  const P = setup(393, 852, 1).t.layout();
  check('a phone held upright: all of it still on the screen, clear of the hotbar', P.interact.y + P.interact.h < 852 - 60 && P.jump.x + P.jump.w <= 393 && P.stick.x + P.stick.w < P.sprint.x && P.stick.y + P.stick.h < 852 - 60, `marks end ${P.interact.y + P.interact.h}`);
}

// the sprites there are to draw them with
{
  const T = m.TOUCH_TEXTURES;
  const want = ['jump', 'sneak', 'sprint', 'attack', 'interact', 'ascend', 'descend', 'pause', 'close'].flatMap((n) => [`touch_${n}`, `touch_${n}_lit`]).concat(['touch_stick', 'touch_knob', 'touch_knob_lit', 'touch_ring_0', 'touch_ring_24']);
  const missing = want.filter((n) => !T[n]);
  const alpha = (t, x, y) => t.data[(y * t.w + x) * 4 + 3];
  const rgb = (t, x, y) => [0, 1, 2].map((i) => t.data[(y * t.w + x) * 4 + i]).join();
  const jump = T.touch_jump?.(), lit = T.touch_jump_lit?.();
  check('a sprite for every button, plain and lit, for the stick, and for the ring', missing.length === 0, missing.join());
  check('a button: 22 pixels a side, its corners off, black-edged', jump.w === 22 && jump.h === 22 && alpha(jump, 0, 0) === 0 && alpha(jump, 21, 21) === 0 && alpha(jump, 11, 11) === 255 && rgb(jump, 2, 0) === '0,0,0' && rgb(jump, 0, 2) === '0,0,0');
  const inked = (t, c) => { let n = 0; for (let y = 2; y < 17; y++) for (let x = 2; x < 20; x++) if (rgb(t, x, y) === c) n++; return n; };
  check('...its picture in black; lit, in white on a paler cap', inked(jump, '0,0,0') > 20 && inked(lit, '255,255,255') === inked(jump, '0,0,0') && inked(lit, '0,0,0') === 0, `${inked(jump, '0,0,0')} black, ${inked(lit, '255,255,255')} white`);
  const count = (t, c) => { let n = 0; for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (alpha(t, x, y) && rgb(t, x, y) === c) n++; return n; };
  check('the ring: 24 marks, none lit, then all', count(T.touch_ring_0(), '255,255,255') === 0 && count(T.touch_ring_24(), '255,255,255') === count(T.touch_ring_0(), '32,32,32') && count(T.touch_ring_12(), '255,255,255') > 0);
}

// the stick
{
  const { t, input } = setup();
  const L = t.layout(), r = L.stick.w / 2, [x, y] = mid(L.stick);
  t.start(1, x, y, 0);
  check('the first finger: the fingers play (the world goes on without the pointer\'s lock)', input.touch === true && input.touchAt === 0);
  check('a thumb down on the stick\'s middle: nothing yet', keys(input) === '');
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
  t.move(1, x, y - r * 1.3, 60);
  check('pushed up past the plate: forward, sprinting', keys(input) === [K.forward, K.sprint].sort().join(), keys(input));
  t.move(1, x + r * 1.3, y, 70);
  check('...sideways past it: no sprint', keys(input) === K.right, keys(input));
  t.end(1, x, y, 80);
  check('let go: every key up', keys(input) === '' && input.clicks.length === 0, keys(input));
  t.start(2, L.stick.x + L.stick.w / 2, L.stick.y - L.stick.w, 100);
  t.move(2, L.stick.x + L.stick.w / 2, L.stick.y - L.stick.w - 40, 110);
  check('a finger down well off the plate, on the left: not the stick\'s', keys(input) === '');
  t.end(2, 0, 0, 120);
}

// tap to interact: looking, tapping, holding
{
  const { t, input, host } = setup();
  t.start(1, 300, 120, 0);
  t.move(1, 310, 120, 10);
  check('a finger dragged: nothing till it is past the slop', input.mouseDX === 0 && input.mouseDY === 0);
  t.move(1, 340, 135, 20);
  check('...then the view turns with it: 3 of the mouse\'s counts to a CSS pixel', near(input.mouseDX, 120) && near(input.mouseDY, 60), `${input.mouseDX}, ${input.mouseDY}`);
  t.frame(1000);
  check('...aiming at nothing: a drag is no tap and no hold', t.aim() === null && input.clicks.length === 0 && !input.buttons[0] && host.aims.length === 0);
  t.end(1, 340, 135, 1010);
  check('...lifted: still nothing', input.clicks.length === 0 && t.aim() === null);

  host.target = 'block';
  t.start(2, 300, 120, 2000);
  t.frame(2100);
  t.end(2, 301, 120, 2150);
  check('a tap on a block: the use button, once, aimed where the finger was', input.clicks.join() === '2' && !input.buttons[2] && !input.buttons[0] && host.aims.join() === '301,120' && String(t.aim()) === '301,120', `${input.clicks.join()}; ${host.aims.join()}; ${t.aim()}`);
  t.frame(2160);
  check('...aimed there till a tick has acted on it', String(t.aim()) === '301,120');
  t.ticked();
  check('...and at nothing after', t.aim() === null);
  input.clicks.length = 0;
  host.target = 'entity';
  t.start(3, 300, 120, 3000);
  t.end(3, 300, 120, 3100);
  check('a tap on a mob: the attack button', input.clicks.join() === '0', input.clicks.join());
  t.ticked();
  input.clicks.length = 0;
  host.target = null;
  t.start(3, 300, 120, 3200);
  t.end(3, 300, 120, 3300);
  check('a tap on nothing: the use button (what\'s in hand, thrown)', input.clicks.join() === '2', input.clicks.join());
  t.ticked();
  input.clicks.length = 0;

  host.target = 'block';
  host.aims.length = 0;
  t.start(4, 300, 120, 4000);
  t.frame(4000 + m.HOLD_MS - 1);
  check('a finger held still: not yet', input.clicks.length === 0 && !input.buttons[0] && host.aims.length === 0);
  t.frame(4000 + m.HOLD_MS);
  check('...on a block: the attack button, pressed and held, aimed under the finger', input.clicks.join() === '0' && input.buttons[0] === true && host.aims.join() === '300,120' && String(t.aim()) === '300,120');
  t.ticked();
  t.frame(4600);
  t.move(4, 330, 120, 4650);
  t.move(4, 360, 130, 4700);
  check('...held while the finger moves on, the view turning and the aim going with it', input.clicks.join() === '0' && input.buttons[0] === true && input.mouseDX > 120 && String(t.aim()) === '360,130', `${t.aim()}`);
  t.end(4, 360, 130, 5000);
  check('lifted: let go, no tap, aimed at nothing', input.clicks.join() === '0' && input.buttons[0] === false && t.aim() === null);
  input.clicks.length = 0;

  host.target = 'entity';
  t.start(5, 300, 120, 6000);
  t.frame(6000 + m.HOLD_MS);
  check('held on a mob: the use button once (what\'s in hand, used on it), aimed at it', input.clicks.join() === '2' && !input.buttons[2] && !input.buttons[0] && String(t.aim()) === '300,120');
  t.ticked();
  t.frame(6600);
  t.end(5, 300, 120, 7000);
  check('...and nothing more while it stays or when it lifts', input.clicks.join() === '2' && !input.buttons[2] && t.aim() === null);
  input.clicks.length = 0;

  host.target = null;
  t.start(6, 300, 120, 8000);
  t.frame(8000 + m.HOLD_MS);
  check('held on nothing: the use button pressed and held (eating, a bow drawn)', input.clicks.join() === '2' && input.buttons[2] === true && t.aim() === null);
  t.end(6, 300, 120, 9000);
  check('...till the finger lifts', input.buttons[2] === false && input.clicks.join() === '2');
}

// aim crosshair
{
  const { t, input, host } = setup();
  host.mode = 'crosshair';
  host.target = 'block';
  const L = t.layout();
  t.start(1, 300, 120, 0);
  t.end(1, 300, 120, 100);
  t.start(1, 300, 120, 200);
  t.frame(200 + m.HOLD_MS + 100);
  t.end(1, 300, 120, 900);
  check('with the crosshair: a tap and a hold on the world do nothing, and aim at nothing', input.clicks.length === 0 && !input.buttons[0] && !input.buttons[2] && host.aims.length === 0 && t.aim() === null);
  t.start(2, ...mid(L.attack), 1000);
  check('the sword: the attack button pressed and held', input.clicks.join() === '0' && input.buttons[0] === true);
  t.move(2, L.attack.x - 10, L.attack.y, 1100);
  t.move(2, L.attack.x - 40, L.attack.y, 1200);
  check('...the view turning under the same thumb', input.mouseDX < 0 && input.buttons[0] === true);
  t.end(2, L.attack.x - 40, L.attack.y, 2000);
  check('...let go', input.buttons[0] === false && input.clicks.join() === '0');
  input.clicks.length = 0;
  t.start(3, ...mid(L.interact), 3000);
  check('the four marks: the use button pressed and held', input.clicks.join() === '2' && input.buttons[2] === true);
  t.end(3, ...mid(L.interact), 4000);
  check('...let go', input.buttons[2] === false && input.clicks.join() === '2');
  input.clicks.length = 0;
  host.mode = 'tap';
  t.start(4, ...mid(L.attack), 5000);
  t.end(4, ...mid(L.attack), 5050);
  check('tapping to interact, there is no sword: where it would be is the world', input.clicks.join() === '2' && !input.buttons[0], input.clicks.join());
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

  t.start(2, ...mid(L.sprint), 500);
  check('the sprint button: the sprint key, while it is held', keys(input) === K.sprint);
  t.end(2, ...mid(L.sprint), 900);
  check('...and up after', keys(input) === '');

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
  t.start(3, ...mid(L.sneak), 2500);
  t.end(3, ...mid(L.sneak), 2550);
  host.fly = true;
  t.frame(2600);
  check('...and off in the air', !t.sneaking && keys(input) === '');
  t.start(3, ...mid(L.sneak), 2700);
  check('flying, it is held to go down', !t.sneaking && keys(input) === K.sneak);
  t.end(3, ...mid(L.sneak), 3000);
  check('...and let go to stop', !t.sneaking && keys(input) === '');
  host.fly = false;

  t.start(4, L.hotbar.x + 1 + 20 * 2 + 10, L.hotbar.y + 11, 3000);
  t.end(4, L.hotbar.x + 51, L.hotbar.y + 11, 3050);
  t.start(4, L.hotbar.x + 181, L.hotbar.y + 2, 3100);
  t.frame(3100 + m.DROP_MS - 1);
  t.end(4, L.hotbar.x + 181, L.hotbar.y + 2, 3100 + m.DROP_MS - 1);
  check('the hotbar: its third slot and its last, as their keys, and nothing thrown out', input.pressed.join() === [K.hotbar3, K.hotbar9].join() && input.clicks.length === 0 && host.drops === 0, input.pressed.join());
  t.start(4, L.hotbar.x + 11, L.hotbar.y + 11, 6000);
  t.frame(6000 + m.DROP_MS);
  t.frame(6000 + m.DROP_MS + 500);
  t.end(4, L.hotbar.x + 11, L.hotbar.y + 11, 6000 + m.DROP_MS + 600);
  check('a finger held on a slot: its stack thrown out, once', host.drops === 1 && input.pressed.at(-1) === K.hotbar1);
  t.start(5, ...mid(L.more), 9200);
  t.end(5, ...mid(L.more), 9250);
  t.start(5, ...mid(L.pause), 9300);
  t.end(5, ...mid(L.pause), 9350);
  check('the dots: the inventory key; the bars: Escape', host.keys.join() === [K.inventory, 'Escape'].join() && input.clicks.length === 0, host.keys.join());

  input.pressed.length = 0;
  host.target = 'block';
  t.start(6, 250, 100, 10000);
  t.start(7, 300, 100, 10010);
  t.start(8, 350, 100, 10020);
  t.frame(10020 + m.HOLD_MS + 50);
  t.end(6, 250, 100, 10400);
  t.end(7, 300, 100, 10400);
  t.end(8, 350, 100, 10400);
  check('three fingers: F3, and none of them taps or holds', input.pressed.join() === K.debug && input.clicks.length === 0 && !input.buttons[0], `${input.pressed.join()}; ${input.clicks.join()}`);
}

// a finger whose lifting was never heard
{
  const { t, input, host } = setup();
  const L = t.layout(), [x, y] = mid(L.stick);
  host.target = 'block';
  t.start(1, x, y, 0);
  t.move(1, x, y - L.stick.w / 2, 10);
  t.start(2, 300, 120, 20);
  t.frame(20 + m.HOLD_MS);
  check('two fingers down: walking, and breaking', keys(input) === K.forward && input.buttons[0] === true);
  t.only(new Set([3]), 1000);
  check('the browser says neither is on the glass: both let go of, nothing tapped', keys(input) === '' && input.buttons[0] === false && input.clicks.join() === '0' && t.aim() === null, `${keys(input)}; ${input.clicks.join()}`);
  t.start(3, 300, 120, 1010);
  t.end(3, 300, 120, 1050);
  check('...and the next finger is a first finger, not a third', input.clicks.join() === '0,2' && input.pressed.length === 0, `${input.clicks.join()}; ${input.pressed.join()}`);
}

// two thumbs at once
{
  const { t, input } = setup();
  const L = t.layout(), [x, y] = mid(L.stick);
  t.start(1, x, y, 0);
  t.move(1, x, y - L.stick.w / 2, 10);
  t.start(2, 350, 100, 20);
  t.move(2, 370, 100, 30);
  t.move(2, 400, 100, 40);
  check('walking with one thumb and looking with the other', keys(input) === K.forward && input.mouseDX > 0 && input.clicks.length === 0);
  t.end(2, 400, 100, 50);
  check('...the stick still held when the other lifts', keys(input) === K.forward);
  t.end(1, x, y - L.stick.w / 2, 60);
}

// on a screen
{
  const { t, input, host } = setup();
  host.screen = {};
  host.target = 'block';
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
  t.start(4, 300, 120, 200);
  t.frame(200 + m.HOLD_MS + 50);
  t.end(4, 300, 120, 600);
  check('a finger held on a screen breaks nothing', input.clicks.length === 0 && !input.buttons[0] && host.aims.length === 0);
  const L = t.layout(), n = host.events.length;
  t.start(5, L.close.x + 5, L.close.y + 5, 700);
  t.end(5, L.close.x + 5, L.close.y + 5, 750);
  check('a screen Escape wouldn\'t close (the death screen): its corner is the screen\'s own', host.keys.length === 0 && host.events.length === n + 2, host.keys.join());
  host.closes = true;
  t.start(6, L.close.x + 5, L.close.y + 5, 800);
  t.end(6, L.close.x + 5, L.close.y + 5, 850);
  check('one it would (the inventory): the cross in the corner is that Escape, and no click on the screen', host.keys.join() === 'Escape' && host.events.length === n + 2, host.keys.join());
}

// aiming through a place on the screen
{
  const A = (...a) => m.aimAngles(...a).map((v) => Math.round(v * 1000) / 1000 + 0).join();
  check('through the middle: where the player looks', A(30, 20, 70, 2, 0, 0) === '30,20' && A(-120, -45, 90, 1.5, 0, 0) === '-120,-45', `${A(30, 20, 70, 2, 0, 0)}; ${A(-120, -45, 90, 1.5, 0, 0)}`);
  check('through the right edge of a square view 90 degrees high: 45 to the right (looking south, that is west)', A(0, 0, 90, 1, 1, 0) === '45,0' && A(90, 0, 90, 1, 1, 0) === '135,0', `${A(0, 0, 90, 1, 1, 0)}; ${A(90, 0, 90, 1, 1, 0)}`);
  check('...the left edge: 45 to the left; a view twice as wide: further', A(0, 0, 90, 1, -1, 0) === '-45,0' && Math.abs(m.aimAngles(0, 0, 90, 2, 1, 0)[0] - 63.435) < 0.001, `${A(0, 0, 90, 1, -1, 0)}; ${A(0, 0, 90, 2, 1, 0)}`);
  check('through the top edge: 45 up; the bottom: 45 down', A(0, 0, 90, 1, 0, 1) === '0,-45' && A(0, 0, 90, 1, 0, -1) === '0,45', `${A(0, 0, 90, 1, 0, 1)}; ${A(0, 0, 90, 1, 0, -1)}`);
  const [yaw, pitch] = m.aimAngles(0, 60, 90, 1, 0, 1);
  check('looking down, the top of the screen is further ahead: less far down', Math.abs(yaw) < 1e-9 && Math.abs(pitch - 15) < 1e-6, `${yaw}, ${pitch}`);
}

// a phone's own distances, and its workers (options.ts loadOptions, worker/pool.ts workerCount)
{
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), ls = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const PHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5, hardwareConcurrency: 6 };
  const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0, hardwareConcurrency: 8 };
  const on = (device, saved) => {
    Object.defineProperty(globalThis, 'navigator', { value: device, configurable: true, writable: true });
    const store = saved ? { 'mc.options': JSON.stringify(saved) } : {};
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, configurable: true, writable: true });
    return m.loadOptions();
  };
  const d = (o) => `${o.renderDistance}/${o.simulationDistance}`;
  let o = on(MAC, null);
  check('a computer begins at 12 chunks each way, drawn and ticked, with Auto-Jump off', d(o) === '12/12' && !o.autoJump && !o.touchDefaults, `${d(o)} ${o.autoJump}`);
  check('...with two workers fewer than its cores (6 of 8)', m.workerCount() === 6, m.workerCount());
  o = on(PHONE, null);
  check('a phone begins at 8 each way, with Auto-Jump on', m.TOUCH_DISTANCE === 8 && d(o) === '8/8' && o.autoJump && o.touchDefaults === 1, `${d(o)} ${o.autoJump} ${o.touchDefaults}`);
  check('...with two workers, whatever its cores', m.workerCount() === 2, m.workerCount());
  o = on(PHONE, { renderDistance: 12, simulationDistance: 12, touchMode: 'tap' });
  check('options a phone saved before it had distances of its own: brought down to them', d(o) === '8/8' && o.touchDefaults === 1, d(o));
  o = on(PHONE, { renderDistance: 4, simulationDistance: 5 });
  check('...but never up', d(o) === '4/5', d(o));
  o = on(PHONE, { renderDistance: 16, simulationDistance: 10, touchDefaults: 1 });
  check('distances chosen on a phone since then are kept', d(o) === '16/10', d(o));
  o = on(MAC, { renderDistance: 20, simulationDistance: 12 });
  check("a computer's are its own", d(o) === '20/12' && !o.touchDefaults, d(o));
  if (nav) Object.defineProperty(globalThis, 'navigator', nav);
  if (ls) Object.defineProperty(globalThis, 'localStorage', ls);
  else delete globalThis.localStorage;
}

await exitWithStatus(close);
