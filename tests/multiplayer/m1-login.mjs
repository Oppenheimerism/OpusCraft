// Multiplayer M1: a guest's login (vanilla ServerLoginPacketListenerImpl and PlayerList.placeNewPlayer): let in, with the
// world as the host has it (its time, weather, rules and chunks round the spawn) and a player in the host's level; or
// turned away with a reason, for another game's protocol or build, a name that isn't one or is taken, a full world, a
// uuid already here, anything but a hello first, or no hello at all.

import { loadNet, flatHost, makeGuest, rawGuest, hostCopy, step, assertMirrorEquals, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet();

// ---------------------------------------------------------------------------
// let in
{
  const host = flatHost(m, 5, { spawn: [8.5, 64, -3.5] });
  host.level.dayTime = 6000;
  host.level.gameTime = 123456;
  host.level.raining = true;
  host.level.rain = 1;
  host.level.gameRules.doDaylightCycle = false;
  host.level.doDaylightCycle = false;
  const g = makeGuest(host, 'Alex', { viewDistance: 3 });
  // (a tick for the connection and the hello to reach the host; the next for the login to reach the guest)
  step(host, 2);
  check('login: the guest is in, two ticks after connecting', g.session.state === 'play' && g.level !== null);
  const hp = hostCopy(host, g);
  check('login: the host has a player for it, a remote one, where the spawn is', hp && hp.remote && hp.x === 8.5 && hp.y === 64 && hp.z === -3.5, hp && `${hp.x},${hp.y},${hp.z}`);
  check('login: its player plays in creative on both sides', hp?.gameMode === 'creative' && g.player.gameMode === 'creative');
  check('login: the guest knows its player by the host\'s id', g.session.playerId === hp?.id);
  check('login: the guest\'s player is where the host put it', g.player.x === 8.5 && g.player.y === 64 && g.player.z === -3.5);
  check('login: the guest\'s level is a copy (client side)', g.level.isClientSide === true && host.level.isClientSide === false);
  check('login: the time is the host\'s', g.level.dayTime === host.level.dayTime && Math.abs(g.level.gameTime - host.level.gameTime) <= 1, `${g.level.dayTime}/${host.level.dayTime} ${g.level.gameTime}/${host.level.gameTime}`);
  check('login: so are the game rules', JSON.stringify(g.session.info.gameRules) === JSON.stringify(host.level.gameRules) && g.session.info.gameRules.doDaylightCycle === false);
  check('login: so is the weather', g.level.raining === true && g.level.rain === 1);
  check('login: the host\'s chat says who joined', host.chat.includes('§eAlex joined the game'));
  check('login: and so does the guest\'s', g.chat.includes('§eAlex joined the game'));
  check('login: the host\'s name, as the guest has it', g.session.info.hostName === 'Host' && g.session.info.worldName === 'Test World');
  check('login: a ticket keeps the guest\'s chunks loaded on the host', [...host.tickets.keys()].includes(`player:${hp.id}`));
  step(host, 20);
  const n = g.world.chunks.size;
  check('login: the chunks round the guest came (a circle of view distance 3: 37)', n === 37, `${n}`);
  assertMirrorEquals(host, g, 'login');
  // a second guest: both see each other and the host
  const g2 = makeGuest(host, 'Steve');
  step(host, 20);
  check('login: a second guest is in', g2.session.state === 'play' && host.server.guestCount() === 2);
  check('login: the first guest hears of it', g.chat.includes('§eSteve joined the game'));
  assertMirrorEquals(host, g2, 'login, a second guest');
}

// ---------------------------------------------------------------------------
// turned away
{
  const host = flatHost(m, 3);
  /** a bare connection that says hello as `name` (after a tick for the connection), and two ticks for the answer */
  const tryHello = (name, opts) => {
    const r = rawGuest(host);
    step(host, 1);
    r.hello(name, opts);
    step(host, 2);
    return r;
  };
  const turnedAway = (label, r, want) => {
    const reason = r.reason();
    check(`refused: ${label}`, reason !== null && (want instanceof RegExp ? want.test(reason) : reason === want) && r.gone, String(reason));
  };

  let r = tryHello('Old', { protocol: m.PROTOCOL_VERSION - 1 });
  turnedAway('an older protocol', r, /^Outdated game!/);
  r = tryHello('New', { protocol: m.PROTOCOL_VERSION + 1 });
  turnedAway('a newer protocol', r, /^Outdated host!/);
  r = tryHello('Other', { build: 'not-this-one' });
  turnedAway('another build', r, /different version of the game/);

  for (const name of ['ab', 'Seventeen_letters', 'has space', 'dash-y', '§cRed', 'ünïcode', '']) {
    r = tryHello(name);
    turnedAway(`the name "${name}"`, r, /^That name can only have letters, digits and _/);
  }

  r = tryHello('HOST');
  turnedAway('the host\'s name (any case)', r, 'Someone called HOST is already playing here.');

  const g = makeGuest(host, 'Alex');
  step(host, 2);
  r = tryHello('alex');
  turnedAway('a guest\'s name (any case)', r, 'Someone called alex is already playing here.');
  r = tryHello('Other', { uuid: g.session.me.uuid });
  // (stage 4: a guest's uuid must be its name's, so another's is turned away as that, before it's looked for here)
  turnedAway('a uuid already in the world', r, /^Bad data: that uuid isn't the name's$/);

  r = rawGuest(host);
  step(host, 1);
  r.send([[m.SB.Chat, 'hi']]);
  step(host, 2);
  turnedAway('anything but hello first', r, 'Say hello first');

  r = tryHello('Twice');
  check('refused: (a raw guest said hello)', r.packets(m.CB.Login).length === 1);
  r.hello('Twice');
  step(host, 2);
  turnedAway('a second hello', r, 'Already here');
  check('refused: "left the game" for one that was in', host.chat.includes('§eTwice left the game'));

  r = rawGuest(host);
  step(host, m.LOGIN_TICKS + 2);
  turnedAway('no hello within the login time', r, 'Took too long to log in');

  // a full world: the host and MAX_GUESTS guests
  const guests = [];
  for (let i = host.server.guestCount(); i < m.MAX_GUESTS; i++) guests.push(makeGuest(host, `Guest${i}`, { viewDistance: 2 }));
  step(host, 2);
  check('full: (the world is full)', host.server.guestCount() === m.MAX_GUESTS, `${host.server.guestCount()}`);
  r = tryHello('OneTooMany');
  turnedAway('a full world', r, 'The world is full.');

  // connections that never say who they are: only so many are kept waiting
  const waiting = [];
  for (let i = 0; i < m.MAX_PENDING_LOGINS + 3; i++) waiting.push(rawGuest(host));
  step(host, 1);
  const dropped = waiting.filter((w) => w.gone).length;
  check(`waiting: at most ${m.MAX_PENDING_LOGINS} connections wait to log in; the rest are turned away at once`, dropped === 3, `${dropped} dropped`);
  check('waiting: the players already in stay in', host.server.guestCount() === m.MAX_GUESTS && g.session.state === 'play');
  assertMirrorEquals(host, g, 'after the refusals');
}

await exitWithStatus(close);
