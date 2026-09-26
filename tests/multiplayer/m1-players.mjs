// Multiplayer M1: the players (vanilla ServerGamePacketListenerImpl.handleMovePlayer and ChunkMap.TrackedEntity for
// players): a guest's moves reach the host's copy of its player within a tick, a move too far at once is put back
// (vanilla "moved too quickly!"), and every player sees every other where it is, looking where it looks, in its pose,
// swinging its arm and holding what it holds, with its name; and stops seeing one that's gone or out of view.

import { loadNet, flatHost, makeGuest, hostCopy, step, assertMirrorEquals, check, exitWithStatus } from './lib.mjs';

const { m, close } = await loadNet();

const host = flatHost(m, 6);
const a = makeGuest(host, 'Alex', { viewDistance: 3 });
const b = makeGuest(host, 'Steve', { viewDistance: 3 });
step(host, 25);
const ha = hostCopy(host, a), hb = hostCopy(host, b);
const mirrorOf = (g, id) => g.session.mirrors.get(id) ?? null;

// ---------------------------------------------------------------------------
// each sees the others
{
  const hostPlayer = [...a.session.mirrors.values()].find((p) => p.profileName === 'Host');
  check('seeing: a guest sees the host\'s player, by the host\'s name', hostPlayer && hostPlayer.netId === host.player.id);
  check('seeing: and the other guest, by its name', mirrorOf(a, hb.id)?.profileName === 'Steve' && mirrorOf(b, ha.id)?.profileName === 'Alex');
  check('seeing: not itself', !a.session.mirrors.has(ha.id) && !b.session.mirrors.has(hb.id));
  check('seeing: the host sees both guests\' players, with their names', ha?.profileName === 'Alex' && hb?.profileName === 'Steve' && host.level.players().length === 3);
  check('seeing: a guest\'s level has its own player and the two others', a.level.players().length === 3);
  check('seeing: the others are where the host has them', Math.abs(hostPlayer.x - host.player.x) < 1e-9 && Math.abs(hostPlayer.z - host.player.z) < 1e-9);
  assertMirrorEquals(host, a, 'seeing each other');
}

// ---------------------------------------------------------------------------
// moving: a guest's moves reach the host within a tick; the host's and the others' reach it, eased in over 3 ticks
{
  a.player.moveTo(3.5, 64, 2.5, 45, 10);
  // (the guest says where it is at the end of its tick; the host's next tick has it there)
  step(host, 2);
  check('moving: the host has the guest where it went, looking where it looked, by its next tick', ha.x === 3.5 && ha.y === 64 && ha.z === 2.5 && ha.yaw === 45 && ha.pitch === 10, `${ha.x},${ha.y},${ha.z} ${ha.yaw} ${ha.pitch}`);
  const seen = mirrorOf(b, ha.id);
  check('moving: the other guest sees it get there within three ticks (vanilla lerpTo)', (() => {
    step(host, 3);
    return Math.abs(seen.x - 3.5) < 1e-6 && Math.abs(seen.z - 2.5) < 1e-6 && Math.abs(seen.yaw - 45) < 1e-6;
  })(), `${seen.x},${seen.z} ${seen.yaw}`);
  host.player.moveTo(-4.5, 64, -4.5, 90, 0);
  step(host, 1);
  const hm = [...a.session.mirrors.values()].find((p) => p.profileName === 'Host');
  const x1 = hm.x;
  step(host, 1);
  const x2 = hm.x;
  step(host, 3);
  check('moving: the host\'s player eases along on the guest, a step at a time', x1 > -4.5 && x2 < x1 && Math.abs(hm.x + 4.5) < 1e-6, `${x1} ${x2} ${hm.x}`);
  check('moving: its legs move as it goes (vanilla walkAnimation)', hm.walkAnimSpeed > 0 || hm.walkAnimSpeedO > 0, `${hm.walkAnimSpeed}`);
}

// ---------------------------------------------------------------------------
// too far at once: put back (vanilla teleport with an id, moves ignored until the guest says it took it)
{
  const before = [a.player.x, a.player.y, a.player.z];
  a.player.moveTo(before[0] + 30, before[1], before[2], 0, 0);
  step(host, 1);
  check('too fast: the host never has the guest 30 blocks off', Math.abs(ha.x - before[0]) < 1e-9, `${ha.x}`);
  step(host, 1);
  check('too fast: the guest is put back where the host had it (vanilla ClientboundPlayerPositionPacket)', Math.abs(a.player.x - before[0]) < 1e-9 && a.player.y === before[1] && a.player.z === before[2], `${a.player.x}`);
  const s = [...host.server.sessions.values()].find((x) => x.name === 'Alex');
  step(host, 1);
  check('too fast: the guest said it took the teleport', s.awaitingTeleport === null);
  a.player.moveTo(before[0] + 5, before[1], before[2], 0, 0);
  step(host, 2);
  check('too fast: afterwards its moves are believed again', Math.abs(ha.x - before[0] - 5) < 1e-9, `${ha.x}`);
  // a guest that doesn't take the teleport: its moves in the meantime don't count
  a.player.moveTo(a.player.x + 50, a.player.y, a.player.z, 0, 0);
  s.teleport(ha.x, ha.y, ha.z, 0, 0);
  const pending = s.awaitingTeleport;
  const handle = a.session.handle.bind(a.session);
  a.session.handle = (p) => (p[0] === m.CB.PlayerPosition ? undefined : handle(p));
  step(host, 1);
  a.player.moveTo(ha.x + 3, ha.y, ha.z, 0, 0);
  const x0 = ha.x;
  step(host, 2);
  check('too fast: before the guest takes a teleport, its moves don\'t count', ha.x === x0 && s.awaitingTeleport === pending);
  a.session.handle = handle;
  s.teleport(ha.x, ha.y, ha.z, 0, 0);
  step(host, 2);
  check('too fast: once it takes the next one they do again', s.awaitingTeleport === null);
  a.player.moveTo(ha.x + 2, ha.y, ha.z, 0, 0);
  step(host, 2);
  check('too fast: (believed)', Math.abs(ha.x - x0 - 2) < 1e-9, `${ha.x} vs ${x0 + 2}`);
  assertMirrorEquals(host, a, 'after the corrections');
}

// ---------------------------------------------------------------------------
// out of the world: back at the spawn (a guest can't die yet)
{
  a.player.moveTo(a.player.x, -100, a.player.z, 0, 0);
  // (down in steps of under 10 blocks, as a fall would go)
  for (let y = 60; y > m.MIN_Y - 70; y -= 9) {
    a.player.moveTo(a.player.x, y, a.player.z, 0, 0);
    a.player.dy = 0;
    step(host, 1);
  }
  step(host, 2);
  check('the void: a guest that falls out of the world is put back at the spawn', Math.abs(a.player.x - 0.5) < 1e-9 && Math.abs(a.player.y - 65) < 1.5 && Math.abs(ha.x - 0.5) < 1e-9 && Math.abs(ha.y - 65) < 1.5, `${a.player.x},${a.player.y} ${ha.x},${ha.y}`);
  check('the void: and told so', a.chat.some((t) => t.includes('fell out of the world')));
  check('the void: nothing hurt it on the host', ha.health === ha.maxHealth);
}

// ---------------------------------------------------------------------------
// poses: sneaking, sprinting, flying, swimming, all as the guest says (vanilla SynchedEntityData's flags and pose)
{
  const poses = [
    ['sneaking', (p) => { p.input.sneak = true; p.crouching = true; }, (p) => p.isShiftKeyDown() && p.crouching && p.height === 1.5],
    ['sprinting', (p) => { p.sprinting = true; }, (p) => p.sprinting],
    ['flying', (p) => { p.flying = true; }, (p) => p.flying],
    ['swimming', (p) => { p.swimming = true; p.swimPose = true; }, (p) => p.swimming && p.swimPose && p.height === 0.6],
  ];
  // (the guest's own tick works its pose out anew each tick, and a flyer on the ground lands: the pose is put back on
  // after it, as the guest's input would keep it)
  let pose = null;
  const tick = a.player.tick.bind(a.player);
  a.player.tick = () => {
    tick();
    pose?.(a.player);
  };
  for (const [name, set, is] of poses) {
    pose = set;
    step(host, 3);
    check(`pose: the host has the guest ${name}`, is(ha), `${m.poseFlags(ha)}`);
    step(host, 1);
    check(`pose: the other guest sees it ${name}`, is(mirrorOf(b, ha.id)));
    pose = null;
    const p = a.player;
    p.input.sneak = p.crouching = p.sprinting = p.flying = p.swimming = p.swimPose = false;
    p.setSize(0.6, 1.8);
    step(host, 3);
  }
  a.player.tick = tick;
  host.player.input.sneak = true;
  host.player.crouching = true;
  host.player.setSize(0.6, 1.5);
  step(host, 2);
  const hm = [...a.session.mirrors.values()].find((p) => p.profileName === 'Host');
  check('pose: the guests see the host sneak (its name goes faint)', hm.isShiftKeyDown() && hm.height === 1.5);
  host.player.input.sneak = false;
  host.player.crouching = false;
  host.player.setSize(0.6, 1.8);
  step(host, 2);
  check('pose: and stop', !hm.isShiftKeyDown() && hm.height === 1.8);
}

// ---------------------------------------------------------------------------
// swinging and holding
{
  a.player.inventory.main[0] = new m.ItemStack(m.getItem('diamond_sword'), 1);
  a.player.inventory.selected = 0;
  a.player.inventory.version++;
  step(host, 2);
  check('holding: the host\'s copy of the guest holds what the guest holds', ha.inventory.main[ha.inventory.selected]?.item.id === 'diamond_sword');
  step(host, 1);
  check('holding: the other guest sees it held (vanilla ClientboundSetEquipmentPacket)', mirrorOf(b, ha.id).inventory.main[mirrorOf(b, ha.id).inventory.selected]?.item.id === 'diamond_sword');
  a.player.inventory.armor[3] = new m.ItemStack(m.getItem('golden_helmet'), 1);
  a.player.inventory.version++;
  step(host, 3);
  check('holding: and what it wears', mirrorOf(b, ha.id).inventory.armor[3]?.item.id === 'golden_helmet');
  host.player.inventory.main[host.player.inventory.selected] = new m.ItemStack(m.getItem('torch'), 5);
  step(host, 2);
  const hm = [...a.session.mirrors.values()].find((p) => p.profileName === 'Host');
  check('holding: the guests see what the host holds', hm.inventory.main[hm.inventory.selected]?.item.id === 'torch');
  // a swing: the guest attacks the air; the host's copy swings, and everyone sees it (vanilla ClientboundAnimatePacket)
  a.player.pitch = -90;
  step(host, 2);
  a.session.input(true, false, false, false);
  // (the click goes with the guest's tick; the host's next tick swings)
  step(host, 2);
  check('swinging: the host\'s copy of the guest swings', ha.swinging);
  step(host, 1);
  check('swinging: the other guest sees it swing', mirrorOf(b, ha.id).swinging);
  check('swinging: so does the guest itself (the host says so)', a.player.swinging);
  step(host, 10);
  host.player.swing();
  step(host, 2);
  check('swinging: the guests see the host swing', hm.swinging && mirrorOf(b, host.player.id).swinging);
}

// ---------------------------------------------------------------------------
// out of view, and gone
{
  for (let i = 0; i < 12; i++) {
    b.player.moveTo(b.player.x + 9, b.player.y, b.player.z, 0, 0);
    step(host, 1);
  }
  step(host, 20);
  check('out of view: far away, a guest no longer sees the others (vanilla ClientboundRemoveEntitiesPacket)', !b.session.mirrors.has(ha.id) && !b.session.mirrors.has(host.player.id), [...b.session.mirrors.keys()].join());
  check('out of view: nor they it', !a.session.mirrors.has(hb.id));
  check('out of view: the mirrors are gone from its level too', b.level.players().length === 1);
  for (let i = 0; i < 12; i++) {
    b.player.moveTo(b.player.x - 9, b.player.y, b.player.z, 0, 0);
    step(host, 1);
  }
  step(host, 20);
  check('back in view: they see each other again', b.session.mirrors.has(ha.id) && a.session.mirrors.has(hb.id));
  b.session.leave();
  step(host, 2);
  check('gone: a guest that left is gone for the others', !a.session.mirrors.has(hb.id) && a.level.players().length === 2);
  assertMirrorEquals(host, a, 'at the end');
}

await exitWithStatus(close);
