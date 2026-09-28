// Multiplayer checks for the armadillo (node tests/remaining-mobs/armadillo-mp.mjs; remaining mobs, milestone 5), over
// the multiplayer harness (tests/multiplayer/lib.mjs): a guest sees an armadillo as the host has it (a baby's size),
// sees it roll up when a zombie comes by (its state, drawn as the ball from it, the roll and the landing heard), sees
// and hears it peek out, and sees it unroll when the zombie's gone; a guest's brush gets a scute off it (the brush worn
// on the host and for the guest); a guest's spider eye puts it in love. A guest's own wolf: wolf armour from the guest's
// hand goes on it (the guest's copy wearing it, dyed as it was), a blow wears it (the copy's too, its cracks and chips
// seen, its knock heard), a scute mends it while the wolf sits (told to by the guest), and shears take it off (dropped,
// the shears worn); someone else's wolf takes none of it. The mirror matches the host's throughout.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, assertMirrorEquals, check, exitWithStatus } from '../multiplayer/lib.mjs';

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/entity/armadillo.ts', '/src/entity/wolf.ts', '/src/entity/wolfArmor.ts', '/src/entity/animals.ts']);

const host = flatHost(m, 4, { guestGameMode: 'survival' });
const lvl = host.level;
lvl.doDaylightCycle = false;
lvl.dayTime = 6000;
const g = makeGuest(host, 'Alex', { viewDistance: 3 });
step(host, 30);
const hg = hostCopy(host, g);
check('(the guest is in, in survival)', !!hg && !!g.world && hg.gameMode === 'survival');

/** a mob of `type` at (x, 64, z); held still unless `brain` */
function mob(type, x, z, { baby = false, brain = false } = {}) {
  const e = m.createMob(type, lvl);
  e.moveTo(x, 64, z, 0, 0);
  e.finalizeSpawn('command');
  e.persistenceRequired = true;
  if (baby) e.setAge(-24000);
  if (!brain) e.serverAiStep = () => {};
  lvl.addEntity(e);
  return e;
}
/** what the guest holds in its first hotbar slot (the host's copy given it, as /give would) */
function give(stack) {
  hg.inventory.main[0] = stack;
  hg.inventory.selected = 0;
  hg.inventory.version++;
  step(host, 3);
}
/** a click of `button` ('attack' or 'use') with `e`'s copy under the crosshair */
function click(button, e) {
  g.session.input(button === 'attack', false, button === 'use', false, e ? copyOf(g, e) : null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 3);
}
/** the guest standing at (x, 64, z) looking at (tx, ty, tz) */
function standLooking(x, z, tx, ty, tz) {
  const p = g.player;
  p.flying = false;
  p.dx = p.dy = p.dz = 0;
  const dx = tx - x, dy = ty - (64 + p.eyeHeight), dz = tz - z;
  const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  p.moveTo(x, 64, z, yaw, pitch);
  step(host, 4);
}
const heard = (name) => g.level.sounds.filter((s) => s.name === name);
const stepUntil = (cond, max) => {
  for (let i = 0; i <= max; i++) {
    if (cond()) return i;
    step(host, 1);
  }
  return max + 1;
};

// ---------------------------------------------------------------------------
// seeing an armadillo roll up, peek and unroll
{
  const a = mob('armadillo', 4.5, 4.5, { brain: true });
  const kid = mob('armadillo', -4.5, 4.5, { baby: true });
  step(host, 4);
  const c = copyOf(g, a), ck = copyOf(g, kid);
  check('a guest has a copy of the host\'s armadillo, out of its shell', c instanceof m.Armadillo && c.state === 'idle' && !c.shouldHideInShell());
  check('...a baby\'s 0.6 of the size', ck?.isBaby() && Math.abs(ck.width - 0.42) < 1e-6 && Math.abs(ck.height - 0.39) < 1e-6);
  g.level.sounds.length = 0;
  const z = mob('zombie', 7.5, 4.5);
  z.isSunBurnTick = () => false;
  const t1 = stepUntil(() => c.state !== 'idle', 60);
  check('a zombie by it on the host: rolling up for the guest too (its roll heard), the rolling up played', a.state !== 'idle' && c.state === 'rolling' && c.anim.rollUp.start >= 0 && heard('entity.armadillo.roll').length === 1, `${t1} ${c.state}`);
  stepUntil(() => c.state === 'scared', 20);
  step(host, 1);
  check('...then a ball: rolled up (the peek animation put to its end, the ball at rest), its landing heard', c.state === 'scared' && c.shouldHideInShell() && c.anim.peek.start >= 0 && c.anim.peek.ff === 50 && heard('entity.armadillo.land').length === 1);
  // (the peek, when the host's brain has it: it's random, 7.5 to 22.5 s; here, at once)
  const before = c.anim.peek.start;
  g.level.sounds.length = 0;
  a.peek();
  step(host, 3);
  check('...peeking out on the host: the guest sees it peek (the animation played again, from the start) and hears it', c.peeks === a.peeks && c.anim.peek.start > before && c.anim.peek.ff === 0 && heard('entity.armadillo.peek').length === 1);
  z.remove();
  g.level.sounds.length = 0;
  const tu = stepUntil(() => c.state === 'unrolling', 120);
  check('...the zombie gone: unrolling for the guest (the unrolling played, its sound heard)', c.state === 'unrolling' && c.anim.rollOut.start >= 0 && heard('entity.armadillo.unroll_start').length === 1, `${tu}`);
  const ti = stepUntil(() => c.state === 'idle', 60);
  check('...and out (its sound heard), no ball any more', c.state === 'idle' && !c.shouldHideInShell() && heard('entity.armadillo.unroll_finish').length === 1, `${ti}`);
  assertMirrorEquals(host, g, 'with armadillos about');
  // a guest's brush
  a.serverAiStep = () => {};
  a.moveTo(4.5, 64, 4.5, 0, 0);
  step(host, 3);
  standLooking(2.5, 4.5, a.x, a.y + 0.3, a.z);
  give(m.ItemStack.of('brush'));
  const was = new Set(lvl.entities);
  g.level.sounds.length = 0;
  click('use', a);
  step(host, 3);
  const scute = lvl.entities.filter((e) => !was.has(e) && e.type === 'item' && e.stack.item.id === 'armadillo_scute');
  check('a guest\'s brush on it: a scute off it on the host, the brush worn 16 (for the guest too), its sound heard, the scute seen', scute.length === 1 && hg.inventory.main[0]?.damage === 16 && g.player.inventory.main[0]?.damage === 16 && heard('entity.armadillo.brush').length === 1 && !!copyOf(g, scute[0]));
  scute[0]?.remove();
  // a guest's spider eye
  give(m.ItemStack.of('spider_eye', 3));
  g.level.sounds.length = 0;
  click('use', a);
  step(host, 3);
  check('a guest\'s spider eye: in love on the host (one eaten), its eating heard', a.isInLove() && hg.inventory.main[0]?.count === 2 && heard('entity.armadillo.eat').length === 1);
  a.remove();
  kid.remove();
  step(host, 3);
  assertMirrorEquals(host, g, 'after the brush');
}

// ---------------------------------------------------------------------------
// a guest's wolf and its armour
{
  const w = mob('wolf', 2.5, -4.5);
  w.tameBy(hg);
  const theirs = mob('wolf', -2.5, -4.5);
  theirs.tameBy(host.player);
  step(host, 4);
  const cw = copyOf(g, w);
  standLooking(-0.5, -4.5, theirs.x, theirs.y + 0.5, theirs.z);
  give(m.ItemStack.of('wolf_armor'));
  click('use', theirs);
  check('a guest\'s wolf armour on the host\'s wolf: not taken', !theirs.bodyArmor && hg.inventory.main[0]?.item.id === 'wolf_armor');
  standLooking(0.5, -4.5, w.x, w.y + 0.5, w.z);
  const dyed = m.ItemStack.of('wolf_armor');
  dyed.tag = { dyedColor: 0x22aa44 };
  give(dyed);
  g.level.sounds.length = 0;
  click('use', w);
  step(host, 3);
  check('...on the guest\'s own: on it on the host, gone from the guest\'s hand', w.bodyArmor?.item.id === 'wolf_armor' && !hg.inventory.main[0] && !g.player.inventory.main[0]);
  check('...the guest\'s copy wearing it, dyed as it was (its equip sound heard)', cw.bodyArmor?.item.id === 'wolf_armor' && cw.bodyArmor.tag?.dyedColor === 0x22aa44 && heard('item.armor.equip_wolf').length === 1);
  g.level.sounds.length = 0;
  g.level.particleCalls.length = 0;
  w.hurt(5, 'mob', null, null);
  step(host, 3);
  const chips = g.level.particleCalls.filter((x) => x.method === 'spawn' && x.args[0] === 'item_armadillo_scute').length;
  check('a blow on it on the host: the guest\'s copy worn as much (cracked a little), the knock and the crack heard, the chips seen', cw.bodyArmor?.damage === 5 && m.wolfArmorCrackiness(cw.bodyArmor) === 'low' && heard('item.wolf_armor.damage').length === 1 && heard('item.wolf_armor.crack').length === 1 && chips === 20, `${cw.bodyArmor?.damage} ${chips}`);
  // told to sit, then a scute
  give(null);
  click('use', w);
  step(host, 3);
  check('the guest\'s empty hand: the wolf sits', w.orderedToSit);
  w.inSittingPose = true;
  give(m.ItemStack.of('armadillo_scute', 2));
  g.level.sounds.length = 0;
  click('use', w);
  step(host, 3);
  check('...a scute to it sitting: mended on the host (one spent), the guest\'s copy as good as new, its sound heard', w.bodyArmor?.damage === 0 && cw.bodyArmor?.damage === 0 && hg.inventory.main[0]?.count === 1 && heard('item.wolf_armor.repair').length === 1);
  // shears
  give(m.ItemStack.of('shears'));
  const was = new Set(lvl.entities);
  g.level.sounds.length = 0;
  click('use', w);
  step(host, 3);
  const off = lvl.entities.filter((e) => !was.has(e) && e.type === 'item' && e.stack.item.id === 'wolf_armor');
  check('...shears: off it (dropped, still dyed), the shears worn, the guest\'s copy bare, its sound heard', !w.bodyArmor && off.length === 1 && off[0].stack.tag?.dyedColor === 0x22aa44 && hg.inventory.main[0]?.damage === 1 && cw.bodyArmor === null && heard('item.armor.unequip_wolf').length === 1);
  for (const e of off) e.remove();
  step(host, 3);
  assertMirrorEquals(host, g, 'after the wolf armour');
  w.remove();
  theirs.remove();
  step(host, 3);
}

await exitWithStatus(close);
