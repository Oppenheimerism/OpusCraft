// Multiplayer M1: blocks, both ways (vanilla ServerPlayerGameMode for a guest's clicks, ChunkHolder.blockChanged,
// ServerLevel.destroyBlockProgress, and the sounds and particles that go with them): what a guest in creative places and
// breaks, the host does, as it does its own player's clicks: with what the guest holds, and only within reach. Everyone
// has the change at the end of the tick, and hears and sees it if near enough; a crack in a block shows to everyone
// round it (the one making it too: its game leaves the mining to the host); and what the blocks do about a guest (a
// pressure plate's click) reaches that guest too.

import { loadNet, flatHost, makeGuest, hostCopy, step, assertMirrorEquals, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet();

const host = flatHost(m, 5, { x: -20.5, z: -20.5 });
const a = makeGuest(host, 'Alex', { viewDistance: 3 });
const b = makeGuest(host, 'Steve', { viewDistance: 3 });
step(host, 25);
const ha = hostCopy(host, a), hb = hostCopy(host, b);

/** `g`'s player hovering (flying, not on the ground) at (x, y, z), looking `yaw`, `pitch`, and the host's copy there */
function hover(g, x, y, z, yaw = 0, pitch = 90) {
  const p = g.player;
  p.flying = true;
  p.onGround = false;
  p.dx = p.dy = p.dz = 0;
  p.moveTo(x, y, z, yaw, pitch);
  step(host, 2);
}
/** `g` hovering at (x, y, z) by way of moves of at most 8 blocks (the host puts back a guest that moves 10 in a tick) */
function glide(g, x, y, z, yaw = 0, pitch = 90) {
  for (;;) {
    const p = g.player, d = Math.hypot(x - p.x, y - p.y, z - p.z);
    if (d <= 8) return hover(g, x, y, z, yaw, pitch);
    hover(g, p.x + ((x - p.x) * 8) / d, p.y + ((y - p.y) * 8) / d, p.z + ((z - p.z) * 8) / d, yaw, pitch);
  }
}
/** what `g` holds in its hotbar slot `slot`, selected */
function hold(g, id, slot = 0) {
  const inv = g.player.inventory;
  inv.main[slot] = id ? new m.ItemStack(m.getItem(id), id === 'diamond_pickaxe' ? 1 : 64) : null;
  inv.selected = slot;
  inv.version++;
  step(host, 2);
}
/** a click: the guest's tick sends it, the host's next tick does it, the one after that everyone has it */
function click(g, attack) {
  if (attack) g.session.input(true, false, false, false);
  else g.session.input(false, false, true, false);
  step(host, 3);
}
const heard = (g, pred) => g.level.sounds.some(pred);
const sawParticles = (g, method, pred = () => true) => g.level.particleCalls.some((c) => c.method === method && pred(c.args));
const clear = (...gs) => gs.forEach((g) => ((g.level.sounds.length = 0), (g.level.particleCalls.length = 0)));
const at = (s, x, y, z) => Math.abs(s.x - x) < 1 && Math.abs(s.y - y) < 1 && Math.abs(s.z - z) < 1;

// ---------------------------------------------------------------------------
// placing: what it holds, where it looks
{
  hover(a, 2.5, 67, 2.5);
  hold(a, 'glass');
  check('holding: the host\'s copy holds what the guest picked (vanilla ServerboundSetCreativeModeSlotPacket)', ha.inventory.main[0]?.item.id === 'glass');
  clear(a, b);
  click(a, false);
  const glass = m.S('glass');
  check('placing: the host has the guest\'s block', host.world.getState(2, 64, 2) === glass);
  check('placing: the guest has it', a.world.getState(2, 64, 2) === glass);
  check('placing: so does the other guest', b.world.getState(2, 64, 2) === glass);
  check('placing: the guest hears it placed', heard(a, (s) => s.name.endsWith('.place') && at(s, 2.5, 64.5, 2.5)), a.level.sounds.map((s) => s.name).join());
  check('placing: the other guest hears it too', heard(b, (s) => s.name.endsWith('.place') && at(s, 2.5, 64.5, 2.5)));
  check('placing: the host\'s copy swings its arm, and the guests see it', ha.swinging || mirrorSwung(b, ha));
  hold(a, 'dirt', 1);
  check('holding: the hotbar slot too (vanilla ServerboundSetCarriedItemPacket)', ha.inventory.selected === 1 && ha.inventory.main[1]?.item.id === 'dirt');
  click(a, false);
  check('placing: the block it holds now goes on top', host.world.getState(2, 65, 2) === m.S('dirt') && a.world.getState(2, 65, 2) === m.S('dirt'));
  assertMirrorEquals(host, a, 'after placing');
  assertMirrorEquals(host, b, 'after placing');
}
function mirrorSwung(g, p) {
  return g.session.mirrors.get(p.id)?.swinging ?? false;
}

// ---------------------------------------------------------------------------
// breaking: creative breaks at once, with the break's sound and particles
{
  clear(a, b);
  click(a, true);
  check('breaking: the host breaks the block the guest looks at', host.world.getState(2, 65, 2) === 0);
  check('breaking: gone on both guests\' too', a.world.getState(2, 65, 2) === 0 && b.world.getState(2, 65, 2) === 0);
  check('breaking: the guest sees it break (vanilla levelEvent 2001: particles of the block)', sawParticles(a, 'blockBreak', (args) => args[0] === 2 && args[1] === 65 && args[2] === 2 && args[3] === m.S('dirt')), JSON.stringify(a.level.particleCalls.slice(0, 3)));
  check('breaking: and hears it', heard(a, (s) => s.name.endsWith('.break') && at(s, 2.5, 65.5, 2.5)));
  check('breaking: the other guest sees and hears it too', sawParticles(b, 'blockBreak') && heard(b, (s) => s.name.endsWith('.break')));
  assertMirrorEquals(host, a, 'after breaking');
}

// ---------------------------------------------------------------------------
// reach: only as far as the host would let its own player (vanilla 5 blocks in creative)
{
  hover(a, 8.5, 64 + 8, 8.5);
  hold(a, 'stone');
  click(a, false);
  check('reach: looking at the ground 8 blocks down, nothing is placed', host.world.getState(8, 64, 8) === 0 && a.world.getState(8, 64, 8) === 0);
  click(a, true);
  check('reach: nor broken', host.world.getState(8, 63, 8) === m.S('stone'));
  hover(a, 8.5, 64 + 3, 8.5);
  click(a, false);
  check('reach: from 3 blocks up it is', host.world.getState(8, 64, 8) === m.S('stone'));
  // another player in the way: the ray stops there (clicking a player does nothing yet), and the block behind it is
  // out of the click's way; with the player gone, the same click places it
  glide(b, 8.5, 65.2, 8.5, 0, 0);
  check('reach: (the other guest is where it went)', Math.abs(hb.x - 8.5) < 1e-6 && Math.abs(hb.z - 8.5) < 1e-6, `${hb.x},${hb.y},${hb.z}`);
  hover(a, 8.5, 67, 8.5);
  click(a, false);
  check('reach: a player in the way stops the click', host.world.getState(8, 65, 8) === 0);
  glide(b, 12.5, 66, 12.5, 0, 0);
  click(a, false);
  check('reach: out of the way, the same click places the block', host.world.getState(8, 65, 8) === m.S('stone'));
  assertMirrorEquals(host, a, 'after the reach checks');
}

// ---------------------------------------------------------------------------
// cracks: the host's, as its Interaction makes it (Game draws that one), and a guest's, as the level has it
{
  host.setBreaking({ x: 4, y: 63, z: 4, stage: 3 });
  step(host, 2);
  check('crack: the guests see the host\'s crack (vanilla ClientboundBlockDestructionPacket)', a.level.destroyProgress.get(host.player.id)?.stage === 3 && b.level.destroyProgress.get(host.player.id)?.stage === 3);
  host.setBreaking({ x: 4, y: 63, z: 4, stage: 7 });
  step(host, 2);
  check('crack: as it grows', a.level.destroyProgress.get(host.player.id)?.stage === 7);
  host.setBreaking(null);
  step(host, 2);
  check('crack: and gone when the host stops', !a.level.destroyProgress.has(host.player.id) && !b.level.destroyProgress.has(host.player.id));
  // a guest mining (its player on the host in survival for this: guests play in creative in stage 1), standing on the
  // ground with a diamond pickaxe, at a block in front of it
  hold(a, 'diamond_pickaxe');
  host.level.setBlock(4, 64, 5, m.S('stone'));
  const p = a.player;
  p.flying = false;
  p.dx = p.dy = p.dz = 0;
  p.moveTo(4.5, 64, 4.5, 0, 45);
  step(host, 3);
  check('crack: (the guest stands on the ground)', ha.onGround && !ha.flying && a.player.onGround);
  ha.setGameMode('survival');
  const stageOf = (level) => level.destroyProgress.get(ha.id)?.stage ?? -1;
  const mine = (until) => {
    a.session.input(true, true, false, false);
    for (let i = 0; i < 30 && !until(); i++) {
      a.session.input(false, true, false, false);
      step(host, 1);
    }
    a.session.input(false, false, false, false);
  };
  let sameEverywhere = true;
  mine(() => {
    const h = stageOf(host.level);
    if (h >= 0 && (stageOf(a.level) !== h || stageOf(b.level) !== h)) sameEverywhere = false;
    return h >= 3;
  });
  const hs = host.level.destroyProgress.get(ha.id);
  check('crack: a guest\'s mining cracks the block in the host\'s level', hs?.stage >= 3 && hs.x === 4 && hs.y === 64 && hs.z === 5, JSON.stringify(hs));
  check('crack: the other guest sees it grow, stage for stage', stageOf(b.level) === hs?.stage && sameEverywhere);
  check('crack: so does the one mining (its game leaves the mining to the host)', stageOf(a.level) === hs?.stage);
  check('crack: the one mining hears its blows (vanilla block hit sounds)', heard(a, (s) => s.name === 'block.stone.hit'));
  step(host, 3);
  check('crack: gone everywhere when it lets go', !host.level.destroyProgress.has(ha.id) && !a.level.destroyProgress.has(ha.id) && !b.level.destroyProgress.has(ha.id));
  check('crack: (and the block is still there)', host.world.getState(4, 64, 5) === m.S('stone') && a.world.getState(4, 64, 5) === m.S('stone'));
  clear(a, b);
  mine(() => host.world.getState(4, 64, 5) === 0);
  step(host, 3);
  check('crack: mined long enough, the block breaks, for everyone', host.world.getState(4, 64, 5) === 0 && a.world.getState(4, 64, 5) === 0 && b.world.getState(4, 64, 5) === 0);
  check('crack: and its crack goes with it', !a.level.destroyProgress.has(ha.id) && !b.level.destroyProgress.has(ha.id));
  check('crack: the one mining sees and hears it break', sawParticles(a, 'blockBreak', (args) => args[0] === 4 && args[1] === 64 && args[2] === 5) && heard(a, (s) => s.name === 'block.stone.break'));
  ha.setGameMode('creative');
  assertMirrorEquals(host, a, 'after the cracks');
  assertMirrorEquals(host, b, 'after the cracks');
}

// ---------------------------------------------------------------------------
// what the blocks do about a guest's player: a pressure plate it walks onto clicks, for it too
{
  host.level.setBlock(10, 64, 2, m.S('stone_pressure_plate'));
  step(host, 2);
  clear(a, b);
  const p = a.player;
  p.flying = false;
  p.moveTo(10.5, 64, 2.5, 0, 0);
  step(host, 6);
  const plate = host.world.getState(10, 64, 2);
  check('plate: the host\'s plate is pressed by the guest\'s player', plate !== m.S('stone_pressure_plate') && m.STATE_BLOCK[plate] === m.STATE_BLOCK[m.S('stone_pressure_plate')], `${plate}`);
  check('plate: the guest has it pressed too', a.world.getState(10, 64, 2) === plate);
  check('plate: the guest hears it click (not its own doing, so it isn\'t kept from it)', heard(a, (s) => s.name.includes('pressure_plate') && at(s, 10.5, 64.5, 2.5)), a.level.sounds.map((s) => s.name).join());
  assertMirrorEquals(host, a, 'on the pressure plate');
}

// ---------------------------------------------------------------------------
// what goes where: sounds within 16 blocks (more for loud ones), particles within 32; the host's own ambience stays
{
  // (the other guest 40 blocks off: in its view, out of earshot)
  glide(b, 42.5, 66, 6.5, 0, 0);
  check('range: (the other guest is 40 blocks off)', Math.abs(hb.x - 42.5) < 1e-6 && Math.abs(hb.z - 6.5) < 1e-6, `${hb.x},${hb.z}`);
  hover(a, 2.5, 67, 6.5);
  hold(a, 'glass');
  clear(a, b);
  click(a, false);
  check('range: the far guest has the block (its chunk is in its view)', b.world.getChunk(0, 0) && b.world.getState(2, 64, 6) === m.S('glass'));
  check('range: but doesn\'t hear it placed, 40 blocks off', !heard(b, (s) => s.name.endsWith('.place')));
  check('range: the near one does', heard(a, (s) => s.name.endsWith('.place')));
  clear(a, b);
  host.server.runLocal(() => host.level.sound.play('ambient.cave', 2, 64, 2, 1, 1));
  host.level.sound.play('entity.lightning_bolt.thunder', 2, 64, 2, 10000, 1);
  step(host, 2);
  check('range: the host\'s own ambience isn\'t sent', !heard(a, (s) => s.name === 'ambient.cave'));
  check('range: a loud sound carries far (16 x volume)', heard(b, (s) => s.name === 'entity.lightning_bolt.thunder'));
  assertMirrorEquals(host, a, 'at the end');
  assertMirrorEquals(host, b, 'at the end');
}

await exitWithStatus(close);
