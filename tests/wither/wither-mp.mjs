// Multiplayer checks for the wither (node tests/wither/wither-mp.mjs; the wither, milestone 1), over the multiplayer
// harness (tests/multiplayer/lib.mjs): a guest finishes a wither with its own skull (the host makes it, and the guest
// gets Withering Heights); the guest sees it charge up (its charge counting down, pale and growing, its bar filling)
// and can't hurt it then; hears its roar when it bursts out; sees its skulls fly at a cow (black ones, its heads turned
// to their targets) and the cow withered; hurts it once it's out (its bar going down), its blocks broken round it a
// second later; sees its armour come at half health; sees the rose where the cow fell, and is withered standing in
// one; sees the nether star it drops. The guest's world matches the host's throughout.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, assertMirrorEquals, check, exitWithStatus } from '../multiplayer/lib.mjs';

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/entity/wither.ts', '/src/game/bossBars.ts', '/src/game/witherSpawn.ts', '/src/game/witherRose.ts', '/src/game/blockBehavior.ts']);

const host = flatHost(m, 4, { guestGameMode: 'creative' });
const lvl = host.level;
lvl.doDaylightCycle = false;
lvl.dayTime = 6000;
lvl.difficulty = 'normal';
const g = makeGuest(host, 'Alex', { viewDistance: 4 });
step(host, 30);
const hg = hostCopy(host, g);
check('(the guest is in, in creative)', !!hg && !!g.world && hg.gameMode === 'creative');
const triggers = [];
lvl.onPlayerTrigger = (p, type, payload) => triggers.push({ p, type, payload });

/** the guest hovering at (x, y, z), looking (straight down unless told) */
function hover(x, y, z, yaw = 0, pitch = 90) {
  const p = g.player;
  p.flying = true;
  p.onGround = false;
  p.dx = p.dy = p.dz = 0;
  p.moveTo(x, y, z, yaw, pitch);
  step(host, 2);
}
/** the guest hovering at (x, y, z) by way of moves of at most 8 blocks (the host puts back a guest that moves 10 in a tick) */
function glide(x, y, z, yaw = 0, pitch = 90) {
  for (;;) {
    const p = g.player, d = Math.hypot(x - p.x, y - p.y, z - p.z);
    if (d <= 8) return hover(x, y, z, yaw, pitch);
    hover(p.x + ((x - p.x) * 8) / d, p.y + ((y - p.y) * 8) / d, p.z + ((z - p.z) * 8) / d, yaw, pitch);
  }
}
/** what the guest holds in its first hotbar slot (creative: its own say) */
function hold(id) {
  const inv = g.player.inventory;
  inv.main[0] = id ? new m.ItemStack(m.getItem(id), 64) : null;
  inv.selected = 0;
  inv.version++;
  step(host, 2);
}
/** a click of `button` ('attack' or 'use'), with `e`'s copy under the crosshair if given */
function click(button, e = null) {
  g.session.input(button === 'attack', false, button === 'use', false, e ? copyOf(g, e) : null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 3);
}
const heard = (name) => g.level.sounds.filter((s) => s.name === name);
/** the boss bars the guest's own screen shows (gui/hud.ts): the wither's is the host's to send it (game/bossBars.ts), once */
const shown = () => m.bossBarsShownTo(g.level, g.player, 4);
const withers = () => lvl.entities.filter((e) => e instanceof m.WitherBoss && !e.removed);

// ---------------------------------------------------------------------------
// a guest builds it
let w = null;
{
  lvl.setBlock(0, 64, 0, m.S('soul_sand'));
  for (const dx of [-1, 0, 1]) lvl.setBlock(dx, 65, 0, m.S('soul_soil'));
  const skull = m.getBlock('wither_skeleton_skull').defaultState;
  lvl.setBlock(-1, 66, 0, skull);
  lvl.setBlock(0, 66, 0, skull);
  step(host, 2);
  check('the T and two skulls go across to the guest', g.world.getState(0, 66, 0) === skull && g.world.getState(1, 65, 0) === m.S('soul_soil'));
  hover(1.5, 67.2, 0.5);
  hold('wither_skeleton_skull');
  click('use');
  w = withers()[0] ?? null;
  check('the guest\'s skull on the T: the host makes the wither, the blocks gone', !!w && w.invulnerableTicks > 200 && m.BLOCKS[m.STATE_BLOCK[lvl.getState(0, 64, 0)]].name === 'air' && m.BLOCKS[m.STATE_BLOCK[lvl.getState(1, 66, 0)]].name === 'air', w ? `${w.invulnerableTicks}` : `none: ${m.BLOCKS[m.STATE_BLOCK[lvl.getState(1, 66, 0)]].name}`);
  check('...Withering Heights for the guest (and the host, near it too)', triggers.some((t) => t.p === hg && t.type === 'summoned_entity' && t.payload?.summoned === 'wither') && triggers.some((t) => t.p === host.player && t.type === 'summoned_entity'));
  check('...gone from the guest\'s world too', g.world.getState(0, 64, 0) === 0 && g.world.getState(1, 66, 0) === 0);
}

// ---------------------------------------------------------------------------
// the charge, seen from the guest
{
  hover(6.5, 66, 6.5, 135, 20);
  step(host, 4);
  const c = copyOf(g, w);
  check('the guest has a copy of the wither, charging as the host\'s is', c instanceof m.WitherBoss && Math.abs(c.invulnerableTicks - w.invulnerableTicks) <= 1, c ? `${c.invulnerableTicks} vs ${w.invulnerableTicks}` : 'none');
  step(host, 20);
  check('...its charge counting down with the host\'s', Math.abs(c.invulnerableTicks - w.invulnerableTicks) <= 1 && c.invulnerableTicks < 200, `${c.invulnerableTicks} vs ${w.invulnerableTicks}`);
  const bars = shown();
  check('...its bar on the guest: purple, darkening, filling as the host\'s', bars.length === 1 && bars[0].color === 'purple' && bars[0].darkenScreen && Math.abs(bars[0].progress - w.barProgress) < 0.02 && bars[0].progress > 0.05, bars[0] ? `${bars[0].progress} vs ${w.barProgress}` : 'none');
  const before = w.health;
  click('attack', w);
  check('...the guest\'s blow does nothing while it charges', w.health >= before, `${before} -> ${w.health}`);
  check('...its health climbing on the guest as it heals', c.health === w.health && c.health > 100, `${c.health} vs ${w.health}`);
  g.level.sounds.length = 0;
  for (let i = 0; i < 260 && w.invulnerableTicks > 0; i++) step(host, 1);
  step(host, 3);
  check('...done: the guest\'s copy done too, its bar now its health', c.invulnerableTicks === 0 && Math.abs(shown()[0]?.progress - w.health / 300) < 0.02);
  check('...and the guest hears its roar (heard by everyone, from close by)', heard('entity.wither.spawn').length === 1 && Math.hypot(heard('entity.wither.spawn')[0].x - g.player.x, heard('entity.wither.spawn')[0].y - (g.player.y + g.player.eyeHeight), heard('entity.wither.spawn')[0].z - g.player.z) < 3);
  check('...and the blast', heard('entity.generic.explode').length >= 1);
  assertMirrorEquals(host, g, 'after the blast');
}

// ---------------------------------------------------------------------------
// its skulls, its heads, the withered cow
let cow = null;
{
  cow = m.createMob('cow', lvl);
  cow.moveTo(w.x + 8, 64, w.z, 0, 0);
  cow.finalizeSpawn('command');
  cow.persistenceRequired = true;
  cow.maxHealth = cow.health = 60;
  cow.serverAiStep = () => {};
  lvl.addEntity(cow);
  let skullCopies = 0, sawDangerous = false;
  for (let i = 0; i < 80; i++) {
    step(host, 1);
    for (const v of g.session.entities.values()) if (v.e?.type === 'wither_skull') { skullCopies++; if (v.e.dangerous) sawDangerous = true; }
  }
  check('a cow by it: the guest sees its skulls fly (black ones)', skullCopies > 0 && !sawDangerous, `${skullCopies}`);
  const c = copyOf(g, w), cc = copyOf(g, cow);
  check('...its targets go across (the middle head\'s the cow)', c.targetA === cc, `${c.targetA?.type}`);
  check('...and the guest\'s copy turns its side heads to theirs', (c.targetB === cc || c.targetC === cc) && (Math.abs(c.yRotHeads[0] - c.bodyYaw) > 1 || Math.abs(c.yRotHeads[1] - c.bodyYaw) > 1 || c.xRotHeads[0] !== 0 || c.xRotHeads[1] !== 0));
  check('...the cow withered (its effect seen on the guest too)', cow.hasEffect('wither') && cc.hasEffect('wither'));
  check('...the guest hears the skulls launched', heard('entity.wither.shoot').length > 0);
}

// ---------------------------------------------------------------------------
// fighting it; its blocks; its armour
{
  const c = copyOf(g, w);
  w.health = 200;
  w.invulnerableTime = 0;
  step(host, 2);
  // (held where it is, so the blocks round it are where the test puts them)
  w.move = () => {};
  w.dx = w.dy = w.dz = 0;
  const x0 = Math.floor(w.x), y0 = Math.floor(w.y), z0 = Math.floor(w.z);
  glide(w.x + 2.5, w.y + 1, w.z + 0.5, 90, 0);
  lvl.setBlock(x0 + 1, y0 + 1, z0, m.S('stone'));
  step(host, 2);
  check('(stone beside it, for the guest too)', g.world.getState(x0 + 1, y0 + 1, z0) === m.S('stone'));
  click('attack', w);
  check('the guest\'s blow lands once it\'s out (the host\'s wither hurt, the bar down on the guest)', w.health < 200 && Math.abs(shown()[0].progress - w.health / 300) < 0.02, `${w.health}`);
  step(host, 22);
  check('...a second later the blocks round it broken, for the guest too', lvl.getState(x0 + 1, y0 + 1, z0) === 0 && g.world.getState(x0 + 1, y0 + 1, z0) === 0);
  w.health = 140;
  step(host, 2);
  check('...at half health the guest\'s copy is armoured (its swirl drawn from it)', c.isPowered() && c.health === w.health);
}

// ---------------------------------------------------------------------------
// the rose where the cow fell; a guest withered in one; the nether star
{
  cow.health = 1;
  cow.hurt(10, 'witherSkull', w, null);
  const rx = Math.floor(cow.x), ry = Math.floor(cow.y), rz = Math.floor(cow.z);
  step(host, 4);
  const rose = m.getBlock('wither_rose').defaultState;
  const placed = lvl.getState(rx, ry, rz) === rose;
  check('the cow it killed: a wither rose where it fell, for the guest too (or the item, on the stone floor)', (placed && g.world.getState(rx, ry, rz) === rose) || [...g.session.entities.values()].some((v) => v.e?.type === 'item' && v.e.stack?.item.id === 'wither_rose'));
  lvl.setBlock(-10, 63, -10, m.S('grass_block'));
  lvl.setBlock(-10, 64, -10, rose);
  step(host, 2);
  glide(-9.5, 64.2, -9.5, 0, 0);
  g.player.flying = false;
  step(host, 6);
  check('a guest standing in a wither rose: withered on the host, and shown so on the guest', hg.hasEffect('wither') && g.player.hasEffect('wither'), `${hg.hasEffect('wither')} ${g.player.hasEffect('wither')}`);
  glide(w.x + 3, w.y + 1, w.z, 90, 0);
  w.invulnerableTime = 0;
  w.hurt(1000, 'player', hg, hg);
  step(host, 25);
  const star = [...g.session.entities.values()].find((v) => v.e?.type === 'item' && v.e.stack?.item.id === 'nether_star');
  check('killed: the guest sees the nether star it drops, and the wither gone', !!star && !copyOf(g, w));
  check('...and no bar for it on the guest', shown().length === 0);
  assertMirrorEquals(host, g, 'at the end');
}

await exitWithStatus(close);
