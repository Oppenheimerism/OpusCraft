// Signs over the LAN (node tests/survival-blocks/signs-mp.mjs): a guest places a sign and its editor opens on the
// guest's screen (vanilla ServerPlayer.openTextEdit: the block, its text, then ClientboundOpenSignEditorPacket); what it
// types goes to the host, which checks it as vanilla's handleSignUpdate does (the player who may edit it, near enough,
// not waxed, four lines of at most 384 characters, no formatting or control characters) and everyone sees the text.
// Another guest can't write on it meanwhile, nor on a sign it never opened; dyes, glow ink and wax from a guest; the back
// side; a hanging sign; a guest who comes later sees what's written; a malformed update has a guest disconnected.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, rawGuest, hostCopy, step, assertMirrorEquals, check, exitWithStatus } from '../multiplayer/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/game/signs.ts', '/src/world/signBlockEntity.ts', '/src/world/blocksSigns.ts']);
const S = (id, n = 1) => m.ItemStack.of(id, n);

const host = flatHost(m, 4, { guestGameMode: 'survival', gameMode: 'survival', x: -20.5, z: -20.5 });
const a = makeGuest(host, 'Alex', { viewDistance: 3 });
const b = makeGuest(host, 'Steve', { viewDistance: 3 });
step(host, 30);
const ha = hostCopy(host, a), hb = hostCopy(host, b);

// the game's hook as gui/screens/signEdit.ts installs it: the host's own player's editor on its screen, a guest's
// player's sent to its guest; a guest's game (here, in the same process) opens it on its own screen
const hostOpens = [];
m.setSignEditorHook((p, be, front) => {
  const g = host.guests.find((x) => x.player === p);
  if (g) return void (g.editors ??= []).push({ x: be.x, y: be.y, z: be.z, front, lines: be.getText(front).messages.join('|') });
  if (p === host.player) return void hostOpens.push({ x: be.x, y: be.y, z: be.z, front });
  host.server.openSignEditor(p, be, front);
});
for (const g of host.guests) g.editors = [];

/** put `g`'s player at (x, y, z), a few blocks a tick, as it would walk there, looking (yaw, pitch) */
function walkTo(g, x, y, z, yaw = 0, pitch = 0) {
  for (let k = 0; k < 60; k++) {
    const p = g.player, dx = x - p.x, dz = z - p.z, dy = y - p.y, d = Math.hypot(dx, dy, dz);
    if (d < 1e-9) break;
    const f = Math.min(1, 4 / d);
    p.moveTo(p.x + dx * f, p.y + dy * f, p.z + dz * f, yaw, pitch);
    p.dx = p.dy = p.dz = 0;
    step(host, 1);
  }
  g.player.yaw = yaw;
  g.player.pitch = pitch;
  step(host, 3);
}
/** `g` looking from where it is at the point (x, y, z) */
function lookAt(g, x, y, z) {
  const p = g.player, ex = p.x, ey = p.y + 1.62, ez = p.z;
  const dx = x - ex, dy = y - ey, dz = z - ez;
  p.yaw = (-Math.atan2(dx, dz) * 180) / Math.PI;
  p.pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  step(host, 2);
}
/** what the host's copy of `g`'s player holds (the host decides a survival guest's inventory) */
function give(g, id, n = 1) {
  const h = hostCopy(host, g), inv = h.inventory;
  inv.main[0] = id ? S(id, n) : null;
  inv.selected = 0;
  inv.version++;
  g.player.inventory.selected = 0;
  step(host, 3);
}
/** a right click: the guest's tick sends it, the host's next tick does it, the one after that everyone has it */
function use(g) {
  g.session.input(false, false, true, false);
  step(host, 4);
}
const hostSign = (x, y, z) => host.world.getBlockEntity(x, y, z);
const guestSign = (g, x, y, z) => g.world.getBlockEntity(x, y, z);
const nameAt = (w, x, y, z) => m.BLOCKS[m.STATE_BLOCK[w.getState(x, y, z)]].name;
const lines = (be, front = true) => (be ? be.getText(front).messages.join('|') : '(none)');

// ---------------------------------------------------------------------------
// a guest places a sign: its editor opens on the guest's screen, for the front
{
  // (both came in at the spawn, where the sign's going: the other guest steps aside, out of the click's way)
  walkTo(b, 8.5, 64, 8.5);
  walkTo(a, 0.5, 64, -2.5);
  give(a, 'oak_sign', 3);
  lookAt(a, 0.5, 64, 0.5);
  use(a);
  check('placed by a guest: the sign is on the host, turned to face the guest (rotation 8)', nameAt(host.world, 0, 64, 0) === 'oak_sign' && m.getBlock('oak_sign').get(host.world.getState(0, 64, 0), 'rotation') === 8, nameAt(host.world, 0, 64, 0));
  check('...and on both guests', nameAt(a.world, 0, 64, 0) === 'oak_sign' && nameAt(b.world, 0, 64, 0) === 'oak_sign');
  check('...one sign fewer in the guest\'s hand', ha.inventory.main[0]?.count === 2 && a.player.inventory.main[0]?.count === 2);
  check('...its editor opens on the guest\'s screen, for the front', a.editors.length === 1 && a.editors[0].x === 0 && a.editors[0].y === 64 && a.editors[0].z === 0 && a.editors[0].front === true, JSON.stringify(a.editors));
  check('...not on the other guest\'s, nor the host\'s', b.editors.length === 0 && hostOpens.length === 0);
  check('...the guest has the sign\'s block entity (a sign\'s) to edit', guestSign(a, 0, 64, 0) instanceof m.SignBlockEntity);
  check('...only the guest may edit it now (on the host)', hostSign(0, 64, 0).playerWhoMayEdit === ha.uuid);
}

// ---------------------------------------------------------------------------
// what it types: checked by the host, then everyone sees it
{
  b.session.signUpdate(0, 64, 0, true, ['Steve', 'sneaks', 'in', '']);
  step(host, 3);
  check('the other guest writes on it (never opened it): refused', lines(hostSign(0, 64, 0)) === '|||');
  a.session.signUpdate(0, 64, 0, true, ['Hello', 'from', 'Alex', '!']);
  step(host, 3);
  check('the guest\'s Done: the host writes its lines', lines(hostSign(0, 64, 0)) === 'Hello|from|Alex|!', lines(hostSign(0, 64, 0)));
  check('...the guest sees them', lines(guestSign(a, 0, 64, 0)) === 'Hello|from|Alex|!');
  check('...and so does the other guest', lines(guestSign(b, 0, 64, 0)) === 'Hello|from|Alex|!', lines(guestSign(b, 0, 64, 0)));
  check('...nobody may edit it now', hostSign(0, 64, 0).playerWhoMayEdit === null);
  a.session.signUpdate(0, 64, 0, true, ['again', '', '', '']);
  step(host, 3);
  check('again without opening it: refused', lines(hostSign(0, 64, 0)) === 'Hello|from|Alex|!');
  assertMirrorEquals(host, a, 'after writing');
  assertMirrorEquals(host, b, 'after writing');
}

// ---------------------------------------------------------------------------
// another guest opens it: the editor shows what's written; the first can't write meanwhile
{
  walkTo(b, 1.5, 64, -2.5);
  give(b, null);
  lookAt(b, 0.5, 64.5, 0.5);
  use(b);
  check('the other guest clicks it: its editor, for the front, with what\'s written', b.editors.length === 1 && b.editors[0].front === true && b.editors[0].lines === 'Hello|from|Alex|!', JSON.stringify(b.editors));
  give(a, null);
  lookAt(a, 0.5, 64.5, 0.5);
  const before = a.editors.length;
  use(a);
  check('while it edits: the first guest\'s click opens nothing', a.editors.length === before && hostSign(0, 64, 0).playerWhoMayEdit === hb.uuid);
  a.session.signUpdate(0, 64, 0, true, ['mine', '', '', '']);
  step(host, 3);
  check('...nor may it write', lines(hostSign(0, 64, 0)) === 'Hello|from|Alex|!');
  b.session.signUpdate(0, 64, 0, true, ['Steve', 'was', 'here', '']);
  step(host, 3);
  check('the other guest\'s lines: written, and the first guest sees them', lines(hostSign(0, 64, 0)) === 'Steve|was|here|' && lines(guestSign(a, 0, 64, 0)) === 'Steve|was|here|');
}

// ---------------------------------------------------------------------------
// what an honest editor can't send: formatting and control characters come off (vanilla filterText/stripped)
{
  use(a);
  check('(the guest opens it again)', a.editors.length === 2 && hostSign(0, 64, 0).playerWhoMayEdit === ha.uuid);
  a.session['send']([m.SB.SignUpdate, 0, 64, 0, true, '§4Red§r text', 'tab\there', 'bell\u0007', 'ok']);
  step(host, 3);
  check('a guest\'s lines with formatting codes and control characters: written without them', lines(hostSign(0, 64, 0)) === 'Red text|tabhere|bell|ok', lines(hostSign(0, 64, 0)));
}

// ---------------------------------------------------------------------------
// dyes, glow ink, ink and wax from a guest, on the side it's on
{
  give(a, 'red_dye', 2);
  use(a);
  check('a guest\'s dye: the host\'s text is red, and both guests see it', hostSign(0, 64, 0).frontText.color === 'red' && guestSign(a, 0, 64, 0).frontText.color === 'red' && guestSign(b, 0, 64, 0).frontText.color === 'red');
  check('...one dye used', ha.inventory.main[0]?.count === 1 && a.player.inventory.main[0]?.count === 1);
  check('...the guest hears it', a.level.sounds.some((s) => s.name === 'item.dye.use'));
  give(a, 'glow_ink_sac', 1);
  use(a);
  check('a guest\'s glow ink sac: glowing, for everyone', hostSign(0, 64, 0).frontText.glowing && guestSign(b, 0, 64, 0).frontText.glowing);
  give(a, 'ink_sac', 1);
  use(a);
  check('a guest\'s ink sac: not any more', !hostSign(0, 64, 0).frontText.glowing && !guestSign(b, 0, 64, 0).frontText.glowing);
  give(a, 'honeycomb', 1);
  use(a);
  check('a guest\'s honeycomb: waxed, for everyone', hostSign(0, 64, 0).waxed && guestSign(a, 0, 64, 0).waxed && guestSign(b, 0, 64, 0).waxed);
  give(a, null);
  a.level.sounds.length = 0;
  const n = a.editors.length;
  use(a);
  check('waxed: a guest\'s click opens nothing; it knocks, and the guest hears it', a.editors.length === n && a.level.sounds.some((s) => s.name === 'block.sign.waxed_interact_fail'));
  hostSign(0, 64, 0).playerWhoMayEdit = ha.uuid;
  a.session.signUpdate(0, 64, 0, true, ['wax?', '', '', '']);
  step(host, 3);
  check('waxed: nothing written, even from the one who may edit it', lines(hostSign(0, 64, 0)) === 'Red text|tabhere|bell|ok');
  hostSign(0, 64, 0).playerWhoMayEdit = null;
}

// ---------------------------------------------------------------------------
// the back: clicked from behind, its editor is for the back
{
  walkTo(a, 4.5, 64, -2.5);
  give(a, 'birch_sign', 1);
  lookAt(a, 4.5, 64, 0.5);
  use(a);
  check('a second sign, placed: its editor for the front', nameAt(host.world, 4, 64, 0) === 'birch_sign' && a.editors.at(-1).x === 4 && a.editors.at(-1).front === true);
  a.session.signUpdate(4, 64, 0, true, ['Front', '', '', '']);
  step(host, 3);
  walkTo(a, 4.5, 64, 3.5, 180, 0);
  give(a, null);
  lookAt(a, 4.5, 64.5, 0.5);
  use(a);
  check('clicked from behind: its editor for the back', a.editors.at(-1).x === 4 && a.editors.at(-1).front === false, JSON.stringify(a.editors.at(-1)));
  a.session.signUpdate(4, 64, 0, false, ['Back', '', '', '']);
  step(host, 3);
  check('...its lines go on the back, for everyone', lines(hostSign(4, 64, 0), false) === 'Back|||' && lines(hostSign(4, 64, 0), true) === 'Front|||' && lines(guestSign(b, 4, 64, 0), false) === 'Back|||');
}

// ---------------------------------------------------------------------------
// too far: the editor's player walked off (vanilla playerTooFarToEdit / SignBlockEntity.tick)
{
  lookAt(a, 4.5, 64.5, 0.5);
  use(a);
  check('(opened again)', hostSign(4, 64, 0).playerWhoMayEdit === ha.uuid);
  walkTo(a, 4.5, 64, 14.5);
  a.session.signUpdate(4, 64, 0, false, ['far', '', '', '']);
  step(host, 3);
  check('sent from 14 blocks away: refused', lines(hostSign(4, 64, 0), false) === 'Back|||');
  check('...and the sign forgot who was editing it', hostSign(4, 64, 0).playerWhoMayEdit === null);
}

// ---------------------------------------------------------------------------
// a hanging sign under a block, from a guest
{
  host.level.setBlock(-4, 67, 0, m.S('stone'));
  step(host, 2);
  walkTo(b, -4.5, 64, -2.5);
  give(b, 'cherry_hanging_sign', 1);
  lookAt(b, -3.5, 67, 0.5);
  use(b);
  check('a guest\'s hanging sign under a block: on the host, on straight chains', nameAt(host.world, -4, 66, 0) === 'cherry_hanging_sign' && m.getBlock('cherry_hanging_sign').get(host.world.getState(-4, 66, 0), 'attached') === false, nameAt(host.world, -4, 66, 0));
  check('...a hanging sign\'s block entity, on the host and the guests', hostSign(-4, 66, 0) instanceof m.HangingSignBlockEntity && guestSign(a, -4, 66, 0) instanceof m.HangingSignBlockEntity && guestSign(b, -4, 66, 0) instanceof m.HangingSignBlockEntity);
  check('...its editor on the guest\'s screen', b.editors.at(-1).x === -4 && b.editors.at(-1).y === 66);
  b.session.signUpdate(-4, 66, 0, true, ['Inn', '', '', '']);
  step(host, 3);
  check('...its lines, for everyone', lines(hostSign(-4, 66, 0)) === 'Inn|||' && lines(guestSign(a, -4, 66, 0)) === 'Inn|||');
  assertMirrorEquals(host, a, 'after the hanging sign');
  assertMirrorEquals(host, b, 'after the hanging sign');
}

// ---------------------------------------------------------------------------
// the host's own player editing: a guest can't write meanwhile
{
  const be = hostSign(-4, 66, 0);
  host.player.moveTo(-4.5, 64, 2.5, 180, 0);
  m.openTextEdit(host.player, be, true);
  check('the host\'s player opens it: its editor on the host\'s screen', hostOpens.length === 1 && hostOpens[0].x === -4);
  b.session.signUpdate(-4, 66, 0, true, ['guest', '', '', '']);
  step(host, 3);
  check('...a guest\'s lines meanwhile: refused', lines(be) === 'Inn|||');
  check('...the host\'s own: written, and the guests see them', m.updateSignText(host.level, host.player, -4, 66, 0, true, ['Inn', 'Rooms', '', '']) && (step(host, 3), lines(guestSign(a, -4, 66, 0)) === 'Inn|Rooms||'));
}

// ---------------------------------------------------------------------------
// a guest who comes later sees what's written (the block entities come with the chunk)
{
  const c = makeGuest(host, 'Carol', { viewDistance: 3 });
  c.editors = [];
  step(host, 30);
  check('a guest who joins later: the signs\' text, colour and wax', lines(guestSign(c, 0, 64, 0)) === 'Red text|tabhere|bell|ok' && guestSign(c, 0, 64, 0)?.frontText.color === 'red' && guestSign(c, 0, 64, 0)?.waxed && lines(guestSign(c, -4, 66, 0)) === 'Inn|Rooms||' && lines(guestSign(c, 4, 64, 0), false) === 'Back|||');
  assertMirrorEquals(host, c, 'a later guest');
}

// ---------------------------------------------------------------------------
// the host's world saved and loaded: the text stays
{
  const saved = host.world.chunkBlockEntities(0, 0).map((be) => JSON.parse(JSON.stringify(be.save())));
  const back = saved.map((d) => m.loadBlockEntity(d)).filter((be) => be instanceof m.SignBlockEntity);
  check('the host\'s world saved: its signs come back with their text', back.some((be) => lines(be) === 'Red text|tabhere|bell|ok' && be.waxed) && back.some((be) => lines(be, false) === 'Back|||'));
}

// ---------------------------------------------------------------------------
// malformed updates: the guest disconnected, saying why; nobody else notices
{
  let n = 0;
  function attack(label, packets, want) {
    const r = rawGuest(host);
    const name = `Bad${n++}`;
    step(host, 1);
    r.hello(name);
    step(host, 3);
    const inGame = hostCopy(host, { name }) !== null;
    let threw = null;
    try {
      r.send(packets);
      step(host, 3);
    } catch (e) {
      threw = e;
    }
    const reason = r.reason();
    check(`${label}: the guest is disconnected, with a reason`, inGame && r.gone && reason !== null && want.test(reason), `${reason}`);
    check(`${label}: (the host's tick didn't throw; the others play on)`, !threw && a.session.state === 'play' && b.session.state === 'play', threw ? String(threw.stack ?? threw).slice(0, 300) : '');
  }
  const up = (...f) => [[m.SB.SignUpdate, ...f]];
  attack('a line of 385 characters', up(0, 64, 0, true, 'x'.repeat(385), '', '', ''), /^Bad data: packet \d+: bad field 4/);
  attack('three lines', up(0, 64, 0, true, 'a', 'b', 'c'), /^Bad data: packet \d+: /);
  attack('a line that isn\'t text', up(0, 64, 0, true, 'a', 7, 'c', 'd'), /^Bad data: packet \d+: bad field 5/);
  attack('a side that isn\'t one', up(0, 64, 0, 2, 'a', 'b', 'c', 'd'), /^Bad data: packet \d+: bad field 3/);
  attack('a sign past the world\'s edge', up(40_000_000, 64, 0, true, 'a', 'b', 'c', 'd'), /^Bad data: packet \d+: bad field 0/);
  // well formed, but not its sign to write: nothing happens, and it stays
  const r = rawGuest(host);
  step(host, 1);
  r.hello('Sneaky');
  step(host, 3);
  r.send(up(-4, 66, 0, true, 'hacked', '', '', ''));
  step(host, 3);
  check('a well-formed update for a sign it never opened: nothing written, and it stays', lines(hostSign(-4, 66, 0)) === 'Inn|Rooms||' && !r.gone);
  r.send(up(100, 64, 100, true, 'a', '', '', ''));
  step(host, 3);
  check('...for a sign that isn\'t loaded or there: nothing, and it stays', !r.gone);
}

m.setSignEditorHook(null);
await exitWithStatus(close);
