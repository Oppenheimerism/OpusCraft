// Multiplayer M1: the world round the players, as the host has it, and chat. The time (vanilla ClientboundSetTimePacket:
// every second, and at once when a command changes it), the rain and thunder (vanilla ClientboundGameEventPacket's
// rain and thunder levels, as they change); what anyone says, everyone reads (vanilla handleChat and
// PlayerList.broadcastSystemMessage); a guest's commands are the host's to refuse; and what isn't plain text, or too much
// of it too fast (vanilla detectRateSpam), has the guest disconnected.

import { loadNet, flatHost, makeGuest, rawGuest, step, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet();

/** the packets of kind `id` that `g` is sent from now on, counted */
function counting(g, id) {
  const n = { count: 0 };
  const handle = g.session.handle.bind(g.session);
  g.session.handle = (p) => {
    if (p[0] === id) n.count++;
    return handle(p);
  };
  return n;
}

// ---------------------------------------------------------------------------
// the time
{
  const host = flatHost(m, 3);
  host.level.dayTime = 1000;
  host.level.gameTime = 50000;
  const a = makeGuest(host, 'Alex');
  step(host, 2);
  const same = () => a.level.dayTime === host.level.dayTime && a.level.gameTime === host.level.gameTime;
  check('time: the guest starts at the host\'s time', same(), `${a.level.dayTime}/${host.level.dayTime} ${a.level.gameTime}/${host.level.gameTime}`);
  const setTimes = counting(a, m.CB.SetTime);
  let off = 0;
  for (let i = 0; i < 60; i++) {
    step(host, 1);
    if (!same()) off++;
  }
  check('time: its clock keeps the host\'s, tick for tick', off === 0, `${off} ticks off`);
  check('time: sent every second (vanilla MinecraftServer.tickChildren)', setTimes.count === 3, `${setTimes.count} in 60 ticks`);

  // (a guest's clock that slipped, as a slow one would, is put right within the second)
  a.level.dayTime += 7;
  step(host, 20);
  check('time: a guest\'s clock that slipped is put right within a second', same());

  // /time set, between ticks: at once (vanilla TimeCommand: forceTimeSynchronization)
  host.level.dayTime = 13000;
  step(host, 1);
  check('time: /time set reaches the guest in the next tick', a.level.dayTime === 13001 && same(), `${a.level.dayTime}`);
  // /gamerule doDaylightCycle false: the sun stops for the guest too, the game time runs on
  host.level.gameRules.doDaylightCycle = false;
  host.level.doDaylightCycle = false;
  step(host, 1);
  const stopped = a.level.dayTime;
  step(host, 30);
  check('time: doDaylightCycle off stops the guest\'s sun', a.level.dayTime === stopped && same() && !a.level.doDaylightCycle, `${a.level.dayTime}/${stopped}`);
  check('time: (the game time runs on)', a.level.gameTime === host.level.gameTime);
  host.level.gameRules.doDaylightCycle = true;
  host.level.doDaylightCycle = true;
  step(host, 5);
  check('time: and on again, it runs again', a.level.dayTime === stopped + 5 && same(), `${a.level.dayTime}/${stopped}`);

  // a guest's /time is the host's to refuse: nothing changes
  const before = host.level.dayTime;
  a.session.chat('/time set night');
  step(host, 3);
  check('refused: a guest\'s command is refused, in plain words, to it', a.chat.includes('§cOnly the host can use commands.'), a.chat.slice(-2).join(' | '));
  check('refused: and not run (the host\'s time went on as ever)', host.level.dayTime === before + 3 && same());
  check('refused: nobody else hears of it', !host.chat.some((t) => t.includes('/time')));
}

// ---------------------------------------------------------------------------
// the weather
{
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex');
  step(host, 2);
  const weather = counting(a, m.CB.Weather);
  step(host, 20);
  check('weather: nothing sent while it doesn\'t change', weather.count === 0, `${weather.count}`);
  const same = () => a.level.raining === host.level.raining && a.level.thundering === host.level.thundering && Math.abs(a.level.rain - host.level.rain) < 0.0015 && Math.abs(a.level.thunder - host.level.thunder) < 0.0015;
  let off = 0;
  host.level.setWeather('rain');
  for (let i = 0; i < 40; i++) {
    step(host, 1);
    if (!same()) off++;
  }
  check('weather: rain comes on the guest as on the host, tick for tick', off === 0 && a.level.raining && a.level.rain > 0.35, `${off} off, rain ${a.level.rain}`);
  host.level.setWeather('thunder');
  off = 0;
  for (let i = 0; i < 80; i++) {
    step(host, 1);
    if (!same()) off++;
  }
  check('weather: then thunder', off === 0 && a.level.thundering && a.level.thunder > 0.75 && a.level.rain === 1, `${off} off, thunder ${a.level.thunder}`);
  const settled = weather.count;
  step(host, 40);
  check('weather: (nothing more sent once it has set in)', weather.count === settled + 20, `${weather.count - settled}`);
  host.level.setWeather('clear');
  off = 0;
  for (let i = 0; i < 110; i++) {
    step(host, 1);
    if (!same()) off++;
  }
  check('weather: and clears', off === 0 && !a.level.raining && !a.level.thundering && a.level.rain === 0 && a.level.thunder === 0, `${off} off`);
  // a guest joining in the rain has it at once
  host.level.setWeather('rain');
  step(host, 100);
  const b = makeGuest(host, 'Steve');
  step(host, 2);
  check('weather: a guest joining in the rain has it from the start', b.level.raining && b.level.rain === host.level.rain, `${b.level.rain}`);
}

// ---------------------------------------------------------------------------
// chat
{
  const host = flatHost(m, 3);
  const a = makeGuest(host, 'Alex'), b = makeGuest(host, 'Steve');
  step(host, 3);
  a.session.chat('hello there');
  step(host, 2);
  check('chat: a guest\'s line is in the host\'s chat', host.chat.includes('<Alex> hello there'));
  check('chat: and every guest\'s, its own too', a.chat.includes('<Alex> hello there') && b.chat.includes('<Alex> hello there'));
  host.server.hostChatted('<Host> welcome');
  step(host, 1);
  check('chat: the host\'s line reaches the guests', a.chat.includes('<Host> welcome') && b.chat.includes('<Host> welcome'));
  const raw = rawGuest(host);
  step(host, 1);
  raw.hello('Rawley');
  step(host, 2);
  raw.send([[m.SB.Chat, '   lots    of   space  ']]);
  step(host, 2);
  check('chat: spaces are squeezed, as vanilla does', host.chat.includes('<Rawley> lots of space') && b.chat.includes('<Rawley> lots of space'), host.chat.slice(-1)[0]);
  const long = 'x'.repeat(m.MAX_CHAT);
  a.session.chat(long + 'yyy');
  step(host, 2);
  check('chat: 256 characters go through (vanilla\'s most); the guest\'s game cuts off the rest', host.chat.includes(`<Alex> ${long}`) && b.chat.includes(`<Alex> ${long}`));
  raw.send([[m.SB.Chat, long + 'y']]);
  step(host, 2);
  check('chat: 257 from a game that doesn\'t cut it off: disconnected', /^Bad data/.test(raw.reason() ?? '') && raw.gone, raw.reason());
  check('chat: (and the line isn\'t read out)', !host.chat.some((t) => t.includes(long + 'y')));

  // not plain text, from a game that sends it anyway (the chat box lets neither in): vanilla's "Illegal characters in chat"
  for (const [label, text] of [['a formatting sign', '§4red'], ['a control character', 'bell\u0007'], ['a line break', 'two\nlines'], ['a tab', 'a\tb']]) {
    const c = rawGuest(host);
    step(host, 1);
    c.hello('Tricky');
    step(host, 2);
    c.send([[m.SB.Chat, text]]);
    step(host, 2);
    check(`chat: ${label} has the guest disconnected (vanilla "Illegal characters in chat")`, c.reason() === 'Illegal characters in chat' && c.gone, c.reason());
    check(`chat: (${label} isn't read out, and the others stay)`, !host.chat.some((t) => t.startsWith('<Tricky>')) && a.session.state === 'play' && b.session.state === 'play');
  }
  // (the guest's own game makes one line of what's typed, as vanilla's chat box does)
  a.session.chat('two\nlines');
  step(host, 2);
  check('chat: a guest\'s game sends a line break as a space', host.chat.includes('<Alex> two lines'));

  // too much too fast: vanilla detectRateSpam (20 a line, a tick's worth off each tick, more than 200 is spam); the
  // clock is held still here so that only ticks count
  const realNow = performance.now.bind(performance);
  let now = realNow();
  performance.now = () => now;
  const spammer = makeGuest(host, 'Spammer');
  step(host, 3);
  for (let i = 0; i < 10; i++) spammer.session.chat(`line ${i}`);
  step(host, 2);
  check('spam: ten lines at once are let through', spammer.session.state === 'play' && host.chat.includes('<Spammer> line 9'));
  spammer.session.chat('one more');
  step(host, 2);
  check('spam: one more straight after: "Kicked for spamming"', spammer.disconnected === 'Kicked for spamming', spammer.disconnected);
  check('spam: (and it isn\'t read out)', !host.chat.includes('<Spammer> one more'));
  const commander = makeGuest(host, 'Commander');
  step(host, 3);
  for (let i = 0; i < 11; i++) commander.session.chat('/give @s diamond');
  step(host, 2);
  check('spam: commands count too (vanilla handleChatCommand)', commander.disconnected === 'Kicked for spamming', commander.disconnected);
  // (a host whose window is hidden ticks once a second: a second between ticks lets off a second's worth)
  const patient = makeGuest(host, 'Patient');
  step(host, 3);
  for (let i = 0; i < 10; i++) patient.session.chat(`hi ${i}`);
  step(host, 2);
  now += 1000;
  step(host, 1);
  patient.session.chat('one more');
  step(host, 2);
  check('spam: a second between the host\'s ticks lets off a second\'s worth (a hidden host window): one more is fine', patient.session.state === 'play' && host.chat.includes('<Patient> one more'), patient.disconnected);
  delete performance.now;
  check('chat: the others are still in', a.session.state === 'play' && b.session.state === 'play' && host.server.guestCount() === 3, `${host.server.guestCount()}`);
}

await exitWithStatus(close);
